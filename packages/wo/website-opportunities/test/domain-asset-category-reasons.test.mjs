// A brief's asset says which broad category it falls in from what a vision model saw (not only from caption keywords),
// and an asset left unlabelled, or of unknown size, says why instead of staying silent (F08).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as domain from '../domain/index.mjs'
import { assetCategoryOf, assetLabelsOf } from '../domain/pictures/asset-labels.mjs'
import { fromPlace, makeSiteBrief } from '../src/brief-research.js'

const AT = '2026-10-26T10:00:00.000Z'
const sha = (i) => String(i).padStart(64, '0')
const seen = (labels) => ({ vision: { key: 'model-x|p4', model: 'model-x', labels } })

/** A stored picture of the fictional Harbour Sport Club, as `wo_place_media` holds it. */
const row = (id, n, extra = {}) => ({
  id,
  status: 'stored',
  kind: 'image',
  category: 'other',
  sha256: sha(n),
  mime: 'image/jpeg',
  width: 1600,
  height: 2133,
  bytes: 1000,
  labels: null,
  source: 'instagram',
  source_url: `https://cdn.test/hsc-${id}.jpg`,
  ...extra
})

const briefOf = (media, assetLabelling) =>
  makeSiteBrief(
    domain,
    {
      ...fromPlace({ sources: [], profile: { name: 'Harbour Sport Club' }, brand: null, media }),
      ...(assetLabelling ? { assetLabelling } : {})
    },
    { opportunity: { id: 'o1', name: 'Harbour Sport Club', candidate: { trade: 'fitness' } }, madeAt: AT }
  )

test('the category follows what the vision model saw; a source menu photo stays a menu photo', () => {
  assert.equal(
    assetCategoryOf({ category: 'other', labels: seen({ content: 'people-in-action' }) }),
    'people'
  )
  assert.equal(assetCategoryOf({ category: 'other', labels: seen({ content: 'team' }) }), 'people')
  assert.equal(assetCategoryOf({ category: 'other', labels: seen({ content: 'venue-interior' }) }), 'space')
  assert.equal(assetCategoryOf({ category: 'other', labels: seen({ content: 'venue-exterior' }) }), 'space')
  assert.equal(assetCategoryOf({ category: 'other', labels: seen({ content: 'food' }) }), 'food')
  // A kind with no broad category keeps what the source said.
  assert.equal(assetCategoryOf({ category: 'event', labels: seen({ content: 'equipment' }) }), 'event')
  assert.equal(assetCategoryOf({ category: 'menu', labels: seen({ content: 'food' }) }), 'menu')
  assert.equal(assetCategoryOf({ category: null }), 'other')
  assert.equal(assetCategoryOf({ category: 'nonsense' }), 'other')
})

test('a brief with labelled pictures carries their category, and a menu photo keeps the brief valid', () => {
  const brief = briefOf([
    row('a', 1, { labels: seen({ content: 'people-in-action', caption: 'A coach on a court.' }) }),
    row('b', 2, { labels: seen({ content: 'venue-interior', caption: 'An empty studio.' }) }),
    row('c', 3, { category: 'menu', source: 'google-maps' })
  ])
  const by = Object.fromEntries(brief.assets.map((a) => [a.id, a]))
  assert.equal(by.a.category, 'people')
  assert.equal(by.b.category, 'space')
  assert.equal(by.c.category, 'menu')
  assert.deepEqual(domain.validateBrief(brief).errors ?? [], [])
})

test('an unknown size says why: the size was never measured', () => {
  const video = assetLabelsOf({ kind: 'video', width: null, height: null })
  assert.equal(video.orientation, 'unknown')
  assert.equal(video.sizeUnknownReason, 'not_measured')
  assert.equal('sizeUnknownReason' in assetLabelsOf({ kind: 'image', width: 800, height: 600 }), false)
})

test('every unlabelled asset carries the reason the labelling step gave, and the note keeps only counts', () => {
  const brief = briefOf(
    [
      row('a', 1, { labels: seen({ content: 'people-in-action', caption: 'A coach on a court.' }) }),
      row('b', 2),
      row('v', 3, { kind: 'video', mime: 'video/mp4', width: null, height: null })
    ],
    {
      status: 'partial',
      asked: 2,
      labelled: 1,
      failed: 1,
      cached: 0,
      max: 24,
      reason: 'timeout',
      unlabelled: { b: 'timeout', v: 'video' }
    }
  )
  const by = Object.fromEntries(brief.assets.map((a) => [a.id, a]))
  assert.equal(by.b.content, 'unlabelled')
  assert.equal(by.b.unlabelledReason, 'timeout')
  assert.equal(by.v.unlabelledReason, 'video')
  assert.equal('unlabelledReason' in by.a, false)
  assert.equal('unlabelled' in brief.assetLabelling, false)
  assert.equal(brief.assetLabelling.status, 'partial')
  assert.deepEqual(domain.validateBrief(brief).errors ?? [], [])
  const md = domain.renderBriefMarkdown(brief)
  assert.match(md, /1 of 2 asked, 1 failed \(timeout\)/)
  assert.match(md, /unlabelled: timeout/)
})

test('validation refuses a reason outside the vocabulary', () => {
  const brief = briefOf([row('b', 2)], {
    status: 'failed',
    asked: 1,
    labelled: 0,
    cached: 0,
    reason: 'timeout',
    unlabelled: { b: 'timeout' }
  })
  brief.assets[0].unlabelledReason = 'because'
  assert.match(JSON.stringify(domain.validateBrief(brief).errors), /unlabelledReason/)
})

test('a build that stopped waiting for a stalled photo labelling: the brief says so, and each photo why', () => {
  const brief = briefOf([row('a', 1, { labels: seen({ content: 'people-in-action' }) }), row('b', 2)], {
    status: 'stalled',
    asked: 2,
    labelled: 1,
    cached: 1,
    max: 300,
    waiting: 1,
    unlabelled: { b: 'labelling_stalled' }
  })
  const by = Object.fromEntries(brief.assets.map((a) => [a.id, a]))
  assert.equal(by.b.unlabelledReason, 'labelling_stalled')
  assert.deepEqual(domain.validateBrief(brief).errors ?? [], [])
  assert.match(domain.renderBriefMarkdown(brief), /made no progress for 15 minutes, so the build went on/)
})
