/**
 * Pure half of the interface-language gate (`scripts/check-interface-languages.ts`, spec #730):
 * given the English source of every namespace, each supported language's translations and the
 * committed debt ledger, say which gaps are new and which ledger entries are already paid.
 *
 * No file system, no process: the gate script gathers the inputs, this module decides. That split
 * is what lets `scripts/test/locale-ledger.test.ts` drive every rule with a few literal objects.
 *
 * A GAP is one (language, namespace, key) the customer would see in English:
 *   - `missing`: the language has no string for a key the English source has (or an empty one
 *     where the English is not empty);
 *   - `placeholder`: it has one, but its `{name}` placeholders differ from the English source, so
 *     the rendered text would drop a value or show a raw `{name}`.
 *
 * Entries are written `<namespace> <key>`: a space cannot occur in a namespace id or a key, so the
 * pair splits back unambiguously, and the ledger stays one readable line per gap.
 */

/** @typedef {Record<string, string>} Dict */
/** @typedef {{ missing: string[], placeholder: string[] }} LanguageDebt */
/** @typedef {Record<string, LanguageDebt>} Ledger */

/** The two kinds of gap, in the order the ledger lists them. */
export const GAP_KINDS = Object.freeze(['missing', 'placeholder'])

/**
 * The sorted `{name}` placeholders a template expects.
 * @param {string} text - one template string.
 * @returns {string} the placeholder names joined, for comparison.
 */
function placeholders(text) {
  return [...text.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join('|')
}

/**
 * Every gap of one language.
 * @param {Record<string, Dict>} source - English strings by namespace (the owners' `en`).
 * @param {Record<string, Dict>} translated - this language's strings by namespace.
 * @returns {LanguageDebt} sorted entries per kind.
 */
export function findGaps(source, translated) {
  /** @type {LanguageDebt} */
  const debt = { missing: [], placeholder: [] }
  for (const [ns, english] of Object.entries(source)) {
    const dict = translated[ns] ?? {}
    for (const [key, value] of Object.entries(english)) {
      const entry = `${ns} ${key}`
      const text = dict[key]
      // Only a truly empty string counts as missing: a whitespace value can be the translation
      // (French thousands separator " "), and an empty English string is translated by an empty one.
      if (typeof text !== 'string' || (text === '' && value !== '')) debt.missing.push(entry)
      else if (placeholders(text) !== placeholders(value)) debt.placeholder.push(entry)
    }
  }
  debt.missing.sort()
  debt.placeholder.sort()
  return debt
}

/**
 * Compare measured gaps with the ledger.
 * @param {Ledger} measured - gaps found now, per language.
 * @param {Ledger} ledger - gaps recorded as known debt, per language.
 * @returns {{ added: string[], paid: string[] }} `<language> <kind> <namespace> <key>` rows:
 *   `added` = gaps not in the ledger (a PR introduced them), `paid` = ledger rows no longer gaps
 *   (a PR translated them and must strike them).
 */
export function compareLedger(measured, ledger) {
  const rows = (debts) =>
    new Set(
      Object.entries(debts).flatMap(([lang, debt]) =>
        GAP_KINDS.flatMap((kind) => (debt?.[kind] ?? []).map((entry) => `${lang} ${kind} ${entry}`))
      )
    )
  const now = rows(measured)
  const known = rows(ledger)
  return {
    added: [...now].filter((row) => !known.has(row)).sort(),
    paid: [...known].filter((row) => !now.has(row)).sort()
  }
}

/**
 * The ledger with every paid row removed, never with a row added: striking is the only write a
 * translator needs, and a write that could also add would turn the gate into a rubber stamp.
 * @param {Ledger} measured - gaps found now.
 * @param {Ledger} ledger - the committed ledger.
 * @returns {Ledger} the ledger minus paid rows, languages and kinds kept in order.
 */
export function strikePaid(measured, ledger) {
  /** @type {Ledger} */
  const out = {}
  for (const [lang, debt] of Object.entries(ledger)) {
    const still = measured[lang] ?? { missing: [], placeholder: [] }
    out[lang] = {
      missing: (debt.missing ?? []).filter((e) => still.missing.includes(e)),
      placeholder: (debt.placeholder ?? []).filter((e) => still.placeholder.includes(e))
    }
  }
  return out
}

/**
 * Count rows per language, for the gate's summary line and the PR description.
 * @param {Ledger} ledger - any ledger.
 * @returns {Record<string, number>} rows per language.
 */
export function countRows(ledger) {
  return Object.fromEntries(
    Object.entries(ledger).map(([lang, debt]) => [
      lang,
      GAP_KINDS.reduce((n, k) => n + (debt[k]?.length ?? 0), 0)
    ])
  )
}

/**
 * The loud line the gate prints when the ledger is not empty, or null when it is (#754). The
 * ledger is honour-based: adding a row is a hand edit that hides English from the gate, and only a
 * reviewer can stop it. Saying the count on every run puts it in every CI log, so a PR that adds
 * debt cannot do so quietly. A warning, not a failure: known debt is allowed, hidden debt is not.
 * @param {Ledger} ledger - the committed ledger.
 * @returns {string | null} the warning, or null for an empty ledger.
 */
export function ledgerWarning(ledger) {
  const perLanguage = countRows(ledger)
  const total = Object.values(perLanguage).reduce((a, b) => a + b, 0)
  if (total === 0) return null
  return (
    `⚠⚠ check-interface-languages: the debt ledger scripts/locale-debt.json holds ${String(total)} ` +
    `untranslated row(s) ${JSON.stringify(perLanguage)}. A PR that ADDS rows hides English from ` +
    'the gate: it must say why in its description.'
  )
}

/**
 * A short fingerprint of an English source string. A translation is only as current as the English
 * it was made from: reword the English and every translation keeps the old meaning while every
 * gate stays green. Recording the fingerprint the translations were made against lets the gate say
 * which keys were reworded since (`staleSources`).
 * @param {string} text
 * @returns {string}
 */
export function sourceFingerprint(text) {
  // FNV-1a, 32 bit: stable, dependency-free, and plenty to tell two wordings of one key apart.
  let hash = 0x811c9dc5
  for (const ch of text) {
    hash ^= ch.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * The fingerprint table of a set of English sources, keyed `<namespace> <key>`, sorted.
 * @param {Record<string, Dict>} sources
 * @returns {Record<string, string>}
 */
export function fingerprints(sources) {
  /** @type {Record<string, string>} */
  const out = {}
  for (const [ns, dict] of Object.entries(sources))
    for (const [key, value] of Object.entries(dict)) out[`${ns} ${key}`] = sourceFingerprint(value)
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

/**
 * Keys whose English changed since the recorded table, plus keys the table has never seen. A key
 * that disappeared from the sources is not reported: nothing renders it any more.
 * @param {Record<string, string>} current - `fingerprints(sources)` now.
 * @param {Record<string, string>} recorded - the committed table.
 * @returns {{ reworded: string[], unrecorded: string[] }} `<namespace> <key>` entries, sorted.
 */
export function staleSources(current, recorded) {
  const reworded = []
  const unrecorded = []
  for (const [entry, hash] of Object.entries(current)) {
    if (!(entry in recorded)) unrecorded.push(entry)
    else if (recorded[entry] !== hash) reworded.push(entry)
  }
  return { reworded: reworded.sort(), unrecorded: unrecorded.sort() }
}
