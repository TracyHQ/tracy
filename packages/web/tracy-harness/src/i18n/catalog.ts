/// <reference types="vite/client" />
/**
 * Where /ops dictionaries live, and how a language's are fetched. THE CONTRACT every namespace
 * follows (the gate `scripts/check-ops-languages.ts` enforces it):
 *
 *   - `ns/<ns>.ts` exports `NS` (= the file name), `SCREENS` (files under `src/` whose words it
 *     owns; the gate scans them for bare English) and `en`: flat keys `<ns>.<topic>.<detail>`,
 *     plain-string values, `{placeholder}`s, plurals as `<key>_one` / `<key>_other` / … (CLDR
 *     categories), inline markup as `<b>…</b>` read by `<Trans>`.
 *   - `locales/<lang>/<ns>.json` for vi de it fr nl zh es: the same keys, flat, sorted.
 *   - `fingerprints/<ns>.json`: the English each translation was made from
 *     (`pnpm exec tsx scripts/check-ops-languages.ts --accept-sources <ns>` after retranslating).
 *
 * Reading (`import { useT, tr, Trans, useLanguage } from '<rel>/i18n'`): `const t = useT()` then
 * `t('ns.key', { name })`; a numeric `count` picks the plural form. `tr()` is the same outside a
 * component. Missing in the language → English; missing in English → the key.
 *
 * No file lists the namespaces: English comes from `english.ts` (eager glob of `ns/*.ts`), and this
 * glob finds every `locales/<lang>/*.json`, each its own chunk fetched only when that language is
 * picked; a language with no file for a namespace reads English there. Only `main.tsx` imports
 * this module. Test bundles (esbuild) need `test/support/ops-i18n-esbuild.mjs` for the globs.
 */
import { ENGLISH } from './english.ts'
import type { Table } from './language-store.ts'
import { isPseudo, pseudoTable } from './pseudo-locale.ts'

const DICTIONARIES = import.meta.glob<Table>('./locales/*/*.json', { import: 'default' })

/** Every namespace's dictionary in one language, merged; rejects when any of them fails to load. */
export async function loadLanguage(lang: string): Promise<Table> {
  if (import.meta.env?.DEV && isPseudo(lang)) return pseudoTable(ENGLISH)
  const prefix = `./locales/${lang}/`
  const parts = await Promise.all(
    Object.entries(DICTIONARIES)
      .filter(([path]) => path.startsWith(prefix))
      .map(([, load]) => load())
  )
  return Object.assign({}, ...parts)
}
