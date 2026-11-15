// The hidden variant of the structure measurement (ticket #586, review round 2): on the full site, the pages are
// hidden in two halves. Each hidden page must be seen answering as missing (404 or 410) before the links to it are
// judged; a page the site still serves leaves the variant incomplete naming it, since nothing was hidden for it. Then
// a link on a page still shown that leads to a hidden page is broken. Every page must answer again once published. A
// variant with no page it can hide measured nothing and is incomplete. Pure but for the injected site.
import { errorsOf, linksOf, readPages } from './structure-read.mjs'

/** The statuses a hidden page may answer: the page is missing, or gone. */
const MISSING = new Set([404, 410])

/** The hidden variant: `full` is the full variant read on this site. */
export async function hiddenVariant(full, { site, base, demoRoutes }) {
  const out = (status, extra) => ({ status, variant: 'hidden', ...extra })
  if (!full.state) return out('incomplete', { reason: 'full_not_written' })
  if (!site.hide || !site.show) return out('incomplete', { reason: 'no_hide_door' })
  const pages = full.state.pages
  const hideable = pages.filter((p) => !p.home && p.record?.id)
  if (!hideable.length) return out('incomplete', { reason: 'nothing_hidden', hidden: 0 })
  const half = Math.ceil(hideable.length / 2)
  const broken = []
  const seenMissing = []
  const stillShown = []
  let probes = 0
  let capped = false
  try {
    for (const part of [hideable.slice(0, half), hideable.slice(half)].filter((h) => h.length)) {
      for (const p of part) await site.hide(p.record)
      const gone = new Set(part.map((p) => p.url))
      const read = await readPages(site, pages)
      const seen = read
        .filter((p) => gone.has(p.url))
        .map((p) => ({ pageType: p.pageType, path: p.path, status: p.status }))
      seenMissing.push(...seen.filter((s) => MISSING.has(s.status)))
      const still = seen.filter((s) => !MISSING.has(s.status))
      stillShown.push(...still)
      if (!still.length) {
        const links = await linksOf(site, read, { base, demoRoutes })
        probes = Math.max(probes, links.probes)
        capped ||= links.capped
        for (const f of links.broken) broken.push({ ...f, hidden: part.map((p) => p.pageType) })
      }
      for (const p of part) await site.show(p.record)
    }
  } catch (error) {
    return out('incomplete', {
      reason: 'hide_door_failed',
      message: String(error?.message ?? error).slice(0, 200),
      broken,
      seenMissing
    })
  }
  const notBack = errorsOf(await readPages(site, pages))
  const reason = stillShown.length
    ? 'hidden_page_still_answers'
    : capped
      ? 'link_probe_cap'
      : notBack.length
        ? 'pages_not_back'
        : null
  return out(broken.length ? 'failed' : reason ? 'incomplete' : 'passed', {
    ...(reason ? { reason } : {}),
    hidden: hideable.length,
    seenMissing,
    ...(stillShown.length ? { stillShown } : {}),
    probes,
    broken,
    notBack
  })
}
