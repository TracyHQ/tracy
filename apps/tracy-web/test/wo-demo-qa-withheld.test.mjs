// What the brief withholds reaches the host's `withheld-not-shown` (`briefOf`): a field its sources disagree on, with
// every value they gave, so a demo that prints one fails. A field merely not collected is sample content, not withheld.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { briefOf } from '../src/opportunities-build/demo-qa.js'

test('briefOf: disputed opening hours are withheld with every value the sources gave', () => {
  const brief = briefOf({
    brief_md: '# QuillHaus',
    brief: {
      missing: [
        {
          field: 'hours',
          why: 'The sources disagree on the opening hours: show no hours.',
          conflicting: [
            { source: 'website', hours: ['Mo-Su 09:00-17:00'] },
            { source: 'google', hours: ['Monday: 11:30 AM – 1:00 AM'] }
          ]
        },
        { field: 'phone', why: 'No phone number found.' }
      ]
    }
  })
  assert.deepEqual(brief.withheld, [
    { field: 'hours', values: ['Mo-Su 09:00-17:00', 'Monday: 11:30 AM – 1:00 AM'] }
  ])
})

test('briefOf: hours that were simply not collected are not withheld (nothing to withhold)', () => {
  const brief = briefOf({
    brief_md: '# Pho Ba',
    brief: { missing: [{ field: 'hours', why: 'No opening hours were collected.' }] }
  })
  assert.deepEqual(brief.withheld, [])
})

test("briefOf: Google's rating left off the site is withheld in every way a page could write it", () => {
  const brief = briefOf({
    brief_md: '# Padel & Tennis Coach',
    brief: {
      missing: [
        {
          field: 'googleRating',
          why: "Google's rating counts only 4 reviews, so it is left off the site until the owner shows it.",
          withheld: [{ source: 'google', values: ['5.0 ★', '5.0/5', '4 reviews'] }]
        }
      ]
    }
  })
  assert.deepEqual(brief.withheld, [{ field: 'googleRating', values: ['5.0 ★', '5.0/5', '4 reviews'] }])
})
