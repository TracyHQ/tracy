/**
 * `/api/ops/release-checklist` — everything to check before and after a new version goes out, as
 * one list the `/ops` › Release checklist screen draws.
 *
 * Each item is a line a person can act on: a title, how to check it, and — where this process can
 * see the answer — an automatic verdict computed per request. Two kinds of automatic verdict:
 *   - `env`: whether the named variables are set in THIS process (tracy-web). Only the names that
 *     are absent are answered, never a value (the same rule as `/api/ops/general`).
 *   - `db`: a read-only question to this deployment's database (migrations applied, campaign
 *     tables present, an owner in the Tracy workspace, pictures and releases loaded).
 * Everything else (features, other containers' env, the host) is a manual line with its command.
 * The ticks of manual lines live in the operator's browser, keyed by the release this process
 * runs (`release`), so a new image starts with a clean list.
 *
 * 🔒 IT READS. No write door, no table of its own. A variable that is meant to be empty on one
 * deployment (GitHub sign-in on staging, the stg- prefix outside staging) is judged against
 * `config.environment`, never reported as a failure there.
 */
import { readdir } from 'node:fs/promises'
import { Hono } from 'hono'

import { admit, denied } from './admit.js'

const MIGRATIONS_DIR = new URL('../db/migrations/', import.meta.url)

/** The beta / whitelist campaign's tables (migrations 0xx): a missing one is a broken campaign. */
const CAMPAIGN_TABLES = [
  'beta_access_cache',
  'beta_fallback',
  'beta_login_job',
  'beta_waitlist',
  'whitelist_confirmation',
  'whitelist_mail_budget',
  'ops_signal'
]

/** @typedef {{ state: 'pass' | 'fail' | 'warn' | 'info', detail: string }} Verdict */

const isSet = (env, k) => typeof env[k] === 'string' && env[k] !== ''

/**
 * Every key set → pass; some set → fail (an all-or-nothing block half configured behaves like an
 * empty one, silently); none set → `whenEmpty` (fail by default, warn or info where empty is a
 * legitimate choice on this deployment).
 * @returns {Verdict}
 */
function envAll(env, keys, whenEmpty = 'fail') {
  const missing = keys.filter((k) => !isSet(env, k))
  if (missing.length === 0) return { state: 'pass', detail: `set: ${keys.join(', ')}` }
  if (missing.length < keys.length)
    return { state: 'fail', detail: `partly set — missing: ${missing.join(', ')}` }
  return { state: whenEmpty, detail: `not set: ${missing.join(', ')}` }
}

/**
 * The variables worth checking on a release: the ones that, missing or half set, break a customer
 * feature with no error on screen. One line per feature, all its keys on that line; the verdict
 * says which keys this server does not set (never a value). `quietOn`: deployments where the line
 * is empty by design (a note, not a miss); `'*'` = an optional feature, empty is a note everywhere.
 */
const ENV_LINES = [
  [
    'env-core',
    'addresses',
    'Addresses: TRACY_ORIGIN, SITE_DOMAIN, TRACY_SEATS_ORIGIN',
    ['TRACY_ORIGIN', 'SITE_DOMAIN', 'TRACY_SEATS_ORIGIN']
  ],
  ['env-core', 'hosts', 'Hosts: HOSTS, HOST_NAME, HOST_ORG', ['HOSTS', 'HOST_NAME', 'HOST_ORG']],
  ['env-core', 'session', 'Session: SESSION_SECRET, SESSION_DOMAIN', ['SESSION_SECRET', 'SESSION_DOMAIN']],
  ['env-core', 'database', 'Database: DATABASE_URL', ['DATABASE_URL']],
  ['env-signin', 'mail', 'Sign-in code mail: MAIL, MAIL_FROM', ['MAIL', 'MAIL_FROM']],
  [
    'env-signin',
    'google',
    'Google sign-in: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET',
    ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET']
  ],
  ['env-beta', 'amember', 'aMember membership check: AMEMBER_API_KEY', ['AMEMBER_API_KEY']],
  [
    'env-beta',
    'waitlist',
    'Waitlist: BETA_WAITLIST_MODE, BETA_WAITLIST_URL',
    ['BETA_WAITLIST_MODE', 'BETA_WAITLIST_URL']
  ],
  [
    'env-beta',
    'whitelist',
    'Whitelist confirmation mail: WHITELIST_CONFIRMATION_SECRET, WHITELIST_CONFIRMATION_DAILY',
    ['WHITELIST_CONFIRMATION_SECRET', 'WHITELIST_CONFIRMATION_DAILY']
  ],
  [
    'env-storage',
    'r2',
    'R2: ARTIFACT_S3_ENDPOINT, ARTIFACT_S3_BUCKET, ARTIFACT_S3_ACCESS_KEY, ARTIFACT_S3_SECRET_KEY',
    ['ARTIFACT_S3_ENDPOINT', 'ARTIFACT_S3_BUCKET', 'ARTIFACT_S3_ACCESS_KEY', 'ARTIFACT_S3_SECRET_KEY']
  ],
  [
    'env-github',
    'app',
    'GitHub App: GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_ORG, GITHUB_WEBHOOK_SECRET',
    ['GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_ORG', 'GITHUB_WEBHOOK_SECRET']
  ],
  [
    'env-golive',
    'cloudflare',
    'Cloudflare DNS and tunnel: CLOUDFLARE_ACCOUNT, CLOUDFLARE_TOKEN, CLOUDFLARE_TUNNEL',
    ['CLOUDFLARE_ACCOUNT', 'CLOUDFLARE_TOKEN', 'CLOUDFLARE_TUNNEL']
  ],
  [
    'env-agent',
    'api',
    'Public API and seat keys: API_ORIGIN, API_KEY_PEPPER',
    ['API_ORIGIN', 'API_KEY_PEPPER']
  ],
  // The image carries the documentation site, which is served only at the root of its own host:
  // without this tracy-web refuses to start (`config.js`, `readDocsOrigin`).
  ['env-agent', 'docs', 'Documentation host: DOCS_ORIGIN', ['DOCS_ORIGIN']],
  ['env-agent', 'actor', 'Agent actor signature: MCP_TRACY_ACTOR_SECRET', ['MCP_TRACY_ACTOR_SECRET']],
  ['env-agent', 'demo', 'Demo host: DEMO_HOST', ['DEMO_HOST']],
  [
    'env-agent',
    'seat-plan',
    'Account subscriptions (model plan): SEAT_PLAN_KEK, 32 random bytes in base64',
    ['SEAT_PLAN_KEK']
  ],
  [
    'env-alerts',
    'telegram',
    'Ops alerts: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_THREAD_ID, ALERT_LABEL',
    ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TELEGRAM_THREAD_ID', 'ALERT_LABEL'],
    ['staging', 'local']
  ],
  [
    'env-alerts',
    'support',
    'Customer support handoff: CS_TELEGRAM_BOT_TOKEN, CS_TELEGRAM_CHAT_ID, CS_TELEGRAM_MODE',
    ['CS_TELEGRAM_BOT_TOKEN', 'CS_TELEGRAM_CHAT_ID', 'CS_TELEGRAM_MODE'],
    ['staging', 'local']
  ],
  [
    'env-alerts',
    'discord',
    'Discord bot doors (/api/discord/*): DISCORD_LINK_SECRET — empty = doors off until the bot runs',
    ['DISCORD_LINK_SECRET'],
    '*'
  ],
  [
    'env-ops',
    'ci',
    '/ops CI dashboard: TRACY_CI_GITHUB_TOKEN (read-only token on the source repository, TRACY_SOURCE_REPO)',
    ['TRACY_CI_GITHUB_TOKEN'],
    '*'
  ]
]

/** Keys of the env files tracy-web cannot see. */
const HOST_DSH_KEYS = [
  'MODEL_API_KEY',
  'MODEL_BALANCE_MIN',
  'DSH_IMAGE_TAG',
  'HOST_AGENT_HOSTNAME',
  'HOST_DSH_HOME',
  'HOST_SITES_ROOT',
  'TRACY_SITE_DOMAIN'
]
const HOOKS_KEYS = [
  'FLEET_RELAY_SECRET',
  'TRACY_MIGRATE_S3_ENDPOINT',
  'TRACY_MIGRATE_S3_BUCKET',
  'TRACY_MIGRATE_S3_ACCESS_KEY',
  'TRACY_MIGRATE_S3_SECRET_KEY'
]
/** A command that prints, per key, whether `file` on a host sets it — names only, never values. */
const namesCheck = (file, keys) =>
  `ssh <host> 'for k in ${keys.join(' ')}; do sudo grep -q "^$k=." ${file} && echo "$k ok" || echo "$k MISSING"; done'`

/**
 * The catalogue. `group` orders the screen; `id` is stable (ticks are stored under it).
 * `auto(ctx)` returns a Verdict; `ctx` = { env, environment, pool }.
 */
export const RELEASE_ITEMS = [
  // ── 1. The release itself ─────────────────────────────────────────────────────────────────
  {
    id: 'rel-branch',
    group: 'release',
    title: 'PR into main from a release/staging-to-main-<date> branch, merged as a merge commit',
    how: 'docs/references/may-staging.md (branch flow); job branch-fresh green'
  },
  {
    id: 'rel-ci',
    group: 'release',
    title: 'Tracy CI green on the last commit of the release PR',
    how: 'node scripts/check-pr-merge.mjs --repo <org>/tch --pr <n> --base main → PASS'
  },
  {
    id: 'rel-staging-check',
    group: 'release',
    title: 'Staging accepted (staging-check skill), open issues decided',
    how: 'tasks/nghiem-thu-staging-<date>.md'
  },
  {
    id: 'rel-migrations-listed',
    group: 'release',
    title: 'New database migrations of the batch listed in the release PR',
    how: 'git diff --name-only --diff-filter=A origin/main origin/staging -- apps/tracy-web/src/db/migrations'
  },
  {
    id: 'rel-image-tags',
    group: 'release',
    title: 'Production image tags equal the tags staging was tested on',
    how: 'ssh <staging-host> \'grep -h -E "^(APP_IMAGE_TAG|DSH_IMAGE_TAG)=" /etc/tracy/*.env\' vs the build run summary'
  },
  {
    id: 'rel-rollback',
    group: 'release',
    title: 'Rollback ready: previous image tags recorded',
    how: 'APP_IMAGE_TAG_PREVIOUS / DSH_IMAGE_TAG_PREVIOUS in /etc/tracy/*.env',
    auto: ({ env }) =>
      isSet(env, 'APP_IMAGE_TAG_PREVIOUS')
        ? {
            state: 'pass',
            detail: `running ${env.APP_IMAGE_TAG ?? '?'}, previous ${env.APP_IMAGE_TAG_PREVIOUS}`
          }
        : { state: 'fail', detail: 'APP_IMAGE_TAG_PREVIOUS not set: nothing to roll back to' }
  },

  // ── 2. Environment ────────────────────────────────────────────────────────────────────────
  ...ENV_LINES.map(([group, id, title, keys, quietOn]) => ({
    id: `${group}-${id}`,
    group,
    title,
    how: '/etc/tracy/tracy-web.env',
    auto: ({ env, environment }) =>
      envAll(env, keys, quietOn === '*' || quietOn?.includes(environment) ? 'info' : 'fail')
  })),
  {
    id: 'env-core-prefix',
    group: 'env-core',
    title: 'Site address prefix: SITE_ADDRESS_PREFIX is stg- on staging, empty elsewhere',
    how: '/etc/tracy/tracy-web.env',
    auto: ({ env, environment }) => {
      const set = isSet(env, 'SITE_ADDRESS_PREFIX')
      if (environment === 'staging')
        return set
          ? { state: 'pass', detail: `prefix ${env.SITE_ADDRESS_PREFIX}` }
          : { state: 'fail', detail: 'staging needs stg-' }
      return set
        ? { state: 'fail', detail: `prefix ${env.SITE_ADDRESS_PREFIX} outside staging` }
        : { state: 'pass', detail: 'no prefix' }
    }
  },
  {
    id: 'env-core-environment',
    group: 'env-core',
    title: 'TRACY_ENVIRONMENT names this deployment (dev, staging, …)',
    how: 'Empty = local: the inventory pool key and the daily ops signal then share a name with a laptop',
    auto: ({ env }) =>
      isSet(env, 'TRACY_ENVIRONMENT')
        ? { state: 'pass', detail: `TRACY_ENVIRONMENT=${env.TRACY_ENVIRONMENT}` }
        : { state: 'warn', detail: 'not set: this deployment calls itself local' }
  },
  {
    id: 'env-ops-invitations',
    group: 'env-ops',
    title: 'Invitations sandbox: INVITATIONS_SANDBOX_ENABLED=1 on dev only (boot refuses it elsewhere)',
    how: 'Needs TRACY_ENVIRONMENT=dev and TRACY_ORIGIN=https://cowork.tracy.site; never on staging or production',
    auto: ({ env, environment }) => {
      const on = env.INVITATIONS_SANDBOX_ENABLED === '1'
      if (environment === 'dev')
        return on
          ? { state: 'pass', detail: 'sandbox on' }
          : { state: 'warn', detail: 'INVITATIONS_SANDBOX_ENABLED not 1: /ops › Invitations shows nothing' }
      return on
        ? { state: 'fail', detail: `sandbox on outside dev (${environment})` }
        : { state: 'pass', detail: 'off, as it must be here' }
    }
  },
  {
    id: 'env-ops-invitations-gmail',
    group: 'env-ops',
    title:
      'Invitations Gmail Setup: INVITATIONS_GMAIL_CLIENT_ID, INVITATIONS_GMAIL_CLIENT_SECRET, INVITATIONS_GMAIL_KEY_ID, INVITATIONS_GMAIL_KEY (all four or none; sandbox only)',
    how: 'OAuth client callback: <TRACY_ORIGIN>/api/ops/invitations/gmail/callback; KEY = 32 random bytes in base64',
    auto: ({ env, environment }) => {
      const keys = [
        'INVITATIONS_GMAIL_CLIENT_ID',
        'INVITATIONS_GMAIL_CLIENT_SECRET',
        'INVITATIONS_GMAIL_KEY_ID',
        'INVITATIONS_GMAIL_KEY'
      ]
      if (environment !== 'dev' && keys.some((k) => isSet(env, k)))
        return { state: 'fail', detail: `Gmail settings outside dev (${environment})` }
      return envAll(env, keys, 'info')
    }
  },
  {
    id: 'env-core-own-domain-probe',
    group: 'env-core',
    title: 'Own-domain probe overrides are empty on servers',
    how: 'TRACY_OWN_DOMAIN_PROBE_ALLOW_PRIVATE / TRACY_OWN_DOMAIN_PROBE_PORT are for a local stand only',
    auto: ({ env }) => {
      const set = ['TRACY_OWN_DOMAIN_PROBE_ALLOW_PRIVATE', 'TRACY_OWN_DOMAIN_PROBE_PORT'].filter((k) =>
        isSet(env, k)
      )
      return set.length
        ? { state: 'fail', detail: `set: ${set.join(', ')}` }
        : { state: 'pass', detail: 'empty' }
    }
  },
  {
    id: 'env-golive-cloudflare-saas',
    group: 'env-golive',
    title: 'Cloudflare for SaaS: CLOUDFLARE_SAAS_ZONE_ID, CLOUDFLARE_SAAS_TOKEN (customer own domains)',
    how: 'Both set. Neither, or only one, and Connect domain answers that it is not available on this server (the server still starts; this line names the one missing). The token is scoped to the zone of SITE_DOMAIN with SSL and Certificates: Edit. CLOUDFLARE_SAAS_API is for a local stand only. Zone set-up: docs/references/custom-domains-cloudflare-saas.md',
    auto: ({ env }) =>
      isSet(env, 'CLOUDFLARE_SAAS_API')
        ? { state: 'fail', detail: 'set: CLOUDFLARE_SAAS_API (a local stand only)' }
        : envAll(env, ['CLOUDFLARE_SAAS_ZONE_ID', 'CLOUDFLARE_SAAS_TOKEN'], 'warn')
  },
  {
    id: 'env-other-cloudflare-saas-zone',
    group: 'env-other',
    title:
      'The site zone serves own domains: Cloudflare for SaaS on, fallback origin Active, connect.<zone> proxied',
    how: "Cloudflare dashboard › <zone> › SSL/TLS › Custom Hostnames: fallback origin origin.<zone> Active; DNS: connect CNAME → origin.<zone>, proxied; the host's tunnel has origin.<zone> → http://127.0.0.1:<web port>. dig +short connect.<zone> answers Cloudflare addresses"
  },
  {
    id: 'env-signin-turnstile',
    group: 'env-signin',
    title: 'Turnstile: TURNSTILE_SECRET set, or TURNSTILE_DISABLED=1 on purpose',
    how: 'An absent secret with no switch fails closed: nobody can sign in',
    auto: ({ env }) =>
      isSet(env, 'TURNSTILE_SECRET')
        ? { state: 'pass', detail: 'secret set' }
        : env.TURNSTILE_DISABLED === '1'
          ? { state: 'info', detail: 'TURNSTILE_DISABLED=1' }
          : { state: 'fail', detail: 'no secret and not disabled' }
  },
  {
    id: 'env-signin-local-preview',
    group: 'env-signin',
    title: 'LOCAL_LOGIN_PREVIEW is off',
    how: 'Never 1 outside a local stand',
    auto: ({ env }) =>
      env.LOCAL_LOGIN_PREVIEW === '1'
        ? { state: 'fail', detail: 'LOCAL_LOGIN_PREVIEW=1' }
        : { state: 'pass', detail: 'off' }
  },
  {
    id: 'env-beta-gate',
    group: 'env-beta',
    title: 'BETA_GATE value as decided for this release (on: only aMember members and whitelist)',
    how: '/etc/tracy/tracy-web.env',
    auto: ({ env }) => ({ state: 'info', detail: `BETA_GATE=${env.BETA_GATE || 'off'}` })
  },
  {
    id: 'env-other-dsh',
    group: 'env-other',
    title: 'tracy-dsh: /etc/tracy/host-dsh.env keys set (model key, image tag, paths)',
    how: namesCheck('/etc/tracy/host-dsh.env', HOST_DSH_KEYS)
  },
  {
    id: 'env-other-dsh-reload',
    group: 'env-other',
    title: 'tracy-dsh reloaded after any host-dsh.env change',
    how: 'cd /opt/tracy-fleet/dsh && sudo docker compose --env-file /etc/tracy/host-dsh.env -f host-dsh.yml up -d'
  },
  {
    id: 'env-other-hooks',
    group: 'env-other',
    title: 'tracy-hooks: /etc/tracy/hooks.env keys set',
    how: namesCheck('/etc/tracy/hooks.env', HOOKS_KEYS)
  },
  {
    id: 'env-other-own-domain-service',
    group: 'env-other',
    title: 'tracy-host knows where tracy-web listens (customer own domains reach it)',
    how: "ssh <host> 'sudo docker exec tracy-tracy-host-1 printenv TRACY_OWN_DOMAIN_SERVICE TRACY_WEB_ORIGIN' → one of them http://127.0.0.1:<port>"
  },
  {
    id: 'env-other-new',
    group: 'env-other',
    title: 'Variables added by this release are set before the deploy',
    how: 'git diff origin/main origin/staging -- apps/tracy-web/src/config.js .env.example'
  },

  // ── 3. Infrastructure ────────────────────────────────────────────────────────────────────
  {
    id: 'infra-check-server',
    group: 'infra',
    title: 'check-server.sh all green',
    how: "ssh <host> 'sudo bash /opt/tracy-fleet/stack/check-server.sh'"
  },
  {
    id: 'infra-containers',
    group: 'infra',
    title: 'tracy-web, tracy-host, tracy-dsh, postgres up, restart policy unless-stopped',
    how: "sudo docker ps -a; sudo docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' tracy-tracy-web-1"
  },
  { id: 'infra-disk', group: 'infra', title: 'Disk free > 20 % and swap present', how: 'df -h /; free -h' },
  {
    id: 'infra-cloudflared',
    group: 'infra',
    title: 'cloudflared running',
    how: 'systemctl is-active cloudflared'
  },
  {
    id: 'infra-backups',
    group: 'infra',
    title: 'Backup timers active and last backup recent',
    how: 'systemctl list-timers | grep -i backup'
  },
  {
    id: 'infra-alert-cron',
    group: 'infra',
    title: 'Alert crons present (model balance, server status)',
    how: 'ls /etc/cron.d/tracy-*'
  },
  {
    id: 'infra-api-health',
    group: 'infra',
    title: 'API host health answers 200',
    how: 'curl -s -o /dev/null -w "%{http_code}" https://<api host>/health'
  },

  // ── 12. Database ──────────────────────────────────────────────────────────────────────────
  {
    id: 'db-migrations',
    group: 'db',
    title: 'Every migration file applied, none unknown',
    how: 'select name from schema_migration order by name',
    auto: async ({ pool }) => {
      const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql'))
      const done = new Set((await pool.query('select name from schema_migration')).rows.map((r) => r.name))
      const pending = files.filter((f) => !done.has(f))
      const unknown = [...done].filter((n) => !files.includes(n))
      if (pending.length) return { state: 'fail', detail: `not applied: ${pending.join(', ')}` }
      if (unknown.length)
        return { state: 'warn', detail: `applied but not in this image: ${unknown.join(', ')}` }
      return { state: 'pass', detail: `${files.length} applied` }
    }
  },
  {
    id: 'db-campaign-tables',
    group: 'db',
    title: 'Beta / whitelist campaign tables present',
    how: CAMPAIGN_TABLES.join(', '),
    auto: async ({ pool }) => {
      const { rows } = await pool.query(
        'select table_name from information_schema.tables where table_schema = current_schema() and table_name = any($1)',
        [CAMPAIGN_TABLES]
      )
      const have = new Set(rows.map((r) => r.table_name))
      const missing = CAMPAIGN_TABLES.filter((t) => !have.has(t))
      return missing.length
        ? { state: 'fail', detail: `missing: ${missing.join(', ')}` }
        : { state: 'pass', detail: `${CAMPAIGN_TABLES.length} tables` }
    }
  },
  {
    id: 'db-staff-owner',
    group: 'db',
    title: 'Tracy workspace has at least one accepted owner',
    how: '/ops › Tracy Settings › General › Team',
    auto: async ({ pool }) => {
      const { rows } = await pool.query(
        "select sw.role, count(*)::int as n from seat_workspace sw join workspace w on w.id = sw.workspace_id where w.kind = 'tracy_admin' and sw.accepted_at is not null and sw.revoked_at is null group by sw.role"
      )
      const by = Object.fromEntries(rows.map((r) => [r.role, r.n]))
      const detail = rows.map((r) => `${r.role} ${r.n}`).join(', ') || 'nobody'
      return by.owner ? { state: 'pass', detail } : { state: 'fail', detail: `no owner — ${detail}` }
    }
  },
  {
    id: 'db-staff-roles',
    group: 'db',
    title: 'Each internal person holds the role intended (no former staff left)',
    how: '/ops › General › Team: read the list, revoke who left'
  },
  {
    id: 'db-pending-staff',
    group: 'db',
    title: 'No Tracy workspace invitation left pending',
    how: '/ops › General › Team',
    auto: async ({ pool }) => {
      const { rows } = await pool.query(
        "select count(*)::int as n from seat_workspace sw join workspace w on w.id = sw.workspace_id where w.kind = 'tracy_admin' and sw.accepted_at is null and sw.revoked_at is null and sw.declined_at is null"
      )
      return rows[0].n
        ? { state: 'warn', detail: `${rows[0].n} pending` }
        : { state: 'pass', detail: 'none pending' }
    }
  },
  {
    id: 'db-releases',
    group: 'db',
    title: 'Quickstart releases loaded (templates offered to customers)',
    how: '/ops › Quickstarts',
    auto: async ({ pool }) => {
      const { rows } = await pool.query('select count(*)::int as n from quickstart_releases')
      return rows[0].n
        ? { state: 'pass', detail: `${rows[0].n} releases` }
        : { state: 'fail', detail: 'none: the Add site list is empty' }
    }
  },
  {
    id: 'db-template-shots',
    group: 'db',
    title: 'Design template pictures loaded',
    how: 'Empty → every card is a grey box (copy from production, read-only there)',
    auto: async ({ pool }) => {
      const { rows } = await pool.query(
        'select count(*)::int as n, count(distinct template_id)::int as t from template_shots'
      )
      return rows[0].n
        ? { state: 'pass', detail: `${rows[0].n} pictures / ${rows[0].t} templates` }
        : { state: 'fail', detail: 'no pictures' }
    }
  },
  {
    id: 'db-llm',
    group: 'db',
    title: 'A model provider configured and assigned',
    how: '/ops › Model & AI',
    auto: async ({ pool }) => {
      const p = (await pool.query('select count(*)::int as n from llm_provider')).rows[0].n
      const a = (await pool.query('select count(*)::int as n from llm_assignment')).rows[0].n
      if (!p) return { state: 'fail', detail: 'no provider' }
      return a
        ? { state: 'pass', detail: `${p} provider(s), ${a} assignment(s)` }
        : { state: 'warn', detail: `${p} provider(s), nothing assigned` }
    }
  },
  {
    id: 'db-backup-before',
    group: 'db',
    title: 'Database backup taken right before the deploy',
    how: 'pg_dump on the host, or the backup timer’s latest file'
  },

  // ── 13. Features — one line each ──────────────────────────────────────────────────────────
  ...[
    ['login-otp', 'Sign in with the emailed code; reload keeps the session'],
    ['login-google', 'Sign in with Google (first time and returning)'],
    ['logout', 'Sign out ends the session'],
    ['beta-admit', 'Beta gate: an aMember member gets in'],
    ['beta-refuse', 'Beta gate: a non-member sees the waitlist'],
    ['whitelist', 'Whitelist confirmation mail arrives and its link admits'],
    ['add-wp', 'Add site: WordPress from the wizard, site answers, admin opens'],
    ['add-joomla', 'Add site: Joomla (JA template) from the wizard'],
    ['add-emdash', 'Add site: EmDash from the wizard'],
    ['add-template', 'Start from a template (Design templates → wizard)'],
    ['add-questions', 'Customize your site card: questions saved and used'],
    ['import-wp', 'Import an existing WordPress site (Claude Cowork plugin)'],
    ['import-joomla', 'Import an existing Joomla site'],
    ['inspiration', 'Design templates: filters, search, pictures, page previews'],
    ['inspiration-dark', 'Design templates: Light/Dark on a live demo'],
    ['build-design', 'Build from design applies the chosen design'],
    ['chat-content', 'Chat edits content (database) and the page changes'],
    ['chat-file', 'Chat edits a theme file; Site changes shows the file'],
    ['diff', 'Diff of a change shows the right file'],
    ['undo', 'Undo a chat turn puts the site back'],
    ['backup-restore', 'Backup → change → Restore brings files and database back'],
    ['comments', 'Comments: pin, mention, reply between two people'],
    ['inbox', 'Inbox: a reply lands, opening the thread marks it read'],
    ['notify-prefs', 'Notification preferences take effect'],
    ['team', 'Team: invite, accept, change role, revoke (open tab loses access)'],
    ['languages', 'Settings › Language: all eight languages on Tracy and dsh screens'],
    ['help', '/help <question> answers in the agent chat'],
    ['go-live', 'Go live and back to draft (badge, noindex, robots)'],
    ['own-domain', 'Connect the customer’s own domain'],
    ['api-key', 'API key: create, use on /v1, revoke'],
    ['ops-screens', '/ops: every screen opens with this deployment’s data'],
    ['desktop', 'Desktop app: sign-in returns to the app'],
    ['delete-site', 'Delete a site: containers, DNS and GitHub repository removed'],
    ['isolation', 'A person without a seat cannot read or write someone else’s site']
  ].map(([id, title]) => ({
    id: `feat-${id}`,
    group: 'features',
    title,
    how: 'docs/references/e2e-staging.md; E2E: node tests/e2e-dev/run.mjs --env <env>'
  })),

  // ── 14. After the deploy ──────────────────────────────────────────────────────────────────
  {
    id: 'post-deploy-run',
    group: 'after',
    title: 'Deploy workflow green (build-app-images, build-dsh-image, deploy)',
    how: 'gh run list --branch main --limit 5'
  },
  {
    id: 'post-e2e',
    group: 'after',
    title: 'E2E smoke against the deployed surface',
    how: 'node tests/e2e-dev/run.mjs --env <env> --tier smoke'
  },
  {
    id: 'post-logs',
    group: 'after',
    title: 'tracy-web and tracy-host logs quiet for 30 minutes',
    how: "ssh <host> 'sudo docker logs --since 30m tracy-tracy-web-1 2>&1 | grep -i error'"
  },
  {
    id: 'post-alerts',
    group: 'after',
    title: 'Telegram alerts normal (model balance, server status)',
    how: 'Telegram topic'
  },
  {
    id: 'post-customers',
    group: 'after',
    title: 'Existing customer sites still answer (spot-check a few)',
    how: 'curl -s -o /dev/null -w "%{http_code}" https://<site>/'
  },

  // ── 15. Desktop app ───────────────────────────────────────────────────────────────────────
  // The app is a shell around the web pages (ADR 0030), so every web release changes what the
  // installed app shows: it is re-tested on each release, and rebuilt when the shell itself changed.
  // The server goes first, the app after (docs/references/phat-hanh-app-desktop.md §3, §4).
  {
    id: 'desktop-retest',
    group: 'desktop',
    title:
      'Installed stable app against the deployed web: sign in (Google, GitHub, emailed code return to the app), restart keeps the session, open a site, chat, save a file',
    how: 'Mac, Windows and Linux; evidence in tasks/evidence/desktop-release/<version>/'
  },
  {
    id: 'desktop-contract',
    group: 'desktop',
    title: 'Every server door the app calls answers on this deployment',
    how: 'node packages/desktop/tracy-desktop/build/check-server-contract.mjs <this origin> → every door PASS'
  },
  {
    id: 'desktop-contract-kept',
    group: 'desktop',
    title: 'No door in server-contract.json changed shape or was removed (older apps still call it)',
    how: 'git diff origin/main origin/staging -- packages/desktop/tracy-desktop/server-contract.json'
  },
  {
    id: 'desktop-build-needed',
    group: 'desktop',
    title: 'New app build decided: the shell changed, or Electron has a security fix',
    how: 'git diff --stat origin/main origin/staging -- packages/desktop/tracy-desktop; nothing there and no Electron fix → skip the next lines'
  },
  {
    id: 'desktop-version',
    group: 'desktop',
    title: 'App version bumped above the version on the stable feed',
    how: 'packages/desktop/tracy-desktop/package.json vs <update host>/desktop/stable-mac.yml'
  },
  {
    id: 'desktop-prepare',
    group: 'desktop',
    title:
      'Stable candidate prepared from the release PR head sha: Mac signed and notarized, Windows and Linux built',
    how: 'On the iMac: pnpm --filter @tracy/desktop release:prepare -- --variant stable --sha <S> (skill desktop-release)'
  },
  {
    id: 'desktop-accept',
    group: 'desktop',
    title:
      'Stable candidate accepted: fresh install from the dmg / exe / AppImage, sign-in returns to the app, previous stable updates itself to it',
    how: 'docs/references/phat-hanh-app-desktop.md §4 ③; evidence in tasks/evidence/desktop-release/<version>/'
  },
  {
    id: 'desktop-publish',
    group: 'desktop',
    title: 'Stable published (approved in chat), preflight all PASS, tag desktop-v<version> pushed',
    how: 'pnpm --filter @tracy/desktop release:publish -- --manifest <manifest> --digest <sha256> --target <stable store>'
  },
  {
    id: 'desktop-feed',
    group: 'desktop',
    title: 'Public feed serves the new version, and an installed app offers the update',
    how: 'curl -s <update host>/desktop/stable-mac.yml | head -3'
  },
  {
    id: 'desktop-minimum',
    group: 'desktop',
    title: 'Minimum app version: raised on purpose, or left as it is',
    how: 'Raise only when this server breaks older apps — phat-hanh-app-desktop.md §10'
  }
]

export const RELEASE_GROUPS = [
  { id: 'release', title: 'The release' },
  { id: 'env-core', title: 'Environment — core' },
  { id: 'env-signin', title: 'Environment — sign-in' },
  { id: 'env-beta', title: 'Environment — beta gate and campaign' },
  { id: 'env-storage', title: 'Environment — R2 storage' },
  { id: 'env-github', title: 'Environment — GitHub' },
  { id: 'env-golive', title: 'Environment — go-live (DNS)' },
  { id: 'env-agent', title: 'Environment — API, build and demos' },
  { id: 'env-alerts', title: 'Environment — alerts and support' },
  { id: 'env-ops', title: 'Environment — /ops tools (CI, invitations)' },
  { id: 'env-other', title: 'Environment — other containers' },
  { id: 'infra', title: 'Infrastructure' },
  { id: 'db', title: 'Database' },
  { id: 'features', title: 'Features — one line each' },
  { id: 'after', title: 'After the deploy' },
  { id: 'desktop', title: 'Desktop app — re-test, and release when the shell changed' }
]

/**
 * Every item with its automatic verdict where it has one. A check that throws answers `fail` with
 * the reason, so one broken query never hides the rest of the list.
 * @param {{ env: Record<string, string | undefined>, environment: string, pool: import('pg').Pool }} ctx
 */
export async function evaluateChecklist(ctx) {
  return Promise.all(
    RELEASE_ITEMS.map(async ({ auto, ...item }) => {
      if (!auto) return { ...item, auto: null }
      try {
        const verdict = await auto(ctx)
        // A local stand is a developer's machine, not something being released: what would be a
        // miss on a server is only a note there, so nobody "fixes" their laptop's env for it.
        if (ctx.environment === 'local' && verdict.state === 'fail')
          return {
            ...item,
            auto: { state: 'info', detail: `Local stand, no fix needed — ${verdict.detail}` }
          }
        return { ...item, auto: verdict }
      } catch (error) {
        return {
          ...item,
          auto: {
            state: 'fail',
            detail: `check failed: ${error instanceof Error ? error.message : String(error)}`
          }
        }
      }
    })
  )
}

/**
 * Which deployment this is, without writing any hostname into code (gate `origins`): the declared
 * TRACY_ENVIRONMENT when there is one; otherwise a server (https, so a real deployment: misses are
 * misses) named by its HOST_NAME — production declares no TRACY_ENVIRONMENT (checked 08/10/2026)
 * and its HOST_NAME is prod1 — and a plain-http origin is a developer's local stand.
 * @param {{ environment?: string, origin: string }} config
 * @param {Record<string, string | undefined>} env
 */
export function deploymentOf(config, env = {}) {
  if (config.environment && config.environment !== 'local') return config.environment
  if (String(config.origin).startsWith('https:')) return env.HOST_NAME || 'server'
  return 'local'
}

export function releaseChecklistRoutes({ pool, config, env = process.env }) {
  const app = new Hono()

  app.get('/api/ops/release-checklist', async (c) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return denied(c, who)
    c.header('cache-control', 'no-store')
    const environment = deploymentOf(config, env)
    const items = await evaluateChecklist({ env, environment, pool })
    return c.json({
      environment,
      origin: config.origin,
      // What the screen keys its ticks by: a new image starts a clean list.
      release:
        env.APP_IMAGE_TAG || env.TRACY_SOURCE_COMMIT || (environment === 'local' ? 'local build' : 'unknown'),
      groups: RELEASE_GROUPS,
      items,
      checkedAt: new Date().toISOString()
    })
  })

  return app
}
