// The pictures step split in two for the step chain (#597): `placeBuildPictures` (labelling and picture assignment, no
// copy) runs beside the page writers, `selectBuildIcons` (icons from the written copy, checked against the picture
// frames of the same plan) after them. Run in turn, the two give exactly the output the one call `picturesStep` gave
// before the split: `fixtures/picture-step-split/*.expected.json` were written by the unsplit step and are frozen (written
// again once by the unsplit step when the kept picture rules of #595 changed the output: every service stays, a frame
// records its declared size, a gallery frame is never generated, and the counts name the initials frames).
// Invented fixtures, scripted fake models only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-picture-step-split.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { picturesStep, placeBuildPictures, selectBuildIcons } from '../domain/picture-step.mjs'
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

const expected = (name) =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/picture-step-split/${name}.expected.json`, import.meta.url), 'utf8')
  )
const json = (value) => JSON.parse(JSON.stringify(value))
const labelAll = () =>
  clubModel((request) =>
    visionReply(
      JSON.parse(request.user).pictures.map((p) => p.id),
      {}
    )
  )
const yoga = async () => ({
  plan: yogaPlan(),
  profile: yogaProfile(),
  blockStore: blockStore(),
  iconLibrary: iconLibrary(),
  vision: scriptedModel(firstCandidate()),
  model: scriptedModel(firstCandidate()),
  copy: await yogaCopy()
})
const club = (over = {}) => ({
  plan: picturePlan(),
  profile: pictureProfile(over),
  blockStore: { blocks: [...pictureBlocks().values()] },
  vision: labelAll()
})

/** The split run in turn, each call with its own fresh inputs, as the step chain runs them. */
async function split(make) {
  const placed = await placeBuildPictures(await make())
  const icons = await selectBuildIcons({ ...(await make()), pictureFrames: placed.frames })
  return { placed, icons, joined: { ...placed, ...icons, notes: [...placed.notes, ...icons.notes] } }
}

for (const [name, make] of [
  ['invented-yoga', yoga],
  ['invented-club', () => club()],
  ['invented-club-unlabelled', () => club({ unlabelCourts: true })]
])
  test(`${name}: placeBuildPictures then selectBuildIcons give the frozen output of the unsplit step`, async () => {
    const { placed, icons, joined } = await split(make)
    assert.deepEqual(json(joined), expected(name))
    assert.deepEqual(json(await picturesStep(await make())), expected(name))
    for (const key of ['icons', 'iconCounts', 'iconPrompt', 'iconKeywordsPrompt']) assert.ok(!(key in placed))
    for (const key of ['frames', 'reduced', 'counts', 'leftOut', 'labelled']) assert.ok(!(key in icons))
  })

test('the frozen yoga output: lotus icon chosen from the copy, every icon explained', () => {
  const frozen = expected('invented-yoga')
  assert.equal(
    frozen.icons.find((i) => i.id === `home.home-b1.${CLASSES[2]}.item-icon`).icon.name,
    'flower-lotus'
  )
  assert.equal(frozen.iconCounts.unexplained, 0)
  assert.ok(expected('invented-club').frames.every((f) => ['own', 'generated', 'none'].includes(f.source)))
})

test('selectBuildIcons refuses frames that are not the placed frames of the same plan', async () => {
  const placed = await placeBuildPictures(club())
  assert.ok(placed.frames.length > 0, 'the club plan has picture frames')
  await assert.rejects(selectBuildIcons(club()), { code: 'picture_frames_missing' })
  // No frame given for a plan that has frames: not the frames of this plan.
  await assert.rejects(selectBuildIcons({ ...club(), pictureFrames: [] }), {
    code: 'picture_frames_mismatch'
  })
  const ok = await selectBuildIcons({ ...club(), pictureFrames: placed.frames })
  assert.deepEqual(ok.icons, [])
  // The club's frames given for the yoga plan (which has none): not this plan's.
  await assert.rejects(selectBuildIcons({ ...(await yoga()), pictureFrames: placed.frames }), {
    code: 'picture_frames_mismatch'
  })
  const copyless = await yoga()
  delete copyless.copy
  await assert.rejects(selectBuildIcons({ ...copyless, pictureFrames: [] }), { code: 'icon_copy_missing' })
})

test('a picture frame on an icon field is refused: an icon field is never a frame of the plan', async () => {
  const placed = await placeBuildPictures(await yoga())
  const icons = await selectBuildIcons({ ...(await yoga()), pictureFrames: placed.frames })
  const shown = icons.icons.find((i) => i.source === 'library')
  const crossed = [...placed.frames, { id: shown.id, source: 'own', picture: 'invented-photo' }]
  // The icon field's own id is not a picture frame of the plan: the frames check names it first.
  await assert.rejects(selectBuildIcons({ ...(await yoga()), pictureFrames: crossed }), {
    code: 'picture_frames_mismatch'
  })
})
