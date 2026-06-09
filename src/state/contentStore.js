/**
 * Dousic — Content state store
 *
 * Caches feed data to survive quick navigation (leave and return to Home
 * without re-fetching). Cache entries have a 2-minute TTL.
 */

import {create} from 'zustand';
import {content} from '../services/api';
import telemetry from '../platform/telemetry';

const CACHE_TTL = 2 * 60 * 1000;

const isStale = (cached) => {
	if (!cached) return true;
	return Date.now() - cached.fetchedAt > CACHE_TTL;
};

export const useContentStore = create((set, get) => ({
	home: null,
	featured: null,
	live: null,
	browse: null,
	viewerCounts: {}, // {contentId: count}
	isLoadingHome: false,
	isLoadingLive: false,
	isLoadingBrowse: false,
	error: null,

	// ----- Home feed -----

	loadHome: async (force = false) => {
		const cached = get().home;
		if (!force && !isStale(cached)) return cached.data;

		set({isLoadingHome: true, error: null});
		try {
			const data = await content.getHome();
			set({
				home: {data, fetchedAt: Date.now()},
				isLoadingHome: false
			});
			return data;
		} catch (err) {
			set({error: err.message, isLoadingHome: false});
			throw err;
		}
	},

	// ----- Live streams -----

	loadLive: async (filter = {}, force = false) => {
		const cached = get().live;
		if (!force && !isStale(cached)) return cached.data;

		set({isLoadingLive: true});
		try {
			const data = await content.getLive(filter);
			set({
				live: {data, filter, fetchedAt: Date.now()},
				isLoadingLive: false
			});
			return data;
		} catch (err) {
			set({error: err.message, isLoadingLive: false});
			throw err;
		}
	},

	// ----- Browse / categories -----

	loadBrowse: async (filter = {}, force = false) => {
		const cached = get().browse;
		const sameFilter = cached && JSON.stringify(cached.filter) === JSON.stringify(filter);
		if (!force && sameFilter && !isStale(cached)) return cached.data;

		set({isLoadingBrowse: true});
		try {
			const data = await content.getBrowse(filter);
			set({
				browse: {data, filter, fetchedAt: Date.now()},
				isLoadingBrowse: false
			});
			return data;
		} catch (err) {
			set({error: err.message, isLoadingBrowse: false});
			throw err;
		}
	},

	// ----- Search -----

	search: async (query, params = {}) => {
		if (!query || query.trim().length < 2) {
			return {results: []};
		}
		try {
			const data = await content.search(query.trim(), params);
			telemetry.trackEvent('search', {query_length: query.length, result_count: data.results?.length});
			return data;
		} catch (err) {
			telemetry.captureException(err, {query});
			throw err;
		}
	},

	// ----- Content by ID (modal) -----

	getContent: async (id) => {
		return content.getById(id);
	},

	// ----- Live viewer count updates from WS -----

	updateViewerCount: (contentId, count) => {
		set((state) => ({
			viewerCounts: {...state.viewerCounts, [contentId]: count}
		}));
	},

	// ----- Invalidation -----

	invalidateHome: () => set({home: null}),
	invalidateLive: () => set({live: null}),
	invalidateAll: () => set({home: null, live: null, browse: null}),

	// ----- Memory pressure response -----
	//
	// Called from the useLowMemoryWarning hook when webOS signals memory
	// pressure. Graded response: at 'low' drop anything older than the TTL
	// (harmless — it'd refetch soon anyway). At 'critical' drop everything
	// so the TV can reclaim the heap before the OS kills us.

	dropStaleCaches: () => {
		const {home, live, browse} = get();
		const next = {};
		if (home && isStale(home)) next.home = null;
		if (live && isStale(live)) next.live = null;
		if (browse && isStale(browse)) next.browse = null;
		if (Object.keys(next).length > 0) set(next);
	},

	dropAllCaches: () => set({
		home: null,
		live: null,
		browse: null,
		viewerCounts: {}
	})
}));
