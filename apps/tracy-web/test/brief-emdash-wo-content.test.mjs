/**
 * The EmDash engine writes a restaurant's own posts into its Website Opportunities demo site, without a model: the demo
 * posts the blog shows first are edited in place (slug kept, published), the rest unpublished — over a stand-in for the
 * site's admin API seeded from the template's own posts.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createEmdashEngine } from '../src/sites/brief-engines/emdash.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const THEMES = path.resolve(HERE, '../../../packages/cms')
const roots = []
after(() => {
  for (const d of roots) rmSync(d, { recursive: true, force: true })
})

/** The template's published posts of its default locale, as the blog page orders them (read from its `lib/posts.ts`). */
function seedPosts(template) {
  const seed = JSON.parse(
    readFileSync(path.join(THEMES, `tracy-emdash-theme-${template}`, 'seed', 'seed.json'), 'utf8')
  )
  const locale = seed.defaultLocale ?? 'en'
  return {
    locale,
    posts: seed.content.posts.filter((e) => (e.locale ?? locale) === locale)
  }
}

/** A stand-in for the site's content API: GET by slug, PUT a draft by id with `_rev`, publish, unpublish. */
function fakeSite(template, { refuseTitleOf = null } = {}) {
  const { locale, posts } = seedPosts(template)
  /** @type {Map<string, any>} by slug */
  const entries = new Map()
  posts.forEach((e, i) => {
    entries.set(e.slug, {
      id: `row-${i}`,
      slug: e.slug,
      status: e.status ?? 'published',
      data: { ...e.data },
      liveData: { ...e.data },
      rev: 1
    })
  })
  const byId = (id) => [...entries.values()].find((e) => e.id === id)
  /** @type {Array<[string, string, any]>} */
  const calls = []
  const ok = (data) => new Response(JSON.stringify({ success: true, data }), { status: 200 })
  const fetchImpl = async (url, init) => {
    const u = new URL(url)
    const body = init.body ? JSON.parse(init.body) : undefined
    calls.push([init.method, u.pathname, body])
    const m = /^\/_emdash\/api\/content\/posts\/([^/]+)(\/(publish|unpublish))?$/.exec(u.pathname)
    if (!m) return ok({ forms: [] })
    assert.equal(u.searchParams.get('locale'), locale, 'the default locale only')
    const key = decodeURIComponent(m[1])
    if (init.method === 'GET') {
      const e = entries.get(key)
      if (!e) return new Response('{}', { status: 404 })
      return ok({
        item: { id: e.id, slug: e.slug, status: e.status, data: e.data, liveData: e.liveData },
        _rev: `r${e.rev}`
      })
    }
    const e = byId(key)
    if (!e) return new Response('{}', { status: 404 })
    if (init.method === 'PUT') {
      assert.equal(body._rev, `r${e.rev}`, 'a write names the revision it read')
      e.data = body.data
      e.rev += 1
      return ok({ item: e, _rev: `r${e.rev}` })
    }
    if (m[3] === 'publish') {
      e.liveData = refuseTitleOf === e.slug ? { ...e.liveData } : { ...e.data }
      e.status = 'published'
    } else e.status = 'draft'
    return ok({ _rev: `r${e.rev}` })
  }
  return { fetchImpl, calls, entries, locale, posts }
}

/** The build's content as `opportunities-build/site-content.js` answers it, its receipts kept in memory. */
function fakeWoContent({ items, writes = {}, blog = true } = {}) {
  const store = { before: {}, writes: { ...writes } }
  return {
    store,
    async forSite() {
      return {
        buildId: 'build-1',
        items,
        pagePlan: {
          pages: [
            {
              id: 'blog',
              role: 'blog',
              keep: blog,
              fill: 'sourced',
              items: items.map((i) => i.id)
            }
          ]
        },
        before: store.before,
        writes: store.writes
      }
    },
    async recordBefore(buildId, key, fields) {
      store.before[key] ??= fields
      return store.before[key]
    },
    async recordWrite(buildId, key, receipt) {
      store.writes[key] = receipt
    }
  }
}

const ITEMS = [
  {
    id: 'i1',
    title: 'Jazz night every Thursday',
    body: 'Live trio from 8pm.\n\nBook a table early.',
    posts: [{ source: 'facebook', publishedAt: '2026-10-08T09:00:00.000Z' }]
  },
  { id: 'i2', title: 'Our new pho', body: 'Slow broth, twelve hours.' }
]

function make({ template = 'business', woContent, site }) {
  const workRoot = mkdtempSync(path.join(tmpdir(), 'engine-wo-'))
  roots.push(workRoot)
  const run = async (call) => {
    site.calls.push(['TOOL', call.env.TRACY_FETCH_MODE ?? 'real'])
    if (call.env.TRACY_FETCH_MODE === 'record') return { code: 0, stdout: '', stderr: '', killed: false }
    return {
      code: 0,
      stdout: JSON.stringify({ written: [{ entry: 'site/site/en' }], errors: [], skipped: [] }),
      stderr: '',
      killed: false
    }
  }
  const engine = createEmdashEngine({
    models: async () => ({}),
    siteAccess: async () => ({
      origin: 'http://pho-web-1:4321',
      token: 'ec_pat_realtoken00000000000000000000'
    }),
    run,
    workRoot,
    fetchImpl: site.fetchImpl,
    log: { info() {}, warn() {} },
    ...(woContent !== undefined ? { woContent } : {})
  })
  const notes = []
  const times = {}
  const ctx = {
    siteKey: 'pho.tracy.test',
    label: 'pho',
    platform: 'emdash',
    quickstart: `tracy-${template}/emdash-0.x`,
    contract: null,
    email: 'owner@example.com',
    brief: { about: '', goal: null, style: null },
    normalized: { name: 'Pho House', about: '', languages: ['en'] },
    signal: new AbortController().signal,
    time: (name, v) => {
      times[name] = v
    },
    note: (n) => notes.push(n),
    deadlineAt: Date.now() + 60_000
  }
  return {
    notes,
    times,
    async build() {
      const prepared = await engine.prepare(ctx)
      try {
        return await engine.apply(ctx, prepared)
      } finally {
        await engine.dispose(prepared)
      }
    }
  }
}

const postNotes = (notes) => notes.filter((n) => /post/.test(n))
const postWrites = (calls) =>
  calls.filter(([m, r]) => m !== 'GET' && r.startsWith('/_emdash/api/content/posts/'))

test('a site no opportunity built writes no post', async () => {
  for (const woContent of [undefined, null, { forSite: async () => null }]) {
    const site = fakeSite('business')
    await make({ woContent, site }).build()
    assert.deepEqual(postWrites(site.calls), [])
  }
})

/** The blog's order on Tracy Business (`views/News.astro`): the featured post leads, the rest newest first. */
const businessOrder = (posts) => {
  const byDate = [...posts].sort((a, b) => Date.parse(b.data.date) - Date.parse(a.data.date))
  const featured = byDate.find((p) => p.data.featured)
  return featured ? [featured, ...byDate.filter((p) => p !== featured)] : byDate
}

test('Tracy Business: the posts the blog shows first carry the restaurant’s posts, slug kept and published; the rest come off', async () => {
  const site = fakeSite('business')
  const woContent = fakeWoContent({ items: ITEMS })
  const run = make({ woContent, site })
  await run.build()
  const [first, second, ...rest] = businessOrder(site.posts).map((p) => site.entries.get(p.slug))
  for (const [entry, item] of [
    [first, ITEMS[0]],
    [second, ITEMS[1]]
  ]) {
    assert.equal(entry.status, 'published')
    assert.equal(entry.liveData.title, item.title)
    assert.equal(entry.liveData.content[0]._type, 'block')
    assert.equal(entry.liveData.content[0].children[0].text, item.body.split('\n\n')[0])
    assert.ok(entry.liveData.excerpt && item.body.startsWith(entry.liveData.excerpt.slice(0, 10)))
    assert.ok(entry.liveData.short_title && entry.liveData.short_title.length <= 48)
    assert.ok(item.title.startsWith(entry.liveData.short_title))
    // The day the restaurant posted it, when the post says; else the demo's (stand wobrief showed posts dated 2021).
    const demoDate = site.posts.find((p) => p.slug === entry.slug).data.date
    if (item.posts)
      assert.equal(entry.liveData.date, item.posts[0].publishedAt.slice(0, String(demoDate).length))
    else assert.equal(entry.liveData.date, demoDate)
  }
  assert.ok(
    rest.length > 0 && rest.every((e) => e.status === 'draft'),
    'every other demo post is unpublished'
  )
  assert.ok(
    !site.calls.some(([m, r]) => m === 'POST' && r === '/_emdash/api/content/posts'),
    'nothing is created'
  )
  assert.ok(!site.calls.some(([m]) => m === 'DELETE'), 'nothing is deleted')
  const key = `post:${site.locale}:${first.slug}`
  assert.deepEqual(woContent.store.writes[key].state, 'written')
  assert.equal(woContent.store.writes[key].itemId, 'i1')
  assert.equal(woContent.store.before[key].title, site.posts.find((p) => p.slug === first.slug).data.title)
  assert.equal(woContent.store.writes[`post:${site.locale}:${rest[0].slug}`].state, 'hidden')
  assert.deepEqual(postNotes(run.notes), [])
  assert.equal(run.times.woPostsWritten, 2)
  assert.equal(run.times.woPostsHidden, rest.length)
})

test('Tracy Base: newest first, same-day posts by their sort, and the restaurant’s posts land after the tool has run', async () => {
  const site = fakeSite('base')
  const woContent = fakeWoContent({ items: ITEMS })
  await make({ template: 'base', woContent, site }).build()
  // The demo posts all carry one date: the blog lists them by `sort`.
  const ordered = [...site.posts].sort(
    (a, b) => Date.parse(b.data.date) - Date.parse(a.data.date) || (a.data.sort ?? 0) - (b.data.sort ?? 0)
  )
  assert.equal(site.entries.get(ordered[0].slug).liveData.title, ITEMS[0].title)
  assert.equal(site.entries.get(ordered[1].slug).liveData.title, ITEMS[1].title)
  assert.ok(!('short_title' in site.entries.get(ordered[0].slug).liveData), 'Base has no breadcrumb title')
  assert.equal(site.entries.get(ordered[2].slug).status, 'draft')
  const toolAt = site.calls.findIndex(([m, r]) => m === 'TOOL' && r === 'real')
  const firstPut = site.calls.findIndex(([m]) => m === 'PUT')
  assert.ok(toolAt >= 0 && firstPut > toolAt, 'written after the personalize tool')
  assert.ok(!site.calls.slice(firstPut).some(([m]) => m === 'TOOL'), 'the tool does not run again after')
})

test('a post that does not read back as written leaves every other demo post up, and is said', async () => {
  const first = businessOrder(seedPosts('business').posts)[0].slug
  const site = fakeSite('business', { refuseTitleOf: first })
  const woContent = fakeWoContent({ items: ITEMS })
  const run = make({ woContent, site })
  await run.build()
  assert.ok(!site.calls.some(([m, r]) => m === 'POST' && r.endsWith('/unpublish')), 'nothing unpublished')
  assert.equal(woContent.store.writes[`post:${site.locale}:${first}`].state, 'failed')
  assert.ok(postNotes(run.notes).some((n) => n.includes(ITEMS[0].title)))
  assert.equal(run.times.woPostsFailed, 1)
})

test('a retry skips a post this build already wrote, and writes the template’s words before it only once', async () => {
  const site = fakeSite('business')
  const woContent = fakeWoContent({ items: ITEMS })
  await make({ woContent, site }).build()
  const before = structuredClone(woContent.store.before)
  const puts = postWrites(site.calls).filter(([m]) => m === 'PUT').length
  await make({ woContent, site }).build()
  assert.equal(postWrites(site.calls).filter(([m]) => m === 'PUT').length, puts, 'no second write')
  assert.deepEqual(woContent.store.before, before, 'the template’s own words are kept from the first run')
})

test('a retry rewrites a post the site no longer shows as written (the tool ran again over it)', async () => {
  const site = fakeSite('business')
  const woContent = fakeWoContent({ items: ITEMS })
  await make({ woContent, site }).build()
  const first = site.entries.get(businessOrder(site.posts)[0].slug)
  first.liveData = { ...first.liveData, title: 'A model wrote this' }
  await make({ woContent, site }).build()
  assert.equal(first.liveData.title, ITEMS[0].title)
})

test('a read of the build that fails is said, and the build goes on with the template’s posts', async () => {
  const site = fakeSite('business')
  const run = make({
    woContent: {
      forSite: async () => {
        throw new Error('db down')
      }
    },
    site
  })
  await run.build()
  assert.deepEqual(postWrites(site.calls), [])
  assert.ok(postNotes(run.notes).some((n) => n.includes('db down')))
})
