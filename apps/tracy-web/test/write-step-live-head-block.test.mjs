// The kit's head injection block on a block the plan keeps (live-head-block.js). An invented template whose head block is a
// footer column the plan may drop; the rules every head stage writes must land in a block that still prints.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hideHiddenPageLinks } from '../src/write-step/hidden-page-links-stage.js'
import { kitWithLiveHead } from '../src/write-step/live-head-block.js'

const PAGES = [
  {
    id: 'page-home',
    path: '/',
    blocks: {
      1440: ['header', 'block-20', 'block-31', 'block-32', 'block-33'],
      390: ['header', 'block-20', 'block-31', 'block-32', 'block-33']
    }
  },
  {
    id: 'page-team',
    path: '/team',
    blocks: {
      1440: ['header', 'block-31', 'block-32', 'block-33'],
      390: ['header', 'block-31', 'block-32', 'block-33']
    }
  },
  {
    id: 'page-ana',
    path: '/team/ana',
    blocks: { 1440: ['header', 'block-40', 'block-31', 'block-32', 'block-33'] }
  }
]
const kitOf = (extra = {}) => ({
  site: {
    head: {
      injection: { maxBytes: 8000, position: { name: 'footer-1', block: 'block-31', onPages: 3, of: 3 } }
    },
    hiddenPageLinks: [{ container: '.crew-card', why: 'the invented team cards link to their profile page' }]
  },
  pages: PAGES,
  blocks: [
    { id: 'header', source: { entity: null } },
    { id: 'block-20', source: { entity: 'module-20', position: 'slideshow' } },
    { id: 'block-31', source: { entity: 'module-31', position: 'footer-1' } },
    // A free HTML footer column the plan drops too, then one it keeps, both on every page.
    { id: 'block-32', source: { entity: 'module-32', position: 'footer-2' } },
    { id: 'block-33', source: { entity: 'module-33', position: 'footer-3' } },
    { id: 'block-40', source: { entity: 'module-40', position: 'aside' } }
  ],
  storedFields: [
    { slot: 'block-20.0', field: 'params.slideshow.title.0' },
    { slot: 'block-31.0', field: 'content' },
    { slot: 'block-32.0', field: 'content' },
    { slot: 'block-33.0', field: 'content' },
    { slot: 'block-33.1', field: 'title' },
    { slot: 'block-40.0', field: 'content' }
  ],
  ...extra
})
const planOf = (shared) => ({
  pages: [
    { id: 'page-home', decision: 'keep', blocks: [] },
    { id: 'page-team', decision: 'keep', blocks: [] },
    { id: 'page-ana', decision: 'drop' }
  ],
  sharedBlocks: shared
})

test('the head block stays where the kit names it while the plan keeps it', () => {
  const kit = kitOf()
  const kept = kitWithLiveHead(kit, planOf([{ block: 'block-31', decision: 'keep' }]))
  assert.equal(kept.kit, kit)
  assert.equal(kept.moved, null)
})

test('a plan that drops the head block moves it to the first kept free HTML block printed on every page', () => {
  const kit = kitOf()
  const plan = planOf([
    { block: 'block-31', decision: 'hide' },
    { block: 'block-32', decision: 'hide' },
    { block: 'block-33', decision: 'keep' }
  ])
  const live = kitWithLiveHead(kit, plan)
  assert.deepEqual(live.moved, { from: 'block-31', to: 'block-33' })
  assert.deepEqual(live.kit.site.head.injection.position, {
    name: 'footer-3',
    block: 'block-33',
    onPages: 3,
    of: 3,
    movedFrom: 'block-31'
  })
  assert.equal(live.kit.site.head.injection.maxBytes, 8000)
  // The kit itself is never changed; its other parts are the same objects.
  assert.equal(kit.site.head.injection.position.block, 'block-31')
  assert.equal(live.kit.blocks, kit.blocks)
  assert.equal(live.kit.site.hiddenPageLinks, kit.site.hiddenPageLinks)
})

test('no kept free HTML block on every page: no head block, and the stage says so instead of writing into a dropped one', async () => {
  const plan = planOf([
    { block: 'block-31', decision: 'hide' },
    { block: 'block-32', decision: 'hide' },
    { block: 'block-33', decision: 'hide' }
  ])
  // block-20 is kept but prints on one page only and holds no content field; block-40 is on a dropped page only.
  const live = kitWithLiveHead(kitOf(), plan)
  assert.deepEqual(live.moved, { from: 'block-31', to: null })
  assert.equal(live.kit.site.head.injection.position, null)
  const writes = []
  const door = {
    apply: async (call) => {
      writes.push(call)
      return { ok: true }
    }
  }
  const lines = await hideHiddenPageLinks({ door, siteKey: 's', kit: live.kit, plan, keptPages: [] })
  assert.deepEqual(
    lines.map((l) => [l.status, l.reason]),
    [['failed', 'the kit names no head injection block to carry the rule']]
  )
  assert.deepEqual(writes, [])
})

test('the hidden page link rule is written into the block that took the head over', async () => {
  const plan = planOf([
    { block: 'block-31', decision: 'hide' },
    { block: 'block-32', decision: 'hide' },
    { block: 'block-33', decision: 'keep' }
  ])
  const live = kitWithLiveHead(kitOf(), plan)
  const held = new Map([
    [31, '<span>Old footer</span>'],
    [33, '<span>Kept footer</span>']
  ])
  const rows = [
    { id: 101, path: 'home', home: 1, published: 1, link: 'index.php?option=com_content&view=featured' },
    { id: 195, path: 'team', published: 1, link: 'index.php?option=com_content&view=category&id=8' },
    { id: 197, path: 'team/ana', published: 0, link: 'index.php?option=com_content&view=article&id=3' }
  ]
  const door = {
    apply: async ({ action, params }) => {
      if (action === 'content.list') return { ok: true, items: params.offset ? [] : rows }
      if (action === 'content.get') return { ok: true, item: { content: held.get(params.id) ?? '' } }
      if (action === 'content.update') {
        held.set(params.id, params.fields.content)
        return { ok: true }
      }
      return { ok: false, error: 'unknown' }
    }
  }
  const lines = await hideHiddenPageLinks({
    door,
    siteKey: 's',
    kit: live.kit,
    plan,
    keptPages: [
      { id: 'page-home', path: '/' },
      { id: 'page-team', path: '/team' }
    ]
  })
  assert.equal(lines[0].status, 'written')
  assert.equal(lines[0].readFrom.params.id, 33)
  assert.ok(held.get(33).startsWith('<span>Kept footer</span>'))
  assert.ok(held.get(33).includes('.crew-card a[href="index.php?Itemid=197"]'))
  assert.equal(held.get(31), '<span>Old footer</span>')
})
