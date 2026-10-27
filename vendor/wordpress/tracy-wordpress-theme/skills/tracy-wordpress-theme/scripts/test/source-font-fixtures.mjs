// Builders shared by the source-font tests: an in-memory file reader for the analyzer, T4/T3 template fixtures,
// and browser measurements shaped like source-font-browser.mjs's output.
import { BROWSER_SCHEMA, DESKTOP_WIDTH, MOBILE_WIDTH, familyStack, isGeneric, primaryFamily, staticFingerprint } from '../ingest/source-font.mjs'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildSpecPack, sourceFontsOfDump } from '../ingest/from-joomla.mjs'

/** A reader over `{ 'templates/t/etc/site/default.json': '{...}' | { binary: true } | { error: 'x' } }`. */
export function memoryReader(files) {
  const dirs = new Map()
  for (const p of Object.keys(files)) {
    const d = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''
    if (!dirs.has(d)) dirs.set(d, [])
    dirs.get(d).push(p)
  }
  return {
    read(rel) {
      if (!Object.hasOwn(files, rel)) return null
      const v = files[rel]
      if (typeof v === 'string') return { text: v }
      if (v?.error) return { error: v.error }
      return { error: 'binary file, not text' }
    },
    has: (rel) => Object.hasOwn(files, rel),
    // a binary entry is digested by its content: { binary: true, bytes: '…' }
    digest: (rel) => (Object.hasOwn(files, rel) ? { sha256: createHash('sha256').update(JSON.stringify(files[rel])).digest('hex') } : null),
    list: (dir) => (dirs.get(dir) ?? []).sort()
  }
}

export const json = (o) => JSON.stringify(o)
export const GOOGLE = json([{ name: 'Golos Text' }, { name: 'Mulish' }, { name: 'Inter' }, { name: 'IBM Plex Sans' }, { name: 'Jost' }])
export const T4_FONTS = { body_font_family: 'Golos Text', heading_font_family: 'Golos Text', megamenu_font_family: 'Golos Text' }

export const style = (over = {}) => ({ id: '10', template: 'tpl', client: 'site', home: '1', title: 'Default', typelist: {}, ...over })
export const item = (over = {}) => ({ id: '100', path: 'about', alias: 'about', type: 'component', published: '1', template_style_id: '0', home: '0', client_id: '0', ...over })

/** Inputs of analyzeStatic for one T4 template `tpl` with the given files. */
export function t4Input(files, { styles = [style()], menu = [item()], google = GOOGLE } = {}) {
  return {
    templates: [{ dir: 'tpl', framework: 'T4' }],
    styles,
    menu,
    reader: memoryReader(files),
    googleListText: google
  }
}
export const site = (obj) => json(obj)

/** A reading of one role: the family asked for and the font that drew it. */
export function reading(requested, drawnName, { custom = true, size = '16px', chars = 120, glyphs = 100 } = {}) {
  return { requested, drawn: [{ name: drawnName, custom, glyphs }], size, chars, text: 'sample text of the source' }
}

/** One measured page. `roles` overrides the default good readings; `absent` lists roles the page has none of. */
export function browserPage({ route = '/', width = DESKTOP_WIDTH, kind = 'home', styleId = '10', template = 'tpl', family = 'Golos Text', roles = {}, absent = [], faces, failedRequests = [], status = 200 } = {}) {
  const stack = `"${family}", sans-serif`
  const sizes = width >= 1024 ? { body: '16px', h1: '40px', h2: '32px', h3: '24px', nav: '16px' } : { body: '16px', h1: '28px', h2: '24px', h3: '20px', nav: '18px' }
  const base = Object.fromEntries(Object.entries(sizes).map(([r, size]) => [r, reading(stack, family, { size })]))
  const merged = { ...base, ...roles }
  for (const r of absent) delete merged[r]
  return { route, kind, styleId, template, width, url: `http://source.invalid${route}`, finalUrl: `http://source.invalid${route}`, status, roles: merged, absent, faces: faces ?? [{ family, weight: '400', style: 'normal', status: 'loaded' }], failedRequests }
}

/** A measurement covering home, one page per style, a nested route, at both widths. */
export function measurement({ styleIds = ['10'], family = 'Golos Text', mutate, report = null, routes = {}, nested = '/company/about' } = {}) {
  const pages = []
  for (const width of [DESKTOP_WIDTH, MOBILE_WIDTH]) {
    pages.push(browserPage({ route: '/', kind: 'home', styleId: styleIds[0], width, family }))
    for (const id of styleIds.slice(1)) pages.push(browserPage({ route: routes[id] ?? `/style-${id}`, kind: 'style', styleId: id, width, family }))
    pages.push(browserPage({ route: nested, kind: 'nested', styleId: report?.menuRoutes?.find((m) => `/${m.path}` === nested)?.styleId ?? null, width, family }))
  }
  mutate?.(pages)
  return { schema: BROWSER_SCHEMA, site: 'http://source.invalid', ...(report ? { static: { fingerprint: staticFingerprint(report) } } : {}), widths: [DESKTOP_WIDTH, MOBILE_WIDTH], measuredAt: '2026-01-01T00:00:00.000Z', pages, unresolved: [] }
}

/**
 * A measurement that tells the truth about a dump fixture: every used style declared a family (or a system
 * stack) and the browser drew it. Built from the dump's own static report, so a fixture whose declared fonts
 * change keeps a matching reading.
 */
export function measurementForDump(j6Dir, siteUrl = 'http://127.0.0.1:8217') {
  const report = sourceFontsOfDump(j6Dir)
  const used = report.usedStyles
  const pages = []
  const stackOf = (style) => {
    const st = report.styles.find((s) => s.id === style.id)
    const body = st?.roles?.find((r) => r.role === 'body')?.family
    return body || 'sans-serif'
  }
  for (const width of [DESKTOP_WIDTH, MOBILE_WIDTH]) {
    const mk = (route, kind, st) => {
      const stack = stackOf(st)
      const primary = primaryFamily(stack) ?? 'Arial'
      const sizes = width >= 1024 ? { body: '16px', h1: '40px', h2: '32px', h3: '24px', nav: '16px' } : { body: '16px', h1: '28px', h2: '24px', h3: '20px', nav: '18px' }
      const roles = Object.fromEntries(Object.entries(sizes).map(([r, size]) => [r, reading(stack, familyStack(stack).some((n) => !isGeneric(n)) ? primary : 'DejaVu Sans', { size, custom: false })]))
      return { route, kind, styleId: st.id, template: st.template, width, url: `${new URL(siteUrl).origin}${route}`, finalUrl: `${new URL(siteUrl).origin}${route}`, status: 200, roles, absent: [], faces: [], failedRequests: [] }
    }
    const home = used.find((s) => s.default) ?? used[0]
    pages.push(mk('/', 'home', home))
    for (const st of used.filter((s) => s.id !== home.id)) pages.push(mk(report.menuRoutes.find((m) => m.styleId === st.id)?.path ? `/${report.menuRoutes.find((m) => m.styleId === st.id).path}` : `/style-${st.id}`, 'style', st))
    const nestedItem = report.menuRoutes.find((m) => m.path.includes('/'))
    // a nested route the menu does not give is a page of the source that claims no style
    const nestedPage = mk(`/${nestedItem?.path ?? 'company/about'}`, 'nested', used.find((u) => u.id === nestedItem?.styleId) ?? home)
    if (!nestedItem) Object.assign(nestedPage, { styleId: null, template: null })
    pages.push(nestedPage)
  }
  return { schema: BROWSER_SCHEMA, site: new URL(siteUrl).origin, static: { fingerprint: staticFingerprint(report) }, widths: [DESKTOP_WIDTH, MOBILE_WIDTH], measuredAt: '2026-01-01T00:00:00.000Z', pages, unresolved: [] }
}

/**
 * buildSpecPack with the browser reading a running copy of the dump's source would give: the Joomla gate needs
 * one, and these tests are about something else. When the dump cannot even be read, the call goes through
 * unchanged so the build reports its own error.
 */
export function buildPack(opts) {
  if (opts.sourceFontsBrowser !== undefined) return buildSpecPack(opts)
  let sourceFontsBrowser
  try {
    sourceFontsBrowser = measurementForDump(opts.j6Dir, opts.siteUrl)
  } catch {
    return buildSpecPack(opts)
  }
  return buildSpecPack({ ...opts, sourceFontsBrowser })
}

/** The `--source-fonts-browser <file>` arguments for a from-joomla.mjs run on `j6Dir`; the file is written into `dir`. */
export function browserArgs(j6Dir, dir, siteUrl) {
  const file = join(dir, 'source-fonts-browser.json')
  writeFileSync(file, JSON.stringify(measurementForDump(j6Dir, siteUrl)))
  return ['--source-fonts-browser', file]
}
