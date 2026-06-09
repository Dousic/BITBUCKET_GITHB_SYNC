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

	return (
		<div
			className={css.hero}
			onFocus={() => setFocused(true)}
			onBlur={() => setFocused(false)}
			onKeyDown={handleKeyDown}
		>
			<div className={css.backdrop}>
				{current.backdrop_url && (
					<img
						src={current.backdrop_url}
						alt=""
						className={css.backdropImage}
						key={current.id}
					/>
				)}
				<div className={css.gradient} />
			</div>

			<div className={css.content}>
				{current.logo_url ? (
					<img src={current.logo_url} alt={current.title} className={css.logo} />
				) : (
					<h1 className={css.title}>{current.title}</h1>
				)}

				<div className={css.meta}>
					{current.is_live && <span className={css.liveTag}><span className={css.liveDot} />LIVE NOW</span>}
					{current.genre && <span className={css.genre}>{current.genre}</span>}
					{current.duration_label && <span className={css.duration}>{current.duration_label}</span>}
				</div>

				<p className={css.logline}>{current.logline}</p>

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
						{current.is_live ? Strings.home.watchLive() : Strings.home.play()}
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
