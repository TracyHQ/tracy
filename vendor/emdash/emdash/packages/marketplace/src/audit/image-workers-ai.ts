import { z } from "zod";

import type {
	ImageAuditFinding,
	ImageAuditResult,
	ImageAuditor,
	ImageInput,
} from "./image-types.js";

const VISION_PROMPT = `You are a content moderator for a plugin marketplace. Analyze this image that was submitted as part of a plugin listing (icon, screenshot, or banner).

Evaluate the image for:
- **nsfw**: Sexually explicit or graphic violent content
- **offensive**: Hate symbols, slurs, discriminatory content
- **misleading**: Fake UI elements, impersonation of system dialogs, deceptive screenshots
- **brand-impersonation**: Unauthorized use of well-known brand logos or trademarks
- **appropriate**: Image is acceptable for a plugin marketplace

Calibration:
- **pass**: Normal plugin imagery — icons, screenshots, diagrams, illustrations
- **warn**: Borderline content that merits human review — suggestive imagery, lookalike branding, potentially misleading UI
- **fail**: Clearly violates policy — explicit content, hate symbols, obvious brand theft`;

const AUDIT_SCHEMA = {
	type: "object",
	properties: {
		verdict: { type: "string", enum: ["pass", "warn", "fail"] },
		category: {
			type: "string",
			enum: ["nsfw", "offensive", "misleading", "brand-impersonation", "appropriate"],
		},
		description: { type: "string" },
	},
	required: ["verdict", "category", "description"],
} as const;

const responseSchema = z.object({
	verdict: z.enum(["pass", "warn", "fail"]),
	category: z.string(),
	description: z.string(),
});

const VERDICT_RANK: Record<ImageAuditResult["verdict"], number> = {
	pass: 0,
	warn: 1,
	fail: 2,
};

function worstVerdict(findings: ImageAuditFinding[]): ImageAuditResult["verdict"] {
	let worst: ImageAuditResult["verdict"] = "pass";
	for (const f of findings) {
		if (VERDICT_RANK[f.verdict] > VERDICT_RANK[worst]) {
			worst = f.verdict;
		}
	}
	return worst;
}

function toDataUri(data: ArrayBuffer): string {
	const bytes = new Uint8Array(data);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]!);
	}
	return `data:image/png;base64,${btoa(binary)}`;
}

const MODEL_ID = "@cf/meta/llama-4-scout-17b-16e-instruct" as const;

async function auditSingleImage(ai: Ai, image: ImageInput): Promise<ImageAuditFinding> {
	try {
		const result = await ai.run(MODEL_ID, {
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: VISION_PROMPT },
						{
							type: "image_url",
							image_url: { url: toDataUri(image.data) },
						},
					],
				},
			],
			// guided_json: AUDIT_SCHEMA,
			response_format: { type: "json_schema", json_schema: AUDIT_SCHEMA },
			temperature: 0.1,
			max_tokens: 500,
		});
		console.log(result);
		let response: z.infer<typeof responseSchema> | string = result.response;
		if (typeof response === "string") {
			response = JSON.parse(response);
		}
		const parsed = responseSchema.parse(response);

		return {
			filename: image.filename,
			verdict: parsed.verdict,
			category: parsed.category,
			description: parsed.description,
		};
	} catch (err) {
		console.error(`Error auditing image ${image.filename}:`, String(err));
		// Fail-closed: an audit that couldn't complete must not produce a
		// passing result.  Returning "fail" ensures block-mode enforcement
		// rejects the version rather than silently publishing it.
		return {
			filename: image.filename,
			verdict: "fail",
			category: "audit-error",
			description: "Image audit failed to complete — manual review required",
		};
	}
}

export function createWorkersAIImageAuditor(ai: Ai): ImageAuditor {
	return {
		async auditImages(images: ImageInput[]): Promise<ImageAuditResult> {
			const start = Date.now();

			if (images.length === 0) {
				return {
					verdict: "pass",
					images: [],
					model: MODEL_ID,
					durationMs: Date.now() - start,
				};
			}

			const findings = await Promise.all(images.map((img) => auditSingleImage(ai, img)));

			return {
				verdict: worstVerdict(findings),
				images: findings,
				model: MODEL_ID,
				durationMs: Date.now() - start,
			};
		},
	};
}
