// The page settings stage (ADR 0044, decision 4, item 4). It runs last, after the contract call, and writes what the
// contract door does not take: the kit's setting slots (a contact's mobile line, the map a page prints), each page's
// title and description, and the main menu items the plan hides. It follows the kit's own fields (`writable`, `writeTo`,
// `valueFormat`) and names no id or template. Every item gets a result by line slot; a refusal is `failed` in the
// plugin's words and does not stop the rest. The legal pages and the 404 page have no door yet and are reported skipped.
import { contentMapKey } from '../site-writer/contract-mapping.js'
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

async function writeSettings({ call, kit, sent, place, results }) {
  for (const setting of each(kit?.site?.settingSlots)) {
    const value = sent[contentMapKey(setting.id)]
    if (typeof value !== 'string') continue
    const order = settingWrite(setting, value, place)
    if (order.reason) {
      results.set(setting.id, { status: 'skipped', reason: order.reason })
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

/** Legal pages and the 404 page: nothing writes them yet, and each says so. */
function pagesWithoutDoor(pages, results) {
  for (const page of Object.keys(pages ?? {}))
    results.set(page, {
      status: 'skipped',
      reason:
        page === 'notFound'
          ? 'the 404 page is the template error page, not a page of the site, and no door writes it yet'
          : 'a created legal page needs an article and a menu item, and no door creates them yet'
    })
}

/**
 * @param {{ door: { apply: Function }, siteKey: string, kit: object, sent: Record<string, string>,
 *   extras: { pageMeta?: object, pages?: object, mainMenu?: { menutype?: string | null, hide?: object[] } },
 *   place?: { latitude: unknown, longitude: unknown } | null, isCancelled?: () => Promise<boolean> }} input
 *   `sent`: the mapping's changes before routing, by content map key
 * @returns {Promise<{ results: Map<string, object>, cancelled: boolean }>} results by report line slot
 */
export async function runPageSettings({
  door,
  siteKey,
  kit,
  sent,
  extras,
  place = null,
  isCancelled = async () => false
}) {
  const call = doorCall(door, siteKey)
  const results = new Map()
  await writeSettings({ call, kit, sent, place, results })
  pagesWithoutDoor(extras.pages, results)
  if (await isCancelled()) return { results, cancelled: true }
  await writePageMeta({
    call,
    kit,
    pageMeta: extras.pageMeta,
    hide: extras.mainMenu?.hide,
    menutype: extras.mainMenu?.menutype ?? null,
    results
  })
  return { results, cancelled: false }
}
