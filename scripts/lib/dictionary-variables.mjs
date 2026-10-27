/**
 * Second reader for locale dictionaries the first one (`dsh-locale-vi/tools/lib/extract-en.mjs`)
 * gives up on, so `check-interface-languages` can measure them instead of exempting them.
 *
 * The first reader only accepts a FLAT literal declared as `const <name> = { ... }`. Two shapes
 * in the `native` profile fail that test (measured 02/10/2026):
 *   - a dictionary that spreads another one: `const en$4 = { ...zoomEn, title: "Image" }`
 *     (`ui-sidebar-documentpreview`, namespaces `sidebarImage` and `sidebarPdf`);
 *   - a minified bundle that declares dictionaries in a comma list: `...},sa={sectionTitle:...}`
 *     (`dsh-passwords`, namespace `dshpw`).
 * This reader finds the variable in either declaration form and resolves `...name` spreads of
 * other dictionary variables, recursively. Everything else must still be a string, or the
 * dictionary is reported unreadable (never half read).
 *
 * It also reads a third registration shape, a wrapper called once per language
 * ({@link readWrappedRegistrations}), and names bundles that register a namespace no reader sees
 * ({@link silentRegistrations}).
 *
 * Pure: takes bundle text, returns dictionaries, warnings or labels.
 */
import { matchObject } from '../../vendor/tracy/dsh-locale-vi/tools/lib/extract-en.mjs'

/** A JavaScript identifier, escaped for use inside a RegExp. */
const escape = (/** @type {string} */ name) => name.replaceAll('$', '\\$')

/**
 * Read one dictionary variable out of a built bundle.
 * @param {string} text - the bundle source.
 * @param {string} name - the variable the `locale.register(ns, { en: <name> })` call names.
 * @param {Set<string>} [seen] - variables already being read (guards a spread cycle).
 * @returns {Record<string, string> | undefined} the dictionary, or nothing when unreadable.
 */
export function readDictionaryVariable(text, name, seen = new Set()) {
  if (seen.has(name)) return undefined
  seen.add(name)
  // `const|let|var <name> = {` or `, <name> = {` (a later declarator of the same statement).
  const declaration = new RegExp(String.raw`(?:\b(?:const|let|var)\s+|,\s*)${escape(name)}\s*=\s*\{`, 'g')
  for (const match of text.matchAll(declaration)) {
    let literal
    try {
      literal = matchObject(text, match.index + match[0].length - 1)
    } catch {
      continue
    }
    literal = literal.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
    // Spreads are read with every string literal blanked out: an ellipsis in copy ("Paste DSHE...
    // encrypted") is text, and taking it for `...encrypted` left the whole dictionary unread.
    const code = literal.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""')
    const spreads = [...code.matchAll(/\.\.\.\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1])
    const parts = spreads.map((spread) => readDictionaryVariable(text, spread, new Set(seen)))
    if (parts.some((part) => part === undefined)) continue
    let parsed
    try {
      parsed = new Function(...spreads, `return ${literal}`)(...parts)
    } catch {
      continue
    }
    if (parsed === null || typeof parsed !== 'object') continue
    if (Object.values(parsed).every((value) => typeof value === 'string')) return parsed
  }
  return undefined
}

/** The warning the first reader writes when it cannot read a typed dictionary. */
const UNREAD =
  /^(?<label>[^/]+)\/(?<ns>.+): no (?<locale>[\w-]+) dictionary variable (?<variable>[A-Za-z_$][\w$]*)$/

/**
 * Parse a first-reader warning that this reader may be able to recover.
 * @param {string} warning - e.g. `ui-sidebar-documentpreview/sidebarImage: no en dictionary variable en$4`.
 * @returns {{ label: string, ns: string, locale: string, variable: string } | undefined}
 */
export function parseUnreadWarning(warning) {
  const groups = UNREAD.exec(warning)?.groups
  return groups === undefined
    ? undefined
    : { label: groups.label, ns: groups.ns, locale: groups.locale, variable: groups.variable }
}

/** A string literal in single or double quotes, captured without its quotes. */
const QUOTED = String.raw`(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')`
const IDENT = String.raw`[A-Za-z_$][\w$]*`

/**
 * The literal a namespace argument names: a quoted string, or a variable declared as one
 * (`const NS = 'dsh-subscriptions'`, either quote).
 * @param {string} text - the bundle source.
 * @param {string} raw - the first argument of the register call.
 * @returns {string | undefined}
 */
function namespaceOf(text, raw) {
  const literal = new RegExp(`^${QUOTED}$`).exec(raw.trim())
  if (literal !== null) return literal[1] ?? literal[2]
  if (!new RegExp(`^${IDENT}$`).test(raw.trim())) return undefined
  const declared = new RegExp(
    String.raw`(?:\b(?:const|let|var)\s+|,\s*)${escape(raw.trim())}\s*=\s*${QUOTED}`
  ).exec(text)
  return declared === null ? undefined : (declared[1] ?? declared[2])
}

/**
 * Third shape (`dsh-subscriptions`, measured 02/10/2026, issue #765): the locale is a VARIABLE,
 * because the call sits in a small wrapper the plugin calls once per language:
 *
 *   const addLocale = (locale, dictionary) => { try { return ctx.locale.register(NS, locale, dictionary) } catch { … } }
 *   addLocale('en', en), addLocale('zh', zh)
 *
 * The reader finds `locale.register(<ns>, <param>, <param>)`, the nearest wrapper before it that
 * takes exactly those two parameters (`(a, b) =>` or `function name(a, b)`), and every call of that
 * wrapper with the wanted locale as a literal; the dictionary named there goes through
 * {@link readDictionaryVariable}. A call it finds but cannot follow is a warning, never a guess.
 * @param {string} text - the bundle source.
 * @param {string} locale - e.g. `en`.
 * @returns {{ dicts: Record<string, Record<string, string>>, warnings: string[] }}
 */
export function readWrappedRegistrations(text, locale) {
  /** @type {Record<string, Record<string, string>>} */
  const dicts = {}
  /** @type {string[]} */
  const warnings = []
  const call = new RegExp(
    String.raw`locale\.register\(\s*([^,()]+?)\s*,\s*(${IDENT})\s*,\s*(${IDENT})\s*\)`,
    'g'
  )
  for (const match of text.matchAll(call)) {
    const [, rawNs, localeParam, dictParam] = match
    const ns = namespaceOf(text, rawNs)
    if (ns === undefined) {
      warnings.push(
        `unresolved namespace ${rawNs.trim()} in locale.register(${rawNs.trim()}, ${localeParam}, ${dictParam})`
      )
      continue
    }
    const params = String.raw`\(\s*${escape(localeParam)}\s*,\s*${escape(dictParam)}\s*\)`
    const wrapper = new RegExp(
      String.raw`(?:\b(?:const|let|var)\s+(${IDENT})\s*=\s*(?:async\s*)?${params}\s*=>|\bfunction\s+(${IDENT})\s*${params})`,
      'g'
    )
    const before = [...text.slice(0, match.index).matchAll(wrapper)].at(-1)
    const name = before?.[1] ?? before?.[2]
    if (name === undefined) {
      warnings.push(
        `${ns}: locale.register with a variable locale outside a (${localeParam}, ${dictParam}) wrapper`
      )
      continue
    }
    const uses = new RegExp(
      String.raw`\b${escape(name)}\(\s*["']${escape(locale)}["']\s*,\s*(${IDENT})\s*\)`,
      'g'
    )
    for (const use of text.matchAll(uses)) {
      const dict = readDictionaryVariable(text, use[1])
      if (dict === undefined) warnings.push(`${ns}: no ${locale} dictionary variable ${use[1]}`)
      else dicts[ns] = { ...dicts[ns], ...dict }
    }
  }
  return { dicts, warnings }
}

/**
 * Bundles that call `locale.register(` yet gave no namespace to any reader: a registration shape
 * nobody reads, which would leave a whole plugin unmeasured without a single warning (how
 * `dsh-subscriptions` went unseen until #765). Bundles in `kept` are left out (each with a reason
 * at the call site: a language pack registers other plugins' namespaces, never an `en`).
 * @param {{ label: string, text: string }[]} bundles - every measured bundle.
 * @param {Set<string>} readLabels - labels some reader took at least one namespace from.
 * @param {ReadonlyMap<string, string>} kept - label → reason.
 * @returns {string[]} the labels to fail on.
 */
export function silentRegistrations(bundles, readLabels, kept) {
  return bundles
    .filter((b) => b.text.includes('locale.register(') && !readLabels.has(b.label) && !kept.has(b.label))
    .map((b) => b.label)
}
