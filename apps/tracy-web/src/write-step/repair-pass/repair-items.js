// One fault as one comment item of the preview popover (#448): the page, the element (as the picker reports it, with the
// content.locate answer for it, or its slot, block and record as levels when locate gives none) and the words of what
// should change: an instruction written for the fault's kind, what was seen, and where (the exact slot, the alt slot for
// an alt fault, and its record), so the agent can act even when locate failed. The items of one page become one numbered
// comment turn, built by the popover's own turn builder (lib/comment-turn.js) once the comment requests door has numbered
// them, so the agent's writes can cite each number. Pure but for the builder it is given.
import { SENT_KINDS } from './repair-kinds.js'
import { pictureInstruction } from './repair-picture-slots.js'
import { quotedWords } from './repair-served-element.js'

const MAX_SEEN = 300

const one = (said) =>
  String(said ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SEEN)
    .replace(/[.\s]+$/, '')

const measuredOf = (fault) => (typeof fault.measured === 'string' ? one(fault.measured) : '')

/** The record a slot or block id sits in (`article-16.5` is article 16, `block-4.1` is module 4), or null. */
export function recordOf(id) {
  const m = /^([a-z]+)-(\d+)(?:\.|$)/.exec(String(id ?? ''))
  return m ? { kind: m[1] === 'block' ? 'module' : m[1], id: Number(m[2]) } : null
}

const ALT_KINDS = new Set(['wrong-alt'])

/** The slot a fault is about, as the agent should write it: the alt of a picture slot for an alt fault. */
const slotLabelOf = (fault) =>
  fault.altSlot ?? (fault.slot ? `${fault.slot}${ALT_KINDS.has(fault.kind) ? ' alt' : ''}` : '')

/** What was measured or seen there, written for the fault's kind. */
function detailOf(fault) {
  const seen = one(fault.seen)
  const measured = measuredOf(fault)
  if (fault.kind === 'wrong-alt' && fault.source === 'site-check')
    return [
      ...(seen ? [` The picture shows: ${seen}.`] : []),
      ...(measured ? [` Its alt now reads "${measured}".`] : [])
    ].join('')
  if (fault.kind === 'glued-words' && measured)
    return ` The words that run together: "${measured}".${seen ? ` (seen: ${seen}).` : ''}`
  const said = measured || seen
  return said ? ` (seen: ${said}).` : ''
}

/** Where the change goes: the exact slot (the alt slot for an alt fault), its block and its record, or the words quoted. */
function whereOf(fault) {
  const record = recordOf(fault.slot) ?? recordOf(fault.block)
  const inRecord = record ? `, in ${record.kind} ${record.id}` : ''
  const quoted = quotedWords(fault.seen)
  if (fault.slot) {
    // A gallery alt in a slot of its own (repair-alt-slots.js) is named by that slot, beside its picture's.
    const slot = fault.altSlot
      ? `slot ${fault.altSlot}, the alt of the picture in slot ${fault.slot}`
      : ALT_KINDS.has(fault.kind)
        ? `the alt of slot ${fault.slot}`
        : `slot ${fault.slot}`
    return ` Where: ${slot}${fault.block ? ` (block ${fault.block})` : ''}${inRecord}.`
  }
  if (fault.block) return ` Where: block ${fault.block}${inRecord}.`
  // A control names no slot: the element the host measured, and where it leads.
  if (fault.selector)
    return ` Where: the element ${fault.selector}${fault.href ? ` that links to ${fault.href}` : ''} on this page.`
  if (quoted) return ` Where: the element showing "${quoted}" on this page.`
  return ' Where: on this page, as the note describes.'
}

/** The words a person would type in the popover for this fault: what to do, what was seen, and where. One paragraph. */
export const changeSentence = (fault) => {
  const base = pictureInstruction(fault) ?? SENT_KINDS[fault.kind]()
  return `${base}${detailOf(fault)}${whereOf(fault)}`.replace(/\s+/g, ' ').trim()
}

/**
 * The levels a fault names without a `content.locate` answer: its slot (the alt slot for an alt fault), its block and its
 * record, innermost first. They carry no id, which only content.locate gives; the record carries its CMS kind and number,
 * so the agent can read it.
 */
function levelsOf(fault) {
  const record = recordOf(fault.slot) ?? recordOf(fault.block)
  const writable = !fault.altBlocked
  return [
    ...(fault.slot ? [{ kind: 'field', label: slotLabelOf(fault), writable }] : []),
    ...(fault.block ? [{ kind: 'block', label: fault.block, writable }] : []),
    ...(record ? [{ kind: 'record', label: `${record.kind} ${record.id}`, native: record, writable }] : [])
  ]
}

/**
 * The comment item of one fault, before it has a number, as the popover makes it: the page's address, the element as the
 * picker reports it (`element`, from the served page, repair-served-element.js) and the `content.locate` answer for it
 * (`located.answer`). Without an answer the fault's own levels stand in, and the item says why (`locateProblem`).
 * @param {object} fault a fault of repair-faults.js
 * @param {{ url: string, element?: object | null, located?: { answer?: object | null, problem?: string | null } | null }} at
 */
export function commentItem(fault, { url, element = null, located = null }) {
  const levels = levelsOf(fault)
  const answer = fault.altBlocked ? null : (located?.answer ?? null)
  const measured = typeof fault.measured === 'string' ? fault.measured : ''
  return {
    page: fault.page,
    url,
    text: changeSentence(fault),
    element: {
      url,
      selector: element?.selector ?? '',
      label: fault.slot ?? fault.block ?? fault.kind,
      text: element ? element.text || (element.image || fault.selector ? '' : measured) : measured,
      marks: element?.marks ?? [],
      tag: element?.tag ?? '',
      image: element?.image ?? null
    },
    locate: answer ?? { status: 'unchecked', levels },
    locateFrom: answer ? 'content.locate' : 'fault',
    ...(answer
      ? {}
      : { locateProblem: fault.altBlocked ?? located?.problem ?? 'content.locate was not asked' })
  }
}

/**
 * The numbered comment turn of one page: the items with the numbers the requests door gave them.
 * @param {(comment: object) => string} buildCommentTurn
 */
export function pageTurn(buildCommentTurn, items, numbers) {
  const comments = buildCommentTurn({
    numbered: true,
    items: items.map((item, i) => ({
      n: numbers[i],
      text: item.text,
      url: item.url,
      element: item.element,
      locate: item.locate
    }))
  })
  return `${comments}\n\nThis is an automated site build with no person waiting in this session. Do not ask the user questions or wait for uploads or approval. Use the existing business assets; when none can replace a demo picture, remove or hide it only when the measured frame permits hiding and a supported site door allows it. Preserve frames that cannot be hidden and report their unresolved pictures. For contract writes, read the affected content first and follow its writable next; use a fresh inspect revision as expected_revision. After REVISION_STALE, inspect again and reconsider the affected changes before applying; never replay a stale revision. Text slots take plain content, without HTML markup or control characters; preserve the declared slot limits. After SLOT_IMAGE_INVALID, prepare the image to the native slot fit before retrying. Preserve the site navigation and required controls. If a site door returns CONFIRM_FIRST or another refusal requiring customer consent, do not ask its question, retry with confirm:true, or bypass the refusal through files or another door. Record that change as blocked and continue with independent repairs. If a supported change is unavailable, record what remains and finish the turn. Never invent business facts or pictures.`
}
