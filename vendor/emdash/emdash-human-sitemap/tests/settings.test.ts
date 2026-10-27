import assert from "node:assert/strict";
import test from "node:test";

import {
  blockToRenderOverrides,
  normalizeHumanSitemapSettings,
  resolveHumanSitemapOptions,
} from "../src/settings.js";

test("normalizeHumanSitemapSettings parses multiline values and label overrides", () => {
  const settings = normalizeHumanSitemapSettings({
    includedCollections: "pages|Pages\nposts|Articles\nposts|Ignore me\npeople",
    includedMenus: "primary\nfooter|Footer Links",
    includeTaxonomies: false,
    showCounts: true,
    maxItemsPerSection: 999,
    defaultSort: "date",
  });

  assert.deepEqual(settings.includedCollections, [
    { slug: "pages", label: "Pages" },
    { slug: "posts", label: "Articles" },
    { slug: "people" },
  ]);
  assert.deepEqual(settings.includedMenus, [
    { name: "primary" },
    { name: "footer", label: "Footer Links" },
  ]);
  assert.equal(settings.includeTaxonomies, false);
  assert.equal(settings.showCounts, true);
  assert.equal(settings.maxItemsPerSection, 100);
  assert.equal(settings.defaultSort, "date");
});

test("blank collection and menu settings stay blank instead of snapping back to defaults", () => {
  const settings = normalizeHumanSitemapSettings({
    includedCollections: "",
    includedMenus: "",
  });

  assert.deepEqual(settings.includedCollections, []);
  assert.deepEqual(settings.includedMenus, []);
  assert.equal(settings.includeTaxonomies, true);
  assert.equal(settings.showCounts, false);
});

test("resolveHumanSitemapOptions respects explicit overrides and block-derived values", () => {
  const settings = normalizeHumanSitemapSettings({
    includedCollections: "posts",
    includedMenus: "primary",
    showCounts: false,
  });

  const blockOverrides = blockToRenderOverrides({
    _type: "humanSitemap",
    title: "Page overview",
    showCollections: false,
    showMenus: true,
    showTaxonomies: true,
    showCountsMode: "show",
    layout: "expanded",
  });

  const resolved = resolveHumanSitemapOptions(settings, blockOverrides);

  assert.equal(resolved.title, "Page overview");
  assert.equal(resolved.showCollections, false);
  assert.equal(resolved.showMenus, true);
  assert.equal(resolved.showTaxonomies, true);
  assert.equal(resolved.showCounts, true);
  assert.equal(resolved.layout, "expanded");
});
