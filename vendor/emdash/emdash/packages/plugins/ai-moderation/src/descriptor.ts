/**
 * AI Moderation Plugin Descriptor
 */

import type { PluginDescriptor } from "emdash";

import type { Category } from "./categories.js";

export interface AIModerationOptions {
	/** Override default categories */
	categories?: Category[];
	/** Auto-approve comments that pass AI checks (default: true) */
	autoApproveClean?: boolean;
	/** Workers AI binding name (default: "AI") */
	aiBinding?: string;
}

/**
 * Create the AI moderation plugin descriptor.
 */
export function aiModerationPlugin(
	options: AIModerationOptions = {},
): PluginDescriptor<AIModerationOptions> {
	return {
		id: "ai-moderation",
		version: "0.1.0",
		entrypoint: "@emdash-cms/plugin-ai-moderation/plugin",
		options,
		adminEntry: "@emdash-cms/plugin-ai-moderation/admin",
		adminPages: [{ path: "/settings", label: "AI Moderation", icon: "shield" }],
		adminWidgets: [{ id: "status", title: "AI Moderation", size: "third" }],
	};
}
