# Tracy in ChatGPT

The bridge lives in `tracy-web` and uses the **same** `/v1` API and Apply door. It never calls a site's CMS, host or database
directly. The tool list comes from the table in `lib/v1-routes.js`; parameter schemas come from the OpenAPI
document the composition root passes in. Each contract operation has its own tool in `contract-tools.js`,
with a fixed path, its own schema and its own read/write annotations; no tool takes an arbitrary `operation` any more.
`derive` is for provisioning only, so it is not published to the model. The remaining tools read content, edit records,
view receipts and undo. What is actually possible is still decided by each site's adapter.

## Connection addresses

- `TRACY_ORIGIN` (production `https://cowork.tracy.ai`): `POST /mcp`, `/.well-known/oauth-protected-resource`, `/oauth/token`, `/oauth/revoke`.
  The resource/token/revoke doors clear cookies before routing. MCP only accepts keys issued through an OAuth consent;
  ordinary API keys cannot be used instead.
- `TRACY_ORIGIN`: `/.well-known/oauth-authorization-server`, `GET/POST /oauth/authorize`.
  The consent page uses the existing Tracy sign-in session; the form is signed per account and expires after
  10 minutes; the POST re-checks Origin and the seat. The customer picks exactly one site where they hold an accepted Editor/Owner seat.

MCP shares the application host by default; `MCP_ORIGIN` is only an override when needed. It needs the existing `API_ORIGIN` and `API_KEY_PEPPER`
settings, plus migration `111-mcp-oauth.sql`. With configuration missing, the OAuth metadata returns 503. Rollout only needs the **tracy-web** image;
it does not change the dsh image, the host, CMS plugins or running profiles.

## OAuth

Hosted Claude uses CIMD from HTTPS `claude.ai`, with the fixed callback `https://claude.ai/api/mcp/auth_callback`. Metadata is limited by host/size/time; a self-declared name is never shown on the consent page. Codes, grants, refresh and revoke are all bound to the client. Not yet tested against real Claude after deploy.

Pre-registered public client: `tracy-chatgpt`, client authentication `none`, PKCE `S256` required.
The only callback is `https://chatgpt.com/connector_platform_oauth_redirect`, observed on a real OpenAI Portal authorize round and pinned in `clients.js`; the metadata declares the issuer, and the callback
returns `iss` set to the issuer per RFC 9207. No DCR and no arbitrary redirects. The OAuth resource is
`https://cowork.tracy.ai/mcp` itself in production, with the single scope `content`; no code, site management or lifecycle scopes are granted.

Authorization code: 5 minutes, single use. Access token: 1 hour. Grant: 30 days. Refresh rotates both
the access secret and the refresh secret in one transaction but **keeps the key id**, so lease identity and undo
history stay the same. Only hashes of secrets are stored. Reusing a consumed refresh token, or a consumed code
with the correct verifier, revokes the whole grant. A key revoked from Settings cannot be
revived by a refresh; losing the seat also blocks refresh. `/oauth/revoke` requires proof of holding the token;
it cannot be used to revoke by guessing a public key id.

The OAuth tables currently keep hashes and metadata after expiry/revocation to detect reuse and for auditing; there is no
periodic deletion policy yet. The published privacy policy must reflect this, or a retention period must be set
and cleanup added before release.

MCP accepts sessionless Streamable HTTP, one JSON-RPC per POST, at most 256 KiB. It supports the new discovery
and the initialize of the versions listed in `route.js`; GET/DELETE return 405. Tools forward only the checked credential
and the REST headers that are published. Cookies, actor, turn and model-chosen URLs are never forwarded.
API errors keep status, receipt, ETag and Retry-After in the tool result; writes are never retried automatically.

## Testing

Three suites: `test/mcp.test.mjs`, `test/mcp-oauth.test.mjs`, `test/mcp-package.test.mjs`. The OAuth suite
needs `TEST_DATABASE_URL` pointing at a **throwaway** Postgres; the helper creates its own database/schema and cleans up.
It also covers the composition root → consent → token → MCP → REST → Apply door flow with a fake adapter,
including writes and receipt history. This is not yet a test against a real CMS site or against ChatGPT.

The consent page has a story, `TracyMcpConsent.stories.tsx`, importing the real renderer, with states for a site,
no site, and Vietnamese. Its strings are translated into all eight interface languages.

## Packaging after deploy

The portable plugin source is in `../../chatgpt-plugin/`. The script `../../scripts/package-chatgpt-plugin.mjs`
takes three arguments: the HTTPS MCP origin, the HTTPS Tracy origin and the target ZIP path. It checks the real
metadata and the MCP's OAuth challenge, then builds `mcp.json` from the checked origins, along with the manifest, instructions
and a 512×512 PNG icon taken from the existing brand. No credentials are packaged.

There is no ZIP to release until the real endpoint is deployed and has passed checks. After that, connect
OAuth from ChatGPT and try read/edit/undo on a designated test site. Do not use a customer's site
or widen the allowed list on your own.

Creating a private plugin, uploading a draft, submitting for review and publishing are separate steps. A public listing
also needs a verified publisher, country/payment scope, four real listing URLs, a review account
through the secure field and a real demo video. Never call the source or a ZIP tested against fakes a version that
OpenAI has connected, approved or published.

## OpenAI domain verification

`MCP_OPENAI_CHALLENGE` is the public token the Portal issues. When set, GET
`/.well-known/openai-apps-challenge` returns it as plain text on the MCP host itself, without caching or cookies.
When not configured it returns 404; never generate a fake token or publish it on another hostname.
