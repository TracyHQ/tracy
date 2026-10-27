import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  sanitizeToolName,
  sanitizeDescription,
  normalizeJsonSchema,
  normalizeTools,
} from '../lib/tools-normalizer.js'
import { openaiTools, anthropicPayload } from '../lib/messages.js'
import { geminiFunctionDeclarations } from '../lib/gemini-schema.js'

test('sanitizeToolName cleans spaces, dots, and illegal characters', () => {
  assert.equal(sanitizeToolName('web.search'), 'web_search')
  assert.equal(sanitizeToolName('run tool!'), 'run_tool_')
  assert.equal(sanitizeToolName(''), 'tool_fn')
  assert.equal(sanitizeToolName(null), 'tool_fn')
  assert.equal(sanitizeToolName('a'.repeat(100)).length, 64)
})

test('sanitizeDescription handles strings, nulls, and extraneous whitespace', () => {
  assert.equal(sanitizeDescription('  my tool  '), 'my tool')
  assert.equal(sanitizeDescription(null), '')
  assert.equal(sanitizeDescription(123), '123')
})

test('normalizeJsonSchema ensures object type and cleans enums and required fields', () => {
  const schema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'Input',
    properties: {
      action: {
        type: ['string', 'null'],
        enum: ['start', 'stop', '', null, '   '],
      },
      count: { type: 'integer' },
    },
    required: ['action', 'non_existent_key'],
  }

  const out = normalizeJsonSchema(schema)
  assert.equal(out.type, 'object')
  assert.equal(out.$schema, undefined)
  assert.deepEqual(out.properties.action.enum, ['start', 'stop'])
  assert.equal(out.properties.action.type, 'string')
  assert.equal(out.properties.action.nullable, true)
  // 'non_existent_key' should be filtered out because it is not in properties
  assert.deepEqual(out.required, ['action'])
})

test('normalizeTools normalizes tools array', () => {
  const tools = [
    {
      name: 'fetch.url',
      description: '  Fetches a URL  ',
      parameters: {
        properties: {
          url: { type: 'string' },
        },
      },
    },
    null,
    { invalid: true },
  ]

  const out = normalizeTools(tools)
  assert.equal(out.length, 1)
  assert.equal(out[0].name, 'fetch_url')
  assert.equal(out[0].description, 'Fetches a URL')
  assert.equal(out[0].parameters.type, 'object')
  assert.equal(out[0].parameters.properties.url.type, 'string')
})

test('openaiTools integrates with normalizeTools', () => {
  const options = {
    tools: [
      {
        name: 'read.file',
        description: 'Read file',
        parameters: { properties: { path: { type: 'string' } } },
      },
    ],
  }

  const tools = openaiTools(options)
  assert.equal(tools.length, 1)
  assert.equal(tools[0].type, 'function')
  assert.equal(tools[0].function.name, 'read_file')
  assert.equal(tools[0].function.parameters.type, 'object')
})

test('anthropicPayload integrates with normalizeTools and caches last tool', () => {
  const options = {
    model: 'claude-3-7-sonnet-20250219',
    tools: [
      { name: 'cmd.run', description: 'Run command' },
      { name: 'view.file', description: 'View file' },
    ],
    messages: [{ role: 'user', content: 'run' }],
  }

  const payload = anthropicPayload(options)
  assert.equal(payload.tools.length, 2)
  assert.equal(payload.tools[0].name, 'cmd_run')
  assert.equal(payload.tools[1].name, 'view_file')
  assert.deepEqual(payload.tools[1].cache_control, { type: 'ephemeral' })
})

test('geminiFunctionDeclarations integrates with normalizeTools', () => {
  const tools = [
    {
      name: 'calc.sum',
      description: 'Calculates sum',
      parameters: { properties: { a: { type: 'number' }, b: { type: 'number' } } },
    },
  ]

  const decls = geminiFunctionDeclarations(tools)
  assert.equal(decls.length, 1)
  assert.equal(decls[0].name, 'calc_sum')
  assert.equal(decls[0].parameters.type, 'object')
})

test("normalizeJsonSchema preserves anyOf, oneOf, object additionalProperties, and primitive enums (#403)", () => {
  const schema = {
    type: "object",
    properties: {
      choice: {
        oneOf: [{ type: "string" }, { type: "number" }]
      },
      status: {
        type: "integer",
        enum: [1, 2, 3]
      }
    },
    additionalProperties: { type: "string" }
  }
  const out = normalizeJsonSchema(schema)
  assert.equal(out.type, "object")
  assert.equal(out.additionalProperties.type, "string")
  assert.deepEqual(out.properties.choice.oneOf[0], { type: "string" })
  assert.deepEqual(out.properties.status.enum, [1, 2, 3])
})

test("normalizeJsonSchema preserves $defs, $ref, and const semantics (#403)", () => {
  const input = {
    type: "object",
    $defs: { mode: { const: "safe" } },
    properties: { mode: { $ref: "#/$defs/mode" } },
    required: ["mode"]
  }
  const output = normalizeJsonSchema(input)
  assert.equal(output.$defs?.mode?.const, "safe")
  assert.equal(output.properties?.mode?.$ref, "#/$defs/mode")
})

test("normalizeJsonSchema preserves boolean false schema (#403)", () => {
  assert.equal(normalizeJsonSchema(false), false)
  assert.equal(normalizeJsonSchema(true), true)
})
