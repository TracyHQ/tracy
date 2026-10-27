// Editorial defaults of the slot role rule tables (ADR 0038): every text and image slot a fact table did not place gets
// an editorial role from its own signals, or stays unplaced when it has none. Fictional fixtures only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkContentMapRoles } from '../../packages/wo/website-opportunities/domain/content-map-roles.mjs'
import { proposeContentMapRoles } from '../slot-roles/rule-tables.mjs'

const roleOf = (map, key) => map.slots.find((s) => s.key === key)?.role ?? null

// A fictional Joomla site for a ceramics studio: header link, hero, a carousel, a menu item, a card link, a picture.
const joomlaMap = () => ({
  slots: [
    {
      key: 'module-1.0',
      entity: 'module-1',
      column: 'content',
      type: 'text',
      sample: 'Visit',
      xpath: '/html/body/div/a/text()'
    },
    {
      key: 'module-2.0',
      entity: 'module-2',
      column: 'content',
      type: 'text',
      sample: 'Hand made',
      xpath: '/html/body/div/h1/text()'
    },
    {
      key: 'module-2.1',
      entity: 'module-2',
      column: 'content',
      type: 'text',
      sample: 'Bowls and jugs',
      xpath: '/html/body/div/p/text()'
    },
    {
      key: 'module-3.0',
      entity: 'module-3',
      column: 'params',
      type: 'text',
      sample: 'Kiln days',
      jsonPath: ['features', 'features[card-title]', 0]
    },
    {
      key: 'module-3.1',
      entity: 'module-3',
      column: 'params',
      type: 'text',
      sample: 'Fired twice a week.',
      jsonPath: ['features', 'features[card-text]', 0]
    },
    {
      key: 'module-3.2',
      entity: 'module-3',
      column: 'params',
      type: 'text',
      sample: 'Book a slot',
      jsonPath: ['features', 'features[card-link-text]', 0]
    },
    {
      key: 'module-3.3',
      entity: 'module-3',
      column: 'params',
      type: 'text',
      sample: 'Shop now',
      jsonPath: ['features', 'features[btn-1-text]', 0]
    },
    { key: 'menuItem-9.0', entity: 'menuItem-9', column: 'title', type: 'text', sample: 'Studio' },
    { key: 'article-4.0', entity: 'article-4', column: 'title', type: 'text', sample: 'Glaze notes' },
    {
      key: 'article-4.1',
      entity: 'article-4',
      column: 'introtext',
      type: 'text',
      sample: 'Long form words.'
    },
    {
      key: 'article-4.2',
      entity: 'article-4',
      column: 'images',
      type: 'image',
      sample: 'images/glaze.jpg',
      jsonPath: ['image_intro']
    },
    {
      key: 'module-5.0',
      entity: 'module-5',
      column: 'params',
      type: 'text',
      sample: 'dQw4w9WgXcQ',
      jsonPath: ['exer', 'exer0', 'exer_video_id']
    },
    {
      key: 'module-5.1',
      entity: 'module-5',
      column: 'content',
      type: 'text',
      sample: 'Loading',
      xpath: '/html/body/div/span/text()'
    },
    {
      key: 'module-5.2',
      entity: 'module-5',
      column: 'content',
      type: 'url',
      sample: 'index.php?Itemid=3',
      xpath: '/html/body/div/a/@href'
    }
  ]
})

test('text and image slots no fact placed get an editorial role from their own signals', () => {
  const { contentMap, unplaced } = proposeContentMapRoles(joomlaMap(), { cms: 'joomla' })
  assert.equal(roleOf(contentMap, 'module-1.0'), 'editorial.button_label')
  assert.equal(roleOf(contentMap, 'module-2.0'), 'editorial.heading')
  assert.equal(roleOf(contentMap, 'module-2.1'), 'editorial.paragraph')
  assert.equal(roleOf(contentMap, 'module-3.0'), 'editorial.heading')
  assert.equal(roleOf(contentMap, 'module-3.1'), 'editorial.paragraph')
  assert.equal(roleOf(contentMap, 'module-3.2'), 'editorial.button_label')
  assert.equal(roleOf(contentMap, 'module-3.3'), 'editorial.button_label')
  assert.equal(roleOf(contentMap, 'menuItem-9.0'), 'editorial.menu_label')
  assert.equal(roleOf(contentMap, 'article-4.0'), 'editorial.heading')
  assert.equal(roleOf(contentMap, 'article-4.1'), 'editorial.paragraph')
  assert.equal(roleOf(contentMap, 'article-4.2'), 'editorial.decorative_image')
  // A technical value, an ambiguous span and a link target carry no usable signal: they stay with the agent or have no role.
  assert.equal(roleOf(contentMap, 'module-5.0'), null)
  assert.equal(roleOf(contentMap, 'module-5.1'), null)
  assert.equal(roleOf(contentMap, 'module-5.2'), null)
  assert.deepEqual(unplaced, ['module-5.0', 'module-5.1'])
})

test('editorial slots need no group and pass the contract check', () => {
  const { contentMap } = proposeContentMapRoles(joomlaMap(), { cms: 'joomla' })
  assert.equal(contentMap.slots.find((s) => s.key === 'module-2.0').group, undefined)
  const errors = checkContentMapRoles(contentMap).errors
  assert.deepEqual(errors, ['slot "module-5.0" (text) has no role', 'slot "module-5.1" (text) has no role'])
})

test('a fact role is never overridden by an editorial default', () => {
  const map = {
    slots: [
      { key: 'home.menu.dish-name.1', type: 'text', sample: 'Plum tart' },
      { key: 'home.menu.dish-image.1', type: 'image', sample: 'tart.jpg' },
      { key: 'home.menu.title', type: 'text', sample: 'Our menu' }
    ]
  }
  const { contentMap } = proposeContentMapRoles(map, { cms: 'wordpress' })
  assert.equal(roleOf(contentMap, 'home.menu.dish-name.1'), 'offering.name')
  assert.equal(roleOf(contentMap, 'home.menu.dish-image.1'), 'offering.image')
  assert.equal(roleOf(contentMap, 'home.menu.title'), 'editorial.heading')
})

test('WordPress slots read their block field name, and a long heading counts as a paragraph', () => {
  const map = {
    slots: [
      {
        key: 'home.hero.sub-heading',
        type: 'text',
        sample: 'Short',
        maxCharacters: 60,
        target: { block: 'hero.sub-heading', attr: 'content' }
      },
      {
        key: 'home.hero.lead-in',
        type: 'text',
        sample: 'Long',
        maxCharacters: 250,
        target: { block: 'hero.sub-heading', attr: 'content' }
      },
      {
        key: 'home.hero.posttext',
        type: 'text',
        sample: 'Words',
        target: { block: 'hero.posttext', attr: 'content' }
      },
      {
        key: 'home.hero.section-bg',
        type: 'image',
        sample: 'bg.png',
        target: { block: 'hero.section-bg', attr: 'src' }
      },
      {
        key: 'home.hero.mystery',
        type: 'text',
        sample: 'Words',
        target: { block: 'hero.mystery', attr: 'content' }
      }
    ]
  }
  const { contentMap, unplaced } = proposeContentMapRoles(map, { cms: 'wordpress' })
  assert.equal(roleOf(contentMap, 'home.hero.sub-heading'), 'editorial.heading')
  assert.equal(roleOf(contentMap, 'home.hero.lead-in'), 'editorial.paragraph')
  assert.equal(roleOf(contentMap, 'home.hero.posttext'), 'editorial.paragraph')
  assert.equal(roleOf(contentMap, 'home.hero.section-bg'), 'editorial.decorative_image')
  assert.deepEqual(unplaced, ['home.hero.mystery'])
})

test('article body copy is a paragraph in any tag, an indexed text node still reads its tag, numbered keys read their field', () => {
  const joomla = {
    slots: [
      {
        key: 'article-7.0',
        entity: 'article-7',
        column: 'fulltext',
        type: 'text',
        sample: 'Fired',
        xpath: '/html/body/div/ul/li[2]/text()'
      },
      {
        key: 'module-8.0',
        entity: 'module-8',
        column: 'content',
        type: 'text',
        sample: 'Studio',
        xpath: '/html/body/div/h1/text()[2]'
      },
      {
        key: 'module-8.1',
        entity: 'module-8',
        column: 'content',
        type: 'text',
        sample: 'Open',
        xpath: '/html/body/div/span/text()'
      }
    ]
  }
  const j = proposeContentMapRoles(joomla, { cms: 'joomla' })
  assert.equal(roleOf(j.contentMap, 'article-7.0'), 'editorial.paragraph')
  assert.equal(roleOf(j.contentMap, 'module-8.0'), 'editorial.heading')
  assert.deepEqual(j.unplaced, ['module-8.1'])

  const wordpress = { slots: [{ key: 'home.slideshow.title.2', type: 'text', sample: 'Welcome' }] }
  const w = proposeContentMapRoles(wordpress, { cms: 'wordpress' })
  assert.equal(roleOf(w.contentMap, 'home.slideshow.title.2'), 'editorial.heading')
})
