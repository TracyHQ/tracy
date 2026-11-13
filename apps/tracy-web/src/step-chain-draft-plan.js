// The approved plan of an assembled run (#597) held against the needs profile stored beside it, before any model work.
//
// SAME DATA. Every id a block of the plan shows (`block.data`) must be a fact, an item or a row of the stored profile
// (`planDataOf`, the ids the plan gate held the plan to). An id the profile lacks means the plan and the profile were
// stored apart (a plan edited after the research changed, a profile written by another run): the build stops with
// `draft_plan_profile_mismatch` (`step-chain-draft-source.js`), naming the ids, instead of dropping them in silence.
//
// NOTHING HELD. The ids the owner keeps off the site (`withheldIdsOf` over the full profile: a held person or held
// business name in any text of a fact or item, as words or in a slug) leave the plan every step reads: its blocks'
// data, its items and its facts. The plan gate refuses such an id in a plan it composes or edits (`withheld_shown`); a
// plan approved before the owner held it still builds, without it.
import { planDataOf } from 'website-opportunities/domain/plan-data.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
/** The ids the plan's blocks show that the stored profile does not hold, each with where it is shown. */
export function unknownPlanIdsOf(plan, profile) {
  const data = planDataOf(profile)
  const known = (id) => data.byId.has(id) || data.rowsById?.has?.(id) === true
  const out = []
  for (const page of list(plan?.pages))
    for (const block of list(page?.blocks))
      for (const id of list(block?.data))
        if (!known(id)) out.push({ id, page: page.id ?? null, block: block.id ?? null })
  return out
}

/** The plan without the ids the owner keeps off the site (blocks' data, items, facts); as it is when none is held. */
export function planWithoutWithheld(plan, profile) {
  const held = planDataOf(profile).withheld
  if (!held || held.size === 0) return plan
  const shown = (id) => !held.has(typeof id === 'string' ? id : id?.id)
  return {
    ...plan,
    pages: list(plan.pages).map((page) => ({
      ...page,
      blocks: list(page.blocks).map((block) =>
        Array.isArray(block?.data) ? { ...block, data: block.data.filter(shown) } : block
      )
    })),
    ...(Array.isArray(plan.items) ? { items: plan.items.filter(shown) } : {}),
    ...(Array.isArray(plan.facts) ? { facts: plan.facts.filter(shown) } : {})
  }
}
