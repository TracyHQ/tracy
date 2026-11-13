// The pictures step split in two for the step chain (#597): `placePictures` (labelling and picture assignment, no copy)
// runs beside the page writers, `selectBuildIcons` (icons from the written copy, checked against the picture frames)
// after them. `picturesStep` stays their composition: run in turn on the existing invented fixtures, the two give the
// same output as the one call. Scripted fake models only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-picture-step-split.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { picturesStep, placePictures, selectBuildIcons } from '../domain/picture-step.mjs'
import {
  blockStore,
  CLASSES,
  firstCandidate,
  iconLibrary,
  scriptedModel,
  yogaCopy,
  yogaPlan,
  yogaProfile
} from './fixtures/icon-fields/invented-yoga.mjs'
import {
  pictureBlocks,
  picturePlan,
  pictureProfile,
  scriptedModel as clubModel,
  visionReply
} from './fixtures/picture-policy/invented-pictures.mjs'

const labelAll = () =>
  clubModel((request) =>
    visionReply(
      JSON.parse(request.user).pictures.map((p) => p.id),
      {}
    )
  )

/** The split run in turn, each call with its own fresh fakes, as the step chain runs them. */
async function split(input, fresh) {
  const placed = await placePictures({ ...input, ...fresh() })
  const icons = await selectBuildIcons({ ...input, ...fresh(), pictureFrames: placed.frames })
  return { placed, icons, joined: { ...placed, ...icons, notes: [...placed.notes, ...icons.notes] } }
}

test('the invented yoga studio: placePictures then selectBuildIcons equal picturesStep', async () => {
  const input = {
    plan: yogaPlan(),
    profile: yogaProfile(),
    blockStore: blockStore(),
    iconLibrary: iconLibrary()
  }
  const fresh = () => ({ vision: scriptedModel(firstCandidate()), model: scriptedModel(firstCandidate()) })
  const copy = await yogaCopy()
  const { placed, icons, joined } = await split({ ...input, copy }, fresh)
  const whole = await picturesStep({ ...input, ...fresh(), copy: await yogaCopy() })
  assert.deepEqual(joined, whole)
  // placePictures carries no icon key; selectBuildIcons no picture key.
  for (const key of ['icons', 'iconCounts', 'iconPrompt', 'iconKeywordsPrompt']) assert.ok(!(key in placed))
  for (const key of ['frames', 'reduced', 'counts', 'leftOut', 'labelled']) assert.ok(!(key in icons))
  const lotus = icons.icons.find((i) => i.id === `home.home-b1.${CLASSES[2]}.item-icon`)
  assert.equal(lotus.icon.name, 'flower-lotus')
  assert.equal(icons.iconCounts.unexplained, 0)
})

test('the invented club: placePictures needs no copy and equals picturesStep without icon fields', async () => {
  const input = {
    plan: picturePlan(),
    profile: pictureProfile(),
    blockStore: { blocks: [...pictureBlocks().values()] }
  }
  const fresh = () => ({ vision: labelAll() })
  const { placed, icons, joined } = await split(input, fresh)
  assert.deepEqual(joined, await picturesStep({ ...input, ...fresh() }))
  assert.deepEqual(icons.icons, [])
  assert.ok(placed.frames.length > 0)
  assert.ok(placed.frames.every((f) => ['own', 'generated', 'none'].includes(f.source)))
})

test('selectBuildIcons refuses to run without the placed picture frames, and still needs the copy', async () => {
  const input = {
    plan: yogaPlan(),
    profile: yogaProfile(),
    blockStore: blockStore(),
    iconLibrary: iconLibrary(),
    model: scriptedModel(firstCandidate())
  }
  await assert.rejects(selectBuildIcons({ ...input, copy: await yogaCopy() }), {
    code: 'picture_frames_missing'
  })
  await assert.rejects(selectBuildIcons({ ...input, pictureFrames: [] }), { code: 'icon_copy_missing' })
})

test('an icon field given a picture frame is icon_policy_broken', async () => {
  const input = {
    plan: yogaPlan(),
    profile: yogaProfile(),
    blockStore: blockStore(),
    iconLibrary: iconLibrary(),
    model: scriptedModel(firstCandidate()),
    copy: await yogaCopy()
  }
  const icons = await selectBuildIcons({ ...input, pictureFrames: [] })
  const shown = icons.icons.find((i) => i.source === 'library')
  const frame = { id: shown.id, source: 'own', picture: 'invented-photo' }
  await assert.rejects(
    selectBuildIcons({ ...input, model: scriptedModel(firstCandidate()), pictureFrames: [frame] }),
    { code: 'icon_policy_broken' }
  )
})
