/**
 * /ops › Mail: site mail after go-live. The operator's controls and statuses are translated; what
 * the door and the provider send (addresses, subjects, results, error text, codes) is shown as sent.
 */
export const NS = 'mail'

/** Files whose visible words belong to this namespace (paths under `src/`; the gate scans them). */
export const SCREENS = ['Mail.tsx', 'mail-api.ts'] as const

export const en = {
  'mail.title': 'Mail',
  'mail.lead':
    'Mail sent by customer sites after go-live: contact forms, orders, password resets. Drafts never send. A site’s admin picks how it sends from My Sites; limits are set here.',

  'mail.mode.tracy': 'Tracy',
  'mail.mode.tracyDomain': 'Own domain',
  'mail.mode.ownSmtp': 'Own SMTP',
  'mail.mode.ownCms': 'CMS settings',
  'mail.mode.off': 'Off',
  'mail.relay.off': 'Off',
  'mail.relay.log': 'Log only: nothing is sent',
  'mail.relay.smtp': 'Sending',

  'mail.refusal.noAnswer': 'The mail door did not answer.',
  'mail.refusal.signedOut': 'Signed out. Sign in again to read site mail.',
  'mail.refusal.forbidden': 'This account is not Tracy staff, or may not change mail settings.',
  'mail.refusal.noDoor': 'This deployment has no site-mail door yet.',
  'mail.refusal.code': 'Refused: {code}',
  'mail.refusal.status': 'Refused (HTTP {status}).',
  'mail.refusal.SITE_MAIL_DOMAIN_LIMIT': 'Tracy’s mail plan has no room for another domain right now.',
  'mail.refusal.SITE_MAIL_DOMAIN_UNAVAILABLE': 'The Resend key cannot manage domains (it needs full access).',
  'mail.refusal.SITE_MAIL_UPSTREAM': 'Resend did not answer. Try again in a minute.',

  'mail.off':
    'Site mail is off for this deployment (<code>SITE_MAIL=off</code>). Every site’s mail is refused before it reaches the provider; the settings below take effect once it is switched on.',
  'mail.stat.siteMail': 'Site mail',
  'mail.stat.sendingDomain': 'Sending domain',
  'mail.stat.notSet': 'Not set',
  'mail.stat.sentToday': 'Sent today, all sites',
  'mail.stat.slots': 'Own-domain slots on Resend',
  'mail.stat.of': '{used} of {limit}',
  'mail.stat.slotsFull': 'Full: a site asking for its own domain is refused until one is released.',
  'mail.stat.slotsCount': 'Counts Tracy’s own sending domains.',

  'mail.sites.title': 'Sites',
  'mail.sites.limits':
    'Hourly and daily limits apply to the two Tracy modes. An empty limit means the deployment default.',
  'mail.sites.releaseAfter': 'An own domain Tracy added and nobody verified is released after {days} days.',
  'mail.sites.readOnly': 'Read-only for this account.',
  'mail.sites.empty': 'No site has mail settings to show yet.',
  'mail.col.site': 'Site',
  'mail.col.mode': 'Mode',
  'mail.col.from': 'From',
  'mail.col.sentToday': 'Sent today',
  'mail.col.hourly': 'Hourly',
  'mail.col.daily': 'Daily',
  'mail.col.domain': 'Domain',
  'mail.col.lastError': 'Last error',
  'mail.col.edit': 'Edit',

  'mail.limit.hourly': 'Hourly limit for {site}',
  'mail.limit.daily': 'Daily limit for {site}',
  'mail.limit.placeholder': 'default',
  'mail.modeFor': 'Mode for {site}',
  'mail.domain.released': 'Released {when}',
  'mail.domain.waiting': 'Waiting since {when}',
  'mail.domain.releaseAt': 'Released {when} if unverified',
  'mail.domain.notOurs': 'Not added by Tracy: never deleted',
  'mail.domain.releasing': 'Releasing…',
  'mail.domain.confirmRelease': 'Yes, free it up',
  'mail.domain.release': 'Free up domain',
  'mail.cancel': 'Cancel',
  'mail.save': 'Save',
  'mail.saving': 'Saving…',
  'mail.edit': 'Edit',
  'mail.editNotAllowed': 'Only an owner or admin of Tracy staff can change this',

  'mail.log.title': 'Recent mail',
  'mail.log.lead': 'The last {limit} messages, newest first.',
  'mail.log.filter': 'Filter by site',
  'mail.log.allSites': 'All sites',
  'mail.log.reload': 'Read the log again',
  'mail.log.empty': 'No mail logged yet.',
  'mail.log.emptySite': 'No mail logged for this site yet.',
  'mail.log.when': 'When',
  'mail.log.site': 'Site',
  'mail.log.result': 'Result',
  'mail.log.to': 'To',
  'mail.log.subject': 'Subject',
  'mail.log.error': 'Error'
} as const
