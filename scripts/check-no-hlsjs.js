#!/usr/bin/env node
/* eslint-env node */
/**
 * Dousic — postbuild assertion
 *
 * Fails the build if hls.js symbols appear in the production dist/ bundle
 * when REACT_APP_NATIVE_HLS_ONLY=true. The ~400KB hls.js library is
 * dynamically imported behind a flag in VideoPlayer.js; this script
 * catches regressions where a refactor accidentally hoists the import
 * back to static.
 *
 * Usage:
 *   node scripts/check-no-hlsjs.js         # run after enact pack -p
 *
 * Add to package.json "scripts":
 *   "pack-p": "enact pack -p && node scripts/check-no-hlsjs.js"
 */

const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const NATIVE_HLS_ONLY = process.env.REACT_APP_NATIVE_HLS_ONLY === 'true';

if (!NATIVE_HLS_ONLY) {
	console.log('[check-no-hlsjs] NATIVE_HLS_ONLY is not true — skipping check.');
	process.exit(0);
}

if (!fs.existsSync(DIST)) {
	console.error('[check-no-hlsjs] dist/ does not exist — run enact pack first.');
	process.exit(1);
}

// Signatures unique to hls.js runtime. These should NEVER appear in a
// prod webOS bundle when NATIVE_HLS_ONLY=true. The dynamic import()
// chunk file itself is still emitted by webpack under some configs —
// we walk recursively and fail on any hit.
const SIGNATURES = [
	'hlsDefaultConfig',        // hls.js internal config object
	'MSE_MP4_H264',            // hls.js quality tier constant
	'EVENT_MANIFEST_PARSED',   // hls.js event name
	'fragLoadEmergencyAborted' // hls.js-only error code
];

const walk = (dir, out = []) => {
	for (const name of fs.readdirSync(dir)) {
		const full = path.join(dir, name);
		const stat = fs.statSync(full);
		if (stat.isDirectory()) walk(full, out);
		else if (/\.(js|mjs)$/.test(name)) out.push(full);
	}
	return out;
};

const jsFiles = walk(DIST);
const hits = [];
for (const f of jsFiles) {
	const src = fs.readFileSync(f, 'utf8');
	for (const sig of SIGNATURES) {
		if (src.includes(sig)) {
			hits.push({file: path.relative(DIST, f), signature: sig});
			break;
		}
	}
}

if (hits.length > 0) {
	console.error('[check-no-hlsjs] FAIL — hls.js appears to be in the prod bundle:');
	for (const h of hits) {
		console.error(`  ${h.file} contains "${h.signature}"`);
	}
	console.error('');
	console.error('  VideoPlayer.js should import hls.js only via dynamic import() behind');
	console.error('  the REACT_APP_NATIVE_HLS_ONLY flag. Check that no new static import');
	console.error('  has been introduced and that the flag is true in the production .env.');
	process.exit(1);
}

console.log(`[check-no-hlsjs] OK — ${jsFiles.length} files scanned, no hls.js symbols present.`);
process.exit(0);
