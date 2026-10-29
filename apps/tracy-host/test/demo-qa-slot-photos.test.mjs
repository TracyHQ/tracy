// Post-build QA (#140, spec #132): a photo in an offering or person slot shows that offering or portrays that person,
// and a visible face belongs to a person the brief names, or is the owner's photo in a general slot. Pages are built
// here as the page reader returns them; the club, its classes, its people and its files are made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CHECK_IDS, demoQaBody, judge } from '../src/demo-qa.js'
import { checkFacesNamed, checkPhotosMatchSlots } from '../src/demo-qa-slot-photos.js'

const BRIEF_ITEMS = {
  offerings: [
    { id: 'svc-tennis', label: 'Tennis' },
    { id: 'svc-padel', label: 'Padel' }
  ],
  people: [{ id: 'person-wren', label: 'Wren Example' }]
}
const PHOTO_LINKS = {
  'asset-padel': { depicts: 'svc-padel', portraitOf: null, faces: 0, ownPhoto: true },
  'asset-tennis': { depicts: 'svc-tennis', portraitOf: null, faces: 0, ownPhoto: true },
  'asset-court': { depicts: 'general', portraitOf: null, faces: 0, ownPhoto: true },
  'asset-wren': { depicts: 'general', portraitOf: 'person-wren', faces: 1, ownPhoto: true },
  'asset-stranger': { depicts: 'general', portraitOf: null, faces: 1, ownPhoto: false },
  'asset-team-day': { depicts: 'general', portraitOf: null, faces: 3, ownPhoto: true }
}
const file = (name) => `images/tracy-content/${name}.jpg`
const PLACED_SOURCES = Object.fromEntries(Object.keys(PHOTO_LINKS).map((id) => [file(id), id]))

const img = (name, { selector = 'div.card > img', card = null } = {}) => ({
  src: `https://club.test/${file(name)}`,
  width: 400,
  height: 300,
  kind: 'img',
  selector,
  ...(card ? { card } : {})
})
const page = (path, images) => ({ path, status: 200, images })
const asked = (placedSlots = {}) => ({
  briefItems: BRIEF_ITEMS,
  photoLinks: PHOTO_LINKS,
  placedSources: PLACED_SOURCES,
  placedSlots
})

test('both checks are QA checks, and the request carries the brief items, photo links and placed slots', () => {
  assert.ok(CHECK_IDS.includes('photos-match-slots'))
  assert.ok(CHECK_IDS.includes('faces-named'))
  const body = demoQaBody({
    label: 'club',
    platform: 'joomla',
    briefItems: { offerings: [...BRIEF_ITEMS.offerings, { id: 7 }], people: BRIEF_ITEMS.people },
    photoLinks: { ...PHOTO_LINKS, 'asset-bad': 'not a link' },
    placedSlots: {
      [file('asset-padel')]: { slot: 'classes.item.1.image', role: 'offering.image', group: 'service' },
      [file('asset-court')]: 42
    }
  })
  assert.deepEqual(body.briefItems, BRIEF_ITEMS)
  assert.deepEqual(Object.keys(body.photoLinks).sort(), Object.keys(PHOTO_LINKS).sort())
  assert.deepEqual(body.placedSlots, {
    [file('asset-padel')]: {
      photo: null,
      slot: 'classes.item.1.image',
      role: 'offering.image',
      group: 'service',
      offering: null,
      person: null
    }
  })
})

test('a padel photo in the tennis card fails, naming the page, the slot and the photo', () => {
  const reads = [page('/classes', [img('asset-padel', { card: 'Tennis' })])]
  const placedSlots = {
    [file('asset-padel')]: { slot: 'classes.item.1.image', role: 'offering.image', group: 'service' }
  }
  const result = checkPhotosMatchSlots(reads, asked(placedSlots))
  assert.equal(result.id, 'photos-match-slots')
  assert.equal(result.pass, false)
  assert.equal(result.detail.length, 1, JSON.stringify(result.detail))
  const [finding] = result.detail
  assert.equal(finding.page, '/classes')
  assert.equal(finding.slot, 'classes.item.1.image')
  assert.equal(finding.photo, 'asset-padel')
  assert.equal(finding.file, file('asset-padel'))
  assert.match(finding.problem, /Padel.*Tennis/)
})

test('the photo is traced through the slot the build recorded, without placed sources', () => {
  const result = checkPhotosMatchSlots([page('/classes', [img('asset-padel', { card: 'Tennis' })])], {
    ...asked({
      [file('asset-padel')]: { photo: 'asset-padel', slot: 'classes.item.1.image', role: 'offering.image' }
    }),
    placedSources: {}
  })
  assert.equal(result.pass, false)
  assert.equal(result.detail[0].photo, 'asset-padel')
})

test('the tennis photo in the tennis card passes, whether the card is named by its words or by the build', () => {
  const byWords = checkPhotosMatchSlots(
    [page('/classes', [img('asset-tennis', { card: 'Tennis for juniors' })])],
    asked({ [file('asset-tennis')]: { slot: 'classes.item.1.image', role: 'offering.image' } })
  )
  assert.equal(byWords.pass, true, JSON.stringify(byWords.detail))
  const byBuild = checkPhotosMatchSlots(
    [page('/classes', [img('asset-tennis')])],
    asked({ [file('asset-tennis')]: { slot: 'classes.item.1.image', offering: 'svc-tennis' } })
  )
  assert.equal(byBuild.pass, true, JSON.stringify(byBuild.detail))
})

test('a card whose words name one offering is that offering slot even when the build recorded no slot', () => {
  const result = checkPhotosMatchSlots(
    [page('/', [img('asset-padel', { selector: 'div.class-card > img', card: 'Tennis lessons' })])],
    asked()
  )
  assert.equal(result.pass, false)
  assert.equal(result.detail[0].slot, 'div.class-card > img')
})

test('a photo linked to no offering never fills an offering slot; a gallery slot takes it', () => {
  const offeringSlot = checkPhotosMatchSlots(
    [page('/classes', [img('asset-court', { card: 'Tennis' })])],
    asked({ [file('asset-court')]: { slot: 'classes.item.1.image', role: 'offering.image' } })
  )
  assert.equal(offeringSlot.pass, false)
  assert.match(offeringSlot.detail[0].problem, /no offering/)
  const gallery = checkPhotosMatchSlots(
    [page('/', [img('asset-court', { card: 'Tennis' })])],
    asked({ [file('asset-court')]: { slot: 'gallery.item.1.image', role: 'business.gallery_image' } })
  )
  assert.equal(gallery.pass, true, JSON.stringify(gallery.detail))
})

test('an unnamed face in a coach slot fails both checks, each naming the page, the slot and the photo', () => {
  const reads = [page('/team', [img('asset-stranger', { card: 'Jordan Sample, head coach' })])]
  const placedSlots = {
    [file('asset-stranger')]: { slot: 'team.item.2.image', role: 'person.image', group: 'person' }
  }
  const faces = checkFacesNamed(reads, asked(placedSlots))
  assert.equal(faces.id, 'faces-named')
  assert.equal(faces.pass, false)
  assert.equal(faces.detail.length, 1, JSON.stringify(faces.detail))
  assert.equal(faces.detail[0].page, '/team')
  assert.equal(faces.detail[0].slot, 'team.item.2.image')
  assert.equal(faces.detail[0].photo, 'asset-stranger')
  const slot = checkPhotosMatchSlots(reads, asked(placedSlots))
  assert.equal(slot.pass, false)
  assert.match(slot.detail[0].problem, /portrays no person/)
})

test("the named coach's portrait in that coach's slot passes; in another person's card it fails", () => {
  const own = [page('/team', [img('asset-wren', { card: 'Wren Example' })])]
  const placedSlots = { [file('asset-wren')]: { slot: 'team.item.1.image', role: 'person.image' } }
  assert.equal(checkFacesNamed(own, asked(placedSlots)).pass, true)
  assert.equal(checkPhotosMatchSlots(own, asked(placedSlots)).pass, true)
  const other = checkPhotosMatchSlots(
    [page('/team', [img('asset-wren')])],
    asked({ [file('asset-wren')]: { slot: 'team.item.2.image', role: 'person.image', person: 'person-ash' } })
  )
  assert.equal(other.pass, false)
})

test("players' faces in an offering card pass", () => {
  const result = checkFacesNamed([page('/classes', [img('asset-players', { card: 'Padel' })])], {
    ...asked({
      [file('asset-players')]: {
        photo: 'asset-players',
        slot: 'classes.item.2.image',
        role: 'offering.image'
      }
    }),
    photoLinks: {
      ...PHOTO_LINKS,
      'asset-players': { depicts: 'svc-padel', portraitOf: null, faces: 4, ownPhoto: false }
    }
  })
  assert.equal(result.pass, true, JSON.stringify(result.detail))
})

test('unnamed faces in a gallery or general slot pass, whoever posted the photo', () => {
  const gallery = (name) =>
    checkFacesNamed(
      [page('/', [img(name)])],
      asked({ [file(name)]: { slot: 'gallery.item.1.image', role: 'business.gallery_image' } })
    )
  assert.equal(gallery('asset-team-day').pass, true)
  assert.equal(gallery('asset-stranger').pass, true)
})

test('pictures Tracy did not place and photos with no face are not judged for faces', () => {
  const reads = [
    page('/', [
      { src: 'https://club.test/images/demo/coach-1.jpg', width: 400, height: 300, kind: 'img' },
      img('asset-padel', { card: 'Padel' })
    ])
  ]
  const result = checkFacesNamed(reads, asked())
  assert.equal(result.pass, true)
  assert.match(result.measured, /^0 /)
})

test('judge runs both checks with the frame-shape and invented-number checks beside them', () => {
  const ids = judge([page('/', [img('asset-padel', { card: 'Tennis' })])], {
    ...demoQaBody({ label: 'club', platform: 'joomla' }),
    ...asked()
  }).map((c) => c.id)
  // test-quality: contract the judge answers every check id in CHECK_IDS order
  assert.deepEqual(ids, [...CHECK_IDS])
  for (const id of ['picture-frames-kept', 'facts-from-brief', 'photos-match-slots', 'faces-named'])
    assert.ok(ids.includes(id), id)
})
