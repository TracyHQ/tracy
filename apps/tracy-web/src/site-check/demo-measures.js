// The site check's layout measures on the UNTOUCHED demo of a quickstart (ticket #436): the very groups a built site gets
// (page-groups.js), run through `runSiteCheck` on the demo's pages at 1440 and 390 before a release, so a template layout
// fault shows before any customer site is built. No second implementation: the groups, the host's browser reads and the
// failure levels are the site check's own; this file only picks the groups and keeps their answer as a file.
//
//   main-heading   more than one main heading on a page (block); none is a warning
//   empty-frames   the host's no-empty-picture-slots and no-empty-boxes
//   text-overflow  text cut by its box, or running past the right edge of the screen (horizontal overflow)
//
// Nothing was written to the demo, so every block failure here is the template's (its layout or its demo content as the
// quickstart ships it). The groups that judge a write (demo words, demo links, plan links) do not run: on an untouched
// demo everything is demo content by definition. Orphan card rows and blank footer columns have no site check measure
// today; they join here when the site check gains one.
import { runSiteCheck } from './site-check.js'
import { PAGE_CHECK_GROUPS } from './page-groups.js'
import { WIDTHS } from './host-pages.js'

export const DEMO_MEASURES_VERSION = 'tracy-demo-measures/v1'

/** The site check groups run on the demo, by name, in the site check's own order. */
export const DEMO_MEASURE_NAMES = Object.freeze(['main-heading', 'empty-frames', 'text-overflow'])

export const DEMO_MEASURE_GROUPS = Object.freeze(
  DEMO_MEASURE_NAMES.map((name) => {
    const group = PAGE_CHECK_GROUPS.find((g) => g.name === name)
    if (!group) throw new Error(`The site check has no group ${name}`)
    return group
  })
)

/**
 * The site check reaches a site only through its door; an untouched demo needs none of it but the page list, which the
 * report hands in (`keptPages`). Any other read is refused, so a group that needed one is unmeasured, never green.
 */
const demoDoor = {
  async apply({ action, params }) {
    if (action === 'content.contract' && params?.operation === 'inspect') return { ok: true, pages: [] }
    return { ok: false, message: 'the untouched demo is read through the host only' }
  }
}

/** A failure as the file keeps it: what was seen and where, nothing of the site's address. */
const keptFailure = (f) => ({
  group: f.group,
  page: f.page ?? null,
  width: f.width ?? null,
  measured: f.measured ?? null,
  level: f.level,
  reason: f.reason ?? null,
  ...(f.selector ? { selector: f.selector } : {})
})

/**
 * Measure the untouched demo and answer the `demo-measures.json` document.
 * @param {{ host: (payload: object) => Promise<object>, pages: string[], quickstart: { slug: string, version: string },
 *   now?: () => number }} input `host` reads pages in a browser (`host-measure.js`, or the host's reader run locally);
 *   `pages` the demo's paths (the template kit's `pages[].path`)
 */
export async function measureDemo({ host, pages, quickstart, now = Date.now }) {
  const check = await runSiteCheck({
    door: demoDoor,
    report: { site: quickstart.slug, keptPages: pages.map((p) => ({ path: p })) },
    host,
    groups: [...DEMO_MEASURE_GROUPS],
    now,
    allGroups: true
  })
  return {
    schemaVersion: DEMO_MEASURES_VERSION,
    quickstart: { slug: quickstart.slug, version: quickstart.version },
    widths: [...WIDTHS],
    pages: [...pages],
    status: check.status,
    groups: check.groups.map((g) => ({
      name: g.name,
      status: g.status,
      checked: g.checked ?? 0,
      ...(g.reason ? { reason: g.reason } : {}),
      failures: (g.failures ?? []).map(keptFailure)
    }))
  }
}
