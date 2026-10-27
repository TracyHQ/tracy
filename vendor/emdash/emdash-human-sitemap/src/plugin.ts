import type { PortableTextBlockField, ResolvedPlugin } from "emdash";
import { definePlugin } from "emdash";

import { humanSitemapSettingsSchemaDefaults } from "./settings.js";
import { HUMAN_SITEMAP_PLUGIN_ID, HUMAN_SITEMAP_VERSION } from "./types.js";

const blockFields: PortableTextBlockField[] = [
  {
    type: "text_input",
    action_id: "title",
    label: "Title",
    placeholder: "Sitemap",
  },
  {
    type: "toggle",
    action_id: "showCollections",
    label: "Show collection sections",
    initial_value: true,
  },
  {
    type: "toggle",
    action_id: "showMenus",
    label: "Show menu sections",
    initial_value: true,
  },
  {
    type: "toggle",
    action_id: "showTaxonomies",
    label: "Show taxonomy sections",
    initial_value: true,
  },
  {
    type: "select",
    action_id: "showCountsMode",
    label: "Counts",
    initial_value: "inherit",
    options: [
      { value: "inherit", label: "Use plugin default" },
      { value: "show", label: "Show counts" },
      { value: "hide", label: "Hide counts" },
    ],
  },
  {
    type: "select",
    action_id: "layout",
    label: "Layout",
    initial_value: "compact",
    options: [
      { value: "compact", label: "Compact" },
      { value: "expanded", label: "Expanded" },
    ],
  },
];

export function createPlugin(): ResolvedPlugin {
  return definePlugin({
    id: HUMAN_SITEMAP_PLUGIN_ID,
    version: HUMAN_SITEMAP_VERSION,
    capabilities: [],
    admin: {
      settingsSchema: {
        includedCollections: {
          type: "string",
          label: "Included collections",
          description:
            "One collection slug per line. Use slug|Label to rename a section, for example posts|Articles.",
          default: humanSitemapSettingsSchemaDefaults.includedCollections,
          multiline: true,
        },
        includedMenus: {
          type: "string",
          label: "Included menus",
          description:
            "One menu name per line. Use menu|Label to rename a section, for example footer|Footer links.",
          default: humanSitemapSettingsSchemaDefaults.includedMenus,
          multiline: true,
        },
        includeTaxonomies: {
          type: "boolean",
          label: "Include taxonomies",
          description: "Show taxonomy terms that relate to the configured collections.",
          default: humanSitemapSettingsSchemaDefaults.includeTaxonomies,
        },
        showCounts: {
          type: "boolean",
          label: "Show counts",
          description: "Display section totals and taxonomy term counts.",
          default: humanSitemapSettingsSchemaDefaults.showCounts,
        },
        maxItemsPerSection: {
          type: "number",
          label: "Max items per section",
          description: "Limit each section so very large sites stay readable.",
          default: humanSitemapSettingsSchemaDefaults.maxItemsPerSection,
          min: 1,
          max: 100,
        },
        defaultSort: {
          type: "select",
          label: "Default sort",
          description: "Collections can render alphabetically or by published date.",
          default: humanSitemapSettingsSchemaDefaults.defaultSort,
          options: [
            { value: "alphabetical", label: "Alphabetical" },
            { value: "date", label: "Newest first" },
          ],
        },
      },
      portableTextBlocks: [
        {
          type: "humanSitemap",
          label: "Human Sitemap",
          icon: "link",
          description: "Render a reader-friendly sitemap page from live EmDash content.",
          fields: blockFields,
        },
      ],
    },
  });
}

export default createPlugin;

export type * from "./types.js";
