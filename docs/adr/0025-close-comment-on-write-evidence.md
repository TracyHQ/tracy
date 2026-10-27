---
description: A comment sent to Tracy is Resolved automatically when the Apply door has write evidence (answered_at) for the latest send exactly; without that mark it stays open and says "couldn't confirm"; one report at the end of the chat turn built from server data; "Ask Tracy to edit all" does not pre-tick a comment already sent with nothing new — reverses the stage 6 rule "a chat turn never changes a comment's status"
sources:
  - apps/tracy-web/src/sites/comments.js
  - apps/tracy-web/src/sites/route.js
  - apps/tracy-web/src/db/migrations/053-site-comment-auto-resolve.sql
  - apps/tracy-web/src/db/migrations/054-site-turn-end-reason.sql
  - packages/site/tracy-site-tabs/src/host/turn-record.mjs
  - apps/tracy-web/src/db/migrations/045-site-comment-read.sql
  - packages/ui/tracy-chat-input/src/client/CommentReportCard.tsx
  - packages/ui/tracy-chat-input/src/client/comment-report.mjs
  - packages/ui/tracy-chat-input/src/client/CommentsView.tsx
  - packages/ui/tracy-chat-input/src/client/comment-view.mjs
---

# 0025 — Tracy closes a comment when there is write evidence, and only then

**Status:** (binding) · 04/10/2026 · Brian (PO) decided 03–04/10/2026, Claude wrote it.
**Reverses** the stage 6 rule "a chat turn never changes a comment's status"
([`tasks/todo-comment-people.md`](../../tasks/todo-comment-people.md) Rules 1–2,
[`tasks/evidence/comment-people/contract.md`](../../tasks/evidence/comment-people/contract.md) §H1).

## Why a new ADR, not an edit to an old one

The stage 6 rule never lived in any ADR: it lives in the product rules file and the stage 6 contract
(both in `tasks/`, which is history). A reversal that only edits those two files would leave the next
agent reading `comments.js` with two contradicting statements and no way to know which wins. This
decision is hard to roll back (a DB column, users' habits), surprising without context ("why did the
comment close by itself?"), and a real trade-off (see Options dropped) — all three conditions for an
ADR.

## Context

Since stage 6, "Ask Tracy to edit" is just a chat message; the comment stays until someone presses
Resolve. Measured on the stand on 03/10: Tracy had finished the fix but the comment was still open, the
next "Ask Tracy to edit all" ticked it again and sent it again, and Tracy redid work already done.
Evidence of a write has existed since 01/10: the Apply door stamps `site_request.answered_at` when a
successful site write carries `comment: n` (`045-site-comment-read.sql`, `comments.js`
`markRequestsAnswered`).

## Decision

1. **Auto-Resolve when there is write evidence, for the latest send.** When the Apply door stamps
   `answered_at` for a request, the comment that request was sent from (the root thread) is Resolved —
   if that request is the comment's **latest send**, and there is **no** new message in the thread
   after the send (a reply at any level, or an edited message — `edited_at`). The mark of an older send
   never closes a comment that has new messages after it. The resolver is recorded as Tracy:
   `resolved_by_request` points at the send, `resolved_by` stays empty; the door returns `resolvedBy`
   with the name "Tracy" (`tracy: true`) and `resolvedByTracy: true`; the Resolved list in the chat
   column reads "Tracy marked this done" / "Tracy đã đánh dấu xong". A reply to a Resolved comment still
   reopens it — that is the path for "want more changes → reply and send again". A person's
   Resolve/Reopen clears Tracy's mark.
2. **No mark → leave it open, say "couldn't confirm".** Never say "not done": EmDash's own tools and
   theme edits through files do not go through the Apply door, so they carry no mark even when done.
3. **One report at the end of the turn, built from server data.** Under each turn sent from comments,
   the `tracy-chat-input` plugin (slot `conversation.chat.turnTail`) calls
   `GET /api/sites/:key/comments/report?turn=<session>:<n>` after the turn ends and draws:
   "Done: N comments (reply to a comment if you want more changes)" · "Couldn't confirm: N comments",
   each line opening its comment. It does not depend on what the model says and writes nothing extra
   into the comment thread. A turn is joined to a send by `site_turn.comment_ns` + session — the same
   join the Site changes tab already uses.
4. **"Ask Tracy to edit all" pre-ticks only what needs sending.** Pre-ticked: an open comment never
   sent, or one with new messages after its latest send. A comment already sent, not Resolved, with
   nothing new: unticked, labelled "Sent 23:43" / "Đã gửi 23:43", still tickable. The list comes from
   `GET /api/sites/:key/comments/sent`.

### Failed turns

A send into a **failed** turn does not count as sent (item 4). Three signs, each written by one source:

- a `stale` turn — dsh died mid-turn, or the turn has been `open` for more than 30 minutes;
- `reply_state = 'interrupted'` — stopped in the middle of the answer;
- `site_turn.end_reason` (migration 054) ∈ `error` · `aborted` · `blocked` · `interrupted` — the host
  plugin `tracy-site-tabs` (`turn-record.mjs` `endReasonOf`) reads the kind of that turn's own
  `turn/end` in the session log and sends `endReason` with `POST /moment`. This is the case Brian hit on
  03/10: a turn ending with "DeepSeek Messages transport failed" (`error`) used to close like a normal
  turn, so its comments were counted as sent. `completed` and `max-tokens` count as sent.

A send with no turn found (old dsh, failed `POST /turn`) or a turn with no reason yet (old host) counts
as sent.

## Options dropped

- **Resolve on the model's word** ("close when the model says it's done"): unverifiable, the model
  forgets or says the wrong thing — exactly what stage 6 dropped (`tracy:comment-status`). The
  `answered_at` mark is a server event.
- **Resolve every comment of the turn when the turn ends:** closes work not done and work EmDash cannot
  prove.
- **The mark of any send also closes:** a comment with a reply after the send gets closed by the
  evidence of an old request, and the new part is lost in Resolved.

## Consequences

- Two new columns on `site_comment` (`053-site-comment-auto-resolve.sql`): `resolved_by_request`,
  `edited_at`; one column on `site_turn` (`054-site-turn-end-reason.sql`): `end_reason`. No backfill.
- Two new read doors (internal, any seat can read): `/comments/sent`, `/comments/report`.
- The thread card on the page (fork `dsh-better-sidebar`) reads `resolvedBy` as before, so its tooltip
  says "Resolved by Tracy" — not yet the text "Tracy marked this done". Changing that text is the fork's
  job (not done in this line: PR #814 is editing the fork).
- Comments Resolved before this date keep their old resolver.
- Out of scope: stamping `answered_at` for EmDash writes / file edits
  (`tasks/todo-comment-people.md`).
