/**
 * Measured 11/10/2026 on dev g64 (JA Essence, FULL, a bakery, Vietnamese; step64-measure): the text model ran out of credit
 * ("This request would exceed your available credits given your current in-flight requests"), and the build report claimed work
 * that was not done. Since 12/10/2026 the demo posts are translated, never rewritten (product owner, decision 1 after g65): the
 * report must still say plainly which lines of the blog keep the template's language, how many, and why; nothing is said to be
 * translated that was not.
 *
 * The model below is disobedient in the plainest way: it throws the credit error on every call.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { translateBlog } from '../src/sites/brief-engines/blog-translate.js'
import { translateLines } from '../src/sites/brief-engines/translate-lines.js'
import { planPosts } from '../src/sites/brief-engines/wp-posts.js'
import { runEssence } from './_joomla-essence-site.mjs'

const CREDIT = 'This request would exceed your available credits given your current in-flight requests'
const LOREM =
  'Its sometimes her behaviour are contented. Do listening am eagerness oh objection collected. Together gay feelings continue.'
const para = (/** @type {string} */ text) => `<!-- wp:paragraph -->\n<p>${text}</p>\n<!-- /wp:paragraph -->`
/** JA Essence WordPress's posts as the demo ships them: the excerpt is the first paragraph. */
const DEMO = [
  [115, 'Fitness Tips for a Healthy Lifestyle'],
  [100, 'Organic Geometry: Exploring Geometric Line Art']
].map(([id, title]) => ({
  id: Number(id),
  slug: `post-${id}`,
  title: String(title),
  status: 'publish',
  excerpt: LOREM,
  content: para(LOREM)
}))

/** A model out of credit: every call throws. */
const broke = async () => {
  throw new Error(CREDIT)
}

test('WP, out of credit: no post is written, and the report says the lines keep the template’s language and why', async () => {
  const notes = []
  const out = await planPosts({
    posts: DEMO,
    rewrite: true,
    language: 'vi',
    linesOf: (content) => [{ text: content.replace(/<[^>]*>/g, '').trim() }],
    translate: (lines, what) =>
      translateBlog({ lines, locale: 'vi', model: { chat: broke }, note: (x) => notes.push(x), what })
  })
  assert.equal(out.writes.length, 0)
  const said = notes.join(' | ')
  assert.ok(
    notes.some(
      (n) => /line\(s\) of the demo blog posts keep the template’s language/.test(n) && n.includes(CREDIT)
    ),
    said
  )
  assert.ok(!notes.some((n) => /were translated|translated one by one/.test(n)), said)
})

test('Joomla, out of credit: the report says the lines of the blog keep the template’s language and why, and claims no translation', async () => {
  const model = {
    calls: [],
    models: async () => ({ text: { usage: () => ({}), chat: broke } })
  }
  const { notes, written } = await runEssence({ model })
  const said = notes.join(' | ')
  assert.ok(
    notes.some(
      (n) => /line\(s\) of the demo blog articles keep the template’s language/.test(n) && n.includes(CREDIT)
    ),
    said
  )
  assert.ok(
    !notes.some((n) => /of the demo blog articles were translated|translated one by one/.test(n)),
    said
  )
  assert.ok(!Object.keys(written).some((key) => key.startsWith('article-')), 'no article line is written')
})

test('g64 translateLines, out of credit: no line is said to be translated, and the reason is the credit error', async () => {
  const notes = []
  const lines = Array.from({ length: 5 }, (_, i) => ({
    key: `k${i}`,
    type: 'text',
    sample: `Line number ${i} of the demo`,
    maxCharacters: 80
  }))
  const out = await translateLines({
    lines,
    locale: 'vi',
    shipped: new Map(),
    model: { chat: broke },
    note: (x) => notes.push(x),
    what: 'test lines',
    batch: 2
  })
  assert.deepEqual(out, {})
  const said = notes.join(' | ')
  assert.ok(!notes.some((n) => /were translated/.test(n)), said)
  assert.ok(
    notes.some((n) => /5 line\(s\) of test lines keep the template’s language/.test(n) && n.includes(CREDIT)),
    said
  )
})
