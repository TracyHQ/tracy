import { describe, expect, it } from "vitest";

import { DEFAULT_PAGE_LIST_SETTINGS, UNLIMITED_ROOT_ITEMS } from "../src/lib/defaults.js";
import { normalizePageListSettings, resolvePageListConfig } from "../src/lib/config.js";

describe("normalizePageListSettings", () => {
	it("applies hard defaults when persisted settings are missing", () => {
		expect(normalizePageListSettings({})).toEqual(DEFAULT_PAGE_LIST_SETTINGS);
	});

	it("sanitizes invalid values while preserving valid ones", () => {
		expect(
			normalizePageListSettings({
				defaultSourceType: "menu",
				defaultListStyle: "card",
				defaultLimit: "999",
				defaultSortField: "wat",
				showExcerptByDefault: false,
				showDateByDefault: true,
			}),
		).toEqual({
			defaultSourceType: "menu",
			defaultListStyle: "card",
			defaultLimit: 50,
			defaultSortField: "published_at",
			defaultSortDirection: "desc",
			showExcerptByDefault: false,
			showDateByDefault: true,
		});
	});
});

describe("resolvePageListConfig", () => {
	it("merges hard defaults, settings, and explicit props in order", () => {
		const config = resolvePageListConfig(
			{
				sourceType: "collection",
				collection: "pages",
				limit: 3,
				showExcerpt: true,
			},
			{
				defaultSourceType: "menu",
				defaultListStyle: "compact",
				defaultLimit: 9,
				defaultSortField: "updated_at",
				defaultSortDirection: "asc",
				showExcerptByDefault: false,
				showDateByDefault: true,
			},
		);

		expect(config).toMatchObject({
			sourceType: "collection",
			collection: "pages",
			style: "compact",
			limit: 3,
			sortField: "updated_at",
			sortDirection: "asc",
			showExcerpt: true,
			showDate: true,
		});
	});

	it("preserves explicit false values for toggles", () => {
		const config = resolvePageListConfig(
			{
				sourceType: "collection",
				collection: "pages",
				showExcerpt: false,
				showDate: false,
			},
			{
				showExcerptByDefault: true,
				showDateByDefault: true,
			},
		);

		expect(config).toMatchObject({
			showExcerpt: false,
			showDate: false,
		});
	});

	it("builds menu configs with a clamped child depth", () => {
		const config = resolvePageListConfig({
			sourceType: "menu",
			menuName: "primary",
			childDepthLimit: 99,
		});

		expect(config).toEqual(
			expect.objectContaining({
				sourceType: "menu",
				menuName: "primary",
				childDepthLimit: 10,
			}),
		);
	});

	it("does not apply collection defaults to menu truncation unless the block sets a limit", () => {
		const config = resolvePageListConfig(
			{
				sourceType: "menu",
				menuName: "primary",
			},
			{
				defaultLimit: 3,
			},
		);

		expect(config).toEqual(
			expect.objectContaining({
				limit: UNLIMITED_ROOT_ITEMS,
			}),
		);
	});
});
