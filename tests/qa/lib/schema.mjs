// Minimal JSON Schema validator for the contracts under tests/qa/contracts.
// It implements exactly the keywords those schemas use and REJECTS every other validation
// keyword at compile time, so a schema can never silently validate less than it says.

const ANNOTATIONS = new Set([
  '$schema',
  '$id',
  '$comment',
  'comment', // free-text annotation used by cross-audit-coverage.schema.json
  'title',
  'description',
  'default',
  'examples',
  'deprecated',
  '$defs'
])
const VALIDATORS = new Set([
  'type',
  'enum',
  'const',
  'required',
  'properties',
  'additionalProperties',
  'items',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'pattern',
  'format',
  '$ref',
  'allOf',
  'anyOf',
  'oneOf',
  'if',
  'then',
  'else'
])
const TYPES = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null'])
const DATE_TIME = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/

export class SchemaError extends Error {}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function typeOf(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  return typeof value
}

function matchesType(value, type) {
  const actual = typeOf(value)
  return actual === type || (type === 'number' && actual === 'integer')
}

function deepEqual(a, b) {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keysA = Object.keys(a)
  if (keysA.length !== Object.keys(b).length) return false
  return keysA.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]))
}

function resolveRef(root, ref, path) {
  if (typeof ref !== 'string' || !ref.startsWith('#')) {
    throw new SchemaError(`${path}: only local $ref is supported (got ${JSON.stringify(ref)})`)
  }
  let node = root
  for (const raw of ref.slice(1).split('/').slice(1)) {
    const key = raw.replaceAll('~1', '/').replaceAll('~0', '~')
    if (!isObject(node) && !Array.isArray(node)) throw new SchemaError(`${path}: broken $ref ${ref}`)
    if (!Object.hasOwn(node, key)) throw new SchemaError(`${path}: broken $ref ${ref}`)
    node = node[key]
  }
  if (ref !== '#' && !ref.startsWith('#/')) throw new SchemaError(`${path}: unsupported $ref ${ref}`)
  if (!isObject(node) && typeof node !== 'boolean')
    throw new SchemaError(`${path}: $ref ${ref} is not a schema`)
  return node
}

const compiled = new WeakSet()

// Walk the whole schema once: unsupported keyword, malformed keyword value or broken $ref throws.
export function compileSchema(root) {
  if (typeof root !== 'boolean' && compiled.has(root)) return root
  const seen = new Set()
  const walk = (schema, path) => {
    if (typeof schema === 'boolean') return
    if (!isObject(schema)) throw new SchemaError(`${path}: schema must be an object`)
    if (seen.has(schema)) return
    seen.add(schema)
    for (const key of Object.keys(schema)) {
      if (!ANNOTATIONS.has(key) && !VALIDATORS.has(key)) {
        throw new SchemaError(`${path}: unsupported schema keyword "${key}"`)
      }
    }
    if ('type' in schema) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type]
      if (types.length === 0 || !types.every((t) => TYPES.has(t))) throw new SchemaError(`${path}: bad type`)
    }
    if ('enum' in schema && !(Array.isArray(schema.enum) && schema.enum.length > 0))
      throw new SchemaError(`${path}: enum must be a non-empty array`)
    if (
      'required' in schema &&
      !(Array.isArray(schema.required) && schema.required.every((r) => typeof r === 'string'))
    ) {
      throw new SchemaError(`${path}: required must be a string array`)
    }
    if ('pattern' in schema && typeof schema.pattern === 'string') {
      try {
        new RegExp(schema.pattern, 'u')
      } catch {
        throw new SchemaError(`${path}: invalid pattern`)
      }
    }
    if ('format' in schema && schema.format !== 'date-time') {
      throw new SchemaError(`${path}: unsupported format "${schema.format}"`)
    }
    for (const key of ['minItems', 'maxItems', 'minLength', 'maxLength']) {
      if (key in schema && !(Number.isInteger(schema[key]) && schema[key] >= 0))
        throw new SchemaError(`${path}: ${key} must be a non-negative integer`)
    }
    for (const key of ['minimum', 'maximum']) {
      if (key in schema && !(typeof schema[key] === 'number' && Number.isFinite(schema[key])))
        throw new SchemaError(`${path}: ${key} must be a finite number`)
    }
    if ('uniqueItems' in schema && typeof schema.uniqueItems !== 'boolean')
      throw new SchemaError(`${path}: uniqueItems must be a boolean`)
    if ('pattern' in schema && typeof schema.pattern !== 'string')
      throw new SchemaError(`${path}: pattern must be a string`)
    if ('format' in schema && typeof schema.format !== 'string')
      throw new SchemaError(`${path}: format must be a string`)
    if ('properties' in schema) {
      if (!isObject(schema.properties)) throw new SchemaError(`${path}: properties must be an object`)
      for (const [k, v] of Object.entries(schema.properties)) walk(v, `${path}/properties/${k}`)
    }
    if ('$defs' in schema) {
      if (!isObject(schema.$defs)) throw new SchemaError(`${path}: $defs must be an object`)
      for (const [k, v] of Object.entries(schema.$defs)) walk(v, `${path}/$defs/${k}`)
    }
    for (const key of ['additionalProperties', 'items', 'if', 'then', 'else']) {
      if (key in schema) walk(schema[key], `${path}/${key}`)
    }
    for (const key of ['allOf', 'anyOf', 'oneOf']) {
      if (key in schema) {
        if (!Array.isArray(schema[key]) || schema[key].length === 0)
          throw new SchemaError(`${path}: ${key} must be a non-empty array`)
        schema[key].forEach((s, i) => walk(s, `${path}/${key}/${i}`))
      }
    }
    if ('$ref' in schema) walk(resolveRef(root, schema.$ref, path), `${path}/$ref`)
  }
  walk(root, '#')
  if (typeof root !== 'boolean') compiled.add(root)
  return root
}

function check(root, schema, value, path, errors) {
  if (schema === true) return
  if (schema === false) {
    errors.push(`${path}: not allowed`)
    return
  }
  if ('$ref' in schema) check(root, resolveRef(root, schema.$ref, path), value, path, errors)
  if ('type' in schema) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!types.some((t) => matchesType(value, t))) {
      errors.push(`${path}: expected ${types.join('|')}, got ${typeOf(value)}`)
      return
    }
  }
  if ('enum' in schema && !schema.enum.some((e) => deepEqual(e, value))) {
    errors.push(`${path}: must be one of ${JSON.stringify(schema.enum)}`)
  }
  if ('const' in schema && !deepEqual(schema.const, value)) {
    errors.push(`${path}: must equal ${JSON.stringify(schema.const)}`)
  }
  if (typeof value === 'string') {
    if ('minLength' in schema && [...value].length < schema.minLength)
      errors.push(`${path}: shorter than ${schema.minLength}`)
    if ('maxLength' in schema && [...value].length > schema.maxLength)
      errors.push(`${path}: longer than ${schema.maxLength}`)
    if ('pattern' in schema && !new RegExp(schema.pattern, 'u').test(value)) {
      errors.push(`${path}: does not match ${schema.pattern}`)
    }
    if (schema.format === 'date-time' && (!DATE_TIME.test(value) || Number.isNaN(Date.parse(value)))) {
      errors.push(`${path}: not a date-time`)
    }
  }
  if (typeof value === 'number') {
    if ('minimum' in schema && value < schema.minimum) errors.push(`${path}: below ${schema.minimum}`)
    if ('maximum' in schema && value > schema.maximum) errors.push(`${path}: above ${schema.maximum}`)
  }
  if (Array.isArray(value)) {
    if ('minItems' in schema && value.length < schema.minItems)
      errors.push(`${path}: fewer than ${schema.minItems} items`)
    if ('maxItems' in schema && value.length > schema.maxItems)
      errors.push(`${path}: more than ${schema.maxItems} items`)
    if (schema.uniqueItems === true) {
      for (let i = 0; i < value.length; i += 1) {
        for (let j = 0; j < i; j += 1) {
          if (deepEqual(value[i], value[j])) errors.push(`${path}/${i}: duplicates item ${j}`)
        }
      }
    }
    if ('items' in schema) value.forEach((item, i) => check(root, schema.items, item, `${path}/${i}`, errors))
  }
  if (isObject(value)) {
    for (const req of schema.required ?? []) {
      if (!Object.hasOwn(value, req)) errors.push(`${path}: missing required "${req}"`)
    }
    const props = schema.properties ?? {}
    for (const [key, sub] of Object.entries(props)) {
      if (Object.hasOwn(value, key)) check(root, sub, value[key], `${path}/${key}`, errors)
    }
    if ('additionalProperties' in schema) {
      for (const key of Object.keys(value)) {
        if (Object.hasOwn(props, key)) continue
        if (schema.additionalProperties === false) errors.push(`${path}: unexpected property "${key}"`)
        else check(root, schema.additionalProperties, value[key], `${path}/${key}`, errors)
      }
    }
  }
  for (const sub of schema.allOf ?? []) check(root, sub, value, path, errors)
  if (schema.anyOf) {
    const ok = schema.anyOf.some((s) => validateWith(root, s, value, path).length === 0)
    if (!ok) errors.push(`${path}: matches none of anyOf`)
  }
  if (schema.oneOf) {
    const hits = schema.oneOf.filter((s) => validateWith(root, s, value, path).length === 0).length
    if (hits !== 1) errors.push(`${path}: must match exactly one of oneOf (matched ${hits})`)
  }
  if ('if' in schema) {
    const holds = validateWith(root, schema.if, value, path).length === 0
    if (holds && 'then' in schema) check(root, schema.then, value, path, errors)
    if (!holds && 'else' in schema) check(root, schema.else, value, path, errors)
  }
}

function validateWith(root, schema, value, path) {
  const errors = []
  check(root, schema, value, path, errors)
  return errors
}

// Returns a list of error strings; empty means valid. A bad schema throws SchemaError.
export function validate(schema, value) {
  compileSchema(schema)
  return validateWith(schema, schema, value, '#')
}
