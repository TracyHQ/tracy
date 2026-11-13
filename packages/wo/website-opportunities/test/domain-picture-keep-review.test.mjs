// Review findings on the kept picture rules (ticket #595): the gallery reason stops drawing only, never an own photo;
// a block level frame of the one person its block shows is that person's; initials keep the name's script; a named
// person's frame is never empty; the enlargement limit has one home with a two pixel rounding tolerance; and one item
// shown on several pages is drawn once. Invented club, invented pictures, scripted fake vision.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-picture-keep-review.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_GENERATED_FRAMES } from '../domain/build-contract-plan.mjs'
import { initialsOf } from '../domain/person-avatar.mjs'
import { unfitReason } from '../domain/picture-fit.mjs'
import { pictureProblemsOf } from '../domain/picture-policy-check.mjs'
import { ENLARGE_TOLERANCE_PX, MAX_OWN_ENLARGE } from '../domain/pictures/enlarge-limit.mjs'
import { picturesStep } from '../domain/picture-step.mjs'
import {
  COACH,
  pictureBlocks,
  picturePlan,
  pictureProfile,
  scriptedModel,
  SERVICES,
  visionReply
} from './fixtures/picture-policy/invented-pictures.mjs'

const ids = (request) => JSON.parse(request.user).pictures.map((p) => p.id)
const image = (name, kind, frame) => ({ name, kind, type: 'image', ...(frame ? { frame } : {}) })
/** The invented club with two more blocks: an about block with a gallery picture, a feature of one coach. */
function extended() {
  const blocks = pictureBlocks()
  blocks.set('about-gallery', {
    id: 'about-gallery',
    type: 'about',
    items: { min: 1, max: 1 },
    fields: [image('picture', 'business.gallery_image', { width: 800, height: 600 })]
  })
  blocks.set('coach-feature', {
    id: 'coach-feature',
    type: 'about',
    items: { min: 1, max: 1 },
    fields: [image('portrait', 'person.image', { width: 400, height: 400 })]
  })
  const plan = picturePlan()
  plan.pages[1].blocks.push(
    { id: 'team-b2', type: 'about', block: 'about-gallery', data: ['business-name'] },
    { id: 'team-b3', type: 'about', block: 'coach-feature', data: [COACH, SERVICES[0]] }
  )
  return { blocks, plan }
}
const run = ({ profile = pictureProfile(), blocks, plan } = {}) =>
  picturesStep({
    plan: plan ?? picturePlan(),
    profile,
    blockStore: { blocks: [...(blocks ?? pictureBlocks()).values()] },
    vision: scriptedModel((request) => visionReply(ids(request)))
  })
const frame = (result, id) => result.frames.find((f) => f.id === id)
const net = (profile) =>
  profile.items.gallery.push({
    ...profile.items.gallery.find((p) => p.id === 'gallery-terrace'),
    id: 'gallery-net',
    label: 'The net at dusk'
  })

test('a gallery picture frame that is no gallery item takes a free own photo; only drawing is refused', async () => {
  const profile = pictureProfile()
  net(profile)
  const result = await run({ profile, ...extended() })
  assert.deepEqual(
    [frame(result, 'team.team-b2.picture').source, frame(result, 'team.team-b2.picture').picture],
    ['own', 'gallery-net']
  )
  const none = await run(extended())
  const empty = frame(none, 'team.team-b2.picture')
  assert.deepEqual([empty.source, empty.reason], ['none', 'gallery_own_photos_only'])
})

test('a block level frame of the one person its block shows is that person: own photo, else initials', async () => {
  const withPhoto = await run(extended())
  const portrait = frame(withPhoto, 'team.team-b3.portrait')
  assert.deepEqual([portrait.person, portrait.source], [COACH, 'own'])
  const profile = pictureProfile()
  delete profile.items.person[0].fields['person.image']
  const without = frame(await run({ profile, ...extended() }), 'team.team-b3.portrait')
  assert.deepEqual(
    [without.source, without.substitute.initials, without.substitute.personId],
    ['initials', 'IV', COACH]
  )
})

test('initials keep the script of the name; a Latin accent folds to its base letter', () => {
  const cases = [
    ['Ilse Varrow', 'IV'],
    ['李小龙', '李'],
    ['Иван Петров', 'ИП'],
    ['Øyvind Ærø', 'ØÆ'],
    ['Łukasz Żak', 'ŁZ'],
    ['Élodie Dupont', 'ED'],
    ['  ', '']
  ]
  for (const [name, initials] of cases) assert.equal(initialsOf(name), initials, name)
})

test('a named person frame left empty is a problem, and initials must name the frame person', async () => {
  const profile = pictureProfile()
  delete profile.items.person[0].fields['person.image']
  const result = await run({ profile })
  const coach = frame(result, `team.team-b1.${COACH}.photo`)
  assert.equal(coach.person, COACH)
  const empty = {
    frames: [{ ...coach, source: 'none', reason: 'no_generated_people', substitute: undefined }]
  }
  assert.equal(pictureProblemsOf(empty, [])[0].code, 'person_frame_empty')
  const other = {
    frames: [{ ...coach, substitute: { ...coach.substitute, personId: 'person-someone-else' } }]
  }
  assert.equal(pictureProblemsOf(other, [])[0].code, 'initials_missing')
})

test('one shared enlargement limit: never enlarged, with a two pixel rounding tolerance', () => {
  assert.deepEqual([MAX_OWN_ENLARGE, ENLARGE_TOLERANCE_PX], [1, 2])
  const square = { place: 'item', shape: 'square', size: { width: 350, height: 351 } }
  const photo = (width, height) => ({ media: 'photo', content: 'venue-exterior', width, height })
  assert.equal(unfitReason(photo(350, 350), square), null, 'one pixel of rounding is not an enlargement')
  assert.equal(unfitReason(photo(348, 351), square), null)
  assert.equal(unfitReason(photo(347, 351), square), 'too_small')
})

test('one item shown on several pages is drawn once and counted once against the cap', async () => {
  const blocks = pictureBlocks()
  const plan = picturePlan()
  plan.pages[1].blocks.push({ id: 'team-b2', type: 'services', block: 'service-cards', data: [...SERVICES] })
  const result = await run({ blocks, plan })
  const first = frame(result, `home.home-b2.${SERVICES[0]}.photo`)
  const again = frame(result, `team.team-b2.${SERVICES[0]}.photo`)
  assert.equal(first.source, 'generated')
  assert.deepEqual([again.source, again.reuses, again.generate], ['generated', first.id, first.generate])
  const drawn = result.frames.filter((f) => f.source === 'generated' && !f.reuses && !f.sameAs)
  assert.equal(result.counts.generated, drawn.length)
  assert.equal(result.counts.reused, 3, 'three services without a photo are shown twice')
  assert.ok(drawn.length <= MAX_GENERATED_FRAMES)
})
