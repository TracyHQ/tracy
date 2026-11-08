// A list of person cards where the plan kept one profile page and sent every card to it: only the card the page names keeps the
// link, every other card leads to the page that lists them, never to someone else's profile (ADR 0044, the plan owns link
// targets). Every person, business and address here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { foreignItemLinks } from '../src/write-step/item-page-links.js'
import { copy, KIT, plan, runStep } from './_write-step-run.mjs'
import { brief as baseBrief } from './_site-copy-check.mjs'

const name = (id, sample) => ({
  id,
  role: 'person.name',
  type: 'text',
  maxCharacters: 30,
  sample,
  paragraphs: 1,
  bullets: 0
})
const url = (id) => ({ id, role: 'editorial.navigation_url', type: 'url', maxCharacters: 2048 })

function teamKit() {
  const kit = KIT()
  kit.doc.pages = [
    { id: 'page-home', path: '/', blocks: { 1440: ['block-1', 'block-2', 'block-8'] } },
    { id: 'page-team', path: '/team', blocks: { 1440: ['block-8'] } },
    {
      id: 'page-team_ana',
      path: '/team/ana-demo',
      h1: { via: 'content-slot', slot: 'block-8.4' },
      blocks: { 1440: [] }
    }
  ]
  kit.doc.blocks.push({
    id: 'block-8',
    source: { entity: 'module-8' },
    slots: [],
    lists: [
      {
        id: 'block-8.person',
        rows: [
          { index: 0, slots: [name('block-8.4', 'Demo One'), url('block-8.8')] },
          { index: 1, slots: [name('block-8.5', 'Demo Two'), url('block-8.9')] }
        ]
      }
    ],
    links: [
      { id: 'block-8.8', target: '/team/ana-demo', action: 'go-to-item', labelId: 'block-8.4' },
      { id: 'block-8.9', target: '/team/ana-demo', action: 'navigation', labelId: 'block-8.5' }
    ]
  })
  return kit
}

test('only the card the item page names keeps its link; the other leads to the list page', () => {
  const claims = [
    { slot: 'block-8.8', content: 'page-team_ana', label: 'block-8.4' },
    { slot: 'block-8.9', content: 'page-team_ana', label: 'block-8.5' }
  ]
  const p = {
    pages: [
      { id: 'page-team', decision: 'keep' },
      { id: 'page-team_ana', decision: 'keep' }
    ]
  }
  const out = foreignItemLinks({
    claims,
    kit: teamKit().doc,
    plan: p,
    taken: { 'module-8.4': 'Ana', 'module-8.5': 'Ben' }
  })
  assert.deepEqual([...out.keys()], ['block-8.9'])
  assert.equal(out.get('block-8.9').content, 'page-team')
  assert.match(out.get('block-8.9').reason, /another card/)
})

test('a written site never sends a card to another person page', async () => {
  const p = plan()
  p.pages[0].blocks.push({
    block: 'block-8',
    seen: 'seen',
    decision: 'keep',
    why: 'fits',
    copy: [
      { slot: 'block-8.4', says: 'coach name', factIds: [], basis: 'brief', maxCharacters: 30 },
      { slot: 'block-8.5', says: 'coach name', factIds: [], basis: 'brief', maxCharacters: 30 }
    ],
    links: [
      { link: 'block-8.8', leadsTo: 'page-team_ana', labelSlot: 'block-8.4' },
      { link: 'block-8.9', leadsTo: 'page-team_ana', labelSlot: 'block-8.5' }
    ]
  })
  p.pages.push(
    { id: 'page-team', decision: 'keep', blocks: [] },
    { id: 'page-team_ana', decision: 'keep', blocks: [] }
  )
  const c = copy()
  c.slots.push(
    { slot: 'block-8.4', owner: 'writer', text: 'Ana', factIds: [] },
    { slot: 'block-8.5', owner: 'writer', text: 'Ben', factIds: [] }
  )
  const row = (id, path) => ({
    kind: 'menuItem',
    id,
    path,
    published: 1,
    type: 'component',
    menutype: 'mainmenu'
  })
  const done = await runStep(
    { plan: p, copy: c, brief: baseBrief() },
    {
      records: [{ ...row(101, 'home'), home: 1 }, row(20, 'team'), row(21, 'team/ana-demo')],
      extraKeys: ['module-8.8', 'module-8.9'],
      overSlot: (slot) =>
        slot.key.startsWith('module-8.') && /\.(8|9)$/.test(slot.key) ? { type: 'url', current: '#' } : {}
    },
    { kit: teamKit() }
  )
  const sent = Object.assign({}, ...done.site.applies().map((a) => a.params?.changes ?? {}))
  assert.equal(sent['module-8.8'], 'index.php?Itemid=21')
  assert.equal(sent['module-8.9'], 'index.php?Itemid=20')
  assert.match(done.line('block-8.9').reason, /another card/)
})
