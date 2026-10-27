/**
 * What an EmDash template's `seed/personalize.json` does to each field of its demo seed: the rules
 * that WRITE a field anew (`identity`, `copy`, `blocks`, `rewrite`, `facts`, `trim`) against those
 * that only translate it (`labels`) or only swap the demo brand inside it (`replace`). Shared by
 * ABOUT-1, ABOUT-2 and HIDDEN-1, which all ask "does anything rewrite this demo text?".
 *
 * A field only `labels` or `replace` reach is still the demo's words (spec, ABOUT-2 and HIDDEN-1).
 */
import { templateSourceFiles } from './template-source-files.js'

/** Rule kinds that put the customer's own text in place of a field. */
export const WRITING_KINDS = Object.freeze(['identity', 'copy', 'blocks', 'rewrite', 'facts', 'trim'])

/**
 * The packed EmDash source's personalize rules, seed and template config, or null when the release
 * carries no source zip (the parts read are named in `missing`).
 * @param {import('../index.js').RuleContext} context
 */
export async function emdashTemplate(context) {
  const files = await templateSourceFiles(context)
  if (!files) return null
  const json = (/** @type {string} */ name) => {
    const text = files.get(name)
    return text === undefined ? null : JSON.parse(text)
  }
  return {
    files,
    personalize: json('seed/personalize.json'),
    seed: json('seed/seed.json'),
    config: json('template.config.json')
  }
}

/**
 * The default-locale entries of a seed, per collection.
 * @param {any} seed
 * @returns {{ collection: string, slug: string, data: Record<string, any> }[]}
 */
export function defaultEntries(seed) {
  const locale = seed?.defaultLocale ?? 'en'
  const out = []
  for (const [collection, entries] of Object.entries(seed?.content ?? {}))
    for (const e of /** @type {any[]} */ (entries))
      if ((e.locale ?? locale) === locale) out.push({ collection, slug: e.slug, data: e.data ?? {} })
  return out
}

/**
 * A lookup from (collection, slug, field) to the rule kinds that reach that field.
 * @param {any} personalize
 */
export function coverageOf(personalize) {
  const p = personalize ?? {}
  /** @type {(r: any, collection: string, slug: string) => boolean} */
  const sameEntry = (r, collection, slug) =>
    r.collection === collection && (r.slug == null || r.slug === slug)
  /**
   * @param {string} collection
   * @param {string} slug
   * @param {string} field
   * @returns {string[]}
   */
  return (collection, slug, field) => {
    const kinds = []
    for (const kind of ['identity', 'copy', 'blocks', 'facts'])
      if ((p[kind] ?? []).some((r) => sameEntry(r, collection, slug) && r.field === field)) kinds.push(kind)
    if (
      (p.rewrite ?? []).some(
        (r) =>
          r.collection === collection &&
          ((r.fields ?? []).includes(field) || (r.body && field === 'content') || field in (r.lists ?? {}))
      )
    )
      kinds.push('rewrite')
    if ((p.trim ?? []).some((r) => r.collection === collection)) kinds.push('trim')
    if (
      (p.labels ?? []).some(
        (r) => sameEntry(r, collection, slug) && (!Array.isArray(r.fields) || r.fields.includes(field))
      )
    )
      kinds.push('labels')
    if ((p.replace ?? []).length) kinds.push('replace')
    return kinds
  }
}

/** Whether a list of kinds holds one that writes the field anew. */
export const isRewritten = (/** @type {string[]} */ kinds) => kinds.some((k) => WRITING_KINDS.includes(k))

/**
 * Every string inside a field value (portable text spans, list items, nested objects).
 * @param {unknown} value
 * @returns {string[]}
 */
export function stringsIn(value) {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(stringsIn)
  if (value && typeof value === 'object')
    return Object.entries(value)
      .filter(([k]) => !k.startsWith('_') && k !== 'style' && k !== 'marks')
      .flatMap(([, v]) => stringsIn(v))
  return []
}
