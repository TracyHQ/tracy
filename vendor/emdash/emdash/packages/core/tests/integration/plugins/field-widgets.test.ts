/**
 * Integration tests for field widget manifest pipeline.
 *
 * Tests that field widgets declared on collections flow through
 * the manifest builder correctly, including the widget property
 * and select options for select/multiSelect fields.
 */

import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "../../../src/database/types.js";
import { SchemaRegistry } from "../../../src/schema/registry.js";
import { setupTestDatabase } from "../../utils/test-db.js";

let db: Kysely<Database>;

beforeEach(async () => {
	db = await setupTestDatabase();
});

afterEach(async () => {
	await db.destroy();
});

describe("field widget on schema fields", () => {
	it("should store and retrieve widget property on a field", async () => {
		const registry = new SchemaRegistry(db);
		await registry.createCollection({
			slug: "posts",
			label: "Posts",
			labelSingular: "Post",
		});

		await registry.createField("posts", {
			slug: "theme_color",
			label: "Theme Color",
			type: "string",
			widget: "color:picker",
		});

		const collection = await registry.getCollectionWithFields("posts");
		expect(collection).toBeTruthy();

		const colorField = collection!.fields.find((f) => f.slug === "theme_color");
		expect(colorField).toBeTruthy();
		expect(colorField!.widget).toBe("color:picker");
		expect(colorField!.type).toBe("string");
	});

	it("should store and retrieve widget on a json field", async () => {
		const registry = new SchemaRegistry(db);
		await registry.createCollection({
			slug: "posts",
			label: "Posts",
			labelSingular: "Post",
		});

		await registry.createField("posts", {
			slug: "pricing",
			label: "Pricing",
			type: "json",
			widget: "x402:pricing",
		});

		const collection = await registry.getCollectionWithFields("posts");
		const pricingField = collection!.fields.find((f) => f.slug === "pricing");
		expect(pricingField).toBeTruthy();
		expect(pricingField!.widget).toBe("x402:pricing");
		expect(pricingField!.type).toBe("json");
	});

	it("should return undefined widget when not set", async () => {
		const registry = new SchemaRegistry(db);
		await registry.createCollection({
			slug: "posts",
			label: "Posts",
			labelSingular: "Post",
		});

		await registry.createField("posts", {
			slug: "title",
			label: "Title",
			type: "string",
		});

		const collection = await registry.getCollectionWithFields("posts");
		const titleField = collection!.fields.find((f) => f.slug === "title");
		expect(titleField).toBeTruthy();
		expect(titleField!.widget).toBeUndefined();
	});

	it("should update widget on an existing field", async () => {
		const registry = new SchemaRegistry(db);
		await registry.createCollection({
			slug: "posts",
			label: "Posts",
			labelSingular: "Post",
		});

		await registry.createField("posts", {
			slug: "color",
			label: "Color",
			type: "string",
		});

		// Update to add widget
		await registry.updateField("posts", "color", {
			widget: "color:picker",
		});

		const collection = await registry.getCollectionWithFields("posts");
		const colorField = collection!.fields.find((f) => f.slug === "color");
		expect(colorField!.widget).toBe("color:picker");
	});

	it("should include select options from validation in manifest format", async () => {
		const registry = new SchemaRegistry(db);
		await registry.createCollection({
			slug: "posts",
			label: "Posts",
			labelSingular: "Post",
		});

		await registry.createField("posts", {
			slug: "priority",
			label: "Priority",
			type: "select",
			validation: {
				options: ["low", "medium", "high"],
			},
		});

		const collection = await registry.getCollectionWithFields("posts");
		const priorityField = collection!.fields.find((f) => f.slug === "priority");
		expect(priorityField).toBeTruthy();
		expect(priorityField!.type).toBe("select");
		expect(priorityField!.validation?.options).toEqual(["low", "medium", "high"]);
	});
});

describe("field widget content CRUD", () => {
	it("should save and retrieve content with a widget field value", async () => {
		const registry = new SchemaRegistry(db);
		await registry.createCollection({
			slug: "posts",
			label: "Posts",
			labelSingular: "Post",
		});

		await registry.createField("posts", {
			slug: "title",
			label: "Title",
			type: "string",
		});

		await registry.createField("posts", {
			slug: "theme_color",
			label: "Theme Color",
			type: "string",
			widget: "color:picker",
		});

		// Insert content with the widget field value
		const { ulid } = await import("ulidx");
		const id = ulid();
		await db
			.insertInto("ec_posts" as never)
			.values({
				id,
				slug: "test-post",
				status: "draft",
				title: "Test Post",
				theme_color: "#ff6600",
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				version: 1,
			} as never)
			.execute();

		// Read it back
		const row = await db
			.selectFrom("ec_posts" as never)
			.selectAll()
			.where("id" as never, "=", id)
			.executeTakeFirst();

		expect(row).toBeTruthy();
		expect((row as Record<string, unknown>).theme_color).toBe("#ff6600");
	});

	it("should save and retrieve json widget field value", async () => {
		const registry = new SchemaRegistry(db);
		await registry.createCollection({
			slug: "posts",
			label: "Posts",
			labelSingular: "Post",
		});

		await registry.createField("posts", {
			slug: "pricing",
			label: "Pricing",
			type: "json",
			widget: "x402:pricing",
		});

		const { ulid } = await import("ulidx");
		const id = ulid();
		const pricingValue = JSON.stringify({ enabled: true, price: "$0.10", gateMode: "bots" });

		await db
			.insertInto("ec_posts" as never)
			.values({
				id,
				slug: "premium-post",
				status: "draft",
				pricing: pricingValue,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				version: 1,
			} as never)
			.execute();

		const row = await db
			.selectFrom("ec_posts" as never)
			.selectAll()
			.where("id" as never, "=", id)
			.executeTakeFirst();

		expect(row).toBeTruthy();
		const pricing = JSON.parse((row as Record<string, unknown>).pricing as string);
		expect(pricing.enabled).toBe(true);
		expect(pricing.price).toBe("$0.10");
		expect(pricing.gateMode).toBe("bots");
	});
});
