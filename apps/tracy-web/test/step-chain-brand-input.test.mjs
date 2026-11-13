// The brand step's two inputs (ticket #616): a research revision, or a brief held in memory with an optional logo file.
// The bench command line is a scripted fake that records its arguments; the brief and the logo path are invented.
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createStepChainSteps } from '../src/step-chain-steps.js'

const brief = { brand: { name: 'Harrow Lane Bakery', colorsFrom: 'logo' } }
const LOGO = path.join(tmpdir(), 'invented-logo.png')
const kit = { ref: 'example-court/j6/1.0.0' }

async function setup() {
  const recordsDir = await mkdtemp(path.join(tmpdir(), 'brand-input-test-'))
  const runs = []
  const cli = async (argv, io) => {
    if (argv[0] === 'run') {
      const file = argv[argv.indexOf('--brief-file') + 1]
      runs.push({ argv, text: argv.includes('--brief-file') ? await readFile(file, 'utf8') : null })
      io.out('brand-run')
    } else if (argv[0] === 'get')
      await writeFile(path.join(argv[argv.indexOf('--out') + 1], 'brand-file.json'), '{}')
    return 0
  }
  const steps = createStepChainSteps({
    config: {},
    pool: { query: async () => ({ rows: [{ status: 'succeeded', cost_usd: 0 }] }) },
    benchCli: { brand: cli },
    recordsDir,
    log: {}
  })
  return { steps, runs, recordsDir }
}
const how = (attempt = 1) => ({ signal: new AbortController().signal, attempt })

test('a revision runs the bench exactly as before', async () => {
  const { steps, runs, recordsDir } = await setup()
  try {
    const ctx = {
      runId: 'rev-run',
      brief: { researchRevisionId: 'rev-9' },
      normalized: { languages: ['en'] }
    }
    await steps.brand(ctx, { kit }, how())
    assert.deepEqual(runs[0].argv, [
      'run',
      '--kit',
      kit.ref,
      '--brief-revision',
      'rev-9',
      '--site-language',
      'en',
      '--no-caps',
      '--by',
      'step-chain'
    ])
  } finally {
    await rm(recordsDir, { recursive: true, force: true })
  }
})

test('a brief is stored in the run folder, passed as a brief file with the logo, and a rerun reads the same file', async () => {
  const { steps, runs, recordsDir } = await setup()
  try {
    const ctx = {
      runId: 'file-run',
      brief: { researchBrief: brief, logoFile: LOGO },
      normalized: {}
    }
    await steps.brand(ctx, { kit }, how(1))
    await steps.brand(ctx, { kit }, how(2))
    const [first, second] = runs.map((r) => r.argv)
    const file = first[first.indexOf('--brief-file') + 1]
    assert.ok(path.isAbsolute(file) && file.startsWith(recordsDir))
    assert.deepEqual(JSON.parse(runs[0].text), brief)
    assert.equal(second[second.indexOf('--brief-file') + 1], file)
    assert.equal(runs[1].text, runs[0].text)
    assert.equal(first.includes('--brief-revision'), false)
    assert.equal(first[first.indexOf('--logo-file') + 1], LOGO)
    assert.deepEqual(first.slice(0, 3), ['run', '--kit', kit.ref])
  } finally {
    await rm(recordsDir, { recursive: true, force: true })
  }
})

test('a brief without a logo file passes no logo flag', async () => {
  const { steps, runs, recordsDir } = await setup()
  try {
    await steps.brand({ runId: 'no-logo', brief: { researchBrief: brief } }, { kit }, how())
    assert.equal(runs[0].argv.includes('--logo-file'), false)
  } finally {
    await rm(recordsDir, { recursive: true, force: true })
  }
})

test('both inputs, or neither, are typed errors that are not run again and start no bench run', async () => {
  const { steps, runs, recordsDir } = await setup()
  try {
    const cases = [
      [{ researchRevisionId: 'rev-9', researchBrief: brief }, 'brand_input_ambiguous'],
      [{ researchRevisionId: 'rev-9', logoFile: 'x.png' }, 'brand_input_ambiguous'],
      [{}, 'brand_input_missing'],
      [{ logoFile: LOGO }, 'brand_input_missing'],
      [{ researchBrief: brief, logoFile: 'logos/x.png' }, 'brand_logo_path_relative']
    ]
    for (const [given, code] of cases)
      await assert.rejects(
        steps.brand({ runId: `bad-${code}`, brief: given }, { kit }, how()),
        (e) => e.code === code && e.noRerun === true
      )
    assert.deepEqual(runs, [])
  } finally {
    await rm(recordsDir, { recursive: true, force: true })
  }
})

test('a rerun given another brief than the one stored for its run is a coded error, never the old file', async () => {
  const { steps, runs, recordsDir } = await setup()
  try {
    const ctx = { runId: 'changed-run', brief: { researchBrief: brief }, normalized: {} }
    await steps.brand(ctx, { kit }, how(1))
    const changed = {
      ...ctx,
      brief: { researchBrief: { brand: { ...brief.brand, name: 'Harrow Lane Cakes' } } }
    }
    await assert.rejects(
      steps.brand(changed, { kit }, how(2)),
      (e) => e.code === 'brand_brief_changed' && e.noRerun === true
    )
    assert.equal(runs.length, 1, 'no bench run on a changed brief')
    await steps.brand(ctx, { kit }, how(2))
    assert.equal(runs.length, 2, 'the same brief is the normal rerun')
  } finally {
    await rm(recordsDir, { recursive: true, force: true })
  }
})
