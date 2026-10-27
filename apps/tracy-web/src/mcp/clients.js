/** Pre-registered public OAuth clients; every callback is exact. Hosted Claude uses CIMD. */
export const CLIENT_ID = 'tracy-chatgpt'
export const REDIRECT_URI = 'https://chatgpt.com/connector_platform_oauth_redirect'
export const CLAUDE_REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback'

// Fixed listener ports are part of the client configuration, not a wildcard loopback policy.
export const NATIVE_CLIENTS = Object.freeze(
  [
    { id: 'tracy-claude-code', name: 'Claude Code', redirectUris: ['http://localhost:17832/callback'] },
    {
      id: 'tracy-cursor',
      name: 'Cursor',
      redirectUris: ['http://localhost:8787/callback', 'https://www.cursor.com/agents/mcp/oauth/callback']
    },
    { id: 'tracy-codex', name: 'Codex', redirectUris: ['http://127.0.0.1:17833/callback'] }
  ].map((client) => Object.freeze({ ...client, redirectUris: Object.freeze(client.redirectUris) }))
)

export const acceptsRedirect = (client, uri) =>
  Boolean(client && (client.redirectUris ?? [client.redirectUri]).includes(uri))

export async function oauthClient(id, fetchImpl = fetch) {
  const native = NATIVE_CLIENTS.find((client) => client.id === id)
  if (native) return native
  if (id === CLIENT_ID) return { id, name: 'ChatGPT', redirectUri: REDIRECT_URI }
  if (typeof id !== 'string' || id.length > 2048) return null
  let url
  try {
    url = new URL(id)
  } catch {
    return null
  }
  if (
    url.origin !== 'https://claude.ai' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname === '/'
  )
    return null
  try {
    const response = await fetchImpl(id, {
      redirect: 'error',
      signal: AbortSignal.timeout(3000),
      headers: { accept: 'application/json' }
    })
    if (!response.ok || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? ''))
      return null
    const reader = response.body?.getReader()
    if (!reader) return null
    let text = '',
      size = 0
    const decoder = new TextDecoder()
    try {
      for (;;) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.byteLength
        if (size > 16384) {
          await reader.cancel()
          return null
        }
        text += decoder.decode(part.value, { stream: true })
      }
      text += decoder.decode()
    } finally {
      reader.releaseLock()
    }
    const doc = JSON.parse(text)
    if (
      doc.client_id !== id ||
      doc.token_endpoint_auth_method !== 'none' ||
      !Array.isArray(doc.redirect_uris) ||
      !doc.redirect_uris.includes(CLAUDE_REDIRECT_URI)
    )
      return null
    // The metadata's self-asserted client_name cannot impersonate another app on the consent page.
    return { id, name: 'claude.ai', redirectUri: CLAUDE_REDIRECT_URI }
  } catch {
    return null
  }
}

/** Device-flow clients (RFC 8628): public, no secret, no redirect; account-level scopes only. */
export const DEVICE_CLIENTS = Object.freeze([
  Object.freeze({
    id: 'website-opportunities',
    name: 'Website Opportunities',
    scopes: Object.freeze(['demos'])
  })
])
export const deviceClient = (id) => DEVICE_CLIENTS.find((client) => client.id === id) ?? null
