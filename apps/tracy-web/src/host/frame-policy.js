import { hostCall, signedHosts } from './client.js'

/** Only a vouched preview calls this; its public origin comes from server configuration. */
export function managedFramePolicy({ config, fetchImpl = fetch, now = Date.now }) {
  const settled = new Map(),
    running = new Map()
  return async (site) => {
    if (!site.label || !site.host || !config.hosts || !signedHosts(config).includes(site.host)) return true
    const key = `${site.host}:${site.label}:${site.updated_at ?? ''}:${config.origin}`
    if ((settled.get(key) ?? 0) > now()) return true
    if (!running.has(key)) {
      const work = hostCall(
        config,
        site.host,
        '/frame-policy',
        { label: site.label },
        { fetchImpl, timeoutMs: 50_000 }
      )
        .then((answer) => {
          const ready = answer.ok && ['current', 'updated', 'unmanaged'].includes(answer.body?.state)
          if (ready) {
            if (settled.size >= 1024) settled.delete(settled.keys().next().value)
            settled.set(key, now() + 30_000)
          }
          return ready
        })
        .catch(() => false)
        .finally(() => running.delete(key))
      running.set(key, work)
    }
    return running.get(key)
  }
}

/**
 * Every EmDash site's frame policy brought up to date once, when a serving tracy-web starts after a
 * deploy, one site at a time (#205). An EmDash site takes its policy from its container's environment,
 * so a changed policy or public origin recreates its web container — done at the owner's first open,
 * it blanked the Browser tab for 33 s and the agent's first read died with the container. Done here,
 * the open finds it current. A site the host answers `current` for costs one call and nothing else.
 * @param {{ pool: import('pg').Pool, ensure: (site: object) => Promise<boolean>, log?: { info?: Function, warn?: Function }, pauseMs?: number }} deps
 */
export async function warmFramePolicies({ pool, ensure, log, pauseMs = 500 }) {
  const { rows } = await pool.query("select * from site where platform = 'emdash' order by label")
  let ready = 0
  for (const site of rows) {
    if (await ensure(site).catch(() => false)) ready += 1
    if (pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, pauseMs))
  }
  log?.info?.(`[frame-policy] EmDash sites checked at start: ${ready} of ${rows.length} ready`)
  return { checked: rows.length, ready }
}
