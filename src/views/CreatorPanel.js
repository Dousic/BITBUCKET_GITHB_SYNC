/**
 * Dousic — Creator Panel
 *
 * Creator profile: avatar, display name, bio, follower count, subscribe CTA,
 * and rails for Live Now / Latest / Popular content from this creator.
 */

import {useEffect, useState} from 'react';
import {Panel} from '@enact/moonstone/Panels';
import Scroller from '@enact/moonstone/Scroller';
import SpotlightContainerDecorator, {spotlightDefaultClass} from '@enact/spotlight/SpotlightContainerDecorator';
import Button from '@enact/moonstone/Button';
import PropTypes from 'prop-types';

import {useAppStore} from '../state/appStore';
import {useViewPersistence} from '../hooks/useViewPersistence';
import {content as contentApi} from '../services/api';
import ContentRail from '../components/ContentRail';
import telemetry from '../platform/telemetry';
import Strings from '../i18n/strings';
import css from './CreatorPanel.module.less';

const formatCount = (n) => {
	if (n == null) return '0';
	if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
	if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
	return String(n);
};

const CreatorPanelBase = ({handle}) => {
	const [creator, setCreator] = useState(null);
	const [isLoading, setIsLoading] = useState(true);
	const pushView = useAppStore((s) => s.pushView);
	const notify = useAppStore((s) => s.notify);

	// Restore scroll + focused card on remount (audit H6 follow-up).
	const persistence = useViewPersistence();

	useEffect(() => {
		(async () => {
			try {
				const data = await contentApi.getCreator(handle);
				setCreator(data);
				telemetry.trackScreenView('creator', {handle});
			} catch (e) {
				telemetry.captureException(e, {handle});
			} finally {
				setIsLoading(false);
			}
		})();
	}, [handle]);

	const handleSelectContent = (item) => {
		if (item.is_live) {
			pushView('player', {contentId: item.id});
		} else {
			pushView('content-detail', {contentId: item.id});
		}
	};

	const handleFollow = () => {
		notify(
			creator?.is_following ? Strings.creator.notifyUnfollow() : Strings.creator.notifyFollow(),
			{type: 'success'}
		);
		setCreator((c) => ({...c, is_following: !c.is_following}));
		// Backend integration would happen here
	};

	if (isLoading) {
		return (
			<Panel className={css.panel}>
				<div className={css.loading}>
					<div className={css.spinner} />
				</div>
			</Panel>
		);
	}

	if (!creator) {
		return (
			<Panel className={css.panel}>
				<div className={css.errorView}>
					<h1>{Strings.creator.notFound()}</h1>
				</div>
			</Panel>
		);
	}

	return (
		<Panel className={css.panel}>
			<Scroller
				{...persistence.scrollerProps}
				direction="vertical"
				verticalScrollbar="hidden"
				className={css.content}
			>
				<header className={css.header}>
					{creator.banner_url && (
						<img src={creator.banner_url} alt="" className={css.banner} />
					)}
					<div className={css.bannerGradient} />

					<div className={css.headerContent}>
						<div className={css.avatar}>
							{creator.avatar_url ? (
								<img src={creator.avatar_url} alt="" />
							) : (
								<span>{(creator.display_name || 'D')[0].toUpperCase()}</span>
							)}
						</div>
						<div className={css.info}>
							<h1 className={css.name}>{creator.display_name || creator.handle}</h1>
							<div className={css.handle}>@{creator.handle}</div>
							<div className={css.stats}>
								<span>{Strings.creator.followers(formatCount(creator.follower_count))}</span>
								<span className={css.dot}>·</span>
								<span>{Strings.creator.posts(formatCount(creator.content_count))}</span>
							</div>
							{creator.bio && <p className={css.bio}>{creator.bio}</p>}
							<div className={css.actions}>
								<Button
									onClick={handleFollow}
									className={spotlightDefaultClass}
								>
									{creator.is_following ? Strings.creator.following() : Strings.creator.follow()}
								</Button>
							</div>
						</div>
					</div>
				</header>

				{creator.live_now?.length > 0 && (
					<ContentRail
						title={Strings.creator.liveNow()}
						items={creator.live_now}
						cardSize="medium"
						onSelectItem={handleSelectContent}
					/>
				)}

				{creator.latest?.length > 0 && (
					<ContentRail
						title={Strings.creator.latest()}
						items={creator.latest}
						cardSize="medium"
						onSelectItem={handleSelectContent}
					/>
				)}

				{creator.popular?.length > 0 && (
					<ContentRail
						title={Strings.creator.popular()}
						items={creator.popular}
						cardSize="medium"
						onSelectItem={handleSelectContent}
					/>
				)}
			</Scroller>
		</Panel>
	);
};

CreatorPanelBase.propTypes = {
	handle: PropTypes.string.isRequired
};

const CreatorPanel = SpotlightContainerDecorator(
	// `enterTo: 'default-element'` honors the follow button marked with
	// spotlightDefaultClass above. Audit H7 — previous combination of
	// `enterTo: 'last-focused'` plus `autoFocus` had focus jumping
	// unpredictably on remount.
	{enterTo: 'default-element'},
	CreatorPanelBase
);

export default CreatorPanel;
