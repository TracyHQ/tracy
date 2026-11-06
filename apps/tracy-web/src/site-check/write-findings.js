// The site check's measures of what the write step found and wrote around (ADR 0044, decision 26). The write step no longer stops
// on one item: a value the look guard finds fault with is written all the same, and an item with nothing to write to (a slot the
// kit or the site does not have, a picture frame with no slot) is left out. Both are kept in the write report, and these groups
// block on each, naming the cell and the step that owns the value: copy is step 6, the plan step 3, pictures step 8, the brand
// step 2, and the write step itself step 9. They read only the report, so they run before read-back and are never stopped by it.
import { GroupUnmeasured } from './group-unmeasured.js'
import { isStep, TEMPLATE_STEP, WRITE_STEP } from '../lib/site-build-steps.js'
import { NEW_CONTRACT } from '../write-step/hide-plan.js'

const stepOf = (step) => (isStep(step) ? step : WRITE_STEP)
const each = (value) => (Array.isArray(value) ? value : [])

/**
 * What the plan hides and the plugin cannot take off for want of a slot in the contract (`report.noWayOut`, the reasons that point to
 * a new contract, issue #369). The write step sent these and the plugin refused them, so they are not in `report.unaddressable`;
 * the fault is the template's contract (step 0, fixed by a template release), never the write step. Read-back leaves these lines
 * here, so each is blamed once.
 * @param {object} report
 * @returns {{ slot: string, reason: string }[]}
 */
export function contractRefusals(report) {
  return each(report?.noWayOut).filter(
    (item) => typeof item?.slot === 'string' && String(item.reason ?? '').includes(NEW_CONTRACT)
  )
}

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
      ...(findings.length ? {} : { notApplicable: "the write step's look guard found nothing" }),
      failures: findings.map((f) => ({
        slot: f.what,
        causingStep: stepOf(f.step),
        measured: f.sent === false ? 'not sent' : 'written',
        reason: `The look guard found: ${f.reason}${f.sent === false ? ' (the call was not sent)' : ' (written all the same)'}`
      }))
    }
  }
}

/**
 * `unaddressable-items`: every item the write step left out because it had nothing to write to, and every hide the plugin refused
 * because the contract has no slot for it, one block each.
 */
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
    const refused = contractRefusals(report)
    const checked = items.length + refused.length
    return {
      checked,
      ...(checked
        ? {}
        : {
            notApplicable: 'the write step left nothing out and the plugin refused no slot the contract lacks'
          }),
      failures: [
        ...items.map((item) => ({
          slot: item.slot,
          ...(item.key ? { key: item.key } : {}),
          causingStep: stepOf(item.step),
          measured: 'not written',
          reason: `Nothing to write it to: ${item.reason}`
        })),
        ...refused.map((item) => ({
          slot: item.slot,
          causingStep: TEMPLATE_STEP,
          measured: 'not removed',
          reason: `The template's contract has no slot for this, so the plan's hide could not be done (a new contract, issue #369): ${item.reason}`
        }))
      ]
    }
  }
}

/**
 * `emphasis-codes-left`: every written heading of an HTML slot whose emphasis codes the write step's emphasis stage could not turn
 * into tags (its words not found exactly once in the stored value, the row unreadable, the update refused), one block each on the
 * write step: the page prints the codes as words (card N, 2026-11-06). An ACM slot keeps its codes by design and is not judged.
 */
export const emphasisCodesLeftGroup = {
  name: 'emphasis-codes-left',
  causingStep: WRITE_STEP,
  /** @param {{ report: object }} context */
  async run({ report }) {
    const html = each(report?.slots).filter((s) => s?.status === 'written' && s.emphasis === 'html')
    return {
      checked: html.length,
      ...(html.length ? {} : { notApplicable: 'the write step wrote no emphasis codes into an HTML slot' }),
      failures: html
        .filter((s) => s.emphasisBlocking)
        .map((s) => ({
          slot: s.slot,
          ...(s.key ? { key: s.key } : {}),
          causingStep: WRITE_STEP,
          measured: 'codes left as written',
          reason: `The emphasis codes were not turned into tags, so the page prints them as words: ${s.warning ?? 'no reason kept'}`
        }))
    }
  }
}

export const WRITE_FINDING_GROUPS = [lookGuardFindingsGroup, unaddressableItemsGroup, emphasisCodesLeftGroup]
