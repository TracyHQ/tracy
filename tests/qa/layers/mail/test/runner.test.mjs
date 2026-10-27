// Selftest of the runner: strict CLI and input contract before any effect, the oracle catalogue, the
// four verdict paths (known-good PASS, injected fault FAIL, missing dependency ENV, no RED PENDING),
// the suite event protocol, artifact ownership and the receipt schema.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  UsageError,
  claimNewFile,
  REPO_ROOT,
  claimOutputDir,
  parseFlags,
  readRegularFile,
  writeAtomic
} from '../common.mjs'
import {
  classifyCase,
  exitCodeFor,
  listCases,
  loadCases,
  oracleIneligible,
  parseRef,
  run,
  validateCase,
  validateRunInput
} from '../index.mjs'
import { REPORTER_FILE, judgeSuite, parseEvents, probeDatabase, redTests, runSuite } from '../legacy.mjs'
import { MUTANTS, applyMutant, makeScratch } from '../red.mjs'
import { PROTOCOL, VERSION } from '../suite-reporter.mjs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

const RUN = fileURLToPath(new URL('../run.mjs', import.meta.url))
const BASE = process.env.QA_MAIL_ARTIFACTS ? path.resolve(process.env.QA_MAIL_ARTIFACTS) : tmpdir()
const tmp = (t) => {
  mkdirSync(BASE, { recursive: true })
  const dir = mkdtempSync(path.join(BASE, 'qa-mail-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}
const cli = (...args) => spawnSync(process.execPath, ['--import', 'tsx', RUN, ...args], { encoding: 'utf8' })

const byId = async (id) => {
  const c = (await listCases()).find((x) => x.id === id)
  assert.ok(c, `case ${id} exists`)
  return c
}
const reserved = () => byId('QA-MAIL-comment.mention-deduplicate')
const only = (id) => MUTANTS.filter((m) => m.id === id)
const oracleJson = () =>
  JSON.parse(readTextSync(new URL('../../../oracles/mail/oracle.json', import.meta.url)))

/** A registry stand-in whose variants line up with the selectors of a case; green or red by choice. */
const stubFor = (c, ok) => async (id) => {
  const ref = c.assertionIds.map((r) => parseRef(r)).find((r) => r.id === id)
  const names = (ref?.filter ?? ['v']).map((f) => (f.endsWith(':') || f.endsWith('-') ? `${f}x` : f))
  const variants = names.map((variant) => ({ variant, ok, kind: 'assertion', message: 'stub' }))
  return { id, status: ok ? 'green' : 'red', variants, failing: ok ? [] : variants }
}
const never = () => {
  throw new Error('an assertion ran although the input was invalid')
}

// ---------------------------------------------------------------------------------------------
// CLI and input contract
// ---------------------------------------------------------------------------------------------

test('CLI: unknown, repeated, valueless and unknown-area flags exit 2 before any effect', () => {
  const out = path.join(BASE, 'qa-mail-never')
  for (const args of [
    ['--bogus'],
    ['--area', 'letters', '--area', 'direct'],
    ['--area'],
    ['--area', 'nope'],
    ['--prove-red=yes'],
    ['positional'],
    ['--target'],
    ['--target', 'staging']
  ]) {
    const r = cli(...args, '--out', out)
    assert.equal(r.status, 2, `${args.join(' ')} -> ${r.status}\n${r.stderr}`)
  }
  assert.equal(existsSync(out), false, 'a usage error must not create the output directory')
})

test('CLI: an existing output directory is a usage error (exit 2) and is left untouched', (t) => {
  const dir = tmp(t)
  writeFileSync(path.join(dir, 'evidence.txt'), 'old evidence')
  const r = cli('--area', 'transport', '--no-suites', '--out', dir)
  assert.equal(r.status, 2, r.stderr)
  assert.match(r.stderr, /already exists/)
  assert.equal(readTextSync(path.join(dir, 'evidence.txt')), 'old evidence')
  assert.deepEqual(readdirSync(dir), ['evidence.txt'])
})

test('parseFlags accepts the documented flags and --flag=value', () => {
  assert.deepEqual(parseFlags(['--area=letters', '--prove-red'], { area: 'value', 'prove-red': 'bool' }), {
    area: 'letters',
    'prove-red': true
  })
  assert.throws(() => parseFlags(['--out', '--x'], { out: 'value', x: 'bool' }), UsageError)
})

const GOOD = {
  id: 'QA-MAIL-x-happy',
  itemIds: [],
  requirement: 'r',
  oracle: { source: 's', ref: 'r', invariant: 'i' },
  edgeTags: ['happy'],
  targets: ['local'],
  effects: { reads: [], writes: [], mail: false, model: false, containers: false },
  prerequisites: [],
  assertionIds: ['a'],
  redProof: null,
  legacyIds: []
}

test('manifests: empty directory, malformed JSON, missing field, unknown tag and duplicate id are refused', (t) => {
  const dir = tmp(t)
  assert.throws(() => loadCases(dir), /no case manifests/)
  writeFileSync(path.join(dir, 'a.json'), '{ not json')
  assert.throws(() => loadCases(dir), /not valid JSON/)
  writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ ...GOOD, assertionIds: undefined }))
  assert.throws(() => loadCases(dir), /lacks "assertionIds"/)
  writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ ...GOOD, edgeTags: ['bogus'] }))
  assert.throws(() => loadCases(dir), /unknown tag/)
  writeFileSync(path.join(dir, 'a.json'), JSON.stringify(GOOD))
  writeFileSync(path.join(dir, 'b.json'), JSON.stringify(GOOD))
  assert.throws(() => loadCases(dir), /duplicate case id/)
  assert.throws(() => validateCase([], 'x'), /JSON object/)
  assert.throws(() => validateCase({ ...GOOD, oracle: { source: 's' } }), /incomplete oracle/)
})

test('manifest schema: every effects field, target, tag and list is type-checked', () => {
  assert.doesNotThrow(() => validateCase(GOOD))
  for (const patch of [
    { effects: { ...GOOD.effects, mail: 'yes' } },
    { effects: { ...GOOD.effects, model: 1 } },
    { effects: { ...GOOD.effects, containers: null } },
    { effects: { ...GOOD.effects, reads: 'a.txt' } },
    { effects: { ...GOOD.effects, writes: [1] } },
    { effects: { ...GOOD.effects, extra: true } },
    { effects: [] },
    { targets: [] },
    { targets: ['local', 'local'] },
    { targets: ['staging'] },
    { edgeTags: ['happy', 'happy'] },
    { itemIds: [''] },
    { prerequisites: [3] },
    { requirement: '' },
    { redProof: 'proven' },
    { oracle: { source: 's', ref: '', invariant: 'i' } }
  ])
    assert.throws(() => validateCase({ ...GOOD, ...patch }), UsageError, JSON.stringify(patch))
})

test('listCases rejects an unknown area and filters a known one', async () => {
  await assert.rejects(() => listCases({ area: 'nope' }), UsageError)
  const transport = await listCases({ area: 'transport' })
  assert.ok(transport.length > 0 && transport.every((c) => c.assertionIds[0].startsWith('mail.transport.')))
})

test('every shipped case passes the input contract', async () => {
  const cases = await listCases()
  assert.doesNotThrow(() => validateRunInput({ cases, outDir: path.join(BASE, 'qa-mail-never') }))
})

test('assertion references: only the exact supported forms parse', () => {
  assert.equal(parseRef('suite:transactional-mail').kind, 'suite')
  assert.equal(parseRef('manual:contact-sheet:team.joined').kind, 'manual')
  assert.equal(parseRef('manual:deliverability').kind, 'manual')
  assert.equal(parseRef('env:postgres').kind, 'env')
  assert.deepEqual(parseRef('mail.notify.dedupe#team.joined:|team.left:').filter, [
    'team.joined:',
    'team.left:'
  ])
  for (const bad of [
    'suite:khong-ton-tai',
    'suite:transactional-mail#x',
    'manual:contact-sheet:khong-ton-tai',
    'manual:contact-sheet:team.joined#x',
    'manual:deliverability#x',
    'manual:other',
    'env:postgres#x',
    'env:redis',
    'mail.khong.dang-ky',
    'mail.notify.dedupe#',
    'mail.notify.dedupe#team.joined:|',
    'mail.notify.dedupe#team.joined:zzz',
    'mail.notify.dedupe#team.joined:|team.joined:',
    'mail.preferences.groups#six',
    'mail.transport.failure#status-5xx',
    '',
    7
  ])
    assert.throws(() => parseRef(bad), UsageError, String(bad))
})

test('one case, one kind: mixed references and multiple suite / manual / env references are refused', async () => {
  const machine = await reserved()
  const suite = await byId('QA-MAIL-suite.mail-unavailable')
  const mixed = { ...machine, assertionIds: [...machine.assertionIds, 'suite:mail-unavailable'] }
  assert.throws(() => classifyCase(mixed), /mixes/)
  const twoSuites = { ...suite, assertionIds: ['suite:mail-unavailable', 'suite:notifications'] }
  assert.throws(() => classifyCase(twoSuites), /exactly one is supported/)
  const sheetAndSuite = {
    ...suite,
    assertionIds: ['manual:contact-sheet:team.joined', 'suite:mail-unavailable']
  }
  assert.throws(() => classifyCase(sheetAndSuite), /mixes/)
  assert.equal(classifyCase(machine).kind, 'machine')
})

test('run input: every invalid scope or option is refused before any probe, import, artifact or assertion', async (t) => {
  const base = await reserved()
  const suite = await byId('QA-MAIL-suite.mail-unavailable')
  const out = path.join(tmp(t), 'out')
  const mutEdit = (patch = {}) => ({
    file: 'apps/tracy-web/src/mail/transport.js',
    find: 'a',
    replace: 'b',
    count: 1,
    ...patch
  })
  const okProof = { kind: 'mutation', ref: 'm', assertionId: 'a', log: 'l' }
  const attempts = [
    { cases: [] },
    { cases: 'nope' },
    { cases: [{ id: 'QA-MAIL-x' }] },
    { cases: [base, base] },
    { cases: [{ ...base, assertionIds: ['suite:khong-ton-tai'] }] },
    { cases: [{ ...suite, assertionIds: ['suite:mail-unavailable#x'] }] },
    { cases: [{ ...suite, assertionIds: ['manual:contact-sheet:khong-ton-tai'] }] },
    { cases: [{ ...suite, assertionIds: ['manual:contact-sheet:team.joined#x'] }] },
    { cases: [{ ...suite, assertionIds: ['env:postgres#x'] }] },
    { cases: [{ ...base, assertionIds: ['mail.khong.dang-ky'] }] },
    { cases: [{ ...base, assertionIds: ['mail.notify.dedupe#'] }] },
    { cases: [{ ...base, assertionIds: ['mail.notify.dedupe#team.joined:zzz'] }] },
    { cases: [{ ...base, assertionIds: [...base.assertionIds, 'suite:mail-unavailable'] }] },
    { cases: [{ ...base, itemIds: ['item:khong-ton-tai'] }] },
    { cases: [{ ...base, targets: ['staging'] }] },
    { cases: [{ ...base, effects: { reads: [] } }] },
    { cases: [{ ...base, effects: { ...base.effects, mail: 'yes' } }] },
    { cases: [base], target: 'staging' },
    { cases: [base], proveRed: 'yes' },
    { cases: [base], skipSuites: 1 },
    { cases: [base], mutants: 'all' },
    { cases: [base], ledger: '' },
    { cases: [base], bogusOption: true },
    { cases: [base], ledger: path.join(BASE, 'outside-ledger.json') },
    { cases: [base], ledger: path.join(out, 'sub', 'ledger.json') },
    { cases: [{ ...base, prerequisites: ['no-such-prerequisite'] }] },
    { cases: [{ ...base, prerequisites: ['suite:khong-ton-tai'] }] },
    { cases: [{ ...base, redProof: { kind: 'guess' } }] },
    { cases: [{ ...base, redProof: { kind: 'mutation', ref: 'm', assertionId: 'a' } }] },
    { cases: [{ ...base, redProof: { kind: 'mutation', ref: 'm', assertionId: 'a', log: 'l', extra: 1 } }] },
    { cases: [base], mutants: [{ id: 'x' }] },
    { cases: [base], mutants: [null] },
    { cases: [base], mutants: [{ id: 'x', edits: [null], targets: { 'mail.notify.dedupe': {} } }] },
    { cases: [base], mutants: [{ id: 'x', edits: [], targets: { 'mail.notify.dedupe': {} } }] },
    {
      cases: [base],
      mutants: [{ id: 'x', edits: [mutEdit({ count: 0 })], targets: { 'mail.notify.dedupe': {} } }]
    },
    {
      cases: [base],
      mutants: [{ id: 'x', edits: [mutEdit({ replace: 'a' })], targets: { 'mail.notify.dedupe': {} } }]
    },
    {
      cases: [base],
      mutants: [
        { id: 'x', edits: [mutEdit({ file: '../escape.js' })], targets: { 'mail.notify.dedupe': {} } }
      ]
    },
    {
      cases: [base],
      mutants: [{ id: 'x', edits: [mutEdit({ extra: 1 })], targets: { 'mail.notify.dedupe': {} } }]
    },
    { cases: [base], mutants: [{ id: 'x', edits: [mutEdit()], targets: { 'mail.notify.dedupe': null } }] },
    {
      cases: [base],
      mutants: [{ id: 'x', edits: [mutEdit()], targets: { 'mail.notify.dedupe': { only: 'v' } } }]
    },
    {
      cases: [base],
      mutants: [{ id: 'x', edits: [mutEdit()], targets: { 'mail.notify.dedupe': { skip: 1 } } }]
    },
    { cases: [base], mutants: [{ id: 'x', edits: [mutEdit()], targets: { 'not.registered': {} } }] },
    { cases: [base], mutants: [{ id: 'x', edits: [mutEdit()], targets: {} }] },
    {
      cases: [base],
      mutants: [
        { id: 'x', edits: [mutEdit()], targets: { 'mail.notify.dedupe': {} } },
        { id: 'x', edits: [mutEdit()], targets: { 'mail.notify.dedupe': {} } }
      ]
    },
    { cases: [base], legacyRed: { 'notification-mail': { 'never-registered': ['a test'] } } },
    { cases: [base], legacyRed: { 'notification-mail': { 'drop-dedupe': [] } } },
    { cases: [{ ...base, redProof: { ...okProof, proofs: [null] } }] },
    { cases: [{ ...base, redProof: { ...okProof, proofs: [{}] } }] },
    {
      cases: [
        {
          ...base,
          redProof: {
            ...okProof,
            proofs: [{ assertionId: 'a', mutants: ['m'], logs: [], provenVariants: 1 }]
          }
        }
      ]
    },
    {
      cases: [
        {
          ...base,
          redProof: {
            ...okProof,
            proofs: [{ assertionId: 'a', mutants: ['m'], logs: ['l'], provenVariants: 0 }]
          }
        }
      ]
    },
    { cases: [{ ...base, prerequisites: ['env:postgres'] }] },
    { cases: [{ ...base, prerequisites: ['manual:deliverability'] }] },
    { cases: [{ ...base, prerequisites: ['suite:transactional-mail'] }] },
    { cases: [base], legacyRed: { 'no-such-suite': {} } },
    { cases: [base], legacyRed: { 'notification-mail': { m: 'not-an-array' } } },
    { cases: [base], outDir: '' }
  ]
  for (const patch of attempts)
    await assert.rejects(
      run({ outDir: out, skipSuites: true, registryRun: never, ...patch }),
      UsageError,
      JSON.stringify(patch).slice(0, 120)
    )
  assert.equal(existsSync(out), false, 'nothing was created for a refused input')
  assert.throws(() => exitCodeFor([]), UsageError)
})

test('target prod: every case is PENDING target-policy and nothing is run or sent', async (t) => {
  const out = path.join(tmp(t), 'out')
  const cases = await listCases()
  const results = await run({ cases: cases.slice(0, 20), target: 'prod', outDir: out, skipSuites: true })
  assert.ok(results.every((r) => r.verdict === 'PENDING' && /target-policy/.test(r.reason)))
  assert.equal(existsSync(path.join(out, 'evidence')), false, 'no evidence: no assertion ran')
  assert.equal(exitCodeFor(results), 3)
})

// ---------------------------------------------------------------------------------------------
// Verdict paths
// ---------------------------------------------------------------------------------------------

test('known-good case: PASS, with a fresh RED proof whose log is re-read and names the mutant', async (t) => {
  const out = path.join(tmp(t), 'out')
  const [r] = await run({
    cases: [await reserved()],
    proveRed: true,
    outDir: out,
    mutants: only('drop-dedupe'),
    skipSuites: true
  })
  assert.equal(r.verdict, 'PASS', r.reason)
  assert.equal(r.redProof.kind, 'mutation')
  assert.match(r.redProof.ref, /drop-dedupe/)
  assert.ok(existsSync(path.join(out, r.redProof.log)), 'the RED log must exist')
  const log = JSON.parse(readTextSync(path.join(out, r.redProof.log)))
  assert.equal(log.judged, 'RED')
  assert.equal(log.control.status, 'green')
  assert.ok(log.mutantFailures.length > 0 && log.mutantFailures.every((f) => f.kind === 'assertion'))
  assert.equal(exitCodeFor([r]), 0)
  assert.ok(existsSync(path.join(out, 'results.json')))
})

test('a mutant that turns only some of the variants a case ran red leaves the case PENDING', async (t) => {
  const [full] = MUTANTS.filter((m) => m.id === 'drop-dedupe')
  const partial = {
    ...full,
    targets: { 'mail.notify.dedupe': { skip: (v) => v !== 'comment.mention:en' } }
  }
  const [r] = await run({
    cases: [await reserved()],
    proveRed: true,
    outDir: path.join(tmp(t), 'out'),
    mutants: [partial],
    skipSuites: true
  })
  assert.equal(r.verdict, 'PENDING', r.reason)
  assert.match(r.reason, /variants of mail\.notify\.dedupe have no RED proof/)
  assert.equal(r.redProof, null)
})

test('without --prove-red a green eligible case stays PENDING, and an older ledger is never read', async (t) => {
  const dir = tmp(t)
  const c = await reserved()
  const [first] = await run({
    cases: [c],
    proveRed: true,
    outDir: path.join(dir, 'a'),
    ledger: path.join(dir, 'a', 'ledger.json'),
    mutants: only('drop-dedupe'),
    skipSuites: true
  })
  assert.equal(first.verdict, 'PASS')
  assert.ok(existsSync(path.join(dir, 'a', 'ledger.json')), 'the ledger is exported')
  // The old ledger exists and is valid: a later run without --prove-red must not use it.
  const [second] = await run({
    cases: [c],
    proveRed: false,
    outDir: path.join(dir, 'b'),
    mutants: only('drop-dedupe'),
    skipSuites: true
  })
  assert.equal(second.verdict, 'PENDING')
  assert.match(second.reason, /RED not run/)
  assert.equal(second.redProof, null)
  // Pointing --ledger at a file outside the new output directory is refused before anything is created.
  await assert.rejects(
    run({
      cases: [c],
      outDir: path.join(dir, 'c'),
      ledger: path.join(dir, 'a', 'ledger.json'),
      skipSuites: true
    }),
    /directly inside the new output directory/
  )
  assert.equal(existsSync(path.join(dir, 'c')), false)
  assert.equal(
    readTextSync(path.join(dir, 'a', 'ledger.json')).includes('"entries"'),
    true,
    'old ledger untouched'
  )
})

test('injected product fault with a catalogue oracle: the same case is FAIL with the first violating variant', async (t) => {
  const out = path.join(tmp(t), 'out')
  const scratch = await makeScratch()
  t.after(scratch.dispose)
  const applied = await applyMutant(
    scratch.dir,
    MUTANTS.find((m) => m.id === 'drop-dedupe')
  )
  assert.ok(applied.ok)
  const [r] = await run({
    cases: [await reserved()],
    outDir: out,
    productRoot: scratch.dir,
    skipSuites: true
  })
  assert.equal(r.verdict, 'FAIL')
  assert.match(r.reason, /variants violate the oracle, first comment\.mention/)
  assert.equal(exitCodeFor([r]), 1)
})

test('a missing dependency proven by the failed import is ENV, not FAIL', async (t) => {
  const [r] = await run({
    cases: [await reserved()],
    outDir: path.join(tmp(t), 'out'),
    skipSuites: true,
    registryRun: async (id) => ({
      id,
      status: 'error',
      variants: [],
      failing: [{ variant: '-', kind: 'error', message: "Cannot find package 'hono' imported from x" }]
    })
  })
  assert.equal(r.verdict, 'ENV')
  assert.match(r.reason, /missing dependency/)
})

test('any other harness error is PENDING TEST_INVALID, never PASS or FAIL', async (t) => {
  const [r] = await run({
    cases: [await reserved()],
    outDir: path.join(tmp(t), 'out'),
    skipSuites: true,
    registryRun: async (id) => ({
      id,
      status: 'error',
      variants: [],
      failing: [{ variant: 'x', kind: 'error', message: 'boom' }]
    })
  })
  assert.equal(r.verdict, 'PENDING')
  assert.match(r.reason, /TEST_INVALID/)
})

test('a database-backed case without a granted database is ENV and names the probe', async (t) => {
  const saved = process.env.QA_STAND_DATABASE_URL
  delete process.env.QA_STAND_DATABASE_URL
  t.after(() => saved !== undefined && (process.env.QA_STAND_DATABASE_URL = saved))
  const out = path.join(tmp(t), 'out')
  const c = (await listCases({ area: 'env' }))[0]
  const [r] = await run({ cases: [c], outDir: out, skipSuites: true })
  assert.equal(r.verdict, 'ENV')
  assert.match(r.reason, /probe: QA_STAND_DATABASE_URL is not set/)
  assert.ok(r.evidence.length === 1 && existsSync(path.join(out, r.evidence[0])))
})

// ---------------------------------------------------------------------------------------------
// Oracle catalogue: eligibility is decided per assertion and variant, before PASS and before FAIL
// ---------------------------------------------------------------------------------------------

const INDEPENDENT_BY_INSTANCE = [
  ['policy.js as the source', 'QA-MAIL-signin-otp-recipient-letter'],
  ['a header comment of product code', 'QA-MAIL-team.joined-empty'],
  ['an oracle.json row that only names a source', 'QA-MAIL-team.joined-no-secret-leak'],
  ['an oracle.json row sourced to policy.js', 'QA-MAIL-signin-otp-token-expired-refuse-after'],
  ['RFC 5322 with no pinned snapshot', 'QA-MAIL-team.joined-boundary'],
  ['OWASP guidance with no pinned snapshot', 'QA-MAIL-signin-code-invalid'],
  ['the Resend API contract with no pinned snapshot', 'QA-MAIL-transport-resend-happy-payload']
]

for (const [what, id] of INDEPENDENT_BY_INSTANCE)
  test(`oracle: ${what} is not independent: green and red assertions both stay PENDING`, async (t) => {
    const c = await byId(id)
    assert.match(oracleIneligible(c, oracleJson()), /\S/)
    for (const ok of [true, false]) {
      const [r] = await run({
        cases: [c],
        outDir: path.join(tmp(t), 'out'),
        skipSuites: true,
        registryRun: stubFor(c, ok)
      })
      assert.equal(r.verdict, 'PENDING', `${id} ${ok ? 'green' : 'red'}: ${r.reason}`)
      assert.match(r.reason, /oracle not independent/)
      assert.equal(r.observed, ok ? 'green' : 'red')
    }
  })

test('oracle: an adapted suite is its own oracle, so even a failing suite is an observation', async () => {
  const c = await byId('QA-MAIL-suite.mail-unavailable')
  assert.match(oracleIneligible(c, oracleJson()), /only machine assertions/)
})

test('oracle: a catalogue row is exact: another ref, invariant, source or variant makes the case PENDING', async (t) => {
  const c = await reserved()
  const data = oracleJson()
  assert.equal(oracleIneligible(c, data), null)
  for (const patch of [
    { oracle: { ...c.oracle, ref: 'decision 99' } },
    { oracle: { ...c.oracle, invariant: 'whatever the code does today' } },
    { oracle: { ...c.oracle, source: 'CONTEXT.md' } },
    { oracle: { ...c.oracle, source: 'apps/tracy-web/src/lib/policy.js' } }
  ])
    assert.match(oracleIneligible({ ...c, ...patch }, data), /no catalogue row/, JSON.stringify(patch))
  // A pinned document does not license an arbitrary invariant: the case would be PENDING even red.
  const [r] = await run({
    cases: [{ ...c, oracle: { ...c.oracle, ref: 'decision 1', invariant: 'anything at all' } }],
    outDir: path.join(tmp(t), 'out'),
    skipSuites: true,
    registryRun: stubFor(c, false)
  })
  assert.equal(r.verdict, 'PENDING')
  // A row restricted to some variants refuses a case that runs others.
  const groups = (await listCases()).filter((x) => x.assertionIds[0].startsWith('mail.preferences.groups'))
  const outside = groups.find((x) => /group:/.test(x.assertionIds.join(' ')))
  assert.match(oracleIneligible(outside, data), /no catalogue row|covers only the variants/)
  const row = data.catalogue.entries.find((e) => e.assertion === 'mail.preferences.groups')
  const wider = {
    ...groups[0],
    assertionIds: ['mail.preferences.groups#group:about-you'],
    oracle: { source: data.sources.adr0026.path, ref: row.ref, invariant: row.invariant }
  }
  assert.match(oracleIneligible(wider, data), /covers only the variants/)
  assert.match(
    oracleIneligible({ ...wider, assertionIds: ['mail.preferences.groups'] }, data),
    /covers only the variants/,
    'no filter means all variants, which the row does not cover'
  )
})

test('oracle: a drifted pin or an excerpt that left the source makes the case PENDING', async () => {
  const c = await reserved()
  const data = oracleJson()
  assert.match(
    oracleIneligible(c, data, [{ key: 'adr0026', path: data.sources.adr0026.path }]),
    /changed since/
  )
  const moved = structuredClone(data)
  for (const e of moved.catalogue.entries) e.excerpts = ['a sentence the ADR never contained']
  assert.match(oracleIneligible(c, moved), /no longer holds the excerpt/)
  const empty = structuredClone(data)
  for (const e of empty.catalogue.entries) e.excerpts = []
  assert.match(oracleIneligible(c, empty), /no longer holds the excerpt/)
})

test('oracle: the machine verdicts follow eligibility: eligible red is FAIL, ineligible red is not', async (t) => {
  const eligible = await reserved()
  const [fail] = await run({
    cases: [eligible],
    outDir: path.join(tmp(t), 'a'),
    skipSuites: true,
    registryRun: stubFor(eligible, false)
  })
  assert.equal(fail.verdict, 'FAIL')
  const [green] = await run({
    cases: [eligible],
    outDir: path.join(tmp(t), 'b'),
    skipSuites: true,
    registryRun: stubFor(eligible, true)
  })
  assert.equal(green.verdict, 'PENDING', 'green but no RED proof was run')
})

// ---------------------------------------------------------------------------------------------
// Suite evidence: the event protocol of suite-reporter.mjs
// ---------------------------------------------------------------------------------------------

const testRecord = (name, o = {}) => ({
  type: 'test',
  name,
  nesting: 0,
  testNumber: 1,
  file: 'f.test.mjs',
  ok: true,
  cancelled: false,
  skip: null,
  todo: null,
  detail: '',
  stack: '',
  ...o
})
const tally = (tests) => {
  const n = { tests: tests.length, pass: 0, fail: 0, cancelled: 0, skipped: 0, todo: 0 }
  for (const t of tests) {
    if (t.cancelled) n.cancelled += 1
    else if (!t.ok) n.fail += 1
    else if (t.skip) n.skipped += 1
    else if (t.todo) n.todo += 1
    else n.pass += 1
  }
  return n
}
/** Serialise records with the right sequence numbers; `mutate` may then break the stream. */
function serialise(records, mutate = (x) => x) {
  const numbered = records.map((r, seq) => ({ protocol: PROTOCOL, version: VERSION, seq, ...r }))
  return `${mutate(numbered)
    .map((r) => (typeof r === 'string' ? r : JSON.stringify(r)))
    .join('\n')}\n`
}
function streamOf(tests, { mutate, endCounts } = {}) {
  const c = tally(tests)
  const runner = {
    tests: c.tests,
    passed: c.pass,
    failed: c.fail,
    cancelled: c.cancelled,
    skipped: c.skipped,
    todo: c.todo
  }
  return serialise(
    [{ type: 'header' }, ...tests, { type: 'end', counts: endCounts ?? c, runnerSummary: runner }],
    mutate
  )
}
const finished = (tests, extra = {}, options = {}) => ({
  stdout: streamOf(tests, options),
  exitCode: tests.some((t) => !t.ok) ? 1 : 0,
  signal: null,
  stderr: '',
  ...extra
})
const probes = { socket: { ok: true }, database: { ok: false, reason: 'unset' } }
const A = testRecord('a')

test('events: the real reporter keeps whole stdout, stderr and long error details as output records', async (t) => {
  const dir = tmp(t)
  const file = path.join(dir, 'noisy.test.mjs')
  const long = 'x'.repeat(9000)
  writeFileSync(
    file,
    `import test from 'node:test'\nimport assert from 'node:assert/strict'\ntest('noisy', () => {\n  console.log('out-${'o'.repeat(5000)}')\n  console.error('err-${'e'.repeat(5000)}')\n  assert.equal(1, 2, '${long}')\n})\n`
  )
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const r = spawnSync(process.execPath, ['--test', `--test-reporter=${REPORTER_FILE}`, file], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env
  })
  const parsed = parseEvents(r.stdout)
  assert.equal(parsed.problem, null)
  const joined = (stream) =>
    parsed.outputs
      .filter((o) => o.stream === stream)
      .map((o) => o.data)
      .join('')
  assert.ok(joined('stdout').includes('o'.repeat(5000)), 'stdout kept whole')
  assert.ok(joined('stderr').includes('e'.repeat(5000)), 'stderr kept whole')
  assert.ok(parsed.all.find((x) => x.name === 'noisy').stack.includes(long), 'error stack not truncated')
  assert.ok(parsed.tests[0].detail.length > 2000 || parsed.all[0].stack.length > 2000)
})

test('events: a faithful stream parses; the reproduced TAP-style junk line is now refused', () => {
  const parsed = parseEvents(streamOf([A, testRecord('b', { ok: false, detail: 'ERR_ASSERTION' })]))
  assert.equal(parsed.problem, null)
  assert.deepEqual(
    parsed.tests.map((t) => [t.name, t.ok]),
    [
      ['a', true],
      ['b', false]
    ]
  )
  const withJunk = streamOf([A], {
    mutate: (r) => [r[0], r[1], 'ok 2 - a line of junk', ...r.slice(2)]
  })
  assert.match(parseEvents(withJunk).problem, /not a protocol record/)
  assert.equal(judgeSuite({ stdout: withJunk, exitCode: 0, signal: null }, probes).verdict, 'PENDING')
})

test('events: every malformed stream is refused, never judged green', () => {
  const cases = {
    'empty output': () => '',
    'no final newline': () => streamOf([A]).slice(0, -1),
    'cut before the end record': () => streamOf([A], { mutate: (r) => r.slice(0, -1) }),
    'missing header': () => streamOf([A], { mutate: (r) => r.slice(1) }),
    'second header': () => streamOf([A], { mutate: (r) => [r[0], { ...r[0] }, ...r.slice(1)] }),
    'wrong version': () => streamOf([A], { mutate: (r) => r.map((x) => ({ ...x, version: 2 })) }),
    'missing version': () => streamOf([A], { mutate: (r) => r.map((x) => ({ ...x, version: undefined })) }),
    'gap in the sequence': () => streamOf([A], { mutate: (r) => r.map((x) => ({ ...x, seq: x.seq * 2 })) }),
    'repeated sequence': () =>
      streamOf([A, testRecord('b')], { mutate: (r) => [r[0], r[1], { ...r[1] }, ...r.slice(3)] }),
    'foreign protocol': () => streamOf([A], { mutate: (r) => r.map((x) => ({ ...x, protocol: 'tap' })) }),
    'unknown record type': () =>
      streamOf([A], { mutate: (r) => [r[0], { ...r[1], type: 'diagnostic' }, ...r.slice(2)] }),
    'test record out of schema': () =>
      streamOf([A], { mutate: (r) => [r[0], { ...r[1], ok: 'yes' }, ...r.slice(2)] }),
    'a record after the end': () =>
      `${streamOf([A])}{"protocol":"${PROTOCOL}","version":${VERSION},"seq":9,"type":"test"}\n`,
    'end counts disagree with the records': () => streamOf([A], { endCounts: { ...tally([A]), pass: 2 } }),
    'skip counted as pass': () => streamOf([testRecord('a', { skip: 'x' })], { endCounts: tally([A]) }),
    'a stray non-JSON line': () => `${streamOf([A])}plain text\n`
  }
  for (const [what, make] of Object.entries(cases)) {
    const parsed = parseEvents(make())
    assert.ok(parsed.problem, `${what} must be refused`)
    const j = judgeSuite({ stdout: make(), exitCode: 0, signal: null }, probes)
    assert.equal(j.verdict, 'PENDING', what)
    assert.match(j.reason, /TEST_INVALID/, what)
  }
})

test('events: the runner summary must agree with the records', () => {
  const bad = streamOf([A], {
    mutate: (r) =>
      r.map((x) => (x.type === 'end' ? { ...x, runnerSummary: { ...x.runnerSummary, passed: 5 } } : x))
  })
  assert.match(parseEvents(bad).problem, /runner summary says pass 5/)
  const none = streamOf([A], {
    mutate: (r) => r.map((x) => (x.type === 'end' ? { ...x, runnerSummary: null } : x))
  })
  assert.match(parseEvents(none).problem, /runner summary is missing/)
})

test('suite judging: skips are ENV only after a failed probe, zero tests PENDING, failures FAIL, all-ok green; exit 0 alone proves nothing', () => {
  assert.equal(judgeSuite(finished([A]), probes).verdict, 'green')
  assert.equal(judgeSuite({ stdout: '', exitCode: 0, stderr: '' }, probes).verdict, 'PENDING')
  assert.match(judgeSuite(finished([]), probes).reason, /zero tests/)
  // Green tests with an abnormal process end are never green.
  assert.equal(judgeSuite(finished([A], { exitCode: 1 }), probes).verdict, 'PENDING')
  assert.equal(judgeSuite(finished([A], { exitCode: null, signal: 'SIGKILL' }), probes).verdict, 'PENDING')
  assert.equal(judgeSuite({ ...finished([A]), timedOut: true }, probes).verdict, 'PENDING')
  // TODO is never green.
  assert.equal(judgeSuite(finished([testRecord('t', { todo: 'later' })]), probes).verdict, 'PENDING')
  const skip = [testRecord('s', { skip: 'no database' })]
  assert.equal(judgeSuite(finished(skip), { ...probes, needs: ['postgres'] }).verdict, 'ENV')
  assert.match(judgeSuite(finished(skip), { ...probes, needs: ['postgres'] }).reason, /probe: database/)
  // The same skip with a database that answered the probe is not an environment fault.
  assert.equal(
    judgeSuite(finished(skip), { ...probes, needs: ['postgres'], database: { ok: true } }).verdict,
    'PENDING'
  )
  assert.equal(judgeSuite(finished(skip), probes).verdict, 'PENDING')
  assert.equal(
    judgeSuite(
      finished([A, testRecord('b', { ok: false, detail: 'ERR_ASSERTION | AssertionError' })]),
      probes
    ).verdict,
    'FAIL'
  )
  const eperm = [testRecord('a', { ok: false, detail: 'listen EPERM' })]
  assert.equal(
    judgeSuite(finished(eperm), {
      needs: ['socket'],
      socket: { ok: false, code: 'EPERM', message: 'x' },
      database: { ok: true }
    }).verdict,
    'ENV'
  )
  // The same error with a loopback that works is a product failure, not ENV.
  assert.equal(
    judgeSuite(finished(eperm), { needs: ['socket'], socket: { ok: true }, database: { ok: true } }).verdict,
    'FAIL'
  )
  assert.equal(
    judgeSuite(finished([testRecord('a', { ok: false, detail: 'Cannot find module x' })]), probes).verdict,
    'PENDING',
    'an import failure is not a verdict about the product'
  )
  // A cancelled test is not a pass.
  assert.notEqual(
    judgeSuite(finished([testRecord('a', { ok: false, cancelled: true })]), probes).verdict,
    'green'
  )
})

test('suite adapter end to end: a real suite yields a trusted event stream; a spawn failure is TEST_INVALID', async () => {
  const r = await runSuite({
    name: 'notification-preferences',
    env: { ...process.env, TEST_DATABASE_URL: 'postgres://nobody@127.0.0.1:1/none' }
  })
  assert.equal(r.problem, null, r.problem ?? '')
  assert.ok(r.tests.length > 0)
  const j = judgeSuite(r, {
    needs: ['postgres'],
    socket: { ok: true },
    database: { ok: false, reason: 'unset' }
  })
  assert.equal(j.verdict, 'ENV', j.reason)
  assert.ok(j.counts.skipped > 0)
  const broken = await runSuite({ name: 'notification-preferences', root: path.join(BASE, 'no-such-root') })
  assert.ok(broken.problem, 'a failed spawn carries a problem')
  assert.equal(judgeSuite(broken, probes).verdict, 'PENDING')
})

test('exit codes: all PASS 0, any FAIL 1, ENV/PENDING only 3, an empty run is a usage error', () => {
  const r = (verdict) => ({ verdict })
  assert.equal(exitCodeFor([r('PASS'), r('PASS')]), 0)
  assert.equal(exitCodeFor([r('PASS'), r('FAIL'), r('ENV')]), 1)
  assert.equal(exitCodeFor([r('PASS'), r('ENV')]), 3)
  assert.equal(exitCodeFor([r('PENDING')]), 3)
  assert.throws(() => exitCodeFor([]), UsageError)
})

test('run.mjs accepts --ledger (the pilot flag) instead of exiting 2 as an unknown flag', () => {
  const r = cli('--ledger', path.join(BASE, 'qa-mail-never-ledger.json'), '--area', 'no-such-area')
  assert.equal(r.status, 2)
  assert.doesNotMatch(r.stderr, /unknown flag: --ledger/)
})

test('an adapted suite never earns PASS even when green: it is its own oracle', async (t) => {
  const c = await byId('QA-MAIL-suite.mail-unavailable')
  const [r] = await run({ cases: [c], outDir: path.join(tmp(t), 'out') })
  assert.notEqual(r.verdict, 'PASS')
  if (r.verdict === 'PENDING') assert.match(r.reason, /oracle not independent/)
})

// ---------------------------------------------------------------------------------------------
// RED freshness for suites
// ---------------------------------------------------------------------------------------------

test('redTests refuses a mutant run that was killed, timed out, exited 0 or left a broken stream', () => {
  const control = finished([A])
  const red = [
    testRecord('a', { ok: false, detail: 'ERR_TEST_FAILURE | AssertionError | ERR_ASSERTION | boom' })
  ]
  assert.deepEqual(redTests(control, finished(red)), ['a'])
  assert.deepEqual(redTests(control, finished(red, { signal: 'SIGKILL', exitCode: null })), [])
  assert.deepEqual(redTests(control, { ...finished(red), timedOut: true }), [])
  assert.deepEqual(redTests(control, finished(red, { exitCode: 0 })), [])
  assert.deepEqual(redTests(control, { ...finished(red), stdout: `${finished(red).stdout}junk\n` }), [])
  assert.deepEqual(redTests({ ...control, stdout: 'junk\n' }, finished(red)), [])
  const boot = [testRecord('a', { ok: false, detail: 'Cannot find module x' })]
  assert.deepEqual(redTests(control, finished(boot)), [], 'an import failure is not RED')
})

// ---------------------------------------------------------------------------------------------
// Artifact ownership
// ---------------------------------------------------------------------------------------------

const fifoAt = (file) => spawnSync('mkfifo', [file]).status === 0

test('readRegularFile: a symlink, a FIFO and a directory are refused without hanging; a regular file is read', (t) => {
  const dir = tmp(t)
  const real = path.join(dir, 'real.txt')
  writeFileSync(real, 'data')
  symlinkSync(real, path.join(dir, 'link.txt'))
  mkdirSync(path.join(dir, 'd'))
  assert.equal(readRegularFile(real), 'data')
  assert.equal(readRegularFile(path.join(dir, 'absent')), null)
  assert.throws(() => readRegularFile(path.join(dir, 'link.txt')), /symlinks are refused/)
  assert.throws(() => readRegularFile(path.join(dir, 'd')), UsageError)
  const fifo = path.join(dir, 'fifo')
  if (fifoAt(fifo)) assert.throws(() => readRegularFile(fifo), /regular file/)
  // A dangling symlink is refused too, not reported as "missing".
  symlinkSync(path.join(dir, 'gone'), path.join(dir, 'dangling'))
  assert.throws(() => readRegularFile(path.join(dir, 'dangling')), UsageError)
})

test('an output directory is created exclusively: an existing directory, file or symlink is refused and untouched', async (t) => {
  const dir = tmp(t)
  const existing = path.join(dir, 'existing')
  mkdirSync(existing)
  writeFileSync(path.join(existing, 'old-evidence.json'), 'old')
  const file = path.join(dir, 'file')
  writeFileSync(file, 'x')
  const link = path.join(dir, 'link')
  symlinkSync(existing, link)
  const c = await reserved()
  for (const bad of [existing, file, link])
    await assert.rejects(
      run({ cases: [c], outDir: bad, skipSuites: true, registryRun: never }),
      /already exists/
    )
  assert.deepEqual(readdirSync(existing), ['old-evidence.json'])
  assert.equal(readTextSync(path.join(existing, 'old-evidence.json')), 'old')
})

test('two runs racing for one output: exactly one wins, the other is refused and writes nothing', async (t) => {
  const out = path.join(tmp(t), 'out')
  const c = await reserved()
  const options = { cases: [c], outDir: out, skipSuites: true, registryRun: stubFor(c, true) }
  const settled = await Promise.allSettled([run(options), run(options)])
  assert.equal(settled.filter((s) => s.status === 'fulfilled').length, 1)
  const refused = settled.find((s) => s.status === 'rejected')
  assert.match(refused.reason.message, /already exists/)
  assert.ok(existsSync(path.join(out, 'results.json')))
  assert.deepEqual(
    readdirSync(out).filter((n) => n.endsWith('.tmp') || n.endsWith('.lock')),
    [],
    'no temp or lock file is left'
  )
})

test('an old lock file is just a file: nothing is revoked, taken over or removed', async (t) => {
  const dir = tmp(t)
  const out = path.join(dir, 'out')
  mkdirSync(out)
  writeFileSync(path.join(out, '.mail-run.lock'), '999999999\n')
  await assert.rejects(run({ cases: [await reserved()], outDir: out, skipSuites: true }), /already exists/)
  assert.equal(readTextSync(path.join(out, '.mail-run.lock')), '999999999\n')
})

test('claimNewFile and claimOutputDir never overwrite; the ledger flag only names a new file', async (t) => {
  const dir = tmp(t)
  const file = path.join(dir, 'ledger.json')
  claimNewFile(file, 'ledger')
  assert.throws(() => claimNewFile(file, 'ledger'), /already exists/)
  symlinkSync(file, path.join(dir, 'ledger-link.json'))
  assert.throws(() => claimNewFile(path.join(dir, 'ledger-link.json'), 'ledger'), /already exists/)
  claimOutputDir(path.join(dir, 'a', 'b'))
  assert.throws(() => claimOutputDir(path.join(dir, 'a', 'b')), /already exists/)
  const fifo = path.join(dir, 'fifo.json')
  if (fifoAt(fifo)) {
    const c = await reserved()
    await assert.rejects(
      run({ cases: [c], outDir: path.join(dir, 'o'), ledger: fifo, skipSuites: true }),
      /directly inside the new output directory/
    )
    assert.equal(existsSync(path.join(dir, 'o')), false)
  }
})

test('writeAtomic: a failed rename publishes nothing, leaves no temp file and reports the error', (t) => {
  const dir = tmp(t)
  const target = path.join(dir, 'results.json')
  mkdirSync(target) // renaming a file over a directory fails
  assert.throws(() => writeAtomic(target, 'content'))
  assert.deepEqual(readdirSync(dir), ['results.json'], 'the temp file was removed')
  assert.ok(readdirSync(target).length === 0, 'the directory in the way is untouched')
  const ok = path.join(dir, 'ok.json')
  writeAtomic(ok, 'one')
  writeAtomic(ok, 'two')
  assert.equal(readTextSync(ok), 'two')
  assert.deepEqual(readdirSync(dir).sort(), ['ok.json', 'results.json'])
  // The temp name is random: two writers never share one.
  const seen = new Set()
  for (let i = 0; i < 20; i += 1) {
    writeAtomic(path.join(dir, `n${i}.json`), 'x')
    seen.add(i)
  }
  assert.equal(seen.size, 20)
})

test('a run that cannot finish does not publish results.json (the completion marker)', async (t) => {
  const out = path.join(tmp(t), 'out')
  const c = await reserved()
  await assert.rejects(
    run({
      cases: [c],
      outDir: out,
      skipSuites: true,
      registryRun: async () => {
        throw new Error('the harness died')
      }
    }),
    /the harness died/
  )
  assert.equal(existsSync(path.join(out, 'results.json')), false)
})

// ---------------------------------------------------------------------------------------------
// Receipt
// ---------------------------------------------------------------------------------------------

test('receipt: duplicates, unknown ids, missing revision or hashes, missing image and non-boolean ticks are never accepted', async (t) => {
  const { verifyReceipt, CHECKLIST_ITEMS } = await import('../sheets.mjs')
  const sheetDir = path.join(tmp(t), 'sheet')
  mkdirSync(sheetDir)
  writeFileSync(path.join(sheetDir, 'k-en.png'), 'png-bytes')
  const imageHash = (await import('../common.mjs')).sha256('png-bytes')
  const entry = { id: 'k:en', htmlSha256: 'h', image: 'k-en.png', imageSha256: imageHash }
  const good = {
    id: 'k:en',
    htmlSha256: 'h',
    imageSha256: imageHash,
    ticks: Object.fromEntries(CHECKLIST_ITEMS.map((k) => [k, true])),
    accepted: true,
    by: 'reviewer',
    at: '2026-10-06T10:00:00Z'
  }
  const file = path.join(tmp(t), 'r.json')
  const known = new Set(['k:en', 'k:vi'])
  const verdict = (receipt, entries = [entry]) => {
    writeFileSync(file, JSON.stringify(receipt))
    return verifyReceipt(file, entries, 'rev1', known, sheetDir).get('k:en')
  }
  assert.equal(verdict({ revision: 'rev1', entries: [good] }).state, 'accepted')
  assert.equal(verdict({ revision: 'rev1', entries: [good, good] }).state, 'pending', 'duplicate id')
  assert.equal(
    verdict({ revision: 'rev1', entries: [good, { ...good, id: 'zzz:en' }] }).state,
    'pending',
    'unknown id'
  )
  assert.equal(verdict({ entries: [good] }).state, 'pending', 'no revision')
  assert.equal(verdict({ revision: 'rev0', entries: [good] }).state, 'stale', 'wrong revision')
  assert.equal(verdict({ revision: 'rev1', entries: [{ ...good, htmlSha256: 'x' }] }).state, 'stale')
  assert.equal(verdict({ revision: 'rev1', entries: [{ ...good, htmlSha256: undefined }] }).state, 'stale')
  assert.equal(verdict({ revision: 'rev1', entries: [{ ...good, imageSha256: 'x' }] }).state, 'stale')
  assert.equal(verdict({ revision: 'rev1', entries: [{ ...good, imageSha256: null }] }).state, 'stale')
  // The captured image on disk is re-read and re-hashed: missing, changed, symlinked or unlocatable never accepts.
  const png = path.join(sheetDir, 'k-en.png')
  writeFileSync(png, 'tampered')
  assert.equal(verdict({ revision: 'rev1', entries: [good] }).state, 'pending', 'image changed on disk')
  rmSync(png)
  assert.match(verdict({ revision: 'rev1', entries: [good] }).reason, /missing/)
  writeFileSync(path.join(sheetDir, 'real.png'), 'png-bytes')
  symlinkSync(path.join(sheetDir, 'real.png'), png)
  assert.match(verdict({ revision: 'rev1', entries: [good] }).reason, /unreadable/)
  rmSync(png)
  writeFileSync(png, 'png-bytes')
  assert.match(
    verdict({ revision: 'rev1', entries: [good] }, [{ ...entry, image: '../k-en.png' }]).reason,
    /cannot be located/
  )
  assert.equal(verdict({ revision: 'rev1', entries: [good] }).state, 'accepted', 'restored image')
  assert.equal(
    verdict({ revision: 'rev1', entries: [good] }, [{ ...entry, imageSha256: null }]).state,
    'pending',
    'no image captured'
  )
  assert.equal(verdict({ revision: 'rev1', entries: [{ ...good, by: ' ' }] }).state, 'pending')
  assert.equal(verdict({ revision: 'rev1', entries: [{ ...good, at: 'yesterday' }] }).state, 'pending')
  assert.equal(verdict({ revision: 'rev1', entries: [{ ...good, ticks: {} }] }).state, 'pending')
  assert.equal(
    verdict({
      revision: 'rev1',
      entries: [{ ...good, ticks: { ...good.ticks, [CHECKLIST_ITEMS[0]]: 'yes' } }]
    }).state,
    'pending',
    'a tick that is not a boolean'
  )
  assert.equal(verdict({ revision: 'rev1', entries: [{ ...good, accepted: 'true' }] }).state, 'pending')
  assert.equal(
    verdict({
      revision: 'rev1',
      entries: [{ ...good, ticks: { ...good.ticks, [CHECKLIST_ITEMS[0]]: false } }]
    }).state,
    'rejected'
  )
  assert.equal(verdict({ revision: 'rev1', entries: 'nope' }).state, 'pending')
  assert.equal(verifyReceipt(null, [entry], 'rev1', null, sheetDir).get('k:en').state, 'pending')
  // A receipt that is a symlink or a FIFO is refused, not followed.
  const link = path.join(path.dirname(file), 'link.json')
  symlinkSync(file, link)
  assert.match(verifyReceipt(link, [entry], 'rev1').get('k:en').reason, /unreadable/)
  const fifo = path.join(path.dirname(file), 'fifo.json')
  if (fifoAt(fifo)) assert.match(verifyReceipt(fifo, [entry], 'rev1').get('k:en').reason, /unreadable/)
})

test('probeDatabase refuses a database that is not a loopback qa_mail_* stand, without connecting', async () => {
  for (const url of [
    'postgres://u@production.invalid:5432/qa_mail_x',
    'postgres://u@127.0.0.1:5432/tracy',
    'postgres://u@10.0.0.5/qa_mail_x',
    'postgres://u@127.0.0.1:5432/qa_mail_x?host=production.invalid',
    'postgres://u@127.0.0.1:5432/qa_mail_x?port=1',
    'postgres://u@127.0.0.1:5432/qa_mail_x#frag',
    'postgres://u@127.0.0.1:5432/qa_mail_%',
    'postgres://u@127.0.0.1:5432/qa_mail_%78',
    'postgres://u@127.0.0.1:5432/qa_mail_x/extra',
    'postgres://u@127.0.0.1:5432/qa_mail_',
    'http://127.0.0.1:5432/qa_mail_x',
    'postgres://u@127.0.0.1:5432/qa_mail_x?'
  ]) {
    const r = await probeDatabase({ QA_STAND_DATABASE_URL: url })
    assert.equal(r.ok, false, url)
    assert.match(r.reason, /refused without connecting/, url)
  }
})

test('probeDatabase hands the child the normalized URL of an accepted stand', async () => {
  const server = net.createServer().listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const url = `postgresql://u:p@127.0.0.1:${server.address().port}/qa_mail_x`
    const r = await probeDatabase({ QA_STAND_DATABASE_URL: url })
    assert.equal(r.ok, true, r.reason)
    assert.equal(r.url, url)
  } finally {
    server.close()
  }
})

test('applyMutant refuses an edit that reaches the real repository through a scratch symlink', async (t) => {
  const scratch = await makeScratch()
  t.after(scratch.dispose)
  const real = path.join(REPO_ROOT, 'packages/ui/tracy-ui/README.md')
  const before = readTextSync(real)
  for (const file of [
    'packages/ui/tracy-ui/README.md',
    'package.json',
    'apps/tracy-web/node_modules/../package.json'
  ]) {
    const r = await applyMutant(scratch.dir, {
      edits: [{ file, find: before.slice(0, 4) || 'a', replace: 'ZZZZ' }]
    })
    assert.equal(r.ok, false, file)
    assert.match(r.reason, /refused|does not exist|not a regular/, file)
  }
  assert.equal(readTextSync(real), before, 'the real file is untouched')
})
