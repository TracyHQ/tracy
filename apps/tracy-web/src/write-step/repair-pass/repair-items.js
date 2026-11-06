// One fault as one comment item of the preview popover (#448): the page, the element (as the picker reports it, with the
// content.locate answer for it, or its slot and block as levels when locate is unavailable) and one plain sentence of what
// should change. The items of one page become one numbered
// comment turn, built by the popover's own turn builder (lib/comment-turn.js) once the comment requests door has numbered
// them, so the agent's writes can cite each number. Pure but for the builder it is given.
import { SENT_KINDS } from './repair-kinds.js'

const MAX_SEEN = 300

/** What was measured or seen, as the second half of the sentence, or nothing. */
const seenPart = (fault) => {
  const said = typeof fault.measured === 'string' && fault.measured ? fault.measured : fault.seen
  if (typeof said !== 'string' || !said.trim()) return ''
  const one = said.replace(/\s+/g, ' ').trim().slice(0, MAX_SEEN)
  return ` (seen: ${one.replace(/[.\s]+$/, '')})`
}

/** The one sentence a person would type in the popover for this fault. */
export const changeSentence = (fault) => {
  const base = SENT_KINDS[fault.kind]?.() ?? 'Fix what a visitor sees wrong here.'
  return `${base.replace(/\.$/, '')}${seenPart(fault)}.`
}

/** The locate levels a fault names: its slot, inside its block, innermost first. */
const levelsOf = (fault) => [
  ...(fault.slot ? [{ kind: 'slot', id: fault.slot, label: fault.slot, writable: true }] : []),
  ...(fault.block ? [{ kind: 'block', id: fault.block, label: fault.block, writable: true }] : [])
]

/**
 * The comment item of one fault, before it has a number, as the popover makes it: the page's address, the element as the
 * picker reports it (`element`, from the served page, repair-served-element.js) and the `content.locate` answer for it
 * (`located.answer`). Without an answer the fault's own levels stand in, and the item says why (`locateProblem`).
 * @param {object} fault a fault of repair-faults.js
 * @param {{ url: string, element?: object | null, located?: { answer?: object | null, problem?: string | null } | null }} at
 */
export function commentItem(fault, { url, element = null, located = null }) {
  const levels = levelsOf(fault)
  const answer = located?.answer ?? null
  const measured = typeof fault.measured === 'string' ? fault.measured : ''
  return {
    page: fault.page,
    url,
    text: changeSentence(fault),
    element: {
      url,
      selector: element?.selector ?? '',
      label: fault.slot ?? fault.block ?? fault.kind,
      text: element ? element.text || (element.image ? '' : measured) : measured,
      marks: element?.marks ?? [],
      tag: element?.tag ?? '',
      image: element?.image ?? null
    },
    locate: answer ?? (levels.length ? { status: 'resolved', levels } : { status: 'unchecked', levels: [] }),
    locateFrom: answer ? 'content.locate' : 'fault',
    ...(answer ? {} : { locateProblem: located?.problem ?? 'content.locate was not asked' })
  }
}

/**
 * The numbered comment turn of one page: the items with the numbers the requests door gave them.
 * @param {(comment: object) => string} buildCommentTurn
 */
export function pageTurn(buildCommentTurn, items, numbers) {
  return buildCommentTurn({
    numbered: true,
    items: items.map((item, i) => ({
      n: numbers[i],
      text: item.text,
      url: item.url,
      element: item.element,
      locate: item.locate
    }))
  })
}
