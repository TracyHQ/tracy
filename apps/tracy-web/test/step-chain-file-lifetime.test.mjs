// A chain run's files and its record outlive the run, with no flag (ADR 0047, decision 5; #591): parallel bench exports
// share one folder under the step records folder, and disposal writes the run's record beside them instead of deleting.
import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createStepChainSteps, recordsDirWarning, STEP_RECORDS_FILE } from '../src/step-chain-steps.js'

test('parallel brand and planner exports share one run folder, and disposal keeps them with the record', async () => {
  const recordsDir = await mkdtemp(path.join(tmpdir(), 'step-chain-records-test-'))
  const exports = new Map()
  const cli = (name) => async (argv, io) => {
    if (argv[0] === 'run') io.out(`${name}-run`)
    else if (argv[0] === 'get') {
      const dir = argv[argv.indexOf('--out') + 1]
      exports.set(name, dir)
      await writeFile(path.join(dir, name === 'brand' ? 'brand-file.json' : 'bench-export.json'), '{}')
    } else throw new Error(`Unexpected bench command ${argv[0]}`)
    return 0
  }
  const steps = createStepChainSteps({
    config: {},
    pool: {
      async query(sql) {
        return {
          rows: sql.includes('site_planner_round')
            ? [{ plan: { pages: [] } }]
            : [{ status: 'succeeded', cost_usd: 0 }]
        }
      }
    },
    benchCli: { brand: cli('brand'), plan: cli('plan') },
    recordsDir,
    log: {}
  })
  const ctx = { runId: 'parallel-owned-files', brief: { researchRevisionId: 'revision' } }
  const opts = { signal: new AbortController().signal }
  try {
    const [brand, plan] = await Promise.all([
      steps.brand(ctx, { kit: { ref: 'test-kit' } }, opts),
      steps.plan(ctx, { kit: { ref: 'test-kit' } }, opts)
    ])
    assert.equal(path.dirname(exports.get('brand')), path.dirname(exports.get('plan')))
    const runDir = path.dirname(exports.get('brand'))
    assert.equal(path.dirname(runDir), recordsDir, 'the run folder is under the step records folder')
    const chain = {
      ending: 'complete',
      steps: [{ step: 'brand', attempt: 1, outcome: 'done', usd: 0, minutes: 0 }]
    }
    await steps.dispose({ runId: ctx.runId, chain })
    await access(brand.value.file)
    await access(plan.value.file)
    const kept = JSON.parse(await readFile(path.join(runDir, STEP_RECORDS_FILE), 'utf8'))
    assert.deepEqual(kept, { runId: ctx.runId, chain })
  } finally {
    await rm(recordsDir, { recursive: true, force: true })
  }
})

test('a run that stopped before any step made a file still keeps its record', async () => {
  const recordsDir = await mkdtemp(path.join(tmpdir(), 'step-chain-records-test-'))
  const steps = createStepChainSteps({ config: {}, pool: {}, recordsDir, log: {} })
  try {
    const chain = { ending: 'stopped', failedStep: 'doors', steps: [] }
    await steps.dispose({ runId: 'stopped-before-work', chain })
    const kept = JSON.parse(
      await readFile(path.join(recordsDir, 'run-stopped-before-work', STEP_RECORDS_FILE), 'utf8')
    )
    assert.equal(kept.chain.failedStep, 'doors')
  } finally {
    await rm(recordsDir, { recursive: true, force: true })
  }
})

test('a re-run writes into its own folder, so the files of the failed attempt stay as they were', async () => {
  const recordsDir = await mkdtemp(path.join(tmpdir(), 'step-chain-records-test-'))
  const exports = []
  const cli = async (argv, io) => {
    if (argv[0] === 'run') io.out('copy-run')
    else if (argv[0] === 'get') {
      const dir = argv[argv.indexOf('--out') + 1]
      exports.push(dir)
      await writeFile(path.join(dir, 'site-copy.json'), JSON.stringify({ attempt: exports.length }))
    }
    return 0
  }
  const steps = createStepChainSteps({
    config: {},
    pool: { query: async () => ({ rows: [{ status: 'succeeded', cost_usd: 0 }] }) },
    benchCli: { copy: cli },
    recordsDir,
    log: {}
  })
  const ctx = { runId: 'own-attempt-folders', brief: { researchRevisionId: 'revision' } }
  const inputs = { kit: { ref: 'test-kit' }, plan: { file: 'plan.json' } }
  const signal = new AbortController().signal
  try {
    const first = await steps.copy(ctx, inputs, { signal, attempt: 1 })
    const second = await steps.copy(ctx, inputs, { signal, attempt: 2 })
    assert.notEqual(first.value.file, second.value.file)
    assert.equal(path.basename(path.dirname(first.value.file)), 'copy')
    assert.equal(path.basename(path.dirname(second.value.file)), 'copy-attempt-2')
    assert.deepEqual(JSON.parse(await readFile(first.value.file, 'utf8')), { attempt: 1 })
    assert.deepEqual(JSON.parse(await readFile(second.value.file, 'utf8')), { attempt: 2 })
  } finally {
    await rm(recordsDir, { recursive: true, force: true })
  }
})

test('a record that cannot be written is logged loudly and fails the disposal, never silently', async () => {
  const recordsDir = await mkdtemp(path.join(tmpdir(), 'step-chain-records-test-'))
  const errors = []
  const steps = createStepChainSteps({
    config: {},
    pool: {},
    recordsDir,
    log: { error: (line) => errors.push(line) }
  })
  try {
    // The record's file name is taken by a folder: the write fails.
    const { mkdir } = await import('node:fs/promises')
    await mkdir(path.join(recordsDir, 'run-unwritable', STEP_RECORDS_FILE), { recursive: true })
    await assert.rejects(steps.dispose({ runId: 'unwritable', chain: { ending: 'stopped', steps: [] } }))
    assert.equal(errors.length, 1)
    assert.match(errors[0], /run unwritable: the run record could not be written/)
  } finally {
    await rm(recordsDir, { recursive: true, force: true })
  }
})

test('records in the temporary folder are warned about once at startup; a set folder is not', () => {
  const warned = []
  const log = { warn: (line) => warned.push(line) }
  const was = process.env.TRACY_STEP_CHAIN_RECORDS_DIR
  try {
    delete process.env.TRACY_STEP_CHAIN_RECORDS_DIR
    createStepChainSteps({ config: {}, pool: {}, log })
    assert.equal(warned.length, 1)
    assert.match(warned[0], /TRACY_STEP_CHAIN_RECORDS_DIR is not set/)
    assert.equal(recordsDirWarning({ TRACY_STEP_CHAIN_RECORDS_DIR: '/data/step-chain-records' }), null)
    process.env.TRACY_STEP_CHAIN_RECORDS_DIR = path.join(tmpdir(), 'step-chain-records-set')
    createStepChainSteps({ config: {}, pool: {}, log })
    assert.equal(warned.length, 1)
  } finally {
    if (was === undefined) delete process.env.TRACY_STEP_CHAIN_RECORDS_DIR
    else process.env.TRACY_STEP_CHAIN_RECORDS_DIR = was
  }
})
