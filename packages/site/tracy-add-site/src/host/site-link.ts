/**
 * The importer's manners towards one customer site: how fast it calls the engine, and when it stops.
 *
 * A host firewall banned the importer's IP partway through an import (a Joomla 3.10 site, measured
 * 2026-10-19): the engine calls had gone back to back for about two and a half minutes, then TCP 80
 * and 443 from that IP were refused while ping still answered and the site still worked from other
 * addresses. The retries that followed knocked on a closed door, and the customer's own retries
 * failed at sign-in as `unreachable`, because the ban was still there.
 *
 * So one link per run carries three things:
 *
 *   - a pause between consecutive engine calls to the site (`ENGINE_CALL_GAP_MS`);
 *   - a `Retry-After` the site sent on a 429 or 503, which the next call waits out;
 *   - a ban check: once the site has answered in this run, consecutive connection-level failures
 *     mean the host stopped accepting this IP — the run stops with `blocked_by_host` instead of
 *     retrying into the ban and making it longer.
 */

import { failureCode } from './error-code.mjs'

/**
 * The pause between two engine calls to the same site, from the end of one to the start of the next.
 *
 * ⚠ NOT a proven safe threshold. The banning host published no rate and the ban was measured once;
 * one second is a starting point that keeps a typical import within minutes of its old length (an
 * engine call takes seconds), not a number shown to pass any particular firewall rule.
 */
export const ENGINE_CALL_GAP_MS = 1000

/** The longest `Retry-After` honoured; a site asking for more gets this, and the retry ladder after. */
export const MAX_RETRY_AFTER_MS = 120_000

/**
 * Connection-level failures in a row, after the site has answered once in this run, that stop it.
 * One is a blip the retry ladder exists for; three in a row on a site that was answering, with the
 * pauses of the ladder between them, is the host refusing this IP.
 */
export const BAN_AFTER_FAILURES = 3

/**
 * Failures that happen before any HTTP answer: the TCP connection was refused, reset, never
 * completed, or had no route. Not a request timeout — that is a site too slow to answer, and it
 * already answered the connection.
 */
const CONNECTION_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'EHOSTUNREACH',
  'ENETUNREACH'
])

/**
 * The connection-level code of a thrown fetch error, looked up its cause chain and inside an
 * `AggregateError` (`error-code.mjs`, the reading the diagnostics share), or `undefined`. Also
 * takes a code already read, as `{ code }`.
 */
export function connectionFailure(error: unknown): string | undefined {
  return failureCode(error, (code) => CONNECTION_CODES.has(code))
}

/**
 * `Retry-After` in milliseconds — seconds or an HTTP date — capped at `MAX_RETRY_AFTER_MS`, or
 * `undefined` when absent or unreadable.
 */
export function retryAfterMs(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  const ms = /^\d+$/.test(trimmed) ? Number(trimmed) * 1000 : Date.parse(trimmed) - now
  if (!Number.isFinite(ms)) return undefined
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, ms))
}

/** The host stopped accepting connections from this importer partway through (`SiteLink.failed`). */
export class BlockedByHost extends Error {
  constructor(readonly code: string) {
    super(`The site's host stopped accepting connections: ${code}`)
    this.name = 'BlockedByHost'
  }
}

export interface SiteLinkOptions {
  /** The pause between calls; tests pass 0 or a small number. */
  gapMs?: number
  /**
   * Count connection failures as after progress from the first call: the previous run of this
   * site stopped with `blocked_by_host`, so a refused first call is the same ban, not a typo.
   */
  bannedBefore?: boolean
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** One run's link to one site. Calls through it are sequential; it is not a lock. */
export class SiteLink {
  private readonly gapMs: number
  private notBefore = 0
  private answered: boolean
  private failures = 0

  constructor(options: SiteLinkOptions = {}) {
    this.gapMs = options.gapMs ?? ENGINE_CALL_GAP_MS
    this.answered = options.bannedBefore ?? false
  }

  /** Waits until the next call to the site may start. */
  async ready(): Promise<void> {
    const wait = this.notBefore - Date.now()
    if (wait > 0) await sleep(wait)
  }

  /**
   * The site answered over HTTP, whatever the status; `retryAfter` is its `Retry-After` header when
   * it sent one with a 429 or 503.
   */
  answeredWith(retryAfter?: number): void {
    this.answered = true
    this.failures = 0
    this.notBefore = Date.now() + Math.max(this.gapMs, retryAfter ?? 0)
  }

  /**
   * A call threw before any answer. Throws `BlockedByHost` when this is a ban, else returns so the
   * caller rethrows the original error to the retry ladder.
   */
  failed(error: unknown): void {
    this.notBefore = Date.now() + this.gapMs
    const code = connectionFailure(error)
    if (!code) {
      this.failures = 0
      return
    }
    this.failures += 1
    if (this.answered && this.failures >= BAN_AFTER_FAILURES) throw new BlockedByHost(code)
  }
}
