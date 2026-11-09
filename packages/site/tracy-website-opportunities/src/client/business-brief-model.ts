/**
 * The Business brief tab of Details (#517): every fact the brief states as one table row, in the words a seller uses.
 * Label (the field in plain words), value (what the site would say), where it came from ("From Google and the
 * website", "You entered this", "Tracy worked this out") and whether the site says it, with the reason in plain words
 * when it does not. Read from the same facts and decisions as the switches (`profile-facts-model.ts`); nothing is
 * decided here.
 */
import { type Confidence, FIELD_KEYS, factRowsView, reasonKeys, spelledField } from './profile-facts-model.ts'
import type { Translate } from './strings.ts'

export interface BriefRow {
  id: string
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
export function fieldLabel(field: string | null, t: Translate): string {
  if (field === null) return t('brief.field.other')
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
    label: fieldLabel(row.field, t),
    value: row.label,
    source: sourceNote(row.sources, row.confidence, t, locale),
    onSite: row.onSite,
    ownerChoice: row.decidedBy === 'owner',
    notes: reasonKeys(row).map((key) => t(key))
  }))
}
