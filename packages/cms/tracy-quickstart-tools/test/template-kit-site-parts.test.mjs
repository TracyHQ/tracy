// Template kit, site part: contact blocks, forms, footer link columns, system pages and the per-link, per-list and
// per-page helpers, on fabricated browser reads of a made-up studio site.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { h1Source, linkAction, listHolds } from '../template-kit/lib/site/helpers.mjs'
import { menuNavigationGroups } from '../template-kit/lib/site/menu-groups.mjs'
import {
  buildContactBlocks,
  buildForms,
  buildNavigationGroups,
  contactKinds,
  formKind,
  lineKind
} from '../template-kit/lib/site/site-parts.mjs'
import { articleLayoutOf, buildSystemPages, legalPagesOf } from '../template-kit/lib/site/system-pages.mjs'

const idOf = (raw, read) => (raw === 'main-body' ? `body-${read.slug}` : raw.replace(/^module-/, 'block-'))
const footerLines = [
  { text: '(555) 010-2030', href: 'tel:5550102030' },
  { text: '12 Harbour Street, Lakeview 40100', href: null },
  { text: 'hello@studio.example', href: 'mailto:hello@studio.example' },
  { text: 'Mon - Fri 7:00 - 21:00', href: null },
  { text: 'Follow us', href: null }
]

test('each contact line has one kind, counted once', () => {
  assert.equal(lineKind({ text: 'Open daily 6am to 10pm' }), 'hours')
  assert.equal(lineKind({ text: 'Unit 4, Old Mill' }, ['Unit 4, Old Mill, Lakeview']), 'address')
  assert.equal(lineKind({ text: 'Since 2008' }), null)
  const { kinds } = contactKinds([...footerLines, footerLines[0]])
  assert.deepEqual(kinds, { phone: 1, email: 1, address: 1, hours: 1 })
})

test('summary contact blocks: two kinds or more, or shared; counted by page', () => {
  const reads = [
    {
      pageId: 'page-home',
      slug: 'home',
      contacts: [{ block: 'module-9', region: 'footer', lines: footerLines }]
    },
    {
      pageId: 'page-about',
      slug: 'about',
      contacts: [
        { block: 'module-9', region: 'footer', lines: footerLines },
        { block: 'module-12', region: 'body', lines: [{ text: 'call (555) 010-2030' }] }
      ]
    }
  ]
  const blocks = buildContactBlocks(reads, { idOf })
  assert.equal(blocks.length, 1)
  assert.deepEqual([blocks[0].block, blocks[0].pages, blocks[0].shared], ['block-9', 2, true])
})

test('form kinds from their fields; one form per block and kind', () => {
  const f = (...fields) => ({ fields: fields.map(([tag, type, name]) => ({ tag, type, name })) })
  assert.equal(formKind(f(['input', 'text', 'username'], ['input', 'password', 'password'])), 'login')
  assert.equal(formKind(f(['input', 'email', 'email'], ['input', 'submit', null])), 'newsletter')
  assert.equal(formKind(f(['input', 'text', 'name'], ['textarea', 'textarea', 'message'])), 'contact')
  assert.equal(formKind(f(['input', 'search', 'q'])), 'search')
  const form = {
    block: 'module-5',
    id: 'form-1',
    region: 'footer',
    fields: [{ tag: 'input', type: 'email', name: 'email' }]
  }
  const reads = [
    { pageId: 'page-home', slug: 'home', forms: [form] },
    { pageId: 'page-about', slug: 'about', forms: [{ ...form, id: 'form-2' }] }
  ]
  assert.deepEqual(buildForms(reads, { idOf }), [
    { block: 'block-5', kind: 'newsletter', placement: 'footer', pages: 2, fields: 1 }
  ])
})

test('footer columns: a heading naming a listing holds its items; page names hold pages; else an error', () => {
  const reads = [
    {
      pageId: 'page-home',
      slug: 'home',
      navGroups: [
        {
          block: 'module-3',
          heading: 'Lessons',
          links: [{ label: 'Morning swim', href: '/lessons/morning' }]
        },
        {
          block: 'module-4',
          heading: 'Studio',
          links: [
            { label: 'About', href: '#' },
            { label: 'Lesson', href: '#' }
          ]
        },
        {
          block: 'module-6',
          heading: 'More',
          links: [
            { label: 'X', href: '#' },
            { label: 'Y', href: '#' }
          ]
        }
      ]
    }
  ]
  const { navigationGroups: g, errors } = buildNavigationGroups(reads, {
    listingTitles: new Map([['lessons', 'page-lessons']]),
    menuLabels: new Set(['home', 'about', 'lessons']),
    idOf
  })
  assert.deepEqual(
    g.map((x) => [x.block, x.holds, x.itemsOf ?? null]),
    [
      ['block-3', 'offerings', 'page-lessons'],
      ['block-4', 'pages', null],
      ['block-6', null, null]
    ]
  )
  assert.equal(g[1].links[0].leadsNowhere, true)
  assert.equal(errors.length, 1)
})

test('system pages: legal pages by name, the not-found answer, the plainest article page', () => {
  const pages = [
    {
      pageId: 'page-privacy-policy',
      path: '/privacy-policy',
      title: 'Privacy',
      bodyClass: 'view-article',
      blockCount: 3
    },
    { pageId: 'page-news_one', path: '/news/one', title: 'One', bodyClass: 'view-article', blockCount: 5 },
    { pageId: 'page-home', path: '/', title: 'Home', bodyClass: 'view-featured', blockCount: 9 }
  ]
  assert.deepEqual(legalPagesOf(pages), ['page-privacy-policy'])
  assert.deepEqual(articleLayoutOf(pages), { pageId: 'page-privacy-policy', candidates: 2 })
  const { systemPages, errors } = buildSystemPages({
    pages,
    notFound: {
      status: 404,
      read: {
        h1s: [{ text: 'Lost?' }],
        texts: ['Page not found'],
        links: [{ label: 'Home', href: '/' }],
        hasHeader: true
      }
    }
  })
  assert.deepEqual(errors, [])
  assert.deepEqual(
    systemPages.notFound.slots.map((s) => s.kind),
    ['heading', 'message', 'link']
  )
  assert.equal(buildSystemPages({ pages: [], notFound: null }).errors.length, 2)
})

test('a not-found link the template prints as a full address of the site is kept as its site path', () => {
  const { systemPages } = buildSystemPages({
    pages: [],
    notFound: {
      status: 404,
      siteUrl: 'http://stand.example:8080',
      read: {
        links: [
          { label: 'Read the journal', href: 'http://stand.example:8080/pages/blog?x=1#top' },
          { label: 'Home', href: '/index.php' },
          { label: 'Elsewhere', href: 'https://other.example/pages/blog' }
        ]
      }
    }
  })
  assert.deepEqual(
    systemPages.notFound.slots.map((s) => s.target),
    ['/pages/blog?x=1#top', '/index.php', 'https://other.example/pages/blog']
  )
})

test('link actions', () => {
  const ctx = { itemPaths: new Set(['/lessons/morning']), contactPaths: new Set(['/contact']) }
  assert.equal(
    linkAction({ label: 'Book now', target: '/contact', role: 'contact.cta_url' }, ctx),
    'primary-cta'
  )
  assert.equal(linkAction({ label: 'Call', target: 'tel:5550102030' }, ctx), 'contact')
  assert.equal(linkAction({ label: 'Contact', target: '/contact' }, ctx), 'contact')
  assert.equal(
    linkAction({ label: 'Facebook', target: 'https://www.facebook.com/example' }, ctx),
    'external-profile'
  )
  assert.equal(linkAction({ label: 'Morning swim', target: '/lessons/morning' }, ctx), 'go-to-item')
  assert.equal(linkAction({ label: 'Next', target: '/lessons?start=6' }, ctx), 'page-control')
  assert.equal(linkAction({ label: 'Send', submit: true }, ctx), 'submit-form')
  assert.equal(linkAction({ label: 'About', target: '/about' }, ctx), 'navigation')
})

test('list holds: the business profiles, a person profiles, or nothing social', () => {
  const social = { rowSlots: [{ role: 'contact.social_label' }, { role: 'contact.social_url' }] }
  assert.equal(listHolds(social), 'socialProfiles')
  assert.equal(listHolds(social, { blockRoles: ['person.name'] }), 'personSocials')
  assert.equal(
    listHolds({ rowSlots: [] }, { rowLinks: ['https://instagram.com/a', 'https://x.com/a'] }),
    'socialProfiles'
  )
  assert.equal(listHolds({ rowSlots: [{ role: 'offering.name' }] }), null)
})

test('h1 source: page heading, menu setting, content slot, template, or none with the title shown instead', () => {
  const h1 = (text, more = {}) => [{ text, shown: true, ...more }]
  const menu = { title: 'Lessons', params: { page_heading: '', page_subheading: 'Our lessons' } }
  assert.equal(h1Source({ h1s: h1('Lessons', { inPageHeader: true }), menu }).via, 'page-heading')
  assert.deepEqual(h1Source({ h1s: h1('Our lessons'), menu }).param, 'page_subheading')
  const slotOf = (t) => (t === 'Swim with us' ? { id: 'block-2.1' } : null)
  assert.deepEqual(h1Source({ h1s: h1('Swim with us'), slotOf }), {
    via: 'content-slot',
    slot: 'block-2.1',
    text: 'Swim with us'
  })
  assert.equal(h1Source({ h1s: h1('Welcome') }).via, 'template')
  const none = h1Source({ h1s: [], menu, titleShownAs: { tag: 'h2', text: 'LESSONS' } })
  assert.deepEqual([none.via, none.pageHeadingAvailable, none.titleShownAs.tag], [null, true, 'h2'])
  assert.equal(h1Source({ h1s: [...h1('A'), ...h1('B')] }).via, null)
})

test('navigation groups: every menu block of the map, joined with what its column holds', () => {
  const item = (id, text, max, target) => ({
    item: id,
    level: 1,
    parent: null,
    type: target.kind === 'heading' ? 'heading' : 'component',
    label: { slot: `${id}.0`, text, maxCharacters: max, limitFrom: 'slot-fit' },
    target
  })
  const map = {
    menuBlocks: {
      'module-3': {
        block: 'module-3',
        menu: 'lessons-menu',
        titleSlot: 'module-3.0',
        startLevel: 1,
        endLevel: 0,
        orderFrom: 'item-id',
        items: [
          item('menuItem-20', 'Jump Rope', 12, {
            kind: 'page',
            page: 'menuItem-20',
            alive: true,
            status: 200
          }),
          item('menuItem-21', 'Old Lesson', null, { kind: 'alias', path: '/gone', alive: false, status: 404 })
        ]
      },
      'module-8': {
        block: 'module-8',
        menu: 'top',
        startLevel: 1,
        endLevel: 2,
        orderFrom: 'ordering',
        items: [item('menuItem-1', 'Home', 6, { kind: 'page', page: 'menuItem-1', alive: true, status: 200 })]
      }
    }
  }
  const read = [
    {
      id: 'footer-1',
      block: 'block-3',
      heading: 'Lessons',
      holds: 'offerings',
      itemsOf: 'page-lessons',
      links: []
    },
    { id: 'footer-2', block: 'block-6', heading: 'More', holds: null, links: [] }
  ]
  const { navigationGroups: g, errors } = menuNavigationGroups(map, read)
  assert.deepEqual(
    g.map((x) => [x.id, x.from, x.holds, x.itemsOf ?? null, x.items?.length ?? null]),
    [
      ['nav-block-3', 'menu', 'offerings', 'page-lessons', 2],
      ['nav-block-8', 'menu', null, null, 1],
      ['footer-2', 'page', null, null, null]
    ]
  )
  assert.match(g[0].orderNote, /stand-in/)
  assert.equal(g[1].orderNote, undefined)
  assert.deepEqual(g[0].items[1].target, { kind: 'alias', path: '/gone' })
  assert.equal(g[0].items[1].alive, false)
  assert.equal(g[0].titleSlot, 'block-3.0')
  assert.deepEqual(
    errors.map((e) => e.field),
    ['site.navigationGroups[nav-block-3].items[1].maxCharacters']
  )
  assert.equal(menuNavigationGroups({}, read).errors[0].field, 'site.navigationGroups')
})

test('a page title reading keeps the block that printed it and whether it is hidden from the eye', () => {
  const read = h1Source({
    h1s: [{ text: 'Swim with us', block: 'block-9', clipped: true }],
    slotOf: () => ({ id: 'block-4.0' })
  })
  assert.equal(read.block, 'block-9')
  assert.equal(read.clipped, true)
  assert.equal(h1Source({ h1s: [{ text: 'Welcome' }] }).block, undefined)
})

test('a footer column of social profile links holds the social profiles; an article view without a body class', () => {
  const reads = [
    {
      pageId: 'page-home',
      slug: 'home',
      navGroups: [
        {
          block: 'module-7',
          heading: null,
          links: [
            { label: 'FACEBOOK', href: 'https://www.facebook.com/demo' },
            { label: 'PINTEREST', href: 'https://www.pinterest.com/demo/' }
          ]
        }
      ]
    }
  ]
  const { navigationGroups: g, errors } = buildNavigationGroups(reads, {
    listingTitles: new Map(),
    menuLabels: new Set(['home']),
    idOf
  })
  assert.deepEqual([g[0].holds, errors.length], ['socialProfiles', 0])
  const pages = [
    { pageId: 'page-blog', path: '/blog', bodyClass: '', articleView: false, blockCount: 3 },
    { pageId: 'page-about', path: '/about', bodyClass: '', articleView: true, blockCount: 4 }
  ]
  assert.equal(articleLayoutOf(pages).pageId, 'page-about')
})

test("footer columns: links that lead to the site's own pages hold pages, whatever their words", () => {
  const reads = [
    { pageId: 'page-home', slug: 'home', path: '/' },
    { pageId: 'page-careers', slug: 'careers', path: '/careers' },
    { pageId: 'page-privacy', slug: 'privacy', path: '/privacy-policy' },
    {
      pageId: 'page-press',
      slug: 'press',
      path: '/press',
      navGroups: [
        {
          block: 'module-7',
          heading: 'Company',
          links: [
            { label: 'Join the crew', href: '/index.php/careers' },
            { label: 'In the news', href: 'http://pool.example/index.php/press/' },
            { label: 'Our story', href: '#' }
          ]
        },
        {
          block: 'module-8',
          heading: null,
          links: [
            { label: 'Privacy', href: '/privacy-policy?lang=en' },
            { label: 'Elsewhere', href: 'https://other.example/x' },
            { label: 'Nowhere', href: '#' }
          ]
        }
      ]
    }
  ]
  const { navigationGroups: g, errors } = buildNavigationGroups(reads, {
    listingTitles: new Map(),
    menuLabels: new Set(['home', 'about']),
    idOf
  })
  assert.deepEqual(
    g.map((x) => [x.block, x.holds]),
    [
      ['block-7', 'pages'],
      ['block-8', null]
    ]
  )
  assert.equal(errors.length, 1)
})
