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
