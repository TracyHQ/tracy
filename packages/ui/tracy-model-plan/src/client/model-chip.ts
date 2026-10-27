/**
 * What one chat runs on, as the chip at its head says it (Lee, 08/10/2026: a person looking at a chat
 * must know what answers it; the agent itself says "Tracy" whatever runs it, because its preset says so).
 *
 * The chip reads the conversation's own `modelSelection` projection, which dsh computes on the host and
 * pushes only to a client following that conversation (`api-session-controller`
 * `model-selection-projection.ts`), and names a subscription route's vendor from the account status
 * (`routeVendor`). `ModelChip.tsx` decides the chip from those two.
 */
import type { AccountStatus } from './account-status.ts'

/**
 * The vendor a subscription route runs on, as the broker spells it (`providers.js` `names`, carried
 * by the status door's `providers` and `connections`); the vendor's id when the status says nothing.
 * @param provider - the route, `seat-plan-<id>`.
 * @param status - the account status, or undefined while none was read.
 */
export function routeVendor(provider: string, status: AccountStatus | undefined): string {
  const id = provider.replace(/^seat-plan-/, '')
  return (
    status?.providers.find((p) => p.id === id)?.name ||
    status?.connections.find((c) => c.provider === id)?.name ||
    id
  )
}

/** One route, as the projection carries it. */
export interface Route {
  readonly provider: string
  readonly model: string
}

/** The `modelSelection` projection's wire view (`{ lastUsed, next }`). */
export interface ModelSelectionView {
  readonly lastUsed?: Route | null
  readonly next?: Route | null
}

/** What the chip shows. `model` is absent for a chat that has not sent anything yet. */
export type Chip =
  | { readonly kind: 'plan'; readonly vendor: string; readonly model?: string }
  | { readonly kind: 'reconnect'; readonly vendor: string }
  | { readonly kind: 'tracy' }
