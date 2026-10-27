/**
 * The connect panel under the AI-account grid (Lee, 11/10/2026: "Connect now" right in the step, so
 * the step can turn Done there): which of the mock's states it shows, from the pick, the offer and
 * the sign-in under way (`@tracy/dsh-model-plan/connect`). Pure, so every state is tested without
 * React (test/connect-panel.test.mjs). Mock: tasks/evidence/desktop-onboard/mock/onboard-connect-now.html
 * `stepAI`, states A–G.
 */
import type { ConnectState } from '@tracy/dsh-model-plan/connect'
import type { Vendor } from './flow.ts'
import type { Offer } from './offer.ts'

export { offerWithStatus } from './offer.ts'

/**
 * The id of the built-in Tracy AI card (the `tracy` entry of the AI-account order on the server,
 * `apps/tracy-web/src/seat-plan/broker.js`): never a catalogue vendor, nothing to connect, and
 * picking it does not complete the step.
 */
export const TRACY = 'tracy'

/** The vendor a panel names. */
export interface PanelVendor {
  readonly id: string
  readonly name: string
}

export type PanelView =
  /** G: nothing picked. */
  | { readonly kind: 'none' }
  /** T: the built-in Tracy AI card picked: part of the account, nothing to connect. */
  | { readonly kind: 'tracy' }
  /** F: `/ops` turned connecting one's own account off. */
  | { readonly kind: 'off' }
  /** A: picked, not connected, nothing under way: "Connect now". */
  | { readonly kind: 'idle'; readonly vendor: PanelVendor }
  /**
   * B: a sign-in under way. `authorizeUrl` null while it starts; `device` = the code to type for a
   * vendor that signs in that way, else the person signs in on the page and the app catches the
   * callback (or it is pasted). `busy`: a request is out (starting, or the pasted URL went in).
   */
  | {
      readonly kind: 'pending'
      readonly vendor: PanelVendor
      readonly authorizeUrl: string | null
      readonly device: { readonly code: string } | null
      readonly busy: boolean
    }
  /** C: connected; `account` as the vendor reported it, when known. */
  | { readonly kind: 'connected'; readonly vendor: PanelVendor; readonly account: string | null }
  /** D: the last sign-in failed (expired, declined, refused). */
  | { readonly kind: 'error'; readonly vendor: PanelVendor }
  /** E: the deployment offers this vendor, but it has no sign-in: its key goes in Settings. */
  | { readonly kind: 'key'; readonly vendor: PanelVendor }

/**
 * The panel for the picked vendor.
 * @param input.attempt - the latest state of the sign-in started here, or null.
 */
export function connectPanel(input: {
  readonly catalogue: readonly Vendor[]
  readonly picked: string | null
  readonly offer: Pick<Offer, 'connect' | 'connected' | 'accounts' | 'connectable'>
  readonly attempt: ConnectState | null
}): PanelView {
  const { offer, picked } = input
  if (picked === TRACY) return { kind: 'tracy' }
  if (!offer.connect) return { kind: 'off' }
  const found = input.catalogue.find((v) => v.id === picked)
  if (picked === null || found === undefined) return { kind: 'none' }
  const vendor: PanelVendor = { id: found.id, name: found.name }
  if (offer.connected.includes(vendor.id))
    return {
      kind: 'connected',
      vendor,
      account: Object.hasOwn(offer.accounts, vendor.id) ? offer.accounts[vendor.id] : null
    }
  const attempt = input.attempt?.provider === vendor.id ? input.attempt : null
  switch (attempt?.kind) {
    case 'starting':
    case 'completing':
      return { kind: 'pending', vendor, authorizeUrl: null, device: null, busy: true }
    case 'browser':
      return { kind: 'pending', vendor, authorizeUrl: attempt.authorizeUrl, device: null, busy: false }
    case 'device':
      return {
        kind: 'pending',
        vendor,
        authorizeUrl: attempt.attempt.authorizeUrl,
        device: { code: attempt.attempt.userCode },
        busy: false
      }
    case 'failed':
      return { kind: 'error', vendor }
    case 'connected':
      return { kind: 'connected', vendor, account: null }
  }
  if (offer.connectable !== null && !offer.connectable.includes(vendor.id)) return { kind: 'key', vendor }
  return { kind: 'idle', vendor }
}
