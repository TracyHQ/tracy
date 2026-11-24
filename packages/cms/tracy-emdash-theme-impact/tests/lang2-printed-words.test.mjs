// LANG-2: every demo text and interface word a component prints is covered by a personalize rule (or a keptText entry with its
// reason in DECISIONS.md), so a customer who writes the site in another language, or for another organization, never keeps a
// demo sentence or an English button by accident.
//
// The printed fields are DERIVED from the components, not listed here: every field a view prints is made editable with a
// provenance stamp (`const $x = stampFor(Astro.request, '<collection>', …)` then `{...$x('<field>')}`, or `$x(`items[${i}].title`)`
// for a row of a list field). Reading those calls gives (collection, field). A rule that stops covering one fails this test, and a
// negative control proves the derivation can fail.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')
const seed = JSON.parse(read('seed/seed.json'))
const map = JSON.parse(read('seed/personalize.json'))
const decisions = read('DECISIONS.md')

/** Not interface words: switches, numbers, pictures, links, names of people, colours, ids. */
const NOT_WORDS =
  /^_|(?:^|_)(?:id|key|slug|path|status|layout|style|color|colour|type|columns|col|number|align|alignment|icon|img|image|media|video|cover|banner|avatar|link|url|href|date|created|ordering|featured|position|class|variant|bg|size|currency|symbol)(?:_|$)/
/** Printed on a page and written by no rule: names of people and the demo tags (the author line, the tag chips). */
const KEPT = [/^posts\.author$/, /^donations\.author$/, /^events\.author$/, /^(posts|donations|events)\.tags$/]

function files(dir, found = []) {
  for (const f of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (f.isDirectory()) files(path.join(dir, f.name), found)
    else if (/\.astro$/.test(f.name)) found.push(path.join(dir, f.name))
  }
  return found
}

/** (collection, field pattern, file) for every stamped field of a component or view. */
function printedFields() {
  const out = []
  for (const file of files('src')) {
    const text = read(file)
    const vars = new Map()
    for (const m of text.matchAll(/const\s+\$([a-zA-Z]+)\s*=\s*(?:[^;\n]*?\?\s*)?stampFor\([^,]+,\s*'([a-z_]+)'/g)) vars.set(m[1], m[2])
    for (const m of text.matchAll(/stampFor\([^,]+,\s*'([a-z_]+)'[^)]*\)\s*\(?\s*(?:'([a-z_]+)'|`([^`]+)`)?/g))
      if (m[2] || m[3]) out.push({ collection: m[1], field: m[2] ?? m[3], file })
    for (const m of text.matchAll(/\$([a-zA-Z]+)\(\s*(?:'([^']+)'|`([^`]+)`)\s*\)/g)) {
      const collection = vars.get(m[1])
      if (collection) out.push({ collection, field: m[2] ?? m[3], file })
    }
  }
  return out
}

/** `items[${i}].title` → { root: 'items', sub: 'title' }; `footer_col${n}_title` → a pattern; plain `title` → { root: 'title' }. */
function parseField(raw) {
  const row = /^([a-z_]+)\[\$\{[^}]+\}\]\.([a-z_]+)$/.exec(raw)
  if (row) return { root: row[1], sub: row[2] }
  if (raw.includes('${')) return { pattern: new RegExp(`^${raw.replace(/\$\{[^}]+\}/g, '[0-9a-z]+')}$`) }
  return { root: raw }
}

const entries = Object.entries(seed.content).flatMap(([collection, rows]) =>
  rows.filter((r) => (r.locale ?? seed.defaultLocale) === seed.defaultLocale).map((r) => ({ collection, slug: r.slug, data: r.data ?? {} }))
)
const isWords = (v) =>
  typeof v === 'string' &&
  v.trim().length > 1 &&
  v.length <= 400 &&
  !/^(images\/|\/|https?:|mailto:|tel:|[0-9a-f-]{20,}$)/i.test(v) &&
  !/\.(jpe?g|png|webp|svg)$/i.test(v) &&
  /[A-Za-z]{2}/.test(v)

function coveredBy(rules, collection, slug, field, sub) {
  const named = (r) => r.collection === collection && (r.slug === undefined || r.slug === slug || (r.slugs ?? []).includes(slug))
  if ((rules.labels ?? []).some((r) => r.collection === collection && (!r.fields || r.fields.includes(field) || (sub && r.fields.includes(sub))))) return true
  for (const kind of ['copy', 'facts', 'identity'])
    if ((rules[kind] ?? []).some((r) => named(r) && r.field === field && (!sub || !r.itemFields || r.itemFields.includes(sub) || r.rows || kind === 'facts'))) return true
  if ((rules.rewrite ?? []).some((r) => named(r) && ((r.fields ?? []).includes(field) || r.body === field))) return true
  return (rules.keptText ?? []).some((id) => id === `${collection}/${slug}.${field}`)
}

function uncovered(rules) {
  const missing = new Set()
  for (const { collection, field: raw, file } of printedFields()) {
    const f = parseField(raw)
    for (const e of entries.filter((x) => x.collection === collection)) {
      const fields = f.pattern ? Object.keys(e.data).filter((k) => f.pattern.test(k)) : [f.root]
      for (const field of fields) {
        if (NOT_WORDS.test(field) || KEPT.some((re) => re.test(`${collection}.${field}`))) continue
        const value = e.data[field]
        const words = Array.isArray(value)
          ? f.sub && value.some((row) => isWords(row?.[f.sub]) && !NOT_WORDS.test(f.sub))
          : isWords(value)
        if (!words) continue
        if (!coveredBy(rules, collection, e.slug, field, f.sub)) missing.add(`${collection}/${e.slug}.${field}${f.sub ? `[].${f.sub}` : ''}  (${file})`)
      }
    }
  }
  return [...missing].sort()
}

test('LANG-2: every field a component prints (visible text or an accessible name) is covered by a personalize rule', () => {
  const missing = uncovered(map)
  assert.deepEqual(missing, [], `printed and written by no rule:\n  ${missing.join('\n  ')}`)
})

test('LANG-2: the derivation finds what is missing (rules taken out in turn)', () => {
  const without = (kind, pick) => ({ ...map, [kind]: map[kind].filter((r) => !pick(r)) })
  assert.ok(printedFields().length > 20, 'the derivation reads the components')
  assert.ok(uncovered(without('labels', (r) => r.collection === 'chrome')).some((m) => m.startsWith('chrome/')), 'chrome labels')
  assert.ok(uncovered(without('copy', (r) => r.slug === 'home-donor-base' && r.field === 'feature_desc')).some((m) => m.includes('home-donor-base.feature_desc')), 'a copy rule')
  assert.ok(uncovered(without('labels', (r) => r.collection === 'hero')).some((m) => m.startsWith('hero/')), 'hero titles')
})

test('ABOUT-2: every keptText id names a demo field that exists and DECISIONS.md gives the reason', () => {
  for (const id of map.keptText ?? []) {
    const [collection, rest] = id.split('/')
    const [slug, field] = [rest.slice(0, rest.lastIndexOf('.')), rest.slice(rest.lastIndexOf('.') + 1)]
    const e = entries.find((x) => x.collection === collection && x.slug === slug)
    assert.ok(e && field in e.data, `${id} names no field of the seed`)
    assert.ok(decisions.includes(id), `${id} has no reason in DECISIONS.md`)
  }
})

test('LANG-2: every form of tools/forms.json has a forms rule', () => {
  const forms = JSON.parse(read('tools/forms.json')).forms ?? []
  for (const f of forms) {
    const base = String(f.slug).replace(/-en$/, '')
    assert.ok((map.forms ?? []).some((r) => r.slug === base), `form ${f.slug} has no forms rule`)
  }
})

test('PAGE-5: no link field of the seed or the site model is a #', () => {
  const hash = (v, found = []) => {
    if (Array.isArray(v)) for (const x of v) hash(x, found)
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) (k === 'link' && x === '#' ? found.push(k) : hash(x, found))
    return found
  }
  assert.equal(hash(seed).length, 0)
  assert.equal(hash(JSON.parse(read('seed/site-model.json'))).length, 0)
})
