import type {
  HumanSitemapCollectionEntry,
  HumanSitemapCollectionFilter,
  HumanSitemapCollectionResult,
  HumanSitemapDataSource,
  HumanSitemapMenu,
  HumanSitemapMenuItem,
  HumanSitemapResolvedOptions,
  HumanSitemapSection,
  HumanSitemapSectionItem,
  HumanSitemapTaxonomyDef,
  HumanSitemapTaxonomyTerm,
  HumanSitemapViewAllLink,
  IncludedCollectionConfig,
  IncludedMenuConfig,
} from "./types.js";

const COLLECTION_QUERY_PAGE_SIZE = 100;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function humanizeIdentifier(value: string): string {
  return value
    .replace(/[-_]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

function getViewAllLink(
  links: Record<string, HumanSitemapViewAllLink>,
  sectionKey: string,
  alias: string,
): HumanSitemapViewAllLink | undefined {
  return links[sectionKey] ?? links[alias];
}

function countTreeItems(items: HumanSitemapSectionItem[]): number {
  return items.reduce((total, item) => total + 1 + countTreeItems(item.children), 0);
}

function limitTreeItems(
  items: HumanSitemapSectionItem[],
  maxItems: number,
): { items: HumanSitemapSectionItem[]; renderedCount: number } {
  let remaining = maxItems;

  const visit = (nodes: HumanSitemapSectionItem[]): HumanSitemapSectionItem[] => {
    const limited: HumanSitemapSectionItem[] = [];

    for (const node of nodes) {
      if (remaining <= 0) break;

      remaining -= 1;
      limited.push({
        ...node,
        children: visit(node.children),
      });
    }

    return limited;
  };

  const limitedItems = visit(items);
  return {
    items: limitedItems,
    renderedCount: maxItems - remaining,
  };
}

function pickEntryLabel(entry: HumanSitemapCollectionEntry): string {
  const candidates = [entry.data.title, entry.data.name, entry.data.label];

  for (const candidate of candidates) {
    if (isNonEmptyString(candidate)) {
      return candidate.trim();
    }
  }

  return humanizeIdentifier(entry.id);
}

function defaultCollectionHref(collection: string, entry: HumanSitemapCollectionEntry): string {
  if (collection === "pages") {
    return entry.id === "index" ? "/" : `/${entry.id}`;
  }

  return `/${collection}/${entry.id}`;
}

function defaultTaxonomyHref(taxonomy: string, term: HumanSitemapTaxonomyTerm): string {
  return `/${taxonomy}/${term.slug}`;
}

function mapMenuItems(items: HumanSitemapMenuItem[]): HumanSitemapSectionItem[] {
  return items.map((item) => ({
    label: item.label,
    href: item.url,
    children: mapMenuItems(item.children ?? []),
  }));
}

function mapTaxonomyTerms(
  taxonomy: string,
  terms: HumanSitemapTaxonomyTerm[],
  options: HumanSitemapResolvedOptions,
): HumanSitemapSectionItem[] {
  return terms.map((term) => ({
    label: term.label,
    href: options.taxonomyHrefBuilder?.(taxonomy, term) ?? defaultTaxonomyHref(taxonomy, term),
    description: term.description,
    count: term.count,
    children: mapTaxonomyTerms(taxonomy, term.children ?? [], options),
  }));
}

async function createDefaultDataSource(): Promise<HumanSitemapDataSource> {
  const { getEmDashCollection, getMenu, getTaxonomyDefs, getTaxonomyTerms } = await import("emdash");

  return {
    getEmDashCollection: async (
      collection: string,
      filter?: HumanSitemapCollectionFilter,
    ): Promise<HumanSitemapCollectionResult> => {
      const result = await getEmDashCollection(collection, filter);
      return {
        entries: result.entries.map((entry) => ({ id: entry.id, data: entry.data ?? {} })),
        nextCursor: result.nextCursor,
        error: result.error,
      };
    },
    getMenu: async (name: string): Promise<HumanSitemapMenu | null> => {
      const menu = await getMenu(name);
      if (!menu) return null;

      const normalize = (item: { id: string; label: string; url: string; target?: string; children?: unknown[] }): HumanSitemapMenuItem => ({
        id: item.id,
        label: item.label,
        url: item.url,
        target: item.target,
        children: Array.isArray(item.children)
          ? item.children.map((child) => normalize(child as { id: string; label: string; url: string; target?: string; children?: unknown[] }))
          : [],
      });

      return {
        name: menu.name,
        label: menu.label,
        items: menu.items.map((item) => normalize(item)),
      };
    },
    getTaxonomyDefs: async (): Promise<HumanSitemapTaxonomyDef[]> => {
      const defs = await getTaxonomyDefs();
      return defs.map((def) => ({
        name: def.name,
        label: def.label,
        collections: def.collections ?? [],
        hierarchical: def.hierarchical,
      }));
    },
    getTaxonomyTerms: async (taxonomyName: string): Promise<HumanSitemapTaxonomyTerm[]> => {
      const normalize = (term: {
        id: string;
        name: string;
        slug: string;
        label: string;
        description?: string;
        count?: number;
        children?: unknown[];
      }): HumanSitemapTaxonomyTerm => ({
        id: term.id,
        name: term.name,
        slug: term.slug,
        label: term.label,
        description: term.description,
        count: term.count,
        children: Array.isArray(term.children)
          ? term.children.map((child) =>
              normalize(
                child as {
                  id: string;
                  name: string;
                  slug: string;
                  label: string;
                  description?: string;
                  count?: number;
                  children?: unknown[];
                },
              ),
            )
          : [],
      });

      const terms = await getTaxonomyTerms(taxonomyName);
      return terms.map((term) => normalize(term));
    },
  };
}

function collectionOrderCandidates(sort: HumanSitemapResolvedOptions["defaultSort"]) {
  if (sort === "date") {
    return [{ published_at: "desc" }, { created_at: "desc" }] as const;
  }

  return [{ title: "asc" }, { name: "asc" }, { label: "asc" }, { slug: "asc" }] as const;
}

async function queryCollectionWithFallback(
  source: HumanSitemapDataSource,
  collection: string,
  filter: Omit<HumanSitemapCollectionFilter, "orderBy">,
  sort: HumanSitemapResolvedOptions["defaultSort"],
): Promise<HumanSitemapCollectionResult> {
  let lastError: Error | undefined;

  for (const orderBy of collectionOrderCandidates(sort)) {
    const result = await source.getEmDashCollection(collection, { ...filter, orderBy });
    if (!result.error) {
      return result;
    }

    lastError = result.error;
  }

  return { entries: [], error: lastError };
}

async function buildCollectionSection(
  collectionConfig: IncludedCollectionConfig,
  options: HumanSitemapResolvedOptions,
  source: HumanSitemapDataSource,
): Promise<HumanSitemapSection | null> {
  const label = collectionConfig.label ?? humanizeIdentifier(collectionConfig.slug);
  const key = `collection:${collectionConfig.slug}`;

  if (options.showCounts) {
    const items: HumanSitemapSectionItem[] = [];
    let totalCount = 0;
    let cursor: string | undefined;

    do {
      const result = await queryCollectionWithFallback(
        source,
        collectionConfig.slug,
        {
          cursor,
          limit: COLLECTION_QUERY_PAGE_SIZE,
        },
        options.defaultSort,
      );

      if (result.error) {
        return null;
      }

      totalCount += result.entries.length;
      for (const entry of result.entries) {
        if (items.length >= options.maxItemsPerSection) break;
        items.push({
          label: pickEntryLabel(entry),
          href:
            options.collectionHrefBuilder?.(collectionConfig.slug, entry) ??
            defaultCollectionHref(collectionConfig.slug, entry),
          children: [],
        });
      }

      cursor = result.nextCursor;
    } while (cursor);

    if (items.length === 0) return null;

    return {
      key,
      kind: "collection",
      label,
      items,
      totalCount,
      renderedCount: items.length,
      hasOverflow: totalCount > items.length,
      viewAllLink: getViewAllLink(options.viewAllLinks, key, collectionConfig.slug),
    };
  }

  const result = await queryCollectionWithFallback(
    source,
    collectionConfig.slug,
    {
      limit: options.maxItemsPerSection + 1,
    },
    options.defaultSort,
  );

  if (result.error) {
    return null;
  }

  const displayEntries = result.entries.slice(0, options.maxItemsPerSection);
  if (displayEntries.length === 0) return null;

  const items = displayEntries.map((entry) => ({
    label: pickEntryLabel(entry),
    href:
      options.collectionHrefBuilder?.(collectionConfig.slug, entry) ??
      defaultCollectionHref(collectionConfig.slug, entry),
    children: [],
  }));

  const hasOverflow = result.entries.length > options.maxItemsPerSection || !!result.nextCursor;

  return {
    key,
    kind: "collection",
    label,
    items,
    totalCount: hasOverflow ? undefined : items.length,
    renderedCount: items.length,
    hasOverflow,
    viewAllLink: getViewAllLink(options.viewAllLinks, key, collectionConfig.slug),
  };
}

async function buildMenuSection(
  menuConfig: IncludedMenuConfig,
  options: HumanSitemapResolvedOptions,
  source: HumanSitemapDataSource,
): Promise<HumanSitemapSection | null> {
  const menu = await source.getMenu(menuConfig.name);
  if (!menu || menu.items.length === 0) return null;

  const items = mapMenuItems(menu.items);
  const renderedCount = countTreeItems(items);

  return {
    key: `menu:${menuConfig.name}`,
    kind: "menu",
    label: menuConfig.label ?? menu.label ?? humanizeIdentifier(menuConfig.name),
    items,
    totalCount: renderedCount,
    renderedCount,
    hasOverflow: false,
    viewAllLink: getViewAllLink(
      options.viewAllLinks,
      `menu:${menuConfig.name}`,
      menuConfig.name,
    ),
  };
}

function shouldIncludeTaxonomy(
  taxonomy: HumanSitemapTaxonomyDef,
  configuredCollections: IncludedCollectionConfig[],
): boolean {
  if (configuredCollections.length === 0) {
    return true;
  }

  if (taxonomy.collections.length === 0) {
    return true;
  }

  const allowed = new Set(configuredCollections.map((collection) => collection.slug));
  return taxonomy.collections.some((collection) => allowed.has(collection));
}

async function buildTaxonomySections(
  options: HumanSitemapResolvedOptions,
  source: HumanSitemapDataSource,
): Promise<HumanSitemapSection[]> {
  const defs = await source.getTaxonomyDefs();
  const filteredDefs = defs
    .filter((taxonomy) => shouldIncludeTaxonomy(taxonomy, options.includedCollections))
    .sort((left, right) => left.label.localeCompare(right.label));

  const sections: Array<HumanSitemapSection | null> = await Promise.all(
    filteredDefs.map(async (taxonomy) => {
      const terms = await source.getTaxonomyTerms(taxonomy.name);
      if (terms.length === 0) return null;

      const mappedTerms = mapTaxonomyTerms(taxonomy.name, terms, options);
      const totalCount = countTreeItems(mappedTerms);
      const limited = limitTreeItems(mappedTerms, options.maxItemsPerSection);
      if (limited.items.length === 0) return null;

      return {
        key: `taxonomy:${taxonomy.name}`,
        kind: "taxonomy" as const,
        label: taxonomy.label,
        items: limited.items,
        totalCount,
        renderedCount: limited.renderedCount,
        hasOverflow: totalCount > limited.renderedCount,
        viewAllLink: getViewAllLink(
          options.viewAllLinks,
          `taxonomy:${taxonomy.name}`,
          taxonomy.name,
        ),
      };
    }),
  );

  return sections.filter((section): section is HumanSitemapSection => section !== null);
}

export async function buildHumanSitemapData(
  options: HumanSitemapResolvedOptions,
  dataSource?: HumanSitemapDataSource,
): Promise<HumanSitemapSection[]> {
  const source = dataSource ?? (await createDefaultDataSource());

  const collectionSections = options.showCollections
    ? await Promise.all(
        options.includedCollections.map((collection) =>
          buildCollectionSection(collection, options, source),
        ),
      )
    : [];

  const menuSections = options.showMenus
    ? await Promise.all(
        options.includedMenus.map((menu) => buildMenuSection(menu, options, source)),
      )
    : [];

  const taxonomySections = options.showTaxonomies
    ? await buildTaxonomySections(options, source)
    : [];

  return [...collectionSections, ...menuSections, ...taxonomySections].filter(
    (section): section is HumanSitemapSection => section !== null,
  );
}
