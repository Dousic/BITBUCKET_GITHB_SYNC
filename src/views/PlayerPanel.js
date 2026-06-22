/**
 * Dousic — Player Panel
 *
 * Full-screen video playback. Fetches the stream URL + DRM config for the
 * content ID, hands to VideoPlayer, overlays TV-friendly transport controls
 * that auto-hide after 3 seconds of inactivity.
 *
 * For Dou-Stitch broadcasts, connects to the WS signaling channel so the
 * TV is a participant device.
 */

import {useEffect, useState, useRef, useCallback} from 'react';
import {Panel} from '@enact/moonstone/Panels';
import SpotlightContainerDecorator, {spotlightDefaultClass} from '@enact/spotlight/SpotlightContainerDecorator';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import Button from '@enact/moonstone/Button';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import {useAppStore} from '../state/appStore';
import {content as contentApi} from '../services/api';
import VideoPlayer from '../components/VideoPlayer';
import {useBackKey, useCaptions} from '../hooks/usePlatform';
import telemetry from '../platform/telemetry';
import {friendlyPlaybackMessage} from '../utils/playerErrors';
import Strings from '../i18n/strings';
import css from './PlayerPanel.module.less';

const CONTROLS_HIDE_MS = 3000;

const formatTime = (s) => {
	if (!s || !isFinite(s)) return '0:00';
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = Math.floor(s % 60);
	return h > 0 ?
		`${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` :
		`${m}:${String(sec).padStart(2, '0')}`;
};

// IconButton: a Spottable host that renders an icon (CSS-masked SVG) and
// fires `onPress` on click/Enter. `spotlightId` is the canonical Enact
// prop — used by Spotlight.focus(id) elsewhere. The earlier implementation
// stamped `data-spotlight-id` as a DOM attribute and queried it back via
// attribute selector; that worked because IconButton spreads `{...rest}`,
// but the canonical form is more robust across Enact patch versions and
// works regardless of whether the host element happens to forward
// arbitrary attributes. (Audit H7.)
// Spottable owns Enter activation — no manual onKeyDown handler. (H4.)
// `className` is destructured out of rest and merged via classNames so an
// external class (e.g. spotlightDefaultClass) is preserved alongside ours.
const IconButtonBase = ({icon, label, onPress, className, ...rest}) => {
	return (
		<div
			{...rest}
			className={classNames(css.iconButton, css[`icon-${icon}`], className)}
			onClick={onPress}
			role="button"
			aria-label={label}
		/>
	);
};
IconButtonBase.propTypes = {
	icon: PropTypes.string.isRequired,
	label: PropTypes.string.isRequired,
	className: PropTypes.string,
	onPress: PropTypes.func
};
const IconButton = Spottable(IconButtonBase);

// PersistentTopBar — always-visible back button + content title.
//
// First-time viewers don't realize the LG remote's hardware Back button
// exits the player. The previous implementation tucked the back affordance
// inside the auto-hide overlay, which meant after 3 seconds of inactivity
// there was no visible way out and users felt stuck. This component lives
// OUTSIDE the auto-hide overlay (rendered as a sibling in the player
// container) and stays visible for the entire playback session. Issue #2.
const PersistentTopBar = SpotlightContainerDecorator(
	{enterTo: 'default-element'},
	({title, creator, isLive, onBack}) => (
		<div className={css.persistentTopBar}>
			<IconButton
				icon="back"
				label={Strings.back()}
				spotlightId="player-back"
				onPress={onBack}
			/>
			<div className={css.titleBlock}>
				<div className={css.contentTitle}>{title}</div>
				{creator && <div className={css.creator}>{creator}</div>}
			</div>
			{isLive && (
				<div className={css.liveIndicator}>
					<span className={css.liveDot} />
					{Strings.player.liveLabel()}
				</div>
			)}
		</div>
	)
);

const PlayerControls = SpotlightContainerDecorator(
	{enterTo: 'default-element'},
	({isPlaying, position, duration, isLive, onPlayPause, onSeek}) => {
		const progress = duration > 0 ? (position / duration) * 100 : 0;

		return (
			<div className={css.controls}>
				{/*
				  * Top bar removed from here — back + title now live in
				  * PersistentTopBar (always visible). This block is only
				  * the auto-hiding transport row.
				  */}
				<div className={css.bottomBar}>
					<div className={css.transportRow}>
						<IconButton
							icon="rewind"
							label={Strings.player.rewind10()}
							onPress={() => onSeek(-10)}
						/>
						<IconButton
							icon={isPlaying ? 'pause' : 'play'}
							label={isPlaying ? Strings.player.pause() : Strings.player.play()}
							spotlightId="play-pause"
							className={spotlightDefaultClass}
							onPress={onPlayPause}
						/>
						<IconButton
							icon="forward"
							label={Strings.player.forward10()}
							onPress={() => onSeek(10)}
						/>
					</div>

					{!isLive && duration > 0 && (
						<div className={css.progressRow}>
							<span className={css.timeLabel}>{formatTime(position)}</span>
							<div className={css.progressTrack}>
								<div className={css.progressFill} style={{width: `${progress}%`}} />
								<div className={css.progressHandle} style={{left: `${progress}%`}} />
							</div>
							<span className={css.timeLabel}>{formatTime(duration)}</span>
						</div>
					)}
				</div>
			</div>
		);
	}
);

/**
 * Error view shown when content metadata or stream URL fetch fails.
 *
 * Wrapped in SpotlightContainerDecorator so Enact's spatial navigation
 * treats it as a focus container. The recovery <Button> is marked with
 * spotlightDefaultClass so focus lands there on mount via
 * `enterTo: 'default-element'`. (Audit H7 — previously used a CSS
 * attribute selector against `data-spotlight-id`.)
 */
const ErrorViewBase = ({message, onBack}) => {
	useEffect(() => {
		const id = setTimeout(() => {
			Spotlight.focus('player-error-back');
		}, 50);
		return () => clearTimeout(id);
	}, []);
	return (
		<div className={css.errorView}>
			<h1>{Strings.player.streamUnavailable()}</h1>
			<p>{message}</p>
			<Button
				onClick={onBack}
				spotlightId="player-error-back"
				className={spotlightDefaultClass}
			>
				{Strings.player.goBack()}
			</Button>
		</div>
	);
};
ErrorViewBase.propTypes = {
	message: PropTypes.string,
	onBack: PropTypes.func
};
const ErrorView = SpotlightContainerDecorator(
	{enterTo: 'default-element'},
	ErrorViewBase
);

const PlayerPanelBase = ({contentId, isLive: isLiveProp}) => {
	const [meta, setMeta] = useState(null);
	const [streamConfig, setStreamConfig] = useState(null);
	const [error, setError] = useState(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [position, setPosition] = useState(0);
	const [duration, setDuration] = useState(0);
	const [showControls, setShowControls] = useState(true);

	const playerRef = useRef();
	const hideTimer = useRef();
	const positionTimer = useRef();
	// Ref is read inside the effect's cleanup so we capture the value at
	// teardown time, not the null value the effect closure captured at setup.
	const metaRef = useRef(null);

	const popView = useAppStore((s) => s.popView);
	const captions = useCaptions();

	// Fetch content + stream URL
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const [metaData, streamData] = await Promise.all([
					contentApi.getById(contentId),
					contentApi.getStreamUrl(contentId)
				]);
				if (cancelled) return;
				metaRef.current = metaData;
				setMeta(metaData);
				setStreamConfig(streamData);
				telemetry.trackEvent('player_open', {
					content_id: contentId,
					is_live: metaData.is_live,
					is_dou_stitch: metaData.is_dou_stitch
				});
				// Dou-Stitch WS signaling is deferred past MVP — when
				// reintroduced, hook ws.joinDouStitch(metaData.broadcast_id)
				// here and matching leave in cleanup below.
			} catch (e) {
				if (cancelled) return;
				setError('Could not load stream');
				telemetry.captureException(e, {contentId});
			}
		})();

		return () => {
			cancelled = true;
			// metaRef is read at teardown time (not closure-captured), so this
			// correctly sees the loaded meta even if unmount races the fetch.
			// No Dou-Stitch leave required in MVP.
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [contentId]);

	// Auto-hide transport controls.
	//
	// Previously also moved focus to 'play-pause' on hide, which silently
	// stranded focus inside a pointer-events:none container (the now-hidden
	// overlay). When the user pressed Back on the remote, focus was on an
	// unreachable element and the keypress occasionally failed to surface
	// through Spotlight to our global back handler.
	//
	// On hide, we move focus to the always-visible back button instead.
	// That keeps focus inside a Spottable that the user can actually see,
	// and means the remote's Enter key has a meaningful default action
	// (exit player) when controls are hidden. Issue #2.
	const resetHideTimer = useCallback(() => {
		setShowControls(true);
		clearTimeout(hideTimer.current);
		hideTimer.current = setTimeout(() => {
			setShowControls(false);
			Spotlight.focus('player-back');
		}, CONTROLS_HIDE_MS);
	}, []);

	useEffect(() => {
		resetHideTimer();
		const onActivity = () => resetHideTimer();
		window.addEventListener('keydown', onActivity);
		window.addEventListener('mousemove', onActivity);
		return () => {
			clearTimeout(hideTimer.current);
			window.removeEventListener('keydown', onActivity);
			window.removeEventListener('mousemove', onActivity);
		};
	}, [resetHideTimer]);

	// Poll position for progress bar
	useEffect(() => {
		if (!isPlaying) return;
		positionTimer.current = setInterval(() => {
			const p = playerRef.current?.getPosition() || 0;
			const d = playerRef.current?.getDuration() || 0;
			setPosition(p);
			setDuration(d);
		}, 250);
		return () => clearInterval(positionTimer.current);
	}, [isPlaying]);

	// Back key exits player
	useBackKey(() => {
		popView();
		return true;
	});

	const handlePlayPause = useCallback(() => {
		if (isPlaying) {
			playerRef.current?.pause();
			telemetry.trackEvent('player_pause', {content_id: contentId, position});
		} else {
			playerRef.current?.play();
			telemetry.trackEvent('player_play', {content_id: contentId, position});
		}
	}, [isPlaying, contentId, position]);

	const handleSeek = useCallback((deltaSec) => {
		const current = playerRef.current?.getPosition() || 0;
		const next = Math.max(0, current + deltaSec);
		playerRef.current?.seek(next);
		telemetry.trackEvent('player_seek', {content_id: contentId, from: current, to: next});
	}, [contentId]);

	const handleBack = useCallback(() => {
		popView();
	}, [popView]);

	const handlePlayerPlaying = useCallback(() => {
		setIsPlaying(true);
	}, []);

	const handlePlayerPaused = useCallback(() => {
		setIsPlaying(false);
	}, []);

	const handlePlayerEnded = useCallback(() => {
		telemetry.trackEvent('player_ended', {content_id: contentId});
		popView();
	}, [contentId, popView]);

	const handlePlayerError = useCallback((e) => {
		setError(e?.message || 'Playback error');
	}, []);

	if (error) {
		// On error mount, pull focus to the recovery button so the remote
		// can drive recovery. Without this, focus may be left on a now-
		// unmounted control and back is the only recourse. Telemetry-wise
		// the raw error was already captured in the fetch catch block.
		return (
			<Panel className={css.panel}>
				<ErrorView
					message={friendlyPlaybackMessage(error)}
					onBack={handleBack}
				/>
			</Panel>
		);
	}

	if (!streamConfig) {
		return (
			<Panel className={css.panel}>
				<div className={css.loading}>
					<div className={css.spinner} />
				</div>
			</Panel>
		);
	}

	const isLive = isLiveProp || meta?.is_live;

	return (
		<Panel className={css.panel}>
			<div className={css.playerContainer}>
				<VideoPlayer
					ref={playerRef}
					contentId={contentId}
					streamUrl={streamConfig.url}
					protocol={streamConfig.protocol}
					posterUrl={meta?.backdrop_url || meta?.cover_url || meta?.image_url || meta?.image || meta?.poster_url || meta?.thumbnail_url}
					drmScheme={streamConfig.drm_scheme}
					drmLicenseUrl={streamConfig.drm_license_url}
					captionsEnabled={captions.enabled}
					captionsLanguage={captions.language}
					startPosition={meta?.resume_position || 0}
					onPlaying={handlePlayerPlaying}
					onPaused={handlePlayerPaused}
					onEnded={handlePlayerEnded}
					onError={handlePlayerError}
				/>

				{/*
				  * Always-visible back + title. Lives outside .controlsOverlay
				  * so it doesn't fade with the transport row. Issue #2.
				  */}
				<PersistentTopBar
					title={meta?.title || ''}
					creator={meta?.creator?.display_name || meta?.creator?.handle}
					isLive={isLive}
					onBack={handleBack}
				/>

				<div className={classNames(css.controlsOverlay, {[css.visible]: showControls})}>
					<PlayerControls
						isPlaying={isPlaying}
						position={position}
						duration={duration}
						isLive={isLive}
						onPlayPause={handlePlayPause}
						onSeek={handleSeek}
					/>
				</div>
			</div>
		</Panel>
	);
};

PlayerPanelBase.propTypes = {
	contentId: PropTypes.string.isRequired,
	isLive: PropTypes.bool
};

const PlayerPanel = SpotlightContainerDecorator(
	{enterTo: 'default-element'},
	PlayerPanelBase
);

export default PlayerPanel;
