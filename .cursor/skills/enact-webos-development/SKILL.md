---
name: enact-webos-development
description: Build, modify, debug, and review LG webOS TV applications using Enact, Moonstone, Spotlight, and @enact/webos. Use when working on Enact components, webOS packaging, TV remote navigation, focus behavior, lifecycle events, Luna services, or app certification readiness.
---

# Enact WebOS Development

## Quick Start

When working on this app:

1. Treat it as an LG webOS TV app built with Enact, React, Moonstone, Spotlight, and `@enact/webos`.
2. Prefer existing project patterns before adding new abstractions. Check nearby files under `src/App`, `src/views`, `src/components`, `src/hooks`, `src/platform`, and `src/state`.
3. Design every UI change for 10-foot TV use: remote-first navigation, readable text, large hit targets, predictable focus, and low memory pressure.
4. Use Enact CLI scripts from `package.json` for validation and packaging.
5. For deeper checklists, read [reference.md](reference.md).

## Project Commands

Use these npm scripts when relevant:

- `npm run serve`: local Enact dev server.
- `npm run lint`: strict Enact linting.
- `npm test`: Enact tests with `jsdom`.
- `npm run pack`: development build.
- `npm run pack-p`: production build plus project HLS guard.
- `npm run package`: version check, production pack, and `ares-package dist -o build` (IPK is written to `build/`).
- `npm run deploy`, `npm run launch`, `npm run inspect`: webOS device workflow.

Do not add new package scripts unless the task needs them and they fit the existing script style.

## Component Guidance

- Use Enact/Moonstone components where they already solve the job, especially `Panels`, `Panel`, `Scroller`, buttons, inputs, and TV-ready controls.
- Keep route-level screens as panels and preserve the app's view stack behavior.
- Split presentational concerns from data/state concerns when a component grows. Stateless components should receive data and callbacks from containers or stores.
- Name props as adjectives for render state and callbacks in present tense, such as `selected`, `disabled`, `onSelect`, and `onClose`.
- Keep LESS modules scoped and avoid global CSS unless changing app-wide behavior intentionally.

## Spotlight And Remote Navigation

- Every interactive TV control must be spottable directly or through an Enact/Moonstone component that is already spottable.
- Use `SpotlightContainerDecorator` to group navigation areas, with `enterTo`, `leaveFor`, and `spotlightRestrict` when geometry alone is unreliable.
- Preserve deterministic remote paths between panels, rails, dialogs, nav, and player controls.
- Prefer declarative Spotlight container configuration. Use direct `Spotlight.focus()` only when lifecycle timing or explicit recovery requires it.
- Test arrow keys, Enter/OK, Back, pointer mode, and pointer-to-5-way transitions for user-facing navigation changes.

## WebOS Platform Guidance

- Route platform features through existing hooks and adapters in `src/hooks` and `src/platform` before calling platform APIs directly.
- Handle app lifecycle events such as foreground/background, relaunch, low memory, network changes, and hard suspension.
- Keep telemetry, WebSocket, media playback, and cache behavior safe when the app is backgrounded or a user logs out.
- Use `@enact/webos` and Luna service helpers for webOS-specific capabilities instead of generic browser-only assumptions.

## Media App Requirements

- Protect playback startup, teardown, and resume behavior when changing player or lifecycle code.
- Avoid increasing bundle size or runtime memory without a clear reason. TV hardware is constrained.
- Keep loading, empty, offline, and error states navigable by remote.
- Preserve localization patterns through `src/i18n` instead of hard-coding user-facing strings.

## Validation

For code changes, choose validation based on risk:

- Narrow UI/component change: `npm run lint`.
- State, platform, or player behavior: `npm run lint` plus targeted tests or manual remote navigation checks.
- Packaging, app metadata, version, or production readiness: `npm run package` or at least `npm run pack-p`.

If browser or device verification is needed, exercise the app with remote-like keyboard input and confirm focus is visible and recoverable.
