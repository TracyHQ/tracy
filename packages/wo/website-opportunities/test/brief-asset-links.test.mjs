// Brief assets carry their links to the brief's own offerings and people, from research to the brief (#48). The seam: a
// researched place (fictional: the Lantern Hill Racquet Club) goes through `fromPlace` and `makeSiteBrief`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as domain from '../domain/index.mjs'
import { checkBusinessReading, readingSourcesOf } from '../domain/business-reading.mjs'
import { fromPlace, makeSiteBrief } from '../src/brief-research.js'

const AT = '2026-10-28T09:00:00.000Z'
const sha = (n) => String(n).padStart(64, '0')
const NAME = 'Lantern Hill Racquet Club'
const BIO =
  'Lantern Hill Racquet Club runs a Tennis class and a Padel class every day. Head coach Mara Okonkwo leads them.'
const sources = readingSourcesOf({ bio: BIO })
const reading = {
  method: 'model',
  ...checkBusinessReading(
    {
      services: [
        { name: 'Tennis class', quote: 'a Tennis class', ref: 'bio' },
        { name: 'Padel class', quote: 'a Padel class', ref: 'bio' }
      ],
      team: [{ name: 'Mara Okonkwo', role: 'Head coach', quote: 'Head coach Mara Okonkwo', ref: 'bio' }]
    },
    sources
  )
}
const idOf = (group, label) => reading[group].find((i) => i.label === label).id

const row = (id, n, extra) => ({
  id,
  status: 'stored',
  kind: 'image',
  category: 'other',
  sha256: sha(n),
  mime: 'image/jpeg',
  width: 1600,
  height: 1000,
  bytes: 120000,
  source: 'website',
  source_url: `https://example.test/${id}.jpg`,
  ...extra
})

const visionOf = (labels) => ({ vision: { key: 'k', model: 'm', labels } })

const MEDIA = [
  // The business wrote what the photo shows: linked without any model.
  row('padel-alt', 1, { alt: 'Padel class at sunset' }),
  // The model says tennis: an id of the list, so it stands.
  row('tennis-model', 2, {
    labels: visionOf({
      subject: 'service-in-action',
      content: 'people-in-action',
      depicts: 'TENNIS_ID',
      role: 'offering.image',
      peopleCount: 3
    })
  }),
  // The model invents an offering the brief does not have: general.
  row('invented', 3, {
    labels: visionOf({
      subject: 'service-in-action',
      content: 'people-in-action',
      depicts: 'Squash lessons',
      role: 'offering.image'
    })
  }),
  // A flyer: a graphic, kept out of photo roles.
  row('flyer', 4, {
    labels: visionOf({
      subject: 'poster',
      content: 'text-graphic',
      isGraphic: true,
      role: 'business.hero_image'
    })
  }),
  row('coach', 5, {
    labels: visionOf({
      subject: 'people',
      content: 'team',
      portraitOf: 'COACH_ID',
      role: 'person.image',
      faceBoxes: [[0.4, 0.2, 0.15, 0.2]],
      peopleCount: 1
    })
  })
]

const briefOf = () => {
  const media = MEDIA.map((m) => {
    const labels = m.labels?.vision?.labels
    if (!labels) return m
    const swap = { ...labels }
    if (swap.depicts === 'TENNIS_ID') swap.depicts = idOf('services', 'Tennis class')
    if (swap.portraitOf === 'COACH_ID') swap.portraitOf = idOf('team', 'Mara Okonkwo')
    return { ...m, labels: visionOf(swap) }
  })
  return makeSiteBrief(
    domain,
    fromPlace({ sources: [], profile: { name: NAME, businessReading: reading }, brand: null, media }),
    { opportunity: { id: 'o1', name: NAME, candidate: { trade: 'fitness' } }, madeAt: AT }
  )
}

test('brief assets link to the brief offerings and people only, general otherwise, graphics flagged', () => {
  const brief = briefOf()
  assert.deepEqual(domain.validateBrief(brief).errors, [])
  const by = new Map(brief.assets.map((a) => [a.id, a]))
  assert.deepEqual(by.get('padel-alt').depicts, {
    id: idOf('services', 'Padel class'),
    evidence: { via: 'alt', quote: 'Padel class at sunset' }
  })
  assert.equal(by.get('padel-alt').role, 'offering.image')
  assert.equal(by.get('tennis-model').depicts.id, idOf('services', 'Tennis class'))
  assert.equal(by.get('tennis-model').peopleCount, 3)
  assert.equal(by.get('invented').depicts.id, 'general')
  assert.equal(by.get('invented').role, 'business.gallery_image')
  assert.equal(by.get('flyer').isGraphic, true)
  assert.equal(by.get('flyer').role, null)
  assert.equal(by.get('coach').portraitOf.id, idOf('team', 'Mara Okonkwo'))
  assert.equal(by.get('coach').role, 'person.image')
  assert.deepEqual(by.get('coach').faceBoxes, [[0.4, 0.2, 0.15, 0.2]])
  for (const a of brief.assets) assert.equal(a.isOwnPhoto, true, `${a.id}: the website is the business's own`)
})

test('a picture the model calls a graphic is never a hero candidate, whatever else it shows', () => {
  const banner = row('banner', 9, {
    width: 3000,
    height: 1500,
    labels: visionOf({ subject: 'people', content: 'people-in-action', isGraphic: true })
  })
  const brief = makeSiteBrief(
    domain,
    fromPlace({ sources: [], profile: { name: NAME }, brand: null, media: [banner, MEDIA[0]] }),
    { opportunity: { id: 'o1', name: NAME, candidate: { trade: 'fitness' } }, madeAt: AT }
  )
  const hero = brief.sitemap.flatMap((p) => p.sections).find((s) => s.kind === 'hero')
  const ids = JSON.stringify(brief).match(/"heroCandidates":\[[^\]]*\]/)?.[0] ?? ''
  assert.ok(!ids.includes('banner'), ids)
  assert.ok(!(hero?.assetIds ?? []).includes('banner'))
})

test('validation refuses a relation outside its shape', () => {
  for (const [field, value, path] of [
    ['depicts', { id: '' }, 'depicts'],
    ['portraitOf', 'te_x', 'portraitOf'],
    ['role', 'editorial.decorative_image', 'role'],
    ['subjectBox', [0, 0, 2, 1], 'subjectBox'],
    ['faceBoxes', [[0, 0]], 'faceBoxes'],
    ['peopleCount', -1, 'peopleCount'],
    ['isGraphic', 'yes', 'isGraphic'],
    ['isOwnPhoto', 1, 'isOwnPhoto']
  ]) {
    const brief = briefOf()
    brief.assets[0][field] = value
    const checked = domain.validateBrief(brief)
    assert.equal(checked.ok, false, `${field}=${JSON.stringify(value)}`)
    assert.match(checked.errors.join('\n'), new RegExp(`assets\\[0\\]\\.${path}`))
  }
})
