// seed/site-model.json of this template is DERIVED, and this test is what keeps it honest.
//
// WHY THE FILE EXISTS. Tracy's Content API reader (`tools/content-api`) learns the kind of every
// field from `seed/site-model.json` (`types`), at build time. Business writes its model by hand and
// compiles its seed from it (ADR 0016); this template predates the contract, and its seed is still
// built by tools/build-seed.mjs. So the model here is the kit's bootstrap read of that seed
// (`tools/from-emdash-seed.mjs`, `reverse`) and nothing else.
//
// WHAT IT PROVES. The committed model is exactly what the bootstrap reads from the seed TODAY. A
// changed build-seed.mjs that adds a field, a collection or an entry turns this red instead of
// leaving the reader blind to the new field (it would answer FIELD_UNSUPPORTED for it, silently).
// Fix: `node tools/from-emdash-seed.mjs seed/seed.json <tmp>` and copy its site-model.json here.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { validateModel } from '../contract/validate.mjs'
import { reverse } from '../tools/from-emdash-seed.mjs'

const read = (rel) => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'))

test('the site model is what the kit bootstrap reads from the seed today', () => {
  // `source.capturedAt` is the moment the bootstrap ran: the one field a rerun must change.
  const stable = (m) => JSON.stringify({ ...m, source: { ...m.source, capturedAt: null } }, null, 2)
  assert.equal(
    stable(read('seed/site-model.json')),
    stable(reverse(read('seed/seed.json')).model),
    'seed/site-model.json is stale: regenerate it from seed/seed.json (tools/from-emdash-seed.mjs)'
  )
})

test('the site model is a valid source contract', () => {
  assert.deepEqual(validateModel(read('seed/site-model.json')), [])
})

test('every collection the seed defines has a Content API mapping', () => {
  const mapping = read('seed/content-api-map.json')
  const missing = read('seed/seed.json')
    .collections.map((c) => c.slug)
    .filter((s) => !mapping.collections[s])
  assert.deepEqual(missing, [])
})
