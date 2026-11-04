// The steps a finding can send a site back to (ADR 0044). Step 0 is the template itself: nothing in a build fixes it, and it needs
// a template release. Step 12 is the person with eyes, for faults that need the meaning understood; the site check names none.
const NAMES = {
  0: 'template',
  2: 'brand',
  3: 'planner',
  6: 'copy',
  8: 'pictures',
  9: 'write'
}
export const TEMPLATE_STEP = 0
/** The write step: what it wrote does not reach the page (`written-not-printed`, and the groups of faults it prints itself). */
export const WRITE_STEP = 9

/** @param {number} step */
export const stepName = (step) => NAMES[step] ?? 'unknown'
export const isStep = (step) => step in NAMES

/** The step that owns a write report line, by its `owner`; null for an owner no step answers for. */
export function ownerStep(owner) {
  if (owner === 'plan' || owner === 'plan-label') return 3
  if (owner === 'writer' || owner === 'share') return 6
  if (owner === 'picture') return 8
  if (owner === 'brand') return 2
  return null
}
