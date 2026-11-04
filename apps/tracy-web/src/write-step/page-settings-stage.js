// The page settings stage (ADR 0044, decision 4, item 4). It runs last, after the contract call, and writes what the
// contract door does not take: the kit's setting slots (a contact's mobile line, the map a page prints), each page's
// title and description, and the main menu items the plan hides. It follows the kit's own fields (`writable`, `writeTo`,
// `valueFormat`) and names no id or template. Every item gets a result by line slot; a refusal is `failed` in the
// plugin's words and does not stop the rest. The 404 page has no door yet and is reported skipped, and the pages a plan creates
// are page-create-stage.js's, whose results stand over these. What
// the last report says the site holds is not written again, and reads as written.
import { contentMapKey } from '../lib/site-copy/contract-mapping.js'
import { NO_LAST } from './no-last-report.js'
import { writePageMeta } from './page-meta-write.js'
import { doorCall, readRow } from './settings-door.js'

const each = (value) => (Array.isArray(value) ? value : [])
const ENTITY = /^([A-Za-z]+)-(\d+)$/

/** A copy value as one plain line: the content map markup of a list of paragraphs goes, the words stay. */
const oneLine = (value) =>
  String(value ?? '')
    .replace(/\(\(\/?[a-z]+\)\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** A value inside a JSON string, as the kit's `valueFormat` asks: no single quote, no line break. */
const jsonText = (value) => JSON.stringify(oneLine(value).replace(/'/g, '’')).slice(1, -1)

/** The whole column of a setting written from its `writeTo.template`; latitude and longitude only as a pair. */
function filledTemplate(template, address, place) {
  const pair = [place?.latitude, place?.longitude].map((n) =>
    Number.isFinite(Number(n)) && n !== '' ? String(n) : ''
  )
  const [latitude, longitude] = pair.every(Boolean) ? pair : ['', '']
  const values = { address: jsonText(address), latitude, longitude }
  return template.replace(/<(address|latitude|longitude)>/g, (_, name) => values[name])
}

/** The write of one setting slot as `{ kind, id, column, value }`, or the reason it cannot be written. */
function settingWrite(setting, value, place) {
  if (setting.writable !== true) return { reason: 'the kit marks this setting slot as not writable' }
  const target = setting.writeTo ?? {}
  if (target.action) return { reason: `${target.action} writes this setting, not the page settings stage` }
  const entity = ENTITY.exec(String(target.entity ?? ''))
  if (!entity || typeof target.column !== 'string')
    return { reason: 'the kit names no content map entity and column to write this setting to' }
  const whole = typeof target.template === 'string' && target.whole === true
  return {
    kind: entity[1],
    id: Number(entity[2]),
    column: target.column,
    value: whole ? filledTemplate(target.template, value, place) : oneLine(value)
  }
}

/** The brief's address, when it may go on the site: what a map setting no copy names is written from. */
function addressOf(brief) {
  const fact = each(brief?.facts).find(
    (f) => f?.field === 'address' && f.onSite !== false && typeof f.value === 'string' && f.value.trim()
  )
  return fact ? fact.value.trim() : null
}

const pairOf = (v) => {
  const lat = Number(v?.latitude ?? v?.lat)
  const lng = Number(v?.longitude ?? v?.lng)
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { latitude: lat, longitude: lng }
    : null
}

/**
 * The coordinates of the business: the run's place, else a coordinates fact of the brief, else the Google place record's location.
 * Null when none says where it is: the map then looks the address up itself.
 */
export function coordinatesOf(place, brief) {
  if (pairOf(place)) return pairOf(place)
  for (const f of each(brief?.facts))
    if (
      /^(?:location|coordinates|geo)$/.test(String(f?.field ?? '')) &&
      f.onSite !== false &&
      pairOf(f.value)
    )
      return pairOf(f.value)
  return pairOf(brief?.googlePlace?.location)
}

/** A map setting the run cannot write is refused with the need, never left silent (ADR 0044, decision 23). */
const mapRefused = (reason) => ({ status: 'refused', reason })

async function writeSettings({ call, kit, sent, place, results, last, brief = null }) {
  const coordinates = coordinatesOf(place, brief)
  for (const setting of each(kit?.site?.settingSlots)) {
    const named = sent[contentMapKey(setting.id)]
    const isMap = setting.kind === 'map-location'
    // A map setting no copy names still moves to the business: its address is the brief's address fact.
    const value = typeof named === 'string' ? named : isMap ? addressOf(brief) : null
    if (typeof value !== 'string') {
      if (isMap)
        results.set(
          setting.id,
          mapRefused(
            'the map stays at the demo place: no copy value and no address fact of the brief to write it from'
          )
        )
      continue
    }
    const order = settingWrite(setting, value, coordinates)
    if (order.reason) {
      results.set(setting.id, isMap ? mapRefused(order.reason) : { status: 'skipped', reason: order.reason })
      continue
    }
    if (last.same(setting.id, order.value)) {
      results.set(setting.id, {
        status: 'written',
        ordered: order.value,
        readFrom: readRow(order.kind, order.id, order.column)
      })
      continue
    }
    try {
      await call('content.update', {
        kind: order.kind,
        id: order.id,
        fields: { [order.column]: order.value }
      })
      results.set(setting.id, {
        status: 'written',
        ordered: order.value,
        readFrom: readRow(order.kind, order.id, order.column)
      })
    } catch (error) {
      results.set(setting.id, { status: 'failed', reason: error.message, ordered: order.value })
    }
  }
}

/** Pages of the copy with no kit page: the 404 page, which nothing writes yet, and any the plan does not ask to create. */
function pagesWithoutDoor(pages, results) {
  for (const page of Object.keys(pages ?? {}))
    results.set(page, {
      status: 'skipped',
      reason:
        page === 'notFound'
          ? 'the 404 page is the template error page, not a page of the site, and no door writes it yet'
          : 'the copy holds this page and the plan does not ask to create it'
    })
}

/**
 * @param {{ door: { apply: Function }, siteKey: string, kit: object, sent: Record<string, string>,
 *   extras: { pageMeta?: object, pages?: object, mainMenu?: { menutype?: string | null, hide?: object[] } },
 *   place?: { latitude: unknown, longitude: unknown } | null, isCancelled?: () => Promise<boolean>, last?: object }} input
 *   `sent`: the mapping's changes before routing, by content map key
 * @returns {Promise<{ results: Map<string, object>, cancelled: boolean, lines?: object[] }>} results by report line slot; `lines`:
 *   one per map setting no copy names, which no claim's line carries
 */
export async function runPageSettings({
  door,
  siteKey,
  kit,
  sent,
  extras,
  place = null,
  isCancelled = async () => false,
  last = NO_LAST,
  brief = null
}) {
  const read = doorCall(door, siteKey)
  // The door requires an apply id on a write; a record of one stage shares one, so the site's log reads as one change.
  const applyId = `settings-${Date.now().toString(36)}`
  const call = (action, params) =>
    read(action, action === 'content.update' ? { apply_id: applyId, ...params } : params)
  const results = new Map()
  await writeSettings({ call, kit, sent, place, results, last, brief })
  pagesWithoutDoor(extras.pages, results)
  if (await isCancelled()) return { results, cancelled: true }
  await writePageMeta({
    call,
    kit,
    pageMeta: extras.pageMeta,
    hide: extras.mainMenu?.hide,
    menutype: extras.mainMenu?.menutype ?? null,
    results,
    last
  })
  return { results, cancelled: false, lines: mapLines(kit, sent, results) }
}

/** A line for each map setting no copy names: its result would otherwise go on no line of the report. */
function mapLines(kit, sent, results) {
  return each(kit?.site?.settingSlots)
    .filter(
      (s) => s?.kind === 'map-location' && typeof sent[contentMapKey(s.id)] !== 'string' && results.has(s.id)
    )
    .map((s) => ({
      slot: s.id,
      key: null,
      owner: 'plan',
      part: 'map-location',
      readBack: null,
      ...results.get(s.id)
    }))
}
