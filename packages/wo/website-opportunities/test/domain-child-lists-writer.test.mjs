// Child list rows through the page writer and the icon step (ticket #615), and the coverage of every child list
// field the real JA Boxing block store declares. An invented pottery studio, invented items, a scripted fake writer and
// a scripted fake ranking model; no real model. The JA Boxing store is read for its declaration only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-child-lists-writer.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { writePages } from '../domain/page-writer.mjs'
import { blocksOf, picturesStep } from '../domain/picture-step.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { declaredRowFieldsOf, rowFieldAccountOf } from '../domain/plan-row-coverage.mjs'
import { planRows } from '../domain/plan-rows.mjs'
import { composeInputs, HAND, ODILE, potteryStore, WHEEL } from './fixtures/child-lists/invented-pottery.mjs'
import { firstCandidate, scriptedModel, scriptedWriter } from './fixtures/icon-fields/invented-yoga.mjs'

const BOXING = new URL(
  '../../../cms/tracy-joomla-quickstart/ai-quickstarts/ja-boxing/j6/1.0.11/block-store.json',
  import.meta.url
)
const writer = () => scriptedWriter((key) => (key.includes('tip') ? 'Press firmly' : 'Calm practice'))
const icons = () => ({
  set: '@phosphor-icons/core@2.1.1',
  icons: [
    { name: 'hand-grabbing', tags: ['wedge', 'clay', 'press'], categories: [] },
    { name: 'circle-notch', tags: ['center', 'spin'], categories: [] },
    { name: 'leaf', tags: ['tea', 'plants'], categories: [] }
  ]
})

async function writtenPottery() {
  const { plan, profile } = await composePlan(composeInputs())
  const model = writer()
  const copy = await writePages({ plan, profile, blockStore: potteryStore(), model })
  return { plan, profile, copy, model }
}
const entry = (copy, key) => copy.pages.flatMap((p) => p.fields).find((f) => f.key === key)

test('the writer reports every declared field of every planned row, row N of the business in place N', async () => {
  const { plan, profile, copy, model } = await writtenPottery()
  const grid = plan.pages[0].blocks.find((b) => b.block === 'services-grid').id
  const at = (item, row, field) => entry(copy, `${grid}/${item}/${row}/${field}`)
  const pick = (f) => [f.from, f.value ?? f.action]
  assert.deepEqual(pick(at(WHEEL, 'sessions.1', 'days')), ['data', 'Tue and Thu'])
  assert.deepEqual(pick(at(WHEEL, 'sessions.1', 'times')), ['data', '18:00 to 20:00'])
  assert.deepEqual(pick(at(WHEEL, 'sessions.2', 'days')), ['data', 'Sat'])
  assert.deepEqual(pick(at(WHEEL, 'sessions.2', 'times')), ['data', '10:00 to 12:00'])
  assert.deepEqual(pick(at(HAND, 'sessions.1', 'days')), ['data', 'Wed'])
  assert.deepEqual(pick(at(WHEEL, 'steps.1', 'step')), ['data', 'Wedge the clay'])
  assert.deepEqual(pick(at(WHEEL, 'steps.2', 'step')), ['data', 'Center on the wheel'])
  assert.deepEqual(pick(at(WHEEL, 'steps.1', 'icon')), ['no-data', 'pictures'])
  assert.deepEqual(pick(at(WHEEL, 'steps.1.tips.1', 'tip')), ['writer', 'Press firmly'])
  assert.equal(at(WHEEL, 'steps.2.tips.1', 'tip'), undefined)
  const team = plan.pages[1].blocks[0].id
  assert.deepEqual(
    [1, 2].map((n) => pick(entry(copy, `${team}/${ODILE}/links.${n}/link`))),
    [
      ['data', 'https://social.example/kilnmere.odile'],
      ['data', 'https://video.example/odile-throws']
    ]
  )
  assert.deepEqual(pick(entry(copy, `${team}/${ODILE}/links.1/network-icon`)), ['no-data', 'network'])
  const footer = plan.pages[0].blocks.find((b) => b.block === 'footer-main').id
  assert.deepEqual(pick(entry(copy, `${footer}/hours.2/line`)), ['data', 'Sat 09:00 to 17:00'])
  // The model writes the tip from its row's data, read as context; it never writes a data field.
  const home = JSON.parse(model.calls.find((c) => JSON.parse(c.user).page.id === 'home').user)
  const block = home.blocks.find((b) => b.id === grid)
  assert.deepEqual(
    block.fields.filter((f) => f.row).map((f) => f.key),
    [`${grid}/${WHEEL}/steps.1.tips.1/tip`]
  )
  assert.ok(block.rows.some((r) => r.fields['step.description']?.[0] === 'pressing out every air pocket'))
  // Held to the declaration: every field of every planned row has a decision, none unexplained.
  const declared = declaredRowFieldsOf(plan.pages, blocksOf(potteryStore()), planDataOf(profile))
  const account = rowFieldAccountOf(declared, copy)
  console.log(
    `pottery child list fields: declared ${account.declared}, decisions ${JSON.stringify(account.decisions)}`
  )
  assert.deepEqual([account.missing, account.extra, account.unexplained], [[], [], 0])
})

test('with written row text the icon step chooses row icons instead of icon_words_missing', async () => {
  const { plan, profile, copy } = await writtenPottery()
  const step = (written) =>
    picturesStep({
      plan,
      profile,
      blockStore: potteryStore(),
      vision: scriptedModel(),
      model: scriptedModel(firstCandidate()),
      copy: written,
      iconLibrary: icons()
    })
  const id = (n) => `home.${plan.pages[0].blocks[1].id}.${WHEEL}.steps.${n}.icon`
  const rowless = { pages: copy.pages.map((p) => ({ ...p, fields: p.fields.filter((f) => !f.row) })) }
  const before = (await step(rowless)).icons.filter((i) => [id(1), id(2)].includes(i.id))
  assert.deepEqual(
    before.map((i) => i.reason),
    ['icon_words_missing', 'icon_words_missing']
  )
  const after = (await step(copy)).icons.filter((i) => [id(1), id(2)].includes(i.id))
  console.log(
    `row icons: ${after.map((i) => `${i.id} -> ${i.source} ${i.icon?.name ?? i.name ?? i.reason}`).join('; ')}`
  )
  assert.deepEqual(
    after.map((i) => i.source),
    ['library', 'library']
  )
})

/** JA Boxing with every block that declares a child list placed, and invented items and rows for them. */
function boxingPlan(store) {
  const sources = ['site']
  const items = { service: [], person: [] }
  const pages = []
  const row = (owner, n, fields) => ({ id: `${owner}-row-${n}`, fields, sources })
  for (const block of store.blocks.filter((b) => b.lists || b.itemLists)) {
    const people = block.type === 'team'
    const data = []
    // A post shows the business's own rows (its points); a block of one class or coach shows that item's rows.
    const count = block.type === 'posts' ? 0 : block.lists ? 1 : block.items.max
    for (let n = 1; n <= count; n++) {
      const id = `${block.id}-item-${n}`
      const name = people
        ? { 'person.name': { value: `Coach ${n}`, sources } }
        : { 'offering.name': { value: `Class ${n}`, sources } }
      const rows = people
        ? [1, 2, 3, 4, 5].map((r) =>
            row(id, r, { 'person.social_url': { value: `https://social.example/coach-${n}-${r}` } })
          )
        : [
            ...[1, 2, 3].map((r) =>
              row(id, r, { 'offering.schedule': { value: [`Day ${r}`, `${r + 8}:00 to ${r + 9}:00`] } })
            ),
            ...[1, 2, 3, 4, 5].map((r) =>
              row(id, r + 3, { 'offering.description': { value: `Feature ${r} of class ${n}` } })
            )
          ]
      items[people ? 'person' : 'service'].push({
        id,
        kind: people ? 'person' : 'service',
        fields: name,
        sources,
        rows
      })
      data.push(id)
    }
    if (block.id === 'block-180') data.splice(1, 0, 'contact-social-url', 'contact-social-url-2')
    pages.push({ id: block.id, blocks: [{ id: 'b1', type: block.type, block: block.id, data }] })
  }
  const profile = {
    sources: [{ id: 'site', origin: 'website' }],
    facts: {
      'contact.social_url': ['https://social.example/club', 'https://video.example/club'].map((value) => ({
        value,
        sources
      }))
    },
    items,
    rows: [1, 2, 3, 4, 5].map((n) =>
      row('business', n, { 'article.lead': { value: `Point ${n} of the article` } })
    )
  }
  const data = planDataOf(profile)
  const planned = planRows(pages, blocksOf(store), data)
  return { plan: { language: 'en', pages: planned.pages }, profile, data, dropped: planned.dropped }
}

test('JA Boxing: every declared child list field has a decision, none unexplained, values in order', async () => {
  const store = JSON.parse(readFileSync(BOXING, 'utf8'))
  const { plan, profile, data, dropped } = boxingPlan(store)
  const copy = await writePages({ plan, profile, blockStore: store, model: writer() })
  const declared = declaredRowFieldsOf(plan.pages, blocksOf(store), data)
  const account = rowFieldAccountOf(declared, copy)
  const cut = dropped.reduce((acc, d) => ({ ...acc, [d.code]: (acc[d.code] ?? 0) + 1 }), {})
  console.log(
    `JA Boxing child list fields: declared ${account.declared} = decided ${account.decided}; ` +
      `${JSON.stringify(account.decisions)}; unexplained ${account.unexplained}; rows and fields dropped ${JSON.stringify(cut)}`
  )
  assert.equal(account.declared, account.decided)
  assert.deepEqual([account.missing, account.extra, account.unexplained], [[], [], 0])
  const network = declared.filter((d) => d.field.iconOf === 'network').length
  assert.equal(network, 68)
  // Row N of the business lands in place N: the calendar of class 1, the links of coach 2, the article points.
  const value = (page, item, row, field) =>
    account.byId.get([page, 'b1', item, row, field].filter(Boolean).join('.'))?.value
  assert.equal(value('block-160', 'block-160-item-1', 'calendar.2', 'days'), 'Day 2')
  assert.equal(value('block-160', 'block-160-item-1', 'calendar.2', 'times'), '10:00 to 11:00')
  assert.equal(value('block-163', 'block-163-item-2', 'social.4', 'link'), 'https://social.example/coach-2-4')
  assert.equal(value('news-post', null, 'points.3', 'point'), 'Point 3 of the article')
  assert.equal(value('class-detail', null, 'features.4', 'description'), 'Calm practice')
  assert.equal(value('block-180', null, 'social.2', 'link'), 'https://video.example/club')
  assert.equal(account.byId.get('block-162.b1.pages.1.page').action, 'derived')
})
