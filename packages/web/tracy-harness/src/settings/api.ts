/**
 * What `/api/ops/general` and `/api/ops/servers` answer.
 *
 * 🔒 EVERY FIELD HERE IS READ-ONLY, and the types say so rather than leaving it to a comment: the
 * doors carry a literal `writable: false`, because layer A has no write path at all. The day a
 * `system_setting` row lands, that literal becomes a boolean and every screen that ignored it
 * stops compiling — which is the point of typing it now.
 *
 * ⚠ `agent` AND `pictures` HAVE NO `configured` FIELD, ON PURPOSE. `tracy-web` cannot see those
 * two keys; they reach `tracy-dsh` and the seeder through compose. A union, not an optional
 * boolean, so a screen cannot write `door.configured ? 'on' : 'off'` and quietly print "off" for a
 * door nobody asked.
 */

export interface VisibleModelDoor {
  configured: boolean
  baseUrl: string | null
  words: string | null
  keyHint: string | null
  writable: false
  where: string
}

export interface OpaqueModelDoor {
  visible: false
  where: string
  note: string
}

export interface Integration {
  id: string
  label: string
  ready: boolean
  keys: string[]
  /** The keys actually absent — the field that turns "nobody set this up" into an errand. */
  missing: string[]
  note: string | null
}

export interface General {
  deployment: {
    origin: string
    siteDomain: string
    siteDomainAliases: string[]
    siteAddressPrefix: string
    sessionDomain: string | null
    guestSiteKey: string | null
    hostOrg: string
    badgeUrl: string
  }
  model: { text: VisibleModelDoor; agent: OpaqueModelDoor; pictures: OpaqueModelDoor }
  signin: {
    mail: { kind: string; from: string | null }
    oauth: { google: boolean; github: boolean }
    turnstile: { configured: boolean; disabled: boolean }
    localLoginPreview: boolean
  }
  limits: {
    sessionTtlS: number
    otpTtlMs: number
    otpMaxAttempts: number
    writesPerHour: number
    designReadsPerDay: number
    designWordsPerDay: number
    designBrandPerDay: number
    teamMaxEmails: number
    teamMaxSites: number
    writable: false
    where: string
  }
  integrations: Integration[]
  naming: { reserved: string[]; writable: false; where: string }
  writable: false
}

export type ServerRole = 'newSites' | 'demo' | 'onboarding' | 'landing'

export interface ServerRow {
  name: string
  kind: 'host' | 'record'
  origin: string
  dshOrigin: string | null
  /** `null` means roles DO NOT APPLY (a record-only target Tracy never installs onto) — which is a
   * different statement from `[]`, "configured to do nothing". The screen draws them differently. */
  roles: ServerRole[] | null
  colocated: boolean
  serverName?: string
  serverIp?: string | null
  reachable?: boolean
}

export interface Servers {
  servers: ServerRow[]
  roleLabels: Record<ServerRole, string>
  note: string
  writable: false
}

/** `null` on any refusal — these screens report configuration; none of them is worth an error
 * dialog, and the panel says "could not read" in place of its fields. */
async function read<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const response = await fetch(path, { signal, headers: { accept: 'application/json' } })
    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  }
}

export const fetchGeneral = (signal?: AbortSignal) => read<General>('/api/ops/general', signal)
export const fetchServers = (signal?: AbortSignal) => read<Servers>('/api/ops/servers', signal)
