---
title: EmDash
description: An EmDash site has no Claude Cowork plugin — Tracy reads it through its own reader, and writes go through the site's own REST and MCP API.
---

## What answers the call

An **EmDash** site carries no Claude Cowork plugin. Reads go through **Tracy's own reader**, which
talks to the site's EmDash API and answers the same Content API documents as the two other CMSs:
`GET /v1/sites/{key}` (describe), `…/pages`, `…/contents`, `…/contents/{id}` and `…/changes` all
work, with the same `ETag`, `version` and `changedSince` behaviour.

The reader has no release of its own to check: it ships with Tracy, so the [Compatibility](/reference/compatibility/)
table shows no minimum version in the EmDash column. Tracy reads what the site holds and says so
when a collection has no site model.

## Writes: the site's own API

The `records` routes, `contract` operations and undo receipts are answered by the Claude Cowork
plugin on Joomla and WordPress; an EmDash site has none, so on EmDash they answer
`501 CONTENT_ADAPTER_UNSUPPORTED` (reads that the reader does not serve) or `unsupported`.

To change an EmDash site, use **its own REST and MCP API**, documented by EmDash on the site itself
at `/_emdash/api/openapi.json`, with the credentials that site issues. The Tracy agent works the
same way there: it reads through Tracy and writes through EmDash's MCP.

## What differs from Joomla and WordPress

| | Joomla / WordPress | EmDash |
|---|---|---|
| Reads (`content.read`) | Claude Cowork plugin, from release 0.18.0 / 0.14.0 | Tracy reader, always |
| `content.locate` (which record printed an element) | yes | yes |
| Records `PATCH` / `DELETE`, contract applies, undo | plugin | not through Tracy — the site's own API |
| Content types | the plugin's map of the CMS | one type per collection, from the template's `content-api-map.json` |
| `native` | CMS kind + id | the EmDash collection and entry |

## What to watch for

- A template that ships no site model answers a `describe` with what the reader could infer, and
  says so; do not expect slots on such a site.
- `changedSince` has the same 30-minute / 500-walk limit as on the other platforms; on
  `409 CONTENT_SNAPSHOT_EXPIRED` read `/pages` again.
