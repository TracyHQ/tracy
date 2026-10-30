/** Route docs — see ./index.js for the entry shape. Filled from the source file named on each entry. */

const PLATFORM = { platform: 'CMS id: `joomla`, `wordpress` or `emdash`; any other value answers 404' }
const TARGET = 'Demo target name from this deployment; absent means `tracy`, an unknown name answers 404'
const WRITE_RULE =
  "Owner or admin role only, and the request `Origin` must be this deployment's public origin."
const WO_RULE =
  "Staff may read and mark their own rows read; every other door needs an owner or admin role and this deployment's public `Origin` (403 otherwise)."
const WO_PROVIDER =
  '`google`, `apify`, `deepseek`, `firecrawl`, `jina`, `rapidapi`, `serpapi`, `litescrape` or `monid`'
const LLM_RULE = "Owner or admin role only, reads included; writes also need this deployment's public origin."

/** @type {import('./index.js').RouteDoc[]} */
export const OPS_B_ROUTES = [
  {
    method: 'GET',
    path: '/api/ops/wo/prefetch/dubai/places/:id/media/:mediaId',
    summary: 'Read a stored Dubai Research picture',
    description:
      'Staff only. Streams an image from the current published snapshot of a Dubai seed. Revoked, unstored and unrelated media return 404. Private no-store; never calls a provider.',
    audience: ['team'],
    auth: 'staff',
    internal: true,
    answers: 'Stored image bytes, or 404'
  },
  {
    method: 'GET',
    path: '/api/ops/wo/prefetch/dubai',
    summary: 'Read the Dubai pre-research campaign',
    description:
      'Staff only. Returns durable campaign ticks, Google Places source receipts, up to 50 existing Research jobs and profile snapshots, media counts, original source ages and committed provider cost ceilings. Read-only: never admits collectors. Full place profiles remain local.',
    audience: ['team'],
    auth: 'staff',
    internal: true,
    answers: '`{available,campaign,seeds,controls,socialStatus,sharedPlaceDistribution}`'
  },
  {
    method: 'POST',
    path: '/api/ops/wo/prefetch/dubai',
    summary: 'Load, start or stop the Dubai pre-research pilot',
    description: `Central role and shared research only. Seed loads a fixed Google Places TextSearch (at most three paid pages with durable no-replay receipts), default stopped. Find deduplication, chain filtering and the shared Opportunity scorer select up to 50 restaurants, including places without websites. Checks and social statistics use their existing queues and quotas; scores stay provisional while website checks are pending. Received receipts alone may upgrade an existing selection. Start uses the existing full customer Research queue. Concurrency sets 1–3 background slots (default 1), with one reserved user admission slot. Lowering concurrency drains active jobs. Research campaign/day/job caps and paid receipts bound Research provider admission; Find social statistics retain their separate ledger. Stop preserves in-flight receipts and active user demand. ${WRITE_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    body: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['seed', 'start', 'stop', 'concurrency'] },
        concurrency: { type: 'integer', minimum: 1, maximum: 3 }
      }
    },
    answers: '`{seeded}` / `{existing:true}` / `{updated:true}`; 409 when another campaign mutation is active'
  },
  {
    method: 'PUT',
    path: '/api/ops/wo/social/deployments/:id',
    summary: 'Provision or disable a shared social deployment',
    description: `Central role only. Sets stable deployment ID, fixed HTTPS origin, enabled and readsPerMinute/refreshesPerDay/forcesPerDay integers 0–10000. Zero disables that allowance. UTC refresh/force usage belongs to the deployment across key rotation. ${WRITE_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { id: 'Stable deployment ID' } },
    body: {
      type: 'object',
      required: ['origin', 'enabled', 'readsPerMinute', 'refreshesPerDay', 'forcesPerDay'],
      properties: {
        origin: { type: 'string' },
        enabled: { type: 'boolean' },
        readsPerMinute: { type: 'integer' },
        refreshesPerDay: { type: 'integer' },
        forcesPerDay: { type: 'integer' }
      }
    },
    answers: '`{ok:true}`'
  },
  {
    method: 'POST',
    path: '/api/ops/wo/social/deployments/:id/keys',
    summary: 'Mint one dedicated shared social service key',
    description: `Central role and a dedicated WO_SOCIAL_KEY_PEPPER required. Stores only an HMAC hash; returns the secret once with no-store. Scopes are read and/or refresh, expiry is optional and must be future. No account, site or shard rights. ${WRITE_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { id: 'Existing stable deployment ID' } },
    body: {
      type: 'object',
      required: ['scopes'],
      properties: {
        scopes: { type: 'array', items: { type: 'string', enum: ['read', 'refresh'] } },
        expiresAt: { type: 'string', format: 'date-time' }
      }
    },
    answers: '`{id,deploymentId,scopes,expiresAt,key}`; 201'
  },
  {
    method: 'DELETE',
    path: '/api/ops/wo/social/keys/:id',
    summary: 'Permanently revoke a shared social service key',
    description: `Central role only. Revocation is idempotent and cannot be undone. ${WRITE_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { id: 'Public service key ID' } },
    answers: '`{ok:true}`'
  },

  {
    method: 'GET',
    path: '/api/ops/ci',
    summary: 'Read the staff PR and CI dashboard',
    description:
      'Read-only GitHub observations for the TCH repository’s PRs targeting main, staging or develop. Includes exact-head check results, job steps and assigned runners with separately observed runner availability, native merge queue positions when reported, recent merges, freshness and verified GitHub member identity. A missing token returns an explicit unavailable state, never sample results.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers:
      'PR rows with account-specific unread/readAt, readAccount, members, viewer, measuredAt, stale and error'
  },
  {
    method: 'PUT',
    path: '/api/ops/ci/read',
    summary: 'Save the signed-in staff account’s PR read status',
    description:
      'Requires an accepted Tracy staff seat and the deployment’s exact Origin. Updates only the signed-in account for the TCH repository; never changes GitHub. The body has a boolean read and 1–1000 positive integer PR numbers. Duplicate numbers are deduplicated; invalid input answers 400, a foreign or absent Origin answers 403. Read status survives PR head and CI changes. Missing or cleared read records mean unread.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    body: {
      type: 'object',
      additionalProperties: false,
      required: ['read', 'numbers'],
      properties: {
        read: { type: 'boolean' },
        numbers: {
          type: 'array',
          minItems: 1,
          maxItems: 1000,
          items: { type: 'integer', minimum: 1, maximum: 2147483647 }
        }
      }
    },
    answers: 'readAccount and states containing id, unread and readAt'
  },
  {
    method: 'GET',
    path: '/api/ops/ci/:number',
    summary: 'Read one staff PR with current check steps',
    description:
      'Uses the same staff admission. Reads current GitHub results; never merges or changes a PR. Returns 400 for an invalid number, 404 for an absent or unsupported-target PR, and 503 if GitHub cannot be read.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { number: 'Positive GitHub PR number' } },
    answers: 'The PR row with check steps and measuredAt'
  },
  // src/ops/wo.js
  {
    method: 'GET',
    path: '/api/ops/wo',
    summary: 'Read the Website Opportunities Live Queue and settings',
    description:
      'Every account’s opportunities with their lifecycle stage, collectors, latest job, revision, build and mobile PageSpeed facts, plus the deployment’s Website Opportunities settings, which provider keys are configured (source and a masked hint, never the key) and each CMS pin’s status (`offered`: Design inspiration still offers that release tag for that CMS). `capabilities` lists each research capability group with its provider order and, per provider, its state and `report`: over the last 30 days its calls, usable results and cost per call and per usable result (`cost.kind` `real` when the provider reported it, `ceiling` when only the reserved most is known), with no number below the group’s `reportMinCalls`, and `misordered` when it sits ahead of a provider that does better (read-only: nothing re-orders). Staff seat required.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers:
      '`{opportunities, members, cities, settings, settingsMeta, providers, templateStatuses, capabilities, uiEnabled, viewer, writable}`'
  },
  {
    method: 'GET',
    path: '/api/ops/wo/demos/summary',
    summary: 'Read the demo retention settings and how many demos each state holds',
    description:
      'For the Website Opportunity panel of /ops/settings: the `demo*` settings and `publicFind` (the sign-in-free `/find` page’s limits: searches and place suggestions per UTC day — 0 = closed — per minute for the deployment, and per hour and per minute for one address; and how long Google answers are kept for both Finds and the cache cell size; new places strangers may have researched per UTC day per address and in total, and their research budget in cents; all saved through `PUT /api/ops/wo/settings`) and the counts of demo sites live, frozen, expiring within 24 hours and deleted. Staff seat required; `writable` is true for owner/admin.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers:
      '`{retention: {demoRetentionEnabled, demoTtlDays, demoReviewTtlDays, demoFreezeGraceDays, demoMaxPerAccount, demoMaxPerHost, demoDiskHighWaterPct, demoSweepBatch}, publicFind: {publicFindSearchesPerDay, publicFindSearchesPerAddressHour, publicFindSearchesPerAddressMinute, publicFindSearchesPerMinute, publicFindSuggestPerDay, publicFindSuggestPerAddressHour, publicFindSuggestPerAddressMinute, publicFindSuggestPerMinute, placesCacheDays, placesCacheCellMeters, publicResearchNewPlacesPerAddressDay, publicResearchNewPlacesPerDay, researchPublicDailyCapCents}, counts: {live, frozen, expiringSoon, deleted}, writable}`'
  },
  {
    method: 'GET',
    path: '/api/ops/wo/public-demos',
    summary: 'Read the live demo cap and model budget of /v1/demos',
    description:
      'For /ops/wo › Settings › Demos for outside builders: `liveDemosPerAccount` (live demo sites one account may have through `/v1/demos`, default 20), `sponsoredDemoMaxCents` (held per demo built on Tracy’s model) and `sponsoredMonthlyBudgetCents` (what those may hold in one UTC month). Tracy’s own settings, not the Website Opportunities package’s. Staff seat required; `writable` is true for owner/admin.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers:
      '`{settings: {liveDemosPerAccount, sponsoredDemoMaxCents, sponsoredMonthlyBudgetCents}, updatedBy, updatedAt, writable}`'
  },
  {
    method: 'PUT',
    path: '/api/ops/wo/public-demos',
    summary: 'Save the live demo cap and model budget of /v1/demos',
    description:
      'Body `{settings}`; keys left out keep their saved value. `liveDemosPerAccount` 0–10000 (0 closes the door), `sponsoredDemoMaxCents` 1–100000, `sponsoredMonthlyBudgetCents` 0–100000000; out of range 400 `INVALID_PUBLIC_DEMO_SETTING`, an unknown key 400 `UNKNOWN_SETTING`. Owner or admin from this origin.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    body: { type: 'object', required: ['settings'], properties: { settings: { type: 'object' } } }
  },
  {
    method: 'PUT',
    path: '/api/ops/wo/read',
    summary: 'Mark one opportunity read or unread for the signed-in operator',
    description: `Body \`{opportunityId, read}\`. ${WO_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    body: {
      type: 'object',
      required: ['opportunityId', 'read'],
      properties: { opportunityId: { type: 'string' }, read: { type: 'boolean' } }
    }
  },
  {
    method: 'PUT',
    path: '/api/ops/wo/settings',
    summary: 'Save the deployment’s Website Opportunities settings',
    description: `Body \`{settings, uiEnabled?}\`; keys left out keep their saved value, out-of-range or unknown values fall back to defaults, except a pinned template that is not a release tag (400 \`INVALID_PINNED_TEMPLATE\`), a pin policy other than \`fallback-any-restaurant\` or \`strict\` (400 \`INVALID_TEMPLATE_PIN_POLICY\`), and the demo retention keys (\`demoRetentionEnabled\`, \`demoTtlDays\` / \`demoReviewTtlDays\` / \`demoFreezeGraceDays\` 1–365, \`demoMaxPerAccount\` / \`demoMaxPerHost\` ≥ 0 where 0 is no cap, \`demoDiskHighWaterPct\` 50–95, \`demoSweepBatch\` 1–100): 400 \`INVALID_DEMO_RETENTION\`. The daily demo-build limit (\`demoBuildsPerAccountPerDay\`, default 20; integer 0–100000, where 0 is uncapped but tracked) is validated by the same settings door. Invalid values answer 400 \`INVALID_DEMO_RETENTION\`. The research pipeline reads them on its next search or job, and a new revision reads the default CMS and the pins. \`uiEnabled\` flips the \`website-opportunities\` switch of /ops/ui. ${WO_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    body: { type: 'object', properties: { settings: { type: 'object' }, uiEnabled: { type: 'boolean' } } }
  },
  {
    method: 'PUT',
    path: '/api/ops/wo/keys/:provider',
    summary: 'Seal and save, or clear, one provider key',
    description: `Body \`{apiKey}\`: sealed with AES-256-GCM and never returned; an empty string clears it so the environment key applies again. ${WO_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { provider: WO_PROVIDER } },
    body: { type: 'object', required: ['apiKey'], properties: { apiKey: { type: 'string' } } }
  },
  {
    method: 'POST',
    path: '/api/ops/wo/keys/:provider/test',
    summary: 'Test one provider key against its live API',
    description: `Calls the provider with the key in use (saved or environment). SerpApi checks account credits through its non-billable account endpoint; it never runs a search from Test. For \`litescrape\`, only the documented non-billable \`/api/keys/status\` endpoint is read; Test never runs a paid search. For \`monid\`, Test makes no call (Monid has no free key check) and answers \`not_checkable\`. For \`google\`, Places API (New), PageSpeed Insights and Maps Embed are probed one by one and \`ok\` is true only when all three answer. ${WO_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { provider: WO_PROVIDER } },
    answers: '`{ok, provider, status, latencyMs?, detail, apis?: {places, pagespeed, embed}}`'
  },
  {
    method: 'POST',
    path: '/api/ops/wo/opportunities/:id/action',
    summary: 'Run an operator recovery action on one opportunity',
    description: `Body \`{action}\`: \`force-complete-brief\`, \`reset-cap-resume\`, \`reclaim-retry\`, \`bump-queue\` or \`cancel-job\`. The first three take the job's lease before writing; for an opportunity on a shared place they write no research of their own: retry and resume queue the place's run, and a forced brief answers with the place's published snapshot (409 \`NO_PUBLISHED_SNAPSHOT\` when there is none). A forced brief picks its CMS and template as a customer's revision does — the account's CMS else the \`/ops/wo\` default, then that CMS's \`/ops/wo\` pin — and a \`strict\` pin no longer offered refuses it (409 \`TEMPLATE_PIN_UNAVAILABLE\`, nothing written). ${WO_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { id: 'Opportunity id' } },
    body: { type: 'object', required: ['action'], properties: { action: { type: 'string' } } },
    answers: '`{ok, queue}`'
  },
  // src/ops/build-base.js
  {
    method: 'GET',
    path: '/api/ops/build-base/:platform',
    summary: 'Read the base quickstart new sites of one CMS start from',
    description:
      'Answers the current build-base setting, its revision and the choosable quickstarts. A CMS with no restorable archive answers `options: []`, `writable: false` and a reason. `writable` is true for owner/admin.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: PLATFORM },
    answers: 'The setting with `options`, `writable`, `server` and `registryRevision`'
  },
  // src/ops/build-base.js
  {
    method: 'PUT',
    path: '/api/ops/build-base/:platform',
    summary: 'Set the base quickstart for one CMS',
    description: `Saves the chosen quickstart under an optimistic lock. 409 \`REGISTRY_CHANGED\` when the option list moved, 409 \`BASE_CHANGED\` when the stored revision moved. ${WRITE_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: PLATFORM },
    body: {
      type: 'object',
      required: ['quickstart'],
      properties: {
        quickstart: { type: 'string' },
        revision: { type: 'integer' },
        registryRevision: { type: 'string' }
      }
    },
    answers: 'The saved setting'
  },
  // src/ops/build-questions.js
  {
    method: 'GET',
    path: '/api/ops/build-questions/:platform',
    summary: 'Read which questionnaire new sites of one CMS are asked by default',
    description:
      "Answers the default questionnaire source for the CMS, the candidates (the CMS's own set and ready releases that carry one) and the field names answers may feed. Choosing only; editing happens on the quickstart.",
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: PLATFORM },
    answers: 'The current source with `options`, `feeds`, `writable` and `server`'
  },
  // src/ops/build-questions.js
  {
    method: 'PUT',
    path: '/api/ops/build-questions/:platform',
    summary: 'Choose the default questionnaire for one CMS',
    description: `Points the CMS's default at one of the candidate sources under an optimistic lock; 409 \`SOURCE_CHANGED\` when the stored revision moved. ${WRITE_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: PLATFORM },
    body: {
      type: 'object',
      required: ['source'],
      properties: { source: { type: 'string' }, revision: { type: 'integer' } }
    },
    answers: 'The saved choice'
  },
  // src/ops/cms.js
  {
    method: 'GET',
    path: '/api/ops/cms/environments',
    summary: 'List the build-configuration snapshots this build shipped',
    description:
      "Reads the snapshot index baked into the image (one entry per environment such as `dev` or `main`) with each one's commit and size. Never reads a repository. No index answers `status: unavailable`.",
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: 'Environments with `id`, `label`, `available`, `sha` and `bytes`'
  },
  // src/ops/cms.js
  {
    method: 'GET',
    path: '/api/ops/cms/snapshot',
    summary: "Read one environment's build-configuration snapshot",
    description:
      'Serves the shipped snapshot after checking its digest and schema. The design catalogue is cut to the first 50 systems per CMS with its real total. It describes a git tree, not what any machine runs.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { query: { env: 'Environment id listed by `/api/ops/cms/environments`' } },
    answers: 'The snapshot `source`, `sections`, `observations` and `notes`'
  },
  // src/ops/cms.js
  {
    method: 'GET',
    path: '/api/ops/cms/designs',
    summary: "Page and search one CMS's design catalogue in a snapshot",
    description:
      'Filters the design systems of one CMS in a shipped snapshot by id or name, then pages them. 404 when the snapshot has no catalogue for that CMS.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: {
      query: {
        env: 'Environment id',
        cms: 'CMS id inside the snapshot',
        q: 'Optional case-insensitive search over id and name',
        limit: 'Page size, 1–200 (default 50)',
        offset: 'Start index (default 0)'
      }
    },
    answers: '`systems` page with `total`, `matched`, `offset` and `limit`'
  },
  // src/ops/cms.js
  {
    method: 'GET',
    path: '/api/ops/cms/runtime',
    summary: 'Ask the fleet hosts what they are actually running',
    description:
      'Queries the signed host channel for its host-agent inventory and reports what came back, hosts that did not answer included. With no host channel it answers `status: unknown`; a failed call answers `unavailable`.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: '`status`, `observedAt` and the per-host inventory'
  },
  // src/ops/quickstart-setting.js
  {
    method: 'GET',
    path: '/api/ops/quickstart/setting-proposal',
    summary: 'Propose a missing tracy_setting.json for a quickstart release',
    description:
      "Downloads the release's package from GitHub, reads it and composes the file it would write, each field marked with its source. Writes nothing. Refuses a release that is already ready or still a draft (409).",
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { query: { tag: 'Release tag, e.g. `quickstart/ja-space/j6`' } },
    answers: 'The proposed fields plus `package` (`file`, `sha256`, `bytes`)'
  },
  // src/ops/quickstart-setting.js
  {
    method: 'POST',
    path: '/api/ops/quickstart/setting',
    summary: 'Upload a reviewed tracy_setting.json onto a quickstart release',
    description: `Validates the body against the release's asset list, uploads it to the GitHub release, then re-reads releases and answers the release's state after the upload. 400 \`INVALID_SETTING\` lists the problems. ${WRITE_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { query: { tag: 'Release tag the file is written onto' } },
    body: { type: 'object', description: 'The complete tracy_setting.json document as reviewed' },
    answers: "`ok`, `replaced` and the release's `tracy` state"
  },
  // src/ops/demos.js
  {
    method: 'GET',
    path: '/api/ops/demos',
    summary: 'List the demo of every quickstart on a demo target',
    description:
      "Answers each release's demo address, pinned label and, on a Tracy-run target, what is deployed (host, version, job state, live). Also the targets (without SSH credentials), demo servers and whether writes are possible.",
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { query: { target: TARGET } },
    answers: '`demos`, `targets`, `servers`, `defaultServer`, `writable` and `reason`'
  },
  // src/ops/demos.js
  {
    method: 'GET',
    path: '/api/ops/demos/history',
    summary: 'Read the deploy history of one demo',
    description:
      "Answers up to 50 provision and teardown jobs recorded for the demo's site key, newest first. 404 for a tag that is not an installable release.",
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { query: { tag: 'Release tag', target: TARGET } },
    answers: '`tag`, `siteKey` and `jobs`'
  },
  // src/ops/demos.js
  {
    method: 'GET',
    path: '/api/ops/demos/install-job',
    summary: 'Poll an install onto a server Tracy does not run',
    description:
      'Answers the in-memory progress of an SSH install started by `POST /api/ops/demos/install` on a record target. Kept 30 minutes and lost on restart; 404 `UNKNOWN_JOB` otherwise.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { query: { id: 'Job id returned by the install (`ssh-…`)' } },
    answers: 'The job: `state`, `step`, `address`, `note`, `error`'
  },
  // src/ops/demos.js
  {
    method: 'GET',
    path: '/api/ops/demos/present',
    summary: 'List the demo folders a record server really serves',
    description:
      'Asks the target server over its forced-command SSH channel for every demo name it holds, in one round trip. 503 when the target has no SSH login, 502 when the server does not answer.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { query: { target: 'Demo target name; required to exist' } },
    answers: '`target`, `server` and `present` (names)'
  },
  // src/ops/demos.js
  {
    method: 'GET',
    path: '/api/ops/demos/on-server',
    summary: 'Describe one demo as its server reports it',
    description:
      "Asks the target server over SSH for one demo's status, including its CMS version. Slow (seconds), so it is asked per row on demand. 503 when the target has no SSH login.",
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { query: { target: 'Demo target name; required to exist', label: 'Demo label (folder name)' } },
    answers: "The server's status for that demo"
  },
  // src/ops/demos.js
  {
    method: 'PUT',
    path: '/api/ops/demos/domain',
    summary: "Pin the address label of a quickstart's demo",
    description: `Saves the demo label for an installable release on one target under an optimistic lock. 409 \`DEMO_CHANGED\` or \`LABEL_TAKEN\`; 404 for an unknown release or target. ${WRITE_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    body: {
      type: 'object',
      required: ['tag', 'label'],
      properties: {
        tag: { type: 'string' },
        label: { type: 'string' },
        revision: { type: 'integer' },
        target: { type: 'string' }
      }
    },
    answers: 'The saved demo address'
  },
  // src/ops/demos.js
  {
    method: 'POST',
    path: '/api/ops/demos/install',
    summary: "Install or reinstall a quickstart's demo",
    description: `On a Tracy host: tears down any running copy, a copy whose last install failed, or the old host's on a move, then provisions and publishes the demo. 409 DEMO_BUSY while a job of the demo is still in flight. Answers within about 2 s: when the demo host is slower, 202 carries pending: true and the id the host will use, and the job (GET /api/ops/demos/job) reads failed with a reason if the host never takes it. 503 DEMO_HOST_UNAVAILABLE (with host, reason and a Retry-After header) when the demo host answers 5xx or nothing within 20 s; pressing again is safe. On a record target: uploads the package over SSH. Answers 202 with a job id. ${WRITE_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    body: {
      type: 'object',
      required: ['tag'],
      properties: {
        tag: { type: 'string' },
        target: { type: 'string', description: 'Demo target; default `tracy`' },
        host: { type: 'string', description: 'Demo server name from the configured list' },
        badge: { type: 'boolean', description: 'false installs without the Tracy badge' },
        override: { type: 'boolean', description: 'Record targets: false keeps an existing demo' }
      }
    },
    answers: '202 with `jobId`, `address` and, on a Tracy host, `siteKey`, `label`, `host`'
  },
  // src/ops/demos.js
  {
    method: 'DELETE',
    path: '/api/ops/demos',
    summary: "Tear down a quickstart's demo and forget it",
    description: `Asks the demo's host to tear it down and records a \`remove\` job; the poll that sees it finish forgets the row. 503 when the host is unreachable, so the row is never dropped while containers run. ${WRITE_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { query: { tag: 'Release tag of the demo' } },
    answers: '202 with `jobId`, `siteKey` and `label`'
  },
  // src/ops/demos.js
  {
    method: 'GET',
    path: '/api/ops/demos/job',
    summary: 'Poll a demo job and advance the demo',
    description:
      'Asks the host how a demo job is going and moves the demo one step when it finished: a finished teardown starts the new copy, a finished provision is made public (ingress, DNS, go-live). Safe to poll twice.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { query: { id: 'Demo job id' } },
    answers: "The job's current state after advancing"
  },
  // src/ops/inventory.js
  {
    method: 'GET',
    path: '/api/ops/inventory',
    summary: 'List the pre-installed site stock pools',
    description:
      'Answers every stock pool (host, CMS, quickstart, generation, policy, revision) with its current supply counts, plus the refill sweep setting.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: '`pools` and `sweep`'
  },
  // src/ops/inventory.js
  {
    method: 'PUT',
    path: '/api/ops/inventory/sweep',
    summary: 'Change how often the stock refill timer runs',
    description: `Sets the refill period under an optimistic lock; every replica reads it before its next tick. 409 \`REVISION_CONFLICT\`. ${WRITE_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    body: {
      type: 'object',
      properties: { periodMs: { type: 'integer' }, revision: { type: 'integer' } }
    },
    answers: 'The saved `sweep`'
  },
  // src/ops/inventory.js
  {
    method: 'GET',
    path: '/api/ops/inventory/eligible',
    summary: 'List which quickstarts may be stocked',
    description:
      'First records successful demo provision jobs as evidence, then answers every quickstart with whether it may be stocked and, if not, why. Eligibility comes from finished jobs, never from the demo row.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: '`recorded` and `quickstarts`'
  },
  // src/ops/inventory.js
  {
    method: 'GET',
    path: '/api/ops/inventory/instances',
    summary: 'List the instances in one stock pool',
    description:
      'Answers every instance of the pool: address, site key, state, attempts, health, hashes, last error. Shows whether a slot is reserved, never by whom.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { query: { pool: 'Pool key (required)' } },
    answers: '`instances`'
  },
  // src/ops/inventory.js
  {
    method: 'GET',
    path: '/api/ops/inventory/instance',
    summary: 'Read one stock instance',
    description:
      'Answers one instance by id in the same shape as the pool listing. 400 for a malformed id, 404 when absent.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { query: { id: 'Instance uuid' } },
    answers: '`instance`'
  },
  // src/ops/inventory.js
  {
    method: 'POST',
    path: '/api/ops/inventory/pool',
    summary: 'Create a stock pool for an eligible quickstart',
    description: `Creates (or updates) the pool for a quickstart on a host, keyed by environment, host, CMS, version and generation. 409 \`NOT_ELIGIBLE\` when it has no successful demo. ${WRITE_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    body: {
      type: 'object',
      required: ['tag'],
      properties: {
        tag: { type: 'string' },
        host: { type: 'string', description: "Fleet host; default is the deployment's default host" }
      }
    },
    answers: '201 with `pool`'
  },
  // src/ops/inventory.js
  {
    method: 'PUT',
    path: '/api/ops/inventory/policy',
    summary: "Change a stock pool's policy",
    description: `Patches the pool's stock policy (watermarks, limits, review hold, pause and reason) under an optimistic lock; unnamed fields stay. 409 \`REVISION_CONFLICT\`. ${WRITE_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    body: {
      type: 'object',
      required: ['poolKey'],
      properties: {
        poolKey: { type: 'string' },
        revision: { type: 'integer' },
        enabled: { type: 'boolean' },
        lowWatermark: { type: 'integer' },
        targetReady: { type: 'integer' },
        maxStock: { type: 'integer' },
        maxConcurrentPrepares: { type: 'integer' },
        reviewHold: { type: 'boolean' },
        maxAttempts: { type: 'integer' },
        healthTtlSeconds: { type: 'integer' },
        paused: { type: 'boolean' },
        pausedReason: { type: 'string' }
      }
    },
    answers: 'The updated `pool`'
  },
  // src/ops/inventory.js
  {
    method: 'POST',
    path: '/api/ops/inventory/prepare',
    summary: 'Queue stock instances for a pool now',
    description: `Writes refill intents to the outbox the reconciler drains; it does not install itself. The count is capped by the pool's room (\`capped: true\`). 409 when paused or at max stock. ${WRITE_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    body: {
      type: 'object',
      required: ['poolKey'],
      properties: { poolKey: { type: 'string' }, count: { type: 'integer', minimum: 1, maximum: 50 } }
    },
    answers: '202 with `enqueued` and `capped`'
  },
  // src/ops/inventory.js
  {
    method: 'POST',
    path: '/api/ops/inventory/approve',
    summary: 'Approve a pool generation and release the instance',
    description: `For an instance awaiting review: approves its generation if the hashes match what the reviewer saw, then marks the instance ready. 409 \`HASH_MISMATCH\` or \`NOT_AWAITING_REVIEW\`. ${WRITE_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    body: {
      type: 'object',
      required: ['instanceId', 'expectedHashes'],
      properties: { instanceId: { type: 'string', format: 'uuid' }, expectedHashes: { type: 'object' } }
    },
    answers: '`released`, `alreadyApproved`, `generation` and `approval`'
  },
  // src/ops/inventory.js
  {
    method: 'GET',
    path: '/api/ops/inventory/approval',
    summary: 'Read the approval of one pool generation',
    description: 'Answers the recorded approval for a pool and generation, or `null` when none.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { query: { pool: 'Pool key', generation: 'Generation hash' } },
    answers: '`approval` or null'
  },
  // src/ops/inventory.js
  {
    method: 'POST',
    path: '/api/ops/inventory/retire',
    summary: 'Quarantine, drain or retire a stock instance',
    description: `Takes an instance out of supply. \`retired\` also asks the host to tear the site down and leaves the row \`draining\` with that job. Refuses an instance a customer holds (409 \`HAS_OWNER\`). ${WRITE_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    body: {
      type: 'object',
      required: ['instanceId', 'to'],
      properties: {
        instanceId: { type: 'string', format: 'uuid' },
        to: { type: 'string', enum: ['quarantined', 'draining', 'retired'] },
        reason: { type: 'string' }
      }
    },
    answers: 'The updated `instance`'
  },
  // src/ops/widget.js
  {
    method: 'GET',
    path: '/api/ops/widget',
    summary: 'Read the settings of the two site badges',
    description:
      'Answers the stored settings of the seat pill (`/badge.js`) and the demo advert banner (`/tracy-badge.js`), with the defaults for reset. Customer sites load the served scripts, never this route.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: 'Both badge documents, `defaults` and `writable`'
  },
  // src/ops/widget.js
  {
    method: 'PUT',
    path: '/api/ops/widget/:id',
    summary: "Save one badge's settings",
    description: `Validates and saves a badge's whole document under an optimistic lock (409 \`BADGE_CHANGED\`). Served badge scripts pick it up within their five-minute cache. ${WRITE_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { id: 'Badge id: `seat` or `advert`' } },
    body: {
      type: 'object',
      required: ['setting'],
      properties: { setting: { type: 'object' }, revision: { type: 'integer' } }
    },
    answers: 'The saved setting'
  },
  // src/ops/widget.js
  {
    method: 'POST',
    path: '/api/ops/widget/:id/preview',
    summary: 'Render an unsaved badge setting as its script',
    description:
      'Validates the document like a save, then answers the exact JavaScript a site would load for it, without saving. Any staff role may call it.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { id: 'Badge id: `seat` or `advert`' } },
    body: { type: 'object', required: ['setting'], properties: { setting: { type: 'object' } } },
    answers: 'The badge script (`application/javascript`)'
  },
  // src/ops/llm.js
  {
    method: 'GET',
    path: '/api/ops/llm',
    summary: 'Read the model providers and job assignments',
    description: `Answers the provider catalogue, the jobs (doors) that use a model, the configured providers (key hint only, never the key) and which provider and model each job uses. ${LLM_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: '`catalog`, `doors`, `capabilities`, `providers` and `assignments`'
  },
  // src/ops/llm.js
  {
    method: 'PUT',
    path: '/api/ops/llm/providers/:id',
    summary: 'Create or update a model provider',
    description: `Saves a provider row: a catalogue preset, or a custom one with its own base URL. The API key is stored encrypted and never returned. ${LLM_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { id: 'Catalogue id or `custom:<slug>`' } },
    body: {
      type: 'object',
      properties: {
        presetId: { type: 'string' },
        name: { type: 'string' },
        baseUrl: { type: 'string' },
        apiKey: { type: 'string' },
        enabled: { type: 'boolean' }
      }
    },
    answers: '`provider` (without the key)'
  },
  // src/ops/llm.js
  {
    method: 'DELETE',
    path: '/api/ops/llm/providers/:id',
    summary: 'Delete a model provider',
    description: `Removes the provider row; 409 \`PROVIDER_IN_USE\` with the jobs that still use it. ${LLM_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { id: 'Provider id' } },
    answers: 'The deletion result'
  },
  // src/ops/llm.js
  {
    method: 'POST',
    path: '/api/ops/llm/providers/:id/test',
    summary: 'Test a provider key with one real inference call',
    description: `Sends a one-token chat completion with the stored key and answers the provider's own verdict and latency (20 s timeout). Works on disabled providers. ${LLM_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { id: 'Provider id' } },
    body: { type: 'object', required: ['model'], properties: { model: { type: 'string' } } },
    answers: '`ok`, `status`, `detail` and `latencyMs`'
  },
  // src/ops/llm.js
  {
    method: 'POST',
    path: '/api/ops/llm/providers/:id/models',
    summary: "Fetch and cache a provider's model list",
    description: `Calls the provider's \`/models\` with the stored key, keeps each model's declared capabilities (image output, vision, tools, …) and caches the list on the row. The list is a picker, not a gate. ${LLM_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { id: 'Provider id' } },
    answers: '`models`, or `error` (`PROVIDER_REFUSED`, `UNREACHABLE`)'
  },
  // src/ops/llm.js
  {
    method: 'PUT',
    path: '/api/ops/llm/providers/:id/model-aliases',
    summary: 'Save display aliases for Tracy AI providers and models',
    description: `Replaces this provider's model alias map and optionally updates its provider display alias. Empty aliases restore the original name. Model IDs, credentials and personal AI accounts stay unchanged. Aliases survive model-list refreshes. ${LLM_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { id: 'Provider id' } },
    body: {
      type: 'object',
      required: ['aliases'],
      properties: {
        aliases: { type: 'object', additionalProperties: { type: 'string', maxLength: 120 } },
        providerAlias: { type: 'string', maxLength: 120 }
      }
    },
    answers: '`aliases`, or `INVALID_MODEL_ALIASES` / `NO_SUCH_PROVIDER`'
  },
  // src/ops/llm.js
  {
    method: 'PUT',
    path: '/api/ops/llm/doors/:door',
    summary: 'Assign a provider and model to a job',
    description: `Assigns a ready, enabled provider and model to one job. WO editorial also accepts a reasoning effort from the model's declared levels and the supported provider adapter; high is the default when supported. Unsupported effort returns MODEL_EFFORT_UNSUPPORTED; other jobs reject effort settings. Read pictures requires vision and a separate pixel test before WO use. Picture generation retains its independent seedImage assignment. ${LLM_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { door: 'Job (door) id from the catalogue' } },
    body: {
      type: 'object',
      required: ['providerId'],
      properties: { providerId: { type: 'string' }, model: { type: 'string' }, effort: { type: 'string' } }
    },
    answers: 'All `assignments`'
  },
  {
    method: 'POST',
    path: '/api/ops/llm/doors/vision/test',
    summary: 'Verify the saved reading model with pixels and structured JSON',
    description: `Uses only the saved vision assignment, bounded reasoning JSON adapter and existing research cost ledger. The image contains a random visual challenge validated by the server. A repeated account/requestKey reads the durable result and never duplicates a dispatched call. Configuration changes invalidate prior proof; uncertain calls retain their monetary hold. No provider, model or endpoint override is accepted. ${LLM_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    body: {
      type: 'object',
      additionalProperties: false,
      required: ['requestKey'],
      properties: { requestKey: { type: 'string', format: 'uuid' } }
    },
    answers: 'Test id, state, model, observed JSON, request/image hashes, cost and current proof status'
  },
  // src/ops/llm.js
  {
    method: 'DELETE',
    path: '/api/ops/llm/doors/:door',
    summary: "Clear a job's provider assignment",
    description: `Removes the provider and model assigned to one job. ${LLM_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { door: 'Job (door) id' } },
    answers: 'All `assignments`'
  },
  // src/ops/llm.js
  {
    method: 'POST',
    path: '/api/ops/llm/push',
    summary: 'Push the stored model keys to the fleet host',
    description: `Sends the resolved provider keys to the default fleet host (where the agent and the seeder run) over the host channel's \`/model-keys\`. \`NOTHING_TO_PUSH\` when no key resolves; 503 when no push is wired. ${LLM_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: 'The push result'
  },
  {
    method: 'GET',
    path: '/api/ops/llm/audit',
    summary: 'The history of the model book',
    description:
      'The latest changes to the provider book — a provider saved or deleted, a door assigned or cleared, a key push — newest first, with who made each one. Carries no key and no key hint.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: 'The audit entries'
  }
]
