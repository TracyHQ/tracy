// A rule of seed/personalize.json that names a collection, entry or field the seed does not have writes nothing and says
// nothing: the dark logo pointed at `site/site` (this seed has `chrome/chrome`) and `--logo-dark-file` changed no page.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const json = (file) => JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'))
const seed = json('seed/seed.json')
const map = json('seed/personalize.json')
const entry = (collection, slug) => (seed.content[collection] ?? []).find((e) => e.slug === slug)

test('every rule names a collection and an entry the seed has', () => {
  const bad = []
  for (const kind of ['identity', 'copy', 'blocks', 'facts', 'rewrite', 'labels', 'hide'])
    for (const r of map[kind] ?? []) {
      if (!r.collection) continue
      if (!seed.content[r.collection]) bad.push(`${kind}: collection ${r.collection}`)
      else if (r.slug && !entry(r.collection, r.slug)) bad.push(`${kind}: ${r.collection}/${r.slug}`)
      for (const slug of r.slugs ?? [])
        if (!entry(r.collection, slug)) bad.push(`${kind}: ${r.collection}/${slug}`)
    }
  assert.deepEqual(bad, [])
})

test('the dark logo is written to the entry and field the header reads', () => {
  const { collection, slug, field } = map.brand.logoDark
  assert.ok(entry(collection, slug), `${collection}/${slug} is in the seed`)
  const schema = seed.collections.find((c) => c.slug === collection)
  assert.ok(
    schema.fields.some((f) => f.slug === field && f.type === 'image'),
    `${field} is an image field of ${collection}`
  )
  const header = readFileSync(path.join(ROOT, 'src/components/site/Header.astro'), 'utf8')
  assert.match(header, /brandLogos\(settings, site\.logo_dark, site\.brand_name\)/)
  const chrome = readFileSync(path.join(ROOT, 'src/lib/chrome.ts'), 'utf8')
  assert.match(
    chrome,
    new RegExp(`getEmDashEntry\\('${collection}', '${slug}'`),
    'the chrome the header reads'
  )
})
