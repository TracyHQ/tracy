import {
	DEFAULT_EMPTY_STATE,
	DEFAULT_INCLUDE_DRAFTS_IN_PREVIEW,
	DEFAULT_PAGE_LIST_SETTINGS,
	MAX_CHILD_DEPTH,
	MAX_LIMIT,
	PAGE_LIST_PLUGIN_ID,
	UNLIMITED_ROOT_ITEMS,
} from "./defaults.js";
import { getPluginSettings } from "./emdash.js";
import type {
	PageListProps,
	PageListResolvedCollectionConfig,
	PageListResolvedConfig,
	PageListResolvedMenuConfig,
	PageListSettings,
	PageListSortDirection,
	PageListSortField,
	PageListSourceType,
	PageListStyle,
} from "./types.js";

function asNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
	if (typeof value === "boolean") return value;
	if (value === "true") return true;
	if (value === "false") return false;
	return undefined;
}

function asNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim()) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

function clampNumber(value: number | undefined, minimum: number, maximum: number): number | undefined {
	if (typeof value !== "number") return undefined;
	return Math.min(maximum, Math.max(minimum, value));
}

function isSourceType(value: unknown): value is PageListSourceType {
	return value === "collection" || value === "menu";
}

function isStyle(value: unknown): value is PageListStyle {
	return value === "bulleted" || value === "compact" || value === "card";
}

function isSortField(value: unknown): value is PageListSortField {
	return (
		value === "published_at" ||
		value === "updated_at" ||
		value === "created_at" ||
		value === "slug"
	);
}

function isSortDirection(value: unknown): value is PageListSortDirection {
	return value === "asc" || value === "desc";
}

export function normalizePageListSettings(
	raw: Record<string, unknown> = {},
): Required<PageListSettings> {
	return {
		defaultSourceType: isSourceType(raw.defaultSourceType)
			? raw.defaultSourceType
			: DEFAULT_PAGE_LIST_SETTINGS.defaultSourceType,
		defaultListStyle: isStyle(raw.defaultListStyle)
			? raw.defaultListStyle
			: DEFAULT_PAGE_LIST_SETTINGS.defaultListStyle,
		defaultLimit:
			clampNumber(asNumber(raw.defaultLimit), 1, MAX_LIMIT) ??
			DEFAULT_PAGE_LIST_SETTINGS.defaultLimit,
		defaultSortField: isSortField(raw.defaultSortField)
			? raw.defaultSortField
			: DEFAULT_PAGE_LIST_SETTINGS.defaultSortField,
		defaultSortDirection: isSortDirection(raw.defaultSortDirection)
			? raw.defaultSortDirection
			: DEFAULT_PAGE_LIST_SETTINGS.defaultSortDirection,
		showExcerptByDefault:
			asBoolean(raw.showExcerptByDefault) ?? DEFAULT_PAGE_LIST_SETTINGS.showExcerptByDefault,
		showDateByDefault:
			asBoolean(raw.showDateByDefault) ?? DEFAULT_PAGE_LIST_SETTINGS.showDateByDefault,
	};
}

export async function loadPageListSettings(): Promise<PageListSettings> {
	const rawSettings = await getPluginSettings(PAGE_LIST_PLUGIN_ID);
	return normalizePageListSettings(rawSettings);
}

export function resolvePageListConfig(
	input: PageListProps = {},
	settings: PageListSettings = DEFAULT_PAGE_LIST_SETTINGS,
): PageListResolvedConfig {
	const normalizedSettings = normalizePageListSettings(settings as Record<string, unknown>);
	const sourceType = isSourceType(input.sourceType)
		? input.sourceType
		: normalizedSettings.defaultSourceType;
	const style = isStyle(input.style) ? input.style : normalizedSettings.defaultListStyle;
	const limit =
		clampNumber(asNumber(input.limit), 1, MAX_LIMIT) ?? normalizedSettings.defaultLimit;
	const heading = asNonEmptyString(input.heading);
	const emptyState = asNonEmptyString(input.emptyState) ?? DEFAULT_EMPTY_STATE;
	const className = asNonEmptyString(input.class);

	if (sourceType === "menu") {
		const menuLimit = clampNumber(asNumber(input.limit), 1, MAX_LIMIT) ?? UNLIMITED_ROOT_ITEMS;
		const menuConfig: PageListResolvedMenuConfig = {
			sourceType,
			menuName: asNonEmptyString(input.menuName),
			heading,
			emptyState,
			style,
			limit: menuLimit,
			class: className,
			childDepthLimit: clampNumber(asNumber(input.childDepthLimit), 1, MAX_CHILD_DEPTH),
		};
		return menuConfig;
	}

	const collectionConfig: PageListResolvedCollectionConfig = {
		sourceType,
		collection: asNonEmptyString(input.collection),
		heading,
		emptyState,
		style,
		limit,
		class: className,
		sortField: isSortField(input.sortField)
			? input.sortField
			: normalizedSettings.defaultSortField,
		sortDirection: isSortDirection(input.sortDirection)
			? input.sortDirection
			: normalizedSettings.defaultSortDirection,
		includeDraftsInPreview:
			asBoolean(input.includeDraftsInPreview) ?? DEFAULT_INCLUDE_DRAFTS_IN_PREVIEW,
		showExcerpt: asBoolean(input.showExcerpt) ?? normalizedSettings.showExcerptByDefault,
		showDate: asBoolean(input.showDate) ?? normalizedSettings.showDateByDefault,
		collectionUrlPattern: asNonEmptyString(input.collectionUrlPattern),
	};

	return collectionConfig;
}
