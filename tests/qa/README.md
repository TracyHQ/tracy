# tests/qa — what remains of the old QA suite

The manual QA suite (its layers, cases, oracles, fixtures, inventory and the `pnpm qa` runner) came
from the private repository and was removed on 28/10/2026. Only three library files stay, because
`scripts/test-trust.mjs` (gate tests: `scripts/test/test-trust.test.mjs`) imports them:

| File | Why it stays |
|---|---|
| `layers/static/lib/common.mjs` | `parseTap`, `LOAD_FAILURE`, `readRegular` and `REPO` |
| `layers/unit/lib/sources.mjs` | `productSourcesOf`, the oracle that links a test file to the product files it reaches |
| `lib/bounded-reader.mjs` | the bounded file reader `common.mjs` reads through |

`test-trust` fingerprints these files by content (`inputs.tool`, the oracle's `fingerprint`), so a
receipt changes when they do. Keep their paths: `turbo.json` lists their folders as inputs of the
`scripts` tests, and the receipts name them.
