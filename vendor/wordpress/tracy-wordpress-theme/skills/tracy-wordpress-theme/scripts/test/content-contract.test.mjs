// Ported from joomlart-t4-template@1.0.0-tracy.5 scripts/test/content-contract.test.mjs — WordPress changes: none.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validateContract, contractHash, compileContentPlan, auditContent } from '../content-contract.mjs'
const read = (file) => JSON.parse(readFileSync(new URL(`../../examples/${file}`, import.meta.url)))
const fixture = () => ({ contract: read('content-contract.json'), plan: read('content-plan.json') })
const rehash = (c, p) => {
  p.contractHash = contractHash(c)
}
test('one fact resolves identically in a page and marketing artifact; real observation matches', () => {
  const { contract, plan } = fixture()
  const compiled = compileContentPlan(contract, plan)
  assert.equal(compiled.surfaces[0].fields.price, '$24')
  assert.match(compiled.surfaces[1].fields.message, /\$24/)
  assert.equal(auditContent(contract, plan, structuredClone(compiled)).checkedFields, 6)
})
test('changing the shared price invalidates old plans and old rendered observations', () => {
  const { contract, plan } = fixture()
  const old = compileContentPlan(contract, plan)
  contract.facts['pricing.studio.amount'].value = '$30'
  contract.revision++
  assert.throws(() => compileContentPlan(contract, plan), /stale/)
  rehash(contract, plan)
  const fresh = compileContentPlan(contract, plan)
  assert.equal(fresh.surfaces[0].fields.price, '$30')
  assert.match(fresh.surfaces[1].fields.message, /\$30/)
  assert.throws(() => auditContent(contract, plan, old), /stale/)
  old.contractHash = fresh.contractHash
  assert.throws(() => auditContent(contract, plan, old), /Content differs/)
})
for (const [name, mutate, pattern] of [
  ['missing source', (c) => (c.facts['pricing.studio.amount'].source = 'missing'), /unknown source/],
  ['fake verified claim', (c) => (c.facts['pricing.studio.amount'].status = 'verified'), /cannot verify/],
  ['customer carrying sample facts', (c) => (c.mode = 'customer'), /Customer fact/],
  ['unresolved inputs', (c) => c.pending.push('Confirm price'), /pending/],
  ['duplicate surface', (c) => c.surfaces.push(c.surfaces[0]), /duplicate/],
  ['unknown required fact', (c) => c.surfaces[0].requiredFacts.push('missing'), /Unknown required/],
  ['missing disclosure', (c) => delete c.identity.disclosure, /disclosure/],
  ['unsupported schema', (c) => (c.schemaVersion = 2), /schemaVersion/]
])
  test(name, () => {
    const { contract } = fixture()
    mutate(contract)
    assert.throws(() => validateContract(contract), pattern)
  })
for (const [name, mutate, pattern] of [
  ['per-page price override', (p) => (p.surfaces[0].fields.price.value = '$99'), /unknown field/],
  ['unknown reference', (p) => (p.surfaces[0].fields.price.ref = 'wrong'), /Unknown fact/],
  ['inherited reference', (p) => (p.surfaces[0].fields.price.ref = 'toString'), /Unknown fact/],
  [
    'literal price bypasses required reference',
    (p) => (p.surfaces[0].fields.price = { template: '$99' }),
    /omits required/
  ],
  ['partial surface coverage', (p) => p.surfaces.pop(), /exactly/],
  ['duplicate plan surface', (p) => (p.surfaces[1] = p.surfaces[0]), /duplicate/],
  ['unresolved interpolation', (p) => (p.surfaces[0].fields.extra = { template: '{{ bad }}' }), /unresolved/],
  ['empty output', (p) => (p.surfaces[0].fields = {}), /no content/],
  ['hidden demo status', (p) => delete p.surfaces[0].fields.disclosure, /disclosure/]
])
  test(name, () => {
    const { contract, plan } = fixture()
    mutate(plan)
    assert.throws(() => compileContentPlan(contract, plan), pattern)
  })
test('observations must cover all mapped fields and surfaces', () => {
  const { contract, plan } = fixture()
  const rendered = compileContentPlan(contract, plan)
  delete rendered.surfaces[1].fields.message
  assert.throws(() => auditContent(contract, plan, rendered), /coverage/)
})
test('customer contract can use inspected customer sources; object order does not change hash', () => {
  const { contract } = fixture()
  contract.mode = 'customer'
  contract.sources.demo.kind = 'customer'
  for (const fact of Object.values(contract.facts)) fact.status = 'verified'
  validateContract(contract)
  assert.equal(contractHash(contract), contractHash(Object.fromEntries(Object.entries(contract).reverse())))
})

// An identity field the source declares empty: an `absent-in-source` fact, value "", from site evidence.
const absentSummary = () => {
  const { contract, plan } = fixture()
  contract.sources.site = { kind: 'site', reference: 'etc/site/default.json', note: 'site_slogan declared ""' }
  contract.facts['company.summary'] = { value: '', status: 'absent-in-source', source: 'site' }
  plan.surfaces[1].fields.summary = { ref: 'company.summary' }
  rehash(contract, plan)
  return { contract, plan }
}
test('an identity summary the source declares empty validates, compiles to "" and audits against an empty rendering only', () => {
  const { contract, plan } = absentSummary()
  validateContract(contract)
  const compiled = compileContentPlan(contract, plan)
  assert.equal(compiled.surfaces[1].fields.summary, '')
  assert.equal(auditContent(contract, plan, structuredClone(compiled)).checkedFields, 7)
  const invented = structuredClone(compiled)
  invented.surfaces[1].fields.summary = 'A studio for bold brands'
  assert.throws(() => auditContent(contract, plan, invented), /Content differs at email\.html:summary/)
  // customer mode takes the same site evidence of absence
  contract.mode = 'customer'
  contract.sources.demo.kind = 'customer'
  for (const f of Object.values(contract.facts)) if (f.status === 'demo') f.status = 'verified'
  validateContract(contract)
})
for (const [name, mutate, pattern] of [
  ['absent fact carrying text', (c) => (c.facts['company.summary'].value = 'Invented tagline'), /absent-in-source and must carry the empty string/],
  ['absent fact with a non-string value', (c) => (c.facts['company.summary'].value = null), /must carry the empty string/],
  ['absent fact from a demo source', (c) => (c.facts['company.summary'].source = 'demo'), /needs site or customer evidence/],
  ['absent fact from an unknown source', (c) => (c.facts['company.summary'].source = 'nowhere'), /unknown source/],
  ['absent fact outside the identity name and summary', (c) => (c.facts['pricing.studio.amount'] = { value: '', status: 'absent-in-source', source: 'site' }), /only the identity name or summary/],
  ['absent demo disclosure', (c) => ((c.identity.disclosure = 'company.summary')), /disclosure must carry the demo disclosure text/],
  ['empty value without the absent status', (c) => (c.facts['company.summary'].status = 'verified'), /nonempty string value/],
  ['an unknown status', (c) => (c.facts['company.summary'].status = 'missing'), /verified, explicitly demo or absent-in-source/]
])
  test(`absent-in-source: ${name} is refused`, () => {
    const { contract } = absentSummary()
    mutate(contract)
    assert.throws(() => validateContract(contract), pattern)
  })
