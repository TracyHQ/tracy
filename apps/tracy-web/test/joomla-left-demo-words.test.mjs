// Spec TracyHQ/tracy#189 (C03, C09): on a Joomla brief build, the lines the writer left in the demo's words never reach the
// site as the demo's. They take neutral words or the business's own, through the contract; or they are emptied after it, in a
// module's JSON parameters and in an article's HTML columns alike. The templates' demos and the businesses are made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  leftDemoWords,
  planRecordSteps,
  recordSteps
} from '../src/sites/brief-engines/joomla-plan-records.js'

const steps = (i, sample) => ({
  key: `module-40.${i}`,
  entity: 'module-40',
  column: 'params',
  nestedJson: 'jatools-config',
  type: 'text',
  role: 'step.description',
  sample,
  maxCharacters: 400,
  jsonPath: ['features', 'features[description]', i]
})
const intro = {
  key: 'article-12.0',
  entity: 'article-12',
  column: 'introtext',
  type: 'text',
  role: 'editorial.paragraph',
  sample: '\r\n  Nulla pretium viverra augue, in tincidunt nibh suscipit vitae.\r\n',
  maxCharacters: 40,
  xpath: '/html/body/div/p/text()'
}
const name = {
  key: 'article-12.4',
  entity: 'article-12',
  column: 'title',
  type: 'text',
  role: 'offering.name',
  sample: 'Advanced Kickboxing',
  maxCharacters: 30,
  group: { id: 'article-12.offering', item: 0, kind: 'service' }
}
const slots = [steps(0, '((p))Wrap your hands and shadow box for three rounds.((/p))'), intro, name]
const pages = [
  {
    entity: 'menuItem-1',
    link: 'index.php?option=com_content&view=featured',
    assignedModules: [{ entity: 'module-40' }]
  },
  { entity: 'menuItem-2', link: 'index.php?option=com_content&view=article&id=12' }
]

test('a bakery on a fitness template: the left demo lines take neutral words or leave the write to be emptied', async () => {
  const kept = { 'article-12.4': 'Advanced Kickboxing' }
  const out = await leftDemoWords({
    kept,
    slots,
    asked: slots.map((s) => s.key),
    held: ['module-40.0', 'article-12.0', 'article-12.4'],
    ownText: 'Crumb and Crust Bakery, sourdough and pastries in Millbrook.',
    honesty: {},
    locale: 'en',
    business: { phone: '+44 20 7946 0001' },
    description: 'Crumb and Crust Bakery bakes sourdough and pastries in Millbrook every morning.',
    pages
  })
  assert.equal(kept['article-12.4'], 'Service')
  assert.deepEqual(
    out.blanks.map((s) => s.key),
    ['module-40.0', 'article-12.0'],
    'the description does not fit the card intro: emptied, never the demo'
  )
  assert.ok(!('module-40.0' in kept) && !('article-12.0' in kept))
})

test('emptying reaches a module’s JSON list and an article’s HTML column', () => {
  const params = {
    'jatools-config': JSON.stringify({
      features: { 'features[description]': ['((p))Wrap your hands and shadow box for three rounds.((/p))'] }
    })
  }
  const made = recordSteps({
    honesty: { blanks: [steps(0, '((p))Wrap your hands and shadow box for three rounds.((/p))'), intro] },
    modules: new Map([[40, { id: 40, params: JSON.stringify(params) }]]),
    articles: new Map([
      [
        12,
        { id: 12, introtext: '<p>\n  Nulla pretium viverra augue, in tincidunt nibh suscipit vitae.\n</p>\n' }
      ]
    ])
  })
  assert.equal(made.emptied, 2)
  assert.equal(made.unresolved, 0)
  const article = made.steps.find((s) => s.kind === 'article')
  assert.deepEqual(article, { kind: 'article', id: 12, fields: { introtext: '<p>\n  \n</p>\n' } })
  const module = made.steps.find((s) => s.kind === 'module')
  const config = JSON.parse(JSON.parse(module.fields.params)['jatools-config'])
  assert.deepEqual(config.features['features[description]'], [''])
})

test('the records write takes the left demo lines beside the plan’s own blanks, and reads the articles they name', async () => {
  const calls = []
  const apply = async (call) => {
    calls.push(call)
    if (call.action === 'content.list') return { ok: true, items: [] }
    if (call.action === 'content.get')
      return {
        ok: true,
        item: { id: 12, introtext: '<p>Nulla pretium viverra augue, in tincidunt nibh suscipit vitae.</p>' }
      }
    return { ok: true }
  }
  const ctx = { siteKey: 's', email: 'e', note: () => {}, time: () => {} }
  const made = await planRecordSteps({
    apply,
    siteKey: 's',
    ctx,
    woContent: { sitePlanFor: async () => ({ honesty: { blanks: [], hide: [], records: [] } }) },
    extraBlanks: [intro]
  })
  assert.deepEqual(made.steps, [{ kind: 'article', id: 12, fields: { introtext: '<p></p>' } }])
  assert.ok(calls.some((c) => c.action === 'content.get' && c.params.id === 12))
})
