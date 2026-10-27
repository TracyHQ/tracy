import type { CollectionCommentSettings } from "emdash";
import { describe, it, expect } from "vitest";

import type { Category } from "../src/categories.js";
import { computeDecision } from "../src/decision.js";
import type { GuardResult } from "../src/guard.js";

const defaultCategories: Category[] = [
	{ id: "S1", name: "Violence", description: "Violence", action: "block", builtin: true },
	{ id: "S2", name: "Fraud", description: "Fraud", action: "hold", builtin: true },
	{ id: "S6", name: "Advice", description: "Advice", action: "ignore", builtin: true },
];

const defaultCollectionSettings: CollectionCommentSettings = {
	commentsEnabled: true,
	commentsModeration: "all",
	commentsClosedAfterDays: 90,
	commentsAutoApproveUsers: true,
};

const defaultSettings = { autoApproveClean: true };

describe("computeDecision", () => {
	it("auto-approves authenticated CMS users", () => {
		const result = computeDecision(
			undefined,
			undefined,
			defaultCategories,
			defaultSettings,
			defaultCollectionSettings,
			0,
			true,
		);
		expect(result.status).toBe("approved");
		expect(result.reason).toContain("CMS user");
	});

	it("blocks when AI detects a 'block' category", () => {
		const guard: GuardResult = { safe: false, categories: ["S1"] };
		const result = computeDecision(
			guard,
			undefined,
			defaultCategories,
			defaultSettings,
			defaultCollectionSettings,
			0,
			false,
		);
		expect(result.status).toBe("spam");
		expect(result.reason).toContain("S1");
	});

	it("holds when AI detects a 'hold' category", () => {
		const guard: GuardResult = { safe: false, categories: ["S2"] };
		const result = computeDecision(
			guard,
			undefined,
			defaultCategories,
			defaultSettings,
			defaultCollectionSettings,
			0,
			false,
		);
		expect(result.status).toBe("pending");
		expect(result.reason).toContain("S2");
	});

	it("ignores categories with action 'ignore'", () => {
		const guard: GuardResult = { safe: false, categories: ["S6"] };
		const result = computeDecision(
			guard,
			undefined,
			defaultCategories,
			defaultSettings,
			defaultCollectionSettings,
			0,
			false,
		);
		// Should not block or hold — falls through to autoApproveClean
		expect(result.status).toBe("approved");
	});

	it("block takes precedence over hold when both flagged", () => {
		const guard: GuardResult = { safe: false, categories: ["S1", "S2"] };
		const result = computeDecision(
			guard,
			undefined,
			defaultCategories,
			defaultSettings,
			defaultCollectionSettings,
			0,
			false,
		);
		expect(result.status).toBe("spam");
	});

	it("holds on AI error (fail-safe)", () => {
		const result = computeDecision(
			undefined,
			"AI service unavailable",
			defaultCategories,
			defaultSettings,
			defaultCollectionSettings,
			0,
			false,
		);
		expect(result.status).toBe("pending");
		expect(result.reason).toContain("AI error");
	});

	it("approves clean comments when autoApproveClean is true", () => {
		const guard: GuardResult = { safe: true, categories: [] };
		const result = computeDecision(
			guard,
			undefined,
			defaultCategories,
			{ autoApproveClean: true },
			defaultCollectionSettings,
			0,
			false,
		);
		expect(result.status).toBe("approved");
		expect(result.reason).toContain("clean");
	});

	it("falls back to collection settings when autoApproveClean is false", () => {
		const guard: GuardResult = { safe: true, categories: [] };
		const result = computeDecision(
			guard,
			undefined,
			defaultCategories,
			{ autoApproveClean: false },
			{ ...defaultCollectionSettings, commentsModeration: "all" },
			0,
			false,
		);
		expect(result.status).toBe("pending");
	});

	it("respects collection moderation 'none' as fallback", () => {
		const guard: GuardResult = { safe: true, categories: [] };
		const result = computeDecision(
			guard,
			undefined,
			defaultCategories,
			{ autoApproveClean: false },
			{ ...defaultCollectionSettings, commentsModeration: "none" },
			0,
			false,
		);
		expect(result.status).toBe("approved");
	});

	it("respects 'first_time' moderation with returning commenter", () => {
		const guard: GuardResult = { safe: true, categories: [] };
		const result = computeDecision(
			guard,
			undefined,
			defaultCategories,
			{ autoApproveClean: false },
			{ ...defaultCollectionSettings, commentsModeration: "first_time" },
			3,
			false,
		);
		expect(result.status).toBe("approved");
	});

	it("holds first-time commenters under 'first_time' moderation", () => {
		const guard: GuardResult = { safe: true, categories: [] };
		const result = computeDecision(
			guard,
			undefined,
			defaultCategories,
			{ autoApproveClean: false },
			{ ...defaultCollectionSettings, commentsModeration: "first_time" },
			0,
			false,
		);
		expect(result.status).toBe("pending");
	});

	it("holds when AI returns unknown category ID (fail-safe)", () => {
		const guard: GuardResult = { safe: false, categories: ["S99"] };
		const result = computeDecision(
			guard,
			undefined,
			defaultCategories,
			defaultSettings,
			defaultCollectionSettings,
			0,
			false,
		);
		expect(result.status).toBe("pending");
		expect(result.reason).toContain("S99");
	});

	it("holds when AI returns mix of unknown and ignore categories", () => {
		const guard: GuardResult = { safe: false, categories: ["S6", "S99"] };
		const result = computeDecision(
			guard,
			undefined,
			defaultCategories,
			defaultSettings,
			defaultCollectionSettings,
			0,
			false,
		);
		expect(result.status).toBe("pending");
		expect(result.reason).toContain("S99");
	});

	it("handles missing guard (no AI)", () => {
		const result = computeDecision(
			undefined,
			undefined,
			defaultCategories,
			{ autoApproveClean: false },
			{ ...defaultCollectionSettings, commentsModeration: "none" },
			0,
			false,
		);
		expect(result.status).toBe("approved");
	});
});
