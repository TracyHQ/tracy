/**
 * Preview middleware
 *
 * Validates signed preview URLs, creates DO-backed sessions,
 * populates snapshots, and overrides the request-context DB.
 */

import { createPreviewMiddleware } from "@emdash-cms/cloudflare/db/do";
import { sequence } from "astro:middleware";

const preview = createPreviewMiddleware({
	binding: "PREVIEW_DB",
	secret: import.meta.env.PREVIEW_SECRET,
});

export const onRequest = sequence(preview);
