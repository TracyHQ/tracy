// The marker test as one function (ticket #585) on an invented florist kit with a small mapping and blank site contract
// (`fixtures/ai-quickstart-gate/florist-kit.mjs`): the real marker build and its accounting, the memory write, the
// write plan run through the build team's write step on memory doors in place of a real site, and pages rendered from
// the build as HTML with no browser. This proves the scorer is not tied to one template: the same `runGate` that
// `gate.mjs` runs on a real site with a browser reads these pages, names each leak by its true source in an invented
// blank site archive and groups it with a fix class; a clean run passes, and a write that stopped fails.
import assert from 'node:assert/strict'
import test from 'node:test'
import { runDraftWrite } from '../../apps/tracy-web/src/step-chain-draft-write.js'
import { memoryDoors } from '../../packages/wo/website-opportunities/domain/write-order-memory-doors.mjs'
import { memorySite } from '../../packages/wo/website-opportunities/domain/write-order-memory-site.mjs'
import { EXEMPTIONS } from '../ai-quickstart/gate/adapters/joomla-t4.mjs'
import { codesIn } from '../ai-quickstart/gate/marker-codec.mjs'
import { memoryTryWrite, openMarkerPicture } from '../ai-quickstart/gate/memory-write.mjs'
import { runGate } from '../ai-quickstart/gate/run-gate.mjs'
import { blankControlOf } from '../ai-quickstart/gate/verdict.mjs'
import { demoCorpus, observationsFromHtml } from '../ai-quickstart/rendered-scan.mjs'
import { floristKit as kit } from './fixtures/ai-quickstart-gate/florist-kit.mjs'

const ORIGIN = 'http://florist.example'
// The four measurements of #586, each passed.
const PASSED = {
  writeSafety: { status: 'passed' },
  structure: { linkCheck: { status: 'passed' }, minItems: { status: 'passed' } },
  quality: { status: 'passed' },
  secrets: { status: 'passed', findings: [] }
}
// The invented blank site archive: what the template and the CMS bring with them.
const archive = {
  names: ['templates/petal/favicon.ico'],
  files: new Map([
    ['language/en-GB/joomla.ini', 'JLIB_HTML_READ_MORE="Read more"\n'],
    ['language/en-GB/tpl_petal.ini', 'TPL_PETAL_FOLLOW="Follow us"\n'],
    ['templates/petal/html/layouts/footer.php', '<p class="note">Fresh flowers every morning</p>'],
    ['installation/sql/mysql/custom.sql', "INSERT INTO `#__content` VALUES (1,'Our spring tulip sale');"]
  ])
}
const strings = (value) =>
  typeof value === 'string'
    ? [value]
    : value && typeof value === 'object'
      ? Object.entries(value)
          .filter(([k]) => k !== 'page')
          .flatMap(([, v]) => strings(v))
      : []
// One page of HTML from the build's pages, inside an invented template frame (with the frame's own words and
// pictures unless `clean`): each copied block in its module wrapper, each uploaded picture by its site path.
const htmlOf = (page, { clean = false, ids = {}, paths = {} } = {}) => {
  const words = page.blocks.flatMap((b) =>
    [
      b.fields,
      ...(b.items ?? []).map((i) => i.fields),
      ...(b.lists ?? []).flatMap((l) => l.rows.map((r) => r.fields))
    ]
      .flatMap(strings)
      .filter((v) => !/^https?:/.test(v))
  )
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const modules = Object.entries(ids)
    .filter(([k]) => k.startsWith('copy:'))
    .map(([, id]) => `<div id="Mod${id}"></div>`)
  const pictures = Object.values(paths).map((p) => `<img src="/${p}" alt="">`)
  const frame = clean
    ? ''
    : `<img src="/templates/petal/favicon.ico" alt="">
<p><a href="/more">Read more</a></p><p>Follow us</p><p>Fresh flowers every morning</p>
<p>Our spring tulip sale</p><p>A sentence nobody wrote</p>`
  return `<html><head><title>${esc(page.seo?.title ?? '')}</title>
</head><body>${frame}
${words.map((w, i) => `<p id="Mod${i + 1}">${esc(w)}</p>`).join('\n')}
${modules.join('')}${pictures.join('')}<mark>qqqqq</mark></body></html>`
}
// The real write in place of a real site: the write plan run by the write step on fresh memory doors of the kit.
const memoryRealWrite = async (built, k, { stop = false } = {}) => {
  const memory = memoryDoors({
    lock: k.lock,
    contentMap: k.blankContract,
    fail: stop ? [1, 2, 3, 4, 5, 6] : []
  })
  const record = {}
  let report
  try {
    report = await runDraftWrite({
      plan: built.writePlan,
      doors: memory.doors,
      record,
      openStored: openMarkerPicture(built.registry),
      runId: 'run-marker-site'
    })
  } catch (error) {
    report = { status: 'stopped', code: error.code ?? 'write_failed', message: error.message }
  }
  return {
    report,
    record: { ids: record.ids ?? {}, paths: record.paths ?? {} },
    plugin: { start: '1.0.0', end: '1.0.0' }
  }
}
const gateOn = (k, { clean = false, stop = false, drop = false, measurements } = {}) =>
  runGate({
    kit: k,
    archive,
    adapter: { exemptions: EXEMPTIONS },
    iconLibrary: { set: 'invented-icons@1', icons: [{ name: 'leaf', tags: ['plant'], categories: [] }] },
    tryWrite: memoryTryWrite(k),
    corpus: demoCorpus({ fixedTexts: ['Our spring tulip sale'] }),
    widths: [1440],
    themes: ['light'],
    measurements,
    controls: async () => ({ human: { status: 'run', findings: 3, pages: 1 }, blank: blankControlOf([]) }),
    site: async ({ built }) => {
      const real = await memoryRealWrite(built, k, { stop })
      const { site } = await memorySite().apply(built.order)
      return {
        origin: ORIGIN,
        real,
        pages: site.pages.map((p) => ({
          pageType: p.id,
          path: p.home ? '' : p.id,
          // `drop`: the template prints no block at all (every block written and never shown).
          html: htmlOf(drop ? { ...p, blocks: [] } : p, {
            clean,
            paths: real.record.paths,
            ids: drop ? {} : real.record.ids
          })
        })),
        siteValues: new Map()
      }
    },
    render: async (pages) =>
      pages.map((p) => ({
        ...p,
        theme: 'light',
        width: 1440,
        status: 200,
        observations: observationsFromHtml(p.html).map((o) => ({ ...o, visible: true }))
      }))
  })

test('runGate on an invented kit with a memory site and no browser: every leak named, grouped, not passed', async () => {
  const lines = []
  const result = await runGate({
    kit: kit(),
    archive,
    adapter: { exemptions: EXEMPTIONS },
    iconLibrary: { set: 'invented-icons@1', icons: [{ name: 'leaf', tags: ['plant'], categories: [] }] },
    corpus: demoCorpus({ fixedTexts: ['Our spring tulip sale'] }),
    widths: [1440],
    themes: ['light'],
    log: (l) => lines.push(l),
    controls: async () => ({
      human: { status: 'run', findings: 3, pages: 1 },
      blank: blankControlOf([])
    }),
    site: async ({ built }) => {
      const { report, site } = await memorySite().apply(built.order)
      return {
        origin: ORIGIN,
        real: { report, record: { ids: {}, paths: {} }, plugin: { start: '1.0.0', end: '1.0.0' } },
        pages: site.pages.map((p) => ({ pageType: p.id, path: p.home ? '' : p.id, html: htmlOf(p) })),
        siteValues: new Map()
      }
    },
    render: async (pages) =>
      pages.map((p) => ({
        ...p,
        theme: 'light',
        width: 1440,
        status: 200,
        observations: observationsFromHtml(p.html).map((o) => ({ ...o, visible: true }))
      }))
  })
  const { record, groups, classified } = result
  assert.ok(lines.some((l) => l.startsWith('universe ')))
  assert.ok(lines.includes('control blank: not_applicable'))
  // The markers the build wrote are read on the pages and are no finding.
  assert.ok(classified.seen.size > 0)
  for (const f of classified.findings) assert.equal(codesIn(f.value).length, 0, f.value)
  // Each frame text is one group, named by its true source and given the fix it most likely needs.
  const of = (value) => groups.find((g) => g.value === value)
  assert.deepEqual(
    [of('Read more').source.class, of('Read more').source.key, of('Read more').fixClass],
    ['language', 'JLIB_HTML_READ_MORE', 'kit_declare_keep']
  )
  assert.equal(of('Read more').count, result.renders.length)
  assert.deepEqual(
    [of('Fresh flowers every morning').source.class, of('Fresh flowers every morning').fixClass],
    ['literal', 'template_patch']
  )
  assert.deepEqual(
    [of('Our spring tulip sale').source.class, of('Our spring tulip sale').fixClass],
    ['data', 'build_gap']
  )
  assert.equal(of('A sentence nobody wrote').source.class, 'unknown')
  assert.equal(of('/templates/petal/favicon.ico').fixClass, 'kit_write')
  // The kit's kept key and the marker filler are exemptions, never findings.
  assert.equal(of('Follow us'), undefined)
  assert.equal(of('qqqqq'), undefined)
  assert.ok(classified.exempt.some((e) => e.why.startsWith('kept_by_kit')))
  assert.ok(classified.exempt.some((e) => e.why === 'marker_filler'))
  // The demo scan finds the demo sentence; the record is not passed and says what was not run.
  assert.ok(record.demoScan.findings.length > 0)
  assert.equal(record.verdict.controls, 'right')
  assert.equal(record.verdict.pass, false)
  assert.deepEqual(record.verdict.notRun, ['writeSafety', 'structure', 'quality', 'secrets'])
  assert.equal(record.schema, 'tracy-ai-quickstart-check-record/v2')
  assert.equal(record.measurements.structure.linkCheck.status, 'not_run')
  assert.equal(record.markerTest.groupCounts.unknown, 1)
})

test('a clean run on the invented kit passes: written, accounted, every written marker seen, no leak', async () => {
  const k = kit()
  const { record, built, accounting } = await gateOn(k, { clean: true })
  assert.equal(built.written.report.status, 'done')
  assert.ok(built.writePlan.ops.length > 0)
  assert.ok(accounting.counts.written > 0)
  assert.equal(accounting.counts.unexplained, 0)
  assert.equal(record.verdict.write, 'done')
  assert.deepEqual(
    record.markerTest.notSeen.filter((n) => !n.declared),
    []
  )
  assert.ok(record.markerTest.codesSeen > 0, 'the written markers are read on the pages')
  assert.equal(record.verdict.leaks, 0)
  // Only the measurements of the next ticket are left: once they pass, the verdict is true.
  assert.deepEqual(record.verdict.failing, ['writeSafety', 'structure', 'quality', 'secrets'])
  assert.equal(record.measurements.markerTest.status, 'passed')
  const passed = PASSED
  const done = await gateOn(kit(), { clean: true, measurements: passed })
  assert.equal(done.record.verdict.pass, true)
})

test('the same clean run with a write that stopped on the site fails the verdict', async () => {
  const { record } = await gateOn(kit(), { clean: true, stop: true, measurements: PASSED })
  assert.notEqual(record.verdict.write, 'done')
  assert.deepEqual(record.verdict.failing, ['write'])
  assert.equal(record.verdict.pass, false)
})

test('a written block no page prints is a written marker not seen, unexplained unless declared', async () => {
  const { classified, record } = await gateOn(kit(), { clean: true, drop: true })
  assert.ok(classified.notSeen.length > 0)
  assert.ok(classified.notSeen.every((n) => n.reason === 'value_not_printed' && n.declared === null))
  assert.ok(record.verdict.failing.includes('notSeen'))
})
