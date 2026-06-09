/**
 * Dousic — useViewPersistence
 *
 * Preserves scroll position and Spotlight focus across the unmount/remount
 * cycle introduced by App.js's top-of-stack rendering (audit H6). Without
 * this hook, navigating Home → ContentDetail → Back leaves Home scrolled
 * to the top with focus reset to its default-element — the visible cost of
 * H6's memory savings. With it, Home (or any view) returns to exactly the
 * scroll position and focused card the user left.
 *
 * Mechanism
 * ---------
 *   At mount: read this view's saved state (keyed by frameId from appStore)
 *     and apply scrollTop and focused spotlightId after a double-RAF so
 *     layout is settled before we touch positioning.
 *   At unmount: write the current scrollTop and the last spotlightId seen
 *     on document.focusin to appStore.viewState[frameId].
 *
 * Why double-RAF
 * --------------
 *   On the first paint after mount, the Scroller has its initial dimensions
 *   but its internal scroll math may not have settled yet — calling scrollTo
 *   too early can clamp to 0. Yielding to two animation frames is a
 *   conservative way to ensure layout + measurement are both done.
 *
 * Why a focusin listener (rather than reading Spotlight.getCurrent on unmount)
 * --------------------------------------------------------------------------
 *   By the time React's unmount cleanup runs, the active element may have
 *   already shifted as part of the tree teardown, returning either null or
 *   a stale reference. Tracking focusin events continuously gives us the
 *   last KNOWN focus before unmount began.
 *
 * Why stable spotlight IDs matter
 * -------------------------------
 *   Spottable auto-generates internal IDs for hosts without an explicit
 *   spotlightId prop. Those IDs are NOT stable across remounts. Cards must
 *   be passed a stable spotlightId (derived from item.id) for restoration
 *   to land on the same card. See ContentCard.js for the wrapper that does
 *   this automatically.
 *
 * Usage
 * -----
 *   const persistence = useViewPersistence();
 *   return (
 *     <Scroller {...persistence.scrollerProps} direction="vertical" ...>
 *       ...
 *     </Scroller>
 *   );
 *
 *   For panels without a Scroller (just focus persistence), the hook still
 *   restores focus correctly — scrollerProps just don't get used.
 */
/* eslint-env browser */

import {useCallback, useEffect, useRef, useState} from 'react';
import Spotlight from '@enact/spotlight';
import {useAppStore} from '../state/appStore';

export const useViewPersistence = () => {
	const scrollerRef = useRef(null);
	const scrollTopRef = useRef(0);
	const lastFocusedIdRef = useRef(null);

	// Capture this view's frameId at mount; it stays stable for the panel's
	// entire life. We read it via getState() rather than as a selector so
	// stack changes (e.g. a new push) don't re-run this hook with a stale
	// frame — by the time the stack changes, this panel is unmounting and
	// the cleanup function captures the right id via closure.
	const [frameId] = useState(() => {
		const stack = useAppStore.getState().viewStack;
		return stack[stack.length - 1]?.frameId || null;
	});

	// Track the last-focused spotlight ID. focusin bubbles, so a single
	// document-level listener catches focus anywhere in the tree. We use
	// the capture phase so we observe events before any potential stop-
	// propagation from descendants.
	useEffect(() => {
		if (typeof document === 'undefined') return;
		const onFocusIn = () => {
			const cur = Spotlight.getCurrent();
			if (!cur) return;
			// data-spotlight-id is the canonical DOM attribute Spottable
			// stamps for any host with a spotlightId prop.
			const id = cur.dataset?.spotlightId || cur.getAttribute?.('data-spotlight-id');
			if (id) lastFocusedIdRef.current = id;
		};
		document.addEventListener('focusin', onFocusIn, true);
		return () => document.removeEventListener('focusin', onFocusIn, true);
	}, []);

	// Restore on mount + save on unmount.
	useEffect(() => {
		if (!frameId) return;
		const saved = useAppStore.getState().getViewState(frameId);

		if (saved) {
			// Double-RAF gives layout a chance to settle. On webOS we've
			// observed Scroller.scrollTo clamping to 0 when called within
			// the same frame as mount.
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					if (saved.scrollTop != null && scrollerRef.current?.scrollTo) {
						try {
							scrollerRef.current.scrollTo({
								position: {x: 0, y: saved.scrollTop},
								animate: false
							});
						} catch (_) {
							// Best-effort; Moonstone Scroller API has shifted
							// between minor versions. Failure here just means
							// scroll stays at 0 — not a crash.
						}
					}
					if (saved.focusedId) {
						// If the element no longer exists (content changed),
						// Spotlight.focus returns false and the container's
						// `enterTo: 'default-element' | 'last-focused'` takes
						// over. Safe.
						Spotlight.focus(saved.focusedId);
					}
				});
			});
		}

		return () => {
			// Capture state at the moment cleanup runs. Both refs are
			// current values regardless of when their underlying events
			// last fired.
			useAppStore.getState().saveViewState(frameId, {
				scrollTop: scrollTopRef.current,
				focusedId: lastFocusedIdRef.current
			});
		};
	}, [frameId]);

	// Moonstone/Enact Scroller delivers onScroll differently across minor
	// versions — try the most common shapes in order. None of these throw
	// if the field is absent.
	//
	// useCallback with an empty deps array keeps the reference stable for
	// the panel's life. Without this, every render returns a new function
	// reference and the Scroller re-binds its scroll listener on each
	// render, which on long scrolls is a measurable churn.
	const onScroll = useCallback((e) => {
		const top =
			(typeof e?.scrollTop === 'number' && e.scrollTop) ||
			(typeof e?.target?.scrollTop === 'number' && e.target.scrollTop) ||
			(typeof e?.position?.y === 'number' && e.position.y) ||
			0;
		scrollTopRef.current = top;
	}, []);

	return {
		scrollerProps: {
			ref: scrollerRef,
			onScroll
		},
		frameId
	};
};

export default useViewPersistence;
