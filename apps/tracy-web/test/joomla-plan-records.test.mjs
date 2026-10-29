// The Joomla brief engine writes the site plan's honesty decisions (spec TracyHQ/tracy#189, ticket #192): cards beyond the
// brief's people and offerings taken off, fact fields emptied, and nothing a writer invented written. The templates' demos
// and the businesses below are made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planHonesty } from 'website-opportunities/domain/site-plan-honesty.mjs'
import { honestWords, planRecordSteps, recordSteps } from '../src/sites/brief-engines/joomla-plan-records.js'

const item = (entity, list, field, index, role, kind, sample, type = 'text') => ({
  key: `${entity}.${list}.${field}.${index}`,
  entity,
  column: 'params',
  nestedJson: 'jatools-config',
  type,
  role,
  sample,
  jsonPath: [list, `${list}[${field}]`, index],
  group: { id: `${entity}.${kind}.${index}`, item: index, kind }
})

const coaches = ['Rowan Mercer', 'Ilse Varga', 'Tobin Hale', 'Petra Quill']
const contentMap = {
  entities: [
    { key: 'module-50', kind: 'module' },
    { key: 'module-60', kind: 'module' },
    { key: 'module-80', kind: 'module' },
    { key: 'article-70', kind: 'article' },
    { key: 'article-71', kind: 'article' }
  ],
  pages: [],
  slots: [
    ...coaches.flatMap((name, i) => [
      item('module-50', 'team', 'title', i, 'person.name', 'person', name),
      item('module-50', 'team', 'bio', i, 'person.bio', 'person', `${name} has fought in many rings.`)
    ]),
    ...[0, 1].map((i) =>
      item('module-60', 'plans', 'price', i, 'package.price', 'package', `$${141 + i}.00`)
    ),
    ...['Join over ', '100k', ' of inspiring fighters'].map((sample, i) => ({
      key: `module-80.${i}`,
      entity: 'module-80',
      column: 'params',
      type: 'text',
      role: ['stat.context', 'stat.value', 'stat.label'][i],
      sample,
      jsonPath: ['top-desc'],
      xpath: `/html/body/div/div/text()[${i + 1}]`,
      group: { id: 'module-80.stat.0', item: 0, kind: 'stat_item' }
    })),
    {
      key: 'module-80.3',
      entity: 'module-80',
      column: 'params',
      type: 'image',
      role: 'stat.proof_image',
      sample: 'images/demo/others/avatar-1.png',
      jsonPath: ['top-desc'],
      xpath: '/html/body/div/img/@src',
      group: { id: 'module-80.stat.0', item: 0, kind: 'stat_item' }
    },
    ...[70, 71].flatMap((n) => [
      {
        key: `article-${n}.0`,
        entity: `article-${n}`,
        column: 'title',
        type: 'text',
        role: 'offering.name',
        sample: `Boxing class ${n}`,
        group: { id: `article-${n}.offering`, item: 0, kind: 'service' }
      },
      {
        key: `article-${n}.1`,
        entity: `article-${n}`,
        column: 'attribs',
        type: 'text',
        role: 'offering.schedule',
        sample: 'MONDAY + FRIDAY',
        jsonPath: ['classes-info', 'label'],
        group: { id: `article-${n}.offering`, item: 0, kind: 'service' }
      }
    ])
  ]
}

const brief = {
  business: { name: 'Harbourline Racquet Club' },
  reading: {
    services: [{ id: 's1', label: 'Tennis', quote: 'Tennis lessons', source: { kind: 'bio' } }],
    team: [
      { id: 't1', label: 'Anouk', role: 'coach', source: { kind: 'review' } },
      { id: 't2', label: 'Dario', role: 'coach', source: { kind: 'review' } }
    ]
  }
}

const acm = (config) => JSON.stringify({ 'jatools-config': JSON.stringify(config), layout: '_:default' })
const modules = () =>
  new Map([
    [
      50,
      {
        id: 50,
        params: acm({
          team: {
            'team[columns]': ['4'],
            'team[title]': [...coaches],
            'team[bio]': coaches.map((n) => `${n} has fought in many rings.`)
          }
        })
      }
    ],
    [60, { id: 60, params: acm({ plans: { 'plans[price]': ['$141.00', '$142.00'] } }) }],
    [
      80,
      {
        id: 80,
        params: JSON.stringify({
          'top-desc':
            '<div><img src="images/demo/others/avatar-1.png" alt=""><div>Join over <span>100k</span> of inspiring fighters</div></div>'
        })
      }
    ]
  ])
const articles = () =>
  new Map([[70, { id: 70, attribs: JSON.stringify({ 'classes-info': { label: 'MONDAY + FRIDAY' } }) }]])

const honesty = () => planHonesty(brief, contentMap, { name: 'Harbourline Racquet Club' }).honesty
const stepOf = (steps, kind, id) => steps.find((s) => s.kind === kind && s.id === id)

// #189: a card taken off a JSON list is emptied where it stands, never spliced out: the contract binds each item's path,
// and a path that finds nothing makes the plugin refuse every contract write on the site.
test('the trainer list keeps one card per real person, and the kept cards lose their demo bio', () => {
  const { steps, trimmed } = recordSteps({ honesty: honesty(), modules: modules(), articles: articles() })
  const config = JSON.parse(JSON.parse(stepOf(steps, 'module', 50).fields.params)['jatools-config'])
  assert.deepEqual(
    config.team['team[title]'],
    ['Rowan Mercer', 'Ilse Varga', '', ''],
    'the names go in with the contract write; the cards beyond them are emptied in place'
  )
  assert.deepEqual(config.team['team[bio]'], ['', '', '', ''])
  assert.deepEqual(config.team['team[columns]'], ['4'], 'a setting of the list is no item')
  assert.equal(trimmed, 2)
})

test('a section with no card left, and a card that is an article of its own, are unpublished', () => {
  const { steps } = recordSteps({ honesty: honesty(), modules: modules(), articles: articles() })
  assert.deepEqual(stepOf(steps, 'module', 60).fields, { published: 0 })
  assert.deepEqual(stepOf(steps, 'article', 71).fields, { state: 0 })
  assert.equal(stepOf(steps, 'article', 70).fields.attribs, JSON.stringify({ 'classes-info': { label: '' } }))
})

test('a statistic inside an HTML field loses the demo number, its words and its proof picture', () => {
  const { steps } = recordSteps({ honesty: honesty(), modules: modules(), articles: articles() })
  const html = JSON.parse(stepOf(steps, 'module', 80).fields.params)['top-desc']
  assert.doesNotMatch(html, /100k|Join over|inspiring/)
  // The proof picture stays in place, hidden: a slot binds to it (#189, see joomla-records-keep-bound-nodes.test.mjs).
  assert.match(html, /<img hidden src="images\/demo\/others\/avatar-1\.png"/)
})

test('the clinic: a priced services list keeps the card of a real service without its price, and drops the rest', () => {
  const services = ['Whitening', 'Cleaning', 'Braces']
  const map = {
    entities: [{ key: 'module-20', kind: 'module' }],
    pages: [],
    slots: services.flatMap((s, i) => [
      item('module-20', 'services', 'title', i, 'offering.name', 'service', s),
      item('module-20', 'services', 'price', i, 'offering.price', 'service', `from $${(i + 2) * 100}`)
    ])
  }
  const clinic = {
    reading: {
      services: [
        { id: 'd1', label: 'Check-ups', source: { kind: 'bio' } },
        { id: 'd2', label: 'Cleaning', source: { kind: 'bio' } }
      ]
    }
  }
  const rows = new Map([
    [
      20,
      {
        id: 20,
        params: acm({
          services: {
            'services[title]': [...services],
            'services[price]': ['from $200', 'from $300', 'from $400']
          }
        })
      }
    ]
  ])
  const { steps } = recordSteps({ honesty: planHonesty(clinic, map).honesty, modules: rows })
  const config = JSON.parse(JSON.parse(stepOf(steps, 'module', 20).fields.params)['jatools-config'])
  assert.deepEqual(config.services['services[price]'], ['', '', ''])
  assert.deepEqual(
    config.services['services[title]'].length,
    3,
    'every bound item path still holds words or nothing'
  )
})

test('a site the plan names reads its modules once and writes the steps; a site without a plan writes nothing', async () => {
  const calls = []
  const apply = async ({ action, params }) => {
    calls.push(action)
    if (action === 'content.list') return { ok: true, items: [...modules().values()] }
    if (action === 'content.get') return { ok: true, item: articles().get(params.id) }
    return { ok: true }
  }
  const notes = []
  const ctx = { siteKey: 's', email: 'e', note: (n) => notes.push(n) }
  const made = await planRecordSteps({
    apply,
    siteKey: 's',
    ctx,
    woContent: { sitePlanFor: async () => ({ honesty: honesty() }) }
  })
  assert.ok(made.steps.length >= 4)
  assert.ok(notes.some((n) => /taken off/.test(n)))
  const none = await planRecordSteps({
    apply,
    siteKey: 's',
    ctx,
    woContent: { sitePlanFor: async () => null }
  })
  assert.deepEqual(none.steps, [])
})

test('the words: a writer’s invented coach is left out without a plan, and the plan’s person goes in with its evidence', async () => {
  const kept = { 'module-50.team.title.0': 'Mia Bennett', 'module-50.team.title.3': 'Noah Reed' }
  await honestWords({
    kept: { ...kept },
    slots: contentMap.slots,
    ownText: 'tennis club',
    honesty: null,
    locale: 'en',
    business: {}
  })
  const bare = { ...kept }
  const none = await honestWords({
    kept: bare,
    slots: contentMap.slots,
    ownText: 'tennis club',
    honesty: null,
    locale: 'en',
    business: {}
  })
  assert.deepEqual(bare, {})
  assert.equal(none.counts.invented, 2)
  const planned = { ...kept }
  const out = await honestWords({
    kept: planned,
    slots: contentMap.slots,
    ownText: 'Anouk',
    honesty: honesty(),
    locale: 'en',
    business: {}
  })
  assert.equal(planned['module-50.team.title.0'], 'Anouk')
  assert.ok(!('module-50.team.title.3' in planned))
  assert.equal(out.evidence['module-50.team.title.0'], 'Anouk')
})
