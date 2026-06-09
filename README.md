# Dousic — webOS TV Application

> Universal Media Platform for Creators. Built on LG Enact for certified LG Content Store submission.

![webOS 4.5+](https://img.shields.io/badge/webOS-4.5%2B-FF00FF)
![Enact 4.7](https://img.shields.io/badge/Enact-4.7-222)
![React 18](https://img.shields.io/badge/React-18-61dafb)
![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red)

This is the webOS TV client for Dousic — a ground-up rewrite of the previous Vite/React SPA shell, rebuilt as a native Enact application with full `luna://` platform integration, spatial navigation via Spotlight, and a TV-first design system.

---

## Quick start

```bash
npm install
cp .env.example .env.development
npm run serve              # Dev in browser at localhost:8080
```

See [`docs/BUILD_GUIDE.md`](docs/BUILD_GUIDE.md) for the comprehensive build, sideload, sign, and submission workflow.

---

## Architecture at a glance

```
┌───────────────────────────────────────────────────────────┐
│  index.html  →  index.js  →  <App /> (MoonstoneDecorator) │
└──────────────────────┬────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
    Views            Shared         Platform
  (Panels)         Components        Layer
 ─────────────   ─────────────   ─────────────
  HomePanel      ContentCard       luna.js (Luna svc)
  BrowsePanel    ContentRail       drm.js  (EME)
  LivePanel      HeroCarousel      telemetry.js
  SearchPanel    NavBar
  ProfilePanel   VideoPlayer       Services
  PlayerPanel    ExitConfirmation  ─────────────
  ContentDetail  OfflineBanner     api.js  (REST + refresh)
  CreatorPanel   NotificationHost  ws.js   (WebSocket)
  LoginPanel     ErrorBoundary
  SettingsPanel  BootScreen        State (Zustand)
                                   ─────────────
                                   authStore
                                   appStore (nav stack)
                                   contentStore (cache)
```

---

## Design principles

**TV-first, not mobile-ported.** All layouts are designed for 1920×1080 with 10-foot viewing distance. Touch affordances exist only as fallback; focus-driven navigation is primary.

**Platform integration is a feature, not a checkbox.** The `luna://` layer respects system captions, locale, network state, and volume subscriptions. That's what separates "approved for LG Content Store" from "featured on the LG home screen."

**Graceful degradation, everywhere.** Every Luna call has a 5-second timeout and a sensible fallback. Every Luna subscription has an unsubscribe function. The app boots cleanly in a dev browser on a MacBook — useful for fast iteration — and runs correctly on a 2019 UM7300 TV.

**Build pipeline is a defensive measure.** `.arespackageignore`, explicit CSP, build-time environment injection, signed IPKs — these exist specifically to prevent the audit findings from the previous build from recurring. See the audit-finding-to-fix matrix in `docs/BUILD_GUIDE.md`.

---

## What's in this repo

| Path | Description |
|------|-------------|
| `src/App/` | Root App component with MoonstoneDecorator, auth gate, view routing |
| `src/views/` | 10 view panels (Home, Browse, Live, Search, Profile, Player, ContentDetail, Creator, Login, Settings) |
| `src/components/` | 10 shared UI primitives (NavBar, ContentCard, ContentRail, HeroCarousel, VideoPlayer, ExitConfirmation, OfflineBanner, NotificationHost, ErrorBoundary, BootScreen) |
| `src/platform/` | webOS boundary: Luna service wrappers, DRM detection, telemetry |
| `src/services/` | API client with refresh-token rotation; WebSocket for Dou-Stitch Live |
| `src/state/` | Zustand stores for auth, app nav, content cache |
| `src/hooks/` | React hooks for platform features (useBackKey, useCaptions, useNetwork, useVisibility, useRelaunch) |
| `src/i18n/` | English, Korean, Spanish (Latin American) bundles |
| `src/styles/` | Design token variables, global styles, font override |
| `resources/icons/` | Launcher icons and splash assets per LG spec |
| `appinfo.json` | webOS manifest (root of repo; what ares-package reads) |
| `.enactrc` | Enact build configuration |
| `.arespackageignore` | Files excluded from the IPK (audit defensive measure) |
| `.env.example` | Template for environment variables |
| `docs/BUILD_GUIDE.md` | Comprehensive build, sign, submission guide |

---

## Supported platforms

| webOS | Year | Status |
|-------|------|--------|
| 5.0 | 2020 | Minimum supported target |
| 6.0 | 2021 | Supported |
| 22 | 2022 | Supported |
| 23 | 2023 | Supported |
| 24 | 2024 | Supported |

Older webOS versions (4.x and earlier) are not supported. webOS 5.0 ships
Chromium 68; the Enact build target (`Chrome >= 69` in `.enactrc`) and the
use of CSS Grid for layout (Browse panel) require Chromium 57+. `requiredMemory: 256`
in the manifest declares our memory budget to the system.

---

## Environment variables

All configurable via `.env.*` files (never commit):

| Variable | Purpose | Example |
|---|---|---|
| `REACT_APP_API_URL` | REST API base URL | `https://api.dousic.media` |
| `REACT_APP_WS_URL` | WebSocket URL | `wss://api.dousic.media/ws/feed` |
| `NODE_ENV` | `production` or `development` | `production` |
| `REACT_APP_TELEMETRY_KEY` | Sentry DSN or telemetry endpoint key | — |
| `REACT_APP_RELEASE` | Version identifier for telemetry tagging | `1.0.0` |
| `REACT_APP_FEATURE_DOU_STITCH` | Enable Dou-Stitch Live features | `true` |
| `REACT_APP_NATIVE_HLS_ONLY` | Skip hls.js, use native webOS HLS | `true` for 4.5+ only |

---

## Commands

```bash
# Development
npm run serve              # Browser dev server
npm run lint               # ESLint

# Building
npm run pack               # Debug build
npm run pack-p             # Production build

# Packaging
npm run package            # Build + package IPK

# Device operations
npm run deploy             # Build, package, install to default device
npm run launch             # Launch on default device
npm run inspect            # Open DevTools against running app
```

---

## License

Proprietary. © 2026 Dousic Media Group LLC. All rights reserved. This code is not open source and is not licensed for redistribution or commercial use outside of Dousic's internal development.

---

## Contributors

- Brian K. Moore (CEO) — Product direction
- Rick A. Eckerson (CLO) — Legal, LG Seller Lounge onboarding
- Michael Ferguson (CPO) — LG partnership
- Gulzar Ahmed (CTO) — Engineering lead

Engineering contact: `gulzar@dousic.media`
