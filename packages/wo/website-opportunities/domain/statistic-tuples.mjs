// A statistic travels as one sourced unit. The frozen brief's accepted facts, never a fresh profile, own its number.
import { readFileSync } from 'node:fs'

const LABELS = JSON.parse(readFileSync(new URL('./stat-labels.json', import.meta.url), 'utf8'))
const PLATFORMS = { google: 'Google', 'google-places': 'Google', 'google-maps': 'Google', instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', tripadvisor: 'Tripadvisor' }
const word = (v) => typeof v === 'string' ? v.trim() : ''

/** Every accepted typed number, with its metric, attribution and evidence kept together. */
export function acceptedStatisticTuples(brief, { locale = 'en' } = {}) {
  const out = []
  const seen = new Set()
  for (const f of brief?.facts ?? []) {
    const v = f?.value
    if (f?.onSite !== true || !Number.isFinite(v?.amount) || v.amount < 0 || !LABELS.en[v.label]) continue
    const sources = (f.evidence ?? []).filter((e) => word(e?.source) || word(e?.url))
    if (!sources.length) continue
    const scope = word(v.scope)
    const platform = [scope, ...sources.flatMap((s) => [s.source, s.url])].map((s) => {
      const direct = PLATFORMS[String(s).toLowerCase()]
      if (direct) return direct
      try {
        const host = new URL(s).hostname.toLowerCase()
        return Object.entries(PLATFORMS).find(([key]) => host === `${key}.com` || host.endsWith(`.${key}.com`))?.[1]
      } catch { return null }
    }).find(Boolean) ?? (f.field === 'googleRating' ? 'Google' : scope)
    if (!platform) continue
    const key = `${platform}:${v.label}`
    if (seen.has(key)) continue
    seen.add(key)
    const label = (LABELS[locale]?.[v.label] ?? LABELS.en[v.label]).replace('{platform}', platform)
    out.push({ kind: `typed:${key}`, factId: f.id, value: String(v.amount), label, line: platform,
      sources, metric: v.label, platform })
  }
  return out
}

/** The frozen plan's number and accompanying words bypass copy-profile gaps and model guards together. */
export function plannedStatisticValues(plan) {
  return Object.fromEntries(Object.entries(plan?.honesty?.values ?? {})
    .filter(([, v]) => v?.reason === 'brief-statistic' && typeof v.value === 'string' && v.value.trim())
    .map(([key, v]) => [key, v.value]))
}

/** Give every writer the same accepted facts; missing numbers require taking off the whole statistic tile. */
export function statisticWriterLines(brief) {
  const facts = acceptedStatisticTuples(brief)
  return [
    'A statistic tile must show one accepted number with its matching label and source as one unit. Never replace a statistic number with a place or prose. If no complete statistic fits, take off the tile or its statistic group.',
    ...facts.map((f) => JSON.stringify({ number: f.value, label: f.label, source: f.platform, evidence: f.sources }))
  ]
}
