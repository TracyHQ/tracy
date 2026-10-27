# Plan 5/5 — Cutover: export the ledger, migrate 15 sites, profile `server`, DNS, clean up the Workers, docs, ADR 0015

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `cowork.tracy.ai` and `*.tracy.ai` answer from `tracy-web` on `prod1`; 15 sites run in the two-root
layout; the seat/site ledger lives in `prod1`'s Postgres; the seven Workers, Supabase, KV, R2-storefront are off; `workers/`
and every gate/document about Wrangler leave the repo; one ADR records the decision. **The old servers (contabo, DO) are not changed.**

**Architecture:** Cut over per spec §9 steps 5–7: build alongside (`new-cowork.tracy.ai`), measure 16/16, switch DNS, hold for
7 days, clean up. Every step has a fallback until the DNS switch; after that, falling back = switching DNS back and **losing** the writes made in
that window (spec §9, accepted).

**Spec:** §5.2 (migrate), §6 (profile server), §8, §9, §11 (R2, R4, R5, R7).

## Global Constraints

- All constraints of Plans 1–4.
- **Not a single write command to contabo/DO.** Everything is read from them via `ssh … cat`/`pg_dump` or the read-only Supabase API.
- Every step on `prod1` runs through a script in the repo (`deploy/scripts/*.sh`), never typed by hand — the same rule as `deploy-host-dsh.sh`.
- Secrets from Lee (R2, OAuth callback, `CLOUDFLARE_*`, host GitHub App, Resend, tunnel token) are received through a channel outside the chat and put directly into `/opt/tracy/deploy/.env` on `prod1` (`chmod 600`), not through the repo.
- Fixed order: Task 1 → 2 → 3 (build alongside) → 4 (measure) → 5 (cut over) → 6 (7 days) → 7–9 (clean up). No skipping.

---

### Task 1: Export the Supabase ledger → new Postgres — a script tested on a real dump

**Files:**
- Create: `deploy/scripts/export-seat-book.mjs`, `deploy/scripts/test/export-seat-book.test.mjs`, `deploy/scripts/README.md`

**Interfaces:**
```ts
node deploy/scripts/export-seat-book.mjs --from <supabase DATABASE_URL, read-only> --to <new postgres> [--dry-run]
   // reads: seat, seat_site, site (seat-registry's table: platform/repo/creator), workspace, seat_workspace, seat_workspace_site, site_role_policy, workspace_role_policy, token_issue, apply_audit
   // + KV FLEET_SITES (exported first to JSON with `wrangler kv key list/get` — deploy/scripts/dump-kv.sh; read only): host:, label:, state:, prefix:, guest:, attached:, siterepo:
   // + Supabase's `auth` schema: `auth.identities` (provider, provider_id → identity), `auth.users` (email) — `seat` only keeps `supabase_user_id` (schema.sql:13)
   // writes: account (id = seat.id, email), identity (from seat.provider/subject if present), site (site_key, label, host, platform, origin/publish/plan, prefix_aware, guest_open, address, repo, repo_creator), seat, site_role_policy(+history), workspace, seat_workspace, workspace_site, workspace_role_policy, staff (from workspace `tracy_admin`), audit (token_issue + apply_audit)
   // prints a before/after count table per table; --dry-run only counts
```
- [ ] **Step 1:** `pg_dump --schema-only` + `--data-only` of Supabase (Lee provides a **read-only** connection string) into `~/tracy-export/` (outside the repo). `deploy/scripts/dump-kv.sh`: `wrangler kv key list --namespace-id 417e954a…` then `get` each key → `fleet-sites.json` (read; the Cloudflare permission already exists).
- [ ] **Step 2: Red test** — run the script `--dry-run` on a temporary Postgres loaded with that dump: number of `seat` = number of `account`, number of non-revoked `seat_site` = number of non-revoked `seat`, every `host:` in KV has one `site.host`, and **every** `site.label` matches `fleetLabel(site_key)` (Plan 1) — a mismatch is a label bug.
- [ ] **Step 3:** write the script (SQL `insert … select` via `pg` with two pools). `--dry-run` by default; only `--write` writes.
- [ ] **Step 4:** run for real into `prod1`'s Postgres (built in Task 3) — write the count table into `deploy/scripts/README.md`.
- [ ] Commit — `feat(deploy): export the seat book from Supabase and KV into the new Postgres, counted before and after`

---

### Task 2: Migrate one site to the two-root layout — a script, tried on a test site first

**Files:**
- Create: `deploy/scripts/migrate-site-layout.sh`, `deploy/scripts/test/migrate-site-layout.test.mjs`

```bash
migrate-site-layout.sh <label> [--dry-run]
# 1. docker compose -p <label> down            (keep volumes)
# 2. /opt/tracy-fleet/provision/detach-site.sh <label>     (nested umount, delete 2 fstab lines)
# 3. mv /srv/tracy/<label>/site      /srv/tracy-sites/<label>
#    mv /srv/tracy/<label>/webroot   /srv/tracy-sites/<label>/.webroot
#    mv /srv/tracy/<label>           /srv/tracy-private/<label>
# 4. TRACY_SITES_ROOT=/srv/tracy-sites TRACY_PRIVATE_ROOT=/srv/tracy-private /opt/tracy-fleet/provision/render-compose.sh <label>
# 5. docker compose -p <label> -f /srv/tracy-private/<label>/compose.yml up -d
# 6. docker exec tracy-dsh ls /site/<label>/.webroot >/dev/null && curl -fsS http://127.0.0.1:<port>/ -o /dev/null
# Every step checks its preconditions first (mountpoint -q, directory exists), prints, and stops at the first error; --dry-run only prints.
# Fallback (if 6 fails): mv the three directories back, attach-site.sh <label>, up -d — written as `--undo`.
```
- [ ] Test: build a fake temporary tree (`TRACY_SITES_ROOT`/`PRIVATE_ROOT` pointing at `/tmp/x`, `docker`/`mountpoint` faked as bash functions in PATH) → right command order, `--dry-run` does no `mv`, `--undo` reverses.
- [ ] On `prod1`: run for **`dev-lantern`/a test site** first (a site with no customer), check 6, then `--undo`, then run again. Only after that move on to Task 3.
- [ ] Commit — `feat(deploy): migrate one site to the two-root layout — down, detach, mv, render, up, prove; and undo`

---

### Task 3: Build alongside on `prod1` — profile `server`, `new-cowork.tracy.ai`

**Files:**
- Modify: `deploy/compose.yml` (profile `server`: `cloudflared` with `TUNNEL_TOKEN`; `tracy-web` `deploy.replicas: ${WEB_REPLICAS:-1}`; `minio` not on servers), `deploy/.env.example` (server block), `deploy/README.md`
- Create: `deploy/scripts/install-prod1.sh` (idempotent: creates `/opt/tracy/deploy`, `/srv/tracy-sites`, `/srv/tracy-private`, `git clone`/`pull` of the repo at `/opt/tracy/src` pinned to a tag, `docker compose --profile server pull`, `up -d`)

- [ ] **Step 1:** Lee: `new-cowork.tracy.ai` CNAME → `prod1`'s tunnel (the tunnel already exists, `prod1-agent.tracy.ai` uses it); ingress: `new-cowork.tracy.ai` → `127.0.0.1:8080`; **two** test hostnames `lantern.tracy.ai`/`fijitrips-example-5254d120.tracy.ai`? — **do not touch real sites' DNS at this step**; add `new-<label>.tracy.ai` for a test site. R2 bucket `tracy-artifacts` + keys; OAuth callback adds `https://new-cowork.tracy.ai/signin/*/callback` (alongside the old callback); host GitHub App: install `ID` + `.pem` into `/opt/tracy/deploy/`; Resend key; `CLOUDFLARE_TOKEN/ZONE/ACCOUNT/TUNNEL`.
- [ ] **Step 2:** server `.env` on `prod1`: `TRACY_ORIGIN=https://new-cowork.tracy.ai`, `SITE_DOMAIN=tracy.ai`, `SESSION_DOMAIN=.tracy.ai`, `HOST_NAME=prod1`, `HOSTS=prod1`, `HOST_prod1_ORIGIN=http://127.0.0.1:8090`, `HOST_prod1_DSH_ORIGIN=http://127.0.0.1:51700`, `SEAT_prod1_SECRET` **= the `MCP_SEAT_SECRET` currently in `/srv/tracy/host-dsh/home/dsh-passwords.env`** (unchanged, so existing sessions survive), `TRACY_SITES_ROOT=/srv/tracy-sites`, `TRACY_PRIVATE_ROOT=/srv/tracy-private`, `TRACY_DSH_HOME=/srv/tracy/host-dsh/home`, `DSH_IMAGE=ghcr.io/tracyhq/tracy-dsh`, `DSH_IMAGE_TAG=<tag currently running>`.
- [ ] **Step 3 — load-bearing order (changed after review):** (a) `install-prod1.sh --no-dsh` → postgres · tracy-web · tracy-host · cloudflared (container, `TUNNEL_TOKEN`) come up; **stop the host's `systemctl stop cloudflared`** right after the cloudflared container is healthy — one tunnel, one connector, remote ingress is the single source of truth; (b) Task 1 writes the ledger; (c) Task 2 migrates the **15 sites** (the OLD dsh still runs with the old bind — `detach` of each site makes the old dsh lose that site's `/site/<label>` for a few seconds, accepted); (d) `docker compose -f /opt/tracy-fleet/dsh/host-dsh.yml down` (keep `/desk-home`) then `install-prod1.sh` brings up the new `tracy-dsh` with **the same image tag** — plain `/srv/tracy-sites` mount, no rshared, and by now every site is in the new layout so there is no dangling bind. **One dsh restart**, done off-hours. Copy `MCP_TRACY_ACTOR_SECRET` from the old Worker's secret (`wrangler secret` cannot be read — get it from `.dev.vars`/Lee) into `.env` so desktop does not lose `/gateway/tracy`. Fallback before (d): `migrate-site-layout.sh --undo` for each site + `systemctl start cloudflared` + `compose down`; after (d): `host-dsh.yml up` again with the old `/srv/tracy-sites` — written as `deploy/scripts/rollback-prod1.sh`, tried once on a test site.
- [ ] **Step 4:** Task 1 writes the ledger into `prod1`'s Postgres. Task 2 migrates the **15 sites** one by one (list from `docker compose ls`); after each site: `curl` the old address `https://<label>.tracy.ai/` (still served by the `fleet-bar` Worker + old ingress) returns 200 **same as before** — because the webroot only moved, the container still publishes the same port.
- [ ] Commit — `feat(deploy): the server profile — cloudflared, replicas, install-prod1.sh`

---

### Task 4: Measure 16/16 on `new-cowork.tracy.ai`

- [ ] Run the acceptance table (Plan 4 Task 4, file `nghiem-thu-16.md`) on `new-cowork` with Claude in Chrome: item 9 on `new-<label>.tracy.ai`; item 14 (repo + Release) on the test site; item 10 go-live on the test site with a domain Lee provides; item 16 agency with Lee's real workspace.
- [ ] Every red item → fix (PR into `develop`, `deploy-dev` + `install-prod1.sh --update`). Do not move to Task 5 while anything is red.

---

### Task 5: DNS cutover

- [ ] **Step 1 (before cutover time):** `tasks/nhat-ky-main.md` entry "cut over to tracy-web at HH:MM, fallback = switch DNS back, writes in that window are lost". Freeze: `wrangler secret put FREEZE=1`? — **do not modify the Worker** (main is frozen); instead notify Lee, pick an off-peak time.
- [ ] **Step 2:** Lee/agent switches DNS and ingress, **in order**: (1) via the `prod1` tunnel API: **delete every existing `<label>.tracy.ai → 127.0.0.1:<port>` ingress rule** (cloudflared picks the first matching rule — leaving them means `<label>.tracy.ai` goes straight to the site, bypassing `tracy-web`: no badge, no admin gate, **the `tracy_sess` cookie leaks into PHP**), then add `cowork.tracy.ai → 127.0.0.1:8080` and `*.tracy.ai → 127.0.0.1:8080` before the final 404 rule; (2) DNS: `cowork.tracy.ai` CNAME → `prod1` tunnel; `*.tracy.ai` CNAME → `prod1` tunnel; **delete the 14 per-site DNS records** — they shadow the wildcard; (3) `TRACY_ORIGIN` on `prod1` → `https://cowork.tracy.ai`, `compose up -d tracy-web`. Record all three old states (ingress rules, DNS records, origin) in `deploy/scripts/rollback-dns.md` **before** switching. ⚠ The seat cookie `tracy_tok_<host>__<scope>` changes name because the dsh origin changes (`prod1-agent.tracy.ai` → `127.0.0.1:51700`): the first load re-mints it, harmless — don't chase it by mistake.
- [ ] **Step 3:** Re-measure the 13 items that need no secret on the real names, within 30 minutes. Red → **fall back**: switch the three DNS lines back as before (old values recorded in Step 1), `TRACY_ORIGIN` back to `new-cowork`.
- [ ] **Step 4:** Write the result into the journal. Start counting 7 days.

---

### Task 6: 7 days of observation

- [ ] Every day: `docker compose ps` healthy; `docker logs tracy-web --since 24h | grep -c ' 5[0-9][0-9] '`; number of dsh sessions; one real Add site + Release. Any fallback → reset the count.

---

### Task 7: Turn off the old infrastructure (after 7 days)

- [ ] Cloudflare: delete the 7 Workers (`wrangler delete` one by one, **from the old `main`** — `git worktree add /tmp/main main`), delete the `fleet-bar` routes ×24, delete the Access apps ×3, delete the KV namespaces ×3 (`SITES`, `SEAT_CACHE`, `FLEET_SITES`) after a final `dump-kv.sh`, delete R2 `tracy-storefronts` (Shopify), **keep** R2 `tracy-artifacts`. Supabase: turn the project off after a final `pg_dump`. Remove the seat GitHub App (`GITHUB_APP_*`); keep the host App.
- [ ] On contabo/DO: **do not touch** (Lucas). Record in the journal the list of containers/sites still running there, to clean up later.
- [ ] Commit the journal.

---

### Task 8: Clean up the repo

- [ ] **Before deleting `workers/`:** five `apps/` tests import Worker code as witnesses (P1:T3 `fleet-bar/session.js`, P1:T4 `seat-door`, P1:T7 `fleet.js`, P2:T2 the copies, P2:T4 `shared/team-invite.js`, interop) — **freeze** the expectations: run them once, record the witness values (token, signature, label, URL) in `apps/tracy-web/test/fixtures/legacy.json` with the source commit, and switch the tests to compare against the fixture. Then delete: `workers/` (all of it), `scripts/deploy.mjs`, `scripts/services.mjs` + `scripts/test/services.test.mjs`, **keep** `scripts/check-origins.ts` (rewritten in P2:T11 — only drop the old declared list if still present), the Worker-scanning part of `scripts/check-seat-door.ts` (keep the `vendor/tracy/dsh-passwords` scanning part if any), `scripts/test/seat-door-interop.test.ts` → move into `apps/tracy-web/test/`, `.github/workflows/deploy-workers.yml`, `packages/fleet/tracy-fleet-operation/scripts/hooks/`, `dsh/host-dsh-init.sh`, `dsh/host-dsh.yml` (replaced by the shared compose), `dsh/deploy-host-dsh.sh` (logic moved into `install-prod1.sh --update`), `provision/attach-site.sh`, `detach-site.sh`, `scripts/tools/*.timer|*.service`, `apps/tracy-web/test/ported.test.mjs`, `packages/web/tracy-frontend` (the SPA is retired — check that no bundle lists it).
- [ ] Fix: `scripts/check-all.ts` (drop two gates, add an `apps-module-graph` gate running `node --test apps/*/test/module-graph.test.mjs`), `scripts/check-language.ts` `SCAN_DIRS` drop `workers`, `scripts/check-push.mjs` `TESTED_TREES` add `apps/`, `package.json` `test:workers` → `test:apps` (rename and update every caller: `CLAUDE.md`, the `check-push.mjs` hook, CI).
- [ ] `pnpm build:check` green. Commit — `chore: the Workers, their deploy path and their gates leave the tree`

---

### Task 9: Docs and ADR 0015

**Files:**
- Create: `docs/adr/0015-hai-dich-vu-thay-bay-worker.md`
- Modify: `CLAUDE.md` (§1 map: `workers/` → `apps/` + `deploy/`; §5 the whole Wrangler section → "Deploy = CI builds three images → `install-prod1.sh --update`"; §6 gate table; blast map: `apps/tracy-web/src/workspace/proxy.js` replaces `fleet-bar/src/session.js`), `CONTEXT.md` (the line mentioning `seat-registry`), `docs/references/cloudflare-workers.md` (→ becomes "What is left of Cloudflare: DNS, tunnel, R2 artifacts"), `running-tracy-locally.md` (§4 "seven Workers" → "one compose", §6 four levels → one level), `kien-truc-mot-dsh.md` (§1.2, §2.4, §3), `HOST-DSH.md` (host-dsh-init/deploy-host-dsh → shared compose), `workers/README.md` (delete), `docs/README.md` (`pnpm docs:index`), `tasks/nhat-ky-main.md`
- ADR 0015 following the template in `docs/adr/README.md` §5 (number = highest + 1 — **re-check the folder when writing**, `main` may already have published a different number): Context (measurements from spec §1) · Decision (the 7 points of spec §2) · Accepted costs · Options rejected (one app; keep Workers merged into 3; Nest) · What it overrides (which § of ADR 0003, 0014 §5 kept, `tracy-infra` 0023/0049 the relay part) · Not concluded (which machine Postgres is on; multiple hosts).
- [ ] `pnpm docs:check-links && pnpm docs:index && pnpm build:check` green. Commit — `docs: ADR 0015 — two services replace seven Workers; every document that named a Worker now names the compose`

---

## Self-check (all 5 plans) against the spec

| Spec | Plan/Task |
|---|---|
| §2.1–2.7 decisions | 1.T1–9 (Hono/Postgres), 3.T1 (separate host), 3.T2/T5 (layout), 2.T9 (no Supabase), 5.T7–8 (deletion), 5.T5 (domain), 4.T2–3 (no new SPA) |
| §3 per-host secret, seat door from web, site traffic | 1.T2/T8, 2.T5, 4.T1 |
| §4.1 layout, import graph | 1.T9, 2.* |
| §4.2 customer doors (OTP, OAuth, invite, team pages) | 1.T6, 2.T4, 2.T9 |
| §4.3 data | 2.T1 |
| §4.4 `/api/*` contract + doors not for plugins | 2.T4–T8, 2.T10 |
| §4.5 proxy | 1.T8 |
| §4.6 bar | 4.T1 |
| §4.7 cron | 2.T9 |
| §5 host, §5.2 layout + migrate | 3.T1–T5, 5.T2 |
| §6 compose/.env | 1.T5/T9, 3.T5, 5.T3 |
| §7 identity | 1.T3–T4, 2.T5 |
| §8 not carried over | Global Constraints Plan 2; 5.T8 |
| §9 seven steps | 1–4 (steps 1–4), 5.T3–T8 (5–7) |
| §10 16 items | 4.T4, 5.T4 |
| §11 risks | R1 1.T8 · R2 5.T3 · R3 4.T1 · R4 3.T2/5.T2 · R5 5.T1 · R6 2.T7 · R7 5.T5 · R8 3.T5 · R9 2.T1/5.T1 · R10 4.T1 |
| §12 out of scope | no plan touches dsh/plugin/`FS_TOOL_ARGS` (3.T2 only parameterises scripts) |
| §13 local | 3.T5 (including DNS `*.tracy.test`), 4.T1 |
