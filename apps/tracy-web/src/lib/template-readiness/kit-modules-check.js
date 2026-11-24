/**
 * The kit modules check of the readiness verdict (piece `template-kit`): every module the demo assigns to a page of the
 * kit, published, public, holding slots of the content map and printed in a position where the kit knows other blocks,
 * is a block of the kit (its source, or contained by one). A module the kit never read is a block no plan decides and no
 * write step touches: its demo words, pictures and buttons reach every customer site as the demo had them.
 *
 * Met on JA Diner 1.0.8 (dev, 16/11/2026): the kit, built by template-kit 3.1.0, has no block for the home page's
 * "Meet Three Broomsticks." features (module-95, T3 `Section95` chrome, captured only since 3.1.1) nor for "Meet Our Chef."
 * (module-104), so the Arabian Tea House build kept two demo pictures and two buttons to pages the plan hid.
 *
 * EmDash: the same question asked of sections, `kit-sections-missing` (`sectionsMissingFromKit`). WordPress stays out: its
 * map holds no page assignments of blocks to compare with.
 *
 * Read from what the repository holds (the kit, the content map's page assignments), nothing is crawled. The position test
 * keeps a module of a position the kit holds no block in (a copyright line, an off-canvas menu) out: whether the layout
 * prints such a position is not known here.
 *
 *   null   every such module is a block of the kit, or the check does not apply (no kit, no map, not Joomla)
 *   todo   `kit-modules-missing`, `{ modules: [{ module, position, pages }], moduleNames, fix }`; `warn` on a release already shown on
 *          Design inspiration (it is never taken off for it)
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { contractFor } from '../contracts.js'
import { shownOnInspiration } from '../quickstart-releases.js'
import { kitOfRelease } from '../template-kit/road-step.js'
import { fixOf } from './fixes.js'

const each = (value) => (Array.isArray(value) ? value : [])

/** The kit path of a content map page's route (`home` is the front page). */
const pathOfRoute = (route) =>
  route === 'home' || route === '' || route == null ? '/' : `/${String(route).replace(/^\/+/, '')}`

/**
 * @param {any} kit the kit document
 * @param {any} map the content map
 * @returns {{ module: string, position: string, pages: string[] }[]}
 */
export function modulesMissingFromKit(kit, map) {
  const known = new Set()
  const positions = new Set()
  for (const block of each(kit?.blocks)) {
    const source = block?.source ?? {}
    if (typeof source.entity === 'string') known.add(source.entity)
    for (const inner of each(source.contains)) known.add(inner)
    if (typeof source.position === 'string' && source.position) positions.add(source.position)
  }
  const slotted = new Set(each(map?.slots).map((s) => s?.entity))
  const kitPaths = new Set(each(kit?.pages).map((p) => p?.path))
  /** @type {Map<string, { module: string, position: string, pages: string[] }>} */
  const out = new Map()
  for (const page of each(map?.pages)) {
    const at = pathOfRoute(page?.route)
    if (!kitPaths.has(at)) continue
    for (const a of each(page?.assignedModules)) {
      const module = a?.entity
      if (typeof module !== 'string' || known.has(module) || !slotted.has(module)) continue
      if (String(a.published) !== '1' || String(a.access) !== '1') continue
      if (!positions.has(a.position)) continue
      const entry = out.get(module) ?? { module, position: a.position, pages: [] }
      if (!entry.pages.includes(at)) entry.pages.push(at)
      out.set(module, entry)
    }
  }
  return [...out.values()].sort((a, b) => (a.module < b.module ? -1 : 1))
}

/** Slot entities that are no section: the page entries, the settings, the shared chrome (held by the header and footer). */
const NOT_SECTION = /^(pages|posts|taxonomy|chrome)\./

/** The ids of every slot a kit block lists as its own (slots, demo-owned, frames, rows of its lists, links, fixed text). */
function slotIdsHeldByKit(kit) {
  const ids = new Set()
  const walk = (o) => {
    if (Array.isArray(o)) o.forEach(walk)
    else if (o && typeof o === 'object') {
      if (typeof o.id === 'string') ids.add(o.id)
      for (const v of Object.values(o)) walk(v)
    }
  }
  for (const b of each(kit?.blocks))
    walk([b?.slots, b?.lists, b?.frames, b?.demoOwned, b?.links, b?.fixedText])
  return ids
}

/**
 * EmDash: the sections of the content map (an entry of a section collection, entity `<collection>.<slug>`) that hold
 * visual slots and are no block of the kit. The kit names the block of a section that prints one entry of its own
 * `block-<collection>-<slug>` (adapters/emdash-map.mjs `partEntity`); a section printed with others lives in a block named
 * after its page and position, and then holds its slots by id. So a section is in the kit when that block exists (its
 * source, or contained by one) or when a block holds any of its visual slots.
 *
 * The committed map says no page prints a section (the page parts are read from the site at kit build and kept in the
 * work folder's emdash-sections.json). When the map does carry `pages[].assignedModules` (the map of a kit run), only
 * sections printed on a page the kit holds are judged; else every section is, and `pages` is empty.
 * @param {any} kit the kit document
 * @param {any} map the content map
 * @returns {{ section: string, slots: number, pages: string[] }[]}
 */
export function sectionsMissingFromKit(kit, map) {
  const known = new Set()
  for (const block of each(kit?.blocks)) {
    const source = block?.source ?? {}
    if (typeof source.entity === 'string') known.add(source.entity)
    for (const inner of each(source.contains)) known.add(inner)
  }
  const held = slotIdsHeldByKit(kit)
  const kitPaths = new Set(each(kit?.pages).map((p) => p?.path))
  const printedOn = new Map()
  let assigned = false
  for (const page of each(map?.pages)) {
    if (!Array.isArray(page?.assignedModules)) continue
    assigned = true
    const at = pathOfRoute(page?.openAs ?? page?.route)
    for (const a of page.assignedModules) {
      if (typeof a?.entity !== 'string') continue
      printedOn.set(a.entity, [...(printedOn.get(a.entity) ?? []), at])
    }
  }
  /** @type {Map<string, { section: string, slots: number, held: boolean }>} */
  const sections = new Map()
  for (const s of each(map?.slots)) {
    const entity = s?.entity
    if (s?.nonVisual || typeof entity !== 'string' || !entity.includes('.') || NOT_SECTION.test(entity))
      continue
    const e = sections.get(entity) ?? { section: entity, slots: 0, held: false }
    e.slots += 1
    if (held.has(s.key)) e.held = true
    sections.set(entity, e)
  }
  const out = []
  for (const { section, slots, held: isHeld } of sections.values()) {
    if (isHeld || known.has(`block-${section.replace('.', '-')}`)) continue
    const pages = assigned
      ? (printedOn.get(`block-${section.replace('.', '-')}`) ?? []).filter((p) => kitPaths.has(p))
      : []
    if (assigned && !pages.length) continue
    out.push({ section, slots, pages: [...new Set(pages)] })
  }
  return out.sort((a, b) => (a.section < b.section ? -1 : 1))
}

export const KIT_MODULES_CHECK = Object.freeze({
  piece: 'template-kit',
  step: 'kit-modules',
  judge(release, world) {
    if (release?.platform !== 'joomla' && release?.platform !== 'emdash') return null
    const kit = world?.templateKit ?? kitOfRelease(release, world?.contracts ?? new Map())
    if (kit?.state !== 'read') return null
    let map = world?.contentMap
    if (map === undefined) {
      const version = typeof release?.setting?.version === 'string' ? release.setting.version : undefined
      const dir = contractFor(world?.contracts ?? new Map(), release?.tag, version)?.dir
      if (!dir) return null
      try {
        map = JSON.parse(readFileSync(path.join(dir, 'content-map.json'), 'utf8'))
      } catch {
        return null
      }
    }
    if (release.platform === 'emdash') {
      const sections = sectionsMissingFromKit(kit.doc, map)
      if (!sections.length) return null
      const sectionNames = sections.map((m) => m.section).join(', ')
      return {
        state: shownOnInspiration(release) ? 'warn' : 'todo',
        code: 'kit-sections-missing',
        params: { sections, sectionNames, fix: fixOf('kit-sections-missing', { sectionNames }).text }
      }
    }
    const modules = modulesMissingFromKit(kit.doc, map)
    if (!modules.length) return null
    const names = modules.map((m) => m.module).join(', ')
    return {
      state: shownOnInspiration(release) ? 'warn' : 'todo',
      code: 'kit-modules-missing',
      params: { modules, moduleNames: names, fix: fixOf('kit-modules-missing', { moduleNames: names }).text }
    }
  }
})
