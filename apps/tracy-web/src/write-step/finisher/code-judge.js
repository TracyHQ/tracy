// Repairs code can judge without a model (spec #418, #424): a repair that never changes a word, whose result is plain in the
// page the site serves now. No checker call, no screenshot:
//   - fix-text: the slot's words as they printed with their markup are gone from the page, and its words are on it unchanged;
//   - mark-emphasis: the heading's words are on the page unchanged, and the marked words are wrapped in a span;
//   - a glued words fix-text: a space stands before every line break of the heading (glued-words.js).
// Pure, but for the page read it is handed. Without a page reader the repair goes to the checker as before.
import { visibleText } from '../../lib/site-copy/emphasis-markup.js'
import { servesUnglued } from './glued-words.js'

/** Order kinds code judges on the served page. */
export const CODE_JUDGED = new Set(['fix-text', 'mark-emphasis'])

/** Markup as a slot may print it: content map codes such as ((span)), and HTML tags. */
const MARKUP = /\(\(\s*\/?[a-z][a-z0-9]*\b[^()]*\)\)|<\/?[a-z][a-z0-9]*\b[^<>]*>/gi

const squash = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
const decoded = (s) =>
  String(s)
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')

/** The words a visitor reads on the page: real tags taken out first, so a tag printed as text stays a word. */
export const pageWords = (html) =>
  squash(
    decoded(
      String(html)
        .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
    )
  )

/**
 * @param {string} html the page as the site serves it now
 * @param {{ order: object, valid: { current: string, after: string } }} repair
 * @returns {{ verdict: 'better' | 'not better', reason: string }}
 */
export function codeVerdict(html, { order, valid }) {
  if (valid.glued)
    return servesUnglued(html, valid.after)
      ? { verdict: 'better', reason: 'the served page puts a space before the line break of the heading' }
      : { verdict: 'not better', reason: 'the served page still glues the words at the line break' }
  const words = pageWords(html)
  const shown = squash(visibleText(valid.after))
  // The slot's words as they printed before, markup and all: still on the page, the repair did not reach it.
  if (order.kind === 'fix-text' && words.includes(squash(valid.current))) {
    const markup = (String(valid.current).match(MARKUP) ?? []).join(', ')
    return {
      verdict: 'not better',
      reason: `the served page still prints ${markup || 'the words as they were'}`
    }
  }
  if (!words.includes(shown))
    return { verdict: 'not better', reason: 'the served page does not show the words of the slot unchanged' }
  if (order.kind === 'fix-text')
    return { verdict: 'better', reason: 'the served page prints the words without the markup' }
  const marked = new RegExp(`<span\\b[^>]*>\\s*${escaped(String(order.words ?? '').trim())}\\s*</span>`, 'i')
  return marked.test(String(html))
    ? { verdict: 'better', reason: 'the served page marks the words in a span, the heading unchanged' }
    : { verdict: 'not better', reason: 'the served page does not mark the words in a span' }
}
