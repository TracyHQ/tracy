/**
 * One read of the host's `GET job`, told apart into the three answers a caller acts on differently
 * (review of #1181, M2): a job to follow, the host's own word that there is none (`404 NO_JOB`), and
 * a read that could not be made at all — a network drop, a 5xx, a 401 while the session re-mints, a
 * page that is not the host's JSON. Only the second means "no job"; the Build card used to read all
 * three failures as that and froze on "Starting the build…" for the whole call.
 *
 * @typedef {{ state: 'job', job: any } | { state: 'none' } | { state: 'unreadable' }} JobRead
 */

/**
 * @param {string} url
 * @param {RequestInit} init
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<JobRead>}
 */
export async function readJobAt(url, init, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(url, init)
    if (res.ok) return { state: 'job', job: await res.json() }
    if (res.status === 404) {
      const body = await res.json().catch(() => null)
      if (body?.code === 'NO_JOB') return { state: 'none' }
    }
    return { state: 'unreadable' }
  } catch {
    return { state: 'unreadable' }
  }
}
