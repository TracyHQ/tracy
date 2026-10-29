import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  footerDemoWords,
  invalidFooterHeading,
  navigationGroupProblems,
  offeringPagesLinkedFrom,
  planFooterNavigation
} from '../domain/footer-navigation.mjs'

const groups = [
  { id: 'footer-offerings', holds: 'offerings' },
  { id: 'footer-company', holds: 'company' }
]

for (const [trade, index, offerings] of [
  ['bakery', 'workshops', ['sourdough-basics', 'croissant-day']],
  ['dental clinic', 'treatments', ['cleaning', 'whitening']]
]) {
  test(`${trade}: every kept page lands in one footer column by role, offerings apart from company pages`, () => {
    const sitePlan = {
      pages: [
        { id: 'home', path: '/', role: 'home', decision: 'keep' },
        { id: index, path: `/${index}`, role: 'other', decision: 'keep' },
        { id: 'about', path: '/about', role: 'about', decision: 'keep' },
        { id: 'about/team', path: '/about/team', role: 'team', decision: 'keep' },
        { id: 'contact', path: '/contact', role: 'contact', decision: 'keep' },
        { id: 'pricing', path: '/pricing', role: 'pricing', decision: 'drop' }
      ]
    }
    const offeringPages = offerings.map((o) => ({ id: `article-${o}`, path: `/${index}/${o}`, label: o }))
    const plan = planFooterNavigation({ sitePlan, groups, offeringPages })
    assert.deepEqual(
      plan.columns.map((c) => [c.id, c.links.map((l) => l.path)]),
      [
        ['footer-offerings', [`/${index}`, ...offeringPages.map((o) => o.path)]],
        ['footer-company', ['/', '/about', '/about/team', '/contact']]
      ]
    )
    assert.deepEqual(plan.off, [])
    // One column: it takes every page. No offerings kept: the offerings column is taken off.
    assert.equal(
      planFooterNavigation({ sitePlan, groups: [groups[1]], offeringPages }).columns[0].links.length,
      5 + offerings.length
    )
    const noOfferings = { pages: sitePlan.pages.filter((p) => p.id !== index) }
    assert.deepEqual(planFooterNavigation({ sitePlan: noOfferings, groups }).off, ['footer-offerings'])
  })
}

test('demo, generic and empty column headings are refused; the business words pass', () => {
  const demo = new Set(['site map', 'classes'])
  assert.equal(invalidFooterHeading('SITE MAP', { demo }), 'demo-heading')
  assert.equal(invalidFooterHeading('Classes', { demo }), 'demo-heading')
  assert.equal(invalidFooterHeading('Quick links', { demo }), 'generic-heading')
  assert.equal(invalidFooterHeading(' ', { demo }), 'empty-heading')
  assert.equal(invalidFooterHeading('Our treatments and care', { demo, max: 10 }), 'invalid-heading')
  assert.equal(invalidFooterHeading('Our workshops', { demo }), null)
})

test('navigation group declarations: shape, link slots and every footer menu column declared', () => {
  const map = {
    slots: [
      { key: 'module-7.0', type: 'text', sample: 'SITE MAP', role: 'editorial.heading' },
      { key: 'menuItem-9.0', type: 'text', sample: 'Price', role: 'editorial.menu_label' },
      { key: 'module-8.0', type: 'text', sample: 'Intro', role: 'editorial.paragraph' }
    ],
    navigationGroups: [
      {
        id: 'footer-company',
        placement: 'footer',
        holds: 'company',
        heading: 'module-7.0',
        container: 'module-7',
        menu: 'site-map',
        links: ['menuItem-9.0']
      }
    ]
  }
  assert.deepEqual(navigationGroupProblems(map, ['module-7']), [])
  assert.deepEqual(navigationGroupProblems({ slots: map.slots }, ['module-7']), [
    'footer link column "module-7" is not declared as a navigation group'
  ])
  const bad = navigationGroupProblems(
    {
      slots: map.slots,
      navigationGroups: [
        { id: 'x', placement: 'aside', holds: 'all', heading: 'module-8.1', links: ['module-8.0'] }
      ]
    },
    []
  )
  assert.equal(bad.length, 4)
  assert.deepEqual([...footerDemoWords(map).headings, ...footerDemoWords(map).links], ['site map', 'price'])
})

test('offering pages are the child routes an offerings index links to, one level down', () => {
  assert.deepEqual(
    offeringPagesLinkedFrom('/treatments', [
      '/index.php/treatments/cleaning',
      '/treatments/whitening',
      '/treatments/whitening',
      '/treatments',
      '/treatments/a/b',
      '/about'
    ]),
    ['/treatments/cleaning', '/treatments/whitening']
  )
})
