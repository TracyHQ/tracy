/**
 * The seeder's two model turns, prompt and parser sides: posts and section copy. The model is
 * never called here; answers are strings.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildPostsPrompt,
  buildSectionsPrompt,
  hasWords,
  parsePosts,
  parseSectionsCopy,
  slugify,
  wordsBrief
} from '../src/host/seed-copy.mjs'

const WORDS = {
  about:
    'Claude Studio builds websites for small teams in Hanoi. We ship in a week and hold every change for review.',
  site: {
    name: 'Claude Studio',
    headline: 'Websites in a week',
    sub: 'Held for review.',
    nav: ['Work', 'Pricing']
  },
  extracts: ['From the old site: founded 2024, four people.'],
  lang: 'en'
}

const post = (i) => ({
  title: `Post ${i}`,
  slug: `post-${i}`,
  excerpt: `Excerpt ${i}.`,
  paragraphs: ['one one one', 'two two two', 'three three three'],
  imagePrompt: `Scene ${i}`
})

test('wordsBrief gathers site, brief and extracts; hasWords needs something to write from', () => {
  const b = wordsBrief(WORDS)
  assert.match(b, /Site: Claude Studio/)
  assert.match(b, /Navigation: Work · Pricing/)
  assert.match(b, /founded 2024/)
  assert.equal(hasWords(WORDS), true)
  assert.equal(hasWords({ about: 'hi' }), false)
  assert.ok(wordsBrief({ about: 'x'.repeat(9000) }).length < 6100)
})

test('buildPostsPrompt clamps the count to 5–7 and names the language when it is not English', () => {
  const m = buildPostsPrompt({ words: { ...WORDS, lang: 'vi' }, count: 12 })
  assert.equal(m[0].role, 'system')
  assert.match(m[1].content, /Write 7 blog posts/)
  assert.match(m[1].content, /code "vi"/)
  assert.match(buildPostsPrompt({ words: WORDS, count: 1 })[1].content, /Write 5 blog posts/)
  assert.match(
    buildPostsPrompt({ words: WORDS, withImages: true })[1].content,
    /generate one cover image per post/
  )
})

test('parsePosts: a fenced JSON array with prose around it, duplicate slugs made unique, fields trimmed', () => {
  const list = [1, 2, 3, 4, 5].map(post)
  list[1].slug = 'post-1'
  list[2].slug = ''
  list[2].title = 'Hành trình của chúng tôi'
  const r = parsePosts(`Here you go:\n\`\`\`json\n${JSON.stringify(list)}\n\`\`\`\nDone.`)
  assert.equal(r.ok, true)
  assert.equal(r.posts.length, 5)
  assert.deepEqual(
    r.posts.map((p) => p.slug),
    ['post-1', 'post-1-2', 'hanh-trinh-cua-chung-toi', 'post-4', 'post-5']
  )
})

test('parsePosts refuses too few usable posts and non-JSON', () => {
  assert.equal(parsePosts('no json here').ok, false)
  const r = parsePosts(JSON.stringify([post(1), post(2), { title: 'x', paragraphs: ['only one'] }]))
  assert.equal(r.ok, false)
  assert.match(r.error, /2 usable posts/)
  assert.equal(parsePosts(JSON.stringify({ posts: [1, 2, 3, 4, 5, 6, 7, 8].map(post) })).posts.length, 7)
})

test('slugify: ascii, hyphens, no accents, capped', () => {
  assert.equal(slugify('Một ngày ở Đà Lạt!'), 'mot-ngay-o-a-lat')
  assert.equal(slugify('  Hello   World '), 'hello-world')
  assert.equal(slugify('x'.repeat(80)).length, 60)
})

const SECTIONS = {
  hero: [
    { id: 'p.0', role: 'eyebrow', words: 4, chars: 24, text: 'AI workstation for websites' },
    { id: 'h1.0', role: 'headline', words: 7, chars: 34, text: 'One desk for every site you run' },
    {
      id: 'p.1',
      role: 'paragraph',
      words: 20,
      chars: 120,
      text: 'Tracy pairs an AI agent with each of your sites, armed with skills for WordPress, Joomla and Shopify.'
    }
  ],
  faq: [{ id: 'h3.0', role: 'title', words: 4, chars: 20, text: 'Is my site safe?' }]
}

test('buildSectionsPrompt lists every slot with its limits and sample', () => {
  const m = buildSectionsPrompt({ words: WORDS, sections: SECTIONS })
  assert.match(m[1].content, /## hero/)
  assert.match(m[1].content, /- h1\.0 \(headline, 5–9 words\): "One desk for every site you run"/)
  assert.match(m[1].content, /- p\.1 \(paragraph, 90–150 chars\)/)
  assert.match(m[1].content, /## faq/)
})

test('parseSectionsCopy clamps to the slot and reports what the model skipped; too little is refused', () => {
  const answer = JSON.stringify({
    hero: {
      'p.0': 'Websites for small teams',
      'h1.0': 'A site in a week, every change held for review by you and your team forever',
      'p.1':
        'Claude Studio builds and runs websites for small teams in Hanoi, shipping in a week and holding every change for review.'
    },
    faq: { 'h3.0': 'Is it safe?' }
  })
  const r = parseSectionsCopy(answer, SECTIONS)
  assert.equal(r.ok, true)
  assert.equal(r.copy.hero['h1.0'].split(' ').length, 9)
  assert.ok(r.copy.hero['p.1'].length <= 150)
  assert.deepEqual(r.missing, [])
  const partial = parseSectionsCopy(JSON.stringify({ hero: { 'p.0': 'x' } }), SECTIONS)
  assert.equal(partial.ok, false)
  assert.equal(parseSectionsCopy('[]', SECTIONS).ok, false)
})
