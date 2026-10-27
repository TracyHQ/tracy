/**
 * Integration test for the full preview snapshot auth flow.
 *
 * Tests the complete chain that would have caught bug #3:
 * signPreviewUrl → middleware builds header → snapshot endpoint parses and verifies
 *
 * The signing side (signPreviewUrl) lives in @emdash-cms/cloudflare, but we
 * inline the same HMAC logic here to test the format contract without
 * cross-package imports.
 */

import { sql } from "kysely";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	generateSnapshot,
	parsePreviewSignatureHeader,
	verifyPreviewSignature,
} from "../../../src/api/handlers/snapshot.js";
import type { Database } from "../../../src/database/types.js";
import { setupTestDatabaseWithCollections } from "../../utils/test-db.js";

const SECRET = "test-preview-secret";

/**
 * Sign a preview URL using the same HMAC-SHA256 logic as
 * @emdash-cms/cloudflare signPreviewUrl(). Inlined here so we test
 * the format contract without cross-package deps.
 */
async function signPreview(
	source: string,
	ttl = 3600,
): Promise<{ source: string; exp: number; sig: string }> {
	const exp = Math.floor(Date.now() / 1000) + ttl;
	const encoder = new TextEncoder();

	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(SECRET),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	const buffer = await crypto.subtle.sign("HMAC", key, encoder.encode(`${source}:${exp}`));
	const sig = Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");

	return { source, exp, sig };
}

/**
 * Build the X-Preview-Signature header value the same way the
 * preview middleware does: "source:exp:sig"
 */
function buildSignatureHeader(parts: { source: string; exp: number; sig: string }): string {
	return `${parts.source}:${parts.exp}:${parts.sig}`;
}

describe("preview snapshot auth flow", () => {
	let db: Kysely<Database>;

	beforeEach(async () => {
		db = await setupTestDatabaseWithCollections();
	});

	afterEach(async () => {
		await db.destroy();
	});

	it("end-to-end: signed preview URL → header → snapshot access", async () => {
		// 1. Insert some content so snapshot has data
		await sql`
			INSERT INTO ec_post (id, slug, status, title, content, created_at, updated_at, version)
			VALUES ('p1', 'test-post', 'published', 'Test', 'Body', datetime('now'), datetime('now'), 1)
		`.execute(db);

		// 2. Sign a preview URL (same logic as @emdash-cms/cloudflare signPreviewUrl)
		const signed = await signPreview("https://mysite.com");

		// 3. Build the header the way the preview middleware does
		const headerValue = buildSignatureHeader(signed);

		// 4. Parse the header the way the snapshot endpoint does
		const parsed = parsePreviewSignatureHeader(headerValue);
		expect(parsed).not.toBeNull();
		expect(parsed!.source).toBe("https://mysite.com");
		expect(parsed!.exp).toBe(signed.exp);
		expect(parsed!.sig).toBe(signed.sig);

		// 5. Verify the signature the way the snapshot endpoint does
		const valid = await verifyPreviewSignature(parsed!.source, parsed!.exp, parsed!.sig, SECRET);
		expect(valid).toBe(true);

		// 6. Actually generate the snapshot (proves auth would grant access)
		const snapshot = await generateSnapshot(db);
		expect(snapshot.tables.ec_post).toHaveLength(1);
		expect(snapshot.tables.ec_post[0]!.slug).toBe("test-post");
	});

	it("rejects tampered signature", async () => {
		const signed = await signPreview("https://mysite.com");
		const headerValue = buildSignatureHeader(signed);

		const parsed = parsePreviewSignatureHeader(headerValue);
		expect(parsed).not.toBeNull();

		// Tamper with the signature
		const valid = await verifyPreviewSignature(parsed!.source, parsed!.exp, "a".repeat(64), SECRET);
		expect(valid).toBe(false);
	});

	it("rejects wrong secret", async () => {
		const signed = await signPreview("https://mysite.com");
		const headerValue = buildSignatureHeader(signed);

		const parsed = parsePreviewSignatureHeader(headerValue);
		expect(parsed).not.toBeNull();

		const valid = await verifyPreviewSignature(
			parsed!.source,
			parsed!.exp,
			parsed!.sig,
			"wrong-secret",
		);
		expect(valid).toBe(false);
	});

	it("rejects expired signature", async () => {
		// Sign with TTL of -1 (already expired)
		const signed = await signPreview("https://mysite.com", -1);
		const headerValue = buildSignatureHeader(signed);

		const parsed = parsePreviewSignatureHeader(headerValue);
		expect(parsed).not.toBeNull();

		const valid = await verifyPreviewSignature(parsed!.source, parsed!.exp, parsed!.sig, SECRET);
		expect(valid).toBe(false);
	});
});

describe("parsePreviewSignatureHeader", () => {
	it("parses source URLs with colons correctly", async () => {
		const signed = await signPreview("https://mysite.com:8080");
		const header = buildSignatureHeader(signed);

		const parsed = parsePreviewSignatureHeader(header);
		expect(parsed).not.toBeNull();
		expect(parsed!.source).toBe("https://mysite.com:8080");
		expect(parsed!.exp).toBe(signed.exp);
		expect(parsed!.sig).toBe(signed.sig);
	});

	it("rejects empty string", () => {
		expect(parsePreviewSignatureHeader("")).toBeNull();
	});

	it("rejects header with no colons", () => {
		expect(parsePreviewSignatureHeader("noseparators")).toBeNull();
	});

	it("rejects header with sig wrong length", () => {
		expect(parsePreviewSignatureHeader("https://x.com:12345:tooshort")).toBeNull();
	});

	it("rejects header with non-numeric exp", () => {
		expect(parsePreviewSignatureHeader(`https://x.com:notanumber:${"a".repeat(64)}`)).toBeNull();
	});
});
