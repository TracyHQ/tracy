/**
 * What a customer reads when a brand extraction or removal fails (#811 F-S5-008).
 *
 * Until 11/10 the client showed whatever it had: `HTTP 403` when a door answered without a code,
 * the engine's own English `error` text for any code without a sentence, and a job named `?` when
 * the Brand tab's own-site extraction was refused (that job then matched no host, so the tab showed
 * nothing at all). Every failure now maps to a translated sentence; raw codes stay in `data-*`.
 */
import type { Translate } from './strings'

/** The code a refused request leaves behind. A door that names its own code keeps it, except a
 *  401/403: whatever the gateway calls it, the customer's reading is "not allowed here". */
export function refusalCode(status: number, body: unknown): string {
  if (status === 401 || status === 403) return 'NOT_ALLOWED'
  const code = body && typeof body === 'object' ? (body as { code?: unknown }).code : undefined
  if (typeof code === 'string' && code !== '') return code
  return 'UNAVAILABLE'
}

/** The sentence for a failure code; a code with no sentence gets the general one, never itself. */
export function failureText(code: string | undefined, t: Translate): string {
  if (code) {
    const key = `job.failed.${code}`
    const s = t(key)
    if (s !== key) return s
  }
  return t('job.failed.other')
}

/** The host a job is filed under: the address typed, or the tab's own site when none was typed. */
export function hostOfInput(url: string | null, ownSite: string | null): string {
  const raw = (url ?? ownSite ?? '').trim()
  let host = raw
  try {
    host = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname
  } catch {
    return raw
  }
  return host.toLowerCase().replace(/^www\./, '')
}
