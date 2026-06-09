# Enact WebOS Development Reference

## When Starting A Task

Check these first:

- `package.json` for available Enact, packaging, lint, and test scripts.
- `src/App/App.js` for app shell, decorators, panels, lifecycle, and global handlers.
- `src/views` for route-level panel conventions.
- `src/components` for reusable Moonstone/Spotlight patterns.
- `src/hooks/usePlatform*` and `src/platform` for webOS lifecycle, Luna, telemetry, device, and media integration.
- `appinfo.json`, `webos-meta`, and `.arespackageignore` for package metadata changes.

## Enact Documentation Anchors

- Main site: https://enactjs.com/
- Developer guide: https://enactjs.com/docs/developer-guide/
- Best practices: https://enactjs.com/docs/developer-guide/best-practices/
- Spotlight guide: https://enactjs.com/docs/developer-guide/spotlight/
- webOS support module: https://enactjs.com/docs/developer-guide/webos/
- Moonstone components: https://enactjs.com/docs/modules/moonstone/

## TV Navigation Checklist

Use this checklist for UI changes:

- [ ] Initial focus lands on a meaningful control.
- [ ] Left, Right, Up, Down move predictably across the changed area.
- [ ] Enter/OK activates the focused item once.
- [ ] Back exits the current panel, dialog, menu, or player state correctly.
- [ ] Focus cannot disappear into empty/loading/error UI.
- [ ] Dialogs trap or restore focus intentionally.
- [ ] Scrollers and rails keep focused items visible.
- [ ] Pointer mode and 5-way mode both work after switching between them.

## Spotlight Patterns

Use `SpotlightContainerDecorator` when a region needs predictable directional behavior:

```js
const PanelWithFocus = SpotlightContainerDecorator(
	{
		enterTo: 'last-focused',
		leaveFor: {
			left: '[data-nav-default]'
		}
	},
	PanelBase
);
```

Use direct focus only for explicit transitions:

```js
import Spotlight from '@enact/spotlight';

Spotlight.focus('[data-component-id="primary-action"]');
```

If focus depends on newly rendered data, focus using a selector after render rather than a stale element reference.

## WebOS Lifecycle Checklist

Use this checklist for platform, auth, telemetry, networking, or player changes:

- [ ] App handles `visibilitychange`, `pagehide`, foreground/background, and relaunch paths.
- [ ] Telemetry flushes before suspension when data loss matters.
- [ ] WebSocket or subscription state disconnects on logout and background where appropriate.
- [ ] Low-memory handling releases caches or heavy media resources.
- [ ] Network loss and recovery produce UI states that are navigable.
- [ ] Deep links and relaunch params do not duplicate panels unexpectedly.
- [ ] Player teardown stops timers, media elements, service calls, and listeners.

## Packaging Checklist

Use this checklist for release or metadata changes:

- [ ] `package.json` version matches project version source if a version sync check exists.
- [ ] `appinfo.json` app id, version, title, icon, and launch fields are intentional.
- [ ] `webos-meta` contains required webOS metadata and assets.
- [ ] `.arespackageignore` excludes development-only files without excluding runtime assets.
- [ ] Production build succeeds with `npm run pack-p`.
- [ ] IPK creation succeeds with `npm run package` when ares tooling is available.

## Code Review Focus

When reviewing Enact/webOS changes, prioritize:

- Broken Spotlight navigation or focus loss.
- Remote control regressions, especially Back and Enter/OK.
- Lifecycle bugs around suspension, relaunch, auth, networking, and playback.
- Memory leaks from timers, listeners, media objects, WebSockets, or Luna requests.
- Hard-coded user-facing strings bypassing localization.
- Overly mouse-centric UI patterns.
- Build, packaging, or metadata drift that can break webOS deployment.
