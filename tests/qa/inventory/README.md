# QA inventory

A static, best-effort list of what exists in the repo (API doors, host routes, strings, gates, journeys, legacy findings…). It does not prove any test ran; its job is to **never report "complete" for something it could not resolve**. Regenerate: `node tests/qa/inventory/build.mjs`; drift check: `node tests/qa/inventory/build.mjs --check`; selftest: `node --test tests/qa/inventory/test/`.

## Sources and the layers' denominators

- **20 extractors** (`extractors/*.mjs`, listed in `EXTRACTORS` in `build.mjs`). Since 07/10/2026 there is also `migrations`: each `.sql` file that tracy-web's `migrate()` applies (`apps/tracy-web/src/db/migrations`, top level only, in name order) is a `migration` item, with `infra` as the expected owning layer. Files in subfolders, symlinks, FIFOs, names not following `NNN-name.sql`, empty files or files over 512 KB are listed in `unresolved`; a symlink or FIFO with a `.sql` extension makes the source `incomplete`. The `creates`/`alters` table names are read lexically, not by parsing SQL.
- **A layer's denominator** (`tests/qa/layers/<layer>/denominator.json`) follows one shared schema: [`../contracts/denominator.schema.json`](../contracts/denominator.schema.json), checked by [`../lib/denominator.mjs`](../lib/denominator.mjs), described in [`../layers/README.md`](../layers/README.md). One file that breaks the contract fails the whole build (exit 1, nothing written); there are no per-item exceptions. A layer may claim an item another layer is expected to own (`crossLayer`) when that item's kind is in `KIND_TABLE`.
- **Differences from plan §1** are printed under "Reconciliation": the plan's numbers were measured on `origin/develop fa4dc66a5` (05/10/2026); after merging `develop 3bc601ecd` and then `6aefcf5d3` (07/10/2026) 17 numbers changed (API doors, host routes, UI switches, web strings, stories, regressions, e2e-dev journeys, scripts) and are kept as `DIFFERS`; the plan's numbers are not edited to match.
- **Claims by id:** the inventory matches a layer's claims to its own items by id. `api`, `mail`, `harness`, `unit`, `cms`, `related` use ids different from the extractors', so their claims count as `not-in-inventory`, and the inventory items of those layers stay `unowned`. This is a known gap, not fixed yet.

## Known limits

The two limits below are recorded on purpose and are not fixed in W1:

- **`return` inside a nested function that is never called.** The route scanner (`extractors/route-scan.mjs`) reads `return x` in an uncalled nested function as if it were the app value the factory returns. Reachability analysis of never-called functions is outside the scope of a static extractor.
- **Short write in the legacy importer.** `extractors/common.mjs` writes the legacy copy with a single `writeSync`; if the OS writes fewer bytes, the copy can be truncated. The builder (`build.mjs`) already loops until every byte is written; the importer does not. Rerun the import and `--check` to detect it.

Out of scope: fault injection on file-system calls is not part of the selftest.
