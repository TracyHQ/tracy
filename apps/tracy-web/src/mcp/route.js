/** Stateless Streamable HTTP MCP on the API host, reusing the public REST router in-process. */
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { mcpTools, toolRequest } from './tools.js'
import { mcpOrigin } from '../lib/mcp-host.js'

export const MCP_VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18']

export function mcpRoutes({ config, api, document, resolvePrincipal, isApiHost }) {
  const app = new Hono()
  const entries = mcpTools(document)
  const tools = new Map(entries.map((entry) => [entry.tool.name, entry]))
  const challenge = `Bearer resource_metadata="${mcpOrigin(config)}/.well-known/oauth-protected-resource/mcp", scope="content"`
  const error = (c, id, code, message, status = 200) =>
    c.json({ jsonrpc: '2.0', id, error: { code, message } }, status)
  const result = (c, id, value) => c.json({ jsonrpc: '2.0', id, result: value })

  app.use('/mcp', async (c, next) => {
    if (!isApiHost(c)) return next()
    c.header('cache-control', 'private, no-store')
    const origin = c.req.header('origin')
    if (
      origin !== undefined &&
      ![
        mcpOrigin(config),
        config.origin,
        'https://chatgpt.com',
        'https://claude.ai',
        'https://www.cursor.com'
      ].includes(origin)
    )
      return c.json({ code: 'BAD_ORIGIN' }, 403)
    return next()
  })
  app.post(
    '/mcp',
    async (c, next) => {
      if (!isApiHost(c)) return next()
      return bodyLimit({ maxSize: 262144, onError: (ctx) => ctx.json({ code: 'REQUEST_TOO_LARGE' }, 413) })(
        c,
        next
      )
    },
    async (c, next) => {
      if (!isApiHost(c)) return next()
      if ((c.req.header('content-type') ?? '').toLowerCase().split(';')[0].trim() !== 'application/json')
        return c.json({ code: 'UNSUPPORTED_MEDIA_TYPE' }, 415)
      const accept = new Set(
        (c.req.header('accept') ?? '')
          .toLowerCase()
          .split(',')
          .map((part) => part.split(';')[0].trim())
      )
      if (!accept.has('application/json') || !accept.has('text/event-stream'))
        return c.json({ code: 'NOT_ACCEPTABLE' }, 406)
      const version = c.req.header('mcp-protocol-version')
      if (version !== undefined && !MCP_VERSIONS.includes(version))
        return c.json({ code: 'UNSUPPORTED_PROTOCOL_VERSION' }, 400)
      const auth = await resolvePrincipal(c, null)
      if (auth.error) {
        c.header('www-authenticate', challenge)
        return new Response(auth.error.body, {
          status: auth.error.status,
          headers: { ...Object.fromEntries(c.res.headers), 'content-type': 'application/json' }
        })
      }
      const message = await c.req.json().catch(() => undefined)
      if (message === undefined) return error(c, null, -32700, 'Parse error', 400)
      if (
        !message ||
        Array.isArray(message) ||
        message.jsonrpc !== '2.0' ||
        typeof message.method !== 'string' ||
        (message.id !== undefined && typeof message.id !== 'string' && !Number.isSafeInteger(message.id))
      )
        return error(c, null, -32600, 'Invalid Request', 400)
      const { id, method, params } = message
      if (id === undefined) {
        if (method === 'notifications/initialized' || method === 'notifications/cancelled')
          return c.body(null, 202)
        return error(c, null, -32600, 'Expected a request id', 400)
      }
      if (method === 'server/discover')
        return result(c, id, { supportedVersions: MCP_VERSIONS, capabilities: { tools: {} } })
      if (method === 'initialize') {
        if (!params || typeof params.protocolVersion !== 'string')
          return error(c, id, -32602, 'protocolVersion is required')
        return result(c, id, {
          protocolVersion: MCP_VERSIONS.includes(params.protocolVersion)
            ? params.protocolVersion
            : MCP_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'tracy', version: '0.1.0' },
          instructions:
            'Manage the connected Tracy site through these tools. Read the site and current content before editing. Keep apply receipts to undo changes. A refusal is final; never bypass Tracy with direct CMS writes.'
        })
      }
      if (method === 'ping') return result(c, id, {})
      if (method === 'tools/list') return result(c, id, { tools: entries.map((entry) => entry.tool) })
      if (method !== 'tools/call') return error(c, id, -32601, 'Method not found')
      const entry = tools.get(params?.name)
      if (!entry) return error(c, id, -32602, 'Unknown tool')
      let built
      try {
        built = toolRequest(entry, params.arguments ?? {}, config.apiOrigin)
      } catch (failure) {
        return error(c, id, -32602, failure.message)
      }
      // Only the verified credential and the declared REST headers cross the seam. No cookie, actor,
      // host, forwarded identity or caller-controlled URL can reach the Apply door through MCP.
      const headers = new Headers(built.headers)
      headers.set('authorization', c.req.header('authorization'))
      if (built.body !== undefined) headers.set('content-type', 'application/json')
      let answered
      try {
        answered = await api.fetch(
          new Request(built.url, {
            method: built.method,
            headers,
            ...(built.body !== undefined ? { body: JSON.stringify(built.body) } : {})
          })
        )
      } catch {
        // An interrupted write may already have landed: never retry it automatically.
        return result(c, id, {
          isError: true,
          content: [
            { type: 'text', text: 'The API did not answer. Check the apply history before retrying a write.' }
          ]
        })
      }
      const body =
        answered.status === 304 ? null : await answered.json().catch(() => ({ code: 'BAD_API_RESPONSE' }))
      const value = {
        status: answered.status,
        body,
        headers: Object.fromEntries(
          ['etag', 'tracy-apply-id', 'retry-after'].flatMap((name) =>
            answered.headers.has(name) ? [[name, answered.headers.get(name)]] : []
          )
        )
      }
      return result(c, id, {
        isError: answered.status >= 400 || body?.ok === false || body?.code === 'BAD_API_RESPONSE',
        ...(answered.status === 401 ? { _meta: { 'mcp/www_authenticate': [challenge] } } : {}),
        structuredContent: value,
        content: [{ type: 'text', text: JSON.stringify(value) }]
      })
    }
  )
  app.all('/mcp', (c, next) => {
    if (!isApiHost(c)) return next()
    c.header('allow', 'POST')
    return c.body(null, 405)
  })
  return app
}
