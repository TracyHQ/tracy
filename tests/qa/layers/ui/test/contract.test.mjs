// Contract of the ui layer module: arguments, exit codes, manifests, target policy, verdict rules.

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { MAX_LAYER_FILE_BYTES, readBoundedJsonAsync } from '../../../lib/bounded-reader.mjs'
import { LAYER_DIR } from '../artifacts.mjs'
import { AREAS, ContractError, buildCoverage, decide, listCasesFor, loadLayer, runCases } from '../engine.mjs'
import { layer, listCases, run } from '../index.mjs'
import { UsageError, exitCodeFor, main, parseArgs } from '../run.mjs'
import { cleanup, tempDir } from './helpers.mjs'

const quiet = async (fn) => {
  const log = console.log
  const error = console.error
  console.log = () => {}
  console.error = () => {}
  try {
    return await fn()
  } finally {
    console.log = log
    console.error = error
  }
}

test('module exports follow the layer contract', async () => {
  assert.equal(layer, 'ui')
  assert.equal(typeof listCases, 'function')
  assert.equal(typeof run, 'function')
  const all = await listCases()
  assert.ok(all.length > 2000)
})

test('every manifest has the contract fields and a valid shape', async () => {
  const { cases } = await loadLayer()
  const required = [
    'id',
    'itemIds',
    'requirement',
    'oracle',
    'edgeTags',
    'targets',
    'effects',
    'prerequisites',
    'assertionIds',
    'redProof',
    'legacyIds'
  ]
  const ids = new Set()
  for (const c of cases) {
    for (const key of required) assert.ok(key in c, `${c.id} lacks ${key}`)
    assert.match(c.id, /^QA-UI-\S+$/)
    assert.ok(!ids.has(c.id), `duplicate id ${c.id}`)
    ids.add(c.id)
    assert.ok(c.oracle.source && c.oracle.ref && c.oracle.invariant, `${c.id} oracle incomplete`)
    assert.ok(c.edgeTags.length > 0 && c.assertionIds.length > 0 && c.targets.length > 0)
    assert.ok(c.targets.every((t) => ['local', 'dev', 'prod'].includes(t)))
    assert.deepEqual(Object.keys(c.effects).sort(), ['containers', 'mail', 'model', 'reads', 'writes'])
    assert.equal(c.redProof, null, 'a manifest never carries a RED proof; the run attaches it')
    assert.ok(!/:\d+$/.test(c.id), `${c.id} must not end in a line number`)
  }
})

test('areas partition the manifests and an unknown area is a contract error', async () => {
  const all = await listCases()
  let total = 0
  for (const area of AREAS) total += (await listCases({ area })).length
  assert.equal(total, all.length)
  await assert.rejects(() => listCasesFor({ area: 'nope' }), ContractError)
})

test('argument parsing rejects missing, duplicate and unknown input', () => {
  assert.throws(() => parseArgs(['--target']), UsageError)
  assert.throws(() => parseArgs(['--target', 'local', '--target', 'dev']), UsageError)
  assert.throws(() => parseArgs(['--bogus']), UsageError)
  assert.throws(() => parseArgs(['--target', 'moon']), UsageError)
  assert.throws(() => parseArgs(['--area', 'nope']), UsageError)
  assert.throws(() => parseArgs(['--scope', 'huge']), UsageError)
  assert.throws(() => parseArgs(['--out', '--prove-red']), UsageError)
  assert.throws(() => parseArgs(['--concurrency', '99']), UsageError)
  for (const junk of ['2junk', '2.5', '0x2', ' 2', '']) {
    assert.throws(() => parseArgs(['--concurrency', junk]), UsageError, junk)
  }
  const ok = parseArgs([
    '--area',
    'switches',
    '--target',
    'prod',
    '--prove-red',
    '--case',
    'a',
    '--case',
    'b'
  ])
  assert.deepEqual([ok.area, ok.target, ok.proveRed, ok.caseIds], ['switches', 'prod', true, ['a', 'b']])
})

test('usage and contract errors exit 2; an empty selection is never a pass', async () => {
  assert.equal(await quiet(() => main(['--bogus'])), 2)
  assert.equal(await quiet(() => main(['--area', 'legacy', '--case', 'QA-UI-does-not-exist'])), 2)
  assert.equal(await quiet(() => main(['--target', 'moon'])), 2)
})

test('exit code follows the verdicts: 0 all PASS, 1 any FAIL, 3 otherwise (including nothing)', () => {
  const v = (verdict) => ({ verdict })
  assert.equal(exitCodeFor([v('PASS'), v('PASS')]), 0)
  assert.equal(exitCodeFor([v('PASS'), v('FAIL'), v('PENDING')]), 1)
  assert.equal(exitCodeFor([v('PASS'), v('PENDING')]), 3)
  assert.equal(exitCodeFor([v('ENV')]), 3)
  assert.equal(exitCodeFor([]), 3)
})

test('verdict rules: green needs RED proof, a violation needs a proven assertion, vacuous is never PASS', () => {
  const ok = { ok: true, vacuous: false, violations: [] }
  const bad = { ok: false, vacuous: false, violations: [{ message: 'x' }] }
  const proof = { kind: 'mutation', ref: 'm', assertionId: 'a', log: 'red/x.log' }
  assert.equal(decide(ok, { proof, familyProven: true, assertionId: 'a' }).verdict, 'PASS')
  const noProof = decide(ok, { proof: null, familyProven: true, assertionId: 'a' })
  assert.equal(noProof.verdict, 'PENDING')
  assert.match(noProof.reason, /^NO_RED_PROOF/)
  assert.equal(decide(bad, { proof: null, familyProven: true, assertionId: 'a' }).verdict, 'FAIL')
  const unproven = decide(bad, { proof: null, familyProven: false, assertionId: 'a' })
  assert.equal(unproven.verdict, 'PENDING')
  assert.match(unproven.reason, /^UNPROVEN_ASSERTION/)
  assert.equal(
    decide({ ok: true, vacuous: true, violations: [] }, { proof, familyProven: true, assertionId: 'a' })
      .verdict,
    'PENDING'
  )
})

test('dev and prod targets block cases that need the local bench, before any process starts', async () => {
  const dir = await tempDir('ui-policy')
  try {
    const cases = (await listCases({ area: 'screens' })).slice(0, 5)
    for (const target of ['dev', 'prod']) {
      const out = path.join(dir, target)
      const { results } = await runCases({ cases, target, proveRed: false, outDir: out })
      assert.equal(results.length, cases.length)
      for (const r of results) {
        assert.equal(r.verdict, 'PENDING')
        assert.match(r.reason, /^target-policy/)
      }
    }
  } finally {
    await cleanup(dir)
  }
})

test('legacy cases are PENDING with the missing map named, never PASS', async () => {
  const dir = await tempDir('ui-legacy')
  try {
    const cases = await listCases({ area: 'legacy' })
    assert.ok(cases.length >= 1)
    const { results } = await runCases({ cases, target: 'local', proveRed: false, outDir: dir })
    for (const r of results) assert.equal(r.verdict, 'PENDING')
    if (cases.some((c) => c.id === 'QA-UI-legacy-map-gap'))
      assert.match(results[0].reason, /LEGACY_MAP_MISSING/)
  } finally {
    await cleanup(dir)
  }
})

test('a denominator that no longer vouches for the manifests is a contract error', async () => {
  const dir = await tempDir('ui-contract')
  try {
    const doc = await readBoundedJsonAsync(path.join(LAYER_DIR, 'denominator.json'), {
      maxBytes: MAX_LAYER_FILE_BYTES
    })
    doc.details.cases.sha256 = '0'.repeat(64)
    const tampered = path.join(dir, 'denominator.json')
    await writeFile(tampered, JSON.stringify(doc))
    await assert.rejects(() => loadLayer({ denominatorPath: tampered }), /differ from the sha256/)
    await writeFile(tampered, '')
    await assert.rejects(() => loadLayer({ denominatorPath: tampered }), ContractError)
    await writeFile(tampered, '{not json')
    await assert.rejects(() => loadLayer({ denominatorPath: tampered }), ContractError)
    await writeFile(tampered, JSON.stringify({ items: [] }))
    await assert.rejects(() => loadLayer({ denominatorPath: tampered }), ContractError)
  } finally {
    await cleanup(dir)
  }
})

test('coverage lists every obligation of each cell; one PASS never lifts the others', () => {
  const screen = { id: 'screen:a', kind: 'ui-story-screen', requiredTags: [], na: {} }
  const denominator = {
    items: [screen],
    itemDetails: { 'screen:a': { key: 'a' } },
    matrix: {
      cellCount: 8,
      axes: { languages: ['en', 'vi'], viewports: ['1440', '390'], themes: ['light', 'dark'] }
    },
    unresolved: []
  }
  const mk = (id, assertion, area = 'screens', languages = ['en']) => ({
    id,
    itemIds: ['screen:a'],
    area,
    edgeTags: [],
    assertionIds: [assertion],
    dimensions: { languages, themes: ['light'], viewports: ['1440'] }
  })
  const cases = [
    mk('c-net', 'ui.net'),
    mk('c-focus', 'ui.focus'),
    mk('c-sheet-vi', 'ui.sheet', 'sheets', ['vi'])
  ]
  const verdict = (id, v, reason = '') => ({ id, verdict: v, reason })
  const cov = (ordered) => buildCoverage({ denominator, cases, ordered })
  const one = cov([verdict('c-net', 'PASS'), verdict('c-focus', 'PENDING', 'NO_RED_PROOF: x')])
  const cell = one.cells['screen:a']['en/1440/light']
  assert.equal(cell.status, 'pending', 'a PASS next to an open assertion leaves the cell open')
  assert.equal(cell.obligations['ui.net'].case, 'c-net')
  assert.match(cell.obligations['ui.focus'].verdict, /^PENDING/)
  const vi = one.cells['screen:a']['vi/1440/light']
  assert.equal(vi.obligations['ui.net'].case, null)
  assert.match(vi.obligations['ui.net'].verdict, /no vi\/light adapter/)
  assert.equal(vi.obligations['ui.sheet'].case, 'c-sheet-vi', 'the exact-locale sheet case is linked')
  assert.equal(one.cells['screen:a']['en/390/light'].status, 'noObligations')
  const failed = cov([verdict('c-net', 'FAIL', 'x'), verdict('c-focus', 'PASS')])
  assert.equal(failed.cells['screen:a']['en/1440/light'].status, 'fail')
  const green = cov([verdict('c-net', 'PASS'), verdict('c-focus', 'PASS')])
  assert.equal(green.cells['screen:a']['en/1440/light'].status, 'pass')
  assert.equal(green.cells['screen:a']['en/1440/dark'].status, 'pending', 'dark has no adapter')
})

test('coverage obligations come from the whole manifest, so a narrower selection never drops one', async () => {
  const dir = await tempDir('ui-selection')
  try {
    const all = await listCases({ area: 'screens' })
    const screenItem = all[0].itemIds[0]
    const siblings = all.filter((c) => c.itemIds.includes(screenItem))
    assert.ok(new Set(siblings.map((c) => c.assertionIds[0])).size > 1, 'the screen has several assertions')
    const cellOf = async (selection, name) => {
      const { coverage } = await runCases({
        cases: selection,
        target: 'prod',
        proveRed: false,
        outDir: path.join(dir, name)
      })
      return coverage.cells[screenItem]
    }
    const narrow = await cellOf([siblings[0]], 'one')
    const wide = await cellOf(siblings, 'all')
    assert.deepEqual(
      Object.fromEntries(Object.entries(narrow).map(([k, v]) => [k, Object.keys(v.obligations).sort()])),
      Object.fromEntries(Object.entries(wide).map(([k, v]) => [k, Object.keys(v.obligations).sort()])),
      'the obligations of every cell are the same whatever was selected'
    )
    for (const cell of Object.values(narrow))
      for (const o of Object.values(cell.obligations)) assert.match(o.verdict, /^PENDING/)
    for (const c of siblings.slice(1)) {
      const cell = Object.values(narrow).find((x) =>
        Object.values(x.obligations).some((o) => o.case === c.id)
      )
      if (cell)
        assert.match(Object.values(cell.obligations).find((o) => o.case === c.id).verdict, /not run|NOT_RUN/i)
    }
  } finally {
    await cleanup(dir)
  }
})

test('coverage: several cases on one assertion keep their own obligations; unknown or repeated results are refused', () => {
  const screen = { id: 'screen:a', kind: 'ui-story-screen', requiredTags: [], na: {} }
  const denominator = {
    items: [screen],
    matrix: { cellCount: 1, axes: { languages: ['en'], viewports: ['1440'], themes: ['light'] } },
    unresolved: []
  }
  const mk = (id) => ({
    id,
    itemIds: ['screen:a'],
    area: 'screens',
    edgeTags: [],
    assertionIds: ['ui.focus'],
    dimensions: { languages: ['en'], themes: ['light'], viewports: ['1440'] }
  })
  const cases = [mk('c1'), mk('c2')]
  const cov = (ordered) => buildCoverage({ denominator, cases, ordered })
  const cell = cov([{ id: 'c1', verdict: 'PASS', reason: '' }]).cells['screen:a']['en/1440/light']
  assert.deepEqual(
    Object.values(cell.obligations)
      .map((o) => o.case)
      .sort(),
    ['c1', 'c2']
  )
  assert.equal(cell.status, 'pending', 'c2 has no result, so the cell is not PASS')
  assert.throws(() => cov([{ id: 'ghost', verdict: 'PASS', reason: '' }]), ContractError)
  // two cases on one assertion with no adapter at vi/light: each keeps its own PENDING obligation
  const wideDen = {
    ...denominator,
    matrix: { cellCount: 2, axes: { languages: ['en', 'vi'], viewports: ['1440'], themes: ['light'] } }
  }
  const vi = buildCoverage({ denominator: wideDen, cases, ordered: [] }).cells['screen:a']['vi/1440/light']
  assert.deepEqual(
    Object.values(vi.obligations)
      .map((o) => o.forCase)
      .sort(),
    ['c1', 'c2']
  )
  // a tag covered by one PASS and one PENDING case is not PASS
  const tagged = {
    ...denominator,
    items: [{ ...screen, requiredTags: ['t'] }]
  }
  const withTag = cases.map((c) => ({ ...c, edgeTags: ['t'] }))
  const tagStatus = (ordered) =>
    buildCoverage({ denominator: tagged, cases: withTag, ordered }).perItem['screen:a'].t
  assert.notEqual(tagStatus([{ id: 'c1', verdict: 'PASS', reason: '' }]), 'pass')
  assert.equal(
    tagStatus([
      { id: 'c1', verdict: 'PASS', reason: '' },
      { id: 'c2', verdict: 'PASS', reason: '' }
    ]),
    'pass'
  )
  assert.throws(
    () =>
      cov([
        { id: 'c1', verdict: 'PASS', reason: '' },
        { id: 'c1', verdict: 'FAIL', reason: 'x' }
      ]),
    ContractError
  )
  // order of results does not change the outcome
  const forward = cov([
    { id: 'c1', verdict: 'PASS', reason: '' },
    { id: 'c2', verdict: 'PASS', reason: '' }
  ])
  const backward = cov([
    { id: 'c2', verdict: 'PASS', reason: '' },
    { id: 'c1', verdict: 'PASS', reason: '' }
  ])
  assert.deepEqual(forward.cells, backward.cells)
  assert.equal(forward.cells['screen:a']['en/1440/light'].status, 'pass')
})

test('a consumer case is never decided by a static scan or a drawn DOM, and a planted proof cache grants nothing', async () => {
  const dir = await tempDir('ui-consumer')
  const saved = process.env.QA_UI_ARTIFACT_ROOT
  try {
    const consumer = (await listCases({ area: 'switches' })).find((c) => c.id.endsWith('-switch-consumer'))
    assert.ok(consumer, 'a consumer case is declared')
    // a cache that looks fully valid: right shape, a log with a matching hash, a RED proof for this case
    const log = path.join(dir, 'old', 'red', 'p.log')
    await mkdir(path.dirname(log), { recursive: true })
    await writeFile(log, 'RED proven')
    await writeFile(
      path.join(dir, 'ui-red-proofs.json'),
      JSON.stringify({
        inputsHash: 'any',
        proofs: [
          {
            caseId: consumer.id,
            valid: true,
            kind: 'mutation',
            ref: 'x',
            assertionId: 'ui.switch.has-a-product-consumer',
            log: 'red/p.log',
            logAbs: log,
            logSha: createHash('sha256').update('RED proven').digest('hex'),
            familyKey: 'consumer'
          }
        ]
      })
    )
    process.env.QA_UI_ARTIFACT_ROOT = dir
    const { results } = await runCases({
      cases: [consumer],
      target: 'local',
      proveRed: false,
      outDir: path.join(dir, 'run')
    })
    assert.equal(results[0].verdict, 'PENDING')
    assert.match(results[0].reason, /^PRODUCT_ADAPTER_MISSING/)
    assert.equal(results[0].redProof ?? null, null)
  } finally {
    if (saved === undefined) delete process.env.QA_UI_ARTIFACT_ROOT
    else process.env.QA_UI_ARTIFACT_ROOT = saved
    await cleanup(dir)
  }
})
