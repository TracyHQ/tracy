/**
 * The WordPress blog a JA template builds as an ordinary page with a post-list block (ja-vega, stand wobrief 19/10/2026):
 * the posts it lists take the restaurant's posts like the posts page's do — unless the block narrows them (a category,
 * an author, another order), which is left to the agent.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { writeWoPosts } from '../src/sites/brief-engines/wp-wo-content.js'

const ITEMS = [{ id: 'i1', title: 'Eggs Benedict', body: 'Poached eggs.' }]
const read = {
  buildId: 'b1',
  items: ITEMS,
  writes: {},
  pagePlan: { pages: [{ id: 'blog', role: 'blog', keep: true, fill: 'sourced', items: ['i1'] }] }
}

function fakeSite(blogContent) {
  const posts = [
    {
      id: 7,
      post_title: 'Demo old',
      post_status: 'publish',
      status: 'publish',
      created: '2024-01-01',
      categories: ['news']
    },
    {
      id: 9,
      post_title: 'Demo new',
      post_status: 'publish',
      status: 'publish',
      created: '2024-05-01',
      categories: ['news']
    },
    {
      id: 11,
      post_title: 'Other trade',
      post_status: 'publish',
      status: 'publish',
      created: '2024-06-01',
      categories: ['case-studies']
    }
  ]
  const site = {
    posts,
    updates: [],
    async call(action, params) {
      if (action === 'content.get' && params.kind === 'term')
        return params.id === 3
          ? { ok: true, item: { id: 3, slug: 'news', taxonomy: 'category' } }
          : { ok: false, error: 'not_found' }
      if (action === 'content.get' && params.kind === 'option')
        return { ok: true, item: { value: params.key === 'page_for_posts' ? 0 : [] } }
      if (action === 'content.list' && params.post_type === 'page')
        return {
          ok: true,
          items:
            (params.offset ?? 0) > 0
              ? []
              : [{ id: 3, slug: 'blog', url: 'http://x/blog/', status: 'publish', content: blogContent }]
        }
      if (action === 'content.list' && params.post_type === 'post')
        return { ok: true, items: (params.offset ?? 0) > 0 ? [] : posts }
      if (action === 'content.get' && params.kind === 'post')
        return { ok: true, item: { ...posts.find((p) => p.id === params.id) } }
      if (action === 'content.update' && params.kind === 'post') {
        Object.assign(
          posts.find((p) => p.id === params.id),
          params.fields
        )
        site.updates.push(params)
        return { ok: true }
      }
      return { ok: false, error: `unknown ${action} ${params.kind}` }
    }
  }
  return site
}
const store = () => ({ recordBefore: async (_b, _k, f) => f, recordWrite: async () => {} })

test('a blog page holding a plain post-list block: its newest posts take the restaurant’s, the rest are drafted', async () => {
  const site = fakeSite(
    '<!-- wp:heading --><h2>News</h2><!-- /wp:heading -->\n<!-- wp:query {"queryId":1,"query":{"perPage":6,"postType":"post","order":"desc","orderBy":"date","inherit":false}} -->…<!-- /wp:query -->'
  )
  const notes = []
  const out = await writeWoPosts({
    call: (a, p) => site.call(a, p),
    read,
    woContent: store(),
    note: (n) => notes.push(n)
  })
  assert.equal(out.written, 1)
  assert.deepEqual(
    site.updates.map((u) => [u.id, u.fields.post_title ?? u.fields.post_status]),
    [
      [11, 'Eggs Benedict'],
      [9, 'draft'],
      [7, 'draft']
    ]
  )
})

test('a post-list block of one category (ja-vega): the posts of that category take the restaurant’s, no other post is touched', async () => {
  const site = fakeSite(
    '<!-- wp:query {"queryId":2,"query":{"perPage":7,"postType":"post","order":"desc","orderBy":"date","inherit":false,"taxQuery":{"category":[3]}}} --><!-- /wp:query -->'
  )
  const out = await writeWoPosts({
    call: (a, p) => site.call(a, p),
    read,
    woContent: store(),
    note: () => {}
  })
  assert.equal(out.written, 1)
  assert.deepEqual(
    site.updates.map((u) => [u.id, u.fields.post_title ?? u.fields.post_status]),
    [
      [9, 'Eggs Benedict'],
      [7, 'draft']
    ]
  )
})

test('a post-list block narrowed to a tag, an unknown category or another order is left to the agent, said', async () => {
  for (const block of [
    '<!-- wp:query {"query":{"postType":"post","taxQuery":{"post_tag":[5]}}} --><!-- /wp:query -->',
    '<!-- wp:query {"query":{"postType":"post","taxQuery":{"category":[99]}}} --><!-- /wp:query -->',
    '<!-- wp:query {"query":{"postType":"post","order":"asc","orderBy":"title"}} --><!-- /wp:query -->',
    '<p>No list here.</p>'
  ]) {
    const site = fakeSite(block)
    const notes = []
    assert.equal(
      await writeWoPosts({
        call: (a, p) => site.call(a, p),
        read,
        woContent: store(),
        note: (n) => notes.push(n)
      }),
      null
    )
    assert.deepEqual(site.updates, [])
    assert.ok(notes.length > 0)
  }
})
