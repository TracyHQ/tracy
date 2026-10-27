import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { main } from '../src/cli.mjs'

const slot = { key: 'hero.title', sample: 'Demo', current: 'Demo', maxCharacters: 80, entity: 'module-1' }
const args = [
  '--platform',
  'joomla',
  '--preview',
  'preview.json',
  '--target-site',
  'kinetic.example',
  '--trim-demo'
]
const generate = async () => ({ values: { 'hero.title': 'Fresh bread' }, pending: [] })

/** A Claude Cowork plugin double: `trim` answers each demoTrim.apply call in turn; the revision moves once rows are hidden. */
function site(trim, plan = null) {
  const calls = []
  let revision = 'before-trim'
  const apply = async (c) => {
    calls.push(c)
    const op = c.params.operation
    if (op === 'inspect')
      return { ok: true, contract: 'kinetic/v1', revision, slots: [{ ...slot }], pages: [] }
    if (op === 'demoTrim.plan')
      return plan ?? { ok: false, error: 'bad_params', message: 'Unknown demoTrim operation' }
    if (op === 'demoTrim.apply') {
      const answer = trim.shift()
      if (answer?.ok && answer.moved) revision = 'after-trim'
      return answer
    }
    return { ok: true, revision: 'after-copy' }
  }
  return { calls, apply }
}

function workdir(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'demo-trim-cli-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  writeFileSync(join(cwd, 'preview.json'), JSON.stringify({ site: { name: 'Bakery' } }))
  return cwd
}
const record = (cwd) => JSON.parse(readFileSync(join(cwd, 'seed', 'demo-trim.json'), 'utf8'))

test('--trim-demo hides the demo before the copy is planned, and plans against the site it left', async (t) => {
  const cwd = workdir(t)
  const { calls, apply } = site([
    { ok: true, status: 'running', moved: 200, remaining: 47 },
    { ok: true, status: 'completed', moved: 47, remaining: 0 }
  ])
  const result = await main(args, { cwd, env: {}, apply, generate })
  const ops = calls.map((c) => c.params.operation)
  assert.deepEqual(ops.slice(0, 4), ['inspect', 'demoTrim.apply', 'demoTrim.apply', 'inspect'])
  const trims = calls.filter((c) => c.params.operation === 'demoTrim.apply')
  assert.match(trims[0].params.apply_id, /^dtrim-/)
  assert.equal(
    trims[1].params.request_id,
    trims[0].params.request_id,
    'a continuing call is the same request'
  )
  assert.equal(
    calls.at(-1).params.expected_revision,
    'after-trim',
    'the copy is written against the trimmed site'
  )
  assert.deepEqual(record(cwd), { status: 'hidden', hidden: 247 })
  assert.equal(result.demoTrim.status, 'hidden')
})

test('a quickstart with no demo-trim profile seeds as before and says so', async (t) => {
  const cwd = workdir(t)
  const { calls, apply } = site([
    { ok: false, error: 'unsupported', message: 'This quickstart contract carries no demo-trim profile' }
  ])
  await main(args, { cwd, env: {}, apply, generate })
  assert.deepEqual(calls.map((c) => c.params.operation).slice(0, 2), ['inspect', 'demoTrim.apply'])
  assert.equal(calls.at(-1).params.operation, 'apply', 'the copy is still written')
  assert.deepEqual(record(cwd), { status: 'none' })
})

test('a Claude Cowork plugin older than the demo-trim operations is skipped out loud, not failed', async (t) => {
  // Sites built before 0.16.8 keep their Claude Cowork plugin: the door answers `Unknown contract operation`.
  // The seed still has the customer's words to write, so it does — and the card says the demo stays.
  const cwd = workdir(t)
  const { calls, apply } = site([
    { ok: false, error: 'contract_failed', message: 'Unknown contract operation' }
  ])
  const result = await main(args, { cwd, env: {}, apply, generate })
  assert.equal(result.applied.ok, true)
  assert.equal(calls.at(-1).params.operation, 'apply')
  assert.equal(record(cwd).status, 'skipped')
  assert.match(record(cwd).reason, /0\.16\.8/)
})

test('a real refusal stops the seed with the Claude Cowork plugin’s own words', async (t) => {
  const cwd = workdir(t)
  const { calls, apply } = site([
    { ok: false, error: 'contract_failed', message: 'Presentation drift: article-77 — state' }
  ])
  await assert.rejects(() => main(args, { cwd, env: {}, apply, generate }), /Presentation drift: article-77/)
  assert.equal(
    calls.some((c) => c.params.operation === 'apply'),
    false,
    'no copy is written over a site that failed its read'
  )
})

test('a lost answer is asked again under the same request, never started twice', async (t) => {
  const cwd = workdir(t)
  const { calls, apply } = site([
    { ok: false, code: 'COMPONENT_BAD_RESPONSE', status: 500 },
    { ok: true, status: 'completed', moved: 247, remaining: 0 }
  ])
  await main(args, { cwd, env: {}, apply, generate })
  const trims = calls.filter((c) => c.params.operation === 'demoTrim.apply')
  assert.equal(trims.length, 2)
  assert.equal(trims[1].params.request_id, trims[0].params.request_id)
  assert.deepEqual(record(cwd), { status: 'hidden', hidden: 247 })
})

test('without --trim-demo nothing is hidden', async (t) => {
  const cwd = workdir(t)
  const { calls, apply } = site([])
  await main(
    args.filter((a) => a !== '--trim-demo'),
    { cwd, env: {}, apply, generate }
  )
  assert.equal(
    calls.some((c) => c.params.operation === 'demoTrim.apply'),
    false
  )
})

// Measured 25/09/2026 on the Tracy Business stand build `j-56xke6`: the demo was hidden on the first
// seed, es-ES and zh-CN were added, and every later seed (a revised brief, a rerun) died on the
// Claude Cowork plugin's refusal to trim a site with a second language — although nothing was left to trim.
const SECOND_LANGUAGE = {
  ok: false,
  error: 'contract_failed',
  message:
    'This site already has a second language; hiding its demo rows would leave the translated copies showing. Nothing has been written.'
}
test('a site trimmed before its second language seeds again: the finished trim is read, not redone', async (t) => {
  const cwd = workdir(t)
  const { calls, apply } = site([SECOND_LANGUAGE], { ok: true, status: 'complete', remaining: 0 })
  await main(args, { cwd, env: {}, apply, generate })
  assert.equal(record(cwd).status, 'hidden')
  assert.equal(
    calls.some((c) => c.params.operation === 'apply'),
    true,
    'the copy is written'
  )
})

test('a multilingual site whose demo was never trimmed still stops, with the Claude Cowork plugin’s words', async (t) => {
  const cwd = workdir(t)
  const { apply } = site([SECOND_LANGUAGE], { ok: true, status: 'none', remaining: 76 })
  await assert.rejects(() => main(args, { cwd, env: {}, apply, generate }), /already has a second language/)
})
