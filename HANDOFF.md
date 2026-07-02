# Dousic webOS — MVP Handoff

> **Update — May 15, 2026:** A second round of fixes has been applied
> against the source tree. See **`CHANGES.md`** for the full per-file
> record (audit findings B2 / B3 / B4 / B5, H3 / H4 / H5 / H6 / H7, M4,
> plus three diagnostic findings). The remaining work before LG cert
> submission is hardware QA — BUILD_GUIDE Section 14 matrix on a real
> 2019/2021 LG TV and one webOS 23+ TV.

Changes applied to the webOS client to get it running end-to-end against the
backend. Most changes resolve bugs from the April 2026 code review; the big
architectural change is swapping the WebSocket layer to pusher-js (against
Reverb on the backend).

**Target:** LG Content Store submission in ~3 weeks from receipt.

---

## What Gulzar / contractor need to do on first pull

```bash
cd dousic-webos
npm install                               # Picks up pusher-js (new)

cp .env.example .env.development          # Review new WS vars
# Edit .env.development to point at local backend:
#   REACT_APP_API_URL=http://localhost:8000
#   REACT_APP_WS_HOST=localhost
#   REACT_APP_WS_PORT=8080
#   REACT_APP_WS_TLS=false
#   REACT_APP_WS_KEY=dousic_local_key   (must match backend .env REVERB_APP_KEY)

npm run serve                             # Dev server on :8080

# With backend running (api on :8000, reverb on :8080):
# - Log in via guest → lands on Home
# - Click a live card → Player → video plays
# - From a separate terminal: curl http://localhost:8000/api/webos/v1/debug/broadcast-test
#   → LivePanel viewer counts should update in real time
```

For a real hardware test, build and sideload:
```bash
cp .env.example .env.production
# Edit for real API + WS hosts (api.dousic.media wss://api.dousic.media)
npm run pack-p                            # Build to dist/
npm run package                           # Create IPK
ares-install --device tv-kmo com.dousic.app.dousic_1.0.0_all.ipk
ares-launch --device tv-kmo com.dousic.app.dousic
```

---

## What changed (bug IDs match the MVP Plan)

### WebSocket layer — full swap
- **B1:** `src/services/ws.js` rewritten from scratch. Was: raw JSON
  WebSocket against a non-existent `/ws/feed` endpoint. Now: `pusher-js`
  client subscribing to the public `feed` channel on Reverb.
  - **Same external API** — `ws.on('viewer_update', handler)`,
    `ws.connect()`, `ws.disconnect()` all still work identically.
  - Reconnect logic and heartbeats are now handled by `pusher-js` (no
    longer hand-rolled in our code).
  - Dou-Stitch helpers (`joinDouStitch`, `leaveDouStitch`) **removed** —
    the feature is deferred past MVP. Add them back here when the feature
    is reintroduced.
- **`package.json`:** `pusher-js ^8.4.0` added.
- **`index.html` CSP:** `connect-src` updated to allow:
  - `ws://localhost:8080` (local dev Reverb)
  - `wss://api.dousic.media` and `wss://staging.dousic.media` (prod/staging)
  - The public HLS demo hosts used by the backend seeder
    (`test-streams.mux.dev`, `devstreaming-cdn.apple.com`,
    `demo.unified-streaming.com`)
- **`.env.example`:** new vars `REACT_APP_WS_KEY`, `REACT_APP_WS_HOST`,
  `REACT_APP_WS_PORT`, `REACT_APP_WS_TLS`. Old `REACT_APP_WS_URL` removed.

### Auth flow
- **B15:** `src/state/authStore.js` `init()` now calls `refreshAccessToken()`
  proactively on cold boot if a refresh token exists, **before** calling
  `/auth/me`. Saves one wasted round-trip per app launch (previously:
  /auth/me → 401 → /auth/refresh → retry /auth/me).
- `services/api.js` exports `refreshAccessToken` so `authStore` can call it
  without going through the 401 retry path.

### Telemetry
- **B8:** `src/platform/telemetry.js` no longer POSTs to a hardcoded
  `https://api.dousic.media/telemetry/v1/events` URL. Instead, it routes
  through `services/api.js` via a lazy dynamic import (avoids an import
  cycle) to `/telemetry/events`, which is the actual backend endpoint.
  The `apiKey` / `X-API-Key` concept has been removed — the backend uses
  JWT, not API keys.

### Video playback
- **B9:** `src/components/VideoPlayer.js` — `import Hls from 'hls.js'` is
  now a **dynamic** `await import('hls.js')` inside the non-native codepath.
  When `REACT_APP_NATIVE_HLS_ONLY=true` (the webOS default), the hls.js
  dynamic import is skipped entirely. Expected bundle size drop: ~400KB
  when `NATIVE_HLS_ONLY` is set.
- **B10:** `attachDRM` removed from the active codepath. For MVP, if a
  non-null `drmScheme` arrives on a Content object, we log a telemetry
  warning and proceed without attempting EME attachment. All seeded content
  has `drm_scheme=null` so this path is dormant in practice. When real DRM
  is wired (post-MVP), restore the EME flow in a new module — do NOT inline
  it back into VideoPlayer.
- **B11:** `PlayerPanel.js` stale-closure cleanup bug fixed. `meta` is now
  tracked in a `useRef` that the cleanup reads, so the ref's `.current`
  value at teardown correctly reflects the loaded `meta`. The previous
  closure captured the initial `null` value permanently, meaning the
  (now-removed) Dou-Stitch leave call never fired. The ref infrastructure
  is left in place because it's the correct pattern when the WS signaling
  is reintroduced.
- `REACT_APP_NATIVE_HLS_ONLY=true` is the new default in `.env.example`.

### Cleanup
- **B22:** Dead `ViewComponent` assignment removed from `App.js:189`.

---

## Matching backend assumptions

This client is tested against a backend where:
1. `POST /auth/login` returns `{access_token, refresh_token, expires_in, token_type, user}` (not just the token pair — see backend **B2** fix).
2. `POST /auth/pair` polling is NOT rate-limited at the 10rpm auth tier (see **B3**) — polling every 3 seconds works.
3. `GET /content/{id}/stream` returns a `url` that may be an unsigned public HLS URL for MVP (see **StreamUrlSigner** changes).
4. Reverb is running and `feed` channel broadcasts arrive with event names `viewer_update`, `stream_started`, `stream_ended`.

If any of those break, re-verify against the backend's HANDOFF.md.

---

## Remaining frontend work (from the MVP Plan, not yet done)

These are still in scope before submission — the plan has them in Week 2
Day 10 and Week 3 hardware-validation:

- **N+1 perf:** nothing to fix on the frontend; this is a backend-side
  optimization. The frontend's caching via `contentStore` is correct.
- **Hardware validation on real LG TVs** — full BUILD_GUIDE Section 14 QA
  matrix. Focus escapes, memory soak tests, cold-start timing, captioning
  behavior — all need real hardware.
- **Store listing assets** — capture screenshots from real TV, not emulator.
- **Sign production IPK** with the LG Seller Lounge cert once Rick issues it.

---

## How to verify each fix

```bash
# B1 — pusher-js is installed
grep pusher-js package.json
# Expected: "pusher-js": "^8.4.0"

# B8 — telemetry no longer has hardcoded URL
grep -c 'telemetry/v1/events' src/platform/telemetry.js
# Expected: 0

# B9 — hls.js is not statically imported
grep "^import Hls" src/components/VideoPlayer.js
# Expected: no output (only dynamic import remains)

# B11 — metaRef in PlayerPanel
grep -c 'metaRef' src/views/PlayerPanel.js
# Expected: >= 3

# B15 — refreshAccessToken in authStore
grep -c 'refreshAccessToken' src/state/authStore.js
# Expected: >= 2

# B22 — no dead ViewComponent line
grep -c 'const ViewComponent =' src/App/App.js
# Expected: 0
```

---

## Outstanding questions (from the MVP Plan, restated)

1. **LG Seller Lounge onboarding** — is Rick done, in progress, or blocked? Certificate issuance can take a week.
2. **Demo content** — who curates the initial catalog beyond public-domain streams?
3. **Store listing assets** — who takes screenshots, writes description, handles IARC?
4. **`api.dousic.media` DNS** — who owns, where does it currently point?
5. **Staging** — exists already, or provisioned this sprint?
6. **Contractor ramp** — familiar with Laravel 11 and Enact? If not, add 2-3 days.

---

**Contact:** Original code review + plan author, via the thread that produced this handoff.
