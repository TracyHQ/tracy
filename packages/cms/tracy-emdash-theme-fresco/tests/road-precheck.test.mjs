// The Road to live pre-check of the first release (TCQR ABOUT-2, LANG-2, PAGE-5, PAGE-8; TDSR DEF-1, TEXT-1): the
// package's own copy of what those rules read, so a later change cannot bring a finding back unseen.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')
const seed = JSON.parse(read('seed/seed.json'))
const model = JSON.parse(read('seed/site-model.json'))
const map = JSON.parse(read('seed/personalize.json'))
const defaults = (collection) =>
  (seed.content[collection] ?? []).filter((e) => (e.locale ?? seed.defaultLocale) === seed.defaultLocale)

const hashLinks = (value, found = []) => {
  if (Array.isArray(value)) for (const v of value) hashLinks(v, found)
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      if (k === 'link' && v === '#') found.push(k)
      else hashLinks(v, found)
    }
  return found
}

const styles = () => {
  const css = []
  const walk = (dir) => {
    for (const f of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (f.isDirectory()) walk(path.join(dir, f.name))
      else if (f.name.endsWith('.css')) css.push(read(path.join(dir, f.name)))
    }
  }
  walk('src/styles')
  return css.join('\n')
}

test('PAGE-5: no link field of the seed or the site model is a #', () => {
  assert.equal(hashLinks(seed).length, 0)
  assert.equal(hashLinks(model).length, 0)
})

test('LANG-2: personalize labels names every collection that has an interface-word field', () => {
  const words = /_(?:label|title|text|button|placeholder|heading|caption)$/i
  const named = new Set(map.labels.map((l) => l.collection))
  for (const [collection, rows] of Object.entries(seed.content)) {
    const own = rows.filter((r) => (r.locale ?? seed.defaultLocale) === seed.defaultLocale)
    const has = own.some((r) => Object.keys(r.data ?? {}).some((k) => words.test(k)))
    if (has) assert.ok(named.has(collection), `${collection} has interface words and no labels rule`)
  }
})

test('LANG-2: a labels rule that lists fields lists every interface word its components render', () => {
  // Read from the components that render the collection: a short text field of the seed, printed as `entry.<field>`,
  // that no copy, facts, identity or rewrite rule writes and whose key is not an address, a switch, a number or a name
  // is a word of the interface, and the rule must list it (the booking dialog kept "Book Table" in English once).
  const notALabel =
    /^_|(?:^|_)(?:url|urls|link|links|href|slug|email|phone|hotline|image|img|icon|logo|network|platform|size|align|key|mark|id|code|handle|show|brand|name|layout|variant|state|status|style|color|colour|form|type|columns|col|number|auto|time)(?:_|$)/i
  const code = []
  const walk = (dir) => {
    for (const f of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (f.isDirectory()) walk(path.join(dir, f.name))
      else if (/\.(astro|ts)$/.test(f.name)) code.push(read(path.join(dir, f.name)))
    }
  }
  walk('src')
  const components = code.join('\n')
  const owned = (collection, slug, field) =>
    [...map.copy, ...map.facts, ...(map.identity ?? [])].some(
      (r) => r.collection === collection && (r.slug === undefined || r.slug === slug) && r.field === field
    ) ||
    (map.rewrite ?? []).some(
      (r) =>
        r.collection === collection &&
        (!Array.isArray(r.slugs) || r.slugs.includes(slug)) &&
        ((r.fields ?? []).includes(field) || r.body === field || field in (r.lists ?? {}))
    )
  const missing = []
  for (const rule of map.labels.filter((l) => Array.isArray(l.fields))) {
    for (const entry of defaults(rule.collection)) {
      for (const [field, value] of Object.entries(entry.data ?? {})) {
        if (typeof value !== 'string' || value.trim() === '' || value.length > 120) continue
        if (field === 'title' || notALabel.test(field) || rule.fields.includes(field)) continue
        if (!new RegExp(`entry\\.${field}\\b`).test(components)) continue
        if (owned(rule.collection, entry.slug, field)) continue
        missing.push(`${rule.collection}/${entry.slug}.${field} ("${value.slice(0, 24)}")`)
      }
    }
  }
  assert.deepEqual(missing, [], 'interface words the labels rule does not list')
  // `title` is the entry's name in the admin; two blocks print it as the accessible name of their region
  for (const collection of ['testimonials', 'gallery']) {
    const rule = map.labels.find((l) => l.collection === collection)
    assert.ok(rule.fields.includes('title'), `${collection}: the region's aria-label reads the title`)
  }
})

test('ABOUT-2: every keptText id names a demo field that exists, and DECISIONS.md gives the reason', (t) => {
  // DECISIONS.md is repository-only: the package does not ship it, so there the reasons cannot be read.
  if (!existsSync(path.join(ROOT, 'DECISIONS.md')))
    return t.skip('DECISIONS.md is not shipped in the package')
  const decisions = read('DECISIONS.md')
  assert.ok(map.keptText.length > 0)
  for (const id of map.keptText) {
    const m = /^([a-z_]+)\/([a-z0-9_-]+)\.([a-z_]+)$/.exec(id)
    assert.ok(m, `${id} is collection/slug.field`)
    const entry = defaults(m[1]).find((e) => e.slug === m[2])
    assert.ok(entry && m[3] in entry.data, `${id} names no field of the seed`)
    assert.ok(decisions.includes(id), `${id} has no reason in DECISIONS.md`)
  }
})

test('PAGE-8: the Blog page is covered by the trim rule of its posts, and no trim rule cuts a page (PAGE-2)', () => {
  const rule = map.trim.find((r) => r.slug === 'blog')
  assert.ok(rule)
  assert.equal(rule.collection, 'posts')
  assert.ok(rule.keep >= defaults('posts').length)
  assert.deepEqual(
    map.trim.filter((r) => r.collection === 'pages' || r.collection.endsWith('_page')),
    []
  )
  assert.deepEqual(map.hide, [])
})

test('DEF-1 and TEXT-1: no invented design-system role, no ground role painted as text', () => {
  const css = styles()
  assert.ok(!css.includes('--ds-c-ink-raised'))
  assert.ok(!/\.fr-hh-badge \{[^}]*[^-]color: var\(--ds-c-bg/.test(css))
})

test('CON-1, CON-2, ICON-1, BORDER-1: text and controls read the role of their own ground', () => {
  const css = styles()
  // a section description follows the system's text colour, and the on-ink one on an ink band
  assert.match(css, /\.fr-top-desc \{[^}]*color: var\(--ds-c-fg, rgba\(255, 255, 255, 0\.8\)\)/)
  assert.match(
    css,
    /\.fr-section\.is-band :is\([^)]*\.fr-dish-desc[^)]*\.fr-top-desc\) \{ color: var\(--ds-c-on-ink,/
  )
  assert.match(css, /\.fr-t-nav \{[^}]*color: var\(--color-on-ink\)/)
  assert.match(css, /\.fr-pagination li\.is-active > span \{[^}]*border-color: var\(--color-accent\)/)
  // no text colour written as a bare white on a template ground
  assert.ok(!/\.fr-top-desc \{[^}]*color: rgba\(255, 255, 255/.test(css))
})

test('FORM-1: the contact and search fields are painted from the slot, with the template value as fallback', () => {
  for (const file of ['contact', 'search']) {
    const css = read(`src/styles/pages/${file}.css`)
    assert.match(css, /background: var\(--ds-c-surface, rgba\(255, 255, 255, \.06\)\)/)
    assert.match(css, /border: 1px solid var\(--ds-c-border, rgba\(255, 255, 255, \.07\)\)/)
    assert.match(css, /color: var\(--ds-c-fg, #fff\)/)
    assert.ok(!/background: color-mix/.test(css), `${file}.css fills a field with a color-mix`)
  }
})

test('IDENT-2: under a system the demo logo is drawn in the heading colour through a mask of the same picture', () => {
  const css = read('src/styles/global.css')
  assert.match(
    css,
    /html\[data-ds-worn\] \.fr-brand \.fr-logo-ink \{[^}]*background: linear-gradient\(var\(--ds-c-heading, #fff\)[^}]*mask: url\("\/brand\/logo\.png"\)/
  )
  assert.match(
    css,
    /html\[data-ds-worn\] \.fr-brand \.fr-logo\[src\$="brand\/logo\.png"\] \{ display: none; \}/
  )
  assert.match(read('src/components/site/Header.astro'), /class="fr-logo-ink" role="img"/)
})
