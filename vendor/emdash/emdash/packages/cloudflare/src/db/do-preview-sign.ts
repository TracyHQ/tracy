/**
 * Preview URL signing utilities.
 *
 * Pure functions using Web Crypto — no Worker or Cloudflare dependencies.
 * Used by the source site to generate signed preview URLs and by the
 * preview service to verify them.
 */

/** Matches a lowercase hex string */
const HEX_PATTERN = /^[0-9a-f]+$/;

/**
 * Compute HMAC-SHA256 over a message and return the hex-encoded signature.
 */
async function hmacSign(message: string, secret: string): Promise<string> {
	const encoder = new TextEncoder();

	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	const buffer = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
	return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate a signed preview URL.
 *
 * The source site calls this to create a link that opens the preview service.
 * The preview service validates the signature and populates the DO from a
 * snapshot of the source site.
 *
 * @param previewBase - Base URL of the preview service (e.g. "https://theme-x.preview.emdashcms.com")
 * @param source - URL of the source site providing the snapshot (e.g. "https://mysite.com")
 * @param secret - Shared HMAC secret (same value configured on both sides)
 * @param ttl - Link validity in seconds (default: 3600 = 1 hour)
 * @returns Fully signed preview URL
 *
 * @example
 * ```ts
 * const url = await signPreviewUrl(
 *   "https://theme-x.preview.emdashcms.com",
 *   "https://mysite.com",
 *   import.meta.env.PREVIEW_SECRET,
 * );
 * // => "https://theme-x.preview.emdashcms.com/?source=https%3A%2F%2Fmysite.com&exp=1709164800&sig=abc123..."
 * ```
 */
export async function signPreviewUrl(
	previewBase: string,
	source: string,
	secret: string,
	ttl = 3600,
): Promise<string> {
	const exp = Math.floor(Date.now() / 1000) + ttl;
	const sig = await hmacSign(`${source}:${exp}`, secret);

	const url = new URL(previewBase);
	url.searchParams.set("source", source);
	url.searchParams.set("exp", String(exp));
	url.searchParams.set("sig", sig);

	return url.toString();
}

/**
 * Verify an HMAC-SHA256 signature on a preview URL.
 *
 * Uses crypto.subtle.verify for constant-time comparison.
 *
 * @returns true if the signature is valid
 */
export async function verifyPreviewSignature(
	source: string,
	exp: number,
	sig: string,
	secret: string,
): Promise<boolean> {
	// Decode hex signature to ArrayBuffer
	if (sig.length !== 64 || !HEX_PATTERN.test(sig)) return false;
	const sigBytes = new Uint8Array(32);
	for (let i = 0; i < 64; i += 2) {
		sigBytes[i / 2] = parseInt(sig.substring(i, i + 2), 16);
	}

	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"],
	);

	return crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(`${source}:${exp}`));
}
