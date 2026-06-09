/**
 * Dousic — WebSocket service
 *
 * Thin wrapper around pusher-js that talks to Laravel Reverb (which speaks
 * the Pusher protocol). Exposes the same .on(event, handler) API that
 * views already depend on — swapping the backend WS implementation is
 * invisible to HomePanel / LivePanel / etc.
 *
 * Events emitted (received from Reverb on the public 'feed' channel):
 *   - 'viewer_update'   : live viewer count changed
 *   - 'stream_started'  : creator went live
 *   - 'stream_ended'    : creator ended live broadcast
 *
 * Dou-Stitch Live is deferred past MVP — those helpers were removed.
 * Add them back here when the feature is reintroduced.
 */

import Pusher from 'pusher-js';

const WS_KEY = process.env.REACT_APP_WS_KEY || 'dousic_local_key';
const WS_HOST = process.env.REACT_APP_WS_HOST || 'localhost';
const WS_PORT = parseInt(process.env.REACT_APP_WS_PORT || '8080', 10);
const WS_TLS = process.env.REACT_APP_WS_TLS === 'true';

// Events the backend broadcasts on the 'feed' channel. Keep in sync with
// broadcastAs() on each ShouldBroadcast event in app/Events/.
const FEED_EVENTS = ['viewer_update', 'stream_started', 'stream_ended'];

class WSClient {
	constructor () {
		this.pusher = null;
		this.channel = null;
		this.listeners = new Map();
		this.status = 'disconnected';
	}

	connect () {
		if (this.pusher) return;

		this.status = 'connecting';
		this.emit('status', {status: 'connecting'});

		try {
			// Pusher client talking to Reverb. TLS is controlled by REACT_APP_WS_TLS,
			// not inferred from port — local dev uses ws://, prod uses wss://.
			this.pusher = new Pusher(WS_KEY, {
				wsHost: WS_HOST,
				wsPort: WS_PORT,
				wssPort: WS_PORT,
				forceTLS: WS_TLS,
				enabledTransports: WS_TLS ? ['wss'] : ['ws'],
				disableStats: true,
				cluster: 'mt1' // placeholder — Reverb ignores, but pusher-js requires it
			});

			this.pusher.connection.bind('state_change', (states) => {
				this.status = states.current;
				this.emit('status', {status: states.current});
			});

			// Subscribe to the public 'feed' channel and forward every known
			// server event to our emit() pipeline. Views call ws.on('viewer_update', ...)
			// and receive the payload backend dispatched via broadcastWith().
			this.channel = this.pusher.subscribe('feed');
			FEED_EVENTS.forEach((evt) => {
				this.channel.bind(evt, (payload) => this.emit(evt, payload));
			});
		} catch (err) {
			// Telemetry would catch this; don't crash the connect path.
			this.status = 'disconnected';
			this.emit('status', {status: 'disconnected', error: err?.message});
		}
	}

	disconnect () {
		if (this.channel) {
			try {
				this.channel.unbind_all();
			} catch (_) {}
			this.channel = null;
		}
		if (this.pusher) {
			try {
				this.pusher.disconnect();
			} catch (_) {}
			this.pusher = null;
		}
		this.status = 'disconnected';
	}

	on (event, handler) {
		if (!this.listeners.has(event)) this.listeners.set(event, new Set());
		this.listeners.get(event).add(handler);
		return () => this.listeners.get(event)?.delete(handler);
	}

	emit (event, payload) {
		this.listeners.get(event)?.forEach((fn) => {
			try {
				fn(payload);
			} catch (_) {}
		});
		// Wildcard listeners receive everything
		this.listeners.get('*')?.forEach((fn) => {
			try {
				fn(event, payload);
			} catch (_) {}
		});
	}
}

const wsClient = new WSClient();
export default wsClient;
