/** Rich social receipts are shared by every job researching the same verified place input. */
import { createHash } from 'node:crypto'
import { BudgetExceededError } from './cost-ledger.js'

const unknown = () =>
  Object.assign(new Error('Provider start has no complete receipt; automatic retry is blocked'), {
    code: 'SOURCE_START_UNKNOWN'
  })
const MONTH = 30 * 86400000

export function createPlacePaidReceipts({ pool, ledger, now = Date.now }) {
  return async function collect({ placeId, jobId, source, input, force = false, spec }, call) {
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex')
    const family = `with recursive family(id) as (select $1::uuid union all
      select p.id from wo_place p join family f on p.merged_into=f.id)`
    const latest = async (db) =>
      (
        await db.query(
          `${family} select * from wo_place_paid_receipt
      where place_id in (select id from family) and source=$2 and request_hash=$3 order by created_at desc,id desc limit 1`,
          [placeId, source, fingerprint]
        )
      ).rows[0]
    const pending = async (db) =>
      (
        await db.query(
          `${family} select 1 from wo_place_paid_receipt
      where place_id in (select id from family) and source=$2 and state='starting' limit 1`,
          [placeId, source]
        )
      ).rowCount > 0
    const reusable = (row) =>
      row &&
      row.state === 'received' &&
      // A resumed attempt consumes its terminal answer at its original age. A new job may refresh
      // this negative observation after one hour; unknown starts never gain a time-based retry.
      ((row.job_id === jobId && row.response?.status === 'failed' && row.response?.reason === 'not_found') ||
        now() - Date.parse(row.fetched_at) <
          (row.response?.status === 'blocked' ||
          ['quota', 'rate_limited', 'not_found'].includes(row.response?.reason)
            ? 60 * 60000
            : MONTH)) &&
      (!force || row.job_id === jobId)
    const row = await latest(pool)
    if (await pending(pool)) throw unknown()
    if (reusable(row)) {
      await ledger.settle({ id: row.reservation_id })
      return { result: row.response, fetchedAt: new Date(row.fetched_at), replayed: true }
    }
    let receiptId
    const answer = await ledger.reserve(
      { ...spec, placeId, jobId },
      {
        onAdmitted: async (db, reservation) => {
          // The ledger lock serializes all admissions, including a replacement job for this input.
          const previous = await latest(db)
          if ((await pending(db)) || reusable(previous) || reservation.replayed) throw unknown()
          receiptId = (
            await db.query(
              `insert into wo_place_paid_receipt
        (place_id,source,job_id,request_hash,reservation_id,state) values($1,$2,$3,$4,$5,'starting') returning id`,
              [placeId, source, jobId, fingerprint, reservation.id]
            )
          ).rows[0].id
        }
      }
    )
    if (!answer.ok) throw new BudgetExceededError(answer)
    try {
      const result = await call()
      // collectOne also converts transport exceptions into failed results. Neither proves a POST failed before billing.
      // An explicit missing-profile response is a known terminal answer, even though the source
      // status is failed. Transport/provider failures still cannot establish a safe start outcome.
      if (
        (result.status === 'failed' && result.reason !== 'not_found') ||
        ['timeout', 'network', 'error'].includes(result.reason)
      )
        throw unknown()
      const fetchedAt = new Date(now())
      await pool.query(
        `update wo_place_paid_receipt set state='received',response=$2,fetched_at=$3
        where id=$1 and state='starting'`,
        [receiptId, result, fetchedAt]
      )
      await ledger.settle(answer.reservation)
      return { result, fetchedAt, replayed: false }
    } catch {
      await ledger.unreconcile(answer.reservation)
      throw unknown()
    }
  }
}
