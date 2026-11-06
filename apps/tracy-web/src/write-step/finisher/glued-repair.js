// The glued heading repair made by code, with no model (spec #418): a heading whose words run together at a hidden line break
// ("STRENGTHNOW") gets the missing space before the break, every word and code kept (glued-words.js). The fixer is never
// asked: a real run lost 11 of 11 such orders because the model rewrote the heading and dropped the break. The slot is the
// one the fault names, else the slot of the fault's page that this run wrote, holds a glued break, and whose words, spacing
// aside, are the glued words the finder quoted or the site check measured (the longest when several are). The value with
// its codes is what the site holds when it holds codes, else the codes the write report ordered (a slot that stores HTML
// reads back as its words only), and such a slot takes its tags again through the write step's emphasis stage. Code judges
// the repair on the page as served (code-judge.js). A glued fault no written slot holds is left to the fixer.
import { storageOf, visibleText } from '../../lib/site-copy/emphasis-markup.js'
import { emphasisHtmlWrite } from './content-repair-writes.js'
import { gluedWordsOf, isGluedFault, unglued } from './glued-words.js'
import { causeOf, logRecord } from './repair-log.js'
import { WORDS_STEPS } from './repair-steps.js'

const squash = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()

/** The slot's value with its codes, as far as the site or the write report says it, or null. */
function codesOf(current, line) {
  if (unglued(current) !== current) return { codes: current, html: false }
  const ordered = typeof line?.ordered === 'string' ? line.ordered : null
  if (!ordered || unglued(ordered) === ordered) return null
  if (squash(visibleText(ordered)) !== squash(visibleText(current))) return null
  return { codes: ordered, html: true }
}

/** The written slot the glued fault is about, with its codes: `{ slot, key, current, codes, html }` or null. */
function gluedSlot(run, fault, site) {
  const candidates = fault.slot ? [fault.slot] : [...run.pageSlots(fault.page)]
  let best = null
  for (const slot of candidates) {
    const line = run.lineOf(slot)
    const current = line?.key ? site.current.get(line.key) : undefined
    if (typeof current !== 'string') continue
    const held = codesOf(current, line)
    if (!held || !gluedWordsOf(fault, held.codes)) continue
    const size = visibleText(held.codes).length
    if (!best || size > best.size) best = { slot, key: line.key, current, line, size, ...held }
  }
  return best
}

/** How the repaired value is written: a slot that stores HTML takes its tags again through the emphasis stage. */
function writeOf(run, at, after) {
  const storage = storageOf(run.orderFacts.mapSlotOf(at.key))
  const html = storage === 'html' || (storage === 'unknown' && at.line?.emphasis === 'html')
  if (!at.html || !html) return at.html ? null : {}
  return { write: emphasisHtmlWrite({ contentMap: run.contentMap, key: at.key, value: after }) }
}

/**
 * The repair of a glued fault, made by code: `{ repair }` to write, `{ record }` when it was tried and undone before, or null
 * when no slot this run wrote holds the glued words (the fault then goes to the fixer).
 */
export function gluedRepair(run, fault, site) {
  if (!isGluedFault(fault)) return null
  const at = gluedSlot(run, fault, site)
  if (!at) return null
  const after = unglued(at.codes)
  const how = writeOf(run, at, after)
  if (!how) return null
  const order = { kind: 'fix-text', slot: at.slot, text: after }
  const onSlot = { ...fault, slot: at.slot }
  const logFields = { ...causeOf(run.firstCheck, onSlot), order, orderedBy: 'code' }
  if ((fault.tried ?? []).includes(JSON.stringify(order)))
    return {
      record: logRecord(onSlot, {
        ...logFields,
        outcome: 'dropped',
        reason: 'the same order was written and undone in the round before'
      })
    }
  const valid = {
    ok: true,
    slot: at.slot,
    key: at.key,
    current: at.current,
    after,
    changes: { [at.key]: after },
    glued: true,
    ...how
  }
  const number = run.nextNumber()
  const steps = WORDS_STEPS
  const repair = { run, fault, order, valid, site, number, steps, onSlot, logFields }
  return { repair: { ...repair, ...steps.judgeBy(repair) } }
}
