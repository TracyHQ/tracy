/**
 * The Sources of a place before its research has any row (spec #512, layout C): the links the owner pasted when they
 * added it (Add a business by its links), one row each, and the Google listing when the place was picked from a
 * search. Each reads Not collected yet until research runs. The links come from the place's saved candidate in the
 * Details answer (`opportunity.candidate.pastedLinks`), read the way the server reads them for its own source rows
 * (`link-fields.js pastedLinksOf`): an older candidate without that list gives its listings and, when a link was its
 * identity, its website and social pages.
 * Pure: no DOM, no fetch.
 */
import type { SourceInput } from './status.ts'

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const isUrl = (v: unknown): v is string => typeof v === 'string' && /^https?:\/\//i.test(v)

/** The pasted links of a saved opportunity, by the research source each feeds: the first link per source. */
export function pastedLinksOf(opportunity: unknown): Array<{ source: string; url: string }> {
  const opp = isRec(opportunity) ? opportunity : {}
  const candidate = isRec(opp.candidate) ? opp.candidate : {}
  const out: Array<{ source: string; url: string }> = []
  const add = (source: unknown, url: unknown): void => {
    if (typeof source !== 'string' || source === '' || !isUrl(url)) return
    if (source !== 'listing' && out.some((l) => l.source === source)) return
    if (out.some((l) => l.url === url)) return
    out.push({ source, url })
  }
  if (Array.isArray(candidate.pastedLinks)) {
    for (const l of candidate.pastedLinks) if (isRec(l)) add(l.source, l.url)
    return out
  }
  for (const l of Array.isArray(candidate.listings) ? candidate.listings : [])
    if (isRec(l)) add('listing', l.url)
  if (opp.provider === 'url') {
    add('website', candidate.website)
    if (isRec(candidate.socials))
      for (const [source, url] of Object.entries(candidate.socials)) add(source, url)
  }
  return out
}

/**
 * The source rows to draw: research's own rows once it has any, else one row per pasted link (Google first when the
 * place came from a search and no Google link was pasted).
 */
export function sourcesToShow(sources: readonly SourceInput[], opportunity: unknown): SourceInput[] {
  const opp = isRec(opportunity) ? opportunity : {}
  // A listing link the seller added before research (#537) gets its own row at once: the pasted links that no row
  // covers yet still show, Not collected yet, beside it.
  const covered = new Set(sources.map((s) => s.source))
  const pasted = pastedLinksOf(opp).filter((l) => !covered.has(l.source))
  const rows: SourceInput[] = pasted.map((l) => ({
    source: l.source,
    ref: l.url,
    pastedLink: l.url,
    status: null
  }))
  const researched = sources.some((s) => s.source !== 'listing')
  // Once research has rows, they are the links: shown as they are.
  if (researched) return [...sources]
  const searched =
    opp.provider === 'google-places' &&
    !covered.has('google-places') &&
    !pasted.some((l) => l.source === 'google-places')
  return [
    ...(searched ? [{ source: 'google-places', status: null, fromSearch: true }] : []),
    ...rows,
    ...sources
  ]
}
