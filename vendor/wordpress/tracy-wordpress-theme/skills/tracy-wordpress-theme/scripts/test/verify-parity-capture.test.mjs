// captureStyles walks routes × viewports × themes on one browser, N pages at a time, and must
// hand back the same A/B snapshot maps (keyed `route|width|theme`) the serial walk did: an axis
// present on both sides when both answer the route's declared status (200 unless declared), absent
// on the side that does not, and a capture error named per axis rather than aborting the run.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { captureStyles, httpStatuses } from '../quickstart/verify-parity.mjs'

const page = (color) => (req, res) => {
  if (req.url.startsWith('/gone')) {
    res.writeHead(404, { 'content-type': 'text/html' })
    return res.end(`<!doctype html><html><head><style>body{color:${color}}</style></head><body><h1>Not found</h1></body></html>`)
  }
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end(`<!doctype html><html><head><style>body{color:${color}} html[data-theme=dark] body{color:rgb(200,200,200)}</style></head><body><h1>${req.url}</h1></body></html>`)
}
const a = createServer(page('rgb(1, 2, 3)'))
const b = createServer(page('rgb(9, 9, 9)'))
const listening = [once(a, 'listening'), once(b, 'listening')]
a.listen(0, '127.0.0.1')
b.listen(0, '127.0.0.1')
await Promise.all(listening)
const A = `http://127.0.0.1:${a.address().port}`
const B = `http://127.0.0.1:${b.address().port}`
test.after(async () => {
  a.close()
  b.close()
  await Promise.all([once(a, 'close'), once(b, 'close')])
})

test('captureStyles: axes in matrix order, both sides, dark hook applied, missing side absent', async () => {
  const cap = await captureStyles({
    a: A,
    b: B,
    routes: ['/', '/gone'],
    viewports: [[600, 400], [320, 400]],
    themes: ['light', 'dark'],
    darkHook: 'attr:data-theme=dark',
    selectors: ['body', 'h1'],
    concurrency: 3
  })
  assert.deepEqual(Object.keys(cap.A), ['/|600|light', '/|600|dark', '/|320|light', '/|320|dark'])
  assert.deepEqual(Object.keys(cap.B), Object.keys(cap.A))
  assert.equal(cap.A['/|600|light'].body.color, 'rgb(1, 2, 3)')
  assert.equal(cap.B['/|600|light'].body.color, 'rgb(9, 9, 9)')
  assert.equal(cap.A['/|600|dark'].body.color, 'rgb(200, 200, 200)', 'dark hook ran before the page painted')
  assert.deepEqual(cap.failures, [])
})

test('captureStyles: an unreachable side is a named failure on that axis, not an abort', async () => {
  const cap = await captureStyles({
    a: A,
    b: 'http://127.0.0.1:1',
    routes: ['/'],
    viewports: [[600, 400]],
    themes: ['light'],
    darkHook: 'attr:data-theme=dark',
    selectors: ['body']
  })
  assert.equal(cap.failures.length, 1)
  assert.equal(cap.failures[0].axis, '/|600|light')
  assert.match(cap.failures[0].error, /ECONNREFUSED|net::ERR/)
})

test('captureStyles (#60): a route declared to answer 404 is measured on both sides when both answer 404, and on neither when it answers 200', async () => {
  const cap = await captureStyles({
    a: A,
    b: B,
    routes: ['/', '/gone'],
    expected: new Map([['/gone', 404]]),
    viewports: [[600, 400], [320, 400]],
    themes: ['light', 'dark'],
    darkHook: 'attr:data-theme=dark',
    selectors: ['body', 'h1'],
    concurrency: 3
  })
  const axes = ['/|600|light', '/|600|dark', '/|320|light', '/|320|dark']
  const all = [...axes, ...axes.map((x) => x.replace('/|', '/gone|'))].sort()
  assert.deepEqual(Object.keys(cap.A).sort(), all)
  assert.deepEqual(Object.keys(cap.B).sort(), all)
  assert.deepEqual(cap.failures, [])
  for (const ax of axes.map((x) => x.replace('/|', '/gone|'))) {
    assert.equal(cap.A[ax].h1 !== undefined && cap.B[ax].h1 !== undefined, true, `${ax}: the declared 404 page is measured on both stands`)
    assert.equal(cap.A[ax].body.color, 'rgb(1, 2, 3)')
  }
  const wrong = await captureStyles({ a: A, b: B, routes: ['/'], expected: { '/': 404 }, viewports: [[600, 400]], themes: ['light'], darkHook: 'attr:data-theme=dark', selectors: ['body'] })
  assert.deepEqual([Object.keys(wrong.A), Object.keys(wrong.B)], [[], []], 'a route declared 404 that answers 200 gives no snapshot')
  assert.deepEqual(wrong.failures, [])
})

test('httpStatuses (#60): only a same-origin trailing-slash 301/308 is followed, and never for a route declared to redirect', async () => {
  const moves = {
    '/slash': [301, '/slash/'],
    '/perm': [308, '/perm/'],
    '/tail/': [301, '/tail'],
    '/query': [301, '/query/?x=1'],
    '/other': [301, `${A}/other/`],
    '/deeper': [301, '/deeper/x'],
    '/temp': [302, '/temp/'],
    '/moved': [301, '/moved/']
  }
  const r = createServer((req, res) => {
    const m = moves[req.url]
    if (m) res.writeHead(m[0], { location: m[1] })
    else res.writeHead(200, { 'content-type': 'text/html' })
    res.end('ok')
  })
  r.listen(0, '127.0.0.1')
  await once(r, 'listening')
  try {
    const R = `http://127.0.0.1:${r.address().port}`
    const got = await httpStatuses(R, Object.keys(moves), new Map([['/moved', 301]]))
    assert.deepEqual(got, {
      '/slash': 200,
      '/perm': 200,
      '/tail/': 200,
      '/query': 301,
      '/other': 301,
      '/deeper': 301,
      '/temp': 302,
      '/moved': 301
    })
  } finally {
    r.close()
    await once(r, 'close')
  }
})
