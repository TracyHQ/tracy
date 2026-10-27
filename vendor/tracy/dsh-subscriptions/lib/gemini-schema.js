import { normalizeTools } from './tools-normalizer.js'
const TYPE_MAP = {
  string: 'string',
  number: 'number',
  integer: 'integer',
  boolean: 'boolean',
  array: 'array',
  object: 'object',
}

function asType(value) {
  if (Array.isArray(value)) {
    const nullable = value.includes('null')
    const first = value.find((item) => item && item !== 'null')
    return { type: TYPE_MAP[String(first || 'string').toLowerCase()] || 'string', nullable }
  }
  if (typeof value === 'string' && TYPE_MAP[value.toLowerCase()]) {
    return { type: TYPE_MAP[value.toLowerCase()], nullable: false }
  }
  return null
}

export function toGeminiSchema(schema, depth) {
  const level = Number(depth) || 0
  if (level > 12) return { type: 'string' }
  if (!schema || typeof schema !== 'object') return { type: 'string' }
  if (Array.isArray(schema)) return toGeminiSchema(schema[0] || { type: 'string' }, level + 1)

  const typed = asType(schema.type)
  let type = typed ? typed.type : null
  if (!type) {
    if (schema.properties) type = 'object'
    else if (schema.items) type = 'array'
    else type = 'string'
  }
  const out = { type }
  if ((typed && typed.nullable) || schema.nullable === true) out.nullable = true
  if (schema.description) out.description = String(schema.description)
  if (type === 'object') {
    const props = schema.properties
    if (props && typeof props === 'object' && !Array.isArray(props)) {
      out.properties = {}
      for (const [key, value] of Object.entries(props)) {
        out.properties[key] = toGeminiSchema(value, level + 1)
      }
    }
    if (Array.isArray(schema.required)) {
      out.required = schema.required.filter((item) => typeof item === 'string')
    }
  }
  if (type === 'array') {
    const items = schema.items
    out.items = toGeminiSchema(Array.isArray(items) ? items[0] : (items || { type: 'string' }), level + 1)
  }
  if (Array.isArray(schema.enum) && schema.enum.length) {
    const cleaned = [...new Set(
      schema.enum
        .map((item) => String(item ?? '').trim())
        .filter((item) => item.length > 0),
    )]
    if (cleaned.length > 0) {
      out.enum = cleaned
    }
  }
  return out
}

export function geminiFunctionDeclarations(tools) {
  const norm = normalizeTools(tools)
  if (!norm) return undefined
  return norm.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: toGeminiSchema(tool.parameters),
  }))
}