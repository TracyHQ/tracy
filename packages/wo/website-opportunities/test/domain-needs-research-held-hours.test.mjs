// Opening hours the brief holds off the site never come back from Google's listing (gap audit of the plan stage,
// 17/11/2026, row 4). The brief keeps no hours fact when the sources disagree, when one source says open all week, or
// when the owner left the hours off; its `missing` list says why. `researchOf` falls back to Google's hours only when
// the brief holds no hours at all, so the plan card never shows hours the step chain would have withheld. Invented
// brief only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-needs-research-held-hours.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { researchOf } from '../domain/needs-research.mjs'

const GOOGLE_HOURS = ['Monday: 9:00 AM to 5:00 PM', 'Tuesday: 9:00 AM to 5:00 PM']
const brief = (missing = []) => ({
  schemaVersion: 2,
  business: { name: 'Larkfen Invented Bakery' },
  facts: [
    {
      id: 'f-name',
      field: 'name',
      value: 'Larkfen Invented Bakery',
      evidence: [{ source: 'google', quote: 'Larkfen Invented Bakery' }],
      onSite: true
    }
  ],
  googlePlace: { placeId: 'invented-place', openingHours: GOOGLE_HOURS },
  missing
})
const hoursOf = (research) => research.sources.find((s) => s.id === 'google')?.fields?.['contact.hours']

test('with no hours fact and nothing held, Google listed hours are the hours', () => {
  assert.match(hoursOf(researchOf(brief())), /Monday/)
})

for (const why of [
  'The sources disagree on the opening hours: show no hours, not even sample hours, until the owner confirms them.',
  'The owner chose to leave the opening hours off the site: show no hours, not even sample hours.'
])
  test(`hours the brief holds off the site stay off: ${why.slice(0, 40)}`, () => {
    const research = researchOf(brief([{ field: 'hours', why }]))
    assert.equal(hoursOf(research), undefined)
    assert.ok(research.setAside.some((e) => e.what === 'opening hours' && e.reason === why))
  })
