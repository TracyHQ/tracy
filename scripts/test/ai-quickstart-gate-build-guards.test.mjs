// Every stop code of the build team's write step is decided by hand in the gate (ticket #586, review round 2): a guard
// of the build (recorded only), a code a site gives, or a code of the run's own state (the measurement cannot pass).
// The codes are read where they are thrown, in the domain files and in the app's step chain files, and the test fails
// when one is on no list or a listed one is gone, so a person decides each change. A run state code is never a build
// guard: a stale run record does not excuse a value.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  BUILD_GUARD_CODES,
  PLANNER_GUARD_CODES,
  RUN_STATE_CODES,
  SITE_CODES
} from '../ai-quickstart/gate/build-guards.mjs'
import { buildRefusalOf, stopClassOf } from '../ai-quickstart/gate/write-safety-judge.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DOMAIN = 'packages/wo/website-opportunities/domain'
const APP = 'apps/tracy-web/src'

/** The codes thrown or reported in one file, by the shapes the build team writes them in. */
function codesOf(text, { lists = false } = {}) {
  const out = new Set()
  const add = (re) => {
    for (const m of text.matchAll(re)) out.add(m[1])
  }
  add(/new (?:DraftWriteError|WriteOrderError)\(\s*'([a-z_]+)'/g)
  add(/new Error\([^;]*?\{\s*code: '([a-z_]+)'/gs)
  add(/failed: \{ op: [^,]+, code: '([a-z_]+)'/g)
  add(/_STOP = '([a-z_]+)'/g)
  // A code thrown through a named constant of the same file (`new DraftWriteError(SHEETS_UNREADABLE, ...)`).
  for (const m of text.matchAll(/new (?:DraftWriteError|WriteOrderError)\(\s*([A-Z][A-Z_]+)\b/g)) {
    const named = new RegExp('const ' + m[1] + " = '([a-z_]+)'").exec(text)
    if (named) out.add(named[1])
  }
  if (lists) {
    add(/\breport\('([a-z_]+)'/g)
    for (const m of text.matchAll(/NO_RERUN = Object\.freeze\(\[([\s\S]*?)\]\)/g))
      for (const c of m[1].matchAll(/'([a-z_]+)'/g)) out.add(c[1])
  }
  return out
}

/**
 * The files of the build's planner (review 7 D1): the plan composer the marker build calls and every domain file it
 * imports, read by the import graph so a new planner file is read too.
 */
function plannerFiles() {
  const seen = new Set()
  const queue = ['plan-composer.mjs']
  while (queue.length) {
    const name = queue.pop()
    if (seen.has(name)) continue
    seen.add(name)
    const text = readFileSync(path.join(ROOT, DOMAIN, name), 'utf8')
    for (const m of text.matchAll(/from '\.\/([a-z0-9-]+\.mjs)'/g)) queue.push(m[1])
  }
  return [...seen].sort()
}

/**
 * The codes the planner throws: the first argument of every `new PlanComposerError(` (a literal, or each literal of a
 * conditional), and of a file's own `fail(` that wraps it.
 */
function plannerCodesOf(text) {
  const out = new Set()
  const heads = [...text.matchAll(/new PlanComposerError\(([^,]*),/g)].map((m) => m[1])
  if (/const fail = \(code[^\n]*\n\s*throw new PlanComposerError\(code/.test(text))
    heads.push(...[...text.matchAll(/\bfail\(\s*('[a-z_]+')/g)].map((m) => m[1]))
  for (const head of heads) for (const c of head.matchAll(/'([a-z_]+)'/g)) out.add(c[1])
  return out
}

function plannerCodes() {
  const codes = new Set()
  for (const name of plannerFiles())
    for (const c of plannerCodesOf(readFileSync(path.join(ROOT, DOMAIN, name), 'utf8'))) codes.add(c)
  return codes
}

/** Every code the write step can stop with, from both places it is thrown. */
function thrownCodes() {
  const codes = new Set()
  for (const name of readdirSync(path.join(ROOT, DOMAIN)).filter((n) =>
    /^(?:draft-write-.*|write-order(?:-error|-input)?|write-order)\.mjs$/.test(n)
  ))
    for (const c of codesOf(readFileSync(path.join(ROOT, DOMAIN, name), 'utf8'), {
      lists: name.startsWith('draft-write-') || name.endsWith('-error.mjs')
    }))
      codes.add(c)
  for (const name of readdirSync(path.join(ROOT, APP)).filter((n) => /^step-chain-draft-.*\.js$/.test(n)))
    for (const c of codesOf(readFileSync(path.join(ROOT, APP, name), 'utf8'))) codes.add(c)
  for (const c of plannerCodes()) codes.add(c)
  return codes
}

test('T2: every code the write step throws, in the domain and in the app, is decided on exactly one list', () => {
  const thrown = thrownCodes()
  assert.ok(thrown.size > 40, 'the scan found the codes: ' + thrown.size)
  const decided = [
    ...BUILD_GUARD_CODES,
    ...PLANNER_GUARD_CODES,
    ...Object.keys(SITE_CODES),
    ...Object.keys(RUN_STATE_CODES)
  ]
  assert.equal(new Set(decided).size, decided.length, 'a code is on two lists')
  const undecided = [...thrown].filter((c) => !decided.includes(c)).sort()
  assert.deepEqual(undecided, [], 'decide each new code: a build guard, a site code or a run state code')
  const gone = decided.filter((c) => !thrown.has(c)).sort()
  assert.deepEqual(gone, [], 'a listed code is no longer thrown: take it off its list')
})

test('T2: the codes of the app step chain the review named are decided', () => {
  const thrown = thrownCodes()
  for (const code of [
    'door_not_available',
    'accent_module_unbuilt',
    'stored_picture_gone',
    'sheets_unreadable'
  ])
    assert.ok(thrown.has(code), code + ' is read from the app files')
})

test('T2: a run state stop is never the build own, and an unknown code is a failure of the site', () => {
  const of = (code) => stopClassOf({ code, details: { op: 'copy:site.hero' } }).kind
  assert.equal(of('write_record_stale'), 'run_state')
  assert.equal(of('stored_picture_gone'), 'run_state')
  assert.equal(of('accent_module_unbuilt'), 'refused_by_build')
  assert.equal(of('door_not_available'), 'server_error')
  assert.equal(of('sheets_unreadable'), 'server_error')
  assert.equal(of('a_code_nobody_named'), 'server_error')
  assert.ok(!BUILD_GUARD_CODES.includes('write_record_stale'))
})

test('D1: the planner codes are read from the planner files and decided, plan_gate_failed among them', () => {
  const planner = plannerCodes()
  assert.ok(planner.has('plan_gate_failed'), 'read where the plan composer throws it')
  assert.ok(planner.has('site_name_missing') && planner.has('language_invalid'))
  assert.deepEqual([...planner].filter((c) => !PLANNER_GUARD_CODES.includes(c)).sort(), [])
})

test('D1: plan_gate_failed is a build refusal only when the planner refused facts the probe left blank', () => {
  const thrown = (problems) =>
    buildRefusalOf(
      {
        error: Object.assign(new Error('the plan failed the gate'), {
          code: 'plan_gate_failed',
          details: { problems }
        })
      },
      new Set()
    ).kind
  const blank = {
    code: 'invented_item',
    at: 'pages[0].blocks[2].data[1]',
    message: '"studio-name" is not a fact'
  }
  assert.equal(thrown([blank, blank]), 'refused_by_build')
  // Another rule of the plan gate, or a reply the planner could not read, is not decided as a value refusal.
  assert.equal(thrown([blank, { code: 'reply_unreadable', at: '' }]), 'unclassified')
  assert.equal(thrown([]), 'unclassified')
})
