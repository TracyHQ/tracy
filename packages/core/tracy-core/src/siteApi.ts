/**
 * The site-state data door of the site screen — same semantics (and same shape) as Tracy Desk's IPC
 * `preview.site_changes` / `preview.releases` / `preview.seal_changes`, but routed through the
 * cowork-web worker → the seat ledger's reskin door. Nothing runs locally.
 */

export type SiteChangeStatus = 'added' | 'modified' | 'deleted'

export interface SiteChangeFile {
  path: string
  status: SiteChangeStatus
  additions: number | null
  deletions: number | null
}

export interface SiteChanges {
  files: SiteChangeFile[]
  /** 'not-built' = no baseline yet (an offer, not an error); 'unavailable' = the fleet did not answer. */
  webroot: 'ready' | 'not-built' | 'unavailable'
  localWebrootDir: string
  codeCopySyncedAt: number | null
}

export interface SiteRelease {
  version: number
  sha: string
  at: number | null
  title: string
}

export interface SiteHistory {
  state: 'ready' | 'unavailable' | 'not-versioned'
  releases: SiteRelease[]
}

export class SiteStateError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (res.status === 401 || res.status === 403) throw new SiteStateError('NOT_SIGNED_IN', res.status)
  if (!res.ok) throw new SiteStateError(`site state ${res.status}`, res.status)
  return res.json() as Promise<T>
}

export async function siteChanges(siteKey: string): Promise<SiteChanges> {
  return getJson(`/api/sites/${encodeURIComponent(siteKey)}/changes`)
}

export async function siteHistory(siteKey: string): Promise<SiteHistory> {
  return getJson(`/api/sites/${encodeURIComponent(siteKey)}/history`)
}

export async function siteRecord(siteKey: string): Promise<{ ok: boolean; sealed: boolean; files: number }> {
  const res = await fetch(`/api/sites/${encodeURIComponent(siteKey)}/record`, { method: 'POST' })
  if (!res.ok) throw new SiteStateError(`record ${res.status}`, res.status)
  return res.json()
}
