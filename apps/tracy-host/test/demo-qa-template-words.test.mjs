/**
 * `no-demo-words` judges the template's text against the brief, not against the frozen research appended for
 * `facts-from-brief`. Local stand 24/10/2026: with the research (the business's own website pages, posts and
 * sources) in the vocabulary, 25 of the 30 agency blocks QuillHaus still showed ("For a small website with occasional
 * updates.") had 60% of their words "in the brief", and QA said "0 template passages left".
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, test } from 'node:test'

import { readDemoPage } from '../src/demo-qa-browser.js'
import { baselineOf, checkFactsFromBrief, checkNoDemoWords, demoQaBody } from '../src/demo-qa.js'

const page = (over = {}) => ({ path: '/', url: 'http://x/', status: 200, error: null, loadMs: 1, ...over })
const template = 'For a small website with occasional updates.'
const ours = 'Sunday roast carved tableside with live acoustic music.'
const prose = '# QuillHaus Al Barari\n- Sunday roast carved tableside, live acoustic music in the garden.'
// The business's own website, frozen as research: a privacy policy says "website", "with" and "updates".
const evidence =
  '{"sources":[{"text":"We may send you updates about our restaurant by email. Use of this website is subject to these terms. Open with the 7:30 PM show."}]}'

test('no-demo-words: template copy is judged against the brief’s prose, never the research’s vocabulary', () => {
  const baseline = baselineOf([page({ blocks: [{ text: template }, { text: ours }] })])
  const reads = [page({ blocks: [{ text: template }, { text: ours }] })]
  const asked = demoQaBody({
    label: 'acme',
    platform: 'wordpress',
    briefText: `${prose}\n${evidence}`,
    briefProse: prose
  })
  const check = checkNoDemoWords(reads, { ...asked, baseline })
  assert.deepEqual(
    check.detail.map((d) => d.words),
    [template.toLowerCase()]
  )
  // Facts still read the research: a time the business's own page states is held.
  assert.equal(checkFactsFromBrief([page({ text: 'Show at 7:30 PM' })], asked).pass, true)
})

test('no-demo-words: a caller that sends no prose is judged as before, on the whole brief text', () => {
  const baseline = baselineOf([page({ blocks: [{ text: template }] })])
  const check = checkNoDemoWords([page({ blocks: [{ text: template }] })], {
    baseline,
    briefText: `${prose}\n${evidence}`
  })
  assert.equal(check.pass, true)
})

const cdp = process.env.DEMO_QA_CDP
const opts = { skip: cdp ? false : 'set DEMO_QA_CDP (a chrome-watch CDP address)' }
if (cdp) after(() => setTimeout(() => process.exit(), 200))

test('a real read: an FAQ question in a <summary> is a block of the page’s text', opts, async () => {
  const { chromium } = await import('playwright')
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(
      '<!doctype html><title>FAQ</title><details><summary>Where does a website project start?</summary><p>With a brief and a call.</p></details>'
    )
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const browser = await chromium.connectOverCDP(cdp)
    const p = await browser.contexts()[0].newPage()
    const read = await readDemoPage(p, `http://127.0.0.1:${server.address().port}/`, '/')
    assert.ok(read.blocks.some((b) => b.text === 'Where does a website project start?'))
  } finally {
    server.close()
  }
})

// The Willow Nook build 13 (25/10/2026): the 22 template posts, each still showing the template's lorem body.
const BUILD13_POSTS = [
  '/lorem-ipsum/',
  '/10-most-alluring-ltos-on-menus-in-july/',
  '/4-habits-that-can-improve-your-customer-service/',
  '/5-of-the-summers-craziest-restaurant-marketing-stunts/',
  '/8-trends-trickling-down-to-mainstream-menus/',
  '/buffalo-wild-wings-considers-adding-sports-betting/',
  '/burger-king-takes-a-stand-on-the-pink-tax/',
  '/century-old-nathans-famous-aims-for-youth-with-new-look/',
  '/cocktail-bar-alchemist-set-to-open-at-mediacity-in-salford-quays/',
  '/did-ihops-publicity-stunt-hurt-applebees/',
  '/efforts-to-curb-soda-consumption-bring-results-on-both-coasts/',
  '/from-ihop-to-ihob-just-how-big-was-the-chains-name-reveal/',
  '/how-restaurants-can-promote-a-james-beard-recognition/',
  '/inside-olive-gardens-never-ending-pasta-pass/',
  '/jason-alexander-is-kfcs-new-colonel/',
  '/newks-eatery-steals-a-dinner-booster-from-supermarkets/',
  '/starbucks-brings-under-armour-exec-on-board/',
  '/this-weeks-5-head-spinning-restaurant-moments-1-more-inch/',
  '/this-weeks-restaurant-nightmares-language-people/',
  '/three-broomsticks-s-autumn-menu-unveiled/',
  '/three-broomsticks-welcomes-new-chef-caleb-nunez/',
  '/weve-been-nominated-for-the-britain-restaurant-awards/'
]
const BUILD13_LOREM = [
  'In enim justo, rhoncus ut, imperdiet a, venenatis vitae, justo. Nullam dictum felis eu pede mollis pretium. Integer tincidunt. Cras dapibus.',
  'Aenean leo ligula, porttitor eu, consequat vitae, eleifend ac, enim. Aliquam lorem ante, dapibus in, viverra quis, feugiat a, tellus.'
]
test('no-demo-words: a passage the template repeats on every post is counted on every route that still shows it', () => {
  // Build 13 said "9 template passages left", every lorem one on the first post read: the other 21 posts showing the
  // same body were never named, so posts-written and the sweep took them for written.
  const posts = BUILD13_POSTS.map((path) =>
    page({ path, blocks: BUILD13_LOREM.map((text) => ({ text, selector: 'p' })) })
  )
  const baseline = baselineOf([
    page({ blocks: [{ text: 'Welcome to JA Restaurant, a place for every taste.' }] }),
    ...posts
  ])
  const reads = [page({ blocks: [{ text: ours }] }), ...posts]
  const check = checkNoDemoWords(reads, { baseline, briefText: prose })
  assert.equal(check.pass, false)
  // Every route still showing template text, uncut.
  assert.deepEqual(check.routes, BUILD13_POSTS)
  assert.match(check.measured, /44 template passages left on 22 routes \(2 different\)/)
  // The message groups a passage once, naming every page that shows it.
  assert.equal(check.detail.length, 2)
  assert.deepEqual(check.detail[0].pages, BUILD13_POSTS)
  assert.equal(check.detail[0].page, BUILD13_POSTS[0])
  // Every passage with its routes, uncut by the message, for posts-written to judge each post by its page.
  assert.deepEqual(
    check.passages.map((p) => p.pages.length),
    [22, 22]
  )
})
