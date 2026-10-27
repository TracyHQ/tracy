/**
 * Which parts of the Find box show in each mode. Links mode adds one business by its links, so the area search's
 * form, its results (and their "Searching…" spinner) and its selection bar stay out of it: a spinner under the links
 * form read as the links being searched (local stand 26/10/2026).
 */
import type { FindMode } from '@tracy/wo-views/link-rows'

export interface FindParts {
  /** The link rows and their button. */
  linksForm: boolean
  /** The search field, its notes and the advanced panel. */
  searchForm: boolean
  /** The area search's results and the bar that sends the picked rows. */
  results: boolean
}

/** The public Find has no links mode: it always searches. */
export function findParts(mode: FindMode, isPublic: boolean): FindParts {
  const links = mode === 'links' && !isPublic
  return { linksForm: links, searchForm: !links, results: !links }
}
