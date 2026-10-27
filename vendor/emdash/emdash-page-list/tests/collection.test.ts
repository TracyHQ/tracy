import { describe, expect, it } from "vitest";

import {
	getCollectionItemDate,
	getCollectionItemExcerpt,
	interpolateCollectionUrlPattern,
	normalizeCollectionEntry,
	resolveCollectionItemHref,
} from "../src/lib/collection.js";
import type { PageListResolvedCollectionConfig } from "../src/lib/types.js";

const baseConfig: PageListResolvedCollectionConfig = {
	sourceType: "collection",
	collection: "pages",
	heading: undefined,
	emptyState: "Nothing here yet.",
	style: "bulleted",
	limit: 5,
	class: undefined,
	sortField: "published_at",
	sortDirection: "desc",
	includeDraftsInPreview: true,
	showExcerpt: true,
	showDate: true,
	collectionUrlPattern: undefined,
};

describe("collection helpers", () => {
	it("interpolates explicit collection URL patterns", () => {
		expect(
			interpolateCollectionUrlPattern("/docs/{slug}?entry={id}", {
				id: "01HXYZ",
				slug: "getting-started",
			}),
		).toBe("/docs/getting-started?entry=01HXYZ");
	});

	it("falls back to the collection slug pattern when no explicit pattern is set", () => {
		expect(
			resolveCollectionItemHref(baseConfig, {
				id: "01HXYZ",
				slug: "getting-started",
			}),
		).toBe("/pages/getting-started");
	});

	it("extracts resilient excerpt and date fallbacks", () => {
		expect(
			getCollectionItemExcerpt({
				description: "Helpful summary",
			}),
		).toBe("Helpful summary");
		expect(
			getCollectionItemDate({
				updatedAt: "2026-01-02T00:00:00.000Z",
			}),
		).toBe("2026-01-02T00:00:00.000Z");
	});

	it("drops entries without a slug and normalizes display metadata", () => {
		expect(
			normalizeCollectionEntry(
				{
					id: "",
					data: { id: "01HXYZ", title: "Getting Started" },
				},
				baseConfig,
			),
		).toBeNull();

		expect(
			normalizeCollectionEntry(
				{
					id: "getting-started",
					data: {
						id: "01HXYZ",
						navigationTitle: "Start Here",
						summary: "Overview of the section",
						publishedAt: "2026-01-02T00:00:00.000Z",
					},
				},
				{
					...baseConfig,
					collectionUrlPattern: "/docs/{slug}",
				},
			),
		).toEqual({
			id: "01HXYZ",
			label: "Start Here",
			href: "/docs/getting-started",
			excerpt: "Overview of the section",
			date: "2026-01-02T00:00:00.000Z",
			children: [],
		});
	});
});
