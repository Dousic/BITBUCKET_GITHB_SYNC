/**
 * Dousic — React hooks for webOS platform features
 */
/* eslint-env browser */

import {useEffect, useRef, useState, useCallback} from 'react';
import luna from '../platform/luna';

// ---------------------------------------------------------------------------
// useDeviceInfo
// ---------------------------------------------------------------------------

export const useDeviceInfo = () => {
	const [info, setInfo] = useState(null);

	useEffect(() => {
		let mounted = true;
		luna.getDeviceInfo().then((data) => {
			if (mounted) setInfo(data);
		});
		return () => {
			mounted = false;
		};
	}, []);

	return info;
};

// ---------------------------------------------------------------------------
// useLocale
// ---------------------------------------------------------------------------

export const useLocale = () => {
	const [locale, setLocale] = useState(() =>
		typeof navigator !== 'undefined' ? navigator.language : 'en-US'
	);

	useEffect(() => {
		let mounted = true;
		luna.getSystemLocale().then((loc) => {
			if (mounted) setLocale(loc);
		});
		return () => {
			mounted = false;
		};
	}, []);

	return locale;
};

// ---------------------------------------------------------------------------
// useCaptions
// ---------------------------------------------------------------------------

export const useCaptions = () => {
	const [prefs, setPrefs] = useState({enabled: false, language: null});

	useEffect(() => {
		let mounted = true;
		luna.getCaptionsPreference().then((p) => {
			if (mounted) setPrefs(p);
		});
		const unsub = luna.subscribeToCaptions((p) => {
			if (mounted) setPrefs(p);
		});
		return () => {
			mounted = false;
			unsub();
		};
	}, []);

	return prefs;
};

// ---------------------------------------------------------------------------
// useNetwork
// ---------------------------------------------------------------------------

export const useNetwork = () => {
	const [netStatus, setNetStatus] = useState({
		connected: typeof navigator !== 'undefined' ? !!navigator.onLine : true,
		wired: false,
		wifi: false
	});

	useEffect(() => {
		let mounted = true;
		luna.getNetworkStatus().then((s) => {
			if (mounted) setNetStatus(s);
		});
		const unsub = luna.subscribeToNetwork((s) => {
			if (mounted) setNetStatus(s);
		});
		return () => {
			mounted = false;
			unsub();
		};
	}, []);

	return netStatus;
};

// ---------------------------------------------------------------------------
// useVisibility
// ---------------------------------------------------------------------------

export const useVisibility = () => {
	const [isForeground, setForeground] = useState(true);

	useEffect(() => {
		const unsub = luna.onVisibilityChange((state) => {
			setForeground(state === 'foreground');
		});
		return unsub;
	}, []);

	return isForeground;
};

// ---------------------------------------------------------------------------
// useVolume (read-only)
// ---------------------------------------------------------------------------

export const useVolume = () => {
	const [state, setState] = useState({volume: 50, muted: false});

	useEffect(() => {
		let mounted = true;
		const unsub = luna.subscribeToVolume((s) => {
			if (mounted) setState(s);
		});
		return () => {
			mounted = false;
			unsub();
		};
	}, []);

	return state;
};

// ---------------------------------------------------------------------------
// useBackKey — centralized Back-button handler with priority stack
// ---------------------------------------------------------------------------

const backHandlerStack = [];

export const useBackKey = (handler, enabled = true) => {
	const handlerRef = useRef(handler);
	handlerRef.current = handler;

	useEffect(() => {
		if (!enabled) return;

		const entry = {
			handler: () => handlerRef.current?.(),
			id: Math.random()
		};
		backHandlerStack.push(entry);

		return () => {
			const idx = backHandlerStack.indexOf(entry);
			if (idx !== -1) backHandlerStack.splice(idx, 1);
		};
	}, [enabled]);
};

// Install single global listener, dispatches to top of stack
let _backKeyInstalled = false;
export const installGlobalBackKeyHandler = () => {
	if (_backKeyInstalled) return;
	_backKeyInstalled = true;

	// TV remote keys that the app does not assign meaningful behavior to.
	// Without explicit handling, default webOS behavior can surface
	// unexpected UI (e.g., channel-up banner over the app). Swallowing
	// them quietly makes the app feel deliberate on cert review.
	//
	// Key names per LG webOS TV Developer keyboard-key reference:
	//   ColorF0 (Red), ColorF1 (Green), ColorF2 (Yellow), ColorF3 (Blue)
	//   ChannelUp / ChannelDown
	//   Digit0-Digit9 / 0-9
	const IGNORED_KEYS = new Set([
		'ColorF0', 'ColorF1', 'ColorF2', 'ColorF3',
		'ChannelUp', 'ChannelDown',
		'0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
	]);
	// Matching keyCodes as a fallback for remotes that don't set .key
	const IGNORED_KEYCODES = new Set([
		403, 404, 405, 406,         // color buttons
		427, 428,                   // channel up/down
		48, 49, 50, 51, 52, 53, 54, 55, 56, 57  // digits 0-9
	]);

	const onKeyDown = (e) => {
		// Swallow ignored keys when we're NOT in a text input (user may be
		// typing numbers in a search box)
		const target = e.target;
		const isInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
		if (!isInput && (IGNORED_KEYS.has(e.key) || IGNORED_KEYCODES.has(e.keyCode))) {
			e.preventDefault();
			e.stopPropagation();
			return;
		}

		const isBack =
			e.key === 'Backspace' ||
			e.key === 'GoBack' ||
			e.keyCode === 461 ||
			e.keyCode === 10009;

		if (!isBack) return;

		// Don't intercept in text inputs
		if (isInput) return;

		// Run top handler; if it returns true, event is consumed
		const topEntry = backHandlerStack[backHandlerStack.length - 1];
		if (topEntry) {
			const result = topEntry.handler();
			if (result === true) {
				e.preventDefault();
				e.stopPropagation();
			}
		}
	};

	window.addEventListener('keydown', onKeyDown, true);
};

// ---------------------------------------------------------------------------
// useRelaunch
// ---------------------------------------------------------------------------

export const useRelaunch = (callback) => {
	const callbackRef = useRef(callback);
	callbackRef.current = callback;

	useEffect(() => {
		return luna.onRelaunch((params) => {
			callbackRef.current?.(params);
		});
	}, []);
};

// ---------------------------------------------------------------------------
// useScreensaverControl — block/allow during video playback
// ---------------------------------------------------------------------------

export const useScreensaverControl = (shouldBlock) => {
	useEffect(() => {
		if (shouldBlock) {
			luna.blockScreensaver();
			return () => luna.allowScreensaver();
		}
	}, [shouldBlock]);
};

// ---------------------------------------------------------------------------
// useLowMemoryWarning — subscribe to webOS low-memory events
// ---------------------------------------------------------------------------
//
// webOS fires `webOSLowMemory` on the document when system memory is
// constrained. LG certification expects apps to release cached resources
// in response — on 256MB models (webOS 3.x / early 4.x) the alternative
// is being killed by the OS. Event detail typically contains a level
// field ("normal" | "low" | "critical").
//
// Usage:
//   useLowMemoryWarning((level) => {
//     if (level === 'critical') contentStore.clearAllCaches();
//     else if (level === 'low') contentStore.clearStaleCaches();
//   });

export const useLowMemoryWarning = (onWarn) => {
	const handlerRef = useRef(onWarn);
	handlerRef.current = onWarn;

	useEffect(() => {
		if (typeof document === 'undefined') return;

		const handler = (evt) => {
			// webOS attaches level to event.detail.state or event.detail.level
			// depending on firmware version. Try both, default to 'low'.
			const detail = evt.detail || {};
			const level = detail.state || detail.level || 'low';
			handlerRef.current?.(level, detail);
		};

		document.addEventListener('webOSLowMemory', handler);
		return () => document.removeEventListener('webOSLowMemory', handler);
	}, []);
};
