/**
 * 🔒 A RECORD IN N LANGUAGES IS DELETED WITH ONE QUESTION AND ONE CALL (WordPress and Joomla, 09/10/2026).
 *
 * WordPress (Polylang) and Joomla (associations) keep one record per language, and `content.delete` takes
 * one record. The door's confirmation was keyed on that one call, so deleting a news post that lives in 41
 * languages asked the customer, removed ONE language, and every other language needed its own question:
 * measured on the local stand (benchwp02, "Xoá bài tin … khỏi website"), one run made 82 refused
 * `content.delete` calls, asked the customer 4 times, spent 109 tool calls, 1.3M prompt tokens and 274 s,
 * and still left 39 languages online; other runs went round the door with `wp post delete` in bash.
 * Joomla (benchjoomla02) showed the same pattern on a smaller group. EmDash was fixed for exactly this in
 * round 7 (`emdash-call.mjs` F3.2 / F4); this is the same design for the two plugin platforms:
 *
 * - The record's translation group is read from the site's own Content API (`content.read`, the plugin's
 *   projection: `translationGroupId`, `locale` and `native` per row — Polylang's `post_translations`,
 *   Joomla's `#__associations`), never guessed. A read that fails, a site in one language, a record the
 *   listing does not hold (a draft) or a walk past {@link WALK_PAGES_MAX} pages leaves the delete as it
 *   was: one record, the plain question.
 * - A delete that names no language (`locale` left out) of a record whose group holds 2+ languages is
 *   the WHOLE record: the door's question says "in all N languages" and its key is the group's members
 *   ({@link groupConfirmKey}), so the customer's yes authorises exactly those records — another post, or
 *   a group that changed since the question, is another key and is asked again.
 * - After the yes, the same one call deletes every member, each through the plugin's own per-item
 *   `content.delete` under the call's one `apply_id` (the host loops; the agent makes one call), and its
 *   answer lists what went (ids and languages), what failed, and the one undo that puts them all back.
 * - `locale` beside the id is one language: that record only, the question says the other languages stay
 *   online, and the answer names the one call that removes them too (asked first, as any delete is).
 */

import { sameCallKey } from './call-memory.mjs'

/** The record kinds whose deletes are read for a translation group, per platform. */
export const GROUP_DELETE_KINDS = Object.freeze({
  // Every WordPress page and post is `kind:"post"` here (`normalize.mjs` WP-21 reads `page` as `post`).
  wordpress: Object.freeze(['post']),
  // The two Joomla contexts the plugin's projection groups by association (`ContentProjection.php`).
  joomla: Object.freeze(['article', 'menuItem'])
})

/** The keys a walk asks of each row (`native` and `id` always come). */
export const WALK_FIELDS = 'title,locale,translationGroupId'
/** Rows per listing page: the Content API's own ceiling (`content-api-v1.md` §1). */
export const WALK_PAGE_ROWS = 100
/** Pages one walk reads at most; past it the group is unknown and the delete stays one record. */
export const WALK_PAGES_MAX = 30
/** How long a walk is trusted for the same conversation and site, while nothing was written there. */
export const WALK_TTL_MS = 10 * 60_000

/**
 * One member of a translation group: the record the plugin's `content.delete` takes, and its language.
 * @typedef {{ id: number, locale: string }} GroupMember
 */
/**
 * A record's translation group: the record asked about first, then the other languages in locale order.
 * @typedef {{ kind: string, id: number, title: string | null, members: GroupMember[] }} TranslationGroup
 */
/**
 * One row of a walk: its native id of each kind, its language, its group and title.
 * @typedef {{ natives: Map<string, number>, locale: string | null, group: string | null, title: string | null }} WalkRow
 */

/** @param {unknown} v @returns {v is Record<string, any>} */
const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** @param {unknown} v */
const positiveInt = (v) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : NaN
  return Number.isSafeInteger(n) && n > 0 ? n : 0
}

/**
 * Whether a delete is one whose translation group is read: `content.delete` of a WordPress post or a
 * Joomla article / menu item, named by its number.
 * @param {string} platform
 * @param {{ action: string, params: Record<string, unknown> }} call - the normalised call.
 */
export function groupDeleteApplies(platform, call) {
  if (call.action !== 'content.delete') return false
  const kinds = /** @type {Record<string, readonly string[]>} */ (GROUP_DELETE_KINDS)[platform]
  if (kinds === undefined) return false
  return kinds.includes(String(call.params.kind ?? '')) && positiveInt(call.params.id) > 0
}

/**
 * Every row of the site's content listing, read page by page (`content.read`, no type, every language),
 * or null when the site cannot say: a refusal, an answer that is not the Content API envelope, a site that
 * serves one language (read from the first page: nothing to group), or more than {@link WALK_PAGES_MAX}
 * pages. Plain reads through the relay; nothing is written.
 * @param {(action: string, params: Record<string, unknown>) => Promise<unknown>} send
 * @returns {Promise<WalkRow[] | null>}
 */
export async function walkContent(send) {
  /** @type {WalkRow[]} */
  const rows = []
  /** @type {string | null} */
  let cursor = null
  for (let page = 0; page < WALK_PAGES_MAX; page++) {
    const params = {
      limit: WALK_PAGE_ROWS,
      fields: WALK_FIELDS,
      ...(cursor !== null ? { cursor } : {})
    }
    const got = /** @type {any} */ (await send('content.read', params))
    if (!isRecord(got) || got.schemaVersion !== 'tracy-content/v1' || !Array.isArray(got.contents))
      return null
    if (page === 0 && !(Array.isArray(got.site?.locales) && got.site.locales.length > 1)) return null
    for (const c of got.contents) {
      if (!isRecord(c)) continue
      /** @type {Map<string, number>} */
      const natives = new Map()
      for (const one of Array.isArray(c.native) ? c.native : []) {
        const id = positiveInt(one?.id)
        if (typeof one?.kind === 'string' && id > 0 && !natives.has(one.kind)) natives.set(one.kind, id)
      }
      if (natives.size === 0) continue
      rows.push({
        natives,
        locale: typeof c.locale === 'string' && c.locale !== '' ? c.locale : null,
        group:
          typeof c.translationGroupId === 'string' && c.translationGroupId !== ''
            ? c.translationGroupId
            : null,
        title: typeof c.title === 'string' && c.title.trim() !== '' ? c.title.trim() : null
      })
    }
    const next = got.pagination?.nextCursor
    if (typeof next !== 'string' || next === '') return rows
    cursor = next
  }
  return null
}

/**
 * The translation group of one record, from a walk: null when the record is not in it, has no group,
 * or its group holds fewer than two languages, or two members share a language (the plugins never group
 * so; a group read that way is not trusted).
 * @param {WalkRow[]} rows
 * @param {string} kind
 * @param {number} id
 * @returns {TranslationGroup | null}
 */
export function groupOf(rows, kind, id) {
  // A Joomla page names its menu item first and the article it shows after it: the record a kind and id
  // name is the row whose FIRST native it is, when there is one (the article's own row, not the page's).
  const named = rows.filter((r) => r.natives.get(kind) === id)
  const own = named.find((r) => r.natives.keys().next().value === kind) ?? named[0]
  if (own === undefined || own.group === null || own.locale === null) return null
  /** @type {Map<number, GroupMember>} */
  const byId = new Map()
  for (const r of rows) {
    const member = r.natives.get(kind)
    if (r.group !== own.group || member === undefined || r.locale === null || byId.has(member)) continue
    byId.set(member, { id: member, locale: r.locale })
  }
  const others = [...byId.values()]
    .filter((m) => m.id !== id)
    .sort((a, b) => (a.locale < b.locale ? -1 : a.locale > b.locale ? 1 : a.id - b.id))
  if (others.length === 0) return null
  const members = [{ id, locale: own.locale }, ...others]
  if (new Set(members.map((m) => m.locale.toLowerCase())).size !== members.length) return null
  return { kind, id, title: own.title, members }
}

/**
 * The walks this host made, per call memory, conversation and site: reused while the site's generation
 * (`invalidateSite`, bumped by every write through Tracy) has not moved and {@link WALK_TTL_MS} has not
 * passed — so the refused call and the confirmed one read the same group with one walk.
 * @type {WeakMap<object, Map<string, { generation: number, at: number, rows: WalkRow[] | null }>>}
 */
const WALKS = new WeakMap()

/**
 * The translation group of a delete's record, walked once per conversation and site while nothing changed.
 * @param {{
 *   send: (action: string, params: Record<string, unknown>) => Promise<unknown>,
 *   memory?: { generationOf?: (label: unknown) => number } | null,
 *   sessionId?: string | null, label?: string | null, now?: () => number,
 *   kind: string, id: number }} input
 * @returns {Promise<TranslationGroup | null>}
 */
export async function translationGroupOf({
  send,
  memory = null,
  sessionId = null,
  label = null,
  now = Date.now,
  kind,
  id
}) {
  const generation = typeof memory?.generationOf === 'function' ? memory.generationOf(label) : null
  const key = `${sessionId ?? ''}\0${label ?? ''}`
  let held = memory !== null && generation !== null ? WALKS.get(memory) : undefined
  const hit = held?.get(key)
  if (hit !== undefined && hit.generation === generation && now() - hit.at < WALK_TTL_MS)
    return hit.rows === null ? null : groupOf(hit.rows, kind, id)
  const rows = await walkContent(send)
  if (memory !== null && generation !== null && sessionId) {
    if (held === undefined) {
      held = new Map()
      WALKS.set(memory, held)
    }
    held.delete(key)
    held.set(key, { generation, at: now(), rows })
    while (held.size > 64) {
      const oldest = held.keys().next().value
      if (oldest === undefined) break
      held.delete(oldest)
    }
  }
  return rows === null ? null : groupOf(rows, kind, id)
}

/**
 * The key a whole-record delete is confirmed under: the kind and every member's id, sorted — whichever
 * member the call named. Another post, or the same post after a language was added or removed, is
 * another key, so one yes never opens more than the records its question counted.
 * @param {TranslationGroup} group
 */
export function groupConfirmKey(group) {
  const ids = group.members.map((m) => m.id).sort((a, b) => a - b)
  return `tracy_site:${sameCallKey('tracy_site', { action: 'content.delete', params: { kind: group.kind, translations: ids } })}`
}

/**
 * Whether a language the call named is this member's: the same tag, or its primary language when that
 * names exactly one member (`ru` for `ru-RU`), case aside.
 * @param {string} asked
 * @param {GroupMember[]} members
 * @returns {GroupMember | null}
 */
export function memberByLocale(asked, members) {
  const want = asked.trim().toLowerCase().replace(/_/g, '-')
  if (want === '') return null
  const exact = members.find((m) => m.locale.toLowerCase().replace(/_/g, '-') === want)
  if (exact !== undefined) return exact
  const primary = members.filter((m) => m.locale.toLowerCase().split('-')[0] === want.split('-')[0])
  return primary.length === 1 ? primary[0] : null
}

/** The record as the customer reads it: its title in quotes, else "this page or post". @param {TranslationGroup} group */
export function recordNamed(group) {
  const title =
    group.title === null ? null : group.title.length > 80 ? `${group.title.slice(0, 79)}…` : group.title
  return title === null ? (group.kind === 'menuItem' ? 'this page' : 'this post') : `"${title}"`
}

/**
 * A refusal's code as the plugin or the host wrote it (`code`, or the plugin's `error:"not_found"`).
 * @param {Record<string, any>} a
 */
function failureCode(a) {
  const code =
    typeof a.code === 'string' && a.code !== ''
      ? a.code
      : typeof a.error === 'string' && /^[a-z_]+$/.test(a.error)
        ? a.error
        : isRecord(a.error) && typeof a.error.code === 'string'
          ? a.error.code
          : 'FAILED'
  return code.slice(0, 40)
}

/**
 * The answer of a whole-record delete, from each member's own answer (the record asked about first):
 * every record that went with its language, every one that did not with the plugin's code, and the one
 * undo that puts them all back (`apply.revert` of the call's `apply_id`, under which every member went).
 * @param {TranslationGroup} group
 * @param {Array<{ member: GroupMember, answer: unknown }>} results - in the order they were sent.
 * @param {GroupMember[]} notTried - members left unsent because an answer was lost.
 * @param {string} applyId
 */
export function groupAnswer(group, results, notTried, applyId) {
  const deleted = []
  const failed = []
  for (const { member, answer } of results) {
    const a = isRecord(answer) ? answer : {}
    if (a.ok === true) deleted.push({ id: member.id, locale: member.locale })
    else failed.push({ id: member.id, locale: member.locale, code: failureCode(a) })
  }
  for (const member of notTried) failed.push({ id: member.id, locale: member.locale, code: 'NOT_SENT' })
  const n = group.members.length
  /** @type {Record<string, unknown>} */
  const out = {
    ok: true,
    kind: group.kind,
    id: group.id,
    languages: n,
    deleted,
    ...(applyId !== ''
      ? { undo: `apply.revert {apply_id:"${applyId}"} puts back all ${deleted.length}` }
      : {})
  }
  if (failed.length > 0) {
    out.failed = failed
    const lost = failed.some((f) => f.code === 'OUTCOME_UNKNOWN' || f.code === 'NOT_SENT')
    out.next = `${deleted.length} of ${n} languages were deleted; ${failed.length} ${failed.length === 1 ? 'is' : 'are'} not (failed): tell the customer which.${lost && applyId !== '' ? ` The site stopped answering: apply.list {apply_id:"${applyId}"} shows what went.` : ''} The same call with no locale asks them once more for what is left.`
  }
  return out
}
