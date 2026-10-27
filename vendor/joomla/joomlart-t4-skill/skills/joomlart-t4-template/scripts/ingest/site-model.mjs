// site-model.mjs — emit the neutral source contract beside the spec-pack (ADR 0016 of TCH).
//
// WHY A THIRD ADAPTER WRITES THE SAME SHAPE. Tracy builds customer sites on three CMSes. Each
// skill used to read a source its own way, so every new input format cost three implementations
// and a WordPress source could be read by none of them. The contract splits the pipeline in two:
// one neutral description of what a SOURCE says, and one compiler per CMS. This file is this
// skill's half of the first part.
//
// 🔒 WHAT AN HTML SOURCE CAN AND CANNOT SAY. A folder of pages is a thin source: it carries pages,
// routes, a palette and type — but no content model, because nobody wrote one. from-html says so
// rather than inventing types: the model it emits has `pages` and nothing else, and Phase 2 of
// this skill is where a human decomposes those pages into sections. A model that guessed would
// hand the other two skills confident nonsense.
//
// 🔒 THE SCHEMA STRING IS DECLARED, NOT IMPORTED. Three skills, three repositories, and no
// dependency may point at a live repo (ADR 0006). TCH vendors all three and runs the gate that
// proves they still agree — scripts/check-site-model.ts there. Change this string only with it.
export const SITE_MODEL_SCHEMA = 'tracy-site-model/v1';

const slug = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'page';

/**
 * Build the neutral model from a page-map this adapter just produced.
 *
 * `kind` is what the source was (`html` for a bundle or folder, `url` for a live site); `parity`
 * says whether the output can be measured against it two-sided, or only against declared numbers.
 */
export function buildSiteModel(pageMap, { kind = 'html', parity = 'measured', origin = null } = {}) {
  const locale = 'en';
  const pages = pageMap.pages ?? [];

  const records = pages.map((p) => ({
    type: 'pages',
    slug: slug(p.title ?? p.file ?? p.path),
    locale,
    status: 'published',
    values: {
      title: p.title ?? '',
      // A page's words still live in its HTML at this stage; decomposition into sections is
      // Phase 2 of this skill, and the contract would rather be empty than wrong.
      body: '',
      view: p.view ?? ''
    }
  }));

  const seen = new Set();
  const routes = [];
  for (const p of pages) {
    const path = p.path ?? (p.file ? `/${slug(p.file.replace(/\.html?$/i, ''))}` : null);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    routes.push({ path, kind: 'page' });
  }

  const menus = (pageMap.menus ?? []).map((m) => ({
    name: slug(m.name ?? m.title ?? 'main'),
    label: { [locale]: m.title ?? m.name ?? 'Main' },
    items: (m.items ?? []).map((i) => ({
      label: { [locale]: i.label ?? i.title ?? '' },
      path: i.url ?? i.path ?? ''
    }))
  }));

  return {
    $schema: SITE_MODEL_SCHEMA,
    source: { kind, parity, origin, capturedAt: new Date().toISOString() },
    locales: { default: locale, all: [locale] },
    site: {
      title: { [locale]: pageMap.template?.title ?? pageMap.template?.name ?? 'Site' },
      tagline: { [locale]: pageMap.theme?.tagline ?? '' }
    },
    types: [
      {
        name: 'pages',
        mode: 'list',
        label: { [locale]: 'Pages' },
        fields: [
          { name: 'title', type: 'text' },
          { name: 'body', type: 'prose' },
          { name: 'view', type: 'text' }
        ]
      }
    ],
    taxonomies: [],
    records,
    menus,
    routes,
    redirects: [],
    media: [],
    // The palette and type this adapter did read: a compiler may use them, and a source that
    // declared none leaves the object empty rather than inventing a default.
    tokens: {
      ...(pageMap.theme?.palette ? { palette: pageMap.theme.palette } : {}),
      ...(pageMap.theme?.fonts ? { fonts: pageMap.theme.fonts } : {})
    },
    facts: []
  };
}
