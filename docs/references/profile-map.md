---
description: A map of the running dsh surfaces — one tracy-dsh per machine (production, dev, the compose cluster on your own machine) and three bare dsh profiles on a dev machine — with ports, bundles, env files and entry paths.
sources:
  - tch/profiles
  - packages/bundle
  - deploy/compose.yml
  - apps/tracy-web/src/workspace/scope.js
  - apps/tracy-web/src/workspace/route.js
  - apps/tracy-web/src/sites/resolver.js
  - packages/fleet/tracy-fleet-operation/dsh/Dockerfile
  - packages/fleet/tracy-fleet-operation/dsh/profile/package.json
  - packages/fleet/tracy-fleet-operation/dsh/docker-proxy.haproxy.cfg
  - scripts/materialize-profile.mjs
  - run.sh
  - dev.sh
---

# Map of the running profiles

How the system runs in general: [`SYSTEM.md`](../../SYSTEM.md). This file goes deep on one thing: **which dsh you are
talking to**, which bundle it loads, which port it listens on, and which path leads in.

⚠ **Several things are called `web`, and they are NOT one thing.** `tch/profiles/web` is a **dsh
profile** on a dev machine; `web` in `<label>-web-1` is a site's **website container**; `tracy-web`
is the **front-door app**. The profile `tracy-dsh` runs on every server is called **`native`**. What decides
is **the bundle it loads**, not the name: read the "bundle" column before concluding.

---

## 1. One `tracy-dsh` per machine

Production, the dev machine and the compose cluster on your own machine have **the same shape**, built from
[`deploy/compose.yml`](../../deploy/compose.yml): one `tracy-dsh` container serving every site on the machine.

| | value |
|---|---|
| image | `tracy/dsh:<tag>`: built by CI, pushed to GHCR, pulled by the target machine; on your own machine it is `tracy/dsh:dev` |
| profile inside the container | `native` |
| bundle | `@tracy/dsh-native-bundle` (the only Tracy bundle), next to `dsh-base`, `dsh-web-app`, `dsh-better-sidebar`, `dsh-subscriptions` — [`dsh/profile/package.json`](../../packages/fleet/tracy-fleet-operation/dsh/profile/package.json) |
| sites it sees | every site of the machine, at `/site/<label>` (`TRACY_SITES_ROOT`) |
| state | `/desk-home` (`TRACY_DSH_HOME`): the seat-door ledger, model keys |
| port | the machine's `127.0.0.1:51700` → **8080 inside the container** |

Which machine runs which version: ask the container, not a file —
`docker exec tracy-dsh sh -c 'cat /desk-home/profiles/native/package.json'`, or
`printenv TRACY_SOURCE_COMMIT`.

🔒 **TWO ports, and they are not one.** dsh listens on **51700 inside** the container and that port is **never
published**. What is published is **8080 = `dsh-passwords`** (the seat door): every call goes through
it, has its seat session checked, and only then reaches dsh. On the machine, `127.0.0.1:51700` maps to the container's **8080**
— the same number 51700, two different things, the easiest misreading in this file. Publishing the container's
51700 opens a path around the seat door.

🔒 **dsh does NOT mount `/var/run/docker.sock`.** It calls `docker-proxy`, an HAProxy running exactly the rule file
[`docker-proxy.haproxy.cfg`](../../packages/fleet/tracy-fleet-operation/dsh/docker-proxy.haproxy.cfg):
it only lets `docker exec` requests through, and only when the container name matches `*-web-1`. Because the rule trusts the
name, **never name a non-site container `*-web-1`.**

**A machine holding only demos runs no dsh**: it only runs `tracy-host` to hold quickstart demo sites
(`DEMO_HOSTS`); `tracy-web` treats a machine without `HOST_<name>_DSH_ORIGIN` as one with no dsh door.
The only such machine there ever was, `tracy-fleet-01`, was dropped on 21/10/2026 (dev demos moved back to the dev machine).
Adding such a machine: [`adding-a-demo-machine.md`](adding-a-demo-machine.md).

Addresses, SSH and logs of each machine: [`ha-tang-bi-mat-deploy.md`](ha-tang-bi-mat-deploy.md),
[`may-dev.md`](may-dev.md). Building the cluster on your own machine: [`running-tracy-locally.md`](running-tracy-locally.md).

### Entry paths from the browser

```
cowork.tracy.ai / cowork.tracy.site / tracy.test:51710
  └── tracy-web
        ├── a customer site's hostname     → the real site page (bar/)
        ├── /login /auth/* /api/* /ops /docs … → tracy-web answers itself
        └── every other path → the dsh of the machine holding that site (workspace/)
              ├── /<siteKey>/…  one site's workspace — needs a seat on that site
              ├── /new/…        the viewer's own new-site workspace, on the default machine
              └── /…            root: finds the site from the Referer or the `tracy_site` cookie; without one
                                sends to the sign-in page, the site a guest was invited to, the first site
                                the viewer has a seat on, or /new/
```

Those three scopes are [`workspace/scope.js`](../../apps/tracy-web/src/workspace/scope.js); each scope's seat session has its own
cookie (`workspace/route.js`). The `tracy_site` cookie is **a pointer, not a
permit**: the seat is asked again for exactly that site on every request.

🔒 **A site's machine is read from the LEDGER, never guessed.** `hostOf` in
[`sites/resolver.js`](../../apps/tracy-web/src/sites/resolver.js) reads the `site.host` column in Postgres;
a site the ledger does not know returns 501, never falling back to the default machine (a wrong guess proxies people into
someone else's copy).

---

## 2. The dev machine — three bare dsh profiles

A surface **with no container and no `tracy-web` in front**, used for the plugin-UI editing loop:
dsh runs directly on the machine, the plugin tree linked from the workspace. Started with `./dev.sh` (default
`web native`) or `./run.sh <profile>`.

| | `web` | `desktop` | `native` |
|---|---|---|---|
| bundle | `@tracy/dsh-cowork-bundle` | `@tracy/dsh-cowork-bundle` | `@tracy/dsh-native-bundle` + `dsh-better-sidebar` (as on servers) |
| dsh listens on | **51710** | 51720 | **51730** |
| password door | **51711** | 51721 | 51731 |
| env file | `.env` (root) | `.env.desktop` | `.env.native` |
| other | — | `patchReload: live` | the Electron app (`packages/desktop/tracy-desktop`) opens exactly this profile |

⚠ **Port clash with the compose cluster.** The cluster in §1 publishes `tracy-web` on **51710** and Postgres on **51730**:
exactly the ports of the bare `web` and `native` profiles. Run one or the other, or change `WEB_PORT` /
`POSTGRES_PORT` in `deploy/.env`.

🔒 **Profiles install NOTHING.** All three `tch/profiles/*/package.json` have `"dependencies": {}` (only
`native` still has one npmjs package for the dev overlay). Every package a bundle lists is
**symlinked** from the workspace by [`scripts/materialize-profile.mjs`](../../scripts/materialize-profile.mjs),
the same contract the image's Dockerfile fulfils with `COPY`. `dev.sh`/`run.sh` run it every
time; skip it and **half the interface disappears without any error**.

⚠ **`web` is the exception to the "one env file per profile" rule:** it reads `.env` at the root
(`MCP_GATEWAY_PORT=51711`). Two profiles sharing one env file make two password doors compete for one
port: the second dies with `EADDRINUSE` while its dsh keeps serving, so the browser gets 401 and it **looks
exactly like it is working**. `run.sh` warns, with the command to generate the missing file, when it meets that case.

Bootstrap (submodule → `pnpm dsh:build` → `pnpm install`) and the reason for the order:
[`ha-tang-bi-mat-deploy.md`](ha-tang-bi-mat-deploy.md).

---

## 3. How to read this map while debugging

1. **Ask "which surface" before asking "which bug".** Bare profiles, the compose cluster and servers load configuration
   differently; the same symptom on two surfaces is usually two causes.
2. **Read the running version number INSIDE the container**, not in `packages/`: what is in the repo is *what will be
   built*, what is in the container is *what is running*.
3. **A bare profile proves nothing about servers.** At the `web` profile's `127.0.0.1:51710` there is no
   `tracy-web`, no root doors (`/login`, `/api/sites`), no site containers. The compose cluster in
   §1 has them all: the same seat door, the same `docker-proxy`, the same `docker exec` path.
4. **Measure along the path users actually take.** See [ADR 0002](../adr/0002-removed-upstream-assumptions.md)
   §Consequences: three times in one session, a self-written probe reported green while the browser was red.
5. **A healthy container nobody calls looks exactly like a container that has been fixed.** Before
   diagnosing: ask the ledger (`select host from site where site_key = …`) which machine the site is on.
