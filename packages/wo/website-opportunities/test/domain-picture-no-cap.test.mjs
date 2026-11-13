// The second review of 13/11 on the picture policy (ticket #595, D45): the plan's generated count is an estimate, never a cap,
// so a photo counted at plan time that its label later shows unfit is replaced by a drawing; a measured photo's size is
// its own, not its item's; a drawing or a non-person photo is reused only between frames whose aspect ratios lie within
// 15% of each other, and the drawer is told the size to draw at; and only a PERSON's photo may repeat on one page.
// Invented club, invented pictures, scripted fake vision.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-picture-no-cap.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ownPicturesOf } from '../domain/picture-frames.mjs'
import { assignPictures } from '../domain/picture-policy.mjs'
import { reuseProblemsOf } from '../domain/picture-reuse.mjs'
import { placeBuildPictures } from '../domain/picture-step.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { picturesOf } from '../domain/plan-look-pictures.mjs'
import {
  COACH,
  pictureBlocks,
  picturePlan,
  pictureProfile,
  scriptedModel,
  SERVICES,
  visionReply
} from './fixtures/picture-policy/invented-pictures.mjs'

const [JUNIOR, , HIRE] = SERVICES
const ids = (request) => JSON.parse(request.user).pictures.map((p) => p.id)
const step = (plan, vision = {}, profile = pictureProfile()) =>
  placeBuildPictures({
    plan,
    profile,
    blockStore: { blocks: [...pictureBlocks().values()] },
    vision: scriptedModel((request) => visionReply(ids(request), vision))
  })
const at = (result, id) => result.frames.find((f) => f.id === id)

test('a photo counted at plan time that its label shows unfit is replaced by a drawing, whatever the count', async () => {
  const plan = picturePlan()
  const summary = picturesOf(plan.pages, pictureBlocks(), planDataOf(pictureProfile()))
  plan.pictures = summary.pictures
  assert.match(summary.pictures.generated.reason, /^About \d+ pictures will be drawn/)
  const hirePhoto = `${HIRE}:offering.image`
  const result = await step(plan, { [hirePhoto]: { content: 'text-graphic' } })
  const hire = at(result, `home.home-b2.${HIRE}.photo`)
  assert.equal(hire.source, 'generated', 'the unfit photo leaves its frame to a drawing')
  assert.ok(result.counts.generated > summary.pictures.generated.frames, 'more drawn than the estimate')
  assert.ok(!result.frames.some((f) => f.reason === 'over_approved_count'))
  assert.equal(result.difference.approved.generated, summary.pictures.generated.frames)
})

test('a plan estimating no drawing, or none at all, still draws every drawable frame', async () => {
  const estimates = [{ own: { frames: 0, from: [] }, generated: { frames: 0 } }, undefined, { generated: {} }]
  for (const pictures of estimates) {
    const result = await step(picturePlan({ pictures }))
    const empty = result.frames.filter(
      (f) => f.source === 'none' && !f.people && !f.never && f.place !== 'video'
    )
    assert.deepEqual(empty, [], JSON.stringify(pictures))
    assert.ok(result.counts.generated > 0)
    assert.deepEqual(result.notes, [])
  }
})

test("a measured photo's size is its own field's; a service item's size is never its photo's", () => {
  const profile = pictureProfile()
  const hire = profile.items.service.find((s) => s.id === HIRE)
  Object.assign(hire.fields['offering.image'], { width: 640, height: 480 })
  Object.assign(
    profile.items.service.find((s) => s.id === JUNIOR),
    {
      width: 4000,
      height: 3000,
      fields: {
        ...profile.items.service.find((s) => s.id === JUNIOR).fields,
        'offering.image': { value: 'https://brindlewick-tennis.example/img/junior.jpg', sources: ['site'] }
      }
    }
  )
  const records = ownPicturesOf(planDataOf(profile))
  const hirePhoto = records.find((p) => p.id === `${HIRE}:offering.image`)
  assert.deepEqual([hirePhoto.width, hirePhoto.height], [640, 480])
  const junior = records.find((p) => p.id === `${JUNIOR}:offering.image`)
  assert.deepEqual([junior.width, junior.height], [undefined, undefined])
  const terrace = records.find((p) => p.id === 'gallery-terrace')
  assert.deepEqual([terrace.width, terrace.height], [1920, 1080], 'a gallery item is its photo')
})

const cards = (id, width, height, kind = 'offering.image') => ({
  id,
  type: 'services',
  items: { min: 1, max: 4 },
  fields: [],
  itemFields: [
    { name: 'name', kind: 'offering.name', type: 'text', limit: 40 },
    { name: 'photo', kind, type: 'image', frame: { width, height } }
  ]
})
const block = (id, kind, data) => ({
  id,
  type: 'services',
  block: kind,
  source: 'template',
  label: 'x',
  data,
  reason: 'x'
})
const page = (id, ...placed) => ({ id, name: id, pageType: 'services', blocks: placed })
function assign(pages, extra = []) {
  const blocks = pictureBlocks()
  for (const b of extra) blocks.set(b.id, b)
  const data = planDataOf(pictureProfile())
  const pictures = ownPicturesOf(data).map((p) => ({
    ...p,
    label: p.label ?? `Invented label of ${p.id}`,
    content: 'people-in-action',
    orientation: 'landscape'
  }))
  return { ...assignPictures({ pages, blocks, data, pictures }), pictures }
}

test('a drawing is reused only within 15% of aspect ratio, and carries the largest size of its frames', () => {
  const extra = [
    cards('wide', 688, 295),
    cards('box', 704, 529),
    cards('wide-2', 700, 300),
    cards('edge', 805, 300)
  ]
  const result = assign(
    [
      page('p1', block('x1', 'wide', [JUNIOR])),
      page('p2', block('x2', 'box', [JUNIOR])),
      page('p3', block('x3', 'wide-2', [JUNIOR])),
      page('p4', block('x4', 'edge', [JUNIOR]))
    ],
    extra
  )
  const [p1, p2, p3, p4] = ['p1.x1', 'p2.x2', 'p3.x3', 'p4.x4'].map((p) => at(result, `${p}.${JUNIOR}.photo`))
  assert.deepEqual([p1.source, p1.reuses], ['generated', undefined])
  assert.deepEqual(
    [p2.source, p2.reuses],
    ['generated', undefined],
    '704x529 is far from 688x295: its own drawing'
  )
  assert.equal(p3.reuses, p1.id, '700x300 lies within 15% of 688x295')
  assert.equal(p4.reuses, undefined, '805x300 lies more than 15% over 688x295')
  assert.deepEqual(p1.generate.size, { width: 700, height: 300 })
  assert.deepEqual(p3.generate.size, { width: 700, height: 300 })
  assert.deepEqual(p2.generate.size, { width: 704, height: 529 })
  assert.deepEqual(reuseProblemsOf(result.frames, result.pictures), [])
  const wide = { id: 'a', page: 'home', source: 'generated', size: { width: 688, height: 295 } }
  const far = { id: 'b', page: 'svc', source: 'generated', reuses: 'a', size: { width: 704, height: 529 } }
  assert.deepEqual(
    reuseProblemsOf([wide, far]).map((p) => p.code),
    ['reuse_shape_unfit']
  )
})

test("only a person's own photo repeats on one page; another item's photo in a people frame does not", () => {
  const extra = [cards('people-a', 350, 351, 'person.image'), cards('people-b', 350, 351, 'person.image')]
  const result = assign(
    [page('home', block('t1', 'people-a', [HIRE, COACH]), block('t2', 'people-b', [HIRE, COACH]))],
    extra
  )
  assert.equal(at(result, `home.t1.${HIRE}.photo`).picture, `${HIRE}:offering.image`)
  const second = at(result, `home.t2.${HIRE}.photo`)
  assert.notEqual(second.picture, `${HIRE}:offering.image`, 'the service photo is shown once on the page')
  assert.equal(
    at(result, `home.t2.${COACH}.photo`).picture,
    `${COACH}:person.image`,
    'the coach photo repeats'
  )
  assert.deepEqual(reuseProblemsOf(result.frames, result.pictures), [])
  const twice = result.frames
    .filter((f) => f.block !== 't2' || f.item !== HIRE)
    .concat({ ...second, source: 'own', picture: `${HIRE}:offering.image`, label: 'x' })
  assert.deepEqual(
    reuseProblemsOf(twice, result.pictures).map((p) => [p.code, p.at]),
    [['reuse_same_page', second.id]]
  )
})
