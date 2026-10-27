---
description: Which image is rebuilt when — content fingerprints for tracy-dsh, tracy-web, tracy-host; redeploying the same tag does nothing; seven cases taken from the pipeline's history and the test holding each.
sources:
  - .github/workflows/build-dsh-image.yml
  - .github/workflows/build-app-images.yml
  - packages/fleet/tracy-fleet-operation/scripts/tools/dsh-image-context.sh
  - scripts/ci/image-context.mjs
  - packages/fleet/tracy-fleet-operation/dsh/deploy-host-dsh.sh
  - deploy/scripts/deploy-tracy-stack.sh
  - scripts/build-dsh.mjs
  - packages/cms/tracy-seeder/scripts/build.mjs
  - packages/fleet/tracy-fleet-operation/test/dsh-image-context.test.mjs
  - packages/fleet/tracy-fleet-operation/test/dsh-image-inputs.test.mjs
  - packages/fleet/tracy-fleet-operation/test/deploy-same-tag.test.mjs
  - scripts/test/image-context.test.mjs
  - scripts/check-infra-contracts.ts
  - packages/fleet/tracy-fleet-operation/dsh/Dockerfile
  - .github/workflows/tracy-ci.yml
  - scripts/check-all.ts
---

# Build only on change — and never skip a needed build

Changed 15/09/2026 (Lucas). A push into `develop` or `main` runs two image workflows. Each image
is **rebuilt exactly when what goes into it changes**, and redeploying an unchanged image **does nothing
to the host**. This document says where that rule lives, which measurement it rests on, and which tests hold it.

## 1. Why — measurements of 06–15/09

Taken from 769 CI runs (`gh run list` + each step's log):

| | Measurement |
|---|---|
| `build-dsh-image`: runs where `build` actually ran | 161 |
| … of which the Dockerfile **copied nothing that had changed** | **97 (60 %)** — ~421 runner minutes, 61 dsh restarts on the dev machine, 6 on production |
| The slowest step of `build-app-images` | `Install` (building dsh's 410 packages) — median 67 s, p90 400 s |
| dsh's "Stage the CMS seeder" step | median 83 s, p90 290 s — mostly rebuilding dsh outside Docker |
| dsh builds losing their cache from the 3rd step on | yes (run `34940884639`: 11/81 layers cached) — the cache was pruned |

And the opposite direction — **a needed build that did not happen** — has no number because it is silent. Measured on 15/09, there were
three real holes:

1. `build-app-images.yml` ran by a **`paths:` allowlist**. The two SPAs the web image copies are built
   from `@tracy/ui`, `@tracy/core`, `@tracy/i18n`, `packages/design/tracy-design-inspiration` (relative
   imports), `scripts/lib` and two `vendor/` trees — **none of them on the list**.
2. `dsh-image-context.sh` declared the seeder as built from **four** inputs; the real build reads **eight**
   (`tracy-wordpress-quickstart/contracts`, `tracy-cms-sections`, three modules of
   `tracy-design-inspiration`, `scripts/lib/od-slot*.mjs`, `od-brand-engine/dist`,
   `tracy-joomla-quickstart/language-packs.json`, plus bundled npm dependencies).
3. `build-dsh-image.yml` skipped `scripts/**` in `paths-ignore` — so editing `scripts/lib` meant
   the dsh workflow **did not run**.

## 2. The rules, per image

### tracy-dsh — a fingerprint from git, the seeder's inputs PROVEN

- `decide` (~30 s, installs nothing) runs `dsh-image-context.sh`: the git object ids of every `COPY` source
  in the Dockerfile, plus the inputs of the `dsh/cms` build output. If the registry already has `tracy-dsh:ctx-…`,
  **no build**.
- The seeder's input list **does not trust memory**: `dsh-image-inputs.test.mjs` runs the real seeder
  build, records every path it reads (`fs` calls + the esbuild metafile), and goes red if any path is outside
  the list. Adding an import to the seeder without declaring it → the PR is red.
- `paths-ignore` is now only a cheap outer filter; a line missing there costs a `decide` job, not
  a skipped image.

### tracy-web + tracy-host — a CONTENT fingerprint after the build

- The workflow runs on every push except docs/tasks/workers/other workflows (`paths-ignore`).
- It builds the two SPAs + the `/ops/cms` snapshot **first**, then `scripts/ci/image-context.mjs` hashes:
  git-tracked `COPY` sources (object ids) + **the content** of the three built directories. Two fields that change on every
  build are dropped at **the exact JSON path**, not by key name:
  the design page's `data/manifest.json .builtAt` (measured: two consecutive builds differed only in this field
  across 2753 files) and the snapshot's provenance (`source.sha/shortSha/committedAt/generatedAt`,
  the index's `generatedAt` + `environments[].sha/digest/bytes`).
- Each image: the registry has `<image>:<ctx>` → reuse it; it does not → build + push. Then
  `imagetools create` adds the deploy tag `app-<12 hex>` (changing exactly when one of the two ctxs changes), the
  date-commit tag and `latest` onto the same manifest — no layer moves.
- ⚠ The price, stated plainly: the snapshot in a running image records the commit its CONTENT was read from,
  which may be older than the branch head when what the snapshot reads did not change.

### Redeploying the same tag

- `deploy-host-dsh.sh`: the tag in the env file = the requested tag, the running **image ID** = the image just pulled,
  and the compose **config hash** of every service matches the label on the container, and the containers are healthy →
  exit 0 **before** draining (up to 20 minutes waiting for customer imports), seeding and `up`. Any doubt
  (a tag re-pushed with different bytes, `host-dsh.yml` changed, a container missing, a compose error) → full deploy.
- Both scripts: `write_tag` does **not** turn the running tag into its own `…_PREVIOUS` — before
  15/09 a redeploy of the same tag wiped out the rollback target.

### The speed of builds that DO need to run

- `node scripts/build-dsh.mjs --skip-if-built` replaces `pnpm dsh:build` in both image workflows
  (Tracy CI already used it): dsh is only rebuilt when the submodule, Node or the script changes.
- The CI machine: BuildKit GC `defaultKeepStorage: 100GB` in `/etc/docker/daemon.json`
  (**lives only on the host**). The four heavy runners share one daemon, so the previous run's cache is usable
  by every runner. The cache is not pushed to GHCR: `mode=max` of the dsh build stage weighs several GB, and
  private packages of a free org have a storage quota.

### Two traps that only show on a real push (measured 15/09, `tasks/thu-build-chi-khi-doi.md`)

- **A shallow checkout**: `tracy-design-page/scripts/build-assets.mjs` stamps the library commit with
  `git log -1 -- <library>`, and on a depth-1 checkout that stamp is HEAD → `dist` differs on every commit → web
  rebuilt + restarted for nothing. The app build job now uses `fetch-depth: 0`, no `--depth=1` in the snapshot step, and is
  **red** if the checkout is shallow.
- **The length of `%h`**: it depends on each clone's object count — `1d7f861f9` on one runner, `1d7f861f` on another.
  The stamp is `%H` cut to 12. The same trap as the image tag's `--short=8`.

The general lesson for every build output whose fingerprint hashes content: **everything a build reads from git
or from the clock must be fixed**. Two consecutive builds on the SAME commit are not enough to see it —
it takes two commits, on two runners.

### Layers of the dsh Dockerfile — when a build must run, it runs as little as possible (16/09)

Measured on an idle CI machine, `rebuild=true`, warm cache, each run on a branch differing from the main branch by exactly one
never-built line — the "Build the image" step:

| Change | Before | After | Why |
|---|---|---|---|
| One line in a plugin (`tracy-add-site/lib/client.js`) | 83 s | **34 s** | `/opt/dsh` (1.6 GB, 69,866 files) is no longer re-hashed: its `.map`-deleting step moved into the `dsh` stage, the runtime does `COPY --from=dsh` — before, 42 silent seconds between two stages |
| One line of `dsh-passwords` code | ~118 s (and it dragged `dsh-better-sidebar` into a rebuild) | **44 s** | forks are separate stages; dependency installs from manifests are reused |
| One line of `dsh-better-sidebar` code | ~120 s | **60 s** | as above; the rest is its own `tsc` + `tsdown` |

Two dead ends tried and measured, recorded so nobody tries them again:
- **Only splitting off the dependency-install layer, pruning inside the build RUN**: `npm prune --omit=dev` deleting 432 packages sitting in a lower layer
  took 105–134 s (overlayfs copy-up/whiteout per file) — worse than the original.
- **A bare `pnpm rebuild`** in the install layer: rebuilds the root package too, runs `prepare` (tsdown) before
  `src/` exists, dies with `No input files`.

Three rules, and the `infra-contracts` gate (`checkDshDockerfile` in `scripts/check-infra-contracts.ts`) holds all three; before 29/09/2026 it was `dsh-dockerfile-layers.test.mjs` (green 11/11 on the new Dockerfile, red 11/11 on the old):

1. **No command after the `dsh` stage writes into `/opt/dsh`.** An `rm`/`find -delete`/`chmod` there makes
   `/opt/dsh` a new snapshot with the same bytes, and every plugin change pays 40+ s of re-hashing.
2. **Each fork has four stages from `tools`**: `-deps` (full install from manifests), `-build` (source + build),
   `-prod` (production install from manifests), and an assembling stage; `build` copies the products in. No fork
   is based on `dsh` (none reads `/opt/dsh`), so changing the submodule does not rebuild forks, and the two forks build
   in parallel.
3. **No stage deletes what an earlier layer installed** (`npm prune`, `rm -rf node_modules`) — and
   `--ignore-scripts` on every install, `rebuild` BY NAME for dependencies that need scripts.

### Tracy CI — three parallel jobs (16/09)

Measured on 4 green runs before the change: the build check step ~193 s, of which `tests` ~79 s, `lint` ~48 s, the other 33 gates
~65 s, run sequentially. Now `tracy-ci.yml` is a 3-job matrix on 3 runners: `--only lint`,
`--only tests`, and `--skip lint --skip tests` for the rest — **written with `--skip`, not as a
list**, so a new gate added to `check-all.ts` falls into the third job by itself. `check-all.ts` refuses
mistyped names in both `--only` and `--skip`, and refuses both flags at once.

Measured on an idle machine (PR #104): wall time **2′42**, versus ~3′50–4′ for one job. ⚠ Not half:
the three jobs compete for 6 cores of the SAME CI machine, so each group runs slower than alone (`tests`
106 s versus 79 s, `lint` 78 s versus 48 s), and each job pays an extra ~40 s of checkout + install. The real gain is
~30 %. Going further needs more CPU (a second CI machine), not finer splitting.

## 3. The cases, and the test holding each

| Case (from history) | Must | Test |
|---|---|---|
| Editing `dsh/deploy-host-dsh.sh`, `host-dsh.yml`, Storybook, docs, `apps/` | dsh does **not** build | `dsh-image-context.test.mjs` |
| Editing `lib/client.js`, a README in a plugin, a vendored fork, the entrypoint, the Dockerfile, `.dockerignore`, a submodule bump | dsh builds | as above |
| Editing Joomla/WordPress contracts, `quickstarts.json`, the seeder, `cms-sections`, `scripts/lib`, the lockfile | dsh builds | as above + `dsh-image-inputs.test.mjs` |
| The seeder reads one more undeclared path | the PR is red | `dsh-image-inputs.test.mjs` |
| Rebuilding an SPA differing only in `builtAt`; a snapshot changing the branch head with the same content | web does **not** build | `image-context.test.mjs` |
| A `@tracy/ui` change reaching dist; a new file in dist; snapshot content changed; a field named `sha` inside the content | web builds | as above |
| Editing a fleet script → host only; editing `design-templates.json` → both | the right images | as above |
| Build output missing / an undeclared `COPY` path | exit 2, naming the command | both test files |
| Redeploying the same tag, nothing changed | no drain/seed/up, `PREVIOUS` kept | `deploy-same-tag.test.mjs` |
| The same tag but new bytes / compose changed / a container missing / unhealthy | full deploy | as above |

Running locally:

```bash
node --test scripts/test/image-context.test.mjs \
  packages/fleet/tracy-fleet-operation/test/dsh-image-context.test.mjs \
  packages/fleet/tracy-fleet-operation/test/dsh-image-inputs.test.mjs \
  packages/fleet/tracy-fleet-operation/test/deploy-same-tag.test.mjs
```

Asking "will this push rebuild dsh" for any commit:

```bash
CTX_REF=<commit> packages/fleet/tracy-fleet-operation/scripts/tools/dsh-image-context.sh
```
