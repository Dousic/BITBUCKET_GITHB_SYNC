/**
 * Dousic — Feed Panel
 *
 * The social feed from dousic.media/feed, adapted for the 10-foot TV:
 * a single focusable column of posts with tab filters (For You / Following /
 * Live / Local). Each post shows the creator, caption, a media preview with a
 * play affordance, and engagement counts. Selecting a post opens it (live →
 * player, otherwise the content detail page).
 *
 * Web hover states become 5-way focus; the composer / gift / create actions
 * (creator tools) are intentionally omitted on TV, which is a lean-back,
 * consumption surface.
 */

import {useEffect, useState, useCallback} from 'react';
import {Panel} from '@enact/moonstone/Panels';
import Scroller from '@enact/moonstone/Scroller';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spottable from '@enact/spotlight/Spottable';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import {useContentStore} from '../state/contentStore';
import {useAppStore} from '../state/appStore';
import {useViewPersistence} from '../hooks/useViewPersistence';
import {asItems, toFeedPost} from '../utils/content';
import {resolveAssetUrl} from '../services/api';
import telemetry from '../platform/telemetry';
import Strings from '../i18n/strings';
import css from './FeedPanel.module.less';

const TABS = [
	{id: 'for_you',   label: () => Strings.feed.forYou()},
	{id: 'following', label: () => Strings.feed.following()},
	{id: 'live',      label: () => Strings.feed.liveTab()},
	{id: 'local',     label: () => Strings.feed.local()}
];

// --- Tab pill ---
const TabChipBase = ({id, label, active, className, ...rest}) => (
	<div
		{...rest}
		className={classNames(css.tab, className, {[css.tabActive]: active})}
		role="tab"
		aria-selected={active}
	>
		{typeof label === 'function' ? label() : label}
	</div>
);
TabChipBase.propTypes = {
	active: PropTypes.bool,
	className: PropTypes.string,
	id: PropTypes.string,
	label: PropTypes.oneOfType([PropTypes.string, PropTypes.func])
};
const TabChip = Spottable(TabChipBase);

const TabRow = SpotlightContainerDecorator(
	{enterTo: 'last-focused'},
	({tab, onPick}) => (
		<div className={css.tabs} role="tablist">
			{TABS.map((t) => (
				<TabChip
					key={t.id}
					id={t.id}
					label={t.label}
					active={tab === t.id}
					spotlightId={`feedtab-${t.id}`}
					onClick={() => onPick(t.id)}
				/>
			))}
		</div>
	)
);
TabRow.propTypes = {onPick: PropTypes.func, tab: PropTypes.string};

// --- Feed post card ---
const FeedPostBase = ({post, className, onSelect, ...rest}) => {
	const p = post;
	const hasMedia = p.thumbnailUrl || p.title || p.isLive;
	return (
		<article
			{...rest}
			className={classNames(css.post, className)}
			role="button"
			aria-label={`${p.name}${p.caption ? ': ' + p.caption : ''}`}
			onClick={onSelect}
		>
			<div className={css.postHead}>
				<span
					className={css.avatar}
					style={{background: p.avatarUrl ? 'transparent' : p.avatarGradient}}
				>
					{p.avatarUrl ? <img src={resolveAssetUrl(p.avatarUrl)} alt="" /> : p.initials}
				</span>
				<div className={css.who}>
					<div className={css.name}>
						{p.name}
						{p.handle && <span className={css.handle}> · @{p.handle}</span>}
					</div>
					{p.meta && <div className={css.meta}>{p.meta}</div>}
				</div>
				{p.tag && (
					<span className={classNames(css.tag, {[css.tagLive]: p.isLive})}>{p.tag}</span>
				)}
			</div>

			{p.caption && <div className={css.caption}>{p.caption}</div>}

			{hasMedia && (
				<div
					className={css.media}
					style={{background: p.thumbnailUrl ? '#000' : p.mediaGradient}}
				>
					{p.thumbnailUrl && (
						<img src={resolveAssetUrl(p.thumbnailUrl)} alt="" className={css.mediaImg} />
					)}
					<div className={css.mediaScrim} />
					{p.isLive && (
						<span className={css.liveBadge}>
							<span className={css.liveDot} />
							{Strings.player.liveLabel()}
							{p.viewerCount != null ? ` · ${p.viewerCount}` : ''}
						</span>
					)}
					<div className={css.mediaFoot}>
						<span className={css.playBtn} aria-hidden="true">▶</span>
						<div className={css.mediaText}>
							<div className={css.mediaTitle}>{p.title || p.caption}</div>
							{p.subtitle && <div className={css.mediaSub}>{p.subtitle}</div>}
						</div>
					</div>
				</div>
			)}

			{(p.likes != null || p.comments != null) && (
				<div className={css.actions}>
					{p.likes != null && <span className={css.action}>♥ {p.likes}</span>}
					{p.comments != null && <span className={css.action}>💬 {p.comments}</span>}
				</div>
			)}
		</article>
	);
};
FeedPostBase.propTypes = {
	className: PropTypes.string,
	onSelect: PropTypes.func,
	post: PropTypes.object.isRequired
};
const FeedPost = Spottable(FeedPostBase);

const FeedPanelBase = (props) => {
	const [tab, setTab] = useState('for_you');
	const feed = useContentStore((s) => s.feed);
	const isLoading = useContentStore((s) => s.isLoadingFeed);
	const loadFeed = useContentStore((s) => s.loadFeed);
	const pushView = useAppStore((s) => s.pushView);

	const persistence = useViewPersistence();

	useEffect(() => {
		loadFeed({tab}).catch(() => {/* store tracks error */});
		telemetry.trackScreenView('feed', {tab});
	}, [loadFeed, tab]);

	const posts = asItems(feed?.data).map(toFeedPost).filter((p) => p.id != null);

	const handleSelect = useCallback((post) => {
		const id = post.contentId;
		if (!id) return;
		if (post.isLive) {
			pushView('player', {contentId: id, isLive: true});
		} else {
			pushView('content-detail', {contentId: id});
		}
		telemetry.trackEvent('feed_select', {content_id: id, live: !!post.isLive});
	}, [pushView]);

	return (
		<Panel {...props} className={css.panel}>
			<Scroller
				{...persistence.scrollerProps}
				direction="vertical"
				verticalScrollbar="hidden"
				className={css.content}
			>
				<header className={css.header}>
					<div className={css.eyebrow}>{Strings.feed.eyebrow()}</div>
					<h1 className={css.title}>{Strings.feed.title()}</h1>
				</header>

				<TabRow tab={tab} onPick={setTab} />

				{isLoading && !feed ? (
					<div className={css.loading}><div className={css.spinner} /></div>
				) : posts.length > 0 ? (
					<div className={css.list}>
						{posts.map((p) => (
							<FeedPost
								key={p.id}
								post={p}
								spotlightId={`feed-${p.id}`}
								onSelect={() => handleSelect(p)}
							/>
						))}
					</div>
				) : (
					<div className={css.empty}>
						<h2 className={css.emptyTitle}>{Strings.feed.emptyTitle()}</h2>
						<p className={css.emptyMessage}>{Strings.feed.emptyBody()}</p>
					</div>
				)}
			</Scroller>
		</Panel>
	);
};

FeedPanelBase.propTypes = {};

const FeedPanel = SpotlightContainerDecorator(
	{enterTo: 'last-focused'},
	FeedPanelBase
);

export default FeedPanel;
