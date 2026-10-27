/**
 * What `/api/ops/mail` answers, and the two other doors the Mail screen calls — the pure half of
 * `Mail.tsx`, so `node --test` can pin it without a browser (it imports nothing at run time).
 *
 * The shapes are the contract between the parts (the internal customer-site mail plan):
 *   GET /api/ops/mail                 → {enabled, mode, domain, globalDaily, usedToday, sites:[…]}
 *   PUT /api/ops/mail/sites/:key      ← {mode?, hourly?, daily?}   (null = back to the default)
 *   GET /api/ops/mail/log?siteKey=&limit=
 *   DELETE /api/ops/mail/sites/:key/domain   (release a site's own domain on Tracy's Resend account)
 *
 * 🔒 A FIELD THE DOOR DID NOT SEND STAYS `null`. The screen draws a dash for it, never a number typed
 * here: a made-up limit or count is worse than an empty cell, because ops would act on it.
 *
 * ⚠ THE LOG'S ROW SHAPE IS NOT IN THE CONTRACT (only its query is). `parseLog` therefore reads the
 * names a row is most likely to carry and keeps whatever it cannot place out of the table rather
 * than guessing at it; tighten it once `apps/tracy-web` settles the shape.
 */

export type SiteMailMode = 'tracy' | 'tracy-domain' | 'own-smtp' | 'own-cms' | 'off'
export const SITE_MAIL_MODES: readonly SiteMailMode[] = [
  'tracy',
  'tracy-domain',
  'own-smtp',
  'own-cms',
  'off'
]

/** Dictionary key (`ns/mail.ts`) of a mode's ops words: short, because they sit in a table cell. */
export const MODE_KEY: Record<SiteMailMode, string> = {
  tracy: 'mail.mode.tracy',
  'tracy-domain': 'mail.mode.tracyDomain',
  'own-smtp': 'mail.mode.ownSmtp',
  'own-cms': 'mail.mode.ownCms',
  off: 'mail.mode.off'
}

/** The deployment-wide switch (`SITE_MAIL`), as dictionary keys: `log` records and sends nothing. */
export const RELAY_KEY: Record<'off' | 'log' | 'smtp', string> = {
  off: 'mail.relay.off',
  log: 'mail.relay.log',
  smtp: 'mail.relay.smtp'
}

export interface OpsMailSite {
  siteKey: string
  label: string | null
  mode: SiteMailMode | null
  fromAddress: string | null
  hourly: number | null
  daily: number | null
  sentToday: number | null
  domain: string | null
  domainStatus: string | null
  /** Tracy created this domain on its Resend account, so Tracy (and only Tracy) deletes it. */
  domainOwned: boolean | null
  domainPendingSince: string | null
  /** When the release clock deletes it if it is still unverified. */
  domainReleaseAt: string | null
  /** When the release clock deleted it (`domainStatus` then reads `expired`). */
  domainReleasedAt: string | null
  lastError: string | null
}

/** Domains on Tracy's shared Resend account: `used` as Resend counts them, `limit` from the env. */
export interface DomainSlots {
  used: number | null
  limit: number | null
}

export interface OpsMail {
  enabled: boolean
  mode: 'off' | 'log' | 'smtp' | null
  domain: string | null
  globalDaily: number | null
  usedToday: number | null
  domainSlots: DomainSlots | null
  domainPendingDays: number | null
  sites: OpsMailSite[]
  /** Not in the contract: the door may add it (as other `/api/ops/*` doors do). `null` = not said. */
  writable: boolean | null
}

export interface MailLogEntry {
  at: string | null
  siteKey: string | null
  result: string | null
  code: string | null
  to: string | null
  subject: string | null
  error: string | null
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const pick = (o: Record<string, unknown>, ...names: string[]): unknown => {
  for (const n of names) if (o[n] !== undefined && o[n] !== null) return o[n]
  return null
}
const isMode = (v: unknown): v is SiteMailMode =>
  typeof v === 'string' && (SITE_MAIL_MODES as readonly string[]).includes(v)

export function parseOpsMail(body: unknown): OpsMail | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (typeof b.enabled !== 'boolean') return null
  const relay = b.mode === 'off' || b.mode === 'log' || b.mode === 'smtp' ? b.mode : null
  const sites = Array.isArray(b.sites) ? b.sites : []
  return {
    enabled: b.enabled,
    mode: relay,
    domain: str(b.domain),
    globalDaily: num(b.globalDaily),
    usedToday: num(b.usedToday),
    domainSlots:
      b.domainSlots && typeof b.domainSlots === 'object'
        ? {
            used: num((b.domainSlots as Record<string, unknown>).used),
            limit: num((b.domainSlots as Record<string, unknown>).limit)
          }
        : null,
    domainPendingDays: num(b.domainPendingDays),
    writable: typeof b.writable === 'boolean' ? b.writable : null,
    sites: sites
      .filter(
        (s): s is Record<string, unknown> => !!s && typeof s === 'object' && typeof s.siteKey === 'string'
      )
      .map((s) => ({
        siteKey: s.siteKey as string,
        label: str(s.label),
        mode: isMode(s.mode) ? s.mode : null,
        fromAddress: str(s.fromAddress),
        hourly: num(s.hourly),
        daily: num(s.daily),
        sentToday: num(s.sentToday),
        domain: str(s.domain),
        domainStatus: str(s.domainStatus),
        domainOwned: typeof s.domainOwned === 'boolean' ? s.domainOwned : null,
        domainPendingSince: str(s.domainPendingSince),
        domainReleaseAt: str(s.domainReleaseAt),
        domainReleasedAt: str(s.domainReleasedAt),
        lastError: str(s.lastError)
      }))
  }
}

export function parseLog(body: unknown): MailLogEntry[] {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const rows = Array.isArray(body) ? body : (pick(b, 'entries', 'log', 'rows', 'items') ?? [])
  if (!Array.isArray(rows)) return []
  return rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => {
      const to = pick(r, 'to', 'recipients')
      return {
        at: str(pick(r, 'at', 'createdAt', 'created_at', 'sentAt', 'sent_at')),
        siteKey: str(pick(r, 'siteKey', 'site_key', 'label')),
        result: str(pick(r, 'status', 'outcome', 'result')),
        code: str(pick(r, 'code')),
        to: Array.isArray(to) ? to.filter((x) => typeof x === 'string').join(', ') || null : str(to),
        subject: str(pick(r, 'subject')),
        error: str(pick(r, 'error', 'lastError', 'last_error'))
      }
    })
}

/**
 * A limit typed into a cell: empty is `null` ("back to the default", as the contract says), a
 * whole number of zero or more is itself, anything else is refused before it reaches the door.
 */
export function limitInput(raw: string): number | null | 'invalid' {
  const v = raw.trim()
  if (v === '') return null
  if (!/^\d{1,7}$/.test(v)) return 'invalid'
  return Number(v)
}

export interface SiteEdit {
  mode: SiteMailMode | null
  hourly: string
  daily: string
}

export const editFrom = (site: OpsMailSite): SiteEdit => ({
  mode: site.mode,
  hourly: site.hourly === null ? '' : String(site.hourly),
  daily: site.daily === null ? '' : String(site.daily)
})

/**
 * The PUT body: ONLY what changed. A cell left as it was is not sent, so opening a row and saving
 * cannot turn a default into a fixed override. `null` when nothing changed or a cell is invalid.
 */
export function editBody(site: OpsMailSite, edit: SiteEdit): Record<string, unknown> | null {
  const before = editFrom(site)
  const body: Record<string, unknown> = {}
  if (edit.mode !== before.mode && edit.mode !== null) body.mode = edit.mode
  for (const key of ['hourly', 'daily'] as const) {
    if (edit[key].trim() === before[key]) continue
    const value = limitInput(edit[key])
    if (value === 'invalid') return null
    body[key] = value
  }
  return Object.keys(body).length > 0 ? body : null
}

export type Answer<T> = { ok: true; value: T } | { ok: false; status: number; code: string | null }

async function call<T>(
  fetchImpl: typeof fetch,
  path: string,
  init: RequestInit,
  parse: (body: unknown) => T | null
): Promise<Answer<T>> {
  try {
    const res = await fetchImpl(path, {
      ...init,
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {})
      }
    })
    const body: unknown = await res.json().catch(() => null)
    if (!res.ok) {
      const code = body && typeof body === 'object' ? (body as { code?: unknown }).code : null
      return { ok: false, status: res.status, code: typeof code === 'string' ? code : null }
    }
    const value = parse(body)
    return value === null ? { ok: false, status: res.status, code: null } : { ok: true, value }
  } catch {
    return { ok: false, status: 0, code: null }
  }
}

export const fetchOpsMail = (fetchImpl: typeof fetch = fetch) =>
  call(fetchImpl, '/api/ops/mail', { method: 'GET' }, parseOpsMail)

export const putSiteMail = (
  siteKey: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
) =>
  call(
    fetchImpl,
    `/api/ops/mail/sites/${encodeURIComponent(siteKey)}`,
    { method: 'PUT', body: JSON.stringify(body) },
    () => true
  )

/** Release a site's own domain: deleted on Resend when Tracy made it, detached either way. */
export const releaseSiteDomain = (siteKey: string, fetchImpl: typeof fetch = fetch) =>
  call(
    fetchImpl,
    `/api/ops/mail/sites/${encodeURIComponent(siteKey)}/domain`,
    { method: 'DELETE' },
    () => true
  )

/** No slot left for another own domain: said on the screen before a site admin runs into it. */
export const slotsFull = (slots: DomainSlots | null): boolean =>
  slots !== null && slots.used !== null && slots.limit !== null && slots.used >= slots.limit

const WORDED_CODES = new Set(['SITE_MAIL_DOMAIN_LIMIT', 'SITE_MAIL_DOMAIN_UNAVAILABLE', 'SITE_MAIL_UPSTREAM'])

/** The dictionary key of a refusal code with its own meaning for ops; null when the status-based wording is enough. */
export function codeKey(code: string | null): string | null {
  return code !== null && WORDED_CODES.has(code) ? `mail.refusal.${code}` : null
}

export function logPath(siteKey: string | null, limit: number): string {
  const q = new URLSearchParams()
  if (siteKey) q.set('siteKey', siteKey)
  q.set('limit', String(limit))
  return `/api/ops/mail/log?${q.toString()}`
}

export const fetchMailLog = (siteKey: string | null, limit = 50, fetchImpl: typeof fetch = fetch) =>
  call(fetchImpl, logPath(siteKey, limit), { method: 'GET' }, parseLog)

/** Who is reading: the door's own verdict on writes (`/api/ops/me`), or null when it did not say. */
export async function fetchWritable(fetchImpl: typeof fetch = fetch): Promise<boolean | null> {
  try {
    const res = await fetchImpl('/api/ops/me', { headers: { accept: 'application/json' } })
    if (!res.ok) return null
    const body = (await res.json()) as { writable?: unknown }
    return body?.writable === true
  } catch {
    return null
  }
}
