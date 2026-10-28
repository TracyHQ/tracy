/** Private real-campaign review routes; source: src/invitations/real-routes.js. */
const shared = { audience: ['team'], auth: 'admin', internal: true }
const string = { type: 'string' }
const revision = {
  type: 'integer',
  minimum: 0,
  description: 'Current campaign revision; stale writes answer 409'
}
const uuid = { ...string, format: 'uuid' }
const group = { ...string, enum: ['group_1', 'group_2', 'group_3', 'group_4', 'group_5'] }
const pathParams = { path: { id: 'Real campaign UUID' } }
const recipientParams = { path: { id: 'Real campaign UUID', rid: 'Real recipient UUID' } }
const body = (properties, required = Object.keys(properties)) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false
})
const policy =
  'Separate from the synthetic sandbox. Default off; requires explicit local/dev real-campaign configuration and a private campaign key vault outside database backups. Requires an accepted staff seat; every endpoint except the aggregate overview requires owner/admin. Every response is no-store. Writes require the configured Origin; JSON bodies are closed objects of at most 1 MiB. Campaign reads and writes recheck database time and the independent key ledger; expired data answers 410, unavailable keys answer 503, never plaintext fallback. Senders on this prefix: the test send to the server-held list (INVITATIONS_SENDING=test or pilot, local/dev only) and, in pilot mode, one approved invitation to its own customer after a live aMember check-access; there is no bulk send, simulator or Sendy adapter. '
const binary =
  'The body is binary, not JSON or multipart: application/octet-stream, text/csv or application/zip, streamed up to 10 MiB. Supply metadata as encodeURIComponent(JSON.stringify(metadata)) in X-Invitations-Input, at most 4 KiB on the wire (ASCII JSON is also accepted). Never put customer values in the URL. '

/** @type {import('./index.js').RouteDoc[]} */
export const INVITATIONS_REAL_ROUTES = [
  {
    ...shared,
    method: 'GET',
    path: '/api/ops/invitations/real',
    summary: 'Read real campaign review availability and aggregate counts',
    description: `${policy}Developer seats receive UUIDs, dates and counts only, never campaign names or contacts. Owner/admin also receive names of active campaigns. Lists the most recent 100 campaigns. When disabled, returns enabled:false and no campaigns; other endpoints answer 404.`,
    answers: '{ enabled, mode:"real", writable, sendingEnabled:false, groups, campaigns }'
  },
  {
    ...shared,
    method: 'GET',
    path: '/api/ops/invitations/real/settings',
    summary: 'Read the default real campaign retention',
    description: `${policy}Default is 30 days from the first committed import.`,
    answers: '{ days }'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/real/settings',
    summary: 'Set retention for future real campaigns',
    description: `${policy}An integer from 1 to 365 days. Does not change existing campaign deadlines; records a non-PII audit event.`,
    body: body({ days: { type: 'integer', minimum: 1, maximum: 365 } }),
    answers: '{ days }'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/real/imports/preview',
    summary: 'Preview a real CSV without publishing recipients',
    description: `${policy}${binary}Metadata: {campaignId?,name?,sourceDate?,mapping?}; omit campaignId for a new campaign. Preserves ordered raw columns and empty values, accepts real identities and keeps the five explicit source groups. Parser limits: 10000 rows, 100 columns, 16 KiB per field. An encrypted actor-bound preview expires after 30 minutes. Returns aggregate counts and row/reason issues, not the customer payload. No campaign-wide recipient cap.`,
    answers: '{ previewId, digest, revision, counts, issues, expiresAt }'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/real/imports/commit',
    summary: 'Commit a verified real import atomically',
    description: `${policy}Checks actor, preview HMAC digest, revision and expiry. Writes batches of at most 1000 within one transaction, publishing no partial import. Actor-bound identical retries return the committed result; changed input or identity conflicts are refused. First import fixes the retention deadline; supplementary imports do not extend it or make anyone eligible to send.`,
    body: body({ previewId: uuid, digest: string, revision, requestKey: string }),
    answers: '201 with campaign view, counts, eligibleNow:null and sendingEnabled:false'
  },
  {
    ...shared,
    method: 'GET',
    path: '/api/ops/invitations/real/campaigns/:id',
    summary: 'Read a private real campaign overview',
    description: `${policy}Returns campaign metadata and aggregate counts, not the entire recipient list.`,
    params: pathParams,
    answers:
      '{ id, name, revision, sourceDate, firstImportedAt, expiresAt, counts, eligibleNow:null, sendingEnabled:false, groups:[{ key, label }], audience }'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/real/campaigns/:id/recipients/query',
    summary: 'Search and page real recipients without URL query data',
    description: `${policy}Search is in a POST body, never query parameters. At most 100 rows per page. The authenticated cursor binds filters and campaign revision; a changed campaign requires a fresh query. Returned content status is effective at read time.`,
    params: pathParams,
    body: body(
      {
        group,
        state: { ...string, enum: ['suppressed', 'recheck'] },
        search: string,
        content: { ...string, enum: ['not_created', 'draft', 'needs_review', 'approved'] },
        cursor: { type: ['string', 'null'] },
        limit: { type: 'integer', minimum: 1, maximum: 100 }
      },
      []
    ),
    answers: '{ items, nextCursor, total, revision }'
  },
  {
    ...shared,
    method: 'GET',
    path: '/api/ops/invitations/real/campaigns/:id/recipients/:rid',
    summary: 'Read one real recipient and saved draft',
    description: `${policy}Includes ordered raw source headers/values, provenance, explicit custom values, immutable draft assets and effective approval status. Content approval never changes suppressed/recheck send eligibility.`,
    params: recipientParams,
    answers: 'Recipient detail with rawSource, rawSources, values and draft'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/real/campaigns/:id/settings',
    summary: 'Set who a real campaign sends to and rename its groups',
    description: `${policy}audience is active_plan (the default: send only after aMember answers an active plan) or past_customers (send after any clear aMember answer, so expired customers can be invited back). groupLabels maps any of the campaign's group keys to a new name of at most 120 bytes; renaming changes the {{group}} field, so approved drafts that use it need review again. A campaign imported from a CSV whose group column holds one to five values other than the baseline five gets those values as its groups. Records audit when something changed.`,
    params: pathParams,
    body: body({
      revision,
      audience: { ...string, enum: ['active_plan', 'past_customers'] },
      groupLabels: { type: 'object', additionalProperties: { ...string, minLength: 1 } }
    }),
    answers: 'The campaign view, as in GET, with the new revision'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/real/campaigns/:id/extend',
    summary: 'Explicitly extend an unexpired real campaign',
    description: `${policy}Requires confirm:true and a canonical ISO expiresAt later than the current deadline, no later than 365 days from first import. Updates the independent ledger and database, records audit, and cannot revive expired or revoked keys. Reads, edits and imports never extend retention implicitly.`,
    params: pathParams,
    body: body({ revision, expiresAt: { ...string, format: 'date-time' }, confirm: { const: true } }),
    answers: '{ revision, expiresAt }'
  },
  {
    ...shared,
    method: 'GET',
    path: '/api/ops/invitations/real/campaigns/:id/fields',
    summary: 'Read the real campaign text field registry',
    description: `${policy}Built-ins and explicitly registered custom.<key> scalar text fields; never automatically exposes all source columns as template variables.`,
    params: pathParams,
    answers: 'Registry with revision, fields, campaignValues and groupValues'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/real/campaigns/:id/fields',
    summary: 'Configure real campaign custom text fields',
    description: `${policy}Registry defines explicit manual or existing-column sources and required/default/omit missing rules. Manual values use recipient, group, then campaign precedence. Rejects prototype keys, shadowed system fields and executable values. Changes invalidate only dependent approvals, keeping customized draft text. Registry revision is checked in addition to campaign revision.`,
    params: pathParams,
    body: body({
      revision,
      registry: {
        type: 'object',
        description:
          'Complete registry: revision, fields, campaignValues and groupValues; runtime validates the closed field definitions and scalar text values'
      }
    }),
    answers: 'Updated registry'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/real/campaigns/:id/recipients/:rid/fields',
    summary: 'Set explicit recipient custom text values',
    description: `${policy}Updates registered manual fields only, not raw source or delivery addresses. Dependent content approvals become stale without rewriting customized text.`,
    params: recipientParams,
    body: body({ revision, values: { type: 'object', additionalProperties: string } }),
    answers: '{ revision }'
  },
  {
    ...shared,
    method: 'GET',
    path: '/api/ops/invitations/real/campaigns/:id/drafts/progress',
    summary: 'Count recipients and drafts per real source group',
    description: `${policy}Counts only, no recipient data: for each of the five groups, how many recipients the campaign holds and how many already have a draft.`,
    params: pathParams,
    answers: '{groups:[{key,total,drafted}]}'
  },
  {
    ...shared,
    method: 'GET',
    path: '/api/ops/invitations/real/campaigns/:id/templates/:group',
    summary: 'Read the active real group template',
    description: `${policy}Each of the five groups has independent immutable template and image versions. Missing content is reported, never substituted with a built-in template.`,
    params: { path: { id: 'Real campaign UUID', group: 'group_1 through group_5' } },
    answers: 'Active template version with sanitized HTML, text, subject and managed assets'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/real/campaigns/:id/templates/preview',
    summary: 'Validate and stage a group HTML ZIP with images',
    description: `${policy}${binary}Metadata: {group,subject,revision,requestKey}. Requires one index.html, optional text.txt and PNG/JPEG/GIF assets, optionally in one wrapper directory. Expanded limit 20 MiB, 50 entries, HTML 256 KiB, image 2 MiB and 20 million pixels; GIF at most 100 frames and 20 million summed frame pixels. Rejects traversal, symlinks, duplicate names, encrypted archives, unsupported files, missing/external images and decompression overruns. Server parser sanitizes HTML/CSS; lists removed content and unknown tokens before confirmation. Staged bytes are encrypted and actor-bound.`,
    params: pathParams,
    answers: 'Staged upload ID with sanitized preview, warnings, unknown fields, assets and expiry'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/real/campaigns/:id/templates/commit',
    summary: 'Commit a validated group template version',
    description: `${policy}Requires an active actor-bound upload, registered tokens and current revision; identical retries return the same result. Publishes one immutable group version and managed asset set atomically. Affected drafts become stale; existing customized text and old asset bytes stay unchanged.`,
    params: pathParams,
    body: body({ uploadId: uuid, revision, requestKey: string }),
    answers: 'Template version and advanced campaign revision'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/real/campaigns/:id/templates/edit',
    summary: 'Save sanitized HTML and text as a new group version',
    description: `${policy}Allows only existing managed assets belonging to this campaign. Reapplies HTML/CSS, token and output budgets; no external asset fetch. Creates a version rather than mutating the previous one, and invalidates dependent approvals without overwriting customized drafts.`,
    params: pathParams,
    body: body({
      group,
      subject: string,
      html: string,
      text: { type: ['string', 'null'] },
      assetIds: { type: 'array', items: uuid },
      revision,
      requestKey: string
    }),
    answers: 'Template version and advanced campaign revision'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/real/campaigns/:id/content-preview',
    summary: 'Preview a real group template for one recipient',
    description: `${policy}Recipient must belong to the selected group. Escapes source/custom text and resolves registered optional sections; missing required values block complete rendering. No draft, audit, invitation or unsubscribe token is created. Preview system links are inactive.`,
    params: pathParams,
    body: body({ group, recipientId: uuid, revision }),
    answers: 'Rendered subject, HTML, bodyText, dependencies and immutable assets'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/real/campaigns/:id/generate',
    summary: 'Generate a bounded page of real review drafts',
    description: `${policy}Selects the group template and saves rendered HTML/text with immutable asset versions. At most 100 recipients per page; cursor binds group, revision and replacement mode. Existing drafts are preserved unless replaceExisting:true is explicit; without it a page reads only recipients that still lack a draft, so each page makes progress. groupTotal and groupDrafted count the whole group after the page. Content approval remains independent from send eligibility and no outbound attempt is created.`,
    params: pathParams,
    body: body(
      {
        group,
        cursor: { type: ['string', 'null'] },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        replaceExisting: { type: 'boolean', default: false },
        revision
      },
      ['group', 'revision']
    ),
    answers: '{ revision, created, kept, groupTotal, groupDrafted, nextCursor }'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/real/campaigns/:id/recipients/:rid/draft',
    summary: 'Customize one real recipient draft without changing source',
    description: `${policy}Sanitizes HTML, validates tokens and dependencies, binds only managed campaign assets, increments draft revision and clears content approval. Keeps group template/asset provenance and never edits the source or another recipient.`,
    params: recipientParams,
    body: body({
      subject: string,
      html: string,
      text: { type: ['string', 'null'] },
      revision,
      draftRevision: revision
    }),
    answers: '{ revision, draftRevision, warnings }'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/real/campaigns/:id/recipients/:rid/approve',
    summary: 'Approve the exact real draft content for review',
    description: `${policy}Checks campaign/draft revision, registered dependencies and required values. Binds approval to subject, sanitized HTML/text, dependency values and image byte hashes. Relevant source/template/field changes invalidate approval while retaining customized text. Reapproval acknowledges the currently reviewed template version; it never changes suppressed/recheck eligibility or enables sending.`,
    params: recipientParams,
    body: body({ revision, draftRevision: revision }),
    answers: '{ revision, contentApproved:true, sendingEnabled:false }'
  },
  {
    ...shared,
    method: 'GET',
    path: '/api/ops/invitations/real/campaigns/:id/assets/:assetId',
    summary: 'Read an authorized immutable campaign image',
    description: `${policy}Checks current owner/admin membership, campaign/key expiry and asset ownership on every request. Returns validated PNG/JPEG/GIF bytes with no-store, nosniff and inline disposition. Images are not public email URLs; test sends carry them inline (CID).`,
    params: { path: { id: 'Real campaign UUID', assetId: 'Managed image UUID belonging to this campaign' } },
    answers: 'Binary image bytes with the validated image media type'
  },
  {
    ...shared,
    method: 'GET',
    path: '/api/ops/invitations/real/mail-format',
    summary: 'Read how real invitation mail is packaged',
    description: `${policy}One setting for the whole server, read at the moment of every send (test and customer). Defaults follow the spec: oneClickHeader true (List-Unsubscribe and List-Unsubscribe-Post), footer notice, messageIdDomain tracy, html full, openImage true, clickTracking false.`,
    answers:
      '{ oneClickHeader, footer:"notice"|"personal", messageIdDomain:"tracy"|"sender", html:"full"|"simple", openImage, clickTracking }'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/real/mail-format',
    summary: 'Change how real invitation mail is packaged',
    description: `${policy}All six fields are required. oneClickHeader false drops the RFC 8058 headers (the footer link stays); footer personal replaces the centred notice with one plain sentence; messageIdDomain sender puts the Message-ID on the sender's domain; html simple sends only the template body wrapped like a mail client letter; openImage false leaves the estimated-opens image out of customer emails; clickTracking true sends each web link of every real email (test sends too) through /c/<token>/<n>; only customer invitations count in the figures. Audited as mail_format_setting. 400 REAL_INVALID_MAIL_FORMAT for anything else.`,
    body: body({
      oneClickHeader: { type: 'boolean' },
      footer: { ...string, enum: ['notice', 'personal'] },
      messageIdDomain: { ...string, enum: ['tracy', 'sender'] },
      html: { ...string, enum: ['full', 'simple'] },
      openImage: { type: 'boolean' },
      clickTracking: { type: 'boolean' }
    }),
    answers: 'The saved format'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/real/campaigns/:id/approve-group',
    summary: "Approve all: approve one page of a group's current drafts",
    description: `${policy}Up to 50 recipients of the group in id order after cursor, in one campaign write (revision as in other writes). Each current draft a press could approve is approved; already approved ones are counted. Skipped with a code: SUPPRESSED, NO_DRAFT, NEEDS_REVIEW (stale), CUSTOMIZED (edited by hand, left for a person), NO_ACTIVE_PLAN (aMember said so at the last eligibility check), and the press's own refusals without the REAL_ prefix (MISSING_FIELD…). Call again with nextCursor until it is null.`,
    params: pathParams,
    body: body({ group, cursor: { type: ['string', 'null'], format: 'uuid' }, revision }, [
      'group',
      'revision'
    ]),
    answers: '{ approved, already, skipped:{<code>:count}, revision, nextCursor }'
  },
  {
    ...shared,
    method: 'GET',
    path: '/api/ops/invitations/real/campaigns/:id/queue',
    summary: 'Read the send queue of one campaign',
    description: `${policy}state is none, running, paused or done; pauseReason a code; counts {pending, sent, skipped}; items in order with recipientId, state, reason (a code) and sendId. No address.`,
    params: pathParams,
    answers:
      '{ state, pauseReason, startedAt, counts:{pending,sent,skipped}, items:[{recipientId,state,reason,sendId}] }'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/real/campaigns/:id/queue/start',
    summary: 'Queue every approved email whose customer has no invitation yet',
    description: `${policy}Pilot mode only (403 REAL_PILOT_OFF). 409 REAL_QUEUE_RUNNING while one runs, 409 REAL_QUEUE_EMPTY when nothing is left. The cron then sends the next email once a minute when pacing allows, through the same checks as send-invitation: a customer refusal (no active plan, suppressed, already invited, not approved) skips it; aMember not answering makes it wait and ask again on later passes, and pauses it only after 30 minutes without one clear answer; Gmail not answering, the budget reached or sending off pauses the queue at once; every pause the cron makes is told to the ops topic; an unknown Gmail outcome pauses it and is never resent. Body {}.`,
    params: pathParams,
    body: body({}),
    answers: 'The queue, as in GET'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/real/campaigns/:id/queue/pause',
    summary: 'Pause a running send queue',
    description: `${policy}409 REAL_QUEUE_STATE unless running. Body {}.`,
    params: pathParams,
    body: body({}),
    answers: 'The queue, as in GET'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/real/campaigns/:id/queue/resume',
    summary: 'Resume a paused send queue',
    description: `${policy}409 REAL_QUEUE_STATE unless paused. Body {}.`,
    params: pathParams,
    body: body({}),
    answers: 'The queue, as in GET'
  },
  {
    ...shared,
    method: 'GET',
    path: '/api/ops/invitations/real/sending',
    summary: "Read the sending mode, the server test list, the day's use and the pilot budget",
    description: `${policy}Sending is configured on the server only (INVITATIONS_SENDING off|test|pilot, INVITATIONS_TEST_RECIPIENTS, INVITATIONS_TEST_DAILY_LIMIT, INVITATIONS_PILOT_MAX) and reads as off outside local/dev. customersEnabled is true only in pilot mode; pilot without AMEMBER_API_KEY reads as test and lists it in pilotMissing. nextInvitationAt is when the next customer invitation may leave (null = now). opens is the estimated opens of confirmed customer invitations that carry the image, {tracked, opened}, or null when none is measured (never 0%). groups lists, per recipient group of the campaign named by ?campaign=<id>, the confirmed customer invitations sent with their estimated opens and clicks over the ones that carried the image or the tracked links (null when none did); without ?campaign it is empty, because group keys are per campaign. campaignId echoes the campaign asked about, or null.`,
    params: { query: { campaign: 'Real campaign UUID whose per-group numbers to read (optional)' } },
    answers:
      '{ mode, testRecipients, testDailyLimit, testUsed, pilotMax, pilotUsed, nextInvitationAt, mailbox:{status,address,from,send}, customersEnabled, pilotMissing, opens:{tracked,opened}|null, campaignId, groups:[{group,sent,opens:{tracked,opened}|null,clicks:{tracked,clicked}|null}] }'
  },
  {
    ...shared,
    method: 'GET',
    path: '/api/ops/invitations/real/campaigns/:id/eligibility',
    summary: 'Read the stored aMember answers of one campaign',
    description: `${policy}checkable counts recipients that are not suppressed; checked, counts {allow, none, unknown}, oldest and newest describe the stored answers; items lists recipientId, status, reason (a code, for unknown) and checkedAt. No address and no plan detail. An answer informs only: sending asks aMember again.`,
    params: pathParams,
    answers:
      '{ checkable, checked, counts:{allow,none,unknown}, oldest, newest, items:[{recipientId,status,reason,checkedAt}] }'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/real/campaigns/:id/eligibility/check',
    summary: 'Ask aMember check-access for one page of recipients',
    description: `${policy}Reads up to limit (1 to 50, default 50) recipients that are not suppressed, in id order after cursor, under the campaign lock; asks aMember outside it, 4 requests at a time; stores each answer (allow = an active plan, none = no active plan, unknown = no usable answer, with its reason code) replacing any earlier one. 409 REAL_MEMBER_CHECK_OFF without AMEMBER_API_KEY. Sendy is not checked. Call again with nextCursor until it is null.`,
    params: pathParams,
    body: body(
      {
        cursor: { type: ['string', 'null'], format: 'uuid' },
        limit: { type: 'integer', minimum: 1, maximum: 50 }
      },
      []
    ),
    answers: '{ checked, counts:{allow,none,unknown}, nextCursor }'
  },
  {
    ...shared,
    method: 'GET',
    path: '/api/ops/invitations/real/campaigns/:id/sends',
    summary: 'List every send of one campaign, for the Send tab',
    description: `${policy}At most 2000, newest first, test and invitation alike; each row also names its recipientId. Same row shape as the per-recipient list.`,
    params: pathParams,
    answers:
      '{ items:[{id,recipientId,kind,to,subject,state,errorCode,draftRevision,createdAt,updatedAt,gmailMessageId,reconcileAttempts,nextReconcileAt,opens}] }'
  },
  {
    ...shared,
    method: 'GET',
    path: '/api/ops/invitations/real/campaigns/:id/recipients/:rid/sends',
    summary: "List the recent sends of one recipient's draft",
    description: `${policy}At most 20, newest first. kind is test or invitation. opens is {firstAt, count} for an invitation that carries the estimated-opens image, null otherwise (test sends never do). state is sending, sent, failed or send_unknown; sent means Gmail accepted it and returned identifiers, not that it reached an inbox.`,
    params: recipientParams,
    answers:
      '{ items:[{id,kind,to,subject,state,errorCode,draftRevision,createdAt,updatedAt,gmailMessageId,reconcileAttempts,nextReconcileAt,opens}] }'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/real/campaigns/:id/recipients/:rid/send-test',
    summary: "Send the recipient's approved draft to one test address",
    description: `${policy}Refused unless test sending is on (403 REAL_SENDING_OFF), to is on the server test list (403 REAL_SEND_NOT_ALLOWED), the draft revision is current and content-approved (409), the mailbox is connected for sending (409) and the rolling 24-hour test cap is not reached (429). The ledger row is committed before the single Gmail call, which is never retried; no answer leaves send_unknown, checked later by Message-ID and never resent. The same requestKey returns the first row; a different payload under it answers 409. Subject gets the "[Test] " prefix. Every message carries a one-time unsubscribe link and List-Unsubscribe / List-Unsubscribe-Post headers; a suppressed address answers 409 REAL_SUPPRESSED.`,
    params: recipientParams,
    body: body({
      to: { ...string, format: 'email' },
      requestKey: { ...string, minLength: 16, maxLength: 100 },
      draftRevision: { type: 'integer', minimum: 1 }
    }),
    answers: 'The send row, as in the list'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/real/campaigns/:id/recipients/:rid/send-invitation',
    summary: "Send the recipient's approved invitation to that customer (pilot)",
    description: `${policy}Pilot mode only (403 REAL_PILOT_OFF). The address is the recipient's own, never taken from the request. Before any lock, aMember check-access must answer an active plan (409 REAL_NOT_MEMBER; 503 REAL_MEMBERSHIP_UNKNOWN when it cannot answer); a campaign whose audience is past_customers needs only a clear answer, plan or not, and still answers 503 when aMember cannot. Then, under the campaign lock: the draft revision is current and content-approved (409), the recipient and address are not suppressed (409 REAL_SUPPRESSED), the customer has no earlier invitation that did not fail (409 REAL_ALREADY_INVITED), fewer than INVITATIONS_PILOT_MAX invitations exist (409 REAL_PILOT_FULL) and the last one left at least 180 s ago (429 REAL_PILOT_PACING). Same ledger, single Gmail call, no retry and requestKey rules as the test send; no "[Test] " prefix.`,
    params: recipientParams,
    body: body({
      requestKey: { ...string, minLength: 16, maxLength: 100 },
      draftRevision: { type: 'integer', minimum: 1 }
    }),
    answers: 'The send row, as in the list'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/real/campaigns/:id/sends/:sendId/reconcile',
    summary: 'Check Gmail for a send whose outcome is not confirmed',
    description: `${policy}Searches the mailbox by the send's RFC Message-ID. Exactly one match marks it sent; none or a failed search keeps send_unknown (search can lag), several are left unknown for a person. Never sends.`,
    params: { path: { id: 'Real campaign UUID', sendId: 'Send UUID' } },
    answers: 'The send row, as in the list'
  }
]

/** Public unsubscribe doors of real invitation mail; source: src/invitations/real-unsubscribe.js. */
const unsubscribeShared = { audience: ['customer'], auth: 'token', internal: false }
const tokenParams = { path: { token: 'One-time token from the message (43 characters)' } }
INVITATIONS_REAL_ROUTES.push(
  {
    ...unsubscribeShared,
    method: 'GET',
    path: '/invitations/unsubscribe/:token',
    summary: 'Open the unsubscribe link of an invitation email',
    description:
      'The link in the footer of a real invitation or test email. Opening it changes nothing: it answers a page whose form POSTs the same token when the recipient presses its button, and the page runs no script, so a scanner that only reads the link unsubscribes no one. Never reads the session.',
    params: tokenParams,
    answers: 'HTML page'
  },
  {
    ...unsubscribeShared,
    method: 'POST',
    path: '/invitations/unsubscribe/:token',
    summary: 'Unsubscribe from this invitation campaign',
    description:
      'Stops this campaign from emailing the address the token was sent to; Sendy and aMember are not written. Repeating it changes nothing more. Answers the "You are unsubscribed" page; 400 for an unknown token, 500 when it could not be saved.',
    params: tokenParams,
    answers: 'HTML page'
  },
  {
    ...unsubscribeShared,
    method: 'POST',
    path: '/invitations/one-click/:token',
    summary: 'One-click unsubscribe (RFC 8058) from an invitation email',
    description:
      "The List-Unsubscribe header's address, POSTed by the mail provider without a cookie. Same effect as the page. Answers 200 text, 404 for an unknown token.",
    params: tokenParams,
    answers: 'text/plain'
  },
  {
    ...unsubscribeShared,
    method: 'GET',
    path: '/o/:file',
    summary: 'Estimated-opens image of an invitation email',
    description:
      'The 1x1 image at the foot of a customer invitation (`/o/<token>.gif`; test sends carry none). Always answers the same transparent GIF, no-store, with no cookie and no redirect, whatever the token; a known token of a sent invitation records its first load and a capped load count. No IP or user agent is kept. Mail clients and image proxies load images without a person reading, and blocked images hide real reads: the number is an estimate.',
    params: { path: { file: 'One-time open token followed by .gif' } },
    answers: 'image/gif'
  },
  {
    ...unsubscribeShared,
    method: 'GET',
    path: '/c/:token/:n',
    summary: 'Estimated-clicks link of an invitation email',
    description:
      "With clickTracking on (mail-format), each web link of a real invitation email (a test send too, which is never counted in the figures) points here. Answers 302 to the n-th link as written in that letter, read from the send's sealed record and never from the request, no-store, no cookie; an unknown token, place, or expired campaign answers 404 with a page and no redirect. A press records the first click and a capped count (and counts as an open), unless it comes within two minutes of sending or from a robot's user agent, which mail scanners do. No IP or user agent is kept: the number is an estimate.",
    params: {
      path: { token: 'One-time click token of the send', n: 'Place of the link in the letter, 0 to 49' }
    },
    answers: '302 redirect'
  }
)
