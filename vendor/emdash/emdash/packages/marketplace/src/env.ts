import type { VersionStatus } from "./db/types.js";

export type AuditEnforcement = "none" | "flag" | "block";

export function getAuditEnforcement(env: Env): AuditEnforcement {
	const val = env.AUDIT_ENFORCEMENT;
	if (val === "none" || val === "flag" || val === "block") return val;
	return "flag";
}

/**
 * Map (enforcement, codeVerdict, imageVerdict) → version status.
 *
 * Rules:
 *   none  → always "published"
 *   flag  → pass = "published", warn/fail = "flagged"
 *   block → pass = "published", warn = "flagged", fail = "rejected"
 *
 * In block mode, only an explicit "pass" from both auditors results in
 * auto-publishing.  A "warn" verdict (including from audit errors, which
 * now return "fail") requires human review.  This prevents fail-open
 * bypasses where a crafted input causes the auditor to error.
 */
export function resolveVersionStatus(
	enforcement: AuditEnforcement,
	codeVerdict: string | null,
	imageVerdict: string | null,
): VersionStatus {
	if (enforcement === "none") return "published";

	// Normalize: treat null/undefined as "pass" (no audit ran)
	const code = codeVerdict ?? "pass";
	const image = imageVerdict ?? "pass";

	if (enforcement === "flag") {
		if (code === "pass" && image === "pass") return "published";
		return "flagged";
	}

	// enforcement === "block"
	if (code === "fail" || image === "fail") return "rejected";
	if (code === "warn" || image === "warn") return "flagged";
	return "published";
}
