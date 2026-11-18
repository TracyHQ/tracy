# Rebuilding a template kit without losing the hand-declared fields

`template-kit/cli.mjs build` and `assemble` write the kit's `site` part again from what they read on the site
(`lib/kit-site.mjs`, `mergeSite`). The fields a person declared by hand are part of `site` and are never read from the
site:

- `emptyVideoButtons`, `selfLinkButtons`, `hiddenPageLinks`, `createdPageHide`, `stockScreens` (with `noneWhy` for an
  explicit none)
- `createdPageLayouts.legal`

The tool's list of them is `lib/declared-site-fields.mjs` (`DECLARED_SITE_FIELDS`); the declare commands, the merge and
the save/replay script all read it.

## A build into a folder that already holds a kit: nothing to do

When `--out` already holds a `template-kit.json`, `build` and `assemble` carry every declared field forward from it, as
written, never recomputed. The settle commands (`samples`, `slot-roles`, `relabel`, `setting-slots`) and `pack` keep them
too. A folder holding only the committed kit (no `site.json` yet) works the same since template-kit 3.1.4: the build's
first assemble, which runs before the site part, keeps the fields beside the kit (`declaredSite`) and the looks
(`looksWaiting`) until an assemble with the site part and the shots puts them back. A tool older than 3.1.4 lost them
there (JA Diner 1.0.8 rebuild, 16/11/2026): use the save and replay below with it.

After a rebuild, the person files the kit folder held are not in the committed kit: `reach-accepts.json` (from
`checkAccepts`), `gap-accepts.json` (from the accepted `templateGaps`) and `field-drives.json` (from `storedFields[].drives`)
are written back from it before the build, or their reasons and measurements are gone. Then measure the fields of the
blocks the rebuild added (`measure-fields --slots <prefix,...> --scratch-site` on the throwaway stand) and run
`slot-roles` before `pack`.

## A build into an empty folder: save and replay

An empty `--out` has no kit to keep them from. Run from the repository root. `KIT_DIR` is the build's `--out` folder,
`CONTRACT` the contract folder of the version.

1. **Save** from the kit committed beside the contract (the last declared state):
   ```bash
   node .agents/skills/joomla-template-readiness/scripts/hidden-fields.mjs save \
     --kit "$CONTRACT/template-kit.json" --to "$RUN/hidden-fields.json"
   ```
   No kit yet (`kit-missing`): nothing to save; the fields are read fresh in step 4.
   Or copy `$CONTRACT/template-kit.json` into `KIT_DIR` before the build: the build then keeps them itself.
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
   declare each field fresh (README steps 8 and 9) instead of keeping or replaying. A field never declared stays absent,
   and the verdict names it.
5. Copy the pack's `template-kit.json` beside the contract and read the verdict again.
