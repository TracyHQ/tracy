# Toolkit — every tool in `scripts/tools/`, its job and its phase

> Opened from [`SKILL.md`](../SKILL.md) when a phase needs a tool's flags. Each tool's own header (`--help`/usage at
> the top of the file) is the authority on flags; this table says what it is for and when. Process rules (tiers,
> lenses, Fast Gate) are stated in [`qa-lenses.md`](qa-lenses.md), not here.

## How the kit runs

`scripts/new-template.sh <target> [package] [template-id]` copies the skeleton + `scripts/tools/*` +
`scripts/src/*` + `scripts/tests/*` (mock EmDash API + DE/FR fixtures) + a skeleton `template.config.json` into a new
package. Every tool has `--help`/usage at the top of the file, meaningful exit codes, no hardcoded machine paths, **no
hardcoded identity**: site name, locales, form bindings, audit policy, theme hook (`qa.theme`) are all read
from `template.config.json` (`--config`). They import `playwright` (browser: `npx playwright install chromium`), `acorn`, `emdash`, `better-sqlite3`
from the **template's** `node_modules`, so they must be run as `node tools/<x>.mjs` in the template folder —
not from the skill folder. `scripts/check-kit-sync.mjs` compares a template's copy with the kit
(`scripts/kit-manifest.json` says who owns which file).

**`npm test` in the kit does that for you**: `scripts/test-kit.mjs` builds a throwaway template in a temp folder,
copies `tools/tests/contract/ingest/src` into it, places exactly the files that `clean-install.test.mjs` asserts a new
target must receive, and runs the tests **there**. Run in place inside `scripts/`, four tests go red on a clean
checkout for reasons unrelated to either the product or the machine — `restore.test.mjs` reads `template.config.json`
next to the tool, and `clean-install.sh` computes the source as `dirname($0)/..`, which in the kit gives `scripts/`
rather than the template root. The regression classes it covers: clean-install, seed-apply F2/F3/F4, backup/restore,
audit F7, contract F8, package F9, acceptance gate F10 on a fake site, receipts F11, visual F12, notes F14, Fast Gate
F15 — without a real EmDash site, mostly F10/F12 opening a browser; do not run it alongside another `visual-qa` run.
The count and the measured duration are in [`SKILL.md`](../SKILL.md) §Toolkit.

Skill-level scripts (not kit-owned, never copied into a template): `scripts/check-kit-sync.mjs`,
`scripts/check-docs-numbers.mjs` (the counts the docs quote, `npm run test:docs`),
`scripts/perf/token-report.mjs` (tokens per Claude Code session, [`execution-rules.md`](execution-rules.md)) and
`scripts/lessons.mjs scan <template> [--pack <dir>] [--phase Pn]` / `show <id>` (the lessons ledger,
[`lessons.md`](lessons.md)).

**Output convention.** `visual-qa.mjs`, `fast-gate.mjs`, `checkpoint.mjs` and `release-chain.mjs` print by default
one line per run, `<tool> <command>: <key=value …> -> <file>`, and the complete result stays in that file
(`visual.json`/`VISUAL.md`, `FAST-GATE.md`, the plan's `.md`, the checkpoint, `chain.json`); `gates.mjs` prints one
row per gate and the same closing line. `--verbose` restores the per-page / per-stage / per-phase lines (for
`release-chain`, each step's log). Errors and warnings still go to stderr; exit codes do not depend on the form; what
another tool parses (`fast-gate.mjs plan --changed`, `verdict --json`, `visual.json`) is unchanged. A path in a
printed line is percent-encoded when it holds a control character, `%` or (in `gates.mjs` rows) `|`;
`decodeURIComponent` restores it. Shared helper: `cli-output.mjs`.

## The tools

| Tool | Job | Phase |
|---|---|---|
| `ingest/detect-source.mjs <url\|folder>` | **run BEFORE everything**: which CMS · whether T4/ACM · reach (local/remote) · suggested package name + location → pick the road ([`SKILL.md`](../SKILL.md) §Getting started) | P0 |
| `ingest/from-url.mjs <url> --out <dir>` | running site → a source folder `inventory.mjs` can read: same-origin crawl, keeps the site's paths, also pulls assets referenced by CSS, `crawl.json` as the record; says so when it hits the page cap or when the site renders with JS ([`references/inputs/from-url.md`](inputs/from-url.md)) | P1 |
| `inventory.mjs <src> <out-dir>` — `<out-dir>` is a directory (`inventory` → `inventory/source-inventory.json` + `assets.json`; a `.json` name is refused). Resolves `./`, root-relative and own-origin references and `url()` in stylesheets, so a mirrored CMS site reports real counts | hash + classify pages + referenced assets (HTML **and** strings in data scripts) | P1 |
| `extract.mjs <src> <out.json>` | extract the canvas data objects via **AST literals**, no eval | P1 |
| `render-source.mjs <url> <out> --pages a,b [--block host,host]` | render the source at 1440/390 × light/dark, measure overflow/fonts/errors; `--block` aborts requests to hosts that never settle offline (booking iframes, analytics); a page that fails is listed under `failed` in `render-manifest.json` and the run goes on (exit 1) | P1 |
| `validate-seed.mjs seed/seed.json` | EmDash's own `validateSeed` | P2 |
| `contract/validate.mjs <site-model.json>` | **source contract gate** ([`references/site-model.md`](site-model.md), ADR 0016): named error codes, one negative fixture per rule; also scans the storage vocabulary of the three CMSes in `scripts/contract/` | P1/P2 |
| `compile-seed.mjs <site-model.json> <seed-dir> [--config] [--media-from <dir>]` | contract → `seed.json` + `field-map.json` + `media-map.json` (`files` for the model, `items` in the shape `seed-apply.mjs` reads; `--media-from` copies the files into `<seed-dir>/media/`; a file name with `..`, an absolute path or a backslash is refused); datetimes written as UTC ISO; warns on HTML in a `text` prose field and on a configured collection without a label; rebuilds translation relations, rejects unmapped field kinds instead of guessing | P2 |
| `safe-path.mjs` | library: `joinInside(root, name)` / `unsafeReason(name)` refuse a model-, seed- or media-map-supplied file name that is absolute, has `..` or a backslash; used by `compile-seed`, `seed-apply` (media upload) and `visual-lib` (media hash) | P2 |
| `carry-field-map-roles.mjs` | library, not a command: `compile-seed.mjs` (and a template's own `build-seed.mjs`) keep each field's slot role (`role`, `group`, `subRoles`) when they regenerate `seed/field-map.json` (ADR 0038); a field map without roles comes out unchanged | P2 |
| `from-emdash-seed.mjs <seed.json> <out>` | **one-time bootstrap**: the seed of a template built before the contract → `site-model.json` + `compile.config.json` | P2 |
| `from-wp-spec.mjs <spec-dir> <out-dir>` | **bridge** ([`references/inputs/from-wp-spec.md`](inputs/from-wp-spec.md)): an existing Joomla spec-pack from the WordPress kit → `site-model.json`, stripping WordPress-isation traces; not the long-term Joomla adapter road | P1/P2 |
| `mint-admin.cjs` | admin account + agent token without a browser (run in the folder that has `data/data.db`) | P3 |
| `bootstrap-site.sh [origin] [data] [--config f] [--seed d]` | first-time setup (title/tagline from config) → mint → schema/content/media/forms/status; **never `--force`**; content created by setup is *adopted* when live == seed; different → exit 3 | P3/P8 |
| `clean-install.sh <target> <port>` | a second clean site from source + lockfile; preflight **before** any write: target new/empty, no symlinks, not inside/the source/an ancestor/inside another project, port free; no `--delete` | P3/P8 |
| `seed-apply.mjs status\|schema\|adopt\|content\|media\|forms\|all` | reconcile with receipts (`--config`, `--seed`, `--receipts`), `--dry-run`, `--force` (conflicts only) / `--force-all` (editor entries too), exit 3 on conflict; media by content hash `sha1:`; media/form edits do not touch entries with a draft or edited by an editor | P4 |
| `backup.sh` / `restore.sh` | SQLite snapshot (online backup) + uploads + receipts; restore reads the whole archive (tar, `data/data.db`, opens SQLite) **before** moving the old copy to `*.before-restore-*`; rejects targets with < 3 path components | P4 |
| `configure-smtp.mjs --test <mail>` | Generic SMTP provider of `emdash-smtp` → Mailpit, selects the `email:deliver` hook, sends a test | P5-E |
| `shoot.mjs <url> <out> --paths … --viewports … --themes …` | quick matrix screenshots; seeds the theme via `qa.theme.storageKey`, observes it back via `selector`/`attribute`; exit 1 on overflow, console errors, sub-resource 4xx, unhydrated island, theme not changing, image not decoding, status mismatching `qa.expectedStatus` | P3/P7 |
| `qa-contract.mjs init <source> <out> --config f` / `qa-contract.mjs <contract> --source <source>` | contract skeleton (hash every source file, `converted`/`asset`) · validator: unmapped pages, open decisions, source hash drift, missing measured styles, gates without policy → exit 1 | P1/P7 |
| `qa.mjs --contract … --source … --site … --out <new> [--browser] [--artifact d] [--reviews d]` | **acceptance gate**: pages × variants × states matrix in a real browser (image decode, MIME, theme, content matches source, measured styles, fonts in `allowed`, mega panel + Escape/focus), `audit.mjs` (routing), package verify, review-gate receipts; `pending`/`blocked` never become pass | P7/P8 |
| `qa-receipt.mjs <gate> --report <run>/report.json --out <dir> --reviewer … --method … --cases … --evidence f1,f2` | receipt for one review gate: copies + hashes evidence, pins the report's `contractHash`/`artifactHash`/`origin` — `qa.mjs --reviews <dir>` only accepts receipts produced exactly this way | P7/P8 |
| `admin-session.mjs --site … --email <admin> --out state.json` | admin sign-in on the **built** site (no dev bypass, no passkey) via an "email link" read from Mailpit; closes the welcome dialog; saves storage state for the tools below | P7 |
| `admin-roundtrip.mjs --site … --storage-state … --entry <admin path> --field <id> --public <path> --out f` | `editability` gate through the **admin UI**: discard old draft → edit field → Save → Publish changes now → public page changes → revert → back to old; drafts do not leak to public | P7 | The first admin sign-in shows a "Welcome to EmDash" dialog that intercepts every click (dismiss it with "Get Started" first, or Save times out on pointer interception), and the `--entry` admin path carries the entry's ULID, not its slug, while `--field` is an input id or name (`field-title`).
| `recovery-check.mjs --site … --collection … --slug … --field … --public … --out f` | `recovery` gate on the running site (run from the site folder): published edits survive a restart; `backup.sh` → overwrite → stop → `restore.sh` → editor text is back; restores the original value itself | P7 |
| `distribution.mjs pack <contract> <new>` / `verify <dir>` | package by allowlist — rejects `data/`, `.env`, `*.token`, `node_modules`, missing `required`; `distribution.json` hashes each file; verify catches changed/added/removed bytes | P8 |
| `audit.mjs <url> <out> [--config f]` | crawl from the root of every locale; **asserts** the policy: indexable → canonical in the right form (path + `page`), full hreflang for every locale + x-default, alternates return 200 with the right `<html lang>`; noindex → `noindex`; `/404` → 404; hitting `--max` with a queue left → incomplete, exit 1 | P7 |
| `fast-gate.mjs plan --contract … [--json f] [--changed a,b] [--verbose]` / `fast-gate.mjs verdict <run> --contract … [--json\|--verbose]` | **Fast Gate** resolver and verdict: `plan` picks a small deterministic case set from the contract and writes the plan table (why each case, what only full checks) to `<--json>.md` (or `$TMPDIR/tracy-cli/`), `--verbose` prints it; `verdict` grades a `--scope fast-gate` run → `FAST-GATE.json/.md`. What it picks and when it passes: [`qa-lenses.md`](qa-lenses.md) §8, the one statement of those rules | P3 → P7 |
| `visual-qa.mjs --contract … --site … --out … --source-site … [--source-dir <frames>] --scope fast-gate\|full [--fast-gate <run>] --stage <id> [--reuse <previous runs,…>] [--tile-height 1200] [--verbose]` | **by tier** light-desktop → light-responsive → dark-desktop → dark-responsive ([`qa-lenses.md`](qa-lenses.md)): one script shoots by layout (`visual.shots` — a generator derived from the contract, no language names written) **and cuts each image into readable tiles** (`index.json.tiles`), measures every page in scope (rules, coverage, two-sided source comparison or declared frames, image census, scanner, design system) → `index.json` + `notes/machine.md`; the main agent spins up 5 QA lenses → `notes/<lens>.md`; `qa-notes.mjs merge` → `NOTES-<stage>.md`; a coding agent fixes → reshoot only pages whose hash changed. Scope is recorded in `visual.json`; `--pages` = `targeted-debug`; full rejects a stale/non-passing Fast Gate | P3 → P7 |
| `qa.mjs … --visual --source-site <source> --visual-fast-gate <run> --visual-reuse <last runs of each tier>` | `visual` gate: **scope `full` only**, every tier passes in the same run; `visual-review` passes on the five machine checks from the `--visual-runs` receipt (no signature; `fast-gate` runs may not be cited) | P7/P8 |
| `visual-scan.mjs <white\|darktext\|contrast\|border\|seam\|hover\|toggle\|probe\|snapshot\|diff> <url>` | one page, one measurement, one JSON verdict; fails when the page does not render (`examined < 20`) | P3/P7 |
| `mega-hover.mjs <url> --contract … [--state s]` | megamenu with a real mouse: hover → move straight down 4 px/step → link → click; `gapPx`, Escape returns focus, outside click | P5/P7 |
| `provenance.mjs` | hash table of imported shadcn files | P3/P8 |
| `artifact.mjs` | `artifact.json` from `template.config.json` + package + lockfile (templateId, label, pins, locales, env, entrypoints, checksums) | P8 |
| `content-api-gate.mjs [<package>]` | the package answers Tracy's Content API and prints provenance stamps: reader + `seed/content-api-map.json` + `seed/site-model.json`, `astro.config.mjs` attaches `contentApi` behind the `TRACY_CONTENT_API_SCALARS` flag, the Dockerfile defaults the flag to **1** in every stage with `ENV`, `src/lib/stamps.ts` + `PageOwner.astro`, middleware calls `keepPickPrivate`, every type of the site model has a row in the map; `release.mjs` calls it | P2/P8 |
| `generate-docs.mjs [--check]` | generates `docs/generated/inventory.{json,md}` from the source; `--check` is read-only, fails when docs are missing, skeletons are unfinished or the inventory is stale | P2/P8 |
| `build-qa-contract.mjs <source-data.json> <source-dir> [--config] [--seed] [--out]` | the Northgate build's contract builder: every expected string a literal from the **source** (`source-data.json`), archive titles from the seed's taxonomy labels, design values from `visual-contract.md`; uses `qa-contract.mjs init` + `fast-gate.mjs deriveShots`. A starting point — a new design adapts its source keys | P7 |
| `qa-browser.mjs` (library) | the page × variant × state matrix `qa.mjs --browser` collects; decides **once** which Chromium draws the evidence and records it (`browserIdentity`) | P7 |
| `qa-notes.mjs merge <run> --stage <id>` / `status <run> --stage <id>` | folds `notes/machine.json`, `notes/<lens>.md`, `notes/fix*.md`, `notes/<lens>-close.md` into `NOTES-<stage>.md/.json`; exit 1 when a shot with a consumer was not opened ([`qa-lenses.md`](qa-lenses.md) §5) | P3 → P7 |
| `visual-lib.mjs` (library) | the page-side measurements and pure comparisons `visual-qa.mjs`, `visual-scan.mjs`, `shoot.mjs` share; theme handling from `qa.theme` | — |
| `roundtrip-cleanup.mjs` (library) | `admin-roundtrip.mjs`'s unique stamp and its removal, tested without a browser (`tests/admin-roundtrip-cleanup.test.mjs`) | P7 |
| `personalize.mjs --answers-json '{…}' [--dry-run] [--json] [--inspect] [--revert <applyId>]` | writes the questionnaire answers into the site by `seed/personalize.json` (draft → publish, receipts, journal); [`brand-and-pages.md`](brand-and-pages.md) §Personalization | P4.5 |
| `personalize-gate.mjs` (library) | reads the **packed** artifact and says whether it can personalize (questions, map, tool present and filled); `release.mjs` refuses on its sentences | P4.5/P8 |
| `release.mjs --artifact <packed> --site <clean-site> --report <qa-run>/report.json --out <new> [--version] [--tag] [--repo]` / `release.mjs --site-pages <dir>` | quickstart release (`tracy-quickstart/v1`): one zip, a state snapshot minus machine-local state, manifest with hashes/gate results/receipts, `SHA256SUMS`, notes; refuses on `personalize-gate`/`content-api-gate` problems; `--site-pages` prints the `tracy_site_pages.json` that artifact carries and stops | P8 |
| `checkpoint.mjs init\|complete\|status <checkpoint.json> [--phases …] [--<input> <file>]` | durable phase evidence for P0…P8 (P4.5/P4.6 included): `complete <phase> <evidence…>` hashes the evidence and the inputs that phase reads — source inventory, `pnpm-lock.yaml`, `template.config.json`, `seed/{site-model,seed,content-api-map,questions,personalize}.json`, `qa.contract.json`; which phase reads which is in the tool's header (the contract from P3, the Fast Gate). A changed input or evidence file makes stale every phase that reads it, and only those; recording a phase again leaves the later records alone. P3 hashes the whole contract, as the Fast Gate verdict does, so a P5 `layouts[]` edit reopens P3, P5 and P7 — a resumed run re-verifies instead of skipping. Records, never measures | P0 → P8 |
| `gates.mjs <qa-run-dir\|report.json> [--reviews <dir>] [--json]` | read-only: one line per gate of a `qa.mjs` report, `<gate> \| pass/fail/pending/blocked/not-applicable \| reason \| file`, then the counts; exit 0 only when the report passed. The recorded verdict, not a new measurement | P7/P8 |
| `release-chain.mjs --pack <new> --target <new> --port <n> --source … --reviews … --out <dir> [--from <step>] [-- <qa.mjs flags>]` | the P8 commands in order as child processes — `generate-docs --check` → `artifact.mjs` → `distribution.mjs pack` → `clean-install.sh` from the package → `qa.mjs --browser --artifact --reviews` → `content-api-gate.mjs` → `release.mjs`; one line per step, stops on the first failure with that step's log, `--from` resumes there. Adds no check: every refusal is the tool's (clean-install's target guard included). **One site**: `qa.mjs` measures the clean install `release.mjs` snapshots, at `http://127.0.0.1:<port>` where `clean-install.sh` starts it (`$EMDASH_SITE_URL` only sets the URL the site calls itself); `--site` is refused; resuming after clean-install needs the clean install recorded in `chain.json` and the same target/port (exit 2 otherwise); a report whose `origin` is another site fails the release step. The recorded site is recomputed from its port on resume (a record that disagrees exits 2); `--port` must be an integer 1–65535; origins are compared as `new URL(…).origin`, targets by real path | P8 |
| `cli-output.mjs` (library) | the one-summary-line output the CLIs above share (`summaryLine`, `takeVerbose`, `encodeField`) | — |
| `content-api/` (directory) | the Content API reader every template builds in (`/content.json`, `TRACY_CONTENT_API_SCALARS`); its own `README.md` is the spec; [`content-api.md`](content-api.md) | P2/P8 |
| `docker-entrypoint.sh` | the image entrypoint: creates `data/` + `uploads/`, hands only those to `www-data`, drops root via `gosu` | P8 |

There are 46 entries in `scripts/tools/` (files and the `content-api/` directory); each has a row above
(`scripts/check-docs-numbers.mjs` fails when one is missing or the count is wrong).

`new-template.sh` also copies `assets/package-docs/` into the new package, keeping guide files that already exist.
The agent completes every `DOCS_REQUIRED:` in the skeleton from the template's code, without copying Northgate/EN-RU
rules into a different design. Only `docs/generated/` is owned by the script. Read
[`package-docs.md`](package-docs.md) before creating or updating the handoff set.

Template-specific (not in the kit): `forms.json`, `interact.mjs` (that design's selectors).
