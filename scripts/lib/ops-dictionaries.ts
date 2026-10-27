/**
 * The decision of gate `ops-languages`: the /ops SPA's dictionaries (`packages/web/tracy-harness/
 * src/i18n/`) are complete in every interface language, for every namespace that exists, with no
 * debt ledger (plan `tasks/todo-ops-i18n.md`, D2). Four layers, per namespace:
 *   1. every `en` key is in each `locales/<lang>/<ns>.json`: non-empty, not the sentinel, the same
 *      `{placeholder}`s and `<Trans>` tags, no em dash, every kept English term of `terms.ts` kept, no extra keys,
 *      canonical text (sorted, one key per line) so a diff names the key;
 *   2. `fingerprints/<ns>.json` records the English each translation was made from: a reworded
 *      source is red until it is retranslated and accepted (`--accept-sources`);
 *   3. no bare English literal (`ui-literals.mjs`) in any file the namespace's `SCREENS` lists;
 *   4. every listed screen exists and belongs to one namespace only.
 * Pure: the gate (`scripts/check-ops-languages.ts`) reads the tree and hands everything in.
 */
import { lostTerms } from './kept-terms.ts'
import { sourceFingerprint, staleSources } from './locale-ledger.mjs'
import { bareLiterals } from './ui-literals.mjs'

type Dict = Record<string, string>

/** One namespace module, as imported: `ns/<file>` exporting `NS`, `SCREENS` and `en`. */
export interface NamespaceModule {
  readonly file: string
  readonly NS: unknown
  readonly SCREENS: unknown
  readonly en: unknown
}

export interface OpsTree {
  /** Shown interface language ids, English included. */
  readonly languages: readonly string[]
  readonly namespaces: readonly NamespaceModule[]
  /** `locales/<lang>/<ns>.json` text per language folder found; a missing file is absent. */
  readonly locales: Readonly<Record<string, Readonly<Record<string, string | undefined>>>>
  /** `fingerprints/<ns>.json` text; a missing file is absent. */
  readonly fingerprints: Readonly<Record<string, string | undefined>>
  /** Source text of each file a `SCREENS` list names (relative to `src/`); a missing file is absent. */
  readonly screens: Readonly<Record<string, string | undefined>>
}

/** Placeholder names of a string, sorted, duplicates kept. */
const placeholdersOf = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

/** `<Trans>` tag names of a string (`<a>`, `</a>`, `<br/>` → a, br), sorted, duplicates kept. */
const tagsOf = (text: string): string[] =>
  [...text.matchAll(/<\/?([a-zA-Z][\w-]*)\s*\/?>/g)]
    .filter((m) => !m[0].startsWith('</'))
    .map((m) => m[1])
    .sort()

const SENTINEL = '[to be translated]'

/** A dictionary as committed: sorted keys, one per line, two-space indent, final newline. */
export function canonicalJson(dict: Readonly<Record<string, unknown>>): string {
  const sorted = Object.fromEntries(
    Object.keys(dict)
      .sort()
      .map((key) => [key, dict[key]])
  )
  return `${JSON.stringify(sorted, null, 2)}\n`
}

/** The fingerprint file of one namespace's English, as `--accept-sources` writes it. */
export function fingerprintText(en: Readonly<Record<string, string>>): string {
  return canonicalJson(
    Object.fromEntries(Object.entries(en).map(([key, text]) => [key, sourceFingerprint(text)]))
  )
}

const nsOf = (file: string) => file.replace(/\.ts$/, '')

const isDict = (value: unknown): value is Dict =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.values(value).every((v) => typeof v === 'string')

function parseDict(text: string, where: string, problems: string[]): Dict | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    problems.push(`${where}: not valid JSON (${error instanceof Error ? error.message : String(error)})`)
    return null
  }
  if (!isDict(parsed)) {
    problems.push(`${where}: not a flat JSON object of strings`)
    return null
  }
  if (text !== canonicalJson(parsed))
    problems.push(`${where}: not canonical (sorted keys, one per line, two-space indent, final newline)`)
  return parsed
}

function shapeProblems(mod: NamespaceModule): {
  ns: string
  en: Dict | null
  screens: string[]
  problems: string[]
} {
  const ns = nsOf(mod.file)
  const problems: string[] = []
  if (mod.NS !== ns) problems.push(`ns/${mod.file}: NS is ${JSON.stringify(mod.NS)}, the file is ${ns}`)
  const screens =
    Array.isArray(mod.SCREENS) && mod.SCREENS.every((s) => typeof s === 'string') ? [...mod.SCREENS] : null
  if (!screens) problems.push(`ns/${mod.file}: SCREENS is not a list of file paths under src/`)
  if (!isDict(mod.en)) {
    problems.push(`ns/${mod.file}: en is not a flat object of strings`)
    return { ns, en: null, screens: screens ?? [], problems }
  }
  for (const [key, text] of Object.entries(mod.en)) {
    if (!key.startsWith(`${ns}.`)) problems.push(`ns/${mod.file}: key "${key}" does not start with "${ns}."`)
    if (text.trim() === '') problems.push(`ns/${mod.file}: "${key}" is empty in English`)
  }
  return { ns, en: mod.en, screens: screens ?? [], problems }
}

function translationProblems(ns: string, en: Dict, lang: string, text: string | undefined): string[] {
  const where = `locales/${lang}/${ns}.json`
  if (text === undefined) return [`${where}: missing (${Object.keys(en).length} keys to translate)`]
  const problems: string[] = []
  const dict = parseDict(text, where, problems)
  if (!dict) return problems
  for (const [key, source] of Object.entries(en)) {
    if (!Object.hasOwn(dict, key)) {
      problems.push(`${where}: missing key "${key}" (English: ${JSON.stringify(source)})`)
      continue
    }
    const value = dict[key]
    if (value.trim() === '') {
      problems.push(`${where}: "${key}" is empty`)
      continue
    }
    if (value.trim() === SENTINEL) problems.push(`${where}: "${key}" is still ${SENTINEL}`)
    const want = placeholdersOf(source).join(',')
    const have = placeholdersOf(value).join(',')
    if (want !== have) problems.push(`${where}: "${key}" has placeholders {${have}}, English has {${want}}`)
    const wantTags = tagsOf(source).join(',')
    const haveTags = tagsOf(value).join(',')
    if (wantTags !== haveTags)
      problems.push(`${where}: "${key}" has tags <${haveTags}>, English has <${wantTags}>`)
    if (value.includes('—')) problems.push(`${where}: "${key}" contains an em dash`)
  }
  for (const lost of lostTerms(lang, ns, en, dict))
    problems.push(
      `${where}: "${lost.key}" dropped the kept term "${lost.term}" (terms.ts; English: ${lost.source})`
    )
  for (const key of Object.keys(dict))
    if (!Object.hasOwn(en, key)) problems.push(`${where}: extra key "${key}" (not in ns/${ns}.ts)`)
  return problems
}

function fingerprintProblems(ns: string, en: Dict, text: string | undefined): string[] {
  const where = `fingerprints/${ns}.json`
  if (text === undefined)
    return [`${ns}: no fingerprints (${where}) → translate every key, then --accept-sources`]
  const problems: string[] = []
  const recorded = parseDict(text, where, problems)
  if (!recorded) return problems
  const current = JSON.parse(fingerprintText(en)) as Dict
  const { reworded, unrecorded } = staleSources(current, recorded)
  for (const key of reworded)
    problems.push(
      `${key}: the English changed since it was translated → retranslate it in every language, then --accept-sources`
    )
  for (const key of unrecorded)
    problems.push(`${key}: new English source → translate it in every language, then --accept-sources`)
  return problems
}

/** Every problem of the /ops dictionaries, one line each; empty when green. */
export function opsLanguageProblems(tree: OpsTree): string[] {
  const problems: string[] = []
  const translated = tree.languages.filter((l) => l !== 'en')
  for (const dir of Object.keys(tree.locales).sort())
    if (!translated.includes(dir))
      problems.push(`locales/${dir}: not an interface language other than English (${translated.join(' ')})`)
  const owners = new Map<string, string[]>()
  for (const mod of tree.namespaces) {
    const shape = shapeProblems(mod)
    problems.push(...shape.problems)
    for (const screen of shape.screens) {
      owners.set(screen, [...(owners.get(screen) ?? []), shape.ns])
      const source = tree.screens[screen]
      if (source === undefined) {
        problems.push(`${shape.ns}: SCREENS names ${screen}, which does not exist under src/`)
        continue
      }
      for (const x of bareLiterals(screen, source))
        problems.push(
          `${x.file}:${String(x.line)}: English ${x.kind} "${x.text}" outside t() → a key in ns/${shape.ns}.ts`
        )
    }
    if (!shape.en) continue
    for (const lang of translated)
      problems.push(...translationProblems(shape.ns, shape.en, lang, tree.locales[lang]?.[shape.ns]))
    problems.push(...fingerprintProblems(shape.ns, shape.en, tree.fingerprints[shape.ns]))
  }
  for (const [screen, nss] of owners)
    if (nss.length > 1)
      problems.push(`${screen} is claimed by ${nss.join(' and ')}: one namespace owns a file`)
  return problems
}
