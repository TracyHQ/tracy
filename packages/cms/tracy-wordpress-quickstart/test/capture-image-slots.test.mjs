import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  featuredImageSlotOf,
  imageSlotsOf,
  withImageRoles,
  withImageSlots
} from '../scripts/capture-image-slots.mjs'

const HERO =
  '<!-- wp:image {"className":"wtb-hero__media","sizeSlug":"large","metadata":{"role":"content","name":"hero.img"},"id":91} -->\n' +
  '<figure class="wp-block-image size-large wtb-hero__media"><img src="/wp-content/uploads/2026/09/hero-ru.png" alt="Drop a site photo here · 4:5" class="wp-image-91"></figure>\n' +
  '<!-- /wp:image -->'

test('a named core/image with an attachment is one image slot, keyed like the text slots of its page', () => {
  const { slots, skipped } = imageSlotsOf({
    content: `<p>x</p>\n${HERO}`,
    entityKey: 'page-home',
    prefix: 'home'
  })
  assert.deepEqual(slots, [
    {
      key: 'home.hero.img',
      entity: 'page-home',
      target: { block: 'hero.img', attr: 'src' },
      type: 'image',
      sample: 'wp-content/uploads/2026/09/hero-ru.png',
      sampleId: 91,
      maxCharacters: 255,
      label: 'home — hero.img'
    }
  ])
  assert.deepEqual(skipped, [])
})

test('a picture the slot could not put back is reported, never guessed', () => {
  const noId = HERO.replace(',"id":91', '')
  const offsite = HERO.replace('/wp-content/uploads/2026/09/hero-ru.png', 'https://cdn.example/x.png')
  const unnamed = HERO.replace(',"name":"hero.img"', '')
  const of = (content) => imageSlotsOf({ content, entityKey: 'page-home', prefix: 'home' })
  assert.deepEqual(of(noId), { slots: [], skipped: ['page-home:hero.img (no attachment id)'] })
  assert.deepEqual(of(offsite), {
    slots: [],
    skipped: ['page-home:hero.img (picture not in uploads: https://cdn.example/x.png)']
  })
  assert.deepEqual(of(unnamed), { slots: [], skipped: [] })
})

test('recapturing replaces the image slots and keeps every other slot where it was', () => {
  const text = { key: 'home.hero.heading', type: 'text' }
  const old = { key: 'home.old.img', type: 'image' }
  const fresh = { key: 'home.hero.img', type: 'image' }
  assert.deepEqual(withImageSlots({ entities: [], slots: [text, old] }, [fresh]), {
    entities: [],
    slots: [text, fresh]
  })
})

test('a second block of the same name is out of reach, so it gets no slot', () => {
  const second = HERO.replace('hero-ru.png', 'other.png').replace(',"id":91', ',"id":92')
  const { slots, skipped } = imageSlotsOf({
    content: `${HERO}${second}`,
    entityKey: 'page-about',
    prefix: 'about'
  })
  assert.deepEqual(
    slots.map((s) => [s.key, s.sampleId]),
    [['about.hero.img', 91]]
  )
  assert.deepEqual(skipped, [
    'page-about:hero.img (a second block of that name; only the first is addressable)'
  ])
})

// ── a post's featured picture (spec #452) ──

const META = [
  { meta_id: '1', post_id: '41', meta_key: '_thumbnail_id', meta_value: '6' },
  { meta_id: '2', post_id: '6', meta_key: '_wp_attached_file', meta_value: '2026/10/news-1.jpg' },
  { meta_id: '3', post_id: '42', meta_key: '_thumbnail_id', meta_value: '7' },
  { meta_id: '4', post_id: '43', meta_key: '_thumbnail_id', meta_value: '8' },
  { meta_id: '5', post_id: '8', meta_key: '_wp_attached_file', meta_value: '../outside.jpg' }
]

test('a post with a featured picture in uploads gets an image slot on its thumbnail meta', () => {
  assert.deepEqual(
    featuredImageSlotOf({ postId: 41, entityKey: 'post-news', prefix: 'post-news', postmeta: META }),
    {
      slot: {
        key: 'post-news.featured-image',
        entity: 'post-news',
        target: { meta: '_thumbnail_id' },
        type: 'image',
        sample: 'wp-content/uploads/2026/10/news-1.jpg',
        sampleId: 6,
        maxCharacters: 255,
        label: 'post-news — featured image'
      },
      skipped: null
    }
  )
})

test('a featured picture the slot could not put back is reported, and a post without one has none', () => {
  const of = (postId) =>
    featuredImageSlotOf({ postId, entityKey: 'post-x', prefix: 'post-x', postmeta: META })
  assert.deepEqual(of(42), { slot: null, skipped: 'post-x:featured image (attachment 7 has no file)' })
  assert.deepEqual(of(43), {
    slot: null,
    skipped: 'post-x:featured image (picture not in uploads: ../outside.jpg)'
  })
  assert.deepEqual(of(99), { slot: null, skipped: null })
})

// A fictional cafe theme's map after capture-contract placed its text roles, with two image slots appended after.
const placedMap = () => ({
  entities: [],
  roleVocabularyVersion: 'place-content-roles/3',
  slots: [
    {
      key: 'home.menu.dish-name.1',
      type: 'text',
      sample: 'Pear tart',
      role: 'offering.name',
      group: { id: 'home.menu.dish.0', item: 0, kind: 'menu_item' }
    },
    { key: 'home.about.mystery', type: 'text', sample: 'Loose words' },
    { key: 'home.menu.dish-image.1', type: 'image', sample: 'wp-content/uploads/pear.jpg', sampleId: 7 },
    { key: 'home.hero.img', type: 'image', sample: 'wp-content/uploads/hero.jpg', sampleId: 8 }
  ]
})

test('a map that declares roles gets a role on every image slot captured after them, its other slots untouched', () => {
  const before = placedMap()
  const after = withImageRoles(before)
  assert.deepEqual(after.slots.slice(0, 2), before.slots.slice(0, 2))
  assert.equal(after.slots[2].role, 'offering.image')
  assert.deepEqual(after.slots[2].group, { id: 'home.menu.dish.0', item: 0, kind: 'menu_item' })
  assert.equal(typeof after.slots[3].role, 'string')
  assert.equal(after.roleVocabularyVersion, 'place-content-roles/3')
})

test('a map that declares no roles stays byte for byte as it was', () => {
  const map = placedMap()
  map.slots[0].role = undefined
  map.slots[0].group = undefined
  map.roleVocabularyVersion = undefined
  const plain = JSON.parse(JSON.stringify(map))
  assert.equal(JSON.stringify(withImageRoles(plain)), JSON.stringify(plain))
})
