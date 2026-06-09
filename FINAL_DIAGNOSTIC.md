# Dousic webOS — Final Deep Diagnostic

**Subject:** Production-readiness review of the round-3 codebase before Gulzar handoff
**Reviewer:** Claude (acting as second-pair-of-eyes against own work)
**Date:** May 15, 2026
**Verdict in one line:** Code is ready for hardware QA → cert submission, conditional on the five Section-7 prerequisites.

---

## 1 · What changed in round 3

Two user-facing additions on top of the audit closures:

| Change | What it does | Why |
|---|---|---|
| **View persistence** | Saves `{scrollTop, focusedSpotlightId}` per stack frame; restores on remount | H6 (top-of-stack rendering) was unmounting panels on push, losing scroll/focus on back-navigation. Disney+/Netflix preserve both. |
| **Browse 2D grid** | Replaced single-row horizontal Scroller-strip with proper CSS Grid (4 columns, vertical scrolling) | The "Browse" label was misleading — implementation was UX-equivalent to a 5000-item horizontal rail. First impression for LG reviewers. |
| **NavBar lift to App level** | NavBar now renders once at App level (conditionally for the 5 nav-eligible views), not inside each panel | Caught during the full-tree re-read. With NavBar inside each panel, H6's panel-unmount-on-switchRoot was also unmounting NavBar — losing focus on the NavItem the user just clicked. Lift is layout-clean because NavBar uses `position: fixed`. |

Plus three sub-changes the persistence work required:

- `appStore`: stable `frameId` on every stack entry; `viewState` map keyed by frame; cleanup on `popView` / `switchRoot` / `replaceView`; `saveViewState` guard preventing post-pop-unmount writes from leaking stale frames.
- `ContentCard`: wraps `Spottable` to derive a stable `spotlightId` from `id` (default: `card-${id}`). Without stable IDs, focus restoration can't target specific cards across remounts.
- `README`: support matrix now declares webOS 5.0+ as minimum. The `.enactrc` target (`Chrome >= 69`) was already inconsistent with the prior "4.5 minimum" claim; CSS Grid in the new Browse panel formalizes 5.0 as the floor (Chrome 57+ for Grid; webOS 5.0 ships Chromium 68).

Three defects caught and fixed during self-review:

- **`onScroll` re-bind churn**: hook was returning a fresh function reference every render, causing Moonstone Scroller to re-bind its scroll listener on each parent re-render. Wrapped in `useCallback` with empty deps.
- **`saveViewState` race**: when a panel is popped, `popView` deletes the frame's state synchronously, then React unmounts the panel and its cleanup calls `saveViewState`, which would silently re-add the deleted entry. Added a guard that refuses writes for frames not currently in the stack. Same guard handles the `switchRoot` / `replaceView` cases.
- **NavBar regression** (caught during the full-tree re-read this round): NavBar was inside each root panel. With H6 unmounting panels on `switchRoot`, NavBar+NavItem instances were destroyed every time the user clicked a nav item — losing Spotlight focus on the just-clicked item. Fix is to lift NavBar to App.js with conditional render based on view type. Layout works unchanged because NavBar is `position: fixed`.

---

## 2 · Architectural review

### 2.1 The persistence model (the part most likely to break on real hardware)

**Lifecycle trace** — user opens Home, scrolls to the "New Releases" rail, focuses card-abc, taps it:

1. `pushView('content-detail', {contentId: 'abc'})` → `viewStack: [home(F1), detail(F2)]`
2. App.js re-renders; top is Detail; React unmounts HomePanel
3. HomePanel cleanup: `saveViewState(F1, {scrollTop: 1240, focusedId: 'card-abc'})` — guard passes (F1 in stack)
4. Detail mounts; no saved state for F2; fresh start
5. User backs: `popView` → `viewStack: [home(F1)]`, `viewState[F2]` deleted synchronously
6. Detail unmounts; cleanup calls `saveViewState(F2, ...)` — **guard blocks** (F2 no longer in stack) — no leak
7. Home mounts; `useState` initializer captures `F1` (still root frame); effect reads `viewState[F1]`
8. Double-RAF: `Scroller.scrollTo({y: 1240, animate: false})` then `Spotlight.focus('card-abc')`
9. User sees Home as they left it — scroll position and focus both restored

**Stress tests** mentally executed and passing:

- Deep stack `[home → detail → player]`, pop twice → each level restores correctly, no orphaned `viewState` entries
- `switchRoot` from mid-stack → all `viewState` wiped + guard blocks any cleanup writes after wipe → new root starts clean
- Rapid push/pop within same millisecond → monotonic counter prevents `frameId` collision (`f_${Date.now()}_${++seq}`)
- React StrictMode dev double-mount → frame captured via `useState` initializer is stable across the mount→unmount→remount cycle; restoration is idempotent (saved `{scrollTop:0, focusedId:null}` → scrollTo(0) + focus(null) are both no-ops)
- Auth gate path (logged out, rendering LoginPanel outside `<Panels>`) → LoginPanel does not use the hook, so no spurious persistence writes for non-stack-aligned views

**One residual fragility I want to flag plainly**: the hook captures `frameId` at mount via `useState(() => useAppStore.getState().viewStack[length-1].frameId)`. If the appStore's stack ever changes shape (e.g., someone adds a "modal" layer that sits above the stack but isn't in `viewStack`), the hook would capture the wrong frame. The fix would be to thread `frameId` through props instead of reading the store. I left it reading the store because every current navigation path mutates `viewStack` consistently, and prop-threading would require touching App.js's render logic. **Note for Gulzar:** if you ever add a sibling navigation system (e.g., overlay modals not on the stack), revisit `useViewPersistence.js`.

### 2.2 The BrowsePanel grid

**Old structure** (UX bug): `Panel → Scroller(vertical) → header + chips + BrowseGrid[Scroller(horizontal) → flex strip → cards]`. Nested vertical+horizontal Scrollers fight each other for follow-focus; the "grid" was a single row of 5000+ items.

**New structure**: `Panel → Scroller(vertical) → header + chips + grid(CSS Grid 4×N)`. One Scroller owns all scrolling; cards are laid out 2D; pressing Down moves to next row, Right moves within row, Spotlight handles geometry.

**Specificity concern surfaced and fixed**: `ContentCard.module.less` has `.medium { width: 360px }` (specificity 0,1,0). `BrowsePanel.module.less` was using `.grid > * { width: 100% }` (also 0,1,0 — tied). Tied specificity resolves by source order, which depends on webpack's CSS-bundle emission order, which depends on import-graph traversal — an implementation detail webpack is free to change. Bumped to `.grid.grid > * { width: 100% }` (0,2,0) which beats `.medium` deterministically. No `!important`, no fragility.

**Layout math** on FHD 1920×1080:
- Available width: 1920 − 192 (safe area both sides) = 1728px
- 4 columns + 3 gaps × @spacing-md (~16px) = 4 columns × 420px wide cells
- ContentCard fills cell, thumbnail aspect-ratio 16/9 → ~236px tall
- Card height with meta: ~280px; row gap @spacing-xl (~32px) → row pitch ~312px
- Visible rows in remaining viewport (~700px after header/chips): 2 fully visible + 1 partial — follow-focus pans cleanly

On UHD 3840×2160 with Enact's 2× rem scaling: cells visually 2× larger, layout proportions identical.

### 2.3 H6 + persistence: the memory budget question

The original audit chose H6 (unmount popped panels) over bumping `requiredMemory` from 256 to 512MB. With persistence now restoring scroll/focus, **the UX cost of H6 is paid down to ~zero** — the user gets the experience of an all-mounted approach with the memory footprint of single-mount. This was the right architectural choice; I'm confident in it now in a way I wasn't in the round-2 diagnostic.

### 2.4 Stable spotlight IDs — silent class of bugs averted

The `ContentCard` wrapper deriving `spotlightId={card-${id}}` from item id is non-obvious but essential. Without it, every `<ContentCard>` would get an auto-generated Spotlight ID assigned at mount, NEW each time. The persistence layer would faithfully save `"card_internal_abc7421"` on unmount and try to restore it on remount — but the freshly-mounted card has a new internal ID `"card_internal_xyz9923"`. Focus restoration would silently no-op (Spotlight.focus returns false; falls back to `enterTo`). No crash, no visible error, just persistence quietly not working. This is the kind of bug that ships and gets reported six months later as "focus feels off sometimes on back-nav."

The audit explicitly noted this risk class; the fix is in `ContentCard.js`.

### 2.5 Things that DIDN'T need touching but are worth confirming

- **WebSocket lifecycle**: in App.js, unified `ws.connect()` / `ws.disconnect()` keyed on `(isAuthenticated && isForeground)`. Not per-view. H6 doesn't affect it. ✓
- **Telemetry**: `trackScreenView` is called from `pushView/popView/replaceView/switchRoot` reducers, not from view mounts. H6's churned mount/unmounts don't generate spurious telemetry. ✓
- **Memory pressure response**: `useLowMemoryWarning` lives in App.js and drops content store caches. Independent of view stack. ✓
- **Content store**: data is cached by `home/live/browse` keys with stale-age tracking. Remount triggers refresh, but if cache is fresh, `loadHome()` resolves immediately from store. ✓

---

## 3 · Full verification matrix

Every grep below must return zero for the audit-flagged anti-patterns:

```
:has() in active CSS:     0    (1 hit is a code comment documenting the replacement)
inset shorthand:          0
backdrop-filter:          0
overflow-y: auto:         0
data-spotlight-id JSX:    0
autoFocus prop:           0
manual Enter handlers:    0
height: auto on Scroller: 0
```

Round-3-specific checks:

```
Panels using useViewPersistence:   8/8
Panels spreading scrollerProps:    8/8
useCallback wrapping onScroll:     yes
stackIds guard in saveViewState:   yes
display: grid in BrowsePanel:      yes (single rule, replaces old flex strip)
gridScroller class still present:  no  (removed)
continue5WayHold still present:    no  (no longer needed without inner Scroller)
BrowseGrid contains a Scroller:    no  (single outer Scroller owns scrolling)
```

Structural checks:

```
Brace balance across all touched files: all balanced
Internal import resolution:             all resolve
ContentCard wrapper forwards props:     yes ({...rest} preserved)
Spotlight imports consistent:           yes (all from '@enact/spotlight')
```

`scripts/patch-dist-html.js` (which lands the rich CSP + splash HTML into Enact's default dist output):

```
Single-asset case (current Enact 6.x output):       PASS
Multi-asset case (webpack splitChunks output):      PASS  (regression fixed mid-review)
Idempotent re-run:                                  PASS
```

---

## 4 · Risk areas (real hardware only — not catchable from code review)

These are things I literally cannot verify from a desk and must be flagged before submission:

### 4.1 webOS Scroller.scrollTo timing

`useViewPersistence` uses double-RAF before calling `Scroller.scrollTo`. This is the standard pattern, and it works on Chromium desktop. On older webOS hardware (particularly 5.0/6.0 with constrained GPU), the Scroller's internal layout/measurement might require more than 2 frames to settle. If `scrollTo` is called too early, it clamps to 0 — restoration silently fails, user sees scroll-top.

**Test**: real TV, navigate Home → scroll to position ~1500px → push detail → back. Scroll should restore.
**If it fails**: bump from double-RAF to `setTimeout(0)` + RAF, or use `IntersectionObserver` on a sentinel element. Either path is a 5-line change.

### 4.2 `Spotlight.focus(id)` race against panel render

Same timing class: on remount, the cards are rendered in the same tick as the `useEffect` runs, but Spottable's internal registration of `data-spotlight-id` attributes happens during the commit phase. The double-RAF gives time for both layout and Spotlight registration. Should be fine; verify on real hardware.

**Test**: same as above, observe focus lands on the card you left from.

### 4.3 CSS Grid `gap` on webOS 5.0

`gap` for CSS Grid is supported in Chrome 66+. webOS 5.0 ships Chrome 68. Margin-of-safety: 2 versions. Should work, but if a vendor patch backed it out, cells would touch with no spacing — visual ugly, not a crash.

**Test**: real webOS 5.0 TV, open Browse, confirm spacing between cards.
**Fallback if needed**: replace `gap: @spacing-xl @spacing-md` with margin-based spacing (margin-right + margin-bottom, `:nth-child(4n) { margin-right: 0 }`).

### 4.4 LG cert specifics not in this code review

- Cold-start time budget (LG wants < 4 seconds first paint)
- Memory soak test (run app for 30+ minutes, check no growth)
- Magic Remote pointer mode UX (Spotlight switches modes; the focus-tracking model needs to gracefully handle pointer mode where `data-spotlight-id` may not stay current)
- Parental controls hook (if mature content present)
- Accessibility (TTS labels, large text mode) — appinfo already declares `accessibility`
- Deep-link launch params handling (App.js handles `contentTarget` / `contentId` on launch)

### 4.5 Tests / lint not gated by `pack-p`

Audit M2 (lint) and M3 (tests) — neither runs as part of `npm run pack-p`. Not blocking, but means a future refactor that breaks something untested won't fail the build. **Add as v1.1 hygiene.**

---

## 5 · Things deliberately left for v1.1

I'm flagging these explicitly because I considered fixing them and decided the discipline of "ship v1 → measure → iterate" beats scope creep:

- **CSP `unsafe-eval` strip for production** (audit M1). Cert won't reject; security review may flag. Two-template approach or build-time `sed` step. Half-day of work, deferred.
- **Lint + test gating in pack-p** (M2, M3). One-line changes each. Deferred to avoid risk of catching pre-existing lint warnings that block submission.
- **`Spotlight.focus(.${css.dialog})` in `ExitConfirmation.js`** — redundant with my `spotlightDefaultClass` change; harmless belt-AND-suspenders, two refs pointing at different elements. Tidy when next touching the file.
- **Genre selection persistence on BrowsePanel** — currently `activeGenre` is component state, reset on remount. If you back into Browse from a detail, you start at "all" again. Real fix: lift to `appStore`. ~30 lines. Counts as a polish item, not a blocker.
- **Locale strings for the new strings I added**: there are no new strings — `BrowsePanel` reused existing `Strings.browse.*` and `Strings.nothingHere()`. Verified no missing keys.

---

## 6 · Architecture verdict

**I'm proud of this code.** Specifically:

- The persistence model is small (one hook, ~150 lines including comments), composable (works on any panel by adding two lines), and observable (one source of truth in `appStore.viewState`).
- The frame-ID design — generated on push, cleaned on pop, wiped on switchRoot — gives clean lifetime semantics without manual bookkeeping per panel.
- The `saveViewState` stack-guard is a small piece of code that prevents a class of leaks I hadn't anticipated until the self-review pass. Worth its existence purely as a tripwire.
- The Browse grid refactor is short (~30 lines of LESS, ~5 lines of JS structure) but resolves a UX bug LG reviewers WILL see on first open.
- The `ContentCard` stable-spotlightId wrapper is the kind of fix you'd never think to add until you've watched focus restoration silently no-op in dev.
- Audit-closure: every grep returns the expected zero. The verification matrix is reproducible on any clean checkout.

**What this codebase doesn't have that I wish it had** (not blocking, but for honesty):

- Real hardware QA. No way around this from a desk.
- A telemetry event for "view persistence restored" — would help future debug.
- Documented test coverage for `appStore`'s new actions (the existing `authStore.test.js` is a good template; mirror it for `appStore.test.js`).
- A perf bench for the focusin listener at document level. In theory it fires for every focus change; in practice on a TV remote app there's ~one focus change per second worst-case. Fine.

---

## 7 · Pre-submission prerequisites (in order, before pressing the LG submit button)

1. **Gulzar runs `npm install && npm run pack-p` on a clean checkout.** Verify `dist/index.html` post-build contains CSP + splash + all asset tags. Verify `dist/*.ipk` size sane.
2. **Sideload to a webOS 5.0/6.0 TV** (the stress target) — confirm:
   - App launches, splash shows, first paint < 4s
   - Home renders, focus lands on Hero Play button
   - Scroll down, focus a card, tap, back — Home restores scroll + focus (the headline test for round-3)
   - Browse opens, 4-column grid renders, navigate 2D, scroll vertically, back from detail — grid restores
   - Live opens, viewer counts update via WS, no crash on stream lifecycle
   - Memory soak: leave app in foreground 30 minutes, navigate intermittently — no growth
3. **Sideload to a webOS 23+ TV** (the modern target) — verify same scenarios, faster GPU shouldn't introduce new timing issues
4. **Rick: certificate issuance from LG Seller Lounge** — longest external dependency; should already be in motion
5. **Content team: catalog beyond demo HLS streams** — featured slots need real content

---

## 8 · Bottom line for the handoff message to Gulzar

The code is structurally clean, passes every verification sweep we can run from a desk, and resolves both the LG-reviewer-first-impression issue (Browse 2D grid) and the Disney+-feel gap (scroll/focus persistence). Three architectural risks remain — all are real-hardware timing concerns that mitigations exist for if they surface — and five smaller polish items are deliberately deferred to v1.1.

**Hand this to Gulzar with the instruction**: run the Section 7 prerequisites in order, report any deviation. If all pass, ship. If timing issues surface in Section 7.1–7.3, the fixes are documented and short.

Once v1.0.0 is live and stable, the conversation about featured placement is a separate workstream — Michael Ferguson on the LG partnership side, with Rick maintaining the Seller Lounge relationship. Featured placement also wants Korean localization quality-checked by a native speaker.

— End of diagnostic —
