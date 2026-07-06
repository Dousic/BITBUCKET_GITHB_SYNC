/**
 * Dousic — Profile Panel
 *
 * The complete account view from dousic.media/profile, adapted for TV:
 * cover + conic-ring avatar, role / location / follower stats, storage &
 * livestreaming usage, and sub-tabs (About · Content · Collection · Followers ·
 * Following). Guests get the sign-in prompt.
 *
 * All fields are read tolerantly: the panel prefers the richer /user/profile
 * payload and falls back to the basic /auth/me user + watchlist/history, so it
 * renders sensibly whatever the backend currently returns.
 */

import {useEffect, useState, useCallback} from 'react';
import {Panel} from '@enact/moonstone/Panels';
import Scroller from '@enact/moonstone/Scroller';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spottable from '@enact/spotlight/Spottable';
import Button from '@enact/moonstone/Button';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import {useAuthStore} from '../state/authStore';
import {useAppStore} from '../state/appStore';
import {useViewPersistence} from '../hooks/useViewPersistence';
import {user as userApi, resolveAssetUrl} from '../services/api';
import {asItems, toCardProps, gradientFor, initialsFor} from '../utils/content';
import ContentCard from '../components/ContentCard';
import telemetry from '../platform/telemetry';
import Strings from '../i18n/strings';
import css from './ProfilePanel.module.less';

const num = (v) => (typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' && !isNaN(v) ? Number(v) : null));
// Compact follower counts: 12400 -> "12.4K", 2_100_000 -> "2.1M".
const compact = (n) => {
	if (n == null) return '0';
	if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
	if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
	return String(n);
};
const pct = (used, total) => {
	const u = num(used), t = num(total);
	if (u == null || !t) return null;
	return Math.max(0, Math.min(100, Math.round((u / t) * 100)));
};

// --- Sub-tab pill ---
const TabChipBase = ({id, label, active, className, ...rest}) => (
	<div {...rest} className={classNames(css.tab, className, {[css.tabActive]: active})} role="tab" aria-selected={active}>
		{label}
	</div>
);
TabChipBase.propTypes = {active: PropTypes.bool, className: PropTypes.string, id: PropTypes.string, label: PropTypes.string};
const TabChip = Spottable(TabChipBase);

// --- Person row (Followers / Following) ---
const PersonRowBase = ({person, className, ...rest}) => (
	<div {...rest} className={classNames(css.person, className)} role="listitem">
		<span
			className={css.personAvatar}
			style={{background: person.avatar_url ? 'transparent' : gradientFor(person.handle || person.display_name)}}
		>
			{person.avatar_url ? <img src={resolveAssetUrl(person.avatar_url)} alt="" /> : initialsFor(person.display_name || person.handle)}
		</span>
		<div className={css.personInfo}>
			<div className={css.personName}>{person.display_name || person.handle}</div>
			{(person.role || person.handle) && <div className={css.personRole}>{person.role || ('@' + person.handle)}</div>}
		</div>
		<span className={classNames(css.followBtn, {[css.followingBtn]: person.is_following})}>
			{person.is_following ? Strings.profile.followingBtn() : Strings.profile.follow()}
		</span>
	</div>
);
PersonRowBase.propTypes = {className: PropTypes.string, person: PropTypes.object.isRequired};
const PersonRow = Spottable(PersonRowBase);

const UsageBar = ({icon, label, used, total, percent}) => {
	const filled = percent != null ? percent : 0;
	return (
		<div className={css.usageRow}>
			<div className={css.usageHead}>
				<span className={css.usageLabel}>{icon} {label}</span>
				{(used != null || total != null) && (
					<span className={css.usageValue}>{used}{total != null ? ` / ${total}` : ''}</span>
				)}
			</div>
			<div className={css.usageTrack}><div className={css.usageFill} style={{width: `${filled}%`}} /></div>
			{percent != null && <div className={css.usageNote}>{Strings.profile.remaining((100 - filled) + '%')}</div>}
		</div>
	);
};
UsageBar.propTypes = {
	icon: PropTypes.string, label: PropTypes.string,
	percent: PropTypes.number, total: PropTypes.string, used: PropTypes.string
};

const ProfilePanelBase = (props) => {
	const user = useAuthStore((s) => s.user);
	const logout = useAuthStore((s) => s.logout);
	const pushView = useAppStore((s) => s.pushView);
	const switchRoot = useAppStore((s) => s.switchRoot);
	const notify = useAppStore((s) => s.notify);

	const [profile, setProfile] = useState(null);
	const [watchlist, setWatchlist] = useState([]);
	const [history, setHistory] = useState([]);
	const [followers, setFollowers] = useState([]);
	const [following, setFollowing] = useState([]);
	const [tab, setTab] = useState('about');
	const [isLoading, setIsLoading] = useState(true);

	const isGuest = user?.is_guest || !user;
	const persistence = useViewPersistence();

	useEffect(() => {
		telemetry.trackScreenView('profile');
		if (isGuest) { setIsLoading(false); return; }

		(async () => {
			// Each source is independent and non-fatal — a robust profile still
			// renders if some endpoints are missing.
			const settle = (req) => req.then((v) => v).catch(() => null);
			const [prof, wl, hist, fol, fols] = await Promise.all([
				settle(userApi.getProfile()),
				settle(userApi.getWatchlist()),
				settle(userApi.getHistory()),
				settle(userApi.getFollowers()),
				settle(userApi.getFollowing())
			]);
			setProfile(prof || null);
			setWatchlist(asItems(wl));
			setHistory(asItems(hist));
			setFollowers(asItems(fol));
			setFollowing(asItems(fols));
			setIsLoading(false);
		})();
	}, [isGuest]);

	const handleSelect = useCallback((item) => {
		if (item.is_live || item.isLive) pushView('player', {contentId: item.id});
		else pushView('content-detail', {contentId: item.id});
	}, [pushView]);

	const handleLogout = async () => {
		await logout();
		notify('Signed out', {type: 'success'});
		switchRoot('home');
	};

	if (isGuest) {
		return (
			<Panel {...props} className={css.panel}>
				<Scroller {...persistence.scrollerProps} direction="vertical" verticalScrollbar="hidden" className={css.content}>
					<header className={css.header}>
						<div className={css.avatar}><span>{(user?.display_name || 'D')[0].toUpperCase()}</span></div>
						<div className={css.info}>
							<h1 className={css.name}>{Strings.profile.guest()}</h1>
							<div className={css.actions}>
								<Button onClick={() => pushView('login')}>{Strings.signIn()}</Button>
							</div>
						</div>
					</header>
					<div className={css.guestPrompt}>
						<h2 className={css.promptTitle}>{Strings.profile.guestPromptTitle()}</h2>
						<p className={css.promptMessage}>{Strings.profile.guestPromptMessage()}</p>
					</div>
				</Scroller>
			</Panel>
		);
	}

	// Merge the rich profile over the basic user, tolerating both shapes.
	const p = {...(user || {}), ...(profile || {})};
	const name = p.display_name || p.handle || Strings.appName();
	const role = p.role || p.creator_type || p.title;
	const location = p.location || p.city;
	const followersN = num(p.followers_count ?? p.followers ?? p.counts?.followers) ?? followers.length;
	const followingN = num(p.following_count ?? p.following ?? p.counts?.following) ?? following.length;
	const bio = p.bio || p.about;
	const interests = Array.isArray(p.interests) ? p.interests : [];
	const collection = asItems(p.collection);
	const contentItems = [...watchlist, ...history];
	const usage = p.usage || {};
	const storagePct = pct(usage.storage_used, usage.storage_total) ?? num(usage.storage_pct);
	const streamPct = pct(usage.livestream_used, usage.livestream_total) ?? num(usage.livestream_pct);
	const hasUsage = storagePct != null || streamPct != null || usage.storage_label;

	const TABS = [
		{id: 'about',      label: Strings.profile.tabAbout()},
		{id: 'content',    label: Strings.profile.tabContent()},
		{id: 'collection', label: Strings.profile.tabCollection()},
		{id: 'followers',  label: Strings.profile.followers()},
		{id: 'following',  label: Strings.profile.following()}
	];

	const avatarUrl = p.avatar_url || p.avatar;
	const avatarStyle = avatarUrl ?
		{backgroundImage: `url(${resolveAssetUrl(avatarUrl)})`, backgroundSize: 'cover', backgroundPosition: 'center'} :
		null;

	return (
		<Panel {...props} className={css.panel}>
			<Scroller {...persistence.scrollerProps} direction="vertical" verticalScrollbar="hidden" className={css.content}>
				<header className={css.header}>
					<div className={css.avatar} style={avatarStyle}>
						{!avatarUrl && <span>{initialsFor(name)}</span>}
					</div>
					<div className={css.info}>
						<h1 className={css.name}>{name}</h1>
						{role && <div className={css.role}>{role}</div>}
						<div className={css.statsRow}>
							{location && <span className={css.stat}><span className={css.pin}>◍</span> {location}</span>}
							{location && <span className={css.dot} />}
							<span className={css.stat}><b>{compact(followersN)}</b> {Strings.profile.followers()}</span>
							<span className={css.dot} />
							<span className={css.stat}><b>{compact(followingN)}</b> {Strings.profile.following()}</span>
						</div>
						<div className={css.actions}>
							<Button onClick={() => pushView('settings')}>{Strings.profile.settings()}</Button>
							<Button onClick={handleLogout}>{Strings.signOut()}</Button>
						</div>
					</div>
				</header>

				{hasUsage && (
					<div className={css.usageCard}>
						<UsageBar icon="▦" label={Strings.profile.storageUsage()} used={usage.storage_used_label} total={usage.storage_total_label} percent={storagePct} />
						<UsageBar icon="◉" label={Strings.profile.livestreamUsage()} used={usage.livestream_used_label} total={usage.livestream_total_label} percent={streamPct} />
					</div>
				)}

				<div className={css.tabs} role="tablist">
					{TABS.map((t) => (
						<TabChip key={t.id} id={t.id} label={t.label} active={tab === t.id} spotlightId={`ptab-${t.id}`} onClick={() => setTab(t.id)} />
					))}
				</div>

				{isLoading ? (
					<div className={css.loading}><div className={css.spinner} /></div>
				) : (
					<div className={css.tabContent}>
						{tab === 'about' && (
							<div className={css.aboutCard}>
								<h2 className={css.aboutTitle}>{Strings.profile.about()}</h2>
								<p className={css.bio}>{bio || Strings.profile.guestPromptMessage()}</p>
								{interests.length > 0 && (
									<div className={css.interests}>
										{interests.map((i, idx) => <span key={idx} className={css.interest}>{i}</span>)}
									</div>
								)}
							</div>
						)}

						{tab === 'content' && (
							contentItems.length > 0 ? (
								<div className={css.grid}>
									{contentItems.map((item, i) => (
										<ContentCard key={item.id || i} {...toCardProps(item)} size="medium" onSelect={() => handleSelect(item)} />
									))}
								</div>
							) : <div className={css.emptyTab}>{Strings.profile.noContent()}</div>
						)}

						{tab === 'collection' && (
							collection.length > 0 ? (
								<div className={css.grid}>
									{collection.map((item, i) => (
										<ContentCard key={item.id || i} {...toCardProps(item)} size="medium" onSelect={() => handleSelect(item)} />
									))}
								</div>
							) : <div className={css.emptyTab}>{Strings.profile.noCollection()}</div>
						)}

						{tab === 'followers' && (
							followers.length > 0 ? (
								<div className={css.people}>
									{followers.map((person, i) => <PersonRow key={person.id || person.handle || i} person={person} />)}
								</div>
							) : <div className={css.emptyTab}>{Strings.profile.noPeople()}</div>
						)}

						{tab === 'following' && (
							following.length > 0 ? (
								<div className={css.people}>
									{following.map((person, i) => <PersonRow key={person.id || person.handle || i} person={person} />)}
								</div>
							) : <div className={css.emptyTab}>{Strings.profile.noPeople()}</div>
						)}
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
