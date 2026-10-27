/**
 * AI Moderation Categories
 *
 * Defines the content taxonomy used by Llama Guard for comment classification.
 * Categories map to actions (block, hold, ignore) that feed into the moderation decision.
 */

export interface Category {
	/** Short identifier (e.g. "C1") */
	id: string;
	/** Human-readable name */
	name: string;
	/** Description of what this category covers */
	description: string;
	/** Action to take when this category is triggered */
	action: "block" | "hold" | "ignore";
	/** Whether this is a built-in category (cannot be deleted) */
	builtin: boolean;
}

/**
 * Default categories tuned for comment moderation.
 *
 * Covers the most common problems a comment moderator faces: spam, toxicity,
 * trolling, harassment, and hate speech. Child safety is retained as a
 * hard block since it applies universally.
 */
export const DEFAULT_CATEGORIES: Category[] = [
	{
		id: "C1",
		name: "Spam",
		description:
			"Unsolicited commercial messages, repetitive posts, or comments that exist solely to promote a product, service, or link with no genuine contribution to the discussion",
		action: "block",
		builtin: true,
	},
	{
		id: "C2",
		name: "Toxic Comment",
		description:
			"Rude, disrespectful, or hostile language intended to upset or demean others, including insults, profanity directed at people, and gratuitously offensive content",
		action: "hold",
		builtin: true,
	},
	{
		id: "C3",
		name: "Trolling",
		description:
			"Comments designed to provoke arguments or emotional reactions rather than contribute to discussion — including deliberate bad-faith arguments, inflammatory bait, and intentional disruption",
		action: "hold",
		builtin: true,
	},
	{
		id: "C4",
		name: "Harassment",
		description:
			"Targeted abuse, threats, or intimidation directed at a specific person or group, including doxxing, personal attacks, and coordinated pile-ons",
		action: "block",
		builtin: true,
	},
	{
		id: "C5",
		name: "Hate Speech",
		description:
			"Content attacking individuals or groups based on protected characteristics such as race, religion, gender, sexual orientation, or disability",
		action: "block",
		builtin: true,
	},
	{
		id: "C6",
		name: "Misinformation",
		description:
			"Demonstrably false claims, conspiracy theories, or fabricated facts presented as true — especially on health, safety, or electoral topics",
		action: "hold",
		builtin: true,
	},
	{
		id: "C7",
		name: "Child Safety",
		description: "Any content that sexualizes minors or could facilitate harm to children",
		action: "block",
		builtin: true,
	},
];

/**
 * Build a Llama Guard taxonomy string from categories.
 * Only includes categories whose action is not "ignore".
 */
export function buildTaxonomy(categories: Category[]): string {
	const active = categories.filter((c) => c.action !== "ignore");
	if (active.length === 0) return "";

	return active.map((c) => `${c.id}: ${c.name}\n${c.description}`).join("\n");
}
