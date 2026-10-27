# Tracy — read this whole file before changing any line

This index owns the **boundary rules** (§2) and the **blast map** (§3); deeper rules live in the files it points to. **MUST READ** = open that file before editing that area. `AGENTS.md` is the same file.

## What this repo is

- **Tracy** — the whole system: dsh plugins (`packages/`) and the apps that serve them (`apps/tracy-web`, `apps/tracy-host`, `apps/tracy-docs`). How it runs: [`SYSTEM.md`](SYSTEM.md).
- **No Worker tree and no Cloudflare account**: `apps/tracy-web` answers every door, including the seats door in `src/lanes/route.js`. A blank machine runs the whole system. Text in `docs/` about Workers or "lanes" is history ([ADR 0014](docs/adr/0014-one-dsh-per-host-commands-in-web-container.md): one dsh per host, agent commands run in the site's own web container).
- Whole system locally: [`docs/references/running-tracy-locally.md`](docs/references/running-tracy-locally.md) — the services in `deploy/compose.yml`; a site answers at `<label>.tracy.test:51710`.
- **Branches:** `develop` is where work lands; `main` is what is released. Release from a `release/develop-to-main-<date>` branch, merged with a merge commit. Deployment is configured per installation, never in this file.

### Required reading

- **MUST READ FIRST:** [`CONTEXT.md`](CONTEXT.md) — what Tracy is, for whom, what it replaces and what it is not. Most of it is not inferable from code.
- **MUST READ** before changing how a request, a write or data moves — a new door, a new write path, a new store, a new service, a different bundle on the host: [`SYSTEM.md`](SYSTEM.md). Update it in the same PR.
- **READ EVERY SESSION START:** the change journal — `pnpm journal --days 30` (entries in [`changes/`](changes/README.md), one file per change) — what others merged recently and whom it affects. `git log` says what changed, not what it requires of you.

### Journal — rules for every change

- A change touching `packages/` or `apps/` adds a NEW file `changes/YYYY-MM-DD-<slug>.md` (never a shared file — that is what makes parallel PRs conflict), in English, in the format `- **<what>** — <who: name or role> · #<PR> · \`<branch>\` · YYYY-MM-DD` plus an `**Affects:**` line. Format and which changes need an entry: [`changes/README.md`](changes/README.md). Gate `changelog` (`scripts/check-changelog.mjs`) enforces it; `[skip-changelog]` in the commit message is the only escape.

### Start from the latest `develop`, and look before building

`develop` moves fast, so a stale tree hides both conflicts and work someone already did.
1. Before coding: `git fetch origin` and cut the branch or worktree from `origin/develop` (never a stale local `develop`).
2. Before building a feature: search `origin/develop` **and** open PRs (`gh pr list --state open --search "<keyword>"`); someone already on it → stop, never build a parallel one.
3. Before marking a PR ready: `git merge origin/develop` and re-run the tests.

The `pre-push` hook warns when a branch is more than 50 merges behind `origin/develop`; the `branch-fresh` job fails a ready PR past the same 50 (`scripts/check-branch-fresh.mjs`).

## 0. Four principles — override everything below

1. **Grep before writing new**; conventions exist for almost everything; none → copy the nearest file.
2. **dsh is the host in half the places** — before redrawing, check what dsh has; overriding a `--dsw-alias-*` beats rebuilding what it paints.
3. **Say what you can't do.** Missing endpoint → declare it, don't invent. Missing data → empty or `disabled`; invented data is **worse** than empty because users trust it.
4. **Green gates ≠ correct**; gates miss RULES #4 and #5. Exact machine vs. review coverage: [`docs/references/naming-conventions.md`](docs/references/naming-conventions.md) §7.

## 1. Directory map

**`packages/`** — Tracy code. Plugin test: has `cordis.patch.yml` → dsh plugin; otherwise library/app — never guess by folder name.
- **Before adding, moving or renaming a package, or to learn what one package is for:** read [`docs/references/directory-map.md`](docs/references/directory-map.md).

**`apps/tracy-web`** — the quickstart list is read from published releases into table `quickstart_releases` (ADR 0017); never add a catalogue file. `src/quickstarts.json` only pins the Claude Cowork plugin version (`src/lib/contracts.js`).
- **One questionnaire for the customer — Site questions.** Anything Tracy asks a customer about their site comes from the question sets: `apps/tracy-web/src/lib/question-sets.js` + `lib/build-questions.js`, served by `GET /api/sites/questions` (the CMS standard file shipped in the image). A new form, popup or step that asks the customer something **reads that door**; never hard-code a second set of questions. The Add site form reads it too (`packages/site/tracy-add-site/src/client/questions-sheet.tsx`).

**`apps/tracy-docs`** — the public API docs site (Astro Starlight), served at `/docs`.

**`tch/`** — `$DSH_HOME`. `profiles/{web,desktop,native}` are OWNED BY DSH, deliberately NOT pnpm workspace members (reason in `pnpm-workspace.yaml`). `native` is what every host runs (bundle `packages/bundle/tracy-native`); `web`/`desktop` load `packages/bundle/tracy-cowork` and run only on a dev machine. A machine's own profile rows (a test webroot, a local path) go in `tch/profiles/<profile>/cordis.local.yml`, which git ignores and `./run.sh` loads with `--patch`. `patches/` = hand-typed dev overlay.

**`vendor/`** — others' code: `deepseek-harness` = submodule; every other folder = subtree pinned to one commit (list: ADR 0006 §2). See RULE #5. **MUST READ** `docs/adr/0006-plugins-as-pinned-subtrees.md` before adding a plugin — no dependency may point at live GitHub.
- **Before editing, bumping or pulling any tree in `vendor/`:** read [`docs/references/directory-map.md`](docs/references/directory-map.md) — each tree's pin, home and licence, and the fork ledger.
- `emdash-theme-bravada` — Tracy EDITS this tree (RULE #5 reversed): fork of vhscom/emdash-theme-bravada @ v0.10.0, root of Tracy's EmDash templates. GPL-3.0-or-later: derivatives are GPL too, and mixing in `@tracy/cms-sections` is a licensing decision to settle first. `vendor/emdash/emdash-theme-bravada/IMPORT-NOTE.md`.
- `emdash` — type exception: emdash-cms/emdash pinned `emdash@0.37.0` is NOT run in dsh; it is a customer-site CMS like WordPress/Joomla. No `-tracy.N` patch, not a workspace member, not in the image (a `.dockerignore` line keeps it out of the build context). `vendor/emdash/emdash/IMPORT-NOTE.md`.
- **Run `git submodule update` BEFORE COMMITTING; never `git add -A` before it.** Checkout doesn't move submodules, so your `deepseek-harness` stays old while `develop` moves on, and `add -A` commits that OLD pointer, rolling the whole repo back. `git status` shows it as one ordinary-looking line (the `pre-push` hook blocks it on shared branches, §6).

**`scripts/`** — gates (list in `check-all.ts`), preset generation, dsh bootstrap; ships nowhere. **`tests/regression/`** — one case per fixed bug or feature (§6). **`docs/`** — `adr/`, `references/`.

- **Per-folder READMEs — read the one nearest your edit:** [`packages/ui/tracy-ui/README.md`](packages/ui/tracy-ui/README.md) (shared components and tokens, and what a plugin must wire first) · [`packages/locale/tracy-locale-vi/README.md`](packages/locale/tracy-locale-vi/README.md) (translations are data) · [`docs/references/five-things-a-plugin-must-get-right.md`](docs/references/five-things-a-plugin-must-get-right.md) (five things a Tracy plugin must get right, each with its silent failure).
- **Architecture decisions: `docs/adr/`. MUST READ** [`docs/adr/README.md`](docs/adr/README.md) — numbering rules and which inherited ADRs still bind here.

## 2. BOUNDARY RULES — a violation is a bug

1. **Only two ways out of the tree: NPMJS or WORKSPACE.** What npmjs lacks lives here as a workspace member (`@deepseek-ai/*` in `vendor/tracy/deepseek-harness`, the forked trees in `vendor/*`). No `link:` / `file:` / `portal:` / absolute paths in `package.json`, `cordis*.yml`, `.npmrc`, `pnpm-workspace.yaml` — use `workspace:` (unlike `link:`, pnpm still checks the version). Violations work **perfectly on one machine** and break only on a clean clone. → gate `check-self-contained`.
2. **Plugin identity declared in THREE places must match** — `package.json` name, cordis row, bundle id. Mismatch fails **silently**: half the UI doesn't render, no error, no log. → gate `check-plugin-identity`.
3. **`lib/client.js` IS COMMITTED.** The image copies plugin folders as-is (`packages/fleet/tracy-fleet-operation/dsh/Dockerfile`) and runs no plugin build, so "forgot to build" is pushable and ships stale code. → gate `check-bundles`.
4. **No reset/Tailwind inside the dsh page.** Plugins run inside the host's page; a second reset breaks the host UI. CSS modes: `DESIGN.md` §0. → **no gate**.
5. **`vendor/` is others' code — change it through its own path:** a **commit in the fork** with a `-tracy.N` version (`dsh-passwords 2.6.6-tracy.39`), never an in-place edit that forgets upstream. `deepseek-harness` is a **submodule**, the rest are **subtrees**. `-tracy.N` lives in this tree and lets `ERR_PNPM_NO_MATCHING_VERSION_INSIDE_WORKSPACE` catch a mismatched pin; after editing, bump `vendor/<package>/package.json` **and** every pin (bundle, profiles). → **no gate**.

`vendor/tracy/dsh-passwords` is RULE #5 reversed: Tracy modified it, and it guards the **sign-in gate of every surface**. Its `src/` is scanned by `check-language`; the other `vendor/` trees are not.

## 3. Blast map

| Touching | Breaks |
|---|---|
| `packages/ui/tracy-ui/src/tokens.css` | every Tracy surface at once, **silently** in one theme |
| `.npmrc`, or missing submodule `vendor/tracy/deepseek-harness` | **EVERY** `pnpm install` in the repo, even reinstalling one package |
| `packages/bundle/tracy-native` | what reaches **every host**: it is the only Tracy bundle the image's profile loads |
| `packages/bundle/tracy-cowork` | the local `web`/`desktop` profiles only — a change here is NOT on any server |
| `packages/fleet/tracy-fleet-operation/dsh/profile/cordis.patch.yml` | **EVERY site on the host** — one dsh serves all, so one wrong row is wrong for the whole machine |
| `packages/tools/tracy-subprocess-docker/src/route.mjs` | **every site's fence** — the `FS_TOOL_ARGS` table is the only thing between one seat's file tools and other customers' sites (ADR 0014 §3) |
| `tch/profiles/*/package.json` | dsh doesn't boot, or boots an **empty client graph** (HTTP 200, no error, blank UI) |
| `vendor/tracy/dsh-passwords` | sign-in on **every** surface |
| any plugin's `lib/client.js` | the image copies the folder as-is; no build step there to fix it |
| `vi/*.json` without `pnpm --filter @tracy/dsh-tracy-locale-vi build` | UI keeps old text, no error, no warning |
| `scripts/check-*.ts` | loosening a gate loosens it for **every** later PR, not just yours |
| a plugin's `src/client/strings.ts` | `check-dsh-locale` demands retranslation — intended, not a nuisance |
| `apps/tracy-web/src/lib/session.js` | EVERY surface reading the session cookie + open sessions |
| `apps/tracy-web/src/lanes/route.js` (shape change) | sign-in in EVERY site's dsh image — and the image changes only when someone rebuilds it |
| `apps/tracy-web/src/identity/route.js` door `/verify` | sign-in codes **in emails already sent** |

## 4. Commands

```
pnpm install            # needs the submodule initialised
pnpm build              # build every packages/ package (incl. committed lib/client.js)
pnpm build:check        # EVERY GATE (list: scripts/check-all.ts) — the merge gate
pnpm lint               # oxlint --fix + typecheck + format --write (for authors)
pnpm test:lint          # same, but NON-mutating (exactly what the gate runs)
pnpm typecheck          # TypeScript only
pnpm test               # every suite
pnpm test:workers       # node --test over apps/*/test, scripts/test, packages/*/*/test
pnpm docs:check-links   # doc pointers
pnpm docs:index         # regenerate docs/README.md (the index is GENERATED)
pnpm api:snapshot       # regenerate the API reference snapshot when gate api-spec is red
pnpm skills:sync        # rebuild the .claude/skills/ mirror after adding a skill
pnpm dsh:build          # build dsh lib/ — REQUIRED after clone, and BEFORE `pnpm install`
pnpm profiles           # link tch/profiles/* plugin trees from the workspace
./dev.sh                # start both dev surfaces; REUSES running processes, no restart
./dev.sh --restart      # stop and start again — ONLY this repo's processes
./run.sh [web|desktop]  # boot one profile
```

- **`./dev.sh` reuses running processes by design:** several sessions may run `./run.sh` on one machine; never kill another session's process.
- **Never run `dsh plugin --profile … install` from a worktree** — it writes **outside** the profile folder (symlinks into the worktree that break when the worktree is deleted).
- **Machine addresses are settings, not source.** Scripts that reach a machine of yours (ssh targets, VPN hosts) read them from the environment or from `~/.config/tracy/hosts.env` (`scripts/lib/machine-hosts.mjs`); never write an address into code.

## 5. Working on a change

- **Merged `packages/` code is live only once the image is rebuilt and deployed.**
- **One line of work = one branch = one PR.** A feature stage, its follow-up fixes and the side fixes found while doing it go into one branch and one PR. Separate PRs are right only for a different repo, or a change that must land before the line is ready (say why in the PR).
- **A PR opens as a DRAFT** (`gh pr create --draft`) and stays draft while work still lands on it.
- **Flip it to ready yourself** the moment every line of the ready checklist in [`pr-merge` §3](.agents/skills/pr-merge/SKILL.md) is true (`gh pr ready <n>`), then watch CI. More work comes after → `gh pr ready <n> --undo`.
- **An approval covers exactly what was named.** When someone approves an action on a list (sites, accounts, hosts, files), it covers that list only; finding more items that "look the same" → stop, report them, and wait.

## 6. Gates

**Before adding, changing or debugging a gate; when `pnpm build:check` or CI fails; before opening or readying a PR; before a test suite reads a new file; and before touching `.github/workflows/` or `scripts/ci/`:** read [`docs/references/gates-ci-runners.md`](docs/references/gates-ci-runners.md).

- **CI (every `check-all.ts` gate) runs on pull requests**, plus manual runs. A direct push is judged only by the `pre-push` hook — **open a PR for significant changes.**
- **A fix or a feature leaves a regression case:** a `fix`/`feat` PR adds or edits a case in `tests/regression/cases/` with a `PASS` result on its own branch — gate `Regression`. Only a `feat` may write `Regression: none — <reason>` instead. How: [`tests/regression/README.md`](tests/regression/README.md).
- **Clean enough to publish:** `node scripts/opensource/scan.mjs` (pinned gitleaks + IPs, e-mails, machine paths, archives, source maps, symlinks, LFS, submodules) must be clean outside its reasoned allow list (`scripts/opensource/public-tree.json`).

## 7. Conventions

- **MUST READ** before naming files, packages or functions, or writing commits: [`docs/references/naming-conventions.md`](docs/references/naming-conventions.md) — `@tracy/dsh-*` ⟺ plugin, three **deliberately different** file-naming conventions, commit format, and the language rule. Its §7.1 lists what machines do **not** check.
- **Language: contributor-facing code, comments, docs and metadata must be English.** Product translations remain localized data. The `language-policy` PR check reads every new commit, including merges and intermediate changes; README files, tests and filenames are included. Backticks, code fences and HTML comments do not exempt prose. Deliberate non-English data needs a narrow exception in the trusted policy; see `docs/references/public-repo-ci.md`.
- **Commit messages, PR titles and PR descriptions are English**, whatever language you chat in. `scripts/check-english-commits.mjs` also runs as a local `commit-msg` hook for early feedback. The mandatory enforcement is the required `language-policy` PR check, configured after publication. A local hook alone cannot prevent a push.
- **`vendor/`** is others' code: keep its comments as they are; don't back-translate.
- **MUST READ** before writing any on-screen text: [`docs/references/vocabulary.md`](docs/references/vocabulary.md) — canonical vocabulary, banned words with replacements, and "names that are NOT displayed are vocabulary too".
- **MUST READ** before editing CSS of a server-rendered page (`apps/tracy-web/src/lib/page-shell.js`): [`docs/references/page-shell-tokens.md`](docs/references/page-shell-tokens.md) — such pages **can't load `tokens.css`**, so tokens are redeclared by hand. Variable names match `tokens.css`; values are the fallback. `--primary` is terracotta `#bf5b3d` in both.

## 8. UI

- **MUST READ** [`DESIGN.md`](DESIGN.md) before any UI change.
- **Two CSS modes; choosing wrong is the costliest failure here.** Decide by *who owns this page's `<html>`*: Tracy (design bench, Storybook, pages Tracy renders itself) or dsh (every plugin injected into a slot).
- **dsh IS the shell** ([ADR 0004](docs/adr/0004-dsh-is-the-shell.md)), so the default product surface is **mode B** — plugins in the dsh page. Mode A remains in exactly three places, listed in `DESIGN.md` §0.
- **Focus = one 1px stroke that changes colour, NEVER a halo.** No `ring-2`/`ring-3`/`ring-ring/50`, no `box-shadow: 0 0 0 Npx <translucent>`, no thick outline, on any Tracy surface (`packages/cms` customer templates excepted). The shared `@tracy/ui` inputs already comply; halos only enter through hand-written CSS. No gate catches this: grep before pushing, command in `DESIGN.md` §5.
- Visual truth is [`@tracy/design`](packages/dev/tracy-design): for views the bench already has, **port the JSX**, don't redraw. The same package runs Storybook (`pnpm --filter @tracy/design storybook`, port 6007) for multi-state screens.
- **UI workflow** — steps, roles, what a handoff must include: [`docs/references/ui-workflow.md`](docs/references/ui-workflow.md).
- **Show/hide of a customer-page piece that `/ops` › User Interface can switch goes through the switch, NEVER through hard-coding.** Before touching whether any piece of the customer's page shows, grep [`packages/core/tracy-core/src/ui-switches/catalogue.json`](packages/core/tracy-core/src/ui-switches/catalogue.json) — the ONLY list of switches:
  - **It has a switch → the task is a press, not a code change.** Use `PUT /api/ops/ui` with `{"switches":{"<id>":true|false}}` (an owner/admin seat in the admin workspace, same `Origin`), or the switch on `/ops/ui`. Read the effect back with `GET /api/ui` (`hidden` list).
  - **Banned for a piece that has a switch:** `display:none` / a hiding selector in plugin CSS, `if (false)` or deleting the render, `disabled: true` in a `cordis*.yml`, changing a plugin's own default, a new env var / config flag, and writing `ui_setting` rows by hand. Each works on one deployment and silently fights the operator's switch on every other one.
  - **Changing the default for every deployment** = `defaultOn` in `catalogue.json` — still the catalogue, never a second check in code.
  - **A new customer-visible piece an operator may need to hide** → add its switch to `catalogue.json` first, then read it only through `@tracy/core/ui-switches` (`isShown`/`subscribe`, CSS `:root[data-tracy-hide~="<id>"]`, `keepShown`, `followTabPolicy`).
  - **A piece that must never show** (its plugin is off) → `locked: "<reason>"` in the catalogue **plus** the plugin's `disabled: true` row.
- **Desktop is a shell around the web** ([ADR 0030](docs/adr/0030-desktop-is-a-shell-around-the-web.md)): a feature the web can do is built in `apps/tracy-web` first; the desktop app renders the same page. The app only does what the web cannot (files on the machine, the `tracy://` scheme, windows/menus, self-update). Never cut a web feature to push people to install the app. Every PR answers this under `### Web and desktop` in its description (gate `description`).
- **Never draw in `vendor/tracy/shadcn-admin`.** It is a READ-ONLY template in `.gitignore`; nothing drawn there is kept.

## 9. i18n

**MUST READ** [`docs/references/i18n.md`](docs/references/i18n.md) before adding strings or translations — the three-party boundary (dsh · community · Tracy) and the namespaces Tracy owns.

- **Every language in Settings › Language must be complete on Tracy's AND dsh's screens:** en, vi, de, it, fr, nl, zh, es, listed once in `@tracy/core/interface-languages`. **Adding or rewording an English string in a plugin's `strings.ts` = translating it into every one of them in the same PR**; gate `interface-languages` names each missing (language, namespace, key) and the file it goes in. Translated a row of the debt ledger `scripts/locale-debt.json`? Strike it: `pnpm exec tsx scripts/check-interface-languages.ts --strike`. Never add rows to the ledger to make a PR green. Rewording an English string = retranslating it everywhere, then `--accept-sources`. No English literal in plugin JSX (including `{'…'}`) or in `aria-label`/`title`/`placeholder`/`alt`, and no English sentence in a `message`/`error`/`title`/`label`/`hint`/`description` or `new Error()`/`setError()` of any plugin's client code; dates take `interfaceLocale()` from `@tracy/core/interface-languages`.

## 10. Agent skills

- **Source is [`.agents/skills/`](.agents/skills/README.md); `.claude/skills/` is a SYMLINK mirror.** Edit the source, then `pnpm skills:sync`. A real copy in `.claude/` is a second truth that drifts silently; `pnpm skills:check` (in `build:check`) guards this.
- Skills that **belong to the repo** are named in `public-skills.txt`; every other folder in `.agents/skills/` is machine-local and excluded by an auto-generated `.gitignore`.
- **Vendored** skills (home in another repo, tree in `vendor/`) are mirrored directly from there, declared in `VENDORED_SKILLS` of `scripts/skills-common.ts`. Editing them in `vendor/` edits a copy: read that vendor's `IMPORT-NOTE.md` first and push the change back to its home.
- [`run-dev`](.agents/skills/run-dev/SKILL.md) — run Tracy locally: bootstrap dsh from source, web profile, desktop profile, Electron app.
- [`tch-dev`](.agents/skills/tch-dev/SKILL.md) — fix and debug on a **running** surface, tying each observation to what produced it; other sessions' processes are borrowed, never killed.
- [`pr-merge`](.agents/skills/pr-merge/SKILL.md) — take a change from a branch to a release: gates before opening a PR, the PR description, the merge.
- [`modify-site`](.agents/skills/modify-site/SKILL.md) — change a RUNNING WordPress, Joomla or EmDash site: which door is right for each layer, and the order between dependent edits.
- [`quickstart-contract`](.agents/skills/quickstart-contract/SKILL.md) — the content contract for a Joomla T3/T4 template's quickstart, from packaging to release.
- **Vendored site-building skills** (pin in each `IMPORT-NOTE.md`): [`tracy-emdash-template`](vendor/emdash/tracy-emdash-skill/skills/tracy-emdash-template/SKILL.md) (HTML design folder → EmDash 0.37 site), [`joomlart-t4-template`](vendor/joomla/joomlart-t4-skill/skills/joomlart-t4-template/SKILL.md) (Joomla + T4) and [`tracy-wordpress-theme`](vendor/wordpress/tracy-wordpress-theme/skills/tracy-wordpress-theme/SKILL.md) (not mirrored: open that `SKILL.md` in place).

## 11. Local instructions

If a root `CLAUDE.local.md` exists, read it after this file; it overrides this file. It is per-machine and not in git.

## Agent skills

### Issue tracker

Issues live in this repository's GitHub Issues (use the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the root and ADRs under `docs/adr/`. See `docs/agents/domain.md`.
