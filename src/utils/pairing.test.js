/**
 * Dousic — pairing-poll classifier tests
 *
 * Locks the success / pending / terminal / transient decision boundaries so
 * the login-panel polling can't silently regress (e.g., back to swallowing
 * every error, or — worse — treating a pending poll as a hard failure).
 */

import {classifyPairPoll, isTerminalPairError, isConnectivityError, TERMINAL_PAIR_CODES} from './pairing';

describe('classifyPairPoll', () => {
	it('treats a response with tokens as success', () => {
		expect(classifyPairPoll({result: {access_token: 'a', refresh_token: 'r', user: {id: 1}}})).toBe('success');
		expect(classifyPairPoll({result: {user: {id: 1}}})).toBe('success');
	});

	it('treats a token-less 2xx as pending', () => {
		expect(classifyPairPoll({result: {status: 'pending'}})).toBe('pending');
		expect(classifyPairPoll({result: {}})).toBe('pending');
	});

	it('treats HTTP 410 Gone as terminal', () => {
		expect(classifyPairPoll({error: {status: 410}})).toBe('terminal');
	});

	it('treats explicit pairing error codes as terminal', () => {
		for (const code of TERMINAL_PAIR_CODES) {
			expect(classifyPairPoll({error: {status: 409, code}})).toBe('terminal');
		}
		// case-insensitive
		expect(classifyPairPoll({error: {code: 'pairing_expired'}})).toBe('terminal');
	});

	it('treats network/timeout failures as transient (keep polling)', () => {
		expect(classifyPairPoll({error: {status: 0, code: 'NETWORK'}})).toBe('transient');
		expect(classifyPairPoll({error: {status: 0, code: 'TIMEOUT'}})).toBe('transient');
	});

	it('treats unrecognized 4xx/5xx as transient (conservative — keep polling)', () => {
		expect(classifyPairPoll({error: {status: 404}})).toBe('transient');
		expect(classifyPairPoll({error: {status: 425}})).toBe('transient');
		expect(classifyPairPoll({error: {status: 500}})).toBe('transient');
	});

	it('defaults to transient when given nothing', () => {
		expect(classifyPairPoll()).toBe('transient');
		expect(classifyPairPoll({})).toBe('transient');
	});
});

describe('isTerminalPairError', () => {
	it('is false for missing or non-terminal errors', () => {
		expect(isTerminalPairError()).toBe(false);
		expect(isTerminalPairError({status: 500})).toBe(false);
		expect(isTerminalPairError({status: 0, code: 'NETWORK'})).toBe(false);
	});
});

describe('isConnectivityError', () => {
	it('flags only unreachable-server failures', () => {
		expect(isConnectivityError({status: 0, code: 'NETWORK'})).toBe(true);
		expect(isConnectivityError({status: 0, code: 'TIMEOUT'})).toBe(true);
		expect(isConnectivityError({status: 503})).toBe(false); // server answered
		expect(isConnectivityError()).toBe(false);
	});
});
