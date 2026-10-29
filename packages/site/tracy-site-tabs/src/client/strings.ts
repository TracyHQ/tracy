/**
 * English baseline for the `tracy-site-tabs` namespace.
 *
 * This package OWNS the namespace: it ships `en` here and nothing else. Vietnamese arrives from
 * `@tracy/dsh-tracy-locale-vi`, which registers `(namespace, locale)` pairs separately —
 * `ctx.locale.register` throws on a duplicate pair, so exactly one place may ship each.
 *
 * The team strings moved here from `tracy-my-sites` on 04/09, together with the book: the Team
 * tab is where the roster, the dialogs and the invite wizard live now.
 */

/**
 * The namespace this package owns.
 *
 * 🔒 IT LIVES HERE, beside `en`. `check-dsh-locale` finds owners by reading the exported `NS` of
 * each `strings.ts`; declaring it inside `index.tsx` instead makes the namespace invisible to the
 * gate, which then cannot notice a missing translation.
 */
export const NS = 'tracy-site-tabs'

export const en = {
  'tab.settings': 'Site settings',
  /** The site's Publish tab: its address, Publish / Back to draft, its own domain. */
  'tab.publish': 'Publish',
  'settings.siteUrl': 'Site URL',
  'settings.url.change': 'Change',
  'settings.url.name': 'New site address',
  'settings.url.help':
    'Enter a hostname, such as your-name.{domain}, or a domain you own. Do not include https:// or a path.',
  'settings.url.check': 'Check availability',
  'settings.url.checking': 'Checking…',
  'settings.url.save': 'Save',
  'settings.url.saving': 'Saving…',
  'settings.url.available': 'This address is available.',
  'settings.url.customAvailable': 'This domain is available. Save it to see the DNS records to add.',
  'settings.url.invalid': 'Enter a valid site hostname that follows the existing site address rules.',
  'settings.url.taken': 'This address is already in use. Choose another.',
  'settings.url.ownerOnly': 'Only the site Owner can change its address. Ask the Owner to change it.',
  'settings.url.busy': 'Another address change is in progress. Try again shortly.',
  'settings.url.applyFailed':
    'The address change could not be applied. Reload to check the current address before retrying.',
  'settings.url.wpAddressConstant':
    'This WordPress site sets its address in wp-config.php (WP_HOME / WP_SITEURL) in a way Tracy cannot change automatically. Edit or remove those lines, or ask your administrator, then try again.',
  'settings.url.probeFailed':
    'The new address could not be verified. Reload to check the current address before retrying.',
  'settings.url.rollbackFailed':
    'The address change needs support. Reload to check the current address and contact your administrator.',
  'settings.url.failed': 'Could not complete this request. Check the current address before retrying.',
  // Refusals the address door names that used to fall to the line above (#796).
  'settings.url.siteUnknown': 'Tracy no longer has this site. Open My Sites to see the sites you have.',
  'settings.url.notReady':
    'This site is still being set up, so its address cannot change yet. Try again when the site is ready.',
  'settings.url.notReserved':
    'This domain is no longer waiting to be checked. Enter the address again and save it to start over.',
  'settings.url.signedOut': 'You have been signed out. Reload the page to sign in, then try again.',
  'settings.url.noAccess': 'You no longer have access to this site. Ask its Owner to invite you again.',
  'settings.url.pending': 'Pending domain: {name}',
  'settings.url.pendingHelp':
    'Your current address remains active. This domain will be activated only when every check below is ready.',
  'settings.url.dnsHelp': 'Add this TXT record at your domain’s DNS provider, then check ownership.',
  'settings.url.dnsType': 'Record type',
  'settings.url.dnsName': 'Record name',
  'settings.url.dnsValue': 'Record value',
  'settings.url.ownership': 'Domain ownership',
  'settings.url.routing': 'Site routing',
  'settings.url.tls': 'HTTPS certificate',
  'settings.url.ready': 'Ready',
  'settings.url.waiting': 'Pending',
  'settings.url.verify': 'Check ownership',
  'settings.url.verifying': 'Checking ownership…',
  // The Domains section of the Publish tab: the site's state, Publish / Back to draft, and what a press
  // that did not work says (`@tracy/core/site-tabs` `SiteDomains`).
  'publish.domains': 'Domains',
  'publish.primary': 'Site address',
  'publish.status.draft': 'Draft',
  'publish.status.publishing': 'Publishing…',
  'publish.status.live': 'Live',
  'publish.publish': 'Publish',
  'publish.backToDraft': 'Back to draft',
  'publish.lead.draft': 'Only people with the link can open it until the site is published.',
  'publish.lead.live': 'Live since {when}',
  'publish.working.live': 'Publishing… this takes about a minute.',
  'publish.working.draft': 'Going back to draft…',
  'publish.working.unconfirmed':
    'Waiting for the server that runs this site to confirm. Nothing else can be started until it answers.',
  'publish.failed.publish': "Couldn't publish. The site is still a draft.",
  'publish.failed.republish': "Couldn't finish publishing. The site is still live.",
  'publish.failed.draft':
    "Couldn't finish going back to draft. The site reads as a draft, but part of the change is not done.",
  'publish.details': 'Details',
  'publish.reason.notConfigured': 'Publishing is not set up on this server yet. Ask your administrator.',
  'publish.reason.jobFailed': 'The work stopped with an error on the server that runs this site.',
  'publish.reason.refused': 'The server that runs this site refused the request.',
  'publish.reason.noResult': 'The server that runs this site did not confirm that the work finished.',
  'publish.reference.job': 'Reference {job} · {when}',
  'publish.adminOnly': 'Only an Owner or an Editor can publish this site. Ask one of them to publish it.',
  'publish.busy': 'This site is already being published or taken back to draft. Nothing new was started.',
  'publish.unknown': 'Could not complete this request. Reload to see the current state of the site.',
  'publish.offline':
    'Could not reach Tracy. Check your connection, then reload to see the current state of the site.',
  'publish.draftTitle': 'Take {site} back to draft?',
  // A domain of the customer's own, in the Domains section (`@tracy/core/site-tabs` `OwnDomainCard`):
  // the records to create, what the last lookup found for each and when, and the way out.
  'publish.connect': 'Connect domain',
  'domains.help':
    'Enter a subdomain of a domain you own, such as www.example.com or shop.example.com. Do not include https:// or a path.',
  'domains.name': 'Domain',
  'domains.remains': '{address} keeps answering. A connected domain is added beside it.',
  'settings.url.notBare': 'Enter the domain alone, without https://, a port or a path.',
  'settings.url.tooLong': 'That name is too long to be a domain. Check it and try again.',
  'settings.url.isTracy':
    'That is a Tracy address. Enter a domain you own, or use Change address to rename the site address.',
  'settings.url.notTracy': 'That is not a Tracy address. To use a domain you own, choose Connect domain.',
  'settings.url.limit': 'This site already has a connected domain. Remove it before connecting another.',
  'domains.records': 'DNS records',
  'domains.addRecords': 'Add these records at your domain’s DNS provider, then check again.',
  'domains.check': 'Check again',
  'domains.copyRecord': 'Copy {type} record value',
  'domains.copyRecordName': 'Copy {type} record name',
  'domains.checkedAt': 'Last checked {when}. Tracy rechecks automatically once the site is live.',
  'domains.dnsOnly': 'On Cloudflare, set the CNAME to DNS only (grey cloud).',
  'domains.dnsWait': 'DNS changes can take up to an hour.',
  'domains.bareName': 'To make {bare} work too, redirect it to {domain}.',
  'domains.noRouting':
    'This server did not say where to point the domain, so it cannot be connected here yet. Ask your administrator.',
  'domains.remove': 'Remove domain',
  'domains.removing': 'Removing…',
  'domains.connecting': 'Connecting…',
  'domains.publishOn': 'Publish on {domain}',
  'domains.draftStops': 'Visitors to {domain} will no longer reach the site until you publish it again.',
  'settings.url.removeFailed':
    'The domain could not be removed, so it may still open the site. Try again, or contact your administrator.',
  'publish.reason.domainNotRouted':
    'The site is live, but the server did not confirm that it added your domain. Publish on the domain again.',
  'publish.reason.domainStillRouted':
    'The site is a draft again, but the server did not confirm that it removed your domain. Try again.',
  'domains.state.connected': 'Connected',
  'domains.state.connecting': 'Connecting…',
  'domains.state.removing': 'Removing…',
  'domains.state.live': 'Live',
  'domains.state.waiting': 'Waiting for DNS',
  'domains.state.wrong': 'DNS needs fixing',
  'domains.state.unknown': 'DNS not checked',
  'domains.state.verified': 'Verified',
  'domains.state.failed': 'Not connected',
  'domains.state.cleanup': 'Removal not finished',
  'domains.record.ownership': 'Proves the domain is yours',
  'domains.record.routing': 'Points the domain at this site',
  'domains.record.validation': 'Lets the HTTPS certificate be issued',
  'domains.found.validation': 'Read when the certificate is issued.',
  'domains.found.ok': 'Found, with the right value.',
  'domains.found.wrong': 'Found with a different value: {found}',
  'domains.found.loop': 'The records point back at each other: {found}',
  'domains.found.missing': 'No {type} record was found at {name}.',
  'domains.found.missingRouting':
    'No CNAME record was found at {name}. If your DNS provider flattens or proxies the record, Tracy cannot read it.',
  'domains.found.unknown': 'The lookup got no usable answer ({reason}), so this record could not be checked.',
  'domains.found.targetChanged': 'The value to point at has changed since the last check. Check again.',
  'domains.found.unchecked': 'Not checked yet.',
  'domains.lead.wrong':
    'A record was found with a different value. Correct it at your DNS provider, then check again.',
  'domains.lead.unknown': 'DNS could not be read just now, so nothing is confirmed. Check again in a moment.',
  'domains.lead.live': 'The site answers at this domain.',
  'settings.url.apex':
    '{domain} cannot point at a site on its own. Enter a subdomain of it instead, such as {suggestion}.',
  'settings.url.ownDomainOff':
    'Connecting a domain is turned off for this workspace. A domain the site already has keeps working and can still be removed.',
  'settings.url.ownDomainUnavailable': 'Connecting a domain is not available on this server yet.',
  'settings.url.releasing':
    'This domain was just removed from a site and is still being released. Try again in a few minutes.',
  'settings.url.lapsed':
    'This domain is no longer held for the site: its TXT record was not found within 72 hours. Reserve it again to get a new record.',
  'domains.state.lapsed': 'Lapsed',
  'domains.state.unsupported': 'Cannot connect',
  'domains.lead.lapsed':
    '{domain} is no longer held for this site: its TXT record was not found within 72 hours. Reserve it again to get a new record, or remove it.',
  'domains.lead.unsupported':
    '{domain} cannot point at a site on its own, so it can never connect. Remove it and connect a subdomain of it instead, such as {suggestion}.',
  'domains.lead.unconnectable':
    '{domain} is not a domain Tracy can connect: its ending is not one domains are registered under, so it can never connect. Remove it.',
  'domains.reserveAgain': 'Reserve again',
  'domains.holdUntil': "Held until {when}. If the TXT record isn't found by then, the domain is released.",
  // Said of the ownership record alone: it is what the server connects a domain on.
  'domains.verifiedDraft': 'The domain is proven yours. Publish the site to connect {domain}.',
  'domains.verifiedLive':
    'The domain is proven yours. Tracy connects {domain} by itself within a few minutes.',
  'domains.failed.connect': 'The site is live, but {domain} was not connected.',
  // The domain itself, asked over HTTPS once the host has its route: being asked, or not answering
  // as this site, with the reason in the reader's words (`unreachableReasonKey`).
  'domains.state.opening': 'Checking the domain',
  'domains.state.unreachable': 'Not opening the site',
  'domains.lead.opening':
    'Tracy is checking that {domain} opens the site. After a DNS change this can take a while; there is nothing more to do.',
  'domains.unreachable.line': '{domain} does not open the site yet.',
  'domains.unreachable.dns':
    'Its name does not resolve yet. Check the record at your DNS provider; DNS changes can take up to an hour.',
  'domains.unreachable.address': 'Its name points at an address that is not on the public internet.',
  'domains.unreachable.certificate': 'There is no valid HTTPS certificate for it yet.',
  'domains.unreachable.connect': 'Nothing answered at the domain.',
  'domains.unreachable.otherSite':
    'Something else answers at the domain, not this site. Check where its record points.',
  'domains.unreachable.siteDown': 'The domain reaches Tracy, but the site did not return its page.',
  'domains.unreachable.redirect': 'The site sends its home page to another address.',
  'domains.unreachable.generic': 'Tracy could not confirm that the site answers there.',
  // The registration that serves the domain with its own certificate (#1037, slice 2).
  'domains.unreachable.hostnamePending':
    'Tracy is still setting up the domain. Once the records above are in place this usually takes a few minutes.',
  'domains.unreachable.certificatePending': 'Its HTTPS certificate is still being issued.',
  'domains.unreachable.hostnameFailed':
    'Its HTTPS certificate could not be issued. Check the records above, then check again.',
  'domains.unreachable.hostnameTaken':
    'This domain is already set up for a site outside Tracy, so it cannot be connected here. Contact support.',
  'domains.unreachable.hostnameUnread':
    "Tracy could not check the domain's setup just now. It checks again by itself.",
  'domains.unreachable.keeps': 'Tracy keeps checking; Check again asks now.',
  'domains.probedAt': 'The domain was last asked {when}.',
  'domains.found.otherRoute': 'Found: {found}. The domain opens the site, so this record is fine as it is.',
  'domains.found.otherRouteMissing':
    'No CNAME record was found at {name}. The domain opens the site, so nothing needs changing.',
  'domains.removeTitle': 'Remove {domain}?',
  'domains.removeBody': '{domain} stops opening the site. The site keeps its Tracy address.',
  'domains.ownerOnly': 'Only the site Owner can connect, check or remove a domain.',
  'domains.checking': 'Checking DNS…',
  'publish.reason.routingChanged':
    'The server that runs this site changed where domains must point since yours was checked. Check the domain again, then publish.',
  'publish.draftBody':
    'The site is hidden from search engines again and stops sending email. Only people with the link can open it.',
  'publish.copyAddress': 'Copy address',
  'publish.copied': 'Copied',
  'publish.copyRefused': 'Could not copy. Select the text and copy it yourself.',
  // The Domains section of the Publish tab: the site's state, Publish / Back to draft, and what a press
  // that did not work says (`@tracy/core/site-tabs` `SiteDomains`).
  'settings.address': 'Address',
  'settings.admin': 'CMS admin',
  'settings.cms': '{cms} settings',
  'settings.version': '{cms} version',
  'settings.unavailable': 'Unavailable',
  'settings.enabled': 'Enabled',
  'settings.disabled': 'Disabled',
  'settings.homepage.page': 'Static page',
  'settings.homepage.posts': 'Latest posts',
  'settings.plain': 'Plain',
  'settings.notSet': 'Not set',
  'settings.open': 'Open {label}',
  /** The two buttons in the Settings header (layout D, Akemi 04/10). */
  /** Muted line under the Settings title. */
  'settings.lead':
    'What the running CMS reports about this site. Each setting opens in the CMS admin, where it is edited.',
  'settings.openSite': 'Open site',
  'settings.openAdmin': 'Open admin',
  'settings.readFailed': 'Could not read the running CMS. You can still open its admin.',
  'settings.title': 'Site title',
  'settings.language': 'Site language',
  'settings.languages': 'Published languages',
  'settings.timezone': 'Time zone',
  'settings.theme': 'Active theme',
  'settings.template': 'Active template',
  'settings.homepage': 'Homepage',
  'settings.permalinks': 'Permalinks',
  'settings.sef': 'Search-friendly URLs',
  'settings.tagline': 'Tagline',
  'settings.postsPerPage': 'Posts per page',
  'settings.titleSeparator': 'SEO title separator',

  // ── The three tabs ──────────────────────────────────────────────────────────────────────
  /** Tab titles; the site name is appended by the code (`Team · fijitrips.example`). */
  'tab.team': 'Team',
  /**
   * "Site changes", not "Changes": from better-sidebar 0.18.0 the built-in git tab is titled
   * "Changes" too, and the `+` menu listed the word twice — one row for the lane's own repo, one
   * for the site's webroot on the fleet. The two are different things, and the name says which.
   */
  'tab.changes': 'Site changes',
  /** A diff tab is titled after its file, so this label only shows before one is known. */
  'tab.diff': 'Diff',
  /** Heading of the site picker in every tab header. */
  'picker.title': 'Show this tab for',
  /** Under the one row the picker has before the site list arrives. */
  'picker.loading': 'Reading your other sites…',
  /** Accessible name of the tab's loading bar (a 2px line under the tab strip, no visible words). */
  'loading.label': 'Loading',
  'state.building': 'Preparing this site’s history for the first time. This can take a minute…',
  'state.failed': 'Could not reach the site. Try again shortly.',
  'state.signedOut': 'Sign in to see this.',
  'state.noSite': 'No site is open. Pick one from My Sites.',
  'action.retry': 'Try again',
  'action.more': 'More',
  'action.cancel': 'Cancel',

  // ── Who did it ──────────────────────────────────────────────────────────────────────────
  'actor.agent': 'Agent',
  /** The site itself: edits made in its admin, over FTP, by an extension update. */
  'actor.outside': 'On the site',
  'ago.justNow': 'just now',
  /** Whole phrases with the number inside: a language puts {count} where its grammar wants it
   * ("vor {count} Minuten", "hace {count} minutos"); one singular and one plural per unit. */
  'ago.minute': '{count} minute ago',
  'ago.minutes': '{count} minutes ago',
  'ago.hour': '{count} hour ago',
  'ago.hours': '{count} hours ago',
  'ago.day': '{count} day ago',
  'ago.days': '{count} days ago',
  /** The short age at the right of a Site changes row. */
  'ago.short.minutes': '{count} min ago',
  'ago.short.hours': '{count}h ago',
  'ago.short.days': '{count}d ago',

  // ── Changes ─────────────────────────────────────────────────────────────────────────────
  'changes.sinceStart': 'the start',
  /** The lead under the title of the Site changes page. */
  'changes.lead':
    'Every recorded change to this site, who made it and when. Undo a change or restore a backup from here.',
  /** The divider between the rows recorded since the person last opened the tab and the rest. */
  'changes.newSince': '{count} new since you last looked',
  /** Tooltip on a deleted row: git has no diff for a file that is no longer there. */
  'changes.deletedNoDiff': 'Deleted — there is nothing left to compare',
  'diff.empty': 'No text changes in this file. It may be an image or another binary.',
  'diff.failed': 'Could not read this file’s diff.',
  /** The fleet keeps the tail of a job's output, so a very large diff arrives without its head. */
  'diff.truncated': 'This diff is too large to show in full.',
  'diff.blocked': 'Configuration file, contents not shown.',
  'diff.blockedHint': 'It holds the site’s passwords and keys, so Tracy doesn’t show what is in it.',
  'zone.design': 'Design',
  'zone.function': 'Function',
  'zone.addons': 'Add-ons',
  /** ADR 0024 §4: this zone is FILES (uploads, images, language); "Content" means the database. */
  'zone.content': 'Media & language files',
  'zone.core': 'Core',
  'zone.system': 'System',
  /** A file one moment touched that has no pending change any more, so no zone was read for it. */
  'zone.other': 'Other files',
  /** Under an opened moment, after its first few files. */
  'moment.moreFiles': '+ {count} more',
  'moment.filesFailed': 'Could not read the files of this moment.',
  /** The host lists at most 500 files of one moment: said under the list when it was cut. */
  'moment.filesShowing': 'Showing {shown} of {count} files.',
  'moment.filesNotListed': '+ more files not listed',
  /** Files of an older moment the exclude list names today (a CMS cache): folded, never listed (Q4). */
  'moment.excludedOne': '1 cache file not shown',
  'moment.excluded': '{count} cache files not shown',
  'moment.excludedHint':
    'Files the site rebuilds by itself, such as compiled CSS and caches. They are not changes anyone made, and Tracy no longer records them.',

  // ── Site changes by chat turn (plan todo-site-changes P1; mockup `site-changes-turns`) ────
  'activity.emptyFilter': 'Nothing here under this filter.',
  'activity.more': 'Show more',
  'activity.moreLoading': 'Loading…',
  'activity.moreFailed': 'Could not read more of the list.',
  'activity.openComment': 'Open comment',
  'activity.unsealed': 'May include files changed before this turn.',
  'activity.concurrent':
    'Another conversation was open on this site during this turn, so some files may be from it.',
  'activity.stale': 'This turn did not finish recording. The files and content below may be incomplete.',
  'activity.housekeepingNote': 'Tracy stopped tracking some of its own working files.',
  'activity.older': 'Older history not shown',
  'activity.olderHint': 'This list stops at the newest 200 moments.',
  'activity.gitFailed': 'The site’s file history could not be read just now, so some rows may be missing.',
  'activity.since': 'Chat turns recorded since {date}. Earlier moments show without the words typed.',
  'activity.cmsTracked': '{cms} admin edits are tracked.',
  'activity.cmsChecked': '{cms} admin edits are tracked. Last checked {ago}.',
  'activity.cmsPending': '{cms} admin edits are tracked once Tracy first reads its log.',
  'activity.cmsFailed':
    'Tracy could not read the {cms} admin log last time, so recent admin edits may be missing.',
  'activity.cmsNotTracked': '{cms} admin edits not tracked yet on this site',
  'activity.cmsNotTrackedHint': 'Pages, menus or settings changed there don’t appear in this list.',
  /** A CMS whose own log records only some admin edits (EmDash 1.0.1: pages and posts). */
  'activity.cmsTrackedPartial':
    '{cms} admin edits to pages and posts are tracked; menus, settings and media are not recorded by {cms}.',
  'activity.cmsCheckedPartial':
    '{cms} admin edits to pages and posts are tracked; menus, settings and media are not recorded by {cms}. Last checked {ago}.',
  'activity.cmsPendingPartial':
    '{cms} admin edits to pages and posts are tracked once Tracy first reads its log; menus, settings and media are not recorded by {cms}.',
  /** The scope line on a Diff tab opened from a row: the diff of that moment, not since a backup. */
  'diff.thisMoment': 'This moment',
  // ── Backups (ADR 0024; mockup `site-changes-backup`, Brian 02/10) ───────────────────────────
  // A backup is a restore point: files AND the database. No Source; never counted in the total.
  'backup.create': 'Create a backup',
  /** Hover words when the list records nothing since the newest backup; the button stays live. */
  'backup.nothingRecorded':
    'Nothing recorded in Site changes since {name}. The database can still have changed (orders, comments, form entries), so a backup can still keep something new.',
  'backup.mark': 'Backup',
  'backup.initialName': 'Initial backup — site as built',
  'backup.initialShort': 'Initial backup',
  'backup.name': 'Backup {n} · {title}',
  'backup.beforeRestoreName': 'Backup {n} · Before restore to Backup {m}',
  'backup.beforeRestoreTitle': 'Before restore to Backup {m}',
  'backup.short': 'Backup {n}',
  'backup.badge.full': 'Full backup',
  'backup.badge.files-only': 'File backup (no database)',
  'backup.badge.content': 'Content backup',
  'backup.badge.db-missing': 'DB ✗',
  'backup.badgeTitle.full': 'Files and database',
  'backup.badgeTitle.files-only': 'Files only: made before Tracy kept the database',
  'backup.badgeTitle.content': 'Database and media; template code not included',
  'backup.badgeTitle.db-missing': 'Database copy missing or damaged: files only',
  'backup.filesSince.one': '1 file changed since Backup {n}',
  'backup.filesSince.many': '{count} files changed since Backup {n}',
  /** Every change Site changes recorded since the previous backup, not only files (Brian 03/10). */
  'backup.changesSince.one': '1 change since Backup {n}',
  'backup.changesSince.many': '{count} changes since Backup {n}',
  'backup.handedOver': 'The site as it was handed over',
  'backup.emdashSince': 'Since Backup {n} · database and media',
  'backup.dbMissing.missing': 'Database copy missing · only the files can go back',
  'backup.dbMissing.mismatch': 'Database copy does not match what was saved · only the files can go back',
  'backup.dbMissing.removed': 'Database copy removed to keep the newest 20 · only the files can go back',
  'backup.backedUpBy': 'Backed up by',
  'backup.beforeRestore':
    'Taken by Tracy just before everything was restored to Backup {n}, so that restore can be undone the same way.',
  'backup.notesTitle': 'Backup notes',
  'backup.noNotes': 'No notes were written.',
  'backup.keepsTitle': 'What this backup keeps',
  'backup.keeps.full':
    'Files and the site’s database: posts, pages, menus, settings, users, comments and orders.',
  'backup.keeps.files-only':
    'Files only. This backup was made before Tracy kept the database, so posts, pages and settings cannot be put back from it.',
  'backup.keeps.content':
    'The site’s database and media. The template code is not part of it and stays as it is.',
  'backup.keeps.db-missing':
    'Its database copy is missing or does not match what was saved, so only its files can be put back. Restore everything is not offered.',
  'backup.initialFull':
    'Everything as it was the moment the site was handed over. Restore everything here is a factory reset: the site goes back to day one.',
  'backup.initialFiles':
    'The files as they were when the site was handed over. This site was built before Tracy kept the database, so its database at that moment was not saved.',
  'backup.filesSinceHint':
    'Counted from the previous backup to this one. A backup changes nothing on the site: it keeps the site as it was at this point.',
  'backup.restoreContent': 'Restore content…',
  'backup.restore': 'Restore…',
  'backup.noEverything.files-only':
    'Restore everything isn’t offered: this backup has no copy of the database.',
  'backup.noEverything.db-missing':
    'Restore everything isn’t offered: the database copy of this backup can’t be trusted.',
  'backup.noFilesEmdash': 'Restore files isn’t offered on EmDash: its files are not tracked.',
  'backup.tech.tag': 'Tag',
  'backup.tech.database': 'Database',
  'backup.createTitle': 'Create backup {n} of {site}',
  'backup.createTitleNoNumber': 'Create a backup of {site}',
  'backup.nameLabel': 'Backup title',
  'backup.titlePending': 'Reading the backups…',
  'backup.notesHint': 'Drafted from the {count} changes since {since}. Edit freely.',
  /** Reading a webroot takes tens of seconds; the field says so rather than looking empty. */
  'backup.notesLoading': 'Reading what changed since the last backup…',
  /** The drafted notes stop at ten lines; the rest is counted (Brian 02/10: notes are for a person). */
  'backup.draftMore.one': '…and 1 more change',
  'backup.draftMore.many': '…and {count} more changes',
  'backup.createConfirm': 'Create backup',
  'backup.creating': 'Creating…',
  'backup.failed': 'The backup could not be made. Nothing on the site was changed.',
  /** The door answered 202: the host is still making the backup (#1403 item 9). */
  'backup.pendingTitle': 'Still making the backup',
  'backup.pendingBody': 'It takes longer on a big site. It shows in the list once it is made.',
  /** No answer that proves anything (a lost reply, an unreadable one): never "nothing was changed". */
  'backup.unconfirmedBody':
    'Tracy could not confirm the backup yet. It may still be being made; if so, it shows in the list once it is done.',
  /** Restore everything refused or failed on the host — its own words, not the files undo's. */
  'backup.everythingFailed': 'The restore did not go through. Try again shortly.',
  /** The backups could not be read: the list shows none for that reason, not for want of any. */
  'backup.readFailed': 'Tracy could not read this site’s backups just now, so none are shown in this list.',
  'backup.everythingTitle': 'Restore everything on {site} to {name}?',
  'backup.contentTitle': 'Restore the content of {site} to {name}?',
  'backup.everythingBody': 'Files and the database go back to how they were on {when}.',
  'backup.contentBody': 'The database and media go back to how they were on {when}.',
  'backup.lostTitle': 'Everything saved on the site after {when} is deleted:',
  'backup.lost.posts': 'Posts and pages',
  'backup.lost.orders': 'Orders',
  'backup.lost.forms': 'Form entries',
  'backup.lost.users': 'Users',
  'backup.lost.comments': 'Comments',
  'backup.lost.settings': 'Settings',
  'backup.beforeFirst': 'Tracy will take a “Before restore” backup first, so you can come back to now.',
  'backup.emdashOffline': 'The site is offline for a few seconds while it restarts.',
  'backup.templateKept': 'The template code is not part of this backup and stays as it is.',
  'backup.typeRestore': 'Type “Restore” to confirm',
  'backup.everythingConfirm': 'Restore everything',
  'backup.contentConfirm': 'Restore content',
  'backup.noopBody': 'The site was already as it was at {name}, so nothing changed.',
  'backup.err.unknown': 'This backup is no longer on the site.',
  'backup.err.notFull': 'This backup has no usable copy of the database, so only its files can be put back.',
  'backup.err.forbidden':
    'Only an Owner or an Editor of this site can restore everything. Ask one of them to restore it.',
  /** Under a restore verb this seat's role may not press (the door would refuse it). */
  'backup.forbidden.files': 'Your role on this site can see backups but not put files back.',
  'backup.forbidden.content':
    'Only an Owner or an Editor of this site can restore content. Ask one of them to restore it.',
  'backup.err.refused': 'The site refused this restore.',
  'backup.jump': 'Jump to backup',
  'backup.divider': '{name} · {day}',
  /** Download… on a backup (Owner only, plan todo-backup-export): the confirm dialog and its states. */
  'backup.download': 'Download…',
  'backup.download.title': 'Download {name}',
  'backup.download.body':
    'Tracy packs this backup into one zip: the site files as they were then, and its database.',
  'backup.download.privacy':
    'The zip holds the site’s data, including personal data of its users, and may hold the site’s own secrets. Keep it somewhere safe.',
  'backup.download.scope': 'Files over 50 MB are not kept in a backup, so they are not in the zip.',
  'backup.download.keep': 'The zip is kept for 24 hours after it is ready.',
  'backup.download.start': 'Prepare download',
  'backup.download.state.queued': 'Waiting for the site’s host…',
  'backup.download.state.packing': 'Preparing…',
  'backup.download.state.uploading': 'Uploading…',
  'backup.download.ready': 'Ready · {size}',
  'backup.download.until': 'Available until {at}',
  'backup.download.code': 'Enter the code from your email',
  'backup.download.hint': 'The code expires in 10 minutes.',
  'backup.download.codeInvalid': 'That code is not right. Try again.',
  'backup.download.codeExpired': 'That code has expired. Resend code.',
  'backup.download.codeTooManyAttempts': 'Too many attempts. Resend code.',
  'backup.download.resend': 'Resend code',
  'backup.download.sendCode': 'Send code',
  'backup.download.download': 'Download',
  'backup.download.downloaded': 'Downloaded',
  'backup.download.started': 'Download started.',
  'backup.download.expired': 'This download has expired. Prepare it again.',
  'backup.download.failed': 'The backup could not be prepared ({error}).',
  'backup.download.err.busy': 'A download of this site is already being prepared.',
  'backup.download.err.limit': 'Too many downloads at once or in the last hour. Try again later.',
  'backup.download.err.forbidden': 'Only an owner of this site can download a backup.',
  'backup.download.err.failed': 'The download could not be started.',
  'backup.download.size': '{n} MB',
  'event.desc.restoreEverything': 'Restored everything to Backup {version}',
  /** On a Restore everything row: its own Before-restore backup, the way back (Brian 03/10). */
  'event.returnPoint': 'Return point: {name}',
  'event.restoreReturnPoint': 'Restore {name}…',
  'event.desc.restoreEverythingCommit': 'Restored everything to commit {sha}',
  'event.restoreEverythingNote': '{name} restored everything to an earlier backup from Site changes.',
  'event.restoreEverythingTo': 'Everything put back to',
  /** A Sync to live row and its undo: the Owner wrote the LIVE site, not this copy (counts only). */
  'event.desc.syncToLive.one': 'Synced to live: 1 change',
  'event.desc.syncToLive.many': 'Synced to live: {count} changes',
  'event.desc.syncToLiveNoCount': 'Synced to live',
  'event.desc.syncToLiveUndo': 'Undid sync to live',
  'event.syncToLiveNote':
    '{name} sent Tracy’s changes to the live site with Sync to live. This copy did not change.',
  'event.syncToLiveUndoNote': '{name} put back on the live site what Sync to live had changed there.',

  // ── Site changes V2 (plan todo-site-changes-v2 §2–§3; mockup `site-changes-v2`, Brian 02/10) ──
  // One row = one recorded event, four columns. Words proposed in
  // tasks/evidence/site-changes-v2/P1/vocabulary-proposal.md, listed in vocabulary.md §1.
  'event.col.description': 'Description',
  'event.col.time': 'Time',
  'event.col.source': 'Type',
  'event.col.by': 'By',
  /** The seven Sources (plan §2.1): the path a change came by, not the person. */
  'event.source.chat': 'Chat',
  'event.source.comment': 'Comment',
  /** A press of the site browser's Design system button: the button's own name (walkthrough 11/10/2026). */
  'event.source.design-system': 'Design system',
  /**
   * Tracy writing a new site's words and pictures from the brief its person sent in the Add site popup
   * (sweep #4, council 11/10/2026): Tracy did it, for that person — never a person's own change.
   */
  'event.source.setup': 'Tracy setup',
  /** A write made with one of the person's API keys (`/v1`, sweep #2). */
  'event.source.api': 'API',
  'event.source.cms-admin': 'CMS admin',
  'event.source.automatic': 'Automatic',
  /** Enum `deployment` kept; the customer reads it as Tracy keeping itself current (Brian, option a). */
  'event.source.deployment': 'Tracy update',
  // Brian 02/10: the tab itself is "Site changes", so the source of an undo/restore press is
  // labelled "Restore" — the enum value stays `site-changes` (shipped API contract).
  'event.source.site-changes': 'Restore',
  'event.source.unknown': 'Unknown',
  'event.filter': 'Type: {source}',
  'event.filterAll': 'All',
  /** The default filter (Akemi 06/10/2026, door d3): every Type but Automatic. */
  'event.filterPeople': 'People and Tracy',
  /** What People and Tracy holds back, counted by the server; Show switches to Type: All. */
  'event.hiddenAutomatic.one': '{count} automatic update hidden',
  'event.hiddenAutomatic.many': '{count} automatic updates hidden',
  'event.hiddenAutomaticShow': 'Show',
  /** The list while a read under another Source is out: the frame stays, the old rows do not. */
  'event.reading': 'Reading events for Type: {source}…',
  /** Counted by the server over the whole list; "At least" when a source could not be read in full. */
  'event.total.one': '{count} recorded event',
  'event.total.many': '{count} recorded events',
  'event.totalAtLeast.one': 'At least {count} recorded event',
  'event.totalAtLeast.many': 'At least {count} recorded events',
  'event.totalPeople.one': '{count} change by people and Tracy',
  'event.totalPeople.many': '{count} changes by people and Tracy',
  'event.totalPeopleAtLeast.one': 'At least {count} change by people and Tracy',
  'event.totalPeopleAtLeast.many': 'At least {count} changes by people and Tracy',
  /** A Chat row's title: the person's request, quoted (quotation marks follow the language). */
  'event.requestTitle': '“{text}”',
  'event.reason.git-truncated':
    'The file history stops at the newest 200 moments, so older events are not counted.',
  'event.reason.git-unread':
    'The site’s file history could not be read just now, so its events are not counted.',
  'event.reason.no-file-history':
    '{cms} keeps no file history Tracy can read, so file changes are not counted.',
  'event.reason.collector-gap':
    'The {cms} admin log could not be read in full, so some of its events are not counted.',
  'event.reason.cms-log-limits':
    'The {cms} admin log does not record every kind of change, so those are not counted.',
  'event.reason.unknown': 'One source could not be read in full, so some events are not counted.',
  'event.empty': 'Nothing has been recorded on this site yet.',
  'event.detected': 'Detected {ago}',
  'event.unknown': 'Unknown',
  /** Beside a Description that is only the request: no result was confirmed. */
  'event.requestChip': 'Request',
  'event.flagged': 'Check this event',
  'event.by.seatTitle': '{name} · Tracy seat · {email}',
  'event.by.cmsId': '{cms} user {id}',
  // Description words: built from what was recorded, never from what the site holds today.
  'event.desc.summary': 'Updated {parts}',
  'event.desc.filesChanged.one': 'Changed 1 file',
  'event.desc.filesChanged.many': 'Changed {count} files',
  'event.desc.filesChangedNoCount': 'Changed files',
  'event.desc.filesSourceUnknown': 'Files changed; source unknown',
  'event.desc.technicalOnly': 'Only technical edits recorded',
  'event.desc.recorded': 'Content change recorded',
  'event.desc.settingsRecorded': 'Settings change recorded',
  // One of Tracy's own components on the site (`owner: 'tracy'`), and a Tracy update.
  'event.desc.tracyTitled': '{op} Tracy’s {type} “{title}”',
  'event.desc.tracyTyped': '{op} Tracy’s {type}',
  'event.desc.recordedTracy': 'Change to one of Tracy’s own components recorded',
  'event.desc.settingsRecordedTracy': 'Settings change to one of Tracy’s own components recorded',
  'event.desc.deployConnector': 'Tracy updated its connector on this site',
  'event.desc.deployComponent': 'Tracy updated one of its components on this site',
  'event.desc.deployFiles': 'Tracy updated its files on this site',
  'event.desc.otherRecorded': 'Change recorded',
  'event.desc.housekeeping': 'Tracy tidied up its own files',
  'event.desc.undo.one': 'Undid changes to 1 file',
  'event.desc.undo.many': 'Undid changes to {count} files',
  'event.desc.undoNoCount': 'Undid the file changes of commit {sha}',
  'event.desc.reset': 'Put the site files back to commit {sha}',
  /** A files-only restore to a backup, named as the Everything row names it. */
  'event.desc.resetBackup': 'Put the site files back to Backup {version}',
  /** "a, b and c": `list` is the first items joined by commas. */
  'event.join': '{list} and {last}',
  /** One line per op around a target ("page “About us”"), so each language orders the words and
   * keeps the noun in agreement; the bare verbs above stay for where an op is shown alone. */
  'event.line.create': 'Created {target}',
  'event.line.update': 'Updated {target}',
  'event.line.delete': 'Deleted {target}',
  'event.line.publish': 'Published {target}',
  'event.line.unpublish': 'Unpublished {target}',
  'event.line.trash': 'Trashed {target}',
  'event.line.archive': 'Archived {target}',
  'event.line.install': 'Installed {target}',
  'event.line.uninstall': 'Uninstalled {target}',
  'event.line.upload': 'Uploaded {target}',
  'event.line.activate': 'Activated {target}',
  'event.line.deactivate': 'Deactivated {target}',
  'event.line.block': 'Blocked {target}',
  'event.line.unblock': 'Unblocked {target}',
  'event.line.restore': 'Restored {target}',
  'event.line.switch': 'Switched {target}',
  'event.line.change': 'Changed {target}',
  'event.op.create': 'Created',
  'event.op.update': 'Updated',
  'event.op.delete': 'Deleted',
  'event.op.publish': 'Published',
  'event.op.unpublish': 'Unpublished',
  'event.op.trash': 'Trashed',
  'event.op.archive': 'Archived',
  'event.op.install': 'Installed',
  'event.op.uninstall': 'Uninstalled',
  'event.op.upload': 'Uploaded',
  'event.op.activate': 'Activated',
  'event.op.deactivate': 'Deactivated',
  'event.op.block': 'Blocked',
  'event.op.unblock': 'Unblocked',
  'event.op.restore': 'Restored',
  'event.op.switch': 'Switched',
  'event.op.change': 'Changed',
  'event.type.page': 'page',
  'event.type.post': 'post',
  'event.type.article': 'article',
  'event.type.menu': 'menu',
  'event.type.media': 'media file',
  'event.type.category': 'category',
  'event.type.product': 'product',
  'event.type.entry': 'entry',
  'event.type.template': 'template',
  'event.type.setting': 'setting',
  'event.type.theme': 'theme',
  'event.type.plugin': 'plugin',
  'event.type.item': 'item',
  // Units of the scope line "1 page · 2 files": resources, operations and files never summed together.
  'event.unit.page.one': '1 page',
  'event.unit.page.many': '{count} pages',
  'event.unit.post.one': '1 post',
  'event.unit.post.many': '{count} posts',
  'event.unit.article.one': '1 article',
  'event.unit.article.many': '{count} articles',
  'event.unit.menu.one': '1 menu',
  'event.unit.menu.many': '{count} menus',
  'event.unit.media.one': '1 media file',
  'event.unit.media.many': '{count} media files',
  'event.unit.category.one': '1 category',
  'event.unit.category.many': '{count} categories',
  'event.unit.product.one': '1 product',
  'event.unit.product.many': '{count} products',
  'event.unit.entry.one': '1 entry',
  'event.unit.entry.many': '{count} entries',
  'event.unit.template.one': '1 template',
  'event.unit.template.many': '{count} templates',
  'event.unit.item.one': '1 item',
  'event.unit.item.many': '{count} items',
  'event.unit.setting.one': '1 setting',
  'event.unit.setting.many': '{count} settings',
  'event.unit.contentAction.one': '1 content action',
  'event.unit.contentAction.many': '{count} content actions',
  'event.unit.settingsAction.one': '1 settings action',
  'event.unit.settingsAction.many': '{count} settings actions',
  'event.unit.file.one': '1 file',
  'event.unit.file.many': '{count} files',
  'event.unit.otherAction.one': '1 other action',
  'event.unit.otherAction.many': '{count} other actions',
  'event.unnamedActions.one': '1 action that names no item',
  'event.unnamedActions.many': '{count} actions that name no item',
  // Undo status (plan §3.3): never strikes the Description, never claims content is still there.
  'event.status.filesUndone': 'File changes undone',
  /** A chat turn the undo engine took back, all of it / part of it (files or content stayed). */
  'event.status.undone': 'Undone',
  'event.status.partlyUndone': 'Partly undone',
  'event.status.filesPart': 'Files undone',
  'event.status.someFilesUndone': 'Some file changes undone',
  'event.status.contentNot': 'Content changes not undone by this action',
  'event.status.settingsNot': 'Settings changes not undone by this action',
  'event.status.contentSettingsNot': 'Content and settings changes not undone by this action',
  'event.status.otherCommitsNot': 'Other commits not undone by this action',
  'event.undoneBy': 'Undone by {name}',
  'event.showUndo': 'Show the undo',
  // The opened row.
  'event.timeOccurred': 'Happened {at}',
  'event.timeFinished': 'Finished {at}',
  'event.timeDetected': 'Detected {at}, when the site was checked. When it happened is not known.',
  'event.requestedBy': 'Requested by',
  'event.appliedBy': 'Applied by',
  'event.commentBy': 'Comment by',
  /** Where "Open comment" would be, once the comment was deleted: who and where stay. */
  'event.commentDeleted': 'comment deleted',
  'event.onPage': 'on {where}',
  'event.cmsAccount': '{cms} account {name} (ID {id})',
  'event.cmsAccountNoId': '{cms} account {name}',
  'event.cmsAccountIdOnly': '{cms} account with ID {id}',
  'event.cmsNotSeat': 'A CMS account, not linked to a seat on Tracy.',
  // Brian 02/10: an authenticated CMS identity is enough for the CMS admin source; the CMS's own
  // log does not record the channel, so the detail says that instead of claiming the admin screen.
  'event.cmsChannel':
    'Recorded by the CMS\u2019s own log; whether it was the admin screen or its API is not recorded.',
  'event.cmsLog': 'Recorded by {cms} in its log ({log}).',
  'event.automaticProof':
    'Recorded by the WordPress hook while WP-Cron was running, so no person started it.',
  /** Under a Tracy update, first: it changed Tracy's own parts, not the customer's content. */
  'event.deployReassure': 'Your content and settings were not touched.',
  'event.automaticNote': 'Done by the system on its own; no person started it.',
  'event.deployTag': 'tag {tag}',
  'event.startedBy': 'Started by',
  'event.unknownSource': 'Tracy could not tell how this change was made or by whom.',
  'event.unknownSourceKnownBy': 'Tracy could not tell how this change was made.',
  'event.conflicting': 'The records of this change disagree, so its source reads Unknown.',
  'event.siteChangesNote': '{name} pressed Undo file changes in Site changes.',
  'event.resetNote': '{name} put the site files back to an earlier point from Site changes.',
  /** A reset names the commit it went back to; it does not undo the event made there (plan §3.3). */
  'event.resetTo': 'Files put back to',
  'event.showPoint': 'Show that point',
  /** A concurrent turn on a site whose files Tracy does not track: about changes, not files. */
  'event.concurrentNoFiles':
    'Another conversation was open on this site during this event, so some of the changes listed may be from it.',
  'event.siteChangesNoteUnknown': 'Made from Site changes. Git does not record who pressed it.',
  'event.undid': 'Undid',
  'event.commit': 'Commit {sha}',
  'event.showTarget': 'Show the event',
  'event.request': 'Request',
  'event.requestIncomplete': 'Original request incomplete',
  'event.requestIncompleteHint':
    'The record of this request was cut when it was saved. Nothing has been added to fill it.',
  'event.requestUnavailable': 'Full original request unavailable',
  'event.requestUnavailableHint':
    'This event was recorded before Tracy marked whether a request was saved in full, so it may be cut.',
  'event.group.content': 'Content',
  'event.group.settings': 'Settings',
  'event.group.files': 'Files',
  'event.group.other': 'Other recorded actions',
  'event.notTracked': 'Not tracked on {cms}',
  'event.filesUntrackedHint':
    '{cms} keeps no file history Tracy can read, so file changes are not listed here.',
  'event.settingsUntrackedHint': '{cms} admin does not report menus, settings or media to Tracy yet.',
  'event.filesUnread': 'The site’s file history could not be read just now, so the files are not listed.',
  'event.technical': 'Technical details',
  'event.tech.turn': 'Turn',
  'event.tech.commit': 'Commit',
  'event.tech.target': 'Target commit',
  'event.tech.operation': 'Operation',
  'event.tech.job': 'Job',
  'event.tech.record': 'Log record',
  'event.tech.service': 'Service',
  'event.tech.tag': 'Tag',
  'event.tech.write': 'Tool write',
  'event.copySha': 'Copy the commit id',
  'event.undoFiles': 'Undo file changes…',
  // Ask Tracy to revert (plan todo-ask-tracy-to-revert): the agent is ASKED, best-effort — never
  // called Undo. One press sends it to the chat on screen (Brian 02/10: chip + auto-send), so no "…".
  'event.askRevert': 'Ask Tracy to revert',
  /**
   * "Undo this request" on a Chat row (door d3 of `plan-verified.html`, approved by Akemi 06/10/2026):
   * the same undo as the card under the chat turn, so the SAME English as `tracy-chat-input`'s
   * `undo.*` keys — `@tracy/core/turn-undo` hands these keys (`TurnUndoKey`) to both namespaces.
   */
  'event.undoRequest': 'Undo this request',
  /**
   * A Design system row's Description (walkthrough 11/10/2026, bug 4): apply, switch and undo read
   * apart. `{name}` / `{from}`: a design inspiration's name (Stripe), quoted as a name.
   */
  'event.desc.dsApplied': 'Applied the design system “{name}”',
  'event.desc.dsSwitched': 'Switched the design system from “{from}” to “{name}”',
  'event.desc.dsUndone': 'Undid the design system “{name}”',
  'event.desc.dsUnsure':
    'Tried to apply the design system “{name}”; the site did not say whether it was applied',
  /**
   * One revert on its own row (a seat key's `/v1` revert, sweep #2). `{applyId}`: the apply id of the
   * change it took back (`api-…`, or the caller's own), shown as an id.
   */
  'event.desc.reverted': 'Restored the content from before change {applyId}',
  'event.desc.revertedUnnamed': 'Restored the content from before an earlier change',
  /** A design system row's Undo (`ActivityEventRow` `DesignSystemUndo`): the Design system door's. */
  'event.ds.undo': 'Undo this design system',
  'event.ds.confirm': 'Undo the design system “{name}”?',
  'event.ds.back': 'Puts back: {name}.',
  'event.ds.backTemplate': 'Puts back the template’s own look.',
  'event.ds.notLatest': 'Only the newest design system on the site can be undone.',
  'event.ds.changedSince':
    'The site’s look changed after this design system was applied, so nothing was undone.',
  'event.goBackRequest': 'Go back to before this request',
  'undo.putsBackTitle': 'Puts back:',
  'undo.confirmTitle': 'Undo this request?',
  'undo.confirmGoBackTitle': 'Go back to before this request?',
  'undo.alsoLater.one': 'Also undoes {count} later request in this chat.',
  'undo.alsoLater.other': 'Also undoes {count} later requests in this chat.',
  'undo.scope':
    "Puts back the files and page edits Tracy recorded for this request. This can't be redone with one click.",
  'undo.undo': 'Undo',
  'undo.goBackConfirm': 'Go back',
  'undo.undoing': 'Undoing…',
  'undo.askThis': 'this request',
  'undo.working': 'Tracy is working on this site. Undo is available when it finishes.',
  'undo.needsCode': 'Undoing file changes needs an Owner or an Editor.',
  'undo.needsContent': "Undoing page edits needs a role that may edit this site's content.",
  'undo.files.one': '{count} file',
  'undo.files.other': '{count} files',
  'undo.part.content': 'Content',
  'undo.part.look': 'Design · Additional CSS',
  'undo.more': '+{count} more',
  /**
   * How a changed record is named (`@tracy/core/turn-undo` `targetText`): its kind and title when the
   * host read one, else the kind alone. Never a record id (council D1, 20/10/2026). `postOrPage` and
   * `categoryOrTag` are WordPress's `post` and `term`, which hold more than one thing.
   */
  'undo.named.post': 'post “{title}”',
  'undo.named.page': 'page “{title}”',
  'undo.named.article': 'article “{title}”',
  'undo.named.category': 'category “{title}”',
  'undo.named.tag': 'tag “{title}”',
  'undo.named.menu': 'menu “{title}”',
  'undo.named.menuItem': 'menu item “{title}”',
  'undo.named.module': 'module “{title}”',
  'undo.named.templatePart': 'template part “{title}”',
  'undo.named.template': 'template “{title}”',
  'undo.named.media': 'media file “{title}”',
  'undo.named.setting': 'setting “{title}”',
  'undo.named.field': 'custom field “{title}”',
  'undo.named.profile': 'author profile “{title}”',
  'undo.named.entry': 'entry “{title}”',
  'undo.named.any': '“{title}”',
  'undo.unnamed.post': 'a post',
  'undo.unnamed.page': 'a page',
  'undo.unnamed.postOrPage': 'a page or post',
  'undo.unnamed.article': 'an article',
  'undo.unnamed.category': 'a category',
  'undo.unnamed.tag': 'a tag',
  'undo.unnamed.categoryOrTag': 'a category or tag',
  'undo.unnamed.menu': 'a menu',
  'undo.unnamed.menuItem': 'a menu item',
  'undo.unnamed.module': 'a module',
  'undo.unnamed.templatePart': 'a template part',
  'undo.unnamed.template': 'a template',
  'undo.unnamed.media': 'a media file',
  'undo.unnamed.setting': 'a setting',
  'undo.unnamed.field': 'a custom field',
  'undo.unnamed.profile': 'an author profile',
  'undo.unnamed.entry': 'an entry',
  'undo.unnamed.item': 'an item',
  'undo.zone.design': 'Design',
  'undo.zone.function': 'Function',
  'undo.zone.addons': 'Add-ons',
  'undo.zone.content': 'Media & language files',
  'undo.zone.core': 'Core',
  'undo.zone.system': 'System',
  'undo.zone.other': 'Other files',
  'undo.blocked.contentAdmin':
    "The site's content was edited after it: {what} in {cms} admin by {by} at {time}.",
  'undo.blocked.contentAdminNoBy': "The site's content was edited after it: {what} in {cms} admin at {time}.",
  'undo.blocked.contentTracy':
    "The site's content was changed after it: {what}, by Tracy for {by} at {time}.",
  'undo.blocked.contentTracyNoBy': "The site's content was changed after it: {what}, by Tracy at {time}.",
  'undo.blocked.content': "The site's content was changed after this request.",
  'undo.blocked.look': "The site's Additional CSS was changed after this request.",
  'undo.blocked.files': 'Files it changed were changed again after it: {files}.',
  'undo.blocked.filesNoList': 'Files it changed were changed again after it.',
  'undo.blocked.restored': 'The site was restored to an earlier point after it, at {time}.',
  'undo.blocked.restoredNoTime': 'The site was restored to an earlier point after it.',
  'undo.blocked.notRecordedFiles':
    "Tracy has no record of the file changes it made, so it can't put them back.",
  'undo.blocked.notRecordedContent':
    "Tracy has no record of some page edits it made, so it can't put them back.",
  'undo.blocked.notRecordedLook':
    "Tracy has no record of the Additional CSS it changed, so it can't put it back.",
  'undo.blocked.later': "A later request in this chat can't be undone, so the site can't go back to here.",
  'undo.blocked.shared':
    "This request's changes are mixed with another request's, so it can't be undone on its own.",
  'undo.blocked.unsealed':
    "When this request started, Tracy couldn't record the site in time, so it can't tell this request's file changes apart from earlier ones.",
  'undo.blocked.other': "Tracy can't undo this request right now (code {code}).",
  'undo.result.partial': 'Part of this request was put back. Site changes shows what is still on the site.',
  'undo.result.partialUnsure':
    'Tracy got no clear answer for part of this undo. Check Site changes before you try again.',
  'undo.result.unsure':
    'Tracy got no clear answer, so the site may be partly put back. Check Site changes before you try again.',
  'undo.result.signedOut': 'You are signed out, so nothing was undone. Reload this page to sign in again.',
  'undo.result.role': 'Your role on this site does not allow this undo.',
  'undo.result.busy':
    'Another change is running on this site, so nothing was undone. Try again when it finishes.',
  'undo.result.other': 'Nothing was undone (code {code}). Ask Tracy in the chat to look at it.',
  /** The sentence the person sees in the chat; `{what}` is the row's description. */
  'event.askRevertMessage': 'Revert “{what}” — only this change.',
  /** The chip in the chat that carries the record Tracy reads (sources, scope, the no-guess rule). */
  'event.revertChip': 'Revert details',
  'event.askRevertSending': 'Sending to Tracy…',
  'event.askRevertSent': 'Sent to Tracy',
  'event.askRevertFailed': 'Tracy did not take the request. Try again.',
  'event.askRevertNoChat': 'Open a chat on this site first, then ask again.',
  // Open chat and Tracy replied (plan todo-open-conversation A, C).
  'event.openChat': 'Open chat',
  /** dsh opens a session only for the person who created it. */
  'event.openChatOnly': 'Only {name} can open this chat',
  'event.openChatSomeone': 'the person who typed it',
  'event.replied': 'Tracy replied',
  'event.replyTruncated': 'This reply was cut when it was saved.',
  'event.replyInterrupted': 'This turn stopped partway; this is what Tracy had said by then.',
  'event.replyHint': 'What Tracy said at the end of the turn: its own words, not a record of what changed.',
  'event.noUndo.contentOnly': 'Content changes can’t be undone from here yet.',
  'event.noUndo.settingsOnly': 'Settings changes can’t be undone from here yet.',
  'event.noUndo.contentSettings': 'Content and settings changes can’t be undone from here yet.',
  'event.noUndo.outside':
    'Undo isn’t offered for changes Tracy didn’t make. Ask Tracy in the chat to put one back.',
  'event.noUndo.tracyUpdate':
    'Undo isn’t offered for Tracy updates. Ask Tracy in the chat if you need the previous version back.',
  'event.noUndo.untracked': 'Undo isn’t offered on {cms}: there is no file history to go back to.',
  'event.noUndo.forbidden': 'Your role on this site can see changes but not undo them.',
  // The coverage foot of a site with no file history.
  'event.limitsTitle': 'What this list cannot see on {cms}',
  'event.limitsBody':
    '{cms} keeps no file history Tracy can read, and its admin log does not cover menus, settings or media. Changes there do not appear here — that does not mean nothing changed.',
  'event.limitsBodyFiles':
    '{cms} keeps no file history Tracy can read. File changes do not appear here — that does not mean nothing changed.',
  // Undo of ONE commit: the count is that commit's, read from the server.
  'event.undo.title': 'Undo file changes?',
  'event.undo.counting': 'Counting the files of commit {sha}…',
  'event.undo.countFailed': 'Tracy could not count the files of commit {sha} just now.',
  'event.undo.body.one': '1 file goes back to how it was before commit {sha}.',
  'event.undo.body.many': '{count} files go back to how they were before commit {sha}.',
  'event.undo.bodyAtLeast':
    'At least {count} files go back to how they were before commit {sha}. Tracy could not count them all.',
  'event.undo.notUndone': 'Not undone by this action',
  'event.undo.keeps':
    'Nothing is erased from the history. The undo is recorded as a new event under your name.',
  'event.undo.confirm.one': 'Undo 1 file',
  'event.undo.confirm.many': 'Undo {count} files',
  'event.undo.confirmUncounted': 'Undo files',
  'event.undo.working': 'Undoing…',
  'event.undo.failed': 'The undo did not go through. Try again shortly.',
  'event.undo.refusedTitle': 'Can’t undo these file changes',
  /** The server could not confirm the result: never "nothing was changed". */
  'event.undo.unknownTitle': 'Result not confirmed yet',
  'event.undo.unknownBody':
    'Tracy could not confirm whether the undo finished. It may still complete; this list checks again by itself.',
  'event.undo.checkAgain': 'Check again',
  'event.undo.checking': 'Checking…',
  'event.undo.noopTitle': 'Nothing to undo',
  'event.undo.noopBody': 'The files were already as they were before commit {sha}, so nothing changed.',

  // ── Restore: two verbs, because the risk differs ────────────────────────────────────────
  'restore.titleBackup': 'Put the files of {site} back to {name}?',
  /** Restore puts FILES back; content and settings in the database stay as they are (plan §1). */
  'restore.bodyBackup':
    'The site’s files go back to how they were at that backup. Content and settings kept in the database are not changed. Visitors see the file changes at once.',
  'restore.keeps': 'Nothing is erased from the history — you can come forward again the same way.',
  'restore.confirmBackup': 'Restore the files',
  'restore.scopeLabel': 'Restore',
  'restore.scopeEverything': 'Everything',
  'restore.scopeFiles': 'Files only',
  'restore.scopeFilesWarning':
    'Images uploaded after this backup are removed; posts that use them will show broken images.',
  'restore.noopTitle': 'Nothing to restore',
  'restore.noopBody': 'The site’s files were already as they were at {name}, so nothing changed.',
  'restore.working': 'Restoring…',
  'restore.failed': 'The site could not be restored. Nothing was changed.',
  /** An answer that proved nothing (timeout, lost reply, `unknown`): never "Nothing was changed". */
  'restore.unconfirmed':
    'Tracy could not confirm the result yet. It may still finish; the lists check again by themselves.',
  'restore.conflictBody':
    'These files changed after this moment. Undoing it now would overwrite that newer work, so nothing was changed.',
  'restore.filesSince': 'Files changed since',
  'restore.notUndoableBody':
    'Undo isn’t offered for changes Tracy didn’t make. Nothing was changed. Ask Tracy in the chat to put one back.',
  'restore.forbiddenTitle': 'You can’t undo changes on this site',
  'restore.forbiddenBody':
    'Your role here can see changes but not change files. Nothing was changed. An Owner or an Editor can undo it.',
  'action.close': 'Close',

  // ── The team: the book of one site (moved from tracy-my-sites, 04/09) ──────────────────
  /** Under the Team list: the three roles in one sentence, the same for every reader (ADR 0028). */
  'team.rolesHint':
    'Viewers can see the site and comment. Editors can also change it. Owners also manage people, the domain and the site.',
  'team.failed': 'Could not read this site’s team.',
  'action.invite': 'Invite member',
  'roster.member': 'Member',
  'roster.role': 'Role',
  'roster.status': 'Status',
  'roster.you': '(you)',
  'role.owner': 'Owner',
  'role.editor': 'Editor',
  'role.viewer': 'Viewer',
  /** The role rows of the invite wizard, the Approve and Change role dialogs: a sentence each. */
  'role.owner.summary': 'Also manages people, the domain and the site itself',
  'role.editor.summary': 'Changes the site with Tracy: pages, design, settings',
  'role.viewer.summary': 'Sees the site and its changes, and can comment',
  'status.active': 'Active',
  'status.invited': 'Invited',
  'status.requested': 'Asked to join',
  /** A Viewer asked the Owners for edit access (ADR 0028 §6). */
  'status.editRequested': 'Asked for edit access',
  'status.declined': 'Declined',
  'status.revoked': 'Revoked',
  /** A seat its holder gave up (My Sites › Leave), not a removal. */
  'status.left': 'Left',
  /** A row an administrator closed, by the act that closed it; "Revoked" when the book does not say. */
  'status.inviteCancelled': 'Invitation cancelled',
  'status.requestDeclined': 'Request declined',
  'access.granted': 'Granted {ago}',
  /** The access line's second part: who gave the seat. */
  'access.by': 'by {by}',
  /** The access line's second part for a seat inherited from the workspace, in place of "by …". */
  'access.fromWorkspace': 'from your workspace',
  /** Also the head of a declined row: the invitation was sent then, and turned down. */
  'access.invited': 'Invited {ago}',
  'access.asked': 'Asked {ago}',
  'access.revoked': 'Revoked {ago}',
  'access.left': 'Left {ago}',
  'access.inviteCancelled': 'Invitation cancelled {ago}',
  'access.requestDeclined': 'Request declined {ago}',
  'access.unknownGranter': 'someone no longer on this site',
  /** The granter in "by {by}" when it is the person looking at the tab. */
  'access.you': 'you',
  'action.approve': 'Approve',
  'action.changeRole': 'Change role',
  'action.reinvite': 'Re-invite',
  'action.revoke': 'Revoke access',
  'action.cancelInvite': 'Cancel invitation',
  'action.declineRequest': 'Decline request',
  /** An Owner's two answers to a Viewer's request for edit access; the titles say what each does. */
  'action.decline': 'Decline',
  'action.approveEdit': 'Make them an Editor',
  'action.declineEdit': 'Keep them a Viewer',
  'dialog.changeRoleBody': 'Update {name}’s role to:',
  /** Approving a join request (Akemi 04/10): the person joins at once, in the role picked here. */
  'dialog.approveTitle': 'Approve request',
  'dialog.approveBody': '{email} joins {site} as soon as you approve. Choose a role:',
  /** The permission list under the role rows, folded by default (V3, Akemi 04/10). */
  'dialog.approve.seeRole': 'See what {role} can do',
  'dialog.approve.hideRole': 'Hide what {role} can do',
  'dialog.revokeConsequence': '{name} will lose their seat on this site, and the agent with it.',
  'dialog.cancelInviteConsequence':
    '{name} will not be able to accept this invitation. You can invite them again later.',
  'dialog.declineRequestConsequence': '{name} will not get access. They can ask again later.',

  // ── The invite wizard ───────────────────────────────────────────────────────────────────
  'wizard.title': 'Invite people',
  'wizard.description': 'They join the sites you choose, at the role you choose, once they accept.',
  /** Layout D3 (Akemi 04/10): People, Sites, Review, then Done. */
  'wizard.stepOf': 'Step {n} of 3 · {name}',
  'wizard.step.people': 'People',
  'wizard.step.sites': 'Sites',
  'wizard.step.review': 'Review',
  'wizard.emails': 'Emails',
  'wizard.emailsPlaceholder': 'name@company.com, another@company.com',
  'wizard.emailsMore': 'Add another…',
  'wizard.emailsHint': 'Paste a list or type one at a time. Everyone here gets the same role and sites.',
  'wizard.removeEmail': 'Remove {email}',
  'wizard.role': 'Role',
  'wizard.sitesHint': 'Only the site you have open is ticked. Tick more to invite to several at once.',
  'wizard.thisSite': 'This site',
  'wizard.selectedOne': '1 site selected',
  'wizard.selectedMany': '{count} sites selected',
  /** Title of the permission list in Change role: one whole sentence per role, article included. */
  'wizard.permissionsTitle.owner': 'What an Owner can do',
  'wizard.permissionsTitle.editor': 'What an Editor can do',
  'wizard.permissionsTitle.viewer': 'What a Viewer can do',
  /** Under the wizard's role list and the Approve dialog's permission list. */
  'wizard.ownerNote': 'Owners are made from the Team list, after someone joins.',
  /** Under the permission list of Change role. */
  'dialog.changeRole.ownerNote': 'Owners are made here, never by invitation.',
  'permission.view': 'See the site and its changes',
  'permission.commentAsk': 'Comment and ask Tracy about the site',
  'permission.changeSite': 'Change the site with Tracy: pages, design, code, settings',
  'permission.publish': 'Publish and restore backups',
  'permission.invite': 'Invite Viewers and Editors',
  'permission.manageRoster': 'Change roles or remove people',
  'permission.domain': 'Connect a custom domain',
  'permission.makeOwner': 'Make someone an owner',
  'permission.deleteSite': 'Delete the site',
  /** Review shows the Inbox card the invited person gets, in the Inbox's own words. */
  'wizard.reviewTitle': 'They will get this',
  'wizard.preview.invited': 'Invited you as {asRole} on {site}',
  /** The coloured verb at the start of the line above, as the Inbox draws it. */
  'wizard.preview.verb': 'Invited',
  'wizard.asRole.editor': 'an Editor',
  'wizard.asRole.viewer': 'a Viewer',
  'wizard.preview.accept': 'Accept',
  'wizard.preview.decline': 'Decline',
  'wizard.reviewFacts': '{emails} · {role} · {sites}. The link works for 7 days.',
  'wizard.siteCountOne': '1 site',
  'wizard.siteCountMany': '{count} sites',
  'wizard.reviewSummaryOne': 'One email for 1 site',
  'wizard.reviewSummaryMany': 'One email for {count} sites',
  'wizard.send': 'Send invitation',
  'wizard.sendMany': 'Send {count} invitations',
  'wizard.sending': 'Sending',
  'wizard.back': 'Back',
  'wizard.continue': 'Continue',
  'wizard.done': 'Done',
  'wizard.doneTitle': 'Invitation sent',
  'wizard.doneBody': '{email} gets an email. They join {site} once they accept.',
  'wizard.inviteMore': 'Invite more',
  /** Spam hints D1 + D2 on Done (Akemi 05/10, variant C): the invite link and email rows. */
  'wizard.linkTitle': 'Invite link',
  'wizard.linkHelp': 'Share this link in any chat. Only {email} can use it, for 7 days.',
  'wizard.copyLink': 'Copy invite link',
  'wizard.linkCopied': 'Invite link copied',
  'wizard.copyFailed': 'Could not copy the link. Select it below and copy it.',
  'wizard.emailSentTitle': 'Email sent',
  'wizard.emailSentHelp': 'If they don’t see the email, ask them to check Spam.',
  'outcome.invited': 'Invited, waiting for them to accept',
  'outcome.approved': 'Let in',
  'outcome.alreadyGranted': 'Already has a seat',
  'outcome.refused': 'Refused, nothing changed',
  'outcome.notMailed': 'Recorded, but the email could not be sent',
  // Why one site was refused, and what to do next; shown under "Refused, nothing changed".
  'outcome.next.notSiteOwner':
    'Your role on this site cannot invite with this role. Ask an Owner to send this invitation.',
  'outcome.next.notSiteEditor': 'Viewers cannot invite people. Ask an Owner or an Editor of this site.',
  'outcome.next.notAuthorized':
    'You do not have an accepted seat on this site. Accept your own invitation first, or ask an Owner or an Editor of this site to send this one.',
  'outcome.next.changed': 'This person’s seat changed just now. Open the Team tab and try again.',
  /** The door refused the whole run before writing anything (a 4xx). */
  'wizard.failed':
    'Tracy could not send these invitations, and nothing was changed. Go back to check the addresses and sites, then send again.',
  'wizard.unknown':
    'No clear answer came back, so some invitations may already be recorded. Check the team list before sending again.',

  // ── Refusals the seat book has a name for ───────────────────────────────────────────────
  /** Unnamed, or no answer at all: the outcome is not known, so the sentence does not claim one. */
  'error.failed': 'Tracy could not complete that. Reload the page to see what is current, then try again.',
  /** A role too low. Which role is enough differs by action, so the sentence names the way out. */
  'error.notSiteOwner':
    'Your role on this site does not allow this. Ask an Owner of the site to do it, or to change your role.',
  'error.lastOwner': 'This is the site’s last Owner. Make someone else an Owner first.',
  'error.self': 'You can’t revoke your own seat. Ask another Owner to do it.',
  'error.rateLimited': 'Too many changes this hour. Try again shortly.',
  'error.gone': 'That seat is already gone. The list has been refreshed.',
  'error.signedOut': 'You have been signed out. Reload the page to sign in, then try again.',
  'error.noSeat': 'You no longer have a seat on this site. Ask an Owner or an Editor to invite you again.',
  /** The request for edit access was already answered by another Owner, or withdrawn. */
  'error.editRequestGone': 'This request was already answered. The list has been refreshed.',
  /** The row moved on while its confirm step was open (an invitation accepted, a request approved). */
  'error.changed': 'This row changed before you confirmed, so nothing was done. The list has been refreshed.',
  /**
   * The Publish tab as a stepped wizard (23/10/2026, the Add site shell): first the kind of
   * publish, then its steps. `flow.*` are the wizard's own words; `zip.*` and `sync.*` came with
   * the Export and Sync from live dialogs of My Sites, which are now flows of this tab.
   */
  'flow.steps': 'Publish steps',
  'flow.position': 'Step {n} of {total}',
  'flow.back': 'Back',
  'flow.skip': 'Skip',
  'flow.continue': 'Continue',
  /** Beside "Step N of M": the flow the person is in. */
  'flow.name.choose': 'Publishing',
  'flow.name.online': 'Online with Tracy',
  'flow.name.zip': 'Download a ZIP',
  /** The accessible name of each segment of the step bar. */
  'flow.step.kind': 'Choose how',
  'flow.step.address': 'Tracy address',
  'flow.step.sync': 'Latest changes',
  'flow.step.domain': 'Your domain',
  'flow.step.zip': 'Download',
  'flow.kind.title': 'How do you want to publish this site?',
  'flow.kind.desc': 'Choose where the site will run. You can come back and choose the other way later.',
  'flow.kind.online': 'Make it live on Tracy',
  'flow.kind.onlineDesc':
    'Search engines can find it and it can send email. Then you connect a domain you own.',
  'flow.kind.bestIf': 'Best if',
  'flow.kind.onlineBest': 'you want Tracy to host the site and you keep editing it here.',
  'flow.kind.zipBest': 'you already have hosting. Changes you make in Tracy afterwards are not in the ZIP.',
  'flow.kind.zip': 'Download a ZIP',
  'flow.kind.zipDesc': "Get your site's files and database to host it somewhere else.",
  'flow.address.titleDraft': 'Publish on your Tracy address',
  'flow.address.titleGoing': 'Publishing your site',
  'flow.address.titleLive': 'Your site is live',
  'flow.address.descDraft': 'Publishing lets search engines list the site and lets it send email.',
  'flow.address.descLive': 'Anyone can open the site at its Tracy address, and it can send email.',
  'flow.address.change': 'Change',
  'flow.address.changeLabel': 'Change the tracy.site name',
  'flow.address.ownDomain': 'Your own domain',
  'flow.address.ownDomainDraft':
    'Like www.example.com. You connect it in the next step, right after you publish.',
  'flow.address.ownDomainLive': 'Like www.example.com. Continue to connect it.',
  'flow.address.ownDomainEditor':
    'Only the site Owner can connect a domain like www.example.com. Ask them if you need one.',
  'flow.domain.title': 'Connect a domain you own',
  'flow.domain.desc': 'Optional. {address} keeps answering. A connected domain is added beside it.',
  'flow.domain.check': 'Check availability',
  'flow.sync.title': 'Bring in the latest changes from your original site',
  'flow.sync.desc':
    'Tracy copies what changed on your original site into this copy. What Tracy changed here stays.',
  /** The ZIP flow's three milestones, under the running line. */
  'flow.zip.stepBackup': 'Make a fresh backup',
  'flow.zip.stepPack': 'Pack the ZIP',
  'flow.zip.stepCode': 'Verify with a code from your email',
  /** The last step of an imported site on a platform Sync from live cannot read. */
  'flow.wpImported': 'Changes made on your original site after you imported it are not in this copy.',
  /** Sync to live, the Owner's third kind on an imported site: Tracy's changes go back to its live site. */
  'flow.name.live': 'Sync to live',
  'flow.step.push': 'Review',
  'flow.step.send': 'Send',
  'flow.kind.live': 'Send changes to your live site',
  'flow.kind.liveDesc': 'Your site stays on its own hosting. Tracy sends what it changed on this copy there.',
  'flow.kind.liveBest': 'you imported this site and it stays where it is hosted now.',
  'flow.send.title': 'Send the changes to your live site',
  'flow.send.desc': 'Nothing on your live site changes until you confirm. You can undo it afterwards.',
  /** Export site as ZIP (Owner only). */
  'zip.readyTitle': 'Your ZIP is ready',
  'zip.backupTitle': 'Site export',
  'zip.body': 'Includes site files and database.',
  'zip.privacy': 'Contains personal data and site secrets. Keep it private.',
  'zip.detail.backup': 'Fresh backup of files and database',
  'zip.detail.largeFiles': 'Files over 50 MB included',
  'zip.detail.limit': 'Up to 1 GiB',
  'zip.detail.readme': 'README with steps to move the site',
  'zip.tooLarge': 'This site’s ZIP is larger than the 1 GiB limit, so Tracy could not prepare it.',
  'zip.noSpace':
    'There is not enough temporary space on the site’s host to prepare this ZIP. Try again later or reduce the site’s files.',
  /** BACKUP_NOT_FULL: the fresh backup kept the files but not the database, so no ZIP was made. */
  'zip.backupNotFull':
    'Tracy could not finish a full backup of your site, so the ZIP was not made. Your site files were saved, but the copy of your database did not complete, and a ZIP without it would not work on a new host.',
  'zip.backupNotFullNext':
    'Press Try again to make a new backup. If it stops at the same point again, your site’s database may be unavailable: check that your site opens, then try again in a few minutes.',
  'zip.backingUp': 'Making a fresh backup…',
  'zip.packing': 'Packing the ZIP…',
  'zip.ready': 'We’ll email you a 6-digit code to verify your download.',
  'zip.code': 'Enter the code from your email',
  'zip.codeHint': 'The code expires in 10 minutes.',
  'zip.codeInvalid': 'That code is not right. Try again.',
  'zip.codeExpired': 'That code has expired. Resend code.',
  'zip.codeTooManyAttempts': 'Too many attempts. Resend code.',
  'zip.resend': 'Resend code',
  'zip.sendCode': 'Send code',
  'zip.download': 'Download',
  'zip.downloaded': 'Download started.',
  'zip.working': 'Working',
  'zip.start': 'Prepare ZIP',
  'zip.tryAgain': 'Try again',
  'zip.failed': 'The ZIP could not be prepared or downloaded ({error}).',
  /** Over the install code: the six digits the ZIP's installer may ask for. */
  'zip.installCode': 'Install code',
  /** The same, when the flow opens on a package downloaded earlier that has since expired. */
  'zip.installCodeEarlier': 'Install code of your last ZIP (backup {version})',
  'zip.installCodeHint': 'Only needed if the database of the new host is on a different server.',
  /** The copy button's accessible name. */
  'zip.installCodeCopy': 'Copy install code',
  /** Sync from live (an imported Joomla or WordPress site: its original merged into this copy). */
  'sync.deleted': 'deleted',
  /** After a sync: places both sites changed, where Tracy's version stayed (opens a list). */
  'sync.kept': 'Both sites changed {count} places. Tracy’s version was kept there.',
  /** In that list, before each side's value. */
  'sync.keptTracy': 'Kept (Tracy):',
  'sync.keptLive': 'On the original site:',
  /** A sync that stopped before changing anything: records new on both sites it cannot keep side by side. */
  'sync.held':
    'Both sites added {count} new records Tracy cannot keep side by side. Nothing was changed yet.',
  'sync.heldRow': '{table}: live record {id}',
  'sync.heldReference': '{table}.{column} points at live record {id}',
  'sync.allowHeld': 'Sync anyway, keep Tracy’s records',
  /** A file both sites changed on the same lines. */
  'sync.keptFileLines':
    'Tracy’s lines were kept where both changed them; the rest of the file came from the original site.',
  /** A file one site deleted or replaced as a whole. */
  'sync.keptFile': 'Tracy’s version of this file was kept.',
  /** A kept whole table (its rows could not be matched one by one, or its shape changed). */
  'sync.keptTable': 'Tracy’s version of this whole table was kept.',
  /** A kept list of siblings (a menu) both sites reordered; each side's order follows. */
  'sync.keptOrder': 'Both sites changed the order of these items. Tracy’s order was kept.',
  /** After an applied sync: the original site's records the copy did not take (opens a list). */
  'sync.dropped': 'This copy did not take {count} records of your original site.',
  /** Why one was not taken: new on both sites under one number. */
  'sync.dropReason.addedBoth': 'Both sites added a record under this number. Tracy’s was kept.',
  /** … a row pointing at a record of the original site that was numbered again. */
  'sync.dropReason.reference':
    'It points at a record of your original site that has a new number here, and Tracy could not update it.',
  'sync.failed': 'The sync did not finish ({error}). Nothing on this copy was changed.',
  /** The site's write lease is held: Tracy (a chat) wrote to this copy in the last minute and a half. */
  'sync.busy': 'Tracy is changing this site right now. Try again in a minute or two.',
  /**
   * Applied, but what the CMS must redo after it failed (SYNC_AFTER_FAILED): Joomla's menu and category
   * order, WordPress's term and comment counts, either one's caches.
   */
  'sync.afterFailed':
    'The changes from your original site were put on this copy, but the site could not finish its own clean-up after them (menu and category order, counts or caches). Restore the backup point “Before restore” to undo this sync.',
  'sync.now': 'Sync now',
  'sync.again': 'Sync again',
  'sync.retry': 'Try again',
  /** The Sync step's one line of state (`use-live-sync.ts` SyncPhase). */
  'sync.status.loading': 'Checking…',
  'sync.status.unreadable': 'Couldn’t check the sync',
  'sync.status.unreadableBody': 'Tracy could not read this site’s sync status ({error}).',
  'sync.status.unavailable': 'Sync from live isn’t available here',
  'sync.status.never': 'Not synced yet',
  'sync.status.neverBody': 'This copy still has your original site as it was when you imported it.',
  'sync.status.running': 'Syncing…',
  'sync.status.runningBody':
    'You can close this window: the sync goes on, and this copy changes only at the end.',
  'sync.status.started': 'Started {when}',
  'sync.status.upToDate': 'Up to date',
  'sync.status.upToDateBody': 'Matches your original site as read {when}.',
  'sync.status.brought': '{files} files and {records} records came from your original site.',
  'sync.status.nothingNew': 'Nothing had changed on your original site.',
  'sync.status.broughtSmall':
    'Only small changes came from your original site, such as dates and version numbers. No page or setting you edit changed.',
  'sync.status.held': 'Needs your decision',
  'sync.status.failed': 'Couldn’t sync',
  'sync.status.code': 'Code for support: {code}',
  /**
   * Sync to live, the Publish tab's `live` flow (`@tracy/core` `site-tabs/publish/PushStep.tsx`; moved
   * from My Sites' dialog on 25/10/2026): an imported site's Owner sends the content changes Tracy made
   * on this copy to the live site, after a preview and a confirm; Undo puts back what it overwrote.
   */
  'push.dialogTitle': 'Sync to live',
  'push.dialogBody':
    'Send the changes Tracy made on this copy to your live site: content, files and settings. Nothing is written until you confirm.',
  'push.status.unreadable': 'Couldn’t check Sync to live',
  'push.status.unreadableBody': 'Tracy could not read this site’s Sync to live status ({error}).',
  'push.status.unavailable': 'Sync to live isn’t available here',
  'push.why.not-imported': 'This site was built in Tracy, so there is no live site to send changes to.',
  'push.why.platform': 'Sync to live works for imported WordPress and Joomla sites.',
  'push.why.not-connected':
    'Tracy is not connected to your live site, so it cannot write to it. Contact us to connect it again.',
  'push.status.ready': 'Ready to preview',
  'push.status.readyBody':
    'Tracy first brings in what changed on your live site, then lists the changes it would send.',
  'push.status.previewing': 'Preparing the preview…',
  'push.status.runningBody': 'You can close this window: Tracy goes on.',
  'push.status.held': 'Sync from live needs your decision first',
  'push.status.heldBody':
    'Some records of your live site could not be brought into this copy. Open Sync from live, decide there, then preview again.',
  'push.status.review': 'Review the changes',
  'push.status.reviewBody': 'What Tracy changed on this copy and can send to your live site.',
  'push.status.nothing': 'Nothing to send',
  'push.status.nothingBody': 'Your live site already has every change Tracy can send.',
  'push.status.expired': 'This preview is out of date',
  'push.status.expiredBody':
    'A preview can be used for 30 minutes. Preview again to see the changes as they are now.',
  'push.status.confirm': 'Write these changes to your live site?',
  'push.status.confirmBody':
    '{count} changes go to your live site: {add} added, {change} changed, {remove} removed. You can undo them afterwards.',
  'push.status.pushing': 'Syncing to live…',
  'push.status.pushed': 'Synced to live',
  'push.status.pushedBody': '{count} changes reached your live site {when}.',
  'push.status.partial': 'Sync to live stopped part way',
  'push.status.partialBody': '{count} changes reached your live site before it stopped. You can undo them.',
  'push.status.undoing': 'Undoing…',
  'push.status.undone': 'Sync to live undone',
  'push.status.undoneBody': '{count} changes on your live site were put back as they were.',
  'push.status.failed': 'Couldn’t sync to live',
  'push.group.add': 'Will add ({count})',
  'push.group.change': 'Will change ({count})',
  'push.group.remove': 'Will remove ({count})',
  'push.group.removeHint':
    'Not removed unless you tick the box below. On your live site they go to the trash.',
  'push.group.unsupported': 'Not supported yet ({count})',
  'push.group.unsupportedHint':
    'Tracy changed these too, but Sync to live cannot send them yet. They stay on this copy only.',
  'push.group.liveChanged': 'Changed on your live site since the last sync ({count})',
  'push.group.liveChangedHint':
    'Your live site changed these as well, so they are not sent. Your live site’s version stays.',
  'push.group.files': 'Will change files ({count})',
  'push.group.filesHint':
    'Theme files and pictures. Each is written only where your live site still has the version Tracy last read.',
  'push.group.settings': 'Will change settings ({count})',
  'push.group.php': 'PHP files — needs your OK ({count})',
  'push.group.phpHint':
    'Each passed a PHP check for the PHP version your live site runs. PHP code runs on your site, so these are sent only if you tick the box below.',
  'push.sendPhp': 'Also send these PHP files to my live site',
  'push.reason.noFileDoor': 'Claude Cowork on your live site cannot write this file',
  'push.reason.excluded': 'Your site makes this itself, so it is never sent',
  'push.reason.symlink': 'A link to another file, never sent',
  'push.reason.tooLarge': 'Larger than 8 MB',
  'push.reason.permalink': 'Page addresses on your live site are never changed',
  'push.reason.phpLint': 'Did not pass the PHP check for your live site',
  'push.reason.phpUnchecked': 'Could not be checked for your live site’s PHP version',
  'push.reason.extensionFile': 'Belongs to an extension, so it goes only with that extension',
  'push.reason.noDoor': 'There is no safe way to write this setting yet',
  'push.reason.phpDisabled':
    'PHP files are switched off for Claude Cowork on your live site. To send them, turn on “Allow PHP in template files” in the Claude Cowork options on your site',
  'push.reason.phpDisabledWordpress':
    'PHP files are switched off for Claude Cowork on your live site. To send them, turn on “Allow PHP in theme files” in Settings › Claude Cowork on your site',
  'push.reason.templateFilesOff':
    'Template files are switched off for Claude Cowork on your live site. To send them, turn on “Template files” in the Claude Cowork options on your site',
  'push.reason.templateFilesOffWordpress':
    'Theme files are switched off for Claude Cowork on your live site. To send them, turn on “Theme files” in Settings › Claude Cowork on your site',
  'push.reason.notTemplateFile': 'Claude Cowork on your live site does not write this kind of file',
  'push.reason.notLiveTemplate':
    'Your live site does not use this template or theme, so its files are not sent',
  'push.reason.tooLargeLimit':
    'Larger than {limit}, the most Claude Cowork on your live site takes for one file',
  'push.warning.parentTheme': 'In the parent theme: an update of that theme replaces this file',
  'push.result.pushed': 'Sent to your live site ({count})',
  'push.result.conflicts': 'Not sent: changed on your live site ({count})',
  'push.result.conflictsHint':
    'Someone changed these on your live site after Tracy read it. They were left as they are.',
  'push.status.nothingSent': 'Nothing was sent',
  'push.status.nothingSentBody':
    'Your live site was not changed. Below is why each change stayed on Tracy’s copy.',
  'push.status.nothingSentOpen':
    'Your live site was not changed: the changes below are open in an editor on your live site. Once they are saved or closed there, press Preview again.',
  'push.result.open': 'Not sent: open in an editor on your live site ({count})',
  'push.result.openHint':
    'Someone has these open in the editor of your live site, so Tracy did not write them: their next Save would undo it. Once they are saved or closed, press Preview again.',
  'push.result.openBy': 'open by {name}',
  'push.result.goneOnLive': 'deleted on your live site',
  // What a change is, the fields it changed, a setting's fixed words (record-words.ts).
  'push.what.page': 'Page',
  'push.what.post': 'Post',
  'push.what.article': 'Article',
  'push.what.category': 'Category',
  'push.what.tag': 'Tag',
  'push.what.menuItem': 'Menu item',
  'push.what.menu': 'Menu',
  'push.what.module': 'Module',
  'push.what.customField': 'Custom field',
  'push.what.redirect': 'Redirect',
  'push.what.setting': 'Setting',
  'push.what.templatePart': 'Template part',
  'push.what.template': 'Template',
  'push.what.navigation': 'Navigation',
  'push.what.pattern': 'Pattern',
  'push.what.pageDetail': 'Page detail',
  'push.what.media': 'Media',
  'push.what.file': 'File',
  'push.what.user': 'User',
  'push.what.comment': 'Comment',
  'push.field.title': 'Title',
  'push.field.content': 'Content',
  'push.field.excerpt': 'Excerpt',
  'push.field.status': 'Status',
  'push.field.address': 'Address',
  'push.field.category': 'Category',
  'push.field.place': 'Parent',
  'push.field.tags': 'Tags',
  'push.field.order': 'Order',
  'push.field.position': 'Position',
  'push.field.date': 'Date',
  'push.field.settings': 'Settings',
  'push.field.images': 'Images',
  'push.field.seo': 'Search engine text',
  'push.field.language': 'Language',
  'push.field.access': 'Who can see it',
  'push.field.featured': 'Featured',
  'push.field.note': 'Note',
  'push.field.pages': 'Pages it shows on',
  'push.field.value': 'Value',
  'push.field.area': 'Area',
  'push.field.file': 'File',
  'push.field.siteName': 'Site name',
  'push.field.siteNameInTitles': 'Site name in page titles',
  'push.field.slogan': 'Slogan',
  'push.field.logo': 'Logo',
  'push.field.favicon': 'Favicon',
  'push.field.shareImage': 'Share image',
  'push.field.fonts': 'Fonts',
  'push.field.other': 'Other details',
  'push.label.blogname': 'Site title',
  'push.label.blogdescription': 'Tagline',
  'push.label.date_format': 'Date format',
  'push.label.time_format': 'Time format',
  'push.label.start_of_week': 'Week starts on',
  'push.label.posts_per_page': 'Posts per page',
  'push.label.show_on_front': 'Your homepage displays',
  'push.label.page_on_front': 'Homepage',
  'push.label.page_for_posts': 'Posts page',
  'push.label.site_icon': 'Site icon',
  'push.label.timezone_string': 'Timezone',
  'push.label.gmt_offset': 'Timezone',
  'push.label.posts_per_rss': 'Syndication feeds show the most recent',
  'push.label.rss_use_excerpt': 'For each post in a feed',
  'push.label.default_comment_status': 'Allow comments on new posts',
  'push.label.default_ping_status': 'Allow pingbacks and trackbacks',
  'push.label.comment_registration': 'Users must be registered to comment',
  'push.label.comments_per_page': 'Comments per page',
  'push.label.page_comments': 'Break comments into pages',
  'push.label.thread_comments': 'Threaded comments',
  'push.label.permalink_structure': 'Permalink structure',
  'push.label.category_base': 'Category base',
  'push.label.tag_base': 'Tag base',
  'push.label.additionalCss': 'Additional CSS',
  'push.label.customizer': 'Customizer',
  'push.label.templateStyle': 'Template style',
  'push.label.styles': 'Styles',
  'push.label.globalConfiguration': 'Global Configuration',
  'push.result.failed': 'Could not be written ({count})',
  'push.undo.conflicts': 'Not put back: changed again on your live site ({count})',
  'push.undo.conflictsHint': 'Someone changed these on your live site after the sync. Their version stays.',
  'push.undo.failed': 'Could not be put back ({count})',
  'push.preview': 'Preview changes',
  'push.previewAgain': 'Preview again',
  'push.continue': 'Continue',
  'push.back': 'Back',
  'push.confirm': 'Sync to live',
  'push.undo': 'Undo sync to live',
  'push.undoConfirm':
    'Put back what this sync changed on your live site? Places changed there since are left as they are.',
  'push.undoNow': 'Undo on live',
  'push.keep': 'Keep',
  'push.lastPush': 'Last sync to live {when}: {count} changes.',
  'push.stage.syncing': 'Bring in what changed on your live site',
  'push.stage.comparing': 'List what Tracy changed',
  'push.stage.writing': 'Write the changes to your live site',
  'push.stage.settling': 'Read your live site again',
  'push.stage.undoing': 'Put back what was changed',
  'push.error.busy': 'Tracy is changing this site right now. Try again in a minute or two.',
  'push.error.syncRunning': 'A Sync from live is running on this site. Try again when it ends.',
  'push.error.superseded': 'A newer preview was made. Use that one.',
  'push.error.copyChanged': 'This copy changed after the preview, so nothing was sent. Preview again.',
  'push.error.interrupted':
    'Tracy’s server was updated while this ran, so it stopped. Preview again to see where your live site stands.',
  'push.error.liveUnreachable':
    'Tracy could not reach your live site. Check that it is online and that Claude Cowork is still installed on it.',
  'push.removeAll': 'Also remove these from my live site',
  'push.overLimit':
    'Sync to live sends at most {max} changes at once: the first {max} go now, and the rest the next time.',
  'push.result.skipped': 'Not sent this time ({count})',
  'push.result.skippedHint':
    'Over the limit of one sync to live, a removal you did not tick, or a change that needed one that failed. Preview again to send them.',
  'push.error.syncFailed':
    'Tracy could not first bring in what changed on your live site, so nothing was listed. Open Sync from live to see why.',
  'push.error.notPushed': 'This sync to live can no longer be undone: Tracy keeps what it needs for 30 days.',
  'push.failed': 'Sync to live did not finish ({error}).',
  /** Why a site has no Sync from live (`GET /api/sites/:key/sync` `why`). */
  'sync.why.not-imported': 'This site was built in Tracy, so there is no original site to sync from.',
  'sync.why.platform': 'Sync from live works for imported WordPress and Joomla sites.',
  'sync.why.not-connected':
    'Tracy is not connected to your original site, so it cannot read it. Contact us to connect it again.',
  /** The three steps of a running sync. */
  'sync.stage.reading': 'Read your original site',
  'sync.stage.merging': 'Combine it with this copy',
  'sync.stage.applying': 'Put the result in place',
  /** Why a sync stopped, for the codes a customer can act on. */
  'sync.error.liveBusy':
    'Your original site kept changing while Tracy read it. Nothing on this copy was changed. Try again when the site is quiet.',
  /** Which part of the original site kept changing (the sync view's `busy.parts`), after the sentence above. */
  'sync.error.liveBusyParts': 'What kept changing: {parts}.',
  'sync.part.content': 'pages and posts',
  'sync.part.settings': 'site settings',
  'sync.part.users': 'user accounts',
  'sync.part.comments': 'comments',
  'sync.part.files': 'files',
  'sync.part.other': 'other data',
  /** The host restarted under the sync, a deploy replacing it (SYNC_INTERRUPTED). */
  'sync.error.interrupted':
    'Tracy’s server was updated while this sync ran, so the sync stopped. Your original site was not changed. Sync again to start over.',
  /** An earlier apply was cut off and the copy changed since: nothing was written (APPLY_INTERRUPTED_KEPT). */
  'sync.error.interruptedKept':
    'An earlier sync was stopped by a Tracy update while it was putting changes on this copy, and this copy has changed since. Tracy left it as it is. To undo that earlier sync, restore the backup point “Before restore” in Backups, then sync again.',
  'sync.error.liveBlocked':
    'Your live site returned a blocked or non-engine response. Check its firewall or bot protection and allow Tracy’s requests.',
  'sync.error.livePassword':
    'Your live site requires an HTTP password. Allow Tracy to access the Claude Cowork endpoint without that password, then try again.',
  /** The live site's PHP is below what Claude Cowork needs (LIVE_PHP_TOO_OLD), both versions known. */
  'sync.error.livePhpTooOld':
    'Your live site runs PHP {php}. Claude Cowork needs PHP {min} or newer. Ask your host to upgrade PHP, then try again.',
  /** LIVE_PHP_TOO_OLD from an answer that did not name the versions. */
  'sync.error.livePhpTooOldPlain':
    'Your live site runs a PHP version too old for Claude Cowork. Ask your host to upgrade PHP, then try again.',
  'sync.error.liveRateLimited':
    'Your live site is limiting requests. Wait before trying again; Tracy respects its Retry-After delay.',
  'sync.error.liveToken':
    'Your live site refused the Claude Cowork token. Reconnect the live site with its current token, then try again.',
  'sync.error.liveUnreachable':
    'Tracy could not read your original site. Nothing on this copy was changed. Check that the site is online and that Claude Cowork is still installed on it.',
  'sync.error.copyChanged': 'This copy changed while the sync ran, so nothing was put in place. Try again.',
  'sync.error.noSpace':
    'Tracy’s server had no room for this sync. Nothing on this copy was changed. Please contact us.'
} as const

export type Translate = (key: keyof typeof en | string, params?: Record<string, string | number>) => string
