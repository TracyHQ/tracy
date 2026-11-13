/**
 * The sources of the build chat's research (#609): the website and the social pages the owner's links name, each read
 * once by the Website Opportunities connector of its kind (`domain.connectorsFor`, the same the research executor
 * runs), with the executor's own limits: 40 website pages, 20 posts a social page, the operator's per-run charge
 * ceiling (`/ops/wo` `maxChargeUsdPerRun`) and the account's daily count of paid runs (`apify-budget.js`, injected as
 * `paidRunAllowed`). A source switched off on `/ops/wo` is skipped as there.
 *
 * Every read shares one deadline: each fetch carries its signal, and a read still going when it passes ends as
 * `timeout` with nothing kept from it. The rows are in the shape a `wo_source` row has, held in memory only.
 */

/** The executor's limits (`executor.js` `WEBSITE_PAGES`, `collectLimit`). */
export const WEBSITE_PAGES = 40
export const POSTS_PER_SOURCE = 20

const COLLECTED = new Set(['complete', 'partial'])
export const isCollected = (row) => COLLECTED.has(row?.status)

/** A fetch whose every call also stops at `signal`. */
export function boundedFetch(fetchImpl, signal) {
  return (input, init = {}) =>
    fetchImpl(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal, signal]) : signal })
}

/** The answer of `run()`, or `{timedOut: true}` once `ms` has passed. */
export async function withinTime(run, ms) {
  let timer
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), Math.max(0, ms))
  })
  try {
    return await Promise.race([run(), late])
  } finally {
    clearTimeout(timer)
  }
}

const row = (source, ref, status, reason, extra = {}) => ({
  source,
  ref,
  status,
  reason,
  cursor: null,
  coverage: extra.coverage ?? { fetched: 0 },
  collected: extra.collected ?? {}
})

/**
 * One read of one source, as the executor's `collectOne` makes it: a connector that cannot run is `blocked` with its
 * reason, a refused address `blocked`/`url_blocked`, a charge refused `skipped`/`cost`, anything else `failed`.
 */
async function readOne({ connector, source, ref, limit, deps, maxChargeUsd, remaining, merge }) {
  if (!connector?.available) return row(source, ref, 'blocked', connector?.reason ?? 'unsupported')
  const answer = await withinTime(async () => {
    try {
      return await connector.collect(ref, { cursor: null, limit }, { ...deps, maxChargeUsd })
    } catch (error) {
      if (error?.code === 'URL_BLOCKED') return { status: 'blocked', reason: 'url_blocked' }
      if (error?.name === 'BudgetExceededError' || error?.code === 'BUDGET_EXCEEDED')
        return { status: 'skipped', reason: 'cost' }
      if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return { timedOut: true }
      return { status: 'failed', reason: 'error' }
    }
  }, remaining())
  if (answer.timedOut) return row(source, ref, 'failed', 'timeout')
  if (!COLLECTED.has(answer.status))
    return row(source, ref, answer.status ?? 'failed', answer.reason ?? 'error', {
      coverage: answer.coverage ?? { fetched: 0 }
    })
  return row(source, ref, answer.status, answer.reason ?? null, {
    coverage: answer.coverage ?? { fetched: 0 },
    collected: merge(null, answer)
  })
}

/**
 * Read every source the refs name, the website first; social pages the website links to are read too, as the
 * executor does. Answers the rows in collection order.
 * @param {{refs: Record<string, string>, connectors: object, settings: object, keys: object, sources: string[],
 *   socialSources: string[], refsOfUrls: Function, mergeCollected: Function, paidRunAllowed: () => Promise<boolean>,
 *   deps: object, remaining: () => number}} input
 */
export async function readSources(input) {
  const { connectors, settings, keys, sources, socialSources, refsOfUrls, mergeCollected } = input
  const refs = { ...input.refs }
  const rows = []
  for (const source of sources) {
    const ref = refs[source]
    if (!ref) continue
    if (input.remaining() <= 0) {
      rows.push(row(source, ref, 'failed', 'timeout'))
      continue
    }
    if (settings?.autoCollectSources?.[source] === false) {
      rows.push(row(source, ref, 'skipped', 'switched_off'))
      continue
    }
    const paid = socialSources.includes(source) && connectors[source]?.available && keys?.apify
    if (paid && !(await input.paidRunAllowed())) {
      rows.push(row(source, ref, 'skipped', 'quota'))
      continue
    }
    const read = await readOne({
      connector: connectors[source],
      source,
      ref,
      limit: source === 'website' ? WEBSITE_PAGES : POSTS_PER_SOURCE,
      deps: input.deps,
      maxChargeUsd: settings?.maxChargeUsdPerRun,
      remaining: input.remaining,
      merge: mergeCollected
    })
    rows.push(read)
    // The website names the business's social pages: they are read too (`executor.js` collection).
    if (source === 'website' && isCollected(read)) {
      const found = refsOfUrls(read.collected?.profile?.links ?? [])
      for (const social of socialSources) if (found[social] && !refs[social]) refs[social] = found[social]
    }
  }
  return rows
}
