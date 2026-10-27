/**
 * Desktop App Statistics (`/ops/app-statistic`), plus the statistics primitives every statistics
 * screen shares (tile, filter picker, report status). Record values the server sends (emails,
 * versions, template names, sources, issue reasons) are shown as sent.
 */
export const NS = 'appstat'

export const SCREENS = [
  'beta/AppStatistic.tsx',
  'beta/AppStatisticDetailPanel.tsx',
  'beta/AppStatisticFilters.tsx',
  'beta/AppStatisticGrowthPanels.tsx',
  'beta/AppStatisticOverview.tsx',
  'beta/AppStatisticRecords.tsx',
  'beta/app-statistic-api.ts',
  'beta/app-statistic-copy.ts',
  'beta/app-statistic-state.ts',
  'beta/StatisticsFilter.tsx',
  'beta/StatisticsHeader.tsx',
  'beta/StatisticsKpi.tsx',
  'beta/StatisticsNote.tsx',
  'beta/StatisticsReportStatus.tsx'
] as const

export const en = {
  // ── Page ──
  'appstat.title': 'Desktop App Statistics',
  'appstat.description': 'Who uses the desktop app, and who requested a download?',
  'appstat.views': 'Statistic views',
  'appstat.view.users': 'People and app status',
  'appstat.view.downloads': 'App download requests',
  'appstat.view.installs': 'App connections',
  'appstat.view.quickstarts': 'Template package requests',
  'appstat.onlyFrom': 'Only records from {who}',
  'appstat.onlyFromSelected': 'Only records from the selected account',
  'appstat.clearAccount': 'Clear account',
  'appstat.signInAgain': 'Sign in again',
  'appstat.loading': 'Loading desktop app statistics',
  'appstat.updated': 'Updated',
  'appstat.refreshes': '· UTC+7 · Refreshes every 30 seconds',
  'appstat.waiting': 'Waiting for desktop app statistics',
  'appstat.sortHint': 'Click a header to sort',
  'appstat.notRecorded': 'Not recorded',
  'appstat.notApplicable': 'Not applicable',
  'appstat.unavailable': 'Unavailable',
  'appstat.unknown': 'Unknown',
  'appstat.none': 'None',
  'appstat.timeUtc7': '{time} UTC+7',
  'appstat.basisUtc7': '{basis} · UTC+7',
  'appstat.processor': 'Processor: {arch}',
  'appstat.count.days_one': '{count} day',
  'appstat.count.days_other': '{count} days',
  'appstat.count.hours_one': '{count} hour',
  'appstat.count.hours_other': '{count} hours',
  'appstat.count.copies_one': '{count} app copy',
  'appstat.count.copies_other': '{count} app copies',

  // ── Read errors ──
  'appstat.error.signIn': 'Sign-in is required to refresh desktop app statistics.',
  'appstat.error.forbidden': 'Your account does not have access to desktop app statistics.',
  'appstat.error.statistics.status': 'Could not read desktop app statistics ({status}).',
  'appstat.error.statistics.unexpected':
    'Could not read desktop app statistics: the server returned an unexpected response. Try refreshing.',
  'appstat.error.statistics.invalid':
    'Could not read desktop app statistics: the server returned invalid data. Try refreshing.',
  'appstat.error.statistics.generic': 'Could not read app statistics.',
  'appstat.error.details.status': 'Could not read record details ({status}).',
  'appstat.error.details.unexpected':
    'Could not read record details: the server returned an unexpected response. Try refreshing.',
  'appstat.error.details.invalid':
    'Could not read record details: the server returned invalid data. Try refreshing.',
  'appstat.error.details.generic': 'Could not read record details.',

  // ── Meanings shown in several places ──
  'appstat.meaning.quickstart':
    'Quickstarts are JoomlArt template packages for websites, not the Tracy desktop app; these totals count requests, not completed downloads or created websites.',
  'appstat.meaning.releaseAccess':
    'This package is stored in a private GitHub project; opening it requires access.',
  'appstat.meaning.referrerUnknown':
    'The previous page was not recorded; older requests did not save it, and browsers may leave it out.',
  'appstat.meaning.connection':
    'An app connection is an update check and may happen in the background. Only the latest check per app copy is kept; a later check moves the copy out of its earlier day. Earlier connection days cannot be reconstructed. App opens are measured separately by foreground signals.',
  'appstat.meaning.activeUsers':
    'Counts people who opened or focused the app in this period. App copies signed in to the same account count once; each copy without a known account counts separately, unless the same copy also reports a signed-in open in this period. Background update checks do not count. This does not measure time spent or what people do.',
  'appstat.meaning.anonymousDownload':
    'Website app downloads are anonymous, so they appear in App download requests rather than against a person.',

  // ── Record words ──
  'appstat.status.opened': 'Opened app',
  'appstat.status.signedIn': 'Signed in to app',
  'appstat.status.templatesOnly': 'Template requests only',
  'appstat.activity.firstSignIn': 'First sign-in',
  'appstat.activity.appOpened': 'App opened',
  'appstat.activity.siteCreated': 'Site created',
  'appstat.activity.siteImported': 'Site imported',
  'appstat.activity.siteEdited': 'Site edited',
  'appstat.activity.changeUndone': 'Change undone',
  'appstat.activity.siteLive': 'Site went live',
  'appstat.activity.siteIssue': 'Site issue recorded',
  'appstat.activity.siteResult': 'Site result recorded',
  'appstat.activity.other': 'Other account activity',
  'appstat.dateBasis.users': 'Latest matching record per account',
  'appstat.dateBasis.installs': 'Last connection per app copy',
  'appstat.dateBasis.requests': 'Request time',
  'appstat.sourceField.source': 'Website or sender',
  'appstat.sourceField.medium': 'Marketing channel',
  'appstat.sourceField.campaign': 'Campaign name',
  'appstat.sourceField.content': 'Link or message version',
  'appstat.sourceField.other': 'Other marketing detail',
  'appstat.releaseType.stable': 'Public',
  'appstat.releaseType.dev': 'Development test',
  'appstat.releaseType.preview': 'Preview test',
  'appstat.source.download': 'Download link source',
  'appstat.source.firstSignIn': 'First sign-in source',

  // ── Filters ──
  'appstat.filters': 'App statistics filters',
  'appstat.period': 'Period',
  'appstat.period.24h': '24h',
  'appstat.period.days_one': '{count} day',
  'appstat.period.days_other': '{count} days',
  'appstat.period.all': 'All time',
  'appstat.period.custom': 'Custom',
  'appstat.compare': 'Compare previous period',
  'appstat.compare.help':
    'Compare with the immediately preceding period of the same length. The 24h period uses rolling hours; other dates follow UTC+7. A day in progress is compared with a complete prior period and shown neutrally. App connections and people are current record distributions, not historical growth. All time has no comparable prior period.',
  'appstat.range.exact': '{start} to {end} (end time not included)',
  'appstat.range.allRecorded': 'All recorded time',
  'appstat.range.last24h': 'Last 24 hours · {start} to {end} · UTC+7',
  'appstat.range.days': '{start} to {end} · UTC+7',
  'appstat.range.reading': 'Reading period...',
  'appstat.refresh': 'Refresh app statistics',
  'appstat.filter.version': 'App version',
  'appstat.filter.version.all': 'All versions',
  'appstat.filter.version.help': 'The version recorded on a download request or the latest app contact.',
  'appstat.filter.channel': 'App release type',
  'appstat.filter.channel.all': 'All release types',
  'appstat.filter.channel.help':
    'Public is the regular app release; test releases are used to try changes before public release.',
  'appstat.filter.platform': 'Operating system',
  'appstat.filter.platform.all': 'All systems',
  'appstat.filter.platform.help':
    'The computer operating system saved for the request or app copy, not a count of machines.',
  'appstat.filter.template': 'Template',
  'appstat.filter.template.all': 'All templates',
  'appstat.filter.template.help':
    'The JoomlArt website template package requested, not a desktop app download.',
  'appstat.filter.source.all': 'All sources',
  'appstat.filter.source.help.download': 'A source or channel recorded on the download link.',
  'appstat.filter.source.help.firstSignIn': 'A source or channel recorded when the account first signed in.',
  'appstat.filter.countsCopies': 'Counts show app copies in this view.',
  'appstat.filter.countsRequests': 'Counts show download requests in this view.',
  'appstat.filter.clear': 'Clear {label}',
  'appstat.account': 'Known account',
  'appstat.account.all': 'All accounts',
  'appstat.account.linked': 'Account known',
  'appstat.account.unlinked': 'Account unknown',
  'appstat.account.help':
    'Whether the request or app copy can be linked to a Tracy account. This does not show who is online.',
  'appstat.attention': 'Accounts with open site issues',
  'appstat.attention.help':
    'Show accounts with unresolved website problems, excluding app download and installation problems.',
  'appstat.reset': 'Reset',
  'appstat.custom.invalid': 'Choose valid dates ending today or earlier.',
  'appstat.custom.tooLong': 'Choose a date range of 1 to 366 days.',
  'appstat.custom.start': 'Start date',
  'appstat.custom.end': 'End date',
  'appstat.custom.to': 'to',
  'appstat.custom.apply': 'Apply',
  'appstat.howFilters': 'How filters work',
  'appstat.howFilters.body':
    'All numbers, charts and record rows use the current view, dates, search and applicable filters. Dates follow this rule: {basis}. Only known Tracy accounts are counted as accounts; they are not online users. Staff accounts are included. Downloads and quickstarts count requests, not completed downloads. App copies keep only their last connection, so this is not a history of every connection.',
  'appstat.howFilters.installs':
    'The first sign-in source filter does not apply here because app copies do not record where people came from.',
  'appstat.howFilters.quickstarts':
    'App version, app release type, operating system and known account filters do not apply to template package requests.',
  'appstat.howFilters.users':
    'Account totals exclude requests and app copies with no known account; those appear in the download and app copy tabs.',
  'appstat.howFilters.downloads':
    'Automatic app updates are excluded. A request with an unknown account does not prove that the app was never installed.',

  // ── Overview tiles ──
  'appstat.unit.peopleCopies_one': 'person / app copy',
  'appstat.unit.peopleCopies_other': 'people / app copies',
  'appstat.unit.accounts_one': 'account',
  'appstat.unit.accounts_other': 'accounts',
  'appstat.unit.requests_one': 'request',
  'appstat.unit.requests_other': 'requests',
  'appstat.unit.copies_one': 'app copy',
  'appstat.unit.copies_other': 'app copies',
  'appstat.metric.active': 'Active app users',
  'appstat.metric.active.note': 'Opened or focused the app, excludes background checks',
  'appstat.metric.people': 'People in current records',
  'appstat.metric.peopleRequesting': 'People requesting templates',
  'appstat.metric.people.users.definition':
    'Counts the union of existing Tracy accounts with matching current records once: app copies whose latest check falls in this period, signed-in app-open signals, or recorded template requests. This is a latest-state account union, not historical active users or people online.',
  'appstat.metric.people.installs.definition':
    'Counts each existing Tracy account linked to an app copy whose latest check falls in this period once. This is a latest-state account union, not historical active users or people online.',
  'appstat.metric.people.requests.definition':
    'Counts each existing Tracy account with matching requests once, excluding people without a known account and not measuring who is online.',
  'appstat.metric.people.users.note': 'Matching accounts, including template requests',
  'appstat.metric.people.installs.note': 'People with an account-linked app copy',
  'appstat.metric.people.requests.note': 'People requesting website template packages',
  'appstat.metric.downloads.definition':
    'Counts manual Tracy desktop app download requests, including repeat requests but excluding automatic updates, without confirming a completed download or installation.',
  'appstat.metric.requestsNote': 'Requests, not completed downloads',
  'appstat.metric.installs': 'Latest connection distribution',
  'appstat.metric.installs.definition':
    'Counts app copies whose last update check falls in this period, including background checks. This does not measure app opens, active use or physical machines.',
  'appstat.metric.installs.users.note': 'Only copies linked to these accounts',
  'appstat.metric.installs.note': 'May include background update checks',
  'appstat.metric.accountQuickstarts': 'Account template package requests',
  'appstat.metric.quickstarts.definition':
    'Counts accepted requests from signed-in accounts for JoomlArt template packages, including repeats but excluding desktop app downloads, without confirming completed downloads or created websites.',
  'appstat.metric.linked': 'Signed in to an account',
  'appstat.metric.linked.definition':
    'Counts matching app copies linked to a known Tracy account, excluding copies with an unknown account and not measuring who is online.',
  'appstat.metric.linked.note': 'Copies with a known Tracy account',
  'appstat.metric.unlinked': 'No known account',
  'appstat.metric.unlinked.definition':
    'Counts matching app copies with no known Tracy account, excluding copies linked to an account and not counting failed installations.',
  'appstat.metric.unlinked.note': 'Name and email are not known',
  'appstat.series.copiesByLast': 'App copies by last connection',
  'appstat.col.hour': 'Hour (UTC+7)',
  'appstat.col.day': 'Day (UTC+7)',
  'appstat.col.day.help':
    'Groups matching activity into UTC+7 calendar days, not the time zone of your computer.',
  'appstat.dayInProgress': 'Day in progress',
  'appstat.col.peopleByLatest': 'People by latest matching record',
  'appstat.note.partial':
    'This period is still in progress; the previous one is complete. Changes stay neutral.',
  'appstat.connections.label': 'App connections and opens',
  'appstat.connections.summary': 'Connections are update checks. App opens are counted separately.',
  'appstat.note.allTime':
    'All time starts with the first recorded event. Previous-period comparisons are unavailable.',
  'appstat.comparison.partial': 'Partial vs full period',
  'appstat.comparison.latestState': 'Latest-state comparison',
  'appstat.trend.hourly': 'Hourly trend',
  'appstat.trend.active': 'Distinct people / app copies each day, may repeat',
  'appstat.trend.notSplit': 'Daily split not recorded in this view',
  'appstat.trend.accounts': 'Distinct accounts each day, may repeat',
  'appstat.trend.latestRecord': 'By latest matching record',
  'appstat.trend.lastConnection': 'By last app connection',
  'appstat.trend.requests': 'Requests per day',
  'appstat.daily.latestByHour': 'Latest record distribution by hour',
  'appstat.daily.latestByDay': 'Latest record distribution by day',
  'appstat.daily.byHour': 'By hour',
  'appstat.daily.byDay': 'By day',
  'appstat.daily.users':
    'Each person appears on the day of their latest app open, app connection or template request. This does not show days of app use.',
  'appstat.daily.installs':
    'Each app copy appears only on the day it last connected to Tracy, not the day it was installed; one machine may have more than one copy.',
  'appstat.daily.requests':
    'Requests are grouped by day and may include repeat requests from one person; completed downloads are not recorded.',
  'appstat.daily.lastInProgress': 'Last day still in progress.',
  'appstat.chart.series': 'Visible app chart series',
  'appstat.chart.previousRecords': 'Previous records by day',
  'appstat.chart.previousPeriod': 'Previous period',
  'appstat.chart.label': 'Daily app statistics for the current view and filters',

  // ── Growth panels ──
  'appstat.note.downloadLink':
    'Download requests are not linked to app copies. Download completion and installation success are not recorded, so conversion from requests to app copies cannot be measured.',
  'appstat.funnel.title': 'App copy sign-in and opening',
  'appstat.funnel.sub': 'Same app copies at every step',
  'appstat.funnel.which': 'Which app copies are included?',
  'appstat.funnel.which.summary':
    'App copies with a latest update check in this period. Downloads are tracked separately.',
  'appstat.funnel.which.body':
    'Sign-in uses the account currently linked to the copy. An open counts when that account opened this copy in the period, after its first connection. Earlier sign-ins cannot be reconstructed.',
  'appstat.funnel.copies': 'App copies with a latest connection',
  'appstat.funnel.signedIn': 'Currently signed in',
  'appstat.funnel.opened': 'Opened with the current account',
  'appstat.funnel.step': 'Step',
  'appstat.funnel.step.help':
    'Each step is a subset of the previous step, using the same app copies and current filters.',
  'appstat.col.copies': 'App copies',
  'appstat.funnel.copies.help':
    'App copy IDs, not people or physical devices. Multiple copies may belong to one person.',
  'appstat.funnel.conversion': 'From previous step',
  'appstat.funnel.conversion.help':
    'This step divided by the previous step. Not applicable when there is no previous step or its count is zero.',
  'appstat.funnel.dropoff': 'Not in next step',
  'appstat.funnel.dropoff.help':
    'Copies in this step without proof of the following step. Missing opening data is not proof of abandonment.',
  'appstat.funnel.outside_one':
    '{n} opened copy outside this connection subset, including copies without a matching updater record. Anonymous opens and opens from a previous account do not prove opening with the current account.',
  'appstat.funnel.outside_other':
    '{n} opened copies outside this connection subset, including copies without a matching updater record. Anonymous opens and opens from a previous account do not prove opening with the current account.',
  'appstat.distribution.value': 'Recorded value',
  'appstat.distribution.value.help':
    'Unknown values remain in the denominator. App copies use their latest updater state; requests use the requested file.',
  'appstat.col.downloadRequests': 'Download requests',
  'appstat.distribution.count.help':
    'All matching records before pagination. This is not a count of people or physical devices.',
  'appstat.distribution.share': 'Share',
  'appstat.distribution.share.help':
    'Count divided by every filtered record in this distribution, including Unknown. Shares may differ slightly from 100% after rounding.',
  'appstat.breakdown.platform': 'Platform breakdown',
  'appstat.breakdown.version': 'Version breakdown',
  'appstat.breakdown.copies_one': '{n} matching app copy',
  'appstat.breakdown.copies_other': '{n} matching app copies',
  'appstat.breakdown.requests_one': '{n} matching download request',
  'appstat.breakdown.requests_other': '{n} matching download requests',
  'appstat.breakdown.copies.sub': 'Latest update-check details for these app copies.',
  'appstat.breakdown.requests.sub': 'File values recorded with each matching download request.',
  'appstat.breakdown.sub': 'Unknown is included. Sorting covers all groups.',
  'appstat.newCopies.byHour': 'New app copies by hour',
  'appstat.newCopies.byDay': 'New app copies by day',
  'appstat.newCopies.sub': 'First updater contact · UTC+7',
  'appstat.newCopies.body':
    'Each matching copy appears once, on its first recorded updater contact. This does not confirm installation success. Platform, version and account filters use current state, which can change later. This block uses first contact rather than the latest-connection period used above.',
  'appstat.newCopies.col': 'New app copies',
  'appstat.newCopies.chart': 'App copies by first recorded updater contact',
  'appstat.newCopies.day.help': 'First updater contact date in UTC+7, not installation date.',
  'appstat.newCopies.col.help': 'Distinct app copy IDs first seen that day, before pagination.',
  'appstat.adoption.byHour': 'Version adoption by hour',
  'appstat.adoption.byDay': 'Version adoption by day',
  'appstat.adoption.sub': 'Observed opened copies · UTC+7',
  'appstat.adoption.body':
    'Uses the version saved with the first matching foreground opening of each copy each day. A copy can appear on different versions across days. Shares use all matching opened copies that day, including Unknown, before pagination. An upgrade later the same day may not be recorded. Channel filters use the current updater channel.',
  'appstat.adoption.firstOpening': 'First collected app opening: {time}.',
  'appstat.adoption.notMeasured':
    'Earlier periods and days without events are not measured; current updater versions are never used to fill historical days.',
  'appstat.adoption.day.help':
    'Date of the app-open event, preserved independently of later updater changes.',
  'appstat.adoption.version': 'Opened version',
  'appstat.adoption.version.help':
    'Version recorded in the first matching open for this copy and day, not its current installed version.',
  'appstat.adoption.copies': 'Opened copies',
  'appstat.adoption.copies.help':
    'Distinct matching app copies that opened on this version that day, including anonymous copies.',
  'appstat.adoption.total': 'All opened copies that day',
  'appstat.adoption.total.help':
    'All filtered copies with a recorded open that day. A zero means no recorded events, not proof that nobody opened the app.',
  'appstat.adoption.share': 'Daily share',
  'appstat.adoption.share.help':
    'Copies on this version divided by all filtered opened copies that day. No recorded opens means no measurable share.',

  // ── Records table ──
  'appstat.col.person': 'Person',
  'appstat.col.person.help':
    'Shows the known Tracy account for this activity, excluding guesses based on a name or email and not showing whether someone is online.',
  'appstat.records.personDetails': 'Person details',
  'appstat.records.noAccount': 'This record is not linked to a known Tracy account.',
  'appstat.records.copiesConnected_one': '{count} app copy connected',
  'appstat.records.copiesConnected_other': '{count} app copies connected',
  'appstat.records.latestActivity': 'Latest app or template activity:',
  'appstat.records.viewConnections': 'View app connections',
  'appstat.records.viewTemplateRequests': 'View template requests',
  'appstat.records.lastLinked': 'Account last linked:',
  'appstat.records.viewPerson': 'View person',
  'appstat.records.detailsOf': 'Details {id}',
  'appstat.records.closeActivity': 'Close activity details',
  'appstat.records.viewActivity': 'View activity details',
  'appstat.col.lastConnection': 'Last app connection',
  'appstat.col.requested': 'Requested',
  'appstat.col.lastConnection.installs.help':
    'Shows when this app copy last connected to Tracy, not when installation completed, with the exact UTC+7 time on hover.',
  'appstat.col.lastConnection.users.help':
    'Shows the last matching app update check for this person, including background checks. It is not the last app open. Template requests and web sign-ins do not change it.',
  'appstat.col.requested.help':
    'Shows when Tracy received this download request, not when a download completed, with the exact UTC+7 time on hover.',
  'appstat.records.noConnection': 'No app connection',
  'appstat.col.version.help':
    'Shows app versions saved with matching requests or app copies, excluding versions Tracy has not received.',
  'appstat.records.versionDetails': 'App version details',
  'appstat.records.noVersion': 'No app version recorded.',
  'appstat.col.source': 'Came from',
  'appstat.col.source.download.help':
    'Shows the website or sender named on the download link, excluding sources that were not recorded.',
  'appstat.col.source.firstSignIn.help':
    'Shows the website or sender recorded at the account’s first sign-in, excluding later visits.',
  'appstat.records.marketing': 'Marketing details',
  'appstat.records.noMarketing': 'No marketing information was recorded.',
  'appstat.col.status': 'App status',
  'appstat.col.status.help':
    'Opened app means a signed-in app reported a foreground open in this period. Signed in to app means an account-linked app connected but no foreground open was recorded. Other statuses describe matching requests only.',
  'appstat.col.lastOpened': 'Last opened',
  'appstat.col.lastOpened.help':
    'Shows the latest recorded time in this period when this person opened or focused an app window. Background update checks do not change it. Hover for the exact UTC+7 time.',
  'appstat.records.noOpens': 'No recorded opens',
  'appstat.col.daysUsed': 'Days used',
  'appstat.col.daysUsed.help':
    'Counts distinct UTC+7 calendar days in this period when this person opened or focused an app window. Multiple app copies signed in to the same account share the same day count. Background update checks do not count.',
  'appstat.col.quickstarts': 'Template packages',
  'appstat.col.quickstarts.help':
    'Requests for website template packages in this period, including repeats. These are not desktop app downloads or created sites.',
  'appstat.col.problems': 'Site problems',
  'appstat.col.problems.help':
    'Counts unresolved website problems for this account, excluding app download and installation problems.',
  'appstat.records.problemsOpen': '{count} open',
  'appstat.col.template': 'Template package',
  'appstat.col.template.help':
    'Shows the JoomlArt template package requested, excluding the Tracy desktop app.',
  'appstat.col.cms': 'Website platform',
  'appstat.col.cms.help':
    'Shows the website software this template package is for, not the computer’s operating system.',
  'appstat.col.referrer': 'Previous page',
  'appstat.col.referrer.help':
    'Shows the page visited before this request when supplied by the browser, excluding pages that were not recorded.',
  'appstat.records.viewReferrer': 'View previous page',
  'appstat.col.request': 'Request',
  'appstat.records.viewRequest': 'View request',
  'appstat.col.channel.help':
    'Shows whether the app is a public or test release, excluding releases not saved with this activity.',
  'appstat.col.platform.help':
    'Shows the computer operating system and processor type saved with this activity, not a count of machines.',
  'appstat.col.firstConnection': 'First app connection',
  'appstat.col.firstConnection.help':
    'Shows when this app copy first connected to Tracy, not when the download or installation completed.',
  'appstat.records.users.sub':
    'One row per known person with an app open, app connection or download request in this period, including template-only requests. Hover or click a person for details.',
  'appstat.records.downloads.sub':
    'Download requests are anonymous. Click View request for file details. Search and filters apply to the totals above.',
  'appstat.records.other.sub':
    'Hover or click a person for record details. Search and filters apply to the totals above.',
  'appstat.records.quickstarts.sub':
    'These are requests for JoomlArt website template packages, not Tracy desktop app downloads or completed website creations.',
  'appstat.records.search': 'Search app records',

  // ── Detail panel ──
  'appstat.detail.label': 'Record details',
  'appstat.detail.downloadRequest': 'App download request',
  'appstat.detail.quickstartRequest': 'Template package request',
  'appstat.detail.copyDetails': 'App copy details',
  'appstat.detail.of': '{view} detail',
  'appstat.detail.close': 'Close details',
  'appstat.detail.reading': 'Reading record details…',
  'appstat.detail.showingLast': 'Showing the last details received.',
  'appstat.detail.viewCopy': 'View app copy',
  'appstat.detail.versionNotRecorded': 'Version not recorded',
  'appstat.detail.noCopies': 'No app copies have connected to Tracy.',
  'appstat.detail.viewAllCopies': 'View all app copies',
  'appstat.detail.latest100Copies': 'Only the latest 100 app copies appear here.',
  'appstat.detail.noQuickstarts': 'No template package requests recorded.',
  'appstat.detail.viewQuickstarts': 'View template package requests',
  'appstat.detail.latest100Requests': 'Only the latest 100 requests appear here.',
  'appstat.detail.templateNotRecorded': 'Template not recorded',
  'appstat.detail.requestedAt': 'Requested at',
  'appstat.detail.templatePage': 'Template page',
  'appstat.detail.noTemplatePage': 'No JoomlArt template page link was recorded.',
  'appstat.detail.packagePage': 'Package download page',
  'appstat.detail.account': 'Account',
  'appstat.detail.accountGone': 'Account no longer available',
  'appstat.detail.accountGone.body':
    'The account that made this request no longer exists. Name and email are unknown.',
  'appstat.detail.byAccount': 'Template package requests by this account',
  'appstat.detail.noOtherQuickstarts': 'No other template package requests recorded.',
  'appstat.detail.desktopApp': 'Desktop app',
  'appstat.detail.viewAccount': 'View this account',
  'appstat.detail.download': 'Download request',
  'appstat.detail.copy': 'App copy',
  'appstat.detail.osVersion': 'Operating system version: {version}',
  'appstat.detail.firstConnection': 'First connection',
  'appstat.detail.linkedAt': 'Account last linked at {time}',
  'appstat.detail.accountUnknown.body': 'Tracy does not know which account used this app copy.',
  'appstat.detail.downloadNote': 'Download completion is unknown. Automatic updates are excluded.',
  'appstat.detail.copyNote':
    'An app copy is tracked separately and does not identify a physical machine or show who is online.',
  'appstat.detail.issues': 'Open site issues · {count}',
  'appstat.detail.issueUnavailable': 'Issue details unavailable',
  'appstat.detail.step': 'Step: {step}',
  'appstat.detail.noIssues': 'No open issues recorded.',
  'appstat.detail.issuesLimited': 'Issue details are limited; more issues may exist.',
  'appstat.detail.activity': 'Account activity',
  'appstat.detail.activity.sub': 'These events may come from web or desktop.',
  'appstat.detail.noActivity': 'No related account activity recorded.',
  'appstat.detail.latest100Activity': 'Only the latest 100 activities appear here.',

  // ── Shared statistics primitives ──
  'appstat.retry': 'Try again',
  'appstat.empty.activity': 'activity',
  'appstat.empty.records': 'desktop records',
  'appstat.empty.24h': 'No {activity} in the last 24 hours.',
  'appstat.empty.all': 'No {activity} in the recorded history.',
  'appstat.empty.period': 'No {activity} in this period.',
  'appstat.kpi.scope': 'All filters apply',
  'appstat.kpi.trend': 'Daily trend',
  'appstat.kpi.trendOf': '{label} daily trend',
  'appstat.kpi.zero': '0 {unit} recorded',
  'appstat.kpi.attention': 'Attention',
  'appstat.kpi.delta.up': 'Up {n}',
  'appstat.kpi.delta.down': 'Down {n}',
  'appstat.kpi.delta.same': 'No change {n}',
  'appstat.kpi.tone.positive': 'favorable',
  'appstat.kpi.tone.negative': 'unfavorable',
  'appstat.kpi.tone.neutral': 'neutral',
  'appstat.kpi.previous': 'vs {n} previous'
} as const satisfies Record<string, string>

export type AppstatKey = keyof typeof en
