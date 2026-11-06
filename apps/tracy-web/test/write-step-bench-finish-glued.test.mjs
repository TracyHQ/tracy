// Glued words (spec #418): at phone width the template hides a heading's line break, so with no space before the break its
// words run together ("STRENGTHNOW"). A real run tried CSS five times and never moved a letter; the repair is a fix-text order
// that only puts the missing space before the break marker, every word and code left as written, judged by code on the page
// as served. Driven through the step 9 bench's `finish` on the invented written site; only what comes out is asserted.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { codesToHtml } from '../src/lib/site-copy/emphasis-markup.js'
import { heldAtStart } from './_write-step-finisher.mjs'
import { cleanUp, finishOn, scriptedDoor } from './_write-step-finish-run.mjs'

after(cleanUp)

const GLUED = 'Strength((br/))((span))now((/span))'
const SPACED = 'Strength ((br/))((span))now((/span))'
const held = { ...heldAtStart(), 'module-2.1': GLUED }

/** The home page as served now: the heading with its codes as tags, as the template prints them. */
const served = (site) => (page) =>
  page === '/'
    ? `<html><body><div id="Mod2"><span class="h2">${codesToHtml(site['module-2.1'])}</span></div></body></html>`
    : '<html></html>'

const glued = {
  page: '/',
  viewport: 'phone',
  tile: 0,
  slot: null,
  kind: 'broken-layout',
  seen: 'at phone width the heading reads "STRENGTHNOW": the words are glued where the line break was dropped'
}

const run = (order) =>
  finishOn({
    finder: scriptedDoor('Finisher finder', [{ faults: [glued] }, { faults: [] }]),
    fixer: scriptedDoor('Finisher fixer', [order]),
    checker: scriptedDoor('Finisher checker', []),
    served,
    held
  })

test('a glued heading is repaired by a space before its break, every word and code kept, judged by code on the page', async () => {
  const done = await run({ kind: 'fix-text', slot: 'block-2.1', text: SPACED })
  assert.equal(done.code, 0, done.err.join('\n'))
  assert.deepEqual(
    done.site.writes.map((w) => w.changes),
    [{ 'module-2.1': SPACED }]
  )
  const [record] = done.log.records
  assert.equal(record.outcome, 'kept', record.reason)
  assert.equal(record.checkedBy, 'code')
  assert.equal(done.site.held['module-2.1'], SPACED)
})

test('for glued words, a fix-text that does more than put the space before the break is refused', async () => {
  for (const [text, why] of [
    // The markup taken out: the accent and the break are lost.
    ['Strength now', /only a space before the line break/],
    // A word changed.
    ['Strong ((br/))((span))now((/span))', /only a space before the line break/],
    // A space put elsewhere.
    ['Strength((br/)) ((span))now((/span))', /only a space before the line break/]
  ]) {
    const done = await run({ kind: 'fix-text', slot: 'block-2.1', text })
    assert.equal(done.code, 0, done.err.join('\n'))
    assert.deepEqual(done.site.writes, [])
    const [record] = done.log.records
    assert.equal(record.outcome, 'dropped')
    assert.match(record.reason, why)
  }
})

test('a glued repair on a slot whose words are not the glued words seen is refused', async () => {
  const done = await finishOn({
    finder: scriptedDoor('Finisher finder', [
      { faults: [{ ...glued, seen: 'the heading reads "OPENEVERY DAY"' }] },
      { faults: [] }
    ]),
    fixer: scriptedDoor('Finisher fixer', [{ kind: 'fix-text', slot: 'block-2.1', text: SPACED }]),
    checker: scriptedDoor('Finisher checker', []),
    served,
    held
  })
  assert.deepEqual(done.site.writes, [])
  assert.match(done.log.records[0].reason, /glued words the finder saw/)
})
