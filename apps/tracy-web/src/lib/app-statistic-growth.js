/** Existing updater state and immutable app opens answer different questions, in one snapshot. */
export function desktopGrowthCtes(q) {
  // Copy-based blocks keep copies as their unit, even when the main table groups people.
  const people = q.view === 'users'
  const hourly = q.days === '24h' && !q.start
  const bucket = hourly ? "date_bin(interval '1 hour', last_seen, $1::timestamptz)" : 'used_day'
  const growthDays = hourly
    ? "select d as day from generate_series($1::timestamptz, $13::timestamptz - interval '1 microsecond', interval '1 hour') d"
    : `select d::date as day from generate_series(
      date_trunc('day',coalesce($1::timestamptz,(select at from recorded_start)) at time zone 'Asia/Ho_Chi_Minh'),
      date_trunc('day',($13::timestamptz - interval '1 microsecond') at time zone 'Asia/Ho_Chi_Minh'),
      interval '1 day') d`
  return `copy_scope as (
    select i.*, f.source as account_source from installs i
    left join account_source f on f.account_id = i.account_id
    where ($4 = '' or i.version = $4) and ($5 = '' or i.channel = $5)
      and ($11 = '' or i.platform = $11)
      and ($3 = 'all' or ($3 = 'linked' and i.account_id is not null) or ($3 = 'unlinked' and i.account_id is null))
      and ($7 = 'all' or i.attention > 0) and ($8::uuid is null or i.account_id = $8)
      ${people ? "and i.account_id is not null and ($6 = '' or f.source->>'source' = $6 or f.source->>'medium' = $6 or ($6 = 'unknown' and coalesce(nullif(f.source->>'source', ''), nullif(f.source->>'medium', ''), '') = ''))" : ''}
      and (coalesce(i.email, '') ilike $2 or coalesce(i.display_name, '') ilike $2
        or ${people ? 'i.account_id::text' : 'i.id'} ilike $2 or coalesce(i.version, '') ilike $2)
  ), current_copies as (
    select c.*, exists(select 1 from activity_filtered o where o.install_id = c.install_id
      and o.account_id = c.account_id and o.last_seen >= c.first_seen) as signed_opened
    from copy_scope c where ($1::timestamptz is null or c.last_seen >= $1) and c.last_seen < $13
  ), distribution_records as (
    ${q.view === 'downloads' ? 'select platform, version from filtered' : 'select platform, version from current_copies'}
  ), distribution_groups as (
    select 'platform'::text as dimension, coalesce(nullif(platform,''),'Unknown') as label, count(*)::int as count
    from distribution_records group by 2
    union all select 'version', coalesce(nullif(version,''),'Unknown'), count(*)::int
    from distribution_records group by 2
  ), first_daily_open as (
    select distinct on(${bucket}, install_id) *, ${bucket} as bucket_day from activity_filtered
    where nullif(install_id,'') is not null order by ${bucket}, install_id, last_seen, id::bigint
  ), adoption_groups as (
    select bucket_day as day, coalesce(nullif(version,''),'Unknown') as version,
      count(*)::int as copies from first_daily_open group by 1,2
  ), growth_days as (
    ${growthDays}
  )`
}

export function desktopGrowthSelect(q) {
  if (q.view === 'quickstarts') return 'null::jsonb as desktop_growth'
  const hourly = q.days === '24h' && !q.start
  const label = hourly
    ? `to_char(d.day at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`
    : "to_char(d.day,'YYYY-MM-DD')"
  const firstBucket = hourly
    ? "c.first_seen >= d.day and c.first_seen < d.day + interval '1 hour'"
    : "(c.first_seen at time zone 'Asia/Ho_Chi_Minh')::date=d.day"
  return `jsonb_build_object(
    'unit', '${q.view === 'downloads' ? 'download requests' : 'app copies'}',
    'distributionTotal', (select count(*)::int from distribution_records),
    'distribution', coalesce((select jsonb_agg(jsonb_build_object('dimension',dimension,'label',label,
      'count',count,'share',100.0*count/nullif((select count(*) from distribution_records),0))
      order by dimension,count desc,label) from distribution_groups),'[]'::jsonb),
    'funnel', jsonb_build_object('copies',(select count(*)::int from current_copies),
      'signedIn',(select count(*)::int from current_copies where account_id is not null),
      'opened',(select count(*)::int from current_copies where account_id is not null and signed_opened)),
    'openedCopiesOutsideConnections', (select count(distinct o.install_id)::int from activity_filtered o
      where nullif(o.install_id,'') is not null and not exists(
        select 1 from current_copies c where c.install_id=o.install_id)),
    'activityCollectionStart', (select min(last_seen) from opened),
    'newCopies', coalesce((select jsonb_agg(jsonb_build_object('day',${label},
      'copies',(select count(*)::int from copy_scope c
        where ${firstBucket}
        and c.first_seen < $13 and ($1::timestamptz is null or c.first_seen >= $1))) order by d.day)
      from growth_days d),'[]'::jsonb),
    'adoption', coalesce((select jsonb_agg(jsonb_build_object('day',${label},
      'total',(select count(*)::int from first_daily_open o where o.bucket_day=d.day),
      'versions',coalesce((select jsonb_agg(jsonb_build_object('version',g.version,'copies',g.copies,
        'share',100.0*g.copies/nullif((select count(*) from first_daily_open o where o.bucket_day=d.day),0))
        order by g.copies desc,g.version) from adoption_groups g where g.day=d.day),'[]'::jsonb)) order by d.day)
      from growth_days d),'[]'::jsonb)) as desktop_growth`
}
