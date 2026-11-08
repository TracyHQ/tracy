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
  // The first card has no name left (its name slot was given another role), so it is no card: the price, which no
  // editorial default fits, is left to the packaging agent.
  assert.deepEqual(unplaced, ['home.menu.dish-price.1'])
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

test('a WordPress card whose name is no slot gets no group: its other slots fall back to an editorial role', () => {
  // A fictional bakery theme: the dish name heading carries inline price markup, so only the description is a slot.
  const map = {
    schemaVersion: 1,
    slots: [
      {
        key: 'home.menu.dish-description.1',
        type: 'text',
        sample: 'Rye crust, honey glaze and toasted seeds.'
      },
      { key: 'home.menu.dish-image.1', type: 'image', sample: 'loaf-1.jpg' },
      { key: 'home.menu.dish-name.2', type: 'text', sample: 'Fig twist' },
      { key: 'home.menu.dish-description.2', type: 'text', sample: 'Folded with dried figs and orange zest.' }
    ]
  }
  const { contentMap } = proposeContentMapRoles(map, {
    cms: 'wordpress',
    vocabulary: 'place-content-roles/3'
  })
  const got = fieldsOf(contentMap)
  assert.equal(got['home.menu.dish-description.1'][1], null)
  assert.equal(got['home.menu.dish-image.1'][1], null)
  assert.match(String(got['home.menu.dish-description.1'][0]), /^editorial\./)
  // The card that has its name keeps its group.
  assert.deepEqual(got['home.menu.dish-description.2'], [
    'offering.description',
    { id: 'home.menu.dish.1', item: 1, kind: 'menu_item' }
  ])
  const check = checkContentMapRoles(contentMap)
  assert.deepEqual(
    check.errors.filter((e) => e.includes('lacks the role')),
    []
  )
})

test('a WordPress slot joins a card whose name the map already placed', () => {
  const map = {
    schemaVersion: 1,
    slots: [
      {
        key: 'home.menu.dish-name.1',
        type: 'text',
        sample: 'Fig twist',
        role: 'offering.name',
        group: { id: 'home.menu.dish.0', item: 0, kind: 'menu_item' }
      },
      { key: 'home.menu.dish-image.1', type: 'image', sample: 'fig-1.jpg' }
    ]
  }
  const { contentMap } = proposeContentMapRoles(map, {
    cms: 'wordpress',
    vocabulary: 'place-content-roles/3'
  })
  assert.deepEqual(fieldsOf(contentMap)['home.menu.dish-image.1'], [
    'offering.image',
    { id: 'home.menu.dish.0', item: 0, kind: 'menu_item' }
  ])
})

test('an hours-shaped sample takes the role of the card it sits in, or contact.hours when it sits in none', () => {
  const V3 = 'place-content-roles/3'
  const map = {
    schemaVersion: 1,
    slots: [
      { key: 'home.menu.dish-name.1', type: 'text', sample: 'Smoked oolong' },
      {
        key: 'home.menu.dish-when.1',
        type: 'text',
        sample: 'Mon. Tue. & Sun ((br/))12 Noon to 11 PM',
        markup: 'inline'
      },
      { key: 'home.happyhours.hp-title', type: 'text', sample: 'Evening special' },
      {
        key: 'home.happyhours.hp-info',
        type: 'text',
        sample: 'Mon. Tue. Thu. & Sun ((br/))12 Noon to 11 PM',
        markup: 'inline'
      },
      { key: 'home.happyhours-2.hp-title', type: 'text', sample: 'Late special' },
      {
        key: 'home.happyhours-2.hp-info',
        type: 'text',
        sample: 'Fri. Sat. ((br/))9 PM to 1 AM',
        markup: 'inline'
      },
      { key: 'home.footer.opening-line', type: 'text', sample: 'Open Mon to Fri, 9 AM to 5 PM' },
      {
        key: 'home.story.paragraph',
        type: 'text',
        sample:
          'On Monday mornings at 9 AM our bakers start the dough, and by the end of the week the whole street smells of it.'
      }
    ]
  }
  const { contentMap } = proposeContentMapRoles(map, { cms: 'wordpress', vocabulary: V3 })
  const by = Object.fromEntries(contentMap.slots.map((s) => [s.key, s]))
  assert.equal(by['home.menu.dish-when.1'].role, 'offering.schedule')
  assert.deepEqual(by['home.menu.dish-when.1'].group, by['home.menu.dish-name.1'].group)
  for (const sec of ['happyhours', 'happyhours-2']) {
    assert.equal(by[`home.${sec}.hp-title`].role, 'event.title')
    assert.equal(by[`home.${sec}.hp-info`].role, 'event.date_or_year')
    assert.deepEqual(by[`home.${sec}.hp-info`].group, by[`home.${sec}.hp-title`].group)
  }
  assert.equal(by['home.footer.opening-line'].role, 'contact.hours')
  assert.notEqual(
    by['home.story.paragraph'].role,
    'contact.hours',
    'prose that mentions a day and a time is not an hours line'
  )
  assert.equal(
    checkContentMapRoles(contentMap).errors.length,
    0,
    JSON.stringify(checkContentMapRoles(contentMap).errors)
  )
})
