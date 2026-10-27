import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { CONTRACTS_DIR, loadSchema } from '../lib/contracts.mjs'
import { SchemaError, validate } from '../lib/schema.mjs'
import { readBytesAsync, readTextAsync } from '../lib/bounded-reader.mjs'

const ok = (schema, value) => assert.deepEqual(validate(schema, value), [])
const bad = (schema, value, fragment) => {
  const errors = validate(schema, value)
  assert.ok(errors.length > 0, `expected errors for ${JSON.stringify(value)}`)
  if (fragment)
    assert.ok(
      errors.some((e) => e.includes(fragment)),
      `${fragment} not in ${errors}`
    )
}

test('keywords the pinned schemas use are enforced', () => {
  ok({ type: 'string', minLength: 2, pattern: '^a' }, 'ab')
  bad({ type: 'string', minLength: 2 }, 'a', 'shorter')
  bad({ type: 'string', pattern: '^a' }, 'b', 'match')
  bad({ type: 'integer', minimum: 0 }, -1, 'below')
  bad({ type: 'integer' }, 1.5, 'expected')
  bad({ enum: ['a', 'b'] }, 'c', 'one of')
  bad({ const: '2' }, 2, 'equal')
  bad({ type: 'array', minItems: 1 }, [], 'fewer')
  bad({ type: 'array', uniqueItems: true }, [1, 1], 'duplicates')
  bad({ type: 'string', format: 'date-time' }, 'yesterday', 'date-time')
  ok({ type: 'string', format: 'date-time' }, '2026-10-05T10:00:00Z')
  const obj = {
    type: 'object',
    required: ['a'],
    additionalProperties: false,
    properties: { a: { type: 'string' } }
  }
  ok(obj, { a: 'x' })
  bad(obj, {}, 'missing required')
  bad(obj, { a: 'x', b: 1 }, 'unexpected')
  bad({ type: ['string', 'null'] }, 3, 'string|null')
  ok({ type: ['string', 'null'] }, null)
})

test('$ref, allOf, oneOf, anyOf and if/then/else work; broken refs are schema errors', () => {
  const root = {
    $defs: { n: { type: 'number', minimum: 1 } },
    type: 'object',
    properties: { x: { $ref: '#/$defs/n' } }
  }
  ok(root, { x: 2 })
  bad(root, { x: 0 }, 'below')
  bad({ oneOf: [{ type: 'string' }, { type: 'string', minLength: 1 }] }, 'a', 'exactly one')
  ok({ oneOf: [{ type: 'null' }, { type: 'string' }] }, null)
  bad({ anyOf: [{ type: 'string' }, { type: 'null' }] }, 3, 'anyOf')
  bad({ allOf: [{ type: 'object' }, { required: ['k'] }] }, {}, 'missing required')
  const cond = JSON.parse(
    '{"if":{"properties":{"k":{"const":1}},"required":["k"]},"then":{"required":["z"]},"else":{"required":["y"]}}'
  )
  bad(cond, { k: 1 }, '"z"')
  ok(cond, { k: 1, z: 1 })
  bad(cond, { k: 2 }, '"y"')
  assert.throws(() => validate({ $ref: '#/$defs/missing' }, 1), SchemaError)
  assert.throws(() => validate({ $ref: 'https://example.test/x.json' }, 1), SchemaError)
})

test('unsupported validation keywords are rejected, never ignored', () => {
  for (const keyword of [
    { not: {} },
    { patternProperties: {} },
    { dependentRequired: {} },
    { contains: {} },
    { multipleOf: 2 },
    { format: 'email' }
  ]) {
    assert.throws(() => validate(keyword, 1), SchemaError, JSON.stringify(keyword))
  }
})

test('every pinned schema compiles with the validator', async () => {
  const names = (await fs.readdir(CONTRACTS_DIR)).filter((n) => n.endsWith('.schema.json'))
  assert.equal(names.length, 8)
  for (const name of names) await loadSchema(name)
})

test('result.schema.json: F3 finding needs an independent oracle (if/then branch)', async () => {
  const schema = await loadSchema('result.schema.json')
  const base = {
    schema_version: '2',
    adapter: 'a',
    outcome: 'success',
    repository: 'r',
    revision: 'x',
    run_id: 'id',
    assurance_target: 'T2',
    command: 'c',
    exit_code: 0,
    started_at: '2026-10-05T10:00:00Z',
    finished_at: '2026-10-05T10:00:01Z',
    environment: { runner_os: 'darwin', runner_arch: 'arm64', workflow_ref: 'manual:pnpm-qa' },
    artifacts: [],
    findings: []
  }
  ok(schema, base)
  const finding = { id: 'f', severity: 'low', f_state: 'F3', r_state: 'R0' }
  bad(schema, { ...base, findings: [finding] }, 'oracle')
  ok(schema, { ...base, findings: [{ ...finding, oracle: { kind: 'independent', source: 's' } }] })
  bad(schema, { ...base, outcome: 'passed' }, 'one of')
  bad(schema, { ...base, extra: 1 }, 'unexpected')
})

test('case and layer-result schemas accept the shared-brief shapes and reject drift', async () => {
  const caseSchema = await loadSchema('case.schema.json')
  const manifest = {
    id: 'QA-API-GET-x-happy',
    itemIds: ['GET /x'],
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
  ok(caseSchema, manifest)
  ok(caseSchema, {
    ...manifest,
    redProof: { kind: 'commit', ref: 'abc', assertionId: 'a', log: 'red/a.log' }
  })
  bad(caseSchema, { ...manifest, targets: ['staging'] })
  bad(caseSchema, { ...manifest, redProof: { kind: 'guess', ref: 'abc', assertionId: 'a', log: 'l' } })
  bad(caseSchema, { ...manifest, id: 'REG-1' }, 'match')
  const { legacyIds, ...rest } = manifest
  void legacyIds
  bad(caseSchema, rest, 'legacyIds')
  const resultSchema = await loadSchema('layer-result.schema.json')
  const row = {
    id: 'QA-API-GET-x-happy',
    verdict: 'FAIL',
    reason: 'why',
    assertionIds: ['a'],
    evidence: [],
    durationMs: 3,
    redProof: null
  }
  ok(resultSchema, [row])
  bad(resultSchema, [{ ...row, reason: '' }], 'shorter')
  bad(resultSchema, [{ ...row, verdict: 'SKIP' }])
})

test('pinned audit-kit copies match SOURCE.md sha256 and are not reformatted', async () => {
  const { createHash } = await import('node:crypto')
  const source = await readTextAsync(path.join(CONTRACTS_DIR, 'SOURCE.md'))
  assert.match(source, /660c72edc499720eeb80b0605ddd0eee557b7540/)
  const rows = [...source.matchAll(/^\| `([^`]+\.schema\.json)` \| `[^`]+` \| `([0-9a-f]{64})` \|$/gm)]
  assert.equal(rows.length, 5)
  for (const [, name, sha] of rows) {
    const actual = createHash('sha256')
      .update(await readBytesAsync(path.join(CONTRACTS_DIR, name)))
      .digest('hex')
    assert.equal(actual, sha, `${name} differs from its pinned hash`)
  }
})

test('malformed keyword values are rejected when the schema compiles', () => {
  const bad = [
    { type: 'array', uniqueItems: 'true' },
    { type: 'array', minItems: -1 },
    { type: 'array', maxItems: 1.5 },
    { type: 'string', minLength: '1' },
    { type: 'string', pattern: 5 },
    { type: 'string', format: 5 },
    { type: 'number', minimum: '0' },
    { type: 'number', maximum: Number.NaN },
    { allOf: [] },
    { anyOf: [] },
    { oneOf: [] },
    { enum: [] },
    { required: 'a' },
    { properties: [] },
    { items: [{ type: 'string' }] }
  ]
  for (const schema of bad) {
    assert.throws(() => validate(schema, 1), /./, JSON.stringify(schema))
  }
  assert.deepEqual(validate(true, 1), [])
  assert.match(validate(false, 1)[0], /not allowed/)
})
