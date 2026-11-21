// A copy matched to its plan where W02 has one right answer that needs no model: a slot the plan hides or no longer
// decides holds nothing, a plan label the plan rewrote is the plan's words, and an entry marked as a plan label on a slot
// the plan gives no label words is the writer's. A chain build's draft copy is written on the plan's first checked draft
// while the planner still fixes its plan (step-chain-steps.js copyDraft), so the copy run on the final plan meets these
// as round 0 (`--base-copy`); a fix round's answer can bring the last one too. This puts them right after every answer,
// before the check, so the model's fix round is left with what needs writing (a slot the plan keeps that nobody wrote, a
// writer's words in place of a label).
//
// Why: dev lat25 (21/11/2026), both chain builds ended their copy step with W02 still standing after two fix rounds
// ("hidden slot has text" at BXR London, "owner is plan-label but the plan gives no label words" at Arabian Tea House),
// where the plan's fix rounds had hidden or relabelled slots after the draft was written; ATH's first fix round took
// 149 s. Dev lat26b (21/11/2026): BXR London's copy fix rounds marked five slots of the plan's copy as plan labels and
// left them so through both rounds. Pure: copy and plan in, a copy out, with what it changed.
import { indexInputs } from '../lib/site-copy/inputs-index.js'

const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)
const textOf = (s) => (Array.isArray(s.text) ? s.text.join(' ') : String(s.text ?? ''))

/**
 * The copy matched to the plan: entries of slots it hides or does not decide, and pages entries of pages it no longer
 * has, are left out; a plan-label entry takes the plan's label words, or is the writer's when the plan gives none.
 * @param {object} copy a site-copy/1 document
 * @param {{ plan: object, kit: object, brief: object, contentMap?: object | null }} inputs the run's own
 * @returns {{ copy: object, left: string[], relabelled: string[], owned: string[] }} `left`: slots and pages left out,
 *   `relabelled`: labels rewritten, `owned`: plan-label entries made the writer's; `copy` is the same object when nothing
 *   changed
 */
export function alignBaseCopy(copy, { plan, kit, brief, contentMap = null }) {
  if (!isObject(copy) || !Array.isArray(copy.slots) || !isObject(plan) || !isObject(kit))
    return { copy, left: [], relabelled: [], owned: [] }
  const idx = indexInputs({ plan, kit, brief: isObject(brief) ? brief : {}, contentMap })
  const left = []
  const relabelled = []
  const owned = []
  const slots = []
  for (const s of copy.slots) {
    if (!isObject(s) || typeof s.slot !== 'string') {
      slots.push(s)
      continue
    }
    const exp = idx.expected.get(s.slot)
    // A slot the final plan hides, or that no decision of the final plan names any more: no words (W02 fails both).
    if (!exp) {
      left.push(s.slot)
      continue
    }
    if (exp.label !== null && s.owner === 'plan-label' && textOf(s) !== exp.label) {
      relabelled.push(s.slot)
      slots.push({ ...s, text: exp.label })
      continue
    }
    // The plan gives no label words here: the words are the writer's (W02 "owner is plan-label" otherwise).
    if (exp.label === null && s.owner === 'plan-label') {
      owned.push(s.slot)
      slots.push({ ...s, owner: 'writer' })
      continue
    }
    slots.push(s)
  }
  // A pages entry (a page without kit slots, ADR 0042) of a page the final plan no longer has: W02 fails it too.
  const textPages = new Set(idx.textPages ?? [])
  const pages = Array.isArray(copy.pages)
    ? copy.pages.filter((p) => {
        if (!isObject(p) || typeof p.page !== 'string' || textPages.has(p.page)) return true
        left.push(p.page)
        return false
      })
    : copy.pages
  if (!left.length && !relabelled.length && !owned.length) return { copy, left, relabelled, owned }
  return {
    copy: { ...copy, slots, ...(Array.isArray(copy.pages) ? { pages } : {}) },
    left,
    relabelled,
    owned
  }
}
