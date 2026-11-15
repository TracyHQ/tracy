// The structure measurement of the release gate (ticket #586, ADR 0045 section 3): does the built site hold together
// at its most items, at its least, and once pages are taken away after the build?
//   full     the marker build at every block's most items (`structure-items.mjs` checks it is): every planned page
//            answers as planned, and no link is broken (`linkCheck` of the rendered scan, with the pages the plan has,
//            an HTTP probe and the template's demo routes)
//   minimum  on a fresh site, the build at every block's least items (at least one): the same checks
//   hidden   on the full site, the pages hidden in two halves, each half read: a link on a page still shown that leads
//            to a hidden page is broken; then every page is published again and must answer again
// All three decide the status. The plugin has no door that deletes a page, so a deleted page is measured as a hidden
// one: the site answers it as missing (404) and its menu item leaves the menus, as a deletion would; what a deletion
// does beyond that (the record gone from the database, its address free for another page) is not measured. Without a
// way to reset the site the minimum variant is `not_run`; without the hide doors the hidden one is `incomplete`. The
// site and the build are injected (`write-safety.mjs` has the same site). Pure but for them.
import { foldPath, linkCheck } from '../rendered-scan/links.mjs'
import { itemCountsOf, unexplainedItems } from './structure-items.mjs'

export { itemCountsOf } from './structure-items.mjs'

/** Read every page, keeping the status it is planned to answer (200, or the 404 of the missing page). */
async function readPages(site, pages) {
  const read = []
  for (const p of pages) {
    const answer = await site.fetch(p.url)
    read.push({
      ...p,
      expected: p.expected ?? p.status ?? 200,
      status: answer.status,
      html: answer.html ?? ''
    })
  }
  return read
}

/** The pages that did not answer as planned: no answer (0), an error, or another status. */
const errorsOf = (read, expected = (p) => p.expected) =>
  read
    .filter((p) => p.status !== expected(p))
    .map((p) => ({ pageType: p.pageType, path: p.path, status: p.status, expected: expected(p) }))

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

/** The links of the pages that answered, each with the page type it lands on. */
async function linksOf(site, read, { base, demoRoutes }) {
  const found = await linkCheck({
    pages: read.filter((p) => p.status > 0 && p.status < 400),
    base,
    expected: { paths: read.map((p) => p.path) },
    probe: async (url) => ({ status: (await site.fetch(url)).status }),
    demoRoutes
  })
  return found.map((f) => withTarget(f, read, base))
}

/**
 * One variant once written: read every page and its links. `written` is the write of `built` on the site (`{report,
 * record}`); the release gate gives the marker test's own write as the full variant.
 */
export async function readVariant(name, { site, base, demoRoutes = [], kit }, { built, written: w }) {
  const blocks = itemCountsOf(built, kit, name === 'minimum' ? 'min' : 'max')
  if (w.report?.status !== 'done')
    return {
      status: 'incomplete',
      variant: name,
      reason: 'write_stopped',
      write: { status: w.report?.status ?? 'stopped', code: w.report?.code ?? null },
      blocks
    }
  const pages = await site.pages(built, w.record)
  const read = await readPages(site, pages)
  const errors = errorsOf(read)
  const broken = read.length ? await linksOf(site, read, { base, demoRoutes }) : []
  const items = unexplainedItems(blocks)
  const why = !read.length ? 'no_pages' : items.length ? 'items_not_at_shape' : null
  return {
    status: errors.length || broken.length ? 'failed' : why ? 'incomplete' : 'passed',
    variant: name,
    ...(why ? { reason: why } : {}),
    pages: read.length,
    errors,
    broken,
    blocks,
    ...(items.length ? { items } : {}),
    state: { built, record: w.record, pages }
  }
}

/** One variant: build, write, read every page and its links. */
export async function variant(name, ctx) {
  const built = await ctx.build({ shape: ctx.shape })
  return readVariant(name, ctx, { built, written: await ctx.site.write(built) })
}

/**
 * The hidden variant on the full site: hide each half and read; a link on a still shown page that leads to a hidden
 * page is broken. Every page must answer again once published; a hide or show door that fails leaves it incomplete.
 */
export async function hiddenVariant(full, { site, base, demoRoutes }) {
  if (!full.state) return { status: 'incomplete', variant: 'hidden', reason: 'full_not_written' }
  if (!site.hide || !site.show) return { status: 'incomplete', variant: 'hidden', reason: 'no_hide_door' }
  const pages = full.state.pages
  const hideable = pages.filter((p) => !p.home && p.record?.id)
  const half = Math.ceil(hideable.length / 2)
  const broken = []
  try {
    for (const part of [hideable.slice(0, half), hideable.slice(half)].filter((h) => h.length)) {
      for (const p of part) await site.hide(p.record)
      const gone = new Set(part.map((p) => p.url))
      const read = await readPages(site, pages)
      const shown = read.map((p) => (gone.has(p.url) ? { ...p, status: 0 } : p))
      for (const f of await linksOf(site, shown, { base, demoRoutes }))
        broken.push({ ...f, hidden: part.map((p) => p.pageType) })
      for (const p of part) await site.show(p.record)
    }
  } catch (error) {
    return {
      status: 'incomplete',
      variant: 'hidden',
      reason: 'hide_door_failed',
      message: String(error?.message ?? error).slice(0, 200),
      broken
    }
  }
  const notBack = errorsOf(await readPages(site, pages))
  const status = broken.length ? 'failed' : notBack.length ? 'incomplete' : 'passed'
  return {
    status,
    variant: 'hidden',
    ...(status === 'incomplete' ? { reason: 'pages_not_back' } : {}),
    hidden: hideable.length,
    broken,
    notBack
  }
}

/** A variant as the record keeps it: without the build and the site state it carried for the next variant. */
export const without = ({ state: _state, ...rest }) => rest

/** The status of the measurement: every variant decides; failed beats incomplete. */
export function structureStatusOf(...variants) {
  if (variants.some((p) => p?.status === 'failed')) return 'failed'
  return variants.every((p) => p?.status === 'passed') ? 'passed' : 'incomplete'
}

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
  const hidden = await hiddenVariant(full, ctx)
  log('structure hidden: ' + hidden.status + ', ' + (hidden.broken?.length ?? 0) + ' broken link(s)')
  let minimum = { status: 'not_run', variant: 'minimum', reason: 'no_reset_hook' }
  if (typeof site.reset === 'function') {
    await site.reset()
    minimum = await variant('minimum', { ...ctx, shape: 'min' })
  }
  log('structure minimum: ' + minimum.status + ', ' + (minimum.broken?.length ?? 0) + ' broken link(s)')
  return {
    status: structureStatusOf(full, minimum, hidden),
    full: without(full),
    hidden,
    minimum: without(minimum)
  }
}
