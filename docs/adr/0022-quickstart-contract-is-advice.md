---
description: A quickstart's content contract is advice for keeping the design, not a lock — a quickstart site refuses only one thing, writing straight into the database; supersedes ADR 0020 and every "content-only" lock layer on Joomla, WordPress and EmDash
sources:
  - packages/tools/tracy-subprocess-docker/src/content-contract.mjs
  - packages/tools/tracy-subprocess-docker/index.js
  - packages/tools/tracy-site-tools/src/host/legacy-refusal.mjs
  - packages/tools/tracy-site-tools/src/host/site.mjs
  - packages/tools/tracy-site-tools/src/host/site-context.mjs
  - packages/site/tracy-site-build-emdash/src/host/requests.mjs
  - packages/cms/tracy-emdash-theme-business/Dockerfile
  - packages/cms/tracy-emdash-theme-business/src/middleware.ts
---

# 0022 — The quickstart contract is advice, not a lock

**Status:** (binding) · 26/09/2026 · decided by Lee, written by Claude. **Supersedes [ADR 0020](0020-emdash-content-only-fence.md)**
and every "content-only" layer on Joomla and WordPress that never had an ADR.

## Context

What Lee meant when he set up the quickstart contract: to **steer** the site's agent to edit in the direction of content and
keep the quickstart's design mould — for example a 10-word slogan should not be replaced by 100 words,
because that breaks the UI/UX. Not to forbid.

From 12/09 to 25/09, across agent sessions (committed under the git name "Lee", without Lee deciding), that intent slid
into a hard lock, each session adding one layer after measuring an agent "acting recklessly":

| Date | Lock layer |
|---|---|
| 12/09 | marker `.content-contracts/<label>.json` turns off shell, terminal, file tools outside `docs/agents` |
| 23/09 | refused tools are hidden too; the `refusalNext` sentence teaches the agent "do not look for another way in… tell the customer the site is sealed" |
| 25/09 | ADR 0020 for EmDash: tool allowlist in the lane, code owned by root + `site.rebuild` forbidden, template middleware blocking structural MCP tools |
| — | the Claude Cowork plugin (claude-cowork `Engine.php`) refuses every structural write with code `content_only`; the Content API reports "Presentation is locked" |

The consequence measured on 26/09 on `r1e1734` (Tracy Business EmDash): the customer asked to change the primary colour, the agent answered
"it cannot be changed — this site is content-only". `/app/src` was owned by root, the agent (www-data) could not write it,
`site.rebuild` refused. Lee: "then what was Tracy made for".

## Decision

1. **Lock nothing, except writing straight into the database.** On a quickstart site, shell, terminal, file tools,
   `content.find`, every EmDash MCP tool, and `site.rebuild` are all open as on an ordinary site. The lane refuses exactly
   one thing: shell commands that write the database directly (SQL via `mysql`/`mariadb`/`psql`/`sqlite3`, `wp db
   query` with a write statement, `wp db import|reset|clean|drop|create`, raw SQL from `php -r`/`wp eval`) —
   `directDbWriteReason`, `tracy-subprocess-docker/src/content-contract.mjs`. It is a fence built from text matching plus one
   explanatory sentence, not a fortress. Sites without a contract keep the old rule (no blocking,
   a trace note).
2. **The contract is advice.** The contract's slots are still the fastest map for changing text and images while keeping
   the design; everything else goes through the CMS itself (CLI in the shell, template/override files, admin). The advice
   lives in a single sentence, `QUICKSTART_DESIGN_RULE`: reuse the quickstart's sections and styles,
   new text **0.75× – 1.25×** the length of the text it replaces — **a warning, never a refusal**.
3. **The name "content-only" is dropped.** The concept is called *content recommendation*; `mode` in
   `manifest.json` is `content-recommendation`. The old string remains in only one place,
   `tracy-site-tools/src/host/legacy-refusal.mjs`, to **recognise** the answers of old Claude Cowork plugin and
   template versions still running on customer sites — no Tracy code answers with it.
4. **The answer when an old door refuses** points to what can be done (slot, the CMS's CLI, template files,
   `/app` + `site.rebuild` on EmDash), never tells the agent to stop or tells the customer "the site is locked".
5. **EmDash:** `/app` is owned by www-data as before 1.4.0; no `io.tracy.content-only` label, no
   `contentOnly` flag, no middleware blocking MCP. Changing the look = editing `/app` then `site.rebuild`.

## Consequences

- Running sites keep the old version until they are updated: the Joomla/WordPress Claude Cowork plugin still refuses structural
  writes through the content door (the agent is pointed to the CLI), EmDash template 1.4.x still returns 403 for structural
  MCP tools (the agent is pointed to `/app` + rebuild), and the `/app` volume of an EmDash site created from 1.4.x is still
  owned by root — it must be chowned back (`find /app -xdev -not -user www-data -exec chown www-data:www-data {} +`
  as root in the web container) before the agent can edit the code.
- Work to do in other repos: the Claude Cowork plugin `claude-cowork` drops `CONTENT_ONLY_BLOCKED`; the kit
  `tracy-emdash-template` takes the `artifact.mjs` fix (see `IMPORT-NOTE.md`); cut new releases for the
  quickstarts.
- `presentation-lock.json` changes role: it is a **design baseline** to diff against, not something that refuses writes.

## Cost if wrong

- A freer agent can break the design more. The length advice and "reuse the quickstart's sections"
  are the answer; if measurements show a lot of breakage, fix the advice or add warnings — **do not**
  rebuild the lock. Every proposal for a new lock must go through Lee.
- The DB fence built from text matching can be bypassed (a PHP script calling `$wpdb->query`). Accepted: it is a reminder with
  teeth, not a security boundary; the boundary between customers is ADR 0014, unchanged.

## Addendum 29/09/2026

The `manifest.json` files of **already released** profiles still say `mode: "content-only"` and must not be edited: they are sealed artifacts, and the Claude Cowork plugin pins their hash byte for byte (`check-contracts.ts`). Readers (`apps/tracy-web/src/lib/contracts.js`, `tracy-site-tools` `legacy-refusal.mjs`) understand both values as the same *content recommendation* mode; newly cut profiles write `content-recommendation`.

## Addendum 04/10/2026

The contract is advice and **locks nothing ON A SITE** (the points above are unchanged): the agent on a site is never locked, even when the site was built from a release that has no contract yet. **Putting a card on Design inspiration is a different matter** — that is what Tracy offers the customer to choose from. The product owner decided: a card **is not offered** when one of its Joomla or WordPress platforms has no content contract yet. `PUT /api/ops/quickstart/inspiration` refuses with `NO_CONTRACT` before writing anything, and points to the next step: capture the contract with `batch-contracts.mjs capture`, release it in a Claude Cowork release, then Publish again. The two do not contradict each other: one is about what the agent may do on a site, the other is about which cards are put on the shelf. Scope: Unpublish is never refused; an already published card is not removed automatically (but updating it through Publish is refused like a new card); `lower` (a lower profile serving) still only warns; EmDash has no contract and is not affected.
