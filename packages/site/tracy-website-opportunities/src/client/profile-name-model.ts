/**
 * The "Name on the site" row of the Details Profile card, from `profile.nameCheck` (the server's decision,
 * `website-opportunities/src/business-name.js`): the name the site carries, whether a person should check it, and
 * what each source calls the business. While the brief holds the name off the site (its `name` fact is off, #1791), the
 * row says so, with the neutral identity the site goes by instead (`siteName` of `GET …/place-profile`) and why.
 * Nothing is decided here; the row only shows the server's decisions.
 */
type Rec = Record<string, unknown>

/** A source of a name: its key (`google`, `logo`, `instagram`, `listing`…) and, for a listing site, its name. */
export interface NameSourceView {
  key: string
  label: string | null
}
export interface NameLineView {
  name: string
  sources: NameSourceView[]
}
/** A business name held off the site: what the site goes by instead, who left it off and the rule's reasons. */
export interface HeldNameView {
  /** The neutral identity the site goes by instead; null when the brief made none. */
  siteName: string | null
  /** Who left it off: a rule of Tracy, or the owner on this card. */
  decidedBy: 'rule' | 'owner'
  /** Reason codes of the rule's decision. */
  reasons: string[]
}
export interface NameRowView {
  /** The name the site carries now. */
  name: string
  /** `check` while the sources disagree and nobody acted; `checked` once a name was picked or typed against them. */
  chip: 'check' | 'checked' | null
  /** What each source says, the name on the site first. */
  lines: NameLineView[]
  /** The other name the sources give, for "Use …"; null when there is none. */
  other: string | null
  /** The actions show without a press: the name still needs a check. */
  open: boolean
  /** Set while the name is held off the site: the row then says it is not on the site and what the site uses. */
  held: HeldNameView | null
}

const rec = (v: unknown): Rec => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** The order sources are named in a line: the business's own marks first, then Google, then listing sites. */
const SOURCE_ORDER = [
  'logo',
  'website',
  'instagram',
  'facebook',
  'tiktok',
  'youtube',
  'google',
  'osm',
  'listing'
]
const rank = (key: string): number => {
  const i = SOURCE_ORDER.indexOf(key)
  return i < 0 ? SOURCE_ORDER.length : i
}

/** A name compared by its letters and digits only, as the server compares them. */
export const nameKey = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^\p{L}\p{N}]+/gu, '')

/**
 * The held name, or null while the name is on the site: from the card's fact decisions (`decisions` of
 * `GET …/place-profile`, its `name` fact off) and the neutral identity the server names (`siteName`).
 */
export function heldNameOf(decisions: unknown, siteName: unknown): HeldNameView | null {
  const name = (Array.isArray(decisions) ? decisions : []).map(rec).find((d) => d.field === 'name')
  if (name === undefined || name.onSite !== false) return null
  return {
    siteName: text(siteName),
    decidedBy: name.decidedBy === 'owner' ? 'owner' : 'rule',
    reasons: (Array.isArray(name.reasons) ? name.reasons : []).flatMap((r) => {
      const code = text(r)
      return code === null ? [] : [code]
    })
  }
}

/** The row, or null when the profile carries no name decision (research from before, or none yet). */
export function nameRowView(profile: unknown, held: HeldNameView | null = null): NameRowView | null {
  const check = rec(rec(profile).nameCheck)
  const name = text(check.name)
  if (name === null) return null
  const lines: NameLineView[] = (Array.isArray(check.options) ? check.options : []).flatMap((o) => {
    const option = rec(o)
    const optionName = text(option.name)
    const sources = (Array.isArray(option.sources) ? option.sources : []).flatMap((s) => {
      const key = text(rec(s).source)
      return key === null ? [] : [{ key, label: text(rec(s).label) }]
    })
    sources.sort((a, b) => rank(a.key) - rank(b.key))
    return optionName === null || sources.length === 0 ? [] : [{ name: optionName, sources }]
  })
  const key = nameKey(name)
  const ordered = [
    ...lines.filter((l) => nameKey(l.name) === key),
    ...lines.filter((l) => nameKey(l.name) !== key)
  ]
  const state = check.state
  const disagree = check.disagree === true
  return {
    name,
    chip: state === 'check' ? 'check' : state === 'chosen' && disagree ? 'checked' : null,
    lines: ordered,
    other: ordered.find((l) => nameKey(l.name) !== key)?.name ?? null,
    open: state === 'check',
    held
  }
}

/** The name the page title and breadcrumb show: the name on the site, else the opportunity's own name. */
export function nameOnSite(profile: unknown, fallback: string | null | undefined): string {
  return text(rec(rec(profile).nameCheck).name) ?? fallback ?? ''
}
