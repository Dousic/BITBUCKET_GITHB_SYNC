# Dousic webOS — Round 2 Fixes (May 15, 2026)

This round applies the remaining items from `DOUSIC_WEBOS_AUDIT_AND_PATCHES.md`
plus several additional bugs surfaced by the May 15, 2026 deep diagnostic.

**Scope:** fixes only. No feature changes. No architectural rewrites beyond
what the audit explicitly recommended.

Audit-ID column references the IDs in `DOUSIC_WEBOS_AUDIT_AND_PATCHES.md`.

---

## Summary table

| Audit ID | Severity | Status | Files |
|---|---|---|---|
| B2 | Blocker | ✅ Fixed (belt-and-suspenders post-build script) | `scripts/patch-dist-html.js`, `package.json` |
| B3 | Blocker | ✅ Fixed (state-driven expand) | `NavBar.js`, `NavBar.module.less` |
| B4 | Blocker | ✅ Fixed (full sweep — 18 occurrences) | 10 LESS files + `index.html` |
| B5 | Blocker | ✅ Fixed (per-size definite heights) | `ContentRail.{js,module.less}`, `BrowsePanel.module.less` |
| H3 | High | ✅ Fixed | `NavBar.module.less`, `VideoPlayer.module.less`, `OfflineBanner.module.less` |
| H4 | High | ✅ Fixed | `NavBar.js`, `ContentCard.js`, `BrowsePanel.js`, `SearchPanel.js`, `PlayerPanel.js`, `SettingsPanel.js` |
| H5 | High | ✅ Fixed | `NavBar.js` |
| H6 | High | ✅ Fixed (top-of-stack rendering) | `App.js` |
| H7 | High | ✅ Fixed (canonical `spotlightDefaultClass`) | `PlayerPanel.js`, `VideoPlayer.js`, `ExitConfirmation.js`, `ContentDetailPanel.js`, `CreatorPanel.js`, `SettingsPanel.js`, `LoginPanel.js` |
| M4 | Medium | ✅ Fixed | `ProfilePanel.js` |
| Diagnostic finding | n/a | ✅ Fixed | `LoginPanel.js` broken `defaultElement` selector |
| Diagnostic finding | n/a | ✅ Fixed | `package.json` build target conflict (aligned to `.enactrc`) |
| Diagnostic finding | n/a | ✅ Fixed | `SettingsPanel.js` dead `autoFocus` prop + broken `[autofocus]` selector |

**Deliberately deferred** (not in scope this round):
- M1 — `'unsafe-eval'` in production CSP. Comment in `index.html` documents the path to drop it.
- BrowsePanel "grid" identity: code is `display: flex` single-row; comments/docs say "4-column grid". Product decision, not a bug — left as-is. If you want a 2D wrapping grid, the change is a one-line `flex-wrap: wrap` plus removing `width: max-content`, and swapping the inner `Scroller` direction from `horizontal` to `vertical`.

---

## File-by-file changes

### `package.json`
- Aligned Enact build target with `.enactrc` (`"Chrome >= 69"` instead of
  `"last 2 chrome versions"`). The two configs had been disagreeing — if
  the package.json one had won, the bundle would ship ES2022+ syntax that
  webOS 4.5–6 cannot parse. Now both files agree on Chrome 69 / ES2018.
- `pack-p` now runs `scripts/patch-dist-html.js` after `enact pack -p`
  (audit B2 belt-and-suspenders).

### `scripts/patch-dist-html.js` (new file)
- Post-build script that merges the source `index.html` (CSP, splash,
  TV viewport) with the webpack-injected `<script>` and `<link>` tags
  from `dist/index.html`. Idempotent — running it twice is a no-op once
  the file already contains our CSP + splash.
- This is the actual fix for B2. The `.enactrc` `template` key was tried
  in the previous round and silently didn't work — the built `dist/`
  still shipped Enact's default 398-byte template. This script bypasses
  the question entirely.

### `index.html`
- Replaced `inset: 0;` shorthand in the inline splash CSS with
  `top: 0; right: 0; bottom: 0; left: 0;` (audit B4).

### `src/App/App.js`
- **H6**: Now renders only the top-of-stack panel inside `<Panels>` instead
  of mapping the entire `viewStack` into Panels. After a typical session
  (`home → content-detail → player → creator`), the old code kept four
  full view trees alive simultaneously — directly at odds with the
  `requiredMemory: 256` declaration in `appinfo.json`. Cert review may
  not flag this, but real-hardware OOMs on 2019 TVs would.
- Side effect: Moonstone's native slide-between-panels animation is no
  longer used. Each push/pop unmounts and remounts. The content store
  caches keep this cheap; Zustand state survives because it lives
  outside the React tree.

### `src/components/NavBar.js`
- **B3**: Container expand/collapse is now driven by React state
  (`useState` + `onFocus`/`onBlur` on the `<nav>`) instead of the CSS
  `:has()` selector. `:has()` only shipped in Chromium 105 (webOS 24+),
  so the previous implementation left the bar permanently collapsed on
  every TV in the field.
- `onBlur` checks `currentTarget.contains(relatedTarget)` so moving focus
  between two NavItems doesn't briefly collapse and re-expand the bar.
- **H4**: Removed manual `onKeyDown` Enter handler on `NavItemBase`.
  Spottable synthesizes a click on Enter for the host element.
- **H5**: Removed explicit `tabIndex={-1}` on `NavItemBase`. Spottable
  manages tabIndex internally.

### `src/components/NavBar.module.less`
- **B3**: Removed both `:has(.spottable-focused)` rules. Replaced with
  `.navBar.expanded` toggled from React state (see above).
- **H3**: Removed `backdrop-filter: blur(16px)` and its `-webkit-`
  prefix. The brand background underneath is pure black, so a solid
  `rgba(10, 10, 10, 0.96)` is visually identical. The blur is too
  expensive on webOS 4/5 GPUs.

### `src/components/ContentRail.js`
- **B5**: `<section>` now receives a size-keyed class (`size-medium` etc.)
  so the LESS can supply a definite Scroller height per card size.

### `src/components/ContentRail.module.less`
- **B5**: Replaced `.scroller { height: auto; }` with per-size definite
  heights (280px / 380px / 580px / 360px for small/medium/large/wide).
  Moonstone's `Scroller` needs a definite height to compute its
  scrollable region — `height: auto` was producing intermittent panning
  bugs on the emulator.

### `src/components/ContentCard.js`
- **H4**: Removed manual `onKeyDown` Enter handler (Spottable handles it).

### `src/components/HeroCarousel.module.less`
- **B4**: 2 occurrences of `inset: 0` replaced.

### `src/components/VideoPlayer.js`
- **H7**: ErrorOverlay now uses `spotlightDefaultClass` on the retry
  button + `enterTo: 'default-element'` on the container, instead of
  `defaultElement: '[data-spotlight-id="player-retry"]'` and a manual
  `data-spotlight-id` attribute on the Button.
- `Spotlight.focus('player-retry')` now passes a bare spotlight ID.

### `src/components/VideoPlayer.module.less`
- **B4**: 4 occurrences of `inset: 0` replaced.
- **H3**: Removed `backdrop-filter: blur(24px)` on `.audioBackdropScrim`.
  Compensated visually with a darker linear-gradient overlay.

### `src/components/OfflineBanner.module.less`
- **H3**: Removed `backdrop-filter: blur(16px)`. Bumped solid background
  alpha to `0.97` to keep contrast.

### `src/components/ContentCard.module.less`
- **B4**: 1 occurrence of `inset: 0` replaced.

### `src/components/BootScreen.module.less`
- **B4**: 1 occurrence of `inset: 0` replaced.

### `src/components/ExitConfirmation.module.less`
- **B4**: 1 occurrence of `inset: 0` replaced.

### `src/components/ExitConfirmation.js`
- **H7**: "Stay" button now uses `spotlightDefaultClass`. Removed
  `autoFocus` prop and the `defaultElement: '[data-spotlight-id=...]'`
  selector on the container.

### `src/components/ErrorBoundary.module.less`
- **B4**: 1 occurrence of `inset: 0` replaced.

### `src/views/HomePanel.js`
- No changes this round. The B1 Scroller migration from the previous
  round is still in place.

### `src/views/BrowsePanel.js`
- **H4**: Removed manual `onKeyDown` Enter handler on `GenreChipBase`.

### `src/views/BrowsePanel.module.less`
- **B5**: Replaced `.gridScroller { height: auto; }` with `height: 380px`
  (matches medium-card rail height; cards in BrowseGrid are size="medium").

### `src/views/LivePanel.module.less`
- **B4**: 1 occurrence of `inset: 32px` replaced.

### `src/views/SearchPanel.js`
- **H4**: Removed manual `onKeyDown` Enter handler on `KeyBase`.

### `src/views/PlayerPanel.js`
- **H4**: Removed manual `onKeyDown` Enter handler on `IconButtonBase`.
- **H7**: `IconButton` no longer stamps `data-spotlight-id` as a DOM
  attribute. `spotlightId` is forwarded canonically via Spottable.
  The play-pause button is marked with `spotlightDefaultClass`.
  PlayerControls and PlayerPanel containers now use bare
  `enterTo: 'default-element'` instead of attribute-selector
  `defaultElement` references.
- `Spotlight.focus(...)` calls now pass bare spotlight IDs (`'play-pause'`,
  `'player-error-back'`) instead of `[data-spotlight-id="..."]` CSS
  selectors. Spotlight resolves these internally.
- ErrorView container now uses `enterTo: 'default-element'` honoring
  `spotlightDefaultClass` on the recovery button.
- IconButton's external `className` (e.g. `spotlightDefaultClass`)
  is now properly merged with the component's own classes via
  `classNames(css.iconButton, css[\`icon-${icon}\`], className)`.

### `src/views/PlayerPanel.module.less`
- **B4**: 3 occurrences of `inset: 0` / `inset: 20px` replaced.

### `src/views/CreatorPanel.module.less`
- **B4**: 2 occurrences of `inset: 0` replaced.

### `src/views/CreatorPanel.js`
- **H7**: Follow button now uses `spotlightDefaultClass` instead of
  `autoFocus`. Container switched from `enterTo: 'last-focused'` to
  `enterTo: 'default-element'`.

### `src/views/ContentDetailPanel.module.less`
- **B4**: 1 occurrence of `inset: 0` replaced.

### `src/views/ContentDetailPanel.js`
- **H7**: Play button now uses `spotlightDefaultClass`. Removed
  `autoFocus` prop. Container `defaultElement` selector removed.

### `src/views/LoginPanel.js`
- **Diagnostic finding (May 15)**: Guest button now uses
  `spotlightDefaultClass` instead of `autoFocus`. The container's
  `defaultElement: '[data-spotlight-id="login-guest"]'` selector was
  broken (Moonstone's Button doesn't render spotlightId as a DOM
  attribute, so the selector never matched) — replaced with
  `enterTo: 'default-element'` honoring the marked class.
- This was the first-screen focus bug — login was relying on the
  `autoFocus` workaround for a broken default-element selector.

### `src/views/ProfilePanel.js`
- **M4**: Watchlist/history load failures now show a notification
  (`notify(Strings.errorBoundary.title(), {type: 'error'})`) and
  capture the underlying error to telemetry. Previously the catch
  block was empty (`catch (_) { /* silent */ }`).

### `src/views/SettingsPanel.js`
- **H4**: Removed manual `onKeyDown` Enter handler on `SettingsRowBase`.
- **Diagnostic finding (May 15)**: The "Sign Out" row's `autoFocus` prop
  was dead code (the prop doesn't pass through Spottable as a focus
  signal). The container's `defaultElement: '[autofocus]'` selector was
  similarly broken — React strips the `autoFocus` prop on non-input
  elements, so the selector never matched. Both replaced with the
  canonical `spotlightDefaultClass` pattern.
- Cleaned up now-unused `useState` / `useCallback` imports.
- `SettingsRowBase` now destructures `className` so external classes
  (like `spotlightDefaultClass`) merge with our row classes via
  `classNames`.

---

## Verification matrix

Run these greps after `git apply` or extraction. All should produce no
hits on active code (some have doc comments referring to the removed
patterns — those are intentional documentation):

```bash
# Audit B3 — :has() removed from active CSS
grep -rn ":has(" src/ --include="*.less"
# Expected: only NavBar.module.less line 20 (comment)

# Audit B4 — `inset:` shorthand fully removed
grep -rn "^[[:space:]]*inset:[[:space:]]" src/ --include="*.less" --include="*.html"
# Expected: 0 hits

# Audit B5 — no Scroller still has height: auto
grep -rn "height:[[:space:]]*auto" src/ --include="*.less"
# Expected: 0 hits (only comments)

# Audit H3 — backdrop-filter removed
grep -rn "backdrop-filter:" src/ --include="*.less"
# Expected: 0 hits (only comments documenting the removal)

# Audit H4 — no manual Enter trap on Spottable hosts
grep -rn "e.key === 'Enter'" src/ --include="*.js"
# Expected: 0 hits

# Audit H7 — no data-spotlight-id attribute selectors
grep -rn 'data-spotlight-id' src/ --include="*.js"
# Expected: comments only — no code references

# Audit H6 — App.js renders only top of stack
grep -A2 "viewStack.map" src/App/App.js
# Expected: no match (the .map() pattern was replaced with CurrentComponent)

# Diagnostic — no remaining autoFocus
grep -rn "autoFocus" src/ --include="*.js"
# Expected: comments only

# Audit B6 — version sync still enforced
node scripts/check-version-sync.js
# Expected: "OK — all three sources agree on 1.0.0"
```

---

## Build & deploy

Same as before — the npm scripts handle everything:

```bash
# Clean and reinstall to pick up any package-lock drift
rm -rf node_modules dist
npm install

# Sanity-check the source before building
npm run lint
npm test

# Production build (pack-p now also runs patch-dist-html.js)
npm run pack-p

# Verify the patch landed (B2)
grep -c 'Content-Security-Policy' dist/index.html  # expect 1
grep -c 'dousic-splash' dist/index.html            # expect 1
wc -c dist/index.html                              # expect ~4500-5000 bytes

# Package the IPK (signed if cert is present)
npm run package

# Sideload to a registered dev TV
ares-install --device <name> com.dousic.app.dousic_1.0.0_all.ipk
ares-launch --device <name> com.dousic.app.dousic
```

---

## What to look for on the real LG TV

This is the QA list ordered by what these fixes were intended to resolve.
Test on **at least one webOS 4.5 / 5.x TV** (the stress target) and **one
webOS 23+ TV** (the modern target).

### High-impact, immediately observable

1. **NavBar expands on focus, every webOS version**
   - Move focus into the left nav. The labels should appear within ~300ms.
   - Move focus out. Labels should fade and the bar should re-collapse.
   - On webOS < 24 this previously did nothing; now it should work
     identically on every supported firmware.

2. **Vertical scroll follows focus on every panel**
   - Home → Down through rails: viewport pans to keep the focused card
     visible. No off-screen focus.
   - Browse → focus a card past the right edge: rail pans horizontally.
   - Same on Live, Search, Profile, Settings.

3. **First-screen focus is correct on every panel**
   - Login: Guest button is focused on mount (not first nav item).
   - Player: Play/Pause is focused when controls appear.
   - Content detail: Play/Resume button is focused on mount.
   - Creator: Follow/Following button is focused on mount.
   - Settings: Sign Out row is focused on mount (when signed in).
   - Exit confirmation: "Stay" button is focused when dialog opens.
   - Player error: "Go back" / "Retry" button is focused when error shows.

4. **Splash screen + CSP land in production**
   - Cold launch: a dark splash with "dousic." mark + magenta pulse ring
     appears within ~200ms (the inline CSS in index.html).
   - DevTools (via `ares-inspect`) → Network: page response includes
     `Content-Security-Policy` header from the meta tag.
   - DevTools → Elements: viewport meta is `width=1920`.

### Smell tests for the bigger architectural change (H6)

5. **No memory growth in a 30-minute soak**
   - Open `ares-inspect` → Memory tab.
   - Take heap snapshot.
   - Navigate home → content-detail → player → back → creator → back
     → home → repeat 20 times.
   - Take heap snapshot again.
   - Heap should be stable (< 20MB drift). The all-views-mounted version
     would have shown unbounded growth.

6. **Panel transitions feel snappy, not laggy**
   - Push to player from home. Should mount within ~100ms.
   - Back to home. Should restore within ~100ms (content cache is warm).
   - There is no slide animation between panels — the previous code's
     Panels-stack approach gave us a built-in slide, removed for memory.
     This is by design and acceptable for MVP.

### Background

7. **Magic Remote pointer mode + 5-way mode both work**
   - Pick up the Magic Remote, point at a card. Spotlight pointer mode
     should highlight cards under the pointer.
   - Set the remote down for ~3 seconds. The pointer should hide and
     5-way (arrows) should take over with directional nav.
   - Spotlight handles both modes natively — these fixes don't touch
     pointer logic, but the symptoms users complained about (focus
     vanishing on Down) were really the missing Scroller follow-focus,
     which is now fixed.

8. **Captions, locale, network status all read from system**
   - In LG TV settings, toggle captions on/off. In Dousic player, the
     state should follow within 1-2 seconds.
   - Change TV language. Restart the app. NavBar labels should be in the
     new language (English / Spanish / Korean).
   - Pull the network cable / disable Wi-Fi. The offline banner should
     appear within ~5 seconds. Restore. Banner disappears.

### Don't test on the emulator (it lies about these)

- `:has()` selector — works on emulator's modern Chromium, doesn't on
  webOS < 24. The B3 fix specifically targets real-hardware behavior.
- `inset` shorthand — works on emulator, doesn't on webOS < 22.
- `backdrop-filter` performance — emulator is GPU-accelerated;
  real TVs are not.
- Memory pressure — emulator has effectively infinite RAM.

The emulator is fine for layout iteration but you must validate on
real hardware before drawing conclusions about any of these fixes.

---

## Items still on the radar (not fixed this round)

- **M1 — `'unsafe-eval'` in production CSP.** React 18 prod doesn't need
  it. Path forward: build-time template variant or `sed` post-build to
  drop the directive. One day of work + a full QA pass.
- **BrowsePanel "grid" identity crisis.** Code is a single-row horizontal
  flex. Docs/comments say "4-column 2D grid". Product decision needed
  before any code change. If 2D wrapping grid is desired, swap
  `Scroller direction="horizontal"` for `direction="vertical"`, replace
  `display: flex` + `width: max-content` with CSS Grid
  `(display: grid; grid-template-columns: repeat(4, 1fr))`, and the
  Spotlight container's `continue5WayHold` becomes unnecessary.
- **`scripts/patch-dist-html.js` may become unnecessary** if Enact CLI
  6.x fixes its template handling in a future version. The script is
  idempotent — leaving it wired in is harmless.
- **Hardware QA matrix run** — BUILD_GUIDE.md Section 14 has the full
  15-scenario list. That's the remaining work between this build and
  cert submission.

---

# Dousic webOS — Round 3 Changes (May 23, 2026)

This round layers on top of Round 2. Two user-facing improvements
(view persistence + Browse 2D grid), one architectural cleanup
(NavBar lift to App level), three sub-changes the persistence work
required, and three self-review defects caught during the deep
diagnostic. No audit IDs are consumed in this round — all items are
new additions surfaced after the Round 2 sweep.

Source: `FINAL_DIAGNOSTIC.md`.

---

## Summary table

| Change | Severity | Status | Files |
|---|---|---|---|
| View persistence (scroll + focus across remount) | Feature | Implemented | `src/hooks/useViewPersistence.js` (new), `src/state/appStore.js`, 8 panel views |
| Browse 2D grid (4-column CSS Grid replaces single-row flex rail) | UX bug | Fixed | `src/views/BrowsePanel.{js,module.less}` |
| NavBar lift to App level (prevents focus loss on `switchRoot`) | Regression | Fixed | `src/App/App.js` |
| `appStore` — stable `frameId` + `viewState` map + cleanup guards | Sub-change | Implemented | `src/state/appStore.js` |
| `ContentCard` — stable `spotlightId` derived from item `id` | Sub-change / Silent bug | Prevented | `src/components/ContentCard.js` |
| `useViewPersistence` — `useCallback` on `onScroll` (eliminates Scroller re-bind churn) | Defect | Fixed | `src/hooks/useViewPersistence.js` |
| `saveViewState` stack guard (blocks post-pop-unmount writes) | Defect / Race condition | Fixed | `src/state/appStore.js` |
| `patch-dist-html.js` — multi-asset support (captures all script/link chunks) | Defect | Fixed | `scripts/patch-dist-html.js` |
| Support matrix declared: webOS 5.0+ minimum | Docs | Updated | `README.md` |

---

## File-by-file changes

### `src/hooks/useViewPersistence.js` (new file)

New hook, 164 lines. Provides scroll-position and Spotlight-focus
restoration across the unmount/remount cycle introduced by H6
(top-of-stack rendering).

- **Restore on mount**: reads `viewState[frameId]` from `appStore`
  after a double-RAF. The two frames give the Moonstone Scroller time
  to finish internal layout/measurement before `scrollTo` is called,
  preventing the "clamps to 0" bug seen on webOS 5.0/6.0.
- **Save on unmount**: cleanup writes `{scrollTop, focusedId}` back
  under the same `frameId`.
- **`frameId` capture**: uses `useState(() => useAppStore.getState().viewStack[length-1]?.frameId)` so the frame is stable across any subsequent stack pushes during the panel's life.
- **`focusin` listener**: registered in capture phase at document level so `lastFocusedIdRef` always holds the most recent spotlight-focused element, regardless of tree depth. Reading `Spotlight.getCurrent()` in unmount cleanup is unreliable because teardown may shift focus before the cleanup runs.
- **`onScroll` wrapped in `useCallback` with empty deps**: keeps the function reference stable for the panel's lifetime. Without this, each parent re-render returns a new function, causing Moonstone Scroller to re-bind its scroll listener on every render — measurable churn on long scrolls.
- **Return shape**: `{ scrollerProps: { ref, onScroll }, frameId }`. Consumers spread `{...persistence.scrollerProps}` on their outer `Scroller`.

### `src/state/appStore.js`

- **`frameId` on every stack entry**: `newFrameId()` generates `f_${Date.now()}_${++_frameSeq}`. The monotonic counter prevents collisions on synchronous same-millisecond push sequences. Initial stack entry, `pushView`, `replaceView`, `switchRoot`, and `clearStack` all call `newFrameId()`.
- **`viewState: {}` map**: new top-level store key. Keyed by `frameId`. Written by `useViewPersistence` on unmount; read on mount.
- **`popView` cleanup**: destructures the popped frame's entry out of `viewState` synchronously before `set()`, so the frame can never be resurrected by a racing cleanup write.
- **`switchRoot` / `replaceView` / `clearStack` cleanup**: all set `viewState: {}` (full wipe), clearing any saved state from the previous navigation context.
- **`saveViewState` stack guard**: before writing, builds `stackIds = new Set(s.viewStack.map(v => v.frameId))` and returns `s` (no-op) if `frameId` is not present. This is the specific fix for the post-pop-unmount race: `popView` deletes the frame synchronously, then React unmounts the panel and cleanup calls `saveViewState` — without the guard, the deleted entry would be re-added, leaking one stale frame per pop. The same guard handles `switchRoot` / `replaceView` (which wipe `viewState` before cleanup runs).
- **`getViewState(frameId)`**: simple getter returning `viewState[frameId] || null`.

### `src/components/ContentCard.js`

Split into three layers:

1. `ContentCardBase` — the presentational component (unchanged in behavior).
2. `ContentCardSpottable = Spottable(ContentCardBase)` — adds Spotlight wiring.
3. `ContentCard` — thin outer wrapper that derives `spotlightId={spotlightId || \`card-${id}\`}` when no explicit `spotlightId` is passed.

Without layer 3, Spottable auto-generates a new internal ID (`card_internal_abc7421`, etc.) on every mount. `useViewPersistence` would save that ephemeral ID on unmount and try to restore it on remount — but the freshly-mounted card has a new ID. `Spotlight.focus` silently returns `false` (falls back to `enterTo`), and persistence quietly fails. Deriving the ID from the stable item `id` makes focus restoration land on the correct card across back-navigation.

The outer wrapper preserves `{...rest}` pass-through so all existing call sites are unaffected.

### `src/App/App.js`

- **`NAV_VIEWS` set** (line 84): `new Set(['home', 'browse', 'live', 'search', 'profile'])` — the five views where the persistent NavBar should be visible. Modal views (`player`, `content-detail`, `creator`, `login`, `settings`) are full-screen and hide the nav.
- **NavBar rendered at App level** (line 284): `{showNav && <NavBar />}` outside `<Panels>`. Previously NavBar was rendered inside each panel. Because H6 unmounts panels on `switchRoot`, the NavBar instance was destroyed every time the user clicked a nav item — killing the NavItem's Spotlight focus on the item they just clicked. Lifting it to App keeps a single NavBar instance alive across all root view transitions. Layout works unchanged because `NavBar` uses `position: fixed`.
- No other App.js changes this round; the H6 `<CurrentComponent>` single-render pattern was established in Round 2.

### `src/views/BrowsePanel.js`

Old structure: `Panel → Scroller(vertical) → header + chips + BrowseGrid[Scroller(horizontal) → flex strip → cards]`. The nested Scrollers fought for follow-focus; the "grid" was a single horizontal row of N items.

New structure: `Panel → Scroller(vertical) → header + chips + BrowseGrid[div.grid (CSS Grid)]`. One Scroller owns all scrolling; pressing Down moves to the next row, Right moves within a row; Spotlight handles geometry via `SpotlightContainerDecorator`.

- Removed: inner horizontal `Scroller`, `continue5WayHold`, `.gridScroller` class.
- Added: `BrowseGrid` renders `<div className={css.grid} role="grid">` containing `ContentCard`s. `SpotlightContainerDecorator({ enterTo: 'last-focused' })` on both `GenreRow` and `BrowseGrid`.
- `useViewPersistence` hook added; `{...persistence.scrollerProps}` spread on the outer `Scroller`.

### `src/views/BrowsePanel.module.less`

- Removed `.gridScroller` block (had `height: auto`, `overflow: visible`, `Scroller` inner sizing rules).
- Added `.grid` block:
  ```less
  .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: @spacing-xl @spacing-md;
      padding: 40px @safe-area-side @spacing-xxl;
  }
  .grid.grid > * { width: 100%; }
  ```
  The double-class specificity rule (`0,2,0`) deterministically beats `ContentCard`'s `.medium { width: 360px }` (`0,1,0`). Tied specificity would resolve by webpack CSS-bundle emission order, which is an implementation detail. The double class avoids that fragility without `!important`.
- Layout math on FHD 1920×1080: available width 1728px → 4 columns × ~420px → cards ~280px tall → ~2 full rows + 1 partial visible → follow-focus pans cleanly on Down.

### `src/views/{HomePanel, LivePanel, SearchPanel, ProfilePanel, ContentDetailPanel, CreatorPanel, SettingsPanel}.js`

Each of the eight Scroller-bearing panels:
- Imports `useViewPersistence` from `../hooks/useViewPersistence`.
- Calls `const persistence = useViewPersistence()` inside the panel body.
- Spreads `{...persistence.scrollerProps}` on the panel's primary outer `Scroller`.
- `NavBar` import removed (NavBar is now at App level).

### `scripts/patch-dist-html.js`

Previously the regex captured only the first `<link>` and `<script>` tag from `dist/index.html`. With webpack `splitChunks`, the output can include `runtime.js`, `vendor.js`, `main.js`, etc. The fix uses a global regex (`g` flag) with `match()` to capture ALL stylesheet link tags and ALL script src tags, then injects them all as a block:

```js
const linkTags  = distHtml.match(/<link[^>]*href="[^"]*\.css"[^>]*\/?>/g)  || [];
const scriptTags = distHtml.match(/<script[^>]*src="[^"]*\.js"[^>]*><\/script>/g) || [];
```

Errors out with an actionable message if either set is empty. Idempotent re-run guard (checks for `Content-Security-Policy` + `dousic-splash` in existing `dist/index.html`) remains.

### `README.md`

Support matrix updated: webOS 5.0 declared as the minimum supported version. CSS Grid for the Browse panel requires Chromium 57+; webOS 5.0 ships Chromium 68, giving a margin of 11 versions. The `.enactrc` target (`Chrome >= 69`) was already setting a de-facto 5.0 floor; the README now makes it explicit.

---

## Verification matrix

Run these after any checkout. All greps should produce zero hits (or comments-only as noted):

```bash
# Carried-over audit anti-patterns (regression sweep)
grep -rn ":has(" src/ --include="*.less"
# Expected: 1 hit — NavBar.module.less comment only

grep -rn "^[[:space:]]*inset:" src/ --include="*.less" --include="*.html"
# Expected: 0

grep -rn "backdrop-filter:" src/ --include="*.less"
# Expected: 0 (3 comment hits documenting the removal)

grep -rn "overflow-y:[[:space:]]*auto" src/ --include="*.less"
# Expected: 0

grep -rn "data-spotlight-id" src/ --include="*.js"
# Expected: comments only (ContentCard, PlayerPanel, ContentDetailPanel, LoginPanel, useViewPersistence)

grep -rn "autoFocus" src/ --include="*.js"
# Expected: comments only

grep -rn "e\.key === 'Enter'" src/ --include="*.js"
# Expected: 0

grep -rn "height:[[:space:]]*auto" src/ --include="*.less"
# Expected: 0

# Round-3-specific structural checks
grep -rln "useViewPersistence" src/views/ | wc -l
# Expected: 8

grep -rn "scrollerProps" src/views/ | wc -l
# Expected: 8 (one spread per panel)

grep -n "useCallback" src/hooks/useViewPersistence.js
# Expected: match on the onScroll definition

grep -n "stackIds" src/state/appStore.js
# Expected: match on the saveViewState guard

grep -n "display: grid" src/views/BrowsePanel.module.less
# Expected: match

grep -n "gridScroller" src/views/BrowsePanel.module.less
# Expected: 0

grep -n "continue5WayHold" src/views/BrowsePanel.js
# Expected: 0

grep -n "import NavBar" src/views/*.js
# Expected: 0 (NavBar is only imported in src/App/App.js)
```

---

## Real-hardware risk areas

These cannot be verified from a code review. Flag before cert submission.

### R1 — `Scroller.scrollTo` timing on webOS 5.0/6.0

`useViewPersistence` uses double-RAF before calling `Scroller.scrollTo`. This is standard and works on Chromium desktop. On older webOS hardware with constrained GPU, the Scroller's internal layout/measurement may require more than 2 frames. If `scrollTo` is called too early it clamps to 0 — restoration silently fails.

**Test**: real TV, navigate Home → scroll to ~1500px → push content-detail → back. Scroll should restore.

**Fix if it fails**: replace double-RAF with `setTimeout(0)` + `requestAnimationFrame`. 5-line change in `useViewPersistence.js`.

### R2 — `Spotlight.focus(id)` race against panel render

On remount, card elements render in the same tick as the `useEffect` fires, but Spottable's `data-spotlight-id` attribute registration happens during React's commit phase. Double-RAF covers this in practice — verify on hardware.

**Test**: same navigation as R1. Focus should land on the exact card you left from.

### R3 — CSS Grid `gap` on webOS 5.0

`gap` for CSS Grid is supported in Chrome 66+. webOS 5.0 ships Chrome 68 (2-version margin). Should work. If a vendor patch removed it, cells will touch with no spacing — visual only, not a crash.

**Test**: real webOS 5.0 TV, open Browse, confirm spacing between cards.

**Fallback if needed**: replace `gap: @spacing-xl @spacing-md` with explicit margin on each cell (`margin-right + margin-bottom`, `:nth-child(4n) { margin-right: 0 }`).

---

## Items deferred to v1.1

These were considered and deliberately not included. Discipline of "ship v1 → measure → iterate":

- **CSP `'unsafe-eval'` strip** (audit M1). Cert won't reject it; security review may flag it. Two-template approach or build-time `sed` step. Half-day of work.
- **Lint + test gating in `pack-p`** (audit M2, M3). One-line changes each. Deferred to avoid surfacing pre-existing lint warnings that would block submission.
- **`Spotlight.focus(.${css.dialog})` in `ExitConfirmation.js`**: redundant with the `spotlightDefaultClass` change from Round 2; harmless belt-AND-suspenders pointing at a different element. Tidy when next touching the file.
- **Genre selection persistence on BrowsePanel**: `activeGenre` is component state, reset on remount. After back-navigating into Browse from a detail, the genre chip resets to "all". Real fix: lift `activeGenre` to `appStore`. ~30 lines. Polish item, not a blocker.
- **Telemetry event for "view persistence restored"**: would help future debugging. One `trackEvent` call in `useViewPersistence` on successful restore.
- **`appStore.test.js`**: `authStore.test.js` is the template. Should mirror it for the new `pushView / popView / switchRoot / saveViewState / guard` logic.

---

## Pre-submission prerequisites (Section 7 — for Gulzar, in order)

1. **Clean build on a fresh checkout**
   ```bash
   rm -rf node_modules dist
   npm install
   npm run pack-p
   ```
   Verify `dist/index.html` contains:
   - `Content-Security-Policy` meta tag (1 hit)
   - `dousic-splash` div + inline style (1 hit)
   - `<script src="main.js">` (and any chunk scripts)
   - `width=1920` viewport meta

2. **Sideload to a webOS 5.0/6.0 TV** (stress target):
   - App launches, splash shows, first paint < 4 seconds.
   - Home renders with focus on Hero Play button.
   - Scroll down, focus a card, tap → ContentDetail, back → Home: scroll position AND focused card both restore (R1/R2 headline test).
   - Browse opens: 4-column grid renders. Navigate 2D (Down moves rows, Right moves within row). Back from detail → Browse grid restores scroll + focus.
   - Live: viewer counts update via WebSocket. No crash on stream lifecycle transitions.
   - Memory soak: leave app foregrounded 30 minutes, navigate intermittently. No growth (check via `ares-inspect → Memory`).

3. **Sideload to a webOS 23+ TV** (modern target):
   - Same scenario set as above. Faster GPU should not introduce new timing issues.
   - CSS Grid `gap` should render correctly (R3 confirmation on the modern stack).

4. **LG Seller Lounge certificate** — external dependency (Rick). Should already be in motion. Longest lead time in the chain.

5. **Content team: catalog beyond demo HLS streams** — featured slots need real content before the app is presentable to LG reviewers at first-impressions.

---

## What to look for on real hardware (round-3 additions)

### Headline tests (new this round)

1. **Scroll + focus restoration on back-navigation**
   - Navigate Home, scroll down ~3 rails, focus a specific card.
   - Tap → ContentDetail (or Player).
   - Press Back.
   - Home should restore to the exact scroll position and the focused card should be highlighted. Not scroll-top + default focus.

2. **Browse 2D grid navigation**
   - Open Browse.
   - Confirm 4 columns of cards are visible.
   - Press Down: focus should move to the card directly below (same column, next row) — not to the right.
   - Press Right: focus moves to the adjacent card in the same row.
   - Scroll down past the visible area: Scroller pans as focus moves off-screen.
   - Open a content detail, press Back: Browse should restore scroll position and the last-focused card.

3. **NavBar focus stability on root navigation**
   - Focus a NavBar item (e.g. "Browse").
   - Press Enter to navigate.
   - The NavBar should remain visible and the same item (or the new active one) should be highlighted — focus should NOT jump to the panel body.
   - Navigate back to Home, then to Live, then to Search. NavBar should remain a single stable instance throughout.

### Don't test on the emulator (unchanged guidance)

- `Scroller.scrollTo` timing — emulator settles faster than real GPU.
- CSS Grid `gap` on webOS 5.0 — emulator runs a modern Chromium.
- Memory pressure during soak — emulator has effectively unconstrained RAM.
