// Policy: nothing under tests/qa reads a file with a raw filesystem call. Every read of a contract or
// evidence file (denominators, case files, manifests, oracles, coverage, results, proof logs) goes through
// lib/bounded-reader.mjs, tests and fixtures included. The few raw reads that remain are listed below with
// their exact count and reason, so a new one fails here until it is moved to the bounded reader or justified.
// The scanner (lib/raw-read-scan.mjs) understands a closed set of import and call forms and reports any
// other use of the filesystem module as unsupported; unsupported is a failure, never a silent skip.
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { readTextSync } from '../lib/bounded-reader.mjs'
import { scanSource } from '../lib/raw-read-scan.mjs'

const QA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// file (relative to tests/qa) → { count, reason }. Not a directory exemption: each entry is one file.
const RAW_READS = {
  'lib/bounded-reader.mjs': {
    count: 3,
    reason: 'the reader itself: openSync/readSync/open on the held descriptor'
  },
  'lib/git.mjs': {
    count: 1,
    reason:
      'working-tree fingerprint: hashes every tracked file of the product tree, of any size, for run identity; not a contract input'
  },
  'layers/ui/test/observe-check.mjs': {
    count: 1,
    reason: 'hashes product-tree files as a stream to compare before/after; not a contract input'
  },
  'layers/infra/lib/cases-host.mjs': {
    count: 1,
    reason:
      'torn-write probe of the product jobs writer: it must read while a writer renames over the file, which the bounded reader would (rightly) call unstable'
  },
  'fixtures/harness/fake-docker.mjs': {
    count: 1,
    reason: 'stand-in for the docker binary, run as its own process to read its own mode file'
  },
  'layers/mail/test/red.test.mjs': {
    count: 2,
    reason:
      "short-write seams: open the mutant file with writeChecked's own write flags and wrap the descriptor's write; nothing is read through them"
  },
  'selftest/fixtures/bounded-reader/preload.mjs': {
    count: 1,
    reason: 'the test seam that intercepts reads to change a file mid-read'
  }
}

function sources(dir = QA, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') sources(full, out)
    } else if (/\.(?:mjs|js|cjs)$/.test(entry.name)) out.push(full)
  }
  return out
}

test('no raw filesystem read under tests/qa outside the listed exceptions', () => {
  const seen = {}
  const unsupported = []
  for (const file of sources()) {
    const rel = path.relative(QA, file).split(path.sep).join('/')
    const scan = scanSource(readTextSync(file))
    if (scan.reads.length) seen[rel] = scan.reads.length
    for (const u of scan.unsupported) unsupported.push(`${rel}:${u.line}: ${u.why}`)
  }
  assert.deepEqual(
    unsupported,
    [],
    'a filesystem use the policy cannot classify must be rewritten or supported'
  )
  const unexpected = Object.entries(seen)
    .filter(([rel, count]) => count !== RAW_READS[rel]?.count)
    .map(([rel, count]) => `${rel}: ${count} raw read(s), allowed ${RAW_READS[rel]?.count ?? 0}`)
  const stale = Object.keys(RAW_READS)
    .filter((rel) => !(rel in seen))
    .map((rel) => `${rel}: listed but has no raw read any more`)
  assert.deepEqual([...unexpected, ...stale], [])
  for (const [rel, { reason }] of Object.entries(RAW_READS)) assert.ok(reason.length > 20, rel)
})

const reads = (source) => scanSource(source).reads.length
const unsupported = (source) => scanSource(source).unsupported.length

test('scanner: every supported way to read a file is found', () => {
  const forms = {
    'named import': "import { readFileSync } from 'node:fs'; readFileSync(a)",
    'aliased import': "import { readFileSync as rd } from 'fs'; rd(a)",
    'namespace import': "import * as fs from 'node:fs'; fs.readFileSync(a)",
    'default import': "import fs from 'node:fs'; fs.readFileSync(a, 'utf8')",
    'promises member': "import fs from 'node:fs'; await fs.promises.readFile(a)",
    'promises import': "import { promises as p } from 'node:fs'; await p.readFile(a)",
    'promises default': "import fsp from 'node:fs/promises'; await fsp.readFile(a)",
    'promises named': "import { readFile } from 'fs/promises'; await readFile(a)",
    'open for reading': "import { openSync } from 'node:fs'; openSync(a, 'r')",
    'open read-write': "import { open } from 'node:fs/promises'; await open(a, 'r+')",
    stream: "import { createReadStream } from 'node:fs'; createReadStream(a)",
    'dynamic import destructured': "const { readFile } = await import('node:fs/promises'); await readFile(a)",
    'dynamic import bound': "const fs = await import('node:fs'); fs.readFileSync(a)",
    'dynamic import then': "import('node:fs').then((fs) => fs.readFileSync(a))",
    'require declaration': "const fs = require('node:fs'); fs.readFileSync(a)",
    'json module import': "import data from './denominator.json' with { type: 'json' }",
    'json require': "const load = createRequire(import.meta.url); load('./cases.json')",
    'require destructured': "const { readFileSync } = require('fs'); readFileSync(a)"
  }
  for (const [name, source] of Object.entries(forms)) assert.equal(reads(source), 1, name)
})

test('scanner: what it cannot classify is reported, and writes or non-fs imports are not reads', () => {
  const bad = {
    'computed member': "import fs from 'node:fs'; fs['read' + 'FileSync'](a)",
    'module passed on': "import fs from 'node:fs'; use(fs)",
    'module returned': "import * as fs from 'node:fs'; export const get = () => fs",
    'module reassigned': "import fs from 'node:fs'; const g = fs; g.readFileSync(a)",
    'computed require': 'const fs = require(name)',
    'require outside a declaration': "use(require('node:fs'))",
    'createRequire alias reading fs outside a declaration':
      "const load = createRequire(import.meta.url); use(load('node:fs'))",
    'destructure with computed key': "const { [k]: r } = await import('node:fs')"
  }
  for (const [name, source] of Object.entries(bad)) assert.ok(unsupported(source) >= 1, name)
  const fine = {
    'write-only open': "import { openSync } from 'node:fs'; openSync(a, 'wx')",
    'write-only flags':
      "import { open, constants } from 'node:fs/promises'; await open(a, constants.O_WRONLY | constants.O_CREAT)",
    'listing and writing':
      "import { readdirSync, writeFileSync } from 'node:fs'; readdirSync(a); writeFileSync(b, c)",
    'another module named readFile': "import { readFile } from './mine.mjs'; readFile(a)",
    'createRequire alias loading code': "const load = createRequire(import.meta.url); load('acorn')",
    'createRequire alias bound to fs':
      "const load = createRequire(import.meta.url); const fs = load('node:fs'); fs.readdirSync(a)",
    'computed dynamic import of code': 'await import(pathToFileURL(file).href)',
    'object property named fs': 'const backend = { fs: [] }; backend.fs.push(1)'
  }
  for (const [name, source] of Object.entries(fine)) {
    const scan = scanSource(source)
    assert.equal(scan.reads.length + scan.unsupported.length, 0, name)
  }
})
