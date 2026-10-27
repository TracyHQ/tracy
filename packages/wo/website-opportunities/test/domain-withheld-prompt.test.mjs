// The build prompt names every value the brief withholds and every place it may not appear (header, footer, modules,
// widgets), including the template's own demo hours and rating blocks.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderAgentPrompt, withheldLines } from '../domain/agent-prompt.mjs'

const allDay = ['Monday', 'Tuesday', 'Sunday'].map((d) => `${d}: Open 24 hours`)
const coaching = {
  business: { name: 'Coach Co', trade: 'fitness' },
  missing: [
    { field: 'prices', why: 'No price was collected.' },
    { field: 'team', withheld: [{ source: 'reviews', values: ['Alex', 'Sam'] }] },
    { field: 'hours', withheld: [{ source: 'google', hours: allDay }] },
    {
      field: 'googleRating',
      withheld: [
        { source: 'google', values: ['5.0 ★', '5.0★', '★ 5.0', '5.0/5', '4 reviews', '4 Google reviews'] }
      ]
    }
  ]
}

test('every withheld value is named once, with the header, footer, modules and widgets it may not reach', () => {
  const [named, blocks] = withheldLines(coaching)
  assert.match(named, /team: "Alex", "Sam"; hours: "Open 24 hours"; googleRating: "5\.0 ★", "4 reviews"\./)
  assert.equal(named.match(/Open 24 hours/g).length, 2) // the value, and its other way of writing
  assert.match(named, /the header, the footer, a sidebar or footer module, a widget or the structured data/)
  assert.match(named, /"24\/7"/)
  assert.match(named, /"5 Google rating"/)
  assert.match(blocks, /demo opening-hours and rating blocks .* are emptied, or their line is taken out/)
  const prompt = renderAgentPrompt({
    revision: { id: 'r1', n: 1, cms: 'joomla', brief: coaching, brief_md: '' }
  })
  assert.ok(prompt.includes(named) && prompt.includes(blocks))
})

test('hours two sources disagree on are named by their times, on a clinic too', () => {
  const clinic = {
    business: { name: 'Rosa Dental', trade: 'health' },
    missing: [
      {
        field: 'hours',
        conflicting: [
          { source: 'google', hours: ['Monday: 9:00 AM – 5:00 PM'] },
          { source: 'website', hours: ['Mo-Fr 08:00-20:00'] }
        ]
      }
    ]
  }
  const [named] = withheldLines(clinic)
  assert.match(named, /hours: "9:00 AM – 5:00 PM", "Mo-Fr 08:00-20:00"/)
  assert.doesNotMatch(named, /Google rating/)
})

test('a brief that withholds nothing gets no withheld lines, and its hours stay its own', () => {
  assert.deepEqual(withheldLines({ missing: [{ field: 'prices', why: 'No price was collected.' }] }), [])
  assert.deepEqual(withheldLines({}), [])
  const prompt = renderAgentPrompt({
    revision: {
      id: 'r1',
      n: 1,
      cms: 'joomla',
      brief: { business: { name: 'Gym', trade: 'fitness', hours: ['Monday: Open 24 hours'] } },
      brief_md: ''
    }
  })
  assert.doesNotMatch(prompt, /Withheld by the brief|demo opening-hours and rating blocks/)
})
