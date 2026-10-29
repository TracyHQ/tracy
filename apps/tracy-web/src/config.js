import { Resolver } from 'node:dns/promises'
import { isAbsolute, parse, resolve } from 'node:path'
import { readSourceRepository } from './lib/source-repository.js'
import {
  MASTER_SHARD,
  SHARD_NAME,
  SHARD_REGIONS,
  SHARD_SECRET,
  TUNNEL_ID,
  shardOriginOf
} from './lib/shard-shapes.js'

/**
 * Every setting the service reads, read once, here. An empty variable means the feature is off —
 * that is the contract every deployment (laptop, dev host, production) shares.
 */
export class ConfigError extends Error {
  constructor(key, why) {
    super(`${key}: ${why}`)
    this.key = key
  }
}

function readSocialService(env) {
  const role = opt(env, 'WO_SOCIAL_ROLE') ?? 'standalone'
  if (!['standalone', 'central', 'client'].includes(role))
    throw new ConfigError('WO_SOCIAL_ROLE', 'must be standalone, central or client')
  const origin = opt(env, 'WO_SOCIAL_ORIGIN')
  if (origin) {
    let valid = false
    try {
      const u = new URL(origin)
      valid =
        u.protocol === 'https:' && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash
    } catch {}
    if (!valid) throw new ConfigError('WO_SOCIAL_ORIGIN', 'must be a fixed HTTPS origin')
  }
  return {
    woSocialRole: role,
    woSocialOrigin: origin,
    woSocialToken: opt(env, 'WO_SOCIAL_TOKEN'),
    woSocialKeyPepper: opt(env, 'WO_SOCIAL_KEY_PEPPER')
  }
}

const need = (env, key) => {
  const v = env[key]
  if (typeof v !== 'string' || v === '') throw new ConfigError(key, 'is required')
  return v
}
const opt = (env, key) => (typeof env[key] === 'string' && env[key] !== '' ? env[key] : null)

/** Optional immutable asset distribution, selected once when the design-system module loads. */
export function readDesignAssets(env) {
  const indexFile = opt(env, 'TRACY_DESIGN_ASSET_INDEX')
  const origin = opt(env, 'TRACY_DESIGN_ASSET_ORIGIN')
  const directory = opt(env, 'TRACY_DESIGN_ASSET_CACHE')
  if (!indexFile && !origin && !directory) return null
  if (!indexFile || !origin || !directory || !isAbsolute(indexFile) || !isAbsolute(directory))
    throw new ConfigError('TRACY_DESIGN_ASSET_INDEX', 'set index, origin and absolute cache paths together')
  return { indexFile, origin, directory }
}

// The retired Cloudflare Worker's badge script (ADR 0019: no customer page may call it). Host env
// files outlived the Worker — production still named it on 19/09, the dev host on 01/10 — and an
// explicit value beats the default, so every customer site showed the Worker's always-on pill
// instead of this app's switch-aware `/badge.js`. Matched on host and path only, so scheme, case,
// port, a trailing slash, a query or a fragment do not let it slip through.
function isRetiredWorkerBadge(raw, origin) {
  try {
    const url = new URL(raw, origin)
    return url.hostname === 'tracy.ai' && url.pathname.replace(/\/+$/, '') === '/dashboard/badge.js'
  } catch {
    return false
  }
}

function readBadgeUrl(env, origin) {
  const fallback = `${origin}/badge.js`
  const raw = opt(env, 'BADGE_URL')
  if (raw === null) return fallback
  if (isRetiredWorkerBadge(raw, origin)) {
    console.warn(
      `[config] ignoring BADGE_URL=${raw}: the retired Worker script (ADR 0019); using ${fallback}`
    )
    return fallback
  }
  return raw
}

/**
 * Whether this deployment serves the backup download doors (`sites/backup-export.js`): `on` or
 * `off`, default on. ADR 0024 amendment 3 permits these Owner-only doors; `off` remains an
 * operational kill switch.
 */
function readBackupExport(env) {
  const mode = opt(env, 'BACKUP_EXPORT') ?? 'on'
  if (!['on', 'off'].includes(mode)) throw new ConfigError('BACKUP_EXPORT', 'must be on or off')
  return mode === 'on'
}

/**
 * `USAGE_TEXT_READERS`: the addresses that may read customers' own words on `/ops` › Beta › Usage
 * (`ops/usage.js`, plan `tasks/todo-do-dung-that.md` U6) — the people given the quality review, never
 * every Tracy staff seat (council 17/10/2026). Comma-separated, lower-cased; unset means nobody, and
 * the screen shows numbers only.
 */
function readUsageTextReaders(env) {
  const raw = opt(env, 'USAGE_TEXT_READERS')
  if (raw === null) return []
  const list = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  if (list.some((e) => !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(e)))
    throw new ConfigError('USAGE_TEXT_READERS', 'must be comma-separated email addresses')
  return list
}

function readBeta(env, origin) {
  const mode = opt(env, 'BETA_GATE') ?? 'off'
  if (!['on', 'off'].includes(mode)) throw new ConfigError('BETA_GATE', 'must be on or off')
  // Legacy BETA_GATE values remain accepted during rollout; admission is public.
  // Whitelist submissions and confirmation mail keep their independent configuration.
  const apiKey = opt(env, 'AMEMBER_API_KEY')
  const apiUrl = opt(env, 'AMEMBER_API_URL') ?? 'https://www.joomlart.com/member/api/check-access/by-email'
  if (new URL(apiUrl).protocol !== 'https:') throw new ConfigError('AMEMBER_API_URL', 'must use HTTPS')
  const waitlistMode = opt(env, 'BETA_WAITLIST_MODE') ?? 'wordpress'
  if (!['wordpress', 'tracy'].includes(waitlistMode))
    throw new ConfigError('BETA_WAITLIST_MODE', 'must be wordpress or tracy')
  const waitlistUrl = opt(env, 'BETA_WAITLIST_URL') ?? 'https://tracy.ai/whitelist/'
  const waitlistOrigin = new URL(waitlistUrl).origin
  if (waitlistOrigin !== origin && new URL(waitlistUrl).protocol !== 'https:')
    throw new ConfigError('BETA_WAITLIST_URL', 'must use HTTPS outside the local origin')
  const confirmationSecret = opt(env, 'WHITELIST_CONFIRMATION_SECRET')
  if (confirmationSecret && confirmationSecret.length < 32)
    throw new ConfigError('WHITELIST_CONFIRMATION_SECRET', 'must have at least 32 characters')
  const confirmationDaily = Number(opt(env, 'WHITELIST_CONFIRMATION_DAILY') ?? 80)
  if (!Number.isSafeInteger(confirmationDaily) || confirmationDaily < 1)
    throw new ConfigError('WHITELIST_CONFIRMATION_DAILY', 'must be a positive integer')
  return {
    enabled: false,
    apiKey,
    apiUrl,
    waitlistUrl,
    waitlistOrigin,
    waitlistMode,
    confirmationSecret,
    confirmationDaily
  }
}

function readTelegram(env) {
  const threadId = opt(env, 'TELEGRAM_THREAD_ID')
  if (threadId && !/^[1-9]\d*$/.test(threadId))
    throw new ConfigError('TELEGRAM_THREAD_ID', 'must be a positive topic ID')
  const label = opt(env, 'ALERT_LABEL')
  if (label && !['PROD', 'DEV'].includes(label)) throw new ConfigError('ALERT_LABEL', 'must be PROD or DEV')
  return { token: opt(env, 'TELEGRAM_BOT_TOKEN'), chatId: opt(env, 'TELEGRAM_CHAT_ID'), threadId, label }
}

/**
 * The Customer Service bot (AI Assistant → a person, `assistant/support.js`): a bot of its OWN,
 * never the ops alert bot above, posting into a forum supergroup where each handoff is a topic.
 *
 * `CS_TELEGRAM_MODE` says how staff replies come back: `webhook` on a host with a public address
 * (Telegram POSTs `/api/assistant/telegram/webhook` with `CS_TELEGRAM_WEBHOOK_SECRET`), `polling`
 * on a laptop that has none (getUpdates). A bot answers one way at a time, so each environment
 * has its own bot. Unset or `off`: no "Talk to a person" button, nothing is sent anywhere.
 *
 * `CS_TELEGRAM_STAFF_IDS` is optional: empty, every member of the group may answer customers (the
 * group's admins decide who is in it); set, only those Telegram user ids are relayed.
 */
function readCsTelegram(env) {
  const mode = opt(env, 'CS_TELEGRAM_MODE') ?? 'off'
  if (!['off', 'webhook', 'polling'].includes(mode))
    throw new ConfigError('CS_TELEGRAM_MODE', 'must be off, webhook or polling')
  if (mode === 'off') return null
  const token = need(env, 'CS_TELEGRAM_BOT_TOKEN')
  const chatId = need(env, 'CS_TELEGRAM_CHAT_ID')
  if (!/^-100\d+$/.test(chatId))
    throw new ConfigError('CS_TELEGRAM_CHAT_ID', 'must be a supergroup id (-100…)')
  const webhookSecret = opt(env, 'CS_TELEGRAM_WEBHOOK_SECRET')
  if (mode === 'webhook' && (!webhookSecret || !/^[A-Za-z0-9_-]{32,256}$/.test(webhookSecret)))
    throw new ConfigError(
      'CS_TELEGRAM_WEBHOOK_SECRET',
      'webhook mode needs 32-256 characters of A-Z a-z 0-9 _ -'
    )
  const rawStaff = opt(env, 'CS_TELEGRAM_STAFF_IDS')
  const staffIds = rawStaff
    ? rawStaff
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : []
  if (staffIds.some((id) => !/^\d+$/.test(id)))
    throw new ConfigError('CS_TELEGRAM_STAFF_IDS', 'must be comma-separated Telegram user ids')
  return { mode, token, chatId, webhookSecret: mode === 'webhook' ? webhookSecret : null, staffIds }
}

/**
 * Tracy's Discord bot (`discord/route.js`, 08/10/2026). `DISCORD_LINK_SECRET` is the bot's whole
 * authority on the three `/api/discord/*` doors, sent as `x-tracy-discord-secret`. Unset: the doors
 * answer 404 and nothing is linked.
 */
function readDiscord(env) {
  const secret = opt(env, 'DISCORD_LINK_SECRET')
  if (!secret) return null
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret))
    throw new ConfigError('DISCORD_LINK_SECRET', 'needs 32-256 characters of A-Z a-z 0-9 _ -')
  return { secret }
}

/**
 * The place ingest door (`website-opportunities/src/place-ingest-door.js`, tasks/plan-wo-shared-places.md §6):
 * `WO_PLACES_INGEST_SECRET` is the sender's whole authority, sent as `x-tracy-wo-places-secret`.
 * Unset: the door answers 404. Only the master receives; a shard holding it is refused at boot.
 */
function readWoPlacesIngest(env, role) {
  const secret = opt(env, 'WO_PLACES_INGEST_SECRET')
  if (!secret) return null
  if (role === 'shard') throw new ConfigError('WO_PLACES_INGEST_SECRET', 'is read only on the master')
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret))
    throw new ConfigError('WO_PLACES_INGEST_SECRET', 'needs 32-256 characters of A-Z a-z 0-9 _ -')
  return { secret }
}

function readMail(env) {
  const raw = opt(env, 'MAIL') ?? 'console'
  if (raw === 'console') return { kind: 'console' }
  if (raw.startsWith('resend:'))
    return { kind: 'resend', key: raw.slice('resend:'.length), from: need(env, 'MAIL_FROM') }
  throw new ConfigError('MAIL', `unknown transport "${raw}" — use console or resend:<key>`)
}

/**
 * A local stand's own way to reach its TLS front for the own-domain probe
 * (`sites/domain-probe.js`): `TRACY_OWN_DOMAIN_PROBE_ALLOW_PRIVATE=1` (dial a private address) and
 * `TRACY_OWN_DOMAIN_PROBE_PORT`. 🔒 Never in production: there a probe that may dial a private
 * address is a request made inside Tracy's network on a stranger's DNS record.
 */
function ownDomainProbe(env) {
  const allowPrivate = opt(env, 'TRACY_OWN_DOMAIN_PROBE_ALLOW_PRIVATE') === '1'
  const rawPort = opt(env, 'TRACY_OWN_DOMAIN_PROBE_PORT')?.trim() ?? ''
  if (!allowPrivate && rawPort === '') return {}
  if (env.NODE_ENV === 'production')
    throw new ConfigError('TRACY_OWN_DOMAIN_PROBE_ALLOW_PRIVATE', 'is for a local stand, never production')
  const port = rawPort === '' ? 443 : Number(rawPort)
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new ConfigError('TRACY_OWN_DOMAIN_PROBE_PORT', 'must be a port number')
  return { allowPrivate, port }
}

/**
 * Cloudflare for SaaS, which serves a customer's own domain with its own certificate
 * (`sites/site-domain-provider.js`): `CLOUDFLARE_SAAS_ZONE_ID` (the zone of `SITE_DOMAIN`, with
 * Cloudflare for SaaS enabled and its fallback origin set) and `CLOUDFLARE_SAAS_TOKEN` (an API token
 * scoped to that zone alone, with SSL and Certificates: Edit). Named beside the host's
 * `CLOUDFLARE_TOKEN` / `CLOUDFLARE_ACCOUNT` / `CLOUDFLARE_TUNNEL`, and a different token on purpose:
 * that one edits the tunnel, this one only the zone's custom hostnames.
 *
 * Neither set, or only one of them: null, and connecting a new domain answers that it is not
 * available on this server — a half-finished set-up never stops tracy-web from starting; the release
 * checklist names the variable that is missing (`ops/release-checklist.js`). A value that is set but
 * is not a zone id or a token is refused here, by name. `CLOUDFLARE_SAAS_API` points the client at a
 * local stand's stand-in; refused in production, where the only API is Cloudflare's.
 * 🔒 The token is kept on the config and sent in one request header; nothing prints it.
 */
function readCustomHostnames(env) {
  const zoneId = opt(env, 'CLOUDFLARE_SAAS_ZONE_ID')?.trim() ?? ''
  const token = opt(env, 'CLOUDFLARE_SAAS_TOKEN')?.trim() ?? ''
  const apiBase = opt(env, 'CLOUDFLARE_SAAS_API')?.trim() ?? ''
  if (apiBase !== '' && env.NODE_ENV === 'production')
    throw new ConfigError('CLOUDFLARE_SAAS_API', 'is for a local stand, never production')
  if (zoneId !== '' && !/^[0-9a-f]{32}$/i.test(zoneId))
    throw new ConfigError('CLOUDFLARE_SAAS_ZONE_ID', 'must be a zone id (32 hex characters)')
  if (/\s/.test(token)) throw new ConfigError('CLOUDFLARE_SAAS_TOKEN', 'must be one token, without spaces')
  // Not both: own domains are not available here, and the server still starts.
  if (zoneId === '' || token === '') return null
  if (apiBase === '') return { zoneId: zoneId.toLowerCase(), token }
  let url
  try {
    url = new URL(apiBase)
  } catch {
    throw new ConfigError('CLOUDFLARE_SAAS_API', 'must be an http(s) URL')
  }
  if (!['http:', 'https:'].includes(url.protocol))
    throw new ConfigError('CLOUDFLARE_SAAS_API', 'must be an http(s) URL')
  return { zoneId: zoneId.toLowerCase(), token, apiBase: url.href.replace(/\/$/, '') }
}

/**
 * The two names of the site zone that serve customers' own domains (Cloudflare for SaaS):
 * `CLOUDFLARE_SAAS_CONNECT_LABEL` (default `connect`) — the proxied record a customer's CNAME points
 * at — and `CLOUDFLARE_SAAS_ORIGIN_LABEL` (default `origin`) — the fallback origin, the tunnel's
 * public hostname. They live in the same zone as customer sites, so both are refused as site labels
 * (`sites/label.js` `zoneLabelRefusal`) whether or not Cloudflare for SaaS is configured yet: a
 * customer who took `connect.<zone>` would receive every own domain's traffic.
 */
function readOwnDomainLabels(env) {
  const read = (key, fallback) => {
    const value = (opt(env, key)?.trim() ?? '').toLowerCase() || fallback
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value))
      throw new ConfigError(key, 'must be one DNS label')
    return value
  }
  const connect = read('CLOUDFLARE_SAAS_CONNECT_LABEL', 'connect')
  const origin = read('CLOUDFLARE_SAAS_ORIGIN_LABEL', 'origin')
  if (connect === origin)
    throw new ConfigError('CLOUDFLARE_SAAS_ORIGIN_LABEL', 'must differ from CLOUDFLARE_SAAS_CONNECT_LABEL')
  return { connect, origin }
}

/**
 * `TRACY_DNS_RESOLVER`: the resolver a site's own domain is read with, as `ip[:port]`, several
 * separated by commas. Judged here with the rule the resolver itself applies (addresses only, never
 * a host name), so a mistyped value stops the start with its name on it instead of surfacing later
 * as lookups that never answer.
 */
function dnsResolver(env) {
  const raw = opt(env, 'TRACY_DNS_RESOLVER')?.trim() ?? ''
  if (raw === '') return ''
  const servers = raw.split(',').map((server) => server.trim())
  try {
    new Resolver().setServers(servers)
  } catch {
    throw new ConfigError('TRACY_DNS_RESOLVER', 'must be IP addresses as ip[:port], separated by commas')
  }
  return servers.join(',')
}

/**
 * Mail sent BY a customer's site (PHP `mail()` / `wp_mail()` through the `tracy-sendmail` shim in
 * the web image, `POST /_site-mail`), as opposed to Tracy's own sign-in mail above.
 *
 * `off` (the default) closes the door: every relay answers 503 and nothing else changes. `log`
 * runs every check a real send runs and writes the message to the log instead of the wire, so a
 * stand can prove the path without a sending domain. `smtp` delivers through Resend's SMTP
 * endpoint, which keeps the site's own MIME (attachments, alternatives) byte for byte.
 *
 * 🔒 `SITE_MAIL_DOMAIN` IS REQUIRED WHEN THE DOOR IS OPEN, and it is never guessed from
 * `SITE_DOMAIN`: the domain a site's mail leaves from has to be verified on Resend by a person
 * first, and a default that looked right would send mail that fails DKIM on every message.
 *
 * The key falls back to the one `MAIL=resend:` already holds (one Resend account, one key); the
 * global daily cap is what keeps customer sites from eating the sign-in codes' share of it.
 */
function readSiteMail(env, mail) {
  const mode = opt(env, 'SITE_MAIL') ?? 'off'
  if (!['off', 'log', 'smtp'].includes(mode))
    throw new ConfigError('SITE_MAIL', `unknown mode "${mode}" — use off, log or smtp`)
  const count = (key, fallback) => {
    const raw = opt(env, key)
    if (raw === null) return fallback
    if (!/^\d+$/.test(raw)) throw new ConfigError(key, 'must be a whole number')
    return Number.parseInt(raw, 10)
  }
  const domain = mode === 'off' ? opt(env, 'SITE_MAIL_DOMAIN') : need(env, 'SITE_MAIL_DOMAIN')
  const key = opt(env, 'SITE_MAIL_KEY') ?? (mail.kind === 'resend' ? mail.key : null)
  if (mode === 'smtp' && !key)
    throw new ConfigError('SITE_MAIL_KEY', 'is required when SITE_MAIL=smtp and MAIL is not resend:<key>')
  const port = count('SITE_MAIL_SMTP_PORT', 465)
  if (port < 1 || port > 65535) throw new ConfigError('SITE_MAIL_SMTP_PORT', 'must be a TCP port')
  return {
    mode,
    domain: domain?.toLowerCase() ?? null,
    key,
    smtpHost: opt(env, 'SITE_MAIL_SMTP_HOST') ?? 'smtp.resend.com',
    smtpPort: port,
    globalDaily: count('SITE_MAIL_GLOBAL_DAILY', 50),
    siteHourly: count('SITE_MAIL_SITE_HOURLY', 10),
    siteDaily: count('SITE_MAIL_SITE_DAILY', 20),
    // Mode `tracy-domain` (`mail/site-mail/domains.js`): how many domains the Resend plan holds,
    // Tracy's own sending domains included (Free: 3) — checked before anything is created — and how
    // long a domain Tracy made may wait for its DNS before the release clock deletes it.
    domainLimit: count('SITE_MAIL_DOMAIN_LIMIT', 3),
    domainPendingDays: count('SITE_MAIL_DOMAIN_PENDING_DAYS', 3)
  }
}

function readHosts(env) {
  const names = need(env, 'HOSTS')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (names.length === 0) throw new ConfigError('HOSTS', 'must name at least one host')
  const demoNames = new Set((demoHostEntries(env) ?? []).map((d) => d.name))
  const hosts = new Map()
  for (const name of names) {
    // A host that only carries public demos runs no dsh: nobody holds a seat on a demo, so there
    // is no seat door to sign for. Its two dsh lines may be left out — both, never one, since half
    // a door is a door this process would sign for and then fail to reach. The default host, where
    // customers' sites go, always has them.
    const demoOnly = demoNames.has(name) && name !== names[0]
    const dshOrigin = demoOnly ? opt(env, `HOST_${name}_DSH_ORIGIN`) : need(env, `HOST_${name}_DSH_ORIGIN`)
    const seatSecret = demoOnly ? opt(env, `SEAT_${name}_SECRET`) : need(env, `SEAT_${name}_SECRET`)
    if ((dshOrigin === null) !== (seatSecret === null))
      throw new ConfigError(
        `HOST_${name}_DSH_ORIGIN`,
        `and SEAT_${name}_SECRET are set together or not at all`
      )
    hosts.set(name, {
      origin: need(env, `HOST_${name}_ORIGIN`).replace(/\/+$/, ''),
      dshOrigin: dshOrigin?.replace(/\/+$/, '') ?? null,
      hostSecret: need(env, `HOST_${name}_SECRET`),
      seatSecret
    })
  }
  return { hosts, defaultHost: names[0] }
}

/** `DEMO_HOSTS` as written: `name=What the screen shows, name2`, or null when unset. */
function demoHostEntries(env) {
  const raw = opt(env, 'DEMO_HOSTS')
  if (raw === null) return null
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const at = entry.indexOf('=')
      return {
        name: (at === -1 ? entry : entry.slice(0, at)).trim(),
        shown: at === -1 ? null : entry.slice(at + 1).trim() || null
      }
    })
}

/**
 * Which side of the shard model this process is (docs/sre/2026-10-15-shard-beta-design.md §1;
 * docs/sre/hop-dong-cua-shard.md §1, §9): `master` — every deployment before shards, and the
 * default — or `shard`. `config.deploymentRole` is the one key both halves read. Not `TRACY_ROLE`:
 * the `x-tracy-role` header the site door writes is a different thing with a near name.
 */
function readDeploymentRole(env) {
  const role = opt(env, 'TRACY_DEPLOYMENT_ROLE') ?? 'master'
  if (!['master', 'shard'].includes(role))
    throw new ConfigError('TRACY_DEPLOYMENT_ROLE', 'must be master or shard')
  return role
}

/**
 * `SHARDS=s1,s2` and, per name, `SHARD_<name>_ORIGIN`, `SHARD_<name>_SECRET` and
 * `SHARD_<name>_TUNNEL_ID` (optional `_PROVIDER`, `_REGION`, `_MAX_SITES`): the rows
 * `shards/store.js` writes into the `shard` table at every boot, env winning for these columns
 * (docs/sre/hop-dong-cua-shard.md §8). A SEED, not the list — the table is what every door reads,
 * and /ops › Shards › Add writes rows too — and never `HOSTS`: a shard is not a host this process
 * signs seat, cron or job calls for (spec §12 B, item 1).
 */
function readShardSeed(env) {
  const names = (opt(env, 'SHARDS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return names.map((name) => {
    if (!SHARD_NAME.test(name) || name === MASTER_SHARD)
      throw new ConfigError('SHARDS', `"${name}" must be a short lower-case name, and s0 is this master`)
    const origin = shardOriginOf(need(env, `SHARD_${name}_ORIGIN`))
    if (origin === null)
      throw new ConfigError(`SHARD_${name}_ORIGIN`, 'must be an http(s) origin with no path')
    const secret = need(env, `SHARD_${name}_SECRET`)
    if (!SHARD_SECRET.test(secret))
      throw new ConfigError(
        `SHARD_${name}_SECRET`,
        'must be 64 lower-case hex characters (openssl rand -hex 32)'
      )
    const tunnelId = need(env, `SHARD_${name}_TUNNEL_ID`).toLowerCase()
    if (!TUNNEL_ID.test(tunnelId))
      throw new ConfigError(`SHARD_${name}_TUNNEL_ID`, 'must be a tunnel id (uuid)')
    const region = opt(env, `SHARD_${name}_REGION`) ?? 'unknown'
    if (!SHARD_REGIONS.includes(region))
      throw new ConfigError(`SHARD_${name}_REGION`, `must be one of ${SHARD_REGIONS.join(', ')}`)
    const maxSites = Number(opt(env, `SHARD_${name}_MAX_SITES`) ?? 200)
    if (!Number.isSafeInteger(maxSites) || maxSites < 1)
      throw new ConfigError(`SHARD_${name}_MAX_SITES`, 'must be a positive integer')
    return { name, origin, secret, tunnelId, provider: opt(env, `SHARD_${name}_PROVIDER`), region, maxSites }
  })
}

/**
 * The token a master writes `<label>.<SITE_DOMAIN>` CNAMEs with (spec §3.2):
 * `CLOUDFLARE_DNS_ZONE_ID` and `CLOUDFLARE_DNS_TOKEN` (Zone › DNS › Edit on that zone only). Only a
 * master holds it. Both or neither: half a pair is null, and site events then record `pending`
 * until it is set — the hourly reconcile writes what is owed.
 */
function readShardDns(env) {
  const zoneId = opt(env, 'CLOUDFLARE_DNS_ZONE_ID')?.trim() ?? ''
  const token = opt(env, 'CLOUDFLARE_DNS_TOKEN')?.trim() ?? ''
  if (zoneId !== '' && !/^[0-9a-f]{32}$/i.test(zoneId))
    throw new ConfigError('CLOUDFLARE_DNS_ZONE_ID', 'must be a zone id (32 hex characters)')
  if (/\s/.test(token)) throw new ConfigError('CLOUDFLARE_DNS_TOKEN', 'must be one token, without spaces')
  if (zoneId === '' || token === '') return null
  return { zoneId: zoneId.toLowerCase(), token }
}

/**
 * Who a master may adopt onto a shard at sign-up (`SHARD_ADOPT_ALLOW`): `*` for everyone, else a
 * comma list of addresses and domains. Empty — the default — adopts nobody, so a shared dev master
 * keeps its people until someone names who goes. Only a NEW person is gated: somebody who already
 * lives on a shard is always handed back there.
 */
function readShardAdoptAllow(env) {
  const allow = { everyone: false, emails: [], domains: [] }
  const entries = (opt(env, 'SHARD_ADOPT_ALLOW') ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  for (const entry of entries) {
    if (entry === '*') allow.everyone = true
    else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry)) allow.emails.push(entry)
    else if (/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(entry)) allow.domains.push(entry)
    else throw new ConfigError('SHARD_ADOPT_ALLOW', `"${entry}" is not *, an address or a domain`)
  }
  return allow
}

/**
 * What a shard needs besides its role (shard beta, docs/sre/hop-dong-cua-shard.md §9): the master's
 * origin, the channel secret it signs with (`SHARD_SECRET`), its own session cookie name and an
 * optional site cap. The role is `readDeploymentRole`'s — read ONCE; this never reads
 * `TRACY_DEPLOYMENT_ROLE` itself. A shard never holds the Cloudflare for SaaS token (the master
 * registers its custom hostnames). A shard-only setting on the master is refused, never ignored.
 */
const SHARD_ONLY = ['MASTER_ORIGIN', 'SHARD_SECRET', 'SESSION_COOKIE_NAME', 'SHARD_MAX_SITES']
/** The sign-in provider settings contract §9 forbids on a shard. */
const MASTER_ONLY_SIGN_IN = [
  'GITHUB_OAUTH_CLIENT_ID',
  'GITHUB_OAUTH_CLIENT_SECRET',
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'JOOMLART_SSO_URL',
  'JOOMLART_SSO_SECRET',
  'JOOMLART_SSO_CLIENT'
]
function readShardNode(env, origin, role) {
  if (role !== 'shard') {
    const stray = SHARD_ONLY.find((key) => opt(env, key) !== null)
    if (stray) throw new ConfigError(stray, 'is read only with TRACY_DEPLOYMENT_ROLE=shard')
    return { shard: null, sessionCookieName: 'tracy_sess' }
  }
  const name = need(env, 'HOST_NAME')
  if (!SHARD_NAME.test(name) || name === MASTER_SHARD)
    throw new ConfigError(
      'HOST_NAME',
      'must be a shard name: a lower-case letter, then up to 15 letters or digits, not s0'
    )
  const rawMaster = need(env, 'MASTER_ORIGIN')
  let master
  try {
    master = new URL(rawMaster)
  } catch {
    throw new ConfigError('MASTER_ORIGIN', 'must be an http(s) origin')
  }
  if (!['http:', 'https:'].includes(master.protocol) || master.origin !== rawMaster.replace(/\/+$/, ''))
    throw new ConfigError('MASTER_ORIGIN', 'must be an http(s) origin with no path')
  if (master.origin === new URL(origin).origin)
    throw new ConfigError('MASTER_ORIGIN', 'must differ from TRACY_ORIGIN')
  const secret = need(env, 'SHARD_SECRET')
  // The one shape of a shard secret (`SHARD_SECRET` of lib/shard-shapes.js): 64 hex characters,
  // exactly what `openssl rand -hex 32` prints. No second regex here (contract §2).
  if (!SHARD_SECRET.test(secret))
    throw new ConfigError('SHARD_SECRET', 'must be 64 hex characters (openssl rand -hex 32)')
  const cookieName = `tracy_sess_${name}`
  if (opt(env, 'SESSION_COOKIE_NAME') !== cookieName)
    throw new ConfigError('SESSION_COOKIE_NAME', `must be ${cookieName} on shard ${name}`)
  for (const key of ['CLOUDFLARE_SAAS_ZONE_ID', 'CLOUDFLARE_SAAS_TOKEN'])
    if (opt(env, key) !== null)
      throw new ConfigError(key, 'is never set on a shard: the master registers its custom hostnames')
  // A shard signs nobody in (`shard/guard.js`): the provider secrets stay on the master (contract §9).
  for (const key of MASTER_ONLY_SIGN_IN)
    if (opt(env, key) !== null)
      throw new ConfigError(key, 'is never set on a shard: every sign-in happens at the master')
  const rawMax = opt(env, 'SHARD_MAX_SITES')
  const maxSites = rawMax === null ? null : Number(rawMax)
  if (maxSites !== null && (!Number.isSafeInteger(maxSites) || maxSites < 1))
    throw new ConfigError('SHARD_MAX_SITES', 'must be a positive integer')
  return { shard: { name, masterOrigin: master.origin, secret, maxSites }, sessionCookieName: cookieName }
}

/**
 * The hosts a demo may be put on, and the one it goes to when nobody chose (22/09: "assign
 * any demo to any server").
 *
 * `DEMO_HOSTS` lists them; unset, the list is the single `DEMO_HOST` this deployment always had, so
 * a stand that never heard of the list keeps behaving exactly as before.
 *
 * 🔒 EVERY NAME MUST BE ONE OF `HOSTS`. A demo host this process holds no signed channel to is a
 * choice the screen would offer and every press would then refuse; saying so at boot is cheaper
 * than finding out on a row. Same for a `DEMO_HOST` missing from the list: two settings disagreeing
 * about where a demo goes by default is not something to settle by picking one silently.
 *
 * @returns {{demoHost: string | null, demoHosts: {name: string, serverName: string, serverIp: string | null}[]}}
 */
function readDemoHosts(env) {
  const { hosts } = readHosts(env)
  const entries = demoHostEntries(env)
  const named = opt(env, 'DEMO_HOST')
  if (entries === null) {
    const demoHost = named ?? (hosts.has('demo') ? 'demo' : null)
    return {
      demoHost,
      demoHosts:
        demoHost === null
          ? []
          : [
              {
                name: demoHost,
                serverName: opt(env, 'DEMO_SERVER_NAME') ?? demoHost,
                serverIp: opt(env, 'DEMO_SERVER_IP')
              }
            ]
    }
  }
  if (entries.length === 0) throw new ConfigError('DEMO_HOSTS', 'must name at least one host when set')
  for (const { name } of entries)
    if (!hosts.has(name)) throw new ConfigError('DEMO_HOSTS', `"${name}" is not one of HOSTS`)
  if (named !== null && !entries.some((d) => d.name === named))
    throw new ConfigError('DEMO_HOST', `"${named}" is not one of DEMO_HOSTS`)
  const demoHost = named ?? entries[0].name
  return {
    demoHost,
    demoHosts: entries.map(({ name, shown }) => ({
      name,
      // The default host's name and address keep coming from the two settings that always
      // described it; any other host says who it is in its own entry.
      serverName: shown ?? (name === demoHost ? opt(env, 'DEMO_SERVER_NAME') : null) ?? name,
      serverIp: name === demoHost ? opt(env, 'DEMO_SERVER_IP') : null
    }))
  }
}

/**
 * The places a public demo can live, as a SERVER AND A DOMAIN TOGETHER.
 *
 * 🔒 THE PAIR IS THE UNIT, and not for tidiness. Until now the screen had one `host` and one
 * `zone`, so the address it drew could only be one machine's and there was nothing to confuse.
 * With two independent servers, a row that says only `ja-kinetic.demo.joomlart.com` does not tell
 * the person pressing Install WHICH MACHINE it lands on — and pressing on the wrong one answers
 * 200 and runs a job, which is exactly the silent shape this repo refuses elsewhere. So a target
 * carries `serverName` and `serverIp` for no other purpose than being shown (16/09).
 *
 * `tracy` is derived from what this deployment already declares, so a stand that only ever set
 * `DEMO_HOST` keeps working unchanged. `joomlart` appears only when `DEMO_JOOMLART_ZONE` is set:
 * a deployment that does not know about that machine must not draw a column for it.
 *
 * ⚠ `kind: 'record'` MEANS TRACY DOES NOT INSTALL THERE. `demo.joomlart.com` is 459 demos on a
 * machine Tracy did not build and does not run; this deployment only records the addresses it
 * already serves. An Install press on a `record` target is refused by name, never attempted.
 */
function readDemoTargets(env) {
  const host = readDemoHosts(env).demoHost
  // ⚠ A DEMO'S ADDRESS IS NOT ALWAYS `https://…/`. This deployment's own demos answer wherever
  // this deployment does — on a developer's machine that is `http://<label>.tracy.test:8080`, not
  // https on 443. Writing the scheme and port in by hand produced a link on the Demos screen that
  // opened nothing at all (measured 17/09: HTTP 000 against the address the row showed, 200
  // against the real one). Taken from `TRACY_ORIGIN`, which every environment already states
  // correctly for itself.
  let scheme = 'https'
  let port = ''
  try {
    const here = new URL(need(env, 'TRACY_ORIGIN'))
    scheme = here.protocol.replace(':', '')
    port = here.port ? `:${here.port}` : ''
  } catch {
    // An origin this process cannot parse is a problem `readConfig` reports elsewhere; a demo
    // address falling back to https is the same answer it gave before.
  }
  const targets = []
  if (host !== null)
    targets.push({
      name: 'tracy',
      kind: 'host',
      host,
      zone: need(env, 'SITE_DOMAIN'),
      scheme,
      port,
      serverName: opt(env, 'DEMO_SERVER_NAME') ?? host,
      serverIp: opt(env, 'DEMO_SERVER_IP') ?? null
    })
  const joomlartZone = opt(env, 'DEMO_JOOMLART_ZONE')
  if (joomlartZone)
    targets.push({
      name: 'joomlart',
      kind: 'record',
      host: null,
      zone: joomlartZone,
      // Somebody else's public server, always https on 443 — never this deployment's shape.
      scheme: 'https',
      port: '',
      serverName: opt(env, 'DEMO_JOOMLART_SERVER_NAME') ?? joomlartZone,
      serverIp: opt(env, 'DEMO_JOOMLART_SERVER_IP') ?? null,
      // How to ASK that machine what it serves — all four or none, like every other credential
      // block here. Half a login is a login this process cannot make, which is the same as none
      // except that it fails later and less clearly. Absent means the screen shows the addresses
      // it has recorded and says nothing about whether they are really there.
      ssh: readDemoSsh(env)
    })
  return targets
}

/**
 * The forced-command login on JoomlArt's demo server, or null.
 *
 * 🔒 THE KEY THIS NAMES CANNOT OPEN A SHELL. Its `authorized_keys` line carries
 * `command="/usr/local/bin/tracy-demo-provision"` with no pty and no forwarding, so it runs one
 * script and nothing else. That is what makes a credential for somebody else's production server
 * acceptable to hold here at all — it is not a root key with manners, it is a key that has no
 * other move. Rotating it is one line on that machine and one secret here.
 */
function readDemoSsh(env) {
  const host = opt(env, 'DEMO_JOOMLART_SSH_HOST')
  const user = opt(env, 'DEMO_JOOMLART_SSH_USER')
  const privateKey = opt(env, 'DEMO_JOOMLART_SSH_KEY')
  if (!host || !user || !privateKey) return null
  return {
    host,
    port: Number.parseInt(opt(env, 'DEMO_JOOMLART_SSH_PORT') ?? '22', 10) || 22,
    user,
    // A key pasted into an env file arrives with literal `\n`; a PEM with those in it is refused
    // by every SSH client, and the error names neither the file nor the reason.
    privateKey: privateKey.replace(/\\n/g, '\n')
  }
}

/**
 * The R2-compatible store artifact uploads (Migrate's import flow) sign into — ported from
 * `artifactStore(env)` in `workers/seat-registry/src/artifacts.js`, all four settings or none:
 * a store half-configured is a store this process cannot sign a single URL for correctly, so it
 * is treated the same as absent (`sites/route.js` answers `ARTIFACT_STORE_UNAVAILABLE`).
 */
export function readArtifactStore(env) {
  const endpoint = opt(env, 'ARTIFACT_S3_ENDPOINT')
  const bucket = opt(env, 'ARTIFACT_S3_BUCKET')
  const accessKey = opt(env, 'ARTIFACT_S3_ACCESS_KEY')
  const secretKey = opt(env, 'ARTIFACT_S3_SECRET_KEY')
  if (!endpoint || !bucket || !accessKey || !secretKey) return null
  const store = { endpoint: endpoint.replace(/\/+$/, ''), bucket, accessKey, secretKey }
  // Optional: the address a SOURCE site PUTs webroot parts to, when it cannot reach `endpoint`
  // (a local stand's MinIO at `host.docker.internal`, importing a site on the internet). Only
  // the `part` door signs with it (`storeForSource`); unset, every URL is signed as before.
  const publicEndpoint = opt(env, 'ARTIFACT_S3_PUBLIC_ENDPOINT')
  if (publicEndpoint) store.publicEndpoint = publicEndpoint.replace(/\/+$/, '')
  return store
}

/**
 * The read-only store the desktop app's update feed streams from (tasks/todo-desktop-auto-update.md):
 * its own bucket, `RELEASES_S3_BUCKET` (`tracy-releases`), on the same store as the artifacts unless
 * `RELEASES_S3_ENDPOINT`/`_ACCESS_KEY`/`_SECRET_KEY` say otherwise. Only `build/release.sh` of
 * `@tracy/desktop` writes to it, with its own key; tracy-web only reads. No bucket, no feed.
 */
function readReleaseStore(env) {
  const bucket = opt(env, 'RELEASES_S3_BUCKET')
  if (!bucket) return null
  const endpoint = opt(env, 'RELEASES_S3_ENDPOINT') ?? opt(env, 'ARTIFACT_S3_ENDPOINT')
  const accessKey = opt(env, 'RELEASES_S3_ACCESS_KEY') ?? opt(env, 'ARTIFACT_S3_ACCESS_KEY')
  const secretKey = opt(env, 'RELEASES_S3_SECRET_KEY') ?? opt(env, 'ARTIFACT_S3_SECRET_KEY')
  if (!endpoint || !accessKey || !secretKey) return null
  return { endpoint: endpoint.replace(/\/+$/, ''), bucket, accessKey, secretKey }
}

/**
 * The bucket every deployment shares for Website Opportunities place pictures (R2
 * `tracy-google-place-media`, tasks/plan-wo-shared-places.md §7), keys `media/…`
 * (`website-opportunities/src/place-media-store.js`). All four settings or none, and NO fallback to `ARTIFACT_S3_*`: a
 * stand must never write the shared bucket with its own store's credentials by accident. Unset:
 * place pictures stay in the artifact store under `places/…`, as before.
 */
export function readPlaceMediaStore(env) {
  const endpoint = opt(env, 'PLACE_MEDIA_S3_ENDPOINT')
  const bucket = opt(env, 'PLACE_MEDIA_S3_BUCKET')
  const accessKey = opt(env, 'PLACE_MEDIA_S3_ACCESS_KEY')
  const secretKey = opt(env, 'PLACE_MEDIA_S3_SECRET_KEY')
  if (!endpoint || !bucket || !accessKey || !secretKey) return null
  return { endpoint: endpoint.replace(/\/+$/, ''), bucket, accessKey, secretKey }
}

/**
 * The page that offers the Tracy Desktop installer (plan tasks/todo-quickstart-desktop-only.md):
 * the "Get Tracy Desktop" button the web template landing shows beside the quickstart download.
 * The WordPress site at tracy.ai/download/ picks the installer for the visitor's OS; a dev machine
 * may point at its own.
 */
function readDesktopDownloadUrl(env) {
  const raw = opt(env, 'DESKTOP_DOWNLOAD_URL') ?? 'https://tracy.ai/download/'
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new ConfigError('DESKTOP_DOWNLOAD_URL', `must be a URL with a scheme — got "${raw}"`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new ConfigError('DESKTOP_DOWNLOAD_URL', 'must be an http(s) URL')
  return url.toString()
}

/**
 * The desktop app's update host: `https://update.tracy.ai` in production. Empty means this
 * deployment serves no feed (`update` is a reserved site label either way). Same two
 * checks as `API_ORIGIN`: a URL with a scheme, and a hostname of its own.
 */
function readUpdateOrigin(env, origin) {
  const raw = opt(env, 'UPDATE_ORIGIN')
  if (raw === null) return null
  const updateOrigin = raw.replace(/\/+$/, '')
  let hostname
  try {
    hostname = new URL(updateOrigin).hostname.toLowerCase()
  } catch {
    throw new ConfigError(
      'UPDATE_ORIGIN',
      `must be a URL with a scheme, e.g. https://update.example.test — got "${raw}"`
    )
  }
  if (hostname === new URL(origin).hostname.toLowerCase())
    throw new ConfigError('UPDATE_ORIGIN', `must name a different hostname than TRACY_ORIGIN (${origin})`)
  return updateOrigin
}

/**
 * The GitHub App that gives every site its own private repo (Task 7, ADR 0025's "door 1" only —
 * this app never touches a customer-owned repo, so it carries no `HOST_ORG`-vs-customer split).
 * All four or none: a half-configured App can sign a JWT for the wrong org or mint a webhook
 * secret nobody validates against, so it is treated the same as absent — every GitHub door then
 * answers `GITHUB_NOT_CONFIGURED` and `createRepoFor` answers `NOT_CONFIGURED` without failing
 * the site that asked for a repo (spec §13.1: "no local GitHub → the site still finishes").
 */
function readGithub(env) {
  const appId = opt(env, 'GITHUB_APP_ID')
  const rawKey = opt(env, 'GITHUB_APP_PRIVATE_KEY')
  const org = opt(env, 'GITHUB_ORG')
  const webhookSecret = opt(env, 'GITHUB_WEBHOOK_SECRET')
  if (!appId || !rawKey || !org || !webhookSecret) return null
  // A .env file cannot hold a literal newline inside a plain (unquoted) value, so the private key
  // PEM is commonly written with `\n` escapes instead — restore them, but only when the value has
  // no real newline of its own (a quoted multi-line .env value, or a Worker-style secret, already
  // has one and must be left alone).
  const privateKey = rawKey.includes('\\n') && !rawKey.includes('\n') ? rawKey.replace(/\\n/g, '\n') : rawKey
  return { appId, privateKey, org, webhookSecret }
}

/**
 * The public Design inspiration page's model door (Task 3, ADR 0011). The Worker wrote a
 * visitor's words with `env.AI.run(...)` — a Cloudflare Workers AI binding this process has no
 * equivalent of — so here it is a bearer key plus an OpenAI-shaped endpoint instead:
 * `apiWords` (`public/design-page.js`) calls `${baseUrl}/chat/completions` itself. No
 * `MODEL_API_KEY` is the feature being off, not a reason to guess at some other credential — the
 * door answers 503 `MODEL_NOT_CONFIGURED` in that case, never a crash at boot.
 */
function readModel(env) {
  const apiKey = opt(env, 'MODEL_API_KEY')
  if (!apiKey) return null
  return {
    apiKey,
    baseUrl: (opt(env, 'MODEL_BASE_URL') ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, ''),
    words: opt(env, 'MODEL_WORDS') ?? 'meta-llama/llama-3.3-70b-instruct'
  }
}

/**
 * Voice input in the chat box (`speech/relay.js`): the speech service's key, as a FALLBACK. The key
 * is typed on /ops › Agents › Voice and saved sealed (`lib/speech.js`); this one is used only while
 * nothing is saved there. Only this process holds either — the browser streams its microphone to
 * `/api/speech/stream` and never sees a key or a token. Neither key is the feature being off:
 * `GET /api/speech` answers `available: false` and the chat box draws no microphone.
 */
function readSpeech(env) {
  const apiKey = opt(env, 'SPEECH_TO_TEXT_API_KEY')
  return apiKey ? { apiKey } : null
}

/**
 * How many voice sessions this process keeps open at once with each speech service (`speech/relay.js`
 * `sttSlots`, council 19/10/2026). One more ends as `provider-busy` at once instead of meeting the
 * service's own refusal mid-phrase. Default 4; raise it with the plan of the key in use.
 */
function readSpeechConcurrency(env) {
  const raw = opt(env, 'SPEECH_STT_MAX_CONCURRENT')
  if (raw === null) return 4
  const n = Number(raw)
  if (!Number.isSafeInteger(n) || n < 1)
    throw new ConfigError('SPEECH_STT_MAX_CONCURRENT', 'must be a positive integer')
  return n
}

/**
 * Sign in with Google or GitHub instead of a mailed code (Task 9). One `{id, secret}` per
 * provider, or absent — same all-or-nothing-per-provider shape as `readGithub`'s App, except here
 * the two providers are independent of each other: a deployment may light up only one.
 */
function readOAuth(env) {
  const oauth = {}
  const googleId = opt(env, 'GOOGLE_OAUTH_CLIENT_ID')
  const googleSecret = opt(env, 'GOOGLE_OAUTH_CLIENT_SECRET')
  if (googleId && googleSecret) oauth.google = { id: googleId, secret: googleSecret }
  const githubId = opt(env, 'GITHUB_OAUTH_CLIENT_ID')
  const githubSecret = opt(env, 'GITHUB_OAUTH_CLIENT_SECRET')
  if (githubId && githubSecret) oauth.github = { id: githubId, secret: githubSecret }
  return oauth
}

/**
 * Sign in with a JoomlArt account (plan `tasks/todo-tai-joomlart-qua-tracy.md`, B1): a signed
 * redirect to aMember's `joomlartsso` module and back, HMAC-SHA256 over a base64 payload, with
 * aMember as the identity provider. `JOOMLART_SSO_URL` is aMember's authorize door
 * (`https://www.joomlart.com/member/sso/v1/authorize`); `JOOMLART_SSO_SECRET` is the shared secret
 * aMember holds as `secret_tracy` (production) or `secret_tracy_dev` (every other deployment).
 *
 * Both empty = the door is off (`/signin/joomlart` answers 404). ONE of the two set is a
 * `ConfigError`, not "off": a URL with no secret would send a person to aMember and then be unable
 * to verify what comes back, and a secret with no URL would verify answers to a door nobody can
 * start. The OAuth pair above treats half a provider as absent; this one does not, because the
 * two halves live in two places (this env file and aMember's admin) and are set in one action.
 *
 * The `client` id Tracy names itself by at aMember is NOT configured here: it is derived from
 * `JOOMLART_SSO_CLIENT` (`tracy` on production, `tracy-dev` anywhere else — set, never guessed
 * = `tracy-dev`), because aMember binds each client to one fixed `return_url`, and that address is
 * this deployment's origin plus `/signin/joomlart/callback`. A deployment cannot claim a client
 * whose return address is not its own.
 */
function readJoomlartSso(env) {
  const authorizeUrl = opt(env, 'JOOMLART_SSO_URL')
  const secret = opt(env, 'JOOMLART_SSO_SECRET')
  if (!authorizeUrl && !secret) return null
  if (!authorizeUrl) throw new ConfigError('JOOMLART_SSO_URL', 'is required when JOOMLART_SSO_SECRET is set')
  if (!secret) throw new ConfigError('JOOMLART_SSO_SECRET', 'is required when JOOMLART_SSO_URL is set')
  let url
  try {
    url = new URL(authorizeUrl)
  } catch {
    throw new ConfigError('JOOMLART_SSO_URL', 'must be an absolute URL')
  }
  // The browser is sent to this URL with a signed request and comes back with a signed answer, so
  // HTTPS is what keeps the two from being read on the way. The one exception is a stand on this
  // machine (`isLocalHttpOrigin`), where a fake aMember on loopback plays the IdP for E2E.
  const origin = opt(env, 'TRACY_ORIGIN') ?? ''
  if (url.protocol !== 'https:' && !(origin && isLocalHttpOrigin(origin)))
    throw new ConfigError('JOOMLART_SSO_URL', 'must use HTTPS')
  // Which client this deployment is at aMember — each has its own secret and its own fixed
  // callback there (`tracy` → cowork.tracy.ai, `tracy-dev` → cowork.tracy.site). Said outright
  // rather than guessed from the origin: a guess that is right on production and wrong elsewhere
  // is the exact mistake `scripts/check-origins.ts` exists to catch.
  const client = opt(env, 'JOOMLART_SSO_CLIENT')
  if (client !== 'tracy' && client !== 'tracy-dev')
    throw new ConfigError('JOOMLART_SSO_CLIENT', 'must be `tracy` (production) or `tracy-dev`')
  return { authorizeUrl, secret, client }
}

/** A stand on this machine: plain HTTP on loopback or the local `tracy.test` zone, nothing public. */
function isLocalHttpOrigin(origin) {
  const url = new URL(origin)
  const local =
    ['localhost', '127.0.0.1', '[::1]', 'tracy.test'].includes(url.hostname) ||
    url.hostname.endsWith('.tracy.test')
  return local && url.protocol === 'http:'
}

/**
 * Where a dev stand keeps quickstart packs not published yet (`lib/local-releases.js`), or null.
 *
 * 🔒 REFUSED AT BOOT OUTSIDE A LOCAL STAND, the way `LOCAL_LOGIN_PREVIEW` is. A pack is offered to
 * customers as a card and installed from this machine's disk with no release behind it; on a
 * server that is a site built from bytes nobody published. Absolute, because the same path is
 * mounted into `tracy-host`, which must find the file at the address this process writes.
 */
function readLocalReleasesDir(env, origin) {
  const dir = opt(env, 'TRACY_LOCAL_RELEASES_DIR')
  if (dir === null) return null
  if (!dir.startsWith('/') || !isLocalHttpOrigin(origin) || env.NODE_ENV === 'production')
    throw new ConfigError(
      'TRACY_LOCAL_RELEASES_DIR',
      'requires an absolute path, a local HTTP origin and a non-production runtime'
    )
  return dir.replace(/\/+$/, '')
}

/**
 * The comment picker's two switches (plan `tasks/todo-comment-to-edit.md` §S). Both are explicit
 * affirmatives (`1`), off by default: stage 1 runs on dev only, never on production.
 *
 * - `TRACY_COMMENT_PICKER=1` turns the feature on: the ticket door exists and the site proxy reads
 *   tickets and continuation cookies. Off, the door answers 404 and the proxy ignores both.
 * - `TRACY_COMMENT_PICKER_INSECURE_DEV=1` lets a plain-HTTP stand redeem without Fetch Metadata,
 *   which a browser sends only to potentially trustworthy (https or loopback) URLs. 🔒 Refused at
 *   boot outside a local HTTP stand, the way `LOCAL_LOGIN_PREVIEW` is: on https the
 *   `Sec-Fetch-Dest: iframe` check is the thing that keeps the picker out of dsh's server-side
 *   `/sidebar/frame`, and no server needs a way to turn it off.
 */
function readCommentPicker(env, origin) {
  const commentPickerInsecureDev = opt(env, 'TRACY_COMMENT_PICKER_INSECURE_DEV') === '1'
  if (commentPickerInsecureDev && (!isLocalHttpOrigin(origin) || env.NODE_ENV === 'production')) {
    throw new ConfigError(
      'TRACY_COMMENT_PICKER_INSECURE_DEV',
      'requires a local HTTP origin and a non-production runtime'
    )
  }
  return { commentPicker: opt(env, 'TRACY_COMMENT_PICKER') === '1', commentPickerInsecureDev }
}

/** The MCP resource shares the application origin unless an explicit origin is configured. */
function readMcpOrigin(env) {
  const raw = opt(env, 'MCP_ORIGIN')
  if (raw === null) return null
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new ConfigError('MCP_ORIGIN', 'must be an HTTP(S) origin')
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new ConfigError(
      'MCP_ORIGIN',
      'must be an HTTP(S) origin without credentials, path, query or fragment'
    )
  for (const [key, other] of [
    ['DOCS_ORIGIN', opt(env, 'DOCS_ORIGIN')],
    ['UPDATE_ORIGIN', opt(env, 'UPDATE_ORIGIN')]
  ])
    if (other && url.host.toLowerCase() === new URL(other).host.toLowerCase())
      throw new ConfigError('MCP_ORIGIN', `must name a different host than ${key}`)
  return url.origin
}

/**
 * The public API host (tasks/todo-api-public.md S2): `https://api.tracy.ai` in production,
 * `https://api.tracy.site` on the dev machine, `http://api.tracy.test:51710` on a laptop. Empty
 * means this deployment has no API host — every hostname behaves as it did before the key existed.
 *
 * Set, it must parse as a URL (a bare hostname is the likely slip, and `new URL('api.tracy.ai')`
 * throws) and its hostname must differ from `TRACY_ORIGIN`'s: `bar/route.js`'s `hostKind` reads
 * `{kind: 'api'}` from it, and the same hostname for both would turn Tracy's whole surface into
 * the API host's 404 allowlist at the first request, with nothing in a log saying why.
 */
function readApiOrigin(env, origin) {
  const raw = opt(env, 'API_ORIGIN')
  if (raw === null) return null
  const apiOrigin = raw.replace(/\/+$/, '')
  let hostname
  try {
    hostname = new URL(apiOrigin).hostname.toLowerCase()
  } catch {
    throw new ConfigError(
      'API_ORIGIN',
      `must be a URL with a scheme, e.g. https://api.example.test — got "${raw}"`
    )
  }
  if (hostname === new URL(origin).hostname.toLowerCase())
    throw new ConfigError(
      'API_ORIGIN',
      `must name a different hostname than TRACY_ORIGIN (${origin}) — the API host answers only /v1, /docs and /health`
    )
  return apiOrigin
}

/**
 * The documentation host (`apps/tracy-docs`, served at the ROOT of its own hostname):
 * `https://docs.tracy.ai` in production, `https://docs.tracy.site` on the dev machine,
 * `http://docs.tracy.test:8080` on the local stand. `app.js` serves the site there and nowhere else;
 * Tracy's own hostname and the API host send `/docs/*` to it with a 302.
 *
 * Required once this process carries the built site (`docsBuilt`: `server.js` asks whether
 * `static/docs` holds an `index.html`). The site is built for `base: '/'`, so it cannot be served
 * under `/docs` of another hostname any more: an image with the site and no docs host would answer
 * every reader with pages whose every asset is missing. Refused at boot, by name, instead.
 *
 * Set, the same checks as `API_ORIGIN`: a URL with a scheme, and a hostname of its own — not
 * Tracy's, not the API host's, not the update host's (each of those hostnames has its own gate in
 * `app.js`, and two gates on one hostname would turn one surface into the other's allowlist).
 */
function readDocsOrigin(env, { origin, apiOrigin, updateOrigin, docsBuilt }) {
  const raw = opt(env, 'DOCS_ORIGIN')
  if (raw === null) {
    if (docsBuilt)
      throw new ConfigError(
        'DOCS_ORIGIN',
        'is required: this image carries the documentation site (static/docs), which is served only at the root of its own host, e.g. https://docs.example.test'
      )
    return null
  }
  const docsOrigin = raw.replace(/\/+$/, '')
  let hostname
  try {
    hostname = new URL(docsOrigin).hostname.toLowerCase()
  } catch {
    throw new ConfigError(
      'DOCS_ORIGIN',
      `must be a URL with a scheme, e.g. https://docs.example.test — got "${raw}"`
    )
  }
  for (const [key, other] of [
    ['TRACY_ORIGIN', origin],
    ['API_ORIGIN', apiOrigin],
    ['UPDATE_ORIGIN', updateOrigin]
  ])
    if (other && hostname === new URL(other).hostname.toLowerCase())
      throw new ConfigError('DOCS_ORIGIN', `must name a different hostname than ${key} (${other})`)
  return docsOrigin
}

/**
 * @param {object} env - the process environment (or a test's stand-in).
 * @param {{ docsBuilt?: boolean }} [options] - `docsBuilt`: this process carries the built
 *   documentation site, which makes `DOCS_ORIGIN` required (`readDocsOrigin`).
 */
/** Explicit personal installation mode; never inferred from a request hostname. */
function readLocalAccess(env, origin) {
  const mode = opt(env, 'TRACY_MODE') ?? 'cloud'
  if (!['cloud', 'local'].includes(mode)) throw new ConfigError('TRACY_MODE', 'must be cloud or local')
  if (mode !== 'local') return null
  const url = new URL(origin)
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.origin !== origin ||
    opt(env, 'TRACY_ENVIRONMENT') !== 'local' ||
    opt(env, 'SESSION_DOMAIN') ||
    need(env, 'SITE_DOMAIN') !== 'localhost'
  )
    throw new ConfigError(
      'TRACY_MODE',
      'local requires a loopback HTTP origin, local environment, localhost sites and host-only cookies'
    )
  const secret = need(env, 'LOCAL_ACCESS_SECRET')
  const installationId = need(env, 'LOCAL_INSTALLATION_ID')
  if (!/^[a-f0-9]{64}$/.test(secret))
    throw new ConfigError('LOCAL_ACCESS_SECRET', 'must be 32 random bytes encoded as hex')
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(installationId))
    throw new ConfigError('LOCAL_INSTALLATION_ID', 'must be a UUID v4 generated for this installation')
  if (secret === need(env, 'SESSION_SECRET'))
    throw new ConfigError('LOCAL_ACCESS_SECRET', 'must differ from SESSION_SECRET')
  need(env, 'DATABASE_URL')
  return { secret, installationId }
}

/**
 * `TEMPLATES_PUBLIC_ORIGIN`: the address the public Templates pages state for themselves (canonical,
 * sitemap, llms.txt, JSON-LD), for when a proxy on another host serves `/templates/*`, for example
 * `https://tracy.ai`. Empty = `https://tracy.ai` on the production deployment (`TRACY_ORIGIN` is
 * `https://cowork.tracy.ai`), whose Worker serves the pages there; `TRACY_ORIGIN` everywhere else.
 * Only the app's own links (build, Get Started, pictures, probe) keep pointing at `TRACY_ORIGIN`.
 */
function readTemplatesPublicOrigin(env, origin) {
  const raw = opt(env, 'TEMPLATES_PUBLIC_ORIGIN')
  // The same two origins `public/templates-indexing.js` names; not imported, so this file keeps reading
  // only `lib/` (a source-free checkout copies config.js with its lib imports alone, test/design-assets).
  if (raw === null) return origin === 'https://cowork.tracy.ai' ? 'https://tracy.ai' : origin
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new ConfigError('TEMPLATES_PUBLIC_ORIGIN', 'must be an http(s) origin such as https://tracy.ai')
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.origin !== raw.replace(/\/+$/, ''))
    throw new ConfigError('TEMPLATES_PUBLIC_ORIGIN', 'must be an origin only: scheme and host, no path')
  return url.origin
}

export function readConfig(env, { docsBuilt = false } = {}) {
  const origin = need(env, 'TRACY_ORIGIN').replace(/\/+$/, '')
  // First, before the hosts: a shard's name is its HOST_NAME, and a wrong one is named as that.
  const node = readShardNode(env, origin, readDeploymentRole(env))
  const keyRoot = opt(env, 'INVITATIONS_REAL_KEY_DIR')
  if (keyRoot && (!isAbsolute(keyRoot) || resolve(keyRoot) !== keyRoot || parse(keyRoot).root === keyRoot)) {
    throw new ConfigError('INVITATIONS_REAL_KEY_DIR', 'must be a canonical absolute private directory')
  }
  const invitationsReal = {
    keyRoot,
    enabled: Boolean(
      keyRoot &&
        ((opt(env, 'TRACY_ENVIRONMENT') === 'local' && isLocalHttpOrigin(origin)) ||
          (opt(env, 'TRACY_ENVIRONMENT') === 'dev' && origin === 'https://cowork.tracy.site'))
    )
  }
  const mail = readMail(env)
  const invitationsSandbox = opt(env, 'INVITATIONS_SANDBOX_ENABLED') === '1'
  const invitationsGmail = {
    clientId: opt(env, 'INVITATIONS_GMAIL_CLIENT_ID'),
    clientSecret: opt(env, 'INVITATIONS_GMAIL_CLIENT_SECRET'),
    keyId: opt(env, 'INVITATIONS_GMAIL_KEY_ID'),
    key: opt(env, 'INVITATIONS_GMAIL_KEY'),
    // The one mailbox invitations are sent from; OAuth must sign in as exactly this address.
    address: opt(env, 'INVITATIONS_GMAIL_ADDRESS')?.toLowerCase()
  }
  if (invitationsGmail.key && Buffer.from(invitationsGmail.key, 'base64').length !== 32)
    throw new ConfigError('INVITATIONS_GMAIL_KEY', 'must be a base64-encoded 32-byte key')
  if (
    Object.values(invitationsGmail).some(Boolean) &&
    (!invitationsSandbox || !Object.values(invitationsGmail).every(Boolean))
  )
    throw new ConfigError('INVITATIONS_GMAIL_CLIENT_ID', 'requires the sandbox and all five Gmail settings')
  // Real campaign test sends: only to the server-held list below, only where real campaigns are
  // enabled (local or the dev machine). Anywhere else the switch reads as off, whatever is set, so a
  // copied env file cannot open sending on staging or production. Customers are never addressed
  // through this mode.
  // `pilot` = everything `test` does, plus sending an approved invitation to its own customer, one
  // press at a time, at most INVITATIONS_PILOT_MAX customers, membership checked with aMember first.
  const sendingMode = opt(env, 'INVITATIONS_SENDING') ?? 'off'
  if (!['off', 'test', 'pilot'].includes(sendingMode))
    throw new ConfigError('INVITATIONS_SENDING', 'must be off, test or pilot')
  const testRecipients = [
    ...new Set(
      (opt(env, 'INVITATIONS_TEST_RECIPIENTS') ?? '')
        .split(',')
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean)
    )
  ]
  if (testRecipients.some((a) => !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(a)))
    throw new ConfigError('INVITATIONS_TEST_RECIPIENTS', 'must be comma-separated email addresses')
  const testDailyLimit = Number(opt(env, 'INVITATIONS_TEST_DAILY_LIMIT') ?? 50)
  if (!Number.isSafeInteger(testDailyLimit) || testDailyLimit < 1 || testDailyLimit > 500)
    throw new ConfigError('INVITATIONS_TEST_DAILY_LIMIT', 'must be an integer from 1 to 500')
  // Default above the largest campaign (1,340 on 07/10/2026): the 180 s pacing, not this cap, sets the
  // daily volume (at most about 480 a day). The cap stays as a stop for an approval made by mistake.
  const pilotMax = Number(opt(env, 'INVITATIONS_PILOT_MAX') ?? 2000)
  if (!Number.isSafeInteger(pilotMax) || pilotMax < 1 || pilotMax > 10000)
    throw new ConfigError('INVITATIONS_PILOT_MAX', 'must be an integer from 1 to 10000')
  // Pilot without the aMember key falls back to test sending and names what is missing (shown on
  // /ops), rather than stopping the whole server at boot.
  const pilotMissing = sendingMode === 'pilot' && !opt(env, 'AMEMBER_API_KEY') ? ['AMEMBER_API_KEY'] : []
  const usable = invitationsReal.enabled && testRecipients.length && invitationsGmail.clientId
  const wanted = sendingMode === 'pilot' && pilotMissing.length ? 'test' : sendingMode
  const invitationsSending = {
    mode: usable && ['test', 'pilot'].includes(wanted) ? wanted : 'off',
    pilotMissing,
    testRecipients,
    testDailyLimit,
    pilotMax,
    // Minimum gap between two customer invitations from the mailbox (spec: 180 to 300 s).
    pacingSeconds: 180
  }
  if (
    invitationsSandbox &&
    !(
      (opt(env, 'TRACY_ENVIRONMENT') === 'local' && isLocalHttpOrigin(origin)) ||
      (opt(env, 'TRACY_ENVIRONMENT') === 'dev' && origin === 'https://cowork.tracy.site')
    )
  ) {
    throw new ConfigError(
      'INVITATIONS_SANDBOX_ENABLED',
      'requires an explicit local or dev deployment and its matching origin'
    )
  }
  const localLoginPreview = opt(env, 'LOCAL_LOGIN_PREVIEW') === '1'
  if (localLoginPreview) {
    const url = new URL(origin)
    const localPreviewOrigin =
      isLocalHttpOrigin(origin) || (url.protocol === 'https:' && url.hostname === 'tracy.test')
    if (!localPreviewOrigin || mail.kind !== 'console' || env.NODE_ENV === 'production') {
      throw new ConfigError(
        'LOCAL_LOGIN_PREVIEW',
        'requires a local HTTP origin or HTTPS tracy.test, console mail and a non-production runtime'
      )
    }
  }
  const localReleasesDir = readLocalReleasesDir(env, origin)
  // Local review mode (`lib/local-review.js`): only on a stand that reads local packs, which is itself
  // refused off a local HTTP origin and on production.
  const localReview = opt(env, 'TRACY_LOCAL_REVIEW') === '1'
  if (localReview && localReleasesDir === null)
    throw new ConfigError('TRACY_LOCAL_REVIEW', 'requires TRACY_LOCAL_RELEASES_DIR (a local stand)')
  return {
    origin,
    templatesPublicOrigin: readTemplatesPublicOrigin(env, origin),
    localAccess: readLocalAccess(env, origin),
    invitationsReal,
    invitationsSandbox,
    invitationsGmail,
    invitationsSending,
    beta: readBeta(env, origin),
    telegram: readTelegram(env),
    csTelegram: readCsTelegram(env),
    discord: readDiscord(env),
    woPlacesIngest: readWoPlacesIngest(env, readDeploymentRole(env)),
    secure: origin.startsWith('https://'),
    // The public API host, or null (`readApiOrigin`). `lib/api-host.js` is the one reader of it.
    apiOrigin: readApiOrigin(env, origin),
    mcpOrigin: readMcpOrigin(env),
    mcpChallenge: opt(env, 'MCP_OPENAI_CHALLENGE'),
    // The desktop app's update host, or null (`readUpdateOrigin`); `lib/update-host.js` reads it.
    updateOrigin: readUpdateOrigin(env, origin),
    // Where the web sends a person for the app (`readDesktopDownloadUrl`).
    desktopDownloadUrl: readDesktopDownloadUrl(env),
    // The documentation host, or null (`readDocsOrigin`); `lib/docs-host.js` reads it.
    docsOrigin: readDocsOrigin(env, {
      origin,
      apiOrigin: readApiOrigin(env, origin),
      updateOrigin: readUpdateOrigin(env, origin),
      docsBuilt
    }),
    siteDomain: need(env, 'SITE_DOMAIN'),
    // Extra suffixes a browser may arrive under besides `siteDomain` itself — the local compose
    // lane's dnsmasq alias (`tracy.test`, spec §13.4) is the only one today. Comma-separated,
    // empty means none. Read here (Task 11) so `/api/config` can hand it to a plugin instead of
    // the plugin guessing from `location.hostname`.
    siteDomainAliases: (opt(env, 'SITE_DOMAIN_ALIASES') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // The port THIS process itself publishes locally — a local site has no ingress of its own
    // yet (Plan 3's job), so `http://<label>.<siteDomain>:<siteHttpPort>/` is the only address a
    // browser can currently reach it at, and it is this same process that answers on it (Task 1:
    // Host-based routing in `bar/route.js` makes tracy-web the front door for site hostnames
    // too). Defaults to `PORT`'s own default (`server.js`) so a deployment that never sets this
    // still gets the right answer.
    siteHttpPort: opt(env, 'SITE_HTTP_PORT') ?? '8080',
    // What a fleet-born site's address gets in FRONT of the name a person typed — `''` on
    // production, `dev-` on a dev deployment. Ported from `SITE_ADDRESS_PREFIX`
    // (`workers/seat-registry/src/index.js:1163`), and the reasoning ports with it:
    //
    // 🔒 IT GOES INTO THE ADDRESS, NOT INTO THE NAME SOMEBODY TYPED. A person types `bao-cao`;
    // dev hands them `dev-bao-cao.tracy.ai`, and `siteLabelRefusal` still judges the name they
    // actually typed. Making them type `dev-` themselves pushes a detail of the environment onto
    // someone who does not care about it, and gives one site two different names depending on
    // where it was created.
    //
    // ⚠ WHY A PREFIX AND NOT A ZONE OF ITS OWN. `dev.tracy.ai` is a two-level name, and
    // Cloudflare's Universal certificate covers `tracy.ai` + `*.tracy.ai` only. Measured 07/09
    // and again 10/09: Cloudflare refuses the TLS handshake outright for a two-level SNI — no
    // certificate at all, not a wrong one. `dev-<label>.tracy.ai` is one level, inside the
    // wildcard, works today and costs nothing.
    siteAddressPrefix: opt(env, 'SITE_ADDRESS_PREFIX') ?? '',
    // The resolver a site's own domain is read with (`sites/address.js`): `ip[:port]`, several
    // separated by commas. Unset = the machine's own resolver. A local stand names the one that
    // serves the zone it owns, so no check of a test domain ever reaches the internet's DNS.
    dnsResolver: dnsResolver(env),
    // How the HTTPS probe of a customer's own domain dials (`sites/domain-probe.js`). Empty on
    // every server: only public addresses, port 443. A local stand, whose TLS front is a container
    // on a private network, names its own; refused in production.
    ownDomainProbe: ownDomainProbe(env),
    // Cloudflare for SaaS: the custom hostnames that serve customers' own domains
    // (`sites/site-domain-provider.js`). Null: connecting a new domain is not available here.
    customHostnames: node.shard ? { brokered: true } : readCustomHostnames(env),
    // The zone's own names for that: the CNAME target and the fallback origin. Never site labels.
    ownDomainLabels: readOwnDomainLabels(env),
    // Which deployment this is, as the warm-inventory pool key spells it
    // (`lib/inventory-pool-key.js`). It is NOT cosmetic: a pool key that did not carry it would
    // let a dev stand and production share one key, and stock prepared on one would look like
    // supply for the other. `local` is the honest default for a laptop — the stands that matter
    // (`dev`, `prod`) name themselves in `deploy/.env`.
    environment: opt(env, 'TRACY_ENVIRONMENT') ?? 'local',
    // Shard beta: the shard's channel to the master (null on the master), and the session cookie
    // name this deployment WRITES (`lib/session.js` reads it and `tracy_sess`; `signOutCookies`
    // clears it).
    shard: node.shard,
    sessionCookieName: node.sessionCookieName,
    sessionDomain: opt(env, 'SESSION_DOMAIN'),
    sessionSecret: need(env, 'SESSION_SECRET'),
    databaseUrl: opt(env, 'DATABASE_URL'),
    mail,
    siteMail: readSiteMail(env, mail),
    localLoginPreview,
    ...readHosts(env),
    // The shard beta (docs/sre/2026-10-15-shard-beta-design.md): which side this process is, the
    // seed of the `shard` table, the DNS token only a master holds, and who may be adopted.
    deploymentRole: readDeploymentRole(env),
    shardSeed: readShardSeed(env),
    shardDns: readShardDns(env),
    shardAdoptAllow: readShardAdoptAllow(env),
    actorSecret: opt(env, 'MCP_TRACY_ACTOR_SECRET'),
    seatPlanKek: opt(env, 'SEAT_PLAN_KEK'),
    github: readGithub(env),
    // How this deployment reads JoomlArt-Products/joomlart-products when it has no App key of its own (a
    // developer's stand, ADR 0017) or its App is not installed there (a shard's own App).
    // Production mints a repo-scoped token from its App instead.
    releasesToken: opt(env, 'TRACY_RELEASES_GITHUB_TOKEN'),
    ciToken: opt(env, 'TRACY_CI_GITHUB_TOKEN'),
    // The repository the /ops CI dashboard reads (lib/source-repository.js).
    sourceRepo: readSourceRepository(opt(env, 'TRACY_SOURCE_REPO')),
    localReleasesDir,
    localReview,
    // Where the Customize your site check downloads a release's files while it runs, deleted after
    // each check (`lib/customize-readiness.js`). Unset: the system's temporary folder.
    readinessDir: opt(env, 'TRACY_READINESS_DIR'),
    oauth: readOAuth(env),
    joomlartSso: readJoomlartSso(env),
    backupExport: readBackupExport(env),
    usageTextReaders: readUsageTextReaders(env),
    // Which of `hosts` THIS process runs beside — a site whose `site.host` equals this is one
    // `siteTarget` (sites/resolver.js) reaches over the host's own docker network
    // (`<label>-web-1`, ADR 0014 §2); any other site is reached over the public address instead.
    // Empty means "not co-located with any host" — every site then takes the remote branch.
    hostName: opt(env, 'HOST_NAME'),
    // Where each co-located site's access key is read, `<dir>/<label>/key.json` (mounted read-only
    // from the host's `$TRACY_PRIVATE_ROOT/.site-access`; `tools/issue-site-access-key.sh` writes it).
    // Unset or absent: sites are sent no signed assertion, and a strict verifier signs nobody in.
    siteAccessDir: opt(env, 'TRACY_SITE_ACCESS_DIR') || '/var/lib/tracy/site-access',
    // The host public quickstart demos are put on (`ops/demos.js`): named outright, else the one
    // called `demo` when this deployment has it, else none — a server with no demo host says so
    // rather than putting a demo beside customers' sites.
    ...readDemoHosts(env),
    demoTargets: readDemoTargets(env),
    artifactStore: readArtifactStore(env),
    releaseStore: readReleaseStore(env),
    placeMediaStore: readPlaceMediaStore(env),
    // The site a stranger at the bare root is shown — `workers/cowork-web/src/worker.js`'s
    // `GUEST_SITE_KEY`, ported under the same name. Empty means no public landing: a signed-out
    // visitor at `/` goes to `/login` instead (`workspace/route.js`).
    guestSiteKey: opt(env, 'GUEST_SITE_KEY'),
    // Where, INSIDE the default host's dsh container, a signed-in viewer's own creation workspace
    // is made (`workspace/scope.js`): the seat door makes `<root>/<account name>` under it and
    // grants exactly that folder. A path in the container, never on the machine running this
    // process — the two are different filesystems on a fleet host. The default is the image's
    // persistent home (`packages/fleet/tracy-fleet-operation/dsh/entrypoint.sh` makes it); a
    // deployment whose dsh keeps its home elsewhere names its own.
    onboardingHome: opt(env, 'ONBOARDING_HOME') ?? '/desk-home/onboarding',
    // Task 3: the public Design inspiration page's model door and its Turnstile secret — both
    // absent by default (feature off), never a fallback to some other key.
    model: readModel(env),
    // A stand on this machine (plain http on tracy.test or loopback, never production): the one
    // place a site's own address is http, so the doors that insist on https for a customer's live
    // site accept http://<label>.tracy.test there (an imported test site is one of the stand's own).
    localStand: isLocalHttpOrigin(origin) && env.NODE_ENV !== 'production',
    // Voice input in the chat box: absent by default (feature off), like `model`.
    speech: readSpeech(env),
    speechSttMaxConcurrent: readSpeechConcurrency(env),
    turnstileSecret: opt(env, 'TURNSTILE_SECRET'),
    // Missing config must never read as an open door (CLAUDE.md §6, the `seat-door` gate's own
    // rule) — a public, unauthenticated page is exactly the case that rule exists for. So an
    // absent `turnstileSecret` fails CLOSED (`public/design-page.js`'s `verifyTurnstile` refuses),
    // and the ONLY way past that for a lane that has no Turnstile secret (local dev, a test lane)
    // is this NAMED, explicit flag — never inferred from the secret's mere absence. An explicit
    // affirmative only: `opt(env, …) !== null` would have read `TURNSTILE_DISABLED=false` as
    // enabled (any non-empty string is non-null), turning the one escape hatch into a footgun that
    // fires on the exact value meant to keep verification on.
    turnstileDisabled: ['1', 'true'].includes((opt(env, 'TURNSTILE_DISABLED') ?? '').toLowerCase()),
    // The seat pill's script. Since 19/09 this app serves it itself (`badge/route.js`'s
    // `/badge.js`, read from `badge_setting`), so the default is this deployment's own door and the
    // last Cloudflare address a customer's page fetched is gone. `BADGE_URL` still overrides, except
    // when it names the retired Worker script — see `readBadgeUrl`.
    badgeUrl: readBadgeUrl(env, origin),
    // Task 11: the one remaining "fact about the company" a plugin used to write as a literal
    // (`tracy-add-site`'s fork/import zone checks, `github/route.js`'s shared-repo allowlist). The
    // SAME in every deployment this repository runs in, so a default here, not a `need()`, is
    // correct. `check-origins.ts` exempts this file BY NAME for exactly this reason.
    hostOrg: opt(env, 'HOST_ORG') ?? 'TracyHQ',
    // What seat keys are hashed with (`lib/api-key.js`, `tasks/todo-api-public.md` S1). Optional,
    // NOT a `need()`: every deployment before 28/09 runs without it, and a missing pepper is "seat
    // keys off" — the `/api/me/keys` doors refuse `API_KEYS_NOT_CONFIGURED` (503) and no Bearer
    // verifies — never a door left open. Rotating it invalidates every key at once.
    apiKeyPepper: opt(env, 'API_KEY_PEPPER'),
    // Website Opportunities' social connectors (Facebook, Instagram, TikTok, YouTube through Apify)
    // and optional environment fallbacks for search/crawl/places providers when not sealed in wo_ops_setting.
    // Absent = those sources report `blocked: credential_missing`; never logged, never sent to a browser.
    apifyToken: opt(env, 'APIFY_TOKEN'),
    serpapiApiKey: opt(env, 'SERPAPI_API_KEY'),
    litescrapeApiKey: opt(env, 'LITESCRAPE_API_KEY'),
    deepseekApiKey: opt(env, 'DEEPSEEK_API_KEY'),
    firecrawlApiKey: opt(env, 'FIRECRAWL_API_KEY'),
    jinaApiKey: opt(env, 'JINA_API_KEY'),
    googleApiKey: opt(env, 'GOOGLE_API_KEY') ?? opt(env, 'GOOGLE_PLACES_API_KEY'),
    // One RapidAPI application key for every social-stats listing (`website-opportunities/src/social-stats.js`).
    rapidapiKey: opt(env, 'RAPIDAPI_KEY'),
    // Public social-data API used as the first tier by the Website Opportunities social stats chain.
    scrapeCreatorsApiKey: opt(env, 'SCRAPECREATORS_API_KEY'),
    // Shared social is opt-in; standalone preserves existing deployments until an explicit cutover.
    ...readSocialService(env),
    // Website Opportunities research shared across accounts (`website-opportunities/src/place-requests.js`). ON unless
    // `WO_SHARED_RESEARCH=0` (or false/off): off, a new request runs the per-account research as before,
    // place jobs are no longer claimed, and what places already published stays readable.
    woSharedResearch: !['0', 'false', 'off'].includes((opt(env, 'WO_SHARED_RESEARCH') ?? '').toLowerCase()),
    // Site checks read a homepage that refused Node again with Chrome's TLS fingerprint
    // (`website-opportunities/src/escalating-fetch.js`). OFF unless `WO_SITE_READ_TLS=on` (or 1/true).
    woSiteReadTls: ['1', 'true', 'on'].includes((opt(env, 'WO_SITE_READ_TLS') ?? '').toLowerCase()),
    ...readCommentPicker(env, origin)
  }
}
