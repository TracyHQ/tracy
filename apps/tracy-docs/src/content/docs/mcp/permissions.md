---
title: Permissions & security
description: Understand website-scoped access, connection expiry, data handling, and revocation.
---

## What you authorize

Each OAuth connection belongs to one Tracy account and **one site**, with the `content` scope.
It cannot grant more access than that person's current seat. The connector does not provide
shell commands, arbitrary file access, billing, site provisioning or general account administration.

Access tokens last one hour. Refresh rotates the tokens while keeping the same connection
identity for receipts and revocation. Consent lasts up to 30 days, after which you reconnect.
Removing the seat or revoking the connection prevents it from being refreshed into access again.

## Disconnect and revoke

1. In Tracy, open **Settings → API keys**.
2. Find the key corresponding to the connection, such as **ChatGPT · Tracy**, **claude.ai · Tracy**, or **Codex · Tracy**.
3. Revoke that key. Check the app and site identity so you revoke the intended connection.
4. Remove the connector from your AI app as well. Removing an app-side configuration alone should not be treated as proof of server-side revocation.

Reconnect explicitly if you want to grant access again. Removing the connection does not undo edits already made; use the relevant receipt for supported undo.

## What data is shared

Tool results can include the selected website's content, account/site identity, revisions, and change receipts requested by your AI app. That app receives the results and processes them under its own policies. Avoid asking it to retrieve content you do not want to share with that service.

## Stored authorization data

Tracy stores hashes of OAuth secrets rather than the original tokens. OAuth hash and grant
metadata can remain after expiration or revocation for replay detection and audit; this initial
implementation does not have a scheduled deletion period for those records. See the published
[privacy policy](https://tracy.ai/privacy/) and [terms](https://tracy.ai/terms/) for the service's policies.

## Editing and undo

Your current site role and operation support still apply to every request. A write can fail after an earlier read if your role or the content has changed. A receipt records an operation; it does not guarantee every step can be undone in every later state.

[Understand the edit workflow →](/mcp/working-with-your-site/)
