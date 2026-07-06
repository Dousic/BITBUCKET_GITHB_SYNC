# Dousic webOS — Ant Media Live Integration (Backend Spec)

**Audience:** backend / infra / streaming team
**Goal:** ultra-low-latency (sub-second) **live** playback on the LG TV app via
Ant Media Server **WebRTC**, with automatic **HLS fallback** so live still
works on restrictive TV networks.
**App version:** 1.1.4+ (WebRTC play client shipped in `src/platform/antmedia.js`)

---

## 0. TL;DR — what the backend must do

1. Stand up **Ant Media Server** (Community or Enterprise — see §7) and put it
   behind **`live.dousic.media`** (TLS, valid cert) so both the signaling
   WebSocket and the HLS output are on a `*.dousic.media` host the app CSP
   already allows.
2. Configure **TURN** (UDP + a TCP/443 relay) on `live.dousic.media`. This is
   the single most important item — without a reachable TURN relay, TVs behind
   NAT never establish WebRTC and every session silently falls back to HLS.
3. When a content item is **live**, make `GET /content/{id}/stream` return
   `protocol:"webrtc"` + a `webrtc` object **and** a working HLS `url`
   fallback (contract in §2). When the broadcast ends, revert to VOD
   (`protocol:"hls"`, the recording).
4. If streams are token-protected, mint a **one-time play token** per stream
   request and return it in `webrtc.token` (§4).

Nothing else in the app changes: the TV plays WebRTC into the same `<video>`
element and falls back to HLS on its own.

---

## 1. How the app plays live (so you know what you're feeding)

The app ships a **self-contained WebRTC play client** (no Ant Media JS SDK — we
keep the bundle lean and the CSP tight). It speaks Ant Media's WebSocket
signaling protocol directly and attaches the resulting `MediaStream` to the
TV's native `<video>` via `srcObject`.

Play flow (server-offer / "play" mode), exactly what the app sends & expects:

```
app  → { "command": "play", "streamId": "<stream_id>", "token": "<token>" }
srv  → { "command": "takeConfiguration", "type": "offer",  "sdp": "<offer sdp>" }
app  → { "command": "takeConfiguration", "type": "answer", "sdp": "<answer sdp>" }
both ⇄ { "command": "takeCandidate", "label": <mLineIndex>, "id": <mid>, "candidate": "<ice>" }
srv  → { "command": "notification", "definition": "play_started" }
srv  → { "command": "notification", "definition": "play_finished" }     // broadcast ended
srv  → { "command": "notification", "definition": "no_stream_exist" }   // → app falls back to HLS
srv  → { "command": "error", "definition": "<reason>" }                 // → app falls back to HLS
```

This is the **stock Ant Media `WebRTCAppEE` / `LiveApp` WebSocket protocol** —
if you run an unmodified Ant Media Server, it already speaks this. The app also
sends a `{ "command": "ping" }` keepalive every 15s.

**Fallback:** the app starts a 6s timer when it opens the socket. If no media
track arrives (ICE stalled / blocked UDP / no TURN) or the server sends
`error` / `no_stream_exist`, the app tears down WebRTC and plays the HLS `url`
instead. So live is never worse than HLS — WebRTC is pure upside when the
network allows it.

---

## 2. Stream endpoint contract (the one change to your API)

`GET /content/{id}/stream` — while the item is **live**, return:

```json
{
  "protocol": "webrtc",
  "webrtc": {
    "ws_url": "wss://live.dousic.media/WebRTCAppEE/websocket",
    "stream_id": "s_live_123",
    "token": "",
    "ice_servers": [
      { "urls": "stun:live.dousic.media:3478" },
      { "urls": "turn:live.dousic.media:3478?transport=udp", "username": "dousic", "credential": "<secret>" },
      { "urls": "turn:live.dousic.media:443?transport=tcp",  "username": "dousic", "credential": "<secret>" }
    ]
  },
  "url": "https://live.dousic.media/WebRTCAppEE/streams/s_live_123.m3u8",
  "drm_scheme": null,
  "drm_license_url": null
}
```

| Field | Type | Req | Notes |
|---|---|---|---|
| `protocol` | string | ✅ | `"webrtc"` to prefer WebRTC. Anything else = existing HLS/direct paths. |
| `webrtc.ws_url` | wss URL | ✅ | Ant Media signaling socket. **MUST be `wss://` on `*.dousic.media`** (CSP). |
| `webrtc.stream_id` | string | ✅ | Ant Media stream key to play. |
| `webrtc.token` | string | | One-time play token (§4), or `""` if public. |
| `webrtc.ice_servers` | array | ▲ | `RTCIceServer[]` — STUN + TURN. Strongly recommended (see §3). |
| `url` | https URL | ✅ | **HLS fallback** manifest. Required even for `webrtc`. |
| `drm_scheme` / `drm_license_url` | null | | Live UGC ships unencrypted; keep null. |

After the broadcast ends, the **same endpoint** should return the VOD form:
```json
{ "url": "https://cdn.dousic-cdn.com/hls/s_live_123/master.m3u8", "protocol": "hls", "drm_scheme": null, "drm_license_url": null }
```

> Only advertise `protocol:"webrtc"` when the stream is **genuinely publishing**.
> If you return it for an offline stream, the app spends up to 6s on WebRTC
> before falling back — sending `hls` directly is snappier when there's no live
> feed.

---

## 3. Networking, DNS & CSP (the part that actually blocks TVs)

### 3.1 Everything on `*.dousic.media`
The app CSP allows `wss://*.dousic.media`, `https://*.dousic.media`, and the
ICE schemes `stun: stuns: turn: turns:`. To stay inside it:

- **Signaling:** `wss://live.dousic.media/WebRTCAppEE/websocket` (reverse-proxy
  Ant Media's `:5443` WSS behind `live.dousic.media:443`, or point DNS + a valid
  cert directly at the AMS host).
- **HLS fallback:** `https://live.dousic.media/...` or your existing
  `*.dousic-cdn.com` CDN — both are CSP-allowed.
- **STUN/TURN:** host on `live.dousic.media`. (The CSP now allows the bare
  `stun:`/`turn:` schemes for any host as a safety net, but keeping TURN on
  dousic infra is cleaner and keeps latency/keys under your control.)

### 3.2 TURN is mandatory for TVs
LG TVs sit behind consumer NAT; many home/enterprise networks block arbitrary
outbound UDP. Provide **both**:

- `turn:live.dousic.media:3478?transport=udp` — normal path.
- `turn:live.dousic.media:443?transport=tcp` (ideally **turns:** on 443) — the
  "works through almost any firewall" fallback, since 443/TCP is universally
  allowed.

Ant Media Enterprise bundles a TURN server (coturn); Community can use an
external coturn. Rotate TURN credentials or use time-limited (REST/HMAC) TURN
credentials — see §4.2.

### 3.3 Ports to open on the AMS host
| Port | Proto | Purpose |
|---|---|---|
| 443 | TCP | HTTPS (HLS) + WSS signaling (via proxy) + TURN/TCP fallback |
| 5443 | TCP | AMS native HTTPS/WSS (if not proxying) |
| 3478 | UDP/TCP | STUN/TURN |
| 50000–60000 | UDP | WebRTC media (RTP) — Ant Media default range |
| 5080 | TCP | AMS REST/dashboard (internal only — do **not** expose publicly) |

---

## 4. Tokens & security

### 4.1 One-time play tokens (recommended)
Enable **"Play Token Control"** on the Ant Media application, then for each
`GET /content/{id}/stream` on a protected live stream:

1. Call AMS REST to generate a one-time/JWT token for that `stream_id`, type
   `play`:
   `POST /rest/v2/broadcasts/{stream_id}/token?expireDate=<epoch>&type=play`
2. Return it as `webrtc.token`. The app forwards it in the `play` command.

Tokens must be **short-lived** and **single-use** so a scraped `stream`
response can't be replayed. If a stream is fully public, return `token: ""`.

### 4.2 Time-limited TURN credentials (recommended)
Rather than a static TURN username/password, use coturn's
`use-auth-secret` (REST/HMAC) scheme and return per-request credentials in
`ice_servers` (username = `<expiry>:dousic`, credential = HMAC). Keeps a leaked
`stream` response from granting long-term relay access.

### 4.3 Do not expose the AMS dashboard / REST publicly
Keep `:5080` and the management REST API on a private network; the app only
ever needs the public WSS signaling + media ports + HLS.

---

## 5. Publishing side (how creators go live) — informational

Not required for the TV app, but for a complete picture: creators publish to
AMS via WebRTC (browser/mobile SDK) or RTMP (`rtmp://live.dousic.media/WebRTCAppEE/<stream_id>`).
AMS transcodes and simultaneously exposes WebRTC play + LL-HLS/HLS. The TV only
**consumes** the play side. Make sure the `stream_id` you publish under is the
same one you return in `webrtc.stream_id`.

---

## 6. Live signaling of "who is live" (existing Reverb, unchanged)

The app already listens on Reverb (`ws.dousic.media`) channel `feed` for
`stream_started` / `stream_ended` / `viewer_update` (API spec §7). When a
broadcast starts/stops, emit those so the app refetches live rails and the
`/stream` response flips between `webrtc` and `hls`. **No change** to that
system — Ant Media is orthogonal to it.

---

## 7. Ant Media edition & DRM note

- **Community Edition** supports WebRTC play + HLS and is sufficient for
  unencrypted live. Good enough to ship.
- **Enterprise Edition** adds adaptive bitrate, clustering/scaling, bundled
  TURN, LL-HLS, and **DRM** (Widevine + PlayReady via a provider such as
  EZDRM). DRM is **not required** for MVP live (we send `drm_scheme:null`); when
  you later want protected premium live, Enterprise + Widevine/PlayReady is the
  webOS-customary path and the app's DRM hooks (`src/platform/drm.js`) can be
  wired to it then. **FairPlay is Apple-only — not applicable to LG.**

---

## 8. Acceptance checklist (run before handing to QA)

```bash
# 1) Signaling socket is reachable, wss, on dousic.media, valid cert
#    (use wscat or similar)
wscat -c wss://live.dousic.media/WebRTCAppEE/websocket
# → send: {"command":"play","streamId":"s_live_123","token":""}
# → expect: takeConfiguration offer within ~1s while stream is publishing

# 2) HLS fallback manifest is https, correct type, CORS
curl -sI https://live.dousic.media/WebRTCAppEE/streams/s_live_123.m3u8 \
  | grep -Ei 'content-type|access-control-allow-origin'
#   → application/vnd.apple.mpegurl  +  access-control-allow-origin: *

# 3) TURN reachable on UDP 3478 AND TCP 443
#    (trickle-ice test page or `turnutils_uclient live.dousic.media`)

# 4) /stream returns the webrtc contract while live, hls when idle
curl -s $BASE/content/<live_id>/stream -H "Authorization: Bearer $TOK" | jq
```

Definition of done:
- [ ] `wss://live.dousic.media/...` connects with a valid cert (no mixed-content / CSP error).
- [ ] Playing a live item on the TV shows video **sub-second** behind real time.
- [ ] Pulling the TV onto a UDP-blocked network still plays live (falls back to HLS within ~6s).
- [ ] `/stream` flips to `protocol:"hls"` (recording) after the broadcast ends.
- [ ] Protected streams return a fresh one-time `webrtc.token` each request.

---

## 9. Why WebRTC (vs HLS-only) on the TV

HLS on a TV is typically **6–30s** behind real time; even LL-HLS lands around
2–5s. WebRTC gets us **sub-second**, which is the difference between "watchable
live" and "genuinely interactive live" (chat, reactions, co-watch, sports,
citizen news). We keep HLS as the guaranteed-compatible floor and use WebRTC as
the low-latency ceiling — best of both, and cert-clean because it's native
`<video>` + standard WebRTC with no plugin.
