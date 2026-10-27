// Structured checks the two pilots share: a RED log and a case evidence file are parsed, never searched for a phrase.
import assert from 'node:assert/strict'
import path from 'node:path'
import { safeName } from '../lib/kit.mjs'
import { readTextAsync } from '../../../lib/bounded-reader.mjs'

const field = (log, name) => {
  const hits = log.split('\n').filter((l) => l.startsWith(`${name}: `))
  assert.equal(hits.length, 1, `RED log has ${hits.length} "${name}" lines, expected one`)
  return hits[0].slice(name.length + 2)
}

/** A RED log proves a PASS only when: the named assertion ran on a mutant, its control held, its check failed, no harness error. */
export async function assertRedLog(outDir, r) {
  const log = await readTextAsync(path.join(outDir, r.redProof.log))
  assert.equal(field(log, 'case'), r.id, `${r.id}: RED log is for another case`)
  assert.equal(field(log, 'assertionId'), r.redProof.assertionId, `${r.id}: RED log names another assertion`)
  assert.ok(r.assertionIds.includes(r.redProof.assertionId))
  const mutation = field(log, 'mutation').split(' ')[0]
  assert.ok(
    r.redProof.ref.startsWith(`${mutation}@`),
    `${r.id}: proof ref ${r.redProof.ref} is not mutation ${mutation}`
  )
  const control = JSON.parse(field(log, 'control'))
  const check = JSON.parse(field(log, 'check'))
  assert.equal(control?.ok, true, `${r.id}: positive control did not hold on the mutant`)
  assert.equal(check?.ok, false, `${r.id}: the check did not fail on the mutant`)
  assert.equal(field(log, 'harnessError'), 'none', `${r.id}: the mutant run was a harness error`)
  assert.match(field(log, 'result'), /^RED - /)
}

/** The case evidence file holds the outcome of every assertion; a PASS needs control+check true, a FAIL control true and check false. */
export async function assertEvidenceOutcome(outDir, r) {
  const doc = JSON.parse(await readTextAsync(path.join(outDir, `evidence/${safeName(r.id)}.json`)))
  assert.equal(doc.case, r.id)
  assert.equal(doc.outcomes.length, r.assertionIds.length, `${r.id}: evidence lacks an assertion outcome`)
  for (const { id, outcome } of doc.outcomes) {
    assert.ok(r.assertionIds.includes(id))
    assert.equal(outcome.control?.ok, true, `${r.id}: ${id} control not intact in evidence`)
    if (r.verdict === 'PASS') assert.equal(outcome.check?.ok, true, `${r.id}: ${id} check not ok`)
  }
  if (r.verdict === 'FAIL')
    assert.ok(
      doc.outcomes.some((o) => o.outcome.check?.ok === false && o.outcome.check.detail),
      `${r.id}: FAIL without a failed check and its detail in evidence`
    )
}

/** A recorded finding must carry its oracle and reproduction; the FAIL must be a failed check with intact control. */
export function assertKnownFinding(known, id) {
  const k = known.find((x) => x.id === id)
  assert.ok(k, `${id}: an unrecorded FAIL`)
  for (const key of ['finding', 'oracle', 'reproduce'])
    assert.ok(typeof k[key] === 'string' && k[key].length > 20, `${id}: finding record lacks ${key}`)
}
