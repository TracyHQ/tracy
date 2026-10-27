/**
 * Unit tests for _rev token generation and validation.
 */

import { describe, it, expect } from "vitest";

import { encodeRev, decodeRev, validateRev } from "../../../src/api/rev.js";
import type { ContentItem } from "../../../src/database/repositories/types.js";

function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
	return {
		id: "item_1",
		type: "posts",
		slug: "test",
		status: "draft",
		data: {},
		authorId: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-15T12:30:00.000Z",
		publishedAt: null,
		scheduledAt: null,
		liveRevisionId: null,
		draftRevisionId: null,
		version: 3,
		...overrides,
	};
}

describe("encodeRev", () => {
	it("produces a base64-encoded string", () => {
		const item = makeItem();
		const rev = encodeRev(item);

		expect(rev).toBeTruthy();
		// Should be valid base64
		expect(() => atob(rev)).not.toThrow();
	});

	it("encodes version and updatedAt", () => {
		const item = makeItem({ version: 5, updatedAt: "2026-02-14T10:00:00.000Z" });
		const rev = encodeRev(item);
		const decoded = atob(rev);

		expect(decoded).toBe("5:2026-02-14T10:00:00.000Z");
	});

	it("produces different revs for different versions", () => {
		const rev1 = encodeRev(makeItem({ version: 1 }));
		const rev2 = encodeRev(makeItem({ version: 2 }));
		expect(rev1).not.toBe(rev2);
	});

	it("produces different revs for different updatedAt", () => {
		const rev1 = encodeRev(makeItem({ updatedAt: "2026-01-01T00:00:00.000Z" }));
		const rev2 = encodeRev(makeItem({ updatedAt: "2026-01-02T00:00:00.000Z" }));
		expect(rev1).not.toBe(rev2);
	});
});

describe("decodeRev", () => {
	it("decodes a valid rev", () => {
		const rev = btoa("5:2026-02-14T10:00:00.000Z");
		const result = decodeRev(rev);

		expect(result).not.toBeNull();
		expect(result!.version).toBe(5);
		expect(result!.updatedAt).toBe("2026-02-14T10:00:00.000Z");
	});

	it("returns null for invalid base64", () => {
		expect(decodeRev("not-valid-base64!!!")).toBeNull();
	});

	it("returns null for missing colon", () => {
		expect(decodeRev(btoa("nocolon"))).toBeNull();
	});

	it("returns null for non-numeric version", () => {
		expect(decodeRev(btoa("abc:2026-01-01"))).toBeNull();
	});

	it("round-trips with encodeRev", () => {
		const item = makeItem({ version: 7, updatedAt: "2026-03-01T08:15:30.000Z" });
		const rev = encodeRev(item);
		const decoded = decodeRev(rev);

		expect(decoded).not.toBeNull();
		expect(decoded!.version).toBe(7);
		expect(decoded!.updatedAt).toBe("2026-03-01T08:15:30.000Z");
	});
});

describe("validateRev", () => {
	it("returns valid when no rev is provided", () => {
		const result = validateRev(undefined, makeItem());
		expect(result.valid).toBe(true);
	});

	it("returns valid when rev matches", () => {
		const item = makeItem({ version: 3, updatedAt: "2026-01-15T12:30:00.000Z" });
		const rev = encodeRev(item);

		const result = validateRev(rev, item);
		expect(result.valid).toBe(true);
	});

	it("returns invalid when version mismatches", () => {
		const item = makeItem({ version: 3, updatedAt: "2026-01-15T12:30:00.000Z" });
		const staleRev = btoa("2:2026-01-15T12:30:00.000Z"); // Version 2, but item is at 3

		const result = validateRev(staleRev, item);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.message).toContain("modified");
		}
	});

	it("returns invalid when updatedAt mismatches", () => {
		const item = makeItem({ version: 3, updatedAt: "2026-01-15T12:30:00.000Z" });
		const staleRev = btoa("3:2026-01-14T00:00:00.000Z"); // Right version, wrong timestamp

		const result = validateRev(staleRev, item);
		expect(result.valid).toBe(false);
	});

	it("returns invalid for malformed rev", () => {
		const result = validateRev("garbage", makeItem());
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.message).toContain("Malformed");
		}
	});
});
