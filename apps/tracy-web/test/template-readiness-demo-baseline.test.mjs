/**
 * The demo baseline piece of the template readiness verdict (ticket #433): `demo-baseline.json` beside the contract,
 * measured once per quickstart version on the untouched site (PR #428). A release without a readable baseline of its own
 * version is red, and its fix names the two commands that measure the baseline and record it beside the contract. The
 * latest JA Boxing release carries one and stays green.
 */
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { defaultContracts } from '../src/lib/contracts.js'
import { BASELINE_FILE, BASELINE_SCHEMA } from '../src/lib/template-kit/demo-baseline-file.js'
import { DEMO_BASELINE_CHECK } from '../src/lib/template-readiness/demo-baseline-check.js'
import { fixOf } from '../src/lib/template-readiness/fixes.js'
import { latestPin, releaseOfPin } from '../src/lib/template-readiness/pinned-release.js'
import { PIECES, readinessVerdict } from '../src/lib/template-readiness/verdict.js'

const TAG = 'quickstart/ja-example/j6'
const ID = 'ja-example/j6/1.0.0'

const release = (over = {}) => ({
  tag: TAG,
  kind: 'quickstart',
  platform: 'joomla',
  setting: { platform: 'joomla', version: '1.0.0', template: 'ja-example' },
  inspiration: null,
  inspirationHidden: true,
  choosable: true,
  ...over
})
const published = () => release({ inspiration: { template: 'ja-example' }, inspirationHidden: false })

/** A baseline as the kit tool records it, for the invented template. */
const baseline = (over = {}) => ({
  schema: BASELINE_SCHEMA,
  quickstart: ID,
  source: 'host',
  texts: ['Train with us'],
  labels: ['Join now'],
  pictures: { files: ['images/hero.jpg'], shas: ['b'.repeat(64)] },
  ...over
})

/** A contract folder of the invented template holding `doc` as its demo baseline (none when null). */
function judge(doc, rel = release()) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'demo-baseline-'))
  try {
    if (doc !== null)
      writeFileSync(path.join(dir, BASELINE_FILE), typeof doc === 'string' ? doc : JSON.stringify(doc))
    const contracts = new Map([[`${TAG}@1.0.0`, { id: ID, dir, platform: 'joomla' }]])
    return DEMO_BASELINE_CHECK.judge(rel, { contracts }, { steps: [], version: '1.0.0' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('a release without a baseline file is red, and its fix names the measure and the record commands', () => {
  const judged = judge(null)
  assert.deepEqual([judged.state, judged.code], ['todo', 'demo-baseline-missing'])
  assert.equal(judged.params.contract, ID)
  const fix = fixOf(judged.code, judged.params)
  const said = `${fix.text} ${fix.command ?? ''}`
  assert.match(said, /apps\/tracy-web\/scripts\/site-check-baseline\.mjs/)
  assert.match(said, /template-kit\/cli\.mjs baseline/)
  assert.match(fix.text, /ja-example\/j6\/1\.0\.0/)
})

test('a baseline that cannot be read, or that measured another version, is red with its own code', () => {
  const invalid = judge('{ not json')
  assert.deepEqual([invalid.state, invalid.code], ['todo', 'demo-baseline-invalid'])
  assert.match(String(invalid.params.reason), /not valid JSON/)
  const guessed = judge(baseline({ source: 'kit' }))
  assert.deepEqual([guessed.state, guessed.code], ['todo', 'demo-baseline-invalid'])
  const stale = judge(baseline({ quickstart: 'ja-example/j6/0.9.0' }))
  assert.deepEqual([stale.state, stale.code], ['todo', 'demo-baseline-stale'])
  assert.match(String(stale.params.reason), /measured ja-example\/j6\/0\.9\.0/)
  for (const j of [invalid, stale])
    assert.match(fixOf(j.code, j.params).text, /site-check-baseline\.mjs|measure/i)
})

test('a readable baseline of this version is green', () => {
  const judged = judge(baseline())
  assert.deepEqual([judged.state, judged.code], ['done', 'demo-baseline-recorded'])
  assert.equal(judged.params.contract, ID)
  assert.equal(fixOf(judged.code, judged.params), null)
})

test('a template already shown on Design inspiration only warns', () => {
  const judged = judge(null, published())
  assert.deepEqual([judged.state, judged.code], ['warn', 'demo-baseline-missing'])
})

test('with no contract sealing the release the piece waits for the contract; off Joomla it does not apply', () => {
  const waiting = DEMO_BASELINE_CHECK.judge(
    release(),
    { contracts: new Map() },
    { steps: [], version: '1.0.0' }
  )
  assert.deepEqual(
    [waiting.state, waiting.code, waiting.blockedBy],
    ['blocked', 'demo-baseline-waiting', 'contract']
  )
  const wp = release({ platform: 'wordpress', setting: { platform: 'wordpress', version: '1.0.0' } })
  assert.equal(DEMO_BASELINE_CHECK.judge(wp, { contracts: new Map() }, {}), null)
})

test('the verdict carries the demo baseline as its last piece, in the fixed order', () => {
  // test-quality: contract the verdict order is the stated output shape (spec #429): the demo baseline closes it
  assert.equal(PIECES.at(-1).piece, 'demo-baseline')
  const verdict = readinessVerdict(release(), { contracts: new Map(), server: false })
  const piece = verdict.pieces.at(-1)
  assert.deepEqual(
    [piece.piece, piece.step, piece.state, piece.code, piece.blockedBy],
    ['demo-baseline', 'demo-baseline', 'blocked', 'demo-baseline-waiting', 'contract']
  )
})

const boxingNow = () => {
  const contracts = defaultContracts()
  return { contracts, boxing: releaseOfPin(latestPin('ja-boxing'), contracts) }
}

test('the reference: the latest JA Boxing release is green on its committed baseline', () => {
  const { contracts, boxing } = boxingNow()
  const verdict = readinessVerdict(boxing, { contracts, server: false, checks: [DEMO_BASELINE_CHECK] })
  const piece = verdict.pieces.find((p) => p.piece === 'demo-baseline')
  assert.deepEqual([piece.state, piece.code], ['done', 'demo-baseline-recorded'])
  assert.equal(piece.params.contract, `ja-boxing/j6/${boxing.setting.version}`)
})

test('in the verdict: a copy of JA Boxing without its baseline holds the demo baseline piece', () => {
  const { contracts, boxing } = boxingNow()
  const dir = mkdtempSync(path.join(os.tmpdir(), 'demo-baseline-boxing-'))
  try {
    const own = [...contracts.values()].find((c) => c.id === `ja-boxing/j6/${boxing.setting.version}`)
    cpSync(own.dir, dir, { recursive: true })
    unlinkSync(path.join(dir, BASELINE_FILE))
    const broken = new Map([...contracts].map(([k, c]) => [k, c.id === own.id ? { ...c, dir } : c]))
    const verdict = readinessVerdict(boxing, {
      contracts: broken,
      server: false,
      checks: [DEMO_BASELINE_CHECK]
    })
    const piece = verdict.pieces.find((p) => p.piece === 'demo-baseline')
    assert.deepEqual([piece.state, piece.code], ['todo', 'demo-baseline-missing'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
