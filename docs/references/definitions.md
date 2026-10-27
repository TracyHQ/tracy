---
description: Definitions of TCH and DSH concepts — each entry says what a thing IS, what it is NOT, and where a misunderstanding breaks things.
sources:
  - vendor/tracy/deepseek-harness
  - packages/bundle/tracy-cowork/cordis.patch.yml
  - packages/ui/tracy-chat-input/cordis.patch.yml
  - tch/profiles/web/package.json
  - pnpm-workspace.yaml
  - run.sh
  - apps/tracy-web/src/workspace/route.js
  - apps/tracy-web/src/config.js
  - apps/tracy-web/src/app.js
  - packages/fleet/tracy-fleet-operation/dsh/host-dsh.yml
  - packages/tools/tracy-subprocess-docker/src/route.mjs
  - docs/adr/0001-seat-door-and-enforcement-boundary.md
  - docs/adr/0014-one-dsh-per-host-commands-in-web-container.md
---

# Definitions — TCH and DSH

This document answers exactly one kind of question: **"what actually is that X?"**

It is for two readers at once — a new team member who needs to understand the system before touching
it, and a coding agent who needs to know what it is talking about before editing. Both fail in the same
way: guessing a word's meaning and then acting exactly on the guessed meaning.

## What this document is NOT

An important boundary, because this repo refuses to have two sources of truth for one thing:

| Document | Answers which question |
|---|---|
| **This one** | *What X is* — the concept |
| [`vocabulary.md`](vocabulary.md) | *Which word names X on screen* — displayed words |
| [`ban-do-fleet.md`](ban-do-fleet.md) | *Where X runs and how to look it up* — the measured current state |
| [`profile-map.md`](profile-map.md) | *Which surface loads what, on which port* — a snapshot |
| [`naming-conventions.md`](naming-conventions.md) | *How to name X* — conventions |

## Sources of truth, and their order when they disagree

Each entry below is **a synthesis after reading every source** — reading the whole entry is enough to understand the concept,
without opening another file. The pointers at the end of an entry are for **digging deeper**, not for understanding.

That needs a rule, because the sources **disagree with each other** and some are dead:

1. **Running code beats every document.** A document describes an intention; code describes what happens.
2. **A higher-numbered ADR beats a lower-numbered one.** A later ADR **may overrule** an earlier ADR's definition,
   and the earlier ADR then remains *(binding)* for the parts not touched — so you cannot read
   a single ADR and conclude.
3. **TCH beats the old infrastructure repo.** That repo is **frozen** for this work. Its documents describe
   a system that has changed shape twice since 30/08, and **are not cited here** — what still binds
   has been restated in words in the entries below.
4. **A dated measurement beats an undated one.** A number with no date is a number that cannot be checked
   again.

**What overruled what** — this table is why rule 2 exists:

| Decision | What it overruled |
|---|---|
| **0004 — dsh is the shell** (01/09) | Fully reversed the earlier model: Tracy's SPA was the shell, dsh a *sidecar in the `/agent` iframe*. Since 0004, `cowork.tracy.ai/` serves **the lane directly**, and the SPA is no longer served at `/`. Every description of "dsh inside an iframe" describes a dead system |
| **0005 — one mail path** (01/09) | Dropped magic links; kept 0003's door, **only changing how it asks**. Before, one email carried both a button and a code |
| **0003 — one sign-in door** (01/09) | Merged **four** sign-in doors and **four** "where to return" rules into one. Before, ~25 places built sign-in address strings themselves |
| **0009 — one dsh version for the whole system** (05/09) | Killed the old infrastructure repo's "each surface picks its own dsh version". Its own second half (self-publishing 248 packages to a private registry) lived only **one day** — see the row below |
| **0010 — one dsh per host** (06/09) | Killed the **(a) sidecar per site** shape of 0004: the fleet runs **one dsh per host**, the agent's commands run in the site's web container via `docker exec`, guest and the welcome door become two **roles** rather than two lanes. Also killed the rest of 0009 §2–§5's private registry: the way out of the tree is **npmjs or workspace**. Every description of "one dsh container per site" describes a dead system |

## How to read an entry

Each entry has four fixed parts, and the second and third are the valuable ones:

- **What it is** — a one-sentence definition.
- **What it is not** — what people usually assume. This is where most misunderstandings live.
- **Where a misunderstanding breaks** — real symptoms, not generic warnings.
- **Dig deeper** — where the details are kept, **in this repo**. No pointers lead outside.

---

## 1. DSH — DeepSeek Harness

**What it is.** An open-source *agent harness* from DeepSeek AI, running on the
[Cordis](https://github.com/cordiverse/cordis) framework, with an **everything-is-a-plugin** architecture: nearly
everything visible in dsh — the conversation column, the session list, the Settings page, the permission
door — is a plugin that can be turned off, replaced, or added to.

In TCH it appears in two forms, and the two forms serve two different jobs:

| Form | Where | For what |
|---|---|---|
| Source code | `vendor/tracy/deepseek-harness` (**submodule**) | for reading — looking up what upstream does when a behaviour is hard to understand |
| npm package | `@deepseek-ai/dsh` in the root `package.json` | for running — `./run.sh` calls this one |

⚠ The two numbers **may differ** and currently do: the submodule is at `0.1.2-alpha.1`, the package installed
to run is `0.1.2-alpha.3`. Reading code in one and drawing conclusions about the other's behaviour is a real
trap — [ADR 0002](../adr/0002-removed-upstream-assumptions.md) records five assumptions that died exactly
that way.

**What it is not.**

- **Not a Tracy product.** It is someone else's software, MIT-licensed, and in
  *developer preview* — upstream itself declares there will be breaking changes.
- **Not a Tracy fork.** TCH does not edit dsh's code; TCH **inserts plugins into** an unmodified dsh
  and **turns off** some of its plugins with patches. See entry 2.
- **Not "Tracy's server".** One dsh running on the fleet serves **every site of a
  host** — that is called the **host dsh**, entry 6.

**Where a misunderstanding breaks.** Treating dsh as our own code leads to editing `vendor/` directly — a violation of
RULE #5 of `CLAUDE.md`, and the edit vanishes at the next submodule update. The right path is
a **commit in the fork**, carrying a `-tracy.N` version, as `dsh-passwords` does — since 06/09 there is no
publish step any more, because the fork lives right in this tree ([ADR 0014](../adr/0014-one-dsh-per-host-commands-in-web-container.md) §6).

**Dig deeper.** `vendor/tracy/deepseek-harness/README.md` · [ADR 0002](../adr/0002-removed-upstream-assumptions.md)

---

## 2. TCH — Tracy Cowork Harness

**What it is.** This repo, and since 2026-08-30 **the whole Tracy system**: both the part running *inside* dsh
and the part running *in front of* dsh on Cloudflare.

So TCH has **two code areas with entirely different rules**, and mixing them is the source of many confusions:

| Area | What it is | Where it runs | How it leaves the machine |
|---|---|---|---|
| `packages/` | dsh plugins + libraries, TypeScript | inside a running dsh | **the image** — `docker build` from this repo itself, on a fleet host ([ADR 0014](../adr/0014-one-dsh-per-host-commands-in-web-container.md) §6). No registry in between any more |
| `workers/` | **seven** Cloudflare Workers, **plain JavaScript** | on Cloudflare, answering customers' browsers directly | `node scripts/deploy.mjs <service>` (wrangler) |

**What it is not.**

- **Not a fork of dsh** — see entry 1. The relationship is *standing on top*, not *replacing*.
- **Not `tracy-desk`.** `tracy-desk` is an Electron app forked from Cherry, another project in the
  workspace, unrelated to this repo.
- **Not just plugins.** Half the system — sign-in, the seat ledger, host selection and minting seat sessions —
  lives in `workers/` and never passes through dsh.

**Where a misunderstanding breaks.** Applying one area's rules to the other. Two real examples: writing TypeScript
in `workers/` (there is no build step there), or bringing a CSS reset into a plugin (`packages/` runs
*inside* the host's page — adding a second reset breaks dsh's interface, RULE #4).

**Dig deeper.** [`CLAUDE.md`](../../CLAUDE.md) §1–§2 · `workers/` (deleted 16/09/2026 — `git log` keeps the history)

---

## 3. Plugin (dsh plugin)

**What it is.** An npm package dsh loads into its plugin tree at start-up. In TCH, "plugin" has a
**checkable** definition, not a feeling — the following three sides are always true together or false together:

```
@tracy/dsh-*  ⟺  package.json has a `dsh` field  ⟺  has cordis.patch.yml
```

True for 11/11 plugins and bundles, false for 6/6 packages that are not plugins. Each side is a real mechanism:
the `dsh` field is what dsh reads; `cordis.patch.yml` is what turns the package into **one row** in the loader
tree; the `dsh-` prefix tells readers the package only means something *inside* a running dsh.

A plugin declares its name in **three places** — `package.json`, the cordis row, and the `id` the browser bundle
passes to `__ModuleLoader__.load` — and **nothing at run time cross-checks them**.

**What it is not.**

- **Not every package in `packages/`.** `@tracy/ui`, `@tracy/design`, `@tracy/core` are
  libraries: no `dsh` field, no patch, dsh does not load them. Plugins `import` them.
- **Not something with a build step at deploy time.** The image **copies the plugin directory as is**
  (`COPY packages/… → node_modules/@tracy/…`), running no build there — so `lib/client.js`
  **is committed** (RULE #3).

**Where a misunderstanding breaks.** This is the most expensive failure in the repo, because its symptom is
**absence**: with the three names out of step the bundle still builds, the package still installs, dsh still boots — and half the
interface simply does not render. No error, no warning, not one log line.
`dsh-github-workbench` died exactly like that on 2026-08-30. Forgetting to build `lib/client.js` is the same
kind: customers get the old text, and nothing says so.

→ `scripts/check-plugin-identity.ts` and `check-bundles` guard these two, precisely because the human eye
cannot see an absence in a diff.

**Dig deeper.** [`naming-conventions.md` §1.1–§1.3](naming-conventions.md) ·
[`five-things-a-plugin-must-get-right.md`](five-things-a-plugin-must-get-right.md)

---

## 4. Bundle

**What it is.** A **packing list**, not the goods: a `@tracy/dsh-<name>-bundle` package holds no code, only
two files (`package.json` + `cordis.patch.yml`), and does two separate jobs:

1. `dependencies` make the child plugins **present on disk** — missing, dsh cannot resolve the package names;
2. `cordis.patch.yml` makes them **loaded into the tree** — missing, the package sits there with nobody calling it.

The two jobs fail independently, and both fail silently. A bundle is also where decisions *common
to every customer surface* live: turning off `ui-sidebar`, turning off `ui-settings-general` so that Tracy's
Settings page takes its place, pointing `skill-filesystem` at the shared skill library.

The difference from a plugin lies in two questions, and the name must carry the answer:

| | Bundle (`-bundle`) | Plugin |
|---|---|---|
| Has code? | **no** | yes |
| How many rows does the patch insert? | **many** (other packages') | **one** — itself |
| `dependencies` | the plugins it groups | usually empty |

**What it is not.**

- **Not what the `dsh.bundle.patch` field points to.** dsh calls "bundle" *any package a profile
  can list in `dsh.profile.bundles`*, so that field exists in **both kinds**. It says the package *can be
  loaded*, not what it *contains*. That is why the `-bundle` suffix in the name is mandatory.
- **Not something that can group other bundles.** dsh **has no** bundle-of-bundles mechanism:
  `DshBundleManifest` carries exactly one `patch` path. That is why
  `@tracy/dsh-cowork-bundle` must **copy** `dsh-passwords`' rows into its own patch —
  and because they are copied, the `dsh-passwords` version is pinned **exactly**, not with a caret range.

**Where a misunderstanding breaks.** Listing **both a bundle and one of its sub-packages** in the same profile
inserts the row twice → duplicate `id` → **dsh flatly refuses to boot**. This is a direct consequence of a
package being able to enter the tree by two paths.

**Dig deeper.** [`naming-conventions.md` §1.3](naming-conventions.md) ·
[`packages/bundle/tracy-cowork/cordis.patch.yml`](../../packages/bundle/tracy-cowork/cordis.patch.yml)
— that file explains each of its rows, including the rows that are **deliberately absent**.

---

## 5. Profile

**What it is.** A directory under `$DSH_HOME/profiles/<name>/` declaring **what this surface consists of**. The whole
declaration lives in a small `package.json`:

```json
{
  "dependencies": {},
  "dsh": { "profile": { "bundles": [
    "@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@tracy/dsh-cowork-bundle"
  ] } }
}
```

🔒 **`dependencies` is EMPTY, and that is the content of the decision, not a blank left unfilled.** A profile
**installs nothing**: every package `bundles` lists is **symlinked** by `scripts/materialize-profile.mjs`
from this repo's own workspace — the same contract the image's Dockerfile fulfils with `COPY`.
A version range here would be **a second source of truth for code already sitting in the tree** (the reason verbatim
in `tch/profiles/web/package.json` and `pnpm-workspace.yaml`). The only exception today:
`tch/profiles/native` still has **one** real dep, an npmjs package that the dev overlay `tch/patches/`
names.

`$DSH_HOME` is the repo's `tch/` directory (`run.sh` sets it). The three local profiles — `web`, `desktop`,
`native` — share that `$DSH_HOME`, so **sessions, credentials and settings are one** across all three.

**What it is not.**

- **Not a pnpm workspace member, on purpose.** dsh's `initProfile()` writes its own
  `pnpm-workspace.yaml` inside it, pinning `nodeLinker: hoisted` — which makes every plugin outside the
  tree share **one cordis instance**. Claiming that directory in the root workspace would either be hidden by the
  nested file, or require deleting it and duplicating cordis. This reason is written right in
  `pnpm-workspace.yaml`.
- **Not Tracy's code.** A profile is *run-time configuration* and does not leave this machine. What leaves
  is **the image** — the plugin tree is `COPY`ed into `/desk-home/profiles/native` at build time (ADR 0008,
  [ADR 0014](../adr/0014-one-dsh-per-host-commands-in-web-container.md) §6).
- **Not something its name identifies.** ⚠ **Several things are called `web` and they differ**:
  `tch/profiles/web` on this machine, `web` as **the compose service of the website container**
  in `<label>-web-1`, and the profile inside `tracy-dsh` on a fleet host is called **`native`**, not
  `web`. What decides is **the bundle it loads**, not the name.

**Where a misunderstanding breaks.** Two ways, both have happened:

- **Measuring the wrong surface.** On 31/08 nearly an hour was lost because every patch landed in the guest lane while
  the user was going through the sidecar — two different bundles, one symptom. Those two lanes have
  retired, but the shape of the trap has not: now it is **local profile vs. the profile in the image**.
- **Booting an empty client graph.** Breaking `dsh.profile.bundles` gives HTTP 200, no error, a blank
  interface. The `check-boot-graph` gate exists for exactly that.

🔒 **One env file per profile.** `dsh-passwords` declares the gateway port in the env file
(`MCP_GATEWAY_PORT`), not through a flag. Two profiles sharing one file means two password doors
competing for one port: the second dies with `EADDRINUSE` and shuts itself down, while its dsh keeps serving normally
— so the browser gets 401 and it **looks exactly like it is working**.

**Dig deeper.** [`profile-map.md`](profile-map.md) · [`CLAUDE.md`](../../CLAUDE.md) §5

---

## 6. Host dsh

**What it is.** **One running dsh serving EVERY site of a fleet host** — the `tracy-dsh` container
built from `dsh/host-dsh.yml`, seeing each site at `/site/<label>`, with **one** address
(`<host>-agent.tracy.ai`) and **one** seat key for the whole machine. Decided 06/09,
[ADR 0014](../adr/0014-one-dsh-per-host-commands-in-web-container.md).

It connects to customers' sites through **three** things, and only three:

| Connected through | Concretely | Enforced by |
|---|---|---|
| **Mount** | `/srv/tracy-sites/<label>` (an `rshared` bind on the host) → `/site/<label>` in dsh | `attach-site.sh` |
| **Seat door** | a session minted for the (email, site) pair, carrying `folders: ['/site/<label>']` | `cowork-web` + `dsh-passwords` |
| **Web container** | the agent's commands run via `docker exec` into `<label>-web-1`, through an exec-only socket proxy | `docker-proxy.haproxy.cfg` + `subprocess-docker` |

🔒 **What keeps two sites apart is NO LONGER two dsh containers.** It is the three things above, plus a
**path fence inside the dsh process**: file tools (`read` `write` `edit` `glob` `grep`
`str_replace_editor`) run right inside dsh, where every site is mounted, so the
`tools/pre-execute` guard of `@tracy/dsh-subprocess-docker` checks every path argument of **every** tool
— including in `danger-full-access`, the only mode that does not go through `confine()`.

**What it was before (read to recognise old documents).** Until 05/09 the shape was **lanes**: one dsh
container for **each site**, each with a hostname, a key, an identical copy of a 412 MB plugin tree (three lanes
measured 02/09 gave the same hash `1815629d6c3a6eab`), ~270 MB of RAM when idle, and **four** lanes filled a
2.3 GB droplet. The word "lane" in documents and historical code **always** points to that shape — it is dead,
not another name for the host dsh.

**What it is not.**

- **Not a user.** A host dsh serves **every seat of every site** on that machine.
- **Not a workspace.** A workspace is a directory *inside* it: `/site/<label>`.
- **Not a kernel fence between sites.** The fence between two sites **inside** dsh is
  software: the seat door grants `folders`, and the path table above blocks the rest. A kernel boundary only
  appears in the **command** half — where commands run in that site's own web container.
- **Not one more sign-in door.** `MCP_TRACY_SITE_KEY` is left empty, so `/gateway/tracy` is
  closed: every session is minted through `cowork-web` with explicit `folders`.

**Where a misunderstanding breaks.** Three ways, all three measured or nearly hit:

- **Thinking the container is the boundary** and then granting `danger-full-access` as if that were fenced enough. It is not: in that mode
  `confine()` is skipped and the path table is the **only** fence. A new file tool entering the
  profile without anyone adding its row to the table is fenced only by the broad rule.
- **Thinking the socket proxy's rules block everything.** It filters **paths**, it does not read **request
  bodies**: `{"Privileged":true,"User":"0"}` passes every rule in the file (measured 06/09). The second
  boundary is the web container's own seccomp/AppArmor profile, which is why `attach-site.sh` **refuses**
  to attach a site running `--privileged` or `unconfined`.
- **Thinking a dead host dsh breaks only one site.** It makes **every** site on that host lose its agent
  at once — the direct price of sharing one process.

**Dig deeper.** [`ban-do-fleet.md`](ban-do-fleet.md) ·
[`packages/fleet/tracy-fleet-operation/dsh/HOST-DSH.md`](../../packages/fleet/tracy-fleet-operation/dsh/HOST-DSH.md)
(the runbook, and the socket proxy's evidence table in §5) ·
[ADR 0014](../adr/0014-one-dsh-per-host-commands-in-web-container.md)

---

## 7. Seat

**What it is.** **One person's** rights **on one site**, recorded in the **seat ledger** (Supabase, behind
`seats.tracy.ai`): `seat` → `seat_workspace(role)` → `site`. The role resolves into four
**toolsets** — `content` · `code` · `site` · `lifecycle` — which an Owner can override per site
through `site_role_policy`.

The rule binding the whole system, [ADR 0001](../adr/0001-seat-door-and-enforcement-boundary.md):
**the seat ledger says who may do what; the runtime only enforces.** The Worker resolves the role and sends the **result** down to
the fleet host's dsh through a single door, `POST /gateway/seat/session`, HMAC-signed.

The toolset → dsh permission mapping, and where it stops:

| Toolset | What it becomes in dsh | Enforced by |
|---|---|---|
| `content` | granted folders + the `workspace-write` sandbox | host dsh |
| `code` | `allowed_websocket_paths` (terminal) + `allow_git_download` | host dsh |
| `site` | `allow_workspace_create` + `allow_upload` | host dsh |
| `lifecycle` | **nothing** | the fleet, through the Worker |

**What it is not.**

- **Not an account in dsh.** `dsh-passwords` has its own SQLite user ledger; a seat is **not**
  that. Before ADR 0001 the two ledgers were joined by six steps and a master credential — that model is
  dead.
- **Not something the runtime keeps a copy of.** The role matrix **stays in the seat ledger**. A `seat_profile` table
  in dsh was once planned and dropped while still being written: two tables answering the same question
  will drift, and the losing side is the one the customer just edited.

**Where a misunderstanding breaks.**

- **An extra door.** Turning on the seat door **is** turning off the password door — `/gateway/login` and `/gateway/setup` return 404
  when `MCP_SEAT_SECRET` is present. Leaving both open leaves a door the seat ledger **can neither grant nor
  revoke**. `scripts/check-seat-door.ts` guards it, but it guards **code**, not **running containers**.
- **A shared key is a blast radius.** The `folders` in a grant are declared by **the caller**, and the
  owner seat runs under the `danger-full-access` preset (measured 01/09) — so whoever holds the key can mint sessions into
  every site the key covers. 01/09: **one key per site**. Since 06/09: **one key per fleet host**
  ([ADR 0014](../adr/0014-one-dsh-per-host-commands-in-web-container.md) §5) — the radius widened
  to exactly one machine, and that is a price written down, not one forgotten.

**Dig deeper.** [ADR 0001](../adr/0001-seat-door-and-enforcement-boundary.md) ·
[`ban-do-fleet.md` §4](ban-do-fleet.md)

---

## 8. Site

**What it is.** A customer's website, and in the system it is called by **three different names for three different
jobs** — mixing them up is the source of many debugging sessions heading the wrong way:

| Name | Example | Used where |
|---|---|---|
| `siteKey` | `tracy-ai-8836f920` | the seat ledger — the question "which sites does this person have a seat on" |
| `label` (fleet label) | `tchemdash1` | the fleet — the directory `/srv/tracy/<label>/`, containers, the mount `/work/<label>` |
| hostname | `tchemdash1.tracy.ai` | the customer's browser |

The dsh serving a site is **derived**, not looked up in a table: label → fleet host (`workers/shared/host-dsh.js`)
→ `<host>-agent.tracy.ai`. A `siteKey → origin` table in the Worker would be a second copy of the truth
the fleet already keeps, and it would drift silently on the day a site is renamed.

A site also carries two attributes that decide behaviour: **`origin`** (`fleet_born` — newly built, or
`fleet_import` — already running on the open web) and **`platform`** (WordPress · Joomla · emdash).

**What it is not.**

- **Not the `tracy_site` cookie.** That cookie is **a pointer, not a permit**: it only says
  which site is open, while `seatRole` still asks the seat ledger for exactly that `siteKey` on every request. A forged cookie
  can only change **the question**, not the answer.
- **Not the dsh serving it.** A site is a website; the **host dsh** (entry 6) is the dsh serving the agent
  for every site on that machine. Since 06/09 the two are **always on the same machine** — the host's dsh sees the site through a
  mount, and mounts do not cross machines. Before, that was not so: a site's lane could sit on a
  different machine from the website, and on 02/09 the fleet was measured to be in **both shapes** at once.

**Where a misunderstanding breaks.** This is the trap that ate a whole afternoon (02/09, the lane era): finding
a container with a very plausible name, calling it directly and **seeing it mint sessions successfully** — while not one
Worker request ever reached that container. **A healthy container nobody calls looks exactly like
a container that has been fixed.** That shape did not die with the lanes: now it is two `tracy-dsh` on two
hosts, and the question is the same — do not guess the machine, **look up DNS**, then ask `workers/shared/host-dsh.js`
which host the site is recorded on.

**Dig deeper.** [`ban-do-fleet.md` §1, §5 step 0](ban-do-fleet.md) ·
[`vocabulary.md` §2](vocabulary.md) (the three words of the add-site flow)

---

## 9. Worker (Cloudflare Worker)

**What it is.** Code running on Cloudflare's edge that **answers customers' browsers directly** — what stands
*in front of* the dsh of every fleet host. A checkable definition: **a Worker is a directory in `workers/`
with a `wrangler.toml`.** By that test TCH deploys **seven**:

| Worker | Serves |
|---|---|
| `cowork-web` | `cowork.tracy.ai` — the only door customers type into, proxying to the **host dsh** holding that site |
| `seat-registry` | `seats.tracy.ai` — the seat ledger, GitHub App, rate limits |
| `site-registry` | `sites.tracy.ai` — the `site → repo` ledger (brought into TCH 02/09) |
| `cowork` | **no route** — the sign-in pages, called through a service binding |
| `fleet-bar` | 24 routes, one hostname per site — the bar on the customer's copy |
| `auth-email` | `auth-mail.tracy.ai` — Supabase's mail hook → Resend |
| `harness` | `harness.tracy.ai` — Tracy's operations surface, NOT a customer surface (ADR 0008) |

⚠ **This number went from 8 to 7 on 06/09**: `npm-registry` retired along with the private registry
([ADR 0014](../adr/0014-one-dsh-per-host-commands-in-web-container.md) §6). Any document still
listing it is out of date, not a Worker someone forgot to deploy.

⚠ **Counting on the Cloudflare account gives more than this number.** The rest are deployed from elsewhere, and **TCH
still depends on one of them** (`tracy-release-feed`). The full list, with each one's job,
its failure path, and how to look up which commit the running version came from:
`git log -- workers/`.

⚠ **`workers/` has three directories that are NOT Workers**, and this is the easiest place to miscount: `mail/` composes
emails, `seat-door/` signs seat-door calls, `shared/` holds shared code. None of the three **has a
`wrangler.toml`** and they are deliberately absent from `scripts/services.mjs` — declaring one there would make
`deploy.mjs` upload an empty directory over a running Worker.

🔒 **Recount by machine, not by memory:** `ls workers/*/wrangler.toml`. This table once had the right
number but the wrong list — it listed `seat-door` (not a Worker) and omitted `site-registry` — and **two errors
cancelling each other out are noticed by nobody until the recount**.

**What it is not.**

- **Not a dsh plugin.** Plain JavaScript, no build step, not published to a registry, not a
  pnpm workspace member. None of the `packages/` convention tables apply to this area.
- **Not something only TCH can deploy.** The old infrastructure repo — frozen for this work — still
  has old copies of most of those directories, still has its own deploy scripts, and **can still deploy**. The rule
  is **deploy ONLY from this repo** — `node scripts/deploy.mjs <service>`, and the script refuses when HEAD
  differs from `origin/main` or the tree has uncommitted changes.

**Where a misunderstanding breaks.** On 01/09 a third checkout (`8611eb5`, in no open repo)
deployed over **three** Workers and **nothing reported it** — it was only found by opening the login page and looking.
The directory layout is also part of the code: four Workers import each other's code by relative paths, so
moving one directory edits four Workers' code at once.

**Dig deeper.** `workers/` (deleted 16/09/2026 — `git log` keeps the history) (
when it is called and what happens when it goes wrong) · `workers/` (deleted 16/09/2026 — `git log` keeps the history) ·
[`page-shell-tokens.md`](page-shell-tokens.md) (the CSS of server-rendered pages cannot load `tokens.css`)

---

## 10. Webroot

**What it is.** The directory holding a customer's site on the host, and the thing that **connects the host dsh to a site**: it is
mounted into the dsh container, then granted to a seat through `folders` in the session grant.

⚠ **Since 06/09 there are TWO paths for the same directory, and both are right** — you must know which process
you are standing in:

| Standing in | Path where the site is seen | Who takes that path |
|---|---|---|
| **the dsh process** (host dsh) | `/site/<label>` (and `/site/<label>/.webroot`) | file tools, the seat door's `folders` |
| **the site's web container** | also `/site/<label>` — a mount deliberately given the same name | every command run via `docker exec` |

The two sides **deliberately share the name**: that way a `workdir` the model picks on the dsh side works verbatim on
the `docker exec` side, and the fence only has to understand **one** path form instead of translating back and forth (ADR
0010 §2–§3). Inside the web container, the webroot still has its own path
(`/var/www/html` for WP/Joomla).

But **that shape depends on the platform**, and this is the easiest thing to get wrong here (measured 02/09):

| Platform | Mount target | Has a webroot? |
|---|---|---|
| WordPress | `/var/www/html` | ✅ |
| Joomla | `/var/www/html` | ✅ |
| **emdash** | `data/` + `uploads/` under `/site/<label>/.webroot` | ❌ — it is an application, not a PHP CMS |

**What it is not.**

- **Not something every site has.** emdash has no webroot. Four emdash sites are running.
- **Not the whole site directory.** 🔒 `/srv/tracy/<label>/` contains `.env` and `tracy-agent.token`,
  both mode `600` — mounting the whole directory **hands the site's secrets to the agent**.

**Where a misunderstanding breaks.** This is a bug fixed on the morning of 02/09, and its mechanism is worth remembering:

```js
const firstFolder = perms.allowed_folders.find((f) => f !== '__deny__') ?? ''
return { ...frame, host: { ...host, home: firstFolder } }
```

**The agent's home = the FIRST element in the list of granted folders.** The Worker used to grant a hard-coded
`['/var/www/html', '/work/<label>']` to every site — WP/Joomla happened to be right, while emdash's agent
stood in an **empty** directory and described exactly what it saw: *"nothing is installed on this site yet"*. No error,
no log; just an agent confidently saying something wrong about a customer's site.

⚠ **The agent knows the platform because it STANDS IN THE RIGHT PLACE, not because anyone declared it.** So the right fix is **granting
the right folders, in the right order**, not writing another skill declaring the platform — that would be a second mechanism
stacked on one that works well.

**Dig deeper.** `workers/cowork-web/src/worker.js` (`grantFolders`) ·
[`packages/fleet/tracy-fleet-operation/dsh/HOST-DSH.md`](../../packages/fleet/tracy-fleet-operation/dsh/HOST-DSH.md) §0
(mount) · [`tasks/todo-lane-theo-site.md`](../../tasks/todo-lane-theo-site.md) §4b (**closed 06/09**,
kept for reading history)

---

## Still missing — the waiting list

Written down so nobody thinks this document is complete. The order below is the planned order of work, about five
entries per round:

**Next round — dsh's mechanisms:** cordis and the plugin tree · slots (`kind: single` vs `list`) · patches (three
levels: the package's · the bundle's · the profile's) · `$DSH_HOME` · the `tch/patches/` overlay.

**After that — infrastructure and data:** the fleet image · i18n namespaces · workspace · session · the seat ledger
(Supabase) · fleet · tunnel / ingress.

When adding an entry, continue the numbering, keep the four parts, and **date** any measured figure
— a number with no date is a number that cannot be checked again.
