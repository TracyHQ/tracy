// A video slot is never given to the copy writer (spec TracyHQ/tracy#189 round 9, class C2): it takes the brief's own
// playable video, or it keeps the demo's video id so the leftover block can find its play control and hide it. A copy
// writer that left the id unanswered had it emptied, which left a play button opening an empty frame and no id for the
// hide rule to match. All businesses are made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planSite } from '../domain/site-plan.mjs'

const video = (key, sample, type = 'text') => ({
  key,
  entity: key.split('.')[0],
  column: 'attribs',
  type,
  role: 'business.video',
  sample,
  group: { id: `${key}.video`, item: 0, kind: 'gallery' }
})
// A yoga studio's class page: a lead video id and one link slot in a style module.
const map = {
  entities: [],
  pages: [],
  slots: [video('article-7.12', 'Ab3dE5gH7jK'), video('module-30.6', 'https://youtu.be/Zz9yX8wV7uT', 'url')]
}

test('with no playable video in the brief, a video slot keeps the demo id for the hide rule and is not written', () => {
  const plan = planSite({ business: { name: 'Lotus Loft Yoga' } }, { questions: [] }, { contentMap: map })
  for (const key of ['article-7.12', 'module-30.6']) {
    const slot = plan.slots.find((s) => s.key === key)
    assert.equal(slot.decision, 'keep', key)
    assert.equal(slot.reason, 'no-playable-video', key)
  }
  assert.deepEqual(
    plan.outside.videos.filter((v) => v.decision === 'still').map((v) => v.demo),
    ['Ab3dE5gH7jK', 'Zz9yX8wV7uT']
  )
})

test("with the brief's own YouTube video, the first slot takes it as the template shipped it and the rest keep", () => {
  const brief = {
    business: { name: 'Harbour Lane Bakery' },
    content: { videos: [{ url: 'https://www.youtube.com/watch?v=Qq1Ww2Ee3Rr' }] }
  }
  const plan = planSite(brief, { questions: [] }, { contentMap: map })
  const first = plan.slots.find((s) => s.key === 'article-7.12')
  assert.equal(first.decision, 'value')
  assert.equal(first.value, 'Qq1Ww2Ee3Rr')
  assert.equal(first.reason, 'brief-video')
  assert.equal(plan.slots.find((s) => s.key === 'module-30.6').decision, 'keep')
})
