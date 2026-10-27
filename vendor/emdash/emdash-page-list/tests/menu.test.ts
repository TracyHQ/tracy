import { describe, expect, it } from "vitest";

import { applyRootLimit, normalizeMenuItem, pruneMenuItems } from "../src/lib/menu.js";
import type { PageListRenderItem } from "../src/lib/types.js";

describe("menu helpers", () => {
	it("normalizes menu items while preserving children and link metadata", () => {
		expect(
			normalizeMenuItem({
				id: "root",
				label: "Docs",
				url: "/docs",
				target: "_blank",
				titleAttr: "Documentation",
				cssClasses: "is-docs",
				children: [
					{
						id: "child",
						label: "Guides",
						url: "/docs/guides",
					},
				],
			}),
		).toEqual({
			id: "root",
			label: "Docs",
			href: "/docs",
			target: "_blank",
			titleAttr: "Documentation",
			cssClasses: "is-docs",
			children: [
				{
					id: "child",
					label: "Guides",
					href: "/docs/guides",
					target: undefined,
					titleAttr: undefined,
					cssClasses: undefined,
					children: [],
				},
			],
		});
	});

	it("limits only top-level items", () => {
		const items: PageListRenderItem[] = [
			{ id: "a", label: "A", href: "/a", children: [] },
			{ id: "b", label: "B", href: "/b", children: [] },
			{ id: "c", label: "C", href: "/c", children: [] },
		];

		expect(applyRootLimit(items, 2)).toHaveLength(2);
		expect(applyRootLimit(items, 2).map((item) => item.id)).toEqual(["a", "b"]);
	});

	it("prunes nested levels after the configured child depth", () => {
		const items: PageListRenderItem[] = [
			{
				id: "root",
				label: "Root",
				href: "/root",
				children: [
					{
						id: "child",
						label: "Child",
						href: "/root/child",
						children: [
							{
								id: "grandchild",
								label: "Grandchild",
								href: "/root/child/grandchild",
								children: [],
							},
						],
					},
				],
			},
		];

		expect(pruneMenuItems(items, 1)).toEqual([
			{
				id: "root",
				label: "Root",
				href: "/root",
				children: [],
			},
		]);

		expect(pruneMenuItems(items, 2)[0]?.children).toEqual([
			{
				id: "child",
				label: "Child",
				href: "/root/child",
				children: [],
			},
		]);
	});
});
