/** The brand bench's real-page views (#322): pure helpers, the request/route shape, and a real browser on a fixture site. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { deflateSync } from 'node:zlib'
import { test } from 'node:test'
import {
  createViewsCapturer,
  icoSize,
  pathOf,
  pngSize,
  selectorsOf,
  DEFAULT_SELECTORS
} from '../src/real-page-views.js'
import { CAPTURE_VIEWPORTS, captureBody } from '../src/capture.js'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data])
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc(body), 8 + data.length)
  return out
}
/** A solid PNG of the given size, built by hand (no image library in this app). */
function png(width, height, [r, g, b]) {
  const head = Buffer.alloc(13)
  head.writeUInt32BE(width, 0)
  head.writeUInt32BE(height, 4)
  head[8] = 8
  head[9] = 2
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())
  ])
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}
const ico = () => {
  const b = Buffer.alloc(22)
  b.writeUInt16LE(1, 2)
  b.writeUInt16LE(1, 4)
  b[6] = 32
  b[7] = 32
  return b
}

test('pngSize and icoSize read the real pixel size from the header', () => {
  assert.deepEqual(pngSize(png(32, 32, [1, 2, 3])), { width: 32, height: 32 })
  assert.deepEqual(icoSize(ico()), { width: 32, height: 32 })
  assert.equal(pngSize(Buffer.from('not a picture, long enough to read')), null)
})

test('selectors and path are held to a plain shape; defaults stay', () => {
  assert.equal(selectorsOf({ header: 'header.top' }).header, 'header.top')
  assert.equal(selectorsOf({ header: 'a{b}' }).header, DEFAULT_SELECTORS.header)
  assert.equal(selectorsOf(null).footer, DEFAULT_SELECTORS.footer)
  assert.equal(pathOf('https://evil.test/'), '/')
  assert.equal(pathOf('/about'), '/about')
})

test('the template-card capture body and viewports are unchanged by the new mode', () => {
  assert.equal(CAPTURE_VIEWPORTS.length, 2)
  const asked = captureBody({
    label: 'trial',
    platform: 'joomla',
    layouts: [{ key: 'home', path: '/' }],
    mode: 'real-page/1'
  })
  assert.equal(asked.error, null)
  assert.deepEqual(asked.layouts, [{ key: 'home', path: '/' }])
})

const PAGE = (scheme) => `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/f/favicon.ico"><link rel="icon" type="image/png" sizes="32x32" href="/f/32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/f/180.png">
<style>body{margin:0;background:${scheme === 'dark' ? '#121111' : '#fff'};color:${scheme === 'dark' ? '#eee' : '#111'}}
header{height:90px}footer{height:120px;background:#1f1e1e}#menu{display:none;position:fixed;top:0;left:0;width:300px;height:300px;background:#fff}
#menu.show{display:block}</style>
<header><img src="/img/header.png" width="195" height="56"><button class="navbar-toggler" onclick="menu.classList.add('show')">menu</button></header>
<div id="menu" class="offcanvas"><img src="/img/mark.png" width="40" height="40"></div>
<main><p>hello</p></main><footer><img src="/img/footer.png" width="175" height="50"></footer>`

async function site(t) {
  const files = {
    '/f/favicon.ico': ['image/x-icon', ico()],
    '/f/32.png': ['image/png', png(32, 32, [200, 30, 30])],
    '/f/180.png': ['image/png', png(180, 180, [200, 30, 30])],
    '/img/header.png': ['image/png', png(195, 56, [200, 30, 30])],
    '/img/mark.png': ['image/png', png(40, 40, [30, 30, 200])],
    '/img/footer.png': ['image/png', png(175, 50, [200, 30, 30])]
  }
  const server = createServer((req, res) => {
    const u = new URL(req.url, 'http://x')
    const file = files[u.pathname]
    if (file) {
      res.writeHead(200, { 'content-type': file[0] })
      return res.end(file[1])
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(PAGE(u.searchParams.get('theme')))
  })
  await new Promise((resolve) => server.listen(0, 'localhost', resolve))
  t.after(() => server.close())
  return `http://localhost:${server.address().port}/`
}

test('a real browser takes header, footer, opened menu and tab in light and dark', async (t) => {
  let playwright
  try {
    playwright = await import('playwright')
  } catch {
    return t.skip('playwright is not installed')
  }
  const browser = await playwright.chromium
    .launch({ headless: true, args: ['--no-sandbox'] })
    .catch(() => null)
  if (!browser) return t.skip('no chromium here')
  t.after(() => browser.close())
  const url = await site(t)
  const capture = createViewsCapturer({ launched: async () => browser, prepare: async () => {} })
  const out = await capture({ url })
  const ids = out.views.map((v) => `${v.id}:${v.scheme}:${v.ok}`).sort()
  assert.deepEqual(ids, [
    'footer:dark:true',
    'footer:light:true',
    'header:dark:true',
    'header:light:true',
    'menu:dark:true',
    'menu:light:true',
    'tab:dark:true',
    'tab:light:true'
  ])
  const header = out.views.find((v) => v.id === 'header' && v.scheme === 'dark')
  assert.match(header.facts.logo.src, /\/img\/header\.png$/)
  assert.equal(header.facts.logo.rect.width, 195)
  const menu = out.views.find((v) => v.id === 'menu' && v.scheme === 'light')
  assert.equal(menu.opened, true)
  assert.match(menu.facts.logo.src, /\/img\/mark\.png$/)
  const footer = out.views.find((v) => v.id === 'footer' && v.scheme === 'light')
  assert.match(footer.facts.logo.src, /\/img\/footer\.png$/)
  assert.ok(Buffer.from(header.png, 'base64').length > 100)
  const sized = out.icons.map((i) => `${i.kind}:${i.width}x${i.height}:${i.status}`).sort()
  assert.deepEqual(sized, ['ico:32x32:200', 'png:180x180:200', 'png:32x32:200'])
  assert.ok(out.colours.light.some((c) => c.hex === '#ffffff'))
})
