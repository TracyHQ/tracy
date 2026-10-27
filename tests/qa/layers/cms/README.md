# CMS layer

Release contracts of the quickstarts and templates (`packages/cms/*/contracts`, EmDash `qa.contract.json`), the release code and the suites that wrap them.

```bash
pnpm qa cms [--area X] [--prove-red] [--out DIR]
node tests/qa/layers/cms/generate.mjs [--check]
```

## Denominator

`denominator.json` follows the schema every layer shares (`tracy-qa-denominator/v1`): structure in
[`../../contracts/denominator.schema.json`](../../contracts/denominator.schema.json), rules and this
layer's kinds, `meta` and `details` keys in [`../../lib/denominator.mjs`](../../lib/denominator.mjs)
(`LAYER_CONTRACT.cms`), field by field in [`../README.md`](../README.md). Regenerate with
`node tests/qa/layers/cms/generate.mjs`; the generator refuses to write a file the contract rejects.
`details` holds `extraction` and `sourceHashes`; a release's platform, shape, CMS version, template and version are under `meta`. A design pack has `fresh-install` and `restore` N-A (ADR 0017 §9).
