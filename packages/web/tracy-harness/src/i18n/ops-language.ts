/**
 * The language /ops speaks, and where its choice lives (plan `tasks/todo-ops-i18n.md`, D5).
 *
 * /ops keeps its OWN choice in `localStorage` (`tracy.ops.lang`), like its theme. The `tracy_lang`
 * cookie that Settings › Language writes is only READ, as a starting value: /ops never writes or
 * deletes it, because dsh's settings plugin clears that cookie whenever its own preference is unset
 * (`clearStaleLanguageCookie`), so it cannot be a choice the two surfaces share.
 *
 * Order: `?lang=` (this page load only, never remembered) → `tracy.ops.lang` → `tracy_lang` →
 * `navigator.languages` → English. Only an explicit pick is remembered; "Follow device" forgets it.
 * Every read of the window is guarded: storage can be refused, and /ops must still start.
 */
import {
  cookieValue,
  firstLanguage,
  htmlLang,
  LANGUAGE_COOKIE,
  matchLanguage
} from '@tracy/core/interface-languages/resolve'

import { isPseudo, PSEUDO_LANGUAGE } from './pseudo-locale.ts'
import { createLanguageStore, type LanguageStore, type Table } from './language-store.ts'

export const OPS_LANGUAGE_KEY = 'tracy.ops.lang'

/** The parts of `window` this module reads; a fixture can stand in for each. */
export interface LanguageWindow {
  readonly location?: { readonly search?: string }
  readonly localStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  readonly navigator?: { readonly languages?: readonly string[]; readonly language?: string }
  readonly document?: { readonly cookie?: string; readonly documentElement?: { lang: string } }
}

export interface OpsLanguage {
  readonly store: LanguageStore
  /** Pick a language and remember it, or `'device'` to forget the pick. */
  setLanguage(choice: string): Promise<void>
  /** True while no pick is remembered (the language comes from the cookie or the browser). */
  followsDevice(): boolean
}

const attempt = <T>(read: () => T, fallback: T): T => {
  try {
    return read()
  } catch {
    return fallback
  }
}

function browserLanguages(win: LanguageWindow): readonly unknown[] {
  return attempt(() => {
    const nav = win.navigator
    if (!nav) return []
    return Array.isArray(nav.languages) && nav.languages.length > 0 ? nav.languages : [nav.language]
  }, [])
}

/** The language with no remembered /ops pick: the cookie of Settings › Language, then the browser. */
function deviceLanguage(win: LanguageWindow): string {
  const cookie = attempt(() => cookieValue(win.document?.cookie, LANGUAGE_COOKIE), null)
  return firstLanguage([cookie, ...browserLanguages(win)]) ?? 'en'
}

const readSaved = (win: LanguageWindow): string | null =>
  attempt(() => matchLanguage(win.localStorage?.getItem(OPS_LANGUAGE_KEY)), null)

export function createOpsLanguage({
  win,
  load
}: {
  win: LanguageWindow
  load: (lang: string) => Promise<Table>
}): OpsLanguage {
  let saved = readSaved(win)
  const query = attempt(() => new URLSearchParams(win.location?.search ?? '').get('lang'), null)
  // `?lang=pseudo` is dev-only and, like any `?lang=`, never written to storage.
  const asked = import.meta.env?.DEV && isPseudo(query) ? PSEUDO_LANGUAGE : matchLanguage(query)
  const initial = asked ?? saved ?? deviceLanguage(win)
  const store = createLanguageStore({
    initial,
    load,
    onApply: (lang) => {
      attempt(() => {
        const root = win.document?.documentElement
        if (root) root.lang = htmlLang(lang)
      }, undefined)
    }
  })
  return {
    store,
    followsDevice: () => saved === null,
    setLanguage(choice) {
      const picked = choice === 'device' ? null : matchLanguage(choice)
      saved = picked
      attempt(() => {
        // Storage refused: the pick holds for this page, it is just not remembered.
        if (picked === null) win.localStorage?.removeItem(OPS_LANGUAGE_KEY)
        else win.localStorage?.setItem(OPS_LANGUAGE_KEY, picked)
      }, undefined)
      return store.select(picked ?? deviceLanguage(win))
    }
  }
}
