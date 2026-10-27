/**
 * The Website Opportunity panel of /ops/settings: the milestones it states in words, generated from
 * the saved demo retention values, and the form's own check before a save.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  fieldLabelKey,
  PUBLIC_FIND_FIELDS,
  RETENTION_FIELDS,
  publicFindInputError,
  publicFindLine,
  retentionInputError,
  retentionMilestones
} from '../src/settings/wo-retention.ts'
import { en } from '../src/i18n/ns/settings.ts'
import { translate } from '../src/i18n/translator.ts'

/** The words as an English screen reads them. */
const t = (key, params) => translate('en', {}, en, key, params)

const DEFAULTS = {
  demoBuildsPerAccountPerDay: 20,
  ownSiteBuildsPerAccountPerDay: 3,
  demoRetentionEnabled: true,
  demoTtlDays: 14,
  demoReviewTtlDays: 7,
  demoFreezeGraceDays: 7,
  demoMaxPerAccount: 50,
  demoMaxPerHost: 500,
  demoDiskHighWaterPct: 80,
  demoSweepBatch: 10
}

test('the milestones say the defaults in words', () => {
  assert.deepEqual(retentionMilestones(t, DEFAULTS), [
    'A demo nobody opens for 14 days is frozen.',
    'A demo QA handed back for review is frozen after 7 days.',
    'A demo frozen for 7 days is deleted; its brief, QA result, screenshots and costs are kept.',
    'More than 50 demos on one account, or 500 on one server: the least recently used are frozen, never deleted.',
    'The 80% server disk mark is not connected on this deployment: no demo is frozen for disk use.',
    'The hourly sweep does at most 10 freezes or deletions per run.'
  ])
})

test('singular days, caps switched off, and the whole sweep switched off', () => {
  const lines = retentionMilestones(t, {
    ...DEFAULTS,
    demoTtlDays: 1,
    demoMaxPerAccount: 0,
    demoMaxPerHost: 0
  })
  assert.equal(lines[0], 'A demo nobody opens for 1 day is frozen.')
  assert.equal(lines[3], 'No cap on demos per account or per server.')
  assert.deepEqual(retentionMilestones(t, { ...DEFAULTS, demoRetentionEnabled: false }), [
    'Off: no demo is frozen or deleted. The hourly sweep only logs that it is off.'
  ])
})

test('the form refuses what the server would refuse, naming the field', () => {
  assert.equal(retentionInputError(t, DEFAULTS), null)
  assert.match(retentionInputError(t, { ...DEFAULTS, demoTtlDays: 0 }), /Days a demo lives/)
  assert.match(retentionInputError(t, { ...DEFAULTS, demoDiskHighWaterPct: 96 }), /50 to 95/)
  assert.match(retentionInputError(t, { ...DEFAULTS, demoSweepBatch: 2.5 }), /whole number/)
  assert.equal(retentionInputError(t, { ...DEFAULTS, demoBuildsPerAccountPerDay: 0 }), null)
  assert.match(retentionInputError(t, { ...DEFAULTS, demoBuildsPerAccountPerDay: -1 }), /0 to 100000/)
  assert.match(retentionInputError(t, { ...DEFAULTS, demoBuildsPerAccountPerDay: 2.5 }), /whole number/)
})

const LIMITS = {
  publicFindSearchesPerDay: 500,
  publicFindSearchesPerAddressHour: 60,
  publicFindSearchesPerAddressMinute: 10,
  publicFindSearchesPerMinute: 60,
  publicFindSuggestPerDay: 5000,
  publicFindSuggestPerAddressHour: 300,
  publicFindSuggestPerAddressMinute: 60,
  publicFindSuggestPerMinute: 60,
  placesCacheDays: 183,
  placesCacheCellMeters: 0,
  publicResearchNewPlacesPerAddressDay: 50,
  publicResearchNewPlacesPerDay: 1000,
  researchPublicDailyCapCents: 500
}

test('the public Find limits: every field has a label and the server range; only a day cap takes 0', () => {
  assert.deepEqual(PUBLIC_FIND_FIELDS.map((f) => f.key).sort(), Object.keys(LIMITS).sort())
  assert.equal(publicFindInputError(t, LIMITS), null)
  assert.equal(publicFindInputError(t, { ...LIMITS, publicFindSearchesPerDay: 0 }), null)
  assert.equal(
    publicFindInputError(t, { ...LIMITS, placesCacheDays: 0, placesCacheCellMeters: 10_000 }),
    null
  )
  assert.match(publicFindInputError(t, { ...LIMITS, placesCacheCellMeters: 20_001 }), /from 0 to 20000/)
  assert.match(
    publicFindInputError(t, { ...LIMITS, publicFindSearchesPerMinute: 0 }),
    /Searches per minute, whole deployment: from 1/
  )
  assert.match(publicFindInputError(t, { ...LIMITS, publicFindSuggestPerAddressHour: 2.5 }), /whole number/)
  assert.equal(
    publicFindInputError(t, { ...LIMITS, publicResearchNewPlacesPerDay: 0, researchPublicDailyCapCents: 0 }),
    null
  )
  assert.match(
    publicFindInputError(t, { ...LIMITS, publicResearchNewPlacesPerAddressDay: 0 }),
    /New places researched per day, one address: from 1/
  )
  assert.equal(
    publicFindLine(t, LIMITS),
    'Strangers on /find may run 500 Google searches and 5000 place suggestions a UTC day in total.'
  )
  assert.equal(
    publicFindLine(t, { ...LIMITS, publicFindSearchesPerDay: 0, publicFindSuggestPerDay: 0 }),
    'Closed: the /find page refuses every search and suggests nothing.'
  )
})

test('every field of both forms has its English label in the settings dictionary', () => {
  for (const f of [...RETENTION_FIELDS, ...PUBLIC_FIND_FIELDS])
    assert.equal(typeof en[fieldLabelKey(f.key)], 'string', `${f.key} has a label`)
})
