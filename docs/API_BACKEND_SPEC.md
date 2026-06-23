# Dousic webOS — Backend API Specification & Deployment Instructions

**Audience:** Backend / API engineering team
**Goal:** Stand up the real, correctly-formatted API at `https://dousic.media`
so the existing LG webOS IPK works end-to-end on a TV. This is **not** a
request for a workaround in the app — the app is already finished and points at
this contract. The blocker is purely server-side: the endpoints below must
exist, return the documented JSON shapes, serve assets over HTTPS from
CSP-allowed hosts, and answer CORS preflights.

> **Key fact for planning:** the shipped IPK is hard-wired to
> `REACT_APP_API_URL=https://dousic.media` and calls
> `https://dousic.media/api/webos/v1/...`. Once this spec is implemented and
> live, **the same IPK works with no rebuild.** Do not stand the API up at
> `api.dousic.media` — that hostname does not resolve and is not in the app's
> security policy.

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
| REST API + pair web page | `https://dousic.media` | Valid, publicly-trusted TLS cert (LG validates chains; no self-signed). |
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
- **Base:** `https://dousic.media/api/webos/v1`
  (app config is the bare host `https://dousic.media`; the app appends
  `/api/webos/v1`). Do not double the `/api`.
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
```json
{
  "url": "https://cdn.dousic-cdn.com/hls/c_123/master.m3u8",
  "protocol": "hls",
  "drm_scheme": null,
  "drm_license_url": null
}
```

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
| **`url`** | https URL | HLS `.m3u8`, or direct `.mp4`/`.mp3`. Host must be CSP-allowed (§1.1) and **HTTPS**. |
| **`protocol`** | string | **`"hls"`** for manifests, **`"video"`** for direct mp4, **`"audio"`** for mp3. Drives the player path — required. |
| `drm_scheme` | null | Keep **null** for MVP (unencrypted). A non-null value triggers a DRM stub that will not play. |
| `drm_license_url` | null | MVP: null. |

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
BASE=https://dousic.media/api/webos/v1

# 1) TLS + reachability + CORS preflight
curl -sI https://dousic.media | grep -i "HTTP/\|strict-transport"
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

1. Deploy the API per this spec to `https://dousic.media`.
2. Sideload the existing IPK (no rebuild needed — it already targets
   `dousic.media`). If reinstalling, close the running app first or install
   over it to avoid `FAILED_REMOVE`.
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
| GET  | `/content/browse` | yes | `{items, genres}` |
| GET  | `/content/live` | yes | `{items}` |
| GET  | `/content/search?q=` | yes | `{results}` |
| GET  | `/content/{id}` | yes | detail object |
| GET  | `/content/{id}/stream` | yes | `{url, protocol, drm_scheme, drm_license_url}` |
| GET  | `/creators` | yes | `{items}` |
| GET  | `/creators/{handle}` | yes | creator detail |
| GET  | `/user/watchlist` | yes | `{items}` |
| POST | `/user/watchlist` | yes | `{ok}` |
| DELETE | `/user/watchlist/{id}` | yes | `{ok}` |
| GET  | `/user/history` | yes | `{items}` |
| POST | `/user/progress` | yes | `{ok}` |
| POST | `/telemetry/events` | yes | `2xx` (optional) |

All paths are under `https://dousic.media/api/webos/v1`.
