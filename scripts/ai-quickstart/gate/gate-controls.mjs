// The controls of the release gate command (ticket #586): the untouched human quickstart measured by the gate, in the
// same run by default (`--human-site`), or first on its own (`--control-only`) and read back (`--human-control`,
// `--quality-control`). The human control is the demo scan of its pages; the quality control the site check's page
// groups, each page's key (`adapters/joomla-page-key.mjs`) and the SEO items of its renders, so a regression is judged
// against the same kind of page and a system page's title against the untouched template's. A control file is the
// gate's own (`control-file.mjs`): any other JSON, another installer or another gate version is refused.
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { joomlaPageKey } from './adapters/joomla-page-key.mjs'
import { controlFileOf, readControlFile } from './control-file.mjs'
import { controlOf } from './demo-checks.mjs'
import { pageKeysOf } from './quality.mjs'
import { faviconsOf, seoOf } from './quality-seo.mjs'

/** The status a favicon address answers, 0 when it does not. */
const statusOf = async (url) => (await fetch(url).catch(() => null))?.status ?? 0

/**
 * Measure the untouched human quickstart at `base`.
 * @param {string} base
 * @param {{crawl: Function, render: Function, corpus: object, qualityOn: Function, platform: string, paths: Function}}
 *   deps `render(base, name, pages)` renders the pages; `paths(pages)` the page paths the site check reads, every page and
 *   the system pages, at the addresses `qualityPath` gives (the ones the pages are keyed by)
 * @returns {Promise<{human: object, quality: object}>}
 */
export async function measureControls(
  base,
  { crawl, render, corpus, qualityOn, platform, paths, qualityPath = undefined }
) {
  const pages = await crawl(base)
  const renders = await render(base, 'human', pages)
  const human = await controlOf(renders, corpus)
  const origin = new URL(base).origin
  const favicons = new Map()
  for (const url of faviconsOf(renders, origin)) favicons.set(url, await statusOf(url))
  const quality = {
    from: 'measured',
    ...(await qualityOn({ base, platform, pages: paths(pages) })),
    pageKeys: pageKeysOf(renders, joomlaPageKey, qualityPath),
    seo: seoOf(renders, { origin, favicons })
  }
  return { human, quality }
}

/** Write both controls as the gate's own files into `<out>/controls/`. */
export function writeControls(out, { human, quality }, humanQuickstartSha256) {
  for (const [kind, control] of [
    ['human', human],
    ['quality', quality]
  ])
    writeFileSync(
      path.join(out, 'controls', kind + '.json'),
      JSON.stringify(controlFileOf(kind, control, humanQuickstartSha256), null, 1)
    )
}

/**
 * Both controls read back from the gate's own files, each with its provenance; throws `control_unbound` on any other
 * file. A missing quality file is a control not run, never a pass.
 */
export function readControls({ humanFile, qualityFile, humanQuickstartSha256 }) {
  const read = (file, kind) => {
    if (!file) return null
    const { control, provenance } = readControlFile(file, { kind, humanQuickstartSha256 })
    return { ...control, provenance }
  }
  return {
    human: read(humanFile, 'human') ?? { status: 'not_run', findings: null },
    quality: read(qualityFile, 'quality')
  }
}
