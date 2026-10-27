import assert from 'node:assert/strict'
import { test } from 'node:test'
import { translationSource, translatePlan } from '../src/translate-plan.mjs'

const plan = {
  pages: [
    {
      slug: 'contact',
      title: 'Visit',
      body: '<h1 class="hero">Hello</h1><a href="/contact">Visit</a><img src="/logo.png" alt="Logo"><script>const english = 1</script>'
    }
  ],
  menu: [{ slug: 'contact', label: 'Visit' }],
  posts: [{ slug: 'first', title: 'News', excerpt: 'Latest', paragraphs: ['Welcome'] }]
}

test('translation covers visible page copy, labels and posts while retaining markup and identifiers', () => {
  const source = translationSource(plan)
  assert(!source.slots.includes('const english = 1'))
  const translated = source.apply(source.slots.map((slot) => `FR: ${slot}`))
  assert.equal(translated.pages[0].slug, 'contact')
  assert.match(translated.pages[0].body, /class="hero"/)
  assert.match(translated.pages[0].body, /href="\/contact"/)
  assert.match(translated.pages[0].body, /const english = 1/)
  assert.equal(translated.posts[0].paragraphs[0], 'FR: Welcome')
  assert.equal(plan.pages[0].title, 'Visit')
  assert.throws(() => source.apply(['truncated']), /incomplete/)
})

test('a saved complete translation avoids another model turn; partial responses never save', async () => {
  const cache = new Map()
  let calls = 0
  const deps = {
    plan,
    language: 'fr',
    door: { textModel: 'test' },
    chat: async (_, req) => {
      calls++
      return { text: JSON.stringify(JSON.parse(req.messages[1].content).map((s) => `FR: ${s}`)) }
    },
    read: (key) => cache.get(key),
    save: (key, values) => cache.set(key, values)
  }
  const first = await translatePlan(deps)
  assert.deepEqual(await translatePlan(deps), first)
  assert.equal(calls, 1)
  cache.clear()
  await assert.rejects(
    () => translatePlan({ ...deps, chat: async () => ({ text: '["missing"]' }) }),
    /Incomplete/
  )
  assert.equal(cache.size, 0)
})
