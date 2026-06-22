/**
 * Dousic — Player error message mapping
 *
 * User-facing messages for playback failures. Keeps cryptic internal error
 * codes ("bufferStalledError", "manifestLoadError", "levelLoadTimeOut")
 * off TV screens and gives the user something actionable.
 *
 * All messages are sourced from Strings.js so they localize automatically
 * with the TV's system locale. Supported locales: en-US (default), ko-KR,
 * es-419 (Latin American Spanish).
 */

import Strings from '../i18n/strings';

/**
 * Classify an error from hls.js, native MediaError, fetch, or a plain
 * Error and return a localized friendly message.
 *
 * @param {Error|Object|string} err — anything that flowed into handlePlaybackError
 * @returns {string}
 */
export const friendlyPlaybackMessage = (err) => {
	if (!err) return Strings.playerErrors.generic();

	const raw = typeof err === 'string' ?
		err :
		(err.message || err.details || err.code || err.name || '');
	const lower = String(raw).toLowerCase();

	// HLS rendition/manifest load timeouts are a "can't reach the stream"
	// (not-found) condition, not a transient network blip. They carry the
	// `timeout` substring, so they MUST be classified before the generic
	// network family below — otherwise the `timeout` token there swallows
	// them and the viewer gets the wrong message.
	if (/levelloadtimeout|manifestloadtimeout/.test(lower)) {
		return Strings.playerErrors.notFound();
	}

	// Network family — check first because these often wrap other error types
	if (/network|fetch|timeout|abort|offline|econnreset|connect/.test(lower)) {
		return Strings.playerErrors.network();
	}

	// Manifest / not-found / 404
	if (/manifest|404|not\s*found|notfound|notexist|levelloadtimeout/.test(lower)) {
		return Strings.playerErrors.notFound();
	}

	// Buffer stalls (mostly HLS.js)
	if (/stall|buffer|bufferstalled|bufferstuck|bufferappenderror/.test(lower)) {
		return Strings.playerErrors.stalled();
	}

	// Codec / container / device-capability issues
	if (/codec|decoder|unsupported|not\s*supported|mediaerror|media_err/.test(lower)) {
		return Strings.playerErrors.unsupported();
	}

	// DRM / EME (dormant in MVP but covered for safety)
	if (/drm|license|eme|keysystem|widevine|playready|mediakeys/.test(lower)) {
		return Strings.playerErrors.drmNotReady();
	}

	// Geo-restriction from the backend's /content/{id}/stream 403
	if (/geo|region|country/.test(lower)) {
		return Strings.playerErrors.geoRestricted();
	}

	return Strings.playerErrors.generic();
};

export default friendlyPlaybackMessage;
