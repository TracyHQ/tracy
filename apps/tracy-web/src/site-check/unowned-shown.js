// Unowned slots that still show: the write report lists the kept-block slots no step owns; one that sits on a kept page and
// still holds words or a picture is probably the template's demo showing. A warning, since the slot may be out of sight.
import { GroupUnmeasured } from './group-unmeasured.js'
import { keptPaths } from './host-pages.js'

const keyOf = (slot) => String(slot ?? '').replace(/^block-/, 'module-')
const entityOf = (key) => key.slice(0, key.lastIndexOf('.'))

async function run({ report, read }) {
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
  const failures = []
  for (const u of unowned) {
    const key = keyOf(u.slot)
    const held = slots.get(key)
    const page = pageOf.get(held?.entity ?? entityOf(key))
    if (!held || !page || typeof held.current !== 'string' || held.current.trim() === '') continue
    failures.push({
      page,
      slot: u.slot,
      measured: held.current.slice(0, 120),
      level: 'warn',
      reason: `No step owns this ${u.type} slot and it still holds ${u.type === 'image' ? 'a picture' : 'words'}`
    })
  }
  return { checked: unowned.length, failures }
}

export const unownedShownGroup = { name: 'unowned-slots', causingStep: 3, run }
