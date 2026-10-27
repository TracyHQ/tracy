import { describe, expect, it } from "vitest";

import { resolveVersionStatus } from "../src/env.js";

describe("resolveVersionStatus", () => {
	describe("enforcement: none", () => {
		it("always returns published regardless of verdicts", () => {
			expect(resolveVersionStatus("none", "pass", "pass")).toBe("published");
			expect(resolveVersionStatus("none", "fail", "fail")).toBe("published");
			expect(resolveVersionStatus("none", "warn", "warn")).toBe("published");
			expect(resolveVersionStatus("none", null, null)).toBe("published");
		});
	});

	describe("enforcement: flag", () => {
		it("returns published when both pass", () => {
			expect(resolveVersionStatus("flag", "pass", "pass")).toBe("published");
		});

		it("returns published when code passes and no image audit", () => {
			expect(resolveVersionStatus("flag", "pass", null)).toBe("published");
		});

		it("returns flagged when code verdict is warn", () => {
			expect(resolveVersionStatus("flag", "warn", "pass")).toBe("flagged");
		});

		it("returns flagged when code verdict is fail", () => {
			expect(resolveVersionStatus("flag", "fail", "pass")).toBe("flagged");
		});

		it("returns flagged when image verdict is warn", () => {
			expect(resolveVersionStatus("flag", "pass", "warn")).toBe("flagged");
		});

		it("returns flagged when image verdict is fail", () => {
			expect(resolveVersionStatus("flag", "pass", "fail")).toBe("flagged");
		});

		it("returns flagged when both warn", () => {
			expect(resolveVersionStatus("flag", "warn", "warn")).toBe("flagged");
		});

		it("returns flagged when both fail", () => {
			expect(resolveVersionStatus("flag", "fail", "fail")).toBe("flagged");
		});
	});

	describe("enforcement: block", () => {
		it("returns published when both pass", () => {
			expect(resolveVersionStatus("block", "pass", "pass")).toBe("published");
		});

		it("returns published when code passes and no image audit", () => {
			expect(resolveVersionStatus("block", "pass", null)).toBe("published");
		});

		it("returns flagged when code warns (warn is not auto-published)", () => {
			expect(resolveVersionStatus("block", "warn", "pass")).toBe("flagged");
		});

		it("returns rejected when code fails", () => {
			expect(resolveVersionStatus("block", "fail", "pass")).toBe("rejected");
		});

		it("returns rejected when image fails", () => {
			expect(resolveVersionStatus("block", "pass", "fail")).toBe("rejected");
		});

		it("returns rejected when both fail", () => {
			expect(resolveVersionStatus("block", "fail", "fail")).toBe("rejected");
		});

		it("returns flagged when both warn (warn is not auto-published)", () => {
			expect(resolveVersionStatus("block", "warn", "warn")).toBe("flagged");
		});

		it("returns rejected when code fails and image warns", () => {
			expect(resolveVersionStatus("block", "fail", "warn")).toBe("rejected");
		});

		it("returns flagged when image warns", () => {
			expect(resolveVersionStatus("block", "pass", "warn")).toBe("flagged");
		});

		it("returns rejected when code warns and image fails", () => {
			expect(resolveVersionStatus("block", "warn", "fail")).toBe("rejected");
		});
	});

	describe("null verdicts (no audit ran)", () => {
		it("treats null code verdict as pass under flag", () => {
			expect(resolveVersionStatus("flag", null, "pass")).toBe("published");
		});

		it("treats null image verdict as pass under flag", () => {
			expect(resolveVersionStatus("flag", "pass", null)).toBe("published");
		});

		it("treats both null as pass under block", () => {
			expect(resolveVersionStatus("block", null, null)).toBe("published");
		});

		it("treats null code as pass but image fail still rejects under block", () => {
			expect(resolveVersionStatus("block", null, "fail")).toBe("rejected");
		});

		it("treats null code as pass but image warn still flags under block", () => {
			expect(resolveVersionStatus("block", null, "warn")).toBe("flagged");
		});
	});
});
