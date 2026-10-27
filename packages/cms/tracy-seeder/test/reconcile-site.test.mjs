import { strict as assert } from 'node:assert'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { main } from '../src/cli.mjs'
import { reconcileWithSite } from '../src/reconcile-site.mjs'

/** One contract inventory, with `current` under the test's control. */
const slot = (key, sample, current, extra = {}) => ({
  key,
  sample,
  maxCharacters: 120,
  requiresEvidence: false,
  ...(current === undefined ? {} : { current }),
  ...extra
})

test('a slot a person filled on the site is neither asked again nor overwritten', () => {
  const r = reconcileWithSite({
    plan: { pending: ['a.0'], changes: { 'a.0': 'what the plan wanted' }, evidence: {} },
    slots: [slot('a.0', 'Demo headline', 'What the agent actually wrote')],
    applied: {}
  })
  assert.deepEqual(r.plan.pending, [], 'the site already answers it')
  assert.deepEqual(r.filledBySite, ['a.0'])
  assert.equal(r.plan.changes['a.0'], undefined, "the site's words survive")
  assert.deepEqual(r.refusedOverwrite, ['a.0'])
})

test('a slot THIS build wrote may still be updated by a new plan', () => {
  // The distinction the whole file exists for: `current !== sample` on its own cannot tell a
  // person's edit from our own earlier write, and the two need opposite treatment.
  const r = reconcileWithSite({
    plan: { pending: [], changes: { 'price.0': '149 CAD' }, evidence: {} },
    slots: [slot('price.0', '$12', '129 CAD')],
    applied: { 'price.0': '129 CAD' }
  })
  assert.equal(r.plan.changes['price.0'], '149 CAD', 'a corrected price must land')
  assert.deepEqual(r.refusedOverwrite, [])
})

test('a change the site already carries is dropped rather than written twice', () => {
  const r = reconcileWithSite({
    plan: { pending: [], changes: { 'a.0': 'Same words' }, evidence: {} },
    slots: [slot('a.0', 'Demo', 'Same words')],
    applied: { 'a.0': 'Same words' }
  })
  assert.deepEqual(r.plan.changes, {}, 'no pointless write, no pointless revision')
})

test('a contract that reports no current value is left exactly as planned', () => {
  const r = reconcileWithSite({
    plan: { pending: ['a.0'], changes: { 'b.0': 'x' }, evidence: {} },
    slots: [slot('a.0', 'Demo'), slot('b.0', 'Demo')],
    applied: {}
  })
  assert.deepEqual(r.plan.pending, ['a.0'])
  assert.equal(r.plan.changes['b.0'], 'x')
  assert.deepEqual(r.filledBySite, [])
})

/** The cache-hit path end to end: same brief, site moved underneath. */
function bench(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'reconcile-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  mkdirSync(join(cwd, 'docs', 'agents'), { recursive: true })
  const preview = join(cwd, 'docs', 'agents', 'design-preview.json')
  writeFileSync(preview, JSON.stringify({ site: { name: 'Harbour Air', about: 'Seaplanes since 1982.' } }))
  return { cwd, preview, seedDir: join(cwd, 'docs', 'agents', 'seed') }
}

const inventory = (current) => ({
  ok: true,
  contract: 'tracy-airbnb/j6/1.0.0',
  revision: 'r1',
  slots: [slot('hero.0', 'Demo headline', current), slot('hero.1', 'Demo lead', 'Demo lead')]
})

test('cache hit: a slot answered on the site stops being required, with the brief untouched', async (t) => {
  // ⚠ THE REGRESSION THIS FILE IS FOR. The reconciliation layers used to sit behind
  // `mapping === null`, so an unchanged brief took the cache wholesale and an agent's work on the
  // site counted for nothing — measured on a live site as 540 pending before and 540 after.
  const { cwd, preview, seedDir } = bench(t)
  mkdirSync(seedDir, { recursive: true })
  let siteHas = 'Demo headline'
  const apply = async (c) =>
    c.params?.operation === 'inspect' ? inventory(siteHas) : { ok: true, applyId: 'x' }
  const args = ['--platform', 'joomla', '--preview', preview, '--target-site', 's.example', '--pages', 'all']

  // First pass: the model pends the headline, so the build waits.
  await assert.rejects(
    () =>
      main(args, {
        cwd,
        env: {},
        apply,
        // The lead is answerable from the brief; the headline is not, so only it waits.
        generate: async () => ({ values: { 'hero.1': 'Seaplanes since 1982.' }, pending: ['hero.0'] })
      }),
    /CONTENT_REQUIRED: hero\.0/
  )
  const cached = JSON.parse(readFileSync(join(seedDir, 'contract-mapping.json'), 'utf8'))
  assert.deepEqual(cached.pending, ['hero.0'])

  // The agent answers it through the contract door. The brief does NOT change.
  siteHas = 'Fly the coast since 1982'
  let asked = 0
  const out = await main(args, {
    cwd,
    env: {},
    apply,
    generate: async () => {
      asked += 1
      return { values: {}, pending: [] }
    }
  })
  assert.equal(asked, 0, 'a cache hit must not call the model again')
  assert.deepEqual(out.plan.pending, [], 'the site answered it, so it is no longer required')
  assert.equal(out.plan.changes['hero.0'], undefined, "and the plan does not write over the agent's words")
})

test('cache hit: the site wins over a cached value, and says so', async (t) => {
  const { cwd, preview, seedDir } = bench(t)
  mkdirSync(seedDir, { recursive: true })
  let siteHas = 'Demo headline'
  const apply = async (c) =>
    c.params?.operation === 'inspect' ? inventory(siteHas) : { ok: true, applyId: 'x' }
  const args = ['--platform', 'joomla', '--preview', preview, '--target-site', 's.example', '--pages', 'all']

  // A first pass that plans a value but cannot finish, so the value stays in the cache unapplied.
  await assert.rejects(
    () =>
      main(args, {
        cwd,
        env: {},
        apply,
        generate: async () => ({ values: { 'hero.0': 'Planned words' }, pending: ['hero.1'] })
      }),
    /CONTENT_REQUIRED/
  )
  assert.equal(
    JSON.parse(readFileSync(join(seedDir, 'contract-mapping.json'), 'utf8')).changes['hero.0'],
    'Planned words'
  )

  // Someone edits that same slot on the site. Same brief, so this is the cache-hit path.
  siteHas = 'A person wrote this'
  const lines = []
  await assert.rejects(
    () =>
      main(args, {
        cwd,
        env: {},
        apply,
        log: (line) => lines.push(line),
        generate: async () => ({ values: {}, pending: [] })
      }),
    /CONTENT_REQUIRED: hero\.1/,
    'the other slot is still genuinely missing'
  )
  assert.ok(
    lines.some((l) => /edited on the site since this plan/.test(l)),
    `the refusal to overwrite must be said out loud, got: ${JSON.stringify(lines)}`
  )
})
