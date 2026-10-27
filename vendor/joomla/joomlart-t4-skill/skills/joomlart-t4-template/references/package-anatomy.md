# Quickstart package anatomy + the install mechanism

> **Phase Q0 packet — preflight + mental model.** What a JA quickstart contains end-to-end. NOTE: the
> install-mechanism / "three delivery forms" sections describe the legacy base.sql installer — the SHIPPING
> method is Akeeba `.jpa` (`akeeba-method.md`); read them as background, not the build path.

## What a JoomlArt quickstart IS (end to end)
A quickstart is a **complete Joomla site**, zipped, that the user uploads/extracts to a web root and installs
with the normal Joomla web installer — except the installer seeds the **demo content** so the result equals
the live demo. It contains:
- **Joomla core** at the exact version the build uses (e.g. 6.1.1) — the full tree INCLUDING the
  `installation/` web installer.
- **All extensions** the template needs, pre-placed in the tree: the **T4 plugin** (`plugins/system/t4`),
  **mod_ja_acm** (`modules/mod_ja_acm`), **com_jaextmanager**, the **template** (`templates/<TPL>`), plus any
  3rd-party extensions used in the demo — all already "installed" (files + their `#__extensions` rows live in
  the bundled DB dump).
- **The demo database** as a single SQL dump, `#__`-tokenized, holding every menu/article/module/ACM param/
  com_field/category/tag/template-style(megamenu)/user/contact — the entire live state.
- **The demo media** (`images/…`, any `media/` content assets) the content references.
- **A manifest/readme** (version, Joomla compat, install notes, default admin note).
- NO `configuration.php` (the installer writes it), NO secrets, NO dev cruft.

## How the demo DB gets imported on install (the mechanism)
> ⛔ LEGACY/background — this describes the base.sql installer route, which is **DEPRECATED and NOT the
> shipping path**. The shipped quickstart is an Akeeba `.jpa` restored by Kickstart/ANGIE
> (`akeeba-method.md`); ANGIE imports the captured DB directly (no installer-SQL wiring). Read the below for
> Joomla-installer background only.

The Joomla web installer, at the "database" step, creates the schema and (when offered) **sample data**. A
quickstart replaces/ә augments that sample data with the template's demo dump:
- The installer reads sample-data SQL from `installation/sql/mysql/` (the profiles the installer lists) and/or
  runs the bundled quickstart SQL after the base schema. JoomlArt's quickstart ships the demo as the
  installed sample data so selecting it (or the JA default) imports the whole demo.
- Every table reference in that SQL is `#__` (placeholder); the installer rewrites `#__` to the **user-chosen
  prefix** at import time. This is why **prefix tokenization is mandatory** — a dump with literal `str_`
  cannot install under any other prefix.
- The installer then writes `configuration.php` (DB creds, secret, paths) from the user's input — so the
  package must NOT contain one.

Because exact installer wiring evolves across Joomla versions and the JA installer profile, **do not rely on
memory of the wiring — let Q4 (verify) prove the import actually ran and produced parity.** If the chosen
mechanism doesn't import cleanly, Q4 catches it and you adjust (where the SQL is placed / how it's referenced)
until a clean install reproduces the live DB.

## Prefix tokenization
- Live dump uses `str_` (or whatever `<SRC>` uses). Convert every `str_` table-name occurrence to `#__`
  (table create/insert/constraint/`#__` already-present rows). Watch for `str_` appearing INSIDE data
  (content/params) — only tokenize the schema/table identifiers, never data values. The safe transform is on
  `` `str_<name>` `` and `str_<name>` as SQL identifiers, not arbitrary substring replace. See
  `scripts/quickstart/export-db.sh`.
- Also tokenize any prefix baked into `#__` data that stores table names (rare) and the `#__session` is
  excluded entirely (don't ship sessions).

## configuration.php
- The installer regenerates it. If you must ship a template config (some quickstart flows do), ship
  `configuration.php-dist` with placeholders and NO real creds/secret — never the live one.

## The delivery forms (only #0 ships)
0. **Akeeba `.jpa` + Kickstart (THE shipping form — what this skill builds).** A full-site image (files +
   DB + config) captured by Akeeba, restored byte-for-byte by Kickstart + ANGIE — highest fidelity, exactly
   what official JA quickstarts ship. → `akeeba-method.md`. **This is the build path; the forms below are
   background only.**
1. **Installer quickstart (DEPRECATED — was the official-looking JA form).** Full Joomla + installer +
   bundled demo SQL + media; user runs the web installer once. **No longer shipped** — it drifts from the
   live site (missing media/extensions/params, prefix edge cases, config hacks); see `packaging-quickstart.md`
   ⛔ banner. Background only, not a co-equal option.
2. **Sample-data plugin (`plg_sampledata_<tpl>`).** Ships inside the template; user installs Joomla + the
   template, then clicks "Install Sample Data" in the admin. Multi-step and the user must already have Joomla.
   Not the quickstart deliverable (background).
3. **Dev DDEV snapshot.** `ddev export-db` dump + `images/` + `ddev import-db` — for developers reproducing
   the build locally, NOT an end-user quickstart. (This is what `quickstart-data/` in the build holds.)

The build skill's `quickstart-data/` (dump + RESTORE.md) is form #3 and the dev-side raw material; this skill
does NOT turn it into an installer zip — it captures the live site WHOLE as an Akeeba `.jpa` (form #0) and
parity-verifies that restore.
