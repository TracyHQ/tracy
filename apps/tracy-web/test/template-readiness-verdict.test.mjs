/**
 * The template readiness verdict (`src/lib/template-readiness/verdict.js`): one function that judges the pieces of a
 * quickstart release the Website opportunity flow reads, from the very steps Road to live shows. Road to live reads
 * its first steps from this verdict, so the two can never disagree.
 *
 * The reference case is the latest JA Boxing j6 release, read from the quickstart list pin, so the reference moves
 * when JA Boxing is released again. JA Diner j6 is the T3 case: its verdict is recorded as it is, not fixed here.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { main } from '../scripts/template-readiness.mjs'
import { defaultContracts } from '../src/lib/contracts.js'
import { roadOf } from '../src/lib/road-to-live.js'
import { latestPin, releaseOfPin } from '../src/lib/template-readiness/pinned-release.js'
import { PIECES, readinessVerdict, VERDICT_STEPS } from '../src/lib/template-readiness/verdict.js'

/** One release as `readReleases` returns it: a fictional Joomla quickstart. */
function release(over = {}) {
  const setting = {
    schemaVersion: 'tracy-setting/v1',
    platform: 'joomla',
    label: 'JA Example',
    version: '1.0.2',
    template: 'ja_example',
    install: { webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) } },
    ...over.setting
  }
  return {
    tag: 'quickstart/ja-example/j6',
    name: 'JA Example',
    kind: 'quickstart',
    github: over.github ?? 'published',
    tracy: 'ready',
    reason: null,
    publishedAt: null,
    assets: over.assets ?? [{ name: 'w.tar.gz' }],
    setting,
    inspiration: null,
    inspirationHidden: false,
    pages: null,
    local: null,
    choosable: true,
    platform: 'joomla'
  }
}

const pieceOf = (verdict, piece) => verdict.pieces.find((p) => p.piece === piece)
const brief = (verdict) => verdict.pieces.map((p) => [p.piece, p.state, p.code])

test('the verdict lists the pieces in one fixed order, each with a state, a code and params', () => {
  const verdict = readinessVerdict(release(), { contracts: new Map() })
  assert.deepEqual(
    verdict.pieces.map((p) => p.piece),
    ['quickstart-release', 'contract', 'template-kit', 'cowork-pin', 'customize', 'design-system']
  )
  assert.deepEqual(
    PIECES.map((p) => p.piece),
    verdict.pieces.map((p) => p.piece)
  )
  for (const p of verdict.pieces) {
    assert.ok(['done', 'warn', 'todo', 'blocked', 'checking'].includes(p.state), `${p.piece}: ${p.state}`)
    assert.equal(typeof p.code, 'string')
    assert.equal(typeof p.params, 'object')
  }
})

test('a piece is decided by its first step not passed, with the code Road to live shows for that step', () => {
  // No contract anywhere: the release passes, the contract is the next thing to do, and what sits beside it waits.
  const verdict = readinessVerdict(release(), { contracts: new Map() })
  assert.deepEqual(brief(verdict), [
    ['quickstart-release', 'done', 'install-file-ready'],
    ['contract', 'todo', 'no-contract'],
    ['template-kit', 'blocked', 'kit-waiting'],
    ['cowork-pin', 'blocked', 'customize-waiting'],
    ['customize', 'blocked', 'customize-waiting'],
    ['design-system', 'todo', 'ds-not-checked']
  ])
  assert.equal(pieceOf(verdict, 'template-kit').blockedBy, 'contract')
  assert.equal(pieceOf(verdict, 'contract').step, 'contract')
})

test('a draft release holds the release piece on its own release step', () => {
  const verdict = readinessVerdict(release({ github: 'draft' }), { contracts: new Map() })
  assert.deepEqual(pieceOf(verdict, 'quickstart-release'), {
    piece: 'quickstart-release',
    step: 'release',
    state: 'todo',
    code: 'release-draft',
    params: {}
  })
})

test('Road to live shows the verdict steps first, unchanged, for every release shape', () => {
  const boxing = latestPin('ja-boxing')
  const shapes = [
    [release(), { contracts: new Map() }],
    [release({ github: 'draft' }), { contracts: new Map() }],
    [release({ assets: [] }), { contracts: new Map() }],
    [releaseOfPin(boxing, defaultContracts()), { contracts: defaultContracts() }]
  ]
  for (const [r, world] of shapes) {
    const verdict = readinessVerdict(r, world)
    const road = roadOf(r, world)
    assert.deepEqual(
      verdict.steps.map((s) => s.step),
      VERDICT_STEPS
    )
    assert.deepEqual(road.slice(0, verdict.steps.length), verdict.steps)
  }
})

// The reference does NOT pass today, and the verdict must not be bent to make it: the committed content-coverage.json of
// JA Boxing 1.0.11 records one page that did not render (`pages.failed: 1`), which Content coverage reads as an
// incomplete measurement (`coverage-holes`). Run with its stored checks (`template-readiness.mjs ja-boxing`, local mode)
// it also fails STAB-1 (64 slot samples not in their column of the dump) and has no design system measurement at the
// current preview probe (`ds-not-at-probe`). The case runs and reports as todo until JA Boxing is green again.
test('the reference: the latest JA Boxing j6 release in the quickstart list is green on every piece the repository judges', {
  todo: 'JA Boxing 1.0.11 content coverage: 1 page did not render'
}, () => {
  const pin = latestPin('ja-boxing')
  assert.equal(pin.tag, 'quickstart/ja-boxing/j6')
  const verdict = readinessVerdict(releaseOfPin(pin, defaultContracts()), {
    contracts: defaultContracts(),
    server: false
  })
  for (const piece of ['quickstart-release', 'contract', 'template-kit'])
    assert.equal(pieceOf(verdict, piece).state, 'done', `${piece}: ${pieceOf(verdict, piece).code}`)
  // The two stored checks are not in the repository: without them the verdict says so and never passes them.
  assert.equal(pieceOf(verdict, 'cowork-pin').code, 'customize-not-checked')
  assert.equal(pieceOf(verdict, 'customize').code, 'customize-not-checked')
  assert.equal(pieceOf(verdict, 'design-system').code, 'ds-not-checked')
})

test('the T3 case: JA Diner j6 is judged by the same pieces and codes (recorded as it is today)', () => {
  const pin = latestPin('ja-diner')
  assert.equal(pin.tag, 'quickstart/ja-diner/j6')
  const verdict = readinessVerdict(releaseOfPin(pin, defaultContracts()), {
    contracts: defaultContracts(),
    server: false
  })
  assert.deepEqual(brief(verdict), [
    ['quickstart-release', 'done', 'install-file-ready'],
    ['contract', 'done', 'coverage-ready'],
    ['template-kit', 'done', 'kit-approved'],
    ['cowork-pin', 'todo', 'customize-not-checked'],
    ['customize', 'todo', 'customize-not-checked'],
    ['design-system', 'todo', 'ds-not-checked']
  ])
})

test('the command line prints the verdict of a named template as text and as JSON, and fails when a piece is not green', async () => {
  let text = ''
  assert.equal(await main(['ja-diner', '--pin-only'], { out: (s) => (text += s) }), 1)
  assert.match(text, /^quickstart\/ja-diner\/j6 1\.0\.5 /)
  assert.match(text, /done {5}template-kit {9}kit-approved/)
  let json = ''
  assert.equal(await main(['quickstart/ja-diner/j6', '--json', '--pin-only'], { out: (s) => (json += s) }), 1)
  const doc = JSON.parse(json)
  assert.equal(doc.source, 'pin')
  assert.deepEqual(
    doc.pieces.map((p) => p.piece),
    PIECES.map((p) => p.piece)
  )
  let said = ''
  assert.equal(await main(['ja-example-nowhere', '--pin-only'], { err: (s) => (said += s) }), 2)
  assert.match(said, /pins no release named ja-example-nowhere/)
})

test('a later check joins its piece after the road steps, or opens a new piece after the five', () => {
  const checks = [
    {
      piece: 'quickstart-release',
      step: 'example-check',
      judge: () => ({ state: 'warn', code: 'example-warn' })
    },
    {
      piece: 'demo-baseline',
      step: 'demo-baseline',
      judge: () => ({ state: 'todo', code: 'example-missing' })
    },
    { piece: 'template-kit', step: 'not-applicable', judge: () => null }
  ]
  const verdict = readinessVerdict(release(), { contracts: new Map(), checks })
  assert.deepEqual(brief(verdict), [
    ['quickstart-release', 'warn', 'example-warn'],
    ['contract', 'todo', 'no-contract'],
    ['template-kit', 'blocked', 'kit-waiting'],
    ['cowork-pin', 'blocked', 'customize-waiting'],
    ['customize', 'blocked', 'customize-waiting'],
    ['design-system', 'todo', 'ds-not-checked'],
    ['demo-baseline', 'todo', 'example-missing']
  ])
  assert.equal(
    verdict.steps.some((s) => s.step === 'example-check'),
    false
  )
})

/** A stored Customize your site check of `version` with these rule results, as /ops stores it. */
const customizeCheck = (version, results) => ({
  state: 'done',
  version,
  report: { template: 'ja_example', cms: 'joomla', version, results },
  reason: null,
  checkedAt: '2026-11-06T00:00:00.000Z'
})
const rule = (id, status, owner = 'template') => ({
  id,
  status,
  owner,
  message: `${id} ${status}`,
  fix: null
})

test('the Cowork pin piece judges only the rule that reads the pinned plugin; Customize your site carries the rest', () => {
  const pin = latestPin('ja-diner')
  const world = (results) => ({
    contracts: defaultContracts(),
    server: false,
    readiness: customizeCheck(pin.version, results),
    // Only the two halves of the stored check: the later checks of the piece (write doors) are tested on their own.
    checks: []
  })
  const plugin = readinessVerdict(
    releaseOfPin(pin, defaultContracts()),
    world([rule('STAB-1', 'fail', 'plugin'), rule('NAME-1', 'pass')])
  )
  assert.deepEqual(
    [pieceOf(plugin, 'cowork-pin').code, pieceOf(plugin, 'customize').code],
    ['customize-must-fix', 'customize-ready']
  )
  assert.deepEqual(
    pieceOf(plugin, 'cowork-pin').params.mustFix.map((m) => m.rule),
    ['STAB-1']
  )
  const template = readinessVerdict(
    releaseOfPin(pin, defaultContracts()),
    world([rule('STAB-1', 'pass', 'contract'), rule('NAME-1', 'fail')])
  )
  assert.deepEqual(
    [pieceOf(template, 'cowork-pin').code, pieceOf(template, 'customize').code],
    ['customize-ready', 'customize-must-fix']
  )
  // Road to live still shows one Customize your site step over every rule.
  const road = roadOf(
    releaseOfPin(pin, defaultContracts()),
    world([rule('STAB-1', 'pass'), rule('NAME-1', 'fail')])
  )
  assert.deepEqual(
    road.find((s) => s.step === 'customize').params.mustFix.map((m) => m.rule),
    ['NAME-1']
  )
})
