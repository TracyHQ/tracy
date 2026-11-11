/**
 * The groups of the saved profile (#537 R18) and the kind of value each fact takes, as the facts door reads it
 * (`PUT …/:id/facts {factId, value}`): which editor a fact gets, and which part of a record value it edits. Pure.
 */
type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => v !== null && typeof v === 'object' && !Array.isArray(v)

export const FACT_GROUPS = [
  'business',
  'offerings',
  'people',
  'claims',
  'quotes',
  'links',
  'extensions'
] as const
export type FactGroup = (typeof FACT_GROUPS)[number]

/** The kinds the facts door edits (`PUT …/:id/facts {factId, value}`); null: switched only, never edited. */
export type FactKind = 'text' | 'list' | 'hours' | 'boolean' | 'number' | 'url' | 'flags'

/** The part of a record value the facts door edits, by group (the server's `RECORD_PART`). */
const RECORD_PART: Partial<Record<FactGroup, string>> = {
  people: 'name',
  offerings: 'name',
  quotes: 'text',
  links: 'url',
  claims: 'amount'
}
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')
const flags = (v: unknown): boolean =>
  isRec(v) && Object.keys(v).length > 0 && Object.values(v).every((x) => typeof x === 'boolean')

/** The kind of value one fact takes, as the server reads it (`fact-value-kinds.mjs factValueKindOf`). */
export function factKindOf(group: FactGroup, key: string, value: unknown): FactKind | null {
  if (group === 'business' && key === 'hours') return strings(value) ? 'hours' : null
  if (typeof value === 'string') return 'text'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number' && Number.isFinite(value)) return 'number'
  if (Array.isArray(value)) return strings(value) ? 'list' : null
  if (!isRec(value)) return null
  const part = RECORD_PART[group]
  if (part === 'url') return typeof value.url === 'string' ? 'url' : null
  if (part === 'amount') return typeof value.amount === 'number' ? 'number' : null
  if (part !== undefined) return typeof value[part] === 'string' ? 'text' : null
  return flags(value) ? 'flags' : null
}

/** The value the facts door edits: a record's one part, else the value itself. */
export function editedPartOf(fact: { group: FactGroup; value: unknown }): unknown {
  const part = RECORD_PART[fact.group]
  return part !== undefined && isRec(fact.value) ? fact.value[part] : fact.value
}
