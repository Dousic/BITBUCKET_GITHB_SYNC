#!/usr/bin/env node
/**
 * Dousic — Version-sync check
 *
 * LG Content Store cert WILL reject builds where the IPK filename,
 * appinfo manifest, and submission form do not all agree on a single
 * version string. This script is the gate that prevents that drift.
 *
 * It compares the version declared in three places that must agree:
 *   1. package.json         → drives `$npm_package_version` and the
 *                             IPK filename produced by `ares-package`
 *   2. appinfo.json         → the manifest LG cert reads from the IPK
 *   3. src/version.js       → the runtime constant used by Settings UI
 *                             and telemetry tagging
 *
 * Runs as `npm run preversion-check`, wired into `package` and `deploy`.
 * Fails loudly (exit code 1) if any of the three disagree.
 *
 * Tracks B6 (version drift) from DOUSIC_WEBOS_AUDIT_AND_PATCHES.md.
 */

/* eslint-env node */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readJson(relPath) {
	const full = path.join(ROOT, relPath);
	try {
		return JSON.parse(fs.readFileSync(full, 'utf8'));
	} catch (e) {
		console.error(`[version-sync] could not read ${relPath}: ${e.message}`);
		process.exit(1);
	}
}

function extractRuntimeVersion() {
	const full = path.join(ROOT, 'src', 'version.js');
	let src;
	try {
		src = fs.readFileSync(full, 'utf8');
	} catch (e) {
		console.error(`[version-sync] could not read src/version.js: ${e.message}`);
		process.exit(1);
	}
	const m = src.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
	if (!m) {
		console.error('[version-sync] could not find APP_VERSION = "…" in src/version.js');
		process.exit(1);
	}
	return m[1];
}

const pkg = readJson('package.json');
const appinfo = readJson('appinfo.json');
const runtime = extractRuntimeVersion();

const versions = {
	'package.json':  pkg.version,
	'appinfo.json':  appinfo.version,
	'src/version.js': runtime
};

const unique = new Set(Object.values(versions));

if (unique.size === 1) {
	console.log(`[version-sync] OK — all three sources agree on ${[...unique][0]}`);
	process.exit(0);
}

console.error('[version-sync] FAILED — version drift detected:');
for (const [k, v] of Object.entries(versions)) {
	console.error(`  ${k.padEnd(18)} → ${v}`);
}
console.error('');
console.error('Fix: pick the target version and update all three to match.');
console.error('LG cert WILL reject builds with mismatched versions.');
process.exit(1);
