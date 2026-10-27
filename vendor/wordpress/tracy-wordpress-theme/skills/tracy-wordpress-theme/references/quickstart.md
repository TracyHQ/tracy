# Quickstart — webroot tar + SQL, restore on a clean stand, parity

> **Packet Phase 10 (quickstart).** Runs after Phase 9. The product is the **pair of files the fleet reads** (`webroot.tar.gz`
> + `database.sql.gz`) plus `manifest.json`, so that "Create with WordPress" yields the Tracy Base site — the same
> release shape as `tracy-apple/j6`.

The full cycle has run twice: Tracy Base (`tracy-base/wp7`, 14/09 08:52–08:58, draft release with 7 assets) and
Tracy Business (`tracy-business/wp7`, 14/09). Every command below is a real command; `scripts/quickstart/cycle.mjs`
runs all five phases in one pass, fail-fast.

## Why Phase 9 is not enough

The theme zip carries no content: pages, posts, menus (`wp_navigation`), synced patterns (`wp_block`), global
styles (`wp_global_styles`), options, media — all in the DB and `uploads/`. "Download the theme and get a site like the demo"
is impossible from a theme. A quickstart is a snapshot of the **whole site**; restored onto a clean WordPress it must yield a site
**identical** to the build stand — parity is the product, packaging is the cheap part.

## Five invariants

1. **Self-contained**: extract → import → search-replace → the site runs, no hand edits.
2. **Capture LAST and capture EVERYTHING**: capture after the last content change, never early (an early capture captures defects);
   every media item the content points to, every plugin at the right version (Contact Form 7 — Q10).
3. **Prefix `tr_`, URL placeholder, no secrets**: the dump keeps the `tr_` prefix (the fleet sets `tr_` too), the stand URL
   is replaced by a placeholder; no passwords, sessions, Cowork tokens, `private-login.json`.
4. **Parity is checked, not assumed**: restore onto a clean stand, then compare every page with the build stand.
5. **Install must not be fatal on a clean stand**; a green install that yields a different site is a FAIL.

## Five phases, one orchestrator

```
node scripts/quickstart/cycle.mjs --stand <stand> --id <product>/wp7 --version 1.0.0 \
  --site-a http://127.0.0.1:<build> --site-b http://127.0.0.1:<verify> \
  --wp-a "<runner stand build>" --wp-b "<runner stand verify>" --root-b "<root runner stand verify>" --routes <spec>/page-map.json \
  --run-root tasks/<site> --spec <spec-pack> --dark-hook cookie:tracy_theme=dark --title "Quickstart: <Name> / WordPress 7" \
  --verify-down "docker compose -p <project> stop verify" --verify-up "docker compose -p <project> up -d verify" \
  [--keep-draft <id>]… [--env-file <stand>/.env] --to verify
# measure the four-tier Visual QA checkpoint on the restored stand (round.mjs with `artifact` + `pack` in its
# config writes each tier's artifact-binding.json as it measures), then:
node scripts/quickstart/cycle.mjs … --from contract-bind --contract <slug>/wp7/<version> [--plugin <zip>] \
  --theme-zip <dist>/<theme>-1.0.0.zip --visual-ledger <evidence>/rounds.jsonl --checkpoint <run id>
```

**Two ways to the checkpoint, one measurement of the four tiers.** The four-tier checkpoint is the expensive step (about 13 min). It is measured once, on the
**build stand**, after `pack` has written the archives, with the round config naming `pack` and `artifact` so every tier is bound as it is measured. After
`--to verify` (restore + parity), the restored stand then needs one tier, not four:

```
# build stand, after pack: four tiers, bound to the theme zip + webroot + database of this pack
node scripts/visual/round.mjs --config <round.json with artifact + pack, site = build stand> --name <build run> --scope full
# restored stand, after the restore: ONE tier, in the same ledger
node scripts/visual/round.mjs --config <round.json with artifact + pack, site = restored stand> --name <smoke run> --scope full --stages dark-responsive
node scripts/quickstart/cycle.mjs … --from contract-bind … --checkpoint <build run> --restore-smoke <smoke run>
```

The release takes this path only when everything holds (`release.mjs reuseProblems`): all four build tiers bound to the same theme zip, webroot and database
being released, measured after those artifacts existed and before parity, on the build stand (`parity.a`); parity found the restored pack equal to the build stand
(ok, zero style mismatches, zero capture failures, every page × viewport × theme compared); and the smoke is the `dark-responsive` tier (dark theme and the narrow
layout in one run) of its own run, bound to the same artifacts, full, clean, on the restored site after the restore. A binding is written when the tier is measured and
never afterwards: a build checkpoint measured before `pack` has no binding to the pack and is not reused. Any mismatch — a hash, the pack, drift, a missing binding, a
smoke of another tier, site or time — keeps today's requirement: `--checkpoint` is four tiers measured on the restored site after the restore (the refusal names
`[restore-smoke-ineligible]` and the reasons). Without `--restore-smoke` only that full path exists. The finish audit of a reused release covers the smoke's
`interaction.json` (`port-audit.mjs --interaction <smoke dir>/interaction.json`). `VERIFICATION.json` records `acceptance.visual.path`:
`build-checkpoint-plus-smoke` or `restored-checkpoint`.

`cycle.mjs` runs `prune → pack → restore → verify → contract-bind → release`, timing each phase in seconds, output tee'd to
`<stand>/cycle.log` (beside `pack/`, not inside it: the `pack` phase deletes the whole `pack/` directory before packing), results to `<stand>/pack/cycle.json`; a red phase stops it — **release never
runs on a red verify**. `--from <phase>` resumes after a fix, only when every earlier phase is green in
`cycle.json`. A hand-typed `a; b; c` chain died mid-`pack` after 8 minutes and left no log (14/09) — that is
why this script exists. The `contract-bind` phase runs `contract-bind.mjs` on the restore (`--wp-b`, `--site-b`; `--bind-site-url` and `--curl`
when curl runs in a container) with `--contract`, optional `--plugin`, `--pack` and `--theme-zip`, evidence in `<stand>/pack/contract-bind/`;
a missing `--contract` or `--theme-zip` stops preflight (`[contract-bind-input-missing]`), and `release` reads exactly that file. Every wp call has a timeout (`TRACY_WP_TIMEOUT`, default 600 s). `--run-root` is required:
`release.mjs` needs it, and the cycle checks it **before the first phase and before creating/removing anything** (`--from release` included) —
before, without it, four phases went green for ~100 s and only then died at release (Tracy Base 1.1.0).

**Freshness gate.** Before the first phase, and before anything is created, removed or overwritten
(`--from` resumes included), the cycle checks the run-root's canonical `design-contract.json` and
`visual.contract.json` against `--spec` (release.mjs `contractProblems`, the same resolution and hashing
as `lib/canonical.mjs`). Each refusal is named: `[run-root-missing]`, `[spec-missing]`, `[spec-unreadable]`,
`[contract-missing]`, `[contract-ambiguous]` (a second candidate beside the canonical), `[contract-unreadable]`,
`[contract-unbound]` (no `bindings.specHash`, so freshness cannot be verified), `[contract-invalid]` (not the
structure `design-contract.mjs validateDesign` / `visual/contract.mjs validateContract` require — a shape that makes
either throw is the same refusal), `[contract-stale]`
(the spec-pack — or the `--theme-zip` a contract is bound to — moved on), `[theme-zip-invalid]`, and for the
routes verify compares `[routes-invalid]` (a `--routes` that cannot be read), `[parity-expectation]` (a page map
that cannot be read, or a status `--routes` declares differently) and `[parity-incomplete]` (a route the page
map declares that `--routes` leaves out). The spec-pack files
hashed (`page-map.json`, `sections.json`, `content.json`, `reference.json`) must be regular files — a symlink or a
FIFO is `[spec-unreadable]`, never read. When the release
phase will run, every release input must be given (`[release-input-missing]`), and a run that would pack and
release in one invocation is refused (`[checkpoint-before-pack]`): the checkpoint must be measured against the
archives pack writes, so run `--to verify`, measure, bind, then `--from release`. The release phase no longer
removes `release/` first; release.mjs replaces it only once the new release is accepted.

**Port built with an old skill version.** A dossier generated before today's rules (an exception without `key`, citing a decision that does not exist or
several decisions, a contract whose spec/zip hash drifted) is refused by the freshness gate at the first phase. Run **`scripts/migrate-port.mjs`
first** — it calls the same `contractProblems`, then asks those same validators why each row is refused, and prints every problem by
class (count, first example), each class marked **MECHANICAL** or **MANUAL** with the reason:

```
node scripts/migrate-port.mjs --run-root <dossier> --spec <spec-pack> --theme-zip <zip> [--routes <seed report>] [--theme <overlay>]   # diagnose only
… --write --report <out>/migrate.json                                                                                                  # fix the mechanical part
```

- **Fixed by the tool (only when it can prove it):** (1) an exception cites exactly **one** decision, that decision is defined exactly once, and
  a *specific* token of the exception's own `match` (a selector, a number, a hyphenated id — not a common word) appears only in that decision
  → add `key` to the **source** (`review.config.json` `visual.exceptions`, inserting exactly one line, no reformatting of the file), then regenerate
  `visual.contract.json` with the skill's generator (`initContract`) from the recorded contract inputs (spec, seed report, zip, overlay,
  pairs, per-page templates); write only when the regenerated copy **matches field by field** except `bindings`, `revision`, `source.hash`,
  `design.exceptions`; (2) a contract whose only drift is the zip/spec hash and which regenerates to itself → write the new hash; (3) `design-contract.json`
  equal to `spec/design-contract.json` except `bindings` → `design-contract.mjs adopt`. Old files go to `attempts/migrate-<stamp>/`
  (old contracts to `attempts/superseded-<stamp>/`), validated again; a second run changes nothing.
- **Left for a person to decide:** an exception that cites no decision, cites text that is not an id (`G67`), cites an id not in `DECISIONS.md`,
  cites several decisions (the tool does not pick one), cites an id defined twice; a decision that exists but holds no specific token
  of the row (the person sets `key` to what the decision *is really about*, or cites another decision); a `key`/`selector` a person
  wrote that the decision does not mention; the menu pair and exceptions of `design-contract.json`; a lost `DECISIONS.md`; a visual contract that drifted from the spec
  and regenerates differently (pages changed, parity changed) — it must be `contract.mjs init` again against the stand. The tool prints the row id, what the row accepts and
  the candidates for the person to decide; it never writes, changes or picks a decision.
- Refuses to write (touches nothing) when `visual.contract.json` has an exception that `review.config.json` — unchanged since generation — does not
  have: that is a hand edit to a generated file the tool cannot explain.

A `key` the tool sets proves the decision *mentions* something of the row, not that the decision *justifies* it: the report lists every key it
wrote for a person to review.

Three runners (`unset DOCKER_HOST` first):

- build stand, www-data: `docker run --rm --network <project>_default --user 33:33 -v <stand>/capture:/var/www/html
  -e WORDPRESS_DB_HOST=db … wordpress:cli wp`;
- verify stand, www-data (`--wp-b`): `docker run --rm --network <project>_verify --user 33:33 -v <project>_verify-web:/var/www/html
  wordpress:cli wp`;
- verify stand, root (`--root-b`): `docker run --rm -i --network <project>_verify --user 0:0 -v <project>_verify-web:/var/www/html
  wordpress:cli`.

The verify webroot is a **named Docker volume** (`<project>_verify-web`) that the verify web server, `--wp-b` and
`--root-b` all mount — not a host directory: see *Fleet-like restore* below. Give the verify runners their own
network (the database container joins both): the wp-cli keep-alive names its container after the `--network`
value, so two runners on one network share one container.

### `prune-audit.mjs` — clean up before capture
`--webroot <capture> --wp "<runner>" --admin tracyagent --site-url <build> [--apply]`. Lists everything on the stand
that does not belong to the site (revisions from seed runs, transients, stand options, extra users, build files) as
KEEP/PRUNE/REMOVED/UNKNOWN; `--apply` removes (posts in batches of 50 — 150 revisions took 7 minutes removed one by one);
`cycle.mjs` re-runs the audit after `--apply` and requires `0 prune, 0 to decide`. Without `--apply` nothing is written.
The revision, auto-draft and trash queries pass `--ignore_sticky_posts=1`: without it WP_Query puts every
published sticky post in front of a `--post_type=any` list whatever `--post_status` asked for (JA Vega M5 listed
its eight featured articles as auto-drafts and trash). The type and status each row carries still decide — a row
whose status is not the one queried (or, from the revision query, whose type is not `revision`: an attachment is
`inherit` too) is KEEP; a row without its type, its status or an id that is a positive safe integer is UNKNOWN
(`postRemoval`, `isPositiveId`: an id past `Number.MAX_SAFE_INTEGER` would round onto another row's). Every post
removal — revision, auto-draft, trash, orphan attachment, WordPress default — records both, and both are re-checked.

**Authors the seeder made are content** (#33 M6-7). `collectAuthorMeta` reads, in one read-only `wp eval` straight
from the users and usermeta tables (`ownersPhp`), every user with whether it carries the user meta
`tracy_source_author`: a user whose row has its id, the same login and a yes is KEEP, as a `--keep-user` is — deleting
it reassigns its articles to the admin. Each candidate needs its own row: when the read fails, answers a row without a
positive id, a login or a count, names an id twice, leaves the user out, or the facts predate it, no user other than
the admin and the `--keep-user`s is PRUNE — each is UNKNOWN (an author cannot be told from a builder's account).
`--apply` reads ownership, type and status again right before EACH user deletion and EACH post batch, not once
up front (`stillMatching` → `staleRemoval`; the removals before it take seconds each): a user who became a seeded
author or changed login, a post whose type or status moved, a row that is gone, a removal recorded without both type
and status, or a re-read that failed — that row is UNKNOWN and nothing of it is removed. **Draft pages** are listed from the same table read as the media
(`classifyDraftPages`): KEEP only where the intent is recorded (#41 M6-20):
- **an option names the page**, by its whole name: `page_on_front`, `page_for_posts`, `wp_page_for_privacy_policy`
  — the "Privacy Policy" draft WordPress creates at install — and the 404 template's words, `<theme>_404_page` for
  the theme the stand runs (its one `stylesheet` option, hyphens as underscores, as seed.mjs names it). An option
  that only ends like one, or the 404 option of another theme, names nothing;
- **the seeder's search-view draft**: with `--page-map <page-map.json>`, a draft that carries a non-empty
  `_tracy_seed` and sits at the path of the page-map's one `search` entry. seed.mjs writes that page as a draft on
  purpose (the path answers 404 so the redirect to the site search runs); publishing it or trashing it only makes
  the next seed put it back. Both facts are needed: a seeded draft at a path the page-map does not call a search
  view, a search path the page-map also claims with another view, a draft without the marker, or one whose parent
  chain cannot be read is UNKNOWN;
- **a decision**: `--keep-draft <id>` (repeatable) keeps that draft and the row records it (`decision:
  "keep-draft"`, `keptDrafts` in `--json`). An id that is not a positive integer, or not a draft page of this
  stand, stops the audit (exit 2) before anything is read or removed.

A page-map that is missing, not a regular file, not JSON, lists no page, or holds an entry without a view or a
path starting with `/` stops the audit the same way — it is
never read as "no search view". Without a page-map a draft at a redirect's path is UNKNOWN (a search view's draft
and a detail page left from an earlier layout look the same on the stand) — the path read from
`<theme>_redirects`, which the table holds PHP-serialized (`--format=json` stores an array), JSON only when set by
hand (`redirectSources`); every other draft is UNKNOWN with its path and whether the seeder wrote it — publish,
trash, or keep it with `--keep-draft`. No draft is ever PRUNE, and a published page is not a draft row. The text
report prints every draft row, the kept ones with their reason. `cycle.mjs` passes its `--routes` page-map as
`--page-map` and each `--keep-draft <id>` to both audits, the apply and the re-audit.

Two more kinds (gotcha 37): **attachments nothing uses** and **WordPress default content** (post
`hello-world` "Hello world!", page `sample-page` "Sample Page" — by the type + slug pair, the title confirms; right slug
with a different title is UNKNOWN). References are read with **one** read-only `wp eval` (`REFS_PHP` in
`quickstart/lib.mjs`, reading the tables through `$wpdb` so Polylang/plugin filters hide no row): an attachment is kept
when `_thumbnail_id`, `wp-image-<id>`, a block attribute `"id"`/`"mediaId"`/`"ids"`, `[gallery ids=…]`, its file name
(or a generated size) in content / post meta / term meta / an option / a theme file, a meta value equal to the id, or
`[gallery]` without ids on a parent page names it — the KEEP row records **which one** keeps it. `post_parent` alone is not
use. **One single matcher** (`REF_SHAPES` in `quickstart/lib.mjs`) serves both passes — pass 1 (audit) and pass 2
(re-read right before removal, `prune-usermeta.mjs`) — so the two passes cannot disagree. A reference must have token
boundaries: an id counts only inside a shape made to hold ids (`wp-image-N`, `"id"`/`"mediaId"`/`"ids"`, a serialized key
named like logo/icon/image, `_thumbnail_id`, a media meta/option value equal to the id); a bare number, `i:N;` under any key
(`sticky_posts`), an array index, `"queryId":N`, a short stem inside words/dates are **not** references. A file counts when
its relative path (or a generated size) stands between two boundaries in text, **or** when the whole value of a meta / term meta /
option equals the file name (`intro-image.jpg`) or its relative path — a file name in the middle of a sentence does not.
Pass 2 refuses rather than removes when in doubt and records the token matched: `named: meta intro-image of #70 (matched "…")`. A failed reference read → one UNKNOWN row, never an orphan list. `--apply` removes with
`wp post delete <id…> --force` (also removes the files in uploads).

### `pack.mjs` — tar + SQL
`--webroot <capture> --wp "<runner>" --site-url <build> --out <stand>/pack --id <id> --version <v> [--env-file]`.
`<slug>-webroot-<v>.tar.gz` (webroot minus the prune list, `wp-config.php` rewritten with `{{DB_*}}`, literal prefix,
eight new salts; relative-path entries, owner 0:0, no xattrs) + `<slug>-database-<v>.sql.gz` (`export-db.sh`:
literal prefix, stand URL → placeholder, passwords/sessions removed) + `manifest.json` + `SHA256SUMS`; `secret-scan.sh`
must be clean (it also compares the stand's salts).

Two gates, stopping before the archive is written (`cycle.mjs` stops at the `pack` phase; after the fix run `--from pack`):
- **The webroot root holds only WordPress's names** (21 names, `WP_ROOT_NAMES` in `quickstart/lib.mjs`). Any other entry at the root →
  stop, printing each entry with **what mentions it** (content, post meta, term meta, options, theme files — the same reference
  reader as prune). Nothing mentions it → remove it from the stand (really remove, not rename). A design entry that must ship →
  `--keep-root <name>` (repeatable) — keeping it is a product decision; ask the reviewer before adding the flag.
- **`wp-config.php` defines only the stock set** (`STOCK_DEFINES`: 4 DB + `DB_CHARSET` + `DB_COLLATE`, 8 salts,
  `WP_DEBUG`, `ABSPATH`). Settings **only the stand needs** (blocking outbound network, disabling auto-updates…) go in the stand's
  `WORDPRESS_CONFIG_EXTRA` environment variable — that eval block is dropped when packing — **not** into the file. A design constant
  that must ship → `--keep-define <NAME>` (repeatable), same ask-first rule.

- **The shipped `wp-config.php` is the accepted form, as text** (`archiveConfig` / `configFormProblems` in `quickstart/lib.mjs`, run by `pack.mjs` on the archive it wrote and by `release.mjs` on the webroot archive of the pack it accepts). The accepted form is the official WordPress image's `wp-config-docker.php`, committed unedited as `assets/quickstart/wp-config-docker.php` (read at run time), as `renderQuickstartConfig` writes it; the abridged test fixture `scripts/test/fixtures/quickstart/wp-config.docker.php` is not the accepted form and its rendering is refused. The archive must hold `wp-config.php` once, as a regular file, under the name `wp-config.php` only (any other spelling of it, such as `./wp-config.php` or `././wp-config.php`, is refused), and its bytes must be valid UTF-8. The stand's `wp-config.php` and a `--config` file are read as regular files (a link or a FIFO is refused, naming the file). The file is compared with it line by line after CRLF and CR become LF; only the four `DB_*` values, the eight keys and salts and the `$table_prefix` value may differ, each a single-quoted literal on its line. Anything else that differs — a comment, a space, a changed `DB_CHARSET`, `DB_COLLATE` or `WP_DEBUG`, a missing or edited forwarded-proto block, an extra statement, a `--keep-define` constant — refuses the archive, naming `wp-config.php` and the first line that differs (the value of a site-specific line is not printed). Nothing is repaired silently. A stand restored from an earlier pack can carry a config written by WP-CLI that fails this; `pack.mjs --config <wp-config.php>` renders that file in place of the stand's and writes the result into the archive, and the stand's own file is not edited.

Every member is written with the fleet's modes, not the stand's — see *Archive mode policy* below.

### `restore.mjs` — extract onto a clean stand
`--pack <stand>/pack --root-runner "<root runner verify>" --wp "<runner verify>" --site-url <verify> --db-host verify-db
--db-password-env MARIADB_ROOT_PASSWORD --wipe --report <stand>/pack/restore.json` (`--container-webroot`,
default `/var/www/html`; `--runtime-uid`, default 33). Extracts the tar, fills in `wp-config`,
imports the SQL, `search-replace` placeholder → verify URL, clean core checksums, admin set by whoever restores.
Tracy Base: restore → site 200 in 57 s. `--into <host dir>` is gone: restore extracts through the root runner.

### `verify-parity.mjs` — the two stands must be identical
`--a <build> --b <verify> --routes <spec>/page-map.json --wp-a … --wp-b … --root-b … --pack <stand>/pack
--restore-report <stand>/pack/restore.json --dark-hook … --out <stand>/pack/parity.json`. First the access check
(below; `parity.access`, and `ok` is false without it), then three layers: status of every route on both sides (redirects not followed); counts through wp (posts per type, categories, the options that decide
front page/theme); computed style per axis (viewport × theme × route) — Tracy Base **40/40 routes, 12/12
counts, 0 mismatches/9 600 measurements/152 axes**.

**Declared status.** Each route is held to the status it is declared to answer (`lib.mjs routeExpectations`,
the `declaredStatus` reading of the review tools): an explicit `status` in the page map, else 404 for the
`view: "404"` page, else 200. A route row matches only when both stands answer that status, and records it as
`expected`: a page map's `/404` answering 404 on both stands matches; answering 200 (or 500) on both does not;
the same undeclared 404, 500 or `error: …` on both never does. Computed styles are captured on every route
whose declared status draws a page — 200 or a declared 4xx/5xx page — so a declared error page is measured
light and dark like any other; a declared redirect (3xx) has no page of its own and no style axes. A status
that is not 200, 3xx, 4xx or 5xx, one path declared with two statuses, or a `--routes` value that names no
file and is not a list of `/paths` (a mistyped `page-map.json`) is a usage error, not a route; so is a path
that is not requested exactly as written (`//host/x`, a fragment, a dot segment, a backslash, a space, an
unencoded or control character), and a `--routes` that names a directory or a FIFO. The only redirect
followed is WordPress's trailing-slash canonical — a 301/308 to the same origin and query whose path differs
by one trailing `/` — and never for a route declared to redirect: a redirect to another origin, query or path
is recorded as the status it is.

### Content contract (bind test)
A site built from a quickstart is **bound to a content contract** by the platform at provision: the latest Claude Cowork
plugin is installed, then `content.contract` `bind` (id `<slug>/wp7/<version>`) and `inspect`. Profiles live in the TCH repo and
ship with the plugin; a release version without a profile uses the nearest lower profile of the same major. This step runs **every
release**, after pack + verify, **on the restore** — before, nothing in the flow checked it, and failures only showed after release.

```
node scripts/quickstart/contract-bind.mjs --wp "<runner verify, www-data>" --site-url <url curl can reach> \
  --contract <slug>/wp7/<version> [--plugin <zip url|path>] [--curl "<runner curl>"] \
  --pack <pack> --theme-zip <theme zip> --out <dossier>/contract-bind
```

`--site-url` is the address the curl runner can reach (when curl runs in a container it is not the host's `127.0.0.1`;
`--curl` takes a prefix ending in `curl`, the body goes through stdin). Without `--plugin` the plugin must already be active.
The token is read from the stand's `claude_cowork_token` option, lives only in the request body, and is stripped from everything printed and written.
`--out` receives `bind-answer.json`, `inspect-answer.json` (absent when refused) and `contract-bind.json`
(`{tool, contract, pluginVersion, bound, refused, alreadyBound, error, problems, warnings, warningCodes, entities, ranAt}`, and with
`--pack` / `--theme-zip` also `pack: {manifest, webrootArchive, databaseArchive}` — the same identity restore.json and parity.json record —,
`themeZipSha256` and, when `--plugin` is a local file, `pluginZipSha256`; a URL `--plugin` cannot be hashed, so `null`).
The `--wp` runner ends in `wp` (e.g. `docker run --rm --network <net> --user 33:33 -e WORDPRESS_DB_* … -v <vol>:/var/www/html wordpress:cli wp`) — run for real in this shape; `--curl` is `docker exec -i <web> curl`. When `--plugin` is a local file the runner must see the file at the same path (docker runner: add `-v <zip>:<zip>:ro`), otherwise `plugin install` says "could not be found" — hit on a real stand. A re-run on a stand already bound to the same contract gets `conflict` "already bound" from the plugin: the tool goes on with `inspect`, exit 0, `alreadyBound: true`.

| Exit | Meaning | What to do |
|---|---|---|
| 0 | **bound** — changed theme files show as `PRESENTATION_DRIFT` warnings (0–42 on the ports measured; JA Essence 1.0.3: 7) | ship with the existing profile |
| 3 | **refused** (`contract_failed`, e.g. `Slot home-2.newsletter.subtext: block newsletter.subtext is not in this pattern`) — the release changed content structure the profile names (a block removed from a pattern, an entity removed or duplicated); prints the first five problems | the release needs its own profile: capture it in TCH (`packages/cms/tracy-quickstart-tools/batch-contracts.mjs capture --platform wordpress --only <slug>`, ~2 minutes on a throwaway stand), ship it in a plugin release, then re-run. Do not ship until bound |
| 1 | tool/transport broken: plugin not installed, no token, no JSON, or the plugin returned an error other than `contract_failed` (e.g. `contract_unavailable`: the plugin does not carry that contract id, or the site is held on another contract) | fix the environment and re-run; **never** read it as "refused" |

The **first** release of a port always has to capture a profile. `release.mjs` **requires** `--contract-bind <contract-bind.json>`
with no way out: the record must be this tool's, `bound: true` (a re-run's `alreadyBound` also counts), run against the exact pack and
theme zip being released, and run **after** the restore finished; the result goes into `contractBind` of `VERIFICATION.json`.
A port that cannot be bound needs a profile first (the exit 3 row above); do not release.

Two traps: **never run before pack** — a packed archive must not contain the plugin or its binding (secret-scan
also catches the token option); and the restore's webroot is root-owned as packed, so **chown to uid 33** (with `--root-b`)
before installing the plugin, as the fleet does, otherwise `plugin install` dies unable to write the directory.

### `release.mjs` — release folder
`--pack … --out <stand>/release --parity … --restore-report … --run-root … --spec … --theme-zip <theme zip>
--visual-ledger <rounds.jsonl> --checkpoint <run> [--restore-smoke <run>] --behaviour-sweep <site-sweep.json> --contract-bind <contract-bind.json> [--setting-template <released tracy_setting.json>] [--card <tracy_design_inspiration.json>] [--asset <profile zip>]… --title "…"`. `--run-root` also holds the **finish audit** `port-audit.json` (`review/port-audit.mjs --dossier <run-root> --interaction <tier>/interaction.json,… --out <run-root>/port-audit.json`): a clean receipt of the restored site and every route of the page map, whose hashes of `DECISIONS.md`, `cms-allow.json`, `behavior-copy.reviews.json`, the acceptance files (`design-contract.json`, `visual.contract.json`, `review.config.json`, `parity-accepted.json`) and spec binding files (`page-map.json`, `reference.json`) match this dossier now and whose interaction records are those of the tiers measured on the restored site — the four tiers' own on the full path, the `--restore-smoke` run's own (`<smoke dir>/interaction.json`, not the build stand's four) on the reuse path — each attesting every owed case as measured (`[audit-missing|not-clean|stale|site|routes|inputs|input-unsafe|input-missing|interaction|interaction-missing]`). **A first release (not `--patch`) carries a behaviour pass** — `--behaviour-sweep`: the `site-sweep.json` of
`site-sweep.mjs --zip <theme zip>` (no `--only`: the default is all eleven checks; on a dossier that already has a sweep history add `--full --reason "<text>"` — a scoped re-run carries checks and is refused) run on the **restored pack**
(the restored site, after the restore finished, on this theme zip, every route of the visual contract). Every group it reports is **fixed** (rerun until the
any of the eleven checks reports none; every check must also have passed with at least one case measured) or **recorded** through `review.config.json` `sweep.accept` (one decision of `DECISIONS.md`, evidence, explicit routes —
`site-sweep-accept.mjs`; a not-measured cause the port measured by hand is a row of kind `not-measurable`). Without it the release, and `cycle.mjs` before its first phase, is refused `[behaviour-pass-missing]` with the command to run; the other refusals are
`[behaviour-pass-invalid|checks|defects|accept|unmeasured|site|artifact|stale|narrow]`. Why: the classes found by hand on the shipped ports (touch menus, first-click
toggle, forms, icons, CMS wording, truncation) were seen by no other machine tier. A `--patch` release is unchanged: it takes its own `--measure`. Nothing is written
until the release is accepted — see *Release acceptance* below. Gathers the assets,
`VERIFICATION.json` (from parity + restore), `README.md` (how to restore on the fleet and by hand),
`release-notes.md` (fills `{{placeholders}}`; if a `{{` remains it finishes but **exits 1 and prints no publish command** — fill it in and re-run, the notes are kept), `SHA256SUMS`; **prints** the publish command, does not run it (`gh auth status`
on the org first). It asks `gh release view <tag>` (read only): release **does not exist** → `gh release create --draft`;
release **exists** (a re-run after a fix) → `gh release upload <tag> --clobber` then `gh release edit --notes-file`;
cannot ask (gh missing, not logged in, network) → prints both and says why. Uploads go in groups, **one command
per group, run in turn**: archives, metadata, `tracy_setting.json` last — gh uploads the files of **one** command in
parallel (5 streams), so the order within one command is not an order; an upload cut off midway leaves no settings file pointing
at something not yet uploaded. A git tag that exists while the
release does not still counts as "does not exist": `create` attaches to the existing tag.

**Metadata every release needs** (both modes): `tracy_setting.json` and `tracy_design_inspiration.json`.
- `--setting-template <the port's released tracy_setting.json>` (any earlier version): the tool writes a new file — `version` from the manifest, `install.webroot` / `install.database` take the new file names and sha256 from the manifest,
  `cms` follows the manifest's `wpVersion` (with a note if it changes), **everything else unchanged, in the template's key order**. A template of another port (`template` other than the manifest id's slug, a different `platform`) is refused (`metadata-invalid`).
- `--card <tracy_design_inspiration.json>`: copied **byte for byte**; a card whose `template` is not this port is refused.
- A fix release carries what `--previous` carried. `patch-chain.mjs` defaults `--setting-template` and `--card` to the previous directory's `tracy_setting.json` and `tracy_design_inspiration.json` and passes every other `tracy_*.json` there as an `--asset`, copied byte for byte. `release.mjs --patch` refuses (`metadata-missing`, naming each file) when the previous directory holds a `tracy_*.json` the new release would not carry, and (`metadata-changed`) a copy whose bytes differ, the card included (a `--card` must hold the previous card's bytes). A `--previous` directory is read only after its `SHA256SUMS` verifies: the file must be readable and non-empty, every line `<sha256>  <plain file name>` once, each listed file there with the listed bytes (`release-notes.md` included), `manifest.json`, `VERIFICATION.json`, `README.md`, every asset the manifest names and every other file in the directory (but `release-notes.md`) listed, and every `tracy_*.json` a regular file; otherwise the chain or the release stops with that file named.
- Both (and the measure file of a fix release, see below) go into `manifest.assets` and `SHA256SUMS`; the printed upload order still keeps `tracy_setting.json` **last**, in its own command. Without the flag the release has no such file
  (do not `--asset` a file with the same name: it is refused as a second asset).

**JSON the tool writes is bound by hash — the host repo's formatter must not touch it.** `VERIFICATION.json`, `manifest.json`, `SHA256SUMS`, `fix-measure.json` (in `<dossier>/release/`), `port-audit.json`
(in `<dossier>/`), `contract-bind.json` are hashed on acceptance (`SHA256SUMS`, `acceptance.audit.sha256`, `measure.evidence`, `contractBind`), and `release.mjs` hashes them again right before swapping the directory. A host repo must **exclude
`<dossier>/release/**` and `<dossier>/port-audit.json` from its formatter** (biome/prettier `ignore`, and from CI's `format --check` step). Do not try to imitate the formatter in the tool: JSON the tool writes is hashed bytes, one changed newline
is a different hash. The real reason: two ports reformatted these files and then regenerated `SHA256SUMS` by hand, one of them turned CI red — and a hand-made SHA256SUMS no longer proves what the tool accepted.

### `tracy_site_pages.json` — the pages Tracy lets a customer keep or hide

Tracy's "Customize your site" sheet asks which pages to keep (the **Pages** question). It reads the list from
`tracy_site_pages.json`, attached to the release beside the pack: `{ "pages": [{ "id", "label", "home"?: true }] }`
— `id` is the page **path** (`get_page_uri`: parent slugs joined by `/`), `label` its menu label, exactly one entry
`home: true` (= `page_on_front`, not a guessed `home` slug). The list is **level 1 of the header's main
navigation** (the `wp_navigation` the header part's first Navigation block `ref`s); custom links are matched to a
page by URL or dropped with a warning; submenus stay out. A release without the file leaves the question empty.

Written by the `tracy-dev` plugin's tool (TracyHQ/tracy-template-dev PR #1, draft at `c510e2bc` — run it from that
branch until it merges), from the pack this phase built:

```
tracy-dev site-pages --wordpress <pack>/database.sql.gz [--webroot <pack>/webroot.tar.gz] --out <stand>/site-pages
tracy-dev site-pages --wordpress <pack>/database.sql.gz [--webroot …] --check <stand>/site-pages/tracy_site_pages.json   # "ok: N pages resolve"
tracy-dev site-pages --release <tag> [--out dir]    # a release already published
```

`--webroot` is for a theme whose header lives only in `parts/header.html` (no DB copy). Read the warnings (skipped
custom links, utility-looking pages kept on a menu) before you attach it; an id that is not exactly one page stops
the tool. Pass it to `release.mjs` with `--asset <stand>/site-pages/tracy_site_pages.json` (outside `--out`: release.mjs swaps that directory whole) so it rides in
`manifest.assets` and `SHA256SUMS`; for a release already out, `gh release upload <tag> tracy_site_pages.json`.

### Road to live — TCQR and TDSR on the release folder

> **Do not wait for the release folder.** The same two checkers run on a *provisional* folder at the pilot, and the
> measurement image is checked at the start of the run. One script does both and sorts the answer into
> blockers / worth-fixing / pending (`scripts/quickstart/road-precheck.mjs`, test `scripts/test/road-precheck.test.mjs`):
>
> ```bash
> node scripts/quickstart/road-precheck.mjs --prereq --build                      # run start: tracy/web-wordpress image on this machine, else built (DEFAULTS_ONLY=1 bash web/build.sh wordpress)
> node scripts/quickstart/road-precheck.mjs --theme-zip <zip> --slug <slug> --version <x.y.z> --pack <pack> [--site-pages f] --stage pilot     # pilot gate (measurement-protocol §3.5)
> node scripts/quickstart/road-precheck.mjs --release <stand>/release --tag <product>/wp7 --stage release                   # release gate: exit 0 or no release
> ```
>
> It finds the TracyHQ checkout from `--tch`, `$TCH_REPO`, the checkout this skill sits in, then the current directory;
> `--json` prints the verdict. Exit 0 = nothing blocks; 1 = a blocker (every `X` line, with its `fix`); 2 = it could not
> run. **Blockers** are every failing must-fix rule (a rule `rule-severity.json` does not name counts as must-fix) and a
> slot contract that is missing (at the release stage also `ready:false`, and any preview rule still `unmeasured` — the
> /ops `ds-not-at-probe`). At the pilot, `unmeasured` rules and `tracy_site_pages.json` (built from the pack by
> `tracy-dev site-pages`) are *pending*, said but not blocking. The slot contract is written at the pilot:
> `packages/design/tracy-ds-slot/templates/wordpress-<stylesheet>.json`, a draft from `pass-wordpress.mjs` step 2 or
> copied from `wordpress-ja-morgan.json` / `wordpress-ja-vega.json`; `ready:true` and the version range follow once the
> release is measured (`flow.mjs`), which is why the draft is pending at the pilot and a blocker at the release.
> A VARS-1 gap at the pilot is closed by the repo's `role-scan.mjs`, which the script runs on the theme zip itself.


Tracy /ops scores every release on nine Road-to-live steps (`ROAD_STEPS`, `apps/tracy-web/src/lib/road-to-live.js` in the
TracyHQ app repo). The gates above cover release, install file and contract; **Customize your site** and **Design system**
are scored by two checkers of that repo, which read the release folder. Run them from a bootstrapped checkout of it
(`pnpm install`), on the folder `release.mjs` wrote (first release and `--patch` alike), again after every rewrite of it,
and last on the folder you publish:

```bash
node scripts/template-customization-question-readiness.mjs <stand>/release --tag <product>/wp7   # TCQR: Customize your site
node scripts/template-design-system-readiness.mjs <stand>/release --tag <product>/wp7            # TDSR: Design system
node scripts/template-design-system-readiness.mjs <empty dir> --tag <product>/wp7 --fetch        # TDSR on the published release; must match /ops
```

- **Input.** A folder of release files as GitHub serves them. Both start from `tracy_setting.json` (a release written
  without `--setting-template` has none); TCQR also reads the database and `tracy_site_pages.json`, which the release
  folder must carry (REL-2 and the PAGE-* rules read it; generate, check and attach it as in
  §`tracy_site_pages.json` above); TDSR reads the theme zip (and the webroot and database for
  PIC-1). An asset a rule cannot read is reported on that rule, not as a crash.
- **Gate.** Exit 0 = no rule fails; exit 1 = one does; exit 2 = the release cannot be identified (no `tracy_setting.json`,
  or one that is not valid) or the command cannot run. Each `FAIL <rule>` line carries its `owner` and `fix`. Whether a
  failing rule is **must-fix** (holds Publish) or **worth-fixing** (only warns, the step stays short of done) is set by
  `rule-severity.json` beside each checker (`apps/tracy-web/src/lib/template-customization-question-readiness/`,
  `…/template-design-system-readiness/`); a rule the file does not name counts as must-fix. The gate, on the final
  release folder: **0 failing must-fix rules** in either checker — no decision waives one; every worth-fixing rule
  left is fixed or recorded as a decision in `DECISIONS.md` whose text names the rule id.
- **Design-system measurement.** TDSR's built-site and preview rules are scored from `design-system-measurement.json`
  of this version (in that repo, in the version's contract folder under `packages/cms/tracy-wordpress-quickstart/contracts/`,
  or the `designSystem` block of the release's `VERIFICATION.json`). A version with no file, or with preview rows of an
  older preview probe, prints those rules `unmeasured`, which alone does not make the exit code 1 (exit 0 when no other rule
  fails); `unmeasured` is never a pass. A preview rule (`question:
  "Preview"` in `rule-severity.json`) left unmeasured is must-fix and /ops holds Publish (`ds-not-at-probe`), so the
  gate requires **no unmeasured preview rule**. Any other built-site rule left `unmeasured` takes the worth-fixing path:
  measured and fixed, or a decision in `DECISIONS.md` naming the rule id — some can only be measured once Tracy has
  built a site from the release, so they do not block this phase. The `fix` of an unmeasured rule
  prints the commands that measure this version from a checkout of that repo, and only the ones it needs: a stand
  restored from the release (`packages/design/tracy-ds-slot/scripts/stand.mjs up`), the built-site run under the 15
  featured systems (`flow.mjs … --measure-version`, left out when only the preview rows are stale), the Add site
  preview light and dark (`apps/tracy-web/scripts/preview-check.mjs … --write`, current preview probe),
  `stand.mjs down`; then the file is committed in that repo. Run them as printed. **A release is not finished with a preview rule still `unmeasured` or the slot `ready:false`**: `road-precheck.mjs --release … --stage release` exits 1 on both, and it is the last command before publishing.
- **Slot contract.** TDSR's SLOT-1 and SLOT-2 need `packages/design/tracy-ds-slot/templates/wordpress-<slug>.json` in
  that repo, `ready`, with `[minVersion, maxVersion]` covering this version (examples: `wordpress-ja-morgan.json`,
  `wordpress-ja-vega.json`). The gate requires it: without it the Design system button refuses every site built from
  the release. Writing or widening it is a change to that repo (`owner: contract`, needs no new release); a theme
  failure (`owner: template`) needs a new theme zip, so pack and release again and rerun both.
- **Fix loop for rules that fail only under a worn system.** Most TDSR template failures (CON-*, TPL-1, BTN-1, ICON-1,
  HOVER-1, GRAD-1, ACCENT-LEAK…) come from CSS that applies only while a system is worn. Do not run pack → checkpoint →
  contract-bind → release → measure per attempt (about an hour each; JA Diner and JA Fresco spent several such rounds on
  a handful of rules). Loop instead, about ten minutes per turn: (a) look first at how the Joomla quickstart of the same
  product answers the rule (`packages/design/tracy-ds-slot/templates/joomla-<product>.json`, its contract folder and
  journal), (b) edit and rebuild the theme zip only, deploy it on the restore stand or a provisional stand,
  (c) show the unworn page unchanged: computed-style diff on the touched selectors and pages, desktop and phone, 0
  differences, (d) run the measurement TDSR prints (`flow.mjs` under the 15 systems, `preview-check.mjs` light and dark)
  on that stand and read the failing rows. Repeat until TDSR has no must-fix left, then run the full chain **once** and
  measure the release folder. A port already released ships a fix proven worn-only by (c) through the `--patch` path
  (§Release a fix version) with its own `--measure`. An unworn difference found in (c) is a parity change, released or not:
  it leaves this loop and goes through the visual checkpoint (`round.mjs`, Done rule in `SKILL.md` 8b) before any
  release, `--patch` included, since `release.mjs --patch` does not read checkpoint evidence.
- **Fixes.** The `tdsr` skill of that repo (`.agents/skills/tdsr/SKILL.md`) explains every TDSR rule, where it is fixed
  and how to measure on a built site.
- **On a built site** (once Tracy has built a site from the release), TCQR measures what the static check cannot see:
  `node scripts/template-customization-question-readiness-built-site.mjs --site <built site> --demo <demo> --set full|blank`
  (read only; exit 0 = no check fails, NOTE checks never fail; 1 = one fails; 2 = usage error).

### Release a fix version (`release.mjs --patch`)
**When it is allowed:** a fix of a port **already released**, changing a few theme files (CSS/JS/PHP), with the result measured by targeted checks.
**When it is not** — take the full gate (four-tier checkpoint + contract): the **first** release, a redesign, or any bulk route/template/part/pattern
change (`--changed-from` warns past a threshold, see below). The stopping rule of a fix release is still SKILL.md §Done rule item 3.

```
node scripts/quickstart/release.mjs --patch --pack <pack> --out <release> --parity … --restore-report … --spec <spec-pack> --run-root <dossier> \
  --theme-zip <zip> --contract-bind <contract-bind.json> --previous <previous release | VERIFICATION.json> --measure <fix-measure.json> \
  [--setting-template <tracy_setting.json>] [--card <tracy_design_inspiration.json>] [--no-baseline "<reason>"] [--changed-from <previous theme zip>] [--asset …]
node scripts/quickstart/cycle.mjs … --patch --previous … --measure … --run-root <dossier> --spec … --theme-zip … --contract <id> [--to verify | --from contract-bind]
```

Cycle `--patch` runs the same five phases + contract-bind and skips the contract preflight; the measure is taken on the restore, so it cannot exist before pack
(`[measure-before-pack]`): `--to verify` → run the port's measuring script on the restore stand → `--from contract-bind`. `--previous` and `--measure` are **required only when the plan reaches the release phase**
(`[release-input-missing]` names them before any phase runs): `--to verify` does not need `--measure` — the file cannot exist yet. `--setting-template` / `--card` pass through the cycle to `release.mjs`.

**Acceptance evidence** (one code per reason, as in the full gate):
- `--previous` (`previous-*`): the previous version's `VERIFICATION.json` (or directory), **same `release` id, lower version**. No checkpoint needed — the port's last
  full checkpoint may be several versions back; `VERIFICATION.json` records its `gate` and `visual` as they are.
  One single normalisation is accepted: a `release` missing the manifest id's `quickstart/` prefix (`ja-vega/wp7` versus `quickstart/ja-vega/wp7` — every hand-assembled earlier version has this shape). The tool prints one `note:` line and records
  `previous.normalised: {release: {from, to}}` in `VERIFICATION.json` (`previous.release` stays the previous version's text verbatim). Any other mismatch is still `previous-mismatch`.
- `--measure` (`measure-*`): `tracy-fix-measure/v1` written by `lib/fix-measure.mjs` (`writeFixMeasure` / `validateFixMeasure`) from the port's measuring script —
  `{schema, tool, ranAt, site, source, artifact: {themeZipSha256}, checks: [{id, title, pass, cases?, defects?, rows?, note?, new?, why?}], passed, total, baseline: {version, passed, total, ranAt, checks?: [{id, pass}]} | null, notDefects: [{what, why, evidence}]}`.
  `defects` is a **count**; the detail of each defect lives in `rows` (a list, one element per defect) or `note` (text) — putting a list in `defects` is `measure-invalid`.
  Accepted when: every check passes (`measure-failed`); `themeZipSha256` is the `--theme-zip` (`measure-artifact-mismatch`); measured **on the restore stand** — `site` is
  `parity.b` and `ranAt` after the restore finished (`measure-site`, `measure-stale`); it has a `baseline` on **exactly the previous version**, judged **per check, not by count**
  (`measure-baseline-*`): each check of the measure is either **in `baseline.checks` (by `id`)**, or declared `new: true` with `why` (a check the port's script added for the first time, never run on the previous version — `measure-baseline-undeclared`,
  `-mismatch` when new is declared for a check that did run); a check in the baseline but missing from the measure is refused (`measure-baseline-dropped`: a check must not silently disappear); and **at least one check present on both sides must FAIL in the baseline**
  (`measure-baseline-passed`: a check that was never red proves nothing; `new` checks do not count). A count-only baseline (no `checks`, like an old measure or a port's hand-built script) keeps the old rule: same number of checks and no `new` allowed —
  build a per-check baseline with `fix-measure.mjs merge --baseline-measure` (below). Or `--no-baseline "<reason>"` (only when the measure has no baseline), the reason recorded verbatim.
  The release copies the measure file byte for byte as **`fix-measure.json`** (into `SHA256SUMS` and `manifest.assets`).
  **The measure must be a full run, taken against the source as it is now.**
  - *Scope.* The measure carries a `coverage` block (written by `site-sweep.mjs --zip`; `lib/sweep-coverage.mjs`) and the release checks it against the dossier's `visual.contract.json`: every check of `ALL_CHECKS`, every renderable route of the contract (compared by identity, not by count), the standard widths, heights widths and schemes. A run narrowed by `--only`, `--pages`, `--widths` or `--schemes` (`measure-scoped`), a measure that carries evidence it did not measure (`measure-carried`), a missing check (`measure-checks-missing`), a missing or extra route (`measure-routes-missing`), other axes (`measure-axes-missing`), no coverage at all (`measure-coverage-missing`, `measure-coverage-invalid`) or no contract to take the routes from (`measure-contract-missing`) is refused. A port's own script check is merged into the sweep's measure with `fix-measure.mjs merge`; the merge keeps the sweep's coverage and never turns several scoped runs into a full one.
  - *Proof.* The measure's `coverage` is a claim; the release holds it against the `site-sweep.json` it stands on (`--sweep <file>`, default `site-sweep.json` beside the measure; `measure-sweep-missing`, `measure-sweep-unreadable`, `measure-sweep-mismatch`). The coverage is recomputed from that document's own rows (checks not carried, routes, widths and schemes of its rows and heights cells), its theme zip, site, source fingerprint and per-check results must be the measure's; its `ranAt` must be a valid time after the restore finished, not in the future and not before the measure's (`measure-sweep-stale`, `measure-sweep-invalid`) — checked at both acceptances. A sweep run with `--only`, `--pages`, `--widths` or `--schemes` is a scoped run even when the value spells out the whole scope: the sweep records the options by presence.
  - *Source.* `site-sweep.mjs` records a fingerprint of the source's served home page (`lib/source-fingerprint.mjs`: the home URL, the SHA-256 of the HTML — parsed as a browser with scripting on reads it, so `<noscript>`, script, style, textarea, title, plaintext and comments are text — with only the declared volatile attribute values of real elements removed — a CSRF meta token, a 32-hex hidden-input name, `nonce` values — and the template identity of the spec-pack's `provenance.json` when it has one) in `site-sweep.json` and `fix-measure.json`. It is a fingerprint of the home page and a declared identity, not a hash of every asset. The release reads again the source the evidence names (its `source`) and refuses a measure whose fingerprint differs (`measure-source-changed`), is missing (`measure-source-missing`), cannot be compared (`measure-source-unreadable`, `measure-source-mismatch`), or whose baseline was taken against another source or records none (`measure-baseline-source`). Evidence taken against the same source served at another origin than the contract's `source.site` is accepted when its fingerprint is of the home URL of the origin it names, its template identity is the spec-pack's, the live fingerprint of that source equals the recorded one, and its home page is the dossier's: the SHA-256 of the spec-pack's `kind: html` reference for the page at `/` when it holds one, otherwise of the contract's `source.site` home page read now; with neither, or when it differs, it is refused (`*-source-mismatch`). That identity check compares home pages and a declared template name only: it cannot tell two sources apart whose home HTML is the same, nor see a change confined to other pages or assets. `VERIFICATION.json` records the origin the evidence was taken against (`measure.source`; `acceptance.behaviour.source`). The same gate holds a full release's `--behaviour-sweep` (`behaviour-source-*`). It runs at the first acceptance and again just before the release is published.
  - *`--no-baseline "<reason>"`* stays free text, because the release cannot check it. It is recorded as an unverified exception: `VERIFICATION.json` carries `noBaselineVerified: false`, and `release-notes.md` — including notes kept from an earlier run — says that no baseline was measured and that the reason is the releaser's statement.
  `notDefects` (differences that are not defects, each line with evidence) are recorded and go into the notes.
- Runtime identical to the full gate: restore report + parity tied to this pack, access probe as the runtime user; `--spec` only to read `page-map.json` (each route's status). The dossier's `visual.contract.json` is read for exactly two things: `pages` (the routes to measure) and `source.site` (the source the evidence is judged against); `design-contract.json` is not read, and the freshness of neither contract is checked. Plus the contract bind (`--contract-bind`, section above).
- **Finish audit (`audit-*`)** — a fix release still needs a clean `port-audit.json` in the dossier (`--run-root`, required in both modes). A fix release has no four-tier run, so
  the receipt is tied to the **theme zip and the restore stand**, not to `interaction.json`: run `port-audit.mjs --site <restore stand> --routes <page-map.json> --dossier <dossier>
  --theme-zip <zip> --out <dossier>/port-audit.json` **after the restore finished**. The release requires: a `scope: patch` receipt, clean (every check ok), `site` the stand that restore + parity confirmed, covering every
  route of `page-map.json`, `theme` the sha256 of `--theme-zip` (`audit-theme`), not older than the end of the restore, not older than the theme zip or any file the dossier binds
  (`audit-stale`), and the hashes of `DECISIONS.md` / `cms-allow.json` / `behavior-copy.reviews.json` / acceptance files recomputed from the release's dossier match (`audit-inputs`).
  **"Clean" for a `scope: patch` receipt = no *site-facing* finding:** `cms-leftovers` (source-CMS text customers can read) and `behavior-copy` (copy promising unreviewed behaviour; a form posting to `admin-post.php` is read by **the handler it declares** — hidden input `action` or `?action=` — not assumed to be a contact form: a `*remind*`/`username` handler is `username-reminder`, so the promise "username will be emailed" is not treated as false; an unrecognised handler is an unknown claim that still needs review, not a contradiction; changing the feature changes `claimHash`, so the old review of that claim must be redone once) — plus everything the audit measures on the rendered site.
  The two *dossier bookkeeping* classes — `decisions` (a decision with no declared substitution, duplicate ids) and `exceptions` (an acceptance row that does not cite exactly one decision about its key) — are still counted, recorded in the receipt and
  `VERIFICATION.json` (`acceptance.audit.advisories`, counted per class), and `release.mjs --patch` prints `WARNING: N acceptance row(s) / M decision(s) do not validate; a full release of this port needs migrate-port first`,
  but they do **not** make the receipt dirty. Why: those rules guard the FULL gate, where acceptance files decide which visual findings are accepted; a fix release runs no four-tier checkpoint and reads no acceptance file to accept anything,
  while `migrate-port.mjs` measured dozens of decisions needing a person — a measured fix release need not wait for them. The full gate (Fast Gate, group verdict, full release) keeps every class.
  A fix release reads from the dossier exactly what the audit binds (`DECISIONS.md` and the optional files); it does not check the freshness of `design-contract.json` / `visual.contract.json` (it reads `visual.contract.json` only for `pages` and `source.site`, see *Scope* and *Source* above).
- Ignored with a `note:` line if passed: `--visual-ledger`, `--checkpoint`, `--restore-smoke` (`--run-root` is **no longer** ignored).
- `--changed-from <previous theme zip>` (optional; must be the zip the previous version recorded, if it recorded one): records added/removed/changed theme files in `changedFrom`.
  **Warns** (does not refuse) when more than 3 `templates/`, `parts/`, `patterns/` files changed, more than 15 theme files changed, or no file changed — the JA Essence 1.0.5 fix changed 6 files, no structural file.

**Default measurement of a fix release:** `node scripts/visual/site-sweep.mjs --site <restore stand> --source <source> --run-root <dossier> --zip <theme zip> [--baseline <previous version's sweep> --baseline-version <v>] --out <dir>`
([`visual-qa.md`](visual-qa.md) §Whole-site sweep) — eleven checks (horizontal overflow, scheme, page background, header, chips, plus five behaviour checks, plus `heights` measuring page and per-band height) on every route × width × scheme, writing directly the `fix-measure.json` that `--measure` takes. On a dossier with a sweep history (`<run-root>/site-sweep-state.json`) the measuring run and the baseline run are full runs: `--full --reason "<text>"` — a scoped re-run writes no `fix-measure.json` ([`visual-qa.md`](visual-qa.md) §Re-runs); `patch-chain.mjs` passes it itself.
On top of that comes the port's own check for exactly the spot just fixed (`writeFixMeasure` can merge two sources of checks; see `fix-measure.mjs merge` below). Sweep the previous version (same checks; the default is all eleven, so a five- or ten-check baseline is refused with a sentence saying how to fix it) to get a `baseline`: at least one check must FAIL there. **A baseline needs the previous version's `--zip`** (it names the version measured) or `--baseline-version <v>` when that sweep had no `--zip`:
**A port with a ten-check baseline (the previous version ran the sweep before `heights` existed).** The default sweep is now eleven checks, so `--baseline` on a ten-check output is refused (`--baseline ran 10 check(s) … from before the heights check existed`). Three ways, pick one:
(1) re-run the baseline sweep on the **previous version's zip** without `--only` (eleven checks), then `--baseline` as usual — the preferred way, since `heights` then has a previous result to compare; (2) run the fix with `--only overflow,scheme,background,header,chips,fixed-widgets,icons,forms,text,first-interaction` against the ten-check baseline, run `heights` separately (`--only heights --zip <fix zip> --out <dir-h>`), then `node scripts/lib/fix-measure.mjs merge <ten-check fix-measure> <dir-h>/fix-measure.json --new heights='<why this check never ran on the previous version>' --out <file>` — the `heights` check carries `new: true` + `why`, and the release requires no baseline for it; (3) if the fix needs no `heights` evidence, run `--only` with exactly the ten ids. Do not hand-edit `baseline.checks` to match.

the baseline sweep is `site-sweep.mjs … --zip <PREVIOUS version's theme zip> --out <sweep-base>`, then `--baseline <sweep-base> --baseline-version <v>` on the final sweep (without a version it says `a baseline run needs --zip …`; a file that is neither site-sweep.json nor tracy-fix-measure/v1 gives `neither a site-sweep.json nor a tracy-fix-measure/v1 document`). The `baseline` the sweep writes now carries **each check** (`baseline.checks: [{id, pass}]`, read from the previous sweep's `checks`), so `release.mjs --patch` holds it by `id`; a port adding its own checks merges the measure with `fix-measure.mjs merge --baseline-measure` to declare `new`. Defects of the source itself, or differences kept on purpose, are recorded through `sweep.accept` ([`visual-qa.md`](visual-qa.md) §Recording source defects), not by building the release by hand.
Exit 3 (something left unmeasured) or 1 means `fix-measure.json` has a check with `pass: false` and the release refuses; do not edit the file, measure again.

**Merging measures — `node scripts/lib/fix-measure.mjs merge <a.json> <b.json> … --out <file> [--baseline-measure <fix-measure.json|site-sweep.json of the previous version's measurement> … --baseline-version <v>] [--new <id>=<reason> …]`.**
Merges measures of **the same theme zip and the same site** (a different zip or site is refused, duplicate ids are refused); `ranAt` is the earliest time (merged evidence is as old as its oldest check); `notDefects` are concatenated; `tool` joined with ` + `. The baseline merges **per check**:
`--baseline-measure` takes the previous version's measurement file (the same sweep or the port's script run on the previous version) and replaces the inputs' baseline with its per-check results (`--baseline-version` required with it); a count-only baseline
cannot be merged and the tool says to pass `--baseline-measure`. `--new` marks a check the previous version never ran. **Ids must not repeat across measures**: a port's own script emitting checks `icons`, `forms`, `text`, `chips`… collides with the sweep's checks of the same name (eleven ids: `overflow, scheme, background, header, chips, fixed-widgets, icons, forms, text, first-interaction, heights`) — give the script's checks their own ids (a prefix, e.g. `<port>-icons`, `<port>-forms`); on a collision `merge` refuses and names **both sources** (`check icons is in measure 1 (<file>, tool site-sweep.mjs) and in measure 3 (<file>, tool measure106.mjs)`). Example JA Essence 1.0.6 — sweep (6 checks) plus the port's own script (3 new checks) over version 1.0.5:
```
node scripts/lib/fix-measure.mjs merge sweep-r6/fix-measure.json measure106/fix-measure.json \
  --baseline-measure sweep-base/fix-measure.json --baseline-version 1.0.5 \
  --new wording="check added in 1.0.6, never run on 1.0.5" --new slider="…" --new icons="…" \
  --out measure-merged/fix-measure.json
```
(The port's script may already declare `new: true` + `why` inside `checks` when it calls `writeFixMeasure`; then `--new` is not needed.) Errors exit 2 and write nothing. The same function is `mergeFixMeasures` in `lib/fix-measure.mjs`.

**Theme version reminder:** after the publish command, `release.mjs --patch` prints a `REMINDER` when the `Version:` in the theme zip's `style.css` is not higher than `--previous` (sites already on that version will not see the update) or the version cannot be read from the zip.

**What it leaves:** `VERIFICATION.json` with `gate: "patch"`, `visual: {checkpoint: null, reason: …}`, `contracts: null`, `measure` (summary + file hash), `baseline` /
`noBaseline`, `notDefects`, `previous`, `changedFrom`, `contractBind`, `acceptance` (three artifact hashes, runtime, `audit`: hash + time + scope of the receipt). `release-notes.md`: if absent the tool writes a **complete version, no `{{`**
(title, "Fixed in <version>" listing the checks' titles, notDefects, verification); if present it is kept.

### Patch release recipe

The order of commands for a fix release of a port already released. Every flag below is one the tool
declares today; `node <tool> --help` prints the full list.

1. **Restore the previous release on a clean stand**, so the previous version can be measured. A release
   directory carries the pack's `manifest.json`, `SHA256SUMS` and both archives, which is what `--pack` reads:
   ```
   node scripts/quickstart/restore.mjs --pack <previous release dir> --root-runner "<root runner>" --wp "<www-data runner>" \
     --site-url <stand url> --db-host verify-db --db-password-env MARIADB_ROOT_PASSWORD --wipe --report <dir>/restore.json
   ```
2. **Measure the baseline there**, with the previous theme zip (it names the version measured) and every check:
   ```
   node scripts/visual/site-sweep.mjs --site <stand url> --source <source> --run-root <dossier> --spec <spec-pack> \
     --zip <previous theme zip> --full --reason "baseline <previous version>" --out <sweep-base>
   ```
3. **Run the chain** with that baseline: cycle (`--patch --to verify`) → full sweep → port-audit → contract-bind →
   `release.mjs --patch` (the release lands in `<out>/release`):
   ```
   node scripts/quickstart/patch-chain.mjs --out <dir> --stand <dir> --theme-zip <zip> --source <url> --baseline <sweep-base> \
     --previous <previous release dir> --contract <slug>/wp7/<version> --run-root <dossier> --spec <spec-pack> --routes <page-map.json> \
     --id <id> --version <v> --site-a <url> --site-b <url> --wp-a "<runner>" --wp-b "<runner>" --root-b "<root runner>" [--baseline-version <v>]
   ```

**When the previous version cannot be measured** (`--no-baseline "<reason>"`). Do not give it to
`patch-chain.mjs`: the chain's sweep always takes `--baseline <dir>` (a required flag), so its measure carries a
baseline, while `--no-baseline` is forwarded to the release, which then refuses both together
(`measure-baseline-conflict`). Run the same phases one by one instead:
```
node scripts/quickstart/cycle.mjs … --patch --previous <previous release dir> --run-root <dossier> --spec <spec-pack> --theme-zip <zip> --contract <id> --to verify
node scripts/visual/site-sweep.mjs --site <stand url> --source <source> --run-root <dossier> --spec <spec-pack> --zip <zip> --full --reason "release gate" --out <sweep>
node scripts/review/port-audit.mjs --site <stand url> --routes <page-map.json> --source <source> --dossier <dossier> --theme-zip <zip> --out <dossier>/port-audit.json
node scripts/quickstart/cycle.mjs … --patch --previous <previous release dir> --measure <sweep>/fix-measure.json --no-baseline "<reason>" \
  --run-root <dossier> --spec <spec-pack> --theme-zip <zip> --contract <id> --from contract-bind
```
The last line runs contract-bind and then `release.mjs --patch --previous … --run-root … --measure … --no-baseline "<reason>"`;
`release.mjs --patch` can also be called directly with the arguments of §Release a fix version above. The reason is
recorded verbatim in `VERIFICATION.json` (`noBaseline`).

## Archive mode policy

The fleet extracts the webroot as root (`tar -xf`: owner and modes come from the archive) and runs PHP and wp-cli
as www-data. So the modes the archive carries are the modes the site runs with, and a member others cannot read
is a site that cannot start. JA Vega 1.1.1 (28/09, issue #34) shipped `wp-config.php` 0600 and its whole theme
0600/0700 — the modes of the agent worktree the theme was copied from (umask 077) — and site creation on the fleet
died in provision with `file_get_contents(/var/www/html/wp-config.php): Failed to open stream: Permission denied`
→ `Error: Strange wp-config.php file`. Tracy Base 1.1.1, packed from a stand without that history, was all
0644/0755.

`pack.mjs` therefore does not archive the stand's modes. `scripts/quickstart/archive.py` writes every member with:

| member | archived as |
|---|---|
| owner | `0:0` (`root:root`) |
| regular file | `0644` |
| regular file whose source mode has any execute bit | `0755` (listed in `manifest.webroot.executables`) |
| directory | `0755` |
| setuid / setgid / sticky, xattrs, ACLs, macOS metadata | stripped |
| symlink (dropped by the walk, as before), FIFO, socket, device | not archived — a FIFO, socket or device stops the pack by name |

The stand is only read: nothing on it is chmod-ed. The walk reads the webroot's real path and records its
identity (`dev:ino`); `archive.py` opens that path once with `O_NOFOLLOW` and refuses it unless it is the same
directory, checks again when the build ends, and pack re-checks it before the archive is moved to `--out` — a
webroot replaced between walk and publish is `webroot <path>: is not the directory the walk read`, nothing
published. Every member is opened one path component at a time from the
webroot's descriptor with `O_NOFOLLOW`, so a parent directory swapped for a symlink since the walk is refused,
never followed out of the webroot; and before the archive is handed back every member is looked up again (same
inode, kind and mode; a file also its size, mtime and ctime). A member that cannot be read, has a name that is
not canonical, is replaced or changes while or after it is archived stops the pack with
`member <path>: <reason>`, and no archive is left at `--out`. The archive is
then read back as structured rows (`archive.py list`, Python `tarfile` — not the columns of `tar -tv`, which GNU
and BSD print differently) and held to the same policy by `lib.mjs auditArchiveMembers`: a member off the policy,
not world-readable (file without o+r, directory without o+rx), owned other than 0:0, of another type, duplicated
or carrying xattrs is one named problem. `manifest.json` records `webroot.modePolicy` (the table above),
`webroot.modes` (members per type and mode, e.g. `{"file 0644": 3120, "dir 0755": 410}`) and
`webroot.executables`. A pack that fails leaves no `manifest.json` or `SHA256SUMS` in `--out`.

## Fleet-like restore

A verify stand that is not read the way the fleet reads cannot catch #34. Measured 28/09 on Docker Desktop for
macOS: in a bind-mounted host directory a file shows up owned by whichever uid looks at it, and uid 33 reads a
0600 file without complaint — the old restore (`tar -xzf` on the host into `<stand>/verify`) served JA Vega's
0600 `wp-config.php` happily. So:

- **Restore writes through `--root-runner`**, a command prefix that runs as root inside the Linux filesystem the
  verify stand serves (a named volume; `-i` is required, the archive and the config go in on stdin). It extracts
  with `tar -xzpf -` as root — owner and modes from the archive, like `provision.sh` — rewrites
  `wp-config.php` in place (`cat >` keeps its owner and mode) and stages the SQL root-owned 0644. It never chmods
  or chowns what the archive carries: an archive the fleet cannot read fails here, it is not repaired.
- **`--wp` must run as the fleet's www-data** (`--runtime-uid`, 33 — the `wordpress:apache` www-data; the alpine
  `wordpress:cli` image has no name for 33, so identity is checked by uid, and by name on the web server).
- **The pack must hold together first** (`lib.mjs readPack`): `SHA256SUMS` well formed and covering
  `manifest.json` and both archives the manifest names — plain file names in the pack, never a path — with the
  manifest's hashes equal to the sums and the files. An empty `SHA256SUMS` is a failure, not "nothing
  mismatched". Every manifest field a later step reads is held to its shape before anything runs
  (`lib.mjs manifestProblems`: `schemaVersion`, `platform`, `id`, `version`, `wpVersion`, `theme.name` a
  plain theme directory name, both archives' `file` and `sha256`) — a pack whose sums hold but whose manifest
  lacks `theme.name` stops before the root runner is called, not after the webroot is wiped. Restore then reads each archive once and hashes, lists (`archive.py list -`), extracts and reports
  exactly those bytes: `restore.json` `archive.sha256` is measured, not copied from the manifest. A member whose
  name is not canonical (`a/./b`, `a//b`, `./a`, absolute, `..`), two members with one target, or a member below
  a file member is refused before extraction. Everything restore needs from the pack's bytes is also taken
  before the wipe (`restore.mjs preparePack`): the SQL decompresses whole and is not empty, the webroot archive's
  gzip stream checks to its trailer, the archive's own `wp-config.php` (`archive.py list - --read wp-config.php`)
  renders for this stand, and the manifest's theme has a `style.css` in the archive. A `.sql.gz` that is
  corrupt yet listed with matching sums in the manifest and `SHA256SUMS` stops restore there, with the stand
  untouched.
- **The container webroot is held to a shape** (`lib.mjs checkWebrootPath`): absolute, no `.`/`..`/empty
  segment, at least two levels deep and not a system tree (`/`, `/var`, `/var/www`, `/etc/…`, `/usr/…` are
  refused). As root, it must be a directory reached without a symlink anywhere on its path (`pwd -P` equals it),
  and its identity (`stat -c %d:%i`) is recorded. Every later root step — wipe, extraction, config read and
  write, SQL and probe staging and removal — runs through `lib.mjs anchorRoot`: `cd -P` into the webroot, check
  it is still the path and the recorded directory (`WEBROOT_ANCHOR`, exit 97 otherwise), then work on relative
  names. A parent swapped after the check cannot redirect a wipe or an extraction: the shell works inside the
  directory that was checked. The root runner needs `stat -c` (busybox or GNU — the `wordpress:cli` image has it).
- **Before anything is wiped**, the root runner must be uid 0, pass stdin, and see the webroot; the access probe
  must run under `--wp` as the runtime uid, and a root-owned 0600 canary must be **unreadable** to it. A stand
  that lets the canary through does not enforce modes (a bind mount) and restore refuses: `nothing was wiped`.
  Every way the probe failed to run (`probeWebroot` `failed`: not run, run as root, a probe answer from a
  wp-cli that then exited non-zero) blocks the wipe; only what it found about the old stand's files does not.
  Then the `wp-config.php` rendered by `preparePack` is **compiled by the runtime's PHP** (`lib.mjs lintConfig`):
  a nonce-bound script written 0400 for the runtime uid (it carries the database password), run by
  `wp eval-file --skip-wordpress`, pipes the text to `php -l` (`PHP_BINARY`, the wp-cli image's own php and ini)
  and is removed in every case. A config with all four defines that PHP cannot parse — or a check that could not
  run, exited non-zero or answered for another nonce — stops restore with `wp-config.php … does not compile …
  nothing was wiped`. Rendering only proves the defines were replaceable; PHP decides whether the file loads.
  Both scripts carry their parameters as base64 in 76-char literals (`lib.mjs phpBase64`): `wp eval-file` runs
  nothing, with exit 0 and no output, for a script holding one literal of a few KB (measured on
  `wordpress:cli-php8.3`: 4000 chars ran, 6000 did not) — a check that answers nothing is a failure, never a pass.
- **The access probe** (`lib.mjs accessProbePhp` / `probeWebroot`) is one PHP file written root-owned 0644 into
  the webroot, answering only to a per-run nonce and removed in a `finally` that also covers writing it (a probe
  whose `chown`/`chmod` failed is removed too; a removal that fails is an error, added to the first one, never
  hiding it — the staged SQL goes through the same `withRootCleanup`). wp-cli runs it with
  `eval-file --skip-wordpress`, so an unreadable config is reported by name instead of dying as "Strange
  wp-config.php file". It reports its uid, the canary, every entry under the webroot it cannot read or enter,
  every entry not owned by root, and the paths the fleet needs first, each of the kind it must be —
  `wp-config.php` a regular file, `wp-content/uploads` a directory, the active theme and the parent its
  `style.css` names (`Template:`) directories with a regular `style.css`. A readable 0644 file where uploads
  should be is a failure. An answer counts only from a wp-cli run that exits 0 and an HTTP response that is 200.
  Restore runs it
  before the database import (theme from the manifest) and again at the end (the `stylesheet` and `template`
  options); a problem fails the restore with lines like
  `wp-cli: wp-config.php file wp-config.php is not readable by uid 33 (mode 0600, owner 0:0)` or
  `wp-cli: uploads directory wp-content/uploads is not listable/enterable by uid 33 (mode 0700, owner 0:0)`.
  `restore.json` carries `identity`, `archive` (sha256, modes, members off the policy), `access` and `binding`
  — `{manifest, webrootArchive, databaseArchive}` hashed from the bytes restore read, plus the `webroot`,
  `siteUrl` and `runtimeUid` it restored to — and is written on failure too (`ok: false`, `error`).
- **verify-parity re-runs the probe** through `--root-b` + `--wp-b` **and over HTTP** at `--b`, where the web
  server's PHP must answer as `www-data`, uid 33, the same uid as wp-cli. With `--pack` and `--restore-report`
  it also runs `readPack` on the pack, **measures** `manifest.json` and both archives on disk, requires the
  manifest to name the archives' hashes, and compares the report's `binding` key by key (`lib.mjs
  bindingProblems`) with what it measured and the stand it probes (`--webroot-b`, `--b`, `--runtime-uid`) — a
  database, manifest or archive swapped since the restore, with `SHA256SUMS` rewritten to match, or a report of
  another webroot or site, is not the one the report speaks for; a pack or report that does not check out is an
  access problem in `parity.json`. The active theme is read from `--wp-b` (`stylesheet`, `template`): an option
  wp-cli cannot read or that is empty, a stylesheet other than the manifest's `theme.name`, or a theme the probe
  did not check is a named problem — a probe that checked no theme is not a pass. Without `--wp-b` and
  `--root-b` the check has not run and `parity.ok` is false — routes and styles never stand in for it. `cycle.mjs`
  passes all of it, so `--from verify` proves the same thing a full run does; the cycle refuses to start a
  restore or verify phase without `--root-b`.
- One restore or verify per webroot at a time: both take a lock keyed on (root runner, webroot) in the temp
  directory; a lock whose pid is gone is taken over.

`scripts/test/quickstart-fleet.integration.mjs --scratch <dir> [--timeout 600]` proves it on Docker (not part of
`npm test`): a build stand whose theme, uploads and `wp-config.php` are 0600/0700 packs to 0644/0755 and restores
green with wp-cli and HTTP PHP both uid 33; a 0600 `wp-config.php` fails verify; archives with valid checksums
whose `wp-config.php` is 0600, theme file 0600 or `wp-content/uploads` 0700 fail restore by name; one whose
`wp-config.php` has the four defines but does not compile fails on `php -l` with the stand untouched; a pack whose
database, manifest and `SHA256SUMS` were swapped after the restore fails verify on the binding; a bind-mounted
webroot and a root wp runner are refused before anything is wiped. On the same evidence release.mjs accepts the
green restore + parity (verify-parity with counts and computed styles, so it needs Playwright's Chromium) and
refuses, by name, the parity with an unreadable `wp-config.php`, the config-0600,
theme-0600 and uploads-0700 restores and a parity probe run as root. `--project <name>` names every Docker
resource of the run (default a random `qs34-xxxxxx`).

## Release acceptance

release.mjs assembles a release only on evidence bound to the exact bytes it ships. It reads everything
first (`acceptRelease`), writes nothing on a refusal, and prints every reason as `[code] message`.

**Inputs.** `--theme-zip` (the final theme zip), the pack's webroot and database archives (read once through
`readPack`, hashed from the bytes read), `--run-root` + `--spec` (fresh canonical contracts, as in the cycle's
freshness gate), `--visual-ledger` + `--checkpoint` (ONE line of the Visual QA ledger, named by run id — no
directory is scanned), `--contract-bind` (the bind test's evidence), `--restore-report` and `--parity`.

**Checkpoint.** The ledger line must be a `kind: "checkpoint"` with `scope.kind: "full"`, `complete: true`, not
interrupted, no failed step, no axis or determinism errors, zero findings and zero unclassified
(`round.mjs isCompleteCheckpoint`). Its tiers must be exactly the four `STAGES` — `light-desktop`,
`light-responsive`, `dark-desktop`, `dark-responsive` — each with an absolute report directory of its own. A
recheck or a targeted round is not a checkpoint. Each tier's `visual.json` must pass `round.mjs reportProblems`
for every contract page with `full: true` (every owed axis measured `now`, container probes, nothing
unmeasured), exit 0, its stage `pass`, and carry the canonical visual contract's path and hash with an empty
`stale` list, the theme it measured (`identity.artifactHash`, recorded by `visual-qa --artifact <theme zip>`) and
the site it measured (`site`, visual-qa `--site`), which must be the restored site the restore report and
parity.json are of (`parity.b`, compared without a trailing slash). A report measured on the build stand, or on
a theme nobody named, cannot be bound afterwards. `site` and `parity.b` must each be an absolute http(s) URL
(`tier-site`, `parity-invalid`): two equal strings that are not URLs do not name a site. Ledger lines and reports
are checked for the shape these checks read before any is read (`checkpoint-invalid`, `tier-report`).

**Reuse path** (`--restore-smoke <run>`, `reuseProblems`). `--checkpoint` may then be the four-tier checkpoint of the build stand, and `--restore-smoke` a
one-tier `dark-responsive` run of the same ledger on the restored site. Build side: the same line, tier and report checks as above, with the site being `parity.a`
and the measurement time between every artifact's mtime and `parity.generatedAt`. Restored side: the smoke line (`stage: dark-responsive`, `kind: "checkpoint"`, full,
clean), its report on `parity.b` after the restore finished, every contract page. Both sides' bindings must name the theme zip, webroot and database being released.
Parity must be ok with no style mismatch and no capture failure. Failing any of this is `[restore-smoke-ineligible]` when the checkpoint is not itself four tiers on the
restored site, and the full requirement applies unchanged. The finish audit's interaction records are the smoke's (each tier's probe covers every owed case), and
must be of the restored site, after the restore, with every owed case measured.

**Content contract** (`--contract-bind`, `contractBindProblems`). The file must be `contract-bind.mjs` evidence
(`contract-bind-invalid`: its tool name, a `<slug>/wp7/<version>` contract, boolean flags, counts that add up —
`warnings` equal to the sum of `warningCodes` —, a plugin version, an ISO `ranAt`), with `bound: true` and no
`refused` / `error` (`contract-bind-refused`; a re-run `alreadyBound` is fine). It must record the pack
(`pack.manifest`, `webrootArchive`, `databaseArchive`) and `themeZipSha256` it ran for (`contract-bind-unbound`
when it was run without `--pack` / `--theme-zip`), and they must be the pack and theme zip released
(`contract-bind-pack-mismatch`, `contract-bind-theme-mismatch`). `ranAt` must be after the restore finished and
not in the future (`contract-bind-stale`, `contract-bind-invalid`). No flag skips it: a port whose release cannot be bound
needs its profile first. Also `contract-bind-missing` and `contract-bind-unreadable`. `VERIFICATION.json` carries
`contractBind` (contract, plugin version, `alreadyBound`, warnings count and codes, entities, `ranAt`, `evidence`:
the file's hash).

**Clean by payload** (`tier-findings`). A tier is clean by what its pages carry, recounted as visual-qa
`summarize()` counts them, never by a total: no axis finding, no `unclassified-element`, every
`coverage.unclassified` element recorded as a finding or as an `accepted` entry of that element, every
`accepted` entry one the canonical visual contract accepts now — the finding it carries (the entry without
`exception`) is classified by visual-qa's own `accept()` against `design.exceptions`, and the exception it
cites must be the one `accept()` picks, with the contract's `reason` and `decision` (a reason written into the
report, or an exception the contract no longer declares, is a finding) — and each page's flat `findings` list
equal to its axes'. The
report's `summary.findings` / `summary.unclassified`, its own stage row's `findings` and the ledger tier entry's
`findings.total` / `findings.unclassified` must each equal that count, and the ledger tier entry's `axisErrors`,
when present, must be 0 — a total rewritten to 0 over a finding is refused, even with a binding rehashed to match.

**Artifact binding** — `<tier dir>/artifact-binding.json`, written when the tier is measured, never by release.
`round.mjs` writes it for every tier that produced a report when its config names `pack` (the quickstart pack
directory) and `artifact` (the theme zip): the three artifacts are hashed before the tiers start and again as
each tier ends, the report is hashed from the bytes that were parsed, and the file is written whole (a
temporary file hard-linked into place, which fails rather than replace an entry of that name). Every pack
file the pack reader opens (`SHA256SUMS` and each file it lists) must be a regular file in the pack directory
itself — the pack reader (`readPack`, and verify's archive hashes after it) opens each through a descriptor
that follows no link and waits on no FIFO and checks its type on that descriptor, so a link, a FIFO or a
directory is refused even when it replaces a regular file after a check. An artifact changed during the measurement,
a report whose `identity.artifactHash` is not the theme zip or whose `at` and `identity.capturedAt` disagree,
or a report measured before an artifact's mtime leaves no binding and makes the tier — and so the checkpoint —
incomplete. A pack that does not check out (`readPack`) fails the measurement before visual-qa runs.

```json
{
  "schema": "tracy-visual-artifact-binding/v1",
  "stage": "light-desktop",
  "report": { "file": "visual.json", "sha256": "sha256:<hex of visual.json bytes>" },
  "measuredAt": "<visual.json at, verbatim>",
  "artifactHash": {
    "theme": { "file": "<theme>-1.0.0.zip", "sha256": "sha256:<hex>" },
    "webroot": { "file": "<id>-webroot-<v>.tar.gz", "sha256": "sha256:<hex>" },
    "database": { "file": "<id>-database-<v>.sql.gz", "sha256": "sha256:<hex>" }
  }
}
```

`artifactHash.theme` is the same value visual-qa records as the scalar `identity.artifactHash` (`--artifact`);
the report must carry that field and the two must agree. A report file edited after it was bound no longer matches
`report.sha256`.

**Freshness.** The measurement time is the report's own `at` (equal to `identity.capturedAt` and to the
binding's `measuredAt`, inside the ledger line's `start`–`end`, not in the future); file mtimes of reports are
never read, so touching a report does not refresh it. That time must be no earlier than the mtime of each bound
artifact: a pack or theme zip rewritten after the measurement — even with the same bytes — makes the evidence
stale. Copy artifacts with their mtimes (`cp -p`, `rsync -t`) or measure again. The restore must finish after
both archives were written, parity must be measured after the restore, and every tier after the restore it
measured finished. `identity.capturedAt` is required. No timestamp — report, ledger `start`/`end` (start before
end), restore `finishedAt`, parity `generatedAt` — may lie more than five minutes in the future.

**Runtime evidence** (the fleet-like restore, *Fleet-like restore* above): the restore report `ok` with no
`error`, both access checks (`beforeBootstrap`, `afterRestore`) `ok` with an empty `problems` list, wp-cli
identity equal to the non-root `runtimeUid`; parity.json `ok`, `access.ran` and `access.ok` with an empty
`access.problems`, the wp-cli and HTTP probes both at that uid; and the restore
report's `binding` and parity's `access.binding` both equal to the pack measured now plus the stand parity
probed (`lib.mjs bindingProblems`). A restore report or parity.json whose access blocks, problem lists,
summary, routes, counts or style themes are not of the shape read, whose `binding.siteUrl` or parity `a` / `b`
is not an http(s) URL, is `restore-invalid` / `parity-invalid`. parity.json's verdict is recomputed from its
rows as verify-parity computes it (`compareParity`): every `counts` row must match (`a` present and equal to
`b`), every `routes` row must carry the status it was held to (`expected`) and have both stands answer it,
each row saying so in its own `ok`, `/` must be among the routes, `styles.mismatches`,
`styles.captureFailures` and `countErrors` must be empty, and each `summary` count must equal the rows' count.
An `ok: true` over a row that does not match, a row whose `ok` disagrees with its values, a total that is not
the rows' count, or an access block saying `ok` beside the problems it lists is `parity-failed` /
`runtime-access` — never accepted on the flag.

A route's `expected` is never taken from parity.json alone: release reads the spec-pack's `page-map.json`
(`--spec`) through the same `routeExpectations` and every row must carry the status it declares for that path,
200 for a path it does not declare (`parity-expectation`, as is a page map that cannot be read or declares a
path twice or a status that is not one), and every route the page map declares must have a row
(`parity-incomplete`) — a parity run over `/` alone does not stand in for the `/404` page beside it. The cycle
reads `--routes` and the same page map before its first phase and refuses, by name, a `--routes` it cannot read
(`routes-invalid`), a page map it cannot read, a status the two declare differently and a declared route
`--routes` leaves out, so verify and release never hold a route to two statuses or measure different routes.

Rows that agree are not yet a measurement. Every route must answer its declared status on both stands (the
same undeclared 404, 3xx or `error: …` on both matches and proves nothing — `parity-failed`); every count `collectCounts` takes must be
present (`post:<type>` for each `COUNT_TYPES`, `term:category`, `option:<name>` for each `COUNT_OPTIONS`), the
post and term counts integers on both sides; and computed styles must cover every
page route (declared 200 or 4xx/5xx; a declared redirect has none) × viewport × theme axis, `light` and `dark` among the themes, `styles.viewports` naming `WxH` views. `compareParity` records the
checks of each axis in `styles.perAxis`, keyed `<route>|<width>|<theme>` as `captureStyles` keys an axis; the
release requires exactly the expected keys, each with at least one check, adding up to `styles.checked`, and
every style mismatch on one of them — a total carried by other axes never covers an axis that compared
nothing. A parity run with `--skip-styles` or without `--wp-a` / `--wp-b` is therefore `parity-incomplete`. The
probe records must carry the identity verify-parity's pass requires (`lib.mjs evaluateAccess`): the wp-cli
probe under SAPI `cli`, the HTTP probe under a web server SAPI as the user `www-data`, each with a walked entry
count above 0 and a theme list holding the manifest's theme; the restore's `afterRestore` record likewise
carries its entries and themes. A record that says `ok` without them is `runtime-access`.

**Manifest.** Beyond what `readPack` holds restore and verify to, the fields the release writes from are held
before anything is written (`pack-invalid`): `id` a release tag of two or more segments (`<product>/<cms>`,
`<owner>/<product>/<cms>`, each words joined by `-` or `.`), `version`, `phpVersion`, `prefix` and
`theme.version` non-empty strings, `placeholderUrl` (when present) an http(s) URL, `plugins` a list and
`counts` an object when present. Each evidence stage — contracts, restore and parity, the checkpoint — also runs
under a net that turns a shape its checks did not foresee into that stage's code (`contract-invalid`,
`restore-invalid`, `checkpoint-invalid`); anything past those is `input-invalid`, never a stack trace.

**Names.** The theme zip, the pack archives and every `--asset` must be plain file names, distinct, and none
of the files release writes itself (`manifest.json`, `VERIFICATION.json`, `README.md`, `release-notes.md`,
`SHA256SUMS`) — `unsafe-file` / `pack-invalid`. The pack's `SHA256SUMS`, `manifest.json` and every file the sums
name are held to be regular files before `readPack` reads them.

**Named refusals.** `pack-invalid`, `theme-zip-missing`, `theme-zip-invalid`, `asset-invalid`, `unsafe-file`
(symlink, FIFO, directory or unsafe or reserved name where a regular file is needed; an `--out` that is not a
directory), the contract codes above, `checkpoint-missing`, `checkpoint-ambiguous`, `checkpoint-unreadable`,
`checkpoint-invalid`, `checkpoint-not-full`, `checkpoint-incomplete`, `checkpoint-findings`, `tier-missing`,
`tier-unknown`, `tier-duplicate`, `tier-report`, `tier-failed`, `tier-contract`, `tier-site`, `binding-missing`,
`binding-invalid`, `artifact-mismatch`, `evidence-stale`, `timestamp-invalid`, `restore-missing`,
`restore-invalid`, `restore-failed`, `restore-mismatch`, `contract-bind-missing`, `contract-bind-unreadable`,
`contract-bind-invalid`, `contract-bind-refused`, `contract-bind-unbound`, `contract-bind-pack-mismatch`,
`contract-bind-theme-mismatch`, `contract-bind-stale`, and for `--patch` `previous-missing`, `previous-unreadable`, `previous-invalid`,
`previous-mismatch`, `previous-not-lower`, `measure-missing`, `measure-unreadable`, `measure-invalid`, `measure-failed`, `measure-artifact-mismatch`,
`measure-site`, `measure-stale`, `measure-baseline-missing`, `measure-baseline-passed`, `measure-baseline-mismatch`, `measure-baseline-undeclared`, `measure-baseline-dropped`, `measure-baseline-conflict`, `metadata-invalid`,
`changed-from-invalid`, `changed-from-mismatch`, `parity-missing`, `parity-invalid`, `parity-failed`,
`parity-incomplete`, `parity-expectation`, `runtime-access`, `tier-findings`, `input-invalid`, `output-busy`, `output-not-release`,
`output-notes-unreadable`, `output-failed`, `input-changed`.

**Assembly.** `--out` is replaced only when it is absent, empty, or a completed earlier release — exactly what
release writes: flat regular files; a release `manifest.json` whose `release` is named and whose `assets` are
distinct plain names including both archives it names; a `VERIFICATION.json` of that `release`; a `README.md`;
and a `SHA256SUMS` that lists exactly `manifest.json`, `VERIFICATION.json`, `README.md` and every asset, no
other file in the directory but itself and `release-notes.md`, and holds for each (a release written now lists `release-notes.md` too, so its `SHA256SUMS` covers every file the step writes but itself; an earlier release without that line, or whose notes were edited since, is still replaced and the notes are kept) (`output-not-release`
otherwise — a directory edited by hand, or a manifest and sums alone, is not replaced). A directory holding **only** `release-notes.md` is an empty target that keeps its notes (written ahead of the first run); `release-notes.md` beside anything else that is not a completed release is still `output-not-release`. An existing `release-notes.md` is carried over unless `--force-notes`; one that cannot be read stops
the run (`output-notes-unreadable`) rather than being replaced by the template. The accepted bytes are written
to a temporary directory beside `--out` and every copy is hashed again. Then, still under the lock
(`output-busy` when another assembly holds it), the whole release is accepted again: every file read the first
time — archives, manifest, sums, theme zip, assets, contracts, spec-pack files, ledger, tier reports and
bindings, restore report, parity.json — must have the same bytes and mtime (`input-changed`), and every check
must still hold (an artifact rewritten with the same bytes after the measurement is `evidence-stale` now). Only
then is the directory swapped in. A failure removes only the temporary directory; the previous release stays. `VERIFICATION.json` records `acceptance`: the three artifact hashes, the manifest hash,
the checkpoint (ledger, run, the four tiers with report and binding hashes and measurement times) and the
runtime identity.

**Sequence.** Full: cycle `--to verify` → Visual QA checkpoint (round.mjs, four tiers, full, config `artifact` +
`pack`) against the restored stand, each tier's binding written as it is measured → cycle `--from contract-bind`
(the bind test on that restore, then release; or contract-bind.mjs and release.mjs directly). Reuse: the four-tier checkpoint on the build stand after `pack`,
cycle `--to verify`, the one-tier smoke on the restore, cycle `--from contract-bind … --restore-smoke`. Anything rebuilt after the measurement is measured again.

## Release (Lee settled where to release, 13/09)

`https://github.com/JoomlArt-Products/ja-products/releases`, tag `<product>/wp7`, name **"Quickstart:
<Name> / WordPress 7"** (Tracy Base: `tracy-base/wp7`, draft 14/09; Tracy Business: `tracy-business/wp7`).
Quickstart version = theme version = `1.0.0` (since 14/09, one number per product).

## Pinning into the fleet (plan item G — outside this skill)

`quickstarts.json`, `provision.sh`, `platform/wordpress.sh`, the `tracy-web` route, `BuildForm.tsx`,
the stages of `tracy-site-build-wordpress`, the seeder's contract slot, the `tracy-wordpress-quickstart` package —
eight places, one commit + test each. Not part of the skill; listed here so whoever does Phase 10 knows Phase 10 is not
the end of the road.
