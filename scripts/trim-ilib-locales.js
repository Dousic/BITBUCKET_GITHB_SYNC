#!/usr/bin/env node
/* eslint-env node */
/**
 * Dousic — postbuild: trim bundled iLib locale data
 *
 * @enact/i18n's ILibPlugin copies the ENTIRE iLib locale tree into
 * dist/node_modules/ilib/locale — 847 language directories, ~79 MB. The
 * app only renders three UI locales (en / es / ko, parity-checked in
 * resources/), so the other ~840 are dead weight that bloats the IPK and
 * slows install on memory-constrained TVs.
 *
 * NOTE: `package.json` → `enact.ilib.locales` is the documented trim knob
 * in some toolchains, but the ILibPlugin shipped with @enact/cli 6.1.x
 * does not honor it (verified: the field is present and the tree still
 * ships whole). So we trim deterministically here instead — independent
 * of Enact internals, idempotent, and safe to re-run.
 *
 * What we keep, and why:
 *   - All files directly under locale/ — shared, locale-independent data
 *     (currency tables, timezone metadata, etc.) that iLib always needs.
 *   - en, es, ko       — the three shipped UI languages (whole subtrees,
 *                        including their region variants like en-US,
 *                        es-419, ko-KR).
 *   - und              — the "undefined"/root fallback iLib resolves to
 *                        when the TV's system locale isn't one we ship.
 *   - zoneinfo         — timezone database (date/time formatting).
 *   - charset/charmaps — character-set detection + mapping tables iLib
 *                        loads during boot; removing them can throw on
 *                        init for some firmware.
 *   - nfc/nfd/nfkd     — Unicode normalization forms used by collation.
 *
 * This mirrors the locale set validated on real LG hardware during the
 * pre-submission shakedown (~33 MB installed, no i18n regressions).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LOCALE_DIR = path.join(ROOT, 'dist', 'node_modules', 'ilib', 'locale');

// Subdirectories to preserve. Everything else under locale/ is removed.
const KEEP_DIRS = new Set([
	'en', 'es', 'ko', 'und',
	'zoneinfo', 'charset', 'charmaps', 'nfc', 'nfd', 'nfkd'
]);

if (!fs.existsSync(LOCALE_DIR)) {
	console.log('[trim-ilib-locales] no dist/node_modules/ilib/locale — nothing to trim (skipping).');
	process.exit(0);
}

const dirSizeBytes = (dir) => {
	let total = 0;
	for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) total += dirSizeBytes(full);
		else {
			try {
				total += fs.statSync(full).size;
			} catch (_) { /* ignore */ }
		}
	}
	return total;
};

const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

const entries = fs.readdirSync(LOCALE_DIR, {withFileTypes: true});
const beforeDirs = entries.filter((e) => e.isDirectory()).length;
const beforeBytes = dirSizeBytes(LOCALE_DIR);

let removed = 0;
for (const entry of entries) {
	if (!entry.isDirectory()) continue;          // keep shared root files
	if (KEEP_DIRS.has(entry.name)) continue;     // keep allowlisted subtrees
	fs.rmSync(path.join(LOCALE_DIR, entry.name), {recursive: true, force: true});
	removed++;
}

const afterDirs = fs.readdirSync(LOCALE_DIR, {withFileTypes: true})
	.filter((e) => e.isDirectory()).length;
const afterBytes = dirSizeBytes(LOCALE_DIR);

console.log(`[trim-ilib-locales] OK — locale dirs ${beforeDirs} → ${afterDirs} (removed ${removed})`);
console.log(`                    size ${mb(beforeBytes)} MB → ${mb(afterBytes)} MB`);
console.log(`                    kept: ${[...KEEP_DIRS].sort().join(', ')} + shared root files`);
process.exit(0);
