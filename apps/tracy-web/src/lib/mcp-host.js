/** A separately configured MCP origin owns only these paths, never the product site's pages. */
export const MCP_PATHS = new Set([
  '/mcp',
  '/oauth/token',
  '/oauth/revoke',
  '/oauth/device/code',
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/mcp'
])
export const mcpOrigin = (config) => config.mcpOrigin || config.origin
export const mcpResource = (config) => `${mcpOrigin(config)}/mcp`
export function onMcpHost(c, config) {
  const origin = mcpOrigin(config)
  return (
    Boolean(origin) &&
    (c.req.header('host') ?? new URL(c.req.url).host).toLowerCase() === new URL(origin).host.toLowerCase()
  )
}
export function ownsMcpRequest(c, config) {
  return onMcpHost(c, config) && MCP_PATHS.has(new URL(c.req.url).pathname)
}
