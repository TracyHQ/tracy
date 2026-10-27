/**
 * Which language's dictionary /ops shows, while picks may arrive faster than dictionaries load.
 *
 * English is the source and needs no load (each screen imports its own `en`); every other language
 * is loaded once through `load` and kept. The rules:
 *   - the language on screen changes only when its dictionary is in hand (no flash of raw keys);
 *   - the LAST pick wins: a dictionary that arrives for an older pick is kept but not shown;
 *   - a failed load is not kept, leaves English on screen, names the language in `failed`, and
 *     `retry()` asks again. /ops is never blank because a chunk did not arrive.
 */
import { matchLanguage } from '@tracy/core/interface-languages/resolve'

import { isPseudo, PSEUDO_LANGUAGE } from './pseudo-locale.ts'

export type Table = Readonly<Record<string, string>>

export interface LanguageState {
  /** The language whose dictionary is on screen. */
  readonly lang: string
  /** Its translations, merged across namespaces; empty for English. */
  readonly table: Table
  /** A picked language whose dictionary is still loading, or null. */
  readonly pending: string | null
  /** The last pick whose dictionary failed to load, or null. */
  readonly failed: string | null
}

export interface LanguageStore {
  get(): LanguageState
  subscribe(listener: () => void): () => void
  /** Show this language as soon as its dictionary is in hand. Never rejects. */
  select(lang: string): Promise<void>
  /** Ask again for the language that failed, if any. */
  retry(): Promise<void>
  /** Settles once the initial language is on screen, or English after a failed load. */
  readonly ready: Promise<void>
}

const ENGLISH: LanguageState = { lang: 'en', table: {}, pending: null, failed: null }

export function createLanguageStore({
  initial,
  load,
  onApply
}: {
  initial: string
  load: (lang: string) => Promise<Table>
  onApply?: (lang: string) => void
}): LanguageStore {
  let state: LanguageState = ENGLISH
  let turn = 0
  const listeners = new Set<() => void>()
  const loaded = new Map<string, Table>()
  const inflight = new Map<string, Promise<Table>>()

  const set = (next: LanguageState) => {
    const applied = next.lang !== state.lang
    state = next
    if (applied) onApply?.(next.lang)
    for (const listener of listeners) listener()
  }

  const fetchTable = (lang: string): Promise<Table> => {
    const running = inflight.get(lang)
    if (running) return running
    const started = load(lang).then(
      (table) => {
        inflight.delete(lang)
        loaded.set(lang, table)
        return table
      },
      (error: unknown) => {
        inflight.delete(lang)
        throw error
      }
    )
    inflight.set(lang, started)
    return started
  }

  const select = async (requested: string): Promise<void> => {
    const lang =
      (import.meta.env?.DEV && isPseudo(requested) ? PSEUDO_LANGUAGE : null) ??
      matchLanguage(requested) ??
      'en'
    const mine = ++turn
    if (lang === 'en') return set({ ...ENGLISH })
    const kept = loaded.get(lang)
    if (kept) return set({ lang, table: kept, pending: null, failed: null })
    set({ ...state, pending: lang })
    try {
      const table = await fetchTable(lang)
      if (mine === turn) set({ lang, table, pending: null, failed: null })
    } catch {
      if (mine === turn) set({ ...ENGLISH, failed: lang })
    }
  }

  onApply?.('en')
  const ready = select(initial)

  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    select,
    retry: () => (state.failed ? select(state.failed) : Promise.resolve()),
    ready
  }
}
