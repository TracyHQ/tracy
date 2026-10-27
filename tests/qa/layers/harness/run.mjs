#!/usr/bin/env node
/**
 * Standalone entry of the harness layer.
 *
 *   node tests/qa/layers/harness/run.mjs [--area X] [--target local] [--prove-red] [--live-model] [--out DIR] [--case ID]
 *
 * Writes DIR/results.json and DIR/report.md. Exit 0: every requested case PASS · 1: any FAIL ·
 * 2: invalid usage or contract · 3: only ENV / PENDING remain (never a check passed).
 */
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { MAX_LAYER_FILE_BYTES, readBoundedJsonSync } from '../../lib/bounded-reader.mjs'

import {
  UsageError,
  assertManifests,
  checkOutDir,
  defaultOutDir,
  exitCodeOf,
  generatedFiles,
  listCases,
  run
} from './index.mjs'

const FLAGS = new Map([
  ['--area', true],
  ['--target', true],
  ['--out', true],
  ['--case', true],
  ['--cases-file', true],
  ['--jobs', true],
  ['--prove-red', false],
  ['--live-model', false]
])

export function parseArgs(argv) {
  const opts = {}
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if (!FLAGS.has(flag)) throw new UsageError(`unknown argument ${flag}`)
    if (FLAGS.get(flag)) {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('--')) throw new UsageError(`${flag} needs a value`)
      opts[flag.slice(2)] = value
      i += 1
    } else opts[flag.slice(2)] = true
  }
  return opts
}

async function main() {
  let opts
  try {
    opts = parseArgs(process.argv.slice(2))
    const target = opts.target ?? 'local'
    if (target !== 'local')
      throw new UsageError(
        `target "${target}" is refused: this layer runs against the local worktree only (--target local)`
      )
    let documents
    const outDir = checkOutDir(opts.out ?? defaultOutDir())
    let cases
    if (opts['cases-file'] !== undefined) {
      try {
        cases = readBoundedJsonSync(opts['cases-file'], { maxBytes: MAX_LAYER_FILE_BYTES })
      } catch (error) {
        throw new UsageError(`--cases-file ${opts['cases-file']} cannot be read as JSON: ${error.message}`)
      }
      assertManifests(cases, `--cases-file ${opts['cases-file']}`)
    } else {
      documents = await generatedFiles()
      cases = await listCases({ area: opts.area })
    }
    const jobs = opts.jobs === undefined ? undefined : Number(opts.jobs)
    if (jobs !== undefined && !(Number.isInteger(jobs) && jobs >= 1))
      throw new UsageError(`--jobs needs a positive integer, got ${opts.jobs}`)
    if (opts.case !== undefined) {
      cases = cases.filter((c) => c.id === opts.case)
      if (cases.length === 0) throw new UsageError(`no case ${opts.case}`)
    }
    const results = await run({
      cases,
      target,
      proveRed: opts['prove-red'] === true,
      outDir,
      liveModel: opts['live-model'] === true,
      documents,
      jobs
    })
    const count = (v) => results.filter((r) => r.verdict === v).length
    console.log(
      `harness: ${results.length} cases — PASS ${count('PASS')} FAIL ${count('FAIL')} ENV ${count('ENV')} PENDING ${count('PENDING')}; report: ${outDir}/report.md`
    )
    process.exitCode = exitCodeOf(results)
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`harness: ${error.message}`)
      process.exitCode = 2
      return
    }
    throw error
  }
}

// Importing this module (for parseArgs) must not run the CLI or end the importing process.
const isEntry =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
if (isEntry) {
  await main()
  // Open handles of the product code under test (docker stand-in children, timers) must not keep a finished run alive.
  process.exit(process.exitCode ?? 0)
}
