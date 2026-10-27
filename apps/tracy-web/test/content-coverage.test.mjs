/**
 * Content coverage (owner 24/10/2026): the Road to live step that holds Publish while the content
 * contract leaves demo text, images or links undeclared. The audit writes `content-coverage.json`
 * beside the contract; `src/lib/content-coverage/` reads it, checks it measured THIS map and lock,
 * and judges it with `policy.json`.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { holeBlocks, judgeCoverage } from '../src/lib/content-coverage/judge.js'
import { coverageOfContract } from '../src/lib/content-coverage/reader.js'
import { readContracts } from '../src/lib/contracts.js'
import { publishRefusalOf, ROAD_STEPS, roadOf } from '../src/lib/road-to-live.js'

const TAG = 'quickstart/ja-boxing/j6'
/** A content map whose every text and image slot has a role (ADR 0038): the fixture of a release that passes. */
const MAP = JSON.stringify({
  roleVocabularyVersion: 'place-content-roles/2',
  slots: [{ key: 'a', type: 'text', role: 'editorial.heading' }]
})
/** A content map of a contract released before ADR 0038: it declares no roles anywhere. */
const MAP_WITHOUT_ROLES = '{"slots":[{"key":"a","type":"text"}]}'
/** A content map that declares roles but leaves ten text slots without one. */
const MAP_MISSING_ROLES = JSON.stringify({
  roleVocabularyVersion: 'place-content-roles/2',
  slots: [
    { key: 'a', type: 'text', role: 'editorial.heading' },
    ...Array.from({ length: 10 }, (_, i) => ({ key: `module-100.${i + 1}`, type: 'text' }))
  ]
})
const LOCK = '{"entities":{}}'
const sha = (s) => createHash('sha256').update(s).digest('hex')

const hole = (over = {}) => ({
  kind: 'text',
  value: 'Join over 100k of inspiring creatives',
  class: 'capture',
  lock: 'undeclared',
  cause: 'module param outside jatools-config',
  evidence: 'modules#90.params',
  pages: 3,
  firstPage: '/',
  ...over
})

const doc = (holes = [], over = {}) => ({
  schemaVersion: 'tracy-content-coverage/v1',
  tool: { name: 'test', version: '1.1.0' },
  contract: { id: `${TAG}/1.0.2`, contentMapSha256: sha(MAP), presentationLockSha256: sha(LOCK) },
  measuredAt: '2026-10-24T10:00:00.000Z',
  pages: { audited: 44, inMap: 19, notInMap: 25, failed: 0, capReached: false },
  counts: {},
  coverage: { text: 90, images: 80, links: 100 },
  holes,
  hygiene: [],
  ...over
})

/** One profile of ja-boxing 1.0.2 on disk, with `coverage` written beside it unless null. `map`: its content map. */
function profile(coverage, map = MAP) {
  const dir = mkdtempSync(path.join(tmpdir(), 'coverage-'))
  const at = path.join(dir, 'ja-boxing', 'j6', '1.0.2')
  mkdirSync(at, { recursive: true })
  const manifest = { id: `${TAG}/1.0.2`, platform: 'joomla', quickstart: { release: TAG, version: '1.0.2' } }
  writeFileSync(path.join(at, 'manifest.json'), JSON.stringify(manifest))
  writeFileSync(path.join(at, 'content-map.json'), map)
  writeFileSync(path.join(at, 'presentation-lock.json'), LOCK)
  if (coverage !== null) {
    // The measurement names the sha of the map it measured: keep it true for whichever map this profile holds.
    const measured =
      typeof coverage === 'string'
        ? coverage
        : JSON.stringify({ ...coverage, contract: { ...coverage.contract, contentMapSha256: sha(map) } })
    writeFileSync(path.join(at, 'content-coverage.json'), measured)
  }
  return { contracts: readContracts(dir), at }
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
const roleFields = (step) => [step.state, step.code, step.params.rolesState, step.params.rolesCount]

test('the judge: an unexplained capture, template or unknown hole holds; core never; a reason accepts it', () => {
  assert.equal(holeBlocks(hole()), true)
  assert.equal(holeBlocks(hole({ class: 'template', lock: undefined })), true)
  assert.equal(holeBlocks(hole({ class: 'unknown', lock: undefined })), true)
  assert.equal(holeBlocks(hole({ class: 'core', lock: undefined })), false)
  // locked demo CONTENT stays a hole: only true presentation may be locked
  assert.equal(holeBlocks(hole({ lock: 'locked' })), true)
  assert.equal(holeBlocks(hole({ accepted: 'Author names come from the users table.' })), false)
  // a reason of a word or two is not a reason
  assert.equal(holeBlocks(hole({ accepted: 'ok' })), true)
  const verdict = judgeCoverage(
    doc([hole(), hole({ lock: 'locked', value: 'x' }), hole({ accepted: 'Kept on purpose, see notes.' })])
  )
  assert.deepEqual(
    [verdict.holds, verdict.blocking.length, verdict.accepted, verdict.lockedContent],
    [true, 2, 1, 1]
  )
  assert.deepEqual(verdict.byClass, { capture: 2 })
})

test('the threshold is data: the same file passes under a looser policy', () => {
  const loose = {
    platforms: ['joomla'],
    blockingClasses: ['capture'],
    lockedCaptureIsHole: false,
    maxUnacceptedHoles: 0,
    minAcceptedReasonLength: 12,
    maxFailedPages: 0,
    capReachedHolds: true
  }
  const verdict = judgeCoverage(
    doc([hole({ lock: 'locked' }), hole({ class: 'template', value: 'y' })]),
    loose
  )
  assert.equal(verdict.holds, false)
})

test('a failed page or a cut crawl is an incomplete measurement and holds', () => {
  const failed = judgeCoverage(doc([], { pages: { audited: 4, failed: 1, capReached: false } }))
  assert.deepEqual([failed.holds, failed.incomplete], [true, '1 page did not render'])
  const cut = judgeCoverage(doc([], { pages: { audited: 150, failed: 0, capReached: true } }))
  assert.equal(cut.holds, true)
})

test('the reader: none, measured, stale when the map or lock changed, invalid when unreadable', () => {
  const { contracts: none } = profile(null)
  assert.equal(coverageOfContract([...none.values()][0]).state, 'none')
  const { contracts } = profile(doc())
  const contract = [...contracts.values()][0]
  assert.equal(coverageOfContract(contract).state, 'measured')
  writeFileSync(path.join(contract.dir, 'content-map.json'), '{"slots":[]}')
  const stale = coverageOfContract(contract)
  assert.deepEqual([stale.state, stale.reason], ['stale', 'content-map.json changed after it was measured'])
  const other = profile(doc([], { contract: { ...doc().contract, presentationLockSha256: 'x' } }))
  assert.equal(coverageOfContract([...other.contracts.values()][0]).state, 'stale')
  const broken = profile('{not json')
  assert.equal(coverageOfContract([...broken.contracts.values()][0]).state, 'invalid')
  const old = profile(doc([], { tool: { version: '1.0.0' } }))
  assert.match(coverageOfContract([...old.contracts.values()][0]).reason, /1\.1\.0 or later/)
  const noHygiene = profile(doc([], { hygiene: undefined }))
  assert.match(coverageOfContract([...noHygiene.contracts.values()][0]).reason, /page hygiene/)
})

test('not measured: the step is to do, Publish refuses with CONTENT_COVERAGE_NOT_READY', () => {
  const { contracts } = profile(null)
  const r = release()
  const road = roadOf(r, { contracts })
  assert.deepEqual([stepOf(road).state, stepOf(road).code], ['todo', 'coverage-not-measured'])
  assert.ok(road.find((s) => s.step === 'published').params.waiting.includes('content-coverage'))
})

test('holes hold Publish and the refusal says how many; accepted ones let it through', () => {
  const { contracts } = profile(
    doc([hole(), hole({ class: 'template', value: 'Try a class', cause: 'template: lang' })])
  )
  const road = roadOf(release(), { contracts })
  const step = stepOf(road)
  assert.deepEqual([step.state, step.code, step.params.holes], ['todo', 'coverage-holes', 2])
  assert.equal(step.params.shown.length, 2)
  assert.equal(step.params.causes.length, 2)
  const accepted = profile(doc([hole({ accepted: 'Newsletter copy belongs to the form plugin.' })]))
  const done = stepOf(roadOf(release(), { contracts: accepted.contracts }))
  assert.deepEqual([done.state, done.code, done.params.accepted], ['done', 'coverage-ready', 1])
})

/** One page hygiene finding as `content-coverage.json` lists it (JA Boxing 1.0.2, 24/10/2026). */
const finding = (over = {}) => ({
  kind: 'language-constant',
  value: 'TPL_FOLLOW_US',
  where: 'text',
  visible: false,
  evidence: 'h5.my-0.d-none',
  pages: 44,
  firstPage: '/',
  ...over
})

test('page hygiene holds Publish on its own, as its own group, and takes the same accepted reason', () => {
  const php = finding({
    kind: 'php-error',
    value:
      'Deprecated: nl2br(): Passing null (templates/ja_boxing/html/com_contact/contact/default_address.php:94)',
    where: 'html',
    firstPage: '/index.php/about-us/contact',
    pages: 1
  })
  const { contracts } = profile(doc([], { hygiene: [finding(), php] }))
  const step = stepOf(roadOf(release(), { contracts }))
  assert.deepEqual(
    [step.state, step.code, step.params.holes, step.params.hygiene],
    ['todo', 'coverage-holes', 0, 2]
  )
  assert.deepEqual(step.params.hygieneByKind, { 'language-constant': 1, 'php-error': 1 })
  assert.deepEqual(
    step.params.hygieneShown.map((h) => [h.kind, h.value, h.firstPage]),
    [
      ['language-constant', 'TPL_FOLLOW_US', '/'],
      ['php-error', php.value, '/index.php/about-us/contact']
    ]
  )
  const blocked = {
    step: 'published',
    state: 'blocked',
    code: 'not-published',
    params: {},
    blockedBy: 'content-coverage'
  }
  const refusal = publishRefusalOf([step, blocked], release())
  assert.equal(refusal.error, 'CONTENT_COVERAGE_NOT_READY')
  assert.match(refusal.reason, /2 page problems/)
  const accepted = profile(
    doc([], { hygiene: [finding({ accepted: 'Shown only to a logged-in editor, never a visitor.' })] })
  )
  const done = stepOf(roadOf(release(), { contracts: accepted.contracts }))
  assert.deepEqual([done.state, done.code, done.params.hygieneAccepted], ['done', 'coverage-ready', 1])
})

test('the publish door reads the step: CONTENT_COVERAGE_NOT_READY with the count', () => {
  const step = {
    step: 'content-coverage',
    state: 'todo',
    code: 'coverage-holes',
    params: { holes: 3, version: '1.0.2' }
  }
  const road = [
    step,
    { step: 'published', state: 'blocked', code: 'not-published', params: {}, blockedBy: 'content-coverage' }
  ]
  const refusal = publishRefusalOf(road, release())
  assert.equal(refusal.error, 'CONTENT_COVERAGE_NOT_READY')
  assert.match(refusal.reason, /3 pieces of demo content/)
})

test('a published release only warns: never taken off for coverage', () => {
  const { contracts } = profile(null)
  const live = release({ inspiration: { template: 'ja-boxing' }, inspirationHidden: false })
  const road = roadOf(live, { contracts })
  assert.deepEqual([stepOf(road).state, stepOf(road).code], ['warn', 'coverage-not-measured'])
  const holes = profile(doc([hole()]))
  const warned = stepOf(roadOf(live, { contracts: holes.contracts }))
  assert.deepEqual([warned.state, warned.code], ['warn', 'coverage-live-holes'])
})

/** One WordPress profile of ja-boxing 1.0.2 on disk (a contract exists, so the road does not wait on it). */
function wordpressProfile(map) {
  const dir = mkdtempSync(path.join(tmpdir(), 'coverage-wp-'))
  const at = path.join(dir, 'ja-boxing', 'wp7', '1.0.2')
  mkdirSync(at, { recursive: true })
  const id = 'quickstart/ja-boxing/wp7'
  writeFileSync(
    path.join(at, 'manifest.json'),
    JSON.stringify({
      id: `${id}/1.0.2`,
      platform: 'wordpress',
      quickstart: { release: id, version: '1.0.2' }
    })
  )
  writeFileSync(path.join(at, 'content-map.json'), map)
  writeFileSync(path.join(at, 'presentation-lock.json'), LOCK)
  const wp = release({
    tag: id,
    platform: 'wordpress',
    setting: { ...release().setting, platform: 'wordpress' }
  })
  return { contracts: readContracts(dir), wp }
}

test('a platform with no content map or field map at all does not need the step', () => {
  const { contracts } = profile(null)
  const shop = release({ tag: 'quickstart/ja-boxing/shopify', platform: 'shopify' })
  assert.equal(stepOf(roadOf(shop, { contracts })).code, 'coverage-not-needed')
})

test('WordPress: holes and page hygiene are not measured, but the slot roles group is judged like on Joomla', () => {
  const { contracts, wp } = wordpressProfile(MAP)
  const missing = { state: 'missing', count: 3, shown: ['a', 'b', 'c'], reason: null }
  const ready = stepOf(roadOf(wp, { contracts, roles: { state: 'ready' } }))
  assert.deepEqual([ready.state, ready.code], ['done', 'coverage-not-needed'])
  const held = stepOf(roadOf(wp, { contracts, roles: missing }))
  assert.deepEqual(roleFields(held), ['todo', 'coverage-roles', 'missing', 3])
  assert.equal(held.params.holes, undefined)
  const none = stepOf(roadOf(wp, { contracts, roles: { state: 'none' } }))
  assert.deepEqual([none.state, none.code], ['todo', 'coverage-roles'])
  const shown = { ...wp, inspiration: { template: 'ja-boxing' }, inspirationHidden: false }
  const warned = stepOf(roadOf(shown, { contracts, roles: missing }))
  assert.deepEqual([warned.state, warned.code], ['warn', 'coverage-live-roles'])
  const blocked = {
    step: 'published',
    state: 'blocked',
    code: 'not-published',
    params: {},
    blockedBy: 'content-coverage'
  }
  assert.match(publishRefusalOf([held, blocked], wp).reason, /3 text or image slots have no role/)
})

test('WordPress: the roles are read from the content map of its own contract', () => {
  const missing = wordpressProfile(MAP_MISSING_ROLES)
  assert.deepEqual(roleFields(stepOf(roadOf(missing.wp, { contracts: missing.contracts }))), [
    'todo',
    'coverage-roles',
    'missing',
    10
  ])
  const full = wordpressProfile(MAP)
  assert.equal(stepOf(roadOf(full.wp, { contracts: full.contracts })).state, 'done')
})

test('EmDash: the roles group is judged too, whatever the contract state', () => {
  const { contracts } = profile(null)
  const emdash = release({ tag: 'tracy-base/emdash-0.x', platform: 'emdash' })
  const held = stepOf(roadOf(emdash, { contracts, roles: { state: 'none' } }))
  assert.deepEqual([held.state, held.code, held.params.rolesState], ['todo', 'coverage-roles', 'none'])
  const ready = stepOf(roadOf(emdash, { contracts, roles: { state: 'ready' } }))
  assert.deepEqual([ready.state, ready.code], ['done', 'coverage-not-needed'])
})

test('the caller may hand the coverage in (the door reads the same file once)', () => {
  const { contracts } = profile(null)
  const road = roadOf(release(), { contracts, coverage: { state: 'measured', doc: doc() } })
  assert.equal(stepOf(road).code, 'coverage-ready')
})

const live = () => release({ inspiration: { template: 'ja-boxing' }, inspirationHidden: false })

test('the road has ten steps and no separate Slot roles step', () => {
  const steps = roadOf(release(), { contracts: profile(doc()).contracts }).map((s) => s.step)
  assert.equal(steps.length, 10)
  assert.equal(steps.includes('slot-roles'), false)
  assert.deepEqual(steps, [...ROAD_STEPS])
})

test('roles group: slots without a role hold Publish for a release not shown, naming the first eight keys', () => {
  const { contracts } = profile(doc(), MAP_MISSING_ROLES)
  const r = release()
  const road = roadOf(r, { contracts })
  const step = stepOf(road)
  assert.deepEqual(roleFields(step), ['todo', 'coverage-roles', 'missing', 10])
  assert.deepEqual(
    step.params.rolesShown,
    Array.from({ length: 8 }, (_, i) => `module-100.${i + 1}`)
  )
  assert.equal(step.params.holes, 0)
  const blocked = {
    step: 'published',
    state: 'blocked',
    code: 'not-published',
    params: {},
    blockedBy: 'content-coverage'
  }
  const refusal = publishRefusalOf([step, blocked], r)
  assert.equal(refusal.error, 'CONTENT_COVERAGE_NOT_READY')
  assert.match(refusal.reason, /10 text or image slots have no role/)
  assert.match(refusal.reason, /module-100\.1/)
})

test('roles group: the same release shown on Design inspiration only warns', () => {
  const { contracts } = profile(doc(), MAP_MISSING_ROLES)
  const step = stepOf(roadOf(live(), { contracts }))
  assert.deepEqual(roleFields(step), ['warn', 'coverage-live-roles', 'missing', 10])
})

test('roles group: a content map with full roles passes it', () => {
  const step = stepOf(roadOf(release(), { contracts: profile(doc()).contracts }))
  assert.deepEqual(roleFields(step), ['done', 'coverage-ready', 'ready', 0])
})

test('roles group: a contract with no roles anywhere holds a new release and warns a live one', () => {
  const { contracts } = profile(doc(), MAP_WITHOUT_ROLES)
  const held = stepOf(roadOf(release(), { contracts }))
  assert.deepEqual([held.state, held.code, held.params.rolesState], ['todo', 'coverage-roles', 'none'])
  const blocked = {
    step: 'published',
    state: 'blocked',
    code: 'not-published',
    params: {},
    blockedBy: 'content-coverage'
  }
  assert.match(publishRefusalOf([held, blocked], release()).reason, /declares no slot roles/)
  const warned = stepOf(roadOf(live(), { contracts }))
  assert.deepEqual(
    [warned.state, warned.code, warned.params.rolesState],
    ['warn', 'coverage-live-roles', 'none']
  )
})

test('roles group: holes and page hygiene keep their verdicts, and roles ride along in the same step', () => {
  const { contracts } = profile(doc([hole()]), MAP_MISSING_ROLES)
  const held = stepOf(roadOf(release(), { contracts }))
  assert.deepEqual(
    [held.state, held.code, held.params.holes, held.params.rolesCount],
    ['todo', 'coverage-holes', 1, 10]
  )
  const blocked = {
    step: 'published',
    state: 'blocked',
    code: 'not-published',
    params: {},
    blockedBy: 'content-coverage'
  }
  const reason = publishRefusalOf([held, blocked], release()).reason
  assert.match(reason, /1 piece of demo content/)
  assert.match(reason, /10 text or image slots have no role/)
  const warned = stepOf(roadOf(live(), { contracts }))
  assert.deepEqual([warned.state, warned.code], ['warn', 'coverage-live-holes'])
  // roles fine, holes unchanged: exactly today's verdicts
  const holesOnly = stepOf(roadOf(release(), { contracts: profile(doc([hole()])).contracts }))
  assert.deepEqual(
    [holesOnly.state, holesOnly.code, holesOnly.params.rolesState],
    ['todo', 'coverage-holes', 'ready']
  )
})

test('roles group: an invalid declaration is reported with its reason', () => {
  const map = JSON.stringify({
    roleVocabularyVersion: 'place-content-roles/2',
    slots: [{ key: 'a', type: 'text', role: 'not.a.role' }]
  })
  const step = stepOf(roadOf(release(), { contracts: profile(doc(), map).contracts }))
  assert.deepEqual([step.state, step.code, step.params.rolesState], ['todo', 'coverage-roles', 'invalid'])
  assert.match(step.params.rolesReason, /unknown role/)
  const blocked = {
    step: 'published',
    state: 'blocked',
    code: 'not-published',
    params: {},
    blockedBy: 'content-coverage'
  }
  assert.match(publishRefusalOf([step, blocked], release()).reason, /unknown role/)
})

test('roles group: a stale sidecar is reported, a current one with no gaps passes', () => {
  const { contracts, at } = profile(doc(), MAP_WITHOUT_ROLES)
  writeFileSync(
    path.join(at, 'slot-roles.json'),
    JSON.stringify({
      schemaVersion: 'tracy-quickstart-slot-roles/v1',
      roleVocabularyVersion: 'place-content-roles/1',
      contract: `${TAG}/1.0.2`,
      baseHash: '0'.repeat(64),
      baseFiles: {},
      status: 'checked',
      groups: [],
      bindings: []
    })
  )
  const step = stepOf(roadOf(release(), { contracts }))
  assert.deepEqual([step.state, step.code, step.params.rolesState], ['todo', 'coverage-roles', 'stale'])
  assert.ok(step.params.rolesReason.length > 0)
})

test('roles group: the caller may hand the roles in', () => {
  const { contracts } = profile(doc())
  const roles = { state: 'missing', count: 2, shown: ['x', 'y'], reason: null }
  const step = stepOf(roadOf(release(), { contracts, roles }))
  assert.deepEqual(roleFields(step), ['todo', 'coverage-roles', 'missing', 2])
})
