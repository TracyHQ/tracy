/**
 * A REMOVAL'S RECEIPT SAYS WHETHER ITS WORDS STILL SHOW (ladder DL09 on dsl2jo, JA Essence j6, 14/10/2026).
 *
 * WHY. Asked "delete the section <article title> from the home page", the agent took the article off the
 * home's featured list (`content.update {kind:"article", id:18, fields:{featured:0}}`). The receipt said
 * "This is the receipt: nothing to read back", and the agent told the customer the part was gone. It was
 * not: a second article with the same title moved into the list, and the title still showed on the home
 * page. A blog home lists one title in several places (a featured list, a slider, a "latest" module), so
 * taking one record off one of them is not the same as the words leaving the page — and a write's own
 * answer cannot know which other places print them. Only the page can.
 *
 * WHAT IS CHECKED. A write that takes a record off the pages that list it — a delete (the kind's trash
 * column), or an update that unpublishes, trashes, archives or unfeatures it — on Joomla or WordPress.
 * Its words are the record's own title, as the site stores it (read once before the write). The pages
 * are the ones this conversation read last (`page.text`; the home page when it read none), each read for
 * those words BEFORE the write and AGAIN AFTER it: a page that did not show them is no claim, a page that
 * still shows them is said with how many places, and only a page where they are gone lets the receipt
 * say so. Any read that fails makes no claim either way: the receipt is then the plain one.
 *
 * 🔒 GENERIC, NEVER A TEMPLATE. Nothing here knows a module, a position or a layout: the record's title
 * and the page's visible words are the whole check, the same on every Joomla and WordPress site.
 *
 * Pure but for the two reads the caller hands in (`read`: the relay; `readPage`: `page.text`).
 */

import { decodeEntities } from './html-units.mjs'

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** @param {unknown} v */
const positiveId = (v) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : NaN
  return Number.isInteger(n) && n > 0 ? n : 0
}

/**
 * The values that take a record off the pages listing it, per platform and column — the CMS's own
 * meanings, never a template's. Joomla: `state` (articles, contacts, newsfeeds…) 0 unpublished, 2
 * archived, -2 trashed; `published` (modules, menu items, categories, tags…) 0 or -2; `featured` 0 takes
 * an article off every featured list. WordPress: a `post_status` a visitor cannot open.
 * @type {Readonly<Record<string, Readonly<Record<string, readonly (string | number)[]>>>>}
 */
export const HIDING_VALUES = Object.freeze({
  joomla: Object.freeze({ state: [0, 2, -2], published: [0, -2], featured: [0] }),
  wordpress: Object.freeze({ post_status: ['draft', 'pending', 'private', 'trash'] })
})

/** The most pages one removal is read on: the newest the conversation read. */
export const REMOVAL_PAGES_MAX = 2
/** The shortest title judged: shorter words match every menu label and say nothing. */
export const REMOVAL_WORDS_MIN = 4
/** The longest title quoted in the receipt (the match itself uses the whole title). */
const QUOTED_MAX = 60

/**
 * The record a call takes off its pages, or null when it is no such call: a delete, or an update of an
 * existing record (an id) whose fields set one of {@link HIDING_VALUES}.
 * @param {string} platform
 * @param {string} action
 * @param {Record<string, unknown>} params - the call as it will be sent.
 * @returns {{ kind: string, id: number } | null}
 */
export function removalOf(platform, action, params) {
  const hiding = Object.hasOwn(HIDING_VALUES, platform) ? HIDING_VALUES[platform] : null
  if (hiding === null || !isRecord(params)) return null
  const kind = typeof params.kind === 'string' ? params.kind.trim() : ''
  const id = positiveId(params.id)
  if (kind === '' || id === 0) return null
  if (action === 'content.delete') return { kind, id }
  if (action !== 'content.update' || !isRecord(params.fields)) return null
  for (const [column, values] of Object.entries(hiding)) {
    if (!Object.hasOwn(params.fields, column)) continue
    const value = params.fields[column]
    const asNumber = typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value) : value
    if (values.includes(/** @type {string | number} */ (asNumber))) return { kind, id }
  }
  return null
}

/**
 * A record's title as a visitor reads it, from a `content.get` item: Joomla `title` (a contact's
 * `name`), WordPress `post_title`. Null when it has none worth matching.
 * @param {unknown} item
 * @returns {string | null}
 */
export function wordsOf(item) {
  if (!isRecord(item)) return null
  const raw = [item.title, item.post_title, item.name].find((v) => typeof v === 'string' && v.trim() !== '')
  if (typeof raw !== 'string') return null
  const words = decodeEntities(raw.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
  return words.length >= REMOVAL_WORDS_MIN ? words : null
}

/**
 * The pages a removal is read on: the newest distinct paths this conversation read, else the home page.
 * @param {unknown} seen - newest first.
 * @returns {string[]}
 */
export function pagesToRead(seen) {
  const paths = (Array.isArray(seen) ? seen : []).filter(
    (p) => typeof p === 'string' && p.startsWith('/') && !p.startsWith('//')
  )
  const distinct = [...new Set(paths)].slice(0, REMOVAL_PAGES_MAX)
  return distinct.length > 0 ? distinct : ['/']
}

/**
 * How many lines of a `page.text {match}` answer hold the words, or null when the page was not read.
 * @param {unknown} answer
 * @returns {number | null}
 */
export function shownCount(answer) {
  if (!isRecord(answer) || answer.ok !== true) return null
  return typeof answer.matchedLines === 'number' && Number.isInteger(answer.matchedLines)
    ? answer.matchedLines
    : null
}

/** @param {string} s */
const quoted = (s) => (s.length > QUOTED_MAX ? `${s.slice(0, QUOTED_MAX - 1)}…` : s)

/** The longest `match` the receipt's next names: a part of the words finds them as the whole does. */
const MATCH_MAX = 40

/**
 * The words as a `page.text` match: whole when short, else their start cut at a word (never with `…`,
 * which the page does not hold).
 * @param {string} s
 */
const matchOf = (s) => {
  if (s.length <= MATCH_MAX) return s
  const head = s.slice(0, MATCH_MAX)
  const space = head.lastIndexOf(' ')
  return (space >= 12 ? head.slice(0, space) : head).trim()
}

/** The receipt's last sentence, as every write's (`WRITE_RECEIPT_NEXT`, site-call.mjs). */
const UNDO_SENTENCE = 'Keep the apply_id to yourself: apply.revert with it if they ask to undo.'

/**
 * The write's answer with what its page reads said: `stillShows` (and a next that forbids "gone"), or
 * `goneFrom` (and a receipt that may say it). A refusal, an answer that already carries its next, or no
 * page that showed the words before leaves the answer as it was.
 * @param {unknown} answer
 * @param {{ words: string, pages: { path: string, before: number | null, after: number | null }[] }} check
 * @returns {unknown}
 */
export function removalReceipt(answer, { words, pages }) {
  if (!isRecord(answer) || answer.ok !== true || 'next' in answer) return answer
  const judged = pages.filter(
    (p) => typeof p.before === 'number' && p.before > 0 && typeof p.after === 'number'
  )
  if (judged.length === 0) return answer
  const still = judged.filter((p) => /** @type {number} */ (p.after) > 0)
  const w = quoted(words)
  if (still.length > 0) {
    const first = still[0]
    const where = still.map((p) => `${p.path} (${p.after} of the ${p.before} places it showed)`).join(', ')
    return {
      ...answer,
      stillShows: { words: w, on: still.map((p) => ({ path: p.path, places: p.after, before: p.before })) },
      next: `"${w}" still shows on ${where}: another part of the page prints it. Do not tell the customer it is gone: page.text {path:"${first.path}", match:"${matchOf(words)}"} shows where; take that off too, or say where it still shows. apply.revert {apply_id} undoes this change if asked.`
    }
  }
  const gone = judged.map((p) => p.path)
  return {
    ...answer,
    goneFrom: gone,
    // the words are gone, but the box that held them may be left empty (the design-system ladder's DL09,
    // 15/10/2026: an unpublished sidebar module left a blank half row, reported done): one look shows it
    next: `This is the receipt: "${w}" no longer shows on ${gone.join(', ')} (read again after the write). What held it may leave a gap: page.look {path:"${gone[0]}"} once; close a gap it left (the row or column around it), or tell the customer it is there. When every change asked is made, tell the customer what changed, in plain words. ${UNDO_SENTENCE}`
  }
}

/**
 * The reads around one removal: the record's title and its pages before the write (null when the call
 * is no removal or nothing can be judged), and the receipt after it.
 * @param {{ platform: string, action: string, params: Record<string, unknown>,
 *   read: (action: string, params: Record<string, unknown>) => Promise<unknown>,
 *   readPage: ((path: string, match: string) => Promise<unknown>) | null,
 *   seen: unknown }} input
 * @returns {Promise<{ words: string, pages: { path: string, before: number | null }[] } | null>}
 */
export async function removalBefore({ platform, action, params, read, readPage, seen }) {
  if (typeof readPage !== 'function') return null
  const target = removalOf(platform, action, params)
  if (target === null) return null
  let got
  try {
    got = await read('content.get', { kind: target.kind, id: target.id })
  } catch {
    return null
  }
  const words = isRecord(got) && got.ok === true ? wordsOf(got.item) : null
  if (words === null) return null
  const pages = []
  for (const path of pagesToRead(seen))
    pages.push({ path, before: shownCount(await safely(readPage, path, words)) })
  return pages.some((p) => typeof p.before === 'number' && p.before > 0) ? { words, pages } : null
}

/**
 * The receipt of a removal whose pages were read before it: each page read again, then
 * {@link removalReceipt}.
 * @param {unknown} answer
 * @param {{ words: string, pages: { path: string, before: number | null }[] } | null} before
 * @param {((path: string, match: string) => Promise<unknown>) | null} readPage
 * @returns {Promise<unknown>}
 */
export async function removalAfter(answer, before, readPage) {
  if (before === null || typeof readPage !== 'function') return answer
  if (!isRecord(answer) || answer.ok !== true || 'next' in answer) return answer
  const pages = []
  for (const p of before.pages)
    pages.push({
      ...p,
      after:
        typeof p.before === 'number' && p.before > 0
          ? shownCount(await safely(readPage, p.path, before.words))
          : null
    })
  return removalReceipt(answer, { words: before.words, pages })
}

/**
 * One page read that never throws: a read that fails is no read.
 * @param {(path: string, match: string) => Promise<unknown>} readPage
 * @param {string} path
 * @param {string} words
 */
async function safely(readPage, path, words) {
  try {
    return await readPage(path, words)
  } catch {
    return null
  }
}
