/**
 * Tests for SEC-07: ownership extraction bugs (#12, #13, #14, #16)
 *
 * Verifies that handler response shapes carry authorId correctly
 * and that ownership-related operations work as expected.
 */

import type { Kysely } from "kysely";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
	handleContentCreate,
	handleContentGet,
	handleContentGetIncludingTrashed,
	handleContentDelete,
	handleContentDuplicate,
	handleMediaCreate,
} from "../../../src/api/index.js";
import type { Database } from "../../../src/database/types.js";
import { setupTestDatabaseWithCollections, teardownTestDatabase } from "../../utils/test-db.js";

describe("SEC-07: Ownership extraction", () => {
	let db: Kysely<Database>;

	beforeEach(async () => {
		db = await setupTestDatabaseWithCollections();
	});

	afterEach(async () => {
		await teardownTestDatabase(db);
	});

	describe("#12: handleContentGet returns authorId inside data.item", () => {
		it("should expose authorId at data.item level, not data level", async () => {
			const created = await handleContentCreate(db, "post", {
				data: { title: "Owned Post" },
				authorId: "user_author_123",
			});
			expect(created.success).toBe(true);

			const result = await handleContentGet(db, "post", created.data!.item.id);
			expect(result.success).toBe(true);

			// The route pattern extracts: existing.data.item.authorId
			// If authorId were only on data (wrong), ownership checks would always fail
			const data = result.data as Record<string, unknown>;
			const item = data.item as Record<string, unknown>;

			expect(item.authorId).toBe("user_author_123");
			// data level should NOT have authorId directly
			expect(data.authorId).toBeUndefined();
		});

		it("should expose authorId at data.item level for trashed items", async () => {
			const created = await handleContentCreate(db, "post", {
				data: { title: "Trashed Post" },
				authorId: "user_trash_owner",
			});
			expect(created.success).toBe(true);
			await handleContentDelete(db, "post", created.data!.item.id);

			const result = await handleContentGetIncludingTrashed(db, "post", created.data!.item.id);
			expect(result.success).toBe(true);

			const data = result.data as Record<string, unknown>;
			const item = data.item as Record<string, unknown>;

			expect(item.authorId).toBe("user_trash_owner");
			expect(data.authorId).toBeUndefined();
		});
	});

	describe("#14: handleContentDuplicate uses caller's authorId", () => {
		it("should set the duplicate's authorId to the provided caller ID", async () => {
			const original = await handleContentCreate(db, "post", {
				data: { title: "Original Post" },
				authorId: "original_author",
			});
			expect(original.success).toBe(true);

			// Duplicate as a different user
			const dup = await handleContentDuplicate(db, "post", original.data!.item.id, "caller_user");
			expect(dup.success).toBe(true);
			expect(dup.data?.item.authorId).toBe("caller_user");
		});

		it("should fall back to original authorId when caller ID not provided", async () => {
			const original = await handleContentCreate(db, "post", {
				data: { title: "Fallback Post" },
				authorId: "original_author",
			});
			expect(original.success).toBe(true);

			const dup = await handleContentDuplicate(db, "post", original.data!.item.id);
			expect(dup.success).toBe(true);
			expect(dup.data?.item.authorId).toBe("original_author");
		});
	});

	describe("#16: handleMediaCreate persists authorId", () => {
		it("should store authorId on created media item", async () => {
			const result = await handleMediaCreate(db, {
				filename: "photo.jpg",
				mimeType: "image/jpeg",
				storageKey: "test_key_123.jpg",
				authorId: "media_uploader",
			});
			expect(result.success).toBe(true);
			expect(result.data?.item.authorId).toBe("media_uploader");
		});

		it("should set authorId to null when not provided", async () => {
			const result = await handleMediaCreate(db, {
				filename: "orphan.jpg",
				mimeType: "image/jpeg",
				storageKey: "test_key_orphan.jpg",
			});
			expect(result.success).toBe(true);
			expect(result.data?.item.authorId).toBeNull();
		});
	});
});
