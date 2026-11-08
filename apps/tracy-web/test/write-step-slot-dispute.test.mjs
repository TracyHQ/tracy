// One disputed slot never stops the write step (ADR 0044 decisions 3 and 26, amended 2026-11-08): the dispute is settled on
// that slot, every other slot is written, and the report keeps the dispute. Invented demo-gym fixtures, no real business.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ownerTable } from '../src/write-step/owner-table.js'
import { copy, plan, runStep as run } from './_write-step-run.mjs'

const linkOn = (p, block, slot) => {
  const decision = p.pages.flatMap((page) => page.blocks ?? []).find((d) => d.block === block)
  decision.links = [...(decision.links ?? []), { link: slot, leadsTo: 'page-home', labelSlot: null }]
  return p
}

test('a plan link on a text slot loses to the writer: the run goes on and the writer words are written', async () => {
  const { report, site, line } = await run({ plan: linkOn(plan(), 'block-2', 'block-2.1') })
  assert.notEqual(report.cause?.code, 'SLOT_DISPUTE')
  assert.equal(report.status, 'done')
  assert.equal(report.disputes[0].slot, 'block-2.1')
  assert.equal(report.disputes[0].settled.owner, 'writer')
  assert.equal(line('block-2.1').status, 'written')
  assert.equal(site.held['module-2.1'], 'Train with a coach who knows you')
  assert.equal(line('block-1.1').status, 'written')
})

test('a plan hide against writer words: the plan wins, the words are not sent, every other slot is written', async () => {
  const c = copy()
  c.slots.push({ slot: 'block-2.3', owner: 'writer', text: 'Words the plan hides', factIds: [] })
  const { report, site, line } = await run({ copy: c })
  assert.equal(report.status, 'done')
  assert.equal(report.disputes[0].slot, 'block-2.3')
  assert.equal(report.disputes[0].settled.owner, 'plan')
  assert.notEqual(site.held['module-2.3'], 'Words the plan hides')
  assert.equal(line('block-2.1').status, 'written')
})

test('the owner table: the plan link wins on a slot the kit has as a link; a claim that fits nothing leaves the slot unowned', () => {
  const kit = {
    blocks: [
      {
        id: 'block-9',
        links: [{ id: 'block-9.4' }],
        slots: [
          { id: 'block-9.4', type: 'url' },
          { id: 'block-9.5', type: 'image' }
        ]
      }
    ]
  }
  const link = { slot: 'block-9.4', owner: 'plan', file: 'plan.json', kind: 'link', content: 'fact:f-social' }
  const words = {
    slot: 'block-9.4',
    owner: 'writer',
    file: 'copy.json',
    kind: 'text',
    content: '["https://social.example/quay"]'
  }
  const settled = ownerTable([words, link], { kit })
  assert.equal(settled.owners.get('block-9.4'), link)
  assert.deepEqual(settled.losers, [words])
  assert.equal(settled.disputes[0].settled.owner, 'plan')
  const a = { slot: 'block-9.5', owner: 'writer', file: 'copy.json', kind: 'text', content: '["one"]' }
  const b = { slot: 'block-9.5', owner: 'writer', file: 'copy.json', kind: 'text', content: '["two"]' }
  const none = ownerTable([a, b], { kit })
  assert.equal(none.owners.has('block-9.5'), false)
  assert.equal(none.disputes[0].settled, null)
  assert.deepEqual(none.losers, [a, b])
})

test('the same slot twice in the copy with different words: the first is written, the run goes on', async () => {
  const twice = copy()
  twice.slots.push({ slot: 'block-1.1', owner: 'writer', text: 'Sign up', factIds: [] })
  const { report, site } = await run({ copy: twice })
  assert.equal(report.status, 'done')
  assert.equal(report.disputes[0].slot, 'block-1.1')
  assert.ok(report.disputes[0].settled)
  assert.ok(site.held['module-1.1'])
})
