/**
 * `/ops/wo` › Chain builds: the door of `apps/tracy-web/src/ops/wo.js` (`/api/ops/wo/chain-builds`) and the helpers the
 * table shows with. Minutes and USD are the runs' own records; nothing here estimates.
 */
import { formatNumber } from './i18n/format.ts'
import { tr } from './i18n/index.ts'

export interface ChainBuildStep {
  step: string
  minutes: number
  usd: number
  outcome: string
  error: string | null
}

export interface ChainBuild {
  siteKey: string
  label: string | null
  address: string | null
  template: string | null
  startedAt: string
  totalMinutes: number
  totalUsd: number
  /** `running`: the run is going; `failed`: it died without finishing its record (a hard failure). */
  ending: 'complete' | 'soft-failure' | 'failed' | 'running'
  failedStep: string | null
  /** The steps under way, while the build is running. */
  runningSteps: string[]
  steps: ChainBuildStep[]
  /** Far above the usual duration of the builds listed. */
  slow: boolean
}

export interface ChainBuildsDocument {
  builds: ChainBuild[]
  medianMinutes: number
  slowAfterMinutes: number | null
}

/** The steps the chain measures, in the order they are shown; any other name is shown as it comes. */
export const CHAIN_STEPS = ['site', 'kit', 'brand', 'plan', 'copy', 'pictures', 'write'] as const

/** The outcomes a step can carry (`step-chain.js`); any other word is shown as it comes. */
export const CHAIN_OUTCOMES = ['done', 'failed', 'failed, best version used', 'skipped', 'stopped'] as const

export async function fetchChainBuilds(fetchImpl: typeof fetch = fetch): Promise<ChainBuildsDocument> {
  const res = await fetchImpl('/api/ops/wo/chain-builds', {
    credentials: 'same-origin',
    headers: { accept: 'application/json' }
  })
  if (!res.ok) throw new Error(tr('wo-builds.loadFailed', { status: res.status }))
  return res.json()
}

/** Minutes with one decimal under ten ("0.4", "12"), in the language on screen. */
export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes)) return formatNumber(0)
  return formatNumber(minutes, { maximumFractionDigits: minutes < 10 ? 1 : 0 })
}

/** USD with cents ("$2.40"); under a cent it keeps four places so a cheap step is not shown as free. */
export function formatUsd(usd: number): string {
  const safe = Number.isFinite(usd) && usd > 0 ? usd : 0
  const places = safe > 0 && safe < 0.01 ? 4 : 2
  return `$${formatNumber(safe, { minimumFractionDigits: places, maximumFractionDigits: places })}`
}
