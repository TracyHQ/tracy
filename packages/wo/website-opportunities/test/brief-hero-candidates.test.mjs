// The brief's hero offers the build step up to three pictures to open the site with, never the logo (#1780).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as domain from '../domain/index.mjs'
import { fromPlace, makeSiteBrief } from '../src/brief-research.js'

const AT = '2026-10-26T10:00:00.000Z'
const HSC = JSON.parse(
  readFileSync(new URL('./fixtures/pictures/near-copies.json', import.meta.url), 'utf8')
).harbourSportClub
const byN = new Map(HSC.photos.map((p) => [p.n, p]))

/** A stored place picture as `wo_place_media` holds it. */
const row = (p, i) => ({
  id: p.id,
  status: 'stored',
  kind: 'image',
  category: 'other',
  sha256: String(i).padStart(64, '0'),
  mime: 'image/jpeg',
  width: p.width,
  height: p.height,
  bytes: p.bytes,
  dhash: p.dhash,
  labels: { features: { v: 1, ...p.features } },
  source: p.source,
  source_url: p.sourceUrl ?? `https://${p.source}.test/${p.n}.jpg`
})

const briefOf = (media, brand = null) =>
  makeSiteBrief(domain, fromPlace({ sources: [], profile: { name: 'Harbour Sport Club' }, brand, media }), {
    opportunity: { id: 'o1', name: 'Harbour Sport Club', candidate: { trade: 'fitness' } },
    madeAt: AT
  })
const heroOf = (brief) => brief.sitemap.find((p) => p.slug === 'home').sections.find((s) => s.kind === 'hero')

test("Harbour Sport Club's hero offers its three largest Google photos, the logo none of them", () => {
  const logo = byN.get(HSC.logo)
  const brief = briefOf(HSC.photos.map(row), {
    logoResearch: {
      status: 'found',
      chosen: { mediaId: logo.id },
      candidates: [
        { mediaId: logo.id, via: 'social-profile', source: 'instagram', reading: { isLogo: true } }
      ]
    }
  })
  assert.deepEqual(domain.validateBrief(brief).errors, [])
  const hero = heroOf(brief)
  const google = [24, 28, 31].map((n) => byN.get(n).id)
  assert.deepEqual(hero.assetIds, google)
  assert.deepEqual(hero.heroCandidates[0], {
    id: google[0],
    width: 1600,
    height: 2133,
    source: 'google-places'
  })
  assert.ok(!hero.assetIds.includes(logo.id))
  const md = domain.renderBriefMarkdown(brief)
  assert.match(
    md,
    new RegExp(`Hero candidates \\(largest first, pick one\\): ${google[0]} \\(1600x2133, google-places\\)`)
  )
})

test('with only a logo and a profile picture the hero has no picture at all', () => {
  const logo = byN.get(HSC.logo)
  const brief = briefOf([row(logo, 0)])
  const hero = heroOf(brief)
  assert.deepEqual(hero.assetIds, [])
  assert.equal('heroCandidates' in hero, false)
  assert.deepEqual(domain.validateBrief(brief).errors, [])
})

test('a Google Maps menu photo leaves the hero candidates, and nothing takes its place', () => {
  const photos = HSC.photos.map(row)
  const menuPhoto = byN.get(24)
  const read = fromPlace({ sources: [], profile: { name: 'Harbour Sport Club' }, brand: null, media: photos })
  read.profile.reviewSources = {
    googleMaps: { media: [], menuPhotos: [{ mediaId: menuPhoto.id, url: 'https://maps.test/menu.jpg' }] }
  }
  const brief = makeSiteBrief(domain, read, {
    opportunity: { id: 'o1', name: 'Harbour Sport Club', candidate: { trade: 'fitness' } },
    madeAt: AT
  })
  assert.deepEqual(domain.validateBrief(brief).errors, [])
  const hero = heroOf(brief)
  assert.deepEqual(
    hero.assetIds,
    [28, 31].map((n) => byN.get(n).id)
  )
  assert.deepEqual(
    hero.heroCandidates.map((h) => h.id),
    hero.assetIds
  )
})
