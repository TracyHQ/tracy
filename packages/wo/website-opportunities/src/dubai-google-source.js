/** Bounded Google discovery with durable receipts before importing restaurant seeds. */
import { createHash } from 'node:crypto'
import { BudgetExceededError } from './cost-ledger.js'

const SOURCE_KEY = 'dubai-google-v1'
const URL = 'https://places.googleapis.com/v1/places:searchText'
const MAX_BYTES = 2 * 1024 * 1024
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const failure = (code) => Object.assign(new Error(code), { code })

export function createDubaiGoogleSource({ pool, runtime, ledger, loadDomain, fetchImpl, resolve }) {
  return async function discover({ receivedOnly = false } = {}) {
    const { keys } = await runtime()
    if (!keys.google && !receivedOnly) throw failure('CREDENTIAL_MISSING')
    const domain = await loadDomain()
    const batch = (
      await pool.query(
        `insert into wo_prefetch_source_batch(source_key) values($1)
        on conflict(source_key) do update set source_key=excluded.source_key returning id`,
        [SOURCE_KEY]
      )
    ).rows[0]
    let page = 0
    const receipts = []
    const guardedFetch = async (url, init) => {
      const index = page++
      const headers = new Headers(init.headers)
      if (
        url !== URL ||
        init.method !== 'POST' ||
        index >= 3 ||
        headers.get('x-goog-fieldmask') !== domain.GPLACES_TEXT_FIELDS
      )
        throw failure('PREFETCH_UNEXPECTED_PROVIDER_REQUEST')
      const fingerprint = hash([url, init.method, headers.get('x-goog-fieldmask'), init.body])
      await pool.query(
        `insert into wo_prefetch_source_page(source_key,page,request_hash)
        values($1,$2,$3) on conflict do nothing`,
        [SOURCE_KEY, index, fingerprint]
      )
      const receipt = (
        await pool.query(
          `select * from wo_prefetch_source_page
        where source_key=$1 and page=$2`,
          [SOURCE_KEY, index]
        )
      ).rows[0]
      if (receipt.request_hash !== fingerprint) throw failure('PREFETCH_SOURCE_REQUEST_CHANGED')
      if (receipt.state === 'received') {
        // Persisted bytes survive an importer crash, and retain their original age.
        await ledger.settle({ id: receipt.reservation_id })
        receipts.push(receipt)
        return new Response(receipt.response.body, { status: receipt.http_status })
      }
      if (receivedOnly) throw failure('PREFETCH_RECEIVED_SOURCE_REQUIRED')
      if (receipt.state !== 'planned') throw failure('PREFETCH_SOURCE_RECEIPT_UNKNOWN')
      const admitted = await ledger.reserve(
        {
          provider: 'google',
          operation: 'place-search-text',
          maxCents: 5,
          prefetchCampaignId: 'dubai',
          prefetchRequireEnabled: false,
          jobId: batch.id,
          requestKey: `${SOURCE_KEY}:${index}:${fingerprint}`
        },
        {
          onAdmitted: async (db, reservation) => {
            if (reservation.replayed) throw failure('PREFETCH_SOURCE_RECEIPT_UNKNOWN')
            const changed = await db.query(
              `update wo_prefetch_source_page
          set state='starting',reservation_id=$3
          where source_key=$1 and page=$2 and state='planned' and request_hash=$4`,
              [SOURCE_KEY, index, reservation.id, fingerprint]
            )
            if (changed.rowCount !== 1) throw failure('PREFETCH_SOURCE_RECEIPT_UNKNOWN')
          }
        }
      )
      if (!admitted.ok) throw new BudgetExceededError(admitted)
      const { reservation } = admitted
      try {
        const response = await fetchImpl(url, init)
        // Read once, under the caller's abort signal. An incomplete body is an unknown receipt.
        const reader = response.body?.getReader()
        const chunks = []
        let size = 0
        if (reader)
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            size += value.byteLength
            if (size > MAX_BYTES) {
              await reader.cancel().catch(() => {})
              throw failure('PREFETCH_SOURCE_RESPONSE_TOO_LARGE')
            }
            chunks.push(value)
          }
        const bytes = new Uint8Array(size)
        let offset = 0
        for (const chunk of chunks) {
          bytes.set(chunk, offset)
          offset += chunk.byteLength
        }
        const body = new TextDecoder().decode(bytes)
        const saved = (
          await pool.query(
            `update wo_prefetch_source_page
          set state='received',http_status=$3,response=$4,received_at=now()
          where source_key=$1 and page=$2 and state='starting' and reservation_id=$5 returning *`,
            [SOURCE_KEY, index, response.status, { body }, reservation.id]
          )
        ).rows[0]
        if (!saved) throw failure('PREFETCH_SOURCE_RECEIPT_LOST')
        receipts.push(saved)
        await ledger.settle(reservation)
        return new Response(body, { status: response.status })
      } catch (error) {
        await ledger.unreconcile(reservation)
        // Provider errors must never include credential-bearing request data.
        throw failure(
          error?.code === 'PREFETCH_SOURCE_RESPONSE_TOO_LARGE'
            ? error.code
            : 'PREFETCH_SOURCE_RECEIPT_UNKNOWN'
        )
      }
    }
    const result = await domain.searchPlacesText(
      {
        lat: 25.1972,
        lon: 55.2744,
        radiusM: 10000,
        limit: 60,
        kinds: ['restaurants']
      },
      { googleKey: keys.google, fetch: guardedFetch, resolve, timeoutMs: 30000 }
    )
    const fetchedAt = receipts.map((r) => new Date(r.received_at).toISOString()).sort()[0]
    return {
      candidates: result.candidates,
      source: {
        id: 'google-places-text',
        url: URL,
        fetchedAt,
        revision: hash(receipts.map((r) => [r.request_hash, r.response, r.received_at])),
        attribution: 'Google Maps',
        center: { lat: 25.1972, lon: 55.2744 },
        radiusM: 10000,
        pages: result.pages,
        returnedCandidates: result.candidates.length
      }
    }
  }
}
