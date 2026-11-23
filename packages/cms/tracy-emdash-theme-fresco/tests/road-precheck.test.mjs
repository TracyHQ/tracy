// The Road to live pre-check of the first release (TCQR ABOUT-2, LANG-2, PAGE-5, PAGE-8; TDSR DEF-1, TEXT-1): the
// package's own copy of what those rules read, so a later change cannot bring a finding back unseen.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
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

test('ABOUT-2: every keptText id names a demo field that exists, and DECISIONS.md gives the reason', () => {
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
    map.trim.filter((r) => r.collection === 'pages' || /_page$/.test(r.collection)),
    []
  )
  assert.deepEqual(map.hide, [])
})

test('DEF-1 and TEXT-1: no invented design-system role, no ground role painted as text', () => {
  const css = []
  const walk = (dir) => {
    for (const f of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (f.isDirectory()) walk(path.join(dir, f.name))
      else if (f.name.endsWith('.css')) css.push(read(path.join(dir, f.name)))
    }
  }
  walk('src/styles')
  const all = css.join('\n')
  assert.ok(!all.includes('--ds-c-ink-raised'))
  assert.ok(!/\.fr-hh-badge \{[^}]*[^-]color: var\(--ds-c-bg/.test(all))
})
