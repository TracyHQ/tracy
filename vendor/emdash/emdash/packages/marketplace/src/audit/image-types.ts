export interface ImageAuditResult {
	verdict: "pass" | "warn" | "fail";
	images: ImageAuditFinding[];
	model: string;
	durationMs: number;
}

export interface ImageAuditFinding {
	filename: string;
	verdict: "pass" | "warn" | "fail";
	category: string;
	description: string;
}

export interface ImageInput {
	filename: string;
	data: ArrayBuffer;
}

export interface ImageAuditor {
	auditImages(images: ImageInput[]): Promise<ImageAuditResult>;
}
