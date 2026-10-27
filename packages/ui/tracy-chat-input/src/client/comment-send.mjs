/**
 * The window event that turns a Browser-tab comment into one chat turn.
 *
 * WHY A WINDOW EVENT. The Browser tab lives in the side card (`dsh-better-sidebar`, a vendor
 * fork); the chat belongs to this plugin's side of the page. Both draw in the same document (only
 * the customer page sits in an iframe), so a `CustomEvent` on `window` is the whole bridge, and
 * the Tracy protocol stays out of the vendor tree (plan "comment to edit", decision 5b).
 *
 * 🔒 THE DRAFT IS NEVER TOUCHED. The turn goes through `conversation.sendSession` — the same
 * session verb the composer ends in — and never through `input.for(...).setDraft` + `submit`,
 * which would throw away whatever the person was typing (the path
 * `tracy-design-inspiration/src/client/composer.ts` takes). Nothing here reads or writes the
 * composer.
 *
 * 🔒 QUEUE UNLESS ASKED. A comment while the agent is running waits its turn (`queue`, dsh's own
 * default); `steer` interrupts the running turn, so it is used only when the sender names it.
 *
 * Contract (shared with the Browser tab; H3 of plan "comment multi-pin"):
 *   `tracy:comment-send`   {v:1, requestId, sessionId, siteKey, text, element, locate, mode}
 *                          {v:2, requestId, sessionId, siteKey, mode,
 *                           items:[{n, url, text, element, locate}]}   — several pins, ONE turn;
 *                          `element: null` = a comment about the whole page (plan "comment review" H4)
 *                          {v:3, requestId, sessionId, siteKey, mode?,
 *                           items:[{n, url, element, text, author, thread?, commentId?, locate?}]}
 *                          — stage 6 (`tasks/evidence/comment-people/contract.md` §H2): every Send to
 *                          Tracy. `n` is the request's number from the server (`POST /requests`, no
 *                          ceiling); the turn is ALWAYS numbered, one item too, since the Apply door
 *                          checks `comment: n` against that request. `thread` — the comment's thread
 *                          when it came from a thread card or a row (`{author, at, text}` per message,
 *                          `{author, at, sent: true}` per earlier send); the typed words are `text`,
 *                          the sender's `(now)` line. `commentId` is the fork's; the turn does not use it.
 *                          `at` (optional, ms): when the comment was made — round 3 prints it on the
 *                          comment's line when several comments on one element share ONE block.
 *                          {v:4, …v3, attachments: File[]} — stage 6 files (`attachments-contract.md` §B):
 *                          v3 plus the files of the whole message (dsh attaches files to a message, not
 *                          to a chip); the fork sends v4 only with at least one file. The files go
 *                          dsh's own way (`comment-attachments.mjs`): limits, `createDrafts`, every
 *                          upload `ready`, then `sendSession(…, draftIds, …)`.
 *   `tracy:comment-sent`   {requestId, sessionId, queued} — for a send into a running session, as
 *                          soon as dsh has queued it ({@link QUEUED_ACK_MS}), not when its admission settles
 *   `tracy:comment-failed` {requestId, code} — code: rejected | site-mismatch | no-session |
 *                          subagent-readonly | too-long (the comments do not fit one turn) |
 *                          attachment-too-large (v4: a file over dsh's limits; nothing drafted) |
 *                          attachment-failed (v4: an upload failed; nothing sent)
 * The sender owns the timeout and the `no-listener` case; this side answers every request it can
 * attribute (one with a requestId) exactly once, and repeats that answer for a repeated id.
 *
 * After a turn goes out the chat column switches to its Chat tab (`showChat`, stage 6 rule 5: after
 * any Send to Tracy the person sees the message and Tracy's answer) — only after `sendSession`
 * succeeded, never for a refusal.
 */

import { AttachmentFailed, checkForChat, draftsReady, isFile } from './comment-attachments.mjs'
import { buildCommentTurn, TooLong } from './comment-turn.mjs'

export const SEND_EVENT = 'tracy:comment-send'
export const SENT_EVENT = 'tracy:comment-sent'
export const FAILED_EVENT = 'tracy:comment-failed'

/**
 * How long a send into a RUNNING session waits for dsh's admission before it is answered `sent` with
 * `queued: true` (ms). Stage-6 acceptance e2e v3 (30/09): a Send all while Tracy was busy sat in dsh's
 * queue strip and went out when the turn stopped, yet the Browser tab — which waits 10 s for an answer
 * (`COMMENT_SEND_TIMEOUT_MS` in the fork) — said "The chat did not answer": this side answered only
 * once `sendSession` settled, and a queued admission on a busy host took longer than the tab's wait.
 * The message is dsh's from the moment it is queued (dsh shows it, sends it and reports its own
 * failure in the chat), so the tab hears it is queued. A session that is not running still waits for
 * dsh: its answer is the one the tab needs to keep the person's words on a refusal.
 */
export const QUEUED_ACK_MS = 2_000

/**
 * The words a deleted root stands under in its turn (server round 5, contract H1 "Round 5"): its own
 * are gone for good, so the turn says so instead of quoting nothing; its replies are its thread.
 */
export const DELETED_WORDS = '(comment deleted)'

/** How many request ids are remembered for de-duplication; older ones fall out first. */
const REMEMBERED = 64

/**
 * @typedef {{ running?: boolean, subagent?: unknown, removed?: boolean }} Snapshot
 * @typedef {{ getSnapshot(): Snapshot }} SessionFace
 * @typedef {{ binding(id: string): { session: SessionFace } | undefined }} Sessions
 * @typedef {{ sendSession(session: SessionFace, text: string, attachments: readonly string[], mode: 'queue' | 'steer'): Promise<{ kind: string }> }
 *   & Partial<import('./comment-attachments.mjs').DraftService>} Conversation
 *   the draft verbs are read only for a v4 send.
 * @typedef {{ type: string, detail: Record<string, unknown> }} Reply
 */

/** @param {unknown} value */
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/**
 * @typedef {{ sessionId: string, siteKey: string, text: string, ns: number[], same: number[][], commentIds?: string[] }} SentTurn
 *   `commentIds` — the Browser tab's comments the turn was sent from (each item's `commentId`), so the
 *   Comments list can say "Tracy working…" on them while this turn runs (`comment-working.mjs`);
 *   `sessionId` — the session the turn went to; `siteKey` — the site it was about (the progress
 *   events name it, `comment-status.mjs`); `text` — the turn EXACTLY as handed to
 *   `sendSession`, so a `user/message` whose text equals it is this turn; `ns` — the comment
 *   numbers it carries, ascending: the pins' own numbers for a v2 send, even
 *   one of a single item (stand e2e H1: pin 4 sent alone was recorded as 1 and never coloured);
 *   `[1]` for a v1 send, which carries no number; `same` — groups (ascending, each of two or more)
 *   of numbers whose comments point at the same element (same page address and selector): the
 *   agent may do them in one write under one number (stand e2e M4), so a reader can credit that
 *   write to the whole group.
 */

/**
 * The turns this page is sending or has sent from the Browser tab, by request id — how
 * `comment-status.mjs` (plan "comment multi-pin", H6) finds which chat turn carries a batch: it
 * walks `entries()`, binds a batch to the `user/message` whose text equals `text` in session
 * `sessionId`, and reports status per number in `ns`.
 *
 * Written BEFORE `sendSession` is called — dsh can append the `user/message` before that promise
 * settles — and removed again when the send is refused or throws, so a turn that never went out is
 * never bound. Bounded like the de-duplication memory ({@link REMEMBERED} entries, the oldest
 * dropped first). A plain `Map` so a reader can iterate it; only this module writes it.
 * @type {Map<string, SentTurn>}
 */
export const sentTurns = new Map()

/**
 * The Browser tab's comments a send came from (each item's `commentId`), once each; nothing when none.
 * @param {Record<string, unknown>} d
 * @returns {{ commentIds?: string[] }}
 */
function commentIdsOf(d) {
  const ids = Array.isArray(d.items)
    ? [...new Set(d.items.map((/** @type {any} */ item) => item?.commentId).filter(isText))]
    : []
  return ids.length > 0 ? { commentIds: ids } : {}
}

/** @param {string} requestId @param {SentTurn} turn */
function remember(requestId, turn) {
  sentTurns.delete(requestId)
  sentTurns.set(requestId, turn)
  while (sentTurns.size > REMEMBERED) sentTurns.delete(/** @type {string} */ (sentTurns.keys().next().value))
}

/** @param {unknown} element - an element as the Browser tab sends it: an address and a selector at least. */
const isElement = (element) =>
  element !== null &&
  typeof element === 'object' &&
  typeof (/** @type {Record<string, unknown>} */ (element).url) === 'string' &&
  typeof (/** @type {Record<string, unknown>} */ (element).selector) === 'string'

/**
 * Numbers of comments that point at one element — the same page address and selector — grouped,
 * ascending, groups of two or more only.
 * @param {{ n: number, element: Record<string, unknown> | null }[]} comments
 * @returns {number[][]}
 */
function sameElement(comments) {
  /** @type {Map<string, number[]>} */
  const byElement = new Map()
  for (const { n, element } of comments) {
    // A comment about the whole page (H4) points at no element, so it shares none.
    if (element === null) continue
    const key = `${String(element.url)}\u0000${String(element.selector)}`
    byElement.set(key, [...(byElement.get(key) ?? []), n])
  }
  return [...byElement.values()]
    .filter((ns) => ns.length > 1)
    .map((ns) => ns.sort((a, b) => a - b))
    .sort((a, b) => a[0] - b[0])
}

/**
 * The comments one send carries, as `buildCommentTurn` takes them — or null for a malformed send.
 * A v2 item's descriptor is addressed by the item's `url`, the pin's canonical page address (H4:
 * Tracy's parameters and the fragment stripped by the Browser tab), when it gives one.
 * A reply's `replyTo`, `thread` and `author` are the item's own when it brings them; what is missing
 * comes from `replyContext` — the Comments view's lists: the parent's number, the parent alone as the
 * thread, and the reply's author (F1: the reply's own author closes its thread). A top-level comment
 * that brings a `thread` (N1: replies stood under it when it was sent) keeps it and its author.
 * @param {Record<string, unknown>} d
 * @param {ReplyContext} replyContext
 * @param {(item: Record<string, any>) => unknown} [typedBy] - who typed a v3 item's words when they are not
 *   the comment's own ({@link typedByOf}); undefined for none.
 * @returns {{ n: number, text: string, element: Record<string, unknown> | null,
 *   locate: import('./comment-turn.mjs').LocateAnswer | null, url?: string, replyTo?: number,
 *   thread?: readonly import('./comment-turn.mjs').ThreadEntry[], author?: unknown }[] | null}
 */
function commentsOf(d, replyContext, typedBy = () => undefined) {
  if (d.v === 1) {
    if (!isText(d.text) || !isElement(d.element)) return null
    return [
      {
        n: 1,
        text: /** @type {string} */ (d.text),
        element: /** @type {Record<string, unknown>} */ (d.element),
        locate: /** @type {import('./comment-turn.mjs').LocateAnswer | null} */ (d.locate ?? null)
      }
    ]
  }
  if (d.v === 3 || d.v === 4) return v3Items(d.items, typedBy)
  if (d.v !== 2 || !Array.isArray(d.items) || d.items.length === 0) return null
  const items = []
  for (const item of d.items) {
    if (item === null || typeof item !== 'object' || !isText(item.text)) return null
    // `element: null` is a comment about the whole page (plan "comment review", H4): its words, no block.
    if (item.element !== null && !isElement(item.element)) return null
    const own = Number.isInteger(item.replyTo) ? /** @type {number} */ (item.replyTo) : undefined
    const ownThread = Array.isArray(item.thread) && item.thread.length > 0 ? item.thread : undefined
    const ownAuthor = item.author !== undefined && item.author !== null ? item.author : undefined
    const known =
      item.element !== null && (own === undefined || ownThread === undefined || ownAuthor === undefined)
        ? replyContext(/** @type {string} */ (d.sessionId), item.n)
        : null
    const replyTo = own ?? known?.replyTo
    const thread = ownThread ?? known?.thread
    const author = ownAuthor ?? known?.author
    const threaded = replyTo !== undefined || (item.element !== null && ownThread !== undefined)
    items.push({
      n: item.n,
      text: item.text,
      element:
        item.element === null ? null : isText(item.url) ? { ...item.element, url: item.url } : item.element,
      ...(item.element === null ? { url: isText(item.url) ? item.url : '' } : {}),
      locate: item.locate ?? null,
      ...(replyTo !== undefined ? { replyTo } : {}),
      // N1: a top-level comment sent with the replies under it carries them too (its own `thread`).
      ...(threaded && thread !== undefined ? { thread } : {}),
      ...(threaded && author !== undefined ? { author } : {})
    })
  }
  return items
}

/**
 * The items of a v3 send, as `buildCommentTurn` takes them — or null when one is malformed. Each keeps
 * its author and, when it brings one, its thread; the descriptor is addressed by the item's `url`.
 * @param {unknown} list
 * @param {(item: Record<string, any>) => unknown} typedBy
 * @returns {ReturnType<typeof commentsOf>}
 */
function v3Items(list, typedBy) {
  if (!Array.isArray(list) || list.length === 0) return null
  /** @type {NonNullable<ReturnType<typeof commentsOf>>} */
  const items = []
  for (const item of list) {
    if (item === null || typeof item !== 'object') return null
    // Server round 5 (TH-4): a root its author deleted while replies stand under it is still a thread
    // and may be sent (its `commentId`, its replies as `thread`), but it has no words left to quote.
    const tombstone =
      !isText(item.text) && isText(item.commentId) && Array.isArray(item.thread) && item.thread.length > 0
    if (!tombstone && !isText(item.text)) return null
    if (!Number.isSafeInteger(item.n) || item.n < 1) return null
    if (item.element !== null && !isElement(item.element)) return null
    const url = isText(item.url) ? /** @type {string} */ (item.url) : undefined
    const sender = tombstone ? undefined : typedBy(item)
    items.push({
      n: item.n,
      text: tombstone ? DELETED_WORDS : item.text,
      ...(tombstone ? { deleted: true } : {}),
      element: item.element === null ? null : url !== undefined ? { ...item.element, url } : item.element,
      ...(item.element === null ? { url: url ?? '' } : {}),
      locate: item.locate ?? null,
      ...(item.author !== undefined && item.author !== null ? { author: item.author } : {}),
      ...(Array.isArray(item.thread) && item.thread.length > 0 ? { thread: item.thread } : {}),
      // When the comment was made (round 3): its time in a grouped block's thread, and the group's order.
      ...(typeof item.at === 'number' && Number.isFinite(item.at) ? { at: item.at } : {}),
      ...(sender !== undefined && sender !== null ? { sender } : {})
    })
  }
  return items
}

/**
 * Who typed a v3 item's words (round 3; found by the fork agent 30/09). A thread card sends the comment's
 * author as `author` (the chip's bubble) and the words the SENDER just typed as `text`, so the turn used
 * to print `<author> (now): <sender's words>`. A send of a comment as it stands (Send all, a row, the edit
 * popover after its save) carries the comment's stored words. So: an item naming a listed comment
 * (`commentId`) whose words differ from what that comment holds now was typed by the signed-in seat.
 * The edit popover's race (its save not yet listed) names the sender too — who, being the only one who
 * may edit it, is its author. A root deleted while replies stand under it is listed with no words (''),
 * so words typed in its card are the sender's too (e2e v4 thread, V4-2). Nothing is guessed when the
 * comment is not listed or no sender is known.
 * @param {() => unknown} sender - the signed-in seat as `{name?, email?}`, or null.
 * @param {(commentId: string) => string | undefined} storedText - a listed comment's words now.
 * @returns {(item: Record<string, any>) => unknown}
 */
function typedByOf(sender, storedText) {
  return (item) => {
    if (!isText(item.commentId)) return undefined
    const stored = storedText(item.commentId)
    if (typeof stored !== 'string' || sameWords(stored, String(item.text))) return undefined
    return sender() ?? undefined
  }
}

/**
 * Whether two copies of a comment's words are the same words: equal once runs of white space (line
 * breaks, `\r\n`, trailing spaces) are one space (e2e v5, V5S-7) — the fork sends a comment's words
 * trimmed, the list keeps them as saved, and a difference of spacing is not words typed now.
 * @param {string} a @param {string} b
 */
const sameWords = (a, b) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim()

/**
 * @typedef {(sessionId: string, n: number) =>
 *   { replyTo: number, thread: readonly import('./comment-turn.mjs').ThreadEntry[], author?: unknown } | null} ReplyContext
 *   what comment `n` of session `sessionId` continues, from the Comments view's lists
 *   (`comment-view.mjs` `replyContext`), and who wrote it; null when it is not a reply.
 */

/**
 * Listen for comment turns on `target` (the page's `window`).
 * @param {{
 *   target: EventTarget,
 *   sessions: Sessions,
 *   conversation: Conversation,
 *   siteKey: () => string | null,
 *   replyContext?: ReplyContext,
 *   now?: () => number,
 *   showChat?: (sessionId: string) => void,
 *   sender?: () => unknown,
 *   storedText?: (commentId: string) => string | undefined,
 *   queuedAckMs?: number
 * }} deps - `siteKey` answers which site this page is the workspace of, read when a comment arrives;
 *   `replyContext` what a v2 reply continues when its item does not say; `now` the clock a thread's
 *   "7m ago" reads; `showChat` switches the chat column of that session to its Chat tab; `sender` the
 *   signed-in seat and `storedText` a listed comment's words now — how words typed in a thread card get
 *   their sender's name ({@link typedByOf}); `queuedAckMs` how long a send into a running session waits
 *   for dsh before it is answered queued ({@link QUEUED_ACK_MS}).
 * @returns {() => void} stops listening.
 */
export function listenForComments({
  target,
  sessions,
  conversation,
  siteKey,
  replyContext = () => null,
  now = Date.now,
  showChat = () => {},
  sender = () => null,
  storedText = () => undefined,
  queuedAckMs = QUEUED_ACK_MS
}) {
  const typedBy = typedByOf(sender, storedText)
  /** requestId → the answer given, or null while the send is in flight. */
  /** @type {Map<string, Reply | null>} */
  const seen = new Map()

  /** @param {Reply} reply */
  const answer = (reply) => {
    target.dispatchEvent(new CustomEvent(reply.type, { detail: reply.detail }))
  }

  /** @param {string} requestId @param {string} code @returns {Reply} */
  const failed = (requestId, code) => ({ type: FAILED_EVENT, detail: { requestId, code } })

  /**
   * @param {Record<string, unknown>} d
   * @param {(reply: Reply) => void} early - answers before the send settles: a queued send dsh holds.
   * @returns {Promise<Reply>}
   */
  const handle = async (d, early) => {
    const requestId = /** @type {string} */ (d.requestId)
    const comments = commentsOf(d, replyContext, typedBy)
    if (!comments || typeof d.sessionId !== 'string') return failed(requestId, 'rejected')
    // v4: at least one real file (a v4 without files is a malformed send, not a v3).
    /** @type {File[]} */
    const files = d.v === 4 && Array.isArray(d.attachments) ? d.attachments : []
    if (d.v === 4 && (files.length === 0 || !files.every(isFile))) return failed(requestId, 'rejected')
    // The site first: a comment meant for another workspace must not even pick a session here.
    if (d.siteKey !== siteKey()) return failed(requestId, 'site-mismatch')
    const session = sessions.binding(d.sessionId)?.session
    const snapshot = session?.getSnapshot()
    if (!session || !snapshot || snapshot.removed) return failed(requestId, 'no-session')
    if (snapshot.subagent !== null && snapshot.subagent !== undefined)
      return failed(requestId, 'subagent-readonly')
    // dsh's `createDrafts` checks no limit, so this side does, before any draft exists.
    if (files.length > 0 && !checkForChat(files)) return failed(requestId, 'attachment-too-large')

    const mode = d.mode === 'steer' ? 'steer' : 'queue'
    const queued = snapshot.running === true
    /** @type {string} */
    let text
    try {
      // v1 as it always was; v2 as a list — one item gives the same bytes as v1 (H5).
      text =
        d.v === 1
          ? // A v1 comment always has an element (`commentsOf` checks it).
            buildCommentTurn(
              /** @type {{ text: string, element: import('./comment-turn.mjs').CommentElement }} */ (
                comments[0]
              )
            )
          : buildCommentTurn({
              items: /** @type {import('./comment-turn.mjs').CommentItem[]} */ (comments),
              now: now(),
              // v3/v4: every item keeps its number, one alone too (the Apply door's `comment: n`).
              numbered: d.v === 3 || d.v === 4
            })
    } catch (error) {
      return failed(requestId, error instanceof TooLong ? 'too-long' : 'rejected')
    }
    remember(requestId, {
      sessionId: d.sessionId,
      siteKey: /** @type {string} */ (d.siteKey),
      text,
      ns: d.v === 1 ? [1] : comments.map((c) => c.n).sort((a, b) => a - b),
      same: d.v === 1 ? [] : sameElement(comments),
      ...commentIdsOf(d)
    })
    /** @type {readonly { id: string, kind: string }[]} */
    let drafts = []
    if (files.length > 0) {
      try {
        if (!conversation.createDrafts || !conversation.fileUploads) throw new AttachmentFailed('no drafts')
        drafts = await draftsReady(
          /** @type {import('./comment-attachments.mjs').DraftService} */ (conversation),
          d.sessionId,
          files
        )
      } catch {
        sentTurns.delete(requestId)
        return failed(requestId, 'attachment-failed')
      }
    }
    const giveBack = () => {
      try {
        if (drafts.length > 0) conversation.releaseDraftAttachments?.(drafts)
      } catch {
        // Nothing more to give back.
      }
    }
    const shown = () => {
      try {
        showChat(/** @type {string} */ (d.sessionId))
      } catch {
        // The column could not be switched (no strip on screen): the turn went out all the same.
      }
    }
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let ack
    // A busy session queues the message (dsh's queue strip shows it at once): answer queued once dsh
    // has held it for `queuedAckMs`, so a slow admission is not reported as a chat that did not answer.
    if (queued)
      ack = setTimeout(() => {
        shown()
        early({ type: SENT_EVENT, detail: { requestId, sessionId: d.sessionId, queued: true } })
      }, queuedAckMs)
    try {
      const outcome = await conversation
        .sendSession(
          session,
          text,
          drafts.map((a) => a.id),
          mode
        )
        .finally(() => clearTimeout(ack))
      if (outcome?.kind !== 'success') {
        sentTurns.delete(requestId)
        giveBack()
        return failed(requestId, 'rejected')
      }
    } catch {
      sentTurns.delete(requestId)
      giveBack()
      return failed(requestId, 'rejected')
    }
    shown()
    return { type: SENT_EVENT, detail: { requestId, sessionId: d.sessionId, queued } }
  }

  /** @param {Event} event */
  const onSend = (event) => {
    const d = /** @type {CustomEvent} */ (event).detail
    // Without a requestId there is nobody to answer; the sender's own timeout covers it.
    if (d === null || typeof d !== 'object' || !isText(d.requestId)) return
    const requestId = /** @type {string} */ (d.requestId)
    if (seen.has(requestId)) {
      const earlier = seen.get(requestId)
      if (earlier) answer(earlier)
      return
    }
    seen.set(requestId, null)
    while (seen.size > REMEMBERED) seen.delete(/** @type {string} */ (seen.keys().next().value))
    // Exactly one answer per request: an early (queued) answer stands, whatever the send settles to.
    let answered = false
    /** @param {Reply} reply */
    const once = (reply) => {
      if (answered) return
      answered = true
      seen.set(requestId, reply)
      answer(reply)
    }
    void handle(d, once).then(once)
  }

  target.addEventListener(SEND_EVENT, onSend)
  return () => target.removeEventListener(SEND_EVENT, onSend)
}
