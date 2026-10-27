/** Route docs — see ./index.js for the entry shape. Filled from the source file named on each entry. */
import { TEAM_INVITE_TTL_DAYS } from '../../lib/policy.js'

/** @type {import('./index.js').RouteDoc[]} */
export const PEOPLE_ROUTES = [
  {
    method: 'POST',
    path: '/api/seat-plan/models',
    summary: 'List models from your connected AI accounts',
    description:
      'Signed-in account and same-origin JSON request required. Body `{ site, sessionId }`; verifies site membership and conversation access. Returns one group per connected account, with model names and capabilities. Disconnected and operator-disabled account providers are excluded. Credentials are never returned.',
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: false
  },
  {
    method: 'POST',
    path: '/api/seat-plan/model',
    summary: 'Save the account route selected for a conversation',
    description:
      'Signed-in account and same-origin JSON request required. Body `{ site, sessionId, provider, model }`; a connected-account route must belong to this account and advertise the selected model. Ownership is checked before changing the pin. A deployment provider must still be enabled and usable; selecting it clears the personal account pin. Does not replace the dsh selection operation. Credentials are never returned.',
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: false
  },
  {
    method: 'POST',
    path: '/internal/seat-plan/model-identity',
    summary: 'Read the current Tracy model display labels for a prompt',
    description:
      'Requires a signed actor assertion for a verified account. Body `{ provider, model }` uses canonical deployment routing identifiers. Returns `{ identity }` containing only provider/model display labels, or null for a nondeployment route. Uses current operator aliases and cached model names; never returns credentials. Response is not cached.',
    audience: ['dsh'],
    auth: 'actor',
    internal: true
  },
  {
    method: 'GET',
    path: '/api/seat-plan/status',
    summary: 'Read your AI accounts and their order',
    description:
      'Uses the signed-in Tracy account. Credentials are never returned. Each provider names how it signs in (`signIn`: `browser`, `device` or `key`) and how it signs in from the web (`webSignIn`, same values: ChatGPT Codex signs in by a device code there). `routing.connectionOrder` is the configured order: every connection id and the literal `tracy` (Tracy AI, included with the account) exactly once; the first entry is the Default, the rest are fallbacks in turn, and Tracy AI ends the walk. `next` is the effective route of a new chat (`null` = Tracy AI: first in the order, or every subscription before it at its limit); its `inputModalities` says whether the model of that route reads pictures (`["text", "image"]`) or text only (`["text"]`). Changes apply on web and desktop; site membership is checked separately for conversation reads.',
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: false
  },
  {
    method: 'PUT',
    path: '/api/seat-plan/routing',
    summary: 'Set the order of your AI accounts, Tracy AI among them',
    description:
      'Uses the signed-in Tracy account. Body `{ enabled, connectionOrder, expectedVersion }`: `connectionOrder` must name every connection of the account (a disconnected one keeps its place) and the literal `tracy` exactly once, nothing else — else 400 `invalid`; a stale `expectedVersion` is 409 `conflict`. A `tracyFallback` field is ignored. Answers the status. Credentials are never returned. Changes apply on web and desktop; site membership is checked separately for conversation reads.',
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: false
  },
  {
    method: 'POST',
    path: '/api/seat-plan/connect/start',
    summary: 'Start an account-bound subscription sign-in',
    description:
      "Uses the signed-in Tracy account. Body `{ provider, surface }`: `surface` is where the person signs in from, `desktop` for the desktop app (which catches the provider's localhost callback itself) or `web`; it is optional and any other value is `web`. The answer names the sign-in it started (`signIn`): `browser` with `authorizeUrl`, the provider's page whose callback address is pasted back to `connect/complete`, or `device` with `userCode` and `authorizeUrl`, the code to type on the provider's page, then `connect/complete` is polled. ChatGPT Codex signs in by a device code on the web and through the browser on the desktop app; GitHub Copilot by a device code on both. Credentials are never returned. Changes apply on web and desktop; site membership is checked separately for conversation reads.",
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: false
  },
  {
    method: 'POST',
    path: '/api/seat-plan/connect/complete',
    summary: 'Complete a subscription sign-in once, or poll a device-code sign-in until it is confirmed',
    description:
      'Uses the signed-in Tracy account. Credentials are never returned. Changes apply on web and desktop; site membership is checked separately for conversation reads.',
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: false
  },
  {
    method: 'POST',
    path: '/api/seat-plan/connect/key',
    summary: 'Connect a subscription with a pasted API key',
    description:
      'Uses the signed-in Tracy account. Body `{ provider, key }` for a provider whose `signIn` in the status is `key` (Kimi, GLM, Qwen). The provider checks the key before it is kept; the same key pasted again replaces the kept one. Answers 200 with the status. Refusals, as `{ code, message }`: 400 `invalid` (malformed body, unknown provider, a provider that does not sign in by key, or a key that is not 1-512 printable characters); 401 `key` (the provider refused the key); 403 `plan` (the provider knows the key but refuses access: no plan, balance or permission); 403 `disabled` (AI accounts are off, or this provider is not offered); 409 `conflict` (the connection was disconnected while the key was being checked; paste it again); 401 `notSignedIn` (the session has no Tracy account); 502 `vendor` (the provider could not be reached); 503 `disabled` (the server cannot store keys); 503 `unavailable` (anything unexpected). Before the door runs: 401 `NOT_SIGNED_IN` without a session, 403 `CSRF_ORIGIN` from another origin, 415 `UNSUPPORTED_MEDIA_TYPE` when a body is not JSON. The key is never returned or logged.',
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: false
  },
  {
    method: 'POST',
    path: '/api/seat-plan/disconnect',
    summary: 'Disconnect your subscription without losing its order',
    description:
      'Uses the signed-in Tracy account. Credentials are never returned. Changes apply on web and desktop; site membership is checked separately for conversation reads.',
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: false
  },
  {
    method: 'GET',
    path: '/api/seat-plan/session',
    summary: 'Read the actual subscription route of your conversation',
    description:
      'Uses the signed-in Tracy account. Credentials are never returned. A route on a subscription carries `inputModalities` (`["text", "image"]` or `["text"]`), whether its model reads pictures. Changes apply on web and desktop; site membership is checked separately for conversation reads.',
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: false
  },
  {
    method: 'POST',
    path: '/internal/seat-plan/pin',
    summary: 'Resolve an account subscription',
    description:
      'Signed actor assertion and workspace label required. The server verifies the account, site grant and conversation owner. A route on a subscription carries `inputModalities` (`["text", "image"]` or `["text"]`), whether its model reads pictures. Credentials and upstream response bodies are never returned.',
    audience: ['dsh'],
    auth: 'actor',
    internal: true
  },
  {
    method: 'POST',
    path: '/internal/seat-plan/run',
    summary: 'Stream through an account subscription',
    description:
      'Signed actor assertion and workspace label required. The server verifies the account, site grant and conversation owner. Run streams private NDJSON route metadata and model chunks. Credentials and upstream response bodies are never returned. The body is at most 16 MiB of UTF-8 (413 `invalid`); pictures go inline only, at most 20 per request (each occurrence, user and tool messages alike) and 12 MiB of base64 in total (413 `invalid` with `reason: "images"`); an outside picture URL is 400 `invalid` with `reason: "images"`. Whether pictures reach the model is decided per attempt from the route actually used: a text-only model gets a placeholder in place of each picture.',
    audience: ['dsh'],
    auth: 'actor',
    internal: true
  },
  {
    method: 'POST',
    path: '/internal/beta/confirmation',
    summary: 'Deliver a stored WordPress whitelist confirmation',
    description:
      'Private shared-secret Bearer door. Accepts email and validated whitelist fields, freezes the first payload per email, keeps the form answers in `beta_waitlist` for `/ops` › Beta › Waitlist (an identical retry changes nothing), shares the existing Resend transport and limits attempts per UTC day. Returns sent with provider id, queued for retry, or review after an ambiguous delivery window. Does not grant access.',
    audience: ['site'],
    auth: 'token',
    internal: true
  },
  {
    method: 'GET',
    path: '/api/beta/waitlist',
    summary: 'Read the email bound to an early access link',
    description:
      'Requires the purpose-bound Bearer token from a Tracy early access email. Does not use session cookies. Allows the configured landing origin.',
    audience: ['customer'],
    auth: 'token',
    internal: false
  },
  {
    method: 'POST',
    path: '/api/beta/waitlist',
    summary: 'Submit or update an early access request',
    description:
      'The signed Bearer token determines the email. Validates name, optional website, platforms, role and site count. Resubmitting updates the same request. Does not grant a Tracy seat or session.',
    audience: ['customer'],
    auth: 'token',
    internal: false
  },

  // src/identity/route.js
  {
    method: 'GET',
    path: '/login',
    summary: 'Show the sign-in page',
    description:
      'Renders the sign-in page: an email field for a six-digit code, plus Google/GitHub buttons when configured. A visitor who already holds a valid session is redirected straight to `next` (checked to stay on this origin) instead.',
    audience: ['customer', 'public'],
    auth: 'none',
    internal: false,
    params: {
      query: {
        next: 'Path to return to after signing in; only same-origin paths are honoured',
        email: 'Prefills the email field',
        onboard:
          "`1` draws the page inside the desktop app's four-step Setup frame (first run): step 1 open, steps 2–4 disabled, the email form a GET to `/signin/email`, Google only. Any other value draws the plain page",
        reason:
          'Why the desktop app came back to this page after its sign-in round ended without a session: `not-admitted` shows the whitelist message; `expired`, `denied` and `failed` show that the sign-in did not finish. Any other value is ignored and nothing from it is drawn'
      }
    },
    answers: 'The sign-in page (HTML), or a 302 to `next` when already signed in'
  },
  // src/identity/route.js
  {
    method: 'POST',
    path: '/login/visit',
    summary: 'Count a sign-in page visit from a link with a source',
    description:
      'Sent once per tab by the sign-in page’s own script when its link carried `utm_*`, so visits per source can be read beside first sign-ins; a mail scanner that fetches the link runs no script and is not counted. Keeps only the four cleaned source values, never an account, address or cookie. The page’s own origin only (403 `FORBIDDEN` otherwise); at most 30 a client address an hour (429 `RATE_LIMITED`). A body with no source is answered 204 and kept nowhere.',
    audience: ['public'],
    auth: 'none',
    internal: true,
    body: {
      type: 'object',
      properties: {
        utm_source: { type: 'string' },
        utm_medium: {
          type: 'string',
          description: '`email`, `blog`, `demo`, `site` or `forum`; anything else is kept as `other`'
        },
        utm_campaign: { type: 'string' },
        utm_content: { type: 'string' }
      }
    },
    answers: '204; 403 `FORBIDDEN` from another origin; 429 `RATE_LIMITED`'
  },
  // src/identity/route.js
  {
    method: 'POST',
    path: '/login',
    summary: 'Mail a sign-in code to an address',
    description:
      'Stores a hashed six-digit code for the address and emails it. Accepts JSON (answers `{ok:true}`, or 400 `INVALID_EMAIL`) or a plain HTML form post (answers the page at its code step). The code expires after a short window. Codes mailed per hour are capped per address and per client address; over either cap answers 429 `RATE_LIMITED` (JSON) or the sign-in page with a message (form post), and no code is written or mailed.',
    audience: ['customer', 'public'],
    auth: 'none',
    internal: false,
    body: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', format: 'email' },
        next: { type: 'string', description: 'Form posts only: where to go after verifying' }
      }
    },
    answers: '`{ok: true}` (JSON) or the sign-in page at its code step (form post); 429 over the hourly cap'
  },
  // src/identity/route.js
  {
    method: 'POST',
    path: '/verify',
    summary: 'Check a sign-in code and start a session',
    description:
      'Checks the six-digit code mailed by `POST /login`. On success sets the `tracy_sess` session cookie and answers `{ok, email}` (JSON) or a 303 to `next` (form post). A wrong, expired or over-tried code answers 401 `CODE_INVALID`; attempts per code are capped.',
    audience: ['customer', 'public'],
    auth: 'otp',
    internal: false,
    body: {
      type: 'object',
      required: ['email', 'code'],
      properties: {
        email: { type: 'string', format: 'email' },
        code: { type: 'string', pattern: '^[0-9]{6}$' },
        next: { type: 'string', description: 'Form posts only: where to go after signing in' }
      }
    },
    answers: '`{ok: true, email}` and a `tracy_sess` cookie'
  },
  // src/identity/route.js
  {
    method: 'GET',
    path: '/auth/me',
    summary: 'Tell who is signed in',
    description:
      'Reads the `tracy_sess` cookie and answers the signed-in address (or null) and the site to open by default. Also renews a session older than an hour by setting a fresh cookie, so a session only lapses after days without a page opened.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    answers:
      '`{email, defaultSite, face, name}`; all null when nobody is signed in. `face` is `{initial, color, avatarUrl}` — the signed-in person’s letter, colour (keyed by account) and picture (Tracy’s own `GET /auth/avatar/{accountId}` address, null when none), the same face `GET /api/team` and the comment doors give that account. `name` is the account’s display name, or null when it has none'
  },
  // src/identity/route.js
  {
    method: 'GET',
    path: '/auth/avatar/:accountId',
    summary: 'Read a person’s picture',
    description:
      'The picture behind a face’s `avatarUrl`: the profile picture the account’s last Google or GitHub sign-in handed over, fetched by Tracy from the provider (only its picture hosts, at most 1 MB, raster images only) and kept for a day, so the page never asks the provider itself. Any signed-in person may read it. `v` in the query is only a cache key that changes with the picture. Answers 304 to a matching `If-None-Match`. 401 `NOT_SIGNED_IN`; 404 `AVATAR_NOT_FOUND` when the account has no picture (it only ever signed in with an email code); 502 `AVATAR_UNAVAILABLE` when the provider did not answer with a usable image — draw the letter instead.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    answers:
      'The image bytes (`image/png`, `image/jpeg`, `image/gif`, `image/webp` or `image/avif`) with an `ETag` and `Cache-Control: private, max-age=86400`'
  },
  // src/identity/route.js
  {
    method: 'POST',
    path: '/auth/signout',
    summary: 'Sign out',
    description:
      'Ends the session on the server, so a copy of the session cookie no longer signs in and cannot be renewed, then clears the session cookie and every other Tracy cookie the browser holds for this person (the current-site pointer and site access cookies). Answers `{ok:true}` to a fetch, or a 303 to the form field `next` (default `/login`) for a form post.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    answers: '`{ok: true}` with cookie-clearing headers'
  },
  // src/identity/route.js
  {
    method: 'GET',
    path: '/signin',
    summary: "Ask whether to approve the host's dsh sign-in from this browser",
    description:
      'The page the host\'s dsh sign-in sends a browser to. With a session, shows which address would be signed in and what the requesting device said about itself, with one button that posts to `POST /signin/approve`; opening this page approves nothing. A round opened by the desktop app (`purpose: "desktop"`) gets its own page: it names Tracy Cowork for Mac, shows the round\'s match code (the same `matchCode` the app received) and adds a Deny button that posts to `POST /signin/deny`. Without a session, redirects to sign in first (the named provider, or the code form) and back. A desktop round that carries the address typed in the app (`email` on `POST /auth/link/browser`) and names no provider instead shows, without a session, that address, the match code and a button that posts to `POST /signin/code`; with a session for a different address, a page naming both addresses that offers to verify the typed one (the session is kept until it is verified) or, with `use=session`, the approve page for the signed-in one. 400 when the round expired or was already answered. Sent with `Referrer-Policy: same-origin`, so its forms carry the real `Origin` that the approve and deny doors require.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: {
      query: {
        n: 'The 64-hex-character round id issued by `POST /auth/link/browser`',
        provider: 'Optional `google` or `github`: which provider to sign in with first',
        use: '`session`: approve as the address this browser is signed in as, even when the app asked for another'
      }
    },
    answers: 'A confirmation page (HTML) that cannot be framed'
  },
  // src/identity/route.js
  {
    method: 'POST',
    path: '/signin/approve',
    summary: "Approve the host's dsh sign-in round",
    description:
      "The button on `GET /signin`: a plain HTML form post (`application/x-www-form-urlencoded`) with one field, `n`, the 64-hex-character round id. Marks the pending round `n` approved for the signed-in address. An optional field `email`, the address the page named, must still be the signed-in address, and a desktop round whose typed address is not the signed-in one needs it: otherwise 409. Refused with 403 unless the `Origin` header is exactly this app's own origin, 401 without a live session, and 400 for a malformed, unknown, expired or already-approved round. A round is approved at most once.",
    audience: ['customer'],
    auth: 'session',
    internal: false,
    answers: 'A page (HTML) saying the sign-in was approved, or why it was not'
  },
  // src/identity/route.js
  {
    method: 'POST',
    path: '/signin/deny',
    summary: 'Deny a sign-in round',
    description:
      "The Deny button on a desktop round's `GET /signin` page: a plain HTML form post (`application/x-www-form-urlencoded`) with one field, `n`, the 64-hex-character round id. Marks the pending round `n` denied, so the app polling it reads `denied` and stops. The same checks as `POST /signin/approve`: 403 unless the `Origin` header is exactly this app's own origin, 401 without a live session, 400 for a malformed, unknown, expired or already-answered round. A round already approved cannot be denied.",
    audience: ['customer'],
    auth: 'session',
    internal: false,
    answers: 'A page (HTML) saying the sign-in was denied, or why the round could not be answered'
  },
  // src/identity/route.js
  {
    method: 'GET',
    path: '/signin/email',
    summary: "The desktop app's first-run email form",
    description:
      'Where the email form of `/login?onboard=1` points. The desktop app catches this navigation and opens a desktop round carrying the address instead, so in the app it is never reached. A browser lands on `/login` with the address (lowercased, when well-formed) and a same-origin `next` carried over. Sends nothing.',
    audience: ['desktop', 'public'],
    auth: 'none',
    internal: false,
    params: { query: { email: 'The address typed', next: 'Same-origin path to return to after signing in' } },
    answers: 'A 302 to `/login`'
  },
  // src/identity/route.js
  {
    method: 'POST',
    path: '/signin/code',
    summary: "Mail a code for a desktop round's typed address",
    description:
      "The button on a desktop round's `GET /signin` page when the round carries the address typed in the app: a form post with `n` (the round id) and `t` (the page's token, bound to the round and to a host-only `tracy_signin_browser` cookie). Mails a six-digit code to the round's address, never to an address in the form, bound to this round only; a new code ends the previous one. Counts in the same per-address and per-client budget as `POST /login` (429), keeps the beta gate (an address it does not admit gets its letter and the same page) and answers the code step. 403 unless `Origin` is exactly this app's origin or when the token does not fit, 400 for a round that is not a pending desktop round with an address, 503 when no mail provider is configured.",
    audience: ['desktop'],
    auth: 'none',
    internal: false,
    answers: 'The code step (HTML)'
  },
  // src/identity/route.js
  {
    method: 'POST',
    path: '/signin/verify',
    summary: 'Verify the code and approve the desktop round in one press',
    description:
      '"Verify and sign in to the app": a form post with `n`, `t` and `code`. Counts the try before comparing (five per code), accepts only the round\'s live code, admits the address again as `POST /verify` does, then consumes the code and approves the round in one transaction (of two parallel presses one wins) and signs this browser in as the round\'s address. 401 with the code step for a wrong, used, replaced or expired code or an address not admitted; 403 and 400 as for `POST /signin/code`.',
    audience: ['desktop'],
    auth: 'none',
    internal: false,
    answers: 'A page (HTML) saying the app is signing in, with a session cookie'
  },
  // src/identity/route.js
  {
    method: 'GET',
    path: '/signin/joomlart',
    summary: 'Start a sign-in with a JoomlArt account',
    description:
      "Login with JoomlArt: a signed redirect to aMember and back, HMAC-SHA256 over a base64 payload with a secret the two sides share; not an OAuth code exchange. Records a one-time 32-byte nonce as the state, sets it as the short-lived `tracy_oauth_state` cookie, and redirects to aMember's authorize door with `client` (`JOOMLART_SSO_CLIENT`: `tracy` on production, `tracy-dev` elsewhere), the signed `sso` payload (`nonce`, `return_url` = this origin plus `/signin/joomlart/callback`, `exp` five minutes ahead) and its `sig`. 404 on a deployment where the door is not configured. When `next` is a template landing (`/new?template=…`), the referring page — an absolute http(s) `ref` (at most 512 characters), else the `Referer` header, never a page of this host, reduced to scheme, host and path — is added to `next` as `ref`, so the landing's quickstart download can record it.",
    audience: ['customer', 'public'],
    auth: 'none',
    internal: false,
    params: {
      query: {
        next: 'Same-origin path to return to after signing in',
        ref: 'Optional absolute http(s) URL of the page the sign-in started from'
      }
    },
    answers: 'A 302 to aMember'
  },
  // src/identity/route.js
  {
    method: 'GET',
    path: '/signin/joomlart/callback',
    summary: 'Finish a sign-in with a JoomlArt account',
    description:
      "Where aMember sends the browser back, with the signed `sso` payload (`nonce`, `external_id`, `email`, `email_verified`, `username`, `name`, `entitlement`) and its `sig`. The signature is checked over `sso` exactly as received, the state record is consumed once, and the `nonce` inside the signed payload must be the one in the `tracy_oauth_state` cookie; then the account is linked by identity (`joomlart`, `external_id`), the entitlement is kept on it, a `tracy_sess` cookie is set and the browser is redirected to the `next` recorded at the start. A paid, unexpired entitlement admits the person; otherwise the beta gate decides as for every other sign-in (303 to the waitlist page when not admitted). Failures answer 400 `OAUTH_STATE_INVALID` (no cookie, unknown, expired or already-used nonce, or a nonce that is not the cookie's), 400 `SSO_INVALID` (bad signature or payload, missing `external_id` or email) or 400 `EMAIL_NOT_VERIFIED` (aMember has not confirmed the address); a browser navigation gets the same status as a page with a link back to `/login`. Answered with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.",
    audience: ['customer'],
    auth: 'none',
    internal: false,
    params: {
      query: { sso: 'The signed base64 payload from aMember', sig: 'Its lowercase hex HMAC-SHA256' }
    },
    answers: 'A 302 to the original `next` with a session cookie'
  },
  // src/identity/route.js
  {
    method: 'GET',
    path: '/signin/:provider',
    summary: 'Start a Google or GitHub sign-in',
    description:
      'Records a one-time OAuth state, sets it as a short-lived cookie, and redirects to the provider. A provider that is unknown or not configured on this deployment answers 404.',
    audience: ['customer', 'public'],
    auth: 'none',
    internal: false,
    params: {
      path: { provider: '`google` or `github`' },
      query: { next: 'Same-origin path to return to after signing in' }
    },
    answers: 'A 302 to the provider'
  },
  // src/identity/route.js
  {
    method: 'GET',
    path: '/signin/:provider/callback',
    summary: 'Finish a Google or GitHub sign-in',
    description:
      'Where the provider sends the browser back. The `state` query must match both a live one-time record and the state cookie set at the start; then the `code` is exchanged, the account is linked by provider identity, a `tracy_sess` cookie is set and the browser is redirected to `next`. Failures answer 400 `OAUTH_STATE_INVALID` or a provider error code (502 `EXCHANGE_FAILED` when the provider cannot be reached); a browser navigation gets the same status as a page with a link back to `/login`. Answered with `Referrer-Policy: no-referrer`, so the page it sends the browser to never learns the provider as its referrer.',
    audience: ['customer'],
    auth: 'oauth',
    internal: false,
    params: {
      path: { provider: '`google` or `github`' },
      query: { state: 'The state issued at the start', code: 'The authorization code from the provider' }
    },
    answers: 'A 302 to the original `next` with a session cookie'
  },
  // src/lanes/route.js
  {
    method: 'POST',
    path: '/auth/link/browser',
    summary: 'Open a browser sign-in round',
    description:
      "Called by the host's dsh sign-in to open a round it cannot run itself. Answers a random `nonce` and `clientSecret` (stored hashed, bound to no address) valid for 15 minutes. The person approves the round at `/signin?n=<nonce>`. An optional `device` string (at most 120 characters) describes the requesting device on that page, shown as the device's own description; anything else answers 400 `INVALID_REQUEST`. An optional `purpose`: `lane` (the default) or `desktop` (the Tracy Cowork for Mac app, which redeems the round at `POST /auth/link/:nonce/session` instead of `/exchange`); any other value answers 400 `INVALID_REQUEST`. A desktop round also answers `matchCode` (`ABCD-EFGH`), the code its approve page shows, and may carry `email`, the address typed in the app (at most 254 characters, lowercased; malformed, or on a lane round, answers 400 `INVALID_REQUEST`): its `/signin` page then offers a code for that address. Unsigned by design: no identity exists yet.",
    audience: ['dsh', 'desktop'],
    auth: 'none',
    internal: true,
    answers: '`{nonce, clientSecret, expiresAt}`, plus `matchCode` for a desktop round'
  },
  // src/lanes/route.js
  {
    method: 'GET',
    path: '/auth/link/:nonce',
    summary: 'Poll a browser sign-in round',
    description:
      "Polled by the host's dsh sign-in while the person approves the round in their browser. Never returns the address. An unknown, malformed, used or expired round all answer `expired`, so guessing round ids learns nothing. A desktop round the person denied answers `denied`; a denied lane round answers `expired`.",
    audience: ['dsh', 'desktop'],
    auth: 'none',
    internal: true,
    params: { path: { nonce: 'The 64-hex-character round id' } },
    answers: "`{status: 'pending' | 'approved' | 'denied' | 'expired'}`"
  },
  // src/lanes/route.js
  {
    method: 'POST',
    path: '/auth/link/:nonce/exchange',
    summary: 'Trade an approved round for the address',
    description:
      "Called once by the host's dsh sign-in after the round is approved. The client secret from the opening call is the credential. One shot: the round is deleted before comparison, so a replay or a wrong secret both end it with 400 `LINK_INVALID`. A desktop round is refused with the same 400 and left in place.",
    audience: ['dsh'],
    auth: 'token',
    internal: true,
    params: { path: { nonce: 'The 64-hex-character round id' } },
    body: {
      type: 'object',
      required: ['clientSecret'],
      properties: { clientSecret: { type: 'string', description: 'From `POST /auth/link/browser`' } }
    },
    answers: '`{email}` of the person who approved the round'
  },
  // src/identity/route.js
  {
    method: 'POST',
    path: '/auth/link/:nonce/session',
    summary: 'Trade an approved desktop round for a session',
    description:
      'Called once by the Tracy Cowork for Mac app after its desktop round (`purpose: "desktop"`) is approved. The `Origin` header must be exactly this app\'s own origin (absent is refused, 403 `ORIGIN_REFUSED`), the body JSON (415 otherwise), and calls are counted per client address (429 `RATE_LIMITED`). The round is consumed in one step only when the nonce, the client secret, the desktop purpose, the approved state and the window all match; anything else answers 404 `LINK_INVALID` and leaves the round as it was, so a wrong secret does not cancel the sign-in. The address is admitted again as the code sign-in admits it (403 `SIGN_IN_REFUSED`), then the same `tracy_sess` cookie a sign-in sets is set. The cookie value never appears in a body.',
    audience: ['desktop'],
    auth: 'token',
    internal: true,
    params: { path: { nonce: 'The 64-hex-character round id' } },
    body: {
      type: 'object',
      required: ['clientSecret'],
      properties: { clientSecret: { type: 'string', description: 'From `POST /auth/link/browser`' } }
    },
    answers: '204 with a `tracy_sess` cookie and `Cache-Control: no-store`'
  },
  // src/identity/route.js
  {
    method: 'POST',
    path: '/auth/link/:nonce/cancel',
    summary: 'Cancel a desktop round still waiting for approval',
    description:
      "Called by the Tracy Cowork app when the person cancels its sign-in or closes the window while the round is still pending, so the browser can no longer approve it. Same rules as `POST /auth/link/:nonce/session`: the `Origin` header must be exactly this app's own origin (403 `ORIGIN_REFUSED`), the body JSON (415 otherwise), the client secret well-formed (400 `INVALID_REQUEST`), and calls are counted per client address (429 `RATE_LIMITED`). A pending desktop round whose client secret matches becomes `denied`; a round already approved, denied or expired, a lane round and a wrong secret are left as they were. Every well-formed request answers the same 204, so a repeat changes nothing and a wrong secret learns nothing.",
    audience: ['desktop'],
    auth: 'token',
    internal: true,
    params: { path: { nonce: 'The 64-hex-character round id' } },
    body: {
      type: 'object',
      required: ['clientSecret'],
      properties: { clientSecret: { type: 'string', description: 'From `POST /auth/link/browser`' } }
    },
    answers: '204 with `Cache-Control: no-store`'
  },
  // src/lanes/route.js
  {
    method: 'POST',
    path: '/auth/otp/start',
    summary: "Mail a sign-in code for the host's dsh sign-in",
    description:
      "Same six-digit code and mail as `POST /login`, asked for by the host's dsh sign-in page. Requires the `x-tracy-actor` header (a 60-second assertion signed with the shared actor secret). Always answers `{ok:true}` for a valid address, never revealing whether it is known.",
    audience: ['dsh'],
    auth: 'actor',
    internal: true,
    body: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } },
    answers: '`{ok: true}`'
  },
  // src/lanes/route.js
  {
    method: 'POST',
    path: '/auth/otp/verify',
    summary: "Check a code for the host's dsh sign-in",
    description:
      "Checks a code sent by `POST /auth/otp/start`. Requires the signed `x-tracy-actor` header. Mints no session here: it only confirms the address, and the host's dsh starts its own session. Wrong, expired or over-tried codes answer 401 `BAD_CODE`.",
    audience: ['dsh'],
    auth: 'actor',
    internal: true,
    body: {
      type: 'object',
      required: ['email', 'code'],
      properties: { email: { type: 'string', format: 'email' }, code: { type: 'string' } }
    },
    answers: '`{ok: true, email}`'
  },
  // src/lanes/route.js
  {
    method: 'GET',
    path: '/sites/:key/seats',
    summary: "List a site's seats for the host's dsh sign-in",
    description:
      "Answers every seat row of the site (any status) in the same shape as `GET /api/team`, so the host's dsh can find the role of an address it just confirmed. Requires the signed `x-tracy-actor` header; 401 `UNAUTHENTICATED` without it.",
    audience: ['dsh'],
    auth: 'actor',
    internal: true,
    params: { path: { key: 'The site key, e.g. `example.com`' } },
    answers:
      '`{seats: [{id, email, displayName, initial, color, avatarUrl, role, status, ...}]}` — `initial`, `color` and `avatarUrl` are the person’s face, as `GET /api/team` gives it'
  },
  // src/lanes/route.js
  {
    method: 'GET',
    path: '/auth/actor-check',
    summary: 'Check that the shared actor secret matches',
    description:
      'A diagnostic: verifies the `x-tracy-actor` assertion and answers `{ok:true}`, or 401 `UNAUTHENTICATED` when the caller signs with a different secret. Reads and writes nothing and does not echo the address. Used by the host-side site tools to detect a mismatched secret.',
    audience: ['dsh'],
    auth: 'actor',
    internal: true,
    answers: '`{ok: true}`'
  },
  // src/seats/route.js
  {
    method: 'GET',
    path: '/api/sites',
    summary: 'List the sites I hold a seat on',
    description:
      'Every site the signed-in person holds a live seat on, with role, status (invited, requested, accepted), inviter, platform, when the site was created (`createdAt`), the address to open once accepted, and for an accepted seat whether the site is `draft` or `published` (`publish`) and, while a publish, a return to draft or a delete is under way, which (`publishing`: `live`, `draft` or `delete`). `editRequestedAt` is when the person, as a viewer, asked the owners for edit access and is still waiting, else null. `importPending: true` marks an accepted seat on an imported site whose import never reached a build: it has no workspace yet (`agent` is null) and is finished from the import recovery page, whose path is `importRecovery`. Also answers the address prefix new sites get on this deployment. 401 `NOT_SIGNED_IN` without a session.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    answers: '`{addressPrefix, sites: [{siteKey, displayName, role, status, createdAt, copyUrl, ...}]}`'
  },
  // src/seats/route.js
  {
    method: 'GET',
    path: '/api/team',
    summary: 'List my sites with their teams',
    description:
      "Every site the signed-in person holds a seat on, with their own role; for accepted seats, the site's full roster (every row, including invited, revoked and declined, each with its status). A viewer's row carries `editRequestedAt` while their request for edit access waits on the owners, else null.",
    audience: ['customer'],
    auth: 'session',
    internal: false,
    answers:
      '`{sites: [{siteKey, platform, myRole, status, seats}]}` — `seats` is null until the viewer’s own seat is accepted; each seat is `{id, email, displayName, initial, color, avatarUrl, role, status, ...}`, where `initial` (the first letter of the name, else the email, upper case), `color` (one of eight, keyed by the account; two people may share one) and `avatarUrl` (null when none) are the person’s face — the same one the comment doors and `GET /auth/me` give that account'
  },
  // src/seats/route.js
  {
    method: 'POST',
    path: '/api/team/invite',
    summary: 'Invite people to one or more sites',
    description:
      // The lifetime is the policy's number (#804), never typed here.
      `Grants a role (\`viewer\` or \`editor\`; owners are made from the Team list, never by invitation) to each address on each listed site and mails one invitation link per person; the link works for ${TEAM_INVITE_TTL_DAYS} days. An address whose seat on a site still waits for its answer in the same role gets that site in the new link with no change to the seat (\`outcome: "invited"\`, \`renewed: true\`); a waiting seat of another role, or an accepted one, answers \`already_granted\` and is not mailed. \`notified\` is the result of that one mail. \`inviteUrl\` is that mail's own accept link, given to the inviter only (in this answer, never stored) so they can share it another way when the mail lands in Spam; it is present whenever a link was minted, also when the mail failed, and works only for the invited address. The inviter needs an owner or editor seat on each site (a viewer invites nobody); refused sites are reported per site. Rate-limited per account.`,
    audience: ['customer'],
    auth: 'session',
    internal: false,
    body: {
      type: 'object',
      required: ['emails', 'role', 'siteKeys'],
      properties: {
        emails: { type: 'array', items: { type: 'string', format: 'email' }, minItems: 1 },
        role: { type: 'string', enum: ['viewer', 'editor'] },
        siteKeys: { type: 'array', items: { type: 'string' }, minItems: 1 }
      }
    },
    answers: '`{results: [{email, notified, inviteUrl?, sites: [{siteKey, outcome, code?, renewed?}]}]}`'
  },
  // src/seats/route.js
  {
    method: 'PATCH',
    path: '/api/sites/:key/seats/:grant',
    summary: "Change someone's role on a site",
    description:
      "Site owners change another seat's role (`viewer`, `editor` or `owner`); the last owner cannot be demoted. The new role is pushed to the site's hosts so open sessions pick it up at once. A change that lands is recorded (`team.role_change`); asking for the role the seat already holds changes and records nothing. Errors: 403 `SEAT_NOT_AUTHORIZED`, `NOT_SITE_OWNER`, `CANNOT_REVOKE_LAST_OWNER`; 404 `GRANT_UNKNOWN`; 409 `SEAT_STATE_CHANGED` when somebody else changed the role between the read and the write.",
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'The site key', grant: "The target person's account id (UUID)" } },
    body: {
      type: 'object',
      required: ['role'],
      properties: { role: { type: 'string', enum: ['owner', 'editor', 'viewer'] } }
    },
    answers: '`{id, role, lanes?}`; `lanes` reports each host that was told'
  },
  // src/seats/route.js
  {
    method: 'DELETE',
    path: '/api/sites/:key/seats/:grant',
    summary: "Remove someone from a site's team",
    description:
      "Site owners take another person's row off the site's team (never yourself or the last owner). `kind` names which of three acts this is, and each is stored and recorded as itself: `revoke` ends a seat the person holds, `cancel_invite` withdraws an invitation they have not answered, `decline_request` turns down their request to join. A `kind` that is not the one the row calls for now, or a seat whose role changed between the read and the write, answers 409 `SEAT_STATE_CHANGED` with the kind that would apply, and changes nothing. A body, when sent, is exactly `{kind}`: an unknown `kind`, any other key, or a body that holds nothing but whitespace is 400 `INVALID_REQUEST` and removes nobody. With no body at all (no content declared, nothing to read) the call is answered as it was before `kind` existed: the act is read from the row, and is stored and recorded as that act; a caller that names `kind` is the one protected against a row that changed since it was read. The person's open sessions on every host are ended too; a host that cannot be reached is retried later and reported as `queued`. Errors: 403 `SEAT_NOT_AUTHORIZED`, `NOT_SITE_OWNER`, `CANNOT_REVOKE_SELF`, `CANNOT_REVOKE_LAST_OWNER`; 404 `GRANT_UNKNOWN` when the row is missing, already removed, or was declined by the invitee.",
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'The site key', grant: "The target person's account id (UUID)" } },
    // No body at all is still answered (callers from before `kind`); a body, when sent, names it.
    bodyOptional: true,
    body: {
      type: 'object',
      required: ['kind'],
      additionalProperties: false,
      properties: {
        kind: { type: 'string', enum: ['revoke', 'cancel_invite', 'decline_request'] }
      }
    },
    answers: '`{revoked: true, kind, lanes?}`; `kind` is the act that was stored'
  },
  // src/seats/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/edit-access-request',
    summary: 'Ask the owners for edit access',
    description:
      "A viewer asks every owner of the site to make them an editor (ADR 0028). Each owner gets an Inbox item and an email; the request waits on the viewer's own seat (`editRequestedAt` in `GET /api/sites` and `GET /api/team`) until an owner answers. Answers 201 `{requested: true, already: false, requestedAt}` the first time, and 200 with `already: true` while a request is waiting (nothing is sent again). Errors: 401 `NOT_SIGNED_IN`; 403 `SEAT_NOT_AUTHORIZED` (no live seat on the site); 409 `ALREADY_EDITOR` `{role}` (the seat is already an editor or an owner); 429 `RATE_LIMITED`.",
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'The site key' } },
    answers: '`{requested: true, already, requestedAt}`'
  },
  // src/seats/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/seats/:grant/edit-access',
    summary: "Answer a viewer's request for edit access",
    description:
      "Site owners approve or decline a viewer's waiting request for edit access. `approve` makes the viewer an editor and pushes the new role to the site's hosts, as a role change does; `decline` only clears the request, and the viewer may ask again. Either way the other owners' Inbox items close and the viewer is told. Errors: 400 `INVALID_REQUEST` (the body is not exactly `{decision}`); 403 `SEAT_NOT_AUTHORIZED`, `NOT_SITE_OWNER`; 404 `GRANT_UNKNOWN`; 409 `NO_EDIT_REQUEST` when nothing is waiting (another owner answered, or no request was made).",
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'The site key', grant: "The viewer's account id (UUID)" } },
    body: {
      type: 'object',
      required: ['decision'],
      additionalProperties: false,
      properties: { decision: { type: 'string', enum: ['approve', 'decline'] } }
    },
    answers:
      '`{id, role, decision, lanes?}`; `decision` is `approved` or `declined`, `lanes` reports each host that was told'
  },
  // src/seats/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/accept',
    summary: 'Accept a site invitation',
    description:
      'Accepts a pending invitation the signed-in person holds on the site. Idempotent: an already accepted seat answers `{accepted:true}`. 403 `SEAT_NOT_AUTHORIZED` when there is no live invitation, 409 `JOIN_REQUEST_PENDING` when the seat is only a request to join. Rate-limited per account.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'The site key' } },
    answers: '`{accepted: true}`'
  },
  // src/seats/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/decline',
    summary: 'Decline a site invitation',
    description:
      "Declines a pending invitation the signed-in person holds on the site, and tells the person who sent it (Inbox and email). Idempotent once declined. 403 `SEAT_NOT_AUTHORIZED` when there is no live invitation, 409 `ALREADY_GRANTED` when it was already accepted (leave instead), 409 `JOIN_REQUEST_PENDING` when the seat is only the person's own request to join. Rate-limited per account.",
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'The site key' } },
    answers: '`{declined: true}`'
  },
  // src/seats/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/leave',
    summary: 'Leave a site',
    description:
      "Gives up the signed-in person's own seat on the site and ends their open sessions on every host. The last owner cannot leave (403 `CANNOT_REVOKE_LAST_OWNER`). Rate-limited per account.",
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'The site key' } },
    answers: '`{left: true, lanes?}`'
  },
  // src/seats/route.js
  {
    method: 'POST',
    path: '/me/sites/:key/join-request',
    summary: 'Request to join a site',
    description:
      "Records a request to join a site the person was not invited to and mails the site's owners a review link. Answers 201 `{requested:true, already:false}`, or 200 with `already:true` if a request is open. 404 `SITE_UNCLAIMED`, 409 `ALREADY_GRANTED` or `ALREADY_INVITED`.",
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'The site key' } },
    answers: '`{requested: true, already}`'
  },
  // src/seats/route.js
  {
    method: 'GET',
    path: '/invite/:token/decline',
    summary: 'Show the decline page of a team invitation',
    description:
      'The "Not for you? Decline" link in an invitation email. Opening it declines nothing: it shows the invitations the token still has open and one button that posts to the same address. Once every one is declined, accepted or withdrawn, it says so. No sign-in needed: the signed token names the person and the sites. Rate-limited per token.',
    audience: ['customer'],
    auth: 'invite',
    internal: false,
    params: { path: { token: 'The signed invitation token from the email' } },
    answers: 'A page (HTML)'
  },
  // src/seats/route.js
  {
    method: 'POST',
    path: '/invite/:token/decline',
    summary: 'Decline a team invitation from its email link',
    description:
      'Sent by the button on the decline page. Declines every invitation the token names that is still open, and tells each person who sent one (Inbox and email). 404 `INVITE_INVALID` for a token that is not ours. Rate-limited per token.',
    audience: ['customer'],
    auth: 'invite',
    internal: false,
    params: { path: { token: 'The signed invitation token from the email' } },
    answers: '`{declined: [siteKey…]}` (the sites declined by this call)'
  },
  // src/seats/route.js
  {
    method: 'GET',
    path: '/invite/:token',
    summary: 'Accept a team invitation from its email link',
    description:
      'The link in an invitation email. The token is signed and names the invited address, role and sites. A signed-out visitor is sent to sign in first; a different signed-in address sees a wrong-account page (403). Opening it accepts every still-open invitation it names. Rate-limited per token.',
    audience: ['customer'],
    auth: 'invite',
    internal: false,
    params: { path: { token: 'The signed invitation token from the email' } },
    answers: 'A page (HTML) summarising which sites were accepted'
  },
  // src/seats/route.js
  {
    method: 'GET',
    path: '/:label/team',
    summary: "Show a site's team page",
    description:
      "A plain HTML page listing the site's roster, for a person holding a seat on it. `label` is the site's short name (letters, digits, hyphens). Signed-out visitors are redirected to sign in; 404 for an unknown site, 403 without a seat.",
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { label: "The site's short name, e.g. `mysite`" } },
    answers: 'The team page (HTML)'
  },
  // src/seats/route.js
  {
    method: 'POST',
    path: '/:label/team',
    summary: 'Old team page form (no longer invites)',
    description:
      'Kept for old forms that still post here. It changes nothing and answers a page saying invitations are now sent from the Team tab (use `POST /api/team/invite`). Signed-out visitors are redirected to sign in; 404 for an unknown site.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { label: "The site's short name" } },
    answers: 'A notice page (HTML)'
  },
  // src/workspaces/route.js
  {
    method: 'POST',
    path: '/workspaces',
    summary: 'Create a workspace',
    description:
      'Creates a workspace (an agency grouping several sites) and makes the signed-in person its accepted owner. Names are unique (409 `WORKSPACE_NAME_TAKEN`). Rate-limited per account.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    body: {
      type: 'object',
      required: ['displayName'],
      properties: {
        displayName: { type: 'string', maxLength: 120 },
        revenueModes: {
          type: 'array',
          items: { type: 'string', enum: ['goods', 'services', 'software', 'audience'] }
        },
        industry: { type: ['string', 'null'], maxLength: 120 }
      }
    },
    answers: '201 `{id, displayName}`'
  },
  // src/workspaces/route.js
  {
    method: 'PATCH',
    path: '/workspaces/:id',
    summary: "Edit a workspace's profile",
    description:
      "Updates a workspace's name, revenue modes or industry. Owners only (403 `SEAT_NOT_AUTHORIZED` / `NOT_SITE_OWNER`). At least one field is required; 409 `WORKSPACE_NAME_TAKEN` on a duplicate name.",
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { id: 'Workspace id (UUID)' } },
    body: {
      type: 'object',
      properties: {
        displayName: { type: 'string', maxLength: 120 },
        revenueModes: {
          type: 'array',
          items: { type: 'string', enum: ['goods', 'services', 'software', 'audience'] }
        },
        industry: { type: ['string', 'null'], maxLength: 120 }
      }
    },
    answers: '`{id, displayName}`'
  },
  // src/workspaces/route.js
  {
    method: 'GET',
    path: '/workspaces/:id/seats',
    summary: "List a workspace's members",
    description:
      'Answers every member row of the workspace (invited, active, declined, revoked) with role and dates. Any person holding a live seat on the workspace may read it; otherwise 403 `SEAT_NOT_AUTHORIZED`.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { id: 'Workspace id (UUID)' } },
    answers: '`{seats: [{id, email, role, status, grantedAt, acceptedAt, ...}]}`'
  },
  // src/workspaces/route.js
  {
    method: 'POST',
    path: '/workspaces/:id/seats',
    summary: 'Invite someone to a workspace',
    description:
      'Grants a role on the workspace (`viewer` or `editor`, default `editor`) and mails an invitation. The inviter needs an owner or editor seat on the workspace. If the person had asked to join, the request is approved instead. 409 `ALREADY_GRANTED` when they already hold a seat. Rate-limited per account.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { id: 'Workspace id (UUID)' } },
    body: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', format: 'email' },
        role: { type: 'string', enum: ['viewer', 'editor'], default: 'editor' }
      }
    },
    answers: '201 `{seat, notified}`, or 200 `{seat, notified, approved: true}` for an approved request'
  },
  // src/workspaces/route.js
  {
    method: 'PATCH',
    path: '/workspaces/:id/seats/:accountId',
    summary: "Change a workspace member's role",
    description:
      "Workspace owners change a member's role (`viewer`, `editor` or `owner`); the last accepted owner cannot be demoted. Errors: 403 `SEAT_NOT_AUTHORIZED`, `NOT_SITE_OWNER`, `CANNOT_REVOKE_LAST_OWNER`; 404 `GRANT_UNKNOWN`.",
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { id: 'Workspace id (UUID)', accountId: "The member's account id (UUID)" } },
    body: {
      type: 'object',
      required: ['role'],
      properties: { role: { type: 'string', enum: ['owner', 'editor', 'viewer'] } }
    },
    answers: '`{id, role}`'
  },
  // src/workspaces/route.js
  {
    method: 'DELETE',
    path: '/workspaces/:id/seats/:accountId',
    summary: 'Remove a workspace member',
    description:
      "Workspace owners revoke a member's seat (never yourself or the last accepted owner). Errors: 403 `SEAT_NOT_AUTHORIZED`, `NOT_SITE_OWNER`, `CANNOT_REVOKE_SELF`, `CANNOT_REVOKE_LAST_OWNER`; 404 `GRANT_UNKNOWN`.",
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { id: 'Workspace id (UUID)', accountId: "The member's account id (UUID)" } },
    answers: '`{revoked: true}`'
  },
  // src/workspaces/route.js
  {
    method: 'GET',
    path: '/me/workspaces',
    summary: 'List my workspaces',
    description:
      'Every workspace the signed-in person holds a live seat on, with its profile, their role, whether the seat is accepted or pending, and the sites declared into it.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    answers: '`{workspaces: [{id, displayName, kind, role, status, sites, ...}]}`'
  },
  // src/workspaces/route.js
  {
    method: 'POST',
    path: '/me/workspaces/:id/accept',
    summary: 'Accept a workspace invitation',
    description:
      "Accepts the signed-in person's pending invitation to the workspace; idempotent once accepted. 403 `SEAT_NOT_AUTHORIZED` with no live or a declined invitation, 409 `JOIN_REQUEST_PENDING` when the seat is only a request. Rate-limited per account.",
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { id: 'Workspace id (UUID)' } },
    answers: '`{accepted: true}`'
  },
  // src/workspaces/route.js
  {
    method: 'POST',
    path: '/me/workspaces/:id/decline',
    summary: 'Decline a workspace invitation',
    description:
      'Declines a pending invitation to the workspace; idempotent once declined. 409 `ALREADY_GRANTED` when it was already accepted (leave instead), `JOIN_REQUEST_PENDING` for a request. Rate-limited per account.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { id: 'Workspace id (UUID)' } },
    answers: '`{declined: true}`'
  },
  // src/workspaces/route.js
  {
    method: 'POST',
    path: '/me/workspaces/:id/leave',
    summary: 'Leave a workspace',
    description:
      "Gives up the signed-in person's own seat on the workspace. The last accepted owner cannot leave (403 `CANNOT_REVOKE_LAST_OWNER`); 403 `SEAT_NOT_AUTHORIZED` without a seat. Rate-limited per account.",
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { id: 'Workspace id (UUID)' } },
    answers: '`{left: true}`'
  },
  // src/workspaces/route.js
  {
    method: 'POST',
    path: '/me/workspaces/:id/join-request',
    summary: 'Request to join a workspace',
    description:
      'Records a request to join a workspace; its owners approve it by inviting the person. Answers 201 with `already:false`, or 200 with `already:true` when a seat or request already exists. 404 `WORKSPACE_UNKNOWN`, 409 `ALREADY_GRANTED`. Rate-limited per account.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { id: 'Workspace id (UUID)' } },
    answers: '`{requested: true, already, workspace: {id, displayName}}`'
  },
  // src/workspaces/route.js
  {
    method: 'GET',
    path: '/api/sites/:key/workspace',
    summary: 'Tell which workspace a site belongs to',
    description:
      'Answers the workspace the site is declared into, or `{workspace: null}`. Any signed-in person may ask.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'The site key' } },
    answers: '`{workspace: {id, displayName} | null}`'
  },
  // src/workspaces/route.js
  {
    method: 'PUT',
    path: '/api/sites/:key/workspace',
    summary: 'Declare which workspace a site belongs to',
    description:
      'A site owner places the site in a workspace they own: the caller needs a live owner seat on the site itself (else 403 `SEAT_NOT_AUTHORIZED` / `NOT_SITE_OWNER`) and an owner seat on that workspace. Moving a site out of another workspace needs an owner seat on that one too, else 409 `SITE_HAS_OWNER`. Never grants a seat on the site. Rate-limited per account.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'The site key' } },
    body: {
      type: 'object',
      required: ['workspaceId'],
      properties: { workspaceId: { type: 'string', format: 'uuid' } }
    },
    answers: '`{siteKey, workspaceId}`'
  },
  // src/workspaces/route.js
  {
    method: 'GET',
    path: '/tracy-admin/overview',
    summary: 'Overview of every workspace (staff)',
    description:
      'Tracy staff only: every workspace with its sites, seat counts by role, pending invitations and owners/admins, plus live sites not declared into any workspace. Needs an owner, admin or developer seat on the Tracy staff workspace (checked from the session); else 403 `SEAT_NOT_AUTHORIZED`.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: '`{viewerRole, workspaces: [...], undeclaredSites: [...]}`'
  },
  // src/workspaces/route.js
  {
    method: 'GET',
    path: '/tracy-admin/whoami',
    summary: 'Tell whether I am Tracy staff (staff)',
    description:
      "Answers the signed-in person's address and rank on the Tracy staff workspace (owner, admin or developer). Anyone else gets 403 `SEAT_NOT_AUTHORIZED`.",
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: '`{email, role}`'
  },
  // src/workspaces/route.js
  {
    method: 'GET',
    path: '/tracy-admin/members',
    summary: 'List Tracy staff (staff)',
    description:
      "Lists live members of the Tracy staff workspace, with the viewer's own rank. Needs an owner, admin or developer staff seat. Also reached through the Ops console relay.",
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: '`{viewer: {email, role}, members: [...]}`'
  },
  // src/workspaces/route.js
  {
    method: 'POST',
    path: '/tracy-admin/members',
    summary: 'Add a Tracy staff member (staff)',
    description:
      'Staff owners and admins grant a staff role and mail an invitation. Owners grant owner/admin/developer, admins grant admin/developer (403 `ROLE_NOT_ALLOWED` otherwise). 409 `ALREADY_A_MEMBER`. Answers 201, or 202 when the mail could not be sent.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    body: {
      type: 'object',
      required: ['email', 'role'],
      properties: {
        email: { type: 'string', format: 'email' },
        role: { type: 'string', enum: ['owner', 'admin', 'developer'] }
      }
    },
    answers: '`{member, invited: true, notified}`'
  },
  // src/workspaces/route.js
  {
    method: 'POST',
    path: '/tracy-admin/members/:accountId/code',
    summary: 'Request a code to remove a staff member (staff)',
    description:
      'Mails a six-digit confirmation code, valid 10 minutes, to the acting staff owner or admin, required by the removal call. Only an owner may remove an owner; the last owner cannot be removed (409 `LAST_OWNER`). 404 `MEMBER_NOT_FOUND`.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { accountId: "The staff member's account id" } },
    answers: '`{sent: true, to: <masked address>, expiresInSeconds}`'
  },
  // src/workspaces/route.js
  {
    method: 'DELETE',
    path: '/tracy-admin/members/:accountId',
    summary: 'Remove a Tracy staff member (staff)',
    description:
      'Revokes a staff seat after the code from the `/code` call is supplied. 428 `REMOVAL_CODE_REQUIRED` with no live code, 403 `REMOVAL_CODE_INVALID` (with `triesLeft`), 429 `REMOVAL_CODE_EXHAUSTED` after five wrong tries. The last owner is never removed.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { accountId: "The staff member's account id" } },
    body: {
      type: 'object',
      required: ['code'],
      properties: { code: { type: 'string', pattern: '^[0-9]{6}$' } }
    },
    answers: '`{removed: <member row>}`'
  },
  // src/keys/route.js
  {
    method: 'GET',
    path: '/api/me/keys',
    summary: 'List the viewer’s API keys',
    description:
      'The live seat keys the signed-in person minted, newest first — id, site, label, scopes, a `hint` (`trk_<id>.…`), created/expires/last-used times. The secret itself is shown once, at mint, and never again. 503 `API_KEYS_NOT_CONFIGURED` when this deployment has no `API_KEY_PEPPER`.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    answers: '`{keys: [{id, siteKey, label, scopes, hint, createdAt, expiresAt, lastUsedAt}]}`'
  },
  // src/keys/route.js
  {
    method: 'POST',
    path: '/api/me/keys',
    summary: 'Mint an API key for one site',
    description:
      'Mints a Bearer key (`trk_<id>.<secret>`) bound to the signed-in person and ONE site they hold a live seat on, for programs calling the api host. `scopes` must sit inside what the seat’s role grants (owner: `content`, `code`, `site`, `lifecycle`; editor: `content`, `code`, `site`; viewer: none, so a viewer mints no key; 400 `SCOPE_OUTSIDE_ROLE` names the toolsets outside), and the Apply door intersects them with the role again on every call, so the key never exceeds the seat. Requires the exact public `Origin` (403 otherwise); 403 `SEAT_NOT_AUTHORIZED` without a live seat; 429 `RATE_LIMITED` past 20 mints an hour; 503 `API_KEYS_NOT_CONFIGURED` without a pepper.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    body: {
      type: 'object',
      required: ['siteKey', 'label', 'scopes'],
      properties: {
        siteKey: { type: 'string', description: 'The site (scheme, `www.` and case are dropped)' },
        label: { type: 'string', maxLength: 80, description: 'A name for the screen, e.g. "CI robot"' },
        scopes: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', enum: ['content', 'code', 'site', 'lifecycle'] },
          description: 'Toolsets the key may use — a subset of the seat’s'
        },
        expiresInDays: {
          type: 'integer',
          minimum: 1,
          maximum: 3650,
          description: 'Omit for a key that does not expire'
        }
      }
    },
    answers:
      '201 `{id, key, siteKey, label, scopes, createdAt, expiresAt}` — `key` is readable in this answer only'
  },
  // src/keys/route.js
  {
    method: 'DELETE',
    path: '/api/me/keys/:id',
    summary: 'Revoke one of the viewer’s API keys',
    description:
      'Revokes a key the signed-in person minted. Permanent: a revoked key answers 401 `KEY_REVOKED` forever and nothing un-revokes it — mint a new one instead. 404 `KEY_NOT_FOUND` for a key that is not theirs or already gone.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { id: 'The key’s id (the 16 characters after `trk_`)' } },
    answers: '204, no body'
  },
  // src/keys/route.js
  {
    method: 'GET',
    path: '/api/me/connected-apps',
    summary: 'List the apps connected to the viewer’s account',
    description:
      'The live account-level grants made through the device flow (`/connect`), newest first: grant id, client, its display name, scopes (`demos`), created, last-used and expiry times. No token or hash. Seat keys are listed by `/api/me/keys`. 503 `API_KEYS_NOT_CONFIGURED` without a pepper.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    answers: '`{apps: [{id, clientId, name, scopes, createdAt, lastUsedAt, expiresAt}]}`'
  },
  // src/keys/route.js
  {
    method: 'DELETE',
    path: '/api/me/connected-apps/:id',
    summary: 'Disconnect an app from the viewer’s account',
    description:
      'Revokes one of the signed-in person’s account grants: its access token answers 401 `KEY_REVOKED` and its refresh token is refused, so the app must connect again. Permanent. Requires the exact public `Origin` (403 `BAD_ORIGIN`); 404 `CONNECTED_APP_NOT_FOUND` for a grant that is not theirs or already revoked.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { id: 'The grant id from `GET /api/me/connected-apps`' } },
    answers: '204, no body'
  },
  // src/notifications/route.js
  {
    method: 'GET',
    path: '/api/notifications',
    summary: 'List my notifications',
    description:
      "The signed-in person's Inbox, newest first, 50 per page, from the last 90 days. Each row names the event (`kind`), the site (`siteKey`, which never changes, and `siteName`, its address now: after Settings › Site URL old rows read the new name, and a deleted site keeps the name it had), the actor (`{id, email, name, face}`, where `face` — `{initial, color, avatarUrl}` — is the one the Team tab draws for the same account; `actor: null` for an event no person caused, or whose account was deleted) and the facts the sentence needs (`data`); the Inbox writes the words in the reader's language. Also answers the unread count. Reading it stores the language the interface speaks, so notifications others trigger reach them in it: `?lang=` (one of the eight interface languages) when given, else the `tracy_lang` pick, else the device language when it is one of the eight, else English. 401 `NOT_SIGNED_IN`; 400 `BAD_CURSOR` for a malformed `before`.",
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: {
      query: {
        filter: '`unread` for unread rows only; anything else lists all',
        before: 'the `createdAt` of the last row already shown, for the next page',
        lang: 'the interface language on screen (one of the eight), stored as the language of notification email'
      }
    },
    answers:
      '`{notifications: [{id, kind, siteKey, siteName, actor: {id, email, name, face: {initial, color, avatarUrl}} | null, data, settledAt, createdAt, readAt}], next, unread}`'
  },
  // src/notifications/route.js
  {
    method: 'GET',
    path: '/api/notifications/unread',
    summary: 'Count my unread notifications',
    description:
      'The number beside Inbox in the left column, polled while the page is visible. Like the list, it stores the language the interface speaks (`?lang=` first; the Inbox always sends it). 401 `NOT_SIGNED_IN`.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: {
      query: {
        lang: 'the interface language on screen (one of the eight), stored as the language of notification email'
      }
    },
    answers: '`{unread}`'
  },
  // src/notifications/route.js
  {
    method: 'POST',
    path: '/api/notifications/:id/read',
    summary: 'Mark one of my notifications read',
    description:
      'Marks the row read (a second call keeps the first time) and answers it as the list does, actor and face included. Only the recipient may mark it: anything else is 404 `NOTIFICATION_NOT_FOUND`.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { id: 'the notification id' } },
    answers: '`{notification}`'
  },
  // src/notifications/route.js
  {
    method: 'POST',
    path: '/api/notifications/read-all',
    summary: 'Mark all my notifications read',
    description: 'The Inbox\'s "Mark all as read": every unread row of the signed-in person.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    answers: '`{marked}`'
  },
  // src/welcome/route.js
  {
    method: 'GET',
    path: '/welcome/scenes/*',
    summary: 'Load a file of the Welcome popup scenes',
    description:
      'The animated scenes the first-run Welcome to Tracy popup shows in its frame: their HTML pages, scripts, styles, pictures and fonts, read from the image as they are. `addsite/img/systems/<uuid>.webp` answers the design system library thumbnail of that uuid. Signed-in account only; only Tracy pages may frame the pages (`frame-ancestors self`). `cache-control: private, max-age=3600`. 401 `NOT_SIGNED_IN`; 404 `NOT_FOUND` for any other path.',
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { path: { '*': 'File path under `/welcome/scenes/`, for example `engine.html`.' } },
    answers: 'The file, with its own content type'
  },
  // src/seen-hints/route.js
  {
    method: 'GET',
    path: '/api/seen-hints',
    summary: 'Read the hints my account has already seen',
    description:
      'Reads the signed-in account across web browsers and the desktop app. Returns the seen names from the closed list `site-tour`, `voice-tip`, `welcome`, sorted alphabetically; an account with no marks answers an empty list. Responses are not cached. 401 `NOT_SIGNED_IN`.',
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: false,
    answers: '`{hints: ["site-tour" | "voice-tip" | "welcome"]}`'
  },
  // src/seen-hints/route.js
  {
    method: 'POST',
    path: '/api/seen-hints',
    summary: 'Record that my account has seen one hint',
    description:
      'Same-origin signed-in JSON request. Body `{hint}` accepts only `site-tour`, `voice-tip` or `welcome`. Records the hint once for this account, keeping its first timestamp on repeated requests, and returns all its seen names sorted alphabetically. Creates the account row when the session has none yet. Responses are not cached. 400 `INVALID_REQUEST` for an unknown hint or malformed JSON; 401 `NOT_SIGNED_IN`; 403 `CSRF_ORIGIN` for a foreign origin; 415 `UNSUPPORTED_MEDIA_TYPE` for a non-JSON body.',
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: false,
    body: {
      type: 'object',
      required: ['hint'],
      properties: { hint: { type: 'string', enum: ['site-tour', 'voice-tip', 'welcome'] } }
    },
    answers: '`{hints: ["site-tour" | "voice-tip" | "welcome"]}`'
  },
  // src/onboarding/route.js
  {
    method: 'GET',
    path: '/api/onboarding',
    summary: 'Read whether I closed Getting started, and whether I hid its row',
    description:
      'The first-run spotlight tour shows after sign-in while this answers `completedAt: null`. Getting started in the account menu still opens the account-setup dialog. Accounts made before the screen existed start null too. `menuHiddenAt` is when the account hid the Getting started row from the account menu, or `null` while the row shows. Reopening the screen from Help reads nothing here. 401 `NOT_SIGNED_IN`.',
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: false,
    answers: '`{completedAt: ISO time | null, menuHiddenAt: ISO time | null}`'
  },
  // src/onboarding/route.js
  {
    method: 'POST',
    path: '/api/onboarding',
    summary: 'Record that I closed Getting started',
    description:
      'Skipping the tour, finishing the start-screen tour, or closing Getting started records completion for the account on web and desktop. No body. The first close is kept; a later one changes nothing and answers the same time. Creates the account row when the session has none yet. 401 `NOT_SIGNED_IN`.',
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: false,
    answers: '`{completedAt: ISO time}`'
  },
  // src/onboarding/route.js
  {
    method: 'POST',
    path: '/api/onboarding/menu-hide',
    summary: 'Hide the Getting started row from my account menu',
    description:
      '"Hide from account menu" on the Getting started screen, on the web or in the desktop app. No body. The first hide is kept; a later one changes nothing and answers the same time. Creates the account row when the session has none yet. The screen itself still opens from Settings › Help & about (and Help in the desktop app). 401 `NOT_SIGNED_IN`.',
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: false,
    answers: '`{menuHiddenAt: ISO time}`'
  },
  // src/onboarding/route.js
  {
    method: 'POST',
    path: '/api/onboarding/menu-show',
    summary: 'Show the Getting started row in my account menu again',
    description:
      '"Show in account menu" on the Getting started screen, on the web or in the desktop app: undoes `POST /api/onboarding/menu-hide`. No body. Clears `menuHiddenAt`, so the row shows again while setup steps remain; showing a row that is not hidden changes nothing. 401 `NOT_SIGNED_IN`.',
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: false,
    answers: '`{menuHiddenAt: null}`'
  },
  // src/onboarding/route.js
  {
    method: 'POST',
    path: '/api/onboarding/step',
    summary: 'Say which step of a first-run guide was reached, or how it ended',
    description:
      'Called by Tracy’s first-run guides (the Welcome popup and the two tour stages) for usage, never read back. `{runId, flow, step}` records a step one showing reached, once per showing and step; adding `end` records how that showing ended, once per showing (the first end wins). Closed lists: `welcome` steps `1`–`8`, ends `close`, `escape`, `cta`; `tour-start` steps `template`, `import`, `createsite` and `tour-site` steps `preview` … `composer`, ends `done`, `skip`, `escape`, `gone`. At most 200 records an account an hour. 400 `INVALID_RUN_ID`, `INVALID_FLOW`, `INVALID_STEP` or `INVALID_END`; 401 `NOT_SIGNED_IN`; 429 `RATE_LIMITED`.',
    audience: ['customer'],
    auth: 'session',
    internal: true,
    body: {
      type: 'object',
      required: ['runId', 'flow', 'step'],
      properties: {
        runId: { type: 'string', format: 'uuid', description: 'The id this showing drew' },
        flow: { type: 'string', enum: ['welcome', 'tour-start', 'tour-site'] },
        step: { type: 'string', description: 'The scene number or tour step, from the flow’s list' },
        end: {
          type: 'string',
          enum: ['close', 'escape', 'cta', 'done', 'skip', 'gone'],
          description: 'Optional: how the showing ended, at `step`'
        }
      }
    },
    answers: '`{ok: true}`'
  },
  // src/notifications/route.js
  {
    method: 'GET',
    path: '/api/notifications/preferences',
    summary: 'Read my notification settings',
    description:
      'Settings › Notifications: the five groups of notification kinds (`about-you`, `join-requests`, `teammates`, `mentions-replies`, `resolved-reopened`), in display order, each with the Inbox and Email switch of the signed-in person. Everything is on until the person turns it off. `join-requests` is `locked`: always on, for everyone. 401 `NOT_SIGNED_IN`.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    answers: '`{groups: [{id, section, locked, inbox, email}]}`'
  },
  // src/notifications/route.js
  {
    method: 'PUT',
    path: '/api/notifications/preferences',
    summary: 'Change my notification settings',
    description:
      'Turns the Inbox or Email channel of one or more groups on or off for the signed-in person only; a channel left out keeps its value. Turning the locked `join-requests` group off is ignored (it stays on). Answers every group as `GET` does. 400 `UNKNOWN_GROUP` or `BAD_BODY`; 401 `NOT_SIGNED_IN`; 404 `NO_ACCOUNT`.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    body: {
      type: 'object',
      required: ['groups'],
      properties: {
        groups: {
          type: 'object',
          description: 'Group id → the channels to set, e.g. `{"teammates": {"email": false}}`',
          additionalProperties: {
            type: 'object',
            properties: { inbox: { type: 'boolean' }, email: { type: 'boolean' } }
          }
        }
      }
    },
    answers: '`{groups: [{id, section, locked, inbox, email}]}`'
  },
  // src/notifications/route.js
  {
    method: 'GET',
    path: '/api/notifications/unsubscribe',
    summary: 'Open a one-click unsubscribe link',
    description:
      "The address in a notification mail's `List-Unsubscribe` header (RFC 8058), `?t=<token>`: a signed token naming the account and the notification group, never the address, valid 90 days. Opening it changes nothing: it answers an HTML page whose form POSTs the same token (a script submits it at once), so a scanner or prefetcher that only reads the link unsubscribes no one. A forged, expired or locked-group (`join-requests`) token answers 400 with a page pointing to Settings › Notifications. Never reads the session.",
    audience: ['customer'],
    auth: 'token',
    internal: false,
    answers: 'HTML page'
  },
  // src/notifications/route.js
  {
    method: 'POST',
    path: '/api/notifications/unsubscribe',
    summary: 'Unsubscribe from one group of notification emails',
    description:
      'The one-click POST of RFC 8058 (`List-Unsubscribe=One-Click`, sent by Gmail and Yahoo from their own servers, without a cookie), `?t=<token>`. Turns the EMAIL switch of the token\'s group off for the token\'s account only; the Inbox switch and every other group keep their values. Repeating it changes nothing more. The token is the whole authority: a session cookie that rides along is ignored. Answers the "You are unsubscribed" page. 400 for a forged, expired or locked-group token (the locked `join-requests` letters carry no header); 500 when the switch could not be saved.',
    audience: ['customer'],
    auth: 'token',
    internal: false,
    answers: 'HTML page'
  },
  // src/assistant/route.js — the AI Assistant and its handoff to the Customer Service team
  {
    method: 'GET',
    path: '/api/assistant/conversation',
    summary: "Read the signed-in person's current assistant conversation",
    description:
      "The account has one current conversation per agent session (`session=<id>`, the Help questions asked as `/help` in that session; without `session`, the account-level one the Tracy-team handoff uses). Without `after` it answers the latest 50 turns (each Help turn carries its `anchorSeq`), the links Help may draw (built from the asker's accepted seats) and `tipSeen`; with `after=<turn id>` only the turns after it. Also answers `state` (`ai`, `waiting_human`, `human`), the count of unread staff turns, and whether a person can be asked for. A signed-in person with nothing stored yet (no account record) reads an empty conversation: `conversationId` null, no turns, no `tipSeen`; the read creates nothing.",
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: {
      query: {
        after: 'a turn id; answer only the turns after it',
        session:
          'the Help conversation key; onboarding uses tracy-onboarding-help, absent = the account-level one',
        start: '1 to include the allowed creation actions in the returned links'
      }
    },
    answers: '{conversationId, state, turns, unread, lastRead, supportAvailable, sessionId, links?, tipSeen?}'
  },
  {
    method: 'POST',
    path: '/api/assistant/turns',
    summary: 'Ask the AI Assistant, or write to the Tracy team while it holds the conversation',
    description:
      "Answers `text/event-stream`: `meta`, then `delta` pieces of the answer, then `done` (or `error`). The model is given only the asker's own accepted seats and the brief of the site on screen, and has no tools. While a person of the Tracy team holds the conversation the message goes to their Telegram topic and no model is called. 409 `CONVERSATION_CHANGED` when `conversationId` is no longer current (cleared elsewhere); 429 over the per-account limits; 503 when no model is configured.",
    audience: ['customer'],
    auth: 'session',
    internal: false,
    body: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          maxLength: 4000,
          description: 'Text, or empty when attachments are supplied'
        },
        attachments: {
          type: 'array',
          maxItems: 10,
          uniqueItems: true,
          items: { type: 'string', format: 'uuid' },
          description: 'Stored file ids belonging to this account and Help conversation'
        },
        start: {
          type: 'boolean',
          description: 'Offer allowlisted creation actions as text for the customer to press'
        },
        requestId: {
          type: 'string',
          format: 'uuid',
          description: 'Retained across file-question retries when the response may be lost before meta'
        },
        retryTurnId: {
          type: 'string',
          pattern: '^[1-9][0-9]{0,18}$',
          description: 'Reuse this own user turn, with identical text and attachment ids'
        },
        conversationId: { type: 'string', format: 'uuid' },
        site: {
          type: 'string',
          description: "the site the page names; used only when it is one of the asker's seats"
        },
        session: {
          type: 'object',
          description:
            'the agent session the question was asked in: `id` picks the conversation, `anchorSeq` is the log seq the answer sits after, `title` and `state` are facts for the model. Nothing of the session is read.',
          properties: {
            id: { type: 'string' },
            anchorSeq: { type: 'number', minimum: 0 },
            title: { type: 'string', maxLength: 120 },
            state: { type: 'string' }
          }
        }
      }
    },
    answers: 'text/event-stream'
  },
  {
    method: 'POST',
    path: '/api/assistant/turns/:id/rating',
    summary: 'Rate one Help answer with a thumbs up or down',
    description:
      "Sets, changes or clears (`rating: null`) the rating of one answer of the signed-in person's own current Help conversation: `1` up, `-1` down. Never read by the model. 404 for an answer that is not theirs, a question, or a cleared conversation; 400 for any other value. Answers 204.",
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { id: "the answer turn id (the `turnId` of the stream's `done` event)" } },
    body: {
      type: 'object',
      required: ['rating'],
      properties: { rating: { type: ['integer', 'null'], enum: [1, -1, null] } }
    },
    answers: '204 No Content'
  },
  {
    method: 'POST',
    path: '/api/assistant/tip/seen',
    summary: 'Record that the one-time "type /help" tip was shown',
    description:
      'Marks the tip as seen for the signed-in account (once per account, not per browser). Repeating it changes nothing. Answers 204.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    answers: '204 No Content'
  },
  {
    method: 'POST',
    path: '/api/assistant/handoff',
    summary: 'Hand the conversation to a person of the Tracy team',
    description:
      'Opens a topic for this customer in the Customer Service Telegram group (or reopens their last one) and posts a summary: email, the site on screen when it is one of their seats, the last 12 turns. The conversation becomes `waiting_human`; the model stops answering. 3 an hour, 10 a day per account; 503 `SUPPORT_UNAVAILABLE` when no CS bot is configured.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    body: {
      type: 'object',
      required: ['conversationId'],
      properties: { conversationId: { type: 'string', format: 'uuid' }, site: { type: 'string' } }
    },
    answers: '202 {state}'
  },
  {
    method: 'POST',
    path: '/api/assistant/handoff/end',
    summary: 'Give the conversation back to the AI Assistant',
    description:
      '`reason` is `resolved` or `back_to_ai`. Ends the open handoff, notes the reason in the Telegram topic and closes it; the next message is answered by the AI.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    body: {
      type: 'object',
      required: ['conversationId', 'reason'],
      properties: {
        conversationId: { type: 'string', format: 'uuid' },
        reason: { type: 'string', enum: ['resolved', 'back_to_ai'] }
      }
    },
    answers: '{state}'
  },
  {
    method: 'POST',
    path: '/api/assistant/conversation/read',
    summary: "Mark the Tracy team's replies as read up to a turn",
    description:
      'Moves the read mark forward, never back, and never past a turn of this conversation. Answers 204.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    body: {
      type: 'object',
      required: ['conversationId', 'through'],
      properties: { conversationId: { type: 'string', format: 'uuid' }, through: { type: 'string' } }
    },
    answers: '204'
  },
  {
    method: 'POST',
    path: '/api/assistant/conversation/clear',
    summary: 'Clear the current conversation and start a new one',
    description:
      'For the whole account. An open handoff ends with a note in its topic, customer messages not yet sent there are dropped, and the cleared turns are deleted after 30 days.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    body: { type: 'object', properties: { conversationId: { type: 'string', format: 'uuid' } } },
    answers: '{conversationId, state}'
  },
  {
    method: 'POST',
    path: '/api/assistant/attachments',
    summary: 'Upload a file for a Help question',
    description:
      'Any signed-in account, including one without a site or stored account record yet. Send multipart/form-data with one file in `file` and an optional Help conversation key in `session` (onboarding uses `tracy-onboarding-help`). PNG, JPEG, GIF, WebP, PDF, DOCX, XLSX, TXT and CSV are accepted, at most 20 MiB each; inline pictures must match their format signature. The artifact store keeps the bytes under an account-owned key. Name the returned id in `attachments` of a question to claim it atomically; up to ten files per question. Loose uploads older than a day are swept on the next upload, with failed deletes retained for retry. The model receives names, kinds and sizes only. 400 BAD_FILE, 413 FILE_TOO_LARGE, 415 FILE_TYPE, 429 RATE_LIMITED (60 uploads per hour), 503 FILE_STORE_UNAVAILABLE, or 502 FILE_STORE_FAILED.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    answers: '201 `{file}` — `{id, name, type, bytes, url}`'
  },
  {
    method: 'GET',
    path: '/api/assistant/attachments/:id',
    summary: 'Read an uploaded Help file or a photo from the Tracy team',
    description:
      'The bytes, read from the artifact store; only for the account that owns the uncleared conversation (404 otherwise). Customer pictures open inline, other files download under their stored name, with nosniff and a sandboxing CSP.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { id: 'the stored attachment id' } },
    answers: 'File bytes'
  },
  {
    method: 'POST',
    path: '/api/assistant/telegram/webhook',
    summary: "Receive the Customer Service bot's Telegram updates",
    description:
      'Telegram POSTs each update here when `CS_TELEGRAM_MODE=webhook`. The `X-Telegram-Bot-Api-Secret-Token` header must equal `CS_TELEGRAM_WEBHOOK_SECRET` (404 otherwise, and in any other mode); no session is read. A staff message in an open topic is relayed to the one account bound to it.',
    audience: ['fleet'],
    auth: 'token',
    internal: true,
    answers: 'ok'
  },
  // src/discord/route.js
  {
    method: 'POST',
    path: '/api/discord/link/start',
    summary: "Mail a code to the address a Discord member gives Tracy's bot",
    description:
      "Called by Tracy's Discord bot when a member types `/verify email`. The `x-tracy-discord-secret` header must equal `DISCORD_LINK_SECRET` (404 otherwise, and when it is unset). When the beta gate would let the address in, the sign-in letter is mailed with a six-digit code kept for that member only. Always answers `{ok:true}` for a valid request, never revealing whether the address is known; 429 `RATE_LIMITED` past the per-inbox or per-member hourly cap.",
    audience: ['fleet'],
    auth: 'token',
    internal: true,
    body: {
      type: 'object',
      required: ['discordId', 'email'],
      properties: {
        discordId: { type: 'string', description: 'The Discord user id' },
        email: { type: 'string', format: 'email' }
      }
    },
    answers: '`{ok: true}`'
  },
  // src/discord/route.js
  {
    method: 'POST',
    path: '/api/discord/link/verify',
    summary: 'Link a Discord member to the address they proved',
    description:
      'Checks the code mailed by `POST /api/discord/link/start` for the same member, with the same `x-tracy-discord-secret` header. Right code: the member is linked to the address (an earlier link of either side is let go) and `discord.linked` is recorded for `/ops`. Wrong, expired or over-tried codes answer 401 `BAD_CODE`.',
    audience: ['fleet'],
    auth: 'token',
    internal: true,
    body: {
      type: 'object',
      required: ['discordId', 'code'],
      properties: {
        discordId: { type: 'string' },
        discordName: {
          type: 'string',
          description: "The member's Discord username, for reading on /ops (optional, cut at 32 characters)"
        },
        code: { type: 'string', description: 'Six digits' }
      }
    },
    answers: '`{ok: true}`'
  },
  // src/discord/route.js
  {
    method: 'POST',
    path: '/api/discord/events',
    summary: "Record a linked Discord member's activity as an /ops signal",
    description:
      'Tracy\'s Discord bot reports a new #bug-reports post (`kind: "bug_report"`, with `data.threadId`, `data.title`, `data.url`) or a member leaving (`kind: "left"`), with the same `x-tracy-discord-secret` header. A linked member\'s event becomes `discord.bug_report` or `discord.left`; `left` also removes the link, so a member who rejoins proves the address again. An unlinked member\'s event records nothing and answers `linked: false`.',
    audience: ['fleet'],
    auth: 'token',
    internal: true,
    body: {
      type: 'object',
      required: ['kind', 'discordId'],
      properties: {
        kind: { type: 'string', enum: ['bug_report', 'left'] },
        discordId: { type: 'string' },
        discordName: {
          type: 'string',
          description: "The member's Discord username, for reading on /ops (optional, cut at 32 characters)"
        },
        data: { type: 'object' }
      }
    },
    answers: '`{ok: true, linked}`'
  }
]
