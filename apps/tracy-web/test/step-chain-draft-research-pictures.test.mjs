// The research's picture labels and own videos reach the pictures step of a run built from a build draft (#575 pictures
// gap audit, ports 2 and 9): a photo the research labelled in full is not shown to the vision call again, a photo the
// research saw lettering on never fills a frame, and the business's own videos are offered to the video frames.
// The invented florist, fakes only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/step-chain-draft-research-pictures.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { researchPicturesOf, withDraftPictures } from '../src/step-chain-draft-pictures.js'
import { setUp } from './step-chain-draft-harness.mjs'

const full = (id, more = {}) => ({
  id,
  kind: 'image',
  source: 'website',
  width: 1600,
  height: 1000,
  quality: 'high',
  content: 'product',
  caption: `Invented bouquet ${id}`,
  isBlurry: false,
  hasTextOrWatermark: false,
  showsOtherBusiness: false,
  ...more
})
const askedIds = (requests) =>
  requests
    .filter((r) => Array.isArray(r.images) && r.images.length)
    .flatMap((r) => JSON.parse(r.user).pictures.map((p) => p.id))

test('a photo labelled in full by research is not looked at again; one with lettering never fills a frame', async () => {
  let fullItem = null
  let letteredItem = null
  const s = await setUp({
    mutate: (d) => {
      const gallery = d.engine.needsProfile.items.gallery
      fullItem = gallery[0].id
      letteredItem = gallery[1].id
      d.engine.research.brief = {
        assets: [full('draft-picture-1'), full('draft-picture-2', { hasTextOrWatermark: true })]
      }
    }
  })
  const run = await s.engine.prepare(s.ctx)
  const asked = askedIds(s.model.requests)
  assert.ok(!asked.includes(fullItem), 'the fully labelled photo is not sent to the vision call')
  assert.ok(!asked.includes(letteredItem), 'its research label decides too: it is not sent either')
  // The other photos had no research label: they are looked at.
  assert.ok(asked.length > 0)
  const frames = run.inputs.pictures.frames
  assert.ok(!frames.some((f) => f.source === 'own' && f.picture === letteredItem))
  assert.ok(frames.some((f) => f.source === 'own' && f.picture === fullItem))
})

test('the business own videos with a caption are offered to the pictures step; the others are counted', () => {
  const brief = {
    assets: [
      {
        id: 'v1',
        kind: 'video',
        source: 'website',
        caption: 'Invented arranging class',
        width: 1920,
        height: 1080,
        hasTextOrWatermark: false,
        credit: '',
        uploaderRole: 'owner'
      },
      {
        id: 'v2',
        kind: 'video',
        source: 'website',
        width: 1920,
        height: 1080,
        credit: '',
        uploaderRole: 'owner'
      }
    ]
  }
  const manifest = [
    { id: 'v1', origin: 'draft', sourceUrl: 'https://larkspur-florist.example/media/class.mp4' },
    { id: 'v2', origin: 'draft', sourceUrl: 'https://larkspur-florist.example/media/loop.mp4' }
  ]
  const got = researchPicturesOf({ brief, manifest })
  assert.deepEqual(
    got.videos.map((v) => [v.id, v.burnedInText, v.orientation]),
    [['v1', false, 'landscape']]
  )
  assert.equal(got.videosLeftOut, 1)
})

test('the vision call is shown a 512 pixel JPEG thumbnail of each stored photo, as the step chain shows it', async () => {
  const png = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#4b7a9c' } })
    .png()
    .toBuffer()
  const url = 'https://larkspur-florist.example/img/one.jpg'
  const opened = await withDraftPictures({
    profile: {
      items: {
        gallery: [
          { id: 'g1', kind: 'gallery', pictureId: 'm1', fields: { 'business.gallery_image': { value: url } } }
        ]
      }
    },
    manifest: [{ id: 'm1', origin: 'draft', sourceUrl: url }],
    accountId: 'acct',
    openDraftPicture: async () => ({ bytes: new Uint8Array(png), mime: 'image/png' })
  })
  const ref = opened.refs.get(url)
  assert.ok(ref.startsWith('data:image/jpeg;base64,'))
  const meta = await sharp(Buffer.from(ref.split(',')[1], 'base64')).metadata()
  assert.deepEqual([meta.width, meta.height], [512, 341])
})

test('bytes no picture format starts with are shown as stored, never handed to sharp', async () => {
  const url = 'https://larkspur-florist.example/img/two.jpg'
  const opened = await withDraftPictures({
    profile: {
      items: {
        gallery: [
          { id: 'g2', kind: 'gallery', pictureId: 'm2', fields: { 'business.gallery_image': { value: url } } }
        ]
      }
    },
    manifest: [{ id: 'm2', origin: 'draft', sourceUrl: url }],
    accountId: 'acct',
    openDraftPicture: async () => ({ bytes: Buffer.from('not a picture'), mime: 'image/png' })
  })
  assert.equal(
    opened.refs.get(url),
    `data:image/png;base64,${Buffer.from('not a picture').toString('base64')}`
  )
})
