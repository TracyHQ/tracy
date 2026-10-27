// Runs tests/e2e-dev/run.mjs (the other engineer's J0–J13) unchanged against the local stand and
// reads what it wrote. The layer never judges the runner's exit code or its test counts: only the
// per-journey JSON records, each through classify.mjs.

import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { LAYER_DIR, REPO, exec, readJson, writeJsonAtomic } from '../util.mjs'
import { classifyJourney, worstOf } from './classify.mjs'

const RUNNER = path.join(REPO, 'tests/e2e-dev/run.mjs')
const REGISTER = pathToFileURL(path.join(LAYER_DIR, 'adapter/register.mjs')).href
const CMS_LETTER = { wordpress: 'w', joomla: 'j', emdash: 'e' }

/** Journeys the runner knows per CMS (its own table); the layer only needs the names here. */
const PER_CMS = new Set(['J2a', 'J2b', 'J2c', 'J3', 'J4a', 'J4b', 'J4c', 'J12'])

/**
 * @param {{ journeys: string[], cms?: string[], stand: { origin: string, siteDomain: string, containers: Record<string,string> },
 *   outDir: string, timeoutMs?: number, signal?: AbortSignal, runId?: string, runner?: string }} opts
 * @returns {Promise<{ byJourney: Map<string, { verdict: string, candidate: boolean, reason: string, evidence: string[], notes: string[] }>,
 *   runDir: string, exit: number | null, timedOut: boolean, problem: string | null, provenance: string }>}
 */
export async function runLegacy({
  journeys,
  cms = ['wordpress'],
  stand,
  outDir,
  timeoutMs = 3 * 3600_000,
  signal,
  runId,
  runner = RUNNER
}) {
  const dir = path.join(outDir, 'legacy')
  mkdirSync(dir, { recursive: true })
  const resultsRoot = path.join(dir, 'results')
  mkdirSync(resultsRoot, { recursive: true })
  const id = runId ?? `qa${Date.now().toString(36).slice(-6)}`
  const runDir = path.join(resultsRoot, id)
  const transportFile = path.join(dir, 'transport.json')
  const provenance = path.join(dir, 'provenance.jsonl')
  writeJsonAtomic(transportFile, {
    origin: stand.origin,
    siteDomain: stand.siteDomain,
    containers: stand.containers,
    resultsRoot
  })
  const letters = cms.map((c) => CMS_LETTER[c]).filter(Boolean)
  if (letters.length !== cms.length) throw new Error(`unknown cms in ${cms.join(',')}`)
  const unknown = journeys.filter((j) => !/^J\d+[a-c]?$/.test(j))
  if (unknown.length) throw new Error(`bad journey id(s): ${unknown.join(', ')}`)

  const nodeOptions = `${process.env.NODE_OPTIONS ?? ''} --import=${REGISTER}`.trim()
  const res = await exec(
    process.execPath,
    [runner, '--runId', id, '--cms', letters.join(','), '--only', journeys.join(',')],
    {
      cwd: REPO,
      env: {
        ...process.env,
        NODE_OPTIONS: nodeOptions,
        QA_FLOWS_TRANSPORT: transportFile,
        QA_FLOWS_PROVENANCE: provenance
      },
      timeoutMs,
      signal,
      maxBytes: 8 * 1024 * 1024
    }
  )
  const byJourney = new Map()
  let problem = res.error ?? null
  const journeysDir = path.join(runDir, 'journeys')
  for (const j of journeys) {
    const wanted = PER_CMS.has(j) ? cms : [null]
    const parts = []
    const evidence = []
    for (const c of wanted) {
      const file = path.join(journeysDir, `${j}${c ? `-${c}` : ''}.json`)
      let record = null
      let readError = null
      try {
        record = readJson(file)
      } catch (error) {
        readError = error.message
      }
      if (record === null)
        parts.push({
          verdict: 'PENDING',
          candidate: false,
          reason: `TEST_INVALID: no usable result for ${j}${c ? ` ${c}` : ''}: ${readError}${
            res.timedOut ? ' (the runner timed out)' : ''
          }`,
          notes: []
        })
      else {
        parts.push(classifyJourney(record, { journey: j, cms: c, keep: false }))
        evidence.push(path.relative(outDir, file))
      }
    }
    const worst = worstOf(parts)
    // A candidate needs every part to be one.
    const candidate = parts.every((p) => p.candidate)
    byJourney.set(j, {
      verdict: worst.verdict,
      candidate,
      reason: parts.length > 1 ? `${worst.reason} (worst of ${wanted.join(', ')})` : worst.reason,
      evidence: [
        ...evidence,
        ...(existsSync(path.join(runDir, 'report.json'))
          ? [path.relative(outDir, path.join(runDir, 'report.json'))]
          : [])
      ],
      notes: parts.flatMap((p) => p.notes)
    })
  }
  if (res.timedOut) problem = `legacy runner timed out after ${timeoutMs} ms`
  return { byJourney, runDir, exit: res.code, timedOut: res.timedOut, problem, provenance }
}

/** Journey ids with a record under a results folder (used by recovery checks and tests). */
export function recordedJourneys(runDir) {
  const dir = path.join(runDir, 'journeys')
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : []
}
