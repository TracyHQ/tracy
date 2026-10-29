import assert from 'node:assert/strict'
import { test } from 'node:test'

import { boundNodes } from '../src/sites/brief-engines/joomla-bound-nodes.js'
import { planRecordSteps, recordSteps } from '../src/sites/brief-engines/joomla-plan-records.js'

const slot = (entity, column, sample, extra = {}) => ({
  key: `${entity}.${column}`,
  entity,
  column,
  sample,
  type: 'text',
  ...extra
})

for (const trade of ['bakery', 'clinic']) {
  test(`the ${trade} plan empties refused records of every reachable kind without losing bound nodes`, async () => {
    const html = `<p>Demo ${trade} biography <em>award winner</em></p><p>Keep this paragraph</p>`
    const blanks = [
      slot('userProfile-7100', 'value', `Demo ${trade} biography `, {
        xpath: '/html/body/div/p[1]/text()'
      }),
      slot('userProfile-7100', 'value', 'award winner', {
        key: 'userProfile-7100.award',
        xpath: '/html/body/div/p[1]/em/text()'
      }),
      slot('userProfile-7101', 'value', `Demo ${trade} expert`),
      slot('menuItem-31', 'title', 'Demo Person'),
      slot('menuItem-31', 'params', 'Demo page heading', { jsonPath: ['page_heading'] }),
      slot('module-7', 'title', 'Demo section'),
      slot('module-7', 'params', 'Demo first', { nestedJson: 'first', jsonPath: ['text'] }),
      slot('module-7', 'params', 'Demo second', {
        key: 'module-7.second',
        nestedJson: 'second',
        jsonPath: ['text']
      }),
      slot('article-8', 'title', 'Demo article'),
      slot('article-8', 'images', 'images/demo.jpg', {
        type: 'image',
        jsonPath: ['image_intro']
      }),
      slot('contact-9', 'email_to', 'demo@example.test'),
      slot('category-10', 'description', 'Demo description'),
      slot('tag-11', 'params', 'images/tag.jpg', { type: 'image', jsonPath: ['image'] }),
      slot('fieldValue-2000000003', 'value', 'Demo custom field'),
      slot('templateStyle-12', 'params', 'Demo strapline', { jsonPath: ['strapline'] })
    ]
    const rows = new Map([
      ['userProfile-7100', { id: 7100, value: html }],
      ['userProfile-7101', { id: 7101, value: `Demo ${trade} expert` }],
      [
        'menuItem-31',
        {
          id: 31,
          title: 'Demo Person',
          params: '{"page_heading":"Demo page heading","menu_show":1}',
          home: 1
        }
      ],
      [
        'module-7',
        {
          id: 7,
          title: 'Demo section',
          params: JSON.stringify({
            first: '{"text":"Demo first","keep":1}',
            second: '{"text":"Demo second"}',
            untouched: true
          })
        }
      ],
      [
        'article-8',
        {
          id: 8,
          title: 'Demo article',
          images: '{"image_intro":"images/demo.jpg","image_fulltext":"images/keep.jpg"}'
        }
      ],
      ['contact-9', { id: 9, email_to: 'demo@example.test' }],
      ['category-10', { id: 10, description: 'Demo description' }],
      ['tag-11', { id: 11, params: '{"image":"images/tag.jpg"}' }],
      ['fieldValue-2000000003', { id: 2000000003, value: 'Demo custom field' }],
      ['templateStyle-12', { id: 12, params: '{"strapline":"Demo strapline"}' }]
    ])
    const reads = []
    const made = await planRecordSteps({
      siteKey: 'fictional-site',
      ctx: { siteKey: 'fictional-site', email: 'owner@example.test', note() {} },
      woContent: { sitePlanFor: async () => ({ honesty: { blanks: blanks.slice(0, 2) } }) },
      extraBlanks: blanks.slice(2),
      apply: async ({ action, params }) => {
        if (action === 'content.list') return { ok: true, items: [rows.get('module-7')] }
        assert.equal(action, 'content.get')
        reads.push(`${params.kind}-${params.id}`)
        return { ok: true, item: rows.get(`${params.kind}-${params.id}`) }
      }
    })
    const after = new Map([...rows].map(([key, row]) => [key, structuredClone(row)]))
    for (const step of made.steps) Object.assign(after.get(`${step.kind}-${step.id}`), step.fields)
    const bio = after.get('userProfile-7100').value
    assert.doesNotMatch(bio, /Demo|biography|award winner/)
    assert.match(bio, /Keep this paragraph/)
    for (const blank of blanks.slice(0, 2)) assert.equal(boundNodes(bio, blank.xpath).length, 1)
    assert.equal(after.get('userProfile-7101').value, '')
    assert.equal(after.get('menuItem-31').title, '\u00a0')
    assert.deepEqual(JSON.parse(after.get('menuItem-31').params), { page_heading: '', menu_show: 1 })
    assert.equal(after.get('menuItem-31').home, 1)
    assert.equal(after.get('module-7').title, '\u00a0')
    const config = JSON.parse(after.get('module-7').params)
    assert.deepEqual(JSON.parse(config.first), { text: '', keep: 1 })
    assert.deepEqual(JSON.parse(config.second), { text: '' })
    assert.equal(config.untouched, true)
    assert.equal(after.get('article-8').title, '\u00a0')
    assert.deepEqual(JSON.parse(after.get('article-8').images), {
      image_intro: '',
      image_fulltext: 'images/keep.jpg'
    })
    assert.equal(after.get('contact-9').email_to, '')
    assert.equal(after.get('category-10').description, '')
    assert.deepEqual(JSON.parse(after.get('tag-11').params), { image: '' })
    assert.equal(after.get('fieldValue-2000000003').value, '')
    assert.deepEqual(JSON.parse(after.get('templateStyle-12').params), { strapline: '' })
    assert.equal(new Set(reads).size, reads.length, 'one read per record, however many slots it holds')
  })
}

// 🔒 An unreachable fallback is said with its reason and the build goes on (#189, round 10): never a silent success, never
// the end of the build.
for (const [blank, reason] of [
  [slot('languageString-1', 'value', 'Demo language heading'), 'no-record-door'],
  [slot('menuItem-2', 'params', 'Demo heading', { jsonPath: ['missing'] }), 'field-not-found'],
  [
    slot('userProfile-7100', 'value', 'Not in the bio', { xpath: '/html/body/div/p[2]/text()' }),
    'bound-node-not-found'
  ]
]) {
  test(`an unreachable fallback ${blank.key} is a finding with its reason, never a silent success`, async () => {
    const notes = []
    const made = await planRecordSteps({
      siteKey: 'fictional-site',
      ctx: { siteKey: 'fictional-site', email: 'owner@example.test', note: (line) => notes.push(line) },
      woContent: null,
      extraBlanks: [blank],
      apply: async ({ action }) =>
        action === 'content.list'
          ? { ok: true, items: [] }
          : { ok: true, item: { params: '{"page_heading":"Demo heading"}', value: '<p>Demo bio</p>' } }
    })
    assert.deepEqual(made.steps, [])
    assert.deepEqual(made.unresolved, [{ key: blank.key, reason }])
    assert.ok(notes.some((line) => line.includes(blank.key)))
  })
}

test('a refused fallback read is a finding, never successful empty steps', async () => {
  const made = await planRecordSteps({
    siteKey: 'fictional-site',
    ctx: { siteKey: 'fictional-site', email: 'owner@example.test', note() {} },
    woContent: null,
    extraBlanks: [slot('userProfile-7100', 'value', 'Demo bio')],
    apply: async ({ action }) =>
      action === 'content.list' ? { ok: true, items: [] } : { ok: false, message: 'profile read refused' }
  })
  assert.deepEqual(made.steps, [])
  assert.deepEqual(made.unresolved, [{ key: 'userProfile-7100.value', reason: 'record-not-read' }])
})

test('a records door that does not answer still stops the build', async () => {
  await assert.rejects(
    planRecordSteps({
      siteKey: 'fictional-site',
      ctx: { siteKey: 'fictional-site', email: 'owner@example.test', note() {} },
      woContent: null,
      extraBlanks: [slot('module-7', 'title', 'Demo section')],
      apply: async () => {
        throw new Error('site unreachable')
      }
    }),
    (error) => error.code === 'JOOMLA_RECORD_FALLBACK_UNRESOLVED'
  )
})

test('a repeated biography targets its bound paragraph and leaves another paragraph intact', async () => {
  const html = '<p>Demo biography</p><p>Demo biography</p><img src="images/demo.jpg">'
  const made = await planRecordSteps({
    siteKey: 'fictional-site',
    ctx: { siteKey: 'fictional-site', email: 'owner@example.test', note() {} },
    woContent: null,
    extraBlanks: [
      slot('userProfile-7100', 'value', 'Demo biography', { xpath: '/html/body/div/p[2]/text()' }),
      slot('userProfile-7100', 'value', 'images/demo.jpg', {
        key: 'avatar',
        type: 'image',
        xpath: '/html/body/div/img/@src'
      })
    ],
    apply: async ({ action }) =>
      action === 'content.list' ? { ok: true, items: [] } : { ok: true, item: { id: 7100, value: html } }
  })
  const after = made.steps[0].fields.value
  assert.equal(after, '<p>Demo biography</p><p>&nbsp;</p><img hidden src="images/demo.jpg">')
  assert.equal(boundNodes(after, '/html/body/div/p[2]/text()').length, 1)
  assert.equal(boundNodes(after, '/html/body/div/img/@src').length, 1)
})

for (const trade of ['bakery', 'clinic']) {
  for (const [condition, xpath] of [
    ['missing', '/html/body/div/p[3]/text()'],
    ['ambiguous', '/html/body/div/p/text()'],
    ['unsupported', '//p/text()']
  ]) {
    test(`the ${trade} plan rejects a ${condition} path instead of blanking an unrelated matching sample`, async () => {
      const value = `<p>Demo ${trade} biography</p><p>Demo ${trade} biography</p>`
      const row = { id: 7100, value }
      const blank = slot('userProfile-7100', 'value', `Demo ${trade} biography`, { xpath })
      const made = await planRecordSteps({
        siteKey: 'fictional-site',
        ctx: { siteKey: 'fictional-site', email: 'owner@example.test', note() {} },
        woContent: null,
        extraBlanks: [blank],
        apply: async ({ action }) =>
          action === 'content.list' ? { ok: true, items: [] } : { ok: true, item: row }
      })
      assert.deepEqual(made.steps, [], 'no write to a node the path does not name')
      assert.deepEqual(made.unresolved, [{ key: blank.key, reason: 'bound-node-not-found' }])
      const direct = recordSteps({
        honesty: { blanks: [blank] },
        modules: new Map(),
        records: new Map([['userProfile', new Map([[row.id, row]])]])
      })
      assert.deepEqual(direct.steps, [], 'the pure records seam cannot produce a wrong-node write either')
      assert.equal(direct.unresolved, 1)
      assert.deepEqual(direct.left, [blank.key])
      assert.equal(row.value, value, 'unrelated matching text is unchanged')
    })
  }
}
