/** Route docs — see ./index.js for the entry shape. Filled from the source file named on each entry. */
const SIGNAL_QUERY = {
  days: '24h (exact rolling 24 hours, hourly buckets), 7, 14, 30 (UTC+7 calendar days) or all (first recorded event through readAt, daily buckets); other values keep the legacy default of 14',
  start: 'Inclusive Vietnam date, YYYY-MM-DD; requires end and overrides days',
  end: 'Inclusive Vietnam date, YYYY-MM-DD; at most today, range at most 366 days',
  compare:
    'true or false (also 1 or 0); defaults to true; all time disables comparison and returns null previous/deltas',
  medium: 'First-sign-in source.medium bucket; none means unattributed',
  source: 'First-sign-in source.source; none means missing; scopes people and site-owner metrics',
  campaign: 'First-sign-in source.campaign; none means missing; scopes people and site-owner metrics',
  content: 'First-sign-in source.content; none means missing; scopes people and site-owner metrics',
  cms: 'joomla, wordpress or emdash; scopes event sites and people with a matching lifetime non-demo site',
  status:
    'built, stuck, deleted, pending or no-site; latest lifetime state on the same site as cms; no-site yields no site events'
}
/** @type {import('./index.js').RouteDoc[]} */
export const OPS_A_ROUTES = [
  // src/ops/route.js
  {
    method: 'GET',
    path: '/ops/healthz',
    summary: 'Answer an uptime probe for the Ops surface',
    description:
      'Unauthenticated on purpose and registered ahead of the staff door: answers `ok` as plain text with `no-store`, and says nothing about who may enter.',
    audience: ['team', 'fleet'],
    auth: 'none',
    internal: true,
    answers: 'The text `ok`'
  },
  // src/ops/route.js
  {
    method: 'GET',
    path: '/ops/invite/:token',
    summary: 'Accept a pending Tracy staff invitation',
    description:
      'Signed out: redirects to `/login` with a way back. Signed in: accepts the pending `tracy_admin` seat of the caller’s own account and redirects to `/ops`; otherwise shows a “no longer open” page. The token itself is not verified.',
    audience: ['team'],
    auth: 'session',
    internal: true,
    params: {
      path: { token: 'Invitation token from the email link; not checked, acceptance is gated by the session' }
    },
    answers:
      'A 302 to `/ops`, a 410 HTML page saying no invitation is open for the signed-in address, or a 503 page when it cannot be checked'
  },
  // src/ops/route.js
  {
    method: 'GET',
    path: '/api/ops/team',
    summary: 'List Tracy staff members',
    description:
      'Relays unchanged onto `GET /tracy-admin/members` (the workspaces domain), which re-checks the same session. Signed out gets a 302 to sign-in; a non-staff session gets a bare 403.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: 'The `tracy_admin` roster as `/tracy-admin/members` returns it'
  },
  // src/ops/route.js
  {
    method: 'POST',
    path: '/api/ops/team',
    summary: 'Invite a Tracy staff member',
    description:
      'Relays the body unchanged onto `POST /tracy-admin/members`, which validates it and applies its own role checks.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: 'Whatever `POST /tracy-admin/members` answers'
  },
  // src/ops/route.js
  {
    method: 'POST',
    path: '/api/ops/team/:id/code',
    summary: 'Request a code for a staff member',
    description:
      'Relays onto `POST /tracy-admin/members/:id/code` in the workspaces domain (the removal-code step).',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { id: 'Staff seat id' } },
    answers: 'Whatever `/tracy-admin/members/:id/code` answers'
  },
  // src/ops/route.js
  {
    method: 'DELETE',
    path: '/api/ops/team/:id',
    summary: 'Remove a Tracy staff member',
    description:
      'Relays onto `DELETE /tracy-admin/members/:id` in the workspaces domain, query string and body included.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { id: 'Staff seat id' } },
    answers: 'Whatever `DELETE /tracy-admin/members/:id` answers'
  },
  // src/ops/route.js
  {
    method: 'GET',
    path: '/api/ops/me',
    summary: 'Say who is reading Ops and whether they may write',
    description:
      'One `admit()` call, without reading the roster. `writable` is true for the `owner` and `admin` roles — the same rule every write door on Ops applies.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: '`{ email, role, writable }`'
  },
  // src/ops/route.js
  {
    method: 'GET',
    path: '/api/host-agents',
    summary: 'List the dsh image and package versions on every host',
    description:
      'Asks each configured host over the signed host channel (`/dsh-versions`). An unreachable host stays a row with `ok: false` and an error; packages whose versions differ between hosts are reported as drift.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: 'One row per host (image, container, packages) plus the version drift between them'
  },
  // src/ops/attention.js
  {
    method: 'GET',
    path: '/api/ops/attention',
    summary: 'List what needs an administrator before a customer meets it',
    description:
      'Computed per request from this deployment: stored releases, Tracy demo sites, contracts, the picture store and the questionnaire in use. Each subject is a quickstart (or a demo whose quickstart is gone) with items `{ check, severity, params }` — codes and values, no prose. `count` is the number of subjects with at least one `broken` or `missing` item; hints are not counted.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: '`{ readAt, count, counts, offered, subjects }`'
  },
  // src/ops/attention.js
  {
    method: 'GET',
    path: '/api/ops/attention/questionnaire',
    summary: 'Compare one quickstart with the questionnaire it is asked with',
    description:
      'Query `tag`. Reads the release capabilities and the set in use: which questions feed a consumer this release has, which content roles the template holds and whether any question covers them. `limited` is `no-contract` or `identity-only` when there is nothing to compare. Unknown tag answers 404 `UNKNOWN_QUICKSTART`.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: '`{ tag, platform, version, setName, setSource, asked, parts, limited, writable }`'
  },
  // src/ops/app-statistic.js
  {
    method: 'GET',
    path: '/api/ops/app-statistic',
    summary: 'Read paginated desktop users, download requests, observed installs or quickstart requests',
    description:
      'Staff-only, no-store. Query view=users|downloads|installs|quickstarts (users by default), days=24h|1|7|30|all (7 by default), q, account=all|linked|unlinked, version, channel=stable|dev, platform=macos|windows|linux, template (quickstarts only), source, attention=all|needs-attention, user (account UUID), sort=time|lastAppContact|lastOpened|daysUsed|user|version|installs|quickstarts|template|platform|source|channel|cms|account|firstSeen|linkedAt|attention|referrer|id|installId, direction=asc|desc, page and pageSize=10|25|50|100. Invalid filters answer 400 INVALID_FILTER. UTC+7 calendar-day periods use download requestedAt or install lastSeen; users aggregate the matching records. Counts and pagination share the same database snapshot. Downloads are anonymous: rows omit userId, email, name, installId, account status and site-issue fields. Their summary and daily records omit account counts; people summaries, rows and detail omit app-download counts. Downloads do not enter the people union. Account, attention and user filters are ignored for downloads; account-linked installs do not imply online users. Updates preserve the install UUID. Source unknown matches records with no recorded source or medium. Users source is first-sign-in account attribution; download source is request attribution, and installs have no measured source and ignore the source filter. Search matches account name/email, record identifier or version. No historical download events are invented. Windows and Linux installer requests count only when they carry no App-Name or App-Version header: the desktop updater fetches the same exe or AppImage and is not a download. A quickstarts row is one quickstart zip request the quickstart door admitted for a signed-in account (requestedAt, template and cms split from the release tag, account-attribution source), not a completed download; its account is null once that account is deleted. On view=quickstarts, version, channel, platform and account do not apply and are ignored; template applies only there. A quickstarts row also carries templateUrl (the joomlart.com template page, Joomla cms only, otherwise null), releaseUrl (the release on the private JoomlArt-Products/joomlart-products repository, which needs access) and referrer (the referring page recorded with the request, null for requests made before it was recorded or when none was sent); search also matches referrer. Account and template rows carry quickstarts, the count of admitted quickstart requests in range; users include accounts whose only records are quickstart requests, and summary.quickstarts follows the same filters, while options and their template list cover all time, independently of the selected period or other filters. Inclusive UTC+7 start/end dates override days, require both dates, reject dates after today and span at most 366 days. Every view bounds requests at the exclusive interval end. analytics contains previous (the immediately preceding equal interval, null for all time), daily and previousDaily zero-filled UTC+7 series, range and dateField. Every aggregate shares the table filters, search and attention scope before pagination. Users daily counts each account once on its latest matching activity date; its request totals are allocated to that same date, not an event history. Other views group their matching record by requestedAt or install lastSeen. Users rows add lastAppContact, the latest matching app update-check timestamp or null, separate from lastSeen which may include template requests. Users default to lastAppContact descending with nulls last. App update checks may run in the background and do not measure app opens or days used; explicit sort=time retains latest matching record semantics. Foreground openings are separate desktop.app_opened events. summary.activeAppUsers and analytics previous/daily/previousDaily activeAppUsers count distinct signed-in accounts plus anonymous copy IDs with no signed-in opening on that copy in the same period. Relevant record filters apply to opening events independently of the selected table view; channel uses the current updater copy channel when known, and no channel is invented for an unseen copy. Opening source is the account first-sign-in attribution. A template filter has no matching opening events. Users rows include accounts identified by matching openings, with lastOpened and daysUsed (distinct UTC+7 opening days), sortable via lastOpened and daysUsed. Opening identity is captured from the event, never inferred from a later install link. activityAvailable is true only when a foreground opening exists in the complete current period and filter scope before pagination; activityMinimumVersion names the first app version that can send them. Without scoped opening records, the client hides the Active app users KPI, Last opened and Days used columns, opening funnel and version-adoption panel entirely. analytics.desktopGrowth adds uncapped filtered platform/version distributions with explicit units and shares. On users and installs, copy-based analysis compares observed copies, their current account links and same-account foreground openings; this is a latest-state linked subset, not historical first sign-in conversion. newCopies groups persistent first_seen by UTC+7 day. adoption groups the first recorded foreground opening of each copy per UTC+7 day by its event version, with daily denominators and activityCollectionStart. Channel classification still comes from the current updater row. openedCopiesOutsideConnections retains unmatched opening coverage. Download requests remain unlinked to app copies; quickstarts return desktopGrowth:null.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: {
      query: {
        view: 'users, downloads, installs or quickstarts; default users',
        days: '24h, 1, 7, 30 or all; default 7; 24h is exactly 24 rolling hours with hourly buckets; 1/7/30 use UTC+7 calendar days; all starts at the first recorded event and has no previous-period comparison',
        start: 'Inclusive UTC+7 date YYYY-MM-DD; requires end and overrides days',
        end: 'Inclusive UTC+7 date YYYY-MM-DD; at most today, range at most 366 days',
        q: 'Literal search in account name/email, row ID, version, template and referrer',
        account: 'all, linked or unlinked; ignored for quickstarts and downloads',
        version: 'Recorded app version; ignored for quickstarts',
        channel: 'stable or dev; ignored for quickstarts',
        platform: 'macos, windows or linux; ignored for quickstarts',
        template: 'Quickstart template name; ignored for other views',
        source: 'Recorded source or medium, or unknown; ignored for installs',
        attention: 'all or needs-attention; default all; ignored for downloads',
        user: 'Account UUID; ignored for downloads',
        sort: 'time (default outside users), lastAppContact (default for users), user, version, installs, quickstarts, template, platform, source, channel, cms, account, firstSeen, linkedAt, attention, referrer, id or installId',
        direction: 'asc or desc; default desc',
        page: 'Positive page number; default 1',
        pageSize: '10, 25, 50 or 100; default 50'
      }
    },
    answers:
      '`{ readAt, view, days, page, pageSize, total, pages, summary, analytics: { previous, daily, previousDaily, range, dateField, desktopGrowth }, rows, options, activityAvailable, activityMinimumVersion, dateField }`'
  },
  // src/ops/app-statistic.js
  {
    method: 'GET',
    path: '/api/ops/app-statistic/:view/:id',
    summary: 'Read desktop record details and verified account activity',
    description:
      'Staff-only, no-store. view=users|downloads|installs|quickstarts and id is its UUID. Unknown records or invalid identifiers answer 404 NOT_FOUND. Children are capped at 100 per collection with explicit truncated flags. Unlinked records never acquire another anonymous record’s history. Anonymous download detail contains only readAt, view and the recorded file-metadata row; account, app-copy, issue and account-activity sections are absent. App-download counts are absent from account detail. Activity is account activity, not proven desktop usage. Needs attention folds stuck, finished, deleted, handled and reopened site events; historical errors already closed are excluded. quickstarts lists the account’s quickstart requests for users and quickstarts details, only the request itself when its account was deleted, and nothing for downloads and installs.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: {
      path: {
        view: 'users, downloads, installs or quickstarts',
        id: 'Account, download, install or quickstart request UUID'
      }
    },
    answers:
      '`{ readAt, view, row }` for anonymous downloads; `{ readAt, view, row, installs, quickstarts, activity, issues, truncated }` for the other views'
  },
  // src/ops/usage.js
  {
    method: 'GET',
    path: '/api/ops/usage',
    summary: 'Read what customers’ chat requests and the Add site form did, by CMS',
    description:
      'Staff-only metadata from site_turn, site_write, site_operation, site_brief and ops_signal. Query days=24h|7|14|30|all defaults to14; 24h is exactly 24 rolling hours with hourly buckets; all starts at the first recorded event, uses UTC+7 day buckets and returns null previous with no comparison; inclusive UTC+7 start/end (aliases from/to) accept 1–366 days ending no later than today. cms=all|wordpress|joomla|emdash|unknown, audience=customers|staff|all (customers default), demo=exclude|include|only (exclude default), compare=1|0. Every request, customer, daily, CMS and created-site aggregate uses the same cohort. Form openings and their matching creations are dates-and-audience only: CMS and demo status are not known when the form opens. Invalid filters answer400 INVALID_USAGE_FILTER with parameter. Response preserves turns/funnel/siteUndos and adds range, filters, previous, previousDaily, daily, customers and limitations. The previous comparison uses the same elapsed part of the preceding period. Closure timing and mature undo/follow-up/rework windows use closed_at, never job filing time; missing closure remains unmeasured. Undo and next-request timestamps must follow closure. Unknown write outcomes and answer-limit endings have separate change partitions. Standalone restores and row undos do not require a new chat request. Immutable historical site classification and lifetimes prevent deleted demos and reused hostnames entering customer figures; unknown classifications are disclosed and excluded unless demo=include. Site changes undo attribution also requires the same incarnation. Good/Bad, undo, follow-up and same-target rework remain independent observations. A return requires visits on two different UTC+7 days. Only explicit build seconds=0 means ready immediately; missing build duration stays unknown. Medians need20 observations and 90th percentiles need100; rates need20 eligible observations and carry95% Wilson intervals. Customer metadata names each actor and aggregates selected requests, sites, CMS, confirmed changes, ratings and mature undo/follow-up/rework counts, never customer chat text. canReadText retains the separate USAGE_TEXT_READERS rule.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers:
      '`{ readAt, days, since, range, filters, rules, platforms, turns, siteUndos, funnel, daily, customers, tokenCustomers, research, limitations, previous, previousDaily, canReadText }`. Each CMS and all-CMS `turns` entry includes `tokens: {total, measuredRequests, requests, partialRequests, perRequest: {n, median, p90}}`, computed directly from provider-reported `site_turn.token_usage` in the selected cohort. `total` stays null when no requests have recorded tokens; zero is retained only when the provider reported zero. The nearest-rank median requires 20 measured requests and p90 requires 100. Daily/hourly entries include `tokens` and `tokenCoverage: {measuredRequests, requests, partialRequests}`; missing measurements remain null. Customer entries include `tokens`, `tokenCoverage`, `tokensPerRequest` and `sitesChanged` (distinct site incarnations with confirmed changes). `tokenCustomers` uses the selected period/CMS, always excludes staff and demos, and is empty for staff-only or demo-only filters. The previous period exposes the same token fields. Counts include site-chat model attempts, uncached input, output and cache read/write; reasoning is already in output. Excludes site setup, Help, speech and side-model calls; partialRequests counts requests with missing attempt reports. No token estimates or zero-filled missing records. `research` is kept apart from the chat figures: `{kind: "research", filters: {audience, cms: "not-applied", demo: "not-applied"}, all, byPurpose, byPayer, accounts}` over the Website Opportunities model calls in the research cost ledger (menu photos, logo, Build picture labels, the finished demo\'s look check; one ledger row is one request). Each figures object is `{requests, measuredRequests, partialRequests, tokens: {total, prompt, completion, reasoning} | null, perRequest: {n, median, p90}, cents}`; tokens are provider-reported, null when none were, reasoning is part of completion, the median needs 20 measured requests and p90 100. `byPayer` keys are `account`, `public` (sign-in-free /find), `operator`, `campaign`, `none` and `unrecorded`; the customers audience counts non-staff accounts and public, the staff audience staff accounts and operators, all every row. `accounts` lists the signed-in accounts the audience keeps. 400 `INVALID_USAGE_FILTER`'
  },
  // src/ops/usage.js
  {
    method: 'GET',
    path: '/api/ops/usage/turns',
    summary: 'Read a random sample of one group of turns, with the words',
    description:
      'Only for the addresses in `USAGE_TEXT_READERS` (403 for any other staff seat); every read writes one `audit` row (`ops.usage.read-turns`, with the turn ids). Query `group` is `bad`, `good`, `unrated`, `undone`, `failed` or `not-shown`; `days`, custom dates and cohort filters as on `/api/ops/usage`. Groups match the same cohort and definitions as its aggregates: undone requires a confirmed changed request undone within a day after closure and a full day of observation, including Site changes; failed includes every ending other than completed; not-shown requires a changed request. At most 20 turns, at random within the group: the request as typed, Tracy’s answer, how it ended, what it changed, its time, steps, calls, visual verdict, rating and whether it was undone. Who typed is never sent.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: '`{ group, days, turns }`; 400 `INVALID_GROUP`; 403 when the viewer is not a named reader'
  },
  // src/ops/beta.js
  {
    method: 'GET',
    path: '/api/ops/beta/signals',
    summary: 'Count first sign-ins by source, new sites, waitlist, stuck sites and Discord by day',
    description:
      'Read per request from `ops_signal`, bounded by inclusive Vietnam dates. All six attribution and site filters scope first-sign-in aggregates, source counts, both people tables and site metrics. Site attribution comes from the first sign-in of the person who started that site, including sign-ins before the selected dates; an unlinked owner is not inferred to be direct. CMS and latest lifetime event-folded status must match the same site; people qualify through a lifetime non-demo started site, while site metrics qualify through the event site. No-site selects people without non-demo started sites and produces no site events. Waitlist and Discord remain period-only because their attribution and site associations are unmeasured. Filter options come from both periods before filtering and retain the selected value when it has no results. Current and previous series include zero buckets. days=24h selects exactly the preceding 24 hours and hourly buckets; all starts at the first recorded event, uses UTC+7 day buckets and returns null previous and deltas with compare=false. Period stuck counts distinct site keys; daily stuck and failureEvents count failure events. Deltas report absolute changes and null percentages when the previous total is zero. latest is the newest 50 matching first sign-ins, with latestTotal before the cap. Invalid filters answer 400 INVALID_SIGNAL_FILTER with parameter. No writes.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { query: SIGNAL_QUERY },
    answers:
      '`{ readAt, days, sources, totals, previous, byDay, previousByDay, deltas, range, filters, compare, filterOptions, latest, latestTotal, latestLimit }`'
  },
  // src/ops/beta.js
  {
    method: 'GET',
    path: '/api/ops/beta/stuck',
    summary: 'List customers whose site is stuck on a system error',
    description:
      'Folds retained site history without an age cutoff: a failure opens a case; a successful build or import, deletion, or manual handling closes it. New site instances do not inherit an old case. `open` lists current open cases newest first; `handledToday` lists cases closed since midnight Vietnam time, with how. Each row names the operation separately from its step. `sites` includes the latest case state per site; `history` contains recorded failure episodes and build/import activity, never customer chat. A manually handled or deleted case is not a confirmed recovery. `writable` says whether this viewer may close a row. Optional days=24h|1|7|30|all (default 30), or inclusive UTC+7 start/end, adds range metadata without truncating the lifetime fold needed to determine current case state. 24h is exactly the last 24 hours with hourly chart buckets; all starts at the first recorded event, has daily UTC+7 buckets and no previous-period comparison. Invalid ranges answer 400 INVALID_SIGNAL_FILTER.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: '`{ readAt, count, open, handledToday, sites, history, availability, writable, range }`'
  },
  // src/ops/beta.js
  {
    method: 'GET',
    path: '/api/ops/beta/waitlist',
    summary: 'List the people on the waitlist: turned away at sign-in, the whitelist form, or both',
    description:
      'Query `days` is 7, 14 or 30 (anything else reads as 30). One row per address that was turned away at sign-in (`beta.waitlist` signals) or sent the whitelist form (`beta_waitlist`, `whitelist_confirmation`) in the window, newest first: how often and how it was turned away, the form answers, the confirmation mail status, and when the address later signed in, if it did. `totals` counts the rows of each kind.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: '`{ readAt, days, totals, rows }`'
  },
  // src/ops/beta.js
  {
    method: 'GET',
    path: '/api/ops/beta/customers',
    summary: 'List the customers who signed in for the first time, with what they built and did',
    description:
      "Uses the same validated date and source query as Signals. CMS and status select customers with a matching site (both match the same site); no-site requires an empty non-demo site list. Period selects the first-sign-in cohort; activity stays lifetime across all customer sites. Invalid filters answer 400 INVALID_SIGNAL_FILTER with parameter. One row per address whose `account.first_sign_in` falls in the window, newest first, at most 200 (`total` counts all): badge and source of the first sign-in; each site they created or imported with its state (`built`, `stuck`, `deleted`, `pending`), failures and whether it went live; how many requests they gave the agent (`site_turn`); what the agent changed (`site.edit` by action: `done` requires explicit success, `failed` requires explicit failure, and `editUnknown` retains missing outcomes) and undos (`edits.undone` counts explicit success only; `undoFailed` and `undoUnknown` retain failed and legacy unknown outcomes); and the Vietnam days they were active (`ops_active_day`). Counts and codes only, never the customer's words. People holding a Tracy staff seat and historically classified demo sites are left out. Missing historical site classification is excluded from customer site activity, never assumed non-demo. Site lifetimes are separated by immutable creation identity, including domain reuse; legacy starts are split by chronology. `tokens` is the sum of provider-reported model tokens for tracked site-chat requests over their lifetime, including uncached input, output and cache read/write, or null when none have usage. Reasoning is not added again. `tokenCoverage` names `measuredTurns` (requests with usage snapshots) and `partialTurns` (those snapshots include missing reports); unmeasured requests are not zero. Excludes site setup, help, speech and side-model calls; this is not total account consumption. The growth field aggregates the full filtered first-sign-in cohort before the 200-row cap, followed through readAt: an ordered own-site lifetime funnel (signedIn, started, ready, requested, changed) with previous-stage conversionPercent and dropped people, firstSite/firstRequest timing with medianSeconds only for n>=20 observed completers, UTC+7 first-sign-in weekly retention with weeks 1 through 4 and fully observed individual denominators for presence and requests, channel/source/campaign activation comparison, and unknown historical classification coverage. CMS/status select the cohort using the same customer filter rules; follow-up covers the selected people across their own verified non-demo site lifetimes. A change requires successful write or closed-turn committed-file evidence bound to the exact actor request and site incarnation. Readiness, requests and changes must occur before that incarnation is deleted; earlier observed progress is retained.",
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { query: SIGNAL_QUERY },
    answers:
      '`{ readAt, days, total, rows, range, filters, growth: { people, funnel, timing, retention, channels, coverage } }`'
  },
  // src/ops/beta.js
  {
    method: 'POST',
    path: '/api/ops/beta/stuck/handled',
    summary: 'Close a stuck customer’s row by hand, or open it again',
    description:
      'Body `{ siteKey, reopen? }`, JSON, from the deployment’s own origin, owner or admin seat. Records `ops.handled` (or `ops.reopened`) with the first failure’s time and the administrator’s address; nothing goes to Telegram. 404 `UNKNOWN_STUCK_SITE` when the site has no stuck history, 409 `NOT_OPEN` / `NOT_HANDLED` when the row is not in the state the press was drawn for.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: '`{ ok: true }`'
  },
  // src/ops/quickstarts.js
  {
    method: 'GET',
    path: '/api/ops/quickstarts',
    summary: 'List quickstart releases as this server last read them',
    description:
      'Reads the `quickstart_releases` table, not GitHub. Each row carries its platform, version, template, the questionnaire in use, its Design templates state, its content-contract status, why a saved card would stay hidden once published, `cardSource` (whether this release supplies the one card customers see for its template, the same pick `GET /api/templates` makes), and `cardTemplate` (the id of that customer card, which its pictures are stored under; it may differ from `template`, what the install file names); plus per-CMS counts and whether this deployment can refresh from GitHub.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: '`{ readAt, canRefresh, cannotRefreshReason, writable, counts, releases }`'
  },
  // src/ops/quickstarts.js
  {
    method: 'GET',
    path: '/api/ops/inspiration',
    summary: 'Read what Design templates offers customers on this server',
    description:
      'Staff only. `shown` is built by the same code as `GET /api/templates` (one row per template, each with its platforms and the warnings its releases carry — a missing picture or demo never takes a card off). `notShown` lists releases that carry a card customers do not get, each with `why`; `noCard` lists releases a site can start from that carry no card. Live database state, not a git ref.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers:
      '`{ readAt, origin, writable, canRefresh, cannotRefreshReason, designSystemsShown, shown, notShown, noCard, counts }`'
  },
  // src/ops/quickstarts.js
  {
    method: 'GET',
    path: '/api/templates',
    summary: 'List Design templates cards',
    description:
      'Public, no seat needed: read by the design-inspiration plugin and the public page. Cards come from the stored releases and live demos; a picture this server holds is an absolute URL, one it lacks is null. A card with a blurb also carries `card.blurbs`, `{ lang: text }` for the languages (de, fr, es, it, nl) its English blurb has been translated into so far.',
    audience: ['dsh', 'public'],
    auth: 'none',
    internal: true,
    answers: '`{ readAt, templates }`'
  },
  // src/ops/quickstarts.js
  {
    method: 'GET',
    path: '/api/design-systems',
    summary: 'Say whether Design templates offers the design-system library',
    description:
      'Public, no seat needed: read per request with `no-store` by the public page and the design-inspiration plugin, so a switch pressed on Ops applies on the next read.',
    audience: ['dsh', 'public'],
    auth: 'none',
    internal: true,
    answers: '`{ shown: boolean }`'
  },
  // src/ops/quickstarts.js
  {
    method: 'PUT',
    path: '/api/ops/design-systems',
    summary: 'Show or hide the design-system library',
    description:
      'Owner or admin only, and the `origin` header must be this deployment’s origin. Saves the switch with the caller’s email; a non-boolean `shown` answers 400 `SHOWN_NOT_BOOLEAN`.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    body: { type: 'object', required: ['shown'], properties: { shown: { type: 'boolean' } } },
    answers: '`{ shown }`'
  },
  // src/ops/quickstarts.js
  {
    method: 'GET',
    path: '/api/templates/:templateId/demo-frame',
    summary: 'Check whether a page may frame a template’s demo',
    description:
      'Public and CORS-open (`access-control-allow-origin: *`). Probes whether the card’s live demo accepts being framed by the named origin, so the card mounts the iframe only when it will render. 400 `INVALID_ORIGIN`, 404 `UNKNOWN_TEMPLATE`.',
    audience: ['dsh', 'public'],
    auth: 'none',
    internal: true,
    params: {
      path: { templateId: 'Template id of the card' },
      query: { origin: 'Origin of the page that wants to frame the demo (a bare origin, no path)' }
    },
    answers: '`{ framable, reason? }`'
  },
  // src/ops/quickstarts.js
  {
    method: 'GET',
    path: '/api/templates/:templateId/shots/:file',
    summary: 'Serve one card picture',
    description:
      'Public. Answers the stored image bytes with one hour of public cache and the sha256 as ETag. A missing or malformed name answers 404 `NO_PICTURE` with `no-store`.',
    audience: ['dsh', 'public'],
    auth: 'none',
    internal: true,
    params: { path: { templateId: 'Template id of the card', file: 'Picture file name' } },
    answers: 'The image bytes'
  },
  // src/ops/quickstarts.js
  {
    method: 'POST',
    path: '/api/ops/quickstarts/refresh',
    summary: 'Re-read quickstart releases from GitHub',
    description:
      'Owner or admin, same-origin only. Refreshes the `quickstart_releases` table from the releases on GitHub; answers 503 when the read fails.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: 'The refresh result, `ok: true` on success'
  },
  // src/ops/quickstarts.js
  {
    method: 'GET',
    path: '/api/ops/quickstart',
    summary: 'Read one quickstart release in detail',
    description:
      'The release as stored, its Design templates state and up to 20 sites built from it. 404 `UNKNOWN_QUICKSTART`.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { query: { tag: 'Release tag (it contains a slash, so it rides on the query)' } },
    answers: 'The release plus `platform`, `inspirationState`, `writable` and `sites`'
  },
  // src/ops/quickstarts.js
  {
    method: 'GET',
    path: '/api/ops/quickstart/customer-questions',
    summary: 'Preview the questions a customer of one release is asked',
    description:
      'Read-only, for any staff seat. The same `resolveQuestions` answer `GET /api/sites/questions` serves for that release (the CMS standard file fitted to it), without keeping a snapshot. `fitted` says what the release decided: the logo tiles of its template profile (`layout` null when it has no profile row and one logo is asked) and its own page list (null when it ships none and the build keeps every page). With brand uploads off, `brandQuestions` holds the logo and favicon questions as they would be asked, each with `after` (the id of the question it follows). 404 `UNKNOWN_QUICKSTART`; 400 `UNSUPPORTED_PLATFORM`.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: {
      query: { tag: 'Release tag', lang: 'Language to draw the questions in (default `en`)' }
    },
    answers:
      '`{ tag, platform, languages, set, questions, brandUploads, brandQuestions, fitted: { logo: { layout, variants, profile }, pages } }`'
  },
  // src/ops/quickstarts.js
  {
    method: 'GET',
    path: '/api/ops/quickstart/inspiration',
    summary: 'Read a release’s Design template card',
    description:
      'For the card sheet: the card, whether it is published, why it cannot be one, the live demo, stored pictures, sibling releases of the same template and the category list.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { query: { tag: 'Release tag' } },
    answers:
      'The card, its state, `demo`, `shots`, `platforms` (each with `contract`: `{ state: exact | lower | none | not-applicable, profile, version }`) and `categories`'
  },
  // src/ops/quickstarts.js
  {
    method: 'PUT',
    path: '/api/ops/quickstart/inspiration',
    summary: 'Save a Design template card',
    description:
      'Owner or admin, same-origin only. Validates the card and uploads `tracy_design_inspiration.json` to the GitHub release, then stores it locally. A card customers do not see yet is kept hidden: the hidden mark `tracy_design_inspiration_hidden.json` is written first. A card already shown stays shown, with the edits live at once. No content-contract check (saving is not offering). 400 `INVALID_CARD`/`NOT_A_CARD`, 502 `GITHUB_REFUSED`.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { query: { tag: 'Release tag' } },
    body: {
      type: 'object',
      description: 'The card fields (category, blurb, layouts, …) composed with the release'
    },
    answers: '`{ ok, replaced, inspiration, hidden }`; `hidden` says whether the card is off Design templates'
  },
  // src/ops/quickstarts.js
  {
    method: 'POST',
    path: '/api/ops/quickstart/inspiration/publish',
    summary: 'Publish a saved Design template card',
    description:
      'Owner or admin, same-origin only. Shows the card already saved on the release by removing the hidden mark; writes no card. Refused before anything is written: 400 `NOT_A_CARD`, `NO_CARD` (save a card first), `LISTING_INCOMPLETE` (the saved listing lacks a top-level page of the release’s `tracy_site_pages.json`, at most six, shows a page a listing may not show such as Login, a 404, a language switch or a legal page, or a page has no desktop picture; the reason names them), `NO_CONTRACT` (a Joomla or WordPress release of the card has no content contract — `{ error, tags, reason }`, the reason names the capture command), `CUSTOMIZE_NOT_READY` (must-fix rules of the Customize your site check remain, or this version is not checked yet — `{ error, reason, rules }`), `DESIGN_SYSTEM_NOT_READY` (the same for the Design system check — `{ error, reason, rules }`), `NOT_SHOWABLE` (the card still would not reach customers, with the reason); 502 `GITHUB_REFUSED`.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { query: { tag: 'Release tag' } },
    answers:
      '`{ ok, warnings }`; `warnings` lists `{ code: LOWER_CONTRACT, platform, tag, text }` for platforms served by a lower profile — the card is published regardless'
  },
  // src/ops/quickstarts.js
  {
    method: 'POST',
    path: '/api/ops/quickstart/customize/check',
    summary: 'Check a release again for Customize your site',
    description:
      'Owner or admin, same-origin only. Runs the Template Customization Question Readiness check of one release now, in the background; the result shows on step `customize` of the road. 404 `UNKNOWN_QUICKSTART`; 400 `NOT_CHECKABLE` (not a quickstart Tracy can read).',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { query: { tag: 'Release tag' } },
    answers: '202 `{ ok, state: "checking" }`'
  },
  // src/ops/quickstarts.js
  {
    method: 'POST',
    path: '/api/ops/quickstart/design-system/check',
    summary: 'Check a release again for Design system',
    description:
      'Owner or admin, same-origin only. Runs the Template Design System Readiness check of one release now, in the background; the result shows on step `design-system` of the road. 404 `UNKNOWN_QUICKSTART`; 400 `NOT_CHECKABLE` (not a quickstart Tracy can read).',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { query: { tag: 'Release tag' } },
    answers: '202 `{ ok, state: "checking" }`'
  },
  // src/ops/quickstarts.js
  {
    method: 'DELETE',
    path: '/api/ops/quickstart/inspiration',
    summary: 'Unpublish a Design template card',
    description:
      'Owner or admin, same-origin only. Leaves the hidden mark on the GitHub release and on this server, for a card of either shape; the card and the pictures are kept, so Publish can show it again.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { query: { tag: 'Release tag' } },
    answers: '`{ ok, hidden }`'
  },
  // src/ops/quickstarts.js
  {
    method: 'GET',
    path: '/api/ops/templates/:templateId/shots',
    summary: 'List a template’s stored pictures',
    description: 'The pictures this server holds for one template, as the card sheet lists them.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { templateId: 'Template id' } },
    answers: '`{ shots }`'
  },
  // src/ops/quickstarts.js
  {
    method: 'PUT',
    path: '/api/ops/templates/:templateId/shots/:file',
    summary: 'Upload one card picture',
    description:
      'Owner or admin, same-origin only. The body is the raw image bytes (no multipart). The name must fit the picture naming rule; an oversized `content-length` is refused before reading (413). Refusals answer `PICTURE_REFUSED` with a reason.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { templateId: 'Template id', file: 'Picture file name' } },
    answers: '`{ ok, file, … }` with the stored picture’s details'
  },
  // src/ops/quickstarts.js
  {
    method: 'DELETE',
    path: '/api/ops/templates/:templateId/shots/:file',
    summary: 'Delete one card picture',
    description: 'Owner or admin, same-origin only. Removes the stored picture.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { templateId: 'Template id', file: 'Picture file name' } },
    answers: '`{ ok, deleted }`'
  },
  // src/ops/quickstarts.js
  {
    method: 'POST',
    path: '/api/ops/templates/:templateId/generate',
    summary: 'Draft a card from the live demo',
    description:
      'Owner or admin, same-origin only. Reads the demo’s outline through its host (layouts, dark mode, provider; the layouts start from the release’s top-level pages in `tracy_site_pages.json`, at most six, then the demo menu, without system pages) and, when a model is set, proposes a category and blurb. Writes nothing. 409 `NO_DEMO`, 503 `NO_DEMO_HOST`, 400 `TEMPLATE_MISMATCH`, 424 `OUTLINE_FAILED` (the host could not read the demo, with a reason). A model that fails or runs out of time leaves category and blurb blank and says why.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: {
      path: { templateId: 'Template id; must match the release’s template' },
      query: { tag: 'Release tag' }
    },
    answers: '`{ draft, read, why }`'
  },
  // src/ops/quickstarts.js
  {
    method: 'POST',
    path: '/api/ops/templates/:templateId/capture',
    summary: 'Photograph the card’s layouts on the live demo',
    description:
      'Owner or admin, same-origin only. Asks the demo’s tracy-host to screenshot each layout at both widths and stores the pictures under the template. Layouts come from the body, else the published card. 400 `NO_LAYOUTS`, 409 `NO_DEMO`.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: {
      path: { templateId: 'Template id; must match the release’s template' },
      query: { tag: 'Release tag' }
    },
    body: {
      type: 'object',
      properties: {
        layouts: {
          type: 'array',
          items: {
            type: 'object',
            required: ['key', 'path'],
            properties: { key: { type: 'string' }, path: { type: 'string' }, address: { type: 'string' } }
          }
        }
      }
    },
    answers: '`{ ok, stored, failed }`'
  },
  // src/ops/ui.js
  {
    method: 'GET',
    path: '/api/ui',
    summary: 'List the pieces hidden on the customer’s dsh page',
    description:
      'Public, no seat needed: read with `no-store` by every Tracy plugin on a customer page (`@tracy/core/ui-switches`), so an operator’s switch reaches the next page load.',
    audience: ['customer', 'public'],
    auth: 'none',
    internal: true,
    answers: '`{ hidden }`'
  },
  // src/ops/ui.js
  {
    method: 'GET',
    path: '/api/ops/ui',
    summary: 'Read the User Interface switches',
    description:
      'The switch catalogue (areas, groups, every switch with its default) and whether each one is on for this deployment, plus who changed them last.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: '`{ areas, groups, switches, updatedBy, updatedAt, writable }`'
  },
  // src/ops/ui.js
  {
    method: 'PUT',
    path: '/api/ops/ui',
    summary: 'Press User Interface switches',
    description:
      'Owner or admin, same-origin only. Nothing is written unless every id is in the catalogue and every value is a boolean; otherwise 400.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    body: {
      type: 'object',
      required: ['switches'],
      properties: { switches: { type: 'object', additionalProperties: { type: 'boolean' } } }
    },
    answers: '`{ hidden }` after the change'
  },
  // src/ops/view-as.js
  {
    method: 'POST',
    path: '/api/ops/view-as',
    summary: 'Open a view of a customer',
    description:
      'Owner or admin of Tracy staff, same-origin only. Sets the `tracy_view` cookie (30 minutes, never renewed) so the browser shows Tracy as the customer sees it; the staff member’s own sign-in is untouched. The target must be an existing account that is not staff and not the caller; an optional reason (up to 300 characters) is recorded in the audit log with the start, which always names the staff member, the target and the time. Opening a second view ends the first.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    body: {
      type: 'object',
      required: ['email'],
      properties: { email: { type: 'string' }, reason: { type: 'string', maxLength: 300 } }
    },
    answers:
      '`{ url }` — where to open the view. Refusals are codes: `EMAIL_REQUIRED`, `REASON_TOO_LONG`, `SELF` (400), `STAFF_TARGET` (403), `NO_SUCH_ACCOUNT` (404).'
  },
  // src/ops/view-as.js
  {
    method: 'POST',
    path: '/auth/view-as/exit',
    summary: 'End the view of a customer',
    description:
      'Authenticated by the `tracy_view` cookie itself (the bar’s Exit button posts here). Revokes the view, clears the cookie, records the end in the audit log, and sends the staff member back to /ops with 303. Without a live view it only clears the cookie.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: '`303` to `/ops`'
  },
  // src/ops/speech.js
  {
    method: 'GET',
    path: '/api/ops/speech',
    summary: 'Read voice provider profiles, the shared switch, health and usage',
    description:
      '/ops › Agents › Voice. `on` is the User Interface switch `composer-voice-input` (`null` when the database could not say), pressed with `PUT /api/ops/ui` like any switch; off, the chat box draws no microphone and `GET /api/speech/stream` refuses every session. `key` says where the speech key in use comes from — `ops` (saved with `PUT /api/ops/speech/key`) or `env` (`SPEECH_TO_TEXT_API_KEY`, used only while none is saved) — with a hint of it, who saved it and when, and `unreadable` when a saved key cannot be opened (SESSION_SECRET rotated); never the key. `configured` describes the selected speech profile. `provider` contains independent ElevenLabs/VoiceStudio profiles and a configuration revision, never sealed secrets; `health` separates listening and speaking with revision-bound results. `runtime` names the most recent primary/actual provider, fallback status and end reason without identifying an account. `service` names the provider and model, `limits` the session, silence and daily budgets, `today` the started minutes and accounts of the current UTC day (`null` without a database). `writable` says whether this person may press the switch and save a key. `speak` is the voice conversation the same switch turns on: who reads Tracy’s replies out loud (`service`), its character `limits` and today’s characters and accounts (`today`, `null` without a database). `turns` is how long voice turns took over the last day (`day`) and the last seven (`week`), from the pages’ own reports (`POST /api/speech/trace`), Tracy staff seats left out: per span the turns it stands on (`n`), the median (`p50`, from 20 turns) and the 95th percentile (`p95`, from 100), turns sent by a press not timed; `errors`, `interrupted` and `ackCached` as `{a, b, rate}`, the rate from 20 turns (`null` without a database). `keyterms` is the keyterms pilot: the site keys whose voice sessions hand the speech service the site’s own names (`PUT /api/ops/speech/keyterms`; empty by default, the pilot off) and the bounds a list keeps — at most `limits.sites` sites, `limits.terms` names a site, `limits.chars` characters a name (`null` when it cannot be read).',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers:
      '`{ on: boolean | null, configured, key: { configured, source: "ops" | "env" | null, hint, unreadable, updatedBy, updatedAt } | null, writable, service: { provider, model }, limits: { sessionSeconds, silenceSeconds, accountMinutesPerDay, totalMinutesPerDay }, today: { day, minutes, accounts } | null, speak: { service: { provider, model }, limits: { maxChars, accountCharsPerDay, totalCharsPerDay }, today: { day, chars, accounts } | null }, turns: { day, week: { days, turns, pressed, spans: { speechToCommit, commitToSent, sentToAck, sentToReply, speechToReply: { n, p50, p95 } }, errors, interrupted, ackCached: { a, b, rate } } } | null, keyterms: { sites: string[], limits: { sites, terms, chars } } | null }`'
  },
  // src/ops/speech.js
  {
    method: 'PUT',
    path: '/api/ops/speech/keyterms',
    summary: 'Set the sites in the keyterms pilot',
    description:
      'Owner or admin, same-origin only. `sites` lists the site keys (`shop.example.com`) whose voice sessions ask the speech service to listen for the site’s own names: the business name the customer gave in Add site, and titles of products, menu entries and pages a person edited in the CMS admin, read when a session opens and sent only for an account with a live seat on that site (ElevenLabs bills such a session about 20% more). Lower-cased, each once, empty strings ignored; an empty list turns the pilot off everywhere. A key of another shape is 400 `SITE_KEY_INVALID`, more than 100 sites 400 `TOO_MANY_SITES`, a body without a list 400 `SITES_NOT_LIST`; 503 `NO_DATABASE` without a database. Takes effect on the next voice session. Answers the same document as `GET /api/ops/speech`.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    body: {
      type: 'object',
      required: ['sites'],
      properties: { sites: { type: 'array', items: { type: 'string' } } }
    },
    answers: 'the `GET /api/ops/speech` document'
  },
  // src/ops/speech.js
  {
    method: 'PUT',
    path: '/api/ops/speech/key',
    summary: 'Save or remove the speech key',
    description:
      'Owner or admin, same-origin only. `apiKey` is the ElevenLabs key voice sessions use, saved sealed (AES-256-GCM, key derived from SESSION_SECRET) and used before `SPEECH_TO_TEXT_API_KEY`; it takes effect on the next voice session, without restarting the server; an existing voice must reconnect after the configuration revision changes. An empty `apiKey` removes the saved key (the environment’s, if any, is used again). Trimmed; a key with spaces inside or longer than 200 characters is 400. 503 `NO_DATABASE` without a database. Answers the same document as `GET /api/ops/speech`; the key is never sent back.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    body: { type: 'object', required: ['apiKey'], properties: { apiKey: { type: 'string' } } },
    answers: 'the `GET /api/ops/speech` document'
  },
  // src/ops/speech.js
  {
    method: 'POST',
    path: '/api/ops/speech/key/test',
    summary: 'Test a speech key against the speech service',
    description:
      'Owner or admin, same-origin only. Asks ElevenLabs for a realtime transcription token with `apiKey` when given, else with the key in use, and says what it answered: `{ ok: true }`, or `{ ok: false, status, reason, message }` — `reason` `missing_permissions` names a key without the Speech to Text permission, `no_key` that there was nothing to test. Nothing is saved; the token is discarded and the key is never sent back.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    body: { type: 'object', properties: { apiKey: { type: 'string' } } },
    answers: '`{ ok: true }` or `{ ok: false, status, reason, message }`'
  },
  // src/ops/speech.js
  {
    method: 'POST',
    path: '/api/ops/speech/provider/test',
    summary: 'Test a draft speech provider profile without applying it',
    description:
      'Owner/admin and same-origin only. Body {provider, profile}: elevenlabs takes sttModel=scribe_v2_realtime and ttsModel; voicestudio takes baseUrl, ttsModel, voice and optional token. Each profile has its own optional fallbackEnabled, default false. An omitted local token keeps the saved token; an empty one removes it. Local probes finalize a short silent STT stream, then generate short PCM speech; ElevenLabs STT checks the handshake only and does not prove remaining audio quota. Tests may warm installed models and use provider quota. No profile or active health is changed; secrets are never returned.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    body: {
      type: 'object',
      required: ['provider', 'profile'],
      properties: {
        provider: { type: 'string', enum: ['elevenlabs', 'voicestudio'] },
        profile: {
          type: 'object',
          properties: {
            baseUrl: { type: 'string' },
            sttModel: { type: 'string' },
            ttsModel: { type: 'string' },
            voice: { type: 'string' },
            token: { type: 'string', writeOnly: true },
            fallbackEnabled: { type: 'boolean', default: false }
          }
        }
      }
    },
    answers:
      '`{stt:{outcome,reason,check},tts:{outcome,reason,check}}`; outcome is ok, refused, unavailable or null for a transient failure'
  },
  // src/ops/speech.js
  {
    method: 'PUT',
    path: '/api/ops/speech/provider',
    summary: 'Save one independent provider profile and activate it atomically',
    description:
      'Owner/admin, same-origin and database required. Uses the same body as the draft test. Activates STT and TTS together, preserves the other profile and the existing sealed ElevenLabs key/environment fallback. The optional VoiceStudio token is sealed. baseUrl may address a private self-hosted server; URL credentials, fragments, query strings, non-HTTP protocols, metadata destinations and redirects are refused. Each profile independently enables one attempt to its configured opposite provider before STT ready/audio or standalone TTS output. Tracy quota, cancellation, access/origin failures and agent errors never trigger fallback. Once listening starts, replies stay on that provider; a stream failure stops without replay. Apply changes the revision, invalidates old probes, and makes existing voice sessions restart before speaking again. Only protocol-compatible model IDs are accepted: ElevenLabs realtime STT remains scribe_v2_realtime, Dialogue-only or unknown TTS models are refused, and VoiceStudio STT selection is read-only. VoiceStudio is installed separately; no model or commercial-use entitlement is supplied by Tracy.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    body: {
      type: 'object',
      required: ['provider', 'profile'],
      properties: {
        provider: { type: 'string', enum: ['elevenlabs', 'voicestudio'] },
        profile: {
          type: 'object',
          properties: {
            baseUrl: { type: 'string' },
            sttModel: { type: 'string' },
            ttsModel: { type: 'string' },
            voice: { type: 'string' },
            token: { type: 'string', writeOnly: true },
            fallbackEnabled: { type: 'boolean', default: false }
          }
        }
      }
    },
    answers:
      'the `GET /api/ops/speech` document, including provider, independent profiles, masked token facts, revision and separate STT/TTS health'
  },
  // src/ops/speech.js
  {
    method: 'GET',
    path: '/api/ops/speech/providers/:provider/models',
    summary: 'Read cached speech model metadata without contacting the provider',
    description:
      'Staff read. Returns cached metadata, readAt, stale, source and inferenceTested:false for elevenlabs or voicestudio. STT catalogue entries for ElevenLabs are explicitly sourced from official documentation; VoiceStudio active ASR is read-only. No keys, arbitrary provider fields or inference are returned.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: '`{models,readAt,stale,source,inferenceTested:false,error?,status?}`'
  },
  // src/ops/speech.js
  {
    method: 'POST',
    path: '/api/ops/speech/providers/:provider/models',
    summary: 'Refresh speech model metadata using saved server credentials',
    description:
      'Owner/admin, same-origin and database required. Reads only the saved provider server and credentials, fetches /v1/models with bounded timeout/body and no redirects, and caches sanitized metadata separately from configuration revisions. Does not apply a draft, change current selections, download models or test speech. Failure preserves the old list and current profile, returns error/status. Unsupported transports and active-engine aliases are classified with disabled reasons; listing is not proof of model installation, license acceptance or working inference.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: '`{models,readAt,stale,source,inferenceTested:false,error?,status?}`'
  },
  // src/ops/desktop.js
  {
    method: 'GET',
    path: '/api/desktop/config',
    summary: 'Read what the Tracy Cowork desktop app should offer',
    description:
      'Public, no seat needed: read with `no-store` by the desktop app. `llm.connect` says whether a customer may connect their own model plan in the app, `llm.providers` which vendors (the vendor ids of the dsh-subscriptions plugin: claude, codex, copilot…). `tracyModel` is the vendor of the agent door on Model & AI, never its key; `model` is null because the agent model is chosen inside the dsh image. Advice to the app only: the fleet never turns the plan sign-in on.',
    audience: ['customer', 'public'],
    auth: 'none',
    internal: true,
    answers: '`{ llm: { connect, providers }, tracyModel: { provider, model } }`'
  },
  // src/ops/desktop.js
  {
    method: 'GET',
    path: '/api/ops/desktop',
    summary: 'Read the Desktop App settings',
    description:
      'The same answer the app reads, plus the vendors the screen may offer and who changed the settings last.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: '`{ llm, tracyModel, providers, updatedBy, updatedAt, writable }`'
  },
  // src/ops/desktop.js
  {
    method: 'PUT',
    path: '/api/ops/desktop',
    summary: 'Change the Desktop App settings',
    description:
      'Owner or admin, same-origin only. Any subset of `llm.connect` (boolean) and `llm.providers` (vendor ids from the offered list); a key or vendor not known, or a wrong type, is 400 and nothing is written.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    body: {
      type: 'object',
      required: ['llm'],
      additionalProperties: false,
      properties: {
        llm: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connect: { type: 'boolean' },
            providers: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    },
    answers: '`{ llm, tracyModel }` after the change'
  },
  // src/ops/desktop.js
  {
    method: 'POST',
    path: '/api/desktop/installs/link',
    summary: 'Link a desktop app install to the signed-in person',
    description:
      'Sent by the Tracy Cowork desktop app from its own page after sign-in, with the install id electron-updater keeps (the `x-user-staging-id` the update feed records). Fills the person on that install row. 400 for an id that is not a UUID, 404 until the update feed has seen that id.',
    audience: ['customer'],
    auth: 'session',
    internal: true,
    body: {
      type: 'object',
      required: ['installId'],
      properties: { installId: { type: 'string', format: 'uuid' } }
    },
    answers: '204, no body'
  },
  // src/ops/desktop-opened.js
  {
    method: 'POST',
    path: '/api/desktop/installs/opened',
    summary: 'Record one daily desktop app opening',
    description:
      'A foreground opening or focus of the desktop window, independent of background update checks. Accepts only the existing app-copy UUID, version, platform and original UTC timestamp; the optional existing session supplies the account. Stored once per app copy and UTC+7 calendar day in ops_signal. Offline retries retain their original time for up to 90 days; future clock skew is limited to five minutes. JSON body at most 512 bytes. Shared rate_bucket caps requests at 120 per copy and 600 per hashed client address each hour, fail closed. No content, new identifiers, account enrichment or Telegram notifications.',
    audience: ['customer'],
    auth: 'none',
    internal: true,
    body: {
      type: 'object',
      additionalProperties: false,
      required: ['installId', 'version', 'platform', 'openedAt'],
      properties: {
        installId: { type: 'string', format: 'uuid' },
        version: { type: 'string' },
        platform: { type: 'string', enum: ['mac', 'win', 'linux'] },
        openedAt: { type: 'string', format: 'date-time' }
      }
    },
    answers:
      '204, no body (including a daily retry); 400 invalid claim; 413 too large; 415 wrong content type; 429 rate limited; 503 event not stored, retry later'
  },
  // src/ops/desktop.js
  {
    method: 'GET',
    path: '/api/ops/desktop/installs',
    summary: 'List the desktop app installs',
    description:
      'Every Tracy Cowork app that asked the update feed, most recently seen first: install id, channel, platform (`mac`, `win` or `linux` — which channel file it read), version, arch, operating system version, first and last seen, and the linked person once the app was signed in.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers:
      '`{ installs: [{ installId, channel, platform, version, arch, osVersion, email, firstSeen, lastSeen, linkedAt }] }`'
  },
  // src/ops/desktop.js
  {
    method: 'GET',
    path: '/ops/desktop/installs',
    summary: 'Open the desktop app installs table',
    description:
      'The same list as `/api/ops/desktop/installs`, as a plain server-rendered table. Signed-out visitors are sent to /login; a signed-in person without a Tracy admin seat gets 403.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: 'An HTML page'
  },
  // src/ops/general.js
  {
    method: 'GET',
    path: '/api/ops/general',
    summary: 'Read how this deployment is configured',
    description:
      'Read-only view of boot-time config: addresses, sign-in (mail, OAuth, Turnstile), policy limits, integration blocks with the env keys each is missing, and reserved site labels. Never answers a secret, only whether it is set.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: '`{ deployment, signin, limits, integrations, naming, writable: false }`'
  },
  // src/ops/release-checklist.js
  {
    method: 'GET',
    path: '/api/ops/release-checklist',
    summary: 'Read the release checklist with its automatic verdicts',
    description:
      'Everything to check before and after a new version: release steps, environment, infrastructure, database, one line per feature, after the deploy. Lines this process can answer carry a verdict (env: which named variables are absent, never a value; database: migrations, campaign tables, Tracy workspace owner, releases, pictures, model provider). Ticks of manual lines live in the browser, keyed by `release`.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers:
      '`{ environment, origin, release, groups, items: [{ id, group, title, how, auto: { state, detail } | null }], checkedAt }`'
  },
  // src/ops/general.js
  {
    method: 'GET',
    path: '/api/ops/servers',
    summary: 'List servers and the role each plays',
    description:
      'Every configured host with its origins and roles (new sites, onboarding, landing on the default host; demo), whether it runs beside this process, and record-only demo targets. No host secrets are read.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: '`{ servers, roleLabels, note, writable: false }`'
  },
  // src/ops/route.js
  {
    method: 'GET',
    path: '/ops',
    summary: 'Open the Ops console',
    description:
      'Serves the Ops single-page app. Signed out: 302 to `/login`; a non-staff session: bare 403. Answers 503 with an explanation when the bundle is not built.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: 'The Ops SPA `index.html`'
  },
  // src/ops/route.js
  {
    method: 'GET',
    path: '/ops/*',
    summary: 'Serve an Ops page or asset',
    description:
      'Behind the same staff door as `/ops`. A real file under the built bundle is served as itself; any other address answers the SPA’s `index.html` so deep links reload.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: 'A static asset or the SPA `index.html`'
  }
]
