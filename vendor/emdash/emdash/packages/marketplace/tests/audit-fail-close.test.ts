import { describe, expect, it } from "vitest";

import { createWorkersAIImageAuditor } from "../src/audit/image-workers-ai.js";
import { createWorkersAIAuditor } from "../src/audit/workers-ai.js";

describe("audit fail-close behavior", () => {
	describe("code auditor parse failures", () => {
		it("returns fail verdict on unparseable response", async () => {
			const ai = { run: async () => ({ response: "not json" }) } as unknown as Ai;
			const auditor = createWorkersAIAuditor(ai);
			const result = await auditor.audit({
				manifest: { id: "test", version: "1.0.0", capabilities: [] },
				backendCode: "export default {}",
			});

			expect(result.verdict).toBe("fail");
			expect(result.riskScore).toBe(100);
			expect(result.findings).toHaveLength(1);
			expect(result.findings[0]!.category).toBe("audit-error");
			expect(result.findings[0]!.severity).toBe("critical");
		});

		it("returns fail verdict on AI exception", async () => {
			const ai = {
				run: async () => {
					throw new Error("AI service unavailable");
				},
			} as unknown as Ai;
			const auditor = createWorkersAIAuditor(ai);
			const result = await auditor.audit({
				manifest: { id: "test", version: "1.0.0", capabilities: [] },
				backendCode: "export default {}",
			});

			expect(result.verdict).toBe("fail");
			expect(result.riskScore).toBe(100);
			expect(result.findings[0]!.category).toBe("audit-error");
			expect(result.findings[0]!.description).toContain("AI service unavailable");
		});

		it("returns fail verdict on invalid schema response", async () => {
			const ai = {
				run: async () => ({
					response: JSON.stringify({ verdict: "invalid", riskScore: "not a number" }),
				}),
			} as unknown as Ai;
			const auditor = createWorkersAIAuditor(ai);
			const result = await auditor.audit({
				manifest: { id: "test", version: "1.0.0", capabilities: [] },
				backendCode: "export default {}",
			});

			expect(result.verdict).toBe("fail");
			expect(result.findings[0]!.category).toBe("audit-error");
		});
	});

	describe("image auditor parse failures", () => {
		const PIXEL_PNG = new Uint8Array([
			137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0,
			0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 8, 215, 99, 0, 0, 0, 2, 0, 1, 226, 33,
			188, 51, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
		]).buffer;

		it("returns fail verdict on unparseable response", async () => {
			const ai = { run: async () => ({ response: "this is fine" }) } as unknown as Ai;
			const auditor = createWorkersAIImageAuditor(ai);
			const result = await auditor.auditImages([{ filename: "icon.png", data: PIXEL_PNG }]);

			expect(result.verdict).toBe("fail");
			expect(result.images[0]!.category).toBe("audit-error");
		});

		it("returns fail verdict on AI exception", async () => {
			const ai = {
				run: async () => {
					throw new Error("Vision model error");
				},
			} as unknown as Ai;
			const auditor = createWorkersAIImageAuditor(ai);
			const result = await auditor.auditImages([{ filename: "icon.png", data: PIXEL_PNG }]);

			expect(result.verdict).toBe("fail");
			expect(result.images[0]!.category).toBe("audit-error");
		});

		it("worst verdict is fail when one image errors and another passes", async () => {
			let callCount = 0;
			const ai = {
				run: async () => {
					callCount++;
					if (callCount === 1) {
						return {
							response: JSON.stringify({
								verdict: "pass",
								category: "appropriate",
								description: "OK",
							}),
						};
					}
					throw new Error("Model error");
				},
			} as unknown as Ai;

			const auditor = createWorkersAIImageAuditor(ai);
			const result = await auditor.auditImages([
				{ filename: "icon.png", data: PIXEL_PNG },
				{ filename: "screenshot.png", data: PIXEL_PNG },
			]);

			expect(result.verdict).toBe("fail");
		});
	});
});
