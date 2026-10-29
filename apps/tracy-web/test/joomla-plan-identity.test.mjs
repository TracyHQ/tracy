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

test('socials: the brief profile replaces the demo account, other icons are hidden in place with their list items', () => {
  const r = joomlaIdentityHtml(footer, bakery)
  assert.match(r.html, /href="https:\/\/instagram\.com\/copperleaf\.example"/)
  assert.doesNotMatch(r.html, /facebook|twitter|demo-gym|href="#"/)
  // 🔒 The nodes stay (a contract slot may bind inside the list, #189): two items hidden, one shown.
  assert.equal(r.html.match(/<li/g).length, 3)
  assert.equal(r.html.match(/<li hidden>/g).length, 2)
  assert.equal(r.emptied, false)
})

test('socials: a WhatsApp channel takes the first spare link, in the template icon font class', () => {
  const r = joomlaIdentityHtml(footer, {
    ...bakery,
    socials: { ...bakery.socials, whatsapp: 'https://wa.me/15550100222' }
  })
  assert.match(
    r.html,
    /<a href="https:\/\/wa\.me\/15550100222" title="WhatsApp"[^>]*><i class="fab fa-whatsapp"><\/i><\/a>/
  )
  assert.equal(r.html.match(/<li hidden>/g).length, 1)
  assert.doesNotMatch(r.html, /href="#"|<a\b[^>]*href=""[^>]*><i/)
})

test('socials: a module that held only demo social links is emptied, so the whole block goes', () => {
  const r = joomlaIdentityHtml(footer.replace(/<img[^>]*>/, ''), clinic)
  assert.equal(r.emptied, true)
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

// ---- A JSON list of social links in module parameters, and a map drawn by a shortcode (follow-up of C18) -----------------

const acmParams = (links) =>
  JSON.stringify({
    'jatools-config': JSON.stringify({
      ':type': 'x:social',
      social: {
        'social-intro[font-icon]': ['fa fa-facebook', 'fa fa-instagram', 'fa fa-twitter', 'fa fa-telegram'],
        'social-intro[title]': ['Facebook', 'Instagram', 'Twitter', 'Telegram'],
        'social-intro[link]': links
      }
    }),
    style: '0'
  })
const listOf = (/** @type {string} */ params) => JSON.parse(JSON.parse(params)['jatools-config']).social

/** The steps of the identity writer for one ACM social module under a plan's socials. */
const listSteps = async (/** @type {any} */ socials, /** @type {string} */ params) => {
  const modules = [{ id: 31, module: 'mod_ja_acm', published: 1, language: '*', content: '', params }]
  const { steps } = await planIdentitySteps({
    apply: async ({ action, params: p }) =>
      action === 'content.list' && p.kind === 'module'
        ? { ok: true, items: p.offset ? [] : modules }
        : { ok: true, items: [] },
    siteKey: 's',
    ctx: { siteKey: 's', email: 'o@example.test', note() {} },
    woContent: { sitePlanFor: async () => ({ socials }) },
    visible: new Set()
  })
  return steps.find((s) => s.kind === 'module' && s.id === 31)
}

test('socials in a module list: the business network moves to the front, the list keeps its length, the rest are emptied', async () => {
  const step = await listSteps(bakery.socials, acmParams(['#', '#', '#', '#']))
  const list = listOf(step.fields.params)
  // 🔒 Same length: the contract binds every item by its index (#189), so no path loses its words.
  assert.deepEqual(list['social-intro[title]'], ['Instagram', '', '', ''])
  assert.deepEqual(list['social-intro[font-icon]'], ['fa fa-instagram', '', '', ''])
  assert.deepEqual(list['social-intro[link]'], ['https://instagram.com/copperleaf.example', '', '', ''])
  assert.equal(step.fields.published, undefined)
})

test('socials in a module list: WhatsApp joins with the template icon font class, never a link left empty on an icon', async () => {
  const step = await listSteps(
    { ...bakery.socials, whatsapp: 'https://wa.me/15550100222' },
    acmParams(['', '', '', ''])
  )
  const list = listOf(step.fields.params)
  // The contact order (COO rule 29/10/2026): WhatsApp before the networks, its title says the action.
  assert.deepEqual(list['social-intro[font-icon]'], ['fa fa-whatsapp', 'fa fa-instagram', '', ''])
  assert.deepEqual(list['social-intro[title]'], ['WhatsApp us', 'Instagram', '', ''])
  assert.deepEqual(list['social-intro[link]'], [
    'https://wa.me/15550100222',
    'https://instagram.com/copperleaf.example',
    '',
    ''
  ])
  for (let i = 0; i < 4; i += 1)
    assert.equal(list['social-intro[font-icon]'][i] === '', list['social-intro[link]'][i] === '', `item ${i}`)
})

test('socials in a module list: a dental clinic with Facebook only keeps the template own Facebook item', async () => {
  const step = await listSteps(
    { decision: 'keep', keep: { facebook: 'https://facebook.com/northgate.dental.example' } },
    acmParams(['https://facebook.com/demo', '#', '#', '#'])
  )
  const list = listOf(step.fields.params)
  assert.deepEqual(list['social-intro[font-icon]'], ['fa fa-facebook', '', '', ''])
  assert.deepEqual(list['social-intro[link]'], ['https://facebook.com/northgate.dental.example', '', '', ''])
})

test('socials in a module list: an icon mechanism that is not an icon font class never gets a network drawn into it', async () => {
  const params = JSON.stringify({
    'jatools-config': JSON.stringify({
      social: {
        'social-intro[image]': ['images/demo/fb.png', 'images/demo/ig.png'],
        'social-intro[title]': ['Facebook', 'Instagram'],
        'social-intro[link]': ['#', '#']
      }
    })
  })
  const list = listOf(
    (await listSteps({ decision: 'keep', keep: {}, whatsapp: 'https://wa.me/15550100222' }, params)).fields
      .params
  )
  assert.deepEqual(list['social-intro[title]'], ['', ''])
  assert.deepEqual(list['social-intro[link]'], ['', ''])
})

test('socials in a module list: a brief with no profile unpublishes the module that held only social items', async () => {
  const modules = [
    {
      id: 31,
      module: 'mod_ja_acm',
      published: 1,
      language: '*',
      content: '',
      params: acmParams(['#', '#', '#', '#'])
    }
  ]
  const { steps } = await planIdentitySteps({
    apply: async ({ action, params }) =>
      action === 'content.list' && params.kind === 'module'
        ? { ok: true, items: params.offset ? [] : modules }
        : { ok: true, items: [] },
    siteKey: 's',
    ctx: { siteKey: 's', email: 'o@example.test', note() {} },
    woContent: { sitePlanFor: async () => ({ socials: clinic.socials }) },
    visible: new Set()
  })
  assert.equal(steps.find((s) => s.kind === 'module' && s.id === 31).fields.published, 0)
})

test('map shortcode: the brief place replaces it, no address takes it off and the empty module goes', () => {
  const shortcode = `{jamap mode='normal' locations='{"location":{"0":"Demo St"},"latitude":{"0":"1"}}' zoom='10' }{/jamap}`
  const kept = joomlaIdentityHtml(shortcode, bakery)
  assert.match(
    kept.html,
    /<iframe src="https:\/\/www\.google\.com\/maps\?q=14%20Mill%20Lane&amp;output=embed"/
  )
  assert.doesNotMatch(kept.html, /jamap|Demo St/)
  const gone = joomlaIdentityHtml(shortcode, clinic)
  assert.equal(gone.html, '')
  assert.equal(gone.emptied, true)
})

test('posts to replace but no blog page kept in the plan: the blog entries and modules go with the demo posts', async () => {
  const posts = { decision: 'replace', demoArticles: [{ id: 5 }, { id: 6 }] }
  const run = async (pages) =>
    (
      await planIdentitySteps({
        apply: siteDoor(),
        siteKey: 's',
        ctx,
        woContent: { sitePlanFor: async () => ({ posts, pages }) },
        visible: new Set()
      })
    ).steps.filter((s) => s.kind !== 'article')
  assert.ok((await run([{ id: 'home', role: 'home', decision: 'keep' }])).length > 0)
  assert.deepEqual(await run([{ id: 'journal', role: 'blog', decision: 'keep' }]), [])
})

test('the featured view and the home entry are never picked as blog surfaces, even when every featured article is a demo post', () => {
  const going = blogSurfacesGoing({
    menu: [
      {
        id: 101,
        published: 1,
        language: '*',
        home: 1,
        type: 'component',
        link: 'index.php?option=com_content&view=featured'
      },
      {
        id: 193,
        published: 1,
        language: '*',
        home: 0,
        type: 'component',
        link: 'index.php?option=com_content&view=featured'
      }
    ],
    modules: [],
    articles: [{ id: 5, catid: 8, state: 1, featured: 1 }],
    demoIds: new Set([5]),
    visible: new Set()
  })
  assert.deepEqual(going.menuIds, [])
})

test('socials in a module list: the write passes the bound-node guard of a contract that binds every item', async () => {
  const { keepBoundNodes } = await import('../src/sites/brief-engines/joomla-bound-nodes.js')
  const params = acmParams(['#', '#', '#', '#'])
  const step = await listSteps(bakery.socials, params)
  const slots = ['social-intro[title]', 'social-intro[link]'].flatMap((key) =>
    [0, 1, 2, 3].map((i) => ({
      key: `module-31.${key}.${i}`,
      entity: 'module-31',
      column: 'params',
      nestedJson: 'jatools-config',
      jsonPath: ['social', key, i]
    }))
  )
  const row = { id: 31, module: 'mod_ja_acm', published: 1, params }
  const checked = keepBoundNodes({ steps: [step], slots, modules: new Map([[31, row]]) })
  assert.deepEqual(checked.dropped, [])
  assert.equal(checked.steps.length, 1)
})
