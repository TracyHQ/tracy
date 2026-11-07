# Rebuilding a WordPress template kit without losing the hidden fields

The trap is the Joomla one (`joomla-template-readiness` `references/kit-rebuild.md`): `template-kit/cli.mjs build`
writes the kit's whole `site` part again, so the five hand-declared fields (`emptyVideoButtons`, `selfLinkButtons`,
`hiddenPageLinks`, `createdPageHide`, `createdPageLayouts.legal`) are gone and the verdict reads
`kit-hidden-field-missing`. The settle commands and `pack` keep them. Two things differ on WordPress: the build needs
the database to read pages as their sections, and the legal layout is a block template checked against the theme.

Run from the repository root. `KIT_DIR` is the build's `--out` folder (empty, outside the repository), `CONTRACT` the
contract folder, `WEBROOT` the demo's webroot (it holds `wp-content/themes/<theme>`), `DB` the demo's database as
`mysql://user:pass@host:port/name` (or `--db-command '<client prefix>'`).

1. **Save** from the kit committed beside the contract:
   ```bash
   node .agents/skills/wordpress-template-readiness/scripts/hidden-fields.mjs save \
     --kit "$CONTRACT/template-kit.json" --to "$RUN/hidden-fields.json"
   ```
   No kit yet (`kit-missing`): nothing to save; the fields are read fresh in step 4.
2. **Build** on the demo, never the public demo:
   ```bash
   node packages/cms/tracy-quickstart-tools/template-kit/cli.mjs build --full \
     --site <demo address> [--host-header <the name in siteurl>] --contract "$CONTRACT" --out "$KIT_DIR" \
     --db "$DB" --webroot "$WEBROOT"
   ```
   The platform is read from the contract's `manifest.json`. Without `--db` (or `--db-command`) every page is read
   as one body block instead of its sections, and the site part misses what it reads from options, pages,
   `wp_navigation` posts and template parts (named in `errors`). `--host-header` is needed when the demo answers only on
   a local port: WordPress redirects any other host name to its `siteurl`.
3. **Replay** onto the new kit, then pack:
   ```bash
   node .agents/skills/wordpress-template-readiness/scripts/hidden-fields.mjs replay \
     --from "$RUN/hidden-fields.json" --kit "$KIT_DIR/template-kit.json" --webroot "$WEBROOT"
   node packages/cms/tracy-quickstart-tools/template-kit/cli.mjs pack --out "$KIT_DIR"
   ```
   The replay runs the kit tool's own commands, so a block template the theme no longer has fails loudly here.
4. **Read again what changed.** When a new theme version changed its `patterns/`, `parts/` or `templates/` since the
   saved kit, read them again and declare each field fresh (fix map, `kit-hidden-field-missing`) instead of replaying.
5. Copy the pack's `template-kit.json` beside the contract and read the verdict again.

The save and the replay are the Joomla skill's (`scripts/hidden-fields.mjs` imports them). When the kit tool keeps the
hand-declared fields across `build`, delete this file and both scripts.
