/**
 * Dousic — Live Panel
 *
 * Shows all currently-live streams. Updates viewer counts in real time via
 * WebSocket 'viewer_update' events. Sorted by viewer count descending.
 */

import {useEffect} from 'react';
import {Panel} from '@enact/moonstone/Panels';
import Scroller from '@enact/moonstone/Scroller';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import PropTypes from 'prop-types';

import {useContentStore} from '../state/contentStore';
import {useAppStore} from '../state/appStore';
import {useViewPersistence} from '../hooks/useViewPersistence';
import ContentCard from '../components/ContentCard';
import ws from '../services/ws';
import telemetry from '../platform/telemetry';
import Strings from '../i18n/strings';
import css from './LivePanel.module.less';

const LiveGrid = SpotlightContainerDecorator(
	{enterTo: 'last-focused'},
	({items, viewerCounts, onSelect}) => {
		if (!items || items.length === 0) {
			return (
				<div className={css.empty}>
					<div className={css.emptyIcon} />
					<h2 className={css.emptyTitle}>{Strings.live.emptyTitle()}</h2>
					<p className={css.emptyMessage}>
						{Strings.live.emptyMessage()}
					</p>
				</div>
			);
		}

		// Merge real-time viewer counts from WS
		const merged = items.map((item) => ({
			...item,
			viewer_count: viewerCounts[item.id] ?? item.viewer_count
		}));

		return (
			<div className={css.grid}>
				{merged.map((item) => (
					<ContentCard
						key={item.id}
						id={item.id}
						title={item.title}
						thumbnailUrl={item.thumbnail_url}
						creator={item.creator?.handle || item.creator?.display_name}
						isLive
						viewerCount={item.viewer_count}
						size="medium"
						onSelect={() => onSelect(item)}
					/>
				))}
			</div>
		);
	}
);

const LivePanelBase = (props) => {
	const live = useContentStore((s) => s.live);
	const isLoading = useContentStore((s) => s.isLoadingLive);
	const loadLive = useContentStore((s) => s.loadLive);
	const viewerCounts = useContentStore((s) => s.viewerCounts);
	const updateViewerCount = useContentStore((s) => s.updateViewerCount);
	const invalidateLive = useContentStore((s) => s.invalidateLive);
	const pushView = useAppStore((s) => s.pushView);

	// Restore scroll + focused card on remount (audit H6 follow-up).
	const persistence = useViewPersistence();

	useEffect(() => {
		loadLive().catch(() => {});
		telemetry.trackScreenView('live');

		// Subscribe to real-time events
		const unsubViewer = ws.on('viewer_update', ({content_id, viewer_count}) => {
			updateViewerCount(content_id, viewer_count);
		});
		const unsubStarted = ws.on('stream_started', () => {
			invalidateLive();
			loadLive().catch(() => {});
		});
		const unsubEnded = ws.on('stream_ended', () => {
			invalidateLive();
			loadLive().catch(() => {});
		});

		return () => {
			unsubViewer();
			unsubStarted();
			unsubEnded();
		};
	}, [loadLive, invalidateLive, updateViewerCount]);

	const handleSelect = (item) => {
		pushView('player', {contentId: item.id, isLive: true});
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
					<h1 className={css.title}>
						<span className={css.liveDot} />
						{Strings.live.title()}
					</h1>
					<p className={css.subtitle}>
						{Strings.live.subtitle(live?.data?.items?.length || 0)}
					</p>
				</header>

				{isLoading && !live ? (
					<div className={css.loading}>
						<div className={css.spinner} />
					</div>
				) : (
					<LiveGrid
						items={live?.data?.items || []}
						viewerCounts={viewerCounts}
						onSelect={handleSelect}
					/>
				)}
			</Scroller>
		</Panel>
	);
};

LivePanelBase.propTypes = {};

const LivePanel = SpotlightContainerDecorator(
	{enterTo: 'last-focused'},
	LivePanelBase
);

export default LivePanel;
