/**
 * Dousic — pairing-poll classifier
 *
 * The login panel polls `POST /auth/pair` every few seconds while the user
 * redeems the code on dousic.media/pair. Each poll has four meaningful
 * outcomes, and the panel must react differently to each:
 *
 *   success   — the code was redeemed; tokens are in the response.
 *   pending   — the server answered but the code isn't redeemed yet
 *               (a 2xx with no tokens). Keep polling, all is well.
 *   terminal  — the code can NEVER succeed (expired / invalid / revoked /
 *               denied). Stop polling and prompt for a new code.
 *   transient — a hiccup (network blip, timeout, 5xx, or an unrecognized
 *               4xx). Keep polling; the code's own expiry timer is the
 *               backstop.
 *
 * Design note — why terminal detection is deliberately conservative:
 * the backend's exact pending-vs-error contract isn't pinned down yet, and
 * historically the TV treated *any* error as "keep waiting". To avoid
 * regressing a working flow, we only declare a poll terminal on
 * unambiguous signals (HTTP 410 Gone, or an explicit pairing error code).
 * Everything else stays "transient" and polling continues. As the backend
 * codes are confirmed, add them to TERMINAL_PAIR_CODES.
 */

// Explicit backend error codes (api.js surfaces `data.code` as error.code)
// that mean the pairing attempt is dead. Matched case-insensitively.
export const TERMINAL_PAIR_CODES = new Set([
	'PAIRING_EXPIRED', 'PAIRING_INVALID', 'PAIRING_NOT_FOUND',
	'PAIRING_DENIED', 'PAIRING_REVOKED', 'PAIRING_CONSUMED',
	'CODE_EXPIRED', 'CODE_INVALID', 'CODE_NOT_FOUND', 'CODE_CONSUMED'
]);

/**
 * True if the error means the code can never be redeemed.
 * @param {{status?: number, code?: string}} [error]
 */
export const isTerminalPairError = (error) => {
	if (!error) return false;
	if (error.status === 410) return true; // Gone — code expired/consumed
	const code = typeof error.code === 'string' ? error.code.toUpperCase() : '';
	return TERMINAL_PAIR_CODES.has(code);
};

/**
 * True if the error is a connectivity failure (couldn't reach the server)
 * rather than a server-delivered response. api.js normalizes these to
 * status 0 with code NETWORK / TIMEOUT. Used to drive the "reconnecting"
 * indicator without false-flagging a reachable-but-pending server.
 * @param {{status?: number, code?: string}} [error]
 */
export const isConnectivityError = (error) =>
	!!error && (error.status === 0 || error.code === 'NETWORK' || error.code === 'TIMEOUT');

/**
 * Classify one poll attempt.
 * @param {{result?: object, error?: object}} [input]
 *   result — resolved response body (present on any 2xx)
 *   error  — thrown ApiError/AuthError (present on any non-2xx or failure)
 * @returns {'success'|'pending'|'terminal'|'transient'}
 */
export const classifyPairPoll = ({result, error} = {}) => {
	if (result && (result.access_token || result.user)) return 'success';
	if (result) return 'pending';
	if (isTerminalPairError(error)) return 'terminal';
	return 'transient';
};

export default classifyPairPoll;
