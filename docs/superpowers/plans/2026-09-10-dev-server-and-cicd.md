---
description: Set up a dev environment for the new architecture (tracy-web + tracy-host + tracy-dsh via compose) on the dev machine that runs the CI runners, and wire CI/CD into it — a measurement of the machine as it stands, the list of env values required, nine tasks.
sources:
  - deploy/compose.yml
  - deploy/.env.example
  - deploy/scripts/check-local.sh
  - .github/workflows/build-dsh-image.yml
  - .github/actions/deploy-host-dsh/action.yml
  - docs/superpowers/plans/2026-09-09-tracy-web-05-cutover.md
---

# Dev server + CI/CD for the new architecture

> **For agents:** use `superpowers:subagent-driven-development` to run this plan.

**Goal:** `dev-cowork.tracy.ai` is served by the **new architecture** (`apps/tracy-web` +
`apps/tracy-host` + `tracy-dsh` in one compose file), and **every push to `develop` goes live
there by itself** — nobody has to ssh into the machine to deploy.

**Not in this plan:** the production cutover. That is
[`Plan 5`](2026-09-09-tracy-web-05-cutover.md), and it waits for dev to run stably first.

---

## 0. The machine as it stands — measured 10/09, not recalled

Machine: **`<runner-host>`** (the old CI/dev server that `CLAUDE.md` §6 mentioned at the time).

| | |
|---|---|
| OS · CPU · RAM | Ubuntu 24.04.4 · **8 cores** · **23G** |
| Disk | 290G, 111G used — **179G free (39%)** |
| Docker | 29.8.0 |

**What is ALREADY there, and why this machine was chosen:**

- **Three CI runners** are running (`<runner>-1`, `-2`, `-3`) from the runner compose file on the host.
  Runner 01 carries the label `tracy-dev` — meaning **a deploy job runs RIGHT ON the target machine**,
  with no ssh key, no secret to carry across, no second way in.
- **`tracy-dsh` + `tracy-docker-proxy` are running and healthy** — this machine is already on the
  ADR 0014 architecture (one dsh per host), not one dsh per site.
- **`/srv/tracy-sites`** already exists, with three dev sites already in the new layout: `dev-beacon`,
  `dev-t-wordpress`, `dev-customer-example-<hash>`.
- **cloudflared is running** — `dev-cowork.tracy.ai` resolves to a Cloudflare IP, so ingress goes
  through that tunnel. The tunnel config is a **token, not a file** (`/etc/cloudflared/` holds only
  `token`), so adding a hostname is work on the Cloudflare dashboard, not on the machine.
- `/opt/tracy-fleet/{dsh,hooks,lib,provision,tools,web,webroot}` — the fleet scripts are already in place.

**What is NOT there YET:**

- `tracy-web` and `tracy-host` — no image yet, no build job, no deploy job.
- **`/srv/tracy-private` does not exist yet.** The new two-root layout requires it, and the old
  `/srv/tracy` still holds copies of the three sites — Task 3 cleans that up.
- No Postgres, no MinIO on the machine. Both come up in the same compose.
- Ports **8080, 8090, 5433, 9002 are all free** (8081/8082/8084 are the three dev sites, 51700 is
  dsh, 8091 is `tracy-hooks.py`). No port has to move.
- **Nothing listens on :80 or :443** — no reverse proxy. The tunnel is the only way in.

---

## 1. Env — what is generated, what Lucas must provide

🔒 **Secrets travel by file or ssh pipe, not through chat and not into the repo.** The target file
is `/etc/tracy/tracy-web.env` on the dev machine, `chmod 600`, and `deploy/compose.yml` reads it with
`--env-file`.

### 1a. Generated on the machine — NO need to ask anyone

`openssl rand -hex 32` for each line. There is no "right" value; it only has to be long enough and
not repeated:

| Key | What it guards |
|---|---|
| `SESSION_SECRET` | signs the session cookie |
| `MCP_TRACY_ACTOR_SECRET` | the `/gateway/tracy` door of dsh-passwords |
| `HOST_dev_SECRET` | tracy-web → tracy-host |
| `SEAT_dev_SECRET` | tracy-web → dsh's seat door (**must equal the `MCP_SEAT_SECRET` that dsh baked into `dsh-passwords.env`** — see Task 4) |
| `FLEET_WEBHOOK_SECRET` | guards `/github/push` |

### 1b. Derived from the machine itself — no need to ask

`TRACY_ORIGIN=https://dev-cowork.tracy.ai` · `SITE_DOMAIN` · `SESSION_DOMAIN` ·
`HOST_NAME=dev` · `HOSTS=dev` · `HOST_dev_ORIGIN=http://tracy-host:8090` ·
`HOST_dev_DSH_ORIGIN=http://tracy-dsh:8080` · `TRACY_SITES_ROOT=/srv/tracy-sites` ·
`TRACY_PRIVATE_ROOT=/srv/tracy-private` · `TRACY_DSH_HOME=/srv/tracy/host-dsh/home` ·
`DATABASE_URL` (Postgres in the same compose) · `TRACY_EGRESS_FENCE=on` (a Linux machine HAS
iptables — unlike the laptop).

⚠ **`SITE_DOMAIN` is a real question, not something to fill in for form's sake** — see §2, "Must
settle".

### 1c. Already on the machine, reuse it

`/etc/tracy/hooks.env` holds `TRACY_MIGRATE_S3_{ENDPOINT,BUCKET,ACCESS_KEY,SECRET_KEY}` — exactly
the four values `ARTIFACT_S3_*` needs. Read them in place, no need to ask for them again.

`MODEL_API_KEY`: `prod1` keeps it in `/desk-home/.credentials.yaml` of `tracy-dsh` (the `refs:`
section, in lowercase). Pull it over an ssh pipe as was done for the laptop on 10/09.

### 1d. **LUCAS MUST PROVIDE** — cannot be derived, cannot be generated

| Key | What happens without it | Required? |
|---|---|---|
| `MAIL` | `console` = mail is written to the log; anyone who can read the log can sign in. `resend:re_xxx` = real mail. | **Should have.** With dev behind Cloudflare Access, `console` is acceptable; opened to outsiders, it is not. |
| `OAUTH_GOOGLE_ID` · `OAUTH_GOOGLE_SECRET` | the Google button disappears, OTP still works | Not required |
| `OAUTH_GITHUB_ID` · `OAUTH_GITHUB_SECRET` | the GitHub button disappears, OTP still works | Not required |
| `CLOUDFLARE_TOKEN` · `_ZONE` · `_ACCOUNT` · `_TUNNEL` | go-live returns `501 NOT_CONFIGURED`; sites get no custom domain | Not required to build; **required to measure the domain feature** |
| `GITHUB_HOST_APP_ID` + private key file | created sites get no repo; the job returns `repoError: NOT_CONFIGURED` | Not required |

**OAuth callback**: if Google/GitHub are turned on, those two apps must add
`https://dev-cowork.tracy.ai/signin/<provider>/callback` to their redirect list — work on the
provider's dashboard, Lucas does it.

---

## 2. Must settle before starting

**The domain of sites on dev.** On the laptop it is `<label>.tracy.test`. On dev it must be a
**real** name that Cloudflare resolves, because the session cookie must cover **both** the app
surface **and** every site hostname — otherwise the site owner gets "Private copy" on their own site
(measured 10/09 on the laptop, and that is why the laptop dropped `.localhost`).

That means: `dev-cowork.tracy.ai` and `<label>.<SITE_DOMAIN>` must **sit under the same parent
domain**, and `SESSION_DOMAIN` is that parent domain. Two ways:

| | `SITE_DOMAIN` | `SESSION_DOMAIN` | Cost |
|---|---|---|---|
| A | `dev-sites.tracy.ai` | `tracy.ai` | The cookie covers **all of `tracy.ai`**, production included. Not advisable. |
| B | `dev.tracy.ai`, app moves to `cowork.dev.tracy.ai` | `dev.tracy.ai` | The cookie covers only the dev branch. Clean. In exchange: `dev-cowork.tracy.ai` becomes an old name and a redirect must be kept. |

### ✅ SETTLED (Lucas, 10/09): stay on `tracy.ai`, separate by PREFIX and COOKIE NAME

Option B dies on SSL, and Lucas saw it before I did: **Cloudflare's Universal SSL only covers
`tracy.ai` + `*.tracy.ai` — one level.** `*.dev.tracy.ai` is two levels, not issued for free, and
the `tracy.ai` zone is on the **Free plan** (looked up with `CF_API_TOKEN_DEV`, 10/09). Advanced
Certificate Manager opens that path but costs $10/month.

⚠ The **Worker already knew this since 07/09 and wrote it down** — `workers/seat-registry/src/index.js:1159`:
Cloudflare *"refuses even the TLS handshake for a two-level SNI, returning no certificate at all"*.
The same wall, measured twice, three days apart.

So:

| | Value on dev | Why |
|---|---|---|
| App | `dev-cowork.tracy.ai` | one level — Universal SSL already covers it, keeps the name in use |
| Site | `dev-<label>.tracy.ai` | one level — same reason. The `dev-` prefix is **added by the machine**, not typed by a person |
| `SESSION_DOMAIN` | `tracy.ai` | must cover both the app and site hostnames |
| Cookie name | has a dev-specific suffix | **this is what keeps production safe** — see below |

🔒 **`SESSION_DOMAIN=tracy.ai` means dev's cookie IS ALSO SENT TO production.** The signature uses a
different secret, so production mistakes no one for someone else — but **identical cookie names**
are a real problem: the browser sends two `tracy_sess` to `cowork.tracy.ai`, and
`sessionFromCookieHeader` takes the FIRST MATCH. Signing in to dev can silently kick out your own
production session, sometimes yes, sometimes no. Renaming the cookie for dev is what blocks exactly
that: production meets an unknown name and ignores it completely.

**Lucas will buy a separate domain for dev later, to separate them fully.** The design below must
make that move a *two-line env change*: drop the prefix, remove the cookie suffix. It must not
become a code change.

---

## Global Constraints

- **Do not touch the three running dev sites** (`dev-beacon`, `dev-t-wordpress`,
  `dev-customer-example-<hash>`) until Task 7, and Task 7 has `--undo`.
- **Do not touch the three runner containers.** This machine is the CI of the whole repo; killing a
  runner blinds every PR.
- Secrets: a `chmod 600` file on the machine, or a GitHub Environment secret. Not through chat, not
  into git.
- Comments in code files (`.sh`, `.yml`, `.env*`) are written in **English**; docs and plans in
  **Vietnamese** (`CLAUDE.md` §7).
- Each task ends with a measurement **that runs**, not a claim.

---

### Task 0a: `SITE_ADDRESS_PREFIX` — port from the Worker; this is what blocks the whole plan

**Files:** Modify `apps/tracy-web/src/config.js`, `apps/tracy-web/src/sites/route.js`,
`apps/tracy-web/src/seats/route.js`; Test `apps/tracy-web/test/sites-route.test.mjs`.

`seats/route.js:298` currently returns `addressPrefix: ''` with a comment admitting it is not wired
yet. Without it, a dev site named `foo` gets the address `foo.tracy.ai` — **exactly the hostname of
a production site with the same name**.

The rule is already written at `workers/seat-registry/src/index.js:1149-1164`; copy it over,
reasoning included:

- **The prefix goes into the ADDRESS, not into the name people type.** The user types `báo-cáo`,
  dev issues `dev-báo-cáo.tracy.ai`, and `siteLabelRefusal` still judges exactly the name they typed.
- **ONLY the `create` branch.** An `import` site carries the CUSTOMER'S address — adding a prefix
  there renames someone else's domain.

- [ ] **Step 1:** red test first — `create` with `SITE_ADDRESS_PREFIX=dev-` must produce siteKey
      `dev-<label>.<domain>`; `import` with the same env must NOT change; `/api/sites` must return
      the correct prefix instead of `''`.
- [ ] **Step 2:** wire into `config.js`, `sites/route.js`, `seats/route.js`.
- [ ] **Step 3:** ⚠ **check that `hostKind` matches back.** `bar/route.js:58` strips the label out of
      the hostname; for `dev-foo.tracy.ai` it yields `dev-foo`, and the bar door must find EXACTLY
      that site. Write a test that goes the full loop: create a prefixed site → call bar with its
      real Host → get the right site. This is the most fragile spot of this task.
- [ ] **Step 4:** `.env.example` + `env-example` gate green. Commit.

---

### Task 0b: Cookie name suffix — what keeps production from being kicked out by dev

**Files:** Modify `apps/tracy-web/src/config.js`, `lib/session.js`, `workspace/route.js`,
`identity/oauth.js`, `identity/route.js`, `bar/route.js`; Test `apps/tracy-web/test/session.test.mjs`.

Three cookies must take a suffix from **one** env key (`COOKIE_SUFFIX`, empty = the names as today,
so production does not change a single byte):

| today | on dev |
|---|---|
| `tracy_sess` | `tracy_sess_dev` |
| `tracy_site` | `tracy_site_dev` |
| `tracy_oauth_state` | `tracy_oauth_state_dev` |

`tracy_tok_*` (seat tickets) **stays out**: it already carries the dsh origin and siteKey in its
name, so dev and production cannot collide.

- [ ] **Step 1:** red test first: with `COOKIE_SUFFIX=_dev`, `sessionCookie()` issues the new name,
      and `sessionFromCookieHeader` **cannot** read a cookie carrying the old name (if it can, the
      suffix blocks nothing).
- [ ] **Step 2:** wire it. Note that `sessionFromCookieHeader(cookieHeader, secret)` does not take
      `config` yet — add a parameter, don't build a global variable.
- [ ] **Step 3:** the whole tracy-web test suite green, without editing a single old test to make it
      green.
- [ ] **Step 4:** commit.

---

### Task 1: `deploy/compose.server.yml` — the overlay for a real machine

**Files:** Create `deploy/compose.server.yml`; Modify `deploy/.env.example`.

The laptop has `compose.macos.yml`; a real machine needs its own overlay, **the opposite in almost
every respect**: `tracy-host` GOES BACK to `network_mode: host` (go-live's iptables and the sites'
loopback ports are both in the real host namespace — on Linux `host` means exactly what it says); no
`dns-host` (real DNS resolves `SITE_DOMAIN`); the `dns` service **off** (`profiles` does not include
`server`); `TRACY_EGRESS_FENCE=on`.

- [ ] **Step 1:** write `compose.server.yml`, each difference with a comment saying **why**, not
      **what**.
- [ ] **Step 2:** `docker compose -f compose.yml -f compose.server.yml --profile server config`
      on the laptop — only checks syntax and interpolation, no `up` yet.
- [ ] **Step 3:** commit.

---

### Task 2: `deploy/scripts/check-server.sh` — preflight for a real machine

**Files:** Create `deploy/scripts/check-server.sh`.

Same spirit as `check-local.sh` (each failing check names **exactly one switch to turn on**), a
different list: does iptables have the `TRACY-FLEET-EGRESS` chain · `/srv/tracy-sites` and
`/srv/tracy-private` exist and are absolute · `TRACY_DSH_HOME` has a seeded profile · ports
8080/8090/5433/9002 are still free · `tracy-dsh` is running and **its `MCP_SEAT_SECRET` matches
`SEAT_dev_SECRET`** (Task 4) · the tunnel is running.

- [ ] **Step 1:** write the script. **Step 2:** `bash -n`. **Step 3:** run it on the dev machine,
      paste the full output into the report — red parts included. **Step 4:** commit.

---

### Task 3: The two-root layout on the dev machine

**Files:** no repo change; this is work on the machine, recorded in `tasks/`.

`/srv/tracy-sites` already has three sites. `/srv/tracy-private` does not exist yet, and the old
`/srv/tracy` still has copies.

- [ ] `mkdir -p /srv/tracy-private`, permissions like `/srv/tracy-sites`.
- [ ] With **one** site first (`dev-beacon`): move its private part to `/srv/tracy-private/dev-beacon`,
      `render-compose.sh`, `up -d`, then measure whether the site still answers. If broken, move it
      back.
- [ ] The other two sites, after the first one has held steady for **a day**.
- [ ] Record it in `tasks/nhat-ky-main.md`.

---

### Task 4: Secrets on the machine — and the `MCP_SEAT_SECRET` trap

**Files:** no repo change.

🔒 **dsh's `entrypoint.sh` reads `MCP_SEAT_SECRET` EXACTLY ONCE** — when it first writes
`/desk-home/dsh-passwords.env` — and **never writes it again**. `tracy-dsh` on this machine has
already run, so that file already exists with a value baked in. Set `SEAT_dev_SECRET` to anything
different from that value and **the seat door silently refuses every request**, with nothing
reporting it.

- [ ] Read the baked value: `docker exec tracy-dsh sh -c 'grep ^MCP_SEAT_SECRET= /desk-home/dsh-passwords.env'`.
      **Empty** is also an answer — it means the seat door is wide open, and the file must be fixed
      and dsh restarted.
- [ ] Write `/etc/tracy/tracy-web.env` (`chmod 600`) per §1, with `SEAT_dev_SECRET` set to exactly
      that value.
- [ ] `ARTIFACT_S3_*` read from `/etc/tracy/hooks.env`. `MODEL_API_KEY` pulled from `prod1` over an
      ssh pipe.
- [ ] Measure: `grep -c '^[A-Z]' /etc/tracy/tracy-web.env` and a list of **key names** (no values)
      to compare against `.env.example`.

---

### Task 5: Build by hand once, before there is CI

**Files:** no repo change.

CI is not the place for first-time debugging. Build the two images in place, `up -d`, run
`check-server.sh`.

- [ ] `docker compose -f compose.yml -f compose.server.yml --profile server up -d --build`
- [ ] `check-server.sh` all green.
- [ ] **Measure end-to-end, the exact chain measured on the laptop:** sign in → create a WordPress
      site → **`tr_*` tables exist** → **a webroot snapshot of thousands of files** (not 0) → the
      site owner can open it → an anonymous visitor gets 403. Paste the real numbers.

---

### Task 6: Point the tunnel at the new stack

**Files:** no repo change; config on the Cloudflare dashboard.

- [ ] Add the hostname (per §2) → `http://localhost:8080`, **next to** the old rule, not overwriting it.
- [ ] If option B is chosen: `*.dev.tracy.ai` points there too.
- [ ] Measure from **outside** the machine: `curl -sS https://<hostname>/api/config` returns JSON
      with the right `origin`, `siteDomain`, `sitePort`.

---

### Task 7: Turn off the old hooks — only after Tasks 5 and 6 are green

**Files:** no repo change.

`tracy-hooks.py` (port 8091) is the surface of the old system. Stop it, measure for 24 hours, then
remove it. There is a fallback: `systemctl start` it again.

---

### Task 8: CI — build `tracy-web` and `tracy-host` the way dsh is built

**Files:** Modify `.github/workflows/build-dsh-image.yml` (or split out
`.github/workflows/build-app-images.yml`).

`build-dsh-image.yml` **already has the template**: build → GHCR → deploy job on the runner labelled
`tracy-dev`. The two new images take that same path. **No new infrastructure, no new secret** —
`GITHUB_TOKEN` is enough to push to GHCR.

- [ ] All three images share one `tag` (the commit sha), so "which version is dev running" has
      **one** answer.
- [ ] Keep the existing workflow's "ask the registry what it stored" and "pull the full image" steps
      as they are — they catch half-finished pushes.

---

### Task 9: CD — `.github/actions/deploy-tracy-stack`

**Files:** Create `.github/actions/deploy-tracy-stack/action.yml` + `deploy-tracy-stack.sh`;
Modify the workflow to call it after `build`.

Following the `deploy-host-dsh` template exactly: **all the real work lives in the `.sh` file**; the
action only brings the image over. The reason is written in the header of
`deploy-host-dsh/action.yml` and still holds: *a deploy that can only be run by pushing to GitHub is
a deploy nobody can read on the night it breaks halfway.*

- [ ] `compose pull` → `up -d` → **wait for healthy** → `curl /api/config` → on failure **go back
      to the previous tag** (`DSH_IMAGE_TAG_PREVIOUS` already has a template in
      `/etc/tracy/host-dsh.env`).
- [ ] `environment: name: dev` so GitHub records who deployed which version.
- [ ] Measure: push a harmless commit to `develop`, watch it go live by itself, and `curl` sees the
      new commit.

---

## Order, and why

1–2 can be written right away, without touching the machine. 3–4 are prerequisites of 5. 5 must be
green before 6 (don't point a domain at something that isn't running). 7 comes a day after 6. 8–9
come last: **automating something never once done successfully by hand is automating something
nobody understands.**

---

## Results — measured 11/09/2026, after the run finished

The LIVING document for this machine is [`docs/references/may-dev.md`](../../references/may-dev.md).
The section below only says where the plan veered off, and why.

### Decision changed midway: A SEPARATE DOMAIN, not a prefix

Lucas bought `tracy.site` (settled 11/09), so §2 of this plan no longer applies. `SITE_ADDRESS_PREFIX`
stays in the code — it is the only way to build a deployment **lodged in** a zone that already has
sites — but it is **empty on both deploys**. A separate zone does what a prefix cannot: it separates
`SESSION_DOMAIN` too, so dev's cookie no longer covers production.

Along with that: **nothing touches the `tracy.ai` zone.** Task 6 meant to cut `dev-cowork.tracy.ai`
over to the new stack; that is no longer needed, and the Worker architecture's dev surface keeps
running as is. Task 7 (turning off `tracy-hooks.py`) is therefore not due yet either — the three old
dev sites are still served by it.

### Status of each task

| Task | Status |
|---|---|
| 0a `SITE_ADDRESS_PREFIX` | done (`33676020`), and turned out not to be used on dev |
| 0b cookie name suffix | **dropped** — Lucas decided it is not needed; the separate zone already separates the cookie |
| 1 `compose.server.yml` | done (`00e552b9`), plus two follow-ups measured on the real machine |
| 2 `check-server.sh` | done, then **rewritten** (`81d52738`, `e30e0434`) — the first version assumed the server was a checkout |
| 3 two-root layout | done for NEW sites (`/srv/tracy-private`); the three old sites left as they are under `/srv/tracy` |
| 4 secrets on the machine | done — 51 keys, 0600 |
| 5 build by hand | done, and went the full way: sign in → create a WordPress site → site served at `devsmoke1.tracy.site` |
| 6 tunnel | done, but for `tracy.site` rather than cutting over `dev-cowork.tracy.ai` |
| 7 turn off old hooks | **not yet** — the three old sites still live on it |
| 8 CI | done (`d0c04f9f`) |
| 9 CD | done — real deploys have run many times |

### Seven bugs found by ACTUALLY RUNNING it, none visible from the code

Only listed here; the full reasoning is in the commit messages and in `may-dev.md`.

1. `HOST_dev_ORIGIN=http://127.0.0.1:8090` — inside a container `127.0.0.1` is the container itself.
2. dsh is in a different compose project and publishes on loopback → tracy-web cannot reach it (`compose.server.yml`).
3. `SAFE_ARG` has no `+` → every customer using a Gmail address with a plus sign cannot create a site.
4. The sign-in mail dropped the six-digit code from the SUBJECT LINE compared with the production version.
5. Port allocation asks `ss`, and `ss` **is not** in the image → it allocates a port another site is using.
6. `iptables` fails for lack of NET_ADMIN, and the error reads as "missing chain" → points at the wrong fix.
7. The site address is written with a hard-coded `http://` → `copyUrl` hands the customer a URL with the wrong protocol.

Five of the seven are **fail-open or fail-silent**: the cluster reports healthy across the board,
because each healthcheck only probes its own port. That is why `check-server.sh` now has a check that
calls from **inside** the tracy-web container out to its two targets.
