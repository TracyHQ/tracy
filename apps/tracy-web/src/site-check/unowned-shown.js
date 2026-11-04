// Unowned slots that still show: the write report lists the kept-block slots no step owns. One a visitor sees on a kept page is the
// template's demo showing, which blocks. One that holds words or a picture and shows nowhere is a warning, as is any of them when the
// host could not say what the pages show.
import { menuRows } from '../write-step/page-meta-write.js'
import { GroupUnmeasured } from './group-unmeasured.js'
import { keptPaths, pagesRead } from './host-pages.js'
import { whereShown } from './page-measures.js'

const keyOf = (slot) => String(slot ?? '').replace(/^block-/, 'module-')
const entityOf = (key) => key.slice(0, key.lastIndexOf('.'))
const each = (value) => (Array.isArray(value) ? value : [])

/** What the host says a visitor sees on each kept page, or null when it does not say. */
async function shownMeasures(context) {
  try {
    const read = await pagesRead(context)
    const measures = read.measures.filter((m) => typeof m.shownText === 'string')
    return measures.length ? measures : null
  } catch (error) {
    if (error instanceof GroupUnmeasured) return null
    throw error
  }
}

/** The path an address opens on this site, as a page's link would print it; null when it cannot be told. */
function pathOfValue(value, rows) {
  const text = String(value ?? '').trim()
  const item = /^index\.php\?Itemid=(\d+)$/.exec(text)
  if (item) {
    const row = rows.find((r) => Number(r.id) === Number(item[1]))
    return row ? `/${String(row.path).toLowerCase()}`.replace(/\/+$/, '') : null
  }
  return text.startsWith('/')
    ? text
        .replace(/^\/index\.php(?=\/|$)/, '')
        .replace(/\/+$/, '')
        .toLowerCase()
    : null
}

/** The words of an address's button: the label in its row or its anchor. */
function labelOf(held, slots) {
  const words = (s) => s !== held && s.type === 'text' && String(s.current ?? '').trim()
  if (held.group?.id) return slots.find((s) => s.group?.id === held.group.id && words(s))?.current ?? null
  const anchor = /^(.*)\/@href$/.exec(String(held.xpath ?? ''))?.[1]
  if (!anchor) return null
  return (
    slots.find(
      (s) => s.entity === held.entity && String(s.xpath ?? '').startsWith(`${anchor}/text()`) && words(s)
    )?.current ?? null
  )
}

async function run(context) {
  const { report, read } = context
  const unowned = Array.isArray(report.unowned) ? report.unowned : []
  const reading = await read('content.contract', { operation: 'inspect' })
  if (!Array.isArray(reading.slots)) throw new GroupUnmeasured('The site listed no slots.')
  const slots = new Map(reading.slots.map((s) => [s?.key, s]))
  const pageOf = new Map()
  for (const page of Array.isArray(reading.pages) ? reading.pages : []) {
    const route = keptPaths({ pages: [page] })[0]
    pageOf.set(page.entity, route)
    for (const m of page.assignedModules ?? []) if (!pageOf.has(m.entity)) pageOf.set(m.entity, route)
  }
  const held = (u) => slots.get(keyOf(u.slot))
  const holding = unowned.filter((u) => typeof held(u)?.current === 'string' && held(u).current.trim() !== '')
  const measures = holding.length ? await shownMeasures(context) : null
  const rows = measures && holding.some((u) => u.type === 'url') ? await menuRows(read) : []
  const written = new Set(
    each(report.slots)
      .filter((s) => s.status === 'written')
      .map((s) => pathOfValue(s.ordered, rows))
  )
  const failures = []
  for (const u of holding) {
    const slot = held(u)
    const path = u.type === 'url' ? pathOfValue(slot.current, rows) : null
    const shown = measures
      ? whereShown(measures, {
          type: u.type,
          value: slot.current,
          path,
          label: u.type === 'url' ? labelOf(slot, reading.slots) : null,
          claimed: written.has(path)
        })
      : null
    const page = pageOf.get(slot.entity ?? entityOf(keyOf(u.slot)))
    if (!shown && !page) continue
    const holds = u.type === 'image' ? 'a picture' : 'words'
    failures.push({
      page: shown?.page ?? page,
      slot: u.slot,
      measured: slot.current.slice(0, 120),
      level: shown ? 'block' : 'warn',
      reason: shown
        ? `A visitor sees this ${u.type} slot and no step owns it`
        : `No step owns this ${u.type} slot and it still holds ${holds}`
    })
  }
  return { checked: unowned.length, failures }
}

export const unownedShownGroup = { name: 'unowned-slots', causingStep: 3, run }
