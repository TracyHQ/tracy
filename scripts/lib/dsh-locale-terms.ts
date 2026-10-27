/**
 * The decisions of the `dsh-locale` gate, as functions a test can call (#797, F-S2-009).
 *
 * The gate itself (`scripts/check-dsh-locale.ts`) only gathers the catalogues and prints; what
 * counts as a problem is decided here. Four things, per namespace:
 *   1. a key the owner has and the translation lacks, or the reverse;
 *   2. `{placeholder}` sets that differ;
 *   3. a value still equal to the English source, unless it is a recorded decision
 *      (`keptVerbatim`) or holds a keep-verbatim term;
 *   4. a keep-verbatim term the English source holds and the translation dropped. EVERY term of
 *      the source must survive, not any one of them: a sentence that keeps "site" and turns
 *      "file" into "tệp" is the defect this rule exists for.
 *
 * The term list binds Vietnamese only (`packages/locale/tracy-locale-vi/terms.ts`), so this module
 * is called for `vi` and for nothing else.
 */
import { hasTerm, KEEP_VERBATIM_TERMS } from '../../packages/locale/tracy-locale-vi/terms.ts'

type Dict = Record<string, string>

/** The `{name}` placeholders of a string, sorted. */
export const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

/** Whether the text holds any keep-verbatim term at all. */
export const keepsAnyTerm = (text: string, terms: readonly string[] = KEEP_VERBATIM_TERMS): boolean =>
  terms.some((term) => hasTerm(text, term))

/**
 * The keep-verbatim terms the source holds and the translation does not.
 * Same boundary and English-plural rule as `hasTerm`: "sites" in the source is kept by "site".
 */
export const droppedTerms = (
  source: string,
  translated: string,
  terms: readonly string[] = KEEP_VERBATIM_TERMS
): string[] => terms.filter((term) => hasTerm(source, term) && !hasTerm(translated, term))

/**
 * Every problem of one namespace's translation, one line each, in the gate's wording.
 * @param ns - the namespace, used as the prefix of each line.
 * @param source - the owner's English strings.
 * @param translated - the parsed `vi/<ns>.json`; anything but a flat string dictionary is reported.
 * @param keptVerbatim - `ns.key` entries allowed to equal the English source.
 * @param terms - the keep-verbatim list; the Vietnamese one unless a test passes its own.
 */
export function namespaceProblems(
  ns: string,
  source: Dict,
  translated: unknown,
  keptVerbatim: ReadonlySet<string> = new Set(),
  terms: readonly string[] = KEEP_VERBATIM_TERMS
): string[] {
  if (translated === null || typeof translated !== 'object' || Array.isArray(translated)) {
    return [`  ${ns}: the translation is not a key → string dictionary`]
  }
  const dict = translated as Record<string, unknown>
  const problems: string[] = []
  for (const key of Object.keys(source)) {
    if (!(key in dict)) problems.push(`  ${ns}.${key}: missing translation`)
  }
  for (const key of Object.keys(dict)) {
    if (!(key in source)) problems.push(`  ${ns}.${key}: extra key, the owning plugin has none`)
  }
  for (const [key, value] of Object.entries(dict)) {
    if (!(key in source)) continue
    if (typeof value !== 'string') {
      problems.push(`  ${ns}.${key}: value is not a string`)
      continue
    }
    const a = placeholders(source[key])
    const b = placeholders(value)
    if (a.join('|') !== b.join('|')) {
      problems.push(`  ${ns}.${key}: placeholder mismatch — en {${a}} vs vi {${b}}`)
    }
    if (value === source[key] && !keptVerbatim.has(`${ns}.${key}`) && !keepsAnyTerm(value, terms)) {
      problems.push(`  ${ns}.${key}: still verbatim English`)
    }
    for (const term of droppedTerms(source[key], value, terms)) {
      problems.push(`  ${ns}.${key}: lost keep-verbatim term "${term}" (terms.ts) — en: ${source[key]}`)
    }
  }
  return problems
}

/** How many of a namespace's translated strings the checks above looked at. */
export const checkedCount = (source: Dict, translated: unknown): number =>
  translated !== null && typeof translated === 'object'
    ? Object.keys(translated as Dict).filter((key) => key in source).length
    : 0
