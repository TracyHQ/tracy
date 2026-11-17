// The research's vision labels reach the picture policy (#575 pictures gap audit, port 2): a photo the research labelled
// in full is placed with that label and not looked at again; a photo whose label decides nothing is looked at again;
// a photo with lettering, another business or a blur is refused a frame, as the step chain's shortlist refuses it
// (`site-pictures/photo-shortlist.js` `photoRefusal`), and a low quality photo goes only into a small frame.
// Invented club, invented pictures, scripted fake vision.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-picture-research-labels.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { unfitReason } from '../domain/picture-fit.mjs'
import { labelOwnPictures } from '../domain/picture-labelling.mjs'
import { researchLabelsOf, withResearchLabels } from '../domain/picture-research-labels.mjs'

const asset = (id, more = {}) => ({
  id,
  kind: 'image',
  category: 'other',
  source: 'website',
  width: 1600,
  height: 1000,
  quality: 'high',
  content: 'venue-interior',
  caption: `Invented caption of ${id}`,
  isBlurry: false,
  hasTextOrWatermark: false,
  showsOtherBusiness: false,
  ...more
})
const urlOf = (id) => `https://brindlewick-tennis.example/img/${id}.jpg`
const brief = (assets) => ({ assets })
const manifest = (ids) => ids.map((id) => ({ id, origin: 'draft', sourceUrl: urlOf(id) }))
const record = (id, more = {}) => ({
  id,
  ref: urlOf(id),
  media: 'photo',
  item: id,
  itemKind: 'gallery',
  label: null,
  stock: false,
  ...more
})
const frame = (more = {}) => ({
  id: 'home.b1.image',
  kind: 'offering.image',
  place: 'block',
  shape: 'unknown',
  ...more
})

test('a photo the research labelled in full carries its labels and is not looked at again', async () => {
  const labels = researchLabelsOf(brief([asset('a1')]), manifest(['a1']))
  const [p] = withResearchLabels([record('a1')], labels)
  assert.equal(p.label, 'Invented caption of a1')
  assert.equal(p.content, 'venue-interior')
  assert.equal(p.width, 1600)
  assert.equal(p.labelledBy, 'research')
  assert.equal(p.needsLook, undefined)
  let asked = 0
  const out = await labelOwnPictures({ pictures: [p], vision: () => asked++ })
  assert.equal(asked, 0)
  assert.equal(out.pictures[0].label, 'Invented caption of a1')
})

test('a photo whose research label decides nothing, or that no asset names, is looked at again', async () => {
  const labels = researchLabelsOf(
    brief([asset('a2', { showsOtherBusiness: null }), asset('a3', { content: 'unlabelled' })]),
    manifest(['a2', 'a3'])
  )
  const pictures = withResearchLabels(
    [record('a2'), record('a3'), record('a4', { label: 'Caption' })],
    labels
  )
  assert.deepEqual(
    pictures.map((p) => p.needsLook),
    [true, true, true]
  )
  const seen = []
  const out = await labelOwnPictures({
    pictures,
    vision: (request) => {
      const ids = JSON.parse(request.user).pictures.map((p) => p.id)
      seen.push(...ids)
      return {
        pictures: ids.map((id) => ({
          id,
          label: `Looked at ${id}`,
          content: 'food',
          people: false,
          burnedInText: false,
          isBlurry: false,
          hasTextOrWatermark: false,
          showsOtherBusiness: false,
          orientation: 'landscape'
        }))
      }
    }
  })
  assert.deepEqual(seen, ['a2', 'a3', 'a4'])
  assert.ok(out.pictures.every((p) => p.labelledBy === 'vision' && p.needsLook === undefined))
  assert.ok(out.pictures.every((p) => p.showsOtherBusiness === false))
})

test('the vision reply must decide the three photo risks, or the labelling fails', async () => {
  await assert.rejects(
    labelOwnPictures({
      pictures: [record('a5')],
      vision: () => ({
        pictures: [{ id: 'a5', label: 'Courts', content: 'venue-exterior', orientation: 'landscape' }]
      })
    }),
    (error) => error.code === 'picture_labelling_failed'
  )
})

test('lettering, another business, a blur or an undecided label keep a photo out of a frame', () => {
  const fine = {
    ...record('ok'),
    content: 'food',
    labelledBy: 'vision',
    isBlurry: false,
    hasTextOrWatermark: false,
    showsOtherBusiness: false
  }
  assert.equal(unfitReason(fine, frame()), null)
  assert.equal(unfitReason({ ...fine, hasTextOrWatermark: true }, frame()), 'lettering')
  assert.equal(unfitReason({ ...fine, burnedInText: true }, frame()), 'lettering')
  assert.equal(unfitReason({ ...fine, textPresence: 'present' }, frame()), 'lettering')
  assert.equal(unfitReason({ ...fine, showsOtherBusiness: true }, frame()), 'other_business')
  assert.equal(unfitReason({ ...fine, isBlurry: true }, frame()), 'blurry')
  assert.equal(unfitReason({ ...fine, isGraphic: true }, frame()), 'not_a_picture_for_this_frame')
  assert.equal(unfitReason({ ...fine, showsOtherBusiness: null }, frame()), 'label_unknown')
  // A picture no one has labelled yet (the plan's count) is not judged on labels it cannot have.
  assert.equal(unfitReason({ ...record('plan'), label: 'to be labelled' }, frame()), null)
})

test('a low quality photo goes only into a small frame', () => {
  const low = {
    ...record('low'),
    content: 'food',
    quality: 'low',
    labelledBy: 'research',
    isBlurry: false,
    hasTextOrWatermark: false,
    showsOtherBusiness: false
  }
  assert.equal(unfitReason(low, frame({ size: { width: 400, height: 300 } })), null)
  assert.equal(unfitReason(low, frame({ size: { width: 1200, height: 800 } })), 'low_quality')
  assert.equal(unfitReason(low, frame()), 'low_quality')
})
