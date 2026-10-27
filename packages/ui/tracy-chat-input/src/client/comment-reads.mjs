/**
 * This person's read marks on the site's comments (Comments list redesign A, Akemi 01/10/2026; TCH
 * `apps/tracy-web` `045-site-comment-read.sql`, `059-site-comment-read-seen-n.sql`): which threads they
 * opened and what they saw there, and the ones they marked unread. The marks live on the server, per
 * account — never in the browser's storage, which would differ per machine and per browser and vanish
 * with the site's data, and an unread dot people trust must not lie.
 *
 *   GET  /api/sites/:key/comments/reads        → {reads: [{id, seenN}]}   (`seenN` null = marked unread)
 *   POST /api/sites/:key/comments/:id/read     {seenN} → {read: {id, seenN}}
 *   POST /api/sites/:key/comments/:id/unread   → {read: {id, seenN: null}}
 *
 * A mark is WHAT THE TAB DREW (Lee 04/10/2026): `seenN` is the largest number of the other people's
 * messages in the thread as the lists hold it at the moment it is opened (`comment-view.mjs` `seenOf`),
 * never the server's clock — a reply written while the POST was on its way stays unread. The server
 * never lowers a mark and answers the one it keeps.
 *
 * The lists hold them (`comment-view.mjs` `setReads` / `markRead`); whether a row is unread is decided
 * there (`unreadOf`). A mark is filed at once and taken back when the door refuses it: what the row says
 * is what the server keeps. A `/reads` answer never undoes a mark filed while it was on its way.
 */
import { commentsDoor } from './comment-server.mjs'
import { seenOf } from './comment-view.mjs'

/** @typedef {(input: string, init?: RequestInit) => Promise<Response>} FetchLike */

/** @param {unknown} v @returns {v is number} a mark's number: a whole number, 0 or more. */
const isSeen = (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0

/**
 * The marks of a `/reads` answer, or null when it is not one.
 * @param {unknown} body
 * @returns {[string, number | null][] | null}
 */
export function readMarksOf(body) {
  if (body === null || typeof body !== 'object') return null
  const reads = /** @type {{ reads?: unknown }} */ (body).reads
  if (!Array.isArray(reads)) return null
  /** @type {[string, number | null][]} */
  const marks = []
  for (const r of reads) {
    if (r === null || typeof r !== 'object' || typeof r.id !== 'string' || r.id === '') continue
    marks.push([r.id, isSeen(r.seenN) ? r.seenN : null])
  }
  return marks
}

/**
 * @param {{ lists: { setReads(marks: Iterable<[string, number | null]>): void, markRead(id: string, seen: number | null | undefined): void,
 *   getSnapshot(): import('./comment-view.mjs').ListsSnapshot },
 *   siteKey: string, fetch: FetchLike }} input
 * @returns {{ load(): Promise<void>, read(id: string): Promise<boolean>, unread(id: string): Promise<boolean> }}
 */
export function createCommentReads({ lists, siteKey, fetch }) {
  const door = commentsDoor(siteKey)
  /** Marks filed by this page, in order: id → the turn it was last filed at. */
  /** @type {Map<string, number>} */
  const filed = new Map()
  let turn = 0
  /**
   * @param {string} id
   * @param {boolean} unread
   */
  const mark = async (id, unread) => {
    const snapshot = lists.getSnapshot()
    const before = snapshot.reads?.marks
    const had = before?.has(id) === true
    const was = before?.get(id)
    const seen = unread ? null : seenOf(snapshot, id)
    filed.set(id, ++turn)
    lists.markRead(id, seen)
    try {
      const res = await fetch(`${door}/${encodeURIComponent(id)}/${unread ? 'unread' : 'read'}`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        credentials: 'same-origin',
        ...(unread ? {} : { body: JSON.stringify({ seenN: seen }) })
      })
      if (!res.ok) throw new Error(String(res.status))
      const body = /** @type {{ read?: { seenN?: unknown } }} */ (await res.json())
      const kept = body?.read?.seenN
      // The mark the server keeps: never below one another tab of this person filed.
      lists.markRead(id, unread ? null : isSeen(kept) ? kept : seen)
      return true
    } catch {
      // Not kept: the row says what the server holds.
      lists.markRead(id, had ? /** @type {number | null} */ (was) : undefined)
      return false
    }
  }
  return {
    async load() {
      const from = turn
      try {
        const res = await fetch(`${door}/reads`, {
          headers: { accept: 'application/json' },
          credentials: 'same-origin'
        })
        const marks = res.ok ? readMarksOf(await res.json()) : null
        if (marks === null) return
        // A mark filed while this answer was on its way is newer than it: keep the page's.
        const now = lists.getSnapshot().reads?.marks
        const merged = new Map(marks)
        for (const [id, at] of filed)
          if (at > from) {
            if (now?.has(id) === true) merged.set(id, /** @type {number | null} */ (now.get(id)))
            else merged.delete(id)
          }
        lists.setReads(merged)
      } catch {
        // No answer: nothing reads as unread until one comes (`unreadOf` waits for `ready`).
      }
    },
    read: (id) => mark(id, false),
    unread: (id) => mark(id, true)
  }
}
