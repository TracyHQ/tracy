// The hide stage through the write step's entry point (ADR 0044, decisions 2 and 4): the plan's hidden list becomes
// `blocks.unpublish` and `empty_slots`, kit-listed fixed sentences go through `setSource`, and the report and the site
// check say what happened to each. A fake site door answers as the plugin does; every fixture is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runSiteCheck } from '../src/site-check/site-check.js'
import { fixedSentence, hideDoor, hideKit, planHiding, runHide, withFixedText } from './_write-step-hide.mjs'
import { copy, fakeSite, plan } from './_write-step-run.mjs'

const applies = (site) => site.calls.filter((c) => c.params.operation === 'apply')
const blockCalls = (site) => site.calls.filter((c) => c.params.operation === 'blocks.unpublish')
const sources = (site) => site.calls.filter((c) => c.action === 'template.languageOverrides')
const lineOf = (report, slot) => report.slots.find((s) => s.slot === slot)
const failuresOf = (check) => check.groups.find((g) => g.name === 'read-back').failures

test('the fake door refuses a write with no apply id, as the real one does', async () => {
  const site = fakeSite({ hideDoor: hideDoor({ overrides: {} }) })
  const asked = [
    { action: 'content.contract', params: { operation: 'apply', changes: {} } },
    { action: 'content.contract', params: { operation: 'blocks.unpublish', blocks: ['module-4'] } },
    { action: 'template.languageOverrides', params: { operation: 'setSource', strings: {} } },
    { action: 'content.update', params: { kind: 'menuItem', id: 1, fields: { published: 0 } } }
  ]
  for (const call of asked) {
    const answer = await site.door.apply({ siteKey: 's', ...call })
    assert.equal(answer.message, 'apply_id required', call.params.operation ?? call.action)
  }
})

test('a hidden slot goes as empty_slots in the one contract call, and reads back green once empty', async () => {
  const { report, site } = await runHide()
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  const [call, ...rest] = applies(site)
  assert.equal(rest.length, 0, 'one contract call')
  assert.ok(call.params.empty_slots.includes('module-2.3'))
  assert.ok(Object.keys(call.params.changes).includes('module-2.1'), 'beside the changes')
  const line = lineOf(report, 'block-2.3')
  assert.equal(line.status, 'hidden')
  assert.equal(line.key, 'module-2.3')
  assert.equal(line.owner, 'plan')
  assert.match(line.reason, /plan hides/)
  assert.equal(site.held['module-2.3'], '')
  assert.ok(report.counts.hidden >= 1)
})

test('a dropped block is unpublished first, its slots go with it, and the contract call names the new revision', async () => {
  const { report, site } = await runHide()
  const [unpublish] = blockCalls(site)
  assert.deepEqual(unpublish.params.blocks, ['module-4'])
  assert.match(unpublish.params.apply_id, /^contract-/)
  assert.ok(unpublish.params.request_id)
  assert.equal(unpublish.params.expected_revision, 'rev-1')
  assert.ok(site.calls.indexOf(unpublish) < site.calls.indexOf(applies(site)[0]), 'page frame first')
  assert.equal(applies(site)[0].params.expected_revision, 'rev-1+blocks')
  assert.ok(!applies(site)[0].params.empty_slots.includes('module-4.1'), 'the block took it away')

  const slot = lineOf(report, 'block-4.1')
  assert.equal(slot.status, 'hidden')
  assert.equal(slot.ordered, '0')
  assert.deepEqual(slot.readFrom, {
    action: 'content.get',
    params: { kind: 'module', id: 4 },
    path: ['item', 'published']
  })
  const block = lineOf(report, 'block-4')
  assert.deepEqual(
    [block.status, block.part, block.key, block.owner, block.ordered],
    ['hidden', 'block', null, 'plan', '0']
  )
})

test('a block the plan hides on one page and another kept page still shows is not unpublished', async () => {
  const kit = hideKit()
  kit.doc.pages[1].blocks[1440].push('block-4')
  const { site, report } = await runHide({ kit })
  assert.equal(blockCalls(site).length, 0)
  assert.ok(applies(site)[0].params.empty_slots.includes('module-4.1'), 'its words are emptied instead')
  assert.equal(lineOf(report, 'block-4'), undefined)
})

test('a block with no module behind it has its slots emptied one by one', async () => {
  const kit = hideKit()
  delete kit.doc.blocks.find((b) => b.id === 'block-4').source
  const { site } = await runHide({ kit })
  assert.equal(blockCalls(site).length, 0)
  assert.ok(applies(site)[0].params.empty_slots.includes('module-4.1'))
})

test('a slot the plugin refuses is dropped and retried, failed in its words, and the rest still go', async () => {
  const refuse = {
    'module-2.3': { code: 'SLOT_NOT_HIDEABLE', message: 'This slot goes only with its row: module-2.3' }
  }
  const { report, site } = await runHide({ site: { refuse } })
  assert.equal(report.status, 'done')
  const [first, second] = applies(site)
  assert.ok(first.params.empty_slots.includes('module-2.3'))
  assert.equal(second.params.empty_slots, undefined)
  assert.equal(second.params.changes['module-2.1'], first.params.changes['module-2.1'])
  assert.notEqual(second.params.request_id, first.params.request_id)
  const line = lineOf(report, 'block-2.3')
  assert.equal(line.status, 'failed')
  assert.match(line.reason, /SLOT_NOT_HIDEABLE: This slot goes only with its row/)
  assert.equal(line.refusal.code, 'SLOT_NOT_HIDEABLE')
  assert.equal(site.held['module-2.1'], 'Train with a coach who knows you')
})

test('hidden slots still go when every change is refused, and nothing is sent once nothing is left', async () => {
  const nothingFits = (keys) =>
    Object.fromEntries(keys.map((key) => [key, { code: 'SLOT_TOO_LONG', message: 'too long' }]))
  const { site: first } = await runHide()
  const changes = Object.keys(applies(first)[0].params.changes)
  const { report, site } = await runHide({ site: { refuse: nothingFits(changes) } })
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  const last = applies(site).at(-1)
  assert.equal(last.params.changes, undefined)
  assert.deepEqual(last.params.empty_slots, ['module-2.3'])
  assert.equal(lineOf(report, 'block-2.3').status, 'hidden')

  const all = await runHide({ site: { refuse: nothingFits([...changes, 'module-2.3']) } })
  assert.equal(all.report.status, 'done', JSON.stringify(all.report.cause))
  assert.equal(lineOf(all.report, 'block-2.3').status, 'failed')
  assert.equal(all.report.counts.written, 0)
})

for (const [address, xpath] of [
  ['a text node', '/html/body/div/text()[2]'],
  ['an attribute', '/html/body/div/img/@src']
]) {
  test(`a slot addressed by ${address} is not sent, is failed naming #369, and the site check is red`, async () => {
    const { report, site } = await runHide({
      site: { overSlot: (s) => (s.key === 'module-2.3' ? { xpath, canHide: undefined } : {}) }
    })
    assert.ok(!(applies(site)[0].params.empty_slots ?? []).includes('module-2.3'))
    const line = lineOf(report, 'block-2.3')
    assert.equal(line.status, 'failed')
    assert.match(line.reason, /text node or attribute/)
    assert.match(line.reason, /#369/)
    const check = await runSiteCheck({ door: site.door, report })
    assert.equal(check.status, 'red')
    assert.ok(failuresOf(check).some((f) => f.slot === 'block-2.3' && /#369/.test(f.reason)))
  })
}

test('a slot the review does not list, a whole column, is failed with its reason and #369', async () => {
  const { report, site } = await runHide({
    site: { overSlot: (s) => (s.key === 'module-2.3' ? { canHide: undefined, column: 'email_to' } : {}) }
  })
  assert.ok(!(applies(site)[0].params.empty_slots ?? []).includes('module-2.3'))
  const line = lineOf(report, 'block-2.3')
  assert.equal(line.status, 'failed')
  assert.match(line.reason, /email_to/)
  assert.match(line.reason, /#369/)
})

test('a slot already empty on the site is hidden with no write', async () => {
  const { report, site } = await runHide({
    site: { overSlot: (s) => (s.key === 'module-2.3' ? { canHide: undefined, current: ' ' } : {}) }
  })
  assert.ok(!(applies(site)[0].params.empty_slots ?? []).includes('module-2.3'))
  const line = lineOf(report, 'block-2.3')
  assert.equal(line.status, 'hidden')
  assert.match(line.reason, /already empty/)
})

test('a hidden icon goes by the slot its kit row names; one with no slot is failed', async () => {
  const kit = hideKit()
  kit.doc.blocks
    .find((b) => b.id === 'block-3')
    .lists[0].rows.push({
      index: 2,
      slots: [
        { id: 'block-3.7.icon', type: 'icon', field: 'block-3.9' },
        { id: 'block-3.8.icon', type: 'icon' }
      ]
    })
  const { report, site } = await runHide({
    kit,
    files: { plan: planHiding(['block-3.7.icon', 'block-3.8.icon']) },
    site: { extraKeys: ['module-3.9'] }
  })
  assert.ok(applies(site)[0].params.empty_slots.includes('module-3.9'))
  const icon = lineOf(report, 'block-3.7.icon')
  assert.deepEqual([icon.status, icon.key], ['hidden', 'module-3.9'])
  const lost = lineOf(report, 'block-3.8.icon')
  assert.equal(lost.status, 'failed')
  assert.match(lost.reason, /#369/)
})

test('a slot another owner writes is not also emptied, and the line says so', async () => {
  const kit = hideKit()
  kit.doc.blocks
    .find((b) => b.id === 'block-3')
    .lists[0].rows.push({
      index: 2,
      slots: [{ id: 'block-3.7.icon', type: 'icon', field: 'block-2.1' }]
    })
  const { report, site } = await runHide({ kit, files: { plan: planHiding(['block-3.7.icon']) } })
  assert.ok(!(applies(site)[0].params.empty_slots ?? []).includes('module-2.1'))
  assert.equal(lineOf(report, 'block-3.7.icon').status, 'failed')
  assert.match(lineOf(report, 'block-3.7.icon').reason, /also writes/)
})

test('an older plugin takes no hide order: nothing is sent and every hide line is failed, not pretended', async () => {
  const { report, site } = await runHide({ site: { info: { ok: true, info: {} } } })
  assert.equal(report.status, 'done')
  assert.equal(blockCalls(site).length, 0)
  assert.equal(applies(site)[0].params.empty_slots, undefined)
  for (const slot of ['block-2.3', 'block-4.1', 'block-4']) {
    assert.equal(lineOf(report, slot).status, 'failed', slot)
    assert.match(lineOf(report, slot).reason, /older/)
  }
  assert.equal(site.held['module-2.1'], 'Train with a coach who knows you', 'the words still go')
})

test('a site whose info cannot be read is treated as one that cannot hide', async () => {
  const { report, site } = await runHide({ site: { info: { ok: false, error: 'read_failed' } } })
  assert.equal(applies(site)[0].params.empty_slots, undefined)
  assert.match(lineOf(report, 'block-2.3').reason, /read_failed/)
})

test('a refused block is failed in the plugin words, its slots with it, and the others go on', async () => {
  const kit = hideKit()
  kit.doc.blocks.find((b) => b.id === 'block-5').source = { entity: 'module-5' }
  const p = plan()
  p.pages[1].blocks[0] = { block: 'block-5', decision: 'hide', why: 'no coach' }
  const c = copy()
  c.slots = c.slots.filter((s) => s.slot !== 'block-5.1')
  const { report, site } = await runHide({
    kit,
    files: { plan: p, copy: c },
    door: { notModules: ['module-4'] }
  })
  assert.deepEqual(blockCalls(site).at(-1).params.blocks, ['module-5'])
  const failed = lineOf(report, 'block-4.1')
  assert.equal(failed.status, 'failed')
  assert.match(failed.reason, /BLOCK_UNKNOWN: Not a module of this contract/)
  assert.equal(lineOf(report, 'block-4').status, 'failed')
  assert.equal(lineOf(report, 'block-5').status, 'hidden')
  assert.equal(report.status, 'done')
})

test('a busy site is waited for, and the order is asked again', async () => {
  const waits = []
  const { report, site } = await runHide({
    door: { busyOnce: true },
    deps: { sleep: async (ms) => waits.push(ms) }
  })
  assert.equal(blockCalls(site).length, 2)
  assert.equal(waits.length, 1)
  assert.equal(lineOf(report, 'block-4').status, 'hidden')
})

test('a fixed sentence the plan names goes through setSource by the kit, with an apply id', async () => {
  const kit = withFixedText(hideKit(), fixedSentence())
  const { report, site, overrides } = await runHide({
    kit,
    files: { plan: planHiding(['block-2.fixed-made-up']) }
  })
  const [call, ...rest] = sources(site)
  assert.equal(rest.length, 0)
  assert.equal(call.params.operation, 'setSource')
  assert.equal(call.params.template, 'demo_gym')
  assert.ok(call.params.apply_id)
  assert.equal(call.params.locale, undefined)
  assert.deepEqual(call.params.strings, { TPL_MADE_UP_SENTENCE: '' })
  assert.deepEqual(overrides, { TPL_MADE_UP_SENTENCE: '' })
  const line = lineOf(report, 'block-2.fixed-made-up')
  assert.deepEqual([line.status, line.key, line.part, line.owner], ['hidden', null, 'fixed-text', 'plan'])
  assert.match(line.reason, /TPL_MADE_UP_SENTENCE/)
  const check = await runSiteCheck({ door: site.door, report })
  const warned = failuresOf(check).find((f) => f.slot === 'block-2.fixed-made-up')
  assert.equal(
    warned.level,
    'warn',
    'en-GB overrides have no read yet, and green never claims more than was read'
  )
})

test('a sentence printed by several constants empties them all', async () => {
  const entry = fixedSentence('TPL_ONE', {
    source: { constants: ['TPL_ONE', 'TPL_TWO'], constant: 'TPL_ONE' },
    hiddenBy: { constant: ['TPL_ONE', 'TPL_TWO'], value: '' }
  })
  const { site } = await runHide({
    kit: withFixedText(hideKit(), entry),
    files: { plan: planHiding(['block-2.fixed-made-up']) }
  })
  assert.deepEqual(sources(site)[0].params.strings, { TPL_ONE: '', TPL_TWO: '' })
})

test('a constant the plugin leaves out is failed in its words', async () => {
  const { report } = await runHide({
    kit: withFixedText(hideKit(), fixedSentence()),
    files: { plan: planHiding(['block-2.fixed-made-up']) },
    door: { refusedConstants: { TPL_MADE_UP_SENTENCE: 'not a string of this site' } }
  })
  const line = lineOf(report, 'block-2.fixed-made-up')
  assert.equal(line.status, 'failed')
  assert.match(line.reason, /TPL_MADE_UP_SENTENCE: not a string of this site/)
})

test('a constant the contract also holds moves the revision, so the site is inspected again', async () => {
  const { report, site } = await runHide({
    kit: withFixedText(hideKit(), fixedSentence()),
    files: { plan: planHiding(['block-2.fixed-made-up']) },
    door: { languageStrings: ['TPL_MADE_UP_SENTENCE'] }
  })
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  assert.equal(applies(site)[0].params.expected_revision, 'rev-1+words+blocks')
})

test('a fixed sentence the kit cannot hide, or the template prints itself, is failed and not sent', async () => {
  for (const [entry, words] of [
    [fixedSentence('TPL_X', { canHide: false }), /measured/],
    [
      { id: 'block-2.fixed-made-up', text: 'Own words', canHide: true, source: { kind: 'template' } },
      /template/
    ]
  ]) {
    const { report, site } = await runHide({
      kit: withFixedText(hideKit(), entry),
      files: { plan: planHiding(['block-2.fixed-made-up']) }
    })
    assert.equal(sources(site).length, 0)
    assert.equal(lineOf(report, 'block-2.fixed-made-up').status, 'failed')
    assert.match(lineOf(report, 'block-2.fixed-made-up').reason, words)
  }
})

test('more hidden slots than one call takes stop the run with nothing written', async () => {
  const extra = Array.from({ length: 1500 }, (_, i) => `module-2.${100 + i}`)
  const p = planHiding(extra.map((key) => key.replace('module-', 'block-')))
  const { report, site } = await runHide({ files: { plan: p }, site: { extraKeys: extra } })
  assert.equal(report.status, 'stopped')
  assert.equal(report.cause.code, 'TOO_MANY_SLOTS')
  assert.equal(applies(site).length, 0)
  assert.equal(blockCalls(site).length, 0)
})

test('the whole run reads back green from the site it wrote, and red if a block comes back', async () => {
  const { report, site } = await runHide()
  const held = await runSiteCheck({ door: readBackDoor(site), report })
  assert.deepEqual(
    failuresOf(held).filter((f) => f.level !== 'warn' && /hides/i.test(f.reason)),
    []
  )
  site.records.set('module-4', { ...site.records.get('module-4'), published: 1 })
  const back = await runSiteCheck({ door: readBackDoor(site), report })
  const again = failuresOf(back).filter((f) => f.slot === 'block-4' || f.slot === 'block-4.1')
  assert.equal(again.length, 2)
  assert.match(again[0].reason, /still published/)
})

/** The fake site as a read after the write: inspect answers what it holds now. */
function readBackDoor(site) {
  return {
    async apply(call) {
      const answer = await site.door.apply(call)
      if (call.params.operation !== 'inspect') return answer
      return {
        ...answer,
        slots: answer.slots.map((s) => ({ ...s, current: site.held[s.key] ?? 'demo words' }))
      }
    }
  }
}
