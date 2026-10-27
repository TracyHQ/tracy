# 0014 — One dsh per host, and the agent's commands run in the site's web container

> ⚠ **THIS ADR HAS BEEN RENUMBERED TWICE: `0010` → `0012` (07/09/2026) → `0014` (08/09/2026).** Both
> times for the same reason: it was born on the `develop` branch while `main` published the next number first.
> The first time, `main` published `0010-design-inspiration` and `0011-public-design-inspiration-page`.
> The second time, `main` published `0012-design-systems-served-from-one-place` at 07/09 21:58 and `0013-community-brand-store`
> the same day — before the 08/09 merge brought `develop`'s `0012` into the same folder.
>
> Rule §5 of [`README.md`](README.md) says the next number is the largest number in the folder plus one, and
> `main` is the official branch that has shipped, so the later arrival renumbers. The reverse is possible, but much more expensive:
> it would mean renumbering an ADR that is already on `main` and has already reached customers.
>
> A comment or old document that says "ADR 0010" or "ADR 0012" while talking about **one dsh per host**
> means this file. No place in the tree still holds those two spellings — all were swept and fixed in the same
> merge.

- Status: accepted (binding) — but **the cleanup that follows it (Plan 4, branch
  `feat/one-dsh-cleanup`) has not reached `main`**; the merge condition is at the end of this block
- Date: 2026-09-06
- Decided by: Lucas + Lee
- Related: [`0001`](0001-seat-door-and-enforcement-boundary.md) (the seat ledger says who gets what, the runtime only
  enforces — **unchanged**) · [`0004`](0004-dsh-is-the-shell.md) (dsh is the shell — **kept**; but its shape
  (a) "sidecar per site" no longer applies) · [`0008`](0008-mode-config-ships-in-the-image.md)
  (the release path to customers is the image — **kept**, and stronger than before) ·
  [`0009`](0009-one-dsh-version-published-by-tracy.md) (Tracy publishes 248 packages itself to a private
  registry — **this ADR ends it**) · `tracy-infra` ADR 0007 §choosing a version — dies with 0009, see
  [`README.md`](README.md) §Inheritance
- Enforced in: `packages/fleet/tracy-fleet-operation/dsh/` (`Dockerfile`, `entrypoint.sh`,
  `host-dsh.yml`, `docker-proxy.haproxy.cfg`, `host-dsh-init.sh`, `profile/cordis.patch.yml`,
  `HOST-DSH.md`) · `packages/tools/tracy-subprocess-docker/` (`src/route.mjs`, `index.js`) ·
  `packages/tools/tracy-sandbox-docker/` · `packages/fleet/tracy-fleet-operation/scripts/provision/`
  (`attach-site.sh`, `render-compose.sh`, `migrate-site-to-host-dsh.sh`) ·
  `workers/shared/host-dsh.js` · `workers/cowork-web/src/worker.js` ·
  `workers/seat-registry/src/index.js` · `pnpm-workspace.yaml` · `vendor/tracy/deepseek-harness`
- Implementation plan: [`tasks/plan-fleet-mot-dsh.md`](../../tasks/plan-fleet-mot-dsh.md) ·
  [`tasks/plan-don-sau-mot-dsh.md`](../../tasks/plan-don-sau-mot-dsh.md)
- 🔒 **Merge condition for branch `feat/one-dsh-cleanup`:** merge only after Plan 3 has run on the fleet
  for **≥ 7 consecutive days, with no rollback**. In this repo a merge **is** a deploy (`CLAUDE.md` §5), and that
  deploy carries a list of infrastructure deletions that cannot be rolled back (16 `*-dsh` containers, 16
  `*-agent.tracy.ai` hostnames, KV `seat-secret:*`/`sitelane:*`/`lane:*`, Worker `tracy-npm-registry`). The
  acceptance date and the end-of-observation date: **waiting on Lee** — fill them into
  [`tasks/plan-don-sau-mot-dsh.md`](../../tasks/plan-don-sau-mot-dsh.md) §Task 0 before pressing the button.

## Context

Since [`0004`](0004-dsh-is-the-shell.md), each site has **its own dsh container** — a lane. That shape
was chosen deliberately (the table of four shapes in 0004), and it was right while the fleet could still be counted on
one hand. What it cannot bear is multiplication.

**Measurements, not impressions** (01–02/09, three lanes on two hosts):

| Measured | Number |
|---|---|
| RAM of one idle lane | ~270 MB (measured on other days: 220–290 MB) |
| Disk of one lane | ~415 MB, of which **412 MB is the plugin tree** |
| Plugin tree of the three lanes | **the same hash `1815629d6c3a6eab`** — identical copies |
| Lanes that fit on a 2.3 GB droplet | **four**; seven do not |
| For 100 sites | 27 GB RAM if all are on, 41 GB disk |

Take a lane apart and it has five parts, and **the first four are identical in every lane**. Exactly three things make
a lane the lane *of site X*: the mount it sees, the seat key the Worker can sign, and the hostname the Worker
calls. Everything else is a copy of the same program — plus, for each site, a hostname,
a DNS record, an ingress rule and an Access app.

Lee asked that question directly on 02/09, and it had no answer until today
([`tasks/kiem-ke-tinh-nang-va-danh-gia-viet-lai.md`](../../tasks/kiem-ke-tinh-nang-va-danh-gia-viet-lai.md)
§4):

> *"1000 sites means seeding 1000 times?"*

The second half of the context is **the recurring cost of the release path**. `0009` settled that Tracy publishes
the whole fork tree (248 packages) itself to a private registry, because upstream only tagged `0.1.3-alpha.1` without
publishing any package. That decision was right for the question it answered — but it turned every dsh base upgrade
into: bump 248 packages → publish → build image → reseed every lane. Multiplied by "1000 sites", the last part is
the part with no bottom.

On 05–06/09 both parts were measured again at the same time, and both pointed to the same place: **what must be shared
is not the copied program tree, but the process that runs it** — as long as the boundary between sites
does not go with it.

## Decision

1. **One dsh per fleet host.** The `tracy-dsh` container (compose `dsh/host-dsh.yml`) serves
   **every** site on that host; it sees each site at `/site/<label>` via a bind mount. The guest lane and the welcome
   lane are no longer two separate containers — they become **two roles** in the default host's dsh
   (`FLEET_NEW_SITE_HOST`). There are **two** hostnames left (one `<host>-agent` per host) instead of one per
   site.

2. **The agent's commands run in THAT SITE'S OWN web container**, via `docker exec`. The container is
   derived from **the session's cwd**, never from argv or env. dsh does not mount
   `/var/run/docker.sock`: it calls `tcp://docker-proxy:2375`, a `haproxy` running exactly one rules file
   committed in the repo (`dsh/docker-proxy.haproxy.cfg`) that lets through the **seven** requests that `docker exec` makes,
   and only when the container name matches `^[a-z0-9][a-z0-9-]*-web-1$`. Everything else gets `403`.

3. **Files go through the MOUNT, not through exec — so the file fence is a path table, and it
   applies to EVERY tool.** dsh's file tools (`read` `write` `edit` `read_image` `glob` `grep`
   `str_replace_editor`) run **in the dsh process**, where every site is already available at `/site` along with the host's own
   `/desk-home`. `dsh-fs-sandbox` only fences the two **write** calls — its own header
   says "reads pass through untouched: every mode permits reading". So the
   `tools/pre-execute` guard of `@tracy/dsh-subprocess-docker` (`FS_TOOL_ARGS` in `src/route.mjs`)
   checks **every path argument of every tool**, after resolving symlinks, and **even under
   `danger-full-access`** — that mode does not go through `confine()`, so this is its only fence.

4. **Seat sessions per (email, site) pair.** The seat door builds exactly one dsh account per (person,
   site): a person with seats on three sites has three sessions, and a passing visitor of one site never
   gets the session of another site's visitor. History still belongs to the **site** — `0004` does not change on that point.
   The seat door's `MCP_TRACY_SITE_KEY`/`SITE_LABEL` are left **empty** on the dsh host, so the
   `/gateway/tracy` door (signing straight into a lane) is closed: every session is minted through `cowork-web` with
   explicit `folders`.

5. **One seat key per HOST**, not per site (`HOST_SEAT_SECRET_CONTABO`, `_DO`, written
   in **both** Workers `cowork-web` and `seat-registry`). The reason for a per-site key disappeared with the lane:
   the owner can no longer read dsh's env, because they only exec into the web container.

6. **The image is built from the REPO, and there is no registry any more.** `@deepseek-ai/*` and the five forked plugins are
   **pnpm workspace members** (`vendor/tracy/deepseek-harness/packages/*/*`), so "one dsh version for the whole
   system" from `0009` §1 is kept by the **source tree** rather than by a series of release numbers. The private
   registry (`npm.tracy.ai`, verdaccio), the `npm-registry` Worker, `scripts/release.ts` and
   `pnpm release` were retired on 06/09. `-tracy.N` is still the version label of the fork; it is no longer a download
   address. The release path to customers is still the **image** — `0008` is unchanged, it just loses the publish step in the middle.

7. **The side card's Terminal tab keeps today's behaviour: owner account only.**
   `dsh-passwords`'s `isAdminOnlySidebarEndpoint` refuses every `/sidebar/*` upgrade for the
   `user` role **before** the allowlist is consulted — the sidecar lane did exactly the same, so this is parity,
   not a regression of one-dsh. Customers get a shell through the agent's `bash` tool, which goes down the path
   in decision 2. Changing that is a separate ruling on `dsh-passwords`.

## Accepted costs

- 🔒 **The proxy filters the PATH, it does not read the request BODY.** `POST /containers/<x>-web-1/exec` carries a
  JSON body that haproxy has no opinion about, so `{"Privileged":true,"User":"0"}` is let through **by every
  rule in the file** — measured 06/09: `uid 0`, `CapEff 000001ffffffffff`. What that rules file buys
  is **which container**, not **what is done once inside**. The second boundary is **the isolation profile
  of the web container itself** (default seccomp/AppArmor), so it is pinned rather than assumed:
  `render-compose.sh` writes `no-new-privileges` for every platform, and `attach-site.sh` **refuses**
  to attach a site whose `<label>-web-1` runs `--privileged` or `unconfined`.
- 🔒 **The file fence is JS in the SAME PROCESS as the data, not the kernel.** Lee decided to keep
  `danger-full-access` for owner/admin (`permissionsFor` unchanged), so the table in decision 3 is
  the only thing standing between a file tool and `/desk-home`. A new tool that enters the profile without anyone adding
  a row to the table is a tool fenced by the broad rule (a string that contains `/` and points to something that **exists**), not
  by its own rule — `test/fs-tool-schemas.test.mjs` catches that, and it caught
  `pwsh` on 06/09.
- **`docker exec` does not forward signals.** Killing a running command takes a **second exec
  call** carrying the marked exec-id (the reaper in `src/route.mjs`), not a signal. That
  means cancelling a command is a network call that can fail, and an orphaned process in the web
  container is a real state that needs cleaning up.
- **A DROPPED Terminal tab keeps the shell alive for 30 more seconds.** The reaper only runs when someone calls
  `terminate()`; a broken socket (tab closed, refresh, crash) does not reach `close()` right away —
  `dsh-better-sidebar` schedules it after `reconnectGraceMs` (default **30 s**), so that a quick reconnect
  keeps the shell. So a **legitimate** `/bin/bash -l` stays alive in the web container until that window ends: measured
  06/09 through the gateway with a real WebSocket client, still there at t+30 s and gone at t+35 s; closing the tab properly
  (with a `close` frame) makes it go within 4 s. Seeing the first case and concluding "the reaper missed" is a misreading —
  nobody told the reaper to run.
- **One seat key per host is one blast radius per host.** Before: a leaked key = one site. Now: a leaked key =
  every site on that machine. In exchange, the places that hold the key drop by fourteen.
- **There is no longer a "released version" to roll back to.** Rolling back is rolling back the **image tag** (`0008` said so already),
  and upgrading the dsh base is a submodule update + image build on the host — no `pnpm install`
  chooses for you.
- **One process for the whole host is one point of failure for the whole host.** A broken lane breaks one site; a broken dsh
  makes every site on the host lose its agent at once. This is the direct cost of sharing the
  process, and it is accepted knowingly.

## Options considered and rejected

- **Keep lanes, just clean up.** Cheapest this week, and rejected because it does not touch the multiplication: still one
  container per site, still 412 MB copied each time, still one hostname + DNS + ingress + Access per
  site, and still reseeding every lane on every version upgrade.
- **Send files through `docker exec` like commands.** Keeps a kernel boundary for the file path too, but
  requires rewriting the `tool-fs` backend — someone else's code — and pays one process for **every
  read**. More importantly: the fence still lands exactly where it was (the table of which tool has which path arguments),
  so it **does not buy** what it seems to buy.
- **Rewrite the agent core with deep agents.** Weighed, with a full comparison table
  ([`kiem-ke`](../../tasks/kiem-ke-tinh-nang-va-danh-gia-viet-lai.md) §5–§6). Rejected **for this
  decision** for two reasons: the agent core is ~10% of the work, while Worker/fleet/seat ledger do not change; and it would spawn
  an extra 15–25k-line UI block to maintain ourselves. It is **not** rejected permanently — see the section below.

## What this ADR does NOT conclude

- **Whether to drop dsh.** Option (2) of `kiem-ke` §6.3 (replace the core, keep the edges) is still open, and this ADR
  deliberately makes it **cheaper** rather than closing it: dropping the registry, dropping lane seeding, dropping one container per
  site is dropping exactly the things that option would also have to drop.
- **How many sites one host can hold.** The old number (four lanes/droplet) no longer applies, and the new number
  has not been measured — it depends on the web container, not on dsh any more.
- **Whether seats get the Terminal tab.** Decision 7 only records today's behaviour of `dsh-passwords`;
  changing it is a separate decision, and it touches the sign-in door of every surface.
- **How many fleet hosts, and who picks the host for a new site.** `FLEET_NEW_SITE_HOST` answers the
  second question with a constant, not a policy.
- **The pricing model.** See [`CONTEXT.md`](../../CONTEXT.md) §5 — do not infer it from here.

## What this ADR negates

| ADR | Which part | Status after 06/09 |
|---|---|---|
| [`0004`](0004-dsh-is-the-shell.md) | "dsh is the shell", "the site follows the user", "history belongs to the site" | **kept as is, binding** |
| [`0004`](0004-dsh-is-the-shell.md) | shape **(a) sidecar per site**, and the RAM table "four lanes/droplet" | **no longer applies** — replaced by decision 1 here. The boundary between sites is now mount + seat door + the fence in decision 3, not one container per site |
| [`0004`](0004-dsh-is-the-shell.md) | gate `check-lane-tabs` ("a seatless lane does not seed seat-requiring tabs") | **nothing left to violate** — guest is a role, not a separate bundle. Gate deleted 06/09 |
| [`0008`](0008-mode-config-ships-in-the-image.md) | "the release path is the image", "a volume is not a release path" | **kept as is, binding** — and stronger: there is no registry left to go around it |
| [`0008`](0008-mode-config-ships-in-the-image.md) | "tools enter the bundle **through the registry**" | changed: tools enter the bundle **through the source tree**, then the image |
| [`0009`](0009-one-dsh-version-published-by-tracy.md) | §1 "one dsh version for the whole system" | **kept** — now enforced by the workspace, not by a number series |
| [`0009`](0009-one-dsh-version-published-by-tracy.md) | §2–§5 self-publishing 248 packages, empty `overrides`, gate `check-image-lock` | **ended** — see the note at the top of 0009 |
| `tracy-infra` **0007** | "each surface picks its own dsh version", and "the only way out is the registry" | **both parts dead**. The first part died with `0009`; the second dies here — the way out of the tree is **npmjs or workspace** (`CLAUDE.md` RULE #1) |
