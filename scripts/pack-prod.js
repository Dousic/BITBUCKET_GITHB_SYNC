#!/usr/bin/env node
/* eslint-env node */
/**
 * Dousic — production pack wrapper
 *
 * Why this exists
 * ---------------
 * `@enact/cli` injects `REACT_APP_*` variables into the bundle with
 * webpack's EnvironmentPlugin, but only for keys already present in
 * `process.env` when the webpack config is evaluated. Those keys are
 * populated by Enact's dotenv loader, which chooses the env file from:
 *
 *     mode = process.env.NODE_ENV || 'development'
 *     → .env.<mode>.local, .env.local, .env.<mode>, .env
 *
 * The `enact pack -p` flag turns on webpack's *production optimizer*, but
 * it does NOT export `NODE_ENV=production` before that dotenv read. With
 * no `.env.development` in the repo, `mode` falls back to `development`,
 * NOTHING is loaded, and every `process.env.REACT_APP_* || '<fallback>'`
 * in source resolves to its DEV fallback at runtime:
 *
 *     REACT_APP_WS_KEY   → 'dousic_local_key'   (dev Reverb key)
 *     REACT_APP_WS_HOST  → 'localhost'          (dev socket host)
 *     REACT_APP_NATIVE_HLS_ONLY (unset) → falsy → hls.js gets bundled
 *
 * That is the actual cause of the "dev config leaked into prod" symptom
 * from the LG shakedown — not a stray `.env.development`.
 *
 * The fix: export NODE_ENV=production BEFORE invoking the Enact CLI so the
 * dotenv loader reads `.env.production`. We spawn the CLI in a child
 * process with that environment, cross-platform (handles enact vs
 * enact.cmd on Windows, where Rick builds).
 */

const path = require('path');
const {spawnSync} = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';
const enactBin = path.join(ROOT, 'node_modules', '.bin', isWindows ? 'enact.cmd' : 'enact');

console.log('[pack-prod] NODE_ENV=production enact pack -p');

const result = spawnSync(enactBin, ['pack', '-p'], {
	cwd: ROOT,
	stdio: 'inherit',
	shell: isWindows, // .cmd shims require a shell on Windows
	env: {...process.env, NODE_ENV: 'production'}
});

if (result.error) {
	console.error(`[pack-prod] failed to launch enact: ${result.error.message}`);
	process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
