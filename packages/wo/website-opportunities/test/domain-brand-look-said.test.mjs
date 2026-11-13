// The lines of a plan's look (ticket #616, review 13/11): a line naming the template's accent value or its colours,
// palette or logo is `template_look_said`, in any form the value is written (hex with or without #, any case, rgb() or
// rgba()), except where the business's own colour is that value (`sameAsTemplate`). The value check holds in every
// language; the wording check reads English words only. Invented template and lines; no model is called.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-brand-look-said.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { lookProblemsOf } from '../domain/brand-look-problems.mjs'

const TEMPLATE = { slug: 'example-court', name: 'Example Court', accent: '#c36349' }
const OWN_BLUE = { accent: { from: 'logo', name: 'Your logo' }, logo: { from: 'website' } }
const said = (line, { accent = '#225588', sources = OWN_BLUE } = {}) =>
  lookProblemsOf({
    plan: {
      look: { accent, logo: { kind: 'own', source: 'Website' } },
      assumptions: [{ id: 'x', said: line }]
    },
    template: TEMPLATE,
    lookSources: sources
  }).map((p) => p.code)

test('the template accent value is caught in every form it is written', () => {
  for (const line of [
    'Buttons keep #C36349.',
    'Buttons keep #c36349.',
    'Buttons keep c36349.',
    'Buttons keep C36349 for now.',
    'Buttons keep rgb(195, 99, 73).',
    'Buttons keep rgba(195,99,73,0.9).',
    'Los botones usan #C36349.'
  ])
    assert.deepEqual(said(line), ['template_look_said'], line)
  for (const line of ['Order c363490 is shipped.', 'Buttons use #225588.', 'rgb(195, 99, 74) is close.'])
    assert.deepEqual(said(line), [], line)
})

test("the template's words: default colours, palette, accent, the kit name's logo and colours", () => {
  for (const line of [
    'We kept the default colours.',
    'Buttons stay in the default palette.',
    "Buttons stay in the template's default accent.",
    "We kept the template's palette.",
    "Your logo sits where the template's logo was.",
    'The templates colors stay.',
    'Kept the Example Court logo for now.',
    'The Example Court colours stay.'
  ])
    assert.deepEqual(said(line), ['template_look_said'], line)
  for (const line of ['The menu page uses the page template for dishes.', 'Your logo is used as it is.'])
    assert.deepEqual(said(line), [], line)
})

test("the business's own colour that is the template accent may be named, for a measured or an adjusted colour", () => {
  for (const from of ['logo', 'logo-adjusted']) {
    const sources = { accent: { from, sameAsTemplate: true }, logo: { from: 'website' } }
    assert.deepEqual(
      said('Your logo copper #c36349 is used for buttons.', { accent: '#c36349', sources }),
      []
    )
    assert.deepEqual(said('Buttons use rgb(195, 99, 73), your copper.', { accent: '#c36349', sources }), [])
    // The words still name the template, whatever the colour.
    assert.deepEqual(said('The template colours match your logo.', { accent: '#c36349', sources }), [
      'template_look_said'
    ])
  }
})
