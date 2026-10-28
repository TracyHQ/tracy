/**
 * Content coverage (owner 24/10/2026): the Road to live step that holds Publish while the content
 * contract leaves demo text, images or links undeclared. The audit writes `content-coverage.json`
 * beside the contract; `src/lib/content-coverage/` reads it, checks it measured THIS map and lock,
 * and judges it with `policy.json`.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { holeBlocks, judgeCoverage } from '../src/lib/content-coverage/judge.js'
import { coverageOfContract } from '../src/lib/content-coverage/reader.js'
import { readContracts } from '../src/lib/contracts.js'
import { publishRefusalOf, ROAD_STEPS, roadOf } from '../src/lib/road-to-live.js'

const TAG = 'quickstart/ja-boxing/j6'
/**
 * A content map whose every text and image slot has a role (ADR 0038) and a Slot fit (ADR 0039): the fixture of a
 * release that passes.
 */
const MAP = JSON.stringify({
  roleVocabularyVersion: 'place-content-roles/2',
  slotFitVersion: 'slot-fit/1',
  slots: [{ key: 'a', type: 'text', role: 'editorial.heading', fit: { measured: false } }]
})
/** A content map of a contract released before ADR 0038: it declares no roles anywhere. */
const MAP_WITHOUT_ROLES = '{"slots":[{"key":"a","type":"text"}]}'
/** A content map that declares roles but leaves ten text slots without one. */
const MAP_MISSING_ROLES = JSON.stringify({
  roleVocabularyVersion: 'place-content-roles/2',
  slots: [
    { key: 'a', type: 'text', role: 'editorial.heading' },
    ...Array.from({ length: 10 }, (_, i) => ({
      key: `module-100.${i + 1}`,
      type: 'text',
      fit: { measured: false }
    }))
  ],
  slotFitVersion: 'slot-fit/1'
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

test('the reader re-reads a map written in the same clock tick as its last read', () => {
  const { contracts } = profile(doc())
  const contract = [...contracts.values()][0]
  const mapFile = path.join(contract.dir, 'content-map.json')
  // A write just now, in whole milliseconds, so restoring the time below gives back exactly the same stamp.
  const tick = new Date(Math.floor(Date.now()))
  utimesSync(mapFile, tick, tick)
  assert.equal(coverageOfContract(contract).state, 'measured')
  // Same size, same modification time: only the bytes differ, as when two writes share a tick.
  const original = readFileSync(mapFile, 'utf8')
  const sameLength = original.includes('\n') ? original.replace('\n', ' ') : `${original.slice(0, -1)} `
  assert.equal(sameLength.length, original.length)
  writeFileSync(mapFile, sameLength)
  utimesSync(mapFile, tick, tick)
  assert.equal(coverageOfContract(contract).state, 'stale')
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

test("WordPress: the audit result is read like Joomla's, and the slot roles group is judged beside it", () => {
  const { contracts, wp } = wordpressProfile(MAP)
  const measured = { state: 'measured', doc: doc() }
  const missing = { state: 'missing', count: 3, shown: ['a', 'b', 'c'], reason: null }
  const ready = stepOf(roadOf(wp, { contracts, coverage: measured, roles: { state: 'ready' } }))
  assert.deepEqual([ready.state, ready.code], ['done', 'coverage-ready'])
  const held = stepOf(roadOf(wp, { contracts, coverage: measured, roles: missing }))
  assert.deepEqual(roleFields(held), ['todo', 'coverage-roles', 'missing', 3])
  assert.equal(held.params.holes, 0)
  const none = stepOf(roadOf(wp, { contracts, coverage: measured, roles: { state: 'none' } }))
  assert.deepEqual([none.state, none.code], ['todo', 'coverage-roles'])
  const shown = { ...wp, inspiration: { template: 'ja-boxing' }, inspirationHidden: false }
  const warned = stepOf(roadOf(shown, { contracts, coverage: measured, roles: missing }))
  assert.deepEqual([warned.state, warned.code], ['warn', 'coverage-live-roles'])
  const holes = stepOf(roadOf(wp, { contracts, coverage: { state: 'measured', doc: doc([hole()]) } }))
  assert.deepEqual([holes.state, holes.code, holes.params.holes], ['todo', 'coverage-holes', 1])
  const blocked = {
    step: 'published',
    state: 'blocked',
    code: 'not-published',
    params: {},
    blockedBy: 'content-coverage'
  }
  assert.match(publishRefusalOf([held, blocked], wp).reason, /3 text or image slots have no role/)
})

test('WordPress: a contract with no measurement waits for the audit, a live one only warns', () => {
  const { contracts, wp } = wordpressProfile(MAP)
  const none = stepOf(roadOf(wp, { contracts }))
  assert.deepEqual([none.state, none.code], ['todo', 'coverage-not-measured'])
  const shown = { ...wp, inspiration: { template: 'ja-boxing' }, inspirationHidden: false }
  const warned = stepOf(roadOf(shown, { contracts }))
  assert.deepEqual([warned.state, warned.code], ['warn', 'coverage-not-measured'])
})

test('WordPress: the roles are read from the content map of its own contract', () => {
  const measured = { state: 'measured', doc: doc() }
  const missing = wordpressProfile(MAP_MISSING_ROLES)
  assert.deepEqual(
    roleFields(stepOf(roadOf(missing.wp, { contracts: missing.contracts, coverage: measured }))),
    ['todo', 'coverage-roles', 'missing', 10]
  )
  const full = wordpressProfile(MAP)
  assert.equal(stepOf(roadOf(full.wp, { contracts: full.contracts, coverage: measured })).state, 'done')
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

// The Slot fit group (ADR 0039 decision 7): a fourth group of Content coverage, judged like roles.

/** Text and image slots with roles; `fitOf(i)` gives the fit of slot i (undefined: none); `version`: slotFitVersion. */
function fitMap(count, fitOf, version = 'slot-fit/1') {
  return JSON.stringify({
    roleVocabularyVersion: 'place-content-roles/2',
    ...(version ? { slotFitVersion: version } : {}),
    slots: Array.from({ length: count }, (_, i) => {
      const fit = fitOf(i)
      return {
        key: `module-200.${i + 1}`,
        type: 'text',
        role: 'editorial.heading',
        ...(fit ? { fit } : {})
      }
    })
  })
}
/** Roles on every slot, no Slot fit anywhere: every contract captured before ADR 0039, such as JA Boxing 1.0.5. */
const MAP_WITHOUT_FIT = fitMap(12, () => undefined, null)
/** Slot fit declared, ten of twelve slots without a fit. */
const MAP_MISSING_FIT = fitMap(12, (i) => (i < 2 ? { measured: false } : undefined))
/** A picture measured as a photo that still carries customize "keep": the flag disagrees with its kind. */
const MAP_KEEP_DISAGREES = JSON.stringify({
  roleVocabularyVersion: 'place-content-roles/2',
  slotFitVersion: 'slot-fit/1',
  slots: [
    { key: 'a', type: 'text', role: 'editorial.heading', fit: { measured: false } },
    {
      key: 'article-12.image_intro',
      type: 'image',
      role: 'editorial.decorative_image',
      customize: 'keep',
      fit: { measured: false, kind: 'photo', replace: 'photo' }
    }
  ]
})
const fitFields = (step) => [step.state, step.code, step.params.fitState, step.params.fitCount]
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

test('fit group: a content map without Slot fit holds a release not shown, naming Slot fit and the first keys', () => {
  const { contracts } = profile(doc(), MAP_WITHOUT_FIT)
  const step = stepOf(roadOf(release(), { contracts }))
  assert.deepEqual(fitFields(step), ['todo', 'coverage-fit', 'none', 12])
  assert.deepEqual(
    step.params.fitShown,
    Array.from({ length: 8 }, (_, i) => `module-200.${i + 1}`)
  )
  assert.deepEqual(
    [step.params.fitHolds, step.params.fitWarns, step.params.rolesState],
    [true, false, 'ready']
  )
  const refusal = refusalOf(step, release())
  assert.equal(refusal.error, 'CONTENT_COVERAGE_NOT_READY')
  assert.match(refusal.reason, /Slot fit/)
  assert.match(refusal.reason, /declares no Slot fit/)
  assert.match(refusal.reason, /--fit/)
})

test('fit group: the same release shown on Design inspiration only warns', () => {
  const { contracts } = profile(doc(), MAP_WITHOUT_FIT)
  const step = stepOf(roadOf(live(), { contracts }))
  assert.deepEqual(fitFields(step), ['warn', 'coverage-live-fit', 'none', 12])
  assert.deepEqual([step.params.fitHolds, step.params.fitWarns], [false, true])
})

test('fit group: slots without a fit in a map that declares Slot fit are counted and named', () => {
  const { contracts } = profile(doc(), MAP_MISSING_FIT)
  const step = stepOf(roadOf(release(), { contracts }))
  assert.deepEqual(fitFields(step), ['todo', 'coverage-fit', 'missing', 10])
  assert.equal(step.params.fitShown.length, 8)
  assert.equal(step.params.fitShown[0], 'module-200.3')
  const reason = refusalOf(step, release()).reason
  assert.match(reason, /Slot fit: 10 text or image slots have no fit \(module-200\.3/)
  assert.match(reason, /\.\.\.\)/)
})

test('fit group: a keep flag that disagrees with the measured kind is invalid, with its reason', () => {
  const { contracts } = profile(doc(), MAP_KEEP_DISAGREES)
  const step = stepOf(roadOf(release(), { contracts }))
  assert.deepEqual(fitFields(step), ['todo', 'coverage-fit', 'invalid', 0])
  assert.match(step.params.fitReason, /must not carry customize "keep"/)
  assert.match(refusalOf(step, release()).reason, /Slot fit .*not valid.*customize "keep"/)
  const warned = stepOf(roadOf(live(), { contracts }))
  assert.deepEqual([warned.state, warned.code], ['warn', 'coverage-live-fit'])
})

test('fit group: a map with roles and a full Slot fit passes the step', () => {
  const full = fitMap(3, () => ({ measured: false }))
  const step = stepOf(roadOf(release(), { contracts: profile(doc(), full).contracts }))
  assert.deepEqual(fitFields(step), ['done', 'coverage-ready', 'ready', 0])
  assert.deepEqual([step.params.fitHolds, step.params.fitWarns], [false, false])
})

test('fit group: roles come first, and the refusal names both groups when both hold', () => {
  const { contracts } = profile(doc(), MAP_WITHOUT_ROLES)
  const step = stepOf(roadOf(release(), { contracts }))
  assert.deepEqual(
    [step.code, step.params.rolesState, step.params.fitState, step.params.fitHolds],
    ['coverage-roles', 'none', 'none', true]
  )
  const reason = refusalOf(step, release()).reason
  assert.match(reason, /declares no slot roles/)
  assert.match(reason, /Slot fit: the content map declares no Slot fit/)
})

test('fit group: holes keep their verdict, and Slot fit rides along in the refusal', () => {
  const { contracts } = profile(doc([hole()]), MAP_WITHOUT_FIT)
  const step = stepOf(roadOf(release(), { contracts }))
  assert.deepEqual([step.code, step.params.holes, step.params.fitState], ['coverage-holes', 1, 'none'])
  const reason = refusalOf(step, release()).reason
  assert.match(reason, /1 piece of demo content/)
  assert.match(reason, /Slot fit/)
})

test('fit group: WordPress and EmDash are not judged until their audit measures Slot fit', () => {
  const { contracts, wp } = wordpressProfile(MAP_WITHOUT_FIT)
  const step = stepOf(roadOf(wp, { contracts, coverage: { state: 'measured', doc: doc() } }))
  assert.deepEqual(
    [step.state, step.code, step.params.fitState, step.params.fitHolds],
    ['done', 'coverage-ready', 'not-applicable', false]
  )
})

test('fit group: the caller may hand the fit in', () => {
  const { contracts } = profile(doc())
  const fit = { state: 'missing', count: 2, shown: ['x', 'y'] }
  const step = stepOf(roadOf(release(), { contracts, fit }))
  assert.deepEqual(fitFields(step), ['todo', 'coverage-fit', 'missing', 2])
})

test('fit group: the released JA Boxing 1.0.5 contract has no Slot fit, so it warns while live and holds otherwise', () => {
  const contracts = readContracts(
    path.join(import.meta.dirname, '../../../packages/cms/tracy-joomla-quickstart/contracts')
  )
  const at = (over) => release({ setting: { ...release().setting, version: '1.0.5' }, ...over })
  const shown = stepOf(
    roadOf(at({ inspiration: { template: 'ja-boxing' }, inspirationHidden: false }), { contracts })
  )
  assert.equal(shown.state, 'warn')
  assert.deepEqual([shown.params.fitState, shown.params.fitHolds], ['none', false])
  assert.ok(shown.params.fitCount > 1000)
  const hidden = stepOf(roadOf(at({}), { contracts }))
  assert.equal(hidden.state, 'todo')
  assert.deepEqual([hidden.params.fitState, hidden.params.fitHolds], ['none', true])
})

test('fit group: the released JA Boxing 1.0.7 contract carries a complete Slot fit, so nothing holds and the hero boxer asks for a cut-out', () => {
  const root = path.join(import.meta.dirname, '../../../packages/cms/tracy-joomla-quickstart/contracts')
  const contracts = readContracts(root)
  const at = (over) => release({ setting: { ...release().setting, version: '1.0.7' }, ...over })
  const hidden = stepOf(roadOf(at({}), { contracts }))
  assert.equal(hidden.params.fitState, 'ready')
  assert.equal(hidden.params.fitHolds, false)
  const map = JSON.parse(readFileSync(path.join(root, 'ja-boxing/j6/1.0.7/content-map.json'), 'utf8'))
  assert.equal(map.slotFitVersion, 'slot-fit/1')
  const hero = map.slots.find((slot) => slot.key === 'module-156.1')
  assert.ok(hero, 'the hero boxer slot is in the map')
  assert.equal(hero.fit.kind, 'cutout')
  assert.equal(hero.fit.transparent, true)
})
