/**
 * Dousic — API Client
 *
 * Features:
 *   - Automatic auth token attachment
 *   - Transparent refresh-token rotation on 401
 *   - 30-second request timeout (TV networks can be slow)
 *   - Exponential backoff retry on transient failures
 *   - Typed resource methods
 *
 * Token storage:
 *   - Access token: in-memory only (short-lived, 15 min)
 *   - Refresh token: localStorage (encrypted key-wrapping would be ideal
 *     but webOS doesn't expose a keystore API)
 *
 * Security posture for the audit:
 *   - Short-lived access tokens reduce theft window
 *   - Refresh tokens can be revoked server-side on logout
 *   - All requests over HTTPS, CSP enforces origin
 */
/* eslint-env browser */

import {captureException} from '../platform/telemetry';

const BASE_URL = process.env.REACT_APP_API_URL || 'https://api.dousic.media';
const API_PATH = '/api/webos/v1';
const TIMEOUT_MS = 30000;
const MAX_RETRIES = 2;

// Exposed for on-screen diagnostics (e.g. the login panel surfaces which
// host/status failed so the TV can self-report without DevTools attached).
export const API_BASE_URL = BASE_URL;

const STORAGE_KEYS = {
	refreshToken: 'dousic_refresh_token',
	deviceId: 'dousic_device_id'
};

// ---------------------------------------------------------------------------
// Error classes (declared first so they're available throughout the module)
// ---------------------------------------------------------------------------

class AuthError extends Error {
	constructor (message, code) {
		super(message);
		this.name = 'AuthError';
		this.code = code;
	}
}

class ApiError extends Error {
	constructor (message, httpStatus, code, details) {
		super(message);
		this.name = 'ApiError';
		this.status = httpStatus;
		this.code = code;
		this.details = details;
	}
}

// ---------------------------------------------------------------------------
// Token store (in-memory access, localStorage refresh)
// ---------------------------------------------------------------------------

let _accessToken = null;
let _refreshPromise = null;
const _listeners = new Set();

export const getAccessToken = () => _accessToken;

export const setTokens = ({accessToken, refreshToken}) => {
	_accessToken = accessToken || null;
	if (typeof refreshToken !== 'undefined') {
		if (refreshToken) {
			localStorage.setItem(STORAGE_KEYS.refreshToken, refreshToken);
		} else {
			localStorage.removeItem(STORAGE_KEYS.refreshToken);
		}
	}
	_listeners.forEach((fn) => fn(!!_accessToken));
};

export const clearTokens = () => {
	_accessToken = null;
	localStorage.removeItem(STORAGE_KEYS.refreshToken);
	_listeners.forEach((fn) => fn(false));
};

export const onAuthChange = (fn) => {
	_listeners.add(fn);
	return () => _listeners.delete(fn);
};

export const getOrCreateDeviceId = () => {
	let id = localStorage.getItem(STORAGE_KEYS.deviceId);
	if (!id) {
		id = 'dev_' + Date.now().toString(36) + '_' +
			Math.random().toString(36).slice(2, 14);
		localStorage.setItem(STORAGE_KEYS.deviceId, id);
	}
	return id;
};

// ---------------------------------------------------------------------------
// Fetch wrapper
// ---------------------------------------------------------------------------

const rawFetch = async (method, path, body, options = {}) => {
	const {skipAuth = false, timeout = TIMEOUT_MS} = options;
	const url = BASE_URL + API_PATH + path;

	const headers = {
		'Content-Type': 'application/json',
		'Accept': 'application/json',
		'X-Dousic-Platform': 'webos',
		'X-Dousic-Device-Id': getOrCreateDeviceId()
	};

	if (!skipAuth && _accessToken) {
		headers.Authorization = `Bearer ${_accessToken}`;
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);

	try {
		const fetchInit = {
			method,
			headers,
			signal: controller.signal
		};
		if (body) fetchInit.body = JSON.stringify(body);

		const response = await fetch(url, fetchInit);
		clearTimeout(timeoutId);

		const contentType = response.headers.get('content-type') || '';
		const data = contentType.includes('application/json') ?
			await response.json().catch(() => null) :
			await response.text().catch(() => null);

		if (response.ok) {
			return {ok: true, status: response.status, data};
		}

		return {
			ok: false,
			status: response.status,
			data,
			error: data?.error || data?.message || `HTTP ${response.status}`,
			code: data?.code
		};
	} catch (err) {
		clearTimeout(timeoutId);
		if (err.name === 'AbortError') {
			return {ok: false, status: 0, error: 'Request timeout', code: 'TIMEOUT'};
		}
		return {ok: false, status: 0, error: err.message || 'Network error', code: 'NETWORK'};
	}
};

// ---------------------------------------------------------------------------
// Refresh token flow
// ---------------------------------------------------------------------------

const refreshAccessToken = async () => {
	// Deduplicate concurrent refresh attempts
	if (_refreshPromise) return _refreshPromise;

	const refreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken);
	if (!refreshToken) {
		throw new AuthError('No refresh token available', 'NO_REFRESH_TOKEN');
	}

	_refreshPromise = (async () => {
		try {
			const res = await rawFetch('POST', '/auth/refresh', {
				refresh_token: refreshToken,
				device_id: getOrCreateDeviceId()
			}, {skipAuth: true, skipRefresh: true});

			if (!res.ok) {
				clearTokens();
				throw new AuthError('Refresh failed', 'REFRESH_FAILED');
			}

			setTokens({
				accessToken: res.data.access_token,
				refreshToken: res.data.refresh_token
			});
			return res.data.access_token;
		} finally {
			_refreshPromise = null;
		}
	})();

	return _refreshPromise;
};

// Exposed so authStore can proactively refresh on cold boot, avoiding an
// initial /auth/me request that would otherwise 401 before the retry-with-
// refresh path kicks in. One fewer round trip per app launch.
export {refreshAccessToken};

export const request = async (method, path, body, options = {}) => {
	let res = await rawFetch(method, path, body, options);

	// Retry once on transient failure
	if (!res.ok && res.status === 0 && !options.skipRetry) {
		await new Promise((r) => setTimeout(r, 500));
		res = await rawFetch(method, path, body, {...options, skipRetry: true});
	}

	// Auto-refresh on 401
	if (res.status === 401 && !options.skipRefresh && !options.skipAuth) {
		try {
			await refreshAccessToken();
			res = await rawFetch(method, path, body, {...options, skipRefresh: true});
		} catch (e) {
			clearTokens();
			throw new AuthError('Session expired', 'SESSION_EXPIRED');
		}
	}

	if (!res.ok) {
		const err = new ApiError(
			res.error || `Request failed: ${method} ${path}`,
			res.status,
			res.code,
			res.data
		);
		// Log to telemetry, but don't spam — only real errors, not 404s
		if (res.status >= 500) captureException(err, {method, path, status: res.status});
		throw err;
	}

	return res.data;
};

// ---------------------------------------------------------------------------
// Resource methods
// ---------------------------------------------------------------------------

export const auth = {
	async login (email, password) {
		const data = await request('POST', '/auth/login', {
			email,
			password,
			device_id: getOrCreateDeviceId()
		}, {skipAuth: true});
		setTokens({
			accessToken: data.access_token,
			refreshToken: data.refresh_token
		});
		return data.user;
	},

	async loginWithCode (pairingCode) {
		// TV-friendly login: user enters code on phone/web, we poll
		const data = await request('POST', '/auth/pair', {
			code: pairingCode,
			device_id: getOrCreateDeviceId()
		}, {skipAuth: true});
		if (data.access_token) {
			setTokens({
				accessToken: data.access_token,
				refreshToken: data.refresh_token
			});
		}
		return data;
	},

	async requestPairingCode () {
		return request('POST', '/auth/pair/request', {
			device_id: getOrCreateDeviceId(),
			device_info: {platform: 'webos', label: 'LG TV'}
		}, {skipAuth: true});
	},

	async me () {
		return request('GET', '/auth/me');
	},

	async logout () {
		try {
			await request('POST', '/auth/logout', {});
		} catch (_) {
			// Best-effort; clear tokens regardless
		}
		clearTokens();
	},

	async continueAsGuest () {
		const data = await request('POST', '/auth/guest', {
			device_id: getOrCreateDeviceId()
		}, {skipAuth: true});
		setTokens({
			accessToken: data.access_token,
			refreshToken: data.refresh_token
		});
		return data.user;
	}
};

export const content = {
	async getFeatured () {
		return request('GET', '/content/featured');
	},

	async getHome () {
		return request('GET', '/content/home');
	},

	async getBrowse (params = {}) {
		const qs = new URLSearchParams(params).toString();
		return request('GET', `/content/browse${qs ? '?' + qs : ''}`);
	},

	async getLive (params = {}) {
		const qs = new URLSearchParams(params).toString();
		return request('GET', `/content/live${qs ? '?' + qs : ''}`);
	},

	async getById (id) {
		return request('GET', `/content/${encodeURIComponent(id)}`);
	},

	async getStreamUrl (id) {
		return request('GET', `/content/${encodeURIComponent(id)}/stream`);
	},

	async search (query, params = {}) {
		const qs = new URLSearchParams({q: query, ...params}).toString();
		return request('GET', `/content/search?${qs}`);
	},

	async getCreators (params = {}) {
		const qs = new URLSearchParams(params).toString();
		return request('GET', `/creators${qs ? '?' + qs : ''}`);
	},

	async getCreator (handle) {
		return request('GET', `/creators/${encodeURIComponent(handle)}`);
	}
};

export const user = {
	async getWatchlist () {
		return request('GET', '/user/watchlist');
	},

	async addToWatchlist (contentId) {
		return request('POST', '/user/watchlist', {content_id: contentId});
	},

	async removeFromWatchlist (contentId) {
		return request('DELETE', `/user/watchlist/${encodeURIComponent(contentId)}`);
	},

	async getHistory () {
		return request('GET', '/user/history');
	},

	async reportProgress (contentId, positionSeconds, durationSeconds) {
		return request('POST', '/user/progress', {
			content_id: contentId,
			position: positionSeconds,
			duration: durationSeconds
		});
	}
};

export default {
	auth,
	content,
	user,
	request,
	onAuthChange,
	getAccessToken,
	setTokens,
	clearTokens,
	ApiError,
	AuthError
};
