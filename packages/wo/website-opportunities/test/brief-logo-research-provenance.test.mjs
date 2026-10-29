// A selected social avatar does not prove its words were read. Keep why alongside the chosen image in every brief.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { briefBrand } from '../src/brief-research.js'
import { withNameDecision } from '../src/business-name.js'

for (const { listing, handle, mark, name } of [
  {
    listing: 'Bakery & Cafe',
    handle: 'maple.crust',
    mark: 'MAPLE CRUST BAKEHOUSE EST. 2019',
    name: 'Maple Crust Bakehouse'
  },
  {
    listing: 'Dental Clinic',
    handle: 'pearl.dental',
    mark: 'PEARL DENTAL STUDIO EST. 2020',
    name: 'Pearl Dental Studio'
  }
]) {
  test(`${listing}: a brief preserves why a chosen social logo has no name reading`, () => {
    const vision = { status: 'not_tested', calls: 0, promptTokens: 0, completionTokens: 0, cents: 0 }
    const logoResearch = {
      version: 'l3',
      at: '2026-10-29T10:00:00.000Z',
      status: 'found',
      chosen: { mediaId: 'logo-1', recognised: 'words', showsName: null, readsAs: null },
      candidates: [{ mediaId: 'logo-1', source: 'instagram', via: 'social-profile', reading: null }],
      vision
    }
    const brand = briefBrand({ social: { name: listing }, logoResearch })
    assert.deepEqual(brand.logoResearch.vision, vision)
    assert.equal(brand.logoResearch.version, 'l3')
    assert.equal(brand.logoResearch.at, logoResearch.at)
    assert.equal(brand.logoResearch.chosen.readsAs, null)
    assert.equal(
      withNameDecision(
        { name: listing, nameClaims: [{ source: 'instagram', name: handle, via: 'handle' }] },
        { brand }
      ).name,
      listing,
      'an unread avatar never turns its handle into an invented display name'
    )
  })

  test(`${listing}: the brief keeps observed logo words with their reading provenance`, () => {
    const reading = {
      isLogo: true,
      kind: 'logo',
      showsName: true,
      readsAs: mark,
      key: 'fictional-vision|low|l3|512',
      at: '2026-10-29T10:00:00.000Z'
    }
    const result = briefBrand({
      logoResearch: {
        status: 'found',
        chosen: { mediaId: 'logo-1', recognised: 'vision', showsName: true, readsAs: mark },
        candidates: [{ mediaId: 'logo-1', reading }],
        vision: { status: 'complete', calls: 1 }
      }
    })
    assert.deepEqual(result.logoResearch.candidates[0].reading, reading)
    assert.equal(
      withNameDecision(
        { name: listing, nameClaims: [{ source: 'instagram', name: handle, via: 'handle' }] },
        { brand: result }
      ).name,
      name,
      'the observed logo spelling supplies a name that its handle supports'
    )
  })
}
