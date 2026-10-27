/**
 * Slot roles an EmDash theme declares in its `seed/field-map.json` (ADR 0038): once per field, and once per repeater
 * sub-field, so every entry that uses the field gets the role. The shared reader (`contract-slot-roles.js`) reads them
 * before any `slot-roles.json` sidecar.
 *
 * The declaration, all of it optional so a field map without roles keeps working:
 *
 *   top level   "roleVocabularyVersion": "place-content-roles/2"
 *               "settings": { "title": {role, group}, "tagline": {role, group} }   the two site settings slots
 *   a field     { "slug": "price", "type": "string", "role": "package.price", "group": {"kind": "package"} }
 *   a repeater  { "slug": "faq_items", "type": "repeater", "subFields": ["question:string", "answer:text"],
 *                 "group": {"kind": "faq"}, "subRoles": {"question": "faq.question", "answer": "faq.answer"} }
 *
 * `group.kind` is what one card of the field holds (a `GROUP_KINDS` name). A repeater item is one card: its group id is
 * `<collection>.<slug>.<field>.<item index>`. A plain field is one card of its own, `<collection>.<slug>.<name>.0`, where
 * `name` is the field slug unless `group.name` says another card to join (the brand name and the tagline share
 * `identity`). Settings slots use `settings.<field>.<name>.0`. Editorial roles take no group.
 *
 * Fields that hold no copy are exempt from needing a role: links, alt text, identifiers (`isCopylessField`).
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  GROUP_KINDS,
  ROLE_VOCABULARY_VERSION,
  checkContentMapRoles,
  isFactRole,
  isRole,
  slotRolesOfContentMap
} from 'website-opportunities/domain'

const COPY_TYPES = new Set(['string', 'text', 'image'])
const SETTINGS_FIELDS = ['title', 'tagline']

const has = (object, key) => Boolean(object && typeof object === 'object' && Object.hasOwn(object, key))

/** A string or text field that holds no copy of its own: a link, alt text, an identifier or an anchor. */
export function isCopylessField(slug) {
  return /(^|_)(url|href|alt|id|key|code|anchor|initials)$/.test(String(slug))
}

function readJson(file) {
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** The sub-fields of a repeater as `{name, type}`; the field map writes them `name:type`. */
function subFieldsOf(field) {
  return (Array.isArray(field?.subFields) ? field.subFields : []).map((raw) => {
    const [name, type] = String(raw).split(':')
    return { name: (name ?? '').trim(), type: (type ?? 'string').trim() }
  })
}

/**
 * Whether a field map declares slot roles at all: a vocabulary version, or a role on any field or sub-field.
 * @param {any} fieldMap
 */
export function fieldMapDeclaresRoles(fieldMap) {
  if (has(fieldMap, 'roleVocabularyVersion')) return true
  if (SETTINGS_FIELDS.some((name) => has(fieldMap?.settings?.[name], 'role'))) return true
  return (fieldMap?.collections ?? []).some((col) =>
    (col?.fields ?? []).some((f) => has(f, 'role') || has(f, 'subRoles'))
  )
}

function declarationProblem(role, group, named, { needsGroup }) {
  if (!isRole(role)) return `${named} has unknown role ${JSON.stringify(role)}`
  if (!isFactRole(role) || !needsGroup) return null
  if (!has(GROUP_KINDS, group?.kind))
    return `${named} has fact role "${role}" and needs group.kind (one of ${Object.keys(GROUP_KINDS).join(', ')})`
  return null
}

/**
 * The contract check of a field map's slot roles. A field map that declares none is not checked (`declared: false`).
 * One that declares roles must name the current vocabulary, give every copy field and copy repeater sub-field a known
 * role, and give every fact role a group kind. Whether the cards the roles make are whole is judged by
 * `checkContentMapRoles` over the slots they expand to (`contentMapOfFieldMap`).
 * @param {any} fieldMap
 * @returns {{declared: boolean, ok: boolean, errors: string[]}}
 */
export function checkFieldMapRoles(fieldMap) {
  if (!fieldMapDeclaresRoles(fieldMap)) return { declared: false, ok: true, errors: [] }
  const errors = []
  if (fieldMap.roleVocabularyVersion !== ROLE_VOCABULARY_VERSION)
    errors.push(
      `roleVocabularyVersion must be "${ROLE_VOCABULARY_VERSION}", got ${JSON.stringify(fieldMap.roleVocabularyVersion)}`
    )

  for (const name of SETTINGS_FIELDS) {
    const decl = fieldMap.settings?.[name]
    const named = `settings field "${name}"`
    if (!has(decl, 'role')) errors.push(`${named} has no role`)
    else {
      const problem = declarationProblem(decl.role, decl.group, named, { needsGroup: true })
      if (problem) errors.push(problem)
    }
  }

  for (const col of fieldMap.collections ?? []) {
    for (const field of col?.fields ?? []) {
      const named = `field "${col.collection}.${field.slug}"`
      if (field.type === 'repeater') {
        const roles = field.subRoles && typeof field.subRoles === 'object' ? field.subRoles : {}
        const subs = subFieldsOf(field)
        for (const sub of subs) {
          const subNamed = `repeater sub-field "${col.collection}.${field.slug}.${sub.name}"`
          if (!has(roles, sub.name)) {
            if (COPY_TYPES.has(sub.type) && !isCopylessField(sub.name)) errors.push(`${subNamed} has no role`)
            continue
          }
          const problem = declarationProblem(roles[sub.name], field.group, subNamed, { needsGroup: true })
          if (problem) errors.push(problem)
        }
        for (const name of Object.keys(roles))
          if (!subs.some((s) => s.name === name))
            errors.push(`${named} has a role for "${name}", which is not one of its sub-fields`)
        continue
      }
      if (!has(field, 'role')) {
        if (COPY_TYPES.has(field.type) && !isCopylessField(field.slug)) errors.push(`${named} has no role`)
        continue
      }
      const problem = declarationProblem(field.role, field.group, named, { needsGroup: true })
      if (problem) errors.push(problem)
    }
  }
  return { declared: true, ok: errors.length === 0, errors }
}

const defaultLocaleEntries = (entries, defaultLocale) => {
  if (!Array.isArray(entries)) return []
  const matching = entries.filter((e) => !e?.locale || e.locale === defaultLocale)
  return matching.length > 0 ? matching : entries
}

/**
 * The content-map view of a field map's roles: one slot per entry field (and per repeater item sub-field) that has a
 * role, keyed the way the slot inventory keys them (`<collection>.<slug>.<field>`, `...<field>[<i>].<sub>`,
 * `settings.<field>`), with the `role` and `group` fields of a content-map slot. Feed it to `checkContentMapRoles` and
 * `slotRolesOfContentMap`: the same checks and the same group plan as a content map's.
 * @param {{seed: any, fieldMap: any}} source
 */
export function contentMapOfFieldMap({ seed, fieldMap }) {
  const slots = []
  const slotOf = (key, role, group) => {
    const slot = { key, role }
    if (isFactRole(role)) slot.group = group
    slots.push(slot)
  }
  for (const name of SETTINGS_FIELDS) {
    const decl = fieldMap.settings?.[name]
    if (!has(decl, 'role')) continue
    const cardName = decl.group?.name ?? name
    slotOf(`settings.${name}`, decl.role, {
      id: `settings.${name}.${cardName}.0`,
      item: 0,
      kind: decl.group?.kind
    })
  }

  const defaultLocale = seed?.defaultLocale ?? 'en'
  const fieldsByCollection = new Map(
    (fieldMap.collections ?? []).map((col) => [
      col.collection,
      new Map((col.fields ?? []).map((f) => [f.slug, f]))
    ])
  )
  for (const [collection, rawEntries] of Object.entries(seed?.content ?? {})) {
    const fields = fieldsByCollection.get(collection)
    if (!fields) continue
    for (const entry of defaultLocaleEntries(rawEntries, defaultLocale)) {
      const slug = entry?.slug
      if (!slug) continue
      const scalar = (field, value) => {
        const decl = fields.get(field)
        if (!decl || !has(decl, 'role') || Array.isArray(value)) return
        const cardName = decl.group?.name ?? field
        slotOf(`${collection}.${slug}.${field}`, decl.role, {
          id: `${collection}.${slug}.${cardName}.0`,
          item: 0,
          kind: decl.group?.kind
        })
      }
      if (typeof entry.title === 'string') scalar('title', entry.title)
      const data = entry?.data && typeof entry.data === 'object' ? entry.data : {}
      for (const [field, value] of Object.entries(data)) {
        const decl = fields.get(field)
        if (!Array.isArray(value)) {
          scalar(field, value)
          continue
        }
        if (decl?.type !== 'repeater' || !decl.subRoles) continue
        value.forEach((item, i) => {
          if (!item || typeof item !== 'object') return
          for (const sub of subFieldsOf(decl)) {
            if (sub.type === 'boolean' || !has(decl.subRoles, sub.name)) continue
            slotOf(`${collection}.${slug}.${field}[${i}].${sub.name}`, decl.subRoles[sub.name], {
              id: `${collection}.${slug}.${field}.${i}`,
              item: i,
              kind: decl.group?.kind
            })
          }
        })
      }
    }
  }
  return { roleVocabularyVersion: fieldMap.roleVocabularyVersion, slots }
}

/**
 * The roles a theme's field map declares, read from its seed folder.
 * @param {string | null | undefined} seedDir - the theme's `seed/` folder (`seed.json` and `field-map.json` in it)
 * @param {{contract?: string | null}} [about]
 * @returns {{declared: boolean, ok: boolean, errors: string[], doc: any, contentMap: any} | null} null when the folder
 *   has no field map or the field map declares no roles
 */
export function fieldMapRolesOf(seedDir, { contract = null } = {}) {
  if (!seedDir) return null
  const fieldMap = readJson(path.join(seedDir, 'field-map.json'))
  if (!fieldMap || !fieldMapDeclaresRoles(fieldMap)) return null
  const seed = readJson(path.join(seedDir, 'seed.json'))
  const contentMap = contentMapOfFieldMap({ seed, fieldMap })
  const fieldCheck = checkFieldMapRoles(fieldMap)
  const cardCheck = checkContentMapRoles(contentMap)
  const errors = [...fieldCheck.errors, ...cardCheck.errors.filter((e) => !fieldCheck.errors.includes(e))]
  return {
    declared: true,
    ok: errors.length === 0,
    errors,
    contentMap,
    doc: slotRolesOfContentMap(contentMap, { contract, cms: 'emdash' })
  }
}
