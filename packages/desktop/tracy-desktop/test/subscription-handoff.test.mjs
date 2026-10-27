import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { callbackOf, callbackScript, subscriptionHandoff } from '../src/subscription-handoff.js'
import { runInNewContext } from 'node:vm'
const target = (state = 'test-state') =>
  `https://claude.ai/oauth/authorize?redirect_uri=${encodeURIComponent('http://localhost:53692/callback')}&state=${state}`
test('only known provider loopback callbacks can open a listener', () => {
  assert.equal(callbackOf(target()).state, 'test-state')
  assert.equal(callbackOf(target().replace('claude.ai', 'evil.example')), null)
  assert.equal(callbackOf(target().replace('53692', '12345')), null)
})
test('a foreign page cannot start the desktop subscription handoff', async () => {
  let opened = false
  const h = subscriptionHandoff({
    home: 'https://cowork.test',
    currentUrl: () => 'https://evil.example',
    deliver: () => assert.fail(),
    openExternal: () => {
      opened = true
    }
  })
  assert.equal(await h.open(target()), false)
  assert.equal(opened, false)
})

const codexTarget = (state = 'abc', redirect = 'http://localhost:1455/auth/callback') =>
  `https://auth.openai.com/oauth/authorize?response_type=code&redirect_uri=${encodeURIComponent(redirect)}&state=${state}`

/** A handoff on a free port, on a Tracy page, recording what it opens and delivers. */
function harness(overrides = {}) {
  const seen = { opened: [], delivered: [], logs: [] }
  const handoff = subscriptionHandoff({
    home: 'https://cowork.test/',
    currentUrl: () => 'https://cowork.test/settings',
    deliver: (url) => seen.delivered.push(url),
    openExternal: (url) => {
      seen.opened.push(url)
    },
    log: (line) => seen.logs.push(line),
    port: 0,
    ...overrides
  })
  after(() => handoff.close())
  return { handoff, seen }
}

const get = async (port, path) => {
  const response = await fetch(`http://127.0.0.1:${port}${path}`)
  return { status: response.status, type: response.headers.get('content-type'), body: await response.text() }
}

test('a Codex callback with the expected state is answered, delivered once, and the catcher stops', async () => {
  const { handoff, seen } = harness()
  assert.equal(await handoff.open(codexTarget('abc')), true)
  const port = handoff.port()
  assert.ok(port > 0)
  const answer = await get(port, '/auth/callback?code=c1&state=abc')
  assert.equal(answer.status, 200)
  assert.match(answer.type, /^text\/html/)
  assert.match(answer.body, /Signed in\. You can close this tab and return to Tracy Cowork\./)
  assert.doesNotMatch(answer.body, /<script|https?:\/\//)
  assert.deepEqual(seen.delivered, ['http://localhost:1455/auth/callback?code=c1&state=abc'])
  assert.deepEqual(seen.opened, [codexTarget('abc')])
  assert.equal(handoff.port(), null)
  await assert.rejects(get(port, '/auth/callback?code=c1&state=abc'))
})

test('a wrong state or another path gets a plain 404 and the catcher keeps listening', async () => {
  const { handoff, seen } = harness()
  await handoff.open(codexTarget('abc'))
  const port = handoff.port()
  for (const path of ['/auth/callback?code=c1&state=other', '/favicon.ico', '/auth/callback?code=c1']) {
    const answer = await get(port, path)
    assert.equal(answer.status, 404, path)
    assert.match(answer.type, /^text\/plain/)
    assert.doesNotMatch(answer.body, /abc/)
  }
  assert.deepEqual(seen.delivered, [])
  assert.equal(handoff.port(), port)
  assert.equal((await get(port, '/auth/callback?code=c2&state=abc')).status, 200)
  assert.deepEqual(seen.delivered, ['http://localhost:1455/auth/callback?code=c2&state=abc'])
})

test('the catcher stops by itself when the attempt runs out of time', async () => {
  const { handoff, seen } = harness({ timeoutMs: 30 })
  await handoff.open(codexTarget('abc'))
  const port = handoff.port()
  await new Promise((resolve) => setTimeout(resolve, 120))
  assert.equal(handoff.port(), null)
  await assert.rejects(get(port, '/auth/callback?code=c1&state=abc'))
  assert.deepEqual(seen.delivered, [])
})

test('a busy port logs one line, still opens the browser, and never delivers', async (t) => {
  const { createServer } = await import('node:http')
  const taken = createServer()
  await new Promise((resolve) => taken.listen(0, '127.0.0.1', resolve))
  t.after(() => taken.close())
  const { handoff, seen } = harness({ port: taken.address().port })
  assert.equal(await handoff.open(codexTarget('abc')), true)
  assert.equal(handoff.port(), null)
  assert.deepEqual(seen.opened, [codexTarget('abc')])
  assert.equal(seen.logs.length, 1)
  assert.match(seen.logs[0], /EADDRINUSE/)
  assert.deepEqual(seen.delivered, [])
})

test('a second attempt replaces the first', async () => {
  const { handoff, seen } = harness()
  await handoff.open(codexTarget('first'))
  const first = handoff.port()
  await handoff.open(codexTarget('second'))
  const second = handoff.port()
  await assert.rejects(get(first, '/auth/callback?code=c1&state=first'))
  assert.equal((await get(second, '/auth/callback?code=c1&state=first')).status, 404)
  assert.equal((await get(second, '/auth/callback?code=c2&state=second')).status, 200)
  assert.deepEqual(seen.delivered, ['http://localhost:1455/auth/callback?code=c2&state=second'])
})

test('the Codex authorize address names the callback path and state to catch', () => {
  const attempt = callbackOf(codexTarget('abc'))
  assert.equal(attempt.redirect.pathname, '/auth/callback')
  assert.equal(attempt.state, 'abc')
  assert.equal(callbackOf(codexTarget('abc', 'http://127.0.0.1:1455/auth/callback')).state, 'abc')
  assert.equal(callbackOf('https://auth.openai.com/oauth/authorize?state=abc'), null)
  assert.equal(callbackOf(codexTarget('abc', 'http://example.com:1455/auth/callback')), null)
  assert.equal(callbackOf(codexTarget('abc', 'https://localhost:1455/auth/callback')), null)
})

test('the page asking the app to open a Codex sign-in starts the catcher, then the browser', async () => {
  const { handoff, seen } = harness()
  await handoff.openOrBrowse(codexTarget('abc'))
  assert.deepEqual(seen.opened, [codexTarget('abc')])
  assert.equal((await get(handoff.port(), '/auth/callback?code=c1&state=abc')).status, 200)
  assert.deepEqual(seen.delivered, ['http://localhost:1455/auth/callback?code=c1&state=abc'])
})

test('any other address the page opens goes to the browser with no catcher', async () => {
  const { handoff, seen } = harness()
  const others = [
    'https://auth.openai.com/oauth/authorize?state=abc',
    codexTarget('abc', 'http://example.com:1455/auth/callback'),
    'https://example.com/docs'
  ]
  for (const url of others) await handoff.openOrBrowse(url)
  assert.deepEqual(seen.opened, others)
  assert.equal(handoff.port(), null)
})

test('the delivery script dispatches the callback event with the URL as data, whatever it holds', () => {
  assert.equal(
    callbackScript('http://localhost:1455/auth/callback?code=c1&state=abc'),
    `window.dispatchEvent(new CustomEvent('tracy-subscription-callback', { detail: {"url":"http://localhost:1455/auth/callback?code=c1&state=abc"} }))`
  )
  const hostile = `http://localhost:1455/auth/callback?code='"\\</script><script>alert(1)</script>\u2028&state=abc`
  const dispatched = []
  class CustomEvent {
    constructor(type, init) {
      this.type = type
      this.detail = init.detail
    }
  }
  runInNewContext(callbackScript(hostile), {
    window: { dispatchEvent: (event) => dispatched.push(event) },
    CustomEvent
  })
  assert.equal(dispatched.length, 1)
  assert.equal(dispatched[0].type, 'tracy-subscription-callback')
  assert.equal(dispatched[0].detail.url, hostile)
})
