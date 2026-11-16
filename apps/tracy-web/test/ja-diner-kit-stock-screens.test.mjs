// The committed JA Diner j6 1.0.8 kit declares its stock screens: the four colour variants of the home page and the two
// Joomla account screens. Before the declaration the planner opened their page shots on every build (dev, 16/11/2026:
// about 60 shots of JA Diner, its later turns 70 to 120 s each) and then dropped them anyway. A kit rebuild that loses
// the field brings that back without an error, so the committed kit is read here.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { stockScreenPagesOf, stockScreensOf, stockScreensToDrop } from '../src/lib/stock-screens.js'

const kit = JSON.parse(
  readFileSync(
    new URL(
      '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-diner/j6/1.0.8/template-kit.json',
      import.meta.url
    ),
    'utf8'
  )
)

const STOCK = [
  '/home/home-red',
  '/home/home-pink',
  '/home/home-green',
  '/home/home-blue',
  '/password-reset',
  '/username-reminder-request'
]

test('the JA Diner 1.0.8 kit declares its stock screens with a reason each and no problem', () => {
  const { screens, problems } = stockScreensOf(kit)
  assert.deepEqual(problems, [])
  assert.deepEqual(
    screens.map((s) => s.path),
    ['/home/*', '/password-reset', '/username-reminder-request']
  )
  for (const screen of screens) assert.ok(screen.why.length > 20, screen.path)
})

test('the stock screens are the home colour variants and the two account screens, and the home page is not one', () => {
  const pages = stockScreenPagesOf(kit)
  assert.deepEqual(pages.map((p) => p.path).sort(), [...STOCK].sort())
  assert.ok(
    pages.every((p) => p.inKit),
    'every declared screen is a page of the kit'
  )
  const paths = new Set(pages.map((p) => p.path))
  for (const kept of [
    '/',
    '/about-us',
    '/contact-us',
    '/offers',
    '/reservation',
    '/our-blog',
    '/j-pages/login'
  ])
    assert.equal(paths.has(kept), false, `${kept} is not a stock screen`)
})

test('a plan that keeps the home page has the write step drop exactly the stock screens', () => {
  const home = kit.pages.find((p) => p.path === '/')
  const plan = { pages: [{ id: home.id, decision: 'keep' }] }
  assert.deepEqual(
    stockScreensToDrop(kit, plan)
      .map((p) => p.path)
      .sort(),
    [...STOCK].sort()
  )
})
