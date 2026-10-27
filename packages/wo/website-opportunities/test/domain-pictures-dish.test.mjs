import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planPlacement } from '../domain/pictures/placement.mjs'
import { labelPicture } from '../domain/pictures/picture-labels.mjs'
import { acceptedDishPhotos } from '../domain/dish-photos.mjs'

const group = (id, role, demo = { width: 800, height: 800 }) => ({
  id,
  file: id,
  role,
  home: false,
  routes: ['menu'],
  occurrences: [{ key: `${id}.0`, entity: 'module-1', label: id, sample: id }],
  topic: [],
  demo
})
const food = { subject: 'food', quality: 'good', textPresence: 'absent' }

test('a dish slot takes the photo shown to be of a dish before a larger food photo, and the plan says which dish', () => {
  const labels = [
    labelPicture({ id: 'big', width: 2400, height: 2400, vision: { ...food, heroWorthy: true } }),
    labelPicture({ id: 'pho', width: 900, height: 900, vision: food, dish: 'Phở bò tái' })
  ]
  const plan = planPlacement({ groups: [group('dish-1', 'dish')], labels })
  assert.deepEqual(
    plan.placements.map((p) => [p.groupId, p.mediaId, p.dish]),
    [['dish-1', 'pho', 'Phở bò tái']]
  )
  assert.match(plan.placements[0].why, /photo of "Phở bò tái"/)
})

test('a picture with no dish keeps its place in the gallery as before', () => {
  const labels = [
    labelPicture({ id: 'room', width: 1600, height: 1600, vision: { ...food, subject: 'interior' } })
  ]
  const plan = planPlacement({ groups: [group('g-1', 'gallery')], labels })
  assert.deepEqual(
    plan.placements.map((p) => [p.mediaId, p.dish]),
    [['room', undefined]]
  )
})

test('acceptedDishPhotos: the dishes whose photo is accepted now, read again with the build’s vision', () => {
  const brief = {
    sitemap: [
      {
        slug: 'menu',
        sections: [
          {
            kind: 'menu',
            menuItems: [
              { name: 'Phở bò', photo: { assetId: 'a', status: 'accepted', how: 'caption' } },
              { name: 'Bún chả', photo: { assetId: 'b', status: 'candidate', how: 'caption' } },
              { name: 'Cơm tấm', photo: { assetId: 'c', status: 'candidate', how: 'caption' } },
              { name: 'Chè', photo: { assetId: 'd', status: 'candidate', how: 'caption' } }
            ]
          }
        ]
      }
    ]
  }
  const pictures = [
    { id: 'b', vision: { subject: 'food' } },
    { id: 'c', vision: { subject: 'people' } },
    { id: 'd', vision: null }
  ]
  assert.deepEqual(
    [...acceptedDishPhotos(brief, pictures)],
    [
      ['a', 'Phở bò'],
      ['b', 'Bún chả']
    ]
  )
  assert.deepEqual([...acceptedDishPhotos(null, pictures)], [])
})

test('a card bound to an entity shows that entity’s own photo, never another dish’s: a card with none takes the placeholder', () => {
  const labels = [
    labelPicture({ id: 'pho', width: 900, height: 900, vision: food, dish: 'Phở bò' }),
    labelPicture({ id: 'cake', width: 900, height: 900, vision: { ...food, subject: 'dessert' } })
  ]
  const plan = planPlacement({
    groups: [group('dish-1', 'dish'), group('dish-2', 'dish')],
    labels,
    // The `Phở bò` card has its photo; the `Bún chả` one has none.
    bound: new Map([
      ['dish-1.0', 'pho'],
      ['dish-2.0', null]
    ])
  })
  assert.deepEqual(
    plan.placements.map((p) => [p.groupId, p.mediaId]),
    [['dish-1', 'pho']]
  )
  assert.deepEqual(
    plan.unfilled.map((u) => [u.groupId, u.action]),
    [['dish-2', 'placeholder']]
  )
  assert.match(plan.unfilled[0].reason, /no picture of its own/)
})

test('a bound photo too small for the role’s target still goes in its own card, cropped and never enlarged', () => {
  const labels = [labelPicture({ id: 'pho', width: 400, height: 400, vision: food, dish: 'Phở bò' })]
  const plan = planPlacement({ groups: [group('dish-1', 'dish')], labels, bound: { 'dish-1.0': 'pho' } })
  assert.equal(plan.placements[0]?.mediaId, 'pho')
  assert.deepEqual(plan.placements[0].crop.output, { width: 400, height: 400 })
})

test('a team member’s card with no photo of its own takes a picture of the place’s space, never a dish or a person', () => {
  const labels = [
    labelPicture({ id: 'pho', width: 900, height: 900, vision: food, dish: 'Phở bò' }),
    labelPicture({ id: 'guests', width: 900, height: 900, vision: { ...food, subject: 'people' } }),
    labelPicture({ id: 'room', width: 1200, height: 1200, vision: { ...food, subject: 'interior' } })
  ]
  const plan = planPlacement({
    groups: [group('team-1', 'section')],
    labels,
    bound: { 'team-1.0': { space: true } }
  })
  assert.deepEqual(
    plan.placements.map((p) => [p.groupId, p.mediaId]),
    [['team-1', 'room']]
  )
  const none = planPlacement({
    groups: [group('team-1', 'section')],
    labels: labels.slice(0, 2),
    bound: { 'team-1.0': { space: true } }
  })
  assert.deepEqual(
    none.unfilled.map((u) => [u.groupId, u.action]),
    [['team-1', 'placeholder']]
  )
})
