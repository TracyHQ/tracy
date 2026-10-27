/**
 * The `unit` QA layer. Two kinds of executable case:
 *  - area suites: the existing `node --test` files of one app/package (the same file list and flags as
 *    `test:workers` / `test:interop`), judged by exit code AND the TAP summary;
 *  - regression cases: the deterministic `run` of a `tests/regression/cases/*.json` case, one QA case
 *    each, with the legacy REG id kept in `legacyIds`.
 *
 * Verdicts. FAIL: a test is red while its prerequisites are healthy. ENV: a prerequisite is proven
 * missing by a probe written to `probes.json`. PENDING: not run, invalid (no TAP, zero tests, skip,
 * todo), or green without RED proof. PASS: green AND the same assertion goes red on the case's own
 * pre-fix source (regression cases only). An area suite is never PASS: nothing proves its assertions
 * can fail, so a green suite is reported PENDING with its counts.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tapVerdict } from '../../../regression/script.mjs'
import {
  atomicWrite,
  buildOverlay,
  loadManifests,
  parseTap,
  registerScratch,
  removeScratch,
  REPO,
  result,
  runChild,
  targetPolicy
} from '../static/lib/common.mjs'
import { LOAD_FAILURE, proveRegressionRed } from './lib/redproof.mjs'
import { readTextSync } from '../../lib/bounded-reader.mjs'
import { createOwnedScratch, SOCKET_NAME_ROOM, SOCKET_PATH_BYTES } from '../../lib/fsafe.mjs'

export const layer = 'unit'
const HERE = fileURLToPath(new URL('.', import.meta.url))

/** @returns {object} the real paths and environment this layer works on; selftests pass their own. */
export function defaultContext() {
  return {
    root: REPO,
    casesDir: join(HERE, 'cases'),
    heavyDirs: ['tasks/evidence', 'packages/cms', 'vendor'],
    env: process.env,
    cdpUrl: 'http://127.0.0.1:9222/json/version'
  }
}

/**
 * @param {{area?: string}} o - `--area <path|name|group|regression|owner:<layer>>`; omitted means all.
 * @param {object} [ctx] - context.
 * @returns {Promise<object[]>} manifests.
 */
export async function listCases({ area } = {}, ctx = defaultContext()) {
  const all = loadManifests(ctx.casesDir, layer)
  if (area === undefined || area === 'all') return all
  return all.filter((c) => c.id === area || (c.areas ?? [c.area]).includes(area))
}

/**
 * The prerequisite probes, evaluated lazily and recorded.
 * @param {object} ctx - context.
 * @param {object[]} log - every probe result, written to probes.json.
 * @returns {{postgres: Function, stand: Function, chrome: Function, nodeModules: Function}} probe functions.
 */
function probes(ctx, log) {
  const memo = new Map()
  const once = (key, fn) => {
    if (!memo.has(key)) {
      const value = fn()
      memo.set(key, value)
    }
    return memo.get(key)
  }
  const record = (probe, ok, detail) => {
    log.push({ probe, ok, detail })
    return { ok, detail }
  }
  return {
    postgres: () =>
      once('postgres', () =>
        ctx.env.TEST_DATABASE_URL
          ? record(
              'postgres',
              false,
              'TEST_DATABASE_URL is set but this adapter never uses an inherited database URL (no lease of its own)'
            )
          : record('postgres', false, 'TEST_DATABASE_URL is not set')
      ),
    stand: () =>
      once('stand', () =>
        ctx.env.QA_STAND_URL
          ? record('stand', true, `QA_STAND_URL=${ctx.env.QA_STAND_URL}`)
          : record('stand', false, 'QA_STAND_URL is not set')
      ),
    chrome: () => {
      if (!memo.has('chrome'))
        memo.set(
          'chrome',
          fetch(ctx.cdpUrl, { signal: AbortSignal.timeout(3000) }).then(
            (res) => record('chrome', res.ok, `GET ${ctx.cdpUrl} -> ${res.status}`),
            (error) => record('chrome', false, `GET ${ctx.cdpUrl} failed: ${error.message}`)
          )
        )
      return memo.get('chrome')
    },
    nodeModules: (dir) =>
      once(`nm:${dir}`, () =>
        record(
          `node_modules:${dir}`,
          existsSync(join(ctx.root, dir, 'node_modules')),
          `existsSync(${dir}/node_modules)`
        )
      )
  }
}

/** @returns {Record<string, string | undefined>} child environment: no inherited database URL. */
function childEnv(ctx, extra = {}) {
  const env = { ...ctx.env, ...extra }
  delete env.TEST_DATABASE_URL
  delete env.NODE_TEST_CONTEXT
  return env
}

/** Longest TMPDIR that still leaves room for a socket file name under the unix socket path limit. */
export const MAX_TMPDIR = SOCKET_PATH_BYTES - SOCKET_NAME_ROOM

/**
 * Make every container start by a command fail loudly and leave a mark: a `docker` shim first on PATH and
 * a client socket that does not exist. The adapter owns no container, and no reading of test sources can
 * prove a suite never starts one, so the run itself is fenced instead.
 * @returns {{env: Record<string, string>, marker: string}} environment additions and the file the shim writes.
 */
export function dockerFence(ctx, outDir, id) {
  const bin = join(outDir, 'docker-shim')
  const shim = join(bin, 'docker')
  if (!existsSync(shim)) {
    mkdirSync(bin, { recursive: true })
    writeFileSync(
      shim,
      '#!/bin/sh\necho "docker $*" >> "$QA_DOCKER_REFUSED"\necho "docker refused: the QA adapter owns no container" >&2\nexit 125\n',
      { mode: 0o755 }
    )
  }
  mkdirSync(join(outDir, 'logs'), { recursive: true })
  const marker = join(outDir, 'logs', `${id}.docker-refused`)
  // Data a suite writes through TRACY_TEST_ARTIFACT_DIR stays in the run's output. TMPDIR is a short directory of
  // its own: suites put unix sockets there, and a socket path over ~100 bytes cannot be bound.
  const data = join(outDir, 'tmp', id)
  mkdirSync(data, { recursive: true })
  const scratch = createOwnedScratch(id, 'socket')
  const tmp = scratch.path
  return {
    marker,
    tmp,
    data,
    /**
     * Remove both directories. Never throws; returns what could not be removed, and the caller turns a
     * non-empty list into TEST_INVALID (a run that leaves scratch behind is not finished).
     * @returns {string[]} one line per directory left behind.
     */
    dispose() {
      const failed = []
      const own = scratch.dispose()
      if (!own.ok) failed.push(own.error)
      try {
        rmSync(data, { recursive: true, force: true })
      } catch (e) {
        failed.push(`${data}: ${e.message}`)
      }
      return failed
    },
    env: {
      TMPDIR: tmp,
      TRACY_TEST_ARTIFACT_DIR: data,
      PATH: `${bin}:${ctx.env.PATH ?? process.env.PATH ?? ''}`,
      DOCKER_HOST: 'unix:///nonexistent/qa-refused.sock',
      QA_DOCKER_REFUSED: marker
    }
  }
}

/**
 * What a machine can lack, as the product's own failure text shows it. A red run is ENV only when
 * every red test's own block carries the signature AND the probe confirms the machine lacks the thing;
 * otherwise it stays a product FAIL.
 */
const phpAbsent = (ctx) =>
  spawnSync('php', ['--version'], { encoding: 'utf8', timeout: 10000, env: ctx.env }).error?.code ===
    'ENOENT' &&
  // PHP tests also run in a container; with a reachable daemon the lack of `php` alone explains nothing.
  spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
    encoding: 'utf8',
    timeout: 20000,
    env: ctx.env
  }).status !== 0
const PHP_MISSING = 'PHP (no `php` on PATH and no reachable docker daemon)'
const ENV_SIGNATURES = [
  { re: /PHP tests cannot run on CI: this host has neither `php`/, missing: PHP_MISSING, absent: phpAbsent },
  {
    re: /extract\(\) got an unexpected keyword argument 'filter'/,
    missing: 'Python with tarfile extraction filters (3.12+, or a 3.9-3.11 security backport)',
    absent: (ctx) =>
      spawnSync(
        'python3',
        ['-c', 'import sys, tarfile; sys.exit(0 if hasattr(tarfile, "data_filter") else 1)'],
        {
          encoding: 'utf8',
          timeout: 20000,
          env: ctx.env
        }
      ).status === 1
  }
]

/** @returns {string[]} the output block of each red test (its `not ok` line to the next test line). */
function redBlocks(text) {
  const blocks = []
  let cur = null
  for (const line of text.split('\n')) {
    if (/^\s*(?:not ok|ok) \d+ - /.test(line)) {
      if (cur !== null) blocks.push(cur)
      cur = /^\s*not ok /.test(line) && !/\s#\s*(?:SKIP|TODO)\b/i.test(line) ? [line] : null
    } else if (cur !== null) cur.push(line)
  }
  if (cur !== null) blocks.push(cur)
  // A parent that only reports its children's failure is not a red of its own.
  return blocks.map((b) => b.join('\n')).filter((b) => !/failureType: 'subtestsFailed'/.test(b))
}

/** @returns {string | null} the missing thing when every red test is explained by one probed machine gap. */
function envCause(text, tap, ctx) {
  if (!tap?.valid || tap.fail === 0) return null
  const blocks = redBlocks(text)
  if (blocks.length === 0) return null
  for (const sig of ENV_SIGNATURES)
    if (blocks.every((b) => sig.re.test(b)) && sig.absent(ctx)) return sig.missing
  return null
}

/**
 * Judge a finished run on the real tree.
 * @returns {{verdict: string, reason: string, observed?: object} | null} a verdict, or null when green and clean.
 */
function judgeRun(manifest, child, text, p, ctx) {
  if (child.spawnFailed)
    return { verdict: 'ENV', reason: `command could not start: ${child.tail.trim().split('\n').pop()}` }
  if (child.timedOut) return { verdict: 'FAIL', reason: `timed out after ${manifest.timeoutS}s` }
  const isTap = manifest.command.includes('--test-reporter=tap')
  if (child.status !== 0) {
    if (LOAD_FAILURE.test(text))
      return {
        verdict: 'PENDING',
        reason:
          'TEST_INVALID: the run could not load code (module missing); environment suspected, not a product assertion'
      }
    const tap = isTap ? parseTap(text) : null
    const missing = envCause(text, tap, ctx)
    const counts = tap?.valid
      ? {
          observed: {
            tests: tap.tests,
            pass: tap.pass,
            fail: tap.fail,
            skipped: tap.skipped,
            todo: tap.todo,
            cancelled: tap.cancelled
          }
        }
      : {}
    if (missing)
      return {
        verdict: 'ENV',
        reason: `exit ${child.status}: ${tap.fail} of ${tap.tests} tests red, all from one gap on this machine: ${missing}`,
        ...counts
      }
    return {
      verdict: 'FAIL',
      reason: `exit ${child.status ?? child.signal}${tap?.valid ? `: ${tap.fail} failed of ${tap.tests}` : ''}; first red: ${(tap?.notOk[0] ?? text.trim().split('\n').slice(-2).join(' / ')).slice(0, 200)}`,
      ...counts
    }
  }
  if (isTap) {
    const tap = parseTap(text)
    if (!tap.valid) return { verdict: 'PENDING', reason: `TEST_INVALID: ${tap.why}` }
    if (tap.emptyFiles.length > 0)
      return {
        verdict: 'PENDING',
        reason: `TEST_INVALID: ${tap.emptyFiles.length} test file(s) registered no test and counted as a pass: ${tap.emptyFiles.slice(0, 3).join(', ')}`,
        observed: { tests: tap.tests, pass: tap.pass }
      }
    const observed = {
      tests: tap.tests,
      pass: tap.pass,
      fail: tap.fail,
      skipped: tap.skipped,
      todo: tap.todo,
      cancelled: tap.cancelled
    }
    if (tap.fail > 0 || tap.cancelled > 0)
      return {
        verdict: 'FAIL',
        reason: `${tap.fail} failed, ${tap.cancelled} cancelled of ${tap.tests}`,
        observed
      }
    if (tap.skipped > 0 || tap.todo > 0) {
      const phpSkip = tap.skipTitles.filter((t) =>
        /# SKIP .*\bphp\b.*(?:none on PATH|need php|neither)/i.test(t)
      )
      if (phpSkip.length > 0 && phpSkip.length >= tap.skipped + tap.todo && phpAbsent(ctx))
        return {
          verdict: 'ENV',
          reason: `php: ${phpSkip.length} of ${tap.tests} tests skipped for want of ${PHP_MISSING} (probes: php --version ENOENT, docker info unreachable); ${tap.pass} passed`,
          observed
        }
      const dbSkip = tap.skipTitles.filter((t) => /TEST_DATABASE_URL|postgres|database/i.test(t))
      if (dbSkip.length > 0 && !ctx.env.TEST_DATABASE_URL)
        return {
          verdict: 'ENV',
          reason: `postgres: ${dbSkip.length} of ${tap.tests} tests skipped for want of a database (probe: TEST_DATABASE_URL is not set); ${tap.pass} passed`,
          observed
        }
      return {
        verdict: 'PENDING',
        reason:
          `${tap.skipped} skipped, ${tap.todo} todo of ${tap.tests}: a skipped test is not a pass (e.g. ${tap.skipTitles[0] ?? 'n/a'})`.slice(
            0,
            300
          ),
        observed
      }
    }
    if (manifest.tests?.length > 0) {
      const v = tapVerdict(text, manifest.tests)
      if (!v.ok)
        return {
          verdict: v.failed.length > 0 ? 'FAIL' : 'PENDING',
          reason:
            `named assertion(s) not ok: [${v.failed.join('; ')}] not found: [${v.missing.join('; ')}]`.slice(
              0,
              400
            ),
          observed
        }
    }
    return { verdict: 'GREEN', reason: '', observed }
  }
  // script style: its own checks print `ALL CHECKS PASSED`.
  if (/CANNOT RUN: /.test(text)) {
    const why = (/CANNOT RUN: (.*)/.exec(text) ?? [])[1] ?? 'unspecified'
    return {
      verdict: 'ENV',
      reason: `the case reports it cannot run here (its own prerequisite probe): ${why}`.slice(0, 300)
    }
  }
  if (!/ALL CHECKS PASSED/.test(text) || /^not ok - /m.test(text))
    return { verdict: 'PENDING', reason: "TEST_INVALID: exit 0 without the script's ALL CHECKS PASSED line" }
  return { verdict: 'GREEN', reason: '' }
}

/**
 * @param {{cases: object[], target: string, proveRed: boolean, outDir: string}} o - what to run.
 * @param {object} [ctx] - context.
 * @returns {Promise<object[]>} one result per case.
 */
export async function run({ cases, target, proveRed, outDir }, ctx = defaultContext()) {
  const rel = (p) => relative(outDir, p)
  const log = []
  const p = probes(ctx, log)
  const results = Array.from({ length: cases.length })
  const scratches = new Map()
  let failed = null
  /**
   * Judge one case. `slot` names the overlay this worker may edit (workers never share one).
   * @returns {Promise<object>} the result record.
   */
  const one = async (manifest, slot) => {
    const started = Date.now()
    let out = null
    const done = (verdict, reason, extra = {}) => {
      out = result(manifest, verdict, reason, { durationMs: Date.now() - started, ...extra })
    }
    const denied = targetPolicy(manifest, target)
    if (denied !== null) {
      done('PENDING', denied)
      return out
    }
    if (manifest.kind === 'no-run') {
      done(
        'PENDING',
        manifest.flakyModel
          ? `model-dependent (flaky_model): belongs to the harness live set; no deterministic run (needs: ${manifest.needs.join(', ')})`
          : `no deterministic run in the catalogue; owner layer ${manifest.ownerLayer} (${manifest.ownerSource}); needs: ${manifest.needs.join(', ')}`
      )
      return out
    }
    if (manifest.kind === 'group') {
      if (manifest.probe === 'chrome') {
        const c = await p.chrome()
        if (!c.ok) {
          done('ENV', `browser: ${c.detail}`, { evidence: ['probes.json'] })
          return out
        }
      } else if (manifest.probe.startsWith('node_modules:')) {
        const dir = manifest.probe.slice('node_modules:'.length)
        const n = p.nodeModules(dir)
        if (!n.ok) {
          done('ENV', `${dir}/node_modules is not installed (probe: ${n.detail})`, {
            evidence: ['probes.json']
          })
          return out
        }
      }
      done('PENDING', `group not executed by the unit adapter: ${manifest.notRun}`, {
        evidence: log.length > 0 ? ['probes.json'] : []
      })
      return out
    }
    // Needs of a regression run.
    if (manifest.kind === 'regression') {
      const blocked = []
      for (const need of manifest.needs) {
        if (need === 'postgres') blocked.push(p.postgres())
        else if (need === 'stand') blocked.push(p.stand())
        else if (need === 'chrome') blocked.push(await p.chrome())
      }
      const bad = blocked.find((b) => !b.ok)
      if (bad !== undefined) {
        const isEnv = !/never uses an inherited/.test(bad.detail)
        done(isEnv ? 'ENV' : 'PENDING', `${manifest.needs.join('+')}: ${bad.detail}`, {
          evidence: ['probes.json']
        })
        return out
      }
      if (manifest.style === 'playwright') {
        done(
          'PENDING',
          'a Playwright spec needs its own adapter (stand + browser session); not run as node TAP'
        )
        return out
      }
      if (manifest.needs.includes('chrome')) {
        done('PENDING', 'browser-driven script: not driven by the unit adapter (belongs to the ui layer)')
        return out
      }
    }
    // Files named on the command line must exist, or `node --test` silently skips them.
    const cwd = join(ctx.root, manifest.cwd === '.' || manifest.cwd === undefined ? '' : manifest.cwd)
    const named = manifest.command
      .slice(1)
      .filter((a) => !a.startsWith('-') && /\.(?:test\.)?(?:mjs|cjs|js|ts|tsx|mts)$/.test(a))
    const lost = named.filter((a) => !existsSync(join(cwd, a)))
    if (lost.length > 0) {
      const missingLog = join(outDir, 'logs', `${manifest.id}.log`)
      mkdirSync(join(outDir, 'logs'), { recursive: true })
      writeFileSync(missingLog, `test file not found in ${cwd}: ${lost.join(', ')}\n`)
      done('FAIL', `test file not found: ${lost.join(', ')}`, { evidence: [rel(missingLog)] })
      return out
    }
    const logPath = join(outDir, 'logs', `${manifest.id}.log`)
    const fence = dockerFence(ctx, outDir, manifest.id)
    let child
    let leftBehind = []
    try {
      child = await runChild({
        argv: manifest.command,
        cwd,
        log: logPath,
        env: childEnv(ctx, {
          ...(ctx.env.QA_STAND_URL && manifest.needs?.includes('stand')
            ? { TRACY_STAND: ctx.env.QA_STAND_URL }
            : {}),
          ...fence.env
        }),
        timeoutMs: manifest.timeoutS * 1000
      })
    } finally {
      leftBehind = fence.dispose()
    }
    const text = readTextSync(logPath)
    const evidence = [rel(logPath)]
    if (leftBehind.length > 0) {
      done('PENDING', `TEST_INVALID: the run's scratch was not removed (${leftBehind.join('; ')})`, {
        evidence
      })
      return out
    }
    if (existsSync(fence.marker)) {
      // The command tried to start a container and was refused: whatever it then reported is not a product verdict.
      const asked = readTextSync(fence.marker).trim().split('\n')[0]
      const php = spawnSync('php', ['--version'], { encoding: 'utf8', timeout: 10000, env: ctx.env })
      const docker = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
        encoding: 'utf8',
        timeout: 20000,
        env: ctx.env
      })
      const detail = `php: ${php.error ? php.error.message : `exit ${php.status}`}; docker: ${docker.status === 0 ? 'daemon up' : 'unreachable'}; the command ran \`${asked.slice(0, 120)}\` (refused)`
      log.push({ probe: 'container-request', ok: false, detail })
      const failed = child.status !== 0 || child.timedOut
      const neither = failed && docker.status !== 0 && (php.error !== undefined || php.status !== 0)
      done(
        neither ? 'ENV' : 'PENDING',
        neither
          ? `needs a container (php or docker), neither is available on this machine (${detail})`
          : `the command asked for a container, which this adapter does not own, and then ${failed ? 'failed' : 'exited 0 anyway; a refused container request never counts as a verdict'} (${detail})`,
        { evidence: [...evidence, rel(fence.marker), 'probes.json'] }
      )
      return out
    }
    const j = judgeRun(manifest, child, text, p, ctx)
    if (j.verdict !== 'GREEN') {
      if (j.verdict === 'ENV') {
        log.push({ probe: `env:${manifest.id}`, ok: false, detail: j.reason })
        evidence.push('probes.json')
      }
      done(j.verdict, j.reason, { evidence, observed: j.observed })
      return out
    }
    const counts = j.observed
      ? `${j.observed.pass} of ${j.observed.tests} tests passed, 0 skipped`
      : 'script checks passed'
    if (manifest.kind === 'suite') {
      done(
        'PENDING',
        `GREEN (${counts}) but an area suite has no RED proof of its own; its assertions are only proven by regression cases`,
        { evidence, observed: j.observed }
      )
      return out
    }
    if (!proveRed) {
      done('PENDING', `GREEN (${counts}); RED proof not requested (run with --prove-red)`, {
        evidence,
        observed: j.observed
      })
      return out
    }
    if (!scratches.has(slot)) {
      const dir = join(outDir, `scratch-${slot}`)
      buildOverlay(ctx.root, dir, ctx.heavyDirs, { gitPointer: true })
      scratches.set(slot, registerScratch(dir))
    }
    const scratch = scratches.get(slot)
    const redFence = dockerFence(ctx, outDir, `${manifest.id}.red`)
    let proof
    try {
      proof = await proveRegressionRed({
        manifest,
        root: ctx.root,
        scratch,
        outDir,
        rel,
        controlLog: rel(logPath),
        env: childEnv(ctx, redFence.env)
      })
    } finally {
      leftBehind = redFence.dispose()
    }
    if (leftBehind.length > 0) {
      done('PENDING', `TEST_INVALID: the RED run's scratch was not removed (${leftBehind.join('; ')})`, {
        evidence
      })
      return out
    }
    if (existsSync(redFence.marker)) {
      done(
        'PENDING',
        `the pre-fix run asked for a container, which this adapter does not own; no RED proof is granted (${readTextSync(redFence.marker).trim().split('\n')[0].slice(0, 120)})`,
        { evidence: [...evidence, rel(redFence.marker)] }
      )
      return out
    }
    if (proof.ok)
      done('PASS', `GREEN (${counts}) and RED on the pre-fix source of PR #${manifest.regression.pr}`, {
        evidence: [...evidence, ...proof.evidence],
        observed: j.observed,
        redProof: proof.proof
      })
    else
      done('PENDING', `GREEN (${counts}); RED proof not established: ${proof.reason}`.slice(0, 700), {
        evidence: [...evidence, ...proof.evidence],
        observed: j.observed
      })
    return out
  }
  try {
    // Area suites parallelise inside node:test, so they run alone; the rest share a small pool.
    const heavy = cases.map((c, i) => [c, i]).filter(([c]) => c.kind === 'suite')
    const light = cases.map((c, i) => [c, i]).filter(([c]) => c.kind !== 'suite')
    for (const [c, i] of heavy) results[i] = await one(c, 0)
    const width = Math.max(1, Number(ctx.env.QA_UNIT_CONCURRENCY ?? ctx.concurrency ?? 3))
    let next = 0
    await Promise.all(
      Array.from({ length: Math.min(width, light.length) }, async (_, slot) => {
        while (next < light.length) {
          const [c, i] = light[next++]
          results[i] = await one(c, slot)
        }
      })
    )
  } catch (error) {
    failed = error
  }
  for (const dir of scratches.values()) removeScratch(dir)
  if (log.length > 0) atomicWrite(join(outDir, 'probes.json'), `${JSON.stringify(log, null, 2)}\n`)
  if (failed !== null) throw failed
  return results
}
