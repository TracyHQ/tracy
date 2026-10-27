import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, resolve, sep, posix } from 'node:path'
import { JSDOM } from 'jsdom'
import { cssFacts, DOM_STATIC_SCHEMA, familiesOfFontUrl } from './source-font.mjs'

const ROLES = { body: ['body'], h1: ['h1'], h2: ['h2'], h3: ['h3'], nav: ['nav', 'header'] }
const within = (root, rel) => {
  const abs = resolve(root, rel)
  return abs === root || abs.startsWith(root + sep) ? abs : null
}
const familyNames = (value) => String(value ?? '').replace(/!important/gi, '').split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
const digest = (text) => createHash('sha256').update(text).digest('hex')

/** Read the pack's CSS sources and preserve gaps when a linked or imported sheet cannot be read. */
export async function analyzeDomSourceFonts({ pages, root, widths = [1440, 390], stylesheetMap = null }) {
  root = resolve(root)
  const gaps = (stylesheetMap?.gaps ?? []).map((g) => `${g.url}: stylesheet capture gap (${g.reason})`)
  const mapping = stylesheetMap?.urls ?? {}
  const localPaths = stylesheetMap?.localPaths ?? {}
  const sheets = new Map()
  const loaders = []
  const pageRows = []
  const loadSheet = async ({ href, page, fromFile, fromUrl, depth = 0, chain = [] }) => {
    let resourceUrl = null
    try { resourceUrl = fromUrl ? new URL(href, fromUrl) : (/^(?:https?:)?\/\//i.test(href) ? new URL(href) : null) } catch {}
    let local = null
    if (href.startsWith('/') && localPaths[href]) local = localPaths[href]
    else if (resourceUrl) {
      const remoteKey = resourceUrl.href
      const mapped = mapping[remoteKey] ?? mapping[withoutHash(remoteKey)]
      if (mapped) local = mapped
      else if (page.baseUrl && stylesheetMap) { gaps.push(`${page.file}: stylesheet ${remoteKey} has no captured local copy`); return }
      else {
        // An absolute stylesheet in an HTML bundle is usable only when its path exists in that bundle.
        local = decodeLocalPath(resourceUrl.pathname)
      }
    } else if (!/^(?:data:|javascript:|#)/i.test(href)) {
      local = href.startsWith('/') ? decodeLocalPath(href) : posix.normalize(posix.join(posix.dirname(fromFile), href))
    } else return
    if (local == null) { gaps.push(`${page.file}: stylesheet ${href} has no captured local copy`); return }
    const abs = within(root, local)
    if (!abs) { gaps.push(`${page.file}: stylesheet ${href} escapes the source bundle`); return }
    const key = local.replaceAll('\\', '/')
    if (sheets.has(key)) return
    if (depth > 16) { gaps.push(`${key}: stylesheet imports exceed the depth bound`); return }
    if (chain.includes(key)) { gaps.push(`${key}: stylesheet import cycle`); return }
    let text
    try { text = await readFile(abs, 'utf8') }
    catch (e) { gaps.push(`${key}: stylesheet is missing or unreadable (${e.code ?? e.message})`); return }
    const facts = cssFacts(text)
    const sheetUrl = resourceUrl?.href ?? null
    const finalUrl = sheetUrl ? (stylesheetMap?.localUrls?.[href] ?? stylesheetMap?.finalUrls?.[sheetUrl] ?? stylesheetMap?.finalUrls?.[withoutHash(sheetUrl)] ?? sheetUrl) : null
    const sheet = { text, facts, url: finalUrl, file: key }
    sheets.set(key, sheet)
    for (const imported of facts.imports) await loadSheet({ href: imported, page, fromFile: key, fromUrl: sheet.url, depth: depth + 1, chain: [...chain, key] })
  }
  for (const page of pages) {
    const localPage = page.file
    const abs = within(root, localPage)
    let html
    try { html = await readFile(abs, 'utf8') }
    catch (e) { gaps.push(`${page.file}: page is missing or unreadable (${e.code ?? e.message})`); continue }
    const doc = new JSDOM(html, { url: page.baseUrl ?? 'http://dom-source.invalid/' }).window.document
    for (const link of doc.querySelectorAll('link[rel~="stylesheet"][href]')) {
      const href = link.getAttribute('href')
      if (/^(?:https?:)?\/\//i.test(href)) {
        const families = familiesOfFontUrl(href)
        if (families.length) loaders.push({ page: page.file, href, families })
      }
      await loadSheet({ href, page, fromFile: localPage, fromUrl: doc.baseURI })
    }
    for (const style of doc.querySelectorAll('style')) {
      const text = style.textContent ?? ''
      const key = `inline:${page.file}:${sheets.size}`
      const facts = cssFacts(text)
      const sheet = { text, facts, url: doc.baseURI, file: key }
      sheets.set(key, sheet)
      for (const imported of facts.imports) await loadSheet({ href: imported, page, fromFile: localPage, fromUrl: sheet.url, depth: 1, chain: [key] })
    }
    pageRows.push({ route: page.route, file: page.file, baseUrl: page.baseUrl ?? null, htmlSha256: digest(html), widths })
  }
  const roles = Object.fromEntries(Object.keys(ROLES).map((r) => [r, []]))
  const faces = []
  for (const [sheet, { facts }] of sheets) {
    for (const face of facts.fontFaces) faces.push({ sheet, family: face.family, src: face.srcs })
    for (const rule of facts.rules) {
      const family = rule.decls.find(([name]) => name === 'font-family')?.[1]
      if (!family) continue
      for (const [role, sels] of Object.entries(ROLES)) if (rule.selectors.some((sel) => sels.some((s) => new RegExp(`(^|[\\s>+~])${s}(?=$|[\\s.#:[>+~])`, 'i').test(sel)))) {
        roles[role].push({ sheet, selectors: rule.selectors, family: familyNames(family), media: rule.media || null })
      }
    }
  }
  const fonts = [...new Set(Object.values(roles).flatMap((rows) => rows.flatMap((r) => r.family)).concat(faces.map((f) => f.family), loaders.flatMap((l) => l.families)))].sort()
  const report = { schema: DOM_STATIC_SCHEMA, complete: gaps.length === 0, gaps: [...new Set(gaps)].sort(), pages: pageRows.flatMap((p) => p.widths.map((width) => ({ route: p.route, file: p.file, width, htmlSha256: p.htmlSha256 }))), roles, fontFaces: faces, loaders, sheets: [...sheets.keys()].sort(), fonts }
  report.fingerprint = domStaticFingerprint(report)
  return report
}

export function domStaticFingerprint(report) {
  const { fingerprint, ...content } = report
  return digest(JSON.stringify(content))
}

function withoutHash(value) { const u = new URL(value); u.hash = ''; return u.href }
function decodeLocalPath(pathname) {
  try { return decodeURIComponent(pathname).replace(/^\/+/, '') }
  catch { return null }
}
