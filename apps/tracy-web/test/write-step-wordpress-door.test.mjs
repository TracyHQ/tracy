// The WordPress site door of the write step (src/write-step/site-doors/wordpress.js): one contract write of the Claude
// Cowork for WordPress, in the protocol the seeder writes it (inspect, then one apply of plain-text changes under the
// inspected revision), with what the plugin does not take yet refused by slot before anything is sent, so the write
// step's rounds go on without exactly those slots and their lines say "not on WordPress yet". All data made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { notOnPlatform, onPlatform, siteDoorFor } from '../src/write-step/site-doors/index.js'
import { writeContract } from '../src/write-step/contract-write.js'

const CONTRACT = 'harbour-wp/wp7/1.0.0'
const SLOTS = [
  { key: 'hero.title', type: 'text' },
  { key: 'hero.lead', type: 'text' },
  { key: 'hero.picture', type: 'image' },
  { key: 'hero.button_url', type: 'url' }
]

/** A WordPress plugin stand-in: answers inspect, and an apply as `answer(params)` says, keeping every call. */
function wordpressSite(answer = () => ({ ok: true, afterRevision: 'rev-2' })) {
  const calls = []
  const apply = async (call) => {
    calls.push(structuredClone(call))
    if (call.params?.operation === 'inspect')
      return { ok: true, contract: CONTRACT, revision: 'rev-1', slots: SLOTS }
    return answer(call.params)
  }
  return { apply, calls }
}
const mapping = (more = {}) => ({
  contract: CONTRACT,
  revision: 'rev-1',
  changes: { 'hero.title': 'Harbour Kitchen', 'hero.lead': 'Fish from the morning boats.' },
  evidence: { 'hero.title': 'Brief facts: f-name' },
  emptyLinks: [],
  emptySlots: [],
  pending: [],
  ...more
})
const door = siteDoorFor('wordpress')
/** The site as the write step's inspect read it: `writeContract` hands this reading to the door again. */
const INSPECT = { ok: true, contract: CONTRACT, revision: 'rev-1', slots: SLOTS }

test('the door writes plain changes in one apply, as the seeder does: revision, apply id, request id, no evidence', async () => {
  const site = wordpressSite()
  const done = await door.applyContract({ apply: site.apply, siteKey: 'harbour', mapping: mapping() })
  assert.equal(done.contract, CONTRACT)
  assert.deepEqual(
    site.calls.map((c) => c.params.operation),
    ['inspect', 'apply']
  )
  const params = site.calls[1].params
  assert.equal(params.expected_revision, 'rev-1')
  assert.match(params.apply_id, /^contract-[0-9a-f]{48}$/)
  assert.match(params.request_id, /^[0-9a-f]{64}$/)
  assert.deepEqual(params.changes, {
    'hero.title': 'Harbour Kitchen',
    'hero.lead': 'Fish from the morning boats.'
  })
  assert.equal(params.evidence, undefined)
  assert.equal(params.empty_slots, undefined)
})

test('what the plugin does not take is refused by slot before anything is sent, and the next round writes the rest', async () => {
  const site = wordpressSite()
  const wrote = await writeContract({
    applyContract: door.applyContract,
    apply: site.apply,
    siteKey: 'harbour',
    reading: INSPECT,
    mapping: mapping({
      changes: {
        'hero.title': 'Harbour Kitchen',
        'hero.picture': 'images/tracy-content/abc.jpg',
        'hero.button_url': '/menu'
      },
      emptySlots: ['hero.lead']
    }),
    isCancelled: async () => false,
    sleep: async () => {}
  })
  assert.deepEqual(wrote.written, ['hero.title'])
  assert.deepEqual([...wrote.refused.keys()].sort(), ['hero.button_url', 'hero.lead', 'hero.picture'])
  for (const entry of wrote.refused.values()) assert.match(entry.message, /^not_on_wordpress: /)
  // One apply only, with the words alone.
  const applies = site.calls.filter((c) => c.params.operation === 'apply')
  assert.equal(applies.length, 1)
  assert.deepEqual(applies[0].params.changes, { 'hero.title': 'Harbour Kitchen' })
  // Their lines are skipped on WordPress, in words, never read as a refusal of the site.
  const line = { slot: 'hero.lead', status: 'failed', reason: wrote.refused.get('hero.lead').message }
  assert.equal(notOnPlatform(line, 'wordpress').status, 'skipped')
  assert.match(notOnPlatform(line, 'wordpress').reason, /^not on WordPress yet: /)
})

test('a slot the plugin refuses by name in its words is refused alone, and the others are written on the next round', async () => {
  let round = 0
  const site = wordpressSite((params) =>
    (round += 1) === 1
      ? { ok: false, error: 'bad_value', message: `The value of hero.lead is longer than its block allows` }
      : { ok: true, afterRevision: 'rev-2', echo: params.changes }
  )
  const wrote = await writeContract({
    applyContract: door.applyContract,
    apply: site.apply,
    siteKey: 'harbour',
    reading: INSPECT,
    mapping: mapping(),
    isCancelled: async () => false,
    sleep: async () => {}
  })
  assert.deepEqual(wrote.written, ['hero.title'])
  assert.equal(wrote.refused.get('hero.lead').code, 'bad_value')
  // A refusal of the site stays a failure on WordPress.
  const line = { slot: 'hero.lead', status: 'failed', reason: wrote.refused.get('hero.lead').message }
  assert.equal(notOnPlatform(line, 'wordpress'), line)
})

test('a refusal that names no slot stops the write in the plugin words; a wrong contract stops before the apply', async () => {
  const site = wordpressSite(() => ({
    ok: false,
    error: 'contract_unbound',
    message: 'This site is not bound'
  }))
  await assert.rejects(
    door.applyContract({ apply: site.apply, siteKey: 'harbour', mapping: mapping() }),
    /This site is not bound/
  )
  const other = wordpressSite()
  await assert.rejects(
    door.applyContract({
      apply: other.apply,
      siteKey: 'harbour',
      mapping: mapping({ contract: 'x/wp7/9.9.9' })
    }),
    /must name the installed quickstart contract/
  )
  assert.deepEqual(
    other.calls.map((c) => c.params.operation),
    ['inspect']
  )
})

test('🔒 on WordPress a call of a Joomla stage is answered by name and never sent; the contract and uploads are sent', async () => {
  const site = wordpressSite()
  const wp = onPlatform({ apply: site.apply }, 'wordpress')
  const answer = await wp.apply({
    siteKey: 'harbour',
    action: 'content.update',
    params: { kind: 'menuItem', id: 3 }
  })
  assert.equal(answer.error, 'not_on_wordpress')
  assert.match(answer.message, /WordPress has no door for content\.update menuItem/)
  await wp.apply({ siteKey: 'harbour', action: 'template.siteSettings', params: { operation: 'set' } })
  assert.deepEqual(site.calls, [])
  await wp.apply({ siteKey: 'harbour', action: 'media.upload', params: {} })
  await wp.apply({ siteKey: 'harbour', action: 'content.contract', params: { operation: 'inspect' } })
  assert.deepEqual(
    site.calls.map((c) => c.action),
    ['media.upload', 'content.contract']
  )
})
