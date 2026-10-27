# Contract sources

The five `*.schema.json` files copied from audit-kit are byte-for-byte copies, pinned here so no
test depends on a live repository. They are excluded from formatting by `biome.json` in this
folder; reformatting one changes its hash and fails `tests/qa/selftest/schema.test.mjs`.

- Source repository: https://github.com/hanoxbt/audit-kit
- Revision: `660c72edc499720eeb80b0605ddd0eee557b7540`
- Source directory: `automation/contracts/`

| File | Source path | sha256 |
|---|---|---|
| `result.schema.json` | `automation/contracts/result.schema.json` | `f9c0f4ebe5f6f9f5994d5b2652c7ffa96af70623b85c31162bd4a61fc298c901` |
| `cross-audit-inventory.schema.json` | `automation/contracts/cross-audit-inventory.schema.json` | `c2914ae1b0b40a4c717c9ca490faa971a32faec2abece8cb860ba6bd1cb26e81` |
| `cross-audit-journeys.schema.json` | `automation/contracts/cross-audit-journeys.schema.json` | `cd9593ea2b3c3e535eb5c923a05bfebf92307c54cadc011f5c3615bab41019f6` |
| `cross-audit-coverage.schema.json` | `automation/contracts/cross-audit-coverage.schema.json` | `9f7cdb606f0f1d0045a4424fd506ff371862748ab1715266a65e5b6d951c5948` |
| `cross-audit-automation-run.schema.json` | `automation/contracts/cross-audit-automation-run.schema.json` | `a8a6980a091a14c8d5cffd378114e31138f539236a66dce52a2e43b342155c47` |

Authored here (not copied; may change with the QA suite):

- `case.schema.json`: one case manifest, the shape fixed in the shared brief (plan §2).
- `layer-result.schema.json`: the array a layer's `run()` returns.
- `denominator.schema.json`: the one shape of every layer's `denominator.json`
  (`tracy-qa-denominator/v1`). Used at run time by `../lib/denominator.mjs`, which adds the rules a
  schema cannot say; described in `../layers/README.md`.

Of the copied schemas only `result.schema.json` is used at run time (it validates every emitted `results.json`). The
inventory, journeys, coverage and automation-run schemas are pinned for W1 and later tooling; the
validator in `../lib/schema.mjs` supports every keyword they use and rejects any other.
