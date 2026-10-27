// seed-roundtrip.test.mjs — this template's data lives in the contract, and the proof is byte-level.
//
// WHY IT IS HERE AND NOT IN THE KIT. It needs THIS template's data: seed/site-model.json and the
// 262 KB seed.json that was built, reviewed and accepted before the contract existed. The kit
// cannot carry either.
//
// WHAT IT PROVES. Everything the compiler produces is in the accepted seed, byte for byte — so
// moving the data out of tools/build-seed.mjs (1,829 lines) into a neutral contract changed nothing
// a visitor or an editor can see. If this test goes red, either the contract/compiler started
// losing something or somebody hand-edited a compiled entry in seed.json, and the diff names it.
//
// ⚠ IT USED TO ASSERT FULL EQUALITY, AND THAT INVARIANT WAS RETIRED — not broken. `e59d979bc`
// added tools/translate-seed.mjs: it runs AFTER build-seed.mjs, clones every `en` entry into a
// target locale with the text written BY A MODEL, and writes back into seed/seed.json. From there
// seed.json is the compiler's output PLUS translation passes whose content exists in no input
// file, so `compile(model) === seed.json` cannot be re-established by regenerating anything.
// Measured 2026-09-16: the compiler emits taxonomies 8 and menus 12 (en, ru) while the accepted
// seed holds 16 and 24 (en, ru, vi, zh) — and 120 of 120 compiled entries are present in it
// unchanged. So the containment below is the whole of what the compiler still owns, and asserting
// it keeps the contract enforced instead of deleting the test because the shape moved.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { compile } from '../tools/compile-seed.mjs'

const here = path.dirname(new URL(import.meta.url).pathname)
const read = (rel) => readFileSync(path.join(here, '..', rel), 'utf8')

test('every entry the compiler produces is in the accepted seed, byte for byte', () => {
  const model = JSON.parse(read('seed/site-model.json'))
  const config = JSON.parse(read('seed/compile.config.json'))
  const { seed } = compile(model, config)
  const accepted = JSON.parse(read('seed/seed.json'))

  // TRANSLATE-SEED ONLY TOUCHES THREE KEYS. Every other top-level key is still the compiler's word
  // for word, so those keep the byte equality the whole test used to have -- measured 2026-09-16,
  // all nine match. Dropping them was the first version's mistake: erasing `collections`, changing
  // `settings.title` or adding a `redirect` to seed.json all passed a containment-only assertion.
  const TRANSLATED = new Set(['taxonomies', 'menus', 'content'])
  for (const key of Object.keys(seed).filter((k) => !TRANSLATED.has(k)))
    assert.equal(
      JSON.stringify(seed[key]),
      JSON.stringify(accepted[key]),
      `${key} is not translated, so the compiler still owns it byte for byte`
    )

  // For the three it does touch: every compiled entry must be in the accepted seed with the same
  // MULTIPLICITY, not merely present. A set loses that -- a compiler that emitted one record twice
  // instead of two distinct ones still matched, and the count below still read 120.
  // The KEY ORDER of an entry is not its content: translate-seed writes `translationOf` after `data`, the compiler
  // before it, so an entry is compared with its keys sorted (every value still byte for byte).
  const canonical = (v) =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, canonical(v[k])])
          )
        : v
  const key = (entry) => JSON.stringify(canonical(entry))
  const missing = []
  const contain = (produced, present, where) => {
    const have = new Map()
    for (const entry of present ?? []) have.set(key(entry), (have.get(key(entry)) ?? 0) + 1)
    for (const entry of produced ?? []) {
      const k = key(entry)
      const left = have.get(k) ?? 0
      if (left < 1)
        missing.push(
          `${where}: ${String(entry.id ?? entry.slug ?? '(no id)')} / ${String(entry.locale ?? '?')}`
        )
      else have.set(k, left - 1)
    }
  }
  contain(seed.taxonomies, accepted.taxonomies, 'taxonomies')
  contain(seed.menus, accepted.menus, 'menus')
  for (const collection of Object.keys(seed.content))
    contain(seed.content[collection], accepted.content?.[collection], `content.${collection}`)

  assert.deepEqual(
    missing,
    [],
    'the accepted seed no longer carries what the compiler produces — the contract, the compiler, ' +
      'or seed.json itself changed under one of the others'
  )
  // The count is the other half: containment alone would pass if the compiler emitted nothing.
  const produced =
    seed.taxonomies.length + seed.menus.length + Object.values(seed.content).reduce((n, c) => n + c.length, 0)
  assert.ok(produced >= 120, `the compiler produced ${String(produced)} entries, expected at least 120`)

  // The part the compiler does NOT own still needs an owner. `translate-seed.mjs` writes the added
  // locales with a model, so no assertion here can reproduce their text — but `template.config.json`
  // names the languages a Business site can be built in, and the seed must carry every one of them.
  // Without this, deleting every `vi` and `zh` row from seed.json passed everything above.
  const declared = JSON.parse(read('template.config.json')).locales
  const carried = new Set([
    ...accepted.taxonomies.map((t) => t.locale),
    ...accepted.menus.map((m) => m.locale),
    ...Object.values(accepted.content).flatMap((c) => c.map((e) => e.locale))
  ])
  assert.deepEqual(
    declared.filter((l) => !carried.has(l)),
    [],
    `template.config.json offers ${declared.join(', ')}; the seed must carry a row for each`
  )
})
test('the model carries the whole template: 14 types, 50 records in every locale the template offers', () => {
  // TCH #1013 (LANG-5): the model declares every locale the seed, template.config.json and the release carry, so
  // Tracy reads one list of languages wherever it looks. Regenerated from the seed with tools/from-emdash-seed.mjs.
  const model = JSON.parse(read('seed/site-model.json'))
  const offered = JSON.parse(read('template.config.json')).locales
  assert.equal(model.types.length, 14)
  assert.deepEqual([...model.locales.all].sort(), [...offered].sort())
  assert.equal(model.records.length, 50 * offered.length)
  for (const locale of offered)
    assert.equal(model.records.filter((r) => r.locale === locale).length, 50, `${locale} has every record`)
})
