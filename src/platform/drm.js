/* eslint-env browser */
/**
 * Dousic — DRM / EME helper
 *
 * webOS supports Widevine (all versions) and PlayReady (webOS 5+).
 * Content from a webOS PlayReady-protected stream must use
 * com.microsoft.playready; Widevine content uses com.widevine.alpha.
 *
 * This module probes which key systems the current TV supports and
 * picks the best match for a given content's protection scheme.
 */

const CAPABILITIES = [
	{
		keySystem: 'com.microsoft.playready',
		label: 'PlayReady',
		preferredFor: ['cenc', 'mspr']
	},
	{
		keySystem: 'com.widevine.alpha',
		label: 'Widevine',
		preferredFor: ['cenc', 'webm']
	}
];

let _cache = null;

export const probeKeySystems = async () => {
	if (_cache) return _cache;

	if (typeof navigator === 'undefined' ||
		typeof navigator.requestMediaKeySystemAccess !== 'function') {
		_cache = [];
		return _cache;
	}

	const supported = [];
	for (const cap of CAPABILITIES) {
		try {
			await navigator.requestMediaKeySystemAccess(cap.keySystem, [{
				initDataTypes: ['cenc'],
				videoCapabilities: [
					{contentType: 'video/mp4; codecs="avc1.42E01E"'}
				]
			}]);
			supported.push(cap);
		} catch (_) {
			// Not supported on this TV
		}
	}

	_cache = supported;
	return supported;
};

export const pickKeySystemFor = async (protectionScheme) => {
	const supported = await probeKeySystems();
	if (supported.length === 0) return null;

	// If content specifies a scheme, try to match
	if (protectionScheme) {
		const match = supported.find((cap) =>
			cap.preferredFor.includes(protectionScheme) ||
			cap.keySystem === protectionScheme
		);
		if (match) return match;
	}

	// Otherwise prefer PlayReady on webOS (more reliable on older firmware)
	const playready = supported.find((c) => c.keySystem === 'com.microsoft.playready');
	return playready || supported[0];
};

export const hasDRMSupport = async () => {
	const supported = await probeKeySystems();
	return supported.length > 0;
};
