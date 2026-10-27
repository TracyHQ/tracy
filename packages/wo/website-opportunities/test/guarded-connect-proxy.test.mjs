import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { once } from 'node:events'
import http from 'node:http'
import net from 'node:net'
import tls from 'node:tls'
import { isBlockedAddress } from '../domain/url-guard.mjs'
import { startGuardedProxy, sharedGuardedProxy } from '../src/guarded-connect-proxy.js'

// Local test servers live on 127.0.0.1, so this filter allows exactly that address and nothing else private.
const localOnly = (ip) => ip !== '127.0.0.1' && isBlockedAddress(ip)

function fakeDns(map) {
  const calls = []
  const lookup = async (host, options) => {
    calls.push({ host, options })
    const answer = map[host]
    const list = typeof answer === 'function' ? answer(calls.length) : answer
    if (!list) throw Object.assign(new Error(`ENOTFOUND ${host}`), { code: 'ENOTFOUND' })
    return list.map((address) => ({ address, family: net.isIP(address) }))
  }
  return { lookup, calls }
}

const noDns = () => {
  const dns = fakeDns({})
  return {
    calls: dns.calls,
    lookup: async (...args) => {
      dns.calls.push(args)
      throw new Error('DNS must not be asked')
    }
  }
}

async function listen(server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return server.address().port
}

async function echoServer() {
  const accepted = []
  const server = net.createServer((socket) => {
    accepted.push(socket.remoteAddress)
    socket.on('error', () => {})
    socket.pipe(socket)
  })
  const port = await listen(server)
  return { port, accepted, close: () => new Promise((r) => server.close(r)) }
}

async function closedPort() {
  const server = net.createServer()
  const port = await listen(server)
  await new Promise((r) => server.close(r))
  return port
}

function authHeader(proxyUrl) {
  const u = new URL(proxyUrl)
  const pair = `${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`
  return `Basic ${Buffer.from(pair).toString('base64')}`
}

// Sends raw bytes to the proxy and resolves with the status code once the response head arrives.
async function rawProxy(proxyUrl, text) {
  const u = new URL(proxyUrl)
  const socket = net.connect({ host: u.hostname, port: Number(u.port) })
  socket.on('error', () => {})
  await once(socket, 'connect')
  socket.write(text)
  let buffered = Buffer.alloc(0)
  return new Promise((resolve) => {
    const done = () => {
      const head = buffered.toString('latin1')
      const end = head.indexOf('\r\n\r\n')
      const status = Number(/^HTTP\/1\.[01] (\d{3})/.exec(head)?.[1] ?? 0)
      socket.removeListener('data', onData)
      resolve({ status, head: end >= 0 ? head.slice(0, end) : head, socket })
    }
    const onData = (chunk) => {
      buffered = Buffer.concat([buffered, chunk])
      if (buffered.includes('\r\n\r\n')) done()
    }
    socket.on('data', onData)
    socket.once('close', done)
  })
}

function connectVia(proxyUrl, target, { auth = authHeader(proxyUrl) } = {}) {
  const authLine = auth ? `Proxy-Authorization: ${auth}\r\n` : ''
  return rawProxy(proxyUrl, `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n${authLine}\r\n`)
}

async function withProxy(deps, fn) {
  const proxy = await startGuardedProxy(deps)
  try {
    return await fn(proxy)
  } finally {
    await proxy.close()
  }
}

test('listens on loopback with a random per-process token in the proxy URL', async () => {
  const a = await startGuardedProxy({ isBlockedAddress, lookup: noDns().lookup })
  const b = await startGuardedProxy({ isBlockedAddress, lookup: noDns().lookup })
  try {
    const u = new URL(a.proxyUrl)
    assert.equal(u.protocol, 'http:')
    assert.equal(u.hostname, '127.0.0.1')
    assert.equal(u.username, 'tracy')
    assert.match(u.password, /^[0-9a-f]{64}$/)
    assert.ok(Number(u.port) > 0)
    assert.notEqual(new URL(b.proxyUrl).password, u.password)
  } finally {
    await a.close()
    await b.close()
  }
})

test('a missing or wrong Proxy-Authorization gets 407 before any DNS lookup or connect', async () => {
  const dns = noDns()
  await withProxy({ isBlockedAddress, lookup: dns.lookup }, async (proxy) => {
    const missing = await connectVia(proxy.proxyUrl, 'shop.test:443', { auth: '' })
    assert.equal(missing.status, 407)
    const wrong = await connectVia(proxy.proxyUrl, 'shop.test:443', {
      auth: `Basic ${Buffer.from('tracy:nope').toString('base64')}`
    })
    assert.equal(wrong.status, 407)
    const forward = await rawProxy(
      proxy.proxyUrl,
      'GET http://shop.test/ HTTP/1.1\r\nHost: shop.test\r\n\r\n'
    )
    assert.equal(forward.status, 407)
    assert.ok(!forward.head.includes(new URL(proxy.proxyUrl).password))
    assert.equal(dns.calls.length, 0)
    assert.equal(proxy.stats().refused, 3)
  })
})

test('CONNECT tunnels bytes to the checked IP of a public name', async () => {
  const echo = await echoServer()
  const dns = fakeDns({ 'shop.test': ['127.0.0.1'] })
  try {
    await withProxy(
      { isBlockedAddress: localOnly, lookup: dns.lookup, allowedPorts: [echo.port] },
      async (proxy) => {
        const { status, socket } = await connectVia(proxy.proxyUrl, `shop.test:${echo.port}`)
        assert.equal(status, 200)
        socket.write('ping')
        const [chunk] = await once(socket, 'data')
        assert.equal(chunk.toString(), 'ping')
        socket.destroy()
        assert.equal(dns.calls.length, 1)
        assert.deepEqual(dns.calls[0], { host: 'shop.test', options: { all: true, verbatim: true } })
        assert.equal(proxy.stats().tunnels, 1)
      }
    )
  } finally {
    await echo.close()
  }
})

test('CONNECT to blocked IP literals is refused at the door, in every spelling', async () => {
  const dns = noDns()
  await withProxy({ isBlockedAddress, lookup: dns.lookup }, async (proxy) => {
    for (const target of [
      '127.0.0.1:443',
      '2130706433:443',
      '0x7f.0.0.1:443',
      '0177.0.0.1:443',
      '127.1:443',
      '[::1]:443',
      '[::ffff:127.0.0.1]:443',
      '169.254.169.254:80',
      '100.64.0.1:443',
      '[64:ff9b:1::7f00:1]:443',
      '[fd00:ec2::254]:80'
    ]) {
      const { status } = await connectVia(proxy.proxyUrl, target)
      assert.equal(status, 403, target)
    }
    assert.equal(dns.calls.length, 0)
  })
})

test('CONNECT only to allowed ports, and only with a plain host:port authority', async () => {
  const dns = noDns()
  await withProxy({ isBlockedAddress, lookup: dns.lookup }, async (proxy) => {
    assert.equal((await connectVia(proxy.proxyUrl, 'shop.test:8443')).status, 403)
    assert.equal((await connectVia(proxy.proxyUrl, 'shop.test:22')).status, 403)
    for (const target of [
      'shop.test',
      'user@shop.test:443',
      'shop.test:443/x',
      'shop.test:443?x',
      'a\\b.test:443'
    ]) {
      assert.equal((await connectVia(proxy.proxyUrl, target)).status, 400, target)
    }
    assert.equal(dns.calls.length, 0)
  })
})

test('a name answering ANY blocked address is refused whole, with no connection made', async () => {
  const echo = await echoServer()
  const dns = fakeDns({
    'mixed.test': ['127.0.0.1', '10.0.0.1'],
    'meta.test': ['169.254.169.254'],
    'nat64.test': ['64:ff9b:1::7f00:1'],
    'empty.test': []
  })
  try {
    await withProxy(
      { isBlockedAddress: localOnly, lookup: dns.lookup, allowedPorts: [echo.port] },
      async (proxy) => {
        for (const host of ['mixed.test', 'meta.test', 'nat64.test', 'empty.test']) {
          assert.equal((await connectVia(proxy.proxyUrl, `${host}:${echo.port}`)).status, 403, host)
        }
        assert.equal((await connectVia(proxy.proxyUrl, `nxdomain.test:${echo.port}`)).status, 502)
        assert.equal(echo.accepted.length, 0)
        assert.equal(proxy.stats().tunnels, 0)
      }
    )
  } finally {
    await echo.close()
  }
})

test('DNS rebinding: one lookup, and the socket goes to that first answer', async () => {
  const echo = await echoServer()
  // A second lookup would answer 10.0.0.1, which nothing listens on and the filter blocks.
  const dns = fakeDns({ 'rebind.test': (n) => (n === 1 ? ['127.0.0.1'] : ['10.0.0.1']) })
  try {
    await withProxy(
      { isBlockedAddress: localOnly, lookup: dns.lookup, allowedPorts: [echo.port] },
      async (proxy) => {
        const { status, socket } = await connectVia(proxy.proxyUrl, `rebind.test:${echo.port}`)
        assert.equal(status, 200)
        socket.write('x')
        await once(socket, 'data')
        socket.destroy()
      }
    )
    assert.equal(dns.calls.length, 1)
    assert.deepEqual(echo.accepted, ['127.0.0.1'])
  } finally {
    await echo.close()
  }
})

test('a closed upstream answers 502 and the proxy does not try anything else', async () => {
  const port = await closedPort()
  const dns = fakeDns({ 'gone.test': ['127.0.0.1'] })
  await withProxy(
    { isBlockedAddress: localOnly, lookup: dns.lookup, allowedPorts: [port] },
    async (proxy) => {
      assert.equal((await connectVia(proxy.proxyUrl, `gone.test:${port}`)).status, 502)
      const fwd = await rawProxy(
        proxy.proxyUrl,
        `GET http://gone.test:${port}/ HTTP/1.1\r\nHost: gone.test\r\n` +
          `Proxy-Authorization: ${authHeader(proxy.proxyUrl)}\r\nConnection: close\r\n\r\n`
      )
      assert.equal(fwd.status, 502)
      assert.equal(dns.calls.length, 2)
    }
  )
})

test('a client that leaves during the DNS lookup causes no upstream connection', async () => {
  const echo = await echoServer()
  let release
  const gate = new Promise((r) => (release = r))
  const lookup = async () => {
    await gate
    return [{ address: '127.0.0.1', family: 4 }]
  }
  try {
    await withProxy({ isBlockedAddress: localOnly, lookup, allowedPorts: [echo.port] }, async (proxy) => {
      const u = new URL(proxy.proxyUrl)
      const socket = net.connect({ host: u.hostname, port: Number(u.port) })
      await once(socket, 'connect')
      const auth = authHeader(proxy.proxyUrl)
      socket.write(`CONNECT slow.test:${echo.port} HTTP/1.1\r\nProxy-Authorization: ${auth}\r\n\r\n`)
      await new Promise((r) => setTimeout(r, 30))
      socket.destroy()
      await new Promise((r) => setTimeout(r, 30))
      release()
      await new Promise((r) => setTimeout(r, 50))
      assert.equal(echo.accepted.length, 0)
    })
  } finally {
    await echo.close()
  }
})

// Minimal self-signed X.509 (EC P-256) built with node:crypto, so the TLS test needs no openssl or fixture.
function der(tag, ...parts) {
  const body = Buffer.concat(parts)
  let len
  if (body.length < 128) len = Buffer.from([body.length])
  else {
    const bytes = []
    for (let n = body.length; n > 0; n >>= 8) bytes.unshift(n & 0xff)
    len = Buffer.from([0x80 | bytes.length, ...bytes])
  }
  return Buffer.concat([Buffer.from([tag]), len, body])
}
const seq = (...parts) => der(0x30, ...parts)
function oid(dotted) {
  const [a, b, ...rest] = dotted.split('.').map(Number)
  const out = [40 * a + b]
  for (const n of rest) {
    const enc = [n & 0x7f]
    for (let v = n >> 7; v > 0; v >>= 7) enc.unshift((v & 0x7f) | 0x80)
    out.push(...enc)
  }
  return der(0x06, Buffer.from(out))
}
function selfSignedCert(name) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const alg = seq(oid('1.2.840.10045.4.3.2'))
  const dn = seq(der(0x31, seq(oid('2.5.4.3'), der(0x0c, Buffer.from(name)))))
  // Fixed dates: CI shifts Date.now(), OpenSSL does not.
  const validity = seq(der(0x17, Buffer.from('000101000000Z')), der(0x17, Buffer.from('491231235959Z')))
  const san = seq(oid('2.5.29.17'), der(0x04, seq(der(0x82, Buffer.from(name)))))
  const tbs = seq(
    der(0xa0, der(0x02, Buffer.from([2]))),
    der(0x02, Buffer.from([1])),
    alg,
    dn,
    validity,
    dn,
    publicKey.export({ type: 'spki', format: 'der' }),
    der(0xa3, seq(san))
  )
  const signature = sign('sha256', tbs, privateKey)
  const cert = seq(tbs, alg, der(0x03, Buffer.concat([Buffer.from([0]), signature])))
  const body = cert
    .toString('base64')
    .match(/.{1,64}/g)
    .join('\n')
  const pem = `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`
  return { cert: pem, key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }
}

test('real TLS through a CONNECT tunnel: the origin sees the client SNI and the handshake verifies', async () => {
  const { cert, key } = selfSignedCert('shop.test')
  const seen = []
  const server = tls.createServer({ cert, key }, (socket) => {
    seen.push(socket.servername)
    socket.on('error', () => {})
    socket.end('hello over tls')
  })
  const port = await listen(server)
  const dns = fakeDns({ 'shop.test': ['127.0.0.1'] })
  try {
    await withProxy(
      { isBlockedAddress: localOnly, lookup: dns.lookup, allowedPorts: [port] },
      async (proxy) => {
        const { status, socket } = await connectVia(proxy.proxyUrl, `shop.test:${port}`)
        assert.equal(status, 200)
        const secure = tls.connect({ socket, servername: 'shop.test', ca: cert })
        await once(secure, 'secureConnect')
        assert.equal(secure.authorized, true)
        let text = ''
        for await (const chunk of secure) text += chunk
        assert.equal(text, 'hello over tls')
        assert.deepEqual(seen, ['shop.test'])
      }
    )
  } finally {
    await new Promise((r) => server.close(r))
  }
})

function forwardVia(proxyUrl, url, { method = 'GET', headers = {} } = {}) {
  const u = new URL(proxyUrl)
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: u.hostname,
      port: Number(u.port),
      method,
      path: url,
      setHost: false,
      agent: false,
      headers: { 'proxy-authorization': authHeader(proxyUrl), ...headers }
    })
    req.on('response', (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

async function recordingOrigin(handler) {
  const seen = []
  const server = http.createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, headers: req.headers })
    handler(req, res)
  })
  const port = await listen(server)
  return { port, seen, close: () => new Promise((r) => (server.closeAllConnections(), server.close(r))) }
}

test('forward GET: Host from the URL, proxy/forwarding headers stripped, redirect not followed', async () => {
  const origin = await recordingOrigin((req, res) => {
    res.writeHead(302, { location: 'http://127.0.0.1/private', 'x-origin': 'yes' })
    res.end('moved')
  })
  const dns = fakeDns({ 'shop.test': ['127.0.0.1'] })
  try {
    await withProxy(
      { isBlockedAddress: localOnly, lookup: dns.lookup, allowedPorts: [origin.port] },
      async (proxy) => {
        const res = await forwardVia(proxy.proxyUrl, `http://shop.test:${origin.port}/menu?lang=en`, {
          headers: {
            host: 'evil.example',
            'user-agent': 'Chrome-ish',
            'x-forwarded-for': '1.2.3.4',
            'x-forwarded-host': 'evil.example',
            forwarded: 'for=1.2.3.4',
            'proxy-connection': 'keep-alive',
            connection: 'close, x-secret-hop',
            'x-secret-hop': 'drop me',
            'x-kept': 'kept'
          }
        })
        assert.equal(res.status, 302)
        assert.equal(res.headers.location, 'http://127.0.0.1/private')
        assert.equal(res.headers['x-origin'], 'yes')
        assert.equal(res.body, 'moved')
        assert.equal(origin.seen.length, 1)
        const [seen] = origin.seen
        assert.equal(seen.url, '/menu?lang=en')
        assert.equal(seen.headers.host, `shop.test:${origin.port}`)
        assert.equal(seen.headers['user-agent'], 'Chrome-ish')
        assert.equal(seen.headers['x-kept'], 'kept')
        const stripped = [
          'proxy-authorization',
          'proxy-connection',
          'x-forwarded-for',
          'x-forwarded-host',
          'forwarded',
          'x-secret-hop'
        ]
        for (const name of stripped) assert.equal(seen.headers[name], undefined, name)
        assert.ok(!JSON.stringify(seen.headers).includes(new URL(proxy.proxyUrl).password))
        assert.equal(proxy.stats().forwards, 1)
      }
    )
  } finally {
    await origin.close()
  }
})

test('forward path refuses bad methods, Upgrade, credentials, non-http, odd ports and blocked literals', async () => {
  const dns = noDns()
  await withProxy({ isBlockedAddress, lookup: dns.lookup }, async (proxy) => {
    const cases = [
      ['POST', 'http://shop.test/', {}, 405],
      ['PUT', 'http://shop.test/', {}, 405],
      ['GET', 'http://shop.test/', { connection: 'Upgrade', upgrade: 'websocket' }, 400],
      ['GET', 'http://user:pass@shop.test/', {}, 400],
      ['GET', 'http://a@b@shop.test/', {}, 400],
      ['GET', 'https://shop.test/', {}, 400],
      ['GET', 'ftp://shop.test/', {}, 400],
      ['GET', '/relative', {}, 400],
      ['GET', 'http://shop.test:8080/', {}, 403],
      ['GET', 'http://2130706433/', {}, 403],
      ['GET', 'http://0177.0.0.1/', {}, 403],
      ['GET', 'http://0x7f000001/', {}, 403],
      ['GET', 'http://[::1]/', {}, 403],
      ['GET', 'http://[::ffff:127.0.0.1]/', {}, 403],
      ['GET', 'http://169.254.169.254/latest/meta-data/', {}, 403]
    ]
    for (const [method, url, headers, status] of cases) {
      const res = await forwardVia(proxy.proxyUrl, url, { method, headers }).catch(() => ({ status: 0 }))
      assert.equal(res.status, status, `${method} ${url}`)
    }
    assert.equal(dns.calls.length, 0)
    assert.equal(proxy.stats().forwards, 0)
  })
})

test('forward path: a client that goes away mid-body cancels the upstream response', async () => {
  let upstreamClosed
  const closed = new Promise((r) => (upstreamClosed = r))
  const origin = await recordingOrigin((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.write('first chunk')
    res.on('close', upstreamClosed)
  })
  const dns = fakeDns({ 'slow.test': ['127.0.0.1'] })
  try {
    await withProxy(
      { isBlockedAddress: localOnly, lookup: dns.lookup, allowedPorts: [origin.port] },
      async (proxy) => {
        const u = new URL(proxy.proxyUrl)
        const req = http.request({
          host: u.hostname,
          port: Number(u.port),
          path: `http://slow.test:${origin.port}/`,
          agent: false,
          headers: { 'proxy-authorization': authHeader(proxy.proxyUrl) }
        })
        req.on('error', () => {})
        req.on('response', (res) => res.once('data', () => req.destroy()))
        req.end()
        await Promise.race([
          closed,
          new Promise((_, reject) => setTimeout(() => reject(new Error('upstream still open')), 2000))
        ])
      }
    )
  } finally {
    await origin.close()
  }
})

const tcpHandles = () => process.getActiveResourcesInfo().filter((t) => t === 'TCPSocketWrap').length

async function settles(check, ms = 2000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (check()) return true
    await new Promise((r) => setTimeout(r, 20))
  }
  return check()
}

test('20 parallel tunnels work and every socket is released afterwards', async () => {
  const echo = await echoServer()
  const dns = fakeDns({ 'shop.test': ['127.0.0.1'] })
  const proxy = await startGuardedProxy({
    isBlockedAddress: localOnly,
    lookup: dns.lookup,
    allowedPorts: [echo.port]
  })
  try {
    const baseline = tcpHandles()
    await Promise.all(
      Array.from({ length: 20 }, async (_, i) => {
        const { status, socket } = await connectVia(proxy.proxyUrl, `shop.test:${echo.port}`)
        assert.equal(status, 200)
        socket.write(`ping ${i}`)
        const [chunk] = await once(socket, 'data')
        assert.equal(chunk.toString(), `ping ${i}`)
        socket.end()
        await once(socket, 'close')
      })
    )
    assert.equal(proxy.stats().tunnels, 20)
    // Sockets left over from earlier tests may close meanwhile, so the count can only fall below the baseline.
    assert.ok(
      await settles(() => tcpHandles() <= baseline),
      `open TCP handles ${tcpHandles()} vs baseline ${baseline}`
    )
  } finally {
    await proxy.close()
    await echo.close()
  }
})

test('sharedGuardedProxy returns one proxy per process until it is closed', async () => {
  const deps = { isBlockedAddress, lookup: noDns().lookup }
  const first = sharedGuardedProxy(deps)
  assert.equal(sharedGuardedProxy(deps), first)
  const proxy = await first
  assert.match(proxy.proxyUrl, /^http:\/\/tracy:[0-9a-f]{64}@127\.0\.0\.1:\d+$/)
  await proxy.close()
  const next = sharedGuardedProxy(deps)
  assert.notEqual(next, first)
  await (await next).close()
})
