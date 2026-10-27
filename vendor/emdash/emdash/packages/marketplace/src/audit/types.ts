export interface AuditResult {
	verdict: "pass" | "warn" | "fail";
	riskScore: number;
	findings: AuditFinding[];
	summary: string;
	model: string;
	durationMs: number;
}

export interface AuditFinding {
	severity: "critical" | "high" | "medium" | "low" | "info";
	title: string;
	description: string;
	category: string;
	location?: string;
}

export interface AuditInput {
	manifest: {
		id: string;
		version: string;
		capabilities: string[];
		allowedHosts?: string[];
		admin?: { settingsSchema?: Record<string, unknown> };
		[key: string]: unknown;
	};
	backendCode: string;
	adminCode?: string;
}

export interface Auditor {
	audit(input: AuditInput): Promise<AuditResult>;
}
