export interface GrowthFunnelStep {
  key: 'signedIn' | 'started' | 'ready' | 'requested' | 'changed'
  people: number
  conversionPercent: number | null
  dropped: number | null
}
export interface GrowthRetentionWeek {
  week: number
  eligible: number
  pending: number
  presence: number
  requests: number
  presencePercent: number | null
  requestPercent: number | null
}
export interface GrowthChannel {
  key: string
  channel: string
  source: string
  campaign: string
  signIns: number
  sites: number
  started: number
  ready: number
  requested: number
  changed: number
  activationPercent: number | null
  requestPercent: number | null
}
export interface SignalGrowth {
  people: number
  funnel: GrowthFunnelStep[]
  timing: Record<'firstSite' | 'firstRequest', { n: number; medianSeconds: number | null }>
  retention: { week: string; people: number; weeks: GrowthRetentionWeek[] }[]
  channels: GrowthChannel[]
  coverage: {
    unknownSiteLifetimes: number
    unknownRequestClassification: number
    requestsWithoutIncarnation: number
  }
}
