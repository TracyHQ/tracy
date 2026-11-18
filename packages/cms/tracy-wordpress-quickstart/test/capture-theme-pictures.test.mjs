import assert from 'node:assert/strict'
import { test } from 'node:test'
import { themePictureDeclaration } from '../scripts/capture-contract.mjs'
import { themeMetaSlotsOf, themeOptionSlotOf } from '../scripts/capture-image-slots.mjs'

// Invented rows: a theme `wp-demo-bistro`, two attachments, one post that points at one of them through the theme's meta.
const POSTMETA = [
  { post_id: '41', meta_key: 'db_intro_image', meta_value: '25' },
  { post_id: '25', meta_key: '_wp_attached_file', meta_value: '2026/10/plate.jpg' },
  { post_id: '33', meta_key: '_wp_attached_file', meta_value: '2026/10/banner.jpg' },
  { post_id: '42', meta_key: 'db_intro_image', meta_value: '77' }
]

test('the manifest declares the theme picture options and meta keys, held to what the plugin accepts', () => {
  assert.deepEqual(
    themePictureDeclaration({
      theme: 'wp-demo-bistro',
      options: ['wp_demo_bistro_blog_banner_image'],
      meta: ['db_intro_image']
    }),
    { options: ['wp_demo_bistro_blog_banner_image'], postMeta: ['db_intro_image'] }
  )
  assert.equal(themePictureDeclaration({ theme: 'wp-demo-bistro', options: [], meta: [] }), null)
  assert.throws(
    () => themePictureDeclaration({ theme: 'wp-demo-bistro', options: ['siteurl'], meta: [] }),
    /option siteurl is not one of the theme wp-demo-bistro \(its name starts wp_demo_bistro_\)/
  )
  assert.throws(
    () => themePictureDeclaration({ theme: 'wp-demo-bistro', options: [], meta: ['_thumbnail_id'] }),
    /meta _thumbnail_id is a protected key/
  )
})

test('a declared meta key holding an attachment is an image slot of its post', () => {
  const got = themeMetaSlotsOf({
    postId: 41,
    entityKey: 'post-news',
    prefix: 'post-news',
    postmeta: POSTMETA,
    keys: ['db_intro_image']
  })
  assert.deepEqual(got.slots, [
    {
      key: 'post-news.db_intro_image',
      entity: 'post-news',
      target: { meta: 'db_intro_image' },
      type: 'image',
      sample: 'wp-content/uploads/2026/10/plate.jpg',
      sampleId: 25,
      maxCharacters: 255,
      label: 'post-news — db_intro_image'
    }
  ])
  assert.deepEqual(
    themeMetaSlotsOf({
      postId: 42,
      entityKey: 'post-b',
      prefix: 'post-b',
      postmeta: POSTMETA,
      keys: ['db_intro_image']
    }),
    {
      slots: [],
      skipped: ['post-b:db_intro_image (attachment 77 has no file)']
    }
  )
  assert.deepEqual(
    themeMetaSlotsOf({
      postId: 43,
      entityKey: 'post-c',
      prefix: 'post-c',
      postmeta: POSTMETA,
      keys: ['db_intro_image']
    }),
    {
      slots: [],
      skipped: []
    }
  )
})

test('a declared option holding an attachment is an image slot of its option entity', () => {
  assert.deepEqual(
    themeOptionSlotOf({ name: 'wp_demo_bistro_blog_banner_image', value: '33', postmeta: POSTMETA }),
    {
      slot: {
        key: 'theme.wp_demo_bistro_blog_banner_image',
        entity: 'option-wp_demo_bistro_blog_banner_image',
        target: { option: 'wp_demo_bistro_blog_banner_image' },
        type: 'image',
        sample: 'wp-content/uploads/2026/10/banner.jpg',
        sampleId: 33,
        maxCharacters: 255,
        label: 'Theme picture — wp_demo_bistro_blog_banner_image'
      },
      skipped: null
    }
  )
  assert.deepEqual(themeOptionSlotOf({ name: 'wp_demo_bistro_x', value: 'banner.jpg', postmeta: POSTMETA }), {
    slot: null,
    skipped: 'option-wp_demo_bistro_x (the option holds no attachment id)'
  })
})
