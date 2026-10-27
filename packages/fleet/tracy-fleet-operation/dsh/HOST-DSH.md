# HOST-DSH — ONE dsh per fleet host

Runbook for building and switching on `tracy-dsh` on a fleet host. Read all of it before typing the first
command: of the seven steps below **none runs the next one by itself**, and three of them fail without
saying why.

Background: [`tasks/plan-fleet-mot-dsh.md`](../../../../tasks/plan-fleet-mot-dsh.md). Machine map, lanes, and
how to diagnose a door that refuses a session:
[`docs/references/ban-do-fleet.md`](../../../../docs/references/ban-do-fleet.md).

## 0. What it replaces, and what it does NOT switch off

Before: **one dsh container per site** (`scripts/tools/create-lane.sh`, deleted 06/09), each lane with its own
412 MB plugin tree, one seat key, one hostname. After: **one `tracy-dsh` for the whole host**, seeing every site via
`/site/<label>`, and the agent's bash runs in that site's own web container through `docker exec`.

🔒 **Building it changes NOTHING.** The switch is the KV flag `host-dsh:<label>`, and `cowork-web` only changes
path when that flag is `on` (Task 5). A host that has run `up -d` but has no site with the flag on is a healthy
container **that nobody calls** — exactly the state we want before moving the first site. The old lanes keep
running, keep serving, and remain the fallback.

Three files in this folder:

| File | Role |
|---|---|
| [`host-dsh.yml`](host-dsh.yml) | compose: `docker-proxy` + `dsh` |
| [`host-dsh.env.example`](host-dsh.env.example) | template for `/etc/tracy/host-dsh.env` |
| [`docker-proxy.haproxy.cfg`](docker-proxy.haproxy.cfg) | the socket proxy's rules — **this** is the boundary, see §5 |
| [`host-dsh-init.sh`](host-dsh-init.sh) | bootstrap on the host, idempotent, self-checks with one real signed call |

✅ **This folder NO LONGER holds anything from the old image era (06/09/2026).** `dsh/Dockerfile`,
`dsh/install/` and `dsh/IMAGE_TAG` — the trio that built `tracy/desk-agent` for each site's lane — were deleted
in the same pass as `scripts/tools/*lane*` and `lanes/`. The `tracy-dsh` image is built from the Dockerfile named in
§1, not from here.

---

## 1. Image: build in ONE place, hosts only pull

⚠ **CHANGED 07/09/2026 — this section used to say "build on the host itself", and that does not work.**
DO has 2 cores, 3 GB RAM and 17 GB free disk, against a build that runs `pnpm build:official` for
~300 packages plus Playwright and Chromium to produce a 5.8 GB image. A machine that cannot build its own image
is a machine that quietly serves last month's agent.

So the build moves off the fleet: **one x86_64 runner** builds and pushes to GHCR
(`.github/workflows/build-dsh-image.yml`), **each host only does `docker pull`** — a step DO can afford.

🔴 **THE SECOND HALF OF THAT SENTENCE HAS NEVER ACTUALLY RUN — MEASURED 08/09/2026.** `docker pull` returns `denied` on
**both** machines tried, including the very runner that pushed the image:

```
prod1        docker pull ghcr.io/tracyhq/tracy-dsh:2026-09-08-af935429  ->  denied
tracy-runner docker pull ghcr.io/tracyhq/tracy-dsh:2026-09-08-8bea3c674 ->  denied
```

Nobody noticed because **no host has needed to pull yet**: the dev machine has the image it *built* (it is the
`tracy-build` runner), and contabo does not run one-dsh yet. So `deploy-host-dsh.sh --tag …` — the official deploy
path, and the path CI takes — will fail at the first step on any host that is not the runner.

The runner's `/root/.docker/config.json` has `ghcr.io` auth (copied to prod1 already, still `denied`), so
this is about **read permission on the package**, not a missing login: the CI token has `packages: write` for the
push, not `read:packages` for the pull. It must be fixed **before the first dsh base upgrade**, with
a `read:packages` PAT on the host or by opening the package to the org.

⚠ Until then, the only path is `docker save … | ssh … docker load` (last part of this §1) — which is
how the `main` image reached prod1 on 08/09.

```bash
# On the host: build NOTHING. Deploy is one command, and it rolls itself back on failure.
/opt/tracy-fleet/dsh/deploy-host-dsh.sh --tag 2026-09-07-a1b2c3d
/opt/tracy-fleet/dsh/deploy-host-dsh.sh --rollback
```

CI calls that same script, so the manual path is the path CI takes every day — not a runbook passage that has
drifted. It preflights three files (and `TRACY_SITE_DOMAIN` in the env file, below), pulls, writes the tag (keeping the old tag in `DSH_IMAGE_TAG_PREVIOUS`), runs `up -d`, waits for
healthy, runs two measurements, and **restores the old tag by itself when any step fails**.

**Building by hand still works** — to try a change before pushing — then point `DSH_IMAGE` at the local build:

```bash
DSH_COMMIT=$(git ls-tree HEAD vendor/tracy/deepseek-harness | awk '{print $3}')
docker build -f packages/fleet/tracy-fleet-operation/dsh/Dockerfile \
  --build-arg DSH_COMMIT="$DSH_COMMIT" --build-arg SOURCE_COMMIT="$(git rev-parse HEAD)" \
  -t tracy/dsh:dev .
# then in /etc/tracy/host-dsh.env: DSH_IMAGE=tracy/dsh and DSH_IMAGE_TAG=dev
```

🔒 **To know which build a host is running, ASK THE CONTAINER, not the env file.** `/etc/tracy/host-dsh.env` says
what someone *intended* to deploy; after a manual `docker run` or a half-finished deploy, the two
drift apart and the container is the one that is right:

```bash
docker inspect tracy-dsh --format '{{.Config.Image}}'
docker exec tracy-dsh printenv TRACY_SOURCE_COMMIT TRACY_DSH_COMMIT
```

🔒 **`/etc/tracy/host-dsh.env` must have a non-empty `TRACY_SITE_DOMAIN`** — the sites' public domain,
**the same value as `SITE_DOMAIN` in `/etc/tracy/tracy-web.env`** (dev: `tracy.site`). Every key
in the env file reaches the container through `host-dsh.yml`'s `env_file`; site-tools reads this variable to recognise
the site's own https origin (`https://<label>.<domain>/`, #306). Without it the container is still healthy,
but `page.text`/`page.look` refuse **every** https page of the fleet with `REDIRECTED_OFF_SITE` — the agent is
blind for the whole session (measured on dev 24/09 after the #306 deploy: `printenv TRACY_SITE_DOMAIN` empty). So
`deploy-host-dsh.sh` refuses to deploy (including `--dry-run`) when the file lacks the variable or leaves it empty, before pulling
or changing anything on the host. It checks more strictly than compose reads, because compose reads differently: `TRACY_SITE_DOMAIN= # TODO`
is empty to compose (end-of-line comment), and a later duplicate line overrides the earlier one. So there must be **exactly one** line
`TRACY_SITE_DOMAIN=<domain>`, no comment on that line, the value a bare hostname (optionally wrapped in one pair of
quotes). Check what the container actually receives:

```bash
docker exec tracy-dsh printenv TRACY_SITE_DOMAIN
```

🔒 **`DSH_COMMIT` has no default value, and that is deliberate.** The official client build stamps
dsh's commit into itself; a hard-coded stamp goes stale the moment the submodule pointer moves, and a
stale stamp is **invisible** in a built image. The Dockerfile refuses to build without it —
see [`dsh/Dockerfile`](./Dockerfile).

🔒 **`--build-arg DOCKER_GID` IS GONE (changed 06/09).** Baking the `docker` group's gid into the image makes
the image a per-host artifact: a host with gid 998 and a host with 999 need two builds, two digests — exactly
what "one image for the whole fleet" exists to stop, and the symptom on the second host is `docker ps` from
inside the container returning `permission denied`, which reads exactly like a missing mount.

With this compose file the question does NOT arise: dsh talks to the daemon through the socket proxy
(`TRACY_DOCKER_HOST: tcp://docker-proxy:2375`), so the dsh container mounts no socket and needs
no group at all. Anyone falling back to the bare-socket path grants the group AT RUN TIME, not at build time:

```yaml
group_add: ["${DOCKER_GID}"]   # DOCKER_GID=$(stat -c %g /var/run/docker.sock)
```

⚠ An image stays on the machine it was built on. To move it: `docker save … | ssh … docker load`.
**Do not** copy the `profiles/node_modules` layer between two machines — it is a symlink garden pointing into the pnpm store **inside
the image**, and two different images yield 485 broken links while the container is still "Up"
([`ban-do-fleet.md`](../../../../docs/references/ban-do-fleet.md) §10).

---

## 2. Ship the code to the host

`host-dsh.yml` and `host-dsh-init.sh` must be in `/opt/tracy-fleet/dsh/` on the host.

⚠ **`dsh/` must be in the `ALLOWED` list of `deploy/fleet-receive.sh`** — that script lives in
`tracy-infra`, **not** in this repo, and it flattens each allowed folder into
`/opt/tracy-fleet`. Ask **once** for all three: `provision/`, `web/`, `dsh/`.

- `provision/` — Task 3 moves `ensure-site-folder.mjs` + `siteFolder.mjs` there, and
  `attach-site.sh` lives there (`scripts/tools/` is **deliberately** outside `ALLOWED`).
- `web/` — `IMAGE_TAGS`, the source of `WEB_IMAGE` for every site.
- `dsh/` — the four files of this runbook.

🔒 **`host-dsh.yml` and `docker-proxy.haproxy.cfg` must sit NEXT TO EACH OTHER.** Compose mounts the rules file
by a **relative** path (`./docker-proxy.haproxy.cfg`), i.e. relative to the folder holding the compose
file. If it is missing, `docker compose up` **creates a folder** at that exact path, haproxy cannot parse
it, and the first thing anyone notices is an agent for which **every command** fails. `host-dsh-init.sh` checks
that file at step 0 and refuses to run when it is missing.

If one of the three is missing, the provision run still runs and still reports success; what breaks is a web image missing
`rg`, or a host with no compose to `up`. Both are failures that take a long time for anyone to notice.

⚠ **This repo's ship path (`.github/actions/deploy-host-dsh/action.yml`) copies `lib/`,
`provision/`, `tools/`, `webroot/` to `/opt/tracy-fleet/` as well** before calling `deploy-host-dsh.sh` —
the sentence "`scripts/tools/` is deliberately outside `ALLOWED`" above is about `tracy-infra`'s `fleet-receive.sh`,
not about the deploy path in use. A host that receives files via `tracy-infra` rather than through that action
has no `tools/resync-access-plugin.sh` (§2bis) and must copy it by hand and then run the backfill.

**Since W5 (beta shard, 15/10/2026), the `tracy-host` image also carries the seven `dsh/` files that the `deploy-host-dsh` action installs, in `/opt/tracy-fleet/dsh/`**
(`apps/tracy-host/Dockerfile`). prod1 and dev still receive them from the action as above; a machine without a checkout (a shard)
takes them from the image it is about to run (`docker create` + `docker cp`, updater W3). The two sets must match file for file:
`scripts/test/tracy-host-fleet-files-image.test.mjs` keeps them in sync, and the `deploy-dev` job compares them byte by byte.

---

## 2bis. `tracy-access.php` on WordPress sites — carried by deploy, backfilled once (#677)

`provision/platform/wordpress.sh` copies `provision/access/wordpress/tracy-access.php` into
`<webroot>/wp-content/mu-plugins/` **only when the site is built**. Before #677 nothing copied it again: deploy shipped the new
version to `/opt/tracy-fleet/provision/`, while every existing WordPress site kept the version from the day it was built
(sites built before #618 still showed the admin bar that #618 removed). That file grants an admin session from a
header, so a change to it is a security fix and must reach every site in the very deploy that ships it.

- **Every deploy:** `deploy-host-dsh.sh` step 8 — after the new image is healthy, **and also** at the
  "same tag, nothing to deploy" exit (most deploys) — runs
  `/opt/tracy-fleet/tools/resync-access-plugin.sh`. It writes only where the bytes differ; writes through a temp file in the same
  folder and then `mv`, mode 0644; refuses any symlink along the path. The script's header says it all.
- 🔒 **It runs through the daemon, in a one-off container of the image just deployed**, not
  directly in the deploy's shell: the deploy runner mounts only `/opt/tracy-fleet`, `/etc/tracy` (and on
  some machines `/srv/tracy`), **not** `/srv/tracy-sites` — run there it would see no site and
  report green. The sites folder comes from `HOST_SITES_ROOT` in `/etc/tracy/host-dsh.env` (default
  `/srv/tracy-sites`), the same folder `host-dsh.yml` mounts into dsh.
- **On failure the deploy goes red, the image is NOT rolled back:** the image is still healthy, and rolling the image back does not undo files already
  written. The log names each failed site and the command to rerun. `--dry-run` only describes, writes nothing.
- **No timer.** The file only changes when a new `/opt/tracy-fleet` is shipped, i.e. exactly at deploy time;
  a timer between two deploys adds nothing but one more unit to install on every host.
- 🔒 **Never package this file into the public claude-cowork plugin** (the way the Joomla package updates
  itself): it trusts a header to log in as admin, and may only exist on sites Tracy runs.

**Backfill — once per host** (a host with sites older than the first deploy carrying step 8, or a host
that does not deploy through the action above). As root, on the host:

```bash
SRC=/opt/tracy-fleet/provision/access/wordpress/tracy-access.php
# 0. The same sites folder deploy uses: HOST_SITES_ROOT in host-dsh.env, /srv/tracy-sites if empty.
#    The script reads TRACY_SITES_ROOT; unset, it uses /srv/tracy-sites even if host-dsh.env says otherwise.
export TRACY_SITES_ROOT="$(grep -m1 '^HOST_SITES_ROOT=' /etc/tracy/host-dsh.env | cut -d= -f2- | tr -d "\"'\r")"
export TRACY_SITES_ROOT="${TRACY_SITES_ROOT:-/srv/tracy-sites}"
# 1. Before: the shipped copy and each site's copy (different hash = site holds an old copy)
sha256sum "$SRC" "$TRACY_SITES_ROOT"/*/.webroot/wp-content/mu-plugins/tracy-access.php
# 2. One site first, then the whole host
/opt/tracy-fleet/tools/resync-access-plugin.sh <label>
/opt/tracy-fleet/tools/resync-access-plugin.sh
# 3. After: every line has the same hash as $SRC
sha256sum "$SRC" "$TRACY_SITES_ROOT"/*/.webroot/wp-content/mu-plugins/tracy-access.php
# 4. Rerun: must print "done: 0 updated, N up to date, …, 0 failed" and not change mtime
/opt/tracy-fleet/tools/resync-access-plugin.sh
```

**Acceptance in the browser** (a site built before #618, e.g. `kineticakemi`): open the site through
cowork.tracy.ai with an **editor** seat (logged in via auto-login), look at the public page (frontend).
In DevTools: `document.getElementById('wpadminbar') === null` and
`!document.body.classList.contains('admin-bar')` must both be `true`. Before the backfill those two values are
`false` on an old site.

⚠ The #677 brief named the old dev host (`<old-dev-host>`) as the test machine, but that machine **has been cold since 28/09/2026**
([`may-dev.md`](../../../../docs/references/may-dev.md)) — do not deploy to it. The coordinator picks the right
test host (current dev or prod1) before measuring; at the time of writing **nothing has been measured on any host**.

---

## 3. `host-dsh-init.sh`

Run **on the host**, as root.

```bash
# Read first, run after. --dry-run prints each command and changes nothing (runs on a laptop, macOS included).
bash /opt/tracy-fleet/dsh/host-dsh-init.sh s1 --dry-run \
  --image-tag "$DSH_TAG" --tracy-origin https://s1.tracy.ai \
  --actor-secret-file /root/s1-actor.secret --seat-secret-out /root/s1-seat.secret

bash /opt/tracy-fleet/dsh/host-dsh-init.sh s1 \
  --image-tag "$DSH_TAG" --tracy-origin https://s1.tracy.ai \
  --actor-secret-file /root/s1-actor.secret --seat-secret-out /root/s1-seat.secret
```

`<host>` is the machine's label: `prod1`, `dev`, `staging`, or a shard `s1`…`s6`. Rule: one lowercase letter, then
lowercase letters or digits, at most 16 characters (`^[a-z][a-z0-9]{0,15}$`, no `_`) — the same shard-name regex that
`SHARD_NAME` in `apps/tracy-web/src/lib/shard-shapes.js` and the shard installer will both check; change one, change
all three. ⚠ The other two **are not on `develop` yet**: `shard-shapes.js` arrives with W1, the installer with W3/W4;
until then `test/host-dsh-init.test.mjs` only checks the script's half (the half comparing against `SHARD_NAME` switches on by itself when that file
appears). The label goes into three places: the variable names tracy-web reads for this machine (`HOST_<host>_ORIGIN`,
`HOST_<host>_DSH_ORIGIN`, `SEAT_<host>_SECRET` — `readHosts` in `apps/tracy-web/src/config.js`), the
shard name, and the hostname `<host>-agent.tracy.ai`. The hard-coded list `contabo|do|dev|prod1` from the Worker era is gone.

| Flag | What it does | Default |
|---|---|---|
| `--tracy-origin <url>` | writes `MCP_TRACY_ORIGIN` into `dsh-passwords.env`: the tracy-web that dsh sends users to and calls (`${MCP_TRACY_ORIGIN}/api/sites/…`). A bare `https://…` origin, no path, no trailing `/` | `https://cowork.tracy.ai` (production); without the flag the script warns. `dev` passes `https://cowork.tracy.site`, a shard passes `https://sN.tracy.ai` |
| `--actor-secret-file <path>` | reads `MCP_TRACY_ACTOR_SECRET` from a file (never a value on the command line: `ps` and history see it) | required for every host, unless `--template-lane` is given |
| `--seat-secret-out <path>` | writes `MCP_SEAT_SECRET` to a 0600 file instead of printing it to the terminal; a rerun with `dsh-passwords.env` kept writes the same old value again | no file written; the banner prints once |

**The actor secret must EQUAL `MCP_TRACY_ACTOR_SECRET` in `/etc/tracy/tracy-web.env` of the tracy-web at
`--tracy-origin`.** Nobody edits the two places at once; when they differ, every agent write returns `NOT_SIGNED_IN`
while the healthcheck stays green (dev machine 10–17/09/2026; `apps/tracy-web/src/lanes/route.js`, door
`/auth/actor-check`). So the script **does not generate** an actor secret for any host, `dev` included (the `dev` branch
that generated its own key in the Worker era is gone): a new machine generates the value **once**, writes it into tracy-web.env, then
hands that same value to init through a file. `--template-lane` (a Tracy lane running on the same host) is still
there for old machines: it copies `MCP_TRACY_ACTOR_SECRET` and `.credentials.yaml`.

The other five secrets are **generated fresh for this host**: `SETUP_KEY`, `MCP_JWT_SECRET`, `MCP_INTERNAL_SECRET`,
`MCP_DB_ENC_KEY`, and `MCP_SEAT_SECRET`. A leaked key from one host must not open another.

🔒 **`MCP_SEAT_SECRET` must go into `/etc/tracy/tracy-web.env` as `SEAT_<host>_SECRET`**, together with
`HOST_<host>_DSH_ORIGIN=http://tracy-dsh:8080`, then restart tracy-web (without either one, tracy-web
does not start: `readHosts` in `apps/tracy-web/src/config.js`). The installer uses `--seat-secret-out`;
someone running it by hand copies it from the banner (printed once). `--force` generates a new key: every mint fails until tracy-web.env is updated to match.

**New machine: write `/etc/tracy/host-dsh.env` in full BEFORE running init.** Init only writes `DSH_IMAGE_TAG`,
`HOST_AGENT_HOSTNAME`, `HOST_SITES_ROOT`, `HOST_DSH_HOME` and **keeps** an existing file. Without
`TRACY_SITE_DOMAIN`, `deploy-host-dsh.sh` refuses to deploy; without `MODEL_API_KEY` the agent is mute.

⚠ **A pre-written file must carry all four lines that init would write**, because init keeps an existing file and adds nothing to it:
`DSH_IMAGE_TAG` (exactly the value of `--image-tag`), `HOST_AGENT_HOSTNAME`, `HOST_SITES_ROOT`,
`HOST_DSH_HOME`. For a prefixed dsh such as `d1`, these four lines carry its own values. A mismatched
`DSH_IMAGE_TAG` is a silent mismatch: step 4b (seed profile) uses `--image-tag` while `docker compose up` uses
`DSH_IMAGE_TAG` from the file, so the profile is seeded from one image while the container runs another.

If `dsh-passwords.env` already exists, init keeps it unchanged, `MCP_TRACY_ORIGIN` included; passing a `--tracy-origin` different from the
value in the file makes the script warn, not edit. So running machines (prod1, dev) change nothing when
init is rerun.

🔒 **Leave `MCP_TRACY_SITE_KEY` and `MCP_TRACY_SITE_LABEL` EMPTY.** This dsh serves every site, so it
is not any site's lane; the folders it may touch come from tracy-web's **grant**
(`folders: ['/site/<label>']`), not inferred from a site the container claims for itself.

⚠ That empty field used to be a real trap, and it **was patched** on 06/09 (`ffa0ee5b`,
`vendor/tracy/dsh-passwords/src/gateway.ts`). Before the patch, `tracyDoorOpen` required `siteKey` too, so the host
dsh fell back to `/gateway/login` — the door that `MCP_SEAT_SECRET` itself had turned into a 404. A container
**with no way in at all**, and the only symptom was a JSON body where a login page should have
been. Now `tracyDoorOpen` asks only for `origin` + `actorSecret`; `siteKey` only guards the **local**
login pages (`/gateway/tracy/*`), which the host dsh does not have and does not need. Check whether the image in use
carries that patch before looking for the cause elsewhere.

⚠ **Run init BEFORE the first `up`, and it takes care of that itself.** The image's entrypoint **generates**
`dsh-passwords.env` when the file is absent — right for a dev cluster, but on the fleet it produces a
file **without an actor secret**, and the result is every login failing silently. Init writes
our file first, so the entrypoint does not touch it (it never overwrites).

Init also does two things that are easy to forget because they do not belong to the container:

- `/srv/tracy-sites` is `mount --bind`ed onto itself and then `--make-rshared`, plus an fstab line
  `bind,shared`. Without this step compose **refuses to start** (`path … is not a shared
  mount`), and if only the word `shared` is dropped from fstab, the first site attached after a reboot is
  **invisible** to the running dsh. The same three lines are in
  [`provision/attach-site.sh`](../scripts/provision/attach-site.sh); they live in both places because a new host
  runs init **before** any site is provisioned.
- `/srv/tracy/host-dsh/home/{sessions,storages,dsh-passwords-data,workspace}` chowned `33:33`. uid 33
  is `www-data`, which the image runs as. Left owned by root, the container starts normally and then cannot write
  sessions — the user-facing symptom is **a conversation that forgets everything**.

The last step of init is one **real signed** `POST /gateway/seat/session` to `127.0.0.1:51700`
(template in [`ban-do-fleet.md`](../../../../docs/references/ban-do-fleet.md) §5 step 5; the signing string matches
[`apps/tracy-web/src/workspace/seat-door.js`](../../../../apps/tracy-web/src/workspace/seat-door.js) byte for byte —
cross-checked by machine, see §Measured). `200 {"ok":true,…}` means **the container is off the hook**: whatever
breaks after that breaks in a layer above it.

---

## 4. Cloudflare — DNS, ingress, Access

⚠ **History (Worker architecture, retired 16/09/2026).** Today tracy-web calls dsh over the Docker network
(`HOST_<host>_DSH_ORIGIN=http://tracy-dsh:8080`); this section is kept for reading old machines, it is not a step for a new machine.

Run from a machine that has `TRACY_CF_API_TOKEN` (token and account id in `tracy-desk/.env`).

```bash
export TRACY_CF_API_TOKEN=…
export TRACY_CF_ACCOUNT_ID=<cf-account-id>
export TRACY_CF_ZONE_ID=…          # zone tracy.ai
A=$TRACY_CF_ACCOUNT_ID; Z=$TRACY_CF_ZONE_ID; T=$TRACY_CF_API_TOKEN
```

**Step 0 — look up the tunnel of the RIGHT machine.** This step comes before every other one, because get it wrong and every
later measurement measures the wrong machine and **still produces results that look plausible**.

```bash
curl -s -H "Authorization: Bearer $T" \
  "https://api.cloudflare.com/client/v4/accounts/$A/cfd_tunnel?is_deleted=false" \
  | python3 -c 'import json,sys; [print(t["id"], t["name"]) for t in json.load(sys.stdin)["result"]]'
```

`contabo-agent.tracy.ai` goes through contabo's tunnel; `do-agent.tracy.ai` goes through
`tracy-fleet-01`'s tunnel. Set `TUNNEL` for the host you are working on.

**DNS — a proxied CNAME pointing at the tunnel.** The same shape that `upsertDnsRecord` in
`workers/seat-registry/src/fleetCloudflare.js` builds for every lane:

```bash
HOSTNAME=contabo-agent.tracy.ai
TUNNEL=<id from step 0>

# PATCH if it exists, POST if not — read first, do not create duplicates.
EXISTING=$(curl -s -H "Authorization: Bearer $T" \
  "https://api.cloudflare.com/client/v4/zones/$Z/dns_records?name=$HOSTNAME" \
  | python3 -c 'import json,sys; r=json.load(sys.stdin)["result"]; print(r[0]["id"] if r else "")')

BODY="{\"type\":\"CNAME\",\"name\":\"$HOSTNAME\",\"content\":\"$TUNNEL.cfargotunnel.com\",\"proxied\":true}"
if [ -n "$EXISTING" ]; then
  curl -s -X PATCH -H "Authorization: Bearer $T" -H 'content-type: application/json' \
    "https://api.cloudflare.com/client/v4/zones/$Z/dns_records/$EXISTING" -d "$BODY" | head -c 200
else
  curl -s -X POST -H "Authorization: Bearer $T" -H 'content-type: application/json' \
    "https://api.cloudflare.com/client/v4/zones/$Z/dns_records" -d "$BODY" | head -c 200
fi
```

**Ingress — use the existing script, do not rewrite it.**
[`provision/ingress_api.py`](../scripts/provision/ingress_api.py) reads the whole list and writes it back
in one pass and **keeps the catch-all rule at the end** — the thing that once lost an address
(a lane's `<label>-agent` address, 02/09: DNS present, ingress absent, the hostname returned 404 from the catch-all rule itself, while the
site ran 200 and the container was healthy).

```bash
TRACY_TUNNEL_ID=$TUNNEL python3 /opt/tracy-fleet/provision/ingress_api.py \
  --hostname contabo-agent.tracy.ai --port 51700
```

🔒 **The REAL ingress lives on Cloudflare, not in `/etc/cloudflared/config.yml`.** cloudflared
on the fleet runs `tunnel run --token …`, i.e. remote configuration; the file on disk **is ignored** and has
drifted. Reading that file and concluding "this hostname is not served" is a wrong conclusion read from
a real file.

**Access — copy the running app, do not build it from memory.**

```bash
# Template app: the lane sidecar currently serving, with the same policy we need.
curl -s -H "Authorization: Bearer $T" \
  "https://api.cloudflare.com/client/v4/accounts/$A/access/apps" \
  | python3 -c 'import json,sys
for a in json.load(sys.stdin)["result"]:
    if a.get("domain","").endswith("-agent.tracy.ai"): print(a["id"], a["domain"], a["name"])'

# Its policy — read it to get the EXACT id of the service token currently accepted.
curl -s -H "Authorization: Bearer $T" \
  "https://api.cloudflare.com/client/v4/accounts/$A/access/apps/<template-app-id>/policies" | head -c 800
```

```bash
# Create the app for the new hostname.
APP=$(curl -s -X POST -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  "https://api.cloudflare.com/client/v4/accounts/$A/access/apps" \
  -d '{"name":"Tracy host dsh contabo","domain":"contabo-agent.tracy.ai","type":"self_hosted","session_duration":"24h"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["id"])')

# non_identity policy, include the EXACT service token read above.
curl -s -X POST -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  "https://api.cloudflare.com/client/v4/accounts/$A/access/apps/$APP/policies" \
  -d '{"name":"Cowork proxy only","decision":"non_identity","include":[{"service_token":{"token_id":"<id of cowork-agent-proxy>"}}]}' \
  | head -c 300
```

🔒 **The token must be the one `cowork-web` ACTUALLY presents**, i.e. `cowork-web`'s `AGENT_CLIENT_ID`
— **not** `seat-registry`'s `CF_ACCESS_CLIENT_ID`, and not
`TRACY_CF_ACCESS_CLIENT_ID` in `tracy-desk/.env` (that one is the **`Tracy`** token). This mix-up
happened on 02/09: every lane built after that had Access refuse Tracy's own proxy
(`service_token_status: false`), and users were kicked out to the Cloudflare login page. The fix path was removed
from `publishLaneAgent` for exactly that reason — read the comment block there before automating this step
again.

Repeat all four commands for `do-agent.tracy.ai` with `tracy-fleet-01`'s tunnel.

---

## 5. Socket proxy — OUR OWN rules, and the evidence

The dsh container does **not** mount `/var/run/docker.sock`. It calls `tcp://docker-proxy:2375`, which is
`haproxy` (pinned tag + digest) running exactly one rules file:
[`docker-proxy.haproxy.cfg`](docker-proxy.haproxy.cfg) — committed in this repo, mounted `:ro` from
**next to** `host-dsh.yml`.

### Why not use the switches of `tecnativa/docker-socket-proxy`

That image's rules are **per API prefix**. Measured 06/09/2026: `CONTAINERS=1` — which `docker exec` requires,
because `POST /containers/<id>/exec` sits under that prefix — **also opens**
`POST /containers/create`. Through that very proxy, this command **RUNS**:

```
docker run --rm -v /:/host:ro alpine ls /host      # → Users Volumes bin boot …
```

That is: whatever reaches the proxy reaches root on the host. `ALLOW_START=0` does not save it —
it is only considered when `CONTAINERS=0`. A per-prefix switch **cannot express** the sentence we need:
*"exec, only exec, and only into that container"*.

⚠ Nor can a config be mounted over that image: its entrypoint **regenerates**
`/usr/local/etc/haproxy/haproxy.cfg` from a template at every start (`sed … > …`), so a bind
mount at that path would be **overwritten — on the host's own file**.

### The rule, in one sentence

Let through the **seven** requests that `docker exec [-i|-it] [-u …] [-w …] [-e …] <name> <command>` makes, and only
when `<name>` matches `^[a-z0-9][a-z0-9-]*-web-1$`. Everything else → **403**.

That name is not an arbitrary convention: `fleetLabel()`
(`workers/seat-registry/src/fleet.js`) only produces `[a-z0-9-]` starting with `[a-z0-9]`, and
`render-compose.sh` names the service `web` and the project after the label — so `<label>-web-1` is the name compose
actually creates. `@tracy/dsh-subprocess-docker` declares that exact pattern (`containerName:
'{label}-web-1'`).

### Measured: one `docker exec -it` hits exactly five paths

Read straight from the proxy's own `docker logs` (`option httplog`), 06/09/2026:

```
200  HEAD /_ping
200  GET  /v1.54/containers/wpdemo-web-1/json
201  POST /v1.54/containers/wpdemo-web-1/exec
200  GET  /v1.54/exec/912d650f…cd1a29ed/json
101  POST /v1.54/exec/912d650f…cd1a29ed/start
```

`POST /exec/<id>/resize` is the sixth path (appears only when the terminal changes size) and
`GET /version` is the seventh (`docker version`, and some version negotiations). Both
are let through and both were measured separately with curl.

Two details of the path pattern, both measured and both breaking the rule if guessed wrong:

- **The `/v1.54` prefix is real.** The CLI negotiates a version and then prepends it to every path. A regex
  without `(/v[0-9]+\.[0-9]+)?` matches **nothing** the CLI actually sends.
- **The exec `<id>` is 64 hex characters.** The rule pins exactly `{64}`; `/exec/deadbeef/start` is refused.

### Test table — positive

| Command (through the proxy) | Result |
|---|---|
| `docker exec -i -u www-data -w /tmp -e FOO=bar wpdemo-web-1 …` | `www-data /tmp bar` |
| `docker exec -i -u nobody wpdemo-web-1 id -un` | `nobody` |
| `docker exec -it -u www-data wpdemo-web-1 …` (with TTY) | `TTY-OK-www-data` |
| `docker version` | `29.4.1` (the server half answers) |
| `GET /v1.51/containers/wpdemo-web-1/json` | `200` |
| `HEAD /_ping` · `GET /v1.51/version` | `200` · `200` |

### Test table — negative (every row is `403 Forbidden`)

| Command (through the proxy) | Why it must die |
|---|---|
| `docker run --rm debian:stable-slim true` | `POST /containers/create` — the way out to host root |
| `DOCKER_BUILDKIT=0 docker build <ctx>` | `POST /build` |
| `docker ps` | `GET /containers/json` — inventory of the machine |
| `docker exec -i wpdemo-db-1 true` | **not** `-web-1`: the database |
| `docker exec -i tracy-dsh true` | **not** `-web-1`: dsh itself — exec into it escapes the seat door into the very process that enforces it |
| `docker exec -i tracy-docker-proxy true` | **not** `-web-1`: the proxy itself |
| `docker stop` · `start` · `kill` · `rm -f` `wpdemo-web-1` | same container, different verb |
| `docker logs wpdemo-web-1` | `GET /containers/<n>/logs` — the site's logs |
| `docker cp wpdemo-web-1:/etc/hostname -` | `GET /containers/<n>/archive` |
| `docker attach wpdemo-web-1` | `unable to upgrade to tcp, received 403` |
| `docker images` · `volume ls` · `network ls` · `info` · `system df` | `/images` `/volumes` `/networks` `/info` `/system/*` |

And with curl, not through the CLI:

| Request | Code |
|---|---|
| `POST /v1.51/containers/create` · `POST /containers/create` (no prefix) | `403` · `403` |
| `POST /v1.51/containers/tracy-dsh/exec` | `403` |
| `POST /v1.51/containers/WPDEMO-WEB-1/exec` | `403` (the rule has **no** `-i`; see below) |
| `POST /v1.51/containers/wpdemo_web_1/exec` | `403` |
| `POST /v1.51/containers/%2e%2e%2fbuild/exec` | `403` (the path is url-decoded **before** matching) |
| `POST /v1.51/exec/deadbeef/start` | `403` (id is not 64 hex) |
| `GET /v1.51/containers/wpdemo-web-1/json` | `200` |

⚠ **Uppercase once slipped through.** The first version of this rule wrote the regex with the `-i` flag, and
`POST /containers/WPDEMO-WEB-1/exec` **reached the daemon** (measured: `400`, i.e. it got past the proxy). Docker
allows uppercase in container names, so `-i` was a real widening. That flag is gone; fleet labels
are always lowercase so nothing is lost.

### The proxy container is narrowed four more notches

`user: 0:0` (haproxy connects to the socket **after** dropping privileges, so it has to be root — no group
knows the host's `docker` gid in advance to be granted), then compensated by: `cap_drop: [ALL]`,
`security_opt: no-new-privileges`, `read_only: true` + `tmpfs: /run`, and the network
`docker-api: internal: true` — **no route to the Internet**. Measured: all four on at once, `docker
exec` still runs, `POST /containers/create` is still `403`, healthcheck `healthy`.

### What it still does NOT block — read this before quoting the tables above

🔒 **The rule filters the PATH, not the REQUEST BODY.** `POST /containers/<x>-web-1/exec` carries a JSON
body, and haproxy has no opinion on it — so `{"Privileged":true,"User":"0"}` is let through by **every rule
in the file**. Measured 06/09/2026 through the committed file:

| Exec call | Result inside the web container |
|---|---|
| `{"Privileged":true,"User":"0"}` | `uid 0`, `CapEff 000001ffffffffff` — **every capability** |
| normal (`User: www-data`) | `uid 33`, `CapEff 0000000000000000` |

Meaning: that rules file blocks **WHICH CONTAINER**, but does **not** block which user the exec runs as or what it
may do once inside. The previous version of this document said "as that container's user" — **wrong**, and wrong
in the direction that makes the reader stop looking.

🔒 **The SECOND boundary is the web container's own confinement profile.** In the same measurement, the attempt
to escape to the host **failed** (`mount: permission denied`, `/dev` has no block device) — but it
failed because that container runs Docker's **default seccomp/AppArmor** profile. That profile now
carries the host's share of the load, so it is **pinned**, not assumed:

| Pinned where | What it does |
|---|---|
| `provision/render-compose.sh` | writes `security_opt: ["no-new-privileges:true"]` for the web service of **every** platform |
| `provision/attach-site.sh` | **REFUSES** to attach a site whose `<label>-web-1` runs `--privileged` or `seccomp`/`apparmor` `unconfined` |
| `lib/container-confinement.sh` + test | the part that reads `docker inspect`, with its own test |

⚠ **`no-new-privileges` does NOT close that exec hole** — and claiming otherwise is worse than not adding it.
Measured both ways: a privileged exec into a container **with** that flag still gets every capability.
What it buys is the ordinary case: a setuid binary sitting in the webroot cannot escalate. It is cheap, so it stays
on.

🔒 **Before moving any site, scan EVERY site on the host** — one line, run on the host:

```bash
for c in $(docker ps --format '{{.Names}}' | grep -- -web-1); do
  printf '%-34s %s\n' "$c" "$(docker inspect "$c" --format '{{.HostConfig.Privileged}} {{.HostConfig.SecurityOpt}}')"
done
```

Reading the output: `false []` or `false [no-new-privileges:true]` is **right**. Any `true …`, or
`seccomp=unconfined` / `apparmor=unconfined`, is a site that **must be rebuilt** before turning on the flag
`host-dsh:<label>` — the usual origin is a `--privileged` someone added to debug a mount and then
forgot to remove. `attach-site.sh` will refuse it, but knowing beforehand is cheaper than finding out mid-move.

### Resource ceilings — one site must not eat the whole machine (28/09/2026)

The confinement profile above blocks **escaping**; it does not block **eating everything**. Every agent command runs in
the site's web container (bash, node, `page.look`'s Chromium, `site.rebuild`'s `astro build`), and
until 28/09 no container had a ceiling: `docker inspect` on the stand read `Memory=0 NanoCpus=0`,
`PidsLimit` empty for every site and for `tracy-dsh`. One heavy command of one site took memory, cores and the process
table from every other site on the host (the dev machine once OOM-killed an EmDash rebuild with ~500 MB
free, 26/09).

| Container | Default ceiling | Set where |
|---|---|---|
| web Joomla/WordPress | `2g` · 2 cores · 1024 processes | `TRACY_SITE_MEMORY`, `TRACY_SITE_CPUS`, `TRACY_SITE_PIDS` in tracy-host's env (`/etc/tracy/tracy-web.env`) |
| web EmDash | `3g` · 2 cores · 1024 | `TRACY_SITE_MEMORY_EMDASH` |
| MariaDB | `1g` · 2 cores · 1024 | `TRACY_SITE_DB_MEMORY` |
| `tracy-dsh` | `4g` · 2 cores · 4096 | `TRACY_DSH_MEMORY`, `TRACY_DSH_CPUS`, `TRACY_DSH_PIDS` in `/etc/tracy/host-dsh.env` |

Swap always equals the memory ceiling (no escaping into the host's swap). Site cores: 2, or 1 on a machine
with fewer than 4 cores, and never more than the machine's core count — docker **refuses to create** a container asking for more cores
than the machine has (`range of CPUs is from 0.01 to 2.00`). For the same reason, a `TRACY_DSH_CPUS` set above the core count
means the next `up -d` **cannot bring dsh up**: prod1 has 6 cores, so 4 works. The measurements behind each number are in
the `tracy_site_limits` comment (`provision/render-compose.sh`) and in `host-dsh.yml`.

Three ways in:

1. **New site** — `render-compose.sh` writes four lines `mem_limit`/`memswap_limit`/`cpus`/`pids_limit`
   into the web (and db) of every compose it writes. A bad value (`2GB`, `0`, `-1`) makes provisioning **stop**
   and name the variable, writing nothing.
2. **Running site** — the container keeps what it was created with (no ceiling) until it is
   recreated. Set the ceiling now, no restart, no recreate:

   ```bash
   /opt/tracy-fleet/provision/apply-site-limits.sh            # dry run: current ceiling → ceiling to set
   /opt/tracy-fleet/provision/apply-site-limits.sh --apply    # docker update each container
   /opt/tracy-fleet/provision/apply-site-limits.sh --apply --label <label>
   ```

   It skips (and names) a container using ≥ 90 % of the new ceiling — lowering the ceiling below current usage
   makes the kernel kill a process in a live site. `docker update` survives restart and reboot,
   **not** a recreate; each printed line tells whether the site's compose already carries the ceiling —
   if not, `render-compose.sh <label>` so the next recreate keeps the ceiling.
3. **`tracy-dsh`** — `host-dsh.yml` carries the ceiling; the next `up -d` (deploy) recreates the container with it.

Check against the container, not the file:

```bash
for c in $(docker ps --format '{{.Names}}' | grep -E -- '-(web|db)-1$|^tracy-dsh$'); do
  printf '%-34s %s\n' "$c" "$(docker inspect "$c" --format '{{.HostConfig.Memory}} {{.HostConfig.MemorySwap}} {{.HostConfig.NanoCpus}} {{.HostConfig.PidsLimit}}')"
done   # 0 0 0 <no value> = no ceiling yet
```

When a command hits the memory ceiling, the kernel kills the largest process **in that container**; `docker exec`
returns `137`. `@tracy/dsh-subprocess-docker` asks the container again (`memory.events`) and adds a line after the
command's stderr for the agent to read: what the ceiling is, how many processes the kernel killed for memory.

⚠ **Not measured:** whether a `Privileged` exec (the hole in the section above) can raise its own ceiling.
Assume it can — that hole is the whole container.

⚠ **Do not name a non-site container `*-web-1`.** The proxy's rule trusts the name. A hijacked dsh
**cannot** create a new container (`POST /containers/create` → 403), but a container that an
operator started by hand and named `foo-web-1` can be `exec`ed into.

⚠ **The hostnames `contabo-agent` / `do-agent` share a namespace with the lanes**: `publishLaneAgent`
builds `<label>-agent.tracy.ai` for every site, so a site labelled exactly `contabo` or `do` would
collide. Extremely unlikely, but if `fleetLabel()` ever returns those two words, this is where they clash.

**What is still intended:** the agent can run any command in **its own site's** web container. That is
the shell Tracy grants the site's agent, and the seat door decides who is granted it. What the rules file buys
is: a hijacked dsh cannot touch **another** container, cannot create a new container, and cannot reach
the rest of the API.

## 5ter. Dev environment — what was built, which IDs are its own

Built 07/09/2026. This section is the **registry**: every ID below was created by an API call and exists
nowhere else in the repo, so losing this section means hunting them down again by hand in the dashboard. (The IDs are
shown as placeholders here.)

**Naming convention: everything dev starts with `dev-`.** Hostnames, Workers, KV, tunnels. One look at a log
line or a KV row tells which side it belongs to — that is the whole reason.

| Thing | Value |
|---|---|
| Machine | `<old-dev-host>` · 8 cores · 23 GB · 290 GB · x86_64 · Ubuntu 24.04 |
| Role | **two roles**: GitHub Actions build runner (`tracy-build`) **and** dev host dsh (`tracy-dev`) |
| Tunnel | `tracy-dev` — `<dev-tunnel-id>`, config managed from Cloudflare |
| Ingress | `dev-agent.tracy.ai` → `http://127.0.0.1:51700` |
| DNS | `dev-agent.tracy.ai` CNAME → `<tunnel>.cfargotunnel.com`, **proxied** |
| Access app | `Dev host dsh` — `<dev-access-app-id>` |
| Access policy | `Dev cowork proxy only`, `non_identity`, include service token |
| Service token | `dev-cowork-proxy` — `<dev-service-token-id>` |
| KV | `FLEET_SITES_DEV` `<kv-id>` · `SITES_DEV` `<kv-id>` · `SEAT_CACHE_DEV` `<kv-id>` |
| Tunnel ingress | `dev-agent` → `127.0.0.1:51700` · `dev-fleet` → `127.0.0.1:8091` |
| Fleet ear | `tracy-hooks.service` on the dev machine, `tracy-hooks.contabo.py` **unchanged** (it only reads `FLEET_RELAY_SECRET`, pins nothing specific to contabo) |
| Dev Workers | `tracy-cowork-web-dev` (route `dev-cowork.tracy.ai`) · `tracy-seat-registry-dev` · `tracy-cowork-dev` |
| Image | `ghcr.io/tracyhq/tracy-dsh:<date>-<commit>`, built by `.github/workflows/build-dsh-image.yml` |

### Secrets of `tracy-seat-registry-dev` — which are separate, which are shared, which are deliberately EMPTY

Production holds **29** secrets on this Worker. Dev does not need all 29, and three of them **must not** be shared.

| Secret | On dev | Why |
|---|---|---|
| `FLEET_ACTOR_SECRET`, `FLEET_RELAY_SECRET`, `HOST_SEAT_SECRET_DEV` | **generated separately** | symmetric keys; a broken dev ear must not be able to take work meant for the real fleet |
| `RELAY_JWT_SECRET`, `INTERNAL_TOKEN`, `FLEET_WEBHOOK_SECRET` | **generated separately** | as above, and generating new ones needs nobody's permission |
| `CF_API_TOKEN` | **its own NARROW token** | permissions: Access Apps *Edit*, Access Service Tokens *Edit*, Access Orgs/IdP *Read*, Tunnel *Edit*, DNS *Edit*, Workers Routes *Edit* — derived from the 13 endpoints `fleetCloudflare.js` calls, not guessed |
| `CF_ACCOUNT_ID`, `CF_ZONE_ID` | shared | not secrets |
| `CF_TUNNEL_ID_DEV` | tunnel `tracy-dev` | |
| 🔒 `CF_TUNNEL_ID`, `CF_TUNNEL_ID_CONTABO` | **DELIBERATELY EMPTY** | see below |
| `SUPABASE_*` | 🔴 **must be a SEPARATE project** | see below |
| `RESEND_API_KEY` | may be shared | only sends mail, reads/writes nobody's data |
| `GITHUB_APP_*`, `SHOPIFY_*`, `ARTIFACT_S3_*` | empty | switch on when real work needs them |
| `GUEST_*`, `MEMBER_*` | dropped | lane era, removed by ADR 0014 |

🔒 **`CF_TUNNEL_ID` AND `CF_TUNNEL_ID_CONTABO` ARE EMPTY ON PURPOSE, NOT BY OVERSIGHT.** Dev declares
`FLEET_NEW_SITE_HOST = "dev"`, so every dev site is built on the dev machine and goes through the dev tunnel. Filling in the other two
variables opens exactly one possibility: dev **writing ingress into the production tunnel**. And
`fleetCloudflare.js:155` writes in the style *read → filter → PUT the WHOLE list back*, so one failure midway
loses the ingress rules of real sites. Missing variable ⇒ `cloudflareEnv` returns `null` ⇒ the Worker refuses —
the fail-closed direction.

🔴 **SUPABASE MUST BE A SEPARATE PROJECT, AND THIS IS NOT ABOUT TIDINESS.** Supabase here does not only
hold logins: `seats.js` reads/writes `seat` and `seat_site` over PostgREST with the service-role key — i.e.
**it IS the seat ledger**. Sharing it means a test on dev grants or revokes **real seats of real customers**.
Separating tables within the same project is not enough either: GoTrue's `auth.users` is **project-level**, and
`seat.supabase_user_id` points straight into it, so a dev login still creates a real user.

Building the dev project: run `workers/seat-registry/schema.sql` (776 lines) once in the SQL editor, then
apply the rename at line 671 (`seat_workspace` → `seat_workspace_grant`, already run on production 19/08 —
the file has drifted from reality, do not skip this step). After that, separate Google/GitHub OAuth clients and
`https://dev-cowork.tracy.ai/signin` in the redirect allowlist.

🔒 **Dev's KV is a SEPARATE namespace, and this is not about tidiness.** `FLEET_SITES` holds
`host:<siteKey>` — the row saying which machine a customer's site lives on. Sharing the namespace means **a test
on dev that mistypes `host:<customer-domain> = dev` moves a real customer onto the dev machine**, and no
line of code can stop it, because to the Worker the two environments are reading the same ledger.

**Acceptance — both directions, not one:**

```bash
# no token: Access must block
curl -sI https://dev-agent.tracy.ai/ | head -1                     # HTTP/2 403

# with service token: must go all the way to dsh
curl -s -o /dev/null -w '%{http_code}\n' https://dev-agent.tracy.ai/ \
  -H "CF-Access-Client-Id: <id>" -H "CF-Access-Client-Secret: <secret>"   # 401
```

⚠ **`401` in the second test is RIGHT, not broken.** It means the request went all the way through Cloudflare →
Access → tunnel → cloudflared → `127.0.0.1:51700` and was refused by the **seat door** for not being logged in.
A `403` there means Access blocked it — i.e. the token is wrong. A `530`/`502` means the tunnel cannot reach
dsh. Three numbers, three different layers.

**Still missing** (waiting for the dev Worker): `dev-cowork.tracy.ai`, `[env.dev]` in `wrangler.toml`, and `dev`
in `FLEET_HOSTS` in both `workers/shared/host-dsh.js` and `workers/seat-registry/src/index.js`.
Until then, a browser reaching this host only meets the seat door; no Worker signs a session for it.

---

## 5quater. Second production machine `prod1` — registry

Built 08/09/2026. Same reason as §5ter: every ID below was created by an API call and exists nowhere
else in the repo (shown as placeholders here).

| Thing | Value |
|---|---|
| Machine | `<old-prod1-host>` · 6 cores · 11 GB · 193 GB (177 GB free) · Ubuntu 24.04.4 |
| Host key | `prod1` — named by ROLE, not by provider (changing VPS does not mean renaming) |
| Tunnel | `tracy-prod1` — `<prod1-tunnel-id>`, config managed from Cloudflare |
| Tunnel ingress | `prod1-agent` → `127.0.0.1:51700` · `prod1-fleet` → `127.0.0.1:8091` |
| Runtime | docker 29.8.0 · git 2.43.0 · python3 3.12.3 · **node v22.23.2** (identical to the old production host) |
| Web image | 12/12 lines of `IMAGE_TAGS`, `build.sh` exit 0 |
| cloudflared | 2026.8.3, `--token-file /etc/cloudflared/token` (0600 root) |
| Fleet ear | `tracy-hooks.service`, `tracy-hooks.contabo.py` unchanged (md5 matches the dev machine) |

| DNS | `prod1-agent` · `prod1-fleet` → `<prod1-tunnel-id>.cfargotunnel.com`, **proxied** — identical to dev |
| Access app | `Prod1 host dsh` — `<prod1-access-app-id>` |
| Access policy | `Cowork proxy only`, `non_identity`, include service token `cowork-agent-proxy` (`<service-token-id>`) |

🔒 **THE ACCESS POLICY ACCEPTS `cowork-agent-proxy`, NOT A NEW TOKEN — AND THAT IS DELIBERATE.**
Production `cowork-web` holds **one** `AGENT_CLIENT_ID`/`AGENT_CLIENT_SECRET` pair for every host it
proxies to (`src/worker.js:221`), and that pair is `cowork-agent-proxy` — read from the policy of the app
`Desk agent sidecar`, which cowork-web calls today. Issuing a new service token for this machine
would mean cowork-web carrying two pairs and choosing by host, a branch nobody has written. This is DIFFERENT from
`HOST_SEAT_SECRET_*`: the seat key really is one per host, while the service token is cowork-web's identity
as a proxy — one per environment.

**Acceptance, measured 08/09 after DNS propagated:**

```
prod1-fleet.tracy.ai   GET=404  POST(unsigned)=403         <- identical to fleet.tracy.ai and dev-fleet
prod1-agent.tracy.ai   GET=403 (Access blocks)            <- identical to dev-agent
```

⚠ **The FIRST two numbers measured were `525` and then `502`, and both were propagation, not breakage.**
`525` for the first ~2 minutes after creating the DNS record (the edge certificate had not yet attached the new hostname), and `502` on
`prod1-agent` for ~1 minute after creating the Access app (app not yet in effect, the request went straight down the tunnel
and nothing was listening on 51700). Measuring again after 2 minutes gives the right numbers. Concluding "broken" in the first minute is a wrong
conclusion — one we nearly made.

⚠ **The other half of the acceptance (`with service token → 401 from the seat door`) could NOT be run yet**, because
the client secret of `cowork-agent-proxy` is shown only once at creation and rotating it breaks production
cowork-web. It will prove itself on the first real proxy call, after `tracy-dsh` is up.

⚠ **`prod1-fleet` is NOT behind Access, and that is deliberate** — like `dev-fleet`. That door is POST-only
and signed with `FLEET_RELAY_SECRET`; an unsigned GET returns 403 from the fleet ear itself, not from
Access. `prod1-agent`, on the other hand, **must** have Access before `tracy-dsh` is up, or dsh's password door
is exposed straight to the internet.

🔒 **`FLEET_RELAY_SECRET` and the four `TRACY_MIGRATE_S3_*` on this machine are COPIES OF PRODUCTION**, copied
straight from the old production host's `/etc/tracy/hooks.env` through an ssh pipe. That is the condition for the new machine to read
the snapshot the old production host pushes to R2 — §3 of `tasks/plan-production-may-moi.md` says why. Quite unlike dev,
where those two are generated separately.

⚠ **The `tracy-dsh` image is not on the machine yet: GHCR returns `unauthorized`.** The image weighs **5.78 GB** and CI pushes it
to `ghcr.io/tracyhq/tracy-dsh:<date>-<commit>`, so the right path is a GHCR read key on the host, not
a manual copy — every future dsh base upgrade travels that same path.


## 5quinquies. Host `demo` — DO droplet, `tracy-host` only, for public demos from quickstarts (16/09/2026)

The droplet `tracy-fleet-01` (address in `TRACY_FLEET_HOST` of `tracy-desk/.env`) is **production tracy-web's
second host**, named `demo`. It runs **one** piece of the new architecture: `tracy-host` (the same production
image, `ghcr.io/tracyhq/tracy-host:<tag>`), listening on `127.0.0.1:51720`, exposed through tunnel
`<demo-tunnel-id>` at `https://demo-host.tracy.ai`. There is **no** tracy-web, postgres,
or `tracy-dsh` there — demos have no agent, no seats, and the tunnel points straight at the site's container,
so tracy-web does not stand in between. Why here rather than next to customer sites: `tasks/todo-demo-tu-quickstart.md`.

| Thing | Where |
|---|---|
| `tracy-host`'s env | `/etc/tracy/tracy-web.env` on the droplet: `HOST_NAME=demo`, `HOST_demo_SECRET`, roots `/srv/tracy-sites` + `/srv/tracy-private`, `CLOUDFLARE_ACCOUNT/TUNNEL/TOKEN`, a dummy `TRACY_DSH_HOME` (only so compose can parse) |
| Compose | `/opt/tracy-fleet/stack/{compose.yml,compose.server.yml}` — the same files as on the web host |
| Declared in tracy-web (the web host) | `HOSTS=prod1,demo` + `HOST_demo_ORIGIN=https://demo-host.tracy.ai`, `HOST_demo_DSH_ORIGIN` (pointing at the same place — there is no dsh, `readHosts` requires all four lines), `HOST_demo_SECRET`, `SEAT_demo_SECRET`; tracy-web picks the host named `demo` (or `DEMO_HOST`) by itself |
| Old hand-built demos | `/srv/tracy/business-*` (old layout) — alive until the Install demo button replaces them with copies in `/srv/tracy-private/<label>` |

**Restarting `tracy-host` on the droplet** (not through `deploy-tracy-stack.sh`: that script requires all three services and
smoke-tests `tracy-web:51710`):

```bash
cd /opt/tracy-fleet/stack
export HOST_SECRET=$(grep '^HOST_demo_SECRET=' /etc/tracy/tracy-web.env | cut -d= -f2-)
export WEB_IMAGE=ghcr.io/tracyhq/tracy-web HOST_IMAGE=ghcr.io/tracyhq/tracy-host
docker compose -p tracy --env-file /etc/tracy/tracy-web.env -f compose.yml -f compose.server.yml \
  up -d --no-build tracy-host
curl -s http://127.0.0.1:51720/health        # {"docker":true,"sitesRoot":true}
```

Three traps sprung on 16/09, one line each: without `WEB_IMAGE`/`HOST_IMAGE` in the shell, compose
looks for `tracy/web:<tag>` and dies with "No such image"; without `TRACY_DSH_HOME`, compose parses the whole file and dies with
"invalid spec :/desk-home" even though dsh is not started; and **do not `source` the env file** — `MAIL_FROM=Tracy <…>` kills the
shell, take each key with `grep | cut`.

**Getting the image onto the droplet**: GHCR is private and the droplet is not logged in. The path used:
`ssh <web-host> 'docker save ghcr.io/tracyhq/tracy-host:<tag> | gzip -1' > host.tgz` then
`ssh root@<demo-host> 'gunzip -c | docker load' < host.tgz` (~250 MB compressed). A GHCR read key on the host
is the better path, the same remark as for the `tracy-dsh` image in §5quater.

**How a demo is put up**: `POST /api/ops/demos/install` on tracy-web → `/_host/provision`
(`workflow: template`, installed exactly as released) → when `done`: `/_host/address {dns: true}` (ingress +
CNAME `<label>.tracy.ai → <demo-tunnel-id>.cfargotunnel.com`, because the wildcard `*.tracy.ai` points at prod1) then
`/_host/go-live --op live` (turns off noindex, opens mail). Check: `GET /api/ops/cms/runtime` lists
`demo ok container=absent packages=0`; `curl https://<label>.tracy.ai/` returns 200.

---

### The host dsh has NO interface to open in a browser — and that is by design

Measured on prod1 on 09/09/2026, calling `127.0.0.1:51700` directly through an ssh tunnel:

```
/                 401     seat door refuses: no ticket yet
/gateway/login    404     the seat key has turned the password door into a 404
/gateway/tracy    404     MCP_TRACY_SITE_KEY empty on the host dsh (decision 4 of ADR 0014)
```

🔒 **Practical consequence: the workspace cannot be accepted in a browser without a REAL seat
session.** There is no login screen to look at, no waiting page, nothing rendered. The only way in
is `cowork-web` minting a ticket for a person **who is logged in** and attaching it to the cookie
`dsh_gateway_token` (`workers/cowork-web/src/worker.js`, the proxy function).

So an acceptance run by a browser-driving agent **can stop at exactly three places**, and all three can be
measured without anyone's account:

| Measurable without logging in | Needs a real seat session |
|---|---|
| Access blocks (`403`) and lets through (`401` from the seat door) | how the workspace renders |
| a real signed `POST /gateway/seat/session` returns `200` | what the agent answers in the chat box |
| `docker exec` into the site container, the fence between sites | side card tabs, per-role permissions |

⚠ **Do not work around it by turning on `guest:<label>`.** That switch changes what **strangers on the internet**
see; borrowing it to run a test changes production's public behaviour for the convenience of a measurement.

---

## 5bis. Where keys live, who holds them, and how to rotate them

⚠ **TWO KEYS CANNOT BE RECOVERED FROM ANYWHERE ELSE.** This is the most important section of this document
and it was written on 07/09, after measuring that **no host is backing them up** —
no cron, no timer, no script.

| Key | Where | Second copy |
|---|---|---|
| `MCP_SEAT_SECRET` | `<desk-home>/dsh-passwords.env` on the host | `HOST_SEAT_SECRET_<HOST>` in **two** Workers — **write-only** |
| `MCP_TRACY_ACTOR_SECRET` | as above | `FLEET_ACTOR_SECRET` in **five** Workers — **write-only** |
| model key | `<desk-home>/.credentials.yaml` | the model provider (can be reissued) |
| `MCP_JWT_SECRET`, `MCP_DB_ENC_KEY`, `SETUP_KEY` | as above | none — lose them and the accounts in the seat door are lost |

🔒 **What "write-only" means, and why it changes everything.** Cloudflare Worker secrets
**cannot be read back**: `wrangler secret list` prints **names**, not values. So the copy on Cloudflare
is not a backup — it is one half of the key pair, and the other half exists only on the host's disk.
Losing the host loses the real key, and the only recovery path is minting a new key and pushing it simultaneously into five
Workers, while **every seat on every host is broken**.

⚠ (Worker era.) `FLEET_ACTOR_SECRET` sits in **five** Workers, measured on Cloudflare 07/09/2026:
`tracy-cowork-web`, `tracy-seat-registry`, `tracy-cowork`, `tracy-fleet-bar`, `tracy-harness`. Count again
before quoting:

```bash
for w in tracy-cowork-web tracy-seat-registry tracy-cowork tracy-fleet-bar tracy-harness; do
  cd workers/<folder of $w> && npx wrangler secret list | grep FLEET_ACTOR_SECRET && echo "$w"
done
```

### Backup

```bash
/opt/tracy-fleet/dsh/backup-host-dsh.sh          # one archive, then prune old ones
/opt/tracy-fleet/dsh/backup-host-dsh.sh --list
/opt/tracy-fleet/dsh/backup-host-dsh.sh --restore /var/backups/tracy/host-dsh-…tar.gz
```

Runs daily via `tracy-backup-host-dsh.timer`. It **deliberately skips `profiles/`** (45 MB, and it is
generated — `seed-profile.sh` rewrites it from the image at every deploy); a profile restored from an old image
is worse than none, because it **boots**.

🔒 **An archive on the same disk as what it backs up does not survive the very incident it exists to
guard against.** It saves a failed deploy, a wrong `rm`, a container recreated with the wrong mount —
the things that happen often. It does **not** save losing the machine. Set `TRACY_BACKUP_REMOTE` (an rsync target)
in `tracy-backup-host-dsh.service` to get an off-host copy; until it is set, the script **says so on every
run**, instead of letting a green log line imply a safety that does not exist.

**And one copy in a place that is not a machine at all.** `MCP_TRACY_ACTOR_SECRET` is the whole system's shared key; it
should have a copy in a password manager that at least two people can open. To get it:

```bash
grep '^MCP_TRACY_ACTOR_SECRET=' /srv/tracy/host-dsh/home/dsh-passwords.env | cut -d= -f2-
```

### When to rotate — and why NOT on a schedule

🔒 **The two procedures below are emergency exits, not routine work.** Do not schedule them.

Scheduled rotation is only worth it when it shortens the window in which an **undetected** leak remains usable.
These keys never reach a browser, are never in a URL, are `600` on disk and cannot be read back on
Cloudflare. The realistic leak paths come down to exactly four, and all four have **a specific date when they
happen** — so they are triggers, not cycles:

1. a person with access leaves the team
2. a host is compromised, or decommissioned without its disk wiped
3. the value shows up somewhere it should not — a log, a screenshot, a chat, a commit
4. a backup archive is handled carelessly

In exchange, every rotation of `MCP_TRACY_ACTOR_SECRET` is a **system-wide** outage window, five Workers and every
host. A quarterly schedule turns that into four self-inflicted incidents a year in exchange for a threat it
does not touch.

**Rehearse on dev before doing it for real.** The `dev` host carries its own actor secret and pairs with the dev Worker set,
so rehearsing a rotation there is invisible to everyone. The scary procedure is the one nobody has ever run.

### Rotating `MCP_SEAT_SECRET` (one host)

This key pair has no two-keys-both-valid phase: the seat door checks exactly one value. So **there is always
an outage window**, and the only thing to do is make it short. The order below folds that window
**into the restart** — time during which dsh is not serving anyone anyway:

```bash
# 1. On the host — generate a new key, write it into dsh-passwords.env, restart
NEW=$(openssl rand -hex 32)
sed -i "s|^MCP_SEAT_SECRET=.*|MCP_SEAT_SECRET=$NEW|" /srv/tracy/host-dsh/home/dsh-passwords.env
docker compose --env-file /etc/tracy/host-dsh.env -f /opt/tracy-fleet/dsh/host-dsh.yml up -d --force-recreate dsh
echo "$NEW"        # copy to step 2 right away

# 2. On the laptop — TWO Workers, ONE pass, no pause in between
cd workers/cowork-web    && printf '%s' "$NEW" | npx wrangler secret put HOST_SEAT_SECRET_<HOST>
cd ../seat-registry      && printf '%s' "$NEW" | npx wrangler secret put HOST_SEAT_SECRET_<HOST>

# 3. Acceptance
/opt/tracy-fleet/dsh/host-dsh-init.sh <host>    # idempotent; the final signed call must return 200
```

⚠ **Stopping halfway means 403 on every mint, and no error line says which key signed.** If you have to
stop midway, the fallback is putting the **old** value back in all three places — which is why step 1 must copy
the old key out before `sed` overwrites it.

### Rotating `MCP_TRACY_ACTOR_SECRET` (whole system)

Same shape, but **five** Workers and **every** host, so the outage window is system-wide. This is not
a Friday-afternoon job.

1. Generate one value, shared by all.
2. Write it into the `dsh-passwords.env` of **every** host, restart each one.
3. `wrangler secret put FLEET_ACTOR_SECRET` on **five** Workers, in one go.
4. Acceptance: a real login on one site of each host.

⚠ **Each environment (dev, staging, each shard) holds its OWN actor secret**, the same value in its own tracy-web.env and
`dsh-passwords.env`; rotating one does not touch another.

---

## 6. Keys and flags on the Worker

⚠ **History (Worker architecture, retired 16/09/2026).** Today tracy-web calls dsh over the Docker network
(`HOST_<host>_DSH_ORIGIN=http://tracy-dsh:8080`); this section is kept for reading old machines, it is not a step for a new machine.

**`[vars]` are already there** (added by Task 5) — check, do not trust:

```bash
grep -n HOST_DSH workers/*/wrangler.toml
```

You must see `HOST_DSH_ORIGIN_CONTABO` and `HOST_DSH_ORIGIN_DO` in **both** `cowork-web` and
`seat-registry`, with the same value on both sides.

**Secrets — write both ends in ONE pass.** Halfway means 403 on every mint, and no error line
says which key signed:

```bash
S='<MCP_SEAT_SECRET that init printed>'
cd workers/cowork-web    && printf '%s' "$S" | npx wrangler secret put HOST_SEAT_SECRET_CONTABO
cd ../seat-registry      && printf '%s' "$S" | npx wrangler secret put HOST_SEAT_SECRET_CONTABO
```

`_DO` for the other host, with the other host's value. **One key per host.**

**KV flag** (namespace `FLEET_SITES`, id `<fleet-sites-kv-id>`) — this is the real switch:

```bash
# Move ONE site to the host dsh.
npx wrangler kv key put 'host-dsh:<label>' on \
  --namespace-id <fleet-sites-kv-id> --remote

# Move the ONBOARDING door (a logged-in person who holds no seat yet) to the host dsh.
npx wrangler kv key put 'host-dsh:onboard' on \
  --namespace-id <fleet-sites-kv-id> --remote
```

⚠ **For a site with the flag on, `cowork-web` signs with the HOST's key, not `seat-secret:<label>`.** A
leftover `seat-secret:` row causes no configuration error — it would only make a call sign with the wrong key if someone
later reversed the priority order. Do not rush to delete it: it is the fallback when the flag is turned off.

⚠ **Label, not siteKey.** The flag is `host-dsh:<label>` — the fleet label, which cannot be derived from the
siteKey (the fleet hashes it).

---

## 7. Acceptance — four measurements, not "looks like it runs"

```bash
# a. container healthy and not crash-looping
ssh <host> "docker inspect tracy-dsh -f '{{.State.Status}} {{.RestartCount}} {{.State.Health.Status}}'"

# b. the seat door answers when the loopback port is called DIRECTLY (init already did this; redoing it is cheap)
bash /opt/tracy-fleet/dsh/host-dsh-init.sh <host>   # idempotent, rerun only to measure

# c. the public path already has Access in front
curl -sI https://contabo-agent.tracy.ai/ | head -1        # must be 403 (Access), NOT 404

# d. what the customer actually gets — open a site with the flag on at cowork.tracy.ai
```

Read the code returned in (c) correctly, because the numbers say entirely different things:

| Code | Meaning |
|---|---|
| `403` | Access is in front. **This is the RIGHT result.** |
| `404` | ingress has no rule for this hostname yet — the catch-all rule is answering |
| `502` | ingress exists, but nobody is listening on `127.0.0.1:51700` on that machine |
| `530` | DNS points at a tunnel that is not running (or at the wrong tunnel) |

⚠ **(a) and (c) are both GREEN while the model key is still missing.** The user's first keystroke is what
finds out, and it reports `MISSING_CREDENTIAL`. So those two tests are **not** "done".

⚠ **The container's `docker logs` does NOT record requests.** "0 log lines" does not prove a request
never arrived — it only proves the container does not log requests. To know whether a request arrived,
use (b).

---

## 8. Rollback

```bash
docker compose --env-file /etc/tracy/host-dsh.env \
  -f /opt/tracy-fleet/dsh/host-dsh.yml down
```

`down` removes **exactly the two containers of this file**. Leftover lanes from the one-dsh-per-site era were
built with bare `docker run` (no compose), so they are **not touched** — still Up, still serving.
The tool that built them was deleted on 06/09; the remaining fallback is the running container, not a rebuild
command.

But what actually sends customers back to the old path is the **KV flag**, not `down`:

```bash
npx wrangler kv key delete 'host-dsh:<label>' \
  --namespace-id <fleet-sites-kv-id> --remote
```

The right order when rolling back: **delete the flag first, `down` after**. The reverse leaves a stretch of time in which
`cowork-web` still proxies to an origin nobody is listening on — 502 for everyone on that host.

`down` does **not** delete `/srv/tracy/host-dsh/home`. Sessions, keys, and the seat door's database stay;
the next `up -d` picks exactly them up.

---

## 9. Measured, and not measured

**Measured on the dev machine (06/09/2026):**

- `docker compose -f host-dsh.yml config` green with a dummy env file.
- Network shape: dsh can call `docker-proxy` by name **and** reach the Internet (HTTPS 200);
  the proxy on the `internal: true` network **cannot** reach the Internet.
- The whole socket proxy evidence table in §5: 6 positive tests, 18 negative tests, and the record of the five real
  requests of one `docker exec -it` read from the proxy's own `option httplog`.
- The proxy container runs `read_only` + `cap_drop: ALL` + `no-new-privileges` while `docker exec` still
  runs and `POST /containers/create` is still `403`; `docker compose up -d docker-proxy` gives `healthy`.
- The smoke test's signing string matches `signSeatCall` of
  [`apps/tracy-web/src/workspace/seat-door.js`](../../../../apps/tracy-web/src/workspace/seat-door.js) **byte for byte**: the same secret, the same nonce, the same
  timestamp produce the same signature.
- `host-dsh-init.sh --dry-run` runs end to end on macOS; `bash -n` and `shellcheck` are clean.

**Not measurable here (needs a host):**

- a real `rshared` bind, and whether a site attached after the container started shows up;
- the `tracy/dsh` image coming up with the gateway listening on 8080 (Task 2 in progress);
- a real `POST /gateway/seat/session` returning `200` (init will tell as soon as someone runs it);
- `curl -I https://<host>-agent.tracy.ai/` → 403.

---

## 9bis. The side card's Terminal tab: owner account ONLY, just like the lanes

**Since dsh-passwords 2.7.7 (ADR 0027) there is no WebSocket allowlist any more.** The admin account can upgrade
every path a plugin declares; a seat only reaches `fs-watch` and `agent-opens` with a session it holds (hook H6
of the Tracy layer). `MCP_GATEWAY_WS_ADMIN_ALLOWLIST` / `_USER_ALLOWLIST` were removed upstream in 2.7.0 — that line
in an old env file is now harmless, nobody reads it.

`host-dsh-init.sh` and `entrypoint.sh` write a second layer of blocking for the two terminal paths:
`MCP_GATEWAY_SSH_ENDPOINTS=owner:ws:/sidebar/ws/terminal,owner:ws:/sidebar/ws/agent-terminals` —
the `owner:` rule returns 403 for a seat before the policy runs. **If the env already exists, init does NOT overwrite it**;
a host built before 2.7.7 adds it by hand if it wants the second layer (the Tracy layer already blocks the terminal for seats even without the line):

```bash
F=/desk-home/dsh-passwords.env   # inside the container: docker exec -it <container> sh
grep -q '^MCP_GATEWAY_SSH_ENDPOINTS=' "$F" \
  || echo 'MCP_GATEWAY_SSH_ENDPOINTS=owner:ws:/sidebar/ws/terminal,owner:ws:/sidebar/ws/agent-terminals' >> "$F"
docker restart <container>
```

`MCP_DSH_ROOT=/opt/dsh` and `MCP_TRACY_FLEET=1` are in the image's `ENV` (Dockerfile), not in the
env file: without `MCP_DSH_ROOT` the settings patch never runs and the 2.7.7 gateway does not start;
`MCP_TRACY_FLEET=1` forces the gateway to run only with the Tracy policy, the seat secret and that root (exit code 38).

Check with the upgrade itself, not by eye: `101` means it works, `404` means not yet.

---

## 10. The order, condensed

1. `tracy-dsh` image on GHCR → `DSH_IMAGE_TAG` (§1)
2. the seven `dsh/` files in `/opt/tracy-fleet/dsh/`: from the deploy action (prod1/dev) or from the `tracy-host` image (machines without a checkout) (§2)
3. `/etc/tracy/host-dsh.env` with `TRACY_SITE_DOMAIN`, `MODEL_API_KEY` filled in (§3)
4. `host-dsh-init.sh <host> --dry-run …`, read it, then run it for real (§3) → `MCP_SEAT_SECRET` (file or banner)
5. `/etc/tracy/tracy-web.env`: `HOST_<host>_DSH_ORIGIN`, `SEAT_<host>_SECRET`, `MCP_TRACY_ACTOR_SECRET` with the same value as dsh; restart tracy-web
6. acceptance (a)(b) (§7)
7. **scan the confinement of EVERY `*-web-1` container on the host** (§5, one line). Any site that is `privileged`
   or `unconfined` gets rebuilt **before** letting an agent touch it
