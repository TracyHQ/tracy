import { getMenu } from "./emdash.js";
import type { PageListRenderItem, PageListResolvedMenuConfig } from "./types.js";

type RuntimeMenuItem = {
	id: string;
	label: string;
	url: string;
	target?: string;
	titleAttr?: string;
	cssClasses?: string;
	children?: RuntimeMenuItem[];
};

function hasChildren(item: RuntimeMenuItem): item is RuntimeMenuItem & { children: RuntimeMenuItem[] } {
	return Array.isArray(item.children) && item.children.length > 0;
}

export function normalizeMenuItem(item: RuntimeMenuItem): PageListRenderItem {
	return {
		id: item.id,
		label: item.label,
		href: item.url,
		target: item.target,
		titleAttr: item.titleAttr,
		cssClasses: item.cssClasses,
		children: hasChildren(item) ? item.children.map(normalizeMenuItem) : [],
	};
}

export function pruneMenuItems(
	items: PageListRenderItem[],
	childDepthLimit?: number,
	currentDepth = 1,
): PageListRenderItem[] {
	return items.map((item) => ({
		...item,
		children:
			childDepthLimit && currentDepth >= childDepthLimit
				? []
				: pruneMenuItems(item.children, childDepthLimit, currentDepth + 1),
	}));
}

export function applyRootLimit(items: PageListRenderItem[], limit: number): PageListRenderItem[] {
	return items.slice(0, limit);
}

export async function loadMenuItems(
	config: PageListResolvedMenuConfig,
): Promise<PageListRenderItem[]> {
	if (!config.menuName) return [];

	const menu = await getMenu(config.menuName);
	if (!menu) {
		if (import.meta.env.DEV) {
			console.warn(`[page-list] Menu "${config.menuName}" was not found.`);
		}
		return [];
	}

	const normalizedItems = menu.items.map((item: RuntimeMenuItem) => normalizeMenuItem(item));
	return pruneMenuItems(applyRootLimit(normalizedItems, config.limit), config.childDepthLimit);
}
