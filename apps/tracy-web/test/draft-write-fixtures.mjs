// Shared set-up of the draft write tests (#597): the JA Boxing florist's write plan and a blank site in memory behind
// the doors (`write-order-memory-doors.mjs`, which enforces the plugin rules measured on a real blank site), plus
// a run of the plan on it. Invented data only (`fixtures/draft-write/boxing-site.mjs`).
import { boxingSite } from '../../../packages/wo/website-opportunities/test/fixtures/draft-write/boxing-site.mjs'
import { writePlanOf } from 'website-opportunities/domain/draft-write-plan.mjs'
import { memoryDoors } from 'website-opportunities/domain/write-order-memory-doors.mjs'
import { runDraftWrite } from '../src/step-chain-draft-write.js'

export const florist = await boxingSite()
export const planOf = (order = florist.order, options = {}) =>
  writePlanOf(order, florist.aiq, { stored: florist.stored, ...options })
export const floristPlan = planOf()

/** The stored bytes of a picture: invented bytes named by the stored id. */
export const openStored = async (id) => ({ bytes: Buffer.from(`bytes of ${id}`), mime: 'image/jpeg' })

/** A blank site in memory; `fail` and `crash` script door failures by mutating call number. */
export const blankSite = (script = {}) =>
  memoryDoors({ lock: florist.kit.lock, contentMap: florist.kit.blankContract, ...script })

/** Run a plan on a memory site with a run record kept in memory (as the step chain keeps it between attempts). */
export async function runOn(memory, { plan = floristPlan, record = {} } = {}) {
  return runDraftWrite({ plan, doors: memory.doors, record, openStored, runId: 'run-test' })
}

/** What a site holds, in a form two runs can be compared by. */
export function snapshotOf(memory) {
  const { records, slots, assignments, uploads, identity } = memory.site
  return structuredClone({
    records: Object.fromEntries(Object.entries(records).map(([kind, table]) => [kind, [...table.entries()]])),
    slots: [...slots.entries()].map(([key, s]) => [key, s.current, Boolean(s.removed)]),
    assignments: [...assignments.entries()],
    uploads: [...uploads.entries()],
    identity
  })
}

/** The menu item of each page of the order, by page id (a page's record mark is its alias in the main menu). */
export function pageItemsOf(memory, plan = floristPlan) {
  const items = [...memory.site.records.menuItem.values()].filter((r) => r.menutype === plan.mainMenu)
  const out = {}
  for (const op of plan.ops)
    if (op.kind === 'menuItem.create' && op.key.startsWith(`menuItem:${plan.mainMenu}:`))
      out[op.key.split(':')[2]] = items.find((r) => r.alias === op.mark || r.note === op.mark)
  return out
}

/** The modules a page shows: assigned to its menu item or to every page. */
export function modulesOfPage(memory, itemId) {
  const out = []
  for (const [id, row] of memory.site.records.module) {
    const menuids = memory.site.assignments.get(id)
    if (menuids && (menuids.includes(0) || menuids.includes(itemId))) out.push(row)
  }
  return out
}
