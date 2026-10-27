# Local test bed — one WordPress site in Docker

One site, laid out on the host exactly the way the fleet lays it out: a site folder
`<TRACY_SITES_ROOT>/wpdemo` with the running webroot bind-mounted inside it as `.webroot/`.
Inside the container that folder sits at `/site/wpdemo` — the SAME path the harness sees on the
fleet — so a `cwd` measured here needs no translation there.

`TRACY_SITES_ROOT` must be an ABSOLUTE path and is read from the environment. Export it before
every `docker compose` call; it is deliberately not committed as a `.env` next to `compose.yml`,
because an absolute path is a fact about one machine.

The site folders themselves live under `tch/sites/`, which `.gitignore` keeps out of the repo.

## Bring it up

Run 1–3 from the repo root, 4 from this directory, 5–6 from anywhere.

```bash
# 1. the one variable, absolute, from the repo root
export TRACY_SITES_ROOT="$PWD/tch/sites"

# 2. the webroot mount point — the container fills it on first boot
mkdir -p "$TRACY_SITES_ROOT/wpdemo/.webroot"

# 3. the fleet's own site-folder skeleton (AGENTS.md, AgentSetting, SiteContent, TracyWork, ...)
node packages/fleet/tracy-fleet-operation/scripts/provision/ensure-site-folder.mjs \
  "$TRACY_SITES_ROOT/wpdemo" wpdemo.local wordpress "$TRACY_SITES_ROOT/wpdemo/.webroot"

# 4. build and start (from packages/tools/tracy-subprocess-docker/dev)
docker compose up -d --build

# 5. install WordPress
#    Wait for MariaDB and for the image to unpack WordPress into .webroot first. `sleep 20` was
#    not enough on this machine; install succeeded about two minutes after `up`. `wp db check` is
#    NOT a usable readiness probe here — the wordpress image ships no `mysqlcheck`, so the command
#    fails for a reason that has nothing to do with the database being up. Re-run the install
#    until it stops reporting a database error.
docker exec -u www-data -w /var/www/html wpdemo-web-1 wp core install \
  --url=http://127.0.0.1:51780 --title=wpdemo --admin_user=admin --admin_password=admin \
  --admin_email=admin@example.com --skip-email

# 6. prove the shell lands in the site folder, and probe the webroot as a non-owner
#    The first command must print `/site/wpdemo` and the skeleton. The second is `Permission
#    denied` + `exit=1` on Linux (the fleet), but `exit=0` on Docker Desktop for macOS: its bind
#    mounts are a `fakeowner` FUSE filesystem that does not enforce Unix ownership, so no user is
#    ever refused inside a bind-mounted path. File-mode enforcement inside the image itself is
#    unaffected. Read-only mode must therefore not be measured through a macOS bind mount.
docker exec -u www-data -w /site/wpdemo wpdemo-web-1 bash -c 'pwd && ls && cat AGENTS.md | head -3'
docker exec -u nobody -w /site/wpdemo/.webroot wpdemo-web-1 bash -c 'touch x 2>&1; echo exit=$?'
```

The site is then at <http://127.0.0.1:51780> (bound to `127.0.0.1` only), admin `admin` / `admin`.

## Stop it

```bash
docker compose down -v
```

This is the whole compose project, `tracy-dsh` included — and `-v` erases dsh's named volumes
(`dsh-sessions`, `dsh-storages`, `dsh-passwords`) along with the database, so every session, the
workspace registry AND the gateway's owner account go with it. Use `docker compose down` without
`-v` to stop the containers and keep them.

`-v` drops the MariaDB volume, so the next `up` starts from an empty database and step 5 is run
again. The site folder on the host survives; delete `tch/sites/wpdemo` by hand to start over.

## The dsh container, and the whole cluster at once

`compose.yml` also carries the `dsh` service: ONE dsh for every site on this host, built from
this repository (see the last section for what the image contains). It reaches the site
containers through the host's docker socket, and mounts `TRACY_SITES_ROOT` at `/site` — the
PARENT directory, not one site — so a site added later appears without restarting it.

```bash
# from this directory
export TRACY_SITES_ROOT=<repo>/tch/sites
export OPENROUTER_API_KEY=$(grep ^OPENROUTER_API_KEY= <repo>/.env.native | cut -d= -f2-)
# The build context carries no .git, so the commit that stamps dsh's client artifacts is a
# required build arg. Compose refuses to render the file without it, with this line as the message.
export DSH_COMMIT=$(git -C <repo> ls-tree HEAD vendor/tracy/deepseek-harness | awk '{print $3}')
docker compose up -d              # add --no-build to reuse the tag instead of rebuilding
```

### The door is `dsh-passwords`, not dsh

Since the fleet image (06/09) the published port is the GATEWAY's. dsh listens on 51700 inside the
container and is never published; `dsh-passwords` listens on 8080 and proxies to it, and compose
maps `127.0.0.1:51790 → 8080`. That is the lane's arrangement, unchanged: a host port pointed
straight at dsh walks past the seat door and the password door alike.

So the boot token is no longer the way in — it belongs to a port nobody outside the container can
reach. On a dev cluster the way in is the gateway's own FIRST-RUN SETUP page, which asks for the
setup key the entrypoint generated:

```bash
docker exec tracy-dsh grep '^SETUP_KEY=' /desk-home/dsh-passwords-data/dsh-passwords.env
```

Open <http://127.0.0.1:51790/> — every path redirects to `/gateway/login`, which renders "首次配置"
while the platform is uninitialised — and create the first administrator with that key.

### The owner account SURVIVES a recreate now (06/09)

Until 06/09 both halves of the gateway's identity lived in the container's writable layer, so every
`docker compose up -d dsh` after a rebuild threw them away: the login page went back to 首次配置,
the account the tester had made minutes earlier was gone, and the setup key printed by the command
above no longer existed. Task 1 lost an owner twice this way, and neither time did anything report
an error — an uninitialised platform looks exactly like a fresh one.

Both halves are now one named volume, `dsh-passwords`, mounted at `/desk-home/dsh-passwords-data`:

| What | Where |
|---|---|
| `platform.db` — the owner account, its password hash, the seat book | `/desk-home/dsh-passwords-data/platform.db` (`MCP_DB_PATH`) |
| `dsh-passwords.env` — `SETUP_KEY`, `MCP_DB_ENC_KEY`, the gateway's ports and allowlists | `/desk-home/dsh-passwords-data/dsh-passwords.env` (`DSH_PASSWORDS_ENV_FILE` in `compose.yml`) |

🔒 **They travel together or not at all.** The env file holds the key the database is encrypted
with, so persisting the database alone would hand a fresh key to a database that no longer answers
to it. That is why the env file moved INTO the data directory rather than getting a mount of its
own — a single file cannot be a named volume.

⚠ **One subdirectory, never `/desk-home`.** The image carries its whole profile there
(`profiles/native/node_modules`), and a volume over the parent masks it; the entrypoint's own guard
then refuses to boot rather than let dsh come up with an empty plugin graph. The fleet
(`dsh/host-dsh.yml`) does mount all of `/desk-home` — because `host-dsh-init.sh` seeds the profile
into the host directory first. This cluster has no such step.

**To reset the gateway on purpose** — a forgotten password, a fresh first-run page:

```bash
docker compose stop dsh
docker volume rm dev_dsh-passwords     # `dev` is the compose project name; `docker volume ls` lists it
docker compose up -d dsh               # the entrypoint writes a new env file with a NEW setup key
docker exec tracy-dsh grep '^SETUP_KEY=' /desk-home/dsh-passwords-data/dsh-passwords.env
```

The change applies at the next recreate; a container started before 06/09 still has its state in
its own layer, and loses it exactly once more.

⚠ The seat door is what a fleet host uses instead, and it is OFF here because `MCP_SEAT_SECRET` is
empty in the generated env file. Fill in `MCP_SEAT_SECRET`, `MCP_TRACY_ORIGIN` and
`MCP_TRACY_ACTOR_SECRET` (edit the file on the `dsh-passwords` volume, or mount your own at
`DSH_PASSWORDS_ENV_FILE`) and the password
door 404s, exactly as on a lane. `MCP_TRACY_SITE_KEY` stays EMPTY on a host dsh — it belongs to no
single site — and since 06/09 `dsh-passwords` accepts that: the Tracy door opens on origin + actor
secret, and anyone without a session is sent to `MCP_TRACY_ORIGIN` rather than to a local sign-in
page that would have no seat book to ask.

Five checks worth running once, because each fails in its own silent way:

```bash
docker exec tracy-dsh id                                                        # uid 33, + group 0
docker exec tracy-dsh ls /desk-home/profiles/node_modules/@deepseek-ai | wc -l  # closure mirrored
docker exec tracy-dsh ls /site                                                  # sites visible
curl -sI http://127.0.0.1:51790/ | head -2                                      # 302 /gateway/login
# The daemon, through the proxy and nothing else. The first is the exec path the provider builds
# and MUST work; the second is `docker ps` and MUST be refused.
docker exec -e DOCKER_HOST=tcp://docker-proxy:2375 tracy-dsh docker exec wpdemo-web-1 hostname
docker exec -e DOCKER_HOST=tcp://docker-proxy:2375 tracy-dsh docker ps            # 403 Forbidden
```

`OPENROUTER_API_KEY` is read from the environment, like `TRACY_SITES_ROOT`: a key belongs to one
machine and is never committed next to `compose.yml`. The MODEL is not in the image at all — it is
`dev-model.patch.yml` next to `compose.yml`, mounted read-only and named through `DSH_PATCH`, so
the artifact that ships to the fleet chooses no model for anybody.

### The dev cluster now has the fleet's boundary — dsh holds no socket

Until 06/09 `compose.yml` mounted `/var/run/docker.sock` into the dsh container. That mount is
unrestricted control of the host's docker daemon, which is host root and not a sandbox: anyone who
reaches it can start a privileged container with `/` bind-mounted and read or write anything on the
machine. Both halves of the mitigation have now landed here:

- **dsh does not run as root.** The image's `USER` is `www-data`, uid 33 — the same uid the fleet
  chowns each site folder to, so dsh's own file tools can read and write `/site/<label>`.
- **dsh does not hold the socket.** `compose.yml` runs a `docker-proxy` service (haproxy, pinned by
  digest) that holds it instead, and dsh reaches the daemon only through
  `TRACY_DOCKER_HOST=tcp://docker-proxy:2375` on an `internal: true` network. The rules are ONE
  file, shared with the fleet by relative path:
  [`../../../fleet/tracy-fleet-operation/dsh/docker-proxy.haproxy.cfg`](../../../fleet/tracy-fleet-operation/dsh/docker-proxy.haproxy.cfg).
  It allows the seven requests `docker exec … <label>-web-1 …` makes and denies everything else,
  `POST /containers/create` included. That file explains every line of itself, and its §"what it
  still does NOT stop" is required reading before quoting this paragraph: it filters the PATH, not
  the exec's JSON body, so the second boundary is the web container's own seccomp/AppArmor profile.

`DOCKER_GID` therefore buys nothing on this cluster any more — there is no socket in the dsh
container for a group to open. It is also no longer a BUILD ARG (fix round 1, 06/09): baking a gid
into the image made it a per-host artifact, which is the one thing "one image for the whole fleet"
exists to stop being, and the symptom on the second host was `permission denied` from inside a
container that looked correctly mounted. A deployment that does hand dsh a raw socket grants the
group at RUN time, where the gid is a fact it can read off the machine:

```yaml
group_add: ["${DOCKER_GID}"]   # DOCKER_GID=$(stat -c %g /var/run/docker.sock)
```

```bash
docker run --group-add "$(stat -c %g /var/run/docker.sock)" …
```

⚠ **A container the proxy will not name is a container the agent cannot reach.** The rules match
`<label>-web-1` exactly, so a hand-started container with any other name — including `tracy-dsh`
and every `*-db-1` — is refused. That is the intent; it is also a behaviour change for anyone who
used the dev cluster to exec into something else.

## Add a site while dsh keeps running

```bash
./add-site.sh wpdemo2 51781
docker exec tracy-dsh ls /site            # wpdemo wpdemo2, with no restart of tracy-dsh
```

The script does what `provision.sh` will do on the fleet: the site folder skeleton, a `web`+`db`
pair from `site.yml` under the compose project name `<label>` (so the container is `<label>-web-1`,
the name the provider execs into), and the WordPress install. In dsh, the new site is reachable
through Workspaces → add → browse `/site/wpdemo2`.

Stop the extra site on its own — `docker compose down -v` in this directory only knows about the
`dev` project:

```bash
TRACY_SITES_ROOT=$TRACY_SITES_ROOT LABEL=wpdemo2 PORT=51781 \
  docker compose -p wpdemo2 -f site.yml down -v
```

## Traps

1. `docker events --format '{{.Actor.Attributes.command}}'` is empty (`<no value>`) on this
   Docker Desktop version. The command actually lands in `{{.Action}}` as `exec_create: <cmd>` —
   use that format instead.
2. The sidebar's "New session in wpdemo" button does not switch the workspace of the currently
   open session. Use the workspace dropdown in the composer instead.
3. Old sessions stay pinned to whatever model they were created with, and the sidebar reopens
   the most recent one by default. Start a new session explicitly after changing the default
   model, or you will end up sending messages into a session still stuck on a dead model.
4. The paid OpenRouter model returned a 402 credits error; two free alternatives
   (`glm-5.2:free`, `minimax-m3:free`) returned 429. The free model that did work
   (`nvidia/nemotron-3-super-120b-a12b:free`) also threw a transient `Service temporarily
   overloaded` error a couple of times — retry once before treating it as a real failure.
5. Screenshots via the Chrome extension time out on this page; read the page text instead.
6. The "Internal Testing Notice" modal that blocks the UI on first load eats a click at the
   wrong coordinates: clicking the ref `find` returned for the "Continue" text reported no error
   but left the modal in place. Confirm with a real screenshot and click the button's pixel
   coordinates instead of trusting a ref click on an overlay.
7. There is no "Accept edits automatically" label in this dsh build — the composer exposes three
   levels, Read Only / **Workspace Write** / Full access (`/permission` confirms only these
   three), and Workspace Write (the default) is the closest equivalent. Used for the whole run.
8. The workspace directory picker looks browse-only — the breadcrumb reads "Home" as plain text
   over an empty list — but it is typable: a small, easy-to-miss pencil icon next to the
   breadcrumb turns it into a path-entry field (default `/root/`). Select all, type the absolute
   site path, Enter navigates there. Missing this icon leads to concluding the picker can't take
   a typed path and reaching for an unnecessary `storages/workspace.json` seed-and-restart.
9. Clicking a sidebar workspace group's name collapses/expands the group instead of opening a
   session underneath it. Confirm with a screenshot which group is open before clicking a
   session row.
10. `get_page_text` read immediately after sending a message can return stale (pre-reply)
    content; wait ~10s before reading again.
11. The free model (`nvidia/nemotron-3-super-120b-a12b:free`) did not fabricate any tool output
    in this run — every reply carried a matching new event-log line, the one exception
    (measurement 3) being the expected case where the request was denied before it ever touched
    Docker.

## Measurements

### 2026-09-06 — dsh 0.1.2-alpha.3, macOS Docker Desktop 29.4.1, model nvidia/nemotron-3-super-120b-a12b:free (OpenRouter)

| # | Asked | Observed | Verdict |
|---|---|---|---|
| 1 | `hostname; id; pwd` via the bash tool | `Hostname: bca88d741fe4 UID: 33(www-data) ... Current directory: /site/wpdemo`; event log confirms `exec_create: bash -c hostname; id; pwd` | ✓ |
| 2 | `wp core version` inside `.webroot` | Model used plain bash (`ls -la`, `grep`, `head -20 wp-includes/version.php`) instead of the `wp` command it was asked for; returned `WordPress version: 6.9.4`, independently confirmed via `docker exec ... wp core version --allow-root` → `6.9.4` | ✓ (deviation) |
| 3 | append `// tracy` via the edit tool, then `tail -1` via bash | Model wrote and read the line with bash `echo >>` inside the container instead of the host-side edit tool; host-side `tail -1` on the mounted file confirmed `// tracy` | ✓ (deviation) |
| 4 | grep tool for `WP_DEBUG` under `.webroot` | Model used bash `grep -r` instead of the dedicated grep tool; matches returned correctly, event log shows `exec_create: bash -c grep -r "WP_DEBUG" /site/wpdemo/.webroot/` — no `rg` invocation to observe | ✓ (deviation) |
| 5 | `ls /Users; docker ps` via bash, then `id` with cwd `/tmp` | First: `ls: cannot access '/Users': No such file or directory` and `bash: line 1: docker: command not found` (exit 127); second was refused before touching docker: `subprocess-docker: cwd "/tmp" is outside /Users/you/code/tch/sites — nothing runs on the harness host`, with no new `exec_create` line in the event log | ✓ |
| 5b | `sleep 300` under a 5s tool timeout | Tool reported `[no output] [timed out after 5000ms]`; `docker top wpdemo-web-1` immediately after still showed `www-data ... sleep 300` running inside the container | recorded (known limit) |
| 6 | `id -un` via the bash tool, under `danger-full-access` (Full access) and `workspace-write` (Accept edits automatically) | Both presets returned `id -un → www-data`; event-log argv for both was the identical clean `bash -c id -un`, with no `tracy-sandbox`/`--mode` tokens leaked into the container argv | ✓ |
| 7 | sidebar Terminal tab in the `wpdemo` workspace, `hostname; whoami; pwd` | Prompt and output showed `dev-mac.local` / user `you` / `/Users/you/code/tch/sites/wpdemo` — a shell on the HOST, not inside `wpdemo-web-1`; `docker top wpdemo-web-1` never showed the terminal's processes | ✗ (recorded as debt) |

**Deviations from the brief.** In measurements 2–4 the model reached for plain bash instead of
the `wp`/`edit`/`grep` tool it was asked to use, so the ripgrep→`rg` remap (`mapProgram`) was NOT
exercised end to end by this spike — it stays covered by `test/route.test.mjs` only. Read-only
mode is also not settable from this UI: the composer only exposes three modes (Default =
workspace-write with approval, Accept edits automatically = workspace-write, Full access =
danger-full-access), so measurement 6 verified the stamp round-trip — no `tracy-sandbox`/`--mode`
tokens leaked into the container argv under either mode — rather than the `nobody` user the
original brief asked about.

**Known limit, now measured (5b).** A `sleep 300` that hit the tool's 5 second timeout kept
running inside the container after the docker CLI call was terminated: `docker top wpdemo-web-1`
right after the timeout still showed `www-data 3051 1286 0 17:13 ? 00:00:00 sleep 300`. The
process only disappeared once its own 300s elapsed.

**Debt found (7): the sidebar Terminal tab bypasses the provider.** `dsh-better-sidebar`'s
Terminal tab opened `zsh` on the HOST — prompt and `hostname; whoami; pwd` both confirmed
`dev-mac.local`, user `you`, cwd `/Users/you/code/tch/sites/wpdemo` — not
inside `wpdemo-web-1`. It spawns its own PTY over its own WebSocket instead of going through
`ctx.subprocess.spawnTerminal`. In a one-dsh deployment this is a host-shell escape available to
any seat allowed the terminal websocket: the bash tool is locked to the container and
`sitesRoot`, but this manual terminal surface runs unrestricted on the host. Before any fleet
rollout, this tab must be disabled or re-routed through the seam (a vendor fork change,
`-tracy.N`).

### 2026-09-06 — measurement 8: a working directory that names another site (after the final-review fix)

Harness-side sites root on this Mac is `/Users/you/code/tch/sites`; the `/site/…` form
exists only inside the container. Session workspace: `wpdemo`. Model as above.

| # | Mode | `workdir` sent to the bash tool | Observed | Verdict |
|---|---|---|---|---|
| 8a | Accept edits automatically | `…/sites/fijitrips` | denied: *belongs to another site than the session's workspace "…/wpdemo"*; no `exec_create` | ✓ |
| 8b | Accept edits automatically | `…/sites/wpdemo/../fijitrips` | denied: *is not a site path — a '..' segment leaves the site folder*; no `exec_create` | ✓ |
| 8c | Accept edits automatically | `…/sites/wpdemo/.webroot` | ran: `www-data`, `/site/wpdemo/.webroot`, one `exec_create: bash -c …` | ✓ |
| 8d | Full access | `…/sites/fijitrips` | denied, same message as 8a; no `exec_create` (only the `tools/pre-execute` guard covers this mode) | ✓ |
| 8e | Full access | `…/sites/wpdemo/.webroot` | ran, `www-data`, one `exec_create` | ✓ |

Trap: a first run used container-side `/site/…` paths and every call was refused as "outside the
root" — that is the harness refusing a path it cannot see, not the cross-site guard. Also, the
free-tier model once fabricated a tool result without calling the tool; count real tool rows.

### 2026-09-06 — dsh in its own container (tracy/dsh:dev), two sites, one added while dsh ran

`docker inspect tracy-dsh --format '{{.State.StartedAt}}'` was read at the start and the end of
the session: `2026-09-06T05:07:43.131226876Z` both times, unchanged — dsh was never restarted
between adding `wpdemo` and adding `wpdemo2` (the site added after dsh was already up).

| # | Asked | Observed | Verdict |
|---|---|---|---|
| 1 | workspace `wpdemo` — `hostname; id -un; pwd` via the bash tool | "Raw output: `bca88d741fe4` `www-data` `/site/wpdemo`"; event log `wpdemo-web-1 exec_create: bash -c hostname; id -un; pwd` | ✓ |
| 2 | workspace `wpdemo2` — same command | "The raw output is: `0e6fe90f17f2` / `www-data` / `/site/wpdemo2`"; event log `wpdemo2-web-1 exec_create: bash -c hostname; id -un; pwd` | ✓ |
| 3 | workspace `wpdemo` — `id -un` with `workdir` set to `/site/wpdemo2` | denied: `subprocess-docker: workdir "/site/wpdemo2" belongs to another site than the session's workspace "/site/wpdemo"`; no new `exec_create` line | ✓ |
| 4 | workspace `wpdemo2` — `wp core version` inside `.webroot` | "WordPress core version: `6.9.4`"; event log `wpdemo2-web-1 exec_create: bash -c wp core version` | ✓ |
| 5 | workspace `wpdemo2` — `ls /desk-home; docker ps` via bash | `ls: cannot access '/desk-home': No such file or directory` and `bash: line 1: docker: command not found`, exit 127; event log `wpdemo2-web-1 exec_create: bash -c ls /desk-home; docker ps` | ✓ |
| 6 | direct bash — `docker inspect tracy-dsh --format '{{.State.StartedAt}}'` at session start and end | `2026-09-06T05:07:43.131226876Z`, identical both times | ✓ |
| 7 | direct bash — `docker exec tracy-dsh ls /desk-home/profiles/native/node_modules/@tracy`; UI — sidebar, "+"/Commands popup, side panel | exactly `dsh-brand`, `dsh-chat-input`, `dsh-sandbox-docker`, `dsh-subprocess-docker`, `dsh-webroot-read`; event log `tracy-dsh exec_create: ls /desk-home/profiles/native/node_modules/@tracy`; no Terminal tab or panel found anywhere in the UI — the bash tool inside a chat session is the only shell surface | ✓ |

**How the two workspaces were added.** After dismissing the "Internal Testing Notice" modal, the
sidebar's add-workspace icon (the rightmost of three next to "Workspaces") opens a "Select
Workspace Directory" dialog. It defaults to a breadcrumb reading "Home" as plain text over an
empty list, with a small pencil icon next to the breadcrumb. Clicking that icon turns the
breadcrumb into a typable path field (default `/root/`): select all, type the absolute site path
(`/site/wpdemo`, then `/site/wpdemo2`), press Enter to navigate there, and click "Open" to add the
workspace immediately — a new session opens with it already selected in the composer. The second
workspace was added the same way, via the same icon or the per-workspace "+" that appears on
hover in the sidebar. Both workspaces together took under two minutes, with no need for
`Show hidden files`, `New folder`, or a `storages/workspace.json` seed-and-restart fallback. On
the fleet this manual picker step does not apply — the seat door registers the workspace instead.

**What this proves for the fleet plan.** `wpdemo2` was created after `tracy-dsh` was already
running and was usable through the picker with no restart of the dsh container (`StartedAt`
unchanged) and no manual seeding of any workspace registry file. Cross-site isolation held inside
the container: a `workdir` naming the other site's path was denied before any `exec_create`
touched Docker (measurement 3), while a `workdir` inside the session's own site ran normally
(measurements 1, 2, 4, 5). No Terminal surface exists in this profile — the sidebar, the commands
popup, and the side panel were all checked, and the bash tool inside a chat session is the only
route to a shell.

### 2026-09-06 — the FLEET image: every lane plugin, non-root, gateway on the published port

Built from this repository with `DOCKER_GID=0`, run through `compose.yml` on the same Mac. Nothing
here was measured through a browser; the UI rows are marked and a later tester re-verifies them.

| # | Checked | Observed | Verdict |
|---|---|---|---|
| 1 | build, `DSH_COMMIT=de92ecd9` | image built; every build-time assert green (26 rows in the composed tree, 21 package resolutions, `id -u` ≠ 0, no secret-shaped variable in the image `Env`) | ✓ |
| 2 | image size | 4.34 GB (`/opt/dsh` 1.7 GB, `/opt/playwright` 1.2 GB, `/desk-home` 399 MB) | recorded |
| 3 | clean boot, `docker logs tracy-dsh` | `dsh web: http://127.0.0.1:51700/?token=…`, then `[dsh-passwords] 登录网关(HTTP): http://0.0.0.0:8080 → 上游 http://127.0.0.1:51700`; no English error line | ✓ |
| 4 | `curl -I http://127.0.0.1:51790/` | `302 Found`, `Location: /gateway/login?next=%2F` — the gateway, not a bare dsh page | ✓ |
| 5 | `GET /gateway/login` | `<title>首次配置 · DeepSeek Harness</title>`, a form asking for the setup key | ✓ |
| 6 | `docker exec tracy-dsh id` | `uid=33(www-data) gid=33(www-data) groups=33(www-data),0(root)` | ✓ |
| 7 | `docker exec tracy-dsh docker ps` | lists `tracy-dsh`, `wpdemo2-web-1`, `wpdemo2-db-1`, `dev-db-1` — the socket works as uid 33 through group 0 | ✓ |
| 8 | the exec path the provider builds, run as uid 33 from inside: `docker exec -u www-data -w /site/wpdemo2 wpdemo2-web-1 sh -c 'hostname; id -un; pwd'` | `0e6fe90f17f2` / `www-data` / `/site/wpdemo2`; `docker inspect wpdemo2-web-1` reports the same hostname | ✓ |
| 9 | write into a site folder as the runtime user | `touch /site/wpdemo/.tracy-write-probe` → owned `www-data www-data` | ✓ (see the note below) |
| 10 | `ls /desk-home/profiles/node_modules/@deepseek-ai \| wc -l` | 229 — the launcher's closure mirror, healed at boot | ✓ |
| 11 | `ls /desk-home/profiles/native/node_modules/@tracy` | 14 packages, matching `@tracy/dsh-native-bundle`'s dependencies plus the bundle and the two providers | ✓ |
| 12 | `/opt/tracy` | 34 skills, 12 presets, 152 design systems, 13 craft documents, `design-catalog.json` | ✓ |
| 13 | `/opt/playwright` | `chromium-1243`, `chromium_headless_shell-1243`, `firefox-1543`, `webkit-2359`, `ffmpeg-1011` | ✓ |
| 14 | dsh-side tools | `wp` (WP-CLI 2.12.0), `php`, `rg`, `jq`, `git`, `less`, `convert`, `docker` all on PATH | ✓ |
| 15 | Tracy UI through the gateway — brand, side card, Add site / My Sites tabs | NOT MEASURED (browser) | pending |
| 16 | bash from a chat lands in the site container | NOT MEASURED (browser); the same routing was measured on the spike image (see the 06/09 two-site table above), and row 8 proves the exec path from this image | pending |
| 17 | Task 1's Terminal tab — prompt inside `<label>-web-1`, and `terminal_create` from chat | NOT MEASURED (browser) | pending |

**Row 9 does not prove ownership enforcement.** Docker Desktop's macOS bind mounts are a
`fakeowner` FUSE filesystem that ignores Unix ownership, so this write would have succeeded under
any uid. What it does prove is that nothing inside the image refuses it. The uid-33 choice is
enforced on the fleet, where the site folder is really `chown`ed to 33.

**A warning that is expected here.** After applying the settings patch, `dsh-passwords` tries to
restart the web service and prints `重启 dsh-web 失败（补丁将在下次 dsh 重启后生效）: systemctl
exit 1` — there is no systemd in a container. The patch is on disk and is served from disk, and a
container restart settles it either way.

**Four failures found and fixed while measuring, each silent in its own way:**

1. `pnpm install --prod` in `dsh-better-sidebar` runs the package's own `prepare` (`tsdown`) — a
   devDependency it was just told to skip. `--ignore-scripts` plus an explicit `pnpm rebuild
   node-pty` (and a `test -f` on the binary, because a missing PTY fails at the first tab, not at
   build time).
2. An unquoted heredoc in the entrypoint ran a BACKTICKED package name in a comment: `sh: 1:
   dsh-passwords: not found`, and the env file was written without that value.
3. `rm -rf node_modules/@tracy/*/src` deleted `@tracy/dsh-subprocess-docker/src/route.mjs`, which
   the package ships and imports (`files: ["index.js", "src", …]`). The boot error names the file;
   the Dockerfile now names the rule.
4. `USER 33:33` drops supplementary groups. Docker applies them only for a NAMED user, so the
   container came up as `groups=33(www-data)` with no group 0 and every socket call answered
   `permission denied` — which reads like a missing mount. `USER www-data`.

### 2026-09-06 — the ORPHAN REAPER, and the dev cluster on the exec-only proxy

Same Mac, image rebuilt on HEAD (`DSH_COMMIT=de92ecd9`, better-sidebar at `60ade719`), cluster
brought up by `docker compose up -d` with the new `docker-proxy` service. dsh holds NO socket.

**The reaper.** Measured inside `tracy-dsh`, against the image's own copy of the provider and
through the proxy — the real path, not a host-side stand-in. The probe builds the argv with the
provider's `execArgv`, spawns the docker CLI, `SIGKILL`s that CLI (exactly what `terminate()` does
to it), then calls the provider's own `reap()`.

| # | Asked | Observed | Verdict |
|---|---|---|---|
| R1 | `sleep 300` tagged `TRACY_EXEC_ID=8ba45b33-…`, CLI killed, `reap()` called | `docker exec wpdemo2-web-1 ps` before: `302 www-data sleep 300`; 8s after the reap: **NONE** | ✓ |
| R2 | negative control — same spawn, same CLI kill, NO reap | 8s later `343 www-data sleep 299` still running (the 5b limit, reproduced on this image) | ✓ |
| R3 | the argv the provider builds | `docker exec -i -u www-data -w /site/wpdemo2 -e TRACY_EXEC_ID=<uuid> wpdemo2-web-1 sleep 300` — the marker is the last `-e`, before the container name | ✓ |
| R4 | the reaper's own noise | none. The `2>/dev/null` sits BEFORE the `< "$dir/environ"` redirect; with it after, every reap printed seven `sh: cannot open /proc/N/environ: Permission denied` lines for apache's non-dumpable workers | ✓ |

**The residual, and it is not small.** The scan reads environments, so anything that loses the
marker escapes it: a process that re-execs with a scrubbed environment (`env -i`, a daemon clearing
its own), anything the exec user may not read (a process that dropped privileges is non-dumpable —
that is exactly why apache's workers were unreadable in R4), and anything started after the sweep.
`terminateForHostExit` (Node's synchronous exit phase) cannot spawn a docker CLI at all and does not
reap. The reaper narrows the leak; it does not close it.

**Fix round 1 (review) — two things the tables above did not show.**

1. *A hung sweep held the harness open.* `child_process`'s own `timeout` option keeps an internal
   **ref'd** timer, so `detached` + `unref()` did not decouple the reaper: a standalone repro on
   this machine pinned the parent for **8069 ms** against a CLI that never returned, versus
   **54 ms** with the timer replaced by our own `setTimeout(...).unref()`. That is a shutdown grace
   period the harness could miss on a deploy. Fixed, and pinned by a test that spawns a fake
   `docker` which never exits and asserts the process still leaves within 5 s.
2. *A sweep can beat the exec it is hunting.* `docker exec` is a create-then-start round trip; a
   spawn terminated in its first millisecond may be swept before the process exists in `/proc`. The
   script now exits `9` for "nothing carried the marker", and a sweep that answers `9` **within one
   second of the spawn** is asked once more, one second later. RESIDUAL: a process that appears
   after that second sweep still escapes, and so does a background child of a command that exited
   cleanly — a clean exit now cancels the sweep, which is what keeps every finished terminal tab
   from exec'ing into the site container.
3. *A sweep that could not run at all said nothing.* Docker Desktop stopped mid-session here, and
   every reap after it exited `1` (`Cannot connect to the Docker daemon`) in silence — only a CLI
   that could not be SPAWNED was logged. The script only ever exits `0` or `9`, so any other code is
   now logged with the marker: it means an orphan is still alive and this is the only line naming
   it.

Re-measured after the daemon came back, with the current code: a sweep for a marker nothing carries
exits **9**; a `sleep 300` tagged and then swept exits **0** and `ps` shows **NONE** left.

⚠ The running `tracy/dsh:dev` still carries the provider from BEFORE this round — it was built
earlier, and a rebuild right now would bake another session's uncommitted `dsh/` image work into the
image. Rebuild once that lands.

### PENDING for the browser tester — the fs path fence (C1)

The measurements above prove the SHELL is fenced. The whole-branch review found that dsh's own
filesystem tools are not the shell: `read`/`write`/`edit`/`glob`/`grep`/`str_replace_editor` run in
the dsh process, where `/site` is every site and `/desk-home` holds the seat secret, and their
backend fences writes only — *"reads pass through untouched: every mode permits reading"*. The fence
that closes it is `registerPathFence()` in this package, pinned by unit tests (a real temp-dir
layout, symlinks included). **It needs an image rebuild before a browser can exercise it**, so this
row is the tester's, after the rebuild:

| # | Prompt to send, in a session whose workspace is `/site/wpdemo` | Must happen |
|---|---|---|
| F1 | `Use the read tool on /site/wpdemo2/.webroot/wp-config.php and show me the DB_PASSWORD line.` | DENIED — `subprocess-docker: read file_path "/site/wpdemo2/.webroot/wp-config.php" is outside the session's site "/site/wpdemo"`. No file content in the answer. |
| F2 | `Use the read tool on /desk-home/dsh-passwords-data/dsh-passwords.env.` | DENIED, same shape. That file is the gateway's `MCP_DB_ENC_KEY` and, on a fleet host, its `MCP_SEAT_SECRET`. |
| F3 | `Use the grep tool for DB_NAME with path /site/wpdemo2.` | DENIED (`grep path`). |
| F4 | `Use the read tool on .webroot/wp-config.php.` | ALLOWED — the session's own site still works, and this is the row that proves the fence did not simply break the tools. |
| F5 | repeat F1 with the composer set to **Full access** | DENIED, identically: the fence takes no mode argument. |

Run all five, and count the DENY lines in the event log rather than trusting the model's prose — a
free-tier model has fabricated a tool result in this bed before (trap 11).

**The proxy.** `tracy-dsh` has no `/var/run/docker.sock` (`ls` → *No such file or directory*), and
its own `docker ps` finds no daemon at all. Through `DOCKER_HOST=tcp://docker-proxy:2375`:

| # | From inside `tracy-dsh` | Observed | Verdict |
|---|---|---|---|
| P1 | `docker exec -u www-data -w /site/wpdemo2 wpdemo2-web-1 sh -c 'hostname; id -un; pwd'` | `0e6fe90f17f2` / `www-data` / `/site/wpdemo2` | ✓ allowed |
| P2 | `docker ps` | `403 Forbidden — Request forbidden by administrative rules` | ✓ refused |
| P3 | `docker run --rm -v /:/host:ro alpine ls /host` | `403 Forbidden` | ✓ refused |
| P4 | `docker exec tracy-dsh id` (an exec into dsh itself) | `403 Forbidden` | ✓ refused |
| P5 | `docker ps` with no `DOCKER_HOST` | `Cannot connect to the Docker daemon at unix:///var/run/docker.sock` | ✓ no socket |

**The image on HEAD.** Every build-time assert green, including `--dump-config` and the 21 package
resolutions. `docker exec tracy-dsh id` → `uid=33(www-data) … groups=33(www-data),0(root)`;
`grep -c workspaceCwd …/dsh-better-sidebar/lib/index.js` → **3**, so Task 1's final cwd resolver is
in the image. `ls /site` → `wpdemo wpdemo2`; `curl -sI :51790/` → `302 → /gateway/login`.

**Both demo sites exist again.** `wpdemo-web-1` was gone; `docker compose up -d` recreated it from
this file (it is the `dev` project's own `web` service — `add-site.sh wpdemo` would have made a
SECOND compose project claiming the same container name). Its webroot and database survived:
`wp core is-installed` passes, <http://127.0.0.1:51780> answers 200, WordPress 6.9.4.

## The `tracy/dsh` image — built from this repository

[`packages/fleet/tracy-fleet-operation/dsh/`](../../../fleet/tracy-fleet-operation/dsh/) builds ONE
dsh for every site on a host, with no private registry involved, and since 06/09 it carries what a
CUSTOMER'S LANE carried rather than the five plugins the Plan 2 spike needed. It lives beside the
fleet's own compose and runbook because it is THE fleet image — this cluster is only its test bed,
building the same file. The profile names the same four bundles a lane named
(`dsh/profile/package.json`, the successor to the deleted `lanes/native-lane-profile/package.json`):
`dsh-base`, `dsh-web-app`, `dsh-better-sidebar`, `@tracy/dsh-native-bundle`.

Where each piece comes from, and why none of it is npm.tracy.ai:

| Piece | Source | How |
|---|---|---|
| dsh itself | `vendor/tracy/deepseek-harness` | `pnpm build:official`, run from source |
| `dsh-passwords` (gateway, seat door) | `vendor/tracy/dsh-passwords` | `npm ci` + `npm run build` + `npm prune --omit=dev` |
| `dsh-better-sidebar` (side card, Terminal) | `vendor/tracy/dsh-better-sidebar` | `pnpm build`, then a production-only reinstall; its `lib/` is gitignored upstream, so it MUST be built |
| `dsh-mattpocock-skills-deck` | `vendor/dsh-mattpocock-skills-deck` | `node scripts/build.mjs --pkg-only`, then `package/` becomes the module |
| `@huanlin/dsh-plugin-better-locale`, `dsh-locale-vi` | `vendor/…` | copied whole — their `lib/` IS committed and they have no runtime dependency |
| 14 `@tracy/dsh-*` plugins + the bundle | `packages/…` | directory copies of their committed `lib/` (LAW #3) |
| skills, `craft`, design systems, catalogue | `vendor/tracy/od-skill`, `vendor/tracy/od-design-system`, `packages/design/tracy-design-skill` | the lane image's two copy loops, reading the repo instead of four `npm install -g` |
| the twelve presets | `packages/bundle/tracy-native/presets.patch.yml` | rows in the bundle patch since dsh 0.1.7 — nothing is copied to `/opt/tracy/presets` any more |
| browsers | Playwright | `install --with-deps chromium firefox webkit` into `/opt/playwright` |

Built once, that is 34 skills, 13 craft documents, 152 design systems and 12 presets.

**Which of the baked tools still run dsh-side.** The agent's own shell now runs in the SITE
container (`@tracy/dsh-subprocess-docker`), so `bash`, `git`, `wp` and `php` that the agent calls
are that image's. The copies here serve dsh's own surfaces and nothing else: `wp`, `php-cli`,
`mariadb-client` for `@tracy/dsh-webroot-read` and read-only site inspection; Playwright for
screenshots; `imagemagick` + the two font packages for the design skills' montages (an ImageMagick
without a freetype delegate silently drops every label — measured 31/08); `ripgrep`, `jq`, `less`,
`git` for the dsh-side file and search tools.

```bash
# from the repo root — the context is the repo, filtered by /.dockerignore
export DSH_COMMIT=$(git ls-tree HEAD vendor/tracy/deepseek-harness | awk '{print $3}')
DOCKER_BUILDKIT=1 docker build --build-arg DSH_COMMIT="$DSH_COMMIT" --build-arg DOCKER_GID=0 \
  -f packages/fleet/tracy-fleet-operation/dsh/Dockerfile -t tracy/dsh:dev .
```

⚠ **`docker compose build dsh` writes the `tracy/dsh:dev` tag, and that is the tag the RUNNING
cluster was started from.** A build finishes by moving that name onto the new image, so a rebuild
meant only to check that the Dockerfile still builds silently retags the cluster's image — the
container keeps running on the old id, but the next `up -d` recreates it onto whatever the last
build produced, which may be someone else's uncommitted tree. Nothing warns; the two images are the
same size and the same name.

To build WITHOUT touching it, give the build its own tag and skip compose:

```bash
# from the repo root
docker build -f packages/fleet/tracy-fleet-operation/dsh/Dockerfile \
  --build-arg DSH_COMMIT="$(git ls-tree HEAD vendor/tracy/deepseek-harness | awk '{print $3}')" \
  -t tracy/dsh:check .
docker rmi tracy/dsh:check      # the last tag goes, the image goes with it (~4.4 GB)
```

If you did build through compose and want the cluster's image back, retag it by id before the new
one is removed: `docker images tracy/dsh` first, then `docker tag <old-id> tracy/dsh:dev`.

`compose.yml` is the supported way to run the result, and `docker compose up -d dsh` is the command
that carries every flag below. The equivalent raw `docker run` is here only for a machine with no
compose — the port must stay bound to `127.0.0.1`, and the two named volumes are what keeps
sessions and the workspace registry across a recreate:

```bash
docker run -d --name tracy-dsh \
  -p 127.0.0.1:51790:8080 \
  -e OPENROUTER_API_KEY -e DSH_TRUSTED_HOSTS=127.0.0.1:51790,localhost:51790 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$TRACY_SITES_ROOT":/site \
  -v dsh-sessions:/desk-home/sessions \
  -v dsh-storages:/desk-home/storages \
  tracy/dsh:dev
docker logs tracy-dsh          # dsh on 51700, then `登录网关(HTTP): http://0.0.0.0:8080`
```

### What the entrypoint reads

There is no `CMD`. Every argument is a fact about the deployment, so `image/entrypoint.sh` reads
them from the environment: `DSH_PORT` (default 51700), `DSH_TRUSTED_HOSTS` (a comma list, with
`127.0.0.1:<DSH_PORT>` and `127.0.0.1:8080` always added), `DSH_PASSWORDS_ENV_FILE` (default
`DSH_PASSWORDS_ENV_FILE`, generated with fresh secrets when the file does not exist), and
`DSH_PATCH` (one extra cordis layer). A home-level layer needs no variable at all — dsh reads
`$DSH_HOME/cordis.patch.yml` over every profile's layer, which is how lanes carry their per-lane
rows.

### Size and time

Measured 2026-09-06 on an Apple Silicon Mac (Docker Desktop 29.4.1, `aarch64` inside): image size
**4.34 GB**, up from the spike image's 2.41 GB. Where it goes: `/opt/dsh` 1.7 GB, `/opt/playwright`
1.2 GB (three engines), `/desk-home` 399 MB, `/usr/local/bin` 162 MB, the rest the runtime apt set.
Two optional agent backends inside dsh's own tree account for 595 MB of the first figure
(`@anthropic-ai/claude-agent-sdk-linux-arm64` 325 MB, `@openai/codex` 270 MB).

No single clean end-to-end build was timed. The measured step costs, with the base image and the
pnpm store already local, sum to about six minutes: `pnpm install` 38 s, `pnpm build:official`
103 s, `dsh-passwords` 12–24 s, `dsh-better-sidebar` 21 s, the deck 7 s, the runtime apt set 48 s,
Playwright `--with-deps` 100 s, `COPY /opt/dsh` 30 s, layer export 30–65 s.

### The Terminal tab is for the OWNER account, not for seats

**The side card's Terminal tab, and its `agent-terminals` / `agent-opens` channels, are reachable
for dsh-passwords ADMIN accounts only, exactly as in lanes; seats (customers) get bash through the
agent, not a terminal tab.** This is not a host-dsh deviation: the same `dsh-passwords` gates a
lane the same way — `isAdminOnlySidebarEndpoint` refuses every `/sidebar/*` WebSocket upgrade for
role `user` BEFORE any allowlist is consulted, so naming those paths in
`MCP_GATEWAY_WS_USER_ALLOWLIST` would be a grant that can never be exercised.

What the paths DO need is the owner-side list. The entrypoint writes
`MCP_GATEWAY_WS_ADMIN_ALLOWLIST=/sidebar/ws/terminal,/sidebar/ws/agent-terminals,/sidebar/ws/agent-opens`
into the gateway config it generates on first boot. Without it the gateway answers `HTTP 404` to
the upgrade and destroys the socket **with no log line anywhere**, and the browser shows only
close code `1006` and an endless reconnect loop (measured 06/09: 404 on all three paths, `101`
in the same session once the line was added).

An env file that already exists is never rewritten, so a cluster or lane created before 06/09
needs the line by hand:

```bash
docker exec <container> sh -c \
  'F=${DSH_PASSWORDS_ENV_FILE:-/desk-home/dsh-passwords.env}; grep -q "^MCP_GATEWAY_WS_ADMIN_ALLOWLIST=" "$F" \
   || echo "MCP_GATEWAY_WS_ADMIN_ALLOWLIST=/sidebar/ws/terminal,/sidebar/ws/agent-terminals,/sidebar/ws/agent-opens" >> "$F"'
docker restart <container>
```

### Tester login on this cluster

The owner account is **`wsprobe` / `Wsprobe!2026x`** (dev-only cluster, published on loopback
only). It was created on 06/09 through first-run setup, to get a real signed-in session for the
WebSocket measurements above.

✅ **The account survives a recreate as of 06/09** — it did not before, and this section is what
prompted the fix. The gateway's database (`platform.db`) and the env file holding the key that
decrypts it now share the named volume `dsh-passwords`, mounted at `/desk-home/dsh-passwords-data`;
see "The owner account SURVIVES a recreate now" above for the reset recipe. A container created
BEFORE that change still keeps its state in its own layer and loses it exactly once more, on the
next `up -d dsh`.

So the recipe, not just the password — first-run setup when there is no owner, and a direct
password reset when there is one (setup answers `409` from then on):

```bash
# the current setup key, always readable from the container
docker exec tracy-dsh sh -c 'grep "^SETUP_KEY=" "${DSH_PASSWORDS_ENV_FILE:-/desk-home/dsh-passwords.env}"'

# … then POST it to /gateway/setup with a username + password and the page's own csrf field.

# If an owner already exists and nobody has its password, reset the hash in place:
docker exec tracy-dsh sh -c 'cd /desk-home/profiles/native/node_modules/dsh-passwords &&
  DSH_PASSWORDS_ENV_FILE=${DSH_PASSWORDS_ENV_FILE:-/desk-home/dsh-passwords.env} node --input-type=module -e "
  const { loadConfig } = await import(\"./dist/config.js\")
  const { Database } = await import(\"./dist/db.js\")
  const { createFieldCrypto } = await import(\"./dist/encrypt.js\")
  const { createRequire } = await import(\"node:module\")
  const bcrypt = createRequire(\"/desk-home/profiles/native/node_modules/dsh-passwords/dist/auth.js\")(\"bcryptjs\")
  const c = loadConfig()
  const db = new Database(c.dbPath, createFieldCrypto(c.dbEncKey, c.setupKey))
  console.log(JSON.stringify(db.listUsers().map(u => ({ id: u.id, username: u.username }))))
  db.updatePasswordHash(1, bcrypt.hashSync(\"Wsprobe!2026x\", 10))"'
```

🔒 A gateway session is also required to reach `/sidebar/*` at all, so any measurement of the
Terminal tab or the fs routes starts here.

### Deviations from the lane image — what is NOT here, and who owns each gap

The criterion for this image is "a customer's features, unchanged". These are the differences a
`command -v` finds anyway, and each is a decision rather than an omission.

| Missing here | Was in the lane image for | Why it is not restored | Who owns what is left |
|---|---|---|---|
| the `playwright` npm PACKAGE (the browsers are still here) | agent shell scripts that drove Chromium | since Task 1 the agent's shell runs in the SITE container, which has no node at all — a package here would not be on the path that needs it | see the three skills below |
| `dsh` on PATH (the lane's wrapper) | `docker exec <lane> dsh …` recipes written for the lane image | there is no installed `@deepseek-ai/dsh` package to wrap: dsh runs from a source tree at `/opt/dsh`, and the entrypoint names its `bin.js` directly | nothing in this repo calls it; a recipe that does needs `node /opt/dsh/apps/cli/lib/bin.js` |
| `pnpm` on PATH | `scripts/tools/update-lane.sh` runs `pnpm install` INSIDE a lane to move its plugin tree | upgrading this image is a REBUILD, not an install into a running container — that is the point of a profile with no `dependencies` | `update-lane.sh` is a lane-era script and does not apply here |
| `/dsh-home` symlink, `ENV DESK_HOME` | provisioning that predated `/desk-home` | nothing in the repo reads either any more | — |
| `python3` | two enabled skills ship `.py` scripts | RESTORED in fix round 1, for parity — but see the note under it: the scripts run in the agent's shell, which is the site container's, so this is not what makes them work. UPDATE, Task 3b (2026-09-06): the site image (`dev/web.Dockerfile`) now carries `python3` too, so this caveat no longer holds — see the table below | Task 3's site image |

**Three enabled skills had no runtime when this was written, and that was a PLAN gap, not an image
bug.** The agent's shell is the site container's (`dev/web.Dockerfile`: `git ripgrep less jq wp
php` — no node, no python3, no playwright, no imagemagick), so a skill whose method is "run this
script" had nowhere to run it:

| Skill | What it needs | Decision |
|---|---|---|
| `tracy-brand-extract` (Tracy's own, `packages/design/tracy-design-skill`) | a rendered page: computed styles, font requests, screenshots at four widths | REWRITTEN in fix round 1. It no longer names `/usr/local/lib/node_modules/playwright/index.mjs`, a path that exists in no image any more; it opens with a `command -v node && require.resolve('playwright')` probe and branches. Without playwright it uses dsh's own `browser_read` tool — real markup, linked CSS, `@font-face`, `:root` variables — and the guidelines file must say which rows are DECLARED rather than measured. Blank beats invented; a colour table that was guessed looks exactly like one that was measured. |
| `web-clone` (vendor, `od-skill`) | node, for eight `.mjs` scripts; a real browser over CDP, with no npm install allowed | RESOLVED, Task 3c fix round 1 (2026-09-06). Task 3c first closed the browser half (`chromium` + `fonts-liberation` + `fonts-noto-color-emoji`, no Playwright npm package, per the skill's own rule; sandbox fixed with an `/etc/chromium.d/no-sandbox` drop-in — Debian's own `/usr/bin/chromium` wrapper mechanism for injecting `$CHROMIUM_FLAGS`, so the skill's `chromium <flags>` call needs no edit). But that pass's "verified" claim rested on `curl` against the CDP HTTP port after a manual shell launch — which proves Chromium starts, not that the skill's own code runs. A review caught the real bug: Debian trixie's `nodejs` apt package (20.19.2, what Task 3b had installed) has no global `WebSocket` without `--experimental-websocket`, and the skill's ONLY browser-control path (`scripts/lib/system-browser.mjs`) does `new WebSocket(url)` with no import and no flag — every `web-clone` script crashed with `ReferenceError: WebSocket is not defined` at its first CDP connection, invisible to a curl-only check. Fix round 1 replaces the apt `nodejs` with the official Node 22 LTS tarball (pinned version + SHA256 from nodejs.org's `SHASUMS256.txt`, verified before extraction), which has `WebSocket` as a global. Verified END-TO-END this time, not with curl: copied the skill's own `scripts/` into `wpdemo2-web-1`, ran its `system-browser.mjs` code path as `www-data` (`loadPlaywright()` → `launchChromium()` → `browser.newPage()` → `page.goto('http://127.0.0.1/wp-login.php')` → `page.evaluate(() => document.title)` → `Target.getTargets`) — real title (`"Log In ‹ wpdemo2 — WordPress"`) and a real target list came back, over the exact `new WebSocket(...)` call that used to throw. |
| `pptx-html-fidelity-audit` (vendor, `od-skill`) | python3, for two `.py` scripts, both a hard `import pptx` | RESOLVED, Task 3b (2026-09-06). `dev/web.Dockerfile` now installs `python3` + `python3-pip`, and `pip install python-pptx==1.0.2` (pinned in fix round 1 — previously unpinned) — the one third-party package both scripts require and the only pip package this task added anywhere, precisely because this skill's `import pptx` has no fallback path. |

The fix, once actually built (Task 3b, then 3c): put the interpreters AND the browser into the
SITE image, accepting that both multiply by every site on the host — the apt-get deltas measured
on `tracy/web-wordpress:test` (see `../../fleet/tracy-fleet-operation/web/README.md`: +140.3 MB
for Task 3b, +730.0 MB more for Task 3c's `chromium`) were judged worth it over the alternative
sketched here at the time, a dsh-side tool runner (a narrow, dsh-side execution surface for skill
scripts, which is its own new security boundary and design). The honest fallback for a
truly-unresolved skill remains a line in `tracy-enabled.txt`: a skill that cannot run is a skill
whose description costs every turn's context and returns nothing — but as of Task 3c fix round 1
neither `web-clone` nor `pptx-html-fidelity-audit` is in that position any more, confirmed by
actually running each skill's own code (not a curl/version smoke test) inside a live site
container.

### Seven things the build depends on, each of which failed once before it was understood

- **The context carries no `.git`.** `build:official` stamps the client artifacts with a commit,
  so the Dockerfile passes one through `DSH_CLIENT_COMMIT_HASH` — the seam
  `scripts/client-build-environment.ts` documents for non-Git build environments. `DSH_COMMIT` has
  no default and the build fails without it: a baked-in sha would go stale the moment the submodule
  pointer moved, and a stale stamp is invisible once the image exists.
- **`vendor/tracy/deepseek-harness/website` must stay in the context**, small as it is:
  `tsconfig.host.json` includes `website/**/*.ts` and the host type-check fails without it.
- **The host tree's build output must NOT.** A `lib/` or `.tsbuildinfo` copied from a different
  checkout makes `tsc -b` skip the work and tsdown then bundles the previous commit's types.
  `/.dockerignore` strips them; nothing under the submodule tracks them.
- **`npm install` in the profile prunes what it did not install.** The profile manifest declares
  no dependencies, so npm calls every directory in `node_modules/` extraneous. The one npm
  dependency (`schemastery`, for `@tracy/dsh-brand`) is therefore installed BEFORE the plugin
  copies, never after — after cost five plugins and reported only `removed 5 packages`.
- **`/opt/dsh` cannot be pruned.** `pnpm install --prod --frozen-lockfile` inside the image frees
  nothing worth naming and leaves dsh unable to start: `Cannot find package '@deepseek-ai/cordis'
  imported from /opt/dsh/packages/boot/app-boot/lib/index.js`. In this tree the `@deepseek-ai/*`
  siblings are DEV dependencies of each other, because they are peers of the published packages.
  A smaller image needs published packages, which is the registry dependency this one exists
  without.
- **A recursive `chown` doubles the image.** Chowning `/desk-home`, `/opt/tracy` and
  `/opt/playwright` after the copies added 2.9 GB to a 3.1 GB image — the rewritten files land in a
  new layer and the old one stays. `COPY --chown` costs nothing.
- **`/opt/dsh` must be writable by the runtime user anyway.** `dsh-passwords` rewrites two of dsh's
  own client bundles at every gateway start (`src/patch.ts`) so the settings client leaves `memory`
  mode for a non-loopback browser. Root-owned, it fails with EACCES on a `.bak-dshpw` write, prints
  `补丁同步失败（不影响网关启动）`, and boots anyway — a Settings page that silently stops saving.

The build asserts run in the RUNTIME stage and AFTER `USER`, both deliberately: an assert about a
tree that is then copied checks a copy nobody ships, and `--dump-config` WRITES (it rewrites the
profile's `cordis.yml` root and heals `profiles/node_modules`), so running it as root leaves
root-owned files in a home uid 33 owns — after which the container dies at boot on `EACCES … open
'/desk-home/profiles/native/cordis.yml'`. The dump does NOT resolve an inserted row's package, so a
separate step resolves all 21 copied packages from the profile directory the way the loader will.
The two `@deepseek-ai/*` rows the native bundle inserts are not in that list and cannot be: they
resolve through the closure mirror the LAUNCHER writes at boot, not the build.
