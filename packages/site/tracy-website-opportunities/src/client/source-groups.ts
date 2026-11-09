/**
 * The research card's two groups of sources: the ones a link the owner pasted feeds (Add a business by its links),
 * listed first, then the ones research looked at by itself. Display only: the research is the same either way.
 */
import type { SourceInput } from './status.ts'

export interface SourceGroups {
  /** Sources a pasted link feeds, in the server's order. */
  pasted: SourceInput[]
  /** Sources research found by itself, in the server's order. */
  found: SourceInput[]
}

/** The link the owner pasted for this source (the server's `pastedLink`), when it is an http(s) address. */
export function pastedLinkOf(source: SourceInput): string | null {
  const link = source.pastedLink
  return typeof link === 'string' && /^https?:\/\//i.test(link) ? link : null
}

export function sourceGroups(sources: readonly SourceInput[]): SourceGroups {
  const pasted: SourceInput[] = []
  const found: SourceInput[] = []
  for (const s of sources) (pastedLinkOf(s) === null ? found : pasted).push(s)
  return { pasted, found }
}
