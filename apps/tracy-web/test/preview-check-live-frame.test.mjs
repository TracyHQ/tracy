/**
 * The preview probe's live frame (probe 10, `scripts/preview-check/live-frame.mjs`): the demo's page opened at its
 * own address with its scripts running, as both Design system popups and Try on show it, and settled the same way
 * every take. JA Resume's variant homes: the header's colour class is set by T3's script, so the static frame (no
 * script) judged a menu no customer sees; JA Seven's AOS LOAD MORE was revealed on one take and not the next.
 * Runs a real headless Chrome; skipped when no Chrome is on this machine.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import { frameSidesOf } from '../src/sites/design-system-live-page.js'
import { openLiveFrame, pressSideExpression } from '../scripts/preview-check/live-frame.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 120_000 }

// a page as a T3 template serves it: a slot it already wears, a header its script colours, an AOS reveal
const PAGE = `<!doctype html><html><head><title>t</title>
<style id="tracy-ds-slot">body{background:rgb(1,2,3)}</style>
<style>[data-aos]{opacity:0;transition:opacity .3s}[data-aos].aos-animate{opacity:1}</style></head>
<body><header id="h">Menu</header><div style="height:3000px"></div><div id="more" data-aos="fade-up">LOAD MORE</div>
<script>document.getElementById('h').classList.add('style-white')</script></body></html>`

let server
let chrome
let address
before(async () => {
  if (opts.skip) return
  server = createServer((req, res) =>
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE)
  )
  await new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(null)))
  address = `http://127.0.0.1:${server.address().port}/`
  chrome = await browser(9520 + Math.floor(Math.random() * 20))
})
after(() => {
  chrome?.close()
  server?.close()
})

const demo = () => ({ platform: 'joomla', tag: 'quickstart/ja-seven/j6', version: '1.0.4', address })

test(
  'the Template default page runs its scripts, its worn slot taken off, every reveal shown',
  opts,
  async () => {
    const r = await openLiveFrame(chrome, {
      d: demo(),
      id: null,
      path: '/',
      scheme: 'light',
      parentOrigin: 'http://127.0.0.1:1',
      fetchImpl: fetch
    })
    assert.ok(!('miss' in r), JSON.stringify(r))
    const seen = await chrome.evaluate(
      `({ header: document.getElementById('h').className, more: getComputedStyle(document.getElementById('more')).opacity, bg: getComputedStyle(document.body).backgroundColor, at: location.href })`
    )
    // the page's own script ran, as it does in the popup and after Try on
    assert.equal(seen.header, 'style-white')
    // a reveal below the first screen is shown and played out, the same on every take
    assert.equal(seen.more, '1')
    // the slot the page wore is taken off (liveWornHtmlOf bare) and the page stays at its own address
    assert.notEqual(seen.bg, 'rgb(1, 2, 3)')
    assert.equal(seen.at, address)
    assert.doesNotMatch(r.html, /id="tracy-ds-slot"/)
    assert.match(r.html, /data-tracy-ds-preview/)
  }
)

test('the popup Light | Dark press puts the contract hook on the page', opts, async () => {
  await chrome.open(address, 1440, {})
  await chrome.evaluate(pressSideExpression(frameSidesOf({ hook: '.dark-mode' }), 'dark'))
  assert.equal(await chrome.evaluate(`document.documentElement.classList.contains('dark-mode')`), true)
  await chrome.evaluate(pressSideExpression(frameSidesOf(), 'dark'))
  assert.equal(await chrome.evaluate(`document.documentElement.getAttribute('data-theme')`), 'dark')
})

/**
 * JA Vogue 1.0.7 home-3 (18/10/2026): the editorial carousel lists its articles in a random order, a new draw on
 * every request, so the template's page and the worn one carried different articles (a tall card where the other
 * had a short one) and shrunk-block judged a box against a different article. Every view of one page reads the
 * server's first answer for each document (`draws`), so the template's page and each worn one hold the same draw.
 */
test('every view of one page reads the same server answer', opts, async () => {
  let n = 0
  const drawn = createServer((req, res) =>
    res
      .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      .end(
        `<!doctype html><html><head><title>t</title></head><body><p id="draw">draw ${++n}</p></body></html>`
      )
  )
  await new Promise((ok) => drawn.listen(0, '127.0.0.1', () => ok(null)))
  try {
    const d = { ...demo(), address: `http://127.0.0.1:${drawn.address().port}/` }
    /** @type {Map<string, string>} */
    const draws = new Map()
    const seen = []
    for (const id of [null, 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0']) {
      const r = await openLiveFrame(chrome, {
        d,
        id,
        path: '/',
        scheme: 'light',
        parentOrigin: 'http://127.0.0.1:1',
        fetchImpl: fetch,
        draws
      })
      assert.ok(!('miss' in r), JSON.stringify(r))
      seen.push(await chrome.evaluate(`document.getElementById('draw').textContent`))
    }
    assert.ok(n >= 2, 'the server was asked on each view')
    assert.equal(seen[1], seen[0], 'the worn page holds the draw the template page held')
  } finally {
    drawn.close()
  }
})
