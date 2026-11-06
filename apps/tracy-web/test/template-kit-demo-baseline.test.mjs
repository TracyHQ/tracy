/**
 * The demo baseline beside the contract (ADR 0044, decision 8; #419): measured at step 0 on the untouched quickstart site,
 * committed as `demo-baseline.json` next to `template-kit.json`, and asked for by the Template kit step only for the
 * templates `demo-baseline-policy.json` opts in. An opted in release without it is held from Publish; one already
 * published only warns; every other template reads exactly as before. The contracts here are made up, except the last
 * test, which reads the committed JA Boxing 1.0.11 file.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { defaultContracts, readContracts } from '../src/lib/contracts.js'
import { publishRefusalOf, roadOf } from '../src/lib/road-to-live.js'
import {
  BASELINE_FILE,
  DEMO_BASELINE_POLICY,
  baselineOfRelease
} from '../src/lib/template-kit/demo-baseline-file.js'
import { imagesDigest } from '../src/lib/template-kit/reader.js'
import { kitZipName } from '../src/lib/template-kit-images.js'
import { KIT_STEP, templateKitRefusal } from '../src/lib/template-kit/road-step.js'
import { FLOW_SITE, frontGroup } from './_template-kit-flow-site.mjs'

const OPTED = 'quickstart/ja-boxing/j6'
const OTHER = 'quickstart/ja-sample/j6'
const sha = (s) => createHash('sha256').update(s).digest('hex')
const IMAGES = [
  { id: 'page-home-1440', path: 'pages/home-1440.png', sha256: sha('home-1440') },
  { id: 'page-home-390', path: 'pages/home-390.png', sha256: sha('home-390') }
]
const LOOK = { image: 'pages/home-1440.png', sha256: sha('home-1440'), text: 'A wide photo with one button.' }

/** An approved, complete kit of `version` with a clean site part. */
const kit = (version) => ({
  kitVersion: '1.0.0',
  template: { name: 'ja_sample', version: '1.1.0' },
  quickstart: { product: 'sample', version },
  images: IMAGES,
  site: FLOW_SITE,
  pageGroups: [frontGroup('home')],
  pages: [{ id: 'home', path: '/', images: { 1440: 'page-home-1440', 390: 'page-home-390' }, look: LOOK }],
  blocks: [{ id: 'hero', images: { 1440: 'page-home-1440', 390: 'page-home-390' }, look: LOOK }],
  errors: [],
  approval: { by: 'reviewer-one', at: '2026-10-30T10:00:00.000Z', imagesSha256: imagesDigest(IMAGES) }
})

/** A measured baseline of a made-up quickstart version, in the shape the contract file keeps. */
const baselineDoc = (contractId, over = {}) => ({
  schema: 'demo-baseline/1',
  quickstart: contractId,
  source: 'host',
  texts: ['0123456789abcdef'],
  labels: [],
  pictures: { files: ['images/demo/hero.jpg'], shas: ['f'.repeat(64)] },
  unread: [],
  over: [],
  blocks: [],
  textBlocks: [],
  maps: [],
  ...over
})

/**
 * One contract of `tag` at 9.0.1 on disk with an approved kit; `baseline` is written beside it unless null (a string is
 * written as it is).
 */
function contractsOf(tag, baseline) {
  const dir = mkdtempSync(path.join(tmpdir(), 'kit-baseline-'))
  const id = `${tag.split('/').slice(-2).join('/')}/9.0.1`
  const at = path.join(dir, id)
  mkdirSync(at, { recursive: true })
  const map = '{"slots":[{"key":"a","type":"text","role":"editorial.heading"}]}'
  const lock = '{"entities":{}}'
  writeFileSync(
    path.join(at, 'manifest.json'),
    JSON.stringify({
      schemaVersion: 'tracy-quickstart-contract/v1',
      id,
      platform: 'joomla',
      quickstart: { release: tag, version: '9.0.1' },
      coworkMinVersion: '0.8.0'
    })
  )
  writeFileSync(path.join(at, 'content-map.json'), map)
  writeFileSync(path.join(at, 'presentation-lock.json'), lock)
  writeFileSync(path.join(at, 'template-kit.json'), JSON.stringify(kit('9.0.1')))
  if (baseline !== null)
    writeFileSync(
      path.join(at, BASELINE_FILE),
      typeof baseline === 'string' ? baseline : JSON.stringify(baseline(id))
    )
  return readContracts(dir)
}

const release = (tag, over = {}) => ({
  tag,
  name: 'Sample',
  kind: 'quickstart',
  github: 'published',
  tracy: 'ready',
  assets: [{ name: 'w.tar.gz' }, { name: kitZipName(kit('9.0.1')) }],
  setting: {
    platform: 'joomla',
    version: '9.0.1',
    template: 'sample',
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

const READY = { state: 'ready' }
const MEASURED = { state: 'measured', doc: { holes: [], hygiene: [], pages: {}, counts: {}, coverage: {} } }
const roadFor = (rel, contracts) =>
  roadOf(rel, { contracts, roles: READY, fit: READY, coverage: MEASURED, kitMap: null })
const kitStepOf = (road) => road.find((s) => s.step === KIT_STEP)
const verdict = (rel, contracts) => {
  const step = kitStepOf(roadFor(rel, contracts))
  return [step.state, step.code]
}

test('only JA Boxing is opted in', () => {
  // test-quality: contract only JA Boxing is opted in to the demo baseline publish hold (product decision, #419)
  assert.deepEqual(DEMO_BASELINE_POLICY.holdPublishFor, [OPTED])
})

test('an opted in template without demo-baseline.json is held from Publish by the Template kit step', () => {
  const rel = release(OPTED)
  const road = roadFor(rel, contractsOf(OPTED, null))
  const step = kitStepOf(road)
  assert.deepEqual([step.state, step.code], ['todo', 'kit-demo-baseline-missing'])
  assert.match(step.params.reason, /demo-baseline\.json/)
  assert.deepEqual(
    step.params.flowGaps.map((g) => g.code),
    ['kit-demo-baseline-missing']
  )
  const refusal = templateKitRefusal(step)
  assert.equal(refusal.error, 'TEMPLATE_KIT_NOT_READY')
  assert.match(refusal.reason, /template-kit baseline/)
  assert.doesNotMatch(refusal.reason, /[–—]| - /)
  // The door answers with the kit's refusal once the kit is the first thing Publish waits on.
  const kitFirst = road.map((s) =>
    s.step === 'listing'
      ? { ...s, state: 'done' }
      : s.step === 'published'
        ? { ...s, blockedBy: KIT_STEP }
        : s
  )
  assert.equal(publishRefusalOf(kitFirst, rel)?.error, 'TEMPLATE_KIT_NOT_READY')
})

test('an opted in template with its demo-baseline.json passes the step', () => {
  assert.deepEqual(verdict(release(OPTED), contractsOf(OPTED, baselineDoc)), ['done', 'kit-approved'])
})

test('a baseline file that is unreadable, of another version, or only the kit stopgap holds like a missing one', () => {
  const held = (file) => verdict(release(OPTED), contractsOf(OPTED, file))
  assert.deepEqual(held('{ not json'), ['todo', 'kit-demo-baseline-missing'])
  assert.deepEqual(
    held((id) => baselineDoc(id, { quickstart: 'ja-boxing/j6/9.0.0' })),
    ['todo', 'kit-demo-baseline-missing']
  )
  assert.deepEqual(
    held((id) => baselineDoc(id, { source: 'kit' })),
    ['todo', 'kit-demo-baseline-missing']
  )
  assert.deepEqual(
    held((id) => baselineDoc(id, { texts: undefined })),
    ['todo', 'kit-demo-baseline-missing']
  )
})

test('an opted in release already published only warns, it is never taken off', () => {
  const live = release(OPTED, { inspiration: { template: 'sample' }, inspirationHidden: false })
  assert.deepEqual(verdict(live, contractsOf(OPTED, null)), ['warn', 'kit-demo-baseline-missing'])
})

test('another template reads exactly as before: no file asked for, nothing held', () => {
  const contracts = contractsOf(OTHER, null)
  assert.deepEqual(verdict(release(OTHER), contracts), ['done', 'kit-approved'])
  assert.equal(kitStepOf(roadFor(release(OTHER), contracts)).params.flowGaps, undefined)
})

test('the committed JA Boxing 1.0.11 baseline is read beside its contract, with nothing of a machine in it', () => {
  const rel = { tag: OPTED, setting: { version: '1.0.11' } }
  const baseline = baselineOfRelease(rel, defaultContracts())
  assert.equal(baseline.state, 'read')
  assert.equal(baseline.doc.quickstart, 'ja-boxing/j6/1.0.11')
  assert.equal(baseline.doc.measuredAt, undefined)
  const text = JSON.stringify(baseline.doc)
  assert.doesNotMatch(text, /https?:\/\/|\b\d{1,3}(\.\d{1,3}){3}\b|\d{4}-\d{2}-\d{2}T/)
})
