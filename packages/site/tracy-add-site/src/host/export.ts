/**
 * Pull the content of a live site — database and webroot — into storage.
 *
 * ONE file for BOTH platforms, and that comes from reading the source rather than merging for
 * tidiness: Claude Cowork ships the same engine in two shells, so `db.tables`, `db.dump` and `files.pack`
 * take **the same parameters** and return **the same shape** on Joomla and WordPress. The only difference is
 * the endpoint address — `index.php?option=com_claudecowork&…` for Joomla,
 * `wp-admin/admin-ajax.php?action=claude_cowork` for WordPress — so it is a parameter, not
 * a second copy of the whole file. In `tracy-desk` the two lived apart (`exportViaPlugin.ts` and
 * `exportDatabase.ts`), and they had drifted in their retry handling.
 *
 * 🔒 WEBROOT BYTES DO NOT PASS THROUGH THIS MACHINE, and that is the most surprising thing in the source:
 * the component on the site takes a signed URL and **PUTs straight to storage itself**, returning the ETag and the
 * next cursor. This side only signs URLs, keeps the cursor, and counts. A 264 MB webroot goes from the customer's
 * server to R2 without touching a single byte of dsh.
 *
 * The database is the opposite: it comes here (base64, chunk by chunk), is joined and compressed, then pushed up. A dump
 * is orders of magnitude smaller — measured in desk: 15.9 MB of SQL became 2.2 MB after gzip.
 *
 * Copied from `tracy-desk` (`exportViaPlugin.ts`, `exportFilesViaPlugin.ts`). Dropped: writing to disk
 * (`deliverables/` — TCH has no site folder on the customer's machine). Retry and resume are
 * KEPT, because they are why an import survives: see `retry.ts` and `resume.ts`.
 */

import { createGzip } from 'node:zlib'

import type { SiteArtifacts } from './artifacts.js'
import { DIAGNOSTIC_ACTIONS, DIAGNOSTIC_ENGINE_ERRORS, diagnosticError } from './diagnostic.mjs'
import { answerKind, engineReply, isPhpParseFailure, pageKind } from './doors.mjs'
import { failureCode } from './error-code.mjs'
import { firewallOf, gatewayOf, USER_AGENT } from './firewall.mjs'
import type { Diagnostic } from './joomla.js'
import { forgetUpload, heldUpload, rememberUpload, staleUpload } from './resume.js'
import { relayedTransportError, withPartRetry, withRetry } from './retry.js'
import { BlockedByHost, retryAfterMs, SiteLink } from './site-link.js'

const REQUEST_TIMEOUT_MS = 120_000

/**
 * `Engine::MAX_DB_LIMIT` of the component (it clamps `limit` to 1..5000). Asking for the most it
 * allows is the fewest calls a table costs — and the number of calls, not their size, is what a
 * host's rate rule counts. A site that cannot hold this many rows answers 5xx and gets halved.
 */
const DB_CHUNK_LIMIT = 5000

/**
 * The smallest `db.dump` page a struggling site is asked for. Halving stops here: below it the
 * number of calls, not their size, becomes the load.
 */
const MIN_DB_CHUNK_LIMIT = 50

/**
 * Each `files.pack` call gathers this much tar. Above the 5 MiB floor S3 requires for any part but the
 * last, and small enough for one PHP request on shared hosting to finish before it times out.
 */
const TARGET_PART_BYTES = 8 * 1024 * 1024

/**
 * The slowest uplink a part is given time for once it travels in the answer: 16 KiB/s, under the
 * 38 KB/s QA measured on a customer's shared host (#1566, 21/10/2026).
 */
const SLOW_UPLINK_BYTES_PER_S = 16 * 1024

/**
 * How long this side waits for one `files.pack` answer.
 *
 * On the PUT road the component sends the part to the store itself under its own 120 s cURL limit
 * and then answers: this side waits a minute past that, so the component's own answer (its part,
 * or its relayed failure) arrives instead of an abort that cannot tell the two apart. Inline, the
 * part comes back in the answer, base64 (4/3 of its size), and no limit of the component's applies:
 * the wait is what that many bytes need at a slow uplink, plus the usual two minutes.
 */
export function packTimeoutMs(inline: boolean, targetBytes: number): number {
  if (!inline) return REQUEST_TIMEOUT_MS + 60_000
  return REQUEST_TIMEOUT_MS + Math.ceil(((targetBytes * 4) / 3 / SLOW_UPLINK_BYTES_PER_S) * 1000)
}

/**
 * A cap so a cursor bug cannot bill storage forever. Set at S3 multipart's own ceiling —
 * a runaway cursor caught at 10,000 is as good as at 500.
 */
const MAX_PARTS = 10_000

export type ExportRefusal =
  | 'call_failed'
  | 'store_refused'
  | 'too_many_parts'
  | 'blocked_by_firewall'
  | 'site_resource_limit'
  | 'site_offline'
  | 'php_too_old'
  | 'blocked_by_host'
  | 'files_unreadable'

export interface DbExportResult {
  key: string
  tables: number
  bytes: number
}

export interface FilesExportResult {
  key: string
  files: number
  bytes: number
  parts: number
  /** What the site's engine left out because its PHP could not read it, when it named any. */
  unreadable?: Unreadable
}

export class ExportFailed extends Error {
  /**
   * On `files_unreadable`: the folder or file the site's engine could not read, as it named it —
   * the customer's own server path, shown to them so they know what to give read access to; never
   * in the stuck signal (`diagnostic.mjs` keeps closed sets only).
   */
  folder?: string
  /**
   * @param detail What the operator log needs beyond the reason — the firewall's name, or on
   *   `blocked_by_host` the connection error (`ECONNREFUSED`…).
   */
  constructor(
    readonly reason: ExportRefusal,
    readonly detail?: string,
    /** Where it stopped, from closed sets only (`diagnostic.mjs`): what the stuck signal keeps. */
    readonly diagnostic?: Diagnostic
  ) {
    super(detail ? `The export stopped: ${reason} (${detail})` : `The export stopped: ${reason}`)
    this.name = 'ExportFailed'
  }
}

/**
 * Errors that are the SITE answering 429/5xx to an engine call — its PHP out of time, memory or
 * workers — as opposed to the store's 5xx the engine relays. Both retry; only these, once the
 * retries run out, are `site_resource_limit`.
 */
const siteOverloads = new WeakSet<Error>()

const isSiteOverload = (error: unknown): boolean => error instanceof Error && siteOverloads.has(error)

/**
 * Errors that are the SITE no longer answering at all: Cloudflare's own page saying the origin
 * behind it is down (`gatewayOf` — a host's own proxy 502 is not one), or the connection to it
 * refused, reset or closed. Retried like the rest; once the retries run out they are `site_offline`, not
 * `site_resource_limit` — a web server that is off needs no higher PHP limit (#1616).
 */
const siteOffline = new WeakMap<Error, string>()

/**
 * Connection failures that say the site is gone rather than slow. Read only here: the ban check
 * (`site-link.ts`) sees the same codes first, and a run that answered stops on it as `blocked_by_host`
 * before the ladder runs out; what reaches the end of the ladder is a site that never answered this
 * run, or a socket the site closed on every attempt.
 */
const OFFLINE_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'UND_ERR_SOCKET', 'EHOSTUNREACH', 'ENETUNREACH'])

/**
 * Errors that are a part running out of time on the way to the store: this side's own wait ending,
 * or the component relaying an upload that failed with no HTTP answer (its cURL limit, a reset
 * connection). Asking the same size by the same road again fails the same way on a slow uplink
 * (#1566), so these step the part down (`exportFiles`).
 */
const slowParts = new WeakSet<Error>()

/** This side stopping its own wait, as opposed to the component saying its upload failed. */
const isOwnTimeout = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')

const isSlowPart = (error: unknown): boolean =>
  isOwnTimeout(error) || (error instanceof Error && slowParts.has(error))

/**
 * A retried step whose last failure was the site running out of room becomes `site_resource_limit`.
 *
 * Before, the exhausted relayed error left the run as `unexpected` — "something went wrong" for a
 * site that was answering 500 to every page of its own database, which is the one case the
 * customer (or their host) can act on: raise PHP's memory or time limit, or install by hand.
 */
async function overloadAware<T>(step: Promise<T>): Promise<T> {
  try {
    return await step
  } catch (error) {
    if (isSiteOverload(error)) throw new ExportFailed('site_resource_limit')
    const offline = error instanceof Error ? siteOffline.get(error) : undefined
    if (offline) throw new ExportFailed('site_offline', offline)
    throw error
  }
}

interface DbDumpChunk {
  ok: true
  sql_b64: string
  /** Only a site running the KEY-paginated component returns this field. */
  next_cursor?: string | null
  /** A site still paginating by position returns this field. */
  next_offset?: number
  done: boolean
  rows: number
  total: number
}

interface PackResponse {
  ok: true
  etag: string
  /** The part itself, base64, when asked for `inline` (claude-cowork 0.8.22+). */
  part_b64?: string | null
  files: number
  bytes: number
  next_path: string
  next_offset: number
  next_size?: number
  done: boolean
  /** What the walk left out because the site's PHP could not read it (claude-cowork #unreadable). */
  unreadable?: Unreadable
}

/** Folders (ending in `/`) and files a site's engine left out of its walk, unreadable to its PHP. */
export interface Unreadable {
  paths: string[]
  count: number
}

/** The engine's `unreadable`, kept only in its own shape: at most 50 webroot-relative paths. */
export function unreadableOf(value: unknown): Unreadable | undefined {
  if (!value || typeof value !== 'object') return undefined
  const { paths, count } = value as { paths?: unknown; count?: unknown }
  if (!Array.isArray(paths) || !Number.isSafeInteger(count) || Number(count) < 1) return undefined
  const kept = paths
    .filter((path): path is string => typeof path === 'string' && path !== '' && path.length <= 300)
    .filter(
      (path) =>
        !path.startsWith('/') &&
        !path.includes('\\') &&
        !path.split('/').includes('..') &&
        !Array.from(path).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
    )
    .slice(0, 50)
  return { paths: kept, count: Math.max(Number(count), kept.length) }
}

/**
 * The folder or file an older engine stopped the whole walk on, from its refusal: "RecursiveDirectory
 * Iterator::__construct(<path>): Failed to open directory: Permission denied" (a folder), or
 * "cannot open <path>" (a file). `undefined` when the refusal is not about reading permission.
 */
export function unreadableRefusal(message: unknown): string | undefined {
  const text = typeof message === 'string' ? message : ''
  const folder = /__construct\(([^)]{1,300})\):\s*Failed to open dir(?:ectory)?:\s*Permission denied/i.exec(
    text
  )
  if (folder) return folder[1].trim()
  // The pack's own `read_failed`: "cannot open <path>", the file fopen refused.
  const file = /^cannot open (.{1,300}?)[\s:.]*$/i.exec(text.trim())
  if (file) return file[1]
  if (/permission denied/i.test(text)) {
    const named = /\(([^)]{1,300})\)/.exec(text)
    if (named) return named[1].trim()
  }
  return undefined
}

/** The links whose site's engine answered in this run (`callPlugin`): a page after that is a block. */
const engineHeard = new WeakSet<SiteLink>()

/** ETag as the store said it, without the quotes a PUT response wraps it in. */
const etagOf = (response: Response): string => (response.headers.get('etag') ?? '').replace(/^"|"$/g, '')

/** What every call to the site carries besides its body. */
export interface SiteCallOptions {
  /** The site's HTTP Basic credential. */
  headers?: Record<string, string>
  /**
   * The run's link to the site — pacing and the ban check (`site-link.ts`). One for the whole run,
   * so the database and the files share it; without one, each export makes its own.
   */
  link?: SiteLink
  /** Advertised by `info` on engines that support the multi-table dump action. */
  dbDumpMany?: { max_tables?: number }
  platform?: 'joomla' | 'wordpress'
}

interface SiteCall {
  headers: Record<string, string>
  link: SiteLink
}

/** Refuse malformed engine data before it can be stored as a successful database copy. */
function invalidExport(action: string, check: string): ExportFailed {
  return new ExportFailed('call_failed', `${action}: ${check}`, { at: 'export', check, action })
}

function validSql(action: string, value: unknown): Buffer {
  if (typeof value !== 'string' || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value))
    throw invalidExport(action, 'invalid_payload')
  const sql = Buffer.from(value, 'base64')
  if (sql.toString('base64') !== value) throw invalidExport(action, 'invalid_payload')
  // Scan bytes without decoding binary literals. A page must end outside quotes/comments,
  // at a statement boundary; this detects truncation, not arbitrary SQL syntax errors.
  let quote = 0
  let comment = 0
  let last = 0
  for (let i = 0; i < sql.length; i++) {
    const byte = sql[i]
    if (comment === 1) {
      if (byte === 10) comment = 0
      continue
    }
    if (comment === 2) {
      if (byte === 42 && sql[i + 1] === 47) {
        comment = 0
        i++
      }
      continue
    }
    if (quote) {
      if (byte === 92 && quote !== 96) {
        i++
        continue
      }
      if (byte === quote) {
        if (sql[i + 1] === quote) i++
        else quote = 0
      }
      continue
    }
    if (byte === 45 && sql[i + 1] === 45 && (sql[i + 2] ?? 32) <= 32) {
      comment = 1
      i++
      continue
    }
    if (byte === 35) {
      comment = 1
      continue
    }
    if (byte === 47 && sql[i + 1] === 42) {
      comment = 2
      i++
      continue
    }
    if (byte > 32) last = byte
    if (byte === 39 || byte === 34 || byte === 96) quote = byte
  }
  if (quote || comment === 2 || (last !== 0 && last !== 59)) throw invalidExport(action, 'invalid_payload')
  return sql
}

function validateDump(action: string, reply: Record<string, unknown>): void {
  if (typeof reply.done !== 'boolean') throw invalidExport(action, 'invalid_reply')
  validSql(action, reply.sql_b64)
  if (
    action === 'db.dump_many' &&
    reply.progress !== undefined &&
    (!Array.isArray(reply.progress) ||
      reply.progress.some(
        (item) =>
          !item ||
          typeof item !== 'object' ||
          typeof item.done !== 'boolean' ||
          typeof item.table !== 'string' ||
          !Number.isSafeInteger(item.rows) ||
          item.rows < 0 ||
          !Number.isSafeInteger(item.total) ||
          item.total < 0
      ))
  )
    throw invalidExport(action, 'invalid_reply')
  if (
    action === 'db.dump' &&
    (!Number.isSafeInteger(reply.rows) ||
      Number(reply.rows) < 0 ||
      !Number.isSafeInteger(reply.total) ||
      Number(reply.total) < 0 ||
      (reply.next_cursor !== undefined &&
        reply.next_cursor !== null &&
        typeof reply.next_cursor !== 'string') ||
      (reply.next_offset !== undefined &&
        (!Number.isSafeInteger(reply.next_offset) || Number(reply.next_offset) < 0)))
  )
    throw invalidExport(action, 'invalid_reply')
}

/** Follow only same-origin redirects; POST tokens never ride a redirect to another origin. */
async function engineFetch(endpoint: string, action: string, init: RequestInit): Promise<Response> {
  const anchor = new URL(endpoint).origin
  let url = endpoint
  let request = init
  for (let hop = 0; hop <= 5; hop++) {
    const response = await fetch(url, { ...request, redirect: 'manual' })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const location = response.headers.get('location')
    const next = location ? new URL(location, url) : null
    await response.body?.cancel()
    if (!next || next.origin !== anchor || next.username || next.password || hop === 5)
      throw invalidExport(action, 'untrusted_target')
    if ([301, 302, 303].includes(response.status)) request = { ...request, method: 'GET', body: undefined }
    url = next.href
  }
  throw invalidExport(action, 'untrusted_target')
}

/**
 * One component call. Each call is a bounded chunk, named by an explicit cursor.
 * @param site `headers` are sent on the call — a site behind HTTP Basic on /administrator answers
 *   the administrator door 401 without it; `link` paces the call and watches for a ban.
 */
async function callPlugin(
  endpoint: string,
  token: string,
  action: string,
  params: Record<string, unknown>,
  site: SiteCall,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Record<string, unknown>> {
  await site.link.ready()
  let response: Response
  try {
    response = await engineFetch(endpoint, action, {
      method: 'POST',
      // The same user agent the sign-in used: bot rules on shared hosting that let the login through
      // blocked the runtime's default `node` on the first engine call (measured 2026-10-19).
      headers: { ...site.headers, 'content-type': 'application/json', 'user-agent': USER_AGENT },
      body: JSON.stringify({ token, action, params }),
      signal: AbortSignal.timeout(timeoutMs)
    })
  } catch (error) {
    try {
      site.link.failed(error)
    } catch (ban) {
      // Not retried: every further knock on a banned IP is one more reason for the host to keep it.
      if (ban instanceof BlockedByHost) throw new ExportFailed('blocked_by_host', ban.code)
      throw ban
    }
    const code = failureCode(error, (candidate: string) => OFFLINE_CODES.has(candidate))
    if (error instanceof Error && code) siteOffline.set(error, code)
    throw error
  }
  site.link.answeredWith(
    response.status === 429 || response.status === 503
      ? retryAfterMs(response.headers.get('retry-after'))
      : undefined
  )
  // Text first, then shape: a parked domain answers this URL with 405 and an empty body, a gate
  // with HTML, a proxy with its own error page. `response.json()` on those threw a SyntaxError
  // that reached the wizard as "Something went wrong" with no cause (joomlar.com, 2026-09-06).
  let text: string
  try {
    text = await response.text()
  } catch (error) {
    // The site sent its headers and then closed or reset the socket mid-body: the same site gone as
    // a refused connection, and retried the same way. Not counted by the ban check — a host refusing
    // this IP never sends headers first.
    const code = failureCode(error, (candidate: string) => OFFLINE_CODES.has(candidate))
    if (error instanceof Error && code) siteOffline.set(error, code)
    throw error
  }
  const result = engineReply(text)
  if (result === null) {
    // A parse error is the site's PHP, not the road: asking again cannot change it.
    if (isPhpParseFailure(response.status, text)) throw new ExportFailed('php_too_old')
    // An engine call is JSON in and JSON out, so a 403/406 page here is never the engine's own.
    const firewall = firewallOf(response.status, response.headers, text, { generic: true })
    if (firewall) throw new ExportFailed('blocked_by_firewall', firewall)
    const detail = `${action} answered ${response.status} without an engine reply: ${text.slice(0, 120)}`
    // A 429 or 5xx is retried like a relayed upload failure, and marked as the site's own so an
    // exhausted retry can say so.
    if (response.status === 429 || response.status >= 500) {
      const error = relayedTransportError(detail)
      const gateway = gatewayOf(response.status, response.headers, text)
      if (gateway) siteOffline.set(error, `${gateway} ${response.status}`)
      else siteOverloads.add(error)
      throw error
    }
    // A page where the engine answered earlier in this run: something in front of the site blocks
    // Tracy now — a host's bot protection after the import's burst of calls, a security plugin —
    // never the engine's own answer, and asking again within minutes meets the same page. Said as
    // the host's block, not "the site stopped answering, try again" (05/11/2026).
    if (response.status === 200 && engineHeard.has(site.link)) {
      const answer = answerKind(text)
      const page = answer === 'html' ? pageKind(text) : undefined
      if (answer === 'html' && page !== 'login_form')
        throw new ExportFailed(
          'blocked_by_host',
          `${action} answered a page: ${text.replace(/\s+/g, ' ').trim().slice(0, 160)}`,
          {
            at: 'export',
            check: 'answered_page',
            status: response.status,
            ...(DIAGNOSTIC_ACTIONS.has(action) ? { action } : {}),
            answer,
            ...(page ? { page } : {})
          }
        )
    }
    // 🔒 SAID, NOT SWALLOWED (beta report, 28/10/2026). Two customers left after `call_failed` here
    // with nothing kept: the detail was built and dropped, and the container log was gone when the
    // runs were looked at. The stuck signal now keeps which call, the status and what came back
    // instead — as a fixed kind, never the body; the body's head goes to the operator log only.
    throw new ExportFailed('call_failed', detail, {
      at: 'export',
      check: 'no_engine_reply',
      status: response.status,
      ...(DIAGNOSTIC_ACTIONS.has(action) ? { action } : {}),
      answer: answerKind(text),
      ...(answerKind(text) === 'html' && pageKind(text) === 'login_form' ? { page: 'login_form' } : {})
    })
  }
  engineHeard.add(site.link)
  if (!result.ok) {
    // 🔒 THE ENGINE PUTS TO STORAGE ITSELF, then reports storage's 502 as ITS OWN `ok:false`.
    // Read as an answer, the retry would never run — exactly where `tracy-desk` needed a patch
    // after losing work to a 502. A 429 or 5xx is a transport incident it is relaying;
    // anything else is its answer, and asking again will not change it.
    const detail = `${action} failed: ${JSON.stringify(result).slice(0, 200)}`
    if (result.error === 'upload_failed') {
      const status = Number(/HTTP (\d{3})/.exec(String(result.message ?? ''))?.[1])
      if (status === 429 || (status >= 500 && status <= 599)) throw relayedTransportError(detail)
      // No HTTP answer at all: the upload never finished — the component's own 120 s cURL limit on
      // a slow uplink (#1566), or a connection that broke. Retried, and the part is stepped down.
      if (!Number.isFinite(status) || status === 0) {
        const error = relayedTransportError(detail)
        slowParts.add(error)
        throw error
      }
    }
    const code =
      typeof result.error === 'string' && DIAGNOSTIC_ENGINE_ERRORS.has(result.error) ? result.error : 'other'
    // An older engine stops the whole walk at one folder or file its PHP may not read — a host's
    // `certificates/thumbs` stopped eleven imports of one site, each told "the site stopped
    // answering, try again" (05/11/2026). Said as what it is, with the path to give read access to;
    // asking again cannot change it. Newer engines leave such a path out and name it (`unreadable`).
    const folder = unreadableRefusal(result.message)
    if (folder) {
      const failed = new ExportFailed('files_unreadable', detail, {
        at: 'export',
        check: 'permission_denied',
        status: response.status,
        ...(DIAGNOSTIC_ACTIONS.has(action) ? { action } : {}),
        engine_error: code
      })
      failed.folder = folder
      throw failed
    }
    throw new ExportFailed('call_failed', detail, {
      at: 'export',
      check: 'engine_refused',
      status: response.status,
      ...(DIAGNOSTIC_ACTIONS.has(action) ? { action } : {}),
      engine_error: code
    })
  }
  if (action === 'db.dump' || action === 'db.dump_many') validateDump(action, result)
  return result
}

const siteCall = (options: SiteCallOptions): SiteCall => ({
  headers: options.headers ?? {},
  link: options.link ?? new SiteLink()
})

/**
 * Columns a Joomla site moves on its own, left out of each table's checksum, and the page rule of
 * the file walk: the SAME as `live-pull.mjs` (SKIP_COLUMNS, `abilities`), kept in step by hand — a
 * fingerprint taken here is compared there, and two taken differently never match.
 */
const SKIP_COLUMNS = [
  'hits',
  'checked_out',
  'checked_out_time',
  'lastvisitDate',
  'lastResetTime',
  'resetCount',
  'last_execution',
  'next_execution',
  'times_executed',
  'times_failed',
  'last_exit_code',
  'locked',
  'last_check_timestamp'
]

/** What `takeFingerprint` answers: `live-pull.mjs` `fingerprintNow`'s shape. */
export interface LiveFingerprint {
  version: 1
  pageSize: number
  skip: string[]
  files: { count: number; bytes: number; pages: string[] }
  tables: Record<string, string | null> | null
}

/**
 * The live site's fingerprint (claude-cowork 0.24.51 `site.fingerprint`, version 2), taken right
 * BEFORE the import reads it: the first Sync from live compares the site with it and answers "nothing
 * changed" in seconds, where it read the whole site again (measured on dev, 22/10/2026). Undefined
 * for an older engine, or when the site does not answer it — the import never waits on it or fails.
 */
export async function takeFingerprint(
  endpoint: string,
  token: string,
  options: SiteCallOptions = {}
): Promise<LiveFingerprint | undefined> {
  const site = siteCall(options)
  try {
    const { info } = (await callPlugin(endpoint, token, 'info', {}, site)) as {
      info?: { site_fingerprint?: { version?: unknown; max_files?: unknown } }
    }
    const advertised = info?.site_fingerprint
    if (!(Number(advertised?.version) >= 2)) return undefined
    const pageSize = Math.max(1000, Math.min(50_000, Math.floor(Number(advertised?.max_files) || 20_000)))
    const pages: string[] = []
    let count = 0
    let bytes = 0
    let tables: LiveFingerprint['tables'] = null
    let after = ''
    for (let page = 0; page < 1000; page++) {
      const { fingerprint } = (await withRetry(() =>
        callPlugin(
          endpoint,
          token,
          'site.fingerprint',
          {
            after,
            limit: pageSize,
            checksums: page === 0,
            ...(page === 0 ? { skip_columns: SKIP_COLUMNS } : {})
          },
          site
        )
      )) as {
        fingerprint?: {
          files?: { count?: number; bytes?: number; digest?: string; next_after?: string | null } | null
          tables?: Record<string, string | null> | null
        }
      }
      if (page === 0) tables = fingerprint?.tables ?? null
      const files = fingerprint?.files
      if (!files || typeof files.digest !== 'string') break
      pages.push(files.digest)
      count += files.count ?? 0
      bytes += files.bytes ?? 0
      if (!files.next_after) break
      after = files.next_after
    }
    return { version: 1, pageSize, skip: SKIP_COLUMNS, files: { count, bytes, pages }, tables }
  } catch {
    return undefined
  }
}

/**
 * The site's whole database, through the component, then into storage.
 *
 * 🔒 TWO KINDS OF CURSOR, and picking the wrong one is the only way to hang. A site running the
 * **key**-paginated component takes `cursor` and returns `next_cursor`: the cursor names the last row sent, so a write
 * to the table during the read cannot shift what was already returned. An old-generation site ignores `cursor` and returns
 * `next_offset` — a position, so an insert behind it sends one row twice (the import dies
 * with `ERROR 1062`) and a delete silently loses one row.
 *
 * Which kind applies must follow the ANSWER, not a version number: `next_cursor` present means the site
 * understands. Doing it the other way really hangs — an old site does not read `cursor`, so its offset is 0 on every call,
 * and a loop that keeps sending `cursor` dumps the first two thousand rows forever.
 */
export async function exportDatabase(
  endpoint: string,
  token: string,
  artifacts: SiteArtifacts,
  onTable?: (progress: { tables: number; table: string; rows: number; done: number }) => void,
  options: SiteCallOptions = {}
): Promise<DbExportResult> {
  const site = siteCall(options)
  // Each call is a bounded chunk named by a cursor, so asking again is safe.
  const tableReply = (await overloadAware(
    withRetry(() => callPlugin(endpoint, token, 'db.tables', {}, site))
  )) as unknown as { tables: string[]; prefix?: string; base_prefix?: string; views?: Record<string, string> }
  if (
    [tableReply.prefix, tableReply.base_prefix].some(
      (value) => value !== undefined && typeof value !== 'string'
    )
  )
    throw invalidExport('db.tables', 'invalid_reply')
  const prefix =
    options.platform === 'wordpress' ? tableReply.base_prefix || tableReply.prefix : tableReply.prefix
  if (
    !Array.isArray(tableReply.tables) ||
    !tableReply.tables.every((table) => typeof table === 'string' && table.length > 0)
  )
    throw invalidExport('db.tables', 'invalid_reply')
  let tables = [...new Set(tableReply.tables)]
  if (prefix) {
    const wordpress = options.platform === 'wordpress'
    const marker = wordpress ? ['options', 'posts', 'postmeta'] : ['extensions', 'content', 'menu', 'assets']
    const multisite =
      wordpress &&
      ((tableReply.prefix && tableReply.base_prefix && tableReply.prefix !== tableReply.base_prefix) ||
        tables.includes(`${prefix}blogs`))
    const candidates = [
      ...new Set(
        tables.flatMap((table) =>
          marker
            .filter((name) => table.startsWith(prefix) && table.endsWith(name))
            .map((name) => table.slice(0, -name.length))
        )
      )
    ].filter((candidate) => candidate.length > prefix.length && candidate.endsWith('_'))
    const otherPrefixes = candidates.filter((candidate) => {
      if (multisite && /^\d+_$/.test(candidate.slice(prefix.length))) return false
      return marker.every((name) => tables.includes(`${candidate}${name}`))
    })
    tables = tables.filter(
      (table) => table.startsWith(prefix) && !otherPrefixes.some((other) => table.startsWith(other))
    )
  }

  if (tables.length === 0) throw invalidExport('db.tables', 'empty_database')
  const views = tableReply.views ?? {}
  if (
    !views ||
    typeof views !== 'object' ||
    Array.isArray(views) ||
    Object.values(views).some((value) => typeof value !== 'string' || !/^CREATE\b/i.test(value))
  )
    throw invalidExport('db.tables', 'invalid_reply')
  const viewNames = Object.keys(views).filter((table) => tables.includes(table))
  const totalTables = tables.length
  tables = tables.filter((table) => !Object.hasOwn(views, table))

  // 🔒 BYTES, NEVER TEXT. The engine writes a BLOB column's raw bytes inside a quoted literal, so the
  // dump is not UTF-8: decoding it as text turned every invalid byte into U+FFFD and corrupted
  // images, serialized data and anything binary on the way to the copy. Each chunk is decoded from
  // base64 and compressed as it arrives, so the dump itself is never held whole, only its gzip.
  const gzip = createGzip({ level: 9 })
  const compressed: Buffer[] = []
  gzip.on('data', (piece: Buffer) => compressed.push(piece))
  const gzipped = new Promise<void>((resolve, reject) => {
    gzip.on('end', resolve)
    gzip.on('error', reject)
  })
  // Attach a rejection handler immediately: an export can fail before awaiting compression.
  void gzipped.catch(() => {})
  let bytes = 0
  let tablesDone = 0
  const completedTables = new Set<string>()
  // 🔒 Halved on every site 5xx and kept for the rest of the dump: a site that runs out of memory on
  // 5000 rows of one table will on the next table too. The engine clamps `limit` to 1..5000, and
  // the cursor names rows, not pages, so a smaller page continues exactly where the last one ended.
  let limit = DB_CHUNK_LIMIT

  try {
    if (options.dbDumpMany) {
      const advertisedMaxTables = Number(options.dbDumpMany.max_tables ?? 5000)
      const maxTables = Number.isFinite(advertisedMaxTables)
        ? Math.max(1, Math.min(5000, Math.floor(advertisedMaxTables)))
        : 5000
      for (let start = 0; start < tables.length; start += maxTables) {
        const tableBatch = tables.slice(start, start + maxTables)
        let cursor: { table: number; row: string } | null = null
        const seenCursors = new Set<string>()
        let lastErrorCursor: string | null = null
        for (;;) {
          const chunk = (await overloadAware(
            withRetry(() =>
              callPlugin(
                endpoint,
                token,
                'db.dump_many',
                {
                  tables: tableBatch,
                  cursor,
                  limit
                },
                site
              ).catch((error: unknown) => {
                if (isSiteOverload(error)) limit = Math.max(MIN_DB_CHUNK_LIMIT, Math.floor(limit / 2))
                throw error
              })
            )
          )) as unknown as {
            sql_b64: string
            next_cursor: { table: number; row: string } | null
            done: boolean
            progress?: Array<{ index: number; table: string; rows: number; total: number; done: boolean }>
            tables_done?: number
            stopped?: 'done' | 'bytes' | 'time' | 'error'
          }
          const sql = validSql('db.dump_many', chunk.sql_b64)
          bytes += sql.length
          gzip.write(sql)
          if (!sql.length && chunk.done && !cursor) throw invalidExport('db.dump_many', 'invalid_payload')
          for (const progress of chunk.progress ?? []) {
            if (!tableBatch.includes(progress.table)) throw invalidExport('db.dump_many', 'invalid_reply')
            if (progress.done && !completedTables.has(progress.table)) {
              completedTables.add(progress.table)
              tablesDone += 1
              onTable?.({
                tables: tables.length,
                table: progress.table,
                rows: progress.total,
                done: tablesDone
              })
            }
          }
          const previous = cursor
          cursor = chunk.next_cursor
          if (!chunk.done && !cursor) throw invalidExport('db.dump_many', 'cursor_missing')
          if (
            cursor &&
            (!Number.isSafeInteger(cursor.table) ||
              cursor.table < 0 ||
              cursor.table >= tableBatch.length ||
              (cursor.row !== null && typeof cursor.row !== 'string'))
          )
            throw invalidExport('db.dump_many', 'invalid_reply')
          if (cursor) {
            const key = `${cursor.table}:${cursor.row}`
            const previousRow = Number(previous?.row)
            const nextRow = Number(cursor.row)
            const previousKey = previous ? `${previous.table}:${previous.row}` : null
            const repeatedAtInput = previousKey === key
            if (
              (seenCursors.has(key) && !(chunk.stopped === 'error' && repeatedAtInput)) ||
              (previous && cursor.table < previous.table) ||
              (previous &&
                cursor.table === previous.table &&
                Number.isFinite(previousRow) &&
                Number.isFinite(nextRow) &&
                nextRow < previousRow)
            ) {
              throw invalidExport(
                'db.dump_many',
                previous && cursor.table < previous.table ? 'cursor_backwards' : 'cursor_repeated'
              )
            }
            if (chunk.stopped === 'error') {
              if (repeatedAtInput && lastErrorCursor === key)
                throw invalidExport('db.dump_many', 'cursor_stalled')
              lastErrorCursor = key
            } else {
              lastErrorCursor = null
            }
            seenCursors.add(key)
          }
          if (chunk.done || !cursor) break
        }
      }
    } else
      for (const table of tables) {
        let cursor: string | null = null
        let offset = 0
        let byOffset = false
        let rows = 0
        let first = true
        const seen = new Set<string>()
        for (;;) {
          const chunk = (await overloadAware(
            withRetry(() =>
              callPlugin(
                endpoint,
                token,
                'db.dump',
                {
                  table,
                  limit,
                  ...(byOffset ? { offset } : { cursor: cursor ?? '' })
                },
                site
              ).catch((error: unknown) => {
                if (isSiteOverload(error)) limit = Math.max(MIN_DB_CHUNK_LIMIT, Math.floor(limit / 2))
                throw error
              })
            )
          )) as unknown as DbDumpChunk
          const sql = validSql('db.dump', chunk.sql_b64)
          if (first && sql.length === 0) throw invalidExport('db.dump', 'invalid_payload')
          first = false
          const next =
            typeof chunk.next_cursor === 'string'
              ? `cursor:${chunk.next_cursor}`
              : `offset:${chunk.next_offset ?? offset + chunk.rows}`
          if (
            !chunk.done &&
            (seen.has(next) ||
              chunk.rows === 0 ||
              (byOffset && (chunk.next_offset ?? offset + chunk.rows) <= offset))
          )
            throw invalidExport('db.dump', 'cursor_stalled')
          seen.add(next)
          bytes += sql.length
          gzip.write(sql)
          if (typeof chunk.next_cursor === 'string') {
            cursor = chunk.next_cursor
          } else {
            byOffset = true
            offset = chunk.next_offset ?? offset + chunk.rows
          }
          rows = chunk.total
          if (chunk.done) break
        }
        tablesDone += 1
        // `rows` is the table's TOTAL, which the component returns on every chunk — so the figure the customer reads ("312
        // posts") costs no extra call.
        onTable?.({ tables: tables.length, table, rows, done: tablesDone })
      }

    for (const view of viewNames) {
      const sql = Buffer.from(`${views[view]};\n`)
      bytes += sql.length
      gzip.write(sql)
    }
    // gzip because that is what `provision.sh` on the fleet fetches (`fetch "$DB_KEY"` then `gunzip -c`).
    gzip.end()
    await gzipped
    // A presigned PUT needs its length up front, so the compressed copy is held to send it in one go.
    const gz = Buffer.concat(compressed)

    let uploadedKey = ''
    await withRetry(async () => {
      const signed = await artifacts.signPut('db')
      const put = await fetch(signed.url, {
        method: 'PUT',
        body: new Uint8Array(gz),
        redirect: 'error',
        headers: { 'content-type': 'application/gzip' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
      await put.body?.cancel()
      if (put.status === 429 || put.status >= 500)
        throw relayedTransportError('database upload temporarily refused')
      if (!put.ok)
        throw new ExportFailed('store_refused', undefined, {
          at: 'export',
          check: 'store_upload_failed',
          status: put.status
        })
      uploadedKey = signed.key
    }).catch((error: unknown) => {
      if (error instanceof ExportFailed) throw error
      throw new ExportFailed('store_refused', undefined, {
        at: 'export',
        check: 'store_upload_failed',
        error: diagnosticError(error)
      })
    })
    return { key: uploadedKey, tables: totalTables, bytes }
  } catch (error) {
    gzip.destroy()
    throw error
  }
}

/**
 * The whole webroot, as ONE tar object in storage — no archive and no storage key ever touches this machine.
 *
 * A part is a bounded unit of work, and that is what lets it survive on shared hosting: PHP has
 * time and memory limits a large webroot will hit. The cursor has two parts (`path` +
 * `offset`), so even a file larger than one part continues at the right place.
 *
 * 🔒 `size` IS RETURNED UNCHANGED, never measured again. A tar entry must be exactly as long as its
 * header declares, and the header of a file spanning two parts was written in the previous call — while
 * the site is still running. Letting the site re-measure that file corrupts the archive from that entry on.
 *
 * 🔒 A FAILURE MIDWAY DOES **NOT** THROW AWAY THE PARTS RECEIVED. They are the only thing a later run can
 * continue from, and throwing them away is how 1.4 GB of work vanished over one 502 (measured on the WordPress branch,
 * 14/08). An abandoned upload costs storage until the bucket's lifecycle rule clears it — the cheaper
 * price.
 *
 * The cursor is written after every part (`resume.ts`), so a run cut by a dsh restart goes on from
 * the last part stored when the owner presses Continue (#1565, `run.ts` `restoreRuns`).
 *
 * A SLOW UPLINK MOVES THE PART TO ANOTHER ROAD, never stops the run (#1566). A part that runs out of
 * time is carried in the answer (`inline`) from then on, where no 120 s limit of the component's
 * applies and this side waits what the size needs (`packTimeoutMs`). 🔒 THE SIZE NEVER CHANGES
 * within one upload: R2 refuses to complete a multipart upload whose parts, the last aside, differ
 * in size (error 10048, InvalidPart).
 *
 * 🔒 A PART NUMBER IS USED AT MOST ONCE, EVER. Every attempt reserves the next number and writes it
 * to the cursor (`nextPart`) before any call that may write under it. A call this side gave up on —
 * its wait ended, the connection broke, this side's own PUT to the store threw after sending, or dsh
 * was replaced mid-call — may still PUT its bytes later under that number; the retry, or the
 * Continue after a restart, takes a new one. The store completes only the numbers listed with the
 * ETags this side recorded, so a late PUT lands on a number nobody lists. A run with no failure
 * numbers its parts 1, 2, 3…; every retry costs one number of the 10,000 the store allows.
 *
 * Progress (#1567) carries the bytes sent, the site's total when its engine can tell it
 * (`site.fingerprint`, claude-cowork 0.24.51+; best effort, never a reason to stop), the rate of this
 * run, and when the part on its way started — so a part that takes minutes still shows as moving.
 */
export async function exportFiles(
  endpoint: string,
  token: string,
  artifacts: SiteArtifacts,
  siteKey: string,
  onPart?: (progress: FilesProgress) => void,
  options: { inline?: boolean } & SiteCallOptions = {}
): Promise<FilesExportResult> {
  // An EXPIRED unfinished run is dropped entirely, and dropped properly: its parts describe the site at another
  // moment, and continuing onto them yields a copy that never existed anywhere. `abandon` so they do not
  // stay in storage, billed.
  const stale = await staleUpload(siteKey)
  if (stale) {
    await artifacts.abandon(stale.key, stale.uploadId)
    await forgetUpload(siteKey)
  }

  const held = await heldUpload(siteKey)
  const site = siteCall(options)

  // Storage names the object, not this side (ADR 0049 §3): a caller who picks its own path is a caller who
  // can overwrite another site's archive.
  const { key, uploadId } = held ?? (await artifacts.begin('webroot'))

  const parts: Array<{ PartNumber: number; ETag: string }> = held ? [...held.parts] : []
  let path = held?.cursor.path ?? ''
  let offset = held?.cursor.offset ?? 0
  let declaredSize = held?.cursor.size ?? 0
  let files = held?.files ?? 0
  let bytes = held?.bytes ?? 0
  let unreadable = unreadableOf(held?.unreadable)
  // The timestamp of the FIRST part. Re-stamping on every resume would let an archive claim a freshness
  // its first part never had.
  const startedAt = held?.startedAt ?? Date.now()

  // The road of the next part (#1566): inline once a part ran out of time, for the rest of the read.
  let inline = options.inline === true
  const targetBytes = TARGET_PART_BYTES
  // The number the next part goes under: past every number used, stored or abandoned.
  let nextPart = Math.max(held?.nextPart ?? 1, ...parts.map((part) => part.PartNumber + 1))
  const saveCursor = () =>
    rememberUpload(siteKey, {
      key,
      uploadId,
      parts,
      nextPart,
      cursor: { path, offset, size: declaredSize },
      files,
      bytes,
      startedAt,
      ...(unreadable ? { unreadable } : {})
    })

  const total = await siteBytes(endpoint, token, site)
  // The rate counts this run's own bytes only: a resumed read did not send the earlier ones now.
  const runStarted = Date.now()
  const bytesBefore = bytes
  let partStartedAt = runStarted
  const progress = (extra: Partial<FilesProgress> = {}): FilesProgress => {
    const seconds = (Date.now() - runStarted) / 1000
    return {
      files,
      bytes,
      parts: parts.length,
      partStartedAt,
      ...(total !== undefined ? { total } : {}),
      ...(seconds >= 1 && bytes > bytesBefore ? { rate: Math.round((bytes - bytesBefore) / seconds) } : {}),
      ...(unreadable ? { unreadable } : {}),
      ...extra
    }
  }

  // 🔒 NO `try/catch` HERE, ON PURPOSE. An error is thrown straight up, and the parts already
  // received stay in storage — they are the only thing a later run can continue from, and throwing them away is
  // how 1.4 GB of work vanished over one 502 in `tracy-desk` (14/08). The cursor has been on disk since the
  // last part, so the next run continues from there — even when what just broke was something nobody foresaw:
  // dsh restarting, the customer's server rebooting, a never-seen error.
  //
  // Only TWO places `abandon`: over the part-count cap (a runaway cursor), and an expired unfinished run
  // (it describes the site at another moment). Neither is a "temporary error".
  for (;;) {
    partStartedAt = Date.now()
    onPart?.(progress())
    let partNumber = nextPart
    const packed = (await overloadAware(
      withPartRetry(
        async () => {
          partNumber = nextPart
          if (partNumber > MAX_PARTS) {
            await artifacts.abandon(key, uploadId)
            await forgetUpload(siteKey)
            throw new ExportFailed('too_many_parts')
          }
          // 🔒 SIGN THE URL INSIDE the retry loop, not outside. A presigned URL expires after a few minutes;
          // reusing the first URL for the second attempt fails on the SIGNATURE, not on storage — and it
          // looks exactly like storage failing twice in a row.
          const putUrl = await artifacts.signPart(key, uploadId, partNumber)
          // 🔒 RESERVED ON DISK BEFORE ANYTHING MAY WRITE UNDER IT — the component's PUT, or this
          // side's own inline PUT, either of which can land after a failure this side saw, or after
          // dsh itself was replaced mid-call. No attempt, retry or Continue ever gets it again.
          nextPart = partNumber + 1
          await saveCursor()
          const asked = { inline, targetBytes, partNumber }
          try {
            return await packPart(putUrl, asked)
          } catch (error) {
            if (isSlowPart(error)) inline = true
            throw error
          }
        },
        (attempt) => onPart?.(progress({ retrying: attempt }))
      )
    )) as unknown as PackResponse

    parts.push({ PartNumber: partNumber, ETag: packed.etag })
    files += packed.files
    bytes += packed.bytes
    path = packed.next_path
    offset = packed.next_offset
    declaredSize = packed.next_size ?? 0
    const omitted = unreadableOf(packed.unreadable)
    if (omitted) {
      const paths = [...new Set([...(unreadable?.paths ?? []), ...omitted.paths])]
      unreadable = {
        paths: paths.slice(0, 50),
        count: Math.max(unreadable?.count ?? 0, omitted.count, paths.length)
      }
    }
    onPart?.(progress())

    // Written AFTER EVERY PART, not at the end: the cursor's whole point is to survive a run that
    // never reaches the end — including for a reason nobody predicted.
    await saveCursor()

    if (packed.done) break
  }

  await artifacts.finish(key, uploadId, parts)
  // A closed archive has nothing left to continue. Leaving the cursor would push the next import to continue
  // an upload storage has already sealed.
  await forgetUpload(siteKey)

  return { key, files, bytes, parts: parts.length, ...(unreadable ? { unreadable } : {}) }

  /** One attempt at the next part, by the road and size `asked`. */
  async function packPart(
    putUrl: string,
    asked: { inline: boolean; targetBytes: number; partNumber: number }
  ): Promise<Record<string, unknown>> {
    const timeoutMs = packTimeoutMs(asked.inline, asked.targetBytes)
    if (!asked.inline) {
      return callPlugin(
        endpoint,
        token,
        'files.pack',
        {
          put_url: putUrl,
          target_bytes: asked.targetBytes,
          path,
          offset,
          size: declaredSize
        },
        site,
        timeoutMs
      )
    }
    // The inline road: the site cannot PUT anywhere itself (no ext/curl, allow_url_fopen off
    // — a live host, 2026-09-04), so the part comes back in the answer and THIS side stores it,
    // the way the database has always travelled. Same cursor, same part size, same ETag
    // bookkeeping; only who holds the upload changes.
    const packed = (await callPlugin(
      endpoint,
      token,
      'files.pack',
      {
        inline: true,
        target_bytes: asked.targetBytes,
        path,
        offset,
        size: declaredSize
      },
      site,
      timeoutMs
    )) as unknown as PackResponse
    if (typeof packed.part_b64 !== 'string') throw new ExportFailed('call_failed')
    const body = Buffer.from(packed.part_b64, 'base64')
    const put = await fetch(putUrl, {
      method: 'PUT',
      body: new Uint8Array(body)
    })
    if (!put.ok) {
      // A store that is down retries like a relayed transport error; a refusal does not.
      if (put.status === 429 || put.status >= 500)
        throw relayedTransportError(`part ${asked.partNumber}: HTTP ${put.status}`)
      throw new ExportFailed('store_refused')
    }
    const etag = etagOf(put)
    if (!etag) throw new ExportFailed('store_refused')
    return { ...packed, etag, part_b64: null }
  }
}

/** What the files read tells the wizard as it goes (#1567). */
export interface FilesProgress {
  files: number
  /** Bytes of the webroot stored so far, resumed parts included. */
  bytes: number
  parts: number
  /** The site's own byte count, when its engine can tell it (`site.fingerprint`). */
  total?: number
  /** Bytes a second this run has sent, once it has sent some. */
  rate?: number
  /** When the part on its way was first asked for (ms since the epoch, this host's clock). */
  partStartedAt?: number
  /** Which retry of the part on its way. Absent while it goes normally. */
  retrying?: number
  /** What the site's engine left out, unreadable to its PHP (`Unreadable`). */
  unreadable?: Unreadable
}

/** The most `site.fingerprint` pages read for a total: past this, the total is not worth the calls. */
const MAX_FINGERPRINT_PAGES = 20

/**
 * The webroot's size as the site's engine counts it (`site.fingerprint`, claude-cowork 0.24.51+), or
 * `undefined` when it cannot say. Best effort and asked once: an engine without the action, a page
 * that fails, or too many pages leave the total unknown, and the read goes on without it. It is the
 * engine's own count of the webroot, which may include files the pack leaves out, so the wizard
 * calls it "about".
 */
async function siteBytes(endpoint: string, token: string, site: SiteCall): Promise<number | undefined> {
  let bytes = 0
  let after = ''
  try {
    for (let page = 0; page < MAX_FINGERPRINT_PAGES; page++) {
      const answer = (await callPlugin(
        endpoint,
        token,
        'site.fingerprint',
        { after, limit: 20_000, checksums: false },
        site
      )) as { fingerprint?: { files?: { bytes?: unknown; next_after?: unknown } } }
      const files = answer.fingerprint?.files
      if (!files || typeof files.bytes !== 'number' || !Number.isFinite(files.bytes)) return undefined
      bytes += files.bytes
      if (typeof files.next_after !== 'string' || files.next_after === '')
        return bytes > 0 ? bytes : undefined
      after = files.next_after
    }
  } catch {
    // Not a reason to stop the read: the total stays unknown.
  }
  return undefined
}
