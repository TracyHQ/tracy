/**
 * One more ask after a network failure, before a tab says "Could not reach the site".
 *
 * `fetch` throws a `TypeError` when no answer came back at all (the connection dropped, a proxy
 * restarted, the laptop changed networks); a door that answered — a refusal, a 202 still building —
 * is a `SiteApiError` and has its own handling in the views, so it is passed on untouched.
 */

const NETWORK_RETRY_WAIT_MS = 800

/**
 * Run `ask`; when it throws a network failure, wait `waitMs` and run it once more.
 * @param ask the read, e.g. `() => readActivityV2(siteKey, { filter })`
 */
export async function retryOnNetworkError<T>(
  ask: () => Promise<T>,
  { waitMs = NETWORK_RETRY_WAIT_MS }: { waitMs?: number } = {}
): Promise<T> {
  try {
    return await ask()
  } catch (error) {
    if (!(error instanceof TypeError)) throw error
    await new Promise((resolve) => setTimeout(resolve, waitMs))
    return ask()
  }
}
