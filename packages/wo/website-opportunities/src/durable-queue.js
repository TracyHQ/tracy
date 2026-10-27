/**
 * A durable work queue in a Postgres table: THE ROW IS THE QUEUE, THE LEASE TOKEN IS THE ONLY RIGHT
 * TO WRITE (council P0-4). Used by `site-checks.js`; built so a
 * second background measurement (social stats) runs on the same rules.
 *
 * The table carries the queue columns besides its own: `<key> text primary key`, `status text`
 * ('queued' while waiting or leased; anything else is a verdict), `error text`, `queued_at`,
 * `lease_until`, `lease_token bigint not null default 0`, `attempts integer not null default 0`,
 * `checked_at`.
 *
 * - `enqueue` is one conditional upsert: a row a worker holds keeps its lease, attempts and token;
 *   anything else is (re)queued and its token bumped, which revokes an older lease.
 * - `tick` claims under a transaction advisory lock, so two instances together never hold more
 *   than `concurrency` live leases nor start more than `hourlyCap` rows an hour. A claim bumps the
 *   token and hands it to `run(row, lease)`.
 * - `enabled` (optional): asked before every claim; false or a throw claims nothing (the feature's
 *   switch is off — what is queued waits, untouched).
 * - `notBeforeColumn` (optional, a timestamptz column): a queued row whose value is in the future
 *   waits — how a consumer defers a row (a spent daily budget) without failing it.
 * - `lease.finish(fields)` and the heartbeat write only `where lease_token = <ours>`; zero rows
 *   means the lease was lost: logged, `false`, never thrown.
 */
const HOUR_MS = 3_600_000
const IDENT = /^[a-z_][a-z0-9_]*$/
const STATUS = /^[a-z][a-z0-9-]{0,63}$/

/**
 * @param {{
 *   pool: import('pg').Pool, table: string, keyColumn: string,
 *   run: (row: object, lease: { key: string, token: string, finish: (fields: object) => Promise<boolean> }) => Promise<unknown>,
 *   notBeforeColumn?: string | null, name?: string, now?: () => number, concurrency?: number, leaseMs?: number, maxAttempts?: number,
 *   hourlyCap?: number, tickMs?: number, log?: Console, enabled?: () => Promise<boolean>,
 *   queuedStatus?: string, failedStatus?: string, accountIds?: string[] | null
 * }} deps
 */
export function createDurableQueue({
  pool,
  table,
  keyColumn,
  run,
  notBeforeColumn = null,
  name = table,
  now = Date.now,
  concurrency = 4,
  leaseMs = 120_000,
  maxAttempts = 3,
  hourlyCap = Number.POSITIVE_INFINITY,
  tickMs = 3000,
  log = console,
  enabled = async () => true,
  queuedStatus = 'queued',
  failedStatus = 'failed',
  accountIds = null
}) {
  if (!STATUS.test(queuedStatus) || !STATUS.test(failedStatus)) throw new Error('durable-queue: bad status')
  if (accountIds && (!accountIds.length || accountIds.some((id) => !/^[a-f0-9-]{36}$/i.test(id))))
    throw new Error('durable-queue: bad account scope')
  for (const id of [table, keyColumn, ...(notBeforeColumn ? [notBeforeColumn] : [])])
    if (!IDENT.test(id)) throw new Error(`durable-queue: bad identifier ${id}`)
  const T = table
  const K = keyColumn
  // Values are trusted, validated protocol names; account ids remain SQL parameters.
  const Q = `'${queuedStatus}'`
  const F = `'${failedStatus}'`
  const scoped = (n) => (accountIds ? ` and account_id=any($${n}::uuid[])` : '')
  const ready = notBeforeColumn ? ` and (${notBeforeColumn} is null or ${notBeforeColumn} <= $2)` : ''
  const running = new Set()
  let ticking = null
  /** Ticks a finished run kicked off, still in flight. */
  const followUps = new Set()
  let timer = null

  /** Queue each `{key, fields}`; `fields` are the table's own columns (code-chosen names). */
  /**
   * `seenAt`: when the caller read the rows it decided to queue. A row a worker finished after
   * that moment is left alone — the caller's answer is already stale, and queuing it would pay
   * for the same check twice (two searches for one address at once).
   */
  async function enqueue(entries, { seenAt = null } = {}) {
    for (const { key, fields = {} } of entries) {
      if (accountIds && !accountIds.includes(fields.account_id))
        throw new Error('durable-queue: account outside scope')
      const cols = columnsOf(fields)
      const values = cols.map((_, i) => `$${i + 3}`)
      const seen = seenAt ? `$${cols.length + 3}` : null
      await pool.query(
        `insert into ${T} (${[K, 'status', 'queued_at', 'attempts', 'lease_until', ...cols].join(', ')})
         values ($1, ${Q}, $2, 0, null${values.map((v) => `, ${v}`).join('')})
         on conflict (${K}) do update
           set ${['status = excluded.status', 'queued_at = excluded.queued_at', 'attempts = 0', 'lease_until = null', `lease_token = ${T}.lease_token + 1`, ...cols.map((c) => `${c} = excluded.${c}`)].join(', ')}
           where (${T}.status <> ${Q} or ${T}.lease_until is null or ${T}.lease_until < excluded.queued_at)${
             seen
               ? `
             and (${T}.checked_at is null or ${T}.checked_at < ${seen})`
               : ''
}${accountIds ? ` and ${T}.account_id=any($${cols.length + 3 + (seen ? 1 : 0)}::uuid[])` : ''}`,
        [
          key,
          new Date(now()),
          ...cols.map((c) => fields[c]),
          ...(seen ? [seenAt] : []),
          ...(accountIds ? [accountIds] : [])
        ]
      )
    }
  }

  /** One pass: give up on exhausted rows, lease what the free slots and the hourly cap allow, run them. */
  function tick() {
    if (!ticking)
      ticking = claimAndRun()
        .catch((error) => {
          log.error?.(`[${name}] tick failed: ${error?.code ?? error?.message ?? 'error'}`)
          return 0
        })
        .finally(() => {
          ticking = null
        })
    return ticking
  }

  async function claimAndRun() {
    if (concurrency - running.size <= 0) return 0
    if (!(await enabled().catch(() => false))) return 0
    const rows = await claim()
    for (const row of rows) {
      const lease = leaseOf(row)
      const beat = setInterval(() => void renew(lease), Math.max(1000, Math.floor(leaseMs / 3)))
      beat.unref?.()
      const task = Promise.resolve()
        .then(() => run(row, lease))
        .catch((error) => log.error?.(`[${name}] ${row[K]}: ${error?.code ?? error?.message ?? 'error'}`))
        .finally(() => {
          clearInterval(beat)
          running.delete(task)
          // The follow-up claim is tracked so `drain` waits for it: otherwise a test (or shutdown)
          // that re-queues right after a run can be raced by this late tick (#1443's CI run).
          const next = tick()
          followUps.add(next)
          void next.finally(() => followUps.delete(next))
        })
      running.add(task)
    }
    return rows.length
  }

  async function claim() {
    const at = new Date(now())
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`durable-queue:${T}`])
      await client.query(
        `update ${T} set status = ${F}, error = 'attempts', lease_until = null, checked_at = $1,
           lease_token = lease_token + 1
         where status = ${Q} and attempts >= $2 and (lease_until is null or lease_until < $1)${scoped(3)}`,
        [at, maxAttempts, ...(accountIds ? [accountIds] : [])]
      )
      const { rows: used } = await client.query(
        `select count(*) filter (where lease_until >= $1)::int as busy,
                count(*) filter (where checked_at >= $2 or lease_until >= $3)::int as hour
         from ${T}`,
        [at, new Date(now() - HOUR_MS), new Date(now() - HOUR_MS + leaseMs)]
      )
      const free = Math.min(concurrency - running.size, concurrency - used[0].busy, hourlyCap - used[0].hour)
      if (free <= 0) {
        await client.query('commit')
        return []
      }
      const { rows } = await client.query(
        `update ${T} set lease_until = $1, attempts = attempts + 1, lease_token = lease_token + 1
         where ${K} in (
           select ${K} from ${T}
           where status = ${Q} and attempts < $3 and (lease_until is null or lease_until < $2)${ready}${scoped(5)}
           order by queued_at limit $4 for update skip locked)
         returning *`,
        [new Date(now() + leaseMs), at, maxAttempts, free, ...(accountIds ? [accountIds] : [])]
      )
      await client.query('commit')
      return rows
    } catch (error) {
      await client.query('rollback').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }

  function leaseOf(row) {
    const lease = {
      key: row[K],
      token: String(row.lease_token),
      queuedStatus,
      finish: (fields) => finish(lease, fields)
    }
    return lease
  }

  /** Write the verdict and end the lease, only while it is ours. @returns {Promise<boolean>} */
  async function finish(lease, fields) {
    if (queuedStatus !== 'queued' && fields.status === 'queued')
      throw new Error('durable-queue: protocol downgrade')
    const cols = columnsOf(fields)
    const { rowCount } = await pool.query(
      `update ${T} set ${[...cols.map((c, i) => `${c} = $${i + 3}`), 'lease_until = null'].join(', ')}
       where ${K} = $1 and lease_token = $2 and status = ${Q}
         and lease_until > $${cols.length + 3}${scoped(cols.length + 4)}`,
      [
        lease.key,
        lease.token,
        ...cols.map((c) => fields[c]),
        new Date(now()),
        ...(accountIds ? [accountIds] : [])
      ]
    )
    if (rowCount === 1) return true
    log.warn?.(`[${name}] ${lease.key}: lease lost, result dropped`)
    return false
  }

  async function renew(lease) {
    await pool
      .query(
        `update ${T} set lease_until = $3 where ${K} = $1 and lease_token = $2 and status = ${Q} and lease_until > $4${scoped(5)}`,
        [
          lease.key,
          lease.token,
          new Date(now() + leaseMs),
          new Date(now()),
          ...(accountIds ? [accountIds] : [])
        ]
      )
      .catch((error) => log.warn?.(`[${name}] ${lease.key}: heartbeat failed (${error?.code ?? 'error'})`))
  }

  /** Runs `tick` every `tickMs`; cheap when nothing is queued. */
  function start() {
    if (timer) return
    timer = setInterval(() => void tick(), tickMs)
    timer.unref?.()
  }

  function stop() {
    if (timer) clearInterval(timer)
    timer = null
  }

  /** Resolves once nothing claimable is left and every running row has been written (tests, shutdown). */
  async function drain() {
    for (;;) {
      const claimed = await tick()
      while (running.size > 0 || followUps.size > 0) {
        await Promise.allSettled([...running, ...followUps])
      }
      if (!claimed) return
    }
  }

  return { enqueue, tick, drain, start, stop }
}

function columnsOf(fields) {
  const cols = Object.keys(fields)
  for (const c of cols) if (!IDENT.test(c)) throw new Error(`durable-queue: bad column ${c}`)
  return cols
}
