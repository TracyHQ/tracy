/** MCP tools are generated from the public REST contract; no second CMS write door. */
import { V1_ROUTES } from '../lib/v1-routes.js'
import { contractTools } from './contract-tools.js'

const object = (properties = {}, required = []) => ({
  type: 'object',
  properties,
  additionalProperties: false,
  ...(required.length ? { required } : {})
})

/** Inline local OpenAPI references so each tool carries a self-contained JSON Schema. */
function inline(value, document, seen = new Set()) {
  if (Array.isArray(value)) return value.map((v) => inline(v, document, seen))
  if (!value || typeof value !== 'object') return value
  if (value.$ref) {
    const ref = value.$ref
    if (!ref.startsWith('#/') || seen.has(ref)) throw new Error('MCP schema has an unsupported reference')
    const target = ref
      .slice(2)
      .split('/')
      .reduce((v, k) => v?.[k.replace(/~1/g, '/').replace(/~0/g, '~')], document)
    if (!target) throw new Error('MCP schema reference is missing')
    return inline(target, document, new Set([...seen, ref]))
  }
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, inline(v, document, seen)]))
}

export function mcpTools(document) {
  return V1_ROUTES.flatMap((row) => {
    const path = row.path.replace(/:([a-zA-Z]+)/g, '{$1}')
    const operation = document.paths[path]?.[row.method.toLowerCase()]
    if (!operation) throw new Error(`MCP route has no public contract: ${row.method} ${path}`)
    const properties = {}
    const required = []
    for (const location of ['path', 'query', 'header']) {
      const params = (operation.parameters ?? []).filter((p) => p.in === location)
      if (!params.length) continue
      properties[location] = object(
        Object.fromEntries(
          params.map((p) => [
            p.name,
            {
              ...inline(p.schema, document),
              description: p.description
            }
          ])
        ),
        params.filter((p) => p.required).map((p) => p.name)
      )
      if (params.some((p) => p.required)) required.push(location)
    }
    const body = operation.requestBody
    if (body) {
      properties.body = inline(body.content['application/json'].schema, document)
      if (body.required) required.push('body')
    }
    const name = `tracy_${row.method.toLowerCase()}_${row.path.slice(4).replace(/:/g, 'by_').replace(/\//g, '_')}`
    const entry = {
      row,
      tool: {
        name,
        title: row.summary,
        description: row.description,
        inputSchema: object(properties, required),
        annotations: {
          readOnlyHint: !row.writes,
          destructiveHint: Boolean(row.writes),
          idempotentHint: !row.writes,
          openWorldHint: true
        },
        securitySchemes: [{ type: 'oauth2', scopes: ['content'] }]
      }
    }
    return row.action === 'content.contract' ? contractTools(entry) : [entry]
  })
}

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Validate the transport envelope; the REST layer and Apply door validate CMS parameters. */
export function toolRequest(entry, args, apiOrigin) {
  if (!record(args)) throw new Error('arguments must be an object')
  const schema = entry.tool.inputSchema
  for (const key of Object.keys(args))
    if (!Object.hasOwn(schema.properties, key)) throw new Error(`Unknown argument: ${key}`)
  for (const key of schema.required ?? [])
    if (args[key] === undefined) throw new Error(`Missing argument: ${key}`)
  for (const group of ['path', 'query', 'header']) {
    if (args[group] === undefined) continue
    const shape = schema.properties[group]
    if (!shape || !record(args[group])) throw new Error(`Invalid ${group}`)
    for (const key of Object.keys(args[group])) {
      const field = shape.properties[key]
      if (
        !field ||
        (field.type === 'integer'
          ? !Number.isSafeInteger(args[group][key])
          : typeof args[group][key] !== 'string')
      )
        throw new Error(`Invalid ${group}.${key}`)
    }
    for (const key of shape.required ?? [])
      if (args[group][key] === undefined) throw new Error(`Missing ${group}.${key}`)
  }
  if (args.body !== undefined && !record(args.body)) throw new Error('body must be an object')
  if (entry.contractOperation) {
    const shape = schema.properties.body
    for (const key of Object.keys(args.body ?? {}))
      if (!Object.hasOwn(shape.properties, key)) throw new Error(`Unknown body.${key}`)
    for (const key of shape.required ?? [])
      if (args.body?.[key] === undefined) throw new Error(`Missing body.${key}`)
  }
  const path = entry.row.path.replace(/:([a-zA-Z]+)/g, (_match, name) => {
    const value = args.path?.[name]
    // Encoding alone does not stop WHATWG dot-segment normalisation or double decoding downstream.
    if (
      typeof value !== 'string' ||
      !value ||
      value.length > 255 ||
      value === '.' ||
      value === '..' ||
      /[%/\\?#\s]/.test(value) ||
      [...value].some((char) => char.charCodeAt(0) < 33)
    )
      throw new Error(`Invalid path.${name}`)
    return encodeURIComponent(value)
  })
  const url = new URL(path, apiOrigin)
  for (const [key, value] of Object.entries(args.query ?? {})) url.searchParams.set(key, String(value))
  let headers
  try {
    headers = new Headers(args.header ?? {})
  } catch {
    throw new Error('Invalid header value')
  }
  return { url, method: entry.row.method, headers, body: args.body }
}
