// BENCH ONLY. The real site door of the write step bench's site creator: the same HTTP doors a customer's browser
// uses, called as the bench account with a session cookie minted from the server secret. Nothing here is a shortcut
// around the product: create is POST /api/sites naming the template card a customer presses and its quickstart
// (answers 202 with a job id), the job is read from
// GET /api/sites/:key/jobs/:id, the contract from the Apply door (content.contract inspect), and the delete is
// DELETE /api/sites/:key, which only the site's owner may call. Step 9b's comment requests and turn undo go through the
// customer's doors too (`requests`, `undoTurn`).
import { mintSession } from '../lib/session.js'

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * @param {{ baseUrl: string, hostHeader?: string, secret: string, email: string, platform: string,
 *   templateOf: (quickstart: string) => Promise<string | null>, fetchImpl?: typeof fetch, sleep?: (ms: number) => Promise<void>, now?: () => number }} input
 *   `baseUrl`: where the web app answers (inside its container, the loopback address and its port);
 *   `hostHeader`: the public host name when `baseUrl` is not it;
 *   `templateOf`: the template card of a quickstart, since a customer's site starts from a card.
 */
export function httpSiteDoor(input) {
  const {
    baseUrl,
    hostHeader,
    secret,
    email,
    platform,
    templateOf,
    fetchImpl = fetch,
    sleep = sleepFor
  } = input
  async function call(method, path, body) {
    const token = await mintSession(email, secret)
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        cookie: `tracy_sess=${token}`,
        ...(hostHeader ? { host: hostHeader } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' })
      },
      signal: AbortSignal.timeout(120_000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
    const text = await response.text()
    let parsed = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {}
    return { status: response.status, body: parsed }
  }
  const keyPath = (siteKey) => `/api/sites/${encodeURIComponent(siteKey)}`

  return {
    async create({ label, quickstart }) {
      const design = await templateOf(quickstart)
      if (!design)
        return {
          ok: false,
          code: 'NO_TEMPLATE_CARD',
          reason: `no template card installs ${quickstart} on this server`
        }
      const answer = await call('POST', '/api/sites', { label, platform, design, quickstart })
      const b = answer.body ?? {}
      if (answer.status !== 202 || !b.siteKey || !b.jobId)
        return {
          ok: false,
          code: b.code ?? `HTTP_${answer.status}`,
          reason:
            `POST /api/sites answered ${answer.status} ${b.code ?? ''}${b.reason ? ` (${b.reason})` : ''}`.trim()
        }
      return { ok: true, siteKey: b.siteKey, jobId: b.jobId }
    },
    async job(siteKey, jobId) {
      const answer = await call('GET', `${keyPath(siteKey)}/jobs/${encodeURIComponent(jobId)}`)
      const b = answer.body ?? {}
      if (answer.status >= 500 || answer.status === 0) return { state: 'running', step: b.step }
      if (answer.status >= 400)
        return {
          state: 'failed',
          step: b.step,
          reason: `the job door answered ${answer.status} ${b.code ?? ''}`.trim()
        }
      return {
        state: b.state === 'done' ? 'done' : b.state === 'failed' ? 'failed' : 'running',
        step: b.step,
        reason:
          b.error ??
          b.reason ??
          b.detail?.error ??
          b.message ??
          (b.state === 'failed' ? JSON.stringify(b).slice(0, 300) : undefined)
      }
    },
    async inspect(siteKey) {
      const answer = await call('POST', `${keyPath(siteKey)}/apply`, {
        action: 'content.contract',
        params: { operation: 'inspect' }
      })
      const b = answer.body ?? {}
      if (answer.status >= 400 || b.ok === false)
        return {
          ok: false,
          code: b.code ?? `HTTP_${answer.status}`,
          message: b.message ?? b.error?.message ?? b.code
        }
      const contract = b.contract ?? b.result?.contract ?? b.data?.contract
      return { ok: true, contract: typeof contract === 'string' ? contract : null }
    },
    /**
     * One call through the Apply door, for the write step: the plugin's answer as it came, `errors[]` included. An answer
     * the door gave instead of the plugin is shaped as a refusal, so the caller reads one kind of answer.
     */
    async apply({ siteKey, action, params }) {
      const answer = await call('POST', `${keyPath(siteKey)}/apply`, { action, params })
      const b = answer.body ?? {}
      if (answer.status < 400 && answer.body) return b
      const nested = typeof b.error === 'object' && b.error !== null ? b.error : null
      return {
        ...b,
        ok: false,
        status: answer.status,
        code: b.code ?? nested?.code ?? `HTTP_${answer.status}`,
        ...(nested ? { error: nested.code, message: nested.message } : {})
      }
    },
    /**
     * Step 9b's comment requests, through the door a preview's "Send to Tracy" calls (`POST /api/sites/:key/requests`): one
     * numbered request per item, `{ ok, requests: [{ id, n }] }`, or the refusal with its code and `retryAfter`.
     */
    async requests(siteKey, body) {
      const answer = await call('POST', `${keyPath(siteKey)}/requests`, body)
      const b = answer.body ?? {}
      if (answer.status === 201 && Array.isArray(b.requests)) return { ok: true, requests: b.requests }
      return {
        ok: false,
        status: answer.status,
        code: b.code ?? `HTTP_${answer.status}`,
        retryAfter: b.retryAfter ?? null
      }
    },
    /** Undo of one whole chat turn, through the door Site changes calls (`POST /api/sites/:key/turns/undo`). */
    async undoTurn(siteKey, body) {
      const answer = await call('POST', `${keyPath(siteKey)}/turns/undo`, body)
      const b = answer.body ?? {}
      if (answer.status < 400 && b.ok !== false) return { ok: true, ...b }
      return { ...b, ok: false, status: answer.status, code: b.code ?? `HTTP_${answer.status}` }
    },
    /** The newest point the host proves holds files and a database, pinned before any chain write. */
    async recoveryPoint(siteKey) {
      const answer = await call('GET', `${keyPath(siteKey)}/backups`)
      if (answer.status !== 200 || answer.body?.may?.restoreEverything !== true) return null
      const points = (answer.body?.rows ?? [])
        .filter(
          (p) =>
            p.kind === 'backup' &&
            Number.isSafeInteger(p.version) &&
            p.version > 0 &&
            /^[a-f0-9]{40,64}$/.test(p.sha ?? '') &&
            p.database?.state === 'full' &&
            /^[a-f0-9]{64}$/.test(p.database.sha256 ?? '')
        )
        .sort((a, b) => b.version - a.version)
      const point = points[0]
      return point ? { version: point.version, sha: point.sha, database: point.database } : null
    },
    /** Replays one restore operation until verified; a pending/unknown host answer never means success. */
    async restorePoint(siteKey, point, idemKey) {
      const current = await call('GET', `${keyPath(siteKey)}/backups`)
      const same = current.body?.rows?.find((p) => p.kind === 'backup' && p.version === point.version)
      if (
        current.status !== 200 ||
        same?.sha !== point.sha ||
        same.database?.state !== 'full' ||
        same.database.sha256 !== point.database.sha256
      )
        return { ok: false, code: 'RECOVERY_POINT_CHANGED' }
      for (let attempt = 0; attempt < 3; attempt++) {
        const answer = await call('POST', `${keyPath(siteKey)}/restore`, {
          mode: 'everything',
          version: point.version,
          confirm: 'restore',
          idemKey
        })
        const b = answer.body ?? {}
        if (answer.status === 200 && b.ok === true && b.status === 'succeeded')
          return { ok: true, operationId: b.operationId, version: point.version, head: b.head }
        if (!b.operationId || !['pending', 'unknown'].includes(b.status))
          return { ok: false, code: b.code ?? `HTTP_${answer.status}`, operationId: b.operationId }
        await sleep(10_000)
      }
      return { ok: false, code: 'RESTORE_PENDING' }
    },
    async remove(siteKey) {
      for (let attempt = 0; attempt < 30; attempt++) {
        const answer = await call('DELETE', keyPath(siteKey))
        const b = answer.body ?? {}
        if (answer.status === 200 && b.removed === true) return { ok: true }
        if (answer.status === 404 && b.code === 'SITE_UNKNOWN') return { ok: true }
        if (answer.status !== 202 && answer.status !== 409)
          return { ok: false, reason: `DELETE answered ${answer.status} ${b.code ?? ''}`.trim() }
        await sleep(10_000)
      }
      return { ok: false, reason: 'the delete was still pending after 5 minutes' }
    }
  }
}
