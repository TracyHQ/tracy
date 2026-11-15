// The release gate as one run (ticket #586) on the invented florist kit and a site in memory: every phase in its
// order, the record with the six measurements, its page and the kit's verdict file; no reset hook leaves the
// measurements that need a fresh site `not_run` and the verdict failed; a phase that throws is `incomplete` with its
// reason while the later phases still run.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { EXEMPTIONS } from '../ai-quickstart/gate/adapters/joomla-t4.mjs'
import { JOOMLA_PROBES } from '../ai-quickstart/gate/adapters/joomla-probes.mjs'
import { codesIn } from '../ai-quickstart/gate/marker-codec.mjs'
import { memoryTryWrite } from '../ai-quickstart/gate/memory-write.mjs'
import { releaseGate } from '../ai-quickstart/gate/release-gate.mjs'
import { RECORD_FILE, releaseProblems, VERDICT_FILE } from '../ai-quickstart/gate/release-binding.mjs'
import { blankControlOf } from '../ai-quickstart/gate/verdict.mjs'
import { PROBE_CATALOGUE } from '../ai-quickstart/gate/write-probes-edge.mjs'
import { demoCorpus, observationsFromHtml } from '../ai-quickstart/rendered-scan.mjs'
import { floristKit } from './fixtures/ai-quickstart-gate/florist-kit.mjs'
import { memorySiteOf, ORIGIN } from './fixtures/ai-quickstart-gate/memory-site.mjs'

const PHASES = [
  'secrets',
  'human control',
  'marker test',
  'structure full',
  'quality',
  'structure hidden',
  'structure minimum',
  'write safety'
]
const groups = (failures = []) => ({
  groups: [{ name: 'text-overflow', status: failures.length ? 'red' : 'green', failures }]
})
const overflow = (selector) => ({
  group: 'text-overflow',
  width: 390,
  level: 'block',
  reason: 'cut',
  selector
})

/** The SEO items every page needs, so the marker pages carry no finding of their own. */
const headOf = (p) =>
  '<head><title>Petal ' +
  p.pageType +
  '</title><meta name="description" content="x"><meta property="og:image" content="' +
  ORIGIN +
  '/og.png"><meta name="viewport" content="width=device-width"><link rel="icon" href="/icon.png"></head>'

function setup({ reset = true, faults = {}, quality = groups(), secrets, write } = {}) {
  const kit = floristKit()
  const site = memorySiteOf(kit, { ...faults, reset })
  const lines = []
  const order = []
  const stamp =
    (name, fn) =>
    async (...a) => {
      order.push(name)
      return fn(...a)
    }
  const fetchPage = site.fetch
  const session = {
    origin: ORIGIN,
    write:
      write ??
      (async (built) => ({ ...(await site.write(built)), plugin: { start: '1.0.0', end: '1.0.0' } })),
    pages: site.pages,
    fetch: async (url) => (url.endsWith('/icon.png') ? { status: 200, html: '' } : fetchPage(url)),
    hide: site.hide,
    show: site.show,
    off: site.off,
    back: site.back
  }
  const out = mkdtempSync(path.join(tmpdir(), 'release-gate-'))
  const input = {
    kit,
    archive: { names: [], files: new Map() },
    kitHashes: { 'mapping.json': createHash('sha256').update('{}').digest('hex') },
    adapter: { exemptions: EXEMPTIONS },
    iconLibrary: { set: 'invented-icons@1', icons: [{ name: 'leaf', tags: ['plant'], categories: [] }] },
    tryWrite: memoryTryWrite(kit),
    corpus: demoCorpus({ fixedTexts: ['Our spring tulip sale'] }),
    widths: [1440],
    themes: ['light'],
    site: session,
    reset: site.reset,
    secrets: stamp('secrets', async () => secrets ?? { status: 'passed', findings: [] }),
    control: stamp('control', async () => ({
      human: { status: 'run', findings: 3, pages: 1 },
      blank: blankControlOf([]),
      quality: { from: 'measured', ...groups([overflow('.hero h1')]) }
    })),
    quality: stamp('quality', async () => quality),
    render: stamp('render', async (pages) => {
      const out = []
      for (const p of pages) {
        const { status, html } = await site.fetch(p.url)
        const page = html.replace('<html>', '<html lang="en">' + headOf(p)).replace(/<nav>.*?<\/nav>/, '')
        out.push({
          ...p,
          theme: 'light',
          width: 1440,
          status,
          html: page,
          // The memory pages print the block titles and the page names around the markers: only what carries a
          // marker is read (and not the menu items' internal links), so the marker test is clean and the verdict can pass.
          observations: observationsFromHtml(page)
            .filter((o) => codesIn(String(o.value)).length && !String(o.value).includes('option='))
            .map((o) => ({ ...o, visible: true }))
        })
      }
      return out
    }),
    probes: [...PROBE_CATALOGUE, ...JOOMLA_PROBES],
    out,
    log: (l) => lines.push(l)
  }
  return { input, site, out, lines, order, done: () => rmSync(out, { recursive: true, force: true }) }
}

test('every phase runs in its order and the record holds the six measurements, its page and the verdict file', async () => {
  const s = setup()
  try {
    const { record, verdictFile, phases } = await releaseGate(s.input)
    assert.deepEqual(
      phases.map((p) => p.phase),
      PHASES
    )
    assert.deepEqual(s.order, ['secrets', 'control', 'render', 'quality'])
    assert.ok(phases.every((p) => typeof p.seconds === 'number'))
    for (const name of ['markerTest', 'demoScan', 'writeSafety', 'structure', 'quality', 'secrets'])
      assert.ok(record.measurements[name]?.status, name)
    assert.equal(
      record.measurements.writeSafety.status,
      'passed',
      JSON.stringify(record.measurements.writeSafety.findings?.slice(0, 3))
    )
    assert.equal(record.measurements.structure.linkCheck.status, 'passed')
    assert.equal(record.measurements.structure.minItems.status, 'passed')
    assert.equal(record.measurements.structure.hidden.status, 'passed')
    assert.equal(record.measurements.quality.status, 'passed')
    assert.equal(record.measurements.quality.seo.status, 'passed')
    // The files: the record, its page, and the verdict file bound to the record's own text.
    const written = JSON.parse(readFileSync(path.join(s.out, RECORD_FILE), 'utf8'))
    assert.deepEqual(written.verdict, record.verdict)
    assert.deepEqual(JSON.parse(readFileSync(path.join(s.out, VERDICT_FILE), 'utf8')), verdictFile)
    assert.match(readFileSync(path.join(s.out, 'record.html'), 'utf8'), /Write safety/)
    assert.doesNotMatch(readFileSync(path.join(s.out, 'record.json'), 'utf8'), /florist\.example/)
    // A kit that ships this check record beside its own files may be released.
    const kitDir = mkdtempSync(path.join(tmpdir(), 'release-gate-kit-'))
    writeFileSync(path.join(kitDir, 'mapping.json'), '{}')
    cpSync(path.join(s.out, 'check-record'), path.join(kitDir, 'check-record'), { recursive: true })
    const problems = releaseProblems(kitDir, {})
    rmSync(kitDir, { recursive: true, force: true })
    assert.equal(
      problems.some((p) => p.code === 'record_changed'),
      false
    )
    assert.equal(record.measurements.markerTest.status, 'passed')
    assert.equal(record.verdict.pass, true, JSON.stringify(record.verdict.failing))
    assert.equal(verdictFile.verdict.pass, true)
    assert.deepEqual(problems, [])
  } finally {
    s.done()
  }
})

test('a quality regression and a missing SEO item fail the quality measurement and the verdict', async () => {
  const s = setup({ quality: groups([overflow('.hero h1'), overflow('.card p')]) })
  try {
    const { record } = await releaseGate(s.input)
    const q = record.measurements.quality
    assert.equal(q.status, 'failed')
    assert.deepEqual(
      q.regressions.map((r) => r.selector),
      ['.card p']
    )
    assert.deepEqual(
      q.sameAsTemplate.map((r) => r.selector),
      ['.hero h1']
    )
    assert.ok(record.verdict.failing.includes('quality'))
    assert.equal(record.verdict.pass, false)
  } finally {
    s.done()
  }
})

test('with no reset hook the minimum variant and write safety are not_run and the verdict fails', async () => {
  const s = setup({ reset: false })
  try {
    const { record } = await releaseGate(s.input)
    assert.equal(record.measurements.writeSafety.status, 'not_run')
    assert.equal(record.measurements.structure.minItems.status, 'not_run')
    assert.equal(record.measurements.structure.minItems.reason, 'no_reset_hook')
    assert.equal(record.measurements.structure.status, 'incomplete')
    assert.ok(record.verdict.notRun.includes('writeSafety'))
    assert.ok(record.verdict.failing.includes('writeSafety'))
    assert.ok(record.verdict.failing.includes('structure'))
    assert.equal(record.verdict.pass, false)
    assert.equal(s.site.counts.resets, 0)
  } finally {
    s.done()
  }
})

test('a phase that throws is incomplete with its reason, and the later phases still run', async () => {
  const s = setup()
  s.input.secrets = async () => {
    throw Object.assign(new Error('gitleaks went away'), { code: 'scan_crashed' })
  }
  s.input.quality = async () => {
    throw new Error('no browser')
  }
  try {
    const { record, phases } = await releaseGate(s.input)
    assert.deepEqual(
      phases.map((p) => p.phase),
      PHASES
    )
    assert.equal(record.measurements.secrets.status, 'incomplete')
    assert.equal(record.measurements.secrets.reason, 'scan_crashed')
    assert.equal(record.measurements.quality.status, 'incomplete')
    assert.match(record.measurements.quality.message, /no browser/)
    assert.equal(record.measurements.writeSafety.status, 'passed')
    assert.equal(record.verdict.pass, false)
  } finally {
    s.done()
  }
})

test('a marker write that throws leaves a record that fails on the marker test, with the other phases run', async () => {
  const s = setup({
    write: async () => {
      throw Object.assign(new Error('the build stopped'), { code: 'under_page_position_not_detail' })
    }
  })
  try {
    const { record, phases } = await releaseGate(s.input)
    assert.equal(phases.find((p) => p.phase === 'marker test').status, 'incomplete')
    assert.equal(record.measurements.markerTest.status, 'incomplete')
    assert.equal(record.measurements.markerTest.reason, 'under_page_position_not_detail')
    assert.equal(record.measurements.structure.linkCheck.status, 'incomplete')
    assert.equal(record.measurements.quality.status, 'incomplete')
    assert.equal(record.schema, 'tracy-ai-quickstart-check-record/v2')
    assert.equal(record.verdict.pass, false)
    assert.ok(record.verdict.failing.includes('write'))
  } finally {
    s.done()
  }
})

test('a secret in the record files fails the secret scan before they are written', async () => {
  const s = setup()
  s.input.scanRecord = (files) =>
    files.some((f) => f.name.endsWith('record.json'))
      ? [{ file: 'check-record/record.json', at: '/x', rule: 'jwt', fingerprint: 'abcdefabcdef' }]
      : []
  try {
    const { record } = await releaseGate(s.input)
    assert.equal(record.measurements.secrets.status, 'failed')
    assert.deepEqual(
      record.measurements.secrets.findings.map((f) => f.rule),
      ['jwt']
    )
  } finally {
    s.done()
  }
})
