// Photos tied to an offering or a person reach that item (#575 pictures gap audit, port 4): the research's vision label
// `depicts` puts a photo on the service it names, `portraitOf` on the person it names, as the step chain matched them
// (`photo-shortlist.js` `sameService`, `portraitsOf`); a team member photo goes with its person only, and a person only
// customers named gets a portrait only when a picture is tied to them by id. Invented club, invented pictures.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-needs-profile-tied-pictures.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeItems } from '../domain/needs-profile-merge.mjs'
import { structuredObservations } from '../domain/needs-profile-observations.mjs'
import { typedObservations } from '../domain/needs-profile-typed.mjs'
import { mediaOf } from '../domain/needs-research-media.mjs'

const asset = (id, more = {}) => ({
  id,
  kind: 'image',
  source: 'website',
  content: 'people-in-action',
  uploaderRole: 'owner',
  credit: '',
  caption: `Invented photo ${id}`,
  ...more
})
const brief = {
  assets: [
    asset('a-pads', { depicts: { id: 'svc-pads', evidence: { via: 'vision' } } }),
    asset('a-coach', { portraitOf: { id: 'team-ilse', evidence: { via: 'vision' } } }),
    asset('a-team-other', { portraitOf: { id: 'team-nobody', evidence: { via: 'vision' } } }),
    asset('a-ring', { depicts: { id: 'general', evidence: { via: 'vision' } } })
  ],
  sitemap: [
    { sections: [{ kind: 'team', assetIds: ['a-coach', 'a-team-other'] }] },
    { sections: [{ kind: 'gallery', assetIds: ['a-pads', 'a-ring'] }] }
  ]
}
const manifest = brief.assets.map((a) => ({
  id: a.id,
  sourceUrl: `https://harbour-boxing.example/img/${a.id}.jpg`
}))

function sourcesOf() {
  const website = {
    id: 'src-website',
    origin: 'website',
    pictures: [],
    items: [
      { id: 'svc-pads', kind: 'service', fields: { 'offering.name': 'Pad work' }, evidence: 'Pad work' },
      {
        id: 'team-ilse',
        kind: 'person',
        fields: { 'person.name': 'Ilse Varno' },
        evidence: 'Ilse Varno',
        namedBy: 'customer'
      }
    ]
  }
  mediaOf(brief, manifest, (name) => (name === 'website' ? website : null))
  return [website]
}

test('a photo goes to the offering it depicts, a portrait to its person, the rest to the gallery', () => {
  const sources = sourcesOf()
  const observed = structuredObservations(sources)
  const typed = typedObservations(sources)
  const items = mergeItems([...typed.items, ...observed.items], [])
  const service = items.service.find((i) => i.fields['offering.name'].value === 'Pad work')
  assert.equal(service.fields['offering.image'].value, manifest[0].sourceUrl)
  const person = items.person.find((i) => i.fields['person.name'].value === 'Ilse Varno')
  assert.equal(person.fields['person.image'].value, manifest[1].sourceUrl)
  // The customer named mark stays: the portrait is tied to them by id, nothing else.
  assert.equal(person.namedBy, 'customer')
  assert.deepEqual(
    items.gallery.map((g) => g.fields['business.gallery_image'].value),
    [manifest[3].sourceUrl]
  )
  // A team member photo whose person the research does not hold is never a gallery photo.
  assert.ok(
    observed.dropped.some((d) => d.code === 'portrait_without_person' && d.picture === 'a-team-other')
  )
})

test('a person only customers named gets no portrait without a picture tied to them by id', () => {
  const sources = sourcesOf()
  sources[0].pictures = sources[0].pictures.filter((p) => p.id !== 'a-coach')
  const items = mergeItems(
    [...typedObservations(sources).items, ...structuredObservations(sources).items],
    []
  )
  const person = items.person.find((i) => i.fields['person.name'].value === 'Ilse Varno')
  assert.equal(person.fields['person.image'], undefined)
})
