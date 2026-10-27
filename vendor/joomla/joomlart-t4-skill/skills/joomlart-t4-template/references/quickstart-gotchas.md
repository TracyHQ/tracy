# Quickstart-specific gotchas (self-improving — append confirmed traps)

> **Phase Q5 packet — self-improving trap log.** Cross-cutting with the builder's `gotchas.md` (build-time
> prevention) and design-review's `recurring-defects.md`/`platform-latent-bugs.md` (QA detection) — cite the
> counterpart #/P##/[TAG] per entry.

These are the traps that make a green install render a DIFFERENT site than live, or fail outright. Pre-empt
them in Q1/Q2; Q4 catches the rest. Append new confirmed ones after each build.

## Prefix / SQL
- **Literal dev prefix in the dump** (`str_`): hard-fails under any other prefix. Tokenize table identifiers
  to `#__`; verify the live prefix is GONE as an identifier in the bundled SQL. Don't blind-replace — `str_`
  can appear in DATA (content/params); only rewrite SQL table identifiers. (Backtick-anchored
  `` `str_ `` → `` `#__ `` is the safe transform — mysqldump always backticks identifiers, data values never are.)
- **Volatile tables need STRUCTURE shipped, not full-exclude (CONFIRMED, Stratum run):** fully `--ignore-table`-ing
  `#__session` drops its CREATE TABLE too → Joomla 500s on first boot with **MySQL 1146 "table doesn't exist"**
  (title renders "<site> — 1146"). Ship the table STRUCTURE but drop its DATA: main dump ignores it, then
  append `mysqldump --no-data <table>`. Same for any volatile table you don't want rows from. (`export-db.sh`
  does this.) Sanity-check: bundled table count == live table count.
- **Auto-increment / duplicate admin:** if you keep the demo admin AND the installer creates one, you get a
  conflict. Decide: installer-created Super User + demo content users only, or ship the admin and document creds.

## Content that "vanishes" after install
- **Future-dated demo content:** articles/modules with `publish_up` in the future (relative to the install
  date) won't show. Demo content built "today" can disappear when a user installs months later. Either set
  demo dates safely in the past, or document. (Same class as the build's future-date gotcha — builder #54.)
- **Access levels:** com_users.user author/profile fields must be `access=Special` — if Public, they reappear
  on the public registration form in the installed site ([FIELDS-ON-REGISTRATION] / regression class CA-3
  from the design-review skill).
- **Missing `#__workflow_associations` rows → articles uneditable in admin (builder #66).** The dump MUST
  carry every article's `#__workflow_associations` row (`item_id` = article id, `stage_id=1`,
  `extension='com_content'`). The J6 admin Articles list `INNER JOIN`s `#__workflow_associations`, so any
  article whose association row was excluded from the capture renders fine on the FRONTEND but is **invisible
  / uneditable in the backend** after install — a silent parity miss that screenshots won't catch. Include
  the table's data in the dump and assert its row count matches live (verify-parity.md Step 2).

## Media / assets
- **Unbundled media:** any `images/`/`media/` file referenced by content but not in the package = broken image
  in `<TEST>`. Grep content for paths; bundle all. 
- **Shipped `media/t4/optimize/*`:** a stale dev optimize hash renders broken CSS/JS until cleared — exclude it
  and clear cache on first load. (= builder #1; design-review platform bug P17.)
- **Absolute URLs/paths in content:** content authored with `http://<dev-host>/…` or `/dev-subdir/…` breaks on
  the user's domain. Use root-relative `images/…` (no leading host); audit the dump for the dev hostname.

## Code / extensions
- **Already-installed dev tree as the base:** has no `installation/` and carries dev config — always start from
  a clean Joomla full package at the matching version.
- **Missing extension files or `#__extensions` row:** the feature silently disables. Bundle BOTH the files and
  the DB row (rides in the dump).
- **3rd-party / paid / keyed extensions:** licensing — don't redistribute without rights; if a key is needed
  at runtime, document it (the user supplies their own). Prefer demoing with bundleable extensions.
- **Version drift:** the bundled Joomla core version must match what the build/extensions expect; a mismatch
  triggers DB-schema update prompts or fatals.

## Installer auto-import mechanism (J6) — ⛔ LEGACY/background (base.sql route, NOT shipped)
> This section documents the DEPRECATED base.sql installer-quickstart route, kept
> only as Joomla-installer background — the SHIPPING method is the Akeeba `.jpa` restore (`akeeba-method.md`),
> which imports the captured DB via ANGIE with none of these `base.sql`/`#__schemas` wiring traps. Read these
> as why-NOT-base.sql context, not as the build path.
- **J6 has NO sample-data step in the install wizard.** Sample data = `plg_sampledata_*` applied from the
  admin AFTER install → a manual click. For zero-step quickstart, DON'T rely on it. Instead the installer
  populates the DB from `installation/sql/mysql/{base,supports,extensions}.sql` (run in that order by
  `InstallationController`). **Replace `base.sql` with the tokenized demo dump; no-op supports/extensions.**
  The demo dump's `#__template_styles` (home=1 = your template) makes it auto-active — verify after install.
- **`#__schemas` rows in the dump → "Duplicate entry … for key PRIMARY" install abort** (post-flight
  re-records core schema versions). Ship `#__schemas` STRUCTURE only (`export-db.sh` NODATA list).
- **An `#__extensions` row without its files → `simplexml_load_file failed … templateDetails.xml` warnings**
  during install (non-fatal). Bundle EVERY extension referenced in the dump — including the base
  `t4_bs5_blank` template the clone derives from.
- **Random admin user id:** the installer generates the Super User id at install and runs `updateUserIds()`
  on core-seeded content. The demo's own admin coexisting (different id) is fine.
- **Demo Super User username/email collides with the installer's admin (CONFIRMED):** if the dump's admin is
  `username='admin'`/`email=admin@…` and the user picks the SAME (very common), install aborts with
  `Duplicate entry 'admin' for key 'idx_username'`. Fix: **rename the demo admin in the dump** to non-common
  creds (e.g. `stratumdemo` / `demo-admin@…`) so the user can freely choose any admin username — keep the id
  so demo content `created_by` still resolves. (Rename in the live DB → export → rename back to preserve your
  own live access, or post-process the dump.) Re-test install with username `admin` to confirm.
- **Verify with the REAL installer, not a manual SQL import.** The CLI (`php installation/joomla.php install
  --no-interaction --db-prefix=<different> …`) runs the exact same populate flow and is reliable to automate;
  use a prefix DIFFERENT from the source to prove tokenization, then assert the front-end renders the demo
  with the template already active.

## Install / environment
- **configuration.php shipped with dev creds/secret:** security hole + wrong DB. Never ship it; installer
  regenerates. Secret-scan to enforce.
- **PHP version / extensions:** document the required PHP + extensions (the installer pre-check will flag, but
  state it in the readme).
- **Folder/file permissions** after extract: document the standard Joomla writable paths.

## Akeeba method (backup drive + restore)
- **Akeeba CORE Backup page client-redirects to the Joomla dashboard when driven headlessly (CONFIRMED,
  Stratum re-package 2026-06-22).** `page.goto`/native-click to `view=Backup` (even `&autostart=1&profileid=1&
  <token>=1`) returns the real Backup HTML (HTTP 200) but its on-load JS then redirects to `index.php`
  (`com_cpanel`), so the AJAX step-loop never runs — a backup record is created at `status=run` with a
  ~41-byte `.jpa` header that never grows. The GUI-drive "click #backup-start + poll DB" recipe can stall here.
  **Robust fix — drive Akeeba's AJAX protocol directly via `fetch` from the authenticated page context** (no
  navigation, so nothing can redirect away):
  - Endpoint: `index.php?option=com_akeebabackup&view=Backup&task=ajax` (no Joomla CSRF token needed).
  - POST form-urlencoded `ajax=start&description=…&comment=` → response is wrapped in `###<json>###`
    (strip to first `###`, then to next `###`, `JSON.parse`). Response gives `{tag, backupid, Domain, Step,
    Progress, HasRun, Error, Warnings}`.
  - Then loop POST `ajax=step&tag=<tag>&backupid=<backupid>` until done.
  - **`HasRun == 1` means FINISHED (counter-intuitive)** — keep stepping WHILE `HasRun != 1` and `!Error`
    (mirror `Backup.js` `onStep`: `if (data.HasRun==1) onDone()`). Add a wall-clock budget per `evaluate`
    (~100s) and resume with the same `tag`/`backupid` if the tool times out. The `.jpa` lands in
    `administrator/components/com_akeebabackup/backup/`; confirm `#__akeebabackup_backups.status='complete'`.
  - Pre-clean for a smaller, cleaner image: move dev cruft out of the webroot (`.css-backup-*`, `.DS_Store`,
    QA screenshots, `.review-*`/scan dirs, `*-backup.sql`) and clear `cache/ administrator/cache/
    media/t4/optimize/ tmp/` before backing up. (Stratum: 166 MB dirty → 71 MB clean.) `.DS_Store` is excluded
    by Akeeba's default filters; `.ddev/` is NOT (harmless on restore, but exclude for cleanliness).
- **ANGIE restore is reliably headless-drivable with native element clicks:** pre-check → `.nextStep`
  ("Proceed with the restoration") → DB step (set `dbhost/dbuser/dbpass/dbname` via `el.value`+`change` event,
  set **`prefix` to a DIFFERENT value** to prove re-prefixing) → `.nextStep` → poll target DB for the prefixed
  tables → `#doneAndNext` → site setup (the `sitename` defaults to the captured value, usually correct) →
  `#submitStep` → finalise → `#removeInstallation`. Then assert: `installation/` gone, `configuration.php`
  has the new prefix, front HTTP 200, site-client `#__template_styles home=1` = the template.
- **Two `home=1` template styles is normal, not a parity bug:** the admin template (e.g. `atum`, client_id=1)
  and the site template (client_id=0) each carry their own `home=1` default. Compare per client.
- **Screenshots time out on animated templates:** the MCP screenshot waits for a stability/fonts gate that a
  perpetual hero CSS animation never satisfies (5s timeout). Verify page parity via `evaluate` computed-style
  + structural probes (bodyClass, image `naturalWidth===0` broken count, section count, `fontFamily`,
  `scrollWidth>innerWidth` overflow, `html.className`/`data-bs-theme` for theme) — exact here because both
  sites render from byte-identical template files + identical DB.

## Verify discipline
- **Testing on the dev site instead of a clean frame:** you'll "pass" while the package is broken. Always a
  fresh DB + fresh files + a DIFFERENT prefix.
- **Asserting parity from a green install:** a fatal-free install that renders a different site is still a
  FAIL. Parity = page + DB comparison vs live, evidenced.
- **Secret-scan precision (CONFIRMED):** scan the SPECIFIC runtime paths (`cache/`, `administrator/cache/`,
  `tmp/`, `logs/`) — a recursive `-name cache` match flags legit CODE (`plugins/system/cache`,
  vendor `psr/cache`). And skip trivial dev DB passwords (<8 chars, e.g. DDEV's `db`) in the string-scan —
  they match legitimate content everywhere (false "password found"). Rely on the no-`configuration.php` check
  for the real secret guarantee.
- **Query the RIGHT project:** when comparing two DDEV projects, `ddev mysql` uses the CWD's project — run
  `<SRC>` queries from the source dir and `<TEST>` queries from the package dir, or you'll read one DB twice.

## Akeeba backup (headless) + pre-backup scrub
- **Akeeba Core's "Backup Now" admin page self-redirects to the Joomla dashboard under headless drive**
  (no `#backup-start` ever appears; even a token-bearing `view=Backup&<token>=1` URL bounces after ~1-2s).
  Don't fight the page UI. Drive the backup via Akeeba's **authenticated AJAX endpoint** from ANY stable
  admin page (e.g. the dashboard) with `fetch()` (same-origin auto-sends the HttpOnly session cookie):
  - Endpoint: `POST /administrator/index.php?option=com_akeebabackup&view=Backup&task=ajax&<csrfToken>=1`
    (`<csrfToken>` = `Joomla.getOptions('csrf.token')`), `Content-Type: application/x-www-form-urlencoded`.
  - Start: body `ajax=start&description=...&comment=` → response wrapped in `###{json}###` → strip the
    `###` and `JSON.parse`. Grab `backupid`.
  - Step: body `ajax=step&tag=backend&backupid=<backupid>` repeatedly. **`HasRun==1` means FINISHED**
    (not "still running"); stop on that or on non-empty `Error`. `Domain`/`Progress` track status
    ("Packing"→"finale", 0→100). The `.jpa` lands in `administrator/components/com_akeebabackup/backup/`.
  - Bound each `evaluate` to ~20s wall-time and resume across calls by passing the same `backupid` — avoids
    the MCP tool timeout on a long backup. Confirm with the DB (`#__akeebabackup_backups.status='complete'`)
    or the `done` flag, then check the `.jpa` on disk.
- **Scrub dev backup/scratch tables BEFORE the Akeeba backup, or they ship in the quickstart.** Build/review
  rounds leave `*_bak_*` copy tables (e.g. `str_modules_bak_fb2`, `str_template_styles_bak_fb2`) — Akeeba
  captures the WHOLE DB, so they bloat the dump AND carry stale data (e.g. deleted `t4_bs5_blank` styles
  reappear inside a `_bak_` table → a `grep t4_bs5_blank` on the dump is non-zero even after you cleaned the
  real tables). `DROP` every `*_bak_*`/`*_old`/`*_tmp` table first. **Detection:** after extracting the
  `.jpa`, `grep` the bundled `installation/sql/*` for the cruft string and for `INSERT INTO \`#__..._bak...\``
  — must be 0. Also clear `media/t4/optimize/*` + caches and remove old `.jpa`s from the backup dir before
  re-backing-up. (Found on Stratum rev 3: 8 `_bak_` tables had smuggled `t4_bs5_blank` back into the dump.)
- **A fast clean-frame DB-parity proof without standing up a whole new DDEV:** `sed 's/#__/<newprefix>_/g'`
  the bundled dump, import into a FRESH scratch database (`CREATE DATABASE …`; different prefix proves
  re-prefixing), assert **0 import errors** + per-table row-count parity vs live. This replicates ANGIE's DB
  step exactly; pair it with the file-presence checks (extracted template files carry the fixes) when the
  full ANGIE GUI restore was already verified on a prior rev with the same installer.

## Joomla 6 Guided Tours hijack the Akeeba-Core GUI drive (every admin view → dashboard)
**Symptom:** driving the Akeeba Core backup GUI (Playwright/CDP), `option=com_akeebabackup&view=Backup`
(and *every* component view, even `com_content`) bounces to the **Home Dashboard** — `#backup-start`
never appears. Looks like a redirect/auth failure but **the server returns 200** for those views (verify
with a same-origin `fetch(url,{redirect:'manual'})` from the page — `status:200, redirected:false`).
**Cause:** the Joomla 6 **Guided Tours** system plugin (`plg_system_guidedtours`, the Shepherd onboarding —
`document.body` carries `shepherd-enabled`/`hasTourModal`) does a **client-side redirect to com_cpanel** on
full page loads. `fetch` skips JS so it's clean; a real navigation runs the tour and gets redirected.
**Fix:** disable it for the automation window —
`UPDATE #__extensions SET enabled=0 WHERE element='guidedtours' AND folder='system';` — then the Backup
view loads and sticks; click `#backup-start`, poll `#__akeebabackup_backups.status` run→complete. Re-enable
on the live dev site after (the captured package shipping with tours off is harmless). Pre-flight: disable
guided tours BEFORE the first navigation to Akeeba.

## Scrub the web root BEFORE the Akeeba backup — it images EVERYTHING under docroot
Akeeba captures the whole web root. A dev build accumulates cruft AT the docroot that must not ship:
stray **verification screenshots** (`*.png/*.jpeg` dumped at root — saw 66+), **`build-docs/`**, prior
**`quickstart-data/`** staging, **`.playwright-mcp/`** (a ~12 MB browser profile), **`.claude/`**, errant
junk files. Move them OUT of the docroot (to a sibling holding dir; restore `build-docs` to the repo after),
clear `cache/ administrator/cache/ tmp/ media/t4/optimize/`, THEN back up. On Stratum this cut the `.jpa`
from 101 MB → 70 MB. Akeeba auto-excludes its own `backup/` output dir, so old `.jpa`s don't nest.
Probe the extracted tree after: `find extracted -maxdepth 1 -type f \( -name '*.png' -o -name '*.jpeg' \)`
= 0, and no `build-docs/.playwright-mcp/quickstart-data` dirs.
**`configuration.bak.php` ships the live DB password.** Joomla writes it beside `configuration.php` on every
Global Configuration save, Akeeba images it, and scrubbing `configuration.php` inside the JPA (scrub-jpa) leaves the
`.bak` untouched. Delete it in the docroot before the backup AND drop it from the archive; `secret-scan.sh` now
fails on it. (tracy_business 2026-09-13: found in the extracted verify tree with host/user/password/secret intact.)
This scrub is about junk AT the docroot. The base quickstart's leftover *definitions* (ACM dirs, layouts,
profiles, the base template, its description and thumbnails) are a different class and need
`scripts/quickstart/prune-audit.mjs` first — Q1a in `packaging-quickstart.md`, gotchas #81.

## Local Docker disk/router can block a SECOND DDEV project for the ANGIE web-restore
Standing up a clean `<TEST>` DDEV project to drive the ANGIE web restore can fail on a busy dev machine:
web container `No space left on device` (prune: `docker system prune -f` + `docker builder prune -f` freed
~12 GB) and/or `ddev-router failed to become ready` (dual-project routing churn). And the **host often has
no PHP** (so ANGIE `installation/cli.php` can't run on the host either). When the full web-restore is
environment-blocked, fall back to the **in-container re-prefix DB import** (above) for the DB/media/auto-active
parity axes + byte-verify the packaged template files carry the build's fixes — sufficient when a prior rev
with the same Akeeba installer already passed the full ANGIE GUI restore.

## DANGER: `ddev mysql` / `ddev exec` from the <TEST> dir can hit the <SRC> container (data-loss)
When two DDEV projects exist (the live `<SRC>` and a sibling `<TEST>` you spun up for the restore), a `ddev
mysql`/`ddev exec` issued from the `<TEST>` directory **can be routed to the wrong project's web/db container**
(DDEV resolves project by cwd, but in an agent thread the cwd resets between bash calls AND a name/router
collision can mis-resolve). Symptom: ANGIE reports "restore successful, 1.96 MB, 100%" but your `ddev mysql`
shows **0 tables** — because the data landed in `<TEST>`'s real db container while you were querying `<SRC>`'s.
The deadly version: a "clean the inherited tables" `DROP TABLE` you THINK is hitting `<TEST>` actually **wipes
the live `<SRC>` DB**. PREVENTION: for ALL parity/clean-up SQL, address the container EXPLICITLY by name —
`docker exec ddev-<project>-db mariadb -udb -pdb db -e '…'` — never bare `ddev mysql` when two projects are up.
Verify import landed by querying `ddev-<TEST>-db` directly, NOT `ddev mysql` from the dir. (Recovery if `<SRC>`
is wiped: it's still in your fresh `.jpa` — re-prefix the `<TEST>` dump qs_→str_ and reload into `ddev-<SRC>-db`.)

## ANGIE's site-setup step overwrites config defaults (page-title + SEF rewrite drift vs live)
ANGIE's **Site Setup** step writes a FRESH `configuration.php` and does NOT preserve the captured live
config's values for two settings, causing visible parity drift on the restored site:
- **`sitename_pagetitles`** → ANGIE defaults it to `1`; captured live had it 0 (no line). Restored site
  renders "<Sitename> - Home" instead of "Home".
- **`sef_rewrite`** → ANGIE defaults it to `0` (off); captured live had it `true`. Restored site emits
  non-SEF `/index.php/blog/...` URLs instead of clean `/blog/...` (the `.htaccess` IS shipped, just not used).
Both are cosmetic + user-adjustable and NOT packaging defects — grep the captured `configuration.php` inside
the `.jpa` and you'll see the correct values (`sef_rewrite = true`, no `sitename_pagetitles`). For an
exact-parity sign-off, after restore set the TEST `configuration.php` to match: `sef_rewrite='1'`, delete the
`sitename_pagetitles='1'` line (or set 0). Then clear cache + session so the front-end re-renders.

## Driving ANGIE's DB-restore headlessly: call its own `doAjax`, don't fight the gated button
The `#submitStep` button on ANGIE's DB step is actionability-gated (perpetual CSS animation) so MCP
`browser_click` times out, and a bare `dispatchEvent('click')` can fire before state is ready. RELIABLE path
(mirrors the Akeeba-backup AJAX drive): read the DB form into a `dbinfo` object exactly as `database.min.js`
does (`new FormData(document.getElementById('databaseSettingsContainer')).forEach((v,k)=>dbinfo[k]=v)`), grab
`akeeba.System.getOptions('brs.database').key` (= `"site"`), then via `browser_evaluate` call
`akeeba.System.doAjax({view:'dbrestore',task:'start',format:'json',key,dbinfo}, …)` once, then loop
`{…task:'step'…}` until the response `.done===1`. Set the **prefix** (e.g. `qs_`) in the form first to prove
prefix-agnosticism. Then continue the browser flow normally (Next → Site Setup → Finalise → removeInstallation).

## Nexora (J6.1.1) — JA license domain guard fatals ANGIE on standard ports
On a dev box where the JA template ships a **license-domain guard**, browsing ANY entry point on
port 80/443 with a non-licensed host fatals: `License error - license domain does not match your
domain (ddev.site!=joomlart.com)` — and this fires for **`/installation/index.php` (ANGIE) too**,
not just the T4 front-end. The source site dodges it by serving on a **non-standard router port**
(e.g. `:33000`). Fix for Q4: give the `<TEST>` ddev project the **same non-standard `router_http_port`**
(the router multiplexes projects by hostname, so `nexora-qstest.ddev.site:33000` coexists with the
source on `:33000`), then run ANGIE at that port. Do NOT try to bypass the guard by editing package
files — it works on the buyer's licensed domain; only the local dev host trips it.
- Two smaller traps hit the same session: (1) **zsh `nomatch`** aborts a whole `rm *.png *.jpg` line
  if any glob is empty — scrub cruft with `find -maxdepth 1 -type f -name '*.png' -delete` instead.
  (2) **Design-review screenshots at the docroot root** (e.g. `404-dark-1440.png`, a `shots/` dir,
  `.playwright-mcp/`, `.nexora-build/`) get captured into the `.jpa` (+123 MB). Scrub them from the
  live site and re-backup — the clean archive dropped 210 MB → 86 MB.

## Voyara (J6.1.1) — Akeeba Core skips the Smart Search index → /search empty after restore
Akeeba's DB dump ships the STRUCTURE of `#__finder_terms` (SRC 2716 rows) and `#__finder_links_terms`
(SRC 7215 rows) but **omits their DATA** (default "skip regenerable table data") — while it DOES ship
`#__finder_links` (143) + taxonomy. Net: a clean restore renders every page identically EXCEPT the
Smart Search `/search` page, which returns 0 results. A plain `finder:index` afterwards only makes ~227
terms because the shipped `#__finder_links` md5sums look "already indexed" so the indexer skips them.
Fix (verified): **clear the index first, then reindex** — admin Components → Smart Search → "Clear Index"
→ "Index"; or `TRUNCATE` the six `finder_*` tables then `php cli/joomla.php finder:index` → reproduces
SRC exactly ("travel" = 18 = 18). Ship a README post-install note (Akeeba cannot carry this regenerable
index). Add `finder_terms`/`finder_links_terms` to the DB-parity checklist so the gap is caught, not
masked by a table-list that stops at content/menu/modules.

## Voyara — three Akeeba/Kickstart drive traps
1. **Directory-exclusion via `#__akeebabackup_profiles.filters` JSON does NOT apply.** Writing
   `{"[SITEROOT]":{"directories":{".git":0,...}}}` straight into the profile row is silently ignored
   (backup size unchanged). Reliable exclusions: either the Akeeba **Files/Directories Exclusion GUI**,
   or **physically move the cruft out of the docroot** for the ~40s backup (`.git` 108M + `build-docs`
   46M + 57 root `.png` dropped the archive 168 MiB → 62 MiB) then move it back. If you move `.ddev`,
   `ddev exec` breaks — poll via `docker exec ddev-<project>-web …` during that window.
2. **Kickstart refuses to run as a guessable name.** `kickstart.php` (and ANY name containing
   `kickstart`, `ks`, or `akeeba`) 403s "Insecure setup detected". Rename to a fully random name with
   none of those substrings (e.g. `zq7v3m9restore.php`). Ship kickstart.php as-is + tell the user to
   rename it (README).
3. **The `.jpa` captures the source `.ddev/config.yaml`** → on restore into a DDEV `<TEST>` it overwrites
   the test project's config (`name: <source>`), colliding with the source project so `ddev exec` fails
   in `<TEST>`. Exclude `.ddev` from the archive, and address `<TEST>` containers by name
   (`docker exec ddev-<test>-web …`) during Q4.

## Voyara (J6.1.1) — the CORRECT `#__akeebabackup_profiles.filters` format (refines trap #1 above)
The earlier "filters JSON does NOT apply" is because the JSON shape was wrong AND the profile was
unconfigured. Verified working recipe:
1. **Run the Configuration Wizard once** (`view=Configurationwizard`, wait for "Finished Benchmarking").
   Until the profile is configured the engine ignores the `filters` column entirely and shows a
   "Let Akeeba configure itself?" dialog on the Backup page.
2. **Use the engine's real shape** — keyed FILTER-NAME → ROOT → **flat array of dir names**:
   `{"directories":{"[SITEROOT]":["build-docs",".ddev","dist","node_modules",".playwright-mcp","tmp"]}}`
   NOT `{"[SITEROOT]":{"directories":{"build-docs":0}}}` (inverted + `:0` objects → silently ignored).
   Confirmed against `Akeeba\Engine\Filter\Base`: `in_array($test, $filter_data[$root])` where
   `$filter_data = filter_registry['directories']`. `.git`/VCS come from a HARDCODED platform filter
   (`Cvsfolders.php`), independent of this column — seeing `.git` excluded ≠ your column works.
3. CORE has **no** `view=Fsfilters` GUI (404) — edit the column directly (dev DB is writable), then
   re-backup. With the correct format a clean full-site capture = 62 MB (vs 185 MB with filters ignored).
This is preferable to physically moving cruft when a dir CAN'T be moved (`.ddev` — needed to run DDEV):
exclude it via the filter instead. Verify the result with a JPA path-lister (expect `cruft matches: 0`;
the ~175 `.sql` "SECRET?" hits are false positives = Joomla/extension schema files).

## Helix (J6.1.1) run — two new drive traps

**Akeeba CORE unconfigured → every admin view client-side-redirects to the Joomla dashboard.**
Before the Configuration Wizard runs once, opening `com_akeebabackup` (Controlpanel/Backup) renders 200
server-side but a JS bounce lands you on the Joomla Home Dashboard, so native-clicking the Backup button
is unreliable. You do NOT need the wizard: drive the backup engine directly via `fetch()` in the logged-in
session — POST to `index.php?option=com_akeebabackup&view=Backup&task=ajax` with `ajax=start`
(+`description`, +`<formtoken>=1`) to get a `backupid`, then loop `ajax=step` (+`backupid`,+token) until the
`###{…}###`-wrapped JSON returns `HasRun==1` (1 = FINISHED, 0 = keep stepping). Default profile/config
produces a valid `.jpa` with no wizard. Immune to the redirect.

**ANGIE DB step: `#nextStep` is "Skip Restoration" — the trap.** On `view=database`, `#nextStep`="Skip
Restoration" (imports NOTHING → later "No Super User found"), `#submitStep`="Next" STARTS the restore
(opens the modal + AJAX import loop), and `#doneAndNext` appears only after it completes. Fill the DB form,
click **`#submitStep`**, poll the target DB until the prefixed tables land (~114), THEN click `#doneAndNext`.

**Docker "all predefined address pools have been fully subnetted"** when `ddev start` on the CLEAN <TEST>
project: too many leftover ddev networks. `docker network prune -f` then re-`ddev start`.

## Empty BACK-END admin menu after restore — the row-count blind spot (Helix)

**Symptom:** restored quickstart boots, front-end perfect, but the `/administrator` LEFT SIDEBAR menu is
empty (only "Toggle Menu"). Reported by the JA reviewer on extract.

**Root cause (build artifact, NOT a restore bug):** Joomla 4/5/6 render the backend sidebar via Atum's
`<jdoc:include type="modules" name="menu" />` — i.e. a **`mod_menu` module instance published to the admin
`menu` position (client_id=1, access=3/Special)**. On this build that module row was missing from
`#__modules` (deleted during the T4 build/de-blank). `#__menu` client_id=1 (42 rows, menutype 'main') was
intact — but with no module to render them, the sidebar is blank. Akeeba faithfully reproduced the gap.

**Why parity verify MISSED it:** Q4 checked `admin HTTP 200` + per-table ROW COUNTS. Both SRC and the
restored TEST were missing the SAME module, so `#__modules` counts matched (94==94) and admin returned 200.
Row-count parity is necessary but NOT sufficient — **it can't catch a defect already present on the source.**

**Add to the parity checklist (do this every time):** after restore, LOG IN to `/administrator` and assert the
sidebar actually renders items — grep the dashboard HTML for `sidebar-item-title` count > 1 (curl-login works
headless when Playwright is down). Also diff the client_id=1 `(position|module)` set of the source against a
KNOWN-HEALTHY sibling Joomla site — missing `menu|mod_menu` (and often `cpanel|mod_stats_admin`,
`postinstall|mod_feed`) is the tell.

**Fix (on the LIVE source, then re-capture):** recreate the module from a healthy sibling's row —
`mod_menu`, client_id=1, position `menu`, access **3**, showtitle 1, published 1, language `*`,
params `{"layout":"","moduleclass_sfx":"","shownew":"1","showhelp":"1","cache":"0"}`, plus a
`#__modules_menu (moduleid, 0)` assignment. Re-backup, re-restore, re-assert the sidebar renders.

## Tracy Business (J6.1.1, built ON the Tracy Base quickstart) — Q1a/Q2/Q4 traps, 2026-09-13

- **The base's definitions outlive their data** (18 ACM dirs, 8 layouts, 6 profiles, the base template, its
  description/author/thumbnails, its Cowork `contract` param). Neither the docroot scrub nor the `Blank` grep sees
  them; Phase 10 **Q1a `prune-audit.mjs`** does (gotchas #81). Run it BEFORE `extension:remove` of the base so the
  identity comparison has the base's `manifest_cache`.
- **`configuration.bak.php` ships the live DB password** — Joomla writes it on every Global Configuration save,
  and `scrub-jpa` only touches `configuration.php`. Drop it from the archive (an entry skip in scrub-jpa) AND delete
  it in the docroot; `secret-scan.sh` fails on it now. **BRS writes a fresh `configuration.bak.php` on the restored
  site too** — remove it from `<TEST>` before any file scan there.
- **Akeeba Core headless drive, the order that keeps the dump clean:** temporary admin password → log in (a Joomla
  session outlives a password change) → scrub the DB (`users.password='!'`, token, contract, logs, receipts,
  `akeebabackup_backups`) → write profile 1 (`configuration` = plain JSON, `embedded_installer: brs`) → start/step the
  backup through `view=Backup&task=ajax&<csrf>=1` from the open dashboard tab. Login success ≠ `option=com_cpanel`
  in the URL — check the page title (`Home Dashboard`), the redirect lands on `/administrator/index.php`.
- **Unattended BRS restore = `php installation/cli.php execute`** with `installation/config.yml.php` (the
  `#<?php die(); ?>` YAML: `database.site.{dbname,dbhost,dbuser,dbpass,prefix,existing: drop}`, `setup.{superuserid,
  superuseremail,superuserpassword,superuserpasswordrepeat,newsecret,sitename,tmppath,logspath,mailonline}`).
  `cli.php` alone only lists commands. The front end answers 302 until `installation/` is removed.
- **BRS applies `setup.sitename` to the restored `configuration.php`**, so every `<title>` differs from `<SRC>` and a
  text-parity diff flags 98/98 routes. Normalise the site name on `<TEST>` (or feed the source's name) before comparing.
- **Do not run add/remove-language (or any structural test) on `<TEST>` while the audit crawler is running on it** —
  the crawler follows the language switcher into the temporary language and reports `langSwitchBroken` after the
  removal. Audit on a quiet stand, test scripts after (or before), never overlapping.
- **A disk that fills mid-run kills Docker Desktop and the stand containers with it** (capture stopped with SIGWINCH,
  `db` down → 500 on every stand). Check `df -h /` before Q2/Q4; free your own scratch only; expect to restart Docker
  and `compose up -d` the whole project, not one service.
- **Someone can wipe `~/Library/Caches/ms-playwright` between runs** (disk cleanup) — `browserType.launch: Executable
  doesn't exist`. `npx playwright install chromium` from the skill dir (95 MB) and continue.
- **Row-count parity is not content parity.** Compare params/attribs hashes AND an article-body hash (title, intro,
  full text, language, catid, state) per table — a restore that re-encodes or truncates text keeps the counts.
- **After Phase 10 there is a Phase 11 nobody wrote yet — "Integrate".** A release on GitHub is not a quickstart
  Tracy can use: the fleet restores a **runtime** pair (webroot `.tar.gz` with literal prefix + `database.sql.gz`,
  pinned by url/sha256/bytes/`githubAssetId` in `provision/quickstarts.json`), and the Build reads
  `capabilities.json` (artifact kind `tracy-runtime-quickstart` + provider + `site.create.<design>`). Both are
  DATA; the first boot (`joomla-bootstrap.php`, `joomla.sh`) may still hard-bind another quickstart's contract —
  read it before declaring a provider `ready`. Procedure + measured traps (asset ids only exist after upload,
  regenerate `SHA256SUMS` after adding assets, tag with `/` → `%2F` in the API, `downloads.joomla.org` answers 403
  to a request without a User-Agent): TCH `tasks/notes-quickstart-tracy-business-integration.md` (13/09/2026).
