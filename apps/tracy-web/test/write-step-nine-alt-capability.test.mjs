// Step 9b must keep an unrepairable alt red without paying for native turns that cannot edit its mapped storage.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildCommentTurn } from '../src/lib/comment-turn.js'
import { kitAltSlots, withAltSlot } from '../src/write-step/repair-pass/repair-alt-slots.js'
import { commentItem } from '../src/write-step/repair-pass/repair-items.js'
import { repairClock } from '../src/write-step/repair-pass/repair-limits.js'
import { runRepairPass } from '../src/write-step/repair-pass/repair-pass.js'
import { checkOf, failure, fakeAgent, fakeClock, stepNine } from './_write-step-nine-repair.mjs'

const contact = { key: 'contact-1.16', type: 'image', entity: 'contact-1', column: 'image' }
const alt = (slot, page = '/') => failure('alt-matches-picture', page, slot, 'Demo alt')
async function repair(failures, { contentMap = null, altSlots = null, checks = null } = {}) {
  const clock = fakeClock()
  const agent = fakeAgent({ clock })
  const first = checkOf(failures)
  let n = 0
  const pass = {
    agent,
    contentMap,
    altSlots,
    clock: repairClock({ now: clock.now, sleep: clock.sleep }),
    ledger: { turns: [], undone: new Set(), records: new Map() },
    buildCommentTurn,
    urlOf: (page) => `https://site.example${page}`,
    log: () => {},
    nextRequestId: () => `alt-test-${++n}`,
    checkSite: async () => (checks ? (checks.shift() ?? first) : first)
  }
  return { result: await runRepairPass(pass, { firstCheck: first }), agent }
}

test('mapped contact image alt stays blocking without opening or repeating a native turn', async () => {
  const f = alt('contact-1.16', '/contact')
  const { result, agent } = await repair([f, { ...f, width: 390 }], { contentMap: { slots: [contact] } })
  assert.equal(agent.sent.opened, 0)
  assert.equal(agent.sent.prompts.length, 0)
  assert.equal(result.status, 'incomplete')
  assert.equal(result.check.status, 'red')
  assert.equal(result.remaining.length, 2)
  assert.ok(result.skipped.every((s) => s.code === 'unsupported-alt-target'))
  assert.match(result.skipped[0].reason, /no independent alt slot/)
})

test('supported article and module HTML alt storage still receives native repairs', async () => {
  const slots = [
    { key: 'article-7.1', type: 'image', entity: 'article-7', column: 'images', jsonPath: ['image_intro'] },
    { key: 'module-8.1', type: 'image', entity: 'module-8', column: 'content', xpath: '/p/img/@src' }
  ]
  const { result, agent } = await repair(
    slots.map((s) => alt(s.key)),
    { contentMap: { slots } }
  )
  assert.equal(agent.sent.opened, 1)
  assert.ok(agent.sent.prompts.length > 0)
  assert.equal(result.skipped.length, 0)
  assert.equal(result.status, 'incomplete', 'a no-op native turn does not erase checker failures')
})

test('gallery alt slots preserve block to module aliases even when picture storage has no record alt', async () => {
  const kit = {
    storedFields: [{ slot: 'block-97.1', field: 'params.gallery[alt].0' }],
    blocks: [
      {
        lists: [
          {
            rowSlots: [
              { id: 'block-97.0', type: 'image' },
              { id: 'block-97.1', type: 'text' }
            ]
          }
        ]
      }
    ]
  }
  const { result, agent } = await repair([alt('block-97.0')], {
    altSlots: kitAltSlots(kit),
    contentMap: { slots: [{ key: 'module-97.0', type: 'image', entity: 'module-97', column: 'params' }] }
  })
  assert.ok(agent.sent.prompts.length > 0)
  assert.equal(result.skipped.length, 0)
  assert.match(agent.sent.prompts[0].text, /slot block-97\.1, the alt/)
})

test('absent or unmatched content maps retain the existing native repair path', async () => {
  for (const contentMap of [
    null,
    { slots: [] },
    { slots: [{ ...contact, key: 'contact-2.16' }] },
    { slots: [{ key: 'contact-1.16', type: 'image' }] }
  ]) {
    const { result, agent } = await repair([alt('contact-1.16')], { contentMap })
    assert.ok(agent.sent.prompts.length > 0)
    assert.equal(result.skipped.length, 0)
  }
})

test('a supported independent fault still runs while unsupported contact alt remains red', async () => {
  const { result, agent } = await repair(
    [alt('contact-1.16'), failure('demo-words', '/', 'module-2.1', 'Demo cafe')],
    { contentMap: { slots: [contact] } }
  )
  assert.ok(agent.sent.prompts.length > 0)
  assert.ok(agent.sent.requests.flatMap((r) => r.items).every((i) => i.element.label !== 'contact-1.16'))
  assert.equal(result.status, 'incomplete')
  assert.ok(result.remaining.some((f) => f.slot === 'contact-1.16'))
})

test('direct unsupported comment metadata never claims the alt target is writable', () => {
  const fault = withAltSlot({ kind: 'wrong-alt', slot: 'contact-1.16', page: '/' }, null, {
    slots: [contact]
  })
  const item = commentItem(fault, {
    url: 'https://site.example/',
    located: { answer: { status: 'resolved', levels: [{ writable: true }] } }
  })
  assert.equal(item.locateFrom, 'fault')
  assert.ok(item.locate.levels.every((l) => l.writable === false))
  assert.match(item.locateProblem, /no independent alt slot/)
})

test('unsupported alts exposed after page recovery are recorded without a paid retry', async () => {
  const hiddenAlt = alt('contact-1.16', '/contact')
  const unavailable = failure('dead-links', '/contact', null, '404', {
    reason: 'A kept page does not answer (404)'
  })
  const { result, agent } = await repair([unavailable], {
    contentMap: { slots: [contact] },
    checks: [checkOf([hiddenAlt]), checkOf([hiddenAlt])]
  })
  assert.equal(agent.sent.prompts.length, 1, 'only the page recovery gets a native turn')
  assert.equal(result.resent.length, 0)
  assert.equal(result.status, 'incomplete')
  assert.ok(result.remaining.some((f) => f.slot === hiddenAlt.slot))
  assert.ok(
    result.skipped.some((s) => s.code === 'unsupported-alt-target' && s.fault.slot === hiddenAlt.slot)
  )
})

test('runStepNine carries the write content map into unsupported alt scheduling and preserves failed handover', async () => {
  const agent = fakeAgent()
  const { result, saved } = await stepNine({
    checks: [checkOf([alt('contact-1.16', '/contact')])],
    agent,
    contentMap: { slots: [contact] }
  })
  assert.equal(agent.sent.opened, 0)
  assert.equal(result.repair.status, 'incomplete')
  assert.equal(result.siteCheck.status, 'red')
  assert.equal(result.report.status, 'stopped')
  assert.equal(result.report.cause.code, 'STEP_NINE_CHECK_FAILED')
  assert.equal(saved.get('repair-pass.json').skipped[0].code, 'unsupported-alt-target')
  assert.equal(saved.get('site-check.json').groups[0].failures[0].slot, 'contact-1.16')
})
