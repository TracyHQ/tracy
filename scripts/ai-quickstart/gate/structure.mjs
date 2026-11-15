// The structure measurement of the release gate (ticket #586, product decision 3): does the built site hold together
// at its most items, at its least, and once pages are hidden after the build?
//   full     the marker build at every block's most items: every page answers, and no link is broken (`linkCheck` of
//            the rendered scan, with the pages the plan has, an HTTP probe and the template's demo routes)
//   minimum  on a fresh site, the build at every block's least items (at least one): the same checks
//   hidden   on the full site, the pages hidden in two halves, each half read, then published again: the links a hidden
//            page breaks are recorded with that page's type (recorded only, decision 3); every page answers again
// The full and minimum variants decide the status; the hidden one is recorded beside them. Without a way to reset the site the minimum variant is `not_run`. The site and
// the build are injected (`write-safety.mjs` has the same site). Pure but for them.
import { foldPath, linkCheck } from '../rendered-scan/links.mjs'
import { countOf, itemKindOf } from './marker-composition.mjs'

/** Read every page; a page that answers an error is a finding. */
async function readPages(site, pages) {
  const read = []
  for (const p of pages) {
    const answer = await site.fetch(p.url)
    read.push({ ...p, status: answer.status, html: answer.html ?? '' })
  }
  return read
}

/** The page type a link lands on, when the plan has that page. */
function withTarget(finding, pages, base) {
  let path = finding.href
  try {
    const url = new URL(finding.href, base)
    path = url.pathname + url.search
  } catch {
    // A link that is no address keeps its own spelling.
  }
  const target = pages.find((p) => foldPath(p.path) === foldPath(path) || p.url === finding.href)
  return { ...finding, ...(target ? { target: target.pageType } : {}) }
}

/** The links of a set of read pages, each with the page type it lands on. */
async function linksOf(site, read, { base, demoRoutes }) {
  const found = await linkCheck({
    pages: read.filter((p) => p.status < 400),
    base,
    expected: { paths: read.map((p) => p.path) },
    probe: async (url) => ({ status: (await site.fetch(url)).status }),
    demoRoutes
  })
  return found.map((f) => withTarget(f, read, base))
}

/** The item blocks of a write order with how many items each shows (`counts.shown`), against their store limits. */
export function itemCountsOf(order, blockStore) {
  const byId = new Map((blockStore?.blocks ?? []).map((b) => [b.id, b]))
  const out = []
  for (const page of order?.pages ?? [])
    for (const b of page.blocks ?? []) {
      const block = byId.get(b.block)
      if (!block || !itemKindOf(block) || b.state === 'hide') continue
      const items = b.counts?.shown ?? (b.items ?? []).length
      out.push({
        page: page.id,
        block: b.block,
        items,
        min: countOf(block, 'min'),
        max: countOf(block, 'max')
      })
    }
  return out
}

/** One variant: build, write, read every page and its links. */
async function variant(name, { build, site, base, demoRoutes, kit, shape }) {
  const built = await build({ shape })
  const w = await site.write(built)
  const blocks = itemCountsOf(built.order, kit.blockStore)
  if (w.report?.status !== 'done')
    return {
      status: 'failed',
      variant: name,
      write: { status: w.report?.status ?? 'stopped', code: w.report?.code ?? null },
      blocks
    }
  const pages = await site.pages(built, w.record)
  const read = await readPages(site, pages)
  const errors = read
    .filter((p) => p.status >= 500 || p.status === null)
    .map((p) => ({ pageType: p.pageType, path: p.path, status: p.status }))
  const broken = await linksOf(site, read, { base, demoRoutes })
  return {
    status: errors.length || broken.length ? 'failed' : 'passed',
    variant: name,
    pages: read.length,
    errors,
    broken,
    blocks,
    state: { built, record: w.record, pages }
  }
}

/** The hidden variant on the full site: hide each half, read, publish again; every page must answer again. */
async function hiddenVariant(full, { site, base, demoRoutes }) {
  const pages = full.state.pages
  const hideable = pages.filter((p) => !p.home && p.record?.id)
  const halves = [
    hideable.slice(0, Math.ceil(hideable.length / 2)),
    hideable.slice(Math.ceil(hideable.length / 2))
  ]
  const recorded = []
  for (const half of halves.filter((h) => h.length)) {
    for (const p of half) await site.hide(p.record)
    const read = await readPages(site, pages)
    for (const f of await linksOf(site, read, { base, demoRoutes }))
      recorded.push({ ...f, hidden: half.map((p) => p.pageType) })
    for (const p of half) await site.show(p.record)
  }
  const back = (await readPages(site, pages)).filter((p) => p.status >= 400 || p.status === null)
  return {
    status: back.length ? 'failed' : 'passed',
    variant: 'hidden',
    hidden: hideable.length,
    recorded,
    notBack: back.map((p) => ({ pageType: p.pageType, path: p.path, status: p.status }))
  }
}

const without = ({ state: _state, ...rest }) => rest

/**
 * @param {{build: (options: object) => Promise<object>, site: object, kit: {blockStore: object}, base: string,
 *   demoRoutes?: string[], log?: Function}} input `site`: as `writeSafety`, plus `hide(record)` and `show(record)`;
 *   the site starts blank (the full variant writes on it as it is)
 * @returns {Promise<{status: string, full: object, hidden: object, minimum: object}>}
 */
export async function structure({ build, site, kit, base, demoRoutes = [], log = () => {} }) {
  const ctx = { build, site, kit, base, demoRoutes }
  const full = await variant('full', { ...ctx, shape: 'max' })
  log('structure full: ' + full.status + ', ' + (full.broken?.length ?? 0) + ' broken link(s)')
  const hidden =
    full.state && site.hide && site.show
      ? await hiddenVariant(full, ctx)
      : { status: 'not_run', variant: 'hidden', reason: full.state ? 'no_hide_door' : 'full_not_written' }
  log('structure hidden: ' + hidden.status + ', ' + (hidden.recorded?.length ?? 0) + ' link(s) recorded')
  let minimum = { status: 'not_run', variant: 'minimum', reason: 'no_reset_hook' }
  if (typeof site.reset === 'function') {
    await site.reset()
    minimum = await variant('minimum', { ...ctx, shape: 'min' })
  }
  log('structure minimum: ' + minimum.status + ', ' + (minimum.broken?.length ?? 0) + ' broken link(s)')
  // The hidden variant is recorded only (decision 3): the full and minimum variants decide.
  const parts = [full, minimum]
  const status = parts.some((p) => p.status === 'failed')
    ? 'failed'
    : parts.some((p) => p.status !== 'passed')
      ? 'incomplete'
      : 'passed'
  return { status, full: without(full), hidden, minimum: without(minimum) }
}
