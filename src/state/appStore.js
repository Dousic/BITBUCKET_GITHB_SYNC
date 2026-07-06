/**
 * Dousic — App navigation and UI state
 *
 * Uses a view stack rather than URL routing (URL routing is fragile on webOS
 * and webOS app lifecycle doesn't need browser history semantics).
 *
 * Root views: 'home', 'browse', 'live', 'search', 'profile'
 * Modal views: 'player', 'content-detail', 'creator', 'login', 'settings', 'exit'
 *
 * --- View persistence ---
 * Each view stack entry carries a unique `frameId`, used as the key into the
 * `viewState` map. When a panel unmounts (because a new view is pushed or the
 * stack is replaced), `useViewPersistence` writes its scroll position and
 * last-focused spotlight ID under that frameId. When the panel remounts on
 * pop, the same frameId is still on the stack and `useViewPersistence` reads
 * the saved state back. This restores the "Disney+-feel" of returning to
 * Home and finding your scroll position and focused card intact — without
 * which the H6 top-of-stack rendering optimization would feel like a
 * regression compared to the previous all-views-mounted approach.
 *
 * Cleanup invariants:
 *   - popView deletes the popped frame's state (you can't navigate back to it)
 *   - switchRoot and replaceView clear all viewState (fresh navigation context)
 *   - clearStack clears all viewState (same)
 */

import {create} from 'zustand';
import telemetry from '../platform/telemetry';

const ROOT_VIEWS = ['home', 'feed', 'browse', 'live', 'search', 'profile'];

// Unique frame ID generator. Date.now() handles cross-session uniqueness;
// the monotonic counter handles same-ms collisions (which CAN happen on
// fast devices for synchronous push sequences).
let _frameSeq = 0;
const newFrameId = () => `f_${Date.now()}_${++_frameSeq}`;

export const useAppStore = create((set, get) => ({
	// Navigation
	viewStack: [{name: 'home', params: {}, frameId: newFrameId()}],
	activeRoot: 'home',

	// View persistence: { [frameId]: { scrollTop, focusedId } }
	// Written by useViewPersistence on panel unmount; read on panel mount.
	viewState: {},

	// App lifecycle
	isForeground: true,
	isOnline: true,
	isReady: false,

	// UI state
	theme: 'dark',
	locale: 'en-US',
	country: 'unknown',
	captionsEnabled: false,
	captionsLanguage: null,
	deviceInfo: null,
	showExitConfirmation: false,

	// Toast / notifications
	notifications: [],

	// ----- Navigation actions -----

	pushView: (name, params = {}) => {
		const stack = get().viewStack;
		const newStack = [...stack, {name, params, frameId: newFrameId()}];
		telemetry.trackScreenView(name, params);
		set({viewStack: newStack});
	},

	popView: () => {
		const stack = get().viewStack;
		if (stack.length <= 1) return false;
		const popped = stack[stack.length - 1];
		const newStack = stack.slice(0, -1);
		const top = newStack[newStack.length - 1];
		// Drop the popped frame's saved state — we can no longer navigate
		// back to it, so keeping its scroll/focus around just bloats memory.
		const {[popped.frameId]: _dropped, ...remainingState} = get().viewState;
		telemetry.trackScreenView(top.name, top.params);
		set({viewStack: newStack, viewState: remainingState});
		return true;
	},

	replaceView: (name, params = {}) => {
		telemetry.trackScreenView(name, params);
		set({
			viewStack: [{name, params, frameId: newFrameId()}],
			viewState: {}
		});
	},

	switchRoot: (name) => {
		if (!ROOT_VIEWS.includes(name)) return;
		telemetry.trackScreenView(name);
		set({
			viewStack: [{name, params: {}, frameId: newFrameId()}],
			viewState: {},
			activeRoot: name
		});
	},

	clearStack: () => {
		set({
			viewStack: [{name: 'home', params: {}, frameId: newFrameId()}],
			viewState: {},
			activeRoot: 'home'
		});
	},

	// ----- View persistence helpers -----

	saveViewState: (frameId, state) => {
		if (!frameId) return;
		set((s) => {
			// Refuse to write state for a frame that's no longer in the
			// stack. This guards against the unmount-cleanup race: when
			// a panel is popped, popView deletes its viewState entry
			// synchronously, but React then unmounts the panel and the
			// cleanup function calls saveViewState — which would re-add
			// the entry we just deleted, leaking one stale frame per pop.
			// Same issue applies to switchRoot/replaceView, which wipe
			// viewState before the old panel's cleanup runs.
			const stackIds = new Set(s.viewStack.map((v) => v.frameId));
			if (!stackIds.has(frameId)) return s;
			return {viewState: {...s.viewState, [frameId]: state}};
		});
	},

	getViewState: (frameId) => {
		if (!frameId) return null;
		return get().viewState[frameId] || null;
	},

	// ----- Current view helpers -----

	getCurrentView: () => {
		const stack = get().viewStack;
		return stack[stack.length - 1];
	},

	isOnRoot: () => {
		return get().viewStack.length <= 1;
	},

	// ----- Lifecycle -----

	setForeground: (isForeground) => {
		set({isForeground});
		telemetry.trackEvent(isForeground ? 'app_foreground' : 'app_background');
	},

	setOnline: (isOnline) => {
		const wasOnline = get().isOnline;
		set({isOnline});
		if (wasOnline !== isOnline) {
			telemetry.trackEvent(isOnline ? 'network_online' : 'network_offline');
		}
	},

	setReady: (isReady) => set({isReady}),

	// ----- Platform info -----

	setDeviceInfo: (info) => set({deviceInfo: info}),
	setLocale: (locale) => set({locale}),
	setCountry: (country) => set({country}),
	setCaptions: (prefs) => set({
		captionsEnabled: prefs.enabled,
		captionsLanguage: prefs.language
	}),

	// ----- Exit confirmation -----

	showExit: () => set({showExitConfirmation: true}),
	hideExit: () => set({showExitConfirmation: false}),

	// ----- Notifications -----

	notify: (message, {duration = 3000, type = 'info'} = {}) => {
		const id = Date.now() + Math.random();
		set((state) => ({
			notifications: [...state.notifications, {id, message, type}]
		}));
		if (duration > 0) {
			setTimeout(() => {
				set((state) => ({
					notifications: state.notifications.filter((n) => n.id !== id)
				}));
			}, duration);
		}
		return id;
	},

	dismissNotification: (id) => {
		set((state) => ({
			notifications: state.notifications.filter((n) => n.id !== id)
		}));
	}
}));
