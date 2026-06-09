/**
 * Dousic — Video / Audio Player
 *
 * TV-grade media player driven by the backend's `protocol` field.
 *
 * Stream protocols, as returned by `GET /content/{id}/stream`:
 *   - 'hls'   — adaptive HLS manifest (`.m3u8`); needs native HLS on webOS,
 *               hls.js elsewhere
 *   - 'video' — direct progressive video file (`.mp4`, `.webm`, …); plays via
 *               the stock HTML5 element with `video.src = url`
 *   - 'audio' — direct progressive audio file (`.mp3`, `.m4a`, …); plays the
 *               same way, but we paint a poster backdrop so the screen isn't
 *               an empty black rectangle while audio is playing
 *
 * Routing direct media (mp3/mp4) through hls.js makes it try to parse a
 * binary file as a manifest and fail with an opaque fatal error — that's
 * what surfaced as the original "Stream unavailable" overlay.
 *
 * MVP scope:
 *   - DRM is stubbed — if a non-null `drmScheme` arrives we record it for
 *     telemetry but don't attempt EME attach. All seeded content has
 *     `drm_scheme=null`. Real DRM wiring (Widevine/PlayReady) is post-MVP.
 *
 * Features:
 *   - System caption preference integration
 *   - Screensaver block during playback
 *   - Progress reporting every 30 seconds
 *   - Graceful error UI with retry
 *
 * Exposes imperative methods via ref:
 *   player.play(), player.pause(), player.seek(seconds)
 */

import {forwardRef, useImperativeHandle, useEffect, useRef, useState, useCallback} from 'react';
import PropTypes from 'prop-types';
import Button from '@enact/moonstone/Button';
import SpotlightContainerDecorator, {spotlightDefaultClass} from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';

import {getWebOSMajorVersion} from '../platform/luna';
import {useScreensaverControl} from '../hooks/usePlatform';
import telemetry from '../platform/telemetry';
import {user as userApi} from '../services/api';
import {friendlyPlaybackMessage} from '../utils/playerErrors';
import Strings from '../i18n/strings';
import css from './VideoPlayer.module.less';

const PROGRESS_INTERVAL_MS = 30000;

// Build-time flag: when true, skip the hls.js dynamic import entirely and
// only use the TV's native HLS pipeline. Bundle ships ~400KB lighter.
const NATIVE_HLS_ONLY = process.env.REACT_APP_NATIVE_HLS_ONLY === 'true';

const PROTOCOL_HLS = 'hls';
const PROTOCOL_AUDIO = 'audio';
const PROTOCOL_VIDEO = 'video';

// The backend now sends `protocol` ('hls' | 'video' | 'audio'). Older builds
// (and some test fixtures) may omit it, so we sniff the URL extension as a
// safety net — never as the primary signal — and default to 'video' so the
// HTML5 element handles whatever blob the server returned.
const normalizeProtocol = (protocol, url) => {
	if (typeof protocol === 'string' && protocol.length > 0) {
		return protocol.toLowerCase();
	}
	if (url) {
		const path = url.split('?')[0].split('#')[0].toLowerCase();
		if (/\.m3u8$/.test(path)) return PROTOCOL_HLS;
		if (/\.(mp3|m4a|aac|ogg|oga|wav|flac)$/.test(path)) return PROTOCOL_AUDIO;
	}
	return PROTOCOL_VIDEO;
};

const VideoPlayer = forwardRef(({
	contentId,
	streamUrl,
	protocol,
	posterUrl,
	drmScheme,          // unused in MVP; kept on props for future DRM path
	drmLicenseUrl,      // unused in MVP
	captionsEnabled = false,
	captionsLanguage,
	startPosition = 0,
	onEnded,
	onError,
	onPlaying,
	onPaused
}, ref) => {
	const videoRef = useRef();
	const hlsRef = useRef();
	const progressTimer = useRef();
	const onErrorRef = useRef(onError);
	const onPlayingRef = useRef(onPlaying);
	const onPausedRef = useRef(onPaused);
	const onEndedRef = useRef(onEnded);

	const [state, setState] = useState('loading'); // loading | playing | paused | ended | error
	const [error, setError] = useState(null);	// Block TV screensaver during active playback
	useScreensaverControl(state === 'playing');

	useEffect(() => {
		onErrorRef.current = onError;
		onPlayingRef.current = onPlaying;
		onPausedRef.current = onPaused;
		onEndedRef.current = onEnded;
	}, [onError, onPlaying, onPaused, onEnded]);

	// Imperative API exposed via ref
	useImperativeHandle(ref, () => ({
		play: () => videoRef.current?.play(),
		pause: () => videoRef.current?.pause(),
		seek: (seconds) => {
			if (videoRef.current) videoRef.current.currentTime = seconds;
		},
		getPosition: () => videoRef.current?.currentTime || 0,
		getDuration: () => videoRef.current?.duration || 0
	}), []);

	// Hoisted handler so setup() and error/retry share one path.
	const handlePlaybackError = useCallback((err) => {
		const message = err?.message || 'Playback error';
		setError(message);
		setState('error');
		onErrorRef.current?.(err);
		telemetry.captureException(err instanceof Error ? err : new Error(message), {
			contentId,
			streamUrl
		});
	}, [contentId, streamUrl]);

	// Set up stream on mount / streamUrl change
	useEffect(() => {
		let mounted = true;
		const video = videoRef.current;
		if (!video || !streamUrl) return;

		setState('loading');
		setError(null);

		const setup = async () => {
			// MVP DRM stub — we ship unencrypted only. If a non-null drmScheme
			// arrives, record it for telemetry but don't attempt EME attach.
			if (drmScheme) {
				telemetry.captureMessage(
					'DRM-protected content requested but DRM is not available in MVP',
					'warning',
					{contentId, drmScheme}
				);
			}

			const playbackProtocol = normalizeProtocol(protocol, streamUrl);

			// Direct media — `protocol === 'video' | 'audio'`. Hand the URL
			// to the HTML5 element directly. The native-HLS / hls.js paths
			// below only apply to HLS manifests.
			if (playbackProtocol !== PROTOCOL_HLS) {
				video.src = streamUrl;
				video.addEventListener('loadedmetadata', () => {
					if (!mounted) return;
					if (startPosition > 0) video.currentTime = startPosition;
					video.play().catch(handlePlaybackError);
				}, {once: true});
				return;
			}

			const webOSVersion = await getWebOSMajorVersion();
			const useNativeHls = webOSVersion >= 4 &&
                video.canPlayType('application/vnd.apple.mpegurl') !== '';

			if (useNativeHls) {
				// Native HLS — preferred on webOS (hardware-accelerated pipeline).
				video.src = streamUrl;

				video.addEventListener('loadedmetadata', () => {
					if (!mounted) return;
					if (startPosition > 0) video.currentTime = startPosition;
					video.play().catch(handlePlaybackError);
				}, {once: true});
				return;
			}

			if (NATIVE_HLS_ONLY) {
				handlePlaybackError(new Error('Native HLS not supported on this device'));
				return;
			}

			// hls.js fallback — dynamically imported so its ~400KB doesn't
			// ship to webOS builds that can use native HLS.
			try {
				const {default: Hls} = await import('hls.js');
				if (!mounted) return;

				if (!Hls.isSupported()) {
					handlePlaybackError(new Error('Video playback not supported on this device'));
					return;
				}

				const hls = new Hls({
					// Conservative buffer sizes — target webOS TVs with as
					// little as 256MB declared memory. hls.js default is
					// 30s front / 30s back; reducing to 15s/15s keeps the
					// resident buffer small enough to coexist with the
					// decoder and React tree without triggering
					// webOSLowMemory under normal playback.
					maxBufferLength: 15,
					maxMaxBufferLength: 30,
					lowLatencyMode: false,
					backBufferLength: 15
				});
				hlsRef.current = hls;

				hls.loadSource(streamUrl);
				hls.attachMedia(video);

				hls.on(Hls.Events.MANIFEST_PARSED, () => {
					if (!mounted) return;
					if (startPosition > 0) video.currentTime = startPosition;
					video.play().catch(handlePlaybackError);
				});

				hls.on(Hls.Events.ERROR, (event, data) => {
					if (data.fatal) {
						telemetry.captureException(new Error('HLS fatal error'), {
							type: data.type,
							details: data.details,
							contentId
						});
						handlePlaybackError(new Error(`Playback failed: ${data.details}`));
					}
				});
			} catch (err) {
				handlePlaybackError(err);
			}
		};

		setup();

		return () => {
			mounted = false;
			if (hlsRef.current) {
				try {
					hlsRef.current.destroy();
				} catch (_) {
					// Best effort cleanup.
				}
				hlsRef.current = null;
			}
			if (video) {
				try {
					video.pause();
				} catch (_) {
					// Best effort cleanup.
				}
				video.src = '';
			}
		};
	}, [streamUrl, protocol, drmScheme, drmLicenseUrl, startPosition, contentId, handlePlaybackError]);

	// Video event listeners
	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;

		const handlers = {
			playing: () => {
				setState('playing');
				onPlayingRef.current?.();
			},
			pause: () => {
				setState('paused');
				onPausedRef.current?.();
			},
			waiting: () => setState('loading'),
			ended: () => {
				setState('ended');
				onEndedRef.current?.();
			},
			error: () => handlePlaybackError(video.error)
		};

		Object.entries(handlers).forEach(([event, fn]) =>
			video.addEventListener(event, fn));

		return () => {
			Object.entries(handlers).forEach(([event, fn]) =>
				video.removeEventListener(event, fn));
		};
	}, [handlePlaybackError]);

	// Caption track selection
	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;

		const tracks = video.textTracks;
		for (let i = 0; i < tracks.length; i++) {
			const track = tracks[i];
			const langMatches = !captionsLanguage ||
                track.language?.toLowerCase().startsWith(captionsLanguage.toLowerCase());
			track.mode = (captionsEnabled && langMatches) ? 'showing' : 'hidden';
		}
	}, [captionsEnabled, captionsLanguage]);

	// Periodic progress reporting
	useEffect(() => {
		if (state !== 'playing' || !contentId) return;
		const trackedVideo = videoRef.current;
		if (!trackedVideo) return;

		const sendProgress = () => {
			userApi.reportProgress(
				contentId,
				Math.floor(trackedVideo.currentTime),
				Math.floor(trackedVideo.duration || 0)
			).catch(() => { /* silent */ });
		};

		progressTimer.current = setInterval(sendProgress, PROGRESS_INTERVAL_MS);

		return () => {
			clearInterval(progressTimer.current);
			// Final flush on teardown so a user who watches for < 30s or exits
			// between ticks still gets an accurate resume position saved.
			// Guard on > 5s so trivial mounts (e.g. a mis-click) don't save
			// noise. Live streams (duration === 0 / Infinity) skip persistence
			// since there's no meaningful resume-to-position.
			if (trackedVideo.currentTime > 5 && isFinite(trackedVideo.duration) && trackedVideo.duration > 0) {
				userApi.reportProgress(
					contentId,
					Math.floor(trackedVideo.currentTime),
					Math.floor(trackedVideo.duration)
				).catch(() => { /* silent */ });
			}
		};
	}, [state, contentId]);

	const handleRetry = useCallback(() => {
		const video = videoRef.current;
		if (video) {
			video.load();
			video.play().catch(handlePlaybackError);
		}
	}, [handlePlaybackError]);

	// When an error occurs, pull focus to the retry button so the user can
	// recover with the remote. Without this, focus may be stuck on a now-
	// hidden transport control and the retry affordance is unreachable.
	useEffect(() => {
		if (state === 'error') {
			// Small delay to allow the error overlay to mount before focusing.
			// Bare spotlightId (Spotlight resolves it). Audit H7.
			const id = setTimeout(() => {
				Spotlight.focus('player-retry');
			}, 50);
			return () => clearTimeout(id);
		}
	}, [state]);

	const resolvedProtocol = normalizeProtocol(protocol, streamUrl);
	const isAudioOnly = resolvedProtocol === PROTOCOL_AUDIO;

	return (
		<div className={css.player}>
			<video
				ref={videoRef}
				className={css.video}
				playsInline
				crossOrigin="anonymous"
			/>

			{/*
              * Audio-only protocol: the <video> element produces no picture, so
              * we layer a poster backdrop above it. Sits below the loading and
              * error overlays so they remain readable, and below the transport
              * controls (which live in PlayerPanel as the next sibling).
              */}
			{isAudioOnly && (
				<div
					className={css.audioBackdrop}
					style={posterUrl ? {backgroundImage: `url("${posterUrl}")`} : null}
					aria-hidden="true"
				>
					<div className={css.audioBackdropScrim} />
				</div>
			)}

			{state === 'loading' && (
				<div className={css.loadingOverlay}>
					<div className={css.spinner} />
				</div>
			)}

			{state === 'error' && (
				<ErrorOverlay
					message={friendlyPlaybackMessage(error)}
					onRetry={handleRetry}
				/>
			)}
		</div>
	);
});

/**
 * SpotlightContainerDecorator wraps the error overlay so Enact's spatial
 * navigation treats it as a focus container and `Spotlight.focus()` lands
 * on the retry button when this mounts. The prior implementation used a
 * raw <button> which cannot be focused by the TV remote — a cert blocker.
 */
const ErrorOverlayBase = ({message, onRetry}) => (
	<div className={css.errorOverlay}>
		<h2 className={css.errorTitle}>{Strings.player.playbackProblem()}</h2>
		<p className={css.errorMessage}>{message}</p>
		<Button
			onClick={onRetry}
			spotlightId="player-retry"
			className={spotlightDefaultClass}
		>
			{Strings.retry()}
		</Button>
	</div>
);
ErrorOverlayBase.propTypes = {
	message: PropTypes.string,
	onRetry: PropTypes.func
};
const ErrorOverlay = SpotlightContainerDecorator(
	{enterTo: 'default-element'},
	ErrorOverlayBase
);

VideoPlayer.displayName = 'VideoPlayer';

VideoPlayer.propTypes = {
	captionsEnabled: PropTypes.bool,
	captionsLanguage: PropTypes.string,
	contentId: PropTypes.string,
	drmLicenseUrl: PropTypes.string,
	drmScheme: PropTypes.string,
	onEnded: PropTypes.func,
	onError: PropTypes.func,
	onPaused: PropTypes.func,
	onPlaying: PropTypes.func,
	// Image shown behind the <video> element when `protocol === 'audio'` so
	// the user sees content artwork instead of a black rectangle.
	posterUrl: PropTypes.string,
	// Backend's `protocol` field. Case-insensitive: 'HLS', 'audio', 'video'.
	// Optional; if absent we fall back to URL sniffing.
	protocol: PropTypes.string,
	startPosition: PropTypes.number,
	streamUrl: PropTypes.string
};

export default VideoPlayer;
