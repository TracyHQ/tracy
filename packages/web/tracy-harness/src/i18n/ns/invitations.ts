/** The synthetic sandbox screens of Campaigns › Invitations and the shared email HTML preview. */
export const NS = 'invitations'

/** Files whose visible words belong to this namespace (paths under `src/`; the gate scans them). */
export const SCREENS = [
  'invitations/Invitations.tsx',
  'invitations/ContentPanel.tsx',
  'invitations/EmailPanels.tsx',
  'invitations/HtmlPreview.tsx',
  'invitations/api.ts',
  'invitations/content-state.ts',
  'invitations/review-state.ts'
] as const

export const en = {
  'invitations.mode.sandbox': 'Synthetic sandbox',
  'invitations.mode.real': 'Real campaigns',

  'invitations.tab.overview': 'Overview',
  'invitations.tab.import': 'Import',
  'invitations.tab.recipients': 'Recipients',
  'invitations.tab.content': 'Content / Templates',
  'invitations.tab.review': 'Review emails',
  'invitations.tab.conversations': 'Conversations',
  'invitations.tab.activity': 'Activity',
  'invitations.tab.setup': 'Setup',

  'invitations.page.title': 'Invitations',
  'invitations.page.subtitle': 'Create, review and test campaign invitations in Ops.',
  'invitations.page.refresh': 'Refresh',
  'invitations.page.sandboxNotice': 'Simulated messages stay in Tracy. No email leaves this sandbox.',
  'invitations.page.sandboxHint':
    'Use the generated sample CSV. Customer imports and live sending are unavailable.',
  'invitations.page.errorBanner':
    '{error}. Your unsaved text is kept. If the revision changed, copy your edits before refreshing.',
  'invitations.page.loading': 'Loading invitations…',
  'invitations.page.disabled': 'Invitations sandbox is not enabled on this deployment.',
  'invitations.page.readOnly': 'Aggregate access only. An Ops owner or admin can manage sandbox contacts.',
  'invitations.page.campaignsLabel': 'Campaigns',
  'invitations.page.viewsLabel': 'Invitation views',
  'invitations.page.steps':
    '1. Import recipients → 2. Content / Templates → 3. Review emails → 4. Run sandbox → 5. Conversations',
  'invitations.page.empty': 'Create a campaign or select one above to begin.',
  'invitations.page.confirmDiscard': 'Discard your unsaved changes? They have not been saved to Tracy.',

  'invitations.request.failed': 'Request failed',
  'invitations.request.failedStatus': 'Request failed ({status})',

  'invitations.notice.gmailVerified': 'Gmail connection verified.',
  'invitations.notice.gmailResult': 'Gmail connection: {result}.',
  'invitations.notice.saved': 'Saved to the sandbox database.',
  'invitations.notice.notSaved': 'Changes were not saved. Review the error above; your edits are still here.',
  'invitations.notice.disconnected': 'Disconnected and Google token revoked.',
  'invitations.notice.disconnectedLocally': 'Disconnected locally. Google token revocation: {result}.',

  'invitations.campaign.fallbackName': 'Campaign',
  'invitations.campaign.idLabel': 'Campaign {id}',
  'invitations.campaign.nameLabel': 'Campaign name',
  'invitations.campaign.create': 'Create campaign',
  'invitations.campaign.revision': 'Revision {revision}',
  'invitations.campaign.overviewHint':
    'Sandbox runs can use a small sample. A real pilot still requires 100 eligible recipients and the main campaign waits at least 48 hours.',

  'invitations.setup.gmailTitle': 'Gmail mailbox',
  'invitations.setup.requiredMailbox': 'Required mailbox: {mailbox} · From: {sender}',
  'invitations.setup.address': 'Authenticated address: {address}',
  'invitations.setup.notVerified': 'Not verified',
  'invitations.setup.access': 'Read: {read} · Send: {send}',
  'invitations.setup.verified': 'Verified',
  'invitations.setup.blocked': 'Blocked',
  'invitations.setup.generation': 'Connection generation: {generation} · Last verified: {when}',
  'invitations.setup.lastSync': 'Last successful sync: {when}',
  'invitations.setup.never': 'Never',
  'invitations.setup.connectionError': 'Connection error: {code}',
  'invitations.setup.reconnect': 'Reconnect Gmail',
  'invitations.setup.connect': 'Connect Gmail',
  'invitations.setup.disconnect': 'Disconnect',
  'invitations.setup.notConfigured':
    'OAuth client and dedicated encryption key must be configured on this deployment.',
  'invitations.setup.redirectUri': 'OAuth redirect URI: {uri}',
  'invitations.setup.ownerManages': 'An Ops owner or admin manages this mailbox.',
  'invitations.setup.connectingNote':
    'Connecting verifies identity and permissions. It does not enable live sending or complete a send test.',
  'invitations.setup.sourcesTitle': 'Data sources',
  'invitations.setup.notConnected': 'Not connected for invitations',
  'invitations.setup.sourcesNote':
    'Membership, opt-out and complaint coverage have not been verified. Missing facts remain Unknown and block live eligibility.',
  'invitations.setup.readinessTitle': 'Operational readiness',
  'invitations.setup.readinessBlocked':
    'Blocked: postal footer, account tier and budget, internal seed test, sender policy, live source coverage and marketing evidence require verification.',
  'invitations.setup.quotaNote':
    'No precise remaining Gmail quota is available here. Sandbox runs remain simulated.',

  'invitations.import.title': 'Import recipients — not email templates',
  'invitations.import.csvPurpose':
    'CSV is for the recipient list. Write or paste your email templates directly in Content / Templates.',
  'invitations.import.limits':
    'Synthetic CSV only, up to 200 records and 512 KiB. Preview does not enable sending. Unknown or conflicting records require review.',
  'invitations.import.localOnly':
    'On local only, a Sarah baseline CSV with up to 20 records can be inspected without saving. Columns are detected automatically. Customer commit and sending remain unavailable.',
  'invitations.import.useSample': 'Use sample CSV',
  'invitations.import.chooseFile': 'Or choose a synthetic CSV',
  'invitations.import.tooLarge':
    'File exceeds the 512 KiB sandbox limit. Choose a synthetic CSV with up to 200 records, or use the sample CSV. Customer CSV imports are unavailable.',
  'invitations.import.unreadable':
    'Could not read this file. Choose another synthetic CSV or use the sample CSV.',
  'invitations.import.csvContent': 'CSV content',
  'invitations.import.preview': 'Preview import',
  'invitations.import.localInspection':
    'Local inspection only. No customer records were saved. Eligibility has not been checked.',
  'invitations.import.mapping': 'Detected mapping: {mapping}',
  'invitations.import.ignored': 'Ignored columns: {columns}',
  'invitations.import.digest': 'Preview digest: {digest}',
  'invitations.import.issue': 'Row {row}: {code}',
  'invitations.import.commit': 'Commit preview',

  'invitations.list.hintConversations': 'Only recipients with recorded sandbox messages appear here.',
  'invitations.list.hintReview': 'Select an email to customize and approve its exact saved version.',
  'invitations.list.hintRecipients': 'Your imported recipients. Email templates are managed separately.',
  'invitations.list.openTemplates': 'Open templates',
  'invitations.list.runSandbox': 'Run sandbox',
  'invitations.list.runHint':
    'Processes all eligible approved emails in this campaign, not just the filtered list. No real email is sent.',
  'invitations.list.group': 'Group',
  'invitations.list.allGroups': 'All groups',
  'invitations.list.status': 'Status',
  'invitations.list.allStatuses': 'All statuses',
  'invitations.list.needsApproval': 'Needs approval',
  'invitations.list.approved': 'Approved',
  'invitations.list.suppressed': 'Suppressed',
  'invitations.list.simulated': 'Simulated',
  'invitations.list.find': 'Find recipient',
  'invitations.list.searchPlaceholder': 'Search email',
  'invitations.list.count_one': '{visible} of {count} recipient',
  'invitations.list.count_other': '{visible} of {count} recipients',
  'invitations.list.saveBeforeSearch': 'Save or discard changes before searching.',
  'invitations.list.recipient': 'Recipient',
  'invitations.list.draft': 'Draft',
  'invitations.list.open': 'Open',
  'invitations.list.approvedSnapshot': 'Approved snapshot',
  'invitations.list.noDraft': 'No draft',
  'invitations.list.emptyConversations':
    'No conversations match. After running the sandbox, simulated invitation messages appear here.',
  'invitations.list.emptyReview':
    'No emails match. Create drafts in Content / Templates or change your filters.',
  'invitations.list.emptyRecipients':
    'No recipients match. Import a synthetic recipient CSV or change your filters.',
  'invitations.list.selectHint': 'Select a recipient on the left to see the details here.',

  'invitations.activity.title': 'Audit activity',
  'invitations.activity.empty': 'No activity yet.',

  'invitations.reason.busy': 'An operation is in progress.',
  'invitations.reason.ownerRequired': 'An Ops owner or admin is required.',
  'invitations.reason.readOnly': 'You have read-only access.',
  'invitations.reason.noChanges': 'No changes to save.',
  'invitations.reason.unsaved': 'Unsaved changes',
  'invitations.reason.subject': 'Subject',

  'invitations.review.blockedSuppressed':
    'Recipient is suppressed or unsubscribed. Editing and approval are blocked.',
  'invitations.review.blockedAttempted':
    'This email already has a send attempt. Its saved content is read-only.',
  'invitations.review.blockedNoDraft': 'Create an eligible draft in Content / Templates first.',
  'invitations.review.invalidEmpty': 'Enter both a subject and email body.',
  'invitations.review.invalidSubject': 'Subject must be a single line without control characters.',
  'invitations.review.invalidLength': 'Subject or body exceeds the allowed length.',
  'invitations.review.saveFirst': 'Save your changes before approval.',
  'invitations.review.alreadyApproved': 'This exact version is already approved.',
  'invitations.review.simulateDirty': 'Save or discard your changes before running the sandbox.',
  'invitations.review.simulateNoApproved': 'Approve at least one eligible draft first.',
  'invitations.review.templateVersion': 'Template v{version}',
  'invitations.review.noTemplateVersion': 'Existing draft — no template version recorded',
  'invitations.review.emailRevision': 'Email revision {revision}',
  'invitations.review.body': 'Email body',
  'invitations.review.customizeNote':
    'Customize this email only. Saving changes removes its previous approval; other recipients and the group template stay unchanged.',
  'invitations.review.save': 'Save draft',
  'invitations.review.saveHint': 'Save a new revision of this email.',
  'invitations.review.approve': 'Approve snapshot',
  'invitations.review.approveHint': 'Approve exactly the saved content shown here. This does not send it.',
  'invitations.review.noDraft': 'No draft yet. Open Content / Templates to create one.',

  'invitations.conversation.writeFirst': 'Write a test message first.',
  'invitations.conversation.replySuppressed': 'Recipient is suppressed or unsubscribed. Replies are blocked.',
  'invitations.conversation.replyNeedsSimulation': 'Simulate an approved invitation before testing a reply.',
  'invitations.conversation.note': 'Sandbox conversation · No Gmail messages are sent or synced here.',
  'invitations.conversation.received': 'Received (simulated)',
  'invitations.conversation.sent': 'Sent (simulated)',
  'invitations.conversation.compose': 'Compose a test message',
  'invitations.conversation.placeholder': 'Synthetic reply, or STOP to test suppression',
  'invitations.conversation.simulateInbound': 'Simulate inbound',
  'invitations.conversation.inboundHint': 'Add a fictional customer message. STOP blocks future sending.',
  'invitations.conversation.simulateReply': 'Simulate reply',
  'invitations.conversation.replyHint': 'Save an outbound reply in this sandbox conversation.',

  'invitations.content.noGroups': 'No template groups are available.',
  'invitations.content.intro':
    'Synthetic sandbox content only. Use fictional names and plain text; do not enter customer data or real links. Saving a template creates a new version. Existing recipient drafts stay as they are.',
  'invitations.content.groupsLabel': 'Template groups',
  'invitations.content.confirmChangeGroup': 'Discard unsaved template changes and change group?',
  'invitations.content.noTemplate': 'No template',
  'invitations.content.groupRecipients_one': '{count} recipient',
  'invitations.content.groupRecipients_other': '{count} recipients',
  'invitations.content.groupDrafts_one': '{count} draft',
  'invitations.content.groupDrafts_other': '{count} drafts',
  'invitations.content.groupApproved_one': '{count} approved',
  'invitations.content.groupApproved_other': '{count} approved',
  'invitations.content.fixFields': 'Correct the highlighted fields before saving.',
  'invitations.content.noDiscard': 'No changes to discard.',
  'invitations.content.saveBeforeGenerate': 'Save or discard your changes before generating drafts.',
  'invitations.content.saveTemplateFirst': 'Save a template first.',
  'invitations.content.actionFailed': 'The action could not be completed. Your edits are kept.',
  'invitations.content.savedVersion': 'Saved version {version}',
  'invitations.content.newTemplate': 'New template',
  'invitations.content.body': 'Plain text body',
  'invitations.content.tokens':
    'Supported tokens: {firstName} and {group}. Preview uses the saved version and a recipient from this group.',
  'invitations.content.saved': 'Template saved as a new version. Existing drafts were not changed.',
  'invitations.content.saveVersion': 'Save new version',
  'invitations.content.discard': 'Discard changes',
  'invitations.content.previewLabel': 'Template preview',
  'invitations.content.previewRecipient': 'Preview recipient',
  'invitations.content.chooseRecipient': 'Choose a recipient',
  'invitations.content.noFirstName': 'No first name',
  'invitations.content.previewGroupMismatch': 'The preview returned a different group. Please try again.',
  'invitations.content.previewStale':
    'The template changed while previewing. Refresh the campaign and preview again.',
  'invitations.content.previewSaved': 'Preview saved template',
  'invitations.content.previewNeedsRecipients': 'Import recipients in this group to preview.',
  'invitations.content.previewNeedsSave': 'Save or discard changes before previewing.',
  'invitations.content.previewNeedsTemplate': 'Save a template before previewing.',
  'invitations.content.previewChoose': 'Choose a recipient from this group.',
  'invitations.content.previewHeader': 'Saved template v{version} · Plain text preview',

  'invitations.template.subjectRequired': 'Enter a subject.',
  'invitations.template.bodyRequired': 'Enter a plain text body.',
  'invitations.template.tokensOnly': 'Only {firstName} and {group} are supported.',
  'invitations.template.syntheticOnly':
    'Use synthetic addresses ending in .test or .invalid and links on invitations.invalid only.',
  'invitations.template.subjectOneLine': 'The subject must be one line without control characters.',
  'invitations.template.subjectMax': 'Use no more than 200 characters.',
  'invitations.template.bodyMax': 'Use no more than 16000 characters.',

  'invitations.generate.title': 'Generate drafts',
  'invitations.generate.thisGroup': 'This group: {missing}; {kept}; {blocked}.',
  'invitations.generate.missing_one': '{count} missing draft to create from {source}',
  'invitations.generate.missing_other': '{count} missing drafts to create from {source}',
  'invitations.generate.kept_one': '{count} existing draft kept',
  'invitations.generate.kept_other': '{count} existing drafts kept',
  'invitations.generate.blocked_one': '{count} recipient blocked from generation',
  'invitations.generate.blocked_other': '{count} recipients blocked from generation',
  'invitations.generate.noSavedTemplate': 'no saved template',
  'invitations.generate.missingButton': 'Generate missing drafts',
  'invitations.generate.allButton': 'Generate all groups',
  'invitations.generate.noneMissing': 'No eligible recipients are missing a draft in this group.',
  'invitations.generate.allGroups_one': 'All groups: {count} missing draft.',
  'invitations.generate.allGroups_other': 'All groups: {count} missing drafts.',
  'invitations.generate.groupLine': '{group}: {count} from {source}',
  'invitations.generate.noTemplateInline': 'no template',
  'invitations.generate.needAllTemplates':
    'Save templates for every group with missing drafts before generating all groups.',
  'invitations.generate.regenerate': 'Regenerate existing drafts…',

  'invitations.replace.question':
    'Replace {existing} in this group with template v{version}, and create {missing}?',
  'invitations.replace.existing_one': '{count} existing draft',
  'invitations.replace.existing_other': '{count} existing drafts',
  'invitations.replace.missing_one': '{count} missing draft',
  'invitations.replace.missing_other': '{count} missing drafts',
  'invitations.replace.approvals_one': '{count} approval will be cleared.',
  'invitations.replace.approvals_other': '{count} approvals will be cleared.',
  'invitations.replace.editsReplaced': 'Individual edits will be replaced and must be reviewed again.',
  'invitations.replace.versions': 'Current template versions: {versions}.',
  'invitations.replace.notRecorded': 'Not recorded',
  'invitations.replace.excluded_one': '{count} blocked recipient is excluded.',
  'invitations.replace.excluded_other': '{count} blocked recipients are excluded.',
  'invitations.replace.confirm': 'Confirm regeneration',
  'invitations.replace.cancel': 'Cancel',

  'invitations.htmlPreview.desktop': 'Desktop',
  'invitations.htmlPreview.mobile': 'Mobile',
  'invitations.htmlPreview.note':
    'Isolated preview. Links are inactive. Only managed images load; email clients may display differently.',
  'invitations.htmlPreview.frameTitle': 'Email HTML preview',
  'invitations.htmlPreview.unavailable': 'Preview unavailable.',
  'invitations.htmlPreview.preparing': 'Preparing private preview…'
} as const

export type InvitationsKey = keyof typeof en
