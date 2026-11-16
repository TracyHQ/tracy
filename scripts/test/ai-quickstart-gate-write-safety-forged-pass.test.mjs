// A write safety measurement set to `passed` by hand while its own lists still say it did not finish (ticket #586,
// review 6, attempt C): the stop reason it keeps, a place it ended untested, and ledger rows whose probe was not
// written or judged by no page are each refused by the record's measurement check. Invented values only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { measurementProblems } from '../ai-quickstart/gate/record-verdict.mjs'

const passing = () => ({
  measurements: {
    writeSafety: {
      status: 'passed',
      places: { probed: 1, tested: 1, written: 1 },
      passes: [{ pass: 1 }],
      findings: [],
      missing: [],
      notSiteTested: [],
      ledger: [
        {
          place: 'writer:home/b1/heading',
          probe: 'tag',
          status: 'written',
          site: true,
          reached: true,
          pass: 1
        }
      ],
      ends: { tested: 1, refused: 0, untested: [], parkedTested: 0 }
    }
  }
})
const problems = (r) => measurementProblems(r).filter((p) => p.message.startsWith('writeSafety'))

test('C: an honest passing write safety holds no problem', () => {
  assert.deepEqual(problems(passing()), [])
})

test('C: a passed write safety that keeps a stop reason, an untested place or an unjudged row is refused', () => {
  const stopped = passing()
  stopped.measurements.writeSafety.incomplete = 'steps'
  assert.equal(problems(stopped).length, 1)
  const untested = passing()
  untested.measurements.writeSafety.ends.untested = [
    { place: 'fact:contact.phone#0', why: 'no_pass_reached_it' }
  ]
  assert.equal(problems(untested).length, 1)
  for (const status of ['not_written', 'not_judged']) {
    const row = passing()
    row.measurements.writeSafety.ledger.push({
      place: 'writer:home/b1/heading',
      probe: 'emailcloak',
      status,
      pass: 1
    })
    assert.equal(problems(row).length, 1, status)
  }
})
