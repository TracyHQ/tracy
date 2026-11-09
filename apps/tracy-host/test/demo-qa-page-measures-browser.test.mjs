/**
 * The browser half of `pageMeasures` on an invented page served from here: links, text that overflows, a block far taller
 * than a screen and a stretched picture, each read at 1440 and 390, and the same page with none of them reads clean.
 * Launches its own headless Chromium; skipped when Playwright or its browser is not installed.
 *   node --test --test-concurrency=1 apps/tracy-host/test/demo-qa-page-measures-browser.test.mjs
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, test } from 'node:test'
import { deflateSync } from 'node:zlib'

import { readDemoPage } from '../src/demo-qa-browser.js'
import { withLinkStatus } from '../src/demo-qa-links.js'

let playwright = null
try {
  playwright = await import('playwright')
} catch {}
const opts = { skip: playwright ? false : 'playwright is not installed' }
after(() => setTimeout(() => process.exit(), 200))

// A 40 x 10 grey PNG, built here: wide, so a square box stretches it.
const crc = (buf) => {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data])
  const out = Buffer.alloc(body.length + 8)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc(body), body.length + 4)
  return out
}
const header = Buffer.alloc(13)
header.writeUInt32BE(40, 0)
header.writeUInt32BE(10, 4)
header.set([8, 0, 0, 0, 0], 8)
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: 10 }, () => Buffer.alloc(41, 0x80))))),
  chunk('IEND', Buffer.alloc(0))
])
const head =
  '<meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;font:16px sans-serif}</style>'
const PAGES = {
  '/broken': `${head}<nav><a href="/fine">Fine</a> <a href="/missing">Missing page</a> <a href="https://elsewhere.example/x">Elsewhere</a> <a href="#top">Top</a> <a href="mailto:a@b.test">Mail</a></nav>
    <p id="clip" style="width:120px;overflow:hidden;white-space:nowrap">A very long unbroken sentence that cannot fit its box</p>
    <p id="clamp" style="width:120px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">Another long sentence cut on purpose with an ellipsis</p>
    <section id="tall" style="height:3000px">Tall</section>
    <img id="squash" src="/wide.png" style="width:200px;height:200px;object-fit:fill" alt="">
    <img id="crop" src="/wide.png" style="width:200px;height:200px;object-fit:cover" alt="">
    <img id="fine" src="/wide.png" style="width:200px;height:50px" alt="">`,
  '/clean': `${head}<nav><a href="/fine">Fine</a></nav><p>Short and sound.</p><section style="height:300px">Block</section>
    <img src="/wide.png" style="width:200px;height:50px" alt="">`,
  '/list': `${head}<style>.hero-title span{color:rgb(191,91,61)}</style><h1 class="hero-title"><span>NO1</span> Boxing studio</h1><section id="steps"><p>Warm up first.</p><ul id="points"><li>Jog</li><li>Pads and bags</li><li style="display:none">Hidden</li></ul></section>`,
  '/fine': `${head}<p>Fine</p>`
}

function site() {
  const server = createServer((req, res) => {
    const path = req.url.split('?')[0]
    if (path === '/wide.png') return res.writeHead(200, { 'content-type': 'image/png' }).end(PNG)
    const html = PAGES[path]
    if (!html) return res.writeHead(404, { 'content-type': 'text/html' }).end('<p>Not found</p>')
    res.writeHead(200, { 'content-type': 'text/html' }).end(html)
  })
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` })
    )
  )
}

test(
  'a page with a dead link, clipped text, a tall block and a squashed picture reports each, at both widths',
  opts,
  async () => {
    const { server, base } = await site()
    const browser = await playwright.chromium.launch({
      headless: true,
      args: ['--disable-features=MacAppCodeSignClone']
    })
    try {
      const page = await (await browser.newContext()).newPage()
      const r = await readDemoPage(page, `${base}/broken`, '/broken', { measurePages: true })
      assert.deepEqual(
        r.measures.map((m) => m.width),
        [1440, 390]
      )
      for (const m of r.measures) {
        assert.deepEqual(
          m.links.map((l) => new URL(l.href).pathname),
          ['/fine', '/missing', '/x'],
          'web links only, the anchor and the mailto are no links to check'
        )
        assert.equal(m.links[1].text, 'Missing page')
        const clip = m.textBoxes.find((t) => t.selector.includes('#clip'))
        assert.ok(clip, 'the clipped sentence is reported')
        assert.equal(clip.clips, true)
        assert.ok(clip.contentWidth - clip.boxWidth > 2)
        assert.ok(!m.textBoxes.some((t) => t.selector.includes('#clamp')), 'an ellipsis cuts on purpose')
        assert.ok(m.blocks.some((b) => b.selector.includes('#tall') && b.height >= 3000))
        assert.deepEqual(
          m.pictures.map((p) => p.selector),
          ['img#squash'],
          'cover is a crop and the right ratio is no stretch'
        )
        assert.equal(m.pictures[0].naturalWidth, 40)
      }
      // And the status, from the same site's own server.
      const { measures, summary } = await withLinkStatus(
        r.measures.map((m) => ({ path: '/broken', ...m })),
        { base: `${base}/` }
      )
      assert.deepEqual(
        measures[0].links.map((l) => [new URL(l.href).pathname, l.status]),
        [
          ['/fine', 200],
          ['/missing', 404]
        ]
      )
      assert.equal(summary.external, 1)
    } finally {
      await browser.close()
      server.close()
    }
  }
)

test(
  'every block reports how much text it prints, and a list the length of each shown item',
  opts,
  async () => {
    const { server, base } = await site()
    const browser = await playwright.chromium.launch({
      headless: true,
      args: ['--disable-features=MacAppCodeSignClone']
    })
    try {
      const page = await (await browser.newContext()).newPage()
      const r = await readDemoPage(page, `${base}/list`, '/list', { measurePages: true })
      for (const m of r.measures) {
        const list = m.textBlocks.find((b) => b.selector === 'ul#points')
        assert.deepEqual(list, { selector: 'ul#points', chars: 17, items: [3, 13] })
        assert.deepEqual(m.headingSpans[0].spans, [{ text: 'NO1', color: 'rgb(191, 91, 61)' }])
        assert.equal(m.headingSpans[0].text, 'NO1 Boxing studio')
        const section = m.textBlocks.find((b) => b.selector === 'section#steps')
        assert.ok(section.chars >= 31 && !('items' in section), JSON.stringify(section))
      }
    } finally {
      await browser.close()
      server.close()
    }
  }
)

test(
  'a sound page reports none of them, and a read that does not ask carries no measures',
  opts,
  async () => {
    const { server, base } = await site()
    const browser = await playwright.chromium.launch({
      headless: true,
      args: ['--disable-features=MacAppCodeSignClone']
    })
    try {
      const page = await (await browser.newContext()).newPage()
      const r = await readDemoPage(page, `${base}/clean`, '/clean', { measurePages: true })
      for (const m of r.measures) {
        assert.deepEqual([m.textBoxes, m.blocks, m.pictures], [[], [], []])
        assert.equal(m.links.length, 1)
      }
      const plain = await readDemoPage(page, `${base}/clean`, '/clean')
      assert.equal('measures' in plain, false)
    } finally {
      await browser.close()
      server.close()
    }
  }
)

test(
  'text running past the right edge of a phone is reported; one cut by an outer clip, in a closed panel parked off screen or in a scrolling code box is not',
  opts,
  async () => {
    const { server, base } = await site()
    PAGES['/edge'] =
      `${head}<div style="width:2000px"><p style="margin-left:1200px;white-space:nowrap">Pushed out to the right of every screen</p></div>
    <div style="width:100px;overflow:hidden"><p style="margin-left:300px;white-space:nowrap">Hidden by its parent</p></div>
    <aside style="position:fixed;top:0;left:0;width:330px;transform:translateX(390px)"><a href="/fine" style="display:block">Closed panel link</a></aside>
    <div style="width:300px">Article text above a code block<pre style="overflow-x:auto;white-space:pre"><code>a code line far too long to fit on any phone screen at all, scrolled in its box</code></pre></div>`
    const browser = await playwright.chromium.launch({
      headless: true,
      args: ['--disable-features=MacAppCodeSignClone']
    })
    try {
      const page = await (await browser.newContext()).newPage()
      const r = await readDemoPage(page, `${base}/edge`, '/edge', { measurePages: true })
      const phone = r.measures.find((m) => m.width === 390)
      assert.equal(phone.textBoxes.length, 1)
      assert.match(phone.textBoxes[0].text, /Pushed out/)
      assert.ok(phone.textBoxes[0].right > 390 + 2)
    } finally {
      await browser.close()
      server.close()
    }
  }
)

test(
  'main headings exclude ancestor-clipped clones but retain partial headings and headings below the viewport',
  opts,
  async () => {
    const { server, base } = await site()
    PAGES['/clipped-headings'] = `${head}<style>
      .window { width: 300px; overflow: hidden; position: relative }
      .track { width: 1200px; display: flex; transform: translateX(-300px) }
      .slide { flex: 0 0 300px }
      .partial { position: relative; left: 280px; width: 200px }
      .below { margin-top: 2000px }
    </style>
    <div class="window"><div class="track">
      <div class="slide"><h1>Parked clone</h1></div>
      <div class="slide"><h1>Readable title</h1></div>
      <div class="slide"><h1>Other parked clone</h1></div>
    </div></div>
    <div class="window"><h1 class="partial">Partly readable title</h1></div>
    <h1 class="below">Another visible heading below the fold</h1>`
    const browser = await playwright.chromium.launch({ headless: true })
    try {
      const page = await (await browser.newContext()).newPage()
      const r = await readDemoPage(page, `${base}/clipped-headings`, '/clipped-headings', {
        measurePages: true
      })
      for (const m of r.measures)
        assert.deepEqual(m.mainHeadings, [
          'Readable title',
          'Partly readable title',
          'Another visible heading below the fold'
        ])
    } finally {
      await browser.close()
      server.close()
    }
  }
)

test(
  'what a visitor sees: one main heading of three in the markup, and only what shows reads as shown',
  opts,
  async () => {
    const { server, base } = await site()
    PAGES['/shown'] =
      `${head}<style>.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}</style>
    <h1 class="sr">For readers only</h1><h1 style="display:none">Switched off</h1><h1>The main heading</h1>
    <p>Words on the page</p><p style="display:none">Words off the page</p>
    <a href="/fine">Read on</a><a href="/missing" style="display:none">Hidden link</a>
    <img src="/wide.png" style="width:200px;height:50px" alt=""><img src="/fine?hidden" style="display:none" alt="">`
    const browser = await playwright.chromium.launch({
      headless: true,
      args: ['--disable-features=MacAppCodeSignClone']
    })
    try {
      const page = await (await browser.newContext()).newPage()
      const r = await readDemoPage(page, `${base}/shown`, '/shown', { measurePages: true })
      for (const m of r.measures) {
        assert.deepEqual(m.mainHeadings, ['The main heading'])
        assert.match(m.shownText, /Words on the page/)
        assert.doesNotMatch(m.shownText, /Words off the page/)
        assert.deepEqual(
          m.shownLinks.map((l) => l.text),
          ['Read on']
        )
        assert.deepEqual(m.shownPictures, [`${base}/wide.png`])
        assert.equal('pictureBoxes' in m, false)
      }
    } finally {
      await browser.close()
      server.close()
    }
  }
)

test(
  'a link with a click handler in its markup is read as scripted, and one without is not',
  opts,
  async () => {
    const { server, base } = await site()
    PAGES['/buttons'] =
      `${head}<a class="btn" href="javascript:;" onclick="window.opened = 1">Share</a> <a class="btn" href="javascript:;">Dead</a>`
    const browser = await playwright.chromium.launch({
      headless: true,
      args: ['--disable-features=MacAppCodeSignClone']
    })
    try {
      const page = await (await browser.newContext()).newPage()
      const r = await readDemoPage(page, `${base}/buttons`, '/buttons')
      assert.deepEqual(
        r.ctas.map((c) => [c.text, c.scripted ?? false]),
        [
          ['Share', true],
          ['Dead', false]
        ]
      )
    } finally {
      await browser.close()
      server.close()
    }
  }
)

test(
  'a control with a CSS transition counts as shown at both widths, though the logo read has just painted the page hidden',
  opts,
  async () => {
    const { server, base } = await site()
    PAGES['/transition'] = `${head}<style>.share a{display:inline-block;transition:all 1s}</style>
      <header><a href="/" class="custom-logo-link"><img class="custom-logo" src="/wide.png" width="200" height="50" alt="Quay"></a></header>
      <main><h1>A page of the site</h1><div class="share"><a class="button-first" href="/fine">Share it</a></div></main>`
    const browser = await playwright.chromium.launch({
      headless: true,
      args: ['--disable-features=MacAppCodeSignClone']
    })
    try {
      const page = await (await browser.newContext()).newPage()
      const r = await readDemoPage(page, `${base}/transition`, '/transition', { measurePages: true })
      assert.deepEqual(
        r.measures.map((m) => [m.width, m.contentControls.some((c) => c.key.includes('button-first'))]),
        [
          [1440, true],
          [390, true]
        ]
      )
    } finally {
      await browser.close()
      server.close()
    }
  }
)

test(
  'list rows count canonical Owl items without counting clone subtrees or deduplicating real repeated cards',
  opts,
  async () => {
    const card = (classes, text, nested = false) =>
      `<div class="${classes}"><p>${text}</p>${nested ? '<ul><li>Nested clone first</li><li>Nested clone second</li></ul>' : ''}</div>`
    PAGES['/owl-list-identity'] = `${head}<style>.owl-stage{display:flex}.owl-item{min-width:180px}</style>
    <section id="looping" class="owl-carousel owl-loaded"><div class="owl-stage">
      ${card('owl-item cloned', 'Terrace chairs', true)}${card('owl-item cloned', 'Indoor benches', true)}
      ${card('owl-item active', 'Terrace chairs')}${card('owl-item', 'Indoor benches')}
      ${card('owl-item cloned', 'Terrace chairs', true)}${card('owl-item cloned', 'Indoor benches', true)}
    </div></section>
    <section id="repeated" class="owl-carousel"><div class="owl-stage">${Array.from({ length: 4 }, () => card('owl-item', 'Identical real offering')).join('')}</div></section>
    <section id="ordinary">${card('cloned', 'Ordinary first')}${card('cloned', 'Ordinary second')}</section>
    <section id="unverified">${card('owl-item cloned', 'Unverified first')}${card('owl-item cloned', 'Unverified second')}</section>
    <section id="no-original" class="owl-carousel"><div class="owl-stage">${card('owl-item cloned', 'No original first')}${card('owl-item cloned', 'No original second')}</div></section>`
    const { server, base } = await site()
    const browser = await playwright.chromium.launch({
      headless: true,
      args: ['--disable-features=MacAppCodeSignClone']
    })
    try {
      const page = await (await browser.newContext()).newPage()
      const result = await readDemoPage(page, `${base}/owl-list-identity`, '/owl-list-identity', {
        measurePages: true
      })
      assert.deepEqual(
        result.measures.map((m) => m.width),
        [1440, 390]
      )
      for (const m of result.measures) {
        const looping = m.lists.filter((list) =>
          list.items.some((it) => /Terrace chairs|Indoor benches/.test(it.text))
        )
        assert.equal(looping.length, 1)
        assert.deepEqual(
          looping[0].items.map((it) => it.text),
          ['Terrace chairs', 'Indoor benches']
        )
        assert.ok(!m.lists.some((list) => list.items.some((it) => /Nested clone/.test(it.text))))
        const repeated = m.lists.find((list) =>
          list.items.every((it) => it.text === 'Identical real offering')
        )
        assert.equal(repeated.items.length, 4)
        for (const prefix of ['Ordinary', 'Unverified', 'No original']) {
          const list = m.lists.find((list) => list.items.every((it) => it.text.startsWith(prefix)))
          assert.equal(list.items.length, 2, `${prefix} classes do not establish an Owl clone identity`)
        }
      }
    } finally {
      await browser.close()
      server.close()
    }
  }
)
