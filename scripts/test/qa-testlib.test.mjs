/**
 * Test library (plan §4.6, §11 G4.1) in front of the REAL QA gate (G3 `createGate`) and a FAKE
 * `tracy-web` + dsh on a random 127.0.0.1 port. The browser half drives a real headless Chrome
 * (unfenced, own port) against a fake server when Chrome is installed; it is skipped otherwise.
 */
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { createGate } from '../qa/gate/gate.mjs'
import { readLines } from '../qa/lib/journal.mjs'
import { writeJsonAtomic, writeRun } from '../qa/lib/state.mjs'
import { CHROME_BIN, startChrome } from '../qa/fence/chrome.mjs'
import { openContext } from '../qa/testlib/browser.mjs'
import { fleetLabel } from '../../apps/tracy-web/src/sites/label.js'
import { ChatError, chat, siteLabel } from '../qa/testlib/chat.mjs'
import { requestHeaders, standClient, standConfig } from '../qa/testlib/stand.mjs'

const sha = (s) => createHash('sha256').update(s).digest('hex')
const KEY = 'key-sonnet-test'
const tmps = []
after(() => {
  for (const d of tmps) rmSync(d, { recursive: true, force: true })
})

const tokenFor = (email) =>
  `v1.${Buffer.from(JSON.stringify({ email, exp: 9e9 })).toString('base64url')}.c2ln`
const emailOf = (cookie) => {
  const m = /tracy_sess=v1\.([\w-]+)\./.exec(cookie ?? '')
  return m ? JSON.parse(Buffer.from(m[1], 'base64url').toString()).email : null
}

/** A fake tracy-web with a fake dsh under `/<siteKey>/api/…`. `seen` holds every request. */
async function fakeStand({ answerAfterPolls = 2, neverAnswer = false } = {}) {
  const seen = []
  const sites = new Map()
  const sessions = new Map() // sessionId -> { turns: [], polls }
  const server = createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      seen.push({ method: req.method, url: req.url, headers: req.headers, body })
      const send = (status, obj) => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(obj))
      }
      const email = emailOf(req.headers.cookie)
      if (req.method === 'POST' && (req.url === '/api/sites' || req.url === '/api/sites/claim')) {
        if (!email) return send(401, { code: 'UNAUTHENTICATED' })
        const b = JSON.parse(body)
        const siteKey = `qa-${b.label}.qa.tracy.test`
        sites.set(siteKey, email)
        return send(201, { siteKey, label: `qa-${b.label}`, buildId: b.buildId })
      }
      if (req.method === 'GET' && req.url === '/api/sites')
        return send(200, {
          sites: [...sites].filter(([, e]) => e === email).map(([siteKey]) => ({ siteKey }))
        })
      // Like workspace/route.js: the first request under a site's mount with no seat cookie mints
      // the seat and answers 302 back to the same address, whatever its method.
      const mount = /^\/([^/]+\.qa\.tracy\.test)(\/.*)?$/.exec(req.url.split('?')[0])
      if (mount && !/(^|; )tracy_tok_[^=]+=/.test(req.headers.cookie ?? '')) {
        res.writeHead(302, {
          location: req.url,
          'set-cookie': [`tracy_tok_dsh__${mount[1].split('.')[0].replace(/-/g, '_')}=seat; Path=/`]
        })
        return res.end()
      }
      const rpc = /^\/([^/]+)\/api\/((?:session|workspace)\/[A-Za-z]+)$/.exec(req.url)
      if (rpc && req.method === 'POST') {
        const msg = JSON.parse(body)
        const reply = (value) =>
          send(200, { type: 'server-response', rpcId: msg.rpcId, result: { ok: true, value } })
        const r = msg.payload.args.request
        // The seat gateway's folder rule: the seat holds `/site/<label>` only, and a session is
        // made by the id `workspace/create` answered for that folder (sites/route.js sessionMadeAhead).
        const folder = `/site/${rpc[1].split('.')[0]}`
        if (rpc[2] === 'workspace/create') {
          if (r.path !== folder) return send(403, { code: 'FOLDER_DENIED' })
          return reply({ workspace: { workspaceId: `ws-${rpc[1]}`, path: folder } })
        }
        if (rpc[2] === 'session/create') {
          if (r.workspaceId !== `ws-${rpc[1]}`) return send(403, { code: 'FOLDER_DENIED' })
          const id = `s${sessions.size + 1}`
          sessions.set(id, { turns: [], polls: 0, pending: null })
          return reply({ sessionId: id })
        }
        const s = sessions.get(r.sessionId)
        if (rpc[2] === 'session/prompt') {
          s.pending = r.content[0].text
          s.polls = 0
          return reply({ accepted: true })
        }
        if (rpc[2] === 'session/projections') {
          if (s.pending !== null && !neverAnswer && ++s.polls >= answerAfterPolls) {
            s.turns.push({ turn: s.turns.length + 1, seq: 1, prompt: s.pending, response: 'done' })
            s.pending = null
          }
          return reply({ values: { turnOutline: s.turns, sessionStats: { turns: s.turns.length } } })
        }
        if (rpc[2] === 'session/cancel') return reply({ accepted: true })
      }
      send(200, { ok: true, url: req.url })
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return {
    port: server.address().port,
    seen,
    close: () => new Promise((r) => (server.closeAllConnections(), server.close(r)))
  }
}

async function setup(fakeOpts) {
  const up = await fakeStand(fakeOpts)
  const home = mkdtempSync(join(tmpdir(), 'qa-testlib-'))
  tmps.push(home)
  writeRun(home, {
    runId: '20261003a',
    laneKeyHashes: { sonnet: sha(KEY) },
    leaseUntil: Date.now() + 600_000
  })
  writeJsonAtomic(join(home, 'state', 'capacity.json'), { ok: true, at: Date.now() })
  const gate = createGate({
    home,
    upstream: { host: '127.0.0.1', port: up.port },
    stand: {
      mintSession: async (email) => tokenFor(email),
      readOtp: async () => '123456',
      listSites: async () => []
    }
  })
  const { port } = await gate.start()
  const config = standConfig({
    QA_GATE_URL: `http://127.0.0.1:${port}`,
    TRACY_ORIGIN: 'http://qa.tracy.test:36080',
    QA_LANE: 'sonnet',
    QA_LANE_KEY: KEY,
    QA_PR: '745'
  })
  return {
    up,
    home,
    client: standClient(config),
    async close() {
      await gate.close()
      await up.close()
    }
  }
}

const writes = (seen) => seen.filter((r) => r.method !== 'GET')

test('G4.1 requestHeaders: a write carries Origin exactly and never any Sec-Fetch-*', () => {
  const config = standConfig({ TRACY_ORIGIN: 'http://qa.tracy.test:36080', QA_LANE_KEY: 'k', QA_PR: '9' })
  const w = requestHeaders(config, {
    method: 'POST',
    host: 'qa.tracy.test:36080',
    hasBody: true,
    headers: { 'Sec-Fetch-Site': 'same-origin', 'sec-fetch-mode': 'cors' }
  })
  assert.equal(w.origin, 'http://qa.tracy.test:36080')
  assert.equal(w['content-type'], 'application/json')
  assert.equal(w['x-qa-lane'], 'k')
  assert.equal(w['x-qa-pr'], '9')
  assert.ok(!Object.keys(w).some((k) => k.startsWith('sec-fetch-')))
  const r = requestHeaders(config, { method: 'GET', host: 'qa.tracy.test:36080' })
  assert.equal(r.origin, undefined)
  assert.equal(r['content-type'], undefined)
})

test('G4.1 through the real gate: session, createSite with buildId, writes with Origin, public page by Host', async () => {
  const s = await setup()
  try {
    const { email } = await s.client.signIn()
    assert.match(email, /@sonnet\.qa\.tracy\.test$/)
    assert.ok(s.client.cookies.get('tracy_sess')?.startsWith('v1.'))

    const created = await s.client.createSite({ platform: 'wordpress', label: 'g4a' })
    assert.equal(created.status, 201, created.text)
    assert.match(created.buildId, /^[0-9a-f-]{36}$/)
    const post = s.up.seen.find((r) => r.url === '/api/sites' && r.method === 'POST')
    const body = JSON.parse(post.body)
    assert.equal(body.buildId, created.buildId)
    assert.equal(body.label, 'g4a')

    await s.client.apply(created.json.siteKey, 'content.read', { path: '/' })
    await s.client.del('/api/whatever')

    const ws = writes(s.up.seen)
    assert.ok(ws.length >= 3)
    for (const r of ws) {
      assert.equal(r.headers.origin, 'http://qa.tracy.test:36080', r.url)
      assert.equal(r.headers['sec-fetch-site'], undefined, r.url)
      assert.equal(r.headers['x-qa-lane'], undefined, 'the gate consumed the lane key')
      if (r.body) assert.match(r.headers['content-type'], /^application\/json/)
    }
    const apply = ws.find((r) => r.url.includes('/apply/'))
    assert.equal(apply.url, '/api/sites/qa-g4a.qa.tracy.test/apply/content.read')

    const page = await s.client.page(created.json.siteKey, '/about')
    assert.equal(page.status, 200)
    const got = s.up.seen.at(-1)
    assert.equal(got.headers.host, 'qa-g4a.qa.tracy.test:36080')
    assert.equal(got.url, '/about')
    assert.equal(got.headers.origin, undefined)
  } finally {
    await s.close()
  }
})

test('G4.1 chat() sends exactly one prompt, waits for the turn end, and a refused slot is not retried', async () => {
  const s = await setup({ answerAfterPolls: 3 })
  try {
    await s.client.signIn()
    const site = (await s.client.createSite({ platform: 'wordpress', label: 'g4chat' })).json.siteKey
    const out = await chat(site, 'Add a page called About', { client: s.client, pollMs: 20 })
    assert.equal(out.response, 'done')
    assert.equal(out.turn, 1)
    const prompts = () => s.up.seen.filter((r) => r.url.endsWith('/api/session/prompt'))
    assert.equal(prompts().length, 1)
    const p = prompts()[0]
    assert.equal(p.url, `/${site}/api/session/prompt`)
    assert.equal(p.headers.origin, 'http://qa.tracy.test:36080')
    assert.equal(p.headers['sec-fetch-site'], undefined)
    const msg = JSON.parse(p.body)
    assert.equal(msg.type, 'client-request')
    assert.equal(msg.method, 'session/prompt')
    assert.equal(msg.payload.args.request.content[0].text, 'Add a page called About')
    const chatBook = readLines(join(s.home, 'state', 'chat.jsonl')).lines.filter((l) => l.t === 'intent')
    assert.equal(chatBook.length, 1)
    assert.equal(chatBook[0].pr, '745')

    // Same site right away: the gate refuses the slot; chat() throws and sends nothing more.
    await assert.rejects(
      chat(site, 'again', { client: s.client, sessionId: out.sessionId, pollMs: 20 }),
      (e) => {
        assert.ok(e instanceof ChatError)
        assert.equal(e.code, 'QA_CHAT_SITE_BUSY')
        return true
      }
    )
    assert.equal(prompts().length, 1)
  } finally {
    await s.close()
  }
})

test('chat() opens the site door for its seat, then makes the session by the dsh workspace id', async () => {
  const s = await setup({ answerAfterPolls: 1 })
  try {
    await s.client.signIn()
    const site = (await s.client.createSite({ platform: 'wordpress', label: 'g4seat' })).json.siteKey
    await chat(site, 'hello', { client: s.client, pollMs: 20 })
    const order = s.up.seen
      .filter((r) => r.url.startsWith(`/${site}/`))
      .map((r) => `${r.method} ${r.url.slice(site.length + 1)}`)
    assert.deepEqual(order.slice(0, 3), ['GET /', 'POST /api/workspace/create', 'POST /api/session/create'])
    const ws = s.up.seen.find((r) => r.url.endsWith('/api/workspace/create'))
    assert.deepEqual(JSON.parse(ws.body).payload.args.request, { path: '/site/qa-g4seat' })
    const made = s.up.seen.find((r) => r.url.endsWith('/api/session/create'))
    assert.deepEqual(JSON.parse(made.body).payload.args.request, { workspaceId: `ws-${site}` })
  } finally {
    await s.close()
  }
})

test('mintKey() refuses a label before sending, mints by siteKey with Origin; v1() goes to the API host with the key and no cookie', async () => {
  const s = await setup()
  try {
    await s.client.signIn()
    const site = (await s.client.createSite({ platform: 'wordpress', label: 'g4key' })).json.siteKey
    const sent = () => s.up.seen.filter((r) => r.url.startsWith('/api/me/keys')).length
    assert.throws(() => s.client.mintKey({ siteKey: 'qa-g4key' }), /not a label/)
    assert.equal(sent(), 0)
    await s.client.mintKey({ siteKey: site, scopes: ['content'] })
    const mint = s.up.seen.find((r) => r.url === '/api/me/keys')
    assert.equal(mint.method, 'POST')
    assert.equal(mint.headers.origin, 'http://qa.tracy.test:36080')
    assert.deepEqual(JSON.parse(mint.body), {
      siteKey: site,
      label: 'qa test key',
      scopes: ['content'],
      expiresInDays: 1
    })
    const r = await s.client.v1('GET', `/v1/sites/${site}/pages`, { key: 'trk_x.y' })
    assert.equal(r.status, 200)
    const call = s.up.seen.find((q) => q.url === `/v1/sites/${site}/pages`)
    assert.equal(call.headers.host, 'api.qa.tracy.test:36080')
    assert.equal(call.headers.authorization, 'Bearer trk_x.y')
    assert.equal(call.headers.cookie, undefined)
  } finally {
    await s.close()
  }
})

test('siteLabel() files a site under the same label as tracy-web fleetLabel', async () => {
  for (const key of [
    'qa-fixedwp.qa.tracy.test',
    'QA-X.qa.tracy.test',
    'shop.example.com',
    'https://a.b.qa.tracy.test/x'
  ])
    assert.equal(siteLabel(key, 'qa.tracy.test'), await fleetLabel(key, 'qa.tracy.test'), key)
})

test('G4.1 chat() past its time cancels the turn and throws CHAT_TIMEOUT', async () => {
  const s = await setup({ neverAnswer: true })
  try {
    await s.client.signIn()
    const site = (await s.client.createSite({ platform: 'wordpress', label: 'g4slow' })).json.siteKey
    await assert.rejects(
      chat(site, 'hello', { client: s.client, timeoutMs: 150, pollMs: 20 }),
      (e) => e.code === 'CHAT_TIMEOUT'
    )
    assert.equal(s.up.seen.filter((r) => r.url.endsWith('/api/session/prompt')).length, 1)
    assert.equal(s.up.seen.filter((r) => r.url.endsWith('/api/session/cancel')).length, 1)
  } finally {
    await s.close()
  }
})

test('G4.1 browser: one context per test, lane headers on every request, console errors recorded, context closed', {
  skip: existsSync(CHROME_BIN) ? false : 'Chrome is not installed',
  timeout: 30_000
}, async () => {
  const seen = []
  const server = createServer((req, res) => {
    seen.push({ url: req.url, headers: req.headers })
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(`<html><body><h1 id="t">QA page</h1><input id="q">
      <script>console.error('boom from page'); setTimeout(() => { throw new Error('late failure') }, 0)</script>
      </body></html>`)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const chromeDir = `/private/tmp/qat-${randomBytes(3).toString('hex')}`
  tmps.push(chromeDir)
  const results = mkdtempSync(join(tmpdir(), 'qa-testlib-res-'))
  tmps.push(results)
  const cdpPort = 20000 + Math.floor(Math.random() * 20000)
  const chrome = await startChrome({ lane: 'sonnet', cdpPort, chromeDir, fenced: false })
  try {
    const config = standConfig({
      TRACY_ORIGIN: `http://qa.tracy.test:${port}`,
      QA_LANE: 'sonnet',
      QA_LANE_KEY: KEY,
      QA_PR: '745'
    })
    const ctx = await openContext({ config, port: cdpPort, testName: 'g4-browser', resultsDir: results })
    const page = await ctx.newPage()
    await page.goto('/hello')
    assert.equal(await page.text('#t'), 'QA page')
    await page.type('#q', 'typed')
    assert.equal(await page.evaluate("document.querySelector('#q').value"), 'typed')
    await page.waitFor('true')
    await new Promise((r) => setTimeout(r, 200))
    const req = seen.find((r) => r.url === '/hello')
    assert.equal(req.headers['x-qa-lane'], KEY)
    assert.equal(req.headers['x-qa-pr'], '745')
    assert.equal(req.headers.host, `qa.tracy.test:${port}`)
    assert.ok(ctx.errors.some((e) => e.kind === 'console.error' && /boom from page/.test(e.text)))
    assert.ok(ctx.errors.some((e) => e.kind === 'exception' && /late failure/.test(e.text)))
    const id = ctx.browserContextId
    await ctx.close()
    const lines = readFileSync(join(results, 'console.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
    assert.ok(lines.every((l) => l.test === 'g4-browser' && l.lane === 'sonnet' && l.pr === '745'))
    const version = await (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).json()
    const ws = new WebSocket(version.webSocketDebuggerUrl)
    await new Promise((r) => ws.addEventListener('open', r, { once: true }))
    const contexts = await new Promise((r) => {
      ws.addEventListener('message', (ev) => r(JSON.parse(ev.data).result.browserContextIds), { once: true })
      ws.send(JSON.stringify({ id: 1, method: 'Target.getBrowserContexts' }))
    })
    ws.close()
    assert.ok(!contexts.includes(id), 'the context was disposed')
  } finally {
    await chrome.stop()
    await new Promise((r) => (server.closeAllConnections(), server.close(r)))
  }
})
