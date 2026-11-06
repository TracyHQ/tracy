// Unowned slots that still show: the write report lists the kept-block slots no step owns. One a visitor sees on a kept page is the
// template's demo showing, which blocks. A picture slot that still holds a template picture blocks even when the read did not see it
// (it may show only in the other theme, or below a width the read missed), unless the kit says its block prints at no width. Any other
// slot that holds words or a picture and shows nowhere is a warning, as is any of them when the host could not say what the pages show.
//
// Whose it is: the planner's, unless the slot is the light or dark twin of a frame the write report hid (`twinOf` in the kit). The
// plan hides only the original; carrying the hide to its twin is the write step's job (owner-table.js `hiddenTwins`).
import { menuRows } from '../lib/joomla-menu-rows.js'
import { GroupUnmeasured } from './group-unmeasured.js'
import { keptPaths } from '../lib/site-kept-paths.js'
import { pagesRead } from './host-pages.js'
import { whereShown } from './page-measures.js'
import { WRITE_STEP } from '../lib/site-build-steps.js'

const keyOf = (slot) => String(slot ?? '').replace(/^block-/, 'module-')
const entityOf = (key) => key.slice(0, key.lastIndexOf('.'))
const each = (value) => (Array.isArray(value) ? value : [])
/** The folders Tracy writes its own pictures to (theme-reads.js reads them the same way): any other file is the template's. */
const TRACY_PICTURE = /(?:^|\/)tracy-(?:content|brand)\//
const templatePicture = (value) => !TRACY_PICTURE.test(String(value).split('#')[0])

/** The kit's frames by id, and whether a kept block prints at no width at all (`visibleAt` empty). */
function kitFacts(kit) {
  const blocks = each(kit?.blocks)
  return {
    frame: new Map(blocks.flatMap((b) => each(b?.frames)).map((f) => [f?.id, f])),
    neverPrints: (id) => {
      const b = blocks.find((x) => x?.id === id)
      return Array.isArray(b?.visibleAt) && b.visibleAt.length === 0
    }
  }
}

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
  // Nothing measured is not green (ADR 0044, 2026-11-04): a report without its unowned list, or with no slot at all, says nothing.
  if (!Array.isArray(report.unowned))
    throw new GroupUnmeasured('The write report has no unowned list, so no unowned slot was measured.')
  if (!each(report.slots).length && !report.unowned.length)
    throw new GroupUnmeasured('The write report lists no slot, so no unowned slot was measured.')
  const unowned = report.unowned
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
  const hiddenByWrite = new Set(
    each(report.slots)
      .filter((s) => s.status === 'hidden')
      .map((s) => s.slot)
  )
  const kit = kitFacts(context.kit)
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
    const demoPicture = u.type === 'image' && templatePicture(slot.current) && !kit.neverPrints(u.block)
    const twinOf = kit.frame.get(u.slot)?.twinOf
    failures.push({
      page: shown?.page ?? page,
      slot: u.slot,
      measured: slot.current.slice(0, 120),
      level: shown || demoPicture ? 'block' : 'warn',
      ...(typeof twinOf === 'string' && hiddenByWrite.has(twinOf) ? { causingStep: WRITE_STEP } : {}),
      reason: shown
        ? `A visitor sees this ${u.type} slot and no step owns it`
        : demoPicture
          ? 'No step owns this picture slot and it still holds the template picture, on a block the kit says prints'
          : `No step owns this ${u.type} slot and it still holds ${holds}`
    })
  }
  return {
    checked: unowned.length,
    ...(unowned.length ? {} : { notApplicable: 'every slot of the write report has an owner' }),
    failures
  }
}

export const unownedShownGroup = { name: 'unowned-slots', causingStep: 3, run }
