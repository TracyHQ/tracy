/**
 * The plugin's bundled language catalog: one entry per third language,
 * carrying the catalog metadata (id / label / fallback) DSH's native
 * `locale.addLanguage` expects plus the per-namespace dictionaries fed to
 * `locale.register(ns, locale, dict)`.
 *
 * Adding a language = add one `dictionaries/<lang>.ts` file + one entry
 * here. Key sets across languages are intentionally not enforced at
 * compile time; missing keys resolve through DSH's per-key fallback chain
 * (declared fallback → en). `pnpm run gen:translations` + `TRANSLATION.md`
 * is the human-readable coverage report.
 *
 * @module @huanlin/dsh-plugin-better-locale/client/languages
 */

import { dicts as deDicts } from './dictionaries/de.ts'
import { dicts as frDicts } from './dictionaries/fr.ts'
import { dicts as itDicts } from './dictionaries/it.ts'
import { dicts as nlDicts } from './dictionaries/nl.ts'

/** One bundled third language: catalog metadata plus its namespace dicts. */
export interface BundledLanguage {
  /** Stable BCP 47-style id, selectable in DSH's native Language row. */
  readonly id: string
  /** Display name written in the represented language. */
  readonly label: string
  /**
   * Per-key fallback locale: a DSH built-in. The Traditional Chinese
   * variants fall back to `zh` (missing keys show Simplified rather than
   * English); every other language falls back to `en`. Chains always
   * terminate at `en` as upstream requires.
   */
  readonly fallback: 'en' | 'zh'
  /** Dictionaries keyed by DSH namespace id (`common`, `settings.locale`, ...). */
  readonly dicts: Record<string, Record<string, string>>
}

/**
 * All curated languages the plugin ships. Registration order is display
 * order in DSH's Language row (after the built-in zh/en entries).
 */
export const BUNDLED_LANGUAGES: readonly BundledLanguage[] = [
  // 🔒 TRACY FORK: only the languages Tracy supports are registered (TCH spec #730, decided by
  // Akemi 02/10/2026: en, vi, de, it, fr, nl, zh, es). A registered language is selectable in the
  // Language row and can win browser detection, so a language Tracy has not translated must not
  // be registered at all; filtering the row alone would still let startup pick it.
  //
  // The other dictionaries (ja pt ko ar hi id tr th ru sv pl zh-HK zh-TW zh-MO, and the upstream
  // vi this fork never registered, see below) stay in `dictionaries/` unreferenced, so this fork
  // stays a small diff and `git subtree pull` keeps working. Re-adding one = one import + one
  // entry here, once Tracy's own screens are translated into it too.
  //
  // `vi` is owned by `dsh-locale-vi`: `ctx.locale.addLanguage` throws on a duplicate id, which in
  // dsh takes down the whole plugin tree. That package also follows Tracy's keep-verbatim term list
  // (`packages/locale/tracy-locale-vi/terms.ts`), which the upstream vi does not.
  { id: 'de', label: 'Deutsch', fallback: 'en', dicts: deDicts },
  { id: 'fr', label: 'Français', fallback: 'en', dicts: frDicts },
  { id: 'it', label: 'Italiano', fallback: 'en', dicts: itDicts },
  { id: 'nl', label: 'Nederlands', fallback: 'en', dicts: nlDicts },
]
