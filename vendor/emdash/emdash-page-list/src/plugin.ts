import {
	DEFAULT_EMPTY_STATE,
	DEFAULT_LIMIT,
	DEFAULT_SORT_DIRECTION,
	DEFAULT_SORT_FIELD,
	DEFAULT_SOURCE_TYPE,
	DEFAULT_STYLE,
	MAX_CHILD_DEPTH,
	MAX_LIMIT,
	PAGE_LIST_BLOCK_TYPE,
	PAGE_LIST_PLUGIN_ID,
	PLUGIN_VERSION,
	SORT_DIRECTION_OPTIONS,
	SORT_FIELD_OPTIONS,
	SOURCE_TYPE_OPTIONS,
	STYLE_OPTIONS,
} from "./lib/defaults.js";
import { definePlugin, type EmdashResolvedPlugin } from "./lib/emdash.js";

export function createPlugin(): EmdashResolvedPlugin {
	return definePlugin({
		id: PAGE_LIST_PLUGIN_ID,
		version: PLUGIN_VERSION,
		capabilities: [],
		admin: {
			settingsSchema: {
				defaultSourceType: {
					type: "select",
					label: "Default Source Type",
					description: "Used when a block omits its source type.",
					options: SOURCE_TYPE_OPTIONS,
					default: DEFAULT_SOURCE_TYPE,
				},
				defaultListStyle: {
					type: "select",
					label: "Default List Style",
					description: "Used when a block omits its list style.",
					options: STYLE_OPTIONS,
					default: DEFAULT_STYLE,
				},
				defaultLimit: {
					type: "number",
					label: "Default Limit",
					description: "Maximum number of top-level items to show when a block leaves limit blank.",
					default: DEFAULT_LIMIT,
					min: 1,
					max: MAX_LIMIT,
				},
				defaultSortField: {
					type: "select",
					label: "Default Sort Field",
					description: "Collection-backed blocks sort by this field unless overridden in the block.",
					options: SORT_FIELD_OPTIONS,
					default: DEFAULT_SORT_FIELD,
				},
				defaultSortDirection: {
					type: "select",
					label: "Default Sort Direction",
					description:
						"Collection-backed blocks use this direction unless overridden in the block.",
					options: SORT_DIRECTION_OPTIONS,
					default: DEFAULT_SORT_DIRECTION,
				},
				showExcerptByDefault: {
					type: "boolean",
					label: "Show excerpt by default",
					description: "Applies to collection-backed blocks when the block leaves the setting blank.",
					default: false,
				},
				showDateByDefault: {
					type: "boolean",
					label: "Show date by default",
					description: "Applies to collection-backed blocks when the block leaves the setting blank.",
					default: false,
				},
			},
			portableTextBlocks: [
				{
					type: PAGE_LIST_BLOCK_TYPE,
					label: "Page List",
					icon: "link",
					description: "Render a dynamic list from a collection or a menu.",
					fields: [
						{
							type: "select",
							action_id: "sourceType",
							label: "Source",
							options: SOURCE_TYPE_OPTIONS.map((option) => ({
								label: option.label,
								value: option.value,
							})),
						},
						{
							type: "text_input",
							action_id: "collection",
							label: "Collection slug",
							placeholder: "pages",
							condition: { field: "sourceType", eq: "collection" },
						},
						{
							type: "text_input",
							action_id: "menuName",
							label: "Menu name",
							placeholder: "primary",
							condition: { field: "sourceType", eq: "menu" },
						},
						{
							type: "text_input",
							action_id: "heading",
							label: "Heading",
							placeholder: "Start here",
						},
						{
							type: "select",
							action_id: "style",
							label: "Style",
							options: STYLE_OPTIONS.map((option) => ({
								label: option.label,
								value: option.value,
							})),
						},
						{
							type: "number_input",
							action_id: "limit",
							label: "Limit",
							min: 1,
							max: MAX_LIMIT,
						},
						{
							type: "select",
							action_id: "sortField",
							label: "Sort field",
							options: SORT_FIELD_OPTIONS.map((option) => ({
								label: option.label,
								value: option.value,
							})),
							condition: { field: "sourceType", eq: "collection" },
						},
						{
							type: "select",
							action_id: "sortDirection",
							label: "Sort direction",
							options: SORT_DIRECTION_OPTIONS.map((option) => ({
								label: option.label,
								value: option.value,
							})),
							condition: { field: "sourceType", eq: "collection" },
						},
						{
							type: "toggle",
							action_id: "includeDraftsInPreview",
							label: "Show drafts in preview",
							condition: { field: "sourceType", eq: "collection" },
						},
						{
							type: "toggle",
							action_id: "showExcerpt",
							label: "Show excerpt",
							condition: { field: "sourceType", eq: "collection" },
						},
						{
							type: "toggle",
							action_id: "showDate",
							label: "Show publish date",
							condition: { field: "sourceType", eq: "collection" },
						},
						{
							type: "number_input",
							action_id: "childDepthLimit",
							label: "Child depth limit",
							min: 1,
							max: MAX_CHILD_DEPTH,
							condition: { field: "sourceType", eq: "menu" },
						},
						{
							type: "text_input",
							action_id: "emptyState",
							label: "Empty-state text",
							placeholder: DEFAULT_EMPTY_STATE,
						},
					],
				},
			],
		},
	});
}

export default createPlugin;
