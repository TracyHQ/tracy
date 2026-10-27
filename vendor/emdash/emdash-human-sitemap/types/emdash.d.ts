declare module "emdash" {
  export interface PluginDescriptor<TOptions = Record<string, unknown>> {
    id: string;
    version: string;
    entrypoint: string;
    options?: TOptions;
    format?: "standard" | "native";
    adminEntry?: string;
    componentsEntry?: string;
    adminPages?: Array<{ path: string; label: string; icon?: string }>;
    adminWidgets?: Array<{ id: string; title?: string; size?: "full" | "half" | "third" }>;
    capabilities?: string[];
    allowedHosts?: string[];
    storage?: Record<string, { indexes?: string[]; uniqueIndexes?: string[] }>;
  }

  export type SettingField = Record<string, unknown>;
  export type PortableTextBlockField = Record<string, unknown>;

  export interface ResolvedPlugin {
    id: string;
    version: string;
    capabilities: string[];
    admin: {
      settingsSchema?: Record<string, SettingField>;
      portableTextBlocks?: Array<Record<string, unknown>>;
    };
  }

  export function definePlugin<T extends ResolvedPlugin>(definition: T): T;

  export function getPluginSettings(pluginId: string): Promise<Record<string, unknown>>;
  export function getEmDashCollection(
    collection: string,
    filter?: {
      status?: "draft" | "published" | "archived";
      limit?: number;
      cursor?: string;
      where?: Record<string, string | string[]>;
      orderBy?: Record<string, "asc" | "desc">;
      locale?: string;
    },
  ): Promise<{
    entries: Array<{ id: string; data: Record<string, unknown> }>;
    nextCursor?: string;
    error?: Error;
  }>;
  export function getMenu(name: string): Promise<{
    name: string;
    label: string;
    items: Array<{ id: string; label: string; url: string; target?: string; children?: unknown[] }>;
  } | null>;
  export function getTaxonomyDefs(): Promise<Array<{ name: string; label: string; collections: string[]; hierarchical?: boolean }>>;
  export function getTaxonomyTerms(taxonomyName: string): Promise<Array<{
    id: string;
    name: string;
    slug: string;
    label: string;
    description?: string;
    count?: number;
    children?: unknown[];
  }>>;
}
