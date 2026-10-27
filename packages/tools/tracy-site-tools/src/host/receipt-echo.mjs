/**
 * WHAT A WRITE'S RECEIPT SHOWS, SO THE AGENT HAS NOTHING TO READ BACK AFTER IT (harness opt D, 09/10/2026).
 *
 * 🔒 WHY (bench traces, read-only: v7 cp5k 30/09, 144 turns; flow D tc-d 05/10, 54 writing turns). After
 * the LAST write of a turn the agent still read the site in 14/144 and 17/54 turns (18 and 59 calls). Most
 * of those followed a file edit or a rebuild, which has no receipt — that read is the check. But where a
 * door wrote, the reads looked for what the receipt did not say:
 * - a picture put in a contract slot (WordPress, Joomla): 7 of 32 such turns ended with `page.look` or a
 *   template grep, because the receipt was `{ids, revision, contentRevisions, afterRevision}` — four ids
 *   and three hashes, and no word of WHICH picture the slot now holds;
 * - an EmDash picture field: the receipt's before/after was 300 characters of the media object's JSON,
 *   cut before the alt text (`blurhash`, `dominantColor`, `meta.storageKey` first) — then `page.look` and
 *   two `curl`s to find the file name;
 * - `menu_set_items` answered `{name, itemCount}` and no `next`: no word that this was the receipt;
 * - a WordPress block write answered character counts only, and the agent read two pages for the words.
 * `content.replace`, whose receipt names each place with its words before and after, was followed by
 * no read at all in 87 turns. This module gives the other writes the same kind of receipt, short.
 *
 * 🔒 ONLY WHAT THE DOOR WROTE OR READ BACK. A contract apply's `wrote` is the values the component took
 * and checked under its lock (it inspects its contract after the write and rolls back on a fault);
 * `holds` is taken from the body the host already read back after a WordPress body write (`verifyBody`),
 * and only when every edited block's words are found there; EmDash's picture view is the item EmDash
 * answered. None of them says what a page SHOWS — no page is read for this, and nothing here claims one.
 *
 * 🔒 SHORT. A value ≤ {@link ECHO_VALUE_MAX} chars (a picture by its file name), ≤ {@link ECHO_SLOTS_MAX}
 * slots, ≤ {@link HOLDS_MAX} chars of words: the receipt is read once more on every later step.
 *
 * {@link createAfterWrite}: a read of the site made right after such a receipt — the next site call in
 * the same turn — carries one line saying the receipt was the check. Never a refusal: the read runs and
 * answers as before. Pure: no I/O.
 */

import { decodeEntities } from './html-units.mjs'

/** The characters one written value shows. */
export const ECHO_VALUE_MAX = 80
/** The slots one contract receipt lists; the rest are counted. */
export const ECHO_SLOTS_MAX = 8
/** The slot labels (where the slots print, with their language) one receipt names. */
export const ECHO_LABELS_MAX = 4
/** The characters of words `holds` shows. */
export const HOLDS_MAX = 160
/** The menu labels one `menu_set_items` receipt lists. */
export const MENU_LABELS_MAX = 12

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** @param {string} s @param {number} max */
const cut = (s, max) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`)

/** A picture's address: a path or URL ending in an image file's extension. */
const PICTURE = /\.(?:jpe?g|png|gif|webp|avif|svg)$/i

/**
 * A written value as the receipt shows it: words with their spaces collapsed, a picture by its file
 * name (the folder is the site's upload folder, the same for every picture), anything else as its JSON —
 * each cut to {@link ECHO_VALUE_MAX}.
 * @param {unknown} v
 * @returns {string}
 */
export function echoValue(v) {
  if (typeof v !== 'string') return cut(JSON.stringify(v) ?? 'null', ECHO_VALUE_MAX)
  const s = v.replace(/\s+/g, ' ').trim()
  const bare = s.replace(/[?#].*$/, '')
  if (bare.includes('/') && PICTURE.test(bare))
    return cut(bare.slice(bare.lastIndexOf('/') + 1), ECHO_VALUE_MAX)
  return cut(s, ECHO_VALUE_MAX)
}

/**
 * What an accepted contract apply wrote: each slot with the value the component took, and — when this
 * turn's inspect named them — the places those slots belong to, each once (a Joomla slot's label
 * without its ` / <field>` tail, with the language: "[Tracy Business] Home - Hero (en)"). Null when the
 * apply named no slot.
 * @param {unknown} changes - the `changes` map as it was SENT (after Tracy's own corrections).
 * @param {unknown} [slots] - the slot list of this turn's inspect (`{key, label}` records), if any.
 * @returns {{ wrote: Record<string, string>, in?: string[] } | null}
 */
export function contractWrote(changes, slots) {
  if (!isRecord(changes)) return null
  const keys = Object.keys(changes)
  if (keys.length === 0) return null
  /** @type {[string, string][]} */
  const shown = keys.slice(0, ECHO_SLOTS_MAX).map((k) => [k, echoValue(changes[k])])
  if (keys.length > ECHO_SLOTS_MAX) shown.push(['…', `${keys.length - ECHO_SLOTS_MAX} more`])
  /** @type {string[]} */
  const labels = []
  if (Array.isArray(slots))
    for (const k of keys) {
      const slot = slots.find((s) => isRecord(s) && s.key === k)
      // A Joomla slot's label is its place, then ` / <field>`: the place is what the receipt names, once.
      const full = isRecord(slot) && typeof slot.label === 'string' ? slot.label.trim() : ''
      const place = full.includes(' / ') ? full.slice(0, full.lastIndexOf(' / ')).trim() : full
      const label = cut(place, 60)
      if (label !== '' && !labels.includes(label)) labels.push(label)
    }
  // Built through entries so a slot key such as `__proto__` stays an ordinary key.
  const wrote = Object.fromEntries(shown)
  return labels.length > 0 ? { wrote, in: labels.slice(0, ECHO_LABELS_MAX) } : { wrote }
}

/**
 * An EmDash media value as a person reads it — `{id, filename?, alt?, width?, height?}`, a subset of the
 * object under its own key names — or null when the value is not a media object. EmDash answers a picture
 * field with the whole object (`provider`, `blurhash`, `dominantColor`, `meta.storageKey` …); cut at a
 * character count, the receipt showed the hashes and lost the file name and the alt text, the two things
 * the agent then read the page for.
 * @param {unknown} v
 * @returns {{ id: string, filename?: string, alt?: string, width?: number, height?: number } | null}
 */
export function mediaView(v) {
  if (!isRecord(v) || typeof v.id !== 'string' || v.id === '') return null
  if (typeof v.filename !== 'string' && typeof v.mimeType !== 'string' && typeof v.provider !== 'string')
    return null
  return {
    id: v.id,
    ...(typeof v.filename === 'string' && v.filename !== ''
      ? { filename: cut(v.filename, ECHO_VALUE_MAX) }
      : {}),
    ...(typeof v.alt === 'string' ? { alt: cut(v.alt, ECHO_VALUE_MAX) } : {}),
    ...(typeof v.width === 'number' && typeof v.height === 'number'
      ? { width: v.width, height: v.height }
      : {})
  }
}

/**
 * The words a block's markup shows: comments and tags dropped, entities decoded, spaces collapsed.
 * @param {string} markup
 */
export function visibleWords(markup) {
  return decodeEntities(
    String(markup)
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]*>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * What a WordPress body write's edited blocks now say, from the body the host read back after the write:
 * the words of each edited block (its markup, or a patch's `replace`), joined, ≤ {@link HOLDS_MAX}.
 * Null unless EVERY edited block's words are found in the stored body — a receipt never shows words the
 * read did not find — and null for a write that sent no words (attributes only).
 * @param {unknown} blocks - the call's `blocks` map, as the model sent it (position or name → edit).
 * @param {unknown} stored - the body read back.
 * @returns {string | null}
 */
export function bodyHolds(blocks, stored) {
  if (!isRecord(blocks) || typeof stored !== 'string') return null
  /** @type {string[]} */
  const said = []
  for (const edit of Object.values(blocks)) {
    const words =
      typeof edit === 'string'
        ? visibleWords(edit)
        : isRecord(edit) && typeof edit.replace === 'string'
          ? visibleWords(edit.replace)
          : ''
    if (words.length >= 2) said.push(words)
  }
  if (said.length === 0) return null
  const body = visibleWords(stored)
  if (!said.every((w) => body.includes(w))) return null
  return cut(said.join(' · '), HOLDS_MAX)
}

/**
 * An EmDash `menu_set_items` answer as a receipt: EmDash's own `{name, itemCount}`, the labels set in
 * their order when EmDash counted exactly the items sent, and the receipt's `next`. Null when the answer
 * is not that shape (it is then shown as EmDash sent it).
 * @param {Record<string, unknown>} args - the call's arguments.
 * @param {unknown} answer - EmDash's parsed answer.
 * @param {string} next - the EmDash receipt sentence.
 */
export function menuSetReceipt(args, answer, next) {
  if (!isRecord(answer) || typeof answer.itemCount !== 'number') return null
  const items = Array.isArray(args.items) ? args.items : null
  const labels =
    items !== null && items.length === answer.itemCount
      ? items
          .slice(0, MENU_LABELS_MAX)
          .map((it) => (isRecord(it) && typeof it.label === 'string' ? cut(it.label.trim(), 40) : '?'))
      : []
  return {
    ...answer,
    ...(labels.length > 0 ? { labels } : {}),
    ...(labels.length > 0 && answer.itemCount > MENU_LABELS_MAX
      ? { labelsLeftOut: answer.itemCount - MENU_LABELS_MAX }
      : {}),
    next
  }
}

// ── A read right after a receipt ─────────────────────────────────────────────────────────────────

/** The `tracy_site` reads of the site a receipt already answers for. */
const SITE_READS = new Set(['page.text', 'page.look', 'content.get', 'content.read'])

/** A `next` that itself asks for a read: the read after it is the one the door asked for. */
const ASKS_A_READ = /\b(?:content\.get|content\.read|page\.text|page\.look|media\.scan|inspect|content_get)\b/

/**
 * The one line a read right after a receipt carries.
 * @param {string} what - the write, as the agent called it (`content.contract`, `content_update`).
 */
export const afterWriteLine = (what) =>
  `The write just before this (${what}) answered with its receipt: that is the check. Read again only for a next change, or for a head, code or translation-link change.`

/**
 * A write that went through cleanly — no warning, no unchecked or unshown result, no `next` asking for a
 * read: class (b) only. A write that came back with any of those leaves the read after it alone.
 * @param {unknown} answer
 */
function cleanReceipt(answer) {
  if (!isRecord(answer) || answer.ok !== true) return false
  const r = isRecord(answer.result) ? answer.result : answer
  for (const part of r === answer ? [answer] : [answer, r]) {
    if (Array.isArray(part.warnings) && part.warnings.length > 0) return false
    if (part.verified === false || (typeof part.verified === 'string' && /\bnot\b/i.test(part.verified)))
      return false
    if (part.stillHolds !== undefined || part.alsoIn !== undefined || part.mixed !== undefined) return false
    if (typeof part.next === 'string' && ASKS_A_READ.test(part.next)) return false
  }
  return true
}

/**
 * @typedef {{ tool: string, action: string, operation?: string, head?: boolean, write: boolean }} SiteCallKind
 *   One site call as the reminder reads it: the tool, its action (`tracy_site`) or EmDash tool name, and
 *   whether it changes the site (the host's own `changesSite`).
 */

/**
 * The reminder's memory: per conversation, the clean receipt the last site call answered with, in which
 * turn. The next site call takes it: a read of the site in the same turn carries {@link afterWriteLine};
 * any other call simply clears it. One line per receipt, never a second.
 */
export function createAfterWrite() {
  /** @type {Map<string, { turn: number, what: string }>} */
  const last = new Map()
  return {
    /**
     * @param {unknown} sessionId
     * @param {number} turn - the conversation's turn (`call-memory.mjs` `turnOf`).
     * @param {SiteCallKind} call
     * @param {unknown} answer - what the call answered.
     * @returns {unknown} the answer, with `afterWrite` when it is a read right after a clean receipt.
     */
    see(sessionId, turn, call, answer) {
      if (typeof sessionId !== 'string' || sessionId === '') return answer
      const held = last.get(sessionId)
      last.delete(sessionId)
      if (call.write) {
        if (cleanReceipt(answer)) {
          last.set(sessionId, { turn, what: call.action })
          // A conversation's entry is one line; the map is bounded by the conversations this host serves.
          if (last.size > 500) last.delete(/** @type {string} */ (last.keys().next().value))
        }
        return answer
      }
      if (held === undefined || held.turn !== turn || !isRecord(answer)) return answer
      const read =
        call.tool === 'tracy_emdash'
          ? call.action === 'content_get'
          : SITE_READS.has(call.action) ||
            (call.action === 'content.contract' && call.operation === 'inspect')
      // A head is the exception the rules name: the receipt shows no head.
      if (!read || call.head === true) return answer
      return { ...answer, afterWrite: afterWriteLine(held.what) }
    },
    /** @param {unknown} sessionId */
    forget(sessionId) {
      if (typeof sessionId === 'string') last.delete(sessionId)
    }
  }
}
