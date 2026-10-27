/**
 * Preview mode route gating.
 *
 * Pure function — no Worker or Cloudflare dependencies.
 * Extracted so it can be tested without mocking cloudflare:workers.
 */

/**
 * API route prefixes allowed in preview mode (read-only).
 * Everything else under /_emdash/ is blocked.
 */
const ALLOWED_API_PREFIXES = [
	"/_emdash/api/content/",
	"/_emdash/api/schema",
	"/_emdash/api/manifest",
	"/_emdash/api/dashboard",
	"/_emdash/api/search",
	"/_emdash/api/media",
	"/_emdash/api/taxonomies",
	"/_emdash/api/menus",
	"/_emdash/api/snapshot",
];

/**
 * Check whether a request should be blocked in preview mode.
 *
 * Preview is read-only with no authenticated user. All /_emdash/
 * routes are blocked by default (admin UI, auth, setup, write APIs).
 * Only specific read-only API prefixes are allowlisted.
 *
 * Non-emdash routes (site pages, assets) are always allowed.
 */
export function isBlockedInPreview(pathname: string): boolean {
	// Non-emdash routes are always allowed (site pages, assets, etc.)
	if (!pathname.startsWith("/_emdash/")) {
		return false;
	}

	// Check allowlist for API routes
	for (const prefix of ALLOWED_API_PREFIXES) {
		if (pathname === prefix || pathname.startsWith(prefix)) {
			return false;
		}
	}

	// Everything else under /_emdash/ is blocked
	return true;
}
