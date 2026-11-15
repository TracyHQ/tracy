// The structure measurement of the release gate (ticket #586, ADR 0045 section 3): does the built site hold together
// at its most items, at its least, and once pages are taken away after the build?
//   full     the marker build at every block's most items (`structure-items.mjs` checks it is): every planned page
//            answers as planned, and no link is broken (`linkCheck` of the rendered scan, with the pages the plan has,
//            an HTTP probe and the template's demo routes; a link it finds no planned path for is judged by the page it
//            reaches, through the adapter's page identity, `structure-read.mjs`)
//   minimum  on a fresh site, the build at every block's least items (at least one): the same checks
//   hidden   on the full site, the pages hidden in two halves, each half read: each hidden page must answer as missing,
//            every other page as planned, then a link on a page still shown that leads to a hidden page is broken; then every page is published
//            again and must answer again (`structure-hidden.mjs`)
// All three decide the status. The plugin has no door that deletes a page, so a deleted page is measured as a hidden
// one: the site answers it as missing (404) and its menu item leaves the menus, as a deletion would; what a deletion
// does beyond that (the record gone from the database, its address free for another page) is not measured. Without a
// way to reset the site the minimum variant is `not_run`; without the hide doors the hidden one is `incomplete`. The
// site and the build are injected (`write-safety.mjs` has the same site). Pure but for them.
import { hiddenVariant } from './structure-hidden.mjs'
import { errorsOf, linksOf, readPages } from './structure-read.mjs'
import { itemCountsOf, unexplainedItems } from './structure-items.mjs'

export { itemCountsOf } from './structure-items.mjs'
export { hiddenVariant } from './structure-hidden.mjs'

/**
 * One variant once written: read every page and its links. `written` is the write of `built` on the site (`{report,
 * record}`); the release gate gives the marker test's own write as the full variant.
 */
export async function readVariant(
  name,
  { site, base, demoRoutes = [], kit, identify = null },
  { built, written: w }
) {
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
  const links = read.length
    ? await linksOf(site, read, { base, demoRoutes, identify })
    : { broken: [], unplanned: [], probes: 0 }
  const broken = links.broken
  const items = unexplainedItems(blocks)
  const why = !read.length
    ? 'no_pages'
    : links.capped
      ? 'link_probe_cap'
      : items.length
        ? 'items_not_at_shape'
        : null
  const status = errors.length || broken.length ? 'failed' : why ? 'incomplete' : 'passed'
  return {
    status,
    variant: name,
    // The reason is why the variant did not finish: a failed one names its errors and links, and its items apart.
    ...(why && status === 'incomplete' ? { reason: why } : {}),
    pages: read.length,
    probes: links.probes,
    errors,
    broken,
    ...(links.unplanned?.length ? { unplanned: links.unplanned } : {}),
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
export async function structure({
  build,
  site,
  kit,
  base,
  demoRoutes = [],
  identify = null,
  log = () => {}
}) {
  const ctx = { build, site, kit, base, demoRoutes, identify }
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
