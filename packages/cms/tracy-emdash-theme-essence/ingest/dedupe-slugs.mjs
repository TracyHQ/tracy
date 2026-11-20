#!/usr/bin/env node
// The Joomla demo repeats one article alias in several categories (same title and text, another picture
// and category: 27 aliases for 46 posts), because each Joomla category layout needs articles to show. EmDash
// slugs are unique per collection, so every repeated alias gets its category appended (DECISIONS D10).
//   node ingest/dedupe-slugs.mjs <seed/site-model.json>
import { readFileSync, writeFileSync } from 'node:fs'

/** Makes post slugs unique in place; returns how many were renamed. */
export function dedupeSlugs(model) {
  const posts = model.records.filter((r) => r.type === 'posts')
  const count = new Map()
  for (const r of posts) count.set(r.slug, (count.get(r.slug) ?? 0) + 1)
  let renamed = 0
  const renames = new Map()
  for (const r of posts) {
    if (count.get(r.slug) < 2) continue
    const cat = (r.terms?.category ?? [])[0]
    if (!cat) throw new Error(`post ${r.slug} repeats with no category to tell it apart`)
    const next = `${r.slug}-${cat}`
    renames.set(r.slug, [...(renames.get(r.slug) ?? []), next])
    r.slug = next
    renamed++
  }
  // A media row names its users by slug; a repeated alias stands for every post that took it.
  for (const m of model.media ?? []) {
    m.usedBy = [
      ...new Set(
        m.usedBy.flatMap((u) => {
          const [, slug, field] = u.match(/^posts\/([^#]+)(#.*)?$/) ?? []
          return slug && renames.has(slug) ? renames.get(slug).map((n) => `posts/${n}${field ?? ''}`) : [u]
        })
      )
    ]
  }
  const seen = new Set()
  for (const r of posts) {
    if (seen.has(r.slug)) throw new Error(`slug still repeats: ${r.slug}`)
    seen.add(r.slug)
  }
  return renamed
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: dedupe-slugs.mjs <site-model.json>')
    process.exit(2)
  }
  const model = JSON.parse(readFileSync(file, 'utf8'))
  const n = dedupeSlugs(model)
  writeFileSync(file, `${JSON.stringify(model, null, 2)}\n`)
  console.log(`dedupe-slugs: ${n} of ${model.records.filter((r) => r.type === 'posts').length} posts renamed`)
}
