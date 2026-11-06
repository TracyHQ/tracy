// The glued words repair (spec #418): a heading whose words run together at phone width, "WHAT WECOACH", because the template
// hides its line break there and no space stands before the break. The only repair is the missing space, put just before
// the break marker (`((br/))` or `<br/>`): the words, their order and their markup stay exactly as written. The fix-text
// order of a broken layout fault may do that and nothing else (repair-orders.js), and code judges it on the served page
// (code-judge.js): a space stands before every break. Pure.
import { visibleText } from '../../lib/site-copy/emphasis-markup.js'

/** A line break as the slot stores it: an emphasis code or a tag. */
const BREAK = /\(\(\s*br\b[^()]*\)\)|<\s*br\b[^<>]*>/gi
/** A break with no space before it: what glues the words. */
const GLUED_BREAK = /(\S)(?=\(\(\s*br\b[^()]*\)\)|<\s*br\b[^<>]*>)/gi

/** The value with a space put before every break that has none. Unchanged when no break glues. */
export const unglued = (value) => String(value ?? '').replace(GLUED_BREAK, '$1 ')

/** Whether `text` is `current` with only the missing spaces put before its breaks, and at least one put. */
export const isGluedRepair = (current, text) =>
  typeof text === 'string' && unglued(current) !== current && text === unglued(current)

const squashBare = (s) =>
  String(s ?? '')
    .replace(/\s+/g, '')
    .toLowerCase()

/** Whether a fault is glued words: a broken layout whose words, as the finder or the site check says, run together. */
export const isGluedFault = (fault) =>
  fault?.kind === 'broken-layout' &&
  (fault.causingCheck === 'glued-words' || /glue|run together|no space/i.test(String(fault.seen ?? '')))

/** Whether the glued words a fault quoted or measured are the words of this slot, spacing aside. */
export const gluedWordsOf = (fault, current) => {
  const words = squashBare(visibleText(current))
  return words.length >= 3 && squashBare(`${fault.seen ?? ''} ${fault.measured ?? ''}`).includes(words)
}

const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')

/**
 * Whether the served page shows the repair: before every break of the repaired value, the word that leads to it stands in
 * the page followed (past any closing tag) by a space and the break tag.
 */
export function servesUnglued(html, value) {
  const page = String(html ?? '')
  for (const m of String(value).matchAll(BREAK)) {
    const before = visibleText(String(value).slice(0, m.index)).split(' ').at(-1)
    if (!before) continue
    if (!new RegExp(`${escaped(before)}(?:\\s*</[a-z]+>)*\\s+<br\\b`, 'i').test(page)) return false
  }
  return true
}

const decoded = (s) =>
  String(s)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')

/**
 * The words of a page read the way the site check reads them (its glued words measure takes an element's text content): a
 * tag leaves nothing in its place, so a line break the template hides glues the words beside it ("Strengthnow"); spacing is
 * squashed and the case set aside, as a template may print a heading in capitals.
 */
export const siteCheckText = (html) =>
  decoded(
    String(html ?? '')
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, '')
  )
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** Whether the page, read the way the site check reads it, shows these words apart, a space between each. */
export const readsApart = (html, words) => {
  const wanted = visibleText(words).toLowerCase()
  return wanted.length > 0 && siteCheckText(html).includes(wanted)
}
