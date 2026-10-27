/**
 * A title's words as two names are compared by them: entities decoded, one case, letters and digits only (`post-title-faults.js`
 * `namesBusiness`). Until 12/10/2026 this module also told two rewritten post titles apart; the demo posts are translated now,
 * never rewritten (product owner, decision 1 after the g65 builds), and their titles repeat where the demo repeats them.
 */
import { plain } from './wp-blocks.js'

/** A title as two posts are told apart by it: entities decoded, one case, one spacing, no punctuation around it. */
export const sameTitle = (/** @type {unknown} */ text) =>
  plain(String(text ?? '').replace(/<[^>]*>/g, ' '))
    .normalize('NFC')
    .toLocaleLowerCase()
    .replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, '')

/** The words of a title, as a set: one case, letters and digits only. */
export const titleWords = (/** @type {unknown} */ text) =>
  new Set(sameTitle(text).match(/[\p{L}\p{N}]+/gu) ?? [])
