// How each repair order kind is written, judged and undone (spec #418): a row of ORDER_KINDS (repair-orders.js) names one of
// these, so the finisher (finisher.js) runs every order the same way and never branches on its kind.
//   - words: a slot's words through the contract door (or the order's own `write`), judged on the live page when the customer
//     cannot see the change (live-confirm.js), else by the checker on crops; undone by `apply.revert` of its apply id;
//   - style: one rule keyed by its block in the head block (style-write.js), judged by the checker on crops of the block found
//     by its unchanged words; undone by putting back that block's rule as it was. A kept style changes no words of the report.
import { isUnseenRepair, liveVerdict } from './live-confirm.js'
import { judgedOnCrops } from './repair-judge.js'
import { revertRepair, writeRepair } from './repair-write.js'
import { takeOffStyleRule, writeStyleRule } from './style-write.js'

/** @typedef {{ run: object, fault: object, order: object, valid: object, site: object, firstShots: object, repairNumber: number }} Repair */

export const WORDS_STEPS = Object.freeze({
  /** @param {Repair} r */
  write: ({ run, valid, site, repairNumber }) =>
    (valid.write ?? writeRepair)({
      door: run.door,
      siteKey: run.siteKey,
      revision: site.revision,
      changes: valid.changes,
      repair: repairNumber
    }),
  /** @param {Repair} r */
  judge: async ({ run, fault, order, valid, firstShots, repairNumber }) =>
    isUnseenRepair(order, valid)
      ? {
          ...(await liveVerdict(run.pageHtml, fault, { order, valid })),
          checkedBy: 'live-page',
          proven: true
        }
      : judgedOnCrops(run, {
          fault,
          firstShots,
          repairNumber,
          wordsBefore: valid.current,
          wordsAfter: valid.after
        }),
  /** @param {Repair & { wrote: object }} r */
  undo: ({ run, wrote }) =>
    revertRepair({ door: run.door, siteKey: run.siteKey, applyId: wrote.applyId, also: wrote.also }),
  /** What the log adds about the repair, and what a kept repair changes in the report's words. */
  shown: () => ({}),
  kept: ({ valid, wrote }) => ({ slot: valid.slot, ordered: valid.after, applyId: wrote.applyId })
})

export const STYLE_STEPS = Object.freeze({
  write: ({ run, valid, repairNumber }) =>
    writeStyleRule({
      door: run.door,
      siteKey: run.siteKey,
      kit: run.kit,
      block: valid.block,
      line: valid.line,
      repair: repairNumber
    }),
  // A style leaves the words as they are, so the block is found by the words its fault's slot holds.
  judge: ({ run, fault, site, firstShots, repairNumber }) => {
    const words = site.current.get(run.lineOf(fault.slot)?.key) ?? ''
    return judgedOnCrops(run, { fault, firstShots, repairNumber, wordsBefore: words, wordsAfter: words })
  },
  undo: ({ run, valid, wrote, repairNumber }) =>
    takeOffStyleRule({
      door: run.door,
      siteKey: run.siteKey,
      kit: run.kit,
      block: valid.block,
      before: wrote.before,
      repair: repairNumber
    }),
  shown: ({ valid }) => ({ block: valid.block }),
  kept: () => null
})
