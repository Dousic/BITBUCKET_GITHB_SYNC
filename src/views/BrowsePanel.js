/**
 * Dousic — Browse Panel
 *
 * Category-filtered 2D grid view. Genre chips across the top; cards
 * arranged in a 4-column grid below. Spatial nav: arrow keys move
 * between chips horizontally and between grid cards in 2D.
 *
 * Layout owns one outer vertical Scroller covering header + chips +
 * grid. The grid itself is plain CSS Grid (no inner Scroller); pressing
 * Down on the last visible row triggers the outer Scroller's
 * follow-focus to pan and reveal the next row. This is the canonical
 * Moonstone pattern for TV grids — the previous implementation had an
 * inner horizontal Scroller wrapping a single-row flex strip, which
 * meant "Browse" was UX-equivalent to a 5000-item horizontal rail.
 */

import {useEffect, useState, useCallback} from 'react';
import {Panel} from '@enact/moonstone/Panels';
import Scroller from '@enact/moonstone/Scroller';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spottable from '@enact/spotlight/Spottable';
import classNames from 'classnames';
import PropTypes from 'prop-types';

import {useContentStore} from '../state/contentStore';
import {useAppStore} from '../state/appStore';
import {useViewPersistence} from '../hooks/useViewPersistence';
import ContentCard from '../components/ContentCard';
import telemetry from '../platform/telemetry';
import Strings from '../i18n/strings';
import css from './BrowsePanel.module.less';

// Genre definitions — label is a function so it re-evaluates after locale change.
const GENRES = [
    { id: 'all', label: () => Strings.browse.all() },
    { id: 'music', label: () => Strings.browse.music() },
    { id: 'talk', label: () => Strings.browse.talk() },
    { id: 'gaming', label: () => Strings.browse.gaming() },
    { id: 'sports', label: () => Strings.browse.sports() },
    { id: 'news', label: () => Strings.browse.news() },
    { id: 'film', label: () => Strings.browse.film() },
    { id: 'art', label: () => Strings.browse.art() },
    { id: 'faith', label: () => Strings.browse.faith() },
    { id: 'kids', label: () => Strings.browse.kids() }
];

const GenreChipBase = ({ id, label, active, className, onSelect, ...rest }) => {
    const handleSelect = useCallback(() => onSelect?.(id), [id, onSelect]);

    // label is a function (locale-sensitive) — call it at render time
    const labelText = typeof label === 'function' ? label() : label;

    // Spottable handles Enter → click synthesis. Audit H4.
    return (
        <div
            {...rest}
            className={classNames(css.chip, className, { [css.active]: active })}
            onClick={handleSelect}
            role="tab"
            aria-selected={active}
        >
            {labelText}
        </div>
    );
};

GenreChipBase.propTypes = {
    id: PropTypes.string.isRequired,
    label: PropTypes.oneOfType([PropTypes.string, PropTypes.func]).isRequired,
    active: PropTypes.bool,
    className: PropTypes.string,
    onSelect: PropTypes.func
};

const GenreChip = Spottable(GenreChipBase);

const GenreRow = SpotlightContainerDecorator(
    { enterTo: 'last-focused' },
    ({ activeGenre, onChange }) => (
        <div className={css.chipRow}>
            {GENRES.map((g) => (
                <GenreChip
                    key={g.id}
                    {...g}
                    spotlightId={`chip-${g.id}`}
                    active={g.id === activeGenre}
                    onSelect={onChange}
                />
            ))}
        </div>
    )
);

// BrowseGrid: a real 2D grid (CSS Grid, 4 columns on 1920) inside the
// panel's outer vertical Scroller. The Spotlight container marker lets
// `enterTo: 'last-focused'` restore the last card we touched within a
// single mount cycle; useViewPersistence handles restoration across
// mount cycles. Cards get stable spotlight IDs from ContentCard's
// derivation (see ContentCard.js).
const BrowseGrid = SpotlightContainerDecorator(
    { enterTo: 'last-focused' },
    ({ items, onSelect }) => {
        if (!items || items.length === 0) {
            return <div className={css.empty}>{Strings.nothingHere()}</div>;
        }
        return (
            <div className={css.grid} role="grid">
                {items.map((item) => (
                    <ContentCard
                        key={item.id}
                        id={item.id}
                        title={item.title}
                        thumbnailUrl={item.thumbnail_url}
                        creator={item.creator?.handle}
                        isLive={item.is_live}
                        viewerCount={item.viewer_count}
                        duration={item.duration}
                        size="medium"
                        onSelect={() => onSelect(item)}
                    />
                ))}
            </div>
        );
    }
);

const BrowsePanelBase = (props) => {
    const [activeGenre, setActiveGenre] = useState('all');
    const browse = useContentStore((s) => s.browse);
    const isLoading = useContentStore((s) => s.isLoadingBrowse);
    const loadBrowse = useContentStore((s) => s.loadBrowse);
    const pushView = useAppStore((s) => s.pushView);

    // Restore scroll position and last-focused card on remount. The hook
    // returns `scrollerProps` to spread on the panel's outer Scroller.
    const persistence = useViewPersistence();

    useEffect(() => {
        const filter = activeGenre === 'all' ? {} : { genre: activeGenre };
        loadBrowse(filter).catch(() => { });
        telemetry.trackScreenView('browse', { genre: activeGenre });
    }, [activeGenre, loadBrowse]);

    const handleSelect = (item) => {
        if (item.is_live) {
            pushView('player', { contentId: item.id });
        } else {
            pushView('content-detail', { contentId: item.id });
        }
    };

    return (
        <Panel {...props} className={css.panel}>
            <Scroller
                {...persistence.scrollerProps}
                direction="vertical"
                verticalScrollbar="hidden"
                className={css.content}
            >
                <header className={css.header}>
                    <h1 className={css.title}>{Strings.browse.title()}</h1>
                </header>

                <GenreRow activeGenre={activeGenre} onChange={setActiveGenre} />

                <div className={css.gridWrap}>
                    {isLoading && (!browse || browse.filter?.genre !== activeGenre) ? (
                        <div className={css.loading}>
                            <div className={css.spinner} />
                        </div>
                    ) : (
                        <BrowseGrid
                            items={browse?.data?.items || []}
                            onSelect={handleSelect}
                        />
                    )}
                </div>
            </Scroller>
        </Panel>
    );
};

BrowsePanelBase.propTypes = {};

const BrowsePanel = SpotlightContainerDecorator(
    { enterTo: 'last-focused' },
    BrowsePanelBase
);

export default BrowsePanel;
