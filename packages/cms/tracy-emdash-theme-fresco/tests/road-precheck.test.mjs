// The Road to live pre-check of the first release (TCQR ABOUT-2, LANG-2, PAGE-5, PAGE-8; TDSR DEF-1, TEXT-1): the
// package's own copy of what those rules read, so a later change cannot bring a finding back unseen.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { chromeLabelsOf, isLabelText } from '../tools/personalize.mjs'

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

/**
 * The interface words the components print from the collections a `labels` rule names, that the tool would not translate:
 * a short text field of the seed, printed as `<entry>.<field>` or named as an edit attribute, that no copy, facts, identity or rewrite rule writes, whose
 * key is not an enumeration or a name, and that `chromeLabelsOf` (the tool's own reading of the rules) does not offer.
 */
// Known and decided (D48): the alt text of the demo pictures of the two gallery blocks. Nothing else.
const KNOWN_GAPS = /^gallery\/[a-z0-9-]+\.items\[\]\.gallery_alt$/

function untranslatedInterfaceWords(labelsMap) {
  const enumeration =
    /^_|(?:^|_)(?:id|key|code|handle|show|brand|name|layout|variant|state|status|style|color|colour|type|columns|col|number|auto|time|size|align|platform|network|mark|icon|logo|image|img|slug)(?:_|$)/i
  const code = []
  const walk = (dir) => {
    for (const f of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (f.isDirectory()) walk(path.join(dir, f.name))
      else if (/\.(astro|ts)$/.test(f.name)) code.push(read(path.join(dir, f.name)))
    }
  }
  walk('src')
  const components = code.join('\n')
  const seedEntries = Object.entries(seed.content).flatMap(([collection, rows]) =>
    rows.map((r) => ({
      collection,
      slug: r.slug,
      locale: r.locale ?? seed.defaultLocale,
      data: r.data ?? {}
    }))
  )
  const offered = new Set(
    chromeLabelsOf({ map: labelsMap, seedEntries, locale: seed.defaultLocale, patches: new Map() }).map(
      (l) => l.id
    )
  )
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
  for (const rule of labelsMap.labels) {
    for (const entry of defaults(rule.collection)) {
      for (const [field, value] of Object.entries(entry.data ?? {})) {
        if (Array.isArray(value)) {
          // the rows of a list: a short text property printed by a component, written by no rule, that the tool does not offer
          value.forEach((row, i) => {
            if (!row || typeof row !== 'object' || owned(rule.collection, entry.slug, field)) return
            for (const [prop, text] of Object.entries(row)) {
              if (
                typeof text !== 'string' ||
                text.length > 120 ||
                !isLabelText(text) ||
                enumeration.test(prop)
              )
                continue
              if (!new RegExp(`[.'"]${prop}\\b`).test(components)) continue
              const id = `${rule.collection}/${entry.slug}.${field}[].${prop}`
              if (
                !offered.has(`${rule.collection}/${entry.slug}.${field}.${i}.${prop}`) &&
                !KNOWN_GAPS.test(id)
              )
                missing.push(`${id} ("${text.slice(0, 24)}")`)
            }
          })
          continue
        }
        if (typeof value !== 'string' || value.trim() === '' || value.length > 120 || !isLabelText(value))
          continue
        if (/\.(jpe?g|png|webp|svg)$/i.test(value) || value.startsWith('images/')) continue
        // `title` is the entry's name in the admin; the blocks that print it are listed in the test below
        if (field === 'title' || enumeration.test(field)) continue
        if (!new RegExp(`[.'"]${field}\\b`).test(components)) continue
        if (owned(rule.collection, entry.slug, field)) continue
        if (!offered.has(`${rule.collection}/${entry.slug}.${field}`))
          missing.push(`${rule.collection}/${entry.slug}.${field} ("${value.slice(0, 24)}")`)
      }
    }
  }
  return missing
}

test('LANG-2: every interface word the components print from a labels collection is one the tool translates', () => {
  // The booking dialog kept "Book Table" in English once (book_btn missing from the rule) and the footer's
  // "Privacy Policy" another time (a key ending in _link is read as an address): both are read from the tool itself.
  assert.deepEqual(untranslatedInterfaceWords(map), [])
  // `title` is the entry's name in the admin, and words a visitor reads in these four: the heading of an inner page
  // (masthead), the title of a page (pages), the accessible name of the testimonial and gallery regions
  for (const collection of ['masthead', 'pages', 'testimonials', 'gallery'])
    assert.ok(
      map.labels.find((l) => l.collection === collection).fields.includes('title'),
      `${collection} title`
    )
})

test('LANG-2: the check above is not vacuous (a field taken out of a rule, or a key the tool reads as an address, is found)', () => {
  const without = (collection, field) => ({
    ...map,
    labels: map.labels.map((l) =>
      l.collection === collection && l.fields ? { ...l, fields: l.fields.filter((f) => f !== field) } : l
    )
  })
  for (const [collection, field] of [
    ['book_table', 'book_btn'],
    ['book_table', 'order_btn'],
    ['book_table', 'book_phone_title'],
    ['teams', 'title_btn'],
    ['features_intro', 'button'],
    ['happyhours', 'hp_link_text']
  ])
    assert.ok(
      untranslatedInterfaceWords(without(collection, field)).some(
        (m) => m.startsWith(`${collection}/`) && m.includes(`.${field} `)
      ),
      `${collection}.${field} out of its rule is not found`
    )
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

test("LANG-2: every form of tools/forms.json has a `forms` rule (its words are translated and its mailbox is the customer's), and the taxonomy and the hero words are covered", () => {
  const forms = JSON.parse(read('tools/forms.json')).forms
  assert.ok(forms.length > 0)
  for (const form of forms) {
    const base = form.slug.replace(/-[a-z]{2}(?:-[a-z]{2})?$/i, '')
    assert.ok(
      (map.forms ?? []).some((r) => r.slug === base),
      `${form.slug} has no forms rule`
    )
  }
  assert.ok((map.terms ?? []).some((r) => r.taxonomy === 'category' && r.collections.includes('posts')))
  const hero = map.copy.find((c) => c.collection === 'hero' && c.field === 'items')
  for (const prop of ['sub_title', 'title', 'desc', 'button', 'button_2'])
    assert.ok(hero.itemFields.includes(prop), `hero ${prop}`)
})
