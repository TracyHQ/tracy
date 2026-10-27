/**
 * Extract English locale dictionaries out of built DSH client bundles.
 *
 * The bundles are shipped as pre-built JavaScript, so there is no manifest of
 * their copy: the dictionaries have to be read back out of the source. Three
 * registration shapes appear across the packages, and all three are matched
 * here — see `extractEnglish`.
 *
 * @module tools/lib/extract-en
 */
import { readFileSync } from 'node:fs'
import { basename, dirname } from 'node:path'

/**
 * Slice the balanced object literal that starts at `start`, honouring string
 * literals and escapes so a brace inside copy does not end the match.
 * @param text - full bundle source.
 * @param start - index of the opening `{`.
 * @returns the literal including both braces.
 */
export function matchObject(text, start) {
  let depth = 0
  let inString = null
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString !== null) {
      if (ch === '\\') { i++; continue }
      if (ch === inString) inString = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { inString = ch; continue }
    if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) return text.slice(start, i + 1) }
  }
  throw new Error('unbalanced object literal')
}

/** Strip block and line comments that survive inside a bundled literal. */
function stripComments(literal) {
  return literal.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

/** Collect `const <name> = "literal"` string constants, keyed by variable name. */
export function collectStrings(text) {
  const strings = new Map()
  const re = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*"((?:[^"\\]|\\.)*)"/g
  let m
  while ((m = re.exec(text)) !== null) strings.set(m[1], m[2])
  return strings
}

/**
 * Collect flat `const <name> = { ... }` dictionary literals, keyed by variable
 * name. Values may be string literals or already-collected string constants,
 * because several bundles hoist copy shared between locales.
 */
export function collectObjects(text, strings) {
  const objects = new Map()
  const re = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\{/g
  const names = [...strings.keys()]
  const values = names.map((name) => strings.get(name))
  const keyPattern = String.raw`(?:"(?:[^"\\]|\\.)*"|[A-Za-z_$][\w$]*)`
  const valuePattern = String.raw`(?:"(?:[^"\\]|\\.)*"|[A-Za-z_$][\w$]*)`
  const flat = new RegExp(String.raw`^\{\s*(?:${keyPattern}\s*:\s*${valuePattern}\s*,?\s*)+\}$`, 's')
  let m
  while ((m = re.exec(text)) !== null) {
    let literal
    try { literal = stripComments(matchObject(text, m.index + m[0].length - 1)) } catch { continue }
    if (!flat.test(literal)) continue
    let parsed
    try { parsed = new Function(...names, `return ${literal}`)(...values) } catch { continue }
    if (Object.values(parsed).some((entry) => typeof entry !== 'string')) continue
    objects.set(m[1], parsed)
  }
  return objects
}

/**
 * Read the dictionaries of one locale out of every bundle.
 *
 * Recognised registration shapes:
 * - typed:      `locale.register(NS, { en, zh })` — dictionaries hoisted to consts.
 * - per-locale: `locale.register(NS, "en", { ... })` — one call per locale.
 * - table:      `for (const [locale, dict] of [["en", { ... }], ...])`.
 *
 * @param bundles - absolute paths to built client bundles.
 * @param locale - locale id to read, e.g. `en` or `zh`.
 * @returns dictionaries by namespace, the owning package per namespace, and warnings.
 */
export function extractEnglish(bundles, locale = 'en') {
  const dicts = {}
  const owners = {}
  const warnings = []

  for (const bundlePath of bundles) {
    const label = basename(dirname(dirname(bundlePath))) || bundlePath
    let text
    try { text = readFileSync(bundlePath, 'utf8') } catch { warnings.push(`unreadable ${bundlePath}`); continue }
    if (!text.includes('locale.register(')) continue

    const strings = collectStrings(text)
    const objects = collectObjects(text, strings)

    /** Resolve a register() first argument to its literal namespace. */
    const nsOf = (raw) => {
      const trimmed = raw.trim()
      return /^"/.test(trimmed) ? JSON.parse(trimmed) : strings.get(trimmed)
    }

    /** Record one namespace dictionary, remembering which package owns it. */
    const record = (ns, dict) => {
      dicts[ns] = { ...(dicts[ns] ?? {}), ...dict }
      owners[ns] = label
    }

    const typed = /locale\.register\(([^,()]+),\s*\{([^{}]*)\}\s*\)/g
    let m
    while ((m = typed.exec(text)) !== null) {
      const ns = nsOf(m[1])
      if (ns === undefined) { warnings.push(`${label}: unresolved namespace ${m[1].trim()}`); continue }
      const body = m[2]
      const explicit = new RegExp(String.raw`(?:^|[\s,])${locale}\s*:\s*([A-Za-z_$][\w$]*)`).exec(body)
      const shorthand = new RegExp(String.raw`(?:^|[\s,])(${locale}(?:\$\d+)?)\s*(?:,|$)`).exec(body)
      const varName = explicit?.[1] ?? shorthand?.[1] ?? locale
      const dict = objects.get(varName)
      if (dict === undefined) { warnings.push(`${label}/${ns}: no ${locale} dictionary variable ${varName}`); continue }
      record(ns, dict)
    }

    const perLocale = new RegExp(String.raw`locale\.register\(([^,()]+),\s*"([\w-]+)"\s*,\s*\{`, 'g')
    while ((m = perLocale.exec(text)) !== null) {
      if (m[2] !== locale) continue
      const ns = nsOf(m[1])
      if (ns === undefined) { warnings.push(`${label}: unresolved namespace ${m[1].trim()}`); continue }
      const literal = matchObject(text, m.index + m[0].length - 1)
      const names = [...objects.keys()]
      let dict
      try { dict = new Function(...names, `return ${literal}`)(...names.map((n) => objects.get(n))) }
      catch (error) { warnings.push(`${label}/${ns}: unparsable inline dictionary (${error.message})`); continue }
      record(ns, dict)
    }

    if (/for \(const \[locale, dict\] of/.test(text)) {
      const tableNs = /LOCALE_NS\s*=\s*"([^"]+)"/.exec(text)
      const pairs = new RegExp(String.raw`\[\s*"${locale}"\s*,\s*\{`, 'g')
      let p
      while ((p = pairs.exec(text)) !== null) {
        if (tableNs === null) { warnings.push(`${label}: table registration without LOCALE_NS`); continue }
        const literal = matchObject(text, p.index + p[0].length - 1)
        let dict
        try { dict = new Function(`return ${literal}`)() } catch { continue }
        record(tableNs[1], dict)
      }
    }
  }

  const namespaces = Object.keys(dicts).sort()
  const ordered = {}
  for (const ns of namespaces) {
    ordered[ns] = Object.fromEntries(Object.keys(dicts[ns]).sort().map((k) => [k, dicts[ns][k]]))
  }
  return { dicts: ordered, owners, warnings }
}
