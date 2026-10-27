/**
 * The /ops i18n surface every screen imports. The dictionary contract (`ns/`, `locales/`,
 * `fingerprints/`) is described in `catalog.ts`; the gate is `scripts/check-ops-languages.ts`.
 */
export { activeLanguage, I18nProvider, type LanguageControl, type T, tr, useLanguage, useT } from './react.ts'
export { Trans } from './trans.ts'
export {
  type DateInput,
  type DateStyle,
  dateLocale,
  type FormatOptions,
  formatDate,
  formatDateTime,
  formatFixed,
  formatNumber,
  formatTime,
  formatWith,
  numberLocale,
  useFormat
} from './format.ts'
