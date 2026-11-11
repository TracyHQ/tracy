#!/usr/bin/env node
// Template kit, site part: what the template holds once for the whole site (logo spots, favicon, name slots, brand
// colours, head, footer link columns, contact blocks, forms, system pages), measured on a site rebuilt from the
// quickstart. Read-only on the site but for one measurement: pages are opened in a browser, the database only answers
// SELECT, files are read. To tell whether a sentence the CMS prints (a licence line) can be hidden, its language
// constant is set to an empty value in the language override file, the block shot, and the file put back as it was;
// `--no-hide-measure` skips that (each such `canHide` is then an error).
//
//   site-cli.mjs --site <url> [--host-header <host>] --contract <dir> --out <dir>
//                [--db mysql://user:pass@host:port/name | --db-command '<client prefix>']
//                [--webroot <dir> [--files-command '<prefix>']] [--capture-index <file>] [--max-pages 60]
//                [--no-hide-measure]
//
// Writes into --out: site.json ({site, mainHeadings, errors}) and site-palette.html.
// Exit: 0 written with no error · 1 written with errors · 2 usage or run error.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { readManifest } from './lib/contract-manifest.mjs'
import { readContractMap } from './lib/contract-read.mjs'
import { settleEmdashSections } from './lib/site/emdash-sections-file.mjs'
import { settleWordPressSections } from './lib/site/wordpress-sections-file.mjs'
import { pageIdOf } from './lib/ids.mjs'
import { pathOfRoute, slugOfPath } from './lib/kit-paths.mjs'
import { indexMap } from './lib/map-index.mjs'
import { adapterFor, usePlatform } from './lib/site/adapters/index.mjs'
import { readEmdashSettings } from './lib/site/adapters/emdash.mjs'
import { siteWriter } from './lib/site/adapters/site-writer.mjs'
import { siteSource } from './lib/site/adapters/source.mjs'
import { buildBrandColours } from './lib/site/brand-colours.mjs'
import { browseSite, fetchStyles } from './lib/site/browse-site.mjs'
import { measureFixedTexts } from './lib/site/hide-cms-text.mjs'
import { logoSlotsOf } from './lib/site/logo-spots.mjs'
import { writePaletteHtml } from './lib/site/palette.mjs'
import { buildSite } from './lib/site/site-kit.mjs'
import { pathsOnStyles, stylesOfOpeningTheme } from './lib/site/theme-styles.mjs'

const log = (...a) => console.error('[template-kit site]', ...a)
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'))

export function parseArgs(argv) {
  const o = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) o[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
  }
  return o
}

/** The pages to read: the capture's pages when given, else every map page that opens a page of its own. */
export function pagesToRead(map, captureIndex, cap) {
  const list = captureIndex
    ? captureIndex.pages.map((p) => ({ path: p.path, slug: p.slug }))
    : [
        { path: '/', slug: 'home' },
        ...(map.pages ?? [])
          .filter((p) => (p.link == null || /[?&]option=/.test(p.link)) && p.route !== 'home')
          .map((p) => ({ path: pathOfRoute(p.route), slug: slugOfPath(pathOfRoute(p.route)) }))
      ]
  const seen = new Set()
  return list
    .filter((p) => !seen.has(p.path) && seen.add(p.path))
    .slice(0, cap)
    .map((p) => ({ ...p, pageId: pageIdOf(p.slug) }))
}

/**
 * What the EmDash adapter reads beyond the theme files: the site settings through the REST door (agent token file,
 * `--token-file`) and the content map. Other platforms read everything through the source.
 */
async function extraOf({ manifest, map, o, hostHeader }) {
  if (String(manifest.platform).toLowerCase() !== 'emdash') return undefined
  const r = await readEmdashSettings({
    siteUrl: o.site,
    tokenFile: typeof o['token-file'] === 'string' ? o['token-file'] : undefined,
    hostHeader
  })
  return { settings: r.settings, settingsReason: r.reason, map, template: manifest.template }
}

/**
 * The site part, for this CLI and for the kit's one-command pipeline: writes site.json and site-palette.html
 * into `out` and returns the document. Without a database or file command it reads the pages only, and the
 * fields only those can answer are named in `errors`.
 * @param {{o: object, out: string, chromium: object, capture?: object|null, log?: Function}} a
 */
export async function runSite({ o, out, chromium, capture = null, log: say = log }) {
  const map = readContractMap(o.contract)
  const str = (v) => (typeof v === 'string' ? v : undefined)
  const manifest = readManifest(o.contract, { release: str(o['release-tag']) })
  usePlatform(manifest.platform)
  const hostHeader = typeof o['host-header'] === 'string' ? o['host-header'] : undefined
  const source = siteSource({
    db: str(o.db),
    dbCommand: str(o['db-command']),
    filesCommand: str(o['files-command']),
    webroot: str(o.webroot)
  })
  const adapter = adapterFor(manifest.platform, source, await extraOf({ manifest, map, o, hostHeader }))
  say(
    'reads',
    source.describe.join(' and ') || 'the pages only',
    `(${adapter.cms}${adapter.framework ? ` ${adapter.framework}` : ''})`
  )
  const pages = pagesToRead(map, capture, Number(o['max-pages'] ?? 60))
  const served = await fetchStyles({ pages, siteUrl: o.site, hostHeader })
  const { htmls } = served
  // A page on another colour theme of the template (a theme showcase) does not paint the brand.
  const variantPaths = pathsOnStyles(map, adapter.themeVariantStyles?.() ?? [])
  const styles = stylesOfOpeningTheme(served.styles, variantPaths)
  say(styles.length, 'stylesheets from', htmls.length, 'pages')
  if (styles.length < served.styles.length)
    say(
      served.styles.length - styles.length,
      'stylesheets left out: only pages on another colour theme serve them'
    )
  const first = buildBrandColours({ styles, pages: htmls, variables: adapter.colourVariables?.() ?? [] })
  const brand = [first.brandColours.primary?.value, first.brandColours.secondary?.value].filter(Boolean)
  const browser = await chromium.launch()
  try {
    const seen = await browseSite({
      browser,
      siteUrl: o.site,
      hostHeader,
      idx: indexMap(map),
      pages,
      logoFiles: [...new Set(logoSlotsOf(map).map((s) => s.file))],
      siteName: adapter.siteName,
      brand,
      log: say
    })
    const cms = adapter.cmsStrings?.() ?? null
    const r = buildSite({ map, adapter, ...seen, styles, htmls, cms })
    const fixed = r.site.fixedTexts
    if (fixed.length && cms && !o['no-hide-measure']) {
      const writer = siteWriter({ filesCommand: str(o['files-command']), webroot: str(o.webroot) })
      say(fixed.length, 'fixed CMS sentences; measuring whether each can be hidden')
      r.errors.push(
        ...(await measureFixedTexts({
          browser,
          siteUrl: o.site,
          hostHeader,
          idx: indexMap(map),
          fixedTexts: fixed,
          override: cms.override,
          readFile: source.readFile,
          writer,
          log: say
        }))
      )
      // Words a short language value only seemed to print stay template words: the kit measures them itself.
      r.site.fixedTexts = fixed.filter((f) => !f.notPrintedByCms)
    } else if (fixed.length)
      for (const [i] of fixed.entries())
        r.errors.push({
          kind: 'missing',
          field: `site.fixedTexts[${i}].canHide`,
          reason: 'not measured (--no-hide-measure)'
        })
    for (const f of seen.failures) r.errors.push({ kind: 'page-failed', path: f.path, reason: f.reason })
    const doc = {
      tool: 'template-kit site 1.0.0',
      contract: manifest.id,
      site: r.site,
      mainHeadings: r.mainHeadings,
      errors: r.errors
    }
    writeFileSync(join(out, 'site.json'), `${JSON.stringify(doc, null, 2)}\n`)
    writePaletteHtml(r.site.brandColours, `Brand colours of ${manifest.id}`, join(out, 'site-palette.html'))
    say(`site.json: ${r.site.logoSpots.length} logo spots, ${r.errors.length} errors; site-palette.html`)
    return doc
  } finally {
    await browser.close()
  }
}

async function main() {
  const o = parseArgs(process.argv.slice(2))
  if (!o.site || !o.contract || !o.out) {
    console.error('usage: site-cli.mjs --site <url> --contract <dir> --out <dir> (see the head of this file)')
    return 2
  }
  const out = resolve(o.out)
  mkdirSync(out, { recursive: true })
  const capture = typeof o['capture-index'] === 'string' ? readJson(o['capture-index']) : null
  // WordPress pages are read as their sections, the way the kit run splits them (wordpress-sections-file.mjs).
  settleWordPressSections({
    platform: readManifest(o.contract).platform,
    out,
    db: typeof o.db === 'string' ? o.db : undefined,
    dbCommand: typeof o['db-command'] === 'string' ? o['db-command'] : undefined
  })
  const mod = await import(process.env.PLAYWRIGHT_MODULE ?? '@playwright/test')
  const chromium = mod.chromium ?? mod.default?.chromium
  // An EmDash page is read as its parts (the layout's top bar, header, each section of main, footer), from the work
  // folder's emdash-sections.json, or from the site when none is there yet.
  const platform = readManifest(o.contract).platform
  usePlatform(platform)
  await settleEmdashSections({
    platform,
    out,
    map: readJson(join(o.contract, 'content-map.json')),
    siteUrl: o.site,
    hostHeader: typeof o['host-header'] === 'string' ? o['host-header'] : undefined,
    chromium,
    tokenFile: typeof o['token-file'] === 'string' ? o['token-file'] : undefined,
    reread: !!o['reread-sections']
  })
  const doc = await runSite({ o, out, chromium, capture })
  return doc.errors.length ? 1 : 0
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(e.stack ?? e)
      process.exit(2)
    }
  )
