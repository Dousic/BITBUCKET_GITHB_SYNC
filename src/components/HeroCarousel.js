/**
 * Dousic — Hero Carousel
 *
 * Full-width cinematic hero shown at the top of the Home view. Auto-rotates
 * every 8 seconds, pauses on focus. Pressing Left/Right moves between slides;
 * Enter triggers playback.
 *
 * Design reference: Netflix / Disney+ / Apple TV hero units. Full bleed,
 * heavy gradient overlay, large title + logline.
 */

import {useCallback, useEffect, useRef, useState} from 'react';
import SpotlightContainerDecorator, {spotlightDefaultClass} from '@enact/spotlight/SpotlightContainerDecorator';
import Button from '@enact/moonstone/Button';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import {resolveAssetUrl} from '../services/api';
import Strings from '../i18n/strings';
import css from './HeroCarousel.module.less';

const ROTATE_MS = 8000;

const HeroCarouselBase = ({items = [], onPlay, onMoreInfo}) => {
	const [index, setIndex] = useState(0);
	const [isFocused, setFocused] = useState(false);
	const timerRef = useRef();

	const go = useCallback((direction) => {
		setIndex((i) => {
			if (direction === 'next') return (i + 1) % items.length;
			return (i - 1 + items.length) % items.length;
		});
	}, [items.length]);

	// Auto-rotate (paused when focused)
	useEffect(() => {
		if (isFocused || items.length <= 1) return;
		timerRef.current = setInterval(() => go('next'), ROTATE_MS);
		return () => clearInterval(timerRef.current);
	}, [isFocused, items.length, go]);

	const handleKeyDown = useCallback((e) => {
		if (e.target.closest?.(`.${css.actions}`)) return;

		if (e.key === 'ArrowLeft') {
			go('prev'); e.stopPropagation();
		} else if (e.key === 'ArrowRight') {
			go('next'); e.stopPropagation();
		}
	}, [go]);

	if (items.length === 0) return null;

	const current = items[index];
	// Tolerate the various field names a featured item may carry (marketplace,
	// home-hero, and creator payloads differ).
	const backdrop = current.backdrop_url || current.cover_url || current.image_url ||
		current.image || current.poster_url || current.thumbnail_url;
	const logo = current.logo_url || current.logo;
	const heroTitle = current.title || current.name || '';
	const logline = current.logline || current.description || current.subtitle || current.tagline || '';
	const genre = current.genre || current.genre_name ||
		(Array.isArray(current.genres) ? current.genres[0] : null);
	const durationLabel = current.duration_label || current.duration_text;
	const isLive = current.is_live || current.isLive;

	return (
		<div
			className={css.hero}
			onFocus={() => setFocused(true)}
			onBlur={() => setFocused(false)}
			onKeyDown={handleKeyDown}
		>
			<div className={css.backdrop}>
				{backdrop && (
					<img
						src={resolveAssetUrl(backdrop)}
						alt=""
						className={css.backdropImage}
						key={current.id}
					/>
				)}
				<div className={css.gradient} />
			</div>

			<div className={css.content}>
				{logo ? (
					<img src={resolveAssetUrl(logo)} alt={heroTitle} className={css.logo} />
				) : (
					<h1 className={css.title}>{heroTitle}</h1>
				)}

				<div className={css.meta}>
					{isLive && <span className={css.liveTag}><span className={css.liveDot} />LIVE NOW</span>}
					{genre && <span className={css.genre}>{genre}</span>}
					{durationLabel && <span className={css.duration}>{durationLabel}</span>}
				</div>

				<p className={css.logline}>{logline}</p>

				<div className={css.actions}>
					{/*
					 * Stable spotlightIds — the carousel rotates `current.id`
					 * every 8 seconds, but the Play / More-info buttons are
					 * persistent UI affordances, not per-item references. Using
					 * `hero-play-${current.id}` would make useViewPersistence's
					 * focus restoration miss after a rotation (the saved id no
					 * longer matches the now-current item). Stable ids let
					 * Spotlight.focus('hero-play') land directly.
					 */}
					<Button
						className={spotlightDefaultClass}
						onClick={() => onPlay?.(current)}
						spotlightId="hero-play"
					>
						{isLive ? Strings.home.watchLive() : Strings.home.play()}
					</Button>
					<Button
						onClick={() => onMoreInfo?.(current)}
						spotlightId="hero-more-info"
					>
						{Strings.home.moreInfo()}
					</Button>
				</div>
			</div>

			{items.length > 1 && (
				<div className={css.dots} role="tablist">
					{items.map((_, i) => (
						<span
							key={i}
							className={classNames(css.dot, {[css.activeDot]: i === index})}
							role="tab"
							aria-selected={i === index}
						/>
					))}
				</div>
			)}
		</div>
	);
};

HeroCarouselBase.propTypes = {
	items: PropTypes.array,
	onMoreInfo: PropTypes.func,
	onPlay: PropTypes.func
};

const HeroCarousel = SpotlightContainerDecorator(
	{enterTo: 'default-element'},
	HeroCarouselBase
);

export default HeroCarousel;
