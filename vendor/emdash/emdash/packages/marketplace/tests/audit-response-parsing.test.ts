import { describe, expect, it } from "vitest";

import { createWorkersAIAuditor } from "../src/audit/workers-ai.js";

function mockAi(responseText: string) {
	return {
		run: async () => ({ response: responseText }),
	} as unknown as Ai;
}

const CLEAN_INPUT = {
	manifest: { id: "test", version: "1.0.0", capabilities: [] as string[] },
	backendCode: "export default {}",
};

describe("workers AI auditor response parsing", () => {
	it("parses well-formed JSON", async () => {
		const json = JSON.stringify({
			verdict: "pass",
			riskScore: 5,
			findings: [],
			summary: "Clean plugin",
		});
		const auditor = createWorkersAIAuditor(mockAi(json));
		const result = await auditor.audit(CLEAN_INPUT);
		expect(result.verdict).toBe("pass");
		expect(result.riskScore).toBe(5);
		expect(result.findings).toHaveLength(0);
		expect(result.summary).toBe("Clean plugin");
	});

	it("fails closed on malformed response", async () => {
		const auditor = createWorkersAIAuditor(mockAi("This is not JSON at all"));
		const result = await auditor.audit(CLEAN_INPUT);
		expect(result.verdict).toBe("fail");
		expect(result.riskScore).toBe(100);
		expect(result.findings[0]!.category).toBe("audit-error");
	});

	it("fails closed on invalid schema", async () => {
		const json = JSON.stringify({ verdict: "invalid", riskScore: "not a number" });
		const auditor = createWorkersAIAuditor(mockAi(json));
		const result = await auditor.audit(CLEAN_INPUT);
		expect(result.verdict).toBe("fail");
	});

	it("fails closed on empty response", async () => {
		const auditor = createWorkersAIAuditor(mockAi(""));
		const result = await auditor.audit(CLEAN_INPUT);
		expect(result.verdict).toBe("fail");
	});

	it("includes model name in result", async () => {
		const json = JSON.stringify({
			verdict: "pass",
			riskScore: 0,
			findings: [],
			summary: "Clean",
		});
		const auditor = createWorkersAIAuditor(mockAi(json));
		const result = await auditor.audit(CLEAN_INPUT);
		expect(result.model).toBe("@cf/qwen/qwq-32b");
	});

	it("handles findings with optional location field", async () => {
		const json = JSON.stringify({
			verdict: "warn",
			riskScore: 25,
			findings: [
				{
					severity: "medium",
					title: "Issue",
					description: "Something",
					category: "test",
					location: "line 42",
				},
				{
					severity: "medium",
					title: "Minor",
					description: "Small thing",
					category: "test",
				},
			],
			summary: "Issues",
		});
		const auditor = createWorkersAIAuditor(mockAi(json));
		const result = await auditor.audit(CLEAN_INPUT);
		expect(result.findings).toHaveLength(2);
		expect(result.findings[0]!.location).toBe("line 42");
		expect(result.findings[1]!.location).toBeUndefined();
	});
});
