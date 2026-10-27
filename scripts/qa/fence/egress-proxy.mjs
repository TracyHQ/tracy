// Egress proxy for one model port (plan §3.2). Runs OUTSIDE the fence; the fenced CLI may reach only this.
// Accepts only `CONNECT <exact allowed host>:443`; refuses bare IPs, other ports, plain HTTP and any odd
// character in the authority; resolves the name itself and refuses private/loopback answers; closes a
// tunnel idle for `idleMs` (default 120 s); logs every request as one JSON line.
//
// Exports:
//   createEgressProxy({ port, host?, allow, logFile, idleMs?, offFile?, offPollMs?, lookup?, resolveUpstream? })
//     -> { listening: Promise<void>, port: number, idleMs, setOff(hosts: string[]), close(): Promise<void> }
//   resolveUpstream(host, port) is for tests: returns { host, port } to dial instead of the real name.
//   configFrom(args, env?) -> options for createEgressProxy (flags, else QA_EGRESS_* variables)
// Command: node egress-proxy.mjs [--listen host:port | --port n] [--allow h,h] [--log f] [--off-file f] [--idle-ms n]
//   or the same through QA_EGRESS_LISTEN, QA_EGRESS_ALLOW, QA_EGRESS_DENY_FILE, QA_EGRESS_LOG.
import { appendFileSync, readFileSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import dns from 'node:dns/promises'
import { fileURLToPath } from 'node:url'

const HOST_RE =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/
const AUTHORITY_RE = /^([a-z0-9.-]+):(\d{1,5})$/

function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    )
  }
  const v = ip.toLowerCase()
  return (
    v === '::' ||
    v === '::1' ||
    v.startsWith('fc') ||
    v.startsWith('fd') ||
    v.startsWith('fe80') ||
    v.startsWith('::ffff:')
  )
}

/** Default upstream: the real name, refused when any answer is private or loopback (DNS rebinding). */
const publicResolver = (lookup) => async (host, port) => {
  const answers = await lookup(host, { all: true })
  const ok = answers.find((a) => !isPrivate(a.address))
  if (!ok || answers.some((a) => isPrivate(a.address)))
    throw Object.assign(new Error('private address'), { code: 'PRIVATE' })
  return { host: ok.address, port }
}

export function createEgressProxy({
  port,
  host = '127.0.0.1',
  allow,
  logFile,
  idleMs = 120_000,
  offFile,
  offPollMs = 1000,
  lookup = dns.lookup,
  resolveUpstream = publicResolver(lookup)
}) {
  for (const h of allow) {
    if (!HOST_RE.test(h) || net.isIP(h))
      throw new Error(`egress proxy: allow list needs a host name, got ${JSON.stringify(h)}`)
  }
  const allowed = new Set(allow)
  let off = new Set()
  const tunnels = new Set() // { target, client, upstream }

  const log = (entry) => {
    try {
      appendFileSync(logFile, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`)
    } catch {}
  }

  const setOff = (hosts) => {
    off = new Set(hosts)
    for (const t of tunnels) {
      if (off.has(t.name)) {
        log({ event: 'close', target: t.target, reason: 'switched-off' })
        t.client.destroy()
        t.upstream.destroy()
      }
    }
  }

  let poll
  if (offFile) {
    const readOff = () => {
      let text = ''
      try {
        text = readFileSync(offFile, 'utf8')
      } catch {}
      const next = text
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      if (next.join('\n') !== [...off].join('\n')) setOff(next)
    }
    readOff()
    poll = setInterval(readOff, offPollMs)
    poll.unref()
  }

  const refuse = (socket, target, reason, status = 403) => {
    log({ event: 'refuse', target, reason })
    socket.end(
      `HTTP/1.1 ${status} ${status === 403 ? 'Forbidden' : 'Bad Gateway'}\r\nconnection: close\r\ncontent-length: 0\r\n\r\n`
    )
  }

  const server = http.createServer((req, res) => {
    log({ event: 'refuse', target: String(req.url).slice(0, 200), reason: `plain ${req.method}` })
    res.writeHead(403, { connection: 'close' })
    res.end()
  })

  server.on('connect', async (req, client, head) => {
    const target = String(req.url)
    client.on('error', () => {})
    const m = AUTHORITY_RE.exec(target)
    if (!m || !HOST_RE.test(m[1]) || net.isIP(m[1]))
      return refuse(client, target.slice(0, 200), 'malformed or bare IP')
    const [, name, portText] = m
    if (portText !== '443') return refuse(client, target, 'port')
    if (!allowed.has(name)) return refuse(client, target, 'not allowed')
    if (off.has(name)) return refuse(client, target, 'switched off')

    let dest
    try {
      dest = await resolveUpstream(name, 443)
    } catch (e) {
      return refuse(client, target, `resolve: ${e.code ?? e.message}`, 502)
    }
    const started = Date.now()
    const upstream = net.connect(dest.port, dest.host)
    const t = { name, target, client, upstream }
    let up = 0
    let down = 0
    upstream.once('connect', () => {
      if (off.has(name) || client.destroyed) {
        upstream.destroy()
        client.destroy()
        return
      }
      tunnels.add(t)
      log({ event: 'allow', target })
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head?.length) upstream.write(head)
      const touch = () => {
        client.setTimeout(idleMs)
      }
      client.setTimeout(idleMs, () => {
        log({ event: 'close', target, reason: 'idle' })
        client.destroy()
        upstream.destroy()
      })
      client.on('data', (d) => {
        up += d.length
        touch()
      })
      upstream.on('data', (d) => {
        down += d.length
        touch()
      })
      upstream.pipe(client)
      client.pipe(upstream)
    })
    upstream.on('error', (e) => {
      if (!tunnels.has(t)) refuse(client, target, `upstream: ${e.code}`, 502)
      client.destroy()
    })
    const done = () => {
      if (!tunnels.delete(t)) return
      upstream.destroy()
      client.destroy()
      log({ event: 'end', target, bytesUp: up, bytesDown: down, ms: Date.now() - started })
    }
    client.on('close', done)
    upstream.on('close', done)
  })

  const api = {
    port: 0,
    idleMs,
    setOff,
    close: () =>
      new Promise((r) => {
        clearInterval(poll)
        for (const t of tunnels) {
          t.client.destroy()
          t.upstream.destroy()
        }
        server.close(() => r())
        server.closeAllConnections?.()
      })
  }
  api.listening = new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      api.port = server.address().port
      log({ event: 'up', port: api.port, allow })
      resolve()
    })
  })
  return api
}

function argValue(args, name) {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}

/**
 * Command-line config; every value can come from a flag or from the environment (the stand's `qa-egress`
 * service uses only the environment): QA_EGRESS_LISTEN host:port · QA_EGRESS_ALLOW host,host ·
 * QA_EGRESS_DENY_FILE switch file · QA_EGRESS_LOG jsonl file. A flag wins over its variable.
 */
export function configFrom(args, env = process.env) {
  const listen = argValue(args, '--listen') ?? env.QA_EGRESS_LISTEN
  let host = '127.0.0.1'
  let port = argValue(args, '--port')
  if (listen) {
    const m = /^(.*):(\d+)$/.exec(listen)
    if (!m) throw new Error(`egress proxy: QA_EGRESS_LISTEN must be host:port, got ${JSON.stringify(listen)}`)
    host = m[1].replace(/^\[|\]$/g, '')
    port ??= m[2]
  }
  return {
    host,
    port: Number(port ?? 0),
    allow: (argValue(args, '--allow') ?? env.QA_EGRESS_ALLOW ?? '')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean),
    logFile: argValue(args, '--log') ?? env.QA_EGRESS_LOG ?? '/dev/stderr',
    offFile: argValue(args, '--off-file') ?? env.QA_EGRESS_DENY_FILE,
    idleMs: Number(argValue(args, '--idle-ms') ?? 120_000)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const config = configFrom(process.argv.slice(2))
  if (config.allow.length === 0)
    throw new Error('egress proxy: empty allow list (QA_EGRESS_ALLOW or --allow)')
  const proxy = createEgressProxy(config)
  await proxy.listening
  process.stdout.write(`egress-proxy listening ${config.host}:${proxy.port}\n`)
  const stop = () => proxy.close().then(() => process.exit(0))
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}
