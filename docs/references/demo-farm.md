---
description: The demo farm on a host — switching it on, folding the existing PHP template demos one by one, checking each, rolling back with unfold, and measuring the RAM it saves.
sources:
  - packages/fleet/tracy-fleet-operation/scripts/lib/demo-farm.sh
  - packages/fleet/tracy-fleet-operation/scripts/lib/site-runtime.sh
  - packages/fleet/tracy-fleet-operation/scripts/provision/fold.sh
  - packages/fleet/tracy-fleet-operation/scripts/provision/unfold.sh
  - packages/fleet/tracy-fleet-operation/scripts/provision/farm-common.sh
  - packages/fleet/tracy-fleet-operation/scripts/provision/farm-refresh.sh
  - packages/fleet/tracy-fleet-operation/scripts/provision/farm-release.sh
  - packages/fleet/tracy-fleet-operation/web/DEMOS_IMAGE
  - apps/tracy-host/src/provision.js
  - deploy/compose.yml
  - deploy/scripts/check-server.sh
---

# The demo farm

A Joomla or WordPress **template demo** can run in the host's demo farm instead of its own pair of
containers: one `tracy-demos-web` (Apache event + PHP-FPM 8.4, one vhost and one on-demand pool per
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
for c in tracy-demos-web tracy-demos-db $(docker ps --filter label=tracy.runtime=farm --format '{{.Names}}'); do
  docker exec --privileged -u 0 "$c" sh -c 'cat /proc/[0-9]*/smaps_rollup 2>/dev/null' \
    | awk -v n="$c" '/^Pss:/{p+=$2} /^Pss_Anon:/{a+=$2} END{printf "%s %.1f MiB (anon %.1f)\n", n, p/1024, a/1024}'
done
```

The per-site pair of a demo is the baseline (about 120 MiB on the 13/11/2026 hosts); in the farm each
further demo costs its forwarder (~4 MiB) plus its pages in the shared buffer pool and OPcache, and
PHP workers only while someone is looking (pools are on-demand, 20 s idle). The end-to-end test
`packages/fleet/tracy-fleet-operation/test/e2e/demo-farm/run.sh` prints the same table for two demos.
