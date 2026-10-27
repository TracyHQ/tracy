/**
 * Llama Guard Integration
 *
 * Builds prompts for and parses responses from Llama Guard 3 8B via Workers AI.
 */

export interface GuardResult {
	safe: boolean;
	categories: string[];
}

const CATEGORY_SPLIT_PATTERN = /[,\s]+/;

/** Structural markers used by the Llama Guard prompt format */
const STRUCTURAL_MARKERS = /(<\/?(?:BEGIN|END)\s+(?:UNSAFE CONTENT CATEGORIES|CONVERSATION)>)/gi;

/**
 * Sanitize user text to prevent prompt injection via structural markers.
 */
function sanitizeUserText(text: string): string {
	return text.replace(STRUCTURAL_MARKERS, "");
}

/**
 * Build a Llama Guard prompt for classifying a comment.
 */
export function buildGuardPrompt(text: string, taxonomy: string): string {
	const sanitized = sanitizeUserText(text);
	return `Task: Check if there is unsafe content in the 'User' message according to our safety policy with the below categories.

<BEGIN UNSAFE CONTENT CATEGORIES>
${taxonomy}
<END UNSAFE CONTENT CATEGORIES>

<BEGIN CONVERSATION>

User: ${sanitized}

<END CONVERSATION>

Provide your safety assessment for the User message. First line must be 'safe' or 'unsafe'. If unsafe, list the violated categories on the second line separated by commas.`;
}

/**
 * Parse a Llama Guard response into a structured result.
 * Handles both text mode ("safe"/"unsafe\nS1,S6") and structured JSON mode
 * ({ safe, categories }) as returned by Workers AI.
 */
export function parseGuardResponse(output: Ai_Cf_Meta_Llama_Guard_3_8B_Output): GuardResult {
	const resp = output.response;
	// Structured JSON mode — Workers AI returns { safe, categories } directly
	if (typeof resp === "object" && resp !== null) {
		return {
			safe: resp.safe ?? true,
			categories: resp.categories ?? [],
		};
	}

	// Text mode — "safe" or "unsafe\nS1,S6"
	if (typeof resp === "string") {
		const lines = resp.trim().split("\n");
		const firstLine = lines[0]?.trim().toLowerCase();

		if (firstLine === "unsafe" && lines.length > 1) {
			const categoryLine = lines[1]!.trim();
			const categories = categoryLine
				.split(CATEGORY_SPLIT_PATTERN)
				.map((c) => c.trim())
				.filter((c) => c.length > 0);
			return { safe: false, categories };
		}
	}

	// Default: safe (including undefined or unexpected responses)
	return { safe: true, categories: [] };
}

/**
 * Run Llama Guard classification via Workers AI.
 */
export async function runGuard(
	text: string,
	taxonomy: string,
	aiBinding = "AI",
): Promise<GuardResult> {
	const { env } = await import("cloudflare:workers");
	const ai = (env as Record<string, Ai>)[aiBinding];
	if (!ai) {
		throw new Error(`Workers AI binding "${aiBinding}" not found in env`);
	}

	const prompt = buildGuardPrompt(text, taxonomy);
	const output = await ai.run("@cf/meta/llama-guard-3-8b", {
		messages: [{ role: "user", content: prompt }],
		max_tokens: 100,
		temperature: 0.1,
	});

	return parseGuardResponse(output);
}
