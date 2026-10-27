#!/usr/bin/env node
// seed.mjs — put a spec-pack into a WordPress site, through wp-cli only, as many times as needed.
//
//   node scripts/seed.mjs --spec <dir> --wp "<runner>" --theme tracy-base \
//        --patterns-map <patterns.map.json> --images /src-images [--images-local <dir>] \
//        [--out <dir>] [--base-url http://127.0.0.1:8227] [--theme-src <pkg>] [--dist <dir>] \
//        [--contact-heading "<text>"] [--pattern-ns <slug>] [--typed-loss block|allow] [--dry-run] \
//        [--report <file>] [--no-routes] [--i18n none|polylang] [--wp-keep on|off] [--timeout <s>]
//
// Everything editable lands in the database as block markup: posts and pages (`post_content`),
// navigation (`wp_navigation` posts), the header and footer (`wp_template_part` overrides whose
// `core/navigation` blocks reference those menus), the Contact Form 7 forms, and the options that
// point at them. The theme stays a theme: templates, parts and patterns are files, the content
// that fills them is data.
//
// The run is idempotent by construction. Every object is looked up by its slug first; a
// fingerprint of the desired state is kept in post meta (`_tracy_seed`) so an unchanged object is
// skipped without a second look, a changed one is updated in place, and a second run creates
// nothing and keeps every id. Media is imported once and indexed in `<out>/media.json`; a missing
// entry is re-imported, an existing attachment is reused. Nothing is deleted.
//
// Sections: a page whose Joomla article carried `{loadposition x}` has a slot marker in its block
// markup; the ACM instances assigned to that page and position (sections.json) are rendered from
// the theme's registered patterns through patterns.map.json (block-fill.mjs, by metadata.name) and
// take the marker's place. The two OpenDesign pages (`/`, `/resources/home-onepage`) are lists of
// section HTML; each is written into the matching `tracy/section-*` library pattern by structural
// alignment (fillFromLibrary), and a section that cannot be aligned goes in as `core/html` and is
// listed in the report — the report is the place a reviewer looks, not the page.
//
// A spec-pack from HTML types its sections (hero, services, projects, …) with normalised `fields`
// and `items`; a theme whose patterns.map.json keys `types` by that sectionType and names its
// blocks by the uniform `<type>.<field>` / `<type>.item.<n>.<field>` schema (wp-tracy-business)
// is filled by name through renderTypedSection — before the library alignment, never after it.
// An untyped section that is a list of links takes the `links` pattern by shape (linksShape).
// The theme's pattern namespace is `--pattern-ns`, else the map's `namespace`, else `--theme`.
//
// Verbatim HTML (core/html) keeps the inline styles a canvas export baked in — `background:
// rgb(237,234,226)` is the light value of a token the source resolved through a variable, and it
// stays light under the theme's dark palette. A literal within 12 RGB of a theme colour preset
// is rewritten to `var(--wp--preset--color--<slug>)` (lib/inline-colors.mjs); the palette is the
// spec's design-contract.json plus the theme package's tokens.css / theme.json (loadPalette), and
// the report lists per page how many literals were mapped and how many kept.

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync, lstatSync, statSync, rmSync } from 'node:fs'
import { resolve, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createRunner, keepDefault, listPosts, TimeoutError } from './lib/wp-cli.mjs'
import { seedLanguages, pllLink } from './lib/polylang.mjs'
import { createPostBatch, fingerprint } from './lib/post-batch.mjs'
import { WP_DEFAULTS } from './quickstart/lib.mjs'
import {
  parseBlocks,
  serializeBlocks,
  findBlock,
  findAll,
  removeBlock,
  setText,
  setHref,
  setImage,
  setClasses,
  getClasses,
  setLevel,
  setSummary,
  setRootAttr,
  setListItems,
  repeatItems,
  blockName,
  walkBlocks,
  fillFromLibrary,
  pruneEmptyContainers,
  isEmptyContainer,
  checkMarkup,
  escapeHtml,
  richText,
  breaksAsMarkup
} from './lib/block-fill.mjs'
import { htmlToBlocks, decodeUrlPath, POST_BODY_MARKER } from './lib/html-to-blocks.mjs'
import { articleHead, articleTail, sourceCards, sourceTocs, categoryLabel, parseDateText, scheduleDates, distinctDates, isFeatured, stripSourceBreadcrumb } from './lib/post-content.mjs'
import { typeset } from './lib/typeset.mjs'
import { slugify } from './lib/html-content.mjs'
import { sourceForm, cf7Form, cf7MailBody, cf7FormText, embedShortcode } from './lib/form-embed.mjs'
import { extractRuns, norm } from './lib/parity-extract.mjs'
import {
  presetInlineColors,
  paletteFromContract,
  paletteFromTokensCss,
  paletteFromThemeJson,
  mergePalettes
} from './lib/inline-colors.mjs'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('')
const { document } = dom.window
const textOf = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '')

/**
 * An OpenDesign module that is really one of the theme's ACM sections, as an ACM instance:
 * `data-od-block="testimonials"` (quote cards with name and role) → `testimonials:style-1`,
 * `data-od-block="team"` (portrait, name, role, bio per article) → `team:style-1`. The library
 * has no pattern for either, and their shapes never align with social-proof. The section head's
 * intro and a trailing note have no ACM field; they come back as `extras` for the caller to place.
 */
export function acmFromModule(html, moduleId = '') {
  const tpl = document.createElement('template')
  tpl.innerHTML = html
  const root = tpl.content.firstElementChild
  const kind = root?.getAttribute('data-od-block')
  if (!kind || !['testimonials', 'team'].includes(kind)) return null
  const head = root.querySelector('.section-head')
  const fields = {
    eyebrow: textOf(head?.querySelector('.kicker')),
    heading: textOf(head?.querySelector('h1, h2, h3'))
  }
  const extras = {
    intro: textOf(head?.querySelector('p')),
    note: textOf(root.querySelector('.od-demo-note'))
  }
  const items = []
  if (kind === 'testimonials') {
    for (const card of root.querySelectorAll('.grid-3 > div, .grid-3 > article')) {
      const quote = textOf(card.querySelector('p'))
      // The byline: the innermost divs after the quote (name, then role); the initials span is G19.
      const lines = [...card.querySelectorAll('div')]
        .filter((d) => !d.querySelector('div') && !d.querySelector('p'))
        .map(textOf)
        .filter(Boolean)
      const name = lines[0] ?? ''
      const role = lines[1] ?? ''
      items.push({ quote, 'quote-name': name, 'quote-role': role, 'quote-avatar': '' })
    }
    fields.columns = String(Math.min(3, Math.max(2, items.length)))
    return { instance: { id: moduleId, type: 'testimonials', style: 'style-1', fields, items }, extras }
  }
  for (const card of root.querySelectorAll('article')) {
    const ps = [...card.querySelectorAll('p')]
    items.push({
      'member-portrait': card.querySelector('img')?.getAttribute('src') ?? '',
      'member-name': textOf(card.querySelector('h3, h4')),
      'member-role': textOf(ps.find((el) => /role/.test(el.getAttribute('class') ?? '')) ?? ps[0]),
      'member-bio': textOf(ps.filter((el) => !/role/.test(el.getAttribute('class') ?? '')).pop()),
      'member-link': ''
    })
  }
  fields.columns = String(Math.min(4, Math.max(2, items.length)))
  return { instance: { id: moduleId, type: 'team', style: 'style-1', fields, items }, extras }
}

// ---------------------------------------------------------------------------------------------
// Arguments and inputs

export function parseArgs(argv) {
  const opts = { dryRun: false, routes: true }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    switch (a) {
      case '--spec':
        opts.spec = resolve(next())
        break
      case '--wp':
        opts.wp = next()
        break
      case '--theme':
        opts.theme = next()
        break
      case '--patterns-map':
        opts.patternsMap = resolve(next())
        break
      case '--images':
        opts.images = next()
        break
      case '--images-local':
        opts.imagesLocal = resolve(next())
        break
      case '--out':
        opts.out = resolve(next())
        break
      case '--base-url':
        opts.baseUrl = next()
        break
      case '--theme-src':
        opts.themeSrc = resolve(next())
        break
      case '--dist':
        opts.dist = resolve(next())
        break
      case '--report':
        opts.report = resolve(next())
        break
      case '--contact-heading':
        opts.contactHeading = next()
        break
      case '--pattern-ns':
        opts.patternNs = next()
        break
      case '--typed-loss':
        opts.typedLoss = next()
        if (!['block', 'allow'].includes(opts.typedLoss)) throw new Error('--typed-loss takes block or allow')
        break
      case '--i18n':
        opts.i18n = next()
        if (!['none', 'polylang'].includes(opts.i18n)) throw new Error('--i18n takes none or polylang')
        break
      case '--dry-run':
        opts.dryRun = true
        break
      case '--no-routes':
        opts.routes = false
        break
      case '--wp-keep':
        opts.wpKeep = next()
        if (!['on', 'off'].includes(opts.wpKeep)) throw new Error('--wp-keep takes on or off')
        break
      case '--timeout':
        opts.timeout = Number(next())
        if (!Number.isFinite(opts.timeout) || opts.timeout <= 0) throw new Error('--timeout takes seconds')
        break
      default:
        throw new Error(`Unknown argument ${a}`)
    }
  }
  for (const k of ['spec', 'wp', 'theme', 'patternsMap', 'images'])
    if (!opts[k]) throw new Error(`--${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())} is required`)
  opts.out ??= resolve(opts.spec, '..', 'seed')
  opts.report ??= join(opts.out, 'report.json')
  opts.baseUrl ??= 'http://127.0.0.1:8227'
  opts.typedLoss ??= 'block'
  opts.i18n ??= 'none'
  opts.wpKeep ??= keepDefault() ? 'on' : 'off'
  opts.timeout ??= 900
  return opts
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

export function loadSpec(dir) {
  const spec = {}
  for (const f of ['page-map', 'content', 'sections', 'menus', 'redirects'])
    spec[f.replace('-', '')] = readJson(join(dir, `${f}.json`))
  const copy = join(dir, 'copy.json')
  spec.copy = existsSync(copy) ? applyCopyFixes(spec, readJson(copy).fixes ?? []) : []
  return spec
}

// Keys whose value names a thing, not says it: a copy fix never lands in an id, a path or a file.
const COPY_SKIP = new Set(['id', 'slug', 'wpSlug', 'path', 'wpPath', 'file', 'src', 'img', 'href', 'original', 'locale', 'view', 'position', 'sectionType', 'menutype'])

/**
 * `<spec>/copy.json` — what the site says differently from the design copy, one entry per
 * decision: `{ "fixes": [{ "find", "replace", "reason" }] }`. A design mock says "pick one of
 * the sections on the right" where the port's 390 px layout stacks those sections below; a deck
 * list writes one title in Title Case among sentence-case neighbours. The spec-pack is
 * generated (a re-ingest overwrites content.json and sections.json) so the fix cannot live in
 * it; it lives beside it, survives a re-ingest, and is applied on load to every string of the
 * spec — a section's html and its fields alike, so the seeder's coverage of the source's runs
 * still holds. Literal, case-sensitive, so a `find` includes enough of its sentence not to hit a
 * file name ("Corporate Deck 2028 — full slide library", not "Corporate Deck 2028", which is
 * also a PDF's name). Returns the fixes with their hit counts; a fix that hit nothing is the
 * seeder's to report — the copy it meant to change has moved.
 */
export function applyCopyFixes(spec, fixes) {
  const done = fixes.map((f) => ({ ...f, hits: 0 }))
  const walk = (node, key = null) => {
    if (typeof node === 'string') {
      if (COPY_SKIP.has(key)) return node
      let out = node
      for (const f of done) {
        if (!f.find || !out.includes(f.find)) continue
        f.hits += out.split(f.find).length - 1
        out = out.split(f.find).join(f.replace ?? '')
      }
      return out
    }
    if (Array.isArray(node)) return node.map((v) => walk(v, key))
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) node[k] = walk(v, k)
      return node
    }
    return node
  }
  for (const part of ['pagemap', 'content', 'sections', 'menus']) if (spec[part]) walk(spec[part])
  return done
}

/**
 * Category titles as the listing page names them. A post's category comes from its card's
 * eyebrow, which the design writes in the singular ("Disclosure"); the listing's filter row
 * names the same category in the plural ("Disclosures"), and that row is what a reader sees as
 * the category's name. Where a filter label equals a category's title, or is its plural
 * (`-s`, `-es`, `-ies`), the title becomes the label; a filter that matches no category
 * ("Careers", drawn for posts the mock never wrote) names nothing, and is listed in the notes.
 * `filters` is `Map(locale → [label, …])` (`listingFilters`); categories carry `locale`.
 */
export function nameCategoriesFromListing(categories, filters, { defaultLocale = null, notes = [] } = {}) {
  const plural = (t) => {
    const k = titleKey(t)
    return new Set([k, `${k}s`, `${k}es`, k.endsWith('y') ? `${k.slice(0, -1)}ies` : k])
  }
  const localeOf = (l) => l ?? defaultLocale ?? null
  for (const [locale, labels] of filters) {
    const unmatched = []
    for (const label of labels) {
      const hit = categories.find((c) => localeOf(c.locale) === localeOf(locale) && plural(c.title).has(titleKey(label)))
      if (!hit) {
        unmatched.push(label)
        continue
      }
      if (hit.title !== label) {
        notes.push({ category: hit.wpSlug, note: `named "${label}" as the listing's filter row prints it (the cards' eyebrow says "${hit.title}")` })
        hit.title = label
      }
    }
    if (unmatched.length) notes.push({ locale, note: `listing filters with no category behind them: ${unmatched.join(', ')} — the mock's chips; no post carries that eyebrow` })
  }
  return categories
}

/**
 * The filter row of each listing page, by locale: `Map(locale → [label, …])` from the
 * `fields.filters` of a section on a listing path (the posts page, a category archive), the
 * "All" chip dropped.
 */
/**
 * Two spec categories on one slug are one WordPress term: the seeder kept the first and filed the
 * other's posts under it (a services listing printed the portfolio's posts, #10). Throws, naming
 * both, before anything is written; the adapter's slug rule (references/inputs/from-joomla.md)
 * gives each its full path.
 */
export function checkCategorySlugs(categories) {
  const seen = new Map()
  for (const c of categories ?? []) {
    const key = `${c.locale ?? ''}|${c.wpSlug}`
    const other = seen.get(key)
    if (other)
      throw new Error(
        `category slug "${c.wpSlug}" is shared by #${other.id ?? other.title} and #${c.id ?? c.title}` +
          `${c.locale ? ` (locale ${c.locale})` : ''}: one term would carry both; give each its own slug in content.json (from-joomla: the category's full path)`
      )
    seen.set(key, c)
  }
}

export function listingFilters(spec) {
  const listing = new Set((spec.content?.archives ?? []).map((a) => a.path).filter(Boolean))
  const out = new Map()
  const all = [...(spec.sections?.custom ?? []), ...(spec.sections?.acm ?? []), ...(spec.sections?.other ?? [])]
  for (const s of all) {
    const labels = (s.fields?.filters ?? []).filter((f) => !/^(all|все)$/i.test(String(f).trim()))
    if (!labels.length || !(s.pages ?? []).some((p) => listing.has(p.wpPath ?? p.path))) continue
    const locale = s.locale ?? null
    if (!out.has(locale)) out.set(locale, [])
    for (const l of labels) if (!out.get(locale).includes(l)) out.get(locale).push(l)
  }
  return out
}

/**
 * The colour presets a core/html literal may be mapped to, by slug: `<spec>/design-contract.json`
 * (measured, desktop-light), overlaid by `<theme-src>/overlays/<theme>/tokens.css` and
 * `<theme-src>/src/<theme>/theme.json` when `--theme-src` names the theme package. Each source
 * read is named in the report; none present means no rewriting, and the report says so.
 */
export function loadPalette(opts, report) {
  const sources = []
  const layers = []
  const contractPath = join(opts.spec, 'design-contract.json')
  if (existsSync(contractPath)) {
    layers.push(paletteFromContract(readJson(contractPath)))
    sources.push(contractPath)
  }
  if (opts.themeSrc) {
    const tokensPath = join(opts.themeSrc, 'overlays', opts.theme, 'tokens.css')
    if (existsSync(tokensPath)) {
      layers.push(paletteFromTokensCss(readFileSync(tokensPath, 'utf8')))
      sources.push(tokensPath)
    }
    const themeJsonPath = join(opts.themeSrc, 'src', opts.theme, 'theme.json')
    if (existsSync(themeJsonPath)) {
      layers.push(paletteFromThemeJson(readJson(themeJsonPath)))
      sources.push(themeJsonPath)
    }
  }
  const palette = mergePalettes(...layers)
  report.palette = { sources, presets: palette.length }
  if (!palette.length) report.notes.push({ note: 'no colour palette found; inline colour literals in core/html left as written' })
  return palette
}

function loadSpacingPresets(opts) {
  const path = opts.themeSrc ? join(opts.themeSrc, 'src', opts.theme, 'theme.json') : null
  if (!path || !existsSync(path)) return []
  const sizes = readJson(path)?.settings?.spacing?.spacingSizes
  return Array.isArray(sizes) ? sizes.filter((entry) => typeof entry?.slug === 'string') : []
}

/** The option the theme's template_redirect hook reads: its slug with `-` as `_` (inc/extra.php). */
export const redirectsOption = (theme) => `${theme.replace(/-/g, '_')}_redirects`
/** The option naming the source's "not found" page (kept as a draft) that the 404 template draws. */
export const notFoundOption = (theme) => `${theme.replace(/-/g, '_')}_404_page`
/**
 * The page-map page with view 404 in the default locale, or null. A synthetic one counts: a Joomla
 * source serves error.php for an unknown path and no route names it, yet its words still belong
 * in the database (notFoundDraft).
 */
export function notFoundPage(pages, defaultLocale = null) {
  const found = (pages ?? []).filter((p) => p.view === '404' && p.path)
  return found.find((p) => !defaultLocale || p.locale === defaultLocale) ?? found[0] ?? null
}

/**
 * The draft the 404 template draws (`<theme>_404_page`) when no seeded page sits at the 404
 * view's path: the source's own not-found page (a spec page with view 404 and no path — the
 * adapter's "Error page" article), else a draft made from what the spec knows, the page-map
 * title. Always a draft, so the 404 path keeps answering 404; a slug that a routed top-level
 * page also has gets `-404`, or the two would be matched to one post. `created` says the page is
 * new and must be added to the list. Null when a seeded page is already the 404 page.
 */
export function notFoundDraft(notFound, pages, defaultLocale = null) {
  if (!notFound) return null
  if (notFound.path && pages.some((p) => p.path === notFound.path)) return null
  let page = pages.find(
    (p) => p.view === '404' && !p.path && (!defaultLocale || !p.locale || p.locale === defaultLocale)
  )
  const created = !page
  if (!page) {
    const title = notFound.title || 'Not found'
    page = {
      file: notFound.file ?? null,
      title,
      slug: 'page-not-found',
      wpSlug: 'page-not-found',
      path: null,
      parent: null,
      view: '404',
      ...(notFound.locale ? { locale: notFound.locale } : {}),
      synthetic: true,
      syntheticReason: `the 404 view ${notFound.path} has no page in the spec; the draft holds its page-map title`,
      content: heading(escapeHtml(title), 1),
      meta: {},
      images: []
    }
  }
  page.status = 'draft'
  const routed = new Set(pages.filter((p) => p !== page && p.path && !p.parent).map((p) => p.wpSlug))
  if (routed.has(page.wpSlug)) page.wpSlug = `${page.wpSlug}-404`
  return { page, created }
}

/**
 * `menu_order` for every child page (a path and a parent): its place among its siblings, 1-based,
 * in the spec's order — except that pages from Joomla articles take the article slots in the
 * source's category order (`joomla.ordering`, then article id), which is what the source's own
 * lists follow. A page's explicit integer `menuOrder` wins. Without it siblings all tie at 0 and
 * a child-page list comes out in whatever order the ids were inserted. Top-level pages keep
 * WordPress's 0: the site's order there is its navigation, and numbering them would rewrite every
 * top-level page whenever one is added or moved (a Polylang switch).
 */
export function pageMenuOrder(pages) {
  const groups = new Map()
  for (const p of pages) {
    if (!p.path || !p.parent) continue
    const key = p.parent
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(p)
  }
  const isArticle = (p) => p.joomla?.articleId != null && p.joomla.articleId !== ''
  const order = new Map()
  for (const list of groups.values()) {
    const slots = list.flatMap((p, i) => (isArticle(p) ? [i] : []))
    const sorted = slots
      .map((i) => list[i])
      .sort(
        (a, b) =>
          (Number(a.joomla.ordering) || 0) - (Number(b.joomla.ordering) || 0) ||
          Number(a.joomla.articleId) - Number(b.joomla.articleId)
      )
    const placed = [...list]
    slots.forEach((slot, n) => (placed[slot] = sorted[n]))
    placed.forEach((p, i) => order.set(p, Number.isInteger(p.menuOrder) ? p.menuOrder : i + 1))
  }
  return order
}

/**
 * WordPress's own first content still as installed — "Hello world!" and "Sample Page" by type,
 * slug and title (quickstart/lib.mjs WP_DEFAULTS), never edited (modified = created), not already
 * in the trash, and not a post this run seeded (`keepIds`: a spec that has a page `sample-page`
 * matched it by slug). The seeder moves these to the trash; a listing otherwise shows a post the
 * source never had.
 */
export function installSamples(rows, { keepIds = new Set() } = {}) {
  return (rows ?? []).filter(
    (r) =>
      WP_DEFAULTS.some((d) => d.post_type === r.post_type && d.post_name === r.post_name && d.title.test(String(r.post_title ?? '').trim())) &&
      r.post_status !== 'trash' &&
      Boolean(r.post_date) &&
      r.post_modified === r.post_date &&
      !keepIds.has(Number(r.ID))
  )
}

/**
 * Published posts WordPress files under the category `slug` or one below it (`category_name`
 * includes children), whoever wrote them, less those carrying a tag in `excludeTagIds` (the
 * listing's own exclusion); null when the list cannot be read.
 */
function publishedPostCount(wp, slug, { excludeTagIds = [] } = {}) {
  const r = wp.run(
    [
      'post', 'list', '--post_type=post', '--post_status=publish', `--category_name=${slug}`,
      // The listing leaves the archived tag out; so does the count (WP-CLI splits a `__` argument
      // on commas into WP_Query's list).
      ...(excludeTagIds.length ? [`--tag__not_in=${excludeTagIds.join(',')}`] : []),
      '--posts_per_page=-1', '--format=ids'
    ],
    { allowFail: true, mutate: false }
  )
  if (r.code !== 0) return null
  const ids = r.stdout.trim()
  return ids ? ids.split(/\s+/).length : 0
}

const memo = (fn) => {
  const seen = new Map()
  return (key) => {
    if (!seen.has(key)) seen.set(key, fn(key))
    return seen.get(key)
  }
}

/**
 * Install samples something still points at, id → what: the front page or posts page option, a
 * classic menu item, or another post's content — a block `"id"`/`"postId"`, a `?p=`/`?page_id=`
 * link or a link to its slug. Trashing one of those breaks the front page, a menu or a link.
 * `contents`: `{ ID, post_content }` of every other live post of any type; `menuItems`: sample
 * id → nav_menu_item ids.
 */
export function sampleReferences(samples, { options = {}, contents = [], menuItems = new Map() } = {}) {
  const refs = new Map()
  const note = (id, what) => refs.set(id, [...(refs.get(id) ?? []), what])
  for (const r of samples) {
    const id = Number(r.ID)
    for (const key of ['page_on_front', 'page_for_posts']) if (Number(options[key]) === id) note(id, `option ${key}`)
    if (menuItems.get(id)?.length) note(id, `menu item #${menuItems.get(id).join(', #')}`)
    const slug = String(r.post_name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // A link to its slug: an `href`, or the `"url"` a block keeps in its attributes (a custom
    // navigation-link), with or without JSON's escaped slashes.
    const pattern = new RegExp(
      `"(?:id|postId)":${id}(?!\\d)|[?&](?:p|page_id)=${id}(?!\\d)|href="[^"]*/${slug}/?(?:["?#])|"url":"[^"]*(?:/|\\\\/)${slug}(?:/|\\\\/)?(?:["?#])`
    )
    const by = contents.filter((c) => Number(c.ID) !== id && pattern.test(String(c.post_content ?? ''))).map((c) => `#${c.ID}`)
    if (by.length) note(id, `content of ${by.join(', ')}`)
  }
  return refs
}

// What `wp option get` prints for an option the site does not hold (WP-CLI's Option_Command).
const OPTION_UNSET = /Could not get '[^']+' option/

/**
 * `sampleReferences` over what the site holds now; null when any of it cannot be read.
 */
function readSampleReferences(wp, samples) {
  const read = (args) => {
    const r = wp.run(args, { allowFail: true, mutate: false })
    return r.code === 0 ? r.stdout.trim() : null
  }
  const options = {}
  for (const key of ['page_on_front', 'page_for_posts']) {
    const r = wp.run(['option', 'get', key], { allowFail: true, mutate: false })
    // An option never set is not a reference; any other failure leaves the reference unknown.
    if (r.code === 0) options[key] = r.stdout.trim()
    else if (OPTION_UNSET.test(r.stderr ?? '')) options[key] = '0'
    else return null
  }
  const text = read([
    'post', 'list', `--post_type=${CONTENT_TYPES.join(',')}`, '--post_status=any', '--posts_per_page=-1', '--fields=ID,post_content', '--format=json'
  ])
  if (text === null) return null
  let contents
  try {
    contents = text ? JSON.parse(text) : []
  } catch {
    return null
  }
  const menuItems = new Map()
  for (const r of samples) {
    const ids = read([
      'post', 'list', '--post_type=nav_menu_item', '--post_status=any', '--posts_per_page=-1',
      '--meta_key=_menu_item_object_id', `--meta_value=${r.ID}`, '--format=ids'
    ])
    if (ids === null) return null
    if (ids) menuItems.set(Number(r.ID), ids.split(/\s+/))
  }
  return sampleReferences(samples, { options, contents, menuItems })
}

// Post types whose content can point at a post: pages, posts, navigation menus, synced patterns
// and the site editor's templates and parts.
const CONTENT_TYPES = ['post', 'page', 'wp_navigation', 'wp_block', 'wp_template', 'wp_template_part']

/**
 * The page-map page that is the posts index (`view: 'home'`, not synthesised), in the default
 * locale when one is set; null when the spec has none — a site whose blog is a category archive.
 */
export function postsPage(pages, defaultLocale = null) {
  const homes = (pages ?? []).filter((p) => p.view === 'home' && !p.synthetic && p.path)
  return homes.find((p) => !defaultLocale || p.locale === defaultLocale) ?? homes[0] ?? null
}

/**
 * The lead of a page: the intro of its h1 section (`sections.custom[]` entry with
 * `fields.headingLevel` 1 that lists the page). A posts page has no body of its own — the theme's
 * blog template draws the loop — so this is what its excerpt holds, and what a `home.lead` block
 * reads back; the spec's own `excerpt` wins when set.
 */
export function pageLead(page, spec) {
  if (page.excerpt) return page.excerpt
  const h1 = sectionsOfPage(page, spec).find((c) => Number(c.fields?.headingLevel) === 1 && c.fields?.intro)
  return h1?.fields.intro ?? ''
}

/**
 * The spec sections a page lists, in the spec's order: an entry naming the page's path or its file.
 * Only identities both sides carry are compared — a page without a file (an archive route the
 * seeder builds) matched every `pages: ['ALL']` module through `undefined === undefined`, and the
 * footer's company line became three listings' excerpt. A module on every page is chrome, not one
 * page's own section.
 */
export const sectionsOfPage = (page, spec) =>
  (spec?.sections?.custom ?? []).filter((c) =>
    (c.pages ?? []).some(
      (p) => p && typeof p === 'object' && ((p.wpPath && page.path && p.wpPath === page.path) || (p.file && page.file && p.file === page.file))
    )
  )

/**
 * The first sentence of prose in a body of blocks: the text of the first `p` / `li` / `td` /
 * `figcaption` long enough to be a sentence, headings skipped. A page whose body is the export's
 * verbatim markup (a style guide, a form library) has no typed section to read a lead from, and
 * its first paragraph is the lede the designer wrote under the h1.
 */
export function bodyLead(content, { minWords = 6 } = {}) {
  const s = String(content ?? '')
  if (!s) return ''
  for (const m of s.matchAll(/<(p|li|td|figcaption|blockquote)\b[^>]*>([^]*?)<\/\1>/gi)) {
    const t = stripTags(m[2])
    if (t && t.split(' ').length >= minWords) return t
  }
  return ''
}

/**
 * The excerpt of a page: what the search results print, what a meta description and a share card
 * are built from. The spec's own excerpt wins, then the lead of the page's h1 section, then the
 * first paragraph of its body.
 *
 * Never WordPress's auto-excerpt. That one flattens the WHOLE page — `wp_trim_words` strips every
 * tag from the rendered content — so a search result read "Below is a selection from the last
 * three years. All Production Logistics Energy Refurbishment…" (the filter chips), "1 · Module
 * position map topbar logo menu header-cta hero…" (the module map) or "640 Employees…" (a stat
 * figure), and every result opened by repeating its own title. It also drops `<br>` without a
 * space, which is where "groundwork fornext-generation plants" and «длязаводов» came from: the
 * hero heading is two elements with a break between them. A seeded excerpt is the one text the
 * page states about itself, and every surface that asks WordPress for one gets it.
 */
export function pageExcerpt(page, spec) {
  // An archive route says what it says about itself in `archives[].excerpt` (the adapter reads the
  // source's masthead line); declared empty is empty. A listing the seeder builds as a page has no
  // prose of its own to read one from, so without a declared excerpt it has none.
  const declared = typeof page.archive?.excerpt === 'string' ? page.archive.excerpt : null
  if (page.synthetic && page.archive) return page.excerpt || declared || ''
  if (!page.excerpt && declared !== null) return declared
  const lead = pageLead(page, spec)
  if (lead) return lead
  const body = bodyLead(page.content)
  if (body) return body
  // A page the spec holds as sections (`contentKind: 'sections'`) has no body of its own here:
  // its lede is a paragraph inside the first section's markup.
  for (const section of sectionsOfPage(page, spec)) {
    const t = bodyLead(section.html)
    if (t) return t
  }
  return ''
}

export { fingerprint }

// ---------------------------------------------------------------------------------------------
// Images

/**
 * A name of the seeder's own made of `base` and `tail`, kept within the 200 characters of a post name (the base gives
 * way, never the tail, and never ends inside a `%xx`). The site's stored name is read back, never assumed.
 */
export function suffixedSlug(base, tail) {
  if (base.length + tail.length <= 200) return `${base}${tail}`
  return `${base.slice(0, 200 - tail.length).replace(/%[0-9a-f]?$/i, '').replace(/-+$/, '')}${tail}`
}

/**
 * Two source articles that share one spec slug (the adapter slugs posts by title; the source tells them
 * apart by alias) would be one WordPress post: WordPress saves the second as `<slug>-2`, and a lookup by
 * post_name finds the first for both, so every run rewrites it. The seeder decides the names, the same on
 * every run and in any order of the spec. Slugs are one space for the whole site, in every locale (Polylang
 * free cannot give two languages one slug). In each group of posts on one slug the post whose Joomla alias is the shared slug
 * keeps it (else the lowest article id). Every other post is then named in article-id order, across all
 * groups at once: its own alias when that is free, else `<slug>-<articleId>` (a Joomla alias is unique per
 * category only), with `-2`, `-3`, … while the name is held by another post of the spec. Every post of a
 * group remembers the slug the group shared (`slugGroup`): every post with a source article id carries it, and only a row that names the article is its own (`planPostRows`).
 * A clash with no alias and no article id to fall back on is left as it is and noted. Mutates `posts`;
 * returns the notes.
 */
export function dedupePostSlugs(posts) {
  const notes = []
  const nameOf = (p, slug) => wpPostName(slug)
  const groups = new Map()
  for (const p of posts) {
    const key = nameOf(p, p.slug)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(p)
  }
  const idOf = (p) => (p.joomla?.articleId != null && p.joomla.articleId !== '' ? Number(p.joomla.articleId) : NaN)
  const rank = (p) => (Number.isFinite(idOf(p)) ? idOf(p) : Infinity)
  // The article id orders the posts; the position in the spec decides only between posts with no id (they are noted, never named).
  const byIdentity = (a, b) => (rank(a) === rank(b) ? posts.indexOf(a) - posts.indexOf(b) : rank(a) - rank(b))
  // post_name is cut at 200 characters: the id suffix is kept and the base gives way.
  const withSuffix = (slug, tail) => {
    const base = wpPostName(slug)
    return suffixedSlug(base, tail)
  }
  const taken = new Set(posts.map((p) => nameOf(p, p.slug)))
  const queue = []
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const shared = group[0].slug
    const ordered = [...group].sort(byIdentity)
    const keeper = ordered.find((p) => p.joomla?.alias && wpPostName(p.joomla.alias) === wpPostName(shared)) ?? ordered[0]
    for (const p of ordered) {
      p.slugGroup = shared
      if (p !== keeper) queue.push({ p, shared, size: group.length })
    }
  }
  for (const { p, shared, size } of queue.sort((a, b) => byIdentity(a.p, b.p))) {
    const alias = p.joomla?.alias
    let next = alias && !taken.has(nameOf(p, alias)) ? alias : null
    if (!next && Number.isFinite(idOf(p))) {
      const tail = `-${wpPostName(String(p.joomla.articleId))}`
      next = withSuffix(shared, tail)
      for (let n = 2; taken.has(nameOf(p, next)); n++) next = withSuffix(shared, `${tail}-${n}`)
    }
    if (!next) {
      notes.push({ post: shared, note: `slug ${shared} is shared by ${size} posts; ${p.title} has no alias or article id of its own to take` })
      continue
    }
    taken.add(nameOf(p, next))
    notes.push({ post: next, note: `slug ${shared} is shared by ${size} source articles; "${p.title}" ${next === alias ? `takes its own alias ${alias}` : `takes ${next} (the slug and its article id ${p.joomla.articleId}: the alias is not free)`}` })
    p.slug = next
  }
  return notes
}

/** The post meta that names the source article a post of a slug group was made for (written with the post). */
export const SOURCE_ARTICLE_META = '_tracy_source_article'

/**
 * The site's posts and the article each was made for (`SOURCE_ARTICLE_META`, one read of the postmeta table), planned
 * against the spec's posts (`planPostRows`). A dry run writes nothing and reads no identity: a post takes the row on its name.
 */
function readPostRows(wp, posts) {
  const rows = listPosts(wp, 'post')
  if (wp.dryRun) {
    const byName = new Map(rows.map((r) => [r.post_name.toLowerCase(), r]))
    return new Map(posts.map((p) => [p, byName.get(wpPostName(p.slug)) ?? null]))
  }
  let identities
  try {
    const list = JSON.parse(wp.phpEval(`global $wpdb;echo json_encode($wpdb->get_results($wpdb->prepare("SELECT post_id,meta_value FROM {$wpdb->postmeta} WHERE meta_key=%s",'${SOURCE_ARTICLE_META}'),ARRAY_A));`, { mutate: false }))
    if (!Array.isArray(list)) throw new Error('not a list')
    identities = new Map(list.map((r) => [Number(r.post_id), String(r.meta_value)]))
  } catch (e) {
    throw new Error(`posts: the article each post was made for (${SOURCE_ARTICLE_META}) could not be read (${String(e.message).split('\n')[0]}); nothing was written`)
  }
  return planPostRows(posts, rows, (id) => identities.get(Number(id)) ?? null)
}

/**
 * The row each post of the spec will be written onto, decided before any post is written. A row belongs to an
 * article only when its `SOURCE_ARTICLE_META` names that article: nothing is read from the row's name, title or
 * fingerprint. `rows` are the site's posts (`{ ID, post_name, post_title }`), `identityOf(id)` the stored article id or null.
 * A post takes the one row that names one of its articles (it is renamed there if the name differs). Else it takes the row
 * that already holds the slug the seeder wants for it, but only if that row is free to take: a post
 * with a source article id never takes a row without an identity (a post with none has nothing to carry: it takes the row on its name), and no post takes a row that names another article. Anything
 * else stops the seed, naming the article, the slug and the row, before a single write. Returns `Map(post → row | null)`.
 */
export function planPostRows(posts, rows, identityOf) {
  const byName = new Map()
  for (const r of rows) byName.set(r.post_name.toLowerCase(), [...(byName.get(r.post_name.toLowerCase()) ?? []), r])
  const plan = new Map()
  const taken = new Map()
  const fail = (msg) => {
    throw new Error(`posts: ${msg}; nothing was written. Seed the site clean, or trash or rename that row in WordPress, and seed again`)
  }
  const who = (p) => `article ${articleIdsOf(p)[0] ?? '?'} ("${p.title}")`
  for (const p of posts) {
    const ids = articleIdsOf(p)
    const name = wpPostName(p.slug)
    const own = ids.length ? rows.filter((r) => ids.includes(identityOf(r.ID))) : []
    if (own.length > 1) fail(`${who(p)} has several rows that name it: ${own.map((r) => `${r.ID} (${r.post_name})`).join(', ')}`)
    const holders = (byName.get(name) ?? []).filter((r) => !own.includes(r))
    let row = own[0] ?? null
    for (const h of holders) {
      const named = identityOf(h.ID)
      if (!row && named === null && !ids.length) {
        row = h // a post with no source article id has no identity to carry: the row on its name, as it always was
        continue
      }
      fail(`${who(p)} wants the slug ${name}, which post ${h.ID} ("${h.post_title}") holds ${named === null ? 'with no article identity (made by an earlier seed or by hand)' : `for article ${named}`}`)
    }
    if (row) {
      if (taken.has(Number(row.ID))) fail(`post ${row.ID} would be written for two posts of the spec: ${who(taken.get(Number(row.ID)))} and ${who(p)}`)
      taken.set(Number(row.ID), p)
    }
    plan.set(p, row)
  }
  return plan
}

/** The article ids a post answers for: its own and the ones merged into it (`mergeSharedArticles`). */
const articleIdsOf = (p) => [p.joomla?.articleId, ...(p.joomla?.alsoArticleIds ?? [])].filter((x) => x != null && x !== '').map(String)

const bodyKey = (html) =>
  String(html ?? '')
    .replace(/<!--[^]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/**
 * Joomla lets one article alias stand in several categories, and a demo that shows one article in each
 * category exports it once per category: the same title, alias, picture and words, a different `catid`.
 * Seeded as is, WordPress holds one post per category — a listing that crosses categories prints the title
 * once per copy, and the second copy's slug is renumbered `-2` so every seed run rewrites it (S-03, JA Essence).
 * One article is ONE post in several categories: within a locale, posts that share the alias, the title, the
 * body words and the featured image are folded into the first (lowest article id); it keeps `category` as its
 * primary term, gains `categories` (every term, primary first) and remembers the ids it answers for
 * (`joomla.alsoArticleIds`) so a Joomla address of any copy still lands on it.
 *
 * Merging needs evidence, never the title alone: a post that shares the alias but differs in title, words or
 * picture is a different article and stays separate (`dedupePostSlugs` then renames it); a post with no alias
 * is never merged. Mutates `posts` (the folded copies are removed); returns the notes.
 */
export function mergeSharedArticles(posts) {
  const notes = []
  const groups = new Map()
  for (const p of posts) {
    const alias = p.joomla?.alias
    if (!alias || !p.category) continue
    const key = `${p.locale ?? ''}|${wpPostName(alias)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(p)
  }
  const drop = new Set()
  for (const group of groups.values()) {
    if (group.length < 2) continue
    group.sort((a, b) => Number(a.joomla?.articleId ?? Infinity) - Number(b.joomla?.articleId ?? Infinity))
    const keeper = group[0]
    const same = (p) => p.title === keeper.title && bodyKey(p.content) === bodyKey(keeper.content) && (p.featuredImage ?? null) === (keeper.featuredImage ?? null)
    for (const p of group.slice(1)) {
      if (!same(p)) {
        notes.push({ post: p.slug, note: `shares the alias ${keeper.joomla.alias} with "${keeper.title}" but differs in title, words or picture: a different article, not merged` })
        continue
      }
      keeper.categories ??= [keeper.category]
      if (!keeper.categories.includes(p.category)) keeper.categories.push(p.category)
      if (p.joomla?.articleId != null) (keeper.joomla.alsoArticleIds ??= []).push(String(p.joomla.articleId))
      drop.add(p)
      notes.push({ post: keeper.slug, note: `article ${p.joomla?.articleId ?? '?'} (category ${p.category}) is the same article as ${keeper.joomla.articleId ?? '?'}: one post in ${keeper.categories.length} categories` })
    }
  }
  if (drop.size) for (let i = posts.length - 1; i >= 0; i--) if (drop.has(posts[i])) posts.splice(i, 1)
  return notes
}

/**
 * Whether the term name WordPress stored is the name the spec wants. `sanitize_term` stores a name
 * HTML-encoded (`Design &amp; Build`), and `wp term list` prints it as stored, so a raw comparison
 * saw a change on every run and the seed never settled at `+0 ~0`.
 */
export function sameTermName(stored, wanted) {
  const decode = (v) =>
    String(v ?? '')
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&(amp|lt|gt|quot|apos);/g, (_, n) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[n])
  return stored === wanted || decode(stored) === decode(wanted)
}

/**
 * The post_name WordPress will store for a slug or a title — `sanitize_title()` in its `save`
 * context, step by step: accents folded on Latin letters only (remove_accents leaves Cyrillic
 * alone), lowercased, every non-ASCII byte percent-encoded with the ENCODED string cut at 200
 * characters (utf8_uri_encode — the cut counts characters that the next steps drop), nbsp and
 * dashes to hyphens, angle and curly quotes and a few symbols dropped, `.` to `-`, ASCII
 * punctuation dropped, whitespace to `-`. A Cyrillic title therefore becomes a long %xx run
 * truncated mid-word, and a lookup by the raw spec slug never matches it — the second run of a
 * seed on a Russian site created every post again with a -2 suffix. Passing this exact form as
 * --post_name, and comparing existing rows against it, keeps the seed idempotent for any script.
 */
export function wpPostName(slug) {
  const folded = [...String(slug ?? '').trim()]
    .map((ch) => {
      if (ch.charCodeAt(0) < 128) return ch
      const base = ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      return /^[A-Za-z]+$/.test(base) ? base : ch
    })
    .join('')
    .toLowerCase()
  let encoded = ''
  for (const ch of folded) {
    const piece =
      ch.charCodeAt(0) < 128
        ? ch
        : [...Buffer.from(ch, 'utf8')].map((b) => '%' + b.toString(16).padStart(2, '0')).join('')
    if (encoded.length + piece.length > 200) break
    encoded += piece
  }
  return encoded
    .replace(/%c2%a0|%e2%80%93|%e2%80%94/g, '-')
    .replace(/%c2%ad|%c2%a1|%c2%bf|%c2%ab|%c2%bb|%e2%80%b9|%e2%80%ba|%e2%80%98|%e2%80%99|%e2%80%9c|%e2%80%9d|%e2%80%9a|%e2%80%9b|%e2%80%9e|%e2%80%9f|%e2%80%a2|%c2%a9|%c2%ae|%c2%b0|%e2%80%a6|%e2%84%a2|%c2%b4|%cb%8a|%cc%81|%cd%81|%cc%80|%cc%b8|%cc%ac|%cc%84|%cc%8c/g, '')
    .replace(/%c3%97/g, 'x')
    .replace(/&.+?;/g, '')
    .replace(/\./g, '-')
    .replace(/[^%a-z0-9 _-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** A URL's path as a file path: fragment and query cut off, then decoded once (decodeUrlPath). */
const urlPath = (url) => decodeUrlPath(String(url ?? '').split('#')[0].split('?')[0])

/**
 * The key of an image reference that is a URL (an attribute, a featured image, an ACM field): the
 * fragment and query are cut off and the path is decoded once — `paint%20bucket.png` is the file
 * `paint bucket.png`, `hash%23tag.png` is `hash#tag.png`. A name on disk (an image table's `file`
 * or `original`) goes through pathKey, which cuts nothing: its `#` is part of the name.
 */
export function imageKey(ref) {
  return pathKey(urlPath(ref))
}

/** The key of a file path under the site root: a path under the images root, `{ basename }` for an uploads path, else null. */
function pathKey(path) {
  const clean = String(path ?? '').replace(/^\//, '')
  if (!clean) return null
  // A dot segment leaves the images tree (or names a place the import cannot trust): no image.
  if (clean.split('/').some((seg) => seg === '..' || seg === '.')) return null
  if (clean.startsWith('images/')) return clean.slice('images/'.length)
  if (clean.startsWith('wp-content/uploads/')) return { basename: clean.split('/').pop() }
  if (/^(https?:)?\/\//.test(clean)) return null
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(clean) && !clean.includes('/wp-content/')) return clean
  return null
}

/**
 * The attachment an image reference names: `{ hit, key, problem }`. A path under the images root
 * is its own key. An uploads-form ref (`/wp-content/uploads/<basename>`, what the adapters write)
 * names only a file name, and one site has many `item-1.jpg`: the name is looked up in the image
 * tables of what refers to it — `owner`, a list of tiers, nearest first (the page's own `images[]`,
 * then its sections', then the spec's) — and the first tier that lists the name decides. The
 * imported files are searched by name only when no table lists it, and only a single match counts.
 * Two sources for one name at the deciding level is `problem`, never the first one found: the
 * first-imported `blogs/intro/item-1.jpg` stood in for `others/item-1.jpg` on six service pages.
 */
// An image table entry's file name and source path: `file` and `original` are names on disk; `src`
// is a URL, decoded before it is compared.
const tableName = (i) => i?.file ?? urlPath(i?.src).split('/').pop()
const tableSource = (i) => [pathKey(i.original), i.src == null ? null : imageKey(i.src)].find((k) => typeof k === 'string') ?? null

export function resolveMedia(index, ref, owner = []) {
  const key = imageKey(ref)
  if (!key) return { hit: null, key: null }
  if (typeof key === 'string') return { hit: index.files[key] ?? null, key }
  const name = key.basename
  const nameOf = tableName
  for (const tier of owner) {
    const listed = (tier ?? []).filter((i) => nameOf(i) === name)
    const sourceOf = tableSource
    // A table that lists the name decides, even when its entry has no source path: a search by name
    // across the site would pick someone else's file of that name.
    const blind = listed.filter((i) => !sourceOf(i))
    if (blind.length) return { hit: null, key: null, problem: `${name}: its image table lists it without a source path (original); left as written` }
    const keys = [...new Set(listed.map(sourceOf))]
    if (keys.length > 1) return { hit: null, key: null, problem: `${name} is ambiguous: its image table lists ${keys.join(', ')}; left as written` }
    if (keys.length === 1) {
      const hit = index.files[keys[0]] ?? null
      return { hit, key: keys[0], ...(hit ? {} : { problem: `${name}: its source ${keys[0]} was not imported; left as written` }) }
    }
  }
  const named = Object.entries(index.files).filter(([, m]) => m.file === name)
  if (named.length > 1)
    return { hit: null, key: null, problem: `${name} is ambiguous: no image table of its own lists it and ${named.length} imported files carry the name (${named.map(([k]) => k).join(', ')}); left as written` }
  return named.length ? { hit: named[0][1], key: named[0][0] } : { hit: null, key: null }
}

/**
 * What an image reference IS, for telling two references apart (articleHead: is the body's first
 * picture the featured image?): `src:<path under the images root>` for a source path, or for an
 * uploads-form ref the first table of `tables` (nearest first, as resolveMedia) that lists its
 * file name resolves to one source; `url:<path>` for an uploads-form ref no table lists (a design
 * export: the URL is the file) or any other URL. Null when it cannot be told — a table lists the
 * name with two sources, or without one — so it is never "the same" as anything: `intro/item-1.jpg`
 * and `detail/item-1.jpg` share a file name and are two pictures (JA Vega M6-8).
 */
function imageIdentity(ref, tables = []) {
  const key = imageKey(ref)
  if (typeof key === 'string') return `src:${key}`
  const url = urlPath(ref).replace(/^\/+/, '')
  if (!key) return url ? `url:${url}` : null
  for (const tier of tables) {
    const listed = (tier ?? []).filter((i) => tableName(i) === key.basename)
    if (!listed.length) continue
    const sources = [...new Set(listed.map(tableSource))]
    return sources.length === 1 && sources[0] ? `src:${sources[0]}` : null
  }
  return `url:${url}`
}

/**
 * The image tables a page's markup is resolved against (resolveMedia `owner`), nearest first: the
 * page's own, then the sections assigned to it, then the modules on every page.
 */
export function pageImageTables(page, spec) {
  const custom = spec?.sections?.custom ?? []
  return [
    page.images ?? [],
    ...(page.routeImages?.length ? [page.routeImages] : []),
    sectionsOfPage(page, spec).flatMap((c) => c.images ?? []),
    custom.filter((c) => (c.pages ?? []).includes('ALL')).flatMap((c) => c.images ?? [])
  ]
}

/**
 * Attachments whose slug takes a route. WordPress serves an unattached attachment (post_parent 0) at
 * `/<post_name>/`, and a top-level page cannot have that name — the seeder's page gets `404-2`,
 * and `/404` 301s to the image file. `attachments`: `{ ID, post_name, post_parent }` rows;
 * `sources`: attachment id → the images-root key it was imported from; `routes`: the paths the
 * spec serves. Returns `[{ attachment, source, slug, route }]`.
 */
export function mediaRouteCollisions(attachments, sources, routes) {
  const top = new Map()
  for (const path of routes) {
    const segs = String(path ?? '').split('/').filter(Boolean)
    if (segs.length === 1 && !top.has(wpPostName(segs[0]))) top.set(wpPostName(segs[0]), `/${segs[0]}`)
  }
  return (attachments ?? [])
    .filter((a) => Number(a.post_parent ?? 0) === 0 && top.has(String(a.post_name ?? '').toLowerCase()))
    .map((a) => ({ attachment: Number(a.ID), source: sources.get(Number(a.ID)) ?? null, slug: String(a.post_name), route: top.get(String(a.post_name).toLowerCase()) }))
    .sort((x, y) => x.attachment - y.attachment)
}

/**
 * Image and asset URLs in markup → the attachment URLs they name. `media(ref)` resolves the URL in
 * the attribute (resolveMedia, which decodes it once through imageKey: `paint%20bucket.png` is the
 * file `paint bucket.png`) to `{ url }` or null. A ref that resolves to nothing stays as written.
 */
export function rewriteMediaRefs(markup, media, { theme }) {
  const text = String(markup ?? '')
  // Read by an HTML parser (markupAttrs), not a pattern: `<img src='/images/a.jpg'>`, `<IMG
  // SRC="…">` and an unquoted value are the same attribute, and a pattern for `src="…"` left
  // them pointing at a file the site does not serve. The attribute is written back in place.
  const edits = markupAttrs(text, ['src', 'href'])
    .filter((a) => MEDIA_REF.test(a.value))
    .map((a) => ({ ...a, hit: media(a.value) }))
    .filter((a) => a.hit)
  let out = text
  for (const a of edits.sort((x, y) => y.start - x.start)) out = `${out.slice(0, a.start)}${a.name}="${escapeAttr(a.hit.url)}"${out.slice(a.end)}`
  return (
    out
      // The shared library patterns (tracy/section-*) are generated with the source theme's asset
      // path; on a derived theme that directory does not exist. Content is data, so the path is
      // fixed here rather than in the generator — a theme rename must not orphan seeded pages.
      .replace(/\/wp-content\/themes\/tracy\/assets\//g, `/wp-content/themes/${theme}/assets/`)
  )
}

// A source image path (`images/…`, with or without the leading slash) or an uploads-form name.
const MEDIA_REF = /^\/?(?:images\/.+|wp-content\/uploads\/[^/]+)$/

const escapeAttr = (v) => String(v)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

/**
 * The attributes `names` of every element in `markup` as an HTML parser reads them — any tag or
 * attribute case, double, single or no quotes, entities decoded — with where each stands in the
 * text (`start`/`end`: the whole `name=value`). Comments (block delimiters included) and raw text
 * hold no elements. `tag` narrows to one element name.
 */
function markupAttrs(markup, names, { tag = null } = {}) {
  const text = String(markup ?? '')
  if (!/<[a-z]/i.test(text) || !names.some((n) => text.toLowerCase().includes(n))) return []
  const dom = new JSDOM(text, { includeNodeLocations: true })
  const out = []
  for (const el of dom.window.document.querySelectorAll(tag ?? '*')) {
    const at = dom.nodeLocation(el)?.attrs
    if (!at) continue
    for (const name of names) {
      const loc = at[name]
      if (loc && el.hasAttribute(name)) out.push({ tag: el.localName, name, value: el.getAttribute(name), start: loc.startOffset, end: loc.endOffset })
    }
  }
  return out
}

// What is left of a block delimiter in markup the block parser has read: any comment that starts
// like one (`<!--wp:image/-->`, `<!-- WP:IMAGE -->`, `<!-- wp:image invalid /-->`). The parser takes
// every delimiter it can read, so one of these in its HTML is a delimiter it could not.
const UNREAD_DELIMITER = /<!--\s*\/?\s*wp:/gi
// The one core/image markup resolvePartMedia writes: a single <figure> holding its one <img>,
// optionally inside one <a>, optionally followed by a <figcaption> with no image, figure or comment.
const TAG_ATTRS = String.raw`(?:[^<>"']|"[^"]*"|'[^']*')*`
const IMAGE_FORM = new RegExp(
  String.raw`^\s*<figure\b${TAG_ATTRS}>\s*(?:<a\b${TAG_ATTRS}>\s*<img\b${TAG_ATTRS}>\s*<\/a>|<img\b${TAG_ATTRS}>)\s*` +
    String.raw`(?:<figcaption\b${TAG_ATTRS}>(?:(?!<\/?(?:figure|figcaption|img)\b|<!--)[^])*<\/figcaption>\s*)?<\/figure>\s*$`,
  'i'
)
const imgSrcs = (markup) => markupAttrs(markup, ['src'], { tag: 'img' }).map((a) => a.value)

const VOID_ELEMENTS = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']
// A void element's self-closing slash (`<img …/>`, `<br />`): the one spelling the HTML parser reads
// and does not write back, and the one block markup uses throughout.
const SELF_CLOSING = new RegExp(String.raw`(<(?:${VOID_ELEMENTS.join('|')})\b${TAG_ATTRS}?)\s*\/>`, 'gi')
/**
 * Whether `block` comes back from the parser as written: setImage with nothing to set (the same
 * parse and serialization it writes through) returns the markup unchanged, bar self-closing
 * slashes. Anything the parser repairs, drops or respells — a tag left open, a stray end tag, an
 * implied element, a duplicate attribute, an unquoted value, a named entity — differs, and would
 * change silently when the image is written.
 */
function writesAsRead(block) {
  const own = block.innerContent.join('')
  try {
    return setImage(structuredClone(block), {}).innerContent.join('') === own.replace(SELF_CLOSING, '$1>')
  } catch {
    return false
  }
}

/** Every image the spec refers to: `{ key, alt }` keyed by path under the images root. */
export function collectImages(spec, patternsMap) {
  const wanted = new Map()
  // A ref already in `/wp-content/uploads/<file>` form (the from-html adapter rewrites featured
  // images that way) names the file it will be, not where it comes from; the spec's image table
  // carries the source path for it. Without this lookup those refs were dropped silently and every
  // featured image reported "not imported".
  const byFile = new Map((spec.content.images ?? []).map((i) => [i.file, i]))
  // A URL (a featured image, an <img> src) is decoded once through imageKey; a name on disk (an
  // image table's `original`) is a path as it stands (pathKey) — its `#` is part of the name.
  const keyOf = (i) => (i.original != null ? pathKey(i.original) : imageKey(i.src))
  // `tables`: the image tables of what refers to the ref, nearest first — the first one that lists
  // an uploads-form name decides, as resolveMedia decides it when the markup is rewritten (a name
  // it lists with two sources, or with none, is not imported: the rewrite leaves it as written and
  // says so). Only when none lists it is the spec-wide table asked.
  const add = (ref, alt = '', key = imageKey(ref), tables = []) => {
    if (key && typeof key === 'object') {
      const tier = tables.map((t) => (t ?? []).filter((i) => tableName(i) === key.basename)).find((l) => l.length)
      const sources = tier ? [...new Set(tier.map(tableSource))] : null
      const known = tier ? (sources.length === 1 && sources[0] ? tier[0] : null) : byFile.get(key.basename)
      key = known ? keyOf(known) : null
      if (key && typeof key !== 'string') key = null
      if (!alt && known?.alt) alt = known.alt
    }
    if (!key || typeof key !== 'string') return
    if (!wanted.has(key) || (alt && !wanted.get(key).alt))
      wanted.set(key, { key, alt: alt || wanted.get(key)?.alt || '' })
  }
  for (const p of spec.content.posts) add(p.featuredImage, p.featuredImageAlt)
  // The declared authors' pictures (postAuthors → seedAuthors puts them on the users).
  for (const a of Array.isArray(spec.content.authors) ? spec.content.authors : []) add(a?.avatar, a?.avatarAlt || a?.name || '')
  // A post's own image table (the pictures of its body): without it an image only a post names
  // was never imported and the body kept the uploads-form src of a file that is not there.
  for (const p of spec.content.posts) for (const img of [...(p.images ?? []), ...(p.route?.images ?? [])]) add(null, img.alt, keyOf(img))
  for (const p of spec.content.pages) {
    add(p.featuredImage, p.featuredImageAlt)
    for (const img of p.images ?? []) add(null, img.alt, keyOf(img))
    for (const entry of Array.isArray(p.content) ? p.content : []) if (entry?.frame?.background?.image) add(entry.frame.background.image)
  }
  for (const c of spec.content.categories)
    for (const src of markupAttrs(c.description, ['src']).map((a) => a.value)) add(src)
  for (const c of spec.sections.custom ?? [])
    for (const img of c.images ?? []) add(null, img.alt, keyOf(img))
  // Pictures the markup itself refers to, listed or not: an <img> inside a core/html block of a
  // blocks-mode page sat outside the page's image table (the style guide's three specimen
  // frames), so nothing imported it and the page served three 404s. The src names the file; the
  // spec's image table says where it comes from and what its alt is.
  for (const p of spec.content.pages) for (const src of imgSrcs(p.content)) add(src)
  // A post's markup too (JA Vega M6-1: the full-text image opened the body and was never imported,
  // so the post kept a `/images/…` src the site does not serve), resolved against its own table first.
  for (const p of spec.content.posts) for (const src of imgSrcs(p.content)) add(src, '', undefined, [p.images ?? []])
  for (const c of spec.sections.custom ?? []) for (const src of imgSrcs(c.blocks)) add(src)
  // ACM fields that patterns.map.json lands in an image src, plus their alt fields.
  for (const [typeKey, def] of Object.entries(patternsMap.types)) {
    const [type, style] = typeKey.split(':')
    const srcFields = Object.entries(def.fields).filter(([, f]) => f.attr === 'src')
    if (!srcFields.length) continue
    for (const inst of spec.sections.acm.filter((a) => a.type === type && a.style === style)) {
      for (const [field, f] of srcFields) {
        const altField = Object.entries(def.fields).find(
          ([, g]) => g.attr === 'alt' && g.path === f.path
        )?.[0]
        if (f.repeat) for (const item of inst.items) add(item[field], altField ? item[altField] : '')
        else add(inst.fields[field], altField ? inst.fields[altField] : '')
      }
    }
  }
  return [...wanted.values()]
}

// ---------------------------------------------------------------------------------------------
// ACM instance → pattern

const SURFACE_CLASS = { canvas: 'bg-bg', warm: 'bg-surface-warm', gray: 'bg-surface' }
const BAND_CLASSES = ['tracy-section--band', 'border-y', 'border-border-soft']
const NO_BG_ON_CANVAS = new Set(['tabs', 'timeline'])
const SURFACE_MODIFIER = new Set(['carousel', 'pricing', 'tabs', 'timeline'])
const HOT_CLASSES = ['is-hot', 'border-accent', 'shadow-[0_0_0_2px_var(--accent),var(--elev-raised)]']
const PRIMARY_BTN = ['tracy-btn', 'tracy-btn--primary']
const GHOST_BTN = ['is-style-outline', 'tracy-btn', 'tracy-btn--ghost']

const isEmpty = (v) => v === undefined || v === null || String(v).trim() === ''

/**
 * The pattern an ACM instance renders through. A type whose `layout` field picks between whole
 * layouts declares them in the map's `layouts` (`{ <layout value>: <pattern> }`); a value it does not
 * list takes `layouts['*']` when the map names one, else the type's own `pattern`.
 */
export function acmPattern(def, instance) {
  if (!def.layouts) return def.pattern
  const layout = String(instance.fields?.layout ?? '').trim()
  return def.layouts[layout] ?? def.layouts['*'] ?? def.pattern
}

/**
 * The section's HTML anchor on the pattern's root block — `acm-<type>-<module id>`, the id the source
 * prints on the section and its per-page stylesheets select. Only for a map that declares an
 * `anchorConvention`; `anchorSlug` on a type replaces the type name in the id.
 */
function setAnchor(root, anchor) {
  root.attrs.anchor = anchor
  setRootAttr(root, 'id', anchor)
}

/**
 * The classes a module's section wrapper carries in the source, from the spec record (from-joomla
 * `moduleSpacing`): the class suffix, then `top-<space>` and `bottom-<space>` — T4 prints
 * `t4-mod-wrap bg-light top-medium bottom-medium`. The theme styles them; a value the spec does not
 * carry adds nothing.
 */
function moduleClasses(section) {
  const out = String(section?.moduleClass ?? '').split(/\s+/).filter(Boolean)
  if (section?.spacing?.top) out.push(`top-${section.spacing.top}`)
  if (section?.spacing?.bottom) out.push(`bottom-${section.spacing.bottom}`)
  return out
}

/** Add class tokens to a block's `className` and its root element's `class`, one or both missing. */
function addRootClasses(block, add) {
  setClasses(block, { add })
  const have = getClasses(block)
  if (add.some((c) => !have.includes(c))) setRootAttr(block, 'class', [...have, ...add.filter((c) => !have.includes(c))].join(' '))
}

/**
 * A module's markup with its wrapper classes (moduleClasses) on it: on the root of a single block,
 * or on one core/group around it when the markup is several blocks or a core/html block (whose
 * HTML is the author's, with no block root to carry them).
 */
function withModuleClasses(markup, section) {
  const add = moduleClasses(section)
  if (!add.length || !markup) return markup
  const blocks = parseBlocks(markup)
  const top = blocks.filter((b) => b.name !== null)
  if (top.length === 1 && top[0].name !== 'core/html' && /^\s*<[a-z]/i.test(top[0].innerContent[0] ?? '')) {
    addRootClasses(top[0], add)
    return serializeBlocks(blocks)
  }
  const cls = add.join(' ')
  return `<!-- wp:group ${JSON.stringify({ className: cls })} -->\n<div class="wp-block-group ${escapeHtml(cls).replace(/"/g, '&quot;')}">\n${markup.trim()}\n</div>\n<!-- /wp:group -->`
}

/** The pattern names the ACM instances of the spec need through the map that the registry `patterns` lacks. */
export function missingRequiredPatterns(patternsMap, acm, patterns) {
  const missing = new Set()
  for (const inst of acm ?? []) {
    const def = patternsMap?.types?.[`${inst.type}:${inst.style}`]
    if (!def) continue
    const name = acmPattern(def, inst)
    if (name && !patterns[name]) missing.add(name)
  }
  return [...missing].sort()
}

/**
 * Render one ACM instance into block markup from the theme's registered pattern. `media(ref)` returns
 * `{ url, id }` or null. Returns `{ markup, notes, unresolvedSeedResults }`; notes list fields that
 * had nowhere to go and unsupported attributes are named separately as unresolved seed results.
 */
export function renderAcm(instance, patternsMap, patterns, media) {
  const key = `${instance.type}:${instance.style}`
  const def = patternsMap.types[key]
  if (!def) return { markup: null, notes: [`no pattern mapped for ${key}`], unresolvedSeedResults: [] }
  const patternName = acmPattern(def, instance)
  const source = patterns[patternName]
  if (!source) return { markup: null, notes: [`pattern ${patternName} is not registered on the site`], unresolvedSeedResults: [] }
  const blocks = parseBlocks(source)
  const root = blocks.find((b) => b.name !== null)
  if (root && patternsMap.anchorConvention) setAnchor(root, `acm-${def.anchorSlug ?? instance.type}-${instance.id}`)
  const notes = []
  const unresolvedSeedResults = []
  const type = instance.type
  const recordStyleUnresolved = (field, sourceValue) => {
    unresolvedSeedResults.push({
      kind: 'unsupported-style-attribute',
      section: String(instance.id),
      field: `${type}.${field}`,
      sourceValue
    })
  }
  const unmapped = Object.keys(instance.fields ?? {}).filter((field) => !Object.hasOwn(def.fields ?? {}, field))
  for (const field of unmapped) notes.push(`${instance.id} ${type}.${field}: no field mapping in patterns.map.json`)
  const count = instance.items?.length ?? 0
  const repeated = Object.values(def.fields).some((f) => f.repeat)
  if (repeated && def.item) {
    const itemName = def.item.replace(/\.<n>$/, '')
    repeatItems(blocks, type, count, { itemName, renumber: [/(acm-tab-)(\d+)/g] })
    // A repeated field drawn outside the item wrapper (the tab labels sit in a list above the
    // panels) repeats on its own, in step with the items.
    const wrapperRe = new RegExp('^' + itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.\\d+$')
    const inWrapper = new Set()
    for (const w of findAll(blocks, (b) => wrapperRe.test(blockName(b) ?? '')))
      walkBlocks([w], (b) => inWrapper.add(b))
    for (const [, f] of Object.entries(def.fields)) {
      if (!f.repeat || !f.path?.endsWith('.<n>')) continue
      const name = f.path.replace('.<n>', '')
      const first = findBlock(blocks, `${name}.1`)
      if (first && !inWrapper.has(first) && name !== itemName)
        repeatItems(blocks, type, count, { itemName: name, renumber: [/(#?acm-tab-)(\d+)/g] })
    }
  }
  // A container the pattern itself draws empty (a hairline rule, a spark box) is design, not a
  // leftover: only what the fill empties is pruned.
  const keep = new Set(findAll(blocks, isEmptyContainer))
  const ctx = { blocks, root, type, def, instance, media, notes, keep, unresolvedSeedResults }
  // Recommended tier: "1" on the first such tier only (source rule).
  ctx.recommended = instance.items?.findIndex((it) => String(it['tier-recommended'] ?? '') === '1') ?? -1
  const composed = composedFields(def, key)
  const done = new Set()
  for (const [field, f] of Object.entries(def.fields)) {
    if (!f.block || !f.path) {
      if (f.attr === 'style') {
        if (f.repeat) for (const item of instance.items ?? []) recordStyleUnresolved(field, item[field])
        else recordStyleUnresolved(field, instance.fields?.[field])
      }
      continue
    }
    const parts = composed.get(field)
    if (parts) {
      if (done.has(parts)) continue
      done.add(parts)
      if (f.repeat) instance.items.forEach((item, i) => applyComposed(ctx, parts, item, i + 1))
      else applyComposed(ctx, parts, instance.fields, null)
    } else if (f.repeat) {
      instance.items.forEach((item, i) => applyField(ctx, f, field, item[field], i + 1, item))
    } else applyField(ctx, f, field, instance.fields[field], null, instance.fields)
  }
  pruneEmptyContainers(blocks, { keep: ctx.keep })
  // The module's own wrapper classes (spacing, class suffix) go on the section root, after the fill.
  const wrapper = moduleClasses(instance)
  if (root && wrapper.length) addRootClasses(root, wrapper)
  const markup = serializeBlocks(blocks)
  if (!checkMarkup(markup)) throw new Error(`renderAcm ${instance.id}: produced unbalanced markup`)
  return { markup, notes, unresolvedSeedResults }
}

/** The inline elements a composed field part may be wrapped in (`wrap`). */
const PART_WRAPS = new Set(['span', 'em', 'strong', 'b', 'i', 'mark', 'small'])

/**
 * The fields of a map entry that compose ONE block's text: every text field (`attr` `content` or
 * `text`) drawn into the same `path` declares `part` — its 1-based place in the line — and may
 * declare `wrap` (an inline element) and `wrapClass` (its classes). The source's
 * `<span>Our partners</span> drive success…` is two ACM fields in one line; the pattern draws it
 * as one editable paragraph, filled `accent` then `desc`. Returns a Map field → the ordered
 * `[field, def]` list of its block (one list shared by the block's fields). Two text fields on
 * one block without `part`, a repeated part, a part on a non-text field or a wrap outside the
 * inline set are a map error: each would lose a field without a word.
 */
export function composedFields(def, key = '?') {
  const byPath = new Map()
  for (const [field, f] of Object.entries(def.fields ?? {})) {
    if (!f.block || !f.path) continue
    if (f.part === undefined && f.wrap === undefined && f.wrapClass === undefined && !['content', 'text'].includes(f.attr)) continue
    if (!byPath.has(f.path)) byPath.set(f.path, [])
    byPath.get(f.path).push([field, f])
  }
  const out = new Map()
  for (const [path, list] of byPath) {
    const fail = (msg) => {
      throw new Error(`patterns map ${key}: block ${path}: ${msg}`)
    }
    const declared = list.filter(([, f]) => f.part !== undefined)
    if (!declared.length) {
      if (list.some(([, f]) => f.wrap !== undefined || f.wrapClass !== undefined)) fail('`wrap` needs a `part`')
      if (list.length > 1) fail(`fields ${list.map(([n]) => n).join(', ')} write the same block's text; declare \`part\` on each to compose them`)
      continue
    }
    if (declared.length !== list.length) fail(`every text field drawn into it declares \`part\` (${list.filter(([, f]) => f.part === undefined).map(([n]) => n).join(', ')} does not)`)
    for (const [name, f] of list) {
      if (!['content', 'text'].includes(f.attr)) fail(`${name}: \`part\` composes text; attr ${f.attr} cannot`)
      if (name === 'tab-body') fail(`${name}: an HTML field cannot be a part`)
      if (!Number.isInteger(f.part) || f.part < 1) fail(`${name}: part must be a positive integer, got ${JSON.stringify(f.part)}`)
      if (f.wrap !== undefined && !PART_WRAPS.has(f.wrap)) fail(`${name}: wrap must be one of ${[...PART_WRAPS].join(', ')}, got ${JSON.stringify(f.wrap)}`)
      if (f.wrapClass !== undefined && (f.wrap === undefined || !/^-?[A-Za-z_][\w-]*( -?[A-Za-z_][\w-]*)*$/.test(String(f.wrapClass))))
        fail(`${name}: wrapClass needs a wrap and class tokens, got ${JSON.stringify(f.wrapClass)}`)
      if (Boolean(f.repeat) !== Boolean(list[0][1].repeat) || (f.repeat && f.repeat !== list[0][1].repeat)) fail('parts of one block repeat together')
    }
    if (new Set(list.map(([, f]) => f.part)).size !== list.length) fail('two fields declare the same part')
    const ordered = [...list].sort((a, b) => a[1].part - b[1].part)
    for (const [name] of list) out.set(name, ordered)
  }
  return out
}

/**
 * Fill a composed block: the non-empty parts in order, each escaped (a spec field is plain text,
 * save the source's bare `<br>`, kept — breaksAsMarkup) and wrapped as declared, one space
 * between them. An empty part is left out with its wrap; all parts empty removes the block, as
 * one empty field does.
 */
function applyComposed(ctx, parts, record, n) {
  const [, f] = parts[0]
  const target = resolvePath(ctx, f, n)
  if (!target || Array.isArray(target)) {
    ctx.notes.push(`${ctx.instance.id} ${ctx.type}.${parts.map(([name]) => name).join('+')}: block ${f.path} not in pattern`)
    return
  }
  const html = parts
    .filter(([name]) => !isEmpty(record?.[name]))
    .map(([name, p]) => {
      const text = breaksAsMarkup(record[name]) ?? escapeHtml(String(record[name]).replace(/\s+/g, ' ').trim())
      if (!text || !p.wrap) return text
      const cls = p.wrapClass ? ` class="${p.wrapClass}"` : ''
      return `<${p.wrap}${cls}>${text}</${p.wrap}>`
    })
    .filter(Boolean)
  if (!html.length) {
    removeBlock(ctx.blocks, target)
    return
  }
  setText(target, html.join(' '), { html: true })
}

/**
 * A text field into its block: plain text, or — when the source broke the line with a bare
 * `<br>` — the escaped text with its breaks (breaksAsMarkup). Breaks and nothing else is an
 * empty field: the block goes.
 */
function putField(ctx, target, text, tail = '') {
  const html = breaksAsMarkup(text)
  if (html === null) setText(target, text + tail)
  else if (!html) removeBlock(ctx.blocks, target)
  else setText(target, html + escapeHtml(tail), { html: true })
}

function resolvePath(ctx, f, n) {
  if (f.path === 'root') return ctx.root
  const name = f.path.replace('<n>', n ?? '').replace('.*', '')
  if (f.path.endsWith('.*')) return findAll(ctx.blocks, (b) => (blockName(b) ?? '').startsWith(name + '.'))
  return findBlock(ctx.blocks, name)
}

function applyField(ctx, f, field, value, n, record) {
  const target = resolvePath(ctx, f, n)
  const missingTarget = !target || (Array.isArray(target) && !target.length)
  if (missingTarget) {
    ctx.notes.push(`${ctx.instance.id} ${ctx.type}.${field}: block ${f.path} not in pattern`)
  }
  const { type } = ctx
  if (f.attr === 'style') {
    ctx.unresolvedSeedResults.push({ kind: 'unsupported-style-attribute', section: String(ctx.instance.id), field: `${type}.${field}`, sourceValue: value })
    return
  }
  if (missingTarget) return
  switch (f.attr) {
    case 'content': {
      if (isEmpty(value)) {
        removeBlock(ctx.blocks, target)
        return
      }
      const text = String(value)
      if (field === 'tab-body') {
        const single = /^\s*<p>([\s\S]*)<\/p>\s*$/.exec(text)
        if (single) setText(target, single[1], { html: true })
        else {
          // Richer HTML becomes sibling blocks in the item's place.
          const converted = parseBlocks(htmlToBlocks(text))
          const parent = findParentOf(ctx.blocks, target)
          const list = parent ? parent.innerBlocks : ctx.blocks
          const idx = list.indexOf(target)
          list.splice(idx, 1, ...converted)
          if (parent) {
            const nulls = []
            parent.innerContent.forEach((c, k) => c === null && nulls.push(k))
            parent.innerContent.splice(
              nulls[idx],
              1,
              ...converted.flatMap((_, k) => (k ? ['\n', null] : [null]))
            )
          }
        }
        return
      }
      // A link paragraph keeps its trailing arrow (card-link, action).
      const arrowMatch = /\s*([→↗])\s*<\/a>/.exec(target.innerContent.join(''))
      const arrow = arrowMatch && !/[→↗]\s*$/.test(text) ? ` ${arrowMatch[1]}` : ''
      putField(ctx, target, text, arrow)
      return
    }
    case 'text':
      if (isEmpty(value)) removeBlock(ctx.blocks, target)
      else putField(ctx, target, String(value))
      return
    case 'url':
      if (isEmpty(value)) return
      // A card drawn as a core/group has no <a> of its own: the URL rides on the block as a `url`
      // attribute, which the theme reads at render time to draw the card as a link.
      if (target.name === 'core/group' && !/<a\b/.test(target.innerContent.filter((c) => typeof c === 'string').join('')))
        target.attrs.url = String(value)
      else if (target.name === 'core/social-link') target.attrs.url = String(value)
      else setHref(target, String(value))
      return
    case 'href':
      if (field === 'sample-key') setHref(target, '#')
      else if (!isEmpty(value)) setHref(target, String(value))
      return
    case 'src': {
      if (isEmpty(value)) {
        removeBlock(ctx.blocks, target)
        return
      }
      const m = ctx.media(value)
      if (!m) {
        ctx.notes.push(`${ctx.instance.id} ${type}.${field}: image ${value} not in the media map`)
        return
      }
      // The alt is the paired alt field when the map has one; otherwise the record's "<x>-name"
      // (a team portrait's alt is the member name, as the map's note says).
      const pairedAlt = Object.values(ctx.def.fields).some((g) => g.attr === 'alt' && g.path === f.path)
      const nameField = field.replace(/-(portrait|image|media|photo)$/, '-name')
      const alt =
        !pairedAlt && record && nameField !== field && !isEmpty(record[nameField])
          ? String(record[nameField])
          : undefined
      setImage(target, { src: m.url, id: m.id, alt })
      return
    }
    case 'alt':
      if (findParentOf(ctx.blocks, target) !== undefined) setImage(target, { alt: String(value ?? '') })
      return
    case 'level':
      setLevel(target, String(value ?? '').replace(/^h/i, ''))
      return
    case 'summary':
      setSummary(target, String(value ?? ''))
      return
    case 'showContent': {
      // first-open: item 1 open unless "0"; every other item closed.
      const items = findAll(
        ctx.blocks,
        (b) => /\.item\.\d+$/.test(blockName(b) ?? '') && b.name === 'core/details'
      )
      items.forEach((b, i) => setSummary(b, summaryOf(b), { open: i === 0 && String(value) !== '0' }))
      return
    }
    case 'name': {
      const items = Array.isArray(target) ? target : [target]
      if (String(value) === '0')
        for (const b of items) {
          delete b.attrs.name
          setRootAttr(b, 'name', null)
        }
      return
    }
    case 'innerBlocks':
      setListItems(
        target,
        String(value ?? '')
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
      )
      return
    case 'service':
      target.attrs.service = String(value ?? '')
      return
    case 'links':
      if (isEmpty(value)) removeBlock(ctx.blocks, target)
      else setSocialLinks(target, String(value))
      return
    case 'table':
      fillTable(ctx, f, field, value, n)
      return
    case 'query.taxQuery.category':
    case 'query.include':
      ctx.notes.push(
        `${ctx.instance.id} ${type}.${field}: query fields are set by the seeder only for page-scoped instances`
      )
      return
    case 'className':
      applyClassField(ctx, f, field, value, n, record, target)
      return
    default:
      ctx.notes.push(`${ctx.instance.id} ${type}.${field}: attr ${f.attr} not handled`)
  }
}

function summaryOf(block) {
  return (
    /<summary>([^]*?)<\/summary>/
      .exec(block.innerContent[0] ?? '')?.[1]
      ?.replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>') ?? ''
  )
}

function findParentOf(blocks, target) {
  let found = null
  walkBlocks(blocks, (b, parent) => {
    if (b === target) {
      found = parent
      return false
    }
  })
  return found
}

/**
 * A core/social-links block from one `service|url` pair per line: the pattern's first link is the
 * template (its class and style ride along), one link per line in the value's order.
 */
function setSocialLinks(block, value) {
  const template = block.innerBlocks[0]
  if (!template) throw new Error(`setSocialLinks: ${blockName(block)} has no link to clone`)
  const links = value
    .split(/\r?\n/)
    .map((line) => line.split('|').map((s) => s.trim()))
    .filter(([service, url]) => service && url)
    .map(([service, url]) => {
      const link = structuredClone(template)
      link.attrs.service = service
      link.attrs.url = url
      return link
    })
  const open = block.innerContent[0]
  const close = block.innerContent[block.innerContent.length - 1]
  block.innerBlocks = links
  block.innerContent = [open, ...links.map(() => null), close]
}

/**
 * A core/table filled from an ACM instance, the pattern's own table being the template. The fields
 * that are not repeated fill the header cells, in the order the map lists them. The repeated field
 * rebuilds the body from `instance.items`: an item with a `group` starts a divider row (the
 * pattern's row with one spanning cell), then every item is a row whose cells are the item's other
 * keys in order. A cell reads `yes` as the pattern's mark cell (the one drawing an <svg>), `no` or
 * empty as its blank cell, anything else as its text cell with the text replaced — the source's
 * cell convention (JA Kinetic `acm/pricing-matrix/tmpl/style-1.php`). A pattern that does not have
 * the row or cell a value needs keeps its table, and the notes say why.
 */
function fillTable(ctx, f, field, value, n) {
  if (f.repeat && n !== 1) return
  const target = resolvePath(ctx, f, n)
  const tpl = document.createElement('template')
  tpl.innerHTML = target.innerContent.join('')
  const table = tpl.content.querySelector('table')
  const heads = [...(table?.querySelectorAll('thead th') ?? [])]
  const note = (why) => ctx.notes.push(`${ctx.instance.id} ${ctx.type}.${field}: table kept, ${why}`)
  if (!f.repeat) {
    const order = Object.entries(ctx.def.fields)
      .filter(([, g]) => g.attr === 'table' && !g.repeat && g.path === f.path)
      .map(([k]) => k)
    if (order.length !== heads.length) return note(`${order.length} header fields for ${heads.length} header cells`)
    heads[order.indexOf(field)].textContent = String(value ?? '')
  } else {
    const body = table?.querySelector('tbody')
    const rows = [...(body?.querySelectorAll('tr') ?? [])]
    const groupRow = rows.find((r) => r.cells.length === 1 && r.cells[0].hasAttribute('colspan'))
    const dataRow = rows.find((r) => r.cells.length === heads.length)
    if (!dataRow) return note(`no body row with ${heads.length} cells to copy`)
    const cells = rows.filter((r) => r !== groupRow).flatMap((r) => [...r.cells].slice(1))
    // What a reader hears: a decorative dash (aria-hidden) is a blank cell, not a word.
    const text = (el) => {
      const copy = el.cloneNode(true)
      for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove()
      return copy.textContent.trim()
    }
    const mark = cells.find((c) => c.querySelector('svg'))
    const blank = cells.find((c) => !text(c) && !c.querySelector('svg'))
    const word = cells.find((c) => text(c))
    const cellFor = (raw) => {
      const v = String(raw ?? '').trim()
      const kind = v.toLowerCase() === 'yes' ? mark : v === '' || v.toLowerCase() === 'no' ? blank : null
      if (kind) return kind.cloneNode(true)
      const cell = (word ?? dataRow.cells[1]).cloneNode(true)
      let leaf = cell
      while (leaf.children.length === 1) leaf = leaf.children[0]
      leaf.textContent = v
      return cell
    }
    const out = []
    for (const item of ctx.instance.items) {
      const { group, ...rest } = item
      const keys = Object.keys(rest)
      if (keys.length !== heads.length) return note(`an item has ${keys.length} cells for ${heads.length} columns`)
      if (!isEmpty(group)) {
        if (!groupRow) return note('an item starts a group and the pattern has no divider row')
        const row = groupRow.cloneNode(true)
        row.cells[0].textContent = String(group).trim()
        out.push(row)
      }
      const row = dataRow.cloneNode(false)
      const head = dataRow.cells[0].cloneNode(false)
      head.textContent = String(rest[keys[0]] ?? '')
      row.append(head, ...keys.slice(1).map((k) => cellFor(rest[k])))
      out.push(row)
    }
    body.replaceChildren(...out)
  }
  target.innerContent = [tpl.innerHTML]
}

function applyClassField(ctx, f, field, value, n, record, target) {
  const { type } = ctx
  const v = String(value ?? '').trim()
  if (field === 'surface' || field === 'ground') {
    const remove = [
      ...Object.values(SURFACE_CLASS),
      ...BAND_CLASSES,
      ...Object.keys(SURFACE_CLASS).map((k) => `acm-${type}--${k}`)
    ]
    const add = []
    if (SURFACE_CLASS[v] && !(v === 'canvas' && NO_BG_ON_CANVAS.has(type))) add.push(SURFACE_CLASS[v])
    if (v !== 'canvas' && !NO_BG_ON_CANVAS.has(type)) add.push(...BAND_CLASSES)
    if (SURFACE_MODIFIER.has(type) && v) add.push(`acm-${type}--${v}`)
    setClasses(target, { add, remove })
    return
  }
  // A pattern that draws its column count as `hx-cols-<n>` (JA Kinetic) keeps that family: the
  // value replaces it, and none of the classes below are added.
  const drawnCols = field === 'columns' ? getClasses(target).filter((c) => /^hx-cols-\d+$/.test(c)) : []
  if (drawnCols.length) {
    if (v) setClasses(target, { remove: drawnCols, add: [`hx-cols-${v}`] })
    return
  }
  if (field === 'columns' || field === 'per-view') {
    const nCols = Number(v) || (field === 'columns' ? 4 : 3)
    const prefix = field === 'columns' ? `acm-${type}--cols-` : `acm-${type}--per-`
    const remove = [2, 3, 4, 5, 6].map((k) => `${prefix}${k}`)
    setClasses(target, { add: [`${prefix}${nCols}`], remove })
    if (field === 'columns') {
      const grid = findAll(ctx.blocks, (b) => /\blg:grid-cols-\d\b/.test(b.attrs?.className ?? ''))[0]
      if (grid)
        setClasses(grid, {
          add: [`lg:grid-cols-${nCols}`],
          remove: [2, 3, 4, 5, 6].map((k) => `lg:grid-cols-${k}`)
        })
    }
    return
  }
  if (field === 'tier-recommended') {
    const hot = n - 1 === ctx.recommended
    setClasses(target, hot ? { add: HOT_CLASSES } : { remove: HOT_CLASSES })
    const button = findBlock(ctx.blocks, `${type}.tier-action.${n}`)
    if (button)
      setClasses(
        button,
        hot
          ? { add: PRIMARY_BTN, remove: ['is-style-outline', 'tracy-btn--ghost'] }
          : { add: GHOST_BTN, remove: ['tracy-btn--primary'] }
      )
    return
  }
  if (field === 'link-style') {
    setClasses(
      target,
      v === 'primary'
        ? { add: PRIMARY_BTN, remove: ['is-style-outline', 'tracy-btn--ghost'] }
        : { add: GHOST_BTN, remove: ['tracy-btn--primary'] }
    )
    return
  }
  // A key that picks one class of a family (JA Kinetic's ACM fields): the family's classes come off,
  // the value's goes on, and the block stays through the empty-container prune: its class is what
  // it draws. An icon key left empty draws no icon, so its block goes too.
  const family = CLASS_FAMILY[field]
  if (family) {
    if (!v) {
      if (family.dropEmpty) removeBlock(ctx.blocks, target)
      return
    }
    const remove = getClasses(target).filter((c) => family.of.test(c))
    setClasses(target, { remove, add: [family.cls(v)] })
    ctx.keep.add(target)
    return
  }
  if (field === 'popular') {
    // "1" marks the popular row: its card class, the primary call to action, and the badge — which
    // every cloned row carries (repeatItems clones the richest row), so a row that is not popular
    // loses it.
    const popular = v === '1'
    setClasses(target, popular ? { add: ['is-popular'] } : { remove: ['is-popular'] })
    const badge = findBlock(ctx.blocks, `${type}.popular.${n}`)
    if (badge && !popular) removeBlock(ctx.blocks, badge)
    const cta = findBlock(ctx.blocks, `${type}.cta_label.${n}`)
    if (cta)
      setClasses(
        cta,
        popular
          ? { add: ['hx-btn--primary'], remove: ['hx-btn--ghost'] }
          : { add: ['hx-btn--ghost'], remove: ['hx-btn--primary'] }
      )
    return
  }
  // Explicit map semantics for a field the built-in names above do not cover (per-row colours and
  // button types: `stt-color`, `background-type`, `dot-color`, `highlight`, `btn-type`): the map entry
  // says how its value becomes a class — `classPrefix` (the value joins the prefix, the family's other
  // classes come off; `dropEmpty` removes the block for an empty value) or `classMap` (value → class,
  // every mapped class comes off first). A value the map does not name is reported, never guessed.
  const declared = declaredClassRule(f)
  if (declared) {
    const at = `${ctx.instance.id} ${type}.${field}`
    if (declared.error) {
      ctx.notes.push(`${at}: ${declared.error}`)
      return
    }
    const current = getClasses(target)
    if (declared.prefix !== undefined) {
      const remove = current.filter((c) => c.startsWith(declared.prefix))
      if (!v) {
        setClasses(target, { remove })
        if (declared.dropEmpty) removeBlock(ctx.blocks, target)
        return
      }
      if (!CLASS_TOKEN.test(`${declared.prefix}${v}`)) {
        ctx.notes.push(`${at}: value ${JSON.stringify(v)} is not usable in a class name; class left as it was`)
        return
      }
      setClasses(target, { remove, add: [`${declared.prefix}${v}`] })
      ctx.keep.add(target)
      return
    }
    const all = [...new Set(Object.values(declared.map).flatMap((c) => c.split(/\s+/)))]
    if (v && !Object.hasOwn(declared.map, v)) {
      ctx.notes.push(`${at}: value ${JSON.stringify(v)} is not in the map's classMap (${Object.keys(declared.map).join(', ')}); class left as it was`)
      return
    }
    setClasses(target, { remove: all, add: v ? declared.map[v].split(/\s+/).filter(Boolean) : [] })
    if (v) ctx.keep.add(target)
    return
  }
  ctx.notes.push(`${ctx.instance.id} ${type}.${field}: className rule unknown`)
}

const CLASS_TOKEN = /^[A-Za-z_][A-Za-z0-9_:-]*$/

/**
 * The class rule a patterns-map field declares: `{ prefix, dropEmpty }` from `classPrefix`, `{ map }`
 * from `classMap`, `{ error }` for a malformed one (both set, a prefix or class that is not a class
 * token), null when it declares neither.
 */
export function declaredClassRule(f) {
  const hasPrefix = f?.classPrefix !== undefined
  const hasMap = f?.classMap !== undefined
  if (!hasPrefix && !hasMap) return null
  if (hasPrefix && hasMap) return { error: 'declares both classPrefix and classMap; use one' }
  if (hasPrefix) {
    if (typeof f.classPrefix !== 'string' || !CLASS_TOKEN.test(`${f.classPrefix}x`)) return { error: `classPrefix ${JSON.stringify(f.classPrefix)} is not a class-name prefix` }
    return { prefix: f.classPrefix, dropEmpty: f.dropEmpty === true }
  }
  const m = f.classMap
  if (!m || typeof m !== 'object' || Array.isArray(m) || !Object.keys(m).length) return { error: 'classMap must be an object of { value: class }' }
  for (const [k, c] of Object.entries(m))
    if (typeof c !== 'string' || !c.trim().split(/\s+/).every((t) => CLASS_TOKEN.test(t))) return { error: `classMap value ${JSON.stringify(k)} → ${JSON.stringify(c)} is not a class name` }
  return { map: Object.fromEntries(Object.entries(m).map(([k, c]) => [k, c.trim()])) }
}

/**
 * Class families selected by one ACM field, by field name (JA Kinetic's `acm/<type>/tmpl`): the
 * classes matching `of` are replaced by `cls(value)`. `dropEmpty`: an empty value removes the block.
 */
const CLASS_FAMILY = {
  variant: { of: /^cta-/, cls: (v) => `cta-${v}` },
  align: { of: /^is-(center|left|right)$/, cls: (v) => `is-${v}` },
  'tile-span': { of: /^span-/, cls: (v) => `span-${v}` },
  'tile-icon': { of: /^is-ico-/, cls: (v) => `is-ico-${v}`, dropEmpty: true },
  step_icon: { of: /^hx-ico-/, cls: (v) => `hx-ico-${v}`, dropEmpty: true },
  icon: { of: /^hx-ico-/, cls: (v) => `hx-ico-${v}`, dropEmpty: true }
}

// ---------------------------------------------------------------------------------------------
// Typed spec section → pattern (the wp-tracy-business convention)
//
// A spec-pack written from HTML (from-html) types its sections — hero, services, projects, … —
// and normalises each into `fields` {eyebrow, heading, headingLevel, intro, ctas[{text, href}]}
// and `items[]` {title, text, meta, img, alt, href}. A theme whose patterns.map.json keys `types`
// by that sectionType (no `:style`) and names every block by the UNIFORM schema —
// `<type>.eyebrow|heading|intro|img`, `<type>.cta.<n>`, wrapper `<type>.item.<n>` with children
// `<type>.item.<n>.title|text|meta|img|href` — is filled here by name, the same code for every
// type. What a pattern has no block for goes to the notes; what the spec leaves empty removes the
// block; nothing is placed by position.

/** A typed map entry: keyed by sectionType, not `type:style`. */
export function typedDef(patternsMap, sectionType) {
  if (!sectionType || !patternsMap?.types) return null
  const def = patternsMap.types[sectionType]
  return def && !sectionType.includes(':') && def.item !== undefined ? def : null
}

/** The map entry that renders a detected shape (`shape: "links"`), or null. */
function shapeDef(patternsMap, shape) {
  return Object.values(patternsMap?.types ?? {}).find((d) => d.shape === shape) ?? null
}

const ARROWS = /\s*[→↗↓←]\s*$/

/**
 * The untyped "list of links" shape: a container whose element children are at most one leading
 * label (a div/heading with text) followed by two or more `<a>` rows; or a container of such
 * groups. Returns one `{ heading, items }` per group, or null when the markup is anything else —
 * a wrong guess would file prose as links without any error.
 */
export function linksShape(html) {
  const tpl = document.createElement('template')
  tpl.innerHTML = html
  const root = tpl.content.firstElementChild
  if (!root) return null
  const groupOf = (el) => {
    const kids = [...el.children]
    if (kids.length < 2) return null
    let heading = ''
    let i = 0
    if (kids[0].tagName !== 'A') {
      if (kids[0].querySelector('a, img, input, button')) return null
      heading = textOf(kids[0])
      i = 1
    }
    const anchors = kids.slice(i)
    const leavesOf = (a) => [...a.querySelectorAll('*')].filter((n) => !n.children.length && textOf(n))
    // A link row is a title and at most a size, a date and an arrow; a card (a slide thumbnail
    // with its own caption stack, an image) is not a row, whatever wraps it.
    const isRow = (a) =>
      a.tagName === 'A' && textOf(a) && !a.querySelector('img, svg, input, button') && leavesOf(a).length <= 4
    if (anchors.length < 2 || !anchors.every(isRow)) return null
    const items = anchors.map((a) => {
      const leaves = leavesOf(a)
      const title = textOf(leaves[0] ?? a).replace(ARROWS, '')
      const rest = leaves
        .slice(1)
        .map(textOf)
        .filter((t) => t && !/^[→↗↓←]$/.test(t))
      // "PDF · 6.4 MB" and "28 Mar 2026" were siblings joined by a separator in the source.
      const meta = rest.join(' · ').replace(ARROWS, '')
      return { title, text: '', meta, img: null, alt: null, href: a.getAttribute('href') ?? '' }
    })
    return { heading, items }
  }
  const own = groupOf(root)
  if (own) return [own]
  const groups = []
  for (const child of root.children) {
    const g = groupOf(child)
    if (!g) return null
    groups.push(g)
  }
  return groups.length ? groups : null
}

/** The route a Joomla non-SEF address (`index.php/a/b`) names, `/a/b`; null for any other address. */
export function nonSefPath(href) {
  const m = /^\/?index\.php(\/[^?#]*)?(?:[?#].*)?$/i.exec(String(href ?? '').trim())
  if (!m?.[1]) return null
  const path = m[1].replace(/\/+$/, '')
  return path || null
}

/** `href` as the page will carry it: kept when it names a spec page, an anchor or an absolute URL. */
function resolveHref(href, links, notes, where) {
  if (isEmpty(href)) return null
  const h = String(href).trim()
  if (h === '#' || /^(https?:)?\/\//i.test(h) || /^(mailto|tel):/i.test(h) || h.startsWith('#')) return h
  if (links?.has(h)) return links.get(h)
  // Joomla's non-SEF form (`index.php/home/home-style-1`, `/index.php/x?y`) names the same route.
  const sef = nonSefPath(h)
  if (sef && links?.has(sef)) return links.get(sef)
  notes.push(`${where}: link ${h} is not a page of the spec`)
  return h
}

/** Write a leaf field: text → the block, empty → the block goes. */
/**
 * A field's text into its block; removed when empty. With `html` (the section's source), the
 * source's inline emphasis is kept — a spec field is plain text, and the hero's orange `<em>`
 * lived only in the markup (block-fill.mjs richText).
 */
function putText(blocks, block, value, html = null) {
  if (!block) return false
  if (isEmpty(value)) removeBlock(blocks, block)
  else {
    const rich = html ? richText(html, String(value)) : null
    if (rich) setText(block, rich, { html: true })
    else {
      const text = String(value)
      const withBreaks = breaksAsMarkup(text)
      if (withBreaks === null) setText(block, text)
      else if (!withBreaks) removeBlock(blocks, block)
      else setText(block, withBreaks, { html: true })
    }
  }
  return true
}

function putImage(blocks, block, ref, alt, media, notes, where) {
  if (!block) return false
  if (isEmpty(ref)) {
    removeBlock(blocks, block)
    return true
  }
  const m = media(ref)
  if (!m) {
    notes.push(`${where}: image ${ref} not in the media map`)
    removeBlock(blocks, block)
    return true
  }
  setImage(block, { src: m.url, id: m.id, alt: alt ?? '' })
  return true
}

/**
 * Render one typed spec section (`spec.sections.custom[]` entry with `sectionType`, `fields`,
 * `items`) from the theme's registered pattern named in patterns.map.json. `media(ref)` returns
 * `{ url, id }` or null; `opts.view` is the page view (styles match on it); `opts.links` maps a
 * spec path to the href the page should carry; `opts.cf7` is `{ id, title }` for a form embed.
 * Returns `{ markup, notes }`; notes list what had nowhere to go and what was dropped as noise.
 */
/**
 * Whether a pattern style's `when` matches a section: every key must hold. `view` — the page's
 * view; `id` — the section id; either a string or a list of strings. `fields` — an object whose
 * every entry equals the section's field of that name (`{ "heading": "…" }`); `items` — the
 * item count. A `when` that names only a view applies to every page of that view, so a style
 * meant for one section (the About page's CTA as a panel) names the section too. No `when`
 * (or an empty one) never applies — a style is opt-in.
 */
export function styleApplies(when, { view = null, section = {} } = {}) {
  const entries = Object.entries(when ?? {})
  if (!entries.length) return false
  const oneOf = (v, x) => (Array.isArray(v) ? v.includes(x) : v === x)
  return entries.every(([k, v]) => {
    if (k === 'view') return oneOf(v, view)
    if (k === 'id') return oneOf(v, section.id ?? null)
    if (k === 'items') return (section.items ?? []).length === v
    if (k === 'fields') return Object.entries(v ?? {}).every(([f, x]) => String(section.fields?.[f] ?? '') === String(x))
    return false
  })
}

export function renderTypedSection(section, patternsMap, patterns, media, opts = {}) {
  const type = section.sectionType
  const def = typedDef(patternsMap, type)
  const notes = []
  const id = section.id ?? '?'
  if (!def) return { markup: null, notes: [`no typed pattern mapped for ${type}`] }
  const source = patterns[def.pattern]
  if (!source) return { markup: null, notes: [`pattern ${def.pattern} is not registered on the site`] }
  const blocks = parseBlocks(source)
  const root = blocks.find((b) => b.name !== null)
  const fields = { ...(section.fields ?? {}) }
  let items = (section.items ?? []).map((it) => ({ ...it }))
  let ctas = (fields.ctas ?? []).map((c) => ({ ...c }))
  const has = (name) => findBlock(blocks, name)

  // Extractor noise, named in the map: an intro that is the first card's text, a cta that is a
  // card's own link. Not when the map declares the items dropped as the buttons' own labels
  // (the cta band): then the cards are not rendered, and the buttons are all that carries them.
  if (!isEmpty(fields.intro) && items.some((it) => it.text === fields.intro)) {
    notes.push(`${id} ${type}.intro: repeats an item's text, dropped`)
    fields.intro = null
  }
  if (!def.dropped?.items) {
    ctas = ctas.filter((c) => {
      const item = items.find((it) => it.title === c.text || `${it.title} →` === c.text)
      if (!item) return true
      if (isEmpty(item.href) && !isEmpty(c.href)) item.href = c.href
      return false
    })
  }
  // A cta with no href is a control (a search or submit button), not a link.
  ctas = ctas.filter((c) => {
    if (!isEmpty(c.href)) return true
    notes.push(`${id} ${type}.cta "${c.text}": no href, dropped`)
    return false
  })
  // The section title as a field the extractor left empty (the logo strip's label).
  if (def.titleTo && isEmpty(fields[def.titleTo]) && isEmpty(fields.heading) && !isEmpty(section.title))
    fields[def.titleTo] = section.title
  // One item per image when the section lists images and no items (the logo strip).
  if (def.itemsFromImages && !items.length && section.images?.length)
    items = section.images.map((im) => ({ title: '', text: '', meta: '', img: im.src, alt: im.alt ?? '', href: null }))
  // The section image: the first spec image no item claims.
  const claimed = new Set(items.map((it) => it.img).filter(Boolean))
  const sectionImage = (section.images ?? []).find((im) => !claimed.has(im.src)) ?? null

  // Root classes for a matching style (the 404 hero, the About page's CTA panel).
  for (const [styleName, style] of Object.entries(def.styles ?? {})) {
    if (styleApplies(style.when, { view: opts.view, section: { ...section, fields, items } })) {
      setClasses(root, { add: style.add ?? [] })
      notes.push(`${id} ${type}: style ${styleName}`)
    }
  }

  // Head.
  for (const f of ['eyebrow', 'heading', 'intro']) {
    const block = has(`${type}.${f}`)
    if (!block) {
      if (!isEmpty(fields[f]) && !def.dropped?.[f]) notes.push(`${id} ${type}.${f}: no block in pattern`)
      continue
    }
    putText(blocks, block, fields[f], section.html)
    if (f === 'heading' && !isEmpty(fields[f]) && fields.headingLevel) setLevel(block, fields.headingLevel)
  }
  const imgBlock = has(`${type}.img`)
  if (imgBlock) putImage(blocks, imgBlock, sectionImage?.src, sectionImage?.alt, media, notes, `${id} ${type}.img`)
  else if (sectionImage && !def.dropped?.img) notes.push(`${id} ${type}.img: no block in pattern`)
  const embed = has(`${type}.embed`)
  if (embed) {
    if (opts.cf7?.title) embed.innerContent = [`\n[contact-form-7 id="${opts.cf7.id}" title="${opts.cf7.title}"]\n`]
    else removeBlock(blocks, embed)
  }

  // Buttons: the pattern's own buttons keep their styles (orange first, outline second) up to
  // the count — surplus ones go; more ctas than buttons clone the template.
  if (has(`${type}.cta.1`)) {
    const existing = findAll(blocks, (b) => new RegExp(`^${type}\\.cta\\.\\d+$`).test(blockName(b) ?? ''))
    if (ctas.length <= existing.length) for (const b of existing.slice(ctas.length)) removeBlock(blocks, b)
    else repeatItems(blocks, type, ctas.length, { itemName: `${type}.cta` })
    ctas.forEach((c, i) => {
      const b = has(`${type}.cta.${i + 1}`)
      setText(b, String(c.text ?? '').replace(/\s+/g, ' ').trim())
      setHref(b, resolveHref(c.href, opts.links, notes, `${id} ${type}.cta.${i + 1}`))
    })
  } else if (ctas.length && !def.dropped?.ctas) notes.push(`${id} ${type}.ctas: ${ctas.length} buttons, no block in pattern`)

  // Items: the wrapper cloned to the count, each child filled by name.
  if (def.item && has(`${type}.item.1`)) {
    repeatItems(blocks, type, items.length, { itemName: `${type}.item` })
    items.forEach((it, i) => {
      const base = `${type}.item.${i + 1}`
      // A meta that repeats the text is the extractor reading one line twice.
      if (!isEmpty(it.meta) && it.meta === it.text) it.meta = null
      // A meta with no text beside it that reads as a sentence (four words or more, no
      // separator, not a date) is the text: a spec-pack older than html-content's meta rule
      // filed a stat caption with a year in it ("Serious incidents in 2025") under meta, and
      // the pattern set it a size smaller than its three siblings.
      if (isEmpty(it.text) && !isEmpty(it.meta) && has(`${base}.text`) && !/[·•|—–]/.test(it.meta) && String(it.meta).split(/\s+/).length >= 4 && !parseDateText(it.meta)) {
        it.text = it.meta
        it.meta = null
      }
      for (const f of ['title', 'text', 'meta']) {
        const block = has(`${base}.${f}`)
        if (!block) {
          if (!isEmpty(it[f])) notes.push(`${id} ${base}.${f}: no block in pattern`)
          continue
        }
        putText(blocks, block, it[f], section.html)
      }
      const im = has(`${base}.img`)
      if (im) putImage(blocks, im, it.img, it.alt, media, notes, `${id} ${base}.img`)
      else if (!isEmpty(it.img)) notes.push(`${id} ${base}.img: no block in pattern`)
      // The link: its own block, or the title's <a> when the title is the link.
      const hrefBlock = has(`${base}.href`)
      const titleBlock = has(`${base}.title`)
      const href = resolveHref(it.href, opts.links, notes, `${base}.href`)
      if (hrefBlock) {
        if (href) setHref(hrefBlock, href)
        else removeBlock(blocks, hrefBlock)
      } else if (titleBlock && /<a\s/.test(titleBlock.innerContent.join(''))) {
        setHref(titleBlock, href ?? '#')
      } else if (href) notes.push(`${id} ${base}.href: no block in pattern`)
    })
  } else if (items.length && !def.dropped?.items) notes.push(`${id} ${type}.items: ${items.length} items, no wrapper in pattern`)

  pruneEmptyContainers(blocks)
  const markup = serializeBlocks(blocks)
  if (!checkMarkup(markup)) throw new Error(`renderTypedSection ${id}: produced unbalanced markup`)
  return { markup, notes }
}

// ---------------------------------------------------------------------------------------------
// Page content

const SLOT_RE = /<!--\s*wp:tracy-base\/slot\s+({[^}]*})\s*\/-->\n?/g

const positionRank = (pos) => {
  if (pos === 'masthead') return [0, 0]
  const m = /^section-(\d+)$/.exec(pos)
  if (m) return [1, Number(m[1])]
  if (pos === 'bottom') return [3, 0]
  return [2, pos]
}
const byPosition = (a, b) => {
  const [ra, ka] = positionRank(a)
  const [rb, kb] = positionRank(b)
  return ra - rb || (ka < kb ? -1 : ka > kb ? 1 : 0)
}

/** ACM instances assigned to a page, grouped by position, in `ordering` order. */
export function instancesForPage(spec, page) {
  const groups = new Map()
  for (const inst of spec.sections.acm) {
    if (!inst.published || inst.scope !== 'page') continue
    if (!inst.pages.some((p) => p.wpPath === page.path)) continue
    if (!groups.has(inst.position)) groups.set(inst.position, [])
    groups.get(inst.position).push(inst)
  }
  for (const list of groups.values()) list.sort((a, b) => a.ordering - b.ordering)
  return groups
}

/** The intro after the heading and the note after the grid, which the ACM pattern has no field for. */
function withExtras(markup, extras, type) {
  const blocks = parseBlocks(markup)
  if (extras.intro) {
    const h = findBlock(blocks, `${type}.heading`)
    const parent = h && findParentOf(blocks, h)
    if (parent) {
      const idx = parent.innerBlocks.indexOf(h)
      const para = {
        name: 'core/paragraph',
        attrs: { className: 'tracy-lead mb-0' },
        innerBlocks: [],
        innerContent: [`\n<p class="tracy-lead mb-0">${escapeHtml(extras.intro)}</p>\n`]
      }
      parent.innerBlocks.splice(idx + 1, 0, para)
      const nulls = []
      parent.innerContent.forEach((c, k) => c === null && nulls.push(k))
      parent.innerContent.splice(nulls[idx] + 1, 0, '\n', null)
    }
  }
  if (extras.note) {
    const inner = blocks[0]?.innerBlocks?.[0]
    if (inner) {
      inner.innerBlocks.push({
        name: 'core/paragraph',
        attrs: { className: 'tracy-meta text-center mt-6 mb-0' },
        innerBlocks: [],
        innerContent: [`\n<p class="tracy-meta text-center mt-6 mb-0">${escapeHtml(extras.note)}</p>\n`]
      })
      const last = inner.innerContent.length - 1
      inner.innerContent.splice(last, 0, '\n', null)
    }
  }
  return serializeBlocks(blocks)
}

/**
 * OpenDesign's `--brand-*` variables, as the theme's own tokens. Inline OpenDesign HTML that
 * reaches the page verbatim (a carried illustration, a core/html fallback) styles itself with
 * these, and the theme does not define them — an unresolved var() paints nothing. Colours land on
 * the theme.json presets (so dark mode follows); sizes are the values OpenDesign's base sheet
 * resolves them to.
 */
const preset = (name) => `var(--wp--preset--color--${name})`
const mix = (name, pct) => `color-mix(in srgb, ${preset(name)} ${pct}%, transparent)`
const BRAND_TOKENS = {
  'color-primary': preset('accent'),
  'color-primary-hover': preset('accent-hover'),
  'color-primary-active': preset('accent-active'),
  'color-primary-contrast': preset('accent-on'),
  'color-primary-bg': mix('accent', 12),
  'color-primary-border': mix('accent', 40),
  'color-primary-ink': preset('accent'),
  'color-primary-text': preset('accent'),
  'color-link': preset('accent'),
  'color-text': preset('fg'),
  'color-text-secondary': preset('fg-2'),
  'color-text-tertiary': preset('muted'),
  'color-text-quaternary': preset('meta'),
  'color-bg': preset('bg'),
  'color-bg-layout': preset('bg'),
  'color-bg-container': preset('surface'),
  'color-border': preset('border'),
  'color-border-secondary': preset('border-soft'),
  'color-fill': mix('fg', 12),
  'color-fill-secondary': mix('fg', 8),
  'color-fill-tertiary': mix('fg', 5),
  'color-fill-quaternary': mix('fg', 3),
  'color-error': preset('danger'),
  'color-warning': preset('warn'),
  'color-success': preset('success'),
  'primary-palette-4': mix('accent', 55),
  'primary-palette-5': mix('accent', 70),
  'primary-palette-6': mix('accent', 85),
  'primary-palette-7': preset('accent'),
  'line-width': '1px',
  'border-radius-sm': '6px',
  'border-radius': '10px',
  'border-radius-lg': '14px',
  'size-xxs': '4px',
  'size-xs': '8px',
  'size-sm': '12px',
  size: '16px',
  'size-md': '20px',
  'size-lg': '24px',
  'size-xl': '32px',
  'size-xxl': '40px',
  'font-family': 'inherit',
  'font-size-sm': '0.875rem',
  'font-size': '1rem',
  'font-size-lg': '1.125rem',
  'font-size-xl': '1.25rem',
  'font-size-heading-2': '2rem',
  'font-size-heading-3': '1.5rem',
  'font-size-heading-4': '1.25rem',
  'font-weight-strong': '600',
  'line-height': '1.5',
  'control-height-sm': '28px',
  'control-height': '40px',
  'control-height-lg': '48px',
  'motion-duration-mid': '0.2s',
  'motion-ease-in-out': 'ease-in-out'
}
export function rewriteBrandTokens(markup, unknown = null) {
  return markup.replace(/var\(--(?:brand-([a-z0-9-]+)|display-family)\)/g, (m, key) => {
    if (key === undefined) return 'inherit'
    if (BRAND_TOKENS[key] !== undefined) return BRAND_TOKENS[key]
    unknown?.add(key)
    return m
  })
}

const htmlBlock = (html) => `<!-- wp:html -->\n${html.trim()}\n<!-- /wp:html -->`

const HTML_BLOCK_RE = /<!-- wp:html -->[\s\S]*?<!-- \/wp:html -->/g
/**
 * Colour literals inside the core/html blocks of `markup` → the theme's presets (ctx.palette), so
 * verbatim HTML follows dark mode like the rest of the page. Blocks that came through a pattern
 * are not core/html and are not touched. `tally` accumulates the page's counts for the report.
 */
function presetHtmlBlocks(markup, ctx, tally) {
  return markup.replace(HTML_BLOCK_RE, (block) => {
    let out = liveLinks(block)
    if (ctx.palette?.length) {
      const preset = presetInlineColors(out, ctx.palette)
      tally.replaced += preset.replaced
      tally.kept += preset.kept
      out = preset.markup
    }
    return out
  })
}

const URL_TEXT_RE = /^(https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"']*)?$/i
const ABS_URL_RE = /^(https?:\/\/)/i
/**
 * A dead link that prints its own address gets it: `<a href="#">` whose text (a line of it)
 * is a URL — the social tiles of a design export say "t.me/northgate_ind" under a `#`. An
 * absolute address opens in a new tab. Anything else is left as the source drew it.
 */
export function liveLinks(html) {
  if (!/href="#"/.test(html)) return html
  const tpl = document.createElement('template')
  tpl.innerHTML = html
  let changed = false
  for (const a of tpl.content.querySelectorAll('a[href="#"]')) {
    // Lines: the leaves' text, and the anchor's own text nodes — never a concatenation of
    // children ("LinkedIn" + "linkedin.com/…" is not an address).
    const own = [...a.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim())
    const lines = [...own, ...[...a.querySelectorAll('*')].filter((e) => !e.children.length).map((e) => textOf(e))].filter(Boolean)
    const url = lines.find((t) => URL_TEXT_RE.test(t) && !/^[\d.]+$/.test(t))
    if (!url) continue
    const href = ABS_URL_RE.test(url) ? url : `https://${url}`
    a.setAttribute('href', href)
    a.setAttribute('target', '_blank')
    a.setAttribute('rel', 'noopener')
    changed = true
  }
  return changed ? tpl.innerHTML : html
}

/**
 * Utility runs a pattern is allowed to lose: "Read more →", "Back to top ↑", a lone arrow. Chips
 * (`fields.filters`) are excluded by the caller — whether a filter row is content is a decision
 * of its own, not a coverage failure.
 */
const TYPED_LOSS_IGNORE = /^(read more|learn more|see (all|more)|view (all|more)|show (all|more)|back to top|scroll)\b|^[→←↑↓›»]+$/i

/**
 * The text runs of a source section (leaf mode, ≥ 3 words) the rendered markup does not carry.
 * Containment is on normalised text with spaces removed — a canvas export splits a sentence over
 * inline spans without whitespace ("fornext-generation"), and the pattern may put the same words
 * in two blocks. A run that is one of `filters`, or matches `ignore`, never counts as dropped;
 * a chip row the extractor read together with a button ("All Factories M&E All projects →") is
 * checked after its chips are taken out.
 * @returns {{ dropped: string[], runs: number }}
 */
function typedCoverage(html, markup, { filters = [], ignore = TYPED_LOSS_IGNORE, carried = '' } = {}) {
  const source = extractRuns(html, { runs: 'leaf', minWords: 3 }).runs
  const squash = (s) => norm(s).replace(/ /g, '')
  // `carried`: text the page prints that is not in the markup — the Contact Form 7 form a
  // `form.embed` shortcode expands to (its labels, options, consent line and buttons).
  const rendered = squash(extractRuns(markup, { runs: 'leaf', minWords: 1 }).text) + squash(String(carried ?? ''))
  const chips = (filters ?? []).map((f) => norm(String(f))).filter(Boolean)
  // A chip is a word (or words) of the run, never a substring of one: "All" is a chip on every
  // listing and "Installation" contains it — cut from the middle of the word the key never
  // matched, and a whole projects section fell back to core/html.
  const chipRe = (chip) => new RegExp(`(^| )${chip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?= |$)`, 'g')
  const dropped = source.filter((run) => {
    if (ignore?.test(run)) return false
    let residual = norm(run)
    for (const chip of chips) residual = residual.replace(chipRe(chip), ' ')
    const key = residual.replace(/ /g, '')
    return key !== '' && !rendered.includes(key)
  })
  return { dropped, runs: source.length }
}

/**
 * A page's `section` entry through the typed path: the spec section it names (sections.custom by
 * moduleId) when the map has its type, or the links shape of an untyped one. Returns the markup,
 * or null when neither applies — the caller goes on to the library alignment. A typed render that
 * drops runs of the source is not used (unless ctx.typedLoss is 'allow'): the source goes in as
 * core/html through `colors`, and the report names the runs.
 */
function renderTypedEntry(entry, page, ctx, colors = { replaced: 0, kept: 0 }) {
  const section = (ctx.spec.sections.custom ?? []).find((c) => c.id === entry.moduleId)
  const cf7 = ctx.cf7For?.(page.locale ?? null) ?? ctx.cf7 ?? null
  const opts = { view: page.view, links: ctx.links, cf7 }
  const record = (extra) => ctx.sections.push({ page: page.path, module: entry.moduleId, ...extra })
  const noteAll = (notes) => {
    for (const n of notes) ctx.log.push({ page: page.path, module: entry.moduleId, note: n })
  }
  const type = section?.sectionType ?? entry.sectionType ?? null
  // A section's pictures resolve through its own image table first, then the page's.
  const media = (ref) => ctx.media(ref, [section?.images ?? [], ...pageImageTables(page, ctx.spec)], { page: page.path, module: entry.moduleId })
  if (section && typedDef(ctx.patternsMap, type)) {
    const { section: shown, notes: cardNotes } = type === 'news' ? newsCardsOfPosts(section, ctx.spec.content?.posts ?? []) : { section, notes: [] }
    noteAll(cardNotes)
    const { markup, notes } = renderTypedSection(shown, ctx.patternsMap, ctx.patterns, media, opts)
    noteAll(notes)
    if (!markup) return null
    const pattern = ctx.patternsMap.types[type].pattern
    // The spec section is what was rendered, so its html is the source the render is held to;
    // a section without one (an older spec-pack) is not gated.
    const html = section.html ?? ''
    // A form pattern carries its fields in the CF7 form the embed expands to, not in blocks:
    // the source's labels, options, consent and buttons are printed by the shortcode.
    const carried = markup.includes('[contact-form-7') && cf7?.text ? cf7.text : ''
    const { dropped } = html ? typedCoverage(html, markup, { filters: section.fields?.filters, carried }) : { dropped: [] }
    if (dropped.length && ctx.typedLoss !== 'allow') {
      ctx.log.push({
        page: page.path,
        module: entry.moduleId,
        type,
        dropped,
        note: `typed render drops ${dropped.length} runs → core/html`
      })
      // The source goes in verbatim — with the live form where its dead controls stood, on the
      // contact page: one form, the source's fields, in the source's card (lib/form-embed.mjs).
      if (type === 'form' && page.view === 'page-contact' && cf7?.id) {
        const embedded = embedShortcode(html, `[contact-form-7 id="${cf7.id}" title="${cf7.title}"]`)
        if (embedded.embedded) {
          ctx.log.push({ page: page.path, module: entry.moduleId, note: `${entry.moduleId} form: the Contact Form 7 form stands where the source's controls stood` })
          // One CF7 form per locale: a second drawn form has no form of its own to embed, so it
          // stays as markup that posts nowhere. Said here, never left silent.
          for (const other of embedded.left)
            ctx.log.push({
              page: page.path,
              module: entry.moduleId,
              form: 'contact',
              note: `${entry.moduleId} form: a second form (${other.submit ? `"${other.submit}", ` : ''}fields ${other.fields.map((f) => JSON.stringify(f)).join(', ') || 'none'}) is NOT embedded — it stays as drawn markup that sends nothing; give it a form of its own or drop it from the design`
            })
          record({ kind: 'html', via: 'coverage', type, pattern, dropped, title: entry.title, embed: 'in-place' })
          return htmlBlock(embedded.html)
        }
      }
      record({ kind: 'html', via: 'coverage', type, pattern, dropped, title: entry.title })
      return htmlBlock(html)
    }
    if (dropped.length) {
      ctx.log.push({
        page: page.path,
        module: entry.moduleId,
        type,
        dropped,
        note: `typed render drops ${dropped.length} runs, kept (--typed-loss allow)`
      })
    }
    record({ kind: 'typed', type, pattern, ...(dropped.length ? { dropped } : {}) })
    return markup
  }
  if (type) return null
  const def = shapeDef(ctx.patternsMap, 'links')
  const html = entry.html ?? section?.html ?? ''
  const groups = def && html ? linksShape(html) : null
  if (!groups) return null
  const shapeType = Object.entries(ctx.patternsMap.types).find(([, d]) => d === def)[0]
  const out = []
  groups.forEach((g, i) => {
    const pseudo = {
      id: `${entry.moduleId}#${i + 1}`,
      sectionType: shapeType,
      fields: { eyebrow: null, heading: g.heading || null, headingLevel: 2, intro: null, ctas: [] },
      items: g.items,
      images: []
    }
    const { markup, notes } = renderTypedSection(pseudo, ctx.patternsMap, ctx.patterns, media, opts)
    noteAll(notes)
    if (markup) out.push(markup)
  })
  if (!out.length) return null
  record({ kind: 'typed', type: shapeType, via: 'links-shape', groups: groups.length, pattern: def.pattern })
  return out.join('\n')
}

/**
 * A news band's cards with the picture of the post each one is: the design draws its own
 * illustration for the home page's teaser of a post and another for the listing's card of it,
 * so the same article showed one thumbnail on the home page and a different one on the news
 * page, the sidebar and its own hero (a query loop prints the featured image everywhere else).
 * A card whose title is a post's title (its locale's) takes that post's `featuredImage`; a card
 * that names no post — the mock's copy — keeps its own picture. Returns a copy of the section
 * and a note per card swapped.
 */
export function newsCardsOfPosts(section, posts) {
  const notes = []
  const items = (section.items ?? []).map((it) => {
    const post = posts.find((p) => titleKey(p.title) === titleKey(it.title) && (!section.locale || !p.locale || p.locale === section.locale))
    if (!post?.featuredImage || post.featuredImage === it.img) return it
    notes.push(`${section.id} news card "${it.title}": picture ${post.featuredImage.split('/').pop()} — the post's featured image, not the ${String(it.img ?? '').split('/').pop() || 'card'} the export drew for the card`)
    return { ...it, img: post.featuredImage, alt: post.featuredImageAlt || it.alt }
  })
  return { section: { ...section, items }, notes }
}

/**
 * The block a theme draws a view's body with, from `patternsMap.views[<view>]`:
 * `{ block: '<ns>/<name>', after: '<position>' }` → `{ block, after, markup }`, or null.
 */
function viewBody(patternsMap, view) {
  const def = view ? patternsMap?.views?.[view] : null
  if (!def?.block) return null
  return { block: def.block, after: def.after ?? null, markup: `<!-- wp:${def.block} /-->` }
}

/**
 * Build a page's post_content. `ctx` carries `spec`, `patternsMap`, `patterns`, `media(ref)`,
 * `rewrite(markup)` (upload paths → attachment URLs), `cf7` (form id or null) and `log` (array).
 */
export function buildPageContent(page, ctx) {
  ctx.currentArticleId = page.currentArticleId ?? page.joomla?.articleId ?? null
  const groups = instancesForPage(ctx.spec, page)
  const used = new Set()
  const colors = { replaced: 0, kept: 0 }
  // A view whose body the theme draws itself (`views` in patterns.map.json: the source's component —
  // a com_contact form — as one of the theme's blocks) takes that block after its named position.
  const view = viewBody(ctx.patternsMap, page.view)
  let viewPlaced = false
  // A slot entry that names its modules (from-joomla: one entry per module, in the layout's order)
  // draws those, so two modules at one position keep whatever sits between them; the first slot
  // of a position also draws what no slot there names, so nothing assigned to it is lost.
  const named = new Map()
  if (page.contentKind === 'sections' && Array.isArray(page.content))
    for (const e of page.content)
      if (e?.kind === 'slot' && Array.isArray(e.modules)) for (const id of e.modules) (named.get(e.position) ?? named.set(e.position, new Set()).get(e.position)).add(String(id))
  // A slot that names a module recorded at another position draws it there, once: the module is
  // relocated to the first slot that names it, and its recorded position skips it.
  const recordedAt = new Map()
  for (const [pos, list] of groups) for (const inst of list) recordedAt.set(String(inst.id), pos)
  for (const m of ctx.spec.sections?.other ?? []) if (!recordedAt.has(String(m.id))) recordedAt.set(String(m.id), m.position)
  const relocated = new Map()
  // The first slot to name a module owns it, even when that slot is the module's recorded position.
  const firstSlot = new Map()
  if (page.contentKind === 'sections' && Array.isArray(page.content))
    for (const e of page.content)
      if (e?.kind === 'slot' && Array.isArray(e.modules)) for (const id of e.modules) if (!firstSlot.has(String(id))) firstSlot.set(String(id), e.position)
  for (const [id, pos] of firstSlot) if (recordedAt.has(id) && recordedAt.get(id) !== pos) relocated.set(id, pos)
  const movedAway = (id, pos) => relocated.has(String(id)) && relocated.get(String(id)) !== pos
  const drawnAcm = new Set()
  const renderPosition = (pos, only = null, order = null) => {
    const first = !used.has(pos)
    const takes = (id) => (only ? only.has(String(id)) || (first && !named.get(pos)?.has(String(id))) : true)
    const out = renderSections(pos, takes, order)
    if (!view || view.after !== pos || viewPlaced) return out
    viewPlaced = true
    return [out, view.markup].filter(Boolean).join('\n')
  }
  // A post's route (postWithRoute) also draws the list modules its menu page showed at a
  // position — a related-articles block — which on a page the template's own parts draw.
  const routeOthers = (pos, takes) =>
    page.routeModules
      ? (ctx.spec.sections?.other ?? [])
          .filter((m) => m.position === pos && !movedAway(m.id, pos) && takes(m.id) && page.routeModules.has(String(m.id)) && !page.drawn.has(String(m.id)))
          .sort((a, b) => (Number(a.ordering) || 0) - (Number(b.ordering) || 0))
          .map((m) => {
            const markup = renderListModule(m, ctx, page.path, 20 + 2 * page.drawn.size)
            if (markup) page.drawn.add(String(m.id))
            return { id: String(m.id), markup }
          })
      : []
  // `order`: the module ids of the slot being drawn, in the layout's order. Every item the position
  // draws (ACM section, route module, named list module) is placed by it, so a list module keeps the
  // place between two sections its slot gave it; an item no slot names (drawn by the first slot) leads.
  const renderSections = (pos, takes, order = null) => {
    used.add(pos)
    const brought = order
      ? [...groups].filter(([p]) => p !== pos).flatMap(([, list]) => list).filter((inst) => order.includes(String(inst.id)) && relocated.get(String(inst.id)) === pos)
      : []
    const acm = [...(groups.get(pos) ?? []).filter((inst) => !movedAway(inst.id, pos) && takes(inst.id)), ...brought]
      .filter((inst) => !drawnAcm.has(String(inst.id)))
      .map((inst) => {
        drawnAcm.add(String(inst.id))
        if (recordedAt.get(String(inst.id)) !== pos) ctx.log.push({ page: page.path, module: inst.id, note: `module ${inst.id} is recorded at "${recordedAt.get(String(inst.id))}" and drawn where the layout's slot at "${pos}" names it` })
        const { markup, notes, unresolvedSeedResults } = renderAcm(inst, ctx.patternsMap, ctx.patterns, ctx.media)
        for (const n of notes) ctx.log.push({ page: page.path, module: inst.id, note: n })
        for (const result of unresolvedSeedResults) {
          const item = { page: page.path, module: inst.id, ...result }
          ctx.unresolvedSeedResults.push(item)
          ctx.log.push({ ...item, name: result.kind })
        }
        if (!markup) {
          ctx.log.push({ page: page.path, module: inst.id, fallback: 'skipped', reason: 'no pattern' })
          return { id: String(inst.id), markup: '' }
        }
        ctx.sections.push({
          page: page.path,
          module: inst.id,
          kind: 'acm',
          pattern: acmPattern(ctx.patternsMap.types[`${inst.type}:${inst.style}`], inst)
        })
        return { id: String(inst.id), markup }
      })
    const items = [...acm, ...routeOthers(pos, takes), ...namedOthers(pos, order)]
    if (order) {
      const at = (it) => order.indexOf(it.id)
      items.sort((a, b) => at(a) - at(b))
    }
    return items.map((it) => it.markup).filter(Boolean).join('\n')
  }
  // A list module (mod_articles_category, mod_articles_latest, mod_tags_popular …) a slot entry names
  // by id is drawn where the slot stands; before, it landed in `sections.other` and no page drew it.
  // The page's sidebar (`aside`) draws its own modules, so those are left to it. A slot draws the ids
  // it names — whichever position the module was recorded at — and says so when an id it names is
  // neither a list module nor one of the page's sections: a declared module is never dropped unseen.
  const asideIds = new Set((page.archive?.aside ?? page.aside ?? []).map(String))
  const drawnHere = new Set()
  const knownIds = new Set([...groups.values()].flat().map((i) => String(i.id)))
  const namedOthers = (pos, order) =>
    (order ?? (named.get(pos) ? [...named.get(pos)] : []))
      .map(String)
      .filter((id) => !asideIds.has(id) && !drawnHere.has(id) && !page.drawn?.has(id))
      .map((id) => {
        const m = (ctx.spec.sections?.other ?? []).find((o) => String(o.id) === id)
        if (!m) {
          if (!knownIds.has(id)) ctx.log.push({ page: page.path, module: id, note: `the slot at "${pos}" names module ${id}, which the spec has neither as a section nor as a list module; nothing drawn` })
          return null
        }
        if (m.position !== pos) ctx.log.push({ page: page.path, module: id, note: `module ${id} is recorded at "${m.position}" and drawn where the layout's slot at "${pos}" names it` })
        drawnHere.add(id)
        const markup = renderListModule(m, ctx, page.path, 20 + 2 * drawnHere.size)
        if (markup) page.drawn?.add(id)
        if (markup) ctx.sections.push({ page: page.path, module: m.id, kind: 'list-module', module_type: m.module })
        return { id, markup }
      })
      .filter(Boolean)
  let body
  if (page.contentKind === 'sections' && Array.isArray(page.content)) {
    const customById = new Map((ctx.spec.sections?.custom ?? []).map((c) => [c.id, c]))
    const renderedEntries = page.content
      .map((entry) => {
        switch (entry.kind) {
          case 'section': {
            // A module that is one of the ACM sections in disguise renders through the ACM path.
            const acm = acmFromModule(entry.html, entry.moduleId)
            if (acm && ctx.patternsMap.types[`${acm.instance.type}:${acm.instance.style}`]) {
              const { markup, notes, unresolvedSeedResults } = renderAcm(acm.instance, ctx.patternsMap, ctx.patterns, ctx.media)
              for (const n of notes) ctx.log.push({ page: page.path, module: entry.moduleId, note: n })
              for (const result of unresolvedSeedResults) {
                const item = { page: page.path, module: entry.moduleId, ...result }
                ctx.unresolvedSeedResults.push(item)
                ctx.log.push({ ...item, name: result.kind })
              }
              if (markup) {
                ctx.sections.push({
                  page: page.path,
                  module: entry.moduleId,
                  kind: 'acm',
                  pattern: ctx.patternsMap.types[`${acm.instance.type}:${acm.instance.style}`].pattern,
                  via: 'od-block'
                })
                return withExtras(markup, acm.extras, acm.instance.type)
              }
            }
            // A typed section with a pattern of its own (patterns.map.json keyed by sectionType) is
            // filled by name; an untyped one that is a list of links, by shape. Both before the
            // structural alignment, which is the fallback for a library pattern, not the rule.
            const typed = renderTypedEntry(entry, page, ctx, colors)
            if (typed) return typed
            const slug = `tracy/section-${entry.sectionType}`
            const pattern = ctx.patterns[slug]
            const report = {}
            const filled = pattern ? fillFromLibrary(pattern, entry.html, report) : null
            if (filled) {
              ctx.sections.push({
                page: page.path,
                module: entry.moduleId,
                kind: 'library',
                pattern: slug,
                removed: report.removed,
                inserted: report.inserted
              })
              return filled
            }
            ctx.sections.push({
              page: page.path,
              module: entry.moduleId,
              kind: 'fallback',
              pattern: slug,
              reason: pattern ? report.failure : 'no such library pattern',
              title: entry.title
            })
            return htmlBlock(entry.html)
          }
          case 'html': {
            // An untyped section arrives pre-converted (`blocks`); one that is a list of links
            // still takes the links pattern, by shape.
            const typed = renderTypedEntry(entry, page, ctx, colors)
            if (typed) return typed
            ctx.sections.push({ page: page.path, module: entry.moduleId, kind: 'html', title: entry.title })
            return entry.blocks
          }
          case 'slot':
            return renderPosition(entry.position, Array.isArray(entry.modules) ? new Set(entry.modules.map(String)) : null, Array.isArray(entry.modules) ? entry.modules.map(String) : null)
          case 'blocks':
            return entry.markup
          case 'body':
            return POST_BODY_MARKER
          default:
            ctx.log.push({ page: page.path, fallback: 'skipped', reason: `content entry of unknown kind ${JSON.stringify(entry?.kind ?? null)}` })
            return ''
        }
      })
      // A module section carries its source wrapper's classes (spacing, class suffix) whichever path renders it.
      .map((out, i) => ({ out: ['section', 'html'].includes(page.content[i].kind) ? withModuleClasses(out, customById.get(page.content[i].moduleId)) : out, entry: page.content[i] }))
      .filter(({ out }) => Boolean(out))
    const groups = []
    for (const { out, entry } of renderedEntries) {
      const prior = groups.at(-1)
      if (entry.frame && prior?.row === entry.row && JSON.stringify(prior.frame) === JSON.stringify(entry.frame)) prior.parts.push(out)
      else groups.push({ row: entry.row, frame: entry.frame ?? null, parts: [out] })
    }
    body = groups.map(({ frame, parts }) => frame ? rowFrameMarkup(parts.join('\n'), frame, ctx, page) : parts.join('\n')).filter(Boolean).join('\n')
  } else {
    // A body kept as blocks (no section stack) may open with the source's own breadcrumb row;
    // the template prints one, so the source's goes (lib/post-content.mjs stripSourceBreadcrumb).
    const crumb = stripSourceBreadcrumb(page.content ?? '')
    if (crumb.removed) ctx.log.push({ page: page.path, note: 'source breadcrumb row dropped from the body (the theme renders its own)' })
    body = crumb.content.replace(SLOT_RE, (_, json) => {
      const pos = JSON.parse(json).position
      const out = renderPosition(pos)
      return out ? out + '\n' : ''
    })
  }
  // Instances assigned to the page at positions the body never named: after the body, in position order.
  const rest = [...groups.keys()].filter((p) => !used.has(p)).sort(byPosition)
  for (const pos of rest) {
    const out = renderPosition(pos)
    if (out) body = body.trim() ? `${body.trim()}\n${out}` : out
  }
  if (view && !viewPlaced) {
    body = [body.trim(), view.markup].filter(Boolean).join('\n')
    ctx.log.push({ page: page.path, note: `${view.block}: position ${view.after ?? '(none named)'} not on the page; placed after the body` })
  }
  if (page.view === 'page-contact' && page.contact) {
    const contact = contactBody(page.contact)
    if (contact) body = [body.trim(), contact].filter(Boolean).join('\n')
  }
  if (page.featured?.drawn && page.featured?.orderBy === 'featuredOrdering') body = [body.trim(), postsQueryOf(ctx, { featuredOnly: true })].filter(Boolean).join('\n')
  const cf7 = ctx.cf7For?.(page.locale ?? null) ?? ctx.cf7 ?? null
  if (page.view === 'page-contact' && cf7 && !body.includes('[contact-form-7')) {
    // The record name is already the contact body heading when the adapter carried the record.
    const headingText = page.contact?.name ? null : page.joomla?.contactName ?? ctx.contactHeading ?? null
    const parts = [
      body.trim(),
      headingText ? heading(escapeHtml(headingText), 2) : '',
      `<!-- wp:shortcode -->\n[contact-form-7 id="${cf7.id}" title="${cf7.title}"]\n<!-- /wp:shortcode -->`
    ]
    body = parts.filter(Boolean).join('\n')
  }
  // One pass over the whole page, whichever path built each block: the style-guide view, a
  // coverage fallback and a pre-converted untyped section all end as core/html, and the pass is
  // idempotent (a `var(--…)` is not a literal), so once at the end counts each literal once.
  body = presetHtmlBlocks(body, ctx, colors)
  if (colors.replaced + colors.kept > 0) ctx.inlineColors?.push({ page: page.path, ...colors })
  return ctx.rewrite(body.trim(), pageImageTables(page, ctx.spec), { page: page.path })
}

const heading = (text, level = 2, className = '') =>
  `<!-- wp:heading ${JSON.stringify({ ...(level !== 2 ? { level } : {}), ...(className ? { className } : {}) })} -->\n<h${level} class="wp-block-heading${className ? ' ' + className : ''}">${text}</h${level}>\n<!-- /wp:heading -->`

/** Printed fields from a Joomla contact record, as editable page blocks. Empty source fields stay absent. */
function contactBody(contact) {
  const parts = []
  const text = (value) => typeof value === 'string' ? value.trim() : ''
  const para = (value) => `<!-- wp:paragraph -->\n<p>${value}</p>\n<!-- /wp:paragraph -->`
  if (text(contact.name)) parts.push(heading(escapeHtml(text(contact.name))))
  if (text(contact.position)) parts.push(para(escapeHtml(text(contact.position))))
  const address = ['street', 'suburb', 'state', 'postcode', 'country'].map((key) => text(contact[key])).filter(Boolean)
  if (address.length) parts.push(para(address.map(escapeHtml).join('<br>')))
  for (const key of ['telephone', 'mobile', 'fax']) {
    const value = text(contact[key])
    if (value) parts.push(para(escapeHtml(value)))
  }
  const email = text(contact.email)
  if (email) parts.push(para(`<a href="mailto:${escapeAttr(email)}">${escapeHtml(email)}</a>`))
  const webpage = text(contact.webpage)
  if (webpage) {
    const link = /^https?:\/\/\S+$/i.test(webpage) ? `<a href="${escapeAttr(webpage)}">${escapeHtml(webpage)}</a>` : escapeHtml(webpage)
    parts.push(para(link))
  }
  for (const link of contact.links ?? []) {
    const label = text(link?.label)
    const url = text(link?.url)
    if (url) parts.push(para(`<a href="${escapeAttr(url)}">${escapeHtml(label || url)}</a>`))
  }
  if (text(contact.misc)) parts.push(htmlToBlocks(contact.misc))
  return parts.filter(Boolean).join('\n')
}
/** A category's description as blocks (Joomla stores HTML, sometimes with a leading image). */
function categoryDescription(term, ctx) {
  const spec = ctx.spec.content.categories.find((c) => c.wpSlug === term.slug)
  const html = String(spec?.description ?? term.description ?? '').trim()
  if (!html) return ''
  return ctx.rewrite(htmlToBlocks(html), [], { category: term.slug })
}

const PAGINATION =
  '<!-- wp:query-pagination -->\n<!-- wp:query-pagination-previous /-->\n<!-- wp:query-pagination-numbers /-->\n<!-- wp:query-pagination-next /-->\n<!-- /wp:query-pagination -->'

/**
 * A query that pages (an archive that declares `perPage`) carries a pager: the cards pattern's
 * own core/query-pagination when it has one, else the core one after the post template. Without
 * it a listing longer than a page stopped at its first page with no way to the rest.
 */
function withPagination(query, { joomla = false } = {}) {
  if (!findAll([query], (b) => b.name === 'core/query-pagination').length) {
    query.innerBlocks.push(parseBlocks(PAGINATION).find((b) => b.name === 'core/query-pagination'))
    const close = query.innerContent.pop()
    query.innerContent.push('\n', null, close)
  }
  // A Joomla listing's pager is drawn as Joomla draws it (JOOMLA_PAGER_PLUGIN): the block stays
  // core/query-pagination, marked by its class.
  if (joomla)
    for (const b of findAll([query], (x) => x.name === 'core/query-pagination')) {
      const classes = String(b.attrs.className ?? '').split(/\s+/).filter(Boolean)
      if (!classes.includes(JOOMLA_PAGER_CLASS)) b.attrs.className = [...classes, JOOMLA_PAGER_CLASS].join(' ')
    }
}

/**
 * The class that has JOOMLA_PAGER_PLUGIN draw a core/query-pagination block as a Joomla category
 * blog's pager: start · previous · numbers · next · end, the controls that lead nowhere disabled,
 * and "Page N of M" — counted from the block's own query. Set on the pager of an archive the Joomla
 * adapter pages (`archive.paging` with `perPage`); every other pager stays core's.
 */
const JOOMLA_PAGER_CLASS = 'tracy-joomla-pager'
/** Whether an archive's pager is Joomla's: the adapter recorded how the source pages it. */
const joomlaPaged = (archive) => Boolean(archive?.paging && archivePerPage(archive))

/**
 * Put `block` into `blocks` right before `target` (a block somewhere in the tree), keeping the
 * parent's markup in step: one placeholder more in its innerContent, before the target's.
 */
function insertBefore(blocks, target, block) {
  const parent = findParentOf(blocks, target)
  const list = parent ? parent.innerBlocks : blocks
  const idx = list.indexOf(target)
  if (idx < 0) throw new Error('insertBefore: the target is not in the tree')
  list.splice(idx, 0, block)
  if (!parent) return
  let seen = -1
  for (let i = 0; i < parent.innerContent.length; i++) {
    if (parent.innerContent[i] !== null) continue
    if (++seen === idx) {
      parent.innerContent.splice(i, 0, null, '\n')
      return
    }
  }
}

/**
 * The cards an archive shows per page: `archive.perPage`, a positive integer, when the spec
 * declares it (from-joomla: the category blog's leading + intro articles); null when it does not,
 * and the query keeps its default of 12 with no pager added — an older spec keeps its bytes.
 */
export function archivePerPage(archive) {
  const v = archive?.perPage
  if (v === undefined || v === null) return null
  if (!Number.isInteger(v) || v < 1) throw new Error(`archive ${archive.path}: perPage must be a positive integer; got ${JSON.stringify(v)}`)
  return v
}

/** The query-loop cards for posts of a category (with its descendants: the block's own filter leaves children out). */
function postsQueryOf(ctx, { termIds = null, tagIds = null, excludeTagIds = null, queryId = 2, perPage = null, joomlaPager = false, orderBy = null, order = null, hideExcerpt = false, featuredOnly = false } = {}) {
  const cards = parseBlocks(ctx.patterns['tracy/cards'])
  const query = cards.find((b) => b.name === 'core/query')
  const q = { ...query.attrs.query, inherit: false, perPage: perPage ?? 12 }
  if (perPage != null) withPagination(query, { joomla: joomlaPager })
  if (termIds) q.taxQuery = { category: termIds }
  if (orderBy) q.orderBy = orderBy
  if (order) q.order = order
  if (featuredOnly) { q.sticky = 'only'; q.orderBy = 'menu_order'; q.order = 'asc' }
  if (tagIds) q.taxQuery = { ...q.taxQuery, post_tag: tagIds }
  // A term to leave out needs the include/exclude shape of taxQuery (WordPress 6.8+); the plain
  // shape stays when nothing is excluded, so existing pages keep their bytes.
  if (excludeTagIds?.length) q.taxQuery = { include: q.taxQuery ?? {}, exclude: { post_tag: excludeTagIds } }
  query.attrs.query = q
  query.attrs.queryId = queryId
  // The whole intro, as the source prints it, and a read-more link.
  walkBlocks(cards, (b) => {
    if (b.name === 'core/post-excerpt') Object.assign(b.attrs, { excerptLength: 200, moreText: 'Read more' })
  })
  if (hideExcerpt) for (const b of findAll(cards, (block) => block.name === 'core/post-excerpt')) removeBlock(cards, b)
  return serializeBlocks(cards)
}

/**
 * Cards for the child pages of a page (a Joomla category whose articles are the port's pages).
 * `excludeIds`: children that are NOT articles of the category — a menu page the port filed under
 * the same parent, which the source's category blog never lists.
 */
function childPagesQuery(ctx, parentId, queryId = 3, excludeIds = [], perPage = null, joomlaPager = false, hideExcerpt = false) {
  const cards = parseBlocks(ctx.patterns['tracy/cards'])
  const query = cards.find((b) => b.name === 'core/query')
  if (perPage != null) withPagination(query, { joomla: joomlaPager })
  query.attrs.query = {
    ...query.attrs.query,
    inherit: false,
    postType: 'page',
    parents: [parentId],
    perPage: perPage ?? 12,
    orderBy: 'menu_order',
    order: 'asc',
    ...(excludeIds.length ? { exclude: excludeIds } : {})
  }
  query.attrs.queryId = queryId
  walkBlocks(cards, (b) => {
    if (b.name === 'core/post-excerpt') Object.assign(b.attrs, { excerptLength: 200, moreText: 'Read more' })
    if (b.name === 'core/post-terms') removeBlock(cards, b)
  })
  if (hideExcerpt) for (const b of findAll(cards, (block) => block.name === 'core/post-excerpt')) removeBlock(cards, b)
  return serializeBlocks(cards)
}

/**
 * The spec's child pages of an archive page that are NOT articles of its category or of a
 * category below it (by the Joomla category id the ingest kept on each page).
 */
export function childPagesOutside(page, pages, spec) {
  const cats = spec.content.categories ?? []
  const root = cats.find((c) => c.wpSlug === page.archive?.category)
  if (!root) return []
  const inside = new Set([String(root.id)])
  for (let grew = true; grew; ) {
    grew = false
    for (const c of cats)
      if (c.parent && !inside.has(String(c.id)) && cats.some((p) => p.wpSlug === c.parent && inside.has(String(p.id)))) {
        inside.add(String(c.id))
        grew = true
      }
  }
  return pages.filter((p) => p.parent === page.path && !p.archive && p.joomla?.catid && !inside.has(String(p.joomla.catid)))
}

/** The slugs of the categories below `slug` in the site's term tree (`terms`: slug → { parent }). */
function termsBelow(terms, slug) {
  const out = []
  const walk = (parent) => {
    for (const [s, t] of terms ?? [])
      if (t.parent === parent && !out.includes(s)) {
        out.push(s)
        walk(s)
      }
  }
  walk(slug)
  return out
}

/**
 * Heading + description of each child category, linked to its archive. `depth` levels below the
 * parent (-1: every level), each level one heading level deeper (h6 at most).
 */
function subcategoryList(ctx, parentSlug, level = 3, depth = 1) {
  const kids = ctx.spec.content.categories.filter((c) => c.parent === parentSlug)
  return kids
    .map((c) => {
      const term = ctx.terms.get(c.wpSlug)
      const href = ctx.categoryUrl(c.wpSlug)
      return [
        heading(`<a href="${href}">${escapeHtml(c.title)}</a>`, level),
        term ? categoryDescription(term, ctx) : '',
        depth === 1 ? '' : subcategoryList(ctx, c.wpSlug, Math.min(level + 1, 6), depth - 1)
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')
}

/**
 * An archive's display options (from-joomla archiveDisplay: the source menu item's, else the
 * global ones), checked. A spec without them — another adapter's, or one written before the
 * adapter recorded them — prints title, description and one level of subcategories, as before.
 */
function archiveDisplayOf(archive) {
  const d = archive.display
  if (d == null) return { showTitle: true, showDescription: true, maxLevel: 1 }
  const where = `archive ${archive.path}`
  for (const k of ['showTitle', 'showDescription'])
    if (typeof d[k] !== 'boolean') throw new Error(`${where}: display.${k} must be true or false; got ${JSON.stringify(d[k])}`)
  if (d.showIntro !== undefined && typeof d.showIntro !== 'boolean') throw new Error(`${where}: display.showIntro must be true or false; got ${JSON.stringify(d.showIntro)}`)
  if (!Number.isInteger(d.maxLevel) || d.maxLevel < -1) throw new Error(`${where}: display.maxLevel must be an integer of -1 or more; got ${JSON.stringify(d.maxLevel)}`)
  return d
}

/** A layout position drawn above the component (the list) rather than below it. */
const ABOVE_LIST = /(^|-)(top|header|masthead|hero|intro)(-|\d|$)/i

/**
 * The body of an archive page: the list (the patterns map's view block when it declares one for the
 * archive's view, else the seeder's cards) with the route's own layout rows around it —
 * `archive.sections`, `{ position, modules: [id…] }` in layout order: a position named top / header /
 * masthead stands above the list, the rest below. Before this the page carried the query alone and the
 * CTA and modules of the layout rows were dropped without a note. A module id no section list holds is
 * named in the report. An archive that declares no sections keeps the list alone, byte for byte.
 */
export function archivePageContent(page, ctx, opts = {}) {
  const archive = page.archive
  const view = viewBody(ctx.patternsMap, archive.view)
  let list
  if (view) {
    list = view.markup
    ctx.log?.push({ page: page.path, note: `${archive.view} view: the patterns map's block ${view.block} draws the list instead of the seeder's cards` })
  } else list = buildArchiveContent(archive, ctx, opts)
  const declared = Array.isArray(archive.sections) ? archive.sections.filter((s) => s && s.position) : []
  if (!declared.length) return list
  const custom = new Map((ctx.spec.sections?.custom ?? []).map((m) => [String(m.id), m]))
  const others = new Map([...(ctx.spec.sections?.other ?? []), ...(ctx.spec.sections?.acm ?? [])].map((m) => [String(m.id), m]))
  const above = []
  const below = []
  for (const sec of declared) {
    const ids = Array.isArray(sec.modules) ? sec.modules.map(String) : []
    const target = ABOVE_LIST.test(sec.position) ? above : below
    for (const id of ids) {
      const c = custom.get(id)
      if (c)
        target.push(
          c.sectionType
            ? { kind: 'section', sectionType: c.sectionType, moduleId: c.id, title: c.title, position: sec.position, html: c.html }
            : { kind: 'html', moduleId: c.id, title: c.title, position: sec.position, blocks: c.blocks || htmlBlock(c.html ?? '') }
        )
      else if (others.has(id)) target.push({ kind: 'slot', position: sec.position, modules: [id] })
      else ctx.log?.push({ page: page.path, module: id, note: `layout position ${sec.position} names module ${id}, which the spec's sections do not hold; not drawn` })
    }
  }
  // `view` is suffixed so the page-level view lookup of buildPageContent does not place the block twice.
  return buildPageContent({ ...page, view: `${page.view}:archive`, contentKind: 'sections', content: [...above, { kind: 'blocks', markup: list }, ...below] }, ctx)
}

/**
 * Content for a route that is an archive in Joomla: a page whose body is the matching block.
 * `selfId` is the page's own id (0 before it exists) — a category whose articles became pages
 * lists them as its child pages, and that query needs the parent id.
 */
export function buildArchiveContent(archive, ctx, { selfId = 0, hasChildPages = false, excludeChildIds = [] } = {}) {
  const parts = []
  const perPage = archivePerPage(archive)
  const joomlaPager = joomlaPaged(archive)
  const postsQuery = (c, o = {}) => postsQueryOf(c, { ...o, perPage, joomlaPager })
  switch (archive.view) {
    case 'category': {
      const term = ctx.terms.get(archive.category)
      if (!term) throw new Error(`archive ${archive.path}: category ${archive.category} not seeded`)
      const cat = ctx.spec.content.categories.find((c) => c.wpSlug === archive.category)
      // What the source prints above the list; hiding the subcategory list filters no post.
      const display = archiveDisplayOf(archive)
      if (display.showTitle) parts.push(heading(escapeHtml(cat?.title ?? term.name), 2, 'tracy-eyebrow'))
      if (display.showDescription) parts.push(categoryDescription(term, ctx))
      if (hasChildPages && selfId) parts.push(childPagesQuery(ctx, selfId, 3, excludeChildIds, perPage, joomlaPager, display.showIntro === false))
      if (display.maxLevel !== 0) parts.push(subcategoryList(ctx, archive.category, 3, display.maxLevel))
      // The block's category filter leaves children out (`include_children: false`), so every
      // category below this one is named: the spec's, then any the site holds beside them (one
      // the site owner added under it, whose posts the listing must show too).
      const ids = [
        ...new Set(
          [term.id, ...[...ctx.descendants(archive.category), ...termsBelow(ctx.terms, archive.category)].map((slug) => ctx.terms.get(slug)?.id)].filter(Boolean)
        )
      ]
      // A Joomla category blog lists published articles only; the archived ones (state 2, tagged
      // `archived` by this seeder) belong to the archive view.
      const archived = ctx.tags?.get('archived')
      // A category whose articles all became its child pages has no post left in it or below it
      // (`ctx.postCategories`: the categories the spec's published posts were filed under), and
      // none the site owner published there since (`ctx.publishedPostsIn`: the count WordPress
      // holds, descendants included): a post query there prints the theme's "Nothing here yet."
      // under the page grid. Either one unknown → the query is kept.
      const slugs = [archive.category, ...ctx.descendants(archive.category)]
      const noPosts =
        hasChildPages &&
        ctx.postCategories &&
        !slugs.some((slug) => ctx.postCategories.has(slug)) &&
        ctx.publishedPostsIn?.(archive.category) === 0
      if (!noPosts) {
        const cards = postsQuery(ctx, { termIds: ids, excludeTagIds: archived ? [archived.id] : null, hideExcerpt: display.showIntro === false })
        // Joomla's "More Articles": the titles after the cards and before the pager, as Joomla
        // prints `.items-more` before `.pagination-wrap` (moreArticlesOf) — inside the cards query,
        // in front of its core/query-pagination.
        const more = moreArticlesOf(archive, perPage)
        if (more?.heading) parts.push(withMoreArticles(cards, moreArticlesQuery(cards, { ...more, perPage })))
        else parts.push(cards)
        if (more && !more.heading) ctx.log?.push({ page: archive.path, note: `paging.links ${more.links} declared but the spec gives no heading text (moreArticles.heading); the link-only titles are not drawn` })
      }
      break
    }
    case 'date': {
      parts.push('<!-- wp:archives {"showPostCounts":true} /-->')
      const archived = ctx.tags?.get('archived')
      parts.push(postsQuery(ctx, archived ? { tagIds: [archived.id] } : {}))
      break
    }
    case 'search':
      parts.push(
        '<!-- wp:search {"label":"Search","showLabel":false,"placeholder":"Search the site","buttonText":"Search"} /-->'
      )
      parts.push(postsQuery(ctx))
      break
    case 'tag': {
      // The tags the route declares (`archive.tags`: names or slugs, `archive.orderBy` / `archive.order`):
      // the list holds the posts that carry them, in the declared order — never every post.
      const declared = tagsOfArchive(archive)
      if (declared.length) {
        const ids = declared.map((t) => ctx.tagIdOf?.(t)).filter(Boolean)
        const missing = declared.filter((t) => !ctx.tagIdOf?.(t))
        if (missing.length) ctx.log?.push({ page: archive.path, note: `tag route: tag ${missing.map((t) => JSON.stringify(t)).join(', ')} is not on the site; not in the list` })
        if (ids.length) {
          const orderBy = archive.orderBy === 'title' || archive.orderBy === 'date' ? archive.orderBy : null
          if (archive.orderBy && !orderBy) ctx.log?.push({ page: archive.path, note: `tag route: ordering ${JSON.stringify(archive.orderBy)} is not supported (title, date); the default order applies` })
          parts.push('<!-- wp:tag-cloud /-->')
          parts.push(postsQuery(ctx, { tagIds: ids, orderBy, order: orderBy ? (archive.order === 'desc' ? 'desc' : 'asc') : null }))
        } else ctx.log?.push({ page: archive.path, note: 'tag route: none of its declared tags is on the site; no list drawn' })
      } else {
        ctx.log?.push({ page: archive.path, note: 'tag route declares no tags (archive.tags): every post is listed, as the spec does not say which; the adapter must record the tag filter' })
        parts.push('<!-- wp:tag-cloud /-->')
        parts.push(postsQuery(ctx))
      }
      break
    }
    case 'author':
      // Core has no block that lists users: the posts are listed, and the report says the people are not.
      ctx.log?.push({ page: archive.path, unsupported: 'author-list', note: 'author view: WordPress has no users-list block; a post query is drawn instead of the source\'s list of people (photo, job title, bio)' })
      parts.push(postsQuery(ctx))
      break
    default:
      if (archive.featuredDrawn === false) {
        ctx.log?.push({ page: archive.path, note: 'featured view: the source layout does not draw the featured component; no post list drawn' })
      } else {
        parts.push(postsQuery(ctx, archive.featuredDrawn && archive.featuredOrdering?.length ? { featuredOnly: true } : {}))
      }
  }
  return parts.filter(Boolean).join('\n')
}

/** The tag names or slugs an archive route declares (`archive.tags`, strings or `{ name | slug }`), once each. */
export function tagsOfArchive(archive) {
  const raw = archive?.tags
  if (raw == null) return []
  if (!Array.isArray(raw)) throw new Error(`archive ${archive.path}: tags must be a list of tag names; got ${JSON.stringify(raw)}`)
  const out = []
  for (const t of raw) {
    const name = typeof t === 'string' ? t : t && typeof t === 'object' ? (t.name ?? t.slug) : null
    if (typeof name !== 'string' || !name.trim()) throw new Error(`archive ${archive.path}: tags entry ${JSON.stringify(t)} is not a tag name`)
    if (!out.includes(name.trim())) out.push(name.trim())
  }
  return out
}

/**
 * What a category blog lists after its cards (Joomla's `num_links`, "More Articles …"):
 * `{ links, heading }`, null when it lists nothing (no paging, or `links` 0). `heading` is null
 * when the spec gives no text for it — nothing is drawn then, and the caller says so. Joomla pages
 * a category blog by its cards alone (`?start=7` after 1 leading + 6 intro on JA Vega's
 * /category-blog, measured 27/09): the titles under page N's cards are the posts that open page
 * N+1, so the list needs the cards a page (`perPage`) to know where it starts.
 */
function moreArticlesOf(archive, perPage) {
  const links = archive.paging?.links
  if (archive.paging == null || links === undefined) return null
  if (!Number.isInteger(links) || links < 0) throw new Error(`archive ${archive.path}: paging.links must be a count of 0 or more; got ${JSON.stringify(links)}`)
  if (links === 0) return null
  if (perPage == null) throw new Error(`archive ${archive.path}: paging.links needs perPage (the cards a page) to know where the list starts`)
  const m = archive.moreArticles
  if (m === undefined || m === null) return { links, heading: null }
  if (typeof m !== 'object' || Array.isArray(m) || typeof m.heading !== 'string' || !m.heading.trim())
    throw new Error(`archive ${archive.path}: moreArticles must be { heading: "<text>" }; got ${JSON.stringify(m)}`)
  return { links, heading: m.heading.trim() }
}

/** The query id of a "More Articles" list: none of the page's other queries use it (cards 2, child pages 3, aside 4, 6, 8…). */
const MORE_QUERY_ID = 5

/**
 * The cards query with the "More Articles" query `moreMarkup` placed right before its pager (a
 * query that pages always has one, withPagination): nested there, the list sits between the cards
 * and the page numbers, and keeps its own queryId and query. A cards query without a pager — none
 * a paged listing is built with — gets the list as its last block.
 */
function withMoreArticles(cardsMarkup, moreMarkup) {
  const blocks = parseBlocks(cardsMarkup)
  const query = blocks.find((b) => b.name === 'core/query')
  const more = parseBlocks(moreMarkup).find((b) => b.name === 'core/query')
  const pager = findAll([query], (b) => b.name === 'core/query-pagination')[0]
  if (pager) insertBefore(blocks, pager, more)
  else {
    query.innerBlocks.push(more)
    const close = query.innerContent.pop()
    query.innerContent.push('\n', null, close)
  }
  return serializeBlocks(blocks)
}

/**
 * The "More Articles" list after a category blog's cards: an editable heading and the titles of
 * the next `links` posts, linked, in a core/query that repeats the cards query's filters and order.
 * `query.tracyMore` (`{ after: <cards queryId>, skip: <cards a page> }`) is read by the must-use
 * plugin MORE_ARTICLES_PLUGIN, which offsets the list by the cards query's current page — core
 * offsets a query by a fixed number only — and prints nothing when the list is empty.
 */
function moreArticlesQuery(cardsMarkup, { links, heading: title, perPage }) {
  const cards = parseBlocks(cardsMarkup).find((b) => b.name === 'core/query')
  const q = { ...cards.attrs.query, perPage: links, offset: 0, tracyMore: { after: cards.attrs.queryId, skip: perPage } }
  return [
    `<!-- wp:query ${JSON.stringify({ queryId: MORE_QUERY_ID, query: q, className: 'tracy-more-articles' })} -->`,
    '<div class="wp-block-query tracy-more-articles">',
    heading(escapeHtml(title), 3, 'tracy-more-articles__title'),
    '<!-- wp:post-template {"layout":{"type":"default"}} -->',
    '<!-- wp:post-title {"level":0,"isLink":true} /-->',
    '<!-- /wp:post-template -->',
    '</div>',
    '<!-- /wp:query -->'
  ].join('\n')
}

/** Title of a Joomla module without its bracketed prefix and site name: "[Tracy] Magazine — Latest" → "Latest". */
const moduleHeading = (title) =>
  String(title ?? '')
    .replace(/^\[[^\]]*\]\s*/, '')
    .split(/\s[—–-]\s/)
    .pop()
    .trim()

const moduleHeadingMarkup = (mod) => {
  const title = moduleHeading(mod.title)
  const markup = breaksAsMarkup(title) ?? escapeHtml(title)
  return markup.replace(/<br\s*\/?\s*>/gi, '').trim() ? heading(markup, 2, 'tracy-eyebrow') : ''
}

/** A Joomla T4 row frame is applied to one core/group around that row's cells. */
function rowFrameMarkup(markup, frame, ctx, page) {
  const rawClasses = Array.isArray(frame.classes) ? frame.classes : []
  const classes = [...new Set(rawClasses.filter((name) => typeof name === 'string').flatMap((name) => name.split(/\s+/)).filter(Boolean))]
  const invalidClasses = rawClasses.filter((name) => typeof name !== 'string')
  if (invalidClasses.length) ctx.log.push({ page: page.path, note: `row frame classes ${JSON.stringify(invalidClasses)} are not text class names; not applied` })
  const style = {}
  if (frame.background?.image) {
    const hit = ctx.media?.(frame.background.image, pageImageTables(page, ctx.spec), { page: page.path })
    const url = hit?.url ?? frame.background.image
    if (!hit) ctx.log.push({ page: page.path, note: `row frame background image ${JSON.stringify(frame.background.image)} was not imported; source path retained` })
    style.background = { ...style.background, backgroundImage: { url: String(url) } }
  }
  if (frame.background?.color) {
    const found = (ctx.palette ?? []).find((entry) => entry.color === frame.background.color || entry.value === frame.background.color)
    if (found) style.color = { background: found.var ?? `var(--wp--preset--color--${found.slug})` }
    else ctx.log.push({ page: page.path, note: `row frame background color ${JSON.stringify(frame.background.color)} has no matching theme color preset; not applied` })
  }
  if (frame.spacing != null && frame.spacing !== '') {
    const slug = (ctx.spacingPresets ?? []).find((entry) => entry.slug === frame.spacing || entry.size === frame.spacing)?.slug
    if (slug) style.spacing = { padding: `var(--wp--preset--spacing--${slug})` }
    else ctx.log.push({ page: page.path, note: `row frame spacing ${JSON.stringify(frame.spacing)} has no matching theme spacing preset; not applied` })
  }
  const attrs = { ...(classes.length ? { className: classes.join(' ') } : {}), ...(Object.keys(style).length ? { style } : {}) }
  const cls = classes.join(' ')
  const css = [style.background?.backgroundImage ? `background-image:url('${escapeHtml(style.background.backgroundImage.url)}')` : '', style.color?.background ? `background-color:${escapeHtml(style.color.background)}` : '', style.spacing?.padding ? `padding:${escapeHtml(style.spacing.padding)}` : ''].filter(Boolean).join(';')
  return `<!-- wp:group ${JSON.stringify(attrs)} -->\n<div class="wp-block-group${cls ? ` ${escapeHtml(cls)}` : ''}"${css ? ` style="${css}"` : ''}>\n${markup}\n</div>\n<!-- /wp:group -->`
}

/** A list of post titles from a category set, as mod_articles_category draws it in a sidebar. */
function titlesQuery(ctx, { termIds, count = 5, queryId = 4, orderBy = 'date', order = 'desc', include = null }) {
  const q = {
    perPage: count,
    pages: 0,
    offset: 0,
    postType: 'post',
    order: order === 'asc' ? 'asc' : 'desc',
    orderBy: ['date', 'title', 'modified', 'menu_order'].includes(orderBy) ? orderBy : 'date',
    inherit: false,
    ...(termIds?.length ? { taxQuery: { category: termIds } } : {}),
    ...(include?.length ? { include: include.map(Number).filter(Number.isInteger) } : {})
  }
  return [
    `<!-- wp:query ${JSON.stringify({ queryId, query: q, className: 'tracy-aside__latest' })} -->`,
    '<div class="wp-block-query tracy-aside__latest">',
    '<!-- wp:post-template {"layout":{"type":"default"}} -->',
    '<!-- wp:post-title {"level":3,"isLink":true,"className":"text-sm mb-2"} /-->',
    '<!-- /wp:post-template -->',
    '</div>',
    '<!-- /wp:query -->'
  ].join('\n')
}

/**
 * The sidebar modules a Joomla page carried (`aside` in the spec), as content: a category's
 * latest titles (mod_articles_category) and a category's sections (mod_articles_categories).
 * Anything else is named in the report and skipped. Rendered as a column beside the body so the
 * page keeps its own sidebar rather than the template's generic one.
 */
export function renderAside(asideIds, ctx, pagePath, drawn = null) {
  const parts = []
  for (const id of asideIds ?? []) {
    const mod = (ctx.spec.sections.other ?? []).find((m) => m.id === id)
    if (!mod) continue
    // Query ids 4, 6, 8, … as before the per-module renderer (a heading and a list per module).
    const markup = renderListModule(mod, ctx, pagePath, 4 + 2 * parts.length)
    if (!markup) continue
    parts.push(markup)
    drawn?.add(String(id))
  }
  return parts.filter(Boolean).join('\n')
}

/**
 * One `sections.other` module as blocks, wherever it sits (a sidebar, a route's slot): a category's
 * latest titles (mod_articles_category) or a category's sections (mod_articles_categories). Any
 * other kind, or one whose category is not seeded, is '' with a note in the log.
 */
function renderListModule(mod, ctx, pagePath, queryId) {
  const id = mod.id
  const byJoomlaId = (jid) => ctx.spec.content.categories.find((c) => c.id === String(jid))?.wpSlug
  if (mod.module === 'mod_articles_category') {
    const slugs = (mod.params?.catid ?? []).map(byJoomlaId).filter(Boolean)
    const ids = slugs.map((slug) => ctx.terms?.get(slug)?.id).filter(Boolean)
    if (!ids.length) {
      ctx.log.push({ page: pagePath, module: id, note: 'mod_articles_category: no seeded category for its catid' })
      return ''
    }
    const orderSource = String(mod.params?.article_ordering ?? 'a.created').toLowerCase()
    let orderBy = /title/.test(orderSource) ? 'title' : /modified/.test(orderSource) ? 'modified' : /ordering/.test(orderSource) ? 'menu_order' : 'date'
    let order = String(mod.params?.article_ordering_direction ?? 'DESC').toLowerCase() === 'asc' ? 'asc' : 'desc'
    if (/ordering/.test(orderSource)) {
      const sourceCatIds = new Set([mod.params?.catid ?? []].flat().map(String))
      const sourceCategorySlugs = new Set((ctx.spec.content.categories ?? []).filter((category) => sourceCatIds.has(String(category.id))).map((category) => category.wpSlug))
      const postsInQuery = (ctx.spec.content.posts ?? []).filter((post) =>
        sourceCatIds.has(String(post.joomla?.catid ?? '')) || sourceCategorySlugs.has(post.category)
      )
      const menuOrderMatchesSource = postsInQuery.every((post) => {
        const sourceOrdering = Number(post.joomla?.ordering)
        const menuOrder = Number(post.joomla?.featuredOrdering ?? post.joomla?.ordering)
        return post.joomla?.ordering != null && Number.isFinite(sourceOrdering) && Number.isFinite(menuOrder) && menuOrder === sourceOrdering
      })
      if (!menuOrderMatchesSource) {
        orderBy = 'date'
        order = 'desc'
        ctx.log.push({ page: pagePath, module: id, note: 'mod_articles_category: source ordering cannot be expressed because menu_order differs from Joomla article ordering; the default order is used' })
      }
    }
    return [
      moduleHeadingMarkup(mod),
      titlesQuery(ctx, { termIds: ids, count: Number(mod.params?.count) || 5, orderBy, order, queryId })
    ].filter(Boolean).join('\n')
  }
  if (mod.module === 'mod_related_items') {
    if (mod.relatedUnavailable?.length) {
      ctx.log.push({ page: pagePath, module: id, note: `mod_related_items: required source fields are unavailable (${mod.relatedUnavailable.join(', ')}); nothing drawn` })
      return ''
    }
    const articleIds = mod.relatedByArticle?.[String(ctx.currentArticleId ?? '')] ?? []
    const related = articleIds.map((articleId) => ctx.spec.content.posts.find((post) => String(post.joomla?.articleId ?? '') === String(articleId))).filter(Boolean)
    if (!related.length) {
      ctx.log.push({ page: pagePath, module: id, note: 'mod_related_items: no related articles evidenced by shared Joomla metakey terms; nothing drawn' })
      return ''
    }
    const items = related.map((post) => `<!-- wp:list-item --><li><a href="${escapeAttr(post.path)}">${escapeHtml(post.title)}</a></li><!-- /wp:list-item -->`).join('\n')
    return [moduleHeadingMarkup(mod), `<!-- wp:list {"className":"tracy-aside__related"} -->\n<ul class="wp-block-list tracy-aside__related">\n${items}\n</ul>\n<!-- /wp:list -->`].filter(Boolean).join('\n')
  }
  if (mod.module === 'mod_articles_categories') {
    const parent = byJoomlaId(mod.params?.parent)
    if (!parent) {
      ctx.log.push({ page: pagePath, module: id, note: 'mod_articles_categories: no seeded category for its parent' })
      return ''
    }
    return [moduleHeadingMarkup(mod), subcategoryList(ctx, parent, 3)].filter(Boolean).join('\n')
  }
  // The Joomla modules a listing or a sidebar draws that WordPress has a core block for.
  if (mod.module === 'mod_articles_latest')
    return [moduleHeadingMarkup(mod), titlesQuery(ctx, { termIds: null, count: Number(mod.params?.count) || 5, queryId })].filter(Boolean).join('\n')
  if (mod.module === 'mod_tags_popular') return [moduleHeadingMarkup(mod), '<!-- wp:tag-cloud /-->'].filter(Boolean).join('\n')
  if (mod.module === 'mod_finder' || mod.module === 'mod_search')
    return [moduleHeadingMarkup(mod), '<!-- wp:search {"label":"Search","showLabel":false,"placeholder":"Search the site","buttonText":"Search"} /-->'].filter(Boolean).join('\n')
  // No block for it: named in the report as an unrendered module (`unsupported`), never dropped unseen.
  ctx.log.push({ page: pagePath, module: id, unsupported: mod.module, note: `module ${mod.module}${mod.params?.menutype ? ` (menu ${mod.params.menutype})` : ''} has no block rendering; skipped` })
  return ''
}

/** Body beside its sidebar: a two-column layout, the sidebar left or right as the source drew it. */
export function withAside(body, aside, side = 'left') {
  if (!aside) return body
  const col = (content, width, cls) =>
    `<!-- wp:column ${JSON.stringify({ width, className: cls })} -->\n<div class="wp-block-column ${cls}" style="flex-basis:${width}">\n${content}\n</div>\n<!-- /wp:column -->`
  const columns =
    side === 'left'
      ? [col(aside, '25%', 'tracy-page__sidebar'), col(body, '75%', 'tracy-page__main')]
      : [col(body, '75%', 'tracy-page__main'), col(aside, '25%', 'tracy-page__sidebar')]
  return `<!-- wp:columns {"className":"tracy-page__columns"} -->\n<div class="wp-block-columns tracy-page__columns">\n${columns.join('\n')}\n</div>\n<!-- /wp:columns -->`
}

/** The Joomla "categories" view: every category with its description, nested one level. */
export function buildCategoryIndex(ctx) {
  const tops = ctx.spec.content.categories.filter((c) => !c.parent)
  return tops
    .map((c) => {
      const term = ctx.terms.get(c.wpSlug)
      return [
        heading(`<a href="${ctx.categoryUrl(c.wpSlug)}">${escapeHtml(c.title)}</a>`, 2),
        term ? categoryDescription(term, ctx) : '',
        subcategoryList(ctx, c.wpSlug)
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')
}

// ---------------------------------------------------------------------------------------------
// Navigation

const ACCOUNT_URLS = {
  'page-login': '/wp-login.php',
  'page-register': '/wp-login.php?action=register',
  'page-password': '/wp-login.php?action=lostpassword',
  'page-account': '/wp-admin/profile.php'
}

/**
 * `{ type: 'post', id, url }` for a menu item whose url is a page-map `single` route that names its
 * article (`source.articleId`) when that article is a seeded post; null otherwise — never another post.
 */
export function articlePostLink(url, spec, postIds, postUrls) {
  const route = (spec.pagemap?.pages ?? []).find((p) => p.path === url && p.view === 'single')
  const articleId = route?.source?.articleId
  if (articleId == null || articleId === '') return null
  const post = (spec.content?.posts ?? []).find((p) => articleIdsOf(p).includes(String(articleId)))
  const id = post ? postIds.get(post.slug) : null
  const permalink = post ? postUrls.get(post.slug) : null
  return id && permalink ? { type: 'post', id, url: permalink } : null
}

/**
 * Block markup of a `wp_navigation` post from a menus.json tree. `resolve(url)` returns
 * `{ id, url }` for a seeded page or null. A seeded page wins, account views included, so the
 * item links the page by id and is the current item there; an account view with no seeded page
 * falls back to its wp-login.php target (Q9). A page that is not published (`status` on what `resolve`
 * returns) is no target WordPress renders — a post-type link to a draft is dropped without a word — so the
 * item stays as a custom link to the item's url, like any target the site does not have, and
 * `onUnpublished(item, status)` is told.
 */
export function buildNavigation(items, resolve, pagesByPath, onUnpublished = null) {
  const render = (item) => {
    if (item.published === false) return ''
    const kids = (item.children ?? []).map(render).filter(Boolean)
    const attrs = { label: item.label }
    let seeded = item.url ? resolve(item.url) : null
    if (seeded?.status && seeded.status !== 'publish') {
      onUnpublished?.(item, seeded.status)
      seeded = null
    }
    const page = item.url ? pagesByPath.get(item.url) : null
    if (seeded) Object.assign(attrs, { type: seeded.type ?? 'page', id: seeded.id, url: seeded.url, kind: 'post-type' })
    else if (page && ACCOUNT_URLS[page.view])
      Object.assign(attrs, { url: ACCOUNT_URLS[page.view], kind: 'custom' })
    else if (item.url) Object.assign(attrs, { url: item.url, kind: 'custom' })
    if (kids.length)
      return `<!-- wp:navigation-submenu ${JSON.stringify(attrs)} -->\n${kids.join('\n')}\n<!-- /wp:navigation-submenu -->`
    return `<!-- wp:navigation-link ${JSON.stringify(attrs)} /-->`
  }
  return items.map(render).filter(Boolean).join('\n')
}

/** Links of a footer column, from the block markup of a Joomla `mod_custom` (`<li><a href>label</a></li>`). */
export function footerLinks(blocks) {
  return [...String(blocks).matchAll(/<li>\s*<a href="([^"]+)">([^<]+)<\/a>\s*<\/li>/g)].map((m) => ({
    label: m[2].trim(),
    url: m[1],
    published: true,
    children: []
  }))
}

/** The menutype a part's navigation block names: `metadata.name` of `nav.<menutype>`, or null. */
export const navBlockMenutype = (attrs) => /^nav\.(.+)$/.exec(attrs?.metadata?.name ?? '')?.[1] ?? null

/**
 * The navigation post each menutype seeded for one locale — what a part's named blocks read.
 * `menus` are the spec's `menus.json` entries, `navs` the ids `wp_navigation` posts got by
 * menutype. A menu with no `locale` belongs to every locale (from-joomla writes none).
 */
/** The labels of the mega-menu blocks a part carries (`wp:<theme>/mega-menu {"label":"…"}`). */
export function megaLabels(partMarkup) {
  return [...String(partMarkup ?? '').matchAll(/<!-- wp:[\w-]+\/mega-menu (\{[^\n]*?\}) -->/g)]
    .map((m) => {
      try {
        return JSON.parse(m[1]).label
      } catch {
        return null
      }
    })
    .filter((l) => typeof l === 'string' && l.trim())
}

/**
 * Menus without the top-level items a theme part already draws as a mega menu (Q11: the mega is
 * the theme's block, in the Site Editor; the source's own dropdown of the same name would render
 * twice beside it). Matched by label in the default locale; a twin menu of another locale
 * (`<menutype>-<locale>`) drops the same positions, since its labels are translated.
 */
export function withoutMegaItems(menus, labels, defaultLocale = null) {
  if (!labels?.length) return menus
  const wanted = new Set(labels.map((l) => l.trim().toLowerCase()))
  const dropped = new Map()
  const out = menus.map((m) => {
    if (m.locale && defaultLocale && m.locale !== defaultLocale) return m
    const idx = (m.items ?? []).flatMap((it, i) => (wanted.has(String(it.label ?? '').trim().toLowerCase()) ? [i] : []))
    if (!idx.length) return m
    dropped.set(m.menutype, idx)
    return { ...m, items: m.items.filter((_, i) => !idx.includes(i)) }
  })
  return out.map((m) => {
    if (!m.locale || !defaultLocale || m.locale === defaultLocale) return m
    const base = m.menutype.replace(new RegExp(`-${m.locale}$`), '')
    const idx = dropped.get(base)
    if (!idx || (m.items ?? []).length <= Math.max(...idx)) return m
    return { ...m, items: m.items.filter((_, i) => !idx.includes(i)) }
  })
}

export function namedNavigationRefs(menus, navs, locale) {
  const out = {}
  for (const m of menus) {
    if (m.locale && locale && m.locale !== locale) continue
    if (navs[m.menutype] !== undefined) out[m.menutype] = navs[m.menutype]
  }
  return out
}

/**
 * Fill the `ref` of each `core/navigation` block of a template part. A block the part file
 * named `nav.<menutype>` (its `metadata.name`) takes the seeded post of that menutype from
 * `named`; an unnamed block takes the next entry of `refs`, in order — Tracy Base's parts carry
 * no names, and this is the shape they were seeded with before. A named block whose menutype
 * was not seeded keeps its markup (WordPress then shows its fallback menu — the newest
 * navigation post, which is rarely the right one) and is listed in `missing`, so the report
 * says which name the spec could not answer instead of the page silently showing another menu.
 * A navigation block that carries its links inline (`<!-- wp:navigation {…} --> … <!-- /wp:navigation -->`)
 * is the theme's own menu, not a slot for a seeded one: it is left exactly as written and takes no ref.
 */
export function fillNavigationRefs(partMarkup, refs, named = {}, missing = []) {
  let i = 0
  // The attributes end at the comment's own close: a lazy match across `-->` would run into the next
  // block's comment when this one is not self-closing.
  return partMarkup.replace(/<!--\s*wp:navigation\s+(\{(?:(?!-->)[^])*?\})\s*(\/)?-->/g, (m, json, selfClosing) => {
    if (!selfClosing) return m
    const attrs = JSON.parse(json)
    const menutype = navBlockMenutype(attrs)
    let ref
    if (menutype) {
      ref = named[menutype]
      if (ref === undefined) missing.push(menutype)
    } else ref = refs[i++]
    if (ref === undefined) return m
    return `<!-- wp:navigation ${JSON.stringify({ ref, ...attrs })} /-->`
  })
}

/**
 * The images of a template part → the attachments the media import made, in the same seed pass.
 * A `core/image` whose `metadata.name` is a source image key (`images/icons/a.svg`) is that
 * image's slot; a `core/image` without one is resolved from its own `<img src>` when that names a
 * source image. Either takes the attachment's URL and id (setImage, as a pattern's image field
 * does), so the Site Editor sees a media-library image, not a URL. Any other image or asset URL
 * of the part goes through rewriteMediaRefs, as page content does. `media(ref)` resolves as for
 * page content (resolveMedia: an ambiguous name resolves to nothing and says so) to `{ url, id }`
 * or null. Only the exact form setImage writes is resolved (IMAGE_FORM): a leaf `core/image` whose
 * markup is one <figure> holding its one <img>, optionally linked, optionally captioned, and
 * nothing else, which comes back from the HTML parser as written (writesAsRead — setImage writes
 * through the parser, so markup it would repair or respell is not taken). An image block that does
 * not resolve (no attachment, markup the parser would change, or any other form — no
 * `<img>`, a bare `<img>`, two of them, a second root element, a comment, inner blocks) stays as
 * written, its `<img src>` included — a URL rewrite there would show one image under the other's
 * id — and `notes` gets `{ image, note }` for it. A part the block parser does not read in full —
 * markup that does not parse, or any block delimiter left in its HTML (`<!-- wp:image/-->`,
 * `<!-- wp:image invalid /-->`) — is returned whole as written, with a note: an `<img>` after such
 * a delimiter could be a slot, and rewriting it as a plain URL would guess. A part with nothing to
 * resolve comes back byte for byte, so an override seeded before stays unchanged.
 */
export function resolvePartMedia(markup, media, { theme, notes = [] } = {}) {
  const text = String(markup ?? '')
  let blocks
  try {
    blocks = parseBlocks(text)
  } catch (e) {
    notes.push({ note: `part markup does not parse as blocks (${e.message}); the part left as written` })
    return text
  }
  let unread = 0
  walkBlocks(blocks, (b) => {
    for (const c of b.innerContent) if (typeof c === 'string') unread += c.match(UNREAD_DELIMITER)?.length ?? 0
  })
  if (unread) {
    notes.push({ note: `part has ${unread} block delimiter(s) the block parser does not read; the part left as written` })
    return text
  }
  const kept = new Set()
  const written = new Set()
  let changed = false
  walkBlocks(blocks, (b) => {
    if (b.name !== 'core/image') return
    kept.add(b)
    const slot = b.attrs?.metadata?.name
    const own = b.innerContent.filter((c) => typeof c === 'string').join('')
    const srcs = imgSrcs(own)
    const src = srcs[0] ?? null
    const ref = typeof slot === 'string' && imageKey(slot) ? slot : src !== null && MEDIA_REF.test(src) && imageKey(src) ? src : null
    if (!ref) return
    if (!srcs.length) {
      notes.push({ image: ref, note: 'image block has no <img>; left as written' })
      return
    }
    const unsupported = () => notes.push({ image: ref, note: 'image block is not one element holding one <img>; left as written' })
    if (b.innerBlocks.length || !IMAGE_FORM.test(own)) return unsupported()
    if (!writesAsRead(b)) {
      notes.push({ image: ref, note: 'image block markup is not written back as it stands (the HTML parser repairs or respells it); left as written' })
      return
    }
    const hit = media(ref)
    if (!hit) {
      notes.push({ image: ref, note: 'not in the media index; left as written' })
      return
    }
    // Written on a copy, so a block setImage cannot take stays whole.
    const copy = structuredClone(b)
    try {
      setImage(copy, { src: hit.url, id: hit.id })
    } catch {
      return unsupported()
    }
    Object.assign(b, copy)
    written.add(hit.url)
    kept.delete(b)
    changed = true
  })
  // The rest of the markup is rewritten fragment by fragment, skipping the image blocks left as
  // written, with whatever they hold. What a resolved block took is already an attachment URL,
  // not a ref to resolve again.
  const rewrite = (html) => rewriteMediaRefs(html, (ref) => (written.has(ref) ? null : media(ref)), { theme })
  const visit = (list) => {
    for (const b of list) {
      if (kept.has(b)) continue
      b.innerContent = b.innerContent.map((c) => {
        if (typeof c !== 'string') return c
        const next = rewrite(c)
        if (next !== c) changed = true
        return next
      })
      if (b.name === null) b.html = b.innerContent.join('')
      visit(b.innerBlocks ?? [])
    }
  }
  visit(blocks)
  return changed ? serializeBlocks(blocks) : text
}

// ---------------------------------------------------------------------------------------------
// Locales

/**
 * Where a secondary-locale page lives. Without a language plugin it is what the page-map says:
 * a child of the `/<locale>` page, slug as given (`/ru/about`). With Polylang (free, D11) a
 * translation is a top-level page in its own language, served at `/ru/<slug>/` by the plugin
 * — so a page whose parent is `/<locale>` loses it, and a slug the default locale already holds
 * at that level is replaced by the title's (`about` twice is a `-2` suffix in WordPress; Pro's
 * shared slugs are not on the table). `wpSlug` is the post_name the seeder asks for and looks up;
 * `legacyParent` names the page the old layout put it under, so a site seeded before can move.
 */
export function localizePages(pages, { i18n = 'none', defaultLocale = null } = {}) {
  const notes = []
  for (const page of pages) page.wpSlug = wpPostName(page.slug)
  // The front page (`/`, slug `home`) and a parent the seeder makes for `/home/home-style-1` are
  // both top-level pages called `home`: WordPress gave one of them `home-2` and 301'd it. The front
  // page answers at `/` whatever its slug, so it is the one that gives way.
  for (const front of pages.filter((p) => p.path === '/' && !p.parent)) {
    if (pages.some((p) => p !== front && !p.parent && p.path && p.path !== '/' && (p.locale ?? null) === (front.locale ?? null) && wpPostName(p.slug) === front.wpSlug)) {
      front.wpSlug = `${front.wpSlug}-front`
      notes.push({ page: front.path, slug: front.wpSlug, note: `the front page's slug is the one a top-level route needs; filed as "${front.wpSlug}" (it answers at / all the same)` })
    }
  }
  if (i18n !== 'polylang' || !defaultLocale) return notes
  const taken = new Map() // parent path → Set of slugs the default locale holds there
  for (const page of pages) {
    if (page.locale && page.locale !== defaultLocale) continue
    const key = page.parent ?? ''
    if (!taken.has(key)) taken.set(key, new Set())
    taken.get(key).add(page.wpSlug)
  }
  for (const page of pages) {
    if (!page.locale || page.locale === defaultLocale) continue
    if (page.parent === `/${page.locale}`) {
      page.legacyParent = page.parent
      page.parent = null
    }
    const key = page.parent ?? ''
    if (taken.get(key)?.has(page.wpSlug)) {
      const fromTitle = wpPostName(page.title)
      notes.push({
        page: page.path,
        slug: fromTitle,
        note: 'slug taken by the default-locale page; slug from the title'
      })
      page.wpSlug = fromTitle
    }
  }
  return notes
}

/**
 * The categories to seed with Polylang: each spec category in the default locale, plus a twin
 * per secondary locale (`news-ru`, parent `<parent>-ru`) — a term has one language, so a
 * locale's posts need a term of their own. The twin takes the spec's `titles[<locale>]` when
 * the adapter read one, else keeps the name; `translationOf` names the base slug for the
 * linking step.
 */
export function localizeCategories(categories, { i18n = 'none', locales = [], defaultLocale = null } = {}) {
  if (i18n !== 'polylang' || !defaultLocale) return categories.map((c) => ({ ...c }))
  const out = categories.map((c) => ({ ...c, locale: defaultLocale }))
  for (const loc of locales.filter((l) => l !== defaultLocale))
    for (const c of categories)
      out.push({
        ...c,
        title: c.titles?.[loc] ?? c.title,
        wpSlug: `${c.wpSlug}-${loc}`,
        parent: c.parent ? `${c.parent}-${loc}` : null,
        locale: loc,
        translationOf: c.wpSlug
      })
  return out
}

/** The category term a post goes in: its locale's twin under Polylang, the spec's otherwise. */
const postCategorySlug = (post, { i18n = 'none', defaultLocale = null } = {}) =>
  i18n === 'polylang' && post.locale && defaultLocale && post.locale !== defaultLocale
    ? `${post.category}-${post.locale}`
    : post.category

const titleKey = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
/** The slug a derived category takes: Latin from its name, else WordPress's percent-encoded form. */
const categorySlug = (name) => {
  const latin = slugify(name).replace(/[^a-z0-9-]/g, '')
  return latin || wpPostName(name)
}

/**
 * What the source says about each post beyond the spec's fields, by slug: `head` (the body
 * without the header the single template prints, its eyebrow and lead — `articleHead`), `card`
 * (the listing card of the same title — `sourceCards`), `date` (the spec's, else the byline's,
 * else the card's, else scheduled before the earliest dated post), `categoryName` (the eyebrow's
 * label, when it names one) and `categorySlug` (that category's term slug, localised the way
 * `postCategorySlug` is), `tags` (the source's tags row) and `sticky` (the spec's, or a card
 * whose eyebrow says Featured). A spec that already carries date and category keeps them.
 */
export function postSourceFacts(spec, { i18n = 'none', defaultLocale = null } = {}) {
  const listingPaths = new Set((spec.content?.archives ?? []).map((a) => a.path).filter(Boolean))
  const cards = sourceCards(spec.sections ?? {}, { listingPaths })
  const facts = new Map()
  const posts = spec.content.posts ?? []
  for (const post of posts) {
    const card = cards.get(titleKey(post.title)) ?? null
    const dateText = post.source?.dateText ?? card?.dateText ?? null
    // A body picture is the featured one only when both name the same source file (imageIdentity),
    // resolved against the post's image table and then the spec's — never by file name alone.
    const tables = [post.images ?? [], spec.content?.images ?? []]
    const head = articleHead({ content: post.content, title: post.title, featuredImage: post.featuredImage, dateText, dropLead: Boolean(post.synthetic), imageId: (ref) => imageIdentity(ref, tables) })
    const tail = articleTail({ content: head.content })
    head.content = tail.content
    head.removed.push(...tail.removed)
    const categoryName = categoryLabel(head.eyebrow ?? card?.eyebrow ?? null)
    const own = post.category ? spec.content.categories.find((c) => c.wpSlug === post.category) : null
    // The spec's category is the listing's default (the archive's own term) unless it already
    // names what the eyebrow names — in any locale (`titles.ru` on a spec the adapter read the
    // RU eyebrow into) — then nothing is derived.
    const ownNames = own ? [own.title, ...Object.values(own.titles ?? {})].map(titleKey) : []
    const derived = categoryName && own && !ownNames.includes(titleKey(categoryName)) ? categoryName : null
    const suffix = i18n === 'polylang' && post.locale && defaultLocale && post.locale !== defaultLocale ? `-${post.locale}` : ''
    facts.set(post.slug, {
      head,
      card,
      // The spec's tags (from-joomla reads them from the tag tables) when it declares them — [] is
      // "the source has none" — else the tags row the body ended with (articleTail).
      tags: Array.isArray(post.tags) ? post.tags.map((t) => t.trim()) : tail.tags,
      sticky: Boolean(post.sticky) || isFeatured(card?.eyebrow),
      menuOrder: Number.isFinite(Number(post.joomla?.featuredOrdering ?? post.joomla?.ordering)) && (post.joomla?.featuredOrdering != null || post.joomla?.ordering != null)
        ? Number(post.joomla.featuredOrdering ?? post.joomla.ordering)
        : null,
      date: post.date ?? parseDateText(post.source?.dateText) ?? parseDateText(card?.dateText) ?? null,
      categoryName: derived,
      categorySlug: derived ? `${categorySlug(derived)}${suffix}` : null
    })
  }
  const scheduled = scheduleDates(posts.map((p) => ({ date: facts.get(p.slug).date })))
  // Posts sharing one date get one second each in source order (lib/post-content.mjs
  // distinctDates): a date-sorted listing otherwise serves a different order on every request.
  // `sourceDate` is the date before that, for the report's "from the source" note.
  const { dates } = distinctDates(scheduled)
  posts.forEach((p, i) => {
    facts.get(p.slug).sourceDate = scheduled[i]
    facts.get(p.slug).date = dates[i]
  })
  return facts
}

/**
 * Categories the posts' eyebrows name that the spec does not list, as TOP-LEVEL terms beside
 * each post's spec category, one per locale under Polylang (`engineering-ru` beside `news-ru`),
 * in the shape `localizeCategories` returns. Top-level, not children of the listing term: the
 * listing's own term (`news`) is the posts page's default, not a parent the source draws — its
 * breadcrumb is Home / News / Engineering / <title>, where "News" is the posts page. Nested
 * under it, a categories block that lists top-level terms (the news sidebar, the filter chips)
 * printed "No categories" while the four terms carried every post, and the breadcrumb block
 * printed "News" twice — the posts page, then the parent term.
 */
export function derivedCategories(posts, facts, { i18n = 'none', defaultLocale = null } = {}) {
  const out = new Map()
  for (const post of posts) {
    const f = facts.get(post.slug)
    if (!f?.categorySlug || out.has(f.categorySlug)) continue
    out.set(f.categorySlug, {
      id: f.categorySlug,
      title: f.categoryName,
      wpSlug: f.categorySlug,
      joomlaAlias: null,
      parent: null,
      description: '',
      derived: true,
      ...(i18n === 'polylang' && defaultLocale ? { locale: post.locale ?? defaultLocale, translationOf: null } : {})
    })
  }
  return [...out.values()]
}

/**
 * The title a page is filed under: the label its menu gives it — the header menu of its locale
 * first, then any menu — when the label is short (≤ 40 chars) and the only one that url has.
 * The page-map's title is the page's h1 ("Building Russian industrial infrastructure since
 * 2004"), which the hero prints; as `post_title` it was the last breadcrumb step and the tab
 * title, both of which the source draws with the menu word ("About", "Email"). A 404 page keeps
 * its own title (its label is the code), and a url several card-shaped labels point at (the
 * mega menu's project cards) has no name in the menu — the spec title stays.
 */
export function pageTitle(page, menus = []) {
  // The posts page too: its heading is printed by the theme's `home.title` filler, which reads
  // `tracy_page_heading` before the title — so the breadcrumb and the tab say "News" while the
  // page still says "News & engineering notes" (typography lens, fast-8: the crumb was the h1).
  if (!page?.path || page.view === '404') return page?.title ?? ''
  const labelsIn = (list) => {
    const out = []
    const walk = (items) => {
      for (const it of items ?? []) {
        if (it.url === page.path && it.label) out.push(String(it.label).trim())
        walk(it.children)
      }
    }
    walk(list)
    return out
  }
  const mine = (menus ?? []).filter((m) => !page.locale || !m.locale || m.locale === page.locale)
  const rank = (m) => (m.region === 'header' ? 0 : m.region === 'footer' ? 1 : 2)
  const ordered = [...mine].sort((a, b) => rank(a) - rank(b))
  for (const m of ordered) {
    const labels = [...new Set(labelsIn(m.items).map((l) => l.toLowerCase()))]
    if (labels.length !== 1) continue
    const label = labelsIn(m.items)[0]
    if (label.length <= 40 && label.split(/\s+/).length <= 4) return label
  }
  return page.title
}

// A byline's name slug (`byline`) or the editorial flag (`editorial`) on a user postAuthors makes:
// what ownerOf reads, kept off the user's enumerable fields so the user stays
// `{ login, display, description, email }` and a copy of it never carries the seeder's identity.
const seederOwn = (u, key, value) => Object.defineProperty(u, key, { value, enumerable: false })

/**
 * The authors the posts' bylines name, as WordPress users, and which post gets which:
 * `{ users: [{ login, display, description, email }], byPost: Map(slug → login) }` (a byline or
 * editorial user also carries its identity for ownerOf, not enumerable — `seederOwn`). A byline
 * with a name is a user of its own — known by the name's Latin slug, which is its login unless
 * `editorial`, a declared login or another byline's has it (then `<slug>-byline`, `-2`, …, in
 * slug order); display name the name, description the role. A post whose byline names no one (a listing-card stub, a "Communications
 * · 4 min read" line) is the site's editorial user, `editorial`, "<site name> Editorial", whose
 * description is the one role those posts share when they share one. A secondary-locale post
 * takes the author of its default-locale pair (the post at the same position among its locale's
 * posts of the same category — the pairing `postTranslationGroups` makes) so a Cyrillic byline
 * does not become a second user for the same person; with no pair it keeps its own byline.
 * Every post had `post_author` 0 before this — no byline on the site at all. The email is on
 * `example.invalid`, the domain reserved for exactly that: WordPress requires one, and nothing
 * the source printed is one. A post whose `author.id` is a declared author (content.authors) is
 * that user whatever its locale; one with an alias, or with an `author.id` the spec does not
 * declare, is its own byline — the pair decides only for a post with neither, in any order of
 * `posts`. A secondary-locale post's role is its user's biography in that locale (`bios`), whichever
 * road gave it the user.
 */
export function postAuthors(posts, facts, { siteName = null, defaultLocale = null, authors = null, notes = [] } = {}) {
  const users = new Map()
  const byPost = new Map()
  const editorialRoles = new Set()
  const ascii = (name) => slugify(name).replace(/[^a-z0-9-]/g, '')
  const declared = declaredAuthors(authors, notes)
  const declaredLogins = new Set([...declared.values()].map((d) => d.login))
  const base = posts.filter((p) => !defaultLocale || (p.locale ?? null) === defaultLocale)
  const pairOf = (post) => {
    if (!defaultLocale || (post.locale ?? null) === defaultLocale) return null
    const ref = post.translationOf ? base.find((p) => p.slug === post.translationOf || p.path === post.translationOf) : null
    if (ref) return ref
    const mine = posts.filter((p) => p.locale === post.locale && p.category === post.category)
    const theirs = base.filter((p) => p.category === post.category)
    return theirs[mine.indexOf(post)] ?? null
  }
  // A secondary-locale post's own byline gives its user the role in that locale — Polylang
  // prints `description_<lang>` as the biography on that language's pages, and left empty the
  // author line there opened with a dangling separator ("· 28 Jul 2026").
  const bios = []
  const secondary = (post) => Boolean(defaultLocale && post.locale && post.locale !== defaultLocale)
  // Each post decides once where its author comes from. The author the spec declares by source
  // identity comes before any byline and before the translation pair: the user is that person
  // whatever the body prints, and a translation written by someone else is theirs. A Joomla alias
  // (`created_by_alias`) is what the source prints INSTEAD of the user — that post's own byline,
  // translation or not — and an identity the spec does not declare is still the post's own (noted;
  // the byline decides). Only a post with neither an identity nor an alias takes its pair's author.
  const road = (post) => {
    const sourceId = post.author?.id != null && String(post.author.id) !== '' ? String(post.author.id) : null
    const alias = String(post.author?.alias ?? '').trim()
    if (alias) return { kind: 'byline', alias }
    const d = sourceId ? declared.get(sourceId) : null
    if (d) return { kind: 'declared', d }
    const pair = sourceId ? null : pairOf(post)
    if (pair) return { kind: 'pair', pair }
    return { kind: 'byline', sourceId }
  }
  // Default-locale posts go first: a byline user's description is the role its default-locale post
  // prints, and a pair-taking translation reads its pair's author, whatever the order of `posts`.
  // A secondary-locale post's role is its user's biography in that locale (`bios`), never the
  // description and never an editorial role.
  const order = posts.map((post, index) => ({ post, index })).sort((a, b) => Number(secondary(a.post)) - Number(secondary(b.post)))
  // First where each post's author comes from; the byline users are known by their name's Latin
  // slug (`byline`, their identity `tracy:byline:<slug>`) before any of them has a login.
  const picks = []
  const bylines = new Map()
  for (const { post, index } of order) {
    const r = road(post)
    const role = facts.get(post.slug)?.head?.author?.role ?? null
    let pick
    if (r.kind === 'declared') pick = { declared: r.d }
    else if (r.kind === 'pair') pick = { pair: r.pair.slug }
    else {
      if (r.sourceId)
        notes.push({ post: post.slug, note: `author ${r.sourceId} is not in content.authors (or has no name there); the byline decides` })
      const author = r.alias ? { name: r.alias, role } : (facts.get(post.slug)?.head?.author ?? null)
      const key = author?.name ? ascii(author.name) : ''
      if (key) {
        if (!bylines.has(key)) bylines.set(key, { display: author.name, description: author.role ?? '' })
        pick = { byline: key }
      } else {
        pick = { editorial: true }
        if (author?.role && !secondary(post)) editorialRoles.add(author.role)
      }
    }
    picks.push({ post, index, role, pick })
  }
  // Then the logins, all at once and in no order of `posts`: `editorial` and the declared logins
  // are taken; a byline whose slug is free keeps it (a name is not an identity, so one that gives
  // a taken login is another user), the others get `<slug>-byline`, then `-2`, `-3`, … in slug
  // order, never a login another byline starts from.
  const taken = new Set(['editorial', ...declaredLogins, ...[...bylines.keys()].filter((k) => k !== 'editorial' && !declaredLogins.has(k))])
  const bylineLogin = new Map()
  for (const key of [...bylines.keys()].sort()) {
    if (key !== 'editorial' && !declaredLogins.has(key)) {
      bylineLogin.set(key, key)
      continue
    }
    const stem = `${key}-byline`
    let login = stem
    for (let n = 2; taken.has(login); n++) login = `${stem}-${n}`
    taken.add(login)
    bylineLogin.set(key, login)
  }
  for (const { post, index, role, pick } of picks) {
    let login
    if (pick.declared) {
      login = pick.declared.login
      if (!users.has(login)) users.set(login, { ...pick.declared.user })
    } else if (pick.pair) login = byPost.get(pick.pair) ?? 'editorial'
    else if (pick.byline) {
      login = bylineLogin.get(pick.byline)
      if (!users.has(login)) users.set(login, seederOwn({ login, display: bylines.get(pick.byline).display, description: bylines.get(pick.byline).description, email: `${login}@example.invalid` }, 'byline', pick.byline))
    } else login = 'editorial'
    byPost.set(post.slug, login)
    if (role && secondary(post)) bios.push({ index, login, locale: post.locale, role })
  }
  bios.sort((a, b) => a.index - b.index)
  if ([...byPost.values()].includes('editorial'))
    users.set('editorial', seederOwn({
      login: 'editorial',
      display: siteName ? `${siteName} Editorial` : 'Editorial',
      description: editorialRoles.size === 1 ? [...editorialRoles][0] : '',
      email: 'editorial@example.invalid'
    }, 'editorial', true))
  for (const { login, locale, role } of bios) {
    const u = users.get(login)
    if (!u) continue
    u.bios ??= {}
    u.bios[locale] ??= role
  }
  return { users: [...users.values()], byPost }
}

/**
 * A post's content with the modules of the menu route that opens it (`post.route`, from-joomla
 * `--article-posts`): the route rendered as its page would be — sections, slots, sidebar — with
 * the post's own `body` where the route's composition names it. A post without a route is its
 * body. A route that is not `{ path, contentKind: sections | blocks, content }`, or whose
 * composition loses the body, stops the seed: the article would be gone from its own post.
 */
export function postWithRoute(post, body, ctx) {
  const route = post.route
  if (route === undefined || route === null) return body
  const where = `post ${post.slug}: route`
  if (typeof route !== 'object' || typeof route.path !== 'string' || !route.path.startsWith('/')) throw new Error(`${where} must be { path: "/…", contentKind, content }`)
  if (route.contentKind === 'sections' ? !Array.isArray(route.content) : route.contentKind !== 'blocks' || typeof route.content !== 'string')
    throw new Error(`${where} ${route.path}: contentKind "sections" takes a list of entries, "blocks" a string of markup`)
  const ids = (field) => {
    const v = route[field]
    if (v === undefined || v === null) return []
    if (!Array.isArray(v) || !v.every((id) => (typeof id === 'string' && id !== '') || Number.isInteger(id)))
      throw new Error(`${where} ${route.path}: ${field} must be a list of module ids`)
    return v.map(String)
  }
  const aside = ids('aside')
  const modules = ids('modules')
  if (route.contentKind === 'sections') route.content.forEach((entry, i) => checkRouteEntry(entry, `${where} ${route.path}: content[${i}]`))
  // What the composition draws, by module id: the list modules at its slots and in its sidebar
  // (below), and every section an ACM, custom or fallback path pushed for this page.
  const drawn = new Set()
  const page = { path: route.path, file: route.file, view: 'page', locale: post.locale ?? null, currentArticleId: post.joomla?.articleId, contentKind: route.contentKind, content: route.content, images: post.images ?? [], routeImages: route.images ?? [], routeModules: new Set(modules), drawn }
  const side = aside.length && (ctx.spec.sections.other ?? []).find((m) => String(m.id) === aside[0])?.position === 'sidebar-r' ? 'right' : 'left'
  const mark = ctx.sections.length
  const main = buildPageContent(page, ctx)
  for (const x of ctx.sections.slice(mark)) if (x.page === route.path && x.module != null) drawn.add(String(x.module))
  const around = typeset(withAside(main, renderAside(aside, ctx, route.path, drawn), side))
  const at = around.split(POST_BODY_MARKER)
  if (at.length !== 2) throw new Error(`${where} ${route.path}: the composition names the post's body ${at.length - 1} times; it must name it once`)
  // A module the source showed at the route and the seeder has no block for is said, by name.
  for (const id of modules.filter((m) => !drawn.has(m))) {
    const mod = [...(ctx.spec.sections.other ?? []), ...(ctx.spec.sections.custom ?? []), ...(ctx.spec.sections.acm ?? [])].find((m) => String(m.id) === id)
    ctx.log.push({
      page: route.path,
      post: post.slug,
      module: id,
      note: `route module ${id}${mod ? ` (${mod.module ?? mod.type ?? 'module'} at ${mod.position ?? 'no position'})` : ' (not in the spec\'s sections)'} is not drawn in the post: no block rendering for it`
    })
  }
  return [at[0].trim(), body.trim(), at[1].trim()].filter(Boolean).join('\n')
}

const ROUTE_ENTRY_FIELDS = { body: null, slot: 'position', section: 'html', html: 'blocks', blocks: 'markup' }

/** One entry of a route's `sections` composition: a known kind with the string it renders from; anything else throws. */
function checkRouteEntry(entry, where) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !Object.hasOwn(ROUTE_ENTRY_FIELDS, entry.kind))
    throw new Error(`${where}: kind must be one of ${Object.keys(ROUTE_ENTRY_FIELDS).join(', ')} (got ${JSON.stringify(entry?.kind ?? entry ?? null)})`)
  const field = ROUTE_ENTRY_FIELDS[entry.kind]
  if (field && typeof entry[field] !== 'string') throw new Error(`${where}: a "${entry.kind}" entry needs ${field} as a string`)
  if (entry.kind === 'slot' && entry.modules !== undefined && !(Array.isArray(entry.modules) && entry.modules.every((id) => (typeof id === 'string' && id !== '') || Number.isInteger(id))))
    throw new Error(`${where}: a "slot" entry's modules must be a list of module ids`)
}

/** User meta keys WordPress or the seeder owns: an author's `meta` never writes them. */
const RESERVED_USER_META = /^(tracy_|description(_|$)|nickname$|first_name$|last_name$|wp_|session_tokens$|.*capabilities$|.*user_level$|rich_editing$|syntax_highlighting$|comment_shortcuts$|admin_color$|use_ssl$|show_admin_bar_front$|locale$|dismissed_wp_pointers$)/

/**
 * `content.authors[].meta` — the profile values beyond name, bio and avatar (Joomla's job title and
 * social links), written as user meta: `{ key: text }`. Each key a plain lower-case name that is not
 * one WordPress or the seeder owns (RESERVED_USER_META), each value text — a string, a number or a
 * boolean. Anything else stops the seed with the author and key named.
 */
export function authorMeta(meta, authorId) {
  if (meta === undefined || meta === null) return {}
  if (typeof meta !== 'object' || Array.isArray(meta)) throw new Error(`content.authors ${authorId}: meta must be an object of { key: text }; got ${JSON.stringify(meta)}`)
  const out = {}
  for (const [key, value] of Object.entries(meta)) {
    if (!META_KEY.test(key)) throw new Error(`content.authors ${authorId}: meta key ${JSON.stringify(key)} is not a plain lower-case name`)
    if (RESERVED_USER_META.test(key)) throw new Error(`content.authors ${authorId}: meta key ${JSON.stringify(key)} is one WordPress or the seeder owns`)
    if (!['string', 'number', 'boolean'].includes(typeof value)) throw new Error(`content.authors ${authorId}: meta ${key} must be text, a number or a boolean; got ${JSON.stringify(value)}`)
    out[key] = String(value)
  }
  return out
}

/**
 * `content.authors`: the people the source names as authors, by a source identity that does not
 * change when the name does — `[{ id, name, login?, description?, avatar?, avatarAlt? }]`
 * (from-joomla: `joomla-user-<#__users.id>`, the name, the username, the profile avatar). Returns
 * `Map(id → { login, user })`. The login is the username's (else the name's) Latin slug; two
 * people it would give one login each get their id after it, so neither takes the other's posts
 * whatever order they come in; `editorial` is the seeder's own. An entry without an id or a name,
 * or with an id in the seeder's `tracy:` namespace (ownerOf), is left out with a note (nothing is
 * made up for it); a list that is not one, or an id twice, throws.
 */
export function declaredAuthors(authors, notes = []) {
  const out = new Map()
  if (authors === undefined || authors === null) return out
  if (!Array.isArray(authors)) throw new Error('content.authors must be a list of { id, name, … }')
  const ascii = (v) => slugify(String(v ?? '')).replace(/[^a-z0-9-]/g, '')
  const usable = []
  for (const a of authors) {
    const id = a?.id != null ? String(a.id).trim() : ''
    const name = String(a?.name ?? '').trim()
    if (!id || !name) {
      notes.push({ author: id || null, note: `content.authors entry without ${id ? 'a name' : 'an id'}; not seeded` })
      continue
    }
    if (id.startsWith('tracy:')) {
      notes.push({ author: id, note: 'content.authors id in the seeder\'s own `tracy:` namespace (its byline and editorial users); not seeded' })
      continue
    }
    if (usable.some((u) => u.id === id)) throw new Error(`content.authors: id ${id} is listed twice`)
    usable.push({ id, name, base: ascii(a.login) || ascii(name) || 'author', a, meta: authorMeta(a.meta, id) })
  }
  const count = new Map()
  for (const u of usable) count.set(u.base, (count.get(u.base) ?? 0) + 1)
  // A login no one else can take: the bases one person holds first, then `<base>-<id>` for the
  // shared ones in id order, with `-2`, `-3`, … while that is already someone's (a third author's
  // own username can be `sam-joomla-user-50`).
  const shared = (u) => count.get(u.base) > 1 || u.base === 'editorial'
  const taken = new Set(['editorial', ...usable.filter((u) => !shared(u)).map((u) => u.base)])
  const loginOf = new Map()
  for (const u of usable.filter(shared).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const stem = `${u.base}-${ascii(u.id) || 'author'}`
    let login = stem
    for (let n = 2; taken.has(login); n++) login = `${stem}-${n}`
    taken.add(login)
    loginOf.set(u.id, login)
  }
  for (const u of usable) {
    const login = loginOf.get(u.id) ?? u.base
    const str = (v) => (v === undefined || v === null ? '' : String(v))
    out.set(u.id, {
      login,
      user: {
        login,
        display: u.name,
        description: str(u.a.description),
        email: `${login}@example.invalid`,
        sourceId: u.id,
        ...(Object.keys(u.meta).length ? { meta: u.meta } : {}),
        ...(str(u.a.avatar).trim() ? { avatar: str(u.a.avatar).trim(), avatarAlt: str(u.a.avatarAlt) || u.name } : {})
      }
    })
  }
  return out
}

/**
 * The seeder's own identity for a user `postAuthors` names: a declared author's source id, else
 * `tracy:editorial` / `tracy:byline:<slug>` (the byline's name slug, not its login; a namespace no declared id may use — declaredAuthors
 * leaves such an id out). Stored as `tracy_source_author` on every user the seeder creates; it is
 * the only thing that makes a user the seeder's.
 */
export const ownerOf = (u) => u.sourceId ?? (u.editorial ? 'tracy:editorial' : `tracy:byline:${u.byline ?? u.login}`)

/**
 * What WordPress will store for each biography: `wp user update --description` runs it through the
 * `pre_user_description` filters (kses — block tags and scripts go, `&` and `<` are encoded), so the text
 * the site holds differs from the text the spec has and a raw comparison finds a change on every run. The
 * site is asked, read-only, with its own filter; the answer is a list of the same length or null (the reason in `why`).
 */
function storedBiographies(wp, texts) {
  if (!texts.length) return { stored: [] }
  const b64 = Buffer.from(JSON.stringify(texts)).toString('base64')
  try {
    const res = wp.run(['eval', `$in=json_decode(base64_decode('${b64}'),true);$o=array();foreach($in as $v){$o[]=wp_unslash(apply_filters('pre_user_description',wp_slash($v)));}echo json_encode($o);`], { mutate: false, allowFail: true })
    if (res.code !== 0) throw new Error((res.stderr || res.stdout || `exit ${res.code}`).trim().split('\n')[0])
    const stored = JSON.parse(res.stdout.trim())
    if (!Array.isArray(stored) || stored.length !== texts.length || stored.some((v) => typeof v !== 'string')) throw new Error('not one text per biography')
    return { stored }
  } catch (e) {
    return { stored: null, why: e.message }
  }
}

/**
 * The users `postAuthors` names, created or brought up to date; `Map(login → id)`. A user is the
 * seeder's only when it holds that user's `tracy_source_author`; every other user of the site — an
 * `admin` made at install, an editor, a user of an earlier seed without the meta — is never
 * updated, marked or given a post, whatever its login or name.
 */
function seedAuthors(wp, users, report, count, { media = null } = {}) {
  const ids = new Map()
  if (!users.length) return ids
  const FIELDS = '--fields=ID,user_login,display_name,description'
  // Every ownership answer is read strictly: a failed or malformed query stops the seed — it is
  // never taken for "no such user" (that would make the seeder create or adopt on a guess).
  const rows = (args, what) => {
    const r = wp.json(args, { mutate: false })
    if (!Array.isArray(r)) throw new Error(`authors: ${what} did not answer a list (${JSON.stringify(r)?.slice(0, 200)})`)
    return r
  }
  const existing = wp.dryRun ? [] : rows(['user', 'list', FIELDS, '--format=json'], 'wp user list')
  const userMeta = (id, key) => String(wp.out(['user', 'meta', 'get', String(id), key], { mutate: false, allowFail: true }) ?? '').trim()
  const setUserMeta = (id, key, value) => {
    if (wp.dryRun || !id || userMeta(id, key) === String(value)) return false
    wp.run(['user', 'meta', 'update', String(id), key, String(value)])
    return true
  }
  // Who holds a login the seeder passes over — for the note only; the choice never depends on it.
  const holderOf = (user) => {
    const meta = rows(['user', 'meta', 'list', String(user.ID), `--keys=${AUTHOR_ID_META}`, '--format=json'], `wp user meta list ${user.ID}`)
    const v = String(meta[0]?.meta_value ?? '').trim()
    return v ? `author ${v}` : `user #${user.ID}, not the seeder's`
  }
  const avatars = []
  const mapping = []
  const runLogins = new Set(users.map((u) => u.login))
  // The biography as the site will hold it, to compare with what it holds; not read, it is the raw text
  // (a write the site may filter back, never a skipped one).
  const bios = wp.dryRun ? { stored: null, why: 'dry run' } : storedBiographies(wp, users.map((u) => u.description))
  if (!wp.dryRun && !bios.stored) report.notes.push({ note: `author biographies: what the site would store was not read (${bios.why}); compared as written, so a biography the site filters is updated again` })
  const storedOf = new Map(users.map((u, i) => [u, bios.stored ? bios.stored[i] : u.description]))
  for (const u of users) {
    // `byPost` names the user by the login postAuthors gave it; the site may give it another.
    const key = u.login
    const owner = ownerOf(u)
    let login = u.login
    // Found by the identity stored on the user, so a renamed author is the same user and two
    // people of one name stay two. Nothing else is: a user of the login without this identity
    // (another author's, one the seeder never made) is left as it is and this user gets a login
    // of its own — `<login>-<id>` (`<login>-tracy` for a byline or the editorial user), then
    // `-2`, `-3`, …, never a login another user of this run starts from.
    let have = wp.dryRun ? null : (rows(['user', 'list', `--meta_key=${AUTHOR_ID_META}`, `--meta_value=${owner}`, FIELDS, '--format=json'], `wp user list --meta_key=${AUTHOR_ID_META}`).sort((a, b) => Number(a.ID) - Number(b.ID))[0] ?? null)
    if (!have) {
      const stem = `${u.login}-${u.sourceId ? slugify(u.sourceId).replace(/[^a-z0-9-]/g, '') || 'author' : 'tracy'}`
      const passed = []
      for (let n = 1; ; n++) {
        const candidate = n === 1 ? u.login : n === 2 ? stem : `${stem}-${n - 1}`
        if (n > 1 && runLogins.has(candidate)) continue
        const holder = existing.find((e) => e.user_login === candidate)
        if (holder) {
          passed.push(`${candidate} (${holderOf(holder)})`)
          continue
        }
        login = candidate
        break
      }
      if (passed.length) report.notes.push({ author: owner, note: `login ${passed.join(', ')} belongs to another user; this author is ${login}` })
    }
    let id
    if (!have) {
      // A create that fails (the login or the email taken meanwhile) stops the seed: the user
      // that appeared is not the seeder's to take.
      const made = wp.dryRun ? '0' : wp.out(['user', 'create', login, `${login}@example.invalid`, `--display_name=${u.display}`, `--description=${u.description}`, '--role=author', '--porcelain'])
      id = Number(made)
      if (!wp.dryRun && !(Number.isInteger(id) && id > 0)) throw new Error(`authors: wp user create ${login} answered ${JSON.stringify(made)}, not a user id`)
      if (!wp.dryRun) existing.push({ ID: id, user_login: login, display_name: u.display, description: u.description })
      count('authors', 'created')
    } else if (have.display_name !== u.display || (have.description ?? '') !== storedOf.get(u)) {
      id = Number(have.ID)
      login = have.user_login
      wp.run(['user', 'update', String(id), `--display_name=${u.display}`, `--description=${u.description}`])
      count('authors', 'updated')
    } else {
      id = Number(have.ID)
      login = have.user_login
      count('authors', 'skipped')
    }
    ids.set(key, id)
    mapping.push({ identity: owner, login, user: id })
    // Only a user this run created lacks the identity: it is written once, right after.
    if (!have && !wp.dryRun) wp.run(['user', 'meta', 'update', String(id), AUTHOR_ID_META, owner])
    // The source's picture of the author, imported with the rest of the media (collectImages):
    // the attachment id on the user, drawn by the avatar plugin (installAvatarPlugin).
    if (u.avatar) {
      const hit = media ? media(u.avatar, [], { author: u.sourceId ?? login }) : null
      if (!hit?.id) report.notes.push({ author: u.sourceId ?? login, image: u.avatar, note: 'author avatar not imported; the user keeps the default avatar' })
      else {
        if (setUserMeta(id, AUTHOR_AVATAR_META, hit.id)) count('authors', 'updated')
        avatars.push({ login, user: id, attachment: hit.id, url: hit.url })
      }
    }
    // The profile values the spec declares beyond name, bio and avatar (authorMeta), as user meta.
    for (const [mkey, mvalue] of Object.entries(u.meta ?? {})) {
      if (setUserMeta(id, mkey, mvalue)) count('authors', 'updated')
    }
    // The role in each other locale, as Polylang stores a per-language biography.
    for (const [locale, role] of Object.entries(u.bios ?? {})) {
      if (setUserMeta(id, `description_${locale}`, role)) count('authors', 'updated')
    }
  }
  const declared = users.filter((u) => u.sourceId)
  report.notes.push({ authors: users.map((u) => u.login), note: `post authors: ${users.map((u) => `${u.login} "${u.display}"${u.sourceId ? ` [source ${u.sourceId}]` : ' [byline]'}${u.description ? ` (${u.description})` : ''}${u.bios ? ` [${Object.entries(u.bios).map(([l, r]) => `${l}: ${r}`).join('; ')}]` : ''}`).join(', ')}` })
  const plugin = avatars.length ? installAvatarPlugin(wp, report) : null
  report.authors = { declared: declared.length, users: mapping, ...(plugin ? { plugin } : {}), ...(declared.length || avatars.length ? { avatars: checkAuthorAvatars(wp, avatars, report) } : {}) }
  return ids
}

/** The must-use plugin that draws `tracy_avatar` (scripts/php/author-avatars.php), and where it goes. */

const PHP_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'php')
/** The must-use plugin that draws a declared author's imported avatar (installAvatarPlugin). */
export const AVATAR_PLUGIN = { file: 'tracy-author-avatars.php', source: join(PHP_DIR, 'author-avatars.php') }
/** The must-use plugin that moves a category blog's "More Articles" list with its cards (moreArticlesQuery). */
export const MORE_ARTICLES_PLUGIN = { file: 'tracy-more-articles.php', source: join(PHP_DIR, 'more-articles.php') }
/** The must-use plugin that draws the pager of a Joomla listing (JOOMLA_PAGER_CLASS) as Joomla does. */
const JOOMLA_PAGER_PLUGIN = { file: 'tracy-joomla-pagination.php', source: join(PHP_DIR, 'joomla-pagination.php') }
/** The must-use plugin that serves the redirect rules (`<theme>_redirects`) on a 404 — a theme without the hook left them unserved. */
const REDIRECTS_PLUGIN = { file: 'tracy-redirects.php', source: join(PHP_DIR, 'redirects.php') }
/** The option naming the option that holds the rules, read by REDIRECTS_PLUGIN. */
const REDIRECTS_OPTION_NAME = 'tracy_redirects_option'
/** The option holding the words of the Joomla pager's four controls, read by JOOMLA_PAGER_PLUGIN. */
const PAGER_TEXT_OPTION = 'tracy_joomla_pager_text'
/**
 * The words the archives' `paging.labels` (`{ start, previous, next, end }`, text) declare for the pager
 * controls, or null when none does. One set serves every pager: archives that declare different words are
 * noted and the first set wins; a label that is not text stops the seed with the archive named.
 */
export function pagerLabels(archives, notes = []) {
  let chosen = null
  for (const a of archives) {
    const l = a.paging?.labels
    if (l === undefined || l === null) continue
    if (typeof l !== 'object' || Array.isArray(l)) throw new Error(`archive ${a.path}: paging.labels must be { start, previous, next, end }; got ${JSON.stringify(l)}`)
    const set = {}
    for (const k of ['start', 'previous', 'next', 'end'])
      if (l[k] !== undefined) {
        if (typeof l[k] !== 'string' || !l[k].trim()) throw new Error(`archive ${a.path}: paging.labels.${k} must be text; got ${JSON.stringify(l[k])}`)
        set[k] = l[k].trim()
      }
    if (!Object.keys(set).length) continue
    if (chosen && JSON.stringify(chosen.set) !== JSON.stringify(set)) notes.push({ page: a.path, note: `paging.labels differ from ${chosen.path}'s; the pager plugin has one set, ${chosen.path}'s is used` })
    else if (!chosen) chosen = { path: a.path, set }
  }
  return chosen?.set ?? null
}
/** The must-use plugin that puts post_tag on pages (`pages[].tags`). */
const PAGE_TAGS_PLUGIN = { file: 'tracy-page-tags.php', source: join(PHP_DIR, 'page-tags.php') }
/** The must-use plugin that registers the post meta keys the spec declares (checkPostMeta). */
export const POST_META_PLUGIN = { file: 'tracy-post-meta.php', source: join(PHP_DIR, 'post-meta.php') }
/** The option listing those keys, read by POST_META_PLUGIN on every request. */
export const POST_META_OPTION = 'tracy_post_meta'

/**
 * Put one of the seeder's plugins in the site's `wp-content/mu-plugins/` (WPMU_PLUGIN_DIR) through
 * WP-CLI: written when missing or different, left alone when the same, so a second seed writes
 * nothing. A must-use plugin loads on every request whatever the theme, and ships with the webroot
 * in a quickstart. Returns `{ file, action: written | same | failed | dry-run }`; a failure is
 * noted under `label`, and the caller decides whether the seed may go on without it.
 */
function installMuPlugin(wp, report, plugin, label) {
  const code = readFileSync(plugin.source, 'utf8')
  if (wp.dryRun) return { file: plugin.file, action: 'dry-run' }
  const b64 = Buffer.from(code).toString('base64')
  let action
  try {
    action = wp.phpEval(
      // Written beside the target and renamed over it: a short write never leaves a broken PHP
      // file that every request would load. Only a regular file is replaced — never a link, a
      // directory or a pipe.
      `$f=WPMU_PLUGIN_DIR.'/${plugin.file}';$c=base64_decode('${b64}');if(is_file($f)&&!is_link($f)&&file_get_contents($f)===$c){echo 'same';}else{$t=$f.'.tmp';wp_mkdir_p(WPMU_PLUGIN_DIR);if(!is_link($f)&&(!file_exists($f)||is_file($f))&&!is_link($t)&&!(file_exists($t)&&!is_file($t))&&@file_put_contents($t,$c)===strlen($c)&&@rename($t,$f)){echo 'written';}else{if(is_file($t)&&!is_link($t))@unlink($t);echo 'failed';}}`,
      { mutate: true }
    )
  } catch (e) {
    action = 'failed'
    report.notes.push({ note: `${label}: the must-use plugin ${plugin.file} could not be written (${String(e.message).split('\n')[0]})` })
  }
  if (!['written', 'same'].includes(action)) {
    if (action !== 'failed' || !report.notes.some((n) => String(n.note).includes(plugin.file)))
      report.notes.push({ note: `${label}: the must-use plugin ${plugin.file} was not written (${action || 'no answer'})` })
    action = 'failed'
  }
  return { file: `wp-content/mu-plugins/${plugin.file}`, action }
}

/** The avatar plugin (installMuPlugin); a failure is noted and the render check that follows says the pictures are not drawn. */
export function installAvatarPlugin(wp, report) {
  return installMuPlugin(wp, report, AVATAR_PLUGIN, 'author avatars')
}

/** The user meta holding a declared author's source identity (`content.authors[].id`). */
const AUTHOR_ID_META = 'tracy_source_author'
/** The user meta holding the attachment id of a declared author's avatar. */
const AUTHOR_AVATAR_META = 'tracy_avatar'

/**
 * Whether WordPress draws each imported avatar: `get_avatar_url()` — what core/avatar,
 * core/post-author and get_avatar() print — asked for every such user in one call. Core only
 * knows Gravatar; the picture reaches the page through the `pre_get_avatar_data` hook of the
 * must-use plugin installAvatarPlugin puts on the site, reading `tracy_avatar`
 * (references/demo-content.md §6c Authors). A user whose URL is not the
 * attachment's is `rendered: false` and named in the notes: the file and the meta are on the
 * site and the page still shows another picture.
 */
export function checkAuthorAvatars(wp, avatars, report) {
  if (!avatars.length || wp.dryRun) return avatars.map((a) => ({ ...a, rendered: null }))
  let urls = {}
  try {
    urls = JSON.parse(wp.phpEval(`$ids=json_decode(base64_decode('${Buffer.from(JSON.stringify(avatars.map((a) => a.user))).toString('base64')}'),true);$o=array();foreach($ids as $i){$o[$i]=get_avatar_url((int)$i);}echo json_encode($o);`, { mutate: false })) ?? {}
  } catch (e) {
    report.notes.push({ note: `author avatars: get_avatar_url could not be read (${String(e.message).split('\n')[0]}); whether the theme draws them is unknown` })
    return avatars.map((a) => ({ ...a, rendered: null }))
  }
  const path = (u) => String(u ?? '').replace(/^https?:\/\/[^/]+/, '').split('?')[0]
  const out = avatars.map((a) => {
    const got = path(urls[a.user])
    const file = path(a.url)
    const ext = /\.[a-z0-9]+$/i.exec(file)?.[0] ?? ''
    const stem = file.slice(0, file.length - ext.length).replace(/-scaled$/, '')
    // WordPress may hand out a resized copy (`item-1-150x150.jpg`) or the `-scaled` original;
    // another file that merely starts the same (`item-10.jpg`, `item-1-2.jpg`) is not this one.
    const esc = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const rendered = Boolean(stem) && (got === file || new RegExp(`^${esc(stem)}(-scaled)?(-\\d+x\\d+)?${esc(ext)}$`, 'i').test(got))
    return { ...a, rendered, drawn: urls[a.user] ?? null }
  })
  const missed = out.filter((a) => !a.rendered)
  if (missed.length)
    report.notes.push({
      authors: missed.map((a) => a.login),
      note: `author avatars imported and stored on the user (${AUTHOR_AVATAR_META}) but not drawn: get_avatar_url() answers ${missed.map((a) => `${a.login} → ${a.drawn ?? 'nothing'}`).join(', ')}; the must-use plugin ${AVATAR_PLUGIN.file} is not drawing them (references/demo-content.md §6c Authors)`
    })
  return out
}

/**
 * Translation groups of the pages, from the page-map: a page's `translations` (`{ <lang>:
 * <file> }`) plus itself, files resolved to paths and paths to seeded ids. A page not seeded (a
 * `single` view is a post) drops out; a group of one is no group; each group is listed once.
 */
function pageTranslationGroups(pagemapPages, pageIds) {
  const pathOfFile = new Map(pagemapPages.filter((p) => p.file && p.path).map((p) => [p.file, p.path]))
  const idOf = (path) => pageIds.get(path)?.id || null
  const seen = new Set()
  const groups = []
  for (const p of pagemapPages) {
    if (!p.locale || !p.path) continue
    const group = {}
    if (idOf(p.path)) group[p.locale] = idOf(p.path)
    for (const [lang, file] of Object.entries(p.translations ?? {})) {
      const id = idOf(pathOfFile.get(file))
      if (id) group[lang] = id
    }
    if (Object.keys(group).length < 2) continue
    const key = JSON.stringify(Object.entries(group).sort())
    if (seen.has(key)) continue
    seen.add(key)
    groups.push(group)
  }
  return groups
}

/**
 * Translation groups of the posts: `translationOf` (a slug or a path of a default-locale post)
 * when the spec carries it; otherwise the posts of a secondary locale are paired with the
 * default locale's by their order within the same spec category — the shape a site exported
 * page by page has (five EN, five RU, same order) — and the report says so once.
 */
function postTranslationGroups(posts, postIds, defaultLocale, notes = []) {
  const idOf = (post) => postIds.get(post.slug) || null
  const groups = new Map() // default post slug → group
  const byRef = (ref) => posts.find((p) => p.locale === defaultLocale && (p.slug === ref || p.path === ref))
  let byOrder = false
  for (const post of posts) {
    if (!post.locale || post.locale === defaultLocale || !idOf(post)) continue
    let base = post.translationOf ? byRef(post.translationOf) : null
    if (!base && !post.translationOf) {
      const mine = posts.filter((p) => p.locale === post.locale && p.category === post.category)
      const theirs = posts.filter((p) => p.locale === defaultLocale && p.category === post.category)
      base = theirs[mine.indexOf(post)] ?? null
      if (base) byOrder = true
    }
    if (!base || !idOf(base)) {
      notes.push({ post: post.slug, note: `no ${defaultLocale} post to pair with; language set, no translation group` })
      continue
    }
    if (!groups.has(base.slug)) groups.set(base.slug, { [defaultLocale]: idOf(base) })
    groups.get(base.slug)[post.locale] = idOf(post)
  }
  if (byOrder) notes.push({ note: 'posts paired by order; the spec carries no translationOf' })
  return [...groups.values()]
}

/**
 * Redirect rules for the `single` views the spec's rules do not cover: the source's sample
 * article page (`/article`, `/ru/article`) is published as a post, so the route goes to the
 * first post of that page's locale (spec order), at the URL the site gives it. `postUrls` maps
 * post slug → path; a locale with no post, or one whose rule the spec wrote, adds nothing — and neither does a
 * theme whose map serves the single view at the view's own path (`views.single.servedAtPath`).
 */
export function singleViewRules(pagemapPages, posts, postUrls, rules, notes = [], views = {}) {
  const out = []
  // A theme that serves the single view at its own path (`views.single.servedAtPath`) answers 200 there:
  // a rule would send the path away and the route check would expect a 301 it never gets (see searchViewRules).
  if (views.single?.servedAtPath) return out
  for (const p of pagemapPages) {
    if (p.view !== 'single' || !p.path || rules.some((r) => r.from === p.path)) continue
    // A Joomla SEF address names its article: `…/<id>-<alias>`. That article's post is where it lands;
    // an address that names none goes to the first post of its locale.
    // A page-map entry that names its article (`source.articleId`: a menu item on one article
    // the adapter kept as a post) lands on that post or nowhere — never on another post.
    const declared = p.source?.articleId != null && p.source.articleId !== '' ? String(p.source.articleId) : null
    const id = declared ?? /\/(\d+)-[^/]+\/?$/.exec(p.path)?.[1]
    const named = id ? posts.find((post) => articleIdsOf(post).includes(id) && postUrls.get(post.slug)) : null
    if (declared && !named) {
      notes.push({ page: p.path, note: `single view: article ${declared} is not a seeded post; no redirect written` })
      continue
    }
    const first = named ?? posts.find((post) => (post.locale ?? null) === (p.locale ?? null) && postUrls.get(post.slug))
    if (!first) continue
    // The post already answers at that address: a rule there would send it to itself.
    if (p.path.replace(/\/+$/, '') === postUrls.get(first.slug).replace(/\/+$/, '')) continue
    out.push({ from: p.path, to: postUrls.get(first.slug), status: 301 })
    notes.push({ page: p.path, note: named ? `single view: redirected to article ${id} (${first.slug})` : `single view: redirected to the first post of its locale (${first.slug})` })
  }
  return out
}

/**
 * Redirect rules for the `search` views: the source's static "Search results" page is a mock
 * of one query, and a page seeded at `/search` sat beside WordPress's real search (`/?s=`) as
 * a second, dead search page. The view is seeded as a draft (so the path answers 404, which is
 * when the theme's redirect hook runs) and `/search` → the locale's root — the hook carries the
 * request's query string over, so `/search?s=x` lands on `/?s=x`. A locale whose rule the spec
 * wrote adds nothing, and neither does a theme whose map declares it serves the search view at the
 * view's own path (patterns.map.json `views.search.servedAtPath`: the source's search page, at the
 * source's address) — the draft stays, and the theme answers the path.
 */
export function searchViewRules(pagemapPages, rules, notes = [], views = {}) {
  const out = []
  if (views.search?.servedAtPath) return out
  for (const p of pagemapPages) {
    if (p.view !== 'search' || !p.path || rules.some((r) => r.from === p.path)) continue
    const root = p.path.replace(/\/[^/]+$/, '') || '/'
    out.push({ from: p.path, to: root, status: 301 })
    notes.push({ page: p.path, note: `search view: a draft page (the path answers 404); redirected to ${root}, the query string carried over (/?s=)` })
  }
  return out
}

/** Page-map views of a listing route that the seeder may answer with a page (servedAsPage in runSeed). */
const LISTING_VIEWS = ['category', 'archive', 'date', 'tag', 'author']

/**
 * The paths the run probes: each page-map page at its path, except a secondary-locale page
 * under Polylang, which the plugin serves at `/<lang>/<slug>/` — its real permalink is the
 * route and the page-map path is kept beside it (`pagemapPath`). A `404` view keeps its path
 * (the probe expects a 404 there), a `single` view is a redirect.
 */
export function routeTargets(pagemapPages, pageIds, { i18n = 'none', defaultLocale = null, views = {}, servedAsPage = null } = {}) {
  const strip = (u) => (u ?? '').replace(/^https?:\/\/[^/]+/, '')
  return pagemapPages
    .filter((p) => p.path)
    .map((p) => {
      // A view the theme answers as the source does, not with 200 (patterns.map.json `views[<view>].expect`:
      // an account page sends a visitor who is not logged in to the login page), is probed for that answer.
      const declared = views[p.view]?.expect
      if (declared) return { path: p.path, expect: declared.status, ...(declared.to ? { to: declared.to } : {}) }
      // A view the theme serves at its own path (`servedAtPath`, see searchViewRules) answers 200 there.
      if (views[p.view]?.servedAtPath) return { path: p.path, expect: 200 }
      const expect = p.view === 'single' || p.view === 'search' ? '301|200' : p.view === '404' ? 404 : 200
      const real = pageIds.get(p.path)?.url
      // A listing route this seeder answers with a page (a category listing with a query block): the
      // site serves a page there, whatever the page-map view says — the visual contract reads this.
      const served = servedAsPage?.has(p.path) ? { served: 'page' } : {}
      if (i18n === 'polylang' && p.locale && p.locale !== defaultLocale && expect === 200 && real)
        return { path: strip(real), expect, pagemapPath: p.path, ...served }
      return { path: p.path, expect, ...served }
    })
}

// ---------------------------------------------------------------------------------------------
// The run

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  // The runner's clock catches a stall between calls; this timer catches one where nothing is
  // being called (an await that never settles). Either way: one line, exit 1.
  const timer = setTimeout(() => {
    console.error(`seed: timed out after ${opts.timeout} s`)
    process.exit(1)
  }, opts.timeout * 1000)
  timer.unref()
  try {
    const report = await runSeed(opts)
    // A media/route collision (or a check that could not run) is not a clean seed.
    if (report.mediaRoutes?.ok === false) process.exitCode = 1
  } catch (e) {
    if (e instanceof TimeoutError) {
      console.error(e.message)
      process.exit(1)
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The whole run for parsed `opts`. `runner` replaces the wp-cli runner (a test's fake site),
 * `fetch` the route probe; both default to the real thing. Returns the report it wrote.
 */
export async function runSeed(opts, { runner = null, fetch: fetchImpl = globalThis.fetch } = {}) {
  const spec = loadSpec(opts.spec)
  checkCategorySlugs(spec.content.categories)
  const patternsMap = readJson(opts.patternsMap)
  mkdirSync(opts.out, { recursive: true })
  const log = (...a) => console.error(...a)
  // One clock for the run (--timeout, default 900 s): every wp call checks it and is capped by
  // it; the route probe is too. A seed that stops moving ends with "seed: timed out", exit 1.
  const deadline = Date.now() + opts.timeout * 1000
  const wp = runner ?? createRunner(opts.wp, { log, dryRun: opts.dryRun, keep: opts.wpKeep !== 'off', deadline })
  const report = {
    startedAt: new Date().toISOString(),
    dryRun: opts.dryRun,
    counts: {},
    notes: [],
    unresolvedSeedResults: [],
    sections: [],
    navigation: {},
    templateParts: {},
    redirects: [],
    routes: [],
    media: {},
    inlineColors: []
  }
  // copy.json beside the spec: each fix says what it changed; one that changed nothing is a
  // fix whose copy has moved (a re-ingest reworded it), and is said so.
  for (const f of spec.copy ?? [])
    report.notes.push({ copy: f.find, note: f.hits ? `copy fix ×${f.hits}: "${f.find}" → "${f.replace ?? ''}"${f.reason ? ` (${f.reason})` : ''}` : `copy fix matched nothing: "${f.find}" — the spec no longer says it` })
  report.notes.push(...mergeSharedArticles(spec.content.posts))
  report.notes.push(...dedupePostSlugs(spec.content.posts))
  // Which row each post is written onto, before the site is touched at all: a row that is not the article's own stops the seed here.
  const postRows = readPostRows(wp, spec.content.posts)
  const count = (kind, what) => {
    report.counts[kind] ??= { created: 0, updated: 0, skipped: 0 }
    report.counts[kind][what]++
  }
  // Posts of every kind go in through one batch (lib/post-batch.mjs): fingerprints read once,
  // creates and updates ten to a call. Each step flushes before it needs an id.
  const batch = createPostBatch(wp, { count, log })

  // Checks before anything is written. A post's own meta (checkPostMeta) and the template it names:
  // the theme must accept that template for posts (checkPostTemplates) — WordPress takes the meta
  // on the post's create and refuses the post's next update with "Invalid page template.", which
  // stopped a seed half-way (JA Vega M6-9). With --dist the theme is built, checked from the built
  // theme.json, and only then reinstalled — the install writes the site (theme, global styles), so
  // a page-only template stops the seed before it; the site's own answer confirms it after. The
  // patterns are read from the site's registry after the install (a pattern edited in the overlay
  // reached the pages one seed late when the rebuild came last). Without --dist the local tree is
  // not what the site runs: the site answers.
  const postMeta = checkPostMeta(spec.content.posts)
  checkPostTags(spec.content.posts)
  checkPostTags(spec.content.pages, 'page')
  // A category blog's paging and "More Articles" heading (moreArticlesOf) too: a count or heading
  // of the wrong shape is found here, not after the posts are written.
  const moreArchives = (spec.content.archives ?? []).filter((a) => a.view === 'category' && moreArticlesOf(a, archivePerPage(a))?.heading)
  const pagerArchives = (spec.content.archives ?? []).filter(joomlaPaged)
  const declaresTemplate = spec.content.posts.some((p) => declaredTemplate(p) !== undefined)
  const installs = Boolean(opts.themeSrc && opts.dist)
  const needsNoTitleTemplate = [...(spec.content.pages ?? []), ...(spec.content.archives ?? [])].some((p) => p.pageHeading?.hidden === true)
  let knownTemplates
  let eligibility = null
  const checkTemplates = (from) => {
    knownTemplates = themeTemplates({ themeSrc: opts.themeSrc, theme: opts.theme, wp, report })
    eligibility = declaresTemplate ? postTemplateEligibility(from) : null
    checkPostTemplates(spec.content.posts, knownTemplates, eligibility, report, { dryRun: opts.dryRun })
  }
  if (installs) {
    rebuildTheme(wp, opts, report, {
      afterBuild: () => {
        if (generateNoTitlePageTemplate({ themeSrc: opts.themeSrc, theme: opts.theme, needed: needsNoTitleTemplate, report }))
          zipGeneratedTheme(opts.themeSrc, opts.theme)
      },
      beforeInstall: () => checkTemplates({ themeSrc: opts.themeSrc, theme: opts.theme })
    })
    if (declaresTemplate && !wp.dryRun) {
      eligibility = postTemplateEligibility({ wp })
      checkPostTemplates(spec.content.posts, knownTemplates, eligibility, report, { site: true })
    }
  } else checkTemplates({ wp })

  // 0. Options that content depends on.
  const timezone = 'UTC'
  setOption(wp, 'timezone_string', timezone, report)
  const defaultLocale = spec.pagemap.defaultLocale ?? spec.content.site?.defaultLocale ?? null
  const locales = spec.pagemap.locales ?? spec.content.site?.locales ?? (defaultLocale ? [defaultLocale] : [])
  const polylang = opts.i18n === 'polylang'
  // 0b. Languages (--i18n polylang): before any content, so a post's language is set on a site
  // that knows it. The report says which were created; a second run creates none.
  if (polylang) {
    if (!defaultLocale) throw new Error('--i18n polylang needs page-map.json defaultLocale')
    report.i18n = wp.dryRun
      ? { plugin: 'polylang', languages: locales, created: [], dryRun: true }
      : seedLanguages(wp, { locales, defaultLocale })
  }

  // 1. Categories — slug lookup first; parents before children.
  const terms = new Map()
  const existingTerms =
    wp.json(['term', 'list', 'category', '--fields=term_id,slug,parent,name,description'], {
      mutate: false
    }) ?? []
  const byId = new Map(existingTerms.map((t) => [Number(t.term_id), t]))
  for (const t of existingTerms)
    terms.set(t.slug, {
      id: Number(t.term_id),
      slug: t.slug,
      parent: byId.get(Number(t.parent))?.slug ?? null,
      name: t.name,
      description: t.description
    })
  // 1a. What the source says about each post beyond the spec's fields (lib/post-content.mjs):
  // the eyebrow that names its category, the byline date, the listing card's excerpt, and a
  // body without the header the single template prints. A spec-pack written by an adapter that
  // already reads these carries them in the post; this reads the same source the same way.
  const postFacts = postSourceFacts(spec, { i18n: opts.i18n, defaultLocale })
  const tiedDates = [...postFacts.values()].filter((f) => f.date && f.date !== f.sourceDate).length
  if (tiedDates)
    report.notes.push({ tiedDates, note: `${tiedDates} post(s) shared a post_date with another; each got one second in source order so date-sorted listings serve the same order on every request` })
  const tocs = sourceTocs(spec.sections)
  const localized = [
    ...localizeCategories(spec.content.categories, { i18n: opts.i18n, locales, defaultLocale }),
    ...derivedCategories(spec.content.posts, postFacts, { i18n: opts.i18n, defaultLocale })
  ].filter((c, i, all) => all.findIndex((k) => k.wpSlug === c.wpSlug) === i)
  // The listing's filter row names the categories the reader sees ("Disclosures" over the
  // cards' "Disclosure").
  nameCategoriesFromListing(localized, listingFilters(spec), { defaultLocale, notes: report.notes })
  const ordered = [...localized].sort((a, b) => (a.parent ? 1 : 0) - (b.parent ? 1 : 0))
  const mediaIndex = loadMedia(opts.out)
  // 2. Media — imported once, before anything that refers to it.
  const wanted = collectImages(spec, patternsMap)
  seedMedia(wp, wanted, mediaIndex, opts, report, batch, reservedRouteSlugs(spec))
  // 2a. Attachments whose slug takes a route of the spec — new and reused ones alike, read from the
  // site. A read that fails is not a clean result either (#14 item 8).
  const routePaths = [...spec.pagemap.pages, ...spec.content.pages, ...(spec.content.archives ?? [])].map((p) => p.path).filter(Boolean)
  report.mediaRoutes = opts.dryRun ? { ok: null, skipped: 'dry run' } : checkMediaRoutes(wp, mediaIndex, routePaths)
  // What the seeder does not rename itself (a route it never reserves — the not-found page's — or an
  // attachment outside media.json) is refused with the exact rename to make.
  if (report.mediaRoutes.collisions?.length) {
    const routeSlugs = new Set([...reservedRouteSlugs(spec), ...routePaths.map((p) => String(p).split('/').filter(Boolean)).filter((segs) => segs.length === 1).map((segs) => wpPostName(segs[0]))])
    report.mediaRoutes.fix = report.mediaRoutes.collisions.map((c) => {
      try {
        return `wp post update ${c.attachment} --post_name=${freeAttachmentSlug(wp, c.slug, routeSlugs)}`
      } catch (e) {
        report.notes.push({ attachment: c.attachment, note: `no free slug could be chosen for attachment ${c.attachment} (${e.message})` })
        return null
      }
    })
  }
  report.mediaRoutes.collisions?.forEach((c, i) => {
    const line = `attachment ${c.attachment} (${c.source ?? 'source unknown'}) has the slug "${c.slug}" and takes ${c.route}; rename it ${report.mediaRoutes.fix[i] ? `with \`${report.mediaRoutes.fix[i]}\`` : 'to a slug no route or post holds'} (or rename its file) and seed again`
    log(`seed: MEDIA/ROUTE COLLISION — ${line}`)
    report.notes.push({ attachment: c.attachment, note: line })
  })
  if (report.mediaRoutes.error) log(`seed: media/route check could not read the attachments: ${report.mediaRoutes.error}`)
  // `owner`: the image tables of what refers to the image, nearest first (resolveMedia); `where`
  // names it in the report. A reference that cannot be resolved to one file is noted once.
  const mediaNoted = new Set()
  const media = (ref, owner = [], where = {}) => {
    const r = resolveMedia(mediaIndex, ref, [...owner, spec.content.images ?? []])
    if (r.problem) {
      const k = `${JSON.stringify(where)}|${r.problem}`
      if (!mediaNoted.has(k)) {
        mediaNoted.add(k)
        report.notes.push({ ...where, image: ref, note: r.problem })
      }
    }
    return r.hit
  }
  const unknownTokens = new Set()
  const rewrite = (markup, owner = [], where = {}) =>
    rewriteBrandTokens(rewriteMediaRefs(markup, (ref) => media(ref, owner, where), { theme: opts.theme }), unknownTokens)
  for (const c of ordered) {
    // The term keeps the plain text: WordPress strips tags from a description written through
    // wp-cli, so storing the HTML would make every run an update. The HTML (with its image) is
    // what the category's archive page prints, read from the spec at build time.
    const desired = {
      name: c.title,
      slug: c.wpSlug,
      parent: c.parent ?? null,
      description: stripTags(String(c.description ?? ''))
    }
    const have = terms.get(c.wpSlug)
    const parentId = desired.parent ? terms.get(desired.parent)?.id : 0
    if (desired.parent && !parentId)
      throw new Error(`category ${c.wpSlug}: parent ${desired.parent} not seeded`)
    if (!have) {
      const id = Number(
        wp.out([
          'term',
          'create',
          'category',
          desired.name,
          `--slug=${desired.slug}`,
          `--parent=${parentId ?? 0}`,
          `--description=${desired.description}`,
          '--porcelain'
        ]) || 0
      )
      terms.set(desired.slug, { id, ...desired })
      count('categories', 'created')
    } else if (
      !sameTermName(have.name, desired.name) ||
      (have.parent ?? null) !== desired.parent ||
      (have.description ?? '') !== desired.description
    ) {
      wp.run([
        'term',
        'update',
        'category',
        have.id,
        `--name=${desired.name}`,
        `--parent=${parentId ?? 0}`,
        `--description=${desired.description}`
      ])
      terms.set(desired.slug, { ...have, ...desired })
      count('categories', 'updated')
    } else count('categories', 'skipped')
  }

  // 2b. The "Archived" tag: Joomla's archived state has no WordPress status, and its archive view
  // lists exactly those articles, so they carry a tag and the archive page queries it.
  const tags = new Map()
  const archivedPosts = spec.content.posts.filter((p) => p.joomla?.state === 2)
  if (archivedPosts.length) {
    const existingTags =
      wp.json(['term', 'list', 'post_tag', '--fields=term_id,slug,name'], { mutate: false }) ?? []
    const have = existingTags.find((t) => t.slug === 'archived')
    if (have) {
      tags.set('archived', { id: Number(have.term_id), slug: 'archived' })
      count('tags', 'skipped')
    } else {
      const id = Number(
        wp.out([
          'term',
          'create',
          'post_tag',
          'Archived',
          '--slug=archived',
          '--description=Articles the source site had archived',
          '--porcelain'
        ]) || 0
      )
      tags.set('archived', { id, slug: 'archived' })
      count('tags', 'created')
    }
  }

  // 3. Contact Form 7 — before pages, the Contact page embeds the form id. One form per locale,
  // built from the source's own form (lib/form-embed.mjs); the generic form when the spec has none.
  // A theme that draws the contact page's form itself (patterns.map.json `views['page-contact']`) gets
  // no Contact Form 7: no plugin install, no form, no shortcode.
  const themeContact = viewBody(patternsMap, 'page-contact')
  if (themeContact)
    report.notes.push({ form: 'contact', note: `the theme draws the contact form (${themeContact.block}); Contact Form 7 not installed, no form created` })
  const cf7Forms = themeContact
    ? new Map()
    : seedContactForms(wp, report, batch, { forms: specForms(spec, { defaultLocale }), defaultLocale })
  const cf7 = cf7Forms.get(defaultLocale) ?? cf7Forms.get(null) ?? [...cf7Forms.values()][0] ?? null
  const cf7For = (locale) => cf7Forms.get(locale ?? defaultLocale) ?? cf7

  // 4. Patterns as registered on the site (PHP already rendered): the shared `tracy/*` library,
  // the `tracy-base/*` ACM patterns, and the theme's own namespace (`--pattern-ns`, else the
  // map's `namespace`, else the theme slug). A read, so a dry run takes it too — the report then
  // says which sections WOULD fill; without a site it says none and why.
  // The theme was rebuilt and reinstalled at the start, BEFORE the patterns are read: they come
  // from the site's registry, and a pattern edited in the overlay reached the pages one seed late
  // (seed 57 filled the team cards from the old slots while the zip with the new ones was installed
  // at step 10).
  const patternNs = opts.patternNs ?? patternsMap.namespace ?? opts.theme
  const patterns = loadPatterns(wp, ['tracy', patternNs], report)
  // A pattern the map names that the site does not register (WordPress caches pattern metadata by
  // theme version, so a renamed one is missing) leaves its sections unwritten while the seed still
  // exits 0. Stop before any page is written.
  const missingPatterns = missingRequiredPatterns(patternsMap, spec.sections?.acm ?? [], patterns)
  if (missingPatterns.length && !opts.dryRun)
    throw new Error(`seed: pattern${missingPatterns.length === 1 ? '' : 's'} named by the patterns map but not registered on the site: ${missingPatterns.join(', ')} — bump the theme version (WordPress caches pattern metadata by it) or fix the map; no page was written`)
  for (const name of missingPatterns) report.notes.push({ note: `dry run: pattern ${name} is not registered on the site` })
  const descendants = (slug) => {
    const out = []
    const walk = (parent) => {
      for (const c of localized.filter((k) => k.parent === parent)) {
        out.push(c.wpSlug)
        walk(c.wpSlug)
      }
    }
    walk(slug)
    return out
  }
  // A category's archive is the seeded page for its route when the spec has one, else the term's own URL.
  const archivePathByCategory = new Map(
    spec.content.archives.filter((a) => a.view === 'category' && a.category).map((a) => [a.category, a.path])
  )
  const termUrls = opts.dryRun
    ? new Map()
    : new Map(
        (wp.json(['term', 'list', 'category', '--fields=slug,url'], { mutate: false }) ?? []).map((t) => [
          t.slug,
          t.url.replace(/^https?:\/\/[^/]+/, '')
        ])
      )
  const categoryUrl = (slug) => archivePathByCategory.get(slug) ?? termUrls.get(slug) ?? `/category/${slug}/`
  // The link table: every path the spec seeds (pages, archives, redirect sources) → the href the
  // page carries. A section link that names none of them is kept and listed in the report.
  const links = new Map()
  for (const p of spec.content.pages) if (p.path) links.set(p.path, p.path)
  for (const a of spec.content.archives ?? []) if (a.path) links.set(a.path, a.path)
  for (const r of spec.redirects?.rules ?? []) if (r?.from && r?.to) links.set(r.from, r.to)
  // The theme's colour presets, for colour literals in verbatim HTML (core/html): the contract's
  // measured colours first, then what the theme really paints — the overlay's tokens.css and the
  // built theme.json — since a preset a literal is mapped to must resolve to that colour.
  const palette = loadPalette(opts, report)
  // The site's post tags by name or slug, read on first use (after the posts made them): a tag route
  // that declares tags (`archive.tags`) filters its list by these ids.
  let siteTags = null
  const tagIdOf = (nameOrSlug) => {
    if (opts.dryRun) return null
    siteTags ??= wp.json(['term', 'list', 'post_tag', '--fields=term_id,slug,name'], { mutate: false }) ?? []
    const want = String(nameOrSlug).trim()
    const hit = siteTags.find((t) => sameTermName(t.name, want)) ?? siteTags.find((t) => String(t.slug).toLowerCase() === want.toLowerCase())
    return hit ? Number(hit.term_id) : null
  }
  const ctx = {
    spec,
    patternsMap,
    patterns,
    tagIdOf,
    links,
    media,
    rewrite,
    cf7,
    cf7For,
    log: report.notes,
    unresolvedSeedResults: report.unresolvedSeedResults,
    sections: report.sections,
    palette,
    spacingPresets: loadSpacingPresets(opts),
    inlineColors: report.inlineColors,
    typedLoss: opts.typedLoss,
    terms,
    descendants,
    categoryUrl,
    contactHeading: opts.contactHeading ?? null,
    tags,
    // Categories that hold a published post after step 5 (buildArchiveContent: no empty post query).
    postCategories: new Set(),
    // Published posts WordPress files under a category or below it, the site owner's included,
    // less the archived ones the listing leaves out; null when the count cannot be read (the
    // query is then kept).
    publishedPostsIn: memo((slug) => publishedPostCount(wp, slug, { excludeTagIds: tags.has('archived') ? [tags.get('archived').id] : [] }))
  }

  // The keys the posts carry beyond the seeder's own (checkPostMeta), registered for the editor and
  // Block Bindings by a must-use plugin that reads them from an option — before any post is written:
  // without it a key is on the post and nothing can show or edit it (JA Vega M6-3).
  if (postMeta.keys.length) {
    const plugin = installMuPlugin(wp, report, POST_META_PLUGIN, 'post meta')
    if (plugin.action === 'failed') throw new Error(`seed: post meta ${postMeta.keys.join(', ')}: the must-use plugin ${POST_META_PLUGIN.file} that registers them could not be written; nothing was seeded past the categories and media`)
    setOption(wp, POST_META_OPTION, JSON.stringify(postMeta.keys), report, true)
    report.postMeta = { keys: postMeta.keys, plugin }
  }
  // Pages that kept their source tags (an article the port made a page): post_tag on pages first.
  if (spec.content.pages.some((p) => Array.isArray(p.tags) && p.tags.length)) {
    const plugin = installMuPlugin(wp, report, PAGE_TAGS_PLUGIN, 'page tags')
    if (plugin.action === 'failed') throw new Error(`seed: pages[].tags: the must-use plugin ${PAGE_TAGS_PLUGIN.file} that puts tags on pages could not be written; nothing was seeded past the categories and media`)
    report.pageTags = { pages: spec.content.pages.filter((p) => p.tags?.length).map((p) => p.path), plugin }
  }
  // 5. Posts — their authors first (a user per named byline, an editorial user for the rest).
  const authors = postAuthors(spec.content.posts, postFacts, { siteName: spec.content.site?.name ?? null, defaultLocale, authors: spec.content.authors, notes: report.notes })
  const authorIds = seedAuthors(wp, authors.users, report, count, { media })
  const postHandles = new Map() // slug → { id }
  for (const post of spec.content.posts) {
    const facts = postFacts.get(post.slug)
    const termSlug = facts.categorySlug ?? postCategorySlug(post, { i18n: opts.i18n, defaultLocale })
    const term = terms.get(termSlug)
    if (term && (post.status ?? 'publish') === 'publish' && post.joomla?.state !== 2) ctx.postCategories.add(termSlug)
    // One article in several categories (mergeSharedArticles): the primary term first, then the others it stands in.
    const extraSlugs = (post.categories ?? []).filter((c) => c !== post.category).map((c) => postCategorySlug({ ...post, category: c }, { i18n: opts.i18n, defaultLocale }))
    const extraTerms = extraSlugs.map((slug) => terms.get(slug)).filter(Boolean)
    if ((post.status ?? 'publish') === 'publish' && post.joomla?.state !== 2) for (const slug of extraSlugs) if (terms.has(slug)) ctx.postCategories.add(slug)
    const thumb = media(post.featuredImage, [post.images ?? []], { post: post.slug })
    const postColors = { replaced: 0, kept: 0 }
    if (post.featuredImage && !thumb)
      report.notes.push({ post: post.slug, note: `featured image ${post.featuredImage} not imported` })
    if (facts.head.removed.length || facts.sourceDate !== (post.date ?? null))
      report.notes.push({
        post: post.slug,
        note: `from the source: ${[
          facts.head.removed.length ? `body without its ${facts.head.removed.join(', ')}` : '',
          facts.sourceDate !== (post.date ?? null) ? `date ${facts.sourceDate ?? 'none'}` : '',
          facts.categorySlug ? `category ${facts.categorySlug}` : ''
        ]
          .filter(Boolean)
          .join('; ')}`
      })
    const template = postTemplate(post, knownTemplates, report, eligibility)
    const desired = {
      post_title: post.title,
      post_name: wpPostName(post.slug),
      post_status: post.status ?? 'publish',
      post_date: facts.date ?? undefined,
      // The excerpt is what the loop prints and what the single template prints as the lede:
      // the intro before a read-more, else the article's own lead, else the spec's excerpt (a
      // listing card's text; Joomla's meta description), else the source card's text. Never the
      // auto-excerpt (the first words of the body): on a design export it starts with the
      // eyebrow and the title.
      post_excerpt: typeset(introText(post.content) || facts.head.lead || post.excerpt || facts.card?.text || '', { mode: 'text' }),
      post_category: extraTerms.length && term ? [term.id, ...extraTerms.map((t) => t.id)] : term?.id,
      ...(facts.menuOrder != null ? { menu_order: facts.menuOrder } : {}),
      post_author: authorIds.get(authors.byPost.get(post.slug)) || undefined,
      tags_input: tagsInput([...facts.tags, ...(post.joomla?.state === 2 ? ['archived'] : [])]),
      sticky: facts.sticky,
      content: postWithRoute(post, typeset(presetHtmlBlocks(rewrite(facts.head.content, [post.images ?? []], { post: post.slug }), ctx, postColors)), ctx),
      // The source's own table of contents beside the article (lib/post-content.mjs
      // sourceTocs): short labels, in heading order, for the theme's TOC to print.
      meta: {
        _thumbnail_id: thumb?.id,
        ...(tocs.get(post.source?.file) ? { tracy_toc: tocs.get(post.source.file) } : {}),
        ...postMeta.byPost.get(post),
        // The article a post of a slug group was made for: the exact identity a later run (or an upgrade) pairs the row by.
        ...(post.joomla?.articleId != null && post.joomla.articleId !== '' ? { [SOURCE_ARTICLE_META]: String(post.joomla.articleId) } : {}),
        ...(template ? { _wp_page_template: template } : {})
      }
    }
    if (postColors.replaced + postColors.kept > 0) ctx.inlineColors?.push({ post: post.path ?? post.slug, ...postColors })
    postHandles.set(post.slug, batch.add({ postType: 'post', have: postRows.get(post), desired, kind: 'posts' }))
  }
  batch.flush()
  const postIds = new Map([...postHandles].map(([slug, h]) => [slug, h.id])) // slug → id
  // What WordPress stored is read back, not assumed: menus, translations and redirects follow the id and the permalink,
  // and the spec's slug stays the name the fingerprint and the next run's plan are made of.
  if (!wp.dryRun && postIds.size) {
    const stored = new Map(listPosts(wp, 'post').map((r) => [Number(r.ID), r.post_name]))
    for (const post of spec.content.posts) {
      const have = stored.get(postIds.get(post.slug))
      if (have !== undefined && have.toLowerCase() !== wpPostName(post.slug)) report.notes.push({ post: post.slug, note: `post ${postIds.get(post.slug)} was asked to be ${wpPostName(post.slug)} and WordPress stored it as ${have}` })
    }
  }

  // 6a. A category blog that lists "More Articles" (moreArticlesOf) needs the must-use plugin that
  // pages the list with its cards; without it every page lists the same first titles. Installed
  // before the pages are written.
  if (moreArchives.length) {
    const plugin = installMuPlugin(wp, report, MORE_ARTICLES_PLUGIN, 'more articles')
    if (plugin.action === 'failed') throw new Error(`seed: ${moreArchives.map((a) => a.path).join(', ')} list "More Articles": the must-use plugin ${MORE_ARTICLES_PLUGIN.file} that pages them could not be written; no page was written`)
    report.moreArticles = { archives: moreArchives.map((a) => a.path), plugin }
  }
  // 6b. A Joomla listing that pages draws Joomla's pager (JOOMLA_PAGER_CLASS) through its plugin.
  if (pagerArchives.length) {
    const plugin = installMuPlugin(wp, report, JOOMLA_PAGER_PLUGIN, 'joomla pagination')
    if (plugin.action === 'failed') throw new Error(`seed: ${pagerArchives.map((a) => a.path).join(', ')} page as Joomla does: the must-use plugin ${JOOMLA_PAGER_PLUGIN.file} that draws the pager could not be written; no page was written`)
    report.joomlaPager = { archives: pagerArchives.map((a) => a.path), plugin }
    // The words the source prints on start / previous / next / end (`paging.labels`), for the pager to
    // show instead of its symbols; the archives must agree, since the plugin has one set.
    const labels = pagerLabels(pagerArchives, report.notes)
    // No labels declared (or removed since the last run) is an explicit empty set: the pager shows its symbols.
    setOption(wp, PAGER_TEXT_OPTION, JSON.stringify(labels ?? {}), report, true, { emptyObjectIsList: true })
    if (labels) report.joomlaPager.labels = labels
  }
  // 6. Pages — parents first. Archive routes become pages too; missing parents are synthesised.
  const pages = [...spec.content.pages]
  const pageByPath = new Map(pages.filter((p) => p.path).map((p) => [p.path, p]))
  for (const a of spec.content.archives) {
    if (pageByPath.has(a.path)) {
      pageByPath.get(a.path).archive = a
      continue
    }
    const parentPath = a.path.split('/').slice(0, -1).join('/') || null
    const page = {
      title: a.title,
      slug: a.path.split('/').pop(),
      path: a.path,
      // The route's own file: sections assigned to it are found by it (sectionsOfPage).
      ...(a.file ? { file: a.file } : {}),
      view: a.view,
      // A search view is a draft: WordPress's own search (`/?s=`) is the live one, and the
      // draft keeps the path answering 404 so the redirect hook fires (searchViewRules).
      status: a.view === 'search' ? 'draft' : 'publish',
      parent: parentPath,
      locale: a.locale,
      synthetic: true,
      syntheticReason: `route ${a.path} is a ${a.view} archive in Joomla; a page holds the matching query block`,
      archive: a,
      meta: {}
    }
    pages.push(page)
    pageByPath.set(a.path, page)
  }
  // A snapshot: the loop below appends synthetic parents to `pages`, and they must not be
  // iterated in the same pass.
  const snapshot = Array.from(pages)
  for (const page of snapshot) {
    let parent = page.parent
    while (parent && !pageByPath.has(parent)) {
      const seg = parent.split('/').pop()
      const synthetic = {
        title: seg[0].toUpperCase() + seg.slice(1),
        slug: seg,
        path: parent,
        view: 'page',
        status: 'publish',
        parent: parent.split('/').slice(0, -1).join('/') || null,
        synthetic: true,
        syntheticReason: `parent so that ${page.path} keeps its path`,
        content: '',
        meta: {}
      }
      pages.push(synthetic)
      pageByPath.set(parent, synthetic)
      report.notes.push({ page: parent, note: `synthesised parent page for ${page.path}` })
      parent = synthetic.parent
    }
  }
  report.notes.push(...localizePages(pages, { i18n: opts.i18n, defaultLocale }))
  // The 404 template's words come from a draft page (<theme>_404_page, step 9b): the source's own
  // not-found page, else one made here from the page-map title.
  const notFound = notFoundPage(spec.pagemap.pages, defaultLocale)
  const notFoundSeed = notFoundDraft(notFound, pages, defaultLocale)
  if (notFoundSeed?.created) {
    pages.push(notFoundSeed.page)
    report.notes.push({
      page: notFound.path,
      note: `the source has no not-found page: draft "${notFoundSeed.page.wpSlug}" holds the page-map title "${notFoundSeed.page.title}" only — the source's other 404 words are not in the spec; write them in the admin`
    })
  } else if (notFoundSeed && notFoundSeed.page.wpSlug !== wpPostName(notFoundSeed.page.slug))
    report.notes.push({ page: notFound.path, note: `the not-found draft shares its slug with a routed page; filed as "${notFoundSeed.page.wpSlug}"` })
  const menuOrder = pageMenuOrder(pages)
  const depth = (p) => (p.path ? p.path.split('/').length : 0)
  pages.sort((a, b) => depth(a) - depth(b))
  const pageMapByPath = new Map(spec.pagemap.pages.map((p) => [p.path, p]))
  const templateFor = (page) => {
    const pm = pageMapByPath.get(page.path)
    const hiddenHeading = page.pageHeading?.hidden === true || page.archive?.pageHeading?.hidden === true
    if (hiddenHeading) {
      if (!knownTemplates.has(NO_TITLE_PAGE_TEMPLATE))
        throw new Error(`page ${page.path}: hidden source heading requires the theme's ${NO_TITLE_PAGE_TEMPLATE} custom template; seed with --theme-src and --dist to generate it`)
      return NO_TITLE_PAGE_TEMPLATE
    }
    const explicit = page.meta?._wp_page_template
    if (explicit && knownTemplates.has(explicit)) return explicit
    const layout = pm?.layout ?? page.archive?.layout
    if (page.view === 'front-page') return undefined
    if (['home', 'home-2', 'landing', 'od-landing'].includes(layout)) return 'page-landing'
    if (layout === 'od-onepage') return 'page-onepage'
    if (layout === 'no-sidebar') return 'page-no-sidebar'
    if (layout === 'sidebar-left') return 'page-sidebar-left'
    if (explicit)
      report.notes.push({
        page: page.path,
        note: `template ${explicit} does not exist in the theme; layout ${layout ?? 'default'} used`
      })
    return undefined
  }
  const existingPages = listPosts(wp, 'page', [
    'ID',
    'post_name',
    'post_title',
    'post_status',
    'post_parent',
    'page_template'
  ])
  const pageIds = new Map() // path → { id, url } (a batch handle: id is filled when the batch is flushed)
  const rebuildWithOwnId = [] // new archive pages whose query needs their own id
  const pageHandles = [] // every page this run seeds (the install samples step leaves them alone)
  let notFoundHandle = null
  for (const page of pages) {
    // A parent still in the batch has no id yet: the batch goes in first (pages are sorted by
    // depth, so this happens once per level, not once per page).
    if (page.parent && pageIds.has(page.parent) && pageIds.get(page.parent).id === null) batch.flush()
    const parentId = page.parent ? pageIds.get(page.parent)?.id : 0
    // A dry run creates nothing and records id 0 for every new page; only a parent that was never
    // reached is an error.
    if (page.parent && parentId === undefined)
      throw new Error(`page ${page.path}: parent ${page.parent} not seeded`)
    let have = existingPages.find(
      (p) => p.post_name.toLowerCase() === page.wpSlug && Number(p.post_parent) === (parentId ?? 0)
    )
    // A site seeded before Polylang holds this page under `/<locale>` with the spec slug; the
    // seeder's own fingerprint on it says it may be moved, and moving keeps the id (links, menus).
    if (!have && page.legacyParent && pageIds.has(page.legacyParent)) {
      const legacy = existingPages.find(
        (p) =>
          p.post_name.toLowerCase() === wpPostName(page.slug) &&
          Number(p.post_parent) === pageIds.get(page.legacyParent).id
      )
      if (legacy && !wp.dryRun && batch.fingerprintOf(legacy.ID)) {
        have = legacy
        report.notes.push({
          page: page.path,
          note: `page ${legacy.ID} moved from under ${page.legacyParent} to the top level as a Polylang translation`
        })
      }
    }
    const hasChildPages = pages.some((p) => p.parent === page.path && !p.archive)
    if (page.archive?.view === 'category' && page.archive.display == null)
      report.notes.push({ page: page.path, note: 'the spec records no display options for this category archive; title, description and one level of subcategories printed (the source was not read for them)' })
    const isCategoryIndex = pageMapByPath.get(page.path)?.source?.view === 'categories'
    const asideIds = page.archive?.aside ?? page.aside ?? []
    const asideSide =
      asideIds.length &&
      (spec.sections.other ?? []).find((m) => m.id === asideIds[0])?.position === 'sidebar-r'
        ? 'right'
        : 'left'
    // Child pages that are not articles of this category (a menu page filed under the same
    // parent): the query leaves them out by id. A child not seeded yet has no id — the page is
    // built again once the batch is flushed (first run only; later runs resolve from the site).
    const outsideChildren = page.archive?.category ? childPagesOutside(page, pages, spec) : []
    let unresolvedChildren = false
    const childIds = (selfId) => {
      unresolvedChildren = false
      return outsideChildren
        .map((child) => {
          const id =
            pageIds.get(child.path)?.id ??
            existingPages.find((p) => p.post_name.toLowerCase() === child.wpSlug && Number(p.post_parent) === selfId)?.ID
          if (!id) unresolvedChildren = true
          return Number(id) || 0
        })
        .filter(Boolean)
    }
    const build = (selfId) => {
      const body = page.archive
        ? archivePageContent(page, ctx, { selfId, hasChildPages, excludeChildIds: selfId ? childIds(selfId) : [] })
        : isCategoryIndex
          ? buildCategoryIndex(ctx)
          : buildPageContent(page, ctx)
      return withAside(body, renderAside(asideIds, ctx, page.path), asideSide)
    }
    const content = typeset(build(have ? Number(have.ID) : 0))
    const pageThumb = page.featuredImage ? media(page.featuredImage, pageImageTables(page, spec), { page: page.path }) : null
    if (page.featuredImage && !pageThumb)
      report.notes.push({ page: page.path, note: `featured image ${page.featuredImage} not imported` })
    // The sidebar is content here, so the template's generic sidebar would double it.
    const template =
      templateFor(page) === 'page-sidebar-left' && asideIds.length ? 'page-no-sidebar' : templateFor(page)
    const title = pageTitle(page, spec.menus?.menus ?? [])
    const desired = {
      post_title: title,
      post_name: page.wpSlug,
      post_status: page.status ?? 'publish',
      post_parent: parentId ?? 0,
      ...(menuOrder.has(page) ? { menu_order: menuOrder.get(page) } : {}),
      post_date: page.date ?? undefined,
      post_excerpt: typeset(pageExcerpt(page, ctx.spec), { mode: 'text' }),
      content,
      ...(Array.isArray(page.tags) && page.tags.length ? { tags_input: tagsInput(page.tags.map((t) => t.trim())) } : {}),
      // The page-map title (the source's h1) beside a shortened post_title, for a template that
      // prints the heading from meta rather than the title.
      meta: {
        _wp_page_template: template,
        ...(page.pageHeading?.text ? { tracy_page_heading: page.pageHeading.text } : title !== page.title ? { tracy_page_heading: page.title } : {}),
        // The article's intro image, as for a post: category blogs and the titled template print it.
        ...(pageThumb?.id ? { _thumbnail_id: pageThumb.id } : {})
      }
    }
    const handle = batch.add({ postType: 'page', have, desired, kind: 'pages' })
    handle.status = desired.post_status
    // A brand-new archive page that lists its child pages needs its own id in the query, and one
    // that leaves some children out needs theirs: one more update on the run that created them,
    // none afterwards.
    if (page.archive && hasChildPages && (!have || unresolvedChildren))
      rebuildWithOwnId.push({ handle, desired, build: (id) => typeset(build(id)) })
    if (page.path) pageIds.set(page.path, handle)
    if (page === notFoundSeed?.page) notFoundHandle = handle
    pageHandles.push(handle)
  }
  batch.flush()
  for (const { handle, desired, build } of rebuildWithOwnId)
    if (handle.id) batch.add({ postType: 'page', have: { ID: handle.id }, desired: { ...desired, content: build(handle.id) }, kind: 'pages' })
  batch.flush()
  // 6a. WordPress's install samples ("Hello world!", "Sample Page") still as installed: to the
  // trash (restorable; never --force), or blog, author and search listings show a post the source
  // never had and the quickstart ships it.
  const sampleFields = ['ID', 'post_type', 'post_name', 'post_title', 'post_status', 'post_date', 'post_modified']
  const seededIds = new Set([...postIds.values(), ...pageHandles.map((h) => h.id)].filter(Boolean).map(Number))
  const candidates = installSamples([...listPosts(wp, 'post', sampleFields), ...listPosts(wp, 'page', sampleFields)], { keepIds: seededIds })
  // One still in use (front page, posts page, a menu item, a link or block in other content) is
  // kept and named; references that cannot be read keep every sample.
  const refs = candidates.length ? readSampleReferences(wp, candidates) : new Map()
  const samples = refs === null ? [] : candidates.filter((r) => !refs.has(Number(r.ID)))
  for (const r of candidates.filter((c) => !samples.includes(c)))
    report.notes.push({
      post: r.post_name,
      note: `WordPress install sample "${r.post_title}" (#${r.ID}) kept: ${refs === null ? 'what refers to it could not be read' : `still used by ${refs.get(Number(r.ID)).join('; ')}`}`
    })
  if (samples.length) {
    wp.run(['post', 'delete', ...samples.map((r) => String(r.ID))])
    for (const r of samples) {
      count('samples', 'updated')
      report.notes.push({ post: r.post_name, note: `WordPress install sample "${r.post_title}" (#${r.ID}) moved to the trash (wp post list --post_status=trash; restore with wp post update ${r.ID} --post_status=publish)` })
    }
  }
  // 6b. Languages and translations (--i18n polylang): every page and post carries its locale
  // (a post with none is invisible to a language-filtered query), pages are linked by the
  // page-map, posts by translationOf or order, category twins to their base. Before the
  // permalinks are read: a post's language is what puts `/ru/` in front of its URL.
  if (polylang && !wp.dryRun) {
    const postsLang = {}
    for (const page of pages) if (page.path && page.locale && pageIds.get(page.path)?.id) postsLang[pageIds.get(page.path).id] = page.locale
    for (const post of spec.content.posts) if (post.locale && postIds.get(post.slug)) postsLang[postIds.get(post.slug)] = post.locale
    const termsLang = {}
    const termGroups = new Map()
    for (const c of localized) {
      const id = terms.get(c.wpSlug)?.id
      if (!id || !c.locale) continue
      termsLang[id] = c.locale
      const base = c.translationOf ?? c.wpSlug
      if (!termGroups.has(base)) termGroups.set(base, {})
      termGroups.get(base)[c.locale] = id
    }
    report.i18n.linked = pllLink(wp, {
      posts: postsLang,
      groups: [
        ...pageTranslationGroups(spec.pagemap.pages, pageIds),
        ...postTranslationGroups(spec.content.posts, postIds, defaultLocale, report.notes)
      ],
      terms: termsLang,
      termGroups: [...termGroups.values()].filter((g) => Object.keys(g).length > 1)
    })
  }
  // Permalinks, as WordPress builds them.
  if (!opts.dryRun) {
    const rows =
      wp.json(
        ['post', 'list', '--post_type=page', '--post_status=any', '--posts_per_page=-1', '--fields=ID,url'],
        { mutate: false }
      ) ?? []
    const urlById = new Map(rows.map((r) => [Number(r.ID), r.url]))
    for (const v of pageIds.values()) v.url = urlById.get(v.id)
  }
  // Post permalinks, for the single-view redirects — read only when a page-map has such a view.
  const postUrls = new Map()
  if (!opts.dryRun && spec.pagemap.pages.some((p) => p.view === 'single')) {
    const rows =
      wp.json(
        ['post', 'list', '--post_type=post', '--post_status=any', '--posts_per_page=-1', '--fields=ID,url'],
        { mutate: false }
      ) ?? []
    const urlById = new Map(rows.map((r) => [Number(r.ID), r.url.replace(/^https?:\/\/[^/]+/, '')]))
    for (const [slug, id] of postIds) if (urlById.get(id)) postUrls.set(slug, urlById.get(id))
  }

  // 7. Navigation. The theme's part files come first: a mega-menu block in the header owns its
  // label, and the source menu's item of that name is not seeded beside it.
  const partFiles = {}
  for (const slug of ['header', 'footer']) {
    const fromSrc = opts.themeSrc ? join(opts.themeSrc, 'src', opts.theme, 'parts', `${slug}.html`) : null
    // Only a regular file (a symlink to one included) is read: a FIFO there would block the read
    // for good, a directory would throw. Anything else there — a broken symlink included, which
    // existsSync does not see — means the site's copy, and the report says so.
    const entry = fromSrc !== null ? lstatSync(fromSrc, { throwIfNoEntry: false }) : undefined
    let target
    try {
      target = entry ? statSync(fromSrc) : undefined
    } catch {
      target = undefined // a dangling or looping link
    }
    const regular = Boolean(target?.isFile())
    if (entry && !regular)
      report.notes.push({ part: slug, note: `${fromSrc} is ${target ? 'not a regular file' : 'a broken symlink'}; the part is read from the site` })
    partFiles[slug] =
      regular
        ? readFileSync(fromSrc, 'utf8')
        : opts.dryRun
          ? ''
          : wp.phpEval(`$t=get_block_file_template("${opts.theme}//${slug}","wp_template_part");echo $t?$t->content:"";`)
  }
  const mega = megaLabels(partFiles.header)
  const menus = withoutMegaItems(spec.menus.menus, mega, defaultLocale)
  for (const m of spec.menus.menus) {
    const kept = menus.find((x) => x.menutype === m.menutype)
    if (kept && kept.items.length !== m.items.length)
      report.notes.push({ menu: m.menutype, note: `${m.items.length - kept.items.length} top-level item(s) dropped: the header part draws them as a mega-menu block (${mega.join(', ')})` })
  }
  // A menu item on one article (a single-view route that declares `source.articleId`) links that
  // post by id, so WordPress marks it current on the post's own view; a `custom` link to the route
  // only 301s to the permalink and marks nothing.
  const resolvePage = (url) => (pageIds.has(url) ? pageIds.get(url) : articlePostLink(url, spec, postIds, postUrls))
  const unpublished = (menu) => (item, status) =>
    report.notes.push({ menu, page: item.url, note: `menu ${menu}: item "${item.label}" links ${item.url}, a page whose status is ${status}; WordPress drops a link to it by id, so the item is a custom link to ${item.url} (publish the page for a working link)` })
  const navs = {}
  const existingNavs = new Map(
    listPosts(wp, 'wp_navigation').map((p) => [p.post_name.toLowerCase(), p])
  )
  for (const menu of menus) {
    const markup = buildNavigation(menu.items, resolvePage, pageByPath, unpublished(menu.menutype))
    navs[menu.menutype] = batch.add({
      postType: 'wp_navigation',
      have: existingNavs.get(wpPostName(menu.menutype)),
      desired: {
        post_title: menu.title,
        post_name: wpPostName(menu.menutype),
        post_status: 'publish',
        content: markup,
        meta: {}
      },
      kind: 'navigation'
    })
  }
  // Footer columns: the three Joomla footer mod_custom link lists (footnav-1..3), whose headings
  // (Product · Resources · Company) are the footer part's — not tracy-utility, whose published
  // groups are Pages and Account.
  const footerCustoms = (spec.sections.custom ?? [])
    .filter((c) => /^footnav-\d$/.test(c.position))
    .sort((a, b) => a.position.localeCompare(b.position))
  const footerRefs = []
  for (const c of footerCustoms) {
    const heading = /<h3[^>]*>([^<]+)<\/h3>/.exec(c.blocks)?.[1]?.trim() ?? c.position
    // Slug from the POSITION (footnav-1..4), not the heading: a Russian heading slugifies to
    // nothing, two columns then share `tracy-footer`, WordPress suffixes -2, and no later run
    // finds either. The heading stays in the title where a person reads it.
    const slug = `tracy-footer-${c.position.replace(/^footnav-/, '')}${c.locale && c.locale !== 'en' ? `-${c.locale}` : ''}`
    const markup = buildNavigation(footerLinks(c.blocks), resolvePage, pageByPath, unpublished(slug))
    navs[slug] = batch.add({
      postType: 'wp_navigation',
      have: existingNavs.get(slug),
      desired: {
        post_title: `Footer — ${heading}`,
        post_name: slug,
        post_status: 'publish',
        content: markup,
        meta: {}
      },
      kind: 'navigation'
    })
    footerRefs.push(navs[slug])
  }
  batch.flush()
  for (const k of Object.keys(navs)) navs[k] = navs[k].id
  footerRefs.forEach((h, i) => (footerRefs[i] = h.id))
  report.navigation = navs

  // 8. Template part overrides: the theme's part files with their navigation refs filled and their
  // images resolved against the media imported in step 2 of this same run (resolvePartMedia). A
  // part is one per site, so its named blocks (`nav.<menutype>`) read the menus of the site's
  // default locale; another locale's twin (`<menutype>-<lang>`, seeded above from the spec's
  // `locale` menus) is swapped in by the theme at render time (wp-tracy-business inc/extra.php,
  // on pll_current_language) — Polylang gives wp_navigation posts no language of their own.
  const named = namedNavigationRefs(menus, navs, defaultLocale)
  // A part is on every page: its images resolve against the modules on every page, then the spec's table.
  const partTables = [(spec.sections.custom ?? []).filter((c) => (c.pages ?? []).includes('ALL')).flatMap((c) => c.images ?? [])]
  const existingParts = listPosts(wp, 'wp_template_part')
  for (const [slug, refs, title] of [
    ['header', [navs.tracy], 'Header'],
    ['footer', footerRefs, 'Footer']
  ]) {
    const file = partFiles[slug]
    if (!file) {
      report.notes.push({ part: slug, note: 'theme part file not found; override not written' })
      continue
    }
    const missing = []
    // The part's own copy (a footer's legal line) is typeset like content: its middle dots and
    // "No. 214" wrap the same way.
    const imageNotes = []
    const content = typeset(
      resolvePartMedia(fillNavigationRefs(file, refs, named, missing), (ref) => media(ref, partTables, { part: slug }), { theme: opts.theme, notes: imageNotes })
    )
    for (const menutype of missing)
      report.notes.push({ part: slug, note: `navigation block named nav.${menutype}: no menu of that menutype in menus.json${defaultLocale ? ` for locale ${defaultLocale}` : ''}; ref left unset` })
    // A reference resolveMedia already explained (an ambiguous name) is not noted twice.
    for (const n of imageNotes)
      if (!report.notes.some((r) => r.part === slug && n.image !== undefined && r.image === n.image)) report.notes.push({ part: slug, ...n })
    const have = existingParts.find((p) => p.post_name === slug)
    report.templateParts[slug] = batch.add({
      postType: 'wp_template_part',
      have,
      desired: { post_title: title, post_name: slug, post_status: 'publish', content, meta: {} },
      kind: 'templateParts',
      // On a create only, as before: the part belongs to the theme and to its area.
      terms: { wp_theme: opts.theme, wp_template_part_area: slug }
    })
  }
  batch.flush()
  for (const k of Object.keys(report.templateParts)) report.templateParts[k] = report.templateParts[k].id

  // 9. Options.
  const home = pageIds.get('/')
  setOption(wp, 'show_on_front', 'page', report)
  if (home) setOption(wp, 'page_on_front', String(home.id), report)
  setOption(wp, 'blogname', spec.content.site.name, report)
  // A source with no tagline leaves it empty (WordPress's "Just another WordPress site" is not the source's); an undefined value never settled, so every repeat run updated it.
  setOption(wp, 'blogdescription', spec.content.site.tagline ?? '', report)
  const posts = postsPage(spec.pagemap.pages, defaultLocale)
  const postsId = posts ? pageIds.get(posts.path)?.id : null
  if (postsId) setOption(wp, 'page_for_posts', String(postsId), report)
  else
    report.notes.push({
      option: 'page_for_posts',
      note: posts
        ? `page ${posts.path} (view home) was not seeded; page_for_posts left unset`
        : 'no page with view home in the page-map; page_for_posts left unset'
    })

  // The 404 template reads the source's own "not found" page (a draft) through this option; a
  // theme without the hook ignores it.
  const notFoundId = notFound ? (pageIds.get(notFound.path)?.id ?? notFoundHandle?.id) : null
  if (notFoundId) setOption(wp, notFoundOption(opts.theme), String(notFoundId), report)

  // 10. Redirects: the option the theme's template_redirect hook reads.
  const rules = spec.redirects.rules.map((r) => ({ from: r.from, to: r.to, status: r.status ?? 301 }))
  rules.push(...singleViewRules(spec.pagemap.pages, spec.content.posts, postUrls, rules, report.notes, patternsMap.views ?? {}))
  rules.push(...searchViewRules(spec.pagemap.pages, rules, report.notes, patternsMap.views ?? {}))
  setOption(wp, redirectsOption(opts.theme), JSON.stringify(rules), report, true)
  report.redirects = rules
  // The rules are served by a must-use plugin, not by the theme: the base theme has no hook for them.
  if (rules.length) {
    const plugin = installMuPlugin(wp, report, REDIRECTS_PLUGIN, 'redirects')
    // Rules the source declared stop the seed when unserved; the ones the seeder derived from menu routes are noted (installMuPlugin) and the seed goes on.
    if (plugin.action === 'failed' && spec.redirects.rules.length) throw new Error(`seed: redirects: the must-use plugin ${REDIRECTS_PLUGIN.file} that serves the ${rules.length} rule(s) could not be written; they stay in ${redirectsOption(opts.theme)} unserved`)
    setOption(wp, REDIRECTS_OPTION_NAME, redirectsOption(opts.theme), report)
    report.redirectsPlugin = plugin
  }
  // 10a. Pages on the site the spec no longer seeds, and published pages at a redirect's path (a
  // redirect runs only where WordPress answers 404). Reported, never changed: a page keeps its id,
  // status and content until a person decides (JA Vega M6-2: the old /blog-detail page stayed
  // published over the redirect to the post that replaced it).
  if (opts.dryRun) report.pageAudit = { ok: null, skipped: 'dry run' }
  else {
    const seededIds = new Set([...pageHandles.map((h) => h.id), notFoundHandle?.id].filter(Boolean).map(Number))
    report.pageAudit = auditPages(wp, { seededIds, rules, fingerprintOf: batch.fingerprintOf })
    if (!report.pageAudit.ok) log(`seed: page audit could not read the site's pages: ${report.pageAudit.error}`)
    for (const r of report.pageAudit.obsolete) {
      const line = `page #${r.id} ${r.path ?? '(path unknown)'} (${r.status}) was seeded by an earlier run and this spec no longer has it; left as it is — trash it, draft it or keep it`
      log(`seed: OBSOLETE PAGE — ${line}`)
      report.notes.push({ page: r.path, id: r.id, note: line })
    }
    for (const r of report.pageAudit.shadowing) {
      const line = `page #${r.id} ${r.path} (${r.status}${r.seeded ? ', seeded by an earlier run' : ', not seeded by this tool'}) answers the path, so the redirect to ${r.redirect} never runs (it fires on a 404 only); draft or trash the page, or drop the rule`
      log(`seed: REDIRECT SHADOWED — ${line}`)
      report.notes.push({ page: r.path, id: r.id, note: line })
    }
  }

  // 11. Routes. A listing route of the page-map (a category, an archive) that this seeder answers
  // with a published page — the archive page holding the query block, or a spec page at that
  // path — is served as a page, and the report says so for the visual contract's identity check.
  // The posts index (view home) and the search draft are not: WordPress serves those as listings.
  const seededPage = new Map(pages.filter((p) => p.path).map((p) => [p.path, p]))
  const servedAsPage = new Set(
    spec.pagemap.pages
      .filter((p) => LISTING_VIEWS.includes(p.view) && seededPage.has(p.path) && seededPage.get(p.path).status !== 'draft')
      .map((p) => p.path)
  )
  if (opts.routes && !opts.dryRun) {
    const targets = [
      ...routeTargets(spec.pagemap.pages, pageIds, { i18n: opts.i18n, defaultLocale, views: patternsMap.views ?? {}, servedAsPage }),
      ...rules.map((r) => ({ path: r.from, expect: r.status, to: r.to })),
      { path: '/this-page-does-not-exist', expect: 404 }
    ]
    const strip = (u) => (u ?? '').replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '') || '/'
    for (const t of targets) {
      if (Date.now() > deadline) throw new TimeoutError(`seed: timed out after ${opts.timeout} s (at route ${t.path})`)
      const signal = AbortSignal.timeout(Math.max(1, Math.min(60_000, deadline - Date.now())))
      // WordPress answers a slashless permalink with its own 301 to the trailing-slash form (the
      // permalink structure is /%postname%/); that canonical hop is followed once and recorded, the
      // status after it is the one judged.
      let res = await fetchImpl(opts.baseUrl + t.path, { redirect: 'manual', signal }).catch((e) => ({
        status: 0,
        headers: new Map(),
        error: e.message
      }))
      let canonical = null
      if (res.status === 301 && strip(res.headers.get('location')) === strip(t.path) && t.path !== '/') {
        canonical = res.headers.get('location')
        res = await fetchImpl(canonical, { redirect: 'manual', signal }).catch((e) => ({
          status: 0,
          headers: new Map(),
          error: e.message
        }))
      }
      const status = res.status
      const location = res.headers?.get?.('location') ?? null
      const ok =
        String(t.expect).split('|').includes(String(status)) && (!t.to || strip(location) === strip(t.to))
      const taken = (report.mediaRoutes?.collisions ?? []).find((c) => c.route === t.path.replace(/\/$/, ''))
      report.routes.push({
        ...(taken ? { cause: `attachment ${taken.attachment} (${taken.source ?? 'source unknown'}) has the slug "${taken.slug}"` } : {}),
        path: t.path,
        ...(t.pagemapPath ? { pagemapPath: t.pagemapPath } : {}),
        ...(t.served ? { served: t.served } : {}),
        status,
        location,
        canonical,
        expect: t.expect,
        ok
      })
    }
  }
  report.media = { files: Object.keys(mediaIndex.files).length, imported: report.media.imported ?? 0 }
  if (unknownTokens.size)
    report.notes.push({
      tokens: [...unknownTokens],
      note: 'OpenDesign --brand-* variables with no theme token; left as written'
    })
  report.finishedAt = new Date().toISOString()
  report.wpCalls = wp.calls.length
  if (wp.container) report.wpContainer = wp.container
  writeFileSync(opts.report, JSON.stringify(report, null, 2) + '\n')
  const summary = Object.entries(report.counts)
    .map(([k, v]) => `${k} +${v.created} ~${v.updated} =${v.skipped}`)
    .join(' · ')
  const kinds = (pred) => report.sections.filter(pred).length
  const sectionsLine =
    `sections ${report.sections.length} (${kinds((s) => s.kind === 'typed')} typed, ` +
    `${kinds((s) => s.kind === 'html')} html, ${kinds((s) => s.via === 'coverage')} fell back for coverage, ` +
    `${kinds((s) => s.kind === 'fallback')} fallback)`
  log(
    `seed: ${summary} · unresolved seed results ${report.unresolvedSeedResults.length} · media ${report.media.files}${mediaRoutesLine(report.mediaRoutes)} · ${sectionsLine} · inline colours ${report.inlineColors.reduce((n, c) => n + c.replaced, 0)} → preset, ${report.inlineColors.reduce((n, c) => n + c.kept, 0)} kept · routes ${report.routes.filter((r) => r.ok).length}/${report.routes.length} ok${report.theme ? ` · theme ${report.theme.rebuilt ? 'installed' : 'unchanged'}` : ''} · ${wp.calls.length} wp calls`
  )
  log(`report: ${opts.report}`)
  wp.dispose?.()
  return report
}

/** Plain text of the blocks before `<!-- wp:more -->`, or '' when the post has no read-more. */
export function introText(content) {
  const i = String(content ?? '').indexOf('<!-- wp:more -->')
  if (i < 0) return ''
  return stripTags(
    String(content)
      .slice(0, i)
      .replace(/<!--[^]*?-->/g, '')
  )
}

// Block-level tags separate words; inline ones (a strong, a link) do not.
const stripTags = (html) =>
  html
    .replace(/<\/?(?:p|div|li|ul|ol|h[1-6]|br|section|figure|figcaption|blockquote|tr|td|th)\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * The template a post declares (`post.meta._wp_page_template`): a post that the source opens as a
 * page of its own (a menu item on one article, with modules of its own around it) stays a post —
 * in its category and its listings — and renders through that template. WordPress resolves a
 * post's `_wp_page_template` before `single` (get_single_template). Only a declared one: a post
 * has no page-map layout to derive one from. A name the theme does not have is noted and left
 * out, as it is for a page — the post renders on `single`.
 */
export function postTemplate(post, knownTemplates, report = null, eligibility = null) {
  const explicit = post.meta?._wp_page_template
  if (explicit === undefined || explicit === null || explicit === '') return undefined
  if (typeof explicit === 'string' && (knownTemplates.has(explicit) || eligibility?.forPost?.has(explicit))) return explicit
  report?.notes.push({ post: post.slug, note: `template ${JSON.stringify(explicit)} does not exist in the theme; the post renders on single` })
  return undefined
}

/** The template a post declares (`meta._wp_page_template`), or undefined when it declares none. */
function declaredTemplate(post) {
  const t = post?.meta?._wp_page_template
  return t === undefined || t === null || t === '' ? undefined : t
}

/** A template slug as a theme names one (`templates/<slug>.html`): a non-empty string of letters, digits, `_`, `-`, `.`, `/`. */
const isTemplateSlug = (v) => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(v)
/** A post type key (sanitize_key): lower-case letters, digits, `_` and `-`. */
const isPostTypeKey = (v) => typeof v === 'string' && /^[a-z0-9_-]{1,20}$/.test(v)

/**
 * Which templates the theme accepts for a POST: `{ known: true, from, byName: Map<slug, post
 * types>, forPost: Set<slug> }`, or `{ known: false, reason }`. WordPress checks a post's
 * `page_template` against WP_Theme::get_post_templates() — a block theme's custom templates
 * (theme.json `customTemplates`, whose `postTypes` default to `["page"]`) filtered by post type —
 * and refuses the update of a post whose template is not there ("Invalid page template."). Read
 * from the built theme's theme.json when `themeSrc` is given — runSeed passes it only for the
 * theme it is about to install (`--theme-src` with `--dist`), before the install — else asked of
 * the site. A file that is missing, not a regular file or not valid is `known: false`: an
 * eligibility that cannot be read is never taken as permission.
 */
export function postTemplateEligibility({ themeSrc = null, theme = null, wp = null } = {}) {
  const result = (byName, from) => ({ known: true, from, byName, forPost: new Set([...byName].filter(([, types]) => types.includes('post')).map(([name]) => name)) })
  if (themeSrc && theme) {
    const file = join(themeSrc, 'src', theme, 'theme.json')
    let st
    try {
      st = lstatSync(file)
    } catch {
      return { known: false, reason: `${file} does not exist` }
    }
    if (!st.isFile()) return { known: false, reason: `${file} is not a regular file` }
    let json
    try {
      json = JSON.parse(readFileSync(file, 'utf8'))
    } catch (e) {
      return { known: false, reason: `${file}: ${e.message}` }
    }
    const list = json?.customTemplates ?? []
    if (!Array.isArray(list)) return { known: false, reason: `${file}: customTemplates must be a list` }
    const byName = new Map()
    for (const t of list) {
      if (!isTemplateSlug(t?.name)) return { known: false, reason: `${file}: a customTemplates entry has no template slug for a name (${JSON.stringify(t?.name ?? null)})` }
      if (byName.has(t.name)) return { known: false, reason: `${file}: customTemplates names ${t.name} twice` }
      const types = t.postTypes === undefined ? ['page'] : t.postTypes
      if (!Array.isArray(types) || !types.every(isPostTypeKey)) return { known: false, reason: `${file}: customTemplates ${t.name}: postTypes must be a list of post type names` }
      byName.set(t.name, types)
    }
    return result(byName, file)
  }
  if (!wp || wp.dryRun) return { known: false, reason: 'no --theme-src and no site to ask' }
  let answer
  try {
    answer = JSON.parse(wp.phpEval('echo wp_json_encode(array_map(function($t){return array_keys($t);}, wp_get_theme()->get_post_templates()));'))
  } catch (e) {
    return { known: false, reason: `the site did not answer (${String(e.message).split('\n')[0]})` }
  }
  // An empty PHP array encodes as [] — no template for any type.
  if (Array.isArray(answer) && !answer.length) answer = {}
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return { known: false, reason: 'the site answered something that is not a list of templates per post type' }
  const byName = new Map()
  // Every element exactly as WordPress names a template: a slug string. `[null]` or `[3]` is a
  // malformed answer, not a template called "null" — String() would make it eligibility.
  for (const [type, slugs] of Object.entries(answer)) {
    if (!isPostTypeKey(type)) return { known: false, reason: `the site answered ${JSON.stringify(type)} for a post type` }
    if (!Array.isArray(slugs)) return { known: false, reason: `the site's templates for ${type} are not a list` }
    const bad = slugs.find((slug) => !isTemplateSlug(slug))
    if (bad !== undefined || new Set(slugs).size !== slugs.length)
      return { known: false, reason: `the site's templates for ${type} are not a list of distinct template slugs (${JSON.stringify(bad ?? slugs)})` }
    for (const slug of slugs) byName.set(slug, [...(byName.get(slug) ?? []), type])
  }
  return result(byName, 'the site (WP_Theme::get_post_templates)')
}

/**
 * Every post that names a template the theme has must name one it accepts for posts — checked
 * before anything is written. A name the theme does not have at all is postTemplate's note (the
 * post renders on `single`, as documented). One the theme declares for other post types only, or
 * has as a file without declaring it (not a custom template: WordPress lists none such for a
 * post), is an error that says what to declare. When the eligibility could not be read, a dry run
 * notes it and a real one stops: the post would be created and its first update would fail.
 */
function checkPostTemplates(posts, knownTemplates, eligibility, report = null, { dryRun = false, site = false } = {}) {
  const problems = []
  for (const post of posts ?? []) {
    const t = declaredTemplate(post)
    if (t === undefined) continue
    if (typeof t !== 'string') {
      problems.push(`post ${post.slug}: meta._wp_page_template must be a template slug; got ${JSON.stringify(t)}`)
      continue
    }
    if (!eligibility?.known) {
      const line = `post ${post.slug}: which post types template "${t}" accepts could not be read (${eligibility?.reason ?? 'not asked'}); declare it in the theme's customTemplates with "postTypes": [ …, "post" ] and seed with --theme-src, or let the site answer`
      if (dryRun) report?.notes.push({ post: post.slug, note: line })
      else problems.push(line)
      continue
    }
    if (eligibility.forPost.has(t)) continue
    const types = eligibility.byName.get(t)
    if (types) problems.push(`post ${post.slug}: template "${t}" — the theme declares it for ${types.join(', ') || 'no post type'} only, not for posts; WordPress refuses the post's next update ("Invalid page template."). Add "post" to its customTemplates postTypes (theme.overlay.json) and rebuild`)
    else if (knownTemplates.has(t)) problems.push(`post ${post.slug}: template "${t}" is a file of the theme but not in its customTemplates, so WordPress offers it to no post; declare it with "postTypes": [ …, "post" ] (theme.overlay.json) and rebuild`)
  }
  // `site`: the confirmation after the install — the theme is on the site, but no content is written yet.
  if (problems.length) throw new Error(`seed: post template(s) the theme does not accept for posts (${eligibility?.from ?? 'eligibility unknown'}) — ${site ? 'the theme was installed, no content was written' : 'nothing was written'}:\n  ${problems.join('\n  ')}`)
  if (report && eligibility?.known) report.templates = { ...(report.templates ?? {}), forPosts: [...eligibility.forPost].sort(), eligibilityFrom: eligibility.from }
}

/** A post meta key the spec may declare: a plain lower-case name — never protected (`_…`) and never the seeder's own (`tracy_…`). */
const META_KEY = /^[a-z][a-z0-9_-]{0,63}$/

/**
 * `posts[].tags`, checked for every post before anything is written: absent, or a list of tag
 * names — non-empty strings. Anything else (a string, a number, an empty name) stops the seed with
 * the post named: a list of the wrong shape is not read as "no tags".
 */
export function checkPostTags(posts, kind = 'post') {
  const problems = []
  for (const post of posts ?? []) {
    if (post.tags === undefined) continue
    if (!Array.isArray(post.tags)) problems.push(`${kind} ${post.slug}: tags must be a list of tag names; got ${JSON.stringify(post.tags)}`)
    else for (const t of post.tags) if (typeof t !== 'string' || !t.trim()) problems.push(`${kind} ${post.slug}: tag ${JSON.stringify(t)} is not a tag name`)
  }
  if (problems.length) throw new Error(`seed: ${kind}s[].tags —\n  ${problems.join('\n  ')}`)
}

/**
 * The `tags_input` WordPress takes: the names once each (the first spelling of a name kept, as
 * WordPress keeps one tag per name), in the order given — the order the terms are created in, and
 * the theme lists a post's tags by term id. A comma-joined string, as it always was, unless a name
 * holds a comma: WordPress splits the string on commas, so that post's names go as a list.
 */
export function tagsInput(names) {
  const out = []
  const seen = new Set()
  for (const n of names) {
    const key = n.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(n)
  }
  return out.some((n) => n.includes(',')) ? out : out.join(',')
}

/**
 * The meta each post declares beyond its template (`posts[].meta`, from-joomla `--article-fields`
 * `{ "meta": "<key>" }`): `{ keys, byPost: Map<post, {key: text}> }`, checked for every post before
 * anything is written. A key must be a plain lower-case name that WordPress does not protect (a
 * leading underscore hides it from the editor and from Block Bindings) and that is not the
 * seeder's own (`tracy_*`: the TOC, the page heading); a value must be text — a string, a number or
 * a boolean, written as a string. Anything else stops the seed with the post and key named.
 */
function checkPostMeta(posts) {
  const problems = []
  const byPost = new Map()
  const keys = new Set()
  for (const post of posts ?? []) {
    const meta = post.meta
    if (meta === undefined || meta === null) continue
    if (typeof meta !== 'object' || Array.isArray(meta)) {
      problems.push(`post ${post.slug}: meta must be an object of key → text; got ${JSON.stringify(meta)}`)
      continue
    }
    const own = {}
    for (const [key, value] of Object.entries(meta)) {
      if (key === '_wp_page_template') continue
      if (key.startsWith('_')) problems.push(`post ${post.slug}: meta key "${key}" is protected (a leading underscore): WordPress keeps it from the editor and Block Bindings; name it without one`)
      else if (key.startsWith('tracy_')) problems.push(`post ${post.slug}: meta key "${key}" is the seeder's own (tracy_*); name the field otherwise`)
      else if (!META_KEY.test(key)) problems.push(`post ${post.slug}: meta key "${key}" is not a lower-case name ([a-z][a-z0-9_-], at most 64 characters)`)
      else if (!['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value)))
        problems.push(`post ${post.slug}: meta "${key}" must be text (a string, number or boolean); got ${JSON.stringify(value)}`)
      else {
        own[key] = String(value)
        keys.add(key)
      }
    }
    if (Object.keys(own).length) byPost.set(post, own)
  }
  if (problems.length) throw new Error(`seed: post meta the seeder cannot write — nothing was written:\n  ${problems.join('\n  ')}`)
  return { keys: [...keys].sort(), byPost }
}

/**
 * The site's pages against this run: `{ ok, checked, obsolete, shadowing }` — `obsolete`, pages an
 * earlier seed wrote (they carry its `_tracy_seed` fingerprint) that this run did not seed;
 * `shadowing`, published pages at the path of a redirect rule, which WordPress then serves instead
 * of the 404 the redirect waits for. Each row: `{ id, path, status, seeded, fingerprint?, redirect? }`.
 * Read only; a list that cannot be read is `ok: false` with `error`, never an empty audit.
 */
export function auditPages(wp, { seededIds = new Set(), rules = [], fingerprintOf = () => null } = {}) {
  let rows
  try {
    rows = wp.json(['post', 'list', '--post_type=page', '--post_status=any', '--posts_per_page=-1', '--fields=ID,post_name,post_status,post_parent'], { mutate: false })
  } catch (e) {
    return { ok: false, error: String(e.message).split('\n')[0], obsolete: [], shadowing: [] }
  }
  if (!Array.isArray(rows)) return { ok: false, error: 'the page list is not a list', obsolete: [], shadowing: [] }
  const byId = new Map(rows.map((r) => [Number(r.ID), r]))
  // The path WordPress serves a page at: its slug under its parents'. A parent the list does not
  // hold (or a loop) leaves the path unknown.
  const pathOf = (r) => {
    const segs = []
    const seen = new Set()
    for (let cur = r; cur; cur = Number(cur.post_parent) ? byId.get(Number(cur.post_parent)) : null) {
      if (seen.has(Number(cur.ID))) return null
      seen.add(Number(cur.ID))
      segs.unshift(cur.post_name)
      if (Number(cur.post_parent) && !byId.has(Number(cur.post_parent))) return null
    }
    return `/${segs.join('/')}`
  }
  const norm = (p) => String(p ?? '').replace(/\/+$/, '').toLowerCase() || '/'
  const redirects = new Map(rules.filter((r) => r?.from).map((r) => [norm(r.from), r.to]))
  const obsolete = []
  const shadowing = []
  for (const r of rows) {
    const id = Number(r.ID)
    const fingerprint = fingerprintOf(id)
    const path = pathOf(r)
    if (fingerprint && !seededIds.has(id) && r.post_status !== 'trash') obsolete.push({ id, path, status: r.post_status ?? null, seeded: true, fingerprint })
    if (path && r.post_status === 'publish' && redirects.has(norm(path))) shadowing.push({ id, path, status: r.post_status, seeded: Boolean(fingerprint), redirect: redirects.get(norm(path)) })
  }
  return { ok: true, checked: rows.length, obsolete, shadowing }
}

/** Templates every Tracy theme ships; a page may name them without the theme being readable. */
export const BASE_TEMPLATES = Object.freeze(['page-landing', 'page-onepage', 'page-no-sidebar', 'page-sidebar-left', 'landing'])
export const NO_TITLE_PAGE_TEMPLATE = 'page-no-title'
const NO_TITLE_TEMPLATE_MARKER = '<!-- tracy-generated: page-no-title -->\n'
const NO_TITLE_TEMPLATE_ENTRY = Object.freeze({ name: NO_TITLE_PAGE_TEMPLATE, title: 'Page without title', postTypes: ['page'] })

function noTitlePageTemplateContent(templatesDir, { required = false } = {}) {
  const pagePath = join(templatesDir, 'page.html')
  let blocks
  try {
    blocks = parseBlocks(readFileSync(pagePath, 'utf8'))
  } catch (e) {
    if (!required) return null
    throw new Error(`${pagePath}: cannot build ${NO_TITLE_PAGE_TEMPLATE}: ${e.message}`)
  }
  const titles = findAll(blocks, (block) => block.name === 'core/post-title')
  if (!titles.length) {
    if (required) throw new Error(`${pagePath}: cannot build ${NO_TITLE_PAGE_TEMPLATE}: no core/post-title block`)
    return null
  }
  for (const title of titles) removeBlock(blocks, title)
  return `${NO_TITLE_TEMPLATE_MARKER}${serializeBlocks(blocks)}`
}

/** Build a page template from the generated theme's page.html, removing every core/post-title block. */
export function generateNoTitlePageTemplate({ themeSrc, theme, needed, report }) {
  const themeDir = join(themeSrc, 'src', theme)
  const templatesDir = join(themeDir, 'templates')
  const templatePath = join(templatesDir, `${NO_TITLE_PAGE_TEMPLATE}.html`)
  const themeJsonPath = join(themeDir, 'theme.json')
  let themeJson
  try {
    themeJson = JSON.parse(readFileSync(themeJsonPath, 'utf8'))
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error(`${themeJsonPath}: theme.json does not exist`)
    throw new Error(`${themeJsonPath}: cannot read theme.json: ${e.message}`)
  }
  const customTemplates = themeJson.customTemplates ?? []
  if (!Array.isArray(customTemplates)) throw new Error(`${themeJsonPath}: customTemplates must be a list`)
  const existing = customTemplates.find((entry) => entry?.name === NO_TITLE_PAGE_TEMPLATE)
  const ownsEntry = existing !== undefined && JSON.stringify(existing) === JSON.stringify(NO_TITLE_TEMPLATE_ENTRY)
  const present = existsSync(templatePath)
  const generated = needed || present ? noTitlePageTemplateContent(templatesDir, { required: needed && !present }) : null
  const ownsFile = present && generated !== null && readFileSync(templatePath, 'utf8') === generated
  let changed = false

  if (needed) {
    if ((present && !ownsFile) || (existing && !ownsEntry)) {
      report?.notes?.push({ template: NO_TITLE_PAGE_TEMPLATE, note: 'existing page-no-title template and theme.json entry kept; at least one differs from the generated unit' })
      return false
    }
    if (!present) {
      if (generated === null) throw new Error(`${join(templatesDir, 'page.html')}: cannot build ${NO_TITLE_PAGE_TEMPLATE}: no core/post-title block`)
      mkdirSync(templatesDir, { recursive: true })
      writeFileSync(templatePath, generated)
      changed = true
    }
    if (!existing) {
      customTemplates.push({ ...NO_TITLE_TEMPLATE_ENTRY, postTypes: [...NO_TITLE_TEMPLATE_ENTRY.postTypes] })
      themeJson.customTemplates = customTemplates
      writeFileSync(themeJsonPath, `${JSON.stringify(themeJson, null, 2)}\n`)
      changed = true
    }
  } else if (present && ownsFile && (!existing || ownsEntry)) {
    rmSync(templatePath)
    themeJson.customTemplates = customTemplates.filter((entry, index) => index !== customTemplates.indexOf(existing))
    if (!themeJson.customTemplates.length) delete themeJson.customTemplates
    writeFileSync(themeJsonPath, `${JSON.stringify(themeJson, null, 2)}\n`)
    changed = true
  } else if (present || existing) {
    report?.notes?.push({ template: NO_TITLE_PAGE_TEMPLATE, note: 'existing page-no-title template and theme.json entry kept; at least one differs from the generated unit' })
  }
  return changed
}

/** Replace the build's theme zip after changing files in its generated source tree. */
export function zipGeneratedTheme(themeSrc, theme) {
  const sourceDir = join(themeSrc, 'src')
  const distDir = join(themeSrc, 'dist')
  const zip = join(distDir, `${theme}.zip`)
  const staged = join(distDir, `.${theme}-generated.zip`)
  rmSync(staged, { force: true })
  const result = spawnSync('zip', ['-q', '-r', '-X', staged, theme], { cwd: sourceDir, encoding: 'utf8' })
  if (result.status !== 0) {
    rmSync(staged, { force: true })
    throw new Error(`zip generated theme: ${result.stderr || result.stdout}`)
  }
  try {
    copyFileSync(staged, zip)
  } finally {
    rmSync(staged, { force: true })
  }
}

/**
 * The template slugs a page's `_wp_page_template` may name: the base set plus the THEME'S OWN
 * `templates/*.html` — read from the theme source when `--theme-src` is given, else asked of the
 * site (get_block_templates: the theme's files and any customised in the editor).
 *
 * Without this the seeder kept a fixed list of five and dropped every other name the spec set
 * (`page-style-guide`, `page-contact`, `page-email`…): the meta was never written, so the page
 * got its template only when WordPress resolved `page-<slug>.html` BY SLUG — which the default-
 * locale page does (`/style-guide` → page-style-guide.html) and its translation never does
 * (`/ru/стайлгайд-…`). The RU style guide rendered on the default template with the EN one on
 * the right one, and nothing said so (full-2, 15/09: 34 rows on ru-style-guide alone).
 */
export function themeTemplates({ themeSrc = null, theme = null, wp = null, report = null } = {}) {
  const known = new Set(BASE_TEMPLATES)
  const dir = themeSrc && theme ? join(themeSrc, 'src', theme, 'templates') : null
  let from = null
  if (dir && existsSync(dir)) {
    for (const f of readdirSync(dir)) if (f.endsWith('.html')) known.add(f.slice(0, -5))
    from = dir
  } else if (wp && !wp.dryRun) {
    try {
      const slugs = JSON.parse(wp.phpEval('echo json_encode(array_values(array_unique(array_map(fn($t)=>$t->slug,get_block_templates([],"wp_template")))));'))
      if (Array.isArray(slugs)) for (const s of slugs) if (typeof s === 'string') known.add(s)
      from = 'the site (get_block_templates)'
    } catch (e) {
      report?.notes.push({ note: `theme templates not read from the site (${String(e.message).split('\n')[0]}); only the base set is known` })
    }
  } else {
    report?.notes.push({ note: 'theme templates not read (no --theme-src and no site); a page template outside the base set is dropped' })
  }
  if (from && report) report.templates = { from, known: [...known].sort() }
  return known
}

function setOption(wp, key, value, report, json = false, { emptyObjectIsList = false } = {}) {
  const cur = wp.run(['option', 'get', key, ...(json ? ['--format=json'] : [])], {
    allowFail: true,
    mutate: false
  })
  const current = cur.code === 0 ? cur.stdout.trim() : null
  // PHP has one empty value for `{}` and `[]`: `wp option get --format=json` hands back `[]` for the `{}` that was
  // written. Only an option whose empty set is written as `{}` (the pager words) takes the two as one.
  const canon = (v) => {
    const j = safeJson(v)
    return emptyObjectIsList && j === '{}' ? '[]' : j
  }
  const same = json ? canon(current) === canon(value) : current === value
  if (same) {
    report.counts.options ??= { created: 0, updated: 0, skipped: 0 }
    report.counts.options.skipped++
    return
  }
  wp.run(['option', 'update', key, value, ...(json ? ['--format=json'] : [])])
  report.counts.options ??= { created: 0, updated: 0, skipped: 0 }
  report.counts.options[current === null ? 'created' : 'updated']++
}

const safeJson = (s) => {
  try {
    return JSON.stringify(JSON.parse(s))
  } catch {
    return s
  }
}

const mediaRoutesLine = (m) =>
  !m || m.ok === null ? '' : m.ok ? ' (no slug takes a route)' : m.error ? ' (MEDIA/ROUTE CHECK FAILED)' : ` (${m.collisions.length} MEDIA/ROUTE COLLISION${m.collisions.length === 1 ? '' : 'S'})`

/**
 * The site's side of mediaRouteCollisions. Two reads: every attachment of the media index, by id — all
 * of them must come back, since seedMedia has just verified or imported each; and every attachment on
 * the site whose slug is one of the spec's top-level routes, whether this seeder imported it or not.
 * A read that fails, or an id it leaves out, is `ok: false` with `error`, never a clean result.
 */
function checkMediaRoutes(wp, index, routePaths) {
  const sources = new Map(Object.entries(index.files).map(([key, m]) => [Number(m.id), key]))
  const slugs = [
    ...new Set(
      routePaths
        .map((path) => String(path ?? '').split('/').filter(Boolean))
        .filter((segs) => segs.length === 1)
        .map((segs) => wpPostName(segs[0]))
    )
  ]
  const read = (filter) => {
    const res = wp.run(['post', 'list', '--post_type=attachment', filter, '--posts_per_page=-1', '--fields=ID,post_name,post_parent', '--format=json'], {
      mutate: false,
      allowFail: true
    })
    if (res.code !== 0) throw new Error((res.stderr || res.stdout || `exit ${res.code}`).trim())
    const rows = JSON.parse(res.stdout.trim() || '[]')
    if (!Array.isArray(rows)) throw new Error('not a list')
    return rows
  }
  const rows = new Map()
  try {
    if (sources.size) {
      const own = read(`--post__in=${[...sources.keys()].join(',')}`)
      const back = new Set(own.map((r) => Number(r.ID)))
      const lost = [...sources.keys()].filter((id) => !back.has(id))
      if (lost.length) throw new Error(`the read left out attachment${lost.length === 1 ? '' : 's'} ${lost.join(', ')} of media.json`)
      for (const r of own) rows.set(Number(r.ID), r)
    }
    if (slugs.length) for (const r of read(`--post_name__in=${slugs.join(',')}`)) rows.set(Number(r.ID), r)
  } catch (e) {
    return { ok: false, checked: 0, collisions: [], error: e.message }
  }
  const collisions = mediaRouteCollisions([...rows.values()], sources, routePaths)
  return { ok: collisions.length === 0, checked: rows.size, routeSlugs: slugs.length, collisions }
}

function loadMedia(out) {
  const file = join(out, 'media.json')
  return existsSync(file) ? readJson(file) : { files: {} }
}

/**
 * Lets this one `wp media import` accept svg: the source's own icons are svg, and WordPress refuses the
 * type. The filters live only in the import's own process (wp-cli `--exec`, hooked through
 * `WP_CLI::add_wp_hook` since WordPress is not loaded yet), so the site's upload rules for its users stay
 * WordPress's default. The files are the source's own, not a visitor's upload.
 */
const SVG_IMPORT = [
  "WP_CLI::add_wp_hook('upload_mimes', function ($m) { $m['svg'] = 'image/svg+xml'; return $m; });",
  "WP_CLI::add_wp_hook('wp_check_filetype_and_ext', function ($d, $file, $name) { if (strtolower(pathinfo($name, PATHINFO_EXTENSION)) === 'svg') { $d['ext'] = 'svg'; $d['type'] = 'image/svg+xml'; } return $d; }, 10, 3);"
].join(' ')

/** The `wp media import` call for one batch of wanted images; one carrying an svg accepts svg (SVG_IMPORT). */
export function mediaImportArgs(batch, images) {
  const svg = batch.some((w) => /\.svg$/i.test(w.key))
  return ['media', 'import', ...batch.map((w) => `${images}/${w.key}`), '--porcelain', ...(svg ? [`--exec=${SVG_IMPORT}`] : [])]
}

/**
 * The slugs of the spec's top-level pages — a single-segment route, the first segment of a nested
 * route (the parent WordPress needs for it), the front page's own slug — which an attachment must
 * not take (attachments and top-level pages share one slug space in WordPress). The not-found
 * page's slug is not among them.
 */
export function reservedRouteSlugs(spec) {
  const slugs = new Set()
  const add = (v) => {
    if (v) slugs.add(wpPostName(v))
  }
  const all = [...(spec.pagemap?.pages ?? []), ...(spec.content?.pages ?? []), ...(spec.content?.archives ?? [])]
  const first = (p) => String(p.path ?? '').split('/').filter(Boolean)[0]
  for (const p of all) {
    // The not-found page is a draft the 404 template reads through an option, not a route a visitor
    // asks for: an attachment on its slug is reported by the media/route check (#14 item 8), never renamed.
    if (p.view === '404') continue
    if (first(p)) add(first(p))
    else if (p.path === '/') add(p.slug)
  }
  // localizePages files a front page whose slug a top-level route needs as `<slug>-front`, after the
  // media is imported: that is the front page's final slug, so an attachment must not take it.
  for (const f of all.filter((p) => p.path === '/' && p.slug))
    if (all.some((p) => wpPostName(first(p)) === wpPostName(f.slug))) add(`${wpPostName(f.slug)}-front`)
  return slugs
}

/**
 * The slug an attachment on a route's slug is renamed to: `<slug>-image`, then `-image-2`, … — the first that
 * is no route of the spec (`routes`, a set of slugs) and is held by no post of any type or status on the
 * site (trash holds a slug too). The site is asked; an answer that is not a list stops the seed.
 */
export function freeAttachmentSlug(wp, stored, routes) {
  // Names are asked 20 at a time, further on while every one asked is held (a bound of 50 rounds ends a site that answers "held" to everything).
  let n = 1
  for (let round = 0; round < 50; round++) {
    const candidates = []
    for (; candidates.length < 20; n++) {
      const c = n === 1 ? `${stored}-image` : `${stored}-image-${n}`
      if (!routes.has(c)) candidates.push(c)
    }
    // Query the posts table by candidate name without a post type or status filter. `wp post list
    // --post_type=any` excludes attachments, while a status filter can miss valid attachment states.
    const b64 = Buffer.from(JSON.stringify(candidates)).toString('base64')
    let rows
    try {
      rows = JSON.parse(wp.phpEval(`global $wpdb;$in=json_decode(base64_decode('${b64}'),true);$ph=implode(',',array_fill(0,count($in),'%s'));echo json_encode($wpdb->get_results($wpdb->prepare("SELECT ID,post_name,post_type,post_status FROM {$wpdb->posts} WHERE post_name IN ($ph)",$in),ARRAY_A));`, { mutate: false }))
    } catch (e) {
      throw new Error(`media: the posts holding ${candidates[0]} … could not be read (${String(e.message).split('\n')[0]})`)
    }
    if (!Array.isArray(rows)) throw new Error(`media: the posts holding ${candidates[0]} … were not read as a list`)
    const held = new Set(rows.map((r) => String(r.post_name).toLowerCase()))
    const free = candidates.find((c) => !held.has(c.toLowerCase()))
    if (free) return free
  }
  throw new Error(`media: no free slug among the first 1000 names ${stored}-image … for the attachment on "${stored}"`)
}

/** Import every wanted image once; verify recorded ids still exist; write media.json. */
function seedMedia(wp, wanted, index, opts, report, posts, reserved = new Set()) {
  const known = Object.values(index.files).map((m) => m.id)
  let alive = new Set()
  const slugOf = new Map()
  if (known.length && !opts.dryRun) {
    const rows = wp.json(['post', 'list', '--post_type=attachment', `--post__in=${known.join(',')}`, '--posts_per_page=-1', '--fields=ID,post_name'], { mutate: false })
    if (rows !== null && !Array.isArray(rows)) throw new Error('media: wp post list did not answer a list of attachments')
    for (const r of rows ?? []) {
      alive.add(Number(r.ID))
      slugOf.set(Number(r.ID), r.post_name)
    }
  }
  // Media is imported before the pages, and an attachment shares the slug space with a top-level page: an
  // image called `about-us.jpg` takes the slug the page `/about-us` needs (`about-us-2`). An attachment of
  // the media index on a reserved slug is renamed — a new one at once, a reused one on the run that finds it.
  // One the index does not hold is an editor's: checkMediaRoutes reports it with the rename to make.
  const renameOnRoute = (id, stored, key) => {
    if (!stored || !reserved.has(stored)) return
    const renamed = freeAttachmentSlug(wp, stored, reserved)
    wp.run(['post', 'update', String(id), `--post_name=${renamed}`])
    // The note says what the site holds, not what was asked: WordPress may suffix a name it finds taken.
    const now = wp.json(['post', 'list', '--post_type=attachment', `--post__in=${id}`, '--fields=ID,post_name'], { mutate: false })?.find?.((r) => Number(r.ID) === Number(id))?.post_name
    if (now !== renamed) throw new Error(`media: attachment ${id} was asked to take the slug "${renamed}" (it holds "${stored}", a page route) and the site answers ${JSON.stringify(now ?? null)}; rename it in WordPress and seed again`)
    report.notes.push({ image: key, note: `attachment ${id} took the slug "${stored}" of a page route; renamed "${renamed}" so the page keeps its slug` })
  }
  for (const w of wanted) {
    const id = index.files[w.key]?.id
    if (id !== undefined && alive.has(id)) {
      renameOnRoute(id, slugOf.get(id), w.key)
      slugOf.delete(id)
    }
  }
  const missing = wanted.filter((w) => !index.files[w.key] || !alive.has(index.files[w.key].id))
  const importable = missing.filter((w) => !opts.imagesLocal || existsSync(join(opts.imagesLocal, w.key)))
  for (const w of missing.filter((w) => !importable.includes(w)))
    report.notes.push({ image: w.key, note: 'not in the source image tree; not imported' })
  let imported = 0
  for (let i = 0; i < importable.length; i += 20) {
    const batch = importable.slice(i, i + 20)
    if (opts.dryRun) {
      wp.run(mediaImportArgs(batch, opts.images))
      continue
    }
    const ids = wp
      .out(mediaImportArgs(batch, opts.images))
      .split(/\s+/)
      .filter(Boolean)
      .map(Number)
    if (ids.length !== batch.length)
      throw new Error(`media import: expected ${batch.length} ids, got ${ids.length}`)
    const rows =
      wp.json(
        [
          'post',
          'list',
          '--post_type=attachment',
          `--post__in=${ids.join(',')}`,
          '--fields=ID,guid,post_name'
        ],
        { mutate: false }
      ) ?? []
    const guid = new Map(rows.map((r) => [Number(r.ID), r.guid]))
    batch.forEach((w, k) => {
      const id = ids[k]
      const url = (guid.get(id) ?? '').replace(/^https?:\/\/[^/]+/, '')
      renameOnRoute(id, rows.find((r) => Number(r.ID) === id)?.post_name, w.key)
      index.files[w.key] = { id, url, file: basename(w.key) }
      if (w.alt) posts.addMeta(id, { _wp_attachment_image_alt: w.alt })
      imported++
    })
  }
  posts.flush()
  report.media.imported = imported
  writeFileSync(join(opts.out, 'media.json'), JSON.stringify(index, null, 2) + '\n')
}

/** One Contact Form 7 form "Contact" (name, email, message), meta shaped like the plugin's own default. */
/** The generic form, for a spec whose source has no form of its own. */
const GENERIC_FORM = {
  form: [
    '<label> Your name\n    [text* your-name autocomplete:name] </label>',
    '<label> Your email\n    [email* your-email autocomplete:email] </label>',
    '<label> Your message\n    [textarea* your-message] </label>',
    '<label> Privacy Note\n    [acceptance privacy-note] By submitting this form you agree to the Privacy Policy of this website and the storing of the submitted information. [/acceptance] </label>',
    '[submit "Send"]'
  ].join('\n\n'),
  mailBody: 'From: [your-name] [your-email]\n\nMessage Body:\n[your-message]\n\n-- \nThis is a notification that a contact form was submitted on your website ([_site_title] [_site_url]).',
  replyTo: 'Reply-To: [your-email]'
}

/** A subscribe box: an email-shaped input, alone or beside other fields, and a button that says subscribe. */
const SUBSCRIBE_RE = /subscribe|sign ?up|подпис|abonn|suscrib/i
const isSubscribeForm = (read) => read?.fields.some((field) => field.kind === 'email') && SUBSCRIBE_RE.test(read.submit ?? '')

/**
 * The forms the spec's source draws, one per locale: the `form` section on the contact page
 * (else the locale's first form section with a control) read by `sourceForm`, as a CF7 form
 * (`kind: 'contact'`) — and the newsletter form (`kind: 'newsletter'`, title "Newsletter"),
 * from the source's subscribe box: any section whose controls are one email field and a
 * Subscribe button, the one on a `page-newsletter` page first. The news sidebar draws that box
 * beside a search field, so a section with two controls is not it. The theme's sidebar part
 * calls `[contact-form-7 title="Newsletter"]` and prints "Contact form not found" until the
 * form exists — fail-loud, on purpose. `[{ locale, key, title, kind, form, fields, text,
 * section }]`; empty when no section has a control.
 */
export function specForms(spec, { defaultLocale = null } = {}) {
  const viewOf = new Map((spec.content?.pages ?? []).map((p) => [p.path, p.view]))
  const onView = (s, view) => (s.pages ?? []).some((p) => viewOf.get(p.wpPath ?? p.path) === view)
  const sections = (spec.sections?.custom ?? []).filter((s) => s.html)
  const suffixOf = (locale) => (locale && locale !== defaultLocale ? `-${locale}` : '')
  const byLocale = new Map()
  for (const s of sections.filter((x) => x.sectionType === 'form')) {
    const locale = s.locale ?? defaultLocale ?? null
    const onContact = onView(s, 'page-contact')
    const have = byLocale.get(locale)
    if (have && (have.onContact || !onContact)) continue
    const read = sourceForm(s.html)
    if (!read?.fields.length || isSubscribeForm(read)) continue
    byLocale.set(locale, { locale, onContact, read, section: s.id })
  }
  const contact = [...byLocale.values()].map(({ locale, read, section }) => {
    const { form, fields } = cf7Form(read)
    const suffix = suffixOf(locale)
    return { locale, key: `contact${suffix}`, title: suffix ? `Contact (${locale})` : 'Contact', kind: 'contact', form, fields, text: cf7FormText(form), section }
  })
  const subscribe = new Map()
  for (const s of sections) {
    const locale = s.locale ?? defaultLocale ?? null
    const onNewsletter = onView(s, 'page-newsletter')
    const have = subscribe.get(locale)
    if (have && (have.onNewsletter || !onNewsletter)) continue
    const read = sourceForm(s.html)
    if (!isSubscribeForm(read)) continue
    subscribe.set(locale, { locale, onNewsletter, read, section: s.id })
  }
  const newsletter = [...subscribe.values()].map(({ locale, read, section }) => {
    // The one field of a subscribe box is what the form is for: required, whatever the source marked.
    // A box with more fields keeps each field as the source marked it.
    const { form, fields } = cf7Form(read.fields.length === 1 ? { ...read, fields: read.fields.map((f) => ({ ...f, required: true })) } : read)
    const suffix = suffixOf(locale)
    return { locale, key: `newsletter${suffix}`, title: suffix ? `Newsletter (${locale})` : 'Newsletter', kind: 'newsletter', form, fields, text: cf7FormText(form), section }
  })
  return [...contact, ...newsletter]
}

const cf7Locale = (locale) => (locale === 'en' || !locale ? 'en_US' : locale === 'ru' ? 'ru_RU' : `${locale}_${locale.toUpperCase()}`)

/** `Map(locale → { id, title, text })` of the CF7 forms seeded; `null` keys the generic form. */
function seedContactForms(wp, report, batch, { forms = [], defaultLocale = null } = {}) {
  const out = new Map()
  const list = forms.length ? forms : [{ locale: null, key: 'contact', title: 'Contact', ...GENERIC_FORM, fields: null, text: '' }]
  if (wp.dryRun) {
    for (const f of list) if ((f.kind ?? 'contact') === 'contact') out.set(f.locale ?? defaultLocale, { id: 0, title: f.title, text: f.text })
    return out
  }
  const plugins = wp.json(['plugin', 'list', '--fields=name,status'], { mutate: false }) ?? []
  const cf7 = plugins.find((p) => p.name === 'contact-form-7')
  if (!cf7) wp.run(['plugin', 'install', 'contact-form-7', '--activate'])
  else if (cf7.status !== 'active') wp.run(['plugin', 'activate', 'contact-form-7'])
  const existing = listPosts(wp, 'wpcf7_contact_form')
  const handles = []
  for (const f of list) {
    const email = f.fields?.find((x) => x.kind === 'email')?.name ?? null
    const from = f.fields ? f.fields.filter((x) => ['text', 'email'].includes(x.kind)).slice(0, 2).map((x) => `[${x.name}]`).join(' ') : null
    handles.push([f, seedContactForm(wp, batch, {
      key: f.key,
      title: f.title,
      form: f.form,
      mailBody: f.fields ? `From: ${from}\n\n${cf7MailBody(f.fields)}` : f.mailBody,
      replyTo: f.fields ? (email ? `Reply-To: [${email}]` : '') : f.replyTo,
      locale: cf7Locale(f.locale),
      existing
    })])
    if (f.section) report.notes.push({ form: f.key, note: `Contact Form 7 form ${f.key} built from section ${f.section}: ${f.fields.map((x) => `${x.kind} ${x.name}`).join(', ')}` })
  }
  batch.flush()
  for (const [f, handle] of handles) if ((f.kind ?? 'contact') === 'contact') out.set(f.locale ?? defaultLocale, { id: handle.id, title: f.title, text: f.text })
  if (!list.some((f) => f.kind === 'newsletter'))
    report.notes.push({
      form: 'newsletter',
      note: 'no section of the spec draws a subscribe box (one email field and a Subscribe button); no newsletter form created — a sidebar calling [contact-form-7 title="Newsletter"] prints "Contact form not found"'
    })
  return out
}

function seedContactForm(wp, batch, { key, title, form, mailBody, replyTo, locale, existing }) {
  const mail = {
    subject: `[_site_title] "${title}"`,
    sender: '[_site_title] <[_site_admin_email]>',
    body: mailBody,
    recipient: '[_site_admin_email]',
    additional_headers: replyTo,
    attachments: '',
    use_html: 0,
    exclude_blank: 0
  }
  const messages = {
    mail_sent_ok: 'Thank you for your message. It has been sent.',
    mail_sent_ng: 'There was an error trying to send your message. Please try again later.',
    validation_error: 'One or more fields have an error. Please check and try again.',
    spam: 'There was an error trying to send your message. Please try again later.',
    accept_terms: 'You must accept the terms and conditions before sending your message.',
    invalid_required: 'Please fill out this field.',
    invalid_too_long: 'This field has a too long input.',
    invalid_too_short: 'This field has a too short input.',
    upload_failed: 'There was an unknown error uploading the file.',
    upload_file_type_invalid: 'You are not allowed to upload files of this type.',
    upload_file_too_large: 'The uploaded file is too large.',
    upload_failed_php_error: 'There was an error uploading the file.'
  }
  const meta = {
    _form: form,
    _mail: mail,
    _messages: messages,
    _additional_settings: '',
    _locale: locale,
    _hash: createHash('sha256').update(`tracy-base:${key}`).digest('hex')
  }
  const have = existing.find((p) => p.post_name === key)
  return batch.add({
    postType: 'wpcf7_contact_form',
    have,
    desired: { post_title: title, post_name: key, post_status: 'publish', content: '', meta },
    kind: 'forms'
  })
}

/** Rebuild the theme zip from the package, copy it to the stand and reinstall it. */
/** `{ "<ns>/<slug>": content }` for every registered pattern whose name starts with one of `prefixes`. */
function loadPatterns(wp, prefixes, report) {
  const list = JSON.stringify([...new Set(prefixes.filter(Boolean))])
  const code = `$n=json_decode('${list.replace(/'/g, "\\'")}');$o=[];foreach(WP_Block_Patterns_Registry::get_instance()->get_all_registered() as $p){foreach($n as $x){if(str_starts_with($p["name"],$x)){$o[$p["name"]]=$p["content"];break;}}}echo json_encode($o);`
  try {
    return JSON.parse(wp.phpEval(code))
  } catch (e) {
    if (!wp.dryRun) throw e
    report.notes.push({ note: `dry run without a site: patterns not read (${String(e.message).split('\n')[0]})` })
    return {}
  }
}

/** `node scripts/build.mjs --target <theme>` in the theme package: dist/<theme>.zip. */
function buildTheme(opts) {
  const build = spawnSync('node', ['scripts/build.mjs', '--target', opts.theme], {
    cwd: opts.themeSrc,
    encoding: 'utf8'
  })
  if (build.status !== 0) throw new Error(`theme build failed: ${build.stderr || build.stdout}`)
}

/**
 * sha256 over a zip's entries — name, size, crc32 — not its bytes: build.mjs rewrites every
 * generated file before zipping, so the bytes carry new mtimes on every build while the content
 * is the same. Two zips with the same files hash the same; one changed byte does not.
 */
export function zipContentHash(zip) {
  const r = spawnSync('unzip', ['-lv', zip], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`unzip -lv ${zip}: ${r.stderr || r.stdout}`)
  const rows = []
  for (const line of r.stdout.split('\n')) {
    const m = /^\s*(\d+)\s+\S+\s+\d+\s+\S+\s+\S+\s+\S+\s+([0-9a-f]{8})\s+(.+?)\s*$/i.exec(line)
    if (m) rows.push(`${m[3]}\t${m[1]}\t${m[2].toLowerCase()}`)
  }
  if (!rows.length) throw new Error(`unzip -lv ${zip}: no entries read`)
  return createHash('sha256').update(rows.sort().join('\n')).digest('hex')
}

/**
 * Rebuild the theme zip from the package, run `beforeInstall` on the built tree, and copy it to the
 * stand; reinstall it only when its content differs from what the previous run installed — `<out>/theme.sha256` (written after a
 * successful install), else the previous `--report`. Measured 14/09: a no-op seed spent its
 * `theme install` on an unchanged zip every run. Delete `<out>/theme.sha256` to force one.
 */
export function rebuildTheme(wp, opts, report, { build = buildTheme, contentHash = zipContentHash, afterBuild = null, beforeInstall = null } = {}) {
  build(opts)
  afterBuild?.()
  // Checks on the built tree (runSeed: the post templates) run before anything reaches the site;
  // one that throws leaves the site as it was.
  beforeInstall?.()
  const built = join(opts.themeSrc, 'dist', `${opts.theme}.zip`)
  const zip = join(opts.dist, `${opts.theme}.zip`)
  mkdirSync(opts.dist, { recursive: true })
  copyFileSync(built, zip)
  const hash = contentHash(zip)
  const shaFile = join(opts.out, 'theme.sha256')
  let previous = existsSync(shaFile) ? readFileSync(shaFile, 'utf8').trim() : null
  if (!previous && opts.report && existsSync(opts.report)) {
    try {
      previous = readJson(opts.report).theme?.hash ?? null
    } catch {
      previous = null
    }
  }
  if (previous === hash) {
    report.theme = { rebuilt: false, reason: `zip content unchanged since the last install (${hash.slice(0, 12)}); delete ${shaFile} to force one`, hash, zip }
    return
  }
  wp.run(['theme', 'install', `/dist/${opts.theme}.zip`, '--force', '--activate'])
  // 🔒 A reinstalled theme does NOT change how the site looks: the design lives in the user
  // global styles post (`wp-global-styles-<slug>`), a snapshot of styles/<id>.json taken when the
  // inspiration was applied, and that snapshot beats theme.json. Measured 14/09 (D7): tokens.css
  // changed, the zip reinstalled, the home page kept the old palette; 15/09: the container
  // moved to 1176 in tokens and every shot still measured 1240. So after every install the
  // inspiration the site wears is applied again — the same id, the new file.
  const worn = wp.run(['option', 'get', 'tracy_inspiration'], { allowFail: true, mutate: false })
  const inspiration = worn.code === 0 ? String(worn.stdout ?? '').trim() : ''
  if (/^[a-z0-9-]+$/.test(inspiration)) {
    const r = wp.run(['eval', `exit(function_exists('tracy_apply_inspiration') && tracy_apply_inspiration(${JSON.stringify(inspiration)}) ? 0 : 1);`], { allowFail: true })
    report.theme = { rebuilt: true, hash, zip, inspiration, globalStylesReapplied: r.code === 0 }
    if (r.code !== 0) console.warn(`seed: tracy_apply_inspiration(${inspiration}) failed after the reinstall — the global styles post still carries the previous design`)
  } else report.theme = { rebuilt: true, hash, zip, inspiration: null, globalStylesReapplied: false }
  if (!wp.dryRun) {
    mkdirSync(opts.out, { recursive: true })
    writeFileSync(shaFile, hash + '\n')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.stack || String(e))
    process.exit(1)
  })
}
