import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { contractSamples, lengthAdvice, lengthAdviceNext } from '../src/host/length-advice.mjs'
import { MEMOISED_CODES } from '../src/host/call-memory.mjs'
import { refusalNext } from '../src/host/site.mjs'

const samples = new Map([
  ['module-435.0', 'Built for the way your team works'], // 33 characters
  ['module-428.1', 'Hotline: {contact.phone}'], // 9 visible: too short to judge
  ['module-500.0', 'Home']
])

// Lee, 26/09/2026: 0.75×–1.25× of the quickstart's own text, a warning, never a refusal.
test('text outside 0.75×–1.25× of the quickstart sample is named; inside, short samples and tokens are not', () => {
  assert.deepEqual(lengthAdvice({ 'module-435.0': 'Built for the way your whole team works' }, samples), [])
  const long = lengthAdvice(
    { 'module-435.0': 'Built for the way your team works, every single day of the year' },
    samples
  )
  assert.equal(long.length, 1)
  assert.equal(long[0].slot, 'module-435.0')
  assert.ok(long[0].ratio > 1.25)
  assert.equal(lengthAdvice({ 'module-435.0': 'Built for teams' }, samples)[0].ratio < 0.75, true)
  assert.deepEqual(
    lengthAdvice({ 'module-428.1': 'Call us any time, day or night: {contact.phone}' }, samples),
    []
  )
  assert.deepEqual(lengthAdvice({ 'module-500.0': 'Start here and look around' }, samples), [])
  assert.deepEqual(lengthAdvice({ 'module-999.0': 'no sample for this slot at all' }, samples), [])
  assert.match(lengthAdviceNext(long) ?? '', /0\.75×–1\.25×.*module-435\.0/)
  assert.equal(lengthAdviceNext([]), null)
})

test('the advice is never a refusal: not memoised, no refusal next', () => {
  assert.ok(!MEMOISED_CODES.includes('LENGTH_RATIO'))
  assert.equal(refusalNext({ ok: true, warnings: [{ code: 'LENGTH_RATIO' }] }), null)
})

test('samples come from the contract profile the image carries; an unknown profile gives none', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'contracts-'))
  const dir = path.join(root, 'tracy-business', 'j6', '1.2.0')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, 'content-map.json'),
    JSON.stringify({
      slots: [
        { key: 'module-435.0', type: 'text', sample: 'Built for the way your team works' },
        { key: 'module-428.0', type: 'url', sample: 'tel:{contact.tel}' }
      ]
    })
  )
  const got = contractSamples('tracy-business/j6/1.2.0', root)
  assert.equal(got.get('module-435.0'), 'Built for the way your team works')
  assert.equal(got.has('module-428.0'), false)
  assert.equal(contractSamples('tracy-business/j6/9.9.9', root).size, 0)
  assert.equal(contractSamples('../etc', root).size, 0)
})

test('an accepted contract apply carries LENGTH_RATIO warnings as data, and is still ok', async () => {
  const { createCallMemory } = await import('../src/host/call-memory.mjs')
  const { runSiteCall } = await import('../src/host/site-call.mjs')
  const { planCall } = await import('../src/host/site.mjs')
  const root = mkdtempSync(path.join(tmpdir(), 'contracts-'))
  const dir = path.join(root, 'tracy-business', 'j6', '1.2.0')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, 'content-map.json'),
    JSON.stringify({
      slots: [{ key: 'module-441.1', type: 'text', sample: 'Built for the way your team works' }]
    })
  )
  process.env.TRACY_CONTRACTS_DIR = root
  try {
    const plan = planCall({
      action: 'content.contract',
      params: {
        operation: 'apply',
        expected_revision: 'r1',
        changes: { 'module-441.1': 'Built for the way your team works, every single day of the year' }
      }
    })
    assert.ok(plan.ok)
    const answer = /** @type {any} */ (
      await runSiteCall({
        plan,
        memory: createCallMemory({ now: () => 1_000 }),
        sessionId: 'session-a',
        label: 'j-1ibzqi',
        actorKey: 'ana@example.com',
        facts: { platform: 'joomla', sealed: true, contract: 'tracy-business/j6/1.2.0' },
        sleep: async () => {},
        send: async () => ({ ok: true, receipt: 'x' })
      })
    )
    assert.equal(answer.ok, true)
    assert.equal(answer.warnings[0].code, 'LENGTH_RATIO')
    assert.equal(answer.warnings[0].slot, 'module-441.1')
    assert.match(answer.next, /length band/)
  } finally {
    delete process.env.TRACY_CONTRACTS_DIR
  }
})
