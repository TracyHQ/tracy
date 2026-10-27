/** Tracy connectors' MCP transport, the OAuth consent that binds it to one Tracy site, and the device flow for account-level apps. */
export const MCP_ROUTES = [
  {
    method: 'GET',
    path: '/.well-known/openai-apps-challenge',
    summary: 'Read the configured OpenAI domain ownership proof',
    description:
      'MCP origin only. Returns the public MCP_OPENAI_CHALLENGE token as plain text with no cookie or database dependency. Returns 404 when no token is configured. This proves publisher domain control; it grants no website access.',
    audience: ['public'],
    auth: 'none',
    internal: false
  },
  {
    method: 'GET',
    path: '/.well-known/oauth-protected-resource/mcp',
    summary: 'Discover the Tracy MCP resource by its path',
    description:
      'MCP origin only. Path-suffixed alias of the protected resource metadata, named in the MCP authentication challenge. The resource is the full MCP endpoint URL; its authorization server is TRACY_ORIGIN.',
    audience: ['public'],
    auth: 'none',
    internal: false
  },
  {
    method: 'POST',
    path: '/mcp',
    summary: 'Call Tracy tools over MCP',
    description:
      'MCP origin only (TRACY_ORIGIN by default), stateless Streamable HTTP JSON-RPC. Supports discovery, initialization, ping, tools/list and tools/call. Requires a Tracy OAuth access token issued for this API resource through connector consent; a cookie or an ordinary API key grants nothing here. Tools and schemas are generated from the public /v1 routes. Every tool call uses that same REST router and Apply door, preserving current seat rights, key scopes, revision preconditions, audit, leases and undo receipts. Requests are limited to 256 KiB. GET and DELETE return 405; no persistent SSE connection is needed.',
    audience: ['agent'],
    auth: 'oauth',
    internal: false
  },
  {
    method: 'GET',
    path: '/.well-known/oauth-protected-resource',
    summary: 'Discover the Tracy MCP protected resource',
    description:
      'MCP origin only (TRACY_ORIGIN by default). Names the full MCP URL, including /mcp, as the protected resource, TRACY_ORIGIN as its authorization server and content as its supported scope. The path-suffixed metadata alias is named in the MCP 401 WWW-Authenticate challenge. Returns 503 when the API origin or key pepper is not configured.',
    audience: ['public'],
    auth: 'none',
    internal: false
  },
  {
    method: 'GET',
    path: '/.well-known/oauth-authorization-server',
    summary: 'Discover Tracy OAuth endpoints',
    description:
      'Tracy sign-in host only. Advertises authorization-code, refresh-token and device-code grants, the device authorization endpoint, S256 PKCE, public-client authentication (none) and issuer identification. The pre-registered public client is tracy-chatgpt, with the exact stable ChatGPT redirect URI; Claude hosted uses HTTPS claude.ai client metadata (CIMD) with its exact callback. The pre-registered device client is website-opportunities, scope demos. Dynamic registration and arbitrary redirects are not supported.',
    audience: ['public'],
    auth: 'none',
    internal: false
  },
  {
    method: 'GET',
    path: '/oauth/authorize',
    summary: 'Sign in and choose the site to connect to a connector',
    description:
      'Tracy sign-in host only. Validates the registered or CIMD client id, exact client callback, full MCP resource, content scope, state and S256 challenge before redirecting a signed-out person to /login. A signed-in person sees only accepted editor or owner seats and explicit consent to read, edit and undo content on ONE chosen site. The consent form is signed, account-bound and expires in ten minutes. Nothing is granted on GET.',
    audience: ['customer'],
    auth: 'session',
    internal: false
  },
  {
    method: 'POST',
    path: '/oauth/authorize',
    summary: 'Grant or deny connector access to one site',
    description:
      'Tracy sign-in host only, application/x-www-form-urlencoded. Requires the signed-in account, the exact Tracy Origin and the signed, unexpired consent form. Rechecks the selected seat. Issues a single-use five-minute authorization code and redirects to the exact client callback with state and iss; cancellation returns access_denied. Limited to 20 approvals per account per hour.',
    audience: ['customer'],
    auth: 'session',
    internal: false
  },
  {
    method: 'POST',
    path: '/oauth/token',
    summary: 'Exchange a PKCE code or device code, or rotate a refresh token',
    description:
      'MCP origin only (TRACY_ORIGIN by default), application/x-www-form-urlencoded. A device client (website-opportunities) sends grant_type urn:ietf:params:oauth:grant-type:device_code with its device_code and client_id: 400 authorization_pending until the person decides on /connect, slow_down when polled before the interval (each one adds five seconds), access_denied after Deny, expired_token after ten minutes, invalid_grant for a code already exchanged (which also revokes the grant it produced). Approval answers an account token tra_<id>.<secret> (one hour) and a refresh token (30 days from its last use, rotating; a spent one presented again revokes the grant). Account tokens open account doors only, never a site. The bound public client supplies the full MCP URL as resource and either an authorization code with S256 verifier and exact redirect_uri, or a refresh token. Codes expire after five minutes; access tokens after one hour; consent after 30 days. Each refresh rotates both secrets under the SAME site-bound key id, preserving audit history. Reusing a spent code with its verifier, or a spent refresh token, revokes the connection. Revoking its key in Settings or losing its seat prevents refresh. Token and code secrets are never stored, only hashes. Cookies are stripped on MCP resource and token paths.',
    audience: ['agent'],
    auth: 'oauth',
    internal: false
  },
  {
    method: 'POST',
    path: '/oauth/device/code',
    summary: 'Start connecting an app to a Tracy account (device flow)',
    description:
      'MCP origin only (TRACY_ORIGIN by default), application/x-www-form-urlencoded with client_id website-opportunities and scope demos (RFC 8628). Answers device_code, user_code (eight consonants shown as XXXX-XXXX), verification_uri (TRACY_ORIGIN/connect), verification_uri_complete, expires_in 600 and interval 5. The app shows the code and link, then polls /oauth/token. 401 invalid_client for any other client, 400 invalid_scope for another scope, 429 slow_down past 30 codes per address an hour. Only hashes of both codes are stored.',
    audience: ['agent'],
    auth: 'none',
    internal: false
  },
  {
    method: 'GET',
    path: '/connect',
    summary: 'Show the device-flow consent page',
    description:
      'Tracy sign-in host only. A signed-out visitor goes to /login and comes back. Shows the signed-in account, the app, one line on what it may do, and the code to compare with the one the app shows; ?code= only fills the field, it never approves. The form is signed for this account and expires in ten minutes.',
    audience: ['customer'],
    auth: 'session',
    internal: false
  },
  {
    method: 'POST',
    path: '/connect',
    summary: 'Allow or deny an app waiting on a device code',
    description:
      'Tracy sign-in host only, application/x-www-form-urlencoded with the signed form, user_code and decision (allow or deny). Requires the exact Tracy Origin. A wrong, expired or already decided code answers the page again with an error (400); more than ten tries per account and address an hour answer 429. Allow lets the app’s next poll receive an account token for the signed-in account.',
    audience: ['customer'],
    auth: 'session',
    internal: false
  },
  {
    method: 'POST',
    path: '/oauth/revoke',
    summary: 'Disconnect a connector consent grant',
    description:
      'MCP origin only (TRACY_ORIGIN by default), application/x-www-form-urlencoded with the bound client_id and token. Proof of possession of a refresh token or a valid access token (a site-bound key, or an account token for a device client) revokes its whole grant. Unknown or invalid tokens answer 200 without changing another connection. No cookie is read.',
    audience: ['agent'],
    auth: 'oauth',
    internal: false
  }
]
