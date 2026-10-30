/**
 * The "brief facts not shown" list of a site plan (ticket #241): code adds an entry with a reason for every fact-sheet
 * record the plan does not place, keeps the author's own reasons, and the accepted plan saved by the author carries it.
 * Fictional business: a bicycle repair shop.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { briefFactSheet } from '../src/sites/brief-engines/brief-fact-sheet.js'
import { withBriefOutOfScope } from '../src/sites/brief-engines/site-plan-out-of-scope.js'

const BRIEF = {
  reading: {
    services: [
      { id: 's1', label: 'Wheel truing', quote: 'Wheel truing from $25' },
      { id: 's2', label: 'Brake service', quote: 'Brake pads checked' },
      { id: 's3', label: 'Cargo bike repairs', quote: 'Cargo bikes kept rolling' }
    ],
    team: [{ id: 'p1', label: 'Ines Okafor', role: 'Mechanic', quote: 'Ten years on the bench' }]
  },
  googlePlace: { reviews: [{ text: 'Fixed my wheel in an hour, brilliant service', author: 'Dana' }] }
}
const site = { factSheet: briefFactSheet(BRIEF) }

const plan = () => ({
  pages: [
    {
      id: 'page:a',
      decision: 'keep',
      purpose: 'Home',
      lead: 'We fix bikes',
      facts: ['offering-2'],
      items: ['Wheel truing']
    },
    { id: 'page:b', decision: 'drop', lead: 'Cargo bike repairs' }
  ],
  glossary: [{ name: 'Wheel truing', kind: 'offering', description: 'Wheels made true' }],
  decisions: [],
  outOfScope: { template: [], brief: [] }
})

test('every record the plan does not place is listed with a reason; placed ones are not', () => {
  const out = withBriefOutOfScope(plan(), site).outOfScope.brief
  const ids = out.map((o) => o.sourceId).sort()
  // offering-1 by name, offering-2 by source id are placed; a dropped page does not place offering-3.
  assert.deepEqual(ids, ['offering-3', 'person-1', 'review-1'])
  assert.ok(out.every((o) => o.reason.length > 10))
})

test('the author entries keep their reason; an empty reason gets a default; nothing is listed twice', () => {
  const p = plan()
  p.outOfScope.brief = [
    { sourceId: 'person-1', reason: 'the owner asked for no staff names' },
    { sourceId: 'review-1', reason: '' }
  ]
  const out = withBriefOutOfScope(p, site).outOfScope.brief
  assert.equal(out.find((o) => o.sourceId === 'person-1').reason, 'the owner asked for no staff names')
  assert.ok(out.find((o) => o.sourceId === 'review-1').reason)
  assert.equal(out.filter((o) => o.sourceId === 'person-1').length, 1)
  assert.equal(out.length, 3)
})

test('a plan or a site without a fact sheet is returned safely', () => {
  assert.equal(withBriefOutOfScope(null, site), null)
  assert.deepEqual(withBriefOutOfScope(plan(), {}).outOfScope.brief, [])
})
