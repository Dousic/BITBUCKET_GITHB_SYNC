/**
 * Dousic — Login Panel
 *
 * TV login via pairing code. User sees a 6-digit code on the TV screen,
 * enters it on dousic.media/pair on their phone. We poll for completion.
 *
 * Also offers "Continue as guest" for instant access without an account.
 */

import {useEffect, useState, useRef, useCallback} from 'react';
import {Panel} from '@enact/moonstone/Panels';
import SpotlightContainerDecorator, {spotlightDefaultClass} from '@enact/spotlight/SpotlightContainerDecorator';
import Button from '@enact/moonstone/Button';
import PropTypes from 'prop-types';

import {useAuthStore} from '../state/authStore';
import {useAppStore} from '../state/appStore';
import {auth as authApi} from '../services/api';
import {classifyPairPoll, isConnectivityError} from '../utils/pairing';
import telemetry from '../platform/telemetry';
import Strings from '../i18n/strings';
import css from './LoginPanel.module.less';

const POLL_INTERVAL_MS = 3000;
// Consecutive connectivity failures before we surface the "reconnecting"
// hint. ~3 × 3s ≈ 9s of no network before we say anything — short enough to
// be honest, long enough to ride out a single dropped poll.
const OFFLINE_AFTER = 3;

const formatTime = (s) => {
	const m = Math.floor(s / 60);
	const sec = s % 60;
	return `${m}:${String(sec).padStart(2, '0')}`;
};

const LoginPanelBase = () => {
	const [pairingCode, setPairingCode] = useState(null);
	const [expiresAt, setExpiresAt] = useState(null);
	const [timeLeft, setTimeLeft] = useState(0);
	// status: idle | waiting | offline | success | failed | error | expired
	//   waiting  — polling, server reachable
	//   offline  — polling, but we can't reach the server right now
	//   failed   — backend says the code is dead (expired/invalid/revoked)
	//   error    — couldn't obtain a code in the first place
	//   expired  — the code's own countdown hit zero
	const [status, setStatus] = useState('idle');
	const [error, setError] = useState(null);
	const pollTimer = useRef();
	const tickTimer = useRef();
	const settled = useRef(false);   // true once we reach a terminal state
	const failCount = useRef(0);     // consecutive connectivity failures

	const loginWithCode = useAuthStore((s) => s.loginWithCode);
	const continueAsGuest = useAuthStore((s) => s.continueAsGuest);
	const switchRoot = useAppStore((s) => s.switchRoot);
	const notify = useAppStore((s) => s.notify);

	const stopTimers = useCallback(() => {
		settled.current = true;
		clearInterval(pollTimer.current);
		clearInterval(tickTimer.current);
	}, []);

	const startPolling = useCallback((code) => {
		clearInterval(pollTimer.current);
		settled.current = false;
		failCount.current = 0;

		pollTimer.current = setInterval(async () => {
			// A previous poll may have already settled (success/terminal) or
			// the panel may have unmounted while this request was in flight —
			// never let a late resolver clobber a finished state.
			if (settled.current) return;

			let result, err;
			try {
				result = await loginWithCode(code);
			} catch (e) {
				err = e;
			}
			if (settled.current) return;

			switch (classifyPairPoll({result, error: err})) {
				case 'success':
					stopTimers();
					setStatus('success');
					telemetry.trackEvent('login_success', {method: 'pairing_code'});
					setTimeout(() => switchRoot('home'), 800);
					break;

				case 'terminal':
					// The code can never be redeemed — stop and let the user
					// request a fresh one instead of polling pointlessly.
					stopTimers();
					setStatus('failed');
					telemetry.trackEvent('login_failure', {reason: err?.code || 'pairing_terminal'});
					break;

				default:
					// pending, or a transient hiccup — keep polling. Only a
					// real connectivity failure surfaces the reconnect hint;
					// a reachable-but-not-yet-redeemed server stays "waiting".
					if (isConnectivityError(err)) {
						failCount.current += 1;
						if (failCount.current >= OFFLINE_AFTER) setStatus('offline');
					} else {
						failCount.current = 0;
						setStatus('waiting');
					}
			}
		}, POLL_INTERVAL_MS);
	}, [loginWithCode, switchRoot, stopTimers]);

	const requestCode = useCallback(async () => {
		setStatus('waiting');
		setError(null);
		try {
			const data = await authApi.requestPairingCode();
			setPairingCode(data.code);
			setExpiresAt(Date.now() + (data.expires_in || 600) * 1000);
			startPolling(data.code);
		} catch (e) {
			setError(Strings.login.errorTitle());
			setStatus('error');
			telemetry.captureException(e, {phase: 'request-pairing-code'});
		}
	}, [startPolling]);

	useEffect(() => {
		requestCode();
		telemetry.trackScreenView('login');

		return () => {
			settled.current = true; // block any in-flight poll from setState after unmount
			if (pollTimer.current) clearInterval(pollTimer.current);
			if (tickTimer.current) clearInterval(tickTimer.current);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Countdown ticker
	useEffect(() => {
		if (!expiresAt) return;
		tickTimer.current = setInterval(() => {
			const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
			setTimeLeft(remaining);
			if (remaining === 0) {
				if (settled.current) { clearInterval(tickTimer.current); return; }
				stopTimers();
				setStatus('expired');
			}
		}, 1000);
		return () => clearInterval(tickTimer.current);
	}, [expiresAt, stopTimers]);

	const handleGuest = async () => {
		try {
			await continueAsGuest();
			notify(Strings.login.guestNote(), {type: 'info'});
			switchRoot('home');
		} catch (e) {
			notify(Strings.errorBoundary.title(), {type: 'error'});
		}
	};

	const handleRefreshCode = () => {
		requestCode();
	};

	return (
		<Panel className={css.panel}>
			<div className={css.content}>
				<div className={css.brand}>
					<div className={css.logo}>dousic<span className={css.accent}>.</span></div>
					<div className={css.tagline}>{Strings.tagline()}</div>
				</div>

				<div className={css.card}>
					<h1 className={css.title}>{Strings.login.title()}</h1>

					<div className={css.steps}>
						<div className={css.step}>
							<div className={css.stepNumber}>1</div>
							<div className={css.stepText}>
								{Strings.login.step1()}
								<div className={css.url}>{Strings.login.pairUrl()}</div>
							</div>
						</div>
						<div className={css.step}>
							<div className={css.stepNumber}>2</div>
							<div className={css.stepText}>
								{Strings.login.step2()}
								<div className={css.code}>
									{pairingCode ? (
										pairingCode.split('').map((ch, i) => (
											<span key={i} className={css.codeChar}>{ch}</span>
										))
									) : (
										<div className={css.codeLoading}>{Strings.login.gettingCode()}</div>
									)}
								</div>
							</div>
						</div>
					</div>

					{status === 'waiting' && pairingCode && (
						<div className={css.statusRow}>
							<div className={css.spinner} />
							<div className={css.statusText}>
								{Strings.login.waiting()}
								{timeLeft > 0 && <> · {Strings.login.expiresIn(formatTime(timeLeft))}</>}
							</div>
						</div>
					)}

					{status === 'offline' && (
						<div className={css.statusRow}>
							<div className={css.spinner} />
							<div className={css.statusText}>{Strings.offline.banner()}</div>
						</div>
					)}

					{status === 'success' && (
						<div className={css.successRow}>
							<div className={css.checkmark}>✓</div>
							<div className={css.statusText}>{Strings.login.success()}</div>
						</div>
					)}

					{(status === 'error' || status === 'expired' || status === 'failed') && (
						<div className={css.errorRow}>
							{status === 'expired' ? Strings.login.expired() : error || Strings.error()}
                            &nbsp;
							<Button onClick={handleRefreshCode} spotlightId="login-refresh">
								{Strings.login.newCode()}
							</Button>
						</div>
					)}

					<div className={css.divider}>
						<span>{Strings.login.orDivider()}</span>
					</div>

					<div className={css.guestAction}>
						<Button
							onClick={handleGuest}
							spotlightId="login-guest"
							className={spotlightDefaultClass}
						>
							{Strings.continueGuest()}
						</Button>
						<p className={css.guestNote}>
							{Strings.login.guestNote()}
						</p>
					</div>
				</div>
			</div>
		</Panel>
	);
};

LoginPanelBase.propTypes = {};

const LoginPanel = SpotlightContainerDecorator(
	// `enterTo: 'default-element'` honors the element marked with
	// spotlightDefaultClass — see the guest <Button> above. The previous
	// implementation used `defaultElement: '[data-spotlight-id="login-guest"]'`,
	// which never matched because Moonstone's <Button> doesn't forward
	// spotlightId as a DOM attribute. (Diagnostic finding, May 2026.)
	{enterTo: 'default-element'},
	LoginPanelBase
);

export default LoginPanel;
