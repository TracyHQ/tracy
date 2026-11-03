#!/usr/bin/env node
// Build the EmDash seed (schema + menus + taxonomies + text content) for Tracy Base from the
// snapshot of the Joomla source site, plus the media map the importer uses to upload images and
// patch image fields.
//
//   node tools/build-seed.mjs <source-dir> <seed-dir>
//
// <source-dir> is vendor/joomla/html/tracy_base: `data/*.json` is the database export (menus,
// categories, articles, modules, contact, tags), `images/` the files those records reference.
// Writes <seed-dir>/seed.json, media-map.json, field-map.json and copies the referenced media into
// <seed-dir>/media/. The seed carries NO media: on emdash 0.37 `$media` only downloads from a URL,
// so image fields are filled by tools/seed-apply.mjs after upload (Northgate DECISIONS D14).
//
// Every value is a literal from the export. Three kinds of source record feed the fields:
//   - articles (com_content): title/intro/fulltext/images -> string, portableText, image fields
//   - ACM modules (mod_ja_acm, `jatools-config` JSON): flat `section[key]: [values]` arrays ->
//     one field per key, parallel arrays zipped into repeater rows (`acm()` below)
//   - OpenDesign landing modules (mod_custom, HTML with data-od-block): parsed with htmlparser2
//     into the same field shapes (`od*()` below)
// The only rewrites are the platform-naming strings listed in REWRITES (content-gaps G6); each is
// recorded in field-map.json so the change is reviewable.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { parseDocument } from 'htmlparser2'
import { carryRolesIntoFieldMap, readPreviousFieldMap } from './carry-field-map-roles.mjs'

const args = process.argv.slice(2)
const [srcArg, outArg] = args
if (!srcArg || !outArg) {
  console.error('usage: build-seed.mjs <source-dir> <seed-dir>')
  process.exit(2)
}
const SRC = path.resolve(srcArg)
const OUT = path.resolve(outArg)
mkdirSync(OUT, { recursive: true })
const readJson = (f) => JSON.parse(readFileSync(path.join(SRC, 'data', f), 'utf8'))
const MENU = readJson('menu.json')
const CATS = readJson('categories.json')
const ARTICLES = readJson('articles.json')
const MODULES = readJson('modules.json')
const CONTACTS = readJson('contacts.json')
const TAGS = readJson('tags.json')
const TAGMAP = readJson('tagmap.json')
const LOCALE = 'en'

// ───────────────────────── helpers ─────────────────────────
let keyN = 0
const key = () => `k${(++keyN).toString(36)}`
const span = (text, marks = []) => ({ _type: 'span', _key: key(), text: String(text), marks })
const block = (children, style = 'normal', extra = {}) => ({
  _type: 'block',
  _key: key(),
  style,
  markDefs: [],
  children: Array.isArray(children) ? children : [span(children)],
  ...extra
})
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
const clean = (s) =>
  String(s ?? '')
    .replace(/\{loadposition [^}]*\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
const _slugify = (s) =>
  String(s)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
/** "2021-05-25 07:07:32" -> "2021-05-25T07:07:32.000Z" */
const isoDate = (s) => {
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (!m || m[1] === '0000') return null
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`
}

// Platform-naming copy that would be false on an EmDash site (content-gaps G6). Exact strings,
// applied to every string field; each application is recorded in field-map.json `rewrites`.
const REWRITES = [
  ['editable Joomla articles and modules', 'editable content and page sections in the admin'],
  ['native Joomla content and modules', 'editable content and page sections in the admin'],
  ['Joomla articles and modules', 'content and page sections in the admin']
]
const rewritesApplied = []
function rw(text, where) {
  let out = String(text ?? '')
  for (const [from, to] of REWRITES) {
    if (out.includes(from)) {
      out = out.split(from).join(to)
      rewritesApplied.push({ where, from, to })
    }
  }
  return out
}

// ───────────────────────── routes: Joomla link -> template path ─────────────────────────
// Joomla path (menu.path) -> template route (DECISIONS D6). Everything not listed is a page the
// template does not carry (content-gaps G1–G3) and resolves to '' (link omitted).
const CAT_SLUG = {
  16: 'content-guides',
  18: 'website-planning',
  19: 'website-operations',
  20: 'studio-notes',
  11: 'practical-guides',
  12: 'inside-the-studio',
  13: 'studio-life',
  10: 'people'
}
const PATHS = {
  home: '/',
  product: '/product',
  services: '/services',
  pricing: '/pricing',
  'resources/blog': '/blog',
  'resources/category-list': '/blog',
  'resources/all-categories': '/blog/topics',
  'resources/mag-procurement': '/blog/category/website-planning',
  'resources/mag-datacenter': '/blog/category/website-operations',
  'resources/mag-world': '/blog/category/studio-notes',
  'resources/style-guide': '/design-system',
  'resources/typography': '/design-system/typography',
  'resources/colors': '/design-system/colour',
  'resources/spacing': '/design-system/spacing',
  'resources/faq': '/help',
  'resources/contact': '/contact',
  'resources/single-contact': '/contact',
  'resources/search': '/search',
  'resources/home-2': '/home-2',
  'resources/home-variation': '/landing',
  'resources/home-onepage': '/onepage',
  'resources/marketing-samples': '/marketing',
  'company/about': '/about',
  'company/team': '/team',
  'company/careers': '/careers'
}
const menuById = new Map(MENU.map((m) => [String(m.id), m]))
const artById = new Map(ARTICLES.map((a) => [String(a.id), a]))
const unresolvedLinks = []
const slugOf = new Map() // article id -> { collection, slug } (filled while building)
function articlePath(id) {
  const s = slugOf.get(String(id))
  if (!s) return ''
  return s.collection === 'services'
    ? `/services/${s.slug}`
    : s.collection === 'people'
      ? `/team/${s.slug}`
      : `/blog/${s.slug}`
}
function menuPath(item) {
  if (!item) return ''
  if (item.type === 'url') return link(item.link)
  if (PATHS[item.path] !== undefined) return PATHS[item.path]
  if (item.path.startsWith('services/')) {
    const id = (item.link.match(/[?&]id=(\d+)/) || [])[1]
    return articlePath(id)
  }
  return ''
}
function link(href, where = '') {
  const h = String(href ?? '').trim()
  if (!h) return ''
  if (/^https?:\/\//.test(h)) return h
  if (h.startsWith('#')) return h
  let m = h.match(/^index\.php\?Itemid=(\d+)/)
  if (m) {
    const p = menuPath(menuById.get(m[1]))
    if (!p) unresolvedLinks.push({ where, href: h })
    return p
  }
  m = h.match(/^index\.php\?option=com_content&view=article&id=(\d+)/)
  if (m) {
    const p = articlePath(m[1])
    if (!p) unresolvedLinks.push({ where, href: h })
    return p
  }
  if (h.startsWith('/')) {
    const [p, hash = ''] = h.split('#')
    const joomla = p.replace(/^\//, '').replace(/\/$/, '')
    if (joomla === '') return '/' + (hash ? `#${hash}` : '')
    if (PATHS[joomla] !== undefined) return PATHS[joomla] + (hash ? `#${hash}` : '')
    unresolvedLinks.push({ where, href: h })
    return ''
  }
  unresolvedLinks.push({ where, href: h })
  return ''
}

// ───────────────────────── media ─────────────────────────
const media = new Map() // key -> { key, file, alt, mime, targets: [] }
const T = (collection, slug, p) => ({ collection, slug, locale: LOCALE, path: p })
function img(file, alt, target) {
  const f = String(file ?? '')
    .replace(/\\\//g, '/')
    .replace(/^\//, '')
    .split('#')[0]
    .split('?')[0]
  if (!f) return null
  if (!existsSync(path.join(SRC, f))) throw new Error(`media missing in source: ${f}`)
  const k = f.replace(/\.[a-z0-9]+$/i, '')
  if (!media.has(k)) {
    const ext = path.extname(f).toLowerCase()
    media.set(k, {
      key: k,
      file: f,
      alt: clean(alt) || '',
      mime:
        ext === '.png'
          ? 'image/png'
          : ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : ext === '.svg'
              ? 'image/svg+xml'
              : 'application/octet-stream',
      targets: []
    })
  }
  if (target) media.get(k).targets.push(target)
  return k
}

// ───────────────────────── HTML -> Portable Text ─────────────────────────
const isTag = (n) => n && n.type === 'tag'
const els = (n) => (n.children ?? []).filter(isTag)
function text(n) {
  if (!n) return ''
  if (n.type === 'text') return n.data
  if (n.type === 'tag' && n.name === 'br') return '\n'
  return (n.children ?? []).map(text).join('')
}
const txt = (n) => clean(text(n))
function findAll(n, name, out = []) {
  for (const c of n.children ?? []) {
    if (isTag(c)) {
      if (c.name === name) out.push(c)
      findAll(c, name, out)
    }
  }
  return out
}
const first = (n, name) => findAll(n, name)[0]
const parse = (html) => parseDocument(String(html ?? ''))

/** Inline children of an element -> Portable Text spans (+ link markDefs). */
function spansOf(node, markDefs, marks = []) {
  const out = []
  for (const c of node.children ?? []) {
    if (c.type === 'text') {
      const t = c.data.replace(/\s+/g, ' ')
      if (t) out.push(span(t, marks))
    } else if (isTag(c)) {
      if (c.name === 'br') out.push(span('\n', marks))
      else if (c.name === 'strong' || c.name === 'b') out.push(...spansOf(c, markDefs, [...marks, 'strong']))
      else if (c.name === 'em' || c.name === 'i') out.push(...spansOf(c, markDefs, [...marks, 'em']))
      else if (c.name === 'a') {
        const def = { _key: key(), _type: 'link', href: link(c.attribs.href, 'body') }
        markDefs.push(def)
        out.push(...spansOf(c, markDefs, [...marks, def._key]))
      } else out.push(...spansOf(c, markDefs, marks))
    }
  }
  // trim leading/trailing whitespace of the paragraph
  if (out.length) {
    out[0].text = out[0].text.replace(/^\s+/, '')
    out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, '')
  }
  return out.filter((s) => s.text !== '')
}
function blockOf(el, style = 'normal', extra = {}) {
  const markDefs = []
  const children = spansOf(el, markDefs)
  if (!children.length) return null
  const b = block(children, style, extra)
  b.markDefs = markDefs
  return b
}
/**
 * HTML body -> Portable Text blocks. Images become image blocks whose asset the importer fills
 * (target path `content[i].asset`); `imgTarget(i)` builds that target for the owning entry.
 */
function portable(html, imgTarget) {
  const doc = parse(clean(html))
  const blocks = []
  const walk = (node) => {
    for (const c of node.children ?? []) {
      if (!isTag(c)) {
        if (c.type === 'text' && c.data.trim()) blocks.push(block(c.data.trim()))
        continue
      }
      if (/^h[1-6]$/.test(c.name)) {
        const b = blockOf(c, c.name === 'h1' ? 'h2' : c.name)
        if (b) blocks.push(b)
      } else if (c.name === 'p') {
        const b = blockOf(c)
        if (b) blocks.push(b)
        for (const im of findAll(c, 'img'))
          blocks.push({ _type: 'image', _key: key(), alt: clean(im.attribs.alt), _src: im.attribs.src })
      } else if (c.name === 'ul' || c.name === 'ol') {
        for (const li of els(c).filter((x) => x.name === 'li')) {
          const b = blockOf(li, 'normal', { listItem: c.name === 'ul' ? 'bullet' : 'number', level: 1 })
          if (b) blocks.push(b)
        }
      } else if (c.name === 'blockquote') {
        const b = blockOf(c, 'blockquote')
        if (b) blocks.push(b)
      } else if (c.name === 'img') {
        blocks.push({ _type: 'image', _key: key(), alt: clean(c.attribs.alt), _src: c.attribs.src })
      } else if (c.name === 'script' || c.name === 'style') {
        // nothing
      } else walk(c)
    }
  }
  walk(doc)
  blocks.forEach((b, i) => {
    if (b._type === 'image') {
      img(b._src, b.alt, imgTarget ? imgTarget(i) : null)
      delete b._src
    }
  })
  return blocks
}

// ───────────────────────── ACM modules ─────────────────────────
const acmById = new Map()
const odById = new Map()
for (const m of MODULES) {
  const p = JSON.parse(m.params)
  if (p['jatools-config']) {
    let jc = p['jatools-config']
    try {
      jc = JSON.parse(jc)
    } catch {
      continue
    }
    const type = jc[':type'].replace('tracy:', '')
    const body = jc[type] ?? {}
    const fields = {}
    for (const [k, v] of Object.entries(body)) {
      if (!k.includes('[')) continue
      // `hero[title]` -> title ; `carousel[slide][slide-image]` -> slide-image
      const name = k
        .replace(/^[a-z-]+\[/, '')
        .replace(/\]$/, '')
        .replace(/^.*\]\[/, '')
      fields[name] = v
    }
    acmById.set(String(m.id), {
      id: m.id,
      title: m.title,
      type,
      fields,
      layout: jc[`jatools-layout-${type}`]
    })
  } else if (p.layout === 'tracy:od-landing') {
    odById.set(String(m.id), { id: m.id, title: m.title, content: m.content })
  }
}
function acm(id) {
  const a = acmById.get(String(id))
  if (!a) throw new Error(`ACM module ${id} not in export`)
  return a
}
/** Single value of an ACM key (first element of its array), rewritten (G6). */
const one = (a, k, where) => rw(clean((a.fields[k] ?? [''])[0]), `${where}.${k}`)
/** Zip parallel ACM arrays into repeater rows: rows(a, {title:'card-title', text:'card-text'}). */
function rows(a, map, where) {
  const keys = Object.values(map)
  const n = Math.max(...keys.map((k) => (a.fields[k] ?? []).length))
  const out = []
  for (let i = 0; i < n; i++) {
    const row = {}
    for (const [field, k] of Object.entries(map))
      row[field] = rw(clean((a.fields[k] ?? [])[i]), `${where}[${i}].${field}`)
    out.push(row)
  }
  return out
}

// ───────────────────────── field DSL ─────────────────────────
const f = (slug, label, type, extra = {}) => ({ slug, label, type, ...extra })
const str = (slug, label, extra) => f(slug, label, 'string', extra)
const txtF = (slug, label, extra) => f(slug, label, 'text', extra)
const image = (slug, label) => f(slug, label, 'image')
const int = (slug, label, extra) => f(slug, label, 'integer', extra)
const bool = (slug, label, dv = false) => f(slug, label, 'boolean', { defaultValue: dv })
const pt = (slug, label) => f(slug, label, 'portableText')
const rep = (slug, label, subFields) => f(slug, label, 'repeater', { validation: { subFields } })
const sel = (slug, label, options, dv) =>
  f(slug, label, 'select', { validation: { options }, defaultValue: dv ?? options[0] })

// ───────────────────────── section types (ACM) → fields + data ─────────────────────────
// Each section: def(prefix) -> field list, val(prefix, moduleId, coll, slug) -> data. Field names
// are `${prefix}_${key}` so one collection can hold several sections of the same type.
const P = (prefix, k) => (prefix ? `${prefix}_${k}` : k)
const SECTION = {
  hero: {
    def: (p) => [
      str(P(p, 'eyebrow'), 'Hero eyebrow'),
      str(P(p, 'title'), 'Hero title'),
      txtF(P(p, 'lead'), 'Hero lead'),
      str(P(p, 'cta1_label'), 'Primary button'),
      str(P(p, 'cta1_url'), 'Primary button URL'),
      str(P(p, 'cta2_label'), 'Secondary button'),
      str(P(p, 'cta2_url'), 'Secondary button URL'),
      image(P(p, 'image'), 'Hero image'),
      str(P(p, 'image_alt'), 'Hero image alt'),
      str(P(p, 'aside_label'), 'Aside label'),
      str(P(p, 'aside_badge'), 'Aside badge'),
      sel(P(p, 'aside_state'), 'Aside badge state', ['success', 'neutral', 'warning'], 'success'),
      rep(P(p, 'notes'), 'Aside notes', [str('text', 'Note')])
    ],
    val: (p, id, coll, _slug) => {
      const a = acm(id)
      const w = `${coll}.${P(p, '')}`
      return {
        [P(p, 'eyebrow')]: one(a, 'eyebrow', w),
        [P(p, 'title')]: one(a, 'title', w),
        [P(p, 'lead')]: one(a, 'lead', w),
        [P(p, 'cta1_label')]: one(a, 'btn-1-text', w),
        [P(p, 'cta1_url')]: link(one(a, 'btn-1-link', w), w),
        [P(p, 'cta2_label')]: one(a, 'btn-2-text', w),
        [P(p, 'cta2_url')]: link(one(a, 'btn-2-link', w), w),
        [P(p, 'image')]: null,
        [P(p, 'image_alt')]: one(a, 'hero-image-alt', w),
        [P(p, 'aside_label')]: one(a, 'aside-label', w),
        [P(p, 'aside_badge')]: one(a, 'aside-badge', w),
        [P(p, 'aside_state')]: one(a, 'aside-badge-state', w) || 'success',
        [P(p, 'notes')]: (a.fields.note ?? []).filter(Boolean).map((t) => ({ text: clean(t) })),
        _media: one(a, 'hero-image', w)
          ? [[one(a, 'hero-image', w), one(a, 'hero-image-alt', w), P(p, 'image')]]
          : []
      }
    }
  },
  chapter: {
    def: (p) => [
      str(P(p, 'statement'), 'Statement'),
      txtF(P(p, 'support'), 'Supporting text'),
      image(P(p, 'image'), 'Image'),
      str(P(p, 'image_alt'), 'Image alt'),
      str(P(p, 'link_label'), 'Link label'),
      str(P(p, 'link_url'), 'Link URL'),
      sel(P(p, 'link_style'), 'Link style', ['secondary', 'primary', 'text'], 'secondary')
    ],
    val: (p, id, coll) => {
      const a = acm(id)
      const w = `${coll}.${p}`
      return {
        [P(p, 'statement')]: one(a, 'statement', w),
        [P(p, 'support')]: one(a, 'support', w),
        [P(p, 'image')]: null,
        [P(p, 'image_alt')]: one(a, 'media-alt', w),
        [P(p, 'link_label')]: one(a, 'link-text', w),
        [P(p, 'link_url')]: link(one(a, 'link-url', w), w),
        [P(p, 'link_style')]: one(a, 'link-style', w) || 'secondary',
        _media: one(a, 'media', w) ? [[one(a, 'media', w), one(a, 'media-alt', w), P(p, 'image')]] : []
      }
    }
  },
  features: {
    def: (p) => [
      str(P(p, 'eyebrow'), 'Eyebrow'),
      str(P(p, 'title'), 'Title'),
      txtF(P(p, 'lead'), 'Lead'),
      str(P(p, 'spotlight_label'), 'Spotlight label'),
      rep(P(p, 'cards'), 'Cards', [
        str('title', 'Title'),
        txtF('text', 'Text'),
        str('link_label', 'Link label'),
        str('link_url', 'Link URL')
      ])
    ],
    val: (p, id, coll) => {
      const a = acm(id)
      const w = `${coll}.${p}`
      return {
        [P(p, 'eyebrow')]: one(a, 'eyebrow', w),
        [P(p, 'title')]: one(a, 'title', w),
        [P(p, 'lead')]: one(a, 'lead', w),
        [P(p, 'spotlight_label')]: one(a, 'spotlight-label', w),
        [P(p, 'cards')]: rows(
          a,
          { title: 'card-title', text: 'card-text', link_label: 'card-link-text', link_url: 'card-link-url' },
          `${w}.cards`
        ).map((r) => ({ ...r, link_url: link(r.link_url, w) }))
      }
    }
  },
  stats: {
    def: (p) => [
      str(P(p, 'eyebrow'), 'Eyebrow'),
      str(P(p, 'heading'), 'Heading'),
      rep(P(p, 'figures'), 'Figures', [str('value', 'Value'), str('caption', 'Caption')])
    ],
    val: (p, id, coll) => {
      const a = acm(id)
      const w = `${coll}.${p}`
      return {
        [P(p, 'eyebrow')]: one(a, 'eyebrow', w),
        [P(p, 'heading')]: one(a, 'heading', w),
        [P(p, 'figures')]: rows(a, { value: 'figure-value', caption: 'figure-caption' }, `${w}.figures`)
      }
    }
  },
  pricing: {
    def: (p) => [
      str(P(p, 'eyebrow'), 'Eyebrow'),
      str(P(p, 'heading'), 'Heading'),
      txtF(P(p, 'intro'), 'Intro'),
      rep(P(p, 'tiers'), 'Plans', [
        str('name', 'Name'),
        str('badge', 'Badge'),
        txtF('summary', 'Summary'),
        str('price', 'Price'),
        str('period', 'Period'),
        txtF('features', 'Features (one per line)'),
        str('cta_label', 'Button label'),
        str('cta_url', 'Button URL'),
        bool('recommended', 'Recommended')
      ])
    ],
    val: (p, id, coll) => {
      const a = acm(id)
      const w = `${coll}.${p}`
      return {
        [P(p, 'eyebrow')]: one(a, 'eyebrow', w),
        [P(p, 'heading')]: one(a, 'heading', w),
        [P(p, 'intro')]: one(a, 'intro', w),
        [P(p, 'tiers')]: rows(
          a,
          {
            name: 'tier-name',
            badge: 'tier-badge',
            summary: 'tier-summary',
            price: 'tier-price',
            period: 'tier-period',
            features: 'tier-features',
            cta_label: 'tier-action-label',
            cta_url: 'tier-action-link',
            recommended: 'tier-recommended'
          },
          `${w}.tiers`
        ).map((r, i) => ({
          ...r,
          features: String((a.fields['tier-features'] ?? [])[i] ?? '').trim(),
          cta_url: link(r.cta_url, w),
          recommended: r.recommended === '1'
        }))
      }
    }
  },
  testimonials: {
    def: (p) => [
      str(P(p, 'eyebrow'), 'Eyebrow'),
      str(P(p, 'heading'), 'Heading'),
      rep(P(p, 'quotes'), 'Quotes', [txtF('quote', 'Quote'), str('name', 'Name'), str('role', 'Role')])
    ],
    val: (p, id, coll) => {
      const a = acm(id)
      const w = `${coll}.${p}`
      return {
        [P(p, 'eyebrow')]: one(a, 'eyebrow', w),
        [P(p, 'heading')]: one(a, 'heading', w),
        [P(p, 'quotes')]: rows(a, { quote: 'quote', name: 'quote-name', role: 'quote-role' }, `${w}.quotes`)
      }
    }
  },
  clients: {
    def: (p) => [
      str(P(p, 'eyebrow'), 'Eyebrow'),
      rep(P(p, 'marks'), 'Client marks', [image('image', 'Mark'), str('name', 'Name'), str('url', 'URL')])
    ],
    val: (p, id, coll, _slug) => {
      const a = acm(id)
      const w = `${coll}.${p}`
      const marks = rows(a, { image: 'mark-image', name: 'mark-name', url: 'mark-link' }, `${w}.marks`)
      const _media = []
      marks.forEach((r, i) => {
        if (r.image) _media.push([r.image, r.name, `${P(p, 'marks')}[${i}].image`])
        r.image = null
        r.url = link(r.url, w)
      })
      return { [P(p, 'eyebrow')]: one(a, 'eyebrow', w), [P(p, 'marks')]: marks, _media }
    }
  },
  cta: {
    def: (p) => [
      str(P(p, 'statement'), 'Statement'),
      txtF(P(p, 'support'), 'Supporting text'),
      str(P(p, 'btn_label'), 'Button label'),
      str(P(p, 'btn_url'), 'Button URL'),
      str(P(p, 'link_label'), 'Link label'),
      str(P(p, 'link_url'), 'Link URL')
    ],
    val: (p, id, coll) => {
      const a = acm(id)
      const w = `${coll}.${p}`
      return {
        [P(p, 'statement')]: one(a, 'statement', w),
        [P(p, 'support')]: one(a, 'support', w),
        [P(p, 'btn_label')]: one(a, 'btn-text', w),
        [P(p, 'btn_url')]: link(one(a, 'btn-link', w), w),
        [P(p, 'link_label')]: one(a, 'link-text', w),
        [P(p, 'link_url')]: link(one(a, 'link-url', w), w)
      }
    }
  },
  team: {
    def: (p) => [
      str(P(p, 'eyebrow'), 'Eyebrow'),
      str(P(p, 'heading'), 'Heading'),
      str(P(p, 'link_label'), 'Link label'),
      rep(P(p, 'members'), 'Members', [
        image('image', 'Portrait'),
        str('name', 'Name'),
        str('role', 'Role'),
        txtF('text', 'Bio'),
        str('url', 'Profile URL')
      ])
    ],
    val: (p, id, coll) => {
      const a = acm(id)
      const w = `${coll}.${p}`
      const members = rows(
        a,
        {
          image: 'member-portrait',
          name: 'member-name',
          role: 'member-role',
          text: 'member-bio',
          url: 'member-link'
        },
        `${w}.members`
      )
      const _media = []
      members.forEach((r, i) => {
        if (r.image) _media.push([r.image, r.name, `${P(p, 'members')}[${i}].image`])
        r.image = null
        r.url = link(r.url, w)
      })
      return {
        [P(p, 'eyebrow')]: one(a, 'eyebrow', w),
        [P(p, 'heading')]: one(a, 'heading', w),
        [P(p, 'link_label')]: one(a, 'link-label', w),
        [P(p, 'members')]: members,
        _media
      }
    }
  },
  faq: {
    def: (p) => [
      str(P(p, 'eyebrow'), 'Eyebrow'),
      str(P(p, 'heading'), 'Heading'),
      txtF(P(p, 'intro'), 'Intro'),
      rep(P(p, 'items'), 'Questions', [str('question', 'Question'), txtF('answer', 'Answer')])
    ],
    val: (p, id, coll) => {
      const a = acm(id)
      const w = `${coll}.${p}`
      return {
        [P(p, 'eyebrow')]: one(a, 'eyebrow', w),
        [P(p, 'heading')]: one(a, 'heading', w),
        [P(p, 'intro')]: one(a, 'intro', w),
        [P(p, 'items')]: rows(a, { question: 'entry-question', answer: 'entry-answer' }, `${w}.items`).map(
          (r) => ({ ...r, answer: clean(r.answer.replace(/<[^>]+>/g, ' ')) })
        )
      }
    }
  },
  carousel: {
    def: (p) => [
      str(P(p, 'eyebrow'), 'Eyebrow'),
      str(P(p, 'heading'), 'Heading'),
      txtF(P(p, 'intro'), 'Intro'),
      rep(P(p, 'slides'), 'Slides', [
        str('kicker', 'Kicker'),
        str('title', 'Title'),
        txtF('text', 'Text'),
        image('image', 'Image'),
        str('link_label', 'Link label'),
        str('link_url', 'Link URL')
      ])
    ],
    val: (p, id, coll) => {
      const a = acm(id)
      const w = `${coll}.${p}`
      const slides = rows(
        a,
        {
          kicker: 'slide-kicker',
          title: 'slide-title',
          text: 'slide-text',
          image: 'slide-image',
          link_label: 'slide-link-text',
          link_url: 'slide-link'
        },
        `${w}.slides`
      )
      const _media = []
      slides.forEach((r, i) => {
        if (r.image) _media.push([r.image, r.title, `${P(p, 'slides')}[${i}].image`])
        r.image = null
        r.link_url = link(r.link_url, w)
      })
      return {
        [P(p, 'eyebrow')]: one(a, 'eyebrow', w),
        [P(p, 'heading')]: one(a, 'heading', w),
        [P(p, 'intro')]: one(a, 'intro', w),
        [P(p, 'slides')]: slides,
        _media
      }
    }
  },
  tabs: {
    def: (p) => [
      str(P(p, 'eyebrow'), 'Eyebrow'),
      str(P(p, 'heading'), 'Heading'),
      rep(P(p, 'tabs'), 'Tabs', [
        str('label', 'Tab label'),
        str('title', 'Title'),
        txtF('body', 'Body'),
        image('image', 'Image')
      ])
    ],
    val: (p, id, coll) => {
      const a = acm(id)
      const w = `${coll}.${p}`
      const tabs = rows(
        a,
        { label: 'tab-label', title: 'tab-title', body: 'tab-body', image: 'tab-image' },
        `${w}.tabs`
      )
      const _media = []
      tabs.forEach((r, i) => {
        if (r.image) _media.push([r.image, r.title, `${P(p, 'tabs')}[${i}].image`])
        r.image = null
        r.body = clean(r.body.replace(/<[^>]+>/g, ' '))
      })
      return {
        [P(p, 'eyebrow')]: one(a, 'eyebrow', w),
        [P(p, 'heading')]: one(a, 'heading', w),
        [P(p, 'tabs')]: tabs,
        _media
      }
    }
  },
  timeline: {
    def: (p) => [
      str(P(p, 'eyebrow'), 'Eyebrow'),
      str(P(p, 'heading'), 'Heading'),
      txtF(P(p, 'intro'), 'Intro'),
      rep(P(p, 'entries'), 'Milestones', [
        str('marker', 'Marker'),
        str('title', 'Title'),
        txtF('text', 'Text')
      ])
    ],
    val: (p, id, coll) => {
      const a = acm(id)
      const w = `${coll}.${p}`
      return {
        [P(p, 'eyebrow')]: one(a, 'eyebrow', w),
        [P(p, 'heading')]: one(a, 'heading', w),
        [P(p, 'intro')]: one(a, 'intro', w),
        [P(p, 'entries')]: rows(
          a,
          { marker: 'entry-marker', title: 'entry-title', text: 'entry-text' },
          `${w}.entries`
        )
      }
    }
  }
}

/** Compose a singleton from [prefix, sectionType, moduleId] triples (+ leading fields/data). */
function composed(coll, sections, lead = { fields: [], data: {} }) {
  const fields = [...lead.fields]
  const data = { ...lead.data }
  const mediaTargets = []
  for (const [prefix, type, id] of sections) {
    fields.push(...SECTION[type].def(prefix))
    const v = SECTION[type].val(prefix, id, coll, coll)
    for (const m of v._media ?? []) mediaTargets.push(m)
    delete v._media
    Object.assign(data, v)
  }
  for (const [file, alt, p] of mediaTargets) img(file, alt, T(coll, coll, p))
  return { fields, data }
}

// ───────────────────────── OpenDesign landing blocks (HTML) ─────────────────────────
const ICONS = [
  ['M5 12l4 4 10-10', 'check'],
  ['M12 3v18M3 12h18', 'plus'],
  ['M20 20l-4-4', 'search'],
  ['M4 13l5 5L20 6', 'check-double'],
  ['M9 12h6M12 9v6', 'plus-square'],
  ['M12 2l3 6 7 .9', 'star'],
  ['"rx":"7"', 'sketch-lines'],
  ['"x":"66"', 'sketch-panels'],
  ['M16 70l20 16', 'sketch-check']
]
const ICON_NAMES = ICONS.map((x) => x[1])
function iconOf(svg) {
  if (!svg) return ''
  const s = JSON.stringify(svg.children?.map((c) => c.attribs ?? {}) ?? [])
  for (const [needle, name] of ICONS)
    if (s.includes(needle) || s.includes(needle.replace('"', '\\"'))) return name
  return 'unknown'
}
const od = (id) => {
  const m = odById.get(String(id))
  if (!m) throw new Error(`OD module ${id} not in export`)
  return parse(m.content)
}
const t1 = (root, name, i = 0) => rw(txt(findAll(root, name)[i]), `od.${name}[${i}`)
const href1 = (root, i = 0, where = 'od') => link(findAll(root, 'a')[i]?.attribs.href, where)

function odHome() {
  const fields = []
  const data = {}
  // hero (228)
  let r = od(228)
  const spans = findAll(r, 'span').map(txt).filter(Boolean)
  const ps = findAll(r, 'p')
  fields.push(
    str('title', 'Page title', { required: true }),
    str('hero_eyebrow', 'Hero eyebrow'),
    str('hero_title', 'Hero title'),
    txtF('hero_lead', 'Hero lead'),
    str('hero_cta1_label', 'Primary button'),
    str('hero_cta1_url', 'Primary button URL'),
    str('hero_cta2_label', 'Secondary button'),
    str('hero_cta2_url', 'Secondary button URL'),
    str('hero_note', 'Hero note'),
    str('hero_mock_caption', 'Toolkit mock caption')
  )
  Object.assign(data, {
    title: 'Home',
    hero_eyebrow: spans[0],
    hero_title: t1(r, 'h1'),
    hero_lead: txt(ps[0]),
    hero_cta1_label: t1(r, 'a', 0),
    hero_cta1_url: href1(r, 0, 'home.hero'),
    hero_cta2_label: t1(r, 'a', 1),
    hero_cta2_url: href1(r, 1, 'home.hero'),
    hero_note: txt(ps[1]),
    hero_mock_caption: spans[1] ?? ''
  })
  // social proof (229)
  r = od(229)
  const sp = findAll(r, 'span').map(txt)
  fields.push(
    str('proof_kicker', 'Proof kicker'),
    str('proof_title', 'Proof title'),
    str('proof_line', 'Proof line'),
    rep('proof_items', 'Proof items', [str('label', 'Label')])
  )
  Object.assign(data, {
    proof_kicker: sp[0],
    proof_title: sp[1],
    proof_line: t1(r, 'p'),
    proof_items: sp.slice(2).map((label) => ({ label }))
  })
  // problem (230): h3 cards
  r = od(230)
  fields.push(
    str('problem_eyebrow', 'Problem eyebrow'),
    str('problem_title', 'Problem title'),
    txtF('problem_lead', 'Problem lead'),
    rep('problem_items', 'Problem items', [str('title', 'Title'), txtF('text', 'Text')])
  )
  Object.assign(data, {
    problem_eyebrow: t1(r, 'span'),
    problem_title: t1(r, 'h2'),
    problem_lead: t1(r, 'p'),
    problem_items: findAll(r, 'h3').map((h) => ({
      title: txt(h),
      text: rw(txt(first(h.parent, 'p')), 'home.problem')
    }))
  })
  // value (231): icon cards
  r = od(231)
  fields.push(
    str('value_eyebrow', 'Value eyebrow'),
    str('value_title', 'Value title'),
    txtF('value_lead', 'Value lead'),
    rep('value_items', 'Value items', [
      sel('icon', 'Icon', ICON_NAMES),
      str('title', 'Title'),
      txtF('text', 'Text')
    ])
  )
  Object.assign(data, {
    value_eyebrow: t1(r, 'span'),
    value_title: t1(r, 'h2'),
    value_lead: t1(r, 'p'),
    value_items: findAll(r, 'h3').map((h) => ({
      icon: iconOf(first(h.parent, 'svg')),
      title: txt(h),
      text: rw(txt(first(h.parent, 'p')), 'home.value')
    }))
  })
  // how (232): numbered steps with sketch
  r = od(232)
  fields.push(
    str('how_eyebrow', 'How eyebrow'),
    str('how_title', 'How title'),
    str('how_lead', 'How lead'),
    rep('how_steps', 'How steps', [
      sel('icon', 'Sketch', ICON_NAMES),
      str('number', 'Number'),
      str('title', 'Title'),
      txtF('text', 'Text')
    ])
  )
  Object.assign(data, {
    how_eyebrow: t1(r, 'span'),
    how_title: t1(r, 'h2'),
    how_lead: t1(r, 'p'),
    how_steps: findAll(r, 'h3').map((h) => {
      const card = h.parent.parent.parent
      return {
        icon: iconOf(first(card, 'svg')),
        number: txt(first(h.parent, 'span')),
        title: txt(h),
        text: rw(txt(first(card, 'p')), 'home.how')
      }
    })
  })
  // inline cta (233)
  r = od(233)
  fields.push(
    str('inline_cta_title', 'Inline CTA title'),
    str('inline_cta_text', 'Inline CTA text'),
    str('inline_cta_label', 'Inline CTA button'),
    str('inline_cta_url', 'Inline CTA URL')
  )
  Object.assign(data, {
    inline_cta_title: t1(r, 'h3'),
    inline_cta_text: t1(r, 'p'),
    inline_cta_label: t1(r, 'a'),
    inline_cta_url: href1(r, 0, 'home.inline_cta')
  })
  // features (234): zig-zag rows
  r = od(234)
  fields.push(
    str('features_eyebrow', 'Features eyebrow'),
    str('features_title', 'Features title'),
    txtF('features_lead', 'Features lead'),
    rep('features_items', 'Feature rows', [
      sel('icon', 'Icon', ICON_NAMES),
      str('kicker', 'Kicker'),
      str('title', 'Title'),
      txtF('text', 'Text'),
      str('link_label', 'Link label'),
      str('link_url', 'Link URL')
    ])
  )
  Object.assign(data, {
    features_eyebrow: t1(r, 'span'),
    features_title: t1(r, 'h2'),
    features_lead: t1(r, 'p'),
    features_items: findAll(r, 'h3').map((h) => {
      const card = h.parent
      const row = card.parent
      const a = first(card, 'a')
      return {
        icon: iconOf(first(row, 'svg')),
        kicker: txt(first(card, 'span')),
        title: txt(h),
        text: rw(txt(first(card, 'p')), 'home.features'),
        link_label: txt(a),
        link_url: link(a?.attribs.href, 'home.features')
      }
    })
  })
  // statistics (235)
  r = od(235)
  fields.push(rep('stats', 'Statistics', [str('value', 'Value'), str('caption', 'Caption')]))
  data.stats = findAll(r, 'div')
    .filter((d) => els(d).length === 2 && els(d).every((c) => c.name === 'div' && els(c).length === 0))
    .map((d) => ({ value: txt(els(d)[0]), caption: txt(els(d)[1]) }))
  // testimonials (236)
  r = od(236)
  fields.push(
    str('team_eyebrow', 'Team eyebrow'),
    str('team_title', 'Team title'),
    txtF('team_lead', 'Team lead'),
    rep('team_quotes', 'Team quotes', [
      txtF('quote', 'Quote'),
      str('initials', 'Initials'),
      str('name', 'Name'),
      str('role', 'Role')
    ]),
    str('team_note', 'Team note')
  )
  {
    const ps = findAll(r, 'p')
    const cards = findAll(r, 'span').filter((s) => /^[A-Z]{2}$/.test(txt(s)))
    Object.assign(data, {
      team_eyebrow: t1(r, 'span'),
      team_title: t1(r, 'h2'),
      team_lead: txt(ps[0]),
      team_quotes: cards.map((s) => {
        const card = s.parent.parent
        const divs = els(s.parent).filter((d) => d.name === 'div')
        const nameRole = divs[0] ? els(divs[0]) : []
        // The source's initials (MT/DO/RM) do not match the names (Adam Hale…); the view derives them.
        return { quote: txt(first(card, 'p')), initials: '', name: txt(nameRole[0]), role: txt(nameRole[1]) }
      }),
      team_note: txt(ps[ps.length - 1])
    })
  }
  // faq (237)
  r = od(237)
  fields.push(
    str('faq_eyebrow', 'FAQ eyebrow'),
    str('faq_title', 'FAQ title'),
    rep('faq_items', 'FAQ items', [str('question', 'Question'), txtF('answer', 'Answer')])
  )
  Object.assign(data, { faq_eyebrow: t1(r, 'span'), faq_title: t1(r, 'h2'), faq_items: odFaq(r, 'home.faq') })
  // pricing (238)
  r = od(238)
  fields.push(
    str('pricing_eyebrow', 'Pricing eyebrow'),
    str('pricing_title', 'Pricing title'),
    txtF('pricing_lead', 'Pricing lead'),
    rep('pricing_tiers', 'Plans', [
      str('name', 'Name'),
      str('badge', 'Badge'),
      txtF('summary', 'Summary'),
      str('price', 'Price'),
      str('period', 'Period'),
      txtF('features', 'Features (one per line)'),
      str('cta_label', 'Button label'),
      str('cta_url', 'Button URL')
    ]),
    str('pricing_note', 'Pricing note'),
    str('pricing_disclaimer', 'Pricing disclaimer')
  )
  {
    const ps = findAll(r, 'p')
    Object.assign(data, {
      pricing_eyebrow: t1(r, 'span'),
      pricing_title: t1(r, 'h2'),
      pricing_lead: txt(ps[0]),
      pricing_tiers: findAll(r, 'ul').map((ul) => {
        const tier = ul.parent
        const head = els(tier)[0]
        const hs = findAll(head, 'span').map(txt)
        const priceDiv = els(tier).find(
          (d) => d.name === 'div' && d !== head && findAll(d, 'span').length === 2 && !findAll(d, 'a').length
        )
        const pr = priceDiv ? findAll(priceDiv, 'span').map(txt) : ['', '']
        const a = first(tier, 'a')
        return {
          name: hs[0] ?? '',
          badge: hs[1] ?? '',
          summary: txt(first(tier, 'p')),
          price: pr[0],
          period: pr[1],
          features: findAll(ul, 'li')
            .map((li) =>
              findAll(li, 'span')
                .map(txt)
                .filter((x) => x !== '✓')
                .join(' ')
            )
            .join('\n'),
          cta_label: txt(a),
          cta_url: link(a?.attribs.href, 'home.pricing')
        }
      }),
      pricing_note: txt(ps[ps.length - 2]),
      pricing_disclaimer: txt(ps[ps.length - 1])
    })
  }
  // final cta (239)
  r = od(239)
  fields.push(
    str('final_title', 'Final CTA title'),
    txtF('final_text', 'Final CTA text'),
    str('final_cta_label', 'Final CTA button'),
    str('final_cta_url', 'Final CTA URL'),
    str('final_link_label', 'Final CTA link'),
    str('final_link_url', 'Final CTA link URL'),
    str('final_tail', 'Final CTA tail line')
  )
  {
    const ps = findAll(r, 'p')
    Object.assign(data, {
      final_title: t1(r, 'h2'),
      final_text: txt(ps[0]),
      final_cta_label: t1(r, 'a', 0),
      final_cta_url: href1(r, 0, 'home.final'),
      final_link_label: t1(r, 'a', 1).replace(/\s*→$/, ''),
      final_link_url: href1(r, 1, 'home.final'),
      final_tail: txt(ps[ps.length - 1])
    })
  }
  return { fields, data }
}
function odFaq(r, where) {
  return findAll(r, 'details').map((d) => ({
    question: txt(first(first(d, 'summary'), 'span')),
    answer: rw(txt(els(d).find((c) => c.name === 'div')), where)
  }))
}
function odOnepage() {
  const fields = [str('title', 'Page title', { required: true })]
  const data = { title: 'Home - Onepage' }
  const mediaTargets = []
  // header (240)
  let r = od(240)
  fields.push(
    str('nav_brand', 'Brand'),
    str('nav_sub', 'Brand subline'),
    rep('nav_items', 'Anchored navigation', [str('label', 'Label'), str('anchor', 'Anchor (#id)')]),
    str('nav_toggle_label', 'Theme toggle label')
  )
  {
    const brand = first(r, 'a')
    const sub = first(brand, 'span')
    Object.assign(data, {
      nav_brand: clean(text(brand).replace(text(sub), '')),
      nav_sub: txt(sub),
      nav_items: findAll(first(r, 'nav'), 'a').map((a) => ({ label: txt(a), anchor: a.attribs.href })),
      nav_toggle_label: first(r, 'button')?.attribs['aria-label'] ?? ''
    })
  }
  // hero (241)
  r = od(241)
  fields.push(
    str('hero_eyebrow', 'Hero eyebrow'),
    str('hero_title_a', 'Hero title (line 1)'),
    str('hero_title_b', 'Hero title (line 2)'),
    txtF('hero_lead', 'Hero lead'),
    str('hero_cta1_label', 'Primary button'),
    str('hero_cta1_url', 'Primary button URL'),
    str('hero_cta2_label', 'Secondary button'),
    str('hero_cta2_url', 'Secondary button URL'),
    image('hero_image', 'Hero image'),
    str('hero_image_alt', 'Hero image alt')
  )
  {
    const [ta, tb = ''] = text(first(r, 'h1')).split('\n').map(clean)
    const im = first(r, 'img')
    Object.assign(data, {
      hero_eyebrow: t1(r, 'span'),
      hero_title_a: ta,
      hero_title_b: tb,
      hero_lead: t1(r, 'p'),
      hero_cta1_label: t1(r, 'a', 0),
      hero_cta1_url: href1(r, 0, 'onepage.hero'),
      hero_cta2_label: t1(r, 'a', 1),
      hero_cta2_url: href1(r, 1, 'onepage.hero'),
      hero_image: null,
      hero_image_alt: clean(im?.attribs.alt)
    })
    if (im) mediaTargets.push([im.attribs.src, im.attribs.alt, 'hero_image'])
  }
  // about (242)
  r = od(242)
  fields.push(
    str('about_eyebrow', 'About eyebrow'),
    str('about_title', 'About title'),
    txtF('about_text_1', 'About paragraph 1'),
    txtF('about_text_2', 'About paragraph 2'),
    rep('about_chips', 'About chips', [str('label', 'Label')])
  )
  {
    const ps = findAll(r, 'p')
    const chips = findAll(r, 'span').slice(1).map(txt)
    Object.assign(data, {
      about_eyebrow: t1(r, 'span'),
      about_title: t1(r, 'h2'),
      about_text_1: rw(txt(ps[0]), 'onepage.about'),
      about_text_2: rw(txt(ps[1]), 'onepage.about'),
      about_chips: chips.map((label) => ({ label }))
    })
  }
  // services (243)
  r = od(243)
  fields.push(
    str('services_eyebrow', 'Services eyebrow'),
    str('services_title', 'Services title'),
    txtF('services_lead', 'Services lead'),
    rep('services_items', 'Services', [
      sel('icon', 'Icon', ICON_NAMES),
      str('title', 'Title'),
      txtF('text', 'Text')
    ])
  )
  Object.assign(data, {
    services_eyebrow: t1(r, 'span'),
    services_title: t1(r, 'h2'),
    services_lead: t1(r, 'p'),
    services_items: findAll(r, 'h3').map((h) => ({
      icon: iconOf(first(h.parent, 'svg')),
      title: txt(h),
      text: rw(txt(first(h.parent, 'p')), 'onepage.services')
    }))
  })
  // product (244)
  r = od(244)
  fields.push(
    str('product_eyebrow', 'Product eyebrow'),
    str('product_title', 'Product title'),
    txtF('product_lead', 'Product lead'),
    rep('product_parts', 'Product parts', [
      sel('icon', 'Icon', ICON_NAMES),
      str('kicker', 'Kicker'),
      str('title', 'Title'),
      txtF('text', 'Text'),
      str('cta_label', 'Button label'),
      str('cta_url', 'Button URL')
    ])
  )
  Object.assign(data, {
    product_eyebrow: t1(r, 'span'),
    product_title: t1(r, 'h2'),
    product_lead: t1(r, 'p'),
    product_parts: findAll(r, 'h3').map((h) => {
      const card = h.parent
      const a = first(card, 'a')
      return {
        icon: iconOf(first(card.parent, 'svg')),
        kicker: txt(first(card, 'span')),
        title: txt(h),
        text: rw(txt(first(card, 'p')), 'onepage.product'),
        cta_label: txt(a),
        cta_url: link(a?.attribs.href, 'onepage.product')
      }
    })
  })
  // process (245)
  r = od(245)
  fields.push(
    str('process_eyebrow', 'Process eyebrow'),
    str('process_title', 'Process title'),
    txtF('process_lead', 'Process lead'),
    rep('process_steps', 'Process steps', [
      sel('icon', 'Sketch', ICON_NAMES),
      str('number', 'Number'),
      str('title', 'Title'),
      txtF('text', 'Text')
    ])
  )
  Object.assign(data, {
    process_eyebrow: t1(r, 'span'),
    process_title: t1(r, 'h2'),
    process_lead: t1(r, 'p'),
    process_steps: findAll(r, 'h3').map((h) => {
      const card = h.parent.parent.parent
      return {
        icon: iconOf(first(card, 'svg')),
        number: txt(first(h.parent, 'span')),
        title: txt(h),
        text: rw(txt(first(card, 'p')), 'onepage.process')
      }
    })
  })
  // team (246)
  r = od(246)
  fields.push(
    str('team_eyebrow', 'Team eyebrow'),
    str('team_title', 'Team title'),
    txtF('team_lead', 'Team lead'),
    rep('team_members', 'Team members', [
      image('image', 'Portrait'),
      str('image_alt', 'Portrait alt'),
      str('name', 'Name'),
      str('role', 'Role'),
      txtF('text', 'Text')
    ])
  )
  {
    const arts = findAll(r, 'article')
    Object.assign(data, {
      team_eyebrow: t1(r, 'span'),
      team_title: t1(r, 'h2'),
      team_lead: t1(r, 'p'),
      team_members: arts.map((a, i) => {
        const im = first(a, 'img')
        const ps = findAll(a, 'p')
        if (im) mediaTargets.push([im.attribs.src, im.attribs.alt, `team_members[${i}].image`])
        return {
          image: null,
          image_alt: clean(im?.attribs.alt),
          name: txt(first(a, 'h3')),
          role: txt(ps[0]),
          text: txt(ps[1])
        }
      })
    })
  }
  // faq (247)
  r = od(247)
  fields.push(
    str('faq_eyebrow', 'FAQ eyebrow'),
    str('faq_title', 'FAQ title'),
    rep('faq_items', 'FAQ items', [str('question', 'Question'), txtF('answer', 'Answer')])
  )
  Object.assign(data, {
    faq_eyebrow: t1(r, 'span'),
    faq_title: t1(r, 'h2'),
    faq_items: odFaq(r, 'onepage.faq')
  })
  // contact (248)
  r = od(248)
  fields.push(
    str('contact_kicker', 'Contact kicker'),
    str('contact_title', 'Contact title'),
    txtF('contact_text', 'Contact text'),
    str('contact_cta_label', 'Contact button'),
    str('contact_cta_url', 'Contact button URL'),
    str('contact_back_label', 'Back link label'),
    str('contact_back_url', 'Back link URL')
  )
  Object.assign(data, {
    contact_kicker: t1(r, 'span'),
    contact_title: t1(r, 'h2'),
    contact_text: t1(r, 'p'),
    contact_cta_label: t1(r, 'a', 0),
    contact_cta_url: href1(r, 0, 'onepage.contact'),
    contact_back_label: t1(r, 'a', 1),
    contact_back_url: href1(r, 1, 'onepage.contact')
  })
  // footer (249)
  r = od(249)
  fields.push(
    str('footer_brand', 'Footer brand'),
    rep('footer_links', 'Footer links', [str('label', 'Label'), str('anchor', 'Anchor (#id)')]),
    str('footer_note', 'Footer note'),
    str('footer_credit', 'Footer credit')
  )
  {
    const ps = findAll(first(r, 'footer'), 'p')
    Object.assign(data, {
      footer_brand: t1(r, 'a', 0),
      footer_links: findAll(first(r, 'nav'), 'a').map((a) => ({ label: txt(a), anchor: a.attribs.href })),
      footer_note: txt(ps[0]),
      footer_credit: txt(ps[1])
    })
  }
  for (const [file, alt, p] of mediaTargets) img(file, alt, T('onepage', 'onepage', p))
  return { fields, data }
}

// ───────────────────────── collections ─────────────────────────
const collections = []
const content = {}
const add = (coll, entries) => {
  content[coll.slug] = entries
  collections.push(coll)
}
const singleton = (slug, label, urlPattern, fields, data, extra = {}) => {
  collections.push({
    slug,
    label,
    labelSingular: label,
    sortOrder: collections.length + 1,
    routable: false,
    ...(urlPattern ? { urlPattern } : {}),
    supports: urlPattern ? ['revisions', 'seo'] : ['revisions'],
    fields,
    ...extra
  })
  content[slug] = [{ id: `${slug}:${slug}:${LOCALE}`, slug, status: 'published', locale: LOCALE, data }]
}
// The article's intro as one line of text. A leading heading that repeats the title (Careers,
// Product: `<h2>Careers</h2><p>…</p>`) is dropped: the page has its own title field.
const artText = (a, where) =>
  rw(clean(a.introtext.replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/g, ' ').replace(/<[^>]+>/g, ' ')), where)
const artImages = (a) => {
  const im = JSON.parse(a.images || '{}')
  return {
    file: im.image_intro || im.image_fulltext || '',
    alt: im.image_intro_alt || im.image_fulltext_alt || '',
    caption: im.image_intro_caption || im.image_fulltext_caption || ''
  }
}

// routable collections first (links from singletons resolve through slugOf) ------------------
// Joomla's category blog lists by `ordering` DESCENDING (measured on the source: 17,13,12,11,10,0).
const byCat = (id) => ARTICLES.filter((a) => a.catid === id).sort((x, y) => y.ordering - x.ordering)
// A menu item of the primary menu that points at an article gives that article its public slug
// (services/website-strategy → article 3); articles without one keep their Joomla alias.
const menuAlias = (articleId) =>
  MENU.find((m) => m.menutype === 'tracy' && new RegExp(`view=article&id=${articleId}$`).test(m.link))?.alias
// The order a source list page shows its articles is the order the template keeps: article ids in
// document order of the snapshot's list HTML (blog.html, mag-*.html); categories without a list
// page fall back to id order.
const SOURCE_LISTS = {
  16: 'pages/resources/blog.html',
  18: 'pages/resources/mag-procurement.html',
  19: 'pages/resources/mag-datacenter.html',
  20: 'pages/resources/mag-world.html'
}
function sourceOrder(catid) {
  const rel = SOURCE_LISTS[catid]
  if (!rel || !existsSync(path.join(SRC, rel))) return null
  const html = readFileSync(path.join(SRC, rel), 'utf8')
  const seen = []
  for (const m of html.matchAll(/href="\/[^"]*?\/(\d+)-[a-z0-9-]+"/g))
    if (!seen.includes(Number(m[1]))) seen.push(Number(m[1]))
  return seen
}
const inSourceOrder = (catid) => {
  const order = sourceOrder(catid)
  const list = ARTICLES.filter((a) => a.catid === catid)
  if (!order) return list.sort((x, y) => x.id - y.id)
  return list.sort(
    (x, y) =>
      (order.indexOf(x.id) === -1 ? 1e6 : order.indexOf(x.id)) -
        (order.indexOf(y.id) === -1 ? 1e6 : order.indexOf(y.id)) || x.id - y.id
  )
}
// services: category 15 + article 80 (the "Website design & build" detail page under Service)
{
  const list = [...byCat(15), artById.get('80')]
  const entries = list.map((a, i) => {
    const slug = menuAlias(a.id) ?? a.alias
    slugOf.set(String(a.id), { collection: 'services', slug })
    return { a, slug, i }
  })
  const fields = [
    str('title', 'Title', { required: true, searchable: true }),
    txtF('excerpt', 'Summary', { searchable: true }),
    image('image', 'Image'),
    str('image_alt', 'Image alt'),
    pt('content', 'Body'),
    int('sort', 'Sort order', { indexed: true }),
    bool('listed', 'Show in the services list', true),
    ...SECTION.faq.def('faq'),
    ...SECTION.cta.def('cta')
  ]
  const empty = (defs) =>
    Object.fromEntries(
      defs.map((d) => [
        d.slug,
        d.type === 'repeater' ? [] : d.type === 'boolean' ? false : d.type === 'select' ? d.defaultValue : ''
      ])
    )
  add(
    {
      slug: 'services',
      label: 'Services',
      labelSingular: 'Service',
      sortOrder: 30,
      urlPattern: '/services/{slug}',
      supports: ['drafts', 'revisions', 'search', 'seo'],
      admin: { listColumns: ['sort'] },
      fields
    },
    entries.map(({ a, slug, i }) => {
      const im = artImages(a)
      if (im.file) img(im.file, im.alt, T('services', slug, 'image'))
      const extra =
        a.id === 80
          ? { ...SECTION.faq.val('faq', 207, 'services'), ...SECTION.cta.val('cta', 208, 'services') }
          : { ...empty(SECTION.faq.def('faq')), ...empty(SECTION.cta.def('cta')) }
      delete extra._media
      return {
        id: `services:${slug}:${LOCALE}`,
        slug,
        status: 'published',
        locale: LOCALE,
        data: {
          title: clean(a.title),
          excerpt: artText(a, `services.${slug}.excerpt`),
          image: null,
          image_alt: im.alt,
          content: portable(a.fulltext, (n) => T('services', slug, `content[${n}].asset`)),
          sort: i,
          listed: a.id !== 80,
          ...extra
        }
      }
    })
  )
}
// people: the four profiles of category 10
{
  const list = inSourceOrder(10).filter((a) => / — /.test(a.title))
  const fields = [
    str('title', 'Title', { required: true, searchable: true }),
    str('name', 'Name', { searchable: true }),
    str('role', 'Role', { searchable: true }),
    txtF('excerpt', 'Summary', { searchable: true }),
    image('image', 'Portrait'),
    str('image_alt', 'Portrait alt'),
    str('image_caption', 'Portrait caption'),
    pt('content', 'Body'),
    int('sort', 'Sort order', { indexed: true })
  ]
  add(
    {
      slug: 'people',
      label: 'People',
      labelSingular: 'Person',
      sortOrder: 31,
      urlPattern: '/team/{slug}',
      supports: ['drafts', 'revisions', 'search', 'seo'],
      admin: { listColumns: ['role', 'sort'] },
      fields
    },
    list.map((a, i) => {
      const slug = a.alias
      slugOf.set(String(a.id), { collection: 'people', slug })
      const [name, role] = a.title.split(' — ').map(clean)
      const im = artImages(a)
      if (im.file) img(im.file, im.alt, T('people', slug, 'image'))
      return {
        id: `people:${slug}:${LOCALE}`,
        slug,
        status: 'published',
        locale: LOCALE,
        data: {
          title: clean(a.title),
          name,
          role: role ?? '',
          excerpt: artText(a, `people.${slug}`),
          image: null,
          image_alt: im.alt,
          image_caption: im.caption,
          content: portable(a.fulltext, (n) => T('people', slug, `content[${n}].asset`)),
          sort: i
        }
      }
    })
  )
}
// posts: every article of the blog/magazine/demo categories + the two non-profile People articles
const USERS = readJson('users.json')
const userName = (id) => clean(USERS.find((u) => u.id === id)?.name)
const tagById = new Map(TAGS.map((t) => [t.id, t]))
const tagsOf = (id) =>
  TAGMAP.filter((t) => t.type === 'com_content.article' && t.item === id)
    .map((t) => tagById.get(t.tag))
    .filter(Boolean)
const catLabel = (id) => clean(CATS.find((c) => c.id === id)?.title)
const catDesc = (id) => clean((CATS.find((c) => c.id === id)?.description ?? '').replace(/<[^>]+>/g, ' '))
const slugRenames = []
{
  const cats = [16, 18, 19, 20, 11, 12, 13]
  const list = [...cats.flatMap(inSourceOrder), ...inSourceOrder(10).filter((a) => !/ — /.test(a.title))]
  const seen = new Set()
  const fields = [
    str('title', 'Title', { required: true, searchable: true }),
    txtF('excerpt', 'Summary', { searchable: true }),
    image('image', 'Image'),
    str('image_alt', 'Image alt'),
    str('image_caption', 'Image caption'),
    str('author', 'Author'),
    f('date', 'Date', 'datetime', { indexed: true }),
    pt('content', 'Body'),
    bool('featured', 'Featured'),
    int('sort', 'Sort order (ties on the same date)', { indexed: true })
  ]
  add(
    {
      slug: 'posts',
      label: 'Blog',
      labelSingular: 'Article',
      sortOrder: 32,
      urlPattern: '/blog/{slug}',
      supports: ['drafts', 'revisions', 'scheduling', 'search', 'seo'],
      dateField: 'date',
      admin: { listColumns: ['date', 'featured'] },
      fields
    },
    list.map((a, sortIndex) => {
      let slug = a.alias
      if (seen.has(slug)) {
        const renamed = `${slug}-${CAT_SLUG[a.catid]}`
        slugRenames.push({ article: a.id, category: a.catid, from: slug, to: renamed })
        slug = renamed
      }
      seen.add(slug)
      slugOf.set(String(a.id), { collection: 'posts', slug })
      const im = artImages(a)
      if (im.file) img(im.file, im.alt, T('posts', slug, 'image'))
      return {
        id: `posts:${slug}:${LOCALE}`,
        slug,
        status: 'published',
        locale: LOCALE,
        data: {
          title: clean(a.title),
          excerpt: artText(a, `posts.${slug}`),
          image: null,
          image_alt: im.alt,
          image_caption: im.caption,
          author: userName(a.created_by),
          date: isoDate(a.publish_up) ?? isoDate(a.created),
          content: portable(a.fulltext, (n) => T('posts', slug, `content[${n}].asset`)),
          featured: a.featured === 1,
          sort: sortIndex
        },
        taxonomies: { category: [CAT_SLUG[a.catid]], tag: tagsOf(a.id).map((t) => t.alias) }
      }
    })
  )
}

// site chrome ---------------------------------------------------------------------------
{
  const modText = (id) => {
    const m = MODULES.find((x) => x.id === id)
    return m ? m.content : ''
  }
  const _mf = (id) => acm(id).fields
  const social = acm(174)
  const _contactInfo = acm(254)
  const notice = one(acm(252), 'notice', 'site.notice')
  const feature = (id, where) => {
    const a = acm(id)
    return {
      eyebrow: one(a, 'eyebrow', where),
      title: one(a, 'title', where),
      description: one(a, 'description', where),
      action: one(a, 'action', where),
      url: link(one(a, 'link', where), where),
      image: one(a, 'image', where),
      image_alt: one(a, 'image-alt', where)
    }
  }
  const fs = feature(224, 'site.mega_service')
  const fr = feature(225, 'site.mega_resources')
  const fields = [
    str('title', 'Title', { required: true }),
    str('brand_name', 'Brand name'),
    str('brand_tagline', 'Brand tagline'),
    str('contact_label', 'Header button label'),
    str('contact_url', 'Header button URL'),
    str('theme_dark_label', 'Theme toggle: dark'),
    str('theme_light_label', 'Theme toggle: light'),
    str('menu_label', 'Mobile menu label'),
    str('mega_service_title', 'Mega Service: column title'),
    str('mega_service_eyebrow', 'Mega Service: feature eyebrow'),
    str('mega_service_heading', 'Mega Service: feature title'),
    txtF('mega_service_text', 'Mega Service: feature text'),
    str('mega_service_action', 'Mega Service: feature link label'),
    str('mega_service_url', 'Mega Service: feature link URL'),
    image('mega_service_image', 'Mega Service: feature image'),
    str('mega_service_image_alt', 'Mega Service: feature image alt'),
    str('mega_read_title', 'Mega Resources: Read & learn title'),
    str('mega_design_title', 'Mega Resources: Design & inspiration title'),
    str('mega_help_title', 'Mega Resources: Help & support title'),
    str('mega_resources_eyebrow', 'Mega Resources: feature eyebrow'),
    str('mega_resources_heading', 'Mega Resources: feature title'),
    txtF('mega_resources_text', 'Mega Resources: feature text'),
    str('mega_resources_action', 'Mega Resources: feature link label'),
    str('mega_resources_url', 'Mega Resources: feature link URL'),
    image('mega_resources_image', 'Mega Resources: feature image'),
    str('mega_resources_image_alt', 'Mega Resources: feature image alt'),
    str('mega_latest_title', 'Mega Resources: latest posts title'),
    str('mega_search_label', 'Mega Resources: search label'),
    str('mega_company_title', 'Mega Company: column title'),
    str('mega_team_heading', 'Mega Company: team heading'),
    str('mega_team_all_label', 'Mega Company: view all label'),
    str('footer_product_title', 'Footer column 1 title'),
    str('footer_resources_title', 'Footer column 2 title'),
    str('footer_company_title', 'Footer column 3 title'),
    str('social_heading', 'Social heading'),
    str('social_handle', 'Social handle'),
    rep('social', 'Social profiles', [
      sel('platform', 'Platform', ['instagram', 'facebook', 'linkedin', 'youtube', 'x', 'tiktok']),
      str('url', 'URL')
    ]),
    txtF('notice', 'Demo notice (footer)'),
    str('breadcrumb_home', 'Breadcrumb: home label'),
    str('not_found_code', '404: code'),
    str('not_found_title', '404: title'),
    str('not_found_back_label', '404: back link label'),
    str('search_title', 'Search: page title'),
    str('search_placeholder', 'Search: placeholder'),
    str('search_button', 'Search: button label'),
    str('search_results_line', 'Search: results line ({count}, {query})'),
    str('search_empty', 'Search: no results line'),
    str('read_more', 'Read more label'),
    str('count_label', 'List count label ({count})'),
    str('page_meta', 'Pagination label ({page}, {pages})'),
    str('prev_label', 'Previous label'),
    str('next_label', 'Next label'),
    str('related_title', 'Related posts title'),
    str('latest_title', 'Latest posts title'),
    str('sections_title', 'Blog sections title'),
    str('sitemap_title', 'Sitemap title'),
    str('skip_label', 'Skip to content label'),
    str('back_to_top', 'Back to top label')
  ]
  const data = {
    title: 'Tracy Base',
    brand_name: 'Tracy Base',
    brand_tagline: 'Precision, in every surface',
    contact_label: clean(modText(170).replace(/<[^>]+>/g, ' ')),
    contact_url: link((modText(170).match(/href="([^"]+)"/) || [])[1], 'site.contact'),
    theme_dark_label: 'Dark',
    theme_light_label: 'Light',
    menu_label: 'Menu',
    mega_service_title: 'Our services',
    mega_service_eyebrow: fs.eyebrow,
    mega_service_heading: fs.title,
    mega_service_text: fs.description,
    mega_service_action: fs.action,
    mega_service_url: fs.url,
    mega_service_image: null,
    mega_service_image_alt: fs.image_alt,
    mega_read_title: 'Read & learn',
    mega_design_title: 'Design & inspiration',
    mega_help_title: 'Help & support',
    mega_resources_eyebrow: fr.eyebrow,
    mega_resources_heading: fr.title,
    mega_resources_text: fr.description,
    mega_resources_action: fr.action,
    mega_resources_url: fr.url,
    mega_resources_image: null,
    mega_resources_image_alt: fr.image_alt,
    mega_latest_title: 'Latest from the blog',
    mega_search_label: 'Search',
    mega_company_title: 'The studio',
    mega_team_heading: one(acm(226), 'heading', 'site.mega_team'),
    mega_team_all_label: 'View all team',
    footer_product_title: clean((modText(171).match(/<h3[^>]*>(.*?)<\/h3>/) || [])[1]),
    footer_resources_title: clean((modText(172).match(/<h3[^>]*>(.*?)<\/h3>/) || [])[1]),
    footer_company_title: clean((modText(173).match(/<h3[^>]*>(.*?)<\/h3>/) || [])[1]),
    social_heading: one(social, 'heading', 'site.social'),
    social_handle: one(social, 'handle', 'site.social'),
    social: rows(social, { platform: 'platform', url: 'social-url' }, 'site.social'),
    notice,
    breadcrumb_home: 'Home',
    not_found_code: '404',
    not_found_title: 'Page not found',
    not_found_back_label: 'Back to Tracy Base',
    search_title: 'Search',
    search_placeholder: 'Search',
    search_button: 'Search',
    search_results_line: '{count} results for “{query}”',
    search_empty: 'No results for “{query}”.',
    read_more: 'Read more',
    count_label: '{count} articles',
    page_meta: 'Page {page} of {pages}',
    prev_label: 'Previous',
    next_label: 'Next',
    related_title: 'Related articles',
    latest_title: 'Latest articles',
    sections_title: 'Sections',
    sitemap_title: 'Sitemap',
    skip_label: 'Skip to content',
    back_to_top: 'Back to top'
  }
  if (fs.image) img(fs.image, fs.image_alt, T('site', 'site', 'mega_service_image'))
  if (fr.image) img(fr.image, fr.image_alt, T('site', 'site', 'mega_resources_image'))
  singleton('site', 'Site chrome', null, fields, data)
}

// singletons -----------------------------------------------------------------------------
{
  const h = odHome()
  singleton('home', 'Home page', '/', h.fields, h.data)
}
{
  const o = odOnepage()
  singleton('onepage', 'Home - Onepage', '/onepage', o.fields, o.data)
}
{
  const c = composed(
    'landing',
    [
      ['hero', 'hero', 178],
      ['chapter1', 'chapter', 179],
      ['features', 'features', 180],
      ['stats', 'stats', 181],
      ['chapter2', 'chapter', 182],
      ['pricing', 'pricing', 183],
      ['testimonials', 'testimonials', 184],
      ['clients', 'clients', 185],
      ['cta', 'cta', 186]
    ],
    { fields: [str('title', 'Page title', { required: true })], data: { title: 'Home variation' } }
  )
  singleton('landing', 'Home variation', '/landing', c.fields, c.data)
}
{
  const c = composed(
    'home_2',
    [
      ['hero', 'hero', 187],
      ['chapter', 'chapter', 188],
      ['team', 'team', 189],
      ['faq', 'faq', 190],
      ['stats', 'stats', 191],
      ['cta', 'cta', 192]
    ],
    { fields: [str('title', 'Page title', { required: true })], data: { title: 'Home — variant' } }
  )
  singleton('home_2', 'Home — variant', '/home-2', c.fields, c.data)
}
{
  const a = artById.get('81')
  const c = composed(
    'product',
    [
      ['hero', 'hero', 213],
      ['carousel', 'carousel', 214],
      ['tabs', 'tabs', 215],
      ['stats', 'stats', 216],
      ['cta', 'cta', 217]
    ],
    {
      fields: [str('title', 'Page title', { required: true }), txtF('intro', 'Intro')],
      data: { title: clean(a.title), intro: artText(a, 'product.intro') }
    }
  )
  singleton('product', 'Product page', '/product', c.fields, c.data)
}
{
  singleton(
    'services_page',
    'Services page',
    '/services',
    [str('title', 'Page title', { required: true }), txtF('intro', 'Intro')],
    {
      title: menuById.get('249').title === 'Service' ? catLabel(15) : menuById.get('249').title,
      intro: catDesc(15)
    }
  )
}
{
  const a = artById.get('47')
  const c = composed(
    'pricing',
    [
      ['pricing', 'pricing', 203],
      ['faq', 'faq', 204],
      ['cta', 'cta', 205]
    ],
    { fields: [str('title', 'Page title', { required: true })], data: { title: clean(a.title) } }
  )
  singleton('pricing', 'Pricing page', '/pricing', c.fields, c.data)
}
{
  singleton(
    'blog',
    'Blog page',
    '/blog',
    [
      str('title', 'Page title', { required: true }),
      txtF('intro', 'Intro'),
      str('topics_title', 'Topics page title'),
      txtF('topics_intro', 'Topics intro'),
      str('all_label', 'All articles label')
    ],
    {
      title: catLabel(16),
      intro: catDesc(16),
      topics_title: 'Topics',
      topics_intro: catDesc(9),
      all_label: 'All articles'
    }
  )
}
{
  singleton(
    'team',
    'Team page',
    '/team',
    [
      str('title', 'Page title', { required: true }),
      txtF('intro', 'Intro'),
      str('notes_title', 'Notes section title')
    ],
    { title: catLabel(10), intro: catDesc(10), notes_title: 'From the team' }
  )
}
{
  const c = composed(
    'about',
    [
      ['chapter1', 'chapter', 198],
      ['stats', 'stats', 199],
      ['chapter2', 'chapter', 200],
      ['team', 'team', 201],
      ['cta', 'cta', 202]
    ],
    {
      fields: [str('title', 'Page title', { required: true })],
      data: { title: clean(artById.get('45').title) }
    }
  )
  singleton('about', 'About page', '/about', c.fields, c.data)
}
{
  const a = artById.get('82')
  const c = composed(
    'careers',
    [
      ['timeline', 'timeline', 218],
      ['cta', 'cta', 219]
    ],
    {
      fields: [str('title', 'Page title', { required: true }), txtF('intro', 'Intro')],
      data: { title: clean(a.title), intro: artText(a, 'careers.intro') }
    }
  )
  singleton('careers', 'Careers page', '/careers', c.fields, c.data)
}
{
  const a = artById.get('79')
  const c = composed('help', [['faq', 'faq', 206]], {
    fields: [str('title', 'Page title', { required: true }), txtF('intro', 'Intro')],
    data: { title: clean(a.title), intro: artText(a, 'help.intro') }
  })
  singleton('help', 'Help centre page', '/help', c.fields, c.data)
}
{
  const ci = acm(254)
  const w = 'contact'
  const m = menuById.get('263')
  const heading = clean((JSON.parse(m.params).page_heading ?? '') || CONTACTS[0].name)
  singleton(
    'contact',
    'Contact page',
    '/contact',
    [
      str('title', 'Page title', { required: true }),
      txtF('intro', 'Intro'),
      str('form_id', 'Form (Forms plugin id)'),
      str('form_title', 'Form heading'),
      str('required_note', 'Required-field legend'),
      str('info_heading', 'Information heading'),
      str('email', 'Email'),
      str('email_label', 'Email label'),
      txtF('notice', 'Notice'),
      str('social_heading', 'Social heading'),
      str('unavailable_label', 'Unavailable label'),
      rep('social', 'Social links', [str('label', 'Label'), str('url', 'URL')])
    ],
    {
      title: heading,
      intro: '',
      form_id: '',
      form_title: '',
      required_note: '* Required field',
      info_heading: one(ci, 'heading', w),
      email: one(ci, 'email', w),
      email_label: one(ci, 'email-label', w),
      notice: one(ci, 'notice', w),
      social_heading: one(ci, 'social-heading', w),
      unavailable_label: one(ci, 'unavailable-label', w),
      // Only profiles with a URL: the source leaves all three empty and prints "Not configured",
      // which contradicts the footer's four live links on the same page.
      social: rows(ci, { label: 'social-label', url: 'social-url' }, `${w}.social`).filter((r) => r.url)
    }
  )
}
{
  const sg = artById.get('77')
  const ty = artById.get('2')
  const co = artById.get('75')
  const sp = artById.get('76')
  const spec = parse(sg.fulltext)
  const fields = [
    str('title', 'Page title', { required: true }),
    txtF('intro', 'Intro'),
    str('typography_title', 'Typography title'),
    txtF('typography_intro', 'Typography intro'),
    str('colour_title', 'Colour title'),
    txtF('colour_intro', 'Colour intro'),
    str('spacing_title', 'Spacing title'),
    txtF('spacing_intro', 'Spacing intro'),
    str('specimen_eyebrow', 'Specimen eyebrow'),
    str('specimen_heading', 'Specimen heading'),
    txtF('specimen_lede', 'Specimen lede'),
    txtF('specimen_body', 'Specimen body')
  ]
  const spans = findAll(spec, 'p')
  singleton('design_system', 'Design system', '/design-system', fields, {
    // Page titles are the articles' own (the source's <h1>/<title>); the menu labels
    // (Design system · Typography · Colour · Spacing & grid) stay in the menus.
    title: clean(sg.title),
    intro: artText(sg, 'design_system.intro'),
    typography_title: clean(ty.title),
    typography_intro: artText(ty, 'design_system.typography'),
    colour_title: clean(co.title),
    colour_intro: artText(co, 'design_system.colour'),
    spacing_title: clean(sp.title),
    spacing_intro: artText(sp, 'design_system.spacing'),
    specimen_eyebrow: txt(spans.find((p) => (p.attribs.class ?? '').includes('eyebrow'))),
    specimen_heading: txt(
      findAll(spec, 'h2').find((h) => !(h.attribs.class ?? '').includes('tracy-fixture__title'))
    ),
    specimen_lede: txt(spans.find((p) => (p.attribs.class ?? '').includes('lede'))),
    specimen_body: txt(spans.find((p) => (p.attribs.class ?? '').includes('body')))
  })
}
{
  const a = acm(251)
  const w = 'marketing'
  singleton(
    'marketing',
    'Marketing samples',
    '/marketing',
    [
      str('title', 'Page title', { required: true }),
      str('eyebrow', 'Eyebrow'),
      str('heading', 'Heading'),
      txtF('lead', 'Lead'),
      txtF('note', 'Note'),
      str('appearance_label', 'Appearance label'),
      str('light_label', 'Light label'),
      str('dark_label', 'Dark label'),
      str('open_label', 'Open label'),
      str('download_label', 'Download label'),
      rep('samples', 'Samples', [
        str('key', 'Key (file name stem)'),
        str('title', 'Title'),
        txtF('description', 'Description')
      ])
    ],
    {
      title: menuById.get('325').title,
      eyebrow: one(a, 'eyebrow', w),
      heading: one(a, 'heading', w),
      lead: one(a, 'lead', w),
      note: one(a, 'note', w),
      appearance_label: one(a, 'appearance-label', w),
      light_label: one(a, 'light-label', w),
      dark_label: one(a, 'dark-label', w),
      open_label: one(a, 'open-label', w),
      download_label: one(a, 'download-label', w),
      samples: rows(
        a,
        { key: 'sample-key', title: 'sample-title', description: 'sample-description' },
        `${w}.samples`
      )
    }
  )
}

// ───────────────────────── taxonomies ─────────────────────────
const taxonomies = [
  {
    id: `tax:category:${LOCALE}`,
    name: 'category',
    label: 'Categories',
    labelSingular: 'Category',
    hierarchical: false,
    collections: ['posts'],
    locale: LOCALE,
    terms: Object.entries(CAT_SLUG).map(([id, slug]) => ({
      id: `term:category:${slug}:${LOCALE}`,
      slug,
      label: catLabel(Number(id)),
      description: catDesc(Number(id)),
      locale: LOCALE
    }))
  },
  {
    id: `tax:tag:${LOCALE}`,
    name: 'tag',
    label: 'Tags',
    labelSingular: 'Tag',
    hierarchical: false,
    collections: ['posts'],
    locale: LOCALE,
    terms: TAGS.filter((t) => t.alias !== 'root').map((t) => ({
      id: `term:tag:${t.alias}:${LOCALE}`,
      slug: t.alias,
      label: clean(t.title),
      locale: LOCALE
    }))
  }
]

// ───────────────────────── menus ─────────────────────────
const item = (label, url) => ({ type: 'custom', label: clean(label), url })
const kids = (parentId) =>
  MENU.filter((m) => m.parent_id === parentId && m.menutype === 'tracy').sort(
    (a, b) => a.lft - b.lft || a.id - b.id
  )
const menuItems = (parentId) =>
  kids(parentId)
    .map((m) => ({ m, url: menuPath(m) }))
    .filter((x) => x.url)
    .map((x) => item(x.m.title, x.url))
const uniq = (items) => items.filter((x, i, arr) => arr.findIndex((y) => y.url === x.url) === i)
const resourcesKids = kids(319)
const pick = (paths) =>
  resourcesKids.filter((m) => paths.includes(m.path)).map((m) => item(m.title, menuPath(m)))
const footerItems = (id) => {
  const m = MODULES.find((x) => x.id === id)
  return [...m.content.matchAll(/<a href="([^"]+)">(.*?)<\/a>/g)]
    .map((x) => ({ label: clean(x[2]), url: link(x[1], `footer.${id}`) }))
    .filter((x) => x.url)
    .map((x) => item(x.label, x.url))
}
const menus = [
  {
    id: `menu:primary:${LOCALE}`,
    name: 'primary',
    label: 'Primary navigation',
    locale: LOCALE,
    items: [
      item('Home', '/'),
      item('Product', '/product'),
      item(menuById.get('249').title, '/services'),
      item('Pricing', '/pricing'),
      item('Resources', '/blog'),
      item('Company', '/about')
    ]
  },
  {
    id: `menu:service:${LOCALE}`,
    name: 'service',
    label: 'Service menu',
    locale: LOCALE,
    items: menuItems(249)
  },
  {
    id: `menu:resources_read:${LOCALE}`,
    name: 'resources_read',
    label: 'Resources: Read & learn',
    locale: LOCALE,
    items: uniq(
      pick([
        'resources/blog',
        'resources/all-categories',
        'resources/mag-procurement',
        'resources/mag-datacenter',
        'resources/mag-world'
      ])
    )
  },
  {
    id: `menu:resources_design:${LOCALE}`,
    name: 'resources_design',
    label: 'Resources: Design & inspiration',
    locale: LOCALE,
    items: pick([
      'resources/style-guide',
      'resources/typography',
      'resources/colors',
      'resources/spacing',
      'resources/home-2',
      'resources/home-variation',
      'resources/marketing-samples',
      'resources/home-onepage'
    ])
  },
  {
    id: `menu:resources_help:${LOCALE}`,
    name: 'resources_help',
    label: 'Resources: Help & support',
    locale: LOCALE,
    items: pick(['resources/faq', 'resources/contact', 'resources/search'])
  },
  {
    id: `menu:company:${LOCALE}`,
    name: 'company',
    label: 'Company menu',
    locale: LOCALE,
    items: menuItems(323)
  },
  {
    id: `menu:footer_product:${LOCALE}`,
    name: 'footer_product',
    label: 'Footer: Product',
    locale: LOCALE,
    items: footerItems(171)
  },
  {
    id: `menu:footer_resources:${LOCALE}`,
    name: 'footer_resources',
    label: 'Footer: Resources',
    locale: LOCALE,
    items: footerItems(172)
  },
  {
    id: `menu:footer_company:${LOCALE}`,
    name: 'footer_company',
    label: 'Footer: Company',
    locale: LOCALE,
    items: footerItems(173)
  }
]

// ───────────────────────── write ─────────────────────────
const seed = {
  $schema: 'https://emdashcms.com/seed.schema.json',
  version: '1',
  defaultLocale: LOCALE,
  meta: {
    name: 'Tracy Base',
    description: 'Tracy EmDash template built from the Tracy Base studio site (Joomla source snapshot, EN).',
    author: 'Tracy'
  },
  settings: { title: 'Tracy Base', tagline: 'Precision, in every surface', postsPerPage: 9 },
  collections,
  taxonomies,
  menus,
  redirects: [],
  widgetAreas: [],
  sections: [],
  content
}
writeFileSync(path.join(OUT, 'seed.json'), JSON.stringify(seed, null, '\t') + '\n')

const mediaList = [...media.values()]
for (const m of mediaList) {
  const from = path.join(SRC, m.file)
  const to = path.join(OUT, 'media', m.file)
  mkdirSync(path.dirname(to), { recursive: true })
  copyFileSync(from, to)
  m.sha256 = sha(to)
  m.copied = `media/${m.file}`
}
writeFileSync(
  path.join(OUT, 'media-map.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), source: SRC, items: mediaList }, null, '\t') + '\n'
)

const fieldMap = collections.map((c) => ({
  collection: c.slug,
  routable: c.routable !== false,
  urlPattern: c.urlPattern ?? null,
  entriesPerLocale: (content[c.slug] ?? []).length,
  fields: c.fields.map((x) => ({
    slug: x.slug,
    type: x.type,
    required: !!x.required,
    subFields: x.validation?.subFields?.map((s) => `${s.slug}:${s.type}`),
    options: x.validation?.options
  }))
}))
const fieldMapFile = path.join(OUT, 'field-map.json')
// The declared slot roles (ADR 0038) live in this file; carry them over by field name instead of erasing them.
const previousFieldMap = readPreviousFieldMap(fieldMapFile)
writeFileSync(
  fieldMapFile,
  JSON.stringify(
    carryRolesIntoFieldMap(previousFieldMap, {
      generatedAt: new Date().toISOString(),
      collections: fieldMap,
      taxonomies: taxonomies.map((t) => ({
        name: t.name,
        collections: t.collections,
        terms: t.terms.map((x) => x.slug)
      })),
      menus: menus.map((m) => ({ name: m.name, items: m.items.length })),
      rewrites: rewritesApplied,
      slugRenames,
      unresolvedLinks
    }),
    null,
    '\t'
  ) + '\n'
)
const counts = Object.fromEntries(Object.entries(content).map(([k, v]) => [k, v.length]))
console.log(
  JSON.stringify({
    collections: collections.length,
    taxonomies: taxonomies.length,
    menus: menus.length,
    content: counts,
    media: mediaList.length,
    mediaTargets: mediaList.reduce((n, m) => n + m.targets.length, 0),
    rewrites: rewritesApplied.length,
    slugRenames: slugRenames.length,
    unresolvedLinks: unresolvedLinks.length
  })
)
if (unresolvedLinks.length) console.log('unresolved links:', JSON.stringify(unresolvedLinks.slice(0, 20)))
