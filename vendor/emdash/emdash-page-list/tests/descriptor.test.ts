import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import pageListPlugin, { pageListPlugin as namedPageListPlugin } from "../src/index.js";
import { PACKAGE_NAME, PAGE_LIST_PLUGIN_ID, PLUGIN_VERSION } from "../src/lib/defaults.js";

describe("pageListPlugin descriptor", () => {
	it("exports the descriptor as both named and default exports", () => {
		expect(pageListPlugin()).toEqual(namedPageListPlugin());
	});

	it("declares a trusted native plugin with the expected entrypoints", () => {
		expect(PACKAGE_NAME).toBe("emdash-page-list");
		expect(pageListPlugin()).toMatchObject({
			id: PAGE_LIST_PLUGIN_ID,
			version: PLUGIN_VERSION,
			format: "native",
			entrypoint: "emdash-page-list/plugin",
			componentsEntry: "emdash-page-list/astro",
		});
	});

	it("does not declare sandbox-only capabilities or storage", () => {
		const descriptor = pageListPlugin();
		expect(descriptor.capabilities).toEqual([]);
		expect(descriptor.storage).toBeUndefined();
		expect(descriptor.allowedHosts).toEqual([]);
	});

	it("keeps package plugin.id in sync", () => {
		const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
			plugin?: { id?: string };
		};
		expect(pkg.plugin?.id).toBe(PAGE_LIST_PLUGIN_ID);
	});
});
