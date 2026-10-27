import { describe, expect, it } from "vitest";

import type { ImageInput } from "../src/audit/image-types.js";
import { createWorkersAIImageAuditor } from "../src/audit/image-workers-ai.js";

// Minimal 1x1 transparent PNG
const PIXEL_PNG = new Uint8Array([
	137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0,
	0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 8, 215, 99, 0, 0, 0, 2, 0, 1, 226, 33, 188, 51,
	0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]).buffer;

function img(filename: string): ImageInput {
	return { filename, data: PIXEL_PNG };
}

function mockAi(responseText: string) {
	return {
		run: async () => ({ response: responseText }),
	} as unknown as Ai;
}

describe("workers AI image auditor response parsing", () => {
	it("parses well-formed JSON", async () => {
		const json = JSON.stringify({
			verdict: "pass",
			category: "appropriate",
			description: "Normal plugin icon",
		});
		const auditor = createWorkersAIImageAuditor(mockAi(json));
		const result = await auditor.auditImages([img("icon.png")]);
		expect(result.verdict).toBe("pass");
		expect(result.images).toHaveLength(1);
		expect(result.images[0]!.category).toBe("appropriate");
	});

	it("fails closed on malformed response", async () => {
		const auditor = createWorkersAIImageAuditor(mockAi("This image looks fine to me"));
		const result = await auditor.auditImages([img("icon.png")]);
		expect(result.verdict).toBe("fail");
		expect(result.images[0]!.category).toBe("audit-error");
	});

	it("fails closed on invalid schema", async () => {
		const json = JSON.stringify({ verdict: "unknown", category: 123 });
		const auditor = createWorkersAIImageAuditor(mockAi(json));
		const result = await auditor.auditImages([img("icon.png")]);
		expect(result.verdict).toBe("fail");
		expect(result.images[0]!.category).toBe("audit-error");
	});

	it("fails closed on empty response", async () => {
		const auditor = createWorkersAIImageAuditor(mockAi(""));
		const result = await auditor.auditImages([img("icon.png")]);
		expect(result.verdict).toBe("fail");
	});

	it("handles multiple images independently", async () => {
		let callCount = 0;
		const responses = [
			JSON.stringify({ verdict: "pass", category: "appropriate", description: "OK" }),
			JSON.stringify({ verdict: "fail", category: "nsfw", description: "Explicit content" }),
		];
		const ai = {
			run: async () => {
				const response = responses[callCount % responses.length]!;
				callCount++;
				return { response };
			},
		} as unknown as Ai;

		const auditor = createWorkersAIImageAuditor(ai);
		const result = await auditor.auditImages([img("icon.png"), img("screenshot.png")]);

		expect(result.verdict).toBe("fail"); // worst of pass + fail
		expect(result.images).toHaveLength(2);
	});

	it("returns pass for empty image list", async () => {
		const auditor = createWorkersAIImageAuditor(mockAi(""));
		const result = await auditor.auditImages([]);
		expect(result.verdict).toBe("pass");
		expect(result.images).toHaveLength(0);
	});

	it("includes model name in result", async () => {
		const json = JSON.stringify({
			verdict: "pass",
			category: "appropriate",
			description: "OK",
		});
		const auditor = createWorkersAIImageAuditor(mockAi(json));
		const result = await auditor.auditImages([img("icon.png")]);
		expect(result.model).toBe("@cf/meta/llama-4-scout-17b-16e-instruct");
	});
});
