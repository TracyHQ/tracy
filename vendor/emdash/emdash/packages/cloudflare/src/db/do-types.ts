/**
 * Shared Durable Object config types (preview-only)
 *
 * Imported by both the config-time entry (index.ts) and the runtime entry (do.ts).
 * This module must NOT import from cloudflare:workers so it stays safe at config time.
 */

/** Durable Object preview database configuration */
export interface PreviewDOConfig {
	/** Wrangler binding name for the DO namespace */
	binding: string;
}
