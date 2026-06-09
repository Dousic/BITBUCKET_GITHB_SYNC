/* eslint-env browser, jest */
/**
 * Dousic — authStore tests
 *
 * Verifies the happy-path transitions:
 *   - init() with no refresh token → unauthenticated
 *   - init() with valid refresh token → authenticated
 *   - login() → authenticated
 *   - logout() → unauthenticated + token clear
 *   - continueAsGuest() → authenticated with is_guest=true
 *
 * api.js is mocked — these tests verify the store logic, not the network layer.
 */

import {useAuthStore} from '../state/authStore';

// Mock the api module before importing authStore
jest.mock('../services/api', () => {
	const mockAuth = {
		login: jest.fn(),
		loginWithCode: jest.fn(),
		continueAsGuest: jest.fn(),
		me: jest.fn(),
		logout: jest.fn()
	};
	return {
		__esModule: true,
		default: {auth: mockAuth},
		auth: mockAuth,
		onAuthChange: jest.fn(() => () => {}),
		clearTokens: jest.fn(),
		refreshAccessToken: jest.fn()
	};
});

jest.mock('../platform/telemetry', () => ({
	__esModule: true,
	default: {
		setUser: jest.fn(),
		clearUser: jest.fn(),
		trackEvent: jest.fn()
	}
}));

import api, {auth, refreshAccessToken, clearTokens} from '../services/api';
import telemetry from '../platform/telemetry';

describe('authStore', () => {
	beforeEach(() => {
		// Reset store state between tests
		useAuthStore.setState({
			user: null,
			isAuthenticated: false,
			isLoading: true,
			error: null
		});
		jest.clearAllMocks();
		localStorage.clear();
	});

	describe('init()', () => {
		it('sets unauthenticated when no refresh token is stored', async () => {
			await useAuthStore.getState().init();
			const state = useAuthStore.getState();
			expect(state.isAuthenticated).toBe(false);
			expect(state.user).toBeNull();
			expect(state.isLoading).toBe(false);
			expect(refreshAccessToken).not.toHaveBeenCalled();
		});

		it('proactively refreshes then loads user when refresh token exists', async () => {
			localStorage.setItem('dousic_refresh_token', 'test_refresh');
			refreshAccessToken.mockResolvedValueOnce('new_access_token');
			auth.me.mockResolvedValueOnce({id: 'user-1', display_name: 'Test'});

			await useAuthStore.getState().init();

			expect(refreshAccessToken).toHaveBeenCalled();
			expect(auth.me).toHaveBeenCalled();
			expect(useAuthStore.getState().isAuthenticated).toBe(true);
			expect(useAuthStore.getState().user.id).toBe('user-1');
			expect(telemetry.setUser).toHaveBeenCalledWith('user-1');
		});

		it('falls back to unauthenticated when refresh fails', async () => {
			localStorage.setItem('dousic_refresh_token', 'expired');
			refreshAccessToken.mockRejectedValueOnce(new Error('REFRESH_FAILED'));

			await useAuthStore.getState().init();

			expect(clearTokens).toHaveBeenCalled();
			expect(useAuthStore.getState().isAuthenticated).toBe(false);
			expect(auth.me).not.toHaveBeenCalled();
		});
	});

	describe('login()', () => {
		it('transitions to authenticated on success', async () => {
			auth.login.mockResolvedValueOnce({id: 'user-2', display_name: 'Alice'});

			await useAuthStore.getState().login('alice@example.com', 'password123');

			const state = useAuthStore.getState();
			expect(state.isAuthenticated).toBe(true);
			expect(state.user.display_name).toBe('Alice');
			expect(state.error).toBeNull();
			expect(telemetry.trackEvent).toHaveBeenCalledWith('login_success', {method: 'password'});
		});

		it('surfaces error and stays unauthenticated on failure', async () => {
			auth.login.mockRejectedValueOnce(Object.assign(new Error('Invalid credentials'), {code: 'INVALID_CREDENTIALS'}));

			await expect(
				useAuthStore.getState().login('wrong@example.com', 'bad')
			).rejects.toThrow('Invalid credentials');

			const state = useAuthStore.getState();
			expect(state.isAuthenticated).toBe(false);
			expect(state.error).toBe('Invalid credentials');
			expect(telemetry.trackEvent).toHaveBeenCalledWith('login_failure', {reason: 'INVALID_CREDENTIALS'});
		});
	});

	describe('loginWithCode()', () => {
		it('does not enter app loading while pairing is still pending', async () => {
			useAuthStore.setState({isLoading: false});
			auth.loginWithCode.mockRejectedValueOnce(new Error('Still waiting'));

			await expect(
				useAuthStore.getState().loginWithCode('123456')
			).rejects.toThrow('Still waiting');

			const state = useAuthStore.getState();
			expect(state.isAuthenticated).toBe(false);
			expect(state.isLoading).toBe(false);
		});

		it('loads the user when pairing succeeds with tokens only', async () => {
			useAuthStore.setState({isLoading: false});
			auth.loginWithCode.mockResolvedValueOnce({access_token: 'access'});
			auth.me.mockResolvedValueOnce({id: 'user-pair', display_name: 'Paired'});

			await useAuthStore.getState().loginWithCode('123456');

			const state = useAuthStore.getState();
			expect(auth.me).toHaveBeenCalled();
			expect(state.isAuthenticated).toBe(true);
			expect(state.user.id).toBe('user-pair');
			expect(telemetry.trackEvent).toHaveBeenCalledWith('login_success', {method: 'pairing_code'});
		});
	});

	describe('continueAsGuest()', () => {
		it('creates a guest session and authenticates', async () => {
			auth.continueAsGuest.mockResolvedValueOnce({id: 'guest-1', is_guest: true, display_name: 'Guest'});

			await useAuthStore.getState().continueAsGuest();

			const state = useAuthStore.getState();
			expect(state.isAuthenticated).toBe(true);
			expect(state.user.is_guest).toBe(true);
			expect(telemetry.trackEvent).toHaveBeenCalledWith('guest_session_created');
		});
	});

	describe('logout()', () => {
		it('clears user and calls api logout', async () => {
			useAuthStore.setState({user: {id: 'user-3'}, isAuthenticated: true});
			auth.logout.mockResolvedValueOnce();

			await useAuthStore.getState().logout();

			expect(auth.logout).toHaveBeenCalled();
			expect(useAuthStore.getState().user).toBeNull();
			expect(useAuthStore.getState().isAuthenticated).toBe(false);
			expect(telemetry.clearUser).toHaveBeenCalled();
		});
	});
});
