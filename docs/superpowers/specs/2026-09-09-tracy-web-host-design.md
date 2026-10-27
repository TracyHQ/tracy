# Spec — `tracy-web` + `tracy-host`: seven Cloudflare Workers become two services that run anywhere

- Date: 2026-09-09
- Decided by: Lucas (architecture) · agent (measurement and writing)
- Status: **design approved section by section in conversation, awaiting approval of the whole file**
- Branch: `develop`
- Supersedes: all of `workers/` (7 Workers + `mail` · `seat-door` · `shared`),
  `scripts/hooks/tracy-hooks.{contabo,do}.py`, `scripts/deploy.mjs`, `scripts/services.mjs`
- Kept as is: [`ADR 0014`](../../adr/0014-one-dsh-per-host-commands-in-web-container.md)
  (one dsh per host, `docker exec` through haproxy, the `FS_TOOL_ARGS` fence),
  [`ADR 0001`](../../adr/0001-seat-door-and-enforcement-boundary.md) (the seat ledger says who may do what, the host only
  enforces), [`ADR 0004`](../../adr/0004-dsh-is-the-shell.md) (dsh is the shell), [`ADR 0003`](../../adr/0003-one-sign-in-door.md)
  (one sign-in door)

---

## 0. In one sentence

**Everything Tracy runs outside dsh collapses into two services — `tracy-web` (one, central, n replicas) and
`tracy-host` (one per fleet host) — packaged as images in the same family as `tracy-dsh`, started from one
compose file shared by laptop and server, configured by one `.env` in which an empty variable means
off.** Cloudflare is left as DNS + tunnel only, no longer a place where code runs.

🔒 **Change how it is coded, not what it does (Lucas, 09/09).** Everything that has a caller today — a plugin
in the image, another Worker, a script on a host, or a customer clicking — is **carried over as is**. The only thing
not carried over is what no one calls any more (§8), and it still sits in git waiting for Lee's nod.

---

## 1. Why — measured, not felt

Measured on 09/09/2026 on `develop` (`87cf70f1`):

| Thing | Number |
|---|---|
| Workers + libraries in `workers/` | 7 + 3, **≈25,000 lines** |
| `seat-registry/src/index.js` | **9,219 lines**, one file |
| Of which **no one calls any more** | **≈3,500 lines**: Shopify 1,203 + ~1,800 across 8 modules (CONTEXT.md: "Shopify NOT YET", no entry point), `/api/workspaces` + `/workspaces/:id/{mcp,credentials}` (only the retired SPA / Desk), proposals-try-on (only Desk). ⚠ The first version of this row also put GitHub (967) and workspaces (2,239) here — **wrong**: GitHub is the promise "every site gets a private `TracyHQ/` repo to roll back and number versions" (Lee), workspaces is how an agency is **delegated** on a site (`workspaceGrantFor`, 14 places) |
| Data stores one site passes through | Supabase Postgres (17 tables) · Supabase Auth · 3 KV (20 key prefixes) · R2 · Durable Object · Cloudflare API (DNS, tunnel, Access, worker route) · GitHub App ×2 · Shopify · Resend · S3 |
| Env variable names | `seat-registry` reads **40**; in total **≈60**; `FLEET_ACTOR_SECRET` shared by 5 Workers |
| Kinds of signature for saying "email X has signed in" | **4** (Supabase JWT → HMAC cookie → actor assertion → seat-door HMAC) |
| Listener on the host | **two different Python files**, 806 and 1,223 lines, the README itself says "never been in git" |
| Runnable locally | **0/7** ([`running-tracy-locally.md`](../../references/running-tracy-locally.md) §4) |

Measured consequences: local testing and production testing are two different products (local uses
`dsh-passwords`' SQLite accounts, production uses Supabase + seats); adding a host means editing **six** places
(`FLEET_HOSTS` ×2, `HOST_TUNNEL_ENV`, two `wrangler.toml`, `check-origins.ts`); and no one can answer
"what is production running" by looking at the repo, because three of the seven Workers have an **empty**
version message (`cloudflare-workers.md` §8).

---

## 2. Decision

1. **Two services, not one.** `tracy-web` stands in front of the internet and holds cookies; `tracy-host`
   holds the full docker socket, the site file system, iptables. Merging the two into one process turns a
   request-parse bug into root on the machine that holds every site. Even with only one machine, they are two
   containers in the same compose.
2. **`tracy-host` is a container, not a systemd unit.** The condition for that is dropping
   `mount --bind` (section 5) — this is the only change that touches how a site lies on disk.
3. **Hono + Node 24 + Postgres 16.** Hono because the existing 25,000 lines are written as `fetch(Request) →
   Response` and 1,900 tests (`pnpm test:workers`, measured 09/09 on Node 24) call exactly that shape — carrying over is
   moving, not rewriting. Postgres is Lucas's choice; the **technical** reasons that hold up: `pg_dump`
   from Supabase into the same engine, `pg_advisory_lock` for cron, the `keep_one_owner` trigger carried over as is. The
   "n replicas" reason does **not** yet — a Postgres container on the `tracy-web` machine buys no HA; replicas only mean
   something when Postgres stands outside that machine (§11, the question for Lee). SQLite was weighed and set aside.
4. **Drop Supabase.** It does only two jobs — OTP and OAuth — while the 17 tables are Tracy's. OTP is issued in-house,
   OAuth calls Google/GitHub directly. The existing ledger is exported once with `pg_dump` (same Postgres).
5. **Do not carry over what no one calls; carry over everything else as is.** Not carried over: Shopify (no entry
   point), `/api/workspaces` for the retired SPA, `/workspaces/:id/{mcp,credentials}` and
   proposals/try-on (only Desk calls them). Replace infrastructure, not features: Cloudflare Access app →
   cookie, Durable Object → table, KV → column. **Carried over as is:** GitHub (repo auto-created per site, Release
   onto GitHub, hourly tokens, police webhook, the brand store `TracyHQ/design-inspirations`), workspaces
   (agency delegation + Tracy team), the S3 artifact store (the import path — MinIO locally, R2 on servers). Code not
   carried over stays in git; the list in §8 is what Lee nods through line by line.
6. **Three kinds of domain instead of eleven:** `cowork.tracy.ai` · `*.tracy.ai` · `<host>-agent.tracy.ai`.
7. **No new SPA.** Product UI is dsh plugins (ADR 0004). `tracy-web` only renders a few door pages
   as server-side HTML, and serves the existing `/ops` SPA (`packages/web/tracy-harness`) as static files.

---

## 3. Shape

```
                      cookie tracy_sess (HMAC)                  HMAC (HOST_SECRET)
browser ──────────────► tracy-web ×n ──────────────────────────► tracy-host (per machine)
                        │  Postgres                              │ docker daemon (full socket)
                        │  /login /api /ops /__tracy             │ /srv/tracy-sites  /srv/tracy-private
                        │                                        │ compose up/down · webroot git · go-live
                        │ session proxy (HTTP + WebSocket)       │
                        ▼                                        │ mint / revoke session (seat door, HMAC)
                     tracy-dsh (per machine) ◄───────────────────┘
                        │ /site (rw, mounted ONCE)
                        │ docker exec through docker-proxy (haproxy, 7 requests, only *-web-1)  ← ADR 0014, unchanged
                        ▼
                     <label>-web-1  ·  <label>-db-1   (per site)
```

| Service | Runs where | Holds | Never holds |
|---|---|---|---|
| `tracy-web` | one place, n replicas | Postgres, `SESSION_SECRET`, `MCP_TRACY_ACTOR_SECRET`, and **one pair per host** `HOST_SECRET_<HOST>` · `SEAT_SECRET_<HOST>`, mail/OAuth/S3 keys | docker socket, site file system, Cloudflare keys |
| `tracy-host` | each fleet host | full docker socket, `/srv/tracy-sites` (rw), `/srv/tracy-private` (rw), **its own** `HOST_SECRET`, Cloudflare + tunnel keys | customer cookies, Postgres, `SEAT_SECRET` |
| `tracy-dsh` | each fleet host | `/site` (rw), `docker-proxy`, **its own** `MCP_SEAT_SECRET` | raw docker socket, `/srv/tracy-private` |

**Secrets per host, not pooled** — ADR 0014 §5 chose "one key per HOST" on purpose (blast radius =
one machine), and this spec keeps 0014: leaking one host's env cannot call `/teardown` or mint sessions on another
host. Two pairs per host: `HOST_SECRET_<HOST>` (web → host, HMAC timestamp+nonce — carries over the algorithm of
`seat-door/src/index.js`; a **change** from today's listener, which signs an HMAC of the request body with no nonce, so
`tracy-host` keeps a 120 s in-process nonce store like the gateway) and `SEAT_SECRET_<HOST>` (web →
the host's dsh, exactly `MCP_SEAT_SECRET`, calling `<host>-agent/gateway/seat/*` directly — **`tracy-host`
does not stand in between**). Gone: `FLEET_ACTOR_SECRET`, `FLEET_RELAY_SECRET`, `INTERNAL_TOKEN`,
`RELAY_JWT_SECRET`, `FLEET_BUILD_SECRET`. **Kept:** `MCP_TRACY_ACTOR_SECRET`: `dsh-passwords` reads it
at the `/gateway/tracy` door (direct sign-in for desktop/loopback), and §12 does not change dsh.

**Customer site traffic does not go through `tracy-host`.** `*.tracy.ai` → the `tracy-web` machine's tunnel →
`tracy-web` (badge, `/__tracy`, admin guard — exactly the role of `fleet-bar`) → the site's web container: same machine
→ `http://<label>-web-1` on the docker network; different machine → `https://<label>.<host>-sites.tracy.ai`
— an ingress rule **on that host's tunnel**, written by `tracy-host /address` (as today), an internal
hostname, accepting only requests carrying `x-tracy-edge: HMAC(HOST_SECRET_<HOST>)`. Before forwarding,
`tracy-web` **strips every `tracy_*` cookie** from the request — today `fleet-bar` does not strip them, so site A's
PHP can read the 12 h `tracy_sess` of everyone who passes by (`fleet-bar/src/index.js:155` notes this itself);
this spec closes that hole.

---

## 4. `tracy-web`

### 4.1 Layout — one folder per domain, one `route(app)`, one `store.js`

```
apps/tracy-web/
  src/
    app.js            app.route('/…', …) — the composition order IS the module graph; no other file imports sideways
    identity/         /login /verify /signin/{google,github} /auth/me /auth/signout · OTP · cookie
    seats/            seat ledger: roster · invite · accept · leave · revoke · /api/team · /api/sites (read)
    sites/            site ledger: host map · address · /api/sites (create, delete) · provision via host · artifacts (S3)
    github/           carries over `seat-registry/src/github.js`: host App creates repo `TracyHQ/<label>`, mints
                      one-repo-one-hour tokens, police webhook `/github/push`, `FLEET_SHARED_REPOS` (brand store)
    workspaces/       carries over the WORKSPACE group: agency delegation on a site (`workspaceGrantFor`), Tracy team
                      (`/tracy-admin/*`, `/me/team/*`), roster `/workspaces/:id/seats`
    workspace/        session proxy to the host's dsh: mint seat session, HTTP + WebSocket upgrade
    bar/              badge + /__tracy/* + guard /wp-admin /administrator on *.tracy.ai  (carries over fleet-bar)
    mail/             carries over workers/mail as is — react-email; transport per MAIL=
    ops/              /ops: static SPA + /api/ops/* for staff (carries over harness)
    public/           /design-inspiration/* (static, carries over design-page.js)
    db/               pg pool · migrate() with pg_advisory_lock · migrations/NNN-*.sql
    lib/              hmac.js (session + host call) · html.js (door page frame) · proxy.js (ws)
  test/               node --test, calls app.fetch(new Request(...)) — old shape, old tests
  Dockerfile          node:24-slim, same family as tracy-dsh
```

**Rule held by a test:** `test/module-graph.test.mjs` reads the import graph and goes red when a domain
folder imports another domain folder (only `app.js`, `db/`, `lib/` may be imported across). This is 80%
of what a module framework gives, with 0 dependencies — the reason for not using NestJS is in the 09/09 conversation.

### 4.2 Customer doors (`identity/`)

| Path | What it does | Carried over from |
|---|---|---|
| `GET /login` | email entry page; two buttons if OAuth is configured | `cowork/src` + `fleet-bar/src/pages.js` |
| `POST /login` | issues a 6-digit code, stores it in Postgres (`otp_code`, hash, expires in 10 minutes, 5 attempts), sends mail | new — replaces Supabase's `auth/v1/otp` |
| `POST /verify` | checks the code, sets the `tracy_sess` cookie (`Domain=.tracy.ai`, HMAC, 12h) | `fleet-bar/src/session.js` **verbatim** |
| `GET /signin/{google,github}` · `/signin/{p}/callback` | OAuth code flow, calls the provider directly, `state` in Postgres | replaces `auth/v1/authorize` |
| `GET /auth/me` | `{ email, defaultSite }` — asked by the `seatOnlyTab` plugin | `cowork-web` |
| `POST /auth/signout` | clears the cookie | `cowork-web` |
| `GET /invite/:token` | link in the invitation email: checks the signature, matching email → flips the `seat` row | `cowork-web` `inviteLink` + `shared/team-invite.js` |
| `GET/POST /<label>/team` · `/<label>/join` | a site's team page on the Tracy domain; request a seat (`join-request`) | worker `cowork` |

No accounts/passwords: identity is a proven email, as today. OTP rate limit: an
`otp_attempt` table by email + IP, no Durable Object.

### 4.3 Ledgers (`seats/`, `sites/`) — data model

From Supabase's 17 tables down to **8**:

```sql
account        (id uuid pk, email unique, created_at, last_seen_at)       -- id keeps Supabase's seat.id
identity       (provider, subject, account_id, pk(provider,subject))       -- Google/GitHub with a different email = two people (ADR 0001 §5)
site           (site_key pk, label unique, host, platform, origin, publish, plan, prefix_aware bool,
                guest_open bool, address, repo, repo_creator, created_by, created_at)
               -- repo = `TracyHQ/<label>` (site-registry's SITES `site:` table merged in here)
workspace      (id pk, name, created_at)                                   -- carries over the 5 workspace_* tables as is
seat_workspace (workspace_id, account_id, role, accepted_at, revoked_at, pk(workspace_id,account_id))
workspace_site (workspace_id, site_key, pk(workspace_id,site_key))         -- agency holds the site
workspace_role_policy (workspace_id pk, policy jsonb)
merge_ledger   (site_key, sha, at)                                          -- replaces SEAT_CACHE merge: (police ADR 0068)
               -- origin|publish|plan = the three fields of KV `state:` (fleet-bar reads all three); prefix_aware = KV `prefix:`
seat           (site_key, account_id, role, granted_by, granted_at, accepted_at, revoked_at, pk(site_key,account_id))
               -- role ∈ owner|admin|developer|editor ; trigger keeps ≥1 owner (carries over seat_site_keep_one_owner)
site_role_policy (site_key pk, policy jsonb, updated_by, updated_at)      -- ADR 0001 §3, carried over as is
invite         (token_hash pk, email, role, site_keys[], invited_by, created_at, revoked_at)
staff          (account_id pk, role)                                       -- replaces workspace `tracy_admin`
otp_code       (email, code_hash, expires_at, attempts)
oauth_state    (state pk, provider, next, expires_at)
guest_quota    (site_key, ip, day, count, pk(site_key,ip,day))            -- replaces bumpCounter on KV
job            (id pk, site_key, kind, host, state, log, created_at, updated_at)  -- replaces SEAT_CACHE job:
audit          (id, at, actor, action, site_key, detail jsonb)             -- replaces token_issue/apply_audit
```

The twenty KV prefixes of `FLEET_SITES` flow into columns: `host:` → `site.host`, `label:` → `site.label`,
`prefix:` → `site.prefix_aware` (the flag "image accepts `x-forwarded-prefix`", which decides `mountFor()` —
not a label), `state:` → the three columns `origin/publish/plan`, `attached:` → `job`, `guest:`/`bot:` →
`guest_open` + `guest_quota`. `seat-secret:` disappears (secrets per host, in env). `SITES` (`site:` →
repo) → column `site.repo`. `site_component`/`site_mcp` (Shopify) are not carried over; `token_issue`, `apply_audit`
merge into `audit`. The remaining Supabase tables are carried over with **the same column names** so the export script is `pg_dump` + table renames,
not a mapping pass.

### 4.4 `/api/*` — the contract with dsh plugins, **signatures kept as is**

Plugins call absolute paths (`fetch('/api/sites')`, `/api/team`, `/auth/me` …) — measured 09/09: 14 paths.
They **do not change**, because changing them means editing plugins and losing the goal "local same as server". The preserved list:

`GET/POST /api/sites` · `POST /api/sites/:key/{provision,agent,accept,leave,apply,restore,release,moment}` ·
`GET /api/sites/:key/{jobs/:id,changes,releases,file-diff,viewing-session}` · `PUT /api/sites/:key/component-credential` ·
`POST /api/sites/:key/artifacts/{begin,part,finish,abort,put,fetch,delete}` (§13.2) · `DELETE /api/sites/:key` ·
`GET /api/team` · `POST /api/team/invite` · `PATCH|DELETE /api/sites/:key/seats/:grant` ·
`GET /auth/me` · `POST /auth/signout` · `POST /api/site` · `GET /invite/:token`.

Doors **not** for plugins but with other callers, carried over with the same names: `POST /fleet/git-token` (a host asks for
a one-repo-one-hour token — `lib/relay-git-token.sh` calls it when a Release records to the ledger and when the brand engine pushes
`TracyHQ/design-inspirations`), `POST /github/push` (police webhook, ADR 0068 — attached to every site repo
by `wireFleetRepo`), `/tracy-admin/{overview,whoami,members,sites}` and `/me/team/{invite,accept}`
(`/ops`), `/workspaces/:id/seats[/:id]` (team roster).

Methods and names are those of `cowork-web/src/worker.js:347-411` — the snapshot test in step 2 checks them line
by line, because the first version of this section listed three methods wrong and one door that does not exist (`/record`, only in the retired
SPA). Dropped: `/api/workspaces` (only the retired SPA).

### 4.5 Session proxy (`workspace/`) — the hardest part, done first

Today `cowork-web` proxies every path that is not one of its doors to `HOST_DSH_ORIGIN_<HOST>` after
minting a session through `/gateway/seat/session`. On Node:

- HTTP: `fetch(upstream)` streams the body, copies headers, rewrites `Location`.
- **WebSocket:** `server.on('upgrade')` — **outside Hono** (`@hono/node-server` does not support `upgrade`),
  so everything below must be one module shared by both the HTTP and upgrade branches, not
  middleware: read `tracy_sess`; read the dsh session cookie per (host, site) `tracy_tok_<host>__<scope>`
  and **rename** it to `dsh_gateway_token` before forwarding (carries over `worker.js:158-200`); if missing, mint
  through `/gateway/seat/session` and plant the cookie; `net.connect` to the host's dsh, pipe both ways (already
  running in `dev-fleet.mjs`). The acceptance check is **one real chat session sending and receiving a reply**.
- Choosing the host: `site.host` → `HOSTS` env (`prod1=https://prod1-agent.example.com`). A host not
  in `HOSTS` is 501, like `hostDshFor` today.
- Guest: a site with `guest_open` gets a `guest`-role session minted as today; `seatOnlyTab` unchanged.

### 4.6 Badge and `/__tracy` (`bar/`)

`*.tracy.ai` → tunnel → `tracy-web`. `tracy-web` looks at `Host`, looks up `site.label`, and:

- `/__tracy/team` · `/__tracy/signin/{google,github}` · `/__tracy/build` · `/__tracy/errors` — carried over
  as is; `/__tracy/proposals` **dropped** along with GitHub (§8), hostname `label--slug` (proposal variant)
  → Tracy 404 page.
- The draft's `/robots.txt` and the `x-robots-tag` header per `site.publish` — carried over as is (`:75-79`, `:247`).
- `/wp-admin` `/administrator` guarded by `tracy_sess` + seat; the `admin-ajax.php?action=claude_cowork` exception
  is kept (`:884-895`). ⚠ Today Cloudflare Access is a **second layer, independent of the cookie**, in front of those two
  paths; after this spec only one layer remains. Compensated by: `tracy_*` cookies stripped before reaching the site (§3), and
  `SameSite=Lax` + `HttpOnly` as today.
- everything else is proxied to the site's web container along the §3 path (same machine: docker network; different machine:
  internal hostname on the host's tunnel, signed `x-tracy-edge`). The `x-tracy-email` header is trusted only when the source is
  `tracy-web` — both hops keep that invariant (`tracy-access.php:211-219`).
- Badge injected as today.

### 4.7 Cron

`identity.sweepOtp` (hourly) and `workspace.sweepSessions` (**once a day**, carries over `scheduled()` of
`cowork-web` — cron `17 3 * * *`; it calls each host's `/gateway/seat/sweep`, the third door of the seat
door alongside `session`/`revoke`/`whoami`) run in-process after `pg_try_advisory_lock(…)` — whichever replica
gets it runs.

---

## 5. `tracy-host`

### 5.1 Jobs — carried over from `tracy-hooks.contabo.py`, dropping the Desk part of the DO version

| Door (POST, signed `HOST_SECRET`) | Runs what | Source |
|---|---|---|
| `/provision` | `provision.sh` → job; the payload keeps `gitToken`/`gitRepo` (one-hour token minted by `tracy-web/github`) so the first webroot push to the site repo runs as today | exists |
| `/teardown` | `teardown.sh` (`down --volumes`) | exists |
| `/attach` | **`mkdir` + check** (no more mount) | replaces `attach-site.sh` |
| `/site` | 17 `webroot-*` jobs (`webroot-git.sh` `webroot-edit.sh` `webroot-release.sh` …) | exists, carried over as is |
| `/agent-token` | reads `tracy-private/<label>/tracy-agent.token` | exists |
| `/go-live` | `go-live.sh` (iptables + tunnel + mailer) | exists |
| `/address` | **internal** ingress rule `<label>.<host>-sites.tracy.ai` → the site's port on the host's tunnel (carries over `upsertIngressRule`); **no** per-site DNS (the wildcard covers it), Access app + worker route **dropped** | from `fleetCloudflare.js` |
| `GET /jobs/:id` | status | exists |
| `GET /health` | docker daemon + `/srv/tracy-sites` writable | new |

Dropped: `/github` `/repos` `/reskin` (Desk, only in the DO version). The seat door (`/gateway/seat/*`) is **not**
here — `tracy-web` calls the host's dsh directly (§3).

Image: `node:24-slim` + `docker-cli` + `docker-compose-plugin` + `git` + `rsync` + `bash` +
`iptables`. Bash scripts carried over as is into `apps/tracy-host/scripts/`. **Container privileges:** `go-live.sh`
runs `iptables -I DOCKER-USER` + `netfilter-persistent save` (`go-live.sh:77-86`), so `tracy-host`
needs `network_mode: host`, `cap_add: [NET_ADMIN]`, a mount of `/etc/iptables` — equal to the privileges of `tracy-hooks.py`
running as root today, **not loosened, and also not tightenable** the way a unit with `ProtectHome` is. Because of `network_mode:
host`, it listens on `127.0.0.1:8090` and the host's `cloudflared` points `/_host/*` at it.

### 5.2 Disk layout — replacing `mount --bind` with two roots

```
TODAY                                              PROPOSED
/srv/tracy/<label>/                                /srv/tracy-sites/<label>/            ← = site folder; dsh mounts /srv/tracy-sites ONCE
  .env  tracy-agent.token  (0600)                    AGENTS.md  AgentSetting/  SiteContent/  …
  site/   webroot/   webroot-baseline.git/            .webroot/   ← webroot lives PHYSICALLY inside the site folder (emdash: .webroot/data, .webroot/uploads)
  apache/  compose.yml  work/                       /srv/tracy-private/<label>/          ← NEVER goes into dsh
/srv/tracy-sites/<label>         ← bind → site/       .env  tracy-agent.token  apache/  compose.yml  work/
/srv/tracy-sites/<label>/.webroot ← bind → webroot/   webroot-baseline.git/              ← Changes/Diff/Releases history, OUT of the agent's reach
```

Two invariants of today are **kept as is**, and the first version of this section lost both:

1. **The paths the agent sees do not change**: `/site/<label>` is the site folder, `/site/<label>/.webroot` is the
   running site (`attach-site.sh:143-151`, `render-compose.sh:62-76`). So `.webroot` must
   **lie physically inside** the site folder — not a sibling folder — to drop the bind without changing a single path
   in `siteFolder.mjs`, the seeder, `webroot-git.sh`, `FS_TOOL_ARGS`.
2. **`webroot-baseline.git` out of dsh's reach**: today it lives in `/srv/tracy/<label>/`, deliberately outside the webroot and
   not bound into dsh (`webroot-git.sh:5-7`). Changes/Diff/Releases is a product promise (CONTEXT.md
   §1); a `danger-full-access` agent that can edit the audit history breaks that promise. It goes into
   `tracy-private`; `webroot-*.sh` runs in `tracy-host`, which mounts both roots.

Why the layout can replace the bind: the bind exists so dsh cannot see another site's `.env`/token/history; two
roots buy exactly that boundary through paths. Consequence: `rshared` disappears, and **Docker Desktop on macOS
works**. `render-compose.sh` writes mounts with **absolute host paths** (no more `./site`
— see §6, docker-outside-of-docker); `teardown.sh` deletes both folders; `webroot-*.sh` takes
`SITES_ROOT`/`PRIVATE_ROOT` from env.

**Migrating the 15 sites on prod1 — the order is load-bearing, because `/srv/tracy-sites/<label>` currently IS a mountpoint:**

```
1. docker compose -p <label> down           # containers hold the ./site ./webroot binds
2. detach-site.sh <label>                   # umount .webroot then <label> (reverse bind order), remove 2 fstab lines
3. mv /srv/tracy/<label>/site      /srv/tracy-sites/<label>
   mv /srv/tracy/<label>/webroot   /srv/tracy-sites/<label>/.webroot
   mv /srv/tracy/<label>           /srv/tracy-private/<label>     # .env token apache compose work baseline.git
4. render-compose.sh <label>                # absolute mounts per the new layout
5. docker compose -p <label> up -d          # volume <label>_db untouched
6. docker exec tracy-dsh ls /site/<label>/.webroot   # acceptance, only then move to the next site
```

`mv` within the same filesystem is a rename, not a copy; each site is down for a few seconds.

### 5.3 Security boundary — not loosened compared to today

- `tracy-dsh` **still** goes through `docker-proxy` (haproxy, 7 requests). Not a line changes.
- `tracy-host` holds the full socket — like `tracy-hooks.py` running as root today. It only accepts requests signed with
  `HOST_SECRET` from `tracy-web`, listens on the internal compose network (`tracy-internal`), publishes no port.
  On servers, a `tracy-web` on another machine reaches it **through the tunnel** `<host>-agent.tracy.ai/_host/*` with
  the same signature.
- `tracy-web` has no socket, no site file system, no Cloudflare keys.

---

## 6. Compose — one file, two `.env`

```yaml
# deploy/compose.yml — runs on laptop and on server, differing by .env and by --profile
services:
  postgres:     image: postgres:16-alpine · volume tracy-pg · healthcheck
  tracy-web:    build ../apps/tracy-web · depends_on postgres healthy · ports "${WEB_PORT:-8080}:8080"
                deploy.replicas: ${WEB_REPLICAS:-1}
  tracy-host:   build ../apps/tracy-host · /var/run/docker.sock · /srv/tracy-sites · /srv/tracy-private
                network tracy-internal
  docker-proxy: (carried over as is from dsh/host-dsh.yml)
  tracy-dsh:    (carried over as is from dsh/host-dsh.yml; /site ← /srv/tracy-sites)
  cloudflared:  profiles: [server] · tunnel token from .env
```

🔒 **Docker-outside-of-docker: paths must be ABSOLUTE and THE SAME inside and outside.**
`tracy-host` runs `docker compose up` for sites, but the daemon resolves bind sources **on the host** —
a relative `./site` points into the `tracy-host` container's FS, not the machine's. So
`TRACY_SITES_ROOT`/`TRACY_PRIVATE_ROOT` are absolute host paths (`/srv/tracy-sites`, or
`/Users/x/tracy-data/sites` on macOS), and `tracy-host` mounts them **at exactly those paths**
(`${TRACY_SITES_ROOT}:${TRACY_SITES_ROOT}`) — the same string on both sides, so `render-compose.sh` has nothing
to translate. `cloudflared` (server profile) sits on the host network, pointing `/_host/*` → `127.0.0.1:8090`
and dsh → `127.0.0.1:51700`; `tracy-dsh`'s `DSH_TRUSTED_HOSTS`/`HOST_AGENT_HOSTNAME` are compose
expressions from `HOST_NAME` + `SITE_DOMAIN` in `.env`, not typed by hand. A local site is built with the same
`/provision` (through `tracy-web`, through the UI) — no more separate `dev/` cluster.

### 6.1 `.env` — every empty variable means off

```
TRACY_ORIGIN=http://localhost:8080        # server: https://cowork.tracy.ai
SITE_DOMAIN=localhost                      # server: tracy.ai  → site at <label>.localhost (browser) / <label>.tracy.ai
SITE_DOMAIN_ALIASES=tracy.test             # local: the suffix CONTAINERS use (dnsmasq in compose, §13.4); server: empty
SESSION_DOMAIN=                            # server: .tracy.ai — empty = host-only cookie (browsers reject Domain=localhost)
DATABASE_URL=postgres://tracy:tracy@postgres:5432/tracy
SESSION_SECRET=                            # openssl rand -hex 32
MCP_TRACY_ACTOR_SECRET=                    # dsh-passwords' /gateway/tracy door (desktop/loopback), contract kept as is
HOST_NAME=local                            # name of THIS host (compose renders DSH_TRUSTED_HOSTS from it)
HOSTS=local                                # server: prod1,host2 — each name has the three lines below
HOST_local_ORIGIN=http://host.docker.internal:8090     # that host's tracy-host; server: HOST_prod1_ORIGIN=http://127.0.0.1:8090 (same machine) or https://prod1-agent.example.com/_host
HOST_local_DSH_ORIGIN=http://host.docker.internal:51700 # that host's dsh (seat door)
HOST_local_SECRET=                         # web → host (one per host)
SEAT_local_SECRET=                         # web → the host's dsh (= that dsh's MCP_SEAT_SECRET)
MAIL=console                               # server: resend:re_xxx  (MAIL_FROM separate)
OAUTH_GOOGLE_ID= / OAUTH_GOOGLE_SECRET=    # empty = OTP only
OAUTH_GITHUB_ID= / OAUTH_GITHUB_SECRET=
CLOUDFLARE_TOKEN= / CLOUDFLARE_ZONE= / CLOUDFLARE_ACCOUNT= / CLOUDFLARE_TUNNEL=   # empty = no DNS
MODEL_API_KEY=                             # passed into dsh as today
GITHUB_HOST_APP_ID= / GITHUB_HOST_APP_PRIVATE_KEY_FILE=   # TracyHQ's host App: creates repos, mints tokens, webhook. Empty = site has no repo (local default)
FLEET_WEBHOOK_SECRET=                      # police /github/push
ARTIFACT_S3_ENDPOINT/BUCKET/ACCESS_KEY/SECRET_KEY=        # local: MinIO in compose · server: R2
TRACY_SITES_ROOT=./data/sites              # server: /srv/tracy-sites
TRACY_PRIVATE_ROOT=./data/private          # server: /srv/tracy-private
```

About twenty variables plus three lines per host, replacing ≈60 names across Workers + 3 profile files + ≈20
`host-dsh-init.sh` variables. Locally, empty GitHub means the site has **no repo** — Changes/Diff/Restore still
run on the host's `webroot-baseline.git` (the real history lives there, `webroot-release.sh` says so); only
the **record-to-GitHub-ledger** part of Release is off (`ledger: null`, exactly today's behaviour for a site with no repo). Locally an empty `SESSION_DOMAIN` means the `<label>.localhost` page **does not see
the session** — the badge shows as for someone not signed in, `/wp-admin` can still be guarded (measured: goes to `/login`);
to measure the badge-with-seat case, measure it on dev (§10).

🔒 **Not one production address in code** (Lucas, 09/09): every domain, origin, GitHub org, badge URL
lives in `.env` → `config.js`, and plugins in dsh read them through a public door `GET /api/config`
(`@tracy/core/config`). The `check-origins` gate is rewritten to go red when a `tracy.ai`/`TracyHQ` literal appears
outside `config.js`, `.env.example`, tests and comments — Plan 2 Task 11 lists every file currently in violation. The
variables of `tracy-dsh` (`DSH_TRUSTED_HOSTS`, `DSH_PASSWORDS_ENV_FILE` …) are rendered from here by compose, not
typed by hand.

---

## 7. Identity — from four signatures down to three

```
TODAY     Supabase JWT → tracy_sess (HMAC) → actor assertion (HMAC 60s) → seat-door (HMAC ts+nonce) → dsh_gateway_token
PROPOSED  tracy_sess (HMAC, SESSION_SECRET) ────────────────────────► seat-door (HMAC, SEAT_SECRET_<HOST>) → dsh_gateway_token
                                              ├─ tracy-web → tracy-host: HMAC ts+nonce, HOST_SECRET_<HOST>
                                              └─ tracy-web → /gateway/tracy: x-tracy-actor (MCP_TRACY_ACTOR_SECRET) — kept, because dsh does not change
```

The Worker-to-Worker `actor assertion` disappears because `tracy-web` **is** the seat ledger. The host GitHub App key
(`GITHUB_HOST_APP_PRIVATE_KEY`) stays in `tracy-web`, **never goes down to a host** — a host asks for a one-hour token
through `/fleet/git-token` as today (ADR 0023: "issue the ticket, don't carry the cargo"). The `x-tracy-actor` signature
to `dsh-passwords` is **kept** — it is the contract of the `/gateway/tracy` door (`gateway.ts:2221-2235`)
which §12 does not allow to change. The cookie keeps
exactly today's attributes (`Domain=.tracy.ai`, HttpOnly, Secure, 12h) so `/ops` and `*.tracy.ai`
see the session like `cowork.tracy.ai`.

---

## 8. What is deleted, and the evidence it has no callers

| Delete | Lines | Evidence |
|---|---|---|
| Shopify: `shopify.js` `themeAccess.js` `themeRedirect.js` `previewStore.js` `storefront.js` `storeContent.js` `storefrontDeploy.js` + 36 functions in `index.js` | ≈3,000 | CONTEXT.md §2: no wizard entry point, no verb in `RELAY_ACTIONS` |
| **workspaces — model and delegation CARRIED OVER AS IS**; not carried over: `/api/workspaces` (SPA) and `/workspaces/:id/{mcp,credentials,role-policy/history}` (Desk) | ≈700 not carried over | `workspaceGrantFor` 14 places (agency admin on a site), `/tracy-admin/*` (`/ops`), `/me/team/*` |
| **GitHub — CARRIED OVER AS IS, not deleted** (fixed 09/09 per Lee: "sync every site to a private `TracyHQ/` repo to roll back and version"): `handleCreateRepo` + host App, `/fleet/git-token`, `/github/push`, `wireFleetRepo`, Release ledger, `FLEET_SHARED_REPOS`; `site-registry` merged into column `site.repo` | 0 | has callers: `cowork-web:1916`, `relay-git-token.sh`, `webroot-release.sh --repo`, brand engine |
| Not carried over: `/git/token` + `/auth/link/*` (Desk getting git tokens for client machines), proposals/try-on/`/merge`/`/approve` (`label--slug`, created only by Desk and the joomlart demo) | ≈900 | no caller in the repo or in the image; **Lee nods line by line** |
| `auth-email` Worker | 242 | no Supabase left to call the hook |
| `harness` Worker | 530 | becomes `ops/` |
| Cloudflare Access app, per-site worker route, Durable Object, 3 KV | — | replaced by cookie + wildcard + Postgres |
| R2 used for `STOREFRONTS` (Shopify) | — | goes with Shopify. **R2/S3 for import artifacts is kept** (§13.2) |
| `scripts/deploy.mjs` `services.mjs` `check-origins.ts` `check-seat-door.ts`(Worker part) `.github/workflows/deploy-workers.yml` | — | no Workers left |
| `tracy-hooks.do.py` `tracy-hooks.contabo.py` `tracy-hooks.service` `host-dsh-init.sh` | 2,029 + | becomes `apps/tracy-host` |

Docs to follow: `CLAUDE.md` §1 (the `workers/` map), §5 (the whole Wrangler section), `workers/README.md`,
`cloudflare-workers.md`, `running-tracy-locally.md` §4–§6, `kien-truc-mot-dsh.md` §2.4/§3, `HOST-DSH.md`.
A new ADR (`0015`) records this decision and marks which parts of 0001/0003/0014 still bind.

---

## 9. The path — side by side, cut layer by layer, reversible

Principle: **the old stack keeps running until the new stack is green 13/13 on dev; old servers are not modified.**

| Step | Work | Acceptance |
|---|---|---|
| 1 | `apps/tracy-web` skeleton: Hono, Postgres, migrate, `identity/`, **HTTP + WebSocket proxy** to a local `tracy-dsh` — the seed is `scripts/dev-fleet.mjs` (§13.5) | one chat turn in the browser on `localhost:8080` |
| 2 | Carry over `seats/` `sites/` `mail/` from `seat-registry` (3 groups ✅) + `cowork-web`; carry over tests | the 3 groups' old tests green; `/api/*` returns the right shape (snapshot test) |
| 3 | `apps/tracy-host`: two-root layout, 17 webroot jobs, provision/teardown, seat door | `Add site` from the local UI produces a working WordPress site, agent `ls /site/<label>` |
| 4 | `bar/` `ops/` `public/`; wildcard host; go-live/address (server profile) | 13/13 on **dev** (§10), with Claude in Chrome |
| 5 | Export Supabase → Postgres (`pg_dump` of the seat/site tables, 17→8 map script), migrate the 15 sites on prod1 to two roots (§5.2), turn on `tracy-web`/`tracy-host` **alongside** the Workers | 13/13 on prod1 via the temporary hostname `new-cowork.tracy.ai` |
| 6 | Cut over: DNS `cowork.tracy.ai` + `*.tracy.ai` → new tunnel | 13/13 on the real names; fallback = switch DNS back |
| 7 | After 7 days without falling back: delete the Workers on Cloudflare, Supabase, KV, R2; delete `workers/` from the repo; docs | `pnpm build:check` green with the new gate |

Each step is one PR into `develop`. Steps 5–6 need Lee (DNS, secrets).

**Deploy path after Wrangler retires.** `build-dsh-image.yml` already builds `tracy-dsh` on the runner and pushes to
GHCR; the two new images go with that workflow (three jobs, one tag = `<date>-<commit>`). On a host: `docker
compose pull && up -d` (carries over `deploy-host-dsh.sh` — pull, record the tag, wait for healthy, roll back by itself). The rule "merging
into `main` IS deploying" (CLAUDE.md §5) keeps its meaning: merge → CI builds three images → `deploy` job on the
`tracy-dev` runner runs `compose up` on dev; for production a person runs the same command on prod1.

**The dev environment** (`dev-cowork.tracy.ai`, host `dev`, branch `develop`) is **one more compose set
with a different `.env`** on the existing dev machine — not a different shape. It is where 13/13 must be green in step 4.

**Data fallback after step 6.** From the DNS cut-over on, seats/invitations/new sites are written to Postgres; Supabase stays
still. Switching DNS back after that **loses** whatever was written in that window — accepted, on two conditions: cut over
outside working hours, and keep a 24 h observation window before inviting new customers. No reverse sync (two ledgers, two
schemas — the cost is bigger than what it saves).

---

## 10. Acceptance — 13 customer-visible features, each with one browser measurement

| # | Feature | Measurement |
|---|---|---|
| 1 | Sign-in OTP · Google · GitHub | receive the code (local: in the log), get in; both OAuth buttons land on the right email |
| 2 | Workspace: chat with the agent, model, mode | send "What is this site" → gets a reply; switch mode; URL `/…/s/session-…` |
| 3 | Add a new site · Import an existing site | the new WordPress site opens at `<label>.<SITE_DOMAIN>`; import from a backup runs |
| 4 | My Sites: list, switch, leave | correct seat count; switching site changes workspace; leaving removes it |
| 5 | Team: roster, invite, role, accept, revoke | invite a second email → accept the link → has an `editor` seat; revoke → 403 on the next load |
| 6 | Changes · Diff · Releases · Restore | agent edits a file → Changes has a row; Diff correct; Release seals a milestone; Restore back to the milestone |
| 7 | Apply · component-credential · agent-token | apply writes to the site; credential returned; token matches the file |
| 8 | Design inspiration · Brand | public page 200; Brand tab suggests from a URL |
| 9 | `<label>.tracy.ai`: badge, `/__tracy/team`, `/wp-admin` guard | badge shows; team page; `/wp-admin` without a seat → goes to `/login`. Local: `/wp-admin` measurable with an empty `SESSION_DOMAIN`; badge-with-seat needs `SITE_DOMAIN=tracy.test` + `/etc/hosts` |
| 10 | Go-live draft ↔ live (server) | `--op live` opens mail + tunnel; `--op draft` closes them again |
| 11 | Guest on the landing | anonymous visitor to a `guest_open` site has chat, no Add site |
| 12 | Mail | 8 templates in `mail/src/emails.js`; keep 6 (OTP magic/signup, site invite, Tracy team invite, added to, join request, seat revocation code), 2 go with biz — all arrive (local: log) |
| 13 | `/ops` | staff get in; non-staff → 403 |
| 14 | Private repo `TracyHQ/<label>` auto-created when a site comes up; Release recorded to GitHub (filtered commit + tag + GitHub Release); Restore back to the milestone | server: repo appears in the org, Release vN is on GitHub, `restore-reset` returns to the right milestone. Local (GitHub empty): Release is still numbered on the host, `ledger: null` |
| 15 | Brand engine pushes `Brand/<host>/` to `TracyHQ/design-inspirations` | server: the commit appears; local: skipped when GitHub is empty |
| 16 | Agency: a workspace holds a site → the workspace admin can manage the site roster | invite through `/me/team/invite` into the workspace; that person changes roles on the workspace's site |

Plus two measurements that are not features: **boundary** (site A's agent `ls /site/B` is refused;
a file tool reading `/desk-home` is blocked — `route.mjs`'s tests keep this) and **replicas** (`WEB_REPLICAS=2`,
13/13 still green, cron runs in exactly one replica — counted in the log).

---

## 11. Risks and open questions

| | Risk | Mitigated by |
|---|---|---|
| R1 | **WebSocket proxy** on Node — Workers did it for free | **a working version already exists**: `scripts/dev-fleet.mjs` (`server.on('upgrade')` + `net.connect`, measured 09/09 with a real chat session on 51740). Carry it over to `workspace/proxy.js`, add the cookie check before connecting |
| R2 | **OAuth callback** currently points at Supabase | Lee re-registers the redirect URI at Google/GitHub for `cowork.tracy.ai/signin/*/callback` (+ `dev-`) |
| R3 | **Wildcard `*.tracy.ai`** — today each site has a DNS record pointing at the tunnel of **its host**; a wildcard can point at only **one** tunnel | the wildcard points at the tunnel of the machine running `tracy-web`; `tracy-web` stands in front of **all** site traffic (exactly the role of `fleet-bar` today) and forwards to `<label>-web-1` — same machine via the docker network, different machine via that host's `tracy-host`. A hostname not in `site.label` → Tracy 404 page. A customer's own domain (go-live) CNAMEs to the same place |
| R4 | Migrating the disk layout of 15 sites | site by site, with `docker exec tracy-dsh ls` after each site, `mv` is atomic within one filesystem |
| R5 | Exporting the Supabase ledger 17→8 tables | the script is tested on a real dump; compare seat/site counts before–after |
| R6 | GitHub carried over as is, but **two** Apps exist (`GITHUB_APP_*` for Desk/seats, `GITHUB_HOST_APP_*` for the org) — the first is used only by Desk | carry over the host App; the seat App is not carried over along with `/git/token` — **Lee nods** |
| R7 | Secrets: a new `SESSION_SECRET` = everyone signs in again once | cut over outside working hours; announce |
| R8 | `tracy-host` holds the full socket + `NET_ADMIN` + host network | listens on loopback; accepts only requests signed per host; same privileges as `tracy-hooks.py` as root today, no more — and no less |
| R9 | Ledger export: `seat.id` uuid is the key referenced by `grantFor`, `cowork-session`, audit; OAuth with a different email is two people | `account.id` keeps the uuid; `identity(provider, subject)` separated from email; the map script is tested on a real dump |
| R10 | Proxying customer sites through `tracy-web`: one bug here and every site on the host loses its front door | exactly the radius of `fleet-bar` today (one Worker in front of 24 hostnames); n replicas reduce deploy risk |

Questions for Lee before step 5: R2, R6, tunnel token + zone for `CLOUDFLARE_*`.

**Which machine Postgres and `tracy-web` sit on — decided later, on purpose (Lucas, 09/09).** To the code it is only
`DATABASE_URL` and `HOSTS`; the default until decided: a Postgres container in the same compose on
`prod1`, one replica, a nightly `pg_dump` into `tracy-private/backups`. Moving to a separate machine or a managed one
means changing two `.env` lines, not one line of code — that is why it may be left for later.

---

## 12. Out of scope

- No change to dsh, the `tracy-dsh` image, `docker-proxy`, `FS_TOOL_ARGS`, and **no change to the shape
  `/site/<label>` · `/site/<label>/.webroot`** that the agent, the seeder, `siteFolder.mjs` see (§5.2).
- No change to the `dsh-passwords` contract: the four `/gateway/seat/*` doors, `/gateway/tracy`, `MCP_TRACY_ACTOR_SECRET`.
- Plugins change in only **one** respect: hard-pinned addresses move to `/api/config` (§6.1, Plan 2 Task 11) — behaviour unchanged.
- No change to the signatures of the 14 `/api/*` paths plugins call.
- No billing, no host-selection policy for new sites (still `FLEET_NEW_SITE_HOST` → the first `HOSTS` entry).
- No change to the agent core.

---

## 13. Add site · Import · Fork — how they run locally

Read on 09/09 from `tracy-add-site` (client + host), `cowork-web`, `seat-registry`, `tracy-hooks.contabo.py`,
`provision.sh`, `scripts/dev-fleet*.mjs`. The wizard's three branches are three **different** paths, and
"local" has to be answered separately for each path.

### 13.1 Create new (`origin: create`) — runs fully locally, needs nothing outside

```
wizard ─POST /api/sites {label, platform}─► tracy-web
   1. ledger: valid name? (site-label) · not held by anyone? → INSERT site + seat(owner)    [Postgres]
   2. ─POST /provision {label, platform, fresh, ownerEmail, siteKey}─► tracy-host (signed HOST_SECRET)
                         │ provision.sh --fresh: render compose (web + mariadb, project = <label>)
                         │ compose up · install CMS · siteFolder (AGENTS.md…) · tracy-agent.token
                         │ prints `TRACY_RESULT port=NNNN` → job done
wizard ─GET /api/sites/:key/jobs/:id─► tracy-web ─GET /jobs/:id─► tracy-host   (poll 3s, as today)
   3. job done → tracy-web: UPDATE site.address = <label>.<SITE_DOMAIN>, state = draft
        server: tracy-host /address → DNS + ingress (CLOUDFLARE_* set)
        local : nothing to do — <label>.localhost resolves to 127.0.0.1 in Chrome by itself, no /etc/hosts needed
   4. custody: register the component token through the `apply` door (keeps `ensureComponentCustody`);
      repo: `POST /sites/:key/repo` → host App creates `TracyHQ/<label>`, attaches the police webhook, writes `site.repo`
      (keeps `handleCreateRepo` + `wireFleetRepo`; local GitHub empty → `repoError: NOT_CONFIGURED`, site still completes)
wizard ─POST /api/sites/:key/agent─► tracy-web ─/attach─► tracy-host: mkdir tracy-sites/<label> already exists → ok
   5. mint a seat session into tracy-dsh (SEAT_SECRET) → open `/<siteKey>/` → chat
```

Different from today: **no "server only" step** except (3) DNS. Today the same pass touches KV
`host:`/`state:`/`label:`, Access app, worker route, tunnel — all of it becomes **one `site` row**.

**70% already exists in `scripts/dev-fleet.mjs`** (develop, 09/09): `POST /api/sites` builds real WordPress
**and Joomla** with compose (`composeFor` in `dev-fleet-site.mjs`), installs `pkg_claudecowork`,
reads the `tr_extensions` token, `apply` forwards straight to `com_claudecowork`, polls jobs with the same shape, proxies
WebSocket. What it lacks: the ledger (it answers `/auth/me` with a fixed email), team, import, address, and it
merges web+host into one process. `tracy-web`/`tracy-host` **split and complete it**, not rewrite it.

### 13.2 Import (`origin: import`) — four doors, and a store in the middle

```
wizard ─POST /api/sites {origin:'import', siteKey:'khach.com', platform}─► tracy-web: ledger records the owner
wizard ─POST /api/tracy-add-site/start {adminUrl, username, password}─► the plugin's HOST HALF (inside tracy-dsh)
        │ signs in to the customer site's admin · installs the claude-cowork extension (zip from GitHub releases TracyHQ/claude-cowork)
        │ db.dump: comes to dsh in base64 chunks → gzip → PUT to the STORE with a presigned URL
        │ files.pack: the customer site ITSELF PUTs each part straight to the STORE (multipart, 8 MiB) — bytes do NOT pass through dsh
        │   every presigned URL is requested via: ─POST /api/sites/:key/artifacts/{begin,part,finish,abort}─► tracy-web (SigV4)
        └ handing_over → {webrootKey, dbKey, liveSite}
wizard ─POST /api/sites/:key/provision {platform, webrootKey, dbKey, liveSite}─► tracy-web ─► tracy-host
        │ provision.sh (no --fresh): download webroot.tar + db.sql.gz from the STORE (TRACY_MIGRATE_S3_*) · compose up · import
then exactly as 13.1 steps 3–5
```

**The store is mandatory and cannot be replaced by `tracy-host`**: the extension on the customer site (code in the repo
`TracyHQ/claude-cowork`, installed on the customer's site) **PUTs straight to S3 with a presigned URL** — changing that
means changing the extension on every existing customer site. So:

| | Local | Server |
|---|---|---|
| Store | **MinIO** in compose (`profiles: [local]`), bucket `tracy-artifacts` | R2 (exists), same `ARTIFACT_S3_*` variables |
| Who signs the URL | `tracy-web` (carries over `artifacts.js` — hand-written SigV4, 0 dependencies) | same |
| Can the customer site reach the store? | **only a site that is also local** (a WordPress in the same compose) — a site on the internet cannot PUT into a laptop's MinIO | yes |
| Want to import an internet site from a laptop | set `ARTIFACT_S3_*` = real R2 (read/write one bucket, the only secret that has to be requested) | — |

That is a **physical limit**, not a design shortcoming: bytes travel from the customer's server to the store, and
the store must be somewhere the customer's server can reach. Local import acceptance uses a "customer" site built with
13.1 itself and then imports it again — enough to measure all four doors and the restore branch of `provision.sh`.

One safety catch kept as is: `KEY_NOT_YOURS` — an artifact key must carry the site's own prefix
(`sites/<labelPrefix>/`), checked in `tracy-web` before signing.

### 13.3 Fork (`?fork=<url>`) — it is 13.1 plus the brand engine

The wizard builds a new site (13.1), then opens `/<siteKey>/?fork=<url>`; `tracy-brand-engine` (a plugin, in
dsh) reads the parameter and runs the OpenDesign pipeline on that URL into the site folder's `Brand/<host>/`. There is
no separate Worker door — it runs exactly the same locally, it only needs dsh to reach the internet to download the source page.

### 13.4 What is still *server only*, and how it is turned off locally

| Step | Server | Local |
|---|---|---|
| Public address | wildcard `*.tracy.ai` → the `tracy-web` machine's tunnel; `tracy-host /address` only adds an **internal** ingress rule `<label>.<host>-sites.tracy.ai` when the site is on another machine (§3) | browser: `<label>.localhost:8080` (measured 09/09: Chrome/curl resolve it, Node `ENOTFOUND`, containers do not). Containers (dsh, sites): `<label>.tracy.test:8080` via a static-IP dnsmasq in compose that returns `tracy-web`'s IP; `tracy-web` accepts both suffixes (`SITE_DOMAIN_ALIASES`). Local import enters the source site's admin URL in `.tracy.test` form. The rule that goes with it: server-side code **never dials `site.address`**, only `siteTarget` = `http://<label>-web-1/` |
| Go-live with own domain | iptables egress + mailer + the customer's CNAME | nothing to flip; the door returns `NOT_CONFIGURED` |
| `provision.sh`'s `--access-aud`/`--access-team-domain` | **dropped** (Cloudflare Access retired, §2.5) | — |
| Git push token (`gitToken`/`gitRepo` in the provision payload) | **kept** — `tracy-web/github` mints it, the host pushes the first webroot to `TracyHQ/<label>` | GitHub empty → no token, the push is skipped (exactly today's behaviour) |
| Site port on the host (`HOST_PORT`, `TRACY_RESULT port=`) | still needed for ingress | still allocated, so `tracy-web` can know it without needing it — but the proxy goes by container name, not by port |

### 13.5 The seed: `scripts/dev-fleet.mjs` → two apps

| In `dev-fleet.mjs` | Goes where |
|---|---|
| `server.on('upgrade')` + `proxy()` | `apps/tracy-web/src/workspace/proxy.js` — add the cookie check + host choice by `site.host` |
| fake `/auth/me`, `/login` | replaced by the real `identity/` (13.1 needs no Supabase, so local sign-in is **real**, with OTP printed to the log) |
| `POST /api/sites` + `build(job)` + `nextPort()` + `jobs` Map | split: the ledger part → `tracy-web/sites/`; the `docker compose`/CMS install part → `tracy-host` (replaced by the real `provision.sh --fresh`, so local and server run **the same script**) |
| `dev-fleet-site.mjs` `composeFor` | **dropped** — `render-compose.sh` is the real one, use it; keep the Joomla door tests as tests for `tracy-host` |
| `applyAction` → `com_claudecowork` | `tracy-web/sites/apply` — already the right shape of production's `apply` door |

After this step `dev-fleet.mjs` is deleted; `packages/tools/tracy-subprocess-docker/dev/` (separate compose,
`add-site.sh`, `site.yml`) is deleted along with it — a local site is produced by exactly the button a customer clicks.
