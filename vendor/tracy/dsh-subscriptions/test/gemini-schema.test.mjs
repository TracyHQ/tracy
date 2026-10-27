import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toGeminiSchema, geminiFunctionDeclarations } from '../lib/gemini-schema.js'
import { googleContents } from '../lib/messages.js'

test('toGeminiSchema flattens nullable union types', () => {
  assert.deepEqual(toGeminiSchema({ type: ['string', 'null'] }), { type: 'string', nullable: true })
})

test('toGeminiSchema keeps properties as a map, never a list', () => {
  const out = toGeminiSchema({
    type: 'object',
    properties: { n: { type: 'number' } },
  })
  assert.equal(out.type, 'object')
  assert.equal(Array.isArray(out.properties), false)
  assert.equal(out.properties.n.type, 'number')
})

test('toGeminiSchema ignores array-shaped properties', () => {
  const out = toGeminiSchema({ type: 'object', properties: [{ type: 'string' }] })
  assert.equal(out.properties, undefined)
})

test('geminiFunctionDeclarations sanitizes host tool JSON Schema', () => {
  const decls = geminiFunctionDeclarations([
    {
      name: 'web_search',
      description: 'search',
      parameters: {
        type: 'object',
        properties: {
          query: { type: ['string', 'null'] },
          count: { type: 'integer' },
        },
        required: ['query'],
      },
    },
  ])
  assert.equal(decls[0].parameters.properties.query.type, 'string')
  assert.equal(decls[0].parameters.properties.query.nullable, true)
  assert.equal(JSON.stringify(decls).includes('["string","null"]'), false)
})

test('googleContents puts sanitized declarations on Cloud Code tools', () => {
  const body = googleContents({
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    tools: [{
      name: 'web_search',
      parameters: { type: 'object', properties: { q: { type: ['string', 'null'] } } },
    }],
  })
  const schema = body.tools[0].functionDeclarations[0].parameters
  assert.equal(schema.properties.q.type, 'string')
  assert.equal(schema.properties.q.nullable, true)
})
test('toGeminiSchema cleans empty and whitespace-only enum entries and deduplicates (#392 / GH #10)', () => {
  const schemaWithEmpty = {
    type: 'object',
    properties: {
      permission: { type: 'string', enum: ['read', 'write', 'ask', '', '   ', null, undefined] },
    },
  }
  const out = toGeminiSchema(schemaWithEmpty)
  assert.deepEqual(out.properties.permission.enum, ['read', 'write', 'ask'])

  // If enum only contains empty entries, enum property should be omitted entirely
  const schemaOnlyEmpty = {
    type: 'string',
    enum: ['', '  ', null],
  }
  const outEmpty = toGeminiSchema(schemaOnlyEmpty)
  assert.equal(outEmpty.enum, undefined)

  // Deduplication check
  const schemaDupes = {
    type: 'string',
    enum: ['a', 'b', 'a'],
  }
  const outDupes = toGeminiSchema(schemaDupes)
  assert.deepEqual(outDupes.enum, ['a', 'b'])
})
