// How each repair order kind is written, judged and undone (spec #418): a row of ORDER_KINDS (repair-orders.js) names one of
// these, so the finisher (page-repairs.js) runs every order the same way and never branches on its kind.
//   - words: a slot's words through the contract door (or the order's own `write`), judged on the live page when the customer
//     cannot see the change (live-confirm.js), by code on the served page when the order never changes a word (code-judge.js),
//     else by the checker on crops; undone by `apply.revert` of its apply id;
//   - style: one rule keyed by its block in the head block (style-write.js), judged by the checker on crops of the block found
//     by its unchanged words; undone by putting back that block's rule as it was. A kept style changes no words of the report.
// `place` names what a write reads and writes whole (work-pool.js): two writes of one place never cross. Every contract apply
// is checked against the site's one revision, so it is read again inside the lock, right before the write; a slot that no
// longer holds the words the order was checked against (another page's repair wrote it first) is not written (`stale`).
// `target` names what a repair changes on the page (one slot, one block), so a page writes one repair per target a round.
import { visibleText } from '../../lib/site-copy/emphasis-markup.js'
import { CODE_JUDGED } from './code-judge.js'
import { isUnseenRepair } from './live-confirm.js'
import { readSite, revertRepair, writeRepair } from './repair-write.js'
import { takeOffStyleRule, writeStyleRule } from './style-write.js'

/** @typedef {{ run: object, fault: object, order: object, valid: object, site: object, number: number }} Repair */

const squashBare = (s) =>
  String(s ?? '')
    .replace(/\s+/g, '')
    .toLowerCase()

/**
 * The words a styled block is found by on the shots: the slot the fault names; else, of the block's own slots this run
 * wrote, the one whose words the fault quoted (spacing aside, so glued words count), else its first with words. Empty when
 * the block holds no written words, and the crops fall back to the tile.
 */
export function styleBlockWords(run, fault, site, block) {
  const held = (slot) => site.current.get(run.lineOf(slot)?.key) ?? ''
  if (fault.slot) return held(fault.slot)
  const own = [...run.kitSlots].filter((slot) => slot.replace(/\.[^.]*$/, '') === block).map(held)
  const seen = squashBare(fault.seen)
  const words = own.filter((w) => visibleText(w))
  return words.find((w) => seen.includes(squashBare(visibleText(w)))) ?? words[0] ?? ''
}

const CONTRACT = 'contract'

export const WORDS_STEPS = Object.freeze({
  /** A row field write names its row; every other words repair goes through the contract's one revision. */
  place: ({ valid }) => valid.place ?? CONTRACT,
  target: ({ valid }) => `slot ${valid.slot}`,
  /** @param {Repair} r */
  write: async ({ run, valid, number }) => {
    // A row field write needs no revision; a contract apply needs the one the site answers now.
    let revision = null
    if (!valid.place) {
      let now
      try {
        now = await readSite(run.door, run.siteKey)
      } catch (error) {
        return { ok: false, applyId: null, reason: String(error?.message ?? error) }
      }
      revision = now.revision
      if (valid.key && typeof valid.current === 'string' && now.current.get(valid.key) !== valid.current)
        return {
          ok: false,
          stale: true,
          applyId: null,
          reason: `${valid.slot} changed after its order was checked (another repair wrote it first)`
        }
    }
    return (valid.write ?? writeRepair)({
      door: run.door,
      siteKey: run.siteKey,
      revision,
      changes: valid.changes,
      repair: number
    })
  },
  /** @param {Repair} r */
  judgeBy: ({ run, order, valid }) => {
    if (isUnseenRepair(order, valid)) return { judgeBy: 'live-page' }
    if (CODE_JUDGED.has(order.kind) && run.pageHtml) return { judgeBy: 'code' }
    return { judgeBy: 'checker', wordsBefore: valid.current, wordsAfter: valid.after }
  },
  /** @param {Repair & { wrote: object }} r */
  undo: ({ run, wrote }) =>
    revertRepair({ door: run.door, siteKey: run.siteKey, applyId: wrote.applyId, also: wrote.also }),
  /** What the log adds about the repair, and what a kept repair changes in the report's words. */
  logFields: () => ({}),
  kept: ({ valid, wrote }) => ({ slot: valid.slot, ordered: valid.after, applyId: wrote.applyId })
})

export const STYLE_STEPS = Object.freeze({
  place: () => 'head-module',
  target: ({ valid }) => `block ${valid.block}`,
  write: ({ run, valid, number }) =>
    writeStyleRule({
      door: run.door,
      siteKey: run.siteKey,
      kit: run.kit,
      block: valid.block,
      line: valid.line,
      repair: number
    }),
  // A style leaves the words as they are, so the block is found by words it holds (styleBlockWords).
  judgeBy: ({ run, fault, site, valid }) => {
    const words = styleBlockWords(run, fault, site, valid.block)
    return { judgeBy: 'checker', wordsBefore: words, wordsAfter: words }
  },
  undo: ({ run, valid, wrote, number }) =>
    takeOffStyleRule({
      door: run.door,
      siteKey: run.siteKey,
      kit: run.kit,
      block: valid.block,
      before: wrote.before,
      repair: number
    }),
  logFields: ({ valid }) => ({ block: valid.block }),
  kept: () => null
})
