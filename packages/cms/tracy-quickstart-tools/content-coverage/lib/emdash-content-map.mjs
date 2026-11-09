// The content map of an EmDash theme, generated from the theme's own data: `seed/seed.json` (the demo entries and the
// schema of every collection), `seed/field-map.json` (the role of every field, ADR 0038) and `seed/content-api-map.json`
// (which collection has a page of its own). Joomla and WordPress capture their map from a running demo; an EmDash
// theme declares everything in files, so the map is DERIVED, never captured, and `emdash-content-map.mjs --check`
// proves the committed file is what the theme's files say.
//
// The schema is the one the Joomla and WordPress coverage and flow-reads already consume (`entities`, `slots`, `pages`),
// with `target` naming the EmDash field instead of a database column:
//
//   slot    { key, entity, target: {collection, entry, field[, item, sub]}, type, sample, label, role?, group? }
//           type: text (a string/text field) · image · url (a link field) · richtext (a Portable Text field) · date ·
//           term (a category or tag label, entity `taxonomy.<name>`)
//           key: `<collection>.<entry slug>.<field>`, `...<field>[<i>].<sub>` in a repeater row, `settings.<field>`.
//           The keys, roles and groups of the copy fields are the ones `contentMapOfFieldMap` derives, so the roles the
//           Road to live reads from the field map and from this file are one and the same.
//   entity  { key: "<collection>.<slug>", kind: "entry", identity: {collection, slug} }
//   page    { entity, route, openAs, title, view }: an entry with a public path of its own.
//
// Slot fit (`fit` on a slot, `slotFitVersion`, `fitGroups`) is NOT generated here: the coverage audit measures it on a
// running site and merges it in, and the check below ignores those keys.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  contentMapOfFieldMap,
  defaultLocaleEntries,
  isCopylessField,
  normalizeFieldMap,
  subFieldsOf
} from '../../../../../apps/tracy-web/src/lib/emdash-field-map-roles.js'

export const EMDASH_MAP_SCHEMA = 'tracy-quickstart-content-map/emdash/v1'
/** The keys the audit adds to the map (Slot fit); the currency check does not compare them. */
export const MEASURED_MAP_KEYS = Object.freeze(['slotFitVersion', 'fitGroups'])

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const LINK_FIELD = /(^|_)(url|href|webpage)\d*$|link\d*$|^link(_|$)/

/** The plain words of a Portable Text value. */
function plainOfPortableText(blocks) {
  const out = []
  for (const block of Array.isArray(blocks) ? blocks : []) {
    // A picture block's caption is words a page prints under the picture.
    if (block?._type === 'image' && typeof block.caption === 'string' && block.caption.trim())
      out.push(block.caption.trim())
    const text = (Array.isArray(block?.children) ? block.children : [])
      .map((c) => String(c?.text ?? ''))
      .join('')
    if (text.trim()) out.push(text.trim())
  }
  return out.join('\n\n')
}

const sampleOf = (type, value) => {
  if (type === 'portableText') return plainOfPortableText(value)
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return String(value.src ?? value.url ?? value.id ?? '')
  return String(value)
}

/**
 * Slot type of a collection field, or null when the field is not content a visitor reads (a layout setting, a flag).
 * A field NAMED like a layout setting (`dish_extra_class`) is exempt only while the field map gives it no role: a role is
 * the theme's declaration that the field is copy (JA Restaurant prints that field as the "Hot" badge beside a dish).
 */
function slotTypeOf(fieldType, slug, declared = false) {
  if (fieldType === 'image') return 'image'
  if (fieldType === 'portableText') return 'richtext'
  if (fieldType === 'datetime') return 'date'
  if (fieldType === 'string' || fieldType === 'text') {
    if (LINK_FIELD.test(slug)) return 'url'
    return declared || !isCopylessField(slug) ? 'text' : null
  }
  return null
}

const titleCase = (slug) =>
  String(slug)
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())

/**
 * @param {{ seed: any, fieldMap: any, contentApiMap?: any, template: string, version: string }} input
 * @returns {any} the content map
 */
export function emdashContentMapOf({ seed, fieldMap: rawFieldMap, contentApiMap = null, template, version }) {
  const fieldMap = normalizeFieldMap(rawFieldMap, seed)
  const roleSlots = new Map(contentMapOfFieldMap({ seed, fieldMap }).slots.map((s) => [s.key, s]))
  const locale = seed?.defaultLocale ?? 'en'
  const slots = []
  const entities = []
  const pages = []

  const push = (key, entity, target, type, sample, label) => {
    const declared = roleSlots.get(key)
    const slot = { key, entity, target, type, sample, label }
    // A link with nothing in it is no slot. A link slot has no role: the vocabulary of these themes (place-content-roles/2)
    // has no link role (R3, which asks for one, applies to place-content-roles/3 only).
    if (type === 'url' && (!sample.trim() || sample.trim().startsWith('<'))) return
    if (declared) {
      slot.role = declared.role
      if (declared.group) slot.group = declared.group
    }
    slots.push(slot)
  }

  for (const name of ['title', 'tagline']) {
    const declared = roleSlots.get(`settings.${name}`)
    const slot = {
      key: `settings.${name}`,
      entity: 'settings',
      target: { setting: name },
      type: 'text',
      sample: String(seed?.settings?.[name] ?? ''),
      label: name === 'title' ? 'Site title' : 'Tagline'
    }
    if (declared)
      Object.assign(slot, { role: declared.role, ...(declared.group ? { group: declared.group } : {}) })
    slots.push(slot)
  }
  entities.push({ key: 'settings', kind: 'settings', identity: {} })

  for (const collection of Array.isArray(seed?.collections) ? seed.collections : []) {
    const api = contentApiMap?.collections?.[collection.slug] ?? null
    for (const entry of defaultLocaleEntries(seed?.content?.[collection.slug], locale)) {
      if (!entry?.slug) continue
      const entityKey = `${collection.slug}.${entry.slug}`
      entities.push({
        key: entityKey,
        kind: 'entry',
        identity: { collection: collection.slug, slug: entry.slug },
        ...(api ? { contentType: api.type } : {})
      })
      const data = entry.data && typeof entry.data === 'object' ? entry.data : {}
      for (const field of collection.fields ?? []) {
        // A field the entry does not carry is no slot of it (the roles reader counts the same way).
        if (!Object.hasOwn(data, field.slug) && !(field.slug === 'title' && typeof entry.title === 'string'))
          continue
        const value = data[field.slug] ?? (field.slug === 'title' ? entry.title : undefined)
        const at = { collection: collection.slug, entry: entry.slug, field: field.slug }
        const label =
          rawFieldMap?.fields?.[`${collection.slug}.${field.slug}`]?.label ??
          field.label ??
          titleCase(field.slug)
        if (field.type === 'repeater') {
          const subs = subFieldsOf({
            subFields: field.validation?.subFields?.map((s) => `${s.slug}:${s.type ?? 'string'}`)
          })
          const rows = Array.isArray(value) ? value : []
          rows.forEach((row, i) => {
            for (const sub of subs) {
              const type = slotTypeOf(
                sub.type,
                sub.name,
                roleSlots.has(`${entityKey}.${field.slug}[${i}].${sub.name}`)
              )
              if (!type) continue
              push(
                `${entityKey}.${field.slug}[${i}].${sub.name}`,
                entityKey,
                { ...at, item: i, sub: sub.name },
                type,
                sampleOf(sub.type, row?.[sub.name]),
                `${label} ${i + 1} — ${titleCase(sub.name)}`
              )
            }
          })
          continue
        }
        const type = slotTypeOf(field.type, field.slug, roleSlots.has(`${entityKey}.${field.slug}`))
        if (!type) continue
        const key = `${entityKey}.${field.slug}`
        const sample = sampleOf(field.type, value)
        // A prose or date field with nothing in it is no slot of this entry (a page body is built from sections).
        const holdsPicture =
          type === 'richtext' && Array.isArray(value) && value.some((b) => b?._type === 'image')
        if ((type === 'richtext' || type === 'date') && !sample.trim() && !holdsPicture) continue
        push(key, entityKey, at, type, sample, label)
      }
      const route = typeof data.path === 'string' && data.path.startsWith('/') ? data.path : null
      if (route)
        pages.push({
          entity: entityKey,
          route,
          openAs: route,
          title: String(data.title ?? entry.slug),
          view: typeof data.view === 'string' ? data.view : null
        })
    }
  }

  // The terms of each taxonomy (categories, tags) are words a page prints; they are slots of their own, no entry's field.
  for (const taxonomy of (Array.isArray(seed?.taxonomies) ? seed.taxonomies : []).filter(
    (t) => !t?.locale || t.locale === locale
  )) {
    for (const term of taxonomy.terms ?? []) {
      if (!term?.slug) continue
      const entity = `taxonomy.${taxonomy.name}`
      if (!entities.some((e) => e.key === entity))
        entities.push({ key: entity, kind: 'taxonomy', identity: { taxonomy: taxonomy.name } })
      slots.push({
        key: `${entity}.${term.slug}`,
        entity,
        target: { taxonomy: taxonomy.name, term: term.slug },
        type: 'term',
        sample: String(term.label ?? term.slug),
        label: `${taxonomy.labelSingular ?? taxonomy.name}: ${term.label ?? term.slug}`
      })
    }
  }

  const menus = (Array.isArray(seed?.menus) ? seed.menus : [])
    .filter((m) => !m?.locale || m.locale === locale)
    .map((m) => ({ name: m.name, label: m.label, items: m.items ?? [] }))

  return {
    schemaVersion: EMDASH_MAP_SCHEMA,
    $comment: `Derived from ${template} ${version}: seed/seed.json (entries and field schema), seed/field-map.json (roles) and seed/content-api-map.json. Generated by packages/cms/tracy-quickstart-tools/content-coverage/emdash-content-map.mjs; do not edit by hand.`,
    template,
    version,
    ...(fieldMap.roleVocabularyVersion ? { roleVocabularyVersion: fieldMap.roleVocabularyVersion } : {}),
    entities,
    pages,
    menus,
    slots
  }
}

/** Read a theme folder (`packages/cms/tracy-emdash-theme-*`) and build its map. */
export function emdashContentMapOfTheme(themeDir) {
  const pkg = readJson(join(themeDir, 'package.json'))
  const seedDir = join(themeDir, 'seed')
  const apiFile = join(seedDir, 'content-api-map.json')
  const config = existsSync(join(themeDir, 'template.config.json'))
    ? readJson(join(themeDir, 'template.config.json'))
    : {}
  const template = String(
    config.id ?? config.template ?? pkg.name.replace(/^@tracy\/emdash-theme-/, 'tracy-')
  )
  return {
    version: String(pkg.version),
    template,
    map: emdashContentMapOf({
      seed: readJson(join(seedDir, 'seed.json')),
      fieldMap: readJson(join(seedDir, 'field-map.json')),
      contentApiMap: existsSync(apiFile) ? readJson(apiFile) : null,
      template,
      version: String(pkg.version)
    })
  }
}

/**
 * A contract file as written to disk: indented JSON with every non-ASCII character written as a \\u escape. The files
 * quote the demo's own words verbatim (a chef named Nunez with an accent, "Entrees" with its accents), and the
 * language policy reads files as text; the escapes keep the bytes ASCII and parse back to the very same words.
 * @param {unknown} value
 */
export const asciiJson = (value) =>
  `${JSON.stringify(value, null, 2).replace(/[\u0080-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}\n`

/** The map as written to disk. */
export const serializeMap = (map) => asciiJson(map)

/**
 * A committed map without what the audit measured into it, so it compares with the generated one: Slot fit, and the
 * keep flag (`customize`) that Slot fit sets on a picture by its measured kind. The generator writes neither.
 */
export function withoutMeasured(map) {
  const out = { ...map }
  for (const key of MEASURED_MAP_KEYS) delete out[key]
  out.slots = (map.slots ?? []).map(({ fit: _fit, customize: _customize, ...slot }) => slot)
  return out
}
