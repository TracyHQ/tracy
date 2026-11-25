// LANG-2 for JA Nova: every word the components print reaches a personalization rule. The set of printed fields is DERIVED from
// `src/**` (a stamp `$x('<field>')`, `chrome.site.<field>`, `row.<field>`, the props of list rows), so a field added to a block
// without a rule fails here. Same approach as the Fresco road pre-check, written for Nova's components.
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { chromeLabelsOf, isLabelText } from '../tools/personalize.mjs'
import { SECTION_HAS_MAIN_TITLE } from '../src/lib/section-style.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')
const seed = JSON.parse(read('seed/seed.json'))
const map = JSON.parse(read('seed/personalize.json'))
const LOCALE = seed.defaultLocale

const entries = Object.entries(seed.content).flatMap(([collection, rows]) =>
  rows
    .filter((r) => (r.locale ?? LOCALE) === LOCALE)
    .map((r) => ({ collection, slug: r.slug, locale: LOCALE, data: r.data ?? {} }))
)

const sourceFiles = () => {
  const out = []
  const walk = (dir) => {
    for (const f of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (f.isDirectory()) walk(path.join(dir, f.name))
      else if (/\.(astro|ts)$/.test(f.name)) out.push([path.join(dir, f.name), read(path.join(dir, f.name))])
    }
  }
  walk('src/components')
  walk('src/views')
  walk('src/lib')
  return out
}

// Not words: switches, numbers, pictures, links, ids, dates, colours, layout choices.
const NOT_WORDS =
  /^_|(?:^|_)(?:id|key|code|handle|show|brand|name|layout|variant|state|status|style|color|colour|type|columns|col|lg|md|xs|number|auto|time|size|align|platform|network|mark|icon|logo|image|img|slug|video|date|created|cover|banner|background|avatar|link|url|href|hits|kind|sort|path|slide|direct|autoplay|highlight|intro|view|body|form)(?:_|$)/i
const isAsset = (v) => /\.(jpe?g|png|webp|svg|gif)$/i.test(v) || v.startsWith('images/')

/** `{ collection, field, prop? }` for each field a component prints. */
export function printedFields() {
  const found = new Map()
  const add = (collection, field, prop, file) => {
    const key = `${collection}.${field}${prop ? `[].${prop}` : ''}`
    if (!found.has(key)) found.set(key, { collection, field, prop, file })
  }
  const seedFields = (collection) =>
    new Set(entries.filter((e) => e.collection === collection).flatMap((e) => Object.keys(e.data)))
  const listProps = (collection) => {
    const props = new Map()
    for (const e of entries.filter((x) => x.collection === collection))
      for (const [field, v] of Object.entries(e.data))
        if (Array.isArray(v))
          for (const row of v)
            if (row && typeof row === 'object')
              for (const p of Object.keys(row)) props.set(p, [...(props.get(p) ?? []), field])
    return props
  }
  for (const [file, text] of sourceFiles()) {
    const vars = new Map()
    for (const m of text.matchAll(/(\$\w+)\s*=\s*(?:\w+\s*\?\s*)?stampFor\([^,]+,\s*'([a-z_]+)'/g))
      vars.set(m[1], m[2])
    const stamped = [...new Set([...vars.values()])]
    const own = stamped.filter((s) => s !== 'chrome')
    // $x('field') and $x('items.prop') and $x.block('items')
    for (const m of text.matchAll(/(\$\w+)(?:\.block)?\('([a-z_][a-z0-9_]*)(?:\.([a-z_][a-z0-9_]*))?'\)/g)) {
      const collection = vars.get(m[1])
      if (collection) add(collection, m[2], m[3], file)
    }
    for (const m of text.matchAll(/\bchrome\.site\.([a-z_][a-z0-9_]*)/g)) add('chrome', m[1], undefined, file)
    // the words object of a view (`w.read_more`), read from the chrome entry
    for (const m of text.matchAll(/\b(?:w|words|labels)\.([a-z_][a-z0-9_]*)\b/g))
      if (seedFields('chrome').has(m[1])) add('chrome', m[1], undefined, file)
    // row.<field>, c.<field>, post.<field>, p.<field>, page.<field>: attribute to each collection the file stamps, where it exists
    for (const m of text.matchAll(/\b(?:row|entry|c|post|p|page|a)\.([a-z_][a-z0-9_]*)\b/g))
      for (const collection of own)
        if (seedFields(collection).has(m[1])) add(collection, m[1], undefined, file)
    // list row props: it.<prop>, b.<prop>, item.<prop>, i.<prop>
    for (const m of text.matchAll(/\b(?:it|b|item|i|s|t|tab|slide)\.([a-z_][a-z0-9_]*)\b/g))
      for (const collection of own) {
        const lists = listProps(collection).get(m[1])
        if (lists) for (const field of new Set(lists)) add(collection, field, m[1], file)
      }
  }
  return found
}

const rowsOf = (e, field) => (Array.isArray(e.data[field]) ? e.data[field] : [])

/** Whether `rules` decide the words of (collection, slug, field[, prop]): a label, copy, blocks, facts, identity, rewrite or keptText rule. */
export function coveredBy(rules, e, field, prop, offered) {
  const slugOk = (r) => r.slug === undefined || r.slug === e.slug
  const listed = (r) => r.collection === e.collection && slugOk(r)
  if ([...(rules.identity ?? []), ...(rules.facts ?? [])].some((r) => listed(r) && r.field === field))
    return true
  if (
    (rules.copy ?? []).some(
      (r) => listed(r) && r.field === field && (!prop || (r.itemFields ?? []).includes(prop))
    )
  )
    return true
  if (
    (rules.blocks ?? []).some(
      (r) => listed(r) && r.field === field && (!prop || (r.itemFields ?? []).includes(prop))
    )
  )
    return true
  if (
    (rules.rewrite ?? []).some(
      (r) =>
        r.collection === e.collection &&
        (!Array.isArray(r.slugs) || r.slugs.includes(e.slug)) &&
        ((r.fields ?? []).includes(field) || r.body === field || field in (r.lists ?? {}))
    )
  )
    return true
  const kept = (rules.keptText ?? []).some(
    (id) =>
      id === `${e.collection}/${e.slug}.${field}${prop ? `[].${prop}` : ''}` ||
      id === `${e.collection}/*.${field}${prop ? `[].${prop}` : ''}`
  )
  if (kept) return true
  if (!prop) return offered.has(`${e.collection}/${e.slug}.${field}`)
  return rowsOf(e, field).some((_, i) => offered.has(`${e.collection}/${e.slug}.${field}.${i}.${prop}`))
}

/** The printed (entry, field) pairs, with words in the demo, that no rule covers. */
export function uncoveredPrintedFields(rules) {
  const offered = new Set(
    chromeLabelsOf({ map: rules, seedEntries: entries, locale: LOCALE, patches: new Map() }).map((l) => l.id)
  )
  const missing = []
  for (const { collection, field, prop, file } of printedFields().values()) {
    if (collection === 'pages' && field === 'body') continue
    if (NOT_WORDS.test(prop ?? field)) continue
    for (const e of entries.filter((x) => x.collection === collection)) {
      const value = e.data[field]
      const texts = prop ? (Array.isArray(value) ? value.map((row) => row?.[prop]) : []) : [value]
      // `features_intro.title` is printed only as the heading of the sections in SECTION_HAS_MAIN_TITLE that have no `main_title`
      // (src/components/blocks/FeaturesIntro.astro); elsewhere it is the entry's name in the admin.
      if (
        collection === 'features_intro' &&
        field === 'title' &&
        !(SECTION_HAS_MAIN_TITLE.has(e.slug) && !e.data.main_title)
      )
        continue
      const words = texts.some((t) => typeof t === 'string' && isLabelText(t) && !isAsset(t.trim()))
      if (!words) continue
      if (!coveredBy(rules, e, field, prop, offered))
        missing.push(`${collection}/${e.slug}.${field}${prop ? `[].${prop}` : ''} (printed by ${file})`)
    }
  }
  return missing
}

test('LANG-2: the derivation finds the fields the components print', () => {
  const found = [...printedFields().keys()]
  for (const key of [
    'chrome.search_button',
    'chrome.close_label',
    'contact.title',
    'hero.button',
    'posts.title'
  ])
    assert.ok(found.includes(key), `${key} not derived from the components`)
  assert.ok(found.length > 60, `only ${String(found.length)} printed fields derived`)
})

test('LANG-2: every text a component prints (visible or as an accessible name) is covered by a personalize rule or a keptText entry', () => {
  assert.deepEqual(uncoveredPrintedFields(map), [])
})

test('LANG-2: the derivation notices a rule that stops covering a printed field', () => {
  const dropLabel = (collection, field) => ({
    ...map,
    labels: map.labels.map((l) =>
      l.collection === collection && l.fields ? { ...l, fields: l.fields.filter((f) => f !== field) } : l
    )
  })
  const dropRule = (kind, collection, field) => ({
    ...map,
    [kind]: (map[kind] ?? []).filter((r) => !(r.collection === collection && r.field === field))
  })
  // chrome is named whole: take the whole rule out and a chrome word is found
  const noChrome = { ...map, labels: map.labels.filter((l) => l.collection !== 'chrome') }
  assert.ok(uncoveredPrintedFields(noChrome).some((m) => m.startsWith('chrome/chrome.search_button')))
  const noContact = { ...map, labels: map.labels.filter((l) => l.collection !== 'contact') }
  assert.ok(
    uncoveredPrintedFields(noContact).some((m) => m.startsWith('contact/contact-layout.address_label'))
  )
  const noRewrite = { ...map, rewrite: [] }
  assert.ok(uncoveredPrintedFields(noRewrite).some((m) => m.startsWith('posts/') && m.includes('.tags')))
  assert.ok(
    uncoveredPrintedFields(dropRule('copy', 'hero', 'title')).some((m) =>
      m.startsWith('hero/home-hero.title')
    )
  )
  // a labelled field no copy rule writes (the page titles and the section heading twins are all copy now)
  const labelled = map.labels
    .filter((l) => Array.isArray(l.fields))
    .flatMap((l) => l.fields.map((f) => [l.collection, f]))
    .find(([c, f]) => !map.copy.some((r) => r.collection === c && r.field === f))
  if (labelled) {
    const [collection, field] = labelled
    assert.ok(
      uncoveredPrintedFields(dropLabel(collection, field)).some((m) => m.includes(`.${field}`)),
      `${collection}.${field} out of its rule is not found`
    )
  }
})

test('LANG-2: every post of the seed is rewritten by a rule that names it', () => {
  const posts = entries.filter((e) => e.collection === 'posts').map((e) => e.slug)
  const named = new Set(
    map.rewrite
      .filter((r) => r.collection === 'posts')
      .flatMap((r) => (Array.isArray(r.slugs) ? r.slugs : []))
  )
  assert.deepEqual(
    posts.filter((s) => !named.has(s)),
    []
  )
  assert.deepEqual(
    [...named].filter((s) => !posts.includes(s)),
    []
  )
})

test('LANG-2: every form of tools/forms.json has a `forms` rule naming every field it has; the taxonomy has a `terms` rule', () => {
  const forms = JSON.parse(read('tools/forms.json')).forms
  assert.ok(forms.length > 0)
  for (const form of forms) {
    const base = form.slug.replace(/-[a-z]{2}(?:-[a-z]{2})?$/i, '')
    const rule = (map.forms ?? []).find((r) => r.slug === base)
    assert.ok(rule, `${form.slug} has no forms rule`)
    for (const f of form.pages.flatMap((p) => p.fields))
      assert.ok(rule.fields?.[f.name], `${form.slug}: field ${f.name} has no entry in the forms rule`)
  }
  for (const tax of seed.taxonomies ?? []) {
    assert.ok(
      (map.terms ?? []).some(
        (r) => r.taxonomy === tax.name && r.collections.some((c) => tax.collections.includes(c))
      ),
      `taxonomy ${tax.name} has no terms rule`
    )
  }
})

test('LANG-2: the contact form address of the demo is not what a customer receives (notifyEmails is replaced by the answer)', () => {
  const forms = JSON.parse(read('tools/forms.json')).forms
  const email = (map.identity ?? []).filter((r) => r.field === 'email' || r.value === '{email}')
  assert.ok(email.length > 0, 'the email answer lands in no field')
  assert.ok(forms.every((f) => (map.forms ?? []).some((r) => f.slug.startsWith(`${r.slug}-`))))
  // the tool writes `notifyEmails: [answers.email]` for every form with a rule: the demo's address stays only without an answer
  const demo = forms.flatMap((f) => f.settings?.notifyEmails ?? [])
  assert.ok(
    demo.every((a) => /\.(example|invalid)$/.test(a)),
    'the demo notification address must be a reserved name'
  )
})

test('LANG-2: demo brand words and demo contact data are rewritten or removed wherever they appear in the seed', () => {
  const brand = (map.demoCompanyNames ?? []).map((w) => w.toLowerCase())
  assert.ok(brand.length > 0)
  const finds = (map.replace ?? []).map((r) => r.find)
  const hits = []
  const walk = (value, e, field) => {
    if (typeof value === 'string') {
      const lower = value.toLowerCase()
      if (
        !brand.some((w) =>
          new RegExp(`(?<![a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i').test(lower)
        )
      )
        return
      // a plain-substring or whole-word replace rule takes the name out of any field
      if (finds.some((f) => lower.includes(f.toLowerCase()))) return
      if (!coveredBy(map, e, field, undefined, new Set()))
        hits.push(`${e.collection}/${e.slug}.${field}: ${value.slice(0, 50)}`)
    } else if (Array.isArray(value)) for (const v of value) walk(v, e, field)
    else if (value && typeof value === 'object') for (const v of Object.values(value)) walk(v, e, field)
  }
  for (const e of entries) for (const [field, value] of Object.entries(e.data)) walk(value, e, field)
  assert.deepEqual(hits, [])
})

test('LANG-2: the demo contact data (address, phone, e-mail) of the chrome and the contact entry is written from the answers', () => {
  const answered = (collection, slug, field, token) =>
    (map.identity ?? []).some(
      (r) => r.collection === collection && r.slug === slug && r.field === field && r.value === token
    )
  const chrome = entries.find((e) => e.collection === 'chrome')
  const contact = entries.find((e) => e.collection === 'contact')
  for (const [e, field, token] of [
    [chrome, 'header_phone', '{phone}'],
    [chrome, 'header_email', '{email}'],
    [contact, 'address', '{address}'],
    [contact, 'phone', '{phone}'],
    [contact, 'email', '{email}']
  ])
    if (e.data[field])
      assert.ok(
        answered(e.collection, e.slug, field, token),
        `${e.collection}.${field} is not written from ${token}`
      )
})

test('PAGE-5: no link of the seed or the site model is a bare #', () => {
  const hashes = (v, at, out) => {
    if (typeof v === 'string') {
      if (v.trim() === '#' || /href=["']#["']/.test(v)) out.push(at)
    } else if (Array.isArray(v)) v.forEach((x, i) => hashes(x, `${at}[${String(i)}]`, out))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) hashes(x, `${at}.${k}`, out)
    return out
  }
  assert.deepEqual(hashes(seed, 'seed', []), [])
  assert.deepEqual(hashes(JSON.parse(read('seed/site-model.json')), 'model', []), [])
})

test('every keptText id names a demo field that exists and docs/content-rules.md gives the reason', () => {
  assert.ok(existsSync(path.join(ROOT, 'docs/content-rules.md')))
  const rules = read('docs/content-rules.md')
  for (const id of map.keptText ?? []) {
    const m = /^([a-z_]+)\/([a-z0-9_*-]+)\.([a-z_]+)(?:\[\]\.([a-z_]+))?$/.exec(id)
    assert.ok(m, `${id} is collection/slug.field[][.prop]`)
    const rows = entries.filter((e) => e.collection === m[1] && (m[2] === '*' || e.slug === m[2]))
    assert.ok(
      rows.some((e) => m[3] in e.data),
      `${id} names no field of the seed`
    )
    assert.ok(rules.includes(id), `${id} has no reason in docs/content-rules.md`)
  }
})
