# Dousic webOS — Backend API Specification & Deployment Instructions

**Audience:** Backend / API engineering team
**Goal:** Stand up the real, correctly-formatted API at `https://api.dousic.media`
so the existing LG webOS IPK works end-to-end on a TV. This is **not** a
request for a workaround in the app — the app is already finished and points at
this contract. The blocker is purely server-side: the endpoints below must
exist, return the documented JSON shapes, serve assets over HTTPS from
CSP-allowed hosts, and answer CORS preflights.

> **Key fact for planning:** the shipped IPK is hard-wired to
> `REACT_APP_API_URL=https://api.dousic.media` and calls
> `https://api.dousic.media/api/webos/v1/...`. The API lives on its own
> subdomain (`api.dousic.media`) — consistent with `ws.dousic.media` and the
> `*.dousic-cdn.com` asset hosts, and able to scale independently of the web
> origin. The app's CSP already allows `https://*.dousic.media`, so this needs
> **no policy change**. Deploy the API at `api.dousic.media` and the existing
> IPK works with no rebuild. The consumer **pair web page stays on the main
> origin at `https://dousic.media/pair`** (that's a web page, not an API call).

---

## 0. Why the app currently shows black artwork / can't pair

Every symptom we've seen on the TV traces back to the API not yet serving this
contract:

| Symptom on TV | Server-side cause |
|---|---|
| Can't get a pairing code / "we hit a snag" | `POST /auth/pair/request` or `/auth/pair` missing, wrong shape, or blocked by CORS |
| Black artwork on cards & detail | image URLs are `http://` (blocked by CSP), 404, or from a host not in the CSP allowlist |
| Nothing loads at all | requests fail CORS preflight (file:// origin) or TLS cert invalid |

Implement the contract below exactly and these resolve without touching the app.

---

## 1. Non-negotiable infrastructure (the security envelope)

The webOS app runs from a `file://` origin under LG's Chromium with a strict
Content-Security-Policy baked into `index.html`. The server **must** live
within that policy or the TV's browser will silently block it.

### 1.1 Hosts / DNS / TLS
| Purpose | Host | Notes |
|---|---|---|
| REST API | `https://api.dousic.media` | Own subdomain. Valid, publicly-trusted TLS cert (LG validates chains; no self-signed). |
| Pair web page (consumer) | `https://dousic.media/pair` | Web page where the user redeems the on-screen code — main origin, not the API. |
| Image / poster / logo assets | `https://*.dousic.media` **or** `https://*.dousic-cdn.com` | Must be HTTPS. |
| Video / audio / HLS manifests + segments | `https://*.dousic-cdn.com` **or** `https://*.dousic.media` | Must be HTTPS. |
| WebSocket (Reverb) | `wss://ws.dousic.media` | Port 443, TLS. Matches `wss://*.dousic.media`. |

These are the **only** hosts the app is allowed to talk to. The full CSP from
`index.html` is:

```
default-src 'self';
script-src 'self';
connect-src 'self' https://dousic.media https://*.dousic.media
            wss://*.dousic.media https://*.dousic-cdn.com;
img-src    'self' https: data: blob:;
media-src  'self' https: blob:;
font-src   'self' data:;
frame-src  'none'; object-src 'none'; base-uri 'self';
```

- `connect-src` (fetch/XHR/WebSocket): **only** the hosts above. If you must
  serve the API or assets from another domain, you have to send us the domain
  so we add it to the CSP and ship a new IPK. **Strongly prefer staying on
  `dousic.media` / `dousic-cdn.com`.**
- `img-src` / `media-src` allow **any HTTPS** plus `data:`/`blob:`. So images
  and media just have to be HTTPS — but `http://` is **blocked** and renders as
  a black tile. **Never return `http://` asset URLs.**

### 1.2 CORS (critical — this is the #1 reason file:// apps fail)
The app is served from `file://`, so browser requests carry `Origin: null` (or
no Origin). Auth is a **Bearer token**, not cookies, so the simplest correct
config is:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, Accept,
                              X-Dousic-Platform, X-Dousic-Device-Id
Access-Control-Max-Age: 86400
```

- Do **not** set `Access-Control-Allow-Credentials: true` together with `*`
  (the app doesn't use cookies, so don't enable credentials at all).
- Every endpoint must answer the **preflight `OPTIONS`** request with `204` and
  the headers above. The app sends custom headers (`X-Dousic-*`) and
  `Authorization`, which always triggers a preflight.

### 1.3 Transport contract
- **Base:** `https://api.dousic.media/api/webos/v1`
  (app config is the bare host `https://api.dousic.media`; the app appends the
  `/api/webos/v1` path). Mount the API routes at `/api/webos/v1` on the
  `api.dousic.media` subdomain — this is the prefix the API is deployed under
  and the app is pinned to it, so the full path is
  `https://api.dousic.media/api/webos/v1/<endpoint>`.
- **Request headers sent by the app on every call:**
  `Content-Type: application/json`, `Accept: application/json`,
  `X-Dousic-Platform: webos`, `X-Dousic-Device-Id: <opaque-device-id>`, and
  `Authorization: Bearer <access_token>` when authenticated.
- **Timeouts/retries (FYI):** 30s client timeout. The app retries once on a
  network-level failure and auto-refreshes once on `401`. Keep responses well
  under 30s.
- **All responses are JSON.**

### 1.4 Error response format
On any non-2xx, return JSON the app can read. The app surfaces
`data.error || data.message` as the message and `data.code` as a machine code:

```json
{ "error": "Human readable message", "code": "MACHINE_CODE" }
```

- Use correct HTTP status codes (`400/401/403/404/410/422/5xx`).
- `5xx` responses are logged to telemetry by the app; `4xx` are not — so use
  `4xx` for expected client conditions (bad code, not found, etc.).

---

## 2. Authentication & device pairing

TV sign-in is the OAuth-style "device pairing" flow: the TV shows a short code,
the user enters it at **`https://dousic.media/pair`** on their phone, and the TV
polls until it's redeemed. (A "Continue as guest" path also exists.)

### 2.1 `POST /auth/pair/request`  — get a code (no auth)
Request body:
```json
{ "device_id": "dev_xxx", "device_info": { "platform": "webos", "label": "LG TV" } }
```
Response `200`:
```json
{ "code": "ABCD-1234", "expires_in": 600 }
```
- `code` (string, **required**): the human-friendly code shown on screen and
  redeemed at `/pair`. Keep it short/legible at 10 feet.
- `expires_in` (seconds, optional; app defaults to 600 if omitted).

### 2.2 `POST /auth/pair`  — poll for redemption (no auth)
The app calls this on a timer (~every few seconds) with:
```json
{ "code": "ABCD-1234", "device_id": "dev_xxx" }
```
Return one of these four, and **the HTTP status matters**:

| Outcome | HTTP | Body | App behavior |
|---|---|---|---|
| **Pending** (not redeemed yet) | `200` | `{ "status": "pending" }` (any 2xx with **no** `access_token`/`user`) | Keep polling |
| **Success** (redeemed) | `200` | `{ "access_token": "...", "refresh_token": "...", "user": { … } }` | Sign in |
| **Terminal** (code dead) | `410 Gone` **or** `4xx` with a terminal `code` | `{ "error": "...", "code": "PAIRING_EXPIRED" }` | Stop polling, show "get a new code" |
| **Transient** (hiccup) | `5xx` / network | anything else | Keep polling until code expiry |

Terminal `code` values the app recognizes (case-insensitive) — return one of
these (or `410`) when the code can never succeed:
```
PAIRING_EXPIRED  PAIRING_INVALID  PAIRING_NOT_FOUND  PAIRING_DENIED
PAIRING_REVOKED  PAIRING_CONSUMED CODE_EXPIRED CODE_INVALID
CODE_NOT_FOUND   CODE_CONSUMED
```
> **Important:** Do **not** return a generic `400/500` for "not redeemed yet" —
> that reads as transient and the user waits forever. "Not yet" must be a
> **2xx with no tokens**. "Dead" must be `410` or a terminal code above.

### 2.3 `POST /auth/refresh`  — rotate tokens (no auth header; token in body)
```json
{ "refresh_token": "...", "device_id": "dev_xxx" }
```
Response `200`:
```json
{ "access_token": "...", "refresh_token": "..." }
```
- Called proactively on cold boot and automatically after a `401`. Rotate the
  refresh token (the app stores the new one). On failure return `401` and the
  app drops to the login screen.

### 2.4 `POST /auth/guest`  — guest session (no auth)
```json
{ "device_id": "dev_xxx" }
```
Response `200`:
```json
{ "access_token": "...", "refresh_token": "...",
  "user": { "id": "guest_xxx", "display_name": "Guest", "is_guest": true } }
```

### 2.5 `GET /auth/me`  — current user (auth)
```json
{ "id": "u_123", "display_name": "Alex", "handle": "alex",
  "is_guest": false, "avatar_url": "https://cdn.dousic-cdn.com/u/123.jpg" }
```

### 2.6 `POST /auth/logout`  — (auth) → `200 { "ok": true }`
### 2.7 `POST /auth/login`  — email/password (no auth), optional for TV
```json
{ "email": "a@b.com", "password": "…", "device_id": "dev_xxx" }
```
→ `{ "access_token", "refresh_token", "user" }`

### Token semantics
- Access token short-lived (≈15 min), sent as `Authorization: Bearer`.
- Refresh token long-lived, rotated on each refresh, revocable server-side on
  logout. The app keeps the access token in memory and the refresh token in
  `localStorage`.

---

## 3. Content endpoints

All return JSON. List payloads are tolerant: the app accepts a **bare array**
or an object wrapping the array under `items`, `results`, `data`, `featured`,
or `hero`. Prefer the keys named explicitly below.

### 3.1 `GET /content/home` — the Home screen
Return an object; each key is **optional** and is an array of *content items*
(§4.1). They render as horizontal rails in this order:
```json
{
  "continue_watching": [ /* items; each may add "subtitle":"45% watched", "resume_position": 1320 */ ],
  "live_now":          [ /* items with "is_live": true, "viewer_count": 1240 */ ],
  "featured_creators": [ /* creator items: {id, handle, display_name, thumbnail_url} */ ],
  "trending":          [ /* items */ ],
  "new_releases":      [ /* items */ ]
}
```
- `dou_stitch_broadcasts` is deferred — omit it for the first LG submission.
- Empty/absent keys simply render no rail (no error).

### 3.2 `GET /content/featured` — hero carousel
Returns the large "Featured" row at the top of Home.
```json
{ "items": [ /* content items, ideally with a wide 16:9 or 21:9 backdrop_url */ ] }
```
- Non-fatal: if this 404s or errors, Home just omits the carousel.

### 3.3 `GET /content/browse?<filters>` — Browse grid
```json
{ "items": [ /* content items */ ], "genres": ["Music","Talk","Film","..."] }
```
- The app may pass filter query params (e.g. `?genre=music`). Honor them; if
  absent, return everything (paginated — see §6).

### 3.4 `GET /content/live?<filters>` — Live grid
```json
{ "items": [ /* items, each "is_live": true with "viewer_count" */ ] }
```

### 3.5 `GET /content/search?q=<query>&<filters>` — Search
**Must** return results under the `results` key:
```json
{ "results": [ /* content items */ ] }
```
- The app only queries when `q` length ≥ 2.

### 3.6 `GET /content/{id}` — Content detail page
Full object (§4.2):
```json
{
  "id": "c_123",
  "title": "Midnight Frequencies",
  "backdrop_url": "https://cdn.dousic-cdn.com/art/c_123-bg.jpg",
  "logo_url": "https://cdn.dousic-cdn.com/art/c_123-logo.png",
  "logline": "A late-night radio host discovers a signal that should not exist.",
  "year": 2025,
  "genre": "Sci-Fi",
  "duration_label": "1h 24m",
  "rating": "TV-MA",
  "creator": { "display_name": "mxckenzie", "handle": "mxckenzie" },
  "is_live": false,
  "resume_position": 0,
  "in_watchlist": false,
  "price": 4.99,
  "is_free": false,
  "related": [ /* content items */ ]
}
```

### 3.7 `GET /content/{id}/stream` — playback config (§4.3)

Video-on-demand (HLS):
```json
{
  "url": "https://cdn.dousic-cdn.com/hls/c_123/master.m3u8",
  "protocol": "hls",
  "drm_scheme": null,
  "drm_license_url": null
}
```

Live via Ant Media WebRTC (ultra-low latency, sub-second) — see §5.1 and
`docs/BACKEND_ANTMEDIA.md` for the full spec:
```json
{
  "protocol": "webrtc",
  "webrtc": {
    "ws_url": "wss://live.dousic.media/WebRTCAppEE/websocket",
    "stream_id": "s_live_123",
    "token": "<one-time play token or empty string>",
    "ice_servers": [
      { "urls": "stun:live.dousic.media:3478" },
      { "urls": "turn:live.dousic.media:3478?transport=udp", "username": "u", "credential": "p" },
      { "urls": "turn:live.dousic.media:443?transport=tcp",  "username": "u", "credential": "p" }
    ]
  },
  "url": "https://live.dousic.media/WebRTCAppEE/streams/s_live_123.m3u8",
  "drm_scheme": null,
  "drm_license_url": null
}
```
The app **prefers WebRTC** and automatically **falls back to the HLS `url`**
if ICE stalls or negotiation fails, so `url` is required even for `webrtc`.

### 3.8 Creators
- `GET /creators?<params>` → `{ "items": [ creator items ] }`
- `GET /creators/{handle}` → creator detail object.

---

## 4. Data schemas (exact field names)

The app normalizes incoming items in `src/utils/content.js`. It tolerates
several aliases, but **return the canonical (bold) names** so behavior is
predictable.

### 4.1 Content item (used in every rail/grid/search result)
| Field | Type | Req | Notes / accepted aliases |
|---|---|---|---|
| **`id`** | string | ✅ | Stable; used for focus restore + detail route. |
| **`title`** | string | ✅ | |
| **`thumbnail_url`** | https URL | ▲ | Card art. Aliases: `cover_url`, `image_url`, `image`, `poster_url`, `backdrop_url`. **Must be HTTPS.** 16:9 recommended. |
| `subtitle` | string | | e.g. "45% watched". |
| `creator` | object/string | | `{ "display_name", "handle" }` (preferred) or a plain string. |
| `is_live` | bool | | Live tile + routes select → player. Alias: `isLive`. |
| `viewer_count` | number | | Shown on live tiles. Alias: `viewerCount`. |
| `duration` | number (sec) | | Renders as "1h 24m". |
| `type` | string | | `"video"` / `"audio"` → corner badge. Alias: `media_type`. |
| `price` | number | | e.g. `4.99`. Aliases: `amount`, `cost`. |
| `is_free` | bool | | Shows green "Free" chip. Aliases: `isFree`, `free`. |

▲ Strongly recommended — a missing/invalid image now falls back to a lettered
placeholder, but real art is the whole point.

> **Price/Free rule the app applies:** an item reads as **Free** when `is_free`
> is true **or** the price is `0` / missing / non-numeric; otherwise it shows
> `$<price>`. Live items are never priced.

### 4.2 Content detail (additional fields beyond 4.1)
`backdrop_url` (large ~1920×1080), `logo_url`/`logo` (optional transparent PNG
title treatment), `logline` **or** `description`, `year`, `genre`,
`duration_label` (pre-formatted string), `rating`, `creator{display_name,
handle}`, `is_live`, `resume_position` (sec; >0 shows "Resume"), `in_watchlist`
(bool), `price`/`is_free`, `related` (array of content items).

### 4.3 Stream config (`GET /content/{id}/stream`)
| Field | Type | Notes |
|---|---|---|
| **`url`** | https URL | HLS `.m3u8`, or direct `.mp4`/`.mp3`. Host must be CSP-allowed (§1.1) and **HTTPS**. For `protocol:"webrtc"` this is the **HLS fallback manifest** and is still required. |
| **`protocol`** | string | **`"hls"`** for manifests, **`"video"`** for direct mp4, **`"audio"`** for mp3, **`"webrtc"`** for Ant Media ultra-low-latency live. Drives the player path — required. |
| `webrtc` | object | **Required when `protocol:"webrtc"`.** Ant Media signaling config — see below and §5.1. |
| `drm_scheme` | null | Keep **null** for MVP (unencrypted). A non-null value triggers a DRM stub that will not play. |
| `drm_license_url` | null | MVP: null. |

**`webrtc` object** (only when `protocol:"webrtc"`):
| Field | Type | Req | Notes |
|---|---|---|---|
| **`ws_url`** | wss URL | ✅ | Ant Media WebSocket signaling endpoint. **Must be `wss://` on a `*.dousic.media` host** (CSP-allowed). Typically `wss://live.dousic.media/WebRTCAppEE/websocket`. |
| **`stream_id`** | string | ✅ | Ant Media stream key to play. |
| `token` | string | | One-time play token if the stream is token-protected (Ant Media JWT/one-time token). Empty string if the app/stream is public. |
| `ice_servers` | array | ▲ | STUN/TURN servers in standard `RTCIceServer` form (`{urls, username?, credential?}`). **Strongly recommended** — TVs are usually behind NAT and need a TURN relay. Omit and the app uses a public STUN only (LAN-only reachability). |

> **Fallback contract:** the app tries WebRTC first for sub-second latency; if
> no media arrives within ~6s or ICE fails, it silently switches to the HLS
> `url`. Always send a working HLS fallback so live plays on restrictive
> networks where WebRTC/UDP is blocked.

### 4.4 User
- `GET /user/watchlist` → `{ "items": [ content items ] }`
- `POST /user/watchlist` body `{ "content_id": "c_123" }` → `{ "ok": true }`
- `DELETE /user/watchlist/{id}` → `{ "ok": true }`
- `GET /user/history` → `{ "items": [ content items ] }`
- `POST /user/progress` body `{ "content_id", "position", "duration" }` (seconds)

---

## 5. Streaming / media requirements (so video actually plays)

The app ships **native-HLS-only** (`REACT_APP_NATIVE_HLS_ONLY=true`) — it does
not bundle hls.js. webOS plays HLS through the TV's native pipeline. Therefore:

1. **HLS** is the recommended protocol. Serve a valid `master.m3u8` (multi-bitrate
   ladder) over HTTPS with:
   - Manifest `Content-Type: application/vnd.apple.mpegurl`.
   - Segments (`.ts`/`.m4s`) over HTTPS from a CSP-allowed host.
   - **CORS headers on the manifest AND all segments** (`Access-Control-Allow-Origin: *`)
     — webOS fetches media cross-origin from the `file://` app.
   - H.264/AAC for broad TV compatibility (HEVC optional for newer panels).
2. **Direct files:** `.mp4` (`protocol:"video"`) / `.mp3` (`protocol:"audio"`)
   also work; serve over HTTPS with `Accept-Ranges: bytes` for seeking.
3. **DRM:** out of scope for the first submission — ship unencrypted, `drm_scheme:null`.

### 5.1 Live via Ant Media (WebRTC ultra-low-latency)

For **live** content the app can play Ant Media's WebRTC output for sub-second
latency on the TV, with automatic HLS fallback. This is the customary,
cert-friendly path for LG (native `<video>` + WebRTC; no third-party player
plugin). The **full backend spec is in `docs/BACKEND_ANTMEDIA.md`** — summary:

- Return `protocol:"webrtc"` + the `webrtc` object (§4.3) from
  `/content/{id}/stream` **only while the stream is actually live**. When the
  broadcast ends, revert to VOD (`protocol:"hls"`) pointing at the recording.
- **Signaling host must be `wss://*.dousic.media`** (put Ant Media behind
  `live.dousic.media` via reverse proxy / DNS) so it clears the app CSP.
- Provide **TURN** (UDP + TCP/443 fallback) — TVs are behind NAT and consumer
  routers often block plain UDP; without a reachable TURN relay WebRTC won't
  connect and every session degrades to HLS.
- Always include a valid HLS **fallback** manifest in `url`.
- If a stream is token-protected, mint a **one-time play token** per stream
  request and return it in `webrtc.token`.

---

## 6. Pagination & performance

- The "we're only getting a small part of the content" report = backend
  pagination/limits. For the grids (`/content/browse`, `/content/live`,
  `/content/search`) return a generous first page (e.g. 50–100 items) or
  implement paging and we'll wire infinite scroll in a follow-up.
- `requiredMemory` in the app is 256 MB — keep payloads reasonable and image
  dimensions sane (don't return 4K art for 360px cards; provide CDN-resized
  variants if possible).

---

## 7. WebSocket (live viewer counts) — Laravel Reverb

The app uses `pusher-js` against Reverb. Config baked into the build:
```
REACT_APP_WS_KEY  = dousic-key-6ae2A2uIDb38GR3l
REACT_APP_WS_HOST = ws.dousic.media
REACT_APP_WS_PORT = 443
REACT_APP_WS_TLS  = true
```
Requirements:
- Reverb reachable at `wss://ws.dousic.media:443` with the **exact app key**
  above, TLS enabled, valid cert.
- Public channel **`feed`** broadcasting these events (payloads as shown):
  - `viewer_update` → `{ "content_id": "c_123", "viewer_count": 1240 }`
  - `stream_started` → (any payload; app refetches live)
  - `stream_ended` → (any payload; app refetches live)
- `broadcastAs()` on each event must match those names exactly.
- This is enhancement-only; the app degrades gracefully if Reverb is down.

---

## 8. Telemetry (recommended, optional)

In production the app POSTs buffered analytics to `POST /telemetry/events`
(array of `{type, timestamp, name?, message?, level?, properties?, context?}`).
Accept and `2xx` it (even if you just sink it) so it doesn't generate client
errors. Not required for functional testing.

---

## 9. Acceptance checklist (run before handing back to QA)

From a normal machine (simulating the TV's requests). Replace `$TOK` with a
real access token where noted.

```bash
BASE=https://api.dousic.media/api/webos/v1

# 1) TLS + reachability + CORS preflight
curl -sI https://api.dousic.media | grep -i "HTTP/\|strict-transport"
curl -si -X OPTIONS $BASE/content/home \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization,x-dousic-platform" \
  | grep -i "access-control-allow"

# 2) Guest sign-in
curl -s -X POST $BASE/auth/guest -H 'Content-Type: application/json' \
  -d '{"device_id":"dev_test"}' | jq '.access_token, .user'

# 3) Pairing request + a pending poll (should be 200 with NO tokens)
curl -s -X POST $BASE/auth/pair/request -H 'Content-Type: application/json' \
  -d '{"device_id":"dev_test","device_info":{"platform":"webos","label":"LG TV"}}' | jq
curl -si -X POST $BASE/auth/pair -H 'Content-Type: application/json' \
  -d '{"code":"ABCD-1234","device_id":"dev_test"}' | head -1   # expect 200

# 4) Home / featured / detail / stream
curl -s $BASE/content/home    -H "Authorization: Bearer $TOK" | jq 'keys'
curl -s $BASE/content/featured -H "Authorization: Bearer $TOK" | jq '.items[0]'
curl -s $BASE/content/c_123   -H "Authorization: Bearer $TOK" | jq '.backdrop_url, .price, .is_free'
curl -s $BASE/content/c_123/stream -H "Authorization: Bearer $TOK" | jq

# 5) Assets are HTTPS and load (pick a real thumbnail_url from step 4)
curl -sI "https://cdn.dousic-cdn.com/art/c_123-bg.jpg" | grep -i "HTTP/\|content-type\|access-control-allow-origin"

# 6) HLS manifest has correct type + CORS
curl -sI "https://cdn.dousic-cdn.com/hls/c_123/master.m3u8" | grep -i "content-type\|access-control-allow-origin"
```

**Pass criteria**
- [ ] Valid public TLS cert on `dousic.media` and the asset/WS hosts.
- [ ] `OPTIONS` on every endpoint returns the CORS headers in §1.2.
- [ ] `/auth/guest` returns `access_token` + `user`.
- [ ] `/auth/pair/request` returns `code`; a not-yet-redeemed `/auth/pair`
      poll returns **200 with no tokens**; a dead code returns **410** or a
      terminal `code`.
- [ ] `/content/home` returns the documented keys; `/content/featured` returns
      `items`; `/content/{id}` returns `backdrop_url` + price fields;
      `/content/{id}/stream` returns `url` + `protocol`.
- [ ] **Every** image/poster/logo/backdrop URL is `https://` on a CSP-allowed
      host and returns `200` with an image content-type.
- [ ] HLS manifests/segments are HTTPS, correct MIME, and send
      `Access-Control-Allow-Origin`.
- [ ] `wss://ws.dousic.media` accepts the app key and broadcasts `feed` events.
- [ ] `https://dousic.media/pair` lets a user redeem the on-screen code.

---

## 10. How to validate against the IPK on the TV

1. Deploy the API per this spec to `https://api.dousic.media` (and the consumer
   pair page to `https://dousic.media/pair`).
2. Sideload the IPK that targets `https://api.dousic.media` (the build shipped
   alongside this revision of the spec). If reinstalling, close the running app
   first or install over it to avoid `FAILED_REMOVE`.
3. On the TV: a pairing code should appear → redeem at `dousic.media/pair` →
   Home populates with **real artwork** → open a title → **Play** streams →
   Live tiles update viewer counts.
4. If anything is still blank, open the TV's Web Inspector
   (`ares-inspect --app com.dousic.app.dousic`) → Network/Console:
   - `Refused to connect/load` = CSP/host mismatch (§1.1) or `http://` asset.
   - CORS error = missing preflight/headers (§1.2).
   - `401` loops = refresh/token contract (§2.3).
   Capture one failing request's URL + response and send it back to the app
   team; with that we can pinpoint it in minutes.

---

### Appendix A — endpoint summary
| Method | Path | Auth | Returns |
|---|---|---|---|
| POST | `/auth/pair/request` | no | `{code, expires_in}` |
| POST | `/auth/pair` | no | pending 2xx / `{access_token,refresh_token,user}` / 410 |
| POST | `/auth/refresh` | no | `{access_token, refresh_token}` |
| POST | `/auth/guest` | no | `{access_token, refresh_token, user}` |
| GET  | `/auth/me` | yes | user |
| POST | `/auth/logout` | yes | `{ok}` |
| POST | `/auth/login` | no | `{access_token, refresh_token, user}` |
| GET  | `/content/home` | yes | `{continue_watching, live_now, featured_creators, trending, new_releases}` |
| GET  | `/content/featured` | yes | `{items}` |
| GET  | `/content/browse?media_type=&genre=&vibe=` | yes | `{items, genres}` (Home filter dropdowns) |
| GET  | `/content/live` | yes | `{items}` |
| GET  | `/content/search?q=` | yes | `{results}` |
| GET  | `/content/feed?tab=` | yes | `{items}` (feed posts — see below) |
| GET  | `/content/{id}` | yes | detail object |
| GET  | `/content/{id}/stream` | yes | `{url, protocol, drm_scheme, drm_license_url}` |
| GET  | `/creators` | yes | `{items}` |
| GET  | `/creators/{handle}` | yes | creator detail |
| GET  | `/user/profile` | yes | full profile — see below |
| GET  | `/user/followers` | yes | `{items}` (people) |
| GET  | `/user/following` | yes | `{items}` (people) |
| GET  | `/user/watchlist` | yes | `{items}` |
| POST | `/user/watchlist` | yes | `{ok}` |
| DELETE | `/user/watchlist/{id}` | yes | `{ok}` |
| GET  | `/user/history` | yes | `{items}` |
| POST | `/user/progress` | yes | `{ok}` |
| POST | `/telemetry/events` | yes | `2xx` (optional) |

All paths are under `https://api.dousic.media/api/webos/v1`.

### Appendix B — Feed & Profile (added for the Feed tab + complete Profile)

**`GET /content/feed?tab=<for_you|following|live|local>&genre=<>`** → `{ "items": [post] }`.
The app reads each post tolerantly (aliases in parentheses):
```json
{
  "id": "p_1",
  "content_id": "c_123",                       // what selecting the post opens
  "creator": { "display_name": "Kenny Mo", "handle": "kennymo", "avatar_url": "https://…" },
  "meta": "now · Houston",                      // small line under the name (posted_at_label)
  "caption": "Friday Night Sessions — live ⚡",  // (text | description)
  "title": "Friday Night Sessions",
  "subtitle": "Live DJ set · 3 cameras",        // (duration_label)
  "type": "audio",                              // audio | video | art | podcast … (media_type | kind)
  "is_live": true,
  "viewer_count": 1240,
  "thumbnail_url": "https://…",                 // media preview (any artwork alias)
  "tag": "Live",                                // optional pill label; defaults from type/is_live
  "likes": 1200, "comments": 418                // (like_count | comment_count)
}
```
- `tab` filters the feed server-side (`following` = creators the user follows, `live` = live only,
  `local` = same region). Selecting a post → the app opens `content_id` (live → player, else detail).

**`GET /user/profile`** → the full account profile:
```json
{
  "display_name": "Kenny Mo", "handle": "kennymo",
  "avatar_url": "https://…",
  "role": "Singer · Producer",                  // (creator_type | title)
  "location": "Houston, TX",                    // (city)
  "followers_count": 12400, "following_count": 318,   // (or counts:{followers,following})
  "bio": "Houston-based artist…",               // (about)
  "interests": ["🎵 Electronic", "🎧 Lo-fi"],
  "collection": [ /* content items (editions/NFTs) */ ],
  "usage": {
    "storage_used_label": "3 GB", "storage_total_label": "5 GB", "storage_pct": 60,
    "livestream_used_label": "22 min", "livestream_total_label": "60 min", "livestream_pct": 37
  }
}
```
- Every field is optional — the Profile falls back to `/auth/me` + watchlist/history and hides
  sections it has no data for. `storage_pct`/`livestream_pct` may be sent directly, or the app
  computes them from `*_used`/`*_total` numbers.

**`GET /user/followers`** and **`GET /user/following`** → `{ "items": [person] }` where a person is
`{ id, display_name, handle, role, avatar_url, is_following }`.
