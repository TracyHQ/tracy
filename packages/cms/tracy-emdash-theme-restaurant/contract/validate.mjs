#!/usr/bin/env node
// validate.mjs — the gate on a site-model.json (ADR 0016).
//
//   node scripts/contract/validate.mjs <site-model.json> [--json]
//   exit 0 = valid · exit 1 = errors · exit 2 = file unreadable
//
// WHY EVERY RULE HAS A CODE. A validator that prints prose cannot be tested for what it CATCHES,
// only for what it lets through — and a gate is worth exactly what its negative fixtures prove.
// Each rule below has a stable code, and tests/site-model.test.mjs holds one malformed model per
// code. A rule with no negative fixture is a rule nobody has seen fail.
//
// WHAT IT DOES NOT DO. It does not judge whether the content is good, complete, or faithful to the
// source — that is the acceptance gate's job, downstream, against a rendered site. This asks one
// question: can a compiler read this without guessing?
import { readFileSync } from 'node:fs'
import {
  FIELD_TYPES,
  RECORD_STATES,
  REQUIRED_KEYS,
  ROUTE_KINDS,
  SITE_MODEL_SCHEMA,
  SOURCE_KINDS,
  SOURCE_PARITY,
  TYPE_MODES
} from './site-model.mjs'

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v) => typeof v === 'string' && v !== ''

/** A label carries one string per locale: { en: "Projects", ru: "Проекты" }. */
function localeStringErrors(value, where, locales) {
  if (!isObject(value)) return [{ code: 'LABEL_SHAPE', where, message: 'expected an object keyed by locale' }]
  const errors = []
  for (const [locale, text] of Object.entries(value)) {
    if (!locales.includes(locale))
      errors.push({
        code: 'LOCALE_UNKNOWN',
        where: `${where}.${locale}`,
        message: `locale not declared in locales.all`
      })
    else if (!isStr(text))
      errors.push({ code: 'LABEL_EMPTY', where: `${where}.${locale}`, message: 'empty string' })
  }
  if (Object.keys(value).length === 0)
    errors.push({ code: 'LABEL_EMPTY', where, message: 'no locale at all' })
  return errors
}

/**
 * A prose value that carries a whole page rather than one record's words.
 *
 * This is invariant #1 of the EmDash skill ("content in the CMS, not in code") expressed at the
 * contract level, and it is the one rule here that is about MEANING rather than shape. The signal
 * is structural, not a word count: a record's prose that contains the page's own furniture — a
 * <header>, a <nav>, a <footer>, a second <main> — is a rendered page that got pasted into a
 * field, and every CMS downstream would store it as one unreadable blob.
 */
const PAGE_FURNITURE = /<\s*(header|nav|footer|main|aside)[\s>]/i

export function validateModel(model) {
  const errors = []
  const push = (code, where, message) => errors.push({ code, where, message })

  if (!isObject(model)) {
    return [{ code: 'NOT_AN_OBJECT', where: '/', message: 'the file must hold one object' }]
  }
  if (model.$schema !== SITE_MODEL_SCHEMA) {
    push('SCHEMA_MISMATCH', '$schema', `expected ${SITE_MODEL_SCHEMA}, got ${JSON.stringify(model.$schema)}`)
  }
  for (const key of REQUIRED_KEYS) {
    if (model[key] === undefined) push('KEY_MISSING', key, 'required key absent')
  }

  // ── source ────────────────────────────────────────────────────────────────
  const source = model.source
  if (isObject(source)) {
    if (!SOURCE_KINDS.includes(source.kind))
      push('SOURCE_KIND', 'source.kind', `one of ${SOURCE_KINDS.join(', ')}`)
    if (!SOURCE_PARITY.includes(source.parity))
      push('SOURCE_PARITY', 'source.parity', `one of ${SOURCE_PARITY.join(', ')}`)
  } else if (model.source !== undefined) {
    push('SOURCE_SHAPE', 'source', 'expected an object')
  }

  // ── locales ───────────────────────────────────────────────────────────────
  const locales = isObject(model.locales) && Array.isArray(model.locales.all) ? model.locales.all : []
  if (locales.length === 0) push('LOCALES_EMPTY', 'locales.all', 'at least one locale')
  if (isObject(model.locales) && !locales.includes(model.locales.default)) {
    push('LOCALE_DEFAULT', 'locales.default', 'the default locale must appear in locales.all')
  }

  // ── types ─────────────────────────────────────────────────────────────────
  const typeNames = new Set()
  const fieldsByType = new Map()
  for (const [i, type] of (model.types ?? []).entries()) {
    const at = `types[${i}]`
    if (!isObject(type)) {
      push('TYPE_SHAPE', at, 'expected an object')
      continue
    }
    if (!isStr(type.name)) push('TYPE_NAME', `${at}.name`, 'non-empty name required')
    else if (typeNames.has(type.name))
      push('TYPE_DUPLICATE', `${at}.name`, `duplicate type name ${type.name}`)
    else typeNames.add(type.name)
    if (!TYPE_MODES.includes(type.mode)) push('TYPE_MODE', `${at}.mode`, `one of ${TYPE_MODES.join(', ')}`)
    if (type.label !== undefined) errors.push(...localeStringErrors(type.label, `${at}.label`, locales))

    const fieldNames = new Set()
    for (const [j, field] of (type.fields ?? []).entries()) {
      const fat = `${at}.fields[${j}]`
      if (!isObject(field)) {
        push('FIELD_SHAPE', fat, 'expected an object')
        continue
      }
      if (!isStr(field.name)) push('FIELD_NAME', `${fat}.name`, 'non-empty name required')
      else if (fieldNames.has(field.name))
        push('FIELD_DUPLICATE', `${fat}.name`, `duplicate field ${field.name}`)
      else fieldNames.add(field.name)
      if (!FIELD_TYPES.includes(field.type))
        push('FIELD_TYPE', `${fat}.type`, `one of ${FIELD_TYPES.join(', ')}`)
      if (field.type === 'reference' && !isStr(field.of))
        push('FIELD_REFERENCE_TARGET', `${fat}.of`, 'a reference field must name the type it points at')
      if (field.type === 'group' && !Array.isArray(field.fields))
        push('FIELD_GROUP_EMPTY', `${fat}.fields`, 'a group field must carry its own fields')
    }
    if (isStr(type.name)) fieldsByType.set(type.name, fieldNames)
  }
  for (const [i, type] of (model.types ?? []).entries()) {
    for (const [j, field] of (type.fields ?? []).entries()) {
      if (isObject(field) && field.type === 'reference' && isStr(field.of) && !typeNames.has(field.of)) {
        push('REFERENCE_UNKNOWN_TYPE', `types[${i}].fields[${j}].of`, `no type named ${field.of}`)
      }
    }
  }

  // ── taxonomies ────────────────────────────────────────────────────────────
  const taxonomyTerms = new Map()
  for (const [i, tax] of (model.taxonomies ?? []).entries()) {
    const at = `taxonomies[${i}]`
    if (!isObject(tax)) {
      push('TAXONOMY_SHAPE', at, 'expected an object')
      continue
    }
    if (!isStr(tax.name)) push('TAXONOMY_NAME', `${at}.name`, 'non-empty name required')
    for (const typeName of tax.appliesTo ?? []) {
      if (!typeNames.has(typeName))
        push('TAXONOMY_UNKNOWN_TYPE', `${at}.appliesTo`, `no type named ${typeName}`)
    }
    const slugs = new Set()
    for (const [j, term] of (tax.terms ?? []).entries()) {
      if (!isObject(term) || !isStr(term.slug)) {
        push('TERM_SLUG', `${at}.terms[${j}].slug`, 'non-empty slug required')
        continue
      }
      if (slugs.has(term.slug))
        push('TERM_DUPLICATE', `${at}.terms[${j}].slug`, `duplicate term ${term.slug}`)
      slugs.add(term.slug)
    }
    if (isStr(tax.name)) taxonomyTerms.set(tax.name, slugs)
  }

  // ── records ───────────────────────────────────────────────────────────────
  const seen = new Set()
  const recordKeys = new Set()
  for (const [i, record] of (model.records ?? []).entries()) {
    const at = `records[${i}]`
    if (!isObject(record)) {
      push('RECORD_SHAPE', at, 'expected an object')
      continue
    }
    if (!typeNames.has(record.type)) push('RECORD_UNKNOWN_TYPE', `${at}.type`, `no type named ${record.type}`)
    if (!isStr(record.slug)) push('RECORD_SLUG', `${at}.slug`, 'non-empty slug required')
    if (!locales.includes(record.locale))
      push('RECORD_LOCALE', `${at}.locale`, 'locale not declared in locales.all')
    if (record.status !== undefined && !RECORD_STATES.includes(record.status)) {
      push('RECORD_STATUS', `${at}.status`, `one of ${RECORD_STATES.join(', ')}`)
    }
    const key = `${record.type}/${record.slug}/${record.locale}`
    if (seen.has(key)) push('RECORD_DUPLICATE', at, `a record already exists for ${key}`)
    seen.add(key)
    recordKeys.add(`${record.type}/${record.slug}`)

    const known = fieldsByType.get(record.type)
    for (const [name, value] of Object.entries(record.values ?? {})) {
      if (known && !known.has(name))
        push('VALUE_UNKNOWN_FIELD', `${at}.values.${name}`, `the type declares no field named ${name}`)
      if (typeof value === 'string' && PAGE_FURNITURE.test(value)) {
        push(
          'VALUE_HOLDS_A_PAGE',
          `${at}.values.${name}`,
          'this value carries page furniture (header/nav/footer/main); a record holds its own words, not a rendered page'
        )
      }
    }
    for (const [taxName, terms] of Object.entries(record.terms ?? {})) {
      const known = taxonomyTerms.get(taxName)
      if (!known) {
        push('RECORD_UNKNOWN_TAXONOMY', `${at}.terms.${taxName}`, `no taxonomy named ${taxName}`)
        continue
      }
      for (const term of terms) {
        if (!known.has(term))
          push('RECORD_UNKNOWN_TERM', `${at}.terms.${taxName}`, `${taxName} declares no term ${term}`)
      }
    }
  }

  // ── routes, menus, media ──────────────────────────────────────────────────
  const paths = new Set()
  for (const [i, route] of (model.routes ?? []).entries()) {
    const at = `routes[${i}]`
    if (!isObject(route) || !isStr(route.path)) {
      push('ROUTE_PATH', `${at}.path`, 'non-empty path required')
      continue
    }
    if (!route.path.startsWith('/')) push('ROUTE_PATH', `${at}.path`, 'a path starts with /')
    if (!ROUTE_KINDS.includes(route.kind))
      push('ROUTE_KIND', `${at}.kind`, `one of ${ROUTE_KINDS.join(', ')}`)
    if (route.type !== undefined && !typeNames.has(route.type))
      push('ROUTE_UNKNOWN_TYPE', `${at}.type`, `no type named ${route.type}`)
    paths.add(route.path)
  }
  const walkItems = (items, at) => {
    for (const [i, item] of (items ?? []).entries()) {
      const iat = `${at}[${i}]`
      if (!isObject(item)) {
        push('MENU_ITEM_SHAPE', iat, 'expected an object')
        continue
      }
      if (item.label !== undefined) errors.push(...localeStringErrors(item.label, `${iat}.label`, locales))
      const isInternal = isStr(item.path) && item.path.startsWith('/')
      // A one-page menu points at an anchor inside a route — /home#services is the route /home
      // plus a place on it. Comparing the whole string reports every such item as dangling, which
      // is how a real source (Tracy Base, three of its menus) fails a rule that is meant to catch
      // a link to a page that does not exist.
      const withoutFragment = isInternal ? item.path.split('#')[0] : item.path
      if (isInternal && paths.size > 0 && !paths.has(withoutFragment)) {
        push('MENU_DANGLING', `${iat}.path`, `${item.path} is not among the declared routes`)
      }
      walkItems(item.children, `${iat}.children`)
    }
  }
  for (const [i, menu] of (model.menus ?? []).entries()) {
    if (!isObject(menu) || !isStr(menu.name)) {
      push('MENU_NAME', `menus[${i}].name`, 'non-empty name required')
      continue
    }
    walkItems(menu.items, `menus[${i}].items`)
  }
  for (const [i, item] of (model.media ?? []).entries()) {
    const at = `media[${i}]`
    if (!isObject(item) || !isStr(item.file)) {
      push('MEDIA_FILE', `${at}.file`, 'non-empty file required')
      continue
    }
    for (const user of item.usedBy ?? []) {
      if (isStr(user) && !recordKeys.has(user.split('#')[0]))
        push('MEDIA_DANGLING', `${at}.usedBy`, `${user} is not a record in this model`)
    }
  }
  for (const [i, rule] of (model.redirects ?? []).entries()) {
    const at = `redirects[${i}]`
    if (!isObject(rule) || !isStr(rule.from) || !isStr(rule.to))
      push('REDIRECT_SHAPE', at, 'from and to are required')
    else if (rule.from === rule.to) push('REDIRECT_LOOP', at, 'a redirect to itself')
  }

  return errors
}

export function readModel(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function main(argv) {
  const [file, ...rest] = argv
  if (!file) {
    console.error('usage: validate.mjs <site-model.json> [--json]')
    return 2
  }
  let model
  try {
    model = readModel(file)
  } catch (error) {
    console.error(`cannot read ${file}: ${error.message}`)
    return 2
  }
  const errors = validateModel(model)
  if (rest.includes('--json')) console.log(JSON.stringify({ file, ok: errors.length === 0, errors }, null, 2))
  else if (errors.length === 0)
    console.log(
      `site-model: ${file} valid — ${(model.types ?? []).length} types, ${(model.records ?? []).length} records`
    )
  else for (const e of errors) console.error(`${e.code} at ${e.where}: ${e.message}`)
  return errors.length === 0 ? 0 : 1
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)))
