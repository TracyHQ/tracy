// Three page measures of what a visitor reaches (ADR 0044, decisions 22, 23 and 24), each over the host's page measures:
//   list-rows      block, step 9  a list prints the rows the plan keeps (the write report's `rows`), and no printed item is empty:
//                                 no words and no picture
//   map-location   block, step 9  a map a kept page draws is not at the demo's place (the demo baseline's `maps`), and within
//                                 MAP_NEAR_KM of the business when the report knows its coordinates (`place`)
//   phone-callable block, step 0  a phone number of the brief a kept page prints sits inside a tel: link; the template prints it
// A host from before these measures answers none of them, and the group is unmeasured.
import { TEMPLATE_STEP, WRITE_STEP } from '../lib/site-build-steps.js'
import { GroupUnmeasured } from './group-unmeasured.js'
import { pagesRead } from './host-pages.js'
import { pathOfMeasure } from './page-faults.js'

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

/**
 * @param {object} report the write report, with `rows` and its slot lines
 * @param {object[]} measures
 */
export function judgeListRows(report, measures) {
  const lines = each(report?.slots)
  const failures = []
  const unread = []
  let checked = 0
  for (const row of each(report?.rows)) {
    const keys = new Set(each(row.keptKeys))
    const said = lines
      .filter((l) => keys.has(l.key) && l.status === 'written' && typeof l.ordered === 'string')
      .map((l) => words(l.ordered))
      .filter((w) => w.length >= 3 && w.length <= 60 && !/^(?:images\/|index\.php|https?:|\/)/.test(w))
    const found = each(measures)
      .flatMap((m) => each(m.lists).map((list) => ({ m, list })))
      .filter(({ list }) => said.some((w) => each(list.items).some((it) => words(it.text).includes(w))))
    if (!found.length) {
      unread.push(row.list)
      continue
    }
    checked++
    // The list with the most items holding a written word is this list (a wrapper holding the whole block is one such item), and
    // of those the one with the fewest items, so a wider run of siblings is not taken for it.
    const holding = (list) =>
      each(list.items).filter((it) => said.some((w) => words(it.text).includes(w))).length
    const best = found.sort(
      (a, b) => holding(b.list) - holding(a.list) || a.list.items.length - b.list.items.length
    )[0]
    const want = Math.min(row.plan, row.demo)
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
  return { checked, failures, unread }
}

export const listRowsGroup = {
  name: 'list-rows',
  causingStep: WRITE_STEP,
  async run(context) {
    const rows = each(context.report?.rows)
    if (!rows.length) return { checked: 0, failures: [] }
    const read = await pagesRead(context)
    needs(read, 'lists', 'lists')
    const { checked, failures, unread } = judgeListRows(context.report, read.measures)
    if (!checked)
      throw new GroupUnmeasured(
        `None of the ${rows.length} lists the plan cuts was found printed, so nothing was measured.`
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
    return judgeMapLocation(read.measures, { demoMaps, place })
  }
}

// ── phone-callable ─────────────────────────────────────────────────────────────────────────────────────────────────

const sameNumber = (a, b) => a.length >= 7 && b.length >= 7 && a.slice(-9) === b.slice(-9)

/**
 * @param {object[]} measures
 * @param {string[]} phones the brief's phone numbers, digits only
 */
export function judgePhoneCallable(measures, phones) {
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
        reason: `The page prints the phone number ${p.text} (${p.selector}) outside a tel: link, so a visitor cannot tap it to call`
      })
    }
  return { checked, failures }
}

export const phoneCallableGroup = {
  name: 'phone-callable',
  causingStep: TEMPLATE_STEP,
  async run(context) {
    const phones = each(context.report?.phones)
    if (!phones.length) return { checked: 0, failures: [] }
    const read = await pagesRead(context)
    needs(read, 'phones', 'phone numbers')
    return judgePhoneCallable(read.measures, phones)
  }
}
