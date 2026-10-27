import { describe, it, expect } from "vitest";

import { DEFAULT_CATEGORIES, buildTaxonomy } from "../src/categories.js";
import type { Category } from "../src/categories.js";

describe("DEFAULT_CATEGORIES", () => {
	it("has 7 categories (C1-C7)", () => {
		expect(DEFAULT_CATEGORIES).toHaveLength(7);
	});

	it("has sequential IDs from C1 to C7", () => {
		const ids = DEFAULT_CATEGORIES.map((c) => c.id);
		expect(ids).toEqual(["C1", "C2", "C3", "C4", "C5", "C6", "C7"]);
	});

	it("includes core comment moderation categories", () => {
		const names = DEFAULT_CATEGORIES.map((c) => c.name);
		expect(names).toContain("Spam");
		expect(names).toContain("Toxic Comment");
		expect(names).toContain("Trolling");
		expect(names).toContain("Harassment");
		expect(names).toContain("Hate Speech");
	});

	it("spam and harassment and child safety are blocked", () => {
		const blocked = DEFAULT_CATEGORIES.filter((c) => c.action === "block").map((c) => c.name);
		expect(blocked).toContain("Spam");
		expect(blocked).toContain("Harassment");
		expect(blocked).toContain("Child Safety");
	});

	it("toxic comment and trolling are held for review", () => {
		const held = DEFAULT_CATEGORIES.filter((c) => c.action === "hold").map((c) => c.name);
		expect(held).toContain("Toxic Comment");
		expect(held).toContain("Trolling");
	});

	it("every category has required fields", () => {
		for (const cat of DEFAULT_CATEGORIES) {
			expect(cat.id).toBeTruthy();
			expect(cat.name).toBeTruthy();
			expect(cat.description).toBeTruthy();
			expect(["block", "hold", "ignore"]).toContain(cat.action);
			expect(cat.builtin).toBe(true);
		}
	});
});

describe("buildTaxonomy", () => {
	it("formats categories for Llama Guard prompt", () => {
		const categories: Category[] = [
			{
				id: "S1",
				name: "Violence",
				description: "Content promoting violence",
				action: "block",
				builtin: true,
			},
			{ id: "S2", name: "Spam", description: "Commercial spam", action: "hold", builtin: false },
		];

		const result = buildTaxonomy(categories);

		expect(result).toContain("S1: Violence");
		expect(result).toContain("Content promoting violence");
		expect(result).toContain("S2: Spam");
		expect(result).toContain("Commercial spam");
	});

	it("excludes categories with action 'ignore'", () => {
		const categories: Category[] = [
			{
				id: "S1",
				name: "Violence",
				description: "Content promoting violence",
				action: "block",
				builtin: true,
			},
			{
				id: "S2",
				name: "Off-topic",
				description: "Off-topic comments",
				action: "ignore",
				builtin: false,
			},
		];

		const result = buildTaxonomy(categories);

		expect(result).toContain("S1: Violence");
		expect(result).not.toContain("S2: Off-topic");
	});

	it("returns empty string for empty categories", () => {
		expect(buildTaxonomy([])).toBe("");
	});

	it("returns empty string when all categories are ignored", () => {
		const categories: Category[] = [
			{ id: "S1", name: "Test", description: "Test", action: "ignore", builtin: false },
		];
		expect(buildTaxonomy(categories)).toBe("");
	});
});
