import { withEmDashRuntime } from 'emdash/middleware'
import options from 'virtual:tracy-content-map'
import { CommandError, internalRequest } from './command.mjs'
const denied = (status, code, message) =>
  Response.json({ error: { code, message } }, { status, headers: { 'Cache-Control': 'private, no-store' } })
// A real Astro rewrite re-enters all middleware on the native route. No synthetic auth context.
// The rewrite is always a GET: native 0.38 auth maps every POST under /_emdash/api/content to
// content:write, so a read-only relay PAT can only reach the reader as a GET. The canonical POST
// body becomes the query plus two internal authority headers, which the route trusts only for the
// relay PAT (command.mjs). Native auth still runs, unchanged, on the rewritten request.
export async function onRequest(context, next) {
  if (context.url.pathname !== '/content.json') return next()
  context.cache?.set(false)
  // Leave an existing customer route with its original router. Check all mapped URL patterns
  // that can collide, including unpublished rows that could later become public.
  try {
    const collision = await withEmDashRuntime(async (runtime) => {
      for (const [collection, map] of Object.entries(options.mapping.collections)) {
        if (map.urlPattern === '/content.json') return true
        if (map.urlPattern !== '/{slug}') continue
        for (const locale of options.locales) {
          const r = await runtime.handleContentGet(collection, 'content.json', locale)
          if (r.success) return true
          if (r.error?.code !== 'NOT_FOUND') throw Error('Source unavailable')
        }
      }
      return false
    })
    if (collision) return next()
  } catch {
    return denied(503, 'CONTENT_SOURCE_UNAVAILABLE', 'Content source unavailable.')
  }
  const { request } = context
  let body
  if (request.method === 'POST') {
    try {
      body = await request.json()
    } catch {
      return denied(400, 'CONTENT_BAD_QUERY', 'Content request could not be completed.')
    }
  }
  let internal
  try {
    internal = internalRequest(context.url, request.method, request.headers, body)
  } catch (e) {
    if (e instanceof CommandError) return denied(e.status, e.code, 'Content request could not be completed.')
    throw e
  }
  return context.rewrite(internal)
}
