import assert from 'node:assert/strict'
import { test } from 'node:test'
import { logoIdsOf } from '../src/opportunities-build/handoff.js'
import { briefBrand } from '../src/opportunities-build/revisions.js'

const research = {
  status: 'found',
  chosen: { mediaId: 'L1', via: 'social-profile', source: 'instagram', recognised: 'vision' },
  candidates: [
    {
      mediaId: 'L1',
      via: 'social-profile',
      source: 'instagram',
      width: 320,
      height: 320,
      reading: { isLogo: true, kind: 'logo', readsAs: 'x' },
      objectKey: 'k',
      url: 'https://x'
    },
    {
      mediaId: 'L2',
      via: 'jsonld-logo',
      source: 'website',
      width: 90,
      height: 40,
      reading: { isLogo: true, kind: 'logo' }
    },
    {
      mediaId: 'L3',
      via: 'icon',
      source: 'website',
      width: 32,
      height: 32,
      reading: { isLogo: false, kind: 'service-icon' }
    },
    { mediaId: 'L4', via: 'img-named', source: 'website', width: 100, height: 100 },
    {
      mediaId: 'L5',
      via: 'img-named',
      source: 'website',
      width: 100,
      height: 100,
      reading: { isLogo: true, kind: 'logo' }
    },
    {
      mediaId: 'L6',
      via: 'img-named',
      source: 'website',
      width: 100,
      height: 100,
      reading: { isLogo: true, kind: 'logo' }
    }
  ]
}

test('the brief brand carries the chosen logo id and a trimmed candidate list on top of the website observation', () => {
  const website = {
    origin: 'website',
    official: false,
    colors: [{ hex: '#111111', role: 'primary' }],
    fonts: [],
    evidence: []
  }
  const out = briefBrand({ website, social: null, logoResearch: research })
  assert.equal(out.origin, 'website')
  assert.equal(out.logo, 'L1')
  assert.equal(out.logoResearch.status, 'found')
  assert.equal(out.logoResearch.candidates.length, 6)
  assert.deepEqual(Object.keys(out.logoResearch.candidates[0]).sort(), [
    'height',
    'mediaId',
    'reading',
    'source',
    'via',
    'width'
  ])
  assert.deepEqual(out.logoResearch.candidates[3].reading, null)
  assert.deepEqual(out.colors, website.colors)
})

test('no logo found is carried as a state on a bare brand; no research at all leaves the brand as it was', () => {
  const none = briefBrand({
    website: null,
    social: null,
    logoResearch: { status: 'none', chosen: null, candidates: [] }
  })
  assert.equal(none.logo, undefined)
  assert.equal(none.logoResearch.status, 'none')
  assert.deepEqual(none.colors, [])
  assert.equal(briefBrand({ website: { origin: 'website', colors: [] } }).logoResearch, undefined)
  assert.equal(briefBrand(null), null)
})

test('the logo handed to the site is the chosen one first, then at most two others the model also called a logo', () => {
  assert.deepEqual(
    logoIdsOf({ logo: 'L1', logoResearch: briefBrand({ logoResearch: research }).logoResearch }),
    ['L1', 'L2', 'L5']
  )
  assert.deepEqual(logoIdsOf({ logoResearch: { status: 'none', candidates: [] } }), [])
  assert.deepEqual(logoIdsOf(null), [])
})
