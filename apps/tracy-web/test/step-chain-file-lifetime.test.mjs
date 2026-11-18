// Parallel bench exports belong to one owned directory and must all disappear when that chain is disposed.
import assert from 'node:assert/strict'
import { access, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { createStepChainSteps } from '../src/step-chain-steps.js'

test('parallel brand and planner exports share one directory and disposal removes both', async () => {
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
    log: {}
  })
  const ctx = { runId: 'parallel-owned-files', brief: { researchRevisionId: 'revision' } }
  const opts = { signal: new AbortController().signal }
  try {
    const [brand, plan] = await Promise.all([
      steps.brand(ctx, { kit: { ref: 'test-kit' } }, opts),
      steps.plan(ctx, { kit: { ref: 'test-kit' } }, opts)
    ])
    await access(brand.value.file)
    await access(plan.value.file)
    await steps.dispose(ctx)
    for (const dir of exports.values()) await assert.rejects(access(dir), { code: 'ENOENT' })
    assert.equal(path.dirname(exports.get('brand')), path.dirname(exports.get('plan')))
  } finally {
    await steps.dispose(ctx)
    for (const dir of exports.values()) await rm(path.dirname(dir), { recursive: true, force: true })
  }
})
