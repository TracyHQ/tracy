// The preview key of a locked site (#189): while a brief build holds a site on its rebuilding page, the agent's page
// reads (the container's own curl) send `X-Tracy-Preview-Key`, which the Cowork plugin answers with the real site. The
// key is asked of tracy-web by the host process, kept a short while per site, and sent only to the site's own loopback
// read. Without a key, the read is as before. Fictional businesses of two trades.
import assert from 'node:assert/strict'
import test from 'node:test'

import { fetchArgv } from '../src/host/exec.mjs'
import { readPage } from '../src/host/page.mjs'
import {
  PREVIEW_KEY_HEADER,
  askPreviewKey,
  forgetPreviewKeys,
  previewKeyFor,
  refreshPreviewKey
} from '../src/host/preview-key.mjs'

const KEY = 'aB3_'.repeat(12)
const NONCE = `TRACY_FETCH_${'0'.repeat(32)}`

const input = (over = {}) => ({
  container: 'kiln-pottery-web-1',
  connectPort: 80,
  pathAndQuery: '/',
  host: '127.0.0.1',
  proto: 'http',
  nonce: NONCE,
  ...over
})

const headersOf = (argv) => argv.flatMap((a, i) => (argv[i - 1] === '--header' ? [a] : []))

test('fetchArgv adds the preview key header only when a key is given, and refuses a key of another shape', () => {
  assert.equal(
    headersOf(fetchArgv(input())).some((h) => h.startsWith(PREVIEW_KEY_HEADER)),
    false
  )
  const withKey = fetchArgv(input({ previewKey: KEY }))
  assert.ok(headersOf(withKey).includes(`${PREVIEW_KEY_HEADER}: ${KEY}`))
  assert.equal(withKey.at(-1), 'http://127.0.0.1/', 'the URL stays the loopback literal, the key never in it')
  for (const previewKey of ['short', `${KEY}\r\nX-Evil: 1`, 'ü'.repeat(40), 'k'.repeat(129)])
    assert.throws(() => fetchArgv(input({ previewKey })), /preview key/, JSON.stringify(previewKey))
})

/** A container double: answers each curl GET with a page, and keeps every argv. */
function container(pages) {
  const argvs = []
  const run = async ({ argv }) => {
    argvs.push(argv)
    const out = argv[argv.indexOf('--write-out') + 1]
    const nonce = out.trim().split(' ')[0]
    const path = new URL(argv.at(-1)).pathname
    const page = pages[path] ?? { status: 404, head: '', body: 'missing' }
    const stdout = `HTTP/1.1 ${page.status} X\r\n${page.head}Content-Type: text/html\r\n\r\n${page.body}\n${nonce} ${page.status} ${page.body.length}\n`
    return { code: 0, stdout, stderr: '', timedOut: false }
  }
  return { run, argvs }
}

for (const { trade, label } of [
  { trade: 'pottery studio', label: 'kiln-pottery' },
  { trade: 'yoga school', label: 'harbour-yoga' }
]) {
  test(`${trade}: a locked site is read with its preview key on every hop of its own, an open one without`, async () => {
    forgetPreviewKeys()
    const pages = {
      '/': { status: 301, head: 'Location: /home\r\n', body: '' },
      '/home': { status: 200, head: '', body: '<p>Real site</p>' }
    }
    const open = container(pages)
    const plain = await readPage({ run: open.run, label, internalPort: 80, path: '/' })
    assert.equal(plain.ok, true)
    assert.equal(
      open.argvs.flat().some((a) => a.includes(PREVIEW_KEY_HEADER)),
      false
    )

    await refreshPreviewKey(label, async () => KEY)
    assert.equal(previewKeyFor(label), KEY)
    assert.equal(previewKeyFor('another-site'), null, 'a key belongs to its own site only')
    const locked = container(pages)
    const read = await readPage({ run: locked.run, label, internalPort: 80, path: '/' })
    assert.equal(read.ok, true)
    assert.equal(read.html, '<p>Real site</p>')
    assert.equal(locked.argvs.length, 2)
    for (const argv of locked.argvs) {
      assert.ok(headersOf(argv).includes(`${PREVIEW_KEY_HEADER}: ${KEY}`))
      assert.match(argv.at(-1), /^http:\/\/127\.0\.0\.1\//, 'only the loopback read of the site itself')
    }
    forgetPreviewKeys()
  })
}

test('the key is kept a short while per site, an answer of another shape is no key, and a failed ask is no key', async () => {
  forgetPreviewKeys()
  let asked = 0
  let now = 1_000
  const ask = async () => {
    asked += 1
    return KEY
  }
  await refreshPreviewKey('kiln-pottery', ask, () => now)
  await refreshPreviewKey('kiln-pottery', ask, () => now + 5_000)
  assert.equal(asked, 1, 'asked once within the window')
  now += 60_000
  await refreshPreviewKey(
    'kiln-pottery',
    async () => null,
    () => now
  )
  assert.equal(previewKeyFor('kiln-pottery'), null, 'unlocked: the key is gone')
  await refreshPreviewKey(
    'kiln-pottery',
    async () => 'not a key',
    () => now + 60_000
  )
  assert.equal(previewKeyFor('kiln-pottery'), null)
  await refreshPreviewKey(
    'kiln-pottery',
    async () => {
      throw new Error('down')
    },
    () => now + 120_000
  )
  assert.equal(previewKeyFor('kiln-pottery'), null)
  forgetPreviewKeys()
})

test('askPreviewKey reads the door, and an older tracy-web (404) or a refusal is no key', async () => {
  const seen = []
  const fetchImpl = (status, body) => async (url, init) => {
    seen.push({ url, init })
    return new Response(JSON.stringify(body), { status })
  }
  const headers = { 'x-tracy-workspace-label': 'kiln-pottery' }
  const got = await askPreviewKey({
    fetchImpl: fetchImpl(200, { key: KEY }),
    origin: 'http://tracy.test',
    headers
  })
  assert.equal(got, KEY)
  assert.equal(seen[0].url, 'http://tracy.test/api/sites/_conversation/preview-key')
  assert.equal(seen[0].init.method, 'GET')
  assert.equal(
    await askPreviewKey({
      fetchImpl: fetchImpl(404, { code: 'NOT_FOUND' }),
      origin: 'http://tracy.test',
      headers
    }),
    null
  )
  assert.equal(
    await askPreviewKey({ fetchImpl: fetchImpl(200, { key: null }), origin: 'http://tracy.test', headers }),
    null
  )
})

test('a key renewed since it was kept: the offline page drops it, a fresh one is asked, and the read retried once', async () => {
  forgetPreviewKeys()
  const FRESH = 'Fr3sh_'.repeat(8)
  let current = KEY
  let asks = 0
  await refreshPreviewKey('spoke-and-chain', async () => {
    asks += 1
    return current
  })
  current = FRESH // tracy-web renewed the key; the plugin now refuses the kept one
  const argvs = []
  const run = async ({ argv }) => {
    argvs.push(argv)
    const nonce = argv[argv.indexOf('--write-out') + 1].trim().split(' ')[0]
    const ok = headersOf(argv).includes(`${PREVIEW_KEY_HEADER}: ${FRESH}`)
    const [status, body] = ok ? [200, '<p>Real site</p>'] : [503, '<p>This website is being updated.</p>']
    return {
      code: 0,
      stdout: `HTTP/1.1 ${status} X\r\nContent-Type: text/html\r\n\r\n${body}\n${nonce} ${status} ${body.length}\n`,
      stderr: '',
      timedOut: false
    }
  }
  const read = await readPage({ run, label: 'spoke-and-chain', internalPort: 80, path: '/' })
  assert.equal(read.status, 200)
  assert.equal(read.html, '<p>Real site</p>')
  assert.equal(argvs.length, 2, 'retried once')
  assert.equal(asks, 2, 'asked again despite the 20 s window')
  assert.equal(previewKeyFor('spoke-and-chain'), FRESH)

  // still offline with the fresh key (or no fresh key): the 503 is the answer, never a loop.
  current = FRESH
  const offline = async ({ argv }) => {
    argvs.push(argv)
    const nonce = argv[argv.indexOf('--write-out') + 1].trim().split(' ')[0]
    return { code: 0, stdout: `HTTP/1.1 503 X\r\n\r\noff\n${nonce} 503 3\n`, stderr: '', timedOut: false }
  }
  argvs.length = 0
  const still = await readPage({ run: offline, label: 'spoke-and-chain', internalPort: 80, path: '/' })
  assert.equal(still.status, 503)
  assert.equal(argvs.length, 1, 'the same key again is not retried')
  forgetPreviewKeys()
})
