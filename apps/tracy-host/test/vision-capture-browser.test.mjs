/** Full-height capture against real scrolling, sticky bands and lazy content. Uses only owned contexts on CDP. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { createVisionCapturer } from '../src/vision-capture.js'

const cdp = process.env.DEMO_QA_CDP
const opts = { skip: cdp ? false : 'set DEMO_QA_CDP for a shared browser connection' }
async function fixture(t, html) {
  const sockets = new Set()
  const server = createServer((req, res) => {
    if (req.url === '/pending') return
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<meta name="viewport" content="width=device-width, initial-scale=1">' + html)
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => {
    for (const socket of sockets) socket.destroy()
    server.close()
  })
  const { chromium } = await import('playwright')
  const browser = await chromium.connectOverCDP(cdp)
  t.after(() => browser.close())
  const owned = []
  const capture = createVisionCapturer({
    launched: async () => browser,
    prepare: async (context) => {
      owned.push(context)
    }
  })
  return { capture, owned, base: `http://127.0.0.1:${server.address().port}` }
}
const longPage = `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}header{position:fixed;top:0;width:100%;height:48px;background:white;z-index:2}main{padding-top:48px}section{height:3900px}footer{height:300px}.carousel{position:relative;overflow:hidden;height:200px}.offscreen{position:absolute;left:5000px;width:390px;height:180px}.clip{position:absolute;top:-5000px;width:100%;height:200px;overflow:hidden;clip-path:inset(0)}.fixed-image{position:fixed;inset:0;width:100%;height:100vh}</style><header>Fixture bakery</header><main><section><h1>Top marker</h1></section><section><h2>Middle marker</h2></section><section><h3>Lower marker</h3></section><div class="carousel"><img class="offscreen" src="/pending" loading="lazy" alt="Offscreen carousel slide"></div></main><footer>Footer marker</footer><figure class="clip"><img class="fixed-image" src="/pending" loading="lazy" alt="Clipped background"></figure>`

test(
  'long page reaches footer at both widths with overlap across fixed headers; offscreen lazy slides do not block',
  opts,
  async (t) => {
    const { capture, base, owned } = await fixture(t, longPage)
    const views = new Map()
    let terminal
    for await (const frame of capture({
      layouts: [{ key: 'home', path: '/' }],
      base,
      signal: AbortSignal.timeout(90000)
    })) {
      if (frame.type === 'tile') {
        const state = views.get(frame.viewport) ?? { covered: 0, tiles: 0 }
        assert.ok(frame.from <= state.covered)
        assert.ok(frame.to > state.covered)
        assert.ok(Buffer.from(frame.jpeg, 'base64').length <= 640 * 1024)
        state.covered = frame.to
        state.tiles++
        views.set(frame.viewport, state)
      } else if (frame.type === 'view-end') {
        assert.equal(frame.complete, true, frame.reason)
        assert.equal(views.get(frame.viewport).covered, frame.documentHeight)
        assert.ok(frame.documentHeight > 12000)
        assert.ok(frame.tiles > 3)
      } else if (frame.type === 'end') terminal = frame
    }
    assert.equal(terminal.complete, true)
    assert.equal(views.size, 2)
    assert.equal(owned.length, 2)
    assert.ok(owned.every((context) => context.pages().length === 0))
  }
)

test(
  'height exhaustion is explicitly incomplete instead of a cropped successful verdict',
  opts,
  async (t) => {
    const { capture, base } = await fixture(t, '<main style="height:45000px"><h1>Over budget</h1></main>')
    const frames = []
    for await (const frame of capture({
      layouts: [{ key: 'home', path: '/' }],
      base,
      signal: AbortSignal.timeout(30000)
    }))
      frames.push(frame)
    assert.equal(frames.at(-1).complete, false)
    assert.ok(frames.filter((f) => f.type === 'view-end').every((f) => f.reason === 'CAPTURE_HEIGHT_LIMIT'))
    assert.equal(frames.filter((f) => f.type === 'tile').length, 0)
  }
)

test(
  'cancellation closes the owned context before the next request enters the capture slot',
  opts,
  async (t) => {
    const { capture, base, owned } = await fixture(t, longPage)
    const ac = new AbortController()
    const first = capture({ layouts: [{ key: 'home', path: '/' }], base, signal: ac.signal })
    assert.equal((await first.next()).value.type, 'view-start')
    const second = capture({
      layouts: [{ key: 'home', path: '/' }],
      base,
      signal: AbortSignal.timeout(60000)
    })
    const queued = second.next()
    ac.abort(new Error('owner stopped'))
    await first.return()
    await queued
    assert.equal(owned[0].pages().length, 0)
    await second.return()
    assert.ok(owned.every((context) => context.pages().length === 0))
  }
)

test('a layout change above an acknowledged tile invalidates coverage', opts, async (t) => {
  const { capture, base, owned } = await fixture(t, longPage)
  let changed = false
  let failed = false
  for await (const frame of capture({
    layouts: [{ key: 'home', path: '/' }],
    base,
    signal: AbortSignal.timeout(60000)
  })) {
    if (!changed && frame.type === 'tile') {
      changed = true
      await owned[0].pages()[0].evaluate(() => {
        document.querySelector('main').style.paddingTop = '250px'
      })
    }
    if (frame.type === 'view-end' && frame.viewport === 'desktop') {
      assert.equal(frame.complete, false)
      assert.equal(frame.reason, 'CAPTURE_LAYOUT_CHANGED')
      failed = true
    }
  }
  assert.equal(failed, true)
})

test('lazy growth discovered while walking is included through its new footer', opts, async (t) => {
  const { capture, base } = await fixture(
    t,
    `<main style="height:3000px"><h1>Initial content</h1></main><footer>Footer marker</footer><script>let added=false;addEventListener('scroll',()=>{if(!added&&scrollY>1000){added=true;document.querySelector('main').style.height='6000px'}})</script>`
  )
  let views = 0
  for await (const frame of capture({
    layouts: [{ key: 'home', path: '/' }],
    base,
    signal: AbortSignal.timeout(60000)
  })) {
    if (frame.type === 'view-end') {
      views++
      assert.equal(frame.complete, true, frame.reason)
      assert.ok(frame.documentHeight > 6000)
      assert.equal(frame.covered, frame.documentHeight)
    }
  }
  assert.equal(views, 2)
})
