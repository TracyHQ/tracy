/**
 * URL scheme validation for the converter pipeline (defense-in-depth).
 *
 * This mirrors the canonical sanitizeHref in packages/core/src/utils/url.ts.
 * The converter is a standalone zero-dependency package, so it carries its own
 * copy. The render layer in core is the primary defense; this is secondary.
 */

const SAFE_URL_SCHEME_RE = /^(https?:|mailto:|tel:|\/(?!\/)|#)/i;

/**
 * Returns the URL unchanged if it uses a safe scheme, otherwise returns "".
 *
 * Returns empty string (not "#") because this is the converter layer — we
 * strip bad URLs rather than substituting anchors. The render layer handles
 * the fallback to "#".
 */
export function sanitizeHref(url: string | undefined | null): string {
	if (!url) return "";
	return SAFE_URL_SCHEME_RE.test(url) ? url : "";
}
