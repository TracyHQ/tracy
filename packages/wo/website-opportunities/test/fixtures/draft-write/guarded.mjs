// Shared set-up of the draft write guard tests (ticket #597): the JA Boxing florist's write plan, its kit as the
// guards read it, and helpers that change one value of a copy of the plan and say which guard fails. Invented data.
import assert from 'node:assert/strict'
import { guardPlan } from '../../../domain/draft-write-guards.mjs'
import { draftWriteKitOf, writePlanOf } from '../../../domain/draft-write-plan.mjs'
import { placesOfOrder } from '../../../domain/write-order-check.mjs'
import { boxingSite } from './boxing-site.mjs'

export const site = await boxingSite()
export const kit = draftWriteKitOf(site.aiq)
export const plan = writePlanOf(site.order, site.aiq, { stored: site.stored })

/** The guard code a check throws, with the error held to the guard rules. */
export function codeOf(run) {
  try {
    run()
  } catch (error) {
    assert.equal(error.noRerun, true, error.code)
    assert.ok(error.details.problems.length > 0)
    return error.code
  }
  return 'passed'
}
export const guarded = (mutate, { order = site.order, ...options } = {}) => {
  const p = structuredClone(plan)
  mutate(p)
  return codeOf(() => guardPlan(p, { order, kit, ...options }))
}
/** The first value of the plan a test may change. */
export const valueWhere = (p, match) => {
  for (const op of p.ops) for (const v of op.values ?? []) if (match(op, v)) return v
  throw new Error('no value matches')
}
export const contractSlot = (op, v) => op.kind === 'contract.apply' && kit.slots.get(v.loc.slot)
export const fieldEntry = (order, place) =>
  placesOfOrder(order)
    .flatMap(({ place: at }) => at.fields ?? [])
    .find((e) => e.place === place)
