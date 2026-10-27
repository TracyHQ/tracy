---
title: Troubleshooting
description: Resolve connection, authorization, tool, and undo errors without losing track of your changes.
---

## The MCP URL does not open in my browser

`GET https://cowork.tracy.ai/mcp` returns `405 Method Not Allowed`. This is expected: the endpoint accepts MCP requests over POST. Use your AI app's connection flow, or the [read-only diagnostic](/mcp/reference/#read-only-endpoint-check).

## The app says Not live

A publishing portal's **Not live** label describes listing availability; it is not by itself an endpoint health check. A custom development connection can work before a public listing exists. Confirm tool availability with a real authenticated read.

## Connection and tool errors

| Symptom | What to check |
| --- | --- |
| The service cannot discover Tracy | Use the full HTTPS MCP URL, including `/mcp`. Check that resource and authorization server metadata are reachable. An HTML sign-in page or `302` response is not an MCP response. |
| No website is available on consent | Sign in to the correct Tracy account, accept the site invitation, and check that the seat allows content editing. |
| `401` after a connection worked | Let the client refresh. If access was revoked, the consent expired or the seat was removed, reconnect only after resolving that condition. |
| `invalid_client` | Use the client ID and callback in the guide for your app, or the hosted Claude CIMD flow. Do not reuse another app's client identity or callback. |
| `invalid_grant` | The code, verifier, resource, client or refresh token does not match, or the credential expired or was used already. Start a fresh sign-in rather than replaying it. |
| `403` on a tool call | Check the connected site, current seat and content permissions. Reconnecting does not grant a stronger role. |
| `412 REVISION_STALE` | Read the record again and use its current revision before deciding on an edit. |
| `429` | Wait for `Retry-After`. Do not repeatedly retry writes. |
| An operation is unsupported | Check site capabilities and the API reference. Do not work around the refusal with shell, SQL or direct CMS credentials. |

## Sign-in cannot return to a local app

Keep the callback port available: Claude Code uses `17832`, Cursor desktop uses `8787`, and Codex uses `17833`. Keep the exact hostname, port and `/callback` path from the app's guide. `localhost` and `127.0.0.1` are different registered addresses.

If another process owns the port, close that process only if it belongs to you, then start a fresh sign-in. Do not change the callback to a random port. Use a browser on the same computer as the CLI; a remote machine's loopback address does not reach your local terminal.

## A write timed out

Do not repeat the write immediately. Ask the app to read the affected record and inspect the recent change receipts. If the first request completed, another write may apply the change twice.

## Undo did not restore everything

Inspect the original receipt and the undo result. Some steps may be unsupported or have preconditions that no longer hold. Read the affected content and report the remaining difference before taking further action.

## Get help

For connection help, use the [Tracy community on Discord](https://discord.gg/BM9TMRcEBb), linked
from the official [Help Center](https://tracy.ai/help/). Include the AI service, the operation,
the time, the HTTP/error code and a redacted receipt id when relevant. Do not post passwords,
cookies, access/refresh tokens or private website content. Remove a failing connection and
reconnect only when you are ready to grant access again.
