/**
 * The Business brief section of Details (#517): every fact the brief states as one table row, in the words a seller uses.
 * Label (the field in plain words), value (what the site would say), where it came from ("From Google and the
 * website", "You entered this", "Tracy worked this out") and whether the site says it, with the reason in plain words
 * when it does not. Read from the same facts and decisions as the switches (`profile-facts-model.ts`); nothing is
 * decided here.
 */
import { type Confidence, FIELD_KEYS, factRowsView, reasonKeys, spelledField } from './profile-facts-model.ts'
import type { Translate } from './strings.ts'

export interface BriefRow {
  id: string
  /** The profile field the fact states (`phone`, `address`…), for the seller's edit of it (#524). */
  field: string | null
  /** The field in plain words (`Opening hours`), never its code. */
  label: string
  /** What the fact says; empty when the profile holds no readable value for it. */
  value: string
  /** Where it came from, one plain sentence. */
  source: string
  onSite: boolean
  /** The person switched it on or off themselves. */
  ownerChoice: boolean
  /** Why the rule leaves it off the site, or that it was worked out and kept, in plain sentences. */
  notes: string[]
  /** The string keys of `notes` (`facts.reason.<code>`), so a view can say them its own way (`brief-steps-model.ts`). */
  noteKeys?: string[]
  /** A row shown for reference only: no switch and no edit (the website, which no door edits). */
  readOnly?: boolean
}

/**
 * The table lists the facts in the Profile's order: the name first, then the address, the rating, the phones, the
 * hours, the website, the description and what research read (services, who it is for, team). Facts the Profile
 * does not show follow in the server's order.
 */
export const BRIEF_ROW_ORDER: readonly string[] = Object.freeze([
  'name',
  'branch',
  'address',
  'googleRating',
  'phone',
  'otherPhones',
  'whatsapp',
  'hours',
  'website',
  'bio',
  'story',
  'services',
  'audience',
  'team'
])

/** The rows in the Profile's order (`BRIEF_ROW_ORDER`); a stable sort, so equal fields keep the server's order. */
export function orderBriefRows(rows: readonly BriefRow[]): BriefRow[] {
  const rank = (row: BriefRow): number => {
    const i = row.field === null ? -1 : BRIEF_ROW_ORDER.indexOf(row.field)
    return i === -1 ? BRIEF_ROW_ORDER.length : i
  }
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => rank(a.row) - rank(b.row) || a.i - b.i)
    .map((x) => x.row)
}

/**
 * The website of the place as a read-only row, when the brief states none itself: the Key facts block that showed it
 * is gone, and no door edits it (`PUT …/:id/profile` takes phone, address, email and description only).
 */
export function websiteRow(rows: readonly BriefRow[], website: string | null, t: Translate): BriefRow | null {
  if (rows.some((row) => row.field === 'website')) return null
  return {
    id: 'website',
    field: 'website',
    label: t('field.website'),
    value: website ?? t('cell.website.none'),
    source: website === null ? '' : t('brief.source.research'),
    onSite: website !== null,
    ownerChoice: false,
    notes: [],
    readOnly: true
  }
}

/** Source kinds a seller recognises, in the order a note names them; any other kind is left out of the note. */
const NAMED: ReadonlyArray<[string, string]> = [
  ['google', 'brief.source.google'],
  ['google-places', 'brief.source.google'],
  ['google-reviews', 'brief.source.google'],
  ['facebook', 'brief.source.facebook'],
  ['instagram', 'brief.source.instagram'],
  ['tiktok', 'brief.source.tiktok'],
  ['youtube', 'brief.source.youtube'],
  ['tripadvisor', 'brief.source.tripadvisor'],
  ['osm', 'brief.source.osm'],
  ['website', 'brief.source.website'],
  ['logo', 'brief.source.logo']
]
/** The kind the person's own edits carry (`account-overlay` in the place profile). */
const YOU = 'account-overlay'

function listed(items: string[], locale?: string): string {
  try {
    return new Intl.ListFormat(locale ?? 'en', { type: 'conjunction' }).format(items)
  } catch {
    return items.join(', ')
  }
}

/** One plain sentence on where a fact came from. */
export function sourceNote(
  kinds: readonly string[],
  confidence: Confidence,
  t: Translate,
  locale?: string
): string {
  if (kinds.includes(YOU)) return t('brief.source.you')
  if (confidence === 'inferred') return t('brief.source.inferred')
  const keys: string[] = []
  for (const [kind, key] of NAMED) if (kinds.includes(kind) && !keys.includes(key)) keys.push(key)
  if (keys.length === 0) return t('brief.source.research')
  return t('brief.source.from', {
    list: listed(
      keys.map((key) => t(key)),
      locale
    )
  })
}

/** The field in plain words: its string when it has one, else its code spelled out (`deliveryZones` → Delivery zones). */
export function fieldLabel(field: string | null, t: Translate, statistic: string | null = null): string {
  if (field === null) return t('brief.field.other')
  // Google's rating and its review count are two facts of one field: the count is its own row.
  if (field === 'googleRating' && statistic === 'reviewCount') return t('field.reviews')
  return (FIELD_KEYS as readonly string[]).includes(field) || field === 'googleRating'
    ? t(`field.${field}`)
    : spelledField(field)
}

/** The table's rows in the server's order; empty when the brief states no fact yet. */
export function businessBriefRows(
  profile: unknown,
  decisions: unknown,
  t: Translate,
  locale?: string
): BriefRow[] {
  return (factRowsView(profile, decisions) ?? []).map((row) => ({
    id: row.id,
    field: row.field,
    label: fieldLabel(row.field, t, row.statistic),
    value: row.label,
    source: sourceNote(row.sources, row.confidence, t, locale),
    onSite: row.onSite,
    ownerChoice: row.decidedBy === 'owner',
    notes: reasonKeys(row).map((key) => t(key)),
    noteKeys: reasonKeys(row)
  }))
}

/** The fields the collapsed Business brief shows under Site name, in this order (layout B, spec #512). */
export const BRIEF_SUMMARY_FIELDS: readonly string[] = Object.freeze(['name', 'bio', 'services', 'team'])

/**
 * The rows of the collapsed Business brief: the first row of each summary field the brief states, in that order; when
 * it states none of them, its first rows instead, so a collapsed brief is never empty while the full table is not.
 */
export function briefSummaryRows(rows: readonly BriefRow[], fallback = 4): BriefRow[] {
  // One row per field: a field the brief states several times (three services) shows its first.
  const picked = BRIEF_SUMMARY_FIELDS.flatMap((field) => {
    const row = rows.find((r) => r.field === field)
    return row === undefined ? [] : [row]
  })
  return picked.length > 0 ? picked : rows.slice(0, fallback)
}
