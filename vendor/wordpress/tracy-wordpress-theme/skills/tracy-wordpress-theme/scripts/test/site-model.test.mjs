// site-model.test.mjs — from-joomla also emits the neutral source contract (ADR 0016 of TCH).
//
// What matters here is not that a file appears, but that it carries the source as AUTHORED: the
// article HTML Joomla stored, not the block markup this skill produces for WordPress. A model that
// quietly inherits the WordPress packaging would validate, compile, and hand the other two skills
// a mess to undo — silently.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildPack as buildSpecPack } from './source-font-fixtures.mjs'
import { SITE_MODEL_SCHEMA } from '../ingest/site-model.mjs'

const here = join(import.meta.dirname)
const FIXTURE = join(here, 'fixtures', 'joomla-min')

function model() {
  const out = mkdtempSync(join(tmpdir(), 'site-model-'))
  try {
    buildSpecPack({ j6Dir: FIXTURE, out, pageFloor: 1, now: '2026-01-01T00:00:00.000Z' })
    return JSON.parse(readFileSync(join(out, 'site-model.json'), 'utf8'))
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
}

test('the spec-pack now carries site-model.json, declaring the contract version', () => {
  const m = model()
  assert.equal(m.$schema, SITE_MODEL_SCHEMA)
  assert.equal(m.source.kind, 'joomla')
  assert.equal(m.source.parity, 'measured')
  assert.ok(m.types.length >= 2 && m.records.length > 0)
})

test('prose is the article as authored — no WordPress packaging reaches the contract', () => {
  const serialised = JSON.stringify(model())
  for (const foreign of ['wp:paragraph', 'wp-content', 'wp-block', 'wp:more']) {
    assert.ok(!serialised.includes(foreign), `${foreign} leaked into the neutral contract`)
  }
})

test('a page and a post become records of their own types, a section kind becomes a type', () => {
  const m = model()
  const names = m.types.map((t) => t.name)
  assert.ok(names.includes('pages') && names.includes('posts'))
  assert.ok(names.length > 2, 'each ACM section kind gets a type of its own')
  for (const record of m.records) {
    assert.ok(names.includes(record.type), `record points at unknown type ${record.type}`)
    assert.ok(record.slug && record.locale, 'a record needs a slug and a locale')
  }
})

test('an image is referenced by file name and registered once, with who uses it', () => {
  const m = model()
  for (const item of m.media) {
    assert.ok(!item.file.includes('/'), `media must be a file name, got ${item.file}`)
    for (const user of item.usedBy) assert.match(user, /^[a-z0-9_]+\/[^#]+#[a-z0-9_]+$/)
  }
  const files = m.media.map((i) => i.file)
  assert.equal(new Set(files).size, files.length, 'an image is registered once, not once per use')
})

test('routes follow the pages the adapter resolved, not the raw paths in the database', () => {
  // The failure this pins down, met on a live Tracy Base: a renamed category (D2) leaves the menu
  // pointing at the NEW path while the menu table still stores the old one. Reading routes from
  // the database declares routes nothing links to, and every renamed entry then looks dangling.
  const m = model()
  const paths = new Set(m.routes.map((r) => r.path))
  const walk = (items) => {
    for (const item of items ?? []) {
      if (item.kind !== 'heading' && item.path.startsWith('/')) {
        assert.ok(paths.has(item.path.split('#')[0]), `${item.path} is linked but not declared`)
      }
      walk(item.children)
    }
  }
  for (const menu of m.menus) walk(menu.items)
})

test('every menu item points at a declared route, or is a group label with none', () => {
  const m = model()
  const paths = new Set(m.routes.map((r) => r.path))
  const walk = (items) => {
    for (const item of items ?? []) {
      if (item.kind === 'heading') assert.equal(item.path, '', 'a heading has no destination')
      else if (item.path.startsWith('/')) assert.ok(paths.has(item.path.split('#')[0]), `${item.path} is not a declared route`)
      walk(item.children)
    }
  }
  for (const menu of m.menus) walk(menu.items)
})
