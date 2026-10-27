/**
 * The person's AI accounts as Settings › AI accounts reads them (`GET /api/seat-plan/status`,
 * `apps/tracy-web/src/seat-plan/broker.js` `status`), kept once per page so the account menu's row
 * and the section show the same thing: the section publishes every answer it gets (after a Connect,
 * a Disconnect, a routing change), and the row follows without a reload.
 *
 * ## Read when the page loads, once per PAGE
 *
 * The plugin asks as soon as its client starts (`prefetchAccountStatus`, from `apply`), so the
 * answer is usually there before the person first opens the account menu. Asking only when the row
 * mounted made the first opening show the name alone, the marks arriving a moment later or only on
 * the next opening (measured on dev 09/10/2026).
 *
 * The copy hangs on the document under `Symbol.for('tracy.model-plan.account-status')`, the way
 * `@tracy/core/seat/viewer` shares the viewer: a second evaluation of this bundle on the same page
 * finds the first copy instead of making its own, so there is one read and one answer for all.
 */
import { pageHolder } from '@tracy/core/seat'
import { createPlansStore } from './plans-store.ts'

export interface Connection {
  readonly connectionId: string
  /** The vendor id (`claude`, `codex`, …). */
  readonly provider: string
  /** The vendor's own name. */
  readonly name: string
  readonly account: string
  readonly connected: boolean
}

/** The slice of the status door's answer this package reads. */
export interface AccountStatus {
  readonly enabled: boolean
  /** Every vendor the deployment allows, in its order. */
  readonly providers: readonly { readonly id: string; readonly name: string }[]
  /** The person's connections, in routing order. */
  readonly connections: readonly Connection[]
}

/** The vendors the menu row shows, and whether they are the connected ones. */
export interface Stack {
  /** False: nothing is connected and `vendors` are every allowed vendor, to be drawn greyed. */
  readonly connected: boolean
  readonly vendors: readonly { readonly id: string; readonly name: string }[]
}

/**
 * @param status - the last status read, or undefined while none was (loading, or the read failed).
 * @returns the connected vendors (once each, in connection order), else every allowed vendor;
 *   undefined when there is nothing true to show.
 */
export function stackOf(status: AccountStatus | undefined): Stack | undefined {
  if (status === undefined) return undefined
  const connected: { id: string; name: string }[] = []
  for (const c of status.connections) {
    if (c.connected && !connected.some((v) => v.id === c.provider))
      connected.push({ id: c.provider, name: c.name })
  }
  if (connected.length > 0) return { connected: true, vendors: connected }
  return { connected: false, vendors: status.providers.map(({ id, name }) => ({ id, name })) }
}

/** One read of the status door; a refusal or a broken answer rejects. */
export async function readAccountStatus(): Promise<AccountStatus> {
  const response = await fetch('/api/seat-plan/status', { credentials: 'same-origin', cache: 'no-store' })
  if (!response.ok) throw new Error(`seat-plan status ${response.status}`)
  const data = (await response.json()) as AccountStatus
  if (!Array.isArray(data?.providers) || !Array.isArray(data?.connections))
    throw new Error('seat-plan status: unexpected answer')
  return data
}

const ACCOUNT_STATUS = Symbol.for('tracy.model-plan.account-status')

type AccountStatusStore = ReturnType<typeof createPlansStore<AccountStatus>>

/** The page's copy, made by the first bundle that asks. */
function pageCopy(): AccountStatusStore {
  const holder = pageHolder()
  const known = holder[ACCOUNT_STATUS] as AccountStatusStore | undefined
  if (known !== undefined) return known
  const made = createPlansStore<AccountStatus>(readAccountStatus)
  holder[ACCOUNT_STATUS] = made
  return made
}

/** The page's one copy of the status. */
export const accountStatus = pageCopy()

/** Start the page's first read if nothing is known yet (a read on its way is joined, not repeated). */
export function prefetchAccountStatus(): void {
  if (accountStatus.current() === undefined) void accountStatus.refresh()
}
