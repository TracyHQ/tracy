// Shown words told from content, links told by what they do, row lists with their icons, and items lists with
// their card fields. Fabricated data only.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { chromium } from '@playwright/test'

import { addIconSlots } from '../template-kit/lib/icon-slots.mjs'
import { shownLinks } from '../template-kit/lib/kit-blocks.mjs'
import { listingListKeys } from '../template-kit/lib/kit-item-lists.mjs'
import { itemsListChecks } from '../template-kit/lib/kit.mjs'
import { pathOfRoute } from '../template-kit/lib/kit-paths.mjs'
import { judgeWords } from '../template-kit/lib/measure-words-links.mjs'
import { readDetails } from '../template-kit/lib/read-details.js'
import { readLinkIcons } from '../template-kit/lib/read-words-links.js'
import { sampleIndex, wordsInOrder } from '../template-kit/lib/sample-index.mjs'
import { matchCmsStrings, shortPattern } from '../template-kit/lib/site/cms-strings.mjs'
import { linkAction, networkOf } from '../template-kit/lib/site/helpers.mjs'
import { withEmptyOverride } from '../template-kit/lib/site/hide-cms-text.mjs'

const MAP = {
  slots: [
    {
      key: 'article-1.0',
      type: 'text',
      role: 'editorial.paragraph',
      sample:
        'Quisque varius lorem ut nibh tempor, sed facilisis arcu congue. Morbi at mauris nec nunc dictum.'
    },
    {
      key: 'module-5.0',
      type: 'text',
      role: 'stat.label',
      sample: 'Train with over ((span))200((/span)) happy members'
    },
    { key: 'module-6.0', type: 'text', role: 'editorial.heading', sample: 'Meet our ' },
    { key: 'module-6.1', type: 'text', role: 'editorial.heading', sample: ' coaches of the season' }
  ]
}

test('demo copy is content: cut short, split by markup, a hole where a link was, or slots run together', () => {
  const s = sampleIndex(MAP)
  assert.equal(s.slotOf('quisque varius lorem ut nibh tempor, sed facilisis arcu…')?.key, 'article-1.0')
  assert.equal(s.slotOf('train with over happy members')?.key, 'module-5.0')
  assert.equal(s.slotOf('quisque varius lorem ut tempor, sed facilisis arcu congue.')?.key, 'article-1.0')
  assert.ok(s.slotOf('meet our coaches of the season'), 'two slots printed by one element')
  assert.equal(s.slotOf('remember me'), null, 'template words are no slot')
  assert.equal(wordsInOrder('quisque morbi', 'quisque varius morbi'), false, 'too few words to say')
  // One word of one sample and a number ("Harbour" is a menu item; "Harbour 2.4.1" a release in a news feed) says
  // nothing about where the words came from.
  const one = sampleIndex({ slots: [...MAP.slots, { key: 'menuItem-3.0', type: 'text', sample: 'Harbour' }] })
  assert.equal(one.slotOf('harbour 2.4.1'), null, 'one word and a number is no slot')
  assert.equal(one.slotOf('harbour')?.key, 'menuItem-3.0')
})

test('links: social profiles and ways to reach the business, even on a demo whose addresses are #', () => {
  assert.equal(
    linkAction({ label: 'Pinestone', target: null, role: 'contact.social_url' }),
    'external-profile'
  )
  assert.equal(
    linkAction({ label: '', target: '#', icon: { mechanism: 'font-icon', classes: 'fab fa-instagram' } }),
    'external-profile'
  )
  assert.equal(linkAction({ label: 'youtube', target: null }), 'external-profile')
  assert.equal(linkAction({ label: '(555) 010-2030', target: null }), 'contact')
  assert.equal(linkAction({ label: 'hello@example.test', target: null }), 'contact')
  assert.equal(linkAction({ label: 'Call', target: 'tel:+15550102030' }), 'contact')
  assert.equal(linkAction({ label: 'Next', target: null }), 'page-control')
  assert.equal(linkAction({ label: 'Facebook', target: '/about' }), 'navigation', 'a page of the site')
  assert.equal(networkOf({ icon: { classes: 'fa fa-telegram' } }), 'telegram')
})

test('short CMS strings name every constant with that value; the override empties them all', () => {
  assert.ok(shortPattern('Previous article: %s').test('previous article: a day at the gym'))
  assert.equal(shortPattern('%s'), null)
  const files = [
    { file: 'language/xx-XX/xx.ini', text: 'A_REMEMBER="Remember me"\nB_REMEMBER="Remember me"\n' }
  ]
  const r = matchCmsStrings({ lines: [{ block: 'block-1', text: 'Remember me', path: '/login' }], files })
  assert.deepEqual(r.fixedTexts[0].source, {
    file: 'language/xx-XX/xx.ini',
    constant: 'A_REMEMBER',
    short: true,
    constants: ['A_REMEMBER', 'B_REMEMBER']
  })
  assert.equal(
    withEmptyOverride('X="y"', ['A_REMEMBER', 'B_REMEMBER']),
    'X="y"\nA_REMEMBER=""\nB_REMEMBER=""\n'
  )
})

test('template words: a bare button is no pass, overlaps are no pass, nothing found is invalid', () => {
  const lay = (h, marks) => ({ block: { left: 0, top: 0, width: 100, height: h }, sets: [], marks })
  const m = (key, left, top) => ({ key, left, top, width: 50, height: 20 })
  assert.equal(judgeWords({ emptied: 0 }).canHide, null)
  assert.equal(judgeWords({ emptied: 1, bareControl: true }).canHide, false)
  assert.equal(
    judgeWords({
      emptied: 1,
      before: lay(80, [m('a', 0, 0), m('b', 0, 40)]),
      after: lay(60, [m('a', 0, 0), m('b', 0, 10)])
    }).canHide,
    false
  )
  assert.equal(
    judgeWords({
      emptied: 1,
      before: lay(80, [m('a', 0, 0), m('b', 0, 40)]),
      after: lay(60, [m('a', 0, 0), m('b', 0, 20)])
    }).canHide,
    true
  )
})

test('every row of a list gets its icon slot, and the list says how its icons are drawn', () => {
  const lists = [
    {
      id: 'block-7.social',
      rowSlots: [{ id: 'block-7.0' }, { id: 'block-7.2' }],
      rows: [
        { index: 0, slots: [{ id: 'block-7.0' }, { id: 'block-7.2' }] },
        { index: 1, slots: [{ id: 'block-7.1' }, { id: 'block-7.3' }] }
      ]
    }
  ]
  const links = [
    { id: 'block-7.2', icon: { mechanism: 'font-icon', classes: 'fa fa-facebook', network: 'facebook' } },
    { id: 'block-7.3', icon: { mechanism: 'font-icon', classes: 'fa fa-telegram', network: 'telegram' } }
  ]
  addIconSlots(lists, links, { from: 'fa fa-facebook', to: 'fa fa-telegram', glyphChanged: true })
  assert.deepEqual(
    lists[0].rows.map((r) => r.slots.at(-1).network),
    ['facebook', 'telegram']
  )
  assert.equal(lists[0].rowSlots.at(-1).type, 'icon')
  assert.equal(lists[0].iconMechanism.kind, 'font-icon')
  assert.equal(lists[0].iconMechanism.canChange, true)
  assert.equal(lists[0].rows[0].slots.at(-1).field, null)
})

test('an icon the content map holds in a slot of its own names that slot as its field', () => {
  const row = (i) => ({ index: i, slots: [{ id: `block-7.${i}` }, { id: `block-7.${i + 2}` }] })
  const lists = [{ id: 'block-7.social', rowSlots: [{ id: 'block-7.0' }], rows: [row(0), row(1)] }]
  const links = [
    {
      id: 'block-7.2',
      icon: { mechanism: 'font-icon', classes: 'font-icon fa fa-facebook', network: 'facebook' }
    },
    {
      id: 'block-7.3',
      icon: { mechanism: 'font-icon', classes: 'font-icon fa fa-telegram', network: 'telegram' }
    }
  ]
  // Fabricated map slots: the icon class of each row, in a module setting whose path names the icon.
  const mapSlots = [
    {
      key: 'module-7.5',
      role: 'editorial.item_icon',
      jsonPath: ['social', 'item[font-icon]', 1],
      sample: 'fa fa-telegram'
    },
    {
      key: 'module-7.4',
      role: 'editorial.item_icon',
      jsonPath: ['social', 'item[font-icon]', 0],
      sample: 'fa fa-facebook'
    },
    {
      key: 'module-7.0',
      role: 'contact.social_label',
      jsonPath: ['social', 'item[title]', 0],
      sample: 'Facebook'
    }
  ]
  addIconSlots(lists, links, null, mapSlots, (k) => k.replace('module-', 'block-'))
  assert.deepEqual(
    lists[0].rows.map((r) => r.slots.at(-1).field),
    ['block-7.4', 'block-7.5']
  )
  assert.match(lists[0].iconMechanism.fieldNote, /each row icon/)
})

test('items lists: a further result page takes page 1 card fields; one without any is counted', () => {
  const field = { field: 'title', kind: 'title', slots: [] }
  const blocks = [
    { id: 'body-news', lists: [{ id: 'news.items', rowKind: 'items', rowSlots: [field] }] },
    { id: 'body-news--start-6', lists: [{ id: 'body-news--start-6.items', rowKind: 'items', rowSlots: [] }] },
    { id: 'body-team', lists: [{ id: 'body-team.items', rowKind: 'items', rowSlots: [] }] }
  ]
  const pages = [
    { id: 'page-news' },
    { id: 'page-news--start-6', paginationOf: 'page-news' },
    { id: 'page-team' }
  ]
  const errors = []
  const checks = itemsListChecks({ pages, blocks, errors })
  assert.equal(blocks[1].lists[0].rowSlotsFrom, 'news.items')
  assert.deepEqual(checks, { itemsListsWithoutCardFields: 1 })
  assert.equal(errors[0].field, 'blocks[body-team].lists[body-team.items].rowSlots')
})

test('repeated links in one block (same words, same address) are each listed, keyed by position', async (t) => {
  // A fabricated person card: four icon links that all point to #, then a text link.
  const html = `<style>i{display:inline-block;width:16px;height:16px}i::before{content:'x'}</style>
    <div data-kit-block="card-1"><h3>Sam Doe</h3>
    <a href="#"><i class="fa fa-facebook"></i></a><a href="#"><i class="fa fa-twitter"></i></a>
    <a href="#"><i class="fa fa-instagram"></i></a><a href="#"><i class="fa fa-linkedin"></i></a>
    <a href="/team/sam">Profile</a><div data-kit-block="cta-2"><a href="/join">Join</a></div>
    <a aria-current="true" href="#">1</a></div>`
  let browser
  try {
    browser = await chromium.launch()
  } catch {
    return t.skip('no Chromium available')
  }
  try {
    const page = await browser.newPage()
    await page.setContent(html)
    const details = await page.evaluate(readDetails)
    assert.deepEqual(
      details['card-1'].links.map((l) => [l.position, l.href]),
      [
        [0, '#'],
        [1, '#'],
        [2, '#'],
        [3, '#'],
        [4, '/team/sam'],
        [5, '#']
      ]
    )
    const icons = await page.evaluate(readLinkIcons, { block: 'card-1' })
    // Both readings list the same links at the same positions: a nested block's link is its own, the current page
    // of a pagination is marked.
    assert.deepEqual(
      icons.links.map((l) => [l.position, l.href, !!l.current]),
      details['card-1'].links.map((l) => [l.position, l.href, !!l.current])
    )
    assert.equal(icons.links[5].current, true)
    assert.deepEqual(
      icons.links.slice(0, 4).map((l) => [l.position, l.icon?.classes]),
      [
        [0, 'fa fa-facebook'],
        [1, 'fa fa-twitter'],
        [2, 'fa fa-instagram'],
        [3, 'fa fa-linkedin']
      ]
    )
    assert.equal(icons.links[4].icon, null)
  } finally {
    await browser.close()
  }
})

test('shown links: the positional reading wins; an older label|href icon file still lends its icons', () => {
  const read = [
    { label: '', href: '#' },
    { label: '', href: '#' }
  ]
  const positional = [
    { position: 0, label: '', href: '#', icon: { classes: 'fa fa-x' } },
    { position: 1, label: '', href: '#', icon: { classes: 'fa fa-y' } }
  ]
  assert.equal(shownLinks(read, positional), positional)
  const old = shownLinks(read, { '|#': { classes: 'fa fa-x' } })
  assert.deepEqual(
    old.map((l) => [l.position, l.icon?.classes]),
    [
      [0, 'fa fa-x'],
      [1, 'fa fa-x']
    ]
  )
  assert.deepEqual(
    shownLinks(read, []).map((l) => l.icon),
    [null, null]
  )
})

test('a listing list with its own page path (an author page) attaches to that page, not to its route', () => {
  const map = {
    pages: [],
    itemLists: {
      'menuItem-5.items': { block: null, page: 'menuItem-5', source: { route: 'team/authors' } },
      'user-9.items': {
        block: null,
        page: null,
        pagePath: '/index.php/index.php/team/authors/author/Sam%20Doe',
        source: { kind: 'author', route: 'team/authors' }
      }
    }
  }
  assert.deepEqual(listingListKeys(map, '/team/authors', pathOfRoute), ['menuItem-5.items'])
  assert.deepEqual(listingListKeys(map, '/team/authors/author/sam doe', pathOfRoute), ['user-9.items'])
})
