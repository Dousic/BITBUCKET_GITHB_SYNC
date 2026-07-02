# MEMO — Stand up the Dousic webOS API at `api.dousic.media`

**To:** Backend / Platform engineering
**From:** webOS app team
**Re:** Bring the LG TV app online end-to-end
**Companion doc:** `docs/API_BACKEND_SPEC.md` (the exact, field-level request/response
contract — this memo is the *how to stand it up*; that doc is the *what every
endpoint returns*. Read both.)

---

## 1. TL;DR / what we need from you

The LG webOS app is **finished and shipping**. It is hard-wired to call:

```
https://api.dousic.media/api/webos/v1/<endpoint>
```

It cannot be tested on a real TV until that API is live and conforms to the
contract. Nothing in the app changes from your side — **deploy the API to that
host/path and the existing IPK works as-is.** Three things have repeatedly
blocked us; fix these and we're unblocked:

1. **The host must be exactly `api.dousic.media`** (its own subdomain, valid
   public TLS) and routes mounted at **`/api/webos/v1`** (the prefix the API is
   currently deployed under; the app matches it exactly).
2. **CORS for a `file://` origin.** The TV app runs from `file://`, so requests
   arrive with `Origin: null`. Every endpoint (incl. preflight `OPTIONS`) must
   return permissive CORS or the TV silently blocks the call.
3. **All media/image URLs must be HTTPS** on `*.dousic.media` or
   `*.dousic-cdn.com`. `http://` URLs are blocked by the app's CSP and render
   as black tiles — this is why artwork has been black.

---

## 2. The decision (locked)

| Concern | Value |
|---|---|
| API host | `api.dousic.media` (dedicated subdomain) |
| API base path | `/api/webos/v1` |
| Full base | `https://api.dousic.media/api/webos/v1` |
| Auth | Bearer access token (short-lived) + rotating refresh token |
| Realtime | Laravel Reverb (Pusher protocol) at `wss://ws.dousic.media:443` |
| Assets/media | HTTPS on `*.dousic-cdn.com` (preferred) or `*.dousic.media` |
| Consumer pair page | `https://dousic.media/pair` (web page, NOT the API) |

Rationale for the subdomain: it's consistent with `ws.dousic.media` and the
CDN, lets the API scale/route/cache independently of the marketing site, and is
the conventional `api.*` pattern. The app's CSP already allows
`https://*.dousic.media`, so this needs no app change.

---

## 3. Phase 0 — Infrastructure (do this first; it unblocks everything)

### 3.1 DNS + TLS
- Create `api.dousic.media` (A/AAAA or CNAME to your LB/ingress).
- Issue a **publicly-trusted** TLS cert (LetsEncrypt/ACM/etc). LG TVs validate
  the chain — **no self-signed, no missing intermediates.** A wildcard
  `*.dousic.media` cert covers `api.` and `ws.` in one go.
- Confirm: `curl -sI https://api.dousic.media` returns a TLS handshake + HTTP
  response (not a cert error).

### 3.2 Route the subdomain to the API app
- Point `api.dousic.media` at the Laravel app (separate vhost / ingress rule).
- The API is deployed under `/api/webos/v1` (Laravel's `routes/api.php` adds the
  `/api` prefix; the group below adds `webos/v1`). Keep it there — the app is
  built to match this exact path.

  ```php
  // routes/api.php  (Laravel auto-prefixes this file with /api)
  Route::prefix('webos/v1')
      ->middleware(['api', 'cors'])     // see CORS below → final path /api/webos/v1
      ->group(function () {
          // auth (public)
          Route::post('/auth/pair/request', [PairController::class, 'request']);
          Route::post('/auth/pair',         [PairController::class, 'poll']);
          Route::post('/auth/refresh',      [AuthController::class, 'refresh']);
          Route::post('/auth/guest',        [AuthController::class, 'guest']);
          Route::post('/auth/login',        [AuthController::class, 'login']);

          // authenticated
          Route::middleware('auth:webos')->group(function () {
              Route::get('/auth/me',     [AuthController::class, 'me']);
              Route::post('/auth/logout',[AuthController::class, 'logout']);

              Route::get('/content/home',         [ContentController::class, 'home']);
              Route::get('/content/featured',     [ContentController::class, 'featured']);
              Route::get('/content/browse',       [ContentController::class, 'browse']);
              Route::get('/content/live',         [ContentController::class, 'live']);
              Route::get('/content/search',       [ContentController::class, 'search']);
              Route::get('/content/{id}',         [ContentController::class, 'show']);
              Route::get('/content/{id}/stream',  [ContentController::class, 'stream']);

              Route::get('/creators',          [CreatorController::class, 'index']);
              Route::get('/creators/{handle}', [CreatorController::class, 'show']);

              Route::get('/user/watchlist',          [WatchlistController::class, 'index']);
              Route::post('/user/watchlist',         [WatchlistController::class, 'store']);
              Route::delete('/user/watchlist/{id}',  [WatchlistController::class, 'destroy']);
              Route::get('/user/history',            [HistoryController::class, 'index']);
              Route::post('/user/progress',          [ProgressController::class, 'store']);

              Route::post('/telemetry/events', [TelemetryController::class, 'ingest']);
          });
      });
  ```
- **Important:** the final path must be exactly `/api/webos/v1/...`. If you move
  the routes out of `routes/api.php`, add the `api/` prefix back yourself so the
  path doesn't change (the app is pinned to `/api/webos/v1`).

### 3.3 CORS (the #1 thing that silently breaks file:// apps)
The app uses Bearer tokens, not cookies, so the simplest correct config is a
wildcard origin and **no credentials**. In Laravel `config/cors.php`:

```php
return [
    'paths' => ['api/webos/v1/*'],
    'allowed_methods' => ['GET', 'POST', 'DELETE', 'OPTIONS'],
    'allowed_origins' => ['*'],            // Bearer auth, no cookies
    'allowed_headers' => [
        'Authorization', 'Content-Type', 'Accept',
        'X-Dousic-Platform', 'X-Dousic-Device-Id',
    ],
    'exposed_headers' => [],
    'max_age' => 86400,
    'supports_credentials' => false,       // MUST be false when origin is '*'
];
```
- Ensure preflight **`OPTIONS`** on every `/api/webos/v1/*` route returns `204`
  with these headers (Laravel's `HandleCors` middleware does this if `paths`
  matches — verify it's in the global middleware stack).
- The TV sends custom headers (`X-Dousic-*`) + `Authorization`, which always
  triggers a preflight, so this is exercised on the very first call.

### 3.4 Auth driver
- Implement a `webos` guard that validates the Bearer **access token**
  (short-lived, ~15 min). Sanctum personal-access tokens or a custom JWT both
  work — the app only cares that `Authorization: Bearer <token>` is honored and
  that an expired/missing token yields **HTTP 401** (the app then calls
  `/auth/refresh` and retries once).
- Refresh tokens are long-lived, **rotated on each `/auth/refresh`**, and
  revocable on logout.

### 3.5 Reverb (realtime)
- Run Reverb at `wss://ws.dousic.media:443` (TLS), reachable publicly.
- App key **must** equal `dousic-key-6ae2A2uIDb38GR3l` (baked into the build).
- Public channel `feed`. See Phase 4.

### 3.6 CDN / asset origin
- Serve images and HLS/MP4 over HTTPS from `*.dousic-cdn.com` (preferred) or
  `*.dousic.media`. Set `Access-Control-Allow-Origin: *` on media responses
  (the TV fetches them cross-origin from `file://`).

**Phase 0 done when:** `curl -sI https://api.dousic.media` is healthy, and an
`OPTIONS https://api.dousic.media/api/webos/v1/content/home` returns the CORS
headers above.

---

## 4. Phase 1 — Auth & pairing (unblocks: getting past the login screen)

Implement, in this order:

1. **`POST /auth/guest`** → `{access_token, refresh_token, user:{id, display_name, is_guest:true}}`.
   This alone lets us smoke-test the whole app as a guest. Do it first.
2. **`POST /auth/pair/request`** → `{code, expires_in}` (short human code shown on TV).
3. **`POST /auth/pair`** (polled): return one of
   - **pending:** `200` with **no** tokens — e.g. `{"status":"pending"}`. *(Do
     NOT return 4xx/5xx for "not redeemed yet" — the app reads that as a
     transient error and waits forever.)*
   - **success:** `200` with `{access_token, refresh_token, user}`.
   - **dead code:** `410 Gone` **or** a `4xx` with one of these `code` values:
     `PAIRING_EXPIRED|PAIRING_INVALID|PAIRING_NOT_FOUND|PAIRING_DENIED|PAIRING_REVOKED|PAIRING_CONSUMED|CODE_EXPIRED|CODE_INVALID|CODE_NOT_FOUND|CODE_CONSUMED`.
4. **`POST /auth/refresh`** → `{access_token, refresh_token}` (rotate). `401` on failure.
5. **`GET /auth/me`** → user object.
6. **`POST /auth/logout`** → `{ok:true}`.
7. The consumer **`/pair`** web page on `dousic.media` that redeems the code.

Error body format everywhere: `{"error":"message","code":"MACHINE_CODE"}` with
the correct HTTP status. Use `4xx` for expected client conditions (the app does
not log those to telemetry); reserve `5xx` for real faults.

**Phase 1 done when:** guest sign-in lands on Home, and a phone redemption of
the on-screen code signs the TV in.

---

## 5. Phase 2 — Content for Home + playback (unblocks: artwork + video)

1. **`GET /content/home`** → object with optional arrays
   `continue_watching, live_now, featured_creators, trending, new_releases`
   (each an array of *content items* — see spec §4.1). Omit `dou_stitch_broadcasts`.
2. **`GET /content/featured`** → `{items:[…]}` for the hero carousel.
3. **`GET /content/{id}`** → detail object (spec §4.2): `backdrop_url`,
   optional `logo_url`, `logline`/`description`, `year`, `genre`,
   `duration_label`, `rating`, `creator{display_name,handle}`, `is_live`,
   `resume_position`, `in_watchlist`, `price`, `is_free`, `related[]`.
4. **`GET /content/{id}/stream`** → `{url, protocol, drm_scheme:null, drm_license_url:null}`
   where `protocol` is `"hls"` (manifest) / `"video"` (mp4) / `"audio"` (mp3).

**Content-item field names** (return the canonical ones; aliases are tolerated
but don't rely on them): `id`, `title`, `thumbnail_url`, `subtitle`,
`creator{handle,display_name}`, `is_live`, `viewer_count`, `duration` (sec),
`type` (`video`/`audio`), `price` (number), `is_free` (bool). Full table in
spec §4.1.

**Asset rules (this is the "black artwork" fix):**
- Every `thumbnail_url` / `backdrop_url` / `logo_url` / avatar **must be
  `https://`** on a CSP-allowed host. No `http://`, no hosts outside
  `*.dousic.media` / `*.dousic-cdn.com`.
- Provide sanely-sized variants (don't ship 4K into 360px cards; the app
  declares only 256 MB). Backdrops ~1920×1080, cards ~640×360, logos
  transparent PNG.

**Media rules (this is the "video won't play" fix):**
- The app is **native-HLS-only** (no bundled hls.js). Serve a valid
  multi-bitrate `master.m3u8` over HTTPS with `Content-Type:
  application/vnd.apple.mpegurl`, H.264/AAC, and **CORS headers on the manifest
  AND every segment**. Direct `.mp4`/`.mp3` also fine with `Accept-Ranges: bytes`.
- DRM is out of scope for first submission — ship unencrypted, `drm_scheme:null`.

**Phase 2 done when:** Home shows real artwork, a title page renders its
backdrop + price, and Play streams video on the TV.

---

## 6. Phase 3 — Browse / Live / Search / Creators / User

- **`GET /content/browse?<filters>`** → `{items:[…], genres:[…]}`. Honor filter
  query params (e.g. `?genre=music`); return a generous first page (≥50) or
  implement paging (we'll wire infinite scroll later). *(This is the "only a
  small part of the content shows" fix — it's backend pagination.)*
- **`GET /content/live?<filters>`** → `{items:[…]}` (each `is_live:true`, `viewer_count`).
- **`GET /content/search?q=<q>&<filters>`** → **`{results:[…]}`** (note the
  `results` key, not `items`). App queries only when `q` length ≥ 2.
- **`GET /creators`** → `{items:[…]}`; **`GET /creators/{handle}`** → creator detail.
- **User:** `GET /user/watchlist`→`{items}`, `POST /user/watchlist`{content_id},
  `DELETE /user/watchlist/{id}`, `GET /user/history`→`{items}`,
  `POST /user/progress`{content_id,position,duration}.

---

## 7. Phase 4 — Realtime (Reverb) + telemetry

**Reverb / `feed` channel** — broadcast these with exact `broadcastAs()` names
and payloads (`broadcastWith()`):

| Event (`broadcastAs`) | Payload (`broadcastWith`) |
|---|---|
| `viewer_update` | `{ "content_id": "c_123", "viewer_count": 1240 }` |
| `stream_started` | any (app refetches `/content/live`) |
| `stream_ended` | any (app refetches `/content/live`) |

```php
class ViewerUpdate implements ShouldBroadcast {
    public function broadcastOn() { return new Channel('feed'); }   // public channel
    public function broadcastAs() { return 'viewer_update'; }
    public function broadcastWith() { return ['content_id'=>$this->id,'viewer_count'=>$this->count]; }
}
```
- Reverb app key must be `dousic-key-6ae2A2uIDb38GR3l`, TLS on, port 443.
- This is enhancement-only; the app degrades gracefully if Reverb is down.

**Telemetry (optional but recommended):** `POST /api/webos/v1/telemetry/events`
accepts `{events:[…]}` (each `{type,timestamp,name?,message?,level?,properties?,context?}`)
and returns `2xx`. Implement `TelemetryController::ingest()` to validate +
sink; returning anything other than 2xx will surface as client errors.

---

## 8. Cross-cutting rules (apply to every endpoint)

- **Always JSON.** Correct HTTP status codes.
- **Error shape:** `{"error":"…","code":"…"}`.
- **CORS** on every route incl. `OPTIONS` (Phase 0.3).
- **HTTPS-only** asset/media URLs on allowed hosts.
- Keep responses **< 30s** (client timeout). The app auto-retries once on a
  network failure and refreshes once on 401 — don't rely on that as flow control.

---

## 9. Definition of done (hand back to QA when all true)

Run the curl battery in **`docs/API_BACKEND_SPEC.md` §9** against
`https://api.dousic.media/api/webos/v1`. All boxes in §9 must pass, specifically:

- [ ] Valid public TLS on `api.dousic.media`, `ws.dousic.media`, asset hosts.
- [ ] `OPTIONS` on every endpoint returns the CORS headers (§3.3).
- [ ] `/auth/guest` returns `access_token` + `user`; `/auth/pair` pending =
      **200 no tokens**, dead = **410**/terminal code.
- [ ] `/content/home` returns the documented keys; `/content/{id}` returns
      `backdrop_url` + price; `/content/{id}/stream` returns `url` + `protocol`.
- [ ] **Every** image/media URL is HTTPS on an allowed host and returns 200.
- [ ] HLS manifest + segments are HTTPS, correct MIME, send `Access-Control-Allow-Origin`.
- [ ] `wss://ws.dousic.media` accepts the app key and broadcasts `feed` events.
- [ ] `dousic.media/pair` redeems the on-screen code.

Then we sideload the IPK, walk spec §10, and verify on the TV. If anything is
blank, the TV Web Inspector (`ares-inspect --app com.dousic.app.dousic`) →
Network tab tells us instantly (CSP/host mismatch, CORS, or 401). Send us one
failing request's URL + response and we'll pinpoint it.

---

## 10. The three gotchas that have already cost us time

1. **`file://` CORS** — without `Access-Control-Allow-Origin` on the response
   (and a working `OPTIONS` preflight), the TV gets *nothing* and the screen
   stays blank. Test with a real preflight, not just a GET.
2. **`http://` images = black tiles** — the app's CSP blocks non-HTTPS images.
   Return HTTPS URLs only.
3. **Pairing "pending" must be 2xx-without-tokens** — returning 4xx/5xx for
   "code not redeemed yet" makes the TV poll forever. "Dead" = 410 or a
   terminal `code`; "not yet" = 200 with no tokens.

Questions on any field shape → see `docs/API_BACKEND_SPEC.md` (it has example
JSON for every endpoint). Anything else, ping the app team.
