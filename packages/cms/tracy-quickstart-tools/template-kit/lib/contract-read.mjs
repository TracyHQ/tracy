// Read a contract's content map and coverage file for the kit tool. The site's front page may carry any alias
// ("homepage"), and its address is still `/`; the presentation lock says which menu item is the front page. Every
// page path in the tool starts from a map route, so the route is settled here once, on the way in.
// A released content map is sealed (ADR 0038 decision 6, ADR 0044): the demo's inline markup it lost is carried beside it,
// in content-coverage.json `inlineMarkup.samples`, and taken here as the slot's sample when the map's own has none.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { isLiteralPreSlot } from '../../content-coverage/lib/contract.mjs'
import { normText } from '../../content-coverage/lib/normalize.mjs'
import { inlineOf } from './inline-marks.mjs'
import { withEmdashPages } from './site/adapters/emdash-map.mjs'
import { withWordPressPages } from './site/adapters/wordpress-map.mjs'

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const readIf = (file) => (existsSync(file) ? readJson(file) : null)

/** The menu item the lock marks as the site's front page, the all-languages one when several are marked. */
function frontPageEntity(lock) {
  const rows = Object.entries(lock?.entities ?? {}).filter(
    ([key, e]) => key.startsWith('menuItem-') && String(e?.home) === '1'
  )
  return (rows.find(([, e]) => e.language == null || e.language === '*') ?? rows[0])?.[0] ?? null
}

/** The route the front page goes by in this map, null when it is already `home` or the map does not name it. */
function aliasOfFrontPage(pages, lock) {
  if (pages.some((p) => p.route === 'home')) return null
  const key = frontPageEntity(lock)
  return (key && pages.find((p) => p.entity === key)?.route) || null
}

/**
 * The content map with its front page routed as `home`. A map that already says so comes back as it is.
 * @param {object} map
 * @param {object | null} lock presentation-lock.json
 */
export function withHomeRoute(map, lock) {
  const alias = aliasOfFrontPage(map.pages ?? [], lock)
  if (!alias) return map
  const route = (r) => (r === alias ? 'home' : r)
  return {
    ...map,
    pages: map.pages.map((p) => ({ ...p, route: route(p.route) })),
    itemLists: Object.fromEntries(
      Object.entries(map.itemLists ?? {}).map(([key, e]) => [
        key,
        e.source?.route === alias ? { ...e, source: { ...e.source, route: 'home' } } : e
      ])
    )
  }
}

/**
 * The coverage file with its front page routed as `home`, by the map's own pages.
 * @param {object | null} coverage
 * @param {object} map the content map as the contract wrote it
 * @param {object | null} lock presentation-lock.json
 */
export function coverageWithHomeRoute(coverage, map, lock) {
  const alias = aliasOfFrontPage(map.pages ?? [], lock)
  if (!alias || !Array.isArray(coverage?.sitePages)) return coverage
  return {
    ...coverage,
    sitePages: coverage.sitePages.map((r) => (r.route === alias ? { ...r, route: 'home' } : r))
  }
}

/** The tags whose loss changes what a visitor sees of a title, as `content-coverage/lib/inline-markup.mjs` counts them. */
const KEPT_TAGS = new Set(['br', 'span', 'strong', 'em', 'b', 'i'])
const marks = (sample) => inlineOf(String(sample ?? '')).some((m) => KEPT_TAGS.has(m.tag))

/**
 * The content map with each text slot's inline markup taken from the map first and from the coverage file's
 * `inlineMarkup.samples` second: a sidecar sample replaces a map sample only when the map's marks nothing and both read
 * as the same words. A map that needs nothing comes back as it is.
 * @param {object} map
 * @param {object | null} coverage content-coverage.json
 */
export function withInlineMarkup(map, coverage) {
  const samples = coverage?.inlineMarkup?.samples
  if (!samples || typeof samples !== 'object') return map
  let taken = 0
  const slots = (map.slots ?? []).map((s) => {
    const markup = samples[s.key]
    if (isLiteralPreSlot(s) || s.type !== 'text' || typeof markup !== 'string' || marks(s.sample)) return s
    if (normText(markup) !== normText(s.sample)) return s
    taken++
    return { ...s, sample: markup }
  })
  return taken ? { ...map, slots } : map
}

/**
 * The sections of each WordPress page post, by post id, that this run read from the site (wordpress-sections.mjs);
 * null until a run sets them (cli.mjs, once, beside `usePlatform`), and the post contents then stay one block each.
 * @type {Record<string, object[]>|null}
 */
let wordpressSections = null

/** Settle, once per run, the WordPress page sections every read of the contract map splits pages by. */
export function useWordPressSections(sectionsByPost) {
  wordpressSections = sectionsByPost ?? null
}

/**
 * The parts of each EmDash page, by page path, that this run read from the site (site/emdash-sections-file.mjs); null
 * until a run sets them (cli.mjs, once, beside `usePlatform`), and the pages then stay header, main body and footer.
 * @type {Record<string, object>|null}
 */
let emdashSections = null
/** The served path of the file each picture slot holds, by slot key; null when the run could not read it. */
let emdashMedia = null

/** Settle, once per run, the EmDash page sections every read of the contract map splits pages by. */
export function useEmdashSections(sectionsByPath, mediaBySlot = null) {
  emdashSections = sectionsByPath ?? null
  emdashMedia = mediaBySlot ?? null
}

/**
 * The content map in the shape the kit reads, whatever the platform: a WordPress map lists no pages, so they are
 * derived from its page entities and the release inventory beside it (`wordpress-map.mjs`), each page's post content
 * split into its sections when the run read them; an EmDash map lists its pages but not what a page prints around its
 * entry, so their parts come from the run's reading of the site (`emdash-map.mjs`).
 * @param {object} map
 * @param {string} contract the contract folder
 */
function withPlatformShape(map, contract) {
  if (/\/emdash\//.test(String(map.schemaVersion ?? '')))
    return withEmdashPages(map, emdashSections, emdashMedia)
  const manifest = readIf(join(contract, 'manifest.json'))
  if (String(manifest?.platform ?? '').toLowerCase() !== 'wordpress') return map
  return withWordPressPages(map, readIf(join(contract, 'inventory.json')), wordpressSections)
}

/** @param {string} contract the contract folder: its content map with the inline markup carried beside it */
export const readContractSamples = (contract) =>
  withInlineMarkup(
    withPlatformShape(readJson(join(contract, 'content-map.json')), contract),
    readIf(join(contract, 'content-coverage.json'))
  )

/** Every string a module's params give under a key naming a position, JSON strings inside them read too. */
function positionsNamed(value, key = '', out = new Set()) {
  if (typeof value === 'string') {
    const t = value.trim()
    if (/^[[{]/.test(t)) {
      try {
        return positionsNamed(JSON.parse(t), key, out)
      } catch {}
    }
    if (/position/i.test(key) && t) out.add(t)
  } else if (Array.isArray(value)) for (const v of value) positionsNamed(v, key, out)
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) positionsNamed(v, k, out)
  return out
}

/**
 * The content map with each page's assigned module marked `inside` the module that prints it: a module whose params
 * name a position (an ACM block's `items_position_2`, JA Impact's "Stay connected" printing the `follow` position
 * where its "Follow us" icons sit) renders the modules of that position in its own markup, with no wrapper of theirs.
 * @param {object} map
 * @param {object | null} lock presentation-lock.json
 */
export function withModulesInside(map, lock) {
  const hostOf = new Map()
  for (const [key, e] of Object.entries(lock?.entities ?? {}))
    if (key.startsWith('module-') && String(e?.published) !== '0')
      for (const p of positionsNamed(e?.params)) if (!hostOf.has(p)) hostOf.set(p, key)
  if (!hostOf.size) return map
  return {
    ...map,
    pages: (map.pages ?? []).map((page) => {
      const here = new Set((page.assignedModules ?? []).map((a) => a.entity))
      return {
        ...page,
        assignedModules: (page.assignedModules ?? []).map((a) => {
          const host = hostOf.get(a.position)
          return host && host !== a.entity && here.has(host) ? { ...a, inside: host } : a
        })
      }
    })
  }
}

/** @param {string} contract the contract folder */
export const readContractMap = (contract) => {
  const lock = readIf(join(contract, 'presentation-lock.json'))
  return withModulesInside(withHomeRoute(readContractSamples(contract), lock), lock)
}

/** @param {string} contract the contract folder */
export const readContractCoverage = (contract) =>
  coverageWithHomeRoute(
    readIf(join(contract, 'content-coverage.json')),
    readJson(join(contract, 'content-map.json')),
    readIf(join(contract, 'presentation-lock.json'))
  )
