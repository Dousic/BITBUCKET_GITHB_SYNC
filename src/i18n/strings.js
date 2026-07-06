/**
 * Dousic — String table
 *
 * Use via the $L function from @enact/i18n to translate at render time.
 * Enact's i18n system picks the right locale bundle automatically based on
 * the TV's system locale (which we read from luna://com.webos.service.settings
 * and propagate through useLocale()).
 *
 * Bundles we ship:
 *   en-US (default) — Launch region (US)
 *   es-419 (Latin American Spanish) — Phase 3 market rollout
 *   ko-KR — LG's home market (Korea), Phase 4 market rollout
 *
 * Adding a new bundle: create src/i18n/<locale>/strings.json following the
 * same key structure and Enact's ResourceBundle will pick it up.
 *
 * Keys follow a screen.thing.state convention. When adding new strings,
 * keep them short — TV screens read at 10-foot distance and long labels
 * get truncated.
 */

import $L from '@enact/i18n/$L';

export default {
	// Shared
	appName:        () => $L('Dousic'),
	tagline:        () => $L('Universal Media Platform for Creators'),
	back:           () => $L('Back'),
	cancel:         () => $L('Cancel'),
	confirm:        () => $L('Confirm'),
	retry:          () => $L('Try again'),
	loading:        () => $L('Loading'),
	error:          () => $L('Something went wrong'),
	nothingHere:    () => $L('Nothing here yet'),
	signIn:         () => $L('Sign in'),
	signOut:        () => $L('Sign out'),
	continueGuest:  () => $L('Continue as guest'),
	// Marketplace price labels (mirrors dousic.media/market).
	free:           () => $L('Free'),

	// Nav
	nav: {
		home:    () => $L('Home'),
		feed:    () => $L('Feed'),
		browse:  () => $L('Browse'),
		live:    () => $L('Live'),
		search:  () => $L('Search'),
		profile: () => $L('Profile'),
		// Used as aria-label on the <nav> element. webOS Audio Guidance
		// (accessibility.supportsAudioGuidance: true in appinfo) reads
		// this to announce the navigation region.
		primaryAria: () => $L('Primary navigation')
	},

	// Home
	home: {
		featured:          () => $L('Featured'),
		continueWatching:  () => $L('Continue watching'),
		liveNow:           () => $L('Live now'),
		douStitch:         () => $L('Dou-Stitch Live broadcasts'),
		featuredCreators:  () => $L('Featured creators'),
		trending:          () => $L('Trending this week'),
		newReleases:       () => $L('New releases'),
		play:              () => $L('Play'),
		watchLive:         () => $L('Watch live'),
		moreInfo:          () => $L('More info')
	},

	// Marketplace filters (Media Types · Genres · Vibes) — mirrors dousic.media
	filters: {
		media:   () => $L('Media Types'),
		genre:   () => $L('Genres'),
		vibe:    () => $L('Vibes'),
		clear:   () => $L('Clear filters'),
		results: (n) => $L('{count} results').replace('{count}', n),
		empty:   () => $L('Nothing matches these filters')
	},

	// Feed
	feed: {
		eyebrow:    () => $L('Discover'),
		title:      () => $L('Feed'),
		forYou:     () => $L('For You'),
		following:  () => $L('Following'),
		liveTab:    () => $L('Live'),
		local:      () => $L('Local'),
		emptyTitle: () => $L('Nothing in your feed yet'),
		emptyBody:  () => $L('Follow creators or switch tabs to see posts here.'),
		liveNow:    () => $L('Live now'),
		watching:   (n) => $L('{count} watching').replace('{count}', n)
	},

	// Browse
	browse: {
		eyebrow: () => $L('Discover'),
		title:  () => $L('Browse'),
		all:    () => $L('All'),
		music:  () => $L('Music'),
		talk:   () => $L('Talk'),
		gaming: () => $L('Gaming'),
		sports: () => $L('Sports'),
		news:   () => $L('News'),
		film:   () => $L('Film'),
		art:    () => $L('Art'),
		faith:  () => $L('Faith'),
		kids:   () => $L('Kids')
	},

	// Live
	live: {
		title:          () => $L('Live now'),
		subtitle:       (n) => $L('{count} creators streaming right now').replace('{count}', n),
		emptyTitle:     () => $L('No creators live right now'),
		emptyMessage:   () => $L('Check back soon — creators go live throughout the day.'),
		viewersWatching: (n) => $L('{count} watching').replace('{count}', n)
	},

	// Search
	search: {
		title:        () => $L('Search'),
		placeholder:  () => $L('Type to search…'),
		space:        () => $L('Space'),
		del:          () => $L('Delete'),
		clear:        () => $L('Clear'),
		searching:    () => $L('Searching…'),
		emptyResults: (q) => $L('No results for "{query}"').replace('{query}', q)
	},

	// Profile
	profile: {
		guest:           () => $L('Guest'),
		watchlist:       () => $L('Your watchlist'),
		recentlyWatched: () => $L('Recently watched'),
		emptyTitle:      () => $L('Your library is empty'),
		emptyMessage:    () => $L('Add content to your watchlist, and your recently watched shows up here.'),
		guestPromptTitle:   () => $L('Sign in to save your content'),
		guestPromptMessage: () => $L('Create a free account to keep a watchlist, resume across devices, and follow your favorite creators.'),
		settings:        () => $L('Settings'),
		// Complete profile (mirrors dousic.media/profile)
		followers:       () => $L('Followers'),
		following:       () => $L('Following'),
		tabAbout:        () => $L('About'),
		tabContent:      () => $L('Content'),
		tabCollection:   () => $L('Collection'),
		about:           () => $L('About'),
		interests:       () => $L('Interests'),
		storageUsage:    () => $L('Storage'),
		livestreamUsage: () => $L('Livestreaming'),
		remaining:       (p) => $L('{pct} remaining').replace('{pct}', p),
		noContent:       () => $L('No content yet'),
		noCollection:    () => $L('No collection yet'),
		noPeople:        () => $L('Nobody here yet'),
		member:          () => $L('Member'),
		follow:          () => $L('Follow'),
		followingBtn:    () => $L('Following')
	},

	// Player
	player: {
		streamUnavailable: () => $L('Stream unavailable'),
		playbackProblem:   () => $L('Playback problem'),
		liveLabel:         () => $L('LIVE'),
		pause:             () => $L('Pause'),
		play:              () => $L('Play'),
		rewind10:          () => $L('Rewind 10 seconds'),
		forward10:         () => $L('Forward 10 seconds'),
		goBack:            () => $L('Go back')
	},

	// Player error messages — surfaced by src/utils/playerErrors.js
	playerErrors: {
		network:       () => $L('Check your internet connection and try again.'),
		notFound:      () => $L('This content is temporarily unavailable.'),
		stalled:       () => $L('Playback is having trouble. Try again in a moment.'),
		unsupported:   () => $L("This video isn't supported on this TV."),
		drmNotReady:   () => $L("Protected content can't be played on this device right now."),
		geoRestricted: () => $L("This content isn't available in your region."),
		generic:       () => $L('Something went wrong playing this video.')
	},

	// Content detail
	detail: {
		resume:       () => $L('Resume'),
		watchLive:    () => $L('Watch live'),
		play:         () => $L('Play'),
		inWatchlist:  () => $L('✓ In watchlist'),
		addWatchlist: () => $L('+ Watchlist'),
		aboutCreator: () => $L('About creator'),
		creator:      () => $L('Creator'),
		relatedTitle: () => $L('You might also like'),
		notFound:     () => $L('Content not found')
	},

	// Creator
	creator: {
		follow:      () => $L('Follow'),
		following:   () => $L('✓ Following'),
		// Transient toast messages — distinct from the button label `following()`
		// above. Surfaced when the user toggles follow state on a creator.
		notifyFollow:    () => $L('Following'),
		notifyUnfollow:  () => $L('Unfollowed'),
		followers:   (n) => $L('{count} followers').replace('{count}', n),
		posts:       (n) => $L('{count} posts').replace('{count}', n),
		liveNow:     () => $L('Live now'),
		latest:      () => $L('Latest'),
		popular:     () => $L('Popular'),
		notFound:    () => $L('Creator not found')
	},

	// Login
	login: {
		title:        () => $L('Sign in to Dousic'),
		step1:        () => $L('On your phone or computer, visit'),
		pairUrl:      () => 'dousic.media/pair',
		step2:        () => $L('Enter this code:'),
		gettingCode:  () => $L('Getting code…'),
		waiting:      () => $L('Waiting for sign-in'),
		expiresIn:    (t) => $L('Code expires in {time}').replace('{time}', t),
		success:      () => $L('Signed in successfully'),
		expired:      () => $L('Code expired.'),
		newCode:      () => $L('Get a new code'),
		orDivider:    () => $L('or'),
		guestNote:    () => $L('Explore content without signing in. You can sign in later.'),
		errorTitle:   () => $L('Could not get pairing code')
	},

	// Settings
	settings: {
		title:            () => $L('Settings'),
		sectionAccount:   () => $L('Account'),
		sectionPlayback:  () => $L('Playback'),
		sectionApp:       () => $L('App'),
		sectionAbout:     () => $L('About'),
		signedInAs:       () => $L('Signed in as'),
		captionsLabel:    () => $L('Captions'),
		captionsOnFromTV: () => $L('On (from TV settings)'),
		captionsOffFromTV: () => $L('Off (from TV settings)'),
		language:         () => $L('Language'),
		region:           () => $L('Region'),
		clearCache:       () => $L('Clear cache'),
		cacheCleared:     () => $L('Cache cleared'),
		version:          () => $L('Version'),
		tvModel:          () => $L('TV model'),
		webOSVersion:     () => $L('webOS version'),
		footer:           () => $L('Dousic Media Group LLC · dousic.media · support@dousic.media'),
		platformNote:     () => $L('Captions and language follow your TV system settings. Change them in your LG TV\u2019s Settings menu.')
	},

	// Exit confirmation
	exit: {
		title:   () => $L('Exit Dousic?'),
		message: () => $L('You can always come back. Your watch history and preferences are saved.'),
		stay:    () => $L('Keep watching'),
		exit:    () => $L('Exit')
	},

	// Offline
	offline: {
		banner: () => $L('You\u2019re offline. Reconnecting…')
	},

	// Error boundary
	errorBoundary: {
		title:   () => $L('We hit a snag.'),
		message: () => $L('Dousic ran into an unexpected error. We\u2019ve logged it and are looking into it.'),
		retry:   () => $L('Try again')
	}
};
