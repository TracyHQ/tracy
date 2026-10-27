/**
 * PageSpeed Insights (mobile) for a restaurant's current website: the facts a pitch compares the demo
 * against. One Lighthouse run takes 10–30 s, so it runs in the research job or the background site
 * check (`site-checks.js`), never in a search. Any failure is `null`: a missing measurement never
 * fails the job.
 */
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
