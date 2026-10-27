// site-model.mjs — emit the neutral source contract alongside the WordPress spec-pack.
//
// WHY THIS FILE EXISTS. Tracy builds customer sites on three CMSes, and each skill used to read a
// source its own way. ADR 0016 of TCH splits that in two: one neutral description of what a source
// SAYS (`site-model.json`, this file), and one compiler per CMS that turns it into storage. An
// adapter written once then serves all three.
//
// 🔒 THIS IS NOT A COPY OF THE EMDASH ADAPTER. It is a SECOND adapter for the same schema, and it
// reads better data: the Joomla article HTML as authored (`introtext`/`fulltext`), before
// html-to-blocks turns it into WordPress markup. A model built here therefore carries no foreign
// vocabulary at all — nothing has to be undone downstream.
//
// 🔒 THE SCHEMA STRING IS DUPLICATED ON PURPOSE, AND GUARDED ELSEWHERE. Three skills live in three
// repositories; none may import from another (ADR 0006: a dependency never points at a live repo).
// So each declares the contract version it speaks, and TCH — the one tree that holds all three —
// runs the gate that proves they still agree. Change this string only together with that gate.
import { basename } from 'node:path'

export const SITE_MODEL_SCHEMA = 'tracy-site-model/v1'

const slug = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'item'

const key = (s) => slug(s).replace(/-/g, '_')

/** A file name, not a route: where a CMS puts its uploads is that CMS's business. */
const fileOf = (src) => (src ? basename(String(src).split('?')[0].split('#')[0]) : null)

/** What a source value IS — not which widget edits it, which is the compiler's decision. */
function fieldKind(name, value) {
  if (/(^|[-_])(image|logo|photo|cover|thumb)([-_]|$)/.test(name)) return 'image'
  if (/(^|[-_])(url|link|href)([-_]|$)/.test(name)) return 'url'
  if (/(^|[-_])email([-_]|$)/.test(name)) return 'email'
  if (typeof value === 'string' && (value.includes('</p>') || value.length > 220)) return 'prose'
  return 'text'
}

/** Rewrite every image reference to a bare file name and report what was found. */
function collectImages(html, onFile) {
  return String(html ?? '').replace(/(src|href)="([^"]+\.(?:png|jpe?g|gif|webp|avif|svg))"/gi, (_, attr, src) => {
    const file = fileOf(src)
    if (file) onFile(file)
    return `${attr}="${file}"`
  })
}

/**
 * Build the neutral model from the same data the spec-pack was built from.
 *
 * `arts` are Joomla articles as authored; `wpPages`, `sectionsAcm`, `menus`, `redirects`, `cats`
 * and `routes` are the structures buildSpecPack already computed.
 */
export function buildSiteModel({ tpl, site, arts, cats, catById, wpPages, archives, sectionsAcm, menus, redirects, isPageArticle, postPath }) {
  const locale = 'en'
  const media = new Map()
  const useMedia = (src, alt, usedBy) => {
    const file = fileOf(src)
    if (!file) return null
    const known = media.get(file) ?? { file, alt: {}, usedBy: [] }
    if (alt) known.alt[locale] = alt
    if (usedBy) known.usedBy.push(usedBy)
    media.set(file, known)
    return file
  }

  const types = [
    {
      name: 'pages',
      mode: 'list',
      label: { [locale]: 'Pages' },
      fields: [
        { name: 'title', type: 'text' },
        { name: 'body', type: 'prose' },
        { name: 'view', type: 'text' }
      ]
    },
    {
      name: 'posts',
      mode: 'list',
      label: { [locale]: 'Posts' },
      fields: [
        { name: 'title', type: 'text' },
        { name: 'excerpt', type: 'prose' },
        { name: 'body', type: 'prose' },
        { name: 'date', type: 'date' },
        { name: 'cover', type: 'image' }
      ]
    }
  ]

  const records = []

  for (const page of wpPages ?? []) {
    const pageSlug = page.slug ?? slug(page.title)
    records.push({
      type: 'pages',
      slug: pageSlug,
      locale,
      status: page.status === 'publish' ? 'published' : 'draft',
      values: {
        title: page.title ?? '',
        // A composed page has no body of its own: its words live in the sections below it.
        body: '',
        view: page.view ?? ''
      }
    })
  }

  for (const a of arts ?? []) {
    if (isPageArticle(a) || a.status === 'trash') continue
    const postSlug = slug(a.title)
    const cat = catById?.get(a.catid)
    const body = collectImages(
      [a.introtext, a.fulltext].filter((p) => p && p.trim()).join('\n'),
      (file) => useMedia(file, null, `posts/${postSlug}#body`)
    )
    const cover = useMedia(a.images?.intro || a.images?.full, a.images?.introAlt || a.images?.fullAlt, `posts/${postSlug}#cover`)
    records.push({
      type: 'posts',
      slug: postSlug,
      locale,
      status: a.status === 'publish' ? 'published' : 'draft',
      ...(cat?.wpSlug ? { terms: { category: [cat.wpSlug] } } : {}),
      values: {
        title: a.title ?? '',
        excerpt: a.metadesc ?? '',
        body,
        date: a.publishUp ?? a.created ?? '',
        ...(cover ? { cover } : {})
      }
    })
  }

  // ── one type per section kind ──────────────────────────────────────────────
  const kinds = new Map()
  for (const acm of sectionsAcm ?? []) {
    const kind = key(acm.type)
    const bucket = kinds.get(kind) ?? { fields: new Map(), itemFields: new Map(), instances: [] }
    for (const [k, v] of Object.entries(acm.fields ?? {})) if (!bucket.fields.has(k)) bucket.fields.set(k, fieldKind(k, v))
    for (const item of acm.items ?? []) {
      for (const [k, v] of Object.entries(item)) if (!bucket.itemFields.has(k)) bucket.itemFields.set(k, fieldKind(k, v))
    }
    bucket.instances.push(acm)
    kinds.set(kind, bucket)
  }
  for (const [kind, bucket] of kinds) {
    const fields = [...bucket.fields].map(([name, type]) => ({ name: key(name), type }))
    if (bucket.itemFields.size > 0) {
      fields.push({ name: 'items', type: 'group', fields: [...bucket.itemFields].map(([name, type]) => ({ name: key(name), type })) })
    }
    types.push({ name: kind, mode: 'list', label: { [locale]: kind.replace(/_/g, ' ') }, fields })

    const used = new Set()
    for (const acm of bucket.instances) {
      let s = slug(String(acm.title ?? '').replace(/^\[[^\]]+\]\s*/, '')) || `${kind}-${acm.id}`
      while (used.has(s)) s = `${s}-${acm.id}`
      used.add(s)
      const values = {}
      for (const [k, v] of Object.entries(acm.fields ?? {})) {
        const name = key(k)
        values[name] = fieldKind(k, v) === 'image' ? (useMedia(v, null, `${kind}/${s}#${name}`) ?? '') : v
      }
      if (acm.items?.length) {
        values.items = acm.items.map((item) => Object.fromEntries(Object.entries(item).map(([k, v]) => [key(k), v])))
      }
      records.push({ type: kind, slug: s, locale, status: acm.published ? 'published' : 'draft', values })
    }
  }

  // ── taxonomy, menus, routes ────────────────────────────────────────────────
  const taxonomies = (cats ?? []).length
    ? [
        {
          name: 'category',
          label: { [locale]: 'Categories' },
          hierarchical: true,
          appliesTo: ['posts'],
          terms: cats.map((c) => ({ slug: c.wpSlug ?? slug(c.title), label: { [locale]: c.title } }))
        }
      ]
    : []

  const paths = new Set()
  const outRoutes = []
  const addRoute = (r) => {
    if (!r.path || paths.has(r.path)) return
    paths.add(r.path)
    outRoutes.push(r)
  }
  // Routes come from the pages this adapter RESOLVED, not from the raw menu paths in the
  // database. The two differ whenever a category was renamed (D2: `resources/mag-procurement`
  // became `/resources/website-planning`), and the menu already carries the new name — so reading
  // the raw path here would declare routes nothing links to, while every renamed menu entry
  // points at a route that "does not exist". Measured on a live Tracy Base: three such entries.
  for (const page of wpPages ?? []) addRoute({ path: page.path, kind: 'page' })
  for (const archive of archives ?? []) addRoute({ path: archive.path, kind: 'list', type: 'posts' })
  for (const a of arts ?? []) {
    if (isPageArticle(a) || a.status === 'trash') continue
    addRoute({ path: postPath(a), kind: 'detail', type: 'posts', slug: slug(a.title) })
  }

  const items = (nodes) =>
    (nodes ?? []).map((n) => ({
      label: { [locale]: n.label ?? '' },
      path: n.url ?? '',
      // Joomla's heading is a group label with no destination. Record it; what each CMS shows for
      // one is that compiler's call, not this adapter's.
      ...(n.type === 'heading' ? { kind: 'heading' } : {}),
      ...(n.children?.length ? { children: items(n.children) } : {})
    }))

  useMedia(tpl?.site?.site_logo, tpl?.site?.site_name, null)

  return {
    $schema: SITE_MODEL_SCHEMA,
    source: { kind: 'joomla', parity: 'measured', origin: tpl?.name ?? null, capturedAt: new Date().toISOString() },
    locales: { default: locale, all: [locale] },
    site: {
      title: { [locale]: tpl?.site?.site_name ?? 'Site' },
      tagline: { [locale]: tpl?.site?.site_slogan ?? '' },
      postsPerPage: 10
    },
    types,
    taxonomies,
    records,
    menus: (menus ?? []).map((m) => ({
      name: slug(m.menutype ?? m.title),
      label: { [locale]: m.title ?? m.menutype },
      items: items((m.items ?? []).filter((i) => i.published !== false))
    })),
    routes: outRoutes,
    redirects: (redirects?.rules ?? []).map((r) => ({ from: r.from, to: r.to, status: r.status ?? 301 })),
    media: [...media.values()],
    tokens: {},
    facts: []
  }
}
