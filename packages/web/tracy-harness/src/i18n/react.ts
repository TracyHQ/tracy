/**
 * (A `.ts` file with no JSX on purpose: a helper that reads `tr()` must load under plain `node --test`.)
 * The /ops dictionaries in React: `I18nProvider` at the root (`main.tsx`), `useT()` in a component,
 * `tr()` outside one, `useLanguage()` for the language switch. Without a provider (a test mounting
 * one screen) everything reads English.
 */
import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useMemo,
  useSyncExternalStore
} from 'react'

import { ENGLISH } from './english.ts'
import { createLanguageStore, type LanguageState } from './language-store.ts'
import type { OpsLanguage } from './ops-language.ts'
import { lookupText, type Params, translate } from './translator.ts'

const ENGLISH_ONLY: OpsLanguage = {
  store: createLanguageStore({ initial: 'en', load: () => Promise.reject(new Error('no dictionaries')) }),
  setLanguage: () => Promise.resolve(),
  followsDevice: () => true
}

/** The language `tr()` reads: the last provider rendered, English before any. */
let active: OpsLanguage = ENGLISH_ONLY
const LanguageContext = createContext<OpsLanguage>(ENGLISH_ONLY)

export function I18nProvider({ language, children }: { language: OpsLanguage; children: ReactNode }) {
  active = language
  return createElement(LanguageContext.Provider, { value: language }, children)
}

const reported = new Set<string>()
function textFor(state: LanguageState, key: string, params?: Params): string {
  if (lookupText(state.lang, state.table, ENGLISH, key, params) === null && !reported.has(key)) {
    reported.add(key)
    if (import.meta.env?.DEV) console.error(`[ops i18n] no English for "${key}" in src/i18n/ns/*.ts`)
  }
  return translate(state.lang, state.table, ENGLISH, key, params)
}

export type T = (key: string, params?: Params) => string

/**
 * Text for a key in the language on screen, now. Not reactive by itself: it follows a language
 * change only when called during a render (a component re-rendered by `useT`/`useLanguage`).
 */
export function tr(key: string, params?: Params): string {
  return textFor(active.store.get(), key, params)
}

/** The language id on screen now (what `tr()` reads); `en` before any provider. */
export function activeLanguage(): string {
  return active.store.get().lang
}

function useLanguageState(): [OpsLanguage, LanguageState] {
  const language = useContext(LanguageContext)
  const state = useSyncExternalStore(language.store.subscribe, language.store.get, language.store.get)
  return [language, state]
}

/** `t(key, params?)` in the language on screen; re-renders the component when the language changes. */
export function useT(): T {
  const [, state] = useLanguageState()
  return useMemo(() => (key: string, params?: Params) => textFor(state, key, params), [state])
}

export interface LanguageControl extends LanguageState {
  readonly followsDevice: boolean
  /** A language id to pick and remember it, or `'device'` to forget the pick. */
  setLanguage(choice: string): void
  retry(): void
}

export function useLanguage(): LanguageControl {
  const [language, state] = useLanguageState()
  return {
    ...state,
    followsDevice: language.followsDevice(),
    setLanguage: (choice) => void language.setLanguage(choice),
    retry: () => void language.store.retry()
  }
}
