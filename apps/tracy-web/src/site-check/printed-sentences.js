// Copy rule W12 on the site: the slots the kit marks as one sentence, read joined from what the site holds and looked for in what the
// page prints. The write step does not run the copy check, so without this nothing on the site reports a broken sentence. The judging
// is W12's own (`sentenceFaults`). The one difference: the copy check knows a capital is a name from the facts a line cites, which the
// site does not hold, so here a word is a name when another written line has it with a capital past its first word.
import { sentenceFaults } from '../site-writer/copy-check/sentence-join.js'
import { GroupUnmeasured } from './group-unmeasured.js'
import { pagesRead } from './host-pages.js'

const each = (value) => (Array.isArray(value) ? value : [])
const keyOf = (slot) => String(slot ?? '').replace(/^block-/, 'module-')
const packed = (text) =>
  String(text ?? '')
    .replace(/\s+/g, '')
    .toLowerCase()
const squashed = (text) =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** The words a written line has with a capital past its first word, and which line. */
function namesIn(lines) {
  const names = new Map()
  for (const line of lines)
    for (const word of String(line.ordered ?? '')
      .split(/\s+/)
      .slice(1)) {
      const name = /^["'(]?(\p{Lu}\p{Ll}[\p{L}'-]*)/u.exec(word)?.[1]
      if (!name) continue
      if (!names.has(name)) names.set(name, new Set())
      names.get(name).add(line.slot)
    }
  return names
}

/**
 * @param {object} kit the kit document
 * @param {Map<string, string>} heldBySlot what the site holds, by kit slot id; a slot the plan hides holds nothing
 * @param {object[]} lines the write report's written lines
 * @param {object[]} measures the host's page measures
 * @returns {{ failures: object[], read: number }}
 */
export function judgeSentences(kit, heldBySlot, lines, measures) {
  const names = namesIn(lines)
  const failures = []
  let read = 0
  for (const block of each(kit?.blocks))
    for (const group of each(block?.sentences)) {
      const textOf = (slot) => heldBySlot.get(slot) ?? ''
      const isName = (word, piece) => [...(names.get(word) ?? [])].some((slot) => slot !== piece.slot)
      const { text, pieces, faults } = sentenceFaults(group, textOf, isName)
      if (pieces.length < 2) continue
      const at = each(measures).find((m) => packed(m.shownText).includes(packed(text)))
      // A sentence no page prints is no fault a visitor sees: its block is dropped or its page is not kept.
      if (!at) continue
      read++
      for (const f of faults) {
        // The markup may put a space where the slots hold none: what the page prints decides.
        if (f.cause === 'missing-space' && !squashed(at.shownText).includes(squashed(text))) continue
        failures.push({
          page: at.path,
          width: at.width,
          slot: pieces[f.at]?.slot ?? null,
          measured: text.slice(0, 160),
          reason:
            f.cause === 'missing-space'
              ? 'Two pieces of one sentence meet with no space.'
              : `"${f.word}" starts with a capital in the middle of a sentence.`
        })
      }
    }
  return { failures, read }
}

export const brokenSentenceGroup = {
  name: 'broken-sentence',
  causingStep: 6,
  async run(context) {
    const { report, read: door, kit } = context
    if (!kit) throw new GroupUnmeasured('The kit was not given, so no sentence group is known.')
    const read = await pagesRead(context)
    if (!read.measures.some((m) => typeof m.shownText === 'string'))
      throw new GroupUnmeasured('The host answered no page text, so no sentence was read as printed.')
    const groups = each(kit.blocks).flatMap((b) => each(b.sentences))
    if (!groups.length)
      return {
        checked: 0,
        failures: [
          { level: 'warn', reason: 'The kit names no sentence groups, so no joined sentence was read.' }
        ]
      }
    const reading = await door('content.contract', { operation: 'inspect' })
    const hidden = new Set(
      each(report.slots)
        .filter((s) => s.status === 'hidden')
        .map((s) => s.slot)
    )
    const held = new Map()
    const slots = new Map(each(reading.slots).map((s) => [s?.key, s]))
    for (const slotId of groups.flatMap((g) => each(g.slots))) {
      const value = slots.get(keyOf(slotId))?.current
      if (typeof value === 'string' && !hidden.has(slotId)) held.set(slotId, value)
    }
    const lines = each(report.slots).filter((s) => s.status === 'written' && typeof s.ordered === 'string')
    const { failures, read: count } = judgeSentences(kit, held, lines, read.measures)
    return { checked: count, failures }
  }
}
