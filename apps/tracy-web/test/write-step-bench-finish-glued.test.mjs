// Glued words (spec #418, #424): at phone width the template hides a heading's line break, so with no space before the break
// its words run together ("STRENGTHNOW"). Code puts the missing space before the break itself, every word and code kept, with
// no model asked (a real run lost every such order to a fixer that dropped the break), and judges it on the page as served.
// A site check failure is read the way the site check reads the page, so the same words are judged the same; a style aimed
// at glued words is kept only when the served page reads them apart. Driven through the step 9 bench's `finish` on the
// invented written site; only what comes out is asserted.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { codesToHtml } from '../src/lib/site-copy/emphasis-markup.js'
import { heldAtStart } from './_write-step-finisher.mjs'
import { cleanUp, everyRepairChecker, finishOn, scriptedDoor } from './_write-step-finish-run.mjs'

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

const run = (over = {}) =>
  finishOn({
    finder: scriptedDoor('Finisher finder', [{ faults: [glued] }, { faults: [] }]),
    fixer: scriptedDoor('Finisher fixer', []),
    checker: everyRepairChecker(),
    served,
    held,
    ...over
  })

test('a glued heading gets the space before its break from code, no model asked, judged by code on the page', async () => {
  const done = await run()
  assert.equal(done.code, 0, done.err.join('\n'))
  assert.deepEqual(
    done.site.writes.map((w) => w.changes),
    [{ 'module-2.1': SPACED }]
  )
  const [record] = done.log.records
  assert.equal(record.outcome, 'kept', record.reason)
  assert.equal(record.checkedBy, 'code')
  assert.deepEqual(record.order, { kind: 'fix-text', slot: 'block-2.1', text: SPACED })
  assert.equal(record.orderedBy, 'code')
  assert.equal(done.site.held['module-2.1'], SPACED)
  // No fixer call and no checker call: no reply file of either.
  assert.deepEqual(
    done.log.replies.filter((f) => /fixer|checker/.test(f)),
    []
  )
})

test('a glued heading the served page still glues is undone, and the same order is not written again', async () => {
  const done = await run({
    // A page cache that keeps serving the heading as it was.
    served: () => (page) =>
      page === '/' ? `<span class="h2">${codesToHtml(GLUED)}</span>` : '<html></html>',
    finder: scriptedDoor('Finisher finder', [{ faults: [glued] }, { faults: [] }])
  })
  assert.equal(done.code, 0, done.err.join('\n'))
  assert.equal(done.site.writes.length, 1, 'written once, in round one only')
  const ordered = done.log.records.filter((r) => r.order?.slot === 'block-2.1')
  assert.deepEqual(
    ordered.map((r) => r.outcome),
    ['undone', 'dropped']
  )
  assert.match(ordered[0].reason, /still glues the words/)
  assert.match(ordered[1].reason, /written and undone in the round before/)
  assert.equal(done.site.held['module-2.1'], GLUED)
})

test('a glued words failure of the site check is confirmed by reading the page as the check reads it, then repaired', async () => {
  const failure = {
    group: 'glued-words',
    page: '/',
    slot: null,
    width: 390,
    level: 'block',
    causingStep: 9,
    // The site check reads an element's text content: the hidden break leaves no space.
    measured: 'Strengthnow',
    reason: 'Words run together with no space (Strength|now)'
  }
  const done = await run({
    finder: scriptedDoor('Finisher finder', [{ faults: [] }, { faults: [] }]),
    first: { failures: [failure] }
  })
  assert.equal(done.code, 0, done.err.join('\n'))
  assert.equal(
    done.log.records.filter((r) => r.outcome === 'measurement-wrong').length,
    0,
    'the page still glues the words: the measurement is right'
  )
  const repaired = done.log.records.find((r) => r.slot === 'block-2.1')
  assert.equal(repaired.outcome, 'kept', repaired.reason)
  assert.equal(done.site.held['module-2.1'], SPACED)
})

test('a style aimed at glued words that leaves them glued on the served page is undone, whatever the checker says', async () => {
  // The slot holds its words apart; the template glues them itself, so no slot holds a break to space and the fixer is asked.
  const apart = { ...heldAtStart(), 'module-2.1': 'Strength now' }
  const checker = everyRepairChecker('better', 'the words look apart')
  const done = await finishOn({
    finder: scriptedDoor('Finisher finder', [{ faults: [glued] }, { faults: [] }]),
    fixer: scriptedDoor('Finisher fixer', [
      { kind: 'style-block', block: 'block-2', target: null, styles: { 'word-spacing': '0.1em' } },
      { kind: 'style-block', block: 'block-2', target: null, styles: { 'word-spacing': '0.2em' } }
    ]),
    checker,
    served: () => (page) =>
      page === '/'
        ? '<div id="Mod2"><span class="h2">Strength<br/><span>now</span></span></div>'
        : '<html></html>',
    held: apart,
    head: true,
    limits: { rounds: 1 }
  })
  assert.equal(done.code, 0, done.err.join('\n'))
  assert.equal(checker.asked.length, 1, 'the checker judged the style')
  const [record] = done.log.records
  assert.equal(record.outcome, 'undone')
  assert.match(record.reason, /still reads the words glued/)
})
