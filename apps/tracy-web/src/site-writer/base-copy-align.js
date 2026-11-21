// A chain build's draft copy is written on the plan's first checked draft while the planner still fixes its plan
// (step-chain-steps.js copyDraft); the copy run on the final plan takes it as round 0 (`--base-copy`). What the fix
// rounds changed in the plan since is a mismatch W02 reads against the final plan, and some of it has one right answer
// that needs no model: a slot the final plan hides or no longer decides holds nothing, and a plan label the final plan
// rewrote is the final plan's words. This puts those right before the check, so the model's fix round is left with what
// needs writing (a slot the final plan keeps that the draft never wrote, a writer's words in place of a label).
//
// Why: dev lat25 (21/11/2026), both chain builds ended their copy step with W02 still standing after two fix rounds
// ("hidden slot has text" at BXR London, "owner is plan-label but the plan gives no label words" at Arabian Tea House),
// where the plan's fix rounds had hidden or relabelled slots after the draft was written; ATH's first fix round took
// 149 s. Pure: copy and plan in, a copy out, with what it changed.
import { indexInputs } from '../lib/site-copy/inputs-index.js'

const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)
const textOf = (s) => (Array.isArray(s.text) ? s.text.join(' ') : String(s.text ?? ''))

/**
 * The base copy matched to the final plan: entries of slots it hides or does not decide, and pages entries of pages it no
 * longer has, are left out, and a plan-label entry takes the final plan's label words.
 * @param {object} copy a site-copy/1 document
 * @param {{ plan: object, kit: object, brief: object, contentMap?: object | null }} inputs the run's own
 * @returns {{ copy: object, left: string[], relabelled: string[] }} `left`: slots and pages left out, `relabelled`: labels
 *   rewritten; `copy` is the same object when nothing changed
 */
export function alignBaseCopy(copy, { plan, kit, brief, contentMap = null }) {
  if (!isObject(copy) || !Array.isArray(copy.slots) || !isObject(plan) || !isObject(kit))
    return { copy, left: [], relabelled: [] }
  const idx = indexInputs({ plan, kit, brief: isObject(brief) ? brief : {}, contentMap })
  const left = []
  const relabelled = []
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
    if (exp && exp.label !== null && s.owner === 'plan-label' && textOf(s) !== exp.label) {
      relabelled.push(s.slot)
      slots.push({ ...s, text: exp.label })
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
  if (!left.length && !relabelled.length) return { copy, left, relabelled }
  return { copy: { ...copy, slots, ...(Array.isArray(copy.pages) ? { pages } : {}) }, left, relabelled }
}
