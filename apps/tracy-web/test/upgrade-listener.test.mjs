// The `upgrade` listener of tracy-web (`src/workspace/upgrade.js`): a failure in one WebSocket
// handshake closes that socket and is logged in one line — it never escapes as an unhandled
// rejection, which ends the process (stand 11/10/2026: `getaddrinfo EAI_AGAIN postgres` from the
// resolver while dsh was rebuilt took tracy-web down for every site).
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import net from 'node:net'
import { forwardUpgrade } from '../src/workspace/proxy.js'
import { upgradeListener } from '../src/workspace/upgrade.js'

const config = { origin: 'http://tracy.test:51710', sessionSecret: 's' }

function fakeSocket() {
  const s = /** @type {any} */ (new EventEmitter())
  s.destroyed = false
  s.writableEnded = false
  s.written = ''
  s.destroy = () => {
    s.destroyed = true
  }
  s.end = (data, done) => {
    s.written += data ?? ''
    s.writableEnded = true
    done?.()
  }
  return s
}
/** The status line a refused socket was answered with, or null for a bare close. */
const statusOf = (socket) => /^HTTP\/1\.1 (\d{3}) /.exec(socket.written)?.[1] ?? null
function fakeLog() {
  const lines = []
  return { lines, log: (l) => lines.push(['log', l]), warn: (l) => lines.push(['warn', l]) }
}
const req = (over = {}) => ({ url: '/scwp1.tracy.test/_ws', headers: { cookie: 'tracy_sess=x' }, ...over })
const dnsError = () => Object.assign(new Error('getaddrinfo EAI_AGAIN postgres'), { code: 'EAI_AGAIN' })

const resolverWith = (over = {}) => ({
  locate: () => ({ scope: 'site', siteKey: 'scwp1.tracy.test', mount: '/scwp1.tracy.test' }),
  canonicalize: async (l) => l,
  seatFor: async () => ({ refused: false, dsh: { origin: 'http://127.0.0.1:51790' }, prefixed: true }),
  tokenFor: () => 'T',
  ...over
})

test('a database failure in the handshake closes that socket, logs one line, and rejects nothing', async () => {
  const log = fakeLog()
  const socket = fakeSocket()
  let forwarded = false
  const listener = upgradeListener({
    resolver: resolverWith({
      canonicalize: async () => {
        throw dnsError()
      }
    }),
    config,
    log,
    session: async () => 'mai@example.test',
    forward: () => {
      forwarded = true
    }
  })
  // The promise Node drops: it must resolve, never reject.
  await listener(/** @type {any} */ (req()), socket, Buffer.alloc(0))
  assert.equal(socket.destroyed, true)
  assert.equal(forwarded, false)
  assert.equal(log.lines.length, 1)
  assert.equal(log.lines[0][0], 'warn')
  assert.match(
    log.lines[0][1],
    /^\[ws\] handshake for \/scwp1\.tracy\.test\/_ws dropped: EAI_AGAIN getaddrinfo/
  )
})

test('a failure in the seat read and a throwing session read are caught the same way', async () => {
  for (const over of [
    {
      resolver: resolverWith({
        seatFor: async () => {
          throw dnsError()
        }
      }),
      session: async () => 'mai@example.test'
    },
    {
      resolver: resolverWith(),
      session: async () => {
        throw new Error('bad cookie')
      }
    }
  ]) {
    const log = fakeLog()
    const socket = fakeSocket()
    await upgradeListener({ config, log, forward: () => {}, ...over })(
      /** @type {any} */ (req()),
      socket,
      Buffer.alloc(0)
    )
    assert.equal(socket.destroyed, true)
    assert.equal(log.lines.filter(([k]) => k === 'warn').length, 1)
  }
})

test('a browser that resets the socket while the checks await is no uncaught error', async () => {
  const log = fakeLog()
  const socket = fakeSocket()
  let release
  const gate = new Promise((r) => {
    release = r
  })
  const listener = upgradeListener({
    resolver: resolverWith({ canonicalize: async (l) => (await gate, l) }),
    config,
    log,
    session: async () => null,
    forward: () => {}
  })
  const done = listener(/** @type {any} */ (req()), socket, Buffer.alloc(0))
  // An EventEmitter with no `error` listener throws on emit: the listener must be there already.
  assert.doesNotThrow(() =>
    socket.emit('error', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }))
  )
  release()
  await done
  assert.equal(socket.destroyed, true, 'no session: closed')
  assert.match(log.lines[0][1], /client socket error before the splice: ECONNRESET/)
})

test('a good handshake is spliced, and the early error listener is handed over to the splice', async () => {
  const log = fakeLog()
  const socket = fakeSocket()
  /** @type {any} */
  let target = null
  await upgradeListener({
    resolver: resolverWith(),
    config,
    log,
    session: async () => 'mai@example.test',
    forward: (_req, s, _head, t, opts) => {
      target = { t: t.toString(), opts }
      s.on('error', () => {})
    }
  })(/** @type {any} */ (req({ url: '/scwp1.tracy.test/_ws?x=1' })), socket, Buffer.alloc(0))
  assert.equal(socket.destroyed, false)
  assert.ok(target, 'forwarded')
  assert.equal(target.opts.seatToken, 'T')
  assert.equal(socket.listenerCount('error'), 1, 'only the splice listens now')
  assert.deepEqual(
    log.lines.map(([k]) => k),
    ['log']
  )
})

test('no resolver (no database): every handshake is closed, nothing logged as a failure', async () => {
  const log = fakeLog()
  const socket = fakeSocket()
  await upgradeListener({ resolver: null, config, log })(/** @type {any} */ (req()), socket, Buffer.alloc(0))
  assert.equal(socket.destroyed, true)
  assert.equal(log.lines.length, 0)
})

// #888 WS-1: behind the Cloudflare tunnel a socket closed with no answer is logged by cloudflared as
// "Unable to reach the origin service … EOF" and handed to the browser as 502 (measured on dev
// 11/10/2026: every remote.mux failure in the tunnel log). A refusal must carry its own status.

test('issue 888: each refused handshake is answered with its status, never a bare close', async () => {
  const cases = [
    { name: 'no database', resolver: null, status: '503' },
    {
      name: 'no site in the path',
      resolver: resolverWith({ locate: () => ({ scope: 'root' }) }),
      status: '404'
    },
    { name: 'not signed in', resolver: resolverWith(), session: async () => null, status: '401' },
    {
      name: 'no seat on this site',
      resolver: resolverWith({ seatFor: async () => ({ refused: true }) }),
      status: '403'
    },
    { name: 'seat token to re-mint', resolver: resolverWith({ tokenFor: () => null }), status: '401' },
    {
      name: 'the database failed',
      resolver: resolverWith({
        canonicalize: async () => {
          throw dnsError()
        }
      }),
      status: '503'
    }
  ]
  for (const c of cases) {
    const socket = fakeSocket()
    await upgradeListener({
      resolver: c.resolver,
      config,
      log: fakeLog(),
      session: c.session ?? (async () => 'mai@example.test'),
      forward: () => assert.fail(`${c.name}: must not be forwarded`)
    })(/** @type {any} */ (req()), socket, Buffer.alloc(0))
    assert.equal(statusOf(socket), c.status, c.name)
    assert.match(socket.written, /\r\nconnection: close\r\n/i, c.name)
    assert.equal(socket.destroyed, true, `${c.name}: closed after the answer`)
  }
})

test('issue 888: dsh unreachable (a redeploy) answers 503 with retry-after, not a bare close', {
  timeout: 5000
}, async () => {
  // A port nothing listens on: connect is refused, exactly what a restarting dsh container does.
  const port = await new Promise((resolve) => {
    const probe = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = /** @type {any} */ (probe.address())
      probe.close(() => resolve(port))
    })
  })
  const socket = fakeSocket()
  socket.pipe = () => {}
  const closed = new Promise((resolve) => {
    const end = socket.end
    socket.end = (data, done) => {
      end(data, done)
      resolve(undefined)
    }
  })
  forwardUpgrade(
    /** @type {any} */ ({ method: 'GET', headers: { host: 'tracy.test' } }),
    socket,
    Buffer.alloc(0),
    new URL(`http://127.0.0.1:${port}/s.tracy.test/api/remote.mux`),
    { seatToken: 'T', mount: '/s.tracy.test', viewerHost: 'tracy.test' }
  )
  await closed
  assert.equal(statusOf(socket), '503')
  assert.match(socket.written, /\r\nretry-after: 5\r\n/)
  assert.equal(socket.destroyed, true)
})

// Review of #1181 (M1): a refused socket is ended, and its answer may still be flushing when the
// listener returns and takes its early `error` listener off. A browser reset in that gap emitted an
// `error` nobody listened to — an uncaught exception that ends tracy-web for every site.
test('issue 888: a refused socket that resets while its answer flushes is no uncaught error', async () => {
  const refusals = [
    { name: 'no database', resolver: null },
    { name: 'no site in the path', resolver: resolverWith({ locate: () => ({ scope: 'root' }) }) },
    { name: 'not signed in', resolver: resolverWith(), session: async () => null },
    { name: 'no seat on this site', resolver: resolverWith({ seatFor: async () => ({ refused: true }) }) },
    { name: 'seat token to re-mint', resolver: resolverWith({ tokenFor: () => null }) }
  ]
  for (const c of refusals) {
    const socket = fakeSocket()
    // A real socket calls back once the answer is flushed, later; this one never gets that far.
    socket.end = (data) => {
      socket.written += data ?? ''
      socket.writableEnded = true
    }
    await upgradeListener({
      resolver: c.resolver,
      config,
      log: fakeLog(),
      session: c.session ?? (async () => 'mai@example.test'),
      forward: () => assert.fail(`${c.name}: must not be forwarded`)
    })(/** @type {any} */ (req()), socket, Buffer.alloc(0))
    assert.doesNotThrow(
      () => socket.emit('error', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })),
      c.name
    )
    assert.equal(socket.destroyed, true, `${c.name}: a reset during the answer closes the socket`)
  }
})

test('a socket opened during an admin view is the viewed customer’s, not the admin’s', async () => {
  const { mintSession, mintViewSession } = await import('../src/lib/session.js')
  const secret = 'view-secret-view-secret-view-sec'
  const cfg = { origin: 'http://tracy.test:51710', sessionSecret: secret }
  const own = await mintSession('owner@tracy.test', secret)
  const view = await mintViewSession('customer@example.com', 'owner@tracy.test', secret)
  const seen = []
  const listener = upgradeListener({
    resolver: resolverWith({
      seatFor: async ({ email }) => {
        seen.push(email)
        return { refused: true }
      }
    }),
    config: cfg,
    log: fakeLog()
  })
  await listener(
    /** @type {any} */ (req({ headers: { cookie: `tracy_sess=${own}; tracy_view=${view}` } })),
    fakeSocket(),
    Buffer.alloc(0)
  )
  assert.deepEqual(seen, ['customer@example.com'])
})
