#!/usr/bin/env node
// Durable phase evidence for an EmDash port (modelled on the WordPress kit's scripts/checkpoint.mjs).
// A phase is complete only while (a) the evidence files recorded for it are byte-identical and (b) the
// inputs that phase consumes are byte-identical to what they were when it was recorded. A changed input
// invalidates every phase that reads it — and only those: a resumed run re-verifies what the change
// touched instead of silently skipping it, and does not redo phases the change cannot have touched.
// It records; it never measures. The gate of each phase is still the command SKILL.md names for it.
//
//   node tools/checkpoint.mjs init     <checkpoint.json> [--phases P0,P1,…] [--<input> <file> …]
//   node tools/checkpoint.mjs complete <checkpoint.json> <phase> <evidence-file> [<evidence-file> …]
//   node tools/checkpoint.mjs status   <checkpoint.json>
//   … [--json | --verbose]
//
// Phases: P0 … P8 with P4.5 and P4.6 between P4 and P5 (SKILL.md "Phases and gates"). Inputs (flag
// `--<name>` overrides the path), all paths relative to the checkpoint file, recorded at init — and
// which phase reads each, from the phase table and the tools each phase runs (references/tools.md):
//   inventory        inventory/source-inventory.json — P1 writes it (it hashes every source file, so a
//                    changed design changes it); P2 and P5 build from it, qa.mjs --source checks P7 against it
//   lockfile         pnpm-lock.yaml — the pins P0 settles; P3 builds from it; P7 measures, P8 ships it
//   config           template.config.json — identity and locales: compile-seed --config (P2), bootstrap,
//                    visual-qa/fast-gate --config (P3), bootstrap/seed-apply (P4), brand/locale (P4.6),
//                    pages (P5), qa.mjs --config (P7), artifact.mjs (P8)
//   site-model       seed/site-model.json — compile-seed's input (P2); content-api-gate reads it (P8)
//   seed             seed/seed.json — P2 writes it; every later building phase applies or measures it
//   content-api-map  seed/content-api-map.json — written with the content model (P2); content-api-gate (P8)
//   contract         qa.contract.json — the Fast Gate plan and verdict (P3), layouts[] added in P5 with
//                    `fast-gate plan --changed`, the acceptance run (P7) and the package allowlist (P8)
//   questions        seed/questions.json — P4.5; shipped and gated by release.mjs (P8)
//   personalize      seed/personalize.json — P4.5, brand.logoDark (P4.6); gated by release.mjs (P8)
// A missing input is recorded as absent; its later appearance is a change like any other. Staleness is
// per phase, from its own inputs and evidence; it does not cascade, and recording a phase again leaves
// the later records alone (each is judged by its own hashes). P3 hashes the WHOLE qa.contract.json, not
// the part the Fast Gate plan reads: the Fast Gate verdict itself is bound to contractHash() of the whole
// contract (fast-gate.mjs "stale: the contract changed since the run"), so any contract edit — P5 adding
// layouts[] included — does make the P3 verdict stale, and the phase record says so. A P5 contract edit
// therefore makes P3, P5 and P7/P8 (when recorded) stale and leaves P4, P4.5, P4.6 and P6 complete.
// Evidence must sit beside the checkpoint (the template dir, evidence/…); `complete` refuses a phase
// whose earlier phases are not complete (stale or never recorded); it clears nothing.
//
// Output: one line, `checkpoint <command>: complete=n/m next=<phase> [stale=<phase>(<why>)] -> <file>`;
// `--verbose` adds one line per phase; `--json` prints the complete state. Exit 0, or 2 on a usage error
// or a refused `complete`.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { summaryLine, takeVerbose } from './cli-output.mjs'

const PHASE_LIST = [
  ['P0', 'archaeology'],
  ['P1', 'inventory'],
  ['P2', 'content-model'],
  ['P3', 'runtime'],
  ['P4', 'importer'],
  ['P4.5', 'personalization'],
  ['P4.6', 'brand-and-pages'],
  ['P5', 'pages'],
  ['P6', 'skill'],
  ['P7', 'acceptance'],
  ['P8', 'package']
]
export const PHASES = PHASE_LIST.map(([id]) => id)
export const PHASE_NAMES = Object.fromEntries(PHASE_LIST)
export const DEFAULT_INPUTS = {
  inventory: 'inventory/source-inventory.json',
  lockfile: 'pnpm-lock.yaml',
  config: 'template.config.json',
  'site-model': 'seed/site-model.json',
  seed: 'seed/seed.json',
  'content-api-map': 'seed/content-api-map.json',
  contract: 'qa.contract.json',
  questions: 'seed/questions.json',
  personalize: 'seed/personalize.json'
}
// Which inputs each phase consumes (header above). P6 writes back what was proven and reads none of them.
export const PHASE_INPUTS = {
  P0: ['lockfile'],
  P1: ['inventory'],
  P2: ['inventory', 'config', 'site-model', 'seed', 'content-api-map'],
  P3: ['lockfile', 'config', 'seed', 'contract'],
  P4: ['config', 'seed'],
  'P4.5': ['seed', 'questions', 'personalize'],
  'P4.6': ['config', 'seed', 'personalize'],
  P5: ['inventory', 'config', 'seed', 'contract'],
  P6: [],
  P7: ['inventory', 'lockfile', 'config', 'seed', 'contract'],
  P8: ['lockfile', 'config', 'site-model', 'seed', 'content-api-map', 'contract', 'questions', 'personalize']
}

const sha = (file) => {
  try {
    return createHash('sha256').update(readFileSync(file)).digest('hex')
  } catch {
    return null
  }
}

function write(file, state) {
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' })
  renameSync(tmp, file)
}

/** Why a recorded phase no longer holds, or null when it does. */
function staleReason(state, file, phase) {
  const entry = state.completed[phase]
  if (!entry) return 'not recorded'
  const base = path.dirname(file)
  for (const e of entry.evidence)
    if (sha(path.resolve(base, e.path)) !== e.sha256) return `evidence ${e.path} changed`
  for (const [key, recorded] of Object.entries(entry.inputs ?? {}))
    if (sha(path.resolve(base, state.inputs[key] ?? DEFAULT_INPUTS[key])) !== recorded)
      return `input ${key} changed`
  return null
}

export function checkpoint(file, command, args = [], options = {}) {
  file = path.resolve(file)
  if (command === 'init') {
    if (existsSync(file)) throw new Error('checkpoint already exists; use status')
    const phases = options.phases ? options.phases.split(',').filter(Boolean) : PHASES
    if (
      !phases.length ||
      phases.some((p) => !PHASES.includes(p)) ||
      new Set(phases).size !== phases.length ||
      phases.join() !== PHASES.filter((p) => phases.includes(p)).join()
    )
      throw new Error(`--phases must be an ordered, unique subset of ${PHASES.join(',')}`)
    const inputs = {}
    for (const [key, dflt] of Object.entries(DEFAULT_INPUTS)) {
      const rel = path.relative(
        path.dirname(file),
        path.resolve(options[key] ?? path.join(path.dirname(file), dflt))
      )
      if (rel.startsWith('..') || path.isAbsolute(rel))
        throw new Error(`--${key} must sit beside the checkpoint`)
      inputs[key] = rel
    }
    write(file, { version: 1, kind: 'emdash-port', phases, inputs, completed: {} })
  }
  const state = JSON.parse(readFileSync(file, 'utf8'))
  if (state.version !== 1 || state.kind !== 'emdash-port' || !Array.isArray(state.phases))
    throw new Error('not an EmDash port checkpoint')
  if (command === 'complete') {
    const [phase, ...files] = args
    if (!state.phases.includes(phase) || !files.length)
      throw new Error('complete requires a planned phase and at least one evidence file')
    const earlier = state.phases.slice(0, state.phases.indexOf(phase))
    const open = earlier.find((p) => staleReason(state, file, p))
    if (open) throw new Error(`${open} is not complete (${staleReason(state, file, open)}); verify it first`)
    const evidence = files.map((p) => {
      const full = path.resolve(p),
        rel = path.relative(path.dirname(file), full)
      if (rel.startsWith('..') || path.isAbsolute(rel))
        throw new Error(`evidence ${p} must sit beside the checkpoint`)
      const digest = sha(full)
      if (!digest) throw new Error(`evidence ${p} is not a readable file`)
      return { path: rel, sha256: digest }
    })
    const inputs = Object.fromEntries(
      PHASE_INPUTS[phase].map((key) => [
        key,
        sha(path.resolve(path.dirname(file), state.inputs[key] ?? DEFAULT_INPUTS[key]))
      ])
    )
    state.completed[phase] = { at: new Date().toISOString(), evidence, inputs }
    write(file, state)
  } else if (!['init', 'status'].includes(command)) throw new Error('use init, complete or status')
  const phases = state.phases.map((phase) => {
    const why = staleReason(state, file, phase)
    return {
      phase,
      name: PHASE_NAMES[phase],
      status: why ? (state.completed[phase] ? 'stale' : 'open') : 'complete',
      reason: why,
      at: state.completed[phase]?.at ?? null
    }
  })
  return {
    file,
    phases,
    inputs: state.inputs,
    next: phases.find((p) => p.status !== 'complete')?.phase ?? null,
    note: 'Hashes prove evidence and inputs are unchanged; recheck the live site before resuming.'
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2)
  const verbose = takeVerbose(argv)
  const json = argv.includes('--json')
  const options = {}
  const rest = []
  for (let i = 0; i < argv.length; i++) {
    const m = new RegExp(`^--(phases|${Object.keys(DEFAULT_INPUTS).join('|')})$`).exec(argv[i])
    if (m) options[m[1]] = argv[++i]
    else if (argv[i] !== '--json') rest.push(argv[i])
  }
  const [command, file, ...args] = rest
  try {
    if (!command || !file)
      throw new Error('usage: checkpoint.mjs init|complete|status <checkpoint.json> … [--json|--verbose]')
    const result = checkpoint(file, command, args, options)
    if (json) console.log(JSON.stringify(result, null, 2))
    else {
      if (verbose)
        for (const p of result.phases)
          console.log(`${p.phase} | ${p.name} | ${p.status}${p.reason ? ` | ${p.reason}` : ''}`)
      const done = result.phases.filter((p) => p.status === 'complete').length
      const stale = result.phases.find((p) => p.status === 'stale')
      console.log(
        summaryLine(
          'checkpoint',
          command,
          `complete=${done}/${result.phases.length} next=${result.next ?? 'none'}${stale ? ` stale=${stale.phase}(${stale.reason})` : ''}`,
          result.file
        )
      )
    }
  } catch (e) {
    console.error(e.message)
    process.exitCode = 2
  }
}
