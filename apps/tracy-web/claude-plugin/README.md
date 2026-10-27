# Tracy in Claude — source in preparation

`skills/manage-site/SKILL.md` is the source of the skill saved in the personal plugin **Tracy v1** on
Claude on 15/10/2026. The interface confirmed `1 skill` and `Only adds instructions for Claude`.
This is not a release bundle yet: there is no manifest exported from Claude and no `.mcp.json` wired to the real endpoint.

The `src/mcp/` bridge supports CIMD for hosted Claude and OAuth PKCE for ChatGPT.
Settled endpoint: **https://cowork.tracy.ai/mcp**. Marketing and support links stay on `tracy.ai`.
The resource metadata uses the full `/mcp` URL; codes, grants, refresh and revoke are bound to the client;
the Claude callback is fixed at `https://claude.ai/api/mcp/auth_callback`. The consent page shows the host
`claude.ai` and does not trust a self-declared name from the metadata. Not deployed yet, and OAuth/tools not yet checked on real Claude.

Before release: check discovery, sign-in, and read/edit/undo on the designated test site.

The Directory profile has only been filled in a browser tab; it is not yet a submission on the account.
Portal notice: `Draft kept in this tab until you close it`.

Official documentation:
- https://claude.com/docs/plugins/build
- https://claude.com/docs/connectors/building/authentication
- https://claude.com/docs/directory/publish
