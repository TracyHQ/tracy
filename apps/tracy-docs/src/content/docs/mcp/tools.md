---
title: Tools
description: The Tracy MCP tool catalogue, argument structure, results, and write boundaries.
---

Your AI app discovers these tools through `tools/list`. Usually you describe the task in plain language; the app chooses the tool and supplies arguments.

## Discover and read

Tool inputs are discovered through `tools/list`; the current catalogue is generated from
Tracy's public REST routes. The `key` parameter must name the connected site. Use ids and
revisions returned by reads rather than guessing them.

| Tool | Purpose |
| --- | --- |
| `tracy_get_me` | Read the connection's account, site and scopes. |
| `tracy_get_sites_by_key` | Discover content types, locales, capabilities and permissions. |
| `tracy_get_sites_by_key_pages` | List pages and their URLs. |
| `tracy_get_sites_by_key_contents` | List published content with fields and revisions. |
| `tracy_get_sites_by_key_contents_by_id` | Read one content item. |
| `tracy_get_sites_by_key_changes` | Read changes since a recent pages snapshot. |
| `tracy_get_sites_by_key_design` | Read the site's recorded design tokens, when available. |
| `tracy_get_sites_by_key_records_by_kind` | List records of a supported CMS kind. |
| `tracy_get_sites_by_key_records_by_kind_by_id` | Read one CMS record. |
| `tracy_patch_sites_by_key_records_by_kind_by_id` | Create or update a supported record. |
| `tracy_delete_sites_by_key_records_by_kind_by_id` | Trash a supported record with a change receipt. |
| `tracy_get_sites_by_key_applies` | List recorded changes for this connection. |
| `tracy_get_sites_by_key_applies_by_id` | Inspect a change receipt. |
| `tracy_post_sites_by_key_applies_by_id_revert` | Undo supported steps from a receipt. |

## Content contract operations

Each operation is a separate tool with a fixed operation, its own input schema, and read/write annotations. There is no generic operation dispatcher. Every tool takes the connected site key in `path.key`; its operation cannot be selected or overridden through arguments. Availability still depends on the site's CMS and contract profile.

| Tool | Purpose |
| --- | --- |
| `tracy_post_sites_by_key_contract_inspect` | Inspect content slots and their current revision. |
| `tracy_post_sites_by_key_contract_bind` | Bind the site to its content contract. |
| `tracy_post_sites_by_key_contract_apply` | Apply changes to named content slots. |
| `tracy_post_sites_by_key_contract_string` | Override one WordPress gettext string. |
| `tracy_post_sites_by_key_contract_multilingual_plan` | Plan a Joomla language edition without changing the site. |
| `tracy_post_sites_by_key_contract_multilingual_package` | Install the reviewed Joomla language package for an edition. |
| `tracy_post_sites_by_key_contract_multilingual_apply` | Apply translated slots to a Joomla language edition. |
| `tracy_post_sites_by_key_contract_multilingual_verify` | Verify a Joomla language edition without changing it. |
| `tracy_post_sites_by_key_contract_multilingual_revert` | Undo a Joomla language edition. |
| `tracy_post_sites_by_key_contract_multilingual_retire` | Hide language editions except the ones to keep. |
| `tracy_post_sites_by_key_contract_multilingual_restore` | Restore language editions hidden under a receipt. |
| `tracy_post_sites_by_key_contract_demoTrim_plan` | Plan which reviewed demo content would be hidden. |
| `tracy_post_sites_by_key_contract_demoTrim_apply` | Hide a batch of reviewed quickstart demo content. |
| `tracy_post_sites_by_key_contract_demoTrim_revert` | Restore hidden quickstart demo content. |
| `tracy_post_sites_by_key_contract_siteLanguage_plan` | Plan the default site language without changing it. |
| `tracy_post_sites_by_key_contract_siteLanguage_set` | Change the default site language. |
| `tracy_post_sites_by_key_contract_siteLanguage_revert` | Restore the previous default site language. |
| `tracy_post_sites_by_key_contract_sourceLanguage_plan` | Plan the source content language without changing it. |
| `tracy_post_sites_by_key_contract_sourceLanguage_set` | Change the source content language. |
| `tracy_post_sites_by_key_contract_sourceLanguage_revert` | Restore the previous source content language. |

For operation schemas, revision conditions and CMS limits, see the
[API reference](/reference/), [authentication](/authentication/) and [errors](/reference/errors/).

## Argument structure

Tools group arguments by their API location. Required fields differ by tool; use its discovered schema rather than guessing a flat object.

| Group | Used for |
| --- | --- |
| `path` | Website key, content id, record kind, or receipt id |
| `query` | Supported filters and pagination |
| `header` | Supported revision or change-identity headers |
| `body` | Fields or operation input for a write |

For example, the account-and-site read requires no arguments:

```json title="Read the connection identity"
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": { "name": "tracy_get_me", "arguments": {} }
}
```

After reading the returned site key, a site-details call uses this shape. Replace the placeholder with that returned key:

```json title="Read site details"
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "tracy_get_sites_by_key",
    "arguments": { "path": { "key": "YOUR_CONNECTED_SITE_KEY" } }
  }
}
```

These examples require an authenticated MCP session; they contain no credentials.

## Results and errors

A tool result carries the API response in `structuredContent`, including `status`, `headers`, and `body`. Inspect `isError` and the structured response instead of treating HTTP transport success as proof that an edit succeeded.

## Writes and receipts

Record updates, trash operations, content-contract operations, and undo can modify the website. Check the discovered schema and site capabilities before calling them. Read current values and revisions first; preserve fields outside the requested change.

A successful write returns a change identity that can be used with the receipt tools. [Working with your site](/mcp/working-with-your-site/) explains verification and the limits of undo.
