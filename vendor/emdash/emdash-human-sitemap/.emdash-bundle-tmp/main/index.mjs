import { definePlugin } from "emdash";

//#region src/types.ts
const HUMAN_SITEMAP_PLUGIN_ID = "human-sitemap";
const HUMAN_SITEMAP_VERSION = "0.1.0";
const DEFAULT_HUMAN_SITEMAP_SORT = "alphabetical";
const DEFAULT_INCLUDED_COLLECTIONS_TEXT = "pages\nposts";
const DEFAULT_INCLUDED_MENUS_TEXT = "primary";
const DEFAULT_INCLUDE_TAXONOMIES = true;
const DEFAULT_SHOW_COUNTS = false;
const DEFAULT_MAX_ITEMS_PER_SECTION = 25;

//#endregion
//#region src/settings.ts
const humanSitemapSettingsSchemaDefaults = {
	includedCollections: DEFAULT_INCLUDED_COLLECTIONS_TEXT,
	includedMenus: DEFAULT_INCLUDED_MENUS_TEXT,
	includeTaxonomies: DEFAULT_INCLUDE_TAXONOMIES,
	showCounts: DEFAULT_SHOW_COUNTS,
	maxItemsPerSection: DEFAULT_MAX_ITEMS_PER_SECTION,
	defaultSort: DEFAULT_HUMAN_SITEMAP_SORT
};

//#endregion
//#region src/plugin.ts
const blockFields = [
	{
		type: "text_input",
		action_id: "title",
		label: "Title",
		placeholder: "Sitemap"
	},
	{
		type: "toggle",
		action_id: "showCollections",
		label: "Show collection sections",
		initial_value: true
	},
	{
		type: "toggle",
		action_id: "showMenus",
		label: "Show menu sections",
		initial_value: true
	},
	{
		type: "toggle",
		action_id: "showTaxonomies",
		label: "Show taxonomy sections",
		initial_value: true
	},
	{
		type: "select",
		action_id: "showCountsMode",
		label: "Counts",
		initial_value: "inherit",
		options: [
			{
				value: "inherit",
				label: "Use plugin default"
			},
			{
				value: "show",
				label: "Show counts"
			},
			{
				value: "hide",
				label: "Hide counts"
			}
		]
	},
	{
		type: "select",
		action_id: "layout",
		label: "Layout",
		initial_value: "compact",
		options: [{
			value: "compact",
			label: "Compact"
		}, {
			value: "expanded",
			label: "Expanded"
		}]
	}
];
function createPlugin() {
	return definePlugin({
		id: HUMAN_SITEMAP_PLUGIN_ID,
		version: HUMAN_SITEMAP_VERSION,
		capabilities: [],
		admin: {
			settingsSchema: {
				includedCollections: {
					type: "string",
					label: "Included collections",
					description: "One collection slug per line. Use slug|Label to rename a section, for example posts|Articles.",
					default: humanSitemapSettingsSchemaDefaults.includedCollections,
					multiline: true
				},
				includedMenus: {
					type: "string",
					label: "Included menus",
					description: "One menu name per line. Use menu|Label to rename a section, for example footer|Footer links.",
					default: humanSitemapSettingsSchemaDefaults.includedMenus,
					multiline: true
				},
				includeTaxonomies: {
					type: "boolean",
					label: "Include taxonomies",
					description: "Show taxonomy terms that relate to the configured collections.",
					default: humanSitemapSettingsSchemaDefaults.includeTaxonomies
				},
				showCounts: {
					type: "boolean",
					label: "Show counts",
					description: "Display section totals and taxonomy term counts.",
					default: humanSitemapSettingsSchemaDefaults.showCounts
				},
				maxItemsPerSection: {
					type: "number",
					label: "Max items per section",
					description: "Limit each section so very large sites stay readable.",
					default: humanSitemapSettingsSchemaDefaults.maxItemsPerSection,
					min: 1,
					max: 100
				},
				defaultSort: {
					type: "select",
					label: "Default sort",
					description: "Collections can render alphabetically or by published date.",
					default: humanSitemapSettingsSchemaDefaults.defaultSort,
					options: [{
						value: "alphabetical",
						label: "Alphabetical"
					}, {
						value: "date",
						label: "Newest first"
					}]
				}
			},
			portableTextBlocks: [{
				type: "humanSitemap",
				label: "Human Sitemap",
				icon: "link",
				description: "Render a reader-friendly sitemap page from live EmDash content.",
				fields: blockFields
			}]
		}
	});
}

//#endregion
export { createPlugin, createPlugin as default };