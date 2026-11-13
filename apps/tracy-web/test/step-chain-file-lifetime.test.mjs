// A chain run's files and its record outlive the run, with no flag (ADR 0047, decision 5; #591): parallel bench exports
// share one folder under the step records folder, and disposal writes the run's record beside them instead of deleting.
import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createStepChainSteps, STEP_RECORDS_FILE } from '../src/step-chain-steps.js'

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
