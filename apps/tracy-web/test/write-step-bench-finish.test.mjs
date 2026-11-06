// The finisher on an already written site (#420, spec #418), driven through the step 9 bench the way an operator does:
// `finish` takes a run's write report and its first site check, and repairs the faults the finder sees. One seam, three
// fakes: a written site that records writes and reverts, scripted model doors, and a capture with fixed images. Only what
// comes out is asserted: the site's writes and reverts, the repair log, the final site check and refusals.
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import sharp from 'sharp'
import { runCli } from '../src/write-step-bench-cli.js'
import { kitIndex, memoryStore } from './_write-step-bench.mjs'
import {
  BLOCKS,
  benchSite,
  CLEAN,
  fakeCapture,
  finding,
  HOURS,
  heldAtStart,
  PAGES,
  RAW,
  scriptedDoor,
  writtenRun,
  writtenSite,
  judged
} from './_write-step-finisher.mjs'
import { memoryRunStore } from './_write-step-run.mjs'

const kits = kitIndex({ tool: 'template-kit 3.1.0', blocks: BLOCKS, pages: PAGES })
const dirs = []
after(() => {
  kits.done()
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

/** One finish on the written site, with the model doors' scripted answers. */
async function finish({
  finder,
  fixer,
  checker,
  images = true,
  argv = [],
  boxes = true,
  sideEffect = null,
  failures,
  failing = [],
  first = {}
}) {
  const site = writtenSite(heldAtStart(), { sideEffect })
  const shots = fakeCapture({ ...(boxes ? { held: site.held } : {}), failing })
  const doors = {
    finder: scriptedDoor('Finisher finder', finder, { images }),
    fixer: scriptedDoor('Finisher fixer', fixer),
    checker: scriptedDoor('Finisher checker', checker)
  }
  const out = []
  const err = []
  const dir = mkdtempSync(path.join(tmpdir(), 'write-step-finish-'))
  dirs.push(dir)
  const runs = memoryRunStore([writtenRun({ failures, ...first })])
  const code = await runCli(
    ['finish', '--run', 'run-1', '--account', 'bench@example.test', '--out', dir, ...argv],
    {
      runs,
      store: memoryStore([benchSite()]),
      index: kits.index,
      makeDoor: () => site.door,
      makeCapture: async () => shots.capture,
      makeFinisherDoors: async () => ({
        finder: doors.finder.door,
        fixer: doors.fixer.door,
        checker: doors.checker.door
      }),
      out: (l) => out.push(l),
      err: (l) => err.push(l)
    }
  )
  const logFile = path.join(dir, 'repair-log.json')
  const log = existsSync(logFile) ? JSON.parse(readFileSync(logFile, 'utf8')) : null
  return { code, out, err, site, shots, log, dir, runs, doors }
}

const fixOrder = (over = {}) => ({ kind: 'fix-text', slot: 'block-2.1', text: CLEAN, ...over })

test('a raw markup fault is repaired through the write door and kept when the checker says better', async () => {
  const run = await finish({
    finder: [finding(), finding()],
    fixer: [fixOrder()],
    checker: [judged('better', 'the heading reads as words')]
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.equal(run.site.held['module-2.1'], CLEAN)
  assert.equal(run.site.writes.length, 1)
  assert.match(run.site.writes[0].applyId, /^finisher-/)
  assert.deepEqual(run.site.reverts, [])
  const [record] = run.log.records
  assert.equal(record.outcome, 'kept')
  assert.equal(record.page, '/')
  assert.equal(record.slot, 'block-2.1')
  assert.equal(record.faultKind, 'raw-markup')
  assert.equal(record.causingStep, 9)
  assert.deepEqual(record.order, fixOrder())
  assert.equal(record.applyId, run.site.writes[0].applyId)
  for (const file of [...record.crops.before, ...record.crops.after])
    assert.ok(existsSync(path.join(run.dir, file)), `${file} is kept next to the run`)
  assert.ok(record.crops.before.length && record.crops.after.length)
  assert.equal(run.log.counts.kept, 1)
  // The final site check reads the repaired words as the ones ordered, and the build's check is the final one.
  assert.match(
    run.out.at(-1),
    /^final site-check: green, no new blocking failure in the \d+ groups both checks ran/
  )
  assert.deepEqual(run.log.finalCheck.newBlocking, [])
  assert.equal(run.runs.rows[0].report.siteCheck.status, 'green')
})

test('a repair the checker finds not better is reverted by its apply id and logged as undone', async () => {
  const run = await finish({
    finder: [finding(), finding()],
    fixer: [fixOrder()],
    checker: [judged('not better', 'the heading lost its accent')]
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.equal(run.site.writes.length, 1)
  assert.deepEqual(run.site.reverts, [run.site.writes[0].applyId])
  assert.equal(run.site.held['module-2.1'], RAW)
  const [record] = run.log.records
  assert.equal(record.outcome, 'undone')
  assert.match(record.reason, /the heading lost its accent/)
  assert.equal(run.log.counts.undone, 1)
})

test('an order of an unknown kind, for a slot the kit lacks, or that changes the words is dropped; nothing is written', async () => {
  for (const [order, why] of [
    [fixOrder({ kind: 'repaint-block' }), /unknown order kind/],
    [fixOrder({ slot: 'block-9.9' }), /block-9\.9.*kit/],
    [fixOrder({ text: 'Strength coaching for champions only' }), /words/]
  ]) {
    const run = await finish({ finder: [finding(), finding()], fixer: [order], checker: [] })
    assert.equal(run.code, 0, run.err.join('\n'))
    assert.deepEqual(run.site.writes, [])
    assert.equal(run.site.held['module-2.1'], RAW)
    const [record] = run.log.records
    assert.equal(record.outcome, 'dropped')
    assert.match(record.reason, why)
  }
})

test('a fault outside the list is logged only and nothing is asked of the fixer', async () => {
  const run = await finish({
    finder: [finding('nicer picture'), finding('nicer picture')],
    fixer: [],
    checker: []
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.deepEqual(run.site.writes, [])
  assert.equal(run.log.records[0].outcome, 'logged-only')
})

test('a finder door that cannot take images makes the bench refuse with the reason, before shooting or writing', async () => {
  const run = await finish({ finder: [], fixer: [], checker: [], images: false })
  assert.equal(run.code, 1)
  assert.match(run.err.join('\n'), /FINISHER_DOOR_NO_IMAGES: .*Finisher finder.*cannot read pictures/)
  assert.deepEqual(run.shots.calls, [])
  assert.deepEqual(run.site.writes, [])
  assert.equal(run.log, null)
})

const sizeOf = async (dir, file) => sharp(path.join(dir, file)).metadata()

test('the checker compares crops of the repaired block at every width, cut from the tiles by the block box', async () => {
  const run = await finish({
    finder: [finding(), finding()],
    fixer: [fixOrder()],
    checker: [judged('better', 'the heading reads as words')]
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  const [record] = run.log.records
  assert.equal(record.crops.by, 'block')
  assert.equal(record.crops.before.length, 2, 'desktop and phone before')
  assert.equal(record.crops.after.length, 2, 'desktop and phone after')
  for (const file of [...record.crops.before, ...record.crops.after]) {
    const { width, height } = await sizeOf(run.dir, file)
    assert.ok(height < 300, `${file} is the block, not the whole tile (${width}x${height})`)
  }
  const [asked] = run.doors.checker.asked
  assert.equal(asked.content.filter((c) => c.type === 'image_url').length, 4)
})

test('with no block box from the host, the crops fall back to the tile and the log says so', async () => {
  const run = await finish({
    finder: [finding(), finding()],
    fixer: [fixOrder()],
    checker: [judged('better', 'the heading reads as words')],
    boxes: false
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  const [record] = run.log.records
  assert.equal(record.crops.by, 'tile')
  assert.equal(record.crops.before.length, 1)
  const { height } = await sizeOf(run.dir, record.crops.before[0])
  assert.equal(height, 900)
})

test('an order for another slot than the finder named is dropped; nothing is written', async () => {
  const run = await finish({
    finder: [finding(), finding()],
    fixer: [fixOrder({ slot: 'block-3.2', text: 'Showers and lockers' })],
    checker: []
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.deepEqual(run.site.writes, [])
  const [record] = run.log.records
  assert.equal(record.outcome, 'dropped')
  assert.match(record.reason, /block-3\.2.*finder named block-2\.1/)
})

test('with no slot from the finder, an order may only pick a slot of that page whose words hold the markup it saw', async () => {
  const unnamed = finding('raw-markup', {
    slot: null,
    seen: 'a line prints ((span)) and ((/span)) around a word'
  })
  const kept = await finish({
    finder: [unnamed, finding('raw-markup', { slot: null })],
    fixer: [fixOrder({ slot: 'block-3.2', text: 'Showers and lockers' })],
    checker: [judged('better', 'reads as words')]
  })
  assert.equal(kept.code, 0, kept.err.join('\n'))
  assert.equal(kept.site.held['module-3.2'], 'Showers and lockers')
  assert.equal(kept.log.records[0].outcome, 'kept')

  for (const [order, why] of [
    // block-4.1 holds the same markup, but it is on the about page, not where the fault was seen.
    [fixOrder({ slot: 'block-4.1', text: 'Our story began in a garage' }), /block-4\.1 is not on \//],
    // block-3.1 is on the page, but its words hold no markup at all.
    [fixOrder({ slot: 'block-3.1', text: HOURS }), /block-3\.1.*does not hold the markup/]
  ]) {
    const run = await finish({
      finder: [unnamed, finding('raw-markup', { slot: null })],
      fixer: [order],
      checker: []
    })
    assert.equal(run.code, 0, run.err.join('\n'))
    assert.deepEqual(run.site.writes, [])
    assert.equal(run.log.records[0].outcome, 'dropped')
    assert.match(run.log.records[0].reason, why)
  }
})

test('an order whose new text is the text the slot holds now is dropped as a no-op and never written', async () => {
  const run = await finish({
    finder: [
      { faults: [...finding('raw-markup', { slot: 'block-3.1' }).faults, ...finding().faults] },
      { faults: [] }
    ],
    fixer: [fixOrder({ slot: 'block-3.1', text: HOURS }), fixOrder()],
    // The no-op is repair 1, the real repair is repair 2.
    checker: [judged('better', 'reads as words', 2)]
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.equal(run.site.writes.length, 1, 'only the real repair is written')
  const noOp = run.log.records.find((r) => r.slot === 'block-3.1')
  assert.equal(noOp.outcome, 'dropped')
  assert.match(noOp.reason, /no-op/)
  assert.equal(run.log.records.find((r) => r.slot === 'block-2.1').outcome, 'kept')
})

test('the bench says when the final site check gained a blocking failure the first check did not have', async () => {
  const run = await finish({
    finder: [finding(), finding()],
    fixer: [fixOrder()],
    checker: [judged('better', 'the heading reads as words')],
    sideEffect: { key: 'module-3.1', value: 'Closed' },
    first: { groups: [{ name: 'read-back', status: 'green', checked: 4, failures: [] }] }
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.match(
    run.out.at(-1),
    /^final site-check: red, 1 new blocking failure in the \d+ groups both checks ran/
  )
  const [added] = run.log.finalCheck.newBlocking
  assert.equal(added.slot, 'block-3.1')
  assert.equal(run.log.counts.newBlocking, 1)
})

test('the step and the check a first site check failure names as the cause go into the repair log', async () => {
  const run = await finish({
    finder: [finding(), finding()],
    fixer: [fixOrder()],
    checker: [judged('better', 'reads as words')],
    failures: [
      { group: 'read-back', page: '/about', slot: 'block-2.1', width: null, level: 'block', causingStep: 9 },
      { group: 'accent-emphasis', page: '/', slot: 'block-2.1', width: 1440, level: 'block', causingStep: 6 }
    ]
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  const [record] = run.log.records
  // The failure on the page the fault was seen wins over one on another page.
  assert.equal(record.causingStep, 6)
  assert.equal(record.causingCheck, 'accent-emphasis')
})

test('the pages shot are the pages the written site keeps, at their addresses now, never a kit page it dropped', async () => {
  const run = await finish({
    finder: [
      { faults: [] },
      finding('raw-markup', { page: '/about', slot: null, seen: 'a line prints ((span))' })
    ],
    fixer: [fixOrder({ slot: 'block-4.1', text: 'Our story began in a garage' })],
    checker: [judged('better', 'reads as words')]
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.deepEqual(run.shots.calls[0], ['/', '/about'])
  assert.ok(!run.shots.calls.flat().some((p) => p === '/about-us' || p === '/plans'))
  // The renamed page is still the kit's about page: the slots it shows are the ones an order may pick.
  assert.equal(run.site.held['module-4.1'], 'Our story began in a garage')
  assert.equal(run.log.records[0].page, '/about')
  assert.equal(run.log.records[0].outcome, 'kept')
})

test('a kept page the host could not shoot stays named in the log, never counted as seen', async () => {
  const run = await finish({ finder: [{ faults: [] }], fixer: [], checker: [], failing: ['/about'] })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.deepEqual(
    run.log.unshot.map((u) => [u.page, u.viewport, u.why]),
    [
      ['/about', 'desktop', 'CAPTURE_PAGE_FAILED'],
      ['/about', 'phone', 'CAPTURE_PAGE_FAILED']
    ]
  )
  assert.equal(run.doors.finder.asked.length, 1, 'the finder is asked only about the page that was shot')
})

const finalCheckOf = (run) => JSON.parse(readFileSync(path.join(run.dir, 'site-check.json'), 'utf8'))

test('the final site check runs with the options of the first check: every group when the first ran every group', async () => {
  const every = await finish({
    finder: [{ faults: [] }, { faults: [] }],
    fixer: [],
    checker: [],
    first: { allGroups: true }
  })
  assert.equal(every.code, 0, every.err.join('\n'))
  assert.equal(finalCheckOf(every).allGroups, true)
  assert.ok(every.out.some((l) => l.startsWith('final site-check options: all groups (as the first check)')))
  const usual = await finish({ finder: [{ faults: [] }, { faults: [] }], fixer: [], checker: [] })
  assert.equal(finalCheckOf(usual).allGroups, false)
})

test('a blocking failure is new only in a group both checks ran; the groups not compared are named', async () => {
  const run = await finish({
    finder: [finding(), finding()],
    fixer: [fixOrder()],
    checker: [judged('better', 'the heading reads as words')],
    sideEffect: { key: 'module-3.1', value: 'Closed' },
    // The first check never ran read-back, so a read-back failure now cannot be told to be new.
    first: { groups: [{ name: 'read-back', status: 'not-run', checked: 0, failures: [] }] }
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.equal(finalCheckOf(run).groups.find((g) => g.name === 'read-back').status, 'red')
  assert.deepEqual(run.log.finalCheck.newBlocking, [])
  assert.ok(run.log.finalCheck.notCompared.includes('read-back'))
  assert.match(
    run.out.at(-1),
    /no new blocking failure in the \d+ groups both checks ran; not compared: .*read-back/
  )
})

test('every model call leaves its raw reply and the image files it was shown next to the repair log', async () => {
  const run = await finish({
    finder: [finding(), { faults: [] }],
    fixer: [fixOrder()],
    checker: [judged('better', 'the heading reads as words')]
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  const files = readdirSync(path.join(run.dir, 'replies')).sort()
  assert.equal(files.length, 4, 'two finder calls, one fixer call, one checker call')
  const replies = files.map((f) => JSON.parse(readFileSync(path.join(run.dir, 'replies', f), 'utf8')))
  assert.deepEqual(replies.map((r) => r.role).sort(), ['checker', 'finder', 'finder', 'fixer'])
  const home = replies.find((r) => r.role === 'finder' && r.page === '/')
  assert.equal(home.text, JSON.stringify(finding()), 'the reply as the model gave it')
  assert.equal(home.model, 'deepseek-flash')
  assert.equal(home.images.length, 2, 'the home page at desktop and at phone width')
  // The model's own reasoning and token counts, as the door reported them: what shows it took the pictures in.
  assert.equal(home.reasoning, 'Finisher finder looked at what it was sent.')
  assert.equal(home.usage.promptTokens, 1200)
  const checker = replies.find((r) => r.role === 'checker')
  assert.deepEqual(checker.images, [...run.log.records[0].crops.before, ...run.log.records[0].crops.after])
  assert.deepEqual(replies.find((r) => r.role === 'fixer').images, [])
  for (const reply of replies) {
    for (const file of reply.images) assert.ok(existsSync(path.join(run.dir, file)), `${file} is kept`)
    assert.doesNotMatch(JSON.stringify(reply), /base64/, 'image bytes are never in a reply file')
  }
  assert.ok(run.log.replies.length === 4, 'the repair log lists the reply files')
})

test('a Joomla page is shot at the address the site answers at, /index.php/<path>, and logged by its path', async () => {
  const run = await finish({ finder: [{ faults: [] }, { faults: [] }], fixer: [], checker: [] })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.deepEqual(
    run.shots.layoutsAsked[0].map((l) => [l.path, l.address ?? null]),
    [
      ['/', null],
      ['/about', '/index.php/about']
    ]
  )
  assert.deepEqual(run.log.unshot, [])
})
