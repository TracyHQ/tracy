// The RED machinery: a mutation must apply exactly, a scratch copy lives outside the repo, and an
// import/boot failure or a merely different failure is never RED.
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { REPO_ROOT, SRC_REL, TEST_REL } from '../common.mjs'
import {
  MUTANTS,
  applyMutant,
  caseRed,
  proofVariants,
  judge,
  makeScratch,
  mutantsFor,
  proofProblem,
  proveRed,
  writeChecked
} from '../red.mjs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

const base = () => {
  const dir = process.env.QA_MAIL_ARTIFACTS ? path.resolve(process.env.QA_MAIL_ARTIFACTS) : tmpdir()
  mkdirSync(dir, { recursive: true })
  return dir
}

test('every recorded mutation applies exactly the expected number of times on the current tree', async () => {
  const scratch = await makeScratch()
  try {
    for (const m of MUTANTS) {
      for (const e of m.edits) {
        const text = readTextSync(path.join(scratch.dir, e.file))
        assert.equal(text.split(e.find).length - 1, e.count ?? 1, `${m.id}: ${e.file}`)
      }
    }
  } finally {
    await scratch.dispose()
  }
})

test('a scratch copy lives under the artifacts (or temp) directory, links dependencies, and is removed on dispose', async () => {
  const scratch = await makeScratch()
  const base = process.env.QA_MAIL_ARTIFACTS ? path.resolve(process.env.QA_MAIL_ARTIFACTS) : tmpdir()
  assert.ok(scratch.dir.startsWith(base) || scratch.dir.startsWith(`/private${base}`), scratch.dir)
  assert.ok(!scratch.dir.startsWith(REPO_ROOT))
  assert.ok(existsSync(path.join(scratch.dir, SRC_REL, 'mail/transport.js')))
  assert.equal(existsSync(path.join(scratch.dir, SRC_REL, 'node_modules')), false)
  await scratch.dispose()
  assert.equal(existsSync(scratch.dir), false)
  assert.ok(
    existsSync(path.join(REPO_ROOT, SRC_REL, 'mail/transport.js')),
    'disposing a copy must never touch the repo'
  )
})

test('a mutation that does not match exactly is not applied and changes nothing', async (t) => {
  const scratch = await makeScratch()
  t.after(scratch.dispose)
  const file = `${SRC_REL}/mail/transport.js`
  const before = readTextSync(path.join(scratch.dir, file))
  const missing = await applyMutant(scratch.dir, {
    id: 'm',
    edits: [{ file, find: 'this text is not in the file', replace: 'x', count: 1 }]
  })
  assert.equal(missing.ok, false)
  assert.match(missing.reason, /matched 0, expected 1/)
  const twice = await applyMutant(scratch.dir, {
    id: 'm',
    edits: [{ file, find: 'const', replace: 'let', count: 1 }]
  })
  assert.equal(twice.ok, false, 'a pattern matching many times is not a single mutation')
  const partial = await applyMutant(scratch.dir, {
    id: 'm',
    edits: [
      {
        file,
        find: 'export function isUndeliverableAddress',
        replace: 'export function isUndeliverableAddress2',
        count: 1
      },
      { file, find: 'no such text', replace: 'x', count: 1 }
    ]
  })
  assert.equal(partial.ok, false)
  assert.equal(
    readTextSync(path.join(scratch.dir, file)),
    before,
    'a failed mutation must leave the copy untouched'
  )
})

test('a mutation may only edit the copied product source: tests, package.json and symlinked trees are refused', async (t) => {
  const scratch = await makeScratch({ withTests: true })
  t.after(scratch.dispose)
  const testFile = readdirSync(path.join(scratch.dir, TEST_REL)).find((f) => f.endsWith('.test.mjs'))
  for (const file of [
    `${TEST_REL}/${testFile}`,
    'apps/tracy-web/package.json',
    'packages/ui/tracy-ui/README.md'
  ]) {
    const r = await applyMutant(scratch.dir, {
      id: 'm',
      edits: [{ file, find: 'a', replace: 'b', count: 1 }]
    })
    assert.equal(r.ok, false, file)
    assert.match(r.reason, /edit refused/, file)
  }
})

test('a path swapped for a symlink between the check and the write is refused and nothing is written', async (t) => {
  const file = `${SRC_REL}/mail/transport.js`
  const edit = {
    id: 'm',
    edits: [{ file, find: 'export class MailUnavailableError', replace: 'export class X', count: 1 }]
  }
  const real = readTextSync(path.join(REPO_ROOT, file))
  for (const swap of ['directory', 'file']) {
    const scratch = await makeScratch()
    t.after(scratch.dispose)
    const decoyDir = mkdtempSync(path.join(base(), 'qa-mail-decoy-'))
    t.after(() => rmSync(decoyDir, { recursive: true, force: true }))
    writeFileSync(path.join(decoyDir, 'transport.js'), real)
    const target = path.join(scratch.dir, file)
    const r = await applyMutant(scratch.dir, edit, {
      beforeWrite: () => {
        if (swap === 'directory') {
          const dir = path.dirname(target)
          renameSync(dir, `${dir}.moved`)
          symlinkSync(decoyDir, dir)
        } else {
          rmSync(target)
          symlinkSync(path.join(decoyDir, 'transport.js'), target)
        }
      }
    })
    assert.equal(r.ok, false, swap)
    assert.match(r.reason, /edit refused/, swap)
    assert.equal(
      readTextSync(path.join(decoyDir, 'transport.js')),
      real,
      `${swap}: the file behind the link is untouched`
    )
    assert.equal(readTextSync(path.join(REPO_ROOT, file)), real, `${swap}: the real tree is untouched`)
  }
})

test('a mutant that targets a variant the control never reached is not RED, and a forged proof of it is refused', async (t) => {
  const out = mkdtempSync(path.join(base(), 'qa-mail-only-test-'))
  t.after(() => rmSync(out, { recursive: true, force: true }))
  const file = `${SRC_REL}/mail/transport.js`
  const mutant = {
    id: 'fake',
    summary: 's',
    edits: [
      {
        file,
        find: 'export class MailUnavailableError',
        replace: 'export class MailUnavailableError2',
        count: 1
      }
    ],
    targets: { fake: { only: ['v2'] } }
  }
  const mutated = (root) => readTextSync(path.join(root, file)).includes('MailUnavailableError2')
  const run = async (id, root) =>
    mutated(root)
      ? {
          id,
          status: 'red',
          variants: [],
          failing: [{ variant: 'v2', ok: false, kind: 'assertion', message: 'x' }]
        }
      : { id, status: 'green', variants: [{ variant: 'v1', ok: true }], failing: [] }
  const j = judge({
    control: { status: 'green', variants: [{ variant: 'v1', ok: true }], failing: [] },
    mutant: { status: 'red', variants: [], failing: [{ variant: 'v2', ok: false, kind: 'assertion' }] },
    target: { only: ['v2'] }
  })
  assert.equal(j.ok, false)
  assert.match(j.why, /never reached/)
  const [proof] = (
    await proveRed({ assertionIds: ['fake'], mutants: [mutant], run, outDir: out })
  ).proofs.get('fake')
  assert.equal(proof.ok, false)
  const logFile = path.join(out, proof.log)
  const entry = JSON.parse(readTextSync(logFile))
  writeFileSync(
    logFile,
    JSON.stringify({
      ...entry,
      judged: 'RED',
      control: { ...entry.control, status: 'green' },
      copyControl: 'green',
      expectedRed: ['v2']
    })
  )
  assert.match(proofProblem(proof, { outDir: out, assertionId: 'fake', mutants: [mutant] }), /never reached/)
})

test('judge: control must be green, the mutant must fail with an assertion on the expected variants', () => {
  const v = (variant, ok = true, kind = 'assertion') => ({ variant, ok, kind })
  const green = { status: 'green', variants: [v('a'), v('b')], failing: [] }
  const red = (...names) => ({ status: 'red', variants: [], failing: names.map((n) => v(n, false)) })
  assert.equal(judge({ control: green, mutant: red('a', 'b') }).ok, true)
  assert.equal(judge({ control: green, mutant: red('a') }).ok, false, 'one variant stayed green')
  assert.equal(judge({ control: green, mutant: { status: 'green', variants: [], failing: [] } }).ok, false)
  assert.equal(
    judge({ control: { status: 'red', variants: [], failing: [v('a', false)] }, mutant: red('a') }).ok,
    false,
    'a red control proves nothing'
  )
  const errored = {
    status: 'error',
    variants: [],
    failing: [{ variant: 'a', ok: false, kind: 'error', message: 'Cannot find module' }]
  }
  const j = judge({ control: green, mutant: errored })
  assert.equal(j.ok, false)
  assert.match(j.why, /not an assertion failure/, 'an import or boot failure is not RED')
  assert.equal(judge({ control: green, mutant: red('a'), target: { only: ['a'] } }).ok, true)
  assert.equal(
    judge({ control: green, mutant: red('a'), target: { skip: () => true } }).ok,
    false,
    'a mutant reaching no variant proves nothing'
  )
})

test('caseRed judges only the variants a case owns', () => {
  const proof = {
    copyOk: true,
    controlGreen: true,
    errored: false,
    expected: ['k1:en', 'k1:vi', 'k2:en'],
    failed: ['k1:en', 'k1:vi']
  }
  assert.equal(caseRed(proof, ['k1:']), true)
  assert.equal(caseRed(proof, ['k2:']), false)
  assert.equal(caseRed(proof, ['k3:']), false, 'a slice the mutant does not reach has no proof')
  assert.equal(
    caseRed({ ...proof, copyOk: false }, ['k1:']),
    false,
    'an unmutated copy that is not green invalidates the proof'
  )
})

test('proveRed with injected runners: a boot failure on the mutant is NOT-RED, an assertion failure is RED', async (t) => {
  const out = mkdtempSync(path.join(base(), 'qa-mail-red-test-'))
  t.after(() => rmSync(out, { recursive: true, force: true }))
  const mutant = {
    id: 'fake',
    summary: 's',
    edits: [
      {
        file: `${SRC_REL}/mail/transport.js`,
        find: 'export class MailUnavailableError',
        replace: 'export class MailUnavailableError2',
        count: 1
      }
    ],
    targets: { fake: {} }
  }
  const mutated = (root) =>
    readTextSync(path.join(root, SRC_REL, 'mail/transport.js')).includes('MailUnavailableError2')
  const variants = [{ variant: 'v', ok: true }]
  const redRun = async (id, root) =>
    mutated(root)
      ? {
          id,
          status: 'red',
          variants,
          failing: [{ variant: 'v', ok: false, kind: 'assertion', message: 'x' }]
        }
      : { id, status: 'green', variants, failing: [] }
  const bootRun = async (id, root) =>
    mutated(root)
      ? {
          id,
          status: 'error',
          variants,
          failing: [{ variant: 'v', ok: false, kind: 'error', message: 'SyntaxError' }]
        }
      : { id, status: 'green', variants, failing: [] }
  const a = await proveRed({ assertionIds: ['fake'], mutants: [mutant], run: redRun, outDir: out })
  assert.equal(a.proofs.get('fake')[0].ok, true)
  assert.ok(existsSync(path.join(out, a.proofs.get('fake')[0].log)), 'the log is written')
  const b = await proveRed({ assertionIds: ['fake'], mutants: [mutant], run: bootRun, outDir: out })
  assert.equal(b.proofs.get('fake')[0].ok, false)
  assert.match(b.proofs.get('fake')[0].why, /not an assertion failure/)
  const neverApplies = { ...mutant, edits: [{ ...mutant.edits[0], find: 'absent text' }] }
  const c = await proveRed({ assertionIds: ['fake'], mutants: [neverApplies], run: redRun, outDir: out })
  assert.equal(c.proofs.get('fake')[0].ok, false)
  assert.match(c.proofs.get('fake')[0].why, /did not apply exactly/)
})

test('the catalogue covers the five required mutations', () => {
  const ids = new Set(MUTANTS.map((m) => m.id))
  for (const id of ['wrong-recipient', 'drop-escaping', 'drop-expiry', 'drop-dedupe', 'ignore-preference'])
    assert.ok(ids.has(id), id)
  assert.deepEqual(mutantsFor('mail.notify.dedupe'), ['drop-dedupe'])
})

test('proofProblem re-reads the log: missing, altered, wrong-assertion, partial, boot-error and stale-edit proofs are refused', async (t) => {
  const out = mkdtempSync(path.join(base(), 'qa-mail-proof-test-'))
  t.after(() => rmSync(out, { recursive: true, force: true }))
  const file = `${SRC_REL}/mail/transport.js`
  const mutant = {
    id: 'fake',
    summary: 's',
    edits: [
      {
        file,
        find: 'export class MailUnavailableError',
        replace: 'export class MailUnavailableError2',
        count: 1
      }
    ],
    targets: { fake: {} }
  }
  const mutated = (root) => readTextSync(path.join(root, file)).includes('MailUnavailableError2')
  const variants = [
    { variant: 'v1', ok: true },
    { variant: 'v2', ok: true }
  ]
  const run = async (id, root) =>
    mutated(root)
      ? {
          id,
          status: 'red',
          variants,
          failing: [{ variant: 'v1', ok: false, kind: 'assertion', message: 'x' }]
        }
      : { id, status: 'green', variants, failing: [] }
  const { proofs } = await proveRed({ assertionIds: ['fake'], mutants: [mutant], run, outDir: out })
  const [proof] = proofs.get('fake')
  const only1 = { ...mutant, targets: { fake: { only: ['v1'] } } }
  let current = mutant
  const check = (p = proof, assertionId = 'fake') =>
    proofProblem(p, { outDir: out, assertionId, mutants: [current] })
  // v2 stayed green on the mutant: the proof is partial and was never ok.
  assert.equal(proof.ok, false)
  assert.match(check(), /expected variant|judged NOT-RED/)
  // A complete proof of the same shape verifies, then every tamper is refused.
  const full = (await proveRed({ assertionIds: ['fake'], mutants: [only1], run, outDir: out })).proofs.get(
    'fake'
  )[0]
  assert.equal(full.ok, true)
  current = only1
  assert.equal(check(full), null)
  assert.match(check(full, 'another.assertion'), /is for fake, not another\.assertion/)
  assert.match(check({ ...full, mutant: 'other' }), /is for mutant fake/)
  assert.match(check({ ...full, log: 'red/missing.json' }), /missing/)
  assert.match(check({ ...full, log: '../escape.json' }), /outside the output/)
  assert.match(check({ ...full, log: undefined }), /names no log/)
  const logFile = path.join(out, full.log)
  const original = readTextSync(logFile)
  const tamper = (edit) => {
    writeFileSync(logFile, JSON.stringify(edit(JSON.parse(original))))
    return check(full)
  }
  assert.match(
    tamper((e) => ({ ...e, judged: 'NOT-RED' })),
    /judged NOT-RED/
  )
  assert.match(
    tamper((e) => ({ ...e, copyControl: 'red' })),
    /green control/
  )
  assert.match(
    tamper((e) => ({ ...e, mutantFailures: [] })),
    /no failing variant/
  )
  assert.match(
    tamper((e) => ({ ...e, mutantFailures: [{ variant: 'v1', kind: 'error' }] })),
    /non-assertion/
  )
  assert.match(
    tamper((e) => ({ ...e, expectedRed: ['v1', 'v9'] })),
    /not the control variants/
  )
  assert.match(
    tamper((e) => ({ ...e, expectedRed: ['v1', 'v2'], controlVariants: ['v1', 'v2'] })),
    /not the control variants/,
    'adding a variant to both lists does not widen the proof'
  )
  assert.match(
    tamper((e) => ({ ...e, controlVariants: undefined })),
    /does not record the control variants/
  )
  assert.match(
    tamper((e) => ({ ...e, mutantFailures: [null] })),
    /non-assertion/
  )
  assert.match(
    tamper((e) => ({ ...e, mutantEdits: [{ ...e.mutantEdits[0], after: e.mutantEdits[0].before }] })),
    /not what the recorded edit produces|changes nothing/
  )
  assert.match(
    tamper(() => []),
    /not an object/
  )
  assert.match(
    tamper((e) => ({ ...e, mutantEdits: [] })),
    /records no edit/
  )
  assert.match(
    tamper((e) => ({ ...e, mutantEdits: [{ ...e.mutantEdits[0], before: '0'.repeat(64) }] })),
    /edit hash mismatch/
  )
  assert.match(
    tamper((e) => ({ ...e, mutantEdits: [{ ...e.mutantEdits[0], after: '1'.repeat(64) }] })),
    /not what the recorded edit produces/
  )
  assert.match(
    tamper((e) => ({ ...e, mutantEdits: [e.mutantEdits[0], e.mutantEdits[0]] })),
    /different number of edits/
  )
  assert.match(
    tamper((e) => ({ ...e, mutantEdits: [{ ...e.mutantEdits[0], file: 'other/file.js' }] })),
    /is not of/
  )
  assert.match(
    proofProblem(full, { outDir: out, assertionId: 'fake', mutants: [] }),
    /not a recorded mutation/
  )
  writeFileSync(logFile, original)
  // The variants a proof shows red are read from the log: v1 only, never the unclaimed v2.
  assert.deepEqual(
    [...proofVariants(full, { outDir: out, assertionId: 'fake', mutants: [only1] }).variants],
    ['v1']
  )
  writeFileSync(logFile, '{ not json')
  assert.match(check(full), /unreadable/)
  assert.match(
    proofVariants(full, { outDir: out, assertionId: 'fake', mutants: [only1] }).problem,
    /unreadable/,
    'one read: a log that stops being JSON is a refusal, not a crash'
  )
  assert.equal(
    proofVariants(full, { outDir: out, assertionId: 'fake', mutants: [{ ...mutant, targets: { fake: {} } }] })
      .variants.size,
    0,
    'a log whose expected variants differ from the control-derived set is refused'
  )
  writeFileSync(logFile, original)
  assert.equal(check(full), null)
  // An import or boot failure on the mutant is never RED.
  const boot = async (id, root) =>
    mutated(root)
      ? {
          id,
          status: 'error',
          variants,
          failing: [{ variant: 'v1', ok: false, kind: 'error', message: 'SyntaxError' }]
        }
      : { id, status: 'green', variants, failing: [] }
  const b = (await proveRed({ assertionIds: ['fake'], mutants: [only1], run: boot, outDir: out })).proofs.get(
    'fake'
  )[0]
  assert.equal(b.ok, false)
  assert.match(check(b), /judged NOT-RED/)
})

test('writeChecked: a short write continues until every byte is written; a stalled one is refused', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'qa-mail-short-'))
  try {
    const file = path.join(dir, 'f.txt')
    writeFileSync(file, 'old content')
    const { open, stat } = await import('node:fs/promises')
    const id = await stat(file)
    // A descriptor that writes at most two bytes per call: the full text must still land.
    const twoAtATime = async (f, flags) => {
      const h = await open(f, flags)
      const write = h.write.bind(h)
      h.write = (buf, off, len, pos) => write(buf, off, Math.min(len, 2), pos)
      return h
    }
    assert.equal(await writeChecked(file, 'abcdef', id, { openFile: twoAtATime }), null)
    assert.equal(readTextSync(file), 'abcdef')
    // A descriptor that stops writing: refused, never reported as applied.
    const stalls = async (f, flags) => {
      const h = await open(f, flags)
      const write = h.write.bind(h)
      let calls = 0
      h.write = (buf, off, len, pos) =>
        calls++ ? Promise.resolve({ bytesWritten: 0 }) : write(buf, off, 2, pos)
      return h
    }
    assert.match(await writeChecked(file, 'abcdef', id, { openFile: stalls }), /stopped after 2 of 6 bytes/)
  } finally {
    rmSync(dir, { recursive: true })
  }
})
