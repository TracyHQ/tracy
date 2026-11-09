// What the owner's photos show about the business becomes facts of the brief (`observed`), so a planner that never sees
// the photos can still rest an angle on them. Only sharp, on-topic photos the business published count; duplicates merge
// into one fact naming every photo; nothing about the people in a photo becomes a fact.
// Fixtures are fictional: the Willowmere Racquet House, its photos and its ids do not exist.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  OBSERVED_FIELDS,
  OBSERVED_USE_RULE,
  heldObservedFacts,
  observablePhotos,
  observedFactEnvelopes,
  photoViewOf
} from '../domain/pictures/observed-facts.mjs'
import { observedFactsPrompt } from '../domain/pictures/observed-facts-prompt.mjs'

const view = (id, over = {}) => ({
  id,
  kind: 'image',
  content: 'venue-exterior',
  caption: `Photo ${id}`,
  isOwnPhoto: true,
  quality: 'high',
  isGraphic: false,
  sharpness: 'good',
  offering: null,
  ...over
})

const PHOTOS = [
  view('wm-01', {
    caption: 'Two players rally on an orange clay court under floodlights.',
    content: 'people-in-action'
  }),
  view('wm-02', { caption: 'An empty clay court with a net and white lines.' }),
  view('wm-03', {
    caption: 'A coach feeds balls to a group of children on a clay court.',
    content: 'people-in-action'
  }),
  view('wm-04', { caption: 'A glass-walled indoor padel court.', content: 'venue-interior' }),
  view('wm-05', { caption: 'An outdoor swimming pool beside the courts.' }),
  // A small file is still read: sharpness, not resolution, decides (a video frame of the pool is still the pool).
  view('wm-08', { caption: 'A small clay court.', quality: 'low' }),
  // Dropped: a guest's snapshot, a blurry one, a logo, a photo no model looked at, a video.
  view('wm-06', { caption: 'A clay court seen from the stands.', isOwnPhoto: false }),
  view('wm-07', { caption: 'A blurry clay court.', sharpness: 'blurry' }),
  view('wm-09', { caption: 'The club logo.', content: 'logo', isGraphic: true }),
  view('wm-10', { content: 'unlabelled', caption: null }),
  view('wm-11', { kind: 'video', content: 'unlabelled', caption: null }),
  // Unknown uploader: kept (the usage rule covers photos a customer may have posted).
  view('wm-12', { caption: 'A clay court at dusk.', isOwnPhoto: null })
]

test('only sharp, on-topic photos the business published are observable; every other one says why', () => {
  const { photos, dropped } = observablePhotos(PHOTOS)
  assert.deepEqual(
    photos.map((p) => p.id),
    ['wm-01', 'wm-02', 'wm-03', 'wm-04', 'wm-05', 'wm-08', 'wm-12']
  )
  assert.deepEqual(dropped, [
    { id: 'wm-06', reason: 'not_own_photo' },
    { id: 'wm-07', reason: 'blurry' },
    { id: 'wm-09', reason: 'off_topic' },
    { id: 'wm-10', reason: 'unlabelled' },
    { id: 'wm-11', reason: 'unlabelled' }
  ])
  // A photo whose label says it shows another business is off topic too.
  assert.equal(observablePhotos([view('wm-13', { showsOtherBusiness: true })]).dropped[0].reason, 'off_topic')
  assert.equal(observablePhotos([view('wm-14', { sharpness: 'dark' })]).dropped[0].reason, 'blurry')
})

test('the prompt shows each observable photo by id and asks for facts about the business only', () => {
  const { photos } = observablePhotos(PHOTOS)
  const prompt = observedFactsPrompt(photos, { trade: 'fitness' })
  for (const p of photos) assert.match(prompt, new RegExp(`Photo id: ${p.id}\\b`))
  assert.doesNotMatch(prompt, /wm-06|wm-07|wm-09/)
  for (const f of OBSERVED_FIELDS) assert.match(prompt, new RegExp(`"${f}"`))
  assert.match(prompt, /never about the people/i)
  assert.match(prompt, /no numbers/i)
})

test('a model answer becomes held facts: duplicates merged with every photo, unknown photos and fields dropped', () => {
  const { photos } = observablePhotos(PHOTOS)
  const answer = JSON.stringify({
    facts: [
      { field: 'facility', value: 'Clay courts', assetIds: ['wm-01', 'wm-02', 'wm-03'] },
      // The same thing again, other photos, other case and spacing: one fact.
      { field: 'facility', value: ' clay  courts ', assetIds: ['wm-12', 'wm-02', 'wm-07'] },
      { field: 'facility', value: 'indoor padel court with glass walls', assetIds: ['wm-04'] },
      { field: 'facility', value: 'outdoor swimming pool', assetIds: ['wm-05', 'wm-99'] },
      { field: 'activity', value: 'group coaching for children', assetIds: ['wm-03'] },
      { field: 'atmosphere', value: 'evening play under floodlights', assetIds: ['wm-01'] },
      // Not a field, or no observable photo left: dropped.
      { field: 'price', value: 'affordable lessons', assetIds: ['wm-01'] },
      { field: 'facility', value: 'tennis court', assetIds: ['wm-06', 'wm-07'] }
    ]
  })
  assert.deepEqual(heldObservedFacts(answer, photos), [
    { field: 'facility', value: 'clay courts', assetIds: ['wm-01', 'wm-02', 'wm-03', 'wm-12'] },
    { field: 'facility', value: 'indoor padel court with glass walls', assetIds: ['wm-04'] },
    { field: 'facility', value: 'outdoor swimming pool', assetIds: ['wm-05'] },
    { field: 'activity', value: 'group coaching for children', assetIds: ['wm-03'] },
    { field: 'atmosphere', value: 'evening play under floodlights', assetIds: ['wm-01'] }
  ])
})

test('nothing about the people in a photo, and no hard claim, ever becomes a fact', () => {
  const { photos } = observablePhotos(PHOTOS)
  const values = [
    'young woman in a white skirt',
    'smiling blonde coach',
    'Mara Okonkwo coaching',
    'players around 30 years old',
    'four clay courts',
    'three courts',
    'the largest padel club in town',
    'the only clay courts nearby',
    'best coaching',
    'open late every day',
    'cheap court hire'
  ]
  const answer = JSON.stringify({
    facts: values.map((value) => ({ field: 'activity', value, assetIds: ['wm-01'] }))
  })
  assert.deepEqual(heldObservedFacts(answer, photos, { people: ['Mara Okonkwo'] }), [])
  // Who a class is for is about the business: kept.
  const kids = JSON.stringify({
    facts: [
      { field: 'activity', value: 'private lessons for adults', assetIds: ['wm-03'] },
      // A lesson format, not a count.
      { field: 'activity', value: 'one-to-one coaching', assetIds: ['wm-03'] },
      { field: 'activity', value: 'one on one training', assetIds: ['wm-03'] }
    ]
  })
  assert.equal(heldObservedFacts(kids, photos).length, 3)
})

test('an unreadable answer holds nothing', () => {
  const { photos } = observablePhotos(PHOTOS)
  for (const bad of ['', 'not json', '{"facts": 3}', JSON.stringify({ facts: [null, 'x', {}] })])
    assert.deepEqual(heldObservedFacts(bad, photos), [])
})

test('held facts become brief envelopes: observed, on the site, with their photos and a stable id', () => {
  const held = [{ field: 'facility', value: 'clay courts', assetIds: ['wm-01', 'wm-02'] }]
  const [f] = observedFactEnvelopes(held)
  assert.match(f.id, /^fact_[0-9a-f]{24}$/)
  assert.equal(observedFactEnvelopes(held)[0].id, f.id)
  assert.deepEqual(
    { ...f, id: 'x' },
    {
      id: 'x',
      field: 'facility',
      value: 'clay courts',
      sourceKind: 'observed',
      assetIds: ['wm-01', 'wm-02'],
      evidence: [
        { source: 'photo', ref: 'wm-01' },
        { source: 'photo', ref: 'wm-02' }
      ],
      confidence: 'single-source',
      onSite: true,
      decidedBy: 'rule',
      reasons: ['observed-in-photos']
    }
  )
  assert.match(OBSERVED_USE_RULE, /never for hard claims/i)
})

test('a brief media row reads as a photo view: its labels, its own-photo answer and the sharpness the model saw', () => {
  const m = {
    id: 'wm-20',
    kind: 'image',
    width: 2000,
    height: 1200,
    labels: {
      vision: {
        labels: {
          content: 'venue-exterior',
          caption: 'A clay court at dusk.',
          quality: 'blurry',
          isOwnPhoto: true,
          isGraphic: false,
          depicts: 'se_courts'
        }
      }
    }
  }
  const list = { offerings: [{ id: 'se_courts', label: 'Court hire' }], people: [] }
  assert.deepEqual(photoViewOf(m, { list }), {
    id: 'wm-20',
    kind: 'image',
    content: 'venue-exterior',
    caption: 'A clay court at dusk.',
    isOwnPhoto: true,
    quality: 'high',
    isGraphic: false,
    showsOtherBusiness: null,
    isBlurry: null,
    sharpness: 'blurry',
    offering: 'Court hire'
  })
})

test('a brief media row the model saw showing another business is off topic; false or unanswered is not', () => {
  const row = (id, extra) => ({
    id,
    kind: 'image',
    source: 'website',
    width: 2000,
    height: 1200,
    labels: {
      vision: {
        labels: {
          content: 'venue-interior',
          caption: 'A bright reception desk.',
          quality: 'good',
          isOwnPhoto: true,
          isGraphic: false,
          ...extra
        }
      }
    }
  })
  const views = [
    row('wm-30', { showsOtherBusiness: true }),
    row('wm-31', { showsOtherBusiness: false }),
    row('wm-32', {})
  ].map((m) => photoViewOf(m))
  assert.equal(views[0].showsOtherBusiness, true)
  const { photos, dropped } = observablePhotos(views)
  assert.deepEqual(dropped, [{ id: 'wm-30', reason: 'off_topic' }])
  assert.deepEqual(
    photos.map((p) => p.id),
    ['wm-31', 'wm-32']
  )
})

// CodeQL polynomial-redos (release 2026-11-05): the stops a value ends on are taken off from its end, in one pass.
test('the stops a value ends on are taken off; a long run of them inside a value reads fast', () => {
  const { photos } = observablePhotos(PHOTOS)
  const held = (value) =>
    heldObservedFacts(JSON.stringify({ facts: [{ field: 'facility', value, assetIds: ['wm-01'] }] }), photos)
  assert.deepEqual(
    held('Clay courts.;,').map((f) => f.value),
    ['clay courts']
  )
  assert.deepEqual(
    held('clay courts, shaded').map((f) => f.value),
    ['clay courts, shaded']
  )
  const t = performance.now()
  assert.deepEqual(held(`clay courts${','.repeat(100_000)}x`), [])
  assert.ok(performance.now() - t < 500, 'a run of commas read in one pass')
})

test('a brief media row the model answered blurry is dropped as blurry, beside its quality word', () => {
  const m = {
    id: 'wm-40',
    kind: 'image',
    source: 'website',
    width: 2000,
    height: 1200,
    labels: {
      vision: {
        labels: {
          content: 'venue-interior',
          caption: 'A bright reception desk.',
          quality: 'good',
          isOwnPhoto: true,
          isGraphic: false,
          isBlurry: true
        }
      }
    }
  }
  const view = photoViewOf(m)
  assert.equal(view.isBlurry, true)
  assert.equal(view.sharpness, 'good')
  assert.deepEqual(observablePhotos([view]).dropped, [{ id: 'wm-40', reason: 'blurry' }])
})
