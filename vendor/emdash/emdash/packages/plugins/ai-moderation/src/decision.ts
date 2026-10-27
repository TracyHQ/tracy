/**
 * Moderation Decision Logic
 */

import type { CollectionCommentSettings, ModerationDecision } from "emdash";

import type { Category } from "./categories.js";
import type { GuardResult } from "./guard.js";
/**
 * Compute the moderation decision for a comment.
 *
 * Decision flow (in priority order):
 * 1. Authenticated CMS user → approved
 * 2. AI flagged "block" category → spam
 * 3. AI flagged "hold" category → pending
 * 4. AI error (fail-safe) → pending
 * 5. AI clean + autoApproveClean → approved
 * 6. Collection moderation fallback
 */
export function computeDecision(
	guard: GuardResult | undefined,
	guardError: string | undefined,
	categories: Category[],
	settings: { autoApproveClean: boolean },
	collectionSettings: CollectionCommentSettings,
	priorApprovedCount: number,
	isAuthenticatedUser: boolean,
): ModerationDecision {
	// 1. Auto-approve authenticated CMS users
	if (isAuthenticatedUser) {
		return { status: "approved", reason: "Authenticated CMS user" };
	}

	// Build category action lookup
	const categoryActions = new Map(categories.map((c) => [c.id, c.action]));

	// 2 & 3. Check AI guard results
	// Track whether AI ran and found only ignorable categories (treat as clean)
	let aiRanClean = guard?.safe === true;

	if (guard && !guard.safe) {
		let shouldBlock = false;
		let shouldHold = false;
		const flaggedCategories: string[] = [];

		for (const catId of guard.categories) {
			const action = categoryActions.get(catId);
			if (action === "block") {
				shouldBlock = true;
				flaggedCategories.push(catId);
			} else if (action === "hold" || action === undefined) {
				// Unknown categories default to "hold" (fail-safe)
				shouldHold = true;
				flaggedCategories.push(catId);
			}
			// "ignore" categories are skipped
		}

		if (shouldBlock) {
			return {
				status: "spam",
				reason: `AI flagged: ${flaggedCategories.join(", ")}`,
			};
		}

		if (shouldHold) {
			return {
				status: "pending",
				reason: `AI flagged for review: ${flaggedCategories.join(", ")}`,
			};
		}

		// AI flagged categories but all were "ignore" — treat as clean
		aiRanClean = true;
	}

	// 4. AI error (fail-safe: hold for review)
	if (guardError) {
		return {
			status: "pending",
			reason: `AI error: ${guardError}`,
		};
	}

	// 5. Auto-approve clean comments when configured
	if (settings.autoApproveClean && aiRanClean) {
		return { status: "approved", reason: "AI verified clean" };
	}

	// 6. Fall back to collection moderation settings
	if (collectionSettings.commentsModeration === "none") {
		return { status: "approved", reason: "Moderation disabled" };
	}

	if (collectionSettings.commentsModeration === "first_time" && priorApprovedCount > 0) {
		return { status: "approved", reason: "Returning commenter" };
	}

	return { status: "pending", reason: "Held for review" };
}
