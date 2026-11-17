// The picture wishes of the frames the build draws (#575 pictures, port 1): one call of the build model for every frame,
// the planner's wish rules held by code (one subject, never "or"), the size in the planner's words. Scripted model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-picture-wishes.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pictureWishes, sizeWords, PICTURE_WISHES_PROMPT } from '../domain/picture-wishes.mjs'

const frames = [
  {
    id: 'home.hero.image',
    page: 'home',
    block: 'hero',
    blockType: 'hero',
    kind: 'business.hero_image',
    size: { width: 1440, height: 700 }
  },
  {
    id: 'classes.list.c1.image',
    page: 'classes',
    block: 'list',
    blockType: 'cards',
    kind: 'offering.image',
    item: 'service-pad-work',
    generate: { size: { width: 600, height: 600 } }
  }
]
const profile = {
  facts: { 'business.name': [{ value: 'Invented Harbour Boxing' }] },
  items: {
    service: [
      {
        id: 'service-pad-work',
        kind: 'service',
        fields: {
          'offering.name': { value: 'Pad work' },
          'offering.image': { value: 'https://invented.example/p.jpg' }
        }
      }
    ]
  }
}
const answer =
  (over = {}) =>
  async (request) => {
    const asked = JSON.parse(request.user).frames
    return JSON.stringify({
      wishes: asked.map((f) => ({
        frame: f.id,
        shows: `a coach holding pads for ${f.id}`,
        mustInclude: ['pads'],
        avoid: [],
        mood: 'energetic',
        ...over[f.id]
      }))
    })
  }

test('one call for every frame: the prompt, the item words, and the size in the planner words', async () => {
  const requests = []
  const model = async (r) => (requests.push(r), answer()(r))
  const got = await pictureWishes({ frames, profile, model })
  assert.equal(requests.length, 1)
  assert.equal(requests[0].system, PICTURE_WISHES_PROMPT)
  const user = JSON.parse(requests[0].user)
  assert.equal(user.business.name, 'Invented Harbour Boxing')
  assert.deepEqual(user.frames[1].item.fields, { 'offering.name': 'Pad work' })
  assert.equal(got.wishes.get('home.hero.image').size, 'wide, 1440 x 700')
  assert.equal(got.wishes.get('classes.list.c1.image').size, 'square, 600 x 600')
  assert.deepEqual(got.wishes.get('classes.list.c1.image').mustInclude, ['pads'])
  assert.equal(sizeWords({ width: 0, height: 3 }), null)
})

test('a wish that offers alternatives, a frame left out or an unreadable reply fails the step', async () => {
  await assert.rejects(
    pictureWishes({ frames, profile, model: answer({ 'home.hero.image': { shows: 'a ring or a gym' } }) }),
    { code: 'picture_wishes_failed' }
  )
  await assert.rejects(pictureWishes({ frames, profile, model: async () => '{"wishes": []}' }), {
    code: 'picture_wishes_failed'
  })
  await assert.rejects(pictureWishes({ frames, profile, model: async () => 'not json' }), {
    code: 'picture_wishes_failed'
  })
  assert.deepEqual((await pictureWishes({ frames: [], profile, model: null })).wishes.size, 0)
})
