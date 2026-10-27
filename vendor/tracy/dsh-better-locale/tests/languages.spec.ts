/**
 * Unit tests for the bundled language catalog (`src/client/languages.ts`).
 *
 * These assert the catalog against the registration contract of DSH's
 * native `LocaleRuntime.addLanguage` / single-locale `register`
 * (v0.1.2-alpha.1): BCP 47-style ids (upstream `LOCALE_ID_PATTERN`),
 * non-empty labels, a registered built-in fallback, and well-shaped
 * dictionaries. Key-level coverage across languages is intentionally not
 * asserted — missing keys resolve through DSH's per-key fallback chain;
 * `TRANSLATION.md` is the coverage report.
 */
import { describe, expect, it } from 'vitest'
import { BUNDLED_LANGUAGES } from '../src/client/languages.ts'

/**
 * Mirror of upstream `LOCALE_ID_PATTERN`
 * (packages/client/locale/src/locale-settings.ts): BCP 47-style ids
 * accepted by `addLanguage` and the single-locale `register`.
 */
const LOCALE_ID_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u

describe('BUNDLED_LANGUAGES', () => {
  it('registers only the languages Tracy supports, in display order (TRACY FORK)', () => {
    expect(BUNDLED_LANGUAGES.map(l => l.id)).toEqual(['de', 'fr', 'it', 'nl'])
  })

  it('has unique ids', () => {
    const ids = BUNDLED_LANGUAGES.map(l => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has BCP 47-style ids accepted by upstream addLanguage', () => {
    for (const language of BUNDLED_LANGUAGES) {
      expect(language.id).toMatch(LOCALE_ID_PATTERN)
    }
  })

  it('has non-empty self-described labels', () => {
    for (const language of BUNDLED_LANGUAGES) {
      expect(language.label.trim().length).toBeGreaterThan(0)
      expect(language.label).toBe(language.label.trim())
    }
  })

  it('falls back to a built-in locale: zh for the Traditional Chinese variants, en otherwise', () => {
    for (const language of BUNDLED_LANGUAGES) {
      const expected = language.id.startsWith('zh-') ? 'zh' : 'en'
      expect(language.fallback, language.id).toBe(expected)
    }
  })

  it('ships at least one namespace dictionary per language', () => {
    for (const language of BUNDLED_LANGUAGES) {
      const namespaces = Object.keys(language.dicts)
      expect(namespaces.length).toBeGreaterThan(0)
      for (const ns of namespaces) {
        expect(ns.length).toBeGreaterThan(0)
      }
    }
  })

  it('has string-only dictionary values', () => {
    for (const language of BUNDLED_LANGUAGES) {
      for (const [ns, dict] of Object.entries(language.dicts)) {
        for (const [key, value] of Object.entries(dict)) {
          expect(typeof value, `${language.id}/${ns}/${key}`).toBe('string')
          expect(key.length).toBeGreaterThan(0)
        }
      }
    }
  })

  it('covers the shared DSH namespaces common and settings.locale in every language', () => {
    // The two namespaces DSH's own chrome (buttons + the Language row)
    // reads first; the other namespaces may vary per language.
    for (const language of BUNDLED_LANGUAGES) {
      expect(language.dicts['common'], language.id).toBeDefined()
      expect(language.dicts['settings.locale'], language.id).toBeDefined()
    }
  })
})
