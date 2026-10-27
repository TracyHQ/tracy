#!/usr/bin/env node
// Baseline proof for #41: the regression tests of scripts/test/issue41.test.mjs, run against the
// production code of a base commit, must fail on an ASSERTION for every item M6-15 … M6-20. A test
// that fails on anything else (a module that does not load, a TypeError, a timeout) is recorded
// as an infrastructure failure and proves nothing; an assertion that only finds a helper or a file
// of the fix missing ("missing on this tree", from the test file's `need()`) is recorded as
// missing and proves nothing either.
//
// The base commit's package is extracted with `git archive` into a temporary directory under
// TRACY_TEST_SCRATCH (else the system's), never the output directory; the current test file and
// its fixtures (fixtures/issue41: the JA Vega facts, the wp-cli and docker stand-ins) are copied
// over it, node_modules is linked from this package. The directory is removed afterwards. A test
// of an item that passes on the base is listed as such.
//
// Usage: node scripts/test/issue41-baseline.mjs --base <commit> [--timeout <s>] --out <dir>
// Exit 0 when every item reproduced; 1 otherwise; 2 on a usage error.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, cpSync, symlinkSync, writeFileSync, existsSync, lstatSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { run } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = resolve(here, '..', '..')
const ITEMS = ['M6-15', 'M6-16', 'M6-17', 'M6-18', 'M6-19', 'M6-20']
const COPIED = ['scripts/test/issue41.test.mjs', 'scripts/test/fixtures/issue41/ja-vega.json', 'scripts/test/fixtures/issue41/fake-wp.mjs', 'scripts/test/fixtures/issue41/fake-docker.mjs']
const scratchRoot = () => {
  const d = process.env.TRACY_TEST_SCRATCH || tmpdir()
  mkdirSync(d, { recursive: true })
  return d
}

function args(argv) {
  const o = { timeout: 300 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => {
      const v = argv[++i]
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`)
      return v
    }
    if (a === '--base') o.base = next()
    else if (a === '--out') o.out = resolve(next())
    else if (a === '--timeout') {
      o.timeout = Number(next())
      if (!Number.isFinite(o.timeout) || o.timeout <= 0) throw new Error('--timeout takes seconds')
    } else throw new Error(`unknown argument ${a}`)
  }
  if (!o.base) throw new Error('--base <commit> is required')
  if (!o.out) throw new Error('--out <dir> is required')
  if (!/^[0-9a-f]{7,40}$/i.test(o.base)) throw new Error(`--base: "${o.base}" is not a commit id`)
  return o
}

function git(argv, opts = {}) {
  const r = spawnSync('git', argv, { cwd: pkg, encoding: opts.encoding ?? 'utf8', maxBuffer: 1 << 30, input: opts.input })
  if (r.error || r.status !== 0) throw new Error(`git ${argv.join(' ')}: ${r.error?.message ?? String(r.stderr).trim()}`)
  return r.stdout
}

/** The base commit's copy of this package, with the current regression tests over it. */
function checkout(base) {
  const top = git(['rev-parse', '--show-toplevel']).trim()
  const rel = pkg.slice(top.length + 1)
  const dir = mkdtempSync(join(scratchRoot(), 'i41-base-'))
  // Whatever fails between here and the return — archive, extract, copy, link — takes the
  // temporary directory with it: the caller only owns it once it has it.
  try {
    const tar = spawnSync('git', ['archive', '--format=tar', base, rel], { cwd: top, maxBuffer: 1 << 30 })
    if (tar.status !== 0) throw new Error(`git archive ${base}: ${String(tar.error?.message ?? tar.stderr).trim()}`)
    const x = spawnSync('tar', ['-x', '-C', dir], { input: tar.stdout })
    if (x.status !== 0) throw new Error(`tar -x: ${String(x.error?.message ?? x.stderr).trim()}`)
    const root = join(dir, rel)
    for (const f of COPIED) {
      mkdirSync(dirname(join(root, f)), { recursive: true })
      cpSync(join(pkg, f), join(root, f))
    }
    const modules = join(pkg, 'node_modules')
    if (!existsSync(modules) || !lstatSync(modules).isDirectory()) throw new Error(`${modules} is missing: run npm ci first`)
    symlinkSync(modules, join(root, 'node_modules'), 'dir')
    return { dir, root }
  } catch (e) {
    rmSync(dir, { recursive: true, force: true })
    throw e
  }
}

const assertionOf = (error) => {
  for (let e = error, depth = 0; e && depth < 5; e = e.cause, depth++) if (e.code === 'ERR_ASSERTION' || e.name === 'AssertionError') return e
  return null
}

async function main() {
  const o = args(process.argv.slice(2))
  const commit = git(['rev-parse', '--verify', `${o.base}^{commit}`]).trim()
  if (existsSync(o.out) && (lstatSync(o.out).isSymbolicLink() || !lstatSync(o.out).isDirectory())) throw new Error(`--out ${o.out} exists and is not a directory`)
  mkdirSync(o.out, { recursive: true })
  const { dir, root } = checkout(commit)
  const results = []
  let loadError = null
  let scratch = null
  try {
    scratch = mkdtempSync(join(scratchRoot(), 'i41-base-scratch-'))
    const stream = run({
      files: [join(root, 'scripts', 'test', 'issue41.test.mjs')],
      cwd: root,
      timeout: o.timeout * 1000,
      env: { ...process.env, TRACY_TEST_SCRATCH: scratch }
    })
    for await (const ev of stream) {
      if (ev.type !== 'test:pass' && ev.type !== 'test:fail') continue
      const d = ev.data
      if (d.details?.type === 'suite' || d.nesting > 0) continue
      const name = d.name
      if (ev.type === 'test:pass') {
        results.push({ name, outcome: 'pass' })
        continue
      }
      const err = d.details?.error
      const assertion = assertionOf(err)
      // A failure of the file itself (it did not load) comes back under the file's name.
      if (name.endsWith('.mjs')) loadError = String(err?.cause?.message ?? err?.message ?? err)
      const missing = assertion && /missing on this tree/.test(String(assertion.message))
      results.push({
        name,
        outcome: missing ? 'missing' : assertion ? 'assertion' : 'infrastructure',
        message: String((assertion ?? err?.cause ?? err)?.message ?? err).split('\n').slice(0, 6).join('\n')
      })
    }
  } finally {
    // The runner can throw mid-stream: the scratch and the checkout go either way.
    if (scratch) rmSync(scratch, { recursive: true, force: true })
    rmSync(dir, { recursive: true, force: true })
  }
  const items = ITEMS.map((item) => {
    const tests = results.filter((r) => r.name.startsWith(`${item}:`))
    return {
      item,
      reproduced: tests.some((t) => t.outcome === 'assertion'),
      tests
    }
  })
  const report = { base: commit, ranAt: new Date().toISOString(), loadError, items, other: results.filter((r) => !/^M6-\d+:/.test(r.name)).map(({ name, outcome }) => ({ name, outcome })) }
  writeFileSync(join(o.out, 'baseline.json'), JSON.stringify(report, null, 2) + '\n')
  const lines = [`# #41 baseline on ${commit}`, '', loadError ? `LOAD ERROR: ${loadError}\n` : '']
  for (const it of items) {
    lines.push(`## ${it.item}: ${it.reproduced ? 'REPRODUCED' : 'NOT REPRODUCED'}`)
    for (const t of it.tests) lines.push(`- ${t.outcome.toUpperCase()} — ${t.name}${t.message ? `\n  ${t.message.replace(/\n/g, '\n  ')}` : ''}`)
    lines.push('')
  }
  writeFileSync(join(o.out, 'baseline.md'), lines.join('\n'))
  for (const it of items) console.log(`${it.reproduced ? 'REPRODUCED    ' : 'NOT REPRODUCED'} ${it.item} (${it.tests.map((t) => t.outcome).join(', ') || 'no test'})`)
  console.log(`report: ${join(o.out, 'baseline.md')}`)
  return !loadError && items.every((it) => it.reproduced) ? 0 : 1
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`issue41-baseline: ${e.message}`)
    process.exit(/required|needs a value|unknown argument|takes seconds|not a commit id|not a directory/.test(e.message) ? 2 : 1)
  }
)
