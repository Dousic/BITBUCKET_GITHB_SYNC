/**
 * Dousic — Main App Component
 *
 * Root component wrapped with Moonstone's decorator for proper:
 *   - Font rendering (LG Smart UI / Museo Sans fallback)
 *   - Spotlight spatial navigation
 *   - Touch/pointer mode detection (Magic Remote)
 *   - Panels-style navigation
 *   - Accessibility focus management
 *
 * This is the ONLY place Spotlight is imported from directly; all views
 * use Spottable() HoC or SpotlightContainerDecorator for their focusables.
 */

import {useEffect} from 'react';
import MoonstoneDecorator from '@enact/moonstone/MoonstoneDecorator';
import Spotlight from '@enact/spotlight';
import {Panels} from '@enact/moonstone/Panels';

import {useAppStore} from '../state/appStore';
import {useAuthStore} from '../state/authStore';
import {
	useDeviceInfo,
	useLocale,
	useCaptions,
	useNetwork,
	useVisibility,
	useBackKey,
	useRelaunch,
	useLowMemoryWarning,
	installGlobalBackKeyHandler
} from '../hooks/usePlatform';

import luna from '../platform/luna';
import telemetry from '../platform/telemetry';
import {installOkKeyHandler} from '../platform/okKey';
import ws from '../services/ws';
import {useContentStore} from '../state/contentStore';
import {APP_VERSION} from '../version';

// Views
import HomePanel from '../views/HomePanel';
import FeedPanel from '../views/FeedPanel';
import BrowsePanel from '../views/BrowsePanel';
import LivePanel from '../views/LivePanel';
import SearchPanel from '../views/SearchPanel';
import ProfilePanel from '../views/ProfilePanel';
import PlayerPanel from '../views/PlayerPanel';
import ContentDetailPanel from '../views/ContentDetailPanel';
import CreatorPanel from '../views/CreatorPanel';
import LoginPanel from '../views/LoginPanel';
import SettingsPanel from '../views/SettingsPanel';

// Global components
import NavBar from '../components/NavBar';
import ExitConfirmation from '../components/ExitConfirmation';
import OfflineBanner from '../components/OfflineBanner';
import NotificationHost from '../components/NotificationHost';
import ErrorBoundary from '../components/ErrorBoundary';
import BootScreen from '../components/BootScreen';

// Global back handler must be installed before any useBackKey() is registered
installGlobalBackKeyHandler();

// Global Magic Remote OK-key bridge — activates the 5-way focused element so
// OK works the same as it does under the pointer. See platform/okKey.js.
installOkKeyHandler();

const VIEW_COMPONENTS = {
	home: HomePanel,
	feed: FeedPanel,
	browse: BrowsePanel,
	live: LivePanel,
	search: SearchPanel,
	profile: ProfilePanel,
	player: PlayerPanel,
	'content-detail': ContentDetailPanel,
	creator: CreatorPanel,
	login: LoginPanel,
	settings: SettingsPanel
};

// Views where the persistent NavBar should be visible. The content-detail
// page keeps the nav (matching dousic.media, where the item page still shows
// the top nav). Only the full-screen player and the modal login hide it.
// "Shows the nav" is a UI concern, named separately from the nav stack.
const NAV_VIEWS = new Set(['home', 'feed', 'browse', 'live', 'search', 'profile', 'content-detail']);

const AppBase = () => {
	// Platform state
	const deviceInfo = useDeviceInfo();
	const locale = useLocale();
	const captions = useCaptions();
	const network = useNetwork();
	const isForeground = useVisibility();

	// App state
	const viewStack = useAppStore((s) => s.viewStack);
	const pushView = useAppStore((s) => s.pushView);
	const popView = useAppStore((s) => s.popView);
	const replaceView = useAppStore((s) => s.replaceView);
	const showExitConfirmation = useAppStore((s) => s.showExitConfirmation);
	const showExit = useAppStore((s) => s.showExit);
	const hideExit = useAppStore((s) => s.hideExit);
	const isOnRoot = useAppStore((s) => s.isOnRoot);
	const setForeground = useAppStore((s) => s.setForeground);
	const setOnline = useAppStore((s) => s.setOnline);
	const setReady = useAppStore((s) => s.setReady);
	const isReady = useAppStore((s) => s.isReady);
	const setDeviceInfo = useAppStore((s) => s.setDeviceInfo);
	const setLocale = useAppStore((s) => s.setLocale);
	const setCaptions = useAppStore((s) => s.setCaptions);

	// Auth state
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
	const authLoading = useAuthStore((s) => s.isLoading);
	const initAuth = useAuthStore((s) => s.init);

	// Boot sequence
	useEffect(() => {
		(async () => {
			// Init telemetry with device context (non-blocking)
			telemetry.init({
				release: APP_VERSION,
				environment: process.env.NODE_ENV === 'production' ? 'production' : 'development'
			});

			// Initial auth check (restores session from refresh token)
			await initAuth();

			setReady(true);
		})();

		// Cleanup on unload
		return () => telemetry.shutdown();
	}, [initAuth, setReady]);

	// Plant initial 5-way focus whenever the top-of-stack view changes.
	//
	// webOS launches the app in Magic-Remote POINTER mode with nothing
	// focused. In that state the directional (arrow) keys have no "current"
	// element to move from, so they appear dead until the user wakes the
	// pointer — exactly the "arrows don't work, cursor does" report. We force
	// 5-way mode and focus the new view's default element after it paints, so
	// the arrow keys work immediately. Moving the Magic Remote re-enables
	// pointer mode on its own, so this is non-destructive.
	const topViewName = viewStack[viewStack.length - 1]?.name;
	useEffect(() => {
		if (!isReady) return () => {};
		const raf = window.requestAnimationFrame(() => {
			try {
				Spotlight.setPointerMode(false);
				// Child panels' own mount-focus runs first (React fires child
				// effects before parent). If a panel already planted focus
				// (e.g. Search → keyboard), don't yank it back to the root.
				if (Spotlight.getCurrent()) return;
				if (!Spotlight.focus()) {
					// Nothing resolved yet (container still settling) — retry once.
					window.requestAnimationFrame(() => {
						try { Spotlight.focus(); } catch (_) { /* noop */ }
					});
				}
			} catch (_) { /* Spotlight not ready — harmless */ }
		});
		return () => window.cancelAnimationFrame(raf);
	}, [isReady, isAuthenticated, topViewName]);

	// Push device info / locale / captions into app store
	useEffect(() => {
		if (deviceInfo) setDeviceInfo(deviceInfo);
	}, [deviceInfo, setDeviceInfo]);

	useEffect(() => {
		setLocale(locale);
	}, [locale, setLocale]);
	useEffect(() => {
		setCaptions(captions);
	}, [captions, setCaptions]);

	// Track foreground/background (telemetry flush only — WS handled below)
	useEffect(() => {
		setForeground(isForeground);
		if (!isForeground) {
			telemetry.flush();
		}
	}, [isForeground, setForeground]);

	// Beacon-flush telemetry on hard suspension.
	//
	// webOS suspends the app when the user presses Home, cutting off any
	// fetch() in flight. `pagehide` + `visibilitychange:hidden` fire before
	// the suspension completes, giving us a last chance to ship buffered
	// events via sendBeacon. The regular `telemetry.flush()` above still
	// runs on visibility change for backgrounding within the app lifecycle;
	// the beacon catches the hard-suspension case specifically.
	useEffect(() => {
		const onHide = () => telemetry.flushBeacon();
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') telemetry.flushBeacon();
		};
		window.addEventListener('pagehide', onHide);
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			window.removeEventListener('pagehide', onHide);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	}, []);

	// Track network
	useEffect(() => {
		setOnline(network.connected);
	}, [network.connected, setOnline]);

	// Unified WebSocket lifecycle.
	//
	// The prior implementation split this across two effects — one keyed on
	// `isForeground`, one keyed on `isAuthenticated` — which left the socket
	// connected after logout-while-foregrounded because each effect's cleanup
	// captured stale state. This single effect is the source of truth:
	// connect iff (authenticated AND foregrounded), disconnect otherwise.
	// Today the 'feed' channel is public so the leak is benign; the day we
	// introduce private `user-{id}` / `creator-{id}` channels, the correct
	// behavior here is the difference between clean logout and a live session
	// receiving events intended for the previous user.
	useEffect(() => {
		if (isAuthenticated && isForeground) {
			ws.connect();
		} else {
			ws.disconnect();
		}
	}, [isAuthenticated, isForeground]);

	// Deep linking from launch params
	useEffect(() => {
		const params = luna.getLaunchParams();
		if (params.contentTarget || params.contentId) {
			const id = params.contentTarget || params.contentId;
			pushView('player', {contentId: id, deepLink: true});
			telemetry.trackEvent('deep_link_open', {content_id: id, source: 'launch'});
		}
	}, [pushView]);

	// Relaunch handling
	useRelaunch((params) => {
		if (params.contentTarget || params.contentId) {
			const id = params.contentTarget || params.contentId;
			replaceView('player', {contentId: id, deepLink: true});
			telemetry.trackEvent('deep_link_open', {content_id: id, source: 'relaunch'});
		}
	});

	// Memory pressure response — LG certification expects apps to shed
	// cached data when the system signals memory pressure. Graded response:
	// drop stale caches at 'low', drop everything at 'critical'.
	useLowMemoryWarning((level) => {
		const store = useContentStore.getState();
		telemetry.trackEvent('low_memory_warning', {level});
		if (level === 'critical') {
			store.dropAllCaches();
		} else {
			store.dropStaleCaches();
		}
	});

	// Back key handling (priority: modal > pop stack > exit confirm)
	useBackKey(() => {
		// Exit confirmation is handled by its own useBackKey
		if (!isOnRoot()) {
			popView();
			return true;
		}
		// On root: show exit confirmation
		showExit();
		return true;
	}, !showExitConfirmation);

	// Route to current view
	const currentView = viewStack[viewStack.length - 1];

	if (!isReady || authLoading) {
		return <BootScreen />;
	}

	// If not authenticated and not already on login, gate to login.
	//
	// This branch renders outside the Panels view-stack, but the App-level
	// back-key handler (registered above) still runs: on the login gate the
	// stack is at root, so Back triggers showExit(). We must therefore render
	// ExitConfirmation here too — otherwise Back would flip the exit state with
	// nothing on screen to confirm it, leaving the remote apparently dead.
	if (!isAuthenticated && currentView.name !== 'login') {
		return (
			<ErrorBoundary>
				<LoginPanel />
				{!network.connected && <OfflineBanner />}
				{showExitConfirmation && <ExitConfirmation onCancel={hideExit} />}
				<NotificationHost />
			</ErrorBoundary>
		);
	}

	// Render only the top-of-stack panel. The previous implementation mapped
	// over the entire viewStack and rendered every panel inside <Panels>;
	// after a session like home → content-detail → player → creator that
	// leaves four full view trees alive simultaneously, in direct tension
	// with the `requiredMemory: 256` declaration in appinfo.json. Cert
	// review may not flag this directly, but real-hardware OOMs on 2019
	// TVs would. (Audit H6.)
	//
	// We keep <Panels noCloseButton index={0}> with a single child rather
	// than removing Panels entirely, so existing styling and the panel-
	// transition class (handled by Moonstone) continue to work.
	//
	// NavBar is rendered at App level (outside Panels) rather than inside
	// each panel. Otherwise the H6 unmount-on-switch would also unmount
	// the NavBar, destroying its NavItem instances and losing focus on
	// the item the user just clicked. Lifting it here is layout-clean
	// because NavBar uses `position: fixed` — panel `.content` blocks
	// already reserve the left gutter via `margin-left: @nav-width-collapsed`.
	const CurrentComponent = VIEW_COMPONENTS[currentView.name] || HomePanel;
	const showNav = NAV_VIEWS.has(currentView.name);

	return (
		<ErrorBoundary>
			{showNav && <NavBar />}
			<Panels noCloseButton index={0}>
				<CurrentComponent
					key={`${currentView.name}-${viewStack.length - 1}`}
					{...currentView.params}
				/>
			</Panels>

			{!network.connected && <OfflineBanner />}
			{showExitConfirmation && <ExitConfirmation onCancel={hideExit} />}
			<NotificationHost />
		</ErrorBoundary>
	);
};

AppBase.propTypes = {};

// Wrap with MoonstoneDecorator — applies theme, font rendering, Spotlight
const App = MoonstoneDecorator({
	accentColor: '#DD1C78',
	textSize: 'normal',
	skin: 'dark',
	overlay: false
}, AppBase);

export default App;
