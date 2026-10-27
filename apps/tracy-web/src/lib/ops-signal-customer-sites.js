/** Rows grouped by `keyOf`, in the order they came. */
export function groupBy(rows, keyOf) {
  const out = new Map()
  for (const row of rows) {
    const key = keyOf(row)
    if (!out.has(key)) out.set(key, [])
    out.get(key).push(row)
  }
  return out
}

const isStart = (row) => row.kind === 'site.create' || row.kind === 'site.import'
export const siteChronology = (a, b) => a.occurred_at - b.occurred_at || Number(a.id ?? 0) - Number(b.id ?? 0)

/** Immutable snapshots identify new history; legacy starts split a reused key chronologically. */
export function siteLifetimes(rows) {
  const lifetimes = []
  for (const [siteKey, events] of groupBy([...rows].sort(siteChronology), (row) => row.site_key)) {
    if (!siteKey) continue
    const instances = new Map()
    let latest = null
    for (const row of events) {
      const instance = row.site_instance ? new Date(row.site_instance).toISOString() : null
      let lifetime = instance ? instances.get(instance) : isStart(row) ? null : latest
      if (!lifetime) {
        lifetime = {
          siteKey,
          key: `${siteKey}:${instance ?? `legacy-${lifetimes.length}`}`,
          events: [],
          start: null,
          demo: null
        }
        lifetimes.push(lifetime)
        if (instance) instances.set(instance, lifetime)
      }
      lifetime.events.push(row)
      if (isStart(row)) {
        lifetime.start ??= row
        latest = lifetime
      }
      const demo = row.site_demo ?? row.demo
      if (demo === true) lifetime.demo = true
      else if (demo === false && lifetime.demo !== true) lifetime.demo = false
    }
  }
  return lifetimes
}

/**
 * One site incarnation a customer started, its signals oldest first, folded to where it stands: `built` once a
 * build ended `done`, `stuck` while the latest decisive event is a failure, `deleted`, or `pending`
 * when nothing decisive came yet. An import's `exported` result is a step on the way, not an end.
 * @param {string} siteKey
 * @param {{ kind: string, data: any, occurred_at: Date }[]} events
 */
export function customerSite(siteKey, events) {
  const start = events.find((e) => e.kind === 'site.create' || e.kind === 'site.import')
  const site = {
    siteKey,
    kind: start?.kind === 'site.import' ? 'imported' : 'created',
    platform: start?.data?.platform ?? null,
    startedAt: new Date(
      start?.site_instance ?? start?.occurred_at ?? events[0]?.occurred_at ?? 0
    ).toISOString(),
    state: 'pending',
    failures: 0,
    live: false
  }
  for (const e of events) {
    if (e.kind === 'site.result' && e.data?.outcome === 'done') site.state = 'built'
    else if (e.kind === 'site.stuck') {
      site.failures += 1
      site.state = 'stuck'
    } else if (e.kind === 'site.delete') site.state = 'deleted'
    else if (e.kind === 'site.go_live') site.live = true
  }
  return site
}
