// EmDash 0.38 native authentication bridge for a private GET outside /_emdash/api.
// This is a prerequisite, not a Content API reader or an advertised capability.
// The callback must use native authorized route handlers (not bare DB handlers).
import { onRequest as nativeRuntime } from 'emdash/middleware'
import { onRequest as nativeAuth } from 'emdash/middleware/auth'

export async function withNativeContentAuth(context, read) {
  context.cache?.set(false)
  const failure = (status, code) => new Response(JSON.stringify({ error: { code, message: 'Content request refused.' } }), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' }
  })
  // Bearer only: a session is not the service principal used by the Tracy transport.
  if (!/^Bearer \S+$/.test(context.request.headers.get('authorization') ?? ''))
    return failure(401, 'CONTENT_UNAUTHENTICATED')
  if (context.request.method !== 'GET') return failure(405, 'CONTENT_BAD_QUERY')
  const url = new URL(context.url)
  // The official middleware otherwise treats /content.json as a public page, ignores
  // PATs and never evaluates content:read. Do not mutate the original Astro context.
  url.pathname = '/_emdash/api/content'
  const locals = { ...context.locals, user: undefined, tokenScopes: undefined }
  const nativeContext = { ...context, url, locals, request: new Request(url, { headers: context.request.headers }) }
  let entered = false
  try {
    const response = await nativeRuntime(nativeContext, () => nativeAuth(nativeContext, async () => {
      if (!locals.user || !Array.isArray(locals.tokenScopes))
        return failure(401, 'CONTENT_UNAUTHENTICATED')
      entered = true
      return read({ ...context, locals })
    }))
    if (!entered) return failure(response.status === 403 ? 403 : 401,
      response.status === 403 ? 'CONTENT_FORBIDDEN' : 'CONTENT_UNAUTHENTICATED')
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch {
    // Do not echo native exceptions: they may contain request or storage details.
    return failure(503, 'CONTENT_SOURCE_UNAVAILABLE')
  }
}
