// Which build path a site takes (#598): from data only. Every template here is invented.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BUILD_PATHS,
  aiQuickstartOfTemplate,
  aiQuickstartPinsOf,
  buildPathFor,
  fittingAiQuickstarts,
  pinnedAiQuickstarts,
  quickstartTemplateKey
} from '../domain/build-path.mjs'
import * as domain from '../domain/index.mjs'

/** One template as the reader hands it on: the pin reader's answer and the pinned folder's parsed manifest. */
const kit = (slug, version, manifest = {}, pin = { ok: true, version }) => ({
  slug,
  cms: 'j6',
  pin,
  manifest: {
    released: true,
    template: { slug, name: `Example ${slug}`, version },
    trades: ['fitness'],
    ...manifest
  }
})
const notPinned = { ok: false, problems: [{ code: 'not_pinned', message: 'no pin' }] }

const DATA = { templates: [kit('example-ring', '2.0.1')] }

test('a pinned AI quickstart that fits the trade takes the new path', () => {
  const quickstarts = pinnedAiQuickstarts(DATA)
  const answer = buildPathFor({ trade: 'fitness', quickstarts })
  assert.equal(answer.path, BUILD_PATHS.aiQuickstart)
  assert.equal(answer.quickstart.key, 'example-ring/j6')
  assert.equal(answer.quickstart.version, '2.0.1')
})

test('a trade no pinned AI quickstart declares takes the current path', () => {
  const quickstarts = pinnedAiQuickstarts(DATA)
  for (const trade of ['food', 'other', '', undefined, null, 7])
    assert.deepEqual(buildPathFor({ trade, quickstarts }), {
      path: BUILD_PATHS.current,
      quickstart: null,
      fitting: []
    })
  assert.equal(buildPathFor({ trade: 'fitness', quickstarts: [] }).path, BUILD_PATHS.current)
})

test('an unpinned, unreleased or mislabelled kit is not on the new path, and says why', () => {
  const cases = [
    ['not pinned', kit('example-ring', '2.0.1', {}, notPinned), 'not_pinned'],
    [
      'files changed since the pin',
      kit('example-ring', '2.0.1', {}, { ok: false, problems: [{ code: 'kit_files_differ', message: 'x' }] }),
      'kit_files_differ'
    ],
    ['no pin answer', { ...kit('example-ring', '2.0.1'), pin: undefined }, 'not_pinned'],
    ['not released', kit('example-ring', '2.0.1', { released: false }), 'not_released'],
    ['released as text', kit('example-ring', '2.0.1', { released: 'true' }), 'not_released'],
    [
      'manifest names another version',
      kit('example-ring', '2.0.1', { template: { slug: 'example-ring', version: '9.9.9' } }),
      'manifest_mismatch'
    ],
    ['no manifest', { ...kit('example-ring', '2.0.1'), manifest: null }, 'manifest_unreadable']
  ]
  for (const [why, template, code] of cases) {
    const read = aiQuickstartPinsOf({ templates: [template] })
    assert.deepEqual(read.pinned, [], why)
    assert.deepEqual(
      read.refused.map((r) => [r.key, r.problems[0].code]),
      [['example-ring/j6', code]],
      why
    )
    const quickstarts = read.pinned
    assert.equal(buildPathFor({ trade: 'fitness', quickstarts }).path, BUILD_PATHS.current, why)
    assert.equal(aiQuickstartOfTemplate({ quickstart: 'quickstart/example-ring/j6', quickstarts }), null, why)
  }
})

test('the version is the pinned one, not the one the folder happens to be', () => {
  const [q] = pinnedAiQuickstarts({ templates: [kit('example-ring', '2.0.1')] })
  assert.equal(q.version, '2.0.1')
  const other = kit('example-ring', '2.0.1', {}, { ok: true, version: '2.0.0' })
  assert.deepEqual(pinnedAiQuickstarts({ templates: [other] }), [], 'the manifest names 2.0.1, the pin 2.0.0')
})

test('a manifest that declares no trade fits nothing', () => {
  for (const trades of [undefined, [], 'fitness', [3, '']]) {
    const quickstarts = pinnedAiQuickstarts({ templates: [kit('example-ring', '2.0.1', { trades })] })
    assert.equal(quickstarts.length, 1, 'still pinned: the create door may build it')
    assert.equal(buildPathFor({ trade: 'fitness', quickstarts }).path, BUILD_PATHS.current, String(trades))
  }
})

test('two that fit: the first in code point order of slug and cms, whatever order the data came in', () => {
  const templates = [kit('example-ring', '2.0.1'), kit('example-dojo', '1.4.0')]
  const forward = buildPathFor({ trade: 'fitness', quickstarts: pinnedAiQuickstarts({ templates }) })
  const backward = buildPathFor({
    trade: 'fitness',
    quickstarts: pinnedAiQuickstarts({ templates: [...templates].reverse() })
  })
  assert.equal(forward.quickstart.key, 'example-dojo/j6')
  assert.deepEqual(forward, backward)
  assert.deepEqual(
    forward.fitting.map((q) => q.key),
    ['example-dojo/j6', 'example-ring/j6']
  )
  // An order given by hand is sorted again.
  const handOrder = pinnedAiQuickstarts({ templates }).reverse()
  assert.equal(fittingAiQuickstarts({ trade: 'fitness', quickstarts: handOrder })[0].key, 'example-dojo/j6')
})

test('a second invented template becomes eligible by adding data only', () => {
  const before = pinnedAiQuickstarts(DATA)
  assert.equal(buildPathFor({ trade: 'education', quickstarts: before }).path, BUILD_PATHS.current)
  const after = pinnedAiQuickstarts({
    templates: [...DATA.templates, kit('example-classroom', '0.3.0', { trades: ['education'] })]
  })
  const answer = buildPathFor({ trade: 'education', quickstarts: after })
  assert.equal(answer.path, BUILD_PATHS.aiQuickstart)
  assert.equal(answer.quickstart.key, 'example-classroom/j6')
  assert.equal(
    aiQuickstartOfTemplate({ quickstart: 'quickstart/example-classroom/j6', quickstarts: after }).version,
    '0.3.0'
  )
  // The first one is unchanged.
  assert.equal(buildPathFor({ trade: 'fitness', quickstarts: after }).quickstart.key, 'example-ring/j6')
})

test('the create door finds a template by its quickstart tag, with or without a version', () => {
  const quickstarts = pinnedAiQuickstarts(DATA)
  for (const tag of [
    'quickstart/example-ring/j6',
    'example-ring/j6',
    'example-ring/j6/2.0.1',
    'example-ring/j6@2.0.1',
    'ai-quickstart/example-ring/j6',
    'local/ai-quickstart/example-ring/j6',
    'local/quickstart/example-ring/j6'
  ])
    assert.equal(aiQuickstartOfTemplate({ quickstart: tag, quickstarts })?.key, 'example-ring/j6', tag)
  for (const tag of [
    'example-ring/wp7',
    'example-ring/j6-extra',
    'example-other/j6',
    'ai-quickstart/example-other/j6',
    'local/example-other/j6',
    '',
    undefined,
    4
  ])
    assert.equal(aiQuickstartOfTemplate({ quickstart: tag, quickstarts }), null, String(tag))
  assert.equal(quickstartTemplateKey('quickstart/example-ring/j6/v1.2'), 'example-ring/j6')
})

test('the domain index exports the build path chooser', () => {
  assert.equal(domain.buildPathFor, buildPathFor)
  assert.equal(domain.pinnedAiQuickstarts, pinnedAiQuickstarts)
  assert.equal(domain.aiQuickstartOfTemplate, aiQuickstartOfTemplate)
})
