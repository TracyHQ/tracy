// What each picture of a brief is (F08): its size, orientation and resolution grade read from the file itself, and what it
// shows with a short caption when a vision model has looked at it; "unlabelled" when none has, never "other".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as domain from '../domain/index.mjs'
import { fromPlace, makeSiteBrief, withCachedVision } from '../src/brief-research.js'

const AT = '2026-10-26T10:00:00.000Z'
const sha = (i) => String(i).padStart(64, '0')

/** A stored place picture of the fictional Harbour Sport Club, as `wo_place_media` holds it. */
const row = (id, width, height, extra = {}) => ({
  id,
  status: 'stored',
  kind: 'image',
  category: 'other',
  sha256: sha(id.length * 7 + width),
  mime: 'image/jpeg',
  width,
  height,
  bytes: width * height,
  labels: null,
  source: 'google-places',
  source_url: `https://photos.test/${id}.jpg`,
  ...extra
})
const seen = (labels) => ({ labels: { vision: { key: 'model-x|p3', model: 'model-x', labels } } })

const briefOf = (media) =>
  makeSiteBrief(
    domain,
    fromPlace({ sources: [], profile: { name: 'Harbour Sport Club' }, brand: null, media }),
    {
      opportunity: { id: 'o1', name: 'Harbour Sport Club', candidate: { trade: 'fitness' } },
      madeAt: AT
    }
  )
const heroOf = (brief) => brief.sitemap.find((p) => p.slug === 'home').sections.find((s) => s.kind === 'hero')

test('orientation and resolution grade come from the size alone', () => {
  assert.equal(domain.orientationOf(1920, 1080), 'landscape')
  assert.equal(domain.orientationOf(1080, 1080), 'square')
  assert.equal(domain.orientationOf(1600, 2133), 'portrait')
  assert.equal(domain.orientationOf(null, 1080), 'unknown')
  assert.equal(domain.resolutionGradeOf(1920, 1080), 'high')
  assert.equal(domain.resolutionGradeOf(1600, 2133), 'high')
  assert.equal(domain.resolutionGradeOf(1200, 800), 'medium')
  assert.equal(domain.resolutionGradeOf(640, 360), 'low')
  assert.equal(domain.resolutionGradeOf(0, 0), 'unknown')
})

test('content and caption come from a vision label; a picture nobody looked at is unlabelled', () => {
  assert.deepEqual(domain.assetLabelsOf({ width: 640, height: 360 }), {
    width: 640,
    height: 360,
    orientation: 'landscape',
    quality: 'low',
    content: 'unlabelled'
  })
  const caption = 'A coach guides two swimmers through a drill in the outdoor pool at dusk'
  assert.deepEqual(
    domain.assetLabelsOf({
      width: 2000,
      height: 1200,
      labels: { vision: { labels: { content: 'people-in-action', caption, subject: 'people' } } }
    }),
    {
      width: 2000,
      height: 1200,
      orientation: 'landscape',
      quality: 'high',
      content: 'people-in-action',
      caption
    }
  )
  // A label made before the content field: its subject maps when it says one thing only, and its line is the caption.
  const old = (subject) =>
    domain.assetLabelsOf({ width: 900, height: 900, vision: { subject, oneLine: 'A plate of grilled fish' } })
  assert.equal(old('interior').content, 'venue-interior')
  assert.equal(old('exterior').content, 'venue-exterior')
  assert.equal(old('drink').content, 'food')
  assert.equal(old('poster').content, 'text-graphic')
  assert.equal(old('service-in-action').content, 'people-in-action')
  assert.equal(old('people').content, 'unlabelled')
  assert.equal(old('interior').caption, 'A plate of grilled fish')
  // An answer outside the vocabulary is not trusted, and a caption is cut under 125 characters at a word.
  const long = domain.assetLabelsOf({
    width: 900,
    height: 900,
    vision: { content: 'sunset', caption: 'word '.repeat(60) }
  })
  assert.equal(long.content, 'unlabelled')
  assert.ok(long.caption.length <= 125, long.caption.length)
  assert.ok(!long.caption.endsWith(' '))
  // The vocabulary is the brief's contract with whoever builds the site: brief-schema.json must name the same values.
  const asset = JSON.parse(readFileSync(new URL('../domain/brief-schema.json', import.meta.url), 'utf8'))
    .properties.assets.items.properties
  assert.deepEqual(asset.content.enum, domain.ASSET_CONTENT)
  assert.deepEqual(asset.orientation.enum, domain.ASSET_ORIENTATIONS)
  assert.deepEqual(asset.quality.enum, domain.ASSET_QUALITIES)
})

test("the brief's assets carry size, orientation, grade and content, and still validate", () => {
  const brief = briefOf([
    row('pool', 2000, 1200, seen({ content: 'venue-exterior', caption: 'The outdoor pool at dusk' })),
    row('thumb', 640, 360)
  ])
  assert.deepEqual(domain.validateBrief(brief).errors, [])
  const byId = new Map(brief.assets.map((a) => [a.id, a]))
  assert.deepEqual(byId.get('pool'), {
    id: 'pool',
    kind: 'image',
    // What the model saw sets the category (venue-exterior is a space).
    category: 'space',
    sha256: byId.get('pool').sha256,
    width: 2000,
    height: 1200,
    orientation: 'landscape',
    quality: 'high',
    content: 'venue-exterior',
    caption: 'The outdoor pool at dusk'
  })
  assert.equal(byId.get('thumb').content, 'unlabelled')
  assert.equal(byId.get('thumb').quality, 'low')
  const md = domain.renderBriefMarkdown(brief)
  assert.match(
    md,
    /- pool: image, venue-exterior, space, landscape 2000x1200, quality high, "The outdoor pool at dusk"/
  )
  assert.match(md, /- thumb: image, unlabelled, other, landscape 640x360, quality low/)
})

test('validation refuses an asset label outside its vocabulary', () => {
  const brief = briefOf([row('pool', 2000, 1200)])
  brief.assets[0].content = 'sunset'
  brief.assets[0].orientation = 'diagonal'
  const fields = domain.validateBrief(brief).errors.map((e) => e.field ?? e.path ?? String(e))
  assert.ok(
    fields.some((f) => String(f).includes('assets[0].content')),
    JSON.stringify(fields)
  )
  assert.ok(
    fields.some((f) => String(f).includes('assets[0].orientation')),
    JSON.stringify(fields)
  )
})

test('the hero prefers a landscape, high-grade photo of people at work or the venue over a larger portrait', () => {
  const brief = briefOf([
    row('tall', 1600, 2133),
    row('flyer', 2400, 1600, seen({ content: 'text-graphic', caption: 'A class timetable' })),
    row('class', 1920, 1080, seen({ content: 'people-in-action', caption: 'A spin class in full swing' })),
    row('wide-small', 1200, 800),
    row('badge', 3000, 2000, seen({ content: 'logo' }))
  ])
  assert.deepEqual(domain.validateBrief(brief).errors, [])
  const hero = heroOf(brief)
  assert.deepEqual(hero.assetIds, ['class', 'tall', 'wide-small'])
  const md = domain.renderBriefMarkdown(brief)
  assert.match(md, /Hero candidates \(best first, pick one\): class \(1920x1080, google-places\)/)
})

test('cached vision labels from the shared analysis table reach place pictures, the newest done answer first', () => {
  const media = [
    { id: 'a', sha256: sha(1), labels: { features: { v: 1 } } },
    { id: 'b', sha256: sha(2) }
  ]
  const out = withCachedVision(media, [
    {
      media_sha256: sha(1),
      model: 'm',
      version: 'm|p2',
      result: { subject: 'interior' },
      updated_at: '2026-10-01'
    },
    {
      media_sha256: sha(1),
      model: 'm',
      version: 'm|p3',
      result: { subject: 'interior', content: 'venue-interior' },
      updated_at: '2026-10-20'
    }
  ])
  assert.deepEqual(out[0].labels, {
    features: { v: 1 },
    vision: { key: 'm|p3', model: 'm', labels: { subject: 'interior', content: 'venue-interior' } }
  })
  assert.equal(out[1], media[1])
})
