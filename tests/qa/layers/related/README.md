# Related layer

The suites of the sibling repositories the brief names, and the producer-to-consumer chains between them and this repository.

```bash
pnpm qa related [--area X] [--prove-red] [--out DIR]
node tests/qa/layers/related/generate.mjs [--check]
```

## Denominator

`denominator.json` follows the schema every layer shares (`tracy-qa-denominator/v1`): structure in
[`../../contracts/denominator.schema.json`](../../contracts/denominator.schema.json), rules and this
layer's kinds, `meta` and `details` keys in [`../../lib/denominator.mjs`](../../lib/denominator.mjs)
(`LAYER_CONTRACT.related`), field by field in [`../README.md`](../README.md). Regenerate with
`node tests/qa/layers/related/generate.mjs`; the generator refuses to write a file the contract rejects.
`details.extraction` says the list is static. No tag is N-A here: another repository owning a suite proves nothing about a tag.
