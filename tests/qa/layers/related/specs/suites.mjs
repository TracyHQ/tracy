// Adapters that run the existing suites of the sibling repositories. Their paths come from the QA brief (W8). A suite
// verdict is about that suite on that commit only: a green suite has no per-case oracle or RED proof here, so it is
// never PASS, and a nonzero exit is never read as a product FAIL or an environment gap (no independent mapping exists).
// What the adapter guarantees is the execution contract (lib/isolation.mjs): one pinned commit, a read-only copy, an OS
// fence, and provenance of the commit, tools, policy and input fingerprints.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { atomicWrite, canonicalJson, safeName, spawnBounded } from '../../cms/lib/kit.mjs'
import { classifyRun, countsOf } from '../../cms/specs/legacy.mjs'
import { resolveRoot, snapshotClone, toolVersion } from '../lib/clone.mjs'
import { buildFence, countLeaves, extractCommit, fingerprintTree, toolRoot } from '../lib/isolation.mjs'

export const SUITES = Object.freeze([
  {
    key: 'wordpress-theme',
    repo: 'tracy-wordpress-theme',
    dir: 'skills/tracy-wordpress-theme/scripts/test',
    kind: 'node'
  },
  {
    key: 'joomla-template',
    repo: 'tracy-joomla-template',
    dir: 'skills/joomlart-t4-template/scripts/test',
    kind: 'node'
  },
  {
    key: 'emdash-template',
    repo: 'tracy-emdash-template',
    dir: 'skills/tracy-emdash-template/scripts/tests',
    kind: 'node'
  },
  { key: 'fleet-tests', repo: 'tracy-fleet', dir: 'tests', kind: 'mixed' },
  {
    key: 'fleet-joomla-access',
    repo: 'tracy-fleet',
    dir: 'provision/access/joomla/tests',
    kind: 'php',
    only: 'run.php'
  },
  { key: 'infra-fleet-tests', repo: 'tracy-infra', dir: 'fleet/tests', kind: 'mixed' },
  { key: 'infra-mail', repo: 'tracy-infra', dir: 'mail/test', kind: 'node', only: 'emails.test.mjs' },
  { key: 'docs-scripts-tests', repo: 'tracy-docs', dir: 'scripts/tests', kind: 'mixed' }
])

const FILE_BUDGET_MS = 240_000
const SUITE_BUDGET_MS = 1_200_000
const ENV_ALLOWLIST = ['PATH', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'HOME']

/**
 * Inventory of a suite folder at the pinned commit: every regular file whose name says it is a test, at any depth, plus
 * anything that is not a regular file. A file the adapter has a command for is `run`; the rest are `unsupported` and are
 * reported, so a nested test or an unknown runner is a recorded gap, never a silently smaller suite.
 */
export async function inventoryOf(suite, dir) {
  const run = []
  const unsupported = []
  const walk = async (d, rel) => {
    const entries = await fs.readdir(d, { withFileTypes: true })
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const name = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) await walk(path.join(d, e.name), name)
      else if (!e.isFile())
        unsupported.push({ file: name, why: 'not a regular file (symlink or special file)' })
      else if (suite.only) {
        if (!rel && e.name === suite.only) run.push(name)
      } else if (!/test/i.test(e.name)) continue
      else if (rel)
        unsupported.push({
          file: name,
          why: 'nested test file: the adapter runs the suite folder top level only'
        })
      else if (e.name.endsWith('.test.mjs') || /^test.*\.(py|sh)$/.test(e.name)) run.push(name)
      else unsupported.push({ file: name, why: 'a test-named file with no supported runner' })
    }
  }
  await walk(dir, '')
  return { run, unsupported }
}

function commandFor(dir, file) {
  const abs = path.join(dir, file)
  if (file.endsWith('.py'))
    return {
      argv: ['python3', '-m', 'unittest', 'discover', '-s', dir, '-p', file],
      cwd: dir,
      tool: 'python3',
      kind: 'python'
    }
  if (file.endsWith('.sh')) return { argv: ['bash', abs], cwd: dir, tool: 'bash', kind: 'shell' }
  if (file.endsWith('.php')) return { argv: ['php', abs], cwd: path.dirname(dir), tool: 'php', kind: 'php' }
  return {
    argv: ['node', '--test', '--test-reporter=tap', '--test-timeout=200000', abs],
    cwd: dir,
    tool: 'node',
    kind: 'node'
  }
}

/** True when `target` resolves, through every symlink, to a place inside `base`. */
async function insideReal(base, target) {
  const [b, t] = await Promise.all([fs.realpath(base), fs.realpath(target)])
  return t === b || t.startsWith(`${b}${path.sep}`)
}

const realOr = (p) => fs.realpath(p).catch(() => path.resolve(p))

/** Run every file of one suite from a read-only copy of one commit, under the OS fence, and return a verdict plus provenance. */
export async function runSuite(ctx, suite) {
  const where = resolveRoot(ctx.env)
  if (!where.root)
    return {
      verdict: 'ENV',
      reason: `${suite.repo}: no sibling-repo root configured (${where.problem})`,
      evidence: []
    }
  const cloneDir = path.join(where.root, suite.repo)
  const before = await snapshotClone(cloneDir)
  if (!before.ok)
    return {
      verdict: before.invalid ? 'PENDING' : 'ENV',
      reason: `${suite.repo}: ${before.reason}`,
      evidence: []
    }
  const sha = before.head // taken once: the archive below is of THIS commit, never of a second HEAD lookup
  const tag = `${suite.repo}@${before.short}`
  const provRel = `evidence/${safeName(ctx.caseId)}.provenance.json`
  const prov = {
    repo: suite.repo,
    suiteDir: suite.dir,
    root: { from: where.from },
    sha,
    headBefore: sha,
    dirtyFilesBefore: before.dirtyLines,
    tools: {},
    runtimeRoots: {},
    policy: null,
    inputFingerprint: null,
    inputFingerprintAfter: null,
    refusal: null,
    files: []
  }
  const logs = []
  // Every exit path records provenance, refusals included, so a refusal still says which commit and policy it concerned.
  const finish = async (verdict, reason, refusal = null) => {
    if (refusal) prov.refusal = refusal
    await atomicWrite(path.join(ctx.outDir, provRel), canonicalJson(prov))
    return { verdict, reason, evidence: [provRel, ...logs] }
  }

  const scratch = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'qa-rel-'))
  const started = Date.now()
  let after = { ok: false }
  try {
    const copyDir = path.join(scratch, 'repo')
    const work = path.join(scratch, 'work')
    await fs.mkdir(copyDir)
    await fs.mkdir(path.join(work, 'tmp'), { recursive: true })
    let expected
    try {
      expected = (await extractCommit({ cloneDir, sha, dest: copyDir, work })).expectedFiles
    } catch (error) {
      return await finish('PENDING', `${tag}: provenance invalid: ${error.message}`, 'extraction')
    }
    const leaves = await countLeaves(copyDir)
    if (leaves !== expected)
      return await finish(
        'PENDING',
        `${tag}: provenance invalid: the commit lists ${expected} files and the copy holds ${leaves}`,
        'extraction-count'
      )
    const fp = await fingerprintTree(copyDir)
    if (!fp.ok) return await finish('PENDING', `${tag}: provenance invalid: ${fp.reason}`, 'fingerprint')
    prov.inputFingerprint = fp.sha256
    const runDir = path.join(copyDir, suite.dir)
    if (!(await insideReal(copyDir, runDir).catch(() => false)))
      return await finish(
        'PENDING',
        `${tag}: ${suite.dir} is absent or resolves outside the committed copy; refusing to run it`,
        'suite-dir'
      )
    const inv = await inventoryOf(suite, runDir).catch(() => ({ run: [], unsupported: [] }))
    const files = inv.run
    prov.inventory = { run: files, unsupported: inv.unsupported }
    if (files.length === 0)
      return await finish(
        'PENDING',
        `${tag}: ${suite.dir} holds no test files at that commit; nothing ran`,
        'no-files'
      )

    // Runtime roots: what the suite's own tools need to read. Each is looked up by a fixed command, never from output.
    const kinds = [...new Set(files.map((f) => commandFor(runDir, f).tool))]
    const baseEnv = Object.fromEntries(
      ENV_ALLOWLIST.filter((k) => ctx.env[k] !== undefined).map((k) => [k, ctx.env[k]])
    )
    baseEnv.HOME ??= os.homedir()
    const absentTools = {}
    const exes = {}
    const allowRead = []
    for (const tool of kinds) {
      let t
      if (tool === 'node') {
        const exe = await realOr(process.execPath)
        t = { exe, root: path.dirname(path.dirname(exe)) }
      } else t = await toolRoot(tool, baseEnv)
      prov.runtimeRoots[tool] = t.root ?? (t.absent ? 'absent (probe: command -v -> not found)' : 'unknown')
      if (t.root) {
        allowRead.push(t.root)
        exes[tool] = t.exe
      } else absentTools[tool] = t
    }
    const env = {
      ...baseEnv,
      TMPDIR: path.join(work, 'tmp'),
      PYTHONDONTWRITEBYTECODE: '1',
      CI: '1'
    }
    const denyRead = await Promise.all(
      [baseEnv.HOME, where.root, cloneDir, ctx.repoRoot, ctx.outDir].filter(Boolean).map(realOr)
    )
    const fence = await buildFence({ scratch, writeDir: work, denyRead, allowRead, env })
    if (fence.gap)
      return await finish(
        fence.gap,
        `${tag}: the execution contract cannot be enforced here: ${fence.reason}; the suite is not run unfenced`,
        'fence'
      )
    prov.policy = fence.policy

    for (const u of inv.unsupported)
      prov.files.push({
        file: u.file,
        argv: null,
        verdict: 'PENDING',
        kind: 'invalid',
        reason: `TEST_INVALID: not run: ${u.why}`
      })
    for (const file of files) {
      const cmd = commandFor(runDir, file)
      const entry = { file, argv: cmd.argv }
      prov.files.push(entry)
      if (Date.now() - started > SUITE_BUDGET_MS) {
        Object.assign(entry, {
          verdict: 'PENDING',
          kind: 'invalid',
          reason: 'TEST_INVALID: suite time budget exhausted before this file'
        })
        continue
      }
      if (!(await insideReal(copyDir, path.join(runDir, file)).catch(() => false))) {
        Object.assign(entry, {
          verdict: 'PENDING',
          kind: 'invalid',
          reason: 'TEST_INVALID: file resolves outside the committed copy'
        })
        continue
      }
      const gone = absentTools[cmd.tool]
      if (gone) {
        Object.assign(
          entry,
          gone.absent
            ? {
                verdict: 'ENV',
                kind: 'env',
                reason: `${cmd.tool} is not installed (probe: command -v ${cmd.tool} -> not found)`
              }
            : {
                verdict: 'PENDING',
                kind: 'invalid',
                reason: `TEST_INVALID: the probe for ${cmd.tool} gave no answer`
              }
        )
        continue
      }
      // The tool is the exact executable that was located, and even its version query runs under the fence.
      const argv = [exes[cmd.tool], ...cmd.argv.slice(1)]
      prov.tools[cmd.kind] ??=
        (await toolVersion(fence.wrap([exes[cmd.tool], '--version']), env, cmd.cwd)) ?? 'version unknown'
      const r = await spawnBounded({
        argv: fence.wrap(argv),
        cwd: cmd.cwd,
        env,
        timeoutMs: FILE_BUDGET_MS,
        maxBytes: 1_000_000
      })
      const c = classifyRun(
        r,
        countsOf(cmd.kind === 'python' ? 'python3' : 'node', `${r.stdout}\n${r.stderr}`)
      )
      const logRel = `logs/${safeName(ctx.caseId)}.${safeName(file)}.log`
      logs.push(logRel)
      await atomicWrite(
        path.join(ctx.outDir, logRel),
        `argv: ${cmd.argv.join(' ')}\ncwd: ${cmd.cwd}\nexit: ${r.exit} signal: ${r.signal} timedOut: ${r.timedOut} truncated: ${Boolean(r.truncated)}\n---\n${r.stdout}\n--- stderr ---\n${r.stderr}\n`
      )
      Object.assign(entry, {
        exit: r.exit,
        signal: r.signal,
        verdict: c.verdict,
        kind: c.kind,
        reason: c.reason,
        log: logRel
      })
    }
    const fpAfter = await fingerprintTree(copyDir)
    prov.inputFingerprintAfter = fpAfter.ok ? fpAfter.sha256 : null
  } finally {
    await fs.rm(scratch, { recursive: true, force: true })
    after = await snapshotClone(cloneDir)
  }
  prov.headAfter = after.ok ? after.head : null
  prov.cloneUnchanged = after.ok && after.head === sha && after.status === before.status
  prov.sourceUnchanged =
    prov.inputFingerprintAfter !== null && prov.inputFingerprintAfter === prov.inputFingerprint
  const runs = prov.files
  const count = (k) => runs.filter((r) => r.kind === k).length
  const summary = `${runs.length} file(s): ${count('green')} green, ${count('nonzero')} nonzero exit, ${count('invalid')} invalid, ${count('zero') + count('skipped')} zero/skipped, ${count('env')} environment`
  const list = (pred) =>
    runs
      .filter(pred)
      .map((r) => `${r.file} (${r.reason})`)
      .join('; ')
  if (!prov.cloneUnchanged)
    return await finish(
      'PENDING',
      `evidence invalid: ${tag} changed while its suite ran (HEAD or working tree differs after the run)`
    )
  if (!prov.sourceUnchanged)
    return await finish(
      'PENDING',
      `evidence invalid: the read-only source copy of ${tag} differs after the run (or could not be re-read)`
    )
  if (before.dirtyLines > 0)
    return await finish(
      'PENDING',
      `${tag} has ${before.dirtyLines} uncommitted file(s); the run used the committed tree, but the clone is not clean, so it is not provenance for the clone`
    )
  // An incomplete execution (invalid, cut off, unprobed tool) outranks an absent tool in another file: ENV is only the
  // verdict when nothing else about the run is in doubt.
  if (runs.some((r) => r.kind === 'invalid'))
    return await finish('PENDING', `${tag}: ${summary}; TEST_INVALID: ${list((r) => r.kind === 'invalid')}`)
  if (runs.some((r) => r.kind === 'env'))
    return await finish('ENV', `${tag}: ${summary}; environment: ${list((r) => r.kind === 'env')}`)
  if (runs.some((r) => r.kind !== 'green'))
    return await finish('PENDING', `${tag}: ${summary}; pending: ${list((r) => r.kind !== 'green')}`)
  return await finish(
    'PENDING',
    `${tag}: ${summary}; green, but this layer has no case-level oracle or RED proof for the suite, so it is not counted as PASS`
  )
}

export function suiteSpecs() {
  return [
    {
      item: null,
      assertion: 'sibling.suite-runs-with-provenance',
      area: 'suites',
      requirement:
        "The sibling repository's own suite runs against a recorded commit without failing, without touching the clone and with temporary files kept in the run scratch folder.",
      oracle: {
        source: 'the suite itself (owner: the sibling repository)',
        section: 'suite assertions',
        invariant: 'exit 0, no skipped tests; clone HEAD and working tree identical before and after'
      },
      reads: ['${QA_RELATED_ROOT}/<repo> (read-only)'],
      perItem: true,
      variants: SUITES.map((s) => ({
        key: s.key,
        itemId: `suite:${s.repo}/${s.dir}${s.only ? `/${s.only}` : ''}`,
        tags: ['happy', 'dependency-failure'],
        params: { suite: s.key },
        mutation: null,
        prerequisites: ['config:related-root', `clone:${s.repo}`]
      })),
      mutations: {},
      async execute(ctx) {
        return runSuite(
          ctx,
          SUITES.find((s) => s.key === ctx.params.suite)
        )
      }
    }
  ]
}
