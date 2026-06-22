/**
 * Dousic — Home Panel
 *
 * The landing experience. Hero carousel up top, rails below:
 *   - Continue watching (from user history)
 *   - Live now (creators streaming right now)
 *   - Featured creators
 *   - Trending this week
 *   - Dou-Stitch Live broadcasts
 *   - New releases
 *
 * First view most users see. Must feel cinematic, responsive, and personal.
 */

import {useEffect} from 'react';
import {Panel} from '@enact/moonstone/Panels';
import Scroller from '@enact/moonstone/Scroller';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';

import {useContentStore} from '../state/contentStore';
import {useAppStore} from '../state/appStore';
import {useViewPersistence} from '../hooks/useViewPersistence';
import HeroCarousel from '../components/HeroCarousel';
import ContentRail from '../components/ContentRail';
import telemetry from '../platform/telemetry';
import Strings from '../i18n/strings';
import css from './HomePanel.module.less';

// Normalize a /content/featured (or home hero) payload to an array,
// whatever the backend wraps it in.
const asItems = (d) =>
	Array.isArray(d) ? d : (d?.items || d?.featured || d?.hero || d?.results || d?.data || []);

// TEMP diagnostic: describe a payload's shape (keys + array lengths) so the
// TV can self-report what /content/featured and /content/home actually
// return. Shown only when the carousel is empty. Remove once the carousel +
// content mapping are confirmed against the real API.
const summarize = (label, d) => {
	if (d == null) return `${label}=null`;
	if (Array.isArray(d)) return `${label}=array(${d.length})`;
	if (typeof d === 'object') {
		const parts = Object.keys(d).map((k) =>
			(Array.isArray(d[k]) ? `${k}[${d[k].length}]` : k));
		return `${label}={${parts.join(', ')}}`;
	}
	return `${label}=${typeof d}`;
};

const HomePanelBase = (props) => {
	const home = useContentStore((s) => s.home);
	const featured = useContentStore((s) => s.featured);
	const isLoading = useContentStore((s) => s.isLoadingHome);
	const loadHome = useContentStore((s) => s.loadHome);
	const loadFeatured = useContentStore((s) => s.loadFeatured);
	const pushView = useAppStore((s) => s.pushView);

	// Restore scroll + focused card on remount (audit H6 follow-up).
	const persistence = useViewPersistence();

	useEffect(() => {
		loadHome().catch(() => {/* store tracks error */});
		loadFeatured().catch(() => {/* non-fatal — carousel just stays hidden */});
		telemetry.trackScreenView('home');
	}, [loadHome, loadFeatured]);

	const handlePlay = (item) => {
		pushView('player', {contentId: item.id});
		telemetry.trackEvent('content_play', {content_id: item.id, source: 'home_hero'});
	};

	const handleMoreInfo = (item) => {
		pushView('content-detail', {contentId: item.id});
	};

	const handleSelectCard = (item, railName) => {
		if (item.is_live || item.isLive) {
			pushView('player', {contentId: item.id});
		} else {
			pushView('content-detail', {contentId: item.id});
		}
		telemetry.trackEvent('content_select', {
			content_id: item.id,
			rail: railName
		});
	};

	const data = home?.data;
	// Hero carousel items: prefer the dedicated /content/featured payload,
	// fall back to a hero/featured list embedded in the home payload.
	const featuredItems = asItems(featured?.data);
	const heroItems = featuredItems.length > 0 ? featuredItems : (data?.hero || data?.featured || []);

	return (
		<Panel {...props} className={css.panel}>
			<Scroller
				{...persistence.scrollerProps}
				direction="vertical"
				verticalScrollbar="hidden"
				className={css.content}
			>
				{isLoading && !data && (
					<div className={css.loading}>
						<div className={css.spinner} />
					</div>
				)}

				{heroItems.length > 0 && (
					<HeroCarousel
						items={heroItems}
						onPlay={handlePlay}
						onMoreInfo={handleMoreInfo}
					/>
				)}

				{/* TEMP: surface API shape when the carousel is empty (remove later) */}
				{!isLoading && heroItems.length === 0 && data && (
					<div className={css.dataDiag}>
						{summarize('featured', featured?.data)} · {summarize('home', data)}
					</div>
				)}

				<div className={css.rails}>
					{data?.continue_watching?.length > 0 && (
						<ContentRail
							title={Strings.home.continueWatching()}
							items={data.continue_watching}
							cardSize="medium"
							onSelectItem={(item) => handleSelectCard(item, 'continue_watching')}
						/>
					)}

					{data?.live_now?.length > 0 && (
						<ContentRail
							title={Strings.home.liveNow()}
							items={data.live_now}
							cardSize="medium"
							onSelectItem={(item) => handleSelectCard(item, 'live_now')}
						/>
					)}

					{data?.dou_stitch_broadcasts?.length > 0 && (
						<ContentRail
							title={Strings.home.douStitch()}
							items={data.dou_stitch_broadcasts}
							cardSize="wide"
							onSelectItem={(item) => handleSelectCard(item, 'dou_stitch')}
						/>
					)}

					{data?.featured_creators?.length > 0 && (
						<ContentRail
							title={Strings.home.featuredCreators()}
							items={data.featured_creators}
							cardSize="large"
							onSelectItem={(creator) => {
								pushView('creator', {handle: creator.handle});
							}}
						/>
					)}

					{data?.trending?.length > 0 && (
						<ContentRail
							title={Strings.home.trending()}
							items={data.trending}
							cardSize="medium"
							onSelectItem={(item) => handleSelectCard(item, 'trending')}
						/>
					)}

					{data?.new_releases?.length > 0 && (
						<ContentRail
							title={Strings.home.newReleases()}
							items={data.new_releases}
							cardSize="medium"
							onSelectItem={(item) => handleSelectCard(item, 'new_releases')}
						/>
					)}
				</div>
			</Scroller>
		</Panel>
	);
};

HomePanelBase.propTypes = {};

const HomePanel = SpotlightContainerDecorator(
	{enterTo: 'last-focused'},
	HomePanelBase
);

export default HomePanel;
