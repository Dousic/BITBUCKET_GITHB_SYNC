/* eslint-env browser */
/**
 * Dousic — Ant Media WebRTC play client
 *
 * Ultra-low-latency (sub-second) live playback from Ant Media Server. Speaks
 * Ant Media's WebSocket signaling protocol directly (no SDK dependency — keeps
 * the bundle lean and the CSP tight) and hands the resulting MediaStream to a
 * <video> element via `srcObject`.
 *
 * Signaling (PLAY, server-offer mode):
 *   client → { command: "play", streamId, token }
 *   server → { command: "takeConfiguration", type: "offer", sdp }      // SDP offer
 *   client → { command: "takeConfiguration", type: "answer", sdp }     // our answer
 *   both   ⇄ { command: "takeCandidate", label, id, candidate }        // ICE trickle
 *   server → { command: "notification", definition: "play_started" | "play_finished"
 *                                                   | "no_stream_exist" }
 *   server → { command: "error", definition }
 *
 * The caller is responsible for the HLS fallback — this client just reports
 * onError, and VideoPlayer falls back to the HLS manifest when it fires. That
 * matters on TVs: WebRTC needs UDP/ICE (often a TURN relay); when the network
 * blocks it, falling back to LL-HLS keeps live working.
 */

// Public STUN as a last resort if the backend sends no ICE servers. Prefer the
// backend-provided list (Ant Media's own STUN/TURN on dousic.media infra).
const DEFAULT_ICE = [{urls: 'stun:stun.l.google.com:19302'}];
const PING_INTERVAL_MS = 15000;

export const createWebRTCPlayer = ({wsUrl, streamId, token, iceServers, onStream, onStatus, onError}) => {
	let ws = null;
	let pc = null;
	let ping = null;
	let isClosed = false;

	const ice = Array.isArray(iceServers) && iceServers.length ? iceServers : DEFAULT_ICE;

	const send = (obj) => {
		try {
			if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
		} catch (_) { /* socket closing */ }
	};

	const fail = (message) => {
		if (isClosed) return;
		if (typeof onError === 'function') onError(new Error(message));
	};

	const teardown = () => {
		isClosed = true;
		if (ping) { clearInterval(ping); ping = null; }
		if (pc) { try { pc.close(); } catch (_) { /* noop */ } pc = null; }
		if (ws) {
			try { ws.onclose = null; ws.close(); } catch (_) { /* noop */ }
			ws = null;
		}
	};

	const createPeer = () => {
		pc = new RTCPeerConnection({iceServers: ice});
		pc.onicecandidate = (e) => {
			if (e.candidate) {
				send({
					command: 'takeCandidate',
					streamId,
					label: e.candidate.sdpMLineIndex,
					id: e.candidate.sdpMid,
					candidate: e.candidate.candidate
				});
			}
		};
		pc.ontrack = (e) => {
			const stream = (e.streams && e.streams[0]) || null;
			if (stream && typeof onStream === 'function') onStream(stream);
		};
		pc.oniceconnectionstatechange = () => {
			const s = pc && pc.iceConnectionState;
			if (s === 'failed' || s === 'closed') fail('WebRTC connection ' + s);
		};
	};

	const onMessage = async (raw) => {
		let msg;
		try { msg = JSON.parse(raw); } catch (_) { return; }

		if (msg.command === 'takeConfiguration' && msg.type === 'offer') {
			try {
				createPeer();
				await pc.setRemoteDescription(new RTCSessionDescription({type: 'offer', sdp: msg.sdp}));
				const answer = await pc.createAnswer();
				await pc.setLocalDescription(answer);
				send({command: 'takeConfiguration', streamId, type: 'answer', sdp: answer.sdp});
			} catch (err) {
				fail(err && err.message ? err.message : 'WebRTC negotiation failed');
			}
		} else if (msg.command === 'takeCandidate') {
			if (pc) {
				try {
					await pc.addIceCandidate(new RTCIceCandidate({
						sdpMLineIndex: msg.label,
						sdpMid: msg.id,
						candidate: msg.candidate
					}));
				} catch (_) { /* candidate arrived before remote description; ignore */ }
			}
		} else if (msg.command === 'notification') {
			if (msg.definition === 'play_started') {
				if (typeof onStatus === 'function') onStatus('play_started');
			} else if (msg.definition === 'play_finished') {
				if (typeof onStatus === 'function') onStatus('play_finished');
			} else if (msg.definition === 'no_stream_exist') {
				fail('Live stream is not available');
			}
		} else if (msg.command === 'error') {
			fail(msg.definition || 'Ant Media error');
		}
	};

	const play = () => {
		try {
			ws = new WebSocket(wsUrl);
		} catch (_) {
			fail('Cannot reach the live signaling server');
			return;
		}
		ws.onopen = () => {
			send({command: 'play', streamId, token: token || '', room: '', trackList: [], subscriberId: '', subscriberCode: ''});
			ping = setInterval(() => send({command: 'ping'}), PING_INTERVAL_MS);
		};
		ws.onmessage = (ev) => { onMessage(ev.data); };
		ws.onerror = () => fail('Live signaling error');
		ws.onclose = () => { if (!isClosed) fail('Live signaling closed'); };
	};

	return {play, stop: teardown};
};

export default createWebRTCPlayer;
