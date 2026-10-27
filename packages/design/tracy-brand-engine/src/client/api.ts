/**
 * Everything the two tabs fetch, in one place, all through `dshUrl()`: these are doors of this
 * plugin's own host half, and under `cowork.tracy.ai/<siteKey>/` a root-absolute path knocks on
 * the Worker instead (gate `check-dsh-paths`).
 */
import { dshUrl } from './dsh-url'
import { refusalCode } from './failure'

export type Kind = 'own' | 'reference'

/** One extracted brand, as `GET /brands` lists it: the manifest plus a summary of brand.json. */
export interface BrandRow {
  id: string
  host: string
  kind: Kind
  name: string
  category: string
  description: string
  source: { url: string; finalUrl: string; extractedAt: string; thin: boolean; blocked: boolean }
  refined: string[]
  counts: Record<string, number>
  brand: {
    name: string
    tagline: string
    logo: string | null
    colors: { role: string; hex: string }[]
    display: string | null
    body: string | null
    /** `imagery/<file>` paths brand.json lists, in gallery order (≤ 8). */
    imagery: string[]
  } | null
}

export interface Step {
  step: string
  detail?: string
  at: number
}

/** One extraction, as the host reports it while it runs and once it ended. */
export interface Job {
  host: string
  kind: Kind
  state: 'running' | 'done' | 'failed'
  startedAt: number
  endedAt?: number
  steps: Step[]
  manifest?: BrandRow
  error?: { code: string; error: string }
}

const door = (rest: string): string => dshUrl(`/api/tracy-brand-engine/${rest}`)

export async function fetchBrands(): Promise<BrandRow[]> {
  const res = await fetch(door('brands'), { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`brands: ${res.status}`)
  const body = (await res.json()) as { brands?: BrandRow[] }
  return body.brands ?? []
}

/** Start (or join) an extraction. `url` absent means the site this lane serves. */
export async function startExtract(url: string | null, kind?: Kind): Promise<Job | { refused: string }> {
  const body: Record<string, string> = {}
  if (url) body.url = url
  if (kind) body.kind = kind
  let res: Response
  try {
    res = await fetch(door('extract'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body)
    })
  } catch {
    return { refused: 'UNAVAILABLE' }
  }
  const json = (await res.json().catch(() => ({}))) as Partial<Job> & { code?: string; error?: string }
  if (!res.ok) return { refused: refusalCode(res.status, json) }
  return json as Job
}

/**
 * "Fork a site": crawl `url` into Brand/<host>/pages/, extract it as a reference (recon included when
 * the lane has a browser) and leave docs/agents/start-from.json. A fresh result comes back at once as
 * `{ reused: true }` — the door is idempotent, so a reload of `?fork=` costs nothing.
 */
export async function startFrom(
  url: string
): Promise<Job | { reused: true; host: string } | { refused: string }> {
  let res: Response
  try {
    res = await fetch(door('start-from'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ url })
    })
  } catch {
    return { refused: 'UNAVAILABLE' }
  }
  const json = (await res.json().catch(() => ({}))) as Partial<Job> & {
    code?: string
    reused?: boolean
    host?: string
  }
  if (!res.ok) return { refused: refusalCode(res.status, json) }
  if (json.reused === true && typeof json.host === 'string') return { reused: true, host: json.host }
  return json as Job
}

/** Every job the host half remembers (newest first) — running, done or failed. */
export async function fetchJobs(): Promise<Job[]> {
  const res = await fetch(door('jobs'), { headers: { accept: 'application/json' } })
  if (!res.ok) return []
  const body = (await res.json()) as { jobs?: Job[] }
  return body.jobs ?? []
}

export async function fetchJob(host: string): Promise<Job | null> {
  const res = await fetch(door(`extract/${encodeURIComponent(host)}`), {
    headers: { accept: 'application/json' }
  })
  if (!res.ok) return null
  return (await res.json()) as Job
}

export async function removeBrand(host: string): Promise<boolean> {
  try {
    const res = await fetch(door(`brands/${encodeURIComponent(host)}`), { method: 'DELETE' })
    return res.ok
  } catch {
    return false
  }
}

/** The `<img src>` of a downloaded logo; `brand.logo` is `logos/<file>` as brand.json writes it. */
export function logoUrl(host: string, logo: string): string {
  const file = logo.replace(/^logos\//, '')
  return door(`brands/${encodeURIComponent(host)}/logos/${encodeURIComponent(file)}`)
}

/** The `<img src>` of a harvested image; `imagery.samples[].file` is `imagery/<file>`. */
export function imageryUrl(host: string, sample: string): string {
  const file = sample.replace(/^imagery\//, '')
  return door(`brands/${encodeURIComponent(host)}/imagery/${encodeURIComponent(file)}`)
}
