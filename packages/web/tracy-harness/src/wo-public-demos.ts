/**
 * /ops/wo › Settings › Demos for outside builders: the numbers `/v1/demos` reads (`lib/wo-public-demo-settings.js`),
 * read and saved through `/api/ops/wo/public-demos`.
 */
import type { T } from './i18n/index.ts'

export interface PublicDemoSettings {
  liveDemosPerAccount: number
  sponsoredDemoMaxCents: number
  sponsoredMonthlyBudgetCents: number
}

export interface PublicDemoSettingsDocument {
  settings: PublicDemoSettings
  updatedBy?: string | null
  updatedAt?: string | null
  writable: boolean
}

/** Each number with its label and hint keys (`wo-misc.demos.*`) and the range the server accepts. */
export const PUBLIC_DEMO_FIELDS: ReadonlyArray<{
  key: keyof PublicDemoSettings
  labelKey: string
  hintKey: string
  min: number
  max: number
}> = [
  {
    key: 'liveDemosPerAccount',
    labelKey: 'wo-misc.demos.liveLabel',
    hintKey: 'wo-misc.demos.liveHint',
    min: 0,
    max: 10_000
  },
  {
    key: 'sponsoredDemoMaxCents',
    labelKey: 'wo-misc.demos.perDemoLabel',
    hintKey: 'wo-misc.demos.perDemoHint',
    min: 1,
    max: 100_000
  },
  {
    key: 'sponsoredMonthlyBudgetCents',
    labelKey: 'wo-misc.demos.monthlyLabel',
    hintKey: 'wo-misc.demos.monthlyHint',
    min: 0,
    max: 100_000_000
  }
]

/** The first number out of its range, said as the form shows it; null when the server would accept all. */
export function publicDemoInputError(t: T, settings: PublicDemoSettings): string | null {
  for (const f of PUBLIC_DEMO_FIELDS) {
    const v = settings[f.key]
    const label = t(f.labelKey)
    if (!Number.isInteger(v)) return t('wo-misc.demos.wholeNumber', { label })
    if (v < f.min || v > f.max) return t('wo-misc.demos.range', { label, min: f.min, max: f.max })
  }
  return null
}

/** The door failed with no message of its own: `key` (`wo-misc.demos.*`) words it on screen. */
export class PublicDemosDoorError extends Error {
  readonly key: string
  readonly status: number
  constructor(key: string, status: number) {
    super(`${key} (HTTP ${status})`)
    this.key = key
    this.status = status
  }
}

async function answered(res: Response, key: string): Promise<PublicDemoSettingsDocument> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const said = err?.message || err?.error
    throw said ? new Error(said) : new PublicDemosDoorError(key, res.status)
  }
  return res.json()
}

export async function readPublicDemoSettings(
  fetchImpl: typeof fetch = fetch
): Promise<PublicDemoSettingsDocument> {
  const res = await fetchImpl('/api/ops/wo/public-demos', {
    credentials: 'same-origin',
    headers: { accept: 'application/json' }
  })
  return answered(res, 'wo-misc.demos.readFailed')
}

export async function savePublicDemoSettings(
  settings: Partial<PublicDemoSettings>,
  fetchImpl: typeof fetch = fetch
): Promise<PublicDemoSettingsDocument> {
  const res = await fetchImpl('/api/ops/wo/public-demos', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ settings })
  })
  return answered(res, 'wo-misc.demos.saveFailed')
}
