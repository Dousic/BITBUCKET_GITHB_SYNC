/**
 * Dousic — App Version (single source of truth)
 *
 * The runtime app version. Every JS reference to the version MUST import
 * APP_VERSION from this file rather than hard-coding a string literal.
 *
 * When bumping the version, three places must be updated together:
 *   1. This file's APP_VERSION constant
 *   2. package.json `version`
 *   3. appinfo.json `version`
 *
 * LG Content Store cert WILL reject builds where the IPK filename,
 * appinfo manifest, and submission form do not all agree on a single
 * version string. Keeping these locked together is the entire fix for
 * B6 (version drift) in DOUSIC_WEBOS_AUDIT_AND_PATCHES.md.
 *
 * The `package` / `deploy` npm scripts derive the IPK filename from
 * package.json's version field at runtime ($npm_package_version), so
 * the filename can never drift from package.json. The check below
 * defensively warns if this file and package.json have drifted at
 * runtime — surfaces during smoke tests, not just at cert time.
 */

const APP_VERSION = '1.1.4';

export default APP_VERSION;
export {APP_VERSION};
