import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pagePlan } from '../domain/page-plan.mjs'
import { contentPool } from '../domain/content-pool.mjs'

// The page lists of five released templates, as their releases say (WO stand, 19/10/2026).
const TEMPLATES = JSON.parse(readFileSync(new URL('./fixtures/template-pages.json', import.meta.url), 'utf8'))
const POSTS = JSON.parse(readFileSync(new URL('./fixtures/content-pool-posts.json', import.meta.url), 'utf8'))
const NOW = '2026-10-19'
const LARCH = contentPool({ posts: POSTS['larch-house'], now: NOW }).items
const QUILLHAUS = contentPool({ posts: POSTS.quillhaus, now: NOW }).items
const FACTS = { images: 12, menuLinks: [], socials: { facebook: 'https://facebook.com/x' } }

const kept = (template, content = LARCH, facts = FACTS) =>
  pagePlan({ pages: TEMPLATES[template], content, facts, now: NOW }).keep

test('a template keeps its pages: one of each kind, without the samples and variants a demo ships', () => {
  assert.deepEqual(kept('quickstart/ja-restaurant/j6'), [
    'homepage',
    'about-us',
    'about-us/our-history',
    'menu/simple-menu',
    'offers',
    'blog',
    'gallery',
    'contact/contact-us'
  ])
  assert.deepEqual(kept('quickstart/ja-impact/j6'), [
    'home',
    'about',
    'donations',
    'events',
    'category-blog',
    'contact'
  ])
  assert.deepEqual(kept('quickstart/ja-spa/j6'), ['homepage', 'our-spa', 'services', 'our-blog', 'contact'])
  assert.deepEqual(kept('quickstart/ja-vega/j6'), ['home', 'about-us', 'services', 'portfolio', 'news'])
  assert.deepEqual(kept('tracy-base/emdash-0.x'), [
    'home',
    'product',
    'services_page',
    'pricing',
    'blog',
    'about'
  ])
})

test('a page the research holds nothing true for keeps its layout: pricing from collected prices, team, FAQ, careers and donations neutral (product owner, 26/10/2026)', () => {
  const plan = (facts) => pagePlan({ pages: TEMPLATES['tracy-base/j6'], content: LARCH, facts, now: NOW })
  const row = (p, id) => p.pages.find((r) => r.id === id)
  const without = plan(FACTS)
  for (const id of ['pricing', 'resources/faq', 'company/team', 'company/careers']) {
    assert.equal(row(without, id).keep, true, id)
    assert.equal(row(without, id).fill, 'neutral', id)
  }
  const priced = plan({ ...FACTS, prices: 4 })
  assert.equal(row(priced, 'pricing').fill, 'prices')
  // Prices fill the pricing page only: a team or FAQ never gets one.
  assert.equal(row(priced, 'company/team').fill, 'neutral')
  const impact = pagePlan({
    pages: TEMPLATES['quickstart/ja-impact/j6'],
    content: LARCH,
    facts: FACTS,
    now: NOW
  })
  assert.equal(row(impact, 'donations').fill, 'neutral')
})

test('every page taken off says why', () => {
  const plan = pagePlan({
    pages: TEMPLATES['quickstart/ja-restaurant/j6'],
    content: LARCH,
    facts: FACTS,
    now: NOW
  })
  const off = plan.pages.filter((p) => !p.keep)
  assert.deepEqual(
    off.map((p) => p.id),
    [
      'menu/menu-with-image',
      'menu/2-column-menu',
      'explore/j-pages/all-categories',
      'explore/j-pages/featured-articles',
      'contact/phone-reservation'
    ]
  )
  for (const p of off) assert.ok(p.why.length > 10, p.id)
})

test('of two contact pages the one called Contact stays, whatever the order (manager, 22/10/2026)', () => {
  const plan = pagePlan({
    pages: TEMPLATES['quickstart/ja-restaurant/j6'],
    content: LARCH,
    facts: FACTS,
    now: NOW
  })
  const reservation = plan.pages.find((p) => p.id === 'contact/phone-reservation')
  assert.equal(reservation.keep, false)
  assert.match(reservation.why, /Contact page is kept/)
  assert.equal(plan.pages.find((p) => p.id === 'contact/contact-us').fill, 'facts')
})

test("a template's utility pages are samples: profile, offline, error, reminder, password and tag pages are never planned", () => {
  const utility = [
    'your-profile',
    'user-profile',
    'offline-page',
    'erro-page',
    'error-page',
    'reminder',
    'reset-password',
    'tagged-items',
    'registration'
  ]
  const plan = pagePlan({
    pages: [{ id: 'homepage', home: true }, ...utility.map((id) => ({ id }))],
    content: LARCH,
    facts: FACTS,
    now: NOW
  })
  assert.deepEqual(plan.keep, ['homepage'])
  for (const p of plan.pages.filter((r) => r.id !== 'homepage')) assert.equal(p.role, 'sample', p.id)
})

test('a page of history is kept only when the posts tell a story beyond the about page', () => {
  const noStory = LARCH.filter((it) => !it.kinds.includes('story'))
  assert.ok(!kept('quickstart/ja-restaurant/j6', noStory).includes('about-us/our-history'))
})

test('the blog gets two or three of the page’s own posts, all different, never one credited to someone else', () => {
  const plan = pagePlan({
    pages: TEMPLATES['quickstart/ja-restaurant/j6'],
    content: LARCH,
    facts: FACTS,
    now: NOW
  })
  const blog = plan.pages.find((p) => p.id === 'blog')
  assert.equal(blog.fill, 'sourced')
  assert.ok(blog.items.length >= 2 && blog.items.length <= 3)
  assert.equal(new Set(blog.items).size, blog.items.length)
  const byId = new Map(LARCH.map((it) => [it.id, it]))
  for (const id of blog.items) assert.equal(byId.get(id).authorship, 'page')
})

test('events and offers show what still runs first, past ones only as an archive, and stay when there is nothing', () => {
  const plan = pagePlan({
    pages: TEMPLATES['quickstart/ja-impact/j6'],
    content: QUILLHAUS,
    facts: FACTS,
    now: NOW
  })
  const events = plan.pages.find((p) => p.id === 'events')
  const byId = new Map(QUILLHAUS.map((it) => [it.id, it]))
  const statuses = events.items.map((id) => byId.get(id).temporal.status)
  assert.ok(statuses.length > 0)
  assert.ok(
    statuses.indexOf('past') === -1 || statuses.slice(statuses.indexOf('past')).every((s) => s === 'past')
  )
  const empty = pagePlan({
    pages: TEMPLATES['quickstart/ja-restaurant/j6'],
    content: [],
    facts: FACTS,
    now: NOW
  })
  const offers = empty.pages.find((p) => p.id === 'offers')
  assert.equal(offers.keep, true)
  assert.equal(offers.state, 'no_eligible_items')
})

test('a menu page shows the restaurant’s dishes on the site, with or without a menu link; never a button to the live menu', () => {
  const linked = pagePlan({
    pages: TEMPLATES['quickstart/ja-restaurant/j6'],
    content: LARCH,
    facts: { ...FACTS, menuLinks: ['https://www.thelarchhouse.example/menu'] },
    now: NOW
  })
  const withLink = linked.pages.find((p) => p.id === 'menu/simple-menu')
  assert.equal(withLink.fill, 'dishes')
  assert.ok(withLink.items.length >= 3)
  const unlinked = pagePlan({
    pages: TEMPLATES['quickstart/ja-restaurant/j6'],
    content: LARCH,
    facts: FACTS,
    now: NOW
  })
  const menu = unlinked.pages.find((p) => p.id === 'menu/simple-menu')
  assert.equal(menu.fill, 'dishes')
  assert.deepEqual(menu.items, withLink.items)
  const none = pagePlan({
    pages: TEMPLATES['quickstart/ja-restaurant/j6'],
    content: [],
    facts: FACTS,
    now: NOW
  })
  assert.deepEqual(
    (({ fill, items }) => ({ fill, items }))(none.pages.find((p) => p.id === 'menu/simple-menu')),
    { fill: 'dishes', items: [] }
  )
})

test('the home page and a locked page are kept whatever they are', () => {
  const plan = pagePlan({
    pages: [
      { id: 'start', home: true, label: 'Start' },
      { id: 'pricing', label: 'Pricing' }
    ],
    locked: ['pricing'],
    content: [],
    facts: FACTS,
    now: NOW
  })
  assert.deepEqual(plan.keep, ['start', 'pricing'])
})

test('the home page is known by its id when the list does not flag it', () => {
  const plan = pagePlan({
    pages: [
      { id: 'homepage', label: 'Home' },
      { id: 'blog', label: 'Blog' }
    ],
    content: LARCH,
    facts: FACTS,
    now: NOW
  })
  assert.equal(plan.pages[0].role, 'home')
  assert.equal(plan.pages[0].fill, 'facts')
})

test('an offer that is also a dish goes to the offers page, and a page says it is empty only from what it got', () => {
  const TAMAREL = contentPool({ posts: POSTS.tamarel, now: NOW }).items
  const plan = pagePlan({
    pages: TEMPLATES['quickstart/ja-restaurant/j6'],
    content: TAMAREL,
    facts: FACTS,
    now: NOW
  })
  const offers = plan.pages.find((p) => p.id === 'offers')
  assert.ok(offers.items.length > 0)
  assert.equal(offers.state, 'past_only')
})

test('a past event or offer is never a dish, a story or a blog post; the menu takes posts about food, not about a match night', () => {
  const plan = pagePlan({
    pages: TEMPLATES['quickstart/ja-restaurant/j6'],
    content: QUILLHAUS,
    facts: FACTS,
    now: NOW
  })
  const byId = new Map(QUILLHAUS.map((it) => [it.id, it]))
  for (const p of plan.pages.filter((x) => !['events', 'offers'].includes(x.role)))
    for (const id of p.items ?? [])
      assert.notEqual(byId.get(id).temporal?.status, 'past', `${p.id}: ${byId.get(id).title}`)
  const menu = plan.pages.find((p) => p.id === 'menu/simple-menu')
  for (const id of menu.items) assert.ok(!byId.get(id).kinds.includes('event'), byId.get(id).title)
})

test('on real feeds the menu shows dishes, never a job advert, a match night or a joke', () => {
  const LARCH_PLAN = pagePlan({
    pages: TEMPLATES['quickstart/ja-restaurant/j6'],
    content: LARCH,
    facts: FACTS,
    now: NOW
  })
  const titles = (plan, items, id) =>
    plan.pages.find((p) => p.id === id).items.map((i) => items.find((it) => it.id === i).title)
  assert.ok(
    !titles(LARCH_PLAN, LARCH, 'menu/simple-menu').some((t) =>
      /searching for|seeking|passionate about wine/i.test(t)
    )
  )
  const H = pagePlan({
    pages: TEMPLATES['quickstart/ja-restaurant/j6'],
    content: QUILLHAUS,
    facts: FACTS,
    now: NOW
  })
  assert.ok(
    !titles(H, QUILLHAUS, 'menu/simple-menu').some((t) => /match|semi-final|countdown|world cup/i.test(t))
  )
  // Quillhaus's posts are all dated, recurring or taken by other pages: no world cup post fills its blog, which comes off.
  assert.equal(H.pages.find((p) => p.id === 'blog').keep, false)
  assert.ok(!H.keep.includes('blog'))
})

test('a history page without an about page starts from the best story; a gallery without photographs comes off', () => {
  const plan = pagePlan({
    pages: [
      { id: 'home', home: true },
      { id: 'our-story', label: 'Our Story' },
      { id: 'gallery', label: 'Gallery' }
    ],
    content: LARCH,
    facts: { ...FACTS, images: 0 },
    now: NOW
  })
  const story = plan.pages.find((p) => p.id === 'our-story')
  const best = LARCH.filter((it) => it.kinds.includes('story') && it.temporal?.status !== 'past')
  assert.ok(story.items.length > 0)
  assert.ok(story.items.includes(plan.pages.find((p) => p.id === 'our-story').items[0]))
  assert.ok(best.length >= 2)
  const gallery = plan.pages.find((p) => p.id === 'gallery')
  assert.equal(gallery.keep, false)
  assert.match(gallery.why, /no photograph/)
})

test('each page of the plan carries the path the release names it by, so QA can look for it on the site', () => {
  const plan = pagePlan({
    pages: TEMPLATES['quickstart/ja-restaurant/j6'],
    content: LARCH,
    facts: FACTS,
    now: NOW
  })
  assert.equal(plan.pages.find((p) => p.id === 'homepage').path, '/')
  assert.equal(
    plan.pages.find((p) => p.id === 'contact/phone-reservation').path,
    '/contact/phone-reservation'
  )
})

test('a page is known by its own name before its section: Contact under Resources is the contact page', () => {
  // Tracy Base on Joomla (WO stand wobrief, 19/10/2026): 23 pages under Service, Resources and Company sections.
  assert.deepEqual(kept('tracy-base/j6'), [
    'home',
    'product',
    'services',
    'pricing',
    'resources/blog',
    'resources/faq',
    'resources/contact',
    'company/about',
    'company/team',
    'company/careers'
  ])
  const plan = pagePlan({ pages: TEMPLATES['tracy-base/j6'], content: LARCH, facts: FACTS, now: NOW })
  const why = (id) => plan.pages.find((p) => p.id === id).why
  assert.match(why('resources/mag-world'), /demo/)
  assert.match(why('resources/style-guide'), /sample/)
  assert.match(why('company/careers'), /layout/)
})

test('an EmDash page carries no path: its id is not always its route (services_page is served at /services)', () => {
  const plan = pagePlan({
    pages: TEMPLATES['tracy-base/emdash-0.x'],
    cms: 'emdash',
    content: LARCH,
    facts: FACTS,
    now: NOW
  })
  assert.ok(
    plan.pages.every((p) => !('path' in p)),
    JSON.stringify(plan.pages.map((p) => p.path))
  )
})

test('a blog with no post of the restaurant is taken off with its reason; a dated or recurring post is no post of the blog', () => {
  const pages = [
    { id: 'homepage', home: true },
    { id: 'blog', label: 'Blog' }
  ]
  const blogOf = (content) =>
    pagePlan({ pages, content, facts: FACTS, now: NOW }).pages.find((p) => p.id === 'blog')
  for (const content of [[], LARCH.filter((it) => it.temporal)]) {
    const blog = blogOf(content)
    assert.equal(blog.keep, false)
    assert.equal(blog.why, 'no post of the restaurant was collected')
    assert.equal(blog.fill, undefined)
  }
})

test('a blog with one post or more is kept as before: written below two, sourced from two', () => {
  const pages = [
    { id: 'homepage', home: true },
    { id: 'blog', label: 'Blog' }
  ]
  const posts = LARCH.filter(
    (it) => it.authorship === 'page' && it.temporal?.status !== 'past' && !it.temporal
  )
  assert.ok(posts.length >= 2, 'the Larch fixture holds two posts of the blog')
  const one = pagePlan({ pages, content: posts.slice(0, 1), facts: FACTS, now: NOW })
  assert.deepEqual(one.keep, ['homepage', 'blog'])
  assert.deepEqual(one.pages[1], {
    id: 'blog',
    path: '/blog',
    role: 'blog',
    keep: true,
    why: 'a page of the template',
    items: [posts[0].id],
    fill: 'written'
  })
  const blog = pagePlan({ pages, content: posts, facts: FACTS, now: NOW }).pages[1]
  assert.equal(blog.keep, true)
  assert.equal(blog.fill, 'sourced')
})

test('a blog whose only posts went to other pages is taken off, and the kept list agrees with the row', () => {
  const pages = [
    { id: 'homepage', home: true },
    { id: 'about-us', label: 'About us' },
    { id: 'blog', label: 'Blog' }
  ]
  const story = LARCH.find((it) => it.authorship === 'page' && !it.temporal && it.kinds.includes('story'))
  assert.ok(story, 'the Larch fixture holds a story')
  const plan = pagePlan({ pages, content: [story], facts: FACTS, now: NOW })
  assert.deepEqual(plan.pages.find((p) => p.id === 'about-us').items, [story.id])
  const blog = plan.pages.find((p) => p.id === 'blog')
  assert.equal(blog.keep, false)
  assert.equal(blog.why, 'no post of the restaurant is left for the blog')
  assert.equal(blog.fill, undefined)
  assert.deepEqual(plan.keep, ['homepage', 'about-us'])
})

test('a services page shows the services the reading quoted; without any it is written as before (#1780)', () => {
  const services = (facts) =>
    pagePlan({ pages: TEMPLATES['quickstart/ja-spa/j6'], content: [], facts, now: NOW }).pages.find(
      (p) => p.id === 'services'
    ).fill
  assert.equal(services({ ...FACTS, services: 4 }), 'services')
  assert.equal(services(FACTS), 'written')
})
