---
title: Other MCP clients
description: Check transport and OAuth requirements before connecting another app to Tracy.
---

## Check compatibility first

Tracy uses a remote Streamable HTTP server. A client must support OAuth discovery, PKCE S256, the full resource URL, and a client identity and redirect URI accepted by Tracy. A generic MCP implementation is not automatically compatible.

| Setting | Value |
| --- | --- |
| Server name | Tracy |
| URL | `https://cowork.tracy.ai/mcp` |
| Transport | Streamable HTTP |
| Authentication | OAuth; website-scoped access |
| Scope | `content` |

## Before writing configuration

1. Identify the exact client and surface, including whether its callback is local or hosted.
2. Compare its registration method and callback with [Tracy's OAuth reference](/mcp/reference/).
3. If the client is unsupported, use an existing supported connection method. Do not work around a refused connection by changing identity or passing website administrator credentials.
4. Once a compatible connection is available, verify a real read before requesting an edit.

A Tracy browser cookie and an ordinary API key do not authenticate MCP. There is no generic static-token setup offered by this guide.

## Request help with a client

Share the app name, version, operating system, callback requirements from its documentation, and a redacted error. Never send tokens or login codes. [Contact Tracy](/mcp/troubleshooting/#get-help).
