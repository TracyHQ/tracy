/**
 * The hub decides pending observations against what it reads ITSELF (ADR 0036 Phase 3). A contributor's source is a
 * claim; the hub groups observations by the source object they name (`<family>:<object id>`, hub-determined), reads
 * that object once through a verification adapter, and judges every pending observation of the group against it.
 * Many accounts resending one Google record are one group, one read, one charge.
 *
 * No lowered bar: a source family or field no adapter supports is rejected as `unsupported_source`; when the
 * verification budget or the ledger's caps refuse the read, observations wait as `deferred_budget`; a failed read
 * leaves them pending (`verify_failed`), never turned into "not there".
 *
 * A verification adapter:
 *   { family, subjectNamespace, provider, operation, collectorVersion, fields: Set<string>,
 *     available(): Promise<boolean>, read(objectId): Promise<object>   // `{found: false}` when the source has none
 *     judge(field, value, result): { status: 'accepted' | 'rejected', reason: string | null } }
 */
import { createHash, randomUUID } from 'node:crypto'
import { canonicalJson } from '../canonical-json.js'
import { BUDGET_EXCEEDED, withCharge } from '../cost-ledger.js'
import { ceilingCents } from '../cost-prices.js'
import { fetchPlaceVerification } from '../../domain/gplaces-details.mjs'
import { settleContributionStatus } from './contributions.js'
import { weeklyPeriods } from './observations.js'

/** `pg_try_advisory_lock` id: one verifier at a time, so the verification budget check holds. */
const VERIFY_LOCK_ID = 7_243_060
export const VERIFY_PURPOSE = 'hub-verify'
/** DEFAULT: a read younger than this is reused for new observations of the same source object. */
export const DEFAULT_EVIDENCE_FRESH_MS = 24 * 60 * 60_000
/** DEFAULT: what the hub may spend per UTC day on verifying contributions, below the ledger's own caps. */
export const DEFAULT_VERIFY_DAILY_CAP_CENTS = 500

const accepted = { status: 'accepted', reason: null }
const differs = { status: 'rejected', reason: 'differs_from_source' }
const missing = { status: 'rejected', reason: 'not_in_source' }

const words = (s) =>
  String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
const site = (u) => {
  try {
    const url = new URL(u)
    return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`
  } catch {
    return null
  }
}
/** `Italian Restaurant`, `italian-restaurant` and `italian_restaurant` name one Google place type. */
const typeKey = (s) => words(s).replace(/ /g, '_')
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])
const digits = (s) => String(s ?? '').replace(/\D/g, '')
const metres = (a, b) => {
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLon = rad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}
/** Two point readings of one place may differ by this much. */
const SAME_PLACE_METRES = 150

/**
 * Google Places details: identity, name, website, phone, address, location, rating, category (the primary type) and
 * opening hours (normalized weekly periods, or the weekday text word for word) of a Google place. Email, social
 * profiles and photo references have no Google field to check against: `unsupported_source`.
 * `fetch` is the deployment's pinned, private-address-refusing fetch; `resolve` its DNS check.
 * @param {{ googleKey: () => Promise<string | null | undefined>, fetch?: typeof fetch, resolve?: Function,
 *   read?: typeof fetchPlaceVerification }} deps
 */
export function createGooglePlacesAdapter({ googleKey, fetch, resolve, read = fetchPlaceVerification }) {
  return {
    family: 'google_maps',
    subjectNamespace: 'google',
    provider: 'google',
    operation: 'place-details',
    collectorVersion: 'google-places-details/1',
    fields: new Set([
      'identity',
      'name',
      'website',
      'phone',
      'address',
      'location',
      'rating',
      'category',
      'opening_hours'
    ]),
    async available() {
      return Boolean(await googleKey())
    },
    async read(objectId) {
      return read(objectId, { googleKey: await googleKey(), fetch, resolve })
    },
    judge(field, value, r) {
      if (!r?.found) return missing
      switch (field) {
        case 'identity':
          if (value.namespace !== 'google') return { status: 'rejected', reason: 'unsupported_source' }
          return value.externalId === r.id ? accepted : differs
        case 'name':
          return !r.name ? missing : words(value) === words(r.name) ? accepted : differs
        case 'website':
          return !r.website ? missing : site(value) && site(value) === site(r.website) ? accepted : differs
        case 'address':
          return !r.address ? missing : words(value) === words(r.address) ? accepted : differs
        case 'phone': {
          if (!r.phones?.length) return missing
          const mine = digits(value)
          const tail = (d) => d.slice(-9)
          return r.phones.some(
            (p) => digits(p) === mine || (mine.length >= 7 && tail(digits(p)) === tail(mine))
          )
            ? accepted
            : differs
        }
        case 'location':
          return !r.location ? missing : metres(value, r.location) <= SAME_PLACE_METRES ? accepted : differs
        case 'rating': {
          if (r.rating == null || r.reviewCount == null) return missing
          const slack = Math.max(5, Math.ceil(r.reviewCount * 0.05))
          return Math.abs(value.rating - r.rating) <= 0.1 &&
            Math.abs(value.reviewCount - r.reviewCount) <= slack
            ? accepted
            : differs
        }
        case 'category':
          return !r.category ? missing : typeKey(value) === typeKey(r.category) ? accepted : differs
        case 'opening_hours': {
          const hours = r.openingHours
          if (value.periods) {
            const theirs = weeklyPeriods(hours?.periods ?? [])
            if (!theirs) return missing
            return sameList(value.periods, theirs) ? accepted : differs
          }
          if (!hours?.weekdayText?.length) return missing
          return sameList(value.weekdayText.map(words), hours.weekdayText.map(words)) ? accepted : differs
        }
        default:
          return { status: 'rejected', reason: 'unsupported_source' }
      }
    }
  }
}

/**
 * @param {{ pool: import('pg').Pool, adapters: object[], ledger: ReturnType<typeof import('../cost-ledger.js').createCostLedger>,
 *   verifyDailyCapCents?: number, evidenceFreshMs?: number, now?: () => number, log?: Console }} deps
 */
export function createVerifyQueue({
  pool,
  adapters,
  ledger,
  verifyDailyCapCents = DEFAULT_VERIFY_DAILY_CAP_CENTS,
  evidenceFreshMs = DEFAULT_EVIDENCE_FRESH_MS,
  now = Date.now,
  log = console
}) {
  const byFamily = new Map(adapters.map((a) => [a.family, a]))
  const at = () => new Date(now()).toISOString()

  /** Decides up to `maxGroups` source groups. Answers what it did; `skipped` when another verifier holds the lock. */
  async function tick({ maxGroups = 20 } = {}) {
    const lock = await pool.connect()
    const out = { skipped: false, groups: 0, fetched: 0, decided: 0, deferred: 0 }
    try {
      const { rows } = await lock.query('select pg_try_advisory_lock($1) as ok', [VERIFY_LOCK_ID])
      if (!rows[0].ok) return { ...out, skipped: true }
      try {
        const groups = (
          await pool.query(
            // Oldest waiting first, so deferred groups do not starve newer ones or the reverse.
            `select o.claimed_source_family as family, o.claimed_source_object_id as object_id
             from wo_hub_observation o join wo_hub_contribution c on c.id = o.contribution_id
             where o.status = 'pending'
             group by 1, 2 order by min(c.received_at), 1, 2 limit $1`,
            [maxGroups]
          )
        ).rows
        for (const g of groups) {
          out.groups++
          const r = await verifyGroup(g.family, g.object_id)
          out.fetched += r.fetched
          out.decided += r.decided
          out.deferred += r.deferred
        }
      } finally {
        await lock.query('select pg_advisory_unlock($1)', [VERIFY_LOCK_ID]).catch(() => {})
      }
    } finally {
      lock.release()
    }
    return out
  }

  async function pendingOf(family, objectId) {
    return (
      await pool.query(
        `select id, contribution_id, subject_namespace, subject_external_id, field, value
         from wo_hub_observation
         where status = 'pending' and claimed_source_family = $1 and claimed_source_object_id = $2`,
        [family, objectId]
      )
    ).rows
  }

  async function decide(rows, verdictOf, evidence) {
    if (!rows.length) return 0
    const client = await pool.connect()
    let decided = 0
    try {
      await client.query('begin')
      const when = at()
      for (const row of rows) {
        const verdict = verdictOf(row)
        // Only a still-pending observation is decided: a withdraw that landed meanwhile wins.
        const { rowCount } = await client.query(
          `update wo_hub_observation set status = $2, reason = $3, decided_at = $4
           where id = $1 and status = 'pending'`,
          [row.id, verdict.status, verdict.reason, when]
        )
        if (!rowCount) continue
        decided++
        if (evidence) {
          await client.query(
            `insert into wo_hub_evidence (observation_id, source_family, source_object_id, source_group, fetch_id,
               fetched_at, content_hash, collector_version, result)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
            [
              row.id,
              evidence.family,
              evidence.objectId,
              evidence.group,
              evidence.fetchId,
              evidence.fetchedAt,
              evidence.contentHash,
              evidence.collectorVersion,
              JSON.stringify(evidence.result)
            ]
          )
        }
      }
      await settleContributionStatus(client, [...new Set(rows.map((r) => r.contribution_id))])
      await client.query('commit')
    } catch (error) {
      await client.query('rollback').catch(() => {})
      throw error
    } finally {
      client.release()
    }
    return decided
  }

  async function wait(rows, reason) {
    if (!rows.length) return
    await pool.query(
      `update wo_hub_observation set reason = $2 where id = any($1::uuid[]) and status = 'pending'`,
      [rows.map((r) => r.id), reason]
    )
  }

  async function freshEvidence(group) {
    const { rows } = await pool.query(
      `select fetch_id, fetched_at, content_hash, collector_version, result from wo_hub_evidence
       where source_group = $1 and fetched_at > $2 order by fetched_at desc limit 1`,
      [group, new Date(now() - evidenceFreshMs).toISOString()]
    )
    const r = rows[0]
    return r
      ? {
          fetchId: r.fetch_id,
          fetchedAt: r.fetched_at.toISOString(),
          contentHash: r.content_hash,
          collectorVersion: r.collector_version,
          result: r.result
        }
      : null
  }

  async function verifySpentToday() {
    const { rows } = await pool.query(
      `select coalesce(sum(case state when 'released' then 0 when 'settled' then coalesce(actual_cents, reserved_cents)
         else greatest(reserved_cents, coalesce(actual_cents, 0)) end), 0)::int as cents
       from wo_cost_ledger where purpose = $1 and budget_day = $2`,
      [VERIFY_PURPOSE, at().slice(0, 10)]
    )
    return rows[0].cents
  }

  async function verifyGroup(family, objectId) {
    const done = { fetched: 0, decided: 0, deferred: 0 }
    const rows = await pendingOf(family, objectId)
    const adapter = byFamily.get(family)
    const unsupported = { status: 'rejected', reason: 'unsupported_source' }
    if (!adapter) {
      done.decided += await decide(rows, () => unsupported, null)
      return done
    }
    const subjectOk = (r) =>
      r.subject_namespace === adapter.subjectNamespace && r.subject_external_id === objectId
    const early = rows.filter((r) => !adapter.fields.has(r.field) || !subjectOk(r))
    done.decided += await decide(
      early,
      (r) => (adapter.fields.has(r.field) ? { status: 'rejected', reason: 'subject_mismatch' } : unsupported),
      null
    )
    const open = rows.filter((r) => !early.includes(r))
    if (!open.length) return done

    const group = `${family}:${objectId}`
    let evidence = await freshEvidence(group)
    if (!evidence) {
      if (!(await adapter.available())) {
        await wait(open, 'verifier_unavailable')
        return done
      }
      const maxCents = ceilingCents(adapter.provider, adapter.operation)
      if ((await verifySpentToday()) + maxCents > verifyDailyCapCents) {
        await wait(open, 'deferred_budget')
        done.deferred += open.length
        return done
      }
      const fetchId = randomUUID()
      let result
      try {
        result = await withCharge(
          ledger,
          {
            provider: adapter.provider,
            operation: adapter.operation,
            maxCents,
            purpose: VERIFY_PURPOSE,
            payer: { kind: 'operator' },
            requestKey: `${VERIFY_PURPOSE}:${fetchId}`
          },
          () => adapter.read(objectId)
        )
      } catch (error) {
        if (error?.code === BUDGET_EXCEEDED) {
          await wait(open, 'deferred_budget')
          done.deferred += open.length
          return done
        }
        log.warn?.(`[wo hub] verification read of ${group} failed: ${error?.code ?? error?.message}`)
        await wait(open, 'verify_failed')
        return done
      }
      done.fetched++
      evidence = {
        fetchId,
        fetchedAt: at(),
        contentHash: createHash('sha256').update(canonicalJson(result)).digest('hex'),
        collectorVersion: adapter.collectorVersion,
        result
      }
    }
    done.decided += await decide(open, (r) => adapter.judge(r.field, r.value, evidence.result), {
      ...evidence,
      family,
      objectId,
      group
    })
    return done
  }

  return { tick }
}
