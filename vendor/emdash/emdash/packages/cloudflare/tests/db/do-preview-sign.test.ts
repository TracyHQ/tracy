import { describe, it, expect } from "vitest";

import { signPreviewUrl, verifyPreviewSignature } from "../../src/db/do-preview-sign.js";

const SECRET = "test-secret-key";
const DIGITS = /^\d+$/;
const HEX_64 = /^[0-9a-f]{64}$/;

describe("signPreviewUrl", () => {
	it("returns a URL with source, exp, and sig params", async () => {
		const url = await signPreviewUrl("https://preview.example.com", "https://mysite.com", SECRET);
		const parsed = new URL(url);

		expect(parsed.origin).toBe("https://preview.example.com");
		expect(parsed.searchParams.get("source")).toBe("https://mysite.com");
		expect(parsed.searchParams.get("exp")).toMatch(DIGITS);
		expect(parsed.searchParams.get("sig")).toMatch(HEX_64);
	});

	it("sets expiry based on ttl", async () => {
		const before = Math.floor(Date.now() / 1000);
		const url = await signPreviewUrl(
			"https://preview.example.com",
			"https://mysite.com",
			SECRET,
			7200,
		);
		const after = Math.floor(Date.now() / 1000);

		const exp = Number(new URL(url).searchParams.get("exp"));
		expect(exp).toBeGreaterThanOrEqual(before + 7200);
		expect(exp).toBeLessThanOrEqual(after + 7200);
	});

	it("defaults to 1 hour TTL", async () => {
		const before = Math.floor(Date.now() / 1000);
		const url = await signPreviewUrl("https://preview.example.com", "https://mysite.com", SECRET);
		const exp = Number(new URL(url).searchParams.get("exp"));
		expect(exp).toBeGreaterThanOrEqual(before + 3600);
	});
});

describe("verifyPreviewSignature", () => {
	it("verifies a signature produced by signPreviewUrl", async () => {
		const url = await signPreviewUrl("https://preview.example.com", "https://mysite.com", SECRET);
		const parsed = new URL(url);
		const source = parsed.searchParams.get("source")!;
		const exp = Number(parsed.searchParams.get("exp"));
		const sig = parsed.searchParams.get("sig")!;

		expect(await verifyPreviewSignature(source, exp, sig, SECRET)).toBe(true);
	});

	it("rejects a wrong secret", async () => {
		const url = await signPreviewUrl("https://preview.example.com", "https://mysite.com", SECRET);
		const parsed = new URL(url);
		const source = parsed.searchParams.get("source")!;
		const exp = Number(parsed.searchParams.get("exp"));
		const sig = parsed.searchParams.get("sig")!;

		expect(await verifyPreviewSignature(source, exp, sig, "wrong-secret")).toBe(false);
	});

	it("rejects a tampered source", async () => {
		const url = await signPreviewUrl("https://preview.example.com", "https://mysite.com", SECRET);
		const parsed = new URL(url);
		const exp = Number(parsed.searchParams.get("exp"));
		const sig = parsed.searchParams.get("sig")!;

		expect(await verifyPreviewSignature("https://evil.com", exp, sig, SECRET)).toBe(false);
	});

	it("rejects a tampered expiry", async () => {
		const url = await signPreviewUrl("https://preview.example.com", "https://mysite.com", SECRET);
		const parsed = new URL(url);
		const source = parsed.searchParams.get("source")!;
		const sig = parsed.searchParams.get("sig")!;

		expect(await verifyPreviewSignature(source, 9999999999, sig, SECRET)).toBe(false);
	});

	it("rejects a tampered signature", async () => {
		const url = await signPreviewUrl("https://preview.example.com", "https://mysite.com", SECRET);
		const parsed = new URL(url);
		const source = parsed.searchParams.get("source")!;
		const exp = Number(parsed.searchParams.get("exp"));

		expect(await verifyPreviewSignature(source, exp, "a".repeat(64), SECRET)).toBe(false);
	});

	it("rejects a signature with wrong length", async () => {
		expect(await verifyPreviewSignature("https://x.com", 123, "tooshort", SECRET)).toBe(false);
	});
});
