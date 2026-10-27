/**
 * `verdict` / `compareDocuments` — the decision `check-api-spec.ts` makes, tested on small documents
 * away from the filesystem (same shape as `check-origins.test.ts`), plus `normalize` and the
 * `llms.txt` built from the real public reference.
 *
 *   node --import tsx --test scripts/test/check-api-spec.test.ts
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compareDocuments, newestChangelogDate, verdict } from '../check-api-spec.ts'

type Doc = Record<string, unknown>

/** A small normalized public document: one read, one write with a typed body. */
function doc(): Doc {
  return {
    openapi: '3.1.0',
    info: { title: 'Tracy API', version: 'v1' },
    paths: {
      '/api/sites': { get: { operationId: 'list', responses: { 200: {} }, security: [{ session: [] }] } },
      '/api/sites/{key}/apply': {
        post: {
          operationId: 'apply',
          parameters: [{ in: 'path', name: 'key', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Body' } } }
          },
          responses: {
            200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Answer' } } } }
          }
        }
      }
    },
    components: {
      schemas: {
        Body: {
          type: 'object',
          required: ['action'],
          properties: {
            action: { type: 'string', enum: ['info', 'content.read'] },
            params: { type: 'object' }
          }
        },
        Answer: { type: 'object', properties: { ok: { type: 'boolean' }, error: { type: 'string' } } }
      }
    }
  }
}

const clone = (value: Doc): Doc => structuredClone(value)
const CHANGELOG = '# Tracy API changelog\n\n## 2026-09-28\n\n- Public reference published\n'
const snap = (pub: Doc, recorded = '2026-09-28') => ({ recorded, public: pub, internal: pub })
const run = (before: Doc, after: Doc, changelog: string | null = CHANGELOG, recorded?: string) =>
  verdict(snap(before, recorded), { public: after, internal: after }, changelog)

test('unchanged documents pass and say how many operations they hold', () => {
  const result = run(doc(), doc())
  assert.equal(result.ok, true, result.lines.join('\n'))
  assert.match(result.lines.join('\n'), /matches the snapshot \(2 operations/)
})

test('a reordered parameter list or enum is not a change', () => {
  const after = clone(doc())
  const body = (after.components as Doc).schemas as Record<
    string,
    { properties: { action: { enum: string[] } } }
  >
  body.Body.properties.action.enum.reverse()
  assert.deepEqual(compareDocuments(doc(), after), [])
})

test('an operation removed is BREAKING and names the operation', () => {
  const after = clone(doc())
  delete (after.paths as Doc)['/api/sites']
  const result = run(doc(), after)
  assert.equal(result.ok, false)
  const text = result.lines.join('\n')
  assert.match(text, /BREAKING {2}public: path removed — paths › \/api\/sites\b/)
  assert.match(text, /info\.version is still "v1"/)
})

test('a request property removed, an enum value removed and a type changed are all BREAKING', () => {
  const after = clone(doc())
  const schemas = (after.components as Doc).schemas as Record<string, Doc>
  const body = schemas.Body as { properties: Record<string, { type?: string; enum?: string[] }> }
  delete body.properties.params
  body.properties.action.enum = ['info']
  ;(schemas.Answer as { properties: { ok: { type: string } } }).properties.ok.type = 'string'
  const reasons = compareDocuments(doc(), after)
    .filter((f) => f.severity === 'breaking')
    .map((f) => `${f.reason} @ ${f.where}`)
  assert.deepEqual(reasons.sort(), [
    'enum value removed @ components › schemas › Body › properties › action › enum › content.read',
    'request property removed @ components › schemas › Body › properties › params',
    'type changed @ components › schemas › Answer › properties › ok › type'
  ])
})

test('a response property removed is BREAKING; a request property newly required is too', () => {
  const after = clone(doc())
  const schemas = (after.components as Doc).schemas as Record<
    string,
    { properties: Doc; required?: string[] }
  >
  delete schemas.Answer.properties.error
  schemas.Body.required = ['action', 'params']
  const reasons = compareDocuments(doc(), after)
    .filter((f) => f.severity === 'breaking')
    .map((f) => f.reason)
  assert.deepEqual(reasons.sort(), ['request property newly required', 'response property removed'])
})

test('a parameter made required, or a required parameter added, is BREAKING', () => {
  const after = clone(doc())
  const list = ((after.paths as Doc)['/api/sites'] as { get: Doc }).get
  list.parameters = [{ in: 'query', name: 'page', required: true, schema: { type: 'string' } }]
  const found = compareDocuments(doc(), after)
  assert.deepEqual(
    found.map((f) => [f.severity, f.reason, f.where]),
    [['breaking', 'required parameter added', 'GET /api/sites › parameters']]
  )
})

test('anything added is ADDITIVE and red with the snapshot + changelog instruction', () => {
  const after = clone(doc())
  ;(after.paths as Doc)['/api/new'] = { get: { operationId: 'new', responses: { 200: {} } } }
  ;((after.components as Doc).schemas as Record<string, { properties: Doc }>).Answer.properties.version = {
    type: 'string'
  }
  const result = run(doc(), after)
  assert.equal(result.ok, false)
  const text = result.lines.join('\n')
  assert.match(
    text,
    /run pnpm api:snapshot and add a dated line to docs\/references\/api-changelog\.md/,
    'the fixed instruction'
  )
  assert.match(text, /ADDITIVE {2}public: added — paths › \/api\/new/)
  assert.match(text, /ADDITIVE {2}public: added — components › schemas › Answer › properties › version/)
  assert.doesNotMatch(text, /BREAKING/)
})

test('a breaking change with info.version moved is no longer "breaking" — only a stale snapshot', () => {
  const after = clone(doc())
  delete (after.paths as Doc)['/api/sites']
  ;(after.info as Doc).version = 'v2'
  const result = run(doc(), after)
  assert.equal(result.ok, false)
  const text = result.lines.join('\n')
  assert.doesNotMatch(text, /info\.version is still/)
  assert.match(text, /run pnpm api:snapshot/)
})

test('a changelog older than the snapshot is red; one dated the same day or later passes', () => {
  assert.equal(run(doc(), doc(), CHANGELOG, '2026-10-02').ok, false)
  assert.match(run(doc(), doc(), CHANGELOG, '2026-10-02').lines.join('\n'), /changed on 2026-10-02/)
  assert.equal(run(doc(), doc(), `${CHANGELOG}\n## 2026-10-02\n\n- x\n`, '2026-10-02').ok, true)
  assert.equal(run(doc(), doc(), null).ok, false)
  assert.equal(newestChangelogDate('## 2026-09-28\n## 2026-10-01\n### 2027-01-01\n'), '2026-10-01')
})

test('internal-only differences ask for the snapshot, not a changelog line', () => {
  const internal = clone(doc())
  ;(internal.paths as Doc)['/api/ops/x'] = { get: { operationId: 'x', responses: { 200: {} } } }
  const result = verdict(snap(doc()), { public: doc(), internal }, CHANGELOG)
  assert.equal(result.ok, false)
  assert.match(result.lines.join('\n'), /internal only: no changelog line needed/)
})

test('normalize drops servers and prose, keeps a property named description, sorts keys', async () => {
  const { normalize } = await import('../build-api-spec.mjs')
  const out = normalize({
    servers: [{ url: 'https://x' }],
    info: { version: 'v1', title: 'T', description: 'long words' },
    components: { schemas: { A: { description: 'd', properties: { description: { type: 'string' } } } } }
  }) as Doc
  assert.deepEqual(Object.keys(out), ['components', 'info'])
  assert.deepEqual(out.info, { title: 'T', version: 'v1' })
  assert.deepEqual(out.components, { schemas: { A: { properties: { description: { type: 'string' } } } } })
})

test('llms.txt lists every public operation and links the reference', async () => {
  const { buildDocuments } = await import('../build-api-spec.mjs')
  const { buildLlmsTxt } = await import('../../apps/tracy-web/src/api-reference/llms.js')
  const { public: pub } = buildDocuments() as { public: { paths: Record<string, Record<string, unknown>> } }
  const text = buildLlmsTxt(pub)
  assert.match(text, /^# Tracy API\n\n> /)
  const lines = new Set(text.split('\n'))
  const methods = ['get', 'put', 'post', 'patch', 'delete', 'head', 'options', 'trace']
  let count = 0
  for (const [path, item] of Object.entries(pub.paths))
    for (const method of Object.keys(item).filter((m) => methods.includes(m))) {
      count += 1
      const prefix = `- ${method.toUpperCase()} ${path} — `
      assert.ok(
        [...lines].some((l) => l.startsWith(prefix)),
        `missing ${method.toUpperCase()} ${path}`
      )
    }
  assert.ok(count > 10, `only ${count} operations — the public document looks empty`)
  assert.equal(text.split('\n').filter((l) => /^- [A-Z]+ \//.test(l)).length, count, 'one line per operation')
  assert.match(text, /\(https:\/\/api\.example\/docs\/api\)/)
  assert.match(text, /\(https:\/\/api\.example\/docs\/api\/openapi\.json\)/)
})
