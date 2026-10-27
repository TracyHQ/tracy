# ADR 0034 — Ask the customer before a change with consequences, at the door, for every channel

- **Status:** (binding)
- **Date:** 19/10/2026
- **Decided by:** David, following the council of 19/10/2026 (Codex gpt-6.1-sol, xhigh; question and answer in `~/tracy-bench-work/voice-mode/council/q5-fix-all.md`, `a5-codex.md`)
- **Follows on from:** D34 (`packages/tools/tracy-site-tools/src/host/tiers.mjs`, 26–30/09/2026) — ask before a destructive call.

## Context

D34 turned the rule "ask before deleting" from an instruction into a door: `content.delete`, `media.delete`, `db.rollback`, installing/enabling code, deleting in EmDash… return `CONFIRM_FIRST` together with a question card written by Tracy (`confirm-<hash>`); only the answer "Yes, go ahead" to that exact card unlocks exactly one call.

But there are still changes that run immediately that the customer may not have meant to make — and the Voice rule (17/10) only tells the agent in words to "ask before changing prices, removing a section, changing many places":

- hiding a post/page through `content.update` (WordPress draft/pending/private/trash, Joomla state 0/2/-2);
- a change every page shows: site-scope `look.set`, `theme.style`, `tracy_design_system apply`, site name/description/logo;
- `content.replace all:true` writing many places at once (the old `>5` rule only required the agent to do its own `dryRun`/`expect`);
- changing prices (site-tools has no concept of price);
- EmDash `content_unpublish`, `menu_set_items`, `settings_update` — EmDash does not mark them destructive, and Tracy cannot undo them;
- shell commands (`wp post delete`, `wp search-replace`, `UPDATE` in `mysql`).

## Decision

1. **Ask by consequence, not by channel.** A `mutating` call whose consequence falls into one of four groups returns `CONFIRM_FIRST` exactly like a delete command — typed chat and Voice alike (`consequence.mjs`):
   - `hides`: a record is taken off the pages (except Joomla `featured: 0` — it only leaves the featured list, the article stays on the site);
   - `site`: a change every page shows (site-wide look, theme style, design system, name/description/logo, menu, EmDash settings);
   - `many`: one call writes **6 or more places** (counted with a dry run that writes nothing, not trusting the agent's `expect`);
   - `price`: an amount of money changes (old → new), even in only one place — recognised by currency patterns (₫, đ, đồng, $, €, £, ¥, ISO codes, 元/円); not every number is treated as a price.
2. **The card must state exactly what the door states.** The agent still translates the card into the customer's language (the repo rule forbids non-English text in code, and dsh's question schema has no message-code field), but the host keeps the `facts` — the record name, the number of places, the old and new price — and `tools/pre-execute` refuses a card missing a fact before the customer sees it (`call-memory.mjs` `confirmCardRefusal`).
3. **A "yes" holds for 5 minutes** (`CONFIRM_TTL_MS`), unlocks exactly one call, and is keyed by conversation + normalised call (the site is in the call or in the shell key).
4. **Shell: ask, do not lock.** ADR 0022 keeps the shell as one path; recognisable commands (delete, hide, search-replace without `--dry-run`, DB writes, installing/enabling code, `wp option`, writing Joomla CLI commands) are refused with a `confirm-` card; if the customer agrees, **that exact command** runs once (`shell-writes.mjs`). The refusal names the recorded (undoable) door when there is one.
5. **The agent calls first, it does not ask first.** The Tiers line of the `tracy_site` description and the Voice rule state the order: call, then read out the door's exact question — a question the agent makes up beforehand unlocks nothing and makes the customer answer twice.

## Addendum 20/10/2026 — after a real measurement run (council a6)

Real measurement on the stand (Joomla, EmDash; typed and spoken) showed the cards were right in behaviour but wrong in wording: English cards for Vietnamese customers, a delete card saying "This deletes something", a result card saying "article 4". The council settled:

6. **The card shows in the conversation's language** — `pre-execute` blocks a `confirm-` card that still carries the door's English text when the conversation is not in English (`untranslatedConfirmCard`).
7. **The card keeps its meaning** — dsh only lets the host allow/block a card, not edit it, so the host reads the meaning: the first button says "agree", the second says "no", a delete command's card must say delete, and a hide card must say hide, not delete (`confirm-words.mjs`, 8 languages; other languages are not blocked).
8. **Delete/hide cards name the exact record** — the host reads the record itself (WordPress/Joomla `content.get`, EmDash `content_get`) to get its title before asking, and puts it into `facts`. If it cannot read it, it does not ask a generic question (`TARGET_UNREAD`); an EmDash row already in the trash uses its slug.
9. **Ask "hide or delete" when the customer is not clear** — one rule line for every channel in the site context; no added regex hunting for verbs (it would block by mistake too easily).
10. **The result card names the record, never shows an id** — the host sends the title it read (right type + id) through the `x-tracy-write-title` header; tracy-web puts it into `target.title`, as a display label only. Without a title the interface names the record type in the customer's language ("a post").
11. **Voice answers the exact card** — a spoken "agree"/"no" matches the first/second button of exactly one pending `confirm-` card; free text is never sent as the answer to that card. Approving a plan by voice runs only in languages a native speaker has checked (the starting list is empty).

## Remaining gaps (stated plainly, not hidden)

- **The shell is best effort.** Self-writing scripts (`php fix.php`, `node x.js`), clients written another way, SQL built in a variable — not seen. Closing it fully needs a shell that cannot write, or a sandbox; not done.
- **Removing a section from a body** (`content.update` with a shorter body) is not yet asked at the door: the body-shrinks-80% rule and "removes" having to quote the customer's message are still the only guard; the Voice rule tells the agent to ask in words.
- **Prices inside `content.update`** (a price in a body/field) are not compared yet; only `content.replace` compares prices.
- **The host keeps the facts and the meaning, not yet the whole sentence** (B3): no 128-bit nonce yet, and no data-version check at execution (if the data changes within the 5 minutes after the card is answered, it does not ask again yet).
- **The card-meaning vocabulary (`confirm-words.mjs`) was written by an agent**, not yet reviewed by native speakers; languages outside the 8 rows are not checked.

## Consequences

- One more question round for the changes above; the `many` group adds a dry run that writes nothing before each `content.replace all:true`.
- Accompanying tests: `consequence.test.mjs`, `shell-writes.test.mjs`, `call-memory.test.mjs` (facts + 5 minutes), `emdash-call.test.mjs` (three EmDash tools), `chat-design-route-wiring.test.mjs`, `handler.test.mjs` (replace in 6 places), `tiers.test.mjs`.
