/**
 * Site name on Tracy (#519): what the inline editor of the Business brief's first row says while a seller types the
 * site label. Characters and length answer at once from the limits the server sends; whether the name is free (and the
 * rest of the create door's rule) comes from the check door (`GET …/:id/site-label/check`), read only when it answers
 * for the very text typed.
 */

/** The limits the server sends with the label (`GET …/:id/site-label`). */
export interface SiteLabelRules {
  min: number
  max: number
}

/** The check door's answer for one typed text. */
export interface SiteLabelCheck {
  label: string
  available: boolean
  reason?: string
}

export interface SiteLabelVerdict {
  /** `unchanged`: the saved name; `checking`: well formed, waiting for the check; `free`: may be saved. */
  state: 'invalid' | 'checking' | 'free' | 'unchanged'
  /** The plain sentence to show, a strings key; null when there is nothing to say. */
  key: string | null
}

const ALLOWED = /^[a-z0-9-]*$/

/** The server's reasons in plain sentences; an unknown one reads as the general rule. */
const REASONS: Record<string, string> = {
  taken: 'site.name.taken',
  reserved: 'site.name.reserved',
  looks_imported: 'site.name.reserved',
  shape: 'site.name.edges'
}

export function siteLabelVerdict(
  typed: string,
  saved: string,
  rules: SiteLabelRules,
  check: SiteLabelCheck | null
): SiteLabelVerdict {
  const label = typed.trim()
  if (label !== '' && label === saved) return { state: 'unchanged', key: null }
  if (!ALLOWED.test(label)) return { state: 'invalid', key: 'site.name.chars' }
  if (label.length > rules.max) return { state: 'invalid', key: 'site.name.long' }
  if (label.length < rules.min) return { state: 'invalid', key: 'site.name.short' }
  if (check === null || check.label !== label) return { state: 'checking', key: null }
  if (check.available) return { state: 'free', key: null }
  return { state: 'invalid', key: REASONS[check.reason ?? ''] ?? 'site.name.edges' }
}

/** The address a label gives on this deployment, as the server names its parts. */
export function siteAddress(label: string, parts: { prefix: string; domain: string }): string {
  return `${parts.prefix}${label}.${parts.domain}`
}
