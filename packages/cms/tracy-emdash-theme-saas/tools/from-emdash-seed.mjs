#!/usr/bin/env node
// from-emdash-seed.mjs — an existing EmDash seed → site-model.json + compile.config.json.
//
//   node tools/from-emdash-seed.mjs <seed.json> <out-dir>
//
// WHY THIS EXISTS. A template built before the contract (Business, 1,829 lines of build-seed.mjs)
// already holds the data in its seed. Reading it back is how that data moves into the contract
// without a human retyping it — and, more importantly, how the contract gets PROVED: compile the
// model this writes and the result must equal the seed it was read from, byte for byte.
//
// IT IS A BOOTSTRAP, NOT A PIPELINE. Nothing downstream should ever read an EmDash seed as a
// source; real sources are Joomla, WordPress, HTML, a brief. Once a template's data lives in a
// model, this script has done its job for that template.
//
// WHAT GOES WHERE, AND WHY IT MATTERS. Content goes into the model: records, values, menus, terms,
// media. Presentation decisions of the target go into compile.config.json: sort order in the
// admin, which long text is portableText, what the collection description reads. That split is
// the whole point of ADR 0016 — get it wrong and the model stops being readable by the other two
// skills.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DEFAULT_FIELD_TYPES } from './compile-seed.mjs'
import { SITE_MODEL_SCHEMA } from '../contract/site-model.mjs'

/** EmDash field type → the source kind that compiles back to it. */
const SOURCE_KIND_FOR = {
  string: 'text',
  text: 'prose',
  integer: 'number',
  boolean: 'boolean',
  datetime: 'date',
  image: 'image',
  reference: 'reference',
  repeater: 'group',
  json: 'link',
  portableText: 'prose',
  select: 'text'
}

const PASS_THROUGH = ['required', 'validation', 'options', 'searchable', 'indexed', 'defaultValue']
const titleCase = (slug) => slug.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

export function reverse(seed) {
  const base = seed.defaultLocale
  const locales = [
    ...new Set(
      [
        base,
        ...(seed.taxonomies ?? []).map((t) => t.locale),
        ...(seed.menus ?? []).map((m) => m.locale),
        ...Object.values(seed.content ?? {})
          .flat()
          .map((e) => e.locale)
      ].filter(Boolean)
    )
  ]

  const config = {
    seedSchema: seed.$schema,
    seedVersion: seed.version,
    meta: seed.meta,
    collections: {},
    fields: {}
  }
  if (seed.widgetAreas?.length) config.widgetAreas = seed.widgetAreas
  if (seed.sections?.length) config.sections = seed.sections

  // ── types ─────────────────────────────────────────────────────────────────
  const types = []
  for (const collection of seed.collections ?? []) {
    const fields = []
    for (const field of collection.fields ?? []) {
      const kind = SOURCE_KIND_FOR[field.type]
      if (!kind)
        throw new Error(
          `no source kind for EmDash field type "${field.type}" (${collection.slug}.${field.slug})`
        )
      const out = { name: field.slug, type: kind }
      if (field.label !== titleCase(field.slug)) out.label = field.label
      for (const attr of PASS_THROUGH) if (field[attr] !== undefined) out[attr] = field[attr]
      if (field.type === 'reference') {
        // EmDash ≥0.41 names the target in validation; seeds written before it, under options.
        out.of = field.validation?.targetCollection ?? field.options?.collection
        // The model names the target plainly, so drop the copy PASS_THROUGH just made or the
        // compiler would write it twice.
        if (out.options && Object.keys(out.options).length === 1 && out.options.collection) delete out.options
        if (out.validation) {
          const rest = { ...out.validation }
          delete rest.targetCollection
          if (Object.keys(rest).length === 0) delete out.validation
          else out.validation = rest
        }
      }
      if (field.type === 'repeater' && Array.isArray(field.validation?.subFields)) {
        out.fields = field.validation.subFields.map((sub) => ({
          name: sub.slug,
          type: SOURCE_KIND_FOR[sub.type] ?? 'text',
          label: sub.label
        }))
        const rest = { ...field.validation }
        delete rest.subFields
        if (Object.keys(rest).length === 0) delete out.validation
        else out.validation = rest
      }
      // The target's own decision when the default mapping would not round-trip.
      if (DEFAULT_FIELD_TYPES[kind] !== field.type) {
        config.fields[`${collection.slug}.${field.slug}`] = { type: field.type }
      }
      fields.push(out)
    }

    // One record per locale means `single`; many slugs means `list`.
    const entries = seed.content?.[collection.slug] ?? []
    const slugs = new Set(entries.map((e) => e.slug))
    types.push({
      name: collection.slug,
      mode: slugs.size <= 1 ? 'single' : 'list',
      label: { [base]: collection.label },
      fields
    })
    // Everything the target says about a collection except its identity and its fields is a
    // presentation decision: urlPattern, admin, dateField, supports, sort order. Copy them WHOLE
    // and in their original order — a hand-written list of the attributes we happen to know today
    // silently drops the one a future EmDash adds.
    const { slug: _slug, fields: _fields, ...attributes } = collection
    config.collections[collection.slug] = attributes
  }

  // ── taxonomies: the per-locale copies fold back into one ───────────────────
  const taxonomies = []
  for (const tax of seed.taxonomies ?? []) {
    let existing = taxonomies.find((t) => t.name === tax.name)
    if (!existing) {
      existing = {
        name: tax.name,
        label: {},
        labelSingular: {},
        hierarchical: tax.hierarchical ?? false,
        appliesTo: tax.collections ?? [],
        terms: []
      }
      taxonomies.push(existing)
    }
    existing.label[tax.locale] = tax.label
    existing.labelSingular[tax.locale] = tax.labelSingular
    for (const term of tax.terms ?? []) {
      let known = existing.terms.find((t) => t.slug === term.slug)
      if (!known) {
        known = { slug: term.slug, label: {} }
        existing.terms.push(known)
      }
      known.label[tax.locale] = term.label
    }
  }

  // ── menus: same folding ───────────────────────────────────────────────────
  const foldItems = (items, into, locale) => {
    ;(items ?? []).forEach((item, i) => {
      if (!into[i])
        into[i] = { label: {}, path: item.url, kind: item.type === 'custom' ? undefined : item.type }
      into[i].label[locale] = item.label
      if (into[i].path !== item.url && locale !== undefined)
        into[i].localisedPath = { ...into[i].localisedPath, [locale]: item.url }
      if (item.children?.length) {
        into[i].children = into[i].children ?? []
        foldItems(item.children, into[i].children, locale)
      }
    })
  }
  const menus = []
  for (const menu of seed.menus ?? []) {
    let existing = menus.find((m) => m.name === menu.name)
    if (!existing) {
      existing = { name: menu.name, label: {}, items: [] }
      menus.push(existing)
    }
    existing.label[menu.locale] = menu.label
    foldItems(menu.items, existing.items, menu.locale)
  }

  // ── records ───────────────────────────────────────────────────────────────
  const records = []
  for (const [collectionSlug, entries] of Object.entries(seed.content ?? {})) {
    for (const entry of entries) {
      records.push({
        type: collectionSlug,
        slug: entry.slug,
        locale: entry.locale,
        status: entry.status ?? 'published',
        ...(entry.taxonomies ? { terms: entry.taxonomies } : {}),
        values: entry.data ?? {}
      })
    }
  }

  // ── routes, from what the seed says is reachable ───────────────────────────
  const routes = []
  for (const collection of seed.collections ?? []) {
    if (!collection.routable) continue
    routes.push({ path: `/${collection.slug}`, kind: 'list', type: collection.slug })
    for (const entry of seed.content?.[collection.slug] ?? []) {
      if (entry.locale !== base) continue
      routes.push({
        path: `/${collection.slug}/${entry.slug}`,
        kind: 'detail',
        type: collection.slug,
        slug: entry.slug
      })
    }
  }

  const model = {
    $schema: SITE_MODEL_SCHEMA,
    source: {
      kind: 'canvas',
      parity: 'measured',
      origin: seed.meta?.name ?? null,
      capturedAt: new Date().toISOString()
    },
    locales: { default: base, all: locales },
    site: {
      title: { [base]: seed.settings?.title },
      tagline: { [base]: seed.settings?.tagline },
      postsPerPage: seed.settings?.postsPerPage
    },
    types,
    taxonomies,
    records,
    menus,
    routes,
    redirects: (seed.redirects ?? []).map((r) => ({ from: r.source ?? r.from, to: r.destination ?? r.to })),
    media: [],
    tokens: {},
    facts: []
  }
  return { model, config }
}

function main(argv) {
  const [seedPath, outDir] = argv
  if (!seedPath || !outDir) {
    console.error('usage: from-emdash-seed.mjs <seed.json> <out-dir>')
    return 2
  }
  const seed = JSON.parse(readFileSync(path.resolve(seedPath), 'utf8'))
  const { model, config } = reverse(seed)
  const dir = path.resolve(outDir)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'site-model.json'), `${JSON.stringify(model, null, 2)}\n`)
  writeFileSync(path.join(dir, 'compile.config.json'), `${JSON.stringify(config, null, 2)}\n`)
  console.log(
    `from-emdash-seed: ${model.types.length} types, ${model.records.length} records, ${model.menus.length} menus → ${path.relative(process.cwd(), dir)}`
  )
  return 0
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)))
