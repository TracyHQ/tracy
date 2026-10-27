/**
 * Admin attention: which quickstarts and demos need an administrator, decided from what this
 * deployment holds. Pure — every input is the shape the door reads, built by hand here.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { attentionReport, questionnaireAnalysis } from '../src/lib/admin-attention.js'

const CARD = {
  template: 'ja-nova',
  category: 'business',
  image: 'thumb.png',
  blurb: 'A site for a company.',
  layouts: [{ name: 'Home', shots: { desktop: 'home-d.png', mobile: 'home-m.png' } }]
}

/** One release as `readReleases` answers it: choosable, Ready, with a card. */
function release(tag, { platform = 'wordpress', version = '1.0.0', card = CARD, ...rest } = {}) {
  return {
    tag,
    kind: 'quickstart',
    github: 'prerelease',
    tracy: 'ready',
    reason: null,
    setting: { version, template: 'ja_nova', label: 'JA Nova' },
    inspiration: card,
    inspirationHidden: false,
    local: null,
    choosable: true,
    platform,
    ...rest
  }
}

const demoRow = (tag, { state = 'done', publish = 'published', version = '1.0.0', label = 'nova' } = {}) => ({
  site_key: `demo-${label}`,
  label,
  host: 'dev',
  quickstart_tag: tag,
  quickstart_version: version,
  publish,
  address: publish === 'published' ? `https://${label}.tracy.test/` : null,
  job_state: state,
  job_detail: state === 'failed' ? { output: 'boom: the installer died' } : null
})

const DESIGN = { id: 'clean', source: 'catalog' }

const ALL_PICTURES = new Map([
  [
    'ja-nova',
    new Map([
      ['thumb.png', 'x'],
      ['home-d.png', 'x'],
      ['home-m.png', 'x']
    ])
  ]
])

/** A world where `tag` is complete: a live demo, a contract, every picture, its own questions. */
function world(releases, overrides = {}) {
  const demos = new Map()
  const live = new Map()
  const contracts = new Map()
  const questions = new Map()
  for (const r of releases) {
    demos.set(r.tag, demoRow(r.tag, { version: r.setting.version }))
    live.set(r.tag, { url: 'https://nova.tracy.test/', version: r.setting.version })
    contracts.set(`${r.tag}@${r.setting.version}`, { id: `${r.tag}/${r.setting.version}`, design: DESIGN })
    questions.set(r.tag, { source: 'released' })
  }
  return { releases, demos, live, held: ALL_PICTURES, contracts, questions, ...overrides }
}

const checksOf = (report, key) =>
  report.subjects.find((s) => s.key === key)?.items.map((i) => `${i.severity}:${i.check}`) ?? []

test('a complete quickstart needs nothing', () => {
  const report = attentionReport(world([release('qs/ja-nova/wp7')]))
  assert.deepEqual(report.subjects, [])
  assert.equal(report.count, 0)
})

test('a quickstart with no demo is missing one, and is counted', () => {
  const w = world([release('qs/ja-nova/wp7')])
  w.demos.clear()
  w.live.clear()
  const report = attentionReport(w)
  assert.ok(checksOf(report, 'qs/ja-nova/wp7').includes('missing:no-demo'))
  assert.equal(report.count, 1)
})

test('a Joomla or WordPress quickstart with no contract is missing one; EmDash is not asked', () => {
  const wp = release('qs/ja-nova/wp7')
  const em = release('qs/base/emdash-0.x', { platform: 'emdash' })
  const w = world([wp, em])
  w.contracts.clear()
  const report = attentionReport(w)
  assert.deepEqual(checksOf(report, 'qs/ja-nova/wp7'), ['missing:no-contract'])
  assert.deepEqual(checksOf(report, 'qs/base/emdash-0.x'), [])
})

test('a contract cut for an earlier patch still covers the release', () => {
  const r = release('qs/ja-nova/wp7', { version: '1.0.5' })
  const w = world([r])
  w.contracts = new Map([['qs/ja-nova/wp7@1.0.3', { id: 'nova/1.0.3', design: DESIGN }]])
  assert.deepEqual(checksOf(attentionReport(w), 'qs/ja-nova/wp7'), [])
})

test('a failed demo build is broken, with the line the installer died on', () => {
  const w = world([release('qs/ja-nova/wp7')])
  w.demos.set('qs/ja-nova/wp7', demoRow('qs/ja-nova/wp7', { state: 'failed', publish: 'draft' }))
  w.live.clear()
  const report = attentionReport(w)
  const item = report.subjects[0].items.find((i) => i.check === 'demo-failed')
  assert.equal(item.severity, 'broken')
  assert.match(item.params.reason, /installer died/)
  assert.equal(item.params.demo, 'nova')
  // A failed demo is not ALSO "no demo": one cause, one line.
  assert.ok(!checksOf(report, 'qs/ja-nova/wp7').includes('missing:no-demo'))
})

test('a live demo whose release has no card is broken: it never reaches Design inspiration', () => {
  const w = world([release('qs/ja-nova/wp7', { inspiration: null })])
  const report = attentionReport(w)
  assert.deepEqual(checksOf(report, 'qs/ja-nova/wp7'), ['broken:not-on-inspiration'])
})

test('a card customers see with a picture missing is broken, and says which', () => {
  const w = world([release('qs/ja-nova/wp7')], { held: new Map() })
  const item = attentionReport(w).subjects[0].items[0]
  assert.equal(item.check, 'inspiration-incomplete')
  assert.equal(item.severity, 'broken')
  assert.deepEqual(item.params, {
    code: 'pictures-missing',
    missing: 3,
    total: 3,
    files: ['thumb.png', 'home-d.png', 'home-m.png']
  })
})

test('a card shown with no demo behind it is broken as well as the demo missing', () => {
  const w = world([release('qs/ja-nova/wp7')])
  w.demos.clear()
  w.live.clear()
  assert.deepEqual(checksOf(attentionReport(w), 'qs/ja-nova/wp7'), [
    'broken:inspiration-incomplete',
    'missing:no-demo'
  ])
})

test('an unpublished card with a live demo is broken: the demo is not on Design inspiration', () => {
  const w = world([release('qs/ja-nova/wp7', { inspirationHidden: true })])
  const item = attentionReport(w).subjects[0].items[0]
  assert.equal(item.check, 'inspiration-incomplete')
  assert.deepEqual(item.params, { code: 'unpublished' })
})

test('no card and no demo is a hint, not a count', () => {
  const w = world([release('qs/ja-nova/wp7', { inspiration: null })])
  w.demos.clear()
  w.live.clear()
  const report = attentionReport(w)
  assert.deepEqual(checksOf(report, 'qs/ja-nova/wp7'), ['missing:no-demo', 'hint:no-card'])
})

test('hints alone do not count: a demo behind its release', () => {
  const w = world([release('qs/ja-nova/wp7', { version: '1.2.0' })])
  w.demos.set('qs/ja-nova/wp7', demoRow('qs/ja-nova/wp7', { version: '1.1.0' }))
  w.contracts = new Map([['qs/ja-nova/wp7@1.2.0', { id: 'c', design: DESIGN }]])
  const report = attentionReport(w)
  assert.deepEqual(checksOf(report, 'qs/ja-nova/wp7'), ['hint:demo-behind'])
  assert.deepEqual(report.subjects[0].items[0].params, { demoVersion: '1.1.0', version: '1.2.0' })
  assert.equal(report.count, 0)
  assert.equal(report.counts.hint, 1)
})

test('only the standard questionnaire is missing work, and is counted (Brian, 04/10)', () => {
  const w = world([release('qs/ja-nova/wp7')])
  w.questions.clear()
  const report = attentionReport(w)
  assert.deepEqual(checksOf(report, 'qs/ja-nova/wp7'), ['missing:standard-questions'])
  assert.deepEqual(report.subjects[0].items[0].params, { platform: 'wordpress' })
  assert.equal(report.count, 1)
})

test('a contract with no design system is missing one; no contract is not reported twice', () => {
  const wp = release('qs/ja-nova/wp7')
  const j = release('qs/ja-nova/j6', { platform: 'joomla' })
  const em = release('qs/base/emdash-0.x', { platform: 'emdash' })
  const w = world([wp, j, em])
  w.contracts.set('qs/ja-nova/wp7@1.0.0', { id: 'ja-nova/wp7/1.0.0', design: null })
  w.contracts.delete('qs/ja-nova/j6@1.0.0')
  w.contracts.set('qs/base/emdash-0.x@1.0.0', { id: 'x', design: null })
  const report = attentionReport(w)
  assert.deepEqual(checksOf(report, 'qs/ja-nova/wp7'), ['missing:no-design-system'])
  assert.deepEqual(report.subjects.find((s) => s.key === 'qs/ja-nova/wp7').items[0].params, {
    contract: 'ja-nova/wp7/1.0.0'
  })
  assert.deepEqual(checksOf(report, 'qs/ja-nova/j6'), ['missing:no-contract'])
  assert.deepEqual(checksOf(report, 'qs/base/emdash-0.x'), [])
})

test('no item carries prose: params are codes and values, and the subject names its demo', () => {
  const w = world([release('qs/ja-nova/wp7', { inspiration: null })])
  w.questions.clear()
  const report = attentionReport(w)
  for (const s of report.subjects)
    for (const i of s.items) {
      assert.deepEqual(Object.keys(i).sort(), ['check', 'params', 'severity'])
    }
  assert.equal(report.subjects[0].demo, 'nova')
  assert.equal(report.subjects[0].version, '1.0.0')
  assert.equal(report.offered, 1)
})

test('a demo whose quickstart is no longer offered is broken, under the demo', () => {
  const w = world([])
  w.demos.set('qs/gone/j6', demoRow('qs/gone/j6', { label: 'gone' }))
  const report = attentionReport(w)
  assert.deepEqual(
    report.subjects.map((s) => [s.kind, s.key]),
    [['demo', 'gone']]
  )
  assert.deepEqual(checksOf(report, 'gone'), ['broken:demo-orphan'])
  assert.equal(report.count, 1)
})

test('a published quickstart Tracy cannot read is broken; drafts, design packs and local packs are left alone', () => {
  const unread = release('qs/bad/j6', {
    tracy: 'invalid',
    reason: 'version is missing',
    choosable: false,
    setting: null
  })
  const draft = release('qs/draft/j6', { github: 'draft', choosable: false })
  const pack = release('qs/airbnb/j6', {
    kind: 'design-pack',
    tracy: 'no-setting',
    choosable: false,
    setting: null
  })
  const local = release('local/nova/wp7', { local: { dir: '/x' } })
  const report = attentionReport(world([], { releases: [unread, draft, pack, local] }))
  assert.deepEqual(
    report.subjects.map((s) => s.key),
    ['qs/bad/j6']
  )
  assert.deepEqual(checksOf(report, 'qs/bad/j6'), ['broken:unreadable'])
  assert.equal(report.subjects[0].items[0].params.reason, 'version is missing')
})

test('subjects come worst first, then by key', () => {
  const a = release('qs/a/wp7')
  const b = release('qs/b/j6', { platform: 'joomla' })
  const w = world([a, b])
  w.demos.set('qs/a/wp7', demoRow('qs/a/wp7', { version: '0.9.0' }))
  w.contracts.delete('qs/b/j6@1.0.0')
  const report = attentionReport(w)
  assert.deepEqual(
    report.subjects.map((s) => s.key),
    ['qs/b/j6', 'qs/a/wp7']
  )
  assert.equal(report.subjects[0].worst, 'missing')
  assert.equal(report.subjects[1].worst, 'hint')
  assert.deepEqual(report.counts, { broken: 0, missing: 1, hint: 1 })
  assert.equal(report.count, 1)
})

// ── questionnaireAnalysis ─────────────────────────────────────────────────────────────────────

const consumer = (id, available) => ({ id, available, reads: [], why: 'x' })
const STANDARD_SET = {
  name: 'Standard joomla',
  source: 'standard',
  doc: {
    questions: [
      { id: 'name', label: { en: 'Business name', vi: 'Tên doanh nghiệp' }, feeds: ['site.name', 'agent'] },
      { id: 'about', label: { en: 'One line' }, feeds: ['copy.about', 'agent'] },
      { id: 'pages', label: { en: 'Pages', vi: 'Trang' }, feeds: ['seed.pages'] },
      { id: 'languages', label: { en: 'Site language' }, feeds: ['site.languages'] }
    ]
  }
}
const block = (key, role, label) => ({ key, kind: 'block', label, meaning: { role } })
const joomlaSnapshot = (capabilities, { sealed = true } = {}) => ({
  consumers: [
    consumer('agent', true),
    consumer('site.name', true),
    consumer('copy.about', true),
    consumer('copy.tone', true),
    consumer('seed.pages', !sealed),
    consumer('site.languages', sealed),
    consumer('template', false)
  ],
  capabilities
})

test('analysis: a sealed Joomla template with services and contact the standard set never asks about', () => {
  const a = questionnaireAnalysis({
    platform: 'joomla',
    hasContract: true,
    set: STANDARD_SET,
    snapshot: joomlaSnapshot([
      { key: 'core:name', kind: 'core', label: 'name', meaning: { role: 'identity' } },
      block('b1', 'hero', 'Welcome'),
      block('b2', 'services', 'What we do'),
      block('b3', 'services', 'Our programs'),
      block('b4', 'services', 'More'),
      block('b5', 'contact', 'Contact Info'),
      block('b6', 'navigation', 'Main menu'),
      { key: 'page:blog', kind: 'page', label: 'blog', meaning: { role: 'news' } }
    ])
  })
  assert.equal(a.setName, 'Standard joomla')
  assert.equal(a.limited, null)
  assert.deepEqual(
    a.asked.map((q) => [q.id, q.label, q.works, q.dead]),
    [
      ['name', 'Tên doanh nghiệp', true, null],
      ['about', 'One line', true, null],
      ['pages', 'Trang', false, { consumer: 'seed.pages', code: 'sealed-pages' }],
      ['languages', 'Site language', true, null]
    ]
  )
  assert.deepEqual(a.asked[0].feeds, ['site.name', 'agent'])
  assert.deepEqual(a.parts, [
    { role: 'hero', blocks: 1, pages: 0, examples: ['Welcome'], covered: true },
    { role: 'services', blocks: 3, pages: 0, examples: ['What we do', 'Our programs'], covered: false },
    { role: 'contact', blocks: 1, pages: 0, examples: ['Contact Info'], covered: false },
    { role: 'news', blocks: 0, pages: 1, examples: [], covered: false }
  ])
})

test('analysis: an unsealed Joomla release cannot use the language answer', () => {
  const a = questionnaireAnalysis({
    platform: 'joomla',
    hasContract: false,
    set: STANDARD_SET,
    snapshot: joomlaSnapshot([], { sealed: false })
  })
  assert.equal(a.limited, 'no-contract')
  assert.deepEqual(a.parts, [])
  assert.deepEqual(a.asked.find((q) => q.id === 'languages').dead, {
    consumer: 'site.languages',
    code: 'unsealed-languages'
  })
  assert.equal(a.asked.find((q) => q.id === 'pages').works, true)
})

test('analysis: a contract that declares only the identity says so', () => {
  const a = questionnaireAnalysis({
    platform: 'wordpress',
    hasContract: true,
    set: STANDARD_SET,
    snapshot: joomlaSnapshot([{ key: 'core:name', kind: 'core', label: 'n', meaning: { role: 'identity' } }])
  })
  assert.equal(a.limited, 'identity-only')
})

test('analysis: EmDash has no contract to ask for, and no copy stage', () => {
  const a = questionnaireAnalysis({
    platform: 'emdash',
    hasContract: false,
    set: STANDARD_SET,
    snapshot: {
      consumers: [
        consumer('agent', true),
        consumer('site.name', true),
        consumer('copy.about', false),
        consumer('seed.pages', false)
      ],
      capabilities: [block('f1', 'services', 'Services')]
    }
  })
  assert.equal(a.limited, null)
  assert.equal(a.asked.find((q) => q.id === 'about').works, true, 'the agent still reads it')
  assert.deepEqual(a.asked.find((q) => q.id === 'pages').dead, {
    consumer: 'seed.pages',
    code: 'emdash-no-seed'
  })
  assert.deepEqual(a.asked.find((q) => q.id === 'languages').dead, {
    consumer: 'site.languages',
    code: 'unknown-consumer'
  })
})
