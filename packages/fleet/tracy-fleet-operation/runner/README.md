# CI runner — rebuilding it from a blank machine

This folder is the **definition** of the GitHub Actions runner that two workflows run on:
`build-dsh-image.yml` (builds the `tracy-dsh` image → GHCR → deploy) and `deploy-workers.yml` (deploys
Workers to Cloudflare). Three files: `Dockerfile`, `compose.yml`, `entrypoint.sh`.

⚠ **Until 07/09 these three files lived only in `/opt/tracy-runner/` on exactly one machine.** They came
into the repo for a mundane reason: if that machine broke, nobody could rebuild the runner, and no line
in the repo said what the runner needs. **There is no automatic path pushing them to the machine yet** —
edit here, then `scp`; saying so beats letting the next person assume there is one.

Current machine: the dev host — `<runner-host>`, reached with `ssh root@<runner-host>` (not relying on any
machine's private alias), Ubuntu 24.04.4, 8 cores / 23 GB / 290 GB, Docker 29.8.0.

---

## 0. This machine plays TWO roles, and that is a decision, not a stopgap

It is both the CI runner **and the dev environment** — `tracy-dsh`, `cloudflared`, `tracy-hooks` all
live on it. Consequences to grasp before touching it:

- The resource ceilings in `compose.yml` (**6 cores / 12 GB** on an 8-core machine) are
  **load-bearing**: an uncapped `docker build` takes every core and the dev `tracy-dsh` stops answering
  midway.
- The runner holds the **host's docker socket**, which makes it **root on this machine**. Packing it
  into a container only keeps the folder clean — it is **not** a fence. Do not read `user: "0:0"` in
  the compose file as carelessness: it is there because the deploy step writes `/etc/tracy/host-dsh.env`
  and `/opt/tracy-fleet/` on the host, both owned by root.

---

## 1. Prerequisites on the host

```bash
# Docker Engine + compose plugin (Docker's build, not Ubuntu's docker.io)
curl -fsSL https://get.docker.com | sh

# Folders the deploy step writes to. The runner mounts the EXACT absolute paths, so they must exist FIRST.
mkdir -p /opt/tracy-runner /opt/tracy-fleet/dsh /etc/tracy /srv/tracy/host-dsh/home
```

🔒 **Those four folders are not decoration.** Without `/srv/tracy` the first CD run dies at
`seed-profile: no /srv/tracy/host-dsh/home` — a folder that **exists** on the host but the container
cannot see (measured 07/09). `/etc/tracy` holds `host-dsh.env`, i.e. the running image's tag;
`/opt/tracy-fleet/dsh` holds the compose file and the deploy scripts.

**The GID of the `docker` group must match `group_add` in `compose.yml`.** On this machine it is `988`:

```bash
getent group docker        # docker:x:988:runner
```

If another machine gives a different number, **edit `compose.yml`**; do not change the host's GID. With
the wrong number the runner sees the socket but cannot open it, and the error surfaces in the middle of
a `docker build`, not at startup.

---

## 2. Build

```bash
scp Dockerfile compose.yml entrypoint.sh root@<runner-host>:/opt/tracy-runner/
ssh root@<runner-host>
cd /opt/tracy-runner
docker compose build          # ~1.8 GB, a few minutes
```

Get a **registration token** from `Settings → Actions → Runners → New self-hosted runner` of
the source repository (`TracyHQ/tch` until cutover, then `TracyHQ/tracy`: set `TRACY_SOURCE_REPO` in
`/opt/tracy-runner/.env`, read by `compose.yml`). It **expires after one hour** — use it right away:

```bash
RUNNER_TOKEN=<token> docker compose up -d
docker logs -f tracy-runner   # wait for "√ Connected to GitHub"
```

The runner's identity lives on the `tracy-runner_runner-home` volume, so **later restarts need no new
token** — `entrypoint.sh` only calls `config.sh` when there is no `.runner` yet.

**Check with GitHub; do not trust the log:**

```bash
gh api repos/${TRACY_SOURCE_REPO:-TracyHQ/tch}/actions/runners --jq '.runners[]|"\(.name) \(.status)"'
```

⚠ Right after `docker compose up -d`, the log prints `A session for this runner already exists` and
`Runner connect error: Conflict`. **That is not a registration error** — GitHub keeps the old session
until it expires and the runner then reconnects by itself; `gh api` answers `offline` in the meantime.

But it **does not always clear by itself**. When the container is `Recreated`, the old process dies
before returning its session, and measured 07/09 it stayed at `Conflict` for more than five minutes —
the log looping `√ Connected to GitHub` then `already exists` forever, looking exactly like it works.
Force a re-registration instead of waiting longer:

```bash
RT=$(gh api -X POST repos/${TRACY_SOURCE_REPO:-TracyHQ/tch}/actions/runners/registration-token --jq .token)
ssh root@<runner-host> "cd /opt/tracy-runner && docker compose down \
  && docker run --rm -v tracy-runner_runner-home:/h alpine \
       rm -f /h/runner/actions-runner/.runner \
  && RUNNER_TOKEN='$RT' docker compose up -d"
```

Deleting `.runner` is the only way to make `entrypoint.sh` call `config.sh` again; the `--replace` flag
in there takes care of overriding the old registration.

---

## 3. Three things in the image, and the cost of missing each

| Thing | Without it |
|---|---|
| `docker-ce-cli` + the host's socket | no image can be built — the runner **drives** the host's daemon rather than running a nested one. With a nested daemon the built image sits in its own cache and must be exported/imported to reach the host |
| `openssh-client` | the step that pulls the `vendor/tracy/deepseek-harness` submodule dies with `exit 127`. It happened on the first CI run |
| **`node` + `corepack`** | `deploy-workers.yml` dies at the **FIRST** step (`node scripts/changed-services.mjs`) with `node: command not found`. Measured 07/09: **four** consecutive pushes to `develop` deployed no Worker, while `build-dsh-image` was green right next to them — in the run list it looked exactly like a healthy CD |
| **`python3` + `make` + `g++`** | `pnpm install` dies midway at `fs-ext`: `gyp ERR! Could not find any Python installation to use`. The error surfaces after a few minutes, in the middle of installing 410 packages, so it reads like a flaky install rather than an image missing its tools. Without `fs-ext` built, **dsh dies at boot** — `CLAUDE.md` §5 |

⚠ **Those gaps showed up ONE AT A TIME, one per run.** Only after fixing the first does the next get a
chance to fail. So after fixing the image, do not stop at "the old step is green" — run until the whole
job is green.

The Node version pinned in `ARG NODE_VER` must follow the constraint in [`CLAUDE.md`](../../../../CLAUDE.md) §5:
**≥ 22.19 or ≥ 24**. Below that, `tsdown` does not strip TypeScript types itself and borrows `unrun` — a
package no lockfile holds — and the error it throws **says nothing about Node**.

`corepack` is installed from npm rather than using the copy bundled with Node: the bundled one fails
with `Cannot find matching keyid`. It is what picks `pnpm 11.18.0` at the repo root and `11.7.0` in the
submodule — two different versions, and an `npm i -g pnpm` would shadow that shim and install both trees
with one version: the install stays green, just wrong.

---

## 4. Secrets the two workflows need (set on the repo, not on the machine)

`Settings → Secrets and variables → Actions`:

| Secret | Used in | For |
|---|---|---|
| `TRACY_VENDOR_DEPLOY_KEY` | both | read-only deploy key that pulls the `vendor/tracy/deepseek-harness` submodule — **a separate repo**, and `GITHUB_TOKEN` cannot read another private repo |
| `CLOUDFLARE_API_TOKEN` | `deploy-workers` | deploying Workers |
| `TRACY_NPM_TOKEN` | — | inherited from the private-registry era; that registry was retired 06/09 (ADR 0014) |

Pushing images to GHCR uses the built-in `GITHUB_TOKEN`; nothing else to declare.

The two environments `dev` and `production` exist and are **empty** — they are there so review rules can
later be attached to the `main` branch, not to hold values.

---

## 5. Checks after a rebuild — three questions, skip none

```bash
# 1. Does the runner have all its tools (this catches exactly the 07/09 failure)
ssh root@<runner-host> 'docker exec tracy-runner sh -lc "node -v; corepack -v; docker --version; ssh -V"'

# 2. Does GitHub see it
gh api repos/${TRACY_SOURCE_REPO:-TracyHQ/tch}/actions/runners --jq '.runners[]|"\(.name) \(.status)"'

# 3. A real run, and read BOTH workflows — one green says nothing about the other
gh run list --branch develop --limit 4 \
  --json workflowName,conclusion,headSha \
  --jq '.[]|"\(.workflowName) \(.conclusion) \(.headSha[0:8])"'
```

### A failed install leaves debris, and the next run inherits it

A `pnpm install` that dies midway leaves a half-built `node_modules` in `_work`, and the next run does
**not** install from scratch — it fails again somewhere else entirely, usually
`Cannot find package '@jridgewell/gen-mapping'` from inside the submodule. That is a symptom of debris,
not a real dependency error. Wipe the checkout and run again:

```bash
ssh root@<runner-host> 'docker exec tracy-runner rm -rf /home/runner/actions-runner/_work/tch'
```

The next run clones from scratch (~2 GB, slower), and that is the price of a clean answer.

🔒 **Question 3 is the only one that answers "is CD running".** `build-dsh-image` and `deploy-workers`
run independently on the same push; reading one and concluding for both is exactly how four consecutive
broken Worker deploys went by unnoticed.
