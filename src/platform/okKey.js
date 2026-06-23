/**
 * Dousic — webOS Magic Remote "OK" key bridge
 *
 * The problem
 * -----------
 * On LG TVs the Magic Remote's OK button is delivered as keyCode 16777221
 * while the pointer/cursor layer stays active. In that state Enact's Spotlight
 * routes the press to a pointer-click at the cursor location rather than
 * activating the element that 5-way navigation has focused. The user-visible
 * symptom: arrow keys move the highlight, but pressing OK does nothing unless
 * the cursor happens to be sitting on the focused element. Standard Moonstone
 * controls (Button, IconButton) are activated this way, so the player transport
 * and the exit dialog buttons all appear dead to the remote.
 *
 * The fix
 * -------
 * Own the select keys at the document-capture level: when OK (or Enter, for
 * non-webOS input) is pressed and Spotlight has a 5-way focused element,
 * synthesize a click on it and stop the event so Enact/Moonstone don't also
 * try (and fail) to route it. This is deterministic and independent of pointer
 * mode and cursor visibility, so it works the same on every TV — and it lets
 * the rails, nav, player, and dialogs share a single activation path instead
 * of each component re-implementing OK handling.
 */
/* eslint-env browser */

import Spotlight from '@enact/spotlight';

// Enter (keyboards / emulator) and the webOS Magic Remote OK button.
const SELECT_KEYS = new Set([13, 16777221]);

let installed = false;

// Don't hijack the select key inside text-entry fields — there a press should
// reach the input (e.g. submit), not synthesize a click.
const isTextEntry = (el) =>
	!!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

const handleSelectKey = (ev) => {
	if (!SELECT_KEYS.has(ev.keyCode) || ev.repeat) return;

	const target = Spotlight.getCurrent();
	if (!target || isTextEntry(target)) return;

	// We are the single source of activation for the select keys. Stop the
	// event before it reaches Spotlight/Moonstone's own (pointer-deferring)
	// handling, then click the focused element ourselves.
	ev.preventDefault();
	ev.stopPropagation();
	target.click();
};

/**
 * Install the global OK-key bridge. Idempotent and safe to call once at app
 * start (alongside installGlobalBackKeyHandler).
 */
export const installOkKeyHandler = () => {
	if (installed || typeof document === 'undefined') return;
	installed = true;
	// Capture phase so we run before Moonstone's bubble-phase React handlers
	// and can stop the press from being routed to the pointer.
	document.addEventListener('keydown', handleSelectKey, true);
};

export default installOkKeyHandler;
