// Defects the JA Vega, Impact, Morgan and Nova EmDash ports hit in the kit tool, one case each (B to I; A, the bracketed
// stamp key, is in the theme's tests/stamps.test.mjs), and a guard that a Joomla or WordPress kit reads as before.
// Fabricated studio, no browser: the page readers run on a synthetic DOM.
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { test } from 'node:test'
import { parseHTML } from 'linkedom'
import { carryMeasured, emdashContentMapOf } from '../content-coverage/lib/emdash-content-map.mjs'
import { canonicalPath, setUrlStyle } from '../template-kit/lib/kit-paths.mjs'
import { keepRows } from '../template-kit/lib/measure-min.mjs'
import { linkLabelSlots } from '../template-kit/lib/link-label-slots.mjs'
import { fixedLinkLabels, linkLabelChecks } from '../template-kit/lib/link-label-reasons.mjs'
import { settlePageTitles } from '../template-kit/lib/page-titles.mjs'
import { readDetails } from '../template-kit/lib/read-details.js'
import { matchRepeat } from '../template-kit/lib/rows.mjs'
import { withEmdashPages } from '../template-kit/lib/site/adapters/emdash-map.mjs'

const SITE = 'http://studio.example.test'

const plain = (fn) => () => {
  setUrlStyle('plain')
  try {
    fn()
  } finally {
    setUrlStyle('index-php')
  }
}

test(
  'B: an EmDash pager address keeps its page number; page 1 is the list',
  plain(() => {
    assert.equal(canonicalPath('/blog?page=2', SITE), '/blog?page=2')
    assert.equal(canonicalPath('/blog?page=1', SITE), '/blog')
    assert.equal(canonicalPath('/blog?page=x', SITE), '/blog')
    assert.equal(canonicalPath('/blog?start=6', SITE), '/blog?start=6')
  })
)

test('B: Joomla and WordPress read every query as before, `?page=N` included', () => {
  assert.equal(canonicalPath('/post?page=2', SITE), '/post')
  assert.equal(canonicalPath('/index.php/blog?start=6', SITE), '/blog?start=6')
  assert.equal(canonicalPath('/blog?limitstart=12', SITE), '/blog?start=12')
  assert.equal(canonicalPath('/blog?paged=2', SITE), '/blog')
  assert.equal(canonicalPath('/?p=3', SITE), '/')
})

test(
  'B: the "2" pager link of an EmDash list is a pagination control once its page is a kit page',
  plain(() => {
    const kit = {
      pages: [
        { id: 'page-blog', path: '/blog', blocks: ['body-blog'] },
        { id: 'page-blog-2', path: '/blog?page=2', blocks: ['body-blog'] }
      ],
      blocks: [{ id: 'body-blog', links: [{ id: 'body-blog.link-1', label: '2', target: '/blog?page=2' }] }],
      checks: {},
      errors: []
    }
    fixedLinkLabels(kit)
    assert.equal(kit.blocks[0].links[0].fixedLabel?.rule, 'pagination')
  })
)

const slot = (key, entity, sample, extra = {}) => ({
  key,
  entity,
  type: 'text',
  role: 'cta.button_label',
  sample,
  ...extra
})

test('C and D: words two slots share name the slot the stamps also place in the link’s own block', () => {
  const map = {
    slots: [
      slot('chrome.chrome.cta', 'block-home-hero', 'Get a quote', { alsoIn: ['header'] }),
      slot('pages.contact.cta', 'block-contact-form', 'Get a quote')
    ]
  }
  const kit = () => ({
    blocks: [
      {
        id: 'header',
        source: { entity: 'header', contains: [] },
        links: [{ id: 'header.link-1', label: 'Get a quote', target: '/contact' }]
      }
    ]
  })
  const k = kit()
  linkLabelSlots(k, map)
  assert.equal(k.blocks[0].links[0].labelId, 'chrome.chrome.cta')
  // Without `alsoIn` the two slots tie and the link names none (a coincidence of words), as before.
  const plain = kit()
  linkLabelSlots(plain, { slots: map.slots.map(({ alsoIn: _a, ...s }) => s) })
  assert.equal(plain.blocks[0].links[0].labelId, undefined)
})

const TERM_MAP = {
  entities: [{ key: 'taxonomy.category', kind: 'taxonomy', identity: { taxonomy: 'category' } }],
  slots: [
    {
      key: 'taxonomy.category.blogs',
      entity: 'taxonomy.category',
      type: 'term',
      sample: 'Blogs',
      target: { taxonomy: 'category', term: 'blogs' }
    },
    {
      key: 'taxonomy.tag.business',
      entity: 'taxonomy.tag',
      type: 'term',
      sample: 'Business',
      target: { taxonomy: 'tag', term: 'business' }
    },
    slot('services.design.title', 'services.design', 'Blogs', { role: 'editorial.heading' })
  ],
  itemPages: { 'taxonomy.category.blogs': { path: '/category-blog' } },
  pages: []
}

test('E: a link to the page the map gives a taxonomy term is a term link, whatever its path', () => {
  const kit = (target) => ({
    pages: [],
    blocks: [{ id: 'body-home', links: [{ id: 'body-home.link-1', label: 'Blogs', target }] }],
    checks: {},
    errors: []
  })
  const k = kit('/category-blog')
  fixedLinkLabels(k, TERM_MAP)
  assert.equal(k.blocks[0].links[0].fixedLabel?.rule, 'taxonomy-term')
  assert.equal(linkLabelChecks({ kit: k, errors: [] }), 0)
  // A path that is no term's page, and a run with no map, stay as they were.
  const other = kit('/about')
  fixedLinkLabels(other, TERM_MAP)
  assert.equal(other.blocks[0].links[0].fixedLabel, undefined)
  const nomap = kit('/category-blog')
  fixedLinkLabels(nomap)
  assert.equal(nomap.blocks[0].links[0].fixedLabel, undefined)
})

test('E: a term archive printing its term as h1 is titled by the term slot, via taxonomy-term', () => {
  const page = (id, path) => ({
    id,
    path,
    blocks: { 1440: ['body-tag'] },
    h1: { via: 'template', text: 'Business', block: 'body-tag' }
  })
  const kit = {
    pages: [page('page-tag-business', '/tag/business'), page('page-tag-business-2', '/tag/business?start=7')],
    blocks: [{ id: 'body-tag', slots: [] }],
    errors: [],
    checks: {},
    site: {}
  }
  settlePageTitles(kit, { map: TERM_MAP })
  assert.deepEqual(
    kit.pages.map((p) => [p.titleSlot, p.titleVia]),
    [
      ['taxonomy.tag.business', 'taxonomy-term'],
      ['taxonomy.tag.business', 'taxonomy-term']
    ]
  )
})

test('E: a term’s own page is titled by the term slot even when a card of its block prints the same words', () => {
  const kit = {
    pages: [
      {
        id: 'page-category-blog',
        path: '/category-blog',
        blocks: { 1440: ['body-cat'] },
        h1: { via: 'template', text: 'Blogs', block: 'body-cat' }
      }
    ],
    blocks: [{ id: 'body-cat', slots: [{ id: 'services.design.title', type: 'text', sample: 'Blogs' }] }],
    errors: [],
    checks: {},
    site: {}
  }
  settlePageTitles(kit, { map: TERM_MAP })
  assert.equal(kit.pages[0].titleSlot, 'taxonomy.category.blogs')
  assert.equal(kit.pages[0].titleVia, 'taxonomy-term')
})

test('E: a category and a tag both named Business: only the term of the page’s path is its title', () => {
  const term = (taxonomy) => ({
    key: `taxonomy.${taxonomy}.business`,
    entity: `taxonomy.${taxonomy}`,
    type: 'term',
    sample: 'Business',
    target: { taxonomy, term: 'business' }
  })
  const map = {
    entities: [],
    slots: [
      term('category'),
      term('tag'),
      slot('posts.card.title', 'posts.card', 'Business', { role: 'editorial.heading' })
    ],
    itemPages: { 'taxonomy.category.business': { path: '/category/business' } },
    pages: []
  }
  const kit = (path) => ({
    pages: [
      {
        id: 'page-x',
        path,
        blocks: { 1440: ['body-cat'] },
        h1: { via: 'template', text: 'Business', block: 'body-cat' }
      }
    ],
    blocks: [{ id: 'body-cat', slots: [{ id: 'posts.card.title', type: 'text', sample: 'Business' }] }],
    errors: [],
    checks: {},
    site: {}
  })
  const mapped = kit('/category/business')
  settlePageTitles(mapped, { map })
  assert.equal(mapped.pages[0].titleSlot, 'taxonomy.category.business')
  // Unmapped: the path names the taxonomy and the term.
  const unmapped = kit('/tag/business')
  settlePageTitles(unmapped, { map: { ...map, itemPages: {} } })
  assert.equal(unmapped.pages[0].titleSlot, 'taxonomy.tag.business')
})

test('G: two hero slides printing one h1 text: the first slide’s slot is the title', () => {
  const map = {
    entities: [],
    slots: [
      slot('pages.home.slides[0].title', 'pages.home', 'We build', { role: 'editorial.heading' }),
      slot('pages.home.slides[1].title', 'pages.home', 'We build', { role: 'editorial.heading' })
    ],
    pages: [{ entity: 'pages.home', route: 'home', openAs: '/' }]
  }
  const kit = {
    pages: [
      {
        id: 'page-home',
        path: '/',
        blocks: { 1440: ['block-hero'] },
        h1: { via: 'template', text: 'We build', block: 'block-hero' }
      }
    ],
    blocks: [
      { id: 'block-hero', slots: map.slots.map((s) => ({ id: s.key, type: 'text', sample: s.sample })) }
    ],
    errors: [],
    checks: {},
    site: {}
  }
  settlePageTitles(kit, { map })
  assert.equal(kit.pages[0].titleSlot, 'pages.home.slides[0].title')
  // Two different slots that are no rows of one list still tie.
  const tie = structuredClone(kit)
  tie.blocks[0].slots[1].id = 'pages.home.other'
  settlePageTitles(tie, {
    map: { ...map, slots: [map.slots[0], { ...map.slots[1], key: 'pages.home.other' }] }
  })
  assert.equal(tie.pages[0].titleSlot, null)
})

const SEED = (subSource) => ({
  seed: {
    defaultLocale: 'en',
    settings: {},
    collections: [
      {
        slug: 'features_intro',
        fields: [
          {
            slug: 'items',
            type: 'repeater',
            validation: {
              subFields: [
                { slug: 'link_title', type: 'string' },
                { slug: 'btn_link_2', type: 'string' },
                { slug: 'link_url', type: 'string' }
              ]
            }
          }
        ]
      }
    ],
    content: {
      features_intro: [
        { slug: 'home', data: { items: [{ link_title: 'Learn more', btn_link_2: '/a', link_url: '/b' }] } }
      ]
    }
  },
  fieldMap: { roleVocabularyVersion: 2, fields: subSource },
  template: 't',
  version: '1'
})

test('F: a repeater sub-field named link_title is text, btn_link_2 an address; the field map’s declared source wins', () => {
  const types = (map) =>
    Object.fromEntries(
      map.slots.filter((s) => /items\[0\]/.test(s.key)).map((s) => [s.key.split('.').pop(), s.type])
    )
  const t = types(emdashContentMapOf(SEED({})))
  assert.equal(t.link_title, 'text')
  assert.equal(t.btn_link_2, 'url')
  assert.equal(t.link_url, 'url')
  const declared = types(emdashContentMapOf(SEED({ 'features_intro.items.link_url': { source: 'text' } })))
  assert.equal(declared.link_url, 'text')
})

test('H: --write carries fit, customize, slotFitVersion and fitGroups over for unchanged slots only', () => {
  const s = (key, sample, extra = {}) => ({ key, type: 'text', sample, ...extra })
  const previous = {
    slotFitVersion: 'slot-fit/1',
    fitGroups: { 'a.row': { items: 2 }, 'b.row': { items: 1 } },
    slots: [
      s('a.1', 'one', { fit: { maxChars: 9 }, customize: 'keep', group: { id: 'a.row.0', item: 0 } }),
      s('a.2', 'two', { fit: { maxChars: 5 }, group: { id: 'a.row.1', item: 1 } }),
      s('b.1', 'old words', { fit: { maxChars: 7 }, group: { id: 'b.row.0' } })
    ]
  }
  const built = {
    slots: [
      s('a.1', 'one', { group: { id: 'a.row.0', item: 0 } }),
      s('a.2', 'two', { group: { id: 'a.row.1', item: 1 } }),
      s('b.1', 'new words', { group: { id: 'b.row.0' } }),
      s('c.1', 'fresh')
    ]
  }
  const { map, kept } = carryMeasured(previous, built)
  assert.equal(kept, 2)
  assert.deepEqual(map.slots[0].fit, { maxChars: 9 })
  assert.equal(map.slots[0].customize, 'keep')
  assert.equal(map.slots[2].fit, undefined, 'a slot whose sample changed is measured again')
  assert.equal(map.slotFitVersion, 'slot-fit/1')
  assert.deepEqual(Object.keys(map.fitGroups), ['a.row'])
  assert.equal(carryMeasured(null, built).kept, 0)
  // A row removed from a group: its measured bounds (`items: 2`) are stale and are not carried.
  const fewer = { slots: [s('a.1', 'one', { group: { id: 'a.row.0', item: 0 } })] }
  const was = {
    slotFitVersion: 'slot-fit/1',
    fitGroups: { 'a.row': { items: 2, max: 2 } },
    slots: [
      s('a.1', 'one', { fit: { maxChars: 9 }, group: { id: 'a.row.0', item: 0 } }),
      s('a.2', 'two', { fit: { maxChars: 9 }, group: { id: 'a.row.1', item: 1 } })
    ]
  }
  assert.equal(carryMeasured(was, fewer).map.fitGroups, undefined)
})

test('D: a stamp in several blocks keeps every one of them as the slot’s alsoIn; the owner stays the first', () => {
  const stamp = (collection, slug, field) => ({ collection, slug, kind: 'field', field })
  const part = (selector, stamps, extra = {}) => ({
    selector,
    tag: 'section',
    classes: ['x'],
    height: 100,
    hasHeaderTag: false,
    isFooter: false,
    shown: true,
    headings: [],
    stamps,
    ...extra
  })
  const map = {
    entities: [
      { key: 'pages.home', kind: 'entry', identity: {} },
      { key: 'chrome.chrome', kind: 'entry', identity: {} }
    ],
    pages: [{ entity: 'pages.home', route: '/', openAs: '/', title: 'Home' }],
    slots: [
      slot('pages.home.title', 'pages.home', 'Home', { target: { field: 'title' } }),
      slot('chrome.chrome.donate_label', 'chrome.chrome', 'Donate', { target: { field: 'donate_label' } })
    ]
  }
  const header = part('body > header', [stamp('chrome', 'chrome', 'donate_label')], {
    hasHeaderTag: true,
    tag: 'header'
  })
  const sections = {
    '/': {
      before: [header],
      main: [
        part('main > section.hero', [
          stamp('pages', 'home', 'title'),
          stamp('chrome', 'chrome', 'donate_label')
        ])
      ],
      after: []
    }
  }
  const out = withEmdashPages(map, sections)
  const donate = out.slots.find((s) => s.key === 'chrome.chrome.donate_label')
  assert.notEqual(donate.entity, 'header')
  assert.deepEqual(donate.alsoIn, ['header'])
  assert.equal(out.slots.find((s) => s.key === 'pages.home.title').alsoIn, undefined)
})

// A row set read on a synthetic DOM: every element gets a 200x120 box.
function read(html) {
  const { document, window } = parseHTML(`<html><body>${html}</body></html>`)
  const box = { left: 0, top: 0, width: 200, height: 120, right: 200, bottom: 120 }
  for (const el of document.querySelectorAll('*')) {
    el.getBoundingClientRect = () => box
    el.getClientRects = () => [box]
    el.checkVisibility = () => true
  }
  Object.assign(window, { scrollX: 0, scrollY: 0, innerWidth: 1440 })
  const style = new Proxy(
    {
      backgroundImage: 'none',
      backgroundColor: 'rgba(0,0,0,0)',
      content: 'none',
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      position: 'static'
    },
    { get: (o, k) => o[k] ?? '0px' }
  )
  const ctx = vm.createContext({
    window,
    document,
    URL,
    location: { href: 'https://site.example/' },
    getComputedStyle: () => style,
    CSS: { escape: (s) => s },
    scrollY: 0
  })
  return JSON.parse(JSON.stringify(vm.runInContext(`(${readDetails.toString()})()`, ctx)))
}
const li = (cls, attrs = '') => `<li class="${cls}"${attrs}><h3>x</h3><p>y</p></li>`

test('I: a numbered modifier class does not split the row shape', () => {
  const d = read(
    `<div data-kit-block="b"><ul>${[1, 2, 3, 4].map((n) => li(`vg-chip vg-chip-${n}`)).join('')}</ul></div>`
  )
  const set = d.b.repeats.find((r) => r.count > 1)
  assert.equal(set.count, 4)
  assert.equal(set.shape, 'LI.vg-chip')
})

test('I: a carousel’s hidden copies are no rows; hidden rows outside a slider still count', () => {
  const cards = [1, 2, 3].map((n) => li(`card c${n}`.replace(/ c\d/, ''))).join('')
  const clones = [1, 2, 3].map(() => li('card', ' aria-hidden="true"')).join('')
  const slider = read(`<div data-kit-block="b"><div class="swiper"><ul>${cards}${clones}</ul></div></div>`)
  assert.equal(slider.b.repeats.find((r) => r.count > 1).count, 3)
  const plain = read(`<div data-kit-block="b"><ul>${cards}${clones}</ul></div>`)
  assert.equal(plain.b.repeats.find((r) => r.count > 1).count, 6)
})

test('I: a slider showing a whole multiple of the declared rows matches that list on EmDash only, and only when no set has exactly its rows', () => {
  const set = (path, count, extra = {}) => ({ path, count, nested: false, shownCount: count, ...extra })
  const emdash = { clones: true }
  assert.equal(matchRepeat([set([0], 18, { inSlider: true })], 6, new Set(), emdash)?.count, 18)
  assert.equal(matchRepeat([set([0], 18, { inSlider: true }), set([1], 6)], 6, new Set(), emdash)?.count, 6)
  assert.equal(
    matchRepeat([set([0], 18)], 6, new Set(), emdash),
    null,
    'outside a slider a multiple is no match'
  )
  assert.equal(matchRepeat([set([0], 7, { inSlider: true })], 6, new Set(), emdash), null)
  // Guard: a Joomla- or WordPress-shaped slider with 2x the declared rows still does not match.
  assert.equal(matchRepeat([set([0], 12, { inSlider: true })], 6), null)
  assert.equal(matchRepeat([set([0], 12, { inSlider: true })], 6, new Set(), { clones: false }), null)
})

function keep(html, arg) {
  const details = read(html)
  const set = details.b.repeats.find((r) => r.count > 0)
  const { document, window } = parseHTML(`<html><body>${html}</body></html>`)
  const box = { left: 0, top: 0, width: 200, height: 120, right: 200, bottom: 120 }
  for (const el of document.querySelectorAll('*')) {
    el.getBoundingClientRect = () => box
    el.getClientRects = () => [box]
  }
  Object.assign(window, { scrollX: 0, scrollY: 0 })
  const ctx = vm.createContext({ window, document })
  const out = vm.runInContext(
    `(${keepRows.toString()})(${JSON.stringify({ block: 'b', path: set.path, shape: set.shape, ...arg })})`,
    ctx
  )
  return { set, out }
}

test('I: keepRows finds the rows the reader counted: numbered modifiers and a slider’s hidden copies', () => {
  const chips = keep(
    `<div data-kit-block="b"><ul>${[1, 2, 3].map((n) => li(`vg-chip vg-chip-${n}`)).join('')}</ul></div>`,
    { keep: 2 }
  )
  assert.equal(chips.set.count, 3)
  assert.equal(chips.out.total, 3)
  const cards = [1, 2].map(() => li('card')).join('')
  const clones = [1, 2].map(() => li('card', ' aria-hidden="true"')).join('')
  const slider = keep(`<div data-kit-block="b"><div class="swiper"><ul>${cards}${clones}</ul></div></div>`, {
    keep: 2
  })
  assert.equal(slider.set.count, 2)
  assert.equal(slider.out.total, 2)
})
