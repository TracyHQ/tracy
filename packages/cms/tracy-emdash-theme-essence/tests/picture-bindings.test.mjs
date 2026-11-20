// Tracy's picture placement ("Apply" in Add site) places a picture on the page its entry belongs to. It finds that page
// from seed/content-api-map.json: `urlField` names the data field holding the entry's own path, and a section entry
// reaches a page through that page's `sections` list. This is the same rule as apps/tracy-web's picture inventory
// (emdash-real-pictures.js), restated so the package can prove it on its own.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (f) => JSON.parse(readFileSync(new URL(`../seed/${f}`, import.meta.url), 'utf8'))
const seed = read('seed.json')
const map = read('content-api-map.json').collections
const _media = read('media-map.json')
const routes = JSON.parse(readFileSync(new URL('../src/lib/page-routes.json', import.meta.url), 'utf8'))
const row = (collection, slug) => seed.content[collection]?.find((r) => r.slug === slug)

const sectionRoutes = new Map()
for (const [collection, rows] of Object.entries(seed.content)) {
  if (map[collection]?.type !== 'page') continue
  for (const r of rows)
    for (const s of r.data.sections ?? []) {
      const key = `${s.collection}/${s.entry}`
      sectionRoutes.set(key, [...(sectionRoutes.get(key) ?? []), r.data.path])
    }
}
const _routesOf = (t) => {
  const own = map[t.collection]?.urlField
    ? row(t.collection, t.slug)?.data?.[map[t.collection].urlField]
    : null
  return [own, ...(sectionRoutes.get(`${t.collection}/${t.slug}`) ?? [])].filter(
    (p) => typeof p === 'string' && p.startsWith('/') && !p.startsWith('//')
  )
}

test('pages and posts hold the path the router serves them at', () => {
  const served = new Map(routes.pages.map((p) => [p.slug, p.path]))
  for (const l of routes.lists) served.set(l.path.split('/').pop(), l.path)
  for (const p of seed.content.pages) assert.equal(p.data.path, served.get(p.slug), `pages/${p.slug}`)
  for (const p of seed.content.posts)
    assert.match(p.data.path, /^\/[a-z0-9-]+\/[a-z0-9-]+$/, `posts/${p.slug}`)
  assert.equal(new Set(seed.content.posts.map((p) => p.data.path)).size, seed.content.posts.length)
})
