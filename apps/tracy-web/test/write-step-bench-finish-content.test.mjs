// The finisher's content orders (#422, spec #418), driven through the step 9 bench's `finish` the way an operator does: a
// link, a demo item, an alt, a page title and an accent emphasis, each proposed by a scripted fixer, held to the brief, the
// site copy and step 8's descriptions by code, written under its own apply id and reverted when the checker says not better.
// One seam and fakes only: the written site records writes and reverts; the finder names a fault of the real list whose kind
// lists the order. Only what comes out is asserted: the site, its writes and reverts, the repair log.
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { runCli } from '../src/write-step-bench-cli.js'
import { FAULT_KINDS } from '../src/write-step/finisher/fault-kinds.js'
import { ORDER_KINDS } from '../src/write-step/finisher/repair-orders.js'
import { kitIndex, memoryStore } from './_write-step-bench.mjs'
import { fakeCapture } from './_write-step-finisher.mjs'
import {
  ABOUT_TITLE,
  BLOCKS,
  BRIEF_PHONE,
  benchSite,
  brief,
  CONTENT_MAP,
  copy,
  DEMO_PHONE,
  finding,
  KIND_OF_ORDER,
  PAGES,
  SEEN,
  scriptedDoor,
  sitePictures,
  writtenRun,
  writtenSite
} from './_write-step-finisher-content.mjs'
import { memoryRunStore } from './_write-step-run.mjs'

const kits = kitIndex({ tool: 'template-kit 3.1.0', blocks: BLOCKS, pages: PAGES })
for (const { dir } of kits.index.values())
  writeFileSync(path.join(dir, 'content-map.json'), JSON.stringify(CONTENT_MAP))
const dirs = []
after(() => {
  kits.done()
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

const BETTER = [{ verdict: 'better', reason: 'reads right' }]

/** One finish with one fault on the home page, the fixer's scripted order, and the brief, copy and pictures as files. */
async function finish({ order, fault = {}, checker = BETTER, briefFile = brief() }) {
  const site = writtenSite()
  // The finder names the kind of the list the order answers, unless the test names another.
  const found = { kind: KIND_OF_ORDER[order?.kind], ...fault }
  const dir = mkdtempSync(path.join(tmpdir(), 'write-step-finish-content-'))
  dirs.push(dir)
  const files = { 'brief.json': briefFile, 'copy.json': copy(), 'site-pictures.json': sitePictures() }
  for (const [name, data] of Object.entries(files)) writeFileSync(path.join(dir, name), JSON.stringify(data))
  const doors = {
    // The finder is asked about the home page, then the about page.
    finder: scriptedDoor(
      'Finisher finder',
      fault.page === '/about' ? [{ faults: [] }, finding(found)] : [finding(found), { faults: [] }]
    ),
    fixer: scriptedDoor('Finisher fixer', [order]),
    checker: scriptedDoor('Finisher checker', checker)
  }
  const out = []
  const err = []
  const code = await runCli(
    ['finish', '--run', 'run-1', '--account', 'bench@example.test', '--out', path.join(dir, 'out')]
      .concat(['--brief-file', path.join(dir, 'brief.json'), '--copy-file', path.join(dir, 'copy.json')])
      .concat(['--site-pictures-file', path.join(dir, 'site-pictures.json')]),
    {
      runs: memoryRunStore([writtenRun()]),
      store: memoryStore([benchSite()]),
      index: kits.index,
      makeDoor: () => site.door,
      makeCapture: async () => fakeCapture().capture,
      makeFinisherDoors: async () => ({
        finder: doors.finder.door,
        fixer: doors.fixer.door,
        checker: doors.checker.door
      }),
      out: (l) => out.push(l),
      err: (l) => err.push(l)
    }
  )
  const logFile = path.join(dir, 'out', 'repair-log.json')
  const log = existsSync(logFile) ? JSON.parse(readFileSync(logFile, 'utf8')) : null
  assert.equal(code, 0, err.join('\n'))
  return { site, log, record: log.records[0], doors }
}

const dropped = (run, why) => {
  assert.deepEqual(run.site.writes, [], 'nothing is written')
  assert.equal(run.record.outcome, 'dropped')
  assert.match(run.record.reason, why)
}

test('a demo phone with a replacement in the brief is replaced through the content door, the rest of the slot kept', async () => {
  const run = await finish({
    order: { kind: 'remove-demo-item', slot: 'block-5.1', item: DEMO_PHONE, with: BRIEF_PHONE }
  })
  assert.equal(run.site.held['module-5.1'], `Call ${BRIEF_PHONE} today`)
  assert.equal(run.site.writes.length, 1)
  assert.match(run.site.writes[0].applyId, /^finisher-/)
  assert.equal(run.record.outcome, 'kept')
  assert.equal(run.record.applyId, run.site.writes[0].applyId)
})

test('a demo phone the brief has a replacement for is never removed; one without is removed alone', async () => {
  dropped(
    await finish({ order: { kind: 'remove-demo-item', slot: 'block-5.1', item: DEMO_PHONE, with: null } }),
    /brief gives a phone/
  )
  const removed = await finish({
    order: { kind: 'remove-demo-item', slot: 'block-5.1', item: DEMO_PHONE, with: null },
    briefFile: brief([])
  })
  assert.equal(removed.site.held['module-5.1'], 'Call today')
  assert.equal(removed.site.held['module-5.2'], 'Front desk of Demo Fitness', 'the rest of the block stays')
  assert.equal(removed.record.outcome, 'kept')
})

test('a replacement the brief does not give, or a demo item the slot does not hold, is refused', async () => {
  dropped(
    await finish({
      order: { kind: 'remove-demo-item', slot: 'block-5.1', item: DEMO_PHONE, with: '+44 20 0000 0000' }
    }),
    /no phone the brief gives/
  )
  dropped(
    await finish({
      order: { kind: 'remove-demo-item', slot: 'block-5.1', item: '+1 555 0199', with: BRIEF_PHONE }
    }),
    /does not hold/
  )
  dropped(
    await finish({
      order: { kind: 'remove-demo-item', slot: 'block-5.2', item: 'Harbour Strength Club', with: null },
      fault: { slot: 'block-5.2' }
    }),
    /brief's own name/
  )
})

test('a link to the demo is pointed at a page the site keeps, and logged when no such page exists', async () => {
  const run = await finish({
    order: { kind: 'fix-link', slot: 'block-5.3', to: '/about' },
    fault: { slot: 'block-5.3' }
  })
  assert.equal(run.site.held['module-5.3'], 'index.php?Itemid=102')
  assert.equal(run.record.outcome, 'kept')
  dropped(
    await finish({
      order: { kind: 'fix-link', slot: 'block-5.3', to: '/plans' },
      fault: { slot: 'block-5.3' }
    }),
    /no page of the site is at "\/plans"/
  )
  dropped(await finish({ order: { kind: 'fix-link', slot: 'block-5.1', to: '/about' } }), /holds no address/)
})

test("a wrong alt is replaced from step 8's description of the picture; other words are refused", async () => {
  const run = await finish({
    order: { kind: 'fix-alt', slot: 'block-6.2', frame: 'block-6.1', text: SEEN },
    fault: { slot: 'block-6.2' }
  })
  assert.equal(run.site.held['module-6.2'], SEEN)
  assert.equal(run.record.outcome, 'kept')
  dropped(
    await finish({
      order: {
        kind: 'fix-alt',
        slot: 'block-6.2',
        frame: 'block-6.1',
        text: 'A sunny gym full of happy members'
      },
      fault: { slot: 'block-6.2' }
    }),
    /neither step 8's description/
  )
})

test('a demo page title is replaced from the site copy in its row, under its own apply id, and undone when not better', async () => {
  const order = { kind: 'fix-title-meta', page: '/about', field: 'title', text: ABOUT_TITLE }
  const fault = { page: '/about', slot: null }
  const kept = await finish({ order, fault })
  const params = JSON.parse(kept.site.rows['menuItem:102'].params)
  assert.equal(params.page_title, ABOUT_TITLE)
  assert.equal(params.show_title, 1, 'the other settings of the row stay')
  assert.equal(kept.site.writes[0].action, 'content.update')
  assert.equal(kept.record.outcome, 'kept')
  assert.equal(kept.record.slot, 'page-about-us:title')

  const undone = await finish({
    order,
    fault,
    checker: [{ verdict: 'not better', reason: 'no change seen' }]
  })
  assert.deepEqual(undone.site.reverts, [undone.site.writes[0].applyId])
  assert.equal(JSON.parse(undone.site.rows['menuItem:102'].params).page_title, 'About Demo Fitness')
  assert.equal(undone.record.outcome, 'undone')

  dropped(await finish({ order: { ...order, text: 'Best gym in town' }, fault }), /not the site copy's title/)
})

test('accent emphasis marks one or two words the heading holds, never new or changed words', async () => {
  const run = await finish({
    order: { kind: 'mark-emphasis', slot: 'block-2.1', words: 'Gym' },
    fault: { slot: 'block-2.1' }
  })
  assert.equal(run.site.held['module-2.1'], 'Harbour Strength ((span))Gym((/span))')
  assert.equal(run.record.outcome, 'kept')
  for (const [words, why] of [
    ['Fitness', /does not hold "Fitness" once/],
    ['Harbour Strength Gym', /one or two words/],
    ['Gy', /does not hold "Gy" once/]
  ])
    dropped(
      await finish({
        order: { kind: 'mark-emphasis', slot: 'block-2.1', words },
        fault: { slot: 'block-2.1' }
      }),
      why
    )
  dropped(
    await finish({
      order: { kind: 'mark-emphasis', slot: 'block-5.2', words: 'Front' },
      fault: { slot: 'block-5.2' }
    }),
    /marks no accent words/
  )
})

test('emphasis in a heading stored as HTML goes through the emphasis stage, and an undo takes back both writes', async () => {
  const order = { kind: 'mark-emphasis', slot: 'block-7.1', words: 'Coach' }
  const kept = await finish({ order, fault: { slot: 'block-7.1' } })
  assert.equal(kept.site.held['module-7.1'], 'Meet your <span>Coach</span>')
  assert.equal(kept.record.outcome, 'kept')

  const undone = await finish({
    order,
    fault: { slot: 'block-7.1' },
    checker: [{ verdict: 'not better', reason: 'x' }]
  })
  assert.equal(undone.site.writes.length, 2, 'the codes, then the tags')
  assert.deepEqual(undone.site.reverts, [undone.site.writes[1].applyId, undone.site.writes[0].applyId])
  assert.equal(undone.site.held['module-7.1'], 'Meet your Coach')
  assert.equal(undone.record.outcome, 'undone')
})

test('a content order for a fault whose kind does not list it is dropped', async () => {
  const run = await finish({
    order: { kind: 'fix-link', slot: 'block-5.3', to: '/about' },
    fault: { slot: 'block-5.3', kind: 'raw-markup' }
  })
  dropped(run, /does not repair a raw-markup fault/)
})

test('every order kind the fault list names is an order the fixer can give, and every order answers some fault kind', () => {
  for (const [kind, { orders }] of Object.entries(FAULT_KINDS)) {
    assert.ok(orders.length, `${kind} lists no order`)
    for (const order of orders)
      assert.ok(ORDER_KINDS[order], `${kind} names ${order}, which is no order kind`)
  }
  const named = new Set(Object.values(FAULT_KINDS).flatMap((k) => k.orders))
  for (const order of Object.keys(ORDER_KINDS)) assert.ok(named.has(order), `no fault kind lists ${order}`)
})
