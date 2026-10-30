// The preview key of a locked site (#189) in the container browser reads (`page.look`, the visual check): the key
// rides in the exec environment (never a file), and the shipped BROWSER_SCRIPT adds `X-Tracy-Preview-Key` only to
// requests for the site's own origin, never to a font or CDN host. Fictional businesses of two trades.
import assert from 'node:assert/strict'
import test from 'node:test'

import { BROWSER_SCRIPT, browserArgv, hostBrowserCommand, parseBrowser } from '../src/host/exec.mjs'
import { forgetPreviewKeys, refreshPreviewKey } from '../src/host/preview-key.mjs'

const KEY = 'Zq9-'.repeat(12)

/** Run the shipped script with a fake chromium that pauses the given requests after the navigate. */
function runWith({ env, origin, url, paused, http }) {
  const cdp = []
  let dataCb = null
  let out = ''
  const emit = (obj) => {
    try {
      dataCb?.(Buffer.from(JSON.stringify(obj) + '\0'))
    } catch (e) {
      if (!e?.__exit) throw e
    }
  }
  const child = {
    pid: 7,
    on: () => {},
    kill: () => {},
    stdio: [
      null,
      null,
      null,
      {
        on: () => {},
        write: (s) => {
          const m = JSON.parse(String(s).replace(/\0$/, ''))
          cdp.push(m)
          const reply = (result) => emit({ id: m.id, result })
          if (m.method === 'Target.createTarget') return reply({ targetId: 'T' })
          if (m.method === 'Target.attachToTarget') return reply({ sessionId: 'S' })
          if (m.method === 'Page.getFrameTree') return reply({ frameTree: { frame: { id: 'MF' } } })
          if (m.method === 'Page.navigate') {
            reply({ frameId: 'MF' })
            queueMicrotask(() => {
              for (const [i, [u, kind]] of paused.entries())
                emit({
                  method: 'Fetch.requestPaused',
                  params: {
                    requestId: `R${i + 1}`,
                    frameId: 'MF',
                    resourceType: kind,
                    request: { url: u, method: 'GET', headers: { Accept: '*/*' } }
                  }
                })
            })
            return
          }
          if (m.method === 'Runtime.evaluate')
            return reply({ result: { value: JSON.stringify({ href: url, html: '<p>real</p>' }) } })
          return reply({})
        }
      },
      { on: (ev, cb) => ev === 'data' && (dataCb = cb) }
    ]
  }
  const proc = {
    argv: ['node', 'dom', url, origin, '', '20', '4000', '1000'],
    env,
    stdout: { write: (s, cb) => ((out += String(s)), cb?.()) },
    exit: () => {
      throw { __exit: true }
    }
  }
  const require = (name) =>
    name === 'child_process'
      ? { spawn: () => child }
      : name === 'fs'
        ? { writeFileSync: () => {}, mkdtempSync: (pre) => `${pre}0`, rmSync: () => {} }
        : name === 'os'
          ? { tmpdir: () => '/tmp' }
          : name === 'path'
            ? { join: (...a) => a.join('/') }
            : name === 'http'
              ? http
              : {}
  try {
    new Function('require', 'process', BROWSER_SCRIPT)(require, proc)
  } catch (e) {
    if (!e?.__exit) throw e
  }
  return new Promise((resolve, reject) => {
    const t0 = Date.now()
    const iv = setInterval(() => {
      if (out !== '' || Date.now() - t0 > 2000) {
        clearInterval(iv)
        out === '' ? reject(new Error('script wrote nothing')) : resolve({ out, cdp })
      }
    }, 1)
  })
}

const keyOf = (headers) => (headers ?? []).find((h) => h.name === 'X-Tracy-Preview-Key')?.value

test('loopback read: own-origin requests carry the key, a font host does not, and every request is paused', async () => {
  const origin = 'http://127.0.0.1:4321'
  const { out, cdp } = await runWith({
    env: { TRACY_PREVIEW_KEY: KEY },
    origin,
    url: `${origin}/`,
    paused: [
      [`${origin}/`, 'Document'],
      [`${origin}/theme.css`, 'Stylesheet'],
      ['https://fonts.example/a.woff2', 'Font']
    ]
  })
  assert.equal(parseBrowser(out).ok, true)
  assert.deepEqual(cdp.find((m) => m.method === 'Fetch.enable').params.patterns, [
    { urlPattern: '*', requestStage: 'Request' }
  ])
  const cont = Object.fromEntries(
    cdp.filter((m) => m.method === 'Fetch.continueRequest').map((m) => [m.params.requestId, m.params])
  )
  assert.equal(keyOf(cont.R1.headers), KEY)
  assert.equal(keyOf(cont.R2.headers), KEY)
  assert.ok(
    cont.R1.headers.some((h) => h.name === 'Accept'),
    'the request keeps its own headers'
  )
  assert.equal(cont.R3.headers, undefined, 'a font host gets the request untouched')
})

test('no key, or a key of another shape: requests are continued untouched, only Documents paused', async () => {
  for (const env of [{}, { TRACY_PREVIEW_KEY: 'short' }]) {
    const origin = 'http://127.0.0.1:4321'
    const { cdp } = await runWith({ env, origin, url: `${origin}/`, paused: [[`${origin}/`, 'Document']] })
    assert.deepEqual(cdp.find((m) => m.method === 'Fetch.enable').params.patterns, [
      { urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }
    ])
    assert.equal(cdp.find((m) => m.method === 'Fetch.continueRequest').params.headers, undefined)
  }
})

test('public-origin route: the request served from loopback carries the key', async () => {
  const seen = []
  const http = {
    request: (o, cb) => {
      seen.push(o)
      const r = {
        statusCode: 200,
        rawHeaders: ['Content-Type', 'text/html'],
        on: (ev, f) => (ev === 'data' ? f(Buffer.from('<p>real</p>')) : ev === 'end' ? f() : null)
      }
      return { on: () => {}, setTimeout: () => {}, write: () => {}, end: () => cb(r) }
    }
  }
  const origin = 'https://spoke-and-chain.example'
  await runWith({
    env: { TRACY_PREVIEW_KEY: KEY, TRACY_PUBLIC_VIA: '127.0.0.1:80' },
    origin,
    url: `${origin}/`,
    paused: [
      [`${origin}/`, 'Document'],
      ['https://cdn.example/lib.js', 'Script']
    ],
    http
  })
  assert.equal(seen.length, 1)
  assert.equal(seen[0].headers['x-tracy-preview-key'], KEY)
})

for (const { trade, label } of [
  { trade: 'pottery studio', label: 'kiln-pottery' },
  { trade: 'yoga school', label: 'harbour-yoga' }
]) {
  test(`${trade}: the exec argv and the host browser carry the key of their own site only, in the environment`, async () => {
    forgetPreviewKeys()
    const base = { mode: 'dom', url: 'http://127.0.0.1/', origin: 'http://127.0.0.1' }
    assert.equal(
      browserArgv({ ...base, container: `${label}-web-1` }).includes(`TRACY_PREVIEW_KEY=${KEY}`),
      false
    )
    await refreshPreviewKey(label, async () => KEY)
    const argv = browserArgv({ ...base, container: `${label}-web-1` })
    const at = argv.indexOf(`TRACY_PREVIEW_KEY=${KEY}`)
    assert.ok(at > 0 && argv[at - 1] === '-e', 'an exec environment variable, never a file')
    assert.ok(at < argv.indexOf(`${label}-web-1`), 'before the container name: a docker option')
    assert.equal(
      browserArgv({ ...base, container: 'another-site-web-1' }).includes(`TRACY_PREVIEW_KEY=${KEY}`),
      false
    )
    const host = hostBrowserCommand({
      chrome: '/usr/bin/chrome',
      target: {
        url: 'http://127.0.0.1/',
        origin: 'http://127.0.0.1',
        container: `${label}-web-1`,
        via: '127.0.0.1:80'
      },
      dockerHost: null
    })
    assert.equal(host.env.TRACY_PREVIEW_KEY, KEY)
    assert.equal(host.args.includes(KEY), false, 'not on the host command line')
    forgetPreviewKeys()
  })
}
