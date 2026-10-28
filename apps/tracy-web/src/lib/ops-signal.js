import { vietnamDay, withDeadline } from './beta-access.js'
import { importDiagnostic, importSignIn } from './import-diagnostic.js'
import { cleanSourceValue, MEDIUMS, sourceText } from './sign-in-source.js'

export { readSignalCustomers } from './ops-signal-customers.js'
export { readSignalSummary } from './ops-signal-summary.js'

const services = new WeakMap()
const NOTIFY = new Set([
  'account.first_sign_in',
  'site.create',
  'site.import',
  'site.stuck',
  'invitations.queue_paused',
  'ops.daily',
  'discord.linked',
  'discord.bug_report',
  'shard.silent',
  'shard.update_failed',
  'shard.dns_conflict',
  'shard.none',
  'shard.degraded',
  'shard.closed',
  'shard.label_conflict',
  'shard.backup_stale',
  'shard.web_images_missing',
  'shard.adopt_failed',
  'shard.invitation_flood'
])
const FIELDS = {
  'account.first_sign_in': ['badge', 'plans', 'via', 'checkedAt', 'source'],
  'site.create': ['platform', 'design', 'quickstart', 'source', 'wizard_id'],
  'site.import': ['platform'],
  'site.result': ['outcome', 'seconds', 'step', 'attempt', 'sign_in'],
  // `detail`: where a Joomla import stopped (step, check, HTTP status, bare path, error code), shaped
  // field by field in `sites/route.js` before it reaches here.
  'site.stuck': ['step', 'reason', 'platform', 'attempt', 'sign_in', 'detail'],
  'site.edit': ['action', 'ok', 'refusal', 'from_comment'],
  // Usage (`tasks/todo-do-dung-that.md`): a person opened a site's workspace page (one per half hour),
  // and the Add site wizard opened, by the id the wizard drew for that opening — `site.create` carries
  // the same `wizard_id`, so an opening with no create after a day is a wizard left before Create.
  'site.entered': [],
  'wizard.opened': ['wizard_id', 'where'],
  // A page of that same opening reached (`POST /api/sites/wizard` with `step`), one per id and page, so the
  // pages between opening and Create show where the form was left (`<origin>:<page>`, `WIZARD_STEPS`).
  'wizard.step': ['wizard_id', 'step'],
  // The first-run guides (`POST /api/onboarding/step`, `onboarding/usage.js`): a step a showing of the
  // Welcome popup or a tour reached, and how that showing ended. `run_id` is the showing's own id.
  'onboard.step': ['run_id', 'flow', 'step'],
  'onboard.exit': ['run_id', 'flow', 'step', 'end'],
  'site.undo': ['moment', 'ok', 'refusal'],
  // An Invitations send queue the cron paused (`invitations/real-queue.js`); it waits for a person.
  'invitations.queue_paused': ['campaign_id', 'reason'],
  'site.go_live': ['domain'],
  'site.delete': ['platform', 'age_days'],
  'team.invite': ['role'],
  'team.accept': ['role'],
  'team.leave': [],
  // An administrator's act on somebody else's row (#792). `target` is the account id of the person
  // acted on; the actor is the event's own account. None of these notifies Telegram.
  'team.revoke': ['role', 'target'],
  'team.cancel_invite': ['role', 'target'],
  'team.decline_request': ['role', 'target'],
  'team.role_change': ['from', 'to', 'target'],
  // A signed-out visit to `/login` whose link carried `utm_*` (`POST /login/visit`, sent by the page's own
  // script so a mail scanner fetching the link is not counted). No account, no address: only the source.
  'login.visited': ['source', 'medium', 'campaign', 'content'],
  // The two ways a signed-out person starts signing in (`identity/route.js` `recordSignInStart`): an email
  // code asked for, and a Google or GitHub sign-in begun. No account, no address: the source, and the provider.
  'login.code_requested': ['source', 'medium', 'campaign', 'content'],
  'login.oauth_started': ['provider', 'source', 'medium', 'campaign', 'content'],
  'beta.waitlist': ['via'],
  'beta.waitlist_form': ['platforms', 'role', 'site_count'],
  'ops.daily': ['day', 'counts', 'active', 'badges', 'sources'],
  // An administrator closing (or opening again) a stuck customer's row on `/ops` › Beta › Attention.
  // `of` is the kind closed, `since` the first failure of that run, `by` the administrator. Neither
  // notifies Telegram: the topic was told about the failure; the close is bookkeeping.
  'ops.handled': ['of', 'since', 'by'],
  'ops.reopened': ['of', 'since', 'by'],
  // Tracy's Discord bot (`discord/route.js`). `discord_id` is the member's Discord user id, the key;
  // `discord_name` their username when the bot sent it, for reading only (it can change). A post
  // is named by its thread id, title and link. Only a member who proved an address is ever recorded.
  'discord.linked': ['discord_id', 'discord_name'],
  'discord.bug_report': ['discord_id', 'discord_name', 'thread_id', 'title', 'url'],
  'discord.left': ['discord_id', 'discord_name'],
  // The shard beta (docs/sre/2026-10-15-shard-beta-design.md §5; docs/sre/hop-dong-cua-shard.md §5,
  // §7): alerts from the master's own code, never a shard's cron. Each caller names its own dedupe key.
  'shard.silent': ['shard', 'since'],
  'shard.update_failed': ['shard', 'tag', 'finished_at'],
  'shard.dns_conflict': ['shard', 'hostname'],
  'shard.none': ['reason'],
  'shard.degraded': ['shard', 'status'],
  'shard.closed': ['shard', 'reason'],
  'shard.label_conflict': ['shard', 'label', 'holder'],
  'shard.backup_stale': ['shard', 'at', 'result'],
  'shard.web_images_missing': ['shard', 'tag'],
  // An adopt a shard refused for good (contract §6: NOT_A_SHARD, MIRROR_CONFLICT): the code, never the address.
  'shard.adopt_failed': ['shard', 'code'],
  // A shard added more invitation rows in an hour than the cap lets it (contract §5): refused with 429.
  'shard.invitation_flood': ['shard', 'limit'],
  // One voice turn as the page timed it (`speech/trace.js`, `lib/voice-trace.js`; council 19/10/2026):
  // spans in milliseconds on the page's own clock and four 0/1 flags — numbers only, never words.
  'voice.turn': [
    'speech_to_commit',
    'commit_to_sent',
    'sent_to_ack',
    'sent_to_reply',
    'speech_to_reply',
    'ack_cached',
    'error',
    'interrupted',
    'pressed'
  ]
}
const clean = (value) =>
  String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .slice(0, 400)
// "Where: install_page/joomla_denied · HTTP 403 · /administrator/index.php" on a stuck import. Fed
// only from what `importDiagnostic` accepts, so a stored row cannot print anything else.
const stuckWhere = (value) => {
  const detail = importDiagnostic(value)
  if (!detail) return ''
  const parts = [`${detail.at}/${detail.check}`]
  if (detail.status) parts.push(`HTTP ${detail.status}`)
  if (detail.path) parts.push(detail.path)
  if (detail.error) parts.push(detail.error)
  return `\nWhere: ${parts.join(' · ')}${installRoads(detail)}${sizes(detail)}`
}
// "Sign-in: password · username is an email address": how the run came in (the row's own
// `sign_in`, there with or without a diagnostic), and on a refused account whether the username had
// an email's shape (Joomla's backend wants the username). Accepted values only, like `stuckWhere`.
const signIn = (data) => {
  const way = importSignIn(data.sign_in)
  const detail = importDiagnostic(data.detail)
  const parts = way ? [way] : []
  if (detail?.username_is_email !== undefined)
    parts.push(detail.username_is_email ? 'username is an email address' : 'username is not an email address')
  return parts.length ? `\nSign-in: ${parts.join(' · ')}` : ''
}
// "Roads: url_install POST 500 memory_exhausted → page 200 · upload_install over_limit": each
// install road kept apart, so a later 200 never hides the 500 that was the cause.
const installRoads = (detail) => {
  const roads = Object.entries(detail.roads ?? {}).map(([name, road]) => {
    const parts = [name]
    if (road.post_status) parts.push(`POST ${road.post_status}`)
    if (road.cause) parts.push(road.cause)
    if (road.error) parts.push(road.error)
    if (road.result_status) parts.push(`→ page ${road.result_status}`)
    return parts.join(' ')
  })
  return roads.length ? `\nRoads: ${roads.join(' · ')}` : ''
}
const sizeText = (bytes) => {
  if (bytes < 0) return 'unlimited'
  const mb = bytes / 1024 ** 2
  return `${mb < 10 ? Math.round(mb * 10) / 10 : Math.round(mb)} MB`
}
// "Sizes: memory_limit 128 MB · upload_max_filesize 8 MB · post_max_size 8 MB · package 59 MB"
const sizes = (detail) => {
  const parts = Object.entries(detail.php_limits ?? {}).map(([name, bytes]) => `${name} ${sizeText(bytes)}`)
  if (detail.package_bytes) parts.push(`package ${sizeText(detail.package_bytes)}`)
  return parts.length ? `\nSizes: ${parts.join(' · ')}` : ''
}
const discordUser = (d) =>
  d.discord_name ? `${clean(d.discord_name)} (${clean(d.discord_id)})` : clean(d.discord_id)
const plansText = (plans) =>
  (Array.isArray(plans) ? plans : []).map((p) => `${clean(p.name)} (until ${clean(p.until)})`).join(', ')
const BADGES = {
  'gate off': '⚪ gate off',
  'seat invite': '📨 seat invite',
  'JoomlArt member': '✅ JoomlArt member',
  'fallback list': '🟡 fallback list',
  'existing account': 'existing account'
}
// The order the daily summary names sources in; a sign-in with none counts as `none`.
const SOURCE_ORDER = [...MEDIUMS, 'other', 'none']
/** The `utm_medium` a first sign-in is counted under in the daily summary. */
const mediumOf = (source) => {
  const medium = cleanSourceValue(source?.medium)
  return medium === null ? 'none' : SOURCE_ORDER.includes(medium) ? medium : 'other'
}
const sourcesText = (sources) =>
  SOURCE_ORDER.filter((medium) => Number(sources?.[medium]) > 0)
    .map((medium) => `${Number(sources[medium])} ${medium}`)
    .join(', ')

const SHARD_TEXT = {
  'shard.silent': (d) => `Shard ${clean(d.shard)} has sent no heartbeat since ${clean(d.since)}`,
  'shard.update_failed': (d) =>
    `Shard ${clean(d.shard)} failed to update to ${clean(d.tag)} (finished ${clean(d.finished_at)})`,
  'shard.dns_conflict': (d) =>
    `Shard ${clean(d.shard)}: ${clean(d.hostname)} already points elsewhere; DNS left as it is`,
  'shard.none': (d) =>
    `No shard could take a new account (${clean(d.reason)}); sign-ups are refused until one does`,
  'shard.degraded': (d) =>
    `Shard ${clean(d.shard)} refused an adopt (status ${clean(d.status)}) and is passed over until its next heartbeat`,
  'shard.closed': (d) => `Shard ${clean(d.shard)} stopped taking new accounts (${clean(d.reason)})`,
  'shard.label_conflict': (d) =>
    `Shard ${clean(d.shard)} made a site under ${clean(d.label)}, which ${clean(d.holder)} holds; this master did not list it`,
  'shard.backup_stale': (d) =>
    `Shard ${clean(d.shard)}: database backup ${clean(d.result)} (last ${clean(d.at)})`,
  'shard.web_images_missing': (d) =>
    `Shard ${clean(d.shard)} updated to ${clean(d.tag)} without its site web images; customer sites may not build`,
  'shard.adopt_failed': (d) =>
    `Shard ${clean(d.shard)} refused an adopt outright (${clean(d.code)}); nobody was moved and no other shard was asked`,
  'shard.invitation_flood': (d) =>
    `Shard ${clean(d.shard)} announced more than ${clean(d.limit)} invited accounts in an hour; the rest are refused until the hour turns`
}

export function signalText(event, label) {
  const d = event.data
  const prefix = `[${label}]`
  if (Object.hasOwn(SHARD_TEXT, event.kind)) return `${prefix} ${SHARD_TEXT[event.kind](d)}`
  const who = clean(d.email)
  const plans = plansText(d.plans)
  if (event.kind === 'account.first_sign_in') {
    const source = sourceText(d.source)
    return `👤 ${prefix} New user signed in\n${who}\nBadge: ${BADGES[d.badge] ?? 'unknown'}${plans ? `\nPlans: ${plans}` : ''}\nVia: ${clean(d.via)}${source ? `\nSource: ${source}` : ''}`
  }
  const actor = `${who}${plans ? ` · Admission plans: ${plans}` : ''}`
  const site = clean(event.site_key)
  if (event.kind === 'site.create')
    return `🌐 ${prefix} New site (created)\n${actor}\nSite: ${site}\nPlatform: ${clean(d.platform)} · Design: ${clean(d.design)} · Quickstart: ${clean(d.quickstart)}\nSource: ${clean(d.source)}`
  if (event.kind === 'site.import')
    return `🌐 ${prefix} New site (import registered)\n${actor}\nSite: ${site} · Platform: ${clean(d.platform)}`
  if (event.kind === 'site.stuck')
    return `🔴 ${prefix} Customer stuck: ${clean(d.step)} failed\n${actor}\nSite: ${site} · ${clean(d.platform)}\nReason: ${clean(d.reason)}${stuckWhere(d.detail)}${signIn(d)}`
  if (event.kind === 'invitations.queue_paused')
    return `⏸ ${prefix} Invitations send queue paused: ${clean(d.reason)}\nCampaign: ${clean(d.campaign_id)}\nNothing more is sent until someone resumes it in /ops › Invitations › Send.`
  if (event.kind === 'discord.linked')
    return `💬 ${prefix} Discord member verified\n${actor}\nDiscord user: ${discordUser(d)}`
  if (event.kind === 'discord.bug_report')
    return `🐛 ${prefix} Bug report on Discord\n${actor} · Discord: ${discordUser(d)}\n${clean(d.title)}${d.url ? `\n${clean(d.url)}` : ''}`
  if (event.kind === 'ops.daily') {
    const n = (kind) => Number(d.counts?.[kind] ?? 0)
    const bySource = sourcesText(d.sources)
    return `📊 ${prefix} Yesterday ${clean(d.day)}\nNew users: ${n('account.first_sign_in')} (${
      Object.entries(d.badges ?? {})
        .map(([b, count]) => `${count} ${BADGES[b] ?? b}`)
        .join(', ') || '0'
    })${bySource ? ` · by source: ${bySource}` : ''} · Active users: ${Number(d.active ?? 0)} · Waitlist: ${n('beta.waitlist')}\nNew sites: ${n('site.create') + n('site.import')} (${n('site.create')} created, ${n('site.import')} imported) · Ready: ${n('site.result')} · Failure attempts: ${n('site.stuck')}\nAgent edits: ${n('site.edit')} (${n('edit.refused')} refused) · Undo: ${n('site.undo')} · Sent from comments: ${n('edit.comment')}\nGo-live: ${n('site.go_live')} · Invites: ${n('team.invite')} (${n('team.accept')} accepted) · Sites deleted: ${n('site.delete')}`
  }
  throw new Error('UNSUPPORTED_SIGNAL')
}

export function opsFor(pool) {
  return services.get(pool) ?? { record: async () => null, active: async () => null }
}

export function createOpsSignal({ pool, config, fetchImpl = fetch, now = Date.now, log = console }) {
  const telegram = config.telegram
  const configured = Boolean(telegram?.token && telegram?.chatId && telegram?.threadId)
  const label = telegram?.label ?? (config.environment === 'prod' ? 'PROD' : 'DEV')
  const events = []
  const memoryDedupe = new Set()
  if (!configured) log.warn('[ops-signal] Telegram is disabled; analytics remain enabled')

  /** Only the structured fields declared above ever enter analytics. Never pass request bodies. */
  async function record(
    kind,
    {
      email = null,
      accountId = null,
      siteKey = null,
      siteInstance = null,
      siteDemo = null,
      data = {},
      dedupeKey = null
    } = {},
    client = pool
  ) {
    if (!FIELDS[kind]) return null
    try {
      if (pool && client === pool) {
        const connection = await withDeadline(async (abort) => {
          const acquired = await pool.connect()
          if (abort.aborted) {
            acquired.release()
            throw new Error('ANALYTICS_POOL_TIMEOUT')
          }
          return acquired
        }, 500)
        try {
          await connection.query('begin')
          await connection.query("set local statement_timeout = '500ms'")
          const event = await record(
            kind,
            { email, accountId, siteKey, siteInstance, siteDemo, data, dedupeKey },
            connection
          )
          await connection.query(event ? 'commit' : 'rollback')
          return event
        } catch (error) {
          await connection.query('rollback').catch(() => {})
          throw error
        } finally {
          connection.release()
        }
      }
      if (client && accountId && !email)
        email =
          (
            await client.query({
              text: 'select email from account where id = $1',
              values: [accountId],
              query_timeout: 500
            })
          ).rows[0]?.email ?? null
      const payload = Object.fromEntries(
        FIELDS[kind].filter((field) => data[field] !== undefined).map((field) => [field, data[field]])
      )
      if (email) payload.email = email
      if (client && email && kind !== 'account.first_sign_in') {
        const actor = (
          await client.query({
            text: 'select id, beta_admission from account where email = $1',
            values: [email],
            query_timeout: 500
          })
        ).rows[0]
        accountId ??= actor?.id
        if (actor?.beta_admission?.plans) payload.plans = actor.beta_admission.plans
      }
      let required = NOTIFY.has(kind)
      if (kind === 'site.stuck' && siteKey && client) {
        const notice = await client.query({
          text: 'insert into ops_stuck_notice (site_key) values ($1) on conflict do nothing returning site_key',
          values: [siteKey],
          query_timeout: 500
        })
        required = notice.rowCount > 0
      }
      if (kind === 'site.result' && data.outcome === 'done' && siteKey && client)
        await client.query({
          text: 'delete from ops_stuck_notice where site_key = $1',
          values: [siteKey],
          query_timeout: 500
        })
      if (!client) {
        if (dedupeKey && memoryDedupe.has(dedupeKey)) return null
        if (dedupeKey) memoryDedupe.add(dedupeKey)
        const event = {
          id: events.length + 1,
          kind,
          account_id: accountId,
          site_key: siteKey,
          site_instance: siteInstance,
          site_demo: siteDemo,
          data: payload,
          occurred_at: new Date(now()),
          telegram_required: required
        }
        events.push(event)
        return event
      }
      const row = await client.query({
        text: `insert into ops_signal (kind, account_id, site_key, data, dedupe_key, telegram_required, occurred_at, site_instance, site_demo)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (dedupe_key) do nothing returning *`,
        values: [
          kind,
          accountId,
          siteKey,
          payload,
          dedupeKey,
          required,
          new Date(now()),
          siteInstance,
          siteDemo
        ],
        query_timeout: 500
      })
      return row.rows[0] ?? null
    } catch {
      log.warn(`[ops-signal] could not record ${kind}`)
      return null
    }
  }

  async function flush() {
    if (!pool || !configured) return 0
    // A lease survives releasing the connection, with no database lock held over HTTP.
    const { rows } = await pool.query(
      `with due as (select id from ops_signal where telegram_required and telegram_sent_at is null
       and next_at <= now() and (locked_until is null or locked_until < now()) order by id for update skip locked limit 4)
       update ops_signal s set locked_until = now() + interval '30 seconds', attempts = attempts + 1
       from due where s.id = due.id returning s.*`
    )
    for (const event of rows) {
      let error = null
      let delay = Math.min(3600, 30 * 2 ** Math.min(event.attempts, 7))
      try {
        const result = await withDeadline(async (signal) => {
          const response = await fetchImpl(`https://api.telegram.org/bot${telegram.token}/sendMessage`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            signal,
            redirect: 'error',
            body: JSON.stringify({
              chat_id: telegram.chatId,
              message_thread_id: Number(telegram.threadId),
              text: signalText(event, label).slice(0, 4000)
            })
          })
          const body = await response.json().catch(() => ({}))
          if (!response.ok || body.ok !== true) {
            error = `HTTP_${response.status}_TELEGRAM`
            if (Number.isFinite(body.parameters?.retry_after))
              delay = Math.max(delay, Math.min(86400, body.parameters.retry_after))
          }
        }, 5000)
        void result
      } catch {
        error = 'NETWORK_OR_TIMEOUT'
      }
      if (error)
        await pool.query(
          "update ops_signal set telegram_error = $2, next_at = now() + $3 * interval '1 second', locked_until = null where id = $1",
          [event.id, error, delay]
        )
      else
        await pool.query(
          'update ops_signal set telegram_sent_at = now(), telegram_error = null, locked_until = null where id = $1',
          [event.id]
        )
    }
    return rows.length
  }

  async function daily() {
    if (!pool || new Date(now() + 7 * 3600_000).getUTCHours() < 9) return null
    const day = vietnamDay(now() - 86400_000)
    if (
      (
        await pool.query('select 1 from ops_signal where dedupe_key = $1', [
          `daily:${config.environment}:${day}`
        ])
      ).rowCount
    )
      return null
    const start = new Date(`${day}T00:00:00+07:00`)
    const end = new Date(start.getTime() + 86400_000)
    const { rows } = await pool.query(
      'select kind, data from ops_signal where occurred_at >= $1 and occurred_at < $2 and kind <> $3',
      [start, end, 'ops.daily']
    )
    const counts = {}
    const badges = {}
    const sources = {}
    for (const row of rows) {
      if (row.kind !== 'site.result' || row.data.outcome === 'done')
        counts[row.kind] = (counts[row.kind] ?? 0) + 1
      if (row.kind === 'account.first_sign_in') {
        badges[row.data.badge] = (badges[row.data.badge] ?? 0) + 1
        const medium = mediumOf(row.data.source)
        sources[medium] = (sources[medium] ?? 0) + 1
      }
      if (row.kind === 'site.edit' && !row.data.ok) counts['edit.refused'] = (counts['edit.refused'] ?? 0) + 1
      if (row.kind === 'site.edit' && row.data.from_comment === true)
        counts['edit.comment'] = (counts['edit.comment'] ?? 0) + 1
    }
    const active = Number(
      (await pool.query('select count(*) as n from ops_active_day where day = $1', [day])).rows[0].n
    )
    return record('ops.daily', {
      data: { day, counts, badges, active, sources },
      dedupeKey: `daily:${config.environment}:${day}`
    })
  }

  const service = {
    record,
    flush,
    daily,
    events,
    async active(accountId) {
      if (!pool || !accountId) return
      try {
        await pool.query({
          text: 'insert into ops_active_day (account_id, day) values ($1,$2) on conflict do nothing',
          values: [accountId, vietnamDay(now())],
          query_timeout: 500
        })
      } catch {
        log.warn('[ops-signal] could not record active day')
      }
    }
  }
  if (pool) services.set(pool, service)
  return service
}
