#!/usr/bin/env node
// P1 outputs that are DATA (routes.json, assets.json) from what the two ingest steps already wrote.
//   node ingest/build-inventory.mjs <seed/site-model.json> <source-snapshot dir> <page-map.json> <out dir>
// routes.json : every route of the model, the source URL that answers it (from the crawl), the page record
//               and the sections the source puts on it (page-map.json of the spec-pack).
// assets.json : every image/font the crawl saved, with sha256, and every image path a model record cites
//               (and whether the file exists in the snapshot).
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [modelFile, snapDir, pageMapFile, outDir] = process.argv.slice(2)
if (!outDir) {
  console.error('usage: build-inventory.mjs <site-model.json> <snapshot dir> <page-map.json> <out dir>')
  process.exit(2)
}
mkdirSync(outDir, { recursive: true })
const model = JSON.parse(readFileSync(modelFile, 'utf8'))
const crawl = JSON.parse(readFileSync(path.join(snapDir, 'crawl.json'), 'utf8'))
const pageMap = JSON.parse(readFileSync(pageMapFile, 'utf8'))
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex')

// source URL of a route: the crawl keeps what the running site answered, by path
const crawled = (crawl.pages ?? []).map((p) => (typeof p === 'string' ? p : (p.url ?? p.path ?? '')))
const sourcePath = (u) => u.replace(/^https?:\/\/[^/]+/, '').replace(/^\/index\.php/, '') || '/'
const bySource = new Map(crawled.map((u) => [sourcePath(u), u.replace(/^https?:\/\/[^/]+/, '')]))
const mapByPath = new Map((pageMap.pages ?? []).map((p) => [p.path, p]))

const records = new Map(model.records.map((r) => [`${r.type}/${r.slug}`, r]))
const routes = model.routes.map((r) => {
  // detail routes: Joomla keeps the category id and the article id in the address (/blog/8-cat/2-slug)
  const tail = r.slug ? [...bySource.values()].find((u) => u.replace(/^.*\/\d+-/, '') === r.slug) : null
  const sourceUrl = bySource.get(r.path) ?? tail ?? null
  const map = mapByPath.get(r.path)
  const slug = r.slug ?? (r.path === '/' ? 'home' : r.path.split('/').filter(Boolean).pop())
  const type = r.type ?? 'pages'
  return {
    path: r.path,
    kind: r.kind,
    cms: { collection: type, slug, found: records.has(`${type}/${slug}`) || r.kind === 'list' },
    source: {
      url: sourceUrl,
      joomla: map?.source ?? null,
      view: map?.view ?? null,
      sections: map?.sections ?? null
    },
    expected: { status: 200 }
  }
})
routes.push({
  path: '/404',
  kind: 'system',
  cms: { collection: null, slug: null, found: false },
  source: { url: '/index.php/nope-404', joomla: null, view: 'error', sections: null },
  expected: { status: 404 }
})
writeFileSync(
  path.join(outDir, 'routes.json'),
  JSON.stringify(
    {
      note: 'path = the route the EmDash site serves (site-model routes). source.url = what the running Joomla answers for it, when the crawl met it; the model drops the article id and the category segment Joomla keeps, so many detail routes have no equal path on the source.',
      unknownRouteBehaviour: { status: 404, chrome: true, view: 'NotFound' },
      routes
    },
    null,
    2
  ) + '\n'
)

const files = []
for (const a of crawl.assets ?? []) {
  const rel = typeof a === 'string' ? a : (a.path ?? a.file ?? a.url)
  if (!rel) continue
  const local = path.join(snapDir, rel.replace(/^https?:\/\/[^/]+/, ''))
  if (existsSync(local)) files.push({ path: rel.replace(/^https?:\/\/[^/]+/, ''), sha256: sha(local) })
}
const cited = new Map()
const walk = (v, where) => {
  if (typeof v === 'string') {
    for (const m of v.matchAll(/(?:images|templates)\/[A-Za-z0-9_/.\- ]+\.(?:jpe?g|png|gif|svg|webp)/g)) {
      const k = m[0]
      cited.set(k, [...(cited.get(k) ?? []), where])
    }
  } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${where}.${k}`)
}
for (const r of model.records) walk(r.values, `${r.type}/${r.slug}`)
const cites = [...cited].map(([file, usedBy]) => ({
  file,
  usedBy: [...new Set(usedBy)].slice(0, 6),
  inSnapshot: existsSync(path.join(snapDir, file))
}))
writeFileSync(
  path.join(outDir, 'assets.json'),
  JSON.stringify({ crawled: files.length, files, citedByContent: cites }, null, 2) + '\n'
)
const missing = cites.filter((c) => !c.inSnapshot).length
console.log(
  `build-inventory: ${routes.length} routes, ${files.length} crawled assets, ${cites.length} cited images (${missing} not in the crawl)`
)
