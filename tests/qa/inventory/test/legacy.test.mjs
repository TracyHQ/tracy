// Legacy copies and the legacy map: parsers on fixtures, the committed JSON on the real counts, and
// the one-owner-per-asset rule.
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { LAYERS, buildLegacyMap } from '../build.mjs'
import { parseLedger } from '../extractors/legacy-findings.mjs'
import { parsePlan } from '../extractors/legacy-plan.mjs'
import { readTextSync } from '../../lib/bounded-reader.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const INV = join(HERE, '..')
const read = (rel) => JSON.parse(readTextSync(join(INV, rel)))

const LEDGER = [
  '# ledger',
  '',
  '**F-S1-001 · SSR-006 · P1 · Dead end page** [S]',
  '- Evidence: `seats/route.js:746`; `seats/pages.js:249-263`.',
  '- Repro: open `/invite/x` signed in with another address.',
  '',
  '- **F-S1-002 · SSR-003/004 · bullet form:** body with fixed in #123 note (`a/b.js:9`).',
  'See F-S1-001 again in text (not a declaration).',
  '### F-S1-003  P2  Case QA-PUB-001 / F, D',
  'Claim: a claim line.',
  'Evidence [M]: curl returned 502',
  '',
  '| F-S1-004 | P3 | F/S | table row title |',
  'F-S1-005 | P2 | pipe line without a leading pipe',
  'F-S2-001 | P2 | belongs to another shard, not parsed for S1',
  '- F-S1-005 mention inside a list is a duplicate declaration'
].join('\n')

describe('parseLedger', () => {
  const found = parseLedger(LEDGER, 1, 'ledger-S1.md')
  test('recognises heading, bold, bullet, table and pipe-without-leading-pipe forms', () => {
    assert.deepEqual(
      found.map((f) => f.id),
      ['F-S1-001', 'F-S1-002', 'F-S1-003', 'F-S1-004', 'F-S1-005', 'F-S1-005']
    )
  })
  test('a repeated reference in prose is not a declaration; the same id declared twice is visible', () => {
    assert.equal(found.filter((f) => f.id === 'F-S1-001').length, 1)
    assert.equal(
      found.filter((f) => f.id === 'F-S1-005').length,
      2,
      'the duplicate declaration stays visible for the extractor to flag'
    )
  })
  test('keeps only what the ledger states: file:line, severity, items, repro; fix refs only with a fix word', () => {
    const f1 = found[0]
    assert.deepEqual(f1.evidence, ['seats/route.js:746', 'seats/pages.js:249-263'])
    assert.equal(f1.severity, 'P1')
    assert.deepEqual(f1.items, ['QA-SSR-006'])
    assert.match(f1.repro, /Repro: open/)
    const f2 = found[1]
    assert.deepEqual(f2.items, ['QA-SSR-003', 'QA-SSR-004'])
    assert.deepEqual(f2.fixRefs, ['#123'])
    assert.equal(f2.repro, null, 'no repro line -> null, never invented')
    assert.deepEqual(found[2].fixRefs, [])
    assert.deepEqual(found[2].items, ['QA-PUB-001'])
    assert.match(found[2].evidenceNote, /^Claim:/)
  })
  test('another shard is not mixed in', () => {
    assert.equal(parseLedger(LEDGER, 2, 'ledger-S2.md').length, 1)
  })
})

describe('parsePlan', () => {
  const text = [
    '# plan',
    '## 6.1 QA-SSR — pages',
    '#### QA-SSR-001 First `item`',
    'body',
    '##### QA-REF-001-01 Sub item',
    '#### QA-SSR-002a Second',
    '## 7 other',
    '#### QA-OPS-001 Ops',
    'text mentioning QA-SSR-009'
  ].join('\n')
  const items = parsePlan(text)
  test('headings of level 4 are main items, level 5 are sub-items with a parent', () => {
    assert.deepEqual(
      items.map((i) => [i.id, i.level, i.parent]),
      [
        ['QA-SSR-001', 'main', null],
        ['QA-REF-001-01', 'sub', 'QA-REF-001'],
        ['QA-SSR-002a', 'main', null],
        ['QA-OPS-001', 'main', null]
      ]
    )
    assert.equal(items[0].title, 'First item')
    assert.match(items[0].section, /^6\.1/)
  })
})

describe('committed legacy copies', () => {
  const plan = read('legacy/audit-plan.json')
  const findings = read('legacy/audit-findings.json')
  test('212 audit items = 164 main + 48 sub, by the documented groups', () => {
    assert.equal(plan.items.length, 212)
    assert.equal(plan.items.filter((i) => i.level === 'main').length, 164)
    assert.equal(plan.items.filter((i) => i.level === 'sub').length, 48)
    const groups = {}
    for (const i of plan.items) if (i.level === 'main') groups[i.group] = (groups[i.group] ?? 0) + 1
    assert.deepEqual(groups, { SSR: 21, MAIL: 8, DSH: 54, CORE: 5, PUB: 11, REF: 7, CMS: 31, OPS: 27 })
    assert.equal(new Set(plan.items.map((i) => i.id)).size, 212)
  })
  test('158 findings declared by the ledgers (not the 155 of the brief), per shard, unique ids', () => {
    assert.equal(findings.findings.length, 158)
    const per = {}
    for (const f of findings.findings) per[f.shard] = (per[f.shard] ?? 0) + 1
    assert.deepEqual(per, { S1: 27, S2: 21, S3: 22, S4: 13, S5: 18, S6: 17, S7: 16, S8: 24 })
    assert.equal(new Set(findings.findings.map((f) => f.id)).size, 158)
  })
  test('nothing is invented: repro and fix refs are null/empty unless the ledger states them', () => {
    for (const f of findings.findings) {
      assert.ok(f.repro === null || /repro/i.test(f.repro), `${f.id} repro must come from a Repro line`)
      for (const r of f.fixRefs) assert.match(r, /^#\d+$/)
      assert.ok(f.line > 0 && /^ledger-S[1-8]\.md$/.test(f.ledger))
    }
  })
  test('a logical source note is kept and no private path leaks into committed JSON', () => {
    assert.equal(plan.source.repo, 'tch-qa-audit')
    assert.match(plan.source.sha256, /^[0-9a-f]{64}$/)
    assert.equal(findings.source.files.length, 8)
    for (const rel of [
      'legacy/audit-plan.json',
      'legacy/audit-findings.json',
      'inventory.json',
      'legacy-map.json'
    ]) {
      const text = readTextSync(join(INV, rel))
      assert.equal(
        /\/Users\/|\/home\/\w+\/|\/private\/var\//.test(text),
        false,
        `${rel} must not contain a machine path`
      )
    }
  })
})

describe('legacy map: exactly one valid owner per old asset, none dropped', () => {
  const map = read('legacy-map.json')
  const findings = read('legacy/audit-findings.json').findings
  const plan = read('legacy/audit-plan.json').items
  const regressionCount = read('inventory.json').sources.find((s) => s.name === 'regression').items
  test('every finding, audit item, regression case and journey is mapped once', () => {
    const ids = map.map((e) => `${e.kind}:${e.id}`)
    assert.equal(new Set(ids).size, ids.length, 'no asset twice')
    const by = (kind) => map.filter((e) => e.kind === kind)
    assert.equal(by('audit-finding').length, findings.length)
    assert.equal(by('audit-item').length, plan.length)
    // Counted from the catalogue folder itself, so a case merged from develop is expected here, not pinned out.
    const onDisk = readdirSync(join(HERE, '../../../regression/cases')).filter((f) =>
      f.endsWith('.json')
    ).length
    assert.equal(by('regression').length, onDisk)
    assert.equal(by('journey').length, 19)
    assert.equal(regressionCount, onDisk)
    assert.deepEqual(
      by('audit-finding')
        .map((e) => e.id)
        .sort(),
      findings.map((f) => f.id).sort()
    )
    assert.deepEqual(
      by('audit-item')
        .map((e) => e.id)
        .sort(),
      plan.map((p) => p.id).sort()
    )
  })
  test('owners are real layers and each entry names the rule that chose it', () => {
    for (const e of map) {
      assert.ok(LAYERS.includes(e.owner), `${e.id} owner ${e.owner}`)
      assert.ok(typeof e.basis === 'string' && e.basis !== '')
    }
    assert.ok(
      new Set(map.map((e) => e.owner)).size >= 6,
      'ownership is spread over the layers, not dumped in one'
    )
  })
  test('J2c stays listed with the reason it has no executable case', () => {
    const j2c = map.find((e) => e.kind === 'journey' && e.id === 'J2c')
    assert.equal(j2c.owner, 'flows')
    assert.match(j2c.note, /no executable case/)
  })
  test('buildLegacyMap sends unknown shapes to a layer, never drops them', () => {
    const out = buildLegacyMap({
      'legacy-plan': { items: [{ id: 'QA-ZZZ-001', auditId: 'QA-ZZZ-001', group: 'ZZZ' }] },
      'legacy-findings': {
        items: [
          { findingId: 'F-S9-001', items: [], title: 'nothing matches', evidence: [], evidenceNote: null }
        ]
      },
      regression: { items: [{ caseId: 'REG-X', area: 'unheard-of', needs: [], flakyModel: false }] },
      'e2e-journeys': { items: [{ journey: 'J99', notCovered: null }] }
    })
    assert.equal(out.length, 4)
    assert.ok(out.every((e) => LAYERS.includes(e.owner)))
    assert.match(out.find((e) => e.id === 'F-S9-001').basis, /fallback/)
  })
})
