import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readUsageData } from '../src/lib/ops-usage-data.js'
import { usageQuery } from '../src/lib/ops-usage-query.js'
import { summarizeUsage } from '../src/ops/usage.js'
import { freshPool } from './_db.mjs'

const now = Date.parse('2026-10-23T10:00:00Z')

test('real token queries match independent SQL across periods, CMS, audience and demo filters', {
  skip: !process.env.TEST_DATABASE_URL
}, async (t) => {
  const { pool, close } = await freshPool()
  t.after(close)
  await pool.query(`insert into site (site_key,label,host,platform,demo,created_at) values
    ('j','j','local','joomla',false,'2026-09-01'),
    ('w','w','local','wordpress',false,'2026-09-01'),
    ('d','d','local','joomla',true,'2026-09-01')`)
  await pool.query(`insert into site_turn
    (turn_id,site_key,session_id,turn,actor,title,source,opened_at,site_instance,site_demo,files,token_usage)
    select site_key||':'||n,site_key,site_key,n,actor,'Request','panel',opened,
      '2026-09-01'::timestamptz,demo,case when n%2=0 then 1 else 0 end,
      case when n=21 then null else jsonb_build_object('version',1,'totalTokens',(n-1)*10,'missing',case when n=5 then 2 else 0 end) end
    from (select 'j' site_key,n,'customer@example.test' actor,false demo,'2026-10-22T12:00:00Z'::timestamptz opened from generate_series(1,21) n
      union all select 'w',n,'customer@example.test',false,'2026-10-22T12:00:00Z'::timestamptz from generate_series(1,19) n
      union all select 'd',n,'customer@example.test',true,'2026-10-22T12:00:00Z'::timestamptz from generate_series(1,4) n
      union all select 'j',30,'staff@tracy.test',false,'2026-10-22T12:00:00Z'::timestamptz
      union all select 'j',31,'customer@example.test',false,'2026-10-05T12:00:00Z'::timestamptz) seeded`)
  const measure = async (query, filters = query.filters) => {
    const { rows } = await pool.query(
      `select
      sum((t.token_usage->>'totalTokens')::bigint)::float8 total,
      count(*)::int requests,count(t.token_usage)::int measured,
      count(*) filter(where (t.token_usage->>'missing')::int>0)::int partial,
      case when count(t.token_usage)>=20 then percentile_disc(0.5) within group
        (order by (t.token_usage->>'totalTokens')::bigint) filter(where t.token_usage is not null) end::float8 median
      from site_turn t join site s on s.site_key=t.site_key
      where t.opened_at >= $1 and t.opened_at < $2 and
        ($3='all' or s.platform=$3) and
        ($4='all' or ($4='staff')=(lower(t.actor)='staff@tracy.test')) and
        ($5='include' or ($5='only')=t.site_demo)`,
      [query.start, query.observedEnd, filters.cms, filters.audience, filters.demo]
    )
    return rows[0]
  }
  const verify = (actual, expected, label) => {
    assert.deepEqual(
      [
        actual.total,
        actual.requests,
        actual.measuredRequests,
        actual.partialRequests,
        actual.perRequest.median
      ],
      [expected.total, expected.requests, expected.measured, expected.partial, expected.median],
      label
    )
  }
  let cases = 0
  for (const period of [
    'days=24h',
    'days=7',
    'days=14',
    'days=30',
    'days=all',
    'start=2026-10-21&end=2026-10-22'
  ]) {
    for (const cms of ['all', 'joomla', 'wordpress', 'emdash', 'unknown']) {
      for (const audience of ['customers', 'staff', 'all']) {
        for (const demo of ['exclude', 'include', 'only']) {
          const label = `${period}&cms=${cms}&audience=${audience}&demo=${demo}`
          const parsed = usageQuery(new URLSearchParams(label), now)
          const raw = await readUsageData(pool, parsed, now)
          const result = summarizeUsage(raw, parsed, ['staff@tracy.test'], now)
          verify(result.turns.all.tokens, await measure(parsed), label)
          for (const platform of ['joomla', 'wordpress', 'emdash', 'unknown']) {
            const expected =
              cms !== 'all' && cms !== platform
                ? { total: null, requests: 0, measured: 0, partial: 0, median: null }
                : await measure(parsed, { ...parsed.filters, cms: platform })
            verify(result.turns[platform].tokens, expected, `${label}:${platform}`)
          }
          for (const day of result.daily) {
            const from = parsed.bucket === 'hour' ? new Date(day.day) : new Date(`${day.day}T00:00:00+07:00`)
            const end = new Date(from.getTime() + (parsed.bucket === 'hour' ? 3_600_000 : 86_400_000))
            const expected = await measure({
              ...parsed,
              start: new Date(Math.max(from.getTime(), parsed.start.getTime())),
              observedEnd: new Date(Math.min(end.getTime(), parsed.observedEnd.getTime()))
            })
            assert.deepEqual(
              [
                day.tokens,
                day.tokenCoverage.requests,
                day.tokenCoverage.measuredRequests,
                day.tokenCoverage.partialRequests
              ],
              [expected.total, expected.requests, expected.measured, expected.partial],
              `${label}:${day.day}`
            )
          }
          const expectedCustomers =
            audience === 'staff' || demo === 'only'
              ? null
              : await measure(parsed, { ...parsed.filters, audience: 'customers', demo: 'exclude' })
          assert.equal(
            result.tokenCustomers.length,
            expectedCustomers?.requests ? 1 : 0,
            `${label}:customers`
          )
          if (expectedCustomers?.requests) {
            const customer = result.tokenCustomers[0]
            verify(
              { total: customer.tokens, ...customer.tokenCoverage, perRequest: customer.tokensPerRequest },
              expectedCustomers,
              `${label}:customer tokens`
            )
            const changedSites = await pool.query(
              `select count(distinct site_key)::int n from site_turn t
              join site s using(site_key) where t.opened_at >= $1 and t.opened_at < $2
              and t.site_demo is false and t.actor='customer@example.test' and t.files>0 and ($3='all' or s.platform=$3)`,
              [parsed.start, parsed.observedEnd, cms]
            )
            assert.equal(customer.sitesChanged, changedSites.rows[0].n, `${label}:changed sites`)
          }
          if (parsed.compare) {
            const before = {
              ...parsed,
              start: parsed.previousStart,
              end: parsed.start,
              observedEnd: parsed.previousEnd
            }
            verify(
              summarizeUsage(raw, before, ['staff@tracy.test'], now).turns.all.tokens,
              await measure(before),
              `${label}:previous`
            )
          }
          cases++
        }
      }
    }
  }
  t.diagnostic(
    `${cases} independent SQL filter combinations; KPI, CMS, daily/hourly, customers and previous periods`
  )
})
