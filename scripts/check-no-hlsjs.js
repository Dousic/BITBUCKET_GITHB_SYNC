#!/usr/bin/env node
/* eslint-env node */
/**
 * Dousic — postbuild: guarantee hls.js does not ship in the prod IPK
 *
 * On every supported webOS target (5.0+) the TV plays HLS natively, so
 * `REACT_APP_NATIVE_HLS_ONLY=true` and the ~500 KB hls.js library must
 * not ride along in the IPK.
 *
 * Two things this script gets right that the original did not:
 *
 *  1. It can SEE the flag. The build-time value lives in `.env.production`
 *     (consumed by webpack), not in this Node process's env. The old
 *     script read `process.env.REACT_APP_NATIVE_HLS_ONLY`, found nothing,
 *     and silently skipped — a permanent false pass. We now fall back to
 *     parsing `.env.production`.
 *
 *  2. It can SEE hls.js. The old signatures ('hlsDefaultConfig',
 *     'EVENT_MANIFEST_PARSED', ...) are pre-minification identifiers that
 *     terser mangles away — they never match a real prod bundle. We match
 *     on HLS *playlist tag literals* ('#EXT-X-', 'PATHWAY-ID', ...) which
 *     are spec strings hls.js must preserve and which never appear in app
 *     code.
 *
 * Behaviour when NATIVE_HLS_ONLY=true:
 *   - VideoPlayer.js keeps a dynamic `import('hls.js')` for non-webOS
 *     targets. webpack always emits that as a separate chunk, but with the
 *     flag inlined true the call site is dead-code-eliminated from main.js,
 *     leaving the chunk ORPHANED (never `__webpack_require__.e`'d).
 *   - An orphan chunk is safe but wasteful, so we delete it and report.
 *   - If an hls.js signature appears in main.js itself, or a chunk is
 *     still referenced by main.js, that's a real regression (a static
 *     import crept back in) → hard fail.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const MAIN_JS = path.join(DIST, 'main.js');

// --- Resolve the build flag: process.env first, then .env.production -------
function resolveNativeHlsOnly() {
	if (typeof process.env.REACT_APP_NATIVE_HLS_ONLY === 'string') {
		return process.env.REACT_APP_NATIVE_HLS_ONLY === 'true';
	}
	const envFile = path.join(ROOT, '.env.production');
	if (fs.existsSync(envFile)) {
		const m = fs.readFileSync(envFile, 'utf8')
			.match(/^\s*REACT_APP_NATIVE_HLS_ONLY\s*=\s*(\S+)/m);
		if (m) return m[1].replace(/['"]/g, '') === 'true';
	}
	return false;
}

if (!resolveNativeHlsOnly()) {
	console.log('[check-no-hlsjs] NATIVE_HLS_ONLY is not true — hls.js is allowed. Skipping.');
	process.exit(0);
}

if (!fs.existsSync(DIST)) {
	console.error('[check-no-hlsjs] dist/ does not exist — run the pack step first.');
	process.exit(1);
}

// HLS playlist tag literals — unique to hls.js, survive minification.
const SIGNATURES = ['#EXT-X-', 'PATHWAY-ID', 'STABLE-RENDITION-ID', 'X-ASSET-LIST'];
const looksLikeHls = (src) => SIGNATURES.some((s) => src.includes(s));

const walkJs = (dir, out = []) => {
	for (const name of fs.readdirSync(dir)) {
		const full = path.join(dir, name);
		if (fs.statSync(full).isDirectory()) walkJs(full, out);
		else if (/\.(js|mjs)$/.test(name)) out.push(full);
	}
	return out;
};

const mainSrc = fs.existsSync(MAIN_JS) ? fs.readFileSync(MAIN_JS, 'utf8') : '';

// 1) hls.js bytes in the entry bundle itself = a static import regression.
if (mainSrc && looksLikeHls(mainSrc)) {
	console.error('[check-no-hlsjs] FAIL — hls.js is bundled into main.js.');
	console.error('  A static `import Hls from "hls.js"` likely replaced the dynamic import.');
	console.error('  VideoPlayer.js must import hls.js only via `await import("hls.js")`.');
	process.exit(1);
}

// 2) Inspect chunk files: delete orphans, fail on referenced hls.js chunks.
let removed = 0;
for (const file of walkJs(DIST)) {
	if (file === MAIN_JS) continue;
	const src = fs.readFileSync(file, 'utf8');
	if (!looksLikeHls(src)) continue;

	const chunkId = (path.basename(file).match(/(\d+)/) || [])[1];
	const referenced = chunkId &&
		(mainSrc.includes(`.e(${chunkId})`) || mainSrc.includes(`"${chunkId}"`));

	if (referenced) {
		console.error(`[check-no-hlsjs] FAIL — ${path.relative(DIST, file)} contains hls.js and is still loaded by main.js.`);
		console.error('  The dynamic import was not dead-code-eliminated. Confirm NATIVE_HLS_ONLY=true is inlined.');
		process.exit(1);
	}

	fs.rmSync(file);
	removed++;
	console.log(`[check-no-hlsjs] removed orphan hls.js chunk: ${path.relative(DIST, file)}`);
}

console.log(`[check-no-hlsjs] OK — no hls.js in shipped bundle (${removed} orphan chunk(s) pruned).`);
process.exit(0);
