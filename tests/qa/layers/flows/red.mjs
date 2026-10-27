// RED proof by recorded mutation of product code, in the stand's scratch copy of the tree.
//
// For one mutation (fixtures/flows/mutations.json): the same scenarios, the same assertions and
// the same fixtures run on the GREEN product (already done by the caller) and on a MUTANT — the
// web image rebuilt from the scratch copy with one exact source replacement, swapped into the one
// stand, then swapped back. Nothing about the test changes between the two runs.
//
// A case is RED-proven by a mutation only when, on the mutant, the scenario ran to its assertions
// (its positive controls held, so no import/boot/locator problem) AND every assertion the mutation
// names for that case is false. A mutant that does not apply, does not build, does not boot, or
// leaves the target assertion green proves nothing and the case stays PENDING.

import { lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { composeArgs } from './stand.mjs'
import { exec, nowIso, readJson, sha256, sleep } from './util.mjs'
import { readTextSync } from '../../lib/bounded-reader.mjs'

export class MutationNotApplicable extends Error {
  constructor(message) {
    super(message)
    this.name = 'MutationNotApplicable'
  }
}

/** Validate the mutation table: every row has what proveMutation needs. */
export function loadMutations(file) {
  const rows = readJson(file)
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`${file}: expected a non-empty array`)
  const ids = new Set()
  for (const m of rows) {
    for (const k of ['id', 'file', 'find', 'replace'])
      if (typeof m?.[k] !== 'string' || (k !== 'replace' && m[k] === ''))
        throw new Error(`${file}: mutation ${m?.id ?? '?'} lacks a string "${k}"`)
    if (ids.has(m.id)) throw new Error(`${file}: duplicate mutation id ${m.id}`)
    ids.add(m.id)
    if (path.isAbsolute(m.file) || m.file.split('/').includes('..'))
      throw new Error(`${file}: mutation ${m.id} path escapes the tree`)
    if (!Array.isArray(m.cases) || m.cases.length === 0)
      throw new Error(`${file}: mutation ${m.id} names no case`)
    for (const c of m.cases)
      if (typeof c?.scenario !== 'string' || typeof c?.assertion !== 'string')
        throw new Error(`${file}: mutation ${m.id} has a malformed case`)
    if (m.find === m.replace) throw new Error(`${file}: mutation ${m.id} changes nothing`)
  }
  return rows
}

/** Apply a mutation to source text: the find string must occur exactly once. */
export function mutate(text, m) {
  const count = text.split(m.find).length - 1
  if (count !== 1)
    throw new MutationNotApplicable(
      `${m.id}: "${m.find.slice(0, 60)}…" occurs ${count} time(s) in ${m.file} (need exactly 1)`
    )
  const out = text.replace(m.find, () => m.replace)
  if (out === text) throw new MutationNotApplicable(`${m.id}: the replacement changed nothing`)
  return out
}

/**
 * Decide, from the mutant's scenario results, which targets are red. Pure.
 * @param {{ scenario: string, assertion: string }[]} targets
 * @param {Map<string, { outcome: string, assertions: { name: string, ok: boolean }[] }>} mutantResults
 * @param {Map<string, { outcome: string, assertions: { name: string, ok: boolean }[] }>} greenResults
 */
export function judgeTargets(targets, mutantResults, greenResults) {
  return targets.map((t) => {
    const g = greenResults.get(t.scenario)
    const m = mutantResults.get(t.scenario)
    const greenOk = g?.assertions.find((x) => x.name === t.assertion)?.ok === true
    const found = m?.assertions.find((x) => x.name === t.assertion)
    const ranToAssertions = Boolean(m && m.assertions.length > 0 && found)
    const red = ranToAssertions && found.ok === false
    let why = 'red'
    if (!greenOk) why = 'the assertion was not green on the GREEN product'
    else if (!m) why = 'the scenario did not run on the mutant'
    else if (!ranToAssertions)
      why = `the scenario did not reach its assertions on the mutant (${m.outcome}) — a boot/control problem is not a red proof`
    else if (!red) why = 'the assertion stayed green on the mutant'
    return { ...t, greenOk, red: greenOk && red, why: greenOk && red ? 'red' : why }
  })
}

/**
 * Prove one mutation on the live stand.
 * @param {{ m: any, l: ReturnType<import('./stand.mjs').layout>, stand: any, outDir: string,
 *   runScenarios: (names: string[]) => Promise<Map<string, any>>, greenResults: Map<string, any>,
 *   hashes: Record<string,string>, run?: typeof exec, waitWebMs?: number }} opts
 */
export async function proveMutation({
  m,
  l,
  stand,
  outDir,
  runScenarios,
  greenResults,
  hashes,
  run = exec,
  waitWebMs = 180_000
}) {
  const logRel = path.join('red', `${m.id}.log`)
  const logFile = path.join(outDir, logRel)
  mkdirSync(path.dirname(logFile), { recursive: true })
  const lines = []
  const say = (s) => {
    lines.push(`${nowIso()} ${s}`)
  }
  const finish = (extra) => {
    const text = `${lines.join('\n')}\n`
    writeFileSync(logFile, text)
    return { id: m.id, log: logRel, logSha256: sha256(text), ...extra }
  }
  const target = path.join(l.src, m.file)
  let original
  try {
    original = readTextSync(target)
  } catch (error) {
    say(`cannot read ${m.file} in the scratch tree: ${error.message}`)
    return finish({ applied: false, targets: [], reason: `source missing: ${error.message}` })
  }
  let mutant
  try {
    mutant = mutate(original, m)
  } catch (error) {
    say(error.message)
    return finish({ applied: false, targets: [], reason: error.message })
  }
  const tag = `red-${m.id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)}`
  const image = `tchqa/web:${tag}`
  const evidence = {
    product: m.file,
    productSha256: sha256(original),
    mutantSha256: sha256(mutant),
    mutationSha256: sha256(JSON.stringify([m.find, m.replace])),
    ...hashes
  }
  say(`mutation ${m.id}: ${m.describes ?? ''}`)
  say(JSON.stringify(evidence))
  let built = false
  try {
    writeFileSync(target, mutant)
    const build = await run('docker', ['build', '-q', '-f', 'apps/tracy-web/Dockerfile', '-t', image, '.'], {
      cwd: l.src,
      timeoutMs: 1_200_000
    })
    say(
      `docker build ${image}: exit ${build.code}${build.code === 0 ? '' : ` — ${(build.stderr || build.error || '').slice(-400)}`}`
    )
    built = build.code === 0
  } finally {
    writeFileSync(target, original)
  }
  const sourceRestored = readTextSync(target) === original
  say(`product source restored byte for byte: ${sourceRestored}`)
  if (!built)
    return finish({
      applied: true,
      built: false,
      targets: [],
      reason: 'the mutant image did not build (not a red proof)',
      restored: sourceRestored,
      evidence
    })

  const compose = (extraEnv, args) =>
    run('docker', [...composeArgs(l), ...args], {
      cwd: l.src,
      env: { ...process.env, ...extraEnv },
      timeoutMs: 300_000
    })
  const up = await compose({ APP_IMAGE_TAG: tag }, ['up', '-d', '--no-deps', '--force-recreate', 'tracy-web'])
  say(`swap web → ${tag}: exit ${up.code}`)
  let targets = []
  let reason = null
  let greenBack = false
  try {
    const booted = up.code === 0 && (await waitForWeb(stand, waitWebMs))
    say(`mutant web answers /login: ${booted}`)
    if (!booted) reason = 'the mutant did not boot (not a red proof)'
    else {
      const names = [...new Set(m.cases.map((c) => c.scenario))]
      const mutantResults = await runScenarios(names)
      for (const [name, r] of mutantResults)
        say(`mutant ${name}: ${r.outcome} — ${r.reason}; ${JSON.stringify(r.assertions)}`)
      targets = judgeTargets(m.cases, mutantResults, greenResults)
      for (const t of targets) {
        say(`GREEN ${t.scenario}#${t.assertion}: ${t.greenOk ? 'ok' : 'not ok'}`)
        say(`${t.red ? 'RED' : 'NOT-RED'} ${t.scenario}#${t.assertion}${t.red ? '' : ` — ${t.why}`}`)
      }
    }
  } finally {
    const back = await compose({ APP_IMAGE_TAG: 'dev' }, [
      'up',
      '-d',
      '--no-deps',
      '--force-recreate',
      'tracy-web'
    ])
    const ok = back.code === 0 && (await waitForWeb(stand, waitWebMs))
    say(`swap back → dev: exit ${back.code}, web answers: ${ok}`)
    greenBack = ok
    await run('docker', ['image', 'rm', '-f', image], { timeoutMs: 60_000 })
    if (!ok) reason = `${reason ?? ''} the stand's web did not come back on the GREEN image`.trim()
  }
  return finish({
    applied: true,
    built: true,
    restored: sourceRestored && greenBack,
    targets,
    reason,
    evidence
  })
}

const HEX64 = /^[0-9a-f]{64}$/

/**
 * Check a proof against what was actually written, not against what the caller says: the log is a
 * regular file inside outDir whose hash is the recorded one, it names the GREEN-ok and RED line of
 * every assertion with the product/mutant/test/oracle/fixture hashes, and the stand came back GREEN.
 * @returns {{ ok: boolean, why: string }}
 */
export function verifyProof(proof, { outDir, scenario, assertions }) {
  if (!proof || proof.applied !== true) return { ok: false, why: 'the mutation was not applied exactly once' }
  if (proof.built !== true) return { ok: false, why: 'the mutant did not build' }
  if (proof.restored !== true)
    return { ok: false, why: 'the GREEN product was not restored (source or stand)' }
  if (typeof proof.log !== 'string' || proof.log === '') return { ok: false, why: 'no proof log recorded' }
  let text
  try {
    const root = realpathSync(outDir)
    const file = path.resolve(root, proof.log)
    if (!file.startsWith(root + path.sep))
      return { ok: false, why: 'proof log path leaves the output directory' }
    const st = lstatSync(file)
    if (!st.isFile()) return { ok: false, why: 'proof log is not a regular file' }
    if (!realpathSync(file).startsWith(root + path.sep))
      return { ok: false, why: 'proof log resolves outside the output directory' }
    text = readTextSync(file)
  } catch (error) {
    return { ok: false, why: `proof log unreadable: ${error.code ?? error.message}` }
  }
  if (sha256(text) !== proof.logSha256)
    return { ok: false, why: 'proof log does not match its recorded hash' }
  for (const k of [
    'productSha256',
    'mutantSha256',
    'mutationSha256',
    'testSha256',
    'oracleSha256',
    'fixtureSha256'
  ]) {
    const h = proof.evidence?.[k]
    if (!HEX64.test(h ?? '') || !text.includes(h)) return { ok: false, why: `proof log lacks the ${k}` }
  }
  if (proof.evidence.productSha256 === proof.evidence.mutantSha256)
    return { ok: false, why: 'the mutant is byte-identical to the product' }
  for (const a of assertions) {
    if (!text.includes(`GREEN ${scenario}#${a}: ok`)) return { ok: false, why: `no GREEN line for ${a}` }
    if (!new RegExp(`^\\S+ RED ${scenario}#${a}$`, 'm').test(text))
      return { ok: false, why: `no RED line for ${a}` }
  }
  if (!/product source restored byte for byte: true/.test(text))
    return { ok: false, why: 'the log does not record the restored source' }
  if (!/swap back → dev: exit 0, web answers: true/.test(text))
    return { ok: false, why: 'the log does not record the stand coming back on the GREEN image' }
  return { ok: true, why: 'verified' }
}

async function waitForWeb(stand, ms) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const r = await fetch(`${stand.origin}/login`, { signal: AbortSignal.timeout(5000) }).catch(() => null)
    if (r?.status === 200) return true
    await sleep(2000)
  }
  return false
}
