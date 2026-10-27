/**
 * The demo blog posts of a WordPress template on a FULL site: translated where they stand, never rewritten (product owner,
 * decision 1 after the g65 builds, 12/10/2026), every picture, link, slug and category kept; and the categories and tags of the
 * posts found for the site's language. The post below is the one JA Essence WordPress 1.0.10 stores (id 98).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { loremIn } from '../src/sites/brief-engines/blog-translate.js'
import { staticLines } from '../src/sites/brief-engines/wp-leaves.js'
import { findTerms, planPosts } from '../src/sites/brief-engines/wp-posts.js'

const BODY = readFileSync(
  path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'ja-essence-wp7-1.0.10-post.html'),
  'utf8'
)
const FIRST =
  'Its sometimes her behaviour are contented. Do listening am eagerness oh objection collected. Together gay feelings continue juvenile had off one. Unknown may service subject her letters one bed. Child years noise ye in forty. Loud in this in both hold. My entrance me is disposal bachelor remember relation.'

const post = (/** @type {number} */ id, /** @type {string} */ title, content = BODY) => ({
  id,
  slug: `post-${id}`,
  title,
  status: 'publish',
  excerpt: FIRST,
  content
})
const linesOf = (/** @type {string} */ content) => staticLines(content, { slotted: () => 1 })
/** A translator that says every line again in brackets, and keeps what it was asked. */
function translator(skip = new Set()) {
  /** @type {string[]} */
  const asked = []
  return {
    asked,
    translate: async (/** @type {Array<{ key: string, sample: string }>} */ lines) => {
      asked.push(...lines.map((l) => l.sample))
      return Object.fromEntries(
        lines.filter((l) => !skip.has(l.sample)).map((l) => [l.key, `[vi] ${l.sample}`])
      )
    }
  }
}

test('FULL, another language: a post takes its translated title, excerpt and lines where they stand; pictures, blocks and slug stay', async () => {
  const words = translator()
  const out = await planPosts({
    posts: [post(98, 'Drawing with Elegance'), post(109, 'Drawing with Elegance')],
    rewrite: true,
    language: 'vi',
    linesOf,
    translate: words.translate
  })
  assert.equal(out.writes.length, 2)
  for (const write of out.writes) {
    assert.equal(
      write.fields.post_title,
      '[vi] Drawing with Elegance',
      'a copy keeps the demo’s one title, translated'
    )
    assert.equal(write.fields.post_excerpt, `[vi] ${FIRST}`)
    assert.ok(write.fields.post_content.includes(`<p>[vi] ${FIRST}</p>`))
    for (const kept of ['/wp-content/uploads/2026/10/item-2-7.jpg', '<!-- wp:more -->'])
      assert.ok(write.fields.post_content.includes(kept), kept)
    assert.equal('post_name' in write.fields, false)
  }
  assert.ok(out.lines < words.asked.length, 'the lines are counted once per distinct text')
})

test('a line with no translation keeps its words, and a post nothing was translated for is not written', async () => {
  const words = translator(new Set(['Me unpleasing impossible', 'Untouched']))
  const out = await planPosts({
    posts: [
      post(1, 'Untouched', '<!-- wp:paragraph -->\n<p>Me unpleasing impossible</p>\n<!-- /wp:paragraph -->'),
      post(2, 'Kept')
    ],
    rewrite: true,
    language: 'vi',
    linesOf,
    translate: async (lines) => {
      const all = await words.translate(lines)
      // The first post's excerpt has no answer either: it keeps its words, like the rest of it.
      delete all['1#excerpt']
      return all
    }
  })
  assert.deepEqual(
    out.writes.map((w) => w.id),
    [2]
  )
  assert.ok(
    out.writes[0].fields.post_content.includes('Me unpleasing impossible'),
    'a line with no answer stays'
  )
})

test('BLANK, or a site in the template’s language: no post is planned and nothing is asked', async () => {
  for (const [rewrite, language] of [
    [false, 'vi'],
    [true, null]
  ]) {
    const words = translator()
    const out = await planPosts({
      posts: [post(1, 'A')],
      rewrite: /** @type {boolean} */ (rewrite),
      language: /** @type {string | null} */ (language),
      linesOf,
      translate: words.translate
    })
    assert.deepEqual(out, { writes: [], lines: 0 })
    assert.deepEqual(words.asked, [])
  }
})

test('Latin filler is told from English filler: lorem stays, the demo’s English-looking lines are translated', () => {
  assert.equal(loremIn('Lorem ipsum dolor sit amet, consectetur adipiscing elit.'), true)
  assert.equal(loremIn(FIRST), false)
  assert.equal(loremIn('Sit down and enjoy the bread.'), false)
})

test('the categories and tags of the posts are found by their slug, a window of ids at a time, and the search stops once all are found', async () => {
  const terms = {
    category: { 5: { name: 'Health', slug: 'blog-health' }, 6: { name: 'Design', slug: 'blog-design' } },
    post_tag: { 11: { name: 'Health', slug: 'health' }, 41: { name: 'Far away', slug: 'far' } }
  }
  const asked = []
  const read = async (action, params) => {
    assert.equal(action, 'content.get')
    asked.push(`${params.key}:${params.id}`)
    const term = terms[params.key]?.[params.id]
    return term ? { ok: true, item: term } : { ok: false, error: 'not_found' }
  }
  const found = await findTerms(
    read,
    new Map([
      ['category', new Set(['blog-health', 'blog-design'])],
      ['post_tag', new Set(['health'])]
    ]),
    { step: 10, most: 100 }
  )
  assert.deepEqual(found.map((t) => [t.taxonomy, t.id, t.name]).sort(), [
    ['category', 5, 'Health'],
    ['category', 6, 'Design'],
    ['post_tag', 11, 'Health']
  ])
  assert.ok(
    asked.every((a) => Number(a.split(':')[1]) <= 20),
    'no window past the one that found the last'
  )
  assert.equal(
    asked.filter((a) => a.startsWith('category:') && Number(a.split(':')[1]) > 10).length,
    0,
    'a taxonomy found whole stops'
  )
})
