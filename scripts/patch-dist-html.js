#!/usr/bin/env node
/* eslint-env node */
/**
 * Dousic — postbuild step: patch dist/index.html
 *
 * Enact CLI 6.x has, in practice, been observed shipping its DEFAULT
 * `index.html` template into dist/ even when the project-root `index.html`
 * is present and `.enactrc` declares `template: "./index.html"`. The IPK
 * then ships without:
 *   - the `<meta http-equiv="Content-Security-Policy" ...>` tag
 *   - the inline `#dousic-splash` <style>+<div> block
 *   - the TV viewport meta (`width=1920`)
 *
 * Every CSP / splash / TV-viewport claim in BUILD_GUIDE.md depends on
 * those landing in dist/index.html. This script is the belt-and-suspenders
 * fix for audit finding B2: it merges the source `index.html` with the
 * `<script>` / `<link>` tags that webpack auto-injects, producing the
 * intended artifact regardless of whether Enact CLI honored `.enactrc`.
 *
 * Algorithm:
 *   1. Read source ./index.html — has CSP, splash, TV viewport. Has NO
 *      script/link to main.js/main.css (those are webpack's job).
 *   2. Read ./dist/index.html — has <script src="main.js"> and
 *      <link href="main.css"> from HtmlWebpackPlugin.
 *   3. Extract script/link tags from (2).
 *   4. Inject the link tag before </head> and the script tag before
 *      </body> in (1), and write the merged file back to dist/index.html.
 *
 * The script is idempotent — running it twice produces the same output.
 *
 * Verification:
 *   grep -c 'Content-Security-Policy' dist/index.html  # expect 1
 *   grep -c 'dousic-splash' dist/index.html            # expect 1
 *   grep 'main.js' dist/index.html                     # expect script tag
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_TEMPLATE = path.join(ROOT, 'index.html');
const DIST_HTML = path.join(ROOT, 'dist', 'index.html');

if (!fs.existsSync(DIST_HTML)) {
	console.error('[patch-dist-html] dist/index.html does not exist — run `enact pack -p` first.');
	process.exit(1);
}
if (!fs.existsSync(SRC_TEMPLATE)) {
	console.error('[patch-dist-html] ./index.html does not exist in project root.');
	process.exit(1);
}

const distHtml = fs.readFileSync(DIST_HTML, 'utf8');
const srcHtml = fs.readFileSync(SRC_TEMPLATE, 'utf8');

// Idempotent check: if dist already has our CSP, we already patched it.
if (distHtml.includes('Content-Security-Policy') && distHtml.includes('dousic-splash')) {
	console.log('[patch-dist-html] dist/index.html already has CSP + splash. Skipping.');
	process.exit(0);
}

// Capture ALL <link rel="stylesheet" href="*.css"> and ALL
// <script src="*.js"> tags from dist. Enact CLI 6.x currently emits a
// single main.css + main.js pair, but webpack splitChunks can produce
// runtime.js / vendor.js / main.js etc. — and dynamic imports like
// hls.js can be reified as named chunks if config changes. Capturing
// only the first tag would silently ship a broken IPK in those cases.
const linkRegex = /<link[^>]*href="[^"]*\.css"[^>]*\/?>/g;
const scriptRegex = /<script[^>]*src="[^"]*\.js"[^>]*><\/script>/g;
const linkTags = distHtml.match(linkRegex) || [];
const scriptTags = distHtml.match(scriptRegex) || [];

if (linkTags.length === 0 || scriptTags.length === 0) {
	console.error('[patch-dist-html] Could not locate <link rel=stylesheet> and/or <script src=...> in dist/index.html.');
	console.error('  Refusing to patch — the dist HTML structure differs from what this script expects.');
	console.error('  Inspect dist/index.html manually and update this script.');
	process.exit(1);
}

let merged = srcHtml;

// Inject all link tags before </head> and all script tags before </body>.
if (!/<\/head>/i.test(merged) || !/<\/body>/i.test(merged)) {
	console.error('[patch-dist-html] Source index.html is missing </head> or </body>.');
	process.exit(1);
}

const linkBlock = linkTags.map((t) => `    ${t}`).join('\n');
const scriptBlock = scriptTags.map((t) => `    ${t}`).join('\n');

merged = merged.replace(/<\/head>/i, `${linkBlock}\n  </head>`);
merged = merged.replace(/<\/body>/i, `${scriptBlock}\n  </body>`);

fs.writeFileSync(DIST_HTML, merged);

console.log('[patch-dist-html] OK — dist/index.html now contains CSP, splash, and asset tags.');
console.log(`                  ${linkTags.length} link tag(s):`);
linkTags.forEach((t) => console.log(`                    ${t}`));
console.log(`                  ${scriptTags.length} script tag(s):`);
scriptTags.forEach((t) => console.log(`                    ${t}`));
console.log(`                  size: ${merged.length} bytes`);
process.exit(0);
