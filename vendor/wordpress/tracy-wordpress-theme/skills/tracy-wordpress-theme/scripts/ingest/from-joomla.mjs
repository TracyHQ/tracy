#!/usr/bin/env node
// from-joomla.mjs — a Joomla quickstart build (inventory.json + render-routes.json + the captured
// template) → a spec-pack that passes `spec-pack.mjs --validate`, plus the content artifacts a
// WordPress seeder needs (content.json · sections.json · menus.json · redirects.json).
//
// What it does: reads the database inventory, classifies every rendered route into a WordPress
// view, splits articles into posts and pages, converts article HTML to block markup, normalises
// the mod_ja_acm module instances, nests the site menus, derives palette/fonts/tokens/design rules
// from the template's etc/*.json and css/styles/<theme>.css — or, without that sheet, from the CSS its
// framework compiles for each template style (resolveDesign) — and writes every spec-pack file.
//
// What it does NOT do: render anything, copy images, or talk to a running site. Image references
// are rewritten to /wp-content/uploads/<basename> and listed so the seeder can upload them.
//
// Usage:
//   node scripts/ingest/from-joomla.mjs <j6-dir> --out <spec-dir> [--site-url http://127.0.0.1:8217] [--force] [--page-floor N]
//        [--article-fields <fields.json>]   # { "<attribs field>": { "className": "…" } | "skip" } — see checkArticleFields
//        [--content-params <com_content.json>]  # the global com_content options; default <j6-dir>/content-params.json, else the dump's com_content row — see resolveContentParams
//        [--article-posts <posts.json>]     # { "<article id>": { "template"?: "<slug>" } } — see checkArticlePosts
//
// See references/inputs/from-joomla.md ("Adapter contract").

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, realpathSync, statSync, lstatSync, renameSync, rmSync, openSync, fstatSync, readSync, closeSync, constants as fsConstants } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve, dirname, relative, sep, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hostname } from 'node:os'
import { createHash } from 'node:crypto'
import {
  normaliseInventory,
  articles,
  categories,
  menuTree,
  siteMenuTypes,
  siteModules,
  parseMenuLink,
  mastheadFor,
  moduleSpacing,
  archiveDisplay,
  archivePaging,
  categoryLayoutKind,
  authors as joomlaAuthors,
  articleTags,
  ARTICLE_TAG_TYPE,
  AUTHOR_PROFILE_KEYS,
  menuIndex,
  acmInstances,
  routeViews,
  templateLayouts,
  slugify,
  parseJsonColumn,
  assignedTo,
  decodeAcmConfig,
  parseAcmSchema,
  SITE_CONFIG_FIELDS
} from '../lib/joomla-inventory.mjs'
import { convertHtml, checkBlockMarkup, SLOT_BLOCK, POST_BODY_MARKER } from '../lib/html-to-blocks.mjs'
import { JSDOM } from 'jsdom'
import { initSpecPack, validateSpecPack, DEFAULT_THEME_HOOK, PAGE_FLOOR } from './spec-pack.mjs'
import { ABSENT } from '../content-contract.mjs'
import { classifyTemplate } from './quickstart-inventory.mjs'
import { selectorProfileFor } from '../lib/framework-selectors.mjs'
import { recordData, recordPath, repoRootOf } from '../lib/record-paths.mjs'
import { buildSiteModel } from './site-model.mjs'
import { readT3Layout, blockMarkupEvidence, t3StyleSettings, styleOfItem } from './joomla-layout.mjs'
import { computedAcmItemField } from './joomla-php-scan.mjs'
import { inlineImports } from './joomla-imports.mjs'
import { lessPalette } from './joomla-less.mjs'
import { verifyGeneration, recheckGeneration, readEpoch } from './joomla-generation.mjs'
import { authorProfiles, contactRow, isFeaturedListed, menuShown, normaliseAcmModules, pageHeading, resolveModuleLoads, routeAnswer, sefRoutePath, t3SectionFrame } from './joomla-normalize.mjs'
import { mergeDesigns, routeGroups } from './joomla-design-merge.mjs'
import { BROWSER_SCHEMA, GOOGLE_LIST, browserCoverage, REPORT_FILE, analyzeStatic, buildReport, captureFontReader, measuredTypography, staticFindings } from './source-font.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const MAKE_DESIGN_SPEC = join(here, '..', 'make-design-spec.mjs')
/** make-design-spec.mjs is a local, file-only step; one that hangs is an error, not a wait. */
const DESIGN_SPEC_TIMEOUT_MS = 120_000

const ADAPTER = 'from-joomla'
const DEFAULT_SITE_URL = 'http://127.0.0.1:8217'
/** Categories whose articles are pages even without a menu item (Joomla keeps page copy in categories too). */
export const PAGE_CATEGORIES = ['Website pages', 'Studio resources']
/**
 * D2 (tasks/tracy-base-wp7/content-gaps.md §Slug): the ONLY slugs regenerated from titles — eleven
 * category aliases that no longer describe their category, and the three `mag-*` routes. Every
 * other slug and path stays exactly as Joomla serves it.
 */
export const D2_CATEGORY_ALIASES = [
  'politics',
  'business',
  'world-news',
  'food-and-drink',
  'grid-layout',
  'list-layout',
  'technical',
  'cool-workspace',
  'demo-categories',
  'magazine',
  'blog'
]
export const D2_ROUTE_RENAMES = {
  '/resources/mag-procurement': '/resources/website-planning',
  '/resources/mag-datacenter': '/resources/website-operations',
  '/resources/mag-world': '/resources/studio-notes'
}
/**
 * The theme's own section library. A mod_custom module whose root element carries one of these
 * signals (`data-od-block`, a `tracy-*` class, or the last "·" segment of its title) is a section
 * of that type rather than opaque HTML.
 */
const SECTION_TYPES = {
  hero: 'hero',
  problem: 'problem',
  pillars: 'pillars',
  value: 'pillars',
  'how-it-works': 'how-it-works',
  how: 'how-it-works',
  steps: 'how-it-works',
  'cta-inline': 'cta-inline',
  'inline-cta': 'cta-inline',
  features: 'features',
  zig: 'features',
  proof: 'proof',
  stats: 'proof',
  statistics: 'proof',
  testimonials: 'social-proof',
  'social-proof': 'social-proof',
  faq: 'faq',
  pricing: 'pricing',
  plans: 'pricing',
  'cta-final': 'cta-final',
  'final-cta': 'cta-final',
  contact: 'contact',
  styleguide: 'styleguide',
  'style-guide': 'styleguide',
  team: 'team'
}

/**
 * Detect the section type of a mod_custom module: `data-od-block` on the root element first, then a
 * `tracy-<type>` root class, then the last "·"-separated segment of the module title. `null` when
 * nothing matches — the caller keeps the HTML opaque and says so.
 */
export function detectSectionType(html, title = '') {
  const norm = (v) =>
    String(v ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  const doc = new JSDOM(`<body>${html ?? ''}</body>`).window.document
  const root = doc.body.firstElementChild
  const candidates = []
  if (root) {
    candidates.push(root.getAttribute('data-od-block'))
    for (const cls of root.classList) {
      const m = cls.match(/^tracy-([a-z0-9-]+)$/)
      if (m) candidates.push(m[1])
    }
  }
  candidates.push(title.split('·').pop())
  for (const c of candidates) {
    const key = norm(c)
    if (key && SECTION_TYPES[key]) return SECTION_TYPES[key]
  }
  return null
}
/** Positions that belong to the chrome (template parts / navigation), never to a page's content. */
const CHROME_POSITION =
  /^(header(-\d+|-[lr])?|footer(-logo)?|footnav-\d+|breadcrumbs|off-canvas|onepage-offcanvas|mega-.*|sidebar-[lr])$/
const SIDEBAR_POSITION = /^sidebar-[lr]$/
/** Where a module at a position belongs: the header or footer part, the sidebar, or the page. */
const positionScope = (pos) =>
  /^footer|^footnav/.test(pos)
    ? 'footer'
    : /^header|^off-canvas|^onepage-offcanvas|^mega-/.test(pos)
      ? 'header'
      : SIDEBAR_POSITION.test(pos)
        ? 'sidebar'
        : 'page'
const VIEW_IS_PAGE = (view) => view === 'front-page' || view === 'page' || view.startsWith('page-')
/** Route views that have no article body: the block the content-map names as the WordPress equivalent. */
const VIEW_STARTER = {
  'page-login': '<!-- wp:loginout {"displayLoginAsForm":true} /-->',
  'page-register': '<!-- wp:loginout /-->',
  'page-account': '<!-- wp:loginout /-->',
  'page-password': '<!-- wp:loginout /-->'
}
const STARTER_BY_TARGET = {
  'com_content/categories': '<!-- wp:categories {"showHierarchy":true} /-->',
  'com_tags/tags': '<!-- wp:tag-cloud /-->'
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
/** readJson naming the file when it cannot be read or parsed. */
const writeJson = (p, data) => writeFileSync(p, JSON.stringify(data, null, 2) + '\n')
/** A dump file larger than this (inventory.json of a large site is a few MB) is not read. */
const DUMP_FILE_MAX_BYTES = 512 * 1024 * 1024
/**
 * One JSON file of the dump (inventory.json, render-routes.json, content-params.json,
 * site-config.json), read once through a descriptor opened without following a link or blocking on
 * a pipe: undefined when absent; a link, a directory, a pipe, a file over `maxBytes` or one that
 * grows while read throws naming it. The value parsed is the one every later step uses.
 */
function readDumpJson(file, maxBytes = DUMP_FILE_MAX_BYTES) {
  let fd
  try {
    fd = openSync(file, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0) | (fsConstants.O_NONBLOCK ?? 0))
  } catch (e) {
    if (e.code === 'ENOENT') return undefined
    throw new Error(`${file}: ${e.code === 'ELOOP' ? 'not a regular file (a link, a directory or a pipe is not read)' : e.message}`)
  }
  try {
    const st = fstatSync(fd)
    if (!st.isFile()) throw new Error(`${file}: not a regular file (a link, a directory or a pipe is not read)`)
    if (st.size > maxBytes) throw new Error(`${file}: ${st.size} bytes, over the ${maxBytes} this file needs`)
    const buf = Buffer.alloc(st.size + 1)
    let n = 0
    for (let got; n < buf.length && (got = readSync(fd, buf, n, buf.length - n, null)) > 0; ) n += got
    if (n !== st.size) throw new Error(`${file}: changed while it was read (${st.size} bytes, then ${n > st.size ? 'more' : n})`)
    try {
      return JSON.parse(buf.toString('utf8', 0, n))
    } catch (e) {
      throw new Error(`${file}: ${e.message}`)
    }
  } finally {
    closeSync(fd)
  }
}
const firstFamily = (stack) =>
  stack
    ? String(stack)
        .split(',')[0]
        .trim()
        .replace(/^['"]|['"]$/g, '')
    : null
const textOf = (html) =>
  String(html ?? '')
    .replace(/\{load(?:position|module)[^}]*\}/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// ── template facts ────────────────────────────────────────────────────────────

/**
 * `:root { --x: v }` plus the `html[data-theme="dark"]` remap of a generated style sheet →
 * `{ light, dark }` maps. Values that still reference other tokens (var/calc/color-mix/clamp) are
 * dropped: the design contract wants resolved computed strings, and a guess is worse than a gap.
 */
export function extractCssTokens(css) {
  const grab = (block) => {
    const out = {}
    for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      const value = m[2]
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\s+/g, ' ')
        .trim()
      if (/\b(var|calc|color-mix|clamp)\(/.test(value)) continue
      out[m[1]] = value
    }
    return out
  }
  const light = css.match(/:root\s*\{([^}]*)\}/)
  const dark = css.match(/html\[data-theme=["']?dark["']?\][^{]*\{([^}]*)\}/)
  return { light: light ? grab(light[1]) : {}, dark: dark ? grab(dark[1]) : {} }
}

// ── framework CSS sources ─────────────────────────────────────────────────────
//
// Where a template's compiled CSS lives depends on its framework, read from the template's own files
// by the quickstart inventory's classifier (classifyTemplate) — never guessed from its name:
//   T4       templates/<tpl>/css/template.css, media/t4/css/<style id>.css (the sheet T4 compiles for
//            each template style), templates/<tpl>/css/darkmode.css
//   T3       templates/<tpl>/css/*.css, each replaced by css/themes/<theme>/<same file> when the style's
//            `theme` is set and the theme ships it, plus the files only that theme ships. On a live
//            capture, t3-assets/css/*.css is what T3 serves (it compiles there instead of css/):
//            the rule source is then the sheets the style's routes are recorded as served
//            (render-routes.json `stylesheets`, document order) — the compiled ones and the
//            template's own css/ sheets they still link, an absolute URL only on the source site's
//            origin, a path only below the base path of --site-url. A page with no record (a synthetic page) takes none of the style's values. A
//            style no page of which has a record while compiled sheets are captured, or whose
//            routes are served different sheets, has its sheets read and recorded but no value
//            published: which compiled sheet stands where is not known
//   other    templates/<tpl>/css/*.css, with the gap reported: the adapter knows no compiled-sheet
//            location for it
// The sheets of the style assigned to a route are the only ones its rules come from. A template that
// ships css/styles/<theme>.css (the token sheet of a Tracy build) keeps that source unchanged.

/** Page-mode sheets: loaded by error.php, offline.php or front-end editing, not by a site route. */
const PAGE_MODE_SHEETS = new Set(['error.css', 'offline.css', 'frontend-edit.css'])
/**
 * Body classes only a page-mode template sets (component.php `contentpane`, offline.php `offline`,
 * error.php `error-page`, the T3/T4 error pages): a rule on such a body styles no site route.
 */
const PAGE_MODE_BODY_CLASSES = new Set(['.contentpane', '.offline', '.error-page', '.t4-error-page', '.t3-error-page'])
const DARK_SHEET = 'darkmode.css'
/** The most stylesheet URLs one route of render-routes.json may record. */
const MAX_ROUTE_SHEETS = 1000
/** Framework token names the palette is read from (T4 compiles etc/theme into these on :root). */
const FRAMEWORK_TOKENS = {
  T4: { primary: '--color-primary', secondary: '--color-secondary', body_bg: '--body-bg-color', text: '--body-text-color' }
}
/**
 * The design rules read from the resolved sheets: per role, the selectors tried in turn (the first
 * one the sheets declare with a resolvable property is the rule's selector) and the properties read.
 */
const DESIGN_ROLES = [
  { role: 'body-type', category: 'typography', selectors: ['body'], single: true, props: ['font-family', 'font-size', 'font-weight', 'line-height'] },
  { role: 'heading-type', category: 'typography', selectors: ['h1', '.h1'], props: ['font-size', 'font-weight', 'line-height'] },
  { role: 'body-colors', category: 'color', selectors: ['body'], single: true, props: ['color', 'background-color'] },
  { role: 'link-color', category: 'color', selectors: ['a'], has: ['[href]'], props: ['color'] },
  { role: 'container', category: 'layout', selectors: ['.container'], props: ['max-width', 'padding-left', 'padding-right'] },
  { role: 'main-body', category: 'layout', selectors: ['.t4-main-body', '.t3-mainbody', 'main'], single: true, props: ['padding-top', 'padding-bottom'] },
  { role: 'button', category: 'component', selectors: ['.btn'], props: ['border-radius', 'font-weight', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left'] },
  { role: 'button-primary', category: 'component', selectors: ['.btn.btn-primary', '.btn-primary'], props: ['color', 'background-color', 'border-color'] }
]
const DESIGN_VARIANTS = [
  { id: 'desktop-light', mode: 'light', width: 1440, height: 900 },
  { id: 'desktop-dark', mode: 'dark', width: 1440, height: 900 },
  { id: 'mobile-light', mode: 'light', width: 390, height: 844 },
  { id: 'mobile-dark', mode: 'dark', width: 390, height: 844 }
]

/**
 * templateDetails.xml → the fields classifyTemplate reads: the root's child element names and the
 * system plugins its attributes name. A document that declares entities is refused, not parsed;
 * external resources are never loaded.
 */
export function manifestSummary(text) {
  if (text == null) return null
  if (/<!ENTITY/i.test(text)) return { error: 'entity declarations refused' }
  let doc
  try {
    doc = new JSDOM(text, { contentType: 'text/xml' }).window.document
  } catch (e) {
    return { error: `malformed XML (${String(e.message).split('\n')[0]})` }
  }
  const root = doc.documentElement
  if (!root || doc.getElementsByTagName('parsererror').length) return { error: 'malformed XML' }
  const refs = new Set()
  for (const el of [root, ...root.getElementsByTagName('*')])
    for (const a of el.attributes) for (const m of a.value.matchAll(/plugins\/system\/([A-Za-z0-9_]+)/g)) refs.add(m[1].toLowerCase())
  return { root: root.localName, children: [...new Set([...root.children].map((c) => c.localName))].sort(), pluginRefs: [...refs].sort() }
}

/**
 * The framework of the captured template, decided by the quickstart inventory's classifier from the
 * template's files (manifest, etc/layout, tpls/, …) as the capture reader lists them. The note about
 * a framework plugin not shipped is left out: a capture holds the template, not the site's plugins.
 */
function templateFramework(tpl) {
  const details = tpl.reader.read('templateDetails.xml')
  const xml = details ? manifestSummary(details.text) : null
  const base = `templates/${tpl.name}/`
  const members = new Set()
  for (const f of tpl.reader.list('')) {
    const segs = f.split('/')
    for (let k = 1; k <= segs.length; k++) members.add(base + segs.slice(0, k).join('/'))
  }
  const c = classifyTemplate(tpl.name, xml, [...members].sort(), [])
  return { framework: c.framework, evidence: c.evidence, notes: c.notes.filter((n) => !n.startsWith('no plugins/system/')) }
}

/**
 * One sheet through a capture reader: `{ path, role, status, text?, reason? }` — `read`, `absent`
 * (not in the capture) or `skipped` (the reader refused it: a link, a special file, over the size
 * limit, changed while read; the reason is the reader's).
 */
function readSheet(reader, rel, role) {
  const path = `${reader.inspection.root}/${rel}`
  const f = reader.read(rel)
  if (f) return { path, role, status: 'read', text: f.text }
  const skipped = reader.inspection.skipped.find((x) => x.path === path || path.startsWith(`${x.path}/`))
  return skipped ? { path, role, status: 'skipped', reason: skipped.reason } : { path, role, status: 'absent' }
}

/** Bootstrap before the template's own sheet before the rest, as the framework loads them. */
const sheetRank = (n) => (n === 'bootstrap.css' ? 0 : n === 'template.css' ? 1 : 2)
const bySheetOrder = (a, b) => sheetRank(a) - sheetRank(b) || (a < b ? -1 : a > b ? 1 : 0)
/**
 * The `.css` entries directly under `dir` of a capture reader: `{ state: 'listed', files, refused:
 * Map(name → reason) }`, `{ state: 'absent' }` or `{ state: 'refused', reason }` — a sheet or a
 * directory the reader refused is never taken for one that is not there.
 */
function cssDir(reader, dir) {
  const l = reader.listing(dir)
  if (l.state !== 'listed') return l
  const css = (n) => /\.css$/i.test(n)
  return { state: 'listed', files: new Set(l.entries.filter((e) => !e.dir && css(e.name)).map((e) => e.name)), refused: new Map(l.refused.filter((r) => css(r.name)).map((r) => [r.name, r.reason])) }
}

/**
 * A capture path's segments below the source site's base path → the sheet it names, or null: a
 * compiled sheet is exactly `t3-assets/css/<name>`, a template sheet exactly
 * `templates/<tpl>/css/<name>` or `templates/<tpl>/css/themes/<theme>/<name>`.
 */
function sheetAt(rest, tplName) {
  const css = /\.css$/i
  if (rest.length === 3 && rest[0] === 't3-assets' && rest[1] === 'css' && css.test(rest[2])) return { kind: 'compiled', name: rest[2] }
  if (rest[0] !== 'templates' || rest[1] !== tplName || rest[2] !== 'css' || !css.test(rest[rest.length - 1])) return null
  if (rest.length === 4) return { kind: 'template', rel: `css/${rest[3]}` }
  if (rest.length === 6 && rest[3] === 'themes') return { kind: 'template', rel: `css/themes/${rest[4]}/${rest[5]}`, theme: true }
  return null
}

/** The characters a URI holds as written (RFC 3986: unreserved, reserved, `%`). */
const URI_CHARS = /^[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]*$/
/**
 * The segments of a URL path as written (`/a/b/`, `` → `['a', 'b']`, `[]`), undecoded, or null when an
 * interior segment is empty: `/sub//x.css` and `/sub/x.css` are distinct paths, so neither is read as
 * the other. Only the leading `/` and one trailing `/` are not segments.
 */
function rawSegments(rawPath) {
  const parts = rawPath.split('/')
  if (parts[0] === '') parts.shift()
  if (parts.length && parts[parts.length - 1] === '') parts.pop()
  return parts.includes('') ? null : parts
}

/**
 * One route's recorded stylesheet URLs → `{ sheets: [{ kind: 'compiled', name } | { kind: 'template',
 * rel, role }], other: [path], foreign: [url], unresolved: [url], outside: [url] }` in cascade order (a
 * sheet linked twice stands at its last link), or `{ error }`. A URL is resolved on the source site's
 * origin (`origin`; null: unknown): an absolute one as it is, a scheme-relative one (`//host/…`) with
 * the origin's scheme, a root-relative one (`/…`) on the origin. A path-relative one (`css/x.css`,
 * `../x.css`) depends on the document's URL and any `<base>` element the record does not carry, so
 * which file it names is not known: it is `unresolved`. On the source site, a path is a captured file
 * only below the site's base path (`basePath`, the path of `--site-url`; null: unknown): there
 * t3-assets/css/<name> is a compiled sheet, templates/<tpl>/css/ (or its css/themes/<theme>/) a
 * template sheet, anything else (media, modules) `other`. A path that ends like one of those sheets
 * anywhere else — on another origin (`foreign`), or on the source site outside the base path or at
 * another depth below it (`outside`) — is not known to be the captured file of that name; one that
 * does not is `other`. The path is read as recorded, never as a URL parser normalises it: a URL with a
 * character outside URI_CHARS, or a path segment that is not a plain name (`.`, `..`, literal or
 * percent-encoded, one holding `/` or `\`, an empty one inside the path), is refused, never resolved.
 */
function servedList(hrefs, tplName, origin, basePath = '/', hasOther = null) {
  const sheets = new Map()
  const ordered = new Map() // sheets + the sheets outside them, in cascade order
  const other = []
  const otherAt = []
  const foreign = []
  const unresolved = []
  const outside = []
  const baseSegs = basePath == null ? null : rawSegments(basePath)
  for (const h of hrefs) {
    const ref = h.trim()
    let segs, sameOrigin
    if (!/^([a-z][a-z0-9+.-]*:|\/)/i.test(ref)) {
      unresolved.push(h)
      continue
    }
    // The path is read as the record writes it, before any URL normalisation: a parser folds `.` and
    // `..` segments (literal or percent-encoded), reads `\` as `/` and drops tabs and newlines, so
    // what it returns may name another file than the one recorded. Only URI characters are accepted.
    if (!URI_CHARS.test(ref)) return { error: `${JSON.stringify(h)} has a character a URL does not hold as written` }
    const rawPath = ref.match(/^(?:[a-z][a-z0-9+.-]*:)?(?:\/\/[^/?#]*)?([^?#]*)/i)[1]
    const written = rawSegments(rawPath)
    if (!written) return { error: `${JSON.stringify(h)} has an empty path segment` }
    try {
      segs = written.map((x) => decodeURIComponent(x))
    } catch {
      return { error: `${JSON.stringify(h)} has a path that does not decode` }
    }
    const bad = segs.find((x) => x.includes('/') || x.includes('\\') || /^\.+$/.test(x) || /[\x00-\x20\x7f]/.test(x))
    if (bad !== undefined) return { error: `${JSON.stringify(h)} has the path segment ${JSON.stringify(bad)}` }
    try {
      const scheme = /^[a-z][a-z0-9+.-]*:/i.test(ref)
      const root = !scheme && !ref.startsWith('//')
      // root-relative: on the source site whatever its origin; scheme-relative: only with a known one
      const u = new URL(ref, origin ?? 'http://capture.invalid/')
      sameOrigin = root || (origin != null && u.origin === origin)
    } catch {
      return { error: `${JSON.stringify(h)} is not a URL` }
    }
    const under = sameOrigin && baseSegs != null && baseSegs.length <= segs.length && baseSegs.every((x, i) => segs[i] === x)
    const e = under ? sheetAt(segs.slice(baseSegs.length), tplName) : null
    if (e && ![e.name, ...(e.rel ? e.rel.split('/') : [])].filter(Boolean).every(plainName)) return { error: `${JSON.stringify(h)} names a sheet that is not a plain file name` }
    if (!e) {
      // a path that is not a captured sheet here: one ending like a compiled or template sheet may
      // be one served from elsewhere, so it is reported, never taken for the captured file
      const likeSheet = segs.some((_, i) => sheetAt(segs.slice(i), tplName))
      if (likeSheet) (sameOrigin ? outside : foreign).push(h)
      else {
        const path = '/' + segs.join('/')
        other.push(path)
        otherAt.push({ path, before: ordered.size })
        // A sheet of the site outside the template's own (a module or media sheet) is read from the
        // capture where the URL says it is, in cascade order; another origin's, or one outside the
        // base path, names no captured file (`rel` null).
        const rel = under ? segs.slice(baseSegs.length).join('/') : null
        // Only a sheet the capture holds joins the cascade; the rest stay in `other` (not read).
        if (rel && plainRel(rel) && hasOther?.(rel)) {
          ordered.delete(`o ${path}`)
          ordered.set(`o ${path}`, { kind: 'other', path, rel, sameOrigin })
        }
      }
      continue
    }
    const key = e.kind === 'compiled' ? `c ${e.name}` : `t ${e.rel}`
    if (e.kind === 'template') e.role = e.rel.split('/').pop().toLowerCase() === DARK_SHEET ? 'dark' : e.theme ? 'theme' : 'template'
    delete e.theme
    sheets.delete(key)
    sheets.set(key, e)
    ordered.delete(key)
    ordered.set(key, e)
  }
  // `otherAt`: where in the cascade each sheet the capture lacks is linked — the number of captured sheets linked before it.
  const missing = otherAt.filter((x) => !ordered.has(`o ${x.path}`))
  return { sheets: [...sheets.values()], ordered: [...ordered.values()], other, otherAt: missing, foreign, unresolved, outside }
}

/**
 * The sheets the pages of a style are recorded as served: `{ sheets, other, foreign, from, unrecorded }`
 * when at least one page has a record and all records name the same template and compiled sheets in
 * the same order, else `{ why }`. `unrecorded`: the pages with no record (a synthetic page no route
 * renders, a route captured without one) — what they are served is not known, so the style's values
 * are not theirs. `style.served`: `[{ page, route, hrefs|null }]` (resolveDesign).
 */
/** A capture path below the source site's base path that is plain names only. */
const plainRel = (rel) => rel.split('/').every(plainName)

function linkedSheets(style, tplName, origin, basePath, hasOther = null) {
  const pages = style.served ?? []
  const name = (p) => (p.route ? `${p.route} (${p.page})` : p.page)
  const recorded = pages.filter((p) => p.hrefs)
  if (!recorded.length) return { why: pages.length ? `render-routes.json records no stylesheets for ${pages.map(name).join(', ')}` : 'the style has no page whose served sheets are recorded' }
  const lists = recorded.map((p) => ({ p, r: servedList(p.hrefs, tplName, origin, basePath, hasOther) }))
  const bad = lists.find((x) => x.r.error)
  if (bad) return { why: `the stylesheets render-routes.json records for ${name(bad.p)} are refused: ${bad.r.error}` }
  const key = (r) => JSON.stringify(r.ordered)
  const differ = lists.find((x) => key(x.r) !== key(lists[0].r))
  if (differ) return { why: `${name(lists[0].p)} and ${name(differ.p)} are served different template or compiled sheets` }
  return {
    sheets: lists[0].r.ordered,
    other: [...new Set(lists.flatMap((x) => x.r.other))].sort(),
    // where each sheet the capture lacks stands in the cascade (the latest place any list links it)
    otherAt: [...lists.flatMap((x) => x.r.otherAt).reduce((m, x) => m.set(x.path, Math.max(m.get(x.path) ?? 0, x.before)), new Map())].map(([path, before]) => ({ path, before })),
    foreign: [...new Set(lists.flatMap((x) => x.r.foreign))].sort(),
    unresolved: [...new Set(lists.flatMap((x) => x.r.unresolved))].sort(),
    outside: [...new Set(lists.flatMap((x) => x.r.outside))].sort(),
    from: `render-routes.json stylesheets of ${recorded.map(name).join(', ')}`,
    unrecorded: pages.filter((p) => !p.hrefs).map((p) => ({ page: p.page, name: name(p) }))
  }
}

/**
 * The sheets a template style's routes load, in cascade order, for the framework the template's
 * files show: `{ sheets, gaps, excluded, unplaced }`. `site` reads the capture beside the templates
 * (media/, t3-assets/). A sheet assigned but not captured, or refused by the reader, is a gap; nothing
 * is substituted for it — a refused theme sheet or theme directory never lets the base sheet stand in.
 * `unplaced` (a reason, or null): the capture cannot say which sheets the style's routes are served,
 * or a sheet they load is not read (not captured, refused, a directory not listed, a theme not
 * captured or not named plainly, another origin's) — what it declares may override any value of the
 * sheets read — so none of the style's values is published. `unplacedPages`: the pages of the style
 * with no record of their sheets when the others' records are the rule source — the values stand for
 * the recorded pages only. `origin`: the source site's origin, against which absolute URLs are checked;
 * `basePath`: the path of the source site URL (null: unknown), below which a URL's path is a capture path.
 */
function styleSheets({ framework, tpl, site, style, origin = null, basePath = '/' }) {
  const sheets = []
  const gaps = []
  const excluded = []
  let unplaced = null
  let unplacedPages = []
  const unavailable = [] // a sheet the style's routes load that is not read
  const lost = (why) => (gaps.push(why), unavailable.push(why))
  const root = tpl.reader.inspection.root
  const own = (rel, role) => sheets.push(readSheet(tpl.reader, rel, role))
  const refusedSheet = (reader, rel, role, reason) => sheets.push({ path: `${reader.inspection.root}/${rel}`, role, status: 'skipped', reason })
  // The base css/*.css and, for a T3 theme, its css/themes/<theme>/*.css: the theme's file replaces
  // the base file of the same name; one the base lacks is loaded with them. `th` is the theme
  // directory's listing (null: no theme); `served`, the names of the compiled sheets T3 serves in
  // place of the template's sheets of the same name.
  const templateSheets = (th, theme, served) => {
    const compiledFor = (rel, name) => {
      if (!served.has(name.toLowerCase())) return false
      excluded.push({ path: `${root}/${rel}`, reason: `T3 serves the compiled ${site.inspection.root}/t3-assets/css/${name} in its place` })
      return true
    }
    const base = cssDir(tpl.reader, 'css')
    if (base.state === 'refused') lost(`style #${style.id}: ${root}/css/ was not listed (${base.reason}): the template's own sheets are not read`)
    const listed = (d) => (d?.state === 'listed' ? d : { files: new Set(), refused: new Map() })
    const b = listed(base)
    const t = listed(th)
    const unknownTheme = th?.state === 'refused'
    const names = [...new Set([...b.files, ...b.refused.keys(), ...t.files, ...t.refused.keys()])].sort(bySheetOrder)
    for (const name of names) {
      const inTheme = t.files.has(name) || t.refused.has(name)
      const rel = inTheme ? `css/themes/${theme}/${name}` : `css/${name}`
      if (PAGE_MODE_SHEETS.has(name.toLowerCase())) {
        excluded.push({ path: `${root}/${rel}`, reason: 'page-mode sheet (error, offline or front-end editing page), not loaded by a site route' })
        continue
      }
      if (name.toLowerCase() === DARK_SHEET || compiledFor(rel, name)) continue
      const role = inTheme ? 'theme' : 'template'
      if (unknownTheme) refusedSheet(tpl.reader, rel, role, `the theme directory css/themes/${theme}/ was not listed (${th.reason}); whether the theme replaces this sheet is unknown, so it is not read`)
      else if (t.refused.has(name)) refusedSheet(tpl.reader, rel, role, t.refused.get(name))
      else if (inTheme) own(rel, role)
      else if (b.refused.has(name)) refusedSheet(tpl.reader, rel, role, b.refused.get(name))
      else own(rel, role)
    }
    const dark = [...t.files, ...t.refused.keys()].find((n) => n.toLowerCase() === DARK_SHEET)
    if (compiledFor(dark ? `css/themes/${theme}/${dark}` : `css/${DARK_SHEET}`, DARK_SHEET)) return
    if (unknownTheme) refusedSheet(tpl.reader, `css/${DARK_SHEET}`, 'dark', `the theme directory css/themes/${theme}/ was not listed (${th.reason}); whether the theme replaces this sheet is unknown, so it is not read`)
    else if (dark && t.refused.has(dark)) refusedSheet(tpl.reader, `css/themes/${theme}/${dark}`, 'dark', t.refused.get(dark))
    else if (dark) own(`css/themes/${theme}/${dark}`, 'dark')
    else own(`css/${DARK_SHEET}`, 'dark')
  }
  if (framework === 'T4') {
    own('css/template.css', 'template')
    if (/^\d+$/.test(String(style.id))) {
      const s = readSheet(site, `media/t4/css/${style.id}.css`, 'style')
      sheets.push(s)
      if (s.status !== 'read') lost(`${s.path}, the sheet T4 compiles for style #${style.id}, ${s.status === 'skipped' ? `was not read (${s.reason})` : 'is not in the capture'}: the style's own settings are missing from its rules`)
    } else lost(`style id ${JSON.stringify(style.id)} is not a number: no media/t4/css sheet is looked up for it`)
    own(`css/${DARK_SHEET}`, 'dark')
  } else {
    let theme = null
    let th = null
    let assets = null
    if (framework === 'T3') {
      assets = cssDir(site, 't3-assets/css')
      if (assets.state === 'refused') lost(`style #${style.id}: ${site.inspection.root}/t3-assets/css/ was not listed (${assets.reason}): the sheets T3 compiled there are not read`)
    }
    // The compiled sheets T3 serves. A page-mode sheet compiled there is left out as the template's is.
    const compiled = (assets?.state === 'listed' ? [...assets.files, ...assets.refused.keys()] : []).sort(bySheetOrder)
    const pageMode = (n) => PAGE_MODE_SHEETS.has(n.toLowerCase())
    for (const n of compiled.filter(pageMode)) excluded.push({ path: `${site.inspection.root}/t3-assets/css/${n}`, reason: 'page-mode sheet (error, offline or front-end editing page), not loaded by a site route' })
    const served = compiled.filter((n) => !pageMode(n))
    const compiledSheet = (n) => {
      if (assets?.state === 'listed' && assets.refused.has(n)) refusedSheet(site, `t3-assets/css/${n}`, 'compiled', assets.refused.get(n))
      else sheets.push(readSheet(site, `t3-assets/css/${n}`, 'compiled'))
    }
    // A route's record of its sheets is the rule source whenever one exists — also when no compiled
    // sheet is captured: a record naming one then shows a served sheet that is missing.
    const recorded = framework === 'T3' && (style.served ?? []).some((p) => p.hrefs)
    const linked = served.length || recorded ? linkedSheets(style, tpl.name, origin, basePath, (rel) => Boolean(site.read(rel))) : null
    if (linked?.sheets) {
      // The rule source is exactly what the routes are recorded as served, in that order: a linked
      // sheet not captured or not read leaves the style unplaced; the rest is not served to them.
      const pathAt = [] // the sheet each linked entry became, in cascade order
      for (const e of linked.sheets) {
        if (e.kind === 'compiled') compiledSheet(e.name)
        else if (e.kind === 'other') {
          sheets.push(readSheet(site, e.rel, 'other'))
        } else own(e.rel, e.role)
        const got = sheets[sheets.length - 1]
        pathAt.push(got.path)
        if (got.status === 'absent') lost(`${got.path}, which ${linked.from} link, is not in the capture`)
        else if (e.kind === 'other' && got.status === 'skipped') lost(`${got.path}, which ${linked.from} link, was not read (${got.reason})`)
      }
      const linkedPaths = new Set(sheets.map((x) => x.path))
      for (const n of served) {
        const path = `${site.inspection.root}/t3-assets/css/${n}`
        if (!linkedPaths.has(path)) excluded.push({ path, reason: `not linked by the style's routes (${linked.from})` })
      }
      // A sheet of the site outside the template's css/ and t3-assets/css/ (module, media) is read from the capture in its place in the
      // cascade. One the capture lacks may override what the sheets linked BEFORE it declare (a later sheet wins), so their rules are
      // not published. Nor are those of the sheets linked after it: specificity or !important lets an earlier sheet win over a later one, so
      // a sheet the capture lacks may override any read sheet, wherever it is linked.
      for (const { path: p, before } of linked.otherAt) {
        excluded.push({ path: p, reason: `linked by the style's routes, outside the template's css/ and t3-assets/css/: not read (it is not in the capture at that path)` })
        const read = sheets.filter((sh) => sh.status === 'read').map((sh) => sh.path)
        for (const sh of sheets) if (sh.status === 'read') sh.voided ??= p
        gaps.push(`style #${style.id}: ${p}, which ${linked.from} link, is not in the capture; its rules could override the values of ${read.length ? `the sheets read (${read.join(', ')}), whether linked before or after it — specificity and !important do not follow link order — which are recorded only` : 'no sheet read'} (capture it to read it in its place in the cascade)`)
      }
      for (const h of linked.unresolved) lost(`${h}, which ${linked.from} link, is a path-relative URL: resolved against the page's URL or a \`<base>\` element the record does not carry, which sheet it names is not known`)
      for (const h of linked.outside) lost(`${h}, which ${linked.from} link, is on the source site ${basePath == null ? 'while its base path is unknown' : `at a path other than t3-assets/css/<file> or templates/${tpl.name}/css/… below its base path (${basePath})`}: the captured file of the same name is not known to be it`)
      for (const h of linked.foreign) lost(`${h}, which ${linked.from} link, is served from ${origin ? `another origin than the source site's (${origin})` : 'an absolute URL while the source site origin is unknown'}: the captured file of the same path is not known to be it`)
      if (linked.unrecorded.length) {
        unplacedPages = linked.unrecorded.map((p) => p.page)
        gaps.push(`style #${style.id}: render-routes.json records no stylesheets for ${linked.unrecorded.map((p) => p.name).join(', ')} (a synthetic page no route renders has none): what those pages are served is not known, so their design values are left unresolved; the style's values stand for the pages recorded only`)
      }
    } else {
      if (framework === 'T3') {
        const t = style.params?.theme
        if (t != null && t !== '' && !plainName(String(t))) lost(`style #${style.id}: theme ${JSON.stringify(t)} is not a plain directory name; the base sheets are read`)
        else if (t) {
          theme = String(t)
          th = cssDir(tpl.reader, `css/themes/${theme}`)
          if (th.state === 'absent') lost(`style #${style.id}: theme "${theme}" is set, but ${root}/css/themes/${theme}/ is not in the capture; the base sheets are read`)
          else if (th.state === 'refused') lost(`style #${style.id}: theme "${theme}" is set, but ${root}/css/themes/${theme}/ was not listed (${th.reason}); which base sheets it replaces is unknown, so no template sheet is read`)
        }
      } else
        gaps.push(`framework ${framework}: the adapter knows no compiled-sheet location for it; the template's css/*.css sheets are read, and a sheet the framework compiles elsewhere is not seen`)
      // Without a record of what the routes are served, the compiled sheets are read and recorded
      // after the template's, and leave the style unplaced: no value of it is published.
      templateSheets(th, theme, new Set(served.map((n) => n.toLowerCase())))
      for (const n of served) compiledSheet(n)
      if (linked && !served.length)
        unplaced = `style #${style.id}: its routes' records of the sheets they are served cannot be placed (${linked.why}), so no design value of the style is published (its sheets are read and recorded only)`
      else if (served.length)
        unplaced = `style #${style.id}: T3 serves compiled sheets (${served.map((n) => `${site.inspection.root}/t3-assets/css/${n}`).join(', ')}), and which of them the style's routes load, in what order and beside which template sheets is not recorded (${linked.why}), so no design value of the style is published (its sheets are read and recorded only)`
    }
  }
  for (const s of sheets) if (s.status === 'skipped' && s.role !== 'style') lost(`${s.path} was not read (${s.reason})`)
  if (!unplaced && unavailable.length)
    unplaced = `style #${style.id}: a sheet its routes load is not read (${unavailable.length === 1 ? unavailable[0] : unavailable.map((w, k) => `${k + 1}. ${w}`).join('; ')}); what it declares may override any value of the sheets read, so no design value of the style is published (its sheets are read and recorded only)`
  if (unplaced) gaps.push(unplaced)
  return { sheets, gaps, excluded, unplaced, unplacedPages: unplaced ? [] : unplacedPages }
}

// ── a small CSS reader: rules, declarations, width media conditions ──────────

/** `text` without comments, strings kept. */
function stripCssComments(text) {
  let out = ''
  for (let i = 0; i < text.length; ) {
    const ch = text[i]
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end === -1 ? text.length : end + 2
      out += ' '
    } else if (ch === '"' || ch === "'") {
      let j = i + 1
      while (j < text.length && text[j] !== ch) j += text[j] === '\\' ? 2 : 1
      out += text.slice(i, j + 1)
      i = j + 1
    } else out += text[i++]
  }
  return out
}
/** The index of the first of `stops` at depth 0 (parentheses, brackets) outside strings, from `i`; `s.length` if none. */
function scanTo(s, i, stops) {
  let depth = 0
  for (; i < s.length; i++) {
    const ch = s[i]
    if (ch === '"' || ch === "'") {
      let j = i + 1
      while (j < s.length && s[j] !== ch) j += s[j] === '\\' ? 2 : 1
      i = j
    } else if (ch === '(' || ch === '[') depth++
    else if ((ch === ')' || ch === ']') && depth > 0) depth--
    else if (depth === 0 && stops.includes(ch)) return i
  }
  return s.length
}
/** `s` split at depth-0 `sep` outside strings. */
function splitTop(s, sep) {
  const out = []
  let i = 0
  for (;;) {
    const j = scanTo(s, i, [sep])
    out.push(s.slice(i, j))
    if (j >= s.length) return out
    i = j + 1
  }
}
/** An identifier as CSS reads it: every escape decoded (`\\41 ` and `\\A` are `A`), as written otherwise. */
function cssIdent(raw) {
  return raw.replace(/\\(?:([0-9a-fA-F]{1,6})[ \t\n\r\f]?|([^\n\r\f]))/g, (_, hex, ch) => {
    if (ch != null) return ch
    const cp = parseInt(hex, 16)
    return cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) ? '\ufffd' : String.fromCodePoint(cp)
  })
}
/**
 * A declaration's property name: a custom property (`--…`) keeps its spelling — custom property
 * names are case-sensitive, `--Brand` is not `--brand` — every other one is ASCII-lowercased.
 */
const propertyName = (raw) => {
  const n = cssIdent(raw)
  return n.startsWith('--') ? n : n.replace(/[A-Z]/g, (c) => c.toLowerCase())
}
/** A custom property name as written in `var()`: one identifier, escapes included. */
const VAR_NAME = /^--(?:[\w-]|[^\x00-\x7f]|\\(?:[0-9a-fA-F]{1,6}[ \t\n\r\f]?|[^0-9a-fA-F\n\r\f]))*$/
/** One `@media` prelude → `{ min, max }` in px (em/rem at 16px, as media queries measure them), `'never'` for print, or null (not supported). */
export function parseMediaCondition(prelude) {
  const q = prelude.trim().toLowerCase()
  if (!q || q.includes(',')) return null
  const m = q.match(/^(?:(only\s+)?(screen|all|print)\s*(?:and\s+|$))?(.*)$/)
  if (!m) return null
  if (m[2] === 'print') return 'never'
  const cond = { min: null, max: null }
  const rest = m[3].trim()
  if (!rest) return cond
  for (const part of rest.split(/\s+and\s+/)) {
    const f = part.trim().match(/^\(\s*(min|max)-width\s*:\s*([\d.]+)(px|em|rem)\s*\)$/)
    if (!f) return null
    const px = Number(f[2]) * (f[3] === 'px' ? 1 : 16)
    if (!Number.isFinite(px)) return null
    cond[f[1]] = f[1] === 'min' ? Math.max(cond.min ?? -Infinity, px) : Math.min(cond.max ?? Infinity, px)
  }
  return cond
}
/**
 * Conditional at-rule blocks that only gate whether their rules apply: where they do, a rule inside
 * ranks as a rule outside (importance, specificity, order). Any other block holding style rules —
 * @layer (unlayered normal rules win over layered ones, layered !important ones over unlayered),
 * @scope (proximity), @starting-style, an at-rule not known — ranks by rules the adapter does not
 * model: its rules are `unranked`, taken to win wherever they can match.
 */
const RANK_NEUTRAL_AT_RULES = new Set(['media', 'supports', 'container', 'document', '-moz-document'])
/**
 * At-rule blocks that hold no selector rules for an element and change no value a design rule reads
 * in the browser the variants are rendered in: skipped without a report. @viewport / @-ms-viewport
 * (Bootstrap 3 ships one) is applied by no current engine.
 */
const NON_STYLE_AT_RULES = new Set(['font-face', 'keyframes', '-webkit-keyframes', '-moz-keyframes', 'page', 'counter-style', 'font-feature-values', 'font-palette-values', 'viewport', '-ms-viewport'])
/**
 * At-rule blocks that hold no selector rules but change what the sheet's rules resolve to: @property
 * (a custom property that does not inherit, or has an initial value). They make the rest of the
 * sheet unknowable.
 */
const SHEET_WIDE_AT_RULES = new Set(['property'])

/**
 * A stylesheet → `{ rules, conditional, opaque, unsupported, withheld }`. `rules` — `[{ selectors,
 * decls: [{ prop, value, important }], media: [cond], at }]` — is what a plain reading can place: style
 * rules at the top level or inside `@media` width conditions. `conditional` holds, in the same shape
 * with `why`, the rules that may apply under a condition the adapter does not read: inside every other
 * conditional block (@supports, @container, @layer, a media feature other than min/max-width, an
 * unknown at-rule), nested in a style rule (their selectors composed with the parent's), or in a block
 * the sheet never closes (also listed in `withheld` with the properties they declare). They are never
 * read as values; the cascade takes them as rivals that may win — one `unranked` (inside a block that
 * is not RANK_NEUTRAL_AT_RULES) as one that wins wherever it can match. `opaque` names what makes the rest
 * of the sheet unknowable — an `@import` (a sheet not followed), an `@namespace`, a SHEET_WIDE_AT_RULES
 * block, or stray text or statements (which a browser folds into the next rule's selector, dropping it). `at` orders rules and conditional rules
 * as the sheet gives them. `unsupported` reports each of these, and every declaration dropped.
 */
export function parseCss(text, seq = { n: 0 }) {
  const src = stripCssComments(String(text ?? ''))
  const rules = []
  const conditional = []
  const opaque = []
  const unsupported = []
  const withheld = []
  let i = 0
  /** The index just past the `}` closing the block whose `{` was at `open - 1`. */
  const blockEnd = (open) => {
    let depth = 1
    let j = open
    while (j < src.length && depth > 0) {
      j = scanTo(src, j, ['{', '}'])
      if (j >= src.length) break
      depth += src[j] === '{' ? 1 : -1
      j++
    }
    return depth === 0 ? j : src.length
  }
  /** `inner` (a sheet's text) parsed as rules that may apply: every rule of it becomes conditional with `why`, within `media` (`unranked`: ranked by what the adapter does not model). */
  const mayApply = (inner, media, why, unranked = false) => {
    const r = parseCss(inner, seq)
    for (const x of [...r.rules, ...r.conditional]) conditional.push({ ...x, media: [...media, ...x.media], why: x.why ? `${why}; ${x.why}` : why, ...(unranked || x.unranked ? { unranked: true } : {}) })
    opaque.push(...r.opaque)
    unsupported.push(...r.unsupported)
  }
  const block = (media, end, malformed = null) => {
    while (i < end) {
      const stop = Math.min(scanTo(src, i, ['{', ';', '}']), end)
      const prelude = src.slice(i, stop).trim()
      if (stop >= end) {
        if (prelude) unsupported.push(`unterminated input "${prelude.slice(0, 60)}"`)
        i = end
        return
      }
      if (src[stop] === '}') {
        const what = prelude ? `stray text "${prelude.slice(0, 60)}"` : 'stray text "}"'
        unsupported.push(what)
        opaque.push(what)
        i = stop + 1
        continue
      }
      if (src[stop] === ';') {
        i = stop + 1
        // Statements: only those that change nothing a rule of this sheet matches or ranks are passed
        // over — @charset, and a @layer order (layered rules are unranked whatever the order). Any
        // other (@import, @namespace, which changes what an unprefixed type selector matches, one not
        // known) makes the rest of the sheet unknowable.
        if (/^@import\b/i.test(prelude)) {
          unsupported.push(`${prelude.slice(0, 80)}: imported sheet not followed`)
          opaque.push(`${prelude.slice(0, 80)} (a sheet not followed)`)
        } else if (/^@namespace\b/i.test(prelude)) {
          unsupported.push(`${prelude.slice(0, 80)}: namespaces not read`)
          opaque.push(`${prelude.slice(0, 80)} (a namespace changes what its selectors match)`)
        } else if (prelude && !/^@(charset|layer)\b/i.test(prelude)) {
          unsupported.push(`stray statement "${prelude.slice(0, 60)}"`)
          opaque.push(`stray statement "${prelude.slice(0, 60)}"`)
        }
        continue
      }
      const close = blockEnd(stop + 1)
      const bodyEnd = src[close - 1] === '}' ? close - 1 : close
      // A block not closed, or one inside it: what it holds may apply, and is said so.
      const why = malformed ?? (bodyEnd === close ? `unterminated block "${prelude.slice(0, 60)}"` : null)
      if (why && !malformed) unsupported.push(`${why}: its declarations are withheld`)
      if (prelude.startsWith('@')) {
        const name = (prelude.match(/^@([\w-]+)/)?.[1] ?? '').toLowerCase()
        const cond = name === 'media' ? parseMediaCondition(prelude.slice(6)) : null
        if (SHEET_WIDE_AT_RULES.has(name)) {
          unsupported.push(`@${name} block: not read`)
          opaque.push(`${prelude.slice(0, 80)} (it changes what the sheet's rules resolve to)`)
          i = close
        } else if (cond === 'never' || NON_STYLE_AT_RULES.has(name)) i = close
        else if (cond) {
          i = stop + 1
          block([...media, cond], bodyEnd, why)
          i = close
        } else {
          unsupported.push(name === 'media' ? `@media ${prelude.slice(6).trim().slice(0, 80)}: condition not supported` : `@${name} block: not read`)
          mayApply(src.slice(stop + 1, bodyEnd), media, `inside ${prelude.slice(0, 80)}`, !RANK_NEUTRAL_AT_RULES.has(name))
          i = close
        }
        continue
      }
      // A style rule: its declarations; a nested block, composed with the rule's selectors, may apply.
      const selectors = splitTop(prelude, ',').map(normaliseSelector).filter(Boolean)
      const at = seq.n++ // before its nested rules, which follow its declarations
      let body = ''
      let j = stop + 1
      while (j < bodyEnd) {
        const k = Math.min(scanTo(src, j, ['{']), bodyEnd)
        if (k >= bodyEnd) {
          body += src.slice(j, bodyEnd)
          break
        }
        const cut = Math.max(src.lastIndexOf(';', k), src.lastIndexOf('}', k))
        body += src.slice(j, Math.max(j, cut + 1))
        const inner = src.slice(Math.max(j, cut + 1), k).trim()
        const nestedEnd = blockEnd(k + 1)
        const nestedBody = src.slice(k + 1, src[nestedEnd - 1] === '}' ? nestedEnd - 1 : nestedEnd)
        unsupported.push(`nested rule in "${prelude.slice(0, 60)}": not read`)
        const composed = inner.startsWith('@')
          ? selectors
          : selectors.flatMap((p) => splitTop(inner, ',').map((c) => (c.includes('&') ? c.replaceAll('&', `:is(${p})`) : `${p} ${c.trim()}`)))
        const wrapped = inner.startsWith('@') ? `${inner}{${selectors.join(',')}{${nestedBody}}}` : `${composed.join(',')}{${nestedBody}}`
        if (composed.length) mayApply(wrapped, media, why ?? `nested in "${prelude.slice(0, 60)}"`)
        j = nestedEnd
      }
      const decls = []
      for (const d of splitTop(body, ';')) {
        if (!d.trim()) continue
        const c = d.indexOf(':')
        const prop = c > 0 ? propertyName(d.slice(0, c).trim()) : ''
        let value = c > 0 ? d.slice(c + 1).trim() : ''
        const important = /!\s*important\s*$/i.test(value)
        if (important) value = value.replace(/!\s*important\s*$/i, '').trim()
        // a custom property may be declared empty: it is declared, with a value nothing reads as a design value
        if (prop && (value || prop.startsWith('--'))) decls.push({ prop, value, important })
        else unsupported.push(`declaration "${d.trim().slice(0, 60)}" in "${prelude.slice(0, 60)}": no property or value; not read`)
      }
      if (selectors.length && decls.length) {
        if (why) {
          withheld.push({ selectors, props: [...new Set(decls.map((d) => d.prop))], why })
          conditional.push({ selectors, decls, media, at, why })
        } else rules.push({ selectors, decls, media, at })
      }
      i = close
    }
  }
  block([], src.length)
  return { rules, conditional, opaque, unsupported, withheld }
}
/**
 * One selector, written one way: whitespace runs to one space, a combinator between single spaces,
 * `[a = x]` as `[a="x"]`. Only at the top level, outside strings: `~=` in an attribute selector and
 * `+` in `:nth-child(2n+1)` are not combinators.
 */
function normaliseSelector(sel) {
  const s = sel.trim()
  let out = ''
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '"' || ch === "'") {
      let j = i + 1
      while (j < s.length && s[j] !== ch) j += s[j] === '\\' ? 2 : 1
      out += s.slice(i, j + 1)
      i = j
      continue
    }
    if (ch === '(' || ch === '[') depth++
    else if ((ch === ')' || ch === ']') && depth > 0) depth--
    if (/\s/.test(ch)) {
      if (!out.endsWith(' ')) out += ' '
    } else if (depth === 0 && (ch === '>' || ch === '+' || ch === '~')) out = `${out.replace(/ $/, '')} ${ch} `
    else out += ch
  }
  return normaliseAttributes(out.replace(/ {2,}/g, ' ').trim())
}
/**
 * Every attribute selector of `sel` (outside strings) written one way: `[name op "value" flag]`, the
 * value quoted, the i / s flag kept after it. One outside the attribute grammar is left as written.
 */
function normaliseAttributes(sel) {
  let out = ''
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i]
    if (ch === '"' || ch === "'") {
      let j = i + 1
      while (j < sel.length && sel[j] !== ch) j += sel[j] === '\\' ? 2 : 1
      out += sel.slice(i, j + 1)
      i = j
      continue
    }
    if (ch !== '[') {
      out += ch
      continue
    }
    const close = scanTo(sel, i + 1, [']'])
    const m = sel[close] === ']' ? sel.slice(i + 1, close).trim().match(ATTR) : null
    if (!m) {
      out += sel.slice(i, close + 1)
    } else {
      const raw = m[3]
      const value = raw == null ? '' : /^"/.test(raw) ? raw : /^'/.test(raw) ? (raw.includes('"') ? raw : `"${raw.slice(1, -1)}"`) : `"${raw}"`
      out += `[${m[1]}${m[2] ?? ''}${value}${m[4] ? ` ${m[4]}` : ''}]`
    }
    i = close
  }
  return out
}

// ── the cascade of one style, per variant ─────────────────────────────────────

/** The end of the identifier starting at `i` of `s` (escapes and non-ASCII included). */
function identEnd(s, i) {
  while (i < s.length && (/[\w-]/.test(s[i]) || s.charCodeAt(i) > 0x7f || s[i] === '\\')) i += s[i] === '\\' ? 2 : 1
  return i
}
/** Pseudo-elements CSS 2 wrote with one colon. */
const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter'])
/**
 * One compound selector (no combinator) → its simple selectors, as written: `tag`, `*`, `#id`,
 * `.class`, `[attr…]`, `:pseudo(…)`, `::element(…)`.
 */
function simpleSelectors(compound) {
  const out = []
  let i = 0
  while (i < compound.length) {
    const ch = compound[i]
    let j
    if (ch === '[') j = scanTo(compound, i + 1, [']']) + 1
    else if (ch === ':') {
      j = identEnd(compound, i + (compound[i + 1] === ':' ? 2 : 1))
      if (compound[j] === '(') j = scanTo(compound, j + 1, [')']) + 1
    } else if (ch === '#' || ch === '.') j = identEnd(compound, i + 1)
    else if (ch === '*') j = i + 1
    else j = Math.max(identEnd(compound, i), i + 1)
    out.push(compound.slice(i, j))
    i = j
  }
  return out
}
/** A complex selector as normaliseSelector writes it → its compounds, subject last (combinators dropped). */
const compoundsOf = (selector) => splitTop(selector, ' ').filter((x) => x && !/^[>+~]$/.test(x))
/** A simple selector that picks a pseudo-element: it styles another box than the element. */
const isPseudoElement = (x) => x.startsWith('::') || (x.startsWith(':') && LEGACY_PSEUDO_ELEMENTS.has(x.slice(1).toLowerCase()))
/**
 * The specificity `[ids, classes, types]` of one complex selector: :is()/:not()/:has() count their
 * most specific argument, :where() nothing, every other pseudo-class one class, a pseudo-element one type.
 */
export function specificity(selector) {
  const sp = [0, 0, 0]
  for (const compound of compoundsOf(selector))
    for (const x of simpleSelectors(compound)) {
      if (x.startsWith('#')) sp[0]++
      else if (x.startsWith('.') || x.startsWith('[')) sp[1]++
      else if (isPseudoElement(x)) sp[2]++
      else if (x.startsWith(':')) {
        const name = x.slice(1).replace(/\(.*$/s, '').toLowerCase()
        if (name === 'where') continue
        if (['is', 'not', 'has', 'matches', '-webkit-any', '-moz-any'].includes(name) && x.includes('(')) {
          const args = splitTop(x.slice(x.indexOf('(') + 1, -1), ',').map((a) => specificity(normaliseSelector(a)))
          const top = args.reduce((a, b) => (compareSpecificity(b, a) > 0 ? b : a), [0, 0, 0])
          for (let k = 0; k < 3; k++) sp[k] += top[k]
        } else sp[1]++
      } else if (x !== '*' && !x.includes('|')) sp[2]++
    }
  return sp
}
const compareSpecificity = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

const UNCOMPUTED = /\b(?:var|calc|env|color-mix|clamp|min|max|attr)\(/i
const CSS_WIDE = /^(?:inherit|initial|unset|revert|revert-layer)$/i
const SIDES = ['top', 'right', 'bottom', 'left']
/** A shorthand → its longhands: `padding`/`margin` split by value, `background` to its colour when that is all it holds, `font`/`border` to unresolvable. */
function longhands(prop, value) {
  if (prop === 'padding' || prop === 'margin') {
    const v = splitTop(value.trim(), ' ').filter(Boolean)
    if (v.length < 1 || v.length > 4) return SIDES.map((s) => [`${prop}-${s}`, null])
    const [t, r = t, b = t, l = r] = v
    return [
      [`${prop}-top`, t],
      [`${prop}-right`, r],
      [`${prop}-bottom`, b],
      [`${prop}-left`, l]
    ]
  }
  if (prop === 'background') return [['background-color', { shorthand: value }]]
  if (prop === 'font') return ['font-family', 'font-size', 'font-weight', 'line-height'].map((p) => [p, null])
  if (prop === 'border') return [['border-color', null]]
  return [[prop, value]]
}

/**
 * The parsed sheets of one style → two declaration indexes, `{ index, cond }`: selector → entries
 * `{ prop, value, important, dark, spec, selector, media, order, file, cond }` — `index` from the rules
 * a plain reading places, `cond` from the rules that may apply (`cond`: why they may). `order` runs
 * through both in sheet order. A selector scoped under the dark hook (`html[data-theme="dark"] X`) is
 * indexed under X with `dark`; `:root` and `html` are one key (`html`). `spec` is the specificity of
 * the selector as written, so the cascade still ranks `:root` over `html` and the dark hook over the
 * bare selector.
 */
function indexSheets(parsed, hook = DEFAULT_THEME_HOOK) {
  const darkRoot = `${hook.selector}[${hook.attribute}="${hook.darkValue}"]`
  const index = new Map()
  const cond = new Map()
  let order = 0
  for (const sheet of parsed) {
    const all = [...sheet.rules.map((r) => [index, r]), ...(sheet.conditional ?? []).map((r) => [cond, r])].sort((a, b) => a[1].at - b[1].at)
    for (const [into, r] of all)
      for (const sel of r.selectors) {
        let key = sel
        let dark = false
        if (key === darkRoot || key === `:root[${hook.attribute}="${hook.darkValue}"]`) (key = 'html'), (dark = true)
        else if (key.startsWith(`${darkRoot} `)) (key = key.slice(darkRoot.length + 1)), (dark = true)
        if (key === ':root') key = 'html'
        const list = into.get(key) ?? []
        for (const d of r.decls)
          for (const [prop, value] of longhands(d.prop, d.value))
            list.push({ prop, value, important: d.important, dark, spec: specificity(sel), selector: sel, media: r.media, order: order++, file: sheet.path, ...(r.why ? { cond: r.why } : {}), ...(r.unranked ? { unranked: true } : {}) })
        into.set(key, list)
      }
  }
  return { index, cond }
}
/**
 * Whether declaration `a` wins over `b`: !important first, then specificity, then the later one. An
 * `unranked` one (a layer, a scope…) is taken to win over a ranked one, and a ranked one never to win
 * over it: its rank is not modelled, so it is never dismissed.
 */
const beats = (a, b) =>
  a.unranked !== b.unranked ? Boolean(a.unranked) : a.important !== b.important ? a.important : compareSpecificity(a.spec, b.spec) ? compareSpecificity(a.spec, b.spec) > 0 : a.order > b.order
/** Where an entry comes from, as a gap names it: its selector and file, and the condition it may apply under. */
const whereOf = (e) => `${e.selector} (${e.file}${e.cond ? `, ${e.cond}` : ''})`
/** The winning declaration per property of `entries` at `variant`: !important, then specificity, then source order. */
function cascade(entries, variant) {
  const won = new Map()
  for (const e of entries ?? []) {
    if (e.dark && variant.mode !== 'dark') continue
    if (!e.media.every((c) => (c.min == null || variant.width >= c.min) && (c.max == null || variant.width <= c.max))) continue
    const cur = won.get(e.prop)
    if (!cur || beats(e, cur)) won.set(e.prop, e)
  }
  return won
}
/** `value` with every `var(--x[, fallback])` replaced by what `lookup` gives, or null when one cannot be. */
function substituteVars(value, lookup, depth = 0) {
  if (depth > 24) return null
  let out = ''
  let i = 0
  for (;;) {
    const at = value.indexOf('var(', i)
    if (at === -1) return out + value.slice(i)
    out += value.slice(i, at)
    const close = scanTo(value, at + 4, [')'])
    if (close >= value.length) return null
    const inner = value.slice(at + 4, close)
    const comma = scanTo(inner, 0, [','])
    const name = inner.slice(0, comma).trim()
    // a first argument that is not one custom property name leaves the value unresolved: its fallback does not stand in
    if (!VAR_NAME.test(name)) return null
    let v = lookup(cssIdent(name), depth + 1)
    if (v == null && comma < inner.length) v = substituteVars(inner.slice(comma + 1).trim(), lookup, depth + 1)
    if (v == null) return null
    out += v
    i = close + 1
  }
}
/** A value a design contract can hold: resolved, not a CSS-wide keyword, no function the browser still has to compute. */
const computedValue = (v) => (typeof v === 'string' && v.trim() && !UNCOMPUTED.test(v) && !CSS_WIDE.test(v.trim()) ? v.trim().replace(/\s+/g, ' ') : null)

/**
 * The resolved custom properties of `html`/`:root` at `variant`: `{ tokens, unresolved, lookup }`. A
 * token that refers to another resolves through it (a cycle, an undeclared name without a fallback, a
 * value still to compute → unresolved, listed, never guessed). A token that another rule may set on
 * html over the declaration read is unresolved too, and so is every token that reads it — its
 * fallback never stands in. Such a rival is a conditional rule (`cond` index) of html / :root, or any
 * rule, conditional or not, whose selector can match html (landing): `html.itemid-7`, `:root:has(…)`,
 * `html[lang]`, `*` — html's classes and attributes vary by route, so a rule on one of them is never
 * dismissed as not applying.
 */
function rootTokens({ index, cond }, variant) {
  const custom = (list) => list.filter((e) => e.prop.startsWith('--'))
  const decl = cascade(custom(index.get('html') ?? []), variant)
  const onHtml = [...(cond.get('html') ?? []), ...landing(index, 'html', HTML_NAMED).rivals, ...landing(cond, 'html', HTML_NAMED).rivals]
  const maySet = cascade(custom(onHtml), variant)
  const memo = new Map() // name → { v, why: [reason a conditional rule leaves it unresolved] }
  const visiting = new Set()
  const resolve = (name, depth) => {
    if (memo.has(name)) return memo.get(name)
    const e = decl.get(name)
    const c = maySet.get(name)
    if (c && (!e || beats(c, e))) {
      const r = { v: null, why: [`${whereOf(c)} may set ${name}`] }
      memo.set(name, r)
      return r
    }
    if (!e || typeof e.value !== 'string' || visiting.has(name)) return { v: null, why: [] }
    visiting.add(name)
    const why = []
    const v = substituteVars(e.value, (n, d) => {
      const r = resolve(n, d)
      why.push(...r.why)
      return why.length ? null : r.v
    }, depth)
    visiting.delete(name)
    const r = { v: why.length ? null : v, why: [...new Set(why)] }
    memo.set(name, r)
    return r
  }
  /** The resolved value of token `name`, or null; `onWhy(whys)` hears why a conditional rule left it unresolved. */
  const lookup = (name, depth = 0, onWhy = null) => {
    const r = resolve(name, depth)
    if (r.why.length && onWhy) onWhy(r.why)
    return r.v
  }
  const tokens = {}
  const unresolved = []
  for (const name of [...new Set([...decl.keys(), ...maySet.keys()])].sort()) {
    const v = computedValue(lookup(name))
    if (v != null) tokens[name] = v
    else unresolved.push(name)
  }
  return { tokens, unresolved, lookup }
}
const camel = (p) => p.replace(/-([a-z])/g, (_, c) => c.toUpperCase())

// ── which rules can style the element a role reads ────────────────────────────
//
// A role's value comes from the rules whose selector is the role's selector itself, and for a plain
// element (not single) from one exact form besides: that selector followed by :not()s each of one
// class or id the element does not carry (`a:not(.btn)`), no context, no other simple selector. No
// other selector is taken to match the element for sure. Every other rule that can match it is a
// rival, which withholds a property wherever it can win. "Can match" is decided twice, and either
// one is enough: by a closed model of the element read through a closed selector grammar
// (parseSelector — a selector outside the grammar can match anything), and by the DOM selector
// engine on probe pages that hold the element (a selector the engine matches there is a rival
// whatever the model says).
//
// The model: the element a role names has its type (unknown for a class role: any type but html, head
// or body), its own classes and ids, and the attributes it always has (a link's href). A plain element
// carries no class and no id but its own; every other attribute is unknown, so it may be there with
// any value. Its class attribute lists its own classes in an order, spacing and repetition the
// sheets do not say, so `[class…]` is compared against every such list (classAttrMay). Where a
// plain element sits is unknown too: its ancestors and siblings may be of any type and carry
// anything (`section .btn`, `.card > .btn`, `li ~ .btn` are rivals), body and html included. An
// element whose classes, ids and attributes are unknown — html, head, body, a region a page holds
// once (`single`) — may carry any; it is still taken to match a compound with a class, id or
// attribute only when the compound names it (its type, :root for html, its own class or id), a
// class-only rule being a component's. The context of a single element may carry anything, of any
// type, when the compound it joins names the element (`.wrapper .t4-main-body`); through a generic
// one (`.table > * > *`) only what names nothing or names html / body. The context of body is html
// (' ', >) or head (+, ~), of head html, of html none; there a compound with a class matches html or
// head only when the compound it joins names body (`.page body`), not through a generic one
// (`.table > :not(caption) > *`). The element a role reads is at rest: no pointer is over it or
// pressing it and nothing in it has focus, so :hover, :active and the :focus family on it never
// match, nor does a pseudo-element. Rest holds for that element only: an ancestor or a sibling may
// be hovered, pressed or focused (`.dropdown:hover .btn`, `li:focus-within + .btn` are rivals), and
// every other state — :disabled, :checked, :visited, :target, :invalid, :placeholder-shown… — is a
// state an element can be in at rest, so it may hold on the element itself too.

/** Pseudo-classes of an interaction — a pointer over or pressing the element, focus in it: the element at rest does not match them. */
const INTERACTION_PSEUDO = new Set(['hover', 'active', 'focus', 'focus-visible', 'focus-within'])
/** Pseudo-classes whose argument is a selector list the element itself must match (one of). */
const MATCHES_ANY = new Set(['is', 'where', 'matches', '-webkit-any', '-moz-any'])
const IDENT = /^-?(?:[A-Za-z_]|[^\x00-\x7f])(?:[\w-]|[^\x00-\x7f])*/
/** An attribute selector's inside: name, operator, value (quoted or an identifier), the i / s flag. */
const ATTR = /^(-?[A-Za-z_][\w-]*)\s*(?:([~|^$*]?=)\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|-?[A-Za-z_][\w-]*)(?:\s*\b([iIsS]))?)?$/
/** Whether attribute value `actual` meets `[name op value]` (`ci`: the i flag). */
function attrMeets(op, actual, value, ci) {
  const a = ci ? actual.toLowerCase() : actual
  const v = ci ? value.toLowerCase() : value
  if (op === '=') return a === v
  if (op === '~=') return v !== '' && !/\s/.test(v) && a.split(/\s+/).includes(v)
  if (op === '|=') return a === v || a.startsWith(`${v}-`)
  if (!v) return false
  return op === '^=' ? a.startsWith(v) : op === '$=' ? a.endsWith(v) : a.includes(v)
}

const WS = /[ \t\n\f\r]+/
/**
 * Whether a class attribute listing exactly `classes` — in any order, any repeated, any ASCII
 * whitespace around and between them — can meet `[class op value]` (`ci`: the i flag).
 */
export function classAttrMay(op, value, classes, ci) {
  const fold = (t) => (ci ? t.toLowerCase() : t)
  const own = [...classes].map(fold)
  const v = fold(value)
  const token = (t) => own.includes(t)
  const prefix = (t) => own.some((c) => c.startsWith(t))
  const suffix = (t) => own.some((c) => c.endsWith(t))
  if (!own.length) return false
  if (op === '=') {
    const parts = v.split(WS).filter(Boolean)
    return parts.every(token) && own.every((c) => parts.includes(c))
  }
  if (op === '~=') return v !== '' && !WS.test(v) && token(v)
  if (op === '|=') return classAttrMay('=', v, own, false) || classAttrMay('^=', `${v}-`, own, false)
  if (!v) return false
  const parts = v.split(WS)
  if (parts.length === 1) return op === '^=' ? prefix(v) : op === '$=' ? suffix(v) : own.some((c) => c.includes(v))
  // parts[0] and parts.at(-1) are '' where the value starts or ends with whitespace
  const first = parts[0]
  const last = parts.at(-1)
  const inner = parts.slice(1, -1)
  const head = op === '^=' ? first === '' || token(first) : first === '' || suffix(first)
  const tail = op === '$=' ? last === '' || token(last) : last === '' || prefix(last)
  return head && tail && inner.every(token)
}
/** One compound selector → its simple selectors `{ kind: type|id|class|attr|pseudo|element, name, op?, args? }`, or null outside the grammar. */
function parseCompound(c) {
  const out = []
  let i = 0
  while (i < c.length) {
    const ch = c[i]
    if (ch === '*' || IDENT.test(c.slice(i))) {
      if (out.length) return null
      const name = ch === '*' ? '*' : c.slice(i).match(IDENT)[0]
      out.push({ kind: 'type', name: name.toLowerCase() })
      i += name.length
    } else if (ch === '#' || ch === '.') {
      const m = c.slice(i + 1).match(IDENT)
      if (!m) return null
      out.push({ kind: ch === '#' ? 'id' : 'class', name: m[0] })
      i += 1 + m[0].length
    } else if (ch === '[') {
      const j = scanTo(c, i + 1, [']'])
      const m = c[j] === ']' ? c.slice(i + 1, j).trim().match(ATTR) : null
      if (!m) return null
      const raw = m[3] ?? null
      const value = raw == null ? null : /^["']/.test(raw) ? (raw.slice(1, -1).includes('\\') ? undefined : raw.slice(1, -1)) : raw
      out.push({ kind: 'attr', name: m[1].toLowerCase(), op: m[2] ?? null, value, ci: /^[iI]$/.test(m[4] ?? '') })
      i = j + 1
    } else if (ch === ':') {
      const two = c[i + 1] === ':'
      const m = c.slice(i + (two ? 2 : 1)).match(IDENT)
      if (!m) return null
      const name = m[0].toLowerCase()
      let j = i + (two ? 2 : 1) + m[0].length
      let args = null
      if (c[j] === '(') {
        const close = scanTo(c, j + 1, [')'])
        if (c[close] !== ')') return null
        const raw = c.slice(j + 1, close)
        args = splitTop(raw, ',').map((a) => parseSelector(normaliseSelector(a)))
        j = close + 1
      }
      out.push({ kind: two || LEGACY_PSEUDO_ELEMENTS.has(name) ? 'element' : 'pseudo', name, args })
      i = j
    } else return null
  }
  return out.length ? out : null
}
/**
 * A selector as normaliseSelector writes it → `{ compounds, combinators }` (combinators[k] joins
 * compounds[k] and compounds[k + 1]: ' ', '>', '+', '~'), or null when it is outside the grammar: a
 * namespace, an escape, a nesting `&`, a column combinator, anything this reader does not know.
 */
export function parseSelector(selector) {
  const tokens = splitTop(String(selector), ' ').filter(Boolean)
  const compounds = []
  const combinators = []
  let pending = null
  for (const t of tokens) {
    if (/^[>+~]$/.test(t)) {
      if (!compounds.length || pending) return null
      pending = t
      continue
    }
    const c = parseCompound(t)
    if (!c) return null
    if (compounds.length) combinators.push(pending ?? ' ')
    pending = null
    compounds.push(c)
  }
  return compounds.length && !pending ? { compounds, combinators } : null
}

/**
 * An element of the model: `mode` plain (nothing but its own), named (anything, when a compound
 * names it) or any (anything); `nested` — an element inside body, so never html, head or body.
 */
const element = (type, mode, own = {}, nested = false) => ({ type, mode, nested, classes: new Set(own.classes ?? []), ids: new Set(own.ids ?? []), attrs: new Set(own.attrs ?? []) })
const PAGE_TYPES = new Set(['html', 'head', 'body'])
/** The types a probe page gives the element of a plain class role (`.btn`, `.container`), whose type the sheets do not say. */
const PROBE_TYPES = ['div', 'span', 'a', 'button', 'input', 'section', 'li']
const HTML_NAMED = element('html', 'named')
const HTML_ANY = element('html', 'any')
const HEAD_ANY = element('head', 'any')
const HEAD_NAMED = element('head', 'named')
const BODY_NAMED = element('body', 'named')
const BODY_ANY = element('body', 'any')
const NESTED_ANY = element(null, 'any', {}, true)
const NESTED_NAMED = element(null, 'named', {}, true)
const ANY = element(null, 'any')
/** The role → its element. */
function elementOf(role, selector) {
  const own = parseSelector(selector).compounds[0]
  const classes = own.filter((x) => x.kind === 'class').map((x) => x.name)
  const ids = own.filter((x) => x.kind === 'id').map((x) => x.name)
  const attrs = [...(role.has ?? []).map((h) => h.slice(1, -1).toLowerCase()), ...(classes.length ? ['class'] : []), ...(ids.length ? ['id'] : [])]
  const type = own.find((x) => x.kind === 'type' && x.name !== '*')?.name ?? null
  return element(type, role.single ? 'named' : 'plain', { classes, ids, attrs }, !PAGE_TYPES.has(type))
}
/** Whether compound `c` surely holds on element E: its type or *, E's own classes and ids, attributes E always has (existence only). */
const surelyHolds = (c, E) =>
  c.every((x) => (x.kind === 'type' ? x.name === '*' || x.name === E.type : x.kind === 'class' ? E.classes.has(x.name) : x.kind === 'id' ? E.ids.has(x.name) : x.kind === 'attr' && !x.op && E.attrs.has(x.name)))
/** Whether simple selector `x` can match element E (`rest`: E is the element read, at rest; else any state). */
function simpleMay(x, E, rest) {
  switch (x.kind) {
    case 'type':
      if (x.name === '*') return true
      if (E.type != null) return x.name === E.type
      return !(E.nested && PAGE_TYPES.has(x.name))
    case 'class':
      return E.mode !== 'plain' || E.classes.has(x.name)
    case 'id':
      return E.mode !== 'plain' || E.ids.has(x.name)
    case 'attr':
      if (E.mode !== 'plain' || (x.name !== 'class' && x.name !== 'id')) return true // any other attribute: unknown, so it may be there
      // a plain element's class and id attributes hold its own classes and id, and nothing else:
      // the id is compared; the class attribute can list its classes in any order, repeated, with any spacing
      if (!E.attrs.has(x.name)) return false
      if (!x.op || typeof x.value !== 'string') return true
      return x.name === 'id' ? attrMeets(x.op, [...E.ids][0], x.value, x.ci) : classAttrMay(x.op, x.value, E.classes, x.ci)
    case 'element':
      return false
  }
  if (INTERACTION_PSEUDO.has(x.name)) return !rest
  if (x.name === 'root') return E.type === 'html' || (E.type == null && !E.nested)
  if (x.name === 'not' && x.args) return !x.args.some((a) => a && a.compounds.length === 1 && surelyHolds(a.compounds[0], E))
  if (MATCHES_ANY.has(x.name) && x.args) return x.args.some((a) => !a || compoundMay(a.compounds.at(-1), E, rest))
  return true // :has(), :nth-*(), :first-child, :link, :visited, :disabled, :checked, an unknown pseudo-class: it may hold at rest
}
/** Whether compound `c` names E: its type, :root for html, one of its own classes or ids, directly or in an :is() branch. */
const names = (c, E) =>
  c.some(
    (x) =>
      (x.kind === 'type' && E.type != null && x.name === E.type) ||
      (x.kind === 'pseudo' && x.name === 'root' && E.type === 'html') ||
      (x.kind === 'class' && E.classes.has(x.name)) ||
      (x.kind === 'id' && E.ids.has(x.name)) ||
      (x.kind === 'pseudo' && MATCHES_ANY.has(x.name) && x.args?.some((a) => !a || names(a.compounds.at(-1), E)))
  )
const positive = (x) => x.kind === 'class' || x.kind === 'id' || x.kind === 'attr'
function compoundMay(c, E, rest = true) {
  if (!c.every((x) => simpleMay(x, E, rest))) return false
  // for a class role held once (the main body), a type is as telling as a class: `a` is not it
  return E.mode !== 'named' || names(c, E) || !c.some((x) => positive(x) || (E.type == null && x.kind === 'type' && x.name !== '*'))
}
/**
 * The elements a context compound joined to `cur` by `comb` can be (see the model above). `forced`:
 * the compound matched on `cur` names it, so body's parent is html (head its sibling) whatever class
 * a compound there carries; otherwise html and head too are matched only by a compound naming them.
 */
function contextOf(cur, comb, subject, forced) {
  const up = comb === ' ' || comb === '>'
  if (cur.type === 'html') return []
  if (cur.type === 'head') return up ? [forced ? HTML_ANY : HTML_NAMED] : []
  if (cur.type === 'body') return up ? [forced ? HTML_ANY : HTML_NAMED] : [forced ? HEAD_ANY : HEAD_NAMED]
  // a plain element can sit anywhere in a page: its ancestors and siblings may be of any type and carry anything
  if (subject.mode === 'plain') return comb === ' ' ? [HTML_ANY, BODY_ANY, NESTED_ANY] : comb === '>' ? [BODY_ANY, NESTED_ANY] : [NESTED_ANY]
  const other = forced ? NESTED_ANY : NESTED_NAMED
  return comb === ' ' ? [HTML_NAMED, BODY_NAMED, other] : comb === '>' ? [BODY_NAMED, other] : [other]
}
/** A compound naming body with a class only a page-mode template sets (component.php, offline.php): it styles no route. */
const pageModeCompound = (c) => c.some((x) => x.kind === 'type' && x.name === 'body') && c.some((x) => x.kind === 'class' && PAGE_MODE_BODY_CLASSES.has(`.${x.name}`))
/**
 * Whether the model lets selector `p` (parsed) match element E, context included (`rest`: E is the
 * element read, at rest; its context is in any state).
 */
function modelMay(p, E, rest = true) {
  if (p.compounds.some(pageModeCompound)) return false
  const subject = p.compounds.at(-1)
  if (!compoundMay(subject, E, rest)) return false
  let at = [{ el: E, forced: names(subject, E) }]
  for (let k = p.compounds.length - 2; k >= 0; k--) {
    const c = p.compounds[k]
    at = at.flatMap(({ el, forced }) => contextOf(el, p.combinators[k], E, forced)).filter((el) => compoundMay(c, el, false)).map((el) => ({ el, forced: el.mode === 'any' || names(c, el) }))
    if (!at.length) return false
  }
  return true
}

/**
 * Probe pages for element E of `selector`: E, as the model has it, as a child of body and nested two
 * plain divs deep after a plain div, as each type a class role can be (a link with its href). Body and
 * html are the page's own.
 */
let probeWindow = null
function probesOf(selector, E) {
  probeWindow ??= new JSDOM('').window
  const page = () => probeWindow.document.implementation.createHTMLDocument('')
  if (E.type === 'body') return [page().body]
  if (E.type === 'html') return [page().documentElement]
  const out = []
  for (const type of E.type ? [E.type] : E.mode === 'plain' ? PROBE_TYPES : ['div'])
    for (const nested of [false, true]) {
      const doc = page()
      const el = doc.createElement(type)
      if (E.classes.size) el.className = [...E.classes].join(' ')
      const [id] = E.ids
      if (id) el.id = id
      if (E.attrs.has('href') || type === 'a') el.setAttribute('href', 'https://example.com/')
      let parent = doc.body
      if (nested) {
        for (let k = 0; k < 2; k++) parent = parent.appendChild(doc.createElement('div'))
        parent.appendChild(doc.createElement('div'))
      }
      parent.appendChild(el)
      out.push(el)
    }
  return out
}
const engineMatches = (el, key) => {
  try {
    return el.matches(key)
  } catch {
    return false // a selector the engine does not read: the model alone decides
  }
}

/** Whether parsed key `p` is the one other form read with the role's own rules: E's own simple selectors, plus :not()s of one class or id plain E lacks. */
function ownForm(p, E) {
  if (E.mode !== 'plain' || p.compounds.length !== 1) return false
  const c = p.compounds[0]
  const lacks = (a) => a && a.compounds.length === 1 && a.compounds[0].length === 1 && ((a.compounds[0][0].kind === 'class' && !E.classes.has(a.compounds[0][0].name)) || (a.compounds[0][0].kind === 'id' && !E.ids.has(a.compounds[0][0].name)))
  const extra = c.filter((x) => !(x.kind === 'type' && x.name === E.type) && !(x.kind === 'class' && E.classes.has(x.name)) && !(x.kind === 'id' && E.ids.has(x.name)))
  const own = c.length - extra.length
  return extra.length > 0 && own === (E.type ? 1 : 0) + E.classes.size + E.ids.size && new Set(c.filter((x) => !extra.includes(x)).map((x) => `${x.kind}:${x.name}`)).size === own && extra.every((x) => x.kind === 'pseudo' && x.name === 'not' && x.args?.every(lacks))
}
/**
 * The index keys other than `selector` that land on element E: `same` — the one exact form read with
 * the role's own rules (ownForm); `rivals` — every other key that can match E, by the model or by the
 * selector engine on a probe page; a key outside the selector grammar is one.
 */
function landing(index, selector, E) {
  const probes = probesOf(selector, E)
  const same = []
  const rivals = []
  for (const [key, list] of index) {
    if (key === selector) continue
    const p = parseSelector(key)
    if (p && ownForm(p, E)) same.push(...list)
    else if (!p || modelMay(p, E) || probes.some((el) => engineMatches(el, key))) rivals.push(...list)
  }
  return { same, rivals }
}
/**
 * The declarations of custom properties that can reach element E by inheritance from an element
 * above it (other than html's own cascade): for body, a key other than html / :root that can match
 * html; for any other element, a key that can match any element. An element above the one read is in
 * any state: hovered, pressed or focused too.
 */
function inheritedRivals(index, selector, E) {
  const out = []
  if (E.type === 'html') return out
  const html = E.type === 'body' ? probesOf('html', HTML_NAMED)[0] : null
  for (const [key, list] of index) {
    if (key === 'html' || key === selector) continue
    const p = parseSelector(key)
    const above = !p || (E.type === 'body' ? modelMay(p, HTML_NAMED, false) || engineMatches(html, key) : !p.compounds.some(pageModeCompound) && compoundMay(p.compounds.at(-1), ANY, false))
    if (above) out.push(...list.filter((e) => e.prop.startsWith('--')))
  }
  return out
}

// ── the values a design rule holds: one closed grammar per property ───────────

const LENGTH = /^(?:0|(?:\d+|\d*\.\d+)(?:px|em|rem|%|vw|vh|vmin|vmax|svw|svh|lvw|lvh|dvw|dvh|ch|ex|lh|rlh|pt|pc|cm|mm|in|q))$/i
const FONT_SIZE_KEYWORDS = new Set(['xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large', 'xxx-large', 'smaller', 'larger'])
const FAMILY_ITEM = /^(?:"[^"\\]*"|'[^'\\]*'|-?[A-Za-z_][\w-]*(?:\s+-?[A-Za-z_][\w-]*)*)$/
let colorProbe = null
/** A colour the CSS colour grammar accepts (named, hex, rgb/hsl and the other colour functions), one value, never currentcolor. */
function colorValue(v) {
  if (/^currentcolor$/i.test(v) || splitTop(v, ' ').filter(Boolean).length !== 1) return false
  colorProbe ??= new JSDOM('').window.document.createElement('i').style
  colorProbe.cssText = ''
  colorProbe.setProperty('color', v)
  return colorProbe.getPropertyValue('color') !== ''
}
/** Whether `value` (resolved: no var(), no computed function, no CSS-wide keyword) is a value of `prop` the design contract can hold. */
export function validDesignValue(prop, value) {
  const v = String(value).trim()
  if (CSS_WIDE.test(v)) return false
  switch (prop) {
    case 'color':
    case 'background-color':
    case 'border-color':
      return colorValue(v)
    case 'font-size':
      return LENGTH.test(v) || FONT_SIZE_KEYWORDS.has(v.toLowerCase())
    case 'line-height':
      return /^normal$/i.test(v) || /^(?:\d+|\d*\.\d+)$/.test(v) || LENGTH.test(v)
    case 'font-weight':
      return /^(?:normal|bold|bolder|lighter)$/i.test(v) || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 1000)
    case 'font-family':
      return splitTop(v, ',').every((x) => FAMILY_ITEM.test(x.trim()) && !/^(?:inherit|initial|unset|revert|revert-layer|default)$/i.test(x.trim()))
    case 'max-width':
      return /^(?:none|min-content|max-content|fit-content)$/i.test(v) || LENGTH.test(v)
    case 'padding-top':
    case 'padding-right':
    case 'padding-bottom':
    case 'padding-left':
    case 'border-radius':
      return LENGTH.test(v)
    default:
      return false
  }
}

/**
 * The design rules one style's sheets declare: per DESIGN_ROLES role, the first candidate selector
 * with a property that resolves at every variant. `{ rules, tokens, gaps, sources }` — `rules` carry
 * `from` (the files their declarations came from) beside the contract fields; a property that does
 * not resolve at every variant — not declared, contested by a rule that can win on the element, a
 * token another element can hand down, a value outside the property's grammar — is left out and
 * listed in `gaps`.
 */
export function styleDesign(parsed, { variants = DESIGN_VARIANTS } = {}) {
  // what a sheet cannot tell (an import not followed, stray text a browser folds into the next rule)
  // leaves every value of the style unknowable
  const opaque = parsed.flatMap((p) => (p.opaque ?? []).map((why) => `${p.path}: ${why}`))
  if (opaque.length)
    return {
      rules: [],
      tokens: Object.fromEntries(variants.map((v) => [v.id, {}])),
      gaps: [`no design value of the style is published: ${opaque.join('; ')} — the rules around it may be dropped or overridden by what the adapter cannot read`],
      unresolvedTokens: []
    }
  const indexes = indexSheets(parsed)
  const { index, cond } = indexes
  const roots = Object.fromEntries(variants.map((v) => [v.id, rootTokens(indexes, v)]))
  const rules = []
  const gaps = []
  for (const role of DESIGN_ROLES) {
    let found = null
    const partial = []
    for (const selector of role.selectors) {
      const E = elementOf(role, selector)
      const { same, rivals } = landing(index, selector, E)
      const entries = [...(index.get(selector) ?? []), ...same]
      if (!entries.length) continue
      // a rule that may apply is never read as the value, only as a rival that may win — its own
      // selector's and its exact form's too
      const maybe = landing(cond, selector, E)
      rivals.push(...(cond.get(selector) ?? []), ...maybe.same, ...maybe.rivals)
      const handed = [...inheritedRivals(index, selector, E), ...inheritedRivals(cond, selector, E)]
      const contested = new Map() // property → { at: variant ids, by: 'selector (file)' }
      const tokenContested = new Map() // property → { at: variant ids, by: 'selector (file) sets|hands down --x' }
      const invalid = new Map() // property → { at: variant ids, values }
      const declaredAt = new Map() // property → variant ids it is declared at, resolved or not
      const perVariant = {}
      const from = new Set()
      const contest = (map, prop, v, by) => {
        const c = map.get(prop) ?? { at: [], by: new Set() }
        if (!c.at.includes(v.id)) c.at.push(v.id)
        c.by.add(by)
        map.set(prop, c)
      }
      for (const v of variants) {
        const won = cascade(entries, v)
        const rival = cascade(rivals, v)
        const above = cascade(handed, v)
        const local = new Map([...won].filter(([p]) => p.startsWith('--')))
        perVariant[v.id] = {}
        for (const prop of role.props) {
          const e = won.get(prop)
          if (!e) continue
          declaredAt.set(prop, [...(declaredAt.get(prop) ?? []), v.id])
          const r = rival.get(prop)
          if (r && beats(r, e)) {
            contest(contested, prop, v, whereOf(r))
            continue
          }
          if (e.value == null) continue
          // The tokens the value reads on this element: its own (unless a rival rule can set them
          // there) or inherited from html (unless a rule on an element above can hand down another).
          const through = []
          const visiting = new Set()
          const lookup = (name, depth) => {
            const own = local.get(name)
            const rv = rival.get(name)
            if (rv && (!own || beats(rv, own))) return (through.push(`${whereOf(rv)} can set ${name} on it`), null)
            if (!own) {
              const up = above.get(name)
              if (up) return (through.push(`${whereOf(up)} can hand ${name} down to it`), null)
              return roots[v.id].lookup(name, depth, (whys) => through.push(...whys))
            }
            if (visiting.has(name) || typeof own.value !== 'string') return null
            visiting.add(name)
            const res = substituteVars(own.value, lookup, depth)
            visiting.delete(name)
            return res
          }
          const raw = typeof e.value === 'object' ? e.value.shorthand : e.value
          const value = computedValue(substituteVars(raw, lookup))
          if (through.length) {
            for (const t of through) contest(tokenContested, prop, v, t)
            continue
          }
          if (value == null) continue
          if (!validDesignValue(prop, value)) {
            const bad = invalid.get(prop) ?? { at: [], values: new Set() }
            bad.at.push(v.id)
            bad.values.add(value)
            invalid.set(prop, bad)
            continue
          }
          perVariant[v.id][prop] = value
          from.add(e.file)
        }
      }
      for (const [prop, c] of contested) partial.push(`${selector} ${prop}: ${[...c.by].join(', ')} can win over it at ${c.at.join(', ')}; withheld there`)
      for (const [prop, c] of tokenContested) partial.push(`${selector} ${prop}: its value reads a token another rule decides (${[...c.by].join('; ')}) at ${c.at.join(', ')}; withheld there`)
      for (const [prop, b] of invalid) partial.push(`${selector} ${prop}: ${[...b.values].map((x) => JSON.stringify(x)).join(', ')} at ${b.at.join(', ')} is not a ${prop} value the design contract reads (its grammar: ${VALUE_FORMS[prop]}); left out`)
      const props = role.props.filter((p) => variants.every((v) => perVariant[v.id][p] != null))
      for (const p of role.props) {
        if (props.includes(p)) continue
        const resolved = variants.filter((v) => perVariant[v.id][p] != null).map((v) => v.id)
        const unresolved = (declaredAt.get(p) ?? []).filter((id) => !resolved.includes(id) && !contested.get(p)?.at.includes(id) && !tokenContested.get(p)?.at.includes(id) && !invalid.get(p)?.at.includes(id))
        if (unresolved.length) partial.push(`${selector} ${p}: declared at ${unresolved.join(', ')} but no value resolves there (a token not declared, a cycle, a value still to compute or a shorthand not split); left out`)
        else if (resolved.length) partial.push(`${selector} ${p}: resolved at ${resolved.join(', ')} only; left out`)
      }
      if (!props.length) continue
      found = {
        role: role.role,
        category: role.category,
        selector,
        styles: Object.fromEntries(variants.map((v) => [v.id, Object.fromEntries(props.map((p) => [camel(p), perVariant[v.id][p]]))])),
        from: [...from].sort()
      }
      break
    }
    if (found) rules.push(found)
    else gaps.push(`${role.role} (${role.category}): no ${role.selectors.join(' / ')} declaration resolves at every variant`)
    gaps.push(...(found ? partial.filter((x) => x.startsWith(`${found.selector} `)) : partial))
  }
  const tokens = Object.fromEntries(variants.map((v) => [v.id, roots[v.id].tokens]))
  const unresolvedTokens = [...new Set(variants.flatMap((v) => roots[v.id].unresolved))].sort()
  return { rules, tokens, gaps, unresolvedTokens }
}
/** The grammar validDesignValue accepts, per property, as a gap names it. */
const VALUE_FORMS = {
  color: 'one colour, not currentcolor',
  'background-color': 'one colour, not currentcolor',
  'border-color': 'one colour, not currentcolor',
  'font-size': 'a length, a percentage or a size keyword',
  'line-height': 'normal, a number, a length or a percentage',
  'font-weight': 'normal, bold, bolder, lighter or 1–1000',
  'font-family': 'a comma list of quoted names or identifiers',
  'max-width': 'none, a length, a percentage or a content keyword',
  'padding-top': 'one non-negative length or percentage',
  'padding-right': 'one non-negative length or percentage',
  'padding-bottom': 'one non-negative length or percentage',
  'padding-left': 'one non-negative length or percentage',
  'border-radius': 'one non-negative length or percentage'
}

/**
 * The design source of the pack. `legacy`: the template ships css/styles/<theme>.css (a Tracy token
 * sheet) — read as before, one sheet for the whole site. `framework`: per template style that the
 * pages use (and the home style), the sheets its framework loads (styleSheets), parsed and cascaded
 * into rules (styleDesign). `pages` is the page-map pages; a page's style is its menu item's
 * template_style_id, the home style when that is 0. A style of another template, or one the
 * inventory does not have, is kept as a style of its own with no sheet read (`foreign`): its routes'
 * design values are left unresolved, never taken from the home style's sheets. `origin`: the source
 * site's origin; an absolute stylesheet URL a route records is taken for a captured file only on it.
 * `basePath`: the source site's base path; a URL's path is taken for a capture path only below it.
 * A page of a style whose served sheets are not recorded while others' are is in `unplacedPages`:
 * the style's values are not its own (placedPages).
 */
export function resolveDesign({ j6Dir, tpl, inv, pageMapPages, menuById, routes = [], origin = null, basePath = '/' }) {
  const framework = templateFramework(tpl)
  if (tpl.tokensFile) return { mode: 'legacy', framework, styles: [], site: null, gaps: [], unsupported: [] }
  const site = captureReader(join(j6Dir, 'capture'), j6Dir)
  const rows = new Map(inv.template_styles.filter((x) => String(x.client_id) === '0').map((x) => [String(x.id), x]))
  const homeId = tpl.styleId != null ? String(tpl.styleId) : null
  const gaps = []
  const styles = new Map()
  const styleFor = (id, foreign = null) => {
    if (!styles.has(id)) {
      const row = rows.get(id) ?? null
      styles.set(id, { id, title: row?.title ?? null, params: row ? parseJsonColumn(row.params) : {}, pages: [], routes: [], ...(foreign ? { foreign } : {}) })
    }
    return styles.get(id)
  }
  if (homeId) styleFor(homeId)
  for (const p of pageMapPages) {
    const item = p.source?.menuId != null ? menuById.get(String(p.source.menuId)) : null
    let id = item ? String(item.templateStyleId ?? '0') : '0'
    const row = rows.get(id)
    if (id !== '0' && (!row || row.template !== tpl.name)) {
      const foreign = `template style #${id} ${row ? `belongs to template "${row.template}"` : 'is not a site style in the inventory'}; no sheet of it is read and the home style's are not substituted, so its routes' design values are left unresolved`
      gaps.push(`${p.source?.joomlaPath ?? p.path}: ${foreign}`)
      const s = styleFor(id, foreign)
      s.pages.push(p.file)
      if (p.source?.joomlaPath) s.routes.push(p.source.joomlaPath)
      continue
    }
    if (id === '0') id = homeId
    if (id == null) continue
    const s = styleFor(id)
    s.pages.push(p.file)
    if (p.source?.joomlaPath) s.routes.push(p.source.joomlaPath)
  }
  // The sheets each page's route is served, as the capture recorded them (render-routes.json
  // `stylesheets`); a page no route renders, or a route with no record, has none.
  const recorded = new Map(routes.filter((r) => Array.isArray(r.stylesheets)).map((r) => [`${r.id} ${r.path.startsWith('/') ? r.path : `/${r.path}`}`, r.stylesheets]))
  for (const s of styles.values())
    s.served = s.foreign ? [] : pageMapPages.filter((p) => s.pages.includes(p.file)).map((p) => ({ page: p.file, route: p.source?.joomlaPath ?? null, hrefs: p.source?.menuId != null ? (recorded.get(`${p.source.menuId} ${p.source.joomlaPath}`) ?? null) : null }))
  const parsedCache = new Map() // sheet path → parse result, one parse per file across styles
  const unsupported = new Map() // `${path}\n${what}` → count
  // The capture-relative path of a sheet (`capture/t3-assets/css/x.css` → `t3-assets/css/x.css`), the
  // form the capture reader reads, and its leading imports followed (joomla-imports.mjs).
  const parseSheet = (sheet) => {
    if (!parsedCache.has(sheet.path)) {
      const rel = sheet.path.replace(/^capture\//, '')
      const followed = sheet.path.startsWith('capture/') ? inlineImports(sheet.text, rel, { read: (r) => site.read(r), basePath }) : { text: sheet.text, imports: [] }
      const r = parseCss(followed.text)
      parsedCache.set(sheet.path, { ...r, imports: followed.imports })
      for (const what of r.unsupported) unsupported.set(`${sheet.path}\n${what}`, (unsupported.get(`${sheet.path}\n${what}`) ?? 0) + 1)
    }
    return parsedCache.get(sheet.path)
  }
  /** One style (or one group of its routes) → its sheets, their rules and the design they give. */
  const designOf = (style) => {
    const plan = style.foreign ? { sheets: [], gaps: [style.foreign], excluded: [], unplaced: style.foreign } : styleSheets({ framework: framework.framework, tpl, site, style, origin, basePath })
    const parsed = []
    for (const sheet of plan.sheets) {
      if (sheet.status !== 'read') continue
      if (sheet.voided) {
        sheet.rules = 0
        plan.gaps.push(`${sheet.path}: read, but its rules are not published — ${sheet.voided}, is not in the capture and could override them, wherever it is linked`)
        continue
      }
      const r = parseSheet(sheet)
      sheet.rules = r.rules.length
      if (r.imports.length) sheet.imports = r.imports
      for (const im of r.imports.filter((x) => x.status === 'left')) plan.gaps.push(`${sheet.path}: @import ${im.target} is not followed (${im.reason}); what it declares may override any value of the sheet`)
      for (const w of r.withheld) plan.gaps.push(`${sheet.path}: ${w.selectors.join(', ')} ${w.props.join(', ')} withheld (${w.why})`)
      if (!r.rules.length) plan.gaps.push(`${sheet.path} was read but holds no style rule the adapter can place`)
      parsed.push({ path: sheet.path, rules: r.rules, conditional: r.conditional, opaque: r.opaque })
    }
    // unplaced: the sheets are read and recorded, and no value is published from them
    return { plan, design: styleDesign(plan.unplaced ? [] : parsed) }
  }
  for (const s of styles.values()) {
    // T3 compiles module CSS per page: the routes of one style may be served different sheet lists.
    // Each list is a cascade of its own; a value is the style's only when every list gives it.
    const groups = framework.framework === 'T3' && !s.foreign ? routeGroups(s.served, { tplName: tpl.name, origin, basePath, servedList: (h, t, o, b) => servedList(h, t, o, b, (rel) => Boolean(site.read(rel))) }) : null
    const runs = groups && groups.length > 1 ? groups.map((g) => ({ label: g.label, r: designOf({ ...s, served: g.served }) })) : [{ label: null, r: designOf(s) }]
    if (runs.length === 1) {
      const { plan, design } = runs[0].r
      s.sheets = plan.sheets.map(({ text, ...rest }) => rest)
      s.excluded = plan.excluded
      s.unplacedPages = plan.unplacedPages ?? []
      s.design = design
      s.gaps = [...plan.gaps, ...design.gaps]
    } else {
      const paths = new Set()
      s.sheets = runs.flatMap((x) => x.r.plan.sheets).filter((x) => !paths.has(x.path) && paths.add(x.path)).map(({ text, ...rest }) => rest)
      const seenEx = new Set()
      s.excluded = runs.flatMap((x) => x.r.plan.excluded).filter((x) => !seenEx.has(`${x.path}\n${x.reason}`) && seenEx.add(`${x.path}\n${x.reason}`))
      s.unplacedPages = [...new Set(runs.flatMap((x) => x.r.plan.unplacedPages ?? []))]
      s.design = mergeDesigns(runs.map((x) => ({ label: x.label, design: x.r.design, unplaced: x.r.plan.unplaced })), { variants: DESIGN_VARIANTS, roles: DESIGN_ROLES })
      const gapRuns = new Map()
      for (const x of runs) for (const g of x.r.plan.gaps) gapRuns.set(g, [...(gapRuns.get(g) ?? []), x.label])
      s.gaps = [...[...gapRuns].map(([g, labels]) => (labels.length === runs.length ? g : `${g} [${labels.join('; ')}]`)), ...s.design.gaps]
      s.routeGroups = runs.map((x) => x.label)
      const nm = (p) => (p.route ? `${p.route} (${p.page})` : p.page)
      s.gaps.unshift(`${nm(groups[0].served[0])} and ${nm(groups[1].served[0])} are served different template or compiled sheets (${groups.length} lists over ${groups.reduce((n, g) => n + g.routes.length, 0)} route(s)): each list is resolved on its own, and a value is published only where every list gives it`)
    }
    s.routes = [...new Set(s.routes)].sort()
    delete s.served
  }
  // The palette T3 declares in LESS: a fallback beside what the compiled sheets resolve.
  const homeRow = homeId != null ? rows.get(homeId) : null
  const less = framework.framework === 'T3' ? lessPalette(tpl.reader, parseJsonColumn(homeRow?.params).theme || null, { validColor: (v) => validDesignValue('color', v) }) : null
  return {
    mode: 'framework',
    framework,
    less,
    homeId,
    styles: [...styles.values()].sort((a, b) => numericCompare(a.id, b.id)),
    site,
    gaps,
    unsupported: [...unsupported].map(([k, count]) => ({ path: k.split('\n')[0], what: k.split('\n')[1], count }))
  }
}

/**
 * The tokens a design contract can expect on every page at variant `vid` (framework mode): those every
 * page resolves to one same value. A page stands with its style's tokens, or with none when what it
 * is served is not known (a page of `unplacedPages`): a token a page leaves unresolved, or resolves
 * differently, is no expectation of the site. With no page, the home style's.
 */
function commonTokens(design, vid) {
  const maps = tokenScope(design).map((x) => (x.known ? (x.style.design.tokens[vid] ?? {}) : {}))
  if (!maps.length) maps.push(design.styles.find((s) => s.id === design.homeId)?.design.tokens[vid] ?? {})
  const [first, ...rest] = maps
  return Object.fromEntries(Object.entries(first).filter(([k, v]) => rest.every((t) => t[k] === v)))
}

/**
 * The groups of pages a site-wide token expectation must hold on: per style, its placed pages
 * (`known`) and its pages whose served sheets are not known (not `known`), each with a `label`.
 */
function tokenScope(design) {
  return design.styles.flatMap((s) => [
    ...(placedPages(s).length ? [{ style: s, known: true, label: `#${s.id}` }] : []),
    ...((s.unplacedPages ?? []).length ? [{ style: s, known: false, label: `the pages of #${s.id} whose sheets are not recorded (${s.unplacedPages.join(', ')})` }] : [])
  ])
}

/** The pages of a style its values stand for: all but those whose served sheets are not recorded. */
export function placedPages(s) {
  return s.pages.filter((f) => !(s.unplacedPages ?? []).includes(f))
}

/** The origin and base path of the source site URL — both null when it is not an http(s) URL. */
function siteBase(url) {
  try {
    const u = new URL(url)
    if (!/^https?:$/.test(u.protocol)) return { origin: null, basePath: null }
    // the base path as written, as servedList reads a recorded path: one a URL parser would
    // normalise (a `.` or `..` segment, a `\`, a character outside URI_CHARS) or one with an empty
    // segment inside it (`/a//b/` is not `/a/b/`) is not known
    const raw = String(url).trim()
    const written = URI_CHARS.test(raw) ? raw.match(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*([^?#]*)/i)?.[1] : null
    const segs = written == null ? null : rawSegments(written)?.map((x) => decodeURIComponent(x))
    if (!segs || segs.some((x) => /^\.+$/.test(x) || /[/\\\x00-\x20\x7f]/.test(x))) return { origin: u.origin, basePath: null }
    return { origin: u.origin, basePath: `/${segs.map((x) => `${x}/`).join('')}` }
  } catch {
    return { origin: null, basePath: null }
  }
}

const TOKENS_NOT_COMMON = 'no token resolves to one value in every style the pages use'

/** The four palette colours a design resolved in framework mode: `{ light, dark|null }` — dark only when the source's dark cascade changes the body colours. */
export function frameworkPalette(design, tpl) {
  const home = design.styles.find((s) => s.id === design.homeId)
  const tokens = home?.design.tokens ?? {}
  const names = FRAMEWORK_TOKENS[design.framework.framework] ?? {}
  const body = home?.design.rules.find((r) => r.role === 'body-colors')?.styles ?? null
  const L = tokens['desktop-light'] ?? {},
    D = tokens['desktop-dark'] ?? {}
  // a token or setting that is not one colour is not a palette colour
  const colorOf = (v) => (typeof v === 'string' && validDesignValue('color', v) ? v : null)
  // T3's LESS declaration (joomla-less.mjs) stands last, where neither the resolved CSS nor the template's settings give the colour.
  const from = {}
  const lessOf = (key) => {
    const v = design.less?.values[key]
    if (!v || !colorOf(v.value)) return null
    from[key] = `${v.from.file}:${v.from.line} @${v.from.name}${v.chain.length > 1 ? ` (via @${v.chain.slice(0, -1).join(' → @')})` : ''}`
    return v.value
  }
  const light = {
    primary: colorOf(names.primary && L[names.primary]) ?? colorOf(tpl.theme.color_primary) ?? lessOf('primary'),
    secondary: colorOf(names.secondary && L[names.secondary]) ?? colorOf(tpl.theme.color_secondary) ?? lessOf('secondary'),
    body_bg: body?.['desktop-light'].backgroundColor ?? colorOf(names.body_bg && L[names.body_bg]) ?? colorOf(tpl.theme.body_bg_color) ?? lessOf('body_bg'),
    text: body?.['desktop-light'].color ?? colorOf(names.text && L[names.text]) ?? colorOf(tpl.theme.body_text_color) ?? lessOf('text')
  }
  const lb = body?.['desktop-light'],
    db = body?.['desktop-dark']
  const hasDark = Boolean(db?.backgroundColor && db?.color && lb && (db.backgroundColor !== lb.backgroundColor || db.color !== lb.color))
  const dark = hasDark
    ? {
        primary: colorOf(names.primary && D[names.primary]) ?? light.primary,
        secondary: colorOf(names.secondary && D[names.secondary]) ?? light.secondary,
        body_bg: db.backgroundColor,
        text: db.color
      }
    : null
  return { light, dark, hasDark, from }
}

/** The design source as provenance.json and adapter-coverage.json record it: framework, evidence, and per style its routes, sheets, rules and gaps. */
function cssProvenance(design) {
  return {
    mode: design.mode,
    framework: design.framework.framework,
    evidence: design.framework.evidence,
    notes: design.framework.notes,
    ...(design.mode === 'framework'
      ? {
          less: design.less ?? null,
          homeStyle: design.homeId,
          styles: design.styles.map((s) => ({
            id: s.id,
            title: s.title,
            routes: s.routes,
            sheets: s.sheets,
            excluded: s.excluded,
            unresolvedPages: s.unplacedPages ?? [],
            ...(s.routeGroups ? { routeGroups: s.routeGroups } : {}),
            rules: (s.ruleIds ?? []).map((id, k) => ({ id, selector: s.design.rules[k].selector, from: s.design.rules[k].from })),
            unresolvedTokens: s.design.unresolvedTokens,
            gaps: s.gaps
          })),
          gaps: design.gaps,
          unsupported: design.unsupported
        }
      : {})
  }
}

/**
 * The heading a Joomla category blog prints over its link-only titles (`num_links`): the core
 * language string COM_CONTENT_MORE_ARTICLES of en-GB, "More Articles …" (components/com_content
 * tmpl/category/blog_links.php). The inventory carries no language files, so the string is the
 * core one; the seeder draws it as an editable heading.
 */
const MORE_ARTICLES = Object.freeze({ heading: 'More Articles …', from: 'Joomla core language string COM_CONTENT_MORE_ARTICLES (en-GB)' })

// ── article extra fields ──────────────────────────────────────────────────────

/**
 * `--article-fields` config: `{ "<field>": { "className"?: "<class>", "skip"?: ["<subfield>"],
 * "number"?: { "pad": <n> }, "meta"?: "<post meta key>" } | "skip" }`. `meta` writes the field's
 * value as that post meta key (text only), for a listing card or a template to print through Block
 * Bindings and the editor to change; alone it keeps the field out of the body, with a drawing
 * option beside it the field is both. A page takes no post meta: there the field is reported. `skip` leaves subfields of a subform row out on purpose
 * (the article layout never prints them); `number` opens each row with its 1-based position, padded
 * to `pad` digits (a layout that prints `sprintf('%02d', $i)` is `{ "pad": 2 }`). Throws on any
 * other shape, so a typo is an error rather than a field that silently goes nowhere. `required`
 * (a file named on the command line) makes a `null` config an error too, not "no config".
 */
export function checkArticleFields(config, { required = false } = {}) {
  if (config == null && !required) return
  if (config == null || typeof config !== 'object' || Array.isArray(config)) throw new Error('--article-fields: expected an object of field → { className, skip, number, meta } | "skip"')
  const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v)
  const metaOwner = new Map() // meta key → field
  for (const [name, v] of Object.entries(config)) {
    if (v === 'skip') continue
    const ok =
      isObject(v) &&
      Object.keys(v).every((k) => ['className', 'skip', 'number', 'meta'].includes(k)) &&
      (v.className == null || typeof v.className === 'string') &&
      (v.skip == null || (Array.isArray(v.skip) && v.skip.every((k) => typeof k === 'string' && k.trim()))) &&
      (v.number == null || (isObject(v.number) && Object.keys(v.number).every((k) => k === 'pad') && Number.isInteger(v.number.pad) && v.number.pad >= 1)) &&
      (v.meta === undefined || typeof v.meta === 'string')
    if (!ok)
      throw new Error(`--article-fields: field "${name}" takes { "className": "<class>", "skip": ["<subfield>"], "number": { "pad": <n ≥ 1> }, "meta": "<post meta key>" } or "skip"`)
    if (v.meta === undefined) continue
    if (!META_KEY.test(v.meta) || v.meta.startsWith('tracy_'))
      throw new Error(`--article-fields: field "${name}": meta key "${v.meta}" must be a lower-case name ([a-z][a-z0-9_-], at most 64 characters) — not protected (a leading underscore) and not the seeder's own (tracy_*)`)
    if (metaOwner.has(v.meta)) throw new Error(`--article-fields: fields "${metaOwner.get(v.meta)}" and "${name}" both write meta "${v.meta}"`)
    metaOwner.set(v.meta, name)
  }
}

/** A post meta key an article field may become (the seeder's checkPostMeta takes the same). */
const META_KEY = /^[a-z][a-z0-9_-]{0,63}$/
/** Whether a field config draws the field in the body: any drawing option, or none at all; `{ "meta" }` alone does not. */
const drawsField = (cfg) => cfg.meta === undefined || cfg.className != null || cfg.skip != null || cfg.number != null

// ── articles kept as posts ────────────────────────────────────────────────────

const TEMPLATE_SLUG = /^[a-z0-9][a-z0-9-]*$/

/**
 * `--article-posts` config: `{ "<article id>": { "template"?: "<template slug>" } }`. By default an
 * article a menu item opens on its own is a page at the menu's path. An article named here stays a
 * post — in its category, in the category blog and the featured list, as the source lists it —
 * and the menu path becomes a `single` view of it (the seeder points the path at the post); the
 * post renders through `template` when one is given (a template of its own for the page the
 * source draws, related articles and all). Throws on any other shape, so a typo is an error
 * rather than a setting that silently does nothing.
 */
export function checkArticlePosts(config, { required = false } = {}) {
  if (config == null && !required) return
  if (config == null || typeof config !== 'object' || Array.isArray(config))
    throw new Error('--article-posts: expected an object of article id → { template }')
  for (const [id, v] of Object.entries(config)) {
    if (!/^\d+$/.test(id)) throw new Error(`--article-posts: "${id}" is not an article id`)
    const ok =
      v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every((k) => k === 'template') &&
      (v.template == null || (typeof v.template === 'string' && TEMPLATE_SLUG.test(v.template)))
    if (!ok) throw new Error(`--article-posts: article ${id} takes { "template": "<template slug>" } or {}`)
  }
}

const escapeText = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeAttr = (t) => escapeText(t).replace(/"/g, '&quot;')
/** A subfield value that is content: text that is not blank, a number, a boolean, or a non-empty subform. */
const hasValue = (v) =>
  typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.trim() !== '') || (v !== null && typeof v === 'object' && Object.values(v).some(hasValue))
const IMAGE_VALUE = /^(?:images|media)\/[^\s<>"]+\.(?:jpe?g|png|gif|webp|svg|avif)(?:#.*)?$/i

/**
 * One extra field as HTML for the block converter: a wrapper `<div class>` (config `className`,
 * else `joomla-field-<name>`), a row per subform entry (`<class>__item`), and per value a heading
 * when its key names a title, an image when it is a media path, the value's own markup when it is
 * HTML, else a paragraph — each carrying `<class>__<last key segment>` for the theme to style.
 * Text stays text: the converter turns this into core/group, core/heading, core/paragraph.
 * Config `skip` leaves the named subfields out; `number` opens each row with a paragraph
 * `<class>__number` holding its position — only what the config states, never a number read off
 * an image file name. `seen` collects the subfield keys the value has, `skipped` the
 * `<field>.<subfield>` a `skip` left out while holding a value.
 */
function fieldHtml(name, value, cfg = {}, dropped = [], seen = new Set(), skipped = []) {
  const cls = cfg.className || `joomla-field-${slugify(name)}`
  const skip = new Set(cfg.skip ?? [])
  const part = (key, v) => {
    seen.add(String(key))
    if (skip.has(String(key))) {
      if (hasValue(v)) skipped.push(`${name}.${key}`)
      return ''
    }
    if (typeof v === 'number' || typeof v === 'boolean') v = String(v)
    if (v && typeof v === 'object') dropped.push(`${name}.${key}`)
    if (typeof v !== 'string' || !v.trim()) return ''
    const text = v.trim()
    const c = `${cls}__${slugify(String(key).split(/[_-]/).pop())}`
    if (IMAGE_VALUE.test(text)) return `<img class="${escapeAttr(c)}" src="${escapeAttr(text)}" alt="">`
    const html = /<[a-z][^>]*>/i.test(text) ? text : escapeText(text)
    if (/^\s*<(p|div|ul|ol|h[1-6]|figure|table|blockquote|section)\b/i.test(html)) return `<div class="${escapeAttr(c)}">${html}</div>`
    if (/(title|heading|name)$/i.test(String(key))) return `<h4 class="${escapeAttr(c)}">${html}</h4>`
    return `<p class="${escapeAttr(c)}">${html}</p>`
  }
  let inner
  if (value && typeof value === 'object') {
    let n = 0
    const number = () => (cfg.number ? `<p class="${escapeAttr(`${cls}__number`)}">${String(++n).padStart(cfg.number.pad, '0')}</p>` : '')
    inner = Object.values(value)
      .map((row) =>
        row && typeof row === 'object'
          ? `<div class="${escapeAttr(`${cls}__item`)}">${number()}${Object.entries(row).map(([k, v]) => part(k, v)).join('')}</div>`
          : part(name, row)
      )
      .join('')
  } else inner = part(name, value)
  return `<div class="${escapeAttr(cls)}">${inner}</div>`
}

function readTemplate(j6Dir, inv) {
  const homeStyle =
    inv.template_styles.find((s) => String(s.client_id) === '0' && String(s.home) === '1') ??
    inv.template_styles[0]
  const params = parseJsonColumn(homeStyle?.params)
  const name = homeStyle?.template ?? 'tracy'
  // The template name becomes a directory under capture/templates: a name that is not one plain
  // directory name ("../x", "a/b") would read outside the capture, so it is refused.
  if (!plainName(String(name)))
    throw new Error(`template style #${homeStyle?.id}: template name ${JSON.stringify(name)} is not a plain directory name; refusing to read capture/templates/${name}`)
  // The style's own keys name files under the capture the same way.
  const key = (param, fallback) => {
    const v = params[param] || fallback
    if (!plainName(String(v)))
      throw new Error(`template style #${homeStyle?.id}: ${param} ${JSON.stringify(v)} is not a plain file name; refusing to read it from capture/templates/${name}`)
    return String(v)
  }
  const dir = join(j6Dir, 'capture', 'templates', name)
  // Every capture read goes through one bounded, read-only reader: no symbolic link followed,
  // nothing outside the capture, no special file, nothing over SCAN_MAX_BYTES.
  const reader = captureReader(dir, j6Dir)
  const etcFiles = {} // kind → the capture file its settings came from
  // T4 reads a profile from local/etc first and takes that file wholesale (no per-key merge with etc/); an
  // empty file, or a profile that is not there, falls back to `default`.
  const etc = (kind, k) => {
    for (const candidate of [k, 'default']) {
      if (!candidate) continue
      for (const base of ['local/etc', 'etc']) {
        const f = reader.read(`${base}/${kind}/${candidate}.json`)
        if (!f) continue
        if (f.text === '' || f.text === '0') break
        etcFiles[kind] = f.path
        return parseJsonText(f.text, join(j6Dir, f.path))
      }
    }
    return {}
  }
  const themeKey = key('typelist-theme', 'default')
  const siteKey = params['typelist-site'] ? key('typelist-site') : null
  const cssFile = reader.read(`css/styles/${themeKey}.css`)
  const details = reader.read('templateDetails.xml')
  return {
    name,
    dir,
    reader,
    exists: reader.ok,
    version: details ? (details.text.match(/<version>([^<]+)<\/version>/)?.[1] ?? '').trim() : '',
    styleTitle: homeStyle?.title ?? name,
    styleId: homeStyle?.id ?? null,
    site: etc('site', siteKey),
    siteFile: etcFiles.site ?? null,
    theme: etc('theme', themeKey),
    themeFile: etcFiles.theme ?? null,
    themeKey,
    tokens: cssFile ? extractCssTokens(cssFile.text) : { light: {}, dark: {} },
    tokensFile: cssFile ? join(j6Dir, cssFile.path) : null,
    acmDir: reader.isDir('acm') ? join(dir, 'acm') : null,
    layoutDir: join(dir, 'etc', 'layout')
  }
}

/** The design-spec.md section of the source's own fonts: what each used style declares, and what the running source drew. */
function sourceFontsSection(staticReport, browser) {
  const L = ['', '## Source fonts (Phase 2)', '']
  L.push('Declared = the family the source template resolves to; drawn = the font the browser painted on the running source. They are recorded apart: a later phase compares the port with the family the source intends, and a drawn fallback is a finding of the source, not a target.', '')
  L.push('| style | template | role | declared family | verdict |', '|---|---|---|---|---|')
  for (const st of staticReport.styles.filter((x) => x.used && x.roles))
    for (const r of st.roles) L.push(`| #${st.id} ${st.title ?? ''} | ${st.template} | ${r.role} | ${r.family ? '`' + r.family + '`' : 'not declared in the source'} | ${r.verdict} |`)
  const typo = measuredTypography(browser)
  L.push('')
  if (typo) {
    L.push('Measured on the running source (home page, 1440px):', '', '| role | asked for | drawn | size |', '|---|---|---|---|')
    for (const [role, v] of Object.entries(typo)) L.push(`| ${role} | ${v ? '`' + v.requested + '`' : 'absent'} | ${v?.drawn ?? '—'} | ${v?.size ?? '—'} |`)
  } else L.push('No browser measurement of the source was given.')
  return L.join('\n') + '\n'
}

/** The `typelist-*` profile names of a template style's params JSON. */
const typelistOf = (params) => Object.fromEntries(['typelist-site', 'typelist-theme'].filter((k) => typeof params?.[k] === 'string').map((k) => [k, params[k]]))

/**
 * The static source-font report of the dump: the effective T4 site/theme profile (or the T3 declarations) of every
 * template style the menu uses, read from the captured templates (source-font.mjs, the analyzer the quickstart
 * inventory uses too). A table the dump lacks is an evidence gap, never an empty answer.
 */
function sourceFontsStatic({ j6Dir, inv, missingTables, tpl }) {
  // the source's identity: the bytes of the inventory dump the styles and menu came from
  let identity = null
  try {
    identity = createHash('sha256').update(readFileSync(join(j6Dir, 'inventory.json'))).digest('hex')
  } catch {}
  const gaps = []
  const hasStyles = !missingTables.includes('template_styles')
  const hasMenu = !missingTables.includes('menu')
  const styles = hasStyles
    ? inv.template_styles.map((r) => ({
        id: String(r.id),
        template: String(r.template ?? ''),
        client: String(r.client_id) === '0' ? 'site' : 'administrator',
        home: String(r.home ?? '0'),
        title: r.title ?? null,
        typelist: typelistOf(parseJsonColumn(r.params))
      }))
    : null
  const menu = hasMenu
    ? inv.menu.map((r) => ({ id: String(r.id), path: r.path ?? '', alias: r.alias ?? '', type: r.type ?? '', published: String(r.published), template_style_id: String(r.template_style_id ?? '0'), home: String(r.home ?? '0'), client_id: String(r.client_id ?? '0') }))
    : null
  const capture = captureReader(join(j6Dir, 'capture'), j6Dir)
  if (!capture.ok) gaps.push(`capture/ of ${j6Dir} is not readable: the template files were not read`)
  const dirs = [...new Set((styles ?? []).filter((x) => x.client === 'site').map((x) => x.template))].filter((d) => plainName(d))
  const templates = dirs.map((dir) => {
    if (dir === tpl.name) return { dir, framework: templateFramework(tpl).framework }
    const reader = captureReader(join(j6Dir, 'capture', 'templates', dir), j6Dir)
    return { dir, framework: reader.ok ? templateFramework({ name: dir, reader }).framework : 'unknown' }
  })
  const list = capture.read(GOOGLE_LIST)
  return analyzeStatic({ templates, styles, menu, reader: captureFontReader(capture), googleListText: list ? list.text : null, gaps, identity })
}

/** The static source-font report of a dump directory, as buildSpecPack computes it (a test or a script asks for it without building a pack). */
export function sourceFontsOfDump(j6Dir) {
  const inventoryPath = join(j6Dir, 'inventory.json')
  const rawInventory = readDumpJson(inventoryPath)
  if (rawInventory === undefined) throw new Error(`inventory.json not found in ${j6Dir}`)
  const { missingTables } = checkInventoryShape(rawInventory, inventoryPath)
  const inv = normaliseInventory(rawInventory)
  return sourceFontsStatic({ j6Dir, inv, missingTables, tpl: readTemplate(j6Dir, inv) })
}

const TEMPLATE_DIR_NAME = /^[A-Za-z0-9_.-]+$/

/** JSON.parse naming the file it came from. */
const parseJsonText = (text, where) => {
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new Error(`${where}: ${e.message}`)
  }
}

/** The T3 layout `name` of the capture (etc/layout/<name>.ini + tpls/), read once; null when the template has no such layout. */
function t3Layout(tpl, name) {
  tpl.t3Layouts ??= new Map()
  if (!tpl.t3Layouts.has(name)) tpl.t3Layouts.set(name, readT3Layout(tpl.reader, name))
  return tpl.t3Layouts.get(name)
}

/**
 * A T4 layout file → the ordered row contents that matter: positions and the component slot.
 * `null` when the layout is not captured, not a plain name, or not readable (the capture reader
 * reports why).
 */
function layoutOrder(tpl, layout) {
  return layoutEvidence(tpl, layout).order
}

const POSITION_NAME = /^[A-Za-z0-9_.-]+$/
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * What a layout proves, one typed result: `{ order, body, bodyCauses, complete, positionCauses, componentless, uncertain }`.
 * `order` as layoutOrder (null: not captured). Two separate facts, never one:
 *  - `body`: 'present' (a component row was read), 'absent' (proven: every cell was read in full and none draws it) or
 *    'unknown'; `bodyCauses` name what leaves it open (for 'present' with causes: the include is conditional or an
 *    unsupported guard may precede it). `componentless` is `body === 'absent'`; `uncertain` is a body that is not
 *    proven either way (causes, and not absent).
 *  - `complete`: every position the layout draws was read, so a position missing from `order` is proven undrawn;
 *    `positionCauses` name what was not read.
 * A T3 layout takes both from the reader (readT3Layout). A T4 layout is read strictly: the root and `layout.sections`
 * must be objects/lists, every row an object with a `contents` list, every cell an object that is a component, a
 * positions cell naming at least one plain position, or a block whose markup is captured and holds only supported
 * includes (blockMarkupEvidence). Anything else is a named cause, never an absence claim and never an unnamed TypeError.
 * A diagnostic that a fully read layout prints no body is a finding, not a cause.
 */
function layoutEvidence(tpl, layout) {
  const none = { order: null, body: 'unknown', bodyCauses: [], complete: false, positionCauses: [], componentless: false, uncertain: false }
  if (!plainName(String(layout))) return none
  tpl.layoutEvidence ??= new Map()
  if (tpl.layoutEvidence.has(layout)) return tpl.layoutEvidence.get(layout)
  const f = tpl.reader.read(`etc/layout/${layout}.json`)
  let out = none
  const typed = (order, body, bodyCauses, positionCauses) => ({ order, body, bodyCauses, complete: positionCauses.length === 0, positionCauses, componentless: body === 'absent', uncertain: body !== 'absent' && bodyCauses.length > 0 })
  if (!f) {
    const t3 = t3Layout(tpl, layout)
    if (t3) out = typed(t3.order, t3.body.state, t3.body.causes, t3.positionCauses)
  } else {
    const root = parseJsonText(f.text, join(tpl.reader.j6Dir, f.path))
    const causes = []
    const order = []
    const sections = isObject(root) && isObject(root.layout) ? root.layout.sections : undefined
    if (!isObject(root)) causes.push(`${f.path}: the layout root is ${root === null ? 'null' : Array.isArray(root) ? 'a list' : typeof root}, not an object`)
    else if (!isObject(root.layout)) causes.push(`${f.path}: "layout" is missing or not an object`)
    else if (!Array.isArray(sections)) causes.push(`${f.path}: "layout.sections" is missing or not a list`)
    else if (!sections.length) causes.push(`${f.path}: "layout.sections" is empty`)
    ;(Array.isArray(sections) ? sections : []).forEach((row, r) => {
      const at = `${f.path} section ${r}`
      if (!isObject(row) || !Array.isArray(row.contents)) return causes.push(`${at} is not an object with a contents list`)
      const attrs = isObject(row.attributes) ? row.attributes : {}
      const rowClasses = row.class ?? row.classes ?? row.className ?? attrs.class ?? attrs.className ?? []
      const classes = Array.isArray(rowClasses) ? rowClasses.map(String).map((value) => value.trim()).filter(Boolean) : String(rowClasses).split(/\s+/).filter(Boolean)
      const background = {}
      const rowBackground = isObject(row.background) ? row.background : {}
      const image = row.background_image ?? row.backgroundImage ?? row.bg_image ?? rowBackground.image ?? attrs.background_image ?? attrs.backgroundImage
      const color = row.background_color ?? row.backgroundColor ?? row.bg_color ?? rowBackground.color ?? attrs.background_color ?? attrs.backgroundColor
      if (typeof image === 'string' && image.trim()) background.image = image.trim()
      if (typeof color === 'string' && color.trim()) background.color = color.trim()
      const spacing = row.spacing ?? row.padding ?? row['section-padding'] ?? attrs.spacing ?? attrs.padding ?? null
      const frame = classes.length || Object.keys(background).length || (spacing != null && spacing !== '')
        ? { classes, ...(Object.keys(background).length ? { background } : {}), ...(spacing != null && spacing !== '' ? { spacing } : {}) }
        : null
      row.contents.forEach((c, i) => {
        const cell = `${at} cell ${i}`
        if (!isObject(c)) return causes.push(`${cell} is not an object`)
        if (c.type === 'component') return order.push({ kind: 'component', ...(frame ? { row: row.name ?? String(r), frame } : {}) })
        if (c.type === 'positions') {
          const names = typeof c.positions === 'string' ? c.positions.split(/[,\s]+/).filter(Boolean) : null
          if (!names?.length || !names.every((n) => POSITION_NAME.test(n))) return causes.push(`${cell} is a positions cell without a readable list of position names`)
          return names.forEach((pos) => order.push({ kind: 'position', name: pos, ...(frame ? { row: row.name ?? String(r), frame } : {}) }))
        }
        if (c.type === 'block') {
          const name = c.block || c.name
          if (typeof name !== 'string' || !plainName(name)) return causes.push(`${cell} is a block cell without a plain block name`)
          const m = tpl.reader.read(`html/layouts/t4/block/${name}.html`)
          if (!m) return causes.push(`${cell}: block markup html/layouts/t4/block/${name}.html is not captured`)
          const ev = blockMarkupEvidence(m.text)
          if (ev.components) causes.push(`${cell}: block ${name} includes the component, which the adapter does not compose from a block`)
          for (const x of ev.causes) causes.push(`${cell}: block ${name}: ${x}`)
          return
        }
        causes.push(`${cell} has an unsupported type ${JSON.stringify(c.type ?? null)}`)
      })
    })
    const hasComponent = order.some((o) => o.kind === 'component')
    out = typed(order, hasComponent ? 'present' : causes.length ? 'unknown' : 'absent', hasComponent ? [] : causes, causes)
  }
  tpl.layoutEvidence.set(layout, out)
  return out
}

/**
 * The ACM field schemas (acm/<type>/tmpl/<style>.xml) of the instances in the inventory, read
 * through the capture reader — the probe acmInstances makes, without its unbounded file reads.
 */
function acmSchemas(inv, tpl) {
  const schemas = {}
  if (!tpl.acmDir) return schemas
  for (const m of inv.modules) {
    if (m.module !== 'mod_ja_acm' || Number(m.client_id) !== 0) continue
    const cfg = decodeAcmConfig(m.params)
    const type = cfg?.[':type']?.split(':').pop() ?? ''
    if (!type) continue
    const style = cfg?.[type]?.[`jatools-layout-${type}`] ?? parseJsonColumn(m.params)[`jatools-layout-${type}`] ?? 'style-1'
    const k = `${type}/${style}`
    if (Object.hasOwn(schemas, k) || !plainName(type) || !plainName(String(style))) continue
    const f = tpl.reader.read(`acm/${type}/tmpl/${style}.xml`)
    if (f) schemas[k] = parseAcmSchema(f.text)
  }
  return schemas
}

// ── build ─────────────────────────────────────────────────────────────────────

/**
 * The global com_content options, checked: an object, or a JSON string of one (the column as
 * #__extensions holds it). Anything else — `null`, a list, a number — throws, naming `source`.
 */
function checkContentParams(value, source = '--content-params') {
  let v = value
  if (typeof v === 'string') v = JSON.parse(v)
  if (v === null || typeof v !== 'object' || Array.isArray(v))
    throw new Error(`${source}: expected an object of com_content options (show_category_title, show_description, maxLevel, …), got ${v === null ? 'null' : Array.isArray(v) ? 'a list' : typeof v}`)
  return v
}

/** A content-params.json larger than this is not an options object. */
const CONTENT_PARAMS_MAX_BYTES = 1024 * 1024

/**
 * The global com_content options (the `params` of com_content in #__extensions), which a menu item
 * set to "Use Global" inherits, and where they came from — first of:
 *   1. `contentParams` when given (the API option, the CLI's --content-params);
 *   2. `<j6Dir>/content-params.json` when it exists (an override kept beside a dump);
 *   3. the one `type: component, element: com_content` row of the inventory's extensions table, whose
 *      `params` joomla-dump.mjs exports (the column as the database holds it, a JSON string).
 * `{ params, from }`; `params` is null (and archiveDisplay then throws for any option a menu item
 * inherits) only for an inventory with no extensions table — a dump made before the table was
 * exported. The first source that applies is the only one read: a given value that is not an object
 * (`null` included), a file that cannot be read, or an extensions table with no com_content row, two
 * of them, or one without params throws naming that source; nothing falls through to the next.
 */
export function resolveContentParams(j6Dir, contentParams = undefined, inventory = undefined) {
  if (contentParams !== undefined) return { params: checkContentParams(contentParams), from: 'the contentParams option (--content-params)' }
  const file = join(j6Dir, 'content-params.json')
  // Opened without following: a link (dangling or not) is a broken override, not an absent one.
  const override = readDumpJson(file, CONTENT_PARAMS_MAX_BYTES)
  if (override !== undefined) return { params: checkContentParams(override, file), from: file }
  const where = join(j6Dir, 'inventory.json')
  const inv = inventory === undefined ? readDumpJson(where) : inventory
  if (!inv || !Array.isArray(inv.extensions)) return { params: null, from: null }
  const rows = inv.extensions.filter((r) => r && String(r.element) === 'com_content' && String(r.type) === 'component')
  const hint = 'dump the site again with joomla-dump.mjs, or pass --content-params <file>'
  if (rows.length !== 1)
    throw new Error(
      `${where}: the extensions table holds ${rows.length ? `${rows.length} com_content component rows (extension_id ${rows.map((r) => r.extension_id ?? '?').join(', ')}); which one's options apply cannot be told` : 'no com_content component row, so the global com_content options are not in the dump'}; ${hint}`
    )
  const [row] = rows
  const label = `${where}: extensions com_content (extension_id ${row.extension_id ?? '?'}) params`
  if (!Object.hasOwn(row, 'params') || row.params === null) throw new Error(`${label}: not exported; ${hint}`)
  if (typeof row.params !== 'string') throw new Error(`${label}: expected the column as the database holds it (a JSON string), got ${Array.isArray(row.params) ? 'a list' : typeof row.params}`)
  let parsed
  try {
    parsed = JSON.parse(row.params)
  } catch (e) {
    throw new Error(`${label}: not JSON (${e.message})`)
  }
  return { params: checkContentParams(parsed, label), from: `${where} (extensions, com_content extension_id ${row.extension_id ?? '?'})` }
}

/** A site-config.json larger than this is not the dozen settings of SITE_CONFIG_FIELDS. */
const SITE_CONFIG_MAX_BYTES = 64 * 1024

/**
 * The public global settings joomla-dump.mjs reads from configuration.php (`<j6Dir>/site-config.json`,
 * see SITE_CONFIG_FIELDS): `{ config, from }`, both null when the dump has no such file (made
 * without a web target, or before the file existed). A file that is not a regular file, is too large,
 * is not a JSON object of strings, or holds a field outside SITE_CONFIG_FIELDS throws naming it —
 * a field the allow-list does not name (a credential among them) is refused, not read past.
 */
/**
 * The identity fields the source itself declares empty, each with the evidence that says so, or
 * null. The tagline: the etc/site settings file the adapter read declares `site_slogan` as a blank
 * string (configuration.php has no tagline setting). The name: that file declares `site_name`
 * blank AND site-config.json (configuration.php) declares `sitename` blank. A file not read, a
 * field not declared or not a string is no evidence of absence.
 */
export function absentIdentity(tpl) {
  const blank = (v) => typeof v === 'string' && v.trim() === ''
  const site = tpl.siteFile ? (tpl.site ?? {}) : null
  const cfg = tpl.siteConfig ?? { config: null, from: null }
  return {
    name: site && blank(site.site_name) && cfg.from && blank(cfg.config?.sitename) ? `${tpl.siteFile} declares site_name ${JSON.stringify(site.site_name)} and site-config.json declares sitename ${JSON.stringify(cfg.config.sitename)}` : null,
    tagline: site && blank(site.site_slogan) ? `${tpl.siteFile} declares site_slogan ${JSON.stringify(site.site_slogan)}` : null
  }
}

export function loadSiteConfig(j6Dir) {
  const file = join(j6Dir, 'site-config.json')
  const v = readDumpJson(file, SITE_CONFIG_MAX_BYTES)
  if (v === undefined) return { config: null, from: null }
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${file}: expected an object of configuration.php fields (${SITE_CONFIG_FIELDS.join(', ')})`)
  const outside = Object.keys(v).filter((k) => !SITE_CONFIG_FIELDS.includes(k))
  if (outside.length) throw new Error(`${file}: field(s) outside the public allow-list: ${outside.join(', ')}; dump the site again with joomla-dump.mjs`)
  for (const [k, x] of Object.entries(v)) if (typeof x !== 'string') throw new Error(`${file}: ${k} is ${x === null ? 'null' : Array.isArray(x) ? 'a list' : typeof x}, expected a string`)
  return { config: v, from: file }
}

/**
 * Build the whole pack. Returns the numbers the CLI reports. One run at a time writes a pack: the
 * run holds `<out>.lock` from before the first write to after the coverage report, so two runs
 * (with --force) cannot interleave their files or delete each other's report.
 * @param {{ j6Dir: string, out: string, siteUrl?: string, force?: boolean, pageFloor?: number, now?: string }} opts
 */
export function buildSpecPack(opts) {
  // The dump is named by an absolute path from here on: what the pack records of it (provenance, the content contract's
  // source, the coverage census) must not depend on the directory the adapter was started in.
  if (typeof opts?.j6Dir === 'string') opts = { ...opts, j6Dir: resolve(opts.j6Dir) }
  const release = lockOutput(opts.out)
  try {
    return buildSpecPackLocked(opts)
  } finally {
    release()
  }
}

/** Is a process of this host running? (EPERM: it runs under another user.) */
const processAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}

/**
 * Take `<out>.lock` (created exclusively) or throw naming the run that holds it. A lock left by a
 * run that is gone is not taken over automatically — two runs doing so at once could both win —
 * the message says it is stale and which file to remove.
 */
function lockOutput(out) {
  const lock = `${resolve(out)}.lock`
  mkdirSync(dirname(lock), { recursive: true })
  try {
    writeFileSync(lock, JSON.stringify({ pid: process.pid, host: hostname(), at: new Date().toISOString() }) + '\n', { flag: 'wx' })
  } catch (e) {
    if (e.code !== 'EEXIST') throw new Error(`${lock}: ${e.message}`)
    let holder = null
    try {
      holder = JSON.parse(readFileSync(lock, 'utf8'))
    } catch {}
    const stale = holder?.pid && holder.host === hostname() && !processAlive(holder.pid)
    throw new Error(
      `${out}: ${stale ? `a lock left by a run that is gone (pid ${holder.pid}) is in the way` : `another from-joomla run is writing this spec-pack${holder?.pid ? ` (pid ${holder.pid}${holder.host && holder.host !== hostname() ? ` on ${holder.host}` : ''})` : ''}`}; two runs writing one pack would mix their files. ${stale ? 'Remove' : 'Wait for it, or once it is gone remove'} ${lock}`
    )
  }
  return () => rmSync(lock, { force: true })
}

function buildSpecPackLocked({
  j6Dir,
  out,
  siteUrl = DEFAULT_SITE_URL,
  force = false,
  pageFloor = PAGE_FLOOR,
  now = new Date().toISOString(),
  articleFields = null,
  contentParams = undefined,
  articlePosts = null,
  sourceFontsBrowser = null,
  decisionsText = null,
  hooks = {}
}) {
  checkArticleFields(articleFields)
  checkArticlePosts(articlePosts)
  const inventoryPath = join(j6Dir, 'inventory.json')
  // The pack is kept (a dossier's spec/): where the dump was read from is written as lib/record-paths.mjs writes a path.
  const recordPaths = { repoRoot: repoRootOf(out) }
  const routesPath = join(j6Dir, 'render-routes.json')
  // A dump that records its generation (joomla-dump.mjs) is read only when the directory is that generation: an interrupted or interleaved dump is refused.
  const epoch0 = readEpoch(j6Dir)
  const dump0 = readDumpJson(join(j6Dir, 'dump.json'))
  verifyGeneration(j6Dir, dump0)
  // Each read once, without following a link: the value whose shape is checked is the value used.
  const rawInventory = readDumpJson(inventoryPath)
  if (rawInventory === undefined) throw new Error(`inventory.json not found in ${j6Dir}`)
  const routes = readDumpJson(routesPath)
  if (routes === undefined) throw new Error(`render-routes.json not found in ${j6Dir}`)
  // The raw shape first: normaliseInventory turns an absent table into [], which would make a table
  // the dump never had read as "no rows" — the coverage report names it instead.
  const { missingTables } = checkInventoryShape(rawInventory, inventoryPath)
  // ACM's nested groups (an object under `type[G]`) are expanded into the `type[G][field]` lists the reader reads.
  const { inv, notes: acmNestedNotes } = normaliseAcmModules(normaliseInventory(rawInventory))
  checkRenderRoutes(routes, routesPath)
  const { params: globalContent, from: contentParamsFrom } = resolveContentParams(j6Dir, contentParams, rawInventory)
  const menuById = menuIndex(inv)
  const tpl = readTemplate(j6Dir, inv)
  // The source's own typography (Phase 2): what its template styles declare and load, then what the running source drew.
  if (sourceFontsBrowser !== null && sourceFontsBrowser?.schema !== BROWSER_SCHEMA) throw new Error(`--source-fonts-browser: not a ${BROWSER_SCHEMA} measurement (run source-font-browser.mjs)`)
  const sourceFontsStaticReport = sourceFontsStatic({ j6Dir, inv, missingTables, tpl })
  if (sourceFontsBrowser !== null) {
    // a measurement of another stand or another inventory is refused here; missing coverage is left to the pack gate to name
    const bound = browserCoverage(sourceFontsBrowser, sourceFontsStaticReport, { expectedSite: new URL(siteUrl).origin }).filter((x) => /fingerprint|another static report|measurement is of/.test(x))
    if (bound.length) throw new Error(`--source-fonts-browser does not measure this source: ${bound.slice(0, 4).join('; ')}`)
  }
  // The site name: the template's etc/site site_name when it declares one, else configuration.php's
  // sitename (site-config.json). Neither → none, and the gate says why (explainSpecProblems).
  const siteConfig = loadSiteConfig(j6Dir)
  tpl.siteConfig = siteConfig
  // An identity field the settings file holds as something other than a string (a number, a list,
  // an object) is malformed: neither a value nor a declared absence. It is dropped, never written as
  // text, and the gate names it (explainSpecProblems).
  tpl.identityInvalid = {}
  for (const k of ['site_name', 'site_slogan'])
    if (tpl.site?.[k] != null && typeof tpl.site[k] !== 'string') {
      tpl.identityInvalid[k] = tpl.site[k]
      tpl.site = { ...tpl.site, [k]: null }
    }
  tpl.siteNameFrom = null
  if (String(tpl.site.site_name ?? '').trim()) tpl.siteNameFrom = `${tpl.siteFile} site_name`
  else if (String(siteConfig.config?.sitename ?? '').trim()) {
    tpl.site = { ...tpl.site, site_name: siteConfig.config.sitename.trim() }
    tpl.siteNameFrom = 'site-config.json sitename'
  }
  const site = siteUrl.replace(/\/+$/, '')
  const notes = [...acmNestedNotes]
  if (tpl.siteNameFrom) notes.push(`site name: ${JSON.stringify(tpl.site.site_name)} from ${tpl.siteNameFrom}`)
  for (const [k, v] of Object.entries(tpl.identityInvalid)) notes.push(`identity: ${tpl.siteFile} declares ${k} ${JSON.stringify(v)}, not a string; not read`)

  // ── routes ─────────────────────────────────────────────────────────────────
  const entries = routeViews(inv, routes, { retitle: D2_CATEGORY_ALIASES, routeRenames: D2_ROUTE_RENAMES })
  // A T3 template names its page layout in the style's `mainlayout` param (not `typelist-layout`):
  // the layout each route draws is its own style's, and the style's skip_component_content list
  // names the menu items whose page prints no component (joomla-layout.mjs).
  const t3Styles = t3StyleSettings(inv, tpl.name)
  for (const e of entries) {
    if (e.kind !== 'page') continue
    const st = styleOfItem(t3Styles, menuById.get(e.menuId)?.templateStyleId)
    if (!st) continue
    e.layout = st.mainlayout
    e.t3Style = st.id
  }
  /** Whether the route's page never draws the component body: its style's mainbody block returns before it (a supported guard) for the route's menu item. Keyed by route identity, whatever the article becomes (page or post). */
  const routeSkips = (e) => Boolean(e.kind === 'page' && t3Layout(tpl, e.layout ?? defaultLayout)?.skipRule && t3Styles.get(e.t3Style)?.skip.has(String(e.menuId)))
  for (const st of new Set(entries.map((e) => (e.kind === 'page' ? t3Styles.get(e.t3Style) : null)).filter(Boolean)))
    if (st.skipInvalid) notes.push(`template style #${[...t3Styles].find(([, v]) => v === st)[0]}: skip_component_content ${st.skipInvalid} is not a list of menu item ids; no page is treated as skipping its component for it`)
  // What the capture measured a route to answer (render-routes.json `status`, `location`): a redirect or an error
  // is the source's answer, and the page-map declares it (http-parity reads `status` from it).
  const answerOf = new Map(routes.map((r) => [`${r.id} ${r.path.startsWith('/') ? r.path : `/${r.path}`}`, routeAnswer(r)]))
  for (const e of entries) {
    const a = answerOf.get(`${e.menuId} ${e.joomlaPath}`)
    if (a?.status && a.status !== 200) Object.assign(e, { httpStatus: a.status, ...(a.location ? { httpLocation: a.location } : {}) })
  }
  const routePages = entries.filter((e) => e.kind === 'page')
  // The home route's slug is its menu alias (`home`); the seeder builds a nested route's parent page from the path
  // segment, so `/home/home-style-1` makes a parent page `home` and the front page lands on `home-2`. A home slug
  // some other route's path starts with is `front-page` instead.
  for (const e of routePages)
    if (e.wpPath === '/' && routePages.some((o) => o !== e && o.wpPath.startsWith(`/${e.wpSlug}/`))) {
      notes.push(`route ${e.joomlaPath} (menu item ${e.menuId}): slug "${e.wpSlug}" is the first path segment of other routes (${routePages.filter((o) => o.wpPath.startsWith(`/${e.wpSlug}/`)).slice(0, 3).map((o) => o.wpPath).join(', ')}), whose parent page it would be; the front page's slug is "front-page"`)
      e.wpSlug = 'front-page'
    }
  // An article page's slug: the article's alias, or why the menu alias stays (articleSlugs).
  for (const p of routePages) if (p.slugNote) notes.push(`route ${p.joomlaPath} (menu item ${p.menuId}) ${p.renamed ? `→ ${p.wpPath}: ${p.slugNote}` : p.slugNote}`)
  const gaps = entries.filter((e) => e.kind === 'gap')
  const pageByMenuId = new Map(routePages.map((p) => [p.menuId, p]))
  const pageByJoomlaPath = new Map(routePages.map((p) => [p.joomlaPath.replace(/\/+$/, '') || '/', p]))
  const pageByArticle = new Map()
  for (const p of routePages)
    if (p.articleId && !pageByArticle.has(p.articleId)) pageByArticle.set(p.articleId, p)

  // ── content model ──────────────────────────────────────────────────────────
  const cats = categories(inv, { retitle: D2_CATEGORY_ALIASES })
  const catById = new Map(cats.map((c) => [c.id, c]))
  const pageCatIds = new Set(cats.filter((c) => PAGE_CATEGORIES.includes(c.title)).map((c) => c.id))
  const arts = articles(inv)
  const artById = new Map(arts.map((a) => [a.id, a]))
  const keptPosts = new Map(Object.entries(articlePosts ?? {}))
  const keptRoutes = new Map() // article id → the composition of the first menu route that opens it
  for (const id of keptPosts.keys()) {
    const art = artById.get(id)
    if (!art) throw new Error(`--article-posts: article ${id} is not in the inventory`)
    if (pageCatIds.has(art.catid)) throw new Error(`--article-posts: article ${id} (${art.title}) is in a page category (${PAGE_CATEGORIES.join(', ')}); its articles are pages`)
  }
  const isPageArticle = (a) => !keptPosts.has(a.id) && (pageCatIds.has(a.catid) || pageByArticle.has(a.id))

  // The people articles name (`created_by`), when the inventory has #__users: the post's author
  // carries its source identity (`joomla-user-<id>`), the name and picture are in content.authors.
  const users = joomlaAuthors(inv)
  // The profile fields beyond the avatar (job title, about me, social links): only the dump's allow-listed keys.
  const profiles = authorProfiles(inv)
  // An article's tags (#__contentitem_tag_map ⋈ #__tags), or null on an inventory without the tables.
  const tagged = articleTags(inv)
  const userById = new Map((users ?? []).map((u) => [u.id, u]))
  const authorIdOf = (userId) => `joomla-user-${userId}`
  const missingUsers = new Set()
  const authorOf = (a) => {
    const base = { joomlaUserId: a.createdBy, alias: a.createdByAlias }
    if (!users || !a.createdBy || a.createdBy === '0') return base
    const u = userById.get(a.createdBy)
    if (!u || !u.name) {
      missingUsers.add(a.createdBy)
      return base
    }
    return { id: authorIdOf(u.id), ...base }
  }

  // Joomla links → WordPress paths. `index.php?Itemid=N` names a menu item; `view=article&id=N`
  // names an article. Anything unresolved is kept verbatim and listed.
  const unresolvedLinks = new Set()
  const categoryRoute = new Map(routePages.filter((p) => p.categoryId).map((p) => [p.categoryId, p]))
  const postPath = (a) => {
    const cat = catById.get(a.catid)
    const route = categoryRoute.get(a.catid)
    const base = route ? route.wpPath : `/${cat ? cat.wpSlug : 'uncategorised'}`
    return `${base}/${slugify(a.title)}`
  }
  const resolveLink = (href) => {
    const h = String(href ?? '')
    const byItem = h.match(/^index\.php\?Itemid=(\d+)/)
    if (byItem) {
      const page = pageByMenuId.get(byItem[1])
      const gap = gaps.find((g) => g.menuId === byItem[1])
      if (page) return page.wpPath
      if (gap) return gap.redirectTo
      unresolvedLinks.add(h)
      return h
    }
    const byArticle = h.match(/^index\.php\?option=com_content&view=article&id=(\d+)/)
    if (byArticle) {
      const page = pageByArticle.get(byArticle[1])
      if (page) return page.wpPath
      const art = artById.get(byArticle[1])
      if (art && !isPageArticle(art)) return postPath(art)
      unresolvedLinks.add(h)
      return h
    }
    // A SEF address written with index.php in front (`index.php/home/home-style-1`): a route's path.
    const sef = sefRoutePath(h)
    if (sef) {
      const page = pageByJoomlaPath.get(sef)
      if (page) return page.wpPath
      unresolvedLinks.add(h)
      return h
    }
    if (h.startsWith('index.php?')) unresolvedLinks.add(h)
    return h
  }
  const convert = (html) => convertHtml(html, { link: resolveLink })
  // An article's extra fields (joomla-inventory articleFields): a field named in `articleFields`
  // is appended to the body as editable blocks, or left out on purpose ('skip'); any other is kept
  // in content.json (`joomla.fields`) and reported, never dropped in silence.
  const unplacedFields = new Map() // field → [where]
  const unplacedByArticle = new Map() // article id → Set(field) — the coverage report's per-article view of unplacedFields
  const skippedFields = new Map() // field → Set(article id) left out by a "skip" config
  const seenSubfields = new Map() // field → subfield keys its values have, across every article
  const skippedSubfields = new Map() // "<field>.<subfield>" → Set(article id) whose value a "skip" left out
  const seenFields = new Set() // every field name any article has
  const unplace = (art, name, where) => {
    unplacedFields.set(name, [...(unplacedFields.get(name) ?? []), where])
    unplacedByArticle.set(art.id, new Set([...(unplacedByArticle.get(art.id) ?? []), name]))
  }
  const withFields = (art, where, { asPost = false } = {}) => {
    const html = []
    const meta = {}
    for (const [name, value] of Object.entries(art.fields ?? {})) {
      seenFields.add(name)
      const cfg = articleFields?.[name]
      if (cfg === 'skip') {
        skippedFields.set(name, new Set([...(skippedFields.get(name) ?? []), art.id]))
        continue
      }
      if (!cfg) {
        unplace(art, name, where)
        continue
      }
      if (cfg.meta !== undefined) {
        if (!asPost) unplace(art, name, `${where} (a page: no post meta)`)
        else if (!['string', 'number', 'boolean'].includes(typeof value))
          throw new Error(`--article-fields: field "${name}" of article ${art.id} is not text (${Array.isArray(value) ? 'a list' : 'a subform'}); it cannot be post meta "${cfg.meta}"`)
        else meta[cfg.meta] = String(value)
        if (!drawsField(cfg)) continue
      }
      const dropped = []
      const seen = new Set()
      const skipped = []
      html.push(fieldHtml(name, value, cfg, dropped, seen, skipped))
      for (const d of dropped) unplace(art, d, where)
      for (const k of skipped) skippedSubfields.set(k, new Set([...(skippedSubfields.get(k) ?? []), art.id]))
      seenSubfields.set(name, new Set([...(seenSubfields.get(name) ?? []), ...seen]))
    }
    const body = art.introtext + art.fulltext
    return { body, fields: html.length ? convert(html.join('\n')) : null, meta }
  }
  const joinConverted = (a, b) =>
    b ? { markup: [a.markup, b.markup].filter(Boolean).join('\n'), images: [...a.images, ...b.images], slots: a.slots } : a

  // ── modules ────────────────────────────────────────────────────────────────
  const allSiteModules = siteModules(inv)
  const modules = allSiteModules.filter((m) => m.published)
  const mastheadModules = modules.filter((m) => m.module === 'mod_jamasthead').sort((a, b) => a.ordering - b.ordering || Number(a.id) - Number(b.id))
  const acm = acmInstances(inv, { schemas: acmSchemas(inv, tpl) })
  const acmById = new Map(acm.map((a) => [a.id, a]))
  const modulesAt = (position, menuId) =>
    modules
      .filter(
        (m) =>
          m.position === position &&
          assignedTo(m.assignment, menuId)
      )
      .sort((a, b) => a.ordering - b.ordering || Number(a.id) - Number(b.id))
  const modulePages = new Map() // module id → [{ file, wpPath, via }]
  const orphanedModules = new Map() // module id → menu items whose route composition left it out because the source does not draw its position there
  const moduleLoadLog = [] // { article, module, kind, via, menuId?, path? } — what each {loadmoduleid} in an article body became: on a drawn route page (via 'route', with its identity) or in a post body (via 'post', no route)
  const notePage = (m, page, via) => {
    const list = modulePages.get(m.id) ?? []
    if (!list.some((x) => x.file === page.file))
      list.push({ file: page.file, wpPath: page.wpPath, menuId: page.menuId, via })
    modulePages.set(m.id, list)
  }

  const { defaultLayout } = templateLayouts(inv)
  /**
   * The layout rows a route draws, in order: its layout (a layout that is not captured is a lone component), less the
   * component and mainbody block on a route the style skips. The one place that decides whether the page prints the
   * article body — composition and the coverage report both read it, per (menu item, route), never per pathname.
   */
  const effectiveOrder = (route) => {
    const { order, componentless } = layoutEvidence(tpl, route.layout ?? defaultLayout)
    // Not captured, or read only partly: the body is taken as drawn (a lone component, or after the rows that were read).
    const rows = order === null ? [{ kind: 'component' }] : componentless || order.some((o) => o.kind === 'component') ? order : [...order, { kind: 'component' }]
    return rows.filter((o) => !(routeSkips(route) && (o.kind === 'component' || o.block === 'mainbody')))
  }
  const bodyDrawn = (route) => effectiveOrder(route).some((o) => o.kind === 'component')
  /** The layout of the route was captured but read only partly: its body is taken as drawn, not proven so or absent. */
  const bodyUncertain = (route) => {
    const { order, uncertain } = layoutEvidence(tpl, route.layout ?? defaultLayout)
    return order !== null && uncertain
  }
  /** What a layout could not establish, by name: the causes behind an unknown body and behind positions not read in full. */
  const layoutCauses = (name) => {
    const { bodyCauses, positionCauses, order, uncertain, complete } = layoutEvidence(tpl, name ?? defaultLayout)
    return { known: order !== null, bodyCauses: uncertain ? bodyCauses : [], positionCauses: complete ? [] : positionCauses }
  }
  /** The layout of a name was captured but not read completely: a position missing from it is not proven undrawn. */
  const layoutIncomplete = (name) => {
    const { order, complete } = layoutEvidence(tpl, name ?? defaultLayout)
    return order !== null && !complete
  }
  /** What a layout says about the article body, by name: 'drawn' (a component row), 'absent' (proven), 'unknown' (read partly), 'not-captured'. */
  const layoutBody = (name) => {
    const { order, body, uncertain } = layoutEvidence(tpl, name ?? defaultLayout)
    return order === null ? 'not-captured' : body === 'absent' ? 'absent' : uncertain ? 'unknown' : 'drawn'
  }

  // What the source draws on a route: composition places a module only where this says so, and the coverage report reads the same answer.
  const drawing = routeDrawing({ j6Dir, inv, tpl, defaultLayout, arts, bodyDrawn, layoutIncomplete, layoutCauses })
  const { placement } = drawing

  /** A module at a position as one entry of a section-driven page: a mod_custom is a section (typed or html), anything else the slot of its position. */
  const entryOf = (m, position) => {
    if (m.module !== 'mod_custom') return { kind: 'slot', position, modules: [m.id] }
    const sectionType = detectSectionType(m.content, m.title)
    return sectionType
      ? { kind: 'section', sectionType, moduleId: m.id, title: m.title, position, html: m.content }
      : { kind: 'html', moduleId: m.id, title: m.title, position, blocks: `<!-- wp:html -->\n${m.content.trim()}\n<!-- /wp:html -->` }
  }

  // A slot block naming the module a `{loadmoduleid}` load stood for, beside its position.
  const moduleSlotMark = (sl) => `<!-- wp:${SLOT_BLOCK} {"position":"${sl.position}","modules":["${sl.id}"]} /-->`
  /** Compose a route page: slots in layout order around the article body, plus per-page extras. */
  function composePage(route) {
    const art = route.articleId ? artById.get(route.articleId) : null
    const placed = art ? withFields(art, route.wpPath) : null
    // `{loadmoduleid N}` in the body: the module as this menu item draws it (joomla-normalize.mjs resolveModuleLoads).
    const loads = placed ? resolveModuleLoads(placed.body, allSiteModules, route.menuId, assignedTo) : null
    const conv0 = placed ? joinConverted(convert(loads.html), placed.fields) : { markup: '', images: [], slots: [] }
    const conv = { ...conv0, slots: conv0.slots.filter((x) => !x.startsWith('@m')) }
    // The slot blocks the loads became: split the body there (each piece must be complete block markup,
    // else the load is a position slot only) so a page entry can name the module; then the token becomes the position.
    const slotMark = (pos) => `<!-- wp:${SLOT_BLOCK} {"position":"${pos}"} /-->`
    let bodyPieces = null
    if (loads?.slots.length) {
      let rest = conv.markup
      const pieces = []
      for (const sl of loads.slots) {
        const at = rest.indexOf(slotMark(sl.token))
        const head = at === -1 ? null : rest.slice(0, at)
        if (head === null || !checkBlockMarkup(head).ok) {
          pieces.length = 0
          break
        }
        if (head.trim()) pieces.push({ kind: 'blocks', markup: head })
        pieces.push({ kind: 'slot', position: sl.position, modules: [sl.id] })
        rest = rest.slice(at + slotMark(sl.token).length)
      }
      if (pieces.length && checkBlockMarkup(rest).ok) bodyPieces = [...pieces, ...(rest.trim() ? [{ kind: 'blocks', markup: rest }] : [])]
      for (const sl of loads.slots) conv.markup = conv.markup.replaceAll(slotMark(sl.token), moduleSlotMark(sl))
    }
    const t3 = t3Layout(tpl, route.layout ?? defaultLayout)
    // T3's mainbody block returns before the component and its sidebars for the menu items the style lists.
    const skipComponent = routeSkips(route)
    const order = effectiveOrder(route)
    const hasComponent = bodyDrawn(route)
    const sections = []
    const pageNotes = []
    const before = [],
      after = []
    const composition = [] // render-order entries for a section-driven page
    let seenComponent = false
    for (const o of order) {
      if (o.kind === 'component') {
        seenComponent = true
        composition.push({ kind: 'body', ...(o.frame ? { row: o.row, frame: o.frame } : {}) })
        continue
      }
      if (o.chrome || o.sidebar || CHROME_POSITION.test(o.name)) continue
      const mods = modulesAt(o.name, route.menuId)
      if (!mods.length) continue
      sections.push({ position: o.name, via: 'layout', modules: mods.map((m) => m.id) })
      for (const m of mods) notePage(m, route, 'layout')
      ;(seenComponent ? after : before).push(`<!-- wp:${SLOT_BLOCK} {"position":"${o.name}"} /-->`)
      for (const m of mods) composition.push({ ...entryOf(m, o.name), ...(o.frame ? { row: o.row, frame: o.frame } : {}) })
    }
    for (const pos of hasComponent ? conv.slots : []) {
      const mods = modulesAt(pos, route.menuId)
      sections.push({ position: pos, via: 'loadposition', modules: mods.map((m) => m.id) })
      for (const m of mods) notePage(m, route, 'loadposition')
    }
    // On a route whose page prints no component (skipped, or a layout with no component row) the article body is never printed, so the modules it loads are not drawn either.
    for (const sl of hasComponent ? loads?.slots ?? [] : []) {
      sections.push({ position: sl.position, via: 'loadmoduleid', modules: [sl.id] })
      notePage(modules.find((m) => m.id === sl.id), route, 'loadmoduleid')
      if (!bodyPieces) pageNotes.push(`${sl.marker} is a slot at position "${sl.position}" (it sits inside another block, so the page entry cannot name module ${sl.id}): every module at that position draws there`)
    }
    for (const sl of hasComponent ? loads?.inline ?? [] : []) notePage(modules.find((m) => m.id === sl.id), route, 'loadmoduleid')
    for (const d of loads?.dropped ?? []) pageNotes.push(`${d.marker} prints nothing on the Joomla site (${d.why}); it is left out`)
    for (const u of loads?.unresolved ?? []) pageNotes.push(`${u.marker} is left as text: ${u.why}`)
    for (const u of loads?.unassigned ?? []) pageNotes.push(`${u.marker}: module ${u.id} is not assigned to menu item ${route.menuId}; it is drawn here because the article names it (whether Joomla filters it by assignment is not traced)`)
    if (art && hasComponent)
      for (const [kind, list] of [['slot', loads?.slots], ['inline', loads?.inline], ['dropped', loads?.dropped], ['unresolved', loads?.unresolved]])
        for (const l of list ?? []) moduleLoadLog.push({ article: art.id, module: l.id, kind, via: 'route', menuId: route.menuId, path: route.joomlaPath })
    // Modules assigned to this menu item at a position the article does not load: they are placed only where the source
    // draws the position on THIS route (routeDrawing: its layout, blocks, sub-layout, mega menu, overrides, {loadposition}) —
    // a sidebar position in `aside`, any other position as a slot, header-ish ones before the body, the rest after.
    // Where the route's evidence was read in full and does not draw the position, the module is not rendered on the Joomla
    // site here: it is recorded as orphaned, not turned into content. Where the evidence was read only partly, whether it
    // is drawn is not known: it is placed and said so.
    // A page whose layout rows are filled by mod_custom modules is the theme's section library, not
    // a document: hand the seeder one entry per section instead of a wall of core/html. Decided by
    // the layout's rows, before the per-page extras join them.
    const sectionDriven = composition.some((e) => e.kind === 'section' || e.kind === 'html')
    const aside = []
    const orphaned = []
    const unreadAt = []
    // A module the article loads by id is drawn by the body where the position itself is not.
    const loadedHere = new Set(hasComponent ? [...(loads?.slots ?? []), ...(loads?.inline ?? [])].map((l) => String(l.id)) : [])
    const extraMods = new Map() // position → the modules the route's evidence lets that position draw, one by one
    for (const m of modules) {
      if (!assignedTo(m.assignment, route.menuId)) continue
      const sidebar = SIDEBAR_POSITION.test(m.position) || t3?.sidebars.includes(m.position)
      // The chrome is the template's parts, by the position's name; everything else is the route's evidence alone.
      if (!sidebar && (CHROME_POSITION.test(m.position) || t3?.chrome.includes(m.position) || ['header', 'footer'].includes(positionScope(m.position)))) continue
      const where = placement(route, m, loadedHere)
      if (where.state === 'undrawn') {
        orphaned.push({ position: m.position, module: m.id })
        const menus = orphanedModules.get(m.id) ?? new Set()
        menus.add(route.menuId)
        orphanedModules.set(m.id, menus)
        continue
      }
      // Already placed by this module's own entry: a layout row or {loadposition} slot that lists it, or the body's {loadmoduleid}.
      // Drawn by id (the mega menu, an article's {loadmoduleid}): the drawing element places it itself, not a position slot of the page.
      if (where.byId || (!sidebar && sections.some((s) => s.position === m.position && s.modules.includes(m.id)))) continue
      if (where.state === 'unknown') {
        // Whether it is drawn is not known: a module assigned by all pages / all except is left to the coverage report's unknown list, as before.
        if (!m.assignment.pages.includes(route.menuId)) continue
        unreadAt.push({ position: m.position, module: m.id, why: where.why })
      }
      if (sidebar) {
        aside.push(m.id)
        notePage(m, route, 'sidebar')
        continue
      }
      extraMods.set(m.position, [...(extraMods.get(m.position) ?? []), m])
    }
    const extras = [...extraMods.keys()]
    for (const pos of extras) {
      const mods = extraMods.get(pos).sort((x, y) => x.ordering - y.ordering || Number(x.id) - Number(y.id))
      sections.push({ position: pos, via: 'menu-assignment', modules: mods.map((m) => m.id) })
      for (const m of mods) notePage(m, route, 'menu-assignment')
      const header = /header/.test(pos)
      ;(header ? before : after).push(`<!-- wp:${SLOT_BLOCK} {"position":"${pos}"} /-->`)
      // A section-driven page draws them where the markup does: header-ish ones just before the
      // body, the rest at the end — otherwise its entries would list the position and draw nothing.
      const extraEntries = mods.map((m) => entryOf(m, pos))
      const bodyAt = composition.findIndex((e) => e.kind === 'body')
      if (header && bodyAt !== -1) composition.splice(bodyAt, 0, ...extraEntries)
      else composition.push(...extraEntries)
    }
    if (unreadAt.length)
      pageNotes.push(
        `${unreadAt.length} module(s) assigned to this menu item sit at positions whose drawing on this route is not known (${[...new Set(unreadAt.map((o) => o.why))].join('; ')}), so they are placed: ${unreadAt.map((o) => `${o.position}#${o.module}`).join(', ')}`
      )
    if (orphaned.length)
      pageNotes.push(
        `${orphaned.length} module(s) assigned to this menu item sit at positions layout "${route.layout ?? defaultLayout}" does not draw (not rendered on the Joomla site): ${orphaned.map((o) => `${o.position}#${o.module}`).join(', ')}`
      )
    let body = conv.markup
    if (art && !hasComponent && body) {
      pageNotes.push(
        skipComponent
          ? `menu item ${route.menuId} is in skip_component_content of template style #${route.t3Style}, so the Joomla site never renders the article body of #${art.id} (nor the sidebars); it is kept under "droppedContent"`
          : `layout "${route.layout}" has no component row, so the Joomla site never renders the article body of #${art.id}; it is kept under "droppedContent"`
      )
    }
    const starter = !art
      ? (VIEW_STARTER[route.wpView] ?? STARTER_BY_TARGET[`${route.option}/${route.view}`] ?? '')
      : ''
    const parts = [...before, hasComponent ? body : '', starter, ...after].filter(Boolean)
    const bodyEntries = hasComponent && bodyPieces ? bodyPieces : [{ kind: 'blocks', markup: hasComponent ? body : '' }]
    const hasFramedRows = composition.some((entry) => entry.frame)
    const entries = sectionDriven || (hasComponent && bodyPieces) || hasFramedRows
      ? composition.flatMap((entry) => entry.kind === 'body'
        ? bodyEntries.map((bodyEntry) => ({ ...bodyEntry, ...(entry.frame ? { row: entry.row, frame: entry.frame } : {}) }))
        : [entry]).filter((entry) => entry.kind !== 'blocks' || entry.markup)
      : null
    return {
      markup: parts.join('\n'),
      entries,
      // The same with the article body as `{ kind: 'body' }`, for a post that carries the route.
      routeEntries: sectionDriven || hasFramedRows ? composition : null,
      before,
      after,
      images: [...conv.images, ...[...new Set(order.flatMap((entry) => entry.frame?.background?.image ? [String(entry.frame.background.image)] : []))].map((src) => ({ src, alt: '' }))],
      sections,
      aside,
      orphaned,
      droppedContent: art && !hasComponent ? body : null,
      hasComponent,
      notes: pageNotes
    }
  }

  // A category BLOG's cards per page (archivePaging): the menu item's counts, else the global
  // ones. A list layout (categoryLayoutKind: the link's layout, or a template layout's
  // layout_type), or counts neither sets, declares none — the seeder's default applies and the
  // note says so.
  const categoryPaging = (route) => {
    if (route.option !== 'com_content' || route.view !== 'category') return null
    const item = menuById.get(route.menuId)
    const where = `menu item ${route.menuId} (${route.joomlaPath})`
    const shape = categoryLayoutKind(item?.target, item?.params)
    if (shape.kind !== 'blog') {
      notes.push(
        shape.kind === 'list'
          ? `archive ${route.wpPath}: ${where} is a category list, not a blog (layout ${shape.layout}${shape.from === 'layout_type' ? ', layout_type list' : ''}); its per-page count is not read — the seeder's default applies`
          : `archive ${route.wpPath}: ${where}: ${shape.why}; its per-page count is not read — the seeder's default applies`
      )
      return null
    }
    const paging = archivePaging(item?.params ?? {}, globalContent, where)
    if (!paging.perPage) {
      notes.push(
        `archive ${route.wpPath}: ${paging.missing?.length ? `${paging.missing.join(', ')} set neither by ${where} nor by the global com_content options` : `${where} shows no leading or intro article`}; no perPage declared — the seeder's default applies`
      )
      return null
    }
    if (paging.links)
      notes.push(
        `archive ${route.wpPath}: ${paging.perPage} cards a page (${paging.leading} leading + ${paging.intro} intro), then up to ${paging.links} link-only titles under "${MORE_ARTICLES.heading}" — the next page's first ${paging.links} article(s), as Joomla pages by the cards alone (the heading is ${MORE_ARTICLES.from}; a site in another language or with an override prints its own — edit it on the page)`
      )
    return paging
  }
  /**
   * The images an article shows: the article view prints the full-text image when the article has one (the intro
   * image is the listing card's), so that is the featured image; the intro image is kept beside it when it is
   * another file. The alt text is the chosen image's own.
   */
  const articleImages = (a) => {
    const chosen = a.images.full || a.images.intro || null
    const intro = a.images.intro && a.images.intro !== chosen ? a.images.intro : null
    return {
      featuredImage: chosen,
      featuredImageAlt: (a.images.full ? a.images.fullAlt : a.images.introAlt) || '',
      ...(intro ? { introImage: intro, introImageAlt: a.images.introAlt || '' } : {})
    }
  }
  /** What a route's page carries beyond its markup: the contact record, the featured list; `notes` says what was not there. */
  const featuredOrderingByArticle = new Map(
    (inv.content_frontpage ?? [])
      .filter((row) => row?.content_id != null && row?.ordering != null && String(row.ordering).trim() !== '' && Number.isFinite(Number(row.ordering)))
      .map((row) => [String(row.content_id), Number(row.ordering)])
  )
  const pageExtras = (route, composed) => {
    const fields = {}
    const pageNotes = []
    if (route.wpView === 'page-contact' && route.option === 'com_contact') {
      if (!Array.isArray(inv.contact_details)) pageNotes.push(`contact details: the dump has no #__contact_details table, so contact ${route.targetId ?? '?'} is not read; the page keeps its starter only`)
      else {
        const contact = contactRow(inv.contact_details.find((r) => r && typeof r === 'object' && String(r.id) === String(route.targetId)))
        if (contact) fields.contact = contact
        else pageNotes.push(`contact details: #__contact_details has no row ${route.targetId ?? '?'}; the page keeps its starter only`)
      }
    }
    // The home route is the front page, composed from its layout: only a featured view that is a page of its own declares the list.
    if (route.option === 'com_content' && route.view === 'featured') {
      const item = menuById.get(route.menuId)
      const where = `menu item ${route.menuId} (${route.joomlaPath})`
      let paging = null
      try {
        paging = archivePaging(item?.params ?? {}, globalContent, where)
      } catch (e) {
        pageNotes.push(`featured list: ${e.message}; its per-page count is not read`)
      }
      const featuredOrdering = featuredOrderingByArticle
      const orderParam = item?.params?.orderby_pri ?? item?.params?.orderby ?? ''
      const byFeaturedOrdering = ['front', 'featured', 'featured_ordering', 'ordering'].includes(String(orderParam).toLowerCase())
      const listed = arts.filter(isFeaturedListed)
      if (byFeaturedOrdering) listed.sort((a, b) => (featuredOrdering.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (featuredOrdering.get(b.id) ?? Number.MAX_SAFE_INTEGER))
      const hasCompleteOrdering = listed.every((a) => featuredOrdering.has(a.id))
      if (route.wpPath !== '/' || byFeaturedOrdering) {
        fields.featured = {
          articleIds: listed.map((a) => a.id),
          count: listed.length,
          drawn: composed.hasComponent,
          ...(paging?.perPage ? { perPage: paging.perPage, paging: { leading: paging.leading, intro: paging.intro, links: paging.links, from: paging.from } } : {}),
          ...(byFeaturedOrdering && hasCompleteOrdering ? { order: listed.map((a) => a.id), orderBy: 'featuredOrdering' } : {}),
          from: '#__content featured = 1, state 1'
        }
        pageNotes.push(
          `featured list: ${listed.length} featured article(s) declared in this page's "featured" field${composed.hasComponent ? '' : ' (the layout draws no component, so the source prints no list here)'}; ${byFeaturedOrdering ? `ordered by #__content_frontpage.ordering${hasCompleteOrdering ? '' : ', but one or more ordering values are missing or invalid'}` : 'its order is not declared because the menu item does not select frontpage ordering'}${paging?.perPage ? '' : '; no per-page count is set by the menu item or the global options'}`
        )
      }
    }
    return { fields, notes: pageNotes }
  }
  const featuredOrderForRoute = (route) => {
    if (route.option !== 'com_content' || route.view !== 'featured') return null
    const params = menuById.get(route.menuId)?.params ?? {}
    const orderParam = params.orderby_pri ?? params.orderby ?? ''
    if (!['front', 'featured', 'featured_ordering', 'ordering'].includes(String(orderParam).toLowerCase())) return null
    const listed = arts.filter(isFeaturedListed)
    if (!listed.every((article) => featuredOrderingByArticle.has(article.id))) return null
    if (!listed.every((article) => featuredOrderingByArticle.has(article.id))) return null
    return listed.sort((a, b) => featuredOrderingByArticle.get(a.id) - featuredOrderingByArticle.get(b.id)).map((article) => article.id)
  }
  const wpPages = []
  const archives = []
  const parentPath = (wpPath) => {
    const segs = String(wpPath).split('/').filter(Boolean)
    return segs.length > 1 ? '/' + segs.slice(0, -1).join('/') : null
  }
  const pageMapPages = []
  const referencePages = []
  const usedFiles = new Map() // file → the route that has it
  const usedPaths = new Set(routePages.map((r) => r.wpPath))
  for (const route of routePages) {
    const holder = usedFiles.get(route.file)
    if (holder) {
      // A file name flattens the path (`/a/b` and `/a-b` are both a-b.html): two different routes
      // keep their own paths and only the file is numbered. Two routes on one path (a D2 rename
      // onto another route) keep both, the second path numbered too.
      let n = 2
      while (usedFiles.has(route.file.replace(/\.html$/, `-${n}.html`)) || (holder.wpPath === route.wpPath && usedPaths.has(`${route.wpPath}-${n}`))) n++
      const file = route.file.replace(/\.html$/, `-${n}.html`)
      if (holder.wpPath === route.wpPath) {
        notes.push(`route ${route.joomlaPath} (menu item ${route.menuId}) lands on ${route.wpPath}, which ${holder.joomlaPath} already has; kept as ${route.wpPath}-${n} (file ${file})`)
        route.wpPath = `${route.wpPath}-${n}`
        route.wpSlug = `${route.wpSlug}-${n}`
        usedPaths.add(route.wpPath)
      } else notes.push(`routes ${holder.wpPath} and ${route.wpPath} flatten to one file name ${route.file}; ${route.wpPath} keeps its path, its file is ${file}`)
      route.file = file
    }
    usedFiles.set(route.file, route)
    const composed = composePage(route)
    const art = route.articleId ? artById.get(route.articleId) : null
    // The menu item's own page heading (`show_page_heading` + `page_heading`) is what a listing or page prints as its title.
    const heading = pageHeading(menuById.get(route.menuId)?.params)
    const title = art ? art.title : (heading?.text ?? route.title)
    const layoutName = route.layout ?? defaultLayout
    // A menu item on an article kept as a post (--article-posts) is that post's single view.
    const keptPost = art && keptPosts.has(art.id)
    pageMapPages.push({
      file: route.file,
      view: keptPost ? 'single' : route.wpView,
      layout: layoutName,
      title,
      path: route.wpPath,
      ...(route.httpStatus ? { status: route.httpStatus, ...(route.httpLocation ? { location: route.httpLocation } : {}) } : {}),
      source: {
        menuId: route.menuId,
        joomlaPath: route.joomlaPath,
        option: route.option,
        view: route.view,
        id: route.targetId,
        ...(keptPost ? { articleId: art.id } : {})
      },
      sections: composed.sections
    })
    referencePages.push({ page: route.file, url: site + route.joomlaPath })
    if (keptPost) {
      // The modules the menu item shows around the article (a related-articles block, a
      // sidebar) go with the post: `route` is the menu page's composition with the article body
      // as a marker, and the seeder renders it as it would the page and puts the post's own body
      // at the marker — the post's content is then what the source prints at the menu address.
      const modules = [...new Set([...composed.sections.flatMap((x) => x.modules ?? []), ...(composed.aside ?? [])].filter((x) => x != null))]
      const first = !keptRoutes.has(art.id)
      if (first && modules.length)
        keptRoutes.set(art.id, {
          path: route.wpPath,
          file: route.file,
          contentKind: composed.entries ? 'sections' : 'blocks',
          content: composed.routeEntries ?? [...composed.before, POST_BODY_MARKER, ...composed.after].join('\n'),
          images: composed.images,
          aside: composed.aside ?? [],
          modules
        })
      notes.push(
        `route ${route.wpPath} (menu item ${route.menuId}) opens article #${art.id} (${art.title}), kept as a post (--article-posts)` +
          `${keptPosts.get(art.id).template ? ` on template ${keptPosts.get(art.id).template}` : ''}` +
          `${composed.orphaned.length ? `; ${composed.notes.filter((n) => n.includes('does not draw')).join(' ')}` : ''}` +
          `${modules.length ? (first ? `; the route's modules ${modules.join(', ')} are seeded around the post's body` : `; the route's modules ${modules.join(', ')} are not seeded — the post carries the modules of its first menu route (${keptRoutes.get(art.id)?.path ?? 'none'})`) : ''}`
      )
    } else if (VIEW_IS_PAGE(route.wpView)) {
      const template = route.wpView.startsWith('page-') ? route.wpView : null
      const extras = pageExtras(route, composed)
      wpPages.push({
        file: route.file,
        title,
        slug: route.wpSlug,
        path: route.wpPath,
        joomlaPath: route.joomlaPath,
        view: route.wpView,
        menuLabel: route.title,
        ...(heading ? { pageHeading: heading } : {}),
        status: art ? art.status : 'publish',
        date: art ? (art.publishUp ?? art.created) : null,
        modified: art?.modified ?? null,
        author: art ? authorOf(art) : null,
        excerpt: art?.metadesc || (art ? textOf(art.introtext).slice(0, 200) : ''),
        ...(art ? articleImages(art) : { featuredImage: null, featuredImageAlt: '' }),
        ...(route.httpStatus ? { httpStatus: route.httpStatus, ...(route.httpLocation ? { httpLocation: route.httpLocation } : {}) } : {}),
        ...extras.fields,
        meta: template ? { _wp_page_template: template } : {},
        parent: parentPath(route.wpPath),
        synthetic: false,
        joomla: art
          ? {
              articleId: art.id,
              alias: art.alias,
              catid: art.catid,
              category: catById.get(art.catid)?.title ?? null,
              duplicateOf: route.duplicateOf,
              ordering: art.ordering,
              hits: art.hits,
              created: art.created,
              layout: art.layout,
              fields: art.fields
            }
          : { menuId: route.menuId },
        contentKind: composed.entries ? 'sections' : 'blocks',
        content: composed.entries ?? composed.markup,
        contentMarkup: composed.entries ? composed.markup : undefined,
        images: composed.images,
        sections: composed.sections,
        aside: composed.aside,
        orphaned: composed.orphaned,
        droppedContent: composed.droppedContent,
        notes: [...composed.notes, ...extras.notes]
      })
    } else {
      // The line the source's masthead prints under the listing's title is what the listing says
      // about itself: its excerpt. No masthead on the route, no excerpt (never a module's text).
      const masthead = mastheadModules.map((m) => mastheadFor(m, route.menuId)).find(Boolean) ?? null
      // What the category view prints above its list: the menu item's options, else the global ones.
      const display =
        route.option === 'com_content' && route.view === 'category'
          ? archiveDisplay(menuById.get(route.menuId)?.params ?? {}, globalContent, `menu item ${route.menuId} (${route.joomlaPath})`, parseJsonColumn(inv.categories.find((c) => String(c.id) === String(route.categoryId))?.params))
          : null
      const paging = categoryPaging(route)
      archives.push({
        file: route.file,
        view: route.wpView,
        path: route.wpPath,
        joomlaPath: route.joomlaPath,
        title,
        ...(heading ? { menuLabel: route.title, pageHeading: heading } : {}),
        ...(route.httpStatus ? { httpStatus: route.httpStatus, ...(route.httpLocation ? { httpLocation: route.httpLocation } : {}) } : {}),
        category: route.categoryId ? (catById.get(route.categoryId)?.wpSlug ?? null) : null,
        ...(masthead ? { excerpt: masthead.description, masthead } : {}),
        ...(display ? { display } : {}),
        ...(paging?.perPage ? { perPage: paging.perPage, paging: { leading: paging.leading, intro: paging.intro, links: paging.links, from: paging.from } } : {}),
        ...(paging?.perPage && paging.links ? { moreArticles: { ...MORE_ARTICLES } } : {}),
        ...(featuredOrderForRoute(route)
          ? { featuredOrdering: featuredOrderForRoute(route), featuredDrawn: composed.hasComponent }
          : {}),
        sections: composed.sections,
        aside: composed.aside,
        orphaned: composed.orphaned,
        ...(composed.orphaned.length ? { notes: composed.notes.filter((n) => n.includes('does not draw')) } : {})
      })
    }
  }

  // ── posts ──────────────────────────────────────────────────────────────────
  const posts = []
  // `{loadmoduleid N}` in a post body: a post has no menu item, so no assignment is checked. A custom
  // module is its content, an ACM module a slot at its position (every module there draws), the rest
  // as on a page (an unpublished module prints nothing, an unknown one stays text and is noted).
  const convertPostBody = (a, html) => {
    const loads = resolveModuleLoads(html, allSiteModules, null, assignedTo)
    const conv = convert(loads.html)
    let markup = conv.markup
    for (const sl of loads.slots) markup = markup.replaceAll(`<!-- wp:${SLOT_BLOCK} {"position":"${sl.token}"} /-->`, moduleSlotMark(sl))
    for (const sl of loads.slots) notes.push(`article #${a.id}: ${sl.marker} is a slot block at position "${sl.position}" naming module #${sl.id} (modules: ["${sl.id}"]) in the post; the post seeder does not expand slot blocks, so the module is not drawn in the post until it does`)
    for (const d of loads.dropped) notes.push(`article #${a.id}: ${d.marker} prints nothing on the Joomla site (${d.why}); it is left out`)
    for (const u of loads.unresolved) notes.push(`article #${a.id}: ${u.marker} is left as text: ${u.why}`)
    for (const [kind, list] of [['slot', loads.slots], ['inline', loads.inline], ['dropped', loads.dropped], ['unresolved', loads.unresolved]])
      for (const l of list) moduleLoadLog.push({ article: a.id, module: l.id, kind, via: 'post' })
    return { ...conv, markup, slots: conv.slots.filter((x) => !x.startsWith('@m')) }
  }
  // Joomla serves no article of a trashed category; categories() leaves those categories out.
  const trashedCats = new Map(inv.categories.filter((c) => c.extension === 'com_content' && String(c.published) === '-2').map((c) => [String(c.id), c]))
  for (const a of arts) {
    if (isPageArticle(a) || a.status === 'trash') continue
    const trashedCat = trashedCats.get(a.catid)
    if (trashedCat) {
      notes.push(`article #${a.id} (${a.title}) is ${a.status} but its category #${trashedCat.id} (${trashedCat.path || trashedCat.title}) is trashed; Joomla does not serve it, so it is not a post`)
      continue
    }
    const intro = convertPostBody(a, a.introtext)
    const full = a.fulltext.trim() ? convertPostBody(a, a.fulltext) : null
    // A placed field closes the article, after the read-more part when there is one.
    const placed = withFields(a, postPath(a), { asPost: true })
    const extra = placed.fields
    const meta = { ...(keptPosts.get(a.id)?.template ? { _wp_page_template: keptPosts.get(a.id).template } : {}), ...placed.meta }
    const cat = catById.get(a.catid)
    posts.push({
      title: a.title,
      slug: slugify(a.title),
      path: postPath(a),
      status: a.status,
      date: a.publishUp ?? a.created,
      modified: a.modified,
      author: authorOf(a),
      category: cat?.wpSlug ?? null,
      ...(Object.keys(meta).length ? { meta } : {}),
      ...(keptRoutes.has(a.id) ? { route: keptRoutes.get(a.id) } : {}),
      // the source's tags in tag-tree order; [] is "no tag in the source", no field is "not read"
      ...(tagged ? { tags: tagged.byArticle.get(a.id) ?? [] } : {}),
      sticky: a.featured,
      excerpt: a.metadesc || textOf(a.introtext),
      ...articleImages(a),
      joomla: {
        articleId: a.id,
        alias: a.alias,
        catid: a.catid,
        state: a.state,
        category: cat?.title ?? null,
        ordering: a.ordering,
        hits: a.hits,
        ...(a.metakey ? { metakey: a.metakey } : {}),
        created: a.created,
        ...(a.featured && featuredOrderingByArticle.has(a.id) ? { featuredOrdering: featuredOrderingByArticle.get(a.id) } : {}),
        layout: a.layout,
        fields: a.fields
      },
      content: [
        full ? `${intro.markup}\n<!-- wp:more -->\n<!--more-->\n<!-- /wp:more -->\n${full.markup}` : intro.markup,
        extra?.markup
      ]
        .filter(Boolean)
        .join('\n'),
      images: [...intro.images, ...(full?.images ?? []), ...(extra?.images ?? [])]
    })
  }
  posts.sort((a, b) => Number(a.joomla.articleId) - Number(b.joomla.articleId))

  // The authors the posts name, once each, in user id order.
  const contentAuthors = [...new Set(posts.map((p) => p.author?.id).filter(Boolean))]
    .map((id) => userById.get(id.replace(/^joomla-user-/, '')))
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((u) => {
      const prof = profiles?.get(u.id)
      return {
        id: authorIdOf(u.id),
        joomlaUserId: u.id,
        name: u.name,
        login: u.username,
        avatar: u.avatar,
        avatarAlt: u.name,
        ...(prof?.jobTitle ? { jobTitle: prof.jobTitle } : {}),
        ...(prof?.description ? { description: prof.description } : {}),
        ...(prof?.social ? { social: prof.social } : {}),
        provenance: { name: '#__users.name', login: '#__users.username', avatar: u.avatar ? `#__user_profiles.${AUTHOR_PROFILE_KEYS.avatar}` : null, ...(prof?.provenance ?? {}) }
      }
    })

  // ── synthetic pages: the views the theme must ship that no route names ──────
  const views = new Set(pageMapPages.map((p) => p.view))
  const synthetic = []
  if (!views.has('single')) {
    const post =
      posts.find((p) => p.joomla.state === 1 && categoryRoute.has(p.joomla.catid)) ??
      posts.find((p) => p.status === 'publish') ??
      posts[0]
    if (post) {
      const route = categoryRoute.get(post.joomla.catid)
      // Joomla's article address is `<category route>/<id>-<alias>`, or the alias alone when the site removes IDs from URLs (com_content `sef_ids`).
      const removeIds = ['1', 1, true].includes(globalContent?.sef_ids)
      const leaf = removeIds ? post.joomla.alias : `${post.joomla.articleId}-${post.joomla.alias}`
      notes.push(`single.html reference URL ends in ${leaf}: ${removeIds ? 'com_content sef_ids removes IDs from URLs' : `com_content sef_ids is ${globalContent?.sef_ids === undefined ? 'not set' : JSON.stringify(globalContent.sef_ids)}, so Joomla keeps the article id in its address`}`)
      const url = route ? `${site}${route.joomlaPath}/${leaf}` : `${site}/${leaf}`
      pageMapPages.push({
        file: 'single.html',
        view: 'single',
        layout: defaultLayout,
        title: post.title,
        path: post.path,
        synthetic: true,
        source: {
          articleId: post.joomla.articleId,
          joomlaPath: new URL(url).pathname,
          reason: 'no route renders a single post; the representative post stands in'
        },
        sections: []
      })
      referencePages.push({ page: 'single.html', url })
      synthetic.push('single.html')
    }
  }
  if (!views.has('404')) {
    // An article of that title that the site serves at its own route is a page of the site (a
    // demo of the 404 style, say): taking it too made a draft with the routed page's slug — the
    // first seed left the routed page at `<slug>-2`, later seeds matched both to one post.
    const errorArticle = arts.find((a) => /^error page$/i.test(a.title.trim()) && !pageByArticle.has(a.id))
    const conv = errorArticle
      ? convert(errorArticle.introtext + errorArticle.fulltext)
      : { markup: '', images: [] }
    pageMapPages.push({
      file: '404.html',
      view: '404',
      layout: defaultLayout,
      title: errorArticle?.title ?? 'Not found',
      path: '/404',
      synthetic: true,
      source: {
        articleId: errorArticle?.id ?? null,
        joomlaPath: '/this-page-does-not-exist',
        reason: 'Joomla serves error.php for unknown paths; no route names it'
      },
      sections: []
    })
    referencePages.push({ page: '404.html', url: `${site}/this-page-does-not-exist` })
    if (errorArticle)
      wpPages.push({
        file: '404.html',
        title: errorArticle.title,
        slug: slugify(errorArticle.title),
        path: null,
        joomlaPath: null,
        view: '404',
        menuLabel: null,
        status: 'draft',
        date: errorArticle.publishUp ?? errorArticle.created,
        modified: errorArticle.modified,
        author: { joomlaUserId: errorArticle.createdBy, alias: errorArticle.createdByAlias },
        excerpt: '',
        featuredImage: null,
        featuredImageAlt: '',
        meta: {},
        parent: null,
        synthetic: false,
        joomla: {
          articleId: errorArticle.id,
          alias: errorArticle.alias,
          catid: errorArticle.catid,
          category: catById.get(errorArticle.catid)?.title ?? null,
          duplicateOf: null
        },
        contentKind: 'blocks',
        content: conv.markup,
        images: conv.images,
        sections: [],
        aside: [],
        orphaned: [],
        droppedContent: null,
        notes: ['body of the Joomla error-page article; the 404 template decides whether to embed it']
      })
    synthetic.push('404.html')
  }
  if (synthetic.length)
    notes.push(`synthetic pages added for required views with no route: ${synthetic.join(', ')}`)
  // A config entry that names a field no article has is a typo: the field it meant stays unplaced
  // (or drawn whole, `skip` and all). Reported, as a `skip` of a subfield no article has is below.
  const unknownFields = Object.keys(articleFields ?? {}).filter((name) => !seenFields.has(name))
  if (unknownFields.length)
    notes.push(`--article-fields names fields no article has (a typo leaves the field meant unplaced, its skip and number unapplied): ${unknownFields.join(', ')}`)
  // A `skip` that names a subfield no article has is a typo: the subfield it meant is still drawn.
  const unknownSkips = Object.entries(articleFields ?? {}).flatMap(([name, cfg]) =>
    seenSubfields.has(name) ? (cfg?.skip ?? []).filter((k) => !seenSubfields.get(name).has(k)).map((k) => `${name}.${k}`) : []
  )
  if (unknownSkips.length)
    notes.push(`--article-fields skip names subfields no article has (a typo leaves the one meant in the body): ${unknownSkips.join(', ')}`)
  if (unplacedFields.size)
    notes.push(
      `article fields not placed in any body (kept in content.json joomla.fields; name each in --article-fields to place it or "skip" it): ${[...unplacedFields]
        .map(([f, where]) => `${f} (${[...new Set(where)].join(', ')})`)
        .join('; ')}`
    )

  // ── block markup self-check ────────────────────────────────────────────────
  const markupProblems = []
  for (const p of [...wpPages, ...posts]) {
    const markups = Array.isArray(p.content)
      ? [p.contentMarkup, ...p.content.flatMap((e) => [e.markup, e.blocks].filter(Boolean))]
      : [p.content]
    for (const markup of markups) {
      const check = checkBlockMarkup(markup)
      if (!check.ok) markupProblems.push(`${p.file ?? p.slug}: ${check.problems.join('; ')}`)
    }
  }
  const unknownSections = wpPages.flatMap((p) =>
    Array.isArray(p.content)
      ? p.content
          .filter((e) => e.kind === 'html')
          .map((e) => `${p.file}: mod_custom #${e.moduleId} "${e.title}" (position ${e.position})`)
      : []
  )
  if (unknownSections.length)
    notes.push(
      `mod_custom modules kept as core/html because no section type matched: ${unknownSections.join('; ')}`
    )

  // ── parent pages: a nested Joomla path is preserved as a page hierarchy ────
  const menuByPath = new Map(
    inv.menu.filter((m) => Number(m.client_id) === 0 && m.path).map((m) => ['/' + m.path, m.title])
  )
  const pagePaths = new Set(wpPages.map((p) => p.path).filter(Boolean))
  const archivePaths = new Map(archives.map((a) => [a.path, a.file]))
  const syntheticParents = []
  const routeBackedPages = wpPages.slice() // parents are appended while iterating
  for (const p of routeBackedPages) {
    if (!p.path) continue
    const segs = p.path.split('/').filter(Boolean)
    for (let i = 1; i < segs.length; i++) {
      const path = '/' + segs.slice(0, i).join('/')
      if (pagePaths.has(path)) continue
      pagePaths.add(path)
      const slug = segs[i - 1]
      const title = menuByPath.get(path) ?? slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())
      const parent = {
        file: null,
        title,
        slug,
        path,
        joomlaPath: null,
        view: 'page',
        menuLabel: menuByPath.get(path) ?? null,
        status: 'publish',
        date: null,
        modified: null,
        author: null,
        excerpt: '',
        featuredImage: null,
        featuredImageAlt: '',
        meta: {},
        parent: parentPath(path),
        synthetic: true,
        syntheticReason: `parent page so that ${p.path} keeps its Joomla path`,
        joomla: menuByPath.has(path) ? { menuPath: path } : null,
        contentKind: 'blocks',
        content: '',
        images: [],
        sections: [],
        aside: [],
        orphaned: [],
        droppedContent: null,
        notes: archivePaths.has(path)
          ? [
              `path ${path} is also the archive route ${archivePaths.get(path)}; the seeder must keep the archive rewrite ahead of this page`
            ]
          : []
      }
      wpPages.push(parent)
      syntheticParents.push(parent)
    }
  }
  if (syntheticParents.length)
    notes.push(`synthetic parent pages for nested paths: ${syntheticParents.map((p) => p.path).join(', ')}`)
  if (markupProblems.length)
    throw new Error(`block markup failed its own check:\n  ${markupProblems.join('\n  ')}`)

  // ── sections ───────────────────────────────────────────────────────────────
  const scopeOf = positionScope
  const linkFields = (obj) =>
    Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [
        k,
        /link|url|href/.test(k) && typeof v === 'string' && /^\/?index\.php/.test(v) ? resolveLink(v) : v
      ])
    )
  // The module chrome each position is drawn with (T3: `style="T3Section"` in the block that draws it); a
  // T3Section module carries its frame params as the chrome reads them (joomla-normalize.mjs).
  const positionChrome = new Map() // position → Set of the styles the layouts draw it with
  const chromeLayouts = new Map() // position → Map(style → [layout names])
  for (const f of tpl.reader.isDir('etc/layout') ? tpl.reader.list('etc/layout') : []) {
    const n = f.match(/^etc\/layout\/([^/]+)\.ini$/)
    if (n)
      for (const o of t3Layout(tpl, n[1])?.order ?? [])
        if (o.kind === 'position') {
          if (!positionChrome.has(o.name)) positionChrome.set(o.name, new Set())
          positionChrome.get(o.name).add(o.style ?? '')
          const by = chromeLayouts.get(o.name) ?? new Map()
          by.set(o.style ?? '', [...(by.get(o.style ?? '') ?? []), n[1]])
          chromeLayouts.set(o.name, by)
        }
  }
  // Layouts that draw one position with different styles give no single frame: it is left out and named, never taken from the first layout.
  for (const [pos, styles] of positionChrome)
    if (styles.size > 1) notes.push(`position "${pos}" is drawn with different module styles by different layouts (${[...chromeLayouts.get(pos)].map(([st, ls]) => `${st || 'no style'}: ${ls.join(', ')}`).join('; ')}); the frame of its modules is not published`)
  const frameOf = (position, params) => {
    const styles = positionChrome.get(position)
    return styles?.size === 1 && styles.has('T3Section') ? { frame: t3SectionFrame(params) } : {}
  }
  const paramsOfModule = new Map(modules.map((m) => [m.id, m.params]))
  const sectionsAcm = acm.map((a) => {
    const layout = tpl.reader.read(`acm/${a.type}/tmpl/${a.style}.php`)
    const computed = layout ? computedAcmItemField(layout.text, a.items, a.fields) : null
    const items = a.items.map((item, index) => ({
      ...item,
      ...(computed?.values ? { [computed.field]: computed.values[index] } : {})
    }))
    return {
      ...a,
      ...frameOf(a.position, paramsOfModule.get(a.id)),
      scope: scopeOf(a.position),
      fields: linkFields(a.fields),
      items: items.map(linkFields),
      ...(computed?.values ? { computedFields: [computed.field] } : {}),
      ...(computed?.unresolved ? { unresolvedComputedFields: [{ field: computed.field, reason: computed.unresolved }] } : {}),
      pages: modulePages.get(a.id) ?? []
    }
  })
  const customModules = modules
    .filter((m) => m.module === 'mod_custom')
    .map((m) => {
      const conv = convert(m.content)
      return {
        id: m.id,
        title: m.title,
        position: m.position,
        scope: scopeOf(m.position),
        ordering: m.ordering,
        showtitle: m.showtitle,
        sectionType: scopeOf(m.position) === 'page' ? detectSectionType(m.content, m.title) : null,
        pages: m.assignment.all && !orphanedModules.has(m.id) ? ['ALL'] : (modulePages.get(m.id) ?? []),
        ...moduleSpacing(m.params),
        ...frameOf(m.position, m.params),
        html: m.content,
        blocks: conv.markup,
        images: conv.images
      }
    })
  const relatedItemsData = (module) => {
    const rawRows = inv.content
    const required = ['metakey', 'state', 'publish_up', 'publish_down', 'access', 'language']
    const unavailable = required.filter((field) => !rawRows.length || rawRows.some((row) => row[field] == null))
    const count = Number(module.params?.count)
    if (!Number.isInteger(count) || count < 1) unavailable.push('module params.count')
    const orderSource = String(module.params?.ordering ?? module.params?.article_ordering ?? '').toLowerCase()
    const orderField = ({ 'a.title': 'title', 'a.created': 'created', 'a.modified': 'modified', 'a.publish_up': 'publishUp', 'a.hits': 'hits', 'a.ordering': 'ordering', 'a.id': 'id', title: 'title', created: 'created', modified: 'modified', publish_up: 'publishUp', hits: 'hits', ordering: 'ordering', id: 'id' })[orderSource]
    if (!orderField) unavailable.push('module params.ordering')
    const direction = String(module.params?.ordering_direction ?? module.params?.article_ordering_direction ?? '').toLowerCase()
    if (!['asc', 'desc'].includes(direction)) unavailable.push('module params.ordering_direction')
    if (unavailable.length) return { relatedByArticle: {}, relatedUnavailable: [...new Set(unavailable)] }
    const nowMs = Date.parse(now)
    const dateValue = (value) => {
      const text = String(value ?? '').trim()
      if (!text || /^0000-00-00(?: 00:00:00)?$/.test(text)) return null
      const ms = Date.parse(text.replace(' ', 'T') + (/[zZ]|[+-]\d\d:\d\d$/.test(text) ? '' : 'Z'))
      return Number.isFinite(ms) ? ms : NaN
    }
    const invalidDates = rawRows.filter((row) => [row.publish_up, row.publish_down].some((value) => Number.isNaN(dateValue(value))))
    if (invalidDates.length) return { relatedByArticle: {}, relatedUnavailable: ['invalid article publish window values'] }
    const active = rawRows.filter((row) => {
      if (String(row.state) !== '1' || String(row.access) !== '1') return false
      const starts = dateValue(row.publish_up)
      const ends = dateValue(row.publish_down)
      return (starts === null || starts <= nowMs) && (ends === null || ends >= nowMs)
    })
    const orderValue = (article) => article[orderField]
    const compare = (left, right) => {
      const a = orderValue(left)
      const b = orderValue(right)
      const numeric = ['hits', 'ordering', 'id'].includes(orderField)
      const result = numeric ? Number(a) - Number(b) : String(a ?? '').localeCompare(String(b ?? ''), 'en', { sensitivity: 'base' })
      return (direction === 'asc' ? result : -result) || Number(left.id) - Number(right.id)
    }
    const byId = new Map(arts.map((article) => [article.id, article]))
    const relatedByArticle = Object.fromEntries(arts.map((current) => {
      const terms = new Set(String(current.metakey ?? '').split(',').map((term) => term.trim().toLocaleLowerCase()).filter(Boolean))
      const articleIds = terms.size
        ? active.filter((row) => {
            const article = byId.get(String(row.id))
            if (!article || article.id === current.id || (article.language !== current.language && article.language !== '*')) return false
            return String(article.metakey ?? '').split(',').some((term) => terms.has(term.trim().toLocaleLowerCase()))
          }).sort((a, b) => compare(byId.get(String(a.id)), byId.get(String(b.id)))).slice(0, count).map((row) => String(row.id))
        : []
      return [current.id, articleIds]
    }))
    return { relatedByArticle, relatedUnavailable: [] }
  }
  const otherModules = modules
    .filter((m) => m.module !== 'mod_custom' && m.module !== 'mod_ja_acm')
    .map((m) => ({
      id: m.id,
      title: m.title,
      module: m.module,
      position: m.position,
      scope: scopeOf(m.position),
      ordering: m.ordering,
      ...frameOf(m.position, m.params),
      // "All pages" is not a placement where a route's layout does not draw the position: then only the routes it was placed on.
      pages: m.assignment.all && !orphanedModules.has(m.id)
        ? ['ALL']
        : (modulePages.get(m.id) ??
          m.assignment.pages.filter((id) => !orphanedModules.get(m.id)?.has(id)).map((id) => ({ menuId: id, file: pageByMenuId.get(id)?.file ?? null }))),
      params: m.params,
      ...(m.module === 'mod_related_items' ? relatedItemsData(m) : {})
    }))

  // ── menus ──────────────────────────────────────────────────────────────────
  const mapItem = (item) => {
    const page = pageByMenuId.get(item.id)
    const gap = gaps.find((g) => g.menuId === item.id)
    let url = null
    if (item.type === 'url') url = item.link
    else if (page) url = page.wpPath
    else if (gap) url = gap.redirectTo
    else if (item.type === 'alias') {
      const t = pageByMenuId.get(String(item.params.aliasoptions ?? ''))
      url = t ? t.wpPath : null
    }
    return {
      id: item.id,
      label: item.title,
      type: item.type,
      joomlaPath: item.path ? `/${item.path}` : null,
      url,
      page: page?.file ?? null,
      view: page?.wpView ?? null,
      aliasOf: item.type === 'alias' ? String(item.params.aliasoptions ?? '') : undefined,
      published: item.published === 1 && menuShown(item.params),
      ...(menuShown(item.params) ? {} : { menuShow: false }),
      children: item.children.map(mapItem)
    }
  }
  const menus = siteMenuTypes(inv).map((menutype) => ({
    menutype,
    title: menutype,
    items: menuTree(inv, menutype).map(mapItem)
  }))
  const adminMenus = [
    ...new Set(inv.menu.filter((m) => Number(m.client_id) === 1 && m.menutype).map((m) => m.menutype))
  ]
  if (adminMenus.length)
    notes.push(`administrator menus not exported (client_id 1): ${adminMenus.join(', ')}`)

  // ── redirects ──────────────────────────────────────────────────────────────
  const redirectRules = []
  for (const g of gaps)
    redirectRules.push({ from: g.joomlaPath, to: g.redirectTo, status: 301, reason: `gap: ${g.reason}` })
  for (const p of routePages)
    if (p.joomlaPath !== p.wpPath)
      redirectRules.push({
        from: p.joomlaPath,
        to: p.wpPath,
        status: 301,
        reason: p.renamed ? p.renamed.why : 'route renamed by D2 (category slug from title)'
      })
  const redirects = {
    rules: redirectRules,
    categorySlugs: cats
      .map((c) => ({ id: c.id, title: c.title, joomlaAlias: c.joomlaAlias, wpSlug: c.wpSlug }))
      .filter((c) => c.joomlaAlias !== c.wpSlug)
  }

  // ── theme ──────────────────────────────────────────────────────────────────
  // The design source: the template's Tracy token sheet (legacy), else the sheets its framework
  // loads for each template style (resolveDesign). The base path is read from --site-url as given:
  // `site` drops trailing slashes, which would fold an empty segment (`/sub//`) away.
  const design = resolveDesign({ j6Dir, tpl, inv, pageMapPages, menuById, routes, ...siteBase(siteUrl) })
  // Every dump file and the capture are read by now: they must still be the generation verified before the first read.
  hooks.afterInputs?.()
  recheckGeneration(j6Dir, dump0, readDumpJson(join(j6Dir, 'dump.json')), epoch0)
  const framed = design.mode === 'framework'
  const homeDesign = framed ? design.styles.find((s) => s.id === design.homeId)?.design : null
  const T = framed ? { light: homeDesign?.tokens['desktop-light'] ?? {}, dark: homeDesign?.tokens['desktop-dark'] ?? {} } : tpl.tokens,
    L = T.light,
    D = T.dark
  let light, dark, hasDark
  let paletteFrom = {}
  if (framed) ({ light, dark, hasDark, from: paletteFrom } = frameworkPalette(design, tpl))
  else {
    light = {
      primary: L['--accent'] ?? tpl.theme.color_primary ?? null,
      secondary: tpl.theme.color_secondary ?? L['--surface'] ?? null,
      body_bg: L['--bg'] ?? tpl.theme.body_bg_color ?? null,
      text: L['--fg'] ?? tpl.theme.body_text_color ?? null
    }
    hasDark = Boolean(D['--bg'] && D['--fg'] && D['--accent'])
    dark = hasDark
      ? {
          primary: D['--accent'],
          secondary: D['--surface'] ?? light.secondary,
          body_bg: D['--bg'],
          text: D['--fg']
        }
      : null
  }
  if (framed)
    notes.push(
      `design source: ${design.framework.framework} template sheets per style (${design.styles.map((s) => `#${s.id}: ${s.sheets.filter((x) => x.status === 'read').map((x) => x.path).join(', ') || 'none read'}`).join('; ')})`
    )
  if (framed) {
    const dropped = [...new Set(DESIGN_VARIANTS.flatMap((v) => Object.keys(homeDesign?.tokens[v.id] ?? {}).filter((k) => !(k in commonTokens(design, v.id)))))].sort()
    if (dropped.length) notes.push(`design-contract.json tokens: ${dropped.length} token(s) of the home style #${design.homeId} are left out because the pages (${tokenScope(design).map((x) => x.label).join(', ')}) do not all resolve them to one value: ${dropped.join(', ')}`)
  }
  if (Object.keys(paletteFrom).length) notes.push(`palette from LESS (no resolved CSS value): ${Object.entries(paletteFrom).map(([k, v]) => `${k} ${light[k]} ← ${v}`).join('; ')}`)
  for (const u of design.less?.unresolved ?? []) notes.push(`LESS @${u.name} (${u.key}) is not read: ${u.why}`)
  for (const g of design.less?.gaps ?? []) notes.push(`LESS palette: ${g}`)
  if (!hasDark)
    notes.push(
      framed
        ? `the ${design.framework.framework} sheets change no body colour under html[data-theme="dark"]; dark palette left to Phase 6 (darkDerived)`
        : 'no html[data-theme="dark"] token remap found in the template css; dark palette left to Phase 6 (darkDerived)'
    )
  // the family the default style resolves to (local/etc over etc, theme fallback per missing key): declared intent, never the measured fallback
  const defaultStyleFonts = sourceFontsStaticReport.styles.find((x) => x.usedBy?.default && x.roles)
  const declaredFamily = (role) => firstFamily(defaultStyleFonts?.roles.find((r) => r.role === role)?.family)
  // A T4 source's fonts are exactly what its resolved profile declares: a family it leaves undeclared stays null (the
  // source-font gate names that fault) and is never borrowed from an unrelated sheet. Heading and menu inherit the body family.
  const fonts =
    defaultStyleFonts?.framework === 'T4'
      ? { body: declaredFamily('body') ?? null, heading: declaredFamily('heading') ?? declaredFamily('body') ?? null }
      : {
          body: declaredFamily('body') ?? firstFamily(tpl.site.body_font_family) ?? firstFamily(L['--font-body']) ?? firstFamily(homeDesign?.rules.find((r) => r.role === 'body-type')?.styles['desktop-light'].fontFamily) ?? firstFamily(design.less?.values.fontBody?.value) ?? null,
          heading: declaredFamily('heading') ?? firstFamily(tpl.site.heading_font_family) ?? firstFamily(L['--font-display']) ?? null
        }
  const themeSlug = /^[a-z][a-z0-9-]*$/.test(`${tpl.name}-base`) ? `${tpl.name}-base` : 'site'
  const pageMap = {
    template: {
      name: themeSlug,
      title: `${tpl.styleTitle.replace(/\s*[—-].*$/, '').trim() || tpl.name} Base`,
      version: tpl.version || null
    },
    theme: { palette: { light, dark }, darkDerived: !hasDark, fonts, hook: { ...DEFAULT_THEME_HOOK } },
    templateParts: ['header', 'footer'],
    pages: pageMapPages,
    gaps: gaps.map((g) => ({
      joomlaPath: g.joomlaPath,
      menuId: g.menuId,
      title: g.title,
      source: `${g.option ?? '?'}/${g.view ?? '?'}`,
      reason: g.reason,
      redirectTo: g.redirectTo
    })),
    menus: menus.map((m) => m.menutype),
    source: { kind: 'joomla', template: tpl.name, style: tpl.styleTitle, siteUrl: site }
  }

  // ── write the pack ─────────────────────────────────────────────────────────
  mkdirSync(out, { recursive: true })
  initSpecPack(out, {
    pageMap,
    kind: 'url',
    adapter: ADAPTER,
    source: {
      kind: 'joomla-quickstart',
      path: j6Dir,
      inventory: inventoryPath,
      routes: routes.length,
      template: tpl.name,
      siteUrl: site
    },
    viewports: [1440, 390],
    modes: ['light', 'dark'],
    pages: referencePages,
    force
  })
  const pageMapPath = join(out, 'page-map.json')
  // A coverage report of an earlier run (--force) describes that run: it goes before anything of
  // this run is written, so a run that fails from here on leaves no report beside a half-new pack.
  rmSync(join(out, COVERAGE_FILE), { force: true })

  writeJson(join(out, 'content.json'), {
    site: {
      name: tpl.site.site_name ?? null,
      tagline: tpl.site.site_slogan ?? null,
      logo: tpl.site.site_logo ?? null,
      url: site
    },
    categories: cats.map((c) => ({
      id: c.id,
      title: c.title,
      wpSlug: c.wpSlug,
      joomlaAlias: c.joomlaAlias,
      parent: c.parentId ? (catById.get(c.parentId)?.wpSlug ?? null) : null,
      description: c.description,
      postCount: posts.filter((p) => p.joomla.catid === c.id).length
    })),
    pages: wpPages,
    posts,
    ...(users ? { authors: contentAuthors } : {}),
    archives,
    unresolvedLinks: [...unresolvedLinks].sort()
  })
  writeJson(join(out, 'sections.json'), {
    slotBlock: SLOT_BLOCK,
    acm: sectionsAcm,
    custom: customModules,
    other: otherModules
  })
  writeJson(join(out, 'menus.json'), { menus })
  writeJson(join(out, 'redirects.json'), redirects)

  // ── the neutral source contract (ADR 0016 of TCH) ──────────────────────────
  // Written from the SAME data, one step earlier than the four files above: article HTML as the
  // author wrote it, before html-to-blocks. Nothing downstream reads it yet — the EmDash skill
  // does, and this skill's seeder will when it stops reading those four. An extra file breaks
  // nobody; that is the point of adding it before anything depends on it.
  writeJson(
    join(out, 'site-model.json'),
    buildSiteModel({ tpl, site, arts, cats, catById, wpPages, archives, sectionsAcm, menus, redirects, isPageArticle, postPath })
  )

  // ── contracts ──────────────────────────────────────────────────────────────
  const contact =
    acm.find((a) => a.type === 'contact-information' && a.published) ??
    acm.find((a) => a.type === 'contact-information')
  const notice = acm.find((a) => a.type === 'site-notice')
  const facts = {}
  const fact = (key, value, status, source) => {
    if (value != null && String(value).trim()) facts[key] = { value: String(value).trim(), status, source }
  }
  fact('site.name', tpl.site.site_name, 'verified', 'joomla')
  fact('site.tagline', tpl.site.site_slogan, 'verified', 'joomla')
  // An identity field the source declares empty is recorded as absent, with the files that say so;
  // one the adapter could not read stays missing, and the gate says why (explainSpecProblems).
  const absent = absentIdentity(tpl)
  for (const [key, why] of [['site.name', absent.name], ['site.tagline', absent.tagline]])
    if (why && !facts[key]) facts[key] = { value: '', status: ABSENT, source: 'joomla-identity' }
  if (absent.name || absent.tagline) notes.push(`identity: ${[absent.name, absent.tagline].filter(Boolean).join('; ')} — recorded as ${ABSENT}, not filled in`)
  if (contact) {
    fact('contact.heading', contact.fields.heading, 'demo', 'demo')
    fact('contact.email', contact.fields.email, 'demo', 'demo')
    fact('contact.email-label', contact.fields['email-label'], 'demo', 'demo')
    fact('contact.notice', contact.fields.notice, 'demo', 'demo')
  }
  fact(
    'demo.disclosure',
    notice?.fields.notice ??
      'Demonstration site: company details, team profiles and prices are illustrative.',
    'demo',
    'demo'
  )
  const contactFacts = Object.keys(facts).filter((k) => k.startsWith('contact.'))
  writeJson(join(out, 'content-contract.json'), {
    schemaVersion: 1,
    id: themeSlug,
    revision: 1,
    mode: 'demo',
    language: 'en',
    identity: { name: 'site.name', summary: 'site.tagline', disclosure: 'demo.disclosure' },
    voice: [
      'Plain, specific English: say what the studio does and the next step, as the Joomla source copy does.'
    ],
    sources: {
      joomla: {
        kind: 'site',
        reference: recordPath(resolve(inventoryPath), recordPaths),
        note: `Joomla database inventory of the ${tpl.styleTitle} quickstart (template etc/site/*.json for identity)`
      },
      demo: {
        kind: 'demo',
        reference: notice ? `mod_ja_acm #${notice.id} (${notice.title})` : 'site-notice module',
        note: 'The site labels its own contact details and prices as demonstration content.'
      },
      ...(absent.name || absent.tagline
        ? { 'joomla-identity': { kind: 'site', reference: tpl.siteFile, note: `Identity fields the source declares empty: ${[absent.name, absent.tagline].filter(Boolean).join('; ')}` } }
        : {})
    },
    facts,
    surfaces: pageMapPages.map((p) => ({
      id: p.file,
      purpose: `${p.view} · ${p.source?.joomlaPath ?? p.path} (${p.title})`,
      requiredFacts: p.view === 'page-contact' ? contactFacts : []
    })),
    pending: []
  })

  const variants = DESIGN_VARIANTS.map((v) => ({ ...v }))
  const tokenSet = (mode) => (mode === 'dark' ? { ...L, ...D } : { ...L })
  const perVariant = (fn) => Object.fromEntries(variants.map((v) => [v.id, fn(v)]))
  const darkOr = (key, fallback) => (hasDark ? (D[key] ?? fallback) : fallback)
  const bandY = (v) =>
    v.width <= 575
      ? (L['--section-y-phone'] ?? L['--tracy-band-y-phone'])
      : (L['--section-y-desktop'] ?? L['--tracy-band-y'])
  const rules = []
  if (L['--text-base'] || tpl.site.body_font_size)
    rules.push({
      id: 'body-type',
      category: 'typography',
      selector: 'body',
      styles: perVariant(() => ({ fontSize: L['--text-base'] ?? tpl.site.body_font_size }))
    })
  if (light.text && light.body_bg)
    rules.push({
      id: 'body-colors',
      category: 'color',
      selector: 'body',
      styles: perVariant((v) =>
        v.mode === 'dark'
          ? { color: darkOr('--fg', light.text), backgroundColor: darkOr('--bg', light.body_bg) }
          : { color: light.text, backgroundColor: light.body_bg }
      )
    })
  if (bandY({ width: 1440 }))
    rules.push({
      id: 'band-rhythm',
      category: 'layout',
      selector: '.tracy-band',
      styles: perVariant((v) => ({ paddingTop: bandY(v), paddingBottom: bandY(v) }))
    })
  if (L['--tracy-capsule'] ?? L['--radius-pill'])
    rules.push({
      id: 'capsule-button',
      category: 'component',
      selector: '.tracy-btn',
      styles: perVariant(() => ({ borderRadius: L['--tracy-capsule'] ?? L['--radius-pill'] }))
    })
  // Framework mode: each style's own rules, applied to the pages of that style only; the ids carry
  // the style when the pages use more than one.
  const rulesOfPage = new Map()
  if (framed) {
    rules.length = 0
    const used = design.styles.filter((s) => placedPages(s).length)
    for (const s of used) {
      const ids = []
      for (const r of s.design.rules) {
        const id = used.length > 1 ? `s${s.id}-${r.role}` : r.role
        rules.push({ id, category: r.category, selector: r.selector, styles: r.styles })
        ids.push(id)
      }
      s.ruleIds = ids
      for (const f of placedPages(s)) rulesOfPage.set(f, ids)
    }
  }
  // A page's identity is what shows the rendered page is the page's content, from the selector profile
  // of the template's framework (lib/framework-selectors.mjs, #66): `main` on T4; on T3 — no `<main>`
  // at all — `.t3-mainbody` or the `.t3-section` bands of a home page built of sections. A framework
  // with no profile names the generic landmarks and a note says so.
  const identityOf = selectorProfileFor(design.framework.framework, { from: `templates/${tpl.name} classification` })
  if (identityOf.gap) notes.push(`design-contract.json page identity: ${identityOf.gap}`)
  const designPages = pageMapPages.map((p) => {
    const ref = referencePages.find((r) => r.page === p.file)
    const own = framed ? rules.filter((r) => (rulesOfPage.get(p.file) ?? []).includes(r.id)) : rules
    return {
      id: p.file,
      url: ref.url,
      expectedUrl: ref.url,
      identity: identityOf.profile.identity,
      rules: own.map((r) => r.id),
      requiredRules: own.filter((r) => r.category === 'color').map((r) => r.id)
    }
  })
  const missingRuleCategories = ['typography', 'color', 'layout', 'component'].filter(
    (c) => !rules.some((r) => r.category === c)
  )
  const designFrom = framed
    ? `the ${design.framework.framework} sheets (${[...new Set(design.styles.flatMap((s) => s.sheets.filter((x) => x.status === 'read').map((x) => x.path)))].join(', ') || 'none read'})`
    : (tpl.tokensFile ? recordPath(resolve(tpl.tokensFile), recordPaths) : 'the template css')
  const designPending = missingRuleCategories.map((c) => `no ${c} rule could be read from ${designFrom}`)
  if (framed) {
    const bare = variants.filter((v) => !Object.keys(commonTokens(design, v.id)).length).map((v) => v.id)
    if (bare.length) designPending.push(`${TOKENS_NOT_COMMON} (${tokenScope(design).map((x) => x.label).join(', ')}) at ${bare.join(', ')}: no site-wide token expectation can be stated there`)
  }
  const coverageGroups = framed
    ? [...new Map(rules.map((r) => [r.selector, null])).keys()].map((selector) => ({
        selector,
        properties: [...new Set(rules.filter((r) => r.selector === selector).flatMap((r) => Object.values(r.styles).flatMap((x) => Object.keys(x))))]
      }))
    : [
        { selector: 'body', properties: ['color', 'backgroundColor', 'fontSize'] },
        { selector: '.tracy-band', properties: ['paddingTop', 'paddingBottom'] }
      ]
  writeJson(join(out, 'design-contract.json'), {
    schemaVersion: 1,
    id: themeSlug,
    revision: 1,
    source: {
      reference: site,
      inspiration: `${tpl.styleTitle} (Joomla template "${tpl.name}", theme "${tpl.themeKey}")`,
      version: tpl.version || '0',
      capturedAt: now
    },
    theme: { ...DEFAULT_THEME_HOOK },
    variants,
    tokens: perVariant((v) => (framed ? commonTokens(design, v.id) : tokenSet(v.mode))),
    rules,
    coverage: coverageGroups.length ? coverageGroups : [{ selector: 'body', properties: ['color', 'backgroundColor', 'fontSize'] }],
    pages: designPages,
    pilotPages: [pageMapPages.find((p) => p.view === 'front-page')?.file ?? pageMapPages[0].file],
    exceptions: [],
    pending: designPending
  })

  // ── design-spec.md ─────────────────────────────────────────────────────────
  const md = execFileSync(process.execPath, [MAKE_DESIGN_SPEC, pageMapPath], { encoding: 'utf8', timeout: DESIGN_SPEC_TIMEOUT_MS })
  const spec = fillDesignSpec(md, {
    tpl,
    tokens: T,
    hasDark,
    pageMapPages,
    referencePages,
    acmById,
    themeSlug,
    design
  })
  spec.md += sourceFontsSection(sourceFontsStaticReport, sourceFontsBrowser)
  writeFileSync(join(out, 'design-spec.md'), spec.md)
  writeJson(join(out, REPORT_FILE), buildReport({ staticReport: sourceFontsStaticReport, browser: sourceFontsBrowser, siteUrl }))
  if (spec.unresolved.length)
    notes.push(`design-spec.md slots the source could not fill: ${spec.unresolved.join(', ')}`)

  // ── provenance ─────────────────────────────────────────────────────────────
  if (!users) notes.push('author names are not in the inventory (no #__users table); posts carry the Joomla user id only')
  else {
    notes.push(`authors: ${contentAuthors.length} from #__users (name, username) and #__user_profiles (${AUTHOR_PROFILE_KEYS.avatar}); ${contentAuthors.filter((a) => !a.avatar).length} without a picture`)
    if (missingUsers.size) notes.push(`articles name user(s) ${[...missingUsers].sort((a, b) => Number(a) - Number(b)).join(', ')} that #__users does not have (or has without a name); those posts carry the Joomla user id only`)
  }
  if (!tagged) notes.push('article tags are not in the inventory (no #__tags or #__contentitem_tag_map table); posts carry no tags field')
  else {
    notes.push(`article tags: ${posts.filter((p) => p.tags?.length).length} of ${posts.length} posts tagged, from #__contentitem_tag_map (${ARTICLE_TAG_TYPE}) and #__tags, in tag-tree order`)
    notes.push(...tagged.notes)
  }
  notes.push('Joomla state 2 (archived) maps to publish: WordPress has no archived status')
  notes.push('images are referenced as /wp-content/uploads/<basename> and listed per post; nothing is copied')
  if (unresolvedLinks.size)
    notes.push(
      `${unresolvedLinks.size} Joomla link(s) had no WordPress target (see content.json unresolvedLinks)`
    )
  const prov = readJson(join(out, 'provenance.json'))
  prov.generatedAt = now
  prov.source = {
    ...prov.source,
    template: {
      name: tpl.name,
      version: tpl.version || null,
      style: tpl.styleTitle,
      theme: tpl.themeKey,
      tokens: tpl.tokensFile,
      css: cssProvenance(design)
    },
    contentParams: contentParamsFrom,
    siteName: tpl.siteNameFrom,
    siteConfig: siteConfig.from
  }
  prov.counts = {
    routes: routes.length,
    pages: pageMapPages.length,
    wpPages: wpPages.length,
    posts: posts.length,
    categories: cats.length,
    menus: menus.length,
    sections: sectionsAcm.length,
    customModules: customModules.length,
    gaps: gaps.length,
    redirects: redirectRules.length,
    syntheticParents: syntheticParents.length,
    sectionsDetected: wpPages.reduce(
      (n, p) => n + (Array.isArray(p.content) ? p.content.filter((e) => e.kind === 'section').length : 0),
      0
    )
  }
  prov.sourceFonts = {
    file: REPORT_FILE,
    static: { complete: sourceFontsStaticReport.complete, usedStyles: sourceFontsStaticReport.usedStyles.length, findings: staticFindings(sourceFontsStaticReport.styles).length },
    browser: sourceFontsBrowser ? { measuredAt: sourceFontsBrowser.measuredAt ?? null, site: sourceFontsBrowser.site ?? null, pages: sourceFontsBrowser.pages?.length ?? 0 } : null
  }
  prov.notes = notes
  writeJson(join(out, 'provenance.json'), recordData(prov, recordPaths))

  const validation = validateSpecPack(out, { pageFloor, decisionsText })

  // ── adapter coverage ───────────────────────────────────────────────────────
  const coverage = adapterCoverage({
    j6Dir,
    inv,
    missingTables,
    routes,
    entries,
    tpl,
    defaultLayout,
    routeSkips,
    bodyDrawn,
    bodyUncertain,
    layoutIncomplete,
    ...drawing,
    layoutCauses,
    layoutBody,
    arts,
    cats,
    isPageArticle,
    keptPosts,
    trashedCats,
    posts,
    wpPages,
    archives,
    pageMapPages,
    menus,
    acm,
    modulePages,
    articleFields,
    unplacedFields,
    unplacedByArticle,
    moduleLoadLog,
    skippedFields,
    skippedSubfields,
    unknownSections,
    notes,
    validation,
    design,
    specCauses: explainSpecProblems(validation.problems ?? [], { tpl, hasDark, pending: designPending, specMd: spec.md, design }),
    now
  })
  writeJsonAtomic(join(out, COVERAGE_FILE), recordData(coverage, recordPaths))
  return { out, counts: prov.counts, validation, notes, coverage: coverage.summary, contentParamsFrom }
}

// ── adapter coverage ──────────────────────────────────────────────────────────
//
// adapter-coverage.json accounts for every source entity the adapter met — each render route,
// #__menu / #__content / #__categories / #__modules / #__template_styles row, each captured T4
// layout and block, each animation library the capture evidences, each extension the inventory
// references — with its stage-2 extraction status, the artifact that carries it, the source ids
// and paths, the routes it affects and, for anything not mapped, the reason. The status is about
// EXTRACTION only: whether a later phase renders it the way the source does is not decided here.
// See references/inputs/from-joomla.md §Adapter coverage.

export const COVERAGE_FILE = 'adapter-coverage.json'
const COVERAGE_SCHEMA_VERSION = 1
/** Extraction statuses, most severe first: the order `items[]` is sorted in after `critical`. */
export const COVERAGE_STATUSES = ['unsupported', 'partial', 'skipped-by-rule', 'mapped']
export const COVERAGE_KINDS = ['validation-gap', 'route', 'menu-item', 'article', 'content', 'category', 'module', 'template-style', 'layout', 'layout-block', 'animation', 'asset', 'extension']
/** The inventory tables each census kind is reconciled against (one entity per row). */
const COVERAGE_TABLES = { 'menu-item': 'menu', article: 'content', category: 'categories', module: 'modules', 'template-style': 'template_styles' }

/** Gate problems about the whole site (identity, theme, design, the pack's own files): every routed page. */
const SITE_WIDE_PROBLEM =
  /^(content-contract\.json: .*identity\.|page-map\.theme\.|page-map\.template\.|design-contract\.json: .*pending design decisions|design-contract\.json: tokens\.|design-spec\.md |provenance\.json|missing required file|scope\.)/
/** The pack artifact a gate problem is about, read off its message. */
const problemArtifact = (problem) =>
  problem.match(/^(?:missing required file: )?([a-z-]+\.(?:json|md))\b/)?.[1] ??
  (/^page "/.test(problem) ? 'reference.json' : /^(page-map\.|scope\.|no page maps)/.test(problem) ? 'page-map.json' : null)

/**
 * One `validation-gap` item per spec-pack gate problem: unsupported and critical, carrying the
 * exact problem, its traced cause (or an explicit unknown cause) and the source paths the cause
 * names. The scope is read off the problem: a site-wide problem affects every routed page, a
 * problem naming a page file affects the routes of that page, any other scope stays unknown.
 * Identities are `validation-gap:<artifact>:<n>`, numbered in the gate's order per artifact.
 *
 * @param {{ problem: string, cause: string|null }[]} causes
 * @param {{ siteRoutes: string[], routesOfPage: (file: string) => string[], evidenceOf: (problem: string) => string[] }} ctx
 */
export function validationGapItems(causes, { siteRoutes, routesOfPage, evidenceOf }) {
  const seen = new Map()
  return causes.map(({ problem, cause }) => {
    const artifact = problemArtifact(problem)
    const n = (seen.get(artifact) ?? 0) + 1
    seen.set(artifact, n)
    const page = problem.match(/(?:\bfor |^page "|^reference\.json page ")([^"\s]+\.html)\b/)?.[1] ?? null
    let impact
    if (SITE_WIDE_PROBLEM.test(problem)) impact = { routes: [...new Set(siteRoutes)].sort(), scope: 'site-wide' }
    else if (page) impact = { routes: [...new Set(routesOfPage(page))].sort(), scope: `page ${page}` }
    else impact = { routes: [], scope: 'unknown: the gate problem names no page and is not a site-wide setting' }
    return {
      id: `validation-gap:${artifact ?? 'pack'}:${n}`,
      title: problem,
      critical: true,
      source: { from: 'spec-pack gate (validateSpecPack)', artifact, problem, cause: cause ?? null, evidence: evidenceOf(problem) },
      impact,
      reason: cause ? `the spec-pack gate refuses the pack: ${problem} — cause: ${cause}` : `the spec-pack gate refuses the pack: ${problem} — cause unknown: the adapter traces this problem to no source input`
    }
  })
}

/**
 * The module types stage 2 reads into a declared target. A type not listed here is kept raw in
 * sections.json `other[]` (its params, untouched) and reported unsupported: raw preservation is
 * not a mapping.
 */
export const MODULE_TARGETS = Object.freeze({
  mod_ja_acm: 'sections.json acm[]: typed fields and zipped items',
  mod_custom: 'sections.json custom[]: html and block markup',
  mod_menu: 'menus.json: the menu type the module prints',
  mod_jamasthead: 'content.json archives[].masthead: title and description per archive route',
  mod_articles_category: 'sections.json other[]: params.catid and params.count, a titles query of those categories',
  mod_related_items: 'sections.json other[]: source params and explicit related article ids evidenced by shared metakey terms',
  mod_articles_categories: 'sections.json other[]: params.parent, a subcategory list'
})

/**
 * Animation libraries the census recognises: `names` are the name tokens a template declares them
 * under (an etc/assets.json key, an etc/global.json system_addons entry, a js/ folder or file),
 * `usage` the markup or script that uses them. Library files alone are "installed", not "used".
 * A declared script no entry recognises is an `asset` entry of its own, never dropped.
 */
const ANIMATION_LIBRARIES = Object.freeze({
  aos: { names: ['aos'], usage: /\bdata-aos(?:-[a-z]+)*\s*=|\bAOS\.init\s*\(/ },
  'owl-carousel': { names: ['owl', 'owlcarousel'], usage: /\.owlCarousel\s*\(|\bowl-carousel\b/ },
  wow: { names: ['wow', 'wowjs'], usage: /\bnew\s+WOW\s*\(|\bclass\s*=\s*["'][^"']*\bwow\b/ },
  'animate.css': { names: ['animate', 'animatecss'], usage: /\banimate__animated\b/ },
  gsap: { names: ['gsap', 'tweenmax', 'scrolltrigger'], usage: /\bgsap\.(?:to|from|fromTo|set|timeline|registerPlugin)\s*\(|\bScrollTrigger\.create\s*\(|\bTweenMax\.\w+\s*\(/ },
  scrollreveal: { names: ['scrollreveal'], usage: /\bScrollReveal\s*\(/ },
  isotope: { names: ['isotope'], usage: /\.isotope\s*\(|\bnew\s+Isotope\s*\(/ },
  swiper: { names: ['swiper'], usage: /\bnew\s+Swiper\s*\(/ },
  slick: { names: ['slick'], usage: /\.slick\s*\(/ },
  lottie: { names: ['lottie', 'bodymovin'], usage: /\blottie\.loadAnimation\s*\(|<lottie-player\b/ },
  parallax: { names: ['rellax', 'jarallax', 'parallax'], usage: /\bnew\s+Rellax\s*\(|\bjarallax\s*\(|\bdata-(?:jarallax|rellax-speed)\b/ }
})
/** The animation library a declared name (`js.aos`, `owl-carousel`, `isotope.pkgd.min.js`) is, or null. */
const animationLibraryOf = (name) => {
  const tokens = String(name).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  return Object.entries(ANIMATION_LIBRARIES).find(([, L]) => L.names.some((n) => tokens.includes(n)))?.[0] ?? null
}

/** Captured files larger than this are not read (reported as not inspected). */
const SCAN_MAX_BYTES = 1024 * 1024
/** At most this many captured files are listed when the capture is walked. */
const SCAN_MAX_FILES = 5000
/** Captured files read for animation usage: markup, config and non-minified script. */
const SCAN_EXT = /\.(php|html?|xml|ini|json|js)$/i

/** The six tables every dump holds, and the keys of their rows (modules_menu: a composite key). */
const INVENTORY_KEYS = { content: ['id'], categories: ['id'], menu: ['id'], modules: ['id'], modules_menu: ['moduleid', 'menuid'], template_styles: ['id'] }
/** Tables a dump may hold; when present, checked like the six. */
const OPTIONAL_INVENTORY_KEYS = { extensions: ['type', 'element'] }
/** The identity of an #__extensions row: its extension_id, else type/folder/element/client. */
const extensionKey = (r) => String(r.extension_id ?? r.id ?? [r.type, r.folder || '-', r.element, r.client_id ?? 0].join(':'))

/**
 * The raw inventory before normaliseInventory makes it safe: an object holding the six tables, every
 * table a list of row objects, every row with its key, no key twice (modules_menu: no
 * moduleid/menuid pair twice). An optional table (extensions) is checked the same way when present;
 * its absence is returned in `missingTables` (the coverage report names it as a limitation).
 * Throws naming `where`, the table and the row.
 */
export function checkInventoryShape(raw, where = 'inventory.json') {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error(`${where}: expected an object of tables (${Object.keys(INVENTORY_KEYS).join(', ')}), got ${raw === null ? 'null' : Array.isArray(raw) ? 'a list' : typeof raw}`)
  const absent = Object.keys(INVENTORY_KEYS).filter((t) => !Object.hasOwn(raw, t))
  if (absent.length)
    throw new Error(`${where}: no ${absent.map((t) => `"${t}"`).join(', ')} table${absent.length > 1 ? 's' : ''}; a Joomla dump holds ${Object.keys(INVENTORY_KEYS).join(', ')} (an empty table is [], not absent)`)
  const missingTables = []
  for (const [table, keys] of [...Object.entries(INVENTORY_KEYS), ...Object.entries(OPTIONAL_INVENTORY_KEYS)]) {
    if (!Object.hasOwn(raw, table)) {
      missingTables.push(table)
      continue
    }
    const rows = raw[table]
    if (!Array.isArray(rows)) throw new Error(`${where}: table "${table}" is ${rows === null ? 'null' : typeof rows}, not a list of rows`)
    const seen = new Map()
    rows.forEach((row, i) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`${where}: ${table}[${i}] is not a row object`)
      for (const k of keys) if (row[k] == null || String(row[k]).trim() === '') throw new Error(`${where}: ${table}[${i}] has no ${k}`)
      const id = table === 'extensions' ? extensionKey(row) : keys.map((k) => String(row[k])).join('/')
      if (seen.has(id))
        throw new Error(`${where}: ${table}[${i}] repeats ${table === 'extensions' ? 'extension' : keys.join('/')} ${id} of ${table}[${seen.get(id)}]; a table keeps each key once, so one row would overwrite or double the other`)
      seen.set(id, i)
    })
  }
  return { missingTables }
}

/**
 * render-routes.json: a non-empty list of `{ id, path }`, no route listed twice. A route may carry
 * `stylesheets`: the stylesheet URLs its rendered page links, in document order (a live capture's
 * evidence of the sheets the route is served). Throws naming `where`.
 */
export function checkRenderRoutes(routes, where = 'render-routes.json') {
  if (!Array.isArray(routes)) throw new Error(`${where}: expected a list of { id, path }, got ${routes === null ? 'null' : typeof routes}`)
  if (!routes.length) throw new Error(`${where}: the list is empty; there is no route to build a page from`)
  const seen = new Set()
  routes.forEach((r, i) => {
    if (!r || typeof r !== 'object' || Array.isArray(r) || r.id == null || String(r.id).trim() === '' || typeof r.path !== 'string' || !r.path.trim())
      throw new Error(`${where}: routes[${i}] is not { id, path }`)
    const key = `${r.id} ${r.path.startsWith('/') ? r.path : `/${r.path}`}`
    if (seen.has(key)) throw new Error(`${where}: route ${r.path} (menu item ${r.id}) is listed twice`)
    seen.add(key)
    const answer = routeAnswer(r)
    if (answer?.problem) throw new Error(`${where}: routes[${i}] (${r.path}): ${answer.problem}`)
    if (r.stylesheets !== undefined && (!Array.isArray(r.stylesheets) || r.stylesheets.length > MAX_ROUTE_SHEETS || !r.stylesheets.every((h) => typeof h === 'string' && h.trim() !== '')))
      throw new Error(`${where}: routes[${i}].stylesheets must be a list of at most ${MAX_ROUTE_SHEETS} stylesheet URLs (non-empty strings), the ones the rendered page links in document order`)
  })
}

/** Write JSON through a temporary file and a rename: a reader never sees half a report. */
function writeJsonAtomic(p, data) {
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`
  try {
    writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' })
    renameSync(tmp, p)
  } catch (e) {
    rmSync(tmp, { force: true })
    throw new Error(`${p}: ${e.message}`)
  }
}

/** A params-like column that holds text which is not JSON (parseJsonColumn read it as `{}`). */
const brokenJson = (value) => {
  if (value == null || typeof value === 'object' || String(value).trim() === '') return false
  try {
    JSON.parse(value)
    return false
  } catch {
    return true
  }
}

/** Plain directory/file name segment: no separator, no `..`. */
const plainName = (n) => typeof n === 'string' && TEMPLATE_DIR_NAME.test(n) && !/^\.+$/.test(n)

/**
 * macOS open(2) flag O_NOFOLLOW_ANY: the open fails if any component of the path is a symbolic
 * link, checked by the kernel in the same lookup. Node does not name it; elsewhere it is 0 and
 * O_NOFOLLOW (the last component) is used — every other component is a directory handle.
 */
const O_NOFOLLOW_ANY = process.platform === 'darwin' ? 0x20000000 : 0
/**
 * How a directory already opened is named again without a path to it — Node has no openat(2) or
 * fdopendir(3): on macOS `/.vol/<dev>/<ino>` (the directory by its identity), on Linux
 * `/proc/self/fd/<fd>` (the open descriptor). A name under such a handle is looked up in that very
 * directory, whatever has since been moved or linked at its path. Elsewhere there is none, and the
 * capture is not read.
 */
const DIR_HANDLE = process.platform === 'darwin' ? (fd, st) => `/.vol/${st.dev}/${st.ino}` : process.platform === 'linux' ? (fd) => `/proc/self/fd/${fd}` : null

/**
 * Bounded, read-only access to one captured directory: no symbolic link is followed (the root, the
 * directories between the dump and the root, and every directory under it included), nothing
 * outside `root` is read, special files and files over SCAN_MAX_BYTES are reported, not read.
 *
 * Every access walks from the dump's real path one plain name at a time, each name looked up under
 * the handle of the directory opened before it (DIR_HANDLE) and opened without following a link, so
 * no path is resolved twice: a file is read, and a directory listed, through the directory that was
 * opened and checked. Every directory is pinned (device and inode) the first time it is seen; a
 * different one at its path later is reported. After each read or listing the path is walked again
 * and a file's name looked up once more — it must still be the file opened and read; a swap in
 * between is reported and what was read dropped. Every name looked up or listed is remembered: only
 * ENOENT on a name never seen is absence — a name seen and then gone is reported as changed — and
 * any other error looking a name up (EACCES, EIO…) is reported with its code, at the first walk and
 * at the walk after a read alike (one reason per state: `reasonOf`). `hooks.afterOpen(path)` runs after
 * each directory or file is opened, `hooks.beforeRecheck(path)` before the walk after a read or
 * listing (a test changes the capture there).
 */
export function captureReader(root, j6Dir, hooks = {}) {
  const inspection = { root: relative(j6Dir, root) || '.', filesRead: 0, bytesRead: 0, skipped: [] }
  const hops = relative(j6Dir, root).split(sep).filter(Boolean)
  const base = (() => {
    try {
      return realpathSync(j6Dir)
    } catch (e) {
      if (e.code !== 'ENOENT') inspection.skipped.push({ path: inspection.root, reason: `the dump directory could not be resolved (${e.code ?? e.message}); the capture is not read` })
      return null
    }
  })()
  const abs = (segs) => join(base, ...hops, ...segs)
  const relOf = (p) => relative(base, p)
  const skip = (p, reason) => {
    inspection.skipped.push({ path: relOf(p), reason })
    return null
  }
  const idOf = (st) => `${st.dev}:${st.ino}`
  const pinned = new Map() // absolute directory → its identity when first seen
  const seen = new Set() // absolute paths looked up and found, or listed: gone later is a change, not absence
  const CHANGED = 'changed while the capture was read; not read'
  /**
   * `name` under the directory handle `dir`, at absolute path `p` → { st } (found), { st: null }
   * (absent: ENOENT on a name never seen), { changed: true } (ENOENT on a name seen before), or
   * { error } — never an error taken for absence.
   */
  const lstatIn = (dir, name, p) => {
    try {
      const st = lstatSync(`${dir}/${name}`)
      seen.add(p)
      return { st }
    } catch (error) {
      if (error.code !== 'ENOENT') return { error }
      return seen.has(p) ? { changed: true } : { st: null }
    }
  }
  const unreadable = (p, error) => skip(p, `could not be inspected (${error.code ?? error.message}); not read`)
  // O_NOFOLLOW_ANY covers the last component too; macOS refuses it combined with O_NOFOLLOW (EINVAL).
  const NOFOLLOW = O_NOFOLLOW_ANY || (fsConstants.O_NOFOLLOW ?? 0)
  const FILE_FLAGS = fsConstants.O_RDONLY | NOFOLLOW | (fsConstants.O_NONBLOCK ?? 0)
  const DIR_FLAGS = fsConstants.O_RDONLY | NOFOLLOW | (fsConstants.O_DIRECTORY ?? 0)
  const openAt = (p, flags) => {
    try {
      return { fd: openSync(p, flags) }
    } catch (e) {
      return { error: e }
    }
  }
  const closeQuietly = (fd) => {
    try {
      closeSync(fd)
    } catch {}
  }
  /**
   * Open the directories hops + `segs`, each by name under the handle of the one before. Returns
   * { state: 'ok', fd, handle, at } (the caller closes fd), or { state: 'absent' | 'link' | 'notdir' |
   * 'changed' | 'unopened' | 'uninspected', at, depth, error }. Only ENOENT on the lookup is 'absent';
   * a directory seen and then not opened as one is 'changed'.
   */
  const openChain = (segs) => {
    const all = [...hops, ...segs]
    let { fd, error } = openAt(base, DIR_FLAGS)
    if (error) return { state: 'unopened', at: base, depth: -1, error }
    let st = fstatSync(fd)
    let handle = DIR_HANDLE(fd, st)
    let p = base
    for (let i = 0; i < all.length; i++) {
      p = join(p, all[i])
      const look = lstatIn(handle, all[i], p)
      const stop = (state, extra = {}) => (closeQuietly(fd), { state, at: p, depth: i, ...extra })
      if (look.error) return stop('uninspected', { error: look.error })
      if (look.changed) return stop('changed')
      const found = look.st
      if (!found) return stop('absent')
      if (found.isSymbolicLink()) return stop('link')
      if (!found.isDirectory()) return stop(pinned.has(p) ? 'changed' : 'notdir')
      const next = openAt(`${handle}/${all[i]}`, DIR_FLAGS)
      if (next.error) return stop(next.error.code === 'ELOOP' ? 'link' : next.error.code === 'ENOENT' || next.error.code === 'ENOTDIR' ? 'changed' : 'unopened', { error: next.error })
      closeQuietly(fd)
      fd = next.fd
      st = fstatSync(fd)
      if (!st.isDirectory() || idOf(st) !== idOf(found)) return stop('changed')
      const was = pinned.get(p)
      if (was === undefined) pinned.set(p, idOf(st))
      else if (was !== idOf(st)) return stop('changed')
      handle = DIR_HANDLE(fd, st)
      hooks.afterOpen?.(p)
    }
    return { state: 'ok', fd, handle, at: p }
  }
  /** The same walk, closed at once: 'ok' when every directory is still the pinned one. */
  const recheck = (segs) => {
    const c = openChain(segs)
    if (c.state === 'ok') closeQuietly(c.fd)
    return c
  }
  /**
   * The reason a chain that is not 'ok' is reported, or null when there is nothing to report: a
   * first walk that meets an absent name or a non-directory. On the walk after a read or listing
   * (`after`) the path was walked before, so absent or not a directory there is a change.
   */
  const reasonOf = (c, after = false) => {
    if (c.state === 'link')
      return c.depth === hops.length - 1 ? 'the template capture is a symbolic link; not followed' : c.depth < hops.length ? 'a directory on the way to the template capture is a symbolic link; not followed' : 'symbolic link; not followed'
    if (c.state === 'changed') return CHANGED
    if (c.state === 'unopened') return `could not be opened (${c.error?.code ?? c.error?.message}); not read`
    if (c.state === 'uninspected') return `could not be inspected (${c.error?.code ?? c.error?.message}); not read`
    return after ? CHANGED : null
  }
  /** A chain that is not 'ok' → null, reported when reasonOf gives a reason. */
  const refuse = (c, after = false) => {
    const reason = reasonOf(c, after)
    return reason ? skip(c.at, reason) : null
  }
  const rootOk = (() => {
    if (!base || !hops.length) return false
    if (!DIR_HANDLE) {
      skip(abs([]), `${process.platform} offers no handle to a directory already opened (/.vol or /proc/self/fd); the capture is not read`)
      return false
    }
    const c = recheck([])
    if (c.state !== 'ok') {
      refuse(c)
      return false
    }
    return true
  })()
  /** `rel` → its plain-name segments, or null (reported) when one is not a plain name. */
  const segsOf = (rel) => {
    const segs = String(rel).split('/').filter((x) => x !== '')
    if (!segs.every(plainName)) {
      inspection.skipped.push({ path: `${inspection.root}/${rel}`, reason: 'not plain names under the template capture; not read' })
      return null
    }
    return segs
  }
  /**
   * After a read or listing through `segs`: null when the path still walks to the pinned directories
   * and, for a file read (`file` = { name, id }), its name there still is the file that was opened and
   * read; else reported (true).
   */
  const swappedSince = (segs, p, file) => {
    hooks.beforeRecheck?.(p)
    const after = openChain(segs)
    if (after.state !== 'ok') return (refuse(after, true), true)
    try {
      if (!file) return null
      const now = lstatIn(after.handle, file.name, p)
      if (now.error) return (unreadable(p, now.error), true)
      return now.st && now.st.isFile() && idOf(now.st) === file.id ? null : (skip(p, CHANGED), true)
    } finally {
      closeQuietly(after.fd)
    }
  }
  const cache = new Map()
  const readOnce = (rel) => {
    if (!rootOk) return null
    const segs = segsOf(rel)
    if (!segs?.length) return null
    const dirs = segs.slice(0, -1)
    const name = segs[segs.length - 1]
    const c = openChain(dirs)
    if (c.state !== 'ok') return refuse(c)
    const p = abs(segs)
    try {
      const look = lstatIn(c.handle, name, p)
      if (look.error) return unreadable(p, look.error)
      if (look.changed) return skip(p, CHANGED)
      const st = look.st
      if (!st) return null
      if (st.isSymbolicLink()) return skip(p, 'symbolic link; not followed')
      if (!st.isFile()) return skip(p, 'not a regular file; not read')
      if (st.size > SCAN_MAX_BYTES) return skip(p, `larger than ${SCAN_MAX_BYTES} bytes; not read`)
      // Opened under the directory handle, without following a link or blocking on a pipe; it must
      // be the regular file checked above.
      const { fd, error } = openAt(`${c.handle}/${name}`, FILE_FLAGS)
      if (error) return skip(p, error.code === 'ELOOP' ? 'symbolic link; not followed' : error.code === 'ENOENT' || error.code === 'ENOTDIR' ? CHANGED : `could not be opened (${error.code ?? error.message}); not read`)
      let text
      let sha256
      let n = 0
      try {
        hooks.afterOpen?.(p)
        const now = fstatSync(fd)
        if (!now.isFile() || idOf(now) !== idOf(st)) return skip(p, CHANGED)
        const buf = Buffer.alloc(SCAN_MAX_BYTES + 1)
        for (let got; n < buf.length && (got = readSync(fd, buf, n, buf.length - n, null)) > 0; ) n += got
        if (n > SCAN_MAX_BYTES) return skip(p, `larger than ${SCAN_MAX_BYTES} bytes; not read`)
        text = buf.toString('utf8', 0, n)
        sha256 = createHash('sha256').update(buf.subarray(0, n)).digest('hex')
      } finally {
        closeQuietly(fd)
      }
      if (swappedSince(dirs, p, { name, id: idOf(st) })) return null
      inspection.filesRead++
      inspection.bytesRead += n
      return { text, sha256, path: relOf(p) }
    } finally {
      closeQuietly(c.fd)
    }
  }
  const statRel = (rel) => {
    if (!rootOk) return null
    const segs = segsOf(rel)
    if (!segs) return null
    const c = openChain(segs.slice(0, -1))
    if (c.state !== 'ok') return refuse(c)
    try {
      if (!segs.length) return fstatSync(c.fd)
      const look = lstatIn(c.handle, segs[segs.length - 1], abs(segs))
      return look.error ? unreadable(abs(segs), look.error) : look.changed ? skip(abs(segs), CHANGED) : look.st
    } finally {
      closeQuietly(c.fd)
    }
  }
  /**
   * The entries of directory `segs` (sorted), listed through the handle of the directory opened and
   * checked — never through its path — and dropped, reported, when the path no longer walks to it.
   */
  const listDirState = (segs) => {
    const c = openChain(segs)
    if (c.state !== 'ok') {
      const reason = reasonOf(c)
      if (reason) return (skip(c.at, reason), { error: `${relOf(c.at)}: ${reason}` })
      return c.state === 'notdir' ? { notdir: true } : { absent: true }
    }
    let names
    try {
      names = readdirSync(c.handle, { withFileTypes: true })
    } catch (e) {
      const reason = `could not be listed (${e.code ?? e.message}); not read`
      return (skip(c.at, reason), { error: `${relOf(c.at)}: ${reason}` })
    } finally {
      closeQuietly(c.fd)
    }
    if (swappedSince(segs, c.at)) {
      const last = inspection.skipped.at(-1)
      return { error: `${last.path}: ${last.reason}` }
    }
    for (const d of names) seen.add(join(c.at, d.name))
    return { names: names.sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0)) }
  }
  const listDir = (segs) => listDirState(segs).names ?? []
  return {
    ok: rootOk,
    j6Dir,
    inspection,
    /** `rel` under root → { text, path } | null (absent: null, unreadable: null + a skipped entry). Read once. */
    read(rel) {
      if (!cache.has(rel)) cache.set(rel, readOnce(rel))
      return cache.get(rel)
    },
    exists(rel) {
      const st = statRel(rel)
      return Boolean(st && !st.isSymbolicLink() && (st.isFile() || st.isDirectory()))
    },
    isDir(rel) {
      const st = statRel(rel)
      return Boolean(st && st.isDirectory() && !st.isSymbolicLink())
    },
    /** The entries directly under `rel`: { name, dir } for directories and regular files; links and special files reported, not listed. */
    entries(rel) {
      if (!rootOk) return []
      const segs = segsOf(rel)
      if (!segs) return []
      const p = abs(segs)
      const out = []
      for (const d of listDir(segs)) {
        if (d.isSymbolicLink()) skip(join(p, d.name), 'symbolic link; not followed')
        else if (d.isDirectory() || d.isFile()) out.push({ name: d.name, dir: d.isDirectory() })
        else skip(join(p, d.name), 'not a regular file; not read')
      }
      return out
    },
    /**
     * The directory `rel`, telling absence from refusal: `{ state: 'listed', entries: [{ name, dir }],
     * refused: [{ name, reason }] }` (a link or special file in it is refused, reported, not listed),
     * `{ state: 'absent' }`, or `{ state: 'refused', reason }` (a link, not a directory, not openable
     * or listable, changed while listed — reported).
     */
    listing(rel) {
      if (!rootOk) {
        const s = inspection.skipped[0]
        return s ? { state: 'refused', reason: `${s.path}: ${s.reason}` } : { state: 'absent' }
      }
      const segs = segsOf(rel)
      if (!segs) return { state: 'refused', reason: `${inspection.root}/${rel}: not plain names under the template capture; not read` }
      const p = abs(segs)
      const r = listDirState(segs)
      if (r.absent) return { state: 'absent' }
      if (r.notdir) return (skip(p, 'not a directory; not read'), { state: 'refused', reason: `${relOf(p)}: not a directory; not read` })
      if (!r.names) return { state: 'refused', reason: r.error }
      const entries = []
      const refused = []
      for (const d of r.names) {
        const reason = d.isSymbolicLink() ? 'symbolic link; not followed' : d.isDirectory() || d.isFile() ? null : 'not a regular file; not read'
        if (reason) (skip(join(p, d.name), reason), refused.push({ name: d.name, reason }))
        else entries.push({ name: d.name, dir: d.isDirectory() })
      }
      return { state: 'listed', entries, refused }
    },
    /** Regular files under `rel` (relative to root), symbolic links not followed, at most SCAN_MAX_FILES; the walk stops at the limit. */
    list(rel = '') {
      const out = []
      if (!rootOk) return out
      const start = segsOf(rel)
      if (!start) return out
      let full = false
      const walk = (segs) => {
        for (const d of listDir(segs)) {
          if (full) return
          const r = [...segs, d.name]
          const at = abs(r)
          if (d.isSymbolicLink()) skip(at, 'symbolic link; not followed')
          else if (d.isDirectory()) walk(r)
          else if (d.isFile()) {
            if (out.length >= SCAN_MAX_FILES) {
              skip(at, `more than ${SCAN_MAX_FILES} files; the rest is not inspected`)
              full = true
              return
            }
            out.push(r.join('/'))
          } else skip(at, 'not a regular file; not read')
        }
      }
      walk(start)
      return out
    }
  }
}

/** `{loadposition x}` positions an article body loads (html-to-blocks turns them into slots). */
const loadPositions = (html) => [...String(html ?? '').matchAll(/\{loadposition\s+([^\s}]+)[^}]*\}/g)].map((m) => m[1])
/** `{loadmodule …}` / `{loadmoduleid N}` markers: the adapter leaves them as text. */
const loadModuleMarkers = (html) => [...String(html ?? '').matchAll(/\{loadmodule(id)?\s+([^}]*)\}/g)].map((m) => ({ byId: Boolean(m[1]), arg: m[2].trim(), text: m[0] }))
/** The ACM config keys normaliseAcm reads: `field[x]` or `group[g][field]`; anything else is not read. */
const ACM_READ_KEY = /^([^[\]]+)\[([^[\]]+)\](?:\[([^[\]]+)\])?$/
const numericCompare = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true })
const byRowId = (a, b) => numericCompare(a.id, b.id)

/**
 * What the source draws on a route, read once from the captured template: the positions of the route's layout, its blocks and
 * sub-layout, the mega menu, template overrides and `{loadposition}` in the article. Composition (where a module is placed) and
 * the coverage report (what the source draws) both ask this one resolver, per (menu item, route).
 * `c`: { j6Dir, inv, tpl, defaultLayout, arts, bodyDrawn, layoutIncomplete, layoutCauses }.
 */
function routeDrawing(c) {
  const { j6Dir, inv, tpl, defaultLayout, arts, layoutCauses } = c
  const reader = tpl.reader
  const artById = new Map(arts.map((a) => [a.id, a]))
  const itemById = menuIndex(inv)
  const styleById = new Map(inv.template_styles.map((s) => [String(s.id), s]))
  const homeStyle = inv.template_styles.find((s) => String(s.client_id) === '0' && String(s.home) === '1') ?? null
  const styleOf = (item) => styleById.get(String(item?.templateStyleId ?? '0')) ?? homeStyle
  const layoutRel = (name) => `etc/layout/${name}.json`
  const layoutCache = new Map()
  const layoutInfo = (name) => {
    if (layoutCache.has(name)) return layoutCache.get(name)
    let info = { name, exists: false, cells: [], path: relative(j6Dir, join(tpl.dir, layoutRel(String(name)))) }
    if (plainName(name)) {
      const f = reader.read(layoutRel(name))
      if (f) {
        let json
        try {
          json = JSON.parse(f.text)
        } catch (e) {
          throw new Error(`${join(j6Dir, f.path)}: ${e.message}`)
        }
        const rows = json?.layout?.sections
        const cells = []
        ;(Array.isArray(rows) ? rows : []).forEach((row, r) =>
          (Array.isArray(row?.contents) ? row.contents : []).forEach((cell, i) =>
            cells.push({
              row: row?.name ?? String(r),
              index: i,
              type: String(cell?.type ?? ''),
              name: cell?.name ?? null,
              block: cell?.block || cell?.name || null,
              mainbody: false,
              positions: cell?.type === 'positions' ? String(cell.positions ?? '').split(/[,\s]+/).filter(Boolean) : []
            })
          )
        )
        info = { ...info, exists: true, path: f.path, cells, shapeProblem: Array.isArray(rows) ? (rows.length ? null : 'an empty layout.sections list') : 'no layout.sections list' }
      } else {
        // A T3 layout: etc/layout/<name>.ini drawn by tpls/<name>.php (joomla-layout.mjs).
        const t3 = t3Layout(tpl, name)
        if (t3)
          info = {
            ...info,
            exists: true,
            path: t3.ini,
            t3: true,
            gaps: t3.gaps,
            undrawn: t3.undrawn,
            cells: t3.order.map((o, i) => ({ row: String(i), index: 0, type: o.kind === 'component' ? 'component' : 'positions', name: o.name ?? null, block: null, mainbody: o.block === 'mainbody', positions: o.kind === 'position' ? [o.name] : [], sidebars: o.kind === 'component' ? (o.sidebars ?? []) : [] })),
            shapeProblem: null
          }
      }
    }
    layoutCache.set(name, info)
    return info
  }
  const blockCache = new Map()
  const blockInfo = (name) => {
    if (blockCache.has(name)) return blockCache.get(name)
    const rel = `html/layouts/t4/block/${name}.html`
    const f = plainName(name) ? reader.read(rel) : null
    const info = { name, path: relative(j6Dir, join(tpl.dir, rel)), exists: Boolean(f), positions: [], elements: [], other: [] }
    if (f) {
      for (const m of f.text.matchAll(/<jdoc:include\b([^>]*)>/g)) {
        const type = m[1].match(/\btype="([^"]*)"/)?.[1] ?? ''
        const nm = m[1].match(/\bname="([^"]*)"/)?.[1] ?? ''
        if (type === 'modules' && nm) info.positions.push(nm)
        else if (type === 'element' && nm) info.elements.push(nm)
        else info.other.push(type || '(untyped)')
      }
    }
    blockCache.set(name, info)
    return info
  }
  /** position → how the layout draws it: `layout <name>` or `block <name>`. */
  const layoutPositions = (L, skipBody = false) => {
    const at = new Map()
    for (const cell of L.cells) {
      if (skipBody && cell.mainbody) continue
      // T3 draws the sidebars with the component: a route that prints no body prints no sidebar.
      if (cell.type === 'component' && !skipBody) for (const p of cell.sidebars ?? []) if (!at.has(p)) at.set(p, `layout ${L.name} sidebar`)
      if (cell.type === 'positions') for (const p of cell.positions) if (!at.has(p)) at.set(p, `layout ${L.name}`)
      if (cell.type === 'block' && cell.block) for (const p of blockInfo(cell.block).positions) if (!at.has(p)) at.set(p, `block ${cell.block}`)
    }
    return at
  }
  const subLayoutOf = (style) => {
    const v = parseJsonColumn(style?.params)['sub-layout']
    return typeof v === 'string' && v.trim() ? v.trim() : null
  }
  // Template overrides (html/**.php) that draw a position themselves — `{loadposition x}` or a
  // `<jdoc:include type="modules">` — and the routes each applies to (null: not traced).
  const overrides = [] // { file, path, positions, applies: (e) => boolean | null }
  const stemOf = (v) => String(v ?? '').split(':').pop() || 'default'
  for (const f of reader.isDir('html') ? reader.list('html').filter((x) => x.endsWith('.php')) : []) {
    const file = reader.read(f)
    if (!file) continue
    const positions = [...new Set([...loadPositions(file.text), ...[...file.text.matchAll(/<jdoc:include\b[^>]*\btype="modules"[^>]*\bname="([^"]+)"/g)].map((m) => m[1])])]
    if (!positions.length) continue
    const m = f.match(/^html\/com_content\/(article|category|featured)\/([^/_]+)(?:_[^/]*)?\.php$/)
    const applies = m
      ? (e) =>
          e.option === 'com_content' &&
          e.view === m[1] &&
          (m[1] === 'article' ? stemOf(artById.get(e.articleId)?.layout ?? e.linkLayout) : stemOf(e.linkLayout)) === m[2]
      : null
    overrides.push({ file: f, path: file.path, positions, applies })
  }
  // The T4 mega menu (etc/navigation/<name>.json mega_settings): the positions and module ids its
  // columns draw, wherever a block draws the `megamenu` element.
  const megaCache = new Map()
  const megaOf = (name) => {
    if (megaCache.has(name)) return megaCache.get(name)
    const rel = `etc/navigation/${name}.json`
    const file = plainName(name) ? reader.read(rel) : null
    let info = { name, path: relative(j6Dir, join(tpl.dir, rel)), exists: false, positions: [], modules: [], columns: 0 }
    if (file) {
      let settings
      try {
        const nav = JSON.parse(file.text)
        settings = typeof nav?.mega_settings === 'string' ? JSON.parse(nav.mega_settings || '{}') : (nav?.mega_settings ?? {})
      } catch (e) {
        throw new Error(`${join(j6Dir, file.path)}: ${e.message}`)
      }
      const cells = []
      JSON.stringify(settings, (k, v) => {
        if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.type === 'string') cells.push(v)
        return v
      })
      info = {
        ...info,
        path: file.path,
        exists: true,
        columns: cells.length,
        positions: [...new Set(cells.filter((x) => x.type === 'position' && x.position).map((x) => String(x.position)))],
        modules: [...new Set(cells.filter((x) => x.type === 'module' && x.module_id != null).map((x) => String(x.module_id)))]
      }
    }
    megaCache.set(name, info)
    return info
  }
  /**
   * What the source draws on a route: known (its layout is captured), position → via, module id →
   * via (the mega menu draws modules by id), and positions an untraced override may draw.
   */
  const drawnCache = new Map()
  const drawnOn = (e) => {
    const key = `${e.menuId} ${e.joomlaPath}`
    if (drawnCache.has(key)) return drawnCache.get(key)
    const item = itemById.get(String(e.menuId))
    const L = layoutInfo(e.layout ?? defaultLayout)
    // A route whose page never draws the component body (skipped, or a layout with no component row) draws no mainbody position, sub-layout, body {loadposition} or component-dependent override either; outer chrome stays.
    const skipBody = !c.bodyDrawn(e)
    // The sidebars the layout's own mainbody names, on a route that prints no body: proven undrawn only when the whole layout was read (nothing unread can draw the position); otherwise the position stays unknown.
    const bodySidebars = new Set(skipBody && L.exists && !c.layoutIncomplete(e.layout) ? L.cells.flatMap((x) => (x.type === 'component' ? (x.sidebars ?? []) : [])) : [])
    const out = { bodySidebars, known: L.exists, layout: L.name, incomplete: L.exists && c.layoutIncomplete(e.layout), positions: L.exists ? layoutPositions(L, skipBody) : new Map(), moduleIds: new Map(), unknownPositions: new Map(), subLayout: null, mega: null }
    const style = styleOf(item)
    const sub = subLayoutOf(style)
    // T4 draws a style's sub-layout on the article views of the menu items that use the style.
    if (L.exists && !skipBody && sub && e.option === 'com_content' && e.view === 'article') {
      const S = layoutInfo(sub)
      out.subLayout = sub
      if (c.layoutIncomplete(sub)) out.incomplete = true
      if (S.exists) for (const [p] of layoutPositions(S)) if (!out.positions.has(p)) out.positions.set(p, `sub-layout ${sub}`)
    }
    const art = e.articleId ? artById.get(e.articleId) : null
    if (art && !skipBody) for (const p of loadPositions(art.introtext + art.fulltext)) if (!out.positions.has(p)) out.positions.set(p, 'loadposition')
    for (const o of overrides)
      for (const p of o.positions) {
        if (out.positions.has(p)) continue
        if (!o.applies) out.unknownPositions.set(p, o.path)
        else if (!skipBody && o.applies(e)) out.positions.set(p, `override ${o.file}`)
      }
    // A block whose markup is not captured may draw any position: what it draws is unknown.
    if (L.exists) for (const x of L.cells) if (x.type === 'block' && x.block && !blockInfo(x.block).exists) out.blindBlocks = [...(out.blindBlocks ?? []), `block markup ${blockInfo(x.block).path}`]
    const drawsMega = L.exists && L.cells.some((x) => x.type === 'block' && x.block && blockInfo(x.block).elements.includes('megamenu'))
    if (drawsMega) {
      const nav = parseJsonColumn(style?.params)['typelist-navigation'] || 'default'
      const mega = megaOf(nav)
      out.mega = mega
      // A mega menu that could not be read may draw any module: what it draws is unknown.
      if (!mega.exists) out.blindMega = `${mega.path} (mega menu)`
      for (const p of mega.positions) if (!out.positions.has(p)) out.positions.set(p, `megamenu ${nav}`)
      for (const id of mega.modules) out.moduleIds.set(id, `megamenu ${nav}`)
    }
    drawnCache.set(key, out)
    return out
  }

  /**
   * Whether the source draws module `m` on route `e`: 'drawn' (with how), 'unknown' (what was not read may draw it, with why),
   * or 'undrawn' (the route's evidence was read in full and does not draw it).
   */
  const placement = (e, m, loaded = new Set()) => {
    const d = drawnOn(e)
    const mid = String(m.id)
    if (!d.known) return { state: 'unknown', via: [`layout ${d.layout} not captured`], why: `layout "${d.layout}" is not captured` }
    if (m.position && d.positions.has(m.position)) return { state: 'drawn', via: d.positions.get(m.position) }
    if (d.moduleIds.has(mid)) return { state: 'drawn', via: d.moduleIds.get(mid), byId: true }
    if (m.position && d.bodySidebars.has(m.position)) return { state: 'undrawn', via: null }
    // The article body draws a module it loads by id (loaded: the ids its resolved {loadmoduleid} markers named on this route).
    if (loaded.has(mid)) return { state: 'drawn', via: 'loadmoduleid', byId: true }
    if (m.position && d.unknownPositions.has(m.position)) {
      const via = `template override ${d.unknownPositions.get(m.position)}, whose routes are not traced`
      return { state: 'unknown', via: [via], why: via }
    }
    if (d.blindMega || (m.position && d.blindBlocks?.length)) {
      const via = [...(m.position ? (d.blindBlocks ?? []) : []), ...(d.blindMega ? [d.blindMega] : [])].map((b) => `${b} not captured or not inspected`)
      return { state: 'unknown', via, why: d.incomplete ? `layout "${d.layout}" was read only partly (${via.join(', ')})` : via.join(', ') }
    }
    // The layout was read only partly: a position it is not seen to draw may still be drawn by what was not read.
    if (d.incomplete) return { state: 'unknown', via: [`layout ${d.layout} read incompletely`], why: `layout "${d.layout}" was read only partly (${layoutCauses(e.layout).positionCauses.slice(0, 2).join('; ') || 'see its coverage row'})` }
    return { state: 'undrawn', via: null }
  }
  return { drawnOn, placement, layoutInfo, layoutPositions, blockInfo, subLayoutOf, megaCache }
}

/**
 * The census behind adapter-coverage.json. `c` is the state buildSpecPack already holds; nothing
 * here writes, and nothing but the template capture (read-only, bounded) is read.
 */
function adapterCoverage(c) {
  const { j6Dir, inv, routes, entries, tpl, defaultLayout, arts, cats, posts, wpPages, archives, pageMapPages, menus, acm, modulePages, drawnOn, placement, layoutInfo, layoutPositions, blockInfo, subLayoutOf, megaCache } = c
  const items = new Map()
  const add = (kind, id, status, fields) => {
    if (!COVERAGE_KINDS.includes(kind)) throw new Error(`adapter coverage: unknown kind ${kind}`)
    if (!COVERAGE_STATUSES.includes(status)) throw new Error(`adapter coverage: ${id}: unknown status ${status}`)
    if (status !== 'mapped' && !fields.reason) throw new Error(`adapter coverage: ${id} is ${status} without a reason`)
    if (items.has(id)) throw new Error(`adapter coverage: two source entities share the identity ${id}`)
    const item = { id, kind, status, critical: Boolean(fields.critical), title: fields.title ?? null, source: fields.source, target: fields.target ?? [], impact: fields.impact ?? { routes: [] }, reason: fields.reason ?? null }
    if (fields.notes?.length) item.notes = fields.notes
    if (fields.detail) item.detail = fields.detail
    items.set(id, item)
    return item
  }
  const noteLike = (prefix) => c.notes.filter((n) => n.startsWith(prefix))
  const reader = tpl.reader
  const limitations = []
  if (!reader.ok) limitations.push(`template capture ${relative(j6Dir, tpl.dir)} is absent or not a directory: layouts, blocks, ACM types and animation usage are not inspected`)
  for (const t of c.missingTables.filter((x) => x !== 'extensions')) limitations.push(`inventory.json has no "${t}" table: its rows are not counted (the adapter reads it as empty)`)
  // A layout read only partly (T3 without its template PHP or read with gaps, T4 with a malformed sections list or a cell the reader does not follow) does not prove the page prints no body: it is taken as drawn, and said so.
  const usedLayouts = [...new Set(entries.filter((e) => e.kind !== 'gap').map((e) => String(e.layout ?? defaultLayout)))].sort()
  for (const name of usedLayouts) {
    const u = c.layoutCauses(name)
    if (!u.known || (!u.bodyCauses.length && !u.positionCauses.length)) continue
    const what = [...new Set([...u.bodyCauses, ...u.positionCauses])].slice(0, 4).join('; ')
    const effects = [
      u.bodyCauses.length ? 'whether its page draws the article body is not known, so the body, its {loadposition}/{loadmoduleid} loads and body-dependent positions are taken as drawn there' : '',
      u.positionCauses.length ? 'a position it is not seen to draw is unknown, not undrawn' : ''
    ].filter(Boolean)
    limitations.push(`layout "${name}" is captured but not read completely (${what}): ${effects.join('; ')}`)
  }

  const artById = new Map(arts.map((a) => [a.id, a]))
  const catById = new Map(cats.map((x) => [x.id, x]))
  const itemById = menuIndex(inv)
  const styleById = new Map(inv.template_styles.map((s) => [String(s.id), s]))
  const homeStyle = inv.template_styles.find((s) => String(s.client_id) === '0' && String(s.home) === '1') ?? null
  const styleOf = (item) => styleById.get(String(item?.templateStyleId ?? '0')) ?? homeStyle
  const pmByRoute = new Map(pageMapPages.filter((p) => p.source?.menuId != null && !p.synthetic).map((p) => [`${p.source.menuId} ${p.source.joomlaPath}`, p]))
  const pathOfFile = new Map(pageMapPages.map((p) => [p.file, p.source?.joomlaPath ?? p.path]))
  const routed = entries.filter((e) => itemById.has(String(e.menuId)))
  const routesOfArticle = (id) => entries.filter((e) => e.articleId === id).map((e) => e.joomlaPath)
  // A route is a (menu item, path) pair: two menu items may share a pathname while one draws the article body and the other does not.
  const routeKey = (e) => `${e.menuId} ${e.joomlaPath}`
  // Routes whose page draws the article body: a skipped route (skip_component_content, no component row) prints nothing of it.
  // Decided per route by the composition's own rule (c.bodyDrawn); paths are projected only after the filter.
  const drawnEntriesOfArticle = (id) => entries.filter((e) => e.articleId === id && c.bodyDrawn(e))
  const drawnRoutesOfArticle = (id) => [...new Set(drawnEntriesOfArticle(id).map((e) => e.joomlaPath))]
  // What each {loadmoduleid} of an article became: on a route that draws its body, or in a post body (no route).
  const loadResolved = (articleId, moduleId) => c.moduleLoadLog.some((x) => x.article === articleId && x.module === moduleId && x.kind !== 'unresolved')
  const loadResolvedOn = (articleId, moduleId) => [...new Set(c.moduleLoadLog.filter((x) => x.article === articleId && x.module === moduleId && x.kind !== 'unresolved').map((x) => (x.via === 'route' ? x.path : 'post body')))].sort()
  // A page-map file → the route key it was composed for, so module placement is decided per route, not per pathname.
  const keyOfFile = new Map([...pmByRoute].map(([k, p]) => [p.file, k]))

  // ── routes ────────────────────────────────────────────────────────────────
  for (const e of entries) {
    const id = `route:${e.menuId}:${e.joomlaPath}`
    const source = { table: 'render-routes.json', menuId: e.menuId, path: e.joomlaPath, option: e.option ?? null, view: e.view ?? null, targetId: e.targetId ?? null }
    const impact = { routes: [e.joomlaPath] }
    if (e.kind === 'gap') {
      add('route', id, 'unsupported', {
        title: e.title ?? null,
        critical: true,
        source,
        target: [`page-map.json#gaps[joomlaPath=${e.joomlaPath}]`, `redirects.json#rules[from=${e.joomlaPath}]`],
        impact,
        reason: `${e.reason}: the route's content is not emitted; the path redirects 301 to ${e.redirectTo}`
      })
      continue
    }
    const pm = pmByRoute.get(`${e.menuId} ${e.joomlaPath}`)
    const target = pm ? [`page-map.json#pages/${pm.file}`] : []
    const page = wpPages.find((p) => p.file === pm?.file && p.joomlaPath === e.joomlaPath)
    const archive = archives.find((a) => a.file === pm?.file)
    if (page) target.push(`content.json#pages/${page.file}`)
    if (archive) target.push(`content.json#archives/${archive.file}`)
    if (pm?.view === 'single') target.push(`content.json#posts[path=${posts.find((p) => p.joomla.articleId === e.articleId)?.path ?? '?'}]`)
    const reasons = []
    let status = 'mapped'
    let critical = false
    if (e.articleId && !artById.has(e.articleId)) {
      status = 'unsupported'
      critical = true
      reasons.push(`menu item ${e.menuId} opens article #${e.articleId}, which the inventory does not hold: the page has no body`)
    }
    if (e.categoryId && !catById.has(e.categoryId)) {
      if (status === 'mapped') status = 'partial'
      reasons.push(`menu item ${e.menuId} opens category #${e.categoryId}, which is not an exported com_content category`)
    }
    if (!layoutInfo(e.layout ?? defaultLayout).exists) {
      if (status === 'mapped') status = 'partial'
      reasons.push(`layout "${e.layout ?? defaultLayout}" is not in the capture (${layoutInfo(e.layout ?? defaultLayout).path}): the page is composed as a lone component, its module positions unknown`)
    }
    for (const n of (page?.notes ?? []).filter((x) => x.startsWith('contact details:'))) {
      if (status === 'mapped') status = 'partial'
      reasons.push(n)
    }
    if (page?.featured) {
      if (status === 'mapped') status = 'partial'
      reasons.push(`the featured list (${page.featured.count} article(s)) is declared in content.json pages[].featured; drawing it is the seeder's and the theme's part, which the adapter does not verify${page.featured.order === undefined ? '; its order is not declared' : ''}`)
    }
    add('route', id, status, {
      title: e.title ?? null,
      critical,
      source: { ...source, layout: e.layout ?? defaultLayout, ...(e.renamed ? { renamedTo: e.wpPath } : {}), ...(e.httpStatus ? { answers: e.httpStatus } : {}) },
      target: [...target, ...(e.joomlaPath !== e.wpPath ? [`redirects.json#rules[from=${e.joomlaPath}]`] : [])],
      impact,
      reason: reasons.join('; ') || null
    })
  }

  // ── menu items ────────────────────────────────────────────────────────────
  const menuFlat = new Map()
  const flatten = (menutype, list) => {
    for (const it of list) {
      menuFlat.set(it.id, { menutype, ...it })
      flatten(menutype, it.children ?? [])
    }
  }
  for (const m of menus) flatten(m.menutype, m.items)
  for (const row of [...inv.menu].sort(byRowId)) {
    const mid = String(row.id)
    const id = `menu-item:${mid}`
    const source = { table: '#__menu', id: mid, menutype: row.menutype ?? '', type: row.type ?? '', link: row.link ?? '', published: row.published ?? null, clientId: row.client_id ?? null }
    const title = row.title ?? null
    const impact = { routes: entries.filter((e) => e.menuId === mid).map((e) => e.joomlaPath) }
    if (Number(row.client_id) !== 0) {
      add('menu-item', id, 'skipped-by-rule', { title, source, impact, reason: 'administrator menu item (client_id 1): not site navigation, not exported' })
      continue
    }
    const mi = menuFlat.get(mid)
    if (!row.menutype || !mi) {
      add('menu-item', id, 'skipped-by-rule', { title, source, impact, reason: mid === '1' || !row.menutype ? 'the menu tree root (no menu type): Joomla never prints it' : 'not in any site menu type' })
      continue
    }
    const target = [`menus.json#${mi.menutype}/${mid}`]
    if (Number(row.published) !== 1) {
      add('menu-item', id, 'skipped-by-rule', { title, source, target, impact, reason: `not published (published ${row.published}): kept in menus.json with published: false, which no navigation draws` })
      continue
    }
    const bad = brokenJson(row.params)
    if (bad) {
      add('menu-item', id, 'unsupported', { title, source, target, impact, reason: 'params column is not valid JSON; the adapter read it as {} (alias target, display options lost)' })
      continue
    }
    const gap = entries.find((e) => e.kind === 'gap' && e.menuId === mid)
    if (gap) add('menu-item', id, 'partial', { title, source, target: [...target, mi.url ?? '(no url)'], impact, reason: `opens ${gap.joomlaPath}, a route with no WordPress equivalent: its url is the 301 target ${gap.redirectTo}` })
    else if (mi.url) add('menu-item', id, 'mapped', { title, source, target: [...target, mi.url], impact, ...(mi.menuShow === false ? { detail: { remarks: ['menu_show 0: not printed in navigation (menus.json published false); the route still answers'] } } : {}) })
    else if (['heading', 'separator'].includes(mi.type)) add('menu-item', id, 'mapped', { title, source, target, impact, detail: { url: null, why: `a ${mi.type} carries no link` } })
    else if (mi.type === 'alias')
      add('menu-item', id, 'partial', { title, source, target, impact, reason: `alias of menu item ${mi.aliasOf || '?'}, which no render route renders: its url is null in menus.json` })
    else add('menu-item', id, 'partial', { title, source, target, impact, reason: `links ${row.link || '(no link)'}, which no render route captured: its url is null in menus.json` })
  }

  // ── categories ────────────────────────────────────────────────────────────
  for (const row of [...inv.categories].sort(byRowId)) {
    const cid = String(row.id)
    const id = `category:${cid}`
    const source = { table: '#__categories', id: cid, extension: row.extension ?? null, path: row.path ?? null, published: row.published ?? null }
    const title = row.title ?? null
    const impact = { routes: entries.filter((e) => e.categoryId === cid).map((e) => e.joomlaPath) }
    if (row.extension !== 'com_content') add('category', id, 'skipped-by-rule', { title, source, impact, reason: `a ${row.extension ?? 'system'} category, not com_content: not content of the site` })
    else if (cid === '1') add('category', id, 'skipped-by-rule', { title, source, impact, reason: 'the category tree root' })
    else if (String(row.published) === '-2') add('category', id, 'skipped-by-rule', { title, source, impact, reason: 'trashed (published -2): Joomla serves no trashed category or its articles' })
    else if (catById.has(cid)) add('category', id, 'mapped', { title, source, target: [`content.json#categories/${catById.get(cid).wpSlug}`], impact })
    else add('category', id, 'unsupported', { title, source, impact, critical: true, reason: 'a live com_content category the adapter did not export' })
  }

  // ── articles and the content portions they lose ─────────────────────────────
  const pagesOfArticle = (aid) => wpPages.filter((p) => p.joomla?.articleId === aid)
  const postOfArticle = new Map(posts.map((p) => [p.joomla.articleId, p]))
  const moduleLoads = [] // { where, marker }
  for (const row of [...inv.content].sort(byRowId)) {
    const a = artById.get(String(row.id))
    const id = `article:${a.id}`
    const source = { table: '#__content', id: a.id, catid: a.catid, state: row.state ?? null, alias: a.alias }
    const impact = { routes: routesOfArticle(a.id) }
    const title = a.title
    if (a.status === 'trash') {
      add('article', id, 'skipped-by-rule', { title, source, impact, reason: 'trashed (state -2): Joomla serves no trashed article' })
      continue
    }
    const trashedCat = c.trashedCats.get(a.catid)
    if (trashedCat && !c.isPageArticle(a)) {
      add('article', id, 'skipped-by-rule', { title, source, impact, reason: `its category #${trashedCat.id} is trashed: Joomla does not serve it, so it is not a post`, notes: noteLike(`article #${a.id} (`) })
      continue
    }
    const pages = pagesOfArticle(a.id)
    const post = postOfArticle.get(a.id)
    const target = [...pages.map((p) => `content.json#pages/${p.file}`), ...(post ? [`content.json#posts[path=${post.path}]`] : [])]
    if (!target.length) {
      add('article', id, 'unsupported', {
        title,
        source,
        impact,
        critical: true,
        reason: c.isPageArticle(a)
          ? `in a page category (${catById.get(a.catid)?.title ?? a.catid}) that no render route opens: it is emitted neither as a page nor as a post`
          : 'emitted neither as a page nor as a post'
      })
      continue
    }
    const reasons = []
    const unplaced = [...(c.unplacedByArticle.get(a.id) ?? [])]
    if (unplaced.length) reasons.push(`extra fields drawn in no body: ${unplaced.join(', ')} (see content:field:*)`)
    for (const p of pages.filter((p) => p.droppedContent))
      reasons.push(`its body is not in ${p.file}: layout "${pageMapPages.find((x) => x.file === p.file)?.layout ?? '?'}" of the route has no component row (see content:body:${a.id}@${p.file})`)
    const loads = loadModuleMarkers(a.introtext + a.fulltext)
    // An article with no route that draws its body (unrouted, or only skipped routes) loads nothing.
    if (drawnRoutesOfArticle(a.id).length) for (const l of loads) moduleLoads.push({ where: id, marker: l })
    // {loadmoduleid N} the pages resolved (an inlined module, a slot at its position, or a marker Joomla prints nothing for)
    // are placed; any other marker is text on the page — and a by-id one is a critical loss, the page prints it.
    const resolvedHere = (l) => l.byId && loadResolved(a.id, l.arg)
    const leftLoads = loads.filter((l) => !resolvedHere(l))
    const doneLoads = loads.filter(resolvedHere)
    if (leftLoads.length) reasons.push(`body holds ${leftLoads.map((l) => l.text).join(', ')}: the adapter leaves {loadmodule} markers as text`)
    const leftByIdCritical = leftLoads.some((l) => l.byId)
    if (brokenJson(row.attribs)) reasons.push('attribs column is not valid JSON: its layout and extra fields were read as none')
    if (brokenJson(row.images)) reasons.push('images column is not valid JSON: intro and full images were read as none')
    if (!catById.has(a.catid) && !trashedCat) reasons.push(`category #${a.catid} is not an exported category: the post has no category`)
    add('article', id, reasons.length ? 'partial' : 'mapped', {
      title,
      source,
      target,
      impact,
      ...(leftByIdCritical ? { critical: true } : {}),
      ...(doneLoads.length ? { detail: { remarks: [`${doneLoads.map((l) => l.text).join(', ')} resolved on ${[...new Set(doneLoads.flatMap((l) => loadResolvedOn(a.id, l.arg)))].join(', ')}: the module's content inlined, or a slot naming the module at its position`] } } : {}),
      reason: reasons.join('; ') || null
    })
  }
  const fieldNote = noteLike('article fields not placed in any body')
  const articlesWithField = (name) => [...c.unplacedByArticle].filter(([, set]) => set.has(name)).map(([aid]) => aid).sort(numericCompare)
  for (const [name, where] of [...c.unplacedFields].sort(([x], [y]) => numericCompare(x, y))) {
    const aids = articlesWithField(name)
    add('content', `content:field:${name}`, 'unsupported', {
      title: `article field ${name}`,
      critical: true,
      source: { table: '#__content.attribs', field: name, articles: aids },
      target: aids.map((aid) => `content.json joomla.fields of article ${aid}`),
      impact: { routes: [...new Set(aids.flatMap(drawnRoutesOfArticle))] },
      reason: `extra field kept raw in content.json joomla.fields but drawn in no body (${[...new Set(where)].join(', ')}); name it in --article-fields to place it or "skip" it`,
      notes: fieldNote
    })
  }
  for (const [name, aids] of [...c.skippedFields].sort(([x], [y]) => numericCompare(x, y))) {
    if (items.has(`content:field:${name}`)) continue
    add('content', `content:field:${name}`, 'skipped-by-rule', {
      title: `article field ${name}`,
      source: { table: '#__content.attribs', field: name, articles: [...aids].sort(numericCompare) },
      impact: { routes: [...new Set([...aids].flatMap(drawnRoutesOfArticle))] },
      reason: 'left out by the --article-fields config ("skip")'
    })
  }
  // A subfield a "skip" left out while the rest of its field is drawn: its own entry, not folded
  // into the field.
  for (const [key, aids] of [...c.skippedSubfields].sort(([x], [y]) => numericCompare(x, y))) {
    const id = `content:field:${key}`
    if (items.has(id)) continue
    const [name, ...rest] = key.split('.')
    add('content', id, 'skipped-by-rule', {
      title: `article field ${name}, subfield ${rest.join('.')}`,
      source: { table: '#__content.attribs', field: name, subfield: rest.join('.'), articles: [...aids].sort(numericCompare) },
      impact: { routes: [...new Set([...aids].flatMap(drawnRoutesOfArticle))] },
      reason: `subfield left out by the --article-fields config of ${name} ("skip": ${JSON.stringify(rest.join('.'))}) while it holds a value; the rest of the field is drawn`
    })
  }
  for (const p of wpPages.filter((x) => x.droppedContent)) {
    add('content', `content:body:${p.joomla?.articleId}@${p.file}`, 'unsupported', {
      title: `article body #${p.joomla?.articleId} on ${p.path}`,
      source: { table: '#__content', id: p.joomla?.articleId ?? null, route: p.joomlaPath },
      target: [`content.json#pages/${p.file}`],
      detail: { field: 'droppedContent' },
      impact: { routes: p.joomlaPath ? [p.joomlaPath] : [] },
      reason: 'the route layout has no component row, so the source renders no article body there; the body is kept under droppedContent and drawn nowhere',
      notes: p.notes.filter((n) => n.includes('droppedContent'))
    })
  }

  // ── modules ────────────────────────────────────────────────────────────────
  const siteMods = new Map(siteModules(inv).map((m) => [m.id, m]))
  const acmById = new Map(acm.map((a) => [a.id, a]))
  for (const m of siteMods.values()) if (m.published && m.module === 'mod_custom') for (const l of loadModuleMarkers(m.content)) moduleLoads.push({ where: `module:${m.id}`, marker: l })
  // Each loader once, however many markers it holds for the module.
  const loadedBy = (m) => [
    ...new Set(
      moduleLoads
        .filter(({ marker }) => {
          const [type, title] = marker.arg.split(',').map((x) => x.trim())
          return marker.byId ? marker.arg === m.id : type === m.module && (title == null || title === m.title)
        })
        .map((x) => x.where)
    )
  ]
  // Route keys, not pathnames: a route that shares its path with another menu item's is judged by its own page, archive or gap.
  const archiveFiles = new Set(archives.map((a) => a.file))
  const isArchiveRoute = (e) => archiveFiles.has(pmByRoute.get(routeKey(e))?.file)
  const gapKeys = new Set(entries.filter((e) => e.kind === 'gap').map(routeKey))
  const orphanNotes = (mid) => [...wpPages, ...archives].flatMap((p) => (p.orphaned ?? []).filter((o) => o.module === mid).map(() => `${p.file}: ${(p.notes ?? []).find((n) => n.includes('does not draw')) ?? 'orphaned'}`))
  const moduleStatus = {} // id → item, for the extension roll-up
  for (const row of [...inv.modules].sort(byRowId)) {
    const mid = String(row.id)
    const id = `module:${mid}`
    const m = siteMods.get(mid)
    const a = acmById.get(mid)
    const cfg = row.module === 'mod_ja_acm' ? decodeAcmConfig(row.params) : null
    const acmType = a ? { type: a.type, style: a.style } : cfg && typeof cfg[':type'] === 'string' ? { type: cfg[':type'].split(':').pop(), style: null } : null
    const source = { table: '#__modules', id: mid, module: row.module ?? '', position: row.position ?? '', published: row.published ?? null, clientId: row.client_id ?? null, ...(row.module === 'mod_ja_acm' ? { acm: acmType } : {}) }
    const title = row.title ?? null
    if (!m) {
      moduleStatus[mid] = add('module', id, 'skipped-by-rule', { title, source, reason: 'administrator module (client_id 1): not part of the site' })
      continue
    }
    const assignment = { all: m.assignment.all, pages: m.assignment.pages, except: m.assignment.except }
    if (!m.published) {
      moduleStatus[mid] = add('module', id, 'skipped-by-rule', { title, source: { ...source, assignment }, reason: `not published (published ${row.published}): Joomla renders it nowhere` })
      continue
    }
    const loaders = loadedBy(m)
    const assigned = routed.filter((e) => assignedTo(m.assignment, e.menuId))
    // Only the mega menu draws a module by id; a block draws positions.
    const byId = assigned.filter((e) => drawnOn(e).moduleIds.has(mid) || drawnOn(e).blindMega)
    // The assignment is looked at before the position: a module with no assignment row is only
    // possibly drawn where {loadmodule} loads it, whether or not it has a position.
    const unassigned = !m.assignment.all && !m.assignment.pages.length && !m.assignment.except.length
    if (!m.position && !byId.length) {
      if (loaders.length)
        moduleStatus[mid] = add('module', id, 'unsupported', {
          title,
          critical: true,
          source: { ...source, assignment },
          impact: { routes: [], unknown: [], loadedBy: loaders, ...(unassigned ? { loadedUnassigned: true } : {}) },
          reason: unassigned
            ? `no position and assigned to no menu item (#__modules_menu has no row), yet {loadmodule} loads it in ${loaders.join(', ')}; the adapter does not resolve {loadmodule}, and whether Joomla draws a module with no assignment there is not traced — the routes of what loads it are counted as possible routes`
            : `no position: it is drawn only where {loadmodule} loads it (${loaders.join(', ')}), and the adapter does not resolve {loadmodule}`
        })
      else moduleStatus[mid] = add('module', id, 'skipped-by-rule', { title, source: { ...source, assignment }, reason: 'no position, and no inspected article or module loads it with {loadmodule}: Joomla renders it nowhere' })
      continue
    }
    if (unassigned) {
      // A {loadmodule} marker is looked at before the module is called drawn nowhere: loaded, its
      // loaders' routes are where it may be drawn (possible routes, since whether the module list
      // Joomla loads from includes a module with no assignment row is not traced).
      if (loaders.length)
        moduleStatus[mid] = add('module', id, 'unsupported', {
          title,
          critical: true,
          source: { ...source, assignment },
          impact: { routes: [], unknown: [], loadedBy: loaders, loadedUnassigned: true },
          reason: `assigned to no menu item (#__modules_menu has no row), yet {loadmodule} loads it in ${loaders.join(', ')}; the adapter does not resolve {loadmodule}, and whether Joomla draws a module with no assignment there is not traced — the routes of what loads it are counted as possible routes`
        })
      else moduleStatus[mid] = add('module', id, 'skipped-by-rule', { title, source: { ...source, assignment }, reason: 'assigned to no menu item (#__modules_menu has no row), and no inspected article or module loads it with {loadmodule}: Joomla renders it nowhere' })
      continue
    }
    // Source impact: every render route the module is assigned to whose layout (or block,
    // sub-layout, loadposition) draws its position; a route whose layout is not captured is unknown.
    // The ids the article's resolved {loadmoduleid} markers drew on a route: the same input composition gives the resolver.
    const loadedOn = (e) => new Set(c.moduleLoadLog.filter((x) => x.via === 'route' && x.menuId === e.menuId && x.path === e.joomlaPath && (x.kind === 'slot' || x.kind === 'inline')).map((x) => String(x.module)))
    const renders = []
    const unknown = []
    const undrawn = []
    const unknownVia = new Set()
    for (const e of assigned) {
      const p = placement(e, m, loadedOn(e))
      if (p.state === 'drawn') renders.push({ key: routeKey(e), path: e.joomlaPath, via: p.via, archive: isArchiveRoute(e) })
      else if (p.state === 'unknown') {
        unknown.push(e.joomlaPath)
        for (const v of p.via) unknownVia.add(v)
      } else undrawn.push(e.joomlaPath)
    }
    const scope = positionScope(m.position)
    const placedKeys = new Set()
    const placedPaths = new Set()
    const placeRoute = (key, path) => {
      placedKeys.add(key)
      placedPaths.add(path)
    }
    for (const x of modulePages.get(mid) ?? []) placeRoute(keyOfFile.get(x.file) ?? `${x.menuId} ${pathOfFile.get(x.file) ?? x.wpPath}`, pathOfFile.get(x.file) ?? x.wpPath)
    if (m.module === 'mod_jamasthead') for (const ar of archives) if (ar.masthead?.module === mid) placeRoute(keyOfFile.get(ar.file) ?? `? ${ar.joomlaPath}`, ar.joomlaPath)
    const chrome = (r) => scope === 'header' || scope === 'footer' || r.via.startsWith('block ') || r.via.startsWith('megamenu ')
    // A gap route emits no page at all (its route entry is unsupported): not counted again here.
    const missing = renders.filter((r) => !placedKeys.has(r.key) && !chrome(r) && !gapKeys.has(r.key))
    const unplacedChrome = renders.filter((r) => !placedKeys.has(r.key) && chrome(r) && scope === 'page' && !gapKeys.has(r.key))
    const reasons = []
    let status = 'mapped'
    const target = []
    const worse = (s) => {
      if (COVERAGE_STATUSES.indexOf(s) < COVERAGE_STATUSES.indexOf(status)) status = s
    }
    const params = m.params
    const overrideLayout = typeof params.layout === 'string' && params.layout && !/^(_:)?default$/.test(params.layout) ? params.layout : null
    if (brokenJson(row.params)) {
      worse('unsupported')
      reasons.push('params column is not valid JSON; the adapter read it as {}')
    }
    switch (m.module) {
      case 'mod_ja_acm':
        if (!a) {
          const outer = parseJsonColumn(row.params)
          worse('unsupported')
          reasons.push(
            `ACM instance not decoded (${outer['jatools-config'] == null || outer['jatools-config'] === '' ? 'params carry no jatools-config' : !cfg ? 'jatools-config is not JSON after (( )) unescaping' : 'jatools-config names no :type'}): sections.json acm[] does not carry it`
          )
          break
        }
        target.push(`sections.json#acm/${mid}`)
        if (!tpl.acmDir || !reader.isDir(`acm/${a.type}`)) {
          worse('partial')
          reasons.push(`ACM type "${a.type}" is not in the captured template (acm/${a.type}): its layout is not inspected`)
        } else if (!reader.exists(`acm/${a.type}/tmpl/${a.style}.xml`)) {
          worse('partial')
          reasons.push(`no acm/${a.type}/tmpl/${a.style}.xml schema: repeatable fields were read by the shape heuristic`)
        }
        {
          const block = cfg?.[a.type] ?? {}
          const unread = Object.keys(block).filter((k) => !k.startsWith('jatools-') && !ACM_READ_KEY.test(k))
          if (unread.length) {
            worse('partial')
            reasons.push(`config keys the ACM normaliser does not read: ${unread.join(', ')}`)
          }
        }
        break
      case 'mod_custom': {
        target.push(`sections.json#custom/${mid}`)
        const unknownAt = c.unknownSections.filter((s) => s.includes(`mod_custom #${mid} "`))
        if (unknownAt.length) {
          worse('partial')
          reasons.push(`kept as core/html because no section type matched (${unknownAt.map((s) => s.split(':')[0]).join(', ')})`)
        }
        break
      }
      case 'mod_menu': {
        const menutype = params.menutype
        if (menus.some((x) => x.menutype === menutype)) target.push(`menus.json#${menutype}`)
        else {
          worse('partial')
          reasons.push(`prints menu type ${JSON.stringify(menutype ?? null)}, which menus.json does not hold`)
        }
        target.push(`sections.json#other/${mid}`)
        break
      }
      case 'mod_jamasthead': {
        const on = archives.filter((ar) => ar.masthead?.module === mid).map((ar) => `content.json#archives/${ar.file}`)
        target.push(...on, `sections.json#other/${mid}`)
        const pageRoutes = renders.filter((r) => !r.archive).map((r) => r.path)
        if (pageRoutes.length) {
          worse('partial')
          reasons.push(`prints its masthead on ${pageRoutes.length} page route(s) (${pageRoutes.join(', ')}); only archive routes carry it, elsewhere its menuitem_config stays raw params`)
        }
        break
      }
      case 'mod_articles_category':
      case 'mod_articles_categories': {
        target.push(`sections.json#other/${mid}`)
        const ids = m.module === 'mod_articles_category' ? [params.catid ?? []].flat().map(String) : [String(params.parent ?? '')]
        const lost = ids.filter((x) => !catById.has(x))
        if (lost.length) {
          worse('partial')
          reasons.push(`${m.module === 'mod_articles_category' ? 'catid' : 'parent'} ${lost.join(', ')} is not an exported category`)
        }
        if (overrideLayout) {
          worse('partial')
          reasons.push(`layout override ${overrideLayout} (html/${m.module}/${overrideLayout.split(':').pop()}.php) is not extracted: stage 2 carries the params only`)
        }
        break
      }
      case 'mod_related_items':
        target.push(`sections.json#other/${mid}`)
        if (!arts.some((article) => String(article.metakey ?? '').trim())) {
          worse('partial')
          reasons.push('article metakey values are absent from the dump; related article membership cannot be evidenced')
        }
        break
      default:
        target.push(`sections.json#other/${mid}`)
        worse('unsupported')
        reasons.push(`no stage-2 mapping for module type ${m.module}: sections.json other[] keeps its params raw and no declared target reads them`)
    }
    if (missing.length) {
      worse('partial')
      reasons.push(`the source draws it on ${missing.length} route(s) where stage 2 placed it nowhere: ${missing.map((r) => `${r.path} (${r.via})`).join(', ')}`)
    }
    if (unplacedChrome.length && !missing.length)
      reasons.push(`drawn inside template chrome on ${unplacedChrome.length} route(s) (${[...new Set(unplacedChrome.map((r) => r.via))].join(', ')}), emitted with scope "page" and placed on no page`)
    if (unknown.length)
      reasons.push(`placement unknown on ${unknown.length} route(s) (${[...unknownVia].join('; ')}): ${unknown.join(', ')}`)
    // An article's {loadmoduleid N} the adapter resolved on its pages (an inlined module, a slot, or a marker Joomla prints
    // nothing for) is placed; any other load is left as text.
    const resolvedLoad = (l) => l.startsWith('article:') && loadResolved(l.slice('article:'.length), mid)
    const leftAsText = loaders.filter((l) => !resolvedLoad(l))
    if (leftAsText.length) {
      worse('partial')
      reasons.push(`also loaded by {loadmodule} in ${leftAsText.join(', ')}, which the adapter leaves as text: the module is not placed there`)
    }
    const placedBy = loaders.filter(resolvedLoad)
    if (placedBy.length) reasons.push(`also loaded by {loadmodule} in ${placedBy.join(', ')} (by id), placed there as ${m.module === 'mod_custom' ? 'its inlined content' : 'a slot at its position'}`)
    // A module the source draws on no route (its position is in no layout of the routes it is
    // assigned to), that nothing loads with {loadmodule}, and that stage 2 cannot map is not content
    // of the rendered site.
    if (status === 'unsupported' && !renders.length && !unknown.length && !loaders.length && !brokenJson(row.params)) {
      moduleStatus[mid] = add('module', id, 'skipped-by-rule', {
        title,
        source: { ...source, assignment, scope },
        target,
        impact: { routes: [], undrawn },
        reason: `the source draws it on no render route: position "${m.position}" is in no layout, block, sub-layout, mega menu, template override or {loadposition} of the ${assigned.length} route(s) it is assigned to (${reasons.join('; ')})`
      })
      continue
    }
    if (!renders.length && !unknown.length) reasons.push(`the source draws it on none of the ${assigned.length} render route(s) it is assigned to (its position is in no layout, block, sub-layout, mega menu, template override or {loadposition} of theirs)`)
    const critical = (status === 'unsupported' && (renders.length > 0 || unknown.length > 0)) || missing.length > 0 || loaders.length > 0 || (m.module === 'mod_jamasthead' && status === 'partial')
    const notes = orphanNotes(mid)
    moduleStatus[mid] = add('module', id, status, {
      title,
      critical,
      source: { ...source, assignment, scope },
      target,
      impact: {
        routes: [...new Set(renders.map((r) => r.path))],
        via: [...new Set(renders.map((r) => r.via))],
        placed: [...placedPaths].sort(),
        missing: missing.map((r) => r.path),
        unknown,
        undrawn,
        ...(loaders.length ? { loadedBy: loaders } : {})
      },
      reason: status === 'mapped' ? null : reasons.join('; '),
      ...(status === 'mapped' && reasons.length ? { detail: { remarks: reasons } } : {}),
      notes: [...notes, ...(m.module === 'mod_custom' && c.unknownSections.some((s) => s.includes(`mod_custom #${mid} "`)) ? noteLike('mod_custom modules kept as core/html') : [])]
    })
  }

  // {loadmodule}: a loaded module is drawn on the routes of what loads it — the routes that open the
  // article, or the routes (known and possible) of the loading module — resolved to a fixed point,
  // since a loaded module may itself load another.
  const loadedItems = [...items.values()].filter((i) => i.kind === 'module' && i.impact.loadedBy?.length)
  for (let pass = 0, changed = true; changed && pass <= loadedItems.length; pass++) {
    changed = false
    for (const i of loadedItems) {
      const routesNow = new Set(i.impact.routes)
      const unknownNow = new Set(i.impact.unknown ?? [])
      const untraced = new Set(i.impact.untraced ?? [])
      // A module with no assignment row is only possibly drawn where it is loaded (see above).
      const sure = i.impact.loadedUnassigned ? unknownNow : routesNow
      for (const where of i.impact.loadedBy) {
        if (where.startsWith('article:')) {
          const on = drawnRoutesOfArticle(where.slice('article:'.length))
          if (on.length) for (const p of on) sure.add(p)
          else untraced.add(`${where} (opened by no render route)`)
        } else {
          const by = items.get(where)
          for (const p of by?.impact.routes ?? []) sure.add(p)
          for (const p of by?.impact.unknown ?? []) unknownNow.add(p)
        }
      }
      for (const p of routesNow) unknownNow.delete(p)
      if (routesNow.size !== i.impact.routes.length || unknownNow.size !== (i.impact.unknown ?? []).length || untraced.size !== (i.impact.untraced ?? []).length) {
        changed = true
        i.impact.routes = [...routesNow].sort()
        i.impact.unknown = [...unknownNow].sort()
        if (untraced.size) i.impact.untraced = [...untraced].sort()
      }
    }
  }

  // ── template styles ────────────────────────────────────────────────────────
  const routesOfStyle = (sid) => routed.filter((e) => String(styleOf(itemById.get(String(e.menuId)))?.id) === sid).map((e) => e.joomlaPath)
  const subLayoutUsers = new Map() // sub-layout name → [style id]
  for (const s of [...inv.template_styles].sort(byRowId)) {
    const sid = String(s.id)
    const id = `template-style:${sid}`
    const params = parseJsonColumn(s.params)
    const source = { table: '#__template_styles', id: sid, template: s.template ?? null, home: s.home ?? null, clientId: s.client_id ?? null, layout: params['typelist-layout'] || 'default', subLayout: subLayoutOf(s) }
    const title = s.title ?? null
    const on = routesOfStyle(sid)
    const impact = { routes: on }
    if (Number(s.client_id) !== 0) {
      add('template-style', id, 'skipped-by-rule', { title, source, impact, reason: 'administrator template style (client_id 1)' })
      continue
    }
    const isHome = homeStyle && String(homeStyle.id) === sid
    if (s.template !== tpl.name) {
      if (on.length) add('template-style', id, 'unsupported', { title, source, impact, critical: true, reason: `${on.length} route(s) render through template "${s.template}", which is not the captured one (${tpl.name}): the adapter composes them with ${tpl.name}'s layouts` })
      else add('template-style', id, 'skipped-by-rule', { title, source, impact, reason: `template "${s.template}" is not the site template and no render route uses the style` })
      continue
    }
    if (!isHome && !on.length) {
      add('template-style', id, 'skipped-by-rule', { title, source, impact, reason: 'neither the home style nor the style of any render route' })
      continue
    }
    const reasons = []
    if (brokenJson(s.params)) reasons.push('params column is not valid JSON; the adapter read it as {} (layout "default")')
    if (!layoutInfo(source.layout).exists) reasons.push(`layout "${source.layout}" is not captured (${layoutInfo(source.layout).path})`)
    if (source.subLayout) {
      subLayoutUsers.set(source.subLayout, [...(subLayoutUsers.get(source.subLayout) ?? []), sid])
      reasons.push(`sub-layout "${source.subLayout}" is not read by the adapter: positions only it draws are not composed (see layout:${source.subLayout})`)
    }
    // The sheets of the style (framework mode): each one not read, and each design rule not read from
    // what was, is a loss of this style.
    const css = c.design?.mode === 'framework' ? c.design.styles.find((x) => x.id === sid) : null
    if (css) {
      source.css = css.sheets.map((x) => ({ path: x.path, role: x.role, status: x.status }))
      reasons.push(...css.gaps.map((g) => `css: ${g}`))
    }
    const target = [...(isHome ? ['page-map.json#theme', 'design-contract.json#tokens', 'content.json#site'] : []), ...(on.length ? [`page-map.json#pages[layout=${source.layout}]`] : []), ...(css?.ruleIds?.length ? [`design-contract.json#rules[${css.ruleIds.join(',')}]`] : [])]
    add('template-style', id, reasons.length ? 'partial' : 'mapped', { title, source, target, impact, reason: reasons.join('; ') || null })
  }

  // ── layouts and blocks ─────────────────────────────────────────────────────
  const layoutFiles = reader.isDir('etc/layout') ? [...new Set(reader.list('etc/layout').filter((f) => /^etc\/layout\/[^/]+\.(?:json|ini)$/.test(f)).map((f) => f.slice('etc/layout/'.length).replace(/\.(?:json|ini)$/, '')))] : []
  if (reader.ok && !layoutFiles.length) limitations.push(`no layout file in ${relative(j6Dir, tpl.layoutDir)}: module positions cannot be traced to routes`)
  const routesOfLayout = (name) => routed.filter((e) => (e.layout ?? defaultLayout) === name).map((e) => e.joomlaPath)
  const blocks = new Map() // block name → { layouts: Set, routes: Set }
  for (const name of layoutFiles.sort(numericCompare)) {
    const L = layoutInfo(name)
    const on = routesOfLayout(name)
    const subOn = [...new Set((subLayoutUsers.get(name) ?? []).flatMap((sid) => routesOfStyle(sid).filter((p) => entries.some((e) => e.joomlaPath === p && e.option === 'com_content' && e.view === 'article'))))]
    const cellTypes = [...new Set(L.cells.map((x) => x.type))]
    for (const cell of L.cells.filter((x) => x.type === 'block')) {
      const b = blocks.get(cell.block) ?? { layouts: new Set(), routes: new Set() }
      b.layouts.add(name)
      for (const p of [...on, ...subOn]) b.routes.add(p)
      blocks.set(cell.block, b)
    }
    const unknownCells = L.cells.filter((x) => !['positions', 'component', 'block'].includes(x.type))
    for (const cell of unknownCells)
      add('layout-block', `layout-cell:${name}#${cell.row}.${cell.index}`, 'unsupported', {
        title: `${cell.type || '(no type)'} cell ${cell.name ?? ''}`.trim(),
        critical: on.length > 0,
        source: { file: L.path, row: cell.row, index: cell.index, type: cell.type },
        impact: { routes: on },
        reason: `layout cell type "${cell.type || '(none)'}" is not composed by the adapter; what it draws is not traced`
      })
    const source = { file: L.path, cells: cellTypes, positions: [...layoutPositions(L)].filter(([, v]) => v.startsWith('layout')).map(([p]) => p) }
    if (on.length) {
      const reasons = []
      const blockCells = L.cells.filter((x) => x.type === 'block').map((x) => x.block)
      if (blockCells.length) reasons.push(`block cells ${blockCells.join(', ')} are not composed (see layout-block:*)`)
      if (unknownCells.length) reasons.push(`cells of type ${[...new Set(unknownCells.map((x) => x.type || '(none)'))].join(', ')} are not composed`)
      if (L.shapeProblem) reasons.push(`the file has ${L.shapeProblem}: it composes nothing`)
      for (const g of L.gaps ?? []) reasons.push(`T3 layout: ${g}`)
      const unread = c.layoutCauses(name)
      if (L.undrawn?.length)
        reasons.push(unread.positionCauses.length ? `T3 layout positions not seen drawn (the layout is read only partly, so they may still be drawn): ${L.undrawn.join(', ')}` : `T3 layout positions no literal block draws (not placed): ${L.undrawn.join(', ')}`)
      if (unread.positionCauses.length) reasons.push(`layout read only partly, so a position not seen drawn is unknown, not undrawn: ${unread.positionCauses.slice(0, 3).join('; ')}`)
      const body = c.layoutBody(name)
      if (body === 'absent') reasons.push('no component row: the source renders no article body on its routes')
      else if (body === 'unknown') reasons.push(`whether the layout renders the article body is not known: ${unread.bodyCauses.slice(0, 3).join('; ')}`)
      add('layout', `layout:${name}`, reasons.length ? 'partial' : 'mapped', { title: name, source, target: [`page-map.json#pages[layout=${name}]`], impact: { routes: on }, reason: reasons.join('; ') || null })
    } else if (subOn.length)
      add('layout', `layout:${name}`, 'unsupported', {
        title: name,
        source: { ...source, subLayoutOf: subLayoutUsers.get(name).map((sid) => `template-style:${sid}`) },
        impact: { routes: subOn },
        reason: `sub-layout of the article views of ${subOn.length} route(s): the adapter does not read sub-layouts, so the modules only it draws are traced by the module entries, not composed`
      })
    else if (subLayoutUsers.has(name))
      add('layout', `layout:${name}`, 'unsupported', {
        title: name,
        source: { ...source, subLayoutOf: subLayoutUsers.get(name).map((sid) => `template-style:${sid}`) },
        impact: { routes: [] },
        reason: `sub-layout of ${subLayoutUsers.get(name).map((sid) => `template-style:${sid}`).join(', ')}, none of whose render routes is an article view: it draws the article pages reached from them, which no render route captures, and the adapter does not read sub-layouts`
      })
    else add('layout', `layout:${name}`, 'skipped-by-rule', { title: name, source, impact: { routes: [] }, reason: 'no render route uses it, and no template style of one names it as its layout or sub-layout' })
  }
  for (const [bname, b] of [...blocks].sort(([x], [y]) => numericCompare(x, y))) {
    const B = blockInfo(bname)
    const source = { file: B.path, layouts: [...b.layouts].sort(), positions: B.positions, elements: B.elements, ...(B.other.length ? { other: B.other } : {}) }
    const impact = { routes: [...b.routes].sort() }
    if (!b.routes.size) add('layout-block', `layout-block:${bname}`, 'skipped-by-rule', { title: bname, source, impact, reason: 'drawn only by layouts no render route uses' })
    else if (!B.exists) add('layout-block', `layout-block:${bname}`, 'unsupported', { title: bname, source, impact, reason: `block markup ${B.path} is not captured (or not readable): what it draws is unknown` })
    else
      add('layout-block', `layout-block:${bname}`, 'partial', {
        title: bname,
        source,
        target: B.positions.length ? B.positions.map((p) => `sections.json modules at position ${p}`) : [],
        impact,
        reason: `template chrome block: stage 2 does not compose it${B.positions.length ? `; the modules at ${B.positions.join(', ')} are emitted with their own records` : ''}${B.elements.length ? `; the T4 elements ${B.elements.join(', ')} have no stage-2 extraction (Phase 3 rebuilds the chrome)` : ''}`
      })
  }

  // Block markup the capture holds that no layout file draws: counted too, one entry per file.
  const blockDir = 'html/layouts/t4/block'
  for (const f of reader.isDir(blockDir) ? reader.list(blockDir) : []) {
    const m = f.match(/^html\/layouts\/t4\/block\/([^/]+)\.html$/)
    if (m && blocks.has(m[1])) continue
    const B = m ? blockInfo(m[1]) : null
    const source = { file: relative(j6Dir, join(tpl.dir, f)), ...(B ? { positions: B.positions, elements: B.elements } : {}) }
    add('layout-block', `layout-block-file:${f.slice(blockDir.length + 1)}`, 'skipped-by-rule', {
      title: m ? m[1] : f,
      source,
      impact: { routes: [] },
      reason: m ? 'captured block markup that no captured layout file draws: Joomla renders it on no route' : 'a file in the block folder that is not <name>.html block markup: T4 does not load it as a block'
    })
  }

  for (const e of routed) drawnOn(e)
  for (const [name, mega] of [...megaCache].sort(([x], [y]) => numericCompare(x, y))) {
    const on = routed.filter((e) => drawnOn(e).mega?.name === name).map((e) => e.joomlaPath)
    const source = { file: mega.path, columns: mega.columns, positions: mega.positions, modules: mega.modules }
    if (!mega.exists) add('layout-block', `megamenu:${name}`, 'unsupported', { title: `mega menu ${name}`, source, impact: { routes: on }, reason: `a block draws the megamenu element, but ${mega.path} is not captured: what the mega menu draws is unknown` })
    else
      add('layout-block', `megamenu:${name}`, 'partial', {
        title: `mega menu ${name}`,
        source,
        target: ['menus.json (menu items only)'],
        impact: { routes: on },
        reason: `the mega menu layout (${mega.columns} cell(s) of mega_settings: columns, titles, item lists) is not extracted${mega.positions.length || mega.modules.length ? `; the modules it draws (positions ${mega.positions.join(', ') || 'none'}, module ids ${mega.modules.join(', ') || 'none'}) are emitted with their own records` : ''}`
      })
  }

  // ── animation libraries and template script assets ──────────────────────────
  const declared = new Map() // library → [evidence]
  const libDirs = new Map() // library → Set(dir relative to the template)
  const unrecognised = [] // { id, path, what } — a declared script no animation signature names
  const noteLib = (map, lib, v) => map.set(lib, [...(map.get(lib) ?? []), v])
  const libOf = animationLibraryOf
  const assetsFile = reader.read('etc/assets.json')
  if (assetsFile) {
    const assets = parseJsonText(assetsFile.text, join(j6Dir, assetsFile.path))
    for (const [key, asset] of Object.entries(assets?.assets ?? {})) {
      const files = [...(Array.isArray(asset?.js) ? asset.js : []), ...(Array.isArray(asset?.css) ? asset.css : [])].map(String)
      const lib = libOf(key)
      if (!lib) {
        unrecognised.push({ id: `asset:${assetsFile.path}#${key}`, path: assetsFile.path, what: `assets.${key}`, files })
        continue
      }
      noteLib(declared, lib, `${assetsFile.path} assets.${key}`)
      for (const f of files) {
        const dir = f.split('/').slice(0, -1).join('/')
        if (dir) libDirs.set(lib, new Set([...(libDirs.get(lib) ?? []), dir]))
      }
    }
  }
  const globalFile = reader.read('etc/global.json')
  if (globalFile) {
    const g = parseJsonText(globalFile.text, join(j6Dir, globalFile.path))
    for (const addon of Array.isArray(g?.system_addons) ? g.system_addons : []) {
      const lib = libOf(addon)
      if (lib) noteLib(declared, lib, `${globalFile.path} system_addons ${addon} (enabled)`)
      else unrecognised.push({ id: `asset:${globalFile.path}#system_addons/${addon}`, path: globalFile.path, what: `system_addons ${addon} (enabled)`, files: [] })
    }
  }
  const jsDir = relative(j6Dir, join(tpl.dir, 'js'))
  for (const d of reader.isDir('js') ? reader.entries('js') : []) {
    const lib = libOf(d.dir ? d.name : d.name.replace(/(\.min)?\.(m?js|css)$/i, ''))
    const where = `${jsDir}/${d.name}${d.dir ? '/' : ''}`
    if (!lib) {
      unrecognised.push({ id: `asset:${where}`, path: where, what: d.dir ? 'script folder' : 'script file', files: [] })
      continue
    }
    noteLib(declared, lib, `${where} (library files)`)
    if (d.dir) libDirs.set(lib, new Set([...(libDirs.get(lib) ?? []), `js/${d.name}`]))
  }
  const usage = new Map() // library → [{ where, count, file? }]
  const ownDirs = [...libDirs.values()].flatMap((s) => [...s])
  // Declarations (etc/assets.json, etc/global.json) name a library; they are not a use of it.
  const scanFiles = reader.ok
    ? reader.list('').filter((f) => SCAN_EXT.test(f) && !/\.min\.js$/i.test(f) && !ownDirs.some((d) => f.startsWith(`${d}/`)) && !/^(scss|less|css)\//.test(f) && !['etc/assets.json', 'etc/global.json'].includes(f))
    : []
  for (const f of scanFiles) {
    const file = reader.read(f)
    if (!file) continue
    for (const [lib, L] of Object.entries(ANIMATION_LIBRARIES)) {
      const n = (file.text.match(new RegExp(L.usage.source, 'g')) ?? []).length
      if (n) noteLib(usage, lib, { where: file.path, file: f, count: n })
    }
  }
  const textRows = [
    ...inv.content.map((r) => ({ where: `#__content ${r.id}`, text: `${r.introtext ?? ''}${r.fulltext ?? ''}` })),
    ...inv.modules.filter((r) => Number(r.client_id) === 0 && Number(r.published) === 1).map((r) => ({ where: `#__modules ${r.id}`, text: `${r.content ?? ''}${typeof r.params === 'string' ? r.params : JSON.stringify(r.params ?? '')}`, moduleId: String(r.id) }))
  ]
  for (const row of textRows)
    for (const [lib, L] of Object.entries(ANIMATION_LIBRARIES)) {
      const n = (row.text.match(new RegExp(L.usage.source, 'g')) ?? []).length
      if (n) noteLib(usage, lib, { where: row.where, count: n, moduleId: row.moduleId ?? null, articleId: row.where.startsWith('#__content') ? row.where.split(' ')[1] : null })
    }
  // A usage in a module's own markup reaches the routes that module renders on; a usage in an ACM
  // or module layout file reaches the instances drawn with it; anywhere else the routes are unknown.
  const modulesUsing = (u) => {
    if (u.moduleId) return [u.moduleId]
    if (!u.file) return []
    const acmM = u.file.match(/^acm\/([^/]+)\/tmpl\/([^/]+)\.php$/)
    if (acmM) return acm.filter((x) => x.type === acmM[1] && x.style === acmM[2]).map((x) => x.id)
    const modM = u.file.match(/^html\/(mod_[^/]+)\/([^/]+)\.php$/)
    if (modM) return [...siteMods.values()].filter((x) => x.module === modM[1] && String(x.params.layout ?? '').split(':').pop() === modM[2]).map((x) => x.id)
    return null
  }
  for (const lib of [...new Set([...declared.keys(), ...usage.keys()])].sort()) {
    const uses = usage.get(lib) ?? []
    const mods = new Set()
    const routesHit = new Set()
    const unknownWhere = []
    for (const u of uses) {
      const ms = modulesUsing(u)
      if (ms === null) unknownWhere.push(u.where)
      for (const x of ms ?? []) mods.add(x)
      if (u.articleId) for (const p of drawnRoutesOfArticle(u.articleId)) routesHit.add(p)
    }
    const maybe = new Set()
    for (const x of mods) {
      for (const p of items.get(`module:${x}`)?.impact.routes ?? []) routesHit.add(p)
      for (const p of items.get(`module:${x}`)?.impact.unknown ?? []) maybe.add(p)
    }
    const source = { declared: declared.get(lib) ?? [], usage: uses.map(({ where, count }) => ({ where, count })) }
    // `unknown`: routes it may reach (a module of unknown placement); `untraced`: usages whose routes are not traced at all.
    const impact = { routes: [...routesHit].sort(), modules: [...mods].sort(numericCompare), unknown: [...maybe].filter((p) => !routesHit.has(p)).sort(), ...(unknownWhere.length ? { untraced: unknownWhere } : {}) }
    if (!uses.length)
      add('animation', `animation:${lib}`, 'skipped-by-rule', { title: lib, source, impact, reason: `installed or enabled, but no inspected file or inventory row uses it (${reader.inspection.filesRead} captured files and ${textRows.length} inventory rows read)` })
    else
      add('animation', `animation:${lib}`, 'unsupported', {
        title: lib,
        source,
        impact,
        reason: `used in ${uses.length} place(s): stage 2 extracts no motion (the port re-creates it; scripts/visual/motion.mjs measures it on the live source)${unknownWhere.length ? `; routes of ${unknownWhere.join(', ')} are not traced` : ''}`
      })
  }
  for (const u of unrecognised)
    add('asset', u.id, 'unsupported', {
      title: u.what,
      source: { file: u.path, declares: u.what, ...(u.files.length ? { files: u.files } : {}) },
      impact: { routes: [], untraced: [u.path] },
      reason: `a template script or style no animation signature recognises (${Object.keys(ANIMATION_LIBRARIES).join(', ')}): stage 2 extracts none of it, and what it does on which routes is not traced`
    })
  limitations.push(`animation usage is recognised by signature for ${Object.keys(ANIMATION_LIBRARIES).join(', ')} only; every other declared script or style is an asset entry whose behaviour is not traced, and a library loaded from outside the template capture (media/, a CDN) is not seen`)

  // ── extensions ─────────────────────────────────────────────────────────────
  const hasExtensions = Array.isArray(inv.extensions)
  if (!hasExtensions)
    limitations.push('inventory.json has no extensions table: the extension entries are the ones menu items, modules and template styles reference, not a census of installed extensions')
  const worst = (list) => {
    const live = list.filter((x) => x.status !== 'skipped-by-rule')
    if (!live.length) return list.length ? 'skipped-by-rule' : null
    return COVERAGE_STATUSES.find((s) => live.some((x) => x.status === s))
  }
  const ext = new Map() // `type element` → { type, element, members: [item], routes: Set, refs: [] }
  const extOf = (element, type) => {
    const k = `${type} ${element}`
    const e = ext.get(k) ?? { type, element, members: [], routes: new Set(), refs: [] }
    ext.set(k, e)
    return e
  }
  for (const e of entries) {
    if (!e.option) continue
    const x = extOf(e.option, 'component')
    x.members.push(items.get(`route:${e.menuId}:${e.joomlaPath}`))
    x.routes.add(e.joomlaPath)
  }
  for (const row of inv.menu) {
    if (Number(row.client_id) !== 0 || row.type !== 'component') continue
    const opt = parseMenuLink(row.link).option
    if (opt) extOf(opt, 'component').refs.push(`menu-item:${row.id}`)
  }
  for (const m of siteMods.values()) {
    const x = extOf(m.module, 'module')
    x.members.push(moduleStatus[m.id])
    for (const p of moduleStatus[m.id].impact.routes ?? []) x.routes.add(p)
  }
  for (const s of inv.template_styles) {
    if (Number(s.client_id) !== 0 || !s.template) continue
    const x = extOf(s.template, 'template')
    x.members.push(items.get(`template-style:${s.id}`))
    for (const p of items.get(`template-style:${s.id}`).impact.routes) x.routes.add(p)
  }
  // With an extensions table, one entry per #__extensions row (a plugin element repeats across
  // folders): each row takes the references of its type and element. Without it, one entry per
  // referenced element.
  const extRows = hasExtensions ? [...inv.extensions].sort((x, y) => numericCompare(extensionKey(x), extensionKey(y))) : []
  const rowsFor = (element, type) => extRows.filter((r) => String(r.element) === element && String(r.type) === type && (type === 'component' || Number(r.client_id ?? 0) === 0))
  const rollUp = (id, title, x, from) => {
    const status = worst(x.members)
    const source = { type: x.type, element: x.element, ...from, members: x.members.map((i) => i.id), ...(x.refs.length ? { menuItems: x.refs } : {}) }
    const impact = { routes: [...x.routes].sort() }
    if (!status) add('extension', id, 'skipped-by-rule', { title, source, impact, reason: x.refs.length ? 'menu items link it, but no render route opens it' : 'installed; no render route, module or template style uses it' })
    else if (status === 'skipped-by-rule') add('extension', id, status, { title, source, impact, reason: `every ${x.type === 'module' ? 'instance' : x.type === 'template' ? 'style' : 'route'} of it is skipped by rule` })
    else {
      const bad = x.members.filter((i) => i.status === status && status !== 'mapped').map((i) => i.id)
      // A roll-up: the members carry `critical`; counting it here too would count them twice.
      add('extension', id, status, {
        title,
        source: { ...source, criticalMembers: x.members.filter((i) => i.critical).map((i) => i.id) },
        target: [...new Set(x.members.flatMap((i) => i.target))].slice(0, 20),
        impact,
        reason: status === 'mapped' ? null : `${bad.length} of its ${x.members.length} ${x.type === 'module' ? 'instance' : x.type === 'template' ? 'style' : 'route'}(s) ${status}: ${bad.join(', ')}`
      })
    }
  }
  // The references of a type and element go to the first row of that type and element (a site row
  // for modules and templates), so a duplicate row does not count them twice.
  const claimed = new Set()
  for (const r of extRows) {
    const element = String(r.element)
    const type = String(r.type)
    const k = `${type} ${element}`
    const x = ext.get(k)
    const own = x && !claimed.has(k) && rowsFor(element, type)[0] === r
    if (own) claimed.add(k)
    rollUp(`extension:${extensionKey(r)}`, r.name ?? element, own ? x : { type, element, members: [], routes: new Set(), refs: [] }, { from: '#__extensions', row: extensionKey(r), folder: r.folder ?? null, clientId: r.client_id ?? null, enabled: r.enabled ?? null })
  }
  for (const [k, x] of [...ext].sort(([p], [q]) => numericCompare(p.split(' ')[1], q.split(' ')[1]) || numericCompare(p, q))) {
    if (claimed.has(k)) continue
    const id = items.has(`extension:${x.element}`) ? `extension:${x.type}:${x.element}` : `extension:${x.element}`
    rollUp(id, x.element, x, { from: hasExtensions ? 'referenced; no #__extensions row of this type and element' : 'referenced' })
  }

  // ── spec-pack gate problems ────────────────────────────────────────────────
  // A pack the gate refuses is not silent here: each problem is a critical unsupported item.
  const problems = c.validation.problems ?? []
  const causes = c.specCauses ?? problems.map((problem) => ({ problem, cause: null }))
  if (causes.length !== problems.length || causes.some((x, k) => x.problem !== problems[k])) throw new Error(`adapter coverage: ${causes.length} traced causes for ${problems.length} spec-pack problems`)
  // A path inside the dump is given relative to it; a file outside it (an override) stays absolute.
  const fromDump = (p) => (p && isAbsolute(p) && !relative(j6Dir, p).startsWith('..') ? relative(j6Dir, p) : p)
  const tokensPath = fromDump(tpl.tokensFile) ?? `${reader.inspection.root}/css/styles/${tpl.themeKey}.css`
  const designSheets = (c.design?.styles ?? []).flatMap((s) => s.sheets.map((x) => x.path))
  const evidenceOf = (problem) => {
    if (/identity\.(name|summary)\b/.test(problem)) return [tpl.siteFile, tpl.siteConfig?.from].filter(Boolean).map(fromDump)
    if (/^page-map\.theme\.|design-contract\.json: .*pending design decisions|^design-spec\.md /.test(problem)) return [...new Set([tokensPath, ...designSheets, tpl.themeFile].filter(Boolean).map(fromDump))]
    return []
  }
  const pagePaths = (file) => entries.filter((e) => e.kind !== 'gap' && pmByRoute.get(`${e.menuId} ${e.joomlaPath}`)?.file === file).map((e) => e.joomlaPath)
  const gaps = validationGapItems(causes, { siteRoutes: entries.filter((e) => e.kind !== 'gap').map((e) => e.joomlaPath), routesOfPage: pagePaths, evidenceOf })
  for (const g of gaps) add('validation-gap', g.id, 'unsupported', g)
  const specCauses = causes.map((x, k) => ({ ...x, coverageId: gaps[k].id }))

  // ── reconcile, sort, aggregate ─────────────────────────────────────────────
  const list = [...items.values()]
  const count = (kind) => list.filter((i) => i.kind === kind).length
  const denominators = { routes: routes.length, tables: Object.fromEntries(Object.values(COVERAGE_TABLES).map((t) => [t, inv[t].length])) }
  if (count('validation-gap') !== problems.length) throw new Error(`adapter coverage: ${count('validation-gap')} validation-gap entries for ${problems.length} spec-pack problems`)
  if (count('route') !== routes.length) throw new Error(`adapter coverage: ${count('route')} route entries for ${routes.length} render routes`)
  for (const [kind, table] of Object.entries(COVERAGE_TABLES))
    if (count(kind) !== inv[table].length) throw new Error(`adapter coverage: ${count(kind)} ${kind} entries for ${inv[table].length} #__${table} rows`)
  const rank = (i) => [i.critical ? 0 : 1, COVERAGE_STATUSES.indexOf(i.status), COVERAGE_KINDS.indexOf(i.kind)]
  list.sort((x, y) => {
    const a = rank(x),
      b = rank(y)
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] - b[k]
    return numericCompare(x.id, y.id)
  })
  const tally = (subset) => Object.fromEntries(COVERAGE_STATUSES.map((s) => [s, subset.filter((i) => i.status === s).length]))
  const byKind = Object.fromEntries(COVERAGE_KINDS.map((k) => [k, { total: count(k), ...tally(list.filter((i) => i.kind === k)) }]))
  const distinctRoutes = (subset) => [...new Set(subset.flatMap((i) => i.impact?.routes ?? []))].sort()
  // Routes an item may reach: its known routes and the ones whose placement is unknown.
  const possibleRoutes = (subset) => [...new Set(subset.flatMap((i) => [...(i.impact?.routes ?? []), ...(i.impact?.unknown ?? [])]))].sort()
  const group = (keyOf) => {
    const out = {}
    for (const i of list.filter((x) => x.kind === 'module')) {
      const key = keyOf(i)
      if (!key) continue
      out[key] = out[key] ?? []
      out[key].push(i)
    }
    return Object.fromEntries(
      Object.entries(out)
        .sort(([a], [b]) => numericCompare(a, b))
        .map(([k, v]) => [k, { instances: v.length, ...tally(v), critical: v.filter((i) => i.critical).length, routes: distinctRoutes(v).length, possibleRoutes: possibleRoutes(v).length }])
    )
  }
  const affected = (subset) => ({
    items: subset.length,
    instances: new Set(subset.filter((i) => i.kind === 'module').map((i) => i.id)).size,
    routes: distinctRoutes(subset).length,
    routeList: distinctRoutes(subset),
    possibleRoutes: possibleRoutes(subset).length,
    possibleRouteList: possibleRoutes(subset)
  })
  const critical = list.filter((i) => i.critical)
  const summary = {
    total: list.length,
    byStatus: tally(list),
    byKind,
    critical: { count: critical.length, byKind: Object.fromEntries(COVERAGE_KINDS.map((k) => [k, critical.filter((i) => i.kind === k).length]).filter(([, n]) => n)), ids: critical.map((i) => i.id) },
    moduleTypes: group((i) => i.source.module),
    acmKinds: group((i) => (i.source.module === 'mod_ja_acm' ? (i.source.acm ? `${i.source.acm.type}/${i.source.acm.style ?? '?'}` : '(not decoded)') : null)),
    affected: {
      unsupported: affected(list.filter((i) => i.status === 'unsupported')),
      partial: affected(list.filter((i) => i.status === 'partial')),
      critical: affected(critical)
    }
  }
  if (c.design?.mode === 'framework') {
    const d = c.design
    limitations.push(`design rules are read from the ${d.framework.framework} sheets per template style (inspection.css): declarations at the top level or under a min/max-width @media only, one exact selector per rule — the cascade of other selectors on the same element is not computed`)
    for (const g of d.gaps) limitations.push(`css: ${g}`)
    const n = d.unsupported.reduce((a, x) => a + x.count, 0)
    if (n) limitations.push(`css: ${n} construct(s) in ${new Set(d.unsupported.map((x) => x.path)).size} sheet(s) were not read (conditional or nested blocks, imports; inspection.css.unsupported)`)
  }
  limitations.push('statuses describe stage-2 extraction only: whether later phases render an entity as the source does, and visual parity, are decided at Phases 3–8')
  return {
    schemaVersion: COVERAGE_SCHEMA_VERSION,
    adapter: ADAPTER,
    generatedAt: c.now,
    source: { path: j6Dir, inventory: 'inventory.json', routes: 'render-routes.json', template: tpl.name, capture: relative(j6Dir, tpl.dir) },
    statuses: {
      mapped: 'extracted into the named target(s)',
      partial: 'extracted, with a portion lost or unresolved (see reason)',
      unsupported: 'not extracted, or kept only as raw source data no declared target reads (see reason)',
      'skipped-by-rule': 'left out by a documented rule (see reason); not content of the rendered site'
    },
    denominators,
    spec: { valid: c.validation.ok, problems, causes: specCauses },
    summary,
    inspection: {
      // A file met by more than one walk is reported once.
      capture: { ...reader.inspection, skipped: [...new Map(reader.inspection.skipped.map((x) => [`${x.path}\n${x.reason}`, x])).values()] },
      ...(c.design?.site ? { site: { ...c.design.site.inspection, skipped: [...new Map(c.design.site.inspection.skipped.map((x) => [`${x.path}\n${x.reason}`, x])).values()] } } : {}),
      css: c.design ? cssProvenance(c.design) : null,
      limitations
    },
    items: list
  }
}

// ── design-spec slot filling ──────────────────────────────────────────────────

/**
 * Why the spec-pack gate refused the pack: `{ problem, cause }` per validation problem, the cause
 * traced to the source input the adapter read (or did not find), `null` where the adapter has no
 * trace. The adapter fills nothing in to make the gate pass — a cause names what the source lacks.
 */
function explainSpecProblems(problems, { tpl, hasDark, pending = [], specMd = '', design = null }) {
  const root = tpl.reader.inspection.root
  const cssRel = `css/styles/${tpl.themeKey}.css`
  const tokens = () => {
    if (tpl.tokensFile)
      return hasDark ? `${relative(tpl.reader.j6Dir, tpl.tokensFile)} was read` : `${relative(tpl.reader.j6Dir, tpl.tokensFile)} holds no html[data-theme="dark"] remap of --bg, --fg and --accent`
    const skipped = tpl.reader.inspection.skipped.find((x) => x.path === `${root}/${cssRel}`)
    const legacy = `${root}/${cssRel} ${skipped ? `was not read (${skipped.reason})` : 'is not in the template capture'}`
    if (design?.mode !== 'framework') return `${legacy}, and the adapter reads the design tokens from no other file`
    const home = design.styles.find((s) => s.id === design.homeId)
    const read = (home?.sheets ?? []).filter((x) => x.status === 'read').map((x) => x.path)
    const unread = (home?.sheets ?? []).filter((x) => x.status !== 'read').map((x) => `${x.path} ${x.status === 'skipped' ? `was not read (${x.reason})` : 'is not in the capture'}`)
    return `${legacy}; the ${design.framework.framework} sheets of the home style #${design.homeId} were read instead (${read.join(', ') || 'none'})${unread.length ? `, while ${unread.join('; ')}` : ''}${hasDark ? '' : `, and none changes the body colours under html[data-theme="dark"]`}`
  }
  const lines = specMd.split('\n')
  const declared = (k, v) => (Object.hasOwn(tpl.identityInvalid ?? {}, k) ? `${JSON.stringify(tpl.identityInvalid[k])}, not a string (malformed; not read)` : JSON.stringify(v ?? null))
  return problems.map((problem) => {
    let cause = null
    if (/identity\.name must reference a fact/.test(problem)) {
      const v = tpl.site?.site_name
      const cfg = tpl.siteConfig ?? { config: null, from: null }
      const global = cfg.from
        ? `${cfg.from} declares sitename ${JSON.stringify(cfg.config.sitename ?? null)}`
        : `no site-config.json in ${tpl.reader.j6Dir} (joomla-dump.mjs writes configuration.php's sitename there when given --web-service or --web-container)`
      cause = `${tpl.siteFile ? `${tpl.siteFile} declares site_name ${declared('site_name', v)}` : `no etc/site settings file was read from ${root}`}; ${global}; the name is not invented`
    } else if (/identity\.summary must reference a fact/.test(problem)) {
      const v = tpl.site?.site_slogan
      cause = `${tpl.siteFile ? `${tpl.siteFile} declares site_slogan ${declared('site_slogan', v)}` : `no etc/site settings file was read from ${root}`}; configuration.php has no tagline setting (site-config.json carries none), and it is not invented`
    } else if (/^page-map\.theme\.palette\.(light|dark)\.\w+ is missing/.test(problem)) {
      const [, mode, key] = problem.match(/^page-map\.theme\.palette\.(light|dark)\.(\w+)/)
      cause = `the ${mode} ${key} colour is declared neither by the design tokens (${tokens()}) nor by ${tpl.themeFile ?? `an etc/theme settings file under ${root}`}`
    } else if (/^design-contract\.json: tokens\.[\w-]+ must contain/.test(problem)) {
      cause = pending.find((x) => x.startsWith(TOKENS_NOT_COMMON)) ?? null
    } else if (/^design-contract\.json: .*pending design decisions/.test(problem)) {
      cause = pending.length ? `design-contract.json pending: ${pending.join('; ')} — ${tokens()}` : null
    } else if (/^design-spec\.md still has \d+ unresolved `TODO`/.test(problem)) {
      const at = []
      let heading = ''
      lines.forEach((l, k) => {
        if (l.startsWith('## ')) heading = l.slice(3).trim()
        if (l.includes('`TODO`')) at.push({ line: k + 1, heading, row: l.match(/^\| `([^`]+)`/)?.[1] ?? null })
      })
      const palette = at.length > 0 && at.every((x) => /palette/i.test(x.heading))
      cause = at.length
        ? `${at.map((x) => `line ${x.line}${x.row ? ` (${x.row})` : ''}`).join(', ')} under ${[...new Set(at.map((x) => `"${x.heading}"`))].join(', ')}${palette && !hasDark ? `: the dark palette is not declared by the source — ${tokens()}` : ''}`
        : null
    }
    return { problem, cause }
  })
}

const code = (v) => (v == null || v === '' ? null : `\`${v}\``)

/**
 * Resolve the `TODO` slots make-design-spec.mjs leaves, from what the template actually declares.
 * A slot the source has no value for is written as such, in words, rather than invented —
 * the builder then knows there is nothing to match, which is different from "nobody looked".
 */
function fillDesignSpec(
  md,
  { tpl, tokens, hasDark, pageMapPages, referencePages, acmById, themeSlug, design = null }
) {
  const L = tokens.light,
    D = tokens.dark
  const site = tpl.site
  const unresolved = []
  const none = (what) => {
    unresolved.push(what)
    return `not declared in the source (${what}) — measure at Phase 6`
  }
  const pair = (key, what) =>
    `| \`${what}\` | ${code(L[key]) ?? none(`--${what} light`)} | ${hasDark ? (code(D[key] ?? L[key]) ?? none(`--${what} dark`)) : 'derived at Phase 6'} |`
  const sizes = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']
    .map((h) => (site[`${h}_font_size`] ? `${h} ${site[`${h}_font_size`]}` : null))
    .filter(Boolean)
  const wide =
    L['--container-max'] && L['--container-gutter-desktop']
      ? `\`${parseFloat(L['--container-max']) + 2 * parseFloat(L['--container-gutter-desktop'])}px\` (\`--container-max\` + 2 × \`--container-gutter-desktop\`, the \`.container\` max-width)`
      : none('wide width')
  const cardPad = L['--space-6']
    ? `\`${L['--space-6']}\` (\`.tracy-card { padding: var(--space-6) }\`)`
    : none('card padding')
  const lines = md.split('\n').map((line) => {
    if (line.startsWith('- **Dark hook') && design?.mode === 'framework') {
      const darkSheets = [...new Set(design.styles.flatMap((s) => s.sheets.filter((x) => x.role === 'dark' && x.status === 'read').map((x) => x.path)))]
      return `- **Dark hook (\`<DARK>\`):** \`html[data-theme="dark"]\` — ${darkSheets.length ? `${darkSheets.map(code).join(', ')} declare(s) the dark rules under it` : `no ${design.framework.framework} sheet the adapter read declares rules under it`}`
    }
    if (line.startsWith('- **Dark hook'))
      return `- **Dark hook (\`<DARK>\`):** \`html[data-theme="dark"]\` — the template's \`js/darkmode.js\` sets \`data-theme\` on \`<html>\`; its \`css/styles/${tpl.themeKey}.css\` remaps the tokens under \`html[data-theme="dark"]\``
    if (line.startsWith('- **Class prefix'))
      return `- **Class prefix:** \`${themeSlug}-\` (block classes stay \`wp-block-*\`; source component classes are \`tracy-*\`)`
    if (line.startsWith('| `border` |'))
      return `${pair('--border', 'border')} faint divider (\`--border\`; hairline \`--border-soft\` ${code(L['--border-soft']) ?? 'n/a'} / ${hasDark ? (code(D['--border-soft']) ?? 'n/a') : 'derived'}) |`
    if (line.startsWith('| `heading` |'))
      return `${pair('--fg', 'heading')} headings use the body foreground \`--fg\` |`
    if (line.startsWith('| `surface` |'))
      return `${pair('--surface', 'surface')} band / card background (\`--surface\`; warm band \`--surface-warm\` ${code(L['--surface-warm']) ?? 'n/a'} / ${hasDark ? (code(D['--surface-warm']) ?? 'n/a') : 'derived'}) |`
    if (line.startsWith('- **h1–h6 size'))
      return `- **h1–h6 size / weight / line-height:** ${sizes.length ? `\`${sizes.join(' · ')}\`` : none('heading sizes')} · weight \`${site.heading_font_weight ?? '600'}\` · line-height \`${site.heading_line_height ?? L['--leading-tight'] ?? '1.05'}\` · letter-spacing \`${site.heading_letter_spacing ?? L['--tracking-display'] ?? 'normal'}\` (etc/site, matching \`--text-xl…--text-3xl\`)`
    if (line.startsWith('- **Body font:**') && line.includes('`TODO`'))
      return line.replace(/`TODO`/g, () => none('font family, undeclared by the source template — see source-fonts.json'))
    if (line.startsWith('- **Body size'))
      return `- **Body size / line-height / letter-spacing:** \`${site.body_font_size ?? L['--text-base'] ?? '?'}\` / \`${site.body_line_height ?? L['--leading-body'] ?? '?'}\` / \`${site.letter_spacing ?? 'normal'}\` (etc/site; tokens \`--text-base\` ${code(L['--text-base']) ?? 'n/a'}, \`--leading-body\` ${code(L['--leading-body']) ?? 'n/a'})`
    if (line.startsWith('- **Section vertical rhythm'))
      return `- **Section vertical rhythm (full-width group top/bottom padding):** ${L['--section-y-desktop'] ? `\`${L['--section-y-desktop']}\` desktop · \`${L['--section-y-tablet'] ?? '?'}\` tablet · \`${L['--section-y-phone'] ?? '?'}\` phone (\`--section-y-*\`, applied by \`.tracy-band { padding-block: var(--tracy-band-y) }\`)` : none('section rhythm')}`
    if (line.startsWith('- **Content width'))
      return `- **Content width (\`settings.layout.contentSize\`):** ${code(L['--container-max']) ?? none('content width')} · **Wide width (\`wideSize\`):** ${wide} · **Card internal padding:** ${cardPad}`
    const row = line.match(/^\| `([^`]+)` \| `([^`]+)` \| `([^`]*)` \| `TODO` \|$/)
    if (row) {
      const page = pageMapPages.find((p) => p.file === row[1])
      const ref = referencePages.find((r) => r.page === row[1])
      const sections = (page?.sections ?? []).flatMap((s) =>
        s.modules.map((id) =>
          acmById.get(id) ? `${s.position}: ${acmById.get(id).type}#${id}` : `${s.position}: module#${id}`
        )
      )
      const src = `${ref?.url ?? '?'}${page?.synthetic ? ' (synthetic — no route)' : ''}`
      return `| \`${row[1]}\` | \`${row[2]}\` | \`${row[3]}\` | ${src}${sections.length ? ` · sections: ${sections.join(', ')}` : ' · no module sections (article body / core template)'} · images: from the source \`images/\` tree, not exported |`
    }
    return line
  })
  return { md: lines.join('\n'), unresolved }
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function isMainModule() {
  if (!process.argv[1]) return false
  const real = (p) => {
    try {
      return realpathSync(p)
    } catch {
      return resolve(p)
    }
  }
  return real(process.argv[1]) === real(fileURLToPath(import.meta.url))
}

if (isMainModule()) {
  const args = process.argv.slice(2)
  const flag = (n, d = null) => {
    const i = args.indexOf(n)
    return i === -1 ? d : args[i + 1]
  }
  const j6Dir = args.find(
    (a, i) => !a.startsWith('-') && !['--out', '--site-url', '--page-floor', '--article-fields', '--content-params', '--article-posts', '--source-fonts-browser', '--decisions'].includes(args[i - 1])
  )
  const out = flag('--out')
  if (!j6Dir || !out) {
    console.error(
      'usage: from-joomla.mjs <j6-dir> --out <spec-pack-dir> [--site-url http://127.0.0.1:8217] [--force] [--page-floor N] [--article-fields <fields.json>] [--content-params <com_content.json>] [--article-posts <posts.json>] [--source-fonts-browser <measurement.json>] [--decisions <DECISIONS.md>]'
    )
    process.exit(2)
  }
  const floorRaw = flag('--page-floor')
  const pageFloor = floorRaw == null ? PAGE_FLOOR : Number(floorRaw)
  if (!Number.isInteger(pageFloor) || pageFloor < 1) {
    console.error(`--page-floor must be a positive integer; got ${JSON.stringify(floorRaw)}`)
    process.exit(2)
  }
  // A config named on the command line must exist, be a file and parse: a typo is exit 2, not a
  // run that quietly places no field; a directory or a pipe is refused before it is read.
  const configMissing = (name, path) => {
    if (!path || !existsSync(path)) return `${name}: ${path ?? '(no path)'} does not exist`
    return statSync(path).isFile() ? null : `${name}: ${path} is not a file`
  }
  const fieldsPath = flag('--article-fields')
  let articleFields = null
  if (args.includes('--article-fields')) {
    const missing = configMissing('--article-fields', fieldsPath)
    if (missing) {
      console.error(missing)
      process.exit(2)
    }
    try {
      articleFields = JSON.parse(readFileSync(fieldsPath, 'utf8'))
      checkArticleFields(articleFields, { required: true })
    } catch (e) {
      console.error(e.message.startsWith('--article-fields') ? e.message : `--article-fields: ${fieldsPath}: ${e.message}`)
      process.exit(2)
    }
  }
  const paramsPath = flag('--content-params')
  let contentParams
  if (args.includes('--content-params')) {
    const missing = configMissing('--content-params', paramsPath)
    if (missing) {
      console.error(missing)
      process.exit(2)
    }
    try {
      contentParams = checkContentParams(JSON.parse(readFileSync(paramsPath, 'utf8')), `--content-params: ${paramsPath}`)
    } catch (e) {
      console.error(e.message.startsWith('--content-params') ? e.message : `--content-params: ${paramsPath}: ${e.message}`)
      process.exit(2)
    }
  }
  const postsPath = flag('--article-posts')
  let articlePosts = null
  if (args.includes('--article-posts')) {
    const missing = configMissing('--article-posts', postsPath)
    if (missing) {
      console.error(missing)
      process.exit(2)
    }
    try {
      articlePosts = JSON.parse(readFileSync(postsPath, 'utf8'))
      checkArticlePosts(articlePosts, { required: true })
    } catch (e) {
      console.error(e.message.startsWith('--article-posts') ? e.message : `--article-posts: ${postsPath}: ${e.message}`)
      process.exit(2)
    }
  }
  let sourceFontsBrowser = null
  if (args.includes('--source-fonts-browser')) {
    const f = flag('--source-fonts-browser')
    const missing = configMissing('--source-fonts-browser', f)
    if (missing) {
      console.error(missing)
      process.exit(2)
    }
    try {
      sourceFontsBrowser = JSON.parse(readFileSync(f, 'utf8'))
    } catch (e) {
      console.error(`--source-fonts-browser: ${f}: ${e.message}`)
      process.exit(2)
    }
  }
  let decisionsText = null
  if (args.includes('--decisions')) {
    const f = flag('--decisions')
    const missing = configMissing('--decisions', f)
    if (missing) {
      console.error(missing)
      process.exit(2)
    }
    decisionsText = readFileSync(f, 'utf8')
  }
  let result
  try {
    result = buildSpecPack({
      sourceFontsBrowser,
      decisionsText,
      articleFields,
      articlePosts,
      contentParams,
      j6Dir,
      out,
      siteUrl: flag('--site-url', DEFAULT_SITE_URL),
      force: args.includes('--force'),
      pageFloor
    })
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
  const c = result.counts
  const cov = result.coverage
  console.error(
    `from-joomla: ${c.routes} routes → ${c.pages} pages (${c.wpPages} WordPress pages, ${c.gaps} gaps) · ${c.posts} posts · ${c.categories} categories · ${c.menus} menus · ${c.sections} ACM sections (+${c.customModules} custom modules) · ${c.redirects} redirects`
  )
  for (const n of result.notes) console.error(`  note: ${n}`)
  console.error(
    `adapter coverage (${COVERAGE_FILE}): ${cov.total} entities · ${COVERAGE_STATUSES.map((s) => `${cov.byStatus[s]} ${s}`).join(' · ')} · ${cov.critical.count} critical · unsupported/partial affect ${cov.affected.unsupported.routes}/${cov.affected.partial.routes} route(s) (${cov.affected.unsupported.possibleRoutes}/${cov.affected.partial.possibleRoutes} with unknown placement)`
  )
  if (result.validation.ok) {
    console.error(
      `spec-pack OK — ${result.validation.stats.pageCount} pages, kind=${result.validation.stats.kind}, adapter=${result.validation.stats.adapter}`
    )
  } else {
    console.error(`spec-pack INVALID — ${result.validation.problems.length} problem(s):`)
    for (const p of result.validation.problems) console.error(`  - ${p}`)
    process.exit(1)
  }
}
