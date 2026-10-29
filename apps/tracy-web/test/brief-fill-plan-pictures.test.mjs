/**
 * A Joomla contract build of a version 3 content map places the brief's photos through the fill plan (TracyHQ/tracy#133):
 * a card takes only a photo of its own offering, a general slot only a general photo, a demo-only entity is left out,
 * and every decision's reason is kept in the plan the hand-off reads. Fixtures are fictional.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

import { fileURLToPath } from 'node:url'
import { contentMapOf, keptPages, shapeReal } from '../src/sites/brief-engines/real-pictures.js'
import { picturesOfBuild } from '../src/opportunities-build/handoff.js'

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
const image = (key, entity, role, file, size, group) => ({
  key,
  entity,
  type: 'image',
  sample: `images/demo/${file}`,
  label: `Section / ${key}`,
  role,
  ...(group ? { group } : {}),
  fit: fit(...size)
})
const card = (n) => ({ id: `module-2.item.${n}`, item: n, kind: 'service' })
/** The copy pins the text path writes: the name of each class card, the one decider of which offering it shows. */
const copyNaming = (first, second) => ({
  pins: { 'module-2.0': first, 'module-2.3': second },
  sources: { 'module-2.0': 'off-1', 'module-2.3': 'off-2' }
})

const CONTENT_MAP = {
  roleVocabularyVersion: 'place-content-roles/3',
  entities: [
    { key: 'module-2', kind: 'module' },
    { key: 'module-3', kind: 'module' },
    { key: 'article-9', kind: 'article', demoOnly: true }
  ],
  slots: [
    // Named like a slideshow and a dish: a name guess would read roles the v3 map does not say.
    {
      key: 'module-2.0',
      entity: 'module-2',
      type: 'text',
      sample: 'Demo Class One',
      role: 'offering.name',
      group: card(0)
    },
    image('module-2.1', 'module-2', 'offering.image', 'classes/slide-1.jpg', [800, 600], card(0)),
    {
      key: 'module-2.3',
      entity: 'module-2',
      type: 'text',
      sample: 'Demo Class Two',
      role: 'offering.name',
      group: card(1)
    },
    image('module-2.4', 'module-2', 'offering.image', 'classes/slide-2.jpg', [800, 600], card(1)),
    image('module-3.0', 'module-3', 'business.gallery_image', 'gallery/food-1.jpg', [800, 600]),
    image('article-9.1', 'article-9', 'editorial.illustration', 'style/sample.jpg', [800, 600])
  ],
  pages: [
    {
      route: 'home',
      assignedModules: [{ entity: 'module-2' }, { entity: 'module-3' }]
    },
    { route: 'typography', link: 'index.php?option=com_content&view=article&id=9' }
  ]
}

const photo = async (id, depicts, background) => ({
  picture: { id, width: 1200, height: 900, caption: 'a day at the club', source: 'instagram' },
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
  const plans = []
  const real = {
    buildId: 'build-fill-1',
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
  const realPictures = {
    recordPlan: async (_id, plan) => {
      plans.push(plan)
      return plans[0]
    }
  }
  const demo = await jpeg(800, 600)
  return { real, realPictures, plans, site: { siteFile: async () => demo, siteBytes: async () => demo } }
}

test('a Joomla v3 build: a card takes its own offering photo, the gallery a general one, the style page nothing', async () => {
  const { real, realPictures, site } = await build()
  const shaped = await shapeReal({
    real,
    contentMap: CONTENT_MAP,
    cms: 'joomla',
    pages: keptPages(null),
    ...site,
    realPictures,
    note: () => {},
    copy: copyNaming('Tennis Lessons', 'Padel Lessons')
  })
  const at = new Map(shaped.plan.placements.map((p) => [p.groupId, p.mediaId]))
  assert.equal(at.get('images/demo/classes/slide-1.jpg'), 'tennis-1')
  assert.equal(at.get('images/demo/classes/slide-2.jpg'), 'padel-1')
  assert.equal(at.get('images/demo/gallery/food-1.jpg'), 'unsure-1')
  // The demo-only entity's picture is neither placed nor left as a placeholder to write.
  assert.ok(!shaped.map.groups.some((g) => g.file === 'images/demo/style/sample.jpg'))
  assert.ok(!shaped.shaped.some((s) => s.group.sample === 'images/demo/style/sample.jpg'))
  assert.equal(shaped.plan.fill, 'fill-plan/1')
})

test("a card's name and its photo name the same offering when the brief lists them in another order", async () => {
  const { real, realPictures, site } = await build()
  const shaped = await shapeReal({
    real,
    contentMap: CONTENT_MAP,
    cms: 'joomla',
    pages: keptPages(null),
    ...site,
    realPictures,
    note: () => {},
    // The brief lists tennis first; the text path names the first card for padel.
    copy: copyNaming('Padel Lessons', 'Tennis Lessons')
  })
  const at = new Map(shaped.plan.placements.map((p) => [p.groupId, p.mediaId]))
  assert.equal(at.get('images/demo/classes/slide-1.jpg'), 'padel-1')
  assert.equal(at.get('images/demo/classes/slide-2.jpg'), 'tennis-1')
})

test('the hand-off lists every picture decision of the build with its reason code', async () => {
  const { real, realPictures, site } = await build()
  real.brief.assets = real.brief.assets.filter((a) => a.id !== 'padel-1')
  const shaped = await shapeReal({
    real,
    contentMap: CONTENT_MAP,
    cms: 'joomla',
    pages: keptPages(null),
    ...site,
    realPictures,
    note: () => {},
    copy: copyNaming('Tennis Lessons', 'Padel Lessons')
  })
  const report = picturesOfBuild({ plan: shaped.plan, receipts: {}, report: {} })
  const byKey = new Map(report.decisions.map((d) => [d.key, d]))
  assert.deepEqual([...byKey.keys()].sort(), ['article-9.1', 'module-2.1', 'module-2.4', 'module-3.0'])
  assert.equal(byKey.get('module-2.4').reason, 'no-photo-of-offering')
  assert.equal(byKey.get('article-9.1').reason, 'demo-only-entity')
  assert.equal(byKey.get('module-2.1').reason, 'offering-photo')
  for (const d of report.decisions) assert.ok(d.why, `${d.key} has a sentence for its reason`)
})

test('the contract map a picture phase reads keeps its vocabulary version and its demo-only marks', () => {
  const dir = fileURLToPath(
    new URL('../../../packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.8/', import.meta.url)
  )
  const map = contentMapOf({ dir })
  assert.equal(map.roleVocabularyVersion, 'place-content-roles/3')
  assert.ok(map.entities.some((e) => e.demoOnly === true))
})
