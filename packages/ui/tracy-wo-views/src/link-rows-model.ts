/**
 * The link rows of "add a business by its links", without React (`link-rows.tsx` draws them). Shared by the
 * Find box of Website Opportunities and by Build it from my business in Add site.
 *
 * Every status and reason comes from the shared classifier (`website-opportunities/domain/link-kinds.mjs`),
 * which the server runs too; this file only maps rows to it and back.
 */
import { MAX_LINKS, judgeLinks, splitPasted } from 'website-opportunities/domain/link-kinds.mjs'

export { MAX_LINKS }

/** Rows shown ready before anything is typed. */
export const READY_ROWS = 3

/** How a row is read, grouped the way the copy names it. */
export type LinkGroup = 'google' | 'listing' | 'social' | 'website'

/** A client reason (`judgeLinks`) or a server one (`unresolvable`, `blocked`). */
export type LinkReason =
  | 'invalid'
  | 'not-public'
  | 'duplicate'
  | 'limit'
  | 'one-google'
  | 'one-website'
  | 'unresolvable'
  | 'blocked'

/** One link as the server reports it in `links` (2xx, 409 and 422 answers). */
export type LinkReadStatus = 'pending' | 'read' | 'could-not-read'
export type LinkReadReason = 'not-configured' | 'unresolved' | 'fetch-failed' | 'blocked'
export interface LinkReadOutcome {
  readStatus?: LinkReadStatus
  readReason?: LinkReadReason
  counts?: { photos: number; reviews: number; contacts: number }
  primary?: boolean
}

export interface ServerLink extends LinkReadOutcome {
  url?: string
  kind?: string
  source?: string
  used?: boolean
  reason?: string
}

/** What one row shows. Null for an empty row. */
export interface RowView extends LinkReadOutcome {
  kind: string | null
  group: LinkGroup | null
  source?: string
  used: boolean
  reason?: LinkReason
}

const SOCIAL_KINDS = new Set(['facebook', 'instagram', 'tiktok', 'youtube'])
const REASONS = new Set<string>([
  'invalid',
  'not-public',
  'duplicate',
  'limit',
  'one-google',
  'one-website',
  'unresolvable',
  'blocked'
])

/** The group a link kind is named by. */
export function groupOf(kind: string | null | undefined): LinkGroup | null {
  if (kind === 'google' || kind === 'listing' || kind === 'website') return kind
  return kind && SOCIAL_KINDS.has(kind) ? 'social' : null
}

/** Rows holding these links, padded to the ready rows. */
export function rowsOf(links: readonly string[] = []): string[] {
  const rows = [...links]
  while (rows.length < READY_ROWS) rows.push('')
  return rows
}

/** The links a request sends: the filled rows, trimmed, in order. */
export function linksOf(rows: readonly string[]): string[] {
  return rows.map((row) => row.trim()).filter(Boolean)
}

/**
 * Pasted text with several links, spread into rows from row `index` (which it replaces): one link per row, the
 * other filled rows kept in order, empty rows dropped and the ready rows padded back. The words pasted next to the
 * links come back as `name`. Null when the text holds fewer than two links (a plain paste).
 */
export function spreadPaste(
  rows: readonly string[],
  index: number,
  text: string
): { rows: string[]; name: string } | null {
  const pasted = splitPasted(text)
  if (pasted.links.length < 2) return null
  const before = rows.slice(0, Math.max(0, index))
  const after = rows.slice(index + 1)
  return { rows: rowsOf(linksOf([...before, ...pasted.links, ...after])), name: pasted.words }
}

/** One more empty row, up to `MAX_LINKS` rows. */
export function addRow(rows: readonly string[]): string[] {
  return rows.length >= MAX_LINKS ? [...rows] : [...rows, '']
}

/** The x of a row: an extra row goes away, one of the ready rows is emptied. */
export function removeRow(rows: readonly string[], index: number): string[] {
  if (rows.length > READY_ROWS) return rows.filter((_, i) => i !== index)
  return rows.map((row, i) => (i === index ? '' : row))
}

/** Whether the x of a row is shown: hidden on an empty row among the ready rows. */
export function removable(rows: readonly string[], index: number): boolean {
  return rows[index]?.trim() !== '' || rows.length > READY_ROWS
}

/**
 * Each row judged as the create doors judge it. `server`, the `links` of the last answer for these same rows, wins
 * where it differs: it knows what the client cannot (a Google link it could not resolve, a blocked host).
 */
export function judgeRows(
  rows: readonly string[],
  server: readonly ServerLink[] = []
): Array<RowView | null> {
  const judged = judgeLinks(linksOf(rows))
  let at = 0
  return rows.map((row) => {
    if (row.trim() === '') return null
    const mine = judged[at]
    const theirs = server[at]
    at += 1
    const view: RowView = { kind: mine.kind, group: groupOf(mine.kind), used: mine.used }
    if (mine.source) view.source = mine.source
    if (mine.reason) view.reason = mine.reason
    if (theirs && typeof theirs.used === 'boolean' && theirs.used !== mine.used) view.used = theirs.used
    if (theirs?.reason && REASONS.has(theirs.reason) && theirs.reason !== mine.reason) {
      view.reason = theirs.reason as LinkReason
      view.used = false
    }
    if (theirs?.readStatus) {
      view.readStatus = theirs.readStatus
      view.readReason = theirs.readReason
      view.counts = theirs.counts
      view.primary = theirs.primary
    }
    return view
  })
}

/** The counts the summary line is said with. */
export interface RowsSummary {
  filled: number
  used: number
  leftOut: number
  twice: number
}

export function summaryOf(views: ReadonlyArray<RowView | null>): RowsSummary {
  const filled = views.filter((view) => view !== null) as RowView[]
  const used = filled.filter((view) => view.used).length
  const twice = filled.filter((view) => !view.used && view.reason === 'duplicate').length
  return { filled: filled.length, used, leftOut: filled.length - used - twice, twice }
}

/** Display names of the used links' sources, in order and once each: `Google`, `Instagram`, `magicpin`, `website`. */
const KIND_NAMES: Readonly<Record<string, string>> = {
  google: 'Google',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  website: 'website'
}

export function sourceNames(rows: readonly string[]): string[] {
  const names: string[] = []
  for (const link of judgeLinks(linksOf(rows))) {
    if (!link.used || !link.kind) continue
    const name = link.kind === 'listing' ? (link.source ?? '') : (KIND_NAMES[link.kind] ?? '')
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}

/** A link the server took no facts from, with the reason it gives (a `reason.*` key of `LinkRowsKey`). */
export interface LeftOutLink {
  url: string
  reason: string
}

/**
 * The links a successful add left out (the server's `links` with `used: false`), to say after the rows are gone: a
 * Google link Google could not read was otherwise never reported (local stand 26/10/2026). A link pasted twice is
 * used once, so it is not left out.
 */
export function leftOutOf(links: readonly ServerLink[] | undefined): LeftOutLink[] {
  if (!Array.isArray(links)) return []
  return links
    .filter((link) => link?.used === false && typeof link.url === 'string' && link.reason !== 'duplicate')
    .map((link) => ({ url: link.url as string, reason: link.reason ?? 'invalid' }))
}
