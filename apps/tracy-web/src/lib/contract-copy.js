/**
 * What a template declares about its demo COPY, beside the content contract (D6 + D7,
 * 09/10/2026; spec `tasks/spec-template-customization-question-readiness.md`):
 *
 * - `keptText`: demo text kept on purpose (a legal page, a tokenized copyright line). An id is an
 *   entity (`module-110`, `page-contact`, `part-footer`, EmDash `pages/terms`), an entity plus one
 *   field (`article-5.introtext`, `module-110.params`, `part-footer.footer.copyright`, EmDash
 *   `investors/investors.lede`), or a slot key. Readiness rule ABOUT-2 does not count it.
 * - `demoCompanyNames`: every spelling of the demo company's name. ABOUT-3 holds the demo's own
 *   name (Joomla `$sitename`, WordPress `blogname`, EmDash `site.title`) to it, and it is the list a
 *   build renames in kept demo text (D9).
 *
 * WHERE. Joomla and WordPress: `<version>.copy.json` BESIDE the profile directory, like
 * `<version>.design.json` (`contracts.js` says why: the directory is a sealed package the pinned
 * plugin carries byte for byte; a file beside it is Tracy's and ships in no plugin zip). EmDash: the
 * same two keys inside the theme's `seed/personalize.json`, which ships in the release's source zip.
 *
 * The contracts gate (`scripts/check-contracts.ts`) holds both to the shape and the ids below; the
 * readiness rules read them through `readContractCopy` and `isKeptBy`.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/** The keys of a copy file, and the only keys it may hold. */
export const COPY_KEYS = Object.freeze(['keptText', 'demoCompanyNames'])

/** The copy file of a profile directory: beside it, never inside it. */
export const copyFileOf = (/** @type {string} */ dir) => `${dir}.copy.json`

/** WordPress template parts ABOUT-2 reads; they are not content-map entities. */
const WORDPRESS_PARTS = ['part-header', 'part-footer']

/**
 * The parsed copy file of a profile directory; undefined when there is none. A file that is not
 * JSON throws: a gate must see it, a rule must not read half of it.
 * @param {string} dir the profile's directory
 * @returns {{ keptText?: unknown, demoCompanyNames?: unknown } | undefined}
 */
export function readContractCopy(dir) {
  const file = copyFileOf(dir)
  if (!existsSync(file)) return undefined
  return JSON.parse(readFileSync(file, 'utf8'))
}

/**
 * The copy a rule reads: the parsed file, or {} when there is none or it is not JSON (the gate
 * reports a broken file; a rule then sees nothing declared, which fails safe).
 * @param {string} dir the profile's directory
 * @returns {{ keptText?: unknown, demoCompanyNames?: unknown }}
 */
export function declaredCopy(dir) {
  try {
    return readContractCopy(dir) ?? {}
  } catch {
    return {}
  }
}

/** The strings of a declared list, or [] when the list is absent or not a list. */
export const listOf = (/** @type {unknown} */ value) =>
  Array.isArray(value) ? value.filter((v) => typeof v === 'string' && v.trim() !== '') : []

/**
 * Whether a (entity, field) piece of demo text is declared kept: the entity or the entity plus field.
 * @param {unknown} keptText
 */
export function isKeptBy(keptText) {
  const kept = new Set(listOf(keptText))
  return (/** @type {string} */ entity, /** @type {string | null} */ field = null) =>
    kept.has(entity) || (field !== null && kept.has(`${entity}.${field}`))
}

/**
 * Pieces of uncovered demo text split by `keptText`: the ones still counted, the ones declared kept,
 * and the declared ids no piece sits in (a slot may cover that text now).
 * @template {{ entity: string, field: string }} P
 * @param {P[]} pieces
 * @param {unknown} keptText
 */
export function splitKept(pieces, keptText) {
  const kept = isKeptBy(keptText)
  const ids = listOf(keptText)
  return {
    counted: pieces.filter((p) => !kept(p.entity, p.field)),
    kept: pieces.filter((p) => kept(p.entity, p.field)),
    declared: ids,
    unused: ids.filter((id) => !pieces.some((p) => id === p.entity || id === `${p.entity}.${p.field}`))
  }
}

/**
 * Shape problems of the two keys. `required` (a copy file) wants both; in `personalize.json` each
 * key is optional and the other keys belong to the personalize tool.
 * @param {any} doc
 * @param {{ required?: boolean, strict?: boolean }} [opts] `strict`: no other key allowed
 * @returns {string[]}
 */
export function copyShapeProblems(doc, { required = true, strict = true } = {}) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['is not a JSON object']
  const problems = []
  if (strict)
    for (const key of Object.keys(doc))
      if (!COPY_KEYS.includes(key)) problems.push(`unknown key "${key}" (allowed: ${COPY_KEYS.join(', ')})`)
  for (const key of COPY_KEYS) {
    if (!(key in doc)) {
      if (required) problems.push(`"${key}" is missing (an empty list is an answer, absence is not)`)
      continue
    }
    const value = doc[key]
    if (!Array.isArray(value)) {
      problems.push(`"${key}" is not a list`)
      continue
    }
    const bad = value.filter((v) => typeof v !== 'string' || v.trim() !== v || v === '')
    if (bad.length)
      problems.push(`"${key}" holds ${bad.length} entries that are not trimmed, non-empty strings`)
    if (new Set(value).size !== value.length) problems.push(`"${key}" repeats an entry`)
  }
  if (Array.isArray(doc.demoCompanyNames))
    for (const n of doc.demoCompanyNames)
      if (typeof n === 'string' && n.length < 3)
        problems.push(
          `demo company name "${n}" is shorter than 3 characters; it would rename inside other words`
        )
  return problems
}

/**
 * The `keptText` ids that name nothing of the template.
 * @param {unknown} keptText
 * @param {{ entities: Set<string>, slots?: Set<string>, fieldOk?: (entity: string, field: string) => boolean }} known
 * @returns {string[]}
 */
export function unknownKeptIds(keptText, { entities, slots = new Set(), fieldOk = () => true }) {
  const out = []
  for (const id of listOf(keptText)) {
    if (entities.has(id) || slots.has(id)) continue
    const entity = [...entities].find((e) => id.startsWith(`${e}.`) && fieldOk(e, id.slice(e.length + 1)))
    if (!entity) out.push(id)
  }
  return out
}

/** The columns of a Joomla row ABOUT-2 reads. */
const JOOMLA_FIELDS = new Set(['title', 'content', 'introtext', 'fulltext', 'description', 'params'])

/**
 * Every problem of one profile's copy file; [] when it has none or is sound.
 * @param {string} dir the profile's directory
 * @param {string} platform `joomla` or `wordpress`
 * @returns {string[]}
 */
export function contractCopyProblems(dir, platform) {
  let doc
  try {
    doc = readContractCopy(dir)
  } catch (e) {
    return [`${path.basename(copyFileOf(dir))} is not JSON: ${e instanceof Error ? e.message : String(e)}`]
  }
  if (doc === undefined) return []
  const name = path.basename(copyFileOf(dir))
  const shape = copyShapeProblems(doc)
  if (shape.length) return shape.map((p) => `${name}: ${p}`)
  const json = (/** @type {string} */ f) => {
    try {
      return JSON.parse(readFileSync(path.join(dir, f), 'utf8'))
    } catch {
      return null
    }
  }
  const map = json('content-map.json')
  const lock = json('presentation-lock.json')
  const entities = new Set([
    ...(map?.entities ?? []).map((/** @type {any} */ e) => e.key),
    ...(platform === 'joomla' ? Object.keys(lock?.entities ?? {}) : WORDPRESS_PARTS)
  ])
  const slots = new Set((map?.slots ?? []).map((/** @type {any} */ s) => s.key))
  const fieldOk = platform === 'joomla' ? (_e, f) => JOOMLA_FIELDS.has(f) : undefined
  return unknownKeptIds(doc.keptText, { entities, slots, fieldOk }).map(
    (id) => `${name}: keptText "${id}" names no entity, field or slot of this contract`
  )
}

/**
 * Problems of the two keys in an EmDash theme's `seed/personalize.json`, checked against its seed.
 * @param {any} personalize
 * @param {any} seed `seed/seed.json`
 * @param {(seed: any) => { collection: string, slug: string, data: Record<string, any> }[]} entriesOf
 * @returns {string[]}
 */
export function emdashCopyProblems(personalize, seed, entriesOf) {
  const shape = copyShapeProblems(personalize, { required: false, strict: false })
  if (shape.length) return shape
  const fields = new Map(entriesOf(seed).map((e) => [`${e.collection}/${e.slug}`, e.data]))
  const fieldOk = (/** @type {string} */ e, /** @type {string} */ f) => f in (fields.get(e) ?? {})
  return unknownKeptIds(personalize.keptText, { entities: new Set(fields.keys()), fieldOk }).map(
    (id) => `keptText "${id}" names no default-locale entry or field of seed/seed.json`
  )
}
