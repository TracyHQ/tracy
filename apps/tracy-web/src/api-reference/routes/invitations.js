/** Internal synthetic sandbox routes; source: src/invitations/route.js. */
const revision = {
  type: 'integer',
  minimum: 0,
  description: 'Current campaign revision; a stale value answers 409'
}
const string = { type: 'string' }
const group = { ...string, enum: ['group_1', 'group_2', 'group_3', 'group_4', 'group_5'] }
const shared = {
  audience: ['team'],
  auth: 'admin',
  internal: true
}
const policy =
  'Default off. Requires INVITATIONS_SANDBOX_ENABLED=1 and an explicitly matching local/dev deployment origin. Requires an accepted Tracy staff seat. Contact details and every write require owner/admin. Sandbox campaign writes require same-origin JSON of at most 1 MiB. Gmail OAuth Setup is separate and optional; aMember/Sendy and real email delivery remain unavailable. '
const pathParams = { path: { id: 'Sandbox campaign UUID' } }
const recipientParams = { path: { id: 'Sandbox campaign UUID', rid: 'Sandbox recipient UUID' } }
const body = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required })
/** @type {import('./index.js').RouteDoc[]} */
export const INVITATIONS_ROUTES = [
  {
    ...shared,
    method: 'GET',
    path: '/api/ops/invitations/gmail',
    summary: 'Read Invitations Gmail connection health',
    description: `${policy}Owner/admin only. Never returns credentials; sender remains disabled even when a mailbox is connected.`,
    answers:
      '{ status, configured, address, from, read, send, generation, lastVerifiedAt, lastSyncAt, errorCode, redirectUri, sendingEnabled:false }'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/gmail/connect',
    summary: 'Start dedicated Gmail OAuth for Invitations',
    description: `${policy}Owner/admin and same Origin required. Creates a single-use session-bound state and PKCE challenge; increments connection generation before redirect. Requires all five INVITATIONS_GMAIL_* settings.`,
    answers: '{ authorizationUrl, generation }'
  },
  {
    ...shared,
    method: 'GET',
    path: '/api/ops/invitations/gmail/callback',
    summary: 'Complete dedicated Gmail OAuth callback',
    description: `${policy}Checks state, session, expiry, generation, granted read/send scopes and that the Gmail profile is the INVITATIONS_GMAIL_ADDRESS mailbox. Redirects to Invitations Setup with a fixed result code.`,
    answers: '303 to /ops/invitations?gmail=<result>'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/gmail/disconnect',
    summary: 'Disconnect Invitations Gmail mailbox',
    description: `${policy}Owner/admin and same Origin required. Fences the prior generation and removes local credentials before attempting provider revocation; reports revocation separately.`,
    answers: 'Connection health plus revocation result'
  },
  {
    ...shared,
    method: 'GET',
    path: '/api/ops/invitations',
    summary: 'Read the Invitations sandbox overview',
    description: `${policy}Developers receive aggregate campaign counts without names or contacts. Signed out answers 401; outsiders receive a bare 403. When disabled, authenticated staff receive enabled:false and empty groups/campaigns; other sandbox endpoints answer 404.`,
    answers: '{ enabled, mode: "sandbox", integrations, groups, campaigns, writable }'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations',
    summary: 'Create a synthetic sandbox campaign',
    description: `${policy}Persists an empty campaign at revision 0. Names must be fictional; live email addresses and live URLs are rejected.`,
    body: body({ name: { ...string, maxLength: 120 } }),
    answers: '201 with campaign detail, recipients, audit and counts'
  },
  {
    ...shared,
    method: 'GET',
    path: '/api/ops/invitations/:id',
    summary: 'Read a sandbox campaign and its conversation records',
    description: `${policy}Owner/admin only. Includes optional content entries {group, activeVersion, versions:[{version, subject, bodyText, createdAt}]}, draft hashes and approvals, exact simulated attempt snapshots, inbound/outbound fixture messages, audit and counts. Generated drafts retain templateGroup/templateVersion provenance.`,
    params: pathParams,
    answers: '{ id, name, revision, content?, recipients, audit, counts }'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/:id/source-check',
    summary: 'Enable synthetic source checks on an empty new campaign',
    description: `${policy}Owner/admin only. Requires revision 0 and no recipients or content. Irreversible opt-in to server-owned synthetic namespace and policy; at most 100 enrolled campaigns per scope. A stale revision, existing content or exhausted scope answers 409. No source URL, facts, clock or policy may be supplied.`,
    params: pathParams,
    body: body({ revision, fixtureSetId: { ...string, enum: ['foundation-v1'] } }),
    answers: 'Campaign detail with sourceCheck and the advanced revision'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/:id/sources/sync',
    summary: 'Synchronize an allowlisted synthetic source fixture',
    description: `${policy}Owner/admin only; source mode required. Accepts only revision, a server-allowlisted fixtureId and requestKey. Idempotency binds actor, campaign and input. Commits versioned pages atomically, replays changes from the snapshot fence before marking complete, and invalidates affected approvals without rewriting customized text or attempts. Partial, failed, unknown or expired sources cannot make recipients ready. No live adapter or mailbox is called.`,
    params: pathParams,
    body: body({ revision, fixtureId: string, requestKey: string }),
    answers:
      '{ runId, status, scope, campaignRevision }; read campaign detail for readiness and approvalStatus'
  },
  {
    ...shared,
    method: 'GET',
    path: '/api/ops/invitations/:id/sources',
    summary: 'Read bounded synthetic source health and decisions',
    description: `${policy}Source mode required. Developer seats receive only counts, reasons and status. Owner/admin additionally receive the scope view and at most 200 decisions and 200 invalidations. Reads under the same program lock as source writes; no credentials or raw customer snapshot is returned.`,
    params: pathParams,
    answers: '{ counts, reasons, status, scope?, decisions?, invalidations? }'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/:id/preview',
    summary: 'Preview a bounded synthetic CSV import',
    description: `${policy}Canonical headers are email, source_member_id, group_key, first_name, global_unsubscribed and internal. At most 200 rows, reserved .test/.invalid email domains, constrained sandbox- member IDs and group_1 through group_5. Supplied names become Sandbox Friend. Persists an actor-bound synthetic preview for 30 minutes without changing campaign revision. On explicit local HTTP localhost/127.0.0.1/tracy.test only, the legacy member-export headers user_id and nhom_gui select a read-only inspection capped at 20 rows. It detects allowlisted mappings, ignores unused fields and preserves unknown/negative flags. Returns readOnly:true, eligibleNow:null and no commit ID; no customer payload or preview is stored. This inspection is forbidden on dev.`,
    params: pathParams,
    body: body({ revision, csv: string }),
    answers: '{ id?, digest, counts, candidates, issues, readOnly?, mapping?, ignoredColumns?, eligibleNow? }'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/:id/commit',
    summary: 'Commit an actor-bound sandbox preview',
    description: `${policy}Checks campaign revision, preview ownership, expiry and digest atomically. Commits recipients and advances revision. Repeating the same actor-bound committed preview, original revision and digest returns its stored result without another mutation; changed values answer 409.`,
    params: pathParams,
    body: body({ revision, previewId: { ...string, format: 'uuid' }, digest: string }),
    answers: 'Campaign detail at the committed revision'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/:id/content',
    summary: 'Save a version of a group invitation template',
    description: `${policy}Appends an immutable template version and assigns it as the group's activeVersion. Existing drafts, approvals and attempt snapshots are unchanged. Subject and body are fictional plain text; only {{first_name}} and {{group}} tokens are accepted. Unknown tokens, malformed braces, subject controls, live email addresses and live URLs are rejected. Advances campaign revision and records audit.`,
    params: pathParams,
    body: body({
      revision,
      group,
      subject: { ...string, minLength: 1, maxLength: 200 },
      bodyText: { ...string, minLength: 1, maxLength: 16000 }
    }),
    answers: 'Updated campaign detail with group content and its complete version history'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/:id/content-preview',
    summary: 'Preview the saved group template for a synthetic recipient',
    description: `${policy}Reads the group's active template and renders plain text through the same renderer as draft generation. The recipient must belong to that group. Rechecks the current campaign revision, token syntax, subject controls, text bounds and synthetic-only rendered values. Missing content answers 409 template_required. Does not write drafts, audit or campaign revision.`,
    params: pathParams,
    body: body({ revision, group, recipientId: { ...string, format: 'uuid' } }),
    answers: '{ subject, bodyText, templateVersion, group }'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/:id/generate',
    summary: 'Generate fictional invitation drafts',
    description: `${policy}Generates missing drafts from each group's saved active template, in one group when group is supplied or across all groups when omitted. Existing drafts are preserved by default. Explicit replaceExisting:true replaces only ready/draft recipients with no attempts, increments their draft revision and clears approval. Generated drafts record templateGroup/templateVersion. Other states and every attempt snapshot remain untouched. Rechecks program-wide identity suppression: stopped ready/draft recipients are marked suppressed and their approval cleared without replacing saved content. Missing content for any recipient to be generated answers 409 template_required and commits nothing. No built-in template is substituted and no real marketing eligibility is established.`,
    params: pathParams,
    body: body({ revision, group, replaceExisting: { type: 'boolean', default: false } }, ['revision']),
    answers: 'Updated campaign detail'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/:id/recipients/:rid/draft',
    summary: 'Edit a fictional recipient draft',
    description: `${policy}Increments the draft revision, recomputes contentHash and clears approval while retaining templateGroup/templateVersion provenance. Only ready/draft recipients without attempts may be edited; program-wide identity suppression is rechecked and blocked recipients answer 409 recipient_blocked. Rejects subject controls, live email addresses and live URLs. Operators must enter fictional free text.`,
    params: recipientParams,
    body: body({
      revision,
      subject: { ...string, maxLength: 200 },
      bodyText: { ...string, maxLength: 16000 }
    }),
    answers: 'Updated campaign detail'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/:id/recipients/:rid/approve',
    summary: 'Approve the current sandbox draft hash',
    description: `${policy}Binds approval to the current draft hash and revision with the approving actor and timestamp. Rechecks program-wide identity suppression and rejects blocked states or recipients with attempts as 409 recipient_blocked. Stale content hashes answer 409. In source mode, readiness is checked using the database clock after the program lock; approval additionally binds destination, identity, dependency fingerprint, policy and validation deadline. Relevant source changes or an expired validation gap invalidate it permanently until explicit reapproval.`,
    params: recipientParams,
    body: body({ revision, contentHash: string }),
    answers: 'Updated campaign detail'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/:id/simulate',
    summary: 'Persist simulated invitations from approved snapshots',
    description: `${policy}Uses exact approved drafts and checks late STOP suppression. A program-wide lock, email uniqueness and persistent identity alias graph prevent repeat invitations across campaigns. In source mode, preflights every previously approved unattempted draft against current readiness and effective approval; any stale or blocked draft answers 409 before any attempt is written. Persists simulated attempts and outbound messages; performs no provider call.`,
    params: pathParams,
    body: body({ revision }),
    answers: 'Updated campaign detail with simulated attempts and messages'
  },
  {
    ...shared,
    method: 'POST',
    path: '/api/ops/invitations/:id/recipients/:rid/message',
    summary: 'Record a fictional inbound message or simulated reply',
    description: `${policy}Outbound replies require a prior simulated invitation, existing conversation and no suppression. An inbound STOP suppresses the program identity graph and blocks future invitations and replies. At most 200 messages per recipient. Advances campaign revision and records audit.`,
    params: recipientParams,
    body: body({
      revision,
      bodyText: { ...string, maxLength: 16000 },
      direction: { type: 'string', enum: ['inbound', 'outbound'] }
    }),
    answers: 'Updated campaign detail'
  }
]
