// The quality phase of the release gate (ticket #586): the site check's page groups on the marker site, asked for at
// the addresses the host reads as they are (`qualityPath`, from the adapter: a Joomla address `index.php?...` goes as
// `index.php/?...`, which the host does not prefix again), each page's key read from the marker test's renders at that
// same address, so a failure the host reports finds its page key; the SEO items of the renders, with the system pages
// (their page type `system-*`) compared with the untouched template. On a marker write that did not finish the
// measurement is read but never more than `incomplete` (`write_stopped`, with the stop code): what a half-written
// site shows says nothing about the template. Pure but for the injected parts.
import { pageKeysOf, qualityOf } from './quality.mjs'
import { faviconsOf, seoOf } from './quality-seo.mjs'

const asIs = (p) => '/' + String(p ?? '').replace(/^\/+/, '')

/** The system pages of a set of renders: the pages the template titles itself. */
export const systemPathsOf = (renders) => [
  ...new Set((renders ?? []).filter((r) => String(r.pageType ?? '').startsWith('system-')).map((r) => r.path))
]

/** The addresses the quality groups are asked at, each once. */
export const qualityPathsOf = (pages, qualityPath = asIs) => [
  ...new Set((pages ?? []).map((p) => qualityPath(p.path)))
]

/**
 * @param {{input: object, marker: object | null, state: object, site: object, control: object | null}} parts
 *   `input.quality(paths)`, `input.pageKey(html)`, `input.qualityPath(path)`, `input.baseline`
 */
export async function qualityPhase({ input, marker, state, site, control }) {
  if (!marker?.renders) return { status: 'incomplete', reason: 'marker_test_not_rendered' }
  const qualityPath = input.qualityPath ?? asIs
  const favicons = new Map()
  for (const url of faviconsOf(marker.renders, site.origin)) favicons.set(url, (await site.fetch(url)).status)
  const seo = seoOf(marker.renders, { origin: site.origin, favicons })
  const systemPages = systemPathsOf(marker.renders)
  if (!input.quality) return { ...qualityOf({ marker: { groups: [] }, seo }), reason: 'no_page_reader' }
  const measured = await input.quality(qualityPathsOf(state.pages, qualityPath))
  const pageKeys = input.pageKey ? pageKeysOf(marker.renders, input.pageKey, qualityPath) : undefined
  const result = qualityOf({
    marker: { ...measured, ...(pageKeys ? { pageKeys } : {}) },
    control,
    baseline: input.baseline ?? null,
    seo,
    systemPages
  })
  const report = state.real?.report
  if (report?.status === 'done') return result
  return {
    ...result,
    status: 'incomplete',
    reason: 'write_stopped',
    write: { status: report?.status ?? 'stopped', code: report?.code ?? null },
    measuredStatus: result.status
  }
}
