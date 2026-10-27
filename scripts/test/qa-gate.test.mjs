/**
 * QA gate (plan §4.4, §11 G3) in front of a FAKE `tracy-web`: an HTTP + WebSocket server on a random
 * 127.0.0.1 port shaped after `sites/route.js` (claim / create with `buildId`, `GET /api/sites`),
 * `identity/route.js` (a door that sets `tracy_sess`) and dsh's `session.prompt` / `updateQueue`.
 * The stand adapter (docker exec / logs) is a fake object, or a fake `docker` on PATH.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, request } from 'node:http'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { readLines } from '../qa/lib/journal.mjs'
import { writeJsonAtomic, writeRun } from '../qa/lib/state.mjs'
import { GATE_DEFAULTS, createGate } from '../qa/gate/gate.mjs'
import { dockerStand, parseOtp } from '../qa/gate/stand.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const GATE_MODULE = resolve(here, '../qa/gate/gate.mjs')
const sha = (s) => createHash('sha256').update(s).digest('hex')
const KEYS = { sonnet: 'key-sonnet', sol: 'key-sol', verify: 'key-verify', admin: 'key-admin' }
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

/** A fake tracy-web. `seen` holds every request as it arrived. */
async function fakeUpstream({ hangLabel } = {}) {
  const seen = []
  const sites = new Map() // email -> Set(siteKey)
  const waiters = []
  const server = createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      const rec = { method: req.method, url: req.url, headers: req.headers, body }
      seen.push(rec)
      for (const w of waiters.splice(0)) w(rec)
      const email = emailOf(req.headers.cookie)
      const send = (status, obj, extra = {}) => {
        res.writeHead(status, { 'content-type': 'application/json', ...extra })
        res.end(JSON.stringify(obj))
      }
      if (req.method === 'POST' && (req.url === '/api/sites/claim' || req.url === '/api/sites')) {
        if (!email) return send(401, { code: 'UNAUTHENTICATED' })
        const b = JSON.parse(body)
        const siteKey = `qa-${b.label}.qa.tracy.test`
        if (!sites.has(email)) sites.set(email, new Set())
        sites.get(email).add(siteKey)
        if (b.label === hangLabel) return // created, answer never sent
        return send(201, { siteKey, label: `qa-${b.label}`, buildId: b.buildId })
      }
      if (req.method === 'GET' && req.url === '/api/sites') {
        return send(200, {
          addressPrefix: 'qa-',
          sites: [...(sites.get(email) ?? [])].map((siteKey) => ({ siteKey }))
        })
      }
      if (req.method === 'DELETE' && req.url.startsWith('/api/sites/')) {
        const key = decodeURIComponent(req.url.split('/')[3])
        sites.get(email)?.delete(key)
        return send(200, { deleted: true })
      }
      if (req.url === '/auth/me') {
        return send(
          200,
          { email },
          { 'set-cookie': [`tracy_sess=${tokenFor('renew@sonnet.qa.tracy.test')}; Path=/`, 'other=1'] }
        )
      }
      send(200, { ok: true, url: req.url })
    })
  })
  server.on('upgrade', (req, socket) => {
    seen.push({ method: 'UPGRADE', url: req.url, headers: req.headers })
    socket.write('HTTP/1.1 101 Switching Protocols\r\nupgrade: websocket\r\nconnection: Upgrade\r\n\r\n')
    socket.pipe(socket) // echo
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return {
    port: server.address().port,
    seen,
    sites,
    nextRequest: () => new Promise((r) => waiters.push(r)),
    close: () => new Promise((r) => (server.closeAllConnections(), server.close(r)))
  }
}

function fakeStand(up) {
  return {
    mintSession: async (email) => tokenFor(email),
    readOtp: async () => '123456',
    listSites: async (email) => [...(up.sites.get(email) ?? [])]
  }
}

function home({ run = true, capacityAt = Date.now() } = {}) {
  const h = mkdtempSync(join(tmpdir(), 'qa-gate-'))
  tmps.push(h)
  if (run)
    writeRun(h, {
      runId: '20261003a',
      laneKeyHashes: { sonnet: sha(KEYS.sonnet), sol: sha(KEYS.sol), verify: sha(KEYS.verify) },
      adminKeyHash: sha(KEYS.admin),
      leaseUntil: Date.now() + 600_000
    })
  writeJsonAtomic(join(h, 'state', 'capacity.json'), { ok: true, at: capacityAt })
  writeFileSync(join(h, 'state', 'human-pass'), 'pass-for-lee\n')
  return h
}

async function setup({ up, homeDir, caps, hangLabel, fixedSites } = {}) {
  const upstream = up ?? (await fakeUpstream({ hangLabel }))
  const h = homeDir ?? home()
  const gate = createGate({
    home: h,
    upstream: { host: '127.0.0.1', port: upstream.port },
    stand: fakeStand(upstream),
    fixedSites: fixedSites ?? ['fixed1.qa.tracy.test'],
    caps
  })
  const { port } = await gate.start()
  const call = (method, path, { headers = {}, body, host = 'qa.tracy.test' } = {}) =>
    new Promise((res, rej) => {
      const data =
        body === undefined ? undefined : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
      const req = request(
        {
          host: '127.0.0.1',
          port,
          method,
          path,
          headers: {
            host,
            ...(data ? { 'content-type': 'application/json', 'content-length': data.length } : {}),
            ...headers
          }
        },
        (r) => {
          const chunks = []
          r.on('data', (c) => chunks.push(c))
          r.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8')
            let json = null
            try {
              json = JSON.parse(text)
            } catch {}
            res({ status: r.statusCode, headers: r.headers, json, text })
          })
        }
      )
      req.on('error', rej)
      req.end(data)
    })
  const close = async () => {
    await gate.close()
    if (!up) await upstream.close()
  }
  return { gate, port, up: upstream, home: h, call, close }
}

const lane = (name, extra = {}) => ({ 'x-qa-lane': KEYS[name], ...extra })
const asLane = (name, email = `bot@${name}.qa.tracy.test`, extra = {}) => ({
  ...lane(name, extra),
  cookie: `tracy_sess=${tokenFor(email)}`
})
const createBody = (label, buildId = randomUUID()) => ({ label, buildId, platform: 'wordpress' })

// ── G3.1 ─────────────────────────────────────────────────────────────────────────────────────

test('G3.1 forwards with Host kept and never hands upstream the QA credentials', async () => {
  const s = await setup()
  try {
    const human = (await s.call('GET', '/__qa/human?k=pass-for-lee')).headers['set-cookie'][0]
    const humanCookie = human.split(';')[0]
    const r1 = await s.call('GET', '/api/whatever', {
      headers: {
        ...lane('sonnet'),
        'x-qa-pr': '12',
        cookie: `${humanCookie}; tracy_sess=${tokenFor('a@sonnet.qa.tracy.test')}`
      }
    })
    assert.equal(r1.status, 200)
    const r2 = await s.call('GET', '/api/whatever', {
      headers: { 'x-qa-admin': KEYS.admin, 'x-qa-for-lane': 'sol' }
    })
    assert.equal(r2.status, 200)
    const r3 = await s.call('GET', '/qa-x/', {
      headers: { cookie: `a=1; ${humanCookie}; b=2` },
      host: 'qa.tracy.test:36080'
    })
    assert.equal(r3.status, 200)
    assert.equal(s.up.seen.length, 3)
    for (const rec of s.up.seen) {
      for (const h of ['x-qa-lane', 'x-qa-admin', 'x-qa-pr', 'x-qa-for-lane'])
        assert.equal(rec.headers[h], undefined)
      assert.doesNotMatch(rec.headers.cookie ?? '', /qa_human/)
    }
    assert.equal(s.up.seen[2].headers.host, 'qa.tracy.test:36080')
    assert.equal(s.up.seen[2].headers.cookie, 'a=1; b=2')
    assert.match(s.up.seen[0].headers.cookie, /^tracy_sess=/)
  } finally {
    await s.close()
  }
})

test('G3.1 a WebSocket echo passes through, stripped of QA headers', async () => {
  const s = await setup()
  try {
    const sock = connect(s.port, '127.0.0.1')
    await new Promise((r) => sock.once('connect', r))
    sock.write(
      'GET /ws HTTP/1.1\r\nhost: qa.tracy.test\r\nupgrade: websocket\r\nconnection: Upgrade\r\n' +
        `sec-websocket-key: dGhlIHNhbXBsZSBub25jZQ==\r\nsec-websocket-version: 13\r\nx-qa-lane: ${KEYS.sonnet}\r\n\r\n`
    )
    let got = ''
    sock.on('data', (d) => {
      got += d.toString()
      if (got.includes('101') && !got.includes('ping-123') && got.includes('\r\n\r\n')) sock.write('ping-123')
    })
    await new Promise((r, j) => {
      const t = setTimeout(() => j(new Error(`no echo: ${got}`)), 3000)
      const iv = setInterval(() => got.includes('ping-123') && (clearInterval(iv), clearTimeout(t), r()), 10)
    })
    sock.destroy()
    const ws = s.up.seen.find((x) => x.method === 'UPGRADE')
    assert.equal(ws.headers['x-qa-lane'], undefined)
    assert.equal(ws.headers.host, 'qa.tracy.test')
  } finally {
    await s.close()
  }
})

// ── G3.2 ─────────────────────────────────────────────────────────────────────────────────────

test('G3.2 live run: no credential is refused; a wrong lane key is refused', async () => {
  const s = await setup()
  try {
    assert.deepEqual((await s.call('GET', '/api/x')).json, { code: 'QA_WHO' })
    assert.equal(
      (await s.call('GET', '/api/x', { headers: { 'x-qa-lane': 'nope' } })).json.code,
      'QA_BAD_LANE_KEY'
    )
    assert.equal(
      (await s.call('GET', '/api/x', { host: 'evil.example', headers: lane('sonnet') })).json.code,
      'QA_UNKNOWN_HOST'
    )
    assert.equal(s.up.seen.length, 0)
  } finally {
    await s.close()
  }
})

test('G3.2 expired or broken run.json: lane keys refused, the human cookie still passes', async () => {
  for (const variant of ['expired', 'broken']) {
    const h = home({ run: false })
    if (variant === 'expired')
      writeRun(h, {
        runId: '20261002a',
        laneKeyHashes: { sonnet: sha(KEYS.sonnet) },
        leaseUntil: Date.now() - 1
      })
    else writeFileSync(join(h, 'state', 'run.json'), '{ torn')
    const s = await setup({ homeDir: h })
    try {
      const r = await s.call('GET', '/api/x', { headers: lane('sonnet') })
      assert.equal(r.status, 403)
      assert.equal(r.json.code, 'QA_NO_RUN')
      assert.equal((await s.call('GET', '/__qa/human?k=wrong')).status, 403)
      const human = (await s.call('GET', '/__qa/human?k=pass-for-lee')).headers['set-cookie'][0].split(';')[0]
      assert.equal((await s.call('GET', '/api/x', { headers: { cookie: human } })).status, 200)
      assert.equal(s.up.seen.length, 1)
    } finally {
      await s.close()
    }
  }
})

// ── G3.3 ─────────────────────────────────────────────────────────────────────────────────────

const siteLines = (h) => readLines(join(h, 'state', 'sites.jsonl')).lines

test('G3.3 claim + create with one buildId is ONE operation; resending adds none', async () => {
  const s = await setup({ caps: { siteOpsPerNight: 2, sitesLive: 5 } })
  try {
    const b = createBody('one')
    assert.equal(
      (await s.call('POST', '/api/sites/claim', { headers: asLane('sonnet'), body: b })).status,
      201
    )
    assert.equal((await s.call('POST', '/api/sites', { headers: asLane('sonnet'), body: b })).status, 201)
    assert.equal((await s.call('POST', '/api/sites', { headers: asLane('sonnet'), body: b })).status, 201)
    assert.equal(
      (await s.call('POST', '/api/sites/claim', { headers: asLane('sonnet'), body: createBody('two') }))
        .status,
      201
    )
    const third = await s.call('POST', '/api/sites/claim', {
      headers: asLane('sonnet'),
      body: createBody('three')
    })
    assert.equal(third.status, 429)
    assert.equal(third.json.code, 'QA_SITE_OPS_CAP')
    // Every forward has an intent and a result, recorded with the siteKey the stand answered.
    const lines = siteLines(s.home)
    assert.equal(lines.filter((l) => l.t === 'intent').length, 4)
    assert.equal(
      lines.filter((l) => l.t === 'result' && l.ok && l.siteKey === 'qa-one.qa.tracy.test').length,
      3
    )
  } finally {
    await s.close()
  }
})

test('G3.3 buildId and label are required; an import is refused', async () => {
  const s = await setup()
  try {
    const r1 = await s.call('POST', '/api/sites', { headers: asLane('sonnet'), body: { label: 'x' } })
    assert.equal(r1.json.code, 'QA_BUILD_ID_REQUIRED')
    const r2 = await s.call('POST', '/api/sites/claim', {
      headers: asLane('sonnet'),
      body: { buildId: randomUUID() }
    })
    assert.equal(r2.json.code, 'QA_LABEL_REQUIRED')
    const r3 = await s.call('POST', '/api/sites', {
      headers: asLane('sonnet'),
      body: { ...createBody('x'), origin: 'import' }
    })
    assert.equal(r3.status, 403)
    const r4 = await s.call('POST', '/api/sites/import', { headers: asLane('sonnet'), body: {} })
    assert.equal(r4.json.code, 'QA_IMPORT_REFUSED')
    assert.equal(s.up.seen.length, 0)
  } finally {
    await s.close()
  }
})

test('G3.3 three concurrent creates with one slot left: exactly one reaches the stand', async () => {
  const s = await setup({ caps: { sitesLive: 1 } })
  try {
    const answers = await Promise.all(
      ['a', 'b', 'c'].map((l) =>
        s.call('POST', '/api/sites/claim', { headers: asLane('sol'), body: createBody(l) })
      )
    )
    assert.deepEqual(answers.map((a) => a.status).sort(), [201, 429, 429])
    assert.equal(s.up.seen.length, 1)
  } finally {
    await s.close()
  }
})

test('G3.3 a stale capacity flag (> 90 s) refuses creation with 429', async () => {
  const s = await setup({ homeDir: home({ capacityAt: Date.now() - 91_000 }) })
  try {
    const r = await s.call('POST', '/api/sites/claim', { headers: asLane('sonnet'), body: createBody('x') })
    assert.equal(r.status, 429)
    assert.equal(r.json.code, 'QA_NO_CAPACITY')
    assert.equal(s.up.seen.length, 0)
  } finally {
    await s.close()
  }
})

test('G3.3 gate killed after the stand created the site: restart appends the result from GET /api/sites', async () => {
  const up = await fakeUpstream({ hangLabel: 'hang' })
  const h = home()
  const script = `
    const { createGate } = await import(${JSON.stringify(GATE_MODULE)})
    const g = createGate({ home: process.env.QA_HOME, upstream: { host: '127.0.0.1', port: ${up.port} },
      stand: { listSites: async () => [] } })
    const { port } = await g.start()
    process.stdout.write(port + '\\n')`
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, QA_HOME: h },
    stdio: ['ignore', 'pipe', 'inherit']
  })
  try {
    const port = await new Promise((r) => child.stdout.once('data', (d) => r(Number(String(d).trim()))))
    const arrived = up.nextRequest()
    const data = JSON.stringify(createBody('hang'))
    const req = request({
      host: '127.0.0.1',
      port,
      method: 'POST',
      path: '/api/sites/claim',
      headers: {
        host: 'qa.tracy.test',
        'content-type': 'application/json',
        'content-length': data.length,
        ...asLane('sonnet')
      }
    })
    req.on('error', () => {})
    req.end(data)
    await arrived
    child.kill('SIGKILL')
    await new Promise((r) => child.once('exit', r))
    const before = siteLines(h)
    assert.equal(before.filter((l) => l.t === 'intent').length, 1)
    assert.equal(before.filter((l) => l.t === 'result').length, 0)
    // A site the stand has that the book never saw (created around the gate) is an orphan.
    up.sites.get('bot@sonnet.qa.tracy.test').add('qa-sneaky.qa.tracy.test')

    const s = await setup({ up, homeDir: h })
    try {
      const after = siteLines(h)
      const result = after.find((l) => l.t === 'result')
      assert.equal(result.id, before[0].id)
      assert.equal(result.ok, true)
      assert.equal(result.reconciled, true)
      assert.equal(result.siteKey, 'qa-hang.qa.tracy.test')
      assert.deepEqual(
        after.filter((l) => l.t === 'orphan').map((l) => l.siteKey),
        ['qa-sneaky.qa.tracy.test']
      )
      // Reconciling again adds nothing.
      await s.gate.reconcile()
      assert.equal(siteLines(h).length, after.length)
    } finally {
      await s.close()
    }
  } finally {
    child.kill('SIGKILL')
    await up.close()
  }
})

test('G3.3 deleting a site frees the live slot', async () => {
  const s = await setup({ caps: { sitesLive: 1 } })
  try {
    assert.equal(
      (await s.call('POST', '/api/sites', { headers: asLane('sonnet'), body: createBody('d1') })).status,
      201
    )
    assert.equal(
      (await s.call('POST', '/api/sites', { headers: asLane('sonnet'), body: createBody('d2') })).status,
      429
    )
    assert.equal(
      (await s.call('DELETE', '/api/sites/qa-d1.qa.tracy.test', { headers: asLane('sonnet') })).status,
      200
    )
    assert.equal(
      (await s.call('POST', '/api/sites', { headers: asLane('sonnet'), body: createBody('d2') })).status,
      201
    )
  } finally {
    await s.close()
  }
})

// ── G3.4 ─────────────────────────────────────────────────────────────────────────────────────

test('the API host is not a site: the lane is checked against the site its /v1 path names', async () => {
  const s = await setup()
  try {
    assert.equal(
      (await s.call('POST', '/api/sites', { headers: asLane('sol'), body: createBody('solapi') })).status,
      201
    )
    const api = 'api.qa.tracy.test:36080'
    const own = await s.call('GET', '/v1/sites/qa-solapi.qa.tracy.test/records/post', {
      host: api,
      headers: lane('sol')
    })
    assert.equal(own.status, 200)
    for (const path of ['/v1/me', '/docs/', '/v1/sites/fixed1.qa.tracy.test/pages'])
      assert.equal((await s.call('GET', path, { host: api, headers: lane('sonnet') })).status, 200, path)
    const other = await s.call('GET', '/v1/sites/qa-solapi.qa.tracy.test/pages', {
      host: api,
      headers: lane('sonnet')
    })
    assert.equal(other.status, 403)
    assert.deepEqual(other.json, { code: 'QA_SITE_NOT_YOURS', site: 'qa-solapi.qa.tracy.test' })
  } finally {
    await s.close()
  }
})

test('G3.4 a lane reaches only its own sites; fixed sites cannot be deleted', async () => {
  const s = await setup()
  try {
    assert.equal(
      (await s.call('POST', '/api/sites', { headers: asLane('sol'), body: createBody('solsite') })).status,
      201
    )
    const key = 'qa-solsite.qa.tracy.test'
    // By Host, by dsh mount, by site door.
    assert.equal((await s.call('GET', '/', { host: key, headers: lane('sol') })).status, 200)
    for (const [path, host] of [
      ['/', key],
      [`/${key}/`, 'qa.tracy.test'],
      [`/api/sites/${key}/state`, 'qa.tracy.test']
    ]) {
      const r = await s.call('GET', path, { host, headers: lane('sonnet') })
      assert.equal(r.status, 403, path)
      assert.equal(r.json.code, 'QA_SITE_NOT_YOURS')
    }
    assert.equal(
      (await s.call('GET', '/', { host: 'qa-unknown.qa.tracy.test', headers: lane('sonnet') })).status,
      403
    )
    assert.equal(
      (await s.call('GET', '/', { host: 'fixed1.qa.tracy.test', headers: lane('sonnet') })).status,
      200
    )
    // Lanes may work on a fixed site (03/10: read-only blocked every site-changes test) ...
    const post = await s.call('POST', '/wp-admin/x', {
      host: 'fixed1.qa.tracy.test',
      headers: lane('sonnet'),
      body: {}
    })
    assert.equal(post.status, 200)
    // ... but never delete it.
    const del = await s.call('DELETE', '/api/sites/fixed1.qa.tracy.test', { headers: lane('sonnet') })
    assert.equal(del.status, 403)
    assert.equal(del.json.code, 'QA_FIXED_SITE_READ_ONLY')
    // The verify lane reaches a lane's site only for the PR that site was made for.
    await s.call('POST', '/api/sites', {
      headers: asLane('sol', undefined, { 'x-qa-pr': '77' }),
      body: createBody('pr77')
    })
    assert.equal(
      (
        await s.call('GET', '/', {
          host: 'qa-pr77.qa.tracy.test',
          headers: lane('verify', { 'x-qa-pr': '77' })
        })
      ).status,
      200
    )
    assert.equal(
      (
        await s.call('GET', '/', {
          host: 'qa-pr77.qa.tracy.test',
          headers: lane('verify', { 'x-qa-pr': '78' })
        })
      ).status,
      403
    )
  } finally {
    await s.close()
  }
})

// ── G3.5 ─────────────────────────────────────────────────────────────────────────────────────

test('G3.5 chat slots: no lane key 403, third turn of a PR 429, updateQueue counted', async () => {
  const s = await setup({ caps: { chatTurnMs: 0, chatCooldownMs: 0 } })
  try {
    await s.call('POST', '/api/sites', { headers: asLane('sonnet'), body: createBody('chat') })
    const key = 'qa-chat.qa.tracy.test'
    const human = (await s.call('GET', '/__qa/human?k=pass-for-lee')).headers['set-cookie'][0].split(';')[0]
    const noKey = await s.call('POST', `/${key}/api/session/prompt`, { headers: { cookie: human }, body: {} })
    assert.equal(noKey.status, 403)
    assert.equal(noKey.json.code, 'QA_CHAT_NEEDS_LANE')
    const pr = (n) => lane('sonnet', { 'x-qa-pr': n })
    assert.equal(
      (await s.call('POST', `/${key}/api/session/prompt`, { headers: pr('5'), body: {} })).status,
      200
    )
    assert.equal(
      (await s.call('POST', `/${key}/api/session.updateQueue`, { headers: pr('5'), body: {} })).status,
      200
    )
    const third = await s.call('POST', `/${key}/api/session/prompt`, { headers: pr('5'), body: {} })
    assert.equal(third.status, 429)
    assert.equal(third.json.code, 'QA_CHAT_PR_CAP')
    assert.equal(
      (await s.call('POST', `/${key}/api/session/prompt`, { headers: pr('6'), body: {} })).status,
      200
    )
    const chat = readLines(join(s.home, 'state', 'chat.jsonl')).lines
    assert.deepEqual(
      chat.filter((l) => l.t === 'intent').map((l) => [l.pr, l.door]),
      [
        ['5', 'prompt'],
        ['5', 'updateQueue'],
        ['6', 'prompt']
      ]
    )
    assert.equal(chat.filter((l) => l.t === 'result' && l.status === 200).length, 3)
  } finally {
    await s.close()
  }
})

test('G3.5 two turns on one site less than 90 s apart: 429; after turn-ended + cooldown: allowed', async () => {
  let clock = Date.now()
  const up = await fakeUpstream()
  const h = home()
  const gate = createGate({
    home: h,
    upstream: { host: '127.0.0.1', port: up.port },
    stand: fakeStand(up),
    now: () => clock
  })
  const { port } = await gate.start()
  const call = (method, path, headers, body = {}) =>
    new Promise((res) => {
      const data = JSON.stringify(body)
      const req = request(
        {
          host: '127.0.0.1',
          port,
          method,
          path,
          headers: {
            host: 'qa.tracy.test',
            'content-type': 'application/json',
            'content-length': data.length,
            ...headers
          }
        },
        (r) => {
          const c = []
          r.on('data', (d) => c.push(d))
          r.on('end', () =>
            res({ status: r.statusCode, json: JSON.parse(Buffer.concat(c).toString() || 'null') })
          )
        }
      )
      req.end(data)
    })
  try {
    writeJsonAtomic(join(h, 'state', 'capacity.json'), { ok: true, at: clock })
    await call('POST', '/api/sites', asLane('sol'), createBody('busy'))
    const key = 'qa-busy.qa.tracy.test'
    const p = { ...lane('sol'), 'x-qa-pr': '9' }
    assert.equal((await call('POST', `/${key}/api/session/prompt`, p)).status, 200)
    clock += 30_000
    const busy = await call('POST', `/${key}/api/session/prompt`, { ...lane('sol'), 'x-qa-pr': '10' })
    assert.equal(busy.status, 429)
    assert.equal(busy.json.code, 'QA_CHAT_SITE_BUSY')
    assert.equal(
      (await call('POST', '/__qa/turn-ended', { 'x-qa-lane': KEYS.sol }, { site: key })).status,
      403
    )
    assert.equal(
      (await call('POST', '/__qa/turn-ended', { 'x-qa-admin': KEYS.admin }, { site: key })).status,
      200
    )
    clock += 60_000
    assert.equal(
      (await call('POST', `/${key}/api/session/prompt`, { ...lane('sol'), 'x-qa-pr': '10' })).status,
      429
    )
    clock += 31_000
    assert.equal(
      (await call('POST', `/${key}/api/session/prompt`, { ...lane('sol'), 'x-qa-pr': '10' })).status,
      200
    )
  } finally {
    await gate.close()
    await up.close()
  }
})

// ── G3.6 ─────────────────────────────────────────────────────────────────────────────────────

const cookieLines = (h, runId = '20261003a') => readLines(join(h, 'r', runId, 'cookies.jsonl')).lines

test('G3.6 sessions and codes only for the lane own email domain', async () => {
  const s = await setup()
  try {
    const bad = await s.call('POST', '/__qa/session', {
      headers: lane('sonnet'),
      body: { email: 'x@sol.qa.tracy.test' }
    })
    assert.equal(bad.status, 403)
    assert.equal(bad.json.code, 'QA_EMAIL_NOT_YOURS')
    const otpBad = await s.call('GET', '/__qa/otp?email=x%40sol.qa.tracy.test', { headers: lane('sonnet') })
    assert.equal(otpBad.status, 403)
    const good = await s.call('POST', '/__qa/session', {
      headers: lane('sonnet'),
      body: { email: 'X@sonnet.qa.tracy.test' }
    })
    assert.equal(good.status, 200)
    assert.equal(good.json.email, 'x@sonnet.qa.tracy.test')
    assert.match(good.headers['set-cookie'][0], /^tracy_sess=v1\..*Domain=qa\.tracy\.test/)
    const otp = await s.call('GET', '/__qa/otp?email=x%40sonnet.qa.tracy.test', { headers: lane('sonnet') })
    assert.deepEqual(otp.json, { email: 'x@sonnet.qa.tracy.test', code: '123456' })
    // The verify lane may stand in for another lane, but only for a named PR.
    const v1 = await s.call('POST', '/__qa/session', {
      headers: lane('verify'),
      body: { email: 'y@sol.qa.tracy.test', forLane: 'sol' }
    })
    assert.equal(v1.json.code, 'QA_PR_REQUIRED')
    const v2 = await s.call('POST', '/__qa/session', {
      headers: lane('verify', { 'x-qa-pr': '3' }),
      body: { email: 'y@sol.qa.tracy.test', forLane: 'sol' }
    })
    assert.equal(v2.status, 200)
    const s2 = await s.call('POST', '/__qa/session', {
      headers: lane('sonnet'),
      body: { email: 'y@sol.qa.tracy.test', forLane: 'sol' }
    })
    assert.equal(s2.status, 403)
    assert.equal(s.up.seen.length, 0)
  } finally {
    await s.close()
  }
})

test('G3.6 every tracy_sess Set-Cookie leaving the gate is in cookies.jsonl', async () => {
  const s = await setup()
  try {
    const minted = await s.call('POST', '/__qa/session', {
      headers: lane('sol'),
      body: { email: 'a@sol.qa.tracy.test' }
    })
    const renewed = await s.call('GET', '/auth/me', { headers: asLane('sol', 'a@sol.qa.tracy.test') })
    const out = [minted, renewed]
      .flatMap((r) => r.headers['set-cookie'] ?? [])
      .map((c) => /^tracy_sess=([^;]+)/.exec(c)?.[1])
      .filter(Boolean)
    assert.equal(out.length, 2)
    const logged = cookieLines(s.home)
    for (const v of out) {
      const line = logged.find((l) => l.value === v)
      assert.ok(line, `missing ${v}`)
      assert.equal(line.sha256, sha(v))
      assert.equal(line.lane, 'sol')
    }
    assert.equal(logged.length, 2)
  } finally {
    await s.close()
  }
})

// ── stand adapter ────────────────────────────────────────────────────────────────────────────

test('stand: parseOtp takes the last mail to that address, not digits in the subject', () => {
  const log = [
    '[mail] to=a@sonnet.qa.tracy.test subject="Your code"',
    'Your sign-in code is 111111',
    '[mail] to=b@sonnet.qa.tracy.test subject="Your code"',
    'Your sign-in code is 222222',
    '[mail] to=a@sonnet.qa.tracy.test subject="Site 999999 code"',
    'Your sign-in code is 333333'
  ].join('\n')
  assert.equal(parseOtp(log, 'A@sonnet.qa.tracy.test'), '333333')
  assert.equal(parseOtp(log, 'b@sonnet.qa.tracy.test'), '222222')
  assert.equal(parseOtp(log, 'c@sonnet.qa.tracy.test'), null)
})

test('stand: dockerStand mints inside the container and reads the log through docker', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-gate-docker-'))
  tmps.push(dir)
  const argsLog = join(dir, 'args.log')
  const docker = join(dir, 'docker')
  writeFileSync(
    docker,
    `#!/bin/sh
printf '%s\\n' "$*" >> ${JSON.stringify(argsLog)}
case "$*" in
  *" exec "*|exec*) printf 'v1.eyJlbWFpbCI6ImEifQ.c2ln' ;;
  *logs*) printf '[mail] to=a@sol.qa.tracy.test subject="x"\\ncode 654321\\n' 1>&2 ;;
esac
`
  )
  chmodSync(docker, 0o755)
  mkdirSync(join(dir, 'x'), { recursive: true })
  const stand = dockerStand({
    container: 'tracy-qa-tracy-web-1',
    context: 'studio',
    docker,
    upstream: { host: '127.0.0.1', port: 1 },
    mainHost: 'qa.tracy.test'
  })
  assert.equal(await stand.mintSession('a@sol.qa.tracy.test'), 'v1.eyJlbWFpbCI6ImEifQ.c2ln')
  assert.equal(await stand.readOtp('a@sol.qa.tracy.test'), '654321')
  const { readFileSync } = await import('node:fs')
  const args = readFileSync(argsLog, 'utf8')
  assert.match(args, /--context studio exec -e QA_EMAIL=a@sol\.qa\.tracy\.test tracy-qa-tracy-web-1 node/)
  assert.doesNotMatch(args, /SESSION_SECRET=/)
})

test('the write prompt promises the live-site cap the gate enforces by default', () => {
  const prompt = readFileSync(resolve(here, '../qa/prompts/write-tests.md'), 'utf8')
  const promised = /at most (\d+) live sites/.exec(prompt)
  assert.ok(promised, 'write-tests.md names a live-site cap')
  assert.equal(Number(promised[1]), GATE_DEFAULTS.caps.sitesLive)
})
