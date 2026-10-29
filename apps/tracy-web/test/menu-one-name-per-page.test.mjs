// One page, one name across the header, the footer and the breadcrumbs (spec TracyHQ/tracy#189 round 9, class C6).
// Measured on a real build: the header said "About" and its child "About Us" for one page, the team page was "Our
// trainers" in the header and "Team" in the footer, and an offering page kept the demo article's title in the footer.
// Two invented businesses: a tailor and a climbing gym.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writeMainMenu } from '../src/sites/brief-engines/main-menu.js'
import { writeFooterNavigation } from '../src/sites/brief-engines/footer-navigation.js'
import { offeringNameOf } from '../src/sites/brief-engines/footer-navigation-joomla.js'

test('every main-menu entry of one page carries the label of its first entry', async () => {
  const pages = [
    { id: 'home', path: '/', role: 'home', decision: 'keep' },
    { id: 'about', path: '/about', role: 'about', decision: 'keep' }
  ]
  let items = [
    { key: '1', path: '/', label: 'Home', parent: '', menu: 'main' },
    { key: '2', path: '/about', label: 'About', parent: '', menu: 'main' },
    { key: '3', path: '/about', label: 'About Us', parent: '2', menu: 'main' }
  ]
  const out = await writeMainMenu({
    sitePlan: { pages },
    read: async () => structuredClone(items),
    write: async (rows) => {
      items = items.map((i) => ({ ...i, label: rows.find((r) => r.key === i.key)?.label ?? i.label }))
    },
    model: {
      chat: async () => JSON.stringify({ labels: { 1: 'Home', 2: 'Our atelier', 3: 'About the tailor' } })
    }
  })
  assert.deepEqual(
    out.items.map((i) => i.label),
    ['Home', 'Our atelier', 'Our atelier']
  )
})

test('a footer link takes the name the main menu gave its page, whatever the model says', async () => {
  const sitePlan = {
    pages: [
      { id: 'home', path: '/', role: 'home', decision: 'keep' },
      { id: 'about/our-coaches', path: '/about/our-coaches', role: 'team', decision: 'keep' }
    ]
  }
  let written = null
  const column = () => ({
    id: 'footer-company',
    holds: 'company',
    heading: written ? 'The gym' : 'SITE MAP',
    demoHeading: 'SITE MAP',
    headingMax: 30,
    linkMax: 30,
    links: written
      ? written.columns[0].links.map((l, i) => ({ key: String(i), path: l.path, label: l.label }))
      : [
          { key: 'a', path: '/', label: 'Home' },
          { key: 'b', path: '/about/our-coaches', label: 'Team' }
        ]
  })
  const out = await writeFooterNavigation({
    sitePlan,
    read: async () => ({ columns: [column()], items: [] }),
    write: async (plan) => {
      written = plan
    },
    model: {
      chat: async () =>
        JSON.stringify({
          headings: { 'footer-company': 'The gym' },
          labels: { 'footer-company.0': 'Home', 'footer-company.1': 'Team' }
        })
    },
    known: { home: 'Home', 'about/our-coaches': 'Our coaches' }
  })
  assert.deepEqual(
    out.columns[0].links.map((l) => l.label),
    ['Home', 'Our coaches']
  )
})

test("an offering page is named in the footer by the plan's name of its offering, not by the demo article's title", () => {
  const contentMap = { entities: [{ key: 'article-16', kind: 'article', sourceId: 16 }] }
  const cardNames = { 'article-16.offering': 'Bouldering' }
  assert.deepEqual(offeringNameOf({ id: 16, title: 'Advanced Boxing' }, { contentMap, cardNames }), {
    label: 'Bouldering',
    planned: true
  })
  assert.deepEqual(offeringNameOf({ id: 17, title: 'Lead climbing' }, { contentMap, cardNames }), {
    label: 'Lead climbing',
    planned: false
  })
})
