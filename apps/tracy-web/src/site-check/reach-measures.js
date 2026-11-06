// Three page measures of what a visitor reaches (ADR 0044, decisions 22, 23 and 24), each over the host's page measures:
//   list-rows      block, step 9  a list prints the rows the plan keeps (the write report's `rows`), and no printed item is empty:
//                                 no words and no picture
//   map-location   block, step 9  a map a kept page draws is not at the demo's place (the demo baseline's `maps`), and within
//                                 MAP_NEAR_KM of the business when the report knows its coordinates (`place`)
//   phone-callable block, step 0  a phone number of the brief a kept page prints sits inside a tel: link; the template prints it
//                                (step 9 when only a created page's own words print it, card AQ)
// A host from before these measures answers none of them, and the group is unmeasured.
import { TEMPLATE_STEP, WRITE_STEP } from '../lib/site-build-steps.js'
import { GroupUnmeasured } from './group-unmeasured.js'
import { pagesRead } from './host-pages.js'
import { createdPaths, pathOfMeasure } from './page-faults.js'

/** A printed map further than this from the business is somewhere else. */
export const MAP_NEAR_KM = 50
/** A printed map this close to the demo's is the demo's place. */
export const MAP_SAME_KM = 0.5

const each = (value) => (Array.isArray(value) ? value : [])
const words = (text) =>
  String(text ?? '')
    .replace(/\(\([^()]*\)\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const needs = (read, field, what) => {
  if (!read.measures.some((m) => Array.isArray(m[field])))
    throw new GroupUnmeasured(`The host answered no ${what} (\`${field}\`), so this was not measured.`)
}

/** Kilometres between two points on the earth. */
export function kmBetween(a, b) {
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}

// ── list-rows ──────────────────────────────────────────────────────────────────────────────────────────────────────

const entityOf = (key) => String(key ?? '').slice(0, String(key ?? '').lastIndexOf('.'))
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Whether `word` stands as a whole word in `text` (both as `words` gives them): "coach" is not in "coaching". */
const holdsWord = (text, word) =>
  new RegExp(`(?<![\\p{L}\\p{N}])${escaped(word)}(?![\\p{L}\\p{N}])`, 'u').test(text)
const usable = (w) => w.length >= 3 && w.length <= 60 && !/^(?:images\/|index\.php|https?:|\/)/.test(w)

/**
 * Which pages print each block, as measure paths, from inspect's `pages` (a page's own entity and its assigned modules).
 * @param {object[]} pages
 * @returns {Map<string, Set<string>>}
 */
export function blockPages(pages) {
  const out = new Map()
  const add = (entity, path) => {
    if (!entity) return
    if (!out.has(entity)) out.set(entity, new Set())
    out.get(entity).add(path)
  }
  for (const page of each(pages)) {
    const route = String(page?.route ?? '').replace(/^\/+/, '')
    const path = pathOfMeasure(route === '' || route === 'home' ? '/' : `/${route}`)
    add(page?.entity, path)
    for (const module of each(page?.assignedModules)) add(module?.entity, path)
  }
  return out
}

/**
 * @param {object} report the write report, with `rows` and its slot lines
 * @param {object[]} measures
 * @param {{ pagesOf?: Map<string, Set<string>> }} [where] which pages print each block (`blockPages`). Given, a row is looked
 *   for only on the pages that print its block, and a word another block printed there also wrote is no sign of the row (card
 *   AH: "Coach" in another block found another list). Without it every page is read and every other block's words are left out.
 */
export function judgeListRows(report, measures, { pagesOf } = {}) {
  const lines = each(report?.slots).filter((l) => l.status === 'written' && typeof l.ordered === 'string')
  const failures = []
  const unread = []
  let checked = 0
  for (const row of each(report?.rows)) {
    const keys = new Set(each(row.keptKeys))
    const entity = entityOf([...keys][0]) || String(row.block ?? '').replace(/^block-/, 'module-')
    const printedOn = pagesOf ? (pagesOf.get(entity) ?? new Set()) : null
    const own = lines
      .filter((l) => keys.has(l.key))
      .map((l) => words(l.ordered))
      .filter(usable)
    // Words other blocks on this page wrote: shared by them, they cannot tell this list from theirs.
    const othersOn = (path) =>
      lines
        .filter((l) => entityOf(l.key) !== entity && (!pagesOf || pagesOf.get(entityOf(l.key))?.has(path)))
        .map((l) => words(l.ordered))
    const found = each(measures)
      .filter((m) => !printedOn || printedOn.has(pathOfMeasure(m.path)))
      .flatMap((m) => {
        const others = othersOn(pathOfMeasure(m.path))
        // A value another block there wrote too ("Coach" under each person of two lists) is no sign of this list; a word another
        // block only says in a sentence (a masthead naming both coaches) still is (card AH follow-up).
        const said = own.filter((w) => !others.includes(w))
        return each(m.lists).map((list) => ({ m, list, said }))
      })
      .filter(({ list, said }) =>
        said.some((w) => each(list.items).some((it) => holdsWord(words(it.text), w)))
      )
    if (!found.length) {
      unread.push(row.list)
      continue
    }
    checked++
    // Per width, the list holding the most of the row's distinct words is this list, then the one with the most items holding a
    // written word (a wrapper holding the whole block is one such item), then the one with the fewest items, so a wider run of
    // siblings or a menu sharing one word is not taken for it.
    const distinct = ({ list, said }) =>
      new Set(said.filter((w) => each(list.items).some((it) => holdsWord(words(it.text), w)))).size
    const holding = ({ list, said }) =>
      each(list.items).filter((it) => said.some((w) => holdsWord(words(it.text), w))).length
    const want = Math.min(row.plan, row.demo)
    for (const width of new Set(found.map(({ m }) => m.width))) {
      const best = found
        .filter(({ m }) => m.width === width)
        .sort(
          (a, b) =>
            distinct(b) - distinct(a) || holding(b) - holding(a) || a.list.items.length - b.list.items.length
        )[0]
      const at = { page: best.m.path, width: best.m.width, slot: row.list }
      const items = each(best.list.items)
      if (items.length !== want)
        failures.push({
          ...at,
          measured: items.length,
          reason: `The plan keeps ${want} rows of ${row.list}, and the page prints ${items.length} (the write step kept ${row.kept})`
        })
      const empty = items.filter((it) => !it.chars && !it.pictures).length
      if (empty)
        failures.push({
          ...at,
          measured: empty,
          reason: `${empty} printed item${empty > 1 ? 's' : ''} of ${row.list} ${empty > 1 ? 'have' : 'has'} no words and no picture: an empty box`
        })
    }
  }
  return { checked, failures, unread }
}

export const listRowsGroup = {
  name: 'list-rows',
  causingStep: WRITE_STEP,
  async run(context) {
    const rows = each(context.report?.rows)
    if (!rows.length) return { checked: 0, notApplicable: 'the plan cuts no list', failures: [] }
    const read = await pagesRead(context)
    needs(read, 'lists', 'lists')
    const reading = await context.read('content.contract', { operation: 'inspect' })
    const { checked, failures, unread } = judgeListRows(context.report, read.measures, {
      pagesOf: blockPages(reading.pages)
    })
    if (!checked)
      throw new GroupUnmeasured(
        `None of the ${rows.length} lists the plan cuts was found printed, so nothing was measured.`
      )
    // Most lists found nowhere is no measure of the plan's cuts (decision 27): unmeasured, unless a list found already blocks.
    if (unread.length > checked && !failures.some((f) => f.level !== 'warn'))
      throw new GroupUnmeasured(
        `Only ${checked} of the ${rows.length} lists the plan cuts were found printed, so the cuts were not measured; not found: ${unread.join(', ')}.`
      )
    for (const list of unread)
      failures.push({ level: 'warn', slot: list, reason: `Not measured: ${list} was not found printed` })
    return { checked, failures }
  }
}

// ── map-location ───────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * @param {object[]} measures
 * @param {{ demoMaps?: object[], place?: { latitude: number, longitude: number } | null }} input
 */
export function judgeMapLocation(measures, { demoMaps = [], place = null }) {
  const failures = []
  const seen = new Set()
  let checked = 0
  const home = place ? { lat: Number(place.latitude), lng: Number(place.longitude) } : null
  for (const m of each(measures))
    for (const map of each(m.maps)) {
      const id = `${pathOfMeasure(m.path)} ${map.lat ?? ''} ${map.lng ?? ''} ${map.address ?? ''}`
      if (seen.has(id)) continue
      seen.add(id)
      checked++
      const at = { page: m.path, width: m.width, measured: map.address ?? `${map.lat}, ${map.lng}` }
      const point =
        Number.isFinite(map.lat) && Number.isFinite(map.lng) ? { lat: map.lat, lng: map.lng } : null
      const demo = each(demoMaps).find((d) =>
        point && Number.isFinite(d.lat)
          ? kmBetween(point, d) <= MAP_SAME_KM
          : !point && typeof d.address === 'string' && words(d.address) === words(map.address)
      )
      if (demo) {
        failures.push({ ...at, reason: `The ${map.kind} map is still at the demo's place (${at.measured})` })
        continue
      }
      if (point && home && kmBetween(point, home) > MAP_NEAR_KM)
        failures.push({
          ...at,
          reason: `The ${map.kind} map is ${Math.round(kmBetween(point, home))} km from the business, over ${MAP_NEAR_KM} km`
        })
    }
  return { checked, failures }
}

export const mapLocationGroup = {
  name: 'map-location',
  causingStep: WRITE_STEP,
  async run(context) {
    const read = await pagesRead(context)
    needs(read, 'maps', 'maps')
    const demoMaps = each(context.baseline?.maps)
    const place = context.report?.place ?? null
    if (!Array.isArray(context.baseline?.maps) && !place)
      throw new GroupUnmeasured(
        'Neither a demo baseline with maps nor the business coordinates are known, so where a map should be is not known.'
      )
    const judged = judgeMapLocation(read.measures, { demoMaps, place })
    // No page prints a map and the demo printed none either: nothing of this kind is on the site. A demo map gone, or no baseline, is unmeasured.
    const demoHasNone = Array.isArray(context.baseline?.maps) && !demoMaps.length
    return judged.checked || !demoHasNone
      ? judged
      : { ...judged, notApplicable: 'no page prints a map, and the demo baseline holds none' }
  }
}

// ── phone-callable ─────────────────────────────────────────────────────────────────────────────────────────────────

const sameNumber = (a, b) => a.length >= 7 && b.length >= 7 && a.slice(-9) === b.slice(-9)

/**
 * @param {object[]} measures
 * @param {string[]} phones the brief's phone numbers, digits only
 * @param {Set<string>} [created] the paths of the pages the write step created (page-faults.js createdPaths): a number left
 *   uncallable there and printed so on no other page is in the words the write step wrote, so it is step 9's (card AQ)
 */
export function judgePhoneCallable(measures, phones, created = new Set()) {
  const elsewhere = new Set()
  for (const m of each(measures))
    if (!created.has(pathOfMeasure(m.path)))
      for (const p of each(m.phones)) if (!p.inTel) elsewhere.add(`${p.digits} ${p.selector}`)
  const failures = []
  const seen = new Set()
  let checked = 0
  for (const m of each(measures))
    for (const p of each(m.phones)) {
      if (!phones.some((digits) => sameNumber(String(p.digits), digits))) continue
      checked++
      const id = `${pathOfMeasure(m.path)} ${p.digits} ${p.selector}`
      if (p.inTel || seen.has(id)) continue
      seen.add(id)
      failures.push({
        page: m.path,
        width: m.width,
        measured: p.text,
        reason: `The page prints the phone number ${p.text} (${p.selector}) outside a tel: link, so a visitor cannot tap it to call`,
        ...(created.has(pathOfMeasure(m.path)) && !elsewhere.has(`${p.digits} ${p.selector}`)
          ? { causingStep: WRITE_STEP }
          : {})
      })
    }
  return { checked, failures }
}

export const phoneCallableGroup = {
  name: 'phone-callable',
  causingStep: TEMPLATE_STEP,
  async run(context) {
    const phones = each(context.report?.phones)
    if (!phones.length)
      return { checked: 0, notApplicable: 'the write report names no brief phone number', failures: [] }
    const read = await pagesRead(context)
    needs(read, 'phones', 'phone numbers')
    return judgePhoneCallable(read.measures, phones, createdPaths(context.report))
  }
}
