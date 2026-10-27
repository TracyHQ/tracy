/**
 * Comments on a customer site's pages, kept on the server (`tasks/todo-comment-thread.md` § D,
 * contract H-S). The Browser tab (the better-sidebar fork) reads and writes them here instead of in
 * its tab `meta`, so everybody holding a seat on the site sees the same list, with real authors.
 *
 * Mounted from `sites/route.js` with one line, reusing that file's `requireGrant`, so the seat rule
 * is the one every other site door keeps: no session → 401 `NOT_SIGNED_IN`, no live seat on this
 * site → 403 `SEAT_NOT_AUTHORIZED`.
 *
 *   GET    /api/sites/:key/comments[?since=<ISO>]  → {comments, n_next, siteChangedAt}
 *   POST   /api/sites/:key/comments                → 201 {comment, parent?}
 *   PATCH  /api/sites/:key/comments/:id            → {comment}   (its words)
 *   POST   /api/sites/:key/comments/:id/resolve    → {comment}
 *   POST   /api/sites/:key/comments/:id/reopen     → {comment}
 *   DELETE /api/sites/:key/comments/:id            → {comment}   (soft)
 *   POST   /api/sites/:key/comments/clear          → {cleared: [id…]}   (soft) body {url} | {threads} | {ids} | {mine: true}
 *   GET    /api/sites/:key/comments/sent           → {sent: [{id, at}]}   ("Send all" leaves these unticked)
 *   GET    /api/sites/:key/comments/report?turn=<session>:<n> → {turn, comments: [{id, text, done}]}
 *   GET    /api/sites/:key/comments/reads          → {reads: [{id, seenN}]}   (the caller's own)
 *   GET    /api/sites/:key/comments/people         → {people: [{accountId, email, name, role, initial, color, avatarUrl, you}]}
 *   POST   /api/sites/:key/comments/:id/read       → {read: {id, seenN}}   body {seenN}
 *   POST   /api/sites/:key/comments/:id/unread     → {read: {id, seenN: null}}
 *   POST   /api/sites/:key/requests                → 201 {requests: [{id, n}…]}
 *   POST   /api/sites/:key/comments/attachments    → 201 {attachment}   (`./comment-attachments.js`)
 *   GET    /api/sites/:key/comments/attachments/:id → the file's bytes
 *
 * FILES (contract `tasks/evidence/comment-people/attachments-contract.md`): uploaded first, then
 * named by id in `attachments: [id…]` on POST (and PATCH, which replaces the list). Every row carries
 * `attachments: [{id, name, size, type, url}]`, empty for a deleted comment.
 *
 * COMMENTS ARE BETWEEN PEOPLE (stage 6, `tasks/todo-comment-people.md` rules 1–3, contract
 * `tasks/evidence/comment-people/contract.md` § H1). A comment is open (stored as status `pending`)
 * or resolved; the door no longer takes a status, a question or an answer from a chat turn. Rows a
 * stage-5 turn left with `sent`/`working`/`done`/… still read as stored, and still count as open.
 *
 * ⚠ ONE EXCEPTION SINCE 04/10/2026 — TRACY RESOLVES WHAT IT PROVABLY DID ([ADR 0025],
 * 03–04/10/2026; it reverses stage 6's "a chat turn never changes a comment's status"). Not the
 * turn's words and not a status the agent reports: only a write through the Apply door that cited the
 * request of the comment's LATEST send (`answered_at`, `markRequestsAnswered`), with no reply or edit
 * in its thread since that send. Such a comment is resolved with `resolvedBy` "Tracy" and
 * `resolvedByTracy: true` (`resolved_by_request`, `053-site-comment-auto-resolve.sql`). No stamp, no
 * resolve: a write outside the Apply door (an EmDash site's own tools, a look change by file) leaves
 * the comment open — "couldn't confirm", never "not done". A reply reopens it, as any resolved comment.
 * `/comments/sent` tells "Send all" which open comments were already sent and wait (unticked, "Sent
 * 23:43"); `/comments/report` tells the chat what one comment turn did. [ADR 0025]:
 * `docs/adr/0025-close-comment-on-write-evidence.md`.
 *
 * Who may do what: every seat reads, creates, replies, resolves, reopens and sends to Tracy any
 * comment; the AUTHOR alone edits or deletes their own words. Each row carries `can: {edit, delete}`
 * for the caller so the list never offers a button the door will refuse. `/clear {url}` soft-deletes
 * every comment of that page — open or resolved, with their replies, whoever wrote them (rule 12,
 * At 23:20: "Delete all" is a deliberate act);
 * `/clear {threads}` is the same Delete all narrowed to the threads the Comments tab shows (UI fine-tune
 * 30/09: any page, open or resolved, everyone's, replies with them — never a thread not named);
 * `/clear {ids}` and `/clear {}` are deletes, so they take the caller's own comments only.
 *
 * "SEND TO TRACY" CREATES NO COMMENT (rules 1 and 8). The fork calls `POST /requests` right before the
 * chat message goes: one internal `site_request` row per item, numbered from the sequence comments
 * use (`039-site-request.sql`), which is what an Apply call's `comment: n` then cites
 * (`comment-answer.js` `commentNumbers`). A comment some row points at reads `sentToTracy: true` — only "Send N"
 * counts with it. `siteChangedAt` is when the site last changed (`site.last_write_at`), for
 * everybody's Refresh button (rule 5).
 *
 * READ MARKS ARE ONE PERSON'S (`045-site-comment-read.sql`, Comments list redesign 01/10/2026): the
 * Comments tab opens a thread → `/read`, "Mark as unread" → `/unread`, and reads the caller's marks
 * back with `/reads`. Any seat may mark any comment it can see, a tombstone included; nothing else on
 * the comment changes (its `updated_at` stays, so a mark never brings it back in anyone's poll).
 * A mark is WHAT THE PERSON SAW (`061-site-comment-read-seen-n.sql`, 04/10/2026): `seenN`, the
 * largest number of the other people's messages in the thread as the tab drew it — never the server's
 * clock, which swallowed a reply written while the POST was on its way. A thread is unread for them
 * when someone else's live message in it has a larger number; the tab decides that from the mark and
 * the list. Reading a thread also reads the caller's Inbox rows about its replies up to that number.
 *
 * Each send carries `answeredAt`: when a site write through the Apply door cited that request's
 * number (`site_request.answered_at`, stamped by `markRequestsAnswered`) — the tab's "Done by Tracy".
 *
 * A reply reopens a resolved thread in the same write (S7): "whoever holds a seat may reply", and an
 * answer hidden under Resolved is an answer nobody reads (rule 3: there is no Reopen button, a reply
 * is how a thread comes back). What it reopens is the thread's root (`rootOf`), at any depth. The
 * create's answer carries the parent (`parent`) so the tab needs no second call.
 *
 * A comment its author removed (DELETE, `/clear`) while someone's reply still stands under it is a
 * TOMBSTONE (G2, TH-4 30/09): `deletedRoot: true`, `deletedAt` set, its words and files blanked, no
 * rights — but still the thread. It stays in the full list and in polls, keeps its `locate` (the pin),
 * its status (so it counts as open) and its sends; anyone may reply under it, resolve or reopen it
 * and send it to Tracy (`oneRow(…, {tombstone: true})`); nobody edits or deletes it again. When its
 * last live reply goes, its `updated_at` moves so a poll brings it back as gone (`deletedRoot:
 * false`). A deleted row never carries its words, in the full list or a poll.
 *
 * LIMITS: text up to `MAX_TEXT` (the list root's `limits.maxChars`; longer is `COMMENT_TOO_LONG`), and
 * a plain rate limit of `MAX_WRITES_PER_MINUTE` comments or replies per person (`COMMENT_RATE_LIMIT`,
 * 429). There is no cap on open comments: nothing "waits unsent" between people (TH-1).
 *
 * MENTIONS AND NOTIFICATIONS (spec #809 C1–C3): POST and PATCH take `mentions: [accountId…]`, the
 * people picked in the box's `@` picker (`/people` is that picker's roster: the live seats of the
 * site). The row keeps only the ids holding a live seat (`056-site-comment-mention.sql`) and carries
 * them as `mentions`. After each write commits, `./comment-notify.js` tells who should know: the
 * people named (an edit: only those it adds), the thread on a reply, the root author on resolve /
 * reopen; a delete marks the rows about that comment.
 *
 * Every refusal is `{code, next}` — `next` is one sentence saying what to do instead. These doors
 * are outside the `refusal-next` gate's scan (it reads the Apply door only), so the sentence is
 * written here beside each code rather than in `refusalNext`.
 */
import { json, normalizeSiteKey } from '../lib/http.js'
import { personFace } from '../lib/person-face.js'
import {
  ATTACHMENT_NEXT,
  ATTACHMENTS_SELECT,
  attachmentShape,
  checkAttachmentIds,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_COMMENT,
  mountCommentAttachments,
  setCommentAttachments
} from './comment-attachments.js'
import { createCommentNotices, rootOf, seatedMentions } from './comment-notify.js'
import { audit } from './store.js'
import { FAILED_END_REASONS, parseTurnId, STALE_AFTER_MS } from './turns.js'

/**
 * Comments and replies one person may write per minute, across every site (TH-1, stage 6). Only an
 * abuse guard: comments are between people, so nothing "waits unsent" and there is no cap on open
 * comments — the stage-5 cap of 12 counted replies and locked a long thread for everybody in it.
 */
export const MAX_WRITES_PER_MINUTE = 30
/** Sends to the agent a site accepts in a minute, all seats together. */
export const MAX_REQUESTS_PER_MINUTE = 20

/** Longest comment, reply or "Send to Tracy" text, in UTF-16 code units after trimming — what
 * JavaScript's `length` and a textarea's `maxlength` count. Read by clients as `limits.maxChars`. */
export const MAX_TEXT = 4000

/** Items in one "Send to Tracy" (`POST /requests`): a page's worth of chips in one chat message. */
export const MAX_REQUEST_ITEMS = 50

/** What a stage-5 chat turn used to report through `PATCH`; the door refuses each by name now. */
const RETIRED_FIELDS = ['status', 'requestId', 'callId', 'question', 'answer', 'sentAt']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_URL = 2048
const MAX_OBJECT_BYTES = 16_384
const MAX_TOKEN = 200

const NEXT = {
  COMMENT_NOT_FOUND:
    'Reload the comment list with GET /api/sites/:key/comments; the comment was deleted or belongs to another site.',
  COMMENT_NOT_YOURS:
    'Only the author may change or delete these words; anyone on the site may reply to, resolve or send the comment instead.',
  COMMENT_RATE_LIMIT: `You are writing comments very fast: at most ${MAX_WRITES_PER_MINUTE} a minute. Wait a moment and send it again; your text is kept.`,
  COMMENT_TOO_LONG: `This text is longer than ${MAX_TEXT} characters. Shorten it and send it again; nothing was saved, so keep your text.`,
  COMMENT_BAD_INPUT: 'Fix the field named in `field` and send the request again.'
}

function refuse(c, code, status, extra = {}) {
  return json(c, { code, next: NEXT[code] ?? ATTACHMENT_NEXT[code], ...extra }, status)
}

/** HTTP status of each refusal `checkAttachmentIds` can answer. */
const ATTACHMENT_STATUS = {
  COMMENT_BAD_INPUT: 400,
  ATTACHMENT_NOT_FOUND: 404,
  ATTACHMENT_IN_USE: 409,
  ATTACHMENT_LIMIT: 409
}

function refuseAttachments(c, { code, ...extra }) {
  return refuse(c, code, ATTACHMENT_STATUS[code], extra)
}

/** Thrown inside a comment write when an upload was taken by another comment after it was checked. */
class AttachmentTaken extends Error {}

const badInput = (c, field, reason) => refuse(c, 'COMMENT_BAD_INPUT', 400, { field, reason })

/** Longer than `MAX_TEXT`: its own code, so a client can say so in plain words and keep the text. */
const tooLong = (c, field, text) =>
  refuse(c, 'COMMENT_TOO_LONG', 400, { field, maxChars: MAX_TEXT, length: text.length })

/** A plain JSON object (or null) no bigger than the cap — the `element`/`locate` the tab sends. */
function objectOrNull(value) {
  if (value === null || value === undefined) return { ok: true, value: null }
  if (typeof value !== 'object' || Array.isArray(value))
    return { ok: false, reason: 'must be an object or null' }
  if (Buffer.byteLength(JSON.stringify(value)) > MAX_OBJECT_BYTES)
    return { ok: false, reason: `larger than ${MAX_OBJECT_BYTES} bytes` }
  return { ok: true, value }
}

function isoOrNull(value) {
  return value ? new Date(value).toISOString() : null
}

/** A person on the wire — `author`, `resolvedBy`, `sends[].author` — with their face
 * (`lib/person-face.js`): the letter and colour the Team roster and `/auth/me` give the same account. */
function person(accountId, email, name, avatarUrl = null) {
  if (!accountId) return null
  const who = { accountId, email }
  if (name) who.name = name
  const face = personFace({ id: accountId, email, display_name: name, avatar_url: avatarUrl })
  who.initial = face.initial
  who.color = face.color
  who.avatarUrl = face.avatarUrl
  return who
}

/** How many of a comment's sends to Tracy each row carries: the most recent, oldest first. */
export const MAX_SENDS_SHOWN = 20

/** SQL: a live reply stands under comment `c` — what keeps a deleted comment as a tombstone. */
const HAS_LIVE_REPLY = `exists (select 1 from site_comment lr
   where lr.site_key = c.site_key and lr.reply_to = c.id and lr.deleted_at is null)`

/** Row selection shared by every read: the comment, its author's and resolver's names, and who sent
 * it to Tracy when (`site_request` rows pointing at it — the thread's "sent to Tracy by …" lines). */
const SELECT = `
  select c.*, a.email as author_email, a.display_name as author_name, a.avatar_url as author_avatar_url,
         r.email as resolver_email, r.display_name as resolver_name, r.avatar_url as resolver_avatar_url,
         (select coalesce(jsonb_agg(jsonb_build_object(
                    'account_id', s.account_id, 'email', s.email, 'name', s.display_name, 'at', s.created_at,
                    'answered_at', s.answered_at, 'avatar_url', s.avatar_url)
                  order by s.created_at, s.n), '[]'::jsonb)
            from (select q.account_id, q.created_at, q.n, q.answered_at, qa.email, qa.display_name, qa.avatar_url
                    from site_request q join account qa on qa.id = q.account_id
                   where q.comment_id = c.id
                   order by q.created_at desc, q.n desc
                   limit ${MAX_SENDS_SHOWN}) s) as sends,
         ${ATTACHMENTS_SELECT},
         (c.deleted_at is not null and ${HAS_LIVE_REPLY}) as deleted_root
    from site_comment c
    join account a on a.id = c.author_account_id
    left join account r on r.id = c.resolved_by`

/** `sends` as the list returns them: who (the same shape as `author`), when, and when a write of
 * Tracy's cited it (`answeredAt`, null until one did). */
function sendsOf(rows) {
  return (rows ?? []).map((s) => ({
    author: person(s.account_id, s.email, s.name, s.avatar_url),
    at: isoOrNull(s.at),
    answeredAt: isoOrNull(s.answered_at)
  }))
}

/**
 * SQL: comment `c` got new words after send `s` — a live message of its thread (the comment or a reply
 * at any depth) written or edited after the send. What keeps an older send's stamp from closing it.
 */
const NEW_WORDS_AFTER_SEND = `exists (
   with recursive thread (id) as (
     select c.id
     union
     select x.id from site_comment x join thread on x.reply_to = thread.id where x.site_key = c.site_key)
   select 1 from site_comment m join thread on thread.id = m.id
    where m.deleted_at is null and (m.created_at > s.created_at or m.edited_at > s.created_at))`

/** SQL: send `s` is not the latest send of its comment. */
const LATER_SEND = `exists (
   select 1 from site_request later
    where later.comment_id = s.comment_id and (later.created_at, later.n) > (s.created_at, s.n))`

/**
 * A site write citing comment numbers went through (`sites/route.js` `recordApply`): stamp
 * `answered_at` on those of the caller's own requests on this site that are still inside the comment
 * answer window (`comment-answer.js` `COMMENT_ANSWER_WINDOW_MS`) — and
 * move the `updated_at` of the comments they were sent from, so a `?since=` poll brings back their
 * new "Done by Tracy". A number that names nothing of the caller's stamps nothing.
 *
 * THEN TRACY RESOLVES WHAT IT DID (ADR 0025, 03–04/10/2026): a comment (a thread's first message)
 * whose request was just stamped is resolved — `resolved_by_request` names the send, `resolved_by`
 * stays null — when that request is the comment's LATEST send and no live message of its thread was
 * written or edited after it. A stamp of an older send never closes a comment someone added to since:
 * that comment waits for its next send. A reply reopens it as it reopens any resolved comment.
 * @param {import('pg').Pool} pool
 * @param {{ siteKey: string, accountId: string, ns: number[], windowMs: number, actor?: string | null }} write
 *   `actor` — whose write it was, for the audit line of each resolve.
 * @returns {Promise<number[]>} the request numbers stamped now (first answer only).
 */
export async function markRequestsAnswered(pool, { siteKey, accountId, ns, windowMs, actor = null }) {
  if (ns.length === 0) return []
  const { rows } = await pool.query(
    `with hit as (
       update site_request set answered_at = now()
        where site_key = $1 and account_id = $2 and n = any($3::int[]) and answered_at is null
          and created_at >= now() - ($4::int * interval '1 millisecond')
        returning id, n, comment_id),
     touched as (
       update site_comment set updated_at = now()
        where site_key = $1 and id in (select comment_id from hit where comment_id is not null)
        returning id)
     select id, n from hit order by n`,
    [siteKey, accountId, ns, windowMs]
  )
  if (rows.length === 0) return []
  const { rows: resolved } = await pool.query(
    `update site_comment c
        set resolved_from = c.status, status = 'resolved', resolved_at = now(), resolved_by = null,
            resolved_by_request = s.id, updated_at = now()
       from site_request s
      where s.id = any($2::uuid[]) and c.site_key = $1 and c.id = s.comment_id
        and c.reply_to is null and c.status <> 'resolved'
        and not ${LATER_SEND}
        and not ${NEW_WORDS_AFTER_SEND}
     returning c.id, s.n`,
    [siteKey, rows.map((r) => r.id)]
  )
  for (const { id, n } of resolved)
    await audit(pool, { actor, action: 'comment.resolve', siteKey, detail: { id, by: 'tracy', request: n } })
  return rows.map((r) => r.n)
}

/**
 * SQL: send `r` went into a chat turn that FAILED — the turn its message opened (`site_turn`, joined by
 * session and number like the Site changes tab, `047-site-turn-comment.sql`) went stale (its dsh died:
 * `stale`, or still `open` past {@link STALE_AFTER_MS}), was stopped mid-answer (`reply_state`
 * `interrupted`), or ENDED IN FAILURE as the host read its `turn/end` (`end_reason` in
 * {@link FAILED_END_REASONS}: a model error such as "DeepSeek Messages transport failed", a cancel, a
 * block — migration 054, ADR 0025 § Failed turns). A send whose turn is not recorded counts as sent.
 */
const SEND_FAILED = `exists (
   select 1 from site_turn t
    where t.site_key = r.site_key and t.session_id = r.session_id and r.n = any(t.comment_ns)
      and (t.state = 'stale'
           or (t.state = 'open' and t.opened_at < now() - (${STALE_AFTER_MS} * interval '1 millisecond'))
           or t.reply_state = 'interrupted'
           or t.end_reason = any('{${FAILED_END_REASONS.join(',')}}'::text[])))`

/**
 * The open comments "Send all" leaves unticked (ADR 0025, 03–04/10/2026): each thread's first
 * message whose latest send that counts (one whose turn did not fail, {@link SEND_FAILED}) has no new
 * words after it — no reply, no edit ({@link NEW_WORDS_AFTER_SEND}). `at` is that send's time, the
 * row's "Sent 23:43". A comment never sent, or written to since, is not listed: it is ticked.
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @returns {Promise<{ id: string, at: string }[]>} by comment number.
 */
export async function sentAndWaiting(pool, siteKey) {
  const { rows } = await pool.query(
    `with last as (
       select distinct on (r.comment_id) r.comment_id, r.created_at, r.n
         from site_request r
        where r.site_key = $1 and r.comment_id is not null and not ${SEND_FAILED}
        order by r.comment_id, r.created_at desc, r.n desc)
     select c.id, s.created_at as at
       from site_comment c join last s on s.comment_id = c.id
      where c.site_key = $1 and c.reply_to is null and c.status <> 'resolved'
        and (c.deleted_at is null or ${HAS_LIVE_REPLY})
        and not ${NEW_WORDS_AFTER_SEND}
      order by c.n`,
    [siteKey]
  )
  return rows.map((row) => ({ id: row.id, at: isoOrNull(row.at) }))
}

/**
 * What one chat turn sent from comments did, comment by comment (ADR 0025 — the report under the turn):
 * the comments its sends came from — the requests of that conversation whose numbers the turn carries
 * (`site_turn.comment_ns`, the Site changes tab's join) — in send order, each `done` when a write
 * through the Apply door cited one of its requests in this turn (`answered_at`), else not confirmed.
 * Never "not done": a write that does not pass the Apply door (an EmDash site's own tools, a look
 * change by file) stamps nothing. `text` is '' for a comment deleted since. An unknown turn, a turn
 * typed in the chat, or one sent from no saved comment lists nothing.
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @param {string} turnId
 * @returns {Promise<{ id: string, text: string, done: boolean }[]>}
 */
export async function turnReport(pool, siteKey, turnId) {
  const { rows } = await pool.query(
    `select c.id, case when c.deleted_at is null then c.text else '' end as text,
            bool_or(r.answered_at is not null) as done, min(r.n) as first
       from site_turn t
       join site_request r on r.site_key = t.site_key and r.session_id = t.session_id and r.n = any(t.comment_ns)
       join site_comment c on c.id = r.comment_id
      where t.turn_id = $2 and t.site_key = $1
      group by c.id
      order by first`,
    [siteKey, turnId]
  )
  return rows.map((row) => ({ id: row.id, text: row.text, done: row.done === true }))
}

/** Who resolved a comment Tracy resolved (`resolved_by_request`): the shape `author` has, no account. */
export const TRACY_RESOLVER = Object.freeze({
  accountId: '',
  email: '',
  name: 'Tracy',
  initial: 'T',
  tracy: true
})

/** The wire shape of one row, with what THIS caller may do to it. */
function shape(row, caller) {
  const mine = row.author_account_id === caller.accountId
  const live = !row.deleted_at
  // Deleted by its author while someone's reply still stands under it (TH-4): a tombstone. Its words
  // and files are gone, but it is still the thread — where it sits (its pin), its status, its sends.
  const tombstone = !live && Boolean(row.deleted_root)
  return {
    id: row.id,
    n: row.n,
    url: row.url,
    element: row.element,
    // Its author removed it: what it said goes with it (G2); who and when stay, and a tombstone keeps
    // where it was so its thread keeps its pin.
    locate: live || tombstone ? row.locate : null,
    text: live ? row.text : '',
    status: row.status,
    requestId: row.request_id,
    callId: row.call_id,
    question: live ? row.question : null,
    answer: live ? row.answer : null,
    replyTo: row.reply_to,
    createdAt: isoOrNull(row.created_at),
    updatedAt: isoOrNull(row.updated_at),
    sentAt: isoOrNull(row.sent_at),
    resolvedAt: isoOrNull(row.resolved_at),
    // Tracy resolved it (`resolved_by_request`, ADR 0025): named "Tracy", with no account, so the
    // thread card and the list say "Tracy marked this done" rather than a person's name.
    resolvedBy: row.resolved_by_request
      ? { ...TRACY_RESOLVER }
      : person(row.resolved_by, row.resolver_email, row.resolver_name, row.resolver_avatar_url),
    resolvedByTracy: Boolean(row.resolved_by_request),
    deletedAt: isoOrNull(row.deleted_at),
    deletedRoot: tombstone,
    author: person(row.author_account_id, row.author_email, row.author_name, row.author_avatar_url),
    // Each send to Tracy (`POST /requests` naming this comment), oldest first, the last
    // MAX_SENDS_SHOWN: the thread's "sent to Tracy by <name> (<ago>)" lines. `sentToTracy` is what
    // "Send N" counts with (the open comments never sent).
    sends: sendsOf(row.sends),
    sentToTracy: (row.sends?.length ?? 0) > 0,
    // Its files, in the order attached; a deleted comment's go with its words (contract § D).
    attachments: live ? (row.attachments ?? []).map((f) => attachmentShape(row.site_key, f)) : [],
    can: { edit: live && mine, delete: live && mine },
    // The people picked in the `@` picker, live seats when written (spec #809 C1); none once deleted.
    mentions: live ? (row.mentions ?? []) : []
  }
}

/**
 * When the site itself last changed: `site.last_write_at` (`040-site-last-write.sql`), stamped with
 * the audit row of each successful write — an Apply call that changes the site (`recordApply`,
 * `sites/route.js`) or a `tracy_emdash` write reported to `POST /api/sites/:key/changed`. Reads,
 * refusals and comment activity do not move it. Null when nothing was written since the column
 * exists.
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 */
async function siteChangedAt(pool, siteKey) {
  const { rows } = await pool.query('select last_write_at from site where site_key = $1', [siteKey])
  return isoOrNull(rows[0]?.last_write_at)
}

/**
 * The live comment `id` of this site, or null. `tombstone: true` also finds a deleted comment a live
 * reply still stands under (TH-4) — for what acts on the THREAD (reply, resolve, reopen, send), never
 * for what acts on its words (edit, delete).
 */
async function oneRow(pool, siteKey, id, { tombstone = false } = {}) {
  if (!UUID.test(id)) return null
  const { rows } = await pool.query(
    `${SELECT} where c.site_key = $1 and c.id = $2
       and (c.deleted_at is null ${tombstone ? `or ${HAS_LIVE_REPLY}` : ''})`,
    [siteKey, id]
  )
  return rows[0] ?? null
}

/**
 * After `ids` were deleted: a deleted parent whose last live reply this was stops being a tombstone,
 * so its `updated_at` moves and a `?since=` poll brings it back as gone (`deletedRoot: false`).
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
async function touchParents(db, siteKey, ids) {
  await db.query(
    `update site_comment p set updated_at = now()
      where p.site_key = $1 and p.deleted_at is not null
        and p.id in (select reply_to from site_comment
                      where site_key = $1 and id = any($2::uuid[]) and reply_to is not null)`,
    [siteKey, ids]
  )
}

/**
 * Soft-delete `seeds` and, as `descend` says, the replies under them at ANY depth: `all` follows
 * every seed's subtree, `roots` only a seed that is a thread root, `none` none. The walk goes through
 * rows already deleted (a tombstone, or a middle reply its author removed), so nothing live under
 * them is left orphaned (#674). Only rows still live are updated; each comes back once, in thread
 * order, with the seeds it was reached from.
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @returns {Promise<{id: string, seeds: string[]}[]>}
 */
async function clearSubtrees(db, siteKey, seeds, descend) {
  const { rows } = await db.query(
    `with recursive tree (id, seed, expand) as (
       select id, id, case $3 when 'all' then true when 'roots' then reply_to is null else false end
         from site_comment where site_key = $1 and id = any($2::uuid[])
       union
       select c.id, t.seed, true
         from site_comment c join tree t on c.reply_to = t.id
        where c.site_key = $1 and t.expand
     ),
     gone as (
       update site_comment s set deleted_at = now(), updated_at = now()
        where s.site_key = $1 and s.deleted_at is null and s.id in (select id from tree)
        returning s.id, s.n
     )
     select g.id, array_agg(distinct t.seed::text) as seeds
       from gone g join tree t on t.id = g.id
      group by g.id, g.n
      order by g.n`,
    [siteKey, seeds, descend]
  )
  return rows
}

/**
 * @param {import('hono').Hono} app
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool
 * @param {(c: any, siteKey: string) => Promise<any>} deps.requireGrant - `sites/route.js`'s own.
 * @param {object | null} [deps.store] - `config.artifactStore`; null turns attachments off.
 * @param {typeof fetch} [deps.fetchImpl]
 * @param {() => number} [deps.now]
 * @param {Function} [deps.notify] - the notifier (`notifications/notify.js`), bound in by `app.js`.
 */
export function mountSiteComments(
  app,
  { pool, requireGrant, store = null, fetchImpl = fetch, now = Date.now, notify = async () => [] }
) {
  mountCommentAttachments(app, { pool, requireGrant, store, fetchImpl, now })
  const notices = createCommentNotices({ pool, notify })

  /** The seat gate, then who the caller is for `can` and the author checks. */
  async function caller(c) {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return { error: auth.error }
    c.header('cache-control', 'no-store')
    return {
      siteKey,
      email: auth.email,
      who: { accountId: auth.account.id }
    }
  }

  /** The caller, and the live comment named by `:id` on this site — or the refusal to return. */
  async function target(c, { tombstone = false } = {}) {
    const me = await caller(c)
    if (me.error) return me
    const row = await oneRow(pool, me.siteKey, c.req.param('id'), { tombstone })
    if (!row) return { error: refuse(c, 'COMMENT_NOT_FOUND', 404) }
    return { ...me, row }
  }

  const mine = (me, row) => row.author_account_id === me.who.accountId

  app.get('/api/sites/:key/comments', async (c) => {
    const me = await caller(c)
    if (me.error) return me.error
    const sinceRaw = c.req.query('since')
    let since = null
    if (sinceRaw) {
      since = new Date(sinceRaw)
      if (Number.isNaN(since.getTime())) return badInput(c, 'since', 'not a date')
    }
    // Without `since`: the live list, plus every deleted comment a live reply still stands under (G2,
    // its placeholder). With it: everything touched at or after `since`, deleted rows included (a
    // poll must learn that a comment went away). Inclusive on purpose — a row stamped in the same
    // millisecond as the last one seen comes back twice rather than never; the tab merges by id.
    const { rows } = since
      ? await pool.query(`${SELECT} where c.site_key = $1 and c.updated_at >= $2 order by c.n`, [
          me.siteKey,
          since
        ])
      : await pool.query(
          `${SELECT} where c.site_key = $1 and (c.deleted_at is null or exists (
             select 1 from site_comment r
              where r.site_key = c.site_key and r.reply_to = c.id and r.deleted_at is null))
            order by c.n`,
          [me.siteKey]
        )
    const counter = await pool.query('select last_n from site_comment_counter where site_key = $1', [
      me.siteKey
    ])
    return json(c, {
      comments: rows.map((row) => shape(row, me.who)),
      n_next: (counter.rows[0]?.last_n ?? 0) + 1,
      siteChangedAt: await siteChangedAt(pool, me.siteKey),
      // Whether Add comment / Reply may offer a file, and within what (contract § C).
      attachments: {
        enabled: Boolean(store),
        maxBytes: MAX_ATTACHMENT_BYTES,
        maxFiles: MAX_ATTACHMENTS_PER_COMMENT
      },
      // How long a comment, reply or "Send to Tracy" text may be, so the box can count and keep the
      // text instead of losing it to a refusal (TH-2, `COMMENT_TOO_LONG`).
      limits: { maxChars: MAX_TEXT }
    })
  })

  app.post('/api/sites/:key/comments/clear', async (c) => {
    const me = await caller(c)
    if (me.error) return me.error
    // 🔒 THE BODY NAMES WHAT TO DELETE, OR NOTHING IS DELETED (21/10/2026). A body that was
    // not a JSON object, or named nothing, used to read as `{}` and delete every comment the caller
    // ever wrote on the site (QA run 20/10/2026). "All of mine" is still there, asked for by name:
    // `{mine: true}`.
    const body = await c.req.json().catch(() => null)
    if (body === null || typeof body !== 'object' || Array.isArray(body))
      return badInput(c, 'body', 'must be a JSON object')
    const ids = body.ids
    const page = body.url
    const threads = body.threads
    const all = body.mine
    const named = [ids, page, threads, all].filter((v) => v !== undefined).length
    if (named !== 1) return badInput(c, 'body', 'send one of url, threads, ids or mine')
    if (all !== undefined && all !== true) return badInput(c, 'mine', 'must be true')
    if (ids !== undefined && (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')))
      return badInput(c, 'ids', 'must be an array of comment ids')
    if (threads !== undefined && (!Array.isArray(threads) || !threads.every((id) => typeof id === 'string')))
      return badInput(c, 'threads', 'must be an array of comment ids')
    if (page !== undefined && (typeof page !== 'string' || !page || page.length > MAX_URL))
      return badInput(c, 'url', `a page address up to ${MAX_URL} characters`)
    /** `{threads}` only: which named threads went, and which were already gone (INTH-1). */
    let outcome = null
    /** Seeds for `clearSubtrees`, and how far below them it goes. */
    let seeds
    let descend = 'all'
    if (page !== undefined) {
      // Delete all on a page (rule 12, 23:20): EVERY comment there, open or resolved, whoever
      // wrote it, with every reply under each at any depth — a reply goes with its thread even if it
      // names another address (#674). Rows already deleted are not counted again.
      seeds = (
        await pool.query(`select id from site_comment where site_key = $1 and url = $2`, [me.siteKey, page])
      ).rows.map((r) => r.id)
    } else if (threads !== undefined) {
      // Delete all of exactly what the Comments tab shows (UI fine-tune 30/09): the named threads on any
      // page, open or resolved, whoever wrote them, with every reply under each at any depth — the same
      // right as `{url}` (any seat may clear a page), narrowed to the threads named, so a resolved
      // comment the tab hides is never taken with them. Every thread it can take goes (INTH-1, e2e v7):
      // a tombstone (its root deleted, replies standing) goes with the replies left under it, and a
      // thread already gone — deleted by someone else during the tab's Undo window, or never on this
      // site — is skipped and named in `gone`, never a reason to delete nothing. Only the seat gate
      // above refuses.
      seeds = [...new Set(threads.filter((id) => UUID.test(id)))]
    } else if (all === true) {
      // `{mine: true}`: a delete, so the caller's own comments only (S11), never the replies under them.
      seeds = (
        await pool.query(
          `select id from site_comment
            where site_key = $1 and deleted_at is null and author_account_id = $2`,
          [me.siteKey, me.who.accountId]
        )
      ).rows.map((r) => r.id)
      descend = 'none'
    } else {
      const wanted = ids.filter((id) => UUID.test(id))
      const { rows } = await pool.query(
        `select id, author_account_id from site_comment
          where site_key = $1 and deleted_at is null and id = any($2::uuid[])`,
        [me.siteKey, wanted]
      )
      const found = new Set(rows.map((r) => r.id))
      const missing = ids.filter((id) => !found.has(id))
      if (missing.length) return refuse(c, 'COMMENT_NOT_FOUND', 404, { ids: missing })
      // All or nothing: a partial clear would leave the list in a state nobody asked for. Named
      // comments are deleted, so each must be the caller's own; a named thread root takes its whole
      // thread with it, the way `{threads}` does, while a named reply goes alone.
      const foreign = rows.filter((r) => !mine(me, r)).map((r) => r.id)
      if (foreign.length) return refuse(c, 'COMMENT_NOT_YOURS', 403, { ids: foreign })
      seeds = [...found]
      descend = 'roots'
    }
    const gone = seeds.length ? await clearSubtrees(pool, me.siteKey, seeds, descend) : []
    const cleared = gone.map((r) => r.id)
    if (threads !== undefined) {
      const hit = new Set(gone.flatMap((r) => r.seeds))
      const listed = [...new Set(threads)]
      outcome = { deleted: listed.filter((id) => hit.has(id)), gone: listed.filter((id) => !hit.has(id)) }
    }
    if (cleared.length) {
      await touchParents(pool, me.siteKey, cleared)
      await audit(pool, {
        actor: me.email,
        action: 'comment.clear',
        siteKey: me.siteKey,
        detail: {
          ...(page !== undefined ? { url: page } : {}),
          ...(threads !== undefined ? { threads } : {}),
          ...(outcome !== null && outcome.gone.length ? { gone: outcome.gone } : {}),
          ids: cleared
        }
      })
      await notices.deleted({ siteKey: me.siteKey, ids: cleared })
    }
    return json(c, outcome === null ? { cleared } : { cleared, ...outcome })
  })

  app.post('/api/sites/:key/requests', async (c) => {
    const me = await caller(c)
    if (me.error) return me.error
    const body = await c.req.json().catch(() => null)
    if (!body || typeof body !== 'object') return badInput(c, 'body', 'must be a JSON object')
    for (const field of ['sessionId', 'requestId']) {
      const value = body[field]
      if (typeof value !== 'string' || !value || value.length > MAX_TOKEN)
        return badInput(c, field, `a string of 1 to ${MAX_TOKEN} characters`)
    }
    // 🔒 A request row is paid for by a real send; without a budget a seat could write them by the
    // thousand (each one also opens the accountability window a comment answer reads).
    const { rows: sentLately } = await pool.query(
      `select count(*)::int as n from site_request
        where site_key = $1 and created_at > now() - interval '60 seconds'`,
      [me.siteKey]
    )
    if ((sentLately[0]?.n ?? 0) >= MAX_REQUESTS_PER_MINUTE) {
      c.header('retry-after', '60')
      return refuse(c, 'COMMENT_RATE_LIMIT', 429, { limit: MAX_REQUESTS_PER_MINUTE, retryAfter: 60 })
    }
    const items = body.items
    if (!Array.isArray(items) || items.length < 1 || items.length > MAX_REQUEST_ITEMS)
      return badInput(c, 'items', `an array of 1 to ${MAX_REQUEST_ITEMS} items`)
    const checked = []
    for (const [i, item] of items.entries()) {
      const at = `items[${i}]`
      if (!item || typeof item !== 'object' || Array.isArray(item))
        return badInput(c, at, 'must be an object')
      if (typeof item.url !== 'string' || !item.url || item.url.length > MAX_URL)
        return badInput(c, `${at}.url`, `a page address up to ${MAX_URL} characters`)
      const element = objectOrNull(item.element)
      if (!element.ok) return badInput(c, `${at}.element`, element.reason)
      let commentId = null
      if (item.commentId !== undefined && item.commentId !== null) {
        if (typeof item.commentId !== 'string') return badInput(c, `${at}.commentId`, 'must be a comment id')
        const row = await oneRow(pool, me.siteKey, item.commentId, { tombstone: true })
        if (!row) return refuse(c, 'COMMENT_NOT_FOUND', 404, { field: `${at}.commentId` })
        commentId = row.id
      }
      // Sent from a comment or thread with no new words, the item carries none of its own: the chat
      // message quotes the thread.
      const text = typeof item.text === 'string' ? item.text.trim() : null
      if (text !== null && text.length > MAX_TEXT) return tooLong(c, `${at}.text`, text)
      if (text === null || (!text && !commentId))
        return badInput(c, `${at}.text`, `1 to ${MAX_TEXT} characters (may be empty with a commentId)`)
      checked.push({ url: item.url, element: element.value, text, commentId })
    }

    const client = await pool.connect()
    const requests = []
    try {
      await client.query('begin')
      // One bump for the whole send, under the counter row's lock: the numbers are consecutive and
      // no comment created meanwhile can take one of them.
      const { rows: counter } = await client.query(
        `insert into site_comment_counter (site_key, last_n) values ($1, $2)
         on conflict (site_key) do update set last_n = site_comment_counter.last_n + $2
         returning last_n`,
        [me.siteKey, checked.length]
      )
      const first = counter[0].last_n - checked.length + 1
      for (const [i, item] of checked.entries()) {
        const { rows } = await client.query(
          `insert into site_request (site_key, n, account_id, session_id, request_id, url, element, text, comment_id)
           values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9) returning id, n`,
          [
            me.siteKey,
            first + i,
            me.who.accountId,
            body.sessionId,
            body.requestId,
            item.url,
            item.element === null ? null : JSON.stringify(item.element),
            item.text,
            item.commentId
          ]
        )
        requests.push({ id: rows[0].id, n: rows[0].n })
      }
      // A comment sent from is a changed row for every reader: its `sends` / `sentToTracy` moved, and
      // a `?since=` poll must bring it back, or another seat's "Send N" counts it again.
      const sentFrom = [...new Set(checked.map((item) => item.commentId).filter(Boolean))]
      if (sentFrom.length)
        await client.query(
          `update site_comment set updated_at = now() where site_key = $1 and id = any($2::uuid[])`,
          [me.siteKey, sentFrom]
        )
      await client.query('commit')
    } catch (error) {
      await client.query('rollback').catch(() => {})
      throw error
    } finally {
      client.release()
    }
    return json(c, { requests }, 201)
  })

  app.post('/api/sites/:key/comments', async (c) => {
    const me = await caller(c)
    if (me.error) return me.error
    const body = await c.req.json().catch(() => null)
    if (!body || typeof body !== 'object') return badInput(c, 'body', 'must be a JSON object')
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (!text) return badInput(c, 'text', `1 to ${MAX_TEXT} characters`)
    if (text.length > MAX_TEXT) return tooLong(c, 'text', text)
    if (typeof body.url !== 'string' || !body.url || body.url.length > MAX_URL)
      return badInput(c, 'url', `a page address up to ${MAX_URL} characters`)
    const element = objectOrNull(body.element)
    if (!element.ok) return badInput(c, 'element', element.reason)
    const locate = objectOrNull(body.locate)
    if (!locate.ok) return badInput(c, 'locate', locate.reason)
    let replyTo = null
    /** The root of the thread the reply goes into (`rootOf`): what it reopens, at any depth. */
    let threadRoot = null
    if (body.replyTo !== undefined && body.replyTo !== null) {
      if (typeof body.replyTo !== 'string') return badInput(c, 'replyTo', 'must be a comment id')
      const parent = await oneRow(pool, me.siteKey, body.replyTo, { tombstone: true })
      if (!parent) return refuse(c, 'COMMENT_NOT_FOUND', 404, { field: 'replyTo' })
      replyTo = parent.id
      threadRoot = (await rootOf(pool, me.siteKey, parent.id))?.id ?? parent.id
    }
    let files = []
    if (body.attachments !== undefined) {
      const checked = await checkAttachmentIds(pool, me.siteKey, body.attachments)
      if (checked.refusal) return refuseAttachments(c, checked.refusal)
      files = checked.ids
    }
    let reopened = false
    if (body.mentions !== undefined && !Array.isArray(body.mentions))
      return badInput(c, 'mentions', 'must be an array of account ids')
    const mentions = await seatedMentions(pool, me.siteKey, body.mentions)

    const client = await pool.connect()
    let id
    try {
      await client.query('begin')
      // The rate limit counts this author's writes on EVERY site, so the count and the insert are
      // serialized per author, not per site (#676): without it, creates racing on two sites each read
      // the same count and all pass. Taken before the counter row, always in this order, and held
      // until commit or rollback.
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [`comment-writes:${me.who.accountId}`])
      // The counter row hands out this site's next number; rolled back with a refusal.
      const { rows: counter } = await client.query(
        `insert into site_comment_counter (site_key, last_n) values ($1, 1)
         on conflict (site_key) do update set last_n = site_comment_counter.last_n + 1
         returning last_n`,
        [me.siteKey]
      )
      // Writes by this author in the last minute, on any site, deleted ones included (a write is a
      // write). The wait ends when the oldest of them turns 60 s.
      const { rows: recent } = await client.query(
        `select count(*)::int as n,
                ceil(extract(epoch from (min(created_at) + interval '60 seconds' - now())))::int as wait
           from site_comment
          where author_account_id = $1 and created_at > now() - interval '60 seconds'`,
        [me.who.accountId]
      )
      if (recent[0].n >= MAX_WRITES_PER_MINUTE) {
        // Rolling back returns the number too: nothing was handed out.
        await client.query('rollback')
        const retryAfter = Math.min(60, Math.max(1, recent[0].wait ?? 60))
        c.header('retry-after', String(retryAfter))
        return refuse(c, 'COMMENT_RATE_LIMIT', 429, { limit: MAX_WRITES_PER_MINUTE, retryAfter })
      }
      const { rows } = await client.query(
        `insert into site_comment (site_key, n, author_account_id, url, element, locate, text, reply_to, mentions)
         values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9::uuid[]) returning id`,
        [
          me.siteKey,
          counter[0].last_n,
          me.who.accountId,
          body.url,
          element.value === null ? null : JSON.stringify(element.value),
          locate.value === null ? null : JSON.stringify(locate.value),
          text,
          replyTo,
          mentions
        ]
      )
      if (files.length && !(await setCommentAttachments(client, me.siteKey, rows[0].id, files)))
        throw new AttachmentTaken()
      if (threadRoot) {
        // A reply reopens its resolved thread in this same transaction — the reopen door's update,
        // without its role check (S7): the reply is not kept without it, nor it without the reply.
        // The thread is its root's, so a reply to a reply reopens the root (the parent, for a reply
        // to the root — the only kind the Browser tab writes).
        const { rowCount } = await client.query(
          `update site_comment
              set status = coalesce(resolved_from, 'pending'), resolved_from = null, resolved_at = null,
                  resolved_by = null, resolved_by_request = null, updated_at = now()
            where site_key = $1 and id = $2 and status = 'resolved'`,
          [me.siteKey, threadRoot]
        )
        reopened = rowCount > 0
      }
      await client.query('commit')
      id = rows[0].id
    } catch (error) {
      await client.query('rollback').catch(() => {})
      if (error instanceof AttachmentTaken)
        return refuseAttachments(c, { code: 'ATTACHMENT_IN_USE', ids: files })
      throw error
    } finally {
      client.release()
    }
    const row = await oneRow(pool, me.siteKey, id)
    await audit(pool, {
      actor: me.email,
      action: 'comment.create',
      siteKey: me.siteKey,
      detail: {
        id,
        n: row.n,
        ...(replyTo ? { replyTo } : {}),
        ...(files.length ? { attachments: files } : {})
      }
    })
    await notices.created({ siteKey: me.siteKey, actor: me.who.accountId, comment: row, mentions })
    if (!replyTo) return json(c, { comment: shape(row, me.who) }, 201)
    if (reopened)
      await audit(pool, {
        actor: me.email,
        action: 'comment.reopen',
        siteKey: me.siteKey,
        detail: { id: threadRoot, by: 'reply', reply: id }
      })
    // The parent as it stands now (reopened or not), so the tab refreshes it from this answer.
    const parent = await oneRow(pool, me.siteKey, replyTo, { tombstone: true })
    return json(c, { comment: shape(row, me.who), ...(parent ? { parent: shape(parent, me.who) } : {}) }, 201)
  })

  app.patch('/api/sites/:key/comments/:id', async (c) => {
    const t = await target(c)
    if (t.error) return t.error
    if (!mine(t, t.row)) return refuse(c, 'COMMENT_NOT_YOURS', 403)
    const body = await c.req.json().catch(() => null)
    if (!body || typeof body !== 'object') return badInput(c, 'body', 'must be a JSON object')

    // Stage 6: a comment keeps no status, so what a chat turn used to report here is refused by name.
    const retired = RETIRED_FIELDS.find((field) => body[field] !== undefined)
    if (retired) return badInput(c, retired, 'a comment keeps no status; only its text changes')
    if (body.text === undefined && body.attachments === undefined && body.mentions === undefined)
      return badInput(c, 'body', 'nothing to change')
    if (body.mentions !== undefined && !Array.isArray(body.mentions))
      return badInput(c, 'mentions', 'must be an array of account ids')
    // The whole list when sent (the people the words still name); kept as stored when not.
    const mentions = body.mentions === undefined ? null : await seatedMentions(pool, t.siteKey, body.mentions)
    let text = null
    if (body.text !== undefined) {
      text = typeof body.text === 'string' ? body.text.trim() : ''
      if (!text) return badInput(c, 'text', `1 to ${MAX_TEXT} characters`)
      if (text.length > MAX_TEXT) return tooLong(c, 'text', text)
    }
    let files = null
    if (body.attachments !== undefined) {
      const checked = await checkAttachmentIds(pool, t.siteKey, body.attachments, t.row.id)
      if (checked.refusal) return refuseAttachments(c, checked.refusal)
      files = checked.ids
    }
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query(
        `update site_comment set text = coalesce($3, text), mentions = coalesce($4::uuid[], mentions),
                edited_at = now(), updated_at = now()
          where site_key = $1 and id = $2 and deleted_at is null`,
        [t.siteKey, t.row.id, text, mentions]
      )
      if (files && !(await setCommentAttachments(client, t.siteKey, t.row.id, files)))
        throw new AttachmentTaken()
      await client.query('commit')
    } catch (error) {
      await client.query('rollback').catch(() => {})
      if (error instanceof AttachmentTaken)
        return refuseAttachments(c, { code: 'ATTACHMENT_IN_USE', ids: files })
      throw error
    } finally {
      client.release()
    }
    if (files)
      await audit(pool, {
        actor: t.email,
        action: 'comment.attachments',
        siteKey: t.siteKey,
        detail: { id: t.row.id, attachments: files }
      })
    const row = await oneRow(pool, t.siteKey, t.row.id)
    if (!row) return refuse(c, 'COMMENT_NOT_FOUND', 404)
    if (mentions) {
      // Only the people this edit adds are told; the rest heard when they were first named.
      const before = new Set(t.row.mentions ?? [])
      const added = mentions.filter((id) => !before.has(id))
      await notices.edited({ siteKey: t.siteKey, actor: t.who.accountId, comment: row, added })
    }
    return json(c, { comment: shape(row, t.who) })
  })

  app.post('/api/sites/:key/comments/:id/resolve', async (c) => {
    const t = await target(c, { tombstone: true })
    if (t.error) return t.error
    if (t.row.status !== 'resolved') {
      await pool.query(
        `update site_comment
            set resolved_from = status, status = 'resolved', resolved_at = now(), resolved_by = $3,
                resolved_by_request = null, updated_at = now()
          where site_key = $1 and id = $2 and status <> 'resolved'`,
        [t.siteKey, t.row.id, t.who.accountId]
      )
      await audit(pool, {
        actor: t.email,
        action: 'comment.resolve',
        siteKey: t.siteKey,
        detail: { id: t.row.id }
      })
      await notices.statusChanged({
        siteKey: t.siteKey,
        actor: t.who.accountId,
        comment: t.row,
        resolved: true
      })
    }
    return json(c, { comment: shape(await oneRow(pool, t.siteKey, t.row.id, { tombstone: true }), t.who) })
  })

  app.post('/api/sites/:key/comments/:id/reopen', async (c) => {
    const t = await target(c, { tombstone: true })
    if (t.error) return t.error
    if (t.row.status === 'resolved') {
      await pool.query(
        `update site_comment
            set status = coalesce(resolved_from, 'pending'), resolved_from = null, resolved_at = null,
                resolved_by = null, resolved_by_request = null, updated_at = now()
          where site_key = $1 and id = $2 and status = 'resolved'`,
        [t.siteKey, t.row.id]
      )
      await audit(pool, {
        actor: t.email,
        action: 'comment.reopen',
        siteKey: t.siteKey,
        detail: { id: t.row.id }
      })
      await notices.statusChanged({
        siteKey: t.siteKey,
        actor: t.who.accountId,
        comment: t.row,
        resolved: false
      })
    }
    return json(c, { comment: shape(await oneRow(pool, t.siteKey, t.row.id, { tombstone: true }), t.who) })
  })

  // ── What "Send all" ticks (ADR 0025): open comments already sent, with nothing new since ──
  app.get('/api/sites/:key/comments/sent', async (c) => {
    const me = await caller(c)
    if (me.error) return me.error
    return json(c, { sent: await sentAndWaiting(pool, me.siteKey) })
  })

  // ── What one comment turn did, for the report under it in the chat (ADR 0025) ──
  app.get('/api/sites/:key/comments/report', async (c) => {
    const me = await caller(c)
    if (me.error) return me.error
    const turn = c.req.query('turn')
    if (!parseTurnId(turn)) return badInput(c, 'turn', 'a chat turn id, <session id>:<turn number>')
    return json(c, { turn, comments: await turnReport(pool, me.siteKey, /** @type {string} */ (turn)) })
  })

  // ── Read marks: one person's, never shown to anyone else (`045`, `061-site-comment-read-seen-n.sql`) ──
  app.get('/api/sites/:key/comments/reads', async (c) => {
    const me = await caller(c)
    if (me.error) return me.error
    const { rows } = await pool.query(
      `select comment_id, seen_n from site_comment_read where site_key = $1 and account_id = $2`,
      [me.siteKey, me.who.accountId]
    )
    return json(c, { reads: rows.map((r) => ({ id: r.comment_id, seenN: r.seen_n })) })
  })

  // ── The `@` picker's roster: the people holding a live seat on this site (spec #809 C1) ──
  app.get('/api/sites/:key/comments/people', async (c) => {
    const me = await caller(c)
    if (me.error) return me.error
    const { rows } = await pool.query(
      `select s.account_id, s.role, a.email, a.display_name, a.avatar_url
         from seat s join account a on a.id = s.account_id
        where s.site_key = $1 and s.revoked_at is null and s.declined_at is null and s.accepted_at is not null
        order by lower(coalesce(nullif(a.display_name, ''), a.email))`,
      [me.siteKey]
    )
    return json(c, {
      people: rows.map((r) => ({
        ...person(r.account_id, r.email, r.display_name, r.avatar_url),
        role: r.role,
        you: r.account_id === me.who.accountId
      }))
    })
  })

  /**
   * `/read {seenN}` files what the tab drew (`061-site-comment-read-seen-n.sql`): the largest number
   * of the other people's messages in the thread as the person saw it. Never lowered (a second tab
   * drawing an older moment), never past the thread's largest number now (a reply not written yet is
   * not seen). Then the caller's Inbox rows about the replies it covers are read too — one way only:
   * reading the Inbox never marks a thread. `/unread` keeps the row with no number — "Mark as
   * unread". Either way the mark sits on the thread's root (`rootOf`, the thread `comment.reply`
   * rows name in `ref`), whichever of its messages was named.
   */
  const mark = (unread) => async (c) => {
    const t = await target(c, { tombstone: true })
    if (t.error) return t.error
    let seenN = null
    if (!unread) {
      const body = await c.req.json().catch(() => null)
      seenN = body?.seenN
      if (!Number.isSafeInteger(seenN) || seenN < 0)
        return badInput(c, 'seenN', 'the largest comment number of the thread you have seen, 0 or more')
    }
    const rootId = (await rootOf(pool, t.siteKey, t.row.id))?.id ?? t.row.id
    const { rows } = unread
      ? await pool.query(
          `insert into site_comment_read (comment_id, account_id, site_key, seen_n) values ($1, $2, $3, null)
           on conflict (comment_id, account_id) do update set seen_n = null
           returning seen_n`,
          [rootId, t.who.accountId, t.siteKey]
        )
      : await pool.query(
          `with recursive thread (id) as (
             select $1::uuid
             union
             select x.id from site_comment x join thread on x.reply_to = thread.id where x.site_key = $3),
           top as (select coalesce(max(m.n), 0) as n from site_comment m join thread on thread.id = m.id)
           insert into site_comment_read (comment_id, account_id, site_key, seen_n)
           select $1, $2, $3, least($4::int, top.n) from top
           on conflict (comment_id, account_id)
             do update set seen_n = greatest(site_comment_read.seen_n, excluded.seen_n)
           returning seen_n`,
          [rootId, t.who.accountId, t.siteKey, seenN]
        )
    const stored = rows[0].seen_n
    if (stored !== null)
      await notices.opened({ siteKey: t.siteKey, accountId: t.who.accountId, rootId, seenN: stored })
    return json(c, { read: { id: rootId, seenN: stored } })
  }
  app.post('/api/sites/:key/comments/:id/read', mark(false))
  app.post('/api/sites/:key/comments/:id/unread', mark(true))

  app.delete('/api/sites/:key/comments/:id', async (c) => {
    const t = await target(c)
    if (t.error) return t.error
    if (!mine(t, t.row)) return refuse(c, 'COMMENT_NOT_YOURS', 403)
    const { rows } = await pool.query(
      `update site_comment set deleted_at = now(), updated_at = now()
        where site_key = $1 and id = $2 and deleted_at is null returning id`,
      [t.siteKey, t.row.id]
    )
    if (!rows.length) return refuse(c, 'COMMENT_NOT_FOUND', 404)
    await touchParents(pool, t.siteKey, [t.row.id])
    await audit(pool, {
      actor: t.email,
      action: 'comment.delete',
      siteKey: t.siteKey,
      detail: { id: t.row.id }
    })
    await notices.deleted({ siteKey: t.siteKey, ids: [t.row.id] })
    const { rows: gone } = await pool.query(`${SELECT} where c.id = $1`, [t.row.id])
    return json(c, { comment: shape(gone[0], t.who) })
  })
}
