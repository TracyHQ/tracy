/**
 * Place suggestions under the Find box (`GET /places/suggest`): asked 300 ms after the last keystroke
 * once a place has 3+ characters, all keystrokes and the pick sharing one session token so Google
 * bills them as one session. Only the latest answer is shown; no Google key stops it for good.
 */
import { newUuid } from './uuid.ts'
import type { Answer } from './api.ts'
import { type SearchArea, classifyInput } from './find-input.ts'

export const SUGGEST_MIN_CHARS = 3
export const SUGGEST_DEBOUNCE_MS = 300

export interface Suggestion {
  placeId: string
  text: string
  mainText: string
  secondaryText: string | null
  /** Google's place types (`locality`, `sublocality`…); empty when the server sent none. */
  types: string[]
}

/** The text to ask about, or null: a link or fewer than 3 characters never asks. */
export function suggestQuery(text: string): string | null {
  const input = classifyInput(text)
  return input.kind === 'place' && input.query.length >= SUGGEST_MIN_CHARS ? input.query : null
}

/** The combobox also rewrites the box itself (on close, Escape, a pick); only the person's edits count. */
export function isTypedChange(reason: string | undefined): boolean {
  return reason === 'input-change' || reason === 'input-paste'
}

const str = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

function suggestionsOf(body: unknown): Suggestion[] {
  const list = (body as { suggestions?: unknown } | null)?.suggestions
  const out: Suggestion[] = []
  for (const raw of Array.isArray(list) ? list : []) {
    const s = raw as Partial<Record<keyof Suggestion, unknown>> | null
    if (!s || !str(s.placeId) || !str(s.text)) continue
    out.push({
      placeId: s.placeId,
      text: s.text,
      mainText: str(s.mainText) ? s.mainText : s.text,
      secondaryText: str(s.secondaryText) ? s.secondaryText : null,
      types: Array.isArray(s.types) ? s.types.filter(str) : []
    })
  }
  return out
}

interface Timers {
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(id: unknown): void
}

export interface Suggester {
  /** Every edit the person makes to the box. */
  type(text: string): void
  /** After a pick or a search: drop what is pending; the next keystroke starts a new session. */
  reset(): void
  /** The current session token (made on first use). */
  session(): string
  /** Unmount: nothing fires afterwards. */
  stop(): void
}

export function createSuggester(deps: {
  ask: (query: string, session: string) => Promise<Answer<unknown>>
  onSuggestions: (list: Suggestion[]) => void
  newToken?: () => string
  timers?: Timers
  delayMs?: number
}): Suggester {
  const timers: Timers = deps.timers ?? {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (id) => globalThis.clearTimeout(id as number)
  }
  const newToken = deps.newToken ?? newUuid
  let token: string | null = null
  let timer: unknown = null
  let seq = 0
  let off = false
  const session = (): string => (token ??= newToken())
  const cancel = (): void => {
    if (timer !== null) timers.clearTimeout(timer)
    timer = null
    seq += 1
  }
  return {
    session,
    type(text) {
      cancel()
      const query = off ? null : suggestQuery(text)
      if (query === null) {
        deps.onSuggestions([])
        return
      }
      const mine = seq
      timer = timers.setTimeout(() => {
        timer = null
        void deps.ask(query, session()).then(
          (answer) => {
            if (mine !== seq || off) return
            if (!answer.ok && answer.code === 'CREDENTIAL_MISSING') off = true
            deps.onSuggestions(answer.ok ? suggestionsOf(answer.body) : [])
          },
          () => {
            if (mine === seq) deps.onSuggestions([])
          }
        )
      }, deps.delayMs ?? SUGGEST_DEBOUNCE_MS)
    },
    reset() {
      cancel()
      token = null
      deps.onSuggestions([])
    },
    stop() {
      cancel()
      off = true
    }
  }
}

const NAMED_AREA = /^(locality|postal_town|administrative_area_level_\d)$/
const NARROW_AREA = /^(sublocality|neighborhood|route|street_address|premise|point_of_interest|establishment)/

/** A city or region: Google's point is its geometric centre (Da Nang's sits 16 km out, in the hills), so search it by name. */
export function isNamedArea(types: readonly string[]): boolean {
  return types.some((t) => NAMED_AREA.test(t)) && !types.some((t) => NARROW_AREA.test(t))
}

/**
 * The search area of a pick: a city or region by its name (the server's geocoder centres it on the town);
 * anything smaller at its resolved point labelled with its name, else its text as a typed place.
 */
export async function pickedArea(
  resolve: (placeId: string) => Promise<Answer<{ label?: unknown; lat?: unknown; lon?: unknown }>>,
  pick: Pick<Suggestion, 'placeId' | 'text'> & { types?: readonly string[] }
): Promise<SearchArea> {
  if (
    (pick.types ?? []).some((t) => /^(establishment|point_of_interest|street_address|premise|route)$/.test(t))
  )
    return {
      kind: 'text',
      query: pick.text,
      ...((pick.types ?? []).some((t) => t === 'establishment' || t === 'point_of_interest')
        ? { placeId: pick.placeId }
        : {})
    }
  if (isNamedArea(pick.types ?? [])) return { kind: 'place', query: pick.text }
  const answer = await resolve(pick.placeId).catch(() => null)
  const body = answer?.ok ? answer.body : null
  const { lat, lon, label } = body ?? {}
  if (typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon))
    return { kind: 'point', lat, lon, label: str(label) ? label : pick.text }
  return { kind: 'place', query: pick.text }
}
