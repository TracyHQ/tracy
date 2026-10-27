import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contractCopyPins, slotFillPins } from '../domain/contract-copy-pins.mjs'

const write = (slotKey, state, value, extra = {}) => ({
  slotKey,
  groupId: 'g',
  role: extra.role ?? 'offering.name',
  mode: extra.mode ?? 'copy',
  value,
  state,
  factRefs: state === 'sourced' || state === 'composed' ? ['fact_1'] : [],
  ...extra
})
const plan = (writes) => ({
  version: 'slot-fill/1',
  locale: 'en',
  writes,
  manifest: writes.map(({ slotKey, state, factRefs }) => ({ slotKey, state, locale: 'en', factRefs })),
  offerings: [
    { entityId: 'd1', kind: 'dish', name: 'Pho bo', description: '', price: '12' },
    { entityId: 's1', kind: 'service', name: 'Massage', description: '', price: '60' }
  ]
})
const contentMap = {
  slots: [
    { key: 'name', type: 'text', maxCharacters: 12 },
    { key: 'price', type: 'text', maxCharacters: 6 },
    { key: 'href', type: 'url', maxCharacters: 200 },
    { key: 'lead', type: 'text', maxCharacters: 100 },
    { key: 'photo', type: 'image' },
    { key: 'spare', type: 'text', maxCharacters: 40 }
  ]
}

test('sourced, neutral and empty slots become pins; composed and pictures are left to the planner and the pictures', () => {
  const out = slotFillPins({
    plan: plan([
      write('name', 'sourced', 'Duck salad with herbs', { entityId: 'd1' }),
      write('price', 'sourced', '12', { role: 'offering.price', mode: 'format', entityId: 'd1' }),
      write('href', 'sourced', 'tel:+84901234567', { role: 'contact.cta_url' }),
      write('lead', 'composed', null, { role: 'business.summary' }),
      write('photo', 'sourced', { mediaId: 'm1' }, { role: 'offering.image', mode: 'asset' }),
      write('spare', 'neutral', 'Menu item', { neutralKey: 'neutral.offering.menu_item' })
    ]),
    contentMap
  })
  assert.deepEqual(out.pins, {
    name: 'Duck salad…',
    price: '12',
    href: 'tel:+84901234567',
    spare: 'Menu item'
  })
  assert.equal(out.sources.name, 'd1')
  assert.equal(out.sources.spare, 'placeholder')
  assert.deepEqual(out.placeholders, ['spare'])
  assert.deepEqual(out.dishes, [{ name: 'Pho bo', description: '', price: '12' }])
  assert.deepEqual(
    out.manifest.map((e) => [e.slotKey, e.state]),
    [
      ['name', 'sourced'],
      ['price', 'sourced'],
      ['href', 'sourced'],
      ['lead', 'composed'],
      ['photo', 'sourced'],
      ['spare', 'neutral']
    ]
  )
})

test('a verbatim or formatted value too long for its slot is emptied, never cut', () => {
  const out = slotFillPins({
    plan: plan([write('price', 'sourced', '120.000.000', { role: 'offering.price', mode: 'format' })]),
    contentMap
  })
  assert.equal(out.pins.price, '')
  assert.equal(out.manifest[0].state, 'empty')
  assert.deepEqual(out.manifest[0].factRefs, [])
})

test('a slot this release lacks, or a link the site would refuse, is skipped and said', () => {
  const out = slotFillPins({
    plan: plan([
      write('gone', 'sourced', 'x'),
      write('href', 'sourced', 'javascript:alert(1)', { role: 'contact.cta_url' })
    ]),
    contentMap
  })
  assert.deepEqual(out.pins, {})
  assert.deepEqual(
    out.skipped.map((s) => s.role),
    ['gone', 'href']
  )
})

test('without a sidecar the hand-made map still pins as before', () => {
  const out = contractCopyPins({
    map: { roles: { 'hero.title': [{ text: 'name' }] } },
    contentMap,
    pinned: { 'hero.title': { value: 'Iron Gym', source: 'business.name' } }
  })
  assert.deepEqual(out.pins, { name: 'Iron Gym' })
})

test('an empty call to action pins its empty label and leaves its link to the template: no door takes an empty link', () => {
  const out = slotFillPins({
    plan: plan([
      write('spare', 'empty', '', { role: 'contact.cta_label' }),
      write('href', 'empty', '', { role: 'contact.cta_url' })
    ]),
    contentMap
  })
  assert.deepEqual(out.pins, { spare: '' })
})

// A profile whose Pho bo has a photo (media m1, the build's picture p-pho) and whose Bun cha has none.
const pictureProfile = {
  media: [{ id: 'm1', value: { sha256: 'sha-pho', relations: [{ entityId: 'd1', relation: 'depicts' }] } }],
  evidence: []
}
const buildPictures = [
  { id: 'p-pho', sha256: 'sha-pho', vision: { subject: 'food' } },
  { id: 'p-room', sha256: 'sha-room', vision: { subject: 'interior' } }
]

test('each card picture is its own entity’s photo; one with none is bound to the placeholder and says empty', () => {
  const out = slotFillPins({
    plan: plan([
      write('photo', 'sourced', { mediaId: 'm1' }, { role: 'offering.image', mode: 'asset', entityId: 'd1' }),
      write('photo2', 'empty', '', { role: 'offering.image', mode: 'asset', entityId: 'd2' }),
      write('ghost', 'sourced', { mediaId: 'm9' }, { role: 'offering.image', mode: 'asset', entityId: 'd3' })
    ]),
    contentMap,
    profile: pictureProfile,
    pictures: buildPictures
  })
  assert.deepEqual(out.pictures, { photo: 'p-pho', photo2: null, ghost: null })
  // A sourced picture the build does not hold is not on the page: the manifest says so.
  assert.deepEqual(
    out.manifest.map((e) => [e.slotKey, e.state]),
    [
      ['photo', 'sourced'],
      ['photo2', 'empty'],
      ['ghost', 'empty']
    ]
  )
  assert.deepEqual(out.manifest[2].factRefs, [])
  assert.equal(out.dishes[0].pictureId, 'p-pho')
})

test('a team member with no photo shows the place’s space, said neutral; with no space photo, the placeholder, said empty', () => {
  const team = plan([write('face', 'empty', '', { role: 'person.image', mode: 'asset', entityId: 'p1' })])
  const withRoom = slotFillPins({ plan: team, contentMap, profile: pictureProfile, pictures: buildPictures })
  assert.deepEqual(withRoom.pictures, { face: { space: true } })
  assert.deepEqual(withRoom.manifest[0].state, 'neutral')
  const without = slotFillPins({
    plan: team,
    contentMap,
    profile: pictureProfile,
    pictures: buildPictures.slice(0, 1)
  })
  assert.deepEqual(without.pictures, { face: null })
  assert.equal(without.manifest[0].state, 'empty')
})

test('a reviewer’s avatar goes beside that reviewer’s own words, matched by the media row its locator names', () => {
  const out = slotFillPins({
    plan: plan([
      write(
        'avatar',
        'sourced',
        { mediaId: 'm2' },
        { role: 'quote.author_image', mode: 'asset', entityId: 'q1' }
      )
    ]),
    contentMap,
    profile: {
      media: [
        {
          id: 'm2',
          evidenceRefs: ['e2'],
          value: { relations: [{ entityId: 'q1', relation: 'portrait-of' }] }
        }
      ],
      evidence: [{ id: 'e2', locator: { kind: 'jsonPath', value: '$.media[id="p-ana"]' } }]
    },
    pictures: [{ id: 'p-ana', sha256: 'sha-ana', vision: null }]
  })
  assert.deepEqual(out.pictures, { avatar: 'p-ana' })
})
