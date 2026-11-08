#!/usr/bin/env node
// compile-seed.mjs — site-model.json → an EmDash seed (ADR 0016, the target layer).
//
//   node tools/compile-seed.mjs <site-model.json> <seed-dir> [--config compile.config.json] [--media-from <dir>]
//   exit 0 = written · 1 = the model is invalid or the mapping is incomplete · 2 = unreadable
//
// WHAT MOVED HERE, AND FROM WHERE. Every template used to carry its own build-seed.mjs — the
// Business template's is 1,829 lines, and a second template would have written a second one. The
// DATA in those lines belongs to the source (it is now site-model.json); the RULES belong here,
// once, for every template that follows.
//
// WHY A CONFIG FILE EXISTS. Some decisions are genuinely the target's, not the source's: whether a
// long text is stored as `text` or `portableText`, which collection is routable, what sort order
// the admin shows. A source cannot know those. They live in compile.config.json next to the
// template — NOT in the model, which must stay readable by the WordPress and Joomla skills too.
//
// WHY IT REFUSES RATHER THAN GUESSES. An unmapped field type is an error, not a silent `string`:
// a wrong-but-plausible field renders fine and loses data on the first edit in the admin.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { joinInside, unsafeReason } from './safe-path.mjs'
import { validateModel } from '../contract/validate.mjs'
import { carryRolesIntoCompiledMap, readPreviousFieldMap } from './carry-field-map-roles.mjs'

/** Source field kind → EmDash field type. Overridable per field in compile.config.json. */
export const DEFAULT_FIELD_TYPES = {
  text: 'string',
  prose: 'text',
  number: 'integer',
  boolean: 'boolean',
  date: 'datetime',
  url: 'string',
  email: 'string',
  image: 'image',
  file: 'string',
  link: 'json',
  group: 'repeater',
  reference: 'reference'
}

/** Field attributes the seed carries through untouched when the model declares them. */
const PASS_THROUGH = ['required', 'validation', 'options', 'searchable', 'indexed', 'defaultValue']

/**
 * A datetime the way EmDash stores it: UTC ISO, milliseconds and `Z`. A source writes `2021-09-27 00:02:00`
 * (Joomla and WordPress keep UTC without a marker); left as written, `seed-apply content` finds every dated entry
 * "different from the seed" because the live site holds the ISO form. A value that is not a date is left alone.
 */
export function isoUtc(value) {
  if (typeof value !== 'string') return value
  const text = value.trim()
  const m = text.match(
    /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(?::(\d{2})(?:\.(\d+))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i
  )
  if (!m) return value
  const [, day, hm = '00:00', sec = '00', frac = '', zone] = m
  const date = new Date(
    `${day}T${hm}:${sec}.${frac.padEnd(3, '0').slice(0, 3)}${zone ? zone.replace(/^([+-]\d{2})(\d{2})$/, '$1:$2') : 'Z'}`
  )
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2'
}

const localeText = (value, locale, fallback) => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return value[locale] ?? value[fallback] ?? Object.values(value)[0]
  return undefined
}

const titleCase = (slug) => slug.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

/**
 * Which types a viewer can reach by URL. Read from the model's routes rather than declared twice:
 * a type with a list or detail route is routable, and nothing else has to stay in sync.
 */
function routableTypes(model) {
  const routable = new Set()
  for (const route of model.routes ?? []) {
    if ((route.kind === 'list' || route.kind === 'detail') && route.type) routable.add(route.type)
  }
  return routable
}

export function compile(model, config = {}) {
  const errors = validateModel(model)
  if (errors.length > 0) {
    const shown = errors
      .slice(0, 5)
      .map((e) => `${e.code} at ${e.where}`)
      .join('; ')
    throw new Error(
      `the model is invalid, refusing to compile: ${shown}${errors.length > 5 ? ` (+${errors.length - 5} more)` : ''}`
    )
  }

  const locales = model.locales.all
  const base = model.locales.default
  const routable = routableTypes(model)
  const fieldConfig = config.fields ?? {}
  const typeConfig = config.collections ?? {}

  // ── collections ───────────────────────────────────────────────────────────
  const collections = []
  const fieldMap = {}
  const warnings = []
  const dateFields = {} // type → fields stored as datetime
  const htmlProse = {} // `type.field` → entries whose value holds markup but is stored as plain text
  for (const [index, type] of model.types.entries()) {
    const overrides = typeConfig[type.name] ?? {}
    const fields = []
    for (const field of type.fields ?? []) {
      const key = `${type.name}.${field.name}`
      const override = fieldConfig[key] ?? {}
      const target = override.type ?? DEFAULT_FIELD_TYPES[field.type]
      if (!target)
        throw new Error(
          `no EmDash field type for ${key} (source kind "${field.type}") — add one to compile.config.json`
        )
      const out = {
        slug: field.name,
        label: override.label ?? localeText(field.label, base, base) ?? titleCase(field.name),
        type: target
      }
      for (const attr of PASS_THROUGH) {
        if (override[attr] !== undefined) out[attr] = override[attr]
        else if (field[attr] !== undefined) out[attr] = field[attr]
      }
      // Where EmDash keeps these two is not where a reader would guess, and guessing wrong is
      // silent: a repeater with no subFields renders as an empty row set in the admin, and a
      // reference with no target holds a bare entry id in a text box. Since EmDash 0.41 the target
      // is `validation.targetCollection`, which binds the field to a relation (an entry picker; the
      // value is read from `entry.references`, not `data`).
      if (field.type === 'reference' && field.of) {
        out.validation = { ...out.validation, targetCollection: override.of ?? field.of }
      }
      if (field.type === 'group' && Array.isArray(field.fields)) {
        out.validation = {
          ...out.validation,
          subFields: field.fields.map((sub) => ({
            slug: sub.name,
            label: sub.label ?? titleCase(sub.name),
            type: fieldConfig[`${key}.${sub.name}`]?.type ?? DEFAULT_FIELD_TYPES[sub.type] ?? 'string'
          }))
        }
      }
      if (target === 'datetime') (dateFields[type.name] ??= new Set()).add(field.name)
      if (field.type === 'prose' && target === 'text') htmlProse[key] = 0
      fields.push(out)
      fieldMap[key] = { source: field.type, target, label: out.label }
    }

    // A configured collection is written exactly as configured: the target's own attributes, in
    // their own order, with nothing this compiler thinks it knows added on top. Only a collection
    // the config says nothing about gets the inferred shape — that is the path a brand-new source
    // takes, where there is no target decision to honour yet.
    const attributes =
      Object.keys(overrides).length > 0
        ? overrides
        : {
            label: localeText(type.label, base, base) ?? titleCase(type.name),
            labelSingular: localeText(type.labelSingular, base, base) ?? titleCase(type.name),
            sortOrder: index + 1,
            routable: routable.has(type.name),
            supports: ['revisions'],
            // Lee, 20/09/2026: no edit lock on Tracy sites — an agent writing while an editor reads must not 409.
            editLocking: false
          }
    if (Object.keys(overrides).length > 0 && !('label' in overrides)) {
      warnings.push(
        `compile.config.json collections.${type.name} is written exactly as configured and has no label ` +
          `(also none of sortOrder, routable, supports unless you spell them): ${type.name} will show without a label in the admin`
      )
    }
    collections.push({ slug: type.name, ...attributes, fields })
  }

  // ── taxonomies, one per locale ────────────────────────────────────────────
  const taxonomies = []
  for (const tax of model.taxonomies ?? []) {
    for (const locale of locales) {
      // A non-default locale is a TRANSLATION OF the base one, and EmDash records that as a link
      // rather than a copy: taxonomy, term, menu and entry each point back at the base id. The
      // model does not carry these links — they are derivable, and a derivable field written by
      // hand is a field that goes stale. They are rebuilt here instead.
      const translated = locale !== base
      taxonomies.push({
        id: `tax:${tax.name}:${locale}`,
        name: tax.name,
        label: localeText(tax.label, locale, base) ?? titleCase(tax.name),
        labelSingular: localeText(tax.labelSingular, locale, base) ?? titleCase(tax.name),
        hierarchical: tax.hierarchical ?? false,
        collections: tax.appliesTo ?? [],
        locale,
        ...(translated ? { translationOf: `tax:${tax.name}:${base}` } : {}),
        terms: (tax.terms ?? []).map((term) => ({
          id: `term:${tax.name}:${term.slug}:${locale}`,
          slug: term.slug,
          label: localeText(term.label, locale, base) ?? titleCase(term.slug),
          locale,
          ...(translated ? { translationOf: `term:${tax.name}:${term.slug}:${base}` } : {})
        }))
      })
    }
  }

  // ── menus, one per locale ─────────────────────────────────────────────────
  const menuItems = (items, locale) =>
    (items ?? []).map((item) => {
      const url = item.localisedPath?.[locale] ?? item.path ?? item.url ?? ''
      // A source can carry a menu entry that is a GROUP LABEL rather than a link — Joomla calls it
      // a heading, and a megamenu is full of them. EmDash has no such kind and refuses a custom
      // item with no url, so the label is kept and pointed at `#`: the long-standing convention
      // for "this opens the children, it is not a destination". Dropping the entry instead would
      // flatten the menu and lose a word the owner wrote.
      const kind = item.kind === 'heading' ? 'custom' : (item.kind ?? 'custom')
      const out = {
        type: kind,
        label: localeText(item.label, locale, base) ?? '',
        url: item.kind === 'heading' && url === '' ? '#' : url
      }
      if (item.children?.length) out.children = menuItems(item.children, locale)
      return out
    })
  const menus = []
  for (const menu of model.menus ?? []) {
    for (const locale of locales) {
      menus.push({
        id: `menu:${menu.name}:${locale}`,
        name: menu.name,
        label: localeText(menu.label, locale, base) ?? titleCase(menu.name),
        locale,
        ...(locale !== base ? { translationOf: `menu:${menu.name}:${base}` } : {}),
        items: menuItems(menu.items, locale)
      })
    }
  }

  // ── content ───────────────────────────────────────────────────────────────
  // The seed keys content by collection; a record's id is `<collection>:<slug>:<locale>` and its
  // `slug` is the routing slug. Invariant #4 of the skill lives here: the id carries the slug, and
  // the real database id is never invented by a seed.
  // Keyed in the order the records arrive, not the order the types were declared: the two differ
  // (a site's first collection is rarely the first thing a source describes), and following the
  // records keeps a re-compiled seed diff-clean against the one already in the repo.
  const content = {}
  for (const record of model.records) content[record.type] = content[record.type] ?? []
  for (const type of model.types) content[type.name] = content[type.name] ?? []
  for (const record of model.records) {
    const translated = record.locale !== base
    // oxlint-disable-next-line unicorn/no-useless-fallback-in-spread -- kit file, kept byte-for-byte with the kit
    const data = { ...(record.values ?? {}) }
    for (const name of dateFields[record.type] ?? []) if (name in data) data[name] = isoUtc(data[name])
    for (const key of Object.keys(htmlProse)) {
      const [typeName, ...rest] = key.split('.')
      if (typeName === record.type && /<\/?[a-z][^>]*>/i.test(String(data[rest.join('.')] ?? '')))
        htmlProse[key] += 1
    }
    content[record.type].push({
      id: `${record.type}:${record.slug}:${record.locale}`,
      slug: record.slug,
      status: record.status ?? 'published',
      locale: record.locale,
      ...(translated ? { translationOf: `${record.type}:${record.slug}:${base}` } : {}),
      data,
      ...(record.terms && Object.keys(record.terms).length > 0 ? { taxonomies: record.terms } : {})
    })
  }

  const seed = {
    $schema: config.seedSchema ?? 'https://emdashcms.com/seed.schema.json',
    version: config.seedVersion ?? '1',
    defaultLocale: base,
    meta: config.meta ?? {
      name: localeText(model.site?.title, base, base) ?? 'Site',
      description: localeText(model.site?.description, base, base) ?? '',
      author: 'Tracy'
    },
    settings: {
      title: localeText(model.site?.title, base, base) ?? 'Site',
      tagline: localeText(model.site?.tagline, base, base) ?? '',
      postsPerPage: model.site?.postsPerPage ?? config.postsPerPage ?? 10
    },
    collections,
    taxonomies,
    menus,
    // EmDash names these `source`/`destination`; the contract says `from`/`to` because that is what
    // three CMSes and every source format call them. Translating here is the compiler's whole job.
    redirects: (model.redirects ?? []).map((r) => ({ source: r.from, destination: r.to })),
    widgetAreas: config.widgetAreas ?? [],
    sections: config.sections ?? [],
    content
  }

  for (const [key, count] of Object.entries(htmlProse)) {
    if (count > 0)
      warnings.push(
        `${key}: ${count} entr${count === 1 ? 'y holds' : 'ies hold'} HTML but the field is stored as plain text, so the admin shows markup in a textarea. ` +
          `Convert the values to Portable Text and set fields["${key}"].type to "portableText" in compile.config.json, or keep the HTML on purpose and say so in DECISIONS.md`
      )
  }

  // Media never travels inside the seed: EmDash 0.37 does not fetch `$media.url` (invariant #2),
  // so images are listed for the importer to upload and patch in afterwards.
  // `files` is the model's own view (what is used where); `items` is what tools/seed-apply.mjs reads: a key, a
  // mime type and, for each use `type/slug#path`, one target per locale the record exists in.
  const localesOf = {}
  for (const record of model.records) (localesOf[`${record.type}/${record.slug}`] ??= []).push(record.locale)
  for (const item of model.media ?? []) {
    const reason = unsafeReason(item.file)
    if (reason)
      throw new Error(
        `media file ${JSON.stringify(item.file)} ${reason}; media[].file is a relative path inside the media folder`
      )
  }
  const mediaMap = {
    generatedAt: new Date().toISOString(),
    files: (model.media ?? []).map((item) => ({
      file: item.file,
      alt: item.alt ?? {},
      usedBy: item.usedBy ?? []
    })),
    items: (model.media ?? []).map((item) => ({
      key: item.file,
      file: item.file,
      mime: MIME[path.extname(item.file).toLowerCase()] ?? 'application/octet-stream',
      alt: localeText(item.alt, base, base) ?? '',
      targets: (item.usedBy ?? []).flatMap((use) => {
        const [record, field] = use.split('#')
        const [collection, ...slug] = record.split('/')
        return (localesOf[record] ?? []).map((locale) => ({
          collection,
          slug: slug.join('/'),
          locale,
          path: field
        }))
      })
    }))
  }

  return { seed, fieldMap: { generatedAt: new Date().toISOString(), fields: fieldMap }, mediaMap, warnings }
}

function main(argv) {
  const configIndex = argv.indexOf('--config')
  const mediaIndex = argv.indexOf('--media-from')
  const valueOf = new Set([configIndex, mediaIndex].filter((i) => i >= 0).map((i) => i + 1))
  const positional = argv.filter((a, i) => !a.startsWith('--') && !valueOf.has(i))
  const [modelPath, outDir] = positional
  if (!modelPath || !outDir) {
    console.error(
      'usage: compile-seed.mjs <site-model.json> <seed-dir> [--config compile.config.json] [--media-from <dir>]'
    )
    return 2
  }
  let model
  let config = {}
  try {
    model = JSON.parse(readFileSync(path.resolve(modelPath), 'utf8'))
    if (configIndex >= 0) config = JSON.parse(readFileSync(path.resolve(argv[configIndex + 1]), 'utf8'))
  } catch (error) {
    console.error(`cannot read input: ${error.message}`)
    return 2
  }

  let out
  try {
    out = compile(model, config)
  } catch (error) {
    console.error(error.message)
    return 1
  }

  const dir = path.resolve(outDir)
  mkdirSync(dir, { recursive: true })
  // Tabs, because that is what the seed files in this repo already use and a whitespace-only diff
  // on a 262 KB file hides the change that matters underneath it.
  const write = (name, value) => writeFileSync(path.join(dir, name), `${JSON.stringify(value, null, '\t')}\n`)
  write('seed.json', out.seed)
  // Declared slot roles (ADR 0038) are kept by field name; the compiler itself knows none.
  write(
    'field-map.json',
    carryRolesIntoCompiledMap(readPreviousFieldMap(path.join(dir, 'field-map.json')), out.fieldMap)
  )
  write('media-map.json', out.mediaMap)
  for (const warning of out.warnings) console.error(`warning: ${warning}`)
  // The importer reads each file from <seed-dir>/media/<file>; --media-from copies them there from where the
  // model's paths are relative to, and refuses to claim success while one is missing.
  if (mediaIndex >= 0) {
    const from = path.resolve(argv[mediaIndex + 1])
    const missing = []
    for (const item of out.mediaMap.items) {
      let source, target
      try {
        source = joinInside(from, item.file)
        target = joinInside(path.join(dir, 'media'), item.file, { within: dir })
      } catch (error) {
        console.error(`refused media file: ${error.message}`)
        return 1
      }
      if (!existsSync(source)) {
        missing.push(item.file)
        continue
      }
      mkdirSync(path.dirname(target), { recursive: true })
      copyFileSync(source, target)
    }
    if (missing.length > 0) {
      console.error(
        `${missing.length} media file(s) not found under ${from}: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}`
      )
      return 1
    }
  }
  const records = out.seed.collections.reduce((n, c) => n + (out.seed.content[c.slug]?.length ?? 0), 0)
  console.log(
    `compile-seed: ${out.seed.collections.length} collections, ${records} entries, ${out.seed.menus.length} menus → ${path.relative(process.cwd(), dir)}`
  )
  return 0
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)))
