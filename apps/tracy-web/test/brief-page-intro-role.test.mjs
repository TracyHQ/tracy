import assert from 'node:assert/strict'
import { test } from 'node:test'
import { heroSlotValues } from '../src/sites/brief-engines/hero-lines.js'

for (const trade of ['Bread baking', 'Dental care']) {
  test(`${trade}: final copy check rewrites a contact pitch on a team page`, () => {
    const plan = {
      slots: [
        {
          key: 'module-9.1',
          decision: 'value',
          reason: 'intro-role',
          pageRole: 'team',
          value: 'Meet the people behind our work.',
          offerings: [trade]
        }
      ]
    }
    assert.deepEqual(
      heroSlotValues(plan, 'en', () => 'Come on in. Based in North Quarter. Locations across Westford.'),
      { 'module-9.1': 'Meet the people behind our work.' }
    )
    assert.deepEqual(
      heroSlotValues(plan, 'en', () => 'Meet our team and learn about their work.'),
      {}
    )
  })
}
test('legacy place decisions cannot append contact facts on a declared team page', () => {
  const plan = {
    slots: [
      {
        key: 'a',
        decision: 'value',
        reason: 'intro-where',
        pageRole: 'team',
        value: 'Based in North Quarter.',
        district: 'North Quarter',
        max: 180
      }
    ]
  }
  assert.deepEqual(heroSlotValues(plan), {})
})

test('rendered intros are checked across T4, T3, WordPress and EmDash without borrowing footer facts', async () => {
  const { checkPageIntros } = await import('../src/opportunities-build/page-intro-check.js')
  const sitePlan = { pages: [{ id: 'about/team', path: '/about/team', role: 'team', decision: 'keep' }] }
  for (const cls of ['t4-masthead', 't3-hero', 'wp-block-cover hero', 'page-intro']) {
    const page = (intro) => [
      {
        path: '/about/team',
        status: 200,
        html: `<html lang="en"><section class="${cls}"><h1>Our people</h1><p>${intro}</p></section><footer><p>Based in North Quarter.</p></footer></html>`
      }
    ]
    assert.equal(checkPageIntros({ sitePlan, pages: page('Come on in. Based in North Quarter.') }).length, 1)
    assert.deepEqual(checkPageIntros({ sitePlan, pages: page('Meet the people behind our work.') }), [])
  }
})

test('the final build report fails when a later write restores a mismatched introduction', async () => {
  const { runLeftoverCheck } = await import('../src/opportunities-build/demo-leftover-check.js')
  const report = await runLeftoverCheck({
    readPage: async (path) =>
      path.includes('missing-page')
        ? { status: 404, html: '' }
        : { status: 200, html: '<h1>Our people</h1><p>Come on in. Based in North Quarter.</p>' },
    check: () => ({ pass: true, findings: [], counts: {} }),
    brief: {},
    contentMap: {},
    sitePlan: { pages: [{ id: 'team', path: '/team', role: 'team', decision: 'keep' }] },
    paths: ['/team']
  })
  assert.equal(report.pass, false)
  assert.equal(report.pageIntros.length, 1)
  assert.equal(report.pageIntros[0].why, 'place-contact-intro-on-wrong-role')
})

test('JA masthead descriptions are checked even when the heading is h3 and the lead is a div', async () => {
  const { pageIntroduction } = await import('../src/opportunities-build/page-intro-check.js')
  assert.equal(
    pageIntroduction(
      '<div class="jamasthead"><h3>Our team</h3><div class="jamasthead-description">Based in North Quarter.</div></div>'
    ),
    'Based in North Quarter.'
  )
})

for (const trade of ['Bread baking', 'Dental care']) {
  test(`${trade}: a contact page keeps its role line and says the place after it`, () => {
    const plan = {
      slots: [
        {
          key: 'm.1',
          decision: 'value',
          reason: 'intro-role',
          pageRole: 'contact',
          value: 'Contact us with your questions.',
          offerings: [trade]
        },
        {
          key: 'm.1',
          decision: 'value',
          reason: 'intro-where',
          pageRole: 'contact',
          value: 'Based in North Quarter. Locations across Westford.',
          district: 'North Quarter',
          max: 180
        }
      ]
    }
    assert.deepEqual(heroSlotValues(plan, 'en', () => 'Come on in, we are so glad you are here.'), {
      'm.1': 'Contact us with your questions. Based in North Quarter. Locations across Westford.'
    })
  })
}

for (const trade of ['Bread baking', 'Dental care']) {
  test(`${trade}: a page with no intro of its own fails only on a place line, never on its shared tagline`, async () => {
    const { checkPageIntros } = await import('../src/opportunities-build/page-intro-check.js')
    const page = (intro) => [
      { path: '/plans', status: 200, html: `<h1>Plans</h1><p>${intro}</p>` },
      { path: '/team', status: 200, html: `<h1>Team</h1><p>${intro}</p>` }
    ]
    const sitePlan = {
      pages: [
        { id: 'plans', path: '/plans', role: 'pricing', decision: 'keep' },
        { id: 'team', path: '/team', role: 'team', decision: 'keep' }
      ],
      slots: [{ key: 'm.2', reason: 'intro-role', page: 'team', pageRole: 'team', offerings: [trade] }]
    }
    assert.deepEqual(
      checkPageIntros({ sitePlan, pages: page(`Fresh ${trade} for every day.`) }).map((f) => f.page),
      ['/team']
    )
    assert.deepEqual(
      checkPageIntros({ sitePlan, pages: page('Based in North Quarter.') }).map((f) => f.page),
      ['/plans', '/team']
    )
  })
}
