/**
 * Dousic — Content Card
 *
 * The primary tile used across Home rails, Browse grid, Live list.
 * Spottable — gets focus, scales up on focus, shows title overlay.
 *
 * Intentionally minimal chrome. The card is the content.
 */

import {useCallback, useState} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import {resolveAssetUrl} from '../services/api';
import {formatPriceLabel, isFreePrice} from '../utils/content';
import css from './ContentCard.module.less';

const formatViewerCount = (n) => {
	if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
	if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
	return String(n);
};

const formatDuration = (seconds) => {
	if (!seconds) return '';
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const ContentCardBase = ({
	id,
	title,
	thumbnailUrl,
	subtitle,
	creator,
	isLive = false,
	viewerCount,
	duration,
	type,
	price,
	isFree,
	size = 'medium',
	onSelect,
	className,
	...rest
}) => {
	// Fall back to the lettered placeholder if the artwork URL fails to load
	// (broken/expired link, blocked host) instead of showing a black tile.
	const [imgError, setImgError] = useState(false);

	// Price shown for on-demand marketplace items (not live streams).
	const priceLabel = !isLive ? formatPriceLabel(price, isFree) : null;
	// Marketplace media-type label (Audio / Video / …) shown as a corner pill,
	// matching dousic.media. Tolerates a few field names from the API.
	const typeLabel = typeof type === 'string' && type ?
		type.charAt(0).toUpperCase() + type.slice(1).toLowerCase() : null;
	const handleSelect = useCallback(() => {
		onSelect?.({id, title});
	}, [id, title, onSelect]);

	// Activation (OK/Enter) is handled globally by the Magic Remote OK-key
	// bridge (platform/okKey.js), which synthesizes a click on the focused
	// element. We only need onClick here; Spottable's injected onKeyDown
	// (spread via `rest`) continues to drive 5-way navigation.
	return (
		<div
			{...rest}
			className={classNames(css.card, css[size], className, {[css.live]: isLive})}
			onClick={handleSelect}
			role="button"
			aria-label={`${title}${creator ? ' by ' + creator : ''}`}
		>
			<div className={css.thumbnail}>
				{thumbnailUrl && !imgError ? (
					<img
						src={resolveAssetUrl(thumbnailUrl)}
						alt=""
						className={css.image}
						onError={() => setImgError(true)}
					/>
				) : (
					<div className={css.placeholder}>
						<span>{title?.[0]?.toUpperCase() || 'D'}</span>
					</div>
				)}

				{isLive && (
					<div className={css.liveBadge}>
						<span className={css.liveDot} />
						LIVE
					</div>
				)}

				{!isLive && typeLabel && (
					<div className={css.typeBadge}>{typeLabel}</div>
				)}

				{viewerCount != null && isLive && (
					<div className={css.viewerCount}>
						{formatViewerCount(viewerCount)} watching
					</div>
				)}

				{duration != null && !isLive && (
					<div className={css.duration}>{formatDuration(duration)}</div>
				)}

				<div className={css.gradient} />

				{/*
				  * Title overlay on the artwork. Hidden by default and
				  * brightened only when the card is focused — both a clean
				  * marketplace look and an unmistakable focus cue.
				  */}
				<div className={css.titleOverlay}>
					<div className={css.title}>{title}</div>
					{(subtitle || creator) && (
						<div className={css.subtitle}>{subtitle || creator}</div>
					)}
					{priceLabel && (
						<div className={classNames(css.price, {[css.priceFree]: isFreePrice(price, isFree)})}>
							{priceLabel}
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

ContentCardBase.propTypes = {
	id: PropTypes.string.isRequired,
	title: PropTypes.string.isRequired,
	className: PropTypes.string,
	creator: PropTypes.string,
	duration: PropTypes.number,
	isFree: PropTypes.bool,
	isLive: PropTypes.bool,
	onSelect: PropTypes.func,
	price: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
	size: PropTypes.oneOf(['small', 'medium', 'large', 'wide']),
	subtitle: PropTypes.string,
	thumbnailUrl: PropTypes.string,
	type: PropTypes.string,
	viewerCount: PropTypes.number
};

// Wrap with Spottable — adds the .spottable class, native focus handling
// (style via :focus), and forwards `spotlightId` as `data-spotlight-id`.
const ContentCardSpottable = Spottable(ContentCardBase);

// ContentCard — stable spotlightId derived from `id` when none is provided
// explicitly.
//
// useViewPersistence restores focus by spotlightId across panel unmount/
// remount cycles. Spottable auto-generates IDs for hosts without an
// explicit spotlightId, but those IDs are NOT stable across remounts —
// they change every time the component mounts. Deriving from item.id
// (which is stable) makes "the card you were focused on" recoverable
// when you back-navigate to a panel.
const ContentCard = ({spotlightId, id, ...rest}) => (
	<ContentCardSpottable
		id={id}
		spotlightId={spotlightId || `card-${id}`}
		{...rest}
	/>
);

ContentCard.propTypes = {
	id: PropTypes.string.isRequired,
	spotlightId: PropTypes.string
};

export default ContentCard;
