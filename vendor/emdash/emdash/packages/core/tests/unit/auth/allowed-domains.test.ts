import type { AuthAdapter } from "@emdash-cms/auth";
import { Role } from "@emdash-cms/auth";
import { createKyselyAdapter } from "@emdash-cms/auth/adapters/kysely";
import type { Kysely } from "kysely";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { Database } from "../../../src/database/types.js";
import { setupTestDatabase, teardownTestDatabase } from "../../utils/test-db.js";

describe("Allowed Domains Management", () => {
	let db: Kysely<Database>;
	let adapter: AuthAdapter;

	beforeEach(async () => {
		db = await setupTestDatabase();
		adapter = createKyselyAdapter(db);
	});

	afterEach(async () => {
		await teardownTestDatabase(db);
	});

	describe("getAllowedDomains", () => {
		it("should return empty array when no domains exist", async () => {
			const domains = await adapter.getAllowedDomains();
			expect(domains).toEqual([]);
		});

		it("should return all allowed domains", async () => {
			await adapter.createAllowedDomain("acme.com", Role.AUTHOR);
			await adapter.createAllowedDomain("partner.org", Role.CONTRIBUTOR);
			await adapter.createAllowedDomain("editors.net", Role.EDITOR);

			const domains = await adapter.getAllowedDomains();

			expect(domains).toHaveLength(3);
			const domainNames = domains.map((d) => d.domain);
			expect(domainNames).toContain("acme.com");
			expect(domainNames).toContain("partner.org");
			expect(domainNames).toContain("editors.net");
		});

		it("should include both enabled and disabled domains", async () => {
			await adapter.createAllowedDomain("enabled.com", Role.AUTHOR);
			await adapter.createAllowedDomain("disabled.com", Role.AUTHOR);
			await adapter.updateAllowedDomain("disabled.com", false);

			const domains = await adapter.getAllowedDomains();

			expect(domains).toHaveLength(2);
			const enabled = domains.find((d) => d.domain === "enabled.com");
			const disabled = domains.find((d) => d.domain === "disabled.com");

			expect(enabled?.enabled).toBe(true);
			expect(disabled?.enabled).toBe(false);
		});
	});

	describe("getAllowedDomain", () => {
		it("should return null for non-existent domain", async () => {
			const domain = await adapter.getAllowedDomain("nonexistent.com");
			expect(domain).toBeNull();
		});

		it("should return domain with all properties", async () => {
			await adapter.createAllowedDomain("example.com", Role.EDITOR);

			const domain = await adapter.getAllowedDomain("example.com");

			expect(domain).not.toBeNull();
			expect(domain?.domain).toBe("example.com");
			expect(domain?.defaultRole).toBe(Role.EDITOR);
			expect(domain?.enabled).toBe(true);
			expect(domain?.createdAt).toBeInstanceOf(Date);
		});

		it("should be case-insensitive for domain lookup (normalizes to lowercase)", async () => {
			await adapter.createAllowedDomain("example.com", Role.AUTHOR);

			// Lowercase should work
			const lower = await adapter.getAllowedDomain("example.com");
			expect(lower).not.toBeNull();

			// Uppercase should also work (domains are normalized to lowercase)
			const upper = await adapter.getAllowedDomain("EXAMPLE.COM");
			expect(upper).not.toBeNull();
			expect(upper?.domain).toBe("example.com"); // stored as lowercase
		});
	});

	describe("createAllowedDomain", () => {
		it("should create a new allowed domain", async () => {
			const domain = await adapter.createAllowedDomain("newdomain.com", Role.AUTHOR);

			expect(domain.domain).toBe("newdomain.com");
			expect(domain.defaultRole).toBe(Role.AUTHOR);
			expect(domain.enabled).toBe(true);
			expect(domain.createdAt).toBeInstanceOf(Date);
		});

		it("should create domain with specified role", async () => {
			await adapter.createAllowedDomain("subscribers.com", Role.SUBSCRIBER);
			await adapter.createAllowedDomain("contributors.com", Role.CONTRIBUTOR);
			await adapter.createAllowedDomain("authors.com", Role.AUTHOR);
			await adapter.createAllowedDomain("editors.com", Role.EDITOR);
			await adapter.createAllowedDomain("admins.com", Role.ADMIN);

			expect((await adapter.getAllowedDomain("subscribers.com"))?.defaultRole).toBe(
				Role.SUBSCRIBER,
			);
			expect((await adapter.getAllowedDomain("contributors.com"))?.defaultRole).toBe(
				Role.CONTRIBUTOR,
			);
			expect((await adapter.getAllowedDomain("authors.com"))?.defaultRole).toBe(Role.AUTHOR);
			expect((await adapter.getAllowedDomain("editors.com"))?.defaultRole).toBe(Role.EDITOR);
			expect((await adapter.getAllowedDomain("admins.com"))?.defaultRole).toBe(Role.ADMIN);
		});

		it("should throw error for duplicate domain", async () => {
			await adapter.createAllowedDomain("duplicate.com", Role.AUTHOR);

			await expect(adapter.createAllowedDomain("duplicate.com", Role.EDITOR)).rejects.toThrow();
		});

		it("should set enabled to true by default", async () => {
			const domain = await adapter.createAllowedDomain("enabled-default.com", Role.AUTHOR);
			expect(domain.enabled).toBe(true);
		});
	});

	describe("updateAllowedDomain", () => {
		it("should toggle domain enabled status", async () => {
			await adapter.createAllowedDomain("toggle.com", Role.AUTHOR);

			// Disable
			await adapter.updateAllowedDomain("toggle.com", false);
			let domain = await adapter.getAllowedDomain("toggle.com");
			expect(domain?.enabled).toBe(false);

			// Re-enable
			await adapter.updateAllowedDomain("toggle.com", true);
			domain = await adapter.getAllowedDomain("toggle.com");
			expect(domain?.enabled).toBe(true);
		});

		it("should update default role", async () => {
			await adapter.createAllowedDomain("role-change.com", Role.AUTHOR);

			await adapter.updateAllowedDomain("role-change.com", true, Role.EDITOR);

			const domain = await adapter.getAllowedDomain("role-change.com");
			expect(domain?.defaultRole).toBe(Role.EDITOR);
		});

		it("should update both enabled and role at once", async () => {
			await adapter.createAllowedDomain("both.com", Role.AUTHOR);

			await adapter.updateAllowedDomain("both.com", false, Role.CONTRIBUTOR);

			const domain = await adapter.getAllowedDomain("both.com");
			expect(domain?.enabled).toBe(false);
			expect(domain?.defaultRole).toBe(Role.CONTRIBUTOR);
		});

		it("should preserve role when only updating enabled", async () => {
			await adapter.createAllowedDomain("preserve.com", Role.EDITOR);

			await adapter.updateAllowedDomain("preserve.com", false);

			const domain = await adapter.getAllowedDomain("preserve.com");
			expect(domain?.enabled).toBe(false);
			expect(domain?.defaultRole).toBe(Role.EDITOR);
		});

		it("should preserve createdAt when updating", async () => {
			const created = await adapter.createAllowedDomain("timestamp.com", Role.AUTHOR);
			const originalCreatedAt = created.createdAt;

			// Small delay
			await new Promise((resolve) => setTimeout(resolve, 10));

			await adapter.updateAllowedDomain("timestamp.com", false, Role.EDITOR);

			const updated = await adapter.getAllowedDomain("timestamp.com");
			expect(updated?.createdAt.getTime()).toBe(originalCreatedAt.getTime());
		});
	});

	describe("deleteAllowedDomain", () => {
		it("should delete an existing domain", async () => {
			await adapter.createAllowedDomain("todelete.com", Role.AUTHOR);

			await adapter.deleteAllowedDomain("todelete.com");

			const domain = await adapter.getAllowedDomain("todelete.com");
			expect(domain).toBeNull();
		});

		it("should not affect other domains", async () => {
			await adapter.createAllowedDomain("keep.com", Role.AUTHOR);
			await adapter.createAllowedDomain("delete.com", Role.AUTHOR);

			await adapter.deleteAllowedDomain("delete.com");

			const kept = await adapter.getAllowedDomain("keep.com");
			const deleted = await adapter.getAllowedDomain("delete.com");

			expect(kept).not.toBeNull();
			expect(deleted).toBeNull();
		});

		it("should be idempotent (no error on non-existent)", async () => {
			// Deleting non-existent domain should not throw
			await expect(adapter.deleteAllowedDomain("nonexistent.com")).resolves.not.toThrow();
		});
	});

	describe("Domain Management Flow", () => {
		it("should support full CRUD flow", async () => {
			// Create
			const created = await adapter.createAllowedDomain("company.com", Role.AUTHOR);
			expect(created.domain).toBe("company.com");
			expect(created.enabled).toBe(true);

			// Read
			let domain = await adapter.getAllowedDomain("company.com");
			expect(domain?.domain).toBe("company.com");

			// Update - change role
			await adapter.updateAllowedDomain("company.com", true, Role.EDITOR);
			domain = await adapter.getAllowedDomain("company.com");
			expect(domain?.defaultRole).toBe(Role.EDITOR);

			// Update - disable
			await adapter.updateAllowedDomain("company.com", false);
			domain = await adapter.getAllowedDomain("company.com");
			expect(domain?.enabled).toBe(false);

			// List
			const all = await adapter.getAllowedDomains();
			expect(all).toHaveLength(1);

			// Delete
			await adapter.deleteAllowedDomain("company.com");
			domain = await adapter.getAllowedDomain("company.com");
			expect(domain).toBeNull();

			// List after delete
			const afterDelete = await adapter.getAllowedDomains();
			expect(afterDelete).toHaveLength(0);
		});

		it("should handle multiple domains correctly", async () => {
			// Create multiple domains
			await adapter.createAllowedDomain("first.com", Role.SUBSCRIBER);
			await adapter.createAllowedDomain("second.com", Role.CONTRIBUTOR);
			await adapter.createAllowedDomain("third.com", Role.AUTHOR);

			// Verify all exist
			let domains = await adapter.getAllowedDomains();
			expect(domains).toHaveLength(3);

			// Disable one
			await adapter.updateAllowedDomain("second.com", false);

			// Delete another
			await adapter.deleteAllowedDomain("first.com");

			// Verify state
			domains = await adapter.getAllowedDomains();
			expect(domains).toHaveLength(2);

			const second = domains.find((d) => d.domain === "second.com");
			const third = domains.find((d) => d.domain === "third.com");

			expect(second?.enabled).toBe(false);
			expect(third?.enabled).toBe(true);
		});
	});

	describe("Edge Cases", () => {
		it("should handle subdomains correctly", async () => {
			await adapter.createAllowedDomain("sub.domain.com", Role.AUTHOR);

			const domain = await adapter.getAllowedDomain("sub.domain.com");
			expect(domain).not.toBeNull();

			// Parent domain should not match
			const parent = await adapter.getAllowedDomain("domain.com");
			expect(parent).toBeNull();
		});

		it("should handle domains with hyphens", async () => {
			await adapter.createAllowedDomain("my-company.com", Role.AUTHOR);

			const domain = await adapter.getAllowedDomain("my-company.com");
			expect(domain?.domain).toBe("my-company.com");
		});

		it("should handle long domain names", async () => {
			const longDomain = "very-long-subdomain.another-part.yet-another.example.com";
			await adapter.createAllowedDomain(longDomain, Role.AUTHOR);

			const domain = await adapter.getAllowedDomain(longDomain);
			expect(domain?.domain).toBe(longDomain);
		});
	});
});
