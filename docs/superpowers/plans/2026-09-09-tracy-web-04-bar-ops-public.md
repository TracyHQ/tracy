# Plan 4/5 — `*.tracy.ai` through `tracy-web`: badge, `/__tracy`, admin gate · `/ops` · public Design inspiration page · 16/16 on dev

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every hostname `<label>.<SITE_DOMAIN>` (and custom domains after go-live) enters through `tracy-web`:
the Tracy badge injected into the customer's page, `/__tracy/team|signin|build|errors`, `robots.txt`/`x-robots-tag`
according to `site.publish`, `/wp-admin` `/administrator` gated by seat, passing guests according to `guest_open` +
quota. `/ops` for staff. `/design-inspiration` public with the model via `MODEL_API_KEY`. At the end of the plan:
**the spec §10 acceptance table (16 items) green on the dev environment** in a real browser.

**Architecture:** One middleware at the start of the app looks at `Host`: equal to `TRACY_ORIGIN` → the existing routes;
`*.SITE_DOMAIN` or a custom domain present in `site.address` → `bar/`. `bar/` carries over `fleet-bar/src/index.js`
(`proxyWithBar` → `proxySite`) — `tracy_*` cookies are **removed** before reaching the site; the target is `http://<label>-web-1`
(docker network, same machine) or `https://<label>.<host>-sites.<zone>` with `x-tracy-edge` (different machine).

**Tech Stack:** as before. Add `packages/web/tracy-harness` built to `dist/` (already exists), `packages/web/tracy-design-page/dist`.

**Spec:** §3 (site traffic), §4.6, §4.8, §10, §11 R3/R10.

## Global Constraints

- All constraints of Plans 1–3.
- Do not carry over `/__tracy/proposals`, `label--slug`, `x-tracy-variant` (proposals are not carried over) — a hostname with `--` → 404 Tracy page.
- `x-tracy-email` is set only by `tracy-web` and is **always** removed from the incoming request before being set again (`fleet-bar/src/index.js:360-380`).
- Locally `SITE_DOMAIN=localhost` (browser) + `SITE_DOMAIN_ALIASES=tracy.test` (containers, Plan 3 Step 2b); `SESSION_DOMAIN` is empty so a `<label>.localhost` page does **not** see the session — the "badge with a seat" part of item 9 is measured on dev; the `/wp-admin` gate part can be measured locally (back to `/login`). Automated tests use a fake `Host`, no DNS needed.
- **Server-side code does not dial `site.address`** — `ensureComponentCustody`, the `apply` probe, and every call to a site use `siteTarget(site, config)`; `site.address` is only for printing to people.

---

### Task 1: Routing by `Host` + `bar/proxy` — customer pages go through `tracy-web`

**Files:**
- Create: `apps/tracy-web/src/bar/route.js`, `apps/tracy-web/src/bar/site-proxy.js`, `apps/tracy-web/src/bar/badge.js`, `apps/tracy-web/test/bar.test.mjs`
- Modify: `apps/tracy-web/src/app.js` (Host middleware first), `apps/tracy-web/src/config.js` (`siteHttpPort` for local: the port `tracy-web` publishes, so that `site.address` = `http://<label>.localhost:8080`; `siteDomainAliases: string[]` from `SITE_DOMAIN_ALIASES`)

**Interfaces:**
```ts
hostKind(hostHeader, config) → { kind: 'tracy' } | { kind: 'site', label } | { kind: 'custom', hostname } | { kind: 'unknown' }
   // label from `<label>.<SITE_DOMAIN>` OR `<label>.<alias in SITE_DOMAIN_ALIASES>` (the port in Host is ignored); `--` in the label → unknown
siteTarget(site, config)            // already exists from Plan 2 T6 — reuse it, do not define it a second time. ⚠ The different-machine branch (`x-tracy-edge` + `<label>.<host>-sites`) has NO receiving side yet — only one host at cutover; record in the journal as outstanding work for when a second host is added
barRoutes({ pool, config, sites }) → Hono     // app.all('/*') when kind ≠ tracy
   /robots.txt (draft → Disallow all; published → pass through)  · x-robots-tag noindex when draft (carried over :75-79, :243-247)
   /__tracy/team · /__tracy/signin/:provider · /__tracy/build · /__tracy/errors (carried over serveTracyPage, serveBuildManifest, servePreviewErrors, serveGoogleSignIn; pages from pages.js carried over to bar/pages.js)
   /__tracy/login (OTP right on the site hostname — carried over serveOtpLogin :933 + emailStep :977): calls identity.store via deps, cookie set with SESSION_DOMAIN (server) — locally (SESSION_DOMAIN empty) this page still runs but the cookie only lives on that hostname
   gate: isCmsBackendPath && !isComponentApiExec && !role → 302 `${config.origin}/login?next=https://<host><path>` (carried over :164-200; role from seats.store.grantFor via deps)
   guest: !email && !site.guest_open → privatePage; guest_open → quota (rate_bucket `guest:<label>:<ip>` per day, carried over bumpCounter worker.js:2637-2652)
   everything else → proxySite: remove tracy_* cookies, set x-tracy-email (when there is a seat) / x-tracy-edge (different machine), fetch, **inject the badge** into the HTML (carried over proxyWithBar :91-253 + badgeTagFor :264)
```

- [ ] **Step 1: Red test** — a fake HTTP upstream returns `<html><body>hi</body></html>`:
  - `Host: lantern.tracy.test` + draft site + no cookie + `guest_open=false` → 200 private page (no proxy);
  - `guest_open=true` → proxy, body has `<script async src="https://tracy.ai/dashboard/badge.js"` **before** `</body>`, header `x-robots-tag: noindex, nofollow`;
  - with an owner cookie → upstream sees `x-tracy-email: o@x.y`, does **not** see `cookie: tracy_sess`;
  - `GET /wp-admin/` without a seat → 302 to `…/login?next=`; with a seat → proxy; `POST /wp-admin/admin-ajax.php?action=claude_cowork` without a seat → proxy (exception);
  - `Host: a--b.tracy.test` → 404; `Host: unknown.tracy.test` → 404 Tracy page, no proxy.

- [ ] **Step 2: FAIL → Step 3: carry over.** `proxyWithBar` injects the badge by reading the HTML body — keep its approach as is (only `text/html` HTML, only when there is a `</body>`), stream the other types.

- [ ] **Step 4: PASS → Commit** — `feat(web): every site hostname enters through tracy-web — badge, robots, the admin gate, guests`

---

### Task 2: `/ops` — admit via the `staff` table, `/api/team`, static SPA

**Files:**
- Create: `apps/tracy-web/src/ops/route.js`, `apps/tracy-web/src/ops/admit.js`, `apps/tracy-web/test/ops.test.mjs`
- Modify: `apps/tracy-web/src/app.js`; `apps/tracy-web/Dockerfile` (COPY `packages/web/tracy-harness/dist` → `/opt/tracy-web/static/ops`); `packages/web/tracy-harness` — `vite.config.ts` `base: '/ops/'` and `dsh-url`/fetch root `/api/team` → `/ops/api/team`? **NO**: keep `/api/team` (already in seats/route), only change `base`.

**Interfaces:**
```ts
admit(c, { pool, config }) → { email, role } | 'sign-in' | null      // carried over shared/admit.js: no session → sign-in; a session not in `staff` → null (403, does not reveal the shape)
opsRoutes({ pool, config, workspaces }) → Hono
   GET /ops, /ops/* → admit → 302 /login?next | 403 | static file from static/ops (index.html fallback)
   /ops/healthz → 200
   /api/ops/team* → carried over harness/src/team.js (teamApi) — calls workspaces.tracyAdmin* via deps
   /ops/invite/:token → carried over harness/src/invite.js (invitation to the Tracy team = /me/team/accept)
```
- [ ] Test: no session → 302 `/login?next=%2Fops`; a non-staff session → 403 with no body; staff → 200 `index.html`; `/api/ops/team` lists the members of `tracy_admin`.
- [ ] `pnpm --filter @tracy/harness-web build` → dist; do **not** commit dist (gitignored? check `.gitignore`; if dist is committed like `lib/client.js`, commit it per RULE #3).
- [ ] Commit — `feat(web): /ops — Tracy's own door on the staff table, the harness SPA served from tracy-web`

---

### Task 3: Public `/design-inspiration` — model via `MODEL_API_KEY`, brand via a guest session

**Files:**
- Create: `apps/tracy-web/src/public/route.js`, `apps/tracy-web/src/public/design-page.js` (carried over `cowork-web/src/design-page.js`), `apps/tracy-web/test/public.test.mjs`
- Modify: `apps/tracy-web/src/config.js` (`model: { apiKey, baseUrl = 'https://openrouter.ai/api/v1', words = 'meta-llama/llama-3.3-70b-instruct' } | null`, `turnstileSecret|null`), `Dockerfile` (COPY `packages/web/tracy-design-page/dist` → `static/design-inspiration`)

**Interfaces:**
```ts
GET /design-inspiration[/…] → static file (publicTarget carried over as is)
POST /design-inspiration/api/read   → apiRead (carried over; fetches the customer page, wordsOf)
POST /design-inspiration/api/words  → apiWords: replace `env.AI.run(WORDS_MODEL, …)` with POST `${model.baseUrl}/chat/completions` (OpenAI shape) — keep `wordsFromModel`/`textOfAnswer`; keep turnstile when there is a secret
*    /design-inspiration/api/brand/* → apiBrand: mint a **guest** session into the dsh of `config.defaultHost` for site `GUEST_SITE_KEY` (config `guestSiteKey`, default `tracy.<SITE_DOMAIN>`), forward (carried over designDshFetch worker.js:3202)
*    /design-inspiration/api/none/* → 404 JSON (carried over)
```
- [ ] Test: `/api/words` with a fake `fetchImpl` returning a completion → JSON `words` as `wordsFromModel` expects; no `MODEL_API_KEY` → 503 `MODEL_NOT_CONFIGURED`; `/api/brand/x` calls the seat door with `grant.role === 'guest'`.
- [ ] Commit — `feat(web): the public Design inspiration page, its model behind MODEL_API_KEY, its brand door on a guest seat`

---

### Task 4: Dev environment = a second compose, and 16/16 in the browser

**Files:**
- Create: `deploy/README.md` (two `.env` sets: `laptop`, `dev`; commands; measurements), `docs/superpowers/plans/2026-09-09-nghiem-thu-16.md` (table of 16 items with result cells)
- Modify: `.github/workflows/build-dsh-image.yml` → rename to `build-images.yml`: three build jobs (`tracy-dsh`, `tracy-web`, `tracy-host`) push to GHCR with the same tag; job `deploy-dev` (runner `tracy-dev`): `docker compose -f /opt/tracy/deploy/compose.yml --profile server pull && up -d` with the dev machine's `.env` (**Plan 5 completes the server profile; in this plan `deploy-dev` can only run after the dev machine has a `.env` — Lee provides it**)

- [ ] **Step 1:** On the dev machine (`<dev-host>`, already has docker, cloudflared, the old `tracy-dsh`): create `/opt/tracy/deploy/.env` from `.env.example` with `TRACY_ORIGIN=https://dev-cowork.tracy.ai`, `SITE_DOMAIN=tracy.ai`, `SESSION_DOMAIN=.tracy.ai`, `HOST_NAME=dev`, `HOSTS=dev`, `HOST_dev_ORIGIN=http://127.0.0.1:8090`, `HOST_dev_DSH_ORIGIN=http://127.0.0.1:51700`, freshly generated secrets; `MAIL=resend:…` (Lee); GitHub/Cloudflare **empty** in the first round. The dev machine's cloudflared ingress: `dev-cowork.tracy.ai` → `127.0.0.1:8080`, `*.tracy.ai`? — **do not change the wildcard DNS in this plan**; use two test hostnames `dev-lantern.tracy.ai` (ingress → `127.0.0.1:8080`, DNS CNAME to the dev tunnel) to measure item 9. Keep `SITE_ADDRESS_PREFIX=dev-` (config: `labelPrefix`).
- [ ] **Step 2:** Run the 16-item table with Claude in Chrome (sonnet subagent, one measurement per item, results written into `nghiem-thu-16.md` with URL/screenshot). Items 10 (go-live), 14, 15 (GitHub) are measured **after** Lee provides the secrets; write "waiting for secret", not green.
- [ ] **Step 3:** Every red item → fix it in this plan (this is Plan 4's main loop), until the 13/13 items that need no secret are green.
- [ ] Commit — `feat(deploy): dev is the same compose with another .env; 13 of 16 measured green in a real browser`
