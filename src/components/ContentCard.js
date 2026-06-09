/**
 * Dousic — Content Card
 *
 * The primary tile used across Home rails, Browse grid, Live list.
 * Spottable — gets focus, scales up on focus, shows title overlay.
 *
 * Intentionally minimal chrome. The card is the content.
 */

import {useCallback} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import PropTypes from 'prop-types';
import classNames from 'classnames';

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
	size = 'medium',
	onSelect,
	...rest
}) => {
	const handleSelect = useCallback(() => {
		onSelect?.({id, title});
	}, [id, title, onSelect]);

	// Spottable synthesizes a click on Enter for the host element, so a
	// manual onKeyDown Enter handler is redundant and on some remote
	// firmwares fires the action twice. Removed per audit H4.

	return (
		<div
			className={classNames(css.card, css[size], {[css.live]: isLive})}
			onClick={handleSelect}
			role="button"
			aria-label={`${title}${creator ? ' by ' + creator : ''}`}
			{...rest}
		>
			<div className={css.thumbnail}>
				{thumbnailUrl ? (
					<img src={thumbnailUrl} alt="" className={css.image} />
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

				{viewerCount != null && isLive && (
					<div className={css.viewerCount}>
						{formatViewerCount(viewerCount)} watching
					</div>
				)}

				{duration != null && !isLive && (
					<div className={css.duration}>{formatDuration(duration)}</div>
				)}

				<div className={css.gradient} />
			</div>

			<div className={css.meta}>
				<div className={css.title}>{title}</div>
				{(subtitle || creator) && (
					<div className={css.subtitle}>{subtitle || creator}</div>
				)}
			</div>
		</div>
	);
};

ContentCardBase.propTypes = {
	id: PropTypes.string.isRequired,
	title: PropTypes.string.isRequired,
	creator: PropTypes.string,
	duration: PropTypes.number,
	isLive: PropTypes.bool,
	onSelect: PropTypes.func,
	size: PropTypes.oneOf(['small', 'medium', 'large', 'wide']),
	subtitle: PropTypes.string,
	thumbnailUrl: PropTypes.string,
	viewerCount: PropTypes.number
};

// Wrap with Spottable — gives it .spottable + .spottable-focused classes
// and forwards `spotlightId` as `data-spotlight-id` on the host element.
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
