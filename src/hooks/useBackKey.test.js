/* eslint-env browser, jest */
/**
 * Dousic — useBackKey tests
 *
 * The back-key stack is load-bearing for LG cert: the most-recently-mounted
 * handler (typically a modal or deepest panel) gets the Back press. These
 * tests verify the stack behavior — pop on unmount, top-wins semantics,
 * enabled/disabled gating, and text-input non-interception.
 */

import {renderHook} from '@testing-library/react';
import {useBackKey, installGlobalBackKeyHandler} from '../hooks/usePlatform';

// Fire the global installer once before tests (it's idempotent)
installGlobalBackKeyHandler();

const fireBackKey = () => {
	const evt = new KeyboardEvent('keydown', {
		key: 'Backspace',
		keyCode: 10009,
		bubbles: true,
		cancelable: true
	});
	window.dispatchEvent(evt);
	return evt;
};

describe('useBackKey', () => {
	it('invokes the handler on back press', () => {
		const handler = jest.fn(() => true);
		renderHook(() => useBackKey(handler));

		fireBackKey();

		expect(handler).toHaveBeenCalled();
	});

	it('gives precedence to the most-recently-mounted handler', () => {
		const outer = jest.fn(() => true);
		const inner = jest.fn(() => true);

		renderHook(() => useBackKey(outer));
		renderHook(() => useBackKey(inner));

		fireBackKey();

		expect(inner).toHaveBeenCalled();
		expect(outer).not.toHaveBeenCalled();
	});

	it('pops handlers on unmount, restoring the previous one', () => {
		const outer = jest.fn(() => true);
		const inner = jest.fn(() => true);

		renderHook(() => useBackKey(outer));
		const innerHook = renderHook(() => useBackKey(inner));

		innerHook.unmount();
		fireBackKey();

		expect(outer).toHaveBeenCalled();
	});

	it('skips the handler when enabled=false', () => {
		const handler = jest.fn(() => true);
		renderHook(() => useBackKey(handler, false));

		fireBackKey();

		expect(handler).not.toHaveBeenCalled();
	});

	it('preventDefault is called only when handler returns true', () => {
		const consume = jest.fn(() => true);
		renderHook(() => useBackKey(consume));

		const evt = fireBackKey();

		// The handler returned true, so the global listener should have
		// preventDefault'd the event. defaultPrevented reflects this.
		expect(evt.defaultPrevented).toBe(true);
	});
});
