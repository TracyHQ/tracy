---
description: An EmDash site built from a Tracy quickstart is content-only through three layers — a tool allowlist in the lane, the file-tool fence in the container, and template middleware that blocks structural MCP tools for token-authenticated requests — instead of a Cowork component, which EmDash does not have
sources:
  - packages/tools/tracy-site-tools/src/host/emdash.mjs
  - packages/tools/tracy-site-tools/src/host/site.mjs
  - packages/cms/tracy-emdash-theme-business/Dockerfile
  - packages/cms/tracy-emdash-theme-business/tools/artifact.mjs
  - apps/tracy-web/src/lib/quickstart-capabilities.js
  - packages/site/tracy-site-build-emdash/src/host/requests.mjs
  - packages/cms/tracy-emdash-theme-business/src/lib/content-only.ts
  - packages/cms/tracy-emdash-theme-business/src/middleware.ts
  - packages/tools/tracy-site-tools/src/host/exec.mjs
---

# 0020 — Content-only fence for EmDash sites: three layers, no component

**Status:** **superseded by [ADR 0022](0022-quickstart-contract-is-advice.md)** (26/09/2026 — Lee did not approve; all three layers have been removed). Before that: provisionally accepted · 25/09/2026 · written by Claude on Akemi's instruction, **to be approved by Lee later** (provisional decisions
taken from `tasks/todo-emdash-business-hoan-thien.md` §Open questions)

## Context

The Tracy Business quickstart on Joomla (1.2.0) is **sealed** by the Cowork component running inside the site:
structure (menus, modules, extensions, languages) refuses changes with code `content_only`, only content fields declared
in the contract can change, every write has a receipt and `apply.revert`. An EmDash site built from
`tracy-business/emdash-0.x` has nothing equivalent: the agent's PAT carries scope `admin`, `tracy_emdash`
passes every MCP tool straight through including `schema_update_field`, and `tracy_site` refuses EmDash.

Three measurements decided the design (25/09/2026):

1. **The token is out of reach of the agent's shell.** `/run/tracy-agent.token` is a root 0600 read-only mount
   (`tracy-site-tools/src/host/exec.mjs`); the agent's www-data shell in the container cannot read it, only
   Tracy's MCP call (root exec) reads it. So **the agent's only API path is `tracy_emdash` in the lane**.
2. **The site code is a volume the agent can write.** `/app` is the site's own volume, and `site.rebuild`
   (`tracy-site-build-emdash/src/host/requests.mjs`) rebuilds from that code. Editing `src/` and then rebuilding removes every
   fence that lives **inside** the template. For the site owner that is a right (Joomla is the same: presentation-lock detects
   drift, it does not stop the admin); for the agent it is a hole.
3. **EmDash hooks carry no actor.** `content:beforeSave` (`ContentHookEvent = {content, collection,
   isNew, id}`) does not distinguish the agent from a person in the admin; there is no schema/settings/menu hook;
   `media:beforeUpload` only sees `{name, type, size}`. But EmDash's auth middleware (order `pre`)
   sets `locals.tokenScopes` for requests authenticated by **token** and leaves it empty for an admin **session** — and
   the two token users go through different doors: `tools/personalize.mjs` speaks REST, the agent speaks MCP.

## Decision

Three layers, each with one job, none pretending to be another:

| Layer | Where | Blocks what | Who is subject to it |
|---|---|---|---|
| **L1 allowlist** | `tracy-site-tools/src/host/emdash.mjs` (lane) | structural MCP tools (`schema_*`, `menu_*`, `settings_*`, `plugin_*`, `user_*`, `token_*`, `content_delete`, `*_delete`) → `content_only` + `refusalNext` pointing the way | the agent in chat |
| **L2 ownership** | the template's `Dockerfile` (code owned by root, only `data/`, `uploads/`, `.astro`, `.emdash` owned by www-data) + `requests.mjs` (`site.rebuild` refuses when the image carries `io.tracy.content-only`) | the agent's shell (www-data, `docker exec`) writing to `src/`, `dist/`, `node_modules/`, `tools/`, config and then rebuilding | the agent in the container |
| **L3 template** | `src/lib/content-only.ts` + `src/middleware.ts` (kit → two templates) | a **token-authenticated** request calling MCP `tools/call` with a structural tool → 403 `{code: content_only, next}`; REST and admin sessions pass | every other token path in the future |

- **Why L2 is not in `route.mjs` as in the first draft (measured 25/09):** `/app` of an EmDash site is
  an image layer in the container, **not** under dsh's `/site/<label>`. dsh's file tools (`write`,
  `edit`, `read`) run on dsh's file system, so touching `/app` is already refused by the existing fence ("outside
  the session's site"). The path still open is the **shell**: `tracy-subprocess-docker` runs commands with `docker
  exec -u www-data`, and up to 1.3.0 the Dockerfile gave www-data ownership of all of `/app`. Blocking at the operating system
  (ownership) is the more correct place than a table of path names in dsh, and it changes no line of
  `FS_TOOL_ARGS` (blast map: the fence of EVERY site).
- **Which sites are sealed** is stated by the template itself: image label `io.tracy.content-only=true` (the lane reads it to
  apply the allowlist, the build tool reads it to refuse rebuilds) and `contentOnly: true` in `template.config.json`
  → `artifact.json` (tracy-web reads it so the capability snapshot has `sealed`). No hand-copied flag in
  `quickstarts.json` — the kind of fact that ADR 0017 and `contracts.js` removed because it broke silently.
- The L1 and L3 allowlists have **the same semantics**: read everything; write content (`content_*` except `content_delete`,
  `content_permanent_delete`), media (`media_upload/create/update`), term labels (`taxonomy_update_term`);
  everything else — schema, menu, settings, taxonomy, byline, deletion, and every tool upstream adds later — is refused.
- The refusal code is **one name** in all three layers and in Joomla: `content_only`. `refusalNext` is platform-aware
  so the guidance sentence says `content_update` / `site.inspect` / `site.revert` instead of `content.contract`.
- `inspect` and `revert` for EmDash are a **per-mutation journal** of `personalize.mjs`
  (`data/personalize-journal.jsonl`, `applyId`, `requestId`, `before/after/rev/origin`), not a
  transaction; `revert` refuses when a manual edit came in between (comparing the live `rev` with the `rev` in the journal).
- The site owner turns L3 off with `TRACY_CONTENT_ONLY=off` in the site's environment (provisional decision; a setting
  in the admin is a later step, because a setting is something a token can change over REST).
- **No plugin hook** for L3 in this round: hooks do not know the actor, so they would block real admins too, and every
  token path already goes through the middleware. `tracy-hreflang` remains the native plugin template if needed later.

## Consequences

- The EmDash Business site from 1.4.0 is **content-only** for the agent, on par with Joomla where the customer can see it: from
  chat the schema/menu/settings cannot be changed, entries cannot be deleted, code cannot be edited and rebuilt; text/images can
  be changed, and what can be changed can be rolled back.
- Not on par with Joomla in two places, recorded so nobody assumes otherwise: (1) there is no presentation-lock — the site owner
  editing `src/` is a right, and nobody detects drift; (2) the evidence is the tool's journal; there is no Claude Cowork plugin
  checking at the write door independently of the tool.
- The release's capability snapshot (`quickstart-capabilities.js`) carries `sealed: {by: 'template'}` when the
  `artifact.json` card says `contentOnly: true`, and the capability `feature:content-only`. `/ops` does not draw this mark yet
  (Joomla too only shows the contract profile name in Inventory) — UI work, recorded in the todo.
- The site owner no longer has a path to edit code through Tracy on a sealed site (the agent's shell cannot write code,
  `site.rebuild` refuses). A Rebuild button pressed by the site owner in the Build tab is UI work not yet done,
  recorded in the todo; the plan's provisional decision "fully forbidden from chat" still stands.

## Cost if wrong

- If one day the agent has the PAT in hand (custody changes), L1 and L2 become meaningless, only L3 remains — and L3 blocks by
  MCP tool name, not REST; then L3 must move down to REST or a separate token must be issued for personalize.
- If `locals.tokenScopes` changes semantics in a newer EmDash, L3 opens wide without any error:
  `tests/content-only.test.mjs` pins the assumption "a session has no tokenScopes".
