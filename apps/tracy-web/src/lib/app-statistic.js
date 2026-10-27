/**
 * Read-only desktop and quickstart statistics. Each request is one database snapshot; aggregates
 * precede joins. A quickstart row is one zip request the quickstart door admitted
 * (`quickstart_download`), not a completed transfer.
 */
import { desktopGrowthCtes, desktopGrowthSelect } from './app-statistic-growth.js'
import { vietnamDay } from './beta-access.js'
import { signalQuery } from './ops-signal-query.js'
import { RELEASES_REPO } from './quickstart-releases.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VIEWS = ['users', 'downloads', 'installs', 'quickstarts']
/** The operating systems a download or install names (the downloads vocabulary). */
const PLATFORMS = ['macos', 'windows', 'linux']
const SORTS = {
  time: 'last_seen',
  lastAppContact: 'last_app_contact',
  lastOpened: 'last_opened',
  daysUsed: 'days_used',
  user: 'email',
  version: 'version',
  installs: 'installs',
  quickstarts: 'quickstarts',
  template: 'template',
  platform: 'platform',
  source: "coalesce(nullif(source->>'source', ''), nullif(source->>'medium', ''), '')",
  channel: 'channel',
  cms: 'cms',
  account: 'email',
  firstSeen: 'first_seen',
  linkedAt: 'linked_at',
  attention: 'attention',
  referrer: 'referrer',
  id: 'id',
  installId: 'install_id'
}

/** Numeric release components and prerelease counters must sort before SQL paginates. */
const versionOrder = (column) => `case
  when ${column} ~ '^[0-9]{1,4}\\.[0-9]{1,4}\\.[0-9]{1,4}(-[a-z]+\\.[0-9]{1,8})?$'
  then row(string_to_array(split_part(${column}, '-', 1), '.')::int[],
    position('-' in ${column}) = 0,
    split_part(split_part(${column}, '-', 2), '.', 1),
    nullif(split_part(split_part(${column}, '-', 2), '.', 2), '')::int)
  end`

export function statisticQuery(query, now = Date.now()) {
  const pick = (key, fallback, allowed) => {
    const value = query[key] || fallback
    if (!allowed.includes(value)) throw new Error(key)
    return value
  }
  const view = pick('view', 'users', VIEWS)
  const days = pick('days', '7', ['24h', '1', '7', '30', 'all'])
  const account = pick('account', 'all', ['all', 'linked', 'unlinked'])
  const sort = pick('sort', view === 'users' ? 'lastAppContact' : 'time', Object.keys(SORTS))
  const direction = pick('direction', 'desc', ['asc', 'desc'])
  const attention = pick('attention', 'all', ['all', 'needs-attention'])
  const pageSize = Number(pick('pageSize', '50', ['10', '25', '50', '100']))
  const page = Number(query.page || 1)
  if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000) throw new Error('page')
  for (const key of ['q', 'version', 'source', 'channel', 'template']) {
    if (typeof query[key] === 'string' && query[key].length > 200) throw new Error(key)
  }
  if (query.channel && !['stable', 'dev'].includes(query.channel)) throw new Error('channel')
  if (query.platform && !PLATFORMS.includes(query.platform)) throw new Error('platform')
  if (query.user && !UUID.test(query.user)) throw new Error('user')
  // A quickstart has no app version, channel, OS or install link, and a desktop record has no
  // template: a filter that cannot apply to the view is dropped rather than emptying the table.
  const quickstarts = view === 'quickstarts'
  const custom = query.start !== undefined || query.end !== undefined
  if (custom) {
    for (const key of ['start', 'end']) {
      const value = query[key]
      const date = new Date(`${value}T00:00:00+07:00`)
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value || '') ||
        !Number.isFinite(date.getTime()) ||
        vietnamDay(date.getTime()) !== value
      )
        throw new Error(key)
    }
    const length = (Date.parse(query.end) - Date.parse(query.start)) / 86_400_000 + 1
    if (length < 1 || length > 366) throw new Error('range')
    if (query.end > vietnamDay(now)) throw new Error('end')
  }
  return {
    view,
    days,
    start: custom ? query.start : null,
    end: custom ? query.end : null,
    account: quickstarts || view === 'downloads' ? 'all' : account,
    sort,
    direction,
    attention: view === 'downloads' ? 'all' : attention,
    page,
    pageSize,
    q: query.q || '',
    version: quickstarts ? '' : query.version || '',
    channel: quickstarts ? '' : query.channel || '',
    platform: quickstarts ? '' : query.platform || '',
    source: view === 'installs' ? '' : query.source || '',
    template: quickstarts ? query.template || '' : '',
    user: view === 'downloads' ? '' : query.user || ''
  }
}

/** The latest decisive event closes or opens a site exactly as Beta Attention does. */
const CTES = `with
stuck_owner as (
  select distinct on (s.site_key) s.site_key, coalesce(s.account_id, a.id) as account_id,
    s.occurred_at, s.data
  from ops_signal s left join account a on a.email = lower(s.data->>'email')
  where s.kind = 'site.stuck' and s.site_key is not null
  order by s.site_key, s.occurred_at desc, s.id desc
),
site_decision as (
  select distinct on (s.site_key) s.site_key, s.kind
  from ops_signal s join stuck_owner o on o.site_key = s.site_key
  where s.kind in ('site.stuck', 'ops.handled', 'ops.reopened', 'site.delete')
    or (s.kind = 'site.result' and s.data->>'outcome' = 'done')
  order by s.site_key, s.occurred_at desc, s.id desc
),
issues as (
  select o.* from stuck_owner o join site_decision d using(site_key)
  where d.kind in ('site.stuck', 'ops.reopened')
),
issue_counts as (select account_id, count(*)::int as attention from issues group by account_id),
-- JoomlArt sign-in is reached only from joomlart.com (no Tracy page offers it), so a first sign-in
-- through it names its source even when the link carried no utm_source; the link's utm values stay.
account_source as (
  select distinct on (coalesce(s.account_id,a.id)) coalesce(s.account_id,a.id) as account_id,
    case when s.data->>'via' = 'JoomlArt' and coalesce(s.data->'source'->>'source', '') = ''
      then coalesce(s.data->'source', '{}'::jsonb) || jsonb_build_object('source', 'joomlart')
      else s.data->'source' end as source
  from ops_signal s left join account a on a.email = lower(s.data->>'email')
  where s.kind = 'account.first_sign_in'
  order by coalesce(s.account_id,a.id), s.occurred_at, s.id
),
dl as (
  select d.id,d.requested_at,d.channel,d.version,d.platform,d.arch,d.file,d.source,
    null::uuid as account_id,null::uuid as install_id,
    null::text as email,null::text as display_name,0::int as attention
  from desktop_download d
  where ($1::timestamptz is null or d.requested_at >= $1)
),
i as (
  select i.*, a.email, a.display_name, coalesce(ic.attention, 0) as attention
  from desktop_install i left join account a on a.id = i.account_id
  left join issue_counts ic on ic.account_id = i.account_id
  where ($1::timestamptz is null or i.last_seen >= $1)
),
downloads as (
  select id::text as id, account_id, email, display_name, source,
    version, channel, platform, arch, file, install_id::text as install_id,
    requested_at as first_seen, requested_at as last_seen, requested_at, null::timestamptz as linked_at,
    null::text as os_version, 1::int as downloads, 0::int as installs, attention,
    case when version is null then '{}'::text[] else array[version] end as versions,
    0::int as quickstarts, null::text as template, null::text as cms, null::text as referrer,
    null::timestamptz as last_opened, null::date as used_day
  from dl
),
installs as (
  select install_id::text as id, account_id, email, display_name, '{}'::jsonb as source,
    version, channel,
    -- desktop_install says mac|win|linux (the channel file read); downloads say macos|windows|linux.
    case platform when 'mac' then 'macos' when 'win' then 'windows' else platform end as platform, arch, null::text as file, install_id::text as install_id,
    first_seen, last_seen, null::timestamptz as requested_at, linked_at, os_version,
    0::int as downloads, 1::int as installs, attention,
    case when version is null then '{}'::text[] else array[version] end as versions,
    0::int as quickstarts, null::text as template, null::text as cms, null::text as referrer,
    null::timestamptz as last_opened, null::date as used_day
  from i
),
qs as (
  select q.*, a.email, a.display_name, coalesce(ic.attention, 0) as attention
  from quickstart_download q left join account a on a.id = q.account_id
  left join issue_counts ic on ic.account_id = q.account_id
  where ($1::timestamptz is null or q.at >= $1)
),
-- Source is the account's first-sign-in attribution; the quickstart door records none of its own.
quickstarts as (
  select id::text as id, account_id, email, display_name,
    (select source from account_source where account_source.account_id = qs.account_id) as source,
    null::text as version, null::text as channel, null::text as platform, null::text as arch,
    null::text as file, null::text as install_id,
    at as first_seen, at as last_seen, at as requested_at, null::timestamptz as linked_at,
    null::text as os_version, 0::int as downloads, 0::int as installs, attention,
    '{}'::text[] as versions, 1::int as quickstarts,
    -- The tag is quickstart/<template>/<cms>, the release the door served.
    nullif(split_part(tag, '/', 2), '') as template, nullif(split_part(tag, '/', 3), '') as cms,
    referrer, null::timestamptz as last_opened, null::date as used_day
  from qs
),
-- Identity belongs to the opening event, never to a later updater account link.
opened as (
  select s.id::text as id, s.account_id, a.email, a.display_name,
    (select source from account_source f where f.account_id = s.account_id) as source,
    s.data->>'version' as version, i.channel,
    case s.data->>'platform' when 'mac' then 'macos' when 'win' then 'windows'
      else s.data->>'platform' end as platform,
    null::text as arch, null::text as file, s.data->>'installId' as install_id,
    s.occurred_at as first_seen, s.occurred_at as last_seen,
    null::timestamptz as requested_at, null::timestamptz as linked_at,
    null::text as os_version, 0::int as downloads, 0::int as installs,
    coalesce(ic.attention, 0) as attention, array[s.data->>'version'] as versions,
    0::int as quickstarts, null::text as template, null::text as cms, null::text as referrer,
    s.occurred_at as last_opened, (s.occurred_at at time zone 'Asia/Ho_Chi_Minh')::date as used_day
  from ops_signal s left join account a on a.id = s.account_id
  left join desktop_install i on i.install_id::text = s.data->>'installId'
  left join issue_counts ic on ic.account_id = s.account_id
  where s.kind = 'desktop.app_opened'
),
user_events as (
  select * from installs where account_id is not null
  union all select * from quickstarts where account_id is not null
  union all select * from opened where account_id is not null
),
users as (
  select account_id::text as id, account_id, max(email) as email, max(display_name) as display_name,
    (select source from account_source where account_source.account_id=user_events.account_id) as source, null::text as version, null::text as channel, null::text as platform,
    null::text as arch, null::text as file, null::text as install_id,
    min(first_seen) as first_seen, max(last_seen) as last_seen,
    max(last_seen) filter (where installs > 0) as last_app_contact, null::timestamptz as requested_at,
    null::timestamptz as linked_at, null::text as os_version,
    sum(installs)::int as installs, max(attention)::int as attention,
    array_agg(distinct version) filter (where version is not null) as versions,
    sum(quickstarts)::int as quickstarts, null::text as template, null::text as cms,
    null::text as referrer, max(last_opened) as last_opened,
    count(distinct used_day)::int as days_used
  from user_events group by account_id
)`

/** A Joomla cms in a quickstart tag: `j4`, `j5`, `j6`… */
const JOOMLA_CMS = /^j\d+$/
/**
 * Where staff can read about a quickstart: the template's page on joomlart.com — Joomla only, the
 * one address shape measured live (ja-kinetic, 11/10/2026); no other cms gets a guessed one — and
 * its release on the private releases repository (`RELEASES_REPO`, which needs access).
 */
function quickstartLinks(template, cms) {
  if (!template || !cms) return { templateUrl: null, releaseUrl: null }
  const part = encodeURIComponent
  return {
    templateUrl: JOOMLA_CMS.test(cms) ? `https://www.joomlart.com/joomla/templates/${part(template)}` : null,
    releaseUrl: `https://github.com/${RELEASES_REPO}/releases/tag/quickstart/${part(template)}/${part(cms)}`
  }
}

const sourceOf = (source) =>
  source && typeof source === 'object' && Object.keys(source).length ? source : null
export function statisticRow(r, view) {
  const iso = (v) => (v ? new Date(v).toISOString() : null)
  const common = {
    id: r.id,
    userId: r.account_id,
    email: r.email,
    name: r.display_name,
    source: sourceOf(r.source),
    versions: r.versions || [],
    ...(view === 'downloads' ? { downloads: r.downloads } : {}),
    installs: r.installs,
    quickstarts: r.quickstarts,
    firstSeen: iso(r.first_seen),
    lastSeen: iso(r.last_seen),
    attention: r.attention
  }
  if (view === 'downloads') {
    const { userId, email, name, installs, quickstarts, attention, ...anonymous } = common
    return {
      ...anonymous,
      version: r.version,
      channel: r.channel,
      platform: r.platform,
      arch: r.arch,
      requestedAt: iso(r.requested_at),
      file: r.file
    }
  }
  if (view === 'users')
    return {
      ...common,
      lastAppContact: iso(r.last_app_contact),
      lastOpened: iso(r.last_opened),
      daysUsed: r.days_used ?? 0
    }
  if (view === 'quickstarts')
    return {
      ...common,
      requestedAt: iso(r.requested_at),
      template: r.template,
      cms: r.cms,
      ...quickstartLinks(r.template, r.cms),
      referrer: r.referrer ?? null
    }
  const fields = {
    ...common,
    version: r.version,
    channel: r.channel,
    platform: r.platform,
    arch: r.arch,
    installId: r.install_id
  }
  return {
    ...fields,
    osVersion: r.os_version,
    linkedAt: iso(r.linked_at),
    account: r.account_id ? 'linked' : 'unlinked'
  }
}

function statisticRange(q, now) {
  const allTime = !q.start && q.days === 'all'
  const hourly = !q.start && q.days === '24h'
  const window = signalQuery(
    new URLSearchParams(
      q.start
        ? { start: q.start, end: q.end }
        : ['24h', 'all'].includes(q.days)
          ? { days: q.days }
          : {
              start: vietnamDay(
                Date.parse(`${vietnamDay(now)}T00:00:00+07:00`) - (Number(q.days) - 1) * 86_400_000
              ),
              end: vietnamDay(now)
            }
    ),
    now
  )
  return {
    start: allTime ? null : window.start.toISOString(),
    end: window.end.toISOString(),
    previousStart: allTime ? null : window.previousStart.toISOString(),
    previousEnd: allTime ? null : window.start.toISOString(),
    timeZone: window.range.timeZone,
    partialEnd: window.range.partialEnd,
    ...(allTime || hourly
      ? {
          compare: !allTime,
          bucket: hourly ? 'hour' : 'day',
          preset: q.days,
          startAt: allTime ? null : window.start.toISOString(),
          endAt: window.end.toISOString()
        }
      : {})
  }
}

function params(q, range) {
  return [range.start, q.q, q.account, q.version, q.channel, q.source, q.attention, q.user || null]
}

/** Escape the search pattern so searching a percent sign does not match every account. */
const escaped = (s) => s.replace(/[\\%_]/g, '\\$&')

export async function listStatistics(pool, q, now = Date.now()) {
  const range = statisticRange(q, now)
  const hourly = range.bucket === 'hour'
  const values = params(q, range)
  values[1] = `%${escaped(q.q)}%`
  const recordFilter = (table, withSource = true, previous = false) => `select * from ${table} where
    ${previous ? '($14::timestamptz is not null and last_seen >= $14 and last_seen < $1)' : '($1::timestamptz is null or last_seen >= $1) and last_seen < $13'} and
    ($4 = '' or version = $4) and ($5 = '' or channel = $5) and ($11 = '' or platform = $11)
    ${withSource ? "and ($6 = '' or source->>'source' = $6 or source->>'medium' = $6 or ($6 = 'unknown' and coalesce(nullif(source->>'source', ''), nullif(source->>'medium', ''), '') = ''))" : ''}
    and ($12 = '' or template = $12)`
  // Users are aggregated AFTER filtering their records; counts never include unrelated versions.
  const base = (previous = false) =>
    q.view === 'users'
      ? `select account_id::text as id, account_id, max(email) as email, max(display_name) as display_name,
    (select source from account_source where account_source.account_id=e.account_id) as source, (array_agg(version order by ${versionOrder('version')} desc nulls last, version desc) filter(where version is not null))[1] as version, null::text as channel, null::text as platform,
    null::text as arch, null::text as file, null::text as install_id,
    min(first_seen) as first_seen, max(last_seen) as last_seen,
    max(last_seen) filter (where installs > 0) as last_app_contact, null::timestamptz as requested_at,
    null::timestamptz as linked_at, null::text as os_version,
    sum(installs)::int as installs, max(attention)::int as attention,
    array_agg(distinct version) filter (where version is not null) as versions,
    sum(quickstarts)::int as quickstarts, null::text as template, null::text as cms,
    null::text as referrer, max(last_opened) as last_opened,
    count(distinct used_day)::int as days_used
    from (${recordFilter('user_events', false, previous)}) e group by account_id`
      : recordFilter(q.view, true, previous)
  const filtered = (table) => `select * from ${table} where
      (coalesce(email, '') ilike $2 or coalesce(display_name, '') ilike $2 or ${q.view === 'users' && table.includes('activity') ? 'account_id::text' : 'id'} ilike $2 or coalesce(version, '') ilike $2 or coalesce(array_to_string(versions, ' '), '') ilike $2 or coalesce(template, '') ilike $2 or coalesce(referrer, '') ilike $2)
      and ($3 = 'all' or ($3 = 'linked' and account_id is not null) or ($3 = 'unlinked' and account_id is null))
      and ($7 = 'all' or attention > 0) and ($8::uuid is null or account_id = $8)
      ${q.view === 'users' ? "and ($6 = '' or source->>'source' = $6 or source->>'medium' = $6 or ($6 = 'unknown' and coalesce(nullif(source->>'source', ''), nullif(source->>'medium', ''), '') = ''))" : ''}
  `
  // Keep options independent of the period and compare both windows in this one database snapshot.
  const allTimeCtes = CTES.replaceAll(
    /where \(\$1::timestamptz is null or [a-z]+\.(?:requested_at|last_seen|at) >= \$1\)/g,
    ''
  )
  // An anonymous opening followed by sign-in on the same copy is not a second active person.
  // Its anonymous history still stays anonymous in the people table.
  const activeUsers = (table, day = '') => `(select count(*)::int from (
    select account_id::text from ${table} a where account_id is not null ${day} group by account_id
    union all select install_id from ${table} a where account_id is null ${day}
      and not exists(select 1 from ${table} known where known.install_id = a.install_id
        and known.account_id is not null ${day.replaceAll('a.used_day', 'known.used_day').replaceAll('a.last_seen', 'known.last_seen')})
      group by install_id) identities)`
  const countFields = (table, condition = '') => {
    const where = condition ? ` where ${condition}` : ''
    const total = (field, extra = '') =>
      `(select coalesce(sum(${field})${extra},0)::int from ${table}${where})`
    if (q.view === 'downloads') return `'downloads', ${total('downloads')}`
    return `'users', (select count(distinct account_id)::int from ${table}${where}),
      'installs', ${total('installs')}, 'quickstarts', ${total('quickstarts')},
      'linkedInstalls', ${total('installs', ' filter(where account_id is not null)')},
      'unlinkedInstalls', ${total('installs', ' filter(where account_id is null)')}`
  }
  const summary = (table, activityTable) => `jsonb_build_object(${countFields(table)},
    'activeAppUsers', ${activeUsers(activityTable)})`
  const daily = (table, activityTable, previous = false) => {
    const start = previous ? '$14' : `coalesce($1::timestamptz, (select at from recorded_start))`
    const end = previous ? '$1' : '$13'
    const inBucket = hourly
      ? "last_seen >= d.day and last_seen < d.day + interval '1 hour'"
      : "(last_seen at time zone 'Asia/Ho_Chi_Minh')::date = d.day::date"
    const series = hourly
      ? `generate_series(${start}::timestamptz, ${end}::timestamptz - interval '1 microsecond', interval '1 hour')`
      : `generate_series(date_trunc('day', ${start}::timestamptz at time zone 'Asia/Ho_Chi_Minh'), date_trunc('day', (${end}::timestamptz - interval '1 microsecond') at time zone 'Asia/Ho_Chi_Minh'), interval '1 day')`
    const label = hourly
      ? `to_char(d.day at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`
      : "to_char(d.day, 'YYYY-MM-DD')"
    return `coalesce((select jsonb_agg(jsonb_build_object('day', ${label},
      ${countFields(table, inBucket)},
      'activeAppUsers', ${activeUsers(activityTable, hourly ? "and a.last_seen >= d.day and a.last_seen < d.day + interval '1 hour'" : 'and a.used_day = d.day::date')}) order by d.day)
      from ${series} d(day)), '[]'::jsonb)`
  }
  const sortColumn =
    ['lastAppContact', 'lastOpened', 'daysUsed'].includes(q.sort) && q.view !== 'users'
      ? 'last_seen'
      : q.sort === 'version'
        ? versionOrder('version')
        : SORTS[q.sort]
  const sql = `${allTimeCtes}, recorded_start as (
    select min(at) as at from (select first_seen as at from downloads union all select first_seen from installs
      union all select first_seen from quickstarts union all select first_seen from opened) recorded where at < $13
  ), base as (${base()}), previous_base as (${base(true)}),
    activity_base as (${recordFilter('opened', q.view !== 'users')}),
    previous_activity_base as (${recordFilter('opened', q.view !== 'users', true)}),
    activity_filtered as (${filtered('activity_base')}),
    previous_activity_filtered as (${filtered('previous_activity_base')}),
    filtered as (${filtered('base')}), previous_filtered as (${filtered('previous_base')}),
    ${desktopGrowthCtes(q)}, page_rows as (
    select * from filtered order by ${sortColumn} ${q.direction} nulls last, id asc limit $9 offset $10
  )
  select (select at from recorded_start) as first_recorded,
    (select count(*)::int from filtered) as total,
    coalesce((select jsonb_agg(to_jsonb(p)) from page_rows p), '[]'::jsonb) as rows,
    exists(select 1 from activity_filtered) as activity_available,
    ${desktopGrowthSelect(q)},
    ${summary('filtered', 'activity_filtered')} as summary,
    case when $14::timestamptz is null then null else ${summary('previous_filtered', 'previous_activity_filtered')} end as previous,
    ${daily('filtered', 'activity_filtered')} as daily, ${daily('previous_filtered', 'previous_activity_filtered', true)} as previous_daily,
    jsonb_build_object('versions', (select coalesce(jsonb_agg(v order by ${versionOrder('v')} asc nulls last,v), '[]') from (select distinct version as v from downloads union select distinct version from installs union select distinct version from opened) s where v is not null),
      'channels', (select coalesce(jsonb_agg(v order by v), '[]') from (select distinct channel as v from downloads union select distinct channel from installs) s where v is not null),
      'platforms', (select coalesce(jsonb_agg(v order by v), '[]') from (select distinct platform as v from downloads union select distinct platform from installs union select distinct platform from opened) s where v is not null),
      'sources', (select coalesce(jsonb_agg(v order by v), '[]') from (select 'unknown'::text as v union select distinct source->>'source' from downloads union select distinct source->>'medium' from downloads union select distinct source->>'source' from account_source union select distinct source->>'medium' from account_source) s where v is not null and v <> ''),
      'templates', (select coalesce(jsonb_agg(v order by v), '[]') from (select distinct template as v from quickstarts) s where v is not null)) as options`
  const {
    rows: [r]
  } = await pool.query(sql, [
    ...values,
    q.pageSize,
    (q.page - 1) * q.pageSize,
    q.platform,
    q.template,
    range.end,
    range.previousStart
  ])
  if (range.preset === 'all') {
    range.startAt = r.first_recorded ? new Date(r.first_recorded).toISOString() : null
    range.start = range.startAt
  }
  return {
    readAt: new Date(now).toISOString(),
    view: q.view,
    days: q.days,
    page: q.page,
    pageSize: q.pageSize,
    total: r.total,
    pages: Math.ceil(r.total / q.pageSize),
    activityAvailable: r.activity_available,
    activityMinimumVersion: '0.6.1',
    summary: r.summary,
    analytics: {
      previous: r.previous,
      desktopGrowth: r.desktop_growth,
      daily: r.daily,
      previousDaily: r.previous_daily,
      range,
      dateField: q.view === 'downloads' || q.view === 'quickstarts' ? 'requestedAt' : 'lastSeen'
    },
    rows: r.rows.map((row) => statisticRow(row, q.view)),
    options: r.options,
    dateField: q.view === 'downloads' || q.view === 'quickstarts' ? 'requestedAt' : 'lastSeen'
  }
}

export async function statisticDetail(pool, view, id, now = Date.now()) {
  if (!VIEWS.includes(view) || !UUID.test(id)) return null
  const {
    rows: [row]
  } = await pool.query(`${CTES} select * from ${view} where id = $2`, [null, id])
  if (!row) return null
  if (view === 'downloads') return { readAt: new Date(now).toISOString(), view, row: statisticRow(row, view) }
  const userId = row.account_id
  // A quickstart without an account (deleted, so set null) lists only itself; a desktop record's
  // detail lists none, because a download or an install says nothing about quickstarts.
  const accountScoped = (view === 'users' || view === 'quickstarts') && userId
  const [installs, activity, issues, quickstarts] = await Promise.all([
    pool.query(
      `${CTES} select * from installs where ${view === 'installs' ? 'id = $2' : view === 'downloads' ? 'id = $2' : 'account_id = $2::uuid'} order by last_seen desc, id asc limit 101`,
      [null, view === 'installs' ? id : view === 'downloads' ? row.install_id : userId]
    ),
    pool.query(
      `select id::text, kind, occurred_at, site_key, data from ops_signal
      where (account_id = $1::uuid or (account_id is null and lower(data->>'email') = (select email from account where id = $1::uuid))) and kind in ('account.first_sign_in','site.create','site.import','site.edit','site.undo','site.go_live','site.stuck','site.result','site.delete')
      order by occurred_at desc, id desc limit 101`,
      [userId]
    ),
    pool.query(
      `${CTES} select site_key, occurred_at, data from issues where account_id = $2::uuid order by occurred_at desc, site_key limit 101`,
      [null, userId]
    ),
    pool.query(
      `${CTES} select * from quickstarts where ${accountScoped ? 'account_id = $2::uuid' : 'id = $2'} order by last_seen desc, id asc limit 101`,
      [null, accountScoped ? userId : view === 'quickstarts' ? id : null]
    )
  ])
  // An unlinked install has no account history. Never group every anonymous install together.
  return {
    readAt: new Date(now).toISOString(),
    view,
    row: statisticRow(row, view),
    installs: installs.rows.slice(0, 100).map((r) => statisticRow(r, 'installs')),
    quickstarts: quickstarts.rows.slice(0, 100).map((r) => statisticRow(r, 'quickstarts')),
    activity: activity.rows.slice(0, 100).map((r) => ({
      id: r.id,
      kind: r.kind,
      at: r.occurred_at.toISOString(),
      siteKey: r.site_key,
      data: r.data
    })),
    issues: issues.rows.slice(0, 100).map((r) => ({
      siteKey: r.site_key,
      at: r.occurred_at.toISOString(),
      step: r.data?.step ?? null,
      reason: r.data?.reason ?? null
    })),
    truncated: {
      installs: installs.rows.length > 100,
      quickstarts: quickstarts.rows.length > 100,
      activity: activity.rows.length > 100,
      issues: issues.rows.length > 100
    }
  }
}
