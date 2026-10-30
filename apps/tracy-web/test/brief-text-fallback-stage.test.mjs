import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writeFooterNavigation } from '../src/sites/brief-engines/footer-navigation.js'
import { buttonActionValues } from '../src/sites/brief-engines/button-action-values.js'
import { offeringSummaryValues } from '../src/sites/brief-engines/offering-summaries.js'
import { settleText } from '../src/sites/brief-engines/text-fallback.js'

// One rule for the fill stage (#189): a short text the model wrote that fails its check never stops the build; it takes a
// deterministic value from the brief, the swap is recorded, and the build goes on. Fictional businesses of two trades.

/** A fictional CMS footer: two declared link columns, read back exactly as written. */
function footerSite() {
  const columns = [
    { id: 'footer-offerings', holds: 'offerings', demoHeading: 'OUR LESSONS', headingMax: 22, linkMax: 30 },
    { id: 'footer-company', holds: 'company', demoHeading: 'EXPLORE', headingMax: 22, linkMax: 30 }
  ].map((c) => ({ ...c, heading: c.demoHeading, hidden: false, links: [] }))
  return {
    read: async () => ({
      columns,
      items: [],
      offeringPages: [{ id: 'article-41', path: '/courses/wheel-throwing', label: 'Wheel throwing' }]
    }),
    write: async ({ columns: written }) => {
      for (const w of written) {
        const native = columns.find((c) => c.id === w.id)
        native.heading = w.heading
        native.links = w.links.map((l) => ({ path: l.path, label: l.label }))
      }
    },
    columns
  }
}

const potteryPlan = {
  brand: { name: { value: 'Mudlark Pottery' }, description: { value: 'A pottery studio.' } },
  pages: [
    { id: 'home', path: '/', role: 'home', decision: 'keep', title: 'Home' },
    { id: 'courses', path: '/courses', role: 'services', decision: 'keep', title: 'Courses' },
    { id: 'contact', path: '/contact', role: 'contact', decision: 'keep', title: 'Visit the studio' }
  ]
}

test('footer: a demo heading and a generic link label from the model fall back to brief values, recorded, no build stop', async () => {
  const site = footerSite()
  const notes = []
  const result = await writeFooterNavigation({
    sitePlan: potteryPlan,
    read: site.read,
    write: site.write,
    note: (line) => notes.push(line),
    known: { home: 'Home', courses: 'Courses' },
    model: {
      chat: async ({ messages }) => {
        const asked = JSON.parse(messages[1].content)
        return JSON.stringify({
          // The model echoes the template's demo heading and writes an empty one.
          headings: { 'footer-offerings': 'Our lessons', 'footer-company': '' },
          labels: Object.fromEntries(asked.links.map((l) => [l.key, 'Learn more']))
        })
      }
    }
  })
  assert.deepEqual(
    result.columns.map((c) => c.heading),
    ['Courses', 'Mudlark Pottery']
  )
  // The contact page had no name from the main menu; its own page title stands in for the generic label.
  assert.ok(result.columns[1].links.some((l) => l.label === 'Visit the studio'))
  assert.deepEqual(
    result.fallbacks.map((f) => [f.key, f.reason]),
    [
      ['footer-offerings', 'demo-heading'],
      ['footer-offerings.1', 'generic-label'],
      ['footer-company', 'empty-heading'],
      ['footer-company.1', 'generic-label']
    ]
  )
  assert.deepEqual(result.findings, [])
  assert.equal(notes.length, 4)
  assert.ok(result.columns[0].links.some((l) => l.label === 'Wheel throwing'))
  assert.equal(site.columns[0].heading, 'Courses')
})

test('button action: a declared label too long for its box, or not translated, is recorded and left to the writer', async () => {
  const sitePlan = {
    slots: [
      {
        key: 'cta.label',
        decision: 'value',
        value: 'Reserve a tasting table',
        valueType: 'text',
        reason: 'button-action'
      },
      { key: 'cta.url', decision: 'value', value: '/reservations', valueType: 'url', reason: 'button-action' }
    ]
  }
  const notes = []
  const long = await buttonActionValues({
    sitePlan,
    slots: [{ key: 'cta.label', type: 'text', maxCharacters: 14 }],
    note: (line) => notes.push(line)
  })
  assert.equal('cta.label' in long, false)
  assert.equal(long['cta.url'], '/reservations')
  const untranslated = await buttonActionValues({
    sitePlan,
    locale: 'de-DE',
    note: (line) => notes.push(line)
  })
  assert.equal('cta.label' in untranslated, false)
  assert.equal(untranslated['cta.url'], '/reservations')
  assert.equal(notes.filter((l) => l.startsWith('BLOCKER button action cta.label')).length, 2)
})

test('offering summary: a summary that cannot be translated is recorded and left to the description writer', async () => {
  const slots = [
    {
      key: 'article-7.intro',
      role: 'offering.summary',
      group: { id: 'brief:espresso' },
      sample: 'Demo card text.'
    }
  ]
  const honesty = {
    cardNames: { 'brief:espresso': 'Espresso flight' },
    fallbacks: { 'article-7.intro': { value: 'Three single-origin shots side by side.' } }
  }
  const notes = []
  const values = await offeringSummaryValues({
    slots,
    honesty,
    written: {},
    locale: 'de',
    note: (line) => notes.push(line)
  })
  assert.equal('article-7.intro' in values, false)
  assert.ok(notes.some((l) => l.startsWith('BLOCKER offering summary article-7.intro')))
})

test('the shared rule: the first candidate that passes the same check stands in; none passing is a blocker finding', () => {
  const invalid = (t) => (t ? (t.length > 8 ? 'too-long' : null) : 'empty')
  assert.deepEqual(settleText({ site: 's', key: 'k', value: 'Fine', invalid }), { text: 'Fine' })
  const swapped = settleText({
    site: 's',
    key: 'k',
    value: 'Far too long',
    invalid,
    candidates: [
      { source: 'page title', text: 'Also too long' },
      { source: 'business name', text: 'Kiln' }
    ]
  })
  assert.equal(swapped.text, 'Kiln')
  assert.equal(swapped.fallback.source, 'business name')
  const none = settleText({ site: 's', key: 'k', value: '', invalid, candidates: [] })
  assert.equal(none.text, null)
  assert.equal(none.finding.severity, 'blocker')
})
