/**
 * Tracy Cowork i18n — one system for both the cloud build and the desktop shell.
 *
 * The desktop shell loads `cowork.tracy.ai` itself and keeps no UI of its own, so it inherits
 * this system whole. There is NO i18n code in `apps/desktop` (ADR 0004 §4).
 *
 * The mechanism comes from `tracy-desk`, where it already ran for real, and the OTP email copy
 * table now shares its conventions:
 *   - `locales/` is translated BY HAND, `translate/` BY MACHINE (see the README there);
 *   - the `[to be translated]` sentinel is the pivot: `i18n:sync` writes it, the translation
 *     script touches only it, and AT RUNTIME it is dropped so the string falls back to English —
 *     users never see it;
 *   - `saveMissing` logs missing keys, so a gap speaks up instead of staying silent.
 *
 * Lazy per-language loading: each locale is its own `import()`, so the first bundle carries no
 * translation JSON. `initI18n()` must be awaited before render — precisely because those packs load
 * asynchronously.
 */
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

import { APP_LANGUAGES, FALLBACK_LANGUAGE, type LanguageId } from './languages'
import { preferredLanguage, writeLanguageCookie } from './preference'

export {
  APP_LANGUAGES,
  FALLBACK_LANGUAGE,
  type LanguageId,
  dshLocaleFor,
  isAppLanguage,
  resolveLanguage
} from './languages'
export { LANGUAGE_COOKIE, preferredLanguage } from './preference'
export { Trans, useTranslation } from 'react-i18next'

/** Untranslated strings carry this mark. Must match `scripts/i18n-sync.ts`. */
export const PENDING = '[to be translated]'

/** One language's translation pack. The source is `APP_LANGUAGES` — no second table to drift. */
async function packFor(language: LanguageId): Promise<Record<string, unknown>> {
  const entry = APP_LANGUAGES.find((candidate) => candidate.id === language)
  if (!entry) throw new Error(`[i18n] no pack for "${language}"`)
  return (await entry.load()).default
}

/**
 * Drops every leaf still carrying the sentinel, recursively.
 *
 * This is where the rule "untranslated falls back to English" becomes true. i18next falls back to
 * `fallbackLng` only when a key is ABSENT — a key present with the value `[to be translated]:...`
 * counts as translated, and that string would show on screen. Cutting them before loading turns
 * "missing translation" into exactly the case i18next knows how to handle.
 */
function withoutPending(input: unknown): unknown {
  if (typeof input === 'string') return input.startsWith(PENDING) ? undefined : input
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      const kept = withoutPending(value)
      if (kept !== undefined) out[key] = kept
    }
    return out
  }
  return input
}

let started: Promise<void> | null = null

async function boot(language: LanguageId): Promise<void> {
  const packs: Array<[LanguageId, Record<string, unknown>]> = [
    [FALLBACK_LANGUAGE, await packFor(FALLBACK_LANGUAGE)]
  ]
  // The chosen language loads IN ADDITION, not instead: the English pack is always there to fall back to.
  if (language !== FALLBACK_LANGUAGE) packs.push([language, await packFor(language)])

  await i18next.use(initReactI18next).init({
    lng: language,
    fallbackLng: FALLBACK_LANGUAGE,
    // Load exactly the given tag — never a bare `en`, which we do not ship and would 404.
    load: 'currentOnly',
    resources: Object.fromEntries(
      packs.map(([id, pack]) => [id, { translation: withoutPending(pack) as Record<string, unknown> }])
    ),
    interpolation: { escapeValue: false },
    saveMissing: true,
    missingKeyHandler: (_lngs, _ns, key) => {
      console.warn(`[i18n] missing key: ${key}`)
    }
  })
}

/**
 * Initialises once, lazily. Idempotent: every parallel or repeated call awaits the same promise.
 * Every entry point must `await initI18n()` before render.
 */
export function initI18n(): Promise<void> {
  return (started ??= boot(preferredLanguage() ?? FALLBACK_LANGUAGE))
}

/** The language being shown. */
export function currentLanguage(): LanguageId {
  return (i18next.language as LanguageId) ?? FALLBACK_LANGUAGE
}

/**
 * Changes language: writes the cookie, loads the pack if missing, then tells i18next.
 *
 * The cookie is written BEFORE loading, so a reload midway still lands on the language the user
 * just picked — what they clicked matters more than what is showing.
 * @param language The language just picked.
 * @param cookieDomain `config.cookieDomain` of the current deployment — this package cannot ask
 *   for it (see the top of `preference.ts`), so the caller passes it; empty = host-only.
 */
export async function setLanguage(language: LanguageId, cookieDomain = ''): Promise<void> {
  writeLanguageCookie(language, cookieDomain)
  if (!i18next.hasResourceBundle(language, 'translation')) {
    const pack = await packFor(language)
    i18next.addResourceBundle(language, 'translation', withoutPending(pack), true, true)
  }
  await i18next.changeLanguage(language)
}
