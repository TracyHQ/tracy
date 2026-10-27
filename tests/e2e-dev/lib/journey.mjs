// The frame every journey file runs in: who the run is (from `run.mjs`), how a journey reports
// PASS / FAIL / BLOCKED, and where its evidence goes. Each journey writes one JSON file per CMS
// into `<runDir>/journeys/`; `report.mjs` assembles them.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ENV, RUN_ID } from './env.mjs'
import { Manifest } from './manifest.mjs'
import { redact } from './redact.mjs'

/** Thrown when a journey cannot be judged for a reason outside the mechanism under test. */
export class Blocked extends Error {
  /** @param {string} reason @param {string} [kind] - `model`, `mailbox`, `environment`, … */
  constructor(reason, kind = 'environment') {
    super(reason)
    this.name = 'Blocked'
    this.kind = kind
  }
}

/**
 * The run this process belongs to, as `run.mjs` handed it down through the environment.
 * @returns {{ runId: string, runDir: string, cms: string[], keep: boolean, full: boolean, manifest: Manifest }}
 */
export function runContext() {
  const runId = process.env.E2E_RUN_ID ?? ''
  const runDir = process.env.E2E_RUN_DIR ?? ''
  if (!RUN_ID.test(runId) || !runDir)
    throw new Error('journeys run under tests/e2e-dev/run.mjs (E2E_RUN_ID / E2E_RUN_DIR are not set)')
  const cms = (process.env.E2E_CMS ?? 'wordpress').split(',').filter(Boolean)
  return {
    runId,
    runDir,
    cms,
    keep: process.env.E2E_KEEP === '1',
    full: process.env.E2E_FULL === '1',
    manifest: Manifest.open(runDir)
  }
}

/**
 * Write one evidence file under `<runDir>/evidence/`, redacted.
 * @param {string} runDir
 * @param {string} name
 * @param {any} data
 */
export function writeEvidence(runDir, name, data) {
  const dir = join(runDir, 'evidence')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, name)
  writeFileSync(file, typeof data === 'string' ? redact(data) : `${JSON.stringify(redact(data), null, 2)}\n`)
  return file
}

/**
 * Run one journey (for one CMS, or none) and record its verdict.
 * @param {import('node:test').TestContext} t
 * @param {{ id: string, cms?: string | null, retries?: number }} spec
 * @param {(ctx: { attempt: number, details: Record<string, any>, notes: string[] }) => Promise<void>} fn
 *   Throws to FAIL, throws `Blocked` to BLOCK, returns to PASS. Writes what it measured into
 *   `details` as it goes, so a failure still carries everything measured before it.
 */
export async function journey(t, { id, cms = null, retries = 0 }, fn) {
  const { runDir } = runContext()
  const started = Date.now()
  /** @type {{ attempt: number, verdict: string, reason: string | null, ms: number, details: any, notes: string[] }[]} */
  const attempts = []
  let last
  for (let attempt = 0; attempt <= retries; attempt++) {
    const details = {}
    const notes = []
    const t0 = Date.now()
    try {
      await fn({ attempt, details, notes })
      last = { attempt, verdict: 'PASS', reason: null, ms: Date.now() - t0, details, notes }
    } catch (error) {
      const blocked = error instanceof Blocked
      last = {
        attempt,
        verdict: blocked ? 'BLOCKED' : 'FAIL',
        reason: `${blocked ? `[${error.kind}] ` : ''}${error instanceof Error ? error.message : String(error)}`,
        ms: Date.now() - t0,
        details,
        notes
      }
    }
    attempts.push(last)
    if (last.verdict !== 'FAIL') break
  }
  const result = {
    id,
    cms,
    verdict: last.verdict,
    reason: last.reason,
    retries: attempts.length - 1,
    startedAt: new Date(started).toISOString(),
    ms: Date.now() - started,
    origin: ENV.origin,
    attempts
  }
  const dir = join(runDir, 'journeys')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, `${id}${cms ? `-${cms}` : ''}.json`),
    `${JSON.stringify(redact(result), null, 2)}\n`
  )
  if (last.verdict === 'BLOCKED') t.skip(last.reason ?? 'blocked')
  else if (last.verdict === 'FAIL') throw new Error(`${id}${cms ? ` ${cms}` : ''}: ${last.reason}`)
}

/**
 * Assert, with the measured value in the message (the report shows only the message).
 * @param {unknown} ok
 * @param {string} what
 */
export function check(ok, what) {
  if (!ok) throw new Error(what)
}
