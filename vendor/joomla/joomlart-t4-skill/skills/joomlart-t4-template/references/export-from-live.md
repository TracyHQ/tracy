# Q1 — Export from the live source (DB + media + extensions), scrubbed

> **Phase Q1 packet — prepare the live source.** Scrub list + media-bundling + `#__`-tokenized
> parity-baseline counts. With Akeeba the `.jpa` captures files+DB itself; this file's DB-dump/`export-db.sh`
> output is the Q4 DB-parity baseline + the in-container re-prefix shortcut, NOT the shipped artifact.

Export READ-ONLY from `<SRC>`; never mutate the live DB; all packaging on copies. Export the FINAL reviewed
state — re-export after the last content change so the package can't ship stale content.

## 1. Database dump (`#__`-tokenized, final state)
- Dump the whole demo DB: `ddev export-db --file=… ` or `mysqldump` (single transaction, complete inserts).
- EXCLUDE volatile/secret tables from the demo content (they pollute or leak): `#__session` (always),
  optionally `#__user_keys`, `#__action_logs`, `#__redirect_links`, `#__#__updates`/update sites are fine.
  Keep everything that IS the demo: content, menu, modules, categories, tags, fields, fields_values,
  contact_details, template_styles, extensions, users (the demo personas + admin), assets, ucm_*.
- **Tokenize the prefix to `#__`** on table identifiers only (not data). See `scripts/quickstart/export-db.sh`.
- **Admin user:** decide policy — keep the demo admin (document the default credentials in the readme) OR let
  the installer create the admin and exclude conflicting `#__users`/`#__user_usergroup_map` rows for it.
  Official quickstarts usually let the installer set the Super User; keep the DEMO content users (authors).
- Sanity the dump: it must contain the refactor markers (com_fields, ACM params, menu params) and the right
  row counts (compare to live counts — this becomes the Q4 DB-parity baseline).

## 2. Media / images
- Bundle EVERY media dir the content references: `images/` (esp. `images/demo/…`), and any content assets
  under `media/`. Cross-check against the content: grep the dump + article bodies for `images/`/`media/`
  paths and confirm each referenced file exists in what you're bundling. A referenced-but-unbundled image is
  a guaranteed Q4 parity miss.
- Do NOT bundle `media/t4/optimize/*` (stale dev bundle) — it's regenerated at runtime.

## 3. Extensions + template
- The template `templates/<TPL>` (compiled `css/template.css` included; `scss/` source optional).
- JA extensions at their installed versions: `plugins/system/t4`, `modules/mod_ja_acm`,
  `administrator/components/com_jaextmanager` (+ their admin assets + language files).
- Any 3rd-party extensions the demo uses. NOTE licensing: don't redistribute paid/keyed extensions without
  rights; if one needs a key, document it in the readme (see gotchas).
- These files come from `<SRC>` as-is; their `#__extensions` rows ride in the DB dump so Joomla knows they're
  installed.

## 4. Scrub list (apply before packaging — secrets + dev artifacts)
REMOVE / never copy:
- `configuration.php` (installer regenerates) and `.env`, `*.env.*`.
- `.ddev/`, `.git/`, `node_modules/`, `.idea/`, `.vscode/`.
- `cache/*`, `administrator/cache/*`, `media/t4/optimize/*`, `tmp/*`, `*/logs/*`, `administrator/logs/*`.
- Dev-only SQL fragments and scripts at the repo root (the build's `quickstart-data/seeds/_obsolete-patches`,
  `_tmp-*.php`, etc.), `build-docs/`.
- Any test/QA screenshots, `.playwright-mcp/`, `.DS_Store`.
- `#__session` rows, dev/test users beyond the demo personas + the one admin you intend.
**Secret-scan before zipping** (`scripts/quickstart/secret-scan.sh`): fail if the live DB password, `secret` value, or a
`.env`/`configuration.php` is present anywhere in the staging tree.

## Output of Q1
A staging set: `quickstart.sql` (tokenized, final), `media/` (all referenced assets), the Joomla+extensions+
template file tree (scrubbed), and the inventory counts (for Q4 parity).
