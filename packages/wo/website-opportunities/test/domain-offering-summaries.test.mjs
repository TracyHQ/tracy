import assert from 'node:assert/strict'
import test from 'node:test'
import { planHonesty } from '../domain/site-plan-honesty.mjs'
import { honestWritten } from '../domain/honest-written.mjs'
import { slotFillPins } from '../domain/contract-copy-pins.mjs'
import { planSlotFill } from '../domain/slot-fill.mjs'
import { neutralFor } from '../domain/neutral-copy.mjs'

const trades = [
  { label: 'Sourdough', quote: 'Sourdough made with a slow fermentation.', other: 'Pastries' },
  { label: 'Dental cleaning', quote: 'Dental cleaning with a gentle approach.', other: 'Implants' }
]

function summaryMap() {
  const group = { id: 'article-31.offering', kind: 'service', item: 0 }
  return {
    roleVocabularyVersion: 'place-content-roles/3',
    entities: [{ key: 'article-31', kind: 'article' }],
    slots: [
      {
        key: 'article-31.title',
        entity: 'article-31',
        type: 'text',
        column: 'title',
        role: 'offering.name',
        sample: 'Demo activity',
        group
      },
      {
        key: 'article-31.intro',
        entity: 'article-31',
        type: 'text',
        column: 'introtext',
        role: 'offering.summary',
        sample: 'Demo activity with invented results.',
        maxCharacters: 100,
        group
      }
    ]
  }
}

test('an empty copy pin cannot overwrite an offering summary after the writer and cleanup guards', () => {
  const out = slotFillPins({
    contentMap: summaryMap(),
    plan: {
      writes: [
        {
          slotKey: 'article-31.intro',
          role: 'offering.summary',
          state: 'empty',
          mode: 'copy',
          value: '',
          factRefs: []
        }
      ]
    }
  })
  assert.equal(Object.hasOwn(out.pins, 'article-31.intro'), false)
  assert.equal(out.placeholders.includes('article-31.intro'), false)
})

for (const trade of trades) {
  test(`${trade.label}: every CMS summary pin uses its own offering description or sourced name`, () => {
    for (const description of [trade.quote, '']) {
      const plan = planSlotFill({
        slotRoles: {
          groups: [
            {
              id: 'card',
              entityKind: 'service',
              allowedKinds: ['service'],
              itemIndex: 0,
              requiredRoles: ['offering.name']
            }
          ],
          bindings: [
            { slotKey: 'name', groupId: 'card', role: 'offering.name', mode: 'copy' },
            { slotKey: 'summary', groupId: 'card', role: 'offering.summary', mode: 'copy' }
          ]
        },
        profile: {
          business: {},
          offerings: [{ id: 'offer-1', value: { kind: 'service', name: trade.label, description } }]
        },
        assessment: [{ factId: 'offer-1', status: 'accepted' }],
        neutralFor
      })
      assert.equal(plan.writes.find((w) => w.slotKey === 'summary').value, description || trade.label)
    }
  })
  test(`${trade.label}: a kept card recovers an empty writer summary from its own sourced material`, () => {
    const map = summaryMap()
    const brief = {
      reading: {
        services: [
          { id: 'offer-1', label: trade.label, quote: trade.quote },
          { id: 'offer-2', label: trade.other, quote: `${trade.other} from our team.` }
        ]
      }
    }
    const { honesty } = planHonesty(brief, map)
    const out = honestWritten({
      slots: map.slots,
      written: { 'article-31.intro': '' },
      ownText: trade.quote,
      honesty
    })
    assert.equal(out.values['article-31.intro'], trade.quote)
    assert.equal(honesty.fallbacks['article-31.intro'].value, trade.quote)
    assert.equal(
      honesty.blanks.some((s) => s.key === 'article-31.intro'),
      false
    )
  })
}
