// The picture policy of the AI quickstart build (ticket #595): own photos first, labelled before use, fewer gallery items
// before anything is generated (every other item stays), no cap on generated frames (D45), no stock, no generated person, a video never the default
// hero background, and the source of every frame recorded. Invented club, invented pictures, scripted fake vision.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-picture-policy.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ownPicturesOf } from '../domain/picture-frames.mjs'
import { PicturePolicyError } from '../domain/picture-labelling.mjs'
import { FRAME_SOURCES, pictureProblemsOf } from '../domain/picture-policy-check.mjs'
import { assignPictures } from '../domain/picture-policy.mjs'
import { picturesStep } from '../domain/picture-step.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { picturesOf } from '../domain/plan-look-pictures.mjs'
import {
  clubVideo,
  PHOTOS,
  pictureBlocks,
  picturePlan,
  pictureProfile,
  scriptedModel,
  SERVICES,
  visionReply
} from './fixtures/picture-policy/invented-pictures.mjs'

const blockStore = () => ({ blocks: [...pictureBlocks().values()] })
/** A fake vision call that labels whatever it is asked, with per id overrides. */
const labelAll = (over = {}) =>
  scriptedModel((request) =>
    visionReply(
      JSON.parse(request.user).pictures.map((p) => p.id),
      over
    )
  )
const run = (input = {}) =>
  picturesStep({
    plan: picturePlan(),
    profile: pictureProfile(),
    blockStore: blockStore(),
    vision: labelAll(),
    ...input
  })
const frame = (result, id) => result.frames.find((f) => f.id === id)
const HERO = 'home.home-b1.photo'
const CLIP = 'home.home-b1.clip'
const COURTS = `home.home-b3.${PHOTOS[0]}.photo`

test('an own photo without a label is labelled by one vision call before use, not discarded', async () => {
  const vision = labelAll()
  const result = await run({ profile: pictureProfile({ unlabelCourts: true }), vision })
  assert.equal(vision.calls.length, 1)
  const asked = JSON.parse(vision.calls[0].user).pictures.map((p) => p.id)
  assert.ok(asked.includes(PHOTOS[0]), 'the unlabelled gallery photo is sent to the vision call')
  assert.ok(!asked.includes('gallery-stock-racket'), 'a stock picture is never labelled')
  assert.ok(!asked.includes(PHOTOS[1]), 'a labelled photo is not labelled again')
  assert.match(vision.calls[0].system, /^DRAFT, not approved\. .*#600/)
  assert.ok(result.labelled.includes(PHOTOS[0]))
  assert.equal(frame(result, COURTS).source, 'own')
  assert.equal(frame(result, COURTS).label, `Invented label of ${PHOTOS[0]}`)
})

test('a labelling failure throws a typed error naming the pictures step, never a silent skip', async () => {
  const failing = [
    scriptedModel(() => {
      throw new Error('vision door timed out')
    }),
    scriptedModel('not json'),
    scriptedModel((request) =>
      visionReply(
        JSON.parse(request.user)
          .pictures.slice(1)
          .map((p) => p.id)
      )
    ),
    labelAll({ [PHOTOS[0]]: { content: 'a guess' } })
  ]
  for (const vision of failing) {
    await assert.rejects(run({ profile: pictureProfile({ unlabelCourts: true }), vision }), (error) => {
      assert.ok(error instanceof PicturePolicyError)
      assert.equal(error.code, 'picture_labelling_failed')
      assert.equal(error.details.step, 'pictures')
      assert.ok(error.details.pictures.length > 0)
      return true
    })
  }
  await assert.rejects(run({ vision: undefined }), { code: 'vision_missing' })
})

test('no photo is placed without a label', async () => {
  const data = planDataOf(pictureProfile({ unlabelCourts: true }))
  const pictures = ownPicturesOf(data)
  const input = { pages: picturePlan().pages, blocks: pictureBlocks(), data, pictures }
  assert.throws(() => assignPictures(input), { code: 'picture_unlabelled' })
  const result = await run({ pictures: [clubVideo()] })
  for (const f of result.frames.filter((f) => f.source === 'own'))
    assert.ok(f.label, `${f.id} carries its label`)
  const broken = { frames: [{ ...frame(result, HERO), label: '' }] }
  assert.equal(
    pictureProblemsOf(broken, [{ id: 'gallery-terrace', media: 'photo' }])[0].code,
    'picture_unlabelled'
  )
})

test('a video is never the default hero background, and only a fitting video fills a video frame', async () => {
  const fitting = await run({ pictures: [clubVideo()] })
  assert.equal(frame(fitting, HERO).picture, 'gallery-terrace', 'the hero image frame takes a photo')
  assert.equal(frame(fitting, CLIP).picture, 'video-rally')
  for (const unfit of [
    { width: 720, height: 1280 },
    { label: 'Rally with a price banner', burnedInText: true }
  ]) {
    const result = await run({ pictures: [clubVideo(unfit)], vision: labelAll({ 'video-rally': unfit }) })
    assert.equal(frame(result, CLIP).source, 'none')
    assert.equal(frame(result, CLIP).reason, 'no_fitting_video')
    assert.equal(frame(result, HERO).source, 'own')
  }
  // Without a video frame in the template, a video is never placed, even as the hero.
  const blocks = pictureBlocks()
  blocks.get('hero-video').fields = blocks.get('hero-video').fields.filter((f) => f.kind !== 'business.video')
  const noFrame = await run({ pictures: [clubVideo()], blockStore: { blocks: [...blocks.values()] } })
  assert.ok(!noFrame.frames.some((f) => f.picture === 'video-rally'))
  // A hero with no photo of its own is generated as an image, not filled with the video.
  const profile = pictureProfile()
  profile.items.gallery = profile.items.gallery.filter((p) => p.id !== 'gallery-terrace')
  const generated = await run({ profile, pictures: [clubVideo()] })
  assert.equal(frame(generated, HERO).source, 'generated')
})

test('own photos that fit a frame are used before any generated picture', async () => {
  const result = await run()
  assert.equal(frame(result, HERO).source, 'own', 'the free terrace photo opens the site')
  assert.notEqual(frame(result, HERO).picture, 'gallery-crest', 'a logo never opens the site')
  assert.equal(
    frame(result, `home.home-b2.${SERVICES[2]}.photo`).source,
    'own',
    'the service keeps its own photo'
  )
  for (const f of result.frames.filter(
    (f) => f.source === 'own' && f.place === 'item' && f.itemKind === 'gallery'
  ))
    assert.equal(f.picture, f.item, 'a gallery item shows its own photo')
})

test('a free own photo fills a block frame only when its shape fits the frame', async () => {
  const blocks = pictureBlocks()
  const about = {
    name: 'photo',
    kind: 'editorial.illustration',
    type: 'image',
    frame: { width: 1200, height: 800 }
  }
  blocks.set('about-photo', { id: 'about-photo', type: 'about', items: { min: 1, max: 1 }, fields: [about] })
  const plan = picturePlan()
  plan.pages[1].blocks.push({ id: 'team-b2', type: 'about', block: 'about-photo', data: ['business-name'] })
  const withShape = (width, height) => {
    const profile = pictureProfile()
    profile.items.gallery.push({
      ...profile.items.gallery.find((p) => p.id === 'gallery-terrace'),
      id: 'gallery-tall',
      label: 'A tall photo of the net',
      width,
      height
    })
    return run({ plan, profile, blockStore: { blocks: [...blocks.values()] } })
  }
  const tall = await withShape(800, 1400)
  assert.equal(
    frame(tall, 'team.team-b2.photo').source,
    'generated',
    'a portrait photo never fills a landscape frame'
  )
  const square = await withShape(1200, 1200)
  assert.equal(frame(square, 'team.team-b2.photo').picture, 'gallery-tall')
})

test('only gallery items are reduced before pictures are generated; every service stays', async () => {
  // The courts photo reads as a text graphic and fits no gallery frame; the strip needs two of its three photos.
  const blocks = pictureBlocks()
  blocks.set('gallery-strip', { ...blocks.get('gallery-strip'), items: { min: 2, max: 6 } })
  const profile = pictureProfile()
  profile.items.gallery.find((p) => p.id === PHOTOS[0]).content = 'text-graphic'
  const result = await run({ profile, blockStore: { blocks: [...blocks.values()] } })
  assert.deepEqual(
    result.reduced.map((r) => [r.item, r.reason]),
    [[PHOTOS[0], 'own_photo_unfit']]
  )
  assert.deepEqual(
    result.frames.filter((f) => f.block === 'home-b2').map((f) => f.item),
    [...SERVICES]
  )
  // The plan summary counts the same way and takes only the dropped gallery photo out of the pages it shows.
  const summary = picturesOf(picturePlan().pages, blocks, planDataOf(profile))
  assert.deepEqual(summary.pages[0].blocks[1].data, [...SERVICES])
  assert.deepEqual(summary.pages[0].blocks[2].data, PHOTOS.slice(1))
  assert.equal(summary.leftOut.filter((e) => e.kind === 'item').length, 1)
  assert.equal(summary.pictures.generated.frames, result.counts.generated)
})

test('no cap on drawn pictures (D45): every drawable frame without an own photo is drawn, within the approved count', async () => {
  const blocks = pictureBlocks()
  blocks.set('service-cards', { ...blocks.get('service-cards'), items: { min: 4, max: 4 } })
  const plan = picturePlan()
  plan.pages.push(
    ...['a', 'b', 'c', 'd', 'e', 'f'].map((n) => ({
      id: `extra-${n}`,
      name: n,
      pageType: 'about',
      blocks: [{ id: `x-${n}`, type: 'hero', block: 'hero-home', data: ['business-name'] }]
    }))
  )
  const profile = pictureProfile()
  profile.items.gallery = profile.items.gallery.filter((p) => p.id !== 'gallery-terrace')
  // The plan counts what it will draw, the customer approves that count, and the step draws exactly it.
  const summary = picturesOf(plan.pages, blocks, planDataOf(profile))
  assert.ok(!summary.leftOut.some((e) => /At most/.test(e.reason)), 'no spot is left out for a cap')
  plan.pictures = summary.pictures
  const counted = await run({ plan, profile, blockStore: { blocks: [...blocks.values()] } })
  assert.equal(counted.counts.generated, summary.pictures.generated.frames)
  assert.ok(counted.counts.generated > 6, `${counted.counts.generated} drawn, more than the old cap of six`)
  assert.ok(!counted.frames.some((f) => f.reason === 'generated_cap'))
  const drawable = counted.frames.filter(
    (f) => f.source === 'none' && !f.people && !f.never && f.place !== 'video'
  )
  assert.deepEqual(drawable, [], 'no drawable frame stays empty')
  const approved = picturePlan({ pictures: { own: { frames: 0, from: [] }, generated: { frames: 0 } } })
  const none = await run({ plan: approved })
  assert.equal(none.counts.generated, 0)
  assert.equal(frame(none, `home.home-b2.${SERVICES[0]}.photo`).reason, 'over_approved_count')
})

test('no stock photo and no generated picture of a person appears', async () => {
  const profile = pictureProfile()
  delete profile.items.person[0].fields['person.image']
  const result = await run({ profile })
  assert.ok(!result.frames.some((f) => f.picture === 'gallery-stock-racket'))
  const coach = result.frames.find((f) => f.people)
  assert.deepEqual([coach.source, coach.substitute.initials], ['initials', 'IV'])
  for (const f of result.frames.filter((f) => f.source === 'generated'))
    assert.deepEqual([f.generate.people, f.generate.stock], [false, false])
  const broken = { frames: [{ ...coach, source: 'generated', generate: { people: false, stock: false } }] }
  assert.equal(pictureProblemsOf(broken, [])[0].code, 'generated_person')
  const stock = { frames: [{ ...frame(result, HERO), picture: 'gallery-stock-racket', label: 'Racket' }] }
  const records = ownPicturesOf(planDataOf(profile))
  assert.equal(pictureProblemsOf(stock, records)[0].code, 'stock_used')
})

test('the source of every frame is recorded', async () => {
  const result = await run({ pictures: [clubVideo()] })
  assert.ok(result.frames.length > 0)
  for (const f of result.frames) {
    assert.ok(FRAME_SOURCES.includes(f.source), `${f.id} records its source`)
    if (f.source === 'own') assert.ok(f.picture && f.ref && f.from.length > 0)
    if (f.source === 'none') assert.ok(f.reason)
  }
  assert.equal(pictureProblemsOf({ frames: [{ id: 'x' }] }, [])[0].code, 'source_missing')
})
