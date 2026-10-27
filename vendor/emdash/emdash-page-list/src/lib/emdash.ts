import * as emdashModule from "emdash";

export interface EmdashPluginDescriptor<TOptions = Record<string, unknown>> {
	id: string;
	version: string;
	entrypoint: string;
	options?: TOptions;
	format?: "standard" | "native";
	adminEntry?: string;
	componentsEntry?: string;
	adminPages?: Array<{ path: string; label: string; icon?: string }>;
	adminWidgets?: Array<{ id: string; title: string; size?: string }>;
	capabilities?: string[];
	allowedHosts?: string[];
	storage?: Record<string, { indexes?: string[]; uniqueIndexes?: string[] }>;
}

export interface EmdashResolvedPlugin {
	id: string;
	version: string;
	capabilities: string[];
	allowedHosts: string[];
	storage: Record<string, unknown>;
	hooks: Record<string, unknown>;
	routes: Record<string, unknown>;
	admin: Record<string, unknown>;
}

export interface EmdashCollectionResult<T = Record<string, unknown>> {
	entries: Array<{ id: string; data: T }>;
	error?: Error;
}

export interface EmdashMenuItem {
	id: string;
	label: string;
	url: string;
	target?: string;
	titleAttr?: string;
	cssClasses?: string;
	children: EmdashMenuItem[];
}

export interface EmdashMenu {
	id: string;
	name: string;
	label: string;
	items: EmdashMenuItem[];
}

export interface EmdashCollectionInfo {
	id: string;
	slug: string;
	label: string;
	urlPattern?: string;
}

type DefinePluginInput = {
	id: string;
	version: string;
	capabilities?: string[];
	allowedHosts?: string[];
	storage?: Record<string, unknown>;
	hooks?: Record<string, unknown>;
	routes?: Record<string, unknown>;
	admin?: {
		entry?: string;
		settingsSchema?: Record<string, unknown>;
		pages?: Array<{ path: string; label: string; icon?: string }>;
		widgets?: Array<{ id: string; title: string; size?: string }>;
		portableTextBlocks?: Array<{
			type: string;
			label: string;
			icon?: string;
			description?: string;
			placeholder?: string;
			fields?: Array<Record<string, unknown>>;
		}>;
	};
};

type EmdashRuntime = {
	definePlugin: (definition: DefinePluginInput) => EmdashResolvedPlugin;
	getPluginSettings: (pluginId: string) => Promise<Record<string, unknown>>;
	getEmDashCollection: <T = Record<string, unknown>>(
		type: string,
		filter?: {
			status?: "draft" | "published" | "archived";
			limit?: number;
			cursor?: string;
			where?: Record<string, string | string[]>;
			orderBy?: Record<string, "asc" | "desc">;
			locale?: string;
		},
	) => Promise<EmdashCollectionResult<T>>;
	getMenu: (name: string) => Promise<EmdashMenu | null>;
	getCollectionInfo: (slug: string) => Promise<EmdashCollectionInfo | null>;
};

const emdash = emdashModule as unknown as EmdashRuntime;

export const definePlugin = emdash.definePlugin;
export const getPluginSettings = emdash.getPluginSettings;
export const getEmDashCollection = emdash.getEmDashCollection;
export const getMenu = emdash.getMenu;
export const getCollectionInfo = emdash.getCollectionInfo;
