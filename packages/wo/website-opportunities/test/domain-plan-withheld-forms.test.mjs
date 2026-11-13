// A held name in every form a picture or an id carries it (#597 review): a photo whose label, alt, caption or title
// says it shows a held person, and a file or an id named after one in slug form (`pellam-orrick`), is withheld whole:
// the plan gate refuses a plan that shows it (`withheld_shown`) and the profile the build steps read drops it. Invented
// club and people; no model is called.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-withheld-forms.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { heldNamesIn, heldSlugsIn } from '../domain/held-reviews.mjs'
import { composerContextOf } from '../domain/plan-composer.mjs'
import { gatePlan } from '../domain/plan-gate.mjs'
import { itemTextsOf, namesHeldInAnyForm, withoutWithheld, withWithheld } from '../domain/plan-withheld.mjs'
import {
  PHOTOS,
  blockStore,
  brand,
  clubProfile,
  goodComposition,
  library,
  pageRecipes,
  template
} from './fixtures/plan-composer/invented-club.mjs'

const HELD = 'Pellam Orrick'
const contextOf = (profile) =>
  composerContextOf({
    profile: withWithheld(profile, { withheld: { people: [HELD] } }),
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    brand: brand(),
    planId: 'plan-club'
  })
const photo = (profile, id) => profile.items.gallery.find((g) => g.id === id)

test('a held name in slug form: any separator or none between its words; one word stays a whole word', () => {
  for (const text of [
    'https://club.example/img/pellam-orrick-portrait.jpg',
    'gallery-https-club-example-img-pellam-orrick-portrait-jpg',
    'pellam_orrick.png',
    'PellamOrrick2.jpg',
    'Pellam  Orrick'
  ])
    assert.deepEqual(heldSlugsIn(text, [HELD]), [HELD], text)
  // Whole words find a name written with a separator, or written together as one whole token (privacy first); only
  // the slug form finds it split over several tokens of a run.
  assert.deepEqual(heldNamesIn('pellam-orrick-portrait.jpg', [HELD]), [HELD])
  assert.deepEqual(heldNamesIn('pellamorrick-portrait.jpg', [HELD]), [HELD])
  assert.deepEqual(heldNamesIn('pellamorrick2-portrait.jpg', [HELD]), [HELD])
  assert.deepEqual(heldNamesIn('xpellamorrick-portrait.jpg', [HELD]), [])
  assert.deepEqual(heldSlugsIn('pellamorrick-portrait.jpg', [HELD]), [HELD])
  for (const text of ['pellam-portrait.jpg', 'orrick-pellam.jpg', 'https://club.example/img/courts.jpg'])
    assert.deepEqual(heldSlugsIn(text, [HELD]), [], text)
  assert.deepEqual(heldSlugsIn('ann-portrait.jpg', ['Ann']), ['Ann'])
  assert.deepEqual(heldSlugsIn('joanna-portrait.jpg', ['Ann']), [])
  assert.equal(namesHeldInAnyForm(['clean', ['img/pellam-orrick.jpg']], [HELD]), true)
  assert.equal(namesHeldInAnyForm(['clean'], []), false)
})

test('an item is held by its id, label, alt, caption, title or any field value; never by its sources', () => {
  const item = {
    id: 'g1',
    label: 'Courts',
    alt: 'Courts at dusk',
    caption: 'Evening',
    title: 'Clay',
    fields: { 'business.gallery_image': { value: 'https://club.example/1.jpg', sources: ['site'] } },
    sources: ['pellam-orrick-site']
  }
  const texts = itemTextsOf(item)
  for (const t of ['g1', 'Courts', 'Courts at dusk', 'Evening', 'Clay', 'https://club.example/1.jpg'])
    assert.ok(texts.includes(t), t)
  assert.ok(!texts.includes('pellam-orrick-site'))
})

for (const where of ['label', 'alt', 'caption', 'title']) {
  test(`a photo whose ${where} says it shows a held person is withheld; a plan showing it is refused`, () => {
    const profile = clubProfile()
    photo(profile, PHOTOS[1])[where] = `${HELD} tying a net at the clubhouse`
    const context = contextOf(profile)
    assert.ok(context.data.withheld.has(PHOTOS[1]))
    const gated = gatePlan(goodComposition(), context)
    assert.equal(gated.ok, false)
    assert.ok(
      gated.problems.some((p) => p.code === 'withheld_shown' && p.message.includes(PHOTOS[1])),
      JSON.stringify(gated.problems.map((p) => p.code))
    )
    // The profile every build step reads holds it no more.
    const read = withoutWithheld(context.profile)
    assert.equal(photo(read, PHOTOS[1]), undefined)
    assert.ok(photo(read, PHOTOS[0]))
  })
}

test('a photo whose file and id are named after a held person is withheld whole, its id never renamed', () => {
  const profile = clubProfile()
  const g = photo(profile, PHOTOS[2])
  g.id = 'gallery-https-club-example-img-pellam-orrick-portrait-jpg'
  g.fields['business.gallery_image'] = {
    ...g.fields['business.gallery_image'],
    value: 'https://club.example/img/pellam-orrick-portrait.jpg'
  }
  const context = contextOf(profile)
  assert.ok(context.data.withheld.has(g.id))
  const read = withoutWithheld(context.profile)
  assert.equal(JSON.stringify(read.items).toLowerCase().includes('pellam-orrick'), false)
  // A fact whose value carries the slug (a social profile named after the held person) is withheld too.
  profile.facts['contact.social_url'] = [{ value: 'https://social.example/pellam_orrick', sources: ['site'] }]
  assert.equal(withoutWithheld(contextOf(profile).profile).facts['contact.social_url'], undefined)
})
