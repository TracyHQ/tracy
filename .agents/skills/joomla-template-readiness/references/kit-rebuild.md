# Rebuilding a template kit without losing the hidden fields

`template-kit/cli.mjs build` writes the kit's whole `site` part again from what it reads on the site
(`lib/kit-site.mjs`, `mergeSite`). The five fields a person declared by hand are part of `site`, so a rebuild wipes
them and the verdict comes back with `kit-hidden-field-missing`:

- `emptyVideoButtons`, `selfLinkButtons`, `hiddenPageLinks`, `createdPageHide` (with `noneWhy` for an explicit none)
- `createdPageLayouts.legal`

The settle commands (`samples`, `slot-roles`, `relabel`, `setting-slots`) and `pack` keep them; only `build` loses them.

## Steps

Run from the repository root. `KIT_DIR` is the build's `--out` folder, `CONTRACT` the contract folder of the version.

1. **Save** from the kit committed beside the contract (the last declared state):
   ```bash
   node .agents/skills/joomla-template-readiness/scripts/hidden-fields.mjs save \
     --kit "$CONTRACT/template-kit.json" --to "$RUN/hidden-fields.json"
   ```
   No kit yet (`kit-missing`): nothing to save; the fields are read fresh in step 4.
2. **Build** as the kit README says (step 2, `build --full`, on a site restored from the pinned version, never the
   public demo).
3. **Replay** onto the new kit, then pack:
   ```bash
   node .agents/skills/joomla-template-readiness/scripts/hidden-fields.mjs replay \
     --from "$RUN/hidden-fields.json" --kit "$KIT_DIR/template-kit.json"
   node packages/cms/tracy-quickstart-tools/template-kit/cli.mjs pack --out "$KIT_DIR"
   ```
   The replay calls the kit tool's own commands, so a selector the tool now refuses fails loudly here.
4. **Read again what changed.** A new template version can move a layout: when the template's
   `html/com_content/article/` files, its chromes or its list layouts changed since the saved kit, read them again and
   declare each field fresh (README steps 8 and 9) instead of replaying. A field never declared stays absent, and the
   verdict names it.
5. Copy the pack's `template-kit.json` beside the contract and read the verdict again.

## Why a script and not a reminder

The trap is silent: the rebuild exits 0, and only the next verdict shows the loss. The fix for every template is in the
kit tool (keep the hand-declared fields across `build`); until that tool fix lands, this save and replay is the
procedure. When it lands, delete this file and the script.
