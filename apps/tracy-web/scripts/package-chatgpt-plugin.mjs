#!/usr/bin/env node
/** Build a portable plugin only after checking the real deployed OAuth/MCP connection. No secrets. */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import sharp from 'sharp'
import { TRACY_ICON_DATA_URI } from '../src/lib/tracy-icon.js'
import { CLIENT_ID } from '../src/mcp/oauth-store.js'

const SOURCE = new URL('../chatgpt-plugin/', import.meta.url)
const validOrigin = (value) => {
  const url = new URL(value)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('A public HTTPS origin without a path or credentials is required')
  return url.origin
}

export async function pluginArchive({ apiOrigin, tracyOrigin, fetchImpl = fetch }) {
  const api = validOrigin(apiOrigin)
  const tracy = validOrigin(tracyOrigin)
  const getJson = async (url) => {
    const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error(`The deployed endpoint is unavailable: ${url} (${response.status})`)
    return response.json()
  }
  const resource = await getJson(`${api}/.well-known/oauth-protected-resource`)
  const oauth = await getJson(`${tracy}/.well-known/oauth-authorization-server`)
  if (
    resource.resource !== `${api}/mcp` ||
    !resource.authorization_servers?.includes(tracy) ||
    !resource.scopes_supported?.includes('content')
  )
    throw new Error('The deployed MCP resource metadata does not match the requested origins')
  if (
    oauth.issuer !== tracy ||
    oauth.authorization_endpoint !== `${tracy}/oauth/authorize` ||
    oauth.token_endpoint !== `${api}/oauth/token` ||
    !oauth.code_challenge_methods_supported?.includes('S256') ||
    !oauth.token_endpoint_auth_methods_supported?.includes('none') ||
    oauth.authorization_response_iss_parameter_supported !== true
  )
    throw new Error('The deployed OAuth server does not support the Tracy plugin contract')
  const probe = await fetchImpl(`${api}/mcp`, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
  })
  if (
    probe.status !== 401 ||
    !probe.headers.get('www-authenticate')?.includes(`${api}/.well-known/oauth-protected-resource`)
  )
    throw new Error('The deployed MCP endpoint did not issue the expected OAuth challenge')
  const manifestText = await readFile(new URL('plugin.json', SOURCE), 'utf8')
  const manifest = JSON.parse(manifestText)
  if (manifest.extensions['com.openai'].interface.shortDescription.length > 30)
    throw new Error('Plugin subtitle is too long')
  const mcp = {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
    mcpServers: {
      tracy: {
        type: 'streamable-http',
        url: `${api}/mcp`,
        extensions: {
          'com.openai': {
            auth: {
              type: 'oauth',
              client: { mode: 'provided', clientId: CLIENT_ID, tokenEndpointAuthMethod: 'none' },
              authorizationServerBase: tracy,
              authorizationUrl: `${tracy}/oauth/authorize`,
              tokenUrl: `${api}/oauth/token`,
              resource: `${api}/mcp`,
              defaultScopes: ['content']
            }
          }
        }
      }
    }
  }
  const svg = decodeURIComponent(TRACY_ICON_DATA_URI.split(',').slice(1).join(','))
  const icon = await sharp(Buffer.from(svg)).resize(512, 512).png().toBuffer()
  return zipSync({
    'tracy/plugin.json': strToU8(manifestText),
    'tracy/mcp.json': strToU8(`${JSON.stringify(mcp, null, 2)}\n`),
    'tracy/skills/manage-site/SKILL.md': new Uint8Array(
      await readFile(new URL('skills/manage-site/SKILL.md', SOURCE))
    ),
    'tracy/assets/icon.png': new Uint8Array(icon)
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [apiOrigin, tracyOrigin, output] = process.argv.slice(2)
  if (!apiOrigin || !tracyOrigin || !output || process.argv.length !== 5) {
    process.stderr.write(
      'Usage: node apps/tracy-web/scripts/package-chatgpt-plugin.mjs <mcp-https-origin> <tracy-https-origin> <output.zip>\n'
    )
    process.exitCode = 1
  } else {
    await writeFile(resolve(output), await pluginArchive({ apiOrigin, tracyOrigin }), { mode: 0o600 })
    process.stdout.write(
      `Wrote ${resolve(output)}. Endpoint discovery verified; authenticated ChatGPT testing and public review materials are still required.\n`
    )
  }
}
