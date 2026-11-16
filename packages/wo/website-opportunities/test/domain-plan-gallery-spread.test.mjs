// A gallery shown on several pages is filled to its count (run 7 of the release gate): a gallery photo is shown once on
// the site (`picture-policy-own.mjs`), so a gallery the model repeats on a second page with the same photos lost them
// all to the first page and was cut to its minimum, said as "its photo does not fit the space". The gate now gives the
// second gallery photos the plan shows nowhere else while the business has them, and when it has none left it says so
// in the left out list with its own code and the count. Invented club, scripted fake model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-gallery-spread.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { composePlan } from '../domain/plan-composer.mjs'
import {
  PHOTOS,
  blockStore,
  brand,
  clubProfile,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from './fixtures/plan-composer/invented-club.mjs'

/** The club with `n` own gallery photos, the three of the fixture first. */
function clubWithPhotos(n) {
  const profile = clubProfile()
  const [first] = profile.items.gallery
  for (let i = profile.items.gallery.length; i < n; i++) {
    const url = `https://brindlewick-tennis.example/img/court-${i + 1}.jpg`
    profile.items.gallery.push({
      ...structuredClone(first),
      id: `gallery-court-${i + 1}`,
      fields: { 'business.gallery_image': { ...first.fields['business.gallery_image'], value: url } },
      label: `Court ${i + 1} in the morning`
    })
  }
  return profile
}

/** The team page may show the gallery too. */
function recipesWithTeamGallery() {
  const recipes = pageRecipes()
  recipes.recipes.find((r) => r.pageType === 'team').blocks.splice(2, 0, 'gallery-strip')
  return recipes
}

/** The model shows the same gallery photos on the home page and on the team page. */
function repeatedGallery(photos) {
  const c = goodComposition()
  c.pages[0].blocks.find((b) => b.block === 'gallery-strip').data = [...photos]
  c.pages[1].blocks.push({
    block: 'gallery-strip',
    label: 'Photos',
    data: [...photos],
    reason: 'Your courts.'
  })
  return c
}

const compose = (profile, composition) =>
  composePlan({
    profile,
    blockStore: blockStore(),
    pageRecipes: recipesWithTeamGallery(),
    library: library(),
    template: template(),
    brand: brand(),
    planId: 'plan-club',
    model: scriptedModel(JSON.stringify(composition))
  })
const galleries = (plan) =>
  plan.pages.flatMap((p) => p.blocks.filter((b) => b.block === 'gallery-strip').map((b) => b.data))

test('a gallery repeated on a second page takes photos shown nowhere else and keeps its count', async () => {
  const profile = clubWithPhotos(12)
  const six = profile.items.gallery.slice(0, 6).map((g) => g.id)
  const { plan } = await compose(profile, repeatedGallery(six))
  const [home, team] = galleries(plan)
  assert.equal(home.length, 6)
  assert.equal(team.length, 6, 'the second gallery is not cut')
  assert.deepEqual(
    home.filter((id) => team.includes(id)),
    [],
    'no photo is shown twice'
  )
  assert.equal(
    plan.leftOut.filter((e) => e.code === 'own_photo_unfit').length,
    0,
    'no photo is said not to fit'
  )
})

test('with no photo left, the cut gallery is said in the left out list with its code and count', async () => {
  const profile = clubWithPhotos(6)
  const six = profile.items.gallery.map((g) => g.id)
  const { plan } = await compose(profile, repeatedGallery(six))
  const [home, team] = galleries(plan)
  assert.equal(home.length, 6)
  assert.equal(team.length, 3, 'cut to its minimum: every photo already shows on the home page')
  const said = plan.leftOut.filter((e) => e.code === 'gallery_photo_shown_elsewhere')
  assert.equal(said.length, 1)
  assert.deepEqual(said[0].params, { count: 3 })
  assert.equal(said[0].kind, 'item')
  assert.match(said[0].reason, /3 photos/)
  assert.match(said[0].reason, /once/)
  assert.equal(plan.leftOut.filter((e) => e.code === 'own_photo_unfit').length, 0)
  assert.ok(PHOTOS.every((id) => home.includes(id)))
})
