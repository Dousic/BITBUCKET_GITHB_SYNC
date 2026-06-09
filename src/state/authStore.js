/**
 * Dousic — Auth state store (Zustand)
 */
/* eslint-env browser */

import {create} from 'zustand';
import api, {auth, onAuthChange, clearTokens, refreshAccessToken} from '../services/api';
import telemetry from '../platform/telemetry';

export const useAuthStore = create((set, get) => ({
	user: null,
	isAuthenticated: false,
	isLoading: true,
	error: null,

	init: async () => {
		set({isLoading: true, error: null});
		try {
			// If we have a refresh token, proactively use it to get a fresh
			// access token BEFORE calling /auth/me. This saves one round trip
			// per cold boot (the 401-then-refresh-then-retry dance otherwise
			// costs an extra request and makes launch slower).
			const refreshToken = localStorage.getItem('dousic_refresh_token');
			if (!refreshToken) {
				set({user: null, isAuthenticated: false, isLoading: false});
				return;
			}

			try {
				await refreshAccessToken();
			} catch (_) {
				// Refresh token invalid or expired — proceed as unauthenticated.
				clearTokens();
				set({user: null, isAuthenticated: false, isLoading: false});
				return;
			}

			const user = await auth.me();
			set({user, isAuthenticated: true, isLoading: false});
			telemetry.setUser(user.id);
		} catch (_) {
			// /auth/me failed despite a fresh access token — bail to login.
			clearTokens();
			set({user: null, isAuthenticated: false, isLoading: false});
		}
	},

	login: async (email, password) => {
		set({isLoading: true, error: null});
		try {
			const user = await auth.login(email, password);
			set({user, isAuthenticated: true, isLoading: false});
			telemetry.setUser(user.id);
			telemetry.trackEvent('login_success', {method: 'password'});
			return user;
		} catch (err) {
			set({error: err.message, isLoading: false});
			telemetry.trackEvent('login_failure', {reason: err.code});
			throw err;
		}
	},

	loginWithCode: async (code) => {
		// Pairing-code polling can return "not ready" for several attempts.
		// Keep app-level loading untouched so the login panel stays mounted.
		set({error: null});
		try {
			const result = await auth.loginWithCode(code);
			if (result.user || result.access_token) {
				const user = result.user || await auth.me();
				set({user, isAuthenticated: true, isLoading: false});
				telemetry.setUser(user.id);
				telemetry.trackEvent('login_success', {method: 'pairing_code'});
			}
			return result;
		} catch (err) {
			set({error: err.message});
			throw err;
		}
	},

	continueAsGuest: async () => {
		set({isLoading: true, error: null});
		try {
			const user = await auth.continueAsGuest();
			set({user, isAuthenticated: true, isLoading: false});
			telemetry.trackEvent('guest_session_created');
			return user;
		} catch (err) {
			set({error: err.message, isLoading: false});
			throw err;
		}
	},

	logout: async () => {
		const userId = get().user?.id;
		await auth.logout();
		set({user: null, isAuthenticated: false, error: null});
		telemetry.clearUser();
		telemetry.trackEvent('logout', {user_id: userId});
	}
}));

// Keep store in sync with API token changes (e.g., when refresh fails)
onAuthChange((isAuth) => {
	if (!isAuth) {
		useAuthStore.setState({user: null, isAuthenticated: false});
	}
});
