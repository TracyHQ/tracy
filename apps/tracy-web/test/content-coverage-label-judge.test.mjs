/**
 * The LLM label judge in Content coverage (spec #37, issue #44): the audit commits the judge's verdicts in
 * `content-coverage.json` (`labelJudge`, beside `labelRules`); the Road to live step reads only those committed results.
 * A slot the judge puts in the wrong fact/editorial group holds a new release, a finer mismatch warns, a live release
 * only warns, and a result the model never gave is shown as not judged, never as a pass. Everything here is fictional.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { judgeLabelJudge } from '../src/lib/content-coverage/judge.js'
import { readContracts } from '../src/lib/contracts.js'
import { publishRefusalOf, roadOf } from '../src/lib/road-to-live.js'

const TAG = 'quickstart/ironreed-boxing/j6'
const V3 = 'place-content-roles/3'
const V2 = 'place-content-roles/2'
const sha = (s) => createHash('sha256').update(s).digest('hex')
const LOCK = '{"entities":{}}'

const right = (key) => ({ key, hash: 'a1b2c3d4e5f60718', verdict: 'right' })
const wrong = (key, role, suggested, groupWrong) => ({
  key,
  hash: 'a1b2c3d4e5f60718',
  verdict: 'wrong',
  role,
  suggested,
  groupWrong,
  why: 'invented reason'
})
const PHONE = wrong('coaches.phone', 'editorial.paragraph', 'contact.phone', true)
const CLAIM = wrong('hero.title', 'editorial.heading', 'claim.heading', true)
const FINER = wrong('classes.intro', 'editorial.paragraph', 'editorial.heading', false)

/** The `labelJudge` block the audit commits. */
function judgeBlock(slots, over = {}) {
  const wrongs = slots.filter((s) => s.verdict === 'wrong')
  return {
    version: 'label-judge/1',
    roleVocabularyVersion: V3,
    applies: true,
    model: 'stub-vision',
    state: 'judged',
    reason: null,
    calls: 3,
    cents: 2,
    counts: {
      slots: slots.length,
      located: slots.length,
      notLocated: 0,
      judged: slots.length,
      notJudged: 0,
      right: slots.length - wrongs.length,
      wrongGroup: wrongs.filter((s) => s.groupWrong).length,
      mismatch: wrongs.filter((s) => !s.groupWrong).length
    },
    slots,
    ...over
  }
}
const cleanRules = (version = V3) => ({
  version: 'label-rules/1',
  roleVocabularyVersion: version,
  applies: version === V3,
  r1: { facts: 4, slots: 20, percent: 20 },
  rules: {}
})

function profile(block, { version = V3 } = {}) {
  const map = JSON.stringify({
    roleVocabularyVersion: version,
    slotFitVersion: 'slot-fit/1',
    slots: [{ key: 'a', type: 'text', role: 'editorial.heading', fit: { measured: false } }]
  })
  const doc = {
    schemaVersion: 'tracy-content-coverage/v1',
    tool: { name: 'test', version: '1.3.0' },
    contract: { id: `${TAG}/1.0.0`, contentMapSha256: sha(map), presentationLockSha256: sha(LOCK) },
    measuredAt: '2026-10-28T12:00:00.000Z',
    pages: { audited: 4, inMap: 4, notInMap: 0, failed: 0, capReached: false },
    counts: {},
    coverage: { text: 100, images: 100, links: 100 },
    holes: [],
    hygiene: [],
    labelRules: cleanRules(version),
    ...(block ? { labelJudge: block } : {})
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'label-judge-'))
  const at = path.join(dir, 'ironreed-boxing', 'j6', '1.0.0')
  mkdirSync(at, { recursive: true })
  writeFileSync(
    path.join(at, 'manifest.json'),
    JSON.stringify({ id: `${TAG}/1.0.0`, platform: 'joomla', quickstart: { release: TAG, version: '1.0.0' } })
  )
  writeFileSync(path.join(at, 'content-map.json'), map)
  writeFileSync(path.join(at, 'presentation-lock.json'), LOCK)
  writeFileSync(path.join(at, 'content-coverage.json'), JSON.stringify(doc))
  return readContracts(dir)
}

const release = (over = {}) => ({
  tag: TAG,
  name: 'Ironreed Boxing',
  kind: 'quickstart',
  github: 'published',
  tracy: 'ready',
  assets: [{ name: 'w.tar.gz' }],
  setting: {
    platform: 'joomla',
    version: '1.0.0',
    template: 'ironreed-boxing',
    install: { webroot: { file: 'w.tar.gz' } }
  },
  inspiration: null,
  inspirationHidden: true,
  pages: [{ id: 'home', label: 'Home', home: true }],
  local: null,
  choosable: true,
  platform: 'joomla',
  ...over
})
const LIVE = { inspiration: { id: 'x' }, inspirationHidden: false }
const stepOf = (road) => road.find((s) => s.step === 'content-coverage')
const fields = (s) => [s.state, s.code, s.params.judgeState, s.params.judgeHolds, s.params.judgeWarns]
const refusalOf = (step, r) =>
  publishRefusalOf(
    [
      step,
      {
        step: 'published',
        state: 'blocked',
        code: 'not-published',
        params: {},
        blockedBy: 'content-coverage'
      }
    ],
    r
  )

test('a judged map with every slot right passes', () => {
  const step = stepOf(roadOf(release(), { contracts: profile(judgeBlock([right('a'), right('b')])) }))
  assert.deepEqual(fields(step), ['done', 'coverage-ready', 'ready', false, false])
})

test('a slot in the wrong fact/editorial group blocks a new release and is named in the refusal', () => {
  const contracts = profile(judgeBlock([right('a'), PHONE, CLAIM, FINER]))
  const step = stepOf(roadOf(release(), { contracts }))
  assert.deepEqual(fields(step), ['todo', 'coverage-judge', 'wrong-group', true, false])
  assert.deepEqual(step.params.judgeWrongGroup, [
    { key: 'coaches.phone', role: 'editorial.paragraph', suggested: 'contact.phone', why: 'invented reason' },
    { key: 'hero.title', role: 'editorial.heading', suggested: 'claim.heading', why: 'invented reason' }
  ])
  assert.equal(step.params.judgeMismatch.length, 1)
  const reason = refusalOf(step, release()).reason
  assert.match(reason, /Label judge: 2 slots in the wrong fact\/editorial group/)
  assert.match(reason, /coaches\.phone editorial\.paragraph -> contact\.phone/)
})

test('a finer mismatch only warns, even on a new release', () => {
  const step = stepOf(roadOf(release(), { contracts: profile(judgeBlock([right('a'), FINER])) }))
  assert.deepEqual(fields(step), ['warn', 'coverage-judge-warn', 'mismatch', false, true])
  assert.equal(step.params.judgeMismatch[0].key, 'classes.intro')
})

test('a wrong group only warns for a release already shown on Design inspiration', () => {
  const step = stepOf(roadOf(release(LIVE), { contracts: profile(judgeBlock([PHONE])) }))
  assert.deepEqual(fields(step), ['warn', 'coverage-judge-warn', 'wrong-group', false, true])
})

test('a result the model never gave is not judged, never a pass', () => {
  const block = judgeBlock([], {
    state: 'not-judged',
    reason: 'NO_VISION_MODEL',
    counts: { ...judgeBlock([]).counts, slots: 6, located: 6, notJudged: 6 }
  })
  const step = stepOf(roadOf(release(), { contracts: profile(block) }))
  assert.deepEqual(fields(step), ['warn', 'coverage-judge-warn', 'not-judged', false, true])
  assert.equal(step.params.judgeReason, 'NO_VISION_MODEL')
  assert.equal(step.params.judgeNotJudged, 6)
})

test('a version 2 map is reported, never held or warned', () => {
  const block = judgeBlock([PHONE], { roleVocabularyVersion: V2, applies: false })
  const step = stepOf(roadOf(release(), { contracts: profile(block, { version: V2 }) }))
  assert.deepEqual(fields(step), ['done', 'coverage-ready', 'reported', false, false])
})

test('a coverage file measured before the judge existed is not judged and holds nothing', () => {
  const step = stepOf(roadOf(release(), { contracts: profile(null) }))
  assert.deepEqual(fields(step), ['done', 'coverage-ready', 'none', false, false])
})

test('the judge is data in the policy: a release may be let through on a wrong group', () => {
  const doc = { labelJudge: judgeBlock([PHONE]) }
  assert.equal(judgeLabelJudge(doc, { live: false }).holds, true)
  assert.equal(
    judgeLabelJudge(
      doc,
      { live: false },
      { labelJudgeHoldNewRelease: false, labelRules: { blockingVocabularies: [V3] } }
    ).holds,
    false
  )
})
