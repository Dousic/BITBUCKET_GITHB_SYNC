/**
 * Dousic — Content Rail
 *
 * A horizontal scrolling row of ContentCards — the bread-and-butter layout
 * unit of TV media apps (Netflix, Disney+, etc.).
 *
 * Wrapped with SpotlightContainerDecorator so arrow-key navigation works
 * naturally across the rail and focus-restores to the last-focused card
 * when re-entering.
 *
 * Uses Moonstone's Scroller internally for smooth horizontal panning
 * that follows focus.
 */

import {useRef} from 'react';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Scroller from '@enact/moonstone/Scroller';
import PropTypes from 'prop-types';

import ContentCard from './ContentCard';
import css from './ContentRail.module.less';

const ContentRail = SpotlightContainerDecorator(
	{
		// Restore focus to last-focused card when user returns to this rail
		enterTo: 'last-focused',
		// Prevent focus from leaving horizontally — use left/right to pan
		continue5WayHold: true
	},
	({title, items = [], cardSize = 'medium', onSelectItem, emptyLabel = 'Nothing here yet'}) => {
		const scrollerRef = useRef();

		const sizeClass = css[`size-${cardSize}`] || '';

		if (!items || items.length === 0) {
			return (
				<section className={`${css.rail} ${sizeClass}`}>
					{title && <h2 className={css.title}>{title}</h2>}
					<div className={css.empty}>{emptyLabel}</div>
				</section>
			);
		}

		return (
			<section className={`${css.rail} ${sizeClass}`}>
				{title && <h2 className={css.title}>{title}</h2>}

				<Scroller
					ref={scrollerRef}
					direction="horizontal"
					horizontalScrollbar="hidden"
					className={css.scroller}
				>
					<div className={css.track}>
						{items.map((item) => (
							<div key={item.id} className={css.slot}>
								<ContentCard
									id={item.id}
									title={item.title}
									thumbnailUrl={item.thumbnail_url || item.thumbnailUrl || item.cover_url || item.image_url || item.image || item.poster_url || item.backdrop_url}
									subtitle={item.subtitle}
									creator={item.creator?.handle || item.creator}
									isLive={item.is_live || item.isLive}
									viewerCount={item.viewer_count || item.viewerCount}
									duration={item.duration}
									type={item.type || item.media_type}
									price={item.price ?? item.amount ?? item.cost}
									isFree={item.is_free ?? item.isFree ?? item.free}
									size={cardSize}
									onSelect={() => onSelectItem?.(item)}
								/>
							</div>
						))}
					</div>
				</Scroller>
			</section>
		);
	}
);

ContentRail.propTypes = {
	cardSize: PropTypes.oneOf(['small', 'medium', 'large', 'wide']),
	emptyLabel: PropTypes.string,
	items: PropTypes.array,
	onSelectItem: PropTypes.func,
	title: PropTypes.string
};

export default ContentRail;
