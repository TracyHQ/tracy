/**
 * Find places opens on results without asking again (Lee 19/10): the first visit locates the person
 * and searches there; afterwards this device shows the last search for a day, then searches the
 * remembered place for 90 days (a place rarely changes), and only then locates again. Per device
 * (`localStorage`); storage that is blocked or broken reads as nothing remembered.
 */
import type { SearchArea } from './find-input.ts'

export const PLACE_KEY = 'tracy-wo:place'
export const LAST_SEARCH_KEY = 'tracy-wo:last-search'
const PLACE_DAYS = 90
const SEARCH_HOURS = 24
const HOUR = 3_600_000

export interface Place {
  search?: Extract<SearchArea, { kind: 'text' }>
  lat: number
  lon: number
  label: string
}

export interface LastSearch {
  place: Place
  radius: number
  /** `POST /search`'s raw answer, read again through `searchAnswer`. */
  answer: unknown
}

type Store = Pick<Storage, 'getItem' | 'setItem'> & Partial<Pick<Storage, 'removeItem'>>

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function placeOf(v: unknown): Place | null {
  if (!isRecord(v) || !finite(v.lat) || !finite(v.lon) || typeof v.label !== 'string') return null
  const q = v.search
  const search =
    isRecord(q) && q.kind === 'text' && typeof q.query === 'string' && q.query.trim()
      ? {
          kind: 'text' as const,
          query: q.query,
          ...(typeof q.placeId === 'string' ? { placeId: q.placeId } : {})
        }
      : undefined
  return { lat: v.lat, lon: v.lon, label: v.label, ...(search ? { search } : {}) }
}

function read(
  store: Store | null,
  key: string,
  maxAgeMs: number,
  now: number
): Record<string, unknown> | null {
  try {
    const raw = store?.getItem(key)
    if (raw === null || raw === undefined) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || !finite(parsed.at) || now - parsed.at > maxAgeMs) return null
    return parsed
  } catch {
    return null
  }
}

/** Whether the value was stored; a private window, blocked or full storage answers false. */
function write(store: Store | null, key: string, value: Record<string, unknown>): boolean {
  if (store === null) return false
  try {
    store.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function readPlace(store: Store | null, now: number): Place | null {
  return placeOf(read(store, PLACE_KEY, PLACE_DAYS * 24 * HOUR, now)?.place)
}

export function writePlace(store: Store | null, place: Place, now: number): void {
  write(store, PLACE_KEY, { at: now, place })
}

export function readLastSearch(store: Store | null, now: number): LastSearch | null {
  const saved = read(store, LAST_SEARCH_KEY, SEARCH_HOURS * HOUR, now)
  const place = placeOf(saved?.place)
  if (saved === null || place === null || !finite(saved.radius) || !isRecord(saved.answer)) return null
  const answer = { ...saved.answer }
  if (Array.isArray(answer.candidates))
    answer.candidates = answer.candidates.map((row: unknown) => {
      if (!isRecord(row)) return row
      const { findAction: _action, ...publicFacts } = row
      return publicFacts
    })
  return { place, radius: saved.radius, answer }
}

/** What a restore can ask for again: site checks, social stats and the score that rests on them. */
const ASKED_AGAIN = new Set(['siteCheck', 'social', 'score'])

/** The answer without what is asked again after a restore: the places, their photos and their facts stay. */
function lightAnswer(answer: unknown): unknown {
  if (!isRecord(answer) || !Array.isArray(answer.candidates)) return answer
  const candidates = answer.candidates.map((c: unknown) =>
    isRecord(c) ? Object.fromEntries(Object.entries(c).filter(([k]) => !ASKED_AGAIN.has(k))) : c
  )
  return { ...answer, candidates }
}

export type SearchWrite = 'whole' | 'light' | 'none'

/**
 * Remember a search for the next visit: whole when the origin's storage takes it, else without the
 * checks, stats and scores the page asks again for; `none` when even that is refused (an older
 * search is then forgotten, so a visit never reopens on results for another place).
 */
export function writeLastSearch(store: Store | null, entry: LastSearch, now: number): SearchWrite {
  if (write(store, LAST_SEARCH_KEY, { at: now, ...entry })) return 'whole'
  if (write(store, LAST_SEARCH_KEY, { at: now, ...entry, answer: lightAnswer(entry.answer) })) return 'light'
  try {
    store?.removeItem?.(LAST_SEARCH_KEY)
  } catch {
    // Nothing more to do: the read side treats a broken store as nothing remembered.
  }
  return 'none'
}

export type OpeningStep =
  | { kind: 'restore'; last: LastSearch }
  | { kind: 'search'; place: Place }
  | { kind: 'locate' }
  | { kind: 'none' }

/** What Find does when it opens: nothing over results already shown, else the cheapest that fills it. */
export function openingStep({
  shown,
  last,
  place
}: {
  shown: boolean
  last: LastSearch | null
  place: Place | null
}): OpeningStep {
  if (shown) return { kind: 'none' }
  if (last !== null) return { kind: 'restore', last }
  if (place !== null) return { kind: 'search', place }
  return { kind: 'locate' }
}
