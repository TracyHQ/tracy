import { getRequestContext } from "emdash/request-context";

import { getCollectionInfo, getEmDashCollection } from "./emdash.js";
import type { PageListRenderItem, PageListResolvedCollectionConfig } from "./types.js";

const ID_PLACEHOLDER = /\{id\}/g;
const SLUG_PLACEHOLDER = /\{slug\}/g;

type ContentEntryLike = {
	id: string;
	data: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function getString(data: Record<string, unknown>, key: string): string | undefined {
	const value = data[key];
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function interpolateCollectionUrlPattern(
	pattern: string,
	params: { id: string; slug: string },
): string {
	return pattern
		.replace(ID_PLACEHOLDER, params.id)
		.replace(SLUG_PLACEHOLDER, params.slug);
}

export function resolveCollectionItemHref(
	config: PageListResolvedCollectionConfig,
	params: { id: string; slug: string },
): string {
	if (config.collectionUrlPattern) {
		const href = interpolateCollectionUrlPattern(config.collectionUrlPattern, params);
		return href.startsWith("/") ? href : `/${href.replace(/^\/+/, "")}`;
	}

	if (!config.collection) return "#";
	return `/${config.collection}/${params.slug}`;
}

export function getCollectionItemLabel(
	data: Record<string, unknown>,
	slug: string,
	fallbackId: string,
): string {
	return (
		getString(data, "navigationTitle") ??
		getString(data, "title") ??
		getString(data, "name") ??
		getString(data, "label") ??
		slug ??
		fallbackId
	);
}

export function getCollectionItemExcerpt(data: Record<string, unknown>): string | undefined {
	return (
		getString(data, "excerpt") ??
		getString(data, "description") ??
		getString(data, "summary") ??
		getString(data, "dek")
	);
}

export function getCollectionItemDate(data: Record<string, unknown>): string | null {
	return (
		getString(data, "publishedAt") ??
		getString(data, "published_at") ??
		getString(data, "updatedAt") ??
		getString(data, "updated_at") ??
		getString(data, "createdAt") ??
		getString(data, "created_at") ??
		null
	);
}

export function normalizeCollectionEntry(
	entry: ContentEntryLike,
	config: PageListResolvedCollectionConfig,
): PageListRenderItem | null {
	const data = asRecord(entry.data);
	const slug = entry.id;
	if (!slug) return null;

	const id = getString(data, "id") ?? slug;
	return {
		id,
		label: getCollectionItemLabel(data, slug, id),
		href: resolveCollectionItemHref(config, { id, slug }),
		excerpt: getCollectionItemExcerpt(data),
		date: getCollectionItemDate(data),
		children: [],
	};
}

export async function loadCollectionItems(
	config: PageListResolvedCollectionConfig,
): Promise<PageListRenderItem[]> {
	if (!config.collection) return [];

	const requestContext = getRequestContext();
	const shouldShowDrafts = Boolean(
		(requestContext?.preview || requestContext?.editMode) && config.includeDraftsInPreview,
	);

	const collectionInfo = await getCollectionInfo(config.collection);
	const resolvedConfig =
		collectionInfo?.urlPattern && !config.collectionUrlPattern
			? { ...config, collectionUrlPattern: collectionInfo.urlPattern }
			: config;

	const { entries, error } = await getEmDashCollection(config.collection, {
		status: shouldShowDrafts ? undefined : "published",
		limit: config.limit,
		orderBy: { [config.sortField]: config.sortDirection },
	});

	if (error) {
		if (import.meta.env.DEV) {
			console.warn(`[page-list] Failed to load collection "${config.collection}":`, error);
		}
		return [];
	}

	return entries
		.map((entry: ContentEntryLike) => normalizeCollectionEntry(entry, resolvedConfig))
		.filter((item: PageListRenderItem | null): item is PageListRenderItem => item !== null);
}
