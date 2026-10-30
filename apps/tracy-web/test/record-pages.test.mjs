// Sibling record pages (#189, site build rules 1 to 3): the final check on served pages, the writer that writes each
// record page for its own record and fills an empty card, and the Joomla step that takes the blog pager off a landing
// record page. Fictional businesses: a dog grooming salon and a bakery.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkRecordPages } from '../src/opportunities-build/record-pages-check.js'
import { writeRecordPages, acceptsRecordLine } from '../src/sites/brief-engines/record-page-writer.js'
import { recordPagerSteps } from '../src/sites/brief-engines/joomla-record-pager.js'

const section = (cls, heading, body) => `<section class="${cls}"><h2>${heading}</h2>${body}</section>`
const recordPage = (name, { intro, photo, pager = false, outline }) =>
  `<html><body><header><nav><a href="/">Home</a></nav></header><main><h1>${name}</h1>` +
  section('intro', 'About the visit', `<p>${intro}</p><img src="/images/content/${photo}.jpg">`) +
  section('bring', 'What to bring', '<p>A lead and a favourite toy for the wait.</p>') +
  section('outline', 'How it goes', outline) +
  (pager ? '<nav class="pagenavigation"><a rel="next" href="/services/next">Next</a></nav>' : '') +
  '</main><footer><p>Fernwood Paws</p></footer></body></html>'
const card = (title, items) =>
  `<div class="part"><h3>${title}</h3><ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul></div>`
const outline = (...cards) => `<div class="parts">${cards.join('')}</div>`

test('the final check names a shared picture, a section with only the name swapped, an empty card and a blog pager', () => {
  const same = (n) =>
    `Our ${n} appointments are calm and gentle. Every visit ends with a short note for the owner.`
  const pages = [
    {
      path: '/services/bath',
      status: 200,
      html: recordPage('Bath', {
        intro: same('bath'),
        photo: 'tub',
        outline: outline(card('Rinse', ['Warm water']), card('Dry', ['Towel off']))
      })
    },
    {
      path: '/services/nails',
      status: 200,
      html: recordPage('Nails', {
        intro: same('nails'),
        photo: 'tub',
        pager: true,
        outline: outline(card('Settle', ['A treat']), card('', ['', '']))
      })
    }
  ]
  const found = checkRecordPages({ pages })
  const kinds = (k) => found.filter((f) => f.kind === k).map((f) => f.page)
  assert.deepEqual(kinds('sibling-record-picture'), ['/services/nails'])
  assert.deepEqual(kinds('sibling-record-copy'), ['/services/nails'])
  assert.deepEqual(kinds('empty-card'), ['/services/nails'])
  assert.deepEqual(kinds('record-page-pager'), ['/services/nails'])
  assert.ok(found.every((f) => f.severity === 'blocker'))
})

test('record pages each written for their own record, with their own pictures and no pager, pass the check', () => {
  const pages = [
    [
      '/menu/rye',
      'Rye loaf',
      'A dense loaf with a dark crust, baked slowly for a deep and nutty taste.',
      'rye'
    ],
    [
      '/menu/brioche',
      'Brioche',
      'A soft and rich bread made with butter and eggs, light as a cloud inside.',
      'brioche'
    ]
  ].map(([path, name, intro, photo]) => ({
    path,
    status: 200,
    html: recordPage(name, {
      intro,
      photo,
      outline: outline(card('Mix', ['Flour and water']), card('Bake', ['A hot oven']))
    })
  }))
  assert.deepEqual(checkRecordPages({ pages }), [])
})

const text = (key, entity, role, group) => ({
  key,
  entity,
  type: 'text',
  role,
  sample: 'Demo',
  ...(group ? { group } : {})
})
const MAP = {
  entities: ['article-1', 'article-2'].map((key) => ({
    key,
    kind: 'article',
    identity: { alias: key },
    identityReferences: { catid: 'category-3' }
  })),
  recordPages: [{ id: 'services', entities: ['article-1', 'article-2'], layout: 'landing' }],
  slots: ['article-1', 'article-2'].flatMap((e) => [
    text(`${e}.0`, e, 'offering.name', { id: `${e}.offering`, item: 0, kind: 'service' }),
    text(`${e}.1`, e, 'editorial.paragraph'),
    text(`${e}.2`, e, 'step.title', { id: `${e}.outline.0`, item: 0, kind: 'step' }),
    text(`${e}.3`, e, 'step.description', { id: `${e}.outline.0`, item: 0, kind: 'step' })
  ])
}

test('the writer writes a copied section again for its own record and fills the empty card, refusing an invented number', async () => {
  const written = {
    'article-1.0': 'Bath and Brush',
    'article-2.0': 'Nail Trim',
    'article-1.1': 'Our bath and brush visits are calm and gentle and end with a short note for the owner.',
    'article-2.1': 'Our nail trim visits are calm and gentle and end with a short note for the owner.',
    'article-1.2': 'Rinse',
    'article-1.3': 'Warm water first'
  }
  const asked = []
  const answers = [
    // First round: the fill holds a number nobody gave, so it is asked again.
    {
      'article-2.1': 'Clipping starts slowly, one paw at a time, with a treat between each one.',
      'article-2.2': 'Settle',
      'article-2.3': 'Wait 5 minutes'
    },
    { 'article-2.3': 'A treat on the table' }
  ]
  const model = {
    chat: async ({ messages }) => {
      asked.push(JSON.parse(messages[1].content))
      return JSON.stringify({ lines: answers[asked.length - 1] ?? {} })
    }
  }
  const out = await writeRecordPages({
    contentMap: MAP,
    written,
    model,
    about: { business: 'Fernwood Paws', trade: 'pet grooming' }
  })
  assert.deepEqual(out.values, {
    'article-2.1': 'Clipping starts slowly, one paw at a time, with a treat between each one.',
    'article-2.2': 'Settle',
    'article-2.3': 'A treat on the table'
  })
  assert.deepEqual(out.unreached, [])
  assert.equal(asked[0].lines.find((l) => l.key === 'article-2.1').task, 'rewrite')
  assert.equal(asked[0].lines.find((l) => l.key === 'article-2.2').task, 'fill')
  assert.equal(asked[0].lines.find((l) => l.key === 'article-2.2').record, 'Nail Trim')
  assert.equal(asked[1].lines.length, 1)
  // A rewrite still close to its sibling is refused.
  assert.equal(
    acceptsRecordLine('Our nail trim visits are calm and gentle and end with a note.', {
      slot: MAP.slots[1],
      like: [written['article-1.1']],
      task: 'rewrite'
    }),
    false
  )
})

test('a landing record page loses its blog pager; a page already without it, or no declaration, writes nothing', () => {
  const articles = [
    { id: 41, alias: 'article-1', attribs: '{"show_title":"1"}' },
    { id: 42, alias: 'article-2', attribs: { show_item_navigation: '0' } },
    { id: 43, alias: 'other' }
  ]
  assert.deepEqual(recordPagerSteps(MAP, articles), [
    { kind: 'article', id: 41, fields: { attribs: '{"show_title":"1","show_item_navigation":"0"}' } }
  ])
  assert.deepEqual(
    recordPagerSteps({ ...MAP, recordPages: [{ ...MAP.recordPages[0], layout: 'post' }] }, articles),
    []
  )
})
