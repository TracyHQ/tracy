// The site check walks every page a kept page links to (reachable-pages.js): a link that answers nothing, an unplanned page that
// still prints the demo's words, a card whose name leads to another card's page, and an icon in a family the page loads no sheet
// for are blocking. Invented pages, invented people, invented business.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { textKey } from '../src/site-check/demo-baseline.js'
import { iconGlyphsGroup, reachablePagesGroup } from '../src/site-check/reachable-pages.js'
import { runSiteCheck } from '../src/site-check/site-check.js'

const FA5 = '<link href="/plugins/demo/vendors/font-awesome5/css/all.min.css?1" rel="stylesheet">'
const page = (body, head = FA5) =>
  `<html><head><title>Invented Club</title>${head}</head><body>${body}</body></html>`
const MENU =
  '<nav><a href="/index.php">Home</a> <a href="/index.php/team">Team</a> <a href="/index.php/prices">Coaches</a></nav>'
const SITE = {
  '/': page(`${MENU}<h1>Welcome to the Invented Club</h1>`),
  '/team': page(
    `${MENU}<h1>Meet the team</h1><div class="item"><h4><a href="/index.php/team/ana">Ana</a></h4></div>` +
      '<div class="item"><h4><a href="/index.php/team/ana">Ben</a></h4></div><a href="/index.php/team/cleo">Cleo</a>'
  ),
  '/index.php/team/ana': page(`${MENU}<h1>Meet Ana</h1><p>Ana coaches the morning group.</p>`),
  '/index.php/prices': page(
    `${MENU}<h1>Coaches</h1><h3>Demo Champ Plus</h3><p>Unlimited demo sessions every week</p>`
  )
}
const pageHtml = async (path) => SITE[path] ?? null
const report = {
  keptPages: [
    { id: 'page-home', path: '/' },
    { id: 'page-team', path: '/team' }
  ]
}
const baseline = { texts: [textKey('Demo Champ Plus'), textKey('Unlimited demo sessions every week')] }

test('a menu link to an unplanned page that prints the demo is blocking', async () => {
  const out = await reachablePagesGroup.run({ report, pageHtml, baseline })
  const demo = out.failures.find((f) => f.page === '/index.php/prices')
  assert.ok(demo, 'the demo price page is opened although the plan does not keep it')
  assert.match(demo.reason, /2 blocks of the demo/)
  assert.match(demo.reason, /"Coaches"/)
})

test('a link that answers nothing is blocking', async () => {
  const out = await reachablePagesGroup.run({ report, pageHtml, baseline })
  assert.ok(
    out.failures.some((f) => f.measured === '/index.php/team/cleo' && /does not answer/.test(f.reason))
  )
})

test("a card's name that leads to another card's page is blocking, the page's own card is not", async () => {
  const out = await reachablePagesGroup.run({ report, pageHtml, baseline })
  const cards = out.failures.filter((f) => /The card/.test(f.reason)).map((f) => f.measured)
  assert.deepEqual([...new Set(cards)], ['Ben'])
})

test('an icon in a Font Awesome 6 family on a page that loads Font Awesome 5 draws nothing and blocks', async () => {
  const icons = (cls) => async () =>
    page(`<a href="https://social.example/club"><span class="font-icon ${cls}"></span></a>`)
  const red = await iconGlyphsGroup.run({ report, pageHtml: icons('fa-brands fa-instagram') })
  assert.equal(red.failures[0].measured, 'font-icon fa-brands fa-instagram')
  const green = await iconGlyphsGroup.run({ report, pageHtml: icons('fa fa-instagram') })
  assert.deepEqual(green.failures, [])
})

test('both groups run in the site check when a page reader is given', async () => {
  const door = { apply: async () => ({ ok: true, slots: [], pages: [] }) }
  const check = await runSiteCheck({
    door,
    report: { ...report, status: 'done', slots: [], siteKey: 's' },
    pageHtml,
    baseline,
    allGroups: true
  })
  const names = check.groups.map((g) => g.name)
  assert.ok(names.includes('reachable-pages') && names.includes('icon-glyphs'))
  assert.equal(check.groups.find((g) => g.name === 'reachable-pages').status, 'red')
})
