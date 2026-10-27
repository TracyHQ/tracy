/**
 * THE DESCRIBE DOCUMENT AS THE MODEL READS IT: THE SAME FACTS IN FEWER CHARACTERS.
 *
 * 🔒 WHY (round 7 follow-up, 30/09/2026). `content.read {describe:true}` answers 35,350 characters on
 * WordPress and 14,949 on Joomla, and the answer stays in every later step of the conversation. Two things
 * in it say nothing twice:
 * - `blockKinds` (22,908 of the WordPress 35,350) carries 454 keys holding `null`: `translatable` on every
 *   field, `requiresEvidence` and `emptyAllowed` on every constraints object, `label`/`root`/`nestable` on
 *   every kind. The content API defines `null` there as "the relay did not determine it; implies
 *   nothing" (`packages/cms/tracy-content-api/README.md`), and a key that is absent says exactly that.
 *   Dropping them leaves 13,286 characters.
 * - `i18n.locales` repeats `site.locales` (355 characters on WordPress, 85 on Joomla) — when it is that
 *   same list, in that same order.
 *
 * LOSSLESS, AND NOTHING ELSE. Every removed leaf is a `null` object key under `blockKinds`, or the
 * duplicate list; every other leaf stays at its path, equal (`test/describe-compact.test.mjs` proves it leaf
 * by leaf). A null outside `blockKinds` is the relay's own statement — a type's unknown `count`, a
 * `next: null` (no ready call) — and stays. A cut of `blockKinds` fields or of `where` is NOT here: a
 * model finds `hero.img` in the one and the SEO, menu and form roads in the other, and nothing proves
 * a cut harmless (it needs pass rate and step count over several waves).
 *
 * HOST SIDE ONLY. The describe is public API v1 (`tracy-content-describe/v1`, whose schema requires every
 * nullable key to be present): the relay's document and `apps/tracy-web`'s output are untouched. This runs on
 * the copy the model is about to read, in `site-call.mjs`.
 *
 * Pure: no I/O.
 */

/** The describe document's own version string (`CONTENT_DESCRIBE` in `site-call.mjs`; a test holds them equal). */
export const DESCRIBE_SCHEMA = 'tracy-content-describe/v1'

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * A copy of `value` without the object keys that hold `null`, at any depth. A list keeps every item in
 * its place, a `null` item included: there a position, not a key, says what is where.
 * @param {unknown} value
 * @returns {unknown}
 */
function withoutNullKeys(value) {
  if (Array.isArray(value)) return value.map(withoutNullKeys)
  if (!isRecord(value)) return value
  // `fromEntries` defines own properties: a key named `__proto__` in the data stays data.
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== null)
      .map(([k, v]) => [k, withoutNullKeys(v)])
  )
}

/**
 * Whether two lists of locales are the same list: the same entries in the same order.
 * @param {unknown} a @param {unknown} b
 */
const sameList = (a, b) =>
  Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i])

/**
 * The describe document without what it says twice or says as `null`. Anything that is not a
 * describe document is returned as it came (the same value, not a copy); the input is never changed.
 * @param {unknown} doc
 * @returns {unknown}
 */
export function compactDescribe(doc) {
  if (!isRecord(doc) || doc.schemaVersion !== DESCRIBE_SCHEMA) return doc
  /** @type {Record<string, unknown>} */
  let out = doc
  if (Array.isArray(doc.blockKinds)) out = { ...out, blockKinds: withoutNullKeys(doc.blockKinds) }
  if (isRecord(doc.i18n) && isRecord(doc.site) && sameList(doc.i18n.locales, doc.site.locales)) {
    const { locales: _same, ...rest } = doc.i18n
    out = { ...out, i18n: rest }
  }
  return out
}
