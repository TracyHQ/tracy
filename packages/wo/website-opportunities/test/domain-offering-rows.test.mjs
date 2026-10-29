// Spec TracyHQ/tracy#189 round 9 (COO rules of 30/10/2026): a line under an offering's name never only repeats the name, and
// the cards of one list share one set of info-row labels. Two fictional trades: a pottery studio and a bicycle repair shop.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planHonesty } from '../domain/site-plan-honesty.mjs'
import {
  acceptsWrittenDescription,
  offeringDescriptionOf,
  onlyNamesOffering
} from '../domain/offering-description.mjs'
import { planCollectionFactRows } from '../domain/fact-rows.mjs'

/** An offering card: name, summary, description, and `rows` fact rows (label + value fields of a JSON list). */
function card(n, name, rows, room = 40) {
  const group = { id: `article-${n}.offering`, item: 0, kind: 'service' }
  const base = { entity: `article-${n}`, type: 'text', group }
  return [
    {
      ...base,
      key: `article-${n}.name`,
      column: 'title',
      role: 'offering.name',
      sample: name,
      maxCharacters: 40
    },
    {
      ...base,
      key: `article-${n}.intro`,
      column: 'introtext',
      role: 'offering.summary',
      sample: 'A demo summary.',
      maxCharacters: 200
    },
    {
      ...base,
      key: `article-${n}.body`,
      column: 'fulltext',
      role: 'offering.description',
      sample: 'A demo description.',
      maxCharacters: 200
    },
    ...Array.from({ length: rows }, (_, i) => [
      {
        ...base,
        key: `article-${n}.r${i}l`,
        column: 'attribs',
        role: 'offering.schedule',
        sample: 'MONDAY',
        maxCharacters: room,
        fit: { maxCharacters: room, casing: 'upper' },
        jsonPath: ['info', `info${i}`, 'label']
      },
      {
        ...base,
        key: `article-${n}.r${i}v`,
        column: 'attribs',
        role: 'offering.schedule',
        sample: '7:00 AM',
        maxCharacters: room,
        fit: { maxCharacters: room, casing: 'none' },
        jsonPath: ['info', `info${i}`, 'value']
      }
    ]).flat()
  ]
}

const mapOf = (cards) => ({
  roleVocabularyVersion: 'place-content-roles/3',
  entities: cards.map(([n]) => ({ key: `article-${n}`, kind: 'article' })),
  pages: [],
  slots: cards.flatMap(([n, name, rows]) => card(n, name, rows))
})

const trades = [
  {
    trade: 'pottery studio',
    area: 'Studios across Millbrook',
    offerings: [
      {
        id: 'o1',
        label: 'Wheel Throwing',
        quote: 'Wheel Throwing',
        mentions: [
          { quote: 'Great teacher, loved the wheel throwing class', source: { kind: 'review' } },
          { quote: 'Centre your first bowl on the wheel with us.', source: { kind: 'post' } },
          { quote: 'Wheel throwing evenings for every hand.', source: { kind: 'post' } }
        ]
      },
      { id: 'o2', label: 'Glazing', quote: 'Glazing', mentions: [] },
      { id: 'o3', label: 'Kiln Hire', quote: 'Kiln Hire for members' }
    ]
  },
  {
    trade: 'bicycle repair shop',
    area: 'Pick-ups across Fernhill',
    offerings: [
      {
        id: 'o1',
        label: 'Wheel Truing',
        quote: 'Wheel Truing',
        mentions: [
          { quote: 'Fixed my wheel truing in a day', source: { kind: 'review' } },
          { quote: 'Bent rims made round again while you wait.', source: { kind: 'post' } },
          { quote: 'Spokes tensioned by hand on every wheel.', source: { kind: 'post' } }
        ]
      },
      { id: 'o2', label: 'Brake Service', quote: 'Brake Service', mentions: [] },
      { id: 'o3', label: 'Chain Fitting', quote: 'Chain Fitting at the shop' }
    ]
  }
]

const briefOf = (t) => ({
  business: { serviceAreas: [{ text: t.area, quote: t.area, source: { kind: 'bio' } }] },
  facts: [],
  reading: {
    services: t.offerings,
    audience: [{ id: 'a1', label: 'all levels', quote: 'For all levels', source: { kind: 'post' } }],
    team: [],
    story: []
  }
})

for (const t of trades) {
  test(`${t.trade}: a description never falls back to the offering's name; the owner's own post stands in, never a review`, () => {
    const [one, two, three] = t.offerings
    const { honesty } = planHonesty(
      briefOf(t),
      mapOf([
        [1, one.label, 0],
        [2, two.label, 0],
        [3, three.label, 0]
      ])
    )
    // The quote only repeats the name: the owner's posts take its place, a different one for each line of the card.
    assert.equal(honesty.fallbacks['article-1.intro'].value, one.mentions[1].quote)
    assert.equal(honesty.fallbacks['article-1.intro'].reason, 'brief-offering-mention')
    assert.equal(honesty.fallbacks['article-1.body'].value, one.mentions[2].quote)
    // Nothing beyond the name: no fallback, and the line is listed for the copy writer to write.
    for (const key of ['article-2.intro', 'article-2.body']) {
      assert.equal(key in honesty.fallbacks, false, key)
      assert.ok(honesty.nameOnly.includes(key), key)
    }
    // A quote that says more than the name is still the first choice.
    assert.equal(honesty.fallbacks['article-3.intro'].value, three.quote)
    for (const v of Object.values(honesty.fallbacks))
      assert.equal(
        onlyNamesOffering(
          v.value,
          t.offerings.map((o) => o.label)
        ),
        false,
        v.value
      )
  })

  test(`${t.trade}: the cards of one list share one set of row labels, as many as the shortest card holds`, () => {
    const [one, two, three] = t.offerings
    const { honesty } = planHonesty(
      briefOf(t),
      mapOf([
        [1, one.label, 2],
        [2, two.label, 1],
        [3, three.label, 1]
      ]),
      {
        contact: { serviceArea: { value: t.area } }
      }
    )
    const label = (n, i) => honesty.values[`article-${n}.r${i}l`]?.value ?? null
    for (const n of [1, 2, 3]) assert.equal(label(n, 0), 'LEVEL', `card ${n}`)
    // The two-row card loses its second row (the area): the other cards have no room for it.
    assert.equal(label(1, 1), null)
    const blanks = new Set(honesty.blanks.map((b) => b.key))
    assert.ok(blanks.has('article-1.r1l') && blanks.has('article-1.r1v'))
  })

  test(`${t.trade}: a card with no row empties every card's rows, never a mix`, () => {
    const [one, two, three] = t.offerings
    const { honesty } = planHonesty(
      briefOf(t),
      mapOf([
        [1, one.label, 2],
        [2, two.label, 0],
        [3, three.label, 1]
      ])
    )
    const rows = Object.keys(honesty.values).filter((k) => /\.r\d[lv]$/.test(k))
    assert.deepEqual(rows, [])
    const blanks = new Set(honesty.blanks.map((b) => b.key))
    for (const key of ['article-1.r0l', 'article-1.r1v', 'article-3.r0l', 'article-3.r0v'])
      assert.ok(blanks.has(key), key)
  })
}

test('a kind with a different label on one card is shown on none; one that fits on every card is', () => {
  const facts = {
    order: ['audience', 'area'],
    shared: {
      audience: { kind: 'audience', label: 'Level', value: 'All levels' },
      area: { kind: 'area', label: 'Where', value: 'Across Millbrook' }
    },
    own: { b: { audience: { kind: 'audience', label: "Who it's for", value: 'Nervous beginners' } } }
  }
  const cards = [1, 2].map((n, i) => ({
    group: { slots: card(n, `Class ${n}`, 1) },
    assigned: { id: ['a', 'b'][i] }
  }))
  const out = planCollectionFactRows(cards, facts)
  assert.deepEqual(out[0].values, { 'article-1.r0l': 'WHERE', 'article-1.r0v': 'Across Millbrook' })
  assert.deepEqual(out[1].values, { 'article-2.r0l': 'WHERE', 'article-2.r0v': 'Across Millbrook' })
})

test('a line only repeats the name whatever its HTML or casing; a line saying more does not', () => {
  assert.equal(onlyNamesOffering('<p>Wheel&nbsp;Throwing</p>', ['Wheel Throwing']), true)
  assert.equal(onlyNamesOffering('Brake service', ['Brake Service Pro', 'Brake Service']), true)
  assert.equal(onlyNamesOffering('', ['Glazing']), false)
  assert.equal(onlyNamesOffering('Glazing on Fridays', ['Glazing']), false)
  assert.equal(
    offeringDescriptionOf({ id: 'x', label: 'Glazing', quote: 'Glazing and Kiln Hire' }, [
      { id: 'x', label: 'Glazing' },
      { id: 'y', label: 'Kiln Hire' }
    ]),
    null
  )
})

for (const [trade, label, other, post] of [
  ['pottery studio', 'Raku Firing', 'Glazing', 'Watch your pots glow in an open Raku Firing outdoors'],
  [
    'bicycle repair shop',
    'Wheel Building',
    'Brake Service',
    'Each Wheel Building job is laced and tensioned by hand'
  ]
]) {
  test(`${trade}: the business's own post about an offering stands in when nothing is quoted under it`, () => {
    const brief = {
      content: {
        items: [
          {
            id: 'post:1',
            authorship: 'page',
            title: `${label} at the workshop`,
            body: `${post}.\nBook by message.\nAlso ask about ${other}.`
          },
          { id: 'post:2', authorship: 'credited', title: `A guest on ${label} day`, body: '' },
          { id: 'post:3', authorship: 'page', title: `${label} and ${other} this week`, body: '' }
        ]
      },
      reading: {
        services: [
          { id: 's1', label, quote: label, source: { ref: 'post:1', kind: 'post' } },
          { id: 's2', label: other, quote: other }
        ]
      }
    }
    const group = { id: 'article-5.offering', item: 0, kind: 'service' }
    const map = {
      entities: [{ key: 'article-5', kind: 'article' }],
      slots: [
        {
          key: 'article-5.name',
          entity: 'article-5',
          column: 'title',
          type: 'text',
          role: 'offering.name',
          sample: 'Demo',
          group
        },
        {
          key: 'article-5.intro',
          entity: 'article-5',
          column: 'introtext',
          type: 'text',
          role: 'offering.summary',
          sample: 'Demo.',
          maxCharacters: 120,
          group
        },
        {
          key: 'article-5.body',
          entity: 'article-5',
          column: 'fulltext',
          type: 'text',
          role: 'offering.description',
          sample: 'Demo.',
          maxCharacters: 120,
          group
        }
      ]
    }
    const { honesty } = planHonesty(brief, map)
    // The title of its own post, then a line of it naming the offering; never a credited post or one naming another offering.
    assert.equal(honesty.fallbacks['article-5.intro'].value, `${label} at the workshop`)
    assert.equal(honesty.fallbacks['article-5.body'].value, `${post}.`)
  })

  test(`${trade}: a written description may be editorial, never the name again, another offering or an unsourced fact`, () => {
    const ctx = {
      assigned: { id: 's1', label },
      offerings: [
        { id: 's1', label },
        { id: 's2', label: other }
      ],
      sourceText: post,
      limit: 90
    }
    assert.equal(
      acceptsWrittenDescription(`A calm, guided introduction to ${label.toLowerCase()}.`, ctx),
      true
    )
    for (const bad of [
      label,
      `${label} for all ages`,
      `${label} since 2009`,
      `${label} with ${other}`,
      `${label} guaranteed to last`,
      'x'.repeat(91),
      'Two lines\nhere'
    ])
      assert.equal(acceptsWrittenDescription(bad, ctx), false, bad)
    // A fact the business's own words hold may be said.
    assert.equal(
      acceptsWrittenDescription(`Open for all ages to try`, { ...ctx, sourceText: 'For all ages' }),
      true
    )
  })
}
