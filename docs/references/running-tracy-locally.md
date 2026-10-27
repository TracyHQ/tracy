---
description: Run ALL of Tracy on one machine with deploy/compose.yml — bootstrap, deploy/.env, signing in without mail, site domain names, adding/importing sites, what is off locally, and the traps that really bit.
sources:
  - deploy/compose.yml
  - deploy/compose.macos.yml
  - deploy/.env.example
  - deploy/scripts/check-local.sh
  - deploy/scripts/otp.sh
  - apps/tracy-web/src/sites/label.js
  - packages/fleet/tracy-fleet-operation/dsh/Dockerfile
  - packages/fleet/tracy-fleet-operation/scripts/tools/stage-cms-seeder.sh
  - apps/tracy-web/src/config.js
  - apps/tracy-web/src/identity/otp.js
  - apps/tracy-web/src/mail/transport.js
  - apps/tracy-web/src/public/config-door.js
  - apps/tracy-web/src/bar/route.js
  - apps/tracy-web/src/sites/route.js
  - apps/tracy-web/src/lib/local-releases.js
  - apps/tracy-host/src/config.js
  - packages/fleet/tracy-fleet-operation/scripts/provision/quickstart.py
  - packages/site/tracy-site-build-core/src/client/claim-session.mjs
  - packages/fleet/tracy-fleet-operation/scripts/provision/provision.sh
  - packages/fleet/tracy-fleet-operation/web/IMAGE_TAGS
  - packages/fleet/tracy-fleet-operation/web/build.sh
  - packages/fleet/tracy-fleet-operation/scripts/provision/enable-site-mail.sh
  - docs/adr/0014-one-dsh-per-host-commands-in-web-container.md
---

# Running Tracy locally

The whole system runs in **one compose file** (`deploy/compose.yml`), seven services, on one
laptop. No more Cloudflare Worker, no calls to `seats.tracy.ai` or `hooks.tracy.ai` — **no
dependency on any Tracy server**. Measured 10/09: sign in → create a new WordPress site → the site's two
containers come up → the site is served at `docsite2.tracy.test:51710`, all on this machine.

Every figure, error message and symptom in this file was **measured**, not inferred.

---

## 0. Seven services, and who talks to whom

| Service | What it is | Where people touch it |
|---|---|---|
| `tracy-web` | The front door: sign-in, seat ledger, proxy into dsh, **and every site's hostname** | `http://tracy.test:51710` |
| `tracy-host` | Runs the site-building scripts (`provision.sh`, webroot, go-live) | not directly |
| `tracy-dsh` | dsh — the shell the agent lives in (ADR 0014) | through `tracy-web` |
| `docker-proxy` | Filters the Docker API for `tracy-dsh` | no |
| `postgres` | Seat ledger, sessions, jobs | `127.0.0.1:51730` |
| `minio` | Artifact store (webroot copies on import) | `127.0.0.1:${MINIO_PORT}` |
| `dns` | dnsmasq: `*.tracy.test` → `172.30.0.10` (`tracy-web`) **for containers** | no |
| `dns-host` | A SECOND dnsmasq: `*.tracy.test` → `127.0.0.1` **for macOS itself** (only `compose.macos.yml`) | through `/etc/resolver/test` |

**On macOS there are EIGHT services, not seven** — `dns-host` exists only in `compose.macos.yml`. Two
dnsmasqs because one name cannot have two answers in the same resolver, while containers must
hear `172.30.0.10` and macOS must hear `127.0.0.1`. Details in §6.

`tracy-web` is the front door of **both** `tracy.test:51710` **and** `<label>.tracy.test:51710`. A site
has no ingress of its own locally; `tracy-web` itself routes by the `Host` header.

---

## 1. Bootstrap — done once

**Node ≥ 22.19, or ≥ 24.** Not a preference: `tsdown` needs Node to strip TypeScript types itself, and
so does the test suite. On Node 22.13, **four test files die at load time** with
`ERR_UNKNOWN_FILE_EXTENSION: ".ts"`, and **none of their tests are counted** — so the total test count
drops with no red line. A shifting total test count is as alarming as a red test.

```bash
node --version          # must be ≥ 22.19 or ≥ 24
npm i -g corepack@latest && corepack enable pnpm
```

Then **in exactly this order** (reason in `CLAUDE.md` §5):

```bash
git submodule update --init
pnpm dsh:build
pnpm install
```

⚠ **The first step needs an SSH key, on purpose — do not edit `.gitmodules`.** `vendor/tracy/deepseek-harness`
is a **second** private repo; CI's `GITHUB_TOKEN` cannot read it, so every workflow checks out
with `submodules: false` and then fetches it with a **read-only deploy key over SSH** (`tracy-ci.yml`, step *Fetch the
vendored dsh submodule*). Switching the URL to https turns every workflow red, at a step reporting an error about the
`presets` gate that says nothing about the submodule.

On a machine without an SSH key, **switch the protocol for this clone only**, one line, then re-run the commands above:

```bash
git config --local url."https://github.com/".insteadOf "git@github.com:"
```

Switch the **protocol**; do not pin `submodule.<path>.url`: the path has already moved once
(`vendor/` → `vendor/tracy/`), and a pin under the old path stays behind in `.git/config` pointing at
nothing. `pnpm dsh:build` prints this very command when it sees an empty submodule.

**Then build the two SPAs — this step CANNOT be skipped, and skipping it breaks in two different ways.**

```bash
pnpm --filter @tracy/harness-web build     # → /ops
pnpm --filter @tracy/design-page build     # → /design-inspiration
pnpm --filter @tracy/wo-find-page build    # → /find (the public Find page, no sign-in needed)
pnpm --filter @tracy/docs build            # → the docs host root (DOCS_ORIGIN, required; /docs/* on another host → 302 to it)
node scripts/gen-ops-cms-snapshot.mjs --out apps/tracy-web/static/ops-cms   # → /ops/cms (reads git, writes JSON)
```

The third line generates the **configuration snapshot** for the `/ops/cms` screen — one JSON per environment (`dev` = `origin/develop`,
`main` = `origin/main-v3`), read from git right on this machine because the image deliberately has no `.git`. Without it the image still
builds green, but `/ops/cms` shows an empty Environment box and "This build shipped no configuration snapshots" —
measured 15/09 on this very stand. `check-local.sh` Check 5b catches it.

⚠ **The `/ops/cms/quickstarts` page is NOT in that snapshot** — it reads the releases on
`JoomlArt-Products/ja-products` at run time (ADR 0017). A dev machine has no GitHub App key, so set
**`TRACY_RELEASES_GITHUB_TOKEN`** in `deploy/.env` (fine-grained, `Contents: read` on exactly that repo).
Without it: the page still opens, the table is empty, and it states the reason plainly instead of pretending there are no quickstarts.

`apps/tracy-web/Dockerfile` COPYs those two packages' `dist/` straight into the image, and both `dist/` are
**gitignored** — a clean clone has neither. Not built yet → `docker compose up --build` dies at
a COPY line that names only the path, not the cause. But the more expensive failure is **built
but stale**: a `dist/` built before `vite.config.ts` had `base` writes absolute addresses
`/assets/…`, the image accepts it normally, `/ops` returns **200 with a blank page body** — its scripts and CSS
fall into the catch-all of `workspace/route.js`, get steered by the `tracy_site` cookie into one site's dsh proxy,
then 404. Measured 10/09: staff signed in, document 200, `#root` never mounts, not
one error line in the console or the logs. `deploy/scripts/check-local.sh` has checked exactly this since 10/09
(Check 5) — it reads the addresses `dist/index.html` asks for, not merely whether the directory exists.

**Then build the `tracy/dsh:dev` image — compose does NOT build it for you, and the seeder must be staged FIRST.**

`tracy-dsh` in `deploy/compose.yml` only has `image: tracy/dsh:dev`, no `build:` — it
expects an image already on the machine. A clean clone has none, and `check-local.sh` only says
`No such image` at the very `up` step. Two commands, in exactly this order (measured 14/09 on a blank machine: reversed,
`COPY packages/fleet/tracy-fleet-operation/dsh/cms/` dies with `not found`, because `cms/` is a gitignored build
output — CI runs exactly these two steps in `build-dsh-image.yml`):

```bash
packages/fleet/tracy-fleet-operation/scripts/tools/stage-cms-seeder.sh
DSH_COMMIT=$(git ls-tree HEAD vendor/tracy/deepseek-harness | awk '{print $3}')
DOCKER_BUILDKIT=1 docker build --build-arg DSH_COMMIT="$DSH_COMMIT" \
  -f packages/fleet/tracy-fleet-operation/dsh/Dockerfile -t tracy/dsh:dev .
```

The image comes out at ~5.8 GB (dsh from source + Playwright's three browsers); the first build takes about ten minutes. The log
has a few dozen `ERROR:dbus/bus.cc` lines — Chromium complaining about no dbus while smoke-testing during the
build; that is noise, `exit 0` is the answer.

**The sites' web images — `check-local.sh` builds them for you (Check 8), but you must know they exist.**

The web container of every WordPress/Joomla site runs `tracy/web-wordpress:*` / `tracy/web-joomla:*`
(list: `packages/fleet/tracy-fleet-operation/web/IMAGE_TAGS`) — the base image plus the agent's
tools: **chromium, node**, git, rg, jq. They are built on the very machine running the sites, not pulled from a
registry, so a blank machine has none. Missing, provision **reports no error**: a new site comes up normally
on the base image (`wordpress:php8.3-apache`), with only a warning line in the provision log — and
the agent tells the customer *"screenshots cannot be used on this site (the container has no browser)"*. Measured
27/09 on the Studio stand: site `r1w1734` ran the base image, the dev machine ran
`tracy/web-wordpress:php8.3-apache-20260923-r1` with `/usr/bin/chromium`.

`check-local.sh` calls `DEFAULTS_ONLY=1 web/build.sh` before `up`: it only builds the **two** images new sites
receive (the `wordpress=` and `joomla=` lines), and only when missing — the first time ~5 minutes per image, later
times a few seconds. The other ten lines (other PHP versions, for imported sites) take ~5 minutes and ~2.5 GB each, so
the dev machine does not prebuild them. To build by hand:

```bash
DEFAULTS_ONLY=1 bash packages/fleet/tracy-fleet-operation/web/build.sh   # the two default images
bash packages/fleet/tracy-fleet-operation/web/build.sh wordpress         # every PHP version of one platform
```

⚠ **A site created BEFORE the image existed stays on the base image** — building the image does not move sites. Move each
site to the `IMAGE_TAGS` line with the same PHP version (only the web container is recreated; DB and webroot are untouched):

```bash
docker exec tracy-tracy-host-1 bash /opt/tracy-fleet/provision/enable-site-mail.sh --label <label>
docker exec <label>-web-1 sh -c 'command -v chromium node'   # must print two paths
```

**And one `sudo`, exactly once, so macOS can resolve site names:**

```bash
sudo mkdir -p /etc/resolver && printf 'nameserver 127.0.0.1\nport 5354\n' | sudo tee /etc/resolver/test
```

Verify right after — and **do not verify with `dig`**, see §9 trap #6:

```bash
dscacheutil -q host -a name anything.tracy.test    # must print ip_address: 127.0.0.1
```

The reason, and why the file is named `test` and not `tracy.test`: §6. `check-local.sh` Check 6 checks it
for you and prints exactly this command if it is missing. This is the only step in the whole document needing `sudo`, and it is
done exactly once per machine.

---

## 2. Docker Desktop — two settings

1. **Enable host networking**: Settings → Resources → Network. `check-local.sh` checks it by probing
   a port that is surely closed: it must get *Connection refused* (a TCP stack, nobody listening), not
   *Network unreachable* (no route).
2. **RAM ≥ 6 GB.** One WordPress site is two containers, plus Tracy's seven services.

---

## 3. `deploy/.env`

```bash
cp deploy/.env.example deploy/.env
```

Then fill it in. Four groups, and each group breaks in a different way.

### 3.1 Secrets — generated, not made up

```bash
openssl rand -hex 32     # for each key below, a DIFFERENT value per key
```

| Key | Used by |
|---|---|
| `SESSION_SECRET` | signs users' session cookies |
| `MCP_TRACY_ACTOR_SECRET` | `tracy-web` signs calls made on behalf of a person |
| `HOST_local_SECRET` | `tracy-web` → `tracy-host` |
| `SEAT_local_SECRET` | `tracy-web` → `tracy-dsh`'s seat door (= dsh's `MCP_SEAT_SECRET`) |

### 3.2 Three disk roots — **must be absolute**

```bash
TRACY_SITES_ROOT=/Users/<you>/tracy-data/sites
TRACY_PRIVATE_ROOT=/Users/<you>/tracy-data/private
TRACY_DSH_HOME=/Users/<you>/tracy-data/dsh-home
```

```bash
mkdir -p ~/tracy-data/{sites,private,dsh-home}
```

🔒 **A relative path makes docker refuse when STARTING the container, not when parsing compose** —
`compose config` is green and only `up` dies. These two roots are bound into containers on **both sides**
(`${TRACY_SITES_ROOT}:${TRACY_SITES_ROOT}` and `${TRACY_SITES_ROOT}:/site`), so a relative value
resolves on the host side but sends a **relative target** into the container.

`TRACY_DSH_HOME` must also be **seeded once** (the bind mount hides the image's profiles; without it
`tracy-dsh` restart-loops *after* `up -d` has returned 0):

```bash
docker run --rm --entrypoint sh tracy/dsh:dev -c 'tar -C /desk-home -cf - profiles' \
  | docker run -i --rm -v "$HOME/tracy-data/dsh-home":/out alpine tar -C /out -xf -
```

### 3.3 Addresses — the easiest place to go wrong on macOS

```bash
TRACY_ORIGIN=http://tracy.test:51710
SITE_DOMAIN=tracy.test
SITE_DOMAIN_ALIASES=localhost          # a SECONDARY suffix, browsers can still reach it
SESSION_DOMAIN=tracy.test              # covers both the app and <label>.tracy.test — see §6
HOST_NAME=local
HOSTS=local
HOST_local_ORIGIN=http://tracy-host:51720
HOST_local_DSH_ORIGIN=http://tracy-dsh:8080
```

🔒 **The first four lines changed on 10/09, and `localhost` was demoted to a secondary suffix for a measured reason.**
Chrome does NOT share a `Domain=localhost` cookie with `*.localhost` — `localhost` behaves like a public
suffix. Measured in a real browser: set `probe=yes; Domain=localhost` on `http://localhost:51710`,
go to `http://wpfix3.localhost:51710` and read `document.cookie`: the probe is gone. The consequence is that **a signed-in site
owner is a stranger on their own site** — they get the "Private copy" page, from the very Live
button My Sites gave them, with a sign-in link that throws them back to that same refusal. `tracy.test`
is not a public suffix, so one cookie covers both, exactly the shape production already has with
`.tracy.ai`.

🔒 **`.env.example` writes `host.docker.internal` for the last two lines — on macOS that is WRONG**, and it
is wrong in a way that costs a whole afternoon. See §9 trap #1.

### 3.4 Switches for dev machines only

```bash
TRACY_EGRESS_FENCE=off       # laptops have no iptables — REQUIRED, see §7.2
MINIO_PORT=9000              # change it if something on the machine already holds 9000
ARTIFACT_S3_ENDPOINT=http://host.docker.internal:9000   # must match MINIO_PORT
```

Leave empty (they answer politely rather than crash): `MAIL`, `OAUTH_*`, `CLOUDFLARE_*`, `GITHUB_*`.
`MODEL_API_KEY` is only needed if you want the agent to answer chat.

**Template cards on Design inspiration** (Tracy Business — D37) **come only from Tracy**, since 16/09:
the tab asks `GET /api/templates` of the very deployment it belongs to, and that door answers from
`tracy_design_inspiration.json` on the release. **There is no copy in the image any more** — cards are
Published/Unpublished with one click on the ops Quickstarts page, so a copy shipped with the image would
always lag one click behind. Whether design systems show is the switch "Design systems on Design
inspiration" on the ops Quickstarts page (`GET /api/design-systems`), **off by default**; a switch that cannot
be read counts as off. Locally this means: if `tracy-dsh` cannot reach `tracy-web`, the tab **shows only
the "Your brand" card** — no template card, no design system — which is the true state, since
no site could be created from a card at that point either.

A card's preview frame is **the real demo site in an iframe**, and the demo address belongs to **the environment
serving the card** (the deployment's own demo table), not to an environment variable. The public demo
(`business-emdash.tracy.ai`) only allows Tracy origins to embed it, so from `tracy.test:8080` the frame falls back to a
screenshot; to see a live site, run that template locally
(`provision/emdash/deploy-quickstart.sh`, or the container of a local build) with
`TRACY_FRAME_ANCESTORS="http://tracy.test:8080"` in its `environment:`, then register it as this deployment's
demo on the Quickstarts page.

A card's images live in tracy-web's store (`template_shots`), **one store per environment**, uploaded by an admin
on `/ops` — releases carry no images. A new local DB has 0 rows, so `/api/templates` returns bare file names
and every card is an empty grey box (measured 27/09). `check-local.sh` pulls the images from the dev machine's store at its last step;
run it alone when dev has just uploaded more: `deploy/scripts/pull-template-shots.sh` (needs SSH to the dev host, `<dev-host>`; the old dev server has no Postgres any more, so pulling from it always fails, measured 04/10;
a private stand sets `COMPOSE_PROJECT_NAME=<the stand's project>` so images land in its own Postgres;
the first time ~1 GB, later only new images or changed sha256; local images dev does not have are not deleted).
`scripts/template-shots-import.mjs` **cannot** replace this step: the repo only has images for `tracy-business` and
`tracy-saas`, and its file names differ from the names the release gives.

---

## 4. Bringing it up

```bash
deploy/scripts/check-local.sh
```

**Use the script; do not type `docker compose` by hand** — on macOS it adds
`-f compose.macos.yml` itself, and that is not a convenience (see the warning at the end of this section).

⚠ **The first time on a machine it is red at Check 6 even though `/etc/resolver/test` is right — and that is the script
being wrong, not you.** Check 6 demands that `*.tracy.test` resolves to `127.0.0.1` *before* `up`, while
the thing answering that name is `dns-host`, a service started by that very `up`. Measured 14/09 on a blank machine:
`dscacheutil` returned nothing, the script stopped, the cluster was never brought up. Start the resolver alone and run again:

```bash
cd deploy && docker compose -f compose.yml -f compose.macos.yml --profile local up -d dns-host && cd ..
deploy/scripts/check-local.sh
```

From the second time on `dns-host` exists and the script goes straight through. (The right fix is moving Check 6 after `up`
— #69.)

It checks preconditions, builds images, runs `up -d`, then **proves** each service is healthy and probes
`tracy-host`'s `/health` from inside a container. Every failing check prints **exactly one switch
to turn on**, not just "failed". Run it as many times as you like — nothing is destructive.

When done:

```
✓ postgres  ✓ minio  ✓ dns  ✓ tracy-web  ✓ tracy-host  ✓ docker-proxy  ✓ tracy-dsh
✓ tracy-host /health: {"docker":true,"sitesRoot":true}
All checks passed — the local stack is up and healthy.
```

(On macOS there is also `✓ dns-host`.)

🔒 **Typed by hand, BOTH files are REQUIRED, and forgetting breaks in the most silent way in this document**
(§9 trap #1):

```bash
cd deploy && docker compose -f compose.yml -f compose.macos.yml --profile local up -d
```

Without `-f compose.macos.yml`, `up -d` still returns 0, **all seven services still report healthy**, and then every site
creation returns `502 {"code":"FLEET_REFUSED"}` — because each healthcheck only probes ITS OWN port. This
happened twice on 10/09; the second time took ten minutes to track down. The same goes for `up`, `down`,
`restart`, `logs`: **always name both files.**

---

## 5. Signing in — **no mail is sent**

🔒 **There is no fake code, and no fixed code either.** `generateCode`
(`apps/tracy-web/src/identity/otp.js`) generates six digits with a CSPRNG in **every** environment. The only thing that differs
locally is **the delivery path**: `MAIL` empty → `transportFor` picks `consoleTransport`, which
**writes the whole message into the server log** instead of sending it. Whoever waits for an email will wait forever.
Since #804, the console only writes messages when `LOCAL_LOGIN_PREVIEW=1` (the macOS compose default): with the preview off
and no `MAIL=resend:<key>`, no message goes into the log, and `/login` reports that the code could not be sent.

1. Open `http://tracy.test:51710/login`, type any address (this is your machine's database).
   `http://localhost:51710/login` also signs in, but that session **does not carry over to
   site hostnames** — to open your own site, sign in at `tracy.test`. See §6.
2. Get the code:

```bash
deploy/scripts/otp.sh                    # the newest code
deploy/scripts/otp.sh you@example.com    # the code for exactly that address
```

```
051593   (for you@example.com)
```

A code lives **10 minutes**. To see it raw — filter on the `[mail] to=` line rather than the message
body, because **the subject carries those six digits on the same line as the address**, so there is no
`-A`/`-B` window that has to guess a message's length:

```bash
cd deploy && docker compose --profile local logs tracy-web --tail 200 | grep '\[mail\] to='
```

**The first person to sign in does not become staff automatically.** `/ops` requires a `workspace` row with
`kind='tracy_admin'`; without it `/ops` returns **403 with no body** (on purpose: strangers must not learn
that surface exists).

---

## 6. Domain names — read carefully, this is where people go wrong most

**A site has ONE name: `<label>.tracy.test:51710`.** Both the browser and code inside containers call
exactly that name — they only differ in where they hear the answer from:

| Who asks | Who answers | Returns |
|---|---|---|
| macOS (browser, curl) | `dns-host` in `compose.macos.yml`, port 5354 | `127.0.0.1` |
| Containers on the `tracy` network | `dns` in `compose.yml` | `172.30.0.10` (that is `tracy-web`) |

Two resolvers because **one name cannot have two answers in the same resolver**, and the two sides
must hear two different addresses. macOS reads `/etc/resolver` by **the last label**, so the file name is
`test`, not `tracy.test`:

```bash
sudo mkdir -p /etc/resolver
printf 'nameserver 127.0.0.1\nport 5354\n' | sudo tee /etc/resolver/test
```

⚠ **Do not verify with `dig` or `ping`.** `dig` talks straight to a resolver and **ignores
`/etc/resolver` entirely** — it returns `NXDOMAIN` while every browser on the machine resolves that name
perfectly. Ask the right way:

```bash
dscacheutil -q host -a name anything.tracy.test    # must print 127.0.0.1
```

⚠ **Port 5354, not 5353.** 5353 is mDNSResponder's port and on a Mac it is **always** taken:
`up` dies with `bind: address already in use`.

`<label>.localhost:51710` still reaches the right site (it is in `SITE_DOMAIN_ALIASES`), but **the sign-in
session does not follow** — see §3.3. Fine for viewing as a visitor; for work
use `.tracy.test`.

🔒 **`<label>.localhost` is resolved only by browsers and `curl` — measured 09/09 on macOS: Chrome and
curl give `127.0.0.1`, Node's `dns.lookup` gives `ENOTFOUND`, and inside containers it gives
nothing.** Two mandatory consequences:

- **Server-side code never dials `site.address`.** Every call to a site goes through
  `siteTarget(site, config)` = `http://<label>-web-1/` on the same machine. `site.address` is only for **printing
  for people to read**.
- The host half of the **Import** wizard runs in `tracy-dsh`, so the source site's admin URL must be
  `http://<label>.tracy.test:51710/`, not `.localhost`.

**The port is part of the address.** `GET /api/config` returns `sitePort`, taken from `tracy-web`'s own origin
— so the Address box in the wizard shows `.tracy.test:51710` locally and `.tracy.ai` in
production, never mixed. (Before 10/09 it showed `.tracy.ai` right on the laptop.)

**`SESSION_DOMAIN=tracy.test`, so the session follows you onto the site.** Verified 10/09 on
`wpfix3`: sign in at `tracy.test:51710`, the cookie is born with `Domain=.tracy.test`, then open
`http://wpfix3.tracy.test:51710/` → **200, `<title>wpfix3</title>`** — the real site, not the
"Private copy" page. The seat door was not loosened at all: at the same moment a passing visitor got 403, and a person **signed
in but without a seat** also got 403.

(Before 10/09 this place said a 403 for the site owner was "correct, not a bug", and advised whoever needed to measure
to edit `/etc/hosts` themselves. That was wrong: the Live button the product gives site owners led to a refusal,
and it is the first thing they click after creating a site.)

---

## 7. Add site and Import site

### 7.1 Creating a new site

In the workspace: **Add site** → type a label → choose a CMS → **Create site**. The label must be **6–30 characters**,
lowercase letters/digits/hyphens, not starting or ending with a hyphen, no `--` at position 3
(`SITE_LABEL_RE` in `apps/tracy-web/src/sites/label.js`, the same regex as the Worker and
`tracy-add-site`). Shorter gives `400 {"code":"INVALID_LABEL","reason":"shape"}` — `demo` is
refused, measured 14/09. The label becomes the container name `<label>-web-1`.

With the API:

```bash
curl -b jar.txt -X POST http://tracy.test:51710/api/sites \
  -H 'content-type: application/json' \
  -d '{"label":"demosite","platform":"wordpress"}'
# → 202 {"siteKey":"demosite.tracy.test","jobId":"..."}
```

Follow the job (really measured: **~190 seconds** for WordPress the first time, mostly pulling the image; **~31
seconds** for later runs, once the image is already on the machine):

```bash
curl -b jar.txt http://tracy.test:51710/api/sites/demosite.tracy.test/jobs/<jobId>
# → {"state":"done","step":"ready","port":52000,"liveUrl":"http://demosite.tracy.test:51710/"}
```

Three fields in the answer **are normal locally**, not errors:

| Field | Meaning |
|---|---|
| `repoError: "NOT_CONFIGURED"` | no GitHub App configured → no private repo for the site |
| `custody: "skipped"` | component custody has no store in this app yet |
| `lane: "/"` | the site folder sits at the root, not the nested structure of the lane era |

Open the site: `http://demosite.tracy.test:51710/`. **Anyone who opens it sees the site** — the fleet bar stopped guarding the door on
16/09/2026 ([ADR 0018](../adr/0018-fleet-bar-does-not-guard-the-door.md)), so a draft no longer returns 403
"Private copy" to passing visitors. What remains is the draft's `robots.txt`: a request for crawlers to
stay out, not a lock.

🔒 **The Browser tab INSIDE the workspace does not carry your Tracy session.** That browser runs inside
the `tracy-dsh` container — even while you are signed in on the outer tab, even if you own the site. Before 16/09 that was why
it got 403 on your own draft site; now it can view the page, but the site still **does not sign it
in** to the CMS, because no `x-tracy-email` vouches for it.

🔒 **And locally it REALLY DIES at the network layer, before the seat door — measured 14/09, correcting the 10/09 conclusion.**
From inside `tracy-dsh`, `<label>.tracy.test` resolves to `172.30.0.10` (that is `tracy-web`), but
`tracy-web` only listens on **8080** inside the container; **51710 is the port macOS publishes**, nobody listens on it
inside. Same reason `compose.macos.yml` sets `MCP_TRACY_ORIGIN=http://tracy-web:8080`.

```
curl http://demosite.tracy.test:51710/   →  connection refused
curl http://demosite.tracy.test:8080/    →  301 → http://demosite.tracy.test:51710/
```

The bar no longer blocking does not save it either: WordPress returns a 301 to its `siteurl`, i.e. back to `:51710`. So
**the workspace's Browser tab cannot view a local site** — the `liveUrl` it receives is the outer
browser's address. On the fleet this does not happen: there the site name is the real name and the same port on both
sides. To view the site, use your own browser.

💡 **The cheapest test for "is this site behind the fleet bar":** `curl -i <site>/__tracy/errors`
without a cookie — `401 sign in first` (Tracy's words) means yes, the site's own 404 means no. Before
16/09 that test was `/__tracy/team`; until 11/10 it was `/__tracy/build`, a door since retired (J15.2: nobody
writes the manifest any more, every site returns `{"built":null}`).

### 7.1b Building a site from a Design inspiration — the name is claimed first, then into the site's workspace

This is a **different path** from *Add site* above, and since 15/09 it has a new shape (D39,
`tasks/todo-claim-then-workspace.md`). At `/new/`: open the **Design inspirations** tab → click a card →
*Create with <CMS>* → the **Build** tab appears and asks only **one question: the business name**.

*Next* there **claims** the site at once: `POST /api/sites/claim` creates the site row + the owner seat, calls
`/_host/reserve` to create `~/tracy-data/sites/<label>/` holding only a `.tracy-claimed.json` marker, then
the browser moves to that site's own page. From that second on everything happens inside the site: the plugin registers
`/site/<label>` as the workspace, opens **one** session in it with the `designer-<cms>` preset, and the Build tab
draws the remaining questions (starting at step 2 — the name was already asked). *Send to Tracy* calls `POST /api/sites`
with the **same** `buildId`, so claim and press are one request, not two sites.

**There is no handoff step any more.** Before 15/09 a Joomla `template-build` run ended with
`construction-handoff`: save into `sessionStorage`, change page, then an overlay built the workspace and
session on the new page. All three of those files were deleted — seeing them again means someone rebuilt a dead
path (`packages/site/tracy-site-build-core/test/no-handoff-page.test.mjs` holds the spot).

Three things to check yourself after a run, all readable from the machine:

```bash
ls ~/tracy-data/dsh-home/sessions/--site-<label>--/        # EXACTLY ONE session
cat ~/tracy-data/sites/<label>/docs/agents/build/job.json  # the job lives INSIDE the site folder
zstd -dc ~/tracy-data/dsh-home/sessions/--site-<label>--/*/session.v3.jsonl.zstd | head -8
#   → "cwd":"/site/<label>"  and  agent-preset/selected → designer-<cms>
```

⚠ **A claimed and abandoned name is released by cron after 24 hours** (`sweepClaims`, one run per hour) — but only
when the folder **still holds only the marker**. Any additional file makes it a real site; cron keeps it and logs
`[cron] claim <siteKey>: kept — the folder holds a site`. To see it run now instead of waiting an
hour:

```bash
docker exec tracy-tracy-web-1 node --input-type=module -e "
import { readConfig } from '/opt/tracy-web/src/config.js'
import { createPool } from '/opt/tracy-web/src/db/index.js'
import { sweepClaims } from '/opt/tracy-web/src/cron.js'
const config = readConfig(process.env)
const pool = createPool(config.databaseUrl)
console.log(JSON.stringify(await sweepClaims(pool, config, { log: console })))
await pool.end()"
```

⚠ **Two Joomla branches are red locally for reasons OUTSIDE this flow** — measured 15/09, do not chase them into
claim: an **already served** design (`apple`, `airbnb`) dies at *fetching webroot* with
`quickstart download failed (HTTP 404)`, because the `tracy-apple/j6` entry in `provision/quickstarts.json`
lacks `githubAssetId` and the release repo is private; and a **not yet served** design (going
`template-build` through `tracy-base/j6`, downloadable) runs to the `template` stage and then goes red with *Presentation asset
changed*. A new WordPress site locally goes red at the `check` stage with `COMPONENT_NOT_REGISTERED` (no
custody component). All three happen **after** the site is standing and the job is in the right place.

### 7.2 🔒 `TRACY_EGRESS_FENCE=off` — required on dev machines

`provision.sh` strings an egress fence with iptables for each site. Laptops have no iptables, so
that step **always fails — and fails at the very end**, after the site's two containers are up:

```
!! chain TRACY-FLEET-EGRESS does not exist on the host — run bootstrap.sh first
```

(That log line reads: "chain TRACY-FLEET-EGRESS is not on the host — run bootstrap.sh first".) Why `off` must be **typed out** rather than letting the script skip itself when it sees no chain: a site without
a fence **looks exactly like** a site with one. "Not found, never mind" is precisely fail-open. That spot in
`provision.sh` says it plainly: *better to stop and let the on-call person deal with a half-built site than to deliver a
site without a fence that looks exactly like one with it.*

**Never set `off` on the fleet.**

### 7.3 Importing an existing site

The **Add site → Import existing site** wizard does everything: signs in to the source site's admin, installs Claude
Cowork, pushes copies of the DB and webroot to the **artifact store**, then `tracy-host` downloads that copy and builds
the site. There is no manual push step. Measured end to end on 14/09 with a real customer's Joomla site on the Internet (`customer.example` below).

🔒 **The store must be somewhere the SOURCE SITE can reach.** The webroot does not pass through dsh: the source site's own
server PUTs each part to the store with presigned URLs (`files.pack`). The MinIO in compose is at
`host.docker.internal:51740` — a site on the Internet can **never** reach it. So there are two
ways, pick one:

| To import | Set `ARTIFACT_S3_*` in `deploy/.env` |
|---|---|
| A real site on the Internet | an **R2** bucket (endpoint `https://<account_id>.r2.cloudflarestorage.com`, an *Object Read & Write* token for that bucket only). No CORS needed. |
| Only a site that also runs locally | leave MinIO as is; the source admin URL uses the `.tracy.test` suffix (below) |

After changing `ARTIFACT_S3_*` you must **recreate** `tracy-web` (`up -d tracy-web`); `restart` does not re-read
`env_file`.

The admin URL of a **local** source site must use the `.tracy.test` suffix (§6): the wizard's host half runs
in `tracy-dsh`, and only that name resolves from containers.

⚠ **After import, work in THE SITE'S workspace, not at `/new/`.** The path is
`http://tracy.test:51710/<siteKey>/` — for an imported site, the siteKey is **the customer's domain**
(`/customer.example/`), not the label (`customer-example-<hash>`). At `/new/` the agent has no
site: file tools are refused by the `/site` fence, `tracy_site` has to guess the key and gets
`SEAT_NOT_AUTHORIZED` — measured 14/09, 19 minutes and 188K tokens for a run that achieved nothing. Since 14/09
the *Open workspace* button at `/new/` opens the site right in that tab, and the mode picker switches the preset to
the site's CMS by itself (before, a Joomla site still opened on *Designer · WordPress*).

🔒 **An imported site's agent works on the COPY, not on the customer's site.** `tracy_site` goes through
the `apply` door to the component in `<label>-web-1`; the live endpoint is only stored, never called. Before
14/09 it called production directly — the agent disabled a plugin on the real customer site. Seeing
`COMPONENT_NOT_ON_FLEET_COPY` means the copy has not answered `core.manifest` yet (not finished building, or the
token in the copy's DB differs): fix the copy, do not re-register the live endpoint. Since 30/09 the refusal carries
`copyReason` (and `tracy-web`'s log line `[fleet-copy] <label> not verified: <reason>`):
`timeout`/`unreachable` means the copy is still cold — the door already retried once (30 s, then 60 s), and the agent is told
to call again shortly; `unauthorized` is a token mismatch, `platform_mismatch` is the copy answering as another
CMS, `not_json`/`refused` is something answering that is not the plugin. Measured 30/09 on the local stand: tracy.ai
(WordPress + WooCommerce, 2,482 posts) was refused three times right after import, then the same call answered
in 464 ms.

Traps hit during the first measurement, both fixed (`fix/import-on-tracy-web`):

- **`TypeError: fetch failed` at `reading_content`.** The host half called back to the browser's address
  (`tracy.test:51710`), a port nobody listens on inside the container. Now it reads `MCP_TRACY_ORIGIN`
  (`http://tracy-web:8080`, `compose.macos.yml`).
- **The provision job died at "fetching webroot".** `provision.sh` used to download with `aws s3 cp`, while the
  `tracy-host` image has no `aws`. Now `tracy-web` signs two GET URLs and `tracy-host` downloads with `curl`.

---

## 7.4 The model key — the only thing you must ask for elsewhere

`MODEL_API_KEY` in `deploy/.env` reaches `tracy-dsh` as `DEEPSEEK_API_KEY` (declared in
`compose.yml`). Empty, **chat can be sent but never answers** — the agent run dies with:

```
MISSING_CREDENTIAL  llm-deepseek: no API key for provider route "deepseek-official";
store DEEPSEEK_API_KEY through the credentials service (the web Models page writes it),
or export DEEPSEEK_API_KEY in the launching environment
```

⚠ **Before 10/09 nobody read `MODEL_API_KEY` at all.** `.env.example` said "passed into dsh" right next
to it, while no service in compose took it — so filling it in changed nothing, and whoever filled it in
believed the configuration was done. Now `compose.yml` really declares it.

Production keeps this key in **dsh's credentials service** (the Models page writes it, as one record
per person in `/desk-home/.credentials.yaml`), not in env. Locally it goes straight
into `deploy/.env` because that is **reproducible**: a new machine runs `up -d` and has a working agent, without remembering to open
a configuration page.

Check whether the key is still alive, without opening the UI:

```bash
docker exec tracy-dsh sh -c 'curl -s https://api.deepseek.com/user/balance \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY"'
# → {"is_available":true,"balance_infos":[...]}
```

`check-local.sh` Check 7 reminds you when it is empty — **reminds, does not block**: everything else (sites, seats, the bar,
`/ops`) runs normally without any key.

---

## 7.5 Trying an unreleased quickstart

A pack without a release on `ja-products` can still go **the customer's exact path**: a card on Design
inspiration → *Create with <CMS>* → `POST /api/sites/claim` + `POST /api/sites` → `tracy-host`
provision. The only difference is where files are downloaded from: read from this machine's disk instead of GitHub
(`apps/tracy-web/src/lib/local-releases.js`).

**Layout** — one directory per pack, **written exactly like the tag of the release** the pack will become:
`<dir>/<slug>/<cms>/` for Tracy releases (`tracy-business/j6`), and
`<dir>/quickstart/<slug>/<cms>/` for JoomlArt releases (`quickstart/ja-essence/j6`). Inside are
exactly the files a release would carry:

```
~/tracy-data/local-releases/
├── quickstart/ja-essence/j6/              # pack JA: tag local/quickstart/ja-essence/j6
└── tracy-business/j6/
    ├── tracy_setting.json                 # required — same validator as a release
    ├── tracy_design_inspiration.json      # optional — the card; missing → the `card` block in setting is read
    ├── tracy_site_question.json           # optional — the question set
    ├── business-home-1440.png …           # images the card names
    └── <every file install in setting names>   # zip / sql.gz / tar.gz / Claude Cowork plugin
```

Building a pack from an existing release (measured 26/09 with `tracy-business/j6` 1.2.0, ~95 MB):

```bash
D=~/tracy-data/local-releases/tracy-business/j6; mkdir -p "$D"
gh release download tracy-business/j6 -R JoomlArt-Products/ja-products -D "$D" \
  -p tracy_setting.json -p 'tracy-business-j6-webroot-1.2.0.tar.gz' \
  -p 'tracy-business-j6-database-1.2.0.sql.gz' -p 'pkg_claudecowork-0.17.4.zip'
cp packages/fleet/tracy-fleet-operation/scripts/provision/templates/tracy-business/*.png "$D"/
```

**Turning it on:** add `TRACY_LOCAL_RELEASES_DIR=/Users/<you>/tracy-data/local-releases` (an absolute path)
to `deploy/.env`, then `scripts/rebuild-local.sh --here` (or recreate the two containers
`tracy-web` + `tracy-host` with `compose.macos.yml`) — `compose.macos.yml` mounts that directory
**read-only, at the same path** into both. At boot and every 10 minutes `tracy-web` reads it again (so does the Refresh button
on `/ops`); the log prints `[releases] 1 local pack(s) read from …`.

**How the card appears:** each pack becomes a `quickstart_releases` row tagged
`local/` + the release tag (`local/tracy-business/j6`, `local/quickstart/ja-essence/j6`), read with **exactly** the same `validateSetting` / `validateDesignInspiration` as
a release (checksums are computed from the file bytes; error messages say "in this local pack" rather than
GitHub). The pack's card is **a separate card**, id `local-<template>`, labelled "Tracy Business (local)",
next to the released card — never replacing it: clicking the released card still installs the released
release. The card's images are imported into `template_shots` under that id. A pack has no `published_at`, so it sits
at the end of the list and never becomes the default build base by itself.

**Sealing:** a pack is sealed **as the release it will become** at the same version —
`local/tracy-business/j6` 1.2.0 gets the contract `tracy-business/j6/1.2.0` and its lowest Claude Cowork plugin version
(`contractFor` strips the `local/` prefix). JA packs likewise: `local/quickstart/ja-essence/j6` 1.0.2
gets the contract `quickstart/ja-essence/j6/1.0.2`. ⚠ Putting a JA pack in `<dir>/ja-essence/j6/` (missing the
`quickstart/` level) makes the tag `local/ja-essence/j6`, standing in for a release that **does not exist**: the card still
shows, but with no contract, no pin, the site comes out **unsealed** without any warning. A slug no
release uses (`tracy-business-next`) likewise: installed like a template card, unsealed. The entry sent to the host is a
`file://` address inside the pack directory, `bytes` measured at click time, no `githubAssetId` — so the pack's files
**do not need** `TRACY_RELEASES_GITHUB_TOKEN`. The Claude Cowork plugin follows the original release's rules exactly: a pin in
`provision/quickstarts.json` with `overridesRelease` (like `tracy-business/j6` 1.2.0 on 26/09) means the
pin beats the pack's Claude Cowork plugin, and that pin is a GitHub asset — then the token is needed; without a pin (e.g.
pack 1.1.0) the Claude Cowork plugin comes from the pack itself.

**Fences:** `tracy-web` refuses to boot if this variable is set while `NODE_ENV=production` or the origin is not
local HTTP; `tracy-host` refuses to boot without `NODE_ENV=development` (set only by `compose.macos.yml`);
`quickstart.py` only reads `file://` addresses **inside** `TRACY_LOCAL_RELEASES_DIR` (symlinks resolved
before comparing) — outside it returns `quickstart file /etc/hostname is outside TRACY_LOCAL_RELEASES_DIR;
refusing to read it`. Removing the variable makes the next read delete every `local/…` row.

Measured 26/09 on this stand: card `local-tracy-business` → claim + create label `tdlocal-tb-j6b` → job
`done` after **139 seconds** (the site image already present), provision log `this card is sealed by
tracy-business/j6/1.2.0`, cowork `pkg_claudecowork-0.18.0-rc.5.zip` from the pin, and
`http://tdlocal-tb-j6b.tracy.test:8080/en/` returns 200 with `templates/tracy_business/…` in the HTML.


### 7.5b A self-built pack + an unreleased Claude Cowork plugin, on a cluster running on another machine

Use this when you have just packed a new pack (e.g. JA Essence j6 1.0.3) and a Claude Cowork plugin version without a
release, and want to try both through the customer's exact path.

1. **The pack directory must be on the machine running Docker.** `compose.macos.yml` bind-mounts
   `TRACY_LOCAL_RELEASES_DIR` by the path of the machine running `docker compose`. With the cluster on machine B and the pack
   built on machine A, copy it to B first (`rsync -a <pack>/ B:~/tracy-data/local-releases/quickstart/ja-essence/j6/`),
   and the variable in **B's** `deploy/.env` is an absolute path on B.
2. **Drop the plugin zip into the pack directory itself** (`pkg_claudecowork-<ver>.zip`), then in the pack's
   `tracy_setting.json` point `install.cowork` at it:
   `{"file": "pkg_claudecowork-<ver>.zip", "sha256": "<shasum -a 256 of the file>"}`. One byte off and the
   pack is refused with `must match … in this local pack`.
3. **Check the `overridesRelease` trap before turning it on.** A pin in
   `apps/tracy-web/src/quickstarts.json` with `overridesRelease: true` for that exact release and version
   (or a version within `contractVersions`) **beats** the zip in the pack — the site gets the released
   version, not the one being tried. Ask directly, from the tch tree:
   ```bash
   node -e "import('./apps/tracy-web/src/lib/contracts.js').then(m=>console.log(m.coworkPinFor('local/quickstart/ja-essence/j6','1.0.3')))"
   ```
   `null` or a pin without `overridesRelease` → the pack's zip is used. With `overridesRelease`
   → give the pack a version the pin does not carry (usually the next version, since pins are only raised at
   release), do not edit `quickstarts.json`.
4. **The plugin must be new enough for the contract.** For a contract with `coworkMinVersion`, the plugin version in the
   pack must be at that level or above. A version without its own contract directory gets the contract of the
   nearest lower version in the same major (the contract carries `fallbackFrom` = the version asked for).
5. **Turn on / re-read** on the machine running Docker: `scripts/rebuild-local.sh --here` if you just added the variable;
   for a new pack in an already-mounted directory the Refresh button on `/ops` is enough. The log must show
   `[releases] N local pack(s) read from …`; the card shows as "<Label> (local)".
6. **Prove it is sealed:** create a site from the local card; the provision log must show
   `this card is sealed by quickstart/ja-essence/j6/<version>` (Joomla, `platform/joomla.sh`) and the name of the pack's plugin zip.

---

## 8. What is off locally, and how it answers

None of it crashes the app; everything answers with a code.

| Feature | Missing | Answer |
|---|---|---|
| Real mail | `MAIL` | written to the log (§5) |
| Google/GitHub sign-in | `OAUTH_*` | the button does not show; OTP still works |
| Go-live, ingress, custom domains | `CLOUDFLARE_*` | `501 NOT_CONFIGURED` |
| A private repo per site, Release to GitHub | `GITHUB_*` | `repoError: NOT_CONFIGURED` |
| The agent answering chat | `MODEL_API_KEY` | chat can be sent, no answer |
| The Design inspiration page calling a model | `MODEL_API_KEY` | `503 MODEL_NOT_CONFIGURED` |
| Turnstile | `TURNSTILE_SECRET` | **refused**, unless `TURNSTILE_DISABLED` is declared explicitly |

Internet is needed for: pulling images the first time, `MODEL_API_KEY` calling out, and fonts on server-generated pages
(works offline, only the typeface changes). **No Tracy server is needed.**

---

## 9. Traps that really bit — one symptom each

### Trap #1 — `network_mode: host` on macOS does not mean what it means on the fleet

**Symptom:** creating a site returns `502 {"code":"FLEET_REFUSED"}` while **all seven services report
healthy**.

**Why:** `network_mode: host` puts the container into the host namespace **of the Linux virtual machine**, not
macOS's. So `tracy-host` listening on 8090 is reachable only from **another host-network
container** — not from macOS (`curl 127.0.0.1:51720` → connection refused), and **not from `tracy-web`**
sitting on the bridge. `host.docker.internal` does not save it either: it points to the macOS machine, the one place
where the listener is **not**.

**Why "7/7 healthy" does not catch it:** each healthcheck only probes **its own port**. A green cluster
proves the containers **are running**, not that they **can talk to each other**.
"It booted" and "it works" are two different claims.

**Fix:** use `deploy/compose.macos.yml` (which moves `tracy-host` back onto the bridge) and set
`HOST_local_ORIGIN=http://tracy-host:51720` in `.env`.

### Trap #2 — `check-local.sh` used to die silently

A key missing from `.env` → `grep` returns 1 → under `set -euo pipefail` the assignment **kills the script
before `fail` can print its guidance**. Four ✓ lines and then silence, no error line. Fixed; recorded here because
a preflight that dies without a reason is **worse than no preflight** — the reader concludes it passed.

### Trap #3 — an end-of-line comment in `.env` is part of the value

`TRACY_SITES_ROOT=/x/sites   # server: /srv/tracy-sites` was read including the comment, so the error printed
`"/x/sites   # server: ..." is not absolute` — a **correct** verdict about a value **nobody
wrote**, sending the reader off to fix a path that was already right.

### Trap #4 — port 9000 is already taken

MinIO dies with `port is already allocated` **after** every other service is up. Set `MINIO_PORT`
(and `ARTIFACT_S3_ENDPOINT` to match). The port **inside** the container stays 9000 so `minio:9000` on the
compose network resolves; only what the host publishes changes.

### Trap #5 — an old container holds the name

`tracy-dsh` and `tracy-docker-proxy` are **fixed names**. If an old container with that name remains (even
stopped), `up` dies with `Conflict. The container name is already in use`. You must `docker rm` them,
not just `stop`.

### Trap #6 — `dig` lies about `/etc/resolver`

**Symptom:** `dig anything.tracy.test` returns `NXDOMAIN`, yet Chrome opens
`http://anything.tracy.test:51710` normally. Or the reverse: `dig` is green while the browser still
cannot get in.

**Why:** `dig` talks straight to a DNS server and **ignores `/etc/resolver` entirely** — it
does not answer the question you are asking. `ping` is not trustworthy here either. Ask the right way:

```bash
dscacheutil -q host -a name anything.tracy.test    # must print 127.0.0.1
scutil --dns | grep -A3 'domain.*test'             # does macOS read that file
```

And remember: the file name is **the last label** — `/etc/resolver/test`, not
`/etc/resolver/tracy.test`.

### Trap #7 — port 5353 belongs to mDNSResponder

`dns-host` dies right at `up` with `bind: address already in use`. 5353 is the Bonjour/mDNS port and
on a Mac it is **always** taken. That is why `dns-host` defaults to **5354**; to change it use
`HOST_DNS_PORT` and edit `/etc/resolver/test` to match.

### Trap #8 — a `Domain=` the host does not fall under is NOT a narrower cookie, it is no cookie

**Symptom:** sign-in returns `303` as usual, `Set-Cookie` looks perfectly valid in the Network
tab, then `/auth/me` returns `{"email":null}` and you are still signed out. Not one
error line anywhere.

**Why:** browsers (and `curl`) **silently drop** a `Set-Cookie` whose `Domain` does not cover the host
of the request. Measured 10/09 right after `SESSION_DOMAIN` changed to `tracy.test`: signing in through the secondary suffix
`localhost` received `Domain=tracy.test` and lost everything.

**Fixed** — `cookieDomainFor` only writes `Domain=` when the host really falls under it; otherwise the
cookie is host-only. Recorded here because this symptom will come back wherever someone adds a new
suffix, and it has **no** error to look up.

### Trap #9 — the official MinIO images vanished from the registry (twice: Docker Hub 14/09, quay.io 25/09)

**Symptom:** a **clean** machine dies at the `up` step with `no such manifest` (or
`pull access denied … may require 'docker login'`, `401 Unauthorized`), dragging along `No such image`
for several other images because compose cancels the whole pull. A machine with the images cached still comes up normally,
so only new installers see it.

**Why:**
- 14/09 (#70): Docker Hub returned `object not found` for **the whole repos** `minio/mc` and `minio/minio`;
  signing in changed nothing. At that point it moved to `quay.io/minio/*`.
- 25/09 (#349): `quay.io/minio/minio` and `quay.io/minio/mc` returned `no such manifest` for **every
  tag**, including `latest`; `minio/*` on Docker Hub returned `denied`. No official registry was left that could be
  pulled anonymously.

**Fixed (#349):** `deploy/compose.yml` pins `pgsty/minio` and `pgsty/mc` (community builds of
the same MinIO source, maintained by Pigsty on Docker Hub), pinned by **tag + digest** of the multi-arch
index (amd64 + arm64). Measured 25/09 in a separate test container: the same entrypoint as the old image, with
`curl` (healthcheck) and `/bin/sh` + `mc` (`minio-init`), `mc mb -p` re-run a second time still exits 0,
and the new server reads objects the old `quay.io` image wrote into the `/data` volume. Only local is
affected — those two services carry `profiles: [local]`; servers use R2 and never start them.

**Catching it early next time:** `deploy/scripts/check-local.sh --images-only` runs `docker manifest inspect`
with an **empty** Docker config (no stored credentials) for every image of the `local` profile, reading
the list from `docker compose config` rather than typing it, and names exactly which service + image cannot be
pulled. It runs no container and needs no `deploy/.env`. The full `check-local.sh` runs this step first.
This step needs the network, so it is deliberately **not** in `scripts/check-all.ts`.

If someone proposes "switch back to `minio/minio` / `quay.io` for familiarity", run the command above first and point to this
section.

---

## 10. The fix–see loop

| What you change | What to do |
|---|---|
| `apps/tracy-web/src/**` | `docker compose --profile local up -d --build tracy-web` — ⚠ if `tracy-web` dies with `Address already in use`, it is **not port 8080**: `tracy-web` pins IP `172.30.0.10` on the `tracy` network, while `tracy-host` pins none and Docker IPAM does **not** exclude pinned IPs from the dynamic pool — while `tracy-web` is being rebuilt, a `tracy-host` starting first may take exactly `.10`. Measured 15/09. Fix: `stop tracy-host` → `up -d tracy-web` → `up -d tracy-host` |
| `apps/tracy-host/src/**` | as above, `tracy-host` |
| Scripts in `packages/fleet/**` | **rebuild `tracy-host`** — the scripts live INSIDE the image |
| `packages/*/src/client/**` | **While inspecting:** `pnpm --filter <package> build` then copy `lib/client.js` over `$TRACY_DSH_HOME/profiles/native/node_modules/@tracy/<package>/lib/client.js`, Cmd+Shift+R — dsh reads the file on every request, no restart needed. **Loading the official version:** rebuild the image then **re-seed the profile** (see the ⚠ just below), then `restart tracy-dsh` |

⚠ **`up -d --build tracy-dsh` on its own does NOT bring new plugins into the cluster — measured 15/09/2026.** Compose binds
`${TRACY_DSH_HOME}` over **all of** `/desk-home`, and plugins live in `/desk-home/profiles`, so the mount
hides the image's copy: the cluster reports healthy, `docker inspect` shows the new image, but the `md5` of
`profiles/native/node_modules/@tracy/dsh-add-site/lib/client.js` on disk is still the copy seeded on
14/09 — every plugin on the cluster is **from the latest seed**, not from the image. On a real host
`deploy-host-dsh.sh` calls `seed-profile.sh` after each image; locally you must do it yourself, and
`seed-profile.sh` run directly on macOS **fails silently** (`tar: Can't set UID=33`, writes nothing).
The path that works on macOS is tar inside a container, i.e. the seed command of §3.2, plus deleting the old `@tracy`
tree first so no stale file remains:

```bash
docker run --rm --entrypoint sh tracy/dsh:dev -c 'tar -C /desk-home -cf - profiles' \
  | docker run -i --rm -v "$HOME/tracy-data/dsh-home":/out alpine \
      sh -c 'rm -rf /out/profiles/native/node_modules/@tracy && tar -C /out -xf -'
cd deploy && docker compose -f compose.yml -f compose.macos.yml --profile local restart tracy-dsh
```

Check by file, not by `docker inspect`:
`md5 -q ~/tracy-data/dsh-home/profiles/native/node_modules/@tracy/<package>/lib/client.js` must match
`git show HEAD:packages/<path>/lib/client.js | md5 -q`.

The full test suite (with Postgres; otherwise hundreds of tests **skip silently**):

```bash
export TEST_DATABASE_URL="postgres://tracy:tracy@127.0.0.1:51730/postgres"
pnpm test:workers      # must show: 0 fail, 0 skipped
pnpm build:check       # 28 gates
```

---

## 11. Tearing down

```bash
cd deploy
docker compose --profile local down          # keeps data
docker compose --profile local down -v       # also deletes Postgres and MinIO
```

**Site** containers do not belong to this compose (each site is its own compose built by `provision.sh`)
— remove a site through the teardown door, not with `docker rm` by hand.


### Seeing the OTP right on the local page

The macOS compose turns on `LOCAL_LOGIN_PREVIEW=1` and `NODE_ENV=development` for `tracy-web`.
Enter an email at `/login`: the new code appears under the **Local development** label right on the code-entry screen.
**Send a new code** issues a new code for the same email. The code is still single-use, expires after 10 minutes and
is subject to the attempt limit; there is no fixed code. The no-JavaScript form flow shows the code too.

Set `LOCAL_LOGIN_PREVIEW=0` **and** `MAIL=resend:<key>` in `deploy/.env` to try the normal email
flow.
The preview only accepts console mail and HTTP on `localhost`, loopback or `tracy.test`;
the app refuses to start it if `NODE_ENV=production`. Never turn this option on on a server.
