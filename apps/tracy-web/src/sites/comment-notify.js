/**
 * Who a comment event tells, and what (spec #809 cases C1–C3, rules R1–R3). The comment doors
 * (`./comments.js`) call these AFTER their own write has committed; a notification failing never
 * undoes the comment (every function here catches and logs, and `notify` itself never throws).
 *
 *   C1  a comment naming people it mentions (`mentions`, account ids picked in the `@` picker) →
 *       each of them: `comment.mention {quote, page, n, commentId}`. An edit tells only the ids it
 *       adds.
 *   C2  a reply → the thread's root author and everyone who wrote a live comment in that thread
 *       before: `comment.reply {quote, page, n, commentId, yours}` (`yours` for the root author),
 *       `ref: thread:<rootId>`, mailed at once and then grouped for 5 minutes (the notifier holds).
 *   C3  resolve / reopen by the door → the root author: `comment.resolved` / `comment.reopened`
 *       `{quote, page, n, commentId}`. A reply that reopens a resolved thread sends no "reopened": its
 *       author already hears of the reply.
 *   R1  one comment that both mentions and replies to a person → only the mention.
 *   R2  never the actor (the notifier drops them too).
 *   R3  a deleted comment → `data.deleted = true` (and the quote blanked: a deleted comment never
 *       carries its words) on every row about it, and any of its emails still owed is not sent.
 *   R4  a thread opened (`/read`, 04/10/2026) → the reader's own unread C2 rows of that thread
 *       about a reply they saw (`data.n` at or below their mark) are read. Only `read_at` moves: an
 *       email still owed goes as planned. One way: reading the Inbox never marks a thread.
 *
 * Every recipient must hold a live seat on the site at the moment of the event: someone removed
 * from the team is not told about a thread they can no longer open.
 *
 * `quote` is the comment's words trimmed to `QUOTE_CHARS`; `page` is the path of the page the
 * comment sits on (`/`, `/about`), which a letter or the Inbox reads as "Home page" for `/`.
 */

/** How many characters of a comment a notification quotes. */
export const QUOTE_CHARS = 140

/** The most people one comment may name (a guard; the picker offers one seat at a time). */
export const MAX_MENTIONS = 50

/** C2 grouping: later reply emails of one thread inside this window go out as one. */
export const REPLY_WINDOW_MINUTES = 5

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The words a notification quotes: whitespace folded, cut at a word near `QUOTE_CHARS` with "…". */
export function quoteOf(text) {
  const flat = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (flat.length <= QUOTE_CHARS) return flat
  const cut = flat.slice(0, QUOTE_CHARS - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > QUOTE_CHARS * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/** The page a comment sits on, as a path (`/`, `/about`); `/` when the address cannot be read. */
export function pageOf(url) {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, '')
    return path === '' ? '/' : decodeURI(path)
  } catch {
    return '/'
  }
}

/**
 * The ids of `value` (what a client sent as `mentions`) that hold a live seat on this site, unique,
 * in the order sent. Anything that is not a list of ids reads as none.
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @returns {Promise<string[]>}
 */
export async function seatedMentions(db, siteKey, value) {
  if (!Array.isArray(value)) return []
  const wanted = [...new Set(value.filter((id) => typeof id === 'string' && UUID.test(id)))].slice(
    0,
    MAX_MENTIONS
  )
  if (wanted.length === 0) return []
  const seated = new Set(await liveSeats(db, siteKey, wanted))
  return wanted.filter((id) => seated.has(id))
}

/** Of `ids`, those holding a live (accepted, not revoked, not declined) seat on the site. */
async function liveSeats(db, siteKey, ids) {
  if (ids.length === 0) return []
  const { rows } = await db.query(
    `select account_id from seat
      where site_key = $1 and account_id = any($2::uuid[])
        and revoked_at is null and declined_at is null and accepted_at is not null`,
    [siteKey, ids]
  )
  return rows.map((r) => r.account_id)
}

/**
 * The root of the thread comment `id` sits in (itself when it is a root) — the thread a `comment.reply`
 * row names in `ref: thread:<id>`, and the one a read mark (`comments.js` `/read`) and a reply's reopen
 * act on, so all three agree on what one thread is at any depth.
 * @param {import('pg').Pool | import('pg').PoolClient} pool
 */
export async function rootOf(pool, siteKey, id) {
  const { rows } = await pool.query(
    `with recursive up (id, reply_to, depth) as (
       select id, reply_to, 0 from site_comment where site_key = $1 and id = $2
       union all
       select c.id, c.reply_to, up.depth + 1
         from site_comment c join up on c.id = up.reply_to
        where c.site_key = $1 and up.depth < 100
     )
     select r.id, r.n, r.author_account_id, r.text, r.url, r.deleted_at
       from up join site_comment r on r.id = up.id
      where up.reply_to is null
      limit 1`,
    [siteKey, id]
  )
  return rows[0] ?? null
}

/** Authors of the live comments of the thread under `rootId` (the root included), except `exceptId`. */
async function threadAuthors(pool, siteKey, rootId, exceptId) {
  const { rows } = await pool.query(
    `with recursive down (id) as (
       select id from site_comment where site_key = $1 and id = $2
       union
       select c.id from site_comment c join down on c.reply_to = down.id where c.site_key = $1
     )
     select distinct c.author_account_id
       from down join site_comment c on c.id = down.id
      where c.deleted_at is null and c.id <> $3`,
    [siteKey, rootId, exceptId]
  )
  return rows.map((r) => r.author_account_id)
}

/**
 * @param {{pool: import('pg').Pool, notify: Function, log?: Pick<Console, 'warn'>}} deps
 */
export function createCommentNotices({ pool, notify, log = console }) {
  const guard =
    (name, fn) =>
    async (...args) => {
      try {
        await fn(...args)
      } catch (error) {
        log.warn(`[comments] ${name} notification failed`, error?.message ?? error)
      }
    }

  /** C1 to `ids` about `comment` (a row of `site_comment`). */
  async function mention(siteKey, actor, comment, ids) {
    if (ids.length === 0) return
    await notify({
      recipients: ids,
      kind: 'comment.mention',
      siteKey,
      actor,
      data: { quote: quoteOf(comment.text), page: pageOf(comment.url), n: comment.n, commentId: comment.id }
    })
  }

  /**
   * A comment was created: C1 for the people it names, then C2 for the thread when it is a reply —
   * minus the people it named (R1).
   * @param {{siteKey: string, actor: string, comment: object, mentions: string[]}} event
   *   `comment`: the new row (`id, n, text, url, reply_to`); `mentions`: already seat-checked.
   */
  const created = guard('create', async ({ siteKey, actor, comment, mentions }) => {
    await mention(siteKey, actor, comment, mentions)
    if (!comment.reply_to) return
    const root = await rootOf(pool, siteKey, comment.id)
    if (!root) return
    const named = new Set(mentions)
    const candidates = (await threadAuthors(pool, siteKey, root.id, comment.id)).filter(
      (id) => id !== actor && !named.has(id)
    )
    const seated = await liveSeats(pool, siteKey, candidates)
    const data = (yours) => ({
      quote: quoteOf(comment.text),
      page: pageOf(comment.url),
      n: comment.n,
      commentId: comment.id,
      yours
    })
    const rootAuthor = root.deleted_at ? null : root.author_account_id
    // Two calls, so the root author's row says "replied to your comment" and everyone else's
    // "replied in a thread you're in".
    const others = seated.filter((id) => id !== rootAuthor)
    const event = {
      kind: 'comment.reply',
      siteKey,
      actor,
      ref: `thread:${root.id}`,
      group: { windowMinutes: REPLY_WINDOW_MINUTES }
    }
    if (rootAuthor && seated.includes(rootAuthor))
      await notify({ ...event, recipients: [rootAuthor], data: data(true) })
    if (others.length) await notify({ ...event, recipients: others, data: data(false) })
  })

  /** An edit named people the comment did not name before: C1 for them only. */
  const edited = guard('edit', async ({ siteKey, actor, comment, added }) => {
    await mention(siteKey, actor, comment, added)
  })

  /** C3: the door resolved or reopened the thread of `comment` (a root, or a tombstone root). */
  const statusChanged = guard('status', async ({ siteKey, actor, comment, resolved }) => {
    if (comment.reply_to || comment.deleted_at) return
    const [author] = await liveSeats(pool, siteKey, [comment.author_account_id])
    if (!author) return
    await notify({
      recipients: [author],
      kind: resolved ? 'comment.resolved' : 'comment.reopened',
      siteKey,
      actor,
      // The page, like C1/C2: the View comment link opens it (it opened `/` before 04/10).
      data: { quote: quoteOf(comment.text), page: pageOf(comment.url), n: comment.n, commentId: comment.id }
    })
  })

  /** R3: the comments `ids` were deleted. Their rows stay, marked, with no quote and no owed mail. */
  const deleted = guard('delete', async ({ siteKey, ids }) => {
    if (ids.length === 0) return
    await pool.query(
      `update notification
          set data = data || '{"deleted": true, "quote": ""}'::jsonb,
              mail_state = case when mail_state in ('pending', 'held') then 'none' else mail_state end,
              mail_due_at = case when mail_state in ('pending', 'held') then null else mail_due_at end
        where site_key = $1 and kind like 'comment.%' and data->>'commentId' = any($2::text[])`,
      [siteKey, ids]
    )
  })

  /**
   * R4: `accountId` opened the thread under `rootId` and saw it up to comment number `seenN`
   * (`comments.js` `/read`). Their unread `comment.*` rows of that thread (`ref: thread:<rootId>`, C2)
   * about a reply numbered at or below it are read; a reply written after what the tab drew stays
   * unread here as it does in the thread. Nobody else's rows, no other thread's, no mail state.
   */
  const opened = guard('open', async ({ siteKey, accountId, rootId, seenN }) => {
    await pool.query(
      `update notification set read_at = now()
        where account_id = $1 and site_key = $2 and ref = $3 and kind like 'comment.%' and read_at is null
          and coalesce((data->>'n')::numeric, 0) <= $4`,
      [accountId, siteKey, `thread:${rootId}`, seenN]
    )
  })

  return { created, edited, statusChanged, deleted, opened }
}
