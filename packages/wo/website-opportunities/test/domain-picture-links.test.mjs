// A photo knows the brief: which offering it shows and whose portrait it is, linked from the brief's own closed list only.
// Alt text and post text that name one item link it without any model; a model's answer outside the list, or an unsure
// one, is "general". The boxes, people count and graphic flag a model returns are held to their shape.
// Fixtures are fictional: the Lantern Hill Racquet Club and its coaches do not exist.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  GENERAL,
  PHOTO_ROLES,
  assetRelationsOf,
  closedListDigest,
  closedListOf,
  focusOfBox,
  heldVisionLinks,
  ownershipOf,
  textLinksOf
} from '../domain/pictures/picture-links.mjs'
import { PLACE_CONTENT_ROLES_V3 } from '../domain/place-content-roles.mjs'

const READING = {
  services: [
    { id: 'se_tennis', label: 'Tennis class' },
    { id: 'se_padel', label: 'Padel class' },
    { id: 'se_camp', label: 'Junior tennis camp' }
  ],
  team: [
    { id: 'te_mara', label: 'Mara Okonkwo', role: 'Head coach' },
    { id: 'te_theo', label: 'Theo Lindqvist' },
    // Named only in a review: never offered as a portrait link.
    { id: 'te_guest', label: 'Ruth Example', reviewsOnly: true }
  ]
}
const LIST = closedListOf(READING)

test('the closed list is the brief offerings and the team the business names itself', () => {
  assert.deepEqual(
    LIST.offerings.map((o) => o.id),
    ['se_tennis', 'se_padel', 'se_camp']
  )
  assert.deepEqual(
    LIST.people.map((p) => p.id),
    ['te_mara', 'te_theo']
  )
  assert.deepEqual(closedListOf(null), { offerings: [], people: [] })
  assert.equal(closedListDigest({ offerings: [], people: [] }), null)
  assert.match(closedListDigest(LIST), /^[0-9a-f]{12}$/)
  assert.notEqual(closedListDigest(LIST), closedListDigest(closedListOf({ services: READING.services })))
})

test('every photo role is a place content role of version 3', () => {
  for (const role of PHOTO_ROLES) assert.ok(PLACE_CONTENT_ROLES_V3.includes(role), role)
})

test('alt text that names one offering links it, with the alt text as evidence', () => {
  const links = textLinksOf({ id: 'p1', alt: 'Padel class on court two at dusk' }, LIST)
  assert.deepEqual(links.depicts, {
    id: 'se_padel',
    evidence: { via: 'alt', quote: 'Padel class on court two at dusk' }
  })
  assert.equal(links.portraitOf, null)
})

test('the longer name wins over a name inside it, and two different offerings link none', () => {
  assert.equal(textLinksOf({ alt: 'Our junior tennis camp is back' }, LIST).depicts.id, 'se_camp')
  assert.equal(textLinksOf({ alt: 'Tennis class and padel class this weekend' }, LIST).depicts, null)
})

test('post text links when the alt text names nothing, a person by their full name', () => {
  const posts = [
    { id: 'post-7', source: 'instagram', caption: 'Mara Okonkwo coaching the Tennis class this morning' }
  ]
  const links = textLinksOf({ id: 'p2', alt: 'court', postId: 'post-7', source: 'instagram' }, LIST, posts)
  assert.equal(links.depicts.id, 'se_tennis')
  assert.equal(links.depicts.evidence.via, 'post')
  assert.equal(links.portraitOf.id, 'te_mara')
  // A first name alone is not sure enough.
  assert.equal(textLinksOf({ alt: 'Mara on court' }, LIST).portraitOf, null)
})

test('a model answer can only name items of the closed list; anything else is general', () => {
  const inList = heldVisionLinks(
    { depicts: 'se_tennis', depictsEvidence: 'a tennis net and yellow balls', portraitOf: 'te_theo' },
    LIST
  )
  assert.equal(inList.depicts, 'se_tennis')
  assert.equal(inList.portraitOf, 'te_theo')
  const invented = heldVisionLinks(
    { depicts: 'Squash lessons', portraitOf: 'te_guest', role: 'offering.image' },
    LIST
  )
  assert.equal(invented.depicts, GENERAL)
  assert.equal('portraitOf' in invented, false)
  // An offering role on a general photo becomes the gallery role: an unsure photo fills general slots only.
  assert.equal(invented.role, 'business.gallery_image')
  assert.equal(heldVisionLinks({ depicts: 'se_padel' }, { offerings: [], people: [] }).depicts, GENERAL)
})

test('boxes, people count and the graphic flag are held to their shape', () => {
  const held = heldVisionLinks(
    {
      depicts: 'general',
      role: 'person.image',
      subjectBox: [0.1, 0.2, 0.5, 0.6],
      faceBoxes: [[0.3, 0.25, 0.1, 0.12], [2, 0, 1, 1], 'x'],
      peopleCount: 2.4,
      isGraphic: false,
      isOwnPhoto: true
    },
    LIST
  )
  assert.deepEqual(held.subjectBox, [0.1, 0.2, 0.5, 0.6])
  assert.deepEqual(held.faceBoxes, [[0.3, 0.25, 0.1, 0.12]])
  assert.equal(held.peopleCount, 2)
  assert.equal(held.isGraphic, false)
  assert.equal(held.isOwnPhoto, true)
  // A person role without a named person is a gallery photo.
  assert.equal(held.role, 'business.gallery_image')
  const graphic = heldVisionLinks(
    { isGraphic: true, role: 'business.hero_image', content: 'text-graphic' },
    LIST
  )
  assert.equal(graphic.isGraphic, true)
  assert.equal(graphic.role, null)
  assert.equal(heldVisionLinks({ content: 'logo' }, LIST).role, 'business.logo')
  assert.equal(heldVisionLinks({ content: 'logo' }, LIST).isGraphic, true)
})

test('the old focus word is read from the subject box', () => {
  assert.equal(focusOfBox([0.4, 0.4, 0.2, 0.2]), 'center')
  assert.equal(focusOfBox([0, 0.3, 0.3, 0.4]), 'left')
  assert.equal(focusOfBox([0.7, 0.3, 0.3, 0.4]), 'right')
  assert.equal(focusOfBox([0.3, 0, 0.4, 0.2]), 'top')
  assert.equal(focusOfBox(null), null)
})

test('own or customer: the stated uploader first, a Google author named as the business is the owner', () => {
  assert.equal(ownershipOf({ uploaderRole: 'customer', source: 'website' }, 'Lantern Hill'), 'customer')
  assert.equal(ownershipOf({ source: 'website' }, 'Lantern Hill'), 'owner')
  const places = (author) => ({
    source: 'google-places',
    credit: { provider: 'Google', authors: [{ displayName: author }] }
  })
  assert.equal(ownershipOf(places('Lantern Hill Racquet Club'), 'Lantern Hill Racquet Club'), 'owner')
  assert.equal(ownershipOf(places('Pat Visitor'), 'Lantern Hill Racquet Club'), 'unknown')
})

test('a brief asset: text links win, then the model in the list, else general; nothing looked is null, not a guess', () => {
  const vision = {
    subject: 'service-in-action',
    content: 'people-in-action',
    depicts: 'se_tennis',
    depictsEvidence: 'tennis racket',
    role: 'offering.image',
    subjectBox: [0.2, 0.2, 0.6, 0.6],
    faceBoxes: [[0.4, 0.3, 0.1, 0.1]],
    peopleCount: 1,
    isGraphic: false,
    isOwnPhoto: false
  }
  const byAlt = assetRelationsOf(
    {
      id: 'p1',
      kind: 'image',
      alt: 'Padel class',
      source: 'website',
      labels: { vision: { labels: vision } }
    },
    { list: LIST, businessName: 'Lantern Hill Racquet Club' }
  )
  // The padel photo is never filed under tennis: the alt text the business wrote wins over the model.
  assert.equal(byAlt.depicts.id, 'se_padel')
  assert.equal(byAlt.role, 'offering.image')
  assert.deepEqual(byAlt.subjectBox, [0.2, 0.2, 0.6, 0.6])
  assert.equal(byAlt.peopleCount, 1)
  // The website is the business's own channel: its photo is its own whatever the model guessed.
  assert.equal(byAlt.isOwnPhoto, true)
  const byModel = assetRelationsOf(
    { id: 'p2', kind: 'image', source: 'google-places', labels: { vision: { labels: vision } } },
    { list: LIST, businessName: 'Lantern Hill Racquet Club' }
  )
  assert.deepEqual(byModel.depicts, { id: 'se_tennis', evidence: { via: 'vision', quote: 'tennis racket' } })
  assert.equal(byModel.isOwnPhoto, false)
  const unseen = assetRelationsOf({ id: 'p3', kind: 'image', source: 'google-places' }, { list: LIST })
  assert.deepEqual(unseen, {
    depicts: { id: GENERAL, evidence: { via: 'none' } },
    portraitOf: null,
    role: null,
    faceBoxes: [],
    peopleCount: null,
    isGraphic: null,
    isOwnPhoto: null
  })
})
