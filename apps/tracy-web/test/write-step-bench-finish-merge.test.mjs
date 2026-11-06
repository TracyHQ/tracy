// The finisher's full fault list and its merge with the first site check (#423, spec #418), driven through the step 9
// bench's `finish` the way an operator does. The same three fakes as the finisher's own test (a written site, scripted
// model doors, a fixed capture), plus a page reader that answers what the site serves now and kit images that hold the
// template demo's block shots. Only what comes out is asserted: writes, the repair log, the doors asked, the bench lines.
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import sharp from 'sharp'
import { runCli } from '../src/write-step-bench-cli.js'
import { kitIndex, memoryStore } from './_write-step-bench.mjs'
import {
  BLOCKS,
  benchSite,
  fakeCapture,
  finding,
  heldAtStart,
  PAGES,
  scriptedDoor,
  writtenRun,
  writtenSite
} from './_write-step-finisher.mjs'
import { memoryRunStore } from './_write-step-run.mjs'

/** The kit blocks with the template demo's shot of each block at 1440, as the step 0 template profile packs them. */
const SHOT_BLOCKS = BLOCKS.map((b) => ({ ...b, images: { 1440: `${b.id}-1440`, 390: `${b.id}-390` } }))
const kits = kitIndex({ tool: 'template-kit 3.1.0', blocks: SHOT_BLOCKS, pages: PAGES })
const dirs = []
after(() => {
  kits.done()
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

const demoJpeg = (
  await sharp({ create: { width: 1440, height: 300, channels: 3, background: { r: 20, g: 20, b: 20 } } })
    .jpeg({ quality: 60 })
    .toBuffer()
).toString('base64')

/** Kit images as the planner's cache serves them: every block shot opens, and each open is kept in `opened`. */
function fakeKitImages() {
  const opened = []
  return {
    opened,
    kitImages: {
      async ensure() {
        return {
          ok: true,
          images: {
            async open(id) {
              opened.push(id)
              return {
                text: JSON.stringify({ id }),
                images: [{ mediaType: 'image/jpeg', base64: demoJpeg }]
              }
            }
          }
        }
      }
    }
  }
}

/** One finish on the written site. `served` is each page's markup as the site serves it now. */
async function finish({
  finder,
  fixer = [],
  checker = [],
  failures,
  groups = [],
  served = {},
  argv = [],
  kitImages = null,
  pageHtml = null,
  onFinderAsk = null
}) {
  const site = writtenSite(heldAtStart())
  const shots = fakeCapture({ held: site.held })
  const doors = {
    finder: scriptedDoor('Finisher finder', finder),
    fixer: scriptedDoor('Finisher fixer', fixer),
    checker: scriptedDoor('Finisher checker', checker)
  }
  if (onFinderAsk) {
    const ask = doors.finder.door.ask
    doors.finder.door.ask = (message) => {
      onFinderAsk()
      return ask(message)
    }
  }
  const out = []
  const err = []
  const read = []
  const dir = mkdtempSync(path.join(tmpdir(), 'write-step-finish-merge-'))
  dirs.push(dir)
  const code = await runCli(
    ['finish', '--run', 'run-1', '--account', 'bench@example.test', '--out', dir, ...argv],
    {
      runs: memoryRunStore([writtenRun({ failures, groups })]),
      store: memoryStore([benchSite()]),
      index: kits.index,
      makeDoor: () => site.door,
      makeCapture: async () => shots.capture,
      makeFinisherDoors: async () => ({
        finder: doors.finder.door,
        fixer: doors.fixer.door,
        checker: doors.checker.door
      }),
      pageHtml:
        pageHtml ??
        (async ({ path: page }) => {
          read.push(page)
          return served[page] ?? null
        }),
      ...(kitImages ? { kitImages } : {}),
      out: (l) => out.push(l),
      err: (l) => err.push(l)
    }
  )
  const logFile = path.join(dir, 'repair-log.json')
  const log = existsSync(logFile) ? JSON.parse(readFileSync(logFile, 'utf8')) : null
  return { code, out, err, site, log, dir, doors, read }
}

/** The finder's answer for both pages, which are asked in parallel: held only on the page it names. */
const twice = (answer) => [answer, answer]

/** A first site check failure, as `site-check/1` keeps it. */
const failure = (group, over = {}) => ({
  group,
  page: '/',
  slot: 'block-3.1',
  width: 1440,
  level: 'block',
  causingStep: 9,
  measured: null,
  ...over
})

const DEMO_TEL = 'tel:+15550100'
const BRIEF_TEL = 'tel:+15550177'

test('a demo phone link the live page still dials is confirmed and goes to the fixer', async () => {
  const run = await finish({
    finder: [{ faults: [] }, { faults: [] }],
    fixer: [{ kind: 'fix-link', slot: 'block-3.1', href: BRIEF_TEL }],
    failures: [failure('demo-links', { measured: DEMO_TEL })],
    served: { '/': `<a href="${DEMO_TEL}">Call us</a>` }
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.equal(run.read[0], '/', 'the live page is read to confirm the failure')
  assert.equal(run.doors.fixer.asked.length, 1, 'a confirmed failure is a fault the fixer is asked about')
  const [record] = run.log.records
  assert.equal(record.faultKind, 'demo-contact-link')
  assert.deepEqual(record.sources, ['site-check'])
  assert.equal(record.causingCheck, 'demo-links')
})

test('a phone link that is right on the live page but reported wrong is left alone, logged as measurement wrong', async () => {
  const run = await finish({
    finder: [{ faults: [] }, { faults: [] }],
    failures: [failure('demo-links', { measured: DEMO_TEL })],
    served: { '/': `<a href="${BRIEF_TEL}">Call us</a>` }
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.deepEqual(run.site.writes, [])
  assert.equal(run.doors.fixer.asked.length, 0)
  const [record] = run.log.records
  assert.equal(record.outcome, 'measurement-wrong')
  assert.equal(record.causingCheck, 'demo-links')
  assert.match(record.reason, /live page/)
  assert.equal(run.log.counts['measurement-wrong'], 1)
  assert.ok(run.out.some((l) => /^ {2}measurement-wrong page=\/ slot=block-3\.1/.test(l)))
})

test('a visible site check failure the finder does not see is measurement wrong and produces no repair order', async () => {
  const run = await finish({
    finder: [{ faults: [] }, { faults: [] }],
    failures: [failure('words-over-picture')]
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.deepEqual(run.site.writes, [])
  assert.equal(run.doors.fixer.asked.length, 0)
  const [record] = run.log.records
  assert.equal(record.outcome, 'measurement-wrong')
  assert.equal(record.faultKind, 'unreadable-text')
  assert.match(record.reason, /finder/)
})

test('a fault reported by both the finder and the site check leads to one repair order', async () => {
  const run = await finish({
    finder: twice(finding()),
    fixer: [{ kind: 'fix-text', slot: 'block-2.1', text: 'Strength coaching for every level' }],
    // The page as served once repaired: a text repair is judged by code on it, no checker call.
    served: { '/': '<h2>Strength coaching for every level</h2>' },
    // The default first check names the same raw markup on block-2.1, at both widths.
    failures: [
      failure('emphasis-codes-left', { page: null, slot: 'block-2.1', width: null }),
      failure('cms-errors', { slot: 'block-2.1', width: 390 })
    ]
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.equal(run.doors.fixer.asked.length, 1)
  assert.equal(run.site.writes.length, 1)
  assert.equal(run.log.records.length, 1)
  const [record] = run.log.records
  assert.equal(record.outcome, 'kept')
  assert.deepEqual(record.sources, ['finder', 'site-check'])
  assert.ok(run.out.some((l) => l.startsWith('merge: 1 from the finder, 2 site check failures')))
})

test('a site check group that reported green for a fault the finder confirms is named in the repair log', async () => {
  const run = await finish({
    finder: twice(finding('lost-design', { seen: 'the heading lost the accent the demo shows' })),
    fixer: [{ kind: 'mark-emphasis', slot: 'block-2.1', words: ['coaching'] }],
    failures: [],
    groups: [{ name: 'accent-emphasis', status: 'green', checked: 3, failures: [] }]
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  const [record] = run.log.records
  assert.equal(record.faultKind, 'lost-design')
  assert.deepEqual(record.missedBy, ['accent-emphasis'])
})

test('the finder is shown the template demo shot of each block on the page, and a lost design is a fault of the list', async () => {
  const images = fakeKitImages()
  // The pages are asked in parallel: the same answer twice, held only where it was shown (the home page).
  const lost = finding('lost-design', { seen: 'the demo heading has an accent word, this one has none' })
  const run = await finish({
    finder: [lost, lost],
    fixer: [{ kind: 'mark-emphasis', slot: 'block-2.1', words: ['coaching'] }],
    failures: [],
    kitImages: images.kitImages
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.deepEqual(images.opened.sort(), ['block-2-1440', 'block-3-1440', 'block-4-1440'])
  const home = run.doors.finder.asked.find((a) => a.content.some((c) => c.text === 'Page /.'))
  const labels = home.content.filter((c) => c.type === 'text').map((c) => c.text)
  assert.ok(
    labels.some((t) => /template demo.*block-2/i.test(t)),
    labels.join('\n')
  )
  assert.equal(
    home.content.filter((c) => c.type === 'image_url').length,
    4,
    'two site tiles, two demo blocks'
  )
  const [record] = run.log.records
  assert.equal(record.faultKind, 'lost-design')
  assert.notEqual(record.outcome, 'logged-only', 'a lost design is on the list: the fixer is asked')
  assert.equal(run.doors.fixer.asked.length, 1)
  const reply = JSON.parse(readFileSync(path.join(run.dir, 'replies', 'finder-home.json'), 'utf8'))
  assert.equal(reply.images.length, 4)
  for (const file of reply.images) assert.ok(existsSync(path.join(run.dir, file)), `${file} is kept`)
})

test('a missing or repeated h1 is logged only, from the finder or the site check', async () => {
  const run = await finish({
    finder: twice(finding('main-heading', { slot: null, seen: 'the page has two main headings' })),
    failures: [failure('main-heading', { page: '/about', slot: null })]
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.deepEqual(run.site.writes, [])
  assert.equal(run.doors.fixer.asked.length, 0)
  assert.equal(run.log.records.length, 2)
  for (const record of run.log.records) {
    assert.equal(record.outcome, 'logged-only')
    assert.match(record.reason, /h1 is logged only/)
  }
})

test('a site check failure of a kind outside the list is logged only and not repaired', async () => {
  const run = await finish({
    finder: [{ faults: [] }, { faults: [] }],
    failures: [failure('tall-blocks')]
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.deepEqual(run.site.writes, [])
  const [record] = run.log.records
  assert.equal(record.outcome, 'logged-only')
  assert.equal(record.causingCheck, 'tall-blocks')
  assert.match(record.reason, /outside the fault list/)
})

test('site check failures with no door to repair are logged as no door', async () => {
  const run = await finish({
    finder: [{ faults: [] }, { faults: [] }],
    failures: [
      failure('dead-links', { slot: null, measured: '/index.php/old-page' }),
      failure('unaddressable-items', { page: null, slot: 'block-9.1' })
    ],
    served: { '/': '<a href="/index.php/old-page">Old</a>' }
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.deepEqual(run.site.writes, [])
  assert.equal(run.doors.fixer.asked.length, 0)
  assert.deepEqual(
    run.log.records.map((r) => [r.outcome, r.causingCheck]),
    [
      ['no-door', 'dead-links'],
      ['no-door', 'unaddressable-items']
    ]
  )
  assert.equal(run.log.counts['no-door'], 2)
})

test('with --check-now the first site check runs alongside the finder, not before it', async () => {
  const order = []
  let finderAsked
  const asked = new Promise((resolve) => {
    finderAsked = resolve
  })
  const run = await finish({
    finder: [{ faults: [] }, { faults: [] }],
    argv: ['--check-now'],
    onFinderAsk: () => finderAsked(),
    // The first check reads pages as a visitor does; it waits here until the finder has been asked, or gives up.
    pageHtml: async () => {
      order.push('first check reads a page')
      order.push(
        await Promise.race([
          asked.then(() => 'finder asked'),
          new Promise((resolve) => setTimeout(() => resolve('timed out'), 2000))
        ])
      )
      return '<html><body></body></html>'
    }
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.ok(order.includes('finder asked'), order.join(' > '))
  assert.ok(!order.includes('timed out'), order.join(' > '))
  assert.ok(run.out.some((l) => l.startsWith('first site-check (run alongside the finder):')))
  assert.ok(existsSync(path.join(run.dir, 'first-site-check.json')))
})

test('words of a heading glued together at phone width are a broken layout fault the fixer is asked about', async () => {
  const run = await finish({
    finder: twice(
      finding('broken-layout', {
        viewport: 'phone',
        seen: 'at phone width the heading reads "A LESSON IN THEPOOL": the accent word is glued to the word before it'
      })
    ),
    fixer: [{ kind: 'style-block', block: 'block-2', declarations: { 'word-spacing': '0.25em' } }],
    failures: []
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.equal(run.doors.fixer.asked.length, 1)
  const [record] = run.log.records
  assert.equal(record.faultKind, 'broken-layout')
  assert.equal(record.viewport, 'phone')
  assert.notEqual(record.outcome, 'logged-only')
  const finderSystem = run.doors.finder.asked[0].system
  assert.match(finderSystem, /glued/)
})

test('a customer-visible fault outside the list that the finder names is kept in the log as logged only', async () => {
  const run = await finish({
    finder: twice(finding('other', { seen: 'a carousel arrow sits over the heading' })),
    failures: []
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.equal(run.doors.fixer.asked.length, 0)
  const [record] = run.log.records
  assert.equal(record.outcome, 'logged-only')
  assert.equal(record.seen, 'a carousel arrow sits over the heading')
  assert.match(run.doors.finder.asked[0].system, /"other"/)
})

const SHOWERS = 'Showers ((span))and((/span)) lockers'
/** An order on the menu that code still refuses: it changes the words of the slot. */
const noOrder = { kind: 'fix-text', slot: 'block-3.2', text: 'x' }

test('a site check failure on another block of the page is not confirmed by a finder fault that named neither slot nor block nor its words', async () => {
  const run = await finish({
    finder: twice(
      finding('raw-markup', { slot: null, seen: 'the heading prints "((span))coaching((/span))"' })
    ),
    fixer: [noOrder],
    failures: [failure('emphasis-codes-left', { slot: 'block-3.2', measured: SHOWERS })],
    served: { '/': '<p>Showers and lockers</p>' }
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  const byOutcome = Object.fromEntries(run.log.records.map((r) => [r.outcome, r]))
  assert.deepEqual(byOutcome['measurement-wrong'].causingCheck, 'emphasis-codes-left')
  assert.match(byOutcome['measurement-wrong'].reason, /live page/)
  assert.deepEqual(byOutcome.dropped.sources, ['finder'], 'the finder fault is not counted as confirmed')
})

test('a site check failure is confirmed by the finder on the same block, or on the words the finder quoted', async () => {
  const sameBlock = await finish({
    finder: twice(finding('raw-markup', { slot: 'block-3.1', seen: 'markup printed' })),
    fixer: [noOrder],
    failures: [failure('emphasis-codes-left', { slot: 'block-3.2', measured: SHOWERS })]
  })
  assert.equal(sameBlock.log.records.length, 1)
  assert.deepEqual(sameBlock.log.records[0].sources, ['finder', 'site-check'])
  const quoted = await finish({
    finder: twice(finding('raw-markup', { slot: null, seen: `the block prints "${SHOWERS}"` })),
    fixer: [noOrder],
    failures: [failure('emphasis-codes-left', { slot: 'block-3.2', measured: SHOWERS })]
  })
  assert.equal(quoted.log.records.length, 1)
  assert.deepEqual(quoted.log.records[0].sources, ['finder', 'site-check'])
  assert.ok(!quoted.log.records.some((r) => r.outcome === 'measurement-wrong'))
})

test('a visible site check failure the finder missed is confirmed when the live page still holds what was measured', async () => {
  const run = await finish({
    finder: [{ faults: [] }, { faults: [] }],
    fixer: [noOrder],
    failures: [failure('emphasis-codes-left', { slot: 'block-3.2', measured: SHOWERS })],
    served: { '/': `<p>${SHOWERS}</p>` }
  })
  assert.equal(run.doors.fixer.asked.length, 1)
  assert.deepEqual(run.log.records[0].sources, ['site-check'])
})

test('an empty frame or broken picture is logged only until a repair order exists; an empty demo block still goes to the fixer', async () => {
  const frame = await finish({
    finder: twice(finding('empty-frame', { seen: 'the gallery frame is empty' })),
    failures: [failure('empty-frames', { slot: 'block-3.2' })]
  })
  assert.equal(frame.code, 0, frame.err.join('\n'))
  assert.equal(frame.doors.fixer.asked.length, 0)
  assert.deepEqual(frame.site.writes, [])
  assert.equal(frame.log.records.length, 2)
  for (const record of frame.log.records) {
    assert.equal(record.outcome, 'logged-only')
    assert.match(record.reason, /no repair order yet/)
  }
  const block = await finish({
    finder: twice(finding('empty-block', { seen: 'a demo button with no words' })),
    fixer: [{ kind: 'remove-demo-item', slot: 'block-2.1', item: 'Strength', with: null }],
    failures: []
  })
  assert.equal(block.doors.fixer.asked.length, 1)
  assert.equal(block.log.records[0].faultKind, 'empty-block')
})
