#!/usr/bin/env node
// The acceptance gate. Runs what a machine can measure (contract, preflight, distribution, browser
// matrix, routing audit) and validates the receipts of what a person or agent must witness
// (REVIEW_GATES). A gate without current evidence is `pending`, never `pass`; the report is `pass`
// only when every gate is pass or not-applicable. Run from the template directory.
//   node tools/qa.mjs --contract qa.contract.json --source <design-folder> --site <origin> --out <new-dir>
//        [--browser] [--artifact <packed-dir>] [--reviews <dir>] [--config template.config.json]
//        [--storage-state <private-json>]
//        [--visual [--source-site <origin>] [--source-dir <frames>] [--visual-stage a,b] [--visual-reuse <earlier qa-run>/visual]
//                  [--visual-all-stages] [--visual-fast-gate <fast-gate run>]]
//   --browser   collect the page × variant × state matrix (qa-browser.mjs) and run audit.mjs (routing)
//   --reuse     aggregate a previous run's observations + audit instead, only if that run's identity
//               (contractHash, artifactHash, origin) equals this one's — for re-signing receipts
//   --artifact  verify a directory produced by `distribution.mjs pack` against this source tree
//   --reviews   directory of <gate>.json receipts, each quoting this report's contractHash,
//               artifactHash and origin and listing evidence files by sha256
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { hash, contractHash, validateContract, casesFor, REVIEW_GATES, relativeFile } from './qa-contract.mjs'
import { manifestFor, verifyDistribution } from './distribution.mjs'
const execFileP = promisify(execFile)
const HERE = path.dirname(new URL(import.meta.url).pathname)

export const sourceArtifactHash = (root, c) => manifestFor(root, c).artifactHash
export function assessVisual(visual, contract) {
  const errors = []
  const sm = visual?.summary
  // A fast-gate or targeted run is a subset by construction: it can be clean, it can never be the gate.
  // The scope is read from the report itself, so a subset relabelled by hand is refused too.
  const scope = visual?.scope?.kind ?? 'full'
  if (scope !== 'full')
    errors.push(
      `scope ${scope}: a subset run never passes the visual gate — run the full scope (citing the fast gate with --fast-gate)`
    )
  if (!sm) errors.push('no visual summary')
  else {
    if (!sm.pages || !sm.axes) errors.push('no pages/axes measured')
    // Every stage the contract names must have run and passed, in the report of THIS run (a page's
    // evidence may be reused from an earlier run, a stage's verdict may not).
    for (const st of contract?.visual?.stages ?? []) {
      const got = (visual.stages ?? []).find((x) => x.id === st.id)
      if (!got) errors.push(`stage ${st.id}: not in the report`)
      else if (got.status !== 'pass')
        errors.push(`stage ${st.id}: ${got.status}${got.reason ? ` — ${got.reason}` : ''}`)
    }
    if (sm.findings) errors.push(`${sm.findings} finding(s)`)
    if (sm.unclassified) errors.push(`${sm.unclassified} unclassified element(s)`)
    for (const p of visual.pages ?? [])
      for (const f of p.findings ?? [])
        if (errors.length < 40)
          errors.push(
            `${p.id}/${f.axis}: ${f.kind}${f.element ? ' ' + f.element : ''}${f.rule ? ' ' + f.rule : ''}`
          )
  }
  return {
    status: errors.length ? 'fail' : 'pass',
    pages: sm?.pages,
    axes: sm?.axes,
    components: sm?.components,
    accepted: sm?.accepted ?? 0,
    reused: sm?.reused ?? 0,
    stages: visual?.stages?.map((s) => `${s.id}:${s.status}`),
    scope,
    fastGate: visual?.fastGate ?? null,
    errors
  }
}
export function assessAudit(audit) {
  const errors = []
  if (!audit?.summary?.complete) errors.push('crawl incomplete')
  for (const f of audit?.findings ?? []) errors.push(`${f.path}: ${f.issue}`)
  return {
    status: errors.length ? 'fail' : 'pass',
    pages: audit?.summary?.pages,
    assets: audit?.summary?.assets,
    errors
  }
}
// A previous run's browser observations and audit may be aggregated again only when they were
// measured on the same contract, the same artifact bytes and the same origin.
export function reusableRun(dir, identity) {
  const file = path.join(dir, 'observations.json')
  if (!existsSync(file)) throw new Error(`no observations.json in ${dir}`)
  const prior = JSON.parse(readFileSync(file, 'utf8'))
  for (const key of ['contractHash', 'artifactHash', 'origin'])
    if (prior.identity?.[key] !== identity[key])
      throw new Error(`cannot reuse ${dir}: ${key} differs (${prior.identity?.[key]} vs ${identity[key]})`)
  const audit = path.join(dir, 'audit', 'audit.json')
  return {
    observations: prior.observations,
    audit: existsSync(audit) ? JSON.parse(readFileSync(audit, 'utf8')) : null
  }
}
export function assessObservations(contract, observations) {
  const expected = casesFor(contract).map((c) => c.id),
    errors = []
  const ids = observations.map((o) => o.id)
  if (new Set(ids).size !== ids.length) errors.push('duplicate observations')
  if (JSON.stringify([...ids].sort()) !== JSON.stringify([...expected].sort()))
    errors.push('incomplete or unexpected case coverage')
  for (const o of observations) {
    if (
      o.status !== 'pass' ||
      !o.assertions?.length ||
      o.findings?.length ||
      o.assertions.some((a) => !a.pass)
    )
      errors.push(`case failed or empty: ${o.id}`)
  }
  return {
    status: errors.length ? 'fail' : 'pass',
    expected: expected.length,
    observed: observations.length,
    errors
  }
}
// visual-review has no signature to trust. The receipt names the final run of every stage; this
// re-reads those runs and holds them to five conditions (Lee, 2026-09-14): every stage closed in
// order with nothing open, every picture opened by each consumer, a clean confirmation round (no new
// notes, no machine finding), reviewers ≠ fixers, and the files unchanged since the receipt.
export function assessVisualReview(receipt, contract, identity) {
  const errors = []
  const v = receipt.visual
  if (!v?.stages) return ['visual-review receipt must name the final run of every stage (--visual-runs)']
  const read = (dir, rel) => JSON.parse(readFileSync(path.join(dir, rel), 'utf8'))
  let lastAt = 0
  for (const st of contract?.visual?.stages ?? []) {
    const entry = v.stages[st.id]
    if (!entry?.run) {
      errors.push(`stage ${st.id}: no run named`)
      continue
    }
    const dir = entry.run
    // 5. files unchanged since the receipt
    for (const [rel, sha] of Object.entries(entry.files ?? {})) {
      try {
        if (hash(readFileSync(path.join(dir, rel))) !== sha)
          errors.push(`stage ${st.id}: ${rel} changed since the receipt`)
      } catch {
        errors.push(`stage ${st.id}: ${rel} missing`)
      }
    }
    for (const need of ['index.json', 'visual.json', `NOTES-${st.id}.json`, 'notes/machine.json'])
      if (!(need in (entry.files ?? {}))) errors.push(`stage ${st.id}: receipt does not pin ${need}`)
    let visual, notes, index, machine
    try {
      visual = read(dir, 'visual.json')
      notes = read(dir, `NOTES-${st.id}.json`)
      index = read(dir, 'index.json')
      machine = read(dir, 'notes/machine.json')
    } catch (e) {
      errors.push(`stage ${st.id}: ${e.message}`)
      continue
    }
    // 1. the stage closed on this site, in order, with nothing open
    if (visual.site !== identity.origin)
      errors.push(`stage ${st.id}: run is for ${visual.site}, not ${identity.origin}`)
    if ((visual.scope?.kind ?? 'full') !== 'full')
      errors.push(
        `stage ${st.id}: run is scope ${visual.scope.kind}, not full — a fast gate is not the acceptance run`
      )
    const got = (visual.stages ?? []).find((x) => x.id === st.id)
    if (!got || got.status !== 'pass')
      errors.push(`stage ${st.id}: machine verdict ${got?.status ?? 'absent'}`)
    const at = Date.parse(visual.at)
    if (!(at > lastAt)) errors.push(`stage ${st.id}: run is not later than the previous stage's`)
    lastAt = at
    const c = notes.counts ?? {}
    for (const k of ['open', 'reopened', 'lee', 'leeFlagged'])
      if (c[k]) errors.push(`stage ${st.id}: ${c[k]} todo(s) ${k}`)
    // 2. every picture opened by each consumer
    if (notes.coverage?.missing?.length)
      errors.push(`stage ${st.id}: ${notes.coverage.missing.length} picture(s) not opened by a consumer`)
    const consumers = new Set(index.shots.filter((s) => s.stage === st.id).flatMap((s) => s.consumers))
    for (const lens of consumers)
      if (lens !== 'reviewer' && !(notes.lenses ?? []).includes(lens))
        errors.push(`stage ${st.id}: lens ${lens} never reported`)
    // 3. a clean confirmation round: the final run has no machine finding and no new note
    if (machine.length)
      errors.push(`stage ${st.id}: final run still has ${machine.length} machine finding(s)`)
    const fresh = (notes.todos ?? []).filter((t) => t.id.startsWith('N-') && t.status !== 'closed')
    if (fresh.length)
      errors.push(
        `stage ${st.id}: final run raised ${fresh.length} note(s) — a run with notes is not the last run`
      )
  }
  // 4. reviewers ≠ fixers
  const qa = new Set(v.agents?.qa ?? []),
    coding = v.agents?.coding ?? []
  if (!qa.size) errors.push('no QA agents named')
  for (const a of coding) if (qa.has(a)) errors.push(`agent ${a} both reviewed and fixed`)
  return errors
}
export function assessReceipt(gate, receipt, identity, evidenceRoot, contract) {
  const errors = []
  for (const key of ['contractHash', 'artifactHash', 'origin'])
    if (receipt[key] !== identity[key]) errors.push(`stale or wrong ${key}`)
  if (receipt.gate !== gate || receipt.status !== 'pass')
    errors.push('receipt does not report this gate passing')
  if (!receipt.reviewer || !receipt.method || !receipt.runtime || !receipt.cases?.length)
    errors.push('reviewer, method, runtime and cases required')
  if (gate === 'visual-review') {
    if (contract?.visual?.stages?.length) errors.push(...assessVisualReview(receipt, contract, identity))
    // Contracts without stages (older templates): the receipt must at least carry the visual pass.
    else
      for (const need of ['VISUAL.md', 'visual.json'])
        if (!(receipt.evidence ?? []).some((e) => typeof e.path === 'string' && e.path.endsWith(need)))
          errors.push(`visual-review receipt must include ${need} from tools/visual-qa.mjs`)
  }
  if (!Number.isFinite(Date.parse(receipt.capturedAt)) || Date.parse(receipt.capturedAt) > Date.now() + 60000)
    errors.push('invalid capture time')
  if (!Array.isArray(receipt.evidence) || !receipt.evidence.length) errors.push('evidence files required')
  for (const e of receipt.evidence ?? []) {
    if (!relativeFile(e.path)) {
      errors.push('unsafe evidence path')
      continue
    }
    try {
      if (hash(readFileSync(path.join(evidenceRoot, e.path))) !== e.sha256)
        errors.push(`changed evidence: ${e.path}`)
    } catch {
      errors.push(`missing evidence: ${e.path}`)
    }
  }
  return { status: errors.length ? 'fail' : 'pass', errors }
}
export async function main(args = process.argv.slice(2)) {
  const opt = (name) => {
    const i = args.indexOf(name)
    return i < 0 ? undefined : args[i + 1]
  }
  if (args.includes('--help')) {
    console.log(
      'qa.mjs --contract <json> --source <folder> --site <origin> --out <new-dir> [--browser] [--visual [--source-site <origin>] [--visual-scans a,b]] [--artifact <dir>] [--reviews <dir>] [--config template.config.json] [--storage-state <private-json>]'
    )
    return 0
  }
  const out = opt('--out'),
    source = opt('--source'),
    site = opt('--site')
  if (!out || existsSync(out) || !source || !site)
    throw new Error('Require a new output directory, explicit --source and --site')
  const contract = JSON.parse(readFileSync(opt('--contract') ?? 'qa.contract.json', 'utf8'))
  mkdirSync(out, { recursive: true })
  const gates = {},
    report = {
      schemaVersion: 1,
      startedAt: new Date().toISOString(),
      node: process.version,
      executable: process.execPath,
      origin: new URL(site).origin,
      contractHash: contractHash(contract),
      gates
    }
  const errors = validateContract(contract, source)
  gates.contracts = { status: errors.length ? 'fail' : 'pass', errors }
  if (!errors.length) {
    try {
      report.artifactHash = sourceArtifactHash(process.cwd(), contract)
      const artifact = opt('--artifact')
      if (!artifact)
        gates.distribution = {
          status: 'pending',
          reason:
            'Allowlist resolves; pass --artifact <dir> from `distribution.mjs pack` to verify the shipped bytes'
        }
      else {
        const v = verifyDistribution(artifact)
        const errors = [...v.errors]
        if (v.artifactHash !== report.artifactHash)
          errors.push(
            `artifact ${v.artifactHash} was not packed from this source tree (${report.artifactHash})`
          )
        gates.distribution = {
          status: errors.length ? 'fail' : 'pass',
          artifact: path.resolve(artifact),
          files: v.files,
          errors
        }
      }
    } catch (error) {
      gates.distribution = { status: 'fail', errors: [error.message] }
    }
    try {
      // Resolved from the tool's own location: tools/ lives inside the template, next to its node_modules.
      const require = createRequire(import.meta.url)
      const Database = require('better-sqlite3'),
        db = new Database(':memory:')
      const sqlite = db.prepare('select sqlite_version() as version').get()
      db.close()
      gates.preflight = { status: 'pass', node: process.version, abi: process.versions.modules, sqlite }
    } catch (error) {
      gates.preflight = { status: 'blocked', errors: [error.message] }
    }
    if (opt('--reuse')) {
      try {
        const prior = reusableRun(opt('--reuse'), {
          contractHash: report.contractHash,
          artifactHash: report.artifactHash,
          origin: report.origin
        })
        writeFileSync(
          path.join(out, 'observations.json'),
          JSON.stringify(
            {
              identity: {
                contractHash: report.contractHash,
                artifactHash: report.artifactHash,
                origin: report.origin
              },
              reusedFrom: path.resolve(opt('--reuse')),
              observations: prior.observations
            },
            null,
            2
          ) + '\n'
        )
        gates.browser = {
          ...assessObservations(contract, prior.observations),
          reusedFrom: path.resolve(opt('--reuse'))
        }
        gates.routing = prior.audit
          ? { ...assessAudit(prior.audit), reusedFrom: path.resolve(opt('--reuse')) }
          : { status: 'pending', reason: 'reused run has no audit' }
      } catch (error) {
        gates.browser = { status: 'fail', errors: [error.message] }
        gates.routing = { status: 'fail', errors: [error.message] }
      }
    } else if (args.includes('--browser')) {
      try {
        const { collectBrowser } = await import('./qa-browser.mjs')
        const observations = await collectBrowser(contract, site, path.join(out, 'browser'), {
          storageState: opt('--storage-state'),
          onCase: (o) =>
            console.log(
              `${o.status} ${o.id}${o.findings.length ? ` — ${o.findings.slice(0, 6).join(' | ')}` : ''}`
            )
        })
        writeFileSync(
          path.join(out, 'observations.json'),
          JSON.stringify(
            {
              identity: {
                contractHash: report.contractHash,
                artifactHash: report.artifactHash,
                origin: report.origin
              },
              observations
            },
            null,
            2
          ) + '\n'
        )
        gates.browser = assessObservations(contract, observations)
      } catch (error) {
        gates.browser = { status: 'blocked', errors: [error.message] }
      }
      const auditOut = path.join(out, 'audit')
      try {
        await execFileP(
          process.execPath,
          [
            path.join(HERE, 'audit.mjs'),
            site,
            auditOut,
            '--config',
            opt('--config') ?? 'template.config.json'
          ],
          { maxBuffer: 64 * 1024 * 1024 }
        ).catch((e) => {
          if (e.code !== 1) throw e
        })
        gates.routing = assessAudit(JSON.parse(readFileSync(path.join(auditOut, 'audit.json'), 'utf8')))
      } catch (error) {
        gates.routing = { status: 'blocked', errors: [error.message] }
      }
    } else {
      gates.browser = { status: 'pending', reason: 'No browser measurements requested' }
      gates.routing = { status: 'pending', reason: 'audit.mjs runs with --browser' }
    }
    // Visual pass (visual-qa.mjs): four axes, rules + coverage + parity + scanners + mega travel.
    if (opt('--reuse')) {
      const prior = path.join(opt('--reuse'), 'visual', 'visual.json')
      gates.visual = existsSync(prior)
        ? {
            ...assessVisual(JSON.parse(readFileSync(prior, 'utf8')), contract),
            reusedFrom: path.resolve(opt('--reuse'))
          }
        : { status: 'pending', reason: 'reused run has no visual pass' }
    } else if (args.includes('--visual')) {
      const visualOut = path.join(out, 'visual')
      try {
        const extra = []
        if (opt('--source-site')) extra.push('--source-site', opt('--source-site'))
        if (opt('--visual-scans')) extra.push('--scans', opt('--visual-scans'))
        if (opt('--visual-pages')) extra.push('--pages', opt('--visual-pages'))
        // Stage/reuse pass straight through: the gate still demands every stage clean (assessVisual).
        if (opt('--visual-stage')) extra.push('--stage', opt('--visual-stage'))
        if (opt('--visual-reuse')) extra.push('--reuse', opt('--visual-reuse'))
        if (opt('--visual-fast-gate')) extra.push('--fast-gate', opt('--visual-fast-gate'))
        if (opt('--source-dir')) extra.push('--source-dir', opt('--source-dir'))
        if (args.includes('--visual-all-stages')) extra.push('--all-stages')
        await execFileP(
          process.execPath,
          [
            path.join(HERE, 'visual-qa.mjs'),
            '--contract',
            opt('--contract') ?? 'qa.contract.json',
            '--site',
            site,
            '--out',
            visualOut,
            '--config',
            opt('--config') ?? 'template.config.json',
            ...extra
          ],
          { maxBuffer: 64 * 1024 * 1024 }
        ).catch((e) => {
          if (e.code !== 1) throw e
        })
        const visual = JSON.parse(readFileSync(path.join(visualOut, 'visual.json'), 'utf8'))
        gates.visual = assessVisual(visual, contract)
        if (opt('--visual-pages'))
          gates.visual = {
            ...gates.visual,
            status: gates.visual.status === 'pass' ? 'pending' : gates.visual.status,
            scope: `subset ${opt('--visual-pages')} — a subset never passes the gate`
          }
      } catch (error) {
        gates.visual = { status: 'blocked', errors: [error.message] }
      }
    } else gates.visual = { status: 'pending', reason: 'No visual pass requested (--visual)' }
    for (const gate of REVIEW_GATES) {
      const policy = contract.reviews[gate]
      if (policy.mode === 'not-applicable') {
        gates[gate] = { status: policy.mode, reason: policy.reason }
        continue
      }
      const dir = opt('--reviews'),
        file = dir && path.join(dir, `${gate}.json`)
      if (!file || !existsSync(file)) {
        gates[gate] = { status: 'pending', reason: 'Current acceptance receipt required' }
        continue
      }
      try {
        gates[gate] = assessReceipt(gate, JSON.parse(readFileSync(file, 'utf8')), report, dir, contract)
      } catch (error) {
        gates[gate] = { status: 'fail', errors: [error.message] }
      }
    }
  }
  report.status = Object.values(gates).some((g) => g.status === 'fail')
    ? 'fail'
    : Object.values(gates).some((g) => !['pass', 'not-applicable'].includes(g.status))
      ? 'pending'
      : 'pass'
  report.finishedAt = new Date().toISOString()
  writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  writeFileSync(
    path.join(out, 'REPORT.md'),
    `# Acceptance: ${report.status}\n\nOrigin: ${report.origin}\n\nContract: ${report.contractHash}\n\nArtifact inputs: ${report.artifactHash ?? 'unverified'}\n\n| Gate | Status | Detail |\n| --- | --- | --- |\n${Object.entries(
      gates
    )
      .map(
        ([name, g]) =>
          `| ${name} | ${g.status} | ${(g.errors?.join('; ') ?? g.reason ?? g.scope ?? '').replaceAll('|', '/').replaceAll('\n', ' ')} |`
      )
      .join('\n')}\n`
  )
  console.log(JSON.stringify({ status: report.status, report: path.join(out, 'report.json') }))
  return report.status === 'pass' ? 0 : 1
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.exitCode = await main()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
