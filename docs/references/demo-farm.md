---
description: The demo farm on a host — switching it on, folding the existing PHP template demos one by one, checking each, rolling back with unfold, and measuring the RAM it saves.
sources:
  - packages/fleet/tracy-fleet-operation/scripts/lib/demo-farm.sh
  - packages/fleet/tracy-fleet-operation/scripts/lib/site-runtime.sh
  - packages/fleet/tracy-fleet-operation/scripts/provision/fold.sh
  - packages/fleet/tracy-fleet-operation/scripts/provision/unfold.sh
  - packages/fleet/tracy-fleet-operation/scripts/provision/farm-common.sh
  - packages/fleet/tracy-fleet-operation/scripts/provision/farm-refresh.sh
  - packages/fleet/tracy-fleet-operation/scripts/provision/farm-forwarders.sh
  - packages/fleet/tracy-fleet-operation/scripts/provision/farm-switch.sh
  - packages/fleet/tracy-fleet-operation/scripts/provision/farm-release.sh
  - packages/fleet/tracy-fleet-operation/web/DEMOS_IMAGE
  - apps/tracy-host/src/provision.js
  - deploy/compose.yml
  - deploy/scripts/check-server.sh
---

# The demo farm

A Joomla or WordPress **template demo** can run in the host's demo farm instead of its own pair of
containers: one farm web (`tracy-demos-web-a` / `-b`, one serves; Apache event + PHP-FPM 8.4, one vhost and one on-demand pool per
demo) and one `tracy-demos-db` (MariaDB, one schema and one user per demo). The demo keeps its name,
its address and its port: its `<label>-web-1` becomes a small TCP forwarder to the farm. Customer
sites and EmDash demos never fold. Why and the shape: [`demo-farm.sh`](../../packages/fleet/tracy-fleet-operation/scripts/lib/demo-farm.sh).

A folded demo is marked by `<private root>/<label>/runtime` holding `farm`. Every door of Tracy reads
that marker: install, update, remove, backup and restore, frame policy, go-live (`live`, as the demo
flow asks), content identity, site settings, the CMS log, the design-system slot and look CSS work as
before. Scripts that change a site's own runtime (`set-php.sh`, `set-web-image.sh`,
`apply-site-limits.sh --label`, the host-dsh migrations, …), a go-live `draft` or `drop-domain`, and
an agent's shell command on a folded demo are **refused, naming `unfold`**. The farm is not fenced
by `TRACY-FLEET-EGRESS`: every template demo is published, i.e. live.

Isolation between folded demos, in short: each demo's PHP pool has its own `open_basedir`, temp
folder and environment, and starts no program and makes no link (`disable_functions`); Apache runs
as its own user `farmhttp`, the only one that may open the pools' sockets (0600) — a demo's PHP
cannot talk FastCGI to another demo's pool; each demo's database user is granted on its own schema
only.

## Switching it on, on one host

1. Deploy a tracy-host that carries the farm (this branch or later).
2. The farm image: the first fold builds it on its own (`web/build.sh demos`, the tag in
   [`web/DEMOS_IMAGE`](../../packages/fleet/tracy-fleet-operation/web/DEMOS_IMAGE)). To have it ready
   beforehand: `docker exec tracy-tracy-host-1 bash /opt/tracy-fleet/web/build.sh demos`, or dispatch
   `build-app-images` with `build_web_images=<host>` (it builds the farm image too).
3. Set `TRACY_DEMO_FARM=1` in the host's deploy `.env` and redeploy tracy-host. From then on every
   Joomla/WordPress demo install ends by folding the demo. A fold that fails leaves the demo on its own
   containers and says why in the job (`fold: {folded: false, reason}`); the install is still done.
4. `bash deploy/scripts/check-server.sh` reports the farm (step 7c); server-status-alert names a farm
   container that is down, unhealthy or gone.

## Folding the demos already on the host, one by one

As root on the host, run the scripts inside the tracy-host container: its `/opt/tracy-fleet` is the
copy installs use and the only one with `web/` (the farm image build needs `web/build.sh` and
`demos.Dockerfile`). The copy synced to the host's own `/opt/tracy-fleet` by `deploy-host-dsh` has no
`web/`, so a fold run there cannot build the farm image.

```bash
docker exec tracy-tracy-host-1 bash /opt/tracy-fleet/provision/fold.sh <label>  # one demo; refuses customer sites and EmDash
cat /srv/tracy/<label>/runtime                          # farm
curl -sI -H 'X-Forwarded-Host: <label>.<zone>' http://127.0.0.1:<HOST_PORT>/ | head -3
```

`fold.sh` records `/` and two linked pages before it changes anything (when `/` redirects to a page on the demo's own host, as a multilingual Joomla does, it records `/` as that redirect, the landing page — followed at most 3 hops, it must be a 200 with a title — and two links from the landing page), checks the farm answers them
the same way (code, redirect, `<title>`), switches, checks again, and only then writes the marker.
Right before the database copy it stops the demo's own web container (the database keeps
running), so no write lands after the dump; the demo is without a server until the forwarder takes
its port, and `fold.sh` prints how long (5 s for a fresh Joomla demo in the end-to-end test). A
webroot holding a symlink that leads out of it is refused before anything changes. Any failure
before the marker starts the demo's container again and puts the demo back exactly as it was. Run it again after a failure: it
finishes or says there is nothing to do. One demo at a time; check the demo's page in a browser
before the next.

## Folding or unfolding one demo does not interrupt the others

A member added or removed, a new `DEMOS_IMAGE` tag, new limits: the farm web's mounts or image change, so
the web has to be **replaced**. It is replaced blue/green (`farm_switch` in `farm-common.sh`), by `fold.sh`,
`unfold.sh`, `farm-release.sh`, `farm-refresh.sh`, and explicitly by `farm-switch.sh`:

1. The web is two slots, `tracy-demos-web-a` and `-b`, one service each, **both** with the network alias
   `tracy-demos-web` on `tracy-demos-front`; the one that serves is named in `<private root>/_demos/.active-web`
   (every `docker exec` into the farm reads it: `tracy_farm_web`, tracy-host's `site-exec.js`). The farm
   database is one service no switch touches. A host that folded before slots has one container named exactly
   `tracy-demos-web`; the first switch replaces it by slot `a`.
2. The next slot starts **beside** the serving one with the new compose and is waited for until healthy; then
   its ready marker (`/run/tracy-demos-ready/ok`) is written. Apache's port-8080 vhost answers `/tracy-ready`
   200 only while the marker exists.
3. `.active-web` names the new slot. Then the forwarders get `tracy_farm_up_wait` (6 s) to **start using it**
   (Docker's DNS, then `rise` passing checks) — the old slot is withdrawn only after that. (Withdrawing it
   at once left a window with no server at all: measured at 71 ms, enough for every connection in it to be
   closed; it showed as the failures of an unfold.)
4. The old slot's marker is removed, the switcher waits `tracy_farm_down_wait` (5 s: `inter 500ms × fall 2`
   plus the check timeout and a margin), waits until no demo connection is left in it (`/proc/net/tcp`, up to
   40 s), then stops it (entrypoint: Apache graceful-stop, then php-fpm graceful quit; the stop signal is
   `SIGTERM`, which the entrypoint traps, with `INT`/`QUIT`) and removes it. This is `farm_retire`.
5. If the new slot never gets healthy or ready it is removed and the old one is left exactly as it was
   (marker intact); the script fails loudly.
6. A crash or reboot half-way: the next apply runs `farm_web_settle`, which **retires** every web container
   that is not the serving one through the same `farm_retire` path (readiness withdrawn, forwarders given
   time, requests waited for, graceful stop, removed) — it never just removes one, because a leftover may be
   ready and serving (a switch cut after the new slot was marked ready, or after `.active-web` changed).
7. Monitoring (`check-server.sh`, `server-status-alert.sh`): running slots that are all **unready** are an
   alert — no current-config forwarder has a backend although FPM answers.

**What is zero-failure, and what is not.** A forwarder on the **current config** (`tracy_farm_forward_cfg`:
`server-template` over `tracy-demos-web`, an HTTP check of `/tracy-ready`) sends a *new* connection only to
a slot that answers ready, and a request already running keeps its connection. Nothing is opened to a
listener that is about to close, which is what a TCP forwarder cannot replay. Measured in the e2e through a
current-config forwarder — eight raw-TCP clients on a static page (new connections, empty replies counted),
curl clients on PHP pages, a 25 s PHP request always in flight — over fold, unfold, re-fold, an image-tag change
and `farm-switch.sh`, three rounds: **0 failed in 549 939 requests/connections across 10 phases**, and the 25 s
request completes with 200 across each. The probe is shown able to fail: a farm web killed under load turns
it red (6 427 of 14 491). Throughput varies with the machine's load; a failure, not a delay, is what is counted.
A switch also waits for the old slot to go idle (up to 40 s), which on a busy host with old-config
forwarders (below) is all of it.

A forwarder on the **old config** (every forwarder created before web slots: one server, follows DNS) keeps
working through a switch exactly as it always did: it sticks to the address it had, and when that container
goes it re-resolves and may fail the requests of a ~1 s gap. The e2e runs one beside the new one and reports
its count (not asserted). Cloudflared does not retry a failed dial, so for such a demo a switch can show a
502. A forwarder gets the new config **at its own next re-create** — `fold.sh`/`unfold.sh` of that demo, when
it is down anyway — with no extra step.

**`farm-forwarders.sh` is the opt-in shortcut** for moving every old-config forwarder at once, and it is
not free: a forwarder reads its config once, so each one is *restarted*, a gap of about 0.3 s in which that
demo's published port refuses connections (measured: 0.28 s) — a visible 502 for a visitor in it. Without
`--apply` it only lists the forwarders on an older config. Fold, unfold, the updater and deploy never run it.
Use it only when a sub-second gap per demo, one at a time, is worth having every demo on the new config.

**Moving a host that still runs the pre-slot farm (`…-r2`, every forwarder on the old config).** Order matters:
each demo gets exactly ONE short gap if the forwarders move first, and several if the farm moves first.

1. Deploy. The deploy does **not** build the new farm image (it warns "not built on this host") and does **not** move the farm. `farm-switch.sh` — and any fold, unfold or refresh — builds a missing farm image itself before it needs it (minutes), or dispatch `build-app-images` with `build_web_images=<host>` beforehand.
2. `docker exec tracy-tracy-host-1 bash /opt/tracy-fleet/provision/farm-forwarders.sh` lists the forwarders
   on an older config; add `--apply` to restart them, one at a time, each waited for. A current-config
   forwarder works in front of the pre-slot farm too (its health check accepts that farm's `403` on
   `/tracy-ready`), so nothing changes for visitors but the restart itself. **Visitor impact: one gap of
   about 0.3 s per demo** (its published port refuses connections while its forwarder restarts; cloudflared
   does not retry, so a visitor whose request lands in that window sees a 502). Do it at a quiet hour.
3. `docker exec tracy-tracy-host-1 bash /opt/tracy-fleet/provision/farm-switch.sh` moves the farm. The
   pre-slot container is taken out of every (now current-config) forwarder by a `410` on `/tracy-ready`,
   waited for until idle, stopped and removed; slot `a` serves. **Visitor impact: none.**
4. From then on every switch drains, and a demo folded or unfolded later gets a current-config forwarder
   from its own fold/unfold, which it is down for anyway.

The other order (farm first) is not recommended: every old-config forwarder keeps sending new connections
to the pre-slot container, which is stopped after at most `TRACY_FARM_SWITCH_DRAIN` (40 s) whether
connections remain or not, so each of the 41 demos has a reset/502 window until its forwarder re-resolves
(a few seconds), and a second gap when its forwarder is restarted afterwards.

## Rolling back

```bash
docker exec tracy-tracy-host-1 bash /opt/tracy-fleet/provision/unfold.sh <label>  # the demo back on <label>-web-1 + <label>-db-1
```

It stops the demo's forwarder (the farm and its other demos keep serving), copies the demo's schema
— tables, routines, triggers, events — back into its kept `<label>_db` volume, points the CMS config back,
checks the same pages, then the farm lets go of it. To stop new installs from folding: set
`TRACY_DEMO_FARM=0` (or remove it) and redeploy tracy-host. Unfold every folded demo before removing
the farm (`docker ps --filter label=tracy.runtime=farm` lists them); never `compose down -v` the farm
while a demo is folded — its database volume holds every folded demo.

## Measuring the RAM

`docker stats` is wrong on a rootless or cgroup-less docker (it reports the daemon's cgroup). Sum the
PSS of each container's processes instead, before folding and after, with the same pages opened:

```bash
for c in tracy-demos-web-a tracy-demos-web-b tracy-demos-web tracy-demos-db $(docker ps --filter label=tracy.runtime=farm --format '{{.Names}}'); do
  docker exec --privileged -u 0 "$c" sh -c 'cat /proc/[0-9]*/smaps_rollup 2>/dev/null' \
    | awk -v n="$c" '/^Pss:/{p+=$2} /^Pss_Anon:/{a+=$2} END{printf "%s %.1f MiB (anon %.1f)\n", n, p/1024, a/1024}'
done
```

The per-site pair of a demo is the baseline (about 120 MiB on the 13/11/2026 hosts); in the farm each
further demo costs its forwarder (~4 MiB) plus its pages in the shared buffer pool and OPcache, and
PHP workers only while someone is looking (pools are on-demand, 20 s idle). The end-to-end test
`packages/fleet/tracy-fleet-operation/test/e2e/demo-farm/run.sh` prints the same table for two demos.
