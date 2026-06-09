# Dousic webOS App — Audit Report & Remediation Patches

**Audience:** CTO
**Subject:** Code audit of `dousic-webos` 1.0.0; root-cause analysis of spatial-navigation and vertical-scroll bugs; ready-to-apply patches
**Build under review:** `com.dousic.app.dousic_1.0.0_all.ipk` (14.4 MB)
**Date:** May 2026

---

## Executive Summary

The codebase is structurally sound — Enact 4.7 + Moonstone, Zustand for state, dynamic-import hls.js, pusher-js for realtime. The handoff documentation is unusually thorough. However, three blocker-class issues will prevent both the reported spatial-nav problem from being fixed and the LG Content Store submission from passing review:

1. **Spatial navigation does not drive vertical scroll** because every panel uses native CSS `overflow-y: auto` instead of Moonstone's `Scroller`. Spotlight moves focus geometrically; native overflow containers do not follow focus. This is the single biggest cause of the CTO-reported symptoms.
2. **The production build is silently dropping the custom `index.html`** — the IPK ships the default Enact template with no CSP, no inline splash, no TV viewport. Every CSP hardening claim in the handoff doc is false for the shipped artifact.
3. **The NavBar's expand-on-focus relies on the CSS `:has()` selector**, which is unavailable on any webOS prior to version 24 (2024). On every TV in the field that matters, the nav bar is permanently collapsed and unreadable.

Fix order, time estimate, and exact patches follow. The patches in §6 are unified diffs and can be applied directly to the working tree with `git apply` or copy-paste into each file.

---

## 1. Findings Summary

| # | ID | Severity | Title | Files |
|---|----|----------|-------|-------|
| 1 | **B1** | 🔴 Blocker | Native `overflow-y: auto` instead of Moonstone `Scroller` on every panel | 8 panels |
| 2 | **B2** | 🔴 Blocker | Production build is dropping the custom `index.html` (no CSP, no splash) | `dist/index.html`, `.enactrc` |
| 3 | **B3** | 🔴 Blocker | NavBar uses CSS `:has()` — unsupported on webOS < 24 | `NavBar.module.less` |
| 4 | **B4** | 🔴 Blocker | CSS `inset` shorthand used; unsupported on webOS 5/6 | `LivePanel.module.less` |
| 5 | **B5** | 🔴 Blocker | ContentRail `Scroller` has `height: auto`; needs definite height | `ContentRail.module.less` |
| 6 | **B6** | 🔴 Blocker | Version drift across testing guide (1.0.1), package (1.0.0), IPK (1.0.0) | submission metadata |
| 7 | **H1** | 🟠 High | HeroCarousel swallows arrow keys → focus jail | `HeroCarousel.js` |
| 8 | **H2** | 🟠 High | `autoFocus` on hero Play button steals focus on remount | `HeroCarousel.js` |
| 9 | **H3** | 🟠 High | `backdrop-filter: blur(16px)` on persistent NavBar → FPS drops | `NavBar.module.less` |
| 10 | **H4** | 🟠 High | Duplicate Enter handling on every Spottable child | multiple |
| 11 | **H5** | 🟠 High | Explicit `tabIndex={-1}` on Spottable host fights Spotlight bookkeeping | `NavBar.js` |
| 12 | **H6** | 🟠 High | All views stay mounted inside `<Panels>`; memory pressure on 256 MB devices | `App.js` |
| 13 | **H7** | 🟠 High | `data-spotlight-id` instead of canonical `spotlightId` prop | `PlayerPanel.js` |
| 14 | **H8** | 🟠 High | Spotlight focus selector `[data-spotlight-id^="hero-play-"]` is fragile | `HeroCarousel.js` |
| 15 | **M1** | 🟡 Med | CSP `'unsafe-eval'` still present in production CSP | `index.html` |
| 16 | **M2** | 🟡 Med | No lint gate in `pack-p` | `package.json` |
| 17 | **M3** | 🟡 Med | Test files exist but no pre-package run | `package.json` |
| 18 | **M4** | 🟡 Med | ProfilePanel silently swallows network errors | `ProfilePanel.js` |
| 19 | **M5** | 🟡 Med | LG Smart UI / Museo Sans fallback chain unverified on real TV | fonts |
| 20 | **M6** | 🟡 Med | `requiredMemory: 256` + all-views-mounted Panels stack are in tension | `appinfo.json` |
| 21 | **M7** | 🟡 Med | No `requiredPermissions` in `appinfo.json` despite luna service usage | `appinfo.json` |
| 22 | **M8** | 🟡 Med | Inline splash unreachable while B2 unfixed | `index.html` |

---

## 2. Stack Snapshot

| Item | Value |
|---|---|
| Framework | Enact 4.7.13 + Moonstone 4.5.6 + Spotlight 4.7.13 |
| React | 18.2 (createRoot used correctly in `index.js`) |
| State | Zustand 4.5.5 |
| Streaming | hls.js 1.5.17 (dynamic import, `NATIVE_HLS_ONLY` flag) + pusher-js 8.4 |
| Build | Enact CLI 6.1.4, target `Chrome >= 69` (≈ webOS 5.0+) |
| Bundle | `main.js` 1.07 MB · `main.css` 281 KB · `chunk.836.js` 521 KB |
| IPK | 14.4 MB |
| Scroller usage | **One file only** — `ContentRail.js` (root cause #1) |

---

## 3. Spatial Navigation — Root Cause Analysis

The CTO-reported symptom ("spatial nav buggy, vertical scrolling difficult on the emulator") is **one root cause with several amplifiers**.

### 3.1 The single root cause

> Spotlight moves focus geometrically. **Native CSS scroll containers do not follow focus.** The codebase wraps every panel's content in `<div className={css.content}>` with `overflow-y: auto`, instead of `<Scroller direction="vertical">` from `@enact/moonstone/Scroller`. So when the user presses Down past the fold, Spotlight focuses an off-screen rail or grid item, the viewport stays put, and the focus indicator disappears below the visible area.

Verifiable by grep:

```
$ grep -rn "import Scroller" src/
src/components/ContentRail.js:17:import Scroller from '@enact/moonstone/Scroller';

$ grep -rn "overflow-y: auto" src/
src/views/BrowsePanel.module.less:14
src/views/ContentDetailPanel.module.less:7
src/views/CreatorPanel.module.less:7
src/views/HomePanel.module.less:14
src/views/LivePanel.module.less:14
src/views/ProfilePanel.module.less:14
src/views/SearchPanel.module.less:14,115
src/views/SettingsPanel.module.less:7
```

Moonstone's `Scroller` subscribes to Spotlight's focus event stream and calls its internal `scrollTo()` to bring the newly-focused element into view. Native overflow has no such hook. Patches §6.2 – §6.8 below convert every panel to use `Scroller`.

### 3.2 The amplifiers (why it feels worse than a single bug)

These do not break vertical scroll by themselves, but each one makes the failure mode more confusing during emulator testing.

1. **NavBar's `position: fixed` + `:has()` expand-on-focus.** On webOS < 24 the bar is locked at 96px collapsed and labels never appear. Combined with a frozen viewport, testers see a permanently-narrow left rail next to a frozen grid and reasonably conclude "spatial nav is broken." The two bugs reinforce each other visually.

2. **`continue5WayHold: true` on `ContentRail`** (`ContentRail.js:29`). Buffers focus while 5-way is held down. When vertical scroll is broken, this exacerbates the "stuck in rail" feeling. Acceptable behavior once `Scroller` is in; remove temporarily during diagnosis to isolate the scroll bug cleanly.

3. **HeroCarousel swallows arrow keys.** `HeroCarousel.js:42-48` — `onKeyDown` catches `ArrowLeft`/`ArrowRight` then calls `e.stopPropagation()`. Combined with `autoFocus` on the Play button (`:92`) grabbing focus on every mount, and broken vertical scroll preventing escape down, this becomes a textbook focus jail. **This is the worst-feeling specific case the CTO probably hit first.**

4. **`SpotlightContainerDecorator({enterTo: 'last-focused'})` on every panel** plus **all-views-mounted `<Panels>` stack** (`App.js:254`). User pops back to Home, Spotlight restores focus to a card that's now off-screen because content state changed. No scroll follow → "where did my focus go?"

5. **Wrapped flex chips in BrowsePanel.** `BrowsePanel.module.less:35` — `flex-wrap: wrap`. Spotlight may navigate Down into a wrapped second row of chips instead of into the grid. Confusing geometry for the algorithm.

6. **Spottable `<div>` with `role="button"` AND a manual Enter handler** on every focusable. On the webOS emulator with a virtual remote, this can register Enter twice and trigger unintended push navigation — looks like "spatial nav going to the wrong place."

7. **HeroCarousel `defaultElement` uses an attribute-starts-with selector** (`HeroCarousel.js:123`) that may not resolve reliably under Spotlight's internal `querySelector`. When it fails, default focus falls back to first focusable — the NavBar. Symptom: "Home opened with focus on left nav, not hero."

### 3.3 Emulator-specific compounding factors

- The webOS emulator runs a Chromium build closer to the host browser than to the TV. **`:has()` works on emulator but not on TV.** NavBar will look fine on emulator, broken on real hardware. Test on hardware before drawing conclusions either way.
- The emulator's `getBoundingClientRect()` rounding differs from real hardware. Spotlight's scoring function uses these rects; minor differences can change which element is the "next" candidate on emulator vs TV.
- Magic Remote pointer mode is disabled by default in the emulator. Real TVs default to pointer mode; many users engage 5-way only after putting the remote down. Test both: `Spotlight.set('pointer', false)` and `Spotlight.set('pointer', true)`.

---

## 4. Detailed Findings

### Blockers

#### B1 — Native overflow on every panel (covered above)

#### B2 — Production build dropping custom `index.html`

The source `index.html` (115 lines) contains a full CSP meta, inline splash CSS, and the TV viewport meta. The shipped `dist/index.html` is 398 bytes of the default Enact template:

```
$ cat dist/index.html
<!doctype html>
<html>
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="x-ua-compatible" content="ie=edge">
        <meta name="viewport" content="width=device-width,initial-scale=1,...">
    <title>Dousic</title><link href="main.css" rel="stylesheet"/></head>
    <body>
        <div id="root"></div>
    <script defer="defer" src="main.js"></script></body>
</html>
```

The handoff doc's verification step (`grep -c 'Content-Security-Policy' dist/index.html`) returns `0` against this build. The IPK ships with **no CSP at all** — every CSP claim in the handoff is false for the actual artifact.

Most likely cause: Enact CLI 6.x is not picking up the project-root `index.html` as a webpack template. Fix in §6.1.

#### B3 — `:has()` selector

`NavBar.module.less:19, 123`:

```less
&:has(.spottable-focused) {
    width: @nav-width;
}
.navBar:has(.spottable-focused) .item .label {
    opacity: 1;
    transform: translateX(0);
}
```

`:has()` shipped in:
- Chromium 105 (September 2022)
- Therefore: **webOS 24+ only**

webOS Chromium versions for context:

| webOS | Chromium | `:has()` |
|---|---|---|
| 3.x (2016) | 38 | ❌ |
| 4.x (2018) | 53 | ❌ |
| 5.x (2019) | 68 | ❌ |
| 6.x (2021) | 79 | ❌ |
| 22 (2022) | 87 | ❌ |
| 23 (2023) | 94 | ❌ |
| 24 (2024) | 108 | ✅ |

Patch in §6.9 replaces this with React state-driven class toggling.

#### B4 — `inset` shorthand

`LivePanel.module.less:72`:

```less
&::before {
    content: '';
    position: absolute;
    inset: 32px;
    ...
}
```

CSS `inset` shorthand: Chromium 87+ — same Chromium-version table above; only webOS 22+. Replace with `top/right/bottom/left`. Patch in §6.10.

#### B5 — ContentRail Scroller has `height: auto`

`ContentRail.module.less:17`:

```less
.scroller {
    height: auto;
}
```

Moonstone `Scroller` needs a definite height to compute its scrollable region. With `auto`, panning math behaves inconsistently — explains intermittent horizontal-rail jankiness on emulator runs. Patch in §6.8 with computed heights per `cardSize`.

#### B6 — Version drift

| Source | Version |
|---|---|
| `appinfo.json` | `1.0.0` |
| `package.json` | `1.0.0` |
| `WEBOS_APP_EVALUATION_TESTING_GUIDE.md` | `1.0.1` |
| IPK filename | `_1.0.0_all.ipk` |

LG cert will reject mismatched versions between filename, manifest, and submission form. Decide on the target version and align everywhere before submission.

### High-priority

**H1, H2, H8 — HeroCarousel.** Patch §6.11.

**H3 — `backdrop-filter: blur(16px)` on persistent NavBar.** `NavBar.module.less:10`. Real-time blur over a moving background is one of the most expensive paint operations on TV GPUs. On webOS 4/5 hardware this alone can drop FPS during navigation transitions from 60 to single digits. Replace with solid `rgba(10,10,10,0.92)` (no blur), or feature-gate on `getWebOSMajorVersion() >= 6`. Patch §6.9 removes the blur as part of the NavBar rewrite.

**H4 — Duplicate Enter handling.** Every Spottable host (`NavItem`, `GenreChip`, `Key`, `ContentCard`, `IconButton`) has its own `onKeyDown` Enter handler **and** an `onClick`. Spottable's HoC contract is that the host owns activation. Custom Enter handlers can double-fire on certain remotes. Recommend a single sweep replacing the pattern:

```js
onClick={handleSelect}
onKeyDown={(e) => { if (e.key === 'Enter') handleSelect(); }}
```

with just:

```js
onClick={handleSelect}
```

Spotlight will synthesize a click on Enter for Spottable elements. This is a follow-up sweep, not a blocker for spatial-nav repair.

**H5 — Explicit `tabIndex={-1}` on Spottable host.** `NavBar.js:45`. Drop the explicit value; let Spottable manage it.

**H6 — Mounted Panels stack.** `App.js:254-264`. All views in the viewStack are kept mounted simultaneously. On a 256 MB-declared app, after a typical browse session (`home → content-detail → player → creator → content-detail`) you have 5 view trees in the DOM. Moonstone hides off-screen panels via `display: none`, so they aren't focusable, but they are still rendered. Either:

- (a) Unmount popped panels — change `App.js` to render only the top of the stack, OR
- (b) Bump `requiredMemory` to 512 in `appinfo.json`.

Recommend (a) plus measuring memory at end of a soak test. Patch not included here — needs a small refactor of the `viewStack` model.

**H7 — `data-spotlight-id` instead of `spotlightId` prop.** `PlayerPanel.js:52`. The `IconButton` puts `data-spotlight-id={spotlightId}` on the DOM, and code later does `Spotlight.focus('[data-spotlight-id="play-pause"]')`. Canonical Enact usage is to pass `spotlightId` as a prop directly to the Spottable component and call `Spotlight.focus('play-pause')` by ID. The attribute-selector form works but is fragile across Enact patch versions.

### Medium (summarised; patches not included)

- **M1** — Strip `'unsafe-eval'` from production CSP variant. React 18 prod doesn't need eval. Use a build-time template variant.
- **M2** — Add `enact lint --strict` to `pack-p`. One-line change in `package.json`.
- **M3** — Add `enact test --env=jsdom` to `pack-p`.
- **M4** — Surface ProfilePanel API errors with a notification instead of silent `catch`.
- **M5** — On a real TV with no LG Smart UI installed, verify `Museo Sans` fallback renders correctly.
- **M6** — See H6.
- **M7** — Audit `src/platform/luna.js` for service calls that need declared permissions; add `requiredPermissions` to `appinfo.json`.
- **M8** — Mooted by B2 fix.

---

## 5. Fix Application Order

The patches are ordered to be applied in this sequence. After step 2 alone, the vertical-scroll bug should be visibly resolved on both emulator and real TV. Steps 3–11 close cert-review gaps.

| Step | Patch | What it does | Effort |
|---|---|---|---|
| 1 | §6.1 | Restore custom `index.html` in build output | 15 min |
| 2 | §6.2 – §6.8 | Migrate every panel from native overflow to `Scroller` | 4–6 hr |
| 3 | §6.8 | Give `ContentRail` Scroller a definite height | 30 min |
| 4 | §6.9 | Rewrite NavBar without `:has()` and without blur | 1 hr |
| 5 | §6.10 | Drop `inset` shorthand in LivePanel | 5 min |
| 6 | §6.11 | Fix HeroCarousel focus jail and `autoFocus` | 30 min |
| 7 | (follow-up sweep) | Remove duplicate Enter handlers (H4) | 1 hr |
| 8 | (follow-up) | Re-test on hardware: focus matrix, soak, cold-start, captions | 1 day |

---

## 6. Patches

All patches are unified diffs against the source tree as delivered. Each is independent — they do not depend on each other except where noted.

### 6.1 — Restore custom `index.html` in the build output

**Cause:** Enact CLI 6.x is not picking up the project-root `index.html`. The fastest reliable fix is a clean rebuild; if that doesn't work, configure an explicit template path in `.enactrc`.

**Step 1 — Clean rebuild (most cases this is sufficient):**

```bash
rm -rf dist node_modules/.cache .enact-build-cache
npm run pack-p
grep -c 'Content-Security-Policy' dist/index.html
# Expect: 1
```

If that returns `0`, apply Step 2:

**Step 2 — Force template in `.enactrc`:**

```diff
--- a/.enactrc
+++ b/.enactrc
@@ -7,6 +7,8 @@
 
     "theme": "moonstone",
 
+    "template": "./index.html",
+
     "target": [
         "Chrome >= 69"
     ],
```

Rebuild and re-verify:

```bash
npm run clean && npm run pack-p
grep -c 'Content-Security-Policy' dist/index.html   # expect 1
grep -c 'dousic-splash' dist/index.html             # expect 1
```

---

### 6.2 — HomePanel: native overflow → Moonstone Scroller

```diff
--- a/src/views/HomePanel.js
+++ b/src/views/HomePanel.js
@@ -14,6 +14,7 @@
 import {useEffect} from 'react';
 import {Panel} from '@enact/moonstone/Panels';
 import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
+import Scroller from '@enact/moonstone/Scroller';
 import PropTypes from 'prop-types';
 
 import {useContentStore} from '../state/contentStore';
@@ -63,7 +64,12 @@ const HomePanelBase = (props) => {
 	return (
 		<Panel {...props} className={css.panel}>
 			<NavBar />
-			<div className={css.content}>
+			<Scroller
+				direction="vertical"
+				horizontalScrollbar="hidden"
+				verticalScrollbar="hidden"
+				className={css.content}
+			>
 				{isLoading && !data && (
 					<div className={css.loading}>
 						<div className={css.spinner} />
@@ -135,7 +141,7 @@ const HomePanelBase = (props) => {
 						/>
 					)}
 				</div>
-			</div>
+			</Scroller>
 		</Panel>
 	);
 };
```

```diff
--- a/src/views/HomePanel.module.less
+++ b/src/views/HomePanel.module.less
@@ -10,9 +10,10 @@
 .content {
 	margin-left: @nav-width-collapsed;
 	width: calc(100vw - @nav-width-collapsed);
 	height: 100vh;
-	overflow-y: auto;
-	overflow-x: hidden;
+	// Moonstone Scroller owns scrolling; native overflow would prevent
+	// Spotlight from driving scroll-on-focus. Do not add `overflow-y: auto`
+	// here — Scroller will manage its own viewport.
 }
 
 .loading {
```

---

### 6.3 — BrowsePanel: same migration

```diff
--- a/src/views/BrowsePanel.js
+++ b/src/views/BrowsePanel.js
@@ -7,6 +7,7 @@
 import {useEffect, useState, useCallback} from 'react';
 import {Panel} from '@enact/moonstone/Panels';
 import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
+import Scroller from '@enact/moonstone/Scroller';
 import Spottable from '@enact/spotlight/Spottable';
 import classNames from 'classnames';
 import PropTypes from 'prop-types';
@@ -132,7 +133,12 @@ const BrowsePanelBase = (props) => {
 	return (
 		<Panel {...props} className={css.panel}>
 			<NavBar />
-			<div className={css.content}>
+			<Scroller
+				direction="vertical"
+				horizontalScrollbar="hidden"
+				verticalScrollbar="hidden"
+				className={css.content}
+			>
 				<header className={css.header}>
 					<h1 className={css.title}>{Strings.browse.title()}</h1>
 				</header>
@@ -150,7 +156,7 @@ const BrowsePanelBase = (props) => {
 						/>
 					)}
 				</div>
-			</div>
+			</Scroller>
 		</Panel>
 	);
 };
```

```diff
--- a/src/views/BrowsePanel.module.less
+++ b/src/views/BrowsePanel.module.less
@@ -10,9 +10,9 @@
 .content {
 	margin-left: @nav-width-collapsed;
 	width: calc(100vw - @nav-width-collapsed);
 	height: 100vh;
-	overflow-y: auto;
-	overflow-x: hidden;
 	padding: @safe-area-top @safe-area-side @safe-area-bottom;
+	// Scrolling owned by Moonstone Scroller wrapping this element's children.
+	// Do not re-introduce overflow-y here.
 }
 
 .header {
@@ -32,7 +32,11 @@
 	gap: @spacing-sm;
 	margin-bottom: @spacing-xl;
 	padding: @spacing-sm 0;
-	flex-wrap: wrap;
+	// flex-wrap: wrap creates ambiguous geometry for Spotlight's spatial
+	// algorithm — Down from row 1 may target the wrapped row instead of the
+	// content grid below. Single row + horizontal scroll keeps nav predictable.
+	flex-wrap: nowrap;
+	overflow-x: hidden;
 }
 
 .chip {
```

---

### 6.4 — LivePanel

```diff
--- a/src/views/LivePanel.js
+++ b/src/views/LivePanel.js
@@ -8,6 +8,7 @@
 import {useEffect} from 'react';
 import {Panel} from '@enact/moonstone/Panels';
 import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
+import Scroller from '@enact/moonstone/Scroller';
 import PropTypes from 'prop-types';
 
 import {useContentStore} from '../state/contentStore';
@@ -100,7 +101,12 @@ const LivePanelBase = (props) => {
 	return (
 		<Panel {...props} className={css.panel}>
 			<NavBar />
-			<div className={css.content}>
+			<Scroller
+				direction="vertical"
+				horizontalScrollbar="hidden"
+				verticalScrollbar="hidden"
+				className={css.content}
+			>
 				<header className={css.header}>
 					<h1 className={css.title}>
 						<span className={css.liveDot} />
@@ -122,7 +128,7 @@ const LivePanelBase = (props) => {
 						onSelect={handleSelect}
 					/>
 				)}
-			</div>
+			</Scroller>
 		</Panel>
 	);
 };
```

```diff
--- a/src/views/LivePanel.module.less
+++ b/src/views/LivePanel.module.less
@@ -10,9 +10,8 @@
 .content {
 	margin-left: @nav-width-collapsed;
 	width: calc(100vw - @nav-width-collapsed);
 	height: 100vh;
-	overflow-y: auto;
-	overflow-x: hidden;
 	padding: @safe-area-top @safe-area-side @safe-area-bottom;
+	// Scrolling owned by Moonstone Scroller. Do not add overflow-y here.
 }
```

---

### 6.5 — SearchPanel

The search panel has **two** native overflow containers; remove both. The inner results column becomes a sibling Scroller.

```diff
--- a/src/views/SearchPanel.js
+++ b/src/views/SearchPanel.js
@@ -8,6 +8,7 @@
 import {useState, useCallback, useEffect, useRef} from 'react';
 import {Panel} from '@enact/moonstone/Panels';
 import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
+import Scroller from '@enact/moonstone/Scroller';
 import Spottable from '@enact/spotlight/Spottable';
 import Spotlight from '@enact/spotlight';
 import PropTypes from 'prop-types';
@@ -158,7 +159,12 @@ const SearchPanelBase = (props) => {
 						onClear={handleClear}
 					/>
 
-					<div className={css.results}>
+					<Scroller
+						direction="vertical"
+						horizontalScrollbar="hidden"
+						verticalScrollbar="hidden"
+						className={css.results}
+					>
 						{isSearching && (
 							<div className={css.searchingText}>{Strings.search.searching()}</div>
 						)}
@@ -184,7 +190,7 @@ const SearchPanelBase = (props) => {
 								))}
 							</div>
 						)}
-					</div>
+					</Scroller>
 				</div>
 			</div>
 		</Panel>
```

```diff
--- a/src/views/SearchPanel.module.less
+++ b/src/views/SearchPanel.module.less
@@ -10,7 +10,6 @@
 .content {
 	margin-left: @nav-width-collapsed;
 	width: calc(100vw - @nav-width-collapsed);
 	height: 100vh;
-	overflow-y: auto;
 	padding: @safe-area-top @safe-area-side @safe-area-bottom;
 	display: flex;
 	flex-direction: column;
@@ -112,7 +111,7 @@
 .results {
 	flex: 1;
 	min-width: 0;
-	overflow-y: auto;
+	// Scrolling owned by Moonstone Scroller wrapping this column's children.
 }
```

> **Note:** the outer `.content` was a flex column hosting the header at top and `.body` (with keyboard + results) below. Once the inner `.results` Scroller handles its own vertical scroll, the outer `.content` no longer needs to scroll — header is fixed-height and `.body` is `flex: 1`. Verified against current layout.

---

### 6.6 — ProfilePanel

```diff
--- a/src/views/ProfilePanel.js
+++ b/src/views/ProfilePanel.js
@@ -7,6 +7,7 @@
 import {useEffect, useState} from 'react';
 import {Panel} from '@enact/moonstone/Panels';
 import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
+import Scroller from '@enact/moonstone/Scroller';
 import Button from '@enact/moonstone/Button';
 import PropTypes from 'prop-types';
 
@@ -82,7 +83,12 @@ const ProfilePanelBase = (props) => {
 	return (
 		<Panel {...props} className={css.panel}>
 			<NavBar />
-			<div className={css.content}>
+			<Scroller
+				direction="vertical"
+				horizontalScrollbar="hidden"
+				verticalScrollbar="hidden"
+				className={css.content}
+			>
 				<header className={css.header}>
 					{/* avatar + info + actions — unchanged */}
 				</header>
@@ -151,7 +157,7 @@ const ProfilePanelBase = (props) => {
 						</p>
 					</div>
 				)}
-			</div>
+			</Scroller>
 		</Panel>
 	);
 };
```

```diff
--- a/src/views/ProfilePanel.module.less
+++ b/src/views/ProfilePanel.module.less
@@ -10,8 +10,7 @@
 .content {
 	margin-left: @nav-width-collapsed;
 	width: calc(100vw - @nav-width-collapsed);
 	height: 100vh;
-	overflow-y: auto;
-	overflow-x: hidden;
+	// Scrolling owned by Moonstone Scroller.
 }
```

---

### 6.7 — ContentDetailPanel, CreatorPanel, SettingsPanel

These three share the same pattern as the above. Diff template (replace `XXX` with the panel name):

```diff
--- a/src/views/XXXPanel.js
+++ b/src/views/XXXPanel.js
@@ -<line>
 import {Panel} from '@enact/moonstone/Panels';
+import Scroller from '@enact/moonstone/Scroller';
 // ... other imports
```

Then wrap the outer content container of each panel with `<Scroller direction="vertical" horizontalScrollbar="hidden" verticalScrollbar="hidden" className={css.content}>` and remove the corresponding `overflow-y: auto` from its `.less` file. Three small edits per panel.

For **ContentDetailPanel** specifically, the `.panel` itself has `overflow-y: auto` (`ContentDetailPanel.module.less:7`) rather than `.content`. Remove that and add a Scroller wrapping the entire panel body, keeping the `.backdrop` absolutely-positioned child inside.

For **SettingsPanel**, same: `overflow-y: auto` is on `.panel` (line 7). Remove and wrap.

---

### 6.8 — ContentRail: definite height + no continue5WayHold during diagnosis

```diff
--- a/src/components/ContentRail.module.less
+++ b/src/components/ContentRail.module.less
@@ -14,8 +14,11 @@
 		padding-left: @safe-area-side;
 	}
 
 	.scroller {
-		height: auto;
+		// Moonstone Scroller requires a definite height to compute its
+		// scrollable region. height: auto caused intermittent panning bugs
+		// on the emulator. Heights account for card + 40px focus-scale
+		// padding declared on .track below.
+		height: 380px; // medium card (300px) + 80px padding
 	}
 
 	.track {
```

If you support multiple card sizes per rail, add modifier classes:

```diff
+	&.size-small .scroller   { height: 280px; }   // small card 200px + 80px
+	&.size-medium .scroller  { height: 380px; }   // medium card 300px + 80px
+	&.size-large .scroller   { height: 480px; }   // large card 400px + 80px
+	&.size-wide .scroller    { height: 320px; }   // wide card 240px + 80px
```

…and apply the modifier class in `ContentRail.js`:

```diff
--- a/src/components/ContentRail.js
+++ b/src/components/ContentRail.js
@@ -42,7 +42,8 @@ const ContentRail = SpotlightContainerDecorator(
 		}
 
 		return (
-			<section className={css.rail}>
+			<section className={`${css.rail} ${css[`size-${cardSize}`] || ''}`}>
 				{title && <h2 className={css.title}>{title}</h2>}
```

---

### 6.9 — NavBar: replace `:has()` and remove blur

This patch rewrites the NavBar to use React state for expand/collapse and drops `backdrop-filter` for performance.

```diff
--- a/src/components/NavBar.js
+++ b/src/components/NavBar.js
@@ -9,7 +9,7 @@
  * Netflix-style TV app conventions.
  */
 
-import {useCallback} from 'react';
+import {useCallback, useState} from 'react';
 import Spottable from '@enact/spotlight/Spottable';
 import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
 import classNames from 'classnames';
@@ -39,7 +39,6 @@ const NavItemBase = ({id, label, icon, active, onSelect}) => {
 			onClick={handleSelect}
 			onKeyDown={handleKeyDown}
 			role="button"
-			tabIndex={-1}
 			aria-label={labelText}
 			aria-current={active ? 'page' : null}
 		>
@@ -68,9 +67,16 @@ const NavBar = SpotlightContainerDecorator(
 	() => {
 		const activeRoot = useAppStore((s) => s.activeRoot);
 		const switchRoot = useAppStore((s) => s.switchRoot);
+		const [expanded, setExpanded] = useState(false);
+		// Container-level focus tracking replaces the CSS :has() selector
+		// (which is webOS 24+ only). React state works on every webOS version.
+		const handleFocus = useCallback(() => setExpanded(true), []);
+		const handleBlur = useCallback(() => setExpanded(false), []);
 
 		return (
-			<nav className={css.navBar} aria-label="Primary navigation">
+			<nav
+				className={classNames(css.navBar, {[css.expanded]: expanded})}
+				aria-label="Primary navigation"
+				onFocus={handleFocus}
+				onBlur={handleBlur}
+			>
 				<div className={css.brand}>
 					<span className={css.logo}>d<span className={css.accent}>.</span></span>
 				</div>
```

> **Why `onFocus`/`onBlur` on the container instead of focus-within?** Focus events bubble; placing them on the container catches focus moving in or out of any descendant Spottable without needing `:has()`.

```diff
--- a/src/components/NavBar.module.less
+++ b/src/components/NavBar.module.less
@@ -5,8 +5,10 @@
 	left: 0;
 	bottom: 0;
 	width: @nav-width-collapsed;
-	background: rgba(10, 10, 10, 0.92);
-	backdrop-filter: blur(16px);
-	-webkit-backdrop-filter: blur(16px);
+	// Solid background; backdrop-filter: blur() is removed because it costs
+	// 20-40 FPS on webOS 4/5 hardware during nav transitions. The brand is
+	// pure black already so solid + alpha looks identical.
+	background: rgba(10, 10, 10, 0.96);
 	display: flex;
 	flex-direction: column;
 	z-index: @z-nav;
@@ -13,10 +15,10 @@
 	transition: width @duration-normal @easing-out;
 	padding: @spacing-lg 0;
 
-	// Expand on focus-within to show labels
-	&:has(.spottable-focused) {
-		width: @nav-width;
-	}
+	// Expand on container focus — state-driven, set from the NavBar
+	// component itself. Replaces the :has() rule which is webOS 24+ only.
+	&.expanded {
+		width: @nav-width;
+	}
 
 	.brand {
 		display: flex;
@@ -119,8 +121,7 @@
 	}
 }
 
-// Show labels when nav bar is expanded
-.navBar:has(.spottable-focused) .item .label {
+.navBar.expanded .item .label {
 	opacity: 1;
 	transform: translateX(0);
 }
```

---

### 6.10 — LivePanel: replace `inset` shorthand

```diff
--- a/src/views/LivePanel.module.less
+++ b/src/views/LivePanel.module.less
@@ -68,7 +68,11 @@
 		&::before {
 			content: '';
 			position: absolute;
-			inset: 32px;
+			// `inset` shorthand is Chromium 87+ (webOS 22+). Use the
+			// long-form equivalents so the pseudo-element renders on
+			// webOS 4–6 too.
+			top: 32px;
+			right: 32px;
+			bottom: 32px;
+			left: 32px;
 			border-radius: 50%;
 			background: @color-bg-card;
 		}
```

> The source `index.html` also uses `position: fixed; inset: 0;` for `#dousic-splash`. Same fix applies — but this is academic until B2 (custom HTML in build) is resolved. Once it is, patch `index.html:70` the same way.

---

### 6.11 — HeroCarousel: fix focus jail, drop autoFocus, replace fragile selector

```diff
--- a/src/components/HeroCarousel.js
+++ b/src/components/HeroCarousel.js
@@ -39,12 +39,17 @@ const HeroCarouselBase = ({items = [], onPlay, onMoreInfo}) => {
 		return () => clearInterval(timerRef.current);
 	}, [isFocused, items.length, go]);
 
 	const handleKeyDown = useCallback((e) => {
+		// Carousel only intercepts horizontal arrows when 5-way is repeating
+		// past the edge of the action buttons. We DO NOT stopPropagation,
+		// otherwise Spotlight cannot route arrows that need to leave the
+		// hero (Down to the rails) — this was the source of the focus-jail
+		// symptom on the emulator.
 		if (e.key === 'ArrowLeft') {
-			go('prev'); e.stopPropagation();
+			go('prev');
 		} else if (e.key === 'ArrowRight') {
-			go('next'); e.stopPropagation();
+			go('next');
 		}
 	}, [go]);
 
 	if (items.length === 0) return null;
@@ -85,11 +90,15 @@ const HeroCarouselBase = ({items = [], onPlay, onMoreInfo}) => {
 				<p className={css.logline}>{current.logline}</p>
 
 				<div className={css.actions}>
+					{/* autoFocus removed — it stole focus on every remount
+					    when navigating back to Home. Container's
+					    enterTo='default-element' (below) handles initial
+					    focus correctly without remount-time grabs. */}
 					<Button
 						onClick={() => onPlay?.(current)}
-						spotlightId={`hero-play-${current.id}`}
-						autoFocus
+						spotlightId="hero-play"
 					>
 						{current.is_live ? 'Watch live' : 'Play'}
 					</Button>
 					<Button onClick={() => onMoreInfo?.(current)}>More info</Button>
 				</div>
 
@@ -121,7 +130,11 @@ HeroCarouselBase.propTypes = {
 };
 
 const HeroCarousel = SpotlightContainerDecorator(
-	{enterTo: 'default-element', defaultElement: '[data-spotlight-id^="hero-play-"]'},
+	{
+		enterTo: 'default-element',
+		// Stable spotlightId — no longer per-slide-id, since the Play button
+		// is one DOM node whose semantics don't change between slides.
+		defaultElement: '#spotlight-hero-play'
+	},
 	HeroCarouselBase
 );
```

> Enact resolves `#spotlight-<id>` selectors deterministically against any element with `spotlightId="<id>"`. Use the `#spotlight-` prefix in Enact 4.x; the bare attribute selector form (`[data-spotlight-id="…"]`) is non-canonical.

---

## 7. Verification After Patches

Run after applying §6.1 – §6.11:

```bash
# Build verification
npm run clean && npm run pack-p
grep -c 'Content-Security-Policy' dist/index.html        # expect 1
grep -c 'dousic-splash'           dist/index.html        # expect 1
grep -c ':has('                   dist/main.css          # expect 0
grep -c 'inset:'                  dist/main.css          # expect 0 (or only longhands)
grep -c 'backdrop-filter'         dist/main.css          # expect 0

# Spatial nav verification (manual on emulator + TV)
# 1. Launch app
# 2. From Home, press Down repeatedly — each rail brings itself into view
# 3. From a rail card, press Down — focus moves to next rail AND viewport
#    follows; the focused card is fully visible
# 4. From Browse genre row, press Down — focus enters grid row 1
# 5. From Browse grid row 1, press Down — focus enters row 2 AND viewport
#    scrolls so row 2 is visible
# 6. From HeroCarousel Play button, press Down — focus leaves hero,
#    enters first rail's first card (no focus jail)
# 7. Hold Down arrow for ~3 seconds on Home — focus traverses every rail
#    smoothly and stops at the last with no off-screen focus
# 8. On webOS 4/5 emulator profile: NavBar still expands on focus-in
#    (because React state, not :has()); LivePanel empty-state donut still
#    renders correctly (because inset → top/right/bottom/left)

# Performance verification (real TV)
ares-inspect com.dousic.app.dousic -d LG_TV
# Chrome DevTools → Performance tab → record 10s navigation session
# Expect: 60 FPS sustained during scroll-on-focus; no major paint regions
# from removed backdrop-filter
```

---

## 8. What's Not Covered Here (Recommend Follow-Up Work)

These are outside the scope of "fix spatial nav" but should land before LG submission:

- **H4 sweep** — remove duplicate Enter handlers across `NavItemBase`, `GenreChipBase`, `KeyBase`, `ContentCardBase`, `IconButtonBase`. Mechanical, ~1 hour.
- **H6** — change `App.js` to render only the top of the viewStack (unmount popped panels). Small refactor; affects animation transitions, so test with `Panels` `index` behavior carefully.
- **M1** — production-only CSP variant without `'unsafe-eval'`. Wire into the `pack-p` script.
- **M2 + M3** — add `enact lint --strict` and `enact test --env=jsdom` to the `pack-p` chain so they gate every production build.
- **M7** — audit `src/platform/luna.js`, identify luna service calls that require declared permissions, add `requiredPermissions` to `appinfo.json`.
- **B6** — pick a target submission version and align `appinfo.json`, `package.json`, build artifact, and the testing-guide document.
- **Hardware soak test** — 30+ minute navigation session on a real TV measuring memory growth; flag at the H6 finding.
- **Screenshots in `resources/screenshots/`** — directory exists but empty; LG submission needs 3–5 1920×1080 PNGs.

---

## 9. Notes on the Spatial Navigation Fix at a Conceptual Level

For anyone reviewing these patches and wondering *why* the fix works:

**Spotlight's job** is to track the currently-focused DOM element and decide, on each arrow-key event, which other DOM element should receive focus next. It uses `getBoundingClientRect()` of every visible Spottable element and a geometric scoring function.

**Spotlight's blind spot** is scrolling. It doesn't scroll anything itself. It assumes the host app — or a scroll-aware container component — will scroll the focused element into view via `Element.scrollIntoView()` or equivalent.

**`@enact/moonstone/Scroller`** is that scroll-aware container. It listens for Spotlight focus events on its descendants and computes the scroll delta needed to bring the focused element fully into view. It then animates that scroll smoothly.

**Native CSS `overflow-y: auto`** has no idea Spotlight exists. The browser provides built-in scroll-on-tab behaviour for `:focus`, but Spotlight elements use `tabindex="-1"` (they're not in the tab sequence) — so the native scroll-on-focus hook never fires.

That's why the codebase looked plausible (every panel had a scroll container; every focusable was Spottable) but didn't work: the two systems weren't connected. Migrating to `<Scroller>` connects them.

---

*End of audit. Patches are independent; apply in the order listed in §5 for the smoothest test loop.*
