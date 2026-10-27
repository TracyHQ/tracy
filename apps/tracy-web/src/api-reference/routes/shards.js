/**
 * The doors a shard calls on its master, and the /ops › Shards screen
 * (docs/sre/2026-10-15-shard-beta-design.md; docs/sre/hop-dong-cua-shard.md). Internal: no customer
 * or partner calls them.
 */
const SIGNED =
  'The calling shard signs `<timestamp ms>\\n<nonce>\\n<METHOD>\\n<path without query>\\n<sha256(body)>` with its own ' +
  '`SHARD_<name>_SECRET` (HMAC-SHA256, 32 bytes hex) in `x-shard-timestamp`, `x-shard-nonce` (32 hex) and ' +
  '`x-shard-signature`. A refused call is 403 `{ code: "SIGNATURE_INVALID", why }`, `why` one of `clock` (more than ' +
  '120 s away: retry with backoff), `replay`, `signature` or `unknown_shard`. No session is read.'
const NAME = { path: { name: 'The shard, as named in the `shard` table' } }

/** @type {import('./index.js').RouteDoc[]} */
export const SHARDS_ROUTES = [
  {
    method: 'POST',
    path: '/api/shards/:name/labels/reserve',
    summary: 'Hold a site label across this master and every shard for thirty minutes',
    description: `${SIGNED} Answers 200 \`{ label, expiresAt }\`; asking again as the holder refreshes the hold. 409 \`LABEL_TAKEN\` with \`reason\`: \`in_use\` (a site has it; the \`shard\` that does, \`s0\` for this master), \`reserved\` (another \`shard\` holds it now), \`zone_record\` (a name of the zone) or \`reserved_name\` (a reserved word or a shard name). The hold ends when \`site.created\` arrives or it lapses.`,
    audience: ['fleet'],
    auth: 'signature',
    internal: true,
    params: NAME,
    body: {
      type: 'object',
      required: ['label'],
      properties: { label: { type: 'string', description: 'A DNS label' }, siteKey: { type: 'string' } }
    },
    answers: '`{ label, expiresAt }`'
  },
  {
    method: 'POST',
    path: '/api/shards/:name/events',
    summary: 'Tell the master what changed among the people and sites of a shard',
    description: `${SIGNED} One event per call, \`{ eventId, kind, at, data }\` — \`eventId\` 32 hex, \`at\` an ISO time — answered once per \`eventId\` (a replay gets the first answer, a 200 with \`duplicate: true\`). Kinds, a closed set: \`site.created {siteKey, label, platform}\` (sent right after the site row is written), \`site.deleted {siteKey, label}\`, \`site.renamed {siteKey, from, to}\`, \`account.created {email, source}\` with \`source\` \`adopt\`, \`invitation\` (admitted by this master's beta gate) or \`seed\`. Anything else, \`domain.*\` included (own domains go through \`custom-hostname\`), is 400 \`BAD_EVENT\`. A site event writes or removes \`<label>.<SITE_DOMAIN>\` → the shard's tunnel, never over a record that points elsewhere (\`dns: conflict\`, alerted); \`dns: pending\` when the zone does not answer. 403 \`SCOPE\` for another shard's site; 409 \`LABEL_TAKEN\` (with the \`shard\` that has it, alerted) when the label is someone else's; 429 \`RATE_LIMITED\` (alerted) when a shard announces more than 50 \`invitation\` accounts in an hour — the shard retries later. An \`account.created\` only adds the shard to the person's list: it never makes it their home.`,
    audience: ['fleet'],
    auth: 'signature',
    internal: true,
    params: NAME,
    body: {
      type: 'object',
      required: ['eventId', 'kind', 'at', 'data'],
      properties: {
        eventId: { type: 'string', pattern: '^[0-9a-f]{32}$' },
        kind: { type: 'string', enum: ['site.created', 'site.deleted', 'site.renamed', 'account.created'] },
        at: { type: 'string', format: 'date-time' },
        data: { type: 'object' }
      }
    },
    answers: '`{ ok: true, dns?, previous?, duplicate? }`'
  },
  {
    method: 'POST',
    path: '/api/shards/:name/custom-hostname',
    summary: "Connect, read or drop the own domain of a shard's site through the master",
    description: `${SIGNED} \`{ siteKey, domain, op }\`, \`op\` one of \`add\`, \`status\`, \`remove\`. The master holds Cloudflare for SaaS: \`add\` registers the custom hostname with \`custom_origin_server\` set to the shard's own host and records the domain as that shard's; asked again it reads the same hostname. Every op answers \`{ hostname, id, status, sslStatus, validationRecords: [{ type, name, value }] }\` (\`status\` \`deleted\` after a remove, \`absent\` for a domain not registered). 404 \`UNKNOWN_SITE\` (no such site of this shard), 409 \`DOMAIN_TAKEN\` with the \`shard\` that holds it (\`s0\` for this master, null when only Cloudflare has it), 502 \`CLOUDFLARE\` with \`detail\` (\`NOT_CONFIGURED\`, \`UNCERTAIN:…\`, \`REFUSED:…\`, \`UNREADABLE:…\`, \`UNREMOVED:…\`), 400 \`INVALID_REQUEST\`.`,
    audience: ['fleet'],
    auth: 'signature',
    internal: true,
    params: NAME,
    body: {
      type: 'object',
      required: ['siteKey', 'domain', 'op'],
      properties: {
        siteKey: { type: 'string' },
        domain: { type: 'string' },
        op: { type: 'string', enum: ['add', 'status', 'remove'] }
      }
    },
    answers: '`{ hostname, id, status, sslStatus, validationRecords }`'
  },
  {
    method: 'POST',
    path: '/api/shards/:name/check',
    summary: 'Record a shard heartbeat and tell its updater which tags to run',
    description: `${SIGNED} The heartbeat (snake_case, docs/sre/hop-dong-cua-shard.md §7): \`app_tag\`, \`dsh_tag\`, \`source_commit\`, \`updater_version\`, \`sites\`, \`mem_available_mb\`, \`disk_free_mb\`, \`load1\`, \`releases_read_at\`, \`migration_head\`, \`accepting\`, \`updating\`, \`last_update {app_tag, dsh_tag, ok, finished_at, log_tail, web_images_missing}\`, \`last_backup {at, ok}\`. Unknown fields are dropped and nothing in a heartbeat is refused: \`sites\` or \`mem_available_mb\` null (the shard could not read its status) still gets an answer and passes the shard over for new accounts until a good heartbeat. The shard stops taking new accounts at 90 % of its site limit or after three beats at or under 2048 MB; a backup older than 36 hours or failed, and an update without its web images, are alerted. Answers \`{ app_tag, dsh_tag, source_commit, hold, reason, granted_until }\`: the shard's pinned tags, its target tags set in /ops, or the tags this master runs; \`hold\` with \`reason\` \`PINNED\`, \`MIGRATION_AHEAD\` (the shard's schema is ahead of this master's), \`TAG_UNKNOWN\` (tags may be null) or \`BUSY\` (two other shards are updating, or this one is backing off for an hour after a failed update); \`granted_until\` is when the update turn given now ends (at most two at once, fifteen minutes unless the shard reports \`updating\`), null when none is given.`,
    audience: ['fleet'],
    auth: 'signature',
    internal: true,
    params: NAME,
    body: {
      type: 'object',
      properties: {
        app_tag: { type: ['string', 'null'] },
        dsh_tag: { type: ['string', 'null'] },
        source_commit: { type: ['string', 'null'] },
        sites: { type: ['integer', 'null'] },
        mem_available_mb: { type: ['number', 'null'] },
        migration_head: { type: ['string', 'null'] },
        accepting: { type: ['boolean', 'null'] },
        updating: { type: 'boolean' },
        last_update: { type: ['object', 'null'] },
        last_backup: { type: ['object', 'null'] }
      }
    },
    answers: '`{ app_tag, dsh_tag, source_commit, hold, reason, granted_until }`'
  },
  {
    method: 'GET',
    path: '/api/ops/shards',
    summary: 'List the shards with their last heartbeat, counts and the tags this master runs',
    description:
      'Per shard: origin, provider, region, whether it takes new accounts, pin (and the tags it holds), site limit, target tags, degraded until, last heartbeat (and `silent` past three minutes), migration head, sites and people the directory holds. Also this master: its app and dsh tags, migration head, how many people stay on it, whether adoption is on for everyone, some or nobody (`SHARD_ADOPT_ALLOW`) and whether DNS is configured. No secret is ever part of the answer.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: '`{ shards, master, adopt, dns, writable }`'
  },
  {
    method: 'POST',
    path: '/api/ops/shards',
    summary: 'Add a shard without a deploy',
    description:
      "Owner and admin seats of tracy_admin only (403 `FORBIDDEN` for others). `name` (lower-case, up to 16, never `s0`), `origin` (an https origin, nothing after it), `secret` (64 hex, the shard's `SHARD_SECRET`), `tunnelId` (its Cloudflare tunnel uuid), optional `provider` and `region` (`asia`, `america`, `europe`, `unknown` — the default). The secret is sealed at once and never answered back; the shard takes nobody until it is opened. A name or origin already in the table is 409 `SHARD_EXISTS`; anything else wrong is 400 `INVALID_REQUEST`. A later `SHARDS` entry of the same name wins for these columns at the next boot.",
    audience: ['team'],
    auth: 'admin',
    internal: true,
    body: {
      type: 'object',
      required: ['name', 'origin', 'secret', 'tunnelId'],
      properties: {
        name: { type: 'string', pattern: '^[a-z][a-z0-9]{0,15}$' },
        origin: { type: 'string' },
        secret: { type: 'string', pattern: '^[0-9a-f]{64}$' },
        tunnelId: { type: 'string' },
        provider: { type: 'string' },
        region: { type: 'string', enum: ['asia', 'america', 'europe', 'unknown'] }
      }
    },
    answers: '201 `{ name, origin, provider, region, accepting }`'
  },
  {
    method: 'PATCH',
    path: '/api/ops/shards/:name',
    summary: 'Open, close, pin or retarget one shard',
    description:
      'Owner and admin seats of tracy_admin only (403 `FORBIDDEN` for others). Any of `accepting` (boolean), `pinned` (true holds the shard at the app and dsh tags its last heartbeat reported — 409 `NOTHING_TO_PIN` before it has reported them; false lets it follow again), `maxSites` (1–10000), `targetAppTag`, `targetDshTag` (an image tag, or null to follow this master again); anything else is 400 `INVALID_REQUEST`, an unknown shard 404 `SHARD_UNKNOWN`.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: NAME,
    body: {
      type: 'object',
      properties: {
        accepting: { type: 'boolean' },
        pinned: { type: 'boolean' },
        maxSites: { type: 'integer', minimum: 1, maximum: 10000 },
        targetAppTag: { type: ['string', 'null'] },
        targetDshTag: { type: ['string', 'null'] }
      }
    },
    answers: '`{ name, accepting, pinned, pinnedAppTag, pinnedDshTag, maxSites, targetAppTag, targetDshTag }`'
  }
]
