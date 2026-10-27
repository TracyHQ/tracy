# ADR 0036 — Website Opportunities is an independent public repo; Tracy is one builder and the default hub of the shared research store

- **Status:** (binding) — Lee settled it on 24/10/2026 after the council
- **Date:** 24/10/2026
- **Decided by:** Lee (PO), conversation in session salmon 24/10/2026
- **Follows on from:** [ADR 0013](0013-community-brand-store.md) (the community brand store is a public repo, the fleet is a copy) · `tasks/plan-wo-shared-places.md` (a place store shared between deployments, slice 1 already coded; number **0035** is reserved for that line's ADR, to be written after slice 1 runs for real) · `tasks/plan-wo-public-find.md`, `tasks/plan-wo-public-research.md` (Find and Research without a session)
- **ADR number:** 0036, not 0035, because 0035 was already reserved in `plan-wo-shared-places.md` §12.6; the "highest number + 1" rule of `docs/adr/README.md` does not see numbers reserved in a plan.

## Context

Website Opportunities (WO) finds businesses that have no website or whose website needs replacing, researches them, writes a brief, builds a demo and sends an outreach message. Today it lives in three places in TCH:

| Part | Where (VERIFIED on `origin/develop` 3fbfcb948e, 24/10) | Size |
|---|---|---|
| Server: find, research, place store, cost ledger, outreach, demo, handoff, quality, public Find | `apps/tracy-web/src/opportunities/`, `apps/tracy-web/src/public/wo-find-page.js`, `packages/web/tracy-wo-find-page` | 114 files, 35.8k lines + Find page 301 lines |
| Domain (brief, pinned copy, agent prompt, schema) + dsh plugin client | `vendor/tracy/tracy-website-opportunities` (subtree) — home repo `TracyHQ/tracy-website-opportunities`, **private**, `UNLICENSED`, 0.1.9 | `domain/` 6.7k lines |
| Schema | migrations 125 → 166 (`wo_*`) | 21+ files |

Three facts force this decision:

1. **Lee settled on 24/10/2026:** WO becomes an **open** tool so anyone can research and share research; the community optimises it together; Tracy earns money at **building demos, hosting, agent seats**, not at the finding tool. Reason: the users of this tool (freelancers, agencies, web sellers) are exactly Tracy's buying customers; a restaurant never self-hosts.
2. **Lee settled: one codebase and one shared, refined data store.** Tracy runs exactly the open repo's code, keeping no private copy. The shared store holds data refined from many sources (Google, Apify, social, site check); **Lee's legal team has confirmed** (Lee, 24/10) — the repo does not re-check this point.
3. **The current subtree has drifted.** The `IMPORT-NOTE.md` of `vendor/tracy/tracy-website-opportunities` has four items "not yet brought back to the home repo" (23–24/10). The "home repo + subtree copy" arrangement cannot keep "one codebase" at a high rate of change.

The natural, measurable boundary: the **find / assess / reach** layer imports exactly 12 files from tracy-web's `lib/` (session, http, rate, ui-setting, picture-cut…), while only the **demo building** layer touches Tracy's fleet, quickstarts, agents and sites.

## Decision

1. **A new public repo `TracyHQ/website-opportunities`, licence Apache-2.0** (name reserved by Lee on 24/10). The name does not carry "Tracy" (Tracy appears in the adapter and in the "Build demo with Tracy" button, not in the title). Exported from **one clean commit, without TCH history** (the history has Vietnamese docs, internal figures, possibly secrets). Not AGPL: an opportunity-finding tool does not need to block hosting providers; the more users the better, the money is in Tracy.

2. **One codebase — the open repo is a library + bin, not a separate service.** The open repo exports: a Hono router, a tick worker, the `wo_*` schema, the web UI (Find, My opportunities, Place profile), and a `host` adapter interface (Postgres pool, caller identity, rate bucket, object store, cost). `apps/tracy-web` mounts that router with its own host adapter, same DB, same process as today. A standalone bin (`docker compose up`) mounts the same router with a minimal adapter: Postgres, disk or S3, one user. No service split yet: splitting the service at the same time as the repo, the schema, the UI and the trust model is too many variables at once. Importing the router does not start cron or migrations by itself; the worker has `start/stop/drain` and can run as a separate process from the same package, so the crawler and image processing cannot bring down tracy-web's sign-in. Split the service when load measurements prove the benefit (council 24/10). **"One codebase" = every running copy can be reproduced from one public commit; no business patch lives only in TCH.** TCH imports only through public entry points, no deep imports.

3. **Three layers, one `builder` interface in the middle.** `builder` is the contract for long-running work: it takes an immutable brief/snapshot + an idempotency key, has submit/status/cancel, returns a receipt, has versioned errors; it does not take a `pool` or TCH configuration; a timeout must never produce a demo or charge a second time.
   - **Open:** `find` (sources → businesses), `assess` (site check, PageSpeed, social, the "needs a website / needs a replacement" score), `reach` (message templates by channel and language, contact preview), the seller's pipeline (`wo_opportunity`, `wo_job`, cost ledger, brief domain), place store + bundle `tracy-wo-place-bundle/v1` + ingest/export doors, public Find/Research.
   - **Private, in TCH:** `build` (demo-runner, site-build, handoff, revisions, demo-retention, demo-qa, quality-*), the dsh plugin client, `/ops/wo`, operations screens.
   - The open repo defines `builder` and ships a `manual` adapter (exports the brief to a file, marks it "built elsewhere"). TCH registers a `tracy` adapter. Whoever connects Webflow, 10Web or an agency's own building writes their own adapter.

4. **Shared research store: an open protocol, the default hub is Tracy's master.**
   - Protocol = bundle v1 + the existing ingest/export doors (`place-export.js`, `place-import.js`, `place-ingest-door.js`), moved into the open repo. Anyone can host a hub themselves.
   - **One official hub in v1**, the app keeps a local cache; no cross-hub sync. The protocol needs cursors, idempotency, updates, conflicts, revocation tombstones — bundle v1 currently only does an initial load.
   - By default the app points at Tracy's hub. **Reading or writing the hub needs a token tied to a Tracy account**, with a free tier that has a quota. **One token per account; whom the account owner shares the token with is their business** (Lee, 24/10/2026): the hub does not distinguish who holds the token; the quota and responsibility for the data written belong to the account; bad data → lock that token; the account owner rotates the token when it leaks. Per-account quotas exist from the start. A paid tier for the hub (freshness, large queries) is an **idea, not yet settled by the PO**. Hub sign-up does not inherit the beta/seat/JoomlArt gate; a self-hosted WO still researches with its own keys while not signed in to a hub. Quotas are counted by kind of work (cache read, new research request, refresh, images, contribution checks) plus a system-wide budget, because one request can trigger expensive work.
   - **Shared** = business identity (`place_id` + identities from other sources, name, address, industry), assessment (has a website or not, CMS, speed, website age, social), score. **Private to each seller** = the pipeline: contacted, replied, which demo, deal. Never enters the hub.
   - Each value keeps `source`, `fetched_at`, `origin` (the sender), `confidence`; revocation by source (`revoked_at`) and at the business's request (one command, remembered so it is not loaded again). `origin` is currently "self-declared" (slice 1) → it **must** become the token's account before the hub accepts writes from outside.
   - **A token says who sent it, not that the data is correct.** Outside writes go `submit → check → accept evidence → published snapshot`: the hub decides publication itself, not trusting client-declared `confidence`/"verified"/timestamps; identity fields (website, contact) need stronger checks than descriptive fields; new accounts go into a queue or sample checking; many copies from the same source do not count as many pieces of evidence. Images from outside go through an upload door that checks hash and format; nobody outside the hub writes directly to the bucket. Locking a token and withdrawing data already sent are two operations; after withdrawal, the snapshot is recomputed.
   - Research data is **untrusted data** all the way to the brief and the agent: tool permissions are checked in executing code, not by prompt filtering.
   - Freshness: `last_verified`; the app prioritises re-checking old items; distinguishes "not re-checked" from "checked, unchanged".

5. **Community contributions are small plugin files.** Four kinds, each with one interface and one example in the repo: sources (`sources/`), scoring rules (`scoring/`), outreach templates (`outreach/<lang>/`), builder adapters (`builders/`). Strangers only send small PRs.

6. **How TCH consumes the open repo: a submodule that is a workspace member** — precedent `vendor/tracy/deepseek-harness` ([ADR 0006](0006-plugins-as-pinned-subtrees.md), boundary rule §2.1: only npmjs or workspace). Reason for choosing it over npm publish: a fast dev loop (edit in the submodule, test in TCH, push to the open repo first), pin = commit, and edits **must** happen in the open repo so it does not drift like a subtree. Cost: the `git submodule update` trap before committing (already recorded in `CLAUDE.md` §1, blocked by the `pre-push` hook). The council recommended npm because it forces a clean consumer to work; two replacement gates: (a) the submodule pin must be a commit already on the open repo's `main`, (b) the open repo's CI installs the package into a clean consumer (bin, UI, schema, migration). npm publish is added later so outsiders can install without cloning. **Lee settled on the submodule on 24/10/2026.**

7. **The dsh plugin client is not opened yet, it stays in TCH** (Lee, 24/10/2026). It runs inside Tracy's dsh shell, and self-hosters have no dsh. But it is only a **wrapper**: slot wiring, navigation, session, theme, the button that opens a Tracy agent. Business components (Find, place profile, research status, brief, pipeline) live in the open repo and both sides use them — otherwise they become two products that drift apart. The Find page currently imports `PublicFind` from the plugin and `@tracy/ui`, so that part must move to the open repo along with the tokens and translations it needs. The current home repo `TracyHQ/tracy-website-opportunities` is archived: `domain/` + tests go to the open repo; the dsh plugin client goes to TCH's `packages/`, depending on `domain` through the workspace; the IMPORT-NOTE is closed. Opening the client later is a separate decision.

8. **Schema: the open repo owns `wo_*` from an adoption point.** The point = SHA + list of migration file names + checksums + target schema, not a number (develop already has 167 adding an FK to `account`; the migrator works by full file name). Steps: (1) settle which tables/columns belong to WO and which to the build adapter; (2) replace the FK to `account` with a neutral principal, the adapter maps Tracy accounts — an explicit transitional migration; (3) a new DB runs the open repo's baseline; an existing TCH DB continues its history + transition, **checks the schema (column types, nulls, indexes, FKs, triggers) before writing the marker**; (4) from the marker, WO migrations are written by the open repo, and TCH orders them under a lock. The old filtered chain is not carried over. `build`-layer tables stay in TCH migrations, pointing at `wo_opportunity.id`. Tests: new DB, fresh TCH DB, upgrade from a dev copy, re-running the adoption, failure midway.

9. **Existing data:** the prod and dev place stores become the hub; **no** public dump is exported; the community reads through the API with a token.

## Consequences

- **Freeze** `apps/tracy-web/src/opportunities/` for new lines during the Phase 1 window (estimated 3–5 working days) from 24/10/2026 (Lee): #1646, #1670 go in first; #1672 does not wait, its author re-merges after Phase 1; running lines merge first, not cut midway.
- `SYSTEM.md` §8 "Website Opportunities" is rewritten along the three layers; `CLAUDE.md` §1 adds the new submodule to the `git submodule update` trap.
- The crawler and image processing take URLs from outside → block internal networks, cloud metadata, redirects that bypass checks (SSRF). Installed source plugins are privileged code; contributed data never causes the sender's plugin to run.
- The open repo is a **public surface**: README, comments, strings, commits — in English; an equivalent `check-language` gate is copied into the open repo's CI after the build step. `tasks/`, ADRs and the journal stay in TCH.
- Tracy bears the hub's costs (storage, bandwidth, freshness re-checks) and the risk of abuse/poisoning; per-account quotas and token-based `origin` are preconditions before opening writes.
- Google-derived data in the hub: Lee's decision with confirmation from the legal team (24/10); the open repo's README states BYOK clearly — everyone bears the terms of the keys they use — and only Tracy's hub takes responsibility for data Tracy holds.
- npm dependencies of the open layer (imports VERIFIED): `hono` (MIT), `sharp` (Apache-2.0), `tinyld` (MIT); Apify, SerpApi, ScrapeCreators, RapidAPI, PageSpeed go over HTTP, no SDK. Nothing blocks Apache-2.0.

## Council 24/10/2026

Codex `gpt-6-astra` xhigh; question, answers and comparison table in [`tasks/council-wo-opensource-2026-10-24.md`](../../tasks/council-wo-opensource-2026-10-24.md). Lee settled Q2 (submodule) and Q3 (one token per account) differently from Codex, and Q5 (the dsh client stays); Q1 and Q4 follow Codex.

**Acceptance of the first split** (council): a clean machine runs WO without TCH; TCH runs exactly the public commit, with no private patch; one outside contribution is checked, published and then revoked all the way through to the cache and new briefs.

## Out of scope

The hub's paid tier; opening `/ops` or the rest of `tracy-web` (discussed separately, see the conversation of 24/10: JoomlArt is spread over ~90 files, it needs a different cut line); a hosted version of the tool for people who do not want to run a scraper themselves.
