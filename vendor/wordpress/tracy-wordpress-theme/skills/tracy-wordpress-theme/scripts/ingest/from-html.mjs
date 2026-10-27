#!/usr/bin/env node
// from-html.mjs — an HTML folder (a Claude Design canvas export, a manifest bundle, or a plain
// folder of pages) → the full spec-pack the seeder consumes:
//   page-map.json · content.json · sections.json · menus.json · redirects.json ·
//   design-contract.json · content-contract.json · reference.json · provenance.json · design-spec.md
//
// Three shapes, one output:
//   C — canvas export: any page holds `<x-dc>` + a `text/x-dc` script. The literals are read from
//       the AST (lib/canvas-export.mjs) and every page is bound statically, so EN and RU exist
//       without a browser. With --render, each page is also rendered in Chromium against a local
//       static server (lib/html-render.mjs): the filled DOM replaces the static one, chrome links
//       whose href is `#` are resolved by probing their click handlers, computed styles fill the
//       design contract, and screenshots land in reference/rendered/.
//   A — bundle with manifest.json (pages/ + assets/), B — raw folder: parsed as before
//       (lib/html-bundle.mjs) and now also decomposed into content / sections / menus from the DOM.
//
// Usage:
//   node scripts/ingest/from-html.mjs <dir> --out <spec> [--render | --no-render] [--port N]
//        [--scope website] [--page-floor N] [--single] [--force] [--strict]
//
// What it does NOT do: invent a section type (unknown stays `kind: "html"`), invent a value for a
// binding it cannot resolve (the `{{ … }}` marker stays on the page and is counted), or copy a
// PDF into a page (documents are listed under provenance.gaps). See references/inputs/from-html.md.

import { cp, mkdir, readdir, stat, copyFile, readFile, writeFile } from 'node:fs/promises'
import { existsSync, statSync, readFileSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve, sep, dirname, extname, basename, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { parseBundle, inferView } from '../lib/html-bundle.mjs'
import { convertHtml, checkBlockMarkup, SLOT_BLOCK } from '../lib/html-to-blocks.mjs'
import {
  isCanvasExport,
  splitCanvasPage,
  parseDataScript,
  evaluateComponent,
  bindTemplate,
  localeDictionaries
} from '../lib/canvas-export.mjs'
import {
  normaliseDom,
  extractMenus,
  extractMain,
  listingCards,
  contactFacts,
  siteIdentity,
  pageStats,
  slugify,
  cleanLabel,
  linkLabel,
  textOf
} from '../lib/html-content.mjs'
import { initSpecPack, validateSpecPack, DEFAULT_THEME_HOOK, PAGE_FLOOR } from './spec-pack.mjs'
import { REPORT_FILE, buildReport, BROWSER_SCHEMA } from './source-font.mjs'
import { analyzeDomSourceFonts, domStaticFingerprint } from './dom-source-font.mjs'
import { measureDomPage } from './source-font-browser.mjs'
import { recordPath, repoRootOf } from '../lib/record-paths.mjs'
import { parseDateText, categoryLabel, isFeatured, articleHead } from '../lib/post-content.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const MAKE_DESIGN_SPEC = join(here, '..', 'make-design-spec.mjs')
const ADAPTER = 'from-html'
const ADAPTER_VERSION = '2.0'

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const writeJson = (p, data) => writeFile(p, JSON.stringify(data, null, 2) + '\n')
const firstFamily = (stack) =>
  stack
    ? String(stack)
        .split(',')[0]
        .trim()
        .replace(/^['"]|['"]$/g, '')
    : null

// ── views and paths ───────────────────────────────────────────────────────────

/** Canvas page file name (or `state.page` id) → WordPress view. Order matters: first match wins. */
const NAME_VIEW = [
  [/^(home|index|landing)$/, 'front-page'],
  [/^(news|blog|posts|journal|insights)$/, 'home'],
  [/^(article|post|single|news-detail|blog-post)$/, 'single'],
  [/^(search|search-results)$/, 'search'],
  [/^(404|not-found|error)$/, '404'],
  [/^(contact|contacts|contact-us)$/, 'page-contact'],
  [/^(style-guide|styleguide|guide|kit)$/, 'page-style-guide'],
  [/^(newsletter|email|form|slide|slides|desk|deck)$/, (n) => `page-${n}`]
]
export function viewForName(name) {
  const n = slugify(String(name).replace(/\.html?$/i, ''))
  for (const [re, view] of NAME_VIEW) if (re.test(n)) return typeof view === 'function' ? view(n) : view
  return 'page'
}
/**
 * The sections of a translated page against its default-locale twin's: by the root element's
 * `data-dc-tpl` id when both sides carry one (the canvas export gives every locale the same
 * template ids), else by position when the two pages split into the same number of sections.
 * Pages that split differently pair nothing — the classifier's answer stands there.
 */
export function pairTwinSections(mine, theirs) {
  const tplOf = (s) => /^<[a-z][^>]*\sdata-dc-tpl="(\d+)"/i.exec(s.html ?? '')?.[1] ?? null
  const byTpl = new Map()
  for (const t of theirs) {
    const id = tplOf(t)
    if (id && !byTpl.has(id)) byTpl.set(id, t)
  }
  const pairs = []
  const ids = mine.map(tplOf)
  if (ids.every(Boolean) && new Set(ids).size === ids.length && ids.every((id) => byTpl.has(id))) {
    for (const [i, s] of mine.entries()) pairs.push([s, byTpl.get(ids[i])])
    return pairs
  }
  if (mine.length === theirs.length) for (const [i, s] of mine.entries()) pairs.push([s, theirs[i]])
  return pairs
}

/** The RU copy of `Home.html` is `RU/Home_ru.html`: strip the locale folder and suffix to pair them. */
export function baseName(file, locale) {
  let b = basename(file).replace(/\.html?$/i, '')
  if (locale) b = b.replace(new RegExp(`[_-]${locale}$`, 'i'), '')
  return b
}
export function pathFor(view, name, locale, defaultLocale) {
  const prefix = locale && locale !== defaultLocale ? `/${locale}` : ''
  if (view === 'front-page') return prefix || '/'
  if (view === '404') return `${prefix}/404`
  return `${prefix}/${slugify(name)}`
}

// ── style facts (static): the helmet CSS and inline styles a canvas page carries ──

function cssRule(css, selectorRe) {
  const m = css.match(new RegExp(`(?:^|[}\\s])${selectorRe.source}\\s*\\{([^}]*)\\}`, 'i'))
  if (!m) return {}
  const out = {}
  for (const d of m[1].split(';')) {
    const i = d.indexOf(':')
    if (i > 0) out[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim()
  }
  return out
}
const inlineStyle = (el) => {
  const out = {}
  for (const d of (el?.getAttribute('style') ?? '').split(';')) {
    const i = d.indexOf(':')
    if (i > 0) out[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim()
  }
  return out
}
/** `clamp(38px, 5.4vw, 64px)` at a viewport width → `px` string; plain values pass through. */
export function resolveAtWidth(value, width) {
  if (!value) return null
  const m = String(value).match(/^clamp\(\s*([\d.]+)px\s*,\s*([\d.]+)vw\s*,\s*([\d.]+)px\s*\)$/)
  if (m) return `${Math.round(Math.min(Math.max(+m[1], (+m[2] * width) / 100), +m[3]) * 100) / 100}px`
  if (/^[\d.]+vw$/.test(value)) return `${Math.round((parseFloat(value) * width) / 100)}px`
  return /\b(var|calc|clamp|min|max)\(/.test(value) ? null : String(value)
}
const padTop = (padding) => padding?.split(/\s+/)[0] ?? null
const padBottom = (padding) => {
  const p = padding?.split(/\s+/) ?? []
  return p.length >= 3 ? p[2] : (p[0] ?? null)
}

/**
 * Style facts from a static canvas DOM: the helmet CSS (body / a / dark remaps) and inline styles
 * of the first h1, h2, first main section and the header CTA. Same shape the renderer measures.
 */
function staticStyleFacts(doc, css, widths = [1440, 390]) {
  const body = cssRule(css, /body/)
  const darkBody = cssRule(css, /html\[data-theme=["']?dark["']?\]\s*body/)
  const link = cssRule(css, /a/)
  const darkLink = cssRule(css, /html\[data-theme=["']?dark["']?\]\s*a/)
  const hover = cssRule(css, /a:hover/)
  const main = doc.querySelector('main, [role="main"]') ?? doc.body
  const section = main.querySelector(':scope > section') ?? main.querySelector(':scope > div') ?? main
  const rhythm = (width) => {
    const seen = new Map()
    for (const sec of main.querySelectorAll(':scope > section, :scope > div')) {
      const tops = [sec, ...[...sec.children].slice(0, 2)].map((e) => parseFloat(resolveAtWidth(padTop(inlineStyle(e).padding), width) ?? '0') || 0)
      const top = Math.max(...tops)
      if (top > 0) seen.set(top, (seen.get(top) ?? 0) + 1)
    }
    const v = [...seen.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0]
    return v == null ? null : `${v}px`
  }
  const h1 = doc.querySelector('h1')
  const h2 = doc.querySelector('h2')
  const p = main.querySelector('p')
  const cta = [...doc.querySelectorAll('header a, header button')].find((a) => /background/.test(a.getAttribute('style') ?? '') && a.textContent.trim())
  const widthsSeen = new Map()
  for (const el of main.querySelectorAll('[style*="max-width"]')) {
    const w = inlineStyle(el)['max-width']
    if (/^\d+px$/.test(w ?? '')) widthsSeen.set(w, (widthsSeen.get(w) ?? 0) + 1)
  }
  const container = [...widthsSeen.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const type = (el, width, fallbackFamily) => {
    if (!el) return null
    const s = inlineStyle(el)
    return {
      fontFamily: s['font-family'] ?? fallbackFamily ?? null,
      fontSize: resolveAtWidth(s['font-size'], width),
      fontWeight: s['font-weight'] ?? null,
      lineHeight: resolveAtWidth(s['line-height'], width),
      letterSpacing: s['letter-spacing'] ?? null,
      color: s.color ?? null
    }
  }
  const facts = {}
  for (const mode of ['light', 'dark']) {
    for (const width of widths) {
      const b = mode === 'dark' ? { ...body, ...darkBody } : body
      const a = mode === 'dark' ? { ...link, ...darkLink } : link
      const secStyle = inlineStyle(section)
      const ctaStyle = inlineStyle(cta)
      facts[`${width}-${mode}`] = {
        measured: false,
        body: {
          color: b.color ?? null,
          backgroundColor: b.background ?? b['background-color'] ?? null,
          fontFamily: b['font-family'] ?? null,
          fontSize: resolveAtWidth(b['font-size'], width) ?? '16px',
          lineHeight: resolveAtWidth(b['line-height'], width) ?? null
        },
        h1: type(h1, width, b['font-family']),
        h2: type(h2, width, b['font-family']),
        p: type(p, width, b['font-family']),
        link: { color: a.color ?? null },
        accent: hover.color ?? null,
        section: { paddingTop: rhythm(width), paddingBottom: rhythm(width), backgroundColor: secStyle.background ?? null },
        button: cta
          ? {
              backgroundColor: ctaStyle.background ?? ctaStyle['background-color'] ?? null,
              color: ctaStyle.color ?? null,
              paddingTop: padTop(ctaStyle.padding),
              paddingRight: ctaStyle.padding?.split(/\s+/)[1] ?? padTop(ctaStyle.padding),
              paddingBottom: padBottom(ctaStyle.padding),
              paddingLeft: ctaStyle.padding?.split(/\s+/)[3] ?? ctaStyle.padding?.split(/\s+/)[1] ?? padTop(ctaStyle.padding),
              borderRadius: ctaStyle['border-radius'] ?? '0px',
              fontSize: ctaStyle['font-size'] ?? null,
              fontWeight: ctaStyle['font-weight'] ?? null
            }
          : null,
        buttonText: cta ? cta.textContent.trim() : null,
        container
      }
    }
  }
  return facts
}

/** Style facts from a plain folder: the largest stylesheet's `:root` palette via html-bundle, nothing measured. */
function paletteFacts(pageMap, widths = [1440, 390]) {
  const pal = pageMap.theme?.palette ?? {}
  const fonts = pageMap.theme?.fonts ?? {}
  const facts = {}
  for (const mode of ['light', 'dark']) {
    const p = mode === 'dark' ? (pal.dark ?? pal.light ?? {}) : (pal.light ?? {})
    for (const width of widths)
      facts[`${width}-${mode}`] = {
        measured: false,
        body: { color: p.text ?? null, backgroundColor: p.body_bg ?? null, fontFamily: fonts.body ?? null, fontSize: '16px', lineHeight: null },
        h1: fonts.heading ? { fontFamily: fonts.heading, fontSize: null, fontWeight: null, lineHeight: null, letterSpacing: null, color: null } : null,
        h2: null,
        p: null,
        link: { color: p.primary ?? null },
        accent: p.secondary ?? null,
        section: { paddingTop: null, paddingBottom: null, backgroundColor: null },
        button: null,
        buttonText: null,
        container: null
      }
  }
  return facts
}

// ── the design contract from style facts ──────────────────────────────────────

const VARIANTS = [
  { id: 'desktop-light', mode: 'light', width: 1440, height: 900, key: '1440-light' },
  { id: 'desktop-dark', mode: 'dark', width: 1440, height: 900, key: '1440-dark' },
  { id: 'mobile-light', mode: 'light', width: 390, height: 844, key: '390-light' },
  { id: 'mobile-dark', mode: 'dark', width: 390, height: 844, key: '390-dark' }
]
const clean = (obj) => Object.fromEntries(Object.entries(obj ?? {}).filter(([, v]) => v != null && v !== '' && !/\b(var|calc)\(/.test(String(v))))

function buildDesignContract({ facts, slug, source, pages, pilot, measured }) {
  const F = (v) => facts[v.key] ?? {}
  const tokens = Object.fromEntries(
    VARIANTS.map((v) => {
      const f = F(v)
      return [
        v.id,
        clean({
          '--font-body': f.body?.fontFamily,
          '--font-heading': f.h1?.fontFamily ?? f.body?.fontFamily,
          '--color-bg': f.body?.backgroundColor,
          '--color-text': f.body?.color,
          '--color-link': f.link?.color,
          '--color-primary': f.button?.backgroundColor ?? f.link?.color,
          '--color-accent': f.accent,
          '--text-base': f.body?.fontSize,
          '--text-h1': f.h1?.fontSize,
          '--text-h2': f.h2?.fontSize,
          '--section-y': f.section?.paddingTop,
          '--container-max': f.container
        })
      ]
    })
  )
  const rules = []
  const pending = []
  const per = (fn) => {
    const styles = Object.fromEntries(VARIANTS.map((v) => [v.id, clean(fn(F(v)))]))
    return Object.values(styles).every((s) => Object.keys(s).length) ? styles : null
  }
  const add = (id, category, selector, fn) => {
    const styles = per(fn)
    if (styles) rules.push({ id, category, selector, styles })
    return Boolean(styles)
  }
  add('body-type', 'typography', 'body', (f) => ({ fontFamily: f.body?.fontFamily, fontSize: f.body?.fontSize }))
  add('heading-1', 'typography', 'h1', (f) => ({ fontFamily: f.h1?.fontFamily, fontSize: f.h1?.fontSize, fontWeight: f.h1?.fontWeight }))
  add('body-colors', 'color', 'body', (f) => ({ color: f.body?.color, backgroundColor: f.body?.backgroundColor }))
  add('link-color', 'color', 'main a', (f) => ({ color: f.link?.color }))
  add('section-rhythm', 'layout', 'main > section, main > .wp-block-group', (f) => ({ paddingTop: f.section?.paddingTop, paddingBottom: f.section?.paddingBottom }))
  add('container-width', 'layout', 'main > section > div, .wp-block-group.alignwide', (f) => ({ maxWidth: f.container }))
  add('primary-button', 'component', '.wp-block-button__link, header a.button', (f) => ({
    backgroundColor: f.button?.backgroundColor,
    color: f.button?.color,
    paddingTop: f.button?.paddingTop,
    paddingLeft: f.button?.paddingLeft,
    borderRadius: f.button?.borderRadius
  }))
  for (const c of ['typography', 'color', 'layout', 'component'])
    if (!rules.some((r) => r.category === c)) pending.push(`no ${c} rule could be read from the source${measured ? '' : ' without --render'}`)
  const ruleIds = rules.map((r) => r.id)
  const required = rules.filter((r) => r.category === 'color').map((r) => r.id)
  return {
    schemaVersion: 1,
    id: slug,
    revision: 1,
    source,
    theme: { ...DEFAULT_THEME_HOOK },
    variants: VARIANTS.map(({ id, mode, width, height }) => ({ id, mode, width, height })),
    tokens,
    rules,
    coverage: [
      { selector: 'body', properties: ['color', 'backgroundColor', 'fontFamily', 'fontSize'] },
      { selector: 'h1', properties: ['fontFamily', 'fontSize', 'fontWeight'] },
      { selector: 'main > section', properties: ['paddingTop', 'paddingBottom'] }
    ],
    pages: pages.map((p) => ({ id: p.file, url: p.url, expectedUrl: p.url, identity: 'main', rules: ruleIds, requiredRules: required })),
    pilotPages: [pilot],
    exceptions: [],
    pending
  }
}

// ── design-spec slot filling ──────────────────────────────────────────────────

const code = (v) => (v == null || v === '' ? null : `\`${v}\``)
function fillDesignSpec(md, { facts, pages, slug, sourceKind, sectionsByFile, hook }) {
  const L = facts['1440-light'] ?? {}
  const D = facts['1440-dark'] ?? {}
  const M = facts['390-light'] ?? {}
  const unresolved = []
  const none = (what) => {
    unresolved.push(what)
    return `not declared in the source (${what}) — measure at Phase 6`
  }
  const pair = (l, d, what) => `${code(l) ?? none(`${what} light`)} | ${code(d ?? l) ?? none(`${what} dark`)}`
  const lines = md.split('\n').map((line) => {
    if (line.startsWith('- **Dark hook')) return `- **Dark hook (\`<DARK>\`):** \`${hook}\` — ${sourceKind === 'canvas-export' ? 'the export toggles `data-theme` on `<html>` and its helmet CSS remaps `body`/`a` under `html[data-theme="dark"]`' : 'the source declares no dark mode; the theme adds the hook and derives dark at Phase 6'}`
    if (line.startsWith('- **Class prefix')) return `- **Class prefix:** \`${slug}-\` (block classes stay \`wp-block-*\`)`
    if (line.startsWith('| `border` |')) return `| \`border\` | ${none('border light')} | ${none('border dark')} | faint divider — the export draws borders inline (\`#DCD7CC\`-style values in \`style=\`), read them off the reference |`
    if (line.startsWith('| `heading` |')) return `| \`heading\` | ${pair(L.h1?.color, D.h1?.color, 'heading colour')} | first \`h1\` colour${L.measured ? ' (computed)' : ' (inline style; may be a band colour)'} |`
    if (line.startsWith('| `surface` |')) return `| \`surface\` | ${pair(L.section?.backgroundColor, D.section?.backgroundColor, 'surface')} | first section background${L.measured ? ' (computed)' : ''} |`
    if (line.startsWith('- **h1–h6 size')) return `- **h1–h6 size / weight / line-height:** h1 ${code(L.h1?.fontSize) ?? none('h1 size')} / ${code(L.h1?.fontWeight) ?? '?'} / ${code(L.h1?.lineHeight) ?? '?'} · h2 ${code(L.h2?.fontSize) ?? none('h2 size')} / ${code(L.h2?.fontWeight) ?? '?'} · mobile h1 ${code(M.h1?.fontSize) ?? '?'} (${L.measured ? 'computed at 1440 / 390 on the reference' : 'inline styles, clamp() resolved at 1440 / 390'})`
    if (line.startsWith('- **Body size')) return `- **Body size / line-height / letter-spacing:** ${code(L.body?.fontSize) ?? none('body size')} / ${code(L.body?.lineHeight ?? L.p?.lineHeight) ?? none('body line-height')} / \`normal\``
    if (line.startsWith('- **Section vertical rhythm')) return `- **Section vertical rhythm (full-width group top/bottom padding):** ${code(L.section?.paddingTop) ?? none('section rhythm')} desktop · ${code(M.section?.paddingTop) ?? '?'} phone (first \`main > section\`)`
    if (line.startsWith('- **Content width')) return `- **Content width (\`settings.layout.contentSize\`):** ${code(L.container) ?? none('content width')} · **Wide width (\`wideSize\`):** ${code(L.container) ?? none('wide width')} (the export uses one container) · **Card internal padding:** ${none('card padding')}`
    const pal = line.match(/^(\| `(?:primary|secondary|body_bg|text)` \| [^|]+\| )`TODO`( \|.*)$/)
    if (pal) return `${pal[1]}derived at Phase 6 (\`theme.darkDerived\`)${pal[2]}`
    const row = line.match(/^\| `([^`]+)` \| `([^`]+)` \| `([^`]*)` \| `TODO` \|$/)
    if (row) {
      const page = pages.find((p) => p.file === row[1])
      const secs = sectionsByFile.get(row[1]) ?? []
      const list = secs.map((s) => `${s.index}:${s.type ?? 'html'}${s.images.length ? `(${s.images.length} img)` : ''}`).join(', ')
      return `| \`${row[1]}\` | \`${row[2]}\` | \`${row[3]}\` | ${page?.reference ?? '?'}${page?.synthetic ? ' (synthetic — stands in for the required view)' : ''}${list ? ` · sections: ${list}` : ' · no sections (block markup)'} · images: \`assets/img/\` |`
    }
    return line
  })
  return { md: lines.join('\n'), unresolved }
}

// ── build ─────────────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set(['node_modules', '.git', '.teamshare', 'assets', 'css', 'js', 'img', 'images', 'fonts', 'decks'])
async function walkHtml(dir, base = dir, depth = 0, acc = []) {
  for (const entry of (await readdir(dir)).sort()) {
    if (entry.startsWith('.')) continue
    const abs = join(dir, entry)
    const info = await stat(abs)
    if (info.isDirectory()) {
      if (depth < 2 && !SKIP_DIRS.has(entry.toLowerCase())) await walkHtml(abs, base, depth + 1, acc)
      continue
    }
    if (extname(entry).toLowerCase() !== '.html' || info.size < 300) continue
    acc.push(relative(base, abs).split(sep).join('/'))
  }
  return acc
}

/**
 * Build the whole pack. Returns `{ counts, validation, notes, gaps }`.
 * @param {{ src: string, out: string, render?: boolean, port?: number, scope?: 'template'|'website', force?: boolean, single?: boolean, pageFloor?: number, now?: string, log?: Function }} opts
 */
/**
 * `menus.json` entries and the synthesised footer blocks from the menus `extractMenus` read per
 * locale. The header nav is `tracy`, everything else keeps its `extractMenus` id; a secondary
 * locale appends `-<locale>`. Two rules the theme depends on (D11: a menu is swapped by language
 * through `<default menutype>-<lang>`):
 *
 * - A footer column of a secondary locale takes the menutype of the default locale's column at
 *   the same ordinal (`footer-company-ru`, not `footer-компания-ru` from its translated heading);
 *   its title stays the translation. A column with no counterpart falls back to its own slug and
 *   says so in `notes`.
 * - A footer column with a heading is a named menu and nothing else. Only a heading-less column
 *   becomes a `footnav-<n>` block (n = its column ordinal) — the old shape doubled every named
 *   column as a `tracy-footer-N` post no template reads.
 */
export function buildMenus(menusByLocale, { locales, defaultLocale, fileByPath }) {
  const menus = []
  const footerCustoms = []
  const notes = []
  const defaultColumns = new Map((menusByLocale.get(defaultLocale) ?? []).filter((m) => m.column).map((m) => [m.column.n, m]))
  for (const loc of locales) {
    const suffix = loc === defaultLocale ? '' : `-${loc}`
    for (const m of menusByLocale.get(loc) ?? []) {
      let base = m.id
      if (m.region === 'header') base = 'tracy'
      else if (m.column && suffix) {
        const twin = defaultColumns.get(m.column.n)
        if (twin) base = twin.id
        else notes.push(`${loc}: footer column ${m.column.n} "${m.title}" has no ${defaultLocale} column to pair with; menutype "${m.id}${suffix}" comes from its own heading`)
      }
      const menutype = `${base}${suffix}`
      const mapItem = (item, i) => {
        const page = item.href ? fileByPath.get(item.href.split('#')[0]) : null
        return {
          id: `${menutype}-${i + 1}`,
          label: item.label,
          type: page ? 'page' : item.href ? 'url' : 'heading',
          url: item.href ?? null,
          page: page?.file ?? null,
          view: page?.view ?? null,
          published: true,
          children: (item.children ?? []).map((c, j) => ({ id: `${menutype}-${i + 1}-${j + 1}`, label: c.label, type: fileByPath.get(c.url) ? 'page' : 'url', url: c.url, page: fileByPath.get(c.url)?.file ?? null, view: fileByPath.get(c.url)?.view ?? null, published: true, children: [] }))
        }
      }
      menus.push({ menutype, title: m.title + (suffix ? ` (${loc.toUpperCase()})` : ''), region: m.region, locale: loc, items: m.items.map(mapItem) })
      if (m.column && !m.column.named && m.items.length) {
        const n = m.column.n
        const html = `<h3>${m.title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</h3>\n<ul>\n${m.items.filter((i) => i.href).map((i) => `<li><a href="${i.href}">${i.label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</a></li>`).join('\n')}\n</ul>`
        const conv = convertHtml(html)
        footerCustoms.push({ id: `footnav-${n}${suffix}`, title: `Footer · ${m.title}`, position: `footnav-${n}`, scope: 'footer', ordering: n, showtitle: false, sectionType: null, locale: loc, pages: ['ALL'], html, blocks: conv.markup, images: [] })
      }
    }
  }
  return { menus, footerCustoms, notes }
}

export async function buildSpecPack({ src, out, render = false, port = 0, scope = 'template', force = false, single = false, pageFloor = PAGE_FLOOR, now = new Date().toISOString(), log = () => {}, packKind = 'html', adapter = ADAPTER, provenanceSource = null, redirectRules = [] }) {
  // The design folder is named by an absolute path from here on: what the pack records of it (page-map and provenance
  // source, serve.dir, the contracts' source reference) must not depend on the directory the adapter was started in.
  src = resolve(src)
  const normalizeRoutePath = (routePath) => routePath === '/' ? '/' : routePath.replace(/\/+$/, '') || '/'
  redirectRules = redirectRules.map((rule) => ({
    ...rule,
    from: normalizeRoutePath(rule.from),
    to: normalizeRoutePath(rule.to)
  }))
  const notes = []
  const gaps = []
  const gap = (code, detail, items = null) => gaps.push({ code, detail, ...(items ? { items } : {}) })
  const hasManifest = !single && existsSync(join(src, 'manifest.json'))
  const htmlFiles = await walkHtml(hasManifest ? join(src, 'pages') : src)
  const canvasFiles = []
  for (const f of htmlFiles) if (isCanvasExport(await readFile(join(hasManifest ? join(src, 'pages') : src, f), 'utf8'))) canvasFiles.push(f)
  const kind = canvasFiles.length ? 'canvas-export' : hasManifest ? 'html-bundle' : 'html-folder'
  const shape = kind === 'canvas-export' ? 'C (Claude Design canvas export)' : hasManifest ? 'A (manifest bundle)' : 'B (raw folder)'
  const pagesDir = hasManifest ? join(src, 'pages') : src
  log(`from-html: shape ${shape}`)

  // ── pages: file, locale, id, view, path ───────────────────────────────────
  const pages = [] // { file, id, locale, title, view, path, translationOf, translations, html (raw), canvas }
  let defaultLocale = 'en'
  let bundleMap = null
  if (kind === 'canvas-export') {
    if (canvasFiles.length !== htmlFiles.length)
      notes.push(`${htmlFiles.length - canvasFiles.length} page file(s) are not canvas pages and were skipped: ${htmlFiles.filter((f) => !canvasFiles.includes(f)).join(', ')}`)
    const parsedPages = []
    for (const file of canvasFiles) {
      const html = await readFile(join(pagesDir, file), 'utf8')
      const split = splitCanvasPage(html)
      parsedPages.push({ file, html, split, locale: split.locale ?? 'en', id: split.page ?? baseName(file, split.locale) })
    }
    const rootLocales = parsedPages.filter((p) => !p.file.includes('/')).map((p) => p.locale)
    defaultLocale = rootLocales.sort((a, b) => rootLocales.filter((x) => x === b).length - rootLocales.filter((x) => x === a).length)[0] ?? parsedPages[0]?.locale ?? 'en'
    for (const p of parsedPages) {
      const name = baseName(p.file, p.locale)
      const view = viewForName(name)
      pages.push({
        file: p.file,
        id: p.id,
        locale: p.locale,
        title: p.split.title,
        name,
        view,
        path: pathFor(view, name, p.locale, defaultLocale),
        canvas: p.split,
        html: p.html
      })
    }
  } else {
    bundleMap = await parseBundle(src, { single })
    for (const p of bundleMap.pages ?? []) {
      const abs = contained(pagesDir, p.file)
      if (!abs) {
        console.error(`ERROR: page "${p.file}" resolves outside the bundle or the spec-pack — refusing to copy it`)
        continue
      }
      if (!existsSync(abs)) {
        console.error(`WARNING: page-map lists "${p.file}" but it is not on disk — Phase 8 will have nothing to diff it against`)
        continue
      }
      const html = await readFile(abs, 'utf8')
      const name = baseName(p.file, null)
      const view = p.path === '/' ? 'front-page' : (p.view ?? inferView(p.file, html))
      const manifestPath = p.path == null ? null : normalizeRoutePath(p.path)
      pages.push({ file: p.file, sourceFile: hasManifest ? join('pages', p.file) : p.file, sourceUrl: p.url ?? p.sourceUrl ?? null, id: name, locale: defaultLocale, title: new JSDOM(html).window.document.title, name, view, path: manifestPath ?? pathFor(view, name, defaultLocale, defaultLocale), manifestPath: manifestPath != null, html, layout: p.layout ?? null })
    }
  }
  if (!pages.length) throw new Error(`no usable pages found in ${src}`)
  const pathOwners = new Map()
  for (const p of pages) {
    const owner = pathOwners.get(p.path)
    if (owner) throw new Error(`pages "${owner}" and "${p.file}" resolve to the same path ${JSON.stringify(p.path)}`)
    pathOwners.set(p.path, p.file)
  }
  const pathLocales = new Set(pages.filter((p) => p.manifestPath).map((p) => p.locale))
  for (const locale of pathLocales) {
    const localePages = pages.filter((p) => p.locale === locale)
    const front = localePages.find((p) => p.path === '/') ?? localePages.find((p) => p.view === 'front-page')
    if (!front) continue
    for (const p of localePages) p.view = p === front ? 'front-page' : (p.view === 'front-page' ? 'page' : p.view)
  }
  const locales = [...new Set(pages.map((p) => p.locale))].sort((a, b) => (a === defaultLocale ? -1 : b === defaultLocale ? 1 : a.localeCompare(b)))
  // Pair translations by page id (canvas `state.page`) or base name.
  const byId = new Map()
  for (const p of pages) {
    if (!byId.has(p.id)) byId.set(p.id, {})
    byId.get(p.id)[p.locale] = p.file
  }
  for (const p of pages) {
    p.translations = Object.fromEntries(Object.entries(byId.get(p.id)).filter(([l]) => l !== p.locale))
    p.translationOf = p.locale === defaultLocale ? null : (byId.get(p.id)[defaultLocale] ?? null)
    if (p.locale !== defaultLocale && !p.translationOf) notes.push(`${p.file} (${p.locale}) has no ${defaultLocale} counterpart`)
  }
  const fileByPath = new Map(pages.map((p) => [p.path, p]))
  const pageByFile = new Map(pages.map((p) => [p.file, p]))
  const pathOf = (rel) => pageByFile.get(rel)?.path ?? null

  // ── static DOMs ───────────────────────────────────────────────────────────
  const canvasNotes = { unresolved: new Map(), unsupported: [], data: null, locales: [] }
  for (const p of pages) {
    if (p.canvas) {
      const parsed = parseDataScript(p.canvas.script)
      if (!canvasNotes.data) {
        canvasNotes.data = parsed.data
        canvasNotes.unsupported = parsed.unsupported
        canvasNotes.locales = Object.keys(localeDictionaries(parsed.data))
      }
      const ev = evaluateComponent(parsed, { props: p.canvas.props })
      const bound = bindTemplate(p.canvas.template, ev.vals, { title: p.canvas.title, head: p.canvas.helmet, lang: p.locale })
      p.staticHtml = bound.html
      for (const u of bound.unresolved) canvasNotes.unresolved.set(u.expr, (canvasNotes.unresolved.get(u.expr) ?? 0) + u.count)
      p.evalUnresolved = ev.unresolved.length
    } else p.staticHtml = p.html
  }

  // ── reference copies ──────────────────────────────────────────────────────
  // A dossier keeps these two out of the repo by symlinking them into an evidence dir; cp() refuses
  // to write through a symlink ("cannot overwrite non-directory"), so resolve them to the real dir.
  await mkdir(join(out, 'reference'), { recursive: true })
  await mkdir(join(out, 'assets'), { recursive: true })
  const refDir = realpathSync(resolve(out, 'reference'))
  const assetsDir = realpathSync(resolve(out, 'assets'))
  const copied = []
  if (kind === 'canvas-export') {
    // The whole tree: a canvas page needs its runtime, image-slot element and img/ beside it.
    await cp(src, refDir, {
      recursive: true,
      filter: (p) => {
        const b = basename(p)
        return !b.startsWith('.') && b !== 'node_modules'
      }
    })
    for (const p of pages) copied.push(p.file)
    for (const d of ['img', 'images', 'decks']) if (existsSync(join(src, d))) await cp(join(src, d), join(assetsDir, d), { recursive: true })
  } else {
    for (const page of pages) {
      const from = contained(pagesDir, page.file)
      const to = contained(refDir, page.file)
      if (!from || !to) {
        console.error(`ERROR: page "${page.file}" resolves outside the bundle or the spec-pack — refusing to copy it`)
        continue
      }
      await mkdir(dirname(to), { recursive: true })
      await copyFile(from, to)
      copied.push(page.file)
    }
    if (existsSync(join(src, 'assets'))) await cp(join(src, 'assets'), assetsDir, { recursive: true })
    else {
      const KEEP = new Set(['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif', '.woff', '.woff2', '.ttf', '.otf', '.ico'])
      for (const entry of await readdir(src)) {
        const abs = join(src, entry)
        const info = await stat(abs).catch(() => null)
        if (!info) continue
        if (info.isDirectory() && ['css', 'js', 'images', 'img', 'fonts', 'assets'].includes(entry.toLowerCase())) {
          await cp(abs, join(assetsDir, entry), { recursive: true })
          await cp(abs, join(refDir, entry), { recursive: true })
        } else if (info.isFile() && KEEP.has(extname(entry).toLowerCase())) await copyFile(abs, join(refDir, entry))
      }
    }
  }
  await mkdir(join(refDir, 'static'), { recursive: true })
  for (const p of pages) {
    const to = join(refDir, 'static', p.file)
    await mkdir(dirname(to), { recursive: true })
    await writeFile(to, p.staticHtml)
  }

  // ── render ────────────────────────────────────────────────────────────────
  let served = null
  const rendered = new Map()
  const probedByLocale = new Map()
  const sourceFontsStatic = await analyzeDomSourceFonts({ pages: pages.map((p) => ({ file: p.sourceFile ?? p.file, route: p.path, baseUrl: p.sourceUrl })), root: src, stylesheetMap: existsSync(join(src, 'stylesheet-map.json')) ? readJson(join(src, 'stylesheet-map.json')) : null })
  let sourceFontsBrowser = null
  if (render) {
    const { serveStatic, renderSite } = await import('../lib/html-render.mjs')
    served = await serveStatic(pagesDir, { port })
    log(`serving ${pagesDir} at ${served.origin}`)
    const frontOf = new Map()
    for (const p of pages) if (!frontOf.has(p.locale) && p.view === 'front-page') frontOf.set(p.locale, p.file)
    for (const p of pages) if (!frontOf.has(p.locale)) frontOf.set(p.locale, p.file)
    try {
      const results = await renderSite({
        origin: served.origin,
        pages: pages.map((p) => ({ file: p.file, route: p.path, sourceFile: p.sourceFile ?? p.file })),
        outDir: refDir,
        probe: true,
        probePages: new Set(frontOf.values()),
        fontProbe: measureDomPage,
        log
      })
      for (const r of results) {
        rendered.set(r.file, r)
        const p = pageByFile.get(r.file)
        if (r.booted) p.renderedHtml = readFileSync(join(refDir, r.snapshot), 'utf8')
        else notes.push(`${r.file}: the browser render never filled (${r.errors[0] ?? 'no text'}); the static binding stands in`)
        if (r.probed?.length && frontOf.get(p.locale) === r.file) probedByLocale.set(p.locale, r.probed)
      }
      for (const row of sourceFontsStatic.pages) row.referenceUrl = new URL(`/${row.file.replace(/^pages\//, '').split('/').map(encodeURIComponent).join('/')}`, `${served.origin}/`).href
      sourceFontsStatic.fingerprint = domStaticFingerprint(sourceFontsStatic)
      const hashByFile = new Map(sourceFontsStatic.pages.map((p) => [p.file, p.htmlSha256]))
      sourceFontsBrowser = { schema: BROWSER_SCHEMA, site: served.origin, static: { fingerprint: sourceFontsStatic.fingerprint }, widths: [1440, 390], measuredAt: now, pages: results.flatMap((r) => (r.fontPages ?? []).map((p) => ({ ...p, htmlSha256: hashByFile.get(p.file) ?? null }))), unresolved: [], plan: pages.map((p) => ({ route: p.path, kind: p.path === '/' ? 'home' : 'extra', styleId: null, template: null })) }
    } finally {
      await served.close()
    }
    const skeletons = [...rendered.values()].filter((r) => !r.booted).length
    if (skeletons) gap('render-skeleton', `${skeletons} page(s) never filled in the browser (network? runtime?) and use the static binding`, [...rendered.values()].filter((r) => !r.booted).map((r) => r.file))
  }

  // ── extraction per page ───────────────────────────────────────────────────
  const sectionsByFile = new Map()
  const allImages = new Map()
  const allAssets = new Map()
  const deadLinks = new Map()
  const menusByLocale = new Map()
  let identity = null
  const contactByLocale = new Map()
  const docs = new Map()
  for (const p of pages) {
    const doc = new JSDOM(p.renderedHtml ?? p.staticHtml).window.document
    p.fromRender = Boolean(p.renderedHtml)
    // Probe results: the `#` anchors of the chrome, resolved to files → paths, on the page they were probed on.
    const probed = probedByLocale.get(p.locale)
    if (probed) {
      const toPath = (target) => {
        if (!target) return null
        const rel = decodeURIComponent(new URL(target).pathname.replace(/^\//, ''))
        return pathOf(rel) ?? (rel && /\.(pdf|docx?|zip)$/i.test(rel) ? `/wp-content/uploads/${rel.split('/').pop()}` : null)
      }
      for (const a of doc.querySelectorAll('[data-probe]')) {
        const hit = probed.find((x) => x.id === a.getAttribute('data-probe'))
        if (!hit) continue
        const path = toPath(hit.target)
        if (path) a.setAttribute('href', path)
        if (hit.children?.length) a.setAttribute('data-children', JSON.stringify(hit.children.map((c) => ({ label: cleanLabel(c.label), url: toPath(c.target) })).filter((c) => c.url && c.label)))
      }
    }
    const norm = normaliseDom(doc, { file: p.file, pathOf })
    for (const img of norm.images) if (!allImages.has(img.original)) allImages.set(img.original, img)
    for (const a of norm.assets) if (!allAssets.has(a.original)) allAssets.set(a.original, a)
    p.stats = pageStats(doc)
    p.links = norm.links
    if (!identity && p.view === 'front-page' && p.locale === defaultLocale) identity = siteIdentity(doc)
    if (!menusByLocale.has(p.locale) && (p.view === 'front-page' || !pages.some((q) => q.locale === p.locale && q.view === 'front-page'))) {
      const menus = extractMenus(doc)
      for (const m of menus) {
        const kept = []
        for (const item of m.items) {
          // Kept: a WordPress path (resolved page or upload) or an absolute URL. `#`, and a
          // relative href no page answers to, are dead for the menu and listed as a gap.
          if (item.href && /^(\/|https?:|mailto:|tel:)/i.test(item.href)) kept.push(item)
          else deadLinks.set(`${m.id}:${item.label}${item.href && item.href !== '#' ? ` (${item.href})` : ''}`, 1)
        }
        m.items = kept
      }
      // Children revealed by a panel (mega menu), attached to the toggle anchor by the probe. A
      // panel whose links are only the front pages of the locales is the language switcher.
      const fronts = new Set(pages.filter((q) => q.view === 'front-page').map((q) => q.path))
      for (const a of doc.querySelectorAll('[data-children]')) {
        const children = JSON.parse(a.getAttribute('data-children'))
        const label = linkLabel(a)
        if (children.length && children.every((c) => fronts.has(c.url))) {
          notes.push(`${p.locale}: "${label}" is the language switcher (${children.map((c) => c.label).join(' / ')}); not a menu`)
          continue
        }
        const region = a.closest('header, [role="banner"]') ? 'header' : a.closest('footer, [role="contentinfo"]') ? 'footer' : 'topbar'
        const menu = menus.find((m) => m.region === region && (region !== 'footer' || m.items.some((i) => i.label === label))) ?? menus.find((m) => m.region === region)
        if (menu && children.length) menu.items.push({ label, href: null, children })
      }
      menusByLocale.set(p.locale, menus.filter((m) => m.items.length))
    }
    const main = extractMain(doc, { idPrefix: `${slugify(p.name)}-${p.locale}`, view: p.view })
    p.main = main
    p.h1 = textOf(doc.querySelector('h1')) || null
    sectionsByFile.set(p.file, main.sections)
    if (p.view === 'home' || p.view === 'category') p.cards = listingCards(doc)
    if (p.view === 'single') {
      const article = doc.querySelector('main article, article') ?? doc.querySelector('main') ?? doc.body
      p.articleHtml = article.innerHTML
      p.articleMeta = [...article.querySelectorAll('*')].filter((e) => !e.children.length).map((e) => e.textContent.trim()).find((t) => /\b(20\d\d)\b/.test(t) && t.length < 60) ?? null
      p.featured = norm.images.find((i) => article.querySelector(`img[src="${i.src}"]`)) ?? null
    }
    if (p.view === 'page-contact') contactByLocale.set(p.locale, contactFacts(doc))
    docs.set(p.file, doc)
  }
  // ── section types follow the default-locale twin ─────────────────────────
  // A translated page is the same layout with other words: the canvas export binds one template
  // per page for every locale, so its sections carry the same `data-dc-tpl` ids. The classifier
  // reads words — keywords, figures — and words differ by language: RU «Информация для
  // акционеров» matched `форм` and the IR intro became a request form; «Отчётность и
  // презентации» matched `презентац` and became a slide deck; dates «30.10.2026» counted as
  // figures and the investor calendar became stats — none of which the EN twin is. The type is
  // a property of the layout, so the twin's type stands; a page without a twin keeps the
  // classifier's answer.
  for (const p of pages) {
    if (!p.translationOf || !p.main?.sections?.length) continue
    const twin = pageByFile.get(p.translationOf)
    if (!twin?.main?.sections?.length) continue
    for (const [mine, theirs] of pairTwinSections(p.main.sections, twin.main.sections)) {
      if (mine.type === theirs.type || mine.type === 'breadcrumb' || theirs.type === 'breadcrumb') continue
      notes.push(`${p.file}: section ${mine.index} "${mine.title}" reads as ${mine.type ?? 'html'} by its words, ${theirs.type ?? 'html'} on its ${twin.locale} twin (${twin.file} section ${theirs.index}); the twin's type stands`)
      mine.type = theirs.type
    }
  }
  identity ??= siteIdentity(docs.get(pages[0].file))
  const themeSlug = (bundleMap?.template?.name ?? slugify(identity.fullName ?? identity.name ?? basename(src)).replace(/[^a-z0-9-]/g, '')) || 'site'
  const slug = /^[a-z][a-z0-9-]*$/.test(themeSlug) ? themeSlug : `site-${themeSlug.replace(/^[^a-z]+/, '') || 'x'}`

  // ── content: pages, posts, archives, sections ─────────────────────────────
  const wpPages = []
  const posts = []
  const archives = []
  const customSections = []
  const untyped = []
  const markupProblems = []
  const check = (markup, where) => {
    const c = checkBlockMarkup(markup)
    if (!c.ok) markupProblems.push(`${where}: ${c.problems.join('; ')}`)
  }
  const pageMapPages = []
  const referencePages = []
  const VIEW_IS_PAGE = (v) => v === 'front-page' || v === 'page' || v.startsWith('page-') || v === '404'
  for (const p of pages) {
    const r = rendered.get(p.file)
    const refPath = r?.booted ? `reference/${r.snapshot}` : `reference/${p.file}`
    p.reference = refPath
    const entries = []
    const sectionIds = []
    for (const s of p.main.sections) {
      if (s.type === 'breadcrumb') continue
      const conv = convertHtml(s.html)
      const id = s.id
      sectionIds.push(id)
      customSections.push({
        id,
        title: s.title,
        position: 'main',
        scope: 'page',
        ordering: s.index,
        showtitle: false,
        sectionType: s.type,
        locale: p.locale,
        pages: [{ file: p.file, wpPath: p.path }],
        html: s.html,
        blocks: conv.markup,
        images: s.images,
        fields: s.fields,
        items: s.items
      })
      if (s.type) entries.push({ kind: 'section', sectionType: s.type, moduleId: id, title: s.title, position: 'main', html: s.html })
      else {
        entries.push({ kind: 'html', moduleId: id, title: s.title, position: 'main', blocks: `<!-- wp:html -->\n${s.html.trim()}\n<!-- /wp:html -->` })
        untyped.push(`${p.file}: section ${s.index} "${s.title}"`)
      }
    }
    const sectionsMode = p.main.mode === 'sections' && entries.length > 0
    const markup = sectionsMode ? entries.map((e) => (e.kind === 'html' ? e.blocks : `<!-- wp:${SLOT_BLOCK} {"position":"main","section":"${e.moduleId}"} /-->`)).join('\n') : (p.main.markup ?? '')
    check(markup, p.file)
    for (const e of entries) if (e.kind === 'html') check(e.blocks, `${p.file}#${e.moduleId}`)
    const images = sectionsMode ? p.main.images : (p.main.images ?? [])
    const pageNotes = []
    if (!p.fromRender && render) pageNotes.push('content comes from the static binding, not the browser render')
    if (p.main.sections.some((s) => s.type === 'breadcrumb')) pageNotes.push('breadcrumb row dropped (the theme renders its own)')
    pageMapPages.push({
      file: p.file,
      view: p.view,
      layout: p.layout ?? null,
      title: p.h1 ?? p.title,
      path: p.path,
      locale: p.locale,
      translationOf: p.translationOf,
      translations: p.translations,
      source: { file: p.file, page: p.id, locale: p.locale, rendered: p.fromRender },
      sections: sectionIds.length ? [{ position: 'main', via: 'dom', modules: sectionIds }] : []
    })
    referencePages.push({ page: p.file, path: refPath, static: `reference/static/${p.file}`, ...(r?.shots && Object.keys(r.shots).length ? { shots: Object.fromEntries(Object.entries(r.shots).map(([k, v]) => [k, `reference/${v}`])) } : {}) })
    const template = p.view.startsWith('page-') ? p.view : null
    if (VIEW_IS_PAGE(p.view)) {
      const routeSegments = p.manifestPath ? p.path.split('/').filter(Boolean) : []
      const routeSlug = routeSegments.length ? slugify(routeSegments.at(-1)) : slugify(p.name)
      const routeParent = routeSegments.length > 1 ? `/${routeSegments.slice(0, -1).join('/')}` : null
      wpPages.push({
        file: p.file,
        title: p.h1 ?? p.title.replace(/^.*?[—–|:-]\s*/, '') ?? p.name,
        slug: p.view === 'front-page' ? (p.locale === defaultLocale ? 'home' : p.locale) : routeSlug,
        path: p.path,
        view: p.view,
        locale: p.locale,
        translationOf: p.translationOf,
        menuLabel: p.name,
        status: p.view === '404' ? 'draft' : 'publish',
        date: null,
        modified: null,
        author: null,
        excerpt: '',
        featuredImage: null,
        featuredImageAlt: '',
        meta: template ? { _wp_page_template: template } : {},
        parent: p.manifestPath ? routeParent : (p.locale !== defaultLocale && p.view !== 'front-page' ? `/${p.locale}` : null),
        synthetic: false,
        contentKind: sectionsMode ? 'sections' : 'blocks',
        content: sectionsMode ? entries : markup,
        contentMarkup: sectionsMode ? markup : undefined,
        images,
        sections: sectionIds.length ? [{ position: 'main', via: 'dom', modules: sectionIds }] : [],
        aside: [],
        orphaned: [],
        droppedContent: null,
        notes: pageNotes
      })
    } else if (p.view === 'single') {
      const conv = convertHtml(p.articleHtml ?? '')
      check(conv.markup, p.file)
      // The article's own header names its category (the eyebrow) and date (the byline); the
      // body keeps them — what the single template prints twice is the seeder's to drop.
      const head = articleHead({ content: conv.markup, title: p.h1 ?? p.title, featuredImage: p.featured?.src ?? null, dateText: p.articleMeta })
      posts.push({
        title: p.h1 ?? p.title,
        slug: slugify(p.h1 ?? p.name) + (p.locale === defaultLocale ? '' : `-${p.locale}`),
        path: `/news/${slugify(p.h1 ?? p.name)}`,
        status: 'publish',
        date: parseDateText(p.articleMeta),
        modified: null,
        author: null,
        category: 'news',
        categoryName: categoryLabel(head.eyebrow),
        locale: p.locale,
        sticky: false,
        excerpt: '',
        featuredImage: p.featured?.src ?? null,
        featuredImageAlt: p.featured?.alt ?? '',
        source: { file: p.file, dateText: p.articleMeta, eyebrow: head.eyebrow },
        synthetic: false,
        content: conv.markup,
        images: conv.images
      })
    } else {
      archives.push({ file: p.file, view: p.view, path: p.path, title: p.h1 ?? p.title, locale: p.locale, category: p.view === 'home' ? 'news' : null, sections: sectionIds.length ? [{ position: 'main', via: 'dom', modules: sectionIds }] : [], aside: [] })
    }
    // Listing cards → stub posts, so the archive has entries. Real article posts win on title.
    for (const card of p.cards ?? []) {
      const known = posts.find((x) => x.title === card.title)
      if (known) {
        // The article's listing card: its excerpt, and its eyebrow when the article had none.
        if (!known.excerpt && card.text) known.excerpt = card.text
        if (!known.categoryName && card.eyebrow) known.categoryName = categoryLabel(card.eyebrow)
        if (!known.sticky && isFeatured(card.eyebrow)) known.sticky = true
        continue
      }
      posts.push({
        title: card.title,
        slug: slugify(card.title) + (p.locale === defaultLocale ? '' : `-${p.locale}`),
        path: `/news/${slugify(card.title)}`,
        status: 'publish',
        date: parseDateText(card.meta),
        modified: null,
        author: null,
        category: 'news',
        categoryName: categoryLabel(card.eyebrow),
        locale: p.locale,
        sticky: isFeatured(card.eyebrow),
        excerpt: card.text,
        featuredImage: card.img,
        featuredImageAlt: card.alt ?? '',
        source: { file: p.file, card: true, dateText: card.meta, eyebrow: card.eyebrow ?? null },
        synthetic: true,
        syntheticReason: 'listing card; the source has no body for it',
        content: card.text ? `<!-- wp:paragraph -->\n<p>${card.text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>\n<!-- /wp:paragraph -->` : '',
        images: card.img ? [{ src: card.img, file: card.img.split('/').pop(), alt: card.alt ?? '' }] : []
      })
    }
  }
  const categories = postCategories(posts, { locales, defaultLocale })
  const stubPosts = posts.filter((x) => x.synthetic).length
  if (stubPosts) gap('listing-cards', `${stubPosts} post(s) synthesised from listing cards carry only the card's excerpt`, posts.filter((x) => x.synthetic).map((x) => x.title))
  if (untyped.length) gap('untyped-sections', `${untyped.length} section(s) kept as core/html because no type matched`, untyped)
  // Locale parent pages: /ru is the RU home; nothing to synthesise when the front page exists.
  for (const loc of locales) {
    if (loc === defaultLocale) continue
    if (!wpPages.some((x) => x.path === `/${loc}`))
      wpPages.push({ file: null, title: loc.toUpperCase(), slug: loc, path: `/${loc}`, view: 'page', locale: loc, translationOf: null, menuLabel: null, status: 'publish', date: null, modified: null, author: null, excerpt: '', featuredImage: null, featuredImageAlt: '', meta: {}, parent: null, synthetic: true, syntheticReason: `parent page so that /${loc}/… pages keep their locale prefix`, contentKind: 'blocks', content: '', images: [], sections: [], aside: [], orphaned: [], droppedContent: null, notes: [] })
  }
  // Synthetic entries for required views no page maps to (template mode).
  const views = new Set(pageMapPages.map((x) => x.view))
  const synthetic = []
  if (scope === 'template') {
    const standIn = (view, from, reason) => {
      const base = pageMapPages.find((x) => x.file === from)
      const ref = referencePages.find((x) => x.page === from)
      pageMapPages.push({ file: `${view}.html`, view, layout: null, title: base.title, path: base.path, locale: base.locale, translationOf: null, translations: {}, synthetic: true, source: { standsInFor: from, reason }, sections: base.sections })
      referencePages.push({ page: `${view}.html`, path: ref.path, static: ref.static, ...(ref.shots ? { shots: ref.shots } : {}) })
      synthetic.push(`${view}.html`)
    }
    if (!views.has('category')) {
      const listing = pageMapPages.find((x) => x.view === 'home' && x.locale === defaultLocale) ?? pageMapPages.find((x) => x.view === 'home')
      if (listing) standIn('category', listing.file, 'the export has one listing page; the category archive shares its layout')
    }
  }
  if (synthetic.length) notes.push(`synthetic page-map entries for required views with no page: ${synthetic.join(', ')}`)
  if (markupProblems.length) throw new Error(`block markup failed its own check:\n  ${markupProblems.join('\n  ')}`)

  // ── menus ─────────────────────────────────────────────────────────────────
  const { menus, footerCustoms, notes: menuNotes } = buildMenus(menusByLocale, { locales, defaultLocale, fileByPath })
  notes.push(...menuNotes)
  if (deadLinks.size) gap('dead-chrome-links', `${deadLinks.size} chrome link(s) have no target in the export (href="#" and no navigating handler); they are not in menus.json`, [...deadLinks.keys()])

  // ── theme facts ───────────────────────────────────────────────────────────
  const front = pages.find((p) => p.view === 'front-page' && p.locale === defaultLocale) ?? pages[0]
  let facts
  let measured = false
  const frontRender = rendered.get(front.file)
  if (frontRender?.booted && Object.keys(frontRender.measurements).length) {
    facts = Object.fromEntries(Object.entries(frontRender.measurements).map(([k, m]) => [k, { ...m, measured: true, accent: null }]))
    measured = true
    // Declared colours beat sampled ones: the helmet CSS says what `a` and `a:hover` are, while a
    // sampled link may be the white CTA on the hero band. Typography, rhythm and the button stay measured.
    if (front.canvas) {
      const declared = staticStyleFacts(new JSDOM(front.staticHtml).window.document, front.canvas.helmet)
      for (const [k, f] of Object.entries(facts)) {
        f.accent = declared[k]?.accent ?? null
        if (declared[k]?.link?.color) f.link = { color: declared[k].link.color }
      }
    }
  } else if (front.canvas) facts = staticStyleFacts(new JSDOM(front.staticHtml).window.document, front.canvas.helmet)
  else facts = paletteFacts(bundleMap ?? { theme: {} })
  const L = facts['1440-light'] ?? {}
  const D = facts['1440-dark'] ?? {}
  const light = { primary: L.link?.color ?? null, secondary: L.accent ?? L.button?.backgroundColor ?? null, body_bg: L.body?.backgroundColor ?? null, text: L.body?.color ?? null }
  const hasDark = Boolean(D.body?.backgroundColor && D.body?.color && D.body.backgroundColor !== L.body?.backgroundColor)
  const dark = hasDark ? { primary: D.link?.color ?? light.primary, secondary: D.accent ?? D.button?.backgroundColor ?? light.secondary, body_bg: D.body.backgroundColor, text: D.body.color } : null
  if (!hasDark) notes.push('no dark palette in the source; darkDerived = true (Phase 6 derives it)')
  const fonts = { body: firstFamily(L.body?.fontFamily) ?? bundleMap?.theme?.fonts?.body ?? null, heading: firstFamily(L.h1?.fontFamily) ?? bundleMap?.theme?.fonts?.heading ?? firstFamily(L.body?.fontFamily) ?? null }

  // ── page-map ──────────────────────────────────────────────────────────────
  const pageMap = {
    template: { name: slug, title: identity.fullName ?? identity.name ?? bundleMap?.template?.title ?? slug, version: null },
    theme: { mode: 'light-primary', palette: { light, dark }, darkDerived: !hasDark, fonts, hook: { ...DEFAULT_THEME_HOOK } },
    templateParts: ['header', 'footer'],
    locales,
    defaultLocale,
    pages: pageMapPages,
    menus: menus.map((m) => m.menutype),
    source: { kind, path: src, shape, rendered: render }
  }
  if (scope !== 'template') pageMap.scope = { mode: scope, reason: `from-html --scope ${scope}: the pack covers exactly the pages of ${basename(src)}`, pages: pageMapPages.map((p) => p.file) }

  // ── write ─────────────────────────────────────────────────────────────────
  initSpecPack(out, {
    pageMap,
    kind: packKind,
    adapter,
    source: provenanceSource ?? { kind, path: src, shape, pages: pages.length, rendered: render, ...(served ? { serve: { dir: pagesDir, origin: served.origin, port: served.port } } : {}) },
    viewports: [1440, 390],
    modes: ['light', 'dark'],
    pages: referencePages,
    force
  })
  const pageMapPath = join(out, 'page-map.json')
  await writeJson(join(out, 'content.json'), {
    site: { name: identity.name, tagline: identity.tagline, logo: null, url: null, locales, defaultLocale },
    categories,
    pages: wpPages,
    posts,
    archives,
    images: [...allImages.values()],
    assets: [...allAssets.values()],
    unresolvedLinks: [...new Set(pages.flatMap((p) => p.links?.unresolved ?? []))].sort()
  })
  await writeJson(join(out, 'sections.json'), { slotBlock: SLOT_BLOCK, acm: [], custom: [...customSections, ...footerCustoms], other: [] })
  await writeJson(join(out, 'menus.json'), { menus })
  await writeJson(join(out, 'redirects.json'), { rules: redirectRules, categorySlugs: [] })
  const sourceFontSite = served?.origin ?? provenanceSource?.origin ?? provenanceSource?.start ?? 'http://dom-source.invalid'
  await writeJson(join(out, REPORT_FILE), buildReport({ staticReport: sourceFontsStatic, browser: sourceFontsBrowser, siteUrl: sourceFontSite }))

  // ── contracts ─────────────────────────────────────────────────────────────
  const contact = contactByLocale.get(defaultLocale) ?? [...contactByLocale.values()][0] ?? null
  const factsOut = {}
  const fact = (key, value, status, source) => {
    if (value != null && String(value).trim()) factsOut[key] = { value: String(value).trim(), status, source }
  }
  fact('site.name', identity.name ?? slug, 'verified', 'design')
  fact('site.tagline', identity.tagline ?? identity.name ?? slug, 'verified', 'design')
  if (contact) {
    fact('contact.email', contact.email, 'demo', 'demo')
    fact('contact.phone', contact.phone, 'demo', 'demo')
    fact('contact.address', contact.address, 'demo', 'demo')
    fact('contact.hours', contact.hours, 'demo', 'demo')
  }
  fact('demo.disclosure', 'Demonstration site: company details, contacts and figures come from a design mock-up and are illustrative.', 'demo', 'demo')
  const contactFactKeys = Object.keys(factsOut).filter((k) => k.startsWith('contact.'))
  await writeJson(join(out, 'content-contract.json'), {
    schemaVersion: 1,
    id: slug,
    revision: 1,
    mode: 'demo',
    language: defaultLocale,
    identity: { name: 'site.name', summary: 'site.tagline', disclosure: 'demo.disclosure' },
    voice: [`Plain, specific ${defaultLocale === 'en' ? 'English' : defaultLocale}: keep the register of the design copy — short headings, concrete claims, one call to action per band.`],
    sources: {
      design: { kind: 'site', reference: recordPath(resolve(src), { repoRoot: repoRootOf(out) }), note: `${shape}: ${pages.length} page(s), locales ${locales.join('/')}; the design copy is the source of site name and tagline` },
      demo: { kind: 'demo', reference: contact ? `contact page (${[...contactByLocale.keys()].join('/')})` : 'design mock-up', note: 'Contacts, figures and names in a design mock-up are illustrative until a customer replaces them.' }
    },
    facts: factsOut,
    surfaces: pageMapPages.map((p) => ({ id: p.file, purpose: `${p.view} · ${p.path} (${p.title})${p.locale !== defaultLocale ? ` [${p.locale}]` : ''}`, requiredFacts: p.view === 'page-contact' ? contactFactKeys : [] })),
    pending: []
  })
  const designPages = pageMapPages.map((p) => {
    const ref = referencePages.find((r) => r.page === p.file)
    const url = served ? `${served.origin}/${(p.synthetic ? p.source.standsInFor : p.file).split('/').map(encodeURIComponent).join('/')}` : `http://127.0.0.1:${port || 8080}/${(p.synthetic ? p.source.standsInFor : p.file).split('/').map(encodeURIComponent).join('/')}`
    return { file: p.file, url, ref }
  })
  await writeJson(
    join(out, 'design-contract.json'),
    buildDesignContract({
      facts,
      slug,
      source: { reference: served ? served.origin : recordPath(resolve(src), { repoRoot: repoRootOf(out) }), inspiration: `${identity.name ?? slug} (${shape})`, version: '0', capturedAt: now },
      pages: designPages,
      pilot: front.file,
      measured
    })
  )

  // ── design-spec.md ────────────────────────────────────────────────────────
  const md = execFileSync(process.execPath, [MAKE_DESIGN_SPEC, pageMapPath], { encoding: 'utf8' })
  const spec = fillDesignSpec(md, { facts, pages: pageMapPages.map((p) => ({ ...p, reference: referencePages.find((r) => r.page === p.file)?.path })), slug, sourceKind: kind, sectionsByFile, hook: `html[${DEFAULT_THEME_HOOK.attribute}="${DEFAULT_THEME_HOOK.darkValue}"]` })
  await writeFile(join(out, 'design-spec.md'), spec.md)
  if (spec.unresolved.length) notes.push(`design-spec.md slots the source could not fill: ${[...new Set(spec.unresolved)].join(', ')}`)

  // ── provenance ────────────────────────────────────────────────────────────
  if (canvasNotes.unsupported.length) gap('unsupported-literals', `${canvasNotes.unsupported.length} data declaration(s) are not literals and were not read`, canvasNotes.unsupported.map((u) => `${u.name ?? u.node}: ${u.reason ?? ''}`.trim()))
  if (canvasNotes.unresolved.size) gap('unresolved-bindings', `${canvasNotes.unresolved.size} binding expression(s) stayed as {{ … }} on the static pages`, [...canvasNotes.unresolved.entries()].map(([e, n]) => `${e} ×${n}`))
  const holes = pages.filter((p) => p.stats.holes).map((p) => `${p.file}: ${p.stats.holes}`)
  if (holes.length) gap('holes-on-page', 'pages whose content still shows {{ … }} markers', holes)
  const placeholders = [...allImages.values()].filter((i) => !i.original)
  const slotsNoSrc = pages.reduce((n, p) => n + (docs.get(p.file)?.querySelectorAll('img[data-placeholder]').length ?? 0), 0)
  if (slotsNoSrc || placeholders.length) gap('image-slot-placeholders', `${slotsNoSrc} image slot(s) have no src (placeholder caption only)`)
  // Image files nobody references: the source's own leftovers, listed so nobody hunts for them.
  const imageDirs = ['img', 'images'].filter((d) => existsSync(join(src, d)))
  const onDisk = (await Promise.all(imageDirs.map((d) => walkFiles(join(src, d))))).flat().map((f) => relative(src, f).split(sep).join('/'))
  const unreferenced = onDisk.filter((f) => !allImages.has(f) && /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(f))
  if (unreferenced.length) gap('unreferenced-images', `${unreferenced.length} image file(s) under ${imageDirs.join('/')} are referenced by no page`, unreferenced)
  if (allAssets.size) gap('documents', `${allAssets.size} document(s) (PDF decks etc.) are linked from pages; WordPress keeps them as media uploads, the seeder must upload them from assets/`, [...allAssets.keys()])
  const decks = existsSync(join(src, 'decks')) ? (await walkFiles(join(src, 'decks'))).length : 0
  if (decks > allAssets.size) gap('decks-folder', `${decks} file(s) under decks/ of which ${allAssets.size} are linked from a page; the rest reach no page`)
  if (locales.length > 1) gap('locales', `${locales.length} locales (${locales.join(', ')}): WordPress core has no i18n; non-default locales are page trees under /<locale> and posts carry a locale field`)
  const prov = readJson(join(out, 'provenance.json'))
  prov.adapterVersion = ADAPTER_VERSION
  prov.generatedAt = now
  prov.counts = {
    pageFiles: pages.length,
    pages: pageMapPages.length,
    pagesByLocale: Object.fromEntries(locales.map((l) => [l, pages.filter((p) => p.locale === l).length])),
    wpPages: wpPages.length,
    posts: posts.length,
    postsSynthetic: stubPosts,
    archives: archives.length,
    menus: menus.length,
    menuItems: menus.reduce((n, m) => n + m.items.length + m.items.reduce((k, i) => k + i.children.length, 0), 0),
    sections: customSections.length,
    sectionsByType: customSections.reduce((acc, s) => ((acc[s.sectionType ?? 'html'] = (acc[s.sectionType ?? 'html'] ?? 0) + 1), acc), {}),
    footerColumns: footerCustoms.length,
    images: allImages.size,
    documents: allAssets.size,
    rendered: [...rendered.values()].filter((r) => r.booted).length,
    synthetic: synthetic.length
  }
  prov.source = { ...prov.source, ...(canvasNotes.data ? { dataKeys: Object.keys(canvasNotes.data), dataLocales: canvasNotes.locales } : {}) }
  prov.notes = notes
  prov.gaps = gaps
  await writeJson(join(out, 'provenance.json'), prov)

  const validation = validateSpecPack(out, { pageFloor })
  return { out, counts: prov.counts, validation, notes, gaps, kind, shape }
}

/**
 * The categories the posts' eyebrows name, top-level beside the listing's own `news` term (the
 * posts page's default, not a parent the source draws — see the seeder's derivedCategories):
 * one per label read on a default-locale post; a secondary-locale post takes the category of the
 * default-locale post at the same position among its locale's posts (the pairing the seeder
 * uses for translations) and lends the category its title in that locale (`titles`). A post
 * whose eyebrow named nothing, or whose pair does not exist, stays in `news`. Every post's
 * `category` is set here; `categoryName` is dropped.
 */
export function postCategories(posts, { locales = [], defaultLocale = null } = {}) {
  if (!posts.length) return []
  const news = { id: 'news', title: 'News', wpSlug: 'news', joomlaAlias: null, parent: null, description: '', postCount: 0 }
  const out = new Map([['news', news]])
  const base = posts.filter((p) => !defaultLocale || p.locale === defaultLocale)
  for (const p of base) {
    const name = p.categoryName
    if (!name) continue
    const id = slugify(name).replace(/[^a-z0-9-]/g, '') || `news-${out.size}`
    if (!out.has(id)) out.set(id, { id, title: name, wpSlug: id, joomlaAlias: null, parent: null, description: '', postCount: 0, titles: {} })
    p.category = id
  }
  for (const loc of locales.filter((l) => l !== defaultLocale)) {
    const mine = posts.filter((p) => p.locale === loc)
    mine.forEach((p, i) => {
      const twin = base[i]
      if (twin && twin.category !== 'news' && p.categoryName) {
        p.category = twin.category
        out.get(twin.category).titles[loc] ??= p.categoryName
      }
    })
  }
  for (const p of posts) {
    p.category ??= 'news'
    out.get(p.category).postCount++
    delete p.categoryName
  }
  return [...out.values()]
}

async function walkFiles(dir, acc = []) {
  for (const e of await readdir(dir)) {
    const abs = join(dir, e)
    if ((await stat(abs)).isDirectory()) await walkFiles(abs, acc)
    else if (!e.startsWith('.')) acc.push(abs)
  }
  return acc
}

/** Resolved absolute path of `rel` inside `root`, or null when it escapes (an untrusted manifest can say `../../x`). */
function contained(root, rel) {
  const base = resolve(root)
  const target = resolve(base, rel)
  return target === base || target.startsWith(base + sep) ? target : null
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
  const VALUED = ['--out', '--port', '--page-floor', '--scope']
  const src = args.find((a, i) => !a.startsWith('-') && !VALUED.includes(args[i - 1]))
  const out = flag('--out')
  if (!src || !out) {
    console.error('usage: from-html.mjs <dir> --out <spec-pack-dir> [--render | --no-render] [--port N] [--scope website] [--page-floor N] [--single] [--force] [--strict]')
    process.exit(2)
  }
  if (!existsSync(src)) {
    console.error(`source not found: ${src}`)
    process.exit(2)
  }
  if (!statSync(src).isDirectory()) {
    console.error(`source must be a directory, not a file: ${src}`)
    process.exit(2)
  }
  const floorRaw = flag('--page-floor')
  const pageFloor = floorRaw == null ? PAGE_FLOOR : Number(floorRaw)
  if (!Number.isInteger(pageFloor) || pageFloor < 1) {
    console.error(`--page-floor must be a positive integer; got ${JSON.stringify(floorRaw)}`)
    process.exit(2)
  }
  const scope = flag('--scope', 'template')
  if (!['template', 'website'].includes(scope)) {
    console.error(`--scope must be template or website; got ${scope}`)
    process.exit(2)
  }
  let result
  try {
    result = await buildSpecPack({
      src,
      out,
      render: args.includes('--render') && !args.includes('--no-render'),
      port: Number(flag('--port', 0)) || 0,
      scope,
      force: args.includes('--force'),
      single: args.includes('--single'),
      pageFloor,
      log: (m) => console.error(m)
    })
  } catch (e) {
    console.error(e.message)
    if (e instanceof SyntaxError) console.error('  manifest.json is not valid JSON — fix it, or pass --single to ignore it')
    process.exit(e.message.startsWith('spec-pack already exists') || e.message.startsWith('block markup') ? 1 : 2)
  }
  const c = result.counts
  console.error(
    `from-html: ${result.shape}; ${c.pageFiles} file(s) → ${c.pages} pages (${Object.entries(c.pagesByLocale).map(([l, n]) => `${l} ${n}`).join(', ')}; ${c.wpPages} WordPress pages, ${c.archives} archives) · ${c.posts} posts (${c.postsSynthetic} from cards) · ${c.menus} menus / ${c.menuItems} items · ${c.sections} sections (${Object.entries(c.sectionsByType).map(([t, n]) => `${t} ${n}`).join(', ')}) · ${c.images} images · ${c.documents} documents · ${c.rendered} rendered`
  )
  for (const n of result.notes) console.error(`  note: ${n}`)
  for (const g of result.gaps) console.error(`  gap ${g.code}: ${g.detail}`)
  if (result.validation.ok) {
    console.error(`spec-pack OK — ${result.validation.stats.pageCount} pages, kind=${result.validation.stats.kind}, adapter=${result.validation.stats.adapter}`)
  } else {
    // The pack is written either way: a small bundle is a legitimate starting point that the
    // operator completes by hand (references/inputs/from-html.md §Step 2). --strict makes the
    // gate binding, for a source that is expected to validate on its own (a canvas export).
    console.error(`spec-pack INVALID — ${result.validation.problems.length} problem(s) to complete before \`spec-pack.mjs --validate\`:`)
    for (const p of result.validation.problems) console.error(`  - ${p}`)
    if (args.includes('--strict')) process.exit(1)
  }
}
