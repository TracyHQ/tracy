/**
 * Preview Worker Entrypoint
 *
 * Exports:
 * - default: Astro handler
 * - EmDashPreviewDB: Durable Object class for preview databases
 */

import handler from "@astrojs/cloudflare/entrypoints/server";

// Export the DO class so Cloudflare can instantiate it
export { EmDashPreviewDB } from "@emdash-cms/cloudflare/db/do";

export default handler;
