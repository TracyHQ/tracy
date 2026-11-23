// The entries JA's masthead keeps per menu item (write-step/menu-item-entries.js), on the released JA Diner 1.0.8 contract: a
// kept page prints its own entry of `menuitem_config`, so its description and background take what was written for the
// default description and for another entry's background. Dev lat28 (22/11/2026): About, Bookings and Contact printed the
// template's description and banner photos. The plan and the claims are invented; no model, no site.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { entryPagesOf, menuItemEntryTwins, neededEntry } from '../src/write-step/menu-item-entries.js'

const CONTRACT = '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-diner/j6/1.0.8/'
const read = (file) => JSON.parse(readFileSync(new URL(CONTRACT + file, import.meta.url), 'utf8'))
const KIT = read('template-kit.json')
const MAP = read('content-map.json')

const keep = (id) => ({ id, decision: 'keep', blocks: [] })
const drop = (id) => ({ id, decision: 'drop' })
const PLAN = {
  sharedBlocks: [{ block: 'block-106', decision: 'keep' }],
  pages: [
    keep('page-home'),
    keep('page-about-us'),
    keep('page-reservation'),
    keep('page-contact-us'),
    drop('page-offers'),
    drop('page-our-blog')
  ]
}
const words = (slot, content) => ({ slot, owner: 'writer', file: 'site-copy.json', kind: 'text', content })
const picture = (slot) => ({
  slot,
  owner: 'picture',
  file: 'mapping.json',
  kind: 'image',
  content: `picture ${slot}`
})

test("each kept page's masthead entry takes the default description and a written background", () => {
  const claims = [
    // The writer wrote the default description; the picture step filled the offers page's background (entry 5).
    words('block-106.2', 'Emirati food in Jumeirah since 1997.'),
    picture('block-106.28'),
    // The titles of the kept pages, written through the measured title projection.
    words('block-106.9', 'About'),
    words('block-106.11', 'Bookings'),
    words('block-106.3', 'Arabian Tea House')
  ]
  const { twins, claims: made } = menuItemEntryTwins({ plan: PLAN, kit: KIT, contentMap: MAP, claims })
  // About is entry 6, Bookings entry 8, Contact entry 0 (their title slots say so); offers and the blog are dropped.
  assert.deepEqual(
    [...twins].sort(),
    [
      ['block-106.13', 'block-106.2'],
      ['block-106.19', 'block-106.2'],
      ['block-106.21', 'block-106.2'],
      ['block-106.23', 'block-106.28'],
      ['block-106.29', 'block-106.28'],
      ['block-106.31', 'block-106.28']
    ].sort()
  )
  const about = made.find((c) => c.slot === 'block-106.19')
  assert.deepEqual(about, { ...claims[0], slot: 'block-106.19' })
  assert.equal(made.find((c) => c.slot === 'block-106.29').kind, 'image')
  // Titles are each page's own and are never copied.
  assert.ok(![...twins.keys()].some((slot) => ['block-106.9', 'block-106.11', 'block-106.3'].includes(slot)))
})

test('an entry a file speaks for keeps its own value, and nothing is copied when nothing was written', () => {
  const claims = [
    words('block-106.2', 'Emirati food in Jumeirah since 1997.'),
    words('block-106.19', 'Our story, from the first kitchen.'),
    picture('block-106.29'),
    { slot: 'block-106.31', owner: 'plan', file: 'plan.json', kind: 'hide', content: '(hide)' }
  ]
  const { twins } = menuItemEntryTwins({ plan: PLAN, kit: KIT, contentMap: MAP, claims })
  assert.equal(twins.has('block-106.19'), false, 'the about entry keeps its own words')
  assert.equal(twins.has('block-106.29'), false, 'the about entry keeps its own picture')
  assert.equal(twins.has('block-106.31'), false, 'a hidden entry stays hidden')
  // The other kept pages take the about page's background, their own written entry first.
  assert.equal(twins.get('block-106.23'), 'block-106.29')
  assert.equal(twins.get('block-106.21'), 'block-106.2')
  assert.deepEqual(menuItemEntryTwins({ plan: PLAN, kit: KIT, contentMap: MAP, claims: [] }).twins, new Map())
})

test('each masthead entry prints on the page whose title is its entry, and an entry no page names prints nowhere', () => {
  const on = entryPagesOf({ kit: KIT, contentMap: MAP })
  assert.deepEqual(on['block-106.29'], ['page-about-us'], 'the about background, entry 6')
  assert.deepEqual(on['block-106.19'], ['page-about-us'], 'the about description, entry 6')
  assert.deepEqual(on['block-106.23'], ['page-contact-us'], 'the contact background, entry 0')
  assert.deepEqual(on['block-106.24'], [], 'the search background: no page of the kit has entry 1')
  assert.equal(on['block-106.2'], undefined, 'the default is no entry')
})

test('an entry frame left empty needs no picture when a twin fills it or no kept page prints it', () => {
  // Dev lat29 (23/11/2026): four masthead frames left empty blocked, two of them filled by twins, two of dropped pages.
  const { twins } = menuItemEntryTwins({
    plan: PLAN,
    kit: KIT,
    contentMap: MAP,
    claims: [words('block-106.2', 'Emirati food in Jumeirah since 1997.'), picture('block-106.31')]
  })
  const context = {
    twins,
    entryPages: entryPagesOf({ kit: KIT, contentMap: MAP }),
    kept: PLAN.pages.filter((p) => p.decision === 'keep').map((p) => p.id)
  }
  const empty = (slot) => ({ slot, owner: 'picture', reason: 'pictures: left without one' })
  assert.equal(neededEntry(empty('block-106.29'), context), false, 'the about entry takes the bookings photo')
  assert.equal(neededEntry(empty('block-106.26'), context), false, 'the login page is no kept page')
  assert.equal(neededEntry(empty('block-96.1'), context), true, 'a frame of no entry still needs its picture')
  assert.equal(neededEntry({ slot: 'block-106.26', owner: 'writer' }, context), true, 'only picture items')
})
