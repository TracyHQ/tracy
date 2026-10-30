// Spec TracyHQ/tracy#189 round 9 (COO rules of 30/10/2026), engine and final check: a line under an offering's name that only
// repeats the name is taken off whoever wrote it, and the cards of one list show one set of info-row labels. Two fictional
// trades: a pottery studio and a bicycle repair shop.
import assert from 'node:assert/strict'
import test from 'node:test'
import { planHonesty } from 'website-opportunities/domain/site-plan-honesty.mjs'
import { nameOnlyOfferingLines } from '../src/sites/brief-engines/offering-name-only.js'
import { offeringSummaryValues } from '../src/sites/brief-engines/offering-summaries.js'
import { checkOfferingRows } from '../src/opportunities-build/offering-rows-check.js'
import { checkOfferingSummaries } from '../src/opportunities-build/offering-summary-check.js'
import { writeOfferingDescriptions } from '../src/sites/brief-engines/offering-description-writer.js'

const trades = [
  {
    trade: 'pottery studio',
    said: 'Glazing',
    other: 'Kiln Hire',
    post: 'Kiln Hire for members, firing every Friday.'
  },
  {
    trade: 'bicycle repair shop',
    said: 'Brake Service',
    other: 'Wheel Truing',
    post: 'Wheel Truing while you wait at the shop.'
  }
]

function mapOf(t) {
  const slots = []
  for (const [n, name] of [
    [41, t.said],
    [42, t.other]
  ]) {
    const group = { id: `article-${n}.offering`, kind: 'service', item: 0 }
    const base = { entity: `article-${n}`, type: 'text', group }
    slots.push(
      { ...base, key: `article-${n}.name`, column: 'title', role: 'offering.name', sample: name },
      {
        ...base,
        key: `article-${n}.intro`,
        column: 'introtext',
        role: 'offering.summary',
        sample: 'Demo summary.',
        maxCharacters: 200
      },
      {
        ...base,
        key: `article-${n}.body`,
        column: 'fulltext',
        role: 'offering.description',
        sample: 'Demo body.',
        maxCharacters: 200
      }
    )
  }
  return { slots, entities: [41, 42].map((n) => ({ key: `article-${n}`, kind: 'article' })) }
}

const briefOf = (t) => ({
  reading: {
    services: [
      { id: 's1', label: t.said, quote: t.said },
      { id: 's2', label: t.other, quote: t.post }
    ]
  }
})

for (const t of trades) {
  const map = mapOf(t)
  const { honesty } = planHonesty(briefOf(t), map)

  test(`${t.trade}: a summary that only repeats the name is never kept, and one the writer must write never throws`, async () => {
    // The plan has no words beyond the name for the first card: no throw, no value, the name-only line is not kept.
    const values = await offeringSummaryValues({
      slots: map.slots,
      honesty,
      written: { 'article-41.intro': `<p>${t.said}</p>`, 'article-42.intro': t.other }
    })
    assert.equal('article-41.intro' in values, false)
    // The second card has the owner's words, but its sibling has none: the list falls back as one unit (COO criterion
    // 1.3, R12), so both summaries go to the writer and neither name-only line is kept.
    assert.equal('article-42.intro' in values, false)
    assert.ok(honesty.nameOnly.includes('article-41.intro') && honesty.nameOnly.includes('article-42.intro'))
  })

  test(`${t.trade}: every line only repeating the name is emptied after the write, whoever wrote it`, () => {
    const off = nameOnlyOfferingLines({
      slots: map.slots,
      honesty,
      written: {
        'article-41.intro': t.said.toUpperCase(),
        'article-42.intro': t.post,
        'article-42.body': `${t.other}`
      }
    }).map((s) => s.key)
    // 41.body was never written and the plan has nothing beyond the name: it goes too, never the template's words. A line
    // taken off one card takes the same line off its sibling: 42.intro goes with 41.intro.
    assert.deepEqual(off.sort(), [
      'article-41.body',
      'article-41.intro',
      'article-42.body',
      'article-42.intro'
    ])
  })

  test(`${t.trade}: the final check names a line only repeating the name and a list of cards with mixed row labels`, () => {
    const cardHtml = (name, intro, rows) =>
      `<article class="item"><h2><a href="/x">${name}</a></h2><div class="item-intro"><p>${intro}</p></div>` +
      `<div class="extra-info">${rows.map(([l, v]) => `<div class="row-item"><div class="title">${l}</div><p>${v}</p></div>`).join('')}</div></article>`
    const bad = `<main><section>${cardHtml(t.said, t.said, [
      ['LEVEL', 'All levels'],
      ['WHERE', 'Town']
    ])}${cardHtml(t.other, t.post, [['LEVEL', 'All levels']])}</section></main>`
    const found = checkOfferingRows({ pages: [{ path: '/list', status: 200, html: bad }], brief: briefOf(t) })
    assert.deepEqual(found.map((f) => f.kind).sort(), ['offering-name-only', 'offering-row-labels'])
    const good = `<main><section>${cardHtml(t.said, `${t.said} on weekday evenings.`, [['WHERE', 'Town']])}${cardHtml(t.other, t.post, [['WHERE', 'Elsewhere']])}</section></main>`
    assert.deepEqual(
      checkOfferingRows({ pages: [{ path: '/list', status: 200, html: good }], brief: briefOf(t) }),
      []
    )
  })

  test(`${t.trade}: the copy writer describes an offering the brief says nothing about, with no invented fact`, async () => {
    const asked = []
    const model = {
      chat: async ({ messages }) => {
        asked.push(JSON.parse(messages[1].content).lines.map((l) => l.key))
        return JSON.stringify({
          lines: {
            'article-41.intro': `Hands-on ${t.said.toLowerCase()} sessions guided step by step.`,
            // Only the name, an invented figure, another offering: never kept.
            'article-41.body': `${t.said} for 25 years`
          }
        })
      }
    }
    const lines = await writeOfferingDescriptions({
      slots: map.slots,
      honesty,
      written: { 'article-41.intro': t.said },
      about: { business: 'Fictional', sourceText: t.post },
      model
    })
    // The first card has no owner words, so the whole list is written together: the second card's summary too.
    assert.deepEqual(asked, [['article-41.intro', 'article-41.body', 'article-42.intro', 'article-42.body']])
    assert.deepEqual(lines, {
      'article-41.intro': `Hands-on ${t.said.toLowerCase()} sessions guided step by step.`
    })
    // What the writer could not write goes after the write, never the template's words, and takes the same line off every
    // sibling: the list shows all its summaries or none.
    const off = nameOnlyOfferingLines({ slots: map.slots, honesty, written: lines }).map((s) => s.key)
    assert.deepEqual(off.sort(), [
      'article-41.body',
      'article-41.intro',
      'article-42.body',
      'article-42.intro'
    ])
  })

  test(`${t.trade}: a kept card with no summary is still reported`, () => {
    const html = `<main><ul><li><h3><a href="/a">${t.said}</a></h3></li><li><h3><a href="/b">${t.other}</a></h3></li></ul></main>`
    const found = checkOfferingSummaries({ pages: [{ path: '/list', status: 200, html }], brief: briefOf(t) })
    assert.deepEqual(found.map((f) => f.offering).sort(), [t.other, t.said].sort())
  })
}
