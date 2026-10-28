/**
 * The label judge of the content coverage audit (spec #37, issues #44 and #46): the audit calls no model. For the slots
 * without a cached verdict it writes a judge request (crops plus slot tables); the agent that runs the release answers
 * it, and record-judge checks the answers strictly and writes the `labelJudge` block Road to live reads. Verdicts are
 * cached per slot content hash, so a rerun asks only for what changed. Every business, person, phone and page is
 * invented.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { judgeLabelJudge } from '../../../../apps/tracy-web/src/lib/content-coverage/judge.js'
import { buildCoverageFile } from '../content-coverage/lib/coverage-file.mjs'
import { prepareLabelJudge, slotHash } from '../content-coverage/lib/label-judge.mjs'
import { recordLabelJudge } from '../content-coverage/lib/label-judge-record.mjs'

const V3 = 'place-content-roles/3'
const text = (key, sample, role, extra = {}) => ({
  key,
  entity: key.replace(/\.[^.]+$/, ''),
  type: 'text',
  sample,
  role,
  ...extra
})

/** A fictional boxing club: module-12 shows coaches with a phone and a claim, module-13 the class intro. */
function mapOf(version = V3, over = {}) {
  return {
    roleVocabularyVersion: version,
    entities: [
      { key: 'module-12', kind: 'module', identity: { title: 'Our coaches', position: 'section-3' } },
      { key: 'module-13', kind: 'module', identity: { title: 'Classes', position: 'section-4' } }
    ],
    slots: [
      text('module-12.title', 'Meet the coaches', 'editorial.heading', { column: 'title' }),
      text('module-12.phone', '(555) 014-2290', 'editorial.paragraph'),
      text('module-12.claim', 'No1 boxing club since 2009', 'editorial.heading'),
      text('module-13.title', 'Find your class', 'editorial.heading', { column: 'title' }),
      text('module-13.intro', 'Train hard, rest well', 'editorial.paragraph', over.intro ?? {}),
      {
        key: 'module-13.link',
        entity: 'module-13',
        type: 'url',
        sample: '/classes',
        role: 'editorial.navigation_url'
      }
    ]
  }
}

const at = (y) => ({ visible: true, rect: { x: 40, y, w: 400, h: 30 }, selector: '' })
const item = (key, y, value) => ({
  status: 'matched',
  matchBy: 'exact',
  kind: 'text',
  value,
  slots: [key],
  viewports: { desktop: at(y), phone: at(y) }
})
const FINDINGS = {
  pages: [
    {
      n: 1,
      url: 'https://ironreed-boxing.example/',
      title: 'Ironreed Boxing Club',
      shots: {
        desktop: { file: 'shots/001-desktop.jpg', width: 1440, height: 4000 },
        phone: { file: 'shots/001-phone.jpg', width: 390, height: 6000 }
      },
      items: [
        item('module-12.title', 100, 'Meet the coaches'),
        item('module-12.phone', 150, '(555) 014-2290'),
        item('module-12.claim', 200, 'No1 boxing club since 2009'),
        item('module-13.title', 3000, 'Find your class'),
        item('module-13.intro', 3050, 'Train hard, rest well')
      ]
    }
  ]
}

const CONTRACT = {
  manifest: { id: 'quickstart/ironreed/j6/1.0.0' },
  sha256: { contentMap: 'a'.repeat(64), presentationLock: 'b'.repeat(64) },
  map: mapOf()
}

/** A crop stand-in: records what was cropped and names one file per component. */
function cropper() {
  const asked = []
  const crop = async (components) => {
    asked.push(components.map((c) => c.entity))
    return new Map(components.map((c) => [c.id, `images/${c.entity}-p${c.page}-desktop.jpg`]))
  }
  return { asked, crop }
}
const prepare = (over = {}) =>
  prepareLabelJudge({
    map: mapOf(),
    findings: FINDINGS,
    mods: {},
    previous: null,
    contract: CONTRACT,
    crop: cropper().crop,
    ...over
  })
const keysOf = (request) => request.components.flatMap((c) => c.slots.map((s) => s.key))
const entry = (block, key) => block.slots.find((s) => s.key === key)

/** The agent's answers: wrong for the phone and the claim, a finer mismatch on the intro, right for the rest. */
function answersFor(request, over = {}) {
  const say = {
    'module-12.phone': { verdict: 'wrong', suggestedRole: 'contact.phone', why: 'a phone number' },
    'module-12.claim': { verdict: 'wrong', suggestedRole: 'claim.heading', why: 'a ranking and a year' },
    'module-13.intro': { verdict: 'wrong', suggestedRole: 'editorial.heading', why: 'set as a heading' },
    ...over
  }
  return {
    judgedBy: 'agent',
    slots: keysOf(request).map((key) => ({ key, ...(say[key] ?? { verdict: 'right' }) }))
  }
}

test('the audit calls no model: it writes a request for every located slot without a cached verdict', async () => {
  const { asked, crop } = cropper()
  const { block, request } = await prepare({ crop })
  assert.deepEqual(asked, [['module-12', 'module-13']])
  assert.deepEqual(
    [block.state, block.reason, block.judgedBy, block.counts.notJudged],
    ['not-judged', 'AWAITING_AGENT', null, 5]
  )
  assert.deepEqual(keysOf(request).sort(), [
    'module-12.claim',
    'module-12.phone',
    'module-12.title',
    'module-13.intro',
    'module-13.title'
  ])
  // URL slots are left to the mechanical rules.
  assert.equal(keysOf(request).includes('module-13.link'), false)
  assert.equal(request.contract.contentMapSha256, 'a'.repeat(64))
})

test('the request carries the question, the allowed answers and per component its crop and slot table', async () => {
  const { request } = await prepare()
  assert.match(request.question, /a heading that carries a claim is claim\.heading/)
  assert.deepEqual(request.allowedVerdicts, ['right', 'wrong'])
  assert.deepEqual(
    request.allowedRoles.find((r) => r.role === 'claim.heading'),
    { role: 'claim.heading', group: 'fact' }
  )
  const unit = request.components.find((c) => c.module.entity === 'module-12')
  assert.equal(unit.crop, 'images/module-12-p1-desktop.jpg')
  assert.deepEqual(unit.page, { title: 'Ironreed Boxing Club', url: 'https://ironreed-boxing.example/' })
  assert.deepEqual(unit.module, { entity: 'module-12', title: 'Our coaches', position: 'section-3' })
  assert.deepEqual(unit.neighbours, ['Classes'])
  assert.deepEqual(unit.slots[1], {
    n: 2,
    key: 'module-12.phone',
    kind: 'text',
    sample: '(555) 014-2290',
    role: 'editorial.paragraph',
    group: null,
    fit: null
  })
})

test('record-judge takes a complete answer and writes the block Road to live reads', async () => {
  const { request } = await prepare()
  const { problems, block } = recordLabelJudge({ request, verdicts: answersFor(request) })
  assert.deepEqual(problems, [])
  assert.deepEqual(
    [block.state, block.reason, block.judgedBy, block.applies],
    ['judged', null, 'agent', true]
  )
  const phone = entry(block, 'module-12.phone')
  assert.deepEqual(
    [phone.verdict, phone.role, phone.suggested, phone.groupWrong],
    ['wrong', 'editorial.paragraph', 'contact.phone', true]
  )
  assert.deepEqual(
    [entry(block, 'module-13.intro').suggested, entry(block, 'module-13.intro').groupWrong],
    ['editorial.heading', false]
  )
  assert.deepEqual(block.counts, {
    slots: 5,
    located: 5,
    notLocated: 0,
    judged: 5,
    notJudged: 0,
    right: 2,
    wrongGroup: 2,
    mismatch: 1
  })
  const read = judgeLabelJudge({ labelJudge: block }, { live: false })
  assert.deepEqual(
    [read.state, read.holds, read.wrongGroup.length, read.mismatch.length],
    ['wrong-group', true, 2, 1]
  )
})

test('record-judge refuses a missing slot, a bad role, an unknown key and an unknown field, and writes nothing', async () => {
  const { request } = await prepare()
  const refused = (verdicts) => recordLabelJudge({ request, verdicts })
  const full = answersFor(request)

  const missing = refused({ ...full, slots: full.slots.filter((s) => s.key !== 'module-13.title') })
  assert.equal(missing.block, null)
  assert.deepEqual(missing.problems, ['module-13.title: not answered'])

  const badRole = refused(
    answersFor(request, { 'module-12.phone': { verdict: 'wrong', suggestedRole: 'business.hotline' } })
  )
  assert.equal(badRole.block, null)
  assert.match(
    badRole.problems[0],
    /module-12\.phone: suggestedRole "business\.hotline" is not a place-content-roles\/3 role/
  )

  const unknown = refused({ ...full, slots: [...full.slots, { key: 'module-99.title', verdict: 'right' }] })
  assert.deepEqual(unknown.problems, ['"module-99.title" was not asked in this request'])

  const field = refused({ ...full, model: 'some-model' })
  assert.deepEqual(field.problems, ['unknown field "model" in the verdicts file'])

  const twice = refused({ ...full, slots: [...full.slots, full.slots[0]] })
  assert.match(twice.problems[0], /answered more than once/)

  const odd = refused(answersFor(request, { 'module-12.title': { verdict: 'maybe' } }))
  assert.deepEqual(odd.problems, ['module-12.title: verdict must be "right" or "wrong"'])

  const same = refused(
    answersFor(request, { 'module-12.title': { verdict: 'wrong', suggestedRole: 'editorial.heading' } })
  )
  assert.match(same.problems[0], /suggestedRole is the current role/)
})

test('a rerun on unchanged content asks nothing: the recorded verdicts are the cache', async () => {
  const { request } = await prepare()
  const first = recordLabelJudge({ request, verdicts: answersFor(request) }).block
  const { asked, crop } = cropper()
  const again = await prepare({ crop, previous: { labelJudge: first } })
  assert.equal(again.request, null)
  assert.deepEqual(asked, [])
  assert.equal(again.block.state, 'judged')
  assert.deepEqual(again.block.slots, first.slots)
  assert.equal(again.block.judgedBy, 'agent')
})

test('a changed slot is asked again alone; the cached slots of its component are context only', async () => {
  const { request } = await prepare()
  const first = recordLabelJudge({ request, verdicts: answersFor(request) }).block
  const map = mapOf(V3, { intro: { sample: 'Train hard, then rest' } })
  const { asked, crop } = cropper()
  const second = await prepare({ map, crop, previous: { labelJudge: first } })
  assert.deepEqual(asked, [['module-13']])
  assert.deepEqual(keysOf(second.request), ['module-13.intro'])
  assert.deepEqual(second.request.components[0].alreadyJudged, [
    { n: 1, key: 'module-13.title', role: 'editorial.heading', verdict: 'right' }
  ])
  assert.deepEqual([second.block.state, second.block.counts.judged], ['partly', 4])
  const third = recordLabelJudge({
    request: second.request,
    verdicts: { slots: [{ key: 'module-13.intro', verdict: 'right' }] }
  }).block
  assert.equal(third.state, 'judged')
  assert.equal(entry(third, 'module-13.intro').hash, slotHash(map.slots[4]))
  assert.equal(entry(third, 'module-12.phone').suggested, 'contact.phone')
})

test('with --no-judge, or a version 2 map, nothing is asked and the slots stay not judged', async () => {
  const off = await prepare({ unavailable: 'NOT_RUN' })
  assert.deepEqual([off.request, off.block.state, off.block.reason], [null, 'not-judged', 'NOT_RUN'])
  assert.equal(off.block.counts.notJudged, 5)
  const v2 = await prepare({ map: mapOf('place-content-roles/2') })
  assert.deepEqual(
    [v2.request, v2.block.state, v2.block.reason, v2.block.applies],
    [null, 'not-judged', 'VOCABULARY_NOT_V3', false]
  )
})

test('the verdicts are written into the committed coverage file beside labelRules', async () => {
  const { request } = await prepare()
  const labelJudge = recordLabelJudge({ request, verdicts: answersFor(request) }).block
  const result = { pages: [], failures: [], summary: { pages: 1, mappedPages: 1, unmappedPages: 0 } }
  const doc = buildCoverageFile({ result, contract: CONTRACT, labelJudge })
  assert.ok(doc.labelRules)
  assert.equal(doc.labelJudge.state, 'judged')
  assert.equal(doc.tool.version, '1.4.0')
  assert.equal(buildCoverageFile({ result, contract: CONTRACT }).labelJudge, undefined)
})

const RECORD = join(dirname(fileURLToPath(import.meta.url)), '../content-coverage/record-judge.mjs')

test('the record-judge command writes labelJudge into the coverage file, and leaves it alone when refused', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'record-judge-'))
  const coverage = join(dir, 'content-coverage.json')
  const before = { contract: { id: CONTRACT.manifest.id, contentMapSha256: 'a'.repeat(64) }, holes: [] }
  writeFileSync(coverage, `${JSON.stringify(before, null, 2)}\n`)
  const { request } = await prepare()
  const requestFile = join(dir, 'request.json')
  writeFileSync(requestFile, JSON.stringify({ ...request, coverageFiles: [coverage] }))
  const run = (verdicts) => {
    const file = join(dir, 'verdicts.json')
    writeFileSync(file, JSON.stringify(verdicts))
    return spawnSync(process.execPath, [RECORD, '--request', requestFile, '--verdicts', file], {
      encoding: 'utf8'
    })
  }
  const bad = run({ slots: [] })
  assert.equal(bad.status, 1)
  assert.match(bad.stderr, /refused, nothing written/)
  assert.deepEqual(JSON.parse(readFileSync(coverage, 'utf8')), before)

  const good = run(answersFor(request))
  assert.equal(good.status, 0, good.stderr)
  const after = JSON.parse(readFileSync(coverage, 'utf8'))
  assert.deepEqual(after.holes, [])
  assert.deepEqual(
    [after.labelJudge.state, after.labelJudge.judgedBy, after.labelJudge.counts.wrongGroup],
    ['judged', 'agent', 2]
  )
})
