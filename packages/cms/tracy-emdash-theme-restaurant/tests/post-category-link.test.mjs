// The category label in a post's meta line links only to a list page that exists: the lists are the BLOG_SIDEBAR
// categories (`src/pages/[...path].astro`), so Chefs (category `pages`) printed a link to `/pages`, a 404 that the content
// coverage audit measured on 1.0.1. The view is held at the source (it imports EmDash); the seed says which articles exist.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8')
// posts.ts imports EmDash: its list is read from the source text
const BLOG_SIDEBAR = [
  ...(/export const BLOG_SIDEBAR = \[([^\]]*)\]/.exec(read('src/lib/posts.ts'))?.[1] ?? '').matchAll(
    /'([^']+)'/g
  )
].map((m) => m[1])

test('the post view links its category only when the category has a live list page', () => {
  const view = read('src/views/Post.astro')
  assert.match(view, /import \{[^}]*\bliveLinks\b[^}]*\} from '@\/lib\/link-gate'/)
  assert.match(view, /BLOG_SIDEBAR\.includes\(terms\[0\]\.slug\) && termLive/)
  assert.match(view, /liveLinks\(Astro\.request, locale, \[`\/\$\{terms\[0\]\.slug\}`\]\)/)
  assert.match(view, /termLink \? <a href=\{href\(locale, `\/\$\{terms\[0\]\.slug\}`\)\}>/)
  // the unlinked label is bare text: a span would take the `.rs-meta span` separator margin
  assert.doesNotMatch(
    view,
    /<a href=\{href\(locale, `\/\$\{terms\[0\]\.slug\}`\)\}>\{terms\[0\]\.label\}<\/a>\}/
  )
})

test('the list route answers exactly the categories the post view links', () => {
  assert.match(read('src/pages/[...path].astro'), /segs\.length === 1 && BLOG_SIDEBAR\.includes\(segs\[0\]\)/)
})

test('every blog article keeps its category link and Chefs prints plain text', () => {
  const posts = JSON.parse(read('seed/seed.json')).content.posts
  const first = (p) => p.taxonomies?.category?.[0]
  const chefs = posts.find((p) => p.slug === 'chefs')
  assert.equal(first(chefs), 'pages')
  assert.equal(BLOG_SIDEBAR.length, 4)
  assert.ok(!BLOG_SIDEBAR.includes('pages'))
  const blog = posts.filter((p) => BLOG_SIDEBAR.includes(first(p)))
  assert.equal(blog.length, 13)
})
