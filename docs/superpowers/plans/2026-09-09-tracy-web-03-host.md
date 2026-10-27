# Plan 3/5 — `apps/tracy-host`: the fleet's ear as one container, the two-root layout, Add site from the UI produces a real site locally

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Click *Add site* on `localhost:8080` → `tracy-web` calls `tracy-host` → `provision.sh --fresh` runs
**inside the container** → a WordPress site runs at `http://<label>.localhost:8080` (browser) / `http://<label>.tracy.test:8080` (from a container) → the agent in `tracy-dsh`
`ls /site/<label>/.webroot` sees it → Changes/Diff/Releases/Restore run on `webroot-baseline.git`.
Import (local site) goes through MinIO. One `deploy/compose.yml` holds everything: postgres · minio · tracy-web ·
tracy-host · docker-proxy · tracy-dsh — the old `dev/` cluster is deleted.

**Architecture:** `tracy-host` = Hono receiving HMAC ts+nonce signed requests (mirroring `host/client.js` of Plan 2),
writes jobs to JSON files like `tracy-hooks.py`, spawns **exactly the bash scripts that already exist** in
`/opt/tracy-fleet` (the image COPYs them from `packages/fleet/tracy-fleet-operation/scripts`). The two directory roots
`TRACY_SITES_ROOT` / `TRACY_PRIVATE_ROOT` are absolute host paths, mounted into the container **at
that same path**. No more `mount --bind`.

**Tech Stack:** Node 24 · Hono · `node:child_process` · docker CLI + compose plugin in the image · MinIO
(`minio/minio`) locally · existing bash scripts.

**Spec:** §3, §5, §6, §13.1–13.2, §13.5.

## Global Constraints

- All constraints of Plans 1–2.
- **Do not change the behaviour of the bash scripts** beyond parameterising paths (table in Task 2). Every modified script must run **also** with the old default value (`/srv/tracy`) — the existing `render-compose.test.mjs` test must stay green.
- `tracy-host` does **not** hold `SEAT_SECRET`, does not call the seat door, does not receive customer cookies.
- `tracy-dsh` is **unchanged** (image, `docker-proxy.haproxy.cfg`, `host-dsh.yml` carried over as-is into the shared compose).
- The paths the agent sees are **unchanged**: `/site/<label>`, `/site/<label>/.webroot`.
- Locally: Cloudflare, iptables, go-live are **off** (empty env → the door returns `{ code: 'NOT_CONFIGURED' }` 501).
- 🔒 **The name `<label>.localhost` is resolved only by the browser and `curl` — measured 09/09 on macOS: Chrome/curl → 127.0.0.1, Node `dns.lookup` → `ENOTFOUND`, inside a container → no.** Two mandatory consequences: (a) **server-side code never dials `site.address`** — every call to a site (custody, `apply`, probe) goes through `siteTarget(site)` = `http://<label>-web-1/` when on the same machine; (b) the browser uses `*.localhost`; **containers** use `*.tracy.test` via a static-IP dnsmasq in compose (Task 5 Step 2b) — only then can the host half of the Import wizard (running in `tracy-dsh`) call the source site's admin URL; `tracy-web` accepts both suffixes.

---

## File map

```
apps/tracy-host/
  package.json · Dockerfile · src/
    config.js          readConfig(env) → { hostName, hostSecret, sitesRoot, privateRoot, scriptsDir, jobsDir, logDir, cloudflare|null, siteDomain, siteHttpPort }
    auth.js            verifyHostCall({ secret, method, path, body, headers, now }) → { ok, why } — nonce store 120s
    jobs.js            putJob(id, fields) · readJob(id) — atomic JSON file (carried over from write_job/read_job)
    run.js             runScript({ script, args, env, log }) → Promise<{ code, tail }> — stdbuf -oL, writes the log, turns `==` lines into steps, captures TRACY_RESULT
    app.js             buildApp(deps) — /health · /_host/provision · /_host/attach · /_host/teardown · /_host/site · /_host/agent-token · /_host/address · /_host/go-live · /_host/jobs/:id
    server.js
    provision.js       instruction → args for provision.sh (carried over PROVISION_FLAGS, drop access*)
    webroot.js         WEBROOT_JOBS + validate (carried over from py, lines 122–268)
    sync.js            timers: sync-site-folders.sh every hour · sync-brands.sh every 10 minutes (replaces the two .timer units)
  test/*.test.mjs
packages/fleet/tracy-fleet-operation/scripts/  (parameterised, see Task 2)
deploy/compose.yml   (adds minio · tracy-host · docker-proxy · tracy-dsh)
```

---

### Task 1: `apps/tracy-host` skeleton + signature verification mirroring `host/client.js`

**Files:**
- Create: `apps/tracy-host/package.json`, `apps/tracy-host/src/{config,auth,app,server}.js`, `apps/tracy-host/test/auth.test.mjs`
- Modify: `package.json` (`test:workers` already covers `apps/*`), `pnpm-lock.yaml`

**Interfaces:**
```ts
verifyHostCall({ secret, method, path, body, headers, now = Date.now(), seen = Map }) → { ok: true } | { ok: false, why: 'missing'|'skew'|'replay'|'signature' }
   // canonical: `${ts}\n${nonce}\nPOST\n${path}\n${sha256Hex(body)}`; |now - ts| ≤ 120s; nonce not seen within 120s
buildApp({ config, jobs, run, deps }) → Hono; every /_host/* goes through the verify middleware → 403 { code: 'BAD_SIGNATURE', why }
```

- [ ] **Step 1: Red test** — use **Plan 2's `hostCall`** as the signer (imported from `../../tracy-web/src/host/client.js` in the test only): sign a request and `verifyHostCall` must be `ok`; repeat the same nonce → `replay`; ts off by 5 minutes → `skew`; change one byte of the body → `signature`.
- [ ] **Step 2: FAIL → write `auth.js`** (uses `hmacHex/sha256Hex` — copy tracy-web's `lib/hmac.js` to `apps/tracy-host/src/hmac.js`; the two apps do not import each other).
- [ ] **Step 3: `app.js`** with `/health` (checks `docker version` via `run` and that `sitesRoot` is writable) and the middleware. Test: unsigned request to `/_host/provision` → 403; `/health` → 200 `{ docker: true, sitesRoot: true }` when a fake `run` returns 0.
- [ ] **Step 4: PASS → Commit** — `feat(host): @tracy/host stands up — the signed door, mirrored on the web client`

---

### Task 2: Parameterise paths in the scripts — two roots, absolute paths

**Files (Modify):** `packages/fleet/tracy-fleet-operation/scripts/provision/provision.sh`, `render-compose.sh`, `teardown.sh`, `go-live.sh`, `platform/emdash.sh`, `webroot/{webroot-edit,webroot-git,webroot-pack,webroot-push,webroot-release}.sh`, `lib/web-image.sh`, `tools/{push-site-folder,sync-brands}.sh`
- Create: `packages/fleet/tracy-fleet-operation/scripts/lib/roots.sh`, `packages/fleet/tracy-fleet-operation/test/roots.test.mjs`

**Interfaces:** `lib/roots.sh` (sourced at the top of every script above):
```bash
# Two roots. Defaults are today's single root, so a host that has not migrated keeps working.
: "${TRACY_SITES_ROOT:=/srv/tracy-sites}"      # what dsh mounts at /site — <label>/ is the site folder, <label>/.webroot the running site
: "${TRACY_PRIVATE_ROOT:=/srv/tracy}"          # .env, tokens, apache/, compose.yml, work/, webroot-baseline.git
: "${TRACY_FLEET_DIR:=/opt/tracy-fleet}"
tracy_site_dir()    { printf '%s/%s' "$TRACY_SITES_ROOT" "$1"; }          # site folder (AGENTS.md …)
tracy_webroot_dir() { printf '%s/%s/.webroot' "$TRACY_SITES_ROOT" "$1"; }
tracy_private_dir() { printf '%s/%s' "$TRACY_PRIVATE_ROOT" "$1"; }
tracy_repo_dir()    { printf '%s/%s/webroot-baseline.git' "$TRACY_PRIVATE_ROOT" "$1"; }
: "${TRACY_BRANDS_DIR:=$TRACY_PRIVATE_ROOT/_brands}"
# `TRACY_SRV` (webroot-release.sh:73 and the test suite) is the OLD name of the private root: honour it.
[ -n "${TRACY_SRV:-}" ] && TRACY_PRIVATE_ROOT="$TRACY_SRV"
```
⚠ With the **old layout** (`TRACY_SITES_ROOT` not set, site not migrated) `tracy_webroot_dir` points to `/srv/tracy-sites/<label>/.webroot` — exactly the existing bind — and `tracy_repo_dir` points to `/srv/tracy/<label>/webroot-baseline.git` — exactly where it is today. So the modified scripts run on prod1 **before** migrating.

- [ ] **Step 1: Red test `roots.test.mjs`** — run `bash -c '. lib/roots.sh; tracy_repo_dir x; echo; tracy_webroot_dir x'` with an empty env and with both roots set → the right four strings.
- [ ] **Step 2: Fix each script** — replacement table (grep the exact string, replace with a function call; one commit per file so it can be reviewed):

| File | Replace |
|---|---|
| `provision.sh` | `ROOT="/srv/tracy"` → `ROOT="$TRACY_PRIVATE_ROOT"`; keep `SITE_DIR="$ROOT/$LABEL"` (it is private); every `"$SITE_DIR/webroot"` → `"$(tracy_webroot_dir "$LABEL")"`; `"$SITE_DIR/site"` → `"$(tracy_site_dir "$LABEL")"`; `/opt/tracy-fleet` → `$TRACY_FLEET_DIR`; drop the two `--access-*` flags and every branch that uses them; **no longer call `attach-site.sh`** — replace it with `mkdir -p "$(tracy_site_dir "$LABEL")"` before `ensure-site-folder.mjs` |
| `render-compose.sh` | the two `printf '      - ./site:…'` / `./webroot:…` → **absolute** paths `$(tracy_site_dir "$LABEL"):/site/$LABEL` and `$(tracy_webroot_dir "$LABEL"):/site/$LABEL/.webroot`; the `/var/www/html` mount also takes `tracy_webroot_dir`; emdash: `data`/`uploads` under the site dir's `.webroot/`; **always** print into the `web` service: `networks: [default, tracy]` and at the end of the file `networks: { tracy: { external: true, name: ${TRACY_SITE_NETWORK:-tracy_tracy} } }` (the network created by `deploy/compose.yml` — this is how `tracy-web` reaches `<label>-web-1`; the site still only publishes `127.0.0.1:<port>`); **env-gated**: `TRACY_SITE_DNS` non-empty → `dns: [$TRACY_SITE_DNS]` (local) |
| `teardown.sh` | `--root` defaults to `$TRACY_PRIVATE_ROOT`; also delete `$(tracy_site_dir "$LABEL")`; drop the call to `detach-site.sh` |
| `go-live.sh` | `/srv/tracy/$LABEL` → `$(tracy_private_dir "$LABEL")` |
| `webroot-git.sh` | keep `STACK=…` for private; `WEBROOT="$(tracy_webroot_dir "$LABEL")"`; `REPO="$(tracy_repo_dir "$LABEL")"` |
| `webroot-edit/pack/push/release.sh` | the same two lines as above; `/opt/tracy-fleet` → `$TRACY_FLEET_DIR` |
| `platform/emdash.sh`, `lib/web-image.sh` | `/opt/tracy-fleet` → `$TRACY_FLEET_DIR` |
| `tools/push-site-folder.sh`, `tools/sync-brands.sh` | `/srv/tracy` → the two functions by meaning (site folder = `tracy_site_dir`); `sync-brands.sh:46` `STORE=/srv/tracy/_brands` is a **third** root → `${TRACY_BRANDS_DIR:-$TRACY_PRIVATE_ROOT/_brands}` declared in `roots.sh` |
| `attach-site.sh`, `detach-site.sh` | **keep as is** (Plan 5 uses `detach` when migrating, then deletes them) |

- [ ] **Step 3:** `node --test packages/fleet/tracy-fleet-operation/test/*.test.mjs` green (including `render-compose.test.mjs` — if it compares the `./site` string, update the expectation to absolute and say why in the commit). `shellcheck` each file if available.
- [ ] **Step 4: Commit each file** — `refactor(fleet): <script> reads its paths from lib/roots.sh — two roots, absolute, old default kept`

---

### Task 3: Jobs, running scripts, `/_host/provision`, `/_host/jobs/:id`, `/_host/attach`, `/_host/teardown`

**Files:**
- Create: `apps/tracy-host/src/{jobs,run,provision}.js`, `apps/tracy-host/test/{jobs,provision}.test.mjs`
- Modify: `apps/tracy-host/src/app.js`

**Interfaces:**
```ts
putJob(dir, id, fields) · readJob(dir, id)     // carried over from write_job/read_job: {id, createdAt, updatedAt, state, step, label, port, detail, output}
runScript({ script, args, env, logPath, onLine }) → Promise<{ code, tail: string[] }>  // spawn('stdbuf',['-oL','bash',script,...args]); each line written to the log; onLine(line)
provisionArgs(instruction) → string[]           // carried over PROVISION_FLAGS (drop accessAud/accessTeamDomain) + `--fresh` + `--no-publish` + `--root <privateRoot>`
POST /_host/provision {site,label,platform,siteKey,webrootKey?,dbKey?,liveSite?,fresh?,ownerEmail?,gitToken?,gitRepo?,port?}
   → 202 {jobId}; in the background: runScript(provision.sh) — `==` line → step; `TRACY_RESULT port=` → port; env HOST_PORT/GIT_PUSH_TOKEN/GIT_REPO as in py:407-418
GET  /_host/jobs/:id → the job or 404
POST /_host/attach {label} → mkdir -p sitesRoot/<label> (+ ensure-site-folder.mjs if AGENTS.md is missing) → 200 {ok, label, path:`/site/<label>`}
POST /_host/teardown {label,site} → 202 job; runScript(teardown.sh --label --site --root privateRoot)
```
- [ ] Test `jobs`: put/read atomic, `updatedAt` changes. Test `provisionArgs`: a full instruction → array in the right order, no `--access-aud`. Route test: `POST /_host/provision` with a fake `run` emitting `== starting database` then `TRACY_RESULT port=8181` → polling sees `running/starting database` then `done/ready/port 8181`; fake `run` exits 1 → `failed` with `output` being the last 200 lines.
- [ ] Commit — `feat(host): provision, jobs, attach and teardown — the same scripts, driven from Node`

---

### Task 4: 17 webroot jobs, agent-token, address, go-live, sync timers

**Files:**
- Create: `apps/tracy-host/src/{webroot,sync}.js`, `apps/tracy-host/test/webroot.test.mjs`
- Modify: `apps/tracy-host/src/app.js`

**Interfaces:**
```ts
WEBROOT_JOBS — carry over the table py:122-141 as is; validateWebrootBody(body) → null | 'refused …' (carry over py:243-268 including SAFE_PATH, SAFE_SHA, MAX_WEBROOT_CONTENT, the allowed keys)
POST /_host/site {kind,label,path?,contentBase64?,ref?,sha?,title?,repo?,siteKey?,byEmail?,byName?,notesBase64?} → 202 {jobId}; runs like run_webroot_job (py:270-350): args, a temp file for release notes, the script's JSON output into job.output
POST /_host/agent-token {label} → reads `${privateRoot}/<label>/tracy-agent.token` → {token} | 404
POST /_host/address {label, port, hostname} → config.cloudflare ? ingress rule via the **Cloudflare API** (`ingress_api.py --hostname --port`, exactly the `provision.sh:504-505` branch — prod1 runs `cloudflared --token-file`, measured 09/09, so the tunnel config is remote; `ingress.py` edits a file nobody reads) : 501 NOT_CONFIGURED
POST /_host/go-live {label, op, domains[]} → config.cloudflare ? job runScript(go-live.sh) : 501
sync.js start(config): setInterval 1h → runScript(tools/sync-site-folders.sh); 10 minutes → tools/sync-brands.sh (these two scripts call tracy-web's `/fleet/git-token` with HOST_SECRET — fix `lib/relay-git-token.sh`: `TRACY_SEATS_URL` → `${TRACY_WEB_ORIGIN}`, path `/fleet/git-token`, ts+nonce signature like auth.js — written with `openssl dgst -sha256 -hmac`)
```
- [ ] Test: `validateWebrootBody` rejects a `path` that climbs out, a bad `sha`, an unknown key; accepts a `webroot-changes` body; `webroot-release` creates the notes file and deletes it after the job. `/_host/agent-token` reads the right file in a temp directory.
- [ ] Commit — `feat(host): the seventeen webroot jobs, the agent token, address and go-live behind config, and the two sync timers`

---

### Task 5: Image + shared compose + MinIO + tracy-web pointing at the host

**Files:**
- Create: `apps/tracy-host/Dockerfile`, `apps/tracy-host/.dockerignore`
- Modify: `deploy/compose.yml`, `deploy/.env.example`, `apps/tracy-web/src/config.js` (`artifacts: { endpoint, bucket, accessKey, secretKey } | null`)

- [ ] **Step 1: Dockerfile**
```dockerfile
FROM node:24-slim
RUN apt-get update && apt-get install -y --no-install-recommends docker.io docker-compose-v2 git rsync bash curl python3 iptables ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/tracy-host
COPY apps/tracy-host/package.json apps/tracy-host/pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --prod --ignore-scripts
COPY apps/tracy-host/src ./src
# The scripts the fleet has always run, at the path they have always had.
COPY packages/fleet/tracy-fleet-operation/scripts /opt/tracy-fleet
ENV TRACY_FLEET_DIR=/opt/tracy-fleet PORT=8090
CMD ["node", "src/server.js"]
```
(`docker-compose-v2` on Debian bookworm provides `docker compose`; if apt does not have it, download the plugin from the GitHub release at a pinned tag, with a checksum check — record how it was chosen in a comment.)

- [ ] **Step 2: compose** — add:
```yaml
  minio:
    image: minio/minio:RELEASE.2025-04-22T22-12-26Z
    command: server /data --console-address ":9001"
    environment: { MINIO_ROOT_USER: tracy, MINIO_ROOT_PASSWORD: ${MINIO_PASSWORD:-tracy-tracy} }
    volumes: [tracy-minio:/data]
    ports: ["127.0.0.1:9000:9000"]
    profiles: [local]
  minio-init:   # create the bucket once
    image: minio/mc:RELEASE.2025-04-16T18-13-26Z
    depends_on: [minio]
    entrypoint: ["/bin/sh","-c","mc alias set m http://minio:9000 tracy $${MINIO_PASSWORD:-tracy-tracy} && mc mb -p m/tracy-artifacts || true"]
    profiles: [local]
  tracy-host:
    build: { context: .., dockerfile: apps/tracy-host/Dockerfile }
    image: tracy/host:dev
    env_file: [.env]
    environment:
      HOST_NAME: ${HOST_NAME:-local}
      HOST_SECRET: ${HOST_local_SECRET}
      TRACY_SITES_ROOT: ${TRACY_SITES_ROOT}
      TRACY_PRIVATE_ROOT: ${TRACY_PRIVATE_ROOT}
      TRACY_WEB_ORIGIN: http://tracy-web:8080
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ${TRACY_SITES_ROOT}:${TRACY_SITES_ROOT}
      - ${TRACY_PRIVATE_ROOT}:${TRACY_PRIVATE_ROOT}
      - tracy-host-jobs:/var/lib/tracy-host
    network_mode: host          # go-live's iptables and the loopback the sites publish on.
                                # Docker Desktop (macOS): host networking exists from 4.34 and must be ENABLED
                                # (Settings → Resources → Network → "Enable host networking"); off, the flag is
                                # silently ignored. deploy/scripts/check-local.sh probes it (Step 4) and refuses to go on.
  docker-proxy:  (carried over as is from packages/fleet/tracy-fleet-operation/dsh/host-dsh.yml, config path `../packages/fleet/tracy-fleet-operation/dsh/docker-proxy.haproxy.cfg`)
  tracy-dsh:     (carried over as is: the `dsh` service from host-dsh.yml; image `${DSH_IMAGE:-tracy/dsh}:${DSH_IMAGE_TAG:-dev}`; bind `${TRACY_SITES_ROOT}:/site` — NOT rshared; `${TRACY_DSH_HOME}:/desk-home`; DSH_TRUSTED_HOSTS: "${HOST_NAME}-agent.${SITE_DOMAIN},127.0.0.1:51700,127.0.0.1:8080,host.docker.internal:51700"; ports 127.0.0.1:51700:8080)
volumes: { tracy-minio: {}, tracy-host-jobs: {} }
```
`.env.example` adds: `TRACY_SITES_ROOT=/ABSOLUTE/PATH/tracy-data/sites`, `TRACY_PRIVATE_ROOT=/ABSOLUTE/PATH/tracy-data/private`, `TRACY_DSH_HOME=/ABSOLUTE/PATH/tracy-data/dsh-home`, `DSH_IMAGE_TAG=dev`, `ARTIFACT_S3_ENDPOINT=http://host.docker.internal:9000` (**one** value for both signing and downloading — SigV4 signs by `host`, so `tracy-web`, dsh and the site containers must all see the same endpoint; only `tracy-web` sees `minio:9000`), `ARTIFACT_S3_BUCKET=tracy-artifacts`, `ARTIFACT_S3_ACCESS_KEY=tracy`, `ARTIFACT_S3_SECRET_KEY=tracy-tracy`, `HOST_local_ORIGIN=http://host.docker.internal:8090`. ⚠ `tracy-host` is on `network_mode: host`, so `tracy-web` (bridge) calls it via `host.docker.internal:8090`; for **dsh**, `HOST_local_ORIGIN` would be `http://host.docker.internal:51700` — two different things: add `HOST_<h>_DSH_ORIGIN` to the config (Plan 1's `dshOf` reads it; `hostSecret` goes with `_ORIGIN`). Update `readConfig` + Plan 1's tests accordingly.

- [ ] **Step 2b: Site names that CONTAINERS can resolve — `*.tracy.test` via a static-IP dnsmasq**

The browser uses `<label>.localhost:8080` (nothing to install). Containers (dsh, site) use `<label>.tracy.test:8080`,
and `tracy-web` accepts **both** suffixes (`SITE_DOMAIN=localhost`, `SITE_DOMAIN_ALIASES=tracy.test` — Plan 4
`hostKind`). Import locally takes the source site's admin URL in the form `http://<label>.tracy.test:8080/` (the README says so),
because the host half of the wizard runs in `tracy-dsh`.

Compose (profile `local`) — a network with a fixed subnet so static IPs can be used:
```yaml
networks:
  tracy:
    ipam: { config: [{ subnet: 172.30.0.0/24 }] }
services:
  dns:
    image: 4km3/dnsmasq:2.90-r3
    command: ["-k", "--log-facility=-", "--address=/${SITE_DOMAIN_ALIASES:-tracy.test}/172.30.0.10", "--server=1.1.1.1"]
    networks: { tracy: { ipv4_address: 172.30.0.53 } }
    profiles: [local]
  tracy-web:
    networks: { tracy: { ipv4_address: 172.30.0.10 } }     # add to the existing service
  tracy-dsh:
    dns: [172.30.0.53]                                       # local; servers do not have this line
    networks: [docker-api, egress, tracy]
```
Site containers generated by `render-compose.sh`: **one** conditional line — when the env `TRACY_SITE_DNS` is non-empty, print
`    dns: [${TRACY_SITE_DNS}]` into the `web` service (already listed in Task 2); `tracy-host` passes `TRACY_SITE_DNS=172.30.0.53`
from the local `.env`. Site containers must also be on the `tracy` network to reach `172.30.0.10` — `render-compose.sh` prints
`networks: [default, tracy]` + declares `networks: { tracy: { external: true, name: tracy_tracy } }` when
`TRACY_SITE_NETWORK` is non-empty (same env-gated mechanism).

Acceptance: `docker run --rm --dns 172.30.0.53 --network tracy_tracy alpine getent hosts x.tracy.test` →
`172.30.0.10`; `docker exec tracy-dsh node -e "require('dns').lookup('x.tracy.test',console.log)"` →
`172.30.0.10`; browser `http://x.localhost:8080/` → 404 Tracy page (no site yet). All three paths reach
`tracy-web`.

⚠ `tracy-host` on `network_mode: host` is **not** on the `tracy` network — it calls sites at `127.0.0.1:<port>` as
`provision.sh` always has. On Docker Desktop macOS, `network_mode: host` is the loopback of the **Linux VM**, so
`tracy-web` (bridge) reaches `tracy-host` via `host.docker.internal:8090` — exactly as in `.env.example`.

- [ ] **Step 3: Local dsh image** — `docker build -f packages/fleet/tracy-fleet-operation/dsh/Dockerfile -t tracy/dsh:dev .` (as in HOST-DSH.md §1; ~10 minutes). `MCP_SEAT_SECRET` is set in `${TRACY_DSH_HOME}/dsh-passwords.env` by the seed part of `packages/fleet/tracy-fleet-operation/dsh/seed-profile.sh`/`host-dsh-init.sh` — read HOST-DSH.md §2, follow the seed step exactly, **value = `SEAT_local_SECRET`**.

- [ ] **Step 4: `deploy/scripts/check-local.sh`** (create): (1) `docker run --rm --network host alpine wget -qO- http://127.0.0.1:1` must return *Connection refused* (host networking on), not *network unreachable*; (2) `docker network ls | grep tracy_tracy`; (3) the `TRACY_SITES_ROOT`/`PRIVATE_ROOT` paths are absolute and exist; when red, print exactly which switch must be turned on. Then `docker compose --profile local up -d --build` → `docker compose ps` 7 services healthy (postgres, minio, dns, tracy-web, tracy-host, docker-proxy, tracy-dsh). Add a measurement: `docker run --rm --network host alpine wget -qO- http://127.0.0.1:8090/health` → `{docker:true,…}` — proves that `tracy-host`'s port is on the loopback that the sites also publish on.

- [ ] **Step 5: Acceptance in the browser** — sign in → *Add site* (plugin `tracy-add-site` on `native`) → name `lantern`, WordPress → the job console runs (`==` steps) → *Open site* → `http://lantern.localhost:8080/` **(the Host-based proxy only arrives in Plan 4; for now open `http://127.0.0.1:<port>`** that the job returns) → back to the workspace → chat: *"list files in /site/lantern"* → see `AGENTS.md`, `.webroot/`. Changes tab → has a baseline row; edit a file through the agent → Changes shows it; Release → tag `tracy-release/v2` in `${TRACY_PRIVATE_ROOT}/lantern/webroot-baseline.git`; Restore → back to v1.
  Import: build a second site `source` as above; the Import wizard with admin URL **`http://source.tracy.test:8080/`** (the host half of the wizard runs in `tracy-dsh` — only that name resolves from a container, Step 2b); storage: the extension on the site runs in the `source-web-1` container, the name `minio` does not resolve from the site's network → `ARTIFACT_S3_ENDPOINT=http://host.docker.internal:9000` for both signing and downloading; write it into `.env.example`. End state: a third site `imported-…` runs with the content of `source`.

- [ ] **Step 6: Delete `packages/tools/tracy-subprocess-docker/dev/` and `scripts/dev-fleet*.mjs`** with their tests (`scripts/test/dev-fleet-site.test.mjs`); update `docs/references/running-tracy-locally.md` §6 and `kien-truc-mot-dsh.md` §2.2 to point at `deploy/compose.yml`. `pnpm build:check` green (gates `doc-links`, `doc-frontmatter` `sources`).

- [ ] **Step 7: Commit** — `feat(host): one compose for the whole thing — a site built from the Add site button on a laptop`
