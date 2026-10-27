/**
 * Tests for importing WordPress reusable blocks as sections
 */

import type { Kysely } from "kysely";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { WxrPost } from "../../../src/cli/wxr/parser.js";
import type { Database } from "../../../src/database/types.js";
import { importReusableBlocksAsSections } from "../../../src/import/sections.js";
import { setupTestDatabase, teardownTestDatabase } from "../../utils/test-db.js";

describe("importReusableBlocksAsSections", () => {
	let db: Kysely<Database>;

	beforeEach(async () => {
		db = await setupTestDatabase();
	});

	afterEach(async () => {
		await teardownTestDatabase(db);
	});

	it("should import wp_block posts as sections", async () => {
		const posts: WxrPost[] = [
			{
				id: 100,
				title: "Newsletter CTA",
				postName: "newsletter-cta",
				postType: "wp_block",
				status: "publish",
				content: `<!-- wp:heading {"level":3} -->
<h3>Subscribe to Our Newsletter</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Get the latest updates.</p>
<!-- /wp:paragraph -->`,
				categories: [],
				tags: [],
				meta: new Map(),
			},
			{
				id: 101,
				title: "Hero Banner",
				postName: "hero-banner",
				postType: "wp_block",
				status: "publish",
				content: `<!-- wp:heading -->
<h2>Welcome</h2>
<!-- /wp:heading -->`,
				categories: [],
				tags: [],
				meta: new Map(),
			},
			// Regular post - should be ignored
			{
				id: 1,
				title: "Regular Post",
				postName: "regular-post",
				postType: "post",
				status: "publish",
				content: "<p>Hello</p>",
				categories: [],
				tags: [],
				meta: new Map(),
			},
		];

		const result = await importReusableBlocksAsSections(posts, db);

		expect(result.sectionsCreated).toBe(2);
		expect(result.sectionsSkipped).toBe(0);
		expect(result.errors).toHaveLength(0);

		// Verify sections were created
		const sections = await db.selectFrom("_emdash_sections").selectAll().execute();

		expect(sections).toHaveLength(2);

		const newsletter = sections.find((s) => s.slug === "newsletter-cta");
		expect(newsletter).toBeDefined();
		expect(newsletter?.title).toBe("Newsletter CTA");
		expect(newsletter?.source).toBe("import");

		const hero = sections.find((s) => s.slug === "hero-banner");
		expect(hero).toBeDefined();
		expect(hero?.title).toBe("Hero Banner");
	});

	it("should skip existing sections by slug", async () => {
		// Create existing section
		await db
			.insertInto("_emdash_sections")
			.values({
				id: "existing-1",
				slug: "newsletter-cta",
				title: "Existing Newsletter",
				description: null,
				keywords: null,
				content: "[]",
				preview_media_id: null,
				source: "user",
				theme_id: null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.execute();

		const posts: WxrPost[] = [
			{
				id: 100,
				title: "Newsletter CTA",
				postName: "newsletter-cta",
				postType: "wp_block",
				status: "publish",
				content: "<p>New content</p>",
				categories: [],
				tags: [],
				meta: new Map(),
			},
			{
				id: 101,
				title: "New Block",
				postName: "new-block",
				postType: "wp_block",
				status: "publish",
				content: "<p>New</p>",
				categories: [],
				tags: [],
				meta: new Map(),
			},
		];

		const result = await importReusableBlocksAsSections(posts, db);

		expect(result.sectionsCreated).toBe(1);
		expect(result.sectionsSkipped).toBe(1);

		// Original title should be preserved
		const existing = await db
			.selectFrom("_emdash_sections")
			.selectAll()
			.where("slug", "=", "newsletter-cta")
			.executeTakeFirst();

		expect(existing?.title).toBe("Existing Newsletter");
	});

	it("should return empty result when no wp_block posts", async () => {
		const posts: WxrPost[] = [
			{
				id: 1,
				title: "Regular Post",
				postName: "regular-post",
				postType: "post",
				status: "publish",
				content: "<p>Hello</p>",
				categories: [],
				tags: [],
				meta: new Map(),
			},
		];

		const result = await importReusableBlocksAsSections(posts, db);

		expect(result.sectionsCreated).toBe(0);
		expect(result.sectionsSkipped).toBe(0);
		expect(result.errors).toHaveLength(0);
	});

	it("should convert Gutenberg content to Portable Text", async () => {
		const posts: WxrPost[] = [
			{
				id: 100,
				title: "Test Block",
				postName: "test-block",
				postType: "wp_block",
				status: "publish",
				content: `<!-- wp:paragraph -->
<p>Hello <strong>world</strong>!</p>
<!-- /wp:paragraph -->`,
				categories: [],
				tags: [],
				meta: new Map(),
			},
		];

		await importReusableBlocksAsSections(posts, db);

		const section = await db
			.selectFrom("_emdash_sections")
			.selectAll()
			.where("slug", "=", "test-block")
			.executeTakeFirst();

		const content = JSON.parse(section?.content ?? "[]");

		expect(content).toBeInstanceOf(Array);
		expect(content.length).toBeGreaterThan(0);
		expect(content[0]._type).toBe("block");
	});

	it("should generate slug from title if postName is missing", async () => {
		const posts: WxrPost[] = [
			{
				id: 100,
				title: "My Custom Block Title",
				postName: undefined as unknown as string,
				postType: "wp_block",
				status: "publish",
				content: "<p>Test</p>",
				categories: [],
				tags: [],
				meta: new Map(),
			},
		];

		await importReusableBlocksAsSections(posts, db);

		const section = await db.selectFrom("_emdash_sections").selectAll().executeTakeFirst();

		expect(section?.slug).toBe("my-custom-block-title");
	});
});
