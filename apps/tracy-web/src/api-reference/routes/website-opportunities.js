/** @typedef {import('./index.js').RouteDoc} RouteDoc */

const OFF =
  '404 `FEATURE_OFF` while the `website-opportunities` switch is off (or cannot be read); 401 `NOT_SIGNED_IN`.'
const OWN = 'Another account’s row answers 404 `NOT_FOUND`, exactly like a missing one.'
const REQUEST_ID = {
  type: 'string',
  description:
    'Idempotency key chosen by the client: 8–100 of `A-Z a-z 0-9 . _ : -`. The same key returns the same row.'
}
/** `parts` on the Research again doors (customer, /ops, /find): "Read menu again" sends the two menu parts. */
export const AGAIN_PARTS_DOC =
  'Limits Research again to these research parts, as a list or comma-separated (for example `menu-file,menu-photos`, which is what Read menu again sends); left out, every part is looked at. A name that is not a research part answers 400.'
/** The place's Menu (`place-view.js menuViewOf`); `null` for a place that is not a food or drink business and holds no dishes. */
export const MENU_ANSWER =
  '`menu: {applicable, state: "never" | "read" | "partial" | "none" | "off", reason: null | "photo-reading-off" | "vision-not-tested" | "no-menu-found", readAt, currency, counts: {file, photo, photosRead, photosTotal, limit}, items: [{name, price, currency, currencyAssumed, section, size, source: {kind: "file" | "photo", url, mediaId}, verified, priceScale: 1 | 1000 | 10000 | 1000000 | null, otherPrices: [{price, mediaId, priceScale}]}], files: [{url, name, items, readAt}], photos: [{mediaId, result: "menu" | "not-menu" | "unreadable" | "same-menu" | "over-limit" | "stopped-early" | "unread", items, sameAs}]} | null`'
/** What the Menu's two research parts are, said once for every door that names them. */
export const MENU_PARTS_PROSE =
  'The Menu is two research parts of a food or drink place: `menu-file` (the menu file or page, read as text) and `menu-photos` (the menu photos, read by the vision model, at most the operator setting `menuPhotosPerPlace` a place, 24 unless changed, 0 = off); dishes read from the file win over the same dish read off a photo, and two photos that print different prices for one dish keep both (`otherPrices`). `price` is always the number as printed, never multiplied; `priceScale` is what the menu itself says that number means, in any currency (a note such as "x1000", a suffix such as "110k" or "1.2M"): `1` full amounts, `1000`, `10000` or `1000000` shortened (`"110"` with `1000` is 110,000), `null` when it could not be told; how to show it ("110K", "110,000") is up to the reader. A price per size (glass and bottle) is one item per size, each with its `size`. A photo whose bytes were read before is not read or paid for again. Past the photos a source labels as a menu, reading stops after 4 readings in a row that are not menus (only a menu reading resets the count); the photos left are `stopped-early`, and Read menu again reads the next batch of up to 4, which its preview counts.'

const OPERATOR =
  'Any /ops staff seat may read; a write needs an owner or admin seat, this deployment\u2019s `Origin` and a JSON body (415 `JSON_REQUIRED`). Signed out: 401; any other account: a bare 403.'
const OP_PROVIDER =
  'deepseek, firecrawl, jina, apify, google, rapidapi, serpapi, litescrape, scrapecreators or monid'

/** @type {RouteDoc[]} */
export const WEBSITE_OPPORTUNITIES_ROUTES = [
  {
    method: 'POST',
    path: '/api/website-opportunities/demo/actions/:actionId/chat/prepare',
    summary: 'Prepare the client demo chat',
    description:
      'Account-owned demo action only. Requires the Website Opportunities switch. Prepares the frozen brief and chat destination.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: {
      path: {
        actionId: 'The account-owned demo action UUID.'
      }
    }
  },
  {
    method: 'POST',
    path: '/api/website-opportunities/demo/actions/:actionId/chat/send',
    summary: 'Reserve the client demo chat send',
    description:
      'Account-owned demo action only. Reserves one send for the prepared client chat workflow; the client submits the message in its chat session.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: {
      path: {
        actionId: 'The account-owned demo action UUID.'
      }
    }
  },
  {
    method: 'GET',
    path: '/api/website-opportunities/quality/runs/:id',
    summary: 'Read editorial run evidence',
    description:
      'Returns the account-owned run, stage receipts, operations and settled cost evidence without credentials.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: {
      path: {
        id: 'The account-owned editorial run UUID.'
      }
    }
  },
  {
    method: 'GET',
    path: '/website-opportunities/quality/runs/:id',
    summary: 'Open editorial run evidence',
    description: 'Renders the account-owned editorial run evidence page with private, no-store caching.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: {
      path: {
        id: 'The account-owned editorial run UUID.'
      }
    }
  },
  {
    method: 'POST',
    path: '/api/website-opportunities/quality/runs/:id/cancel',
    summary: 'Stop an editorial run',
    description:
      'Requires the same Origin and an account-owned run. Requests cancellation; answers JSON or redirects HTML callers to the evidence page.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: {
      path: {
        id: 'The account-owned editorial run UUID.'
      }
    }
  },
  {
    method: 'POST',
    path: '/api/internal/wo-social/v1/lookup',
    summary: 'Read versioned social identities from the shared authority',
    description:
      'Central role only. Dedicated Bearer wos_ service key with read scope; no seat cookie or seat API key. At most 40 profile handles. Returns authority UUID, independent identity/binding/state revisions as decimal strings, original fetchedAt and a refresh fence. Deployment reads/minute applies to every service door. 401 invalid key, 403 scope, 429 read limit, 503 unavailable.',
    audience: ['fleet'],
    auth: 'token',
    internal: true,
    body: {
      type: 'object',
      required: ['handles'],
      properties: {
        handles: {
          type: 'array',
          maxItems: 40,
          items: {
            type: 'object',
            required: ['network', 'url'],
            properties: { network: { type: 'string' }, url: { type: 'string' } }
          }
        }
      }
    },
    answers:
      '`{authorityId,items:[{aliasKey,network,url,binding,identity,stateRevision,stateObservedAt,state}]}`'
  },
  {
    method: 'POST',
    path: '/api/internal/wo-social/v1/refresh',
    summary: 'Admit one durable shared social refresh operation',
    description:
      'Central role only. Dedicated Bearer wos_ service key with refresh scope. The verified deployment owns quota and idempotency across credential rotation. Operation UUID, normalized payload and enqueue commit atomically. Retry the same UUID after an uncertain response. authorityId is required; force also requires the expectedFence returned by lookup. Changed epoch or reused UUID with a changed payload answers 409. Superseded observation never forces a newer target. Per-deployment refresh/force ceilings default to zero; provider quota and cost ledger still apply at collection.',
    audience: ['fleet'],
    auth: 'token',
    internal: true,
    body: {
      type: 'object',
      required: ['authorityId', 'operationId', 'handle', 'force'],
      properties: {
        authorityId: { type: 'string', format: 'uuid' },
        operationId: { type: 'string', format: 'uuid' },
        handle: { type: 'object' },
        force: { type: 'boolean' },
        expectedFence: { type: 'object' }
      }
    },
    answers:
      '`{operationId,aliasKey,admission,createdAt}`; receipt records admission, not completed provider collection'
  },
  {
    method: 'GET',
    path: '/api/internal/wo-social/v1/operations/:id',
    summary: 'Read one deployment-owned social refresh receipt',
    description:
      'Central role only. Dedicated Bearer wos_ service key with read scope. Another deployment operation is indistinguishable from missing (404). Read the lookup door for the current collection state and snapshot.',
    audience: ['fleet'],
    auth: 'token',
    internal: true,
    params: { path: { id: 'Operation UUID' } },
    answers: '`{operationId,aliasKey,admission,createdAt}`'
  },

  // src/opportunities-build/route.js
  {
    method: 'GET',
    path: '/api/website-opportunities/demo/template-ranking',
    summary: 'How the template picker groups its cards before a demo build',
    description:
      'For these opportunities’ one trade (templateRanking): `recommended` holds the ids of the cards made for that trade, shown first with a Recommended badge; `generic` the cards that suit any business; every other card is the rest. `ranking` is null when the trade is unknown, the opportunities are of more than one trade, or one of them is not this account’s.',
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { query: { ids: 'Comma-separated opportunity UUIDs, 1 to 100' } },
    answers: '`{ranking:{trade,recommended,generic}|null}`; 400 INVALID_IDS'
  },
  // website-opportunities/src/route.js
  {
    method: 'GET',
    path: '/api/website-opportunities/demo/usage',
    summary: 'Read today’s accepted demo builds',
    description: `UTC day counter and the current operator limit. A 0 limit means uncapped, not uncounted. ${OWN}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    answers: '`{usage:{used,limit,resetsAt}}`'
  },
  // website-opportunities/src/route.js
  {
    method: 'GET',
    path: '/api/website-opportunities/demo/actions/:actionId',
    summary: 'Read a durable demo action',
    description: `The accepted intent, fixed revision id, state (queued,completed,failed), step (brief,build,fill,check), error and timestamps. Agent demo actions include workflow:"agent-demo/1" and chat:null until the site session has been created, then chat:{siteKey,sessionId,href}. Poll this exact action to open its conversation. Retry retains the same site and session. Deleted demos have no chat destination. ${OWN}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { path: { actionId: 'Action id' } },
    answers: '`{action}`'
  },
  // website-opportunities/src/route.js
  {
    method: 'POST',
    path: '/api/website-opportunities/:id/demo/build',
    summary: 'Build a demo in one press',
    description: `Requires selection:{cms,design,quickstart} for a new build (the person chooses the CMS and the template); a CMS sent without design and quickstart takes the template pinned for it on /ops/wo. No account default and no automatic pick: {auto:true} is refused with 400 DEMO_TEMPLATE_REQUIRED. Records the explicit choice and the per-CMS release version/archive checksums before revision or site creation, then the worker creates the pinned brief/template, provisions, waits for deterministic fill, hands off and checks the site. retryOf resumes the failed action’s same revision, CMS, template, site, session and work ids but is a new charged action; sending selection with Retry is refused. Internal retry and request replay never add a charge. ${OWN} ${OFF}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { path: { id: 'Opportunity id' } },
    body: {
      type: 'object',
      required: ['requestId'],
      properties: {
        requestId: REQUEST_ID,
        workflow: {
          type: 'string',
          enum: ['agent-demo/1'],
          description: 'New builds only; Retry inherits the original frozen workflow.'
        },
        retryOf: { type: 'string', description: 'Failed action id' },
        selection: {
          type: 'object',
          required: ['cms'],
          properties: {
            cms: { type: 'string', enum: ['wordpress', 'joomla', 'emdash'] },
            design: { type: 'string' },
            quickstart: { type: 'string' }
          }
        },
        fromFind: {
          type: 'boolean',
          description: 'Recheck stored research before accepting a Find build'
        }
      }
    },
    answers:
      '202 `{actions,usage}`; 429 DEMO_BUILD_DAILY_LIMIT `{code,next,usage:{used,limit,resetsAt},remaining}`'
  },
  // website-opportunities/src/route.js
  {
    method: 'POST',
    path: '/api/website-opportunities/demo/builds/bulk',
    summary: 'Accept a batch of demo builds atomically',
    description: `1–100 distinct owned opportunity ids and one explicit selection:{cms,design,quickstart} for the whole batch (a CMS without design and quickstart takes its /ops/wo pin). No automatic pick. An account/day transaction accepts the whole batch or none; the batch request id derives one stable id per opportunity. Partial replay does not recharge already accepted actions. ${OWN} ${OFF}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    body: {
      type: 'object',
      required: ['requestId', 'ids', 'selection'],
      properties: {
        requestId: REQUEST_ID,
        ids: { type: 'array', items: { type: 'string' } },
        workflow: { type: 'string', enum: ['agent-demo/1'] },
        selection: {
          type: 'object',
          required: ['cms'],
          properties: {
            cms: { type: 'string', enum: ['wordpress', 'joomla', 'emdash'] },
            design: { type: 'string' },
            quickstart: { type: 'string' }
          }
        }
      }
    },
    answers:
      '202 `{actions,usage}`; 429 DEMO_BUILD_DAILY_LIMIT with usage and remaining; no partial acceptance'
  },
  // website-opportunities/src/route.js
  {
    method: 'GET',
    path: '/api/website-opportunities/:id/outreach',
    summary: 'Read demo contacts and message drafts',
    description: `Read-only, owner-scoped shared research view. No provider call, sending or sent state. Available only after QA PASS and before freeze/delete. Language: confident captions, then Google country or unambiguous phone country, then English. Twelve message templates; the account display name signs once at the end. Local/English/bilingual drafts are not saved edits. 409 DEMO_NOT_READY. ${OWN}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { path: { id: 'Opportunity id' } },
    answers:
      '`{outreach:{contacts:[{channel,value,url}],messageLanguage,url,expiresAt,message:{auto,local,english,subject}}}`'
  },

  // website-opportunities/src/route.js
  {
    method: 'GET',
    path: '/api/website-opportunities/:id/place-profile',
    summary: 'Read the place profile of an opportunity',
    description: `The place's research as the validated, template-independent place profile (\`website-opportunities/place-profile\` 1.0.0): business facts, offerings with variants and printed prices, people, claims, FAQs, quotations (Google and Tripadvisor reviews keep their author, avatar, source and date and may be shown on a demo), media relations and one \`coverage\` row per target with one of seven statuses. Nothing of the account's brief or demo. With it \`decisions\`, one per fact: \`{factId, confidence, onSite, decidedBy, reasons}\`, where \`confidence\` is \`corroborated\`, \`single-source\` or \`inferred\` (computed from the evidence, never a sender's claim), \`onSite\` says whether the site may show the fact, \`decidedBy\` is \`rule\` or \`owner\` (the owner's choice from \`PUT …/:id/facts\` wins) and \`reasons\` are the reason codes. While the latest brief holds the business name off the site and the owner has not shown it since, \`siteName\` is the neutral identity the site goes by instead (the brief's home page title made without the name); absent otherwise. Read-only, no provider call. 502 \`PROFILE_UNAVAILABLE\`. ${OWN}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { path: { id: 'Opportunity id' } },
    answers: '`{profile, decisions:[{factId,confidence,onSite,decidedBy,reasons}]}`'
  },

  // website-opportunities/src/route.js
  {
    method: 'GET',
    path: '/api/website-opportunities/settings',
    summary: 'Read my Default CMS for Website Opportunities',
    description: `The signed-in account’s Default CMS (until one is saved, the deployment’s Default CMS from /ops/wo — \`emdash\` unless an operator chose another — with \`cmsSource: "default"\`) and each CMS with whether a build can use it on this deployment (a template is offered for it). ${OFF}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    answers: '`{cms, cmsSource, options: [{cms, available, reason?}]}`'
  },
  // website-opportunities/src/route.js
  {
    method: 'PUT',
    path: '/api/website-opportunities/settings',
    summary: 'Change my Default CMS for Website Opportunities',
    description: `Saves the Default CMS for the signed-in account only. Briefs already made keep the CMS they were made with. 422 \`INVALID_CMS\` or \`CMS_UNAVAILABLE\`. ${OFF}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    body: {
      type: 'object',
      required: ['cms'],
      properties: { cms: { type: 'string', enum: ['joomla', 'wordpress', 'emdash'] } }
    },
    answers: '`{cms, cmsSource, options}`'
  },
  // website-opportunities/src/ops/operator-routes.js
  {
    method: 'GET',
    path: '/api/website-opportunities/operator/me',
    summary: 'Say whether the caller runs this Website Opportunities deployment',
    description: `The operator page asks this before it shows its menu entry. \`hub\` is false here (Tracy does not serve the shared research hub from this app); \`keysWritable\` is true when provider keys can be sealed. ${OPERATOR}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: '`{operator: true, email, hub, keysWritable}`'
  },
  {
    method: 'GET',
    path: '/api/website-opportunities/operator/settings',
    summary: 'Read the Website Opportunities settings, provider keys and provider order',
    description: `The same settings, key facts (source and a masked hint, never the key) and capability groups /api/ops/wo reads, from the same functions. ${OPERATOR}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers:
      '`{settings, settingsMeta: {updatedBy, updatedAt}, keys: {providers, updatedBy, updatedAt}, keysWritable, capabilities}`'
  },
  {
    method: 'PUT',
    path: '/api/website-opportunities/operator/settings',
    summary: 'Save some Website Opportunities settings',
    description: `Body \`{settings}\`; keys left out keep their saved value, and the same validation as /api/ops/wo/settings applies (400 with its \`code\`). ${OPERATOR}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    body: { type: 'object', required: ['settings'], properties: { settings: { type: 'object' } } },
    answers: 'The settings document, as GET'
  },
  {
    method: 'PUT',
    path: '/api/website-opportunities/operator/keys/:provider',
    summary: 'Seal and save, or clear, one provider key',
    description: `Body \`{apiKey}\`: sealed and never returned; an empty string clears it so the environment key applies again. 400 \`INVALID_API_KEY\` or \`UNKNOWN_PROVIDER\`. ${OPERATOR}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { provider: OP_PROVIDER } },
    body: { type: 'object', required: ['apiKey'], properties: { apiKey: { type: 'string' } } },
    answers: 'The settings document, as GET'
  },
  {
    method: 'POST',
    path: '/api/website-opportunities/operator/keys/:provider/test',
    summary: 'Test one provider key with one cheap call',
    description: `The same live test as /api/ops/wo/keys/:provider/test (non-billable endpoints where the provider has one). ${OPERATOR}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { provider: OP_PROVIDER } },
    answers: '`{ok, provider, status, latencyMs?, detail, apis?}`'
  },
  {
    method: 'GET',
    path: '/api/website-opportunities/operator/spend',
    summary: 'Sum what paid provider calls cost',
    description: `Query \`days\` (1–90, default 30, UTC days including today): the cost ledger per provider, purpose and day. A row counts what it commits against a cap: a settled call its cost, an open or unreconciled one its ceiling, a call never sent nothing. \`caps\` are the spend caps of the settings. 400 \`INVALID_DAYS\`. ${OPERATOR}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers:
      '`{days, since, today: {day, committedCents, spentCents, reservedCents, unreconciledCents}, totals: {calls, committedCents, settledCents, openCents, unreconciledCents, unreconciledCalls, releasedCalls}, byProvider, byPurpose, byDay, caps}`'
  },
  {
    method: 'GET',
    path: '/api/website-opportunities/operator/spend/rows',
    summary: 'List cost ledger rows, newest first',
    description: `Query \`state\` (reserved, settled, released, unreconciled), \`provider\`, \`purpose\`, \`limit\` (1–200) and \`cursor\` (the \`next\` of the previous page). 400 \`INVALID_FILTER\`, \`INVALID_LIMIT\` or \`INVALID_CURSOR\`. ${OPERATOR}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers:
      '`{rows: [{id, day, createdAt, settledAt, provider, operation, purpose, payer, state, reservedCents, actualCents, costReported}], next}`'
  },
  {
    method: 'GET',
    path: '/api/website-opportunities/operator/queue',
    summary: 'List shared research jobs by state',
    description: `Query \`state\` (queued, running, paused, blocked, failed, cancelled, completed; default: the waiting, running and failed ones) and \`limit\`. ${OPERATOR}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers:
      '`{counts: {<state>: n}, jobs: [{id, placeId, placeName, state, stage, attempt, onlySource, startedBy, error, createdAt, updatedAt, leaseUntil, retryable, cancellable}]}`'
  },
  {
    method: 'POST',
    path: '/api/website-opportunities/operator/queue/:id/retry',
    summary: 'Queue a stopped research job’s place again',
    description: `A failed, paused, blocked or cancelled job: its place is queued again as an operator retry (a stopped run keeps its cursors). 404 \`NOT_FOUND\`, 409 \`NOT_RETRYABLE\`. ${OPERATOR}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { id: 'Place job id' } },
    answers: '`{ok, job: {id, state, placeId}}`'
  },
  {
    method: 'POST',
    path: '/api/website-opportunities/operator/queue/:id/cancel',
    summary: 'Stop a research job nobody waits on',
    description: `409 \`STILL_WANTED\` while a request or a /find visitor still waits on it, 409 \`NOT_ACTIVE\` when it already stopped, 404 \`NOT_FOUND\`. ${OPERATOR}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { id: 'Place job id' } },
    answers: '`{ok}`'
  },
  // website-opportunities/src/route.js
  {
    method: 'GET',
    path: '/api/website-opportunities/capabilities',
    summary: 'List which sources Website Opportunities can collect from here',
    description: `The domain contract version and, per source (website, facebook, instagram, tiktok, youtube), whether this server can collect from it and why not (e.g. \`credential_missing\`). Discovery uses OpenStreetMap. ${OFF}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    answers:
      '`{contract, sources: {<source>: {available, reason?}}, discovery: {"google-places", "google-maps", osm: true}, kinds: [<kind>], trades: [<trade>], cuisines: [<cuisine>], maps: {browserKey: string | null}, search: {maxRadiusM: 50000, depths: {quick: 20, standard: 60}}, socialStats: {networks: ["facebook", "instagram", "tiktok", "youtube"], autoLimit, dailyCap, providers: {rapidapi, youtube, apify}}}` — each map provider this server has a key for; the food kinds, the kinds of business (`trades`) and the cuisines a search accepts; the public Maps JavaScript key for the map view (null = no map); the most places each depth returns here (quick 20, standard 60, each lowered by the operator\'s place limit, 60 unless changed); which social networks get follower and posting numbers, how many pages one social-stats call may queue (10 unless changed), the billable calls one account may cause a day (200 unless changed), and which providers have a key'
  },
  // website-opportunities/src/route.js
  {
    method: 'GET',
    path: '/api/website-opportunities/approx-location',
    summary: "Approximate the caller's city from their network",
    description: `What "Use my location" falls back to when the browser gives no position (plain http, permission denied, no location hardware): a city-level point, never precise. Read from Cloudflare's visitor-location headers when present, else a geo-IP lookup of the client address (ipinfo.io, then geojs.io); a private or missing address is never sent out, except on a local stand (\`.test\`/\`localhost\` origin), which asks about its own public address. 404 \`LOCATION_UNKNOWN\`, 429 \`RATE_LIMITED\` (30 an hour). ${OFF}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    answers: '`{lat, lon, label, country, accuracy: "city", provider: "cloudflare" | "ipinfo" | "geojs"}`'
  },
  // website-opportunities/src/route.js
  {
    method: 'POST',
    path: '/api/website-opportunities/search',
    summary: 'Find places near a location',
    description: `With \`intent: place\`, sends the original restaurant name/address to Google Text Search (one page, at most 20); an autocomplete \`placeId\` reads that exact place. Google credentials are required (503 \`CREDENTIAL_MISSING\`); no Apify/geocoder fallback silently changes the name query into nearby discovery. Named results retain chains and have no radius-derived distance. A geographic city result from Google uses the existing nearby discovery path. Without this intent, geocodes \`query\` (or takes \`lat\`/\`lon\`, then \`query\` is only the label of the centre — what the suggestion door resolves to) and lists restaurants, cafes, fast food, bakeries, bars and nightlife within \`radiusM\` (default set by the operator, 2000 unless changed; at most 50000) from Google Places, Google Maps through Apify (when the account has Apify map searches left today — 15 a day unless the operator changed it; a search Places answered does not count) or else OpenStreetMap, in the order the operator chose, deduplicated (same provider id, or same name within 60 m; branches kept apart). The filters (\`kinds\`, \`cuisines\`, \`minRating\`, \`priceLevels\`, \`openNow\`) are applied by Google; \`depth\` says how far it pages (quick: 20 places, one request; standard: up to 60, three requests), by default quick up to 3 km and standard beyond, and the operator's place limit can only lower it. Chains (a listed brand, or the same name twice in the result) are left out unless \`includeChains\`, and counted in \`hiddenChains\`; \`chainSuspect\` marks a kept candidate whose name repeats. Each candidate carries its kind and cuisine, distance, price level, whether it is open now, its first listing photo (\`photo.name\` for the photo door, \`photo.credit\` to show beside it), \`status\` for this account (new, seen = saved, researched = a research job completed, demo = a site was built), \`siteCheck\` (the cached verdict on its website, see the site-checks door; null when none yet — a search never queues one), \`social\` (the cached numbers of its social pages per network, see the social-stats door; null when none is known — a search never queues one) and \`score\` (the opportunity score; \`pending\` while the site check is owed; its marketing points read the latest post across networks). \`provider\` names the map that answered; \`fallbackFrom\` is set when a paid map failed and the next one answered instead; \`pages\` how many Places pages were read. Synchronous, 90 s at most. 400 \`INVALID_SEARCH\`, 404 \`PLACE_NOT_FOUND\`, 429 \`RATE_LIMITED\` (60 an hour), 502 \`DISCOVERY_FAILED\`, 504 \`SEARCH_TIMEOUT\`. ${OFF}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    body: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Place name, address, city or area, up to 200 characters' },
        intent: {
          type: 'string',
          enum: ['area', 'place'],
          description:
            'Defaults to area for older clients. Place sends the original query to Google Text Search without an inferred radius.'
        },
        placeId: {
          type: 'string',
          description: 'Optional exact Google place selected from autocomplete, for place intent.'
        },
        sessionToken: {
          type: 'string',
          description: 'Autocomplete session token, terminated by the exact place details read.'
        },
        lat: { type: 'number' },
        lon: { type: 'number' },
        radiusM: { type: 'number', description: 'Metres, 1–50000' },
        trade: {
          type: 'string',
          enum: [
            'any',
            'food',
            'beauty',
            'health',
            'fitness',
            'hospitality',
            'travel',
            'professional',
            'creative',
            'education',
            'retail',
            'auto',
            'home',
            'events'
          ],
          description:
            'The kind of business an area search finds: `any` (default) is one Google Nearby call across every kind (at most 20 places); `food` is the paged food Text Search, and is what `cuisines` or a narrower `kinds` mean when no trade is sent'
        },
        kinds: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['restaurants', 'cafes', 'fast-food', 'bakeries', 'bars', 'nightlife']
          },
          description: 'Which kinds to search; all six unless sent'
        },
        cuisines: { type: 'array', items: { type: 'string' }, description: 'From `capabilities.cuisines`' },
        minRating: { type: 'number', description: '0–5' },
        priceLevels: { type: 'array', items: { type: 'integer', enum: [0, 1, 2, 3, 4] } },
        openNow: { type: 'boolean' },
        depth: { type: 'string', enum: ['quick', 'standard'] },
        includeChains: { type: 'boolean', description: 'Keep chains in the answer (default false)' }
      }
    },
    answers:
      '`{center: {label, lat, lon}, provider: "google-places" | "google-maps" | "osm", fallbackFrom?: {provider, code}, pages?, hiddenChains, candidates: [{provider, providerId, name, branch?, address?, phone?, lat, lon, website?, socials, contacts?, category?, rating?, reviews?, mapsUrl?, temporarilyClosed?, trade?, kind, cuisine, primaryType, distanceM, priceLevel: 0–4 | null, openNow: boolean | null, photo: {name, credit} | null, chain, chainSuspect, status: "new" | "seen" | "researched" | "demo", siteCheck: <check> | null, social: {<network>: <stat>} | null, score: {score, grade: "A" | "B" | "C", pending, reasons: [[key, points | null, params?]]} | null}]}`'
  },
  // website-opportunities/src/route.js + site-checks.js
  {
    method: 'POST',
    path: '/api/website-opportunities/site-checks',
    summary: 'Read, and queue, the checks of candidates’ current websites',
    description: `What is known about each website (mobile PageSpeed performance and SEO, LCP, https, mobile-friendly, the CMS and its version, the footer’s copyright year, emails and social links read off the homepage), measured in the background and shared by every account: a \`done\` verdict is kept 30 days, a \`down\` (no answer, or HTTP ≥ 500 twice), \`blocked\` (401/403/429 or a bot challenge) or \`failed\` (a private address, three attempts, nothing answered) one 24 h. An address with no fresh verdict is queued — but only the first N unknown ones of a call (N set by the operator, 20 unless changed; send them by score), the rest answer \`not_queued\` and can be asked again later. Poll every few seconds until nothing you asked for is \`queued\`; the answer carries the checks only, the score is yours to recompute. Up to 60 addresses a call, as \`POST …/search\` gave them. 400 \`INVALID_URLS\`, 429 \`RATE_LIMITED\` (600 calls an hour), 503 \`CHECKS_UNAVAILABLE\`. ${OFF}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    body: {
      type: 'object',
      required: ['urls'],
      properties: {
        urls: { type: 'array', items: { type: 'string' }, description: 'http(s) addresses, at most 60' }
      }
    },
    answers:
      '`{checks: {<url>: {status: "queued"} | {status: "not_queued"} | {status: "done" | "down" | "blocked" | "failed", finalUrl, performance: 0–100 | null, seo, lcpMs, https: boolean | null, mobileFriendly: boolean | null, cms, cmsVersion, copyrightYear, emails: [], socials: {<network>: url}, error: string | null, checkedAt}}}`'
  },
  // website-opportunities/src/route.js + social-stats.js
  {
    method: 'POST',
    path: '/api/website-opportunities/social-stats',
    summary: 'Read, and queue, the follower and posting numbers of candidates’ social pages',
    description: `What is known about each Facebook, Instagram, TikTok or YouTube page (followers, posts, the latest post, posts a month over the last 90 days), fetched in the background through RapidAPI listings and the YouTube Data API and shared by every account: numbers are kept 7 days (then \`stale\` and fetched again), a page that does not exist or is private (\`not_found\`) 30 days, a failure is asked again after an hour and never wipes the last numbers (they answer \`done\` with \`stale\` and \`error\`). A page with no fresh numbers is queued — but only the first N unknown or stale ones of a call (N set by the operator, 10 unless changed; send them by score), the rest answer \`not_queued\`. \`force: true\` (at most 4 pages, a row's own) queues every page named, fresh or not. Every provider call counts against a daily cap per provider (set by the operator) and per account (200 unless changed); a spent cap leaves the page \`queued\` until the next UTC day, with no paid fallback, and says so with \`deferredUntil\` (when it will be fetched; do not poll it before then). A URL that is not a profile answers \`not_found\` with \`error: "not_a_profile"\`. Poll every ten seconds or slower until nothing you asked for is \`queued\` without \`deferredUntil\`. Up to 40 pages a call, keyed in the answer by the URL you sent. 400 \`INVALID_HANDLES\`, 429 \`RATE_LIMITED\` (60 calls an hour), 503 \`SOCIAL_STATS_UNAVAILABLE\`. ${OFF}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    body: {
      type: 'object',
      required: ['handles'],
      properties: {
        handles: {
          type: 'array',
          items: {
            type: 'object',
            required: ['network', 'url'],
            properties: {
              network: { type: 'string', enum: ['facebook', 'instagram', 'tiktok', 'youtube'] },
              url: {
                type: 'string',
                description: 'The profile URL, as `socials.<network>` of a search candidate'
              }
            }
          },
          description: 'At most 40 (4 with `force`)'
        },
        force: {
          type: 'boolean',
          description: 'Queue every page named, fresh or not (a row’s “Get social stats”)'
        }
      }
    },
    answers:
      '`{stats: {<url>: {status: "queued" | "not_queued" | "not_found" | "failed", error?, deferredUntil?: ISO} | {status: "done" | "queued", url, followers: number | null, posts: number | null, lastPostAt: ISO | null, postsPerMonth: number | null, coverage: "complete" | "partial", fetchedAt, stale: boolean, provider, error?, deferredUntil?: ISO}}}`'
  },
  {
    method: 'POST',
    path: '/api/website-opportunities/find/refresh',
    summary: 'Refresh a restored Find list from stored research and checks',
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    description: `Reads at most 100 candidate identities without Google discovery or collector work. Public published research supplies existing fields and research.researchedAt; findAction is computed from this account's own workflow. Client-supplied research, status and action metadata are ignored. ${OWN} ${OFF}`,
    body: {
      type: 'object',
      required: ['candidates'],
      properties: {
        candidates: {
          type: 'array',
          maxItems: 100,
          items: { type: 'object', required: ['provider', 'providerId', 'name'] }
        }
      }
    },
    answers: '`{candidates: [...Find candidates with research and findAction]}`'
  },
  // website-opportunities/src/route.js
  {
    method: 'GET',
    path: '/api/website-opportunities/places/suggest',
    summary: 'Suggest places for the Find box as the person types',
    description: `Google Places Autocomplete (New) with the operator’s Google key, limited to areas a search can be centred on (localities, sublocalities, first- and second-level administrative areas, neighbourhoods); at most five. \`q\` shorter than 3 characters (after trimming) answers \`{suggestions: []}\` without asking Google. \`session\` is a UUID the client keeps for one typing session and sends again when it resolves the pick, so Google bills the keystrokes and the pick as one session. \`types\` are Google’s place types: a \`locality\`, \`postal_town\` or \`administrative_area_level_*\` is best searched by its \`text\` as \`query\` (Google’s point for a city is its geometric centre, which can lie far outside the town); smaller areas are resolved to their point; business suggestions are sent to Search with intent=place and their exact placeId, while street addresses remain direct text queries. 400 \`INVALID_SUGGEST\`, 429 \`RATE_LIMITED\` (300 calls an hour, together with the resolve door) or \`PROVIDER_QUOTA\`, 502 \`PROVIDER_ERROR\`, 503 \`CREDENTIAL_MISSING\` (no Google key: stop suggesting). ${OFF}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: {
      query: {
        q: 'What was typed, up to 200 characters',
        session: 'UUID of this typing session',
        lang: 'Language tag for the suggestion text, e.g. `vi` (optional)'
      }
    },
    answers: '`{suggestions: [{placeId, text, mainText, secondaryText: string | null, types: string[]}]}`'
  },
  // website-opportunities/src/route.js
  {
    method: 'GET',
    path: '/api/website-opportunities/places/suggest/:placeId',
    summary: 'Resolve a picked place suggestion to a point',
    description: `Place Details with the \`id,displayName,formattedAddress,location\` mask only, carrying the typing session’s \`session\` to close it. Send the answer to \`POST …/search\` as \`lat\`/\`lon\` with \`label\` as \`query\`: a search with a point does not geocode. 400 \`INVALID_SUGGEST\` or \`INVALID_PLACE_ID\`, 404 \`PLACE_NOT_FOUND\`, otherwise the refusals of the suggest door. ${OFF}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: {
      path: { placeId: 'The `placeId` of a suggestion' },
      query: { session: 'The same UUID the suggestions were asked with', lang: 'Language tag (optional)' }
    },
    answers: '`{label, lat, lon}`'
  },
  // website-opportunities/src/route.js + place-photo.js
  {
    method: 'GET',
    path: '/api/website-opportunities/places/photo',
    summary: 'Stream a Google Places photo by the name a search gave',
    description: `The listing photo named by \`photo.name\` of a \`POST …/search\` candidate, scaled to \`w\` pixels wide (160–1600, 480 unless sent), streamed through this server with the operator’s Google key; nothing is kept here (Google’s terms), the browser may keep it for ten minutes. \`X-Photo-Credit\` carries the authors’ names, percent-encoded, to show beside the picture (\`photo.credit\` in the search answer says the same). A name Google no longer honours is looked up again once through the place’s id. 400 \`INVALID_PHOTO_NAME\`, 404 \`NO_PHOTO\`, 429 \`RATE_LIMITED\` (600 an hour) or \`PROVIDER_QUOTA\`, 502 \`PROVIDER_ERROR\`, 503 \`CREDENTIAL_MISSING\`. ${OFF}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { query: { name: '`places/<placeId>/photos/<ref>`', w: 'Width in pixels, 160–1600' } },
    answers:
      'The image bytes (`Content-Type` from the bytes, `Cache-Control: private, max-age=600`, `X-Photo-Credit`)'
  },
  // website-opportunities/src/route.js + place-photo.js
  {
    method: 'GET',
    path: '/api/website-opportunities/places/:placeId/photo',
    summary: 'Stream a Google Places listing’s first photo by place id',
    description: `As the photo door above, for a place whose photo name is not at hand: Place Details is asked for \`photos\` only (the Essentials IDs Only SKU) and its first photo streamed. 400 \`INVALID_PLACE_ID\`, otherwise the same answers and refusals. ${OFF}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: {
      path: { placeId: 'The `providerId` of a google-places candidate' },
      query: { w: 'Width in pixels, 160–1600' }
    },
    answers: 'The image bytes (`Content-Type`, `Cache-Control: private, max-age=600`, `X-Photo-Credit`)'
  },
  // website-opportunities/src/route.js
  {
    method: 'POST',
    path: '/api/website-opportunities',
    summary: 'Save a business as an opportunity, from a search candidate or from its links',
    description: `From a search \`candidate\`, or from up to 5 \`links\` of ONE business (a Google Maps or share link, its website, its Facebook, Instagram, TikTok or YouTube page, its page on a listing site such as magicpin or Tripadvisor); the old \`url\` means \`links: [url]\`. Its identity is the Google place the Google link names (a short link followed by its redirects on Google hosts only, then matched by Google Places to exactly one place: its id, its cid, or one result of the same name near the coordinates or with the phone a listing page states, or the typed \`name\`), else the website, else the first social page, else the first listing page; every other link is that opportunity's own (researched for it alone), and a listing page is read once, never crawled. Each link is checked to be a public address. Partial success: \`links\` reports each link in order as \`{url, kind, source?, used, reason?}\`, \`reason\` one of \`invalid\`, \`not-public\`, \`duplicate\`, \`limit\`, \`one-google\`, \`one-website\`, \`unresolvable\` (a Google link that cannot be turned into a place) or \`blocked\` (failed the public-address check). One opportunity per account and identity: saving it again answers 200 with the existing one and adds the links it did not have, a new one 201. 409 \`GOOGLE_LINK_AMBIGUOUS\` with \`candidates\` (at most 5, \`{provider: "google-places", providerId, name, address?, rating?, category?}\`) and \`links\` when the Google link matches more than one place: send the same body again with the picked one as \`place\`. 422 \`NO_USABLE_LINKS\` with \`links\` when none can be used. 400 \`INVALID_CANDIDATE\`, \`INVALID_LINKS\`, \`INVALID_PLACE\` or \`INVALID_REQUEST\`; the old \`url\` body keeps its own refusals (400 \`INVALID_URL\`, 422 \`URL_BLOCKED\` for private, loopback, link-local or metadata addresses, 422 \`URL_UNRESOLVABLE\`). ${OFF}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    body: {
      type: 'object',
      properties: {
        candidate: { type: 'object', description: 'A candidate exactly as `POST …/search` answered it' },
        links: {
          type: 'array',
          items: { type: 'string' },
          description: 'Links of one business, in the order pasted (up to 5 are used)'
        },
        url: { type: 'string', description: 'One link: the same as `links: [url]`' },
        name: {
          type: 'string',
          description: 'Words typed beside the links: matches the Google place, and names the opportunity'
        },
        place: {
          type: 'object',
          description: 'The candidate picked from a 409 `GOOGLE_LINK_AMBIGUOUS` answer'
        }
      }
    },
    answers:
      '`{opportunity}`; from links also `links: [{url, kind, source?, used, reason?}]`; 409 `{code: "GOOGLE_LINK_AMBIGUOUS", candidates, links}`; 422 `{code: "NO_USABLE_LINKS", links}`'
  },
  // website-opportunities/src/route.js
  {
    method: 'GET',
    path: '/api/website-opportunities',
    summary: 'List my opportunities',
    description:
      'The signed-in account’s opportunities, newest first (`createdAt`, then id), each with its latest job, latest revision, the sites built from it, its latest build (`done` once its site finished being created), its `stage` and whether it needs `attention`, and what `POST …/search` would show for the same place: `score` (the opportunity score, computed from the stored candidate), `siteCheck`, `social` and `socials` (read from the shared caches only — listing never queues a check or a stat; all null when the server cannot compute them, and the list still answers). `stage` is `research` until research completes, `demo` once research, a revision or a build action exists, and `outreach` only after the latest live demo has QA PASS; `cancelled` is outside these three steps. `attention` includes stopped research, failed demo actions/builds and QA needs-review. `demoAction` reports the durable action and its step; `outreach` contains read-only contacts, messageLanguage and drafts only for a live QA-passed demo. With no query parameter the answer is every row as `{opportunities}`, as it always was. With any of `stage`, `attention`, `q`, `cursor`, `limit`, `ids` the answer is one page plus `counts` (per filter button under the same `q`: `all` counts every row, a row needing attention counts in `attention` and not in its step) and `total` (rows matching the filter); pass `nextCursor` back as `cursor` for the next page (null on the last). A `stage` filter leaves out rows needing attention unless `attention=1` is sent too. `ids` answers exactly those rows of yours, whatever their stage, for polling. Readable while the switch is off. 400 `INVALID_STAGE`, `INVALID_ATTENTION`, `INVALID_QUERY`, `INVALID_LIMIT`, `INVALID_CURSOR`, `INVALID_IDS`; 401 `NOT_SIGNED_IN`.',
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: {
      query: {
        stage: '`research` | `demo` | `outreach` | `cancelled`',
        attention: '`1` only rows needing attention, `0` none of them',
        q: 'Search name, branch and address, up to 100 characters (`%` and `_` are plain characters)',
        cursor: '`nextCursor` of the previous page',
        limit: 'Rows a page, 1–100 (50 unless sent)',
        ids: 'Up to 100 opportunity ids, comma-separated: just those rows (no other filter applies)'
      }
    },
    answers:
      '`{opportunities: [{…opportunity, job, latestRevision, sites, stage, attention, latestBuild: {id, state, siteKey, done} | null, score: {score, grade: "A" | "B" | "C", pending, reasons} | null, siteCheck: <check> | null, social: {<network>: <stat>} | null, socials?}]}`; with a parameter also `counts: {all, research, demo, outreach, cancelled, attention}, nextCursor: string | null, total`'
  },
  // website-opportunities/src/route.js
  {
    method: 'GET',
    path: '/api/website-opportunities/:id',
    summary: 'Read one opportunity with its sources, media, jobs, revisions and builds',
    description: `Everything collected for one opportunity: per-source status, reason and coverage (for a researched place, every source its research tried, Google Place Details, Google Maps and Tripadvisor included, failures too), the merged profile with its evidence and conflicts (\`profile.name\` is the name on the site and \`profile.nameCheck\` says why: \`{name, state: "agreed" | "check" | "chosen", suggested, current, options: [{name, sources: [{source, label?}]}], disagree, chosen?: {name, by: "typed" | "picked"}}\`; a name two sources other than Google agree on is suggested over Google's, \`check\` means the sources disagree and nobody has picked one yet), \`profile.hoursCheck\` says which opening hours the site shows: \`{state: "none" | "agreed" | "conflict" | "check" | "chosen", hours, claims: [{source, hours}], choice?: "keep" | "leave" | "edit", allWeek}\`, \`check\` when one source alone says open 24 hours every day for a business not normally open day and night), \`profile.googleRating\` says whether the site shows Google's rating: \`{state: "none" | "shown" | "left", score, reviews, few, choice: "show" | "leave" | null, from: "details" | "search"}\`, \`few\` under 5 reviews (left off until the person shows it), \`profile.phone\` is the main number (Google's, else the one most of the business's own sources state, its bios included) with \`phoneSources\`, and \`profile.otherPhones: [{phone, sources, whatsapp?}]\` the business's other numbers, brand observations, media metadata, jobs, revisions and builds. The two web search rows (\`facebook-search\`, \`instagram-search\`) also carry \`queries\` and \`pages\`: each page found with its \`url\`, \`network\`, \`verdict\` (\`confirmed\` = added to the place, \`pending\` = a person must check it, \`rejected\` = not used), \`title\`, \`proofs\` and \`reasons\`. Readable while the switch is off. \`menu\` is the place's Menu: ${MENU_PARTS_PROSE} ${OWN}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { path: { id: 'Opportunity id' } },
    answers: `\`{opportunity, place, menu, sources, profile, media, jobs, revisions, builds}\`; ${MENU_ANSWER}`
  },
  // website-opportunities/src/route.js
  {
    method: 'PUT',
    path: '/api/website-opportunities/:id/name',
    summary: 'Set the name the business’s site carries',
    description: `The person’s pick for the name on the site (Keep, Use the other name or Edit on the Profile card): final for every later brief, build and site check, and the opportunity’s \`name\`. Saving the opportunity again keeps it. Answers the opportunity, its candidate holding \`namePick: {name, at}\`. 400 \`INVALID_NAME\` for a name that is empty or longer than 200 characters after spaces are folded. ${OWN}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { path: { id: 'Opportunity id' } },
    body: {
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string', description: 'The business’s name, 1 to 200 characters' } }
    },
    answers: '`{opportunity}`'
  },
  // website-opportunities/src/route.js
  {
    method: 'PUT',
    path: '/api/website-opportunities/:id/hours',
    summary: 'Set the opening hours the business’s site shows',
    description: `The person’s choice for the opening hours on the site (Keep, Edit hours or Leave off the site on the Profile card): \`keep\` confirms hours waiting for a check, \`leave\` shows none, \`edit\` shows the \`hours\` sent, one line per group of days (\`Mo-Fr 09:00-18:00\`, \`Sa closed\`, or Google’s \`Monday: Open 24 hours\`). Final for every later brief, build and site check. Answers the opportunity, its candidate holding \`hoursPick: {choice, hours?, at}\`. 400 \`INVALID_CHOICE\`, 400 \`INVALID_HOURS\` when a line cannot be read or there are more than 14. ${OWN}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { path: { id: 'Opportunity id' } },
    body: {
      type: 'object',
      required: ['choice'],
      properties: {
        choice: { type: 'string', enum: ['keep', 'leave', 'edit'] },
        hours: {
          type: 'array',
          items: { type: 'string' },
          description: 'With `edit`: one line per group of days'
        }
      }
    },
    answers: '`{opportunity}`'
  },
  // website-opportunities/src/route.js
  {
    method: 'PUT',
    path: '/api/website-opportunities/:id/rating',
    summary: 'Show or leave off Google’s rating on the business’s site',
    description: `The person’s choice for Google’s rating on the site (Show on the site or Leave off the site on the Profile card): \`show\` gives the rating and its review count to the site, credited to Google, \`leave\` keeps them off. Without a choice a rating from 5 reviews on is shown and one from fewer is left off. Final for every later brief, build and site check. Answers the opportunity, its candidate holding \`ratingPick: {choice, at}\`. 400 \`INVALID_CHOICE\`. ${OWN}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { path: { id: 'Opportunity id' } },
    body: {
      type: 'object',
      required: ['choice'],
      properties: { choice: { type: 'string', enum: ['show', 'leave'] } }
    },
    answers: '`{opportunity}`'
  },
  // website-opportunities/src/route.js
  {
    method: 'PUT',
    path: '/api/website-opportunities/:id/reading',
    summary: 'Remove an item of the business reading, or show a team member on the site',
    description: `The person’s pick on the reading of the Profile card (Services, Who it is for, Team, story: what the research read from the business’s bio, posts and reviews, each item with its quote): \`remove\` takes an item off every later brief and site, \`restore\` brings it back; \`show\` puts a person named only in reviews on the site (off by default), \`hide\` takes them off again. Never blocks Build. Answers the opportunity, its candidate holding \`readingPicks: {removed, shown, at}\`. 400 \`INVALID_ITEM\`, 400 \`INVALID_CHOICE\`. \${OWN}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { path: { id: 'Opportunity id' } },
    body: {
      type: 'object',
      required: ['item', 'choice'],
      properties: {
        item: { type: 'string', description: 'The id of an item of the reading' },
        choice: { type: 'string', enum: ['remove', 'restore', 'show', 'hide'] }
      }
    },
    answers: '`{opportunity}`'
  },
  // website-opportunities/src/route.js
  {
    method: 'PUT',
    path: '/api/website-opportunities/:id/facts',
    summary: 'Put one fact of the place profile on the site, or leave it off',
    description: `The owner’s choice for one fact on the Profile card: \`onSite: true\` puts it on the site, \`false\` leaves it off, whatever the rule decided (a rating from few reviews, all-week 24-hour hours, a person named only in reviews, an inferred contact); \`null\` lets the rule decide again. Kept on the opportunity, so it holds for every later brief, build and site check, Research again included; a choice for a fact research no longer finds is kept but changes nothing. Answers the opportunity, its candidate holding \`factOverrides: {<factId>: {onSite, at}}\`. 400 \`INVALID_FACT\`, 400 \`INVALID_ON_SITE\`. ${OWN}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { path: { id: 'Opportunity id' } },
    body: {
      type: 'object',
      required: ['factId', 'onSite'],
      properties: {
        factId: { type: 'string', description: 'The id of a fact of the place profile' },
        onSite: { type: ['boolean', 'null'], description: 'true or false; null clears the choice' }
      }
    },
    answers: '`{opportunity}`'
  },
  // website-opportunities/src/route.js
  {
    method: 'PUT',
    path: '/api/website-opportunities/:id/key-messages',
    summary: 'Edit the key messages the business’s site leads with',
    description: `The owner’s edits of the key messages on the Profile card (the two or three points the business reading proposed, each resting on facts and quotes): \`removed\` lists the key messages taken off, \`order\` the order they lead in, \`labels\` a new label for a key message (1 to 60 characters). A save is merged into the stored picks: removed ids are added to the ones already removed, a label sent replaces that message’s label and one not sent is kept, \`order\` replaces the stored order; a key message’s facts and quotes cannot be edited. Kept on the opportunity for every later brief and build, Research again included. Answers the opportunity, its candidate holding \`keyMessagePicks: {removed, order, labels, at}\`. 400 \`INVALID_KEY_MESSAGES\`. ${OWN}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { path: { id: 'Opportunity id' } },
    body: {
      type: 'object',
      properties: {
        removed: { type: 'array', items: { type: 'string' }, description: 'Key message ids taken off' },
        order: {
          type: 'array',
          items: { type: 'string' },
          description: 'Key message ids in the order they lead'
        },
        labels: { type: 'object', description: 'Key message id to its new label' }
      }
    },
    answers: '`{opportunity}`'
  },
  // website-opportunities/src/route.js
  {
    method: 'POST',
    path: '/api/website-opportunities/:id/research',
    summary: 'Start collecting an opportunity’s website, social pages and media',
    description: `Queues a durable research job (discovery, collection per source, media, profile, brand), run by the server in the background and resumable. Each social source takes its 20 most recent posts of the last 12 months, one Apify run capped by Apify at the operator's ceiling ($0.25 unless changed); the account has 40 Apify collection runs a day, and past them the job pauses with \`SOURCE_PAUSED\`/\`quota\` until resumed. The same \`requestId\` answers the same job; 409 \`JOB_ACTIVE\` while another job of this opportunity is queued or running, 409 \`REQUEST_ID_REUSED\` for a key used on another opportunity. With \`only: "logo"\` on a place that was researched before, it runs just the logo again: the home page is read for the logo it points at, the logo candidates are downloaded and looked at, and no other source is collected. With \`only\` naming one source (\`website\`, \`facebook\`, \`instagram\`, \`tiktok\`, \`youtube\`, \`google-places\`, \`google-maps\`, \`tripadvisor\`) it collects that source again now, even when it was tried recently, and no other source; the profile, pictures and brand are rebuilt from what it found, through the same cost ledger and limits as a whole research. A whole research, or a run of the same part, already waiting or running answers it instead; a waiting run of another part refuses it (409 \`JOB_ACTIVE\`, ask again once it ran), a running one is followed by this part's run; a whole research asked for later turns a waiting one-part run into a whole one; on a place never researched the whole research runs. A Google or Tripadvisor part this deployment cannot collect for the place answers 409 \`ONLY_UNAVAILABLE\`. 400 \`INVALID_ONLY\`, 409 \`ONLY_UNSUPPORTED\`. \`only\` also takes \`facebook-search\` or \`instagram-search\`: the web search for that network's page of a place with no website of its own, then the collection of a page it confirms (409 \`ONLY_UNAVAILABLE\` without a web search provider). With \`again: true\` (and no \`force\` or \`only\`) it is Research again: only the parts that failed on our side, are more than 30 days old, were never tried or whose rule changed run (see \`GET …/research-again\`), frozen into a run the account starts; a run already going is joined as it is (\`again.joined\`). 409 \`NOTHING_DUE\` with the \`plan\` when nothing is due, 429 \`RESEARCH_AGAIN_LIMIT\` past the account's runs of the day, 409 \`AGAIN_UNSUPPORTED\` for an opportunity that names no shared place, 400 \`INVALID_AGAIN\`. With \`again: true\`, \`parts\` limits the run to those parts (Read menu again sends \`menu-file\` and \`menu-photos\`); \`parts\` without \`again\`, or naming something that is not a part, is 400 \`INVALID_PARTS\`. \`only\` also takes \`menu-file\` or \`menu-photos\`. ${OWN} ${OFF}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { path: { id: 'Opportunity id' } },
    body: {
      type: 'object',
      required: ['requestId'],
      properties: {
        requestId: REQUEST_ID,
        only: {
          type: 'string',
          enum: ['logo'],
          description: 'Refresh this one part of a researched place and nothing else'
        },
        again: { type: 'boolean', description: 'Research again: only the parts that are due' },
        parts: {
          oneOf: [{ type: 'array', items: { type: 'string' }, minItems: 1 }, { type: 'string' }],
          description: `With \`again: true\` only. ${AGAIN_PARTS_DOC}`
        }
      }
    },
    answers: '202 `{job, again?: {run, kept, ceilingCents, joined}}`'
  },
  // website-opportunities/src/route.js
  {
    method: 'GET',
    path: '/api/website-opportunities/:id/research-again',
    summary: 'Preview what Research again would look at for an opportunity’s place',
    description: `What a press of Research again would run now, why, and the most it may cost (each part's reserved ceiling in cents), the parts it keeps and why, and the account's runs of the day. A \`menu-photos\` part to run carries \`photos\`, how many photos it would read; its ceiling is that many vision calls. 400 \`INVALID_PARTS\`. Reads only. ${OWN} ${OFF}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { path: { id: 'Opportunity id' }, query: { parts: AGAIN_PARTS_DOC } },
    answers:
      '`{plan: {run: [{part, reason: "never" | "failed" | "outdated" | "rule-changed", ceilingCents, photos?}], kept: [{part, reason: "up-to-date" | "none" | "unavailable" | "over-cap", detail?}], ceilingCents}, payer: "account", limit: {perDay, usedToday}}`'
  },
  // website-opportunities/src/route.js
  {
    method: 'POST',
    path: '/api/website-opportunities/jobs/bulk',
    summary: 'Resume or cancel many research jobs',
    description: `Runs \`action\` on each job, one after another, with the same checks as the single resume and cancel doors. Send either \`jobIds\` (the rows picked) or \`filter\` (\`stage\`, \`attention\`, \`q\` as the list door reads them): the server then takes the latest job of every matching row once, at this request. Each result carries the code its single door would answer: \`JOB_FINISHED\`, \`JOB_NOT_RESUMABLE\` and \`JOB_ACTIVE\` count as \`skipped\`; \`NOT_FOUND\` (another account’s or a missing job) and \`ERROR\` as \`failed\`. The same \`requestId\` with the same body answers the stored result without running again. Cancel works while the switch is off; resume does not. 400 \`INVALID_ACTION\`, \`INVALID_REQUEST_ID\`, \`INVALID_SELECTION\`; 409 \`REQUEST_ID_REUSED\` (another body), \`BULK_PENDING\` (still running); 422 \`TOO_MANY\` above 500 jobs (refused, never cut); 429 \`RATE_LIMITED\` (60 an hour). ${OFF}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    body: {
      type: 'object',
      required: ['action', 'requestId'],
      properties: {
        action: { type: 'string', enum: ['resume', 'cancel'] },
        requestId: REQUEST_ID,
        jobIds: { type: 'array', items: { type: 'string' }, description: 'Job ids, at most 500' },
        filter: {
          type: 'object',
          properties: {
            stage: {
              type: 'string',
              enum: ['research', 'demo', 'outreach', 'cancelled']
            },
            attention: { type: 'boolean' },
            q: { type: 'string', description: 'Up to 100 characters' }
          }
        }
      }
    },
    answers: '`{results: [{jobId, ok, code?}], done, skipped, failed}`'
  },
  // website-opportunities/src/route.js
  {
    method: 'POST',
    path: '/api/website-opportunities/jobs/:jobId/cancel',
    summary: 'Cancel a research job',
    description: `Stops a queued, running, paused, blocked or failed job; what was collected stays. Works while the switch is off. 409 \`JOB_FINISHED\` for a completed or cancelled job. ${OWN}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { path: { jobId: 'Job id' } },
    answers: '`{job}`'
  },
  // website-opportunities/src/route.js
  {
    method: 'POST',
    path: '/api/website-opportunities/jobs/:jobId/resume',
    summary: 'Resume a paused research job',
    description: `Queues a paused, blocked, failed or cancelled job again; it continues at its recorded stage and each source’s cursor. 409 \`JOB_NOT_RESUMABLE\`; 409 \`JOB_ACTIVE\` (with that \`job\`) while another job of the same opportunity is queued or running. ${OWN} ${OFF}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { path: { jobId: 'Job id' } },
    answers: '`{job}`'
  },
  // website-opportunities/src/route.js
  {
    method: 'GET',
    path: '/api/website-opportunities/media/:mediaId',
    summary: 'Open one collected image or video',
    description: `Owner only. Redirects (302) to a short-lived signed address when the file store is reachable from the internet, else streams the bytes. 404 \`MEDIA_NOT_STORED\` (with \`sourceUrl\`) for media kept as a reference only; 503 \`STORE_UNAVAILABLE\`. ${OWN}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { path: { mediaId: 'Media id' } }
  },
  // website-opportunities/src/route.js
  {
    method: 'POST',
    path: '/api/website-opportunities/:id/revisions',
    summary: 'Refresh the site brief',
    description: `The site brief of the opportunity's current research: an immutable snapshot of the research (profile, sources, media, posts, the account's overlay) with its Markdown and asset manifest. A brief names no CMS or template — each build chooses both and keeps them — so one brief feeds demos on any CMS and template. The same research answers the brief already made for it (200); changed research writes the next one (201). A demo build makes its brief itself, so a client never has to. 422 \`BRIEF_INVALID\`. ${OWN} ${OFF}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { path: { id: 'Opportunity id' } },
    answers: '201 `{revision}` (new), 200 `{revision}` (the research has not changed)'
  },
  // website-opportunities/src/route.js
  {
    method: 'GET',
    path: '/api/website-opportunities/revisions/:revId',
    summary: 'Read a brief revision',
    description: `The revision with its brief JSON and its builds, or its Markdown with \`?format=md\` (generated from the JSON, never a second source). \`suggestedLabel\` is the site name a build without a \`label\` would get now: the place’s name as a site label, with \`-2\`, \`-3\`… when this deployment already holds it (null when the plugin is unavailable). Readable while the switch is off. ${OWN}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { path: { revId: 'Revision id' }, query: { format: '`md` for the brief as text/markdown' } },
    answers: '`{revision, builds: [build], suggestedLabel: string | null}`'
  },
  // website-opportunities/src/route.js
  {
    method: 'GET',
    path: '/api/website-opportunities/builds/:buildId',
    summary: 'Read a build and the site it made',
    description: `The build, its site (key and address) and the site’s provisioning job. A build whose receipt was never written is reconciled from the create door’s own record of the same \`buildId\`. While it provisions, the site’s job is asked: \`build.state\` becomes \`done\` once the site is made, or \`failed\` with \`build.receipt.failure: {code: "PROVISION_FAILED", reason, jobId, at}\` (\`reason\`: the host’s own first line) when the host gave up; a build left \`requesting\` with no site for 10 minutes reads \`failed\` with \`failure.code: "REQUEST_LOST"\`. ${OWN}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { path: { buildId: 'Build id (the `id` of `build`)' } },
    answers:
      '`{build: {…, state: requesting|provisioning|refused|failed|done, receipt: {status, body, at, failure?}, handoff: {state: ready|completed|needs-review, placed, at} | null, qa: {state: baseline|pending|retry|passed|failed, repairs, rounds, reason} | null}, site: {key, address} | null, siteJob: {id, state} | null}`'
  },
  // website-opportunities/src/route.js + handoff.js
  {
    method: 'POST',
    path: '/api/website-opportunities/builds/:buildId/handoff',
    summary: 'Hand a ready demo site to its agent',
    description: `Shared with the durable demo worker: provision and site_brief must finish before handoff. Places remaining stored photos with idempotent Apply ids (on EmDash into the site’s media library, named by url in the prompt; videos stay links to their source), holds one stable session, takes its QA baseline and queues one stable prompt. Only after session, baseline and prompt acceptance does this return a next chat URL. No browser fallback sends the prompt. The baseline is trusted only when the site’s host read it (a read that failed, or never opened the home page, is not): until then \`qa.state\` is \`"baseline"\` with \`baselineTries\`, \`baselineError\` and \`retryAt\`, the prompt is held and the press answers 503 HANDOFF_BASELINE_FAILED; a background sweep reads it again (at most 3 reads, a minute apart) and sends the prompt once one holds, and a press meanwhile reads it again. No trustworthy read after 3 → \`qa.state: "failed"\`, \`handoff.state: "needs-review"\`. Other failures are 503 HANDOFF_SESSION_FAILED, HANDOFF_QA_UNAVAILABLE or HANDOFF_PROMPT_FAILED; 409 SITE_NOT_READY or SITE_FILL_FAILED, and 409 QA_NEEDS_REVIEW once the gate gave the demo to a person. One press at a time per build: 409 HANDOFF_IN_PROGRESS (with the current \`handoff\` and \`qa\`) while an earlier press of the same build still runs; press again once it ends. Repeat uses the same session and prompt id; a press after \`completed\` only answers that verdict and its chat, and one after \`needs-review\` is 409 QA_NEEDS_REVIEW (an explicit Retry resumes it): nothing is placed or sent again. QA judges only the held session’s expected prompt/repair request ids that opened after the latest prompt, with fenced leases: all checks pass → \`completed\`; a failure sends a repair list into the same chat (at most two); a check the host could not judge is never a pass. The initial prompt and repairs have a wake-once then needs-review watchdog, and a host that answered no round for 10 minutes is needs-review too (\`qa.reason\` says which). Only QA PASS promotes the opportunity to Outreach. ${OWN} ${OFF}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { path: { buildId: 'Build id (the `id` of `build`)' } },
    answers:
      '`{handoff: {state: "ready", placed: {<assetId>: <sitePath>}, skipped: [{id, reason}], videos: [{id, source, sourceUrl}], placedByBuild?, prompt, sessionId, promptSent?: {at, sessionId, requestId}, at}, qa?: {state: "baseline" | "pending" | "retry" | "passed" | "failed", sessionId, since?, pages?, baselineTaken, baselineTries, baselineChecks?, baselineError?, retryAt?, repairs, rounds: [{n, at, checks: [{id, pass, measured}], failed: [{id, pass, measured, expected, detail}]}], reason?}, site: {key}, next: "/<siteKey>/s/<sessionId>"}`'
  },
  // website-opportunities/src/route.js
  {
    method: 'GET',
    path: '/api/website-opportunities/builds/:buildId/handoff',
    summary: 'Read a build’s handoff',
    description: `The handoff the last press wrote, for the site page opened with \`?wo-handoff=<buildId>\`, and the QA gate’s rounds (\`qa\`, as the press answers it; null before the first press with a site to read). While \`qa.state\` is \`"baseline"\` (no trustworthy baseline yet) a \`ready\` handoff comes without its \`prompt\`, so the page does not send it either. 404 \`HANDOFF_NOT_STARTED\` before the first press. ${OWN}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { path: { buildId: 'Build id (the `id` of `build`)' } },
    answers:
      '`{handoff: {state: "ready" | "completed" | "needs-review", prompt?, promptSent?, …}, qa: {state: "baseline" | "pending" | "retry" | "passed" | "failed", baselineTaken, baselineTries, baselineError?, repairs, rounds, reason?, …} | null, site: {key}}`'
  },
  // website-opportunities/src/route.js
  {
    method: 'POST',
    path: '/api/website-opportunities/:id/demo/reopen',
    summary: 'Reopen a frozen demo site',
    description: `The opportunity’s latest demo, frozen because nobody used it in its term (or a cap chose it), is thawed and given a new term of \`demoTtlDays\` (\`demoReviewTtlDays\` when QA left it needs-review) from now. A frozen demo is a mark: its site kept running. 404 \`NO_DEMO\` before a build has a site, 409 \`DEMO_NOT_FROZEN\` for a live one, 409 \`DEMO_DELETED\` once deleted (rebuild it instead). ${OWN}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { path: { id: 'Opportunity id' } },
    answers: '`{demo: {siteKey, expiresAt, touchedAt, frozenAt, deletedAt}}`'
  },
  {
    method: 'POST',
    path: '/api/website-opportunities/:id/demo/extend',
    summary: 'Give a live demo site a new term from now',
    description: `The opportunity’s latest live demo expires \`demoTtlDays\` from now (\`demoReviewTtlDays\` when QA left it needs-review). Opening the detail page and handing the demo to its agent do the same. 409 \`DEMO_FROZEN\` (reopen it), \`DEMO_DELETED\` (rebuild it), \`DEMO_KEPT\` for a demo kept for good. ${OWN}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { path: { id: 'Opportunity id' } },
    answers: '`{demo: {siteKey, expiresAt, touchedAt, frozenAt, deletedAt}}`'
  },
  {
    method: 'POST',
    path: '/api/website-opportunities/:id/demo/rebuild',
    summary: 'Build a deleted demo again from its revision',
    description: `Body \`{requestId, label?}\`. The opportunity’s latest demo was deleted by the retention sweep (its brief, QA, screenshots and costs were kept): the same brief is built again with the deleted build's own CMS, template and workflow, under the old site name unless \`label\` says another. One \`requestId\` is one action; \`build\` is null until the worker writes it, and the same \`requestId\` sent again answers it. 409 \`DEMO_NOT_DELETED\` while the demo still exists. ${OWN} ${OFF}`,
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    params: { path: { id: 'Opportunity id' } },
    body: {
      type: 'object',
      required: ['requestId'],
      properties: { requestId: { type: 'string' }, label: { type: 'string' } }
    },
    answers: '202 `{actions, usage, build: build | null}`'
  },
  // website-opportunities/src/place-ingest-door.js
  {
    method: 'POST',
    path: '/api/internal/wo-places/v1/ingest',
    summary: "Receive one place's published research from another Tracy deployment",
    description:
      "Machine to machine (tasks/plan-wo-shared-places.md). The `x-tracy-wo-places-secret` header must equal `WO_PLACES_INGEST_SECRET`, checked before the body is read; 404 otherwise, when it is unset, and on a shard. Body: one place bundle (`tracy-wo-place-bundle/v1`) of allow-listed fields only, at most 4 MB; its stored pictures must already be in the shared bucket at the size their rows name. Fills only a place with no snapshot here, in one transaction; every call writes one `wo_place_import` row whose `origin` is the sender's own claim.",
    audience: ['fleet'],
    auth: 'token',
    internal: true,
    body: {
      type: 'object',
      required: ['schema', 'origin', 'place', 'identities', 'links', 'snapshot'],
      properties: {
        schema: { type: 'string', description: '`tracy-wo-place-bundle/v1`' },
        origin: { type: 'string', description: "The sender's self-declared name, kept in the audit row" }
      }
    },
    answers:
      '`{outcome}`: 200 `imported` | `skipped_existing` | `retry_later`; 409 `conflict`; 422 `media_missing`; 400 `invalid` with `field`; 413 `too_large`'
  }
]
