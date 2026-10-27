import type { Kysely } from "kysely";
import { sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../../../../src/database/connection.js";
import { down, up } from "../../../../src/database/migrations/031_bylines.js";
import type { Database } from "../../../../src/database/types.js";

describe("031_bylines migration", () => {
	let db: Kysely<Database>;

	beforeEach(async () => {
		db = createDatabase({ url: ":memory:" });

		await db.schema
			.createTable("users")
			.addColumn("id", "text", (col) => col.primaryKey())
			.execute();
		await db.schema
			.createTable("media")
			.addColumn("id", "text", (col) => col.primaryKey())
			.execute();

		await db.schema
			.createTable("ec_posts")
			.addColumn("id", "text", (col) => col.primaryKey())
			.execute();
	});

	afterEach(async () => {
		await db.destroy();
	});

	it("adds byline tables and primary_byline_id to existing content tables", async () => {
		await up(db);

		const tables = await db.introspection.getTables();
		const tableNames = tables.map((t) => t.name);
		expect(tableNames).toContain("_emdash_bylines");
		expect(tableNames).toContain("_emdash_content_bylines");

		const contentTable = tables.find((t) => t.name === "ec_posts");
		expect(contentTable).toBeDefined();
		expect(contentTable?.columns.map((c) => c.name)).toContain("primary_byline_id");

		const idx = await sql<{ name: string }>`
			SELECT name
			FROM sqlite_master
			WHERE type = 'index' AND name = 'idx_ec_posts_primary_byline'
		`.execute(db);
		expect(idx.rows).toHaveLength(1);
	});

	it("reverts added tables, indexes, and columns", async () => {
		await up(db);
		await down(db);

		const tables = await db.introspection.getTables();
		const tableNames = tables.map((t) => t.name);
		expect(tableNames).not.toContain("_emdash_bylines");
		expect(tableNames).not.toContain("_emdash_content_bylines");

		const contentTable = tables.find((t) => t.name === "ec_posts");
		expect(contentTable).toBeDefined();
		expect(contentTable?.columns.map((c) => c.name)).not.toContain("primary_byline_id");

		const idx = await sql<{ name: string }>`
			SELECT name
			FROM sqlite_master
			WHERE type = 'index' AND name = 'idx_ec_posts_primary_byline'
		`.execute(db);
		expect(idx.rows).toHaveLength(0);
	});
});
