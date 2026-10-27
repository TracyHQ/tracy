import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	buildCommentNotificationEmail,
	lookupContentAuthor,
	sendCommentNotification,
} from "../../../src/comments/notifications.js";
import type { Database } from "../../../src/database/types.js";
import type { EmailPipeline } from "../../../src/plugins/email.js";
import { setupTestDatabaseWithCollections, teardownTestDatabase } from "../../utils/test-db.js";

describe("Comment Notifications", () => {
	describe("buildCommentNotificationEmail", () => {
		it("builds email with content title", () => {
			const email = buildCommentNotificationEmail("author@example.com", {
				commentAuthorName: "Jane",
				commentBody: "Great post!",
				contentTitle: "My Blog Post",
				collection: "post",
				adminBaseUrl: "https://example.com/_emdash",
			});

			expect(email.to).toBe("author@example.com");
			expect(email.subject).toBe('New comment on "My Blog Post"');
			expect(email.text).toContain("Jane");
			expect(email.text).toContain("Great post!");
			expect(email.text).toContain("/_emdash/admin/comments");
			expect(email.html).toContain("Jane");
			expect(email.html).toContain("Great post!");
		});

		it("falls back to collection name when no title", () => {
			const email = buildCommentNotificationEmail("author@example.com", {
				commentAuthorName: "Jane",
				commentBody: "Nice!",
				contentTitle: "",
				collection: "post",
				adminBaseUrl: "https://example.com/_emdash",
			});

			expect(email.subject).toBe('New comment on "post item"');
		});

		it("truncates long comment bodies", () => {
			const longBody = "x".repeat(600);
			const email = buildCommentNotificationEmail("author@example.com", {
				commentAuthorName: "Jane",
				commentBody: longBody,
				contentTitle: "Post",
				collection: "post",
				adminBaseUrl: "https://example.com/_emdash",
			});

			expect(email.text).toContain("...");
			expect(email.text).not.toContain("x".repeat(600));
		});

		it("escapes HTML in author name and body", () => {
			const email = buildCommentNotificationEmail("author@example.com", {
				commentAuthorName: '<script>alert("xss")</script>',
				commentBody: "<img src=x onerror=alert(1)>",
				contentTitle: "Post",
				collection: "post",
				adminBaseUrl: "https://example.com/_emdash",
			});

			expect(email.html).not.toContain("<script>");
			expect(email.html).not.toContain("<img src=x");
			expect(email.html).toContain("&lt;script&gt;");
		});

		it("strips CRLF from subject to prevent header injection", () => {
			const email = buildCommentNotificationEmail("author@example.com", {
				commentAuthorName: "Jane",
				commentBody: "Nice!",
				contentTitle: "Post\r\nBcc: attacker@evil.com",
				collection: "post",
				adminBaseUrl: "https://example.com/_emdash",
			});

			expect(email.subject).not.toContain("\r");
			expect(email.subject).not.toContain("\n");
			expect(email.subject).toContain("Post");
		});
	});

	describe("sendCommentNotification", () => {
		let mockEmail: EmailPipeline;
		let sendSpy: ReturnType<typeof vi.fn>;

		beforeEach(() => {
			sendSpy = vi.fn().mockResolvedValue(undefined);
			mockEmail = {
				send: sendSpy,
				isAvailable: () => true,
			} as unknown as EmailPipeline;
		});

		it("sends notification for approved comments", async () => {
			const sent = await sendCommentNotification({
				email: mockEmail,
				comment: {
					authorName: "Jane",
					authorEmail: "jane@example.com",
					body: "Great post!",
					status: "approved",
					collection: "post",
				},
				contentTitle: "My Post",
				contentAuthor: { email: "author@example.com", name: "Author" },
				adminBaseUrl: "https://example.com/_emdash",
			});

			expect(sent).toBe(true);
			expect(sendSpy).toHaveBeenCalledOnce();
			const [message, source] = sendSpy.mock.calls[0]!;
			expect(message.to).toBe("author@example.com");
			expect(message.subject).toContain("My Post");
			expect(source).toBe("emdash-comments");
		});

		it("skips pending comments", async () => {
			const sent = await sendCommentNotification({
				email: mockEmail,
				comment: {
					authorName: "Jane",
					authorEmail: "jane@example.com",
					body: "Great post!",
					status: "pending",
					collection: "post",
				},
				contentAuthor: { email: "author@example.com", name: "Author" },
				adminBaseUrl: "https://example.com/_emdash",
			});

			expect(sent).toBe(false);
			expect(sendSpy).not.toHaveBeenCalled();
		});

		it("skips when no content author", async () => {
			const sent = await sendCommentNotification({
				email: mockEmail,
				comment: {
					authorName: "Jane",
					authorEmail: "jane@example.com",
					body: "Great post!",
					status: "approved",
					collection: "post",
				},
				contentAuthor: undefined,
				adminBaseUrl: "https://example.com/_emdash",
			});

			expect(sent).toBe(false);
			expect(sendSpy).not.toHaveBeenCalled();
		});

		it("skips when email provider not available", async () => {
			mockEmail = {
				send: sendSpy,
				isAvailable: () => false,
			} as unknown as EmailPipeline;

			const sent = await sendCommentNotification({
				email: mockEmail,
				comment: {
					authorName: "Jane",
					authorEmail: "jane@example.com",
					body: "Great post!",
					status: "approved",
					collection: "post",
				},
				contentAuthor: { email: "author@example.com", name: "Author" },
				adminBaseUrl: "https://example.com/_emdash",
			});

			expect(sent).toBe(false);
			expect(sendSpy).not.toHaveBeenCalled();
		});

		it("skips when commenter is the content author", async () => {
			const sent = await sendCommentNotification({
				email: mockEmail,
				comment: {
					authorName: "Author",
					authorEmail: "author@example.com",
					body: "My own comment",
					status: "approved",
					collection: "post",
				},
				contentAuthor: { email: "author@example.com", name: "Author" },
				adminBaseUrl: "https://example.com/_emdash",
			});

			expect(sent).toBe(false);
			expect(sendSpy).not.toHaveBeenCalled();
		});

		it("compares emails case-insensitively for self-comment check", async () => {
			const sent = await sendCommentNotification({
				email: mockEmail,
				comment: {
					authorName: "Author",
					authorEmail: "Author@Example.COM",
					body: "My own comment",
					status: "approved",
					collection: "post",
				},
				contentAuthor: { email: "author@example.com", name: "Author" },
				adminBaseUrl: "https://example.com/_emdash",
			});

			expect(sent).toBe(false);
			expect(sendSpy).not.toHaveBeenCalled();
		});
	});

	describe("lookupContentAuthor", () => {
		let db: Kysely<Database>;

		beforeEach(async () => {
			db = await setupTestDatabaseWithCollections();
		});

		afterEach(async () => {
			await teardownTestDatabase(db);
		});

		it("returns null for non-existent content", async () => {
			const result = await lookupContentAuthor(db, "post", "nonexistent");
			expect(result).toBeNull();
		});

		it("returns slug and author for content with author", async () => {
			await db
				.insertInto("users")
				.values({
					id: "user1",
					email: "author@example.com",
					name: "Author Name",
					role: 50,
					email_verified: 1,
				})
				.execute();

			await db
				.insertInto("ec_post" as never)
				.values({
					id: "post1",
					slug: "my-post",
					status: "published",
					author_id: "user1",
				} as never)
				.execute();

			const result = await lookupContentAuthor(db, "post", "post1");
			expect(result).not.toBeNull();
			expect(result!.slug).toBe("my-post");
			expect(result!.author).toEqual({
				id: "user1",
				email: "author@example.com",
				name: "Author Name",
			});
		});

		it("excludes author with unverified email", async () => {
			await db
				.insertInto("users")
				.values({
					id: "unverified1",
					email: "unverified@example.com",
					name: "Unverified",
					role: 50,
					email_verified: 0,
				})
				.execute();

			await db
				.insertInto("ec_post" as never)
				.values({
					id: "post3",
					slug: "unverified-post",
					status: "published",
					author_id: "unverified1",
				} as never)
				.execute();

			const result = await lookupContentAuthor(db, "post", "post3");
			expect(result).not.toBeNull();
			expect(result!.slug).toBe("unverified-post");
			expect(result!.author).toBeUndefined();
		});

		it("rejects invalid collection names", async () => {
			await expect(lookupContentAuthor(db, "'; DROP TABLE users; --", "post1")).rejects.toThrow(
				"collection",
			);
		});

		it("returns slug without author for content without author_id", async () => {
			await db
				.insertInto("ec_post" as never)
				.values({
					id: "post2",
					slug: "orphan-post",
					status: "published",
					author_id: null,
				} as never)
				.execute();

			const result = await lookupContentAuthor(db, "post", "post2");
			expect(result).not.toBeNull();
			expect(result!.slug).toBe("orphan-post");
			expect(result!.author).toBeUndefined();
		});
	});
});
