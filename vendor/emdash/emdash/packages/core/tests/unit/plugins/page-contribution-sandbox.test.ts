import { describe, it, expect } from "vitest";

/**
 * Tests for the sandbox boundary enforcement of page contribution hooks.
 *
 * page:metadata is sandbox-safe.
 * page:fragments is trusted-only but valid in manifests (enforcement happens
 * at runtime via capability checks and at bundle time via CLI warnings).
 *
 * The enforcement happens at multiple layers:
 * 1. Manifest schema: HOOK_NAMES includes both page:metadata and page:fragments
 * 2. Capability enforcement: page:fragments requires page:inject capability
 * 3. Bundle CLI: warns when page:fragments is declared in a sandbox-targeted plugin
 * 4. Fragment collector: never invokes sandboxed plugins for page:fragments
 */

describe("page contribution sandbox boundary", () => {
	describe("manifest schema validation", () => {
		it("should accept page:metadata in manifests", async () => {
			const { pluginManifestSchema } = await import("../../../src/plugins/manifest-schema.js");

			const manifest = {
				id: "test-plugin",
				version: "1.0.0",
				capabilities: [],
				allowedHosts: [],
				storage: {},
				hooks: [{ name: "page:metadata" }],
				routes: [],
				admin: { pages: [], widgets: [] },
			};

			const result = pluginManifestSchema.safeParse(manifest);
			expect(result.success).toBe(true);
		});

		it("should accept page:fragments in manifests (enforcement is at runtime)", async () => {
			const { pluginManifestSchema } = await import("../../../src/plugins/manifest-schema.js");

			const manifest = {
				id: "test-plugin",
				version: "1.0.0",
				capabilities: [],
				allowedHosts: [],
				storage: {},
				hooks: [{ name: "page:fragments" }],
				routes: [],
				admin: { pages: [], widgets: [] },
			};

			// Manifest validation accepts page:fragments — trusted-only enforcement
			// happens via capability checks (requires page:inject) and the bundle CLI
			// warns when this hook is used in a sandbox-targeted plugin.
			const result = pluginManifestSchema.safeParse(manifest);
			expect(result.success).toBe(true);
		});
	});

	describe("fragment collector defense-in-depth", () => {
		it("resolveFragments only processes contributions it receives", async () => {
			// The fragment collector in page/fragments.ts is a pure function that
			// processes whatever contributions are passed to it. The defense-in-depth
			// is that the runtime never passes sandboxed plugin contributions to it.
			// This test verifies the pure function works correctly.
			const { resolveFragments } = await import("../../../src/page/fragments.js");

			const result = resolveFragments([], "head");
			expect(result).toEqual([]);
		});
	});
});
