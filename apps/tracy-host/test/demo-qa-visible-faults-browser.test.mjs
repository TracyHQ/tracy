/**
 * The faults a visitor sees and the first site check called green, on an invented page served from here: a heading printed by a
 * div, a heading that is only visually hidden, a button with no words, a button that goes nowhere, a form field nothing names,
 * and words glued to a highlight. Launches its own headless Chromium; skipped when Playwright is not installed.
 *   node --test --test-concurrency=1 apps/tracy-host/test/demo-qa-visible-faults-browser.test.mjs
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, test } from 'node:test'
import { readDemoPage } from '../src/demo-qa-browser.js'

let playwright = null
try {
  playwright = await import('playwright')
} catch {}
const opts = { skip: playwright ? false : 'playwright is not installed' }
after(() => setTimeout(() => process.exit(), 200))

const HIDDEN = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap'
const head =
  '<meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;font:16px sans-serif}.btn{display:inline-block;padding:8px 16px}.title-has-highlight:not(.shown) br{display:none}</style>'
const PAGES = {
  '/faults': `${head}
    <h1 id="seen" style="${HIDDEN}">A long hidden heading that runs far past its one pixel box on purpose</h1>
    <div id="hero" class="title-has-highlight" aria-hidden="true">Lantern <br/><span>Rowing</span></div>
    <h2 id="cut">Rowing for</h2>
    <a id="empty" href="/next" class="btn"></a>
    <a id="nowhere" href="#" class="btn">Book a seat</a>
    <a id="toggle" href="#" class="btn" data-bs-toggle="modal">Open the map</a>
    <a id="drawn" href="/next" class="btn"><svg width="10" height="10"></svg></a>
    <form>
      <label for="named">Your name</label><input id="named" name="named">
      <input id="hinted" name="hinted" placeholder="Your phone">
      <input id="blank" name="blank">
      <input type="hidden" name="secret">
      <button id="send" type="submit"></button>
    </form>
    <div id="glued">Open to<span>Every age</span>every level</div>
    <h2 id="hidden-br" class="title-has-highlight">A lesson in the<br/><span>pool</span></h2>
    <h2 id="space-hidden-br" class="title-has-highlight">A lesson in the <br/><span>pool</span></h2>
    <h2 id="shown-br" class="title-has-highlight shown">A lesson in the<br/><span>pool</span></h2>
    <div id="spaced">Open to <span>Every age</span> every level</div>
    <div>Own <b>words</b> stand <i>apart</i></div>`,
  '/clean': `${head}<h1>Rowing for every age</h1><a href="/next" class="btn">Book a seat</a><p>Short and sound.</p>`
}

function site() {
  const server = createServer((req, res) => {
    const html = PAGES[req.url.split('?')[0]]
    res.writeHead(html ? 200 : 404, { 'content-type': 'text/html' }).end(html ?? '<p>Not found</p>')
  })
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` })
    )
  )
}

async function read(path) {
  const { server, base } = await site()
  const browser = await playwright.chromium.launch({ headless: true })
  try {
    const page = await (await browser.newContext()).newPage()
    return await readDemoPage(page, `${base}${path}`, path, { measurePages: true })
  } finally {
    await browser.close()
    server.close()
  }
}

test('a page with each fault reports each, at both widths', opts, async () => {
  const r = await read('/faults')
  assert.deepEqual(
    r.measures.map((m) => m.width),
    [1440, 390]
  )
  for (const m of r.measures) {
    assert.ok(
      !m.textBoxes.some((t) => t.selector.includes('#seen')),
      'a visually hidden heading overflows nothing'
    )
    assert.deepEqual(
      m.controls.map((c) => [c.selector, c.fault]).sort(),
      [
        ['a#empty.btn', 'wordless'],
        ['a#nowhere.btn', 'nowhere'],
        ['button#send', 'wordless']
      ].sort()
    )
    assert.deepEqual(
      m.fields.map((f) => f.selector),
      ['input#blank']
    )
    assert.equal(m.glued.length, 3)
    assert.deepEqual(
      m.glued.map((g) => g.selector).sort(),
      ['div#glued', 'div#glued', 'h2#hidden-br.title-has-highlight'],
      'a break the page hides does not stand between the words; a space beside it or a visible break does'
    )
    assert.deepEqual(
      m.headings,
      ['Rowing for', 'A lesson in thepool', 'A lesson in the pool', 'A lesson in the pool'],
      'a visually hidden heading is not what shows'
    )
  }
})

test('a heading a div prints is read as words of the page', opts, async () => {
  const r = await read('/faults')
  const hero = r.blocks.find((b) => b.selector?.includes('#hero'))
  assert.ok(hero, JSON.stringify(r.blocks))
  assert.equal(hero.text, 'Lantern Rowing')
  assert.equal(hero.short, true)
})

test('a sound page reports none of them', opts, async () => {
  const [m] = (await read('/clean')).measures
  assert.deepEqual([m.controls, m.fields, m.glued], [[], [], []])
  assert.deepEqual(m.headings, ['Rowing for every age'])
})
