// The machine assertions against the real tree: every one must be green, none vacuous.
import assert from 'node:assert/strict'
import test from 'node:test'
import { REPO_ROOT } from '../common.mjs'
import { REGISTRY, runAssertion } from '../machine.mjs'
import { LANGS, oracle } from '../machine-support.mjs'

const results = new Map()
for (const id of REGISTRY.keys()) results.set(id, null)

test('every assertion is green on the real tree, with at least one variant', async () => {
  for (const id of REGISTRY.keys()) {
    const r = await runAssertion(id, REPO_ROOT)
    results.set(id, r)
    assert.equal(
      r.status,
      'green',
      `${id}: ${r.failing
        .slice(0, 2)
        .map((f) => `${f.variant} ${f.message}`)
        .join(' | ')}`
    )
    assert.ok(r.variants.length > 0, `${id} ran no variant`)
  }
})

test('letter assertions run 22 kinds x 8 languages and the hostile-input case reaches almost all of them', () => {
  for (const id of [
    'mail.letter.shape',
    'mail.letter.links',
    'mail.letter.escape',
    'mail.notify.recipient',
    'mail.notify.dedupe'
  ])
    assert.equal(results.get(id).variants.length, Object.keys(oracle.kinds.table).length * LANGS.length, id)
  const reached = results.get('mail.letter.escape').variants.filter((v) => !v.note).length
  assert.ok(
    reached >= 100,
    `hostile text reached only ${reached} of 176 letters; the assertion would be vacuous`
  )
})

test('an unknown assertion is an error, not a pass', async () => {
  const r = await runAssertion('mail.nope', REPO_ROOT)
  assert.equal(r.status, 'error')
})

test('a violated expectation is reported as an assertion failure and names its variant', async () => {
  const { check } = await import('../machine-support.mjs')
  const bad = await check('v1', () => assert.equal(1, 2))
  assert.deepEqual([bad.ok, bad.kind, bad.variant], [false, 'assertion', 'v1'])
  const broken = await check('v2', () => {
    throw new TypeError('not an assertion')
  })
  assert.equal(broken.kind, 'error')
})

test('sign-in: a code is refused after its lifetime and accepted just before, on the controlled clock', () => {
  const r = results.get('mail.signin.expiry')
  assert.deepEqual(
    r.variants.map((v) => v.variant),
    ['accepted-before-expiry', 'refused-after-expiry']
  )
  assert.ok(r.variants.every((v) => v.ok))
})
