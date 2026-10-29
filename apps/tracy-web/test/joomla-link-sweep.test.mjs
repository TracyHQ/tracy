// Links to pages taken off and `#` links, resolved in their records (spec TracyHQ/tracy#189, C19). Two invented trades:
// a bakery and a dental clinic. Pure resolution first, then the writer against a fake site.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  resolveLink,
  sweepContext,
  sweepDeadLinks,
  sweepEntry,
  sweepHtml,
  sweepParams
} from '../src/sites/brief-engines/joomla-link-sweep.js'

const menu = [
  {
    id: 101,
    title: 'Home',
    published: 1,
    home: 1,
    parent_id: 1,
    type: 'component',
    link: 'index.php?option=com_content&view=featured'
  },
  {
    id: 102,
    title: 'Cakes',
    published: 1,
    parent_id: 1,
    type: 'component',
    link: 'index.php?option=com_content&view=article&id=7'
  },
  {
    id: 103,
    title: 'Contact',
    published: 1,
    parent_id: 1,
    type: 'component',
    link: 'index.php?option=com_contact&view=contact&id=1'
  },
  {
    id: 104,
    title: 'Wedding orders',
    published: 0,
    parent_id: 102,
    type: 'component',
    link: 'index.php?option=com_content&view=article&id=8'
  },
  {
    id: 105,
    title: 'Old news',
    published: 0,
    parent_id: 1,
    type: 'component',
    link: 'index.php?option=com_content&view=category&id=9'
  }
]
const articles = [
  { id: 7, title: 'Cakes', state: 1, catid: 2 },
  { id: 8, title: 'Wedding orders', state: 0 }
]
const ctx = sweepContext({
  menu,
  articles,
  contact: { phoneHref: 'tel:+97140000000', whatsappHref: 'https://wa.me/97150000000' }
})

test('a link to a taken-off entry goes to its nearest kept ancestor', () => {
  assert.deepEqual(resolveLink(ctx, 'index.php?Itemid=104', 'Wedding orders'), {
    keep: false,
    href: 'index.php?Itemid=102'
  })
})

test('a link to a taken-off entry with no kept ancestor is removed, unless it is a contact wish', () => {
  assert.deepEqual(resolveLink(ctx, 'index.php?Itemid=105', 'Archive'), { keep: false, href: null })
  assert.deepEqual(resolveLink(ctx, 'index.php?Itemid=105', 'Book a trial'), {
    keep: false,
    href: 'index.php?Itemid=103'
  })
})

test('a link to a kept page or an outside address stays', () => {
  assert.deepEqual(resolveLink(ctx, 'index.php?Itemid=102', 'Cakes'), { keep: true })
  assert.deepEqual(resolveLink(ctx, 'https://example.org/x', 'Elsewhere'), { keep: true })
})

test('a link to a taken-off article is removed', () => {
  assert.deepEqual(resolveLink(ctx, 'index.php?option=com_content&view=article&id=8', 'Orders'), {
    keep: false,
    href: null
  })
})

test('a # link goes by the role of its words', () => {
  assert.equal(resolveLink(ctx, '#', 'Call or message us').href, 'tel:+97140000000')
  assert.equal(resolveLink(ctx, '#', 'Message us on WhatsApp').href, 'https://wa.me/97150000000')
  assert.equal(resolveLink(ctx, '#', 'Book your table').href, 'index.php?Itemid=103')
  assert.equal(resolveLink(ctx, '#', 'Cakes').href, 'index.php?Itemid=102')
  assert.equal(resolveLink(ctx, '#', 'Sourdough').href, null)
})

test('html: a button with no target is removed whole, a plain anchor is unwrapped, a lone list item goes', () => {
  const html =
    '<p><a href="#" class="btn btn-primary">Sourdough</a></p><ul><li><a href="#">Rye</a></li><li><a href="#">Contact</a></li></ul>'
  const { html: out, changed } = sweepHtml(ctx, html)
  assert.equal(changed, 3)
  assert.ok(!out.includes('Sourdough') && !out.includes('Rye'))
  assert.match(out, /<a href="index\.php\?Itemid=103">Contact<\/a>/)
})

test('a style module list: the link beside its words is resolved, or emptied', () => {
  const config = { cta: { 'cta[title]': ['Call us', 'Rye'], 'cta[link]': ['#', 'index.php?Itemid=105'] } }
  const made = sweepParams(ctx, { 'jatools-config': JSON.stringify(config) })
  const out = JSON.parse(made.params['jatools-config'])
  assert.deepEqual(out.cta['cta[link]'], ['tel:+97140000000', ''])
  assert.equal(made.changed, 2)
  assert.equal(sweepParams(ctx, { 'jatools-config': '{"a":1}' }), null)
})

test('a style module list: a link wrapping an item title goes by the title, not by a phone line beside it', () => {
  for (const [title, desc, to] of [
    ['Cakes', 'or give us a call', 'index.php?Itemid=102'],
    ['Book a cake tasting', 'Our cakes are baked daily', 'index.php?Itemid=103']
  ]) {
    const config = {
      rows: { 'rows[info-title]': [title], 'rows[info-desc]': [desc], 'rows[info-link]': ['#'] }
    }
    const made = sweepParams(ctx, { 'jatools-config': JSON.stringify(config) })
    assert.deepEqual(JSON.parse(made.params['jatools-config']).rows['rows[info-link]'], [to])
  }
})

test('a link entry to a taken-off page is turned off; a # heading with kept children stays', () => {
  const dead = {
    id: 200,
    published: 1,
    type: 'url',
    title: 'Archive',
    link: 'index.php?Itemid=105',
    parent_id: 1
  }
  assert.deepEqual(sweepEntry(ctx, dead), { kind: 'menuItem', id: 200, fields: { published: 0 } })
  const kept = sweepContext({
    menu: [
      ...menu,
      { id: 201, published: 1, type: 'url', link: '#', title: 'More', parent_id: 1 },
      {
        id: 202,
        published: 1,
        type: 'component',
        link: 'index.php?option=com_content&view=article&id=7',
        title: 'Sub',
        parent_id: 201
      }
    ],
    articles
  })
  assert.equal(
    sweepEntry(kept, { id: 201, published: 1, type: 'url', link: '#', title: 'More', parent_id: 1 }),
    null
  )
})

test('the writer sends one batch with the fixed modules and entries', async () => {
  const modules = [
    { id: 50, published: 1, module: 'mod_custom', content: '<a href="#">Call or message us</a>' },
    { id: 51, published: 1, module: 'mod_custom', content: '<a href="index.php?Itemid=102">Cakes</a>' }
  ]
  const sent = []
  const apply = async ({ action, params }) => {
    if (action === 'content.list') {
      const rows = { menuItem: menu, module: modules, article: articles }[params.kind] ?? []
      return { ok: true, items: params.offset ? [] : rows }
    }
    if (action === 'content.batch') {
      sent.push(...params.operations)
      return { ok: true }
    }
    return { ok: true }
  }
  const notes = []
  const n = await sweepDeadLinks({
    apply,
    siteKey: 's',
    plan: { contact: { phone: { href: 'tel:+97140000000' } } },
    applyId: 'a',
    note: (l) => notes.push(l)
  })
  assert.equal(n, 1)
  assert.equal(sent[0].id, 50)
  assert.match(sent[0].fields.content, /tel:\+97140000000/)
  assert.deepEqual(notes, [])
})

test('an article body: an empty link is rewritten by role, an unresolved one keeps its node', () => {
  const body = '<p><a href="#">Book your table</a> <a href="#">Sourdough</a></p>'
  const { html, changed } = sweepHtml(ctx, body, { keepNodes: true })
  assert.equal(changed, 1)
  assert.match(html, /<a href="index\.php\?Itemid=103">Book your table<\/a>/)
  assert.match(html, /<a href="#">Sourdough<\/a>/)
})

test('the writer rewrites a link in a published article body, not in a taken-off one', async () => {
  const sent = []
  const rows = {
    menuItem: menu,
    module: [],
    article: [
      { id: 7, title: 'Cakes', state: 1, introtext: '<a href="#">Call us</a>', fulltext: '' },
      { id: 8, title: 'Gone', state: 0, introtext: '<a href="#">Call us</a>' }
    ]
  }
  const apply = async ({ action, params }) => {
    if (action === 'content.list') return { ok: true, items: params.offset ? [] : (rows[params.kind] ?? []) }
    if (action === 'content.batch') sent.push(...params.operations)
    return { ok: true }
  }
  await sweepDeadLinks({
    apply,
    siteKey: 's',
    plan: { contact: { phone: { href: 'tel:+97140000000' } } },
    applyId: 'a',
    note: () => {}
  })
  assert.deepEqual(
    sent.map((s) => s.id),
    [7]
  )
  assert.match(sent[0].fields.introtext, /tel:\+97140000000/)
})

const withAction = sweepContext({
  menu,
  articles,
  contact: {},
  primaryAction: { label: 'Order a cake', channel: 'contact' }
})

test('a link to the page its own module is shown on goes to the main action, or is removed without one', () => {
  assert.deepEqual(resolveLink(withAction, 'index.php?Itemid=102', 'Meet the bakers', new Set([102])), {
    keep: false,
    href: 'index.php?Itemid=103',
    self: true
  })
  assert.deepEqual(resolveLink(ctx, 'index.php?Itemid=102', 'Meet the bakers', new Set([102])).href, null)
  // A module on another page, on every page, or of unknown reach keeps its link.
  assert.deepEqual(resolveLink(withAction, 'index.php?Itemid=102', 'Cakes', new Set([101])), { keep: true })
  assert.deepEqual(resolveLink(withAction, 'index.php?Itemid=102', 'Cakes', new Set([0])), { keep: true })
  assert.deepEqual(resolveLink(withAction, 'index.php?Itemid=102', 'Cakes', null), { keep: true })
})

test('html: a self-link button now says the main action', () => {
  const html = '<a class="btn" href="index.php?Itemid=102">Meet the bakers</a>'
  const { html: out } = sweepHtml(withAction, html, { here: new Set([102]) })
  assert.equal(out, '<a class="btn" href="index.php?Itemid=103">Order a cake</a>')
})

test('the writer reads where each module is shown and fixes its self-link', async () => {
  const modules = [
    { id: 60, published: 1, module: 'mod_custom', content: '<a href="index.php?Itemid=102">Team</a>' }
  ]
  const sent = []
  const apply = async ({ action, params }) => {
    if (action === 'content.list')
      return {
        ok: true,
        items: params.offset
          ? []
          : ({ menuItem: menu, module: modules, article: articles }[params.kind] ?? [])
      }
    if (action === 'content.get') return { ok: true, item: { menuids: '[102]' } }
    if (action === 'content.batch') sent.push(...params.operations)
    return { ok: true }
  }
  await sweepDeadLinks({
    apply,
    siteKey: 's',
    plan: { primaryAction: { label: 'Order a cake', channel: 'contact' } },
    applyId: 'a',
    note: () => {}
  })
  assert.match(sent[0].fields.content, /Itemid=103">Order a cake</)
})
