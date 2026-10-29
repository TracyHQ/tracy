// The Joomla brief engine writes the site plan's logo, social, map and post decisions (spec TracyHQ/tracy#189, ticket #193).
// Two made-up businesses of different trades: a bakery with profiles and an address, a dental clinic with neither.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  blogSurfacesGoing,
  joomlaIdentityHtml,
  planIdentitySteps
} from '../src/sites/brief-engines/joomla-plan-identity.js'

const bakery = {
  socials: { decision: 'keep', keep: { instagram: 'https://instagram.com/copperleaf.example' } },
  map: { decision: 'address', embed: 'https://www.google.com/maps?q=14%20Mill%20Lane&output=embed' },
  logo: { decision: 'brief-logo', demoFiles: ['images/demo/logo/b.png'] },
  posts: { decision: 'replace', demoArticles: [{ id: 5 }, { id: 6 }] }
}
const clinic = {
  socials: { decision: 'hide', keep: {} },
  map: { decision: 'hide' },
  logo: { decision: 'name-as-text', name: 'Northgate Dental', demoFiles: ['images/demo/logo/b.png'] },
  posts: { decision: 'hide', demoArticles: [{ id: 5 }] }
}
const footer = `<ul>
<li><a href="#" class="fb"><i class="fab fa-facebook"></i></a></li>
<li><a href="https://twitter.com/demo"><i class="fab fa-twitter"></i></a></li>
<li><a href="https://instagram.com/demo-gym"><i class="fab fa-instagram"></i></a></li>
</ul><img src="/images/demo/logo/b.png" alt="logo">`
const map = '<iframe src="https://www.google.com/maps/embed?pb=!1demo" width="600"></iframe>'

test('socials: the brief profile replaces the demo account, other icons and their list items go', () => {
  const r = joomlaIdentityHtml(footer, bakery)
  assert.match(r.html, /href="https:\/\/instagram\.com\/copperleaf\.example"/)
  assert.doesNotMatch(r.html, /facebook|twitter|demo-gym|href="#"/)
  assert.equal(r.html.match(/<li/g).length, 1)
})

test('socials: a brief with no profile leaves no social icon, and a share button stays', () => {
  const r = joomlaIdentityHtml(
    `${footer}<a href="https://www.facebook.com/sharer/sharer.php?u=1">Share</a>`,
    clinic
  )
  assert.doesNotMatch(r.html, /twitter|instagram|fa-facebook"/)
  assert.match(r.html, /sharer\.php/)
})

test('map: the brief address is embedded, or the map is taken off and an empty module is unpublished', () => {
  assert.match(joomlaIdentityHtml(map, bakery).html, /q=14%20Mill%20Lane/)
  const gone = joomlaIdentityHtml(map, clinic)
  assert.equal(gone.html, '')
  assert.equal(gone.emptied, true)
})

test('logo: with no logo of the business a demo logo picture becomes the name as text; with one it is left to the brand step', () => {
  assert.match(
    joomlaIdentityHtml(footer, clinic).html,
    /<span class="tracy-brand-name">Northgate Dental<\/span>/
  )
  assert.match(joomlaIdentityHtml(footer, bakery).html, /<img src="\/images\/demo\/logo\/b\.png"/)
})

function door(modules) {
  return async ({ action, params }) => {
    if (action === 'content.list' && params.kind === 'module')
      return { ok: true, items: modules, total: modules.length }
    return { ok: true, items: [], total: 0 }
  }
}
const ctx = { siteKey: 's', email: 'a@b.example', note: () => {}, time: () => {} }

test('steps: one write per module merged over the contact steps, demo posts unpublished, nothing without a plan', async () => {
  const modules = [{ id: 7, published: 1, language: '*', content: footer }]
  const base = [{ kind: 'module', id: 7, fields: { content: `${footer}<p>call</p>` } }]
  const woContent = { sitePlanFor: async () => clinic }
  const { steps } = await planIdentitySteps({
    apply: door(modules),
    siteKey: 's',
    ctx,
    woContent,
    visible: new Set(),
    base
  })
  const mods = steps.filter((s) => s.kind === 'module')
  assert.equal(mods.length, 1)
  assert.match(mods[0].fields.content, /<p>call<\/p>/)
  assert.doesNotMatch(mods[0].fields.content, /twitter/)
  assert.deepEqual(
    steps.filter((s) => s.kind === 'article').map((s) => s.id),
    [5]
  )
  const none = await planIdentitySteps({
    apply: door(modules),
    siteKey: 's',
    ctx,
    woContent: { sitePlanFor: async () => null },
    visible: new Set(),
    base
  })
  assert.deepEqual(none.steps, base)
})

// ---- The blog goes with its posts (follow-up of ticket #193) ------------------------------------------------------------

const articles = [
  { id: 5, catid: 8, state: 1, featured: 0 },
  { id: 6, catid: 8, state: 1, featured: 1 },
  { id: 9, catid: 2, state: 1, featured: 0 }
]
const menu = [
  {
    id: 20,
    published: 1,
    language: '*',
    type: 'component',
    link: 'index.php?option=com_content&view=category&layout=blog&id=8'
  },
  {
    id: 21,
    published: 1,
    language: '*',
    type: 'component',
    link: 'index.php?option=com_content&view=category&id=2'
  },
  {
    id: 22,
    published: 1,
    language: '*',
    type: 'component',
    link: 'index.php?option=com_content&view=article&id=5'
  },
  {
    id: 23,
    published: 1,
    language: '*',
    type: 'component',
    link: 'index.php?option=com_content&view=article&id=9'
  }
]
const modules = [
  {
    id: 30,
    published: 1,
    language: '*',
    module: 'mod_articles_category',
    params: JSON.stringify({ catid: ['8'] }),
    content: ''
  },
  {
    id: 31,
    published: 1,
    language: '*',
    module: 'mod_articles_latest',
    params: JSON.stringify({ catid: ['2'] }),
    content: ''
  },
  { id: 32, published: 1, language: '*', module: 'mod_custom', params: '{}', content: '<p>hi</p>' }
]

function siteDoor() {
  return async ({ action, params }) => {
    const rows = { module: modules, menuItem: menu, article: articles, category: [] }[params?.kind]
    if (action === 'content.list') return { ok: true, items: rows ?? [], total: (rows ?? []).length }
    return { ok: true }
  }
}

test('without posts the blog menu entries, the entries opening a demo post and the blog module go; a kept page stays', async () => {
  const woContent = {
    sitePlanFor: async () => ({ posts: { decision: 'hide', demoArticles: [{ id: 5 }, { id: 6 }] } })
  }
  const { steps } = await planIdentitySteps({
    apply: siteDoor(),
    siteKey: 's',
    ctx,
    woContent,
    visible: new Set()
  })
  assert.deepEqual(
    steps
      .filter((s) => s.kind === 'menuItem')
      .map((s) => s.id)
      .sort(),
    [20, 22]
  )
  assert.deepEqual(
    steps.filter((s) => s.kind === 'module').map((s) => s.id),
    [30]
  )
  assert.ok(
    steps.filter((s) => s.kind === 'menuItem' || s.kind === 'module').every((s) => s.fields.published === 0)
  )
})

test('with posts of the brief the blog menu entries and modules stay', async () => {
  const woContent = {
    sitePlanFor: async () => ({ posts: { decision: 'replace', demoArticles: [{ id: 5 }, { id: 6 }] } })
  }
  const { steps } = await planIdentitySteps({
    apply: siteDoor(),
    siteKey: 's',
    ctx,
    woContent,
    visible: new Set()
  })
  assert.deepEqual(
    steps.filter((s) => s.kind !== 'article'),
    []
  )
})

test('a category that also holds a page the business keeps keeps its entry and module', () => {
  const mixed = [...articles, { id: 40, catid: 8, state: 1, featured: 0 }]
  const going = blogSurfacesGoing({
    menu,
    modules,
    articles: mixed,
    demoIds: new Set([5, 6]),
    visible: new Set()
  })
  assert.deepEqual(going.menuIds, [22])
  assert.deepEqual(going.moduleIds, [])
})

// ---- The door takes a module unpublish ----------------------------------------------------------------------------------

test('a module unpublish goes through the Apply door as content.batch, and one by one as content.update {kind: module}', async () => {
  const refused = []
  const seen = []
  const site = async (call) => {
    seen.push(call)
    if (call.action === 'content.batch') return { ok: false, error: 'batch_refused', message: 'refused' }
    return { ok: true }
  }
  const { writeSteps } = await import('../src/sites/brief-engines/joomla-tidy.js')
  const { throughDoor } = await import('./_apply-door.mjs')
  const done = await writeSteps({
    apply: throughDoor(site, { refused }),
    siteKey: 's',
    steps: [{ kind: 'module', id: 30, fields: { published: 0 } }],
    applyId: 'tidy-test'
  })
  assert.deepEqual(refused, [], 'the door refuses neither action')
  assert.equal(done.written, 1)
  const update = seen.find((c) => c.action === 'content.update')
  assert.deepEqual(
    [update.params.kind, update.params.id, update.params.fields],
    ['module', 30, { published: 0 }]
  )
})
