/**
 * Dousic — Telemetry
 *
 * Lightweight error and analytics reporting tagged with webOS device context.
 * Events are buffered and POSTed to the backend's /telemetry/events endpoint
 * via the shared API client (handles refresh, retry, CORS, etc.).
 *
 * This design deliberately avoids pulling in the full @sentry/browser (150KB+)
 * because TV bundle size matters more than on the web.
 */
/* eslint-env browser */

import {getDeviceInfo, getSystemLocale, getCountry, getWebOSMajorVersion} from './luna';
import {APP_VERSION} from '../version';

const MAX_BUFFER = 20;
const FLUSH_INTERVAL = 15000;

let _context = null;
let _buffer = [];
let _flushTimer = null;
let _sessionId = null;
// Lazily resolved so we don't create an import cycle at module init
// (services/api.js also imports from this file).
let _apiRequest = null;
const _getApi = async () => {
	if (_apiRequest) return _apiRequest;
	const mod = await import('../services/api');
	_apiRequest = mod.request;
	return _apiRequest;
};

const generateSessionId = () => {
	return 'sess_' + Date.now().toString(36) + '_' +
		Math.random().toString(36).slice(2, 10);
};

export const flush = async () => {
	if (_buffer.length === 0) return;
	const events = _buffer.splice(0);

	try {
		// Only send in production; log otherwise to aid local debugging.
		if (_context?.environment !== 'production') {
			// eslint-disable-next-line no-console
			console.log('[telemetry]', events);
			return;
		}

		// Shape matches backend /telemetry/events validation:
		// each event needs type, timestamp, optional name/message/stack/level/
		// properties/extra/context. See TelemetryController::ingest().
		const request = await _getApi();
		await request('POST', '/telemetry/events', {events}, {skipAuth: true, skipRetry: true});
	} catch (_) {
		// Silent — don't let telemetry failures break the app
	}
};

const _enqueue = (payload) => {
	_buffer.push(payload);
	if (_buffer.length >= MAX_BUFFER) flush();
};

export const captureException = (error, extra = {}) => {
	if (!error) return;

	const payload = {
		type: 'exception',
		timestamp: new Date().toISOString(),
		message: error.message || String(error),
		stack: error.stack || null,
		name: error.name || 'Error',
		extra,
		context: _context
	};

	_enqueue(payload);
};

export const captureMessage = (message, level = 'info', extra = {}) => {
	_enqueue({
		type: 'message',
		timestamp: new Date().toISOString(),
		level,
		message,
		extra,
		context: _context
	});
};

export const trackEvent = (eventName, properties = {}) => {
	_enqueue({
		type: 'event',
		timestamp: new Date().toISOString(),
		name: eventName,
		properties,
		context: _context
	});
};

export const trackScreenView = (screenName, properties = {}) => {
	trackEvent('screen_view', {screen: screenName, ...properties});
};

export const initTelemetry = async ({userId, release, environment = 'production'} = {}) => {
	_sessionId = generateSessionId();

	const [device, locale, country, webOSVersion] = await Promise.all([
		getDeviceInfo(),
		getSystemLocale(),
		getCountry(),
		getWebOSMajorVersion()
	]);

	_context = {
		userId,
		release: release || APP_VERSION,
		environment,
		sessionId: _sessionId,
		platform: 'webos',
		device: {
			model: device.modelName,
			modelNumber: device.modelNumber,
			firmware: device.firmwareVersion,
			sdkVersion: device.sdkVersion,
			webOSMajorVersion: webOSVersion,
			isUHD: device.isUHD,
			boardType: device.boardType
		},
		locale,
		country,
		userAgent: navigator.userAgent,
		startedAt: new Date().toISOString()
	};

	// Global error + rejection handlers
	if (typeof window !== 'undefined') {
		window.addEventListener('error', (evt) => {
			captureException(evt.error || new Error(evt.message), {
				source: evt.filename,
				line: evt.lineno,
				column: evt.colno
			});
		});
		window.addEventListener('unhandledrejection', (evt) => {
			captureException(evt.reason, {unhandled: true});
		});
	}

	// Periodic flush
	_flushTimer = setInterval(flush, FLUSH_INTERVAL);

	return _context;
};

export const setUser = (userId) => {
	if (_context) _context.userId = userId;
};

export const clearUser = () => {
	if (_context) _context.userId = null;
};

/**
 * Synchronous, fire-and-forget flush using navigator.sendBeacon.
 *
 * Used on app suspension / visibility-hidden — webOS suspends the app when
 * the user presses Home, and fetch() requests in flight are cut off, which
 * loses telemetry events buffered in the last ~15 seconds. sendBeacon is
 * specifically designed for this case: the browser guarantees the request
 * is sent even as the page unloads.
 *
 * Caveats:
 *   - sendBeacon is always POST with a fixed payload; no auth header
 *     attachment, no retries. Matches the backend's optional-auth telemetry
 *     endpoint (jwt.auth:optional + throttle.tier:telemetry).
 *   - sendBeacon fails silently (returns false) if the user-agent queue is
 *     full or the payload exceeds 64KB. The periodic flush() covers that case.
 *   - webOS 4.0+ supports sendBeacon. Older webOS would silently no-op here;
 *     the periodic flush() catches the buffered events on next foreground.
 */
export const flushBeacon = () => {
	if (_buffer.length === 0) return;
	if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return;

	// Only ship in production — dev/staging keeps events in console for debugging
	if (_context?.environment !== 'production') {
		// eslint-disable-next-line no-console
		console.log('[telemetry:beacon]', _buffer);
		_buffer = [];
		return;
	}

	const events = _buffer.splice(0);
	try {
		const apiUrl = process.env.REACT_APP_API_URL || 'https://api.dousic.media';
		const url = apiUrl + '/webos/v1/telemetry/events';
		// sendBeacon with a Blob lets us set the content type — plain strings
		// send as text/plain which our backend validator rejects.
		const body = new Blob([JSON.stringify({events})], {type: 'application/json'});
		navigator.sendBeacon(url, body);
	} catch (_) {
		// sendBeacon is best-effort; no recovery path
	}
};

export const shutdown = () => {
	if (_flushTimer) clearInterval(_flushTimer);
	return flush();
};

// Named default export for drop-in use
export default {
	init: initTelemetry,
	setUser,
	clearUser,
	captureException,
	captureMessage,
	trackEvent,
	trackScreenView,
	flush,
	flushBeacon,
	shutdown
};
