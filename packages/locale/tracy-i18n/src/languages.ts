/**
 * The languages Tracy Cowork ships, and how an arbitrary string resolves to one of them.
 *
 * Full tags (`en-US`, not `en`) — the same convention as `tracy-desk`, so the two repos need no
 * mapping between them: the OTP email copy table came over from desk with exactly these tags.
 *
 * Three languages, an ADR decision (0004): exactly the three desk translated BY HAND. A fourth
 * language needs no new ADR — add a row here, run `pnpm i18n:sync`, then translate.
 */

/**
 * The language tags Tracy ships — ONE PLACE ONLY.
 *
 * `load` sits in the row rather than in a separate table: two places per language is where someone
 * later adds one side and forgets the other, and the symptom is a language that shows in the menu
 * and blows up when clicked. Adding a language = add a row here, run `pnpm i18n:sync`, translate.
 *
 * `import()` must be a static string — the bundler has to read it at build time to split a chunk
 * per language.
 */
export const APP_LANGUAGES = [
  { id: 'en-US', label: 'English', flag: '🇺🇸', load: () => import('./locales/en-us.json') },
  { id: 'vi-VN', label: 'Tiếng Việt', flag: '🇻🇳', load: () => import('./locales/vi-vn.json') },
  { id: 'zh-CN', label: '中文', flag: '🇨🇳', load: () => import('./locales/zh-cn.json') }
] as const

export type LanguageId = (typeof APP_LANGUAGES)[number]['id']

/**
 * The language when nothing else is known, and the dictionary consulted when the chosen language
 * lacks a key. One constant for both roles because it is the same answer: English is the only pack
 * guaranteed to have every key (`i18n:check` enforces it).
 */
export const FALLBACK_LANGUAGE: LanguageId = 'en-US'

export function isAppLanguage(value: string | null | undefined): value is LanguageId {
  return APP_LANGUAGES.some((language) => language.id === value)
}

/**
 * Any string → a tag Tracy ships, or `null`.
 *
 * Two passes: exact tag first (`vi-VN`), then by **primary subtag** (`vi`, `vi-US`, `VI` all give
 * `vi-VN`). The second pass is what makes `navigator.language` usable — browsers return all kinds
 * of regions we do not ship separately.
 */
export function resolveLanguage(raw: string | null | undefined): LanguageId | null {
  if (typeof raw !== 'string' || raw === '') return null
  const wanted = raw.trim()
  // Check the SHAPE before matching. Without it `en-US<script>` splits on `-` to `en` and the loose
  // pass accepts it — the output is still a valid language so nothing leaks, but accepting a string
  // that is not a language tag lets a broken cookie travel further than it should.
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(wanted)) return null
  const exact = APP_LANGUAGES.find((language) => language.id.toLowerCase() === wanted.toLowerCase())
  if (exact) return exact.id
  const primary = wanted.split('-')[0].toLowerCase()
  const loose = APP_LANGUAGES.find((language) => language.id.split('-')[0].toLowerCase() === primary)
  return loose ? loose.id : null
}

/**
 * Tracy tag → the locale **dsh** ships.
 *
 * All three languages Tracy ships now exist in dsh, so this table maps one-to-one onto the primary
 * subtag and nothing falls back to `en` any more.
 *
 * `vi` exists because WE added it, not because dsh ships it: dsh 0.1.1-rc.2 hard-codes
 * `LOCALES = [zh, en]`, `packages/dsh-config/scripts/patch-dsh-locale.mjs` patches that constant
 * at image build, and the 727 translations are registered by the `tracy-locale` plugin. So this
 * function is only right when the agent runs on a PATCHED dsh. An unpatched one **throws**
 * `locale "vi" is not registered` rather than silently falling back to English — so the
 * `setLocale` call site must wrap it in try/catch, and `tracy-view` is where that happens.
 *
 * See ADR 0004 §5 and `fleet/dsh/README.md`.
 */
export function dshLocaleFor(language: LanguageId): DshLocale {
  return DSH_LOCALES[language] ?? 'en'
}

/** Locales dsh has once patched. Adding one here promises a whole dictionary in `tracy-locale`. */
type DshLocale = 'zh' | 'en' | 'vi'

/**
 * An EXPLICIT table, not `language.split('-')[0]`.
 *
 * Splitting the tag sounds neater and is right for all three languages today — but a fourth
 * language (ADR 0004 §1 allows one without a new ADR) would silently yield an id dsh does not have,
 * and dsh **throws** rather than falls back. With this table a missing row falls back to `en`:
 * still off, but off in a way that does not break the left pane.
 */
const DSH_LOCALES: Partial<Record<LanguageId, DshLocale>> = {
  'en-US': 'en',
  'vi-VN': 'vi',
  'zh-CN': 'zh'
}
