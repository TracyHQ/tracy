/**
 * The keep-verbatim rule for every translated language (05/10/2026): an English source
 * that holds a listed term keeps that same term in every translation, Vietnamese and the six
 * catalogues of `packages/locale/tracy-locales` alike. The list is `terms.ts`; this module is
 * the decision, so a test can call it without reading the disk.
 */
import { droppedTerms } from './dsh-locale-terms.ts'

type Dict = Record<string, string>

/** The text with every `{placeholder}` removed: a placeholder named `{theme}` is not the word. */
const withoutPlaceholders = (text: string): string => text.replace(/\{\w+\}/g, ' ')

/** One lost term: where, which term, and the English it came from. */
export interface LostTerm {
  readonly lang: string
  readonly ns: string
  readonly key: string
  readonly term: string
  readonly source: string
}

/**
 * Every listed term an English source holds that its translation dropped.
 * @param lang - the language code, for the report.
 * @param ns - the namespace, for the report.
 * @param source - the plugin's English dictionary.
 * @param translated - the language's dictionary for the same namespace; keys it lacks are
 *   another gate's business (`interface-languages`), so they are skipped here.
 */
export function lostTerms(lang: string, ns: string, source: Dict, translated: Dict): LostTerm[] {
  const out: LostTerm[] = []
  for (const [key, english] of Object.entries(source)) {
    const value = translated[key]
    if (typeof value !== 'string') continue
    for (const term of droppedTerms(withoutPlaceholders(english), withoutPlaceholders(value))) {
      out.push({ lang, ns, key, term, source: english })
    }
  }
  return out
}
