// Talking to a running stand from outside: HTTP through the published port, the sign-in code from
// the console mail sink (the tracy-web container's log), and read-only SQL in the stand's own
// PostgreSQL. This is the independent-oracle side of the scenarios: state is read here, never taken
// from a door's own success message.

import { UsageError, exec, sleep } from './util.mjs'

const EMAIL = /^[a-z0-9._+-]{1,60}@example\.test$/i
const SQL_VALUE = /^[a-z0-9@._:/+-]{1,200}$/i

/**
 * @typedef {{ origin: string, siteDomain: string, containers: { web: string, host: string, postgres: string, dsh: string } }} StandInfo
 */

/** Read the QA_STAND_* environment other layers receive; null when nothing is set. */
export function standFromEnv(env = process.env) {
  if (!env.QA_STAND_URL) return null
  return {
    origin: env.QA_STAND_URL,
    siteDomain: env.QA_STAND_SITE_DOMAIN ?? 'localhost',
    containers: {
      web: env.QA_STAND_WEB_CONTAINER ?? 'tchqa-tracy-web-1',
      host: env.QA_STAND_HOST_CONTAINER ?? 'tchqa-tracy-host-1',
      postgres: env.QA_STAND_DB_CONTAINER ?? 'tchqa-postgres-1',
      dsh: env.QA_STAND_DSH_CONTAINER ?? 'tchqa-dsh'
    },
    project: env.QA_STAND_PROJECT ?? 'tchqa'
  }
}

/** Probe the stand: its sign-in page answers 200. Returns { ok, detail } — the ENV probe text. */
export async function probeStand(stand, { timeoutMs = 8000, fetchImpl = fetch } = {}) {
  if (!stand?.origin) return { ok: false, detail: 'QA_STAND_URL is not set' }
  try {
    const res = await fetchImpl(`${stand.origin}/login`, { signal: AbortSignal.timeout(timeoutMs) })
    return res.status === 200
      ? { ok: true, detail: `GET ${stand.origin}/login → 200` }
      : { ok: false, detail: `GET ${stand.origin}/login → ${res.status}` }
  } catch (error) {
    return { ok: false, detail: `GET ${stand.origin}/login failed: ${error.cause?.code ?? error.message}` }
  }
}

let ipCounter = 0
/**
 * A distinct client address per sign-in request. The stand has no proxy in front of it, so the
 * rate buckets key on `cf-connecting-ip` when it is sent; thirty codes an hour per address would
 * otherwise cap a whole QA run at thirty sign-ins. Test-stand transport only — the rate limiter is
 * not what these cases measure.
 */
export function freshClientIp() {
  ipCounter += 1
  const n = (Date.now() + ipCounter * 7919) % 16_000_000
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`
}

/** One HTTP call as one person. `cookie` is the `tracy_sess=…` pair, or null for nobody. */
export async function call(stand, cookie, method, pathname, body, { headers = {}, timeoutMs = 60_000 } = {}) {
  const res = await fetch(`${stand.origin}${pathname}`, {
    method,
    headers: {
      origin: stand.origin,
      accept: 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs)
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  const setCookies = res.headers.getSetCookie?.() ?? []
  const session = setCookies.map((l) => l.split(';')[0]).find((p) => p.startsWith('tracy_sess=')) ?? null
  return { status: res.status, json, text, setCookies, session, headers: res.headers }
}

/** The mail sink (the web container's log) cannot be read at all: a missing prerequisite, not a product fault. */
export class SinkUnreadable extends Error {
  constructor(message, probe) {
    super(message)
    this.name = 'SinkUnreadable'
    this.probe = probe
  }
}

/**
 * The newest sign-in code mailed to `email` since `sinceMs`, read from the web container's log
 * (the console transport prints `[mail] to=<email> subject="<six digits> …"`). Polls briefly.
 * @param {StandInfo} stand
 * @param {string} email
 * @param {{ sinceMs: number, timeoutMs?: number, docker?: typeof exec }} opts
 * @returns {Promise<string | null>} null when no code line appeared (the sink probe failed)
 */
export async function readCodeFromSink(stand, email, { sinceMs, timeoutMs = 15_000, run = exec }) {
  if (!EMAIL.test(email)) throw new UsageError(`"${email}" is not a QA test address`)
  const deadline = Date.now() + timeoutMs
  const since = new Date(sinceMs - 2000).toISOString()
  while (Date.now() < deadline) {
    const res = await run('docker', ['logs', '--since', since, stand.containers.web], { timeoutMs: 20_000 })
    if (res.code !== 0 || res.error)
      throw new SinkUnreadable(
        `the mail sink cannot be read: docker logs ${stand.containers.web} failed`,
        `docker logs --since ${since} ${stand.containers.web} → exit ${res.code}: ${(res.stderr || res.error || '').slice(0, 160)}`
      )
    const mine = `${res.stdout}\n${res.stderr}`
      .split('\n')
      .filter((line) => line.includes(`[mail] to=${email} `))
    const code = /subject="(\d{6})[ "]/.exec(mine.at(-1) ?? '')?.[1]
    if (code) return code
    await sleep(500)
  }
  return null
}

/**
 * Sign in as `email` through the real doors. Returns the cookie pair held in memory only.
 * @returns {Promise<{ cookie: string, login: any, verify: any }>}
 */
export async function signIn(stand, email, { run = exec } = {}) {
  const t0 = Date.now()
  const login = await call(
    stand,
    null,
    'POST',
    '/login',
    { email },
    { headers: { 'cf-connecting-ip': freshClientIp() } }
  )
  if (login.status !== 200) throw new Error(`POST /login answered ${login.status}`)
  const code = await readCodeFromSink(stand, email, { sinceMs: t0, run })
  if (!code) {
    // The door said 200 but no code for this address appeared. Whether that is the product or a
    // missing sink is decided by a probe: does the sink show ANY mail line at all?
    const any = await run('docker', ['logs', '--tail', '5000', stand.containers.web], { timeoutMs: 20_000 })
    if (any.code !== 0 || any.error)
      throw new SinkUnreadable(
        'the mail sink cannot be read',
        `docker logs ${stand.containers.web} → exit ${any.code}: ${(any.stderr || any.error || '').slice(0, 160)}`
      )
    if (!/\[mail\] to=/.test(`${any.stdout}\n${any.stderr}`))
      throw new SinkUnreadable(
        'the mail sink shows no mail line at all (no console mail transport)',
        `docker logs --tail 5000 ${stand.containers.web}: no "[mail] to=" line`
      )
    throw new Error(
      `no sign-in code for ${email} in the mail sink (${stand.containers.web} log); other mail lines exist, so the sink works and the door sent no code`
    )
  }
  const verify = await call(stand, null, 'POST', '/verify', { email, code })
  if (!verify.session) throw new Error(`POST /verify set no session cookie (HTTP ${verify.status})`)
  return { cookie: verify.session, login, verify }
}

/**
 * One read-only SELECT in the stand's PostgreSQL (`begin read only … rollback`). Values are psql
 * variables (`:'name'`), never spliced into the text.
 * @returns {Promise<string[][]>}
 */
export async function psql(stand, select, vars = {}, { run = exec } = {}) {
  const sql = select.trim()
  if (!/^(select|with)\s/i.test(sql)) throw new UsageError('psql: not a SELECT')
  if (sql.includes(';') || /\\/.test(sql))
    throw new UsageError('psql: more than one statement or a meta-command')
  const flags = []
  for (const [k, v] of Object.entries(vars)) {
    if (!/^[a-z_]{1,30}$/.test(k) || !SQL_VALUE.test(v)) throw new UsageError(`psql: bad variable ${k}`)
    flags.push('-v', `${k}=${v}`)
  }
  const res = await run(
    'docker',
    [
      'exec',
      '-i',
      stand.containers.postgres,
      'psql',
      '-U',
      'tracy',
      '-d',
      'tracy',
      '-At',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      ...flags
    ],
    { input: `begin read only;\n${sql};\nrollback;\n`, timeoutMs: 30_000 }
  )
  if (res.code !== 0) throw new Error(`psql failed: ${(res.stderr || res.error || '').trim().slice(0, 300)}`)
  return res.stdout
    .split('\n')
    .filter((l) => l && l !== 'BEGIN' && l !== 'ROLLBACK')
    .map((l) => l.split('|'))
}

/** The account id for an address, or null. */
export async function accountId(stand, email, opts) {
  const rows = await psql(
    stand,
    "select id from account where lower(email) = lower(:'e')",
    { e: email },
    opts
  )
  return rows[0]?.[0] ?? null
}

/** The seat row of an account on a site, as the book holds it. */
export async function seatRow(stand, siteKey, id, opts) {
  const rows = await psql(
    stand,
    "select role, accepted_at is not null, declined_at is not null, revoked_at is not null, requested_at is not null from seat where site_key = :'k' and account_id = :'a'",
    { k: siteKey, a: id },
    opts
  )
  if (!rows[0]) return null
  const [role, accepted, declined, revoked, requested] = rows[0]
  return {
    role,
    accepted: accepted === 't',
    declined: declined === 't',
    revoked: revoked === 't',
    requested: requested === 't'
  }
}

export const siteRowCount = async (stand, siteKey, opts) =>
  Number(
    (await psql(stand, "select count(*) from site where site_key = :'k'", { k: siteKey }, opts))[0]?.[0] ??
      '0'
  )

/**
 * Let this process's fetch reach `<label>.<siteDomain>` (a name getaddrinfo does not resolve on
 * macOS) by pointing every name under the stand's own site domain at loopback. Idempotent.
 */
export async function installLoopbackLookup(siteDomain, repo) {
  const { createRequire } = await import('node:module')
  const path = await import('node:path')
  const { Agent, setGlobalDispatcher } = createRequire(path.join(repo, 'package.json'))('undici')
  const mine = (host) => host === siteDomain || host.endsWith(`.${siteDomain}`)
  setGlobalDispatcher(
    new Agent({
      connect: {
        lookup(hostname, options, cb) {
          if (mine(hostname)) {
            if (options?.all) cb(null, [{ address: '127.0.0.1', family: 4 }])
            else cb(null, '127.0.0.1', 4)
            return
          }
          import('node:dns').then(({ lookup }) => lookup(hostname, options, cb))
        }
      }
    })
  )
}
