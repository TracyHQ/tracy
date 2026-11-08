// Read-back of a slot that left the stored field with its row (ADR 0044, decision 7): inspect no longer lists it under
// `slots` but under `removedSlots`. A line saying it was hidden reads as a match; a line that was to be written there
// stays red, and says the slot left with its row. Every slot, page and value is made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runSiteCheck } from '../src/site-check/site-check.js'
import { checkSite, report, written } from './_site-check.mjs'

const group = (result) => result.groups.find((g) => g.name === 'read-back')

/** A site whose inspect lists `held` as its slots and `removed` as the slots it took out with their rows. */
const siteWith = (held, removed) => {
  const base = checkSite(held)
  return {
    door: {
      async apply(call) {
        const answer = await base.door.apply(call)
        return call.action === 'content.contract' ? { ...answer, removedSlots: removed } : answer
      }
    }
  }
}

const check = (site, rep) => runSiteCheck({ door: site.door, report: rep })

test('a hidden line whose slot left with its row reads as a match, not as a slot the site lacks', async () => {
  const hidden = {
    ...written('block-7.link-3', 'module-7.2'),
    status: 'hidden',
    ordered: undefined,
    reason: 'the plan hides this slot: it was printed by module-7.2 and left with its row'
  }
  const kept = written('block-7.1', 'module-7.1', 'Book a court')
  const result = await check(
    siteWith({ 'module-7.1': 'Book a court' }, { 'module-7.2': 'removed' }),
    report([kept, hidden])
  )
  assert.deepEqual(group(result).failures, [])
  assert.equal(group(result).status, 'green')
  assert.equal(group(result).lines['block-7.link-3'], 'match')
})

test('a written line whose slot left with its row stays red, and says the slot left with its row', async () => {
  const line = written('block-7.3', 'module-7.3', 'Meet the coaches')
  const result = await check(siteWith({}, { 'module-7.3': 'removed' }), report([line]))
  assert.equal(group(result).status, 'red')
  const [failure] = group(result).failures
  assert.equal(failure.slot, 'block-7.3')
  assert.doesNotMatch(failure.reason, /does not have this slot/)
  assert.match(failure.reason, /left the stored field with its row/)
})

test('a hidden line whose slot is neither listed nor removed is still a slot the site lacks', async () => {
  const hidden = { ...written('block-7.link-4', 'module-7.4'), status: 'hidden', ordered: undefined }
  const result = await check(siteWith({}, { 'module-7.9': 'removed' }), report([hidden]))
  assert.match(group(result).failures[0].reason, /does not have this slot/)
})
