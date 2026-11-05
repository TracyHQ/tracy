// The site check's measures of what the write step found and wrote around (ADR 0044, decision 26). The write step no longer stops
// on one item: a value the look guard finds fault with is written all the same, and an item with nothing to write to (a slot the
// kit or the site does not have, a picture frame with no slot) is left out. Both are kept in the write report, and these groups
// block on each, naming the cell and the step that owns the value: copy is step 6, the plan step 3, pictures step 8, the brand
// step 2, and the write step itself step 9. They read only the report, so they run before read-back and are never stopped by it.
import { GroupUnmeasured } from './group-unmeasured.js'
import { isStep, WRITE_STEP } from '../lib/site-build-steps.js'

const stepOf = (step) => (isStep(step) ? step : WRITE_STEP)

/** `look-guard-findings`: every finding of the write step's look guard, one block each. */
export const lookGuardFindingsGroup = {
  name: 'look-guard-findings',
  causingStep: WRITE_STEP,
  /** @param {{ report: object }} context */
  async run({ report }) {
    const findings = report?.guard?.findings
    if (!Array.isArray(findings))
      throw new GroupUnmeasured(
        'The write report keeps no look guard findings (it was written before they were kept): run the write step again.'
      )
    return {
      checked: findings.length,
      failures: findings.map((f) => ({
        slot: f.what,
        causingStep: stepOf(f.step),
        measured: f.sent === false ? 'not sent' : 'written',
        reason: `The look guard found: ${f.reason}${f.sent === false ? ' (the call was not sent)' : ' (written all the same)'}`
      }))
    }
  }
}

/** `unaddressable-items`: every item the write step left out because it had nothing to write to, one block each. */
export const unaddressableItemsGroup = {
  name: 'unaddressable-items',
  causingStep: WRITE_STEP,
  /** @param {{ report: object }} context */
  async run({ report }) {
    const items = report?.unaddressable
    if (!Array.isArray(items))
      throw new GroupUnmeasured(
        'The write report keeps no list of items left out (it was written before they were kept): run the write step again.'
      )
    return {
      checked: items.length,
      failures: items.map((item) => ({
        slot: item.slot,
        ...(item.key ? { key: item.key } : {}),
        causingStep: stepOf(item.step),
        measured: 'not written',
        reason: `Nothing to write it to: ${item.reason}`
      }))
    }
  }
}

export const WRITE_FINDING_GROUPS = [lookGuardFindingsGroup, unaddressableItemsGroup]
