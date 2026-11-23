/**
 * REG-PR-739-emdash-fresco-0-1-0: JA Fresco EmDash 0.1.0 holds together. One `ok -`/`not ok -` line
 * per `expect` of the case: S2 the package's own tests (seed composition, brand, display locale,
 * link gate, data links, the set:html guard, the road pre-check findings), S3 the slot roles check and the
 * personalize dry run, S4 the versions in the lock.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, nodeTest, ROOT, run } from './lib.mjs'

const PKG = 'packages/cms/tracy-emdash-theme-fresco'
const c = checks()

// Expect 1 and 5: the package's tests, each named so a deleted or renamed one turns this red.
const t = nodeTest(
  [
    'tests/composition.test.mjs',
    'tests/brand.test.mjs',
    'tests/display-locale.test.mjs',
    'tests/link-gate.test.mjs',
    'tests/data-links.test.mjs',
    'tests/set-html-safe.test.mjs',
    'tests/road-precheck.test.mjs'
  ],
  { cwd: PKG, extra: ['--test-concurrency=1'] }
)
c.tapClean('S2 package tests', t)
for (const name of [
  'every section of page-layout.json is a published seed entry',
  'the router imports views that exist',
  'every shipped font has a licence notice',
  'the chrome entry carries every word',
  'aboutDesc: a pasted event handler',
  'aboutDesc: the seed description keeps',
  'every set:html in src',
  'PAGE-5: no link field',
  'LANG-2: personalize labels names',
  'LANG-2: every interface word the components print',
  'LANG-2: every text a component prints',
  'LANG-2: the derivation finds what is missing',
  'ABOUT-2: every keptText id',
  'PAGE-8: the Blog page is covered',
  'DEF-1 and TEXT-1:',
  'CON-1, CON-2, ICON-1, BORDER-1:',
  'FORM-1: the contact and search fields',
  'IDENT-2: under a system'
])
  c.passes('S2', t, name)

// Expect 2: the slot roles of the contract.
const roles = run(process.execPath, ['scripts/slot-roles/check.mjs', `${PKG}/contracts/0.1.0`])
c.eq('S3 slot roles: exit code', roles.status, 0)
c.check(
  'S3 slot roles: reports passed',
  /slot-roles check passed/.test(roles.stdout),
  roles.stdout.slice(-300)
)

// Expect 3: the personalize dry run on a plain answer set.
const answers = JSON.stringify({
  name: 'Casa Luna',
  sector: 'restaurant',
  contact: '12 Harbour Road, Lisbon +351 21 000 000',
  email: 'hello@casaluna.example'
})
const dry = run(
  process.execPath,
  ['tools/personalize.mjs', '--answers-json', answers, '--dry-run', '--json'],
  {
    cwd: PKG
  }
)
c.check(
  'S3 dry run: exit code is 0, or 3 (no model key, copy skipped by design)',
  [0, 3].includes(dry.status),
  dry.status
)
let report = null
try {
  report = JSON.parse(dry.stdout)
} catch {}
c.check('S3 dry run: prints a JSON report', report !== null, dry.stdout.slice(0, 200))
c.eq('S3 dry run: errors', report?.errors?.length, 0)
c.check(
  'S3 dry run: lists planned entries',
  Array.isArray(report?.planned) && report.planned.length > 0,
  report?.planned
)

// Expect 4: no vulnerable hono in the lock (GHSA-jpvv-r467-5p4w, GHSA-qv5m-9pm6-hqp3).
const newer = (v, min) => {
  const a = v.split('.').map(Number)
  const b = min.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return true
}
const lock = readFileSync(join(ROOT, PKG, 'pnpm-lock.yaml'), 'utf8')
const seen = { '@hono/node-server': new Set(), hono: new Set() }
for (const m of lock.matchAll(/^ {2}'?(@hono\/node-server|hono)@(\d+\.\d+\.\d+)['(:]/gm)) seen[m[1]].add(m[2])
for (const [name, min] of [
  ['@hono/node-server', '2.1.6'],
  ['hono', '4.13.16']
]) {
  const found = [...seen[name]]
  c.check(`S4 lock: ${name} is locked`, found.length > 0, found)
  c.check(
    `S4 lock: no ${name} below ${min}`,
    found.every((v) => newer(v, min)),
    found
  )
}
c.done()
