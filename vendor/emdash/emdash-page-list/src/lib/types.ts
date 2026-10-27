export type PageListSourceType = "collection" | "menu";
export type PageListStyle = "bulleted" | "compact" | "card";
export type PageListSortField = "published_at" | "updated_at" | "created_at" | "slug";
export type PageListSortDirection = "asc" | "desc";

export interface PageListSettings {
	defaultSourceType?: PageListSourceType;
	defaultListStyle?: PageListStyle;
	defaultLimit?: number;
	defaultSortField?: PageListSortField;
	defaultSortDirection?: PageListSortDirection;
	showExcerptByDefault?: boolean;
	showDateByDefault?: boolean;
}

export interface PageListProps {
	sourceType?: PageListSourceType;
	collection?: string;
	menuName?: string;
	limit?: number;
	sortField?: PageListSortField;
	sortDirection?: PageListSortDirection;
	includeDraftsInPreview?: boolean;
	showExcerpt?: boolean;
	showDate?: boolean;
	heading?: string;
	emptyState?: string;
	style?: PageListStyle;
	childDepthLimit?: number;
	collectionUrlPattern?: string;
	class?: string;
}

export interface PageListBlockNode extends PageListProps {
	_type: "pageList";
	_key?: string;
}

interface PageListResolvedBase {
	sourceType: PageListSourceType;
	heading?: string;
	emptyState: string;
	style: PageListStyle;
	limit: number;
	class?: string;
}

export interface PageListResolvedCollectionConfig extends PageListResolvedBase {
	sourceType: "collection";
	collection?: string;
	sortField: PageListSortField;
	sortDirection: PageListSortDirection;
	includeDraftsInPreview: boolean;
	showExcerpt: boolean;
	showDate: boolean;
	collectionUrlPattern?: string;
}

export interface PageListResolvedMenuConfig extends PageListResolvedBase {
	sourceType: "menu";
	menuName?: string;
	childDepthLimit?: number;
}

export type PageListResolvedConfig =
	| PageListResolvedCollectionConfig
	| PageListResolvedMenuConfig;

export interface PageListRenderItem {
	id: string;
	label: string;
	href: string;
	excerpt?: string;
	date?: string | null;
	children: PageListRenderItem[];
	target?: string;
	titleAttr?: string;
	cssClasses?: string;
}
