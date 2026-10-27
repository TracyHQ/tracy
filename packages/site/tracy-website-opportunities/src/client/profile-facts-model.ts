/**
 * The "What the site may say" rows of the Details Profile card (#1791): every fact the brief states, with how sure Tracy
 * is (corroborated, single source, inferred), whether the site says it, who decided that (a rule or the owner) and, for
 * a fact held back by rule, why. The facts come from the place profile document; the decisions from the server's
 * assessment (`factDecisions`, one `{factId, confidence, onSite, decidedBy, reasons}` per fact). Nothing is decided
 * here: a switch only asks the server to keep the owner's choice.
 */
type Rec = Record<string, unknown>

export const CONFIDENCES = ['corroborated', 'single-source', 'inferred'] as const
export type Confidence = (typeof CONFIDENCES)[number]

export interface FactRowView {
  id: string
  /** The server's field code (`hours`, `serviceAreas`, `story`...): what kind of fact this is. */
  field: string | null
  /** What the fact says, as the site would; empty when the profile holds no readable value for it. */
  label: string
  confidence: Confidence
  /** The site says it. */
  onSite: boolean
  /** Who decided: a rule of Tracy, or the owner on this card. */
  decidedBy: 'rule' | 'owner'
  /** Reason codes of the rule's decision. */
  reasons: string[]
  /**
   * The other names the business's own marks give (its logo, its social pages), each with the source kinds that give
   * it (`logo`, `instagram`): only on the name row held back because its own marks call it something else.
   */
  alsoCalled: OtherNameView[]
}

export interface OtherNameView {
  name: string
  sources: string[]
}

/** Field codes with a plain-words label in the strings (`field.<code>`); any other code is spelled out from its name. */
export const FIELD_KEYS = [
  'name',
  'hours',
  'phone',
  'otherPhones',
  'address',
  'serviceAreas',
  'services',
  'team',
  'socialFigures',
  'story',
  'audience',
  'website',
  'socials',
  'whatsapp',
  'contactChannels'
] as const
/** Value fields that read as the fact, first match wins. */
const LABEL_FIELDS = [
  'name',
  'label',
  'text',
  'formatted',
  'address',
  'number',
  'phone',
  'raw',
  'url'
] as const

const rec = (v: unknown): Rec => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

/** What a fact's value says in one line, or null when it has nothing readable (such a fact is not listed). */
export function factLabel(value: unknown): string | null {
  const plain = text(value)
  if (plain !== null) return plain
  if (Array.isArray(value)) {
    // Hours lines, service areas, other phones: one line, each readable entry in order.
    const parts = value.flatMap((item) => {
      const part = factLabel(item)
      return part === null ? [] : [part]
    })
    return parts.length === 0 ? null : parts.join('; ')
  }
  const v = rec(value)
  for (const field of LABEL_FIELDS) {
    const hit = text(v[field])
    if (hit === null) continue
    if (field === 'label' && typeof v.amount === 'number') {
      const unit = text(v.unit)
      return `${hit}: ${v.amount}${unit === null ? '' : ` ${unit}`}`
    }
    return hit
  }
  return null
}

/** Every `{id, value, evidenceRefs}` fact anywhere in the profile document, in document order. */
function walk(node: unknown, out: { id: string; value: unknown }[]): void {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, out)
    return
  }
  const n = node as Rec
  if (typeof n.id === 'string' && 'value' in n && Array.isArray(n.evidenceRefs)) {
    out.push({ id: n.id, value: n.value })
    return
  }
  for (const child of Object.values(n)) walk(child, out)
}

/** Decisions as the server sends them: a list of `{factId, ...}` or a map keyed by fact id. */
function decisionsOf(v: unknown): Map<string, Rec> {
  const out = new Map<string, Rec>()
  const entries: [string | null, unknown][] = Array.isArray(v)
    ? v.map((d) => [text(rec(d).factId), d])
    : Object.entries(rec(v)).map(([k, d]) => [k, d])
  for (const [id, d] of entries) if (id !== null) out.set(id, rec(d))
  return out
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const OWN_MARKS_CODE = 'name-differs-from-own-marks'

/**
 * The names the business's own marks give other than `held` (`own-marks.mjs` on the server keeps them as a conflict of
 * `business.name` whose reason starts with the code), each with the kinds of source its evidence cites, in order.
 */
export function otherNamesOf(profile: unknown, held: string): OtherNameView[] {
  const doc = rec(profile)
  const sourceOf = new Map(list(doc.sources).map((s) => [text(rec(s).id), text(rec(s).kind)]))
  const evidenceSource = new Map(list(doc.evidence).map((e) => [text(rec(e).id), text(rec(e).sourceId)]))
  const conflict = list(doc.conflicts)
    .map(rec)
    .find((c) => c.target === 'business.name' && String(c.reason ?? '').startsWith(`${OWN_MARKS_CODE}:`))
  if (conflict === undefined) return []
  return list(conflict.values).flatMap((v) => {
    const name = text(rec(v).value)
    if (name === null || name === held) return []
    const sources: string[] = []
    for (const ref of list(rec(v).evidenceRefs)) {
      const kind = sourceOf.get(evidenceSource.get(text(ref)) ?? null)
      if (kind && !sources.includes(kind)) sources.push(kind)
    }
    return [{ name, sources }]
  })
}

/** `serviceAreas` to `Service areas` for a field code the strings do not know. */
export function spelledField(field: string): string {
  const words = field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_:]+/g, ' ')
    .trim()
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The fact rows, or null when the profile or the decisions are missing or no fact can be listed. Every fact the
 * server decided (`decisions` is the list of facts the brief states) is listed, in the order it sent them, whichever
 * part of the profile holds its value (hours, service areas, story and audience lines, other phones included). A part
 * the brief does not state (phone number parts, follower stats) has no decision, so no switch. Two facts that read
 * the same (one link found on the website and again on the social profiles) stay two rows, each under its field
 * label: each has its own decision, and one control that moved two decisions would break the one-switch-one-fact rule.
 */
export function factRowsView(profile: unknown, decisions: unknown): FactRowView[] | null {
  const doc = rec(profile)
  const decided = decisionsOf(decisions)
  if (decided.size === 0) return null
  const facts: { id: string; value: unknown }[] = []
  walk(doc, facts)
  const valueOf = new Map(facts.map((f) => [f.id, f.value]))
  const rows = [...decided].flatMap(([id, d]) => {
    const label = factLabel(valueOf.get(id))
    const field = text(d.field)
    const confidence = CONFIDENCES.find((c) => c === d.confidence)
    // A decision the server made is listed, even when the profile holds no readable value for it, as long as the
    // row can say what it is about (its field or its value).
    if ((label === null && field === null) || confidence === undefined || typeof d.onSite !== 'boolean')
      return []
    return [
      {
        id,
        field,
        label: label ?? '',
        confidence,
        onSite: d.onSite,
        decidedBy: d.decidedBy === 'owner' ? ('owner' as const) : ('rule' as const),
        reasons: (Array.isArray(d.reasons) ? d.reasons : []).flatMap((r) =>
          text(r) === null ? [] : [String(r)]
        ),
        alsoCalled: field === 'name' ? otherNamesOf(doc, label ?? '') : []
      }
    ]
  })
  return rows.length === 0 ? null : rows
}

export const REASON_CODES = [
  'stale',
  'not-on-demo',
  'evidence-not-found',
  'sender-sensitive-fact',
  'implausible-all-week-hours',
  'few-reviews',
  'review-only-person',
  'name-differs-from-own-marks',
  'inferred-kind-not-allowed',
  'allowed-inferred-kind'
] as const

/**
 * Plain-words keys for the line under a fact: why the rule left it off, or that it was inferred and let through.
 * A fact the owner decided says nothing; a code this card does not know reads as a generic held-back line.
 */
export function reasonKeys(row: FactRowView): string[] {
  if (row.decidedBy === 'owner') return []
  const known = row.reasons.filter((r) => (REASON_CODES as readonly string[]).includes(r))
  const keys = known.map((r) => `facts.reason.${r}`)
  if (keys.length === 0 && !row.onSite) return ['facts.reason.other']
  return keys
}
