import assert from 'node:assert/strict'
import { test } from 'node:test'
import { imageSlotsOf, withImageSlots } from '../scripts/capture-image-slots.mjs'

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
