/**
 * The look read in a real browser on invented pages: both sides of the switch, a logo's pixels against its ground, words on a band
 * with the brand style on and off, words on a picture, and nothing left behind on the page. Skipped when Playwright is not installed.
 *   node --test --test-concurrency=1 apps/tracy-host/test/demo-qa-look-browser.test.mjs
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, test } from 'node:test'
import { deflateSync } from 'node:zlib'

import { readLook } from '../src/demo-qa-look.js'
import {
  measurePageInPage,
  MEASURE_CAPS,
  OVERFLOW_TOLERANCE_PX,
  STRETCH_REPORT_RATIO
} from '../src/demo-qa-page-measures.js'

let playwright = null
try {
  playwright = await import('playwright')
} catch {}
const opts = { skip: playwright ? false : 'playwright is not installed' }
after(() => setTimeout(() => process.exit(), 200))

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
/** A PNG of width x height, each pixel's RGBA from `at(x, y)`. */
function png(width, height, at) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 6, 0, 0, 0], 8)
  const rows = []
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4)
    for (let x = 0; x < width; x++) row.set(at(x, y), 1 + x * 4)
    rows.push(row)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0))
  ])
}
const CLEAR = [0, 0, 0, 0]
// A red mark on the left and white words on the right, on nothing: the logo that vanishes on a light ground.
const WHITE_WORDS = png(120, 30, (x, y) => {
  if (y < 6 || y > 24) return CLEAR
  if (x < 30) return [200, 20, 20, 255]
  return x % 4 === 3 ? CLEAR : [255, 255, 255, 255]
})
const PLATE = png(120, 30, () => [255, 255, 255, 255])
const MID = png(600, 200, () => [120, 120, 120, 255])

const BRAND = `<style id="tracy-ds-slot">/* tracy-ds-slot: x */.accent{color:#0e7f48}</style>`
const THEMED = (
  extra = ''
) => `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>
html{scroll-behavior:smooth}body{margin:0;font:16px sans-serif}
.light-active{background:#fff;color:#212529}.dark-active{background:#121111;color:#fff}
.foot{background:transparent;padding:40px}.dark-active .foot{background:#1f1e1e}
.band{background:#1f1e1e;padding:40px}.accent{color:#f44141}
.hero{background:url(/mid.png);padding:60px;color:#8b8b8b}
.card{border-radius:4px;padding:12px;margin-bottom:900px}
</style>${extra}</head><body class="dark-active">
<section class="card" id="Mod1"><p>Plain words here</p></section>
<section class="hero" id="Mod2"><p>Grey words over a mid picture</p></section>
<section class="band" id="Mod3"><a class="accent lead" href="tel:+15550100">+1 555 0100</a></section>
<footer class="foot"><img class="logo-img" src="/white.png" alt="Logo" width="120" height="30"></footer>
</body></html>`
const PAGES = {
  '/plain': THEMED(BRAND),
  '/plate': THEMED().replace('/white.png', '/plate.png'),
  '/noswitch':
    '<!doctype html><html><body><div class="ja-dark-mode">Mode</div><p>Plain words here</p></body></html>',
  '/faults': `<!doctype html><html><head><title>Quay | About</title><style>.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}</style></head><body class="view-article">
    <nav><a class="btn" href="/faults">About</a></nav>
    <h1 class="sr">About | Quay</h1><h2>Privacy | Quay</h2>
    <main><a class="btn" href="/faults">About us</a><a class="btn" href="/faults#team">Team</a><a class="btn" href="#">Nowhere</a><a class="btn" href="/other">Other</a>
    <ul class="share"><li><a class="facebook" href="https://x.example/s">facebook</a></li></ul><p>Read <a href="/other">more</a></p></main>
    </body></html>`
}
function site() {
  const server = createServer((req, res) => {
    const path = req.url.split('?')[0]
    const file = { '/white.png': WHITE_WORDS, '/plate.png': PLATE, '/mid.png': MID }[path]
    if (file) return res.writeHead(200, { 'content-type': 'image/png' }).end(file)
    res.writeHead(200, { 'content-type': 'text/html' }).end(PAGES[path] ?? '<p>x</p>')
  })
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` })
    )
  )
}
async function withPage(path, run, width = 1440) {
  const { server, base } = await site()
  const browser = await playwright.chromium.launch({ headless: true })
  try {
    const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage()
    await page.goto(base + path, { waitUntil: 'load' })
    await run(page)
  } finally {
    await browser.close()
    server.close()
  }
}

test('both sides are read and the page is left as it was', opts, async () => {
  await withPage('/plain', async (page) => {
    const look = await readLook(page, 1440)
    assert.deepEqual(Object.keys(look.sides), ['dark', 'light'])
    assert.equal(look.opening, 'dark')
    assert.equal(look.worn, true)
    const left = await page.evaluate(() => ({
      dark: document.body.classList.contains('dark-active'),
      tagged: document.querySelectorAll('[data-tracy-look-over],[data-tracy-look-logo]').length,
      frozen: Boolean(document.getElementById('tracy-qa-look-freeze')),
      logoStyle: Boolean(document.getElementById('tracy-qa-look-logo')),
      sheetOn: document.getElementById('tracy-ds-slot').sheet.disabled === false
    }))
    assert.deepEqual(left, { dark: true, tagged: 0, frozen: false, logoStyle: false, sheetOn: true })
  })
})

test('white logo words: gone on the light ground, read on the dark one', opts, async () => {
  await withPage('/plain', async (page) => {
    const { sides } = await readLook(page, 1440)
    const dark = sides.dark.logos[0]
    const light = sides.light.logos[0]
    assert.ok(dark.ink > 0 && light.ink > 0, 'white on white still counts as ink')
    assert.ok(light.under2 > 0.5, `white words vanish in light, ${light.under2}`)
    assert.ok(dark.under2 < 0.05, `and read in dark, ${dark.under2}`)
    assert.equal(light.plate, false)
  })
})

test('a logo that fills its box carries its own ground', opts, async () => {
  await withPage('/plate', async (page) => {
    const { sides } = await readLook(page, 1440)
    assert.equal(sides.light.logos[0].plate, true)
  })
})

test('digits count as words: an accent on a band, with the brand style on and off', opts, async () => {
  await withPage('/plain', async (page) => {
    const { sides } = await readLook(page, 1440)
    const w = sides.light.words.find((x) => x.selector.includes('accent'))
    assert.ok(w, 'the phone number is read in spite of the smooth scroll')
    assert.deepEqual(w.fg.slice(0, 3), [14, 127, 72])
    assert.deepEqual(w.fgOff.slice(0, 3), [244, 65, 65])
    assert.deepEqual(w.bg, [31, 30, 30])
  })
})

test('words on a picture are shot against the region under them, on both sides', opts, async () => {
  await withPage('/plain', async (page) => {
    const { sides } = await readLook(page, 1440)
    for (const side of ['dark', 'light']) {
      const w = sides[side].over.find((x) => x.text.startsWith('Grey words'))
      assert.ok(w, side)
      assert.ok(Math.abs(w.under.p50 - 0.1878) < 0.02, `${side}: the picture's own grey, ${w.under.p50}`)
      assert.deepEqual(w.fg, [139, 139, 139])
      assert.ok(w.key.includes('#Mod2'))
    }
  })
})

test(
  'the look of each element is read at the desktop width, once per value, and not at the phone width',
  opts,
  async () => {
    await withPage('/plain', async (page) => {
      const look = await readLook(page, 1440)
      const { styles } = look.sides.dark
      const n = look.props.indexOf('border-top-left-radius')
      const key = Object.keys(styles.keys).find((k) => k.startsWith('#Mod1|section.card'))
      assert.deepEqual(
        styles.keys[key][n].map((i) => styles.table[i]),
        ['4px']
      )
      const m = look.props.indexOf('color')
      const accent = Object.keys(styles.off).find((k) => k.includes('.accent'))
      assert.deepEqual(
        styles.off[accent][m].map((i) => styles.table[i]),
        ['rgb(244, 65, 65)'],
        'with the style off'
      )
      const phone = await readLook(page, 390)
      assert.equal(phone.sides.dark.styles, undefined)
      assert.deepEqual(phone.sides.dark.logos, [])
    })
  }
)

test('a switch of a kind this read does not know is said, and only one side is read', opts, async () => {
  await withPage('/noswitch', async (page) => {
    const look = await readLook(page, 1440)
    assert.deepEqual(Object.keys(look.sides), ['only'])
    assert.equal(look.switchSeen, true)
  })
})

test('self links, hidden headings and content controls are read as a visitor has them', opts, async () => {
  await withPage('/faults', async (page) => {
    const m = await page.evaluate(measurePageInPage, {
      tolerance: OVERFLOW_TOLERANCE_PX,
      stretch: STRETCH_REPORT_RATIO,
      caps: MEASURE_CAPS
    })
    assert.deepEqual(
      m.selfLinks.map((l) => l.text),
      ['About us'],
      'not the menu item, not a fragment, not a bare #, not another page'
    )
    assert.deepEqual(m.hiddenHeadings, ['About | Quay'])
    assert.deepEqual(m.headings, ['Privacy | Quay'])
    assert.equal(m.title, 'Quay | About')
    assert.equal(m.view, 'view-article')
    const keys = m.contentControls.map((c) => c.key)
    assert.ok(keys.some((k) => k.includes('a.facebook')))
    assert.ok(!keys.some((k) => k.startsWith('nav')), 'a menu is shared')
    assert.equal(keys.filter((k) => k.endsWith('>a')).length, 0, 'a plain link in a line is no control')
  })
})
