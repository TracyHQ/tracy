/**
 * How one fact of the saved profile reads and edits on the Business facts page (#537 R18), whatever band holds it:
 * its label (from its key: a known field's own words, else the key itself made readable), its value drawn by kind
 * (text, list as chips, flags as the names that are true, boolean as Yes or No, number, url as a link, hours as its
 * lines, a record no kind covers as its plain parts), and the draft its editor holds with the value the facts door is
 * sent. Pure.
 */
import { type FactKind, editedPartOf } from './fact-kind.ts'
import type { SavedFact } from './saved-profile-model.ts'
import { en, type Translate } from './strings.ts'

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => v !== null && typeof v === 'object' && !Array.isArray(v)

/** The keys a field of the page already names in words. */
const LABEL_KEYS: Record<string, string> = {
  name: 'field.name',
  branch: 'field.branch',
  address: 'field.address',
  phone: 'field.phone',
  email: 'advanced.has.email',
  hours: 'field.hours',
  serviceAreas: 'field.serviceAreas',
  reservable: 'detail.google.reservable.any',
  'research:otherPhones': 'field.otherPhones'
}

/** `nationalPhoneNumber` reads "National phone number"; `research:priceLevel` reads "Price level". */
export function readableKey(key: string): string {
  const words = key
    .replace(/^[a-z]+:/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
  return words === '' ? key : words[0]!.toUpperCase() + words.slice(1)
}

/** A flag's name: Google's amenity in the interface language when the page names it, else the name made readable. */
export function flagName(t: Translate, name: string): string {
  return Object.hasOwn(en, `amenity.${name}`) ? t(`amenity.${name}`) : readableKey(name)
}

/** The label of a fact: a known field's words, else its key made readable. */
export function factLabel(t: Translate, fact: Pick<SavedFact, 'key'>): string {
  const known = LABEL_KEYS[fact.key]
  return known === undefined ? readableKey(fact.key) : t(known)
}

/** A fact's value as the page draws it. */
export type FactDisplay =
  | { kind: 'text'; text: string }
  | { kind: 'chips'; items: string[] }
  | { kind: 'lines'; lines: string[] }
  | { kind: 'link'; url: string }
  | { kind: 'none' }

/** The plain words of a record no kind covers: `{latitude, longitude}` reads "25.02, 55.23". */
export function plainWords(v: unknown): string {
  if (!isRec(v)) return typeof v === 'string' || typeof v === 'number' ? String(v) : ''
  for (const k of ['longText', 'name', 'text', 'phone', 'label', 'url'])
    if (typeof v[k] === 'string' && v[k] !== '') return v[k] as string
  return (
    Object.values(v)
      .filter((x) => typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean')
      // A coordinate reads to six places, not the float noise research stored.
      .map((x) => (typeof x === 'number' && !Number.isInteger(x) ? String(Number(x.toFixed(6))) : String(x)))
      .join(', ')
  )
}

/** The value drawn by kind; a value of no kind as its plain parts, nothing dropped. */
export function factDisplay(
  t: Translate,
  fact: Pick<SavedFact, 'group' | 'value' | 'kind'>,
  locale = 'en'
): FactDisplay {
  // A fact of no kind shows its whole value: its record may lack the part the facts door edits.
  const v = fact.kind === null ? fact.value : editedPartOf(fact)
  switch (fact.kind) {
    case 'text':
      return typeof v === 'string' && v.trim() !== '' ? { kind: 'text', text: v } : { kind: 'none' }
    case 'list':
      return Array.isArray(v) && v.length > 0 ? { kind: 'chips', items: v.map(String) } : { kind: 'none' }
    case 'hours':
      return Array.isArray(v) && v.length > 0 ? { kind: 'lines', lines: v.map(String) } : { kind: 'none' }
    case 'flags': {
      const on = Object.entries(isRec(v) ? v : {})
        .filter(([, x]) => x === true)
        .map(([k]) => flagName(t, k))
      return on.length > 0 ? { kind: 'chips', items: on } : { kind: 'none' }
    }
    case 'boolean':
      return { kind: 'text', text: t(v === true ? 'answer.yes' : 'answer.no') }
    case 'number':
      return typeof v === 'number'
        ? { kind: 'text', text: new Intl.NumberFormat(locale).format(v) }
        : { kind: 'none' }
    case 'url':
      return typeof v === 'string' && /^https?:\/\//i.test(v) ? { kind: 'link', url: v } : { kind: 'none' }
    default: {
      if (Array.isArray(v)) {
        const items = v.map(plainWords).filter((s) => s !== '')
        return items.length > 0 ? { kind: 'chips', items } : { kind: 'none' }
      }
      const words = plainWords(v)
      return words === '' ? { kind: 'none' } : { kind: 'text', text: words }
    }
  }
}

/** The words of a display, for a title or a comparison. */
export function displayText(d: FactDisplay): string {
  if (d.kind === 'text') return d.text
  if (d.kind === 'chips') return d.items.join(', ')
  if (d.kind === 'lines') return d.lines.join('\n')
  if (d.kind === 'link') return d.url
  return ''
}

/** What an editor holds: words for most kinds, the names and their ticks for flags. */
export type FactDraft = string | Record<string, boolean>

export function draftOf(fact: Pick<SavedFact, 'group' | 'value' | 'kind'>): FactDraft {
  const v = editedPartOf(fact)
  if (fact.kind === 'flags')
    return isRec(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === true])) : {}
  if (fact.kind === 'list' || fact.kind === 'hours') return Array.isArray(v) ? v.map(String).join('\n') : ''
  if (fact.kind === 'boolean') return v === true ? 'yes' : 'no'
  return v === undefined || v === null ? '' : String(v)
}

/**
 * The value a draft sends through the facts door: undefined when it says what the fact says already, null when it is
 * not a value of the fact's kind (the editor then shows the field as wrong and nothing is sent).
 */
export function sentValueOf(fact: Pick<SavedFact, 'group' | 'value' | 'kind'>, draft: FactDraft): unknown {
  const kind: FactKind | null = fact.kind
  if (kind === null) return undefined
  if (JSON.stringify(draft) === JSON.stringify(draftOf(fact))) return undefined
  if (kind === 'flags') return isRec(draft) && Object.keys(draft).length > 0 ? { ...draft } : null
  if (typeof draft !== 'string') return null
  const words = draft.trim()
  if (kind === 'list' || kind === 'hours') {
    const lines = words
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '')
    return lines.length > 0 && lines.length <= (kind === 'hours' ? 14 : 50) ? lines : null
  }
  if (kind === 'boolean') return draft === 'yes'
  if (kind === 'number') {
    const n = Number(words)
    return words !== '' && Number.isFinite(n) ? n : null
  }
  if (kind === 'url') return /^https?:\/\/\S+$/i.test(words) ? words : null
  return words !== '' && words.length <= 2000 ? words : null
}
