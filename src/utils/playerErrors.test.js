/**
 * Dousic — playerErrors tests
 *
 * Verifies the error classifier maps common HLS/Media errors to the
 * correct friendly message bucket. When Strings.js is fully wired,
 * the returned values are localized strings; these tests check the
 * classification logic, not the translation.
 */

import {friendlyPlaybackMessage} from './playerErrors';
import Strings from '../i18n/strings';

describe('friendlyPlaybackMessage', () => {
	it('classifies network errors', () => {
		expect(friendlyPlaybackMessage(new Error('Network request failed')))
			.toBe(Strings.playerErrors.network());
		expect(friendlyPlaybackMessage({code: 'TIMEOUT'}))
			.toBe(Strings.playerErrors.network());
		expect(friendlyPlaybackMessage({code: 'NETWORK'}))
			.toBe(Strings.playerErrors.network());
	});

	it('classifies manifest / not-found errors', () => {
		expect(friendlyPlaybackMessage({details: 'manifestLoadError'}))
			.toBe(Strings.playerErrors.notFound());
		expect(friendlyPlaybackMessage(new Error('HTTP 404')))
			.toBe(Strings.playerErrors.notFound());
		expect(friendlyPlaybackMessage({details: 'levelLoadTimeOut'}))
			.toBe(Strings.playerErrors.notFound());
	});

	it('classifies buffer stalls as stalled', () => {
		expect(friendlyPlaybackMessage({details: 'bufferStalledError'}))
			.toBe(Strings.playerErrors.stalled());
		expect(friendlyPlaybackMessage({details: 'bufferAppendError'}))
			.toBe(Strings.playerErrors.stalled());
	});

	it('classifies codec / capability errors as unsupported', () => {
		expect(friendlyPlaybackMessage(new Error('MediaError: unsupported codec')))
			.toBe(Strings.playerErrors.unsupported());
		expect(friendlyPlaybackMessage({code: 'MEDIA_ERR_DECODE'}))
			.toBe(Strings.playerErrors.unsupported());
	});

	it('classifies DRM / EME errors', () => {
		expect(friendlyPlaybackMessage(new Error('Widevine license request failed')))
			.toBe(Strings.playerErrors.drmNotReady());
		expect(friendlyPlaybackMessage({name: 'NotSupportedError', message: 'MediaKeys'}))
			.toBe(Strings.playerErrors.drmNotReady());
	});

	it('classifies geo-restriction responses', () => {
		expect(friendlyPlaybackMessage(new Error('GEO_RESTRICTED: not in your region')))
			.toBe(Strings.playerErrors.geoRestricted());
	});

	it('falls through to generic for unrecognized errors', () => {
		expect(friendlyPlaybackMessage(new Error('Something weird happened')))
			.toBe(Strings.playerErrors.generic());
		expect(friendlyPlaybackMessage(null))
			.toBe(Strings.playerErrors.generic());
	});

	it('accepts a string error directly', () => {
		expect(friendlyPlaybackMessage('network fetch aborted'))
			.toBe(Strings.playerErrors.network());
	});
});
