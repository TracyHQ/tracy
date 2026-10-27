/** The experimental website widget's browser doors, gated by website-voice-widget. */
const common =
  'Widget entry is available on the Tracy origin while the operator enables `website-voice-widget` (off by default). The widget owns its iframe document. A host-only HttpOnly `tracy_widget` visitor cookie is partitioned by the embedding site on HTTPS. Mutations require this origin and JSON, except the exact bounded native binary-upload door. Discovery context is encrypted at rest, visitor/account-bound and expires after 24 hours; adopted native context is retained with its account. Authentication, OTP flows and speech tokens remain transient and are never persisted in the conversation. '
const row = (method, path, summary, description, auth = 'none', extra = {}) => ({
  method,
  path,
  summary,
  description: common + description,
  audience: ['customer', 'public'],
  auth,
  internal: false,
  ...extra
})

export const WIDGET_ROUTES = [
  row(
    'POST',
    '/widget/api/native/open',
    'Continue in a native conversation',
    'Verified visitor/account only. CAS-persist a server-generated native session mapping before a signed onboarding allocation. Preserve imported discovery context without replaying prompts or creating a website. Repeated calls return the same native session. No request fields are accepted.',
    'session'
  ),
  row(
    'POST',
    '/widget/api/native/logout',
    'Sign out of an embedded native conversation',
    'Revoke the native seat and Tracy session, clear transient visitor authentication and its partitioned cookie. Retain the encrypted account-owned imported record.',
    'session'
  ),
  row(
    'GET',
    '/widget/api/native/context',
    'Read imported discovery context',
    'Require this visitor and verified owner to match the ready native mapping. Return the sanitized imported history, brief, choices and a separate current read-only build snapshot.',
    'session'
  ),
  row(
    'GET',
    '/api/widget-native/context',
    'Read an owned native imported record',
    'Verified first-party account or signed host actor only; no visitor-auth fallback. Indexed session ownership is checked against the encrypted mapping. This native record remains readable independently of the widget visibility switch.',
    'session'
  ),
  row(
    'GET',
    '/widget',
    'Open the voice website assistant',
    'Serve the welcome and conversation document; microphone access begins after a user gesture.'
  ),
  row(
    'GET',
    '/widget/assets/:file',
    'Read a widget asset',
    'Serve an allowlisted JavaScript, CSS, JSON or HTML asset.',
    'none',
    { params: { path: { file: 'An allowlisted widget asset filename' } } }
  ),
  row(
    'GET',
    '/widget/embed.js',
    'Embed the website assistant',
    'A classic script creates an iframe, permits microphone and autoplay, and accepts size messages only from that frame and origin. `data-target` selects an existing container.'
  ),
  row(
    'GET',
    '/widget/api/state',
    'Read the visitor conversation',
    'Hydrate the visitor, or answer a fresh unsaved state when there is none: a read never creates a visitor, row or cookie; the first write does, limited per address (429 `WIDGET_VISITOR_LIMIT`; 503 `WIDGET_AT_CAPACITY` with `Retry-After` when every place is busy). Return history, brief, selected template/design system, speech availability, authoritative current-build facts and sign-in status. Interrupted turns return manual-only recovery, never automatic replay. A pending OTP step names the bound email, never the code.'
  ),
  row(
    'GET',
    '/widget/api/build-status',
    'Read the current visitor website build',
    'Use only the server-held current build pointer and verified session through the fenced inspect=1 door. No job IDs are accepted from this request. Return done/pending/running/failed/missing/expired/unavailable or signed_out, with server-derived links only.'
  ),
  row(
    'GET',
    '/widget/api/catalogue',
    'Read the real template and design system catalogue',
    'Return the deployment catalogue through the existing template and design system doors, with a short cache. No separate catalogue is maintained.'
  ),
  row(
    'GET',
    '/widget/api/template-thumb/:id',
    'Read a released template thumbnail',
    'Crop a same-origin catalogue image into a small WebP thumbnail; unknown IDs and external source URLs are refused.',
    'none',
    { params: { path: { id: 'A real released template ID' } } }
  ),
  row(
    'POST',
    '/widget/api/visible',
    'Report visible catalogue choices',
    'Store only IDs present in the real catalogue, capped at 36 per list.',
    'none',
    {
      body: {
        type: 'object',
        properties: {
          templates: { type: 'array', items: { type: 'string' } },
          systems: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  ),
  row(
    'POST',
    '/widget/api/select',
    'Keep a template, design system or brief choice',
    'Validate selection IDs against the catalogue; platform must be WordPress, Joomla or EmDash. This records a reversible choice and creates no site.',
    'none',
    {
      body: {
        type: 'object',
        required: ['kind'],
        properties: {
          kind: { type: 'string', enum: ['template', 'system', 'platform', 'brief'] },
          id: { type: ['string', 'null'] },
          name: { type: 'string', maxLength: 200 }
        }
      }
    }
  ),
  row(
    'POST',
    '/widget/api/turn',
    'Talk about the website brief',
    'Use the configured assistant provider and real catalogue tools. The model may suggest known choices or open sign-in; it cannot supply credentials or create a site. Refuse overlapping turns and turns during pending sign-in; limit input to 4000 characters.',
    'none',
    {
      body: {
        type: 'object',
        required: ['message'],
        properties: {
          message: { type: 'string', minLength: 1, maxLength: 4000 },
          describeSelection: { type: 'boolean' }
        }
      }
    }
  ),
  row(
    'GET',
    '/widget/api/support',
    'Check the selected template support',
    'Read actual design system support for the selected template and CMS; unavailable combinations are explicitly refused.'
  ),
  row(
    'POST',
    '/widget/api/create',
    'Create the chosen website after sign-in',
    'Require a live verified session, from the browser or the visitor-bound inline sign-in. Forward the selected released quickstart, brief and optional design system to the normal site creation door under that person. Keep the build ID for retries; do not create as the internal guest.',
    'session',
    {
      body: {
        type: 'object',
        required: ['label'],
        properties: { label: { type: 'string', pattern: '^[a-z][a-z0-9-]{2,31}$' } }
      }
    }
  ),
  row(
    'POST',
    '/widget/api/auth/language',
    'Localize public voice sign-in instructions',
    'Accept only a language code. Return fixed translated guides and a validated confirmation, digit and email-symbol lexicon. Uses the existing assistant assignment, bounded cache and rate admission. Never accepts email, OTP, cookies, history or private transcript; unknown or unavailable translation returns 503 instead of silently switching to English.',
    'none',
    {
      body: {
        type: 'object',
        properties: { language: { type: 'string', description: 'ISO language or BCP 47 tag' } },
        required: ['language'],
        additionalProperties: false
      }
    }
  ),
  row(
    'GET',
    '/widget/api/auth/status',
    'Check the visitor sign-in',
    'Return only whether a live session is available; stored sessions are checked for revocation on every read.'
  ),
  row(
    'POST',
    '/widget/api/auth/cancel',
    'Cancel the pending inline sign-in',
    'Clear the pending email and Google flow. Keep the conversation and choices; cancelling sign-in does not sign an already signed-in person out.'
  ),
  row(
    'POST',
    '/widget/api/auth/email',
    'Send an inline email sign-in code',
    'Use the normal login door and its mail limits. Bind the submitted email to this visitor for ten minutes. Spoken candidates are read back and explicitly confirmed by the widget before this call.',
    'none',
    {
      body: { type: 'object', required: ['email'], properties: { email: { type: 'string', maxLength: 254 } } }
    }
  ),
  row(
    'POST',
    '/widget/api/auth/verify',
    'Verify the inline email code',
    'Verify only against the email bound to this visitor, then attach the confirmed session. Codes never enter model history. The existing verify door and its attempt limits remain authoritative.',
    'otp',
    {
      body: {
        type: 'object',
        required: ['code'],
        properties: { code: { type: 'string', pattern: '^\\d{6}$' } }
      }
    }
  ),
  row(
    'POST',
    '/widget/api/auth/google',
    'Start a Google sign-in popup',
    'Create a random ten-minute, single-use flow for this visitor and return the existing Google sign-in URL. The person must open the provider popup themselves; no account is selected for them.'
  ),
  row(
    'GET',
    '/widget/oauth/complete',
    'Finish the verified Google popup',
    'Accept only a flow attested by the fresh OAuth callback after both state checks and provider exchange. An old signed-in cookie alone cannot complete it. Attach the same confirmed session to the original framed visitor; notify the opener with flow ID only, never a token.',
    'oauth',
    { params: { query: { flow: 'The single-use visitor-bound Google flow ID' } } }
  ),
  row(
    'GET',
    '/widget/api/speech/stream',
    'Speak with the website assistant over WebSocket',
    'Require this origin, an active widget visitor and the normal voice switch/key. Relay through the existing speech service, using the verified person or a server-derived anonymous identity of this visitor, with its own smaller daily quota, a shared anonymous cap and per-address session limits. Audio uses the same PCM and event protocol as `/api/speech/stream`; plain HTTP returns 426 UPGRADE_REQUIRED. The microphone remains open during inline sign-in; private sign-in transcript is routed separately.'
  ),
  row(
    'GET',
    '/widget/backend/*',
    'Read an allowlisted widget backend resource',
    'Relay only speech availability, design system library/support/images and site job status. Each underlying door retains its normal permission checks; arbitrary API paths are refused.'
  ),
  row(
    'POST',
    '/widget/backend/*',
    'Read a widget reply aloud',
    'Only `/widget/backend/api/speech/say` is allowed for POST; forward JSON to the existing TTS door, keeping provider keys on the server. Other paths and methods are refused.'
  )
]
