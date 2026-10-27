---
description: Where an agent's answers on a customer's site are stored, how to read them (the site_turn.reply column and dsh's session log), each place's limits, and how to find "turn N" of a session again — so support can reconstruct what the agent said without guessing (22/10/2026).
sources:
  - apps/tracy-web/src/db/migrations/046-site-turn.sql
  - apps/tracy-web/src/db/migrations/050-site-turn-reply.sql
  - apps/tracy-web/src/sites/activity-v2.js
  - apps/tracy-web/src/ops/usage.js
  - apps/tracy-web/src/config.js
  - packages/site/tracy-site-tabs/src/host/turn-record.mjs
  - docs/adr/0014-one-dsh-per-host-commands-in-web-container.md
---

# Reading the agent's answers

**A common question.** Support reports a bug from a customer site ("turn 29, the customer asked how to turn it into a real site, what did the agent answer?") and
finds only the customer's question. **The agent's answer IS stored**, in two places, each with a limit. Read them in the order below.

## 1. The turn's final answer — `site_turn.reply` (fast, enough for most cases)

- The `reply` column of the `site_turn` table (migration `050`, since 02/10/2026). One row per turn; the lookup key is `site_key` + `session_id` + `turn`
  (`046-site-turn.sql`). A report's "turn N" is exactly `turn`, and `session-xxxx` is `session_id`.
- Content: **only the turn's LAST assistant message, text only** — no tool calls, tool results or reasoning;
  code blocks become `[code]`; cut at **2000 characters** between two words (`turn-record.mjs`, `momentReply` in `sites/route.js`).
- `reply_state`: `full`, `truncated` (cut), `interrupted` (the customer pressed Stop midway: only the part already sent). An empty `reply` means
  the turn ended with no text, or the dsh was older than 02/10/2026 — **never backfilled**.
- Who can read it: every seat of the site sees it in the **Site changes** tab (`replyOf` in `sites/activity-v2.js`). On `/ops` › Beta › Usage it can only be read
  when the address is in `USAGE_TEXT_READERS` (403 for every other staff account), and **each read writes an `audit` row**.
  These are the customer's and the agent's words: read only with a reason, never paste them into a shared channel.

## 2. The whole session — dsh's log (every message and tool)

Use it when `reply` is empty or cut, or when you need to know **which tools the agent called**.

- It lives in the dsh container of **the host running the site** (ADR 0014: one dsh per host), at
  `/desk-home/sessions/--site-<site label>--/<session_id>/session.v4.jsonl.zstd`. `<site label>` is the first part of the site's address
  (`fleetLabel`), `<session_id>` is the `session-…` above.
- ⚠ The file is **several concatenated zstd frames**. Measured 21/10/2026: Node's `zlib.zstdDecompressSync` only decodes **the first frame** (208 bytes, only the
  `session` line) and reports no error — it looks like an empty session. Copy the file out and decode it with the real `zstd -dc`:

  ```bash
  docker cp <dsh container>:/desk-home/sessions/--site-<label>--/<session_id>/session.v4.jsonl.zstd /tmp/s.zst
  zstd -dc /tmp/s.zst > /tmp/s.jsonl          # one JSON event per line
  ```

- The events needed: `turn/start {turn}` opens turn N (the same number as `site_turn.turn`); `assistant/message` (blocks `text`, `tool-call`,
  `reasoning`); `tool/call` (`name`, `arguments`); `tool/result`; `turn/end {reason}`. What the agent said to the customer is the `text` blocks of
  `assistant/message` in that turn (a multi-step turn has several messages: **every** `text` block, not just the last).
- There is no time-based log cleanup in the dsh image's code (none found); the session directory is archived when the site is deleted or leaves the
  workspace (`archiveSessionsAtDoor`, `workspace/seat-door.js`). Not checked on a real host: the disk's actual retention.

## 3. Not yet available

- **An `/ops` door reading a session by `session_id`** (with permission checks and audit) — today support has to go onto the host. Considered and left out:
  the content is the customer's private words, so such a door needs its own access decision, not one made alongside a bug-fix PR.
- Storing **several messages** per turn, or cutting longer than 2000 characters in `site_turn.reply`: no measured need yet.

## When reading to diagnose an agent bug

Compare three things of the same turn: the customer's question (`site_turn.title`), the `tool/call`s and `tool/result`s (what the agent **did**, and what was
refused), and the final `text` block (what the agent **said**). A turn that "reported done but the page did not change" is a mismatch between the latter two; a turn that "switched
language" — look for the `tracy-site-tools:reply-language` turn notice (a `user/message` right after the customer's message, content "Reply in <language> …",
`prompter.mjs`) and the text the agent wrote into the site.
