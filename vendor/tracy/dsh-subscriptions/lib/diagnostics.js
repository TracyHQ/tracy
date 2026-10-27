import { maskText } from './mask.js'
import { normalizeSlots } from './accounts.js'
import { PROVIDERS } from './refs.js'

function scrubReport(v) {
  if (typeof v === 'string') return maskText(v)
  if (Array.isArray(v)) return v.map(scrubReport)
  if (v && typeof v === 'object') {
    const o = {}
    for (const k of Object.keys(v)) o[k] = scrubReport(v[k])
    return o
  }
  return v
}

export async function createDiagnosticsReport({ live, store, history, NS, pkgVersion }) {
  const cfg = live()
  const slots = normalizeSlots(cfg.slots)
  const mk = () => ({ loggedIn: false, slots: 0, configured: 0, cooldown: 0, proxy: 0, maxUsagePercent: null })
  const providers = {}
  for (const p of PROVIDERS) providers[p] = mk()
  const logged = await store.loggedInProviders()
  for (const slot of slots) {
    const pv = providers[slot.provider] || (providers[slot.provider] = mk())
    pv.slots++
    if (slot.proxyUrl) pv.proxy++
    try {
      const info = await store.describeRef(slot.ref)
      if (info.configured) pv.configured++
      if (info.cooldownUntil && info.cooldownUntil > Date.now()) pv.cooldown++
      if (info.usagePercent != null) pv.maxUsagePercent = Math.max(pv.maxUsagePercent || 0, Math.round(info.usagePercent))
    } catch { /* best-effort */ }
  }
  for (const p of Object.keys(providers)) providers[p].loggedIn = logged.includes(p)
  const rows = history.all()
  const byStatus = {}
  for (const r of rows) {
    const k = (r.provider || '?') + ':' + (r.status || '?')
    byStatus[k] = (byStatus[k] || 0) + 1
  }
  const lastErrors = rows.filter((r) => r.status && r.status >= 400).slice(0, 10)
    .map((r) => ({ ts: r.ts, provider: r.provider, status: r.status, kind: r.kind || 'request', ms: r.ms || null }))
  return scrubReport({
    generatedAt: new Date().toISOString(),
    plugin: NS + (pkgVersion ? ' v' + pkgVersion : ''),
    runtime: { node: process.version, platform: process.platform, arch: process.arch, uptimeSec: Math.round(process.uptime()) },
    providers,
    requests: { total: rows.length, byStatus, lastErrors },
    settings: {
      cooldownMs: cfg.cooldownMs,
      switchAtRemaining: cfg.switchAtRemaining,
      probeIntervalMin: cfg.probeIntervalMin,
      useWebCallback: !!cfg.useWebCallback,
      autoLoopback: !!cfg.autoLoopback,
      privacyMask: !!cfg.privacyMask,
      customVendors: Array.isArray(cfg.customVendors) ? cfg.customVendors.length : 0,
      proxySlots: slots.filter((s) => s.proxyUrl).length,
    },
  })
}
