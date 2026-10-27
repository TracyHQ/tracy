# Packaging the theme — zip one folder named after the slug, clean install, Theme Check

> **Packet Phase 9 (package).** Runs after Phase 8b is clean. The product is the **standalone-install theme zip**
> (`tracy-base-wp7-theme-<version>.zip` in the release); the whole-site quickstart is Phase 10
> ([`quickstart.md`](quickstart.md)). WordPress standard: [`wordpress-anatomy.md`](wordpress-anatomy.md) §10.

Before the zip: `node scripts/lessons.mjs scan --spec <spec> --theme <src/<slug>>` exits 0
(overlay metadata in the theme, unguarded block paths and `DOCS_REQUIRED:` markers are lessons L-005,
L-006, L-017); after the Phase 10 pack, the same scan with `--pack <pack>` reads the archive's member
modes (L-089). The scan is no substitute for the four `package.mjs` gates.

Each item below states whether it **has run** or is **planned** (plan item E2, 13/09/2026). Do not read a "planned" item
as a proven step.

## 1. Zip — produced by the generator (has run)

```bash
cd packages/cms/tracy-wordpress-theme
node scripts/build.mjs --target tracy-base        # src/tracy-base/ + dist/tracy-base-<version>.zip + dist/tracy-base.zip
```

`plan()` writes the tree, then `zip -qrX` **one root folder `tracy-base/`** (exactly as WordPress requires: folder = slug
= text domain), excluding `.DS_Store`. After zipping, the script **checks** the listing itself: it must have `style.css`,
`theme.json`, `templates/index.html`, `functions.php`; the number of `styles/*.json` = the number of declared systems (2), the number of fixtures =
2, the number of artifacts = 2 × the number of kinds — a mismatch throws, no zip. `Version:` in `style.css` is stamped from
the package's `package.json`.

Not in the zip (deliberately): `theme.config.json`, `theme.overlay.json`, `patterns.map.json`
(`OVERLAY_META_FILES`), `.git` files, `node_modules`. Check with `unzip -l`. The theme carries no content — pages,
posts, menus live in the DB ([`wordpress-anatomy.md`](wordpress-anatomy.md) §7).

## 2. Clean install onto a stand (install-smoke — ran 13/09 on the build stand, not yet on a clean stand)

```bash
cd ~/TracyHQ/quickstart-builds/tracy-base-wp7-1.0.0
docker compose -p tracy-base-wp7 run --rm cli theme install /dist/tracy-base.zip --force --activate
docker compose -p tracy-base-wp7 run --rm cli theme list
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8227/
curl -s http://127.0.0.1:8227/ | grep -o -- '--wp--preset--color--accent: #0071e3'
```

The stand's `./dist` is mounted at `cli`'s `/dist`; copy the zip there first. Result 13/09: `tracy-base`
active on its own, not requiring `tracy`; accent `#0071e3`, fg `#1d1d1f`, SF Pro, 2 variations (STATUS phase C).

**Planned:** repeat exactly the commands above on a **clean stand** (service `verify` on `:8228`, webroot `./verify`,
`compose.override.yml`) — the build stand "lies" because its DB already has content; only a clean stand proves the zip stands
on its own. Pass bar: HTTP 200, `wp-content/debug.log` has no `Fatal`/`Warning` from the theme, assets served from
`wp-content/themes/tracy-base/`.

## 3. Theme Check — soft gate (planned, Q12)

```bash
docker compose -p tracy-base-wp7 run --rm cli plugin install theme-check --activate
```

then Appearance → Theme Check in the admin (version `20260901`, tested 7.1). **0 ERROR**; plugin-territory
WARNINGs (block `tracy-base/mega-menu`) are allowed, **listed by name** in `VERIFICATION.json`. Log saved to
`tasks/tracy-base-wp7/evidence/`. Not targeting wordpress.org (Q11), so the 14 Required items are only a reference.

## 4. i18n — `make-pot` (planned)

```bash
docker compose -p tracy-base-wp7 run --rm cli i18n make-pot wp-content/themes/tracy-base wp-content/themes/tracy-base/languages/tracy-base.pot
```

Scans PHP/JS/`style.css`/`theme.json`. Clean = no mismatched-domain warning: every translation call must carry
`'tracy-base'` (the generator has switched it from `'tracy'` — `retargetTextDomain`). Strings in `parts/*.html` cannot
be translated; that is where they must be pushed into a pattern ([`templates-and-patterns.md`](templates-and-patterns.md) §3).

## 5. Theme Unit Test data (planned)

Import `https://raw.githubusercontent.com/WPTT/theme-unit-test/master/themeunittestdata.wordpress.xml`
via `wp import … --authors=create` (needs the WordPress Importer plugin) on a clean stand, then open a few pages
(a long post, a post with every block, a category with many posts): no PHP errors, no horizontal overflow, the template hierarchy lands on
the right file. This checks the theme on content that is **not** Tracy Base's — the cheapest way to see a
template that is only right for the demo content.

## 6. `scripts/package.mjs` — the zip's four gates in one command

Bundles §1–§4 into one command, run on a **clean stand** (not the build stand); prints `ok`/`FAIL` per gate, writes a
JSON report, exits 1 if a gate fails:

| Gate | Checks |
|---|---|
| `zip` | exactly one root folder named `<slug>`; has `style.css`, `theme.json`, `templates/index.html`; no file from the forbidden list (`.git`, `node_modules`, `.DS_Store`, `*.map`, `*.log`, `.env`); no file over 2 MB unless named in `--allow-large` |
| `install` | `wp theme install <zip> --force` + `wp theme activate <slug>`, front page 200 (fetched from the host), and no debug-log entry from the theme in the window between the install and the front page — see below |
| `themecheck` | `wp theme-check run <slug>` (installs the Theme Check plugin if missing); REQUIRED rows are errors unless they match a regex in `--accept-theme-check` — accepted rows are still printed by name |
| `i18n` | `wp i18n make-pot` on the installed theme; an extraction error or 0 `msgid` fails |

| Flag | Meaning |
|---|---|
| `--zip <file>` | the theme zip on the host (required) |
| `--slug <slug>` | theme name = name of the root folder in the zip (required) |
| `--wp "<runner>"` | the clean stand's wp-cli command, each call appends its arguments after it (required) |
| `--site-url <url>` | the clean stand's address as seen from the host, for the `install` gate (required) |
| `--zip-in-container <path>` | the zip's path inside the runner's container; defaults to `--zip`. Before `install`, `package.mjs` asks the runner `is_readable(<path>)`: if the runner cannot read it, the `install` gate FAILs with "pass --zip-in-container <path>" and installs/activates **nothing** (wp-cli on its own only says "theme could not be found", blaming the theme) |
| `--accept-theme-check <r1,r2>` | comma-separated regexes (case-insensitive) for REQUIRED rows settled as accepted |
| `--allow-large <f1,f2>` | file names (basename) allowed over 2 MB |
| `--out <file>` | JSON report; defaults to `package-report.json` |

```bash
node scripts/package.mjs --zip dist/tracy-base.zip --slug tracy-base \
  --wp "docker compose -p tracy-base-wp7 run --rm -T cli" --zip-in-container /dist/tracy-base.zip \
  --site-url http://127.0.0.1:8228 --accept-theme-check 'screenshot' --out package-report.json
```

**Values come from stdout only.** Every value a gate reads — `readable`, the active slug, the theme
directory, the msgid count, the Theme Check rows — is taken from the runner's stdout and must be exactly the
expected shape (one line, or a `TYPE<TAB>text` row); a count or byte size must be digits within
`Number.MAX_SAFE_INTEGER`, since a larger one is rounded and no longer the value printed. `docker compose run` writes its `Container … Created`
lines to stderr; they are kept in the report's `diagnostics` and never read as values. A call that exits
non-zero, is killed, or runs past `TRACY_WP_TIMEOUT` (seconds, default 600) is no answer, even when it printed
one first. The one exception is Theme Check, whose CLI exits 1 whenever a REQUIRED row exists: exit 1 with at
least one REQUIRED row is a finished run; any other failure is not. Every non-empty line of the Theme Check
output must be a `TYPE<TAB>text` row, except a first line that is exactly `type<TAB>value` (the header WP-CLI's
table prints for Theme Check's two fields when stdout is not a terminal); any other line, another header included, is listed under `unread` and fails `themecheck`.
The plugin must be active for the run to count: `is-installed` exiting 1 means "install it", any other failure,
or an install/activate that failed, fails `themecheck`. The `.pot` that `i18n` writes into the installed
theme is removed afterwards, with `languages/` when this run created it; the cleanup must answer that nothing
it made is left (`0`), otherwise `i18n` fails with the reason under `cleanup` — the stand is not clean.

**The debug-log window.** The log is the one `wp_debug_mode()` writes (`WP_CONTENT_DIR/debug.log` for
`WP_DEBUG_LOG` true, or the path `WP_DEBUG_LOG` names). It is measured — size, inode, sha256 of its content —
before the install and again after the front page's whole body has been read (a page that sends its headers
first is still rendering after them; a body cut short fails `install`); the bytes appended in between are read
back, checked against the hashes of both measurements, and each entry
(a timestamped line plus its stack trace) is attributed:

| Source | When | Verdict |
|---|---|---|
| `theme` | a PHP path under `get_theme_root()/<slug>/` (exact directory, so `<slug>-child` is not it), or the exact text domain named as one (`<code><slug></code> domain`) | fails `install` |
| `unknown` | no PHP path, a path outside WordPress (any other phar included), or a core notice about its caller (`called <strong>incorrectly</strong>`, `is <strong>deprecated</strong>`) the entry does not name | fails `install` |
| `core` / `plugin` / `wp-cli` / `other-theme` | every path in `wp-includes/`, `wp-admin/` or the WordPress root; in the plugin directories; in WP-CLI's own phar (`WP_CLI_PHAR_PATH`, or the archive `WP_CLI_ROOT` is in) or `vendor/wp-cli/` of a Composer install; in another theme | listed in `checks.install.debugLog`, does not fail |

So the warning core writes when `wp_update_themes()` cannot reach api.wordpress.org from the stand is listed
as `core` and does not fail the theme. A log that cannot be measured fails `install` with its own reason:
`WP_DEBUG`/`WP_DEBUG_LOG` off, the path a symlink, FIFO or other non-regular file, the log replaced (inode
changed), shrunk, or its earlier bytes rewritten during the window, bytes changed in place between the
measurement and the read, a window whose first line has no timestamp (it starts inside an entry) or whose last
line has no line end, more than 4 MiB appended, or a probe that failed. Nothing written after the second
measurement is covered. No log file before and after is "nothing logged".

`secret-scan` is not part of this command: it scans the quickstart pack in Phase 10 ([`quickstart.md`](quickstart.md)).

## 7. Handover with the zip

- `readme.txt` (WordPress standard — `=== Tracy Base ===`, `Requires at least`, `Tested up to: 7.1`,
  `Requires PHP`, `Stable tag`, `License: GPL-2.0-or-later`, `== Copyright ==` listing OpenDesign Apache-2.0)
  — present in the overlay, its content needs review at release time.
- The package's `README.md` in `packages/cms/tracy-wordpress-theme/` (already there; the *Second target* section says why
  `tracy-base` is the second build target, what the overlay contains, how to build/check).
- `checkpoint.mjs complete <file> 9 <zip> <Theme Check log> …` — evidence must sit **next to** the checkpoint
  file (the script rejects paths that escape it). `checkpoint.mjs` outputs a one-line summary
  plus the path of the full JSON file (`--json` prints it to stdout); the checkpoint file only changes through `init`/`complete`.
