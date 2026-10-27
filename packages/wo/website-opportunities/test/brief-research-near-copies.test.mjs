import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { briefBrand, fromPlace } from '../src/brief-research.js'
import { heroCandidates } from '../domain/pictures/brief-media.mjs'

const FIXTURE = JSON.parse(
  readFileSync(new URL('./fixtures/pictures/near-copies.json', import.meta.url), 'utf8')
)
const HSC = FIXTURE.harbourSportClub
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

const viewOf = (media, brand = null) => ({
  sources: [],
  profile: { name: 'Harbour Sport Club' },
  brand,
  media
})

test("a brief of Harbour Sport Club's 23 photos keeps one copy of each, the sharper Google one", () => {
  const read = fromPlace(viewOf(HSC.photos.map(row)))
  const ids = read.media.map((m) => m.id)
  for (const [instagram, google] of HSC.copies) {
    assert.ok(!ids.includes(byN.get(instagram).id), `Instagram #${instagram} is a copy of Google #${google}`)
    assert.ok(ids.includes(byN.get(google).id), `Google #${google} stays`)
  }
  assert.equal(ids.length, 20)
})

test('different pictures with close fingerprints all reach the brief', () => {
  for (const [i, pair] of FIXTURE.different.entries()) {
    // Not a website's pictures, so the junk rules (`media-junk.js`) leave even the small icon in.
    const media = [pair.a, pair.b].map((p, k) =>
      row({ ...p, n: `${i}-${k}`, id: `m${i}-${k}`, source: 'instagram' }, k)
    )
    const read = fromPlace(viewOf(media))
    assert.equal(read.media.length, 2, `${pair.what} (${pair.bits} bits apart) are two pictures`)
  }
})

test('the logo is never set aside as a copy, even of a larger picture', () => {
  const logo = byN.get(17)
  const brand = { logoResearch: { status: 'found', chosen: { mediaId: logo.id }, candidates: [] } }
  const read = fromPlace(viewOf(HSC.photos.map(row), brand))
  assert.ok(read.media.some((m) => m.id === logo.id))
})

test("the hero candidates of Harbour Sport Club's brief are its three largest Google photos, never the logo", () => {
  const logo = byN.get(HSC.logo)
  const view = viewOf(HSC.photos.map(row), {
    logoResearch: {
      status: 'found',
      chosen: { mediaId: logo.id },
      candidates: [
        { mediaId: logo.id, via: 'social-profile', source: 'instagram', reading: { isLogo: true } }
      ]
    }
  })
  const read = fromPlace(view)
  const heroes = heroCandidates(read.media, briefBrand(read.brand))
  // #24, #28, #31 are 1600 x 2133, the most pixels; all ten Google photos are portrait.
  assert.deepEqual(
    heroes.map((h) => h.id),
    [24, 28, 31].map((n) => byN.get(n).id)
  )
  assert.deepEqual(heroes[0], { id: byN.get(24).id, width: 1600, height: 2133, source: 'google-places' })
})

test('a profile picture is no hero candidate even when no logo was chosen', () => {
  const avatar = byN.get(HSC.logo)
  const photo = byN.get(21)
  const read = fromPlace(viewOf([avatar, photo].map(row)))
  // The Instagram profile picture, 1080 x 1080, has more pixels than the 567 x 640 post photo.
  assert.deepEqual(
    heroCandidates(read.media, null).map((h) => h.id),
    [photo.id]
  )
})

test('videos, pictures without a size and logo candidates are no hero candidates; none left is an empty list', () => {
  const media = [
    {
      id: 'v',
      kind: 'video',
      width: 1920,
      height: 1080,
      source: 'instagram',
      sourceUrl: 'https://i.test/v.mp4'
    },
    {
      id: 'u',
      kind: 'image',
      width: null,
      height: null,
      source: 'website',
      sourceUrl: 'https://w.test/u.jpg'
    },
    {
      id: 'l',
      kind: 'image',
      width: 2000,
      height: 1000,
      source: 'website',
      sourceUrl: 'https://w.test/l.png'
    }
  ]
  const brand = {
    logoResearch: {
      status: 'found',
      chosen: null,
      candidates: [{ mediaId: 'l', via: 'img-named', reading: null }]
    }
  }
  assert.deepEqual(heroCandidates(media, brand), [])
})
