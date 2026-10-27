/**
 * `withheld-not-shown`: what the brief tells the site NOT to show stays off it. QuillHaus's sources disagreed on
 * its opening hours ("show no hours, not even sample hours"), yet its hero and footer printed "Open daily from
 * 11:30 AM" and every check passed: `facts-from-brief` holds a page to the brief's values, and the disputed
 * values are in the brief (local stand 24/10/2026).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CHECK_IDS, checkWithheldNotShown, clockTimesIn, demoQaBody } from '../src/demo-qa.js'

const page = (over = {}) => ({ path: '/', url: 'http://x/', status: 200, error: null, loadMs: 1, ...over })
const google = ['Monday: 11:30 AM – 1:00 AM', 'Thursday: 11:30 AM – 2:00 AM']
const website = ['Mo,Tu,We,Th,Fr,Sa,Su 09:00-17:00']
const withheld = [{ field: 'hours', values: [...google, ...website] }]
// The brief prints the disputed values beside facts it does hold: a weekly event's times.
const briefText = `Opening hours (disputed, see Missing; do not show): ${google.join('; ')}
Sushi night: Wednesday 8 PM – 11 PM. Sunday roast from 1:30 PM.
- hours: The sources disagree on the opening hours: show no hours, not even sample hours.
  - website: ${website.join('; ')}
{"resolvedAt":"2026-10-24T18:56:17.279Z"}`

test('withheld-not-shown: disputed opening hours on a page fail, with the words and the fix', () => {
  const check = checkWithheldNotShown(
    [page({ text: 'Welcome. Open daily from 11:30 AM · Until 1 AM Sunday to Wednesday.' })],
    { briefText, withheld }
  )
  assert.equal(check.pass, false)
  assert.deepEqual(
    check.detail.map((d) => [d.page, d.field, d.shown]),
    [
      ['/', 'hours', '11:30 AM'],
      ['/', 'hours', '1 AM']
    ]
  )
  assert.match(check.detail[0].words, /Open daily from 11:30 AM/)
  assert.match(check.detail[0].fix, /remove/i)
  assert.ok(CHECK_IDS.includes('withheld-not-shown'))
})

test('withheld-not-shown: a sample time the brief holds nowhere fails too ("not even sample hours")', () => {
  const check = checkWithheldNotShown([page({ text: 'Open every day 10:00–22:00.' })], {
    briefText,
    withheld
  })
  assert.deepEqual(
    check.detail.map((d) => d.shown),
    ['10:00', '22:00']
  )
})

test('withheld-not-shown: times written as other languages write them are read too', () => {
  assert.deepEqual([...clockTimesIn('Geöffnet ab 11 Uhr')], [660])
  assert.deepEqual([...clockTimesIn('Ouvert de 11h30 à 23h')].sort(), [1380, 690].sort())
  assert.deepEqual([...clockTimesIn('営業時間 11時30分〜')], [690])
  assert.deepEqual([...clockTimesIn('Open 11 a.m. to 9 p.m.')].sort(), [660, 1260].sort())
  const check = checkWithheldNotShown([page({ text: 'Ouvert tous les jours dès 11h30.' })], {
    briefText,
    withheld
  })
  assert.equal(check.pass, false)
})

test('withheld-not-shown: times the brief holds outside the withheld values pass (an event, not opening hours)', () => {
  const check = checkWithheldNotShown(
    [page({ text: 'Sushi night every Wednesday, 8 PM – 11 PM. Sunday roast from 1:30 PM.' })],
    { briefText, withheld }
  )
  assert.equal(check.pass, true, JSON.stringify(check.detail))
})

test('withheld-not-shown: nothing withheld judges nothing — hours a brief holds plainly are facts-from-brief’s', () => {
  const check = checkWithheldNotShown([page({ text: 'Open daily from 11:30 AM.' })], {
    briefText,
    withheld: []
  })
  assert.equal(check.pass, true)
  assert.match(check.measured, /nothing withheld/)
})

test('withheld-not-shown: another withheld field fails on its value shown, and passes without it', () => {
  const asked = { briefText: '', withheld: [{ field: 'phone', values: ['+84 28 5555 0134'] }] }
  assert.equal(checkWithheldNotShown([page({ text: 'Call +84 28 5555 0134 today' })], asked).pass, false)
  assert.equal(checkWithheldNotShown([page({ text: 'Call us today' })], asked).pass, true)
})

test('demoQaBody keeps what the brief withholds, bounded and well formed', () => {
  const asked = demoQaBody({
    label: 'acme',
    platform: 'wordpress',
    withheld: [{ field: 'hours', values: ['Mon 9–5', 7, ''] }, { field: '', values: ['x'] }, null]
  })
  assert.deepEqual(asked.withheld, [{ field: 'hours', values: ['Mon 9–5'] }])
  assert.deepEqual(demoQaBody({ label: 'acme', platform: 'wordpress' }).withheld, [])
})

test("withheld-not-shown: Google's rating left off the site fails where a page shows it, a review alone passes", () => {
  const withheld = [{ field: 'googleRating', values: ['5.0 ★', '★ 5.0', '5.0/5', '4 reviews'] }]
  const shown = checkWithheldNotShown([page({ text: 'Our coaching: 5.0 ★ on Google from 4 reviews.' })], {
    briefText: '',
    withheld
  })
  assert.equal(shown.pass, false)
  assert.deepEqual(
    shown.detail.map((d) => d.shown),
    ['5.0 ★', '4 reviews']
  )
  assert.match(shown.detail[0].fix, /Google's star rating/)
  const quiet = checkWithheldNotShown([page({ text: 'Great coach, my kids love it. Anna on Google' })], {
    briefText: '',
    withheld
  })
  assert.equal(quiet.pass, true)
})

// A coaching business built on a boxing template (dev, 27/10/2026): its brief withheld Google's "Open 24 hours"
// and its 5.0 rating from 4 reviews, yet every page's footer said "Open 24 hours, every day" and a block said
// "5 Google rating". Neither names a clock time or one of the rating's exact forms, so every round passed.
const allDay = ['Monday: Open 24 hours', 'Tuesday: Open 24 hours', 'Sunday: Open 24 hours']
const leakWithheld = [
  { field: 'hours', values: allDay },
  { field: 'googleRating', values: ['5.0 ★', '5.0★', '★ 5.0', '5.0/5', '5.0 out of 5', '4 reviews'] }
]
const footer =
  'Copyright © 2026 Club. CONTACT US +971 58 000 0000 Harbour Lane, Dubai Open 24 hours, every day Serving: Locations across Dubai CLASSES Tennis'

test('withheld-not-shown: round-the-clock hours and a rating written its own way fail, in the footer of every page', () => {
  const reads = [
    page({ text: `Our coaching. 5 Google rating From reviews of the coaching in Dubai. ${footer}` }),
    page({ path: '/contact', text: `Contact. Call us any time, we are open 24/7. ${footer}` })
  ]
  const check = checkWithheldNotShown(reads, { briefText: '', withheld: leakWithheld })
  assert.equal(check.pass, false)
  const found = check.detail.map((d) => [d.page, d.field, d.shown.toLowerCase()])
  assert.deepEqual(found, [
    ['/', 'hours', 'open 24 hours'],
    ['/', 'googleRating', '5 google rating'],
    ['/contact', 'hours', 'open 24/7'],
    ['/contact', 'hours', 'open 24 hours']
  ])
  assert.match(check.detail[0].words, /Open 24 hours, every day/)
  for (const text of [
    'Rated 5.0 on Google',
    'Google rating: 5',
    '★★★★★ 5,0 stars',
    '24 hours a day, 7 days a week'
  ])
    assert.equal(
      checkWithheldNotShown([page({ text })], { briefText: '', withheld: leakWithheld }).pass,
      false,
      text
    )
})

test('withheld-not-shown: the same words pass when nothing about hours or rating is withheld, and numbers that are no rating pass', () => {
  // Counter-case: a brief that holds its hours (and shows its rating) keeps showing them.
  const shownPlainly = checkWithheldNotShown([page({ text: `5 Google rating. ${footer}` })], {
    briefText: 'Opening hours: Open 24 hours',
    withheld: [{ field: 'team', values: ['Alex'] }]
  })
  assert.equal(shownPlainly.pass, true, JSON.stringify(shownPlainly.detail))
  // A number beside other words is no rating, and a 24-hour cancellation rule is no opening time.
  const quiet = checkWithheldNotShown(
    [
      page({
        text: '5 coaches, 3 courts, packs of 5 lessons. Cancel 24 hours ahead. Ages 5 to 15. Lydia L. Google review, 5 stars'
      })
    ],
    { briefText: '', withheld: leakWithheld }
  )
  assert.equal(quiet.pass, true, JSON.stringify(quiet.detail))
})
