import { describe, it, expect } from "vitest";

import { isBlockedInPreview } from "../../src/db/do-preview-routes.js";

describe("isBlockedInPreview", () => {
	it.each([
		// Admin UI
		"/_emdash/admin",
		"/_emdash/admin/content",
		"/_emdash/admin/settings",
		// Auth endpoints
		"/_emdash/api/auth/passkey/options",
		"/_emdash/api/auth/passkey/verify",
		"/_emdash/api/auth/dev-bypass",
		"/_emdash/api/auth/magic-link/send",
		"/_emdash/api/auth/oauth/github",
		"/_emdash/api/auth/oauth/github/callback",
		"/_emdash/api/auth/me",
		"/_emdash/api/auth/logout",
		// Setup endpoints
		"/_emdash/api/setup/status",
		"/_emdash/api/setup/dev-bypass",
		"/_emdash/api/setup/dev-reset",
		"/_emdash/api/setup/admin",
		// Write endpoints (plugins, users, settings, imports)
		"/_emdash/api/plugins/install",
		"/_emdash/api/users",
		"/_emdash/api/settings",
		"/_emdash/api/import",
		// Any unknown /_emdash/ path
		"/_emdash/api/unknown-future-endpoint",
		"/_emdash/anything",
	])("blocks %s", (path: string) => {
		expect(isBlockedInPreview(path)).toBe(true);
	});

	it.each([
		// Site pages (not /_emdash/)
		"/",
		"/blog/my-post",
		"/about",
		"/sitemap.xml",
		"/robots.txt",
		// Allowlisted read-only API routes
		"/_emdash/api/content/posts",
		"/_emdash/api/content/posts/abc123",
		"/_emdash/api/schema",
		"/_emdash/api/schema/collections",
		"/_emdash/api/manifest",
		"/_emdash/api/dashboard",
		"/_emdash/api/search",
		"/_emdash/api/search/suggest",
		"/_emdash/api/media",
		"/_emdash/api/media/file/image.jpg",
		"/_emdash/api/taxonomies",
		"/_emdash/api/menus",
		"/_emdash/api/snapshot",
	])("allows %s", (path: string) => {
		expect(isBlockedInPreview(path)).toBe(false);
	});
});
