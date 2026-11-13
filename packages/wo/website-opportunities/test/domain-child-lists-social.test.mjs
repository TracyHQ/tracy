// Social rows of child lists (ticket #615): a list of profile links takes its links by the icon step's rules, and a
// block that shows one person takes that person's links when its list declares person.social_url (as block-180 of JA
// Boxing will, #584). Invented stores and people; the links use real network hosts with invented handles.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-child-lists-social.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planDataOf } from '../domain/plan-data.mjs'
import { CHILD_LIST_REASONS, planRows } from '../domain/plan-rows.mjs'
import { rowsLeftOut } from '../domain/plan-rows-check.mjs'

const sources = ['site']

/** An invented single coach block whose own list declares person.social_url, as block-180 will (#584). */
const coachHero = (max) =>
  new Map([
    [
      'coach-hero',
      {
        id: 'coach-hero',
        type: 'team',
        items: { min: 1, max: 1 },
        lists: [
          {
            name: 'social',
            items: { min: 0, max },
            fields: [
              {
                name: 'link',
                kind: 'person.social_url',
                type: 'link',
                slots: [Array.from({ length: max }, (_, r) => `hero.link-${r + 1}`)]
              },
              {
                name: 'network-icon',
                kind: 'editorial.item_icon',
                type: 'icon',
                storage: 'class-name',
                iconOf: 'network',
                slots: [Array.from({ length: max }, (_, r) => `hero.icon-${r + 1}`)]
              }
            ]
          }
        ]
      }
    ]
  ])
const coachProfile = (links, asField) => ({
  sources: [{ id: 'site', origin: 'website' }],
  facts: { 'contact.social_url': [{ value: 'https://instagram.com/invented-studio', sources }] },
  items: {
    person: [
      {
        id: 'person-coach',
        kind: 'person',
        fields: {
          'person.name': { value: 'Coach Invented', sources },
          ...(asField ? { 'person.social_url': { value: links, sources } } : {})
        },
        sources,
        ...(asField
          ? {}
          : {
              rows: links.map((value, r) => ({
                id: `person-coach-row-${r + 1}`,
                fields: { 'person.social_url': { value } },
                sources
              }))
            })
      }
    ]
  }
})
const LINKS = [
  'https://unknown-network.example/coach',
  'https://instagram.com/coach.a',
  'https://instagram.com/coach.b',
  'https://bit.ly/coach',
  'https://youtube.com/@coach'
]
const heroPlan = (profile, max = 4) => {
  const data = planDataOf(profile)
  const pages = [
    {
      id: 'home',
      blocks: [{ id: 'b1', type: 'team', block: 'coach-hero', data: ['person-coach', 'contact-social-url'] }]
    }
  ]
  return { data, ...planRows(pages, coachHero(max), data) }
}

test('social rows take their links by the icon step rules; the rest is reported with its reason', () => {
  for (const asField of [false, true]) {
    const { data, pages, dropped, planned } = heroPlan(coachProfile(LINKS, asField))
    const rows = pages[0].blocks[0].lists[0].rows.map(
      (r) => data.rowsById.get(r.data).values['person.social_url'][0]
    )
    // A single person block list of person.social_url takes that person's links, not the business's.
    assert.deepEqual(rows, ['https://instagram.com/coach.a', 'https://youtube.com/@coach'])
    assert.deepEqual(
      dropped.map((d) => d.code),
      ['social_network_unknown', 'social_network_repeated', 'social_link_shortened']
    )
    assert.ok(dropped.every((d) => d.reason === CHILD_LIST_REASONS[d.code] && !/\p{Pd}/u.test(d.reason)))
    const out = rowsLeftOut(data, planned, dropped, new Set())
    assert.deepEqual(
      out.map((e) => e.reason),
      ['social_network_unknown', 'social_network_repeated', 'social_link_shortened'].map(
        (c) => CHILD_LIST_REASONS[c]
      )
    )
  }
  // Two rows: the second link is beyond them.
  const two = heroPlan(
    coachProfile(
      ['https://instagram.com/coach.a', 'https://youtube.com/@coach', 'https://x.com/coach'],
      false
    ),
    2
  )
  assert.deepEqual(
    two.dropped.map((d) => d.code),
    ['social_link_over_rows']
  )
})
