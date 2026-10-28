/**
 * The label rules group of Content coverage (ADR 0040, spec #37): the audit commits the results of rules R2 to R9 in
 * `content-coverage.json`; the Road to live step reads only those committed results, holds a new release on any failing
 * rule and only warns for a live one. R1 (the fact-role share) is a number and never blocks. A version 2 map is
 * reported and not blocking until a template adopts version 3. Everything here is fictional.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { COVERAGE_POLICY, judgeLabelRules } from '../src/lib/content-coverage/judge.js'
import { readContracts } from '../src/lib/contracts.js'
import { publishRefusalOf, roadOf } from '../src/lib/road-to-live.js'

const TAG = 'quickstart/ja-boxing/j6'
const V3 = 'place-content-roles/3'
const V2 = 'place-content-roles/2'
const sha = (s) => createHash('sha256').update(s).digest('hex')
const LOCK = '{"entities":{}}'

const mapOf = (version) =>
  JSON.stringify({
    roleVocabularyVersion: version,
    slotFitVersion: 'slot-fit/1',
    slots: [{ key: 'a', type: 'text', role: 'editorial.heading', fit: { measured: false } }]
  })

/** The `labelRules` block the audit commits: `failing` is `{ R3: ['foot.link'] }`. */
function labelRules(failing = {}, over = {}) {
  const ids = ['R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9']
  return {
    version: 'label-rules/1',
    roleVocabularyVersion: V3,
    applies: true,
    r1: { facts: 3, slots: 40, percent: 7.5 },
    rules: Object.fromEntries(
      ids.map((id) => [
        id,
        { title: `rule ${id}`, count: (failing[id] ?? []).length, keys: failing[id] ?? [] }
      ])
    ),
    ...over
  }
}

function profile(version, rules, { omit = false, holes = [], platform = 'joomla' } = {}) {
  const map = mapOf(version)
  const doc = {
    schemaVersion: 'tracy-content-coverage/v1',
    tool: { name: 'test', version: '1.2.0' },
    contract: { id: `${TAG}/1.0.2`, contentMapSha256: sha(map), presentationLockSha256: sha(LOCK) },
    measuredAt: '2026-10-28T10:00:00.000Z',
    pages: { audited: 5, inMap: 5, notInMap: 0, failed: 0, capReached: false },
    counts: {},
    coverage: { text: 100, images: 100, links: 100 },
    holes,
    hygiene: [],
    ...(omit ? {} : { labelRules: rules })
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'label-rules-'))
  const at = path.join(dir, 'ja-boxing', 'j6', '1.0.2')
  mkdirSync(at, { recursive: true })
  writeFileSync(
    path.join(at, 'manifest.json'),
    JSON.stringify({ id: `${TAG}/1.0.2`, platform, quickstart: { release: TAG, version: '1.0.2' } })
  )
  writeFileSync(path.join(at, 'content-map.json'), map)
  writeFileSync(path.join(at, 'presentation-lock.json'), LOCK)
  writeFileSync(path.join(at, 'content-coverage.json'), JSON.stringify(doc))
  return readContracts(dir)
}

const release = (over = {}) => ({
  tag: TAG,
  name: 'JA Boxing',
  kind: 'quickstart',
  github: 'published',
  tracy: 'ready',
  assets: [{ name: 'w.tar.gz' }],
  setting: {
    platform: 'joomla',
    version: '1.0.2',
    template: 'ja-boxing',
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
const stepOf = (road) => road.find((s) => s.step === 'content-coverage')
const fields = (s) => [s.state, s.code, s.params.labelState, s.params.labelHolds, s.params.labelWarns]
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

test('a clean v3 result passes, with R1 shown as a number', () => {
  const step = stepOf(roadOf(release(), { contracts: profile(V3, labelRules()) }))
  assert.deepEqual(fields(step), ['done', 'coverage-ready', 'ready', false, false])
  assert.equal(step.params.labelFactShare, 7.5)
})

for (const rule of ['R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9']) {
  test(`${rule} failing holds a new release and names the rule and its keys`, () => {
    const contracts = profile(V3, labelRules({ [rule]: ['k.one', 'k.two'] }))
    const step = stepOf(roadOf(release(), { contracts }))
    assert.deepEqual(fields(step), ['todo', 'coverage-labels', 'failing', true, false])
    assert.deepEqual(step.params.labelFailing, [
      { rule, title: `rule ${rule}`, count: 2, keys: ['k.one', 'k.two'] }
    ])
    const reason = refusalOf(step, release()).reason
    assert.match(reason, new RegExp(`Label rules: ${rule}`))
    assert.match(reason, /k\.one/)
  })
}

test('the same failing rule only warns for a release already shown on Design inspiration', () => {
  const contracts = profile(V3, labelRules({ R3: ['foot.link'] }))
  const step = stepOf(roadOf(release({ inspiration: { id: 'x' }, inspirationHidden: false }), { contracts }))
  assert.deepEqual(fields(step), ['warn', 'coverage-live-labels', 'failing', false, true])
})

test('R1 alone never blocks, however low the share', () => {
  const rules = labelRules({}, { r1: { facts: 0, slots: 40, percent: 0 } })
  const step = stepOf(roadOf(release(), { contracts: profile(V3, rules) }))
  assert.deepEqual(fields(step), ['done', 'coverage-ready', 'ready', false, false])
  assert.equal(step.params.labelFactShare, 0)
})

test('a version 2 map is reported but does not block, so released templates are not suddenly held', () => {
  const rules = labelRules({ R3: ['foot.link'], R2: ['a'] }, { roleVocabularyVersion: V2, applies: false })
  const step = stepOf(roadOf(release(), { contracts: profile(V2, rules) }))
  assert.deepEqual(fields(step), ['done', 'coverage-ready', 'reported', false, false])
  assert.equal(step.params.labelFailing.length, 2)
})

test('a coverage file without label rules (an audit before 1.2.0) is not judged', () => {
  const step = stepOf(roadOf(release(), { contracts: profile(V3, null, { omit: true }) }))
  assert.deepEqual(fields(step), ['done', 'coverage-ready', 'none', false, false])
})

test('the step reads the committed results only: it follows the file even when the map looks different', () => {
  // The map holds one clean heading slot; the committed result says R3 fails. The step believes the file.
  const step = stepOf(roadOf(release(), { contracts: profile(V3, labelRules({ R3: ['committed.key'] })) }))
  assert.equal(step.params.labelFailing[0].keys[0], 'committed.key')
})

test('the rules that block are data: a looser policy lets R8 through', () => {
  const doc = { labelRules: labelRules({ R8: ['a + b'] }) }
  assert.equal(judgeLabelRules(doc, { live: false }).holds, true)
  const loose = { ...COVERAGE_POLICY, labelRules: { ...COVERAGE_POLICY.labelRules, blocking: ['R2', 'R3'] } }
  assert.equal(judgeLabelRules(doc, { live: false }, loose).holds, false)
})

test('holes keep their verdict, and the label rules ride along in the refusal', () => {
  const hole = {
    kind: 'text',
    value: 'Join us',
    class: 'capture',
    lock: 'undeclared',
    cause: 'c',
    evidence: '',
    pages: 1,
    firstPage: '/'
  }
  const contracts = profile(V3, labelRules({ R3: ['foot.link'] }), { holes: [hole] })
  const step = stepOf(roadOf(release(), { contracts }))
  assert.deepEqual([step.code, step.params.holes, step.params.labelHolds], ['coverage-holes', 1, true])
  const reason = refusalOf(step, release()).reason
  assert.match(reason, /1 piece of demo content/)
  assert.match(reason, /Label rules: R3/)
})

test('roles and Slot fit come first, and the refusal still names the label rules when they hold too', () => {
  const contracts = profile(V3, labelRules({ R9: ['Call 555 010 7788'] }))
  const step = stepOf(roadOf(release(), { contracts }))
  assert.equal(step.code, 'coverage-labels')
  assert.match(refusalOf(step, release()).reason, /R9/)
})

test('a WordPress contract is judged by the same label rules, from the same committed file', () => {
  const wp = release({ setting: { ...release().setting, platform: 'wordpress' }, platform: 'wordpress' })
  const clean = stepOf(roadOf(wp, { contracts: profile(V3, labelRules(), { platform: 'wordpress' }) }))
  assert.deepEqual(fields(clean), ['done', 'coverage-ready', 'ready', false, false])
  const failing = profile(V3, labelRules({ R3: ['home.paragraph.2.link.1'] }), { platform: 'wordpress' })
  const held = stepOf(roadOf(wp, { contracts: failing }))
  assert.deepEqual(fields(held).slice(0, 2), ['todo', 'coverage-labels'])
  assert.match(refusalOf(held, wp).reason, /R3/)
  const shown = { ...wp, inspiration: { template: 'ja-boxing' }, inspirationHidden: false }
  assert.deepEqual(fields(stepOf(roadOf(shown, { contracts: failing }))).slice(0, 2), [
    'warn',
    'coverage-live-labels'
  ])
})
