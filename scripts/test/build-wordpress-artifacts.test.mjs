/**
 * The two WordPress generators behind the `wordpress-editions` and `wordpress-demo-trim` gates,
 * on a small inventory and on a tampered copy of the real tree.
 *
 *   node --test scripts/test/build-wordpress-artifacts.test.mjs
 *
 * What is guarded: an edition whose page lacks a mapped block is REPORTED (`missing`), never
 * dropped; a demo post a navigation opens is kept; a page is never hidden; and `--check` goes red
 * when the committed file was edited by hand (baseHash, a missing edition, a row outside the
 * inventory) — the negative fixtures the plan asks for.
 */
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildEditions, tagOf } from '../build-wordpress-editions.mjs'
import { buildDemoTrim } from '../build-wordpress-demo-trim.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const REAL = path.join(ROOT, 'packages/cms/tracy-wordpress-quickstart/contracts')

const contentMap = {
  entities: [
    { key: 'page-home', kind: 'page', identity: { postType: 'page', slug: 'home', language: 'en' } },
    { key: 'option-blogname', kind: 'option', identity: { name: 'blogname' } }
  ],
  slots: [
    { key: 'home.hero.h', entity: 'page-home', target: { block: 'hero.h', attr: 'content' } },
    { key: 'home.hero.p', entity: 'page-home', target: { block: 'hero.p', attr: 'content' } },
    { key: 'site.name', entity: 'option-blogname', target: { option: 'blogname' } }
  ]
}
const inventory = {
  contract: 'x/wp7/1.0.0',
  source: { language: 'en', locale: 'en_US' },
  languages: [
    { slug: 'en', locale: 'en_US' },
    { slug: 'de', locale: 'de_DE' },
    { slug: 'ru', locale: 'ru_RU' }
  ],
  posts: [
    {
      id: 1,
      type: 'page',
      status: 'publish',
      slug: 'home',
      language: 'en',
      group: 'g1',
      blocks: ['hero.h', 'hero.p'],
      entity: 'page-home'
    },
    {
      id: 2,
      type: 'page',
      status: 'publish',
      slug: 'home',
      language: 'de',
      group: 'g1',
      blocks: ['hero.h', 'hero.p']
    },
    { id: 3, type: 'page', status: 'publish', slug: 'home', language: 'ru', group: 'g1', blocks: ['hero.h'] },
    { id: 10, type: 'post', status: 'publish', slug: 'news-1', language: 'en', group: null, blocks: [] },
    { id: 11, type: 'post', status: 'publish', slug: 'news-2', language: 'en', group: null, blocks: [] },
    { id: 12, type: 'post', status: 'draft', slug: 'news-3', language: 'en', group: null, blocks: [] }
  ],
  translations: { g1: { en: 1, de: 2, ru: 3 } },
  openedBy: { 1: [68], 11: [68] }
}

test('editions: every shipped language gets the id of its copy; a missing block is listed, not skipped', () => {
  const { editions, problems } = buildEditions(inventory, contentMap, 'base')
  assert.deepEqual(problems, [])
  assert.equal(Object.keys(editions.locales).length, 3)
  assert.equal(editions.locales.de.ids['page-home'], 2)
  assert.equal(editions.locales.en.ids['page-home'], 1)
  assert.deepEqual(editions.locales.de.missing, [])
  assert.deepEqual(editions.locales.ru.missing, ['page-home:hero.p'])
  assert.equal(tagOf('de_DE'), 'de-de')
  assert.equal(editions.source.tag, 'en-us')
})

test('editions: a translation pointing at a post of another language is a problem, not a mapping', () => {
  const broken = { ...inventory, translations: { g1: { en: 1, de: 3, ru: 2 } } }
  const { problems } = buildEditions(broken, contentMap, 'base')
  assert.ok(problems.some((p) => p.includes('edition de points at post 3')))
})

test('demo trim: only a published post nobody opens is hidden; pages and opened posts are kept with a reason', () => {
  const { map, problems } = buildDemoTrim(inventory, contentMap, 'base', {})
  assert.deepEqual(problems, [])
  assert.deepEqual(
    map.hide.map((h) => h.id),
    [10]
  )
  assert.deepEqual(map.hide[0], {
    key: 'post-10',
    kind: 'post',
    id: 10,
    field: 'post_status',
    from: 'publish',
    to: 'draft',
    language: 'en',
    reason: 'demo article no navigation opens'
  })
  const kept = Object.fromEntries(map.kept.map((k) => [k.id, k.reason]))
  assert.match(kept[1], /contract maps it/)
  assert.match(kept[2], /page/)
  assert.match(kept[11], /navigation 68 opens it/)
  assert.match(kept[12], /already draft/)
})

test('demo trim: a site without Polylang gives every hidden row the source language, never null (Cowork refuses a row without one)', () => {
  const oneLanguage = {
    ...inventory,
    source: { language: 'en', locale: 'en_US' },
    languages: [],
    posts: inventory.posts.map((p) => ({ ...p, language: null }))
  }
  const { map, problems } = buildDemoTrim(oneLanguage, contentMap, 'base', {})
  assert.deepEqual(problems, [])
  assert.ok(map.hide.length > 0)
  for (const row of map.hide) assert.equal(row.language, 'en', `${row.key} has language ${row.language}`)
  // kept rows are a report: they keep the inventory's value
  for (const row of map.kept) assert.equal(row.language, null)
  assert.equal(map.counts.languages, 1)
  // no source recorded: the plugin's own fallback
  const bare = buildDemoTrim({ ...oneLanguage, source: undefined }, contentMap, 'base', {}).map
  for (const row of bare.hide) assert.match(row.language, /^[a-z]{2,3}(-[a-z]{2,4})?$/)
})

function checkOn(tree, script) {
  return spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), '--check'], {
    env: { ...process.env, TRACY_WP_CONTRACTS: tree },
    encoding: 'utf8'
  })
}

test('--check is green on the committed tree and red on a hand-edited copy', () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'wp-contracts-'))
  try {
    cpSync(REAL, tmp, { recursive: true })
    for (const s of ['build-wordpress-editions.mjs', 'build-wordpress-demo-trim.mjs']) {
      const ok = checkOn(tmp, s)
      assert.equal(ok.status, 0, `${s} on the committed tree: ${ok.stderr}`)
    }
    const dir = path.join(tmp, 'tracy-business/wp7/1.1.0')
    // baseHash tampered → red
    const trim = JSON.parse(readFileSync(path.join(dir, 'demo-trim-map.json'), 'utf8'))
    writeFileSync(
      path.join(dir, 'demo-trim-map.json'),
      JSON.stringify({ ...trim, baseHash: '0'.repeat(64) }, null, 2) + '\n'
    )
    assert.equal(checkOn(tmp, 'build-wordpress-demo-trim.mjs').status, 1)
    // a row outside the inventory → red
    writeFileSync(
      path.join(dir, 'demo-trim-map.json'),
      JSON.stringify(
        { ...trim, hide: [...trim.hide, { ...trim.hide[0], key: 'post-999999', id: 999999 }] },
        null,
        2
      ) + '\n'
    )
    assert.equal(checkOn(tmp, 'build-wordpress-demo-trim.mjs').status, 1)
    // a missing edition → red
    const editions = JSON.parse(readFileSync(path.join(dir, 'editions.json'), 'utf8'))
    delete editions.locales.de
    writeFileSync(path.join(dir, 'editions.json'), JSON.stringify(editions, null, 2) + '\n')
    assert.equal(checkOn(tmp, 'build-wordpress-editions.mjs').status, 1)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})
