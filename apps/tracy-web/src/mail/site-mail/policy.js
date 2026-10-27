/**
 * What a site's mail policy MEANS, with no database and no network: which mode is in force, which
 * limits apply, which address the site's mail leaves from, and whether a message may go at all.
 * `relay.js` and the doors both read it, so the screen and the relay cannot disagree.
 */

import { relaySenderFor } from '../../lib/site-relay-sender.js'

/** Every mode a site may be in. No row at all means `tracy`. */
export const MODES = ['tracy', 'tracy-domain', 'own-smtp', 'own-cms', 'off']

/** Modes Tracy pays for, and therefore the ones the per-site limits and the global cap count. */
export const TRACY_PAID = new Set(['tracy', 'tracy-domain'])

export const modeOf = (row) => (row && MODES.includes(row.mode) ? row.mode : 'tracy')

/** The limits in force: the row's override, else the deployment default. */
export function limitsFor(row, siteMail) {
  return {
    hourly: row?.hourly_limit ?? siteMail.siteHourly,
    daily: row?.daily_limit ?? siteMail.siteDaily
  }
}

export const domainVerified = (row) =>
  Boolean(row?.domain) && String(row?.domain_status ?? '').toLowerCase() === 'verified'

/**
 * The address a site's mail leaves from when the site's own `From` is not kept — what the screens
 * show as `fromAddress`. Null for modes where Tracy does not choose one.
 */
export function fromAddressFor(site, row, siteMail) {
  const mode = modeOf(row)
  if (mode === 'tracy-domain' && domainVerified(row)) return `noreply@${row.domain}`
  if (mode === 'tracy' || mode === 'tracy-domain') return relaySenderFor(site.label, siteMail)
  return null
}

/**
 * Whether a message from this site may be relayed at all, before its bytes are read.
 * @returns {{status: number, code: string} | null} the refusal, or null to go on.
 */
export function refusalFor(site, row) {
  if (site.publish !== 'published') return { status: 403, code: 'SITE_MAIL_DRAFT' }
  const mode = modeOf(row)
  if (mode === 'off' || mode === 'own-cms') return { status: 403, code: 'SITE_MAIL_OFF' }
  return null
}

/**
 * Which limit a send would cross, given what has been counted so far — site hour, site day, then
 * the deployment's day. `own-smtp` is the customer's own account and has none.
 * @returns {'site-hour' | 'site-day' | 'global-day' | null}
 */
export function limitCrossed(mode, counts, limits, globalDaily) {
  if (!TRACY_PAID.has(mode)) return null
  if (counts.hour >= limits.hourly) return 'site-hour'
  if (counts.day >= limits.daily) return 'site-day'
  if (counts.globalDay >= globalDaily) return 'global-day'
  return null
}

const DOMAIN = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/** A customer's sending domain as typed, normalised, or null when it is not a domain. */
export function normaliseDomain(raw) {
  if (typeof raw !== 'string') return null
  const d = raw.trim().toLowerCase().replace(/\.$/, '')
  return DOMAIN.test(d) ? d : null
}

/**
 * A customer's SMTP server, checked before it is stored.
 *
 * 🔒 THE HOST IS A PLACE THIS PROCESS WILL DIAL. `tracy-web` sits on the `tracy` network beside
 * postgres, every site's web container and the host agent; a site admin who could name
 * `postgres:5432` or `172.30.0.1` as "their SMTP server" would turn the relay into a probe of
 * Tracy's own network. So: a dotted public name or a public IP literal, and a mail port. The name
 * is resolved again at send time (`relay.js`), because a name can be pointed at a private address
 * after it was saved.
 */
export const SMTP_PORTS = new Set([25, 465, 587, 2525])

export function smtpRefusal(smtp) {
  if (!smtp || typeof smtp !== 'object') return 'SMTP_REQUIRED'
  const host = typeof smtp.host === 'string' ? smtp.host.trim().toLowerCase() : ''
  if (!host || (!normaliseDomain(host) && !isPublicIp(host))) return 'SMTP_HOST_INVALID'
  if (!SMTP_PORTS.has(Number(smtp.port))) return 'SMTP_PORT_INVALID'
  if (typeof smtp.user !== 'string' || smtp.user.trim() === '' || smtp.user.length > 320)
    return 'SMTP_USER_INVALID'
  if (smtp.password !== undefined && smtp.password !== null) {
    if (typeof smtp.password !== 'string' || smtp.password === '' || smtp.password.length > 1024)
      return 'SMTP_PASSWORD_INVALID'
  }
  return null
}

/** True for an IPv4/IPv6 literal that is not loopback, private, link-local, CGNAT or unspecified. */
export function isPublicIp(address) {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    if (v4.slice(1).some((n) => Number(n) > 255)) return false
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false
    if (a === 169 && b === 254) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
    if (a === 100 && b >= 64 && b <= 127) return false
    return true
  }
  if (address.includes(':')) {
    const a = address.toLowerCase().replace(/^\[|\]$/g, '')
    if (a === '::' || a === '::1') return false
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a)
    if (mapped) return isPublicIp(mapped[1])
    if (/^f[cd]/.test(a) || /^fe[89ab]/.test(a) || a.startsWith('ff')) return false
    return true
  }
  return false
}
