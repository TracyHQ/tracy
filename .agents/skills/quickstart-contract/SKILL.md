---
name: quickstart-contract
description: Make the content contract for the quickstart of a JA Joomla T3/T4 template, from packing to release. Use whenever you pack or release a JA Joomla T3/T4 template, and when a released template has no contract yet. NOT for WordPress, Gavick, templates with content in several languages, changing a customer site (`modify-site`), or building a new site.
---

# Content contract for the quickstart of a JA Joomla T3/T4 template

The contract is three files `manifest.json` · `content-map.json` · `presentation-lock.json` in
`packages/cms/tracy-joomla-quickstart/contracts/<slug>/j6/<version>/` of `tch`, copied byte for byte into
the Claude Cowork plugin. It is **advice** that helps the site's agent keep the design, not a lock
([ADR 0022](../../../docs/adr/0022-quickstart-contract-is-advice.md)). The GitHub release is the
source of truth for the quickstart ([ADR 0017](../../../docs/adr/0017-github-release-is-quickstart-source-of-truth.md)).

Four stages, in exactly this order — a pack never reaches customers before its contract is on Tracy:

- **Section 5 — packing**: use the tracy-dev command `"$TD"` (section 3b); do not open a `tracy-dev:*` skill.
- **Section 7 — capture the contract from that very pack + check it + place the contract locally** (not yet
  committed) + a trial bind on a site built locally (K6 pass 1). Before this section: local Tracy can create a
  site from the pack (section 6).
- **Section 8 — ship the contract**: `tch` PR + a Claude Cowork plugin version carrying the contract + **upload the
  files** (the pack files except the switch) + Tracy pins it.
- **Section 9 — release the pack**: **flip the switch** `tracy_setting.json`, check the release again, create a site
  as a customer would on **Tracy dev** (`cowork.tracy.site`, the shared Tracy) (K6 pass 2).

🔒 **Every commit, push, PR, merge, plugin release, file upload and switch flip is a STOP POINT**: say which
step you are at and what needs doing, then wait for the requester's go (table in section 10). Taking it to
production (`develop` → `main`) is not part of this skill.

🔒 **Never print secrets**: Cowork token, admin password, `.env` contents. Report by variable name or
`[redacted]`. Files holding a token are created under `umask 077` and deleted when done (section 11).

🔒 **`umask 077` wraps only the command that CREATES a log/token file, never `restore`, `quickstart` or a site
build command** (12/10/2026). Write `(umask 077; : > "$LOG"); "$TD" restore … > "$LOG" 2>&1`: the empty log file is
created at 0600, then the command runs under the normal umask and writes into the existing file (which stays 0600).
Wrapping the whole `restore` in `(umask 077; …)` extracts every site file at 0600/0700, `quickstart` packs them as
they are, and provisioning (`tar -xm`, keeps modes) builds a site that the web server/wp-cli cannot read: 8 WordPress
packs and 6 Joomla packs broke exactly this way on 12/10
(*"Pass --path … or run wp core download"*). A finished pack must pass the mode check of section 5 (`packing.md` step 5);
TCH's `contracts` gate and the upload script also refuse such a pack.

## 1. Scope — when to use

- **One** JA Joomla **T3 or T4** template per run. The `framework` field in `site.json` of the site built
  from the template (full path: section 5, `references/packing.md` step 1; direct-capture path: section 6 step 4)
  must be `t3` or `t4`; otherwise →
  stop, tell the requester.
- **Single-language content.** Several languages → stop, tell the requester. Detect it on the inventory
  of the first site built (full path: section 5, `references/packing.md` step 2; direct-capture path: section 6 step 4,
  before `tch local`): the `language` column of `modules` (`client_id=0`), `content`, `categories`, `menu`
  (`client_id=0`) has **more than one** value other than `*` → several languages. Counting command: as soon as the
  inventory `"$WORK/inventory-first.json"` exists, run the command in [`references/language-count.md`](references/language-count.md).

- **Out of scope for this skill:** WordPress, Gavick, changing a customer site (`modify-site`), building a new site, production.

## 2. Choose the path (do this before anything else)

Before reading the release: do **section 3a** (shared variables, tools, the `joomlart-products` worktree, `PRODUCT`).
Per-version variables — **section 3b** (`VER`, `CID`, `PACK`, `PACK_SHA`) — are set right after choosing the path here.

Read the currently released version:

```bash
REL_SETTING="$WORK/release-now/tracy_setting.json"
gh release download "$REL" -R JoomlArt-Products/joomlart-products -p tracy_setting.json -D "$WORK/release-now" --clobber
node -p 'const s = require(process.argv[1]); JSON.stringify({ version: s.version, install: Object.keys(s.install || {}) })' "$REL_SETTING"
```

Follow the first matching row:

| Situation | Path |
|---|---|
| The requester has **changed the template** (template code / content differs from the released version, apart from agent docs) | **Stop, tell the requester** — the skill only repacks the released version |
| `tch` already has a contract for the release's version (check below) | **Do nothing** — tell the requester |
| The release is an **installer** (`install` has `installer`) | **Full**, new pack: `VER` = released version + 1 patch (e.g. 1.0.0 → 1.0.1); `tch` already has a contract for that version (check below) → **stop, tell the requester** (a previous run may not have finished) |
| The release is a **snapshot pack** (`install` has `webroot` + `database`) and its agent docs are complete (below) | **Direct capture** |
| Snapshot pack but agent docs are missing | **Full**, new pack with agent docs: `VER` = released version + 1 patch (precedent: JA Space 1.0.1 lacked the `mod_ja_acm` docs → new pack 1.0.2); `tch` already has a contract for that version (check below) → **stop, tell the requester** (a previous run may not have finished) |

Take the pack file names exactly from `install` of `tracy_setting.json` — the release still holds files of older
versions, so downloading by the pattern `*-webroot-*` picks up the wrong ones:

```bash
REL_WEBROOT=$(node -p 'require(process.argv[1]).install.webroot?.file ?? ""' "$REL_SETTING")
REL_DATABASE=$(node -p 'require(process.argv[1]).install.database?.file ?? ""' "$REL_SETTING")
```

Check whether `tch` already has a contract — on the checkout `"$TCH_HOME"` (section 3a), latest `origin/develop`,
in exactly the folder section 7 step 5 places the contract in; one line printed = it exists:

```bash
git -C "$TCH_HOME" fetch origin
git -C "$TCH_HOME" ls-tree -d origin/develop "packages/cms/tracy-joomla-quickstart/contracts/$SLUG/j6/<release version>"
```

Rows that produce a new pack (installer; snapshot pack missing agent docs): run the `ls-tree` command again with
`<release version + 1 patch>`.

Check the agent docs of a snapshot pack (in the `joomlart-products` worktree at latest `main` — section 3a; the checker
compares against the clone's **working tree**):

```bash
gh release download "$REL" -R JoomlArt-Products/joomlart-products -p "$REL_WEBROOT" -D "$WORK/release-now" --clobber
cd "$JAP" && ruby tools/quickstart_docs.rb check "$PRODUCT" "$WORK/release-now/$REL_WEBROOT"
```

Exit 0 → complete. Exit 1 → "missing": the pack lacks the agent docs of **any part** whose source in
`joomlart-products` has docs (template, blocks such as `mod_ja_acm`, framework, plugin) — exactly the scope the `check` command reports.

After choosing the path: set section 3b. Full path: `VER` per the chosen row. Direct-capture path: `VER` = the
release's version (`VER=$(node -p 'require(process.argv[1]).version' "$REL_SETTING")`).

### Which path does which section

**Single run or batch** sits on top of the chosen path: a batch does sections 1–7 along the template's path (full or
direct capture), then stops the outward-facing part (sections 8–9 follow the batch schedule); sections 10–12 still apply.

| Section | Full | Direct capture | Batch |
|---|---|---|---|
| 1–4 | do | do | do |
| 5 — packing | do — [`references/packing.md`](references/packing.md) | **skip** — take the release's pack (below) | per the template's path |
| 6 — local Tracy | do | do; `restore` by tag only to get a site carrying the tag (step 4) — first site: set `FW`, inventory + multi-language test at step 4, before `tch local` | do |
| 7 — capture, check, trial bind | do; K2+K3 `--pack` | do; verify site built with `restore --from` (step 2); K2+K3 one pass only, against the release (`--release`) | do; plugin floor version (`COWORK_VER`) = the batch's combined version; **stop after section 7** |
| 8 — ship | do, with file upload | do, **no file upload** | per the batch schedule |
| 9 — release | steps 1–5 | **skip steps 1–4** (no release); **still do step 5** (K6 pass 2, after Tracy dev has pinned) | per the batch schedule (including K6 pass 2) |
| 10–12 | do | do | do |

Where to stop: every stop point in the section 10 table; the "do nothing" path stops right at section 2.

Copy your path's checklist into your answer and tick it off as you go:

```text
Full path
- [ ] Sections 2–3: path + reason; variables 3a, 3b; worktree; tracy-dev 0.7.2 (or 0.7.1 with the mode check), `doctor` not red
- [ ] Section 5: pack frozen (`"$PACK"` + `"$PACK_SHA"`)
- [ ] Section 6: local Tracy creates a site from the pack; trial site + local release deleted; `.env` restored
- [ ] Section 7: K1, K7, K4, K2+K3 `--pack`, K5, K6 pass 1, K8 (loop 7b down to exit 0, before the PR); contract placed locally
- [ ] Section 8: `tch` PR · plugin version · file upload · Tracy pin · PR into `develop` (each stop point with a go)
- [ ] Section 9: flip the switch · K2+K3 pass 2 · `joomlart-products` PR (when `github_release_url` still points at the installer) · K6 pass 2
- [ ] Sections 11–12: clean up, run report

Direct-capture path
- [ ] Sections 2–3: path + reason; variables 3a, 3b; worktree; tracy-dev 0.7.2 (or 0.7.1 with the mode check), `doctor` not red; release pack downloaded, sha OK, frozen
- [ ] Section 6: as the full path (tag-carrying site built by tag; on that site: `FW`, inventory, multi-language test)
- [ ] Section 7: K1, K7, K4, K2+K3 `--release`, K5, K6 pass 1, K8 (loop 7b down to exit 0, before the PR); contract placed locally
- [ ] Section 8: `tch` PR · plugin version · Tracy pin · PR into `develop` (no file upload)
- [ ] Section 9 step 5: K6 pass 2
- [ ] Sections 11–12: clean up, run report

Batch
- [ ] Sections 2–7 along the template's path; `COWORK_VER` = the batch's combined version
- [ ] Stop after section 7; sections 8–9 follow the batch schedule
- [ ] Sections 11–12: clean up, run report
```

**Direct-capture path — take the release's pack:** once section 3b is set, open
[`references/direct-capture.md`](references/direct-capture.md) — download the release's pack files,
check sha, freeze them as `"$PACK"` for every later step; then come back and finish section 3b from the tracy-dev paragraph.

## 3. Prepare the machine

### 3a. Before section 2

Shared variables, declared once (lines with `<…>` are for the person running it to fill in):

```bash
SLUG=<template name, e.g. ja-spa>   # template name in the release tag: quickstart/<SLUG>/j6
TPL=<template folder, e.g. ja_spa> # the template's templates/<TPL> folder
REL="quickstart/$SLUG/j6"
SITE="$SLUG-j6"             # name of the tracy-dev site built from the release
SITES="$HOME/tracy-sites"
WORK=<working folder — outside every repo; the requester says where>
QC=<folder holding this SKILL.md>/scripts
TCH_HOME=<main tch checkout on the machine>            # only to cut worktrees
CW_HOME=<main claude-cowork checkout on the machine>
JAP_HOME=<main joomlart-products checkout on the machine>
TCH_WT=<new tch worktree>  CW_WT=<new claude-cowork worktree>  JAP=<new joomlart-products worktree>
export TRACY_DEV_TCH=<tch checkout running the local Tracy>
```

Tools: DDEV (`ddev version`), Homebrew PHP (`php -v`), `gh` (`gh auth status`), Node, Python 3, Docker.
Ruby must be able to run `quickstart_docs.rb`: Ruby 2.6 lacks `Array#filter_map`; Ruby 3.4 needs REXML —
if `ruby -e 'require "rexml/document"'` fails, `gem install rexml --install-dir "$WORK/ruby-gems"` and
run the checker with `GEM_PATH="$WORK/ruby-gems:$(gem env gempath)"`.

The `joomlart-products` worktree at latest `main`, detached — the template's own branch (its name carries `VER`) is
created in section 9 step 4, before the first file edit:

```bash
git -C "$JAP_HOME" fetch origin
git -C "$JAP_HOME" worktree add --detach "$JAP" origin/main
```

Product id for `quickstart_docs.rb`:
`grep -l "quickstart/$SLUG/j6/" -r "$JAP/products" --include=product.yaml` → `PRODUCT` = the `id:` line of that file.

### 3b. After choosing the path (section 2)

```bash
VER=<contract version — per the row chosen in section 2>
CID="$SLUG/j6/$VER"
PACK="$WORK/pack-$VER"      # frozen pack; every later step reads from here
PACK_SHA="$WORK/pack-$VER.sha256"
```

`FW` (`t3` / `t4`, the `framework` field in `site.json`) is set once the first site exists: full path in
`references/packing.md` step 1; direct-capture path in section 6 step 4.

tracy-dev: `ls ~/.claude*/plugins/cache/tracy-template-dev/tracy-dev/*/bin/tracy-dev` (each machine installs it in a
different place; the folder right above `bin/` is the version). Accept version **0.7.2** (preferred: `restore` and packing
normalise webroot modes to 0644/0755 themselves, and packing refuses a pack with wrong modes — TracyHQ/tracy-template-dev#2). Only **0.7.1** →
usable, but every pack must pass the mode check by hand: `node "$TCH_WT/scripts/check-pack-modes.mjs" "$PACK"`
→ exit 0 (the full path already has it at `references/packing.md` step 5; the direct-capture path runs it as soon as the pack is frozen).
A version other than 0.7.2 / 0.7.1 → the workarounds in section 4 may no longer hold → stop, tell the requester. Several paths
for the same version → compare sha between them
(`cd <version folder> && shasum -a 256 bin/tracy-dev lib/*.mjs | shasum -a 256`): same → use the first path,
record the path used in the report; different → stop, tell the requester. → `TD=<that path>` ·
`TDP="$(dirname "$(dirname "$TD")")"`. `"$TD" doctor` → no red item.

Worktrees, own branches, never work on the main checkout:

```bash
git -C "$TCH_HOME" fetch origin
git -C "$TCH_HOME" worktree add -b "feat/$SLUG-contract-profile" "$TCH_WT" origin/develop
git -C "$CW_HOME" fetch origin --tags
COWORK_TAG=$(git -C "$CW_HOME" tag -l 'joomla-v*' --sort=-v:refname | head -1)
git -C "$CW_HOME" worktree add -b "feat/$SLUG-contract-profile" "$CW_WT" "$COWORK_TAG"
```

Bootstrap `tch` (the capture tool calls `biome`): read
[`docs/references/ha-tang-bi-mat-deploy.md`](../../../docs/references/ha-tang-bi-mat-deploy.md) first,
then in `"$TCH_WT"`: `git submodule update --init && pnpm dsh:build && CI=true pnpm install` (`CI=true`
because pnpm refuses without a TTY; it skips installing the `pre-push` hook — install it before pushing).

The capture tool must be a version with the empty / duplicate guards (PR #691):
`git -C "$TCH_WT" merge-base --is-ancestor 4560042bf HEAD` → exit 0; otherwise → stop, report.

The working folder and the run report (section 12) live outside every repo.

## 4. Working around tracy-dev 0.7.2 (and 0.7.1)

0.7.2 only adds mode normalisation (`lib/webroot-modes.mjs`, called in the Joomla and WordPress adapters); `bin/`,
`cli.mjs`, `releases.mjs` and the `tch` commands are unchanged from 0.7.1 (checked against diff `cb9cd94..488ef39` on 12/10/2026),
so every workaround below holds for both versions.

- Call `"$TD" <command>` directly — it is a shell script; `node "$TD"` is a syntax error.
- `restore` by tag reads `tracy_setting.json` in `~/.tracy-dev/cache` → may produce an **old version**. Always rebuild
  a site from the pack with `"$TD" restore --from "$PACK" --name <name> --force`, not by tag.
- `"$TD" tch …` cannot find a `tch` checkout in an unusual path by itself → `export TRACY_DEV_TCH=…` (section 3).
- `"$TD" tch status` reads `WEB_PORT` from `deploy/.env` including a trailing comment → reports `up: false` even though Tracy
  is running. The workaround is in section 6: back up + sha, edit **exactly one line**, restore it exactly, delete the backup
  once the sha matches.
- `"$TD" tch teardown` sends `DELETE` without `Content-Type: application/json` → Tracy answers 415 yet the command
  still exits 0. Delete the trial site through the API (section 6 step 6), then check the site is gone.
- Do not trust what `"$TD" tch up` prints: check yourself that Tracy answers over HTTP.
- **Do not trust exit code 0** — `quickstart` exits 0 even when the summary line starts with `✘`. Always read the detailed
  result: `VERIFICATION.json` `ok`, the JSON of `check` / `tch create` / `tch local`.
- Do not call `"$TD" <command> --help`: only `"$TD" help` prints help; `--help` after a command name still runs the command.

## 5. Packing (full path only)

Full path, right after section 4: open [`references/packing.md`](references/packing.md) and do all 9 steps
in it (restore the released version, early inventory, `check` + `package`, copy agent docs,
`quickstart`, check the pack, freeze). Done when the pack is frozen (`"$PACK"` + `"$PACK_SHA"`) — from then on
**never repack**. Direct-capture path: skip this section, the pack was taken in section 2.

## 6. Check that local Tracy creates a site from the pack (both paths)

There is only one local Tracy: two sessions running in parallel take turns on this step.

1. Back up `.env` (record only the sha, never print its contents):
   `ENV="$TRACY_DEV_TCH/deploy/.env"; ENV_BAK="$ENV.bak-$(date +%y%m%d-%H%M)"; cp -p "$ENV" "$ENV_BAK"; ENV_SHA=$(shasum -a 256 "$ENV" | cut -d' ' -f1)`.
2. `"$TD" tch status`. `up: false` while `curl -s -o /dev/null -w '%{http_code}' http://tracy.test:51710/api/templates`
   = 200 (port = `WEB_PORT` in `.env`, default 51710) → the trailing-comment trap on `WEB_PORT`. Fix exactly that line:
   `sed -i '' -E 's/^(WEB_PORT=[0-9]+)[[:space:]]+#.*$/\1/' "$ENV"` →
   `diff "$ENV_BAK" "$ENV" | grep -c '^[<>]'` = `2`, both lines starting with `WEB_PORT=` (otherwise →
   `cp -p "$ENV_BAK" "$ENV"`, stop) → `"$TD" tch status` must say `up: true`; if not → stop. Tracy does not answer
   HTTP → stop, report (never start another session's Tracy yourself).
3. `grep -cE '^TRACY_LOCAL_RELEASES_DIR=[^#]*#' "$ENV"` → `0`; otherwise → stop.
4. A site carrying the right tag: the full path uses `"$SITE"` (section 5, built by tag). Direct-capture path:
   `(umask 077; : > "$WORK/b6-restore.log"); "$TD" restore "$SLUG" j6 > "$WORK/b6-restore.log" 2>&1` only to get a site carrying the tag `"$REL"` —
   a site built with `--from` carries the tag `local:…`, which gives the wrong card name; the pack still comes from `--pack`. This site is the
   first site of the direct-capture path → right after the build command, **before** `tch local`: check site version = `"$VER"`, set
   `FW`, inventory + multi-language test per [`references/direct-capture.md`](references/direct-capture.md) section
   "First site".

   ```bash
   "$TD" tch local "$SITE" --pack "$PACK" > "$WORK/b6-local.json"
   node -p 'const r = require(process.argv[1]); JSON.stringify({ offered: r.offered, dest: r.dest, problem: r.problem })' "$WORK/b6-local.json"
   ```

   Pass: `offered: true`. `dest` is the local release folder this command just created (step 6 deletes exactly it).
5. `"$TD" tch create "$SLUG" j6 --local` (wait up to 15 minutes) → JSON `"ok": true` (the new site's home page 200,
   using `templates/$TPL/`). `"ok": false` → record `problem` verbatim → stop. **T3 template:** this is point (a) —
   fail → stop, report.
6. Clean up the trial site through the API (`LABEL` = the label in the JSON of `tch create`): run the command block in
   [`references/delete-trial-site-via-api.md`](references/delete-trial-site-via-api.md).
   Pass: `status` 200, `response.host` true, `present` false. Then delete **exactly** the folder `tch local` created
   (`dest` from step 4; tracy-dev has no delete command) — do not delete the parent folder `$SLUG/`, which may still hold
   local releases of other CMSs:

   ```bash
   LOCAL_DEST=$(node -p 'require(process.argv[1]).dest' "$WORK/b6-local.json")
   cmp "$LOCAL_DEST/tracy_setting.json" "$PACK/tracy_setting.json" && rm -rf "$LOCAL_DEST"
   "$TD" tch refresh
   ```

   `cmp` reports a difference or a missing file → that folder does not belong to this run: do not delete, stop, report.
7. Restore `.env`: `shasum -a 256 "$ENV"` ≠ `"$ENV_SHA"` → `cp -p "$ENV_BAK" "$ENV"` → the sha must equal
   `"$ENV_SHA"` (if not → stop). Sha matches → delete `"$ENV_BAK"` (a file holding secrets).

## 7. Capture, check, place the contract locally, trial bind

Capture tool: `"$TCH_WT/packages/cms/tracy-joomla-quickstart/scripts/capture-contract.py"`, run from the root of
`"$TCH_WT"` (it calls `pnpm exec biome format`). It stops by itself at K1 and K7 (table below). The tool stops →
**stop, report each case to the requester** (which entry, which duplicate rows); do not fix it yourself.

Checks K1–K8 (K6 runs two passes; K2+K3 two passes on the full path, one `--release` pass on the direct-capture
path):

| K | What it checks | Section | Tool | Pass means |
|---|---|---|---|---|
| K1 | the capture is not empty: 0 entries / 0 slots / 0 pages | 7 step 4 | the capture tool stops by itself | the tool does not stop (stop = exit 1, message on stderr, no file written) |
| K2+K3 | the release version and name the contract records match the pack (pass 1) / the release (pass 2) | 7 step 4 (pass 1); 9 step 3 (pass 2) | `check-release-fields.mjs` `--pack` / `--release` | exit 0; red (exit 1) → stop, report |
| K4 | two capture passes are identical byte for byte | 7 step 4 | `diff -r` | empty |
| K5 | the `tch` profile ↔ the `claude-cowork` profile identical byte for byte | 7 step 5 | `diff -r` | empty |
| K6 | edit one slot, the new text shows on the page | 7 step 6 (pass 1); 9 step 5 (pass 2) | `k6-edit-one-slot.mjs` (pass 1); **Add site** on Tracy dev (pass 2) | pass 1: `ok: true` (all conditions in step 6); pass 2: one slot editable through chat, after deletion the host answers 404 |
| K7 | one entry matches more than exactly one row across the whole table (duplicate) | 7 step 4 | the capture tool stops by itself | as K1 |
| K8 | the contract declares all text, images and demo links a customer sees (content coverage) + the page leaks no language constants, PHP errors or unfilled tokens (page hygiene) | 7 step 7 | `content-coverage/cli.mjs --write` | exit 0; exit 1 → fix loop section 7b, measure again |

1. Pack files — exactly one webroot, one database, names read from the pack's `tracy_setting.json`:

   ```bash
   PACK_WEBROOT="$PACK/$(node -p 'require(process.argv[1]).install.webroot.file' "$PACK/tracy_setting.json")"
   PACK_DATABASE="$PACK/$(node -p 'require(process.argv[1]).install.database.file' "$PACK/tracy_setting.json")"
   ls -l "$PACK_WEBROOT" "$PACK_DATABASE"
   mkdir -p "$WORK/chup/webroot" && tar -xzf "$PACK_WEBROOT" -C "$WORK/chup/webroot"
   ```

2. Inventory from a site built from the pack, with the pack's DB reloaded. Full path: the verify site `"$SITE-verify"`
   (from `--keep-verify`). Direct-capture path:
   `(umask 077; : > "$WORK/b7-restore.log"); "$TD" restore --from "$PACK" --name "$SITE-verify" --force > "$WORK/b7-restore.log" 2>&1`.

   ```bash
   cd "$SITES/$SITE-verify" && ddev import-db --file="$PACK_DATABASE"
   node "$QC/make-ddev-copies.mjs" --tch "$TCH_WT" --site "$SITES/$SITE-verify"
   (cd "$SITES/$SITE-verify" && ddev exec php /var/www/html/dump-inventory-ddev.php) > "$WORK/chup/inventory.json"
   ```

   Needing to copy any other Tracy tool besides the two copies made by `make-ddev-copies.mjs` → **stop,
   present it to the requester**.
3. Capture parameters, each with a query that proves it (record both the query and the result in the report):

   ```bash
   INV="$WORK/chup/inventory.json"
   node -e 'const i = require(process.argv[1]); console.log(i.template_styles.filter((r) => r.client_id === "0").map((r) => `${r.id} ${r.template} ${r.title}`).join("\n"))' "$INV"
   node -e 'const i = require(process.argv[1]); const m = {}; for (const r of i.menu) if (r.client_id === "0" && r.menutype) m[r.menutype] = (m[r.menutype] || 0) + 1; console.log(m)' "$INV"
   node -e 'const i = require(process.argv[1]); console.log(i.modules.filter((r) => r.client_id === "0").map((r) => `${r.id} ${r.module} ${r.title}`).join("\n"))' "$INV"
   grep -l "<item" "$WORK/chup/webroot/templates/$TPL"/acm/*/tmpl/*.xml
   ```

   - `--id "$CID"` · `--template "$TPL"` (`ls "$WORK/chup/webroot/templates"`) · `--styles "$TPL"` (only the
     template's own styles).
   - `--menutypes`: every `menutype` of `menu` `client_id=0` (skip the tree-root row with an empty `menutype`), comma-joined:
     ``MENUTYPES=$(node -p 'const i = require(process.argv[1]); [...new Set(i.menu.filter((r) => r.client_id === "0" && r.menutype).map((r) => r.menutype))].join(",")' "$INV")``.
   - `--module-prefix`: by the titles of `client_id=0` modules. Trial-capture into `"$WORK/chup/prefix-<name>/"` with
     `""`, `"[Tracy"` and a common prefix if the titles have one; if they differ only in content modules → pick the one that yields
     the most slots; if they differ in a non-content module (menu, login, search, breadcrumbs…) → stop, report.
     The person running it fills in the chosen value: `MODULE_PREFIX=<chosen prefix, may be empty "">`.
   - `--list-items` when the `grep` above has output:
     `LIST_ITEMS=(); grep -q "<item" "$WORK/chup/webroot/templates/$TPL"/acm/*/tmpl/*.xml 2>/dev/null && LIST_ITEMS=(--list-items)`.
     This flag also captures each row label of a `jatable` table (pricing table: `data[row][0]`), so a template with a pricing table always needs it.
   - `--exclude-generated` always (T4 generates `media/t4/optimize/…`; T3 generates `t3-assets/` outside the file roots).
   - `--link-fields-by-role` always: numbered ACM link fields (`btn-link-2`, `btn-link1`, `member-link3`) become
     `url` slots by field name, even when the demo value is `#` or empty (without the flag the second button has no target, PAGE-5).
   - `--evidence-by-field` always (#1326): fact slots (`stat-value`, `value`, `city`, `addr`, `quote`, `name`,
     `client-name`, `price`… per `apps/tracy-web/src/lib/fact-fields.json`) ask for evidence whatever the module is called —
     "Home - Stats" does not match `Statistics`, a hero has four counters. Without the flag the `contracts` gate is red for a new profile;
     for an already captured profile run `node scripts/regate-contract.mjs <profile folder>` BEFORE cutting the plugin (after that the bytes are pinned).
   - `--whole-units` always for a new profile (spec #37 C1, C2): a heading, sentence or list item that the HTML helper cuts into
     several text pieces becomes ONE slot on its element, and the rule tables group each link-list item (label and link) into one card.
     Add `--role-vocabulary 3` only with the release that moves the template to `place-content-roles/3` (it writes `article.title`,
     `editorial.navigation_url` and `editorial.illustration`, and derives `customize` from the role); the default stays 2.
   - `--file-roots`: `templates/$TPL` + the template's own framework code (`plugins/system/t4` or
     `plugins/system/t3`) + `modules/mod_ja_acm` + `media`, only folders that actually exist in the pack's webroot:

     ```bash
     ROOTS=$(for d in "templates/$TPL" "plugins/system/$FW" modules/mod_ja_acm media; do [ -d "$WORK/chup/webroot/$d" ] && printf '%s,' "$d"; done); ROOTS=${ROOTS%,}
     ```

   - `--cowork-version "$COWORK_VER"`: the **upcoming** Claude Cowork plugin version — **ask the requester**
     (hint: `"$COWORK_TAG"` + 1 patch, precedent 0.19.0 → 0.19.1). Batch: the batch's combined version. This is a
     floor: Tracy will require a plugin version at least this high.
     The person running it fills in the value the requester gave: `COWORK_VER=<upcoming plugin version>`.
   - `--slots-helper "$CW_WT/joomla/cowork/lib/ContentSlots.php"` · `--manifest "$PACK/manifest.json"`.
4. Capture twice, then check:

   Slot roles (ADR 0038): when a previous version of this template's contract exists, pass its content map as
   `--previous-map` so every slot with an unchanged key and sample keeps its reviewed role and group; the capture
   places the rest with the rule tables and prints the slots it could not place. First capture of a template: no
   `--previous-map`.

   ```bash
   cd "$TCH_WT"
   PREV=(); [ -n "${PREV_MAP:-}" ] && PREV=(--previous-map "$PREV_MAP")   # PREV_MAP = previous version's content-map.json
   for n in 1 2; do
     python3 packages/cms/tracy-joomla-quickstart/scripts/capture-contract.py \
       --webroot "$WORK/chup/webroot" --inventory "$WORK/chup/inventory.json" --manifest "$PACK/manifest.json" \
       --slots-helper "$CW_WT/joomla/cowork/lib/ContentSlots.php" --out "$WORK/chup/capture-$n" \
       --id "$CID" --template "$TPL" --styles "$TPL" --menutypes "$MENUTYPES" --module-prefix "$MODULE_PREFIX" "${LIST_ITEMS[@]}" \
       --exclude-generated --link-fields-by-role --file-roots "$ROOTS" --cowork-version "$COWORK_VER" ${PREV[@]+"${PREV[@]}"} || break
   done
   diff -r "$WORK/chup/capture-1" "$WORK/chup/capture-2"                       # K4: empty
   node "$QC/check-release-fields.mjs" --contract "$WORK/chup/capture-1" --pack "$PACK"   # K2+K3 pass 1
   ```

   Direct-capture path: K2+K3 uses `--release "$REL"` instead of `--pack "$PACK"`. Script red (exit 1) → stop, report.
5. **Place the contract locally** (not yet committed):

   ```bash
   P="$TCH_WT/packages/cms/tracy-joomla-quickstart/contracts/$SLUG/j6"
   mkdir -p "$P/$VER" && cp "$WORK/chup/capture-1"/{manifest,content-map,presentation-lock}.json "$P/$VER/"
   diff -r "$WORK/chup/capture-1" "$P/$VER"                                     # empty
   grep -c "\"$SLUG\"" "$TCH_WT/vendor/tracy/od-design-system/catalog.json"
   ```

   `grep` prints `0` → `"$P/$VER.design.json"` = `{"schemaVersion": "tracy-contract-design/v1", "design": null}`;
   not 0 → stop, tell the requester. A new journal entry
   `"$TCH_WT/tasks/nhat-ky/<YYYY-MM-DD>-$SLUG-contract-profile.md` in the format of `tasks/nhat-ky/README.md`
   (not committed yet → record the branch, no hash); the `Chạm ai:` line states that the plugin floor version is the **upcoming** version.
   Single gates (not the whole test suite):
   `cd "$TCH_WT" && pnpm exec tsx scripts/check-all.ts --only contracts && node --test apps/tracy-web/test/contracts.test.mjs`.

   Generate the showcase map BEFORE copying (`node scripts/build-joomla-showcase-nav.mjs --contract "$CID"`; the
   `joomla-showcase-nav` gate requires it), then copy every `*.json` of the profile to `claude-cowork` (4 files, including
   `showcase-nav-map.json`; not `.design.json`), then K5. Without the map in the plugin a new site reports
   `carries no showcase-navigation map` and keeps the demo menu as is (JA Boxing 1.0.3/1.0.4, 25/10/2026):

   ```bash
   mkdir -p "$CW_WT/joomla/cowork/lib/contracts/$CID" && cp "$P/$VER"/*.json "$CW_WT/joomla/cowork/lib/contracts/$CID/"
   diff -r "$P/$VER" "$CW_WT/joomla/cowork/lib/contracts/$CID"                  # K5: empty
   ```

6. **K6 pass 1** on a site built locally from the pack:

   ```bash
   (umask 077; mkdir -p "$WORK/k6" && : > "$WORK/k6/restore.log" && : > "$WORK/k6/token.txt")   # umask only for these files
   "$TD" restore --from "$PACK" --name "$SITE-k6" --force > "$WORK/k6/restore.log" 2>&1
   (cd "$CW_WT/joomla/cowork" && ./build.sh)
   unzip -p "$CW_WT/joomla/cowork/dist/pkg_claudecowork.zip" packages/com_claudecowork.zip > "$WORK/k6/com.zip"
   unzip -l "$WORK/k6/com.zip" | grep -cE "contracts/$CID/(manifest|content-map|presentation-lock)\.json$"   # 3
   cp "$CW_WT/joomla/cowork/dist/pkg_claudecowork.zip" "$SITES/$SITE-k6/pkg_claudecowork-k6.zip"
   (cd "$SITES/$SITE-k6" && ddev exec "php web/cli/joomla.php extension:install --path=/var/www/html/pkg_claudecowork-k6.zip")
   node "$QC/make-ddev-copies.mjs" --tch "$TCH_WT" --site "$SITES/$SITE-k6"
   (cd "$SITES/$SITE-k6" && ddev exec "TRACY_CONTRACT_ID=$CID TRACY_BUILD_WORKFLOW=contract php /var/www/html/joomla-bootstrap-ddev.php") > "$WORK/k6/token.txt"
   K6_FLAGS=(); [ "$FW" = t3 ] && K6_FLAGS=(--stop-on-warnings)
   node "$QC/k6-edit-one-slot.mjs" --site "$SITES/$SITE-k6" --token-file "$WORK/k6/token.txt" --contract-id "$CID" "${K6_FLAGS[@]}"
   ```

   Pass: the install reports `[OK] Extension installed successfully.`; binding exits 0 (the token lives only in the file, never
   printed); `k6-edit-one-slot.mjs` `ok: true`. **T3 template:** `--stop-on-warnings` makes the script stop right after
   inspect, **before editing any slot**, when the freshly bound site already has design-drift warnings (`inspect.warnings`
   in the JSON, error `… warning(s) right after binding; nothing was applied`) → stop, report — this is point (b).
7. **K8 — content coverage** (a Road to live gate since 24/10/2026: not measured, or holes left without a reason, and
   /ops holds Publish). Measure on the site `"$SITE-verify"` (built from the pack, the pack's DB, Cowork not bound yet), reading
   sources from the pack file itself; the site is only read (the tool blocks every non-GET request):

   ```bash
   VERIFY_URL=$(cd "$SITES/$SITE-verify" && ddev describe -j | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>console.log(JSON.parse(s).raw.primary_url))')
   cd "$TCH_WT" && node packages/cms/tracy-quickstart-tools/content-coverage/cli.mjs \
     --site "$VERIFY_URL" --contract "$P/$VER" \
     --db-dump "$PACK_DATABASE" --webroot "$WORK/chup/webroot" \
     --out "$WORK/coverage" --write --fit
   ```

   `--fit` measures **Slot fit** ([ADR 0039](../../../docs/adr/0039-slot-fit-lives-in-content-map.md)) in the same
   crawl and writes it into `content-map.json` before the coverage file: each picture slot's kind, box per viewport,
   aspect and whether its demo file is transparent, each text slot's characters and lines per viewport. It also sets
   each picture's `customize: "keep"` from its kind (kept: icon, logo, avatar, signature, cut-out, decoration, map;
   replaceable: photo, video still). Never edit `fit` by hand; read the `slotFit` summary in the JSON line (kinds,
   kept count, `cutouts`) and look at any kind that surprises you in the report before committing.
   It writes `content-coverage.json` next to the contract (committed with the contract) and `"$WORK/coverage/report.html"` (screenshots
   with holes circled, **not committed**). The same scan also checks **page hygiene**: raw language
   constants (`TPL_FOLLOW_US`, `COM_FINDER_…` in text or in `aria-label`/`placeholder`/`title`),
   PHP error text (`Deprecated:`/`Warning:`/`Notice:`/`Fatal error` … `on line N`, even hidden), unfilled
   tokens (`{contact.tel}`, JA's `((span))`, an uppercase `TITLE` slipped into a lowercase sentence). Each problem holds Publish like
   a hole, with the same accepted-reason mechanism. Detection patterns live in
   `packages/cms/tracy-quickstart-tools/content-coverage/hygiene-rules.json`, thresholds in
   `apps/tracy-web/src/lib/content-coverage/policy.json` (changed only by a product owner decision).
   Exit 0 = pass. Exit 1 = holes or page problems remain → **section 7b**.
   **You are the label judge** (no model, no key). The audit writes `"$WORK/coverage/label-judge/request.json"` for the
   slots without a cached verdict (`labelJudge.reason` is `AWAITING_AGENT`; no file means nothing to judge):
   1. Read the request top to bottom: the question, the allowed verdicts and roles, the answer format, then per component
      its `crop` (open the image; the slots are numbered on it) and its `slots` table. `alreadyJudged` is context only.
   2. Judge each listed slot by key: `right`, or `wrong` with one `suggestedRole` and a short `why`. Write the answers to
      `"$WORK/coverage/verdicts.json"` (`{"judgedBy": "agent", "slots": [...]}`).
   3. `node packages/cms/tracy-quickstart-tools/content-coverage/record-judge.mjs --request "$WORK/coverage/label-judge/request.json" --verdicts "$WORK/coverage/verdicts.json"`.
      It refuses the whole file on a missing, unknown or doubled key or a role outside version 3; fix and rerun.
   4. Relabel every slot you marked wrong in `content-map.json` (a wrong fact/editorial group holds Publish for a new
      release), run the audit again with `--write`, and answer the new request: only changed slots are asked again.
   Slots never answered stay `not judged` and Road to live warns.
   Then **look at the map on the real pages** with the verify viewer (needs the `--fit` map written above; the contract is read
   from the tree for the version you are cutting):

   ```bash
   node packages/cms/tracy-quickstart-tools/content-coverage/verify-viewer.mjs \
     --site "$VERIFY_URL" --template ja-boxing/j6 --version "$VER" --out "$WORK/verify"
   ```

   Open `"$WORK/verify/index.html"` (not committed). Fix every slot under *Not located* or *Not shown* that a visitor can see,
   and judge each red or amber slot by eye; the tool marks, a person decides. Details: the tools README, section
   `verify-viewer.mjs`.
   Re-capturing the contract means **measuring again**: the file records the sha256 of `content-map.json` and `presentation-lock.json`; a
   mismatch makes /ops treat it as not measured.
8. **Slot roles (in `content-map.json`)** — there is no sidecar: every text and image slot carries `role` and `group`, and the
   top level carries `roleVocabularyVersion` (`place-content-roles/2`). The capture of step 4 already wrote the rule tables'
   proposal (and kept the roles of unchanged slots when you passed `--previous-map`), and printed the slots it could not
   place. Now **review EVERY slot's role** in `"$P/$VER/content-map.json"` against its `sample` and position: correct each
   wrong proposal, and bind the unplaced slots from their sample and position (your judgement; use the roles and group
   kinds of the vocabulary, one `group.id` per card, `group.item` the card's index). Then run
   `node scripts/slot-roles/check.mjs "$P/$VER" --webroot "$WORK/chup/webroot"` until it exits 0. It also runs the
   declaration rules (packing check): an `error` fails the run, a `warning` is printed with its fix hint; how to fix
   each rule: [`references/declaration-rules.md`](references/declaration-rules.md). Re-capturing replaces the file, so
   make these edits after the final capture (or pass the reviewed map as `--previous-map` next time; top-level fields
   such as `repeatableLists` are not carried and must be set again).
   **Offering cards and lists:** the short text a card or list reads is `offering.summary`, in the same group as
   its `offering.name`. An offering article's `introtext` shown by a category/list view is its summary, even when
   its full body has `offering.description` slots too. This applies to T3, T4 and other frameworks; WordPress
   excerpts and EmDash offering repeater summaries follow the same rule. Never label these as free
   `editorial.paragraph` slots. The rule tables bind known offering excerpts; review the rendered card to bind
   other summary fields. After a brief build, check every kept offering card on home and every list page has
   nonempty copy about its own offering. Report a missing summary as a build failure, including its page and card.
   **Button actions (every framework and CMS):** every button slot (an anchor or `<button>` with a button class, a
   `data-bs-toggle` modal trigger, a header button, a `*.cta_label`/`*.cta_url` or `editorial.button_label` slot) carries
   `action.kind`, separate from its `role`: `primary-cta` (the business's main conversion: header button, hero main
   button, closing CTA band), `go-to-item` (opens the page of the item its card shows), `open-map`, `contact`,
   `external-profile`, `navigation`, or `submit-form` (a form's own send button). Bind a label to its URL slot with
   `action.urlKey`. A shared language string used as button text lists every rendered use in `action.uses`
   (`kind` plus `selector`, `route` or `destination`); uses that disagree take `kind: "navigation"`, and the writer
   picks words valid for all. The capture's rule tables propose actions from the destination and placement (pass
   `--webroot <webroot> --template <name>` so template overrides are read); `node scripts/slot-roles/declare-actions.mjs
   "$P/$VER" --webroot "$WORK/chup/webroot"` proposes them for a map already written. A button whose job its markup
   does not prove (`#`, an empty link, a demo style-guide button) stays undeclared until you declare it by hand:
   `scripts/slot-roles/check.mjs "$P/$VER"` refuses the contract while any button has no action. The brief build gives
   every `primary-cta` the business's own action and channel, so a missing declaration ships the demo's words.
   **Footer link columns are navigation groups (every framework):** the header main menu may be shorter and group pages,
   but the footer always lists every kept page, so each footer column of links is declared in the content map's top-level
   `navigationGroups`: `{id, placement: "footer", holds, heading, container, menu, links}`. `holds` is `offerings` (the
   offerings index and each offering page), `company` (home, about, team, contact, booking and the rest) or `pages` (any
   page no other column takes); `heading` is the column heading's text slot (its demo sample, such as "Site map", never
   survives a brief build); `container` is the module entity that renders the column and `menu` the native menu it shows;
   `links` are its `editorial.menu_label` slots. `scripts/slot-roles/check.mjs "$P/$VER"` refuses the contract while a
   footer `mod_menu` module is not declared. After a brief build, check that every kept page and each offering page is
   linked from the footer, the footer has at least as many links as the header, and no demo heading or link remains
   (`footer-navigation-check.js` reports each on the build's receipt).
   **A call-to-action band is one unit (every framework):** a block (not the hero) whose words are at most a heading and
   a short line above a conversion button (`primary-cta` or `contact`), usually over a ground picture, is declared in the
   content map's top-level `ctaBands`: `{id, entity, message: [{key, part: "heading" | "line"}], buttons, ground}`.
   `message` names its text slots (a band with no message slot role is refused), `buttons` its declared button slots and
   `ground` its picture slot or null. `node scripts/slot-roles/declare-actions.mjs "$P/$VER" --write` proposes the bands
   once the buttons carry their actions, and `scripts/slot-roles/check.mjs "$P/$VER"` refuses the contract while a band
   is undeclared. A brief build writes the message from the brief for the button's action (no price, number, offer or
   other fact the brief lacks) and keeps it through cleanup; a band whose message cannot be written comes off whole.
   After a brief build, check each band shows its heading, line and button in light and dark mode (`cta-band-check.js`
   reports a lone button on the build's receipt).
   **A layout band is one unit (every framework):** blocks set side by side in one strip of the layout (Joomla: modules in
   the places `<stem>-1`, `<stem>-2` of one block, such as a footer logo beside a sign-up box) are declared in the content
   map's top-level `layoutBands`: `{id, parts: [{entity, part: "working" | "decoration" | "standalone"}]}`. A working part
   says or does something (a heading, a text, a form, a button); a decoration part only decorates (a logo, an icon, a
   divider, a background). When a brief build takes every working part off, the decoration parts come off with it, so no
   logo stands alone in an empty strip; mark a decoration `standalone` only when the template means it to show alone.
   `scripts/slot-roles/check.mjs "$P/$VER"` refuses the contract while a decoration block shares a band with working parts
   and no band declares it. After a brief build, check that no strip shows only a logo or an icon beside the empty place
   of what was taken off (`empty-frame-check.js` reports each as `lone-decoration-band` on the build's receipt).
   **Sections, card links, offering rows and outlines say what they are (every framework):** a section that lists records
   it does not hold (Joomla `mod_articles_*`, a query loop, a collection list) declares on its entity what it lists,
   `"lists": "<group kind>"` (`service` for offerings), so its heading is written for its body and not for a figure in its
   intro. A card's title link (a url slot in a card group beside the card's name) declares `action.kind` (`go-to-item` for
   the item's own page); undeclared, the build guesses the target from every word of the card. A row group of offerings
   holds as many rows as the template has offerings, or is declared in `repeatableLists` with its real `max`. Tabs that show
   one offering each declare `"presentation": "offering-tabs"` on their step groups: the build titles each tab with an
   offering's name as the brief gives it, one per offering up to the tabs there are, and takes off a tab with no offering.
   A list of a session's parts whose items are worded as the demo trade's rhythm (rounds, rest, repeats) is a group of kind
   `step` with `"presentation": "session-outline"` (`step.title` the part, `step.description` each item). A label in front
   of a contact detail ("Email:", "or call:") declares `"labelOf": "<value slot key>"`, so it goes with its value.
   Text capacity is measured at the room a shrunk box can grow into (content-coverage `--fit`); a capacity equal to the
   demo's words on every viewport is a warning to measure again. Rules and fixes: `section-body-undeclared`,
   `card-title-link-undeclared`, `offering-rows-short`, `outline-item-unroled`, `text-box-at-demo-length` in
   [`references/declaration-rules.md`](references/declaration-rules.md). After a brief build, check each listing section's
   heading names what it lists, each tab names one offering, and no outline keeps the demo's rhythm.
9. **The first T3 template run through this skill:** look at and record in the report two points — (a) local Tracy
   creates a T3 site successfully (section 6 step 5); (b) the freshly bound site has no design-drift warnings (step 6 above).
10. `git -C "$TCH_WT" status --short` · `git -C "$CW_WT" status --short` → record. No `git add`.

### 7b. Fix loop when K8 is red

This is the loop run by hand for JA Boxing 1.0.2 on 24/10/2026; Road to live pastes exactly this loop into the
"Paste into Claude Code" box of the Content coverage step. 🔒 **Run K8 BEFORE opening the PR** and fix everything in one
round: every fix (capture rules, template, re-captured contract, `content-coverage.json`) goes into **one** PR; do not spawn
a second PR after the gate goes red.

1. **Measure** (step 7 above), open `report.html`: holes grouped by class and cause (`cause`), then the **Page hygiene** card.
2. **`capture`** (the value is in the DB): a bug in the **CAPTURE RULES**, not in one contract.
   🔒 **Fix the rule, not the contract**: fix
   `packages/cms/tracy-joomla-quickstart/scripts/capture-contract.py` (and the contract door of the Claude
   Cowork plugin when a new slot needs a new kind of read/write) for **every template**, test first
   (`packages/cms/tracy-joomla-quickstart/test/capture-contract.test.mjs`), then capture again from step 4. Never
   hand-edit one template's `content-map.json` / `presentation-lock.json`: the next capture wipes it, and the next template trips
   again. A `lock: locked` hole is still a hole: the lock is only for real presentation; demo content that is locked cannot be
   changed by the customer → the rule must declare it as a slot (a declared slot is carved out of the lock automatically).
3. **`template`** (text hard-coded in a template file / language file) and **every page hygiene problem**: fix in the
   **template source** in `joomlart-products`, build the **next quickstart version** (same pack shape as the released version,
   see the lessons below), and capture the contract again on that version. The template's language strings (`TPL_…`) are declared through
   Joomla's **language override** (the template language-string capture rule); do not edit the template's ini files.
4. **`core`**: Joomla / framework strings, do nothing.
5. **`unknown`**: look at `evidence` in `report.html`, tell the requester.
6. **Accept** only when certain it is not demo content a customer sees: write
   `"accepted": "<reason, in English, ≥ 12 characters>"` on exactly that row (in `holes` or `hygiene`) of
   `content-coverage.json`; the next measurement keeps the reason. Do not lower the threshold.
7. **Measure again** until exit 0, commit `content-coverage.json` next to the contract in the same PR as the fixes, then continue
   with sections 8–9 (`tch` PR, plugin version, file upload, pin, switch flip) in order.

### 7c. Lessons from JA Boxing (24/10/2026)

- **The pack shape must match.** The next version is packed in exactly the pack shape of the released version, following Hano's process
  on `develop` (`installer`, or `webroot` + `database`). JA Boxing 1.0.2 was an installer, 1.0.3 was accidentally packed
  as `webroot` + `database`: you must check that Tracy builds a site from that shape (section 6) before uploading, otherwise
  repack as Hano did for `ja_diner`, `ja_fresco` 1.0.3. Changing the pack shape is a stop point: tell the requester.
- **K8 before the PR**: measure coverage + page hygiene on a site built from the pack **before** opening the PR, so every fix goes into
  one PR (section 7b).
- **Fix the rule, not the contract** (section 7b step 2).
- **A contract is captured only from ONE CLEAN INSTALL of exactly the pack being uploaded** (zip sha recorded in `manifest.json`), never from a site that went through K6, was hand-edited, or was `restore`d from another pack. A pack may carry `UPDATE` statements appended to the end of `custom.sql` (the builder
  `release-joomla.mjs` logs "demo data: N statements appended"); the install applies them, so the contract is captured correctly, while readiness's static
  reader must apply them as MySQL does (`readers/sql-dump.js`, since 24/10/2026). If the pack changes (rebuilt), capture the
  contract again from a new clean install; do not hand-patch the contract to match.
- **What STAB-1 / STAB-6 red "lock differs from dump" means**: the two sides read two different things. Before re-capturing, compare the reported row
  with the pack's `custom.sql` (including the `UPDATE` statements at the end of the file). If the contract matches the installed site, fix the reader, not the contract.
- **Generated T4 files stay out of the lock**: `media/t4/optimize/…` and `media/t4/css/<styleId>-sub.css` (compiled when a style
  renders a page that is not its own menu target, so whether it exists depends on the crawl path). `capture-contract.py --exclude-generated` drops
  them; `<styleId>.css` stays in the lock (readiness ignores both).
- **`<version>.copy.json` belongs to section 7, not to readiness**: write it next to the profile folder
  `{"keptText": [], "demoCompanyNames": [...]}` before opening the PR. The list: the demo site name (FIRST; masthead
  `default-title`, page titles, `copyright`), then every other spelling of the demo brand name in text slots
  (`grep -io` the repeated capitalised words in `content-map.json`, typos included, such as "Gitfit"). Without the file
  ABOUT-3 is red "declares no demoCompanyNames" (JA Boxing 1.0.2 and 1.0.3 were red for exactly this reason until 24/10/2026).
- **Traps of the batch tool** `batch-contracts.mjs` (fixed in code; keep in mind when reading old results):
  a version folder holding only `design-system-measurement.json` used to count as a finished contract (now only a folder with
  `manifest.json` counts); a component build must copy the helper `contract-assets.mjs` along (with
  `release-manifest.mjs`) because `build.sh` calls it; plugins from 0.24.55 on do not carry profiles in the package but download them, so
  the trial bind must **place** the profile into the component copy itself. Details:
  `packages/cms/tracy-quickstart-tools/README.md`.

**The batch path stops here.**

## 8. Ship the contract

Each outward-facing action is a stop point waiting for a go. Order (full path): `tch` PR (step 1) → Claude
Cowork plugin version carrying the contract → **upload the files** → Tracy pins → `tch` PR into `develop` → section 9 (flip the switch). The upload goes
**before** pinning because Tracy pins webroot + database together with `githubAssetId` — that number exists only after the file is on the
release; `joomlart-products` is a private repo, and Tracy can only download files that have a `githubAssetId` (downloaded through the API, with a
token). Customers see nothing until the switch is flipped: the template card changes version according to `tracy_setting.json`.

Direct-capture path: **no file upload** — the pack files and `githubAssetId` are already on the release. Order: `tch` PR
(step 1) → plugin version carrying the contract → Tracy pins → `tch` PR into `develop` → section 9 step 5 (K6 pass 2). Customers get the
contract as soon as Tracy dev pins, because the template card already points at this pack.

At this section (single template: right after section 7; batch: per the batch schedule): open
[`references/ship-and-release.md`](references/ship-and-release.md) and do the 7 steps of section 8
in it (`tch` PR, cut the `claude-cowork` version, publish the plugin release, check the plugin version, upload the files, Tracy pin,
PR into `develop`). Done when the `tch` PR into `develop` is merged and Tracy dev has been rebuilt.

## 9. Release the pack + K6 pass 2 (after Tracy dev has pinned)

After section 8: do section 9 in the same file
[`references/ship-and-release.md`](references/ship-and-release.md) — full path steps 1–5
(flip the switch, K2+K3 pass 2, `joomlart-products` PR, K6 pass 2); direct-capture path only step 5 (K6 pass 2);
batch per the batch schedule. Never on production.

## 10. Stop points

| Where | Waiting for |
|---|---|
| Template not T3/T4, content in several languages (section 1) | the requester decides |
| The requester has changed the template (section 2) | report |
| The "do nothing" path (section 2); a new pack (installer / snapshot pack missing agent docs) where `tch` already has a contract for version + 1 patch (section 2) | report |
| No working folder `WORK` yet (section 3a); no place for the run report yet (section 12) | ask the requester |
| tracy-dev version other than 0.7.2 / 0.7.1, 0.7.1 with a pack failing the mode check, capture tool lacking the empty/duplicate guards (section 3) | the requester decides |
| Wrong site version (cache), template version differs from source, demo email blocked, new error caused by packing, pack check fails (section 5); wrong site version on the direct-capture path (section 6 step 4, `references/direct-capture.md` "First site") | the requester decides |
| Local Tracy does not answer / `up` wrong after the fix / `tch create` `ok: false` / T3 point (a) / local release folder not from this run (section 6) | report |
| Capture tool stops (empty / duplicate), another Tracy tool needs copying, module prefix differs on a non-content module, template is in the design catalog, script red, T3 point (b) (section 7) | report each case |
| Upcoming Cowork plugin version (section 7) | the requester gives the number |
| K8 red in class `template` / `unknown` or a page hygiene problem (fix in the template, release the next version); next pack's shape differs from the released version's (sections 7b, 7c) | report |
| Commit / `tch` PR; merge + `claude-cowork` release; file upload; `tch` PR into `develop` (section 8) | a go |
| Flip the switch; `joomlart-products` PR (section 9, full path); K6 pass 2 (section 9 step 5, both paths) | a go |
| Any unforeseen error; a hook or permission blocking a command — **never work around it** | report |

Report briefly: which step you stopped at · what you saw (with command + result) · how many options there are · which one you propose.

## 11. Clean up

- `"$TD" destroy "$SITE-k6"; "$TD" destroy "$SITE-verify"; "$TD" destroy "$SITE"` → `"$TD" sites`.
- `ddev list`: projects of other sessions remain → **no** `ddev poweroff`, record it; no projects left → `ddev poweroff`.
- Delete every file holding a token or password: `"$WORK/k6/token.txt"` (the copy inside the site goes with the site); the `restore`
  logs (`"$WORK/b1-restore.log"`, `"$WORK/b6-restore.log"`, `"$WORK/b7-restore.log"`,
  `"$WORK/k6/restore.log"` — whichever exist); the request files `k6-request-*.json` the K6 script already deleted itself. A hook blocks
  the deletion → tell the requester, do not work around it.
- Restore `.env` if it was edited (section 6 step 7).
- Keep `"$PACK"` + `"$PACK_SHA"` until the release is done. Keep worktrees and branches until the requester says otherwise.

## 12. Run report

One file where the requester says (outside every repo), sections in this order:

1. Chosen path + reason (what the release currently is, result of `quickstart_docs.rb check`).
2. The template's pre-existing errors (`check` / `package` before touching anything). Direct-capture path: "not applicable (the direct-capture
   path does not pack)".
3. Pack: files, sizes, sha (`"$PACK_SHA"`), pack check result, agent docs. Direct-capture path: files / sizes / sha
   of the pack downloaded from the release + the result of `quickstart_docs.rb check` in section 2.
4. Local Tracy: `tch local`, `tch create`, trial site deletion, `.env` restored (sha only).
5. Capture parameters + proving queries + results.
6. K1…K8 + the JSON result of each script (K8: the JSON line `cli.mjs` prints).
7. K6 pass 1: slot, old / new text, URL, counts on the page, `warnings`.
8. Stop points passed + whose go, and when.
9. K2+K3 pass 2 + K6 pass 2 (if reached).
10. Where it stumbled.
11. Newly found check points — record only, present to the requester; never add a gate yourself.
12. The first T3 template run through the skill: point (a) (section 6 step 5) + point (b) (section 7 step 6), per section 7 step 9.
