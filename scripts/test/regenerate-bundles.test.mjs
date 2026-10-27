// `scripts/regenerate-bundles.mjs` is the local command that rebuilds committed bundles after a
// merge. What it must never do is quiet: keep one side of a generated conflict, skip a consumer of a
// shared source, or say "done" over a half-written bundle. So every case here runs it on a REAL Git
// repository built in scratch, with real `--check` and `pnpm run build` subprocesses. One package
// carries a copy of an existing builder (`tracy-tab-link/scripts/build-client.mjs`, real esbuild);
// the others carry small builders that print the repository's other diagnostic forms (host, locale,
// brand host), and the brand package runs the real `gen-palette.mjs`.
//
// What is injected: the final `bundles` gate (the fixture has no `check-all.ts`), and failures no
// real builder can be made to produce on demand (a signal, an overflow, a build that writes half a
// file). Injection goes through the command's own subprocess adapter, around the real runner.
// Whether the repository's real bundles are current is the `bundles` gate's job in CI, not this file's.
//
// Scratch goes under `TCH_TEST_ARTIFACTS` when set (the coding-workflow runner keeps fixtures out of
// the system temp dir), otherwise `os.tmpdir()`; never inside the worktree.

import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SCRIPT = join(ROOT, 'scripts/regenerate-bundles.mjs')
// Loaded lazily so a tree without the command fails each test by name instead of failing the file.
const load = () => import(pathToFileURL(SCRIPT).href)

const BASE = process.env.TCH_TEST_ARTIFACTS ?? tmpdir()
mkdirSync(BASE, { recursive: true })
const SCRATCH = realpathSync(mkdtempSync(join(BASE, 'regenerate-bundles-test-')))
after(() => rmSync(SCRATCH, { recursive: true, force: true }))

const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }
const git = (repo, ...args) =>
  execFileSync(
    'git',
    [
      '-c',
      'user.name=fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'commit.gpgsign=false',
      ...args
    ],
    { cwd: repo, env: GIT_ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  )
const gitStatus = (repo, ...args) =>
  spawnSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', ...args], {
    cwd: repo,
    env: GIT_ENV,
    encoding: 'utf8'
  }).status

const write = (file, text) => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
}
const read = (repo, rel) => readFileSync(join(repo, rel), 'utf8')
const sha = (data) => createHash('sha256').update(data).digest('hex')

// A stand-in builder with the same contract as the real ones: build = write the output, `--check` =
// compare and exit 1 with the diagnostic of the builder family it stands for.
const DIAGNOSTICS = {
  client: {
    out: 'lib/client.js',
    stale: 'build-client: lib/client.js is stale — run `node scripts/build-client.mjs` and commit it.',
    // The esbuild client builders read the bundle without a guard: a missing file is a crash.
    missing: null
  },
  locale: {
    out: 'lib/client.js',
    stale:
      'build-client: lib/client.js is stale — a dictionary changed but the bundle was not rebuilt.\n  Run `pnpm --filter fixture build`.',
    missing: 'build-client: lib/client.js is missing — run `node scripts/build-client.mjs`.'
  },
  host: {
    out: 'lib/index.js',
    stale: 'build-host: lib/index.js differs from src/host — run `pnpm build` and commit it.',
    missing: 'build-host: lib/index.js is missing — run `pnpm build` and commit it.'
  },
  brandHost: {
    out: 'lib/index.js',
    stale: 'build-host: lib/index.js is stale — run `pnpm build` here and commit it.',
    missing: null
  }
}
const standInBuilder = (family, inputs) => {
  const d = DIAGNOSTICS[family]
  return `import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(root, ${JSON.stringify(d.out)})
const built = ${JSON.stringify(inputs)}
  .map((rel) => '/* ' + rel + ' */\\n' + readFileSync(path.join(root, rel), 'utf8'))
  .join('\\n')
if (process.argv.includes('--check')) {
  let current
  try {
    current = readFileSync(OUT, 'utf8')
  } catch (error) {
    if (${JSON.stringify(d.missing)} === null) throw error
    console.error(${JSON.stringify(d.missing)})
    process.exit(1)
  }
  if (current !== built) {
    console.error(${JSON.stringify(d.stale)})
    process.exit(1)
  }
  console.log('matches')
} else {
  mkdirSync(path.dirname(OUT), { recursive: true })
  writeFileSync(OUT, built)
  console.log('built')
}
`
}

const CLIENT_ONLY = 'node scripts/build-client.mjs'
const CLIENT_HOST = 'node scripts/build-client.mjs && node scripts/build-host.mjs'
const PALETTE_BUILD =
  'node scripts/gen-palette.mjs && node scripts/build-client.mjs && node scripts/build-host.mjs'
const manifest = (name, build) =>
  `${JSON.stringify({ name, version: '1.0.0', scripts: { build } }, null, 2)}\n`

const TAB = 'packages/ui/tab-link'
const OTHER = 'packages/ui/other'
const CONSUMER = 'packages/site/consumer'
const LOC = 'packages/locale/loc'
const BRAND = 'packages/brand/tracy-brand'
const SHARED = 'packages/core/shared/src/value.ts'
const FAVICON = 'docs/design/brand/favicon/tracy-favicon.svg'
const TOKENS = 'packages/ui/tracy-ui/src/tokens.css'
const ALL_GENERATORS = [
  `${BRAND}/scripts/build-client.mjs`,
  `${BRAND}/scripts/build-host.mjs`,
  `${LOC}/scripts/build-client.mjs`,
  `${CONSUMER}/scripts/build-client.mjs`,
  `${CONSUMER}/scripts/build-host.mjs`,
  `${OTHER}/scripts/build-client.mjs`,
  `${TAB}/scripts/build-client.mjs`
].sort()

let templateDir = null
/** The fixture repository, built once: five bundled packages, every output built and committed. */
function template() {
  if (templateDir) return templateDir
  const repo = join(SCRATCH, 'template')
  mkdirSync(repo)
  write(join(repo, '.gitignore'), 'node_modules\n')
  write(join(repo, 'package.json'), `${JSON.stringify({ name: 'fixture', private: true })}\n`)
  // As in this repository's own pnpm-workspace.yaml: `pnpm run` must not install before running.
  // Without it pnpm 11 writes a lockfile next to the package it runs in, and the command under
  // test rightly refuses that as a change outside the stale outputs.
  write(join(repo, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*/*'\nverifyDepsBeforeRun: false\n")
  // The copied builder imports esbuild; a dependency link in an ignored node_modules is the
  // repository's own arrangement, and nothing is installed into the worktree for it.
  mkdirSync(join(repo, 'node_modules'))
  symlinkSync(realpathSync(join(ROOT, 'node_modules/esbuild')), join(repo, 'node_modules/esbuild'))

  write(join(repo, SHARED), "export const SHARED = 'shared-base'\n")

  // The real client builder, unchanged, over three sources and the shared one.
  write(join(repo, TAB, 'package.json'), manifest('@tracy/dsh-tab-link', CLIENT_ONLY))
  write(
    join(repo, TAB, 'scripts/build-client.mjs'),
    readFileSync(join(ROOT, 'packages/ui/tracy-tab-link/scripts/build-client.mjs'), 'utf8')
  )
  // The real builder writes into an existing `lib/`, as in every package that commits one.
  mkdirSync(join(repo, TAB, 'lib'))
  write(join(repo, TAB, 'src/client/a.ts'), "export const A = 'alpha-base'\n")
  write(join(repo, TAB, 'src/client/b.ts'), "export const B = 'beta-base'\n")
  write(join(repo, TAB, 'src/client/c.ts'), "export const C = 'gamma-base'\n")
  write(
    join(repo, TAB, 'src/client/index.ts'),
    "import { A } from './a'\nimport { B } from './b'\nimport { C } from './c'\n" +
      "import { SHARED } from '../../../../core/shared/src/value'\n\n" +
      "export const inject = ['client']\n\n" +
      'export function apply(ctx: { client: unknown }) {\n  return [ctx.client, A, B, C, SHARED]\n}\n'
  )

  write(join(repo, OTHER, 'package.json'), manifest('@fixture/other', CLIENT_ONLY))
  write(join(repo, OTHER, 'scripts/build-client.mjs'), standInBuilder('client', ['src/client/index.ts']))
  write(join(repo, OTHER, 'src/client/index.ts'), "export const OTHER = 'other-base'\n")

  write(join(repo, CONSUMER, 'package.json'), manifest('@fixture/consumer', CLIENT_HOST))
  write(
    join(repo, CONSUMER, 'scripts/build-client.mjs'),
    standInBuilder('client', ['src/client/index.ts', '../../core/shared/src/value.ts'])
  )
  write(
    join(repo, CONSUMER, 'scripts/build-host.mjs'),
    standInBuilder('host', ['src/host/index.ts', '../../core/shared/src/value.ts'])
  )
  write(join(repo, CONSUMER, 'src/client/index.ts'), "export const VIEW = 'view-base'\n")
  write(join(repo, CONSUMER, 'src/host/index.ts'), "export const HOST = 'host-base'\n")

  write(join(repo, LOC, 'package.json'), manifest('@fixture/loc', CLIENT_ONLY))
  write(join(repo, LOC, 'scripts/build-client.mjs'), standInBuilder('locale', ['vi/a.json']))
  write(join(repo, LOC, 'vi/a.json'), '{ "hello": "xin chào" }\n')

  // The brand package: the real palette generator and its helper, on minimal inputs.
  write(join(repo, BRAND, 'package.json'), manifest('@tracy/dsh-brand', PALETTE_BUILD))
  for (const script of ['gen-palette.mjs', 'palette.mjs'])
    write(
      join(repo, BRAND, 'scripts', script),
      readFileSync(join(ROOT, 'packages/brand/tracy-brand/scripts', script), 'utf8')
    )
  write(
    join(repo, BRAND, 'scripts/build-client.mjs'),
    standInBuilder('client', ['src/client/generated.ts', 'src/client/index.ts'])
  )
  write(join(repo, BRAND, 'scripts/build-host.mjs'), standInBuilder('brandHost', ['src/host/index.ts']))
  write(join(repo, BRAND, 'src/client/index.ts'), "export const BRAND = 'brand-base'\n")
  write(join(repo, BRAND, 'src/host/index.ts'), "export const BRAND_HOST = 'brand-host-base'\n")
  write(
    join(repo, TOKENS),
    ':root, body {\n  --foreground: var(--dsw-alias-label-primary, #111111);\n}\n' +
      '[data-ds-dark-theme] {\n  --foreground: var(--dsw-alias-label-primary, #eeeeee);\n}\n'
  )
  write(
    join(repo, 'packages/ui/tracy-ui/src/dsh-bridge.css'),
    ':root {\n  --dsw-alias-label-primary: var(--foreground);\n}\n'
  )
  write(join(repo, FAVICON), '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1" /></svg>\n')

  // A package with a committed `lib/client.js` and no generator at all.
  write(join(repo, 'packages/misc/nogen/package.json'), manifest('@fixture/nogen', 'true'))
  write(join(repo, 'packages/misc/nogen/lib/client.js'), "'hand written'\n")

  execFileSync('node', ['scripts/gen-palette.mjs'], { cwd: join(repo, BRAND), stdio: 'pipe' })
  for (const generator of ALL_GENERATORS)
    execFileSync('node', [generator.split('/scripts/')[1].replace(/^/, 'scripts/')], {
      cwd: join(repo, generator.split('/scripts/')[0]),
      stdio: 'pipe'
    })
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'base: every output built')
  templateDir = repo
  return repo
}

let counter = 0
function cloneRepo() {
  counter += 1
  const repo = join(SCRATCH, `repo-${counter}`)
  cpSync(template(), repo, { recursive: true, verbatimSymlinks: true })
  return repo
}
function artifactsDir() {
  counter += 1
  const dir = join(SCRATCH, `artifacts-${counter}`)
  mkdirSync(dir)
  return dir
}

const OK = { status: 0, signal: null, stdout: '', stderr: '', error: null, timedOut: false, overflow: false }
const same = (a, b) => a.length === b.length && a.every((value, i) => value === b[i])
const isGit = (req) => req.argv[0] === 'git'
const isCheck = (req) => req.argv[0] === 'node' && req.argv[2] === '--check'
const checkOf = (repo, req) => `${req.cwd.slice(realpathSync(repo).length + 1)}/${req.argv[1]}`

/**
 * The command's adapter for a fixture run: records every request, answers the final gate itself
 * (`gate`), lets `intercept(req, real)` replace or wrap any other child, and otherwise runs it.
 */
async function harness(repo, { gate = OK, intercept, ...options } = {}) {
  const mod = await load()
  const calls = []
  const isGate = (req) => same(req.argv, mod.FINAL_GATE_ARGV)
  const isBuild = (req) => same(req.argv, mod.BUILD_ARGV)
  const run = async (req) => {
    calls.push(req)
    if (isGate(req)) return typeof gate === 'function' ? gate(req) : { ...OK, ...gate }
    const real = () => mod.runProcess(req)
    const answer = intercept ? await intercept(req, real, { isBuild, isGate }) : undefined
    return answer ?? real()
  }
  const go = (extra = {}) =>
    mod.regenerateBundles({ repo, artifacts: artifactsDir(), run, ...options, ...extra })
  return {
    mod,
    calls,
    go,
    isBuild,
    gates: () => calls.filter(isGate),
    builds: () => calls.filter(isBuild).map((req) => req.cwd.slice(realpathSync(repo).length + 1)),
    checks: () => calls.filter(isCheck).map((req) => checkOf(repo, req))
  }
}

/** Index plus every tracked and visible untracked path with its type and bytes (never opens a FIFO). */
function treeState(repo) {
  const index = git(repo, 'ls-files', '-s', '-z')
  const paths = [
    ...new Set(
      `${git(repo, 'ls-files', '-z')}\0${git(repo, 'ls-files', '-o', '--exclude-standard', '-z')}`
        .split('\0')
        .filter(Boolean)
    )
  ].sort()
  const files = {}
  for (const rel of paths) {
    let stat
    try {
      stat = lstatSync(join(repo, rel))
    } catch {
      files[rel] = 'absent'
      continue
    }
    files[rel] = stat.isFile()
      ? sha(readFileSync(join(repo, rel)))
      : stat.isSymbolicLink()
        ? 'link'
        : 'special'
  }
  return { index, files }
}
const changedPaths = (a, b) =>
  [...new Set([...Object.keys(a.files), ...Object.keys(b.files)])]
    .filter((rel) => a.files[rel] !== b.files[rel])
    .sort()

/** A refusal before anything was built: not ok, the reason named, no build, no gate, tree untouched. */
async function assertRefusedUntouched(repo, pattern, options = {}) {
  const state = treeState(repo)
  const h = await harness(repo, options)
  const report = await h.go()
  assert.equal(report.ok, false)
  assert.match(report.problems.join('\n'), pattern)
  assert.deepEqual(h.builds(), [], 'no build may start')
  assert.equal(h.gates().length, 0, 'the gate is not consulted after a refusal')
  assert.deepEqual(treeState(repo), state, 'a refusal leaves the tree and the index as they were')
  return { report, h }
}

const edit = (repo, rel, from, to) => {
  const text = read(repo, rel)
  assert.ok(text.includes(from), `${rel} holds ${from}`)
  writeFileSync(join(repo, rel), text.replace(from, to))
}

/** Two branches each change sources AND rebuild the same bundle; merging stops on the bundle. */
function conflictedRepo() {
  const repo = cloneRepo()
  const rebuild = () =>
    execFileSync('node', ['scripts/build-client.mjs'], { cwd: join(repo, TAB), stdio: 'pipe' })
  git(repo, 'checkout', '-q', '-b', 'left')
  edit(repo, `${TAB}/src/client/a.ts`, 'alpha-base', 'alpha-left')
  edit(repo, `${TAB}/src/client/c.ts`, 'gamma-base', 'gamma-left')
  rebuild()
  git(repo, 'commit', '-q', '-am', 'left: a and c')
  git(repo, 'checkout', '-q', '-b', 'right', 'main')
  edit(repo, `${TAB}/src/client/b.ts`, 'beta-base', 'beta-right')
  edit(repo, `${TAB}/src/client/c.ts`, 'gamma-base', 'gamma-right')
  rebuild()
  git(repo, 'commit', '-q', '-am', 'right: b and c')
  git(repo, 'checkout', '-q', 'left')
  assert.notEqual(
    gitStatus(repo, 'merge', '--no-ff', '--no-commit', 'right'),
    0,
    'the merge stops on conflicts'
  )
  const unmerged = [...new Set(git(repo, 'diff', '--name-only', '--diff-filter=U').trim().split('\n'))].sort()
  assert.deepEqual(unmerged, [`${TAB}/lib/client.js`, `${TAB}/src/client/c.ts`])
  return repo
}
const resolveSource = (repo) => {
  writeFileSync(join(repo, `${TAB}/src/client/c.ts`), "export const C = 'gamma-left+right'\n")
  git(repo, 'add', `${TAB}/src/client/c.ts`)
}

describe('regenerate-bundles: a generated conflict is rebuilt from both merged sources', () => {
  test('two source changes on two branches: the bundle carries both, nothing is staged, a second run rebuilds nothing', async () => {
    const repo = conflictedRepo()
    resolveSource(repo)
    assert.match(read(repo, `${TAB}/lib/client.js`), /^<<<<<<< /m, 'the bundle is left conflicted')
    const index = git(repo, 'ls-files', '-s', '-z')
    const ours = git(repo, 'show', `:2:${TAB}/lib/client.js`)
    const theirs = git(repo, 'show', `:3:${TAB}/lib/client.js`)
    const state = treeState(repo)

    const h = await harness(repo)
    const report = await h.go()
    assert.deepEqual(report.problems, [])
    assert.equal(report.ok, true)

    const bundle = read(repo, `${TAB}/lib/client.js`)
    for (const merged of ['alpha-left', 'beta-right', 'gamma-left+right'])
      assert.ok(bundle.includes(merged), `the rebuilt bundle holds ${merged}`)
    assert.doesNotMatch(bundle, /^(<<<<<<<|=======|>>>>>>>)/m)
    assert.notEqual(bundle, ours, 'not our side')
    assert.notEqual(bundle, theirs, 'not their side')
    assert.equal(
      git(repo, 'ls-files', '-s', '-z'),
      index,
      'nothing staged: the bundle is still unmerged in the index'
    )

    assert.deepEqual(h.builds(), [TAB], 'only the stale package is built, with its own command')
    assert.deepEqual(report.stale, [`${TAB}/lib/client.js`])
    assert.deepEqual(report.rewritten, [`${TAB}/lib/client.js`])
    assert.deepEqual(
      changedPaths(state, treeState(repo)),
      [`${TAB}/lib/client.js`],
      'no other package changed'
    )
    assert.deepEqual([...new Set(h.checks())].sort(), ALL_GENERATORS, 'every generator is checked')
    const firstBuild = h.calls.findIndex(h.isBuild)
    assert.deepEqual(
      [
        ...new Set(
          h.calls
            .slice(0, firstBuild)
            .filter(isCheck)
            .map((req) => checkOf(repo, req))
        )
      ].sort(),
      ALL_GENERATORS,
      'all of them before the first build'
    )
    assert.equal(h.gates().length, 1)
    assert.equal(h.gates()[0].cwd, realpathSync(repo))
    assert.deepEqual(h.gates()[0].argv, ['pnpm', 'exec', 'tsx', 'scripts/check-all.ts', '--only', 'bundles'])
    assert.ok(h.calls.indexOf(h.gates()[0]) > firstBuild, 'the gate runs after the rebuild')
    const summary = JSON.parse(readFileSync(join(report.runDir, 'summary.json'), 'utf8'))
    assert.equal(summary.ok, true)
    assert.deepEqual(summary.built, [TAB])

    // The person stages the result; a second run then has nothing to do and changes nothing.
    git(repo, 'add', `${TAB}/lib/client.js`)
    const settled = treeState(repo)
    const again = await harness(repo)
    const second = await again.go()
    assert.equal(second.ok, true)
    assert.deepEqual(again.builds(), [])
    assert.deepEqual(second.stale, [])
    assert.deepEqual(second.rewritten, [])
    assert.equal(again.gates().length, 1, 'the gate still has the last word')
    assert.deepEqual(treeState(repo), settled)
  })

  test('an unresolved source conflict is refused before anything is built', async () => {
    const repo = conflictedRepo()
    await assertRefusedUntouched(repo, /src\/client\/c\.ts: unresolved merge conflict/)
  })

  test('a conflicted output that no generator owns is refused, not rebuilt or picked', async () => {
    const repo = cloneRepo()
    const file = 'packages/misc/nogen/lib/client.js'
    git(repo, 'checkout', '-q', '-b', 'left')
    writeFileSync(join(repo, file), "'left'\n")
    git(repo, 'commit', '-q', '-am', 'left')
    git(repo, 'checkout', '-q', '-b', 'right', 'main')
    writeFileSync(join(repo, file), "'right'\n")
    git(repo, 'commit', '-q', '-am', 'right')
    git(repo, 'checkout', '-q', 'left')
    assert.notEqual(gitStatus(repo, 'merge', '--no-ff', '--no-commit', 'right'), 0)
    await assertRefusedUntouched(repo, /misc\/nogen\/lib\/client\.js: unresolved merge conflict/)
  })
})

describe('regenerate-bundles: every consumer of a changed input is found', () => {
  test('a shared workspace source rebuilds every stale consumer, in packages nobody edited, and no other', async () => {
    const repo = cloneRepo()
    edit(repo, SHARED, 'shared-base', 'shared-next')
    const state = treeState(repo)
    const h = await harness(repo)
    const report = await h.go()
    assert.deepEqual(report.problems, [])
    assert.equal(report.ok, true)
    const expected = [`${CONSUMER}/lib/client.js`, `${CONSUMER}/lib/index.js`, `${TAB}/lib/client.js`]
    assert.deepEqual(report.stale, expected)
    assert.deepEqual(report.rewritten, expected)
    assert.deepEqual(h.builds().sort(), [CONSUMER, TAB])
    assert.deepEqual(changedPaths(state, treeState(repo)), expected)
    for (const rel of expected)
      assert.ok(read(repo, rel).includes('shared-next'), `${rel} holds the new value`)
    assert.equal(git(repo, 'ls-files', '-s', '-z'), state.index, 'nothing staged')
  })

  test('only the host half is stale: the fresh client is rebuilt byte-identical and not reported', async () => {
    const repo = cloneRepo()
    edit(repo, `${CONSUMER}/src/host/index.ts`, 'host-base', 'host-next')
    const state = treeState(repo)
    const h = await harness(repo)
    const report = await h.go()
    assert.equal(report.ok, true)
    assert.deepEqual(report.stale, [`${CONSUMER}/lib/index.js`])
    assert.deepEqual(report.rewritten, [`${CONSUMER}/lib/index.js`])
    assert.deepEqual(changedPaths(state, treeState(repo)), [`${CONSUMER}/lib/index.js`])
  })

  for (const [what, file, from, to] of [
    ['the favicon', FAVICON, 'r="1"', 'r="2"'],
    ['a token in tokens.css', TOKENS, '#111111', '#222222']
  ]) {
    test(`the brand palette is regenerated before its bundle when ${what} changes`, async () => {
      const repo = cloneRepo()
      edit(repo, file, from, to)
      const state = treeState(repo)
      const h = await harness(repo)
      const report = await h.go()
      assert.deepEqual(report.problems, [])
      assert.equal(report.ok, true)
      // The bundle's own --check compares against the OLD generated palette and says "matches";
      // only running the palette generator shows that both are behind.
      const expected = [`${BRAND}/lib/client.js`, `${BRAND}/src/client/generated.ts`]
      assert.deepEqual(report.stale, expected)
      assert.deepEqual(report.rewritten, expected)
      assert.deepEqual(h.builds(), [BRAND])
      assert.deepEqual(
        changedPaths(state, treeState(repo)),
        expected,
        'the host bundle and other packages keep their bytes'
      )
      const marker = file === FAVICON ? encodeURIComponent('r="2"') : '#222222'
      assert.ok(read(repo, `${BRAND}/src/client/generated.ts`).includes(marker))
      assert.ok(read(repo, `${BRAND}/lib/client.js`).includes(marker))
      assert.equal(
        readdirSync(repo).some((name) => name.startsWith('palette-')),
        false,
        'the palette comparison leaves nothing in the worktree'
      )
    })
  }

  test('a missing locale bundle is reported by its builder as missing, and is rebuilt', async () => {
    const repo = cloneRepo()
    const before = read(repo, `${LOC}/lib/client.js`)
    rmSync(join(repo, `${LOC}/lib/client.js`))
    const h = await harness(repo)
    const report = await h.go()
    assert.equal(report.ok, true)
    assert.deepEqual(report.stale, [`${LOC}/lib/client.js`])
    assert.deepEqual(h.builds(), [LOC])
    assert.equal(read(repo, `${LOC}/lib/client.js`), before)
  })

  test('the brand host builder says "is stale" where the others say "differs"; both are rebuilt', async () => {
    const repo = cloneRepo()
    edit(repo, `${BRAND}/src/host/index.ts`, 'brand-host-base', 'brand-host-next')
    const h = await harness(repo)
    const report = await h.go()
    assert.equal(report.ok, true)
    assert.deepEqual(report.rewritten, [`${BRAND}/lib/index.js`])
  })
})

describe('regenerate-bundles: a failed --check is a rebuild only when the builder says the output is stale', () => {
  test('classifyCheck: each builder family, and everything that is not staleness', async () => {
    const { classifyCheck } = await load()
    const exit1 = (stderr) => ({ ...OK, status: 1, stderr })
    const stale = [
      ['build-client.mjs', `${DIAGNOSTICS.client.stale}\n`],
      ['build-client.mjs', `${DIAGNOSTICS.client.stale.replace(/\n/g, '\r\n')}\r\n`],
      ['build-client.mjs', 'build-client: lib/client.js is stale — run `pnpm build` here and commit it.\n'],
      ['build-client.mjs', `${DIAGNOSTICS.locale.stale}\n`],
      [
        'build-client.mjs',
        'build-client: lib/client.js is stale — a dictionary changed but the bundle was not rebuilt.\n' +
          '  Run `pnpm --filter @tracy/dsh-tracy-locale-vi build`.\n'
      ],
      ['build-client.mjs', `${DIAGNOSTICS.locale.missing}\n`],
      ['build-host.mjs', `${DIAGNOSTICS.host.stale}\n`],
      ['build-host.mjs', `${DIAGNOSTICS.host.missing}\n`],
      ['build-host.mjs', `${DIAGNOSTICS.brandHost.stale}\n`]
    ]
    for (const [generator, stderr] of stale)
      assert.equal(classifyCheck(generator, exit1(stderr)).state, 'stale', stderr)
    assert.equal(classifyCheck('build-client.mjs', OK).state, 'fresh')
    // Progress on stdout is the builders' normal preamble and is not part of the diagnostic.
    assert.equal(
      classifyCheck('build-client.mjs', {
        ...exit1(`${DIAGNOSTICS.client.stale}\n`),
        stdout: 'inject contract: 1 services used, all declared\n'
      }).state,
      'stale'
    )

    const failed = [
      ['build-client.mjs', exit1('build-client: uses ctx.foo without declaring it in `inject`.\n')],
      [
        'build-client.mjs',
        exit1('build-client: no `export const inject = [...]` found in src/client/index.ts\n')
      ],
      ['build-client.mjs', exit1("Error: Cannot find package 'esbuild' imported from build-client.mjs\n")],
      ['build-client.mjs', exit1('✘ [ERROR] Expected ";" but found "x"\n')],
      ['build-client.mjs', exit1('')],
      // The whole stderr must be the stale report: a stale line next to anything else is not proof.
      ['build-client.mjs', exit1(`${DIAGNOSTICS.client.stale}\nError: ENOSPC: no space left on device\n`)],
      ['build-client.mjs', exit1(`✘ [ERROR] Could not resolve "./gone"\n${DIAGNOSTICS.client.stale}\n`)],
      ['build-client.mjs', exit1(`▲ [WARNING] something\n\n${DIAGNOSTICS.client.stale}\n`)],
      ['build-client.mjs', exit1(`${DIAGNOSTICS.client.stale}\n${DIAGNOSTICS.client.stale}\n`)],
      ['build-client.mjs', exit1(`${DIAGNOSTICS.locale.stale}\nTypeError: x is not a function\n`)],
      ['build-client.mjs', exit1(`${DIAGNOSTICS.locale.missing}\n    at file:///x.mjs:1:1\n`)],
      ['build-host.mjs', exit1(`${DIAGNOSTICS.host.stale}\nnode:internal/process: uncaught\n`)],
      ['build-host.mjs', exit1(`${DIAGNOSTICS.host.missing}\n${DIAGNOSTICS.host.stale}\n`)],
      ['build-host.mjs', exit1(`${DIAGNOSTICS.brandHost.stale} And more.\n`)],
      // A wording no builder prints is not a supported form, however close.
      ['build-client.mjs', exit1('build-client: lib/client.js is stale — whatever\n')],
      ['build-client.mjs', exit1('build-client: lib/client.js is stale — \n')],
      ['build-host.mjs', exit1('build-host: lib/index.js is missing — \n')],
      // A host line does not make a client check stale, and the reverse.
      ['build-client.mjs', exit1(`${DIAGNOSTICS.host.stale}\n`)],
      ['build-host.mjs', exit1(`${DIAGNOSTICS.client.stale}\n`)],
      // The stale line must be the builder's own line, not a quotation of it.
      ['build-client.mjs', exit1(`note: ${DIAGNOSTICS.client.stale}\n`)],
      // Staleness is exit 1; any other status with the same words is something else.
      ['build-client.mjs', { ...exit1(DIAGNOSTICS.client.stale), status: 2 }],
      ['build-client.mjs', { ...exit1(DIAGNOSTICS.client.stale), status: null, signal: 'SIGKILL' }],
      ['build-client.mjs', { ...exit1(DIAGNOSTICS.client.stale), timedOut: true }],
      ['build-client.mjs', { ...exit1(DIAGNOSTICS.client.stale), overflow: true }],
      ['build-client.mjs', { ...exit1(DIAGNOSTICS.client.stale), error: 'spawn node ENOENT' }],
      ['build-assets.mjs', exit1(DIAGNOSTICS.client.stale)]
    ]
    for (const [generator, result] of failed)
      assert.equal(classifyCheck(generator, result).state, 'failed', JSON.stringify(result))
  })

  test('a broken inject contract in the real builder is refused, not rebuilt', async () => {
    const repo = cloneRepo()
    edit(repo, `${TAB}/src/client/index.ts`, 'return [ctx.client,', 'return [ctx.undeclared, ctx.client,')
    await assertRefusedUntouched(
      repo,
      /tab-link \(build-client\.mjs --check\): exit 1, not a stale-output report[\s\S]*ctx\.undeclared/
    )
  })

  test('a source the real builder cannot compile is refused, not rebuilt', async () => {
    const repo = cloneRepo()
    appendFileSync(join(repo, `${TAB}/src/client/a.ts`), 'export const = (\n')
    await assertRefusedUntouched(
      repo,
      /tab-link \(build-client\.mjs --check\): exit 1, not a stale-output report/
    )
  })

  test('a missing client bundle is a crash of its builder, so it is refused rather than guessed stale', async () => {
    const repo = cloneRepo()
    rmSync(join(repo, `${OTHER}/lib/client.js`))
    await assertRefusedUntouched(
      repo,
      /ui\/other \(build-client\.mjs --check\): exit 1, not a stale-output report/
    )
  })

  for (const [what, extra] of [
    ['followed by a fatal error', (stale) => `${stale}\nError: EIO: i/o error, read\n`],
    ['preceded by a compile error', (stale) => `✘ [ERROR] Unexpected "}"\n\n${stale}\n`]
  ])
    test(`a stale report ${what} is refused, not rebuilt`, async () => {
      const repo = cloneRepo()
      edit(repo, `${OTHER}/src/client/index.ts`, 'other-base', 'other-next')
      await assertRefusedUntouched(
        repo,
        /ui\/other \(build-client\.mjs --check\): exit 1, not a stale-output report/,
        {
          intercept: async (req, real) => {
            if (!isCheck(req) || !req.cwd.endsWith(OTHER)) return undefined
            const result = await real()
            assert.equal(result.status, 1, 'the builder itself reports its output stale')
            return { ...result, stderr: extra(result.stderr.trim()) }
          }
        }
      )
    })

  test('one failed check stops the run even when another package is honestly stale', async () => {
    const repo = cloneRepo()
    edit(repo, `${OTHER}/src/client/index.ts`, 'other-base', 'other-next')
    edit(repo, `${TAB}/src/client/index.ts`, 'return [ctx.client,', 'return [ctx.undeclared, ctx.client,')
    await assertRefusedUntouched(repo, /not a stale-output report/)
  })
})

describe('regenerate-bundles: arguments and the artifacts directory', () => {
  test('parseArgs accepts exactly one --artifacts and nothing else', async () => {
    const { parseArgs, UsageError } = await load()
    assert.deepEqual(parseArgs(['--artifacts', '/tmp/x']), { artifacts: '/tmp/x' })
    assert.deepEqual(parseArgs(['--artifacts=/tmp/x']), { artifacts: '/tmp/x' })
    for (const bad of [
      [],
      ['--artifacts'],
      ['--artifacts', ''],
      ['--artifacts='],
      ['--artifacts', '--artifacts', '/tmp/x'],
      ['--artifacts', '/tmp/x', '--artifacts', '/tmp/y'],
      ['--artifacts=/tmp/x', '--artifacts=/tmp/x'],
      ['--artifacts', '/tmp/x', 'extra'],
      ['--artifacts', '/tmp/x', '--force'],
      ['--stage', '--artifacts', '/tmp/x'],
      ['/tmp/x']
    ])
      assert.throws(() => parseArgs(bad), UsageError, JSON.stringify(bad))
  })

  test('the command line exits 2 on a usage error and 1 on a bad artifacts directory, before touching the checkout', () => {
    const cli = (...args) =>
      spawnSync('node', [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 })
    const inside = join(ROOT, 'scripts')
    const entries = readdirSync(inside).length
    for (const [args, status, pattern] of [
      [[], 2, /--artifacts is required[\s\S]*usage:/],
      [['--artifacts', SCRATCH, '--bogus'], 2, /unknown argument "--bogus"/],
      [['--artifacts', SCRATCH, '--artifacts', SCRATCH], 2, /more than once/],
      [['--artifacts', join(SCRATCH, 'not-there')], 1, /does not exist/],
      [['--artifacts', inside], 1, /is inside the worktree/],
      [['--artifacts', ROOT], 1, /is inside the worktree/]
    ]) {
      const result = cli(...args)
      assert.equal(result.status, status, `${JSON.stringify(args)} → ${result.stderr}`)
      assert.match(result.stderr, pattern)
    }
    assert.equal(readdirSync(inside).length, entries, 'nothing was written into the worktree')
  })

  test('an artifacts path that is absent, a file or inside the worktree is refused before any child runs', async () => {
    const repo = cloneRepo()
    const state = treeState(repo)
    const file = join(SCRATCH, 'a-file')
    writeFileSync(file, 'x')
    for (const [artifacts, pattern] of [
      [undefined, /artifacts directory is required/],
      ['', /artifacts directory is required/],
      [join(SCRATCH, 'absent'), /does not exist/],
      [file, /is not a directory/],
      [repo, /is inside the worktree/],
      [join(repo, 'packages'), /is inside the worktree/]
    ]) {
      const h = await harness(repo)
      const report = await h.go({ artifacts })
      assert.equal(report.ok, false)
      assert.match(report.problems.join('\n'), pattern)
      assert.equal(h.calls.length, 0, 'no child process at all')
    }
    assert.deepEqual(treeState(repo), state)
  })

  test('a directory that is not the top of a Git worktree is refused', async () => {
    const repo = cloneRepo()
    const h = await harness(repo)
    const report = await h.go({ repo: join(repo, 'packages') })
    assert.equal(report.ok, false)
    assert.match(report.problems.join('\n'), /is not the top of a Git worktree/)
    assert.deepEqual(h.builds(), [])
  })
})

describe('regenerate-bundles: manifests and generators it does not recognise are refused', () => {
  const cases = [
    [
      'a manifest that is not JSON',
      (repo) => writeFileSync(join(repo, OTHER, 'package.json'), '{ "name": '),
      /ui\/other\/package\.json: cannot be read as a package manifest/
    ],
    [
      'an empty manifest',
      (repo) => writeFileSync(join(repo, OTHER, 'package.json'), ''),
      /ui\/other\/package\.json: cannot be read as a package manifest/
    ],
    [
      'a manifest that is an array',
      (repo) => writeFileSync(join(repo, OTHER, 'package.json'), '[]'),
      /ui\/other\/package\.json: has no `build` script/
    ],
    [
      'a manifest without a build script',
      (repo) => writeFileSync(join(repo, OTHER, 'package.json'), JSON.stringify({ name: 'x', scripts: {} })),
      /ui\/other\/package\.json: has no `build` script/
    ],
    [
      'a build script with extra shell syntax',
      (repo) =>
        writeFileSync(join(repo, OTHER, 'package.json'), manifest('x', `${CLIENT_ONLY}; touch pwned`)),
      /not one of the known forms/
    ],
    [
      'a build script through another tool',
      (repo) =>
        writeFileSync(join(repo, OTHER, 'package.json'), manifest('x', 'tsx scripts/build-client.mjs')),
      /not one of the known forms/
    ],
    [
      'a build script that skips a tracked generator',
      (repo) => writeFileSync(join(repo, CONSUMER, 'package.json'), manifest('x', CLIENT_ONLY)),
      /site\/consumer: tracks build-client\.mjs \+ build-host\.mjs but `build` runs build-client\.mjs/
    ],
    [
      'a build script that runs a generator the package does not track',
      (repo) => writeFileSync(join(repo, OTHER, 'package.json'), manifest('x', CLIENT_HOST)),
      /ui\/other: tracks build-client\.mjs but `build` runs build-client\.mjs \+ build-host\.mjs/
    ],
    [
      'a palette build in a package without the palette generator',
      (repo) => writeFileSync(join(repo, CONSUMER, 'package.json'), manifest('x', PALETTE_BUILD)),
      /`build` runs the palette but scripts\/gen-palette\.mjs is not tracked/
    ],
    [
      'an unknown generator next to a known one',
      (repo) => {
        writeFileSync(join(repo, OTHER, 'scripts/build-styles.mjs'), 'console.log(1)\n')
        git(repo, 'add', `${OTHER}/scripts/build-styles.mjs`)
      },
      /ui\/other\/scripts\/build-styles\.mjs: a generator this command does not know/
    ],
    [
      'a palette generator the build script does not run',
      (repo) => {
        writeFileSync(join(repo, OTHER, 'scripts/gen-palette.mjs'), 'console.log(1)\n')
        git(repo, 'add', `${OTHER}/scripts/gen-palette.mjs`)
      },
      /ui\/other\/scripts\/gen-palette\.mjs: a generator this command does not know/
    ],
    [
      'an output that is not tracked',
      (repo) => git(repo, 'rm', '-q', '--cached', `${OTHER}/lib/client.js`),
      /ui\/other\/lib\/client\.js: the output of a generator but not tracked/
    ],
    [
      'a manifest that is not tracked',
      (repo) => git(repo, 'rm', '-q', '--cached', `${OTHER}/package.json`),
      /ui\/other: has a generator but no tracked package\.json/
    ],
    [
      'a tracked generator missing from disk',
      (repo) => rmSync(join(repo, OTHER, 'scripts/build-client.mjs')),
      /ui\/other \(build-client\.mjs --check\): exit 1, not a stale-output report/
    ],
    [
      'a palette input that is not tracked',
      (repo) => git(repo, 'rm', '-q', '--cached', FAVICON),
      /palette input docs\/design\/brand\/favicon\/tracy-favicon\.svg is not tracked/
    ]
  ]
  for (const [name, breakIt, pattern] of cases) {
    test(name, async () => {
      const repo = cloneRepo()
      breakIt(repo)
      await assertRefusedUntouched(repo, pattern)
    })
  }

  test('a repository with no generator under packages/ is refused rather than called clean', async () => {
    const repo = join(SCRATCH, 'empty-repo')
    mkdirSync(repo)
    write(join(repo, 'packages/x/package.json'), manifest('x', 'true'))
    git(repo, 'init', '-q', '-b', 'main')
    git(repo, 'add', '-A')
    git(repo, 'commit', '-q', '-m', 'no generators')
    await assertRefusedUntouched(repo, /no tracked scripts\/build-client\.mjs or scripts\/build-host\.mjs/)
  })

  test('a palette generator that reads an input this command does not know is refused', async () => {
    const repo = cloneRepo()
    appendFileSync(
      join(repo, BRAND, 'scripts/gen-palette.mjs'),
      "\nreadFileSync(path.join(root, 'src/client/index.ts'), 'utf8')\n"
    )
    await assertRefusedUntouched(repo, /gen-palette\.mjs exited 1 on a copy of its known inputs/)
  })
})

describe('regenerate-bundles: a child that cannot run, fails, is signalled, overflows or times out', () => {
  test('runProcess reports each abnormal end as a field and never rejects', async () => {
    const { runProcess } = await load()
    const base = { cwd: SCRATCH, timeoutMs: 20_000, maxOutputBytes: 1024 * 1024 }
    const ok = await runProcess({ ...base, argv: ['node', '-e', 'console.log("out"); console.error("err")'] })
    assert.deepEqual(
      { ...ok, stdout: ok.stdout.trim(), stderr: ok.stderr.trim() },
      { ...OK, stdout: 'out', stderr: 'err' }
    )
    assert.equal((await runProcess({ ...base, argv: ['node', '-e', 'process.exit(3)'] })).status, 3)
    const missing = await runProcess({ ...base, argv: [join(SCRATCH, 'no-such-binary')] })
    assert.match(missing.error, /ENOENT/)
    assert.equal(missing.status, null)
    const signalled = await runProcess({
      ...base,
      argv: ['node', '-e', 'process.kill(process.pid, "SIGTERM"); setInterval(() => {}, 1000)']
    })
    assert.equal(signalled.signal, 'SIGTERM')
    const slow = await runProcess({
      ...base,
      timeoutMs: 300,
      argv: ['node', '-e', 'setInterval(() => {}, 1000)']
    })
    assert.equal(slow.timedOut, true)
    assert.equal(slow.status, null)
    const loud = await runProcess({
      ...base,
      maxOutputBytes: 1000,
      argv: ['node', '-e', 'setInterval(() => process.stdout.write("x".repeat(4096)), 1)']
    })
    assert.equal(loud.overflow, true)
    assert.ok(loud.stdout.length <= 1000)
    // A timeout also stops what the child started (a build is `pnpm` → `sh` → `node`).
    const marker = join(SCRATCH, 'grandchild-wrote')
    const grandchild = `setTimeout(() => require('fs').writeFileSync(${JSON.stringify(marker)}, 'late'), 1500)`
    const tree = await runProcess({
      ...base,
      timeoutMs: 400,
      argv: ['sh', '-c', `node -e ${JSON.stringify(grandchild)}; true`]
    })
    assert.equal(tree.timedOut, true)
    await new Promise((done) => setTimeout(done, 1800))
    assert.equal(existsSync(marker), false, 'the grandchild was stopped with its parent')
  })

  const ABNORMAL = {
    'cannot be spawned': { status: null, error: 'spawn ENOENT' },
    'is ended by a signal': { status: null, signal: 'SIGKILL' },
    'times out': { status: null, signal: 'SIGKILL', timedOut: true },
    'overflows its output limit': { status: null, signal: 'SIGKILL', overflow: true },
    'exits non-zero': { status: 3, stderr: 'boom' }
  }
  const STAGES = {
    git: (req) => isGit(req) && req.argv.includes('--show-toplevel'),
    'a later git call': (req) => isGit(req) && req.argv.includes('-o'),
    'a --check': (req) => isCheck(req) && req.cwd.endsWith(TAB),
    'the palette generator': (req) => req.argv[0] === 'node' && req.argv[1] === 'scripts/gen-palette.mjs',
    'a build': (req, kinds) => kinds.isBuild(req),
    'the bundles gate': (req, kinds) => kinds.isGate(req)
  }
  for (const [stage, matches] of Object.entries(STAGES)) {
    for (const [how, shape] of Object.entries(ABNORMAL)) {
      test(`${stage} that ${how} ends the run red`, async () => {
        const repo = cloneRepo()
        edit(repo, `${OTHER}/src/client/index.ts`, 'other-base', 'other-next')
        const index = git(repo, 'ls-files', '-s', '-z')
        const answer = { ...OK, ...shape }
        const h = await harness(repo, {
          gate: (req) => (matches(req, { isBuild: () => false, isGate: () => true }) ? answer : OK),
          intercept: (req, _real, kinds) => (matches(req, kinds) ? answer : undefined)
        })
        const report = await h.go()
        assert.equal(report.ok, false)
        assert.ok(report.problems.length > 0)
        assert.equal(git(repo, 'ls-files', '-s', '-z'), index, 'nothing staged')
        if (stage !== 'a build' && stage !== 'the bundles gate')
          assert.deepEqual(h.builds(), [], 'nothing was built')
        if (stage !== 'the bundles gate')
          assert.equal(h.gates().length, 0, 'the gate cannot turn a failure green')
        assert.ok(readdirSync(report.runDir).includes('summary.json'), 'the run keeps its evidence')
        assert.equal(JSON.parse(readFileSync(join(report.runDir, 'summary.json'), 'utf8')).ok, false)
      })
    }
  }

  test('an adapter that throws is a failure, not a crash', async () => {
    const repo = cloneRepo()
    const h = await harness(repo, {
      intercept: (req) => {
        if (isCheck(req)) throw new Error('adapter exploded')
      }
    })
    const report = await h.go()
    assert.equal(report.ok, false)
    assert.match(report.problems.join('\n'), /could not run \(adapter exploded\)/)
  })

  test('the failed child keeps a log in the artifacts directory, and nothing is written into the worktree', async () => {
    const repo = cloneRepo()
    edit(repo, `${OTHER}/src/client/index.ts`, 'other-base', 'other-next')
    const h = await harness(repo, {
      intercept: (req, _real, kinds) =>
        kinds.isBuild(req) ? { ...OK, status: 1, stderr: 'esbuild: network unreachable' } : undefined
    })
    const report = await h.go()
    assert.equal(report.ok, false)
    assert.match(report.problems.join('\n'), /ui\/other: `pnpm run build` exited 1[\s\S]*network unreachable/)
    const log = readdirSync(report.runDir).find((name) => /build_.*other\.log$/.test(name))
    assert.ok(log, `a build log among ${readdirSync(report.runDir).join(', ')}`)
    assert.match(readFileSync(join(report.runDir, log), 'utf8'), /network unreachable/)
    assert.equal(git(repo, 'status', '--porcelain').trim(), `M ${OTHER}/src/client/index.ts`)
  })
})

describe('regenerate-bundles: a build that does not do exactly its job', () => {
  const staleOther = () => {
    const repo = cloneRepo()
    edit(repo, `${OTHER}/src/client/index.ts`, 'other-base', 'other-next')
    return repo
  }

  test('a build that fails after writing half an output: refused, the file named and left as it is', async () => {
    const repo = staleOther()
    const index = git(repo, 'ls-files', '-s', '-z')
    const h = await harness(repo, {
      intercept: (req, _real, kinds) => {
        if (!kinds.isBuild(req)) return undefined
        writeFileSync(join(repo, `${OTHER}/lib/client.js`), '/* half')
        return { ...OK, status: 1, stderr: 'killed mid-write' }
      }
    })
    const report = await h.go()
    assert.equal(report.ok, false)
    assert.match(report.problems.join('\n'), /outputs may be half written/)
    assert.deepEqual(report.changed, [`${OTHER}/lib/client.js`], 'the uncertain output is named')
    assert.equal(read(repo, `${OTHER}/lib/client.js`), '/* half', 'nothing is restored over it')
    assert.equal(git(repo, 'ls-files', '-s', '-z'), index, 'nothing staged')
    assert.equal(h.gates().length, 0)
  })

  test('a build that exits 0 without bringing the output up to date is refused', async () => {
    const repo = staleOther()
    const h = await harness(repo, { intercept: (req, _real, kinds) => (kinds.isBuild(req) ? OK : undefined) })
    const report = await h.go()
    assert.equal(report.ok, false)
    assert.match(
      report.problems.join('\n'),
      /still stale after rebuilding: packages\/ui\/other\/lib\/client\.js/
    )
    assert.equal(h.gates().length, 0)
  })

  const afterBuild = (mutate) => async (req, real, kinds) => {
    if (!kinds.isBuild(req)) return undefined
    const result = await real()
    mutate()
    return result
  }
  const SHARED_DOC = 'README.md'
  const containment = [
    [
      'changes an unrelated tracked file',
      (repo) => appendFileSync(join(repo, SHARED_DOC), 'x\n'),
      /changed outside the stale outputs[\s\S]*README\.md/
    ],
    [
      'creates an unrelated visible file',
      (repo) => writeFileSync(join(repo, OTHER, 'lib/client.js.map'), '{}'),
      /changed outside the stale outputs[\s\S]*ui\/other\/lib\/client\.js\.map/
    ],
    [
      'deletes a tracked file',
      (repo) => rmSync(join(repo, SHARED_DOC)),
      /changed outside the stale outputs[\s\S]*README\.md/
    ],
    // The second round of checks sees this one first: the bundle no longer matches its source.
    [
      "changes another package's fresh bundle",
      (repo) => appendFileSync(join(repo, CONSUMER, 'lib/client.js'), '\n'),
      /still stale after rebuilding: packages\/site\/consumer\/lib\/client\.js/
    ],
    [
      'changes a source while it runs',
      (repo) => appendFileSync(join(repo, OTHER, 'src/client/unrelated.ts'), '// edit\n'),
      /changed outside the stale outputs[\s\S]*ui\/other\/src\/client\/unrelated\.ts/
    ]
  ]
  for (const [what, mutate, pattern] of containment) {
    test(`a build that also ${what} is refused and the path reported`, async () => {
      const repo = staleOther()
      write(join(repo, SHARED_DOC), 'fixture\n')
      write(join(repo, OTHER, 'src/client/unrelated.ts'), 'export {}\n')
      git(repo, 'add', SHARED_DOC, `${OTHER}/src/client/unrelated.ts`)
      git(repo, 'commit', '-q', '-m', 'two unrelated tracked files')
      const h = await harness(repo, { intercept: afterBuild(() => mutate(repo)) })
      const report = await h.go()
      assert.equal(report.ok, false)
      assert.match(report.problems.join('\n'), pattern)
      assert.equal(h.gates().length, 0, 'the gate is not asked to bless it')
    })
  }

  test('a build that changes its own fresh companion bundle is refused', async () => {
    const repo = cloneRepo()
    edit(repo, `${CONSUMER}/src/host/index.ts`, 'host-base', 'host-next')
    const h = await harness(repo, {
      intercept: afterBuild(() => appendFileSync(join(repo, CONSUMER, 'lib/client.js'), '/* drift */'))
    })
    const report = await h.go()
    assert.equal(report.ok, false)
    // Appending makes the client bundle stale as well, which the second round of checks sees first.
    assert.match(report.problems.join('\n'), /site\/consumer\/lib\/client\.js/)
    assert.deepEqual(report.changed, [`${CONSUMER}/lib/client.js`, `${CONSUMER}/lib/index.js`])
    assert.equal(h.gates().length, 0)
  })

  test('a check that writes into the worktree is refused even when nothing was stale', async () => {
    const repo = cloneRepo()
    const h = await harness(repo, {
      intercept: async (req, real) => {
        if (!isCheck(req) || !req.cwd.endsWith(OTHER)) return undefined
        writeFileSync(join(repo, OTHER, 'check-scratch.txt'), 'left behind')
        return real()
      }
    })
    const report = await h.go()
    assert.equal(report.ok, false)
    assert.match(report.problems.join('\n'), /changed outside the stale outputs[\s\S]*check-scratch\.txt/)
    assert.equal(h.gates().length, 0)
  })
})

describe('regenerate-bundles: the unchanged bundles gate has the last word', () => {
  test('a red gate fails the run although every selected build succeeded', async () => {
    const repo = cloneRepo()
    edit(repo, `${OTHER}/src/client/index.ts`, 'other-base', 'other-next')
    const h = await harness(repo, {
      gate: { status: 1, stderr: 'Bundle gate: 1 problem\n  @fixture/x: bundle drifted from source' }
    })
    const report = await h.go()
    assert.equal(report.ok, false)
    assert.deepEqual(h.builds(), [OTHER])
    assert.deepEqual(report.rewritten, [`${OTHER}/lib/client.js`])
    assert.match(
      report.problems.join('\n'),
      /the bundles gate \(`pnpm exec tsx scripts\/check-all\.ts --only bundles`\) exited 1[\s\S]*bundle drifted from source/
    )
    assert.equal(h.gates().length, 1)
  })

  test('a red gate fails the run when nothing needed rebuilding', async () => {
    const repo = cloneRepo()
    const h = await harness(repo, { gate: { status: 1 } })
    const report = await h.go()
    assert.equal(report.ok, false)
    assert.deepEqual(h.builds(), [])
    assert.equal(report.gateRan, true)
  })

  test('the gate is the gate CI runs: package.json and check-all.ts still name it', async () => {
    const { FINAL_GATE_ARGV } = await load()
    // The final call runs the gate list CI runs, narrowed to the gate that holds the bundles.
    const list = FINAL_GATE_ARGV.find((arg) => arg.endsWith('check-all.ts'))
    const only = FINAL_GATE_ARGV[FINAL_GATE_ARGV.indexOf('--only') + 1]
    assert.ok(list && existsSync(join(ROOT, list)), `${FINAL_GATE_ARGV.join(' ')} names no gate list`)
    assert.match(
      readFileSync(join(ROOT, list), 'utf8'),
      new RegExp(`\\{ name: '${only}', script: 'check-bundles\\.ts' \\}`),
      `--only ${only} is not the bundles gate`
    )
    const scripts = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts
    const regen = scripts['bundles:regen']?.split(' ').at(-1) ?? ''
    assert.equal(resolve(ROOT, regen), fileURLToPath(new URL('../regenerate-bundles.mjs', import.meta.url)))
  })
})

describe('regenerate-bundles: every step runs inside the limits', () => {
  test('the limit for the whole run stops it between steps', async () => {
    const repo = cloneRepo()
    edit(repo, `${OTHER}/src/client/index.ts`, 'other-base', 'other-next')
    let clock = 0
    let checksStarted = 0
    let checksAtExpiry = 0
    const h = await harness(repo, {
      now: () => clock,
      deadlineMs: 12_000,
      intercept: async (req, real) => {
        if (!isCheck(req)) return undefined
        checksStarted += 1
        const result = await real()
        // Exhaust the fake budget after a real check finishes, never during a real child.
        if (clock === 0) checksAtExpiry = checksStarted
        clock = 12_001
        return result
      }
    })
    const report = await h.go()
    assert.equal(report.ok, false)
    assert.doesNotMatch(report.problems.join('\n'), /timed out and was stopped/)
    assert.match(report.problems.join('\n'), /the 12000 ms limit for the whole run is used up/)
    assert.ok(checksAtExpiry > 0, 'a real check completed before the deadline')
    assert.equal(h.checks().length, checksAtExpiry, 'no further check starts after the deadline')
    assert.equal(h.builds().length, 0, 'no build starts after the deadline')
    assert.equal(h.gates().length, 0)
  })

  test('every child is given a timeout no longer than its own limit and the time left', async () => {
    const repo = cloneRepo()
    edit(repo, `${OTHER}/src/client/index.ts`, 'other-base', 'other-next')
    const h = await harness(repo, {
      checkTimeoutMs: 7000,
      buildTimeoutMs: 9000,
      gateTimeoutMs: 11_000,
      gitTimeoutMs: 5000
    })
    const report = await h.go()
    assert.equal(report.ok, true)
    for (const req of h.calls) {
      const limit = isGit(req)
        ? 5000
        : isCheck(req)
          ? 7000
          : h.isBuild(req)
            ? 9000
            : req.argv[1] === 'scripts/gen-palette.mjs'
              ? 7000
              : 11_000
      assert.ok(
        req.timeoutMs > 0 && req.timeoutMs <= limit,
        `${req.argv.join(' ')}: ${req.timeoutMs} ≤ ${limit}`
      )
      assert.ok(req.maxOutputBytes > 0)
    }
  })
})
