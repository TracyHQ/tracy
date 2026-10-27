import { describe, expect, it } from "vitest";

import { getRequestContext, runWithContext } from "../../src/request-context.js";

describe("request context", () => {
	it("returns undefined outside any context", () => {
		expect(getRequestContext()).toBeUndefined();
	});

	it("returns context inside runWithContext", () => {
		const ctx = { editMode: true };
		runWithContext(ctx, () => {
			expect(getRequestContext()).toBe(ctx);
		});
	});

	it("returns undefined after runWithContext completes", () => {
		runWithContext({ editMode: true }, () => {});
		expect(getRequestContext()).toBeUndefined();
	});

	it("propagates through async boundaries", async () => {
		const ctx = { editMode: true, preview: { collection: "posts", id: "1" } };
		await runWithContext(ctx, async () => {
			await new Promise((resolve) => setTimeout(resolve, 1));
			expect(getRequestContext()).toBe(ctx);
		});
	});

	it("isolates concurrent contexts", async () => {
		const results: boolean[] = [];
		await Promise.all([
			runWithContext({ editMode: true }, async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				results.push(getRequestContext()!.editMode);
			}),
			runWithContext({ editMode: false }, async () => {
				await new Promise((resolve) => setTimeout(resolve, 5));
				results.push(getRequestContext()!.editMode);
			}),
		]);
		// Second resolves first (5ms < 10ms), so false appears before true
		expect(results).toContain(true);
		expect(results).toContain(false);
		expect(results).toHaveLength(2);
	});

	it("includes preview info when set", () => {
		const ctx = {
			editMode: false,
			preview: { collection: "posts", id: "abc-123" },
		};
		runWithContext(ctx, () => {
			const result = getRequestContext();
			expect(result?.preview).toEqual({ collection: "posts", id: "abc-123" });
			expect(result?.editMode).toBe(false);
		});
	});

	it("includes db override when set", () => {
		const fakeDb = { isKysely: true } as never;
		const ctx = {
			editMode: false,
			db: fakeDb,
		};
		runWithContext(ctx, () => {
			const result = getRequestContext();
			expect(result?.db).toBe(fakeDb);
		});
	});

	it("db override is undefined when not set", () => {
		const ctx = { editMode: false };
		runWithContext(ctx, () => {
			const result = getRequestContext();
			expect(result?.db).toBeUndefined();
		});
	});
});
