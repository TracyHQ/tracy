---
description: Adding another machine to hold quickstart demos (DEMO_HOSTS) — the four things a new machine must have, and the four failures measured while building tracy-fleet-01 on 23/09/2026.
sources:
  - apps/tracy-web/src/config.js
  - apps/tracy-web/src/ops/demos.js
  - apps/tracy-web/src/lib/demo-sites.js
  - apps/tracy-host/src/app.js
  - packages/fleet/tracy-fleet-operation/scripts/provision/bootstrap.sh
  - packages/fleet/tracy-fleet-operation/scripts/provision/ingress_api.py
  - packages/fleet/tracy-fleet-operation/scripts/provision/teardown.sh
  - deploy/.env.example
---

# Adding a demo machine

Since 23/09/2026 a demo lives on **the machine someone chooses**, not on a fixed machine: `DEMO_HOSTS` lists
every allowed machine, the Quickstarts and Demos screens draw a server picker on each row, and moving machines is one
click (remove on the old machine, build on the new one, **the address stays the same**).

This file is the list of things a new machine must have. It was written from the real build of `tracy-fleet-01` (a DigitalOcean droplet) for the dev surface, where **four** of those things broke — and all four broke late, after the
provision run had already assigned a port and created the site directory.

## What a new machine must have

| Thing | Why | How it breaks if missing |
|---|---|---|
| `tracy-host` at the same version as the tracy-web calling it | the `/_host/address` door only accepts `remove` from the 23/09 version on | moving a demo elsewhere leaves the DNS record behind; the address returns 404 on the new machine |
| a **deploy runner** carrying the machine's own label, and a `deploy-<machine>` job in `build-app-images.yml` | keeps "the same version" in the row above by machine, not by memory: the job runs with the same tag as `deploy-dev`, `services: tracy-host` | the machine silently falls behind — on 23/09 fleet-01 ran `app-ae39d1b2ecb1` while contabo2 ran `app-47b1fd4eaf1c`, and the provision fix never reached demos built there |
| `SITE_DOMAIN` = the zone of **the deployment calling it** | `teardown.sh` composes `LABEL.$SITE_DOMAIN` to remove ingress | it removes a domain that does not exist, and the real rule stays |
| the docker network `tracy_tracy` | every site compose declares it as an EXTERNAL network | `network tracy_tracy declared as external, but could not be found` |
| the iptables chain `TRACY-FLEET-EGRESS` | `provision.sh` attaches the site's network to the chain | `chain TRACY-FLEET-EGRESS ... is incompatible` or `No chain by that name` |
| a Cloudflare token **able to write DNS for that zone** | a demo on a second machine needs its own CNAME record | `/address` returns 500; the job finishes but `live` stays `false` forever |

The deploy runner is declared in the repo [`TracyHQ/tracy-runners`](https://github.com/TracyHQ/tracy-runners)
(`hosts.tsv`, column `socket` = `deploy` → `compose.deploy.yml`: root, mounts `/opt/tracy-fleet` +
`/etc/tracy`, no postgres), then `RUNNER_TOKEN=… bin/deploy <name>`. A demo-only machine **is not signed
in to ghcr.io**: the job signs in itself with `GITHUB_TOKEN` and signs out when done, so running
`deploy-tracy-stack.sh` by hand on that machine stops at `pull … denied` — before changing anything.

The middle three rows are `bootstrap.sh`'s job (run once, idempotent) — a machine that has never run it
runs it first, even a demo-only machine. The 23/09 version of bootstrap also creates `tracy_tracy`.

🔒 **THE CLOUDFLARE TOKEN FAILS IN THE HARDEST-TO-GUESS WAY.** `tracy-fleet-01`'s token could **read** both
zones and **edit** the tunnel configuration, so every read test was green; it just could not write DNS records
of `tracy.site`. The symptom is `ADDRESS_FAILED` (HTTP 500) on the poll, while the site has finished building
and its container is running. The right test is **a real write**: create a TXT record and delete it right away.

## Declaring it on the tracy-web side

```bash
HOSTS=dev,fleet01                                  # the new machine's name added at the end
HOST_fleet01_ORIGIN=https://demo-host.tracy.ai     # that machine's tracy-host address, WITHOUT /_host
HOST_fleet01_SECRET=...                            # exactly the HOST_SECRET that machine holds
DEMO_HOSTS=dev=dev-host,fleet01=tracy-fleet-01     # name=text shown on screen; the first is the default
```

A demo-only machine **may leave empty** `HOST_fleet01_DSH_ORIGIN` and `SEAT_fleet01_SECRET` (both or
neither): nobody holds a seat on a demo, so there is no seat door to sign. A name outside `HOSTS`, or a
`DEMO_HOST` not in `DEMO_HOSTS`, is refused right at boot.

⚠ **ONE MACHINE MAY BE CONTROLLED BY ONLY ONE DEPLOYMENT.** Two tracy-webs installing onto one machine will fight over
a label (the same `ja-kinetic-joomla`), and the machine's `SITE_DOMAIN` can only be right for one zone. When moving
a machine to another deployment, remove the `DEMO_HOST`/`DEMO_HOSTS` pointing at it in the old deployment in the same go.

## Acceptance, in exactly the order measured

```bash
# 1. is the signed channel alive (from the machine running tracy-web)
#    200 = it arrived; a demo-only machine also returns "cannot read /etc/tracy/host-dsh.env", which is expected
curl -s -X POST https://<host>/_host/dsh-versions -H 'content-type: application/json' \
  -H "x-host-timestamp: $TS" -H "x-host-nonce: $N" -H "x-host-signature: $SIG" -d '{}'

# 2. install a demo NOT yet present onto the new machine, then poll until live
curl -X POST https://<tracy>/api/ops/demos/install -d '{"tag":"...","host":"fleet01"}'

# 3. open the demo address: 200
# 4. move it back to the old machine: the answer is 202 WITHOUT `warning`, and afterwards
#    - the address is still 200 (from the old machine)
#    - the new machine has no container of that demo left
#    - the zone has no separate DNS record for that name left
```

The 23/09 measurement on `ja-donate-joomla.tracy.site`: installed on fleet-01 → 200; moved back to the dev host → 200,
containers clean, the DNS record and tunnel rule both gone; moved to fleet-01 again → 200.
