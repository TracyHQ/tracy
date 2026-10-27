// The provider order of each research capability on /ops/wo › Settings (`providerOrder`). The server owns
// the catalogue and each provider's state (`GET /api/ops/wo` › `capabilities`); this file only edits the order.
import { relativeTime } from './cms/relative-time.ts'
import { formatNumber } from './i18n/format.ts'
import type { T } from './i18n/index.ts'
import { formatUsd } from './wo-places-format.ts'

export type WoProviderState = 'connected' | 'missing_key' | 'limit_reached' | 'error'

/** Why a provider placed ahead of `than` looks misordered; `times` null = it never gave a usable result (rate) or `than` costs nothing (cost). */
export interface WoProviderMisorder {
  basis: 'cost' | 'rate'
  than: string
  times: number | null
}

/**
 * A provider's numbers over the last 30 days (`website-opportunities/src/provider-report.js`). Below the
 * group's `reportMinCalls` only `calls` is known. `cost.kind`: `real` = reported by the provider,
 * `ceiling` = the reserved most, `none` = no paid call recorded.
 */
export type WoProviderReport =
  | { enough: false; calls: number }
  | {
      enough: true
      calls: number
      usable: number
      usableRate: number
      cost: { kind: 'real' | 'ceiling' | 'none'; perCallCents: number | null; perUsableCents: number | null }
      misordered?: WoProviderMisorder
    }

export interface WoCapabilityProvider {
  id: string
  label: string
  credential: string | null
  state: WoProviderState
  lastError?: { reason: string; at: string }
  /** Absent on older servers. */
  report?: WoProviderReport
}

export interface WoCapabilityGroup {
  id: string
  label: string
  providers: WoCapabilityProvider[]
  /** The order research runs now; `declared` false = the group's default (`defaultOrder`). */
  order: string[]
  declared: boolean
  defaultOrder: string[]
  /** False while research still reads this group's old setting or fixed order: shown, not editable. */
  wired?: boolean
  /** Calls a provider needs before its numbers show. */
  reportMinCalls?: number
}

/** `{ [group]: providerId[] }`; a group left out runs its default, `[]` is off. */
export type WoProviderOrder = Partial<Record<string, string[]>>

/** The order a group shows in the draft: the operator's declared list, else its default. */
export function draftOrderOf(
  group: WoCapabilityGroup,
  providerOrder: WoProviderOrder | undefined
): { order: string[]; declared: boolean } {
  const declared = providerOrder?.[group.id]
  return Array.isArray(declared)
    ? { order: declared, declared: true }
    : { order: group.defaultOrder, declared: false }
}

/** `id` moved one place up (`-1`) or down (`1`); at either end it stays. */
export function moved(order: readonly string[], id: string, delta: -1 | 1): string[] {
  const next = [...order]
  const i = next.indexOf(id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= next.length) return next
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

/** `order` with `id` first. */
export function asDefault(order: readonly string[], id: string): string[] {
  return [id, ...order.filter((x) => x !== id)]
}

export function withoutProvider(order: readonly string[], id: string): string[] {
  return order.filter((x) => x !== id)
}

/** `providerOrder` with one group's list set, or forgotten (`null`) so it runs its default again. */
export function withGroupOrder(
  providerOrder: WoProviderOrder | undefined,
  groupId: string,
  order: string[] | null
): WoProviderOrder {
  const next: WoProviderOrder = { ...providerOrder }
  if (order === null) delete next[groupId]
  else next[groupId] = order
  return next
}

const STATES = new Set<string>(['connected', 'missing_key', 'limit_reached', 'error'])
const REASONS = new Set(['credential_invalid', 'quota', 'provider_error', 'timeout'])

/** A provider's state badge; an unknown state or error reason shows its own code. */
export function providerStateText(t: T, provider: WoCapabilityProvider, now: number = Date.now()): string {
  if (provider.state !== 'error' || !provider.lastError)
    return STATES.has(provider.state) ? t(`wo-misc.state.${provider.state}`) : provider.state
  const code = provider.lastError.reason
  const reason = REASONS.has(code) ? t(`wo-misc.reason.${code}`) : code
  const ago = relativeTime(provider.lastError.at, now)
  return ago
    ? t('wo-misc.state.lastErrorAgo', { reason, ago })
    : t('wo-misc.state.lastErrorReason', { reason })
}

const dollars = (cents: number, locale: string) => formatUsd(cents / 100, locale, [3, 3])
const timesText = (n: number, locale: string) =>
  `${formatNumber(n, { minimumFractionDigits: Number.isInteger(n) ? 0 : 1, maximumFractionDigits: 1, useGrouping: false }, locale)}×`

/** The muted line under a provider short of data, or its numbers; null on an older server. */
export function providerReportText(
  t: T,
  provider: WoCapabilityProvider,
  minCalls: number,
  locale = 'en'
): string | null {
  const r = provider.report
  if (!r) return null
  if (!r.enough) return t('wo-misc.report.short', { calls: r.calls, min: minCalls })
  const parts = [
    t('wo-misc.report.calls', { count: r.calls }),
    t('wo-misc.report.usable', { percent: Math.round(r.usableRate * 100) })
  ]
  const { kind, perCallCents, perUsableCents } = r.cost
  if (kind === 'none' || perCallCents === null) parts.push(t('wo-misc.report.noCost'))
  else {
    const most = kind === 'ceiling' ? 'AtMost' : ''
    parts.push(t(`wo-misc.report.perCall${most}`, { amount: dollars(perCallCents, locale) }))
    if (perUsableCents !== null)
      parts.push(t(`wo-misc.report.perUsable${most}`, { amount: dollars(perUsableCents, locale) }))
    if (kind === 'ceiling') parts.push(t('wo-misc.report.ceiling'))
  }
  return parts.join(' · ')
}

/** The one-line reason a provider is marked, naming the one placed after it. */
export function misorderText(t: T, misordered: WoProviderMisorder, thanLabel: string, locale = 'en'): string {
  const than = thanLabel
  if (misordered.basis === 'cost' && misordered.times === null)
    return t('wo-misc.misorder.costFree', { than })
  if (misordered.basis === 'cost')
    return t('wo-misc.misorder.cost', { than, times: timesText(misordered.times ?? 0, locale) })
  if (misordered.times === null) return t('wo-misc.misorder.rateNever', { than })
  return t('wo-misc.misorder.rate', { than, times: timesText(misordered.times, locale) })
}
