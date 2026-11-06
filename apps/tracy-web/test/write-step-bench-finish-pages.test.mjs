// Two faults a real finisher run made on its merge (spec #418), driven through the step 9 bench's `finish` on the invented
// written site: the site check names a page as it answers (`/index.php/about/`) where the finder names it as kept (`/about`),
// and they are one page; and a phone the brief gives is the customer's own, so neither source may call it demo. Fakes only;
// only what comes out is asserted: the repair log, the doors asked and the site's writes.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { cleanUp, finishOn, scriptedDoor } from './_write-step-finish-run.mjs'

after(cleanUp)

const BRIEF_PHONE = '+44 20 7946 0123'
const briefFile = { facts: [{ id: 'f-phone', field: 'phone', value: BRIEF_PHONE }] }

/** The finder's answers for the home page and the about page, asked in that order. */
const finderSaying = ({ home = [], about = [] }) =>
  scriptedDoor('Finisher finder', [{ faults: home }, { faults: about }])

/** A first site check whose one red group holds these failures. */
const firstWith = (group, failures) => ({
  failures: failures.map((f) => ({ group, slot: null, width: 390, level: 'block', causingStep: 9, ...f }))
})

test('a site check failure on /index.php/about/ and the finder fault on /about are one fault, never measurement wrong', async () => {
  const run = await finishOn({
    finder: finderSaying({
      about: [
        {
          page: '/about',
          viewport: 'phone',
          tile: 0,
          kind: 'broken-layout',
          seen: 'the heading reads "Our storybegan" with no space'
        }
      ]
    }),
    // An order of no listed kind: dropped, so the fault's own record is what the log keeps.
    fixer: scriptedDoor('Finisher fixer', [{}]),
    checker: scriptedDoor('Finisher checker', []),
    first: firstWith('glued-words', [{ page: '/index.php/about/', measured: 'Our storybegan' }])
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.equal(run.log.counts['measurement-wrong'], 0, JSON.stringify(run.log.records, null, 1))
  assert.equal(run.log.merge.confirmed, 1)
  assert.equal(run.log.merge.both, 1)
  const [record] = run.log.records
  assert.equal(record.page, '/about')
  assert.deepEqual(record.sources, ['finder', 'site-check'])
})

test('a site check failure on the home page as /index.php is the finder fault on / too', async () => {
  const run = await finishOn({
    finder: finderSaying({
      home: [
        { page: '/', viewport: 'phone', tile: 0, kind: 'broken-layout', seen: 'it reads "Openevery day"' }
      ]
    }),
    fixer: scriptedDoor('Finisher fixer', [{}]),
    checker: scriptedDoor('Finisher checker', []),
    first: firstWith('glued-words', [{ page: '/index.php', measured: 'Openevery day' }])
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.equal(run.log.counts['measurement-wrong'], 0)
  assert.equal(run.log.merge.both, 1)
})

test("a phone the brief gives is never demo: the finder's demo fact and the check's demo link are logged not-demo", async () => {
  const fixer = scriptedDoor('Finisher fixer', [])
  const run = await finishOn({
    finder: finderSaying({
      home: [
        {
          page: '/',
          viewport: 'desktop',
          tile: 0,
          kind: 'demo-fact',
          seen: 'the footer prints the demo number "020 7946 0123"'
        }
      ]
    }),
    fixer,
    checker: scriptedDoor('Finisher checker', []),
    first: firstWith('demo-links', [
      { page: '/index.php', slot: 'block-3.2', measured: 'tel:+442079460123' }
    ]),
    files: { 'brief-file': briefFile }
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.equal(fixer.asked.length, 0, 'no order is asked for the customer’s own phone')
  assert.deepEqual(run.site.writes, [])
  const notDemo = run.log.records.filter((r) => r.outcome === 'not-demo')
  assert.deepEqual(notDemo.map((r) => r.faultKind).sort(), ['demo-contact-link', 'demo-fact'])
  for (const r of notDemo) assert.match(r.reason, /phone/)
  assert.equal(run.log.counts['not-demo'], 2)
  assert.equal(run.log.merge.notDemo, 2)
})

test('a demo phone the brief does not give still goes to the fixer', async () => {
  const fixer = scriptedDoor('Finisher fixer', [{}])
  const run = await finishOn({
    finder: finderSaying({
      home: [
        {
          page: '/',
          viewport: 'desktop',
          tile: 0,
          kind: 'demo-fact',
          seen: 'the footer prints "+1 555 0100"'
        }
      ]
    }),
    fixer,
    checker: scriptedDoor('Finisher checker', []),
    files: { 'brief-file': briefFile }
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.equal(fixer.asked.length, 1)
  assert.equal(run.log.counts['not-demo'], 0)
})
