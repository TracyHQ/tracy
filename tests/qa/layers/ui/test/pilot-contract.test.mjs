// Contract of a finished standalone run (the workflow's pilot): reads QA_UI_PILOT_OUT and checks that
// results, RED proofs, coverage, manual-review sheets, freshness and cleanup are consistent. It does
// not run anything itself; without QA_UI_PILOT_OUT it fails, so a missing pilot is never a pass.

import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { REPO_ROOT } from '../artifacts.mjs'
import { loadLayer } from '../engine.mjs'
import { portIsOpen } from '../browser.mjs'
import { exitCodeFor } from '../run.mjs'
import { createHash } from 'node:crypto'
import { readBytesSync, readTextSync } from '../../../lib/bounded-reader.mjs'

const out = process.env.QA_UI_PILOT_OUT
const read = (f) => JSON.parse(readTextSync(path.join(out, f)))
const sha = (buf) => createHash('sha256').update(buf).digest('hex')

test('the pilot output directory exists', () => {
  assert.ok(out, 'QA_UI_PILOT_OUT is not set: run the pilot first')
  assert.ok(
    existsSync(path.join(out, 'results.json')),
    'results.json missing: the pilot did not run to the end'
  )
  assert.ok(existsSync(path.join(out, 'report.md')), 'report.md missing')
})

test('results list every declared case once, with the contract fields', async () => {
  const { cases } = await loadLayer()
  const results = read('results.json')
  assert.equal(results.length, cases.length, 'the pilot ran with a selection')
  const byId = new Map(results.map((r) => [r.id, r]))
  assert.equal(byId.size, results.length, 'duplicate result ids')
  for (const c of cases) {
    const r = byId.get(c.id)
    assert.ok(r, `no result for ${c.id}`)
    assert.ok(['PASS', 'FAIL', 'ENV', 'PENDING'].includes(r.verdict), `${c.id}: ${r.verdict}`)
    assert.ok(typeof r.reason === 'string' && r.reason.length > 0, `${c.id} has no reason`)
    assert.deepEqual(r.assertionIds, c.assertionIds)
    assert.ok(Array.isArray(r.evidence) && typeof r.durationMs === 'number')
  }
})

test('exit status agrees with the verdicts', () => {
  const results = read('results.json')
  const exit = read('exit.json')
  assert.equal(exit.code, exitCodeFor(results))
  const expected = results.some((r) => r.verdict === 'FAIL')
    ? 1
    : results.every((r) => r.verdict === 'PASS')
      ? 0
      : 3
  assert.equal(exit.code, expected)
})

test('every PASS has a RED proof whose log exists and shows the named assertion going red; no PASS lacks one', () => {
  const results = read('results.json')
  for (const r of results) {
    if (r.verdict === 'PASS') {
      assert.ok(r.redProof, `${r.id} is PASS without a RED proof`)
      const log = path.isAbsolute(r.redProof.log) ? r.redProof.log : path.join(out, r.redProof.log)
      assert.ok(existsSync(log), `${r.id}: RED log missing at ${log}`)
      const text = readTextSync(log)
      assert.match(text, /result: RED proven/, `${r.id}: log does not say RED proven`)
      assert.ok(text.includes(r.redProof.assertionId), `${r.id}: log does not name ${r.redProof.assertionId}`)
      assert.ok(r.assertionIds.includes(r.redProof.assertionId))
    } else {
      assert.equal(r.redProof, null, `${r.id}: only a PASS carries a RED proof`)
    }
    if (r.verdict === 'ENV') assert.match(r.reason, /ENV/)
  }
})

test('a FAIL only exists for an assertion family that has a valid RED proof', () => {
  const results = read('results.json')
  const proven = new Set()
  for (const r of results) if (r.redProof) proven.add(r.redProof.assertionId)
  const logs = path.join(out, 'red')
  if (existsSync(logs)) {
    for (const f of readdirSync(logs)) {
      const text = readTextSync(path.join(logs, f))
      const m = text.match(/^assertion: (.+)$/m)
      if (m && /result: RED proven/.test(text)) proven.add(m[1])
    }
  }
  for (const r of results.filter((x) => x.verdict === 'FAIL'))
    assert.ok(
      r.assertionIds.some((a) => proven.has(a)),
      `${r.id}: FAIL without a proven assertion`
    )
})

test('coverage is honest: never complete while anything is open', () => {
  const coverage = read('coverage.json')
  assert.equal(coverage.complete, false)
  assert.ok(coverage.completeReasons.length > 0)
  assert.ok(coverage.items.open >= 0 && coverage.matrix.cellCount > 0)
  const results = read('results.json')
  const report = readTextSync(path.join(out, 'report.md'))
  const counts = { PASS: 0, FAIL: 0, ENV: 0, PENDING: 0 }
  for (const r of results) counts[r.verdict]++
  assert.ok(
    report.includes(
      `PASS ${counts.PASS} · FAIL ${counts.FAIL} · ENV ${counts.ENV} · PENDING ${counts.PENDING}`
    ),
    'report counts differ from results'
  )
})

test('contact sheets: every required sheet is accounted for, fresh, and still pending a human', async () => {
  const { cases, denominator } = await loadLayer()
  const required = cases.filter((c) => c.area === 'sheets')
  const results = new Map(read('results.json').map((r) => [r.id, r]))
  for (const c of required) {
    const r = results.get(c.id)
    assert.equal(r.verdict, 'PENDING', `${c.id}: a sheet is never a machine PASS`)
    assert.match(r.reason, /MANUAL/)
  }
  if (!existsSync(path.join(out, 'sheets.json'))) return
  const sheets = read('sheets.json').sheets
  const review = read('manual-review.json')
  assert.equal(review.sheets.length, sheets.length)
  for (const s of review.sheets) {
    assert.equal(s.receipt, null, 'only a person may add a receipt')
    for (const check of s.checks) assert.equal(check.state, 'pending')
  }
  for (const s of sheets) {
    const detail = denominator.itemDetails[s.screen]
    const current = sha(readBytesSync(path.join(REPO_ROOT, detail.file)))
    assert.equal(s.storySourceSha256, current, `${s.id}: sheet is stale (the story source changed)`)
    if (s.bench) {
      const png = readBytesSync(path.join(out, s.bench.file))
      assert.equal(sha(png), s.bench.sha256, `${s.id}: bench image does not match its recorded sha256`)
      if (s.product?.file) {
        const png = readBytesSync(path.join(out, s.product.file))
        assert.equal(sha(png), s.product.sha256, `${s.id}: product image does not match its recorded sha256`)
        assert.ok(s.product.url, `${s.id}: a product image needs the URL it was taken from`)
        const prov = s.product.provenance
        assert.ok(prov, `${s.id}: a product image needs its provenance`)
        for (const key of [
          'route',
          'identity',
          'identityValue',
          'routeSha256',
          'locale',
          'theme',
          'viewport',
          'revision'
        ])
          assert.ok(prov[key], `${s.id}: product provenance lacks ${key}`)
        assert.equal(
          prov.locale.split('-')[0],
          s.language,
          `${s.id}: product locale differs from the sheet's`
        )
        assert.equal(prov.theme, s.theme, `${s.id}: product theme differs from the sheet's`)
        assert.match(s.status, s.product.size === s.bench.size ? /^complete/ : /incomplete.*differ/)
      } else {
        assert.match(
          s.product?.reason ?? '',
          /^(ENV|PENDING)/,
          `${s.id}: a missing product side needs a reason`
        )
        assert.match(s.status, /incomplete/)
      }
    } else {
      assert.match(s.status, /blocked/)
    }
  }
})

test('cleanup: every owned process and browser is stopped and its port is closed', async () => {
  const owned = read('owned.json')
  assert.ok(owned.entries.length > 0)
  for (const e of owned.entries) {
    assert.equal(e.stopped, true, `${e.kind} ${e.label} ${e.port ?? ''} still open in the ledger`)
    if (e.port) assert.equal(await portIsOpen(e.port), false, `port ${e.port} still listening`)
  }
  assert.ok(!existsSync(path.join(out, 'scratch-bench')), 'the scratch tree was removed')
})
