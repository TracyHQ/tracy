# Akeeba method — the official JoomlArt quickstart (THE method, VERIFIED)

> **Phases Q1–Q4 packet — THE mandatory method.** The only method this skill ships: Akeeba `.jpa` +
> Kickstart/ANGIE. Read before any capture or restore. It SUPERSEDES the base.sql/installer route
> entirely (the base.sql/zip installer-quickstart route is DEPRECATED and not shipped — see
> `packaging-quickstart.md` §"The method").

This is how real JoomlArt quickstarts are built: a **full-site image** (all files + DB + config) captured by
**Akeeba Backup** into one `.jpa` archive, restored byte-for-byte by **Kickstart + ANGIE**. It is the highest-
fidelity method — no Joomla-installer SQL hacks, no per-table seeding; the restored site IS the live site.
VERIFIED end-to-end on JA Stratum (J6.1.1): clean restore under a DIFFERENT prefix reproduced the live DB with
100% row-count parity and the template auto-active. **This is the ONLY shipped method — there is NO base.sql
fallback** (that route drifts from the live site; solve any Akeeba tooling block, never downgrade — SKILL.md "The method").

## What the package is
- **`<site>.jpa`** — one Akeeba archive containing: every site file, the `installation/` **ANGIE** restorer,
  and the **DB dump** (`installation/sql/site.sql` + multipart `.s01…` + `databases.json`). It also captures
  the live `configuration.php` (ANGIE overwrites it on restore).
- **`kickstart.php`** — Akeeba's free standalone restore launcher (extracts the JPA + starts ANGIE). The
  end-user uploads `kickstart.php` + the `.jpa` to an empty web root, opens `kickstart.php`, and follows ANGIE.

## Q1 (export) — install Akeeba on the SOURCE site + take a backup
1. Install Akeeba Backup on the live site. Joomla CLI: re-zip the `pkg_akeebabackup` package + `php cli/joomla.php
   extension:install --path=/var/www/html/tmp/pkg_akeebabackup.zip`. (Verify `com_akeebabackup` enabled.)
2. **Take the backup. Edition matters:**
   - **Akeeba PRO** (best for automation): `php cli/joomla.php akeeba:backup` / the native CLI / the JSON API —
     fully scriptable, no browser. Use this if available.
   - **Akeeba CORE (free) backs up ONLY via the admin GUI** — no CLI, no front-end/remote/JSON backup (those
     are PRO). To automate Core headlessly, drive the admin GUI with Playwright (VERIFIED working):
     - Log into `/administrator` (set a known Super User password locally first).
     - Open the Akeeba CP (`index.php?option=com_akeebabackup`), then **click the real "Backup Now" link
       element** (`element.click()` via evaluate) — do NOT construct `&view=Backup&autostart=1&returnurl=…`
       URLs: the `returnurl`/autostart flow redirects the page after ~2s and the engine logs *"aborted on
       user's request"*. Native element clicks carry the correct token + flow.
     - On the Backup page click **`#backup-start`**, then **poll `#__akeebabackup_backups.status` from the
       shell** until it flips from `run`→`complete`. **Do NOT navigate the browser during the backup** — any
       navigation fires the AJAX loop's abort. The `.jpa` lands in `administrator/components/com_akeebabackup/backup/`.
   - Page screenshots may time out on these pages (perpetual CSS animation) — use `evaluate`/`element.click()`
     and DB polling instead of screenshots/actionability-gated clicks.

## Package — `.jpa` + `kickstart.php`
Ship both. `kickstart.php` is a free standalone download from akeeba.com (no PRO needed). NOTE: Akeeba's
packages (Backup + Kickstart) sit behind akeeba.com's **free-account download manager** — they can't be
fetched programmatically. **They are bundled with this skill (GPLv3) at `assets/akeeba/`** so it's
self-contained: `pkg_akeebabackup-10.3.5-core.zip` (install on the source site) + `kickstart.php` (ship with
the `.jpa`). Use those directly — no download needed. Check akeeba.com for newer versions when targeting a
newer Joomla.

## Q4 (verify) — clean restore + parity, the centrepiece
In a genuinely CLEAN env (fresh files + empty DB):
1. **Extract the JPA.** Use `kickstart.php` (web), or a JPA extractor when Kickstart isn't to hand. The JPA
   format is open: a `JPA` archive header (`JPA` + uint16 header-len + major/minor + uint32 fileCount/uncompressed/
   compressed) then per-file **`JPF`** entity blocks (`JPF` + uint16 **entity-header-length** + uint16 pathLen +
   path + type[0 dir/1 file/2 link] + compression[0 none/1 raw-deflate/2 bzip2] + uint32 csize/usize/perms +
   extra). **Key trap:** the entity-header-length is the TOTAL header size measured from the `JPF` signature
   (it includes ~28 extra trailing bytes, e.g. timestamps) — after reading the known fields, **seek to
   `pos0 + entity_header_length`** for the data start, else you drift and zlib throws "too many length/distance
   symbols". Compression type 1 = raw DEFLATE → `zlib.decompress(data, -15)`. (A working Python extractor is in
   `scripts/quickstart/jpa-extract.py`.)
2. **Run ANGIE** (`/installation`): drive with Playwright native-clicks (same discipline as the backup GUI):
   pre-check → **Next** (`#nextStep`) → **DB step**: fill `dbhost/dbuser/dbpass/dbname` for the fresh DB + set
   **`prefix` to something DIFFERENT from the source** (proves re-prefixing) → submit (`#submitStep`), poll the
   target DB until the prefixed tables are imported → **Next step** (`#doneAndNext`) → **site setup**: SET THE
   REAL SITE NAME (the `sitename` field defaults to "Joomla!" — leave it and the logo wordmark renders "Joomla!"
   instead of the brand) → **finalise** → **Remove the installation directory** (`#removeInstallation`). ANGIE
   imports the DB + writes a fresh `configuration.php`.
3. **Assert parity (evidence, not assertion):** `installation/` removed; `configuration.php` written with the
   new prefix; front-end HTTP 200 rendering the demo; `#__template_styles WHERE home=1` = the template
   (auto-active); and **per-table row-count parity vs live** (content/menu/modules/fields_values/categories/
   tags/users/template_styles all equal). On Stratum this matched 8/8 exactly.

## Why NOT the base.sql installer route (deprecated)
The base.sql/zip "installer quickstart" route is **DEPRECATED and not shipped** — it
re-creates the site from a hand-assembled tree + a tokenized SQL dump, which **drifts from the live site**
(missing media/extensions/params, prefix edge cases, `configuration.php` hacks) and is NOT the JA
deliverable. If the Akeeba GUI-drive seems blocked (e.g. Playwright can't load the ddev HTTPS), that is a
TOOLING problem to solve (cert-ignoring headless Chrome over CDP, or the plain-HTTP ddev URL, or Akeeba PRO's
JSON/CLI) — **never a reason to downgrade to base.sql.** Solve the drive.
