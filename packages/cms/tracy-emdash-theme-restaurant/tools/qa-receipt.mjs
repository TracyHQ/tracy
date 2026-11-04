#!/usr/bin/env node
// Write an acceptance receipt for a review gate, binding it to the identity of a qa.mjs report and
// hashing its evidence files, so qa.mjs can later refuse it once the contract, artifact or origin
// moves. The reviewer still decides `pass`; this only records what was reviewed, where, and with what.
//   node tools/qa-receipt.mjs <gate> --report <run>/report.json --out <reviews-dir> --reviewer <who>
//        --method "<how it was checked>" --cases <id,id,…> --evidence <file>[,<file>…] [--status pass|fail]
//        [--note "<limits, accepted gaps>"] [--visual-runs stage=<dir>,…] [--qa-agents a,b] [--coding-agents c]
// Evidence files are copied next to the receipt (relative paths, no `..`) and hashed after the copy.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { hash, REVIEW_GATES } from './qa-contract.mjs'

export function buildReceipt({
  gate,
  report,
  reviewer,
  method,
  cases,
  evidence,
  status = 'pass',
  note,
  visual,
  runtime = process.version,
  capturedAt = new Date().toISOString()
}) {
  if (!REVIEW_GATES.includes(gate))
    throw new Error(`unknown review gate ${gate}; one of ${REVIEW_GATES.join(', ')}`)
  for (const key of ['contractHash', 'artifactHash', 'origin'])
    if (!report?.[key]) throw new Error(`report lacks ${key}; run qa.mjs on a valid contract first`)
  if (!reviewer || !method || !cases?.length || !evidence?.length)
    throw new Error('reviewer, method, cases and evidence are required')
  return {
    gate,
    status,
    contractHash: report.contractHash,
    artifactHash: report.artifactHash,
    origin: report.origin,
    reviewer,
    method,
    runtime,
    capturedAt,
    cases,
    ...(note ? { note } : {}),
    ...(visual ? { visual } : {}),
    evidence
  }
}
// visual-review is not signed by a person: the receipt names the final run of every stage and the
// agents that reviewed / fixed, and pins the files qa.mjs re-checks (index.json, NOTES, notes/*,
// visual.json) by hash — the conditions themselves are evaluated by qa.mjs from those files.
export function visualRuns(runs, agents) {
  const stages = {}
  for (const [stage, dir] of Object.entries(runs)) {
    const files = {}
    const want = ['index.json', 'visual.json', `NOTES-${stage}.json`, `NOTES-${stage}.md`]
    const notes = path.join(dir, 'notes')
    if (existsSync(notes)) for (const f of readdirSync(notes)) want.push(`notes/${f}`)
    for (const rel of want) {
      const p = path.join(dir, rel)
      if (existsSync(p)) files[rel] = hash(readFileSync(p))
    }
    stages[stage] = { run: dir, files }
  }
  return { stages, agents: { qa: agents?.qa ?? [], coding: agents?.coding ?? [] } }
}
export function writeReceipt(outDir, args) {
  mkdirSync(outDir, { recursive: true })
  // Evidence goes under <out>/<gate>/ so a file named like the receipt (editability.json next to
  // editability.json) cannot overwrite it — that collision silently invalidated a receipt once.
  mkdirSync(path.join(outDir, args.gate), { recursive: true })
  const evidence = args.evidenceFiles.map((file) => {
    const rel = `${args.gate}/${path.basename(file)}`
    const dest = path.join(outDir, rel)
    if (path.resolve(file) !== path.resolve(dest)) copyFileSync(file, dest)
    return { path: rel, sha256: hash(readFileSync(dest)) }
  })
  const receipt = buildReceipt({ ...args, evidence })
  const file = path.join(outDir, `${args.gate}.json`)
  writeFileSync(file, JSON.stringify(receipt, null, 2) + '\n')
  return { file, receipt }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2)
    const opt = (n) => {
      const i = args.indexOf(n)
      return i < 0 ? undefined : args[i + 1]
    }
    const gate = args[0]
    if (!gate || !opt('--report') || !opt('--out'))
      throw new Error(
        'usage: qa-receipt.mjs <gate> --report <report.json> --out <dir> --reviewer <who> --method <how> --cases <a,b> --evidence <f1,f2> [--status pass|fail] [--note text]'
      )
    if (!existsSync(opt('--report'))) throw new Error(`no report at ${opt('--report')}`)
    const { file, receipt } = writeReceipt(opt('--out'), {
      gate,
      report: JSON.parse(readFileSync(opt('--report'), 'utf8')),
      reviewer: opt('--reviewer'),
      method: opt('--method'),
      cases: (opt('--cases') ?? '').split(',').filter(Boolean),
      evidenceFiles: (opt('--evidence') ?? '').split(',').filter(Boolean),
      status: opt('--status') ?? 'pass',
      note: opt('--note'),
      // --visual-runs light-desktop=<dir>,light-responsive=<dir>,… --qa-agents a,b --coding-agents c
      visual: opt('--visual-runs')
        ? visualRuns(
            Object.fromEntries(
              opt('--visual-runs')
                .split(',')
                .map((kv) => kv.split('='))
            ),
            {
              qa: (opt('--qa-agents') ?? '').split(',').filter(Boolean),
              coding: (opt('--coding-agents') ?? '').split(',').filter(Boolean)
            }
          )
        : undefined
    })
    console.log(
      JSON.stringify({ file, gate: receipt.gate, status: receipt.status, evidence: receipt.evidence.length })
    )
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
