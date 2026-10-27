// Surround native authentication rather than bypassing it. Only translate its denial shape.
export async function onRequest(context, next) {
  const response = await next()
  if (!['/content.json', '/_emdash/api/content/tracy-content-v1.json'].includes(context.url.pathname))
    return response
  if (![401, 403].includes(response.status)) return response
  return Response.json(
    {
      error: {
        code: response.status === 401 ? 'CONTENT_UNAUTHENTICATED' : 'CONTENT_FORBIDDEN',
        message: 'Content access denied.'
      }
    },
    { status: response.status, headers: { 'Cache-Control': 'private, no-store' } }
  )
}
