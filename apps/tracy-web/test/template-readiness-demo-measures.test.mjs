/**
 * The demo measurements check of the template readiness verdict (ticket #436): the site check's own layout measures
 * (main headings, empty blocks, text past its box or past the right edge, orphan card rows, blank footer columns) run on the UNTOUCHED demo of a quickstart at
 * 1440 and 390, recorded as `demo-measures.json` beside the contract, and read by the verdict. A template layout fault
 * holds a new release with a code per fault family and a fix that points to a template release.
 *
 * The measuring half is driven through an invented host answer (no browser here); the judging half reads the file.
 */
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { defaultContracts } from '../src/lib/contracts.js'
import {
  DEMO_MEASURES_CHECK,
  DEMO_MEASURES_COMMAND
} from '../src/lib/template-readiness/demo-measures-check.js'
import { DEMO_MEASURES_FILE } from '../src/lib/template-readiness/demo-measures-file.js'
import { latestPin, releaseOfPin } from '../src/lib/template-readiness/pinned-release.js'
import { readinessVerdict } from '../src/lib/template-readiness/verdict.js'
import { DEMO_MEASURE_GROUPS, measureDemo } from '../src/site-check/demo-measures.js'
import { main } from '../scripts/demo-measures.mjs'

const TAG = 'quickstart/ja-example/j6'

const release = (over = {}) => ({
  tag: TAG,
  kind: 'quickstart',
  platform: 'joomla',
  setting: { platform: 'joomla', version: '1.0.0', template: 'ja-example' },
  inspiration: null,
  inspirationHidden: true,
  choosable: true,
  ...over
})
const published = () => release({ inspiration: { template: 'ja-example' }, inspirationHidden: false })

/** A contract folder of an invented template holding `doc` as its demo measurements (none when null). */
function contractWith(doc) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'demo-measures-'))
  if (doc !== null)
    writeFileSync(path.join(dir, DEMO_MEASURES_FILE), typeof doc === 'string' ? doc : JSON.stringify(doc))
  const contracts = new Map([[`${TAG}@1.0.0`, { id: 'ja-example/j6/1.0.0', dir, platform: 'joomla' }]])
  return { dir, contracts, done: () => rmSync(dir, { recursive: true, force: true }) }
}

const judge = (doc, rel = release()) => {
  const c = contractWith(doc)
  try {
    return DEMO_MEASURES_CHECK.judge(rel, { contracts: c.contracts }, { steps: [], version: '1.0.0' })
  } finally {
    c.done()
  }
}

// ── The invented host: what `POST /_host/demo-qa` answers for the pages asked, at both widths ────────────────────────

const PASSING_CHECKS = ['no-empty-picture-slots', 'no-empty-boxes'].map((id) => ({
  id,
  pass: true,
  detail: [],
  measured: 0,
  expected: 'none'
}))

/** One page read at one width, with nothing wrong on it. */
const cleanMeasure = (p, width) => ({
  path: p,
  width,
  textBoxes: [
    {
      selector: 'h2.section-title',
      text: 'Train with us',
      boxWidth: 300,
      boxHeight: 40,
      contentWidth: 300,
      contentHeight: 40,
      clips: false,
      right: Math.min(width, 340)
    }
  ],
  mainHeadings: ['Wren Example Gym'],
  orphanRows: [],
  blankFooterColumns: []
})

/**
 * A host that reads every page asked of it, calling `faultOf(path, width)` to change one read.
 * @param {(m: object) => object} [change]
 */
function fakeHost(change = (m) => m, { checks = PASSING_CHECKS } = {}) {
  const asked = []
  const host = async (payload) => {
    asked.push(payload)
    const pages = [...payload.pages, ...payload.plan]
    return {
      checks,
      visited: pages.map((p) => ({ path: p, status: 200 })),
      pageMeasures: pages.flatMap((p) => [1440, 390].map((w) => change(cleanMeasure(p, w))))
    }
  }
  return { host, asked }
}

const PAGES = ['/', '/classes', '/about-us']
const QUICKSTART = { slug: 'ja-example', version: '1.0.0' }

// ── Tests ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

test('the demo is measured by the very site check groups a built site gets, at 1440 and 390', () => {
  // test-quality: contract the measures named by the ticket, each one a group of the site check (page-groups.js).
  assert.deepEqual(
    DEMO_MEASURE_GROUPS.map((g) => g.name),
    ['main-heading', 'empty-frames', 'text-overflow', 'orphan-row', 'blank-footer-column']
  )
})

test('a clean untouched demo is recorded green, every page read at both widths, and the check is done', async () => {
  const { host, asked } = fakeHost()
  const doc = await measureDemo({ host, pages: PAGES, quickstart: QUICKSTART })
  assert.equal(doc.schemaVersion, 'tracy-demo-measures/v1')
  assert.deepEqual(doc.quickstart, QUICKSTART)
  assert.deepEqual(doc.widths, [1440, 390])
  assert.deepEqual(doc.pages, PAGES)
  assert.deepEqual(
    doc.groups.map((g) => [g.name, g.status]),
    [
      ['main-heading', 'green'],
      ['empty-frames', 'green'],
      ['text-overflow', 'green'],
      ['orphan-row', 'green'],
      ['blank-footer-column', 'green']
    ]
  )
  // The host is asked for its page measures, as the site check asks it on a built site.
  assert.equal(asked[0].measurePages, true)
  const judged = judge(doc)
  assert.deepEqual([judged.state, judged.code], ['done', 'demo-measures-clean'])
})

test('text past the right edge at 390 on the demo is a template layout fault: todo demo-overflow, fixed by a template release', async () => {
  const { host } = fakeHost((m) =>
    m.width === 390 && m.path === '/classes'
      ? { ...m, textBoxes: [{ ...m.textBoxes[0], selector: 'div.class-card', right: 452 }] }
      : m
  )
  const doc = await measureDemo({ host, pages: PAGES, quickstart: QUICKSTART })
  const overflow = doc.groups.find((g) => g.name === 'text-overflow')
  assert.equal(overflow.status, 'red')
  assert.deepEqual(
    overflow.failures.map((f) => [f.page, f.width, f.level]),
    [['/classes', 390, 'block']]
  )
  const judged = judge(doc)
  assert.deepEqual([judged.state, judged.code], ['todo', 'demo-overflow'])
  assert.deepEqual(judged.params.families, ['demo-overflow'])
  assert.equal(judged.params.faults[0].page, '/classes')
  assert.equal(judged.params.faults[0].width, 390)
  assert.match(judged.params.fix, /template release/)
})

test('each fault family has its own code: two main headings, an empty block', async () => {
  const twoHeadings = fakeHost((m) =>
    m.path === '/' ? { ...m, mainHeadings: ['Wren Example', 'Wren Example'] } : m
  )
  const doc = await measureDemo({ host: twoHeadings.host, pages: PAGES, quickstart: QUICKSTART })
  assert.deepEqual([judge(doc).state, judge(doc).code], ['todo', 'demo-main-heading'])

  const emptyBox = fakeHost((m) => m, {
    checks: [
      PASSING_CHECKS[0],
      {
        id: 'no-empty-boxes',
        pass: false,
        detail: [{ page: '/about-us', selector: 'div.service-box' }],
        measured: 1,
        expected: 'no service box printed empty'
      }
    ]
  })
  const empty = await measureDemo({ host: emptyBox.host, pages: PAGES, quickstart: QUICKSTART })
  const judged = judge(empty)
  assert.deepEqual([judged.state, judged.code], ['todo', 'demo-empty-block'])
  assert.equal(judged.params.faults[0].page, '/about-us')
})

test('an orphan card row and a blank footer column each have their own code', async () => {
  const orphan = fakeHost((m) =>
    m.path === '/classes' && m.width === 1440
      ? { ...m, orphanRows: [{ selector: 'div.class-grid', perRow: 3, lastRow: 1, rows: 2, gap: 780 }] }
      : m
  )
  const rows = await measureDemo({ host: orphan.host, pages: PAGES, quickstart: QUICKSTART })
  const judgedRows = judge(rows)
  assert.deepEqual([judgedRows.state, judgedRows.code], ['todo', 'demo-orphan-row'])
  assert.deepEqual([judgedRows.params.faults[0].page, judgedRows.params.faults[0].width], ['/classes', 1440])

  const blank = fakeHost((m) =>
    m.width === 1440 ? { ...m, blankFooterColumns: [{ selector: 'div.t4-col', width: 280, height: 120 }] } : m
  )
  const footer = await measureDemo({ host: blank.host, pages: PAGES, quickstart: QUICKSTART })
  const judgedFooter = judge(footer)
  assert.deepEqual([judgedFooter.state, judgedFooter.code], ['todo', 'demo-blank-footer-column'])
  assert.equal(judgedFooter.params.count, 3, 'once per page')
})

test('a page with no main heading only warns in the site check, so the demo stays done and says it', async () => {
  const { host } = fakeHost((m) => (m.path === '/about-us' ? { ...m, mainHeadings: [] } : m))
  const doc = await measureDemo({ host, pages: PAGES, quickstart: QUICKSTART })
  const judged = judge(doc)
  assert.deepEqual([judged.state, judged.code], ['done', 'demo-measures-clean'])
  assert.equal(judged.params.warnings, 1)
})

test('without the file the check is todo demo-measure-missing, and its fix is the command that writes it', () => {
  const judged = judge(null)
  assert.deepEqual([judged.state, judged.code], ['todo', 'demo-measure-missing'])
  assert.equal(judged.params.command, DEMO_MEASURES_COMMAND)
  assert.match(DEMO_MEASURES_COMMAND, /demo-measures\.mjs/)
})

test('a file that cannot be read, measured on another version, or with a group unmeasured holds the release', async () => {
  assert.equal(judge('{ not json').code, 'demo-measure-invalid')
  assert.equal(judge({ schemaVersion: 'tracy-demo-measures/v0' }).code, 'demo-measure-invalid')
  const { host } = fakeHost()
  const doc = await measureDemo({ host, pages: PAGES, quickstart: QUICKSTART })
  // Measured at one width only: the site check reads both, so the file does not stand for the demo.
  assert.equal(judge({ ...doc, widths: [1440] }).code, 'demo-measure-invalid')
  const older = judge({ ...doc, quickstart: { slug: 'ja-example', version: '0.9.0' } })
  assert.deepEqual([older.state, older.code], ['todo', 'demo-measure-stale'])
  // A host from before the page measures: the groups that need them could not tell, which is never green.
  const blind = await measureDemo({
    host: async () => ({ checks: PASSING_CHECKS, visited: [] }),
    pages: PAGES,
    quickstart: QUICKSTART
  })
  const judged = judge(blind)
  assert.deepEqual([judged.state, judged.code], ['todo', 'demo-measure-incomplete'])
  assert.deepEqual(judged.params.groups, [
    'main-heading',
    'text-overflow',
    'orphan-row',
    'blank-footer-column'
  ])
})

test('a template already shown on Design inspiration only warns', async () => {
  assert.deepEqual(
    [judge(null, published()).state, judge(null, published()).code],
    ['warn', 'demo-measure-missing']
  )
  const { host } = fakeHost((m) =>
    m.width === 390 ? { ...m, textBoxes: [{ ...m.textBoxes[0], right: 500 }] } : m
  )
  const doc = await measureDemo({ host, pages: PAGES, quickstart: QUICKSTART })
  assert.deepEqual([judge(doc, published()).state, judge(doc, published()).code], ['warn', 'demo-overflow'])
})

test('the check does not apply off Joomla and WordPress, or to a release with no contract (the contract piece says that)', () => {
  const emdash = release({ platform: 'emdash', setting: { platform: 'emdash', version: '1.0.0' } })
  assert.equal(DEMO_MEASURES_CHECK.judge(emdash, { contracts: new Map() }, {}), null)
  const wp = release({ platform: 'wordpress', setting: { platform: 'wordpress', version: '1.0.0' } })
  assert.equal(DEMO_MEASURES_CHECK.judge(wp, { contracts: new Map() }, {}), null)
  assert.equal(DEMO_MEASURES_CHECK.judge(release(), { contracts: new Map() }, {}), null)
})

const boxingNow = () => {
  const contracts = defaultContracts()
  const boxing = releaseOfPin(latestPin('ja-boxing'), contracts)
  return { contracts, boxing, judged: DEMO_MEASURES_CHECK.judge(boxing, { contracts }, {}) }
}

// The reference: measured on the untouched dev demo of JA Boxing 1.0.11 (template 1.1.0). Its feature and class icons
// are painted by masked pseudo elements over an <img> kept at opacity 0; the host counts such a painted icon as the
// frame's picture, so the icon boxes (`div.img-icon`, `div.intro-image`) are no empty frames.
test('the reference: the latest JA Boxing release is done on its committed demo measurements', () => {
  const { contracts, boxing, judged } = boxingNow()
  assert.deepEqual([judged.state, judged.code], ['done', 'demo-measures-clean'])
  assert.equal(judged.params.contract, 'ja-boxing/j6/1.0.11')
  const verdict = readinessVerdict(boxing, { contracts, server: false, checks: [DEMO_MEASURES_CHECK] })
  const kit = verdict.pieces.find((p) => p.piece === 'template-kit')
  assert.deepEqual([kit.step, kit.state, kit.code], ['demo-measures', 'done', 'demo-measures-clean'])
})

test('in the verdict: a copy of JA Boxing whose demo overflows at 390 holds the Template kit piece with demo-overflow', () => {
  const { contracts, boxing } = boxingNow()
  const dir = mkdtempSync(path.join(os.tmpdir(), 'demo-measures-boxing-'))
  try {
    const own = [...contracts.values()].find((c) => c.id === 'ja-boxing/j6/1.0.11')
    cpSync(own.dir, dir, { recursive: true })
    const file = path.join(dir, DEMO_MEASURES_FILE)
    const doc = JSON.parse(readFileSync(file, 'utf8'))
    // Its empty frame findings left out (see the reference above), so the copy is broken in exactly one place.
    Object.assign(
      doc.groups.find((g) => g.name === 'empty-frames'),
      { status: 'green', failures: [] }
    )
    const overflow = doc.groups.find((g) => g.name === 'text-overflow')
    overflow.status = 'red'
    overflow.failures = [
      {
        group: 'text-overflow',
        page: '/classes',
        width: 390,
        measured: 'Beginner Boxing',
        level: 'block',
        reason: 'Text runs 62 px past the right edge'
      }
    ]
    writeFileSync(file, JSON.stringify(doc))
    const broken = new Map([...contracts].map(([k, c]) => [k, c.id === own.id ? { ...c, dir } : c]))
    const verdict = readinessVerdict(boxing, {
      contracts: broken,
      server: false,
      checks: [DEMO_MEASURES_CHECK]
    })
    const kit = verdict.pieces.find((p) => p.piece === 'template-kit')
    assert.deepEqual([kit.step, kit.state, kit.code], ['demo-measures', 'todo', 'demo-overflow'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("the command writes demo-measures.json beside the contract from the kit's pages, and the verdict reads it", async () => {
  const c = contractWith(null)
  try {
    writeFileSync(
      path.join(c.dir, 'template-kit.json'),
      JSON.stringify({
        quickstart: { product: 'ja-example', version: '1.0.0' },
        pages: PAGES.map((p) => ({ path: p }))
      })
    )
    const { host, asked } = fakeHost((m) =>
      m.width === 390 ? { ...m, textBoxes: [{ ...m.textBoxes[0], right: 470 }] } : m
    )
    let out = ''
    const code = await main(['--contract', c.dir, '--base', 'https://demo.example.test'], {
      out: (s) => (out += s),
      hostOf: async () => ({ host })
    })
    assert.equal(code, 1)
    assert.match(out, /wrote demo-measures\.json/)
    assert.deepEqual([...asked[0].pages, ...asked[0].plan], PAGES)
    const written = readFileSync(path.join(c.dir, DEMO_MEASURES_FILE), 'utf8')
    // The file keeps what was found and where, never the address it was read at.
    assert.doesNotMatch(written, /example\.test/)
    const judged = DEMO_MEASURES_CHECK.judge(release(), { contracts: c.contracts }, {})
    assert.deepEqual([judged.state, judged.code], ['todo', 'demo-overflow'])
    let said = ''
    assert.equal(await main(['--contract', c.dir], { err: (s) => (said += s) }), 2)
    assert.match(said, /usage/)
  } finally {
    c.done()
  }
})
