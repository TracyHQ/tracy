import type {
	PageListSettings,
	PageListSortDirection,
	PageListSortField,
	PageListSourceType,
	PageListStyle,
} from "./types.js";

export const PACKAGE_NAME = "emdash-page-list";
export const PAGE_LIST_PLUGIN_ID = "page-list";
export const PAGE_LIST_BLOCK_TYPE = "pageList";
export const PLUGIN_VERSION = "0.1.4";

export const DEFAULT_SOURCE_TYPE: PageListSourceType = "collection";
export const DEFAULT_STYLE: PageListStyle = "bulleted";
export const DEFAULT_LIMIT = 5;
export const MAX_LIMIT = 50;
export const DEFAULT_SORT_FIELD: PageListSortField = "published_at";
export const DEFAULT_SORT_DIRECTION: PageListSortDirection = "desc";
export const DEFAULT_EMPTY_STATE = "No items to display.";
export const DEFAULT_INCLUDE_DRAFTS_IN_PREVIEW = true;
export const DEFAULT_SHOW_EXCERPT = false;
export const DEFAULT_SHOW_DATE = false;
export const MAX_CHILD_DEPTH = 10;
export const UNLIMITED_ROOT_ITEMS = Number.MAX_SAFE_INTEGER;

export const DEFAULT_PAGE_LIST_SETTINGS: Required<PageListSettings> = {
	defaultSourceType: DEFAULT_SOURCE_TYPE,
	defaultListStyle: DEFAULT_STYLE,
	defaultLimit: DEFAULT_LIMIT,
	defaultSortField: DEFAULT_SORT_FIELD,
	defaultSortDirection: DEFAULT_SORT_DIRECTION,
	showExcerptByDefault: DEFAULT_SHOW_EXCERPT,
	showDateByDefault: DEFAULT_SHOW_DATE,
};

export const SOURCE_TYPE_OPTIONS = [
	{ value: "collection", label: "Collection" },
	{ value: "menu", label: "Menu" },
] as const;

export const STYLE_OPTIONS = [
	{ value: "bulleted", label: "Bulleted" },
	{ value: "compact", label: "Compact" },
	{ value: "card", label: "Card" },
] as const;

export const SORT_FIELD_OPTIONS = [
	{ value: "published_at", label: "Publish date" },
	{ value: "updated_at", label: "Last updated" },
	{ value: "created_at", label: "Created date" },
	{ value: "slug", label: "Slug" },
] as const;

export const SORT_DIRECTION_OPTIONS = [
	{ value: "desc", label: "Descending" },
	{ value: "asc", label: "Ascending" },
] as const;
