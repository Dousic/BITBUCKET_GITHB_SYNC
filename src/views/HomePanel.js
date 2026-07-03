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

import $L from '@enact/i18n/$L';

import {useContentStore} from '../state/contentStore';
import {useAppStore} from '../state/appStore';
import {useViewPersistence} from '../hooks/useViewPersistence';
import ContentRail from '../components/ContentRail';
import {asItems, isLiveItem} from '../utils/content';
import telemetry from '../platform/telemetry';
import Strings from '../i18n/strings';
import css from './HomePanel.module.less';

// Branded masthead mirroring the dousic.media redesign hero — non-focusable
// (pure brand chrome), so it never interferes with 5-way focus on the rails.
const HeroMasthead = () => (
	<div className={css.hero}>
		<div className={css.eyebrow}>
			<span className={css.eyebrowDot} />
			{$L('The creator-owned media platform')}
		</div>
		<h1 className={css.heroTitle}>
			{$L('Own your work.')} <span className={css.grad}>{$L('Keep 70%.')}</span>
		</h1>
		<p className={css.heroSub}>
			{$L('Audio, video, live, writing and art — stream anything from the creators you follow, and own what you make.')}
		</p>
		<div className={css.stats}>
			<div className={css.stat}><b>70%</b><span>{$L('to the creator')}</span></div>
			<span className={css.statDiv} />
			<div className={css.stat}><b>100%</b><span>{$L('ownership, always')}</span></div>
			<span className={css.statDiv} />
			<div className={css.stat}><b>1 app</b><span>{$L('phone · tablet · TV')}</span></div>
		</div>
	</div>
);

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

	const handleSelectCard = (item, railName) => {
		if (isLiveItem(item)) {
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
	// Featured items: prefer the dedicated /content/featured payload, fall
	// back to a featured/hero list embedded in the home payload.
	const featuredFromEndpoint = asItems(featured?.data);
	const featuredItems = featuredFromEndpoint.length > 0 ?
		featuredFromEndpoint : (data?.featured || data?.hero || []);

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

				<HeroMasthead />

				<div className={css.rails}>
					{featuredItems.length > 0 && (
						<ContentRail
							title={Strings.home.featured()}
							items={featuredItems}
							cardSize="wide"
							onSelectItem={(item) => handleSelectCard(item, 'featured')}
						/>
					)}

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
