/**
 * A WordPress contract build of a version 3 content map places the brief's photos through the same fill plan as Joomla
 * (TracyHQ/tracy#138): a card takes only a photo of its own offering, a general slot only a general photo, a demo-only
 * entity is left out, and every decision carries the reason code a Joomla build gives. Fixtures are fictional; the slots
 * have the WordPress shape (a page entity, a block found by its name, a picture under the uploads folder).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

import { FILL_REASONS } from 'website-opportunities/domain/fill-plan.mjs'
import { picturesOfBuild } from '../src/opportunities-build/handoff.js'
import { keptPages, shapeReal } from '../src/sites/brief-engines/real-pictures.js'

const jpeg = (width, height, background = '#557799') =>
  sharp({ create: { width, height, channels: 3, background } })
    .jpeg()
    .toBuffer()

const fit = (width, height) => ({
  measured: true,
  kind: 'photo',
  replace: 'photo',
  transparent: false,
  source: { width, height, format: 'jpg' },
  aspect: Number((width / height).toFixed(4)),
  tolerance: 0.02,
  crop: 'cover'
})
const image = (key, entity, block, role, file, group) => ({
  key,
  entity,
  target: { block, attr: 'src' },
  type: 'image',
  sample: `wp-content/uploads/2026/10/${file}`,
  sampleId: 200,
  label: `${entity} / ${block}`,
  role,
  ...(group ? { group } : {}),
  fit: fit(800, 600)
})
const text = (key, entity, block, sample, role, group) => ({
  key,
  entity,
  target: { block, attr: 'content' },
  type: 'text',
  sample,
  maxCharacters: 80,
  role,
  ...(group ? { group } : {})
})
const card = (n) => ({ id: `home.classes.item.${n}`, item: n, kind: 'service' })

const CONTENT_MAP = {
  schemaVersion: 'tracy-quickstart-content-map/wordpress/v1',
  roleVocabularyVersion: 'place-content-roles/3',
  entities: [
    { key: 'page-home', kind: 'page', identity: { postType: 'page', slug: 'home' } },
    {
      key: 'page-typography',
      kind: 'page',
      identity: { postType: 'page', slug: 'typography' },
      demoOnly: true
    }
  ],
  slots: [
    text('home.class-1.title', 'page-home', 'class-1.title', 'Demo Class One', 'offering.name', card(0)),
    image('home.class-1.image', 'page-home', 'class-1.image', 'offering.image', 'class-1.jpg', card(0)),
    text('home.class-2.title', 'page-home', 'class-2.title', 'Demo Class Two', 'offering.name', card(1)),
    image('home.class-2.image', 'page-home', 'class-2.image', 'offering.image', 'class-2.jpg', card(1)),
    image('home.gallery.image', 'page-home', 'gallery.image', 'business.gallery_image', 'gallery-1.jpg'),
    image('typography.sample', 'page-typography', 'sample.image', 'editorial.illustration', 'style-1.jpg')
  ]
}

/** The copy pins the text path writes: the name on each class card decides which offering it shows. */
const copyNaming = (first, second) => ({
  pins: { 'home.class-1.title': first, 'home.class-2.title': second },
  sources: { 'home.class-1.title': 'off-1', 'home.class-2.title': 'off-2' }
})

const photo = async (id, depicts, background) => ({
  picture: { id, width: 1200, height: 900, caption: 'a morning at the club', source: 'upload' },
  asset: {
    id,
    kind: 'image',
    width: 1200,
    height: 900,
    depicts: { id: depicts, evidence: { via: 'alt' } },
    portraitOf: null,
    isGraphic: false
  },
  bytes: await jpeg(1200, 900, background)
})

async function build() {
  const photos = [
    await photo('padel-1', 'svc-padel', '#336699'),
    await photo('tennis-1', 'svc-tennis', '#996633'),
    await photo('unsure-1', 'general', '#663399')
  ]
  const bytes = new Map(photos.map((p) => [p.picture.id, p.bytes]))
  const real = {
    buildId: 'build-wp-fill-1',
    plan: null,
    colours: ['#3a6b4f'],
    pictures: photos.map((p) => p.picture),
    brief: {
      assets: photos.map((p) => p.asset),
      reading: {
        services: [
          { id: 'svc-tennis', label: 'Tennis Lessons' },
          { id: 'svc-padel', label: 'Padel Lessons' }
        ]
      }
    },
    bytes: async (id) => bytes.get(id) ?? null
  }
  const realPictures = { recordPlan: async (_id, plan) => plan }
  const demo = await jpeg(800, 600)
  return { real, realPictures, site: { siteFile: async () => demo, siteBytes: async () => demo } }
}

const shape = async (real, realPictures, site, copy) =>
  shapeReal({
    real,
    contentMap: CONTENT_MAP,
    cms: 'wordpress',
    pages: keptPages(null),
    ...site,
    realPictures,
    note: () => {},
    copy
  })

test('a WordPress v3 build: each card takes its own offering photo, the gallery a general one, the style page nothing', async () => {
  const { real, realPictures, site } = await build()
  const shaped = await shape(real, realPictures, site, copyNaming('Padel Lessons', 'Tennis Lessons'))
  const at = new Map(shaped.plan.placements.map((p) => [p.groupId, p.mediaId]))
  assert.equal(at.get('wp-content/uploads/2026/10/class-1.jpg'), 'padel-1')
  assert.equal(at.get('wp-content/uploads/2026/10/class-2.jpg'), 'tennis-1')
  assert.equal(at.get('wp-content/uploads/2026/10/gallery-1.jpg'), 'unsure-1')
  assert.ok(!shaped.shaped.some((s) => s.group.sample === 'wp-content/uploads/2026/10/style-1.jpg'))
  assert.equal(shaped.plan.fill, 'fill-plan/1')
})

test('a WordPress build says each picture decision with the reason codes a Joomla build uses', async () => {
  const { real, realPictures, site } = await build()
  real.brief.assets = real.brief.assets.filter((a) => a.id !== 'padel-1')
  const shaped = await shape(real, realPictures, site, copyNaming('Tennis Lessons', 'Padel Lessons'))
  const report = picturesOfBuild({ plan: shaped.plan, receipts: {}, report: {} })
  const reasons = Object.fromEntries((report.decisions ?? []).map((d) => [d.key, d.reason]))
  assert.deepEqual(reasons, {
    'home.class-1.image': 'offering-photo',
    'home.class-2.image': 'no-photo-of-offering',
    'home.gallery.image': 'general-photo',
    'typography.sample': 'demo-only-entity'
  })
  for (const reason of Object.values(reasons))
    assert.ok(FILL_REASONS[reason], `${reason} is a fill plan reason`)
})

test('a released WordPress map with no v3 roles keeps the placement planner it was built with', async () => {
  const dir = new URL(
    '../../../packages/cms/tracy-wordpress-quickstart/contracts/ja-essence/wp7/1.0.12/',
    import.meta.url
  )
  const released = JSON.parse(readFileSync(fileURLToPath(new URL('content-map.json', dir)), 'utf8'))
  const { real, realPictures, site } = await build()
  const shaped = await shapeReal({
    real,
    contentMap: released,
    cms: 'wordpress',
    pages: keptPages(null),
    ...site,
    realPictures,
    note: () => {}
  })
  assert.equal(shaped.plan.fill, undefined)
  assert.equal(shaped.plan.decisions, undefined)
})
