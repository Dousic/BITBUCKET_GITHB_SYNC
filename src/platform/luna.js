/**
 * Dousic — webOS Luna Service Layer
 * ==================================
 *
 * Production-grade wrappers around LG webOS Luna Service APIs.
 *
 * Design principles:
 *   - Every call returns a Promise that resolves even on failure
 *     (returns {ok: false, error, code} rather than rejecting)
 *   - All calls have 5-second timeout by default (Luna can hang on
 *     older TVs; unhandled promises freeze React renders)
 *   - Subscriptions return unsubscribe functions
 *   - Module degrades gracefully when Luna is unavailable
 *     (dev browser, non-webOS platforms)
 *
 * References:
 *   https://webostv.developer.lge.com/develop/references/luna-service-api
 */
/* eslint-env browser */

import LS2Request from '@enact/webos/LS2Request';

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

export const isWebOS = () => {
	if (typeof window === 'undefined') return false;
	return 'PalmSystem' in window ||
		('webOS' in window && typeof window.webOS?.service?.request === 'function');
};

export const isWebOSTV = () => {
	if (!isWebOS()) return false;
	return typeof window.webOSSystem?.deviceInfo === 'string' ||
		typeof window.PalmSystem?.deviceInfo === 'string';
};

// ---------------------------------------------------------------------------
// Generic Luna request wrapper with timeout and error normalization
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT = 5000;

/**
 * Invoke a Luna service. Returns Promise<{ok, data?, error?, code?}>.
 * Never rejects — errors are resolved as {ok: false, error, code}.
 */
export const lunaCall = (service, method, parameters = {}, options = {}) => {
	const {timeout = DEFAULT_TIMEOUT, subscribe = false} = options;

	if (!isWebOS()) {
		return Promise.resolve({
			ok: false,
			error: 'Luna not available',
			code: 'NOT_WEBOS'
		});
	}

	return new Promise((resolve) => {
		let settled = false;
		let request;
		let timer;

		const finish = (result) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (!subscribe && request) {
				try {
					request.cancel();
				} catch (_) {}
			}
			resolve(result);
		};

		timer = setTimeout(() => {
			finish({ok: false, error: `Timeout ${timeout}ms`, code: 'TIMEOUT'});
		}, timeout);

		try {
			request = new LS2Request().send({
				service,
				method,
				parameters,
				subscribe,
				onSuccess: (res) => finish({ok: true, data: res}),
				onFailure: (err) => finish({
					ok: false,
					error: err?.errorText || 'Luna error',
					code: err?.errorCode || 'LUNA_ERROR'
				}),
				onComplete: () => { /* noop - terminal state handled above */ }
			});
		} catch (e) {
			finish({ok: false, error: e?.message || 'Exception', code: 'EXCEPTION'});
		}
	});
};

/**
 * Subscribe to a Luna service with continuous updates.
 * Returns an unsubscribe function.
 */
export const lunaSubscribe = (service, method, parameters, onUpdate) => {
	if (!isWebOS()) return () => {};

	let request;
	try {
		request = new LS2Request().send({
			service,
			method,
			parameters: {...parameters, subscribe: true},
			subscribe: true,
			onSuccess: (res) => onUpdate({ok: true, data: res}),
			onFailure: (err) => onUpdate({
				ok: false,
				error: err?.errorText || 'Luna error',
				code: err?.errorCode
			})
		});
	} catch (_) {
		return () => {};
	}

	return () => {
		try {
			request?.cancel?.();
		} catch (_) {}
	};
};

// ---------------------------------------------------------------------------
// Device Info — cached across the app lifetime
// ---------------------------------------------------------------------------

let _deviceCache = null;

const normalizeDevice = (raw) => ({
	modelName: raw.modelName || raw.model || 'unknown',
	modelNumber: raw.modelNumber || null,
	firmwareVersion: raw.firmwareVersion || raw.version || 'unknown',
	sdkVersion: raw.sdkVersion || 'unknown',
	isUHD: raw.UHD === 'true' || raw.UHD === true,
	boardType: raw.boardType || null,
	available: true
});

export const getDeviceInfo = async () => {
	if (_deviceCache) return _deviceCache;

	// Fast path: PalmSystem.deviceInfo is a JSON string
	if (window.PalmSystem?.deviceInfo) {
		try {
			_deviceCache = normalizeDevice(JSON.parse(window.PalmSystem.deviceInfo));
			return _deviceCache;
		} catch (_) {}
	}

	// Fallback: explicit Luna call
	const result = await lunaCall(
		'luna://com.webos.service.systemproperty',
		'getSystemInfo',
		{keys: ['modelName', 'firmwareVersion', 'sdkVersion', 'UHD', 'boardType', 'modelNumber']}
	);

	if (result.ok) {
		_deviceCache = normalizeDevice(result.data);
		return _deviceCache;
	}

	_deviceCache = {
		modelName: 'unknown',
		firmwareVersion: 'unknown',
		sdkVersion: 'unknown',
		isUHD: false,
		available: false
	};
	return _deviceCache;
};

export const getWebOSMajorVersion = async () => {
	const info = await getDeviceInfo();
	const match = (info.sdkVersion || '').match(/^(\d+)/);
	return match ? parseInt(match[1], 10) : 0;
};

// ---------------------------------------------------------------------------
// Locale / Country
// ---------------------------------------------------------------------------

export const getSystemLocale = async () => {
	if (window.PalmSystem?.locale) return window.PalmSystem.locale;

	const result = await lunaCall(
		'luna://com.webos.service.settings',
		'getSystemSettings',
		{category: 'option', keys: ['localeInfo']}
	);

	if (result.ok) {
		const locale = result.data?.settings?.localeInfo?.locales?.UI;
		if (locale) return locale;
	}
	return navigator.language || 'en-US';
};

export const getCountry = async () => {
	const result = await lunaCall(
		'luna://com.webos.service.settings',
		'getSystemSettings',
		{category: 'option', keys: ['country', 'smartServiceCountryCode3']}
	);
	if (result.ok) {
		return result.data?.settings?.country ||
			result.data?.settings?.smartServiceCountryCode3 ||
			'unknown';
	}
	return 'unknown';
};

// ---------------------------------------------------------------------------
// Captions
// ---------------------------------------------------------------------------

export const getCaptionsPreference = async () => {
	const result = await lunaCall(
		'luna://com.webos.service.settings',
		'getSystemSettings',
		{category: 'caption', keys: ['captionEnable', 'captionLanguage']}
	);

	if (result.ok) {
		const s = result.data?.settings || {};
		return {
			enabled: s.captionEnable === 'on' || s.captionEnable === true,
			language: s.captionLanguage || null
		};
	}
	return {enabled: false, language: null};
};

export const subscribeToCaptions = (onUpdate) => {
	return lunaSubscribe(
		'luna://com.webos.service.settings',
		'getSystemSettings',
		{category: 'caption', keys: ['captionEnable', 'captionLanguage']},
		(result) => {
			if (result.ok) {
				const s = result.data?.settings || {};
				onUpdate({
					enabled: s.captionEnable === 'on',
					language: s.captionLanguage || null
				});
			}
		}
	);
};

// ---------------------------------------------------------------------------
// Launch params / Relaunch
// ---------------------------------------------------------------------------

export const getLaunchParams = () => {
	if (typeof window === 'undefined') return {};
	const raw = window.PalmSystem?.launchParams;
	if (!raw) return {};
	try {
		return typeof raw === 'string' ? JSON.parse(raw) : raw;
	} catch (_) {
		return {};
	}
};

export const onRelaunch = (callback) => {
	if (typeof window === 'undefined') return () => {};

	const handler = (evt) => {
		let params = {};
		try {
			if (evt.detail) {
				params = typeof evt.detail === 'string' ?
					JSON.parse(evt.detail) :
					evt.detail;
			}
		} catch (_) {}
		callback(params);
	};

	document.addEventListener('webOSRelaunch', handler);
	return () => document.removeEventListener('webOSRelaunch', handler);
};

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

export const onVisibilityChange = (callback) => {
	if (typeof window === 'undefined') return () => {};

	const onChange = () => {
		callback(document.hidden ? 'background' : 'foreground');
	};

	document.addEventListener('visibilitychange', onChange);
	document.addEventListener('webOSLaunch', () => callback('foreground'));
	document.addEventListener('webOSRelaunch', () => callback('foreground'));

	return () => {
		document.removeEventListener('visibilitychange', onChange);
	};
};

// ---------------------------------------------------------------------------
// App close
// ---------------------------------------------------------------------------

export const closeApp = () => {
	try {
		if (window.PalmSystem?.platformBack) {
			window.PalmSystem.platformBack();
		}
		window.close();
	} catch (_) {}
};

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

export const getNetworkStatus = async () => {
	const result = await lunaCall(
		'luna://com.webos.service.connectionmanager',
		'getStatus',
		{}
	);

	if (result.ok) {
		const wired = result.data?.wired?.state === 'connected';
		const wifi = result.data?.wifi?.state === 'connected';
		return {
			connected: wired || wifi,
			wired,
			wifi,
			isInternetConnectionAvailable: result.data?.isInternetConnectionAvailable === true
		};
	}

	return {
		connected: typeof navigator !== 'undefined' ? !!navigator.onLine : true,
		wired: false,
		wifi: false
	};
};

export const subscribeToNetwork = (callback) => {
	return lunaSubscribe(
		'luna://com.webos.service.connectionmanager',
		'getStatus',
		{},
		(result) => {
			if (result.ok) {
				const wired = result.data?.wired?.state === 'connected';
				const wifi = result.data?.wifi?.state === 'connected';
				callback({
					connected: wired || wifi,
					wired,
					wifi,
					isInternetConnectionAvailable: result.data?.isInternetConnectionAvailable === true
				});
			}
		}
	);
};

// ---------------------------------------------------------------------------
// Audio (read-only subscription; never set volume from app)
// ---------------------------------------------------------------------------

export const subscribeToVolume = (callback) => {
	return lunaSubscribe(
		'luna://com.webos.audio',
		'getVolume',
		{},
		(result) => {
			if (result.ok) {
				callback({
					volume: result.data?.volume ?? 0,
					muted: result.data?.muted === true
				});
			}
		}
	);
};

// ---------------------------------------------------------------------------
// Toast (system-level notification)
// ---------------------------------------------------------------------------

export const showToast = async (message) => {
	if (!isWebOS()) {
		// eslint-disable-next-line no-console
		console.info('[toast]', message);
		return {ok: true};
	}
	const result = await lunaCall(
		'luna://com.webos.notification',
		'createToast',
		{message: String(message).slice(0, 80)}
	);
	return {ok: result.ok};
};

// ---------------------------------------------------------------------------
// Screen saver / wake lock
// Prevent TV from dimming during video playback
// ---------------------------------------------------------------------------

let _screensaverRequest = null;
let _screensaverInterval = null;

export const blockScreensaver = async () => {
	if (!isWebOS() || _screensaverRequest) return;

	_screensaverRequest = new LS2Request().send({
		service: 'luna://com.webos.service.tvpower',
		method: 'power/turnOnScreen',
		parameters: {},
		subscribe: false,
		onSuccess: () => {},
		onFailure: () => {}
	});

	// Repeat every 60 seconds to keep the TV awake during playback
	_screensaverInterval = setInterval(() => {
		lunaCall('luna://com.webos.service.tvpower', 'power/turnOnScreen', {});
	}, 60000);
};

export const allowScreensaver = () => {
	if (_screensaverInterval) {
		clearInterval(_screensaverInterval);
		_screensaverInterval = null;
	}
	if (_screensaverRequest) {
		try {
			_screensaverRequest.cancel();
		} catch (_) {}
		_screensaverRequest = null;
	}
};

// ---------------------------------------------------------------------------
// Default export (convenient single-import interface)
// ---------------------------------------------------------------------------

export default {
	isWebOS,
	isWebOSTV,
	lunaCall,
	lunaSubscribe,
	getDeviceInfo,
	getWebOSMajorVersion,
	getSystemLocale,
	getCountry,
	getCaptionsPreference,
	subscribeToCaptions,
	getLaunchParams,
	onRelaunch,
	onVisibilityChange,
	closeApp,
	getNetworkStatus,
	subscribeToNetwork,
	subscribeToVolume,
	showToast,
	blockScreensaver,
	allowScreensaver
};
