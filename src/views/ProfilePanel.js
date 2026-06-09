/**
 * Dousic — Profile Panel
 *
 * User's account view: watchlist, watch history, subscription, settings.
 * For guest users, shows a "Sign in to save your content" prompt.
 */

import {useEffect, useState} from 'react';
import {Panel} from '@enact/moonstone/Panels';
import Scroller from '@enact/moonstone/Scroller';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Button from '@enact/moonstone/Button';
import PropTypes from 'prop-types';

import {useAuthStore} from '../state/authStore';
import {useAppStore} from '../state/appStore';
import {useViewPersistence} from '../hooks/useViewPersistence';
import {user as userApi} from '../services/api';
import ContentRail from '../components/ContentRail';
import telemetry from '../platform/telemetry';
import Strings from '../i18n/strings';
import css from './ProfilePanel.module.less';

const ProfilePanelBase = (props) => {
	const user = useAuthStore((s) => s.user);
	const logout = useAuthStore((s) => s.logout);
	const pushView = useAppStore((s) => s.pushView);
	const switchRoot = useAppStore((s) => s.switchRoot);
	const notify = useAppStore((s) => s.notify);

	const [watchlist, setWatchlist] = useState([]);
	const [history, setHistory] = useState([]);
	const [isLoading, setIsLoading] = useState(true);

	const isGuest = user?.is_guest || !user;

	// Restore scroll + focused card on remount (audit H6 follow-up).
	const persistence = useViewPersistence();

	useEffect(() => {
		telemetry.trackScreenView('profile');

		if (isGuest) {
			setIsLoading(false);
			return;
		}

		(async () => {
			try {
				const [wl, hist] = await Promise.all([
					userApi.getWatchlist(),
					userApi.getHistory()
				]);
				setWatchlist(wl.items || []);
				setHistory(hist.items || []);
			} catch (e) {
				// Surface a non-blocking toast so the user knows their
				// watchlist/history failed to load — previously silent
				// (audit M4). Telemetry captures the underlying error for
				// observability.
				telemetry.captureException(e, {screen: 'profile'});
				notify(Strings.errorBoundary.title(), {type: 'error'});
			} finally {
				setIsLoading(false);
			}
		})();
	}, [isGuest]);

	const handleSelect = (item) => {
		if (item.is_live) {
			pushView('player', {contentId: item.id});
		} else {
			pushView('content-detail', {contentId: item.id});
		}
	};

	const handleLogout = async () => {
		await logout();
		notify('Signed out', {type: 'success'});
		switchRoot('home');
	};

	const handleSignIn = () => {
		pushView('login');
	};

	const handleSettings = () => {
		pushView('settings');
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
					<div className={css.avatar}>
						{user?.avatar_url ? (
							<img src={user.avatar_url} alt="" />
						) : (
							<span>{(user?.display_name || 'D')[0].toUpperCase()}</span>
						)}
					</div>
					<div className={css.info}>
						<h1 className={css.name}>
							{isGuest ? Strings.profile.guest() : (user.display_name || user.handle || Strings.appName())}
						</h1>
						{user?.handle && !isGuest && (
							<div className={css.handle}>@{user.handle}</div>
						)}
						<div className={css.actions}>
							{isGuest ? (
								<Button onClick={handleSignIn}>{Strings.signIn()}</Button>
							) : (
								<>
									<Button onClick={handleSettings}>{Strings.profile.settings()}</Button>
									<Button onClick={handleLogout}>{Strings.signOut()}</Button>
								</>
							)}
						</div>
					</div>
				</header>

				{!isGuest && !isLoading && (
					<>
						{watchlist.length > 0 && (
							<ContentRail
								title={Strings.profile.watchlist()}
								items={watchlist}
								cardSize="medium"
								onSelectItem={handleSelect}
							/>
						)}

						{history.length > 0 && (
							<ContentRail
								title={Strings.profile.recentlyWatched()}
								items={history}
								cardSize="medium"
								onSelectItem={handleSelect}
							/>
						)}

						{watchlist.length === 0 && history.length === 0 && (
							<div className={css.empty}>
								<h2 className={css.emptyTitle}>{Strings.profile.emptyTitle()}</h2>
								<p className={css.emptyMessage}>
									{Strings.profile.emptyMessage()}
								</p>
							</div>
						)}
					</>
				)}

				{isGuest && (
					<div className={css.guestPrompt}>
						<h2 className={css.promptTitle}>{Strings.profile.guestPromptTitle()}</h2>
						<p className={css.promptMessage}>
							{Strings.profile.guestPromptMessage()}
						</p>
					</div>
				)}
			</Scroller>
		</Panel>
	);
};

ProfilePanelBase.propTypes = {};

const ProfilePanel = SpotlightContainerDecorator(
	{enterTo: 'last-focused'},
	ProfilePanelBase
);

export default ProfilePanel;
