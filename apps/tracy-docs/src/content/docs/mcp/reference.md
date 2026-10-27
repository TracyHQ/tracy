---
title: Technical reference
description: Streamable HTTP transport, OAuth discovery, supported clients, and request diagnostics.
---

The transport is stateless **Streamable HTTP**, using JSON-RPC over `POST /mcp`.
Send `Content-Type: application/json` and accept `application/json, text/event-stream`.
Requests are limited to 256 KiB. `GET` and `DELETE` on the MCP endpoint return `405`;
a browser opening the URL is not a connection test.

Unauthenticated MCP requests return `401` with a `WWW-Authenticate` header pointing to protected
resource metadata. A browser session cookie and an ordinary manually created API key do not
authenticate MCP. Never put an access token in the URL.

| Setting | Production value |
| --- | --- |
| MCP resource | `https://cowork.tracy.ai/mcp` |
| Protected resource metadata | `https://cowork.tracy.ai/.well-known/oauth-protected-resource/mcp` |
| Metadata alias | `https://cowork.tracy.ai/.well-known/oauth-protected-resource` |
| OAuth issuer | `https://cowork.tracy.ai` |
| Authorization server metadata | `https://cowork.tracy.ai/.well-known/oauth-authorization-server` |
| Authorization endpoint | `https://cowork.tracy.ai/oauth/authorize` |
| Token endpoint | `https://cowork.tracy.ai/oauth/token` |
| Revocation endpoint | `https://cowork.tracy.ai/oauth/revoke` |
| Scope | `content` |
| PKCE | `S256`, required |
| ChatGPT public client id | `tracy-chatgpt` |
| ChatGPT callback | `https://chatgpt.com/connector_platform_oauth_redirect` |
| Hosted Claude registration | CIMD from HTTPS `claude.ai` metadata, public client authentication `none` |
| Hosted Claude callback | `https://claude.ai/api/mcp/auth_callback` |
| Claude Code public client id | `tracy-claude-code` |
| Claude Code callback | `http://localhost:17832/callback` |
| Cursor public client id | `tracy-cursor` |
| Cursor callbacks | `http://localhost:8787/callback`, `https://www.cursor.com/agents/mcp/oauth/callback` |
| Codex public client id | `tracy-codex` |
| Codex callback | `http://127.0.0.1:17833/callback` |

Token exchange and refresh use `application/x-www-form-urlencoded`. The resource parameter is
the **full MCP URL**, including `/mcp`. Authorization codes are single-use and expire after five
minutes. Codes, grants, refresh and revocation are bound to the originating client and site.
Dynamic client registration and arbitrary redirect URLs are not supported.

## Read-only endpoint check

The following command sends an unauthenticated initialization request. It does not grant access or change a website.

```sh title="Check the OAuth challenge"
curl -i https://cowork.tracy.ai/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"connection-check","version":"1.0"}}}'
```

Expected without a token: `401` and a `WWW-Authenticate` challenge pointing to resource metadata. This checks discovery only. A complete connection test must authorize a supported client and successfully call a read tool.

## Integrator checklist

- Use the exact resource URL in authorization and token exchange.
- Keep client identity, callback, verifier, and authorization code from the same flow.
- Store credentials securely and rotate refresh tokens as instructed by the server.
- Discover tool schemas, then respect site identity, capabilities, and revision preconditions.
- Treat a failed or timed-out write as uncertain until you inspect its receipt and affected content.
- Never log access tokens, refresh tokens, cookies, or sign-in codes.

[Other client compatibility →](/mcp/clients/other/)
