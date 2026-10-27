/**
 * The QA gate (plan §4.4): the only road lanes, the orchestrator and the owner take to the QA stand's
 * `tracy-web`. Node core only; requests are streamed, and a body is read (<= 64 KB) only at the
 * doors named below. Every refusal is JSON `{ code }`; nothing is let through "because unsure".
 *
 * Who calls:
 *   `x-qa-lane: <key>`   a lane; its sha256 must be `run.json` `laneKeyHashes[lane]` of a live run.
 *   `x-qa-admin: <key>`  the orchestrator; sha256 must be `run.json` `adminKeyHash` of a live run.
 *                        `x-qa-for-lane: <lane>` books a site it creates to that lane, uncapped.
 *   cookie `qa_human`    the owner; got at `/__qa/human?k=<code in state/human-pass>`.
 *   `x-qa-pr: <n>`       the PR a lane is working on (chat slots, the verify lane's reach).
 * All of these are consumed and dropped before forwarding (the site proxy copies unknown headers
 * down to the CMS). A lane key with no live run is refused; no credential at all is refused.
 *
 * Doors with a policy:
 *   POST /api/sites/claim, POST /api/sites  one transaction per (lane, buildId), journaled in
 *                                           `state/sites.jsonl`; caps on live sites and operations;
 *                                           capacity flag `state/capacity.json` { ok, at } <= 90 s
 *   DELETE /api/sites/<key>[/claim]         journaled
 *   any `/api/…import…` door, `origin: 'import'`  403 for lanes
 *   …/api/session/prompt, …/updateQueue     chat slots, journaled in `state/chat.jsonl`
 *   a site (Host, `/<siteKey>/`, `/api/sites/<siteKey>/`, `?site=`)  a lane reaches only its own
 *                                           sites; fixed sites: everything but deleting them
 *   POST /__qa/session {email[, forLane]}   mints `tracy_sess` inside the stand for a lane email
 *   GET  /__qa/otp?email=                   the last sign-in code from the stand's log
 *   POST /__qa/turn-ended {site}            (admin) a chat turn on `site` has ended
 *   GET  /__qa/human?k=                     sets the `qa_human` cookie
 * Every `Set-Cookie: tracy_sess=` that leaves the gate is appended to `r/<runId>/cookies.jsonl`.
 *
 * Exports:
 *   GATE_DEFAULTS
 *   laneEmailDomain(lane, emailDomain): string
 *   createGate(options): Gate
 *     options: { home, upstream: { host, port }, stand, mainHost?, siteDomain?, apiHost?, sitePrefix?,
 *                cookieDomain?, emailDomain?, fixedSites?, caps?, now? }
 * Gate:
 *   server: http.Server
 *   listen(port?, host?): Promise<{ port }>
 *   close(): Promise<void>
 *   reconcile(): Promise<{ resolved: object[], orphans: string[], failed: object[] }>
 *   start(port?, host?): Promise<{ port, reconciled }>   // reconcile, then listen
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import { connect } from 'node:net'
import { join } from 'node:path'
import { appendLine } from '../lib/journal.mjs'
import { readActiveRun, readJson, stateDir } from '../lib/state.mjs'
import { openChatBook, openSiteBook } from './book.mjs'
import {
  HUMAN_COOKIE,
  QA_HEADERS,
  SESSION_COOKIE,
  createDoor,
  deleteDoor,
  emailFromSessionToken,
  hostnameOf,
  isChatPath,
  isImportDoor,
  readCookie,
  siteOf,
  withoutCookie
} from './classify.mjs'

export const GATE_DEFAULTS = {
  mainHost: 'qa.tracy.test',
  siteDomain: 'qa.tracy.test',
  // The hostname of the stand's API_ORIGIN (stand/env.template); null = the stand has no API host.
  apiHost: 'api.qa.tracy.test',
  sitePrefix: 'qa-',
  cookieDomain: 'qa.tracy.test',
  emailDomain: 'qa.tracy.test',
  caps: {
    sitesLive: 4,
    siteOpsPerNight: 40,
    chatPerPr: 2,
    chatPerLane: { default: 50, verify: 18 },
    chatTurnMs: 4 * 60_000,
    chatCooldownMs: 90_000,
    capacityMaxAgeMs: 90_000,
    bodyMax: 64 * 1024
  }
}

const BUILD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+$/
const SESSION_MAX_AGE_S = 30 * 24 * 3600

export const laneEmailDomain = (lane, emailDomain) => `${lane}.${emailDomain}`

const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex')

function sameHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

class Refusal {
  constructor(status, code, extra = {}) {
    this.status = status
    this.body = { code, ...extra }
  }
}

function sendJson(res, status, body, headers = {}) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    ...headers
  })
  res.end(text)
}

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > max) {
        reject(new Refusal(413, 'QA_BODY_TOO_LARGE', { max }))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function parseJsonBody(buf) {
  try {
    const v = JSON.parse(buf.toString('utf8') || 'null')
    return v && typeof v === 'object' ? v : null
  } catch {
    return null
  }
}

export function createGate(options) {
  const cfg = {
    ...GATE_DEFAULTS,
    ...options,
    caps: {
      ...GATE_DEFAULTS.caps,
      ...options.caps,
      chatPerLane: { ...GATE_DEFAULTS.caps.chatPerLane, ...options.caps?.chatPerLane }
    }
  }
  const { home, upstream, stand } = cfg
  const now = cfg.now ?? Date.now
  const state = stateDir(home)
  const sites = openSiteBook(join(state, 'sites.jsonl'))
  const chat = openChatBook(join(state, 'chat.jsonl'))
  const inflight = new Set() // site intent ids being forwarded by this process

  const fixedSites = () => {
    const fromFile = readJson(join(state, 'fixed-sites.json'), [])
    // Entries may be a label (`qa-fixedwp`) or a site key; requests name the site key.
    const keyOf = (s) => {
      const l = s.toLowerCase()
      return l.includes('.') ? l : `${l}.${cfg.siteDomain}`
    }
    return new Set([...(cfg.fixedSites ?? []), ...(Array.isArray(fromFile) ? fromFile : [])].map(keyOf))
  }

  const humanToken = () => {
    const p = join(state, 'human-pass')
    if (!existsSync(p)) return null
    const pass = readFileSync(p, 'utf8').trim()
    return pass ? createHmac('sha256', pass).update('qa_human').digest('hex') : null
  }

  function cookieLog(runId, value, meta) {
    appendLine(join(home, 'r', runId ?? 'idle', 'cookies.jsonl'), {
      t: 'cookie',
      sha256: sha256(value),
      value,
      ...meta,
      at: new Date(now()).toISOString()
    })
  }

  function logSetCookies(setCookies, run, meta) {
    for (const sc of [setCookies ?? []].flat()) {
      const m = /^\s*tracy_sess=([^;]*)/.exec(sc)
      if (m?.[1]) cookieLog(run?.runId, m[1], meta)
    }
  }

  /** Who is calling. Throws a Refusal; never falls back to a weaker identity. */
  function identify(req, run) {
    const laneKey = req.headers['x-qa-lane']
    const adminKey = req.headers['x-qa-admin']
    if (laneKey !== undefined) {
      if (!run) throw new Refusal(403, 'QA_NO_RUN')
      const h = sha256(laneKey)
      const lane = Object.entries(run.laneKeyHashes ?? {}).find(([, v]) => sameHex(v, h))?.[0]
      if (!lane) throw new Refusal(403, 'QA_BAD_LANE_KEY')
      return { kind: 'lane', lane }
    }
    if (adminKey !== undefined) {
      if (!run) throw new Refusal(403, 'QA_NO_RUN')
      if (!sameHex(run.adminKeyHash, sha256(adminKey))) throw new Refusal(403, 'QA_BAD_ADMIN_KEY')
      return { kind: 'admin', lane: null }
    }
    const human = readCookie(req.headers.cookie, HUMAN_COOKIE)
    if (human !== null) {
      const want = humanToken()
      if (want && sameHex(want, human)) return { kind: 'human', lane: null }
      throw new Refusal(403, 'QA_BAD_HUMAN_COOKIE')
    }
    throw new Refusal(403, 'QA_WHO')
  }

  /** A lane reaches only its own sites; the verify lane also those of the PR it is checking. */
  function checkSite(req, who, run, path) {
    if (who.kind !== 'lane') return null
    const site = siteOf({
      hostname: hostnameOf(req.headers.host),
      path,
      mainHost: cfg.mainHost,
      siteDomain: cfg.siteDomain,
      apiHost: cfg.apiHost
    })
    if (!site) return null
    if (fixedSites().has(site)) {
      // Lanes work on the fixed sites (chat turns, writes, undo); only removing one is refused.
      if (req.method === 'DELETE' && /^\/api\/sites\/[^/]+\/?$/.test(path))
        throw new Refusal(403, 'QA_FIXED_SITE_READ_ONLY', { site })
      return site
    }
    const rec = sites.siteRecord(site, run.runId)
    if (rec && rec.lane === who.lane) return site
    const pr = req.headers['x-qa-pr']
    if (rec && who.lane === 'verify' && pr !== undefined && String(rec.pr) === String(pr)) return site
    throw new Refusal(403, 'QA_SITE_NOT_YOURS', { site })
  }

  function outgoingHeaders(req, bodyLength) {
    const headers = { ...req.headers }
    for (const h of QA_HEADERS) delete headers[h]
    const cookie = withoutCookie(req.headers.cookie, HUMAN_COOKIE)
    if (cookie) headers.cookie = cookie
    else delete headers.cookie
    if (bodyLength !== undefined) {
      delete headers['transfer-encoding']
      headers['content-length'] = String(bodyLength)
    }
    return headers
  }

  /**
   * Forward one request. `body` given = send those bytes; otherwise stream `req`. `buffer` = read
   * the answer before sending it on (to learn a siteKey). Resolves { status, body? }.
   */
  function forward(req, res, { path, body, buffer = false, run, who }) {
    return new Promise((resolve) => {
      const up = httpRequest(
        {
          host: upstream.host,
          port: upstream.port,
          method: req.method,
          path,
          headers: outgoingHeaders(req, body?.length)
        },
        (ur) => {
          logSetCookies(ur.headers['set-cookie'], run, {
            source: 'upstream',
            lane: who.lane ?? who.kind,
            path
          })
          if (!buffer) {
            res.writeHead(ur.statusCode, ur.rawHeaders)
            ur.pipe(res)
            ur.on('end', () => resolve({ status: ur.statusCode }))
            ur.on('error', () => resolve({ status: ur.statusCode }))
            return
          }
          const chunks = []
          ur.on('data', (c) => chunks.push(c))
          ur.on('end', () => {
            const buf = Buffer.concat(chunks)
            res.writeHead(ur.statusCode, ur.rawHeaders)
            res.end(buf)
            resolve({ status: ur.statusCode, body: buf })
          })
          ur.on('error', () => resolve({ status: ur.statusCode }))
        }
      )
      up.on('error', (err) => {
        if (!res.headersSent) sendJson(res, 502, { code: 'QA_UPSTREAM', message: err.message })
        else res.destroy()
        resolve({ status: 502, error: err.message })
      })
      if (body !== undefined) up.end(body)
      else req.pipe(up)
    })
  }

  // ── site creation: one transaction per (lane, buildId) ──────────────────────────────────────
  async function createSite(req, res, who, run, door, path) {
    const raw = await readBody(req, cfg.caps.bodyMax)
    const body = parseJsonBody(raw)
    if (!body) throw new Refusal(400, 'QA_BAD_BODY')
    if (who.kind === 'lane' && body.origin === 'import') throw new Refusal(403, 'QA_IMPORT_REFUSED')
    if (typeof body.buildId !== 'string' || !BUILD_ID.test(body.buildId))
      throw new Refusal(400, 'QA_BUILD_ID_REQUIRED')
    const label = typeof body.label === 'string' ? body.label.trim().toLowerCase() : ''
    if (!label) throw new Refusal(400, 'QA_LABEL_REQUIRED')
    const buildId = body.buildId.toLowerCase()
    const owner =
      who.kind === 'lane'
        ? who.lane
        : who.kind === 'admin'
          ? req.headers['x-qa-for-lane'] || 'admin'
          : 'human'
    const capped = who.kind === 'lane'
    const key = `create:${owner}:${buildId}`
    const runId = run?.runId ?? null
    // From here to `sites.intent` there is no `await`: the check and the reservation are one step.
    if (capped && !sites.hasTx(key, runId)) {
      const flag = readJson(join(state, 'capacity.json'), null)
      const at = typeof flag?.at === 'number' ? flag.at : Date.parse(flag?.at ?? '')
      if (!flag?.ok || !Number.isFinite(at) || now() - at > cfg.caps.capacityMaxAgeMs)
        throw new Refusal(429, 'QA_NO_CAPACITY')
      if (sites.createOps(owner, runId) >= cfg.caps.siteOpsPerNight) throw new Refusal(429, 'QA_SITE_OPS_CAP')
      if (sites.liveSites(owner, runId) >= cfg.caps.sitesLive) throw new Refusal(429, 'QA_SITES_LIVE_CAP')
    }
    const id = sites.intent({
      key,
      op: 'create',
      door,
      lane: owner,
      runId,
      buildId,
      label,
      siteKey: `${cfg.sitePrefix}${label}.${cfg.siteDomain}`,
      email: emailFromSessionToken(readCookie(req.headers.cookie, SESSION_COOKIE)),
      pr: req.headers['x-qa-pr'] ?? null,
      uncapped: !capped
    })
    inflight.add(id)
    try {
      const answer = await forward(req, res, { path, body: raw, buffer: true, run, who })
      const parsed = answer.body ? parseJsonBody(answer.body) : null
      const ok = answer.status >= 200 && answer.status < 300
      sites.result(id, {
        ok,
        status: answer.status,
        ...(typeof parsed?.siteKey === 'string' ? { siteKey: parsed.siteKey.toLowerCase() } : {}),
        ...(ok ? {} : { error: parsed?.code ?? answer.error ?? `HTTP_${answer.status}` })
      })
    } finally {
      inflight.delete(id)
    }
  }

  async function deleteSite(req, res, who, run, siteKey, path) {
    const id = sites.intent({
      key: `delete:${siteKey}`,
      op: 'delete',
      lane: who.lane ?? who.kind,
      runId: run?.runId ?? null,
      siteKey,
      email: emailFromSessionToken(readCookie(req.headers.cookie, SESSION_COOKIE))
    })
    inflight.add(id)
    try {
      const answer = await forward(req, res, { path, buffer: true, run, who })
      // 404 SITE_UNKNOWN: there is no site left to hold.
      sites.result(id, {
        ok: (answer.status >= 200 && answer.status < 300) || answer.status === 404,
        status: answer.status
      })
    } finally {
      inflight.delete(id)
    }
  }

  // ── chat slots ──────────────────────────────────────────────────────────────────────────────
  async function chatTurn(req, res, who, run, site, path) {
    if (!run) return forward(req, res, { path, run, who })
    if (who.kind === 'human') throw new Refusal(403, 'QA_CHAT_NEEDS_LANE')
    if (!site) throw new Refusal(403, 'QA_CHAT_NO_SITE')
    if (existsSync(join(state, 'chat-off.json'))) throw new Refusal(503, 'QA_CHAT_OFF')
    const lane = who.lane ?? 'admin'
    const pr = req.headers['x-qa-pr']
    if (who.kind === 'lane') {
      if (pr === undefined || !/^\d+$/.test(pr)) throw new Refusal(400, 'QA_PR_REQUIRED')
      if (chat.count({ runId: run.runId, lane, pr }) >= cfg.caps.chatPerPr)
        throw new Refusal(429, 'QA_CHAT_PR_CAP')
      const laneCap = cfg.caps.chatPerLane[lane] ?? cfg.caps.chatPerLane.default
      if (chat.count({ runId: run.runId, lane }) >= laneCap) throw new Refusal(429, 'QA_CHAT_LANE_CAP')
    }
    const last = chat.lastOnSite(site)
    if (last) {
      const turnEnd = last.ended ?? last.at + cfg.caps.chatTurnMs
      if (now() < turnEnd + cfg.caps.chatCooldownMs) throw new Refusal(429, 'QA_CHAT_SITE_BUSY', { site })
    }
    const door = /updatequeue$/i.test(path.split('?')[0]) ? 'updateQueue' : 'prompt'
    const id = chat.intent({ key: `chat:${site}`, lane, runId: run.runId, pr: pr ?? null, site, door })
    const answer = await forward(req, res, { path, run, who })
    chat.result(id, { status: answer.status, ...(answer.error ? { error: answer.error } : {}) })
  }

  // ── the gate's own doors ────────────────────────────────────────────────────────────────────
  function sessionCookieHeader(token) {
    const domain = cfg.cookieDomain ? ` Domain=${cfg.cookieDomain};` : ''
    return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax;${domain} Path=/; Max-Age=${SESSION_MAX_AGE_S}`
  }

  /** Which emails this caller may get a session or code for. */
  function emailAllowed(who, req, email, forLane) {
    if (!EMAIL.test(email)) throw new Refusal(400, 'QA_BAD_EMAIL')
    if (who.kind !== 'lane') return
    let target = who.lane
    if (forLane && forLane !== who.lane) {
      if (who.lane !== 'verify') throw new Refusal(403, 'QA_EMAIL_NOT_YOURS')
      if (!/^\d+$/.test(String(req.headers['x-qa-pr'] ?? ''))) throw new Refusal(400, 'QA_PR_REQUIRED')
      target = forLane
    }
    const domain = laneEmailDomain(target, cfg.emailDomain)
    if (!email.endsWith(`@${domain}`)) throw new Refusal(403, 'QA_EMAIL_NOT_YOURS', { domain })
  }

  async function qaDoor(req, res, who, run, url) {
    const p = url.pathname
    if (p === '/__qa/session' && req.method === 'POST') {
      const body = parseJsonBody(await readBody(req, cfg.caps.bodyMax))
      const email = String(body?.email ?? '')
        .trim()
        .toLowerCase()
      emailAllowed(who, req, email, body?.forLane)
      const token = await stand.mintSession(email)
      cookieLog(run?.runId, token, { source: 'gate', lane: who.lane ?? who.kind, path: p, email })
      return sendJson(res, 200, { email, token }, { 'set-cookie': sessionCookieHeader(token) })
    }
    if (p === '/__qa/otp' && req.method === 'GET') {
      const email = String(url.searchParams.get('email') ?? '')
        .trim()
        .toLowerCase()
      emailAllowed(who, req, email, url.searchParams.get('forLane'))
      const code = await stand.readOtp(email)
      if (!code) throw new Refusal(404, 'QA_NO_OTP')
      return sendJson(res, 200, { email, code })
    }
    if (p === '/__qa/turn-ended' && req.method === 'POST') {
      if (who.kind !== 'admin') throw new Refusal(403, 'QA_ADMIN_ONLY')
      const body = parseJsonBody(await readBody(req, cfg.caps.bodyMax))
      if (typeof body?.site !== 'string') throw new Refusal(400, 'QA_BAD_BODY')
      chat.ended(body.site.toLowerCase())
      return sendJson(res, 200, { ok: true })
    }
    if (p === '/__qa/health') return sendJson(res, 200, { ok: true, run: run?.runId ?? null })
    throw new Refusal(404, 'QA_NO_SUCH_DOOR')
  }

  function humanDoor(req, res, url) {
    const want = humanToken()
    const k = url.searchParams.get('k') ?? ''
    const p = join(state, 'human-pass')
    const pass = existsSync(p) ? readFileSync(p, 'utf8').trim() : ''
    if (!want || !pass || !sameHex(sha256(k), sha256(pass))) throw new Refusal(403, 'QA_BAD_HUMAN_PASS')
    const domain = cfg.cookieDomain ? ` Domain=${cfg.cookieDomain};` : ''
    res.writeHead(302, {
      location: '/',
      'set-cookie': `${HUMAN_COOKIE}=${want}; HttpOnly; SameSite=Lax;${domain} Path=/; Max-Age=${SESSION_MAX_AGE_S}`
    })
    res.end()
  }

  function hostAllowed(req) {
    const h = hostnameOf(req.headers.host)
    return h === cfg.mainHost || h.endsWith(`.${cfg.siteDomain}`)
  }

  async function handle(req, res) {
    const path = req.url || '/'
    const url = new URL(path, 'http://gate')
    if (!hostAllowed(req)) throw new Refusal(403, 'QA_UNKNOWN_HOST')
    if (url.pathname === '/__qa/human' && req.method === 'GET') return humanDoor(req, res, url)
    const run = readActiveRun(home, now())
    const who = identify(req, run)
    if (url.pathname.startsWith('/__qa/')) return qaDoor(req, res, who, run, url)
    const site = checkSite(req, who, run, path)
    if (who.kind === 'lane' && isImportDoor(req.method, path)) throw new Refusal(403, 'QA_IMPORT_REFUSED')
    const door = createDoor(req.method, path)
    if (door) return createSite(req, res, who, run, door, path)
    const doomed = deleteDoor(req.method, path)
    if (doomed) return deleteSite(req, res, who, run, doomed, path)
    if (req.method === 'POST' && isChatPath(path)) return chatTurn(req, res, who, run, site, path)
    return forward(req, res, { path, run, who })
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (err instanceof Refusal) {
        if (!res.headersSent) sendJson(res, err.status, err.body)
        // A refused request body is drained so the client sees the answer, not a reset.
        req.resume()
        return
      }
      if (!res.headersSent)
        sendJson(res, 500, { code: 'QA_GATE_ERROR', message: String(err?.message ?? err) })
      else res.destroy()
    })
  })

  // ── WebSocket: same identity and site rules, then a raw byte pipe ───────────────────────────
  server.on('upgrade', (req, socket, head) => {
    const refuse = (status, body) => {
      const text = JSON.stringify(body)
      socket.end(
        `HTTP/1.1 ${status} Refused\r\ncontent-type: application/json\r\ncontent-length: ${Buffer.byteLength(text)}\r\nconnection: close\r\n\r\n${text}`
      )
    }
    try {
      if (!hostAllowed(req)) throw new Refusal(403, 'QA_UNKNOWN_HOST')
      const run = readActiveRun(home, now())
      const who = identify(req, run)
      checkSite(req, who, run, req.url || '/')
    } catch (err) {
      if (err instanceof Refusal) return refuse(err.status, err.body)
      return refuse(500, { code: 'QA_GATE_ERROR' })
    }
    const up = connect(upstream.port, upstream.host, () => {
      const headers = outgoingHeaders(req)
      let head0 = `${req.method} ${req.url} HTTP/1.1\r\n`
      for (const [k, v] of Object.entries(headers)) for (const one of [v].flat()) head0 += `${k}: ${one}\r\n`
      up.write(`${head0}\r\n`)
      if (head?.length) up.write(head)
      up.pipe(socket)
      socket.pipe(up)
    })
    up.on('error', () => socket.destroy())
    socket.on('error', () => up.destroy())
  })

  async function reconcile() {
    const resolved = []
    const failed = []
    const orphans = []
    const lists = new Map()
    const listFor = async (email) => {
      if (!lists.has(email)) lists.set(email, await stand.listSites(email))
      return lists.get(email)
    }
    for (const it of sites.unknown()) {
      if (inflight.has(it.id)) continue
      if (!it.email) {
        // No session cookie: the stand's door refuses before it creates or deletes anything.
        sites.result(it.id, { ok: false, error: 'NO_SESSION', reconciled: true })
        resolved.push({ id: it.id, ok: false })
        continue
      }
      try {
        const list = await listFor(it.email)
        const present = list.includes(it.siteKey)
        const ok = it.op === 'create' ? present : !present
        sites.result(it.id, {
          ok,
          ...(it.op === 'create' && present ? { siteKey: it.siteKey } : {}),
          ...(ok ? {} : { error: it.op === 'create' ? 'NOT_FOUND' : 'STILL_THERE' }),
          reconciled: true
        })
        resolved.push({ id: it.id, ok })
      } catch (err) {
        failed.push({ id: it.id, error: String(err?.message ?? err) })
      }
    }
    const emails = new Set(
      sites
        .lines()
        .filter((l) => l.t === 'intent' && l.email)
        .map((l) => l.email)
    )
    const known = sites.knownSiteKeys()
    const fixed = fixedSites()
    const run = readActiveRun(home, now())
    for (const email of emails) {
      let list
      try {
        list = await listFor(email)
      } catch (err) {
        failed.push({ email, error: String(err?.message ?? err) })
        continue
      }
      for (const siteKey of list) {
        if (known.has(siteKey) || fixed.has(siteKey)) continue
        sites.orphan(siteKey, run?.runId ?? null)
        known.add(siteKey)
        orphans.push(siteKey)
      }
    }
    return { resolved, orphans, failed }
  }

  return {
    server,
    reconcile,
    listen(port = 0, host = '127.0.0.1') {
      return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, host, () => resolve({ port: server.address().port }))
      })
    },
    async start(port = 0, host = '127.0.0.1') {
      const reconciled = await reconcile()
      const { port: p } = await this.listen(port, host)
      return { port: p, reconciled }
    },
    close() {
      return new Promise((resolve) => {
        server.closeAllConnections?.()
        server.close(() => resolve())
      })
    }
  }
}
