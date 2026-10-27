// The three QA documents keep their contract: right JSON pointers, required columns, honest limits.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { readTextSync } from '../../lib/bounded-reader.mjs'

const QA = join(dirname(fileURLToPath(import.meta.url)), '../..')
const doc = (name) => readTextSync(join(QA, 'docs', name))

describe('docs', () => {
  const strategy = doc('test-strategy.md')
  const applic = doc('applicability-matrix.md')
  const trace = doc('traceability-matrix.md')

  test('point at JSON files that exist', () => {
    for (const text of [strategy, applic, trace]) {
      const refs = [
        ...text.matchAll(/`((?:tests\/qa\/)?(?:inventory|layers)\/[A-Za-z0-9_./<>*-]+\.(?:json|mjs))`/g)
      ].map((m) => m[1])
      for (const ref of refs) {
        if (/[<*]/.test(ref)) continue
        const rel = ref.startsWith('tests/qa/') ? ref.slice('tests/qa/'.length) : ref
        assert.ok(existsSync(join(QA, rel)), `${ref} is named in a doc but does not exist`)
      }
    }
    for (const needle of ['inventory.json', 'edge-tags.json', 'legacy-map.json', 'affected-map.json'])
      assert.match(strategy, new RegExp(needle))
  })
  test('applicability keeps the four states and never counts N-A, WAIVED or PENDING as PASS', () => {
    for (const state of ['REQUIRED', 'N-A', 'WAIVED', 'PENDING'])
      assert.match(applic, new RegExp(`\\b${state}\\b`))
    assert.match(applic, /Not counted as PASS|No — never raises the PASS rate/)
    assert.match(applic, /reason \+ source|reason \*\*and\*\* source|reason \*\*\+ source/i)
  })
  test('traceability keeps the full chain and the null-not-invented rule', () => {
    assert.match(trace, /risk → requirement → control → case → evidence → finding → fix\/recheck/)
    for (const col of ['risk', 'requirement', 'control', 'case', 'evidence', 'finding', 'fix/recheck'])
      assert.match(trace, new RegExp(`\\*\\*${col.replace('/', '\\/')}\\*\\*`))
    assert.match(trace, /null/)
    assert.match(trace, /158/)
  })
  test('state the measured differences and the limits as open, not as done', () => {
    assert.match(strategy, /158/)
    assert.match(strategy, /155/)
    assert.match(strategy, /runtime graph/i)
    assert.match(strategy, /Storybook/)
    assert.match(strategy, /audit-kit/)
    assert.match(strategy, /PENDING/)
    assert.doesNotMatch(strategy + applic + trace, /100 ?%/)
  })
})
