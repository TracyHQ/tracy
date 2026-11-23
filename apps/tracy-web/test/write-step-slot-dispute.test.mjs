// One disputed slot never stops the write step (ADR 0044 decisions 3 and 26, amended 2026-11-08): the dispute is settled on
// that slot, every other slot is written, and the report keeps the dispute. Invented demo-gym fixtures, no real business.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ownerTable } from '../src/write-step/owner-table.js'
import { copy, KIT, plan, runStep as run } from './_write-step-run.mjs'

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

test('words the writer puts in an address slot are left out, never written as a link to a page that does not exist', async () => {
  // Dev lat29 (23/11/2026): a caption in each of JA Diner's About gallery link fields made eight links to 404 pages.
  const kit = KIT()
  kit.doc.blocks
    .find((b) => b.id === 'block-2')
    .slots.push(
      { id: 'block-2.40', type: 'text', role: 'editorial.navigation_url', maxCharacters: 255 },
      { id: 'block-2.41', type: 'text', role: 'editorial.navigation_url', maxCharacters: 255 }
    )
  const c = copy()
  c.slots.push(
    { slot: 'block-2.40', owner: 'writer', text: 'Guests dining on Emirati dishes', factIds: [] },
    { slot: 'block-2.41', owner: 'writer', text: '/contact', factIds: [] }
  )
  const { report, site, line } = await run(
    { copy: c },
    { extraKeys: ['module-2.40', 'module-2.41'] },
    { kit }
  )
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  const sent = Object.assign({}, ...site.applies().map((a) => a.params.changes ?? {}))
  assert.equal(sent['module-2.40'], undefined, 'the caption is not sent as an address')
  assert.equal(sent['module-2.41'], '/contact', 'an address is written')
  assert.ok(
    report.unaddressable.some(
      (u) => u.slot === 'block-2.40' && /words in an address slot are no address/.test(u.reason)
    ),
    JSON.stringify(report.unaddressable)
  )
  assert.equal(line('block-2.41').status, 'written')
})

test("step 8's alt over the writer's words on that alt is the rule, not a dispute; the writer's words still lose", () => {
  const writer = {
    slot: 'block-8.11',
    owner: 'writer',
    file: 'site-copy.json',
    kind: 'text',
    content: 'A coach by a court'
  }
  const picture = {
    slot: 'block-8.11',
    owner: 'picture',
    file: 'site-pictures.json',
    kind: 'text',
    content: 'A lifeguard chair beside a pool'
  }
  const { owners, disputes, losers } = ownerTable([writer, picture])
  assert.equal(owners.get('block-8.11'), picture)
  assert.deepEqual(losers, [writer])
  assert.deepEqual(disputes, [])
  // A plan claim on the same slot is still a dispute.
  const plan = { slot: 'block-8.11', owner: 'plan', file: 'plan.json', kind: 'hide', content: '(hide)' }
  assert.equal(ownerTable([writer, picture, plan]).disputes.length, 1)
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
