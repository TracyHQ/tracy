import assert from "node:assert/strict";
import test from "node:test";

import { buildHumanSitemapData } from "../src/data.js";
import { normalizeHumanSitemapSettings, resolveHumanSitemapOptions } from "../src/settings.js";
import type { HumanSitemapDataSource } from "../src/types.js";

function entry(id: string, title: string) {
  return { id, data: { title } };
}

test("collection sections truncate gracefully and expose view-all metadata", async () => {
  const source: HumanSitemapDataSource = {
    getEmDashCollection: async () => ({
      entries: [entry("alpha", "Alpha"), entry("beta", "Beta"), entry("gamma", "Gamma")],
    }),
    getMenu: async () => null,
    getTaxonomyDefs: async () => [],
    getTaxonomyTerms: async () => [],
  };

  const settings = normalizeHumanSitemapSettings({
    includedCollections: "posts|Articles",
    includedMenus: "",
    includeTaxonomies: false,
    maxItemsPerSection: 2,
  });
  const options = resolveHumanSitemapOptions(settings, {
    viewAllLinks: {
      "collection:posts": { href: "/posts", label: "Browse all posts" },
    },
  });

  const sections = await buildHumanSitemapData(options, source);
  assert.equal(sections.length, 1);
  const section = sections[0];
  assert.ok(section);
  assert.equal(section.label, "Articles");
  assert.equal(section.items.length, 2);
  assert.equal(section.hasOverflow, true);
  assert.equal(section.viewAllLink?.href, "/posts");
});

test("showCounts forces full collection pagination for exact totals", async () => {
  let calls = 0;

  const source: HumanSitemapDataSource = {
    getEmDashCollection: async (_collection, filter) => {
      calls += 1;
      if (filter?.cursor === "page-2") {
        return { entries: [entry("gamma", "Gamma")] };
      }

      return {
        entries: [entry("alpha", "Alpha"), entry("beta", "Beta")],
        nextCursor: "page-2",
      };
    },
    getMenu: async () => null,
    getTaxonomyDefs: async () => [],
    getTaxonomyTerms: async () => [],
  };

  const settings = normalizeHumanSitemapSettings({
    includedCollections: "posts",
    includedMenus: "",
    includeTaxonomies: false,
    showCounts: true,
    maxItemsPerSection: 2,
  });
  const options = resolveHumanSitemapOptions(settings);

  const sections = await buildHumanSitemapData(options, source);
  assert.equal(sections.length, 1);
  const section = sections[0];
  assert.ok(section);
  assert.equal(section.totalCount, 3);
  assert.equal(section.renderedCount, 2);
  assert.equal(section.hasOverflow, true);
  assert.equal(calls, 2);
});

test("taxonomy sections are filtered to the configured collection scope", async () => {
  const source: HumanSitemapDataSource = {
    getEmDashCollection: async () => ({ entries: [] }),
    getMenu: async () => null,
    getTaxonomyDefs: async () => [
      { name: "category", label: "Categories", collections: ["posts"] },
      { name: "topic", label: "Topics", collections: ["docs"] },
    ],
    getTaxonomyTerms: async (taxonomyName) => {
      if (taxonomyName === "category") {
        return [{ id: "1", name: "category", slug: "news", label: "News", count: 4, children: [] }];
      }

      return [{ id: "2", name: "topic", slug: "guides", label: "Guides", count: 2, children: [] }];
    },
  };

  const settings = normalizeHumanSitemapSettings({
    includedCollections: "posts",
    includedMenus: "",
    includeTaxonomies: true,
  });
  const options = resolveHumanSitemapOptions(settings);

  const sections = await buildHumanSitemapData(options, source);
  assert.deepEqual(sections.map((section) => section.label), ["Categories"]);
  const section = sections[0];
  assert.ok(section);
  const item = section.items[0];
  assert.ok(item);
  assert.equal(item.count, 4);
});
