/**
 * PageSpeed Insights (mobile) for a restaurant's current website: the facts a pitch compares the demo
 * against. One Lighthouse run takes 10–30 s, so it runs in the research job or the background site
 * check (`site-checks.js`), never in a search. Any failure is `null`: a missing measurement never
 * fails the job. The same run measures the demo Tracy built once its build completes (`measurePageSpeed`), so a
 * pitch can set the two scores side by side (`pagespeedPair`, `pagespeedProof`).
 */
import { isIP } from 'node:net'
import { assertPublicUrl, isBlockedAddress } from '../domain/url-guard.mjs'

const PSI_URL = 'https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed'
const TIMEOUT_MS = 60_000
// Lighthouse 13 (PSI today) calls the viewport audit `viewport-insight` and the tap-target one
// `target-size`; older runs say `viewport` / `tap-targets`, and `font-size` is gone. Either name counts.
const VIEWPORT_AUDITS = ['viewport-insight', 'viewport']
const TAP_TARGET_AUDITS = ['target-size', 'tap-targets']

const score = (category) => {
  const n = Number(category?.score)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

const failed = (audit) => {
  const s = Number(audit?.score)
  return Number.isFinite(s) && s < 0.5
}

/**
 * Mobile-friendly = the viewport audit passes and the tap-target audit (when run) does not fail.
 * Null when PSI ran no viewport audit at all: unmeasured is never "friendly".
 */
function mobileFriendlyOf(audits) {
  const viewport = VIEWPORT_AUDITS.map((id) => audits?.[id]).find((a) => a && a.score !== undefined)
  if (!viewport) return null
  if (failed(viewport)) return false
  return !TAP_TARGET_AUDITS.some((id) => failed(audits?.[id]))
}

/**
 * @returns {Promise<{performance: number|null, seo: number|null, lcpMs: number|null, https: boolean,
 *   mobileFriendly: boolean|null, stackPacks: string[], checkedAt: string} | null>}
 *   `stackPacks` are Lighthouse's detected platforms (WordPress, Next.js, …), the first word on the CMS.
 */
export async function checkPageSpeed(
  website,
  key,
  { fetch: fetchImpl = fetch, now = Date.now, timeoutMs = TIMEOUT_MS } = {}
) {
  const q = new URLSearchParams({ url: website, strategy: 'mobile' })
  q.append('category', 'performance')
  q.append('category', 'seo')
  q.set('key', key)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(`${PSI_URL}?${q}`, {
      headers: { accept: 'application/json' },
      signal: controller.signal
    })
    if (!res.ok) return null
    const lh = (await res.json())?.lighthouseResult
    if (!lh) return null
    const lcp = Number(lh.audits?.['largest-contentful-paint']?.numericValue)
    const finalUrl = lh.finalDisplayedUrl ?? lh.finalUrl ?? website
    return {
      performance: score(lh.categories?.performance),
      seo: score(lh.categories?.seo),
      lcpMs: Number.isFinite(lcp) ? Math.round(lcp) : null,
      https: String(finalUrl).startsWith('https:'),
      mobileFriendly: mobileFriendlyOf(lh.audits),
      stackPacks: (Array.isArray(lh.stackPacks) ? lh.stackPacks : [])
        .map((p) => (typeof p?.title === 'string' ? p.title.trim() : ''))
        .filter(Boolean),
      checkedAt: new Date(now()).toISOString()
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ── The demo's own score (10Web's pitch: the new site scores 90+ where the old one did not) ───────────────────────

/**
 * Why a demo has no PageSpeed score. Measured: `no_address` (the build has no address), `switched_off` (the operator
 * turned PageSpeed checks off), `no_key` (no Google key), `not_public` (a reserved name such as `*.test` or
 * `localhost`, a private address or a port other than the scheme's: Google's servers cannot reach it), `not_resolved`
 * (the name has no public DNS answer), `timeout`, `unreachable` (PageSpeed answered that Lighthouse could not load the
 * page), `no_score` (PageSpeed answered without a performance score), `failed` (any other refusal or a malformed
 * answer). Read only: `not_measured` (a build with no measurement kept: still running, being measured, or finished
 * before measurements were kept) and `no_demo` (no build at all).
 */
export const DEMO_PAGESPEED_REASONS = Object.freeze([
  'no_address',
  'switched_off',
  'no_key',
  'not_public',
  'not_resolved',
  'timeout',
  'unreachable',
  'no_score',
  'failed',
  'not_measured',
  'no_demo'
])
/** RFC 2606 / 6761 / 6762 names and the private-use ones no public resolver answers. */
const RESERVED_TLDS = new Set([
  'test',
  'example',
  'invalid',
  'localhost',
  'local',
  'internal',
  'lan',
  'home',
  'arpa'
])
/** A bound on reading PageSpeed's refusal, after the measurement itself ended. */
const ERROR_READ_MS = 5_000

/**
 * Why Google's PageSpeed servers cannot reach `url`, or null when they may. No network call without `resolve`; with
 * it, every DNS answer must be a public address (`url-guard.mjs`).
 * @param {string} url
 * @param {{ resolve?: ((host: string) => Promise<Array<{address: string}>>) | null }} [opts]
 * @returns {Promise<'not_public' | 'not_resolved' | null>}
 */
export async function pageSpeedUnreachable(url, { resolve = null } = {}) {
  let u
  try {
    u = new URL(String(url))
  } catch {
    return 'not_public'
  }
  const host = u.hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase()
  if (!host || RESERVED_TLDS.has(host.split('.').pop())) return 'not_public'
  if (isIP(host) ? isBlockedAddress(host) : !host.includes('.')) return 'not_public'
  try {
    // Without a resolver only the address itself is judged: the guard needs one for its DNS step.
    await assertPublicUrl(u, { resolve: resolve ?? (async () => [{ address: '8.8.8.8' }]) })
  } catch (error) {
    return ['dns_failed', 'dns_empty'].includes(error?.reason) ? 'not_resolved' : 'not_public'
  }
  return null
}

/** The Lighthouse error code PageSpeed names in a refusal (`Lighthouse returned error: FAILED_DOCUMENT_REQUEST.`). */
async function lighthouseErrorOf(res) {
  let timer
  try {
    const body = await Promise.race([
      res.json(),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), ERROR_READ_MS)
        timer.unref?.()
      })
    ])
    const message = String(body?.error?.message ?? '')
    return /Lighthouse returned error: ([A-Z_]+)/.exec(message)?.[1] ?? null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * One mobile PageSpeed measurement of a site Tracy built (`checkPageSpeed`), with the reason when there is no score.
 * Never throws and never makes a number up; bounded by `timeoutMs` (plus a few seconds to read a refusal) even when
 * `fetch` ignores its abort signal.
 * @returns {Promise<{ url: string, performance: number, seo: number|null, lcpMs: number|null, https: boolean,
 *   mobileFriendly: boolean|null, checkedAt: string } | { url: string|null, reason: string, checkedAt: string,
 *   status?: number, lighthouse?: string }>}
 */
export async function measurePageSpeed(
  url,
  key,
  { fetch: fetchImpl = fetch, now = Date.now, timeoutMs = TIMEOUT_MS, resolve = null, enabled = true } = {}
) {
  const address = typeof url === 'string' && url ? url : null
  const miss = (reason, extra = {}) => ({
    url: address,
    reason,
    checkedAt: new Date(now()).toISOString(),
    ...extra
  })
  let timer
  try {
    if (!address) return miss('no_address')
    if (!enabled) return miss('switched_off')
    if (!key) return miss('no_key')
    const blocked = await pageSpeedUnreachable(address, { resolve })
    if (blocked) return miss(blocked)
    let answer = null
    let thrown = null
    let timedOut = false
    const recording = async (...args) => {
      try {
        answer = await fetchImpl(...args)
        return answer
      } catch (error) {
        thrown = error
        throw error
      }
    }
    const bound = new Promise((resolve) => {
      timer = setTimeout(() => {
        timedOut = true
        resolve(null)
      }, timeoutMs)
      timer.unref?.()
    })
    const measured = await Promise.race([
      checkPageSpeed(address, key, { fetch: recording, now, timeoutMs }),
      bound
    ])
    if (measured) {
      if (measured.performance === null) return miss('no_score')
      const { stackPacks: _stackPacks, ...facts } = measured
      return { url: address, ...facts }
    }
    if (timedOut || ['AbortError', 'TimeoutError'].includes(thrown?.name)) return miss('timeout')
    if (answer && !answer.ok) {
      const lighthouse = await lighthouseErrorOf(answer)
      return lighthouse
        ? miss('unreachable', { status: answer.status, lighthouse })
        : miss('failed', { status: answer.status })
    }
    return miss('failed')
  } catch {
    return miss('failed')
  } finally {
    clearTimeout(timer)
  }
}

const score100 = (v) => (Number.isInteger(v) && v >= 0 && v <= 100 ? v : null)

/**
 * `{score, measuredAt}` of a kept measurement (the research's `pageSpeed`, or a demo's), or null without a performance
 * score or a measurement date.
 */
export function pageSpeedScoreOf(raw) {
  if (!raw || typeof raw !== 'object') return null
  const score = score100(raw.performance)
  const at = typeof raw.checkedAt === 'string' ? Date.parse(raw.checkedAt) : Number.NaN
  return score === null || !Number.isFinite(at) ? null : { score, measuredAt: new Date(at).toISOString() }
}

/** A demo's kept measurement (`wo_build.built.pagespeed`) as `{score, measuredAt}`, else `{reason}`. */
export function demoPageSpeedOf(raw) {
  const scored = pageSpeedScoreOf(raw)
  if (scored) return scored
  if (!raw || typeof raw !== 'object') return { reason: 'not_measured' }
  return { reason: DEMO_PAGESPEED_REASONS.includes(raw.reason) ? raw.reason : 'no_score' }
}

/**
 * The old site's score next to the demo's: `old` from the research's `pageSpeed` (null without a score), `demo` the
 * demo's own view (`demoPageSpeedOf`), `{reason: 'no_demo'}` when there is no demo.
 */
export function pagespeedPair(oldRaw, demo) {
  return {
    old: pageSpeedScoreOf(oldRaw),
    demo: demo && typeof demo === 'object' ? demo : { reason: 'no_demo' }
  }
}

/**
 * One English line a pitch may quote ("Current site 34 → demo 92 on mobile"): only when both sites were measured and
 * the demo scores higher, else null. A missing or a worse score is never offered as proof.
 */
export function pagespeedProof(pair) {
  const before = score100(pair?.old?.score)
  const after = score100(pair?.demo?.score)
  if (before === null || after === null || after <= before) return null
  return `Current site ${before} → demo ${after} on mobile`
}
