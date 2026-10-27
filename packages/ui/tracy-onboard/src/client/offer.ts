/**
 * What the deployment offers on step 1, and where Done leads.
 *
 * The vendors come from tracy-web's public `GET /api/desktop/config` `catalogue` ({id, name,
 * homepage}, only the vendors `/ops` turned on) with `llm.connect` (whether customers may connect
 * their own account at all). A tracy-web older than that field answers no `catalogue`: then the
 * vendors are read from `GET /api/seat-plan/status` `providers` ({id, name}, the same switches), and
 * no homepage is known, so no "Install instructions" is offered (RULE 0.3: nothing invented).
 */
import type { Vendor } from './flow.ts'

export interface Offer {
  readonly catalogue: readonly Vendor[]
  /** False when `/ops` turned connecting one's own account off on this deployment. */
  readonly connect: boolean
  /**
   * The vendors the person has an AI account connected for (`GET /api/seat-plan/status`
   * `connections`): the one in use (`next`) first, then the person's route order, as the status
   * gives it.
   */
  readonly connected: readonly string[]
  /** The account each connected vendor reported (an email, a user name), by vendor id. */
  readonly accounts: Readonly<Record<string, string>>
  /**
   * The vendors that sign in through the seat-plan broker (`status.providers`); a catalogue vendor
   * outside it is connected with an API key in Settings. null when the status door was not read:
   * then nothing is claimed either way.
   */
  readonly connectable: readonly string[] | null
}

/** What a status answer says about connections, as the offer keeps it. */
function connectionsOf(status: Record<string, unknown> | null): Pick<Offer, 'connected' | 'accounts'> {
  const connections = Array.isArray(status?.connections) ? status.connections : []
  const connected: string[] = []
  const accounts: Record<string, string> = {}
  const next = status?.next as { connectionId?: unknown } | null | undefined
  const inUse = typeof next?.connectionId === 'string' ? next.connectionId : null
  for (const c of connections) {
    if (c === null || typeof c !== 'object') continue
    const { provider, account, connected: on, connectionId } = c as Record<string, unknown>
    if (on !== true || typeof provider !== 'string') continue
    if (connectionId === inUse && inUse !== null) {
      const at = connected.indexOf(provider)
      if (at !== -1) connected.splice(at, 1)
      connected.unshift(provider)
    } else if (!connected.includes(provider)) connected.push(provider)
    if (typeof account === 'string' && account.trim() !== '' && !Object.hasOwn(accounts, provider))
      accounts[provider] = account
  }
  return { connected, accounts }
}

/**
 * The ids of `status.providers` that sign in through the broker (`signIn` `browser` or `device`; a
 * tracy-web older than that field sends no `signIn`, and then every listed vendor does), or null
 * when there is no readable list. A vendor whose `signIn` is `key` (GLM, Qwen, Kimi) or a value this
 * screen does not know is left out, so its panel says to paste the key in Settings.
 */
function connectableOf(status: Record<string, unknown> | null): string[] | null {
  if (!Array.isArray(status?.providers)) return null
  return status.providers
    .filter((p: unknown) => {
      if (p === null || typeof p !== 'object') return false
      if (!Object.hasOwn(p, 'signIn')) return true
      const signIn = (p as { signIn?: unknown }).signIn
      return signIn === 'browser' || signIn === 'device'
    })
    .map((p: unknown) => (p as { id?: unknown }).id)
    .filter((id): id is string => typeof id === 'string')
}

/**
 * The offer after a status answer (a connect just now): which vendors are connected, their
 * accounts, and which can sign in. The catalogue and the `/ops` switch stay.
 */
export function offerWithStatus(offer: Offer, status: unknown): Offer {
  const read = status !== null && typeof status === 'object' ? (status as Record<string, unknown>) : null
  return { ...offer, ...connectionsOf(read), connectable: connectableOf(read) ?? offer.connectable }
}

const VENDOR_ID = /^[a-z][a-z0-9-]*$/

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

/** The well-formed vendors of a list, each once, in order. */
function vendorsOf(list: unknown): Vendor[] {
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const out: Vendor[] = []
  for (const item of list) {
    if (item === null || typeof item !== 'object') continue
    const { id, name, homepage } = item as Record<string, unknown>
    if (typeof id !== 'string' || !VENDOR_ID.test(id) || seen.has(id)) continue
    if (typeof name !== 'string' || name.trim() === '') continue
    seen.add(id)
    out.push({
      id,
      name,
      homepage: typeof homepage === 'string' && homepage.startsWith('https://') ? homepage : null
    })
  }
  return out
}

async function readJson(fetchFn: Fetch, url: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetchFn(url, { credentials: 'same-origin', cache: 'no-store' })
    if (!response.ok) return null
    const body: unknown = await response.json()
    return body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * Read the offer. Never throws: an unreadable deployment offers no vendor, connecting stays allowed
 * (the Settings section says the truth when it opens), and no account counts as connected.
 */
export async function readOffer(fetchFn: Fetch = (url, init) => fetch(url, init)): Promise<Offer> {
  const [config, status] = await Promise.all([
    readJson(fetchFn, '/api/desktop/config'),
    readJson(fetchFn, '/api/seat-plan/status')
  ])
  const llm = config?.llm as { connect?: unknown } | undefined
  const connect = llm?.connect !== false
  const catalogue = Array.isArray(config?.catalogue) ? config.catalogue : status?.providers
  return {
    catalogue: vendorsOf(catalogue),
    connect,
    ...connectionsOf(status),
    connectable: connectableOf(status)
  }
}

/**
 * The address that opens Settings › AI accounts on one vendor's row: `?settings=ai-accounts&vendor=<id>`,
 * read once on load by `@tracy/dsh-settings` (`src/client/settings-link.ts`). That plugin exports no
 * way to open a section from another plugin, so Done loads this address.
 * @param location - the current address.
 * @param vendor - the picked vendor id.
 */
export function aiAccountsAddress(
  location: Pick<Location, 'pathname' | 'search' | 'hash'>,
  vendor: string
): string {
  const params = new URLSearchParams(location.search)
  params.set('settings', 'ai-accounts')
  params.set('vendor', vendor)
  return `${location.pathname}?${params.toString()}${location.hash}`
}
