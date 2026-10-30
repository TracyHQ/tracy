// Brief readiness after the build (#50): one QA round of the host, read as what the live site shows of the brief.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { liveReadinessOf } from '../src/opportunities-build/live-readiness.js'

const BRIEF = {
  version: 'brief-readiness/1',
  verdict: 'warn',
  next: 'build-and-ask',
  checks: [
    { id: 'own-usable-photos', verdict: 'warn' },
    { id: 'labelled-share', verdict: 'pass' }
  ],
  ownerQuestions: []
}

test('leftover template sample text is reported, with the passages the host found', () => {
  const live = liveReadinessOf(BRIEF, [
    {
      id: 'no-demo-words',
      pass: false,
      measured: '2 template passages left on 1 routes (2 different)',
      detail: [
        { page: '/', words: 'Lorem ipsum dolor sit amet' },
        { page: '/', words: 'Our chef Marco prepares' }
      ]
    },
    { id: 'collected-used', pass: true, measured: '0 collected facts or photos missing' }
  ])
  assert.equal(live.verdict, 'fail')
  const sample = live.checks.find((c) => c.id === 'no-template-sample-text')
  assert.equal(sample.verdict, 'fail')
  assert.equal(sample.from, 'no-demo-words')
  assert.deepEqual(
    sample.detail.map((d) => d.words),
    ['Lorem ipsum dolor sit amet', 'Our chef Marco prepares']
  )
  assert.equal(live.checks.find((c) => c.id === 'collected-items-shown').verdict, 'pass')
  assert.deepEqual(live.brief, {
    verdict: 'warn',
    checks: [
      { id: 'own-usable-photos', verdict: 'warn', on: 'brief' },
      { id: 'labelled-share', verdict: 'pass', on: 'brief' }
    ]
  })
})

test('collected items not shown fail the round; both shown pass it', () => {
  const missing = liveReadinessOf(BRIEF, [
    { id: 'no-demo-words', pass: true },
    { id: 'collected-used', pass: false, detail: [{ code: 'COLLECTED_NOT_SHOWN', what: 'photos' }] }
  ])
  assert.equal(missing.verdict, 'fail')
  const clean = liveReadinessOf(BRIEF, [
    { id: 'no-demo-words', pass: true },
    { id: 'collected-used', pass: true },
    { id: 'photos-match-slots', pass: true },
    { id: 'faces-named', pass: true }
  ])
  assert.equal(clean.verdict, 'pass')
})

test('a site check that did not run or could not judge is unknown, never a pass', () => {
  const live = liveReadinessOf(BRIEF, [{ id: 'collected-used', pass: true, skipped: 'no baseline' }])
  assert.equal(live.verdict, 'unknown')
  assert.deepEqual(
    live.checks.map((c) => [c.id, c.verdict]),
    [
      ['no-template-sample-text', 'unknown'],
      ['collected-items-shown', 'unknown'],
      ['offering-photos-right', 'unknown'],
      ['faces-of-named-people', 'unknown']
    ]
  )
})

test('a wrong-offering photo or a stranger face on the live site fails the round, naming the page, slot and photo', () => {
  const live = liveReadinessOf(BRIEF, [
    { id: 'no-demo-words', pass: true },
    { id: 'collected-used', pass: true },
    {
      id: 'photos-match-slots',
      pass: false,
      measured: '1 of 2 photos in offering or person slots show another offering or person',
      detail: [{ page: '/classes', slot: 'classes.item.1.image', photo: 'asset-padel' }]
    },
    {
      id: 'faces-named',
      pass: false,
      detail: [{ page: '/team', slot: 'team.item.2.image', photo: 'asset-stranger' }]
    }
  ])
  assert.equal(live.verdict, 'fail')
  const offering = live.checks.find((c) => c.id === 'offering-photos-right')
  assert.equal(offering.from, 'photos-match-slots')
  assert.deepEqual(offering.detail, [
    { page: '/classes', slot: 'classes.item.1.image', photo: 'asset-padel' }
  ])
  const faces = live.checks.find((c) => c.id === 'faces-of-named-people')
  assert.equal(faces.verdict, 'fail')
  assert.equal(faces.detail[0].photo, 'asset-stranger')
})

test('a brief made before readiness was measured has no live readiness', () => {
  assert.equal(liveReadinessOf(undefined, [{ id: 'no-demo-words', pass: false }]), null)
})
