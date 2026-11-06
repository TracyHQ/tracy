// The slot role rule tables (ADR 0038): what a capture step calls to propose a role and a group for the slots of a new
// content map, from Node or, through the command line, from the Joomla capture in Python.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkContentMapRoles } from '../../packages/wo/website-opportunities/domain/content-map-roles.mjs'
import { proposeContentMapRoles } from '../slot-roles/rule-tables.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const CLI = path.join(ROOT, 'scripts/slot-roles/rule-tables.mjs')

// A fictional WordPress theme's content map: a tea room with two menu cards, a quote and an about heading.
const wordpressMap = () => ({
  schemaVersion: 1,
  slots: [
    { key: 'site.name', type: 'text', sample: 'Larkspur Tea Room' },
    { key: 'home.menu.dish-name.1', type: 'text', sample: 'Smoked oolong' },
    { key: 'home.menu.dish-price.1', type: 'text', sample: '4.20' },
    { key: 'home.menu.dish-image.1', type: 'image', sample: 'tea-1.jpg' },
    { key: 'home.menu.dish-name.2', type: 'text', sample: 'Cardamom scone' },
    { key: 'home.reviews.testimonial-text.1', type: 'text', sample: 'A quiet table and a perfect pot.' },
    { key: 'home.about.heading', type: 'text', sample: 'Steeped in patience' },
    { key: 'home.about.mystery', type: 'text', sample: 'Loose words' }
  ]
})

const fieldsOf = (map) => Object.fromEntries(map.slots.map((s) => [s.key, [s.role ?? null, s.group ?? null]]))

test('the rule tables place what they know on the content map itself, and list the rest', () => {
  const { contentMap, unplaced } = proposeContentMapRoles(wordpressMap(), { cms: 'wordpress' })
  assert.equal(contentMap.roleVocabularyVersion, 'place-content-roles/2')
  assert.deepEqual(fieldsOf(contentMap), {
    'site.name': ['business.name', { id: 'site.identity.0', item: 0, kind: 'business' }],
    'home.menu.dish-name.1': ['offering.name', { id: 'home.menu.dish.0', item: 0, kind: 'menu_item' }],
    'home.menu.dish-price.1': ['offering.price', { id: 'home.menu.dish.0', item: 0, kind: 'menu_item' }],
    'home.menu.dish-image.1': ['offering.image', { id: 'home.menu.dish.0', item: 0, kind: 'menu_item' }],
    'home.menu.dish-name.2': ['offering.name', { id: 'home.menu.dish.1', item: 1, kind: 'menu_item' }],
    'home.reviews.testimonial-text.1': ['quote.text', { id: 'home.reviews.quote.0', item: 0, kind: 'quote' }],
    'home.about.heading': ['editorial.heading', null],
    'home.about.mystery': [null, null]
  })
  assert.deepEqual(unplaced, ['home.about.mystery'])
  // What the tables place is valid; only the slot left to the packaging agent is reported.
  const check = checkContentMapRoles(contentMap)
  assert.deepEqual(check.errors, ['slot "home.about.mystery" (text) has no role'])
})

test('a slot that already has a role keeps it: the tables only fill what is empty', () => {
  const map = wordpressMap()
  map.slots[6].role = 'editorial.heading'
  map.slots[7].role = 'editorial.paragraph'
  map.slots[1].role = 'offering.description'
  map.slots[1].group = { id: 'home.menu.dish.0', item: 0, kind: 'menu_item' }
  const { contentMap, unplaced } = proposeContentMapRoles(map, { cms: 'wordpress' })
  assert.equal(contentMap.slots[6].role, 'editorial.heading')
  assert.equal(contentMap.slots[1].role, 'offering.description')
  assert.deepEqual(unplaced, [])
})

test('from the command line, a capture step in any language reads the same proposal', () => {
  const run = spawnSync(process.execPath, [CLI, 'wordpress'], {
    input: JSON.stringify(wordpressMap()),
    encoding: 'utf8'
  })
  assert.equal(run.status, 0, run.stderr)
  const out = JSON.parse(run.stdout)
  assert.deepEqual(out, proposeContentMapRoles(wordpressMap(), { cms: 'wordpress' }))

  const wrong = spawnSync(process.execPath, [CLI, 'drupal'], { input: '{}', encoding: 'utf8' })
  assert.equal(wrong.status, 2)
  assert.match(wrong.stderr, /joomla|wordpress/)
})

// A fictional Joomla menu "Find us": three entries of type `url`, two named after a social network (one opening `#`,
// one a profile address), one a plain address; and a social entry of another menu.
test('a Joomla menu entry that opens a social network is a contact card, the nth of its menu showing profile n', () => {
  const entry = (id, menutype, title, link) => [
    { key: `menuItem-${id}`, kind: 'menuItem', identity: { menutype } },
    [
      {
        key: `menuItem-${id}.0`,
        entity: `menuItem-${id}`,
        column: 'title',
        type: 'text',
        sample: title,
        requiresEvidence: true
      },
      {
        key: `menuItem-${id}.1`,
        entity: `menuItem-${id}`,
        column: 'link',
        type: 'url',
        sample: link,
        requiresEvidence: true
      }
    ]
  ]
  const rows = [
    entry(7, 'find-us', 'Mastodon shop', 'https://example.org/shop'),
    entry(8, 'find-us', 'Instagram', '#'),
    entry(9, 'find-us', 'Our page', 'https://www.facebook.com/kiteline'),
    entry(12, 'footer-links', 'Threads', '#')
  ]
  const map = { entities: rows.map((r) => r[0]), slots: rows.flatMap((r) => r[1]) }
  const { contentMap } = proposeContentMapRoles(map, { cms: 'joomla' })
  const got = fieldsOf(contentMap)
  const card = (id, item) => ({ id: `menuItem-${id}.social`, item, kind: 'contact' })
  assert.deepEqual(got['menuItem-8.0'], ['contact.social_label', card(8, 0)])
  assert.deepEqual(got['menuItem-8.1'], ['contact.social_url', card(8, 0)])
  assert.deepEqual(got['menuItem-9.0'], ['contact.social_label', card(9, 1)])
  assert.deepEqual(got['menuItem-9.1'], ['contact.social_url', card(9, 1)])
  assert.deepEqual(got['menuItem-12.1'], ['contact.social_url', card(12, 0)])
  // Not a social network: the address keeps no role and the title stays a menu label.
  assert.deepEqual(got['menuItem-7.1'], [null, null])
  assert.equal(got['menuItem-7.0'][1], null)
})
