#!/usr/bin/env node
// Red-before-fix evidence: runs test files against the SOURCES of a base commit and passes only
// when that run is red for the right reason (a behaviour assertion, not a missing module).
//
//   red-on-base.mjs --base origin/develop --tests a.test.mjs,b.test.mjs --sources apps/tracy-web,apps/tracy-host
//                   --out DIR [--repo ROOT] [--borrow-install apps/tracy-web,apps/tracy-host] [--timeout-ms N]
//
// Generalised from the publish pilot's driver (SOURCE.md): no fixed source list or candidate tests,
// no helper outside this folder, no write outside --out. The base is derived, not assumed: the
// merge base of the repo's HEAD (and MERGE_HEAD when a merge is in progress) with --base.
//
// How: `git archive <base>` of --sources is unpacked into DIR/red-base/tree and CHECKED to be the
// base (every modified source file of the working tree is, in the tree, the base's blob). Each
// --borrow-install folder gets a node_modules SYMLINK to the repo's install, the --tests are copied
// over from the working tree, and `node --test --test-reporter=tap` runs there.
//
// Exit 0: the run is non-zero AND at least one failing test is an ERR_ASSERTION. Otherwise 1; 2 for
// a bad invocation. Writes DIR/red-on-base.tap and DIR/red-on-base.json; the unpacked tree goes away.

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, lstatSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

const BIG = 64 * 1024 * 1024

function die(message, code = 2) {
  console.error(`red-on-base: ${message}`)
  process.exit(code)
}

let args
try {
  args = parseArgs({
    options: {
      base: { type: 'string' },
      tests: { type: 'string' },
      sources: { type: 'string' },
      out: { type: 'string' },
      repo: { type: 'string', default: process.cwd() },
      'borrow-install': { type: 'string', default: '' },
      'timeout-ms': { type: 'string', default: String(25 * 60_000) }
    },
    allowPositionals: false,
    strict: true
  }).values
} catch (error) {
  die(error.message)
}
for (const name of ['base', 'tests', 'sources', 'out']) if (!args[name]) die(`--${name} is required`)
if (!/^[A-Za-z0-9._/-]+$/.test(args.base)) die('bad --base')
const REPO = path.resolve(args.repo)
const OUT = path.resolve(args.out)
const TREE = path.join(OUT, 'red-base', 'tree')
const csv = (v) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
const SOURCES = csv(args.sources)
const CANDIDATES = csv(args.tests)
const BORROW = csv(args['borrow-install'])
for (const rel of [...SOURCES, ...CANDIDATES, ...BORROW])
  if (path.isAbsolute(rel) || rel.split('/').includes('..')) die(`path escapes the repository: ${rel}`)

function git(gitArgs, options = {}) {
  const result = spawnSync('git', gitArgs, { cwd: REPO, encoding: 'utf8', maxBuffer: BIG, ...options })
  if (result.error || result.status !== 0)
    die(`git ${gitArgs.join(' ')}: ${result.stderr || result.error?.message}`)
  return result.stdout
}
if (!existsSync(path.join(REPO, '.git'))) die('--repo is not a repository root')
const isAncestor = (a, b) => {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: REPO })
  if (result.error || result.status > 1)
    die(`git merge-base --is-ancestor: ${result.stderr || result.error?.message}`)
  return result.status === 0
}
const merging = spawnSync('git', ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], {
  cwd: REPO,
  encoding: 'utf8'
})
const tips = ['HEAD', ...(merging.status === 0 && merging.stdout.trim() ? [merging.stdout.trim()] : [])]
let base = ''
for (const tip of tips) {
  const found = git(['merge-base', tip, args.base]).trim()
  if (!/^[0-9a-f]{40}$/.test(found)) die(`no merge base of ${tip} and ${args.base}`)
  if (base === '' || isAncestor(base, found)) base = found
}
for (const file of CANDIDATES) {
  let stat
  try {
    stat = lstatSync(path.join(REPO, file))
  } catch {
    die(`test file does not exist: ${file}`)
  }
  if (!stat.isFile()) die(`not a regular file: ${file}`)
}
// A test identical on the base proves nothing by failing there: only the others are run.
const changed = new Set(
  git(['diff', '--name-only', base, '--', ...CANDIDATES])
    .split('\n')
    .filter(Boolean)
)
const untracked = new Set(
  git(['ls-files', '--others', '--exclude-standard', '--', ...CANDIDATES])
    .split('\n')
    .filter(Boolean)
)
const TESTS = CANDIDATES.filter((file) => changed.has(file) || untracked.has(file))
if (TESTS.length === 0) die('no test file differs from the base: nothing to run', 1)
const has = (ref, file) => spawnSync('git', ['cat-file', '-e', `${ref}:${file}`], { cwd: REPO }).status === 0
const sources = SOURCES.filter((entry) => has(base, entry))
if (sources.length === 0) die('the base has none of the source trees')

rmSync(path.join(OUT, 'red-base'), { recursive: true, force: true })
mkdirSync(TREE, { recursive: true })
let ok = false
try {
  const archive = spawnSync('git', ['archive', '--format=tar', base, ...sources], {
    cwd: REPO,
    maxBuffer: 512 * 1024 * 1024
  })
  if (archive.status !== 0) die(`git archive: ${archive.stderr}`)
  const untar = spawnSync(
    'tar',
    ['-x', '-C', TREE, '--exclude', '*/lib/client.js', '--exclude', '*/lib/index.js'],
    { input: archive.stdout, maxBuffer: BIG }
  )
  if (untar.status !== 0) die(`tar: ${untar.stderr}`)
  // Proof the tree IS the base: every source file the working tree changed that the base has is,
  // in the unpacked tree, the base's blob.
  const touched = git(['diff', '--name-only', '--diff-filter=M', base, '--', ...sources])
    .split('\n')
    .filter((file) => file && !/\/lib\/(client|index)\.js$/.test(file))
  if (touched.length === 0)
    die('the working tree changes no source the base has: nothing to prove red against')
  for (const file of touched) {
    const unpacked = path.join(TREE, file)
    if (!existsSync(unpacked) || !lstatSync(unpacked).isFile()) die(`the unpacked tree lacks ${file}`)
    const mine = spawnSync('git', ['hash-object', unpacked], { cwd: REPO, encoding: 'utf8' })
    const theirs = git(['rev-parse', `${base}:${file}`]).trim()
    if (mine.status !== 0 || mine.stdout.trim() !== theirs)
      die(`the unpacked tree is not the base: ${file} differs from ${base.slice(0, 12)}`)
  }
  for (const dir of BORROW) {
    const from = path.join(REPO, dir, 'node_modules')
    if (!existsSync(from)) die(`no install to borrow: ${from}`)
    mkdirSync(path.join(TREE, dir), { recursive: true })
    if (!existsSync(path.join(TREE, dir, 'node_modules')))
      symlinkSync(from, path.join(TREE, dir, 'node_modules'), 'dir')
  }
  for (const file of TESTS) {
    mkdirSync(path.dirname(path.join(TREE, file)), { recursive: true })
    cpSync(path.join(REPO, file), path.join(TREE, file))
  }

  const run = spawnSync(
    process.execPath,
    ['--test', '--test-reporter=tap', '--test-timeout=120000', ...TESTS],
    {
      cwd: TREE,
      encoding: 'utf8',
      maxBuffer: BIG,
      timeout: Number(args['timeout-ms']),
      env: { ...process.env, NODE_TEST_CONTEXT: undefined, TRACY_TEST_DEPS_ROOT: REPO }
    }
  )
  if (run.error) die(`the base run did not finish: ${run.error.message}`)
  const tap = `${run.stdout}${run.stderr}`
  mkdirSync(OUT, { recursive: true })
  writeFileSync(path.join(OUT, 'red-on-base.tap'), tap)

  // Top-level results only: a file is one `not ok` when it could not even be loaded.
  const blocks = tap.split(/\n(?=(?:not ok|ok) \d+ - )/)
  const failures = []
  let total = 0
  for (const block of blocks) {
    const head = /^(not ok|ok) \d+ - (.*)/.exec(block)
    if (!head) continue
    total++
    if (head[1] === 'ok') continue
    const kind = /ERR_MODULE_NOT_FOUND|Cannot find module|does not provide an export named/.test(block)
      ? 'missing-module'
      : /ERR_ASSERTION/.test(block)
        ? 'assertion'
        : 'other'
    failures.push({ name: head[2].trim().slice(0, 200), kind })
  }
  const count = (kind) => failures.filter((failure) => failure.kind === kind).length
  const summary = {
    base,
    baseRef: args.base,
    exit: run.status,
    tests: total,
    failed: failures.length,
    assertion: count('assertion'),
    missingModule: count('missing-module'),
    other: count('other'),
    files: TESTS,
    verifiedBaseFiles: touched.length,
    log: 'red-on-base.tap',
    failures
  }
  writeFileSync(path.join(OUT, 'red-on-base.json'), `${JSON.stringify(summary, null, 2)}\n`)
  console.log(
    `red-on-base: base ${base.slice(0, 12)} exit=${run.status} — ${failures.length} of ${total} fail there: ` +
      `${summary.assertion} behaviour assertion(s), ${summary.missingModule} missing module, ${summary.other} other`
  )
  if (run.status === 0) die('the tests PASS on the base: they prove nothing', 1)
  if (summary.assertion === 0) die('no behaviour assertion fails on the base: only missing modules', 1)
  ok = true
} finally {
  rmSync(path.join(OUT, 'red-base'), { recursive: true, force: true })
  if (existsSync(path.join(OUT, 'red-base'))) {
    console.error('red-on-base: could not remove the unpacked tree')
    ok = false
  }
}
process.exit(ok ? 0 : 1)
