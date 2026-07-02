# Dousic webOS — Build, Sideload & Deploy Guide

**Target audience:** Dousic engineering (Gulzar + contractors)
**Goal:** A repeatable, documented path from source → installable IPK → LG Content Store submission
**Last updated:** April 2026

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Project Structure](#2-project-structure)
3. [First-Time Setup](#3-first-time-setup)
4. [Development Loop](#4-development-loop)
5. [Building for Production](#5-building-for-production)
6. [Packaging the IPK](#6-packaging-the-ipk)
7. [Sideloading to a Real TV](#7-sideloading-to-a-real-tv)
8. [Debugging with ares-inspect](#8-debugging-with-ares-inspect)
9. [Signing for LG Content Store](#9-signing-for-lg-content-store)
10. [Submission Workflow](#10-submission-workflow)
11. [CI/CD Pipeline](#11-cicd-pipeline)
12. [Troubleshooting](#12-troubleshooting)
13. [Performance Tuning](#13-performance-tuning)
14. [QA Test Matrix](#14-qa-test-matrix)

---

## 1. Prerequisites

### Host OS

- **macOS 12+** (Intel or Apple Silicon, Rosetta not required)
- **Linux** (Ubuntu 22.04+, Fedora 38+)
- **Windows 10/11** (WSL2 recommended for consistency)

### Required tooling versions

| Tool | Version | Why |
|---|---|---|
| Node.js | 20.12+ LTS | Enact CLI 6.x requires Node 18+; 20 LTS is stable |
| npm | 10+ | Ships with Node 20 |
| Python | 3.10+ | Required by LG webOS SDK scripts |
| Git | 2.40+ | Standard |
| LG webOS TV SDK (CLI) | 1.12+ | `ares-*` command family |

### Install Node via version manager

```bash
# Recommended: nvm (macOS / Linux)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20
nvm use 20
nvm alias default 20

# Verify
node --version   # v20.x.x
npm --version    # 10.x.x
```

### Install LG webOS TV SDK

LG maintains two SDK distributions. For command-line builds and CI, install **webOS TV CLI** (the `ares-*` family). The full IDE is optional.

**macOS / Linux:**

```bash
# Download from LG developer portal (requires free account)
# https://webostv.developer.lge.com/develop/tools/cli-installation

# Install via npm (the modern path)
npm install -g @webosose/ares-cli

# Verify
ares --version
ares-package --help
```

**Windows:** Use the installer from the LG portal, or install WSL2 and follow the Linux path.

> **Note:** The LG portal occasionally rotates download URLs. If the npm route fails, grab the tarball directly from `https://webostv.developer.lge.com/develop/tools/cli-installation` and run its `install.sh`.

### Install project dependencies

```bash
cd dousic-webos
npm install
```

This pulls the full Enact stack (`@enact/core`, `@enact/moonstone`, `@enact/spotlight`, `@enact/webos`, `@enact/ui`, `@enact/i18n`), React 18, Zustand, HLS.js, and the Enact CLI as a devDependency.

---

## 2. Project Structure

```
dousic-webos/
├── appinfo.json              # webOS manifest (cert-required keys: requiredMemory, handlesRelaunch, disableBackHistoryAPI)
├── index.html                # Entry HTML with CSP + inline splash
├── index.js                  # Enact bootstrap, mounts <App />
├── package.json              # Dependencies + npm scripts
├── .enactrc                  # Enact build config (target, publicPath, screenTypes)
├── .env.example              # Environment variable template
├── .arespackageignore        # Files excluded from IPK (prevents audit regression)
├── .gitignore                # Includes *.crt, *.key — never commit certs
│
├── src/
│   ├── App/App.js            # Root <App /> with MoonstoneDecorator
│   ├── platform/             # Luna, DRM, telemetry — the webOS boundary
│   │   ├── luna.js           # 20 Luna service wrappers
│   │   ├── drm.js            # Widevine + PlayReady key system picker
│   │   └── telemetry.js      # Device-tagged error & event reporting
│   ├── services/
│   │   ├── api.js            # REST client w/ refresh-token rotation
│   │   └── ws.js             # WebSocket w/ exponential backoff reconnect
│   ├── state/                # Zustand stores
│   │   ├── authStore.js
│   │   ├── appStore.js       # View stack, lifecycle, notifications
│   │   └── contentStore.js   # Home/live/browse cache, 2min TTL
│   ├── hooks/
│   │   └── usePlatform.js    # useBackKey, useCaptions, useNetwork, ...
│   ├── views/                # Panel components
│   │   ├── HomePanel.js      # Hero carousel + 6 rails
│   │   ├── BrowsePanel.js    # Genre chips + grid
│   │   ├── LivePanel.js      # Real-time viewer counts via WS
│   │   ├── SearchPanel.js    # On-screen keyboard
│   │   ├── ProfilePanel.js   # Watchlist + history + account
│   │   ├── PlayerPanel.js    # HLS/DRM playback + transport controls
│   │   ├── ContentDetailPanel.js
│   │   ├── CreatorPanel.js
│   │   ├── LoginPanel.js     # Pairing code flow + guest mode
│   │   └── SettingsPanel.js
│   ├── components/           # Shared UI primitives
│   │   ├── NavBar.js         # Collapsible side nav (icon → labeled)
│   │   ├── ContentCard.js    # Spotlight-aware focus card
│   │   ├── ContentRail.js    # Horizontal rail with Spotlight container
│   │   ├── HeroCarousel.js   # Auto-rotating cinematic hero
│   │   ├── VideoPlayer.js    # Native-HLS-first, hls.js fallback
│   │   ├── ExitConfirmation.js
│   │   ├── OfflineBanner.js
│   │   ├── NotificationHost.js
│   │   ├── ErrorBoundary.js
│   │   └── BootScreen.js
│   ├── i18n/
│   │   ├── index.js          # Locale resolver + t()
│   │   ├── en-US.json        # English (launch market)
│   │   ├── ko-KR.json        # Korean (LG's home market)
│   │   └── es-419.json       # Latin American Spanish
│   └── styles/
│       ├── variables.less    # Design tokens (colors, spacing, typography)
│       ├── global.less       # Reset + base styles + Moonstone overrides
│       └── font-override.js  # LG Smart UI → Museo Sans → system fallback
│
├── resources/
│   └── icons/                # Bundled launcher/splash assets (256x256, 1920x1080)
│
└── docs/
    └── BUILD_GUIDE.md        # This file
```

### The one-way rule of webOS packaging

**Everything you want on the TV must live at the repo root or under `dist/` after build.** `ares-package` takes a directory and wraps it in an IPK. It does not traverse `node_modules/` intelligently, does not understand bundlers, and does not care about your Git history. Keep that directory clean.

---

## 3. First-Time Setup

### Clone and install

```bash
git clone git@github.com:dousic/webos.git dousic-webos
cd dousic-webos
npm install
```

### Create your .env file

```bash
cp .env.example .env.development
```

Open `.env.development` and fill in values. For local dev against staging:

```
REACT_APP_API_URL=https://staging.dousic.media
REACT_APP_WS_URL=wss://staging.dousic.media/ws/feed
NODE_ENV=development
REACT_APP_TELEMETRY_KEY=
REACT_APP_RELEASE=1.0.0-dev
REACT_APP_FEATURE_DOU_STITCH=true
REACT_APP_NATIVE_HLS_ONLY=false
```

For production builds you'll make `.env.production` with the live API and set `NODE_ENV=production`.

### Verify build tools

```bash
npx enact --version     # Should print 6.x.x
ares --version          # Should print 1.12+ or the tarball's version
```

If `enact` is unrecognized, your `node_modules/.bin` isn't on PATH — run via `npx enact` or `npm run` scripts.

---

## 4. Development Loop

### Local dev server (browser)

```bash
npm run serve
```

Opens `http://localhost:8080` in your default browser. Hot-reloads on file changes. Fast iteration for layout, state, and logic work that doesn't need real Luna APIs.

**What you can test in browser:** everything except `luna://` calls and hardware DRM. The `luna.js` module returns safe fallback values when `PalmSystem` isn't present, so the app boots cleanly without a TV.

**What you cannot test in browser:**
- Caption preference subscription (always returns `off`)
- Real network state (falls back to `navigator.onLine`)
- Widevine/PlayReady DRM (Chrome's Widevine works for unencrypted streams but not for LG-specific PlayReady content)
- The Magic Remote pointer's auto-switch to directional mode
- Memory pressure / OOM kill behavior

For those, use the emulator (next section) or real hardware.

### Running on the LG webOS TV Emulator

LG's emulator is a VirtualBox image that simulates a webOS TV. Usable for basic smoke testing but diverges from real hardware on performance, memory, and video pipeline behavior.

1. Download the emulator VM from LG's dev portal (~2GB download)
2. Import into VirtualBox
3. Start the VM (it boots into webOS home screen)
4. Register the emulator as a target device:

   ```bash
   ares-setup-device --add emulator --info "{'host':'127.0.0.1','port':6622,'username':'developer'}" --default
   ```
5. Confirm it's reachable:

   ```bash
   ares-device-info --device emulator
   ```

Build, package, install, and launch (see following sections) using `--device emulator` flag.

### Recommended dev iteration loop

```
Local browser (fast) → Emulator (sanity check) → Real TV (ship-stop)
```

Don't make every change on real hardware — it's slow. Don't make every change only in browser — it's lying to you about TV constraints.

---

## 5. Building for Production

### Build command

```bash
# For production
npm run pack-p

# For debug build (source maps, not minified)
npm run pack
```

Enact's packer (`enact pack -p`) runs webpack under the hood and writes the built app into `./dist/`. That's the directory `ares-package` will turn into an IPK.

### What the build does

1. Compiles JSX, ES2020+ to ES2018 (per `.enactrc` target)
2. Bundles CSS modules with Less processing
3. Inlines the `.enactrc` screenTypes into rem math (1920×1080 = 24px rem; UHD auto-scales to 48px)
4. Tree-shakes unused Moonstone components
5. Emits `dist/index.html`, `dist/index.js`, `dist/main.css`, and `dist/resources/` assets with **relative paths** (because `publicPath: './'` in `.enactrc`)

### Verify the build

```bash
ls -la dist/
cat dist/index.html | head -20
```

You should see:
- `dist/index.html` with `./main.js` and `./main.css` references (no leading `/`)
- `dist/main.js` of roughly 400–600 KB
- `dist/main.css` of roughly 20–40 KB
- No `dist/src/` directory (empty scaffolding must not ship)
- No `.map` files in production builds (Enact strips these with `-p`)

### Common build failures

**"Cannot find module '@enact/moonstone/...'"**
→ Run `npm install` — the Moonstone package is peer-depended on by others in the Enact stack.

**"Less compilation error"**
→ Check that all `.module.less` files import `'../styles/variables.less'` with the correct relative path. The design tokens must be visible from any stylesheet.

**"Unexpected token" in production build**
→ The `target: ["Chrome >= 69"]` in `.enactrc` forces ES2018 output. If you're using a newer language feature (like `??=`), either downgrade the syntax or add a Babel plugin.

---

## 6. Packaging the IPK

After `npm run pack-p` produces `dist/`, build the IPK:

```bash
# One-shot: build + package (writes the IPK to build/)
npm run package

# Or manually
ares-package dist/

# Set the IPK output path with -o / --outdir
ares-package dist/ -o build
```

The `ares-package` command:
1. Copies `dist/` contents into a temp directory
2. Reads `appinfo.json` (must be at the root of the source dir)
3. Applies `.arespackageignore` patterns to exclude files
4. Creates a Debian-format `.ipk` file. By default it lands in the current
   working directory; pass `-o <dir>` (`--outdir`) to set the IPK path. The
   `npm run package` script uses `-o build`, so the IPK is written to `build/`
   (already gitignored), and `npm run deploy` installs it from there.

### Verify the IPK

```bash
# Inspect without installing
ares-inspect --info com.dousic.app.dousic_1.0.0_all.ipk

# Check what's inside
mkdir -p /tmp/ipk-check && cd /tmp/ipk-check
ar x ../path/to/com.dousic.app.dousic_1.0.0_all.ipk
tar tzf data.tar.gz | head -30
```

**What you should NOT see in the IPK listing:**
- `.gitignore` or `.git/`
- `src/` directory
- `node_modules/`
- `package.json` (this is the dev one, not shipped)
- Any `.env*` files

If any of those appear, your `.arespackageignore` is misconfigured. This is exactly the audit finding from the shipped IPK — don't regress.

### Size budget

| Component | Target | Current Dousic |
|---|---|---|
| Total IPK | <3 MB | ~1.8 MB |
| JS bundle | <600 KB | ~450 KB (without HLS.js on webOS 4.5+) |
| CSS | <50 KB | ~30 KB |
| Resource images | <500 KB | Varies with icon/splash assets |

---

## 7. Sideloading to a Real TV

### Enable Developer Mode on your LG TV

1. From the TV home screen, download the **Developer Mode** app from the LG Content Store (it's free, by LG).
2. Open the Developer Mode app.
3. Sign in with your LG developer account (same credentials as Seller Lounge).
4. Toggle **Dev Mode Status** to ON.
5. Note the **IP address** shown on screen (something like `192.168.1.42`).
6. **Keep the Developer Mode app running** — dev mode disables after 50 hours if the app is closed, and the TV must be reachable over the network.

### Pair your machine to the TV

```bash
# Get the TV's IP from the Developer Mode app's home screen
ares-setup-device \
  --add tv-kmo \
  --info "{'host':'192.168.1.42','port':9922,'username':'prisoner'}" \
  --default

# Verify connectivity
ares-device-info --device tv-kmo
```

First time, the TV will prompt you to accept the connection. On subsequent connects it's automatic.

> **Note:** The `prisoner` username and port `9922` are LG's dev-mode defaults. Do not change them.

### Install and launch

```bash
# Install
ares-install --device tv-kmo com.dousic.app.dousic_1.0.0_all.ipk

# Launch
ares-launch --device tv-kmo com.dousic.app.dousic

# Close (when you want to reset state for testing)
ares-launch --close --device tv-kmo com.dousic.app.dousic
```

### What to watch for on first TV launch

1. **Splash screen appears within ~100ms** (the inline CSS splash in `index.html`)
2. **App content appears within 3 seconds** on webOS 4.5 hardware
3. **Magic Remote pointer** highlights buttons as you move it around
4. **Put remote down** — after 3s, pointer hides and focus-driven (directional) mode activates
5. **Press Back on Home view** — exit confirmation dialog appears
6. **Press Home** — app backgrounds; relaunching returns to last view

If any of those don't behave as described, check the Troubleshooting section.

---

## 8. Debugging with ares-inspect

`ares-inspect` attaches Chrome DevTools to your running webOS app. This is the single most useful tool in the workflow.

### Start an inspect session

```bash
# Terminal 1: launch app
ares-launch --device tv-kmo com.dousic.app.dousic

# Terminal 2: start inspect session
ares-inspect --device tv-kmo --app com.dousic.app.dousic --open
```

This opens Chrome DevTools attached to the app. You get the full DevTools surface: console, network, performance profiler, memory heap snapshots, elements inspector.

### What to inspect first

**Console tab:**
- Should be nearly silent. Any errors are bugs to fix before submission.
- Luna service calls log verbose output; you can safely filter them out once wiring is confirmed.
- React warnings about missing keys, deprecated APIs — address these before certification.

**Network tab:**
- API requests should go to `api.dousic.media` (or staging for dev builds). NOT `staging.dousic.media` in production builds.
- WebSocket connection to `/ws/feed` should establish within 2 seconds.
- Check `connect-src` in CSP — any blocked requests surface here as failed.

**Performance tab:**
- Cold-start profile: record for 10 seconds from app launch. Look for long tasks >50ms.
- React render chart: verify no unnecessary re-renders when the user navigates.

**Memory tab:**
- Take a heap snapshot 10 seconds after launch.
- After navigating Home → Browse → Home → Browse 10 times, take another snapshot.
- Compare. If memory grows unboundedly, you have a listener leak (usually a missing `unsubscribe` in a hook).

### Common Luna API inspection

```javascript
// In the DevTools console:

// Check if you're on a real webOS TV
window.PalmSystem?.deviceInfo

// Check launch parameters (useful for deep-link testing)
window.PalmSystem?.launchParams

// Test a Luna call directly
new window.webOS.service.request('luna://com.webos.service.systemproperty', {
  method: 'getSystemInfo',
  parameters: { keys: ['modelName', 'firmwareVersion'] },
  onSuccess: r => console.log('✓', r),
  onFailure: e => console.error('✗', e)
});
```

---

## 9. Signing for LG Content Store

### The Seller Certificate

LG issues a signing certificate to verified Seller Lounge accounts. This cert binds an IPK to your company identity. Production submissions must be signed with it.

**Obtaining the cert:**

1. Log into [Seller Lounge](https://seller.lgappstv.com) as an authorized company contact (Rick, Legal).
2. Navigate to **My Apps → Certificate Management**.
3. Click **Issue Certificate**. This generates a `.crt` file bound to your company account.
4. Download and store securely. **Never commit to git.** The `.gitignore` already excludes `*.crt` and `*.key`.

### Sign an IPK

```bash
ares-package dist/ \
  --app-keystore /secure/path/to/dousic-seller.key \
  --ipk-signing-certificate /secure/path/to/dousic-seller.crt \
  --sign-ipk
```

The resulting IPK has a cryptographic signature LG's store validates during upload.

### Keep keys out of version control

Store the cert and key in:
- A company password manager (1Password, Bitwarden)
- CI/CD encrypted secrets (GitHub Actions Secrets, AWS Secrets Manager)
- **Never** in git, **never** in unencrypted S3, **never** in Slack DMs

If the cert leaks, anyone can publish impersonating apps under the Dousic identity. LG takes this seriously — leaked-cert incidents have resulted in entire Seller accounts being suspended.

---

## 10. Submission Workflow

### Pre-flight checklist

Run this once per release, before you hit Submit in Seller Lounge. Each item corresponds to an audit finding from April 2026 — this list is the guard against regression.

```bash
# 1. Clean build
rm -rf dist/ *.ipk
npm run pack-p

# 2. Verify appinfo.json values
cat dist/appinfo.json | python3 -m json.tool | grep -E '(requiredMemory|handlesRelaunch|disableBackHistoryAPI|category|version)'
# Expected output:
#   "requiredMemory": 256,
#   "handlesRelaunch": true,
#   "disableBackHistoryAPI": true,
#   "category": "APP_ENTERTAINMENT",
#   "version": "1.0.0"

# 3. Verify no staging URLs in production bundle
grep -c 'staging\.dousic' dist/*.js
# Expected: 0

# 4. Verify CSP is present
grep -c 'Content-Security-Policy' dist/index.html
# Expected: 1

# 5. Package
ares-package dist/ \
  --app-keystore /path/to/seller.key \
  --ipk-signing-certificate /path/to/seller.crt \
  --sign-ipk

# 6. Verify nothing leaks into the IPK
ar x com.dousic.app.dousic_1.0.0_all.ipk
tar tzf data.tar.gz | grep -E '(\.gitignore|src/|\.env|node_modules)'
# Expected: no output

# 7. Install and smoke test on real TV
ares-install --device tv-kmo com.dousic.app.dousic_1.0.0_all.ipk
ares-launch --device tv-kmo com.dousic.app.dousic

# 8. Manual verification on the TV:
#    - Splash appears within 100ms
#    - Home screen renders within 3 seconds
#    - Directional remote navigation works
#    - Back on home triggers exit dialog
#    - Video plays with captions matching TV system setting
```

### Upload to Seller Lounge

1. Log into Seller Lounge → **My Apps → Create New App**
2. Fill the metadata (use the submission checklist doc for exact values)
3. Upload the signed `.ipk`
4. Upload store listing assets (screenshots, hero art, square art — see `resources/store-listing/README.md`)
5. Fill IARC content rating questionnaire
6. Submit for review

LG's cert team reviews in 2–4 weeks. Revisions after first review are normal.

---

## 11. CI/CD Pipeline

### Recommended GitHub Actions workflow

`.github/workflows/webos-ci.yml`:

```yaml
name: Build and verify webOS IPK

on:
  push:
    branches: [main, release/*]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install Enact CLI and webOS CLI
        run: npm ci

      - name: Install webOS CLI globally
        run: npm install -g @webosose/ares-cli

      - name: Lint
        run: npm run lint

      - name: Production build
        env:
          REACT_APP_API_URL: ${{ secrets.PROD_API_URL }}
          REACT_APP_WS_URL: ${{ secrets.PROD_WS_URL }}
          NODE_ENV: production
        run: npm run pack-p

      - name: Verify build hygiene
        run: |
          # No staging URLs
          test $(grep -c 'staging\.dousic' dist/*.js || echo 0) -eq 0

          # CSP present
          grep -q 'Content-Security-Policy' dist/index.html

          # Required appinfo values
          python3 -c "
          import json
          m = json.load(open('dist/appinfo.json'))
          assert m['requiredMemory'] == 256, f'bad memory: {m[\"requiredMemory\"]}'
          assert m['handlesRelaunch'] is True
          assert m['disableBackHistoryAPI'] is True
          assert m['category'] == 'APP_ENTERTAINMENT'
          "

      - name: Sign and package (release builds only)
        if: startsWith(github.ref, 'refs/heads/release/')
        env:
          SELLER_CERT: ${{ secrets.LG_SELLER_CERT }}
          SELLER_KEY: ${{ secrets.LG_SELLER_KEY }}
        run: |
          echo "$SELLER_CERT" > /tmp/seller.crt
          echo "$SELLER_KEY" > /tmp/seller.key
          ares-package dist/ \
            --app-keystore /tmp/seller.key \
            --ipk-signing-certificate /tmp/seller.crt \
            --sign-ipk
          rm /tmp/seller.key /tmp/seller.crt

      - name: Verify IPK contents
        run: |
          ar x *.ipk
          ! tar tzf data.tar.gz | grep -E '(\.gitignore|^src/|\.env|node_modules)'

      - name: Upload IPK artifact
        if: startsWith(github.ref, 'refs/heads/release/')
        uses: actions/upload-artifact@v4
        with:
          name: dousic-webos-ipk
          path: '*.ipk'
          retention-days: 30
```

### Version bumping

Adopt semver. The webOS version string in `appinfo.json` must be bumped every submission — LG's system rejects identical version strings as suspicious resubmission attempts.

```bash
# Patch bump for small fixes
npm version patch

# Minor bump for features
npm version minor

# Major bump for breaking API or UX changes
npm version major
```

Write a post-bump hook or CI script that writes `package.json`'s version into `appinfo.json`. Keeping them manually in sync causes subtle bugs.

---

## 12. Troubleshooting

### App crashes on launch on 2019-era TVs

**Cause:** Likely memory pressure. `requiredMemory: 256` should prevent this, but if HLS.js is loaded eagerly on a content-heavy home screen, the TV can still OOM.

**Fix:** Verify `REACT_APP_NATIVE_HLS_ONLY=true` in the build environment for production webOS builds. The VideoPlayer component then skips loading hls.js and relies on the TV's hardware HLS.

### Splash screen visible but app never loads

**Cause:** The `./main.js` reference in `index.html` isn't resolving. This happens when `publicPath` got set to `/` instead of `./` at build time.

**Fix:** Confirm `.enactrc` has `"publicPath": "./"`. Rebuild.

### Back key doesn't close app from home view

**Cause:** `disableBackHistoryAPI` is not set to true in appinfo.json, OR the exit confirmation useBackKey isn't registered.

**Fix:** Inspect the running app with ares-inspect and in the console run:
```javascript
// Check appinfo
console.log(window.PalmSystem?.identifier);
```
Also verify the `useExitConfirmation` is mounted when on home view.

### Video plays but captions are always off

**Cause:** `useCaptions()` hook isn't propagating the system preference, OR the video's text track language doesn't match the user's locale.

**Debug:**
```javascript
// In the DevTools console while player is active
const video = document.querySelector('video');
for (const track of video.textTracks) {
  console.log(track.kind, track.language, track.mode, track.label);
}
```

If no text tracks appear, the stream manifest doesn't include them. Check with your streaming team that HLS manifests include CEA-608/708 or WebVTT captions.

### Focus disappears when pressing Down from hero carousel to first rail

**Cause:** The spatial nav is trying to find an element that isn't yet rendered (rails load async).

**Fix:** Wrap the async-rendered rails in `<SpotlightContainerDecorator>` with `defaultElement` specified. Spotlight will fall back to the default when the nearest target isn't available yet.

### "Cannot find module '@webosose/ares-cli'" during CI

**Cause:** The npm package was renamed in 2023. Old docs reference `ares-cli` (no scope).

**Fix:** Use `@webosose/ares-cli` in `package.json` devDependencies, not `ares-cli`.

### IPK install fails with "signature invalid"

**Cause:** Either the cert has expired (they last ~1 year) or the key/cert pair is mismatched.

**Fix:** Download a fresh cert from Seller Lounge → Certificate Management.

### Emulator launches but app hangs on splash

**Cause:** Emulator's WebKit is flaky on certain Enact builds. Not representative of real hardware.

**Fix:** Skip the emulator for this class of issue and test on real hardware. Don't burn cycles debugging emulator-only problems.

---

## 13. Performance Tuning

Real LG TV hardware is modest: 2019 UM7300 runs an ARM Cortex-A53 at ~1.1 GHz with shared memory. The difference between a fast-feeling app and a slow-feeling app is whether you respect those constraints.

### Cold start budget (webOS 4.5 hardware, first-time launch, cleared cache)

| Milestone | Target | Dousic baseline |
|---|---|---|
| Splash visible | <200ms | ~100ms (inline CSS) |
| Main JS parsed | <2.5s | ~1.8s |
| First paint | <3s | ~2.3s |
| Home feed interactive | <4s | ~3.5s |

### Techniques that earn budget

1. **Inline splash in index.html.** Done. Saves the 2-3 second black screen while JS parses.
2. **Lazy-load HLS.js.** Done. Dynamic import inside PlayerPanel means the 400KB library loads only when the user plays something.
3. **Image preloading for hero carousel.** Add `<link rel="preload" as="image" href={firstHeroBackdrop} />` to HomePanel when data arrives.
4. **Defer WebSocket until after first paint.** Already handled by the auth gate — we don't connect WS until the user is authenticated and home has rendered.
5. **Keep content rail item counts reasonable.** Cap at 20 cards per rail. The 10-foot UX actively benefits from curation.

### Techniques that spend budget carelessly

- **Unbounded re-renders.** Check with React DevTools Profiler. The ContentCard component in particular must be memoized (it is, via Spottable's internal memo).
- **Full-scale 4K images on FHD.** Request thumbnails at display resolution. The backend should size thumbnails to ~480×270 for cards; 1920×1080 for backdrops.
- **Chained Luna calls.** Parallelize with `Promise.all` where possible. The boot sequence in App.js does this correctly.
- **Leaky listeners.** Every `useEffect` that adds an event listener must return a cleanup function. The `usePlatform.js` hooks enforce this pattern.

### Measuring on device

```bash
# Open inspect session
ares-inspect --device tv-kmo --app com.dousic.app.dousic --open

# In DevTools → Performance tab:
# 1. Click the record button
# 2. Close and relaunch the app on the TV
# 3. Stop recording after 15 seconds
# 4. Look at the flame graph — tasks > 50ms are bottlenecks
```

Real hardware is the only measurement that matters. Emulator perf is 2-5× faster than production TVs.

---

## 14. QA Test Matrix

The full test matrix is documented in the submission checklist doc. A condensed pre-submission smoke test for engineering:

| # | Scenario | Pass criteria |
|---|---|---|
| 1 | Cold launch | Splash <200ms, interactive <4s on webOS 4.5 |
| 2 | Directional nav: Home → rails → card → play | No focus escapes, no dead zones |
| 3 | Magic Remote pointer | Highlights clickable elements; clicks work |
| 4 | Back on home view | Shows exit confirmation dialog |
| 5 | Back on nested view (player) | Pops to previous view |
| 6 | Playback with captions off in TV settings | Video plays without captions |
| 7 | Playback with captions on in TV settings | Video plays with captions on by default |
| 8 | Playback, then Home button | Video pauses, app backgrounds |
| 9 | Return to app from LG home screen | Resumes where left off |
| 10 | Airplane mode toggle | Offline banner appears/dismisses |
| 11 | Deep link via relaunch params | Correct content loads |
| 12 | Guest mode | Can browse without sign-in; watchlist disabled |
| 13 | Pairing code login | 6-digit code displays; polls; completes |
| 14 | Sign out | Returns to login; tokens cleared |
| 15 | 30-min playback soak | No memory growth >20MB; no frame drops |

Run all 15 on at least one webOS 4.5 TV (the stress target) and one webOS 23+ TV (the modern target) before every submission.

---

## Appendix: Key commands reference

```bash
# Development
npm run serve                                # Browser dev server, port 8080
npm run lint                                 # ESLint

# Building
npm run pack                                 # Debug build → dist/
npm run pack-p                               # Production build → dist/
npm run clean                                # Remove dist/

# Packaging
ares-package dist/                           # Create IPK (in cwd)
ares-package dist/ -o build                  # Set IPK output path (--outdir)
ares-package dist/ --sign-ipk \              # Signed production IPK
  --app-keystore seller.key \
  --ipk-signing-certificate seller.crt

# Device management
ares-setup-device --add <name> --info "{...}"  # Register device
ares-device-info --device <name>               # Verify connection
ares-setup-device --remove <name>              # Unregister

# Install / launch / close
ares-install --device <name> com.dousic.app.dousic_1.0.0_all.ipk
ares-launch --device <name> com.dousic.app.dousic
ares-launch --device <name> --close com.dousic.app.dousic

# Debug
ares-inspect --device <name> --app com.dousic.app.dousic --open

# Inspect installed apps
ares-install --device <name> --list

# Uninstall
ares-install --device <name> --remove com.dousic.app.dousic

# Emulator-specific
ares-install --device emulator <ipk>
ares-launch --device emulator com.dousic.app.dousic
```

---

## Appendix: Key file paths on the TV

When `ares-install` puts your IPK on a TV, it extracts to:

```
/media/developer/apps/usr/palm/applications/com.dousic.app.dousic/
```

Via SSH (dev mode):

```bash
# Connect (the 'prisoner' username is LG's dev mode default)
ssh prisoner@<tv-ip> -p 9922

# See installed apps
ls /media/developer/apps/usr/palm/applications/

# Tail app log (anything your app console.log's)
journalctl -f | grep dousic
```

---

## Appendix: Audit finding → fix → verification table

This matrix exists so future submissions can verify the original audit concerns haven't regressed.

| Audit Finding (April 2026) | Fix Applied | Verification Command |
|---|---|---|
| `requiredMemory: 20` | Bumped to 256 in appinfo.json | `python -c 'import json; print(json.load(open("dist/appinfo.json"))["requiredMemory"])'` — expect 256 |
| `handlesRelaunch: false` | Set to true; webOSRelaunch handler wired in App.js | Test by sending a second launch via `ares-launch -p '{"contentTarget":"abc"}'` |
| No `luna://` calls | src/platform/luna.js provides 20 wrappers | `grep -c 'luna://' src/platform/luna.js` — expect 20+ |
| No back-on-root exit | useExitConfirmation hook + ExitConfirmation component | Manual: press Back on home view, dialog appears |
| Staging API hardcoded | Injected at build time via REACT_APP_API_URL | `grep -c 'staging' dist/*.js` — expect 0 |
| Domain sprawl (.com/.media/api.dousic.com) | Canonical: `api.dousic.media` | `grep -Eo 'https?://[a-z.]+' dist/*.js \| sort -u` — expect only api.dousic.media |
| No CSP meta tag | Added to index.html | `grep -c 'Content-Security-Policy' dist/index.html` — expect 1 |
| 130×130 icon | Upgraded to 256×256 | `file resources/icons/icon-256x256.png` — expect 256×256 |
| Tokens in localStorage without refresh | Refresh-token rotation in api.js | Code review: check `_refreshPromise` dedup in src/services/api.js |
| Stale build artifacts in IPK | .arespackageignore + clean build | `tar tzf *.ipk \| grep -c '\.gitignore'` — expect 0 |
| No telemetry/crash reporting | src/platform/telemetry.js | Code review: init wired in App.js |
| HLS.js 75% of bundle | Lazy import in PlayerPanel; skipped on webOS 4.5+ | Build size comparison: with vs. without REACT_APP_NATIVE_HLS_ONLY |

---

## Next steps after first submission

1. **Monitor Sentry / telemetry endpoint** for the first 48 hours after launch
2. **Watch Seller Lounge inbox** daily during review window
3. **Prepare first patch release** — set aside 1 week for bugfix iteration
4. **Begin Korean + Spanish localization pass** for Phase 2/3 markets
5. **Open dialogue with LG content team** once v1.0 is stable (featured placement ask)

The release isn't the finish line. It's the start of the relationship with LG and with the viewers on their TVs.

---

**Questions? Issues?**
- Engineering: `gulzar@dousic.media`
- Seller Lounge / legal: `rick@dousic.media`
- Build/CI problems: file an issue in the repo with the `webos` label
