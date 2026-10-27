# Traceability matrix

The required chain, from risk to fix:

**risk → requirement → control → case → evidence → finding → fix/recheck**

Each link has one data source; the matrix is a way of reading those sources together, not a second hand-entered table.

| Column | What it is | Data source | State when W1 generated it |
|---|---|---|---|
| **risk** | What can break and the consequence | Old audit items (`legacy/audit-plan.json`, 212 items) and `CLAUDE.md` §3 (blast map) | Present |
| **requirement** | An independent requirement that decides right/wrong | The case's `oracle` (spec, ADR, `CONTEXT.md`, catalogue, SHA-pinned API snapshot, the commit containing the bug) | Declared by each layer — **PENDING** |
| **control** | What checks it: gate, test, script, manual check | `sources` and `layers` in `inventory.json` (gates, existing tests, regressions, journeys) | Present (as items) |
| **case** | A case with id `QA-<LAYER>-<item>-<tag>` | `tests/qa/layers/<layer>/cases/*.json` | Not yet — **PENDING** |
| **evidence** | Machine results, RED-proof logs, screenshots for a person to tick | `results.json`, `red/`, `screenshots/` of a run | Not yet — **PENDING** |
| **finding** | A product defect found | `legacy/audit-findings.json` (158 old findings, ids, `file:line` and sources kept); new FAILs from the layers | Present (old) |
| **fix/recheck** | The PR/issue that fixes it and the re-check | The finding's `fixRefs`; the case's `legacyIds` | **null** when the ledger does not say — never invented |

## Legacy assets are neither dropped nor done twice

`legacy-map.json` assigns **exactly one owning layer** to each legacy asset: 158 findings, 157 regression cases (`REG-*`), 18 e2e-dev journey ids (`J*`) and 212 audit items. Each row has a `basis` (the rule that chose the layer) so a reviewer can dispute it. Journey `J2c` still records why it has no executable case (import has no source site owned by the suite).

An expected owner does **not** mean the asset has been checked: an old finding becomes `fix/recheck` only when it has a case, a RED proof and its own source for the closing decision.

## Reading one row (structural example)

| risk | requirement | control | case | evidence | finding | fix/recheck |
|---|---|---|---|---|---|---|
| audit item `QA-SSR-006` | oracle pinned by the `ui`/`flows` layer | item `journey:*` or a related gate | `QA-UI-…` (not written yet) | PENDING | `F-S1-001` | `fixRefs` (null when absent) |

The row above only illustrates the structure; it does not claim the case exists or passed. Never use `findings: []` as evidence that there are no defects.
