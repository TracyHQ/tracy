// The demo scan of rendered pages (ticket #585, part of the release gate of spec #576), used by the release gate and by
// the built site check (`scripts/built-site-check/part-one.mjs`). It catches demo words and demo pictures wherever a
// page prints them, inside or outside the mapping, from a corpus of the template version's demo content
// (`rendered-scan/corpus.mjs`). Nothing here names a template: the corpus comes from the kit and the files released
// beside it. Matching rules: `rendered-scan/match.mjs`; the link check: `rendered-scan/links.mjs`.
import { demoCorpus } from './rendered-scan/corpus.mjs'
import { findingsOf } from './rendered-scan/match.mjs'
import { observationsFromHtml } from './rendered-scan/observations.mjs'
import { releasedSourcesOf } from './rendered-scan/released-sources.mjs'

export { demoCorpus } from './rendered-scan/corpus.mjs'
export { linkCheck } from './rendered-scan/links.mjs'
export { observationsFromHtml } from './rendered-scan/observations.mjs'

const SOURCE_KEYS = [
  'demoBaseline',
  'contentMap',
  'fixedTexts',
  'companyNames',
  'sqlLiterals',
  'mediaFiles',
  'interfaceTexts'
]

/**
 * The corpus sources for a kit: the released files of its template version (`released-sources.mjs`), each replaced
 * by the kit's own when the caller put one on it (`kit.demoBaseline`, `kit.demoContentMap`, `kit.fixedTexts`, ...).
 */
export function corpusInputOf(kit, { released = releasedSourcesOf } = {}) {
  const input = { kit, ...(kit ? released(kit) : {}) }
  for (const key of SOURCE_KEYS) {
    const own = key === 'contentMap' ? kit?.demoContentMap : kit?.[key]
    if (own) input[key] = own
  }
  return input
}

/** Thrown when the corpus has no demo source: zero findings from an empty corpus would read as a pass. */
export class DemoCorpusEmpty extends Error {
  constructor() {
    super('the demo corpus has no demo source: pass a demo baseline or the released content map')
    this.code = 'demo_corpus_empty'
  }
}

/**
 * The demo words and pictures of rendered pages.
 * @param {{pages: Array<{path: string, url?: string, status?: number, html?: string, observations?: object[]}>,
 *   kit?: object, corpus?: object, shaOf?: ((url: string) => Promise<string | null>) | null}} input A page with
 *   `observations` (a browser's own read, `{kind, value, place, visible?, sha256?}`) is not parsed again. `corpus`:
 *   one built with `demoCorpus`, else built from the kit (`corpusInputOf`).
 * @returns {Promise<Array<{kind: 'demo_text' | 'demo_image', page: string, place: object, excerpt: string}>>}
 */
export async function demoScan({ pages, kit = null, corpus = null, shaOf = null }) {
  const c = corpus ?? demoCorpus(corpusInputOf(kit))
  if (!c.sources?.demo) throw new DemoCorpusEmpty()
  const out = []
  for (const page of Array.isArray(pages) ? pages : []) {
    const observations = Array.isArray(page?.observations)
      ? page.observations
      : typeof page?.html === 'string' && (page.status === undefined || page.status === 200)
        ? observationsFromHtml(page.html)
        : []
    out.push(...(await findingsOf(page.path ?? null, observations, c, shaOf)))
  }
  return out
}
