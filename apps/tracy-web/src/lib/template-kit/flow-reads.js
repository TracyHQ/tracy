/**
 * What the Website opportunity flow reads from a template kit beyond its pictures, judged the way each flow step reads
 * it. A gate exists here only for a fact a flow step really reads; each names the step and the file that reads it.
 *
 *   kit-logo-unsettable         todo  a logo spot the page shows has neither a setting nor a frame the content map
 *                                     beside the kit holds: nothing can write the business logo there (brand step,
 *                                     `brand-step/gate-logo.js` reads `setting`, `kit-grounds.js` reads `frameId`)
 *   kit-brand-colour-from-link  todo  the template accent the brand step replaces (`brandColours.primary`,
 *                                     `brand-step/gate-name-colours.js`) paints links only: the new accent would
 *                                     recolour links and leave every button and fill in the demo colour
 *   kit-navigation-missing      todo  a menu block of the content map has no navigation group: the planner and the
 *                                     writer read footer columns and the main menu row limit from them
 *                                     (`lib/site-copy/contract-mapping.js`, `site-planner/plan-check/rules-menu.js`)
 *   kit-map-mismatch            todo  kit slots the content map beside it does not hold: the writer exports a copy
 *                                     slot under its content map key (`contract-mapping.js`), so the write door has
 *                                     no row for it. A kit captured on another map (a seed contract) shows here
 *   kit-front-page-group        todo  the front page is not the root and representative of its own group: the
 *                                     planner reads the home plan from that group's shot
 *   kit-brand-unreadable        todo  the brand step refuses the kit (`brandKitProblem`, the very check the brand
 *                                     bench runs before a run)
 *   kit-zip-missing             todo  the release lacks the kit's image zip, which the planner, the brand step and
 *                                     the picture step download before any model call (`lib/template-kit-images.js`)
 *   kit-demo-baseline-missing   todo  only for a template `demo-baseline-policy.json` opts in: no readable
 *                                     `demo-baseline.json` of this version beside the contract, which the site check's
 *                                     demo groups judge a written site against (`demo-baseline-file.js`)
 *   kit-setting-slot-missing    warn  a map button or a frame painted behind the blocks points at no setting slot:
 *                                     the planner leaves it to the demo (`rules-map-judgement.js`)
 *
 * Not gated, because no flow step reads it: the favicon setting (the brand step makes the favicon files from the
 * mark; nothing writes them through the kit), the Cowork pin hashes of `quickstarts.json` (Customize your site
 * STAB-1 compares the plugin's own bytes with the contract folder), slot ratios and planner data size (no step has a
 * hard limit: a large part is read by its entries).
 */
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { brandKitProblem } from '../../brand-step/kit-grounds.js'
import { contentMapKey } from '../content-map-key.js'
import { contractOfRelease } from '../slot-roles-of-release.js'
import { kitZipName } from '../template-kit-images.js'
import { BASELINE_FILE, baselineAskedOf } from './demo-baseline-file.js'
import { logoWritePath } from './logo-write-path.js'

/** The codes that hold Publish, in the order the step names them. */
export const FLOW_TODO_CODES = Object.freeze([
  'kit-logo-unsettable',
  'kit-brand-colour-from-link',
  'kit-navigation-missing',
  'kit-map-mismatch',
  'kit-front-page-group',
  'kit-brand-unreadable',
  'kit-zip-missing',
  'kit-demo-baseline-missing'
])

/** How many ids a gap names itself. */
const SHOWN = 8
const arr = (x) => (Array.isArray(x) ? x : [])
const some = (ids) => `${ids.slice(0, SHOWN).join(', ')}${ids.length > SHOWN ? ', ...' : ''}`

/**
 * @typedef {{ slotKeys: Set<string>, menuBlocks: string[], siteLogoBlock?: boolean }} KitMap what the flow reads of the content
 * map beside a kit; `siteLogoBlock` (WordPress only): whether the theme's header prints a Site Logo block
 */

/** @type {Map<string, { stamp: string, value: KitMap | null }>} */
const memo = new Map()

/**
 * The slot keys and menu blocks of a parsed content map, or null when there is none.
 * @param {any} map
 * @returns {KitMap | null}
 */
export function kitMapOf(map) {
  if (!map || typeof map !== 'object' || !Array.isArray(map.slots)) return null
  const slotKeys = new Set(map.slots.map((s) => s?.key).filter((k) => typeof k === 'string'))
  const blocks = map.menuBlocks && typeof map.menuBlocks === 'object' ? map.menuBlocks : {}
  const menuBlocks = Object.entries(blocks)
    .filter(([, b]) => arr(b?.items).length > 0)
    .map(([key, b]) => String(b?.block ?? key))
  return { slotKeys, menuBlocks }
}

/**
 * The content map beside the contract that seals this release's version, read again only when it changed.
 * @param {any} release
 * @param {import('../contracts.js').ContractIndex} contracts
 * @returns {KitMap | null}
 */
export function kitMapOfRelease(release, contracts) {
  const dir = contractOfRelease(release, contracts)?.dir ?? null
  if (!dir) return null
  const file = path.join(dir, 'content-map.json')
  let stamp = 'missing'
  try {
    const stat = statSync(file)
    stamp = `${stat.mtimeMs}:${stat.size}`
  } catch {
    return null
  }
  const seen = memo.get(file)
  if (seen && seen.stamp === stamp) return withSiteLogo(seen.value, dir)
  let value = null
  try {
    value = kitMapOf(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    value = null
  }
  memo.set(file, { stamp, value })
  return withSiteLogo(value, dir)
}

/** @type {Map<string, { stamp: string, value: boolean }>} */
const siteLogoMemo = new Map()

/**
 * Whether a WordPress theme's header template part prints a Site Logo block, read from the raw markup captured beside
 * the contract (`navigation-source.json`). Undefined when the contract holds none (Joomla, or an unreadable capture).
 * @param {string} dir
 * @returns {boolean | undefined}
 */
export function headerSiteLogoBlockOf(dir) {
  const file = path.join(dir, 'navigation-source.json')
  let stamp
  try {
    const stat = statSync(file)
    stamp = `${stat.mtimeMs}:${stat.size}`
  } catch {
    return undefined
  }
  const seen = siteLogoMemo.get(file)
  if (seen && seen.stamp === stamp) return seen.value
  let value
  try {
    const doc = JSON.parse(readFileSync(file, 'utf8'))
    const parts = [...arr(doc?.templateParts), ...arr(doc?.themeParts)]
    value = parts.some(
      (p) =>
        (p?.area === 'header' || p?.slug === 'header') &&
        typeof p?.content === 'string' &&
        /<!-- wp:site-logo(?:\s|\/|-->)/.test(p.content)
    )
  } catch {
    value = undefined
  }
  siteLogoMemo.set(file, { stamp, value })
  return value
}

function withSiteLogo(map, dir) {
  if (!map) return map
  const siteLogoBlock = headerSiteLogoBlockOf(dir)
  return siteLogoBlock === undefined ? map : { ...map, siteLogoBlock }
}

/** Every copy slot id of the kit's blocks, lists and rows; an icon is written through its field, not its own key. */
function kitSlotIds(doc) {
  const ids = new Set()
  const walk = (slots) => {
    for (const s of arr(slots)) {
      if (typeof s?.id === 'string' && s.type !== 'icon') ids.add(s.id)
      walk(s?.slots)
    }
  }
  for (const b of arr(doc.blocks)) {
    walk(b?.slots)
    for (const l of arr(b?.lists)) {
      walk(l?.rowSlots)
      for (const r of arr(l?.rows)) walk(r?.slots)
    }
  }
  return ids
}

/** The ids of the logo spots the page shows that the write step cannot write (its own decision, `logoWritePath`). */
function unsettableLogoIds(site, map) {
  const world = map ? { frameKnown: (key) => map.slotKeys.has(key), siteLogoBlock: map.siteLogoBlock } : {}
  const writes = (s) => logoWritePath(s, world).via !== 'none'
  return arr(site.logoSpots)
    .filter((s) => arr(s?.shownIn).length > 0 && !writes(s))
    .map((s) => String(s.id))
}

function logoGap(site, map) {
  // The write step's own decision, so a spot passes here only when the write step can write it.
  const ids = unsettableLogoIds(site, map)
  if (ids.length === 0) return null
  return {
    code: 'kit-logo-unsettable',
    spots: ids.slice(0, SHOWN),
    reason: `${ids.length} logo spot${ids.length === 1 ? '' : 's'} the page shows ${ids.length === 1 ? 'has' : 'have'} no setting the write step can write and no content map frame: ${some(ids)}`
  }
}

/** A role that paints links only: `link`, or a variable named after links. */
const LINK_ROLE = /link/i
/** A stylesheet token named as the template accent: a primary colour or fill, or an accent variable. */
const ACCENT_TOKEN = /(^|[-@])(brand-primary|color-primary|primary|primary-bg)$|^--(ds-)?(c-)?accent$/i

function colourGap(site) {
  const primary = site.brandColours?.primary
  const roles = arr(primary?.roles).map(String)
  if (!primary?.value || roles.length === 0 || !roles.every((r) => LINK_ROLE.test(r))) return null
  const candidates = arr(site.brandColours?.tokens)
    .filter((t) => ACCENT_TOKEN.test(String(t?.name)))
    .slice(0, 3)
    .map((t) => ({ name: String(t.name), value: String(t.value) }))
  const hint = candidates.length
    ? `; the stylesheet declares ${candidates.map((c) => `${c.name} ${c.value}`).join(', ')}`
    : ''
  return {
    code: 'kit-brand-colour-from-link',
    colour: String(primary.value),
    roles,
    candidates,
    reason: `the template accent ${primary.value} is read from the link colour only${hint}`
  }
}

function navigationGap(site, map) {
  if (!map || map.menuBlocks.length === 0) return null
  const held = new Set(arr(site.navigationGroups).map((g) => contentMapKey(g?.block)))
  // Named by kit block id (`block-7`), as every other id of the kit is.
  const missing = map.menuBlocks
    .filter((b) => !held.has(contentMapKey(b)))
    .map((b) => b.replace(/^module-/, 'block-'))
  if (missing.length === 0) return null
  return {
    code: 'kit-navigation-missing',
    menus: missing.slice(0, SHOWN),
    reason: `${missing.length} menu block${missing.length === 1 ? '' : 's'} of the content map ${missing.length === 1 ? 'has' : 'have'} no navigation group in the kit: ${some(missing)}`
  }
}

function mapGap(doc, map) {
  if (!map) return null
  const missing = [...kitSlotIds(doc)].filter((id) => !map.slotKeys.has(contentMapKey(id)))
  if (missing.length === 0) return null
  return {
    code: 'kit-map-mismatch',
    slots: missing.slice(0, SHOWN),
    count: missing.length,
    reason: `${missing.length} kit slot${missing.length === 1 ? ' is' : 's are'} not in the content map beside it: ${some(missing)}`
  }
}

function frontPageGap(doc) {
  const page = arr(doc.pages).find((p) => p?.path === '/')
  const groups = arr(doc.pageGroups)
  if (!page) return { code: 'kit-front-page-group', reason: 'the kit lists no front page (path /)' }
  const own = groups.find((g) => g?.root === page.id)
  const member = groups.find((g) => arr(g?.children).includes(page.id))
  if (own && !member && (own.representative ?? page.id) === page.id) return null
  const where = member
    ? `it sits in group ${member.id}`
    : own
      ? 'it is not its group representative'
      : 'it has no group'
  return {
    code: 'kit-front-page-group',
    page: String(page.id),
    reason: `the front page has no group and shot of its own: ${where}`
  }
}

function settingSlotGap(doc) {
  const buttons = []
  const frames = []
  for (const b of arr(doc.blocks)) {
    for (const l of arr(b?.links))
      if (l?.opens?.shows === 'map' && !l.opens.slotId) buttons.push(String(b.id))
    for (const f of arr(b?.frames))
      if (f?.paintedBehind === true && !f.slotId && !arr(f.writesTo).length) frames.push(String(f.id))
  }
  if (buttons.length + frames.length === 0) return null
  const parts = [
    buttons.length
      ? `${buttons.length} map button${buttons.length === 1 ? '' : 's'} (${some(buttons)})`
      : null,
    frames.length
      ? `${frames.length} frame${frames.length === 1 ? '' : 's'} painted behind (${some(frames)})`
      : null
  ].filter(Boolean)
  return {
    code: 'kit-setting-slot-missing',
    buttons: buttons.slice(0, SHOWN),
    frames: frames.slice(0, SHOWN),
    reason: `${parts.join(' and ')} point at no setting slot`
  }
}

/**
 * The demo baseline an opted in template must carry beside its contract, or null. Not asked when `baseline` is left out.
 * @param {any} release
 * @param {import('./demo-baseline-file.js').DemoBaseline | undefined} baseline
 */
function baselineGap(release, baseline) {
  if (baseline === undefined || baseline.state === 'read' || !baselineAskedOf(release)) return null
  return {
    code: 'kit-demo-baseline-missing',
    baselineState: baseline.state,
    reason:
      baseline.state === 'none' ? `there is no ${BASELINE_FILE} beside the contract` : `${baseline.reason}`
  }
}

/** Whether the brand step's refusal is only about logo spots the logo gap already names. */
function saidByLogoGap(brand, unsettable) {
  const listed = /logo spots[^:]*: (.+)$/.exec(brand)?.[1]
  if (!listed) return false
  return listed.split(', ').every((id) => unsettable.includes(id))
}

/**
 * Every fact the flow reads that this kit gets wrong, todo ones first in `FLOW_TODO_CODES` order, then the warnings.
 * @param {any} doc the parsed kit
 * @param {{ map?: KitMap | null, release?: any }} [world] `map`: the content map beside the kit (`kitMapOfRelease`),
 *   null skips the checks that need it; `release`: its assets name the kit zip (a local pack carries none); `baseline`:
 *   the demo baseline beside the contract (`baselineOfRelease`), asked of the templates the baseline policy opts in;
 *   left out, it is not asked
 * @returns {{ code: string, severity: 'todo' | 'warn', reason: string, [k: string]: unknown }[]}
 */
export function flowGapsOf(doc, { map = null, release = null, baseline = undefined } = {}) {
  const site = doc?.site && typeof doc.site === 'object' ? doc.site : {}
  const gaps = [
    logoGap(site, map),
    colourGap(site),
    navigationGap(site, map),
    mapGap(doc, map),
    frontPageGap(doc)
  ]
  const brand = brandKitProblem(doc, { siteLogoBlock: map?.siteLogoBlock })
  // The brand step names a spot without a frame too: said once, by the logo gap, but only when the logo gap names
  // every spot the brand step refuses. A spot only the brand step refuses (on WordPress, a site_logo spot whose header
  // prints no Site Logo block) is still its own gap, whatever other spot the logo gap names.
  if (brand && !saidByLogoGap(brand, unsettableLogoIds(site, map)))
    gaps.push({ code: 'kit-brand-unreadable', reason: brand })
  if (release && !release.local && Array.isArray(release.assets)) {
    const file = kitZipName(doc)
    if (!release.assets.some((a) => a?.name === file))
      gaps.push({ code: 'kit-zip-missing', file, reason: `the release has no asset ${file}` })
  }
  gaps.push(baselineGap(release, baseline))
  const todo = gaps.filter(Boolean).map((g) => ({ ...g, severity: /** @type {const} */ ('todo') }))
  todo.sort((a, b) => FLOW_TODO_CODES.indexOf(a.code) - FLOW_TODO_CODES.indexOf(b.code))
  const warn = [settingSlotGap(doc)]
    .filter(Boolean)
    .map((g) => ({ ...g, severity: /** @type {const} */ ('warn') }))
  return [...todo, ...warn]
}
