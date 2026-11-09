// F18 (faults.md): a contract folder without demo-baseline.json is red for acceptance, even when the readiness piece
// only warns (a release already shown on Design inspiration) and even when demo-baseline-policy.json does not opt the
// template in. Found on 2026-11-09: JA Voyara 1.0.12 was accepted on /ops with no baseline beside its contract.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const F18_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url))
const f18 = async () => {
  const web = (p) => import(join(F18_ROOT, 'apps/tracy-web', p))
  const [
    { DEMO_BASELINE_CHECK },
    { BASELINE_FILE, BASELINE_SCHEMA },
    { exitCodeOf },
    pins,
    verdict,
    contracts
  ] = await Promise.all([
    web('src/lib/template-readiness/demo-baseline-check.js'),
    web('src/lib/template-kit/demo-baseline-file.js'),
    web('scripts/template-readiness.mjs'),
    web('src/lib/template-readiness/pinned-release.js'),
    web('src/lib/template-readiness/verdict.js'),
    web('src/lib/contracts.js')
  ])
  return { DEMO_BASELINE_CHECK, BASELINE_FILE, BASELINE_SCHEMA, exitCodeOf, pins, verdict, contracts }
}

const F18_TAG = 'quickstart/wren-example/j6'
const F18_ID = 'wren-example/j6/1.0.0'
const f18Release = () => ({
  tag: F18_TAG,
  kind: 'quickstart',
  platform: 'joomla',
  setting: { platform: 'joomla', version: '1.0.0', template: 'wren-example' },
  choosable: true,
  // Already shown on Design inspiration: the piece only warns here.
  inspiration: { template: 'wren-example' },
  inspirationHidden: false
})

test('F18: a published release without demo-baseline.json warns, and a warn is red for acceptance', async (t) => {
  const { DEMO_BASELINE_CHECK, BASELINE_FILE, BASELINE_SCHEMA, exitCodeOf } = await f18()
  const dir = mkdtempSync(join(tmpdir(), 'red-codes-f18-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const world = { contracts: new Map([[`${F18_TAG}@1.0.0`, { id: F18_ID, dir, platform: 'joomla' }]]) }
  const missing = DEMO_BASELINE_CHECK.judge(f18Release(), world)
  assert.deepEqual([missing.state, missing.code], ['warn', 'demo-baseline-missing'])
  assert.equal(exitCodeOf([{ piece: 'demo-baseline', ...missing }]), 1, 'a warn is not accepted')
  const doc = {
    schema: BASELINE_SCHEMA,
    quickstart: F18_ID,
    source: 'host',
    texts: ['Wren tours'],
    labels: []
  }
  writeFileSync(join(dir, BASELINE_FILE), JSON.stringify({ ...doc, pictures: { files: [], shas: [] } }))
  const recorded = DEMO_BASELINE_CHECK.judge(f18Release(), world)
  assert.deepEqual([recorded.state, recorded.code], ['done', 'demo-baseline-recorded'])
  assert.equal(exitCodeOf([{ piece: 'demo-baseline', ...recorded }]), 0)
})

test('F18: every template brought to the JA Boxing level carries the baseline of its pinned version', async () => {
  const { DEMO_BASELINE_CHECK, pins, verdict, contracts } = await f18()
  const index = contracts.defaultContracts()
  for (const name of ['ja-boxing', 'ja-diner', 'ja-voyara']) {
    const rel = pins.releaseOfPin(pins.latestPin(name), index)
    const judged = verdict.readinessVerdict(rel, {
      contracts: index,
      server: false,
      checks: [DEMO_BASELINE_CHECK]
    })
    const piece = judged.pieces.find((p) => p.piece === 'demo-baseline')
    assert.deepEqual([name, piece.state, piece.code], [name, 'done', 'demo-baseline-recorded'])
  }
})

test('F18: the skill makes the recorded baseline a done criterion, whatever the policy file or a warn says', () => {
  const skill = readFileSync(join(F18_ROOT, '.agents/skills/joomla-template-readiness/SKILL.md'), 'utf8')
  const done = skill.slice(skill.indexOf('## 6. Done'))
  assert.match(done, /demo-baseline-recorded/)
  assert.match(done, /demo-baseline-policy\.json/)
  assert.match(done, /warn/)
})
