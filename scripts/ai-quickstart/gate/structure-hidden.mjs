// The hidden variant of the structure measurement (ticket #586, review round 2): on the full site, the pages are
// hidden in two halves. Each hidden page must be seen answering as missing (404 or 410) before the links to it are
// judged; a page the site still serves leaves the variant incomplete naming it, since nothing was hidden for it. Every
// page not hidden must answer as planned while the others are hidden (a hide that takes them down fails the variant,
// `shownBroken`). Then a link on a page still shown that leads to a hidden page is broken, also when the hidden page still
// answers at another address (`hidden_page_still_answers`: the page is told by its identity read before it was hidden,
// review 4 X3). A broken link whose address names no planned page is read again once its half is published, so the row
// names the page it leads to. Every page must answer again once published. A variant with no page it can hide measured
// nothing and is incomplete. Pure but for the injected site.
import { errorsOf, linksOf, readPages } from './structure-read.mjs'

/** The statuses a hidden page may answer: the page is missing, or gone. */
const MISSING = new Set([404, 410])

/** The hidden variant: `full` is the full variant read on this site. */
export async function hiddenVariant(full, { site, base, demoRoutes, identify = null }) {
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
  const shownBroken = []
  const hiddenSoFar = new Set()
  const unplanned = []
  const elsewhere = []
  let probes = 0
  let capped = false
  try {
    for (const part of [hideable.slice(0, half), hideable.slice(half)].filter((h) => h.length)) {
      // Which page each of the half is, read while it is still shown.
      const before = identify ? await readPages(site, part) : []
      const gonePages = before.map((p) => ({ pageType: p.pageType, identity: identify(p.html) }))
      for (const p of part) await site.hide(p.record)
      const gone = new Set(part.map((p) => p.url))
      const read = await readPages(site, pages)
      const seen = read
        .filter((p) => gone.has(p.url))
        .map((p) => ({ pageType: p.pageType, path: p.path, status: p.status }))
      seenMissing.push(...seen.filter((s) => MISSING.has(s.status)))
      const still = seen.filter((s) => !MISSING.has(s.status))
      stillShown.push(...still)
      // A page of an earlier half is judged once every page is published again (`notBack`), not here.
      for (const p of part) hiddenSoFar.add(p.url)
      const down = errorsOf(read.filter((p) => !hiddenSoFar.has(p.url)))
      for (const e of down) shownBroken.push({ ...e, hidden: part.map((p) => p.pageType) })
      const names = part.map((p) => p.pageType)
      let untold = []
      if (!still.length && !down.length) {
        const links = await linksOf(site, read, { base, demoRoutes, identify, hidden: gonePages })
        probes = Math.max(probes, links.probes)
        capped ||= links.capped
        const rows = links.broken.map((f) => ({ ...f, hidden: names }))
        broken.push(...rows)
        untold = rows.filter((f) => !f.target)
        unplanned.push(...links.unplanned.map((f) => ({ ...f, hidden: names })))
        elsewhere.push(...links.elsewhere.map((f) => ({ ...f, hidden: names })))
      }
      for (const p of part) await site.show(p.record)
      // A link that answered missing while its page was hidden: read again now, the page it leads to is named.
      if (identify)
        for (const f of untold) {
          const at = (() => {
            try {
              return new URL(f.href, new URL(f.page ?? '', base)).toString()
            } catch {
              return null
            }
          })()
          const answer = at ? await site.fetch(at) : null
          const id = answer?.status > 0 && answer.status < 400 ? identify(answer.html ?? '') : null
          const target = id && gonePages.find((g) => g.identity === id)
          if (target) f.target = target.pageType
        }
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
  return out(broken.length || shownBroken.length ? 'failed' : reason ? 'incomplete' : 'passed', {
    ...(reason ? { reason } : {}),
    hidden: hideable.length,
    seenMissing,
    ...(stillShown.length ? { stillShown } : {}),
    probes,
    broken,
    ...(shownBroken.length ? { shownBroken } : {}),
    ...(unplanned.length ? { unplanned } : {}),
    ...(elsewhere.length ? { elsewhere } : {}),
    notBack
  })
}
