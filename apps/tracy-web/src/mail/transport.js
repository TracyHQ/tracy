/**
 * Where a mail goes. `console` is the laptop: the OTP lands in the log, and that is the feature.
 *
 * 🔒 ONLY IN LOCAL PREVIEW (#804). `console` is also what a deployment gets when `MAIL` is missing,
 * and until 04/10/2026 it answered every send as a success there too: the sign-in page said "We
 * sent an email", nothing left, and the whole letter (sign-in code included) went to stdout.
 * Outside `LOCAL_LOGIN_PREVIEW` (the guarded laptop mode, `config.js`) a send now REJECTS, so each
 * door reports the failure it already knows how to show, and the one line written names neither
 * the recipient nor anything the letter carries. `available` lets a door that answers before it
 * sends (the beta queue) refuse up front.
 */
export class MailUnavailableError extends Error {
  constructor() {
    super('mail is not configured')
    this.name = 'MailUnavailableError'
    this.code = 'MAIL_UNAVAILABLE'
  }
}
export function consoleTransport(log = console.log, { localPreview = false } = {}) {
  if (localPreview !== true) {
    return {
      available: false,
      send: async () => {
        log('[mail] not sent: MAIL is not configured (set MAIL=resend:<key>)')
        throw new MailUnavailableError()
      }
    }
  }
  return {
    available: true,
    send: async ({ to, subject, text }) => {
      log(`[mail] to=${to} subject=${JSON.stringify(subject)}\n${text}`)
    }
  }
}
/**
 * Addresses no mailbox can ever answer: the reserved names of RFC 2606 / RFC 6761. The E2E suite on
 * DEV signs in as `e2e-<runId>-*@example.test`, and until 05/10/2026 every invite, join and comment
 * of a run went out through the one Resend account production also sends from: 310 bounces on
 * 04/10 alone, 47% of thirty days of mail. A bounce rate like that is what gets an account paused,
 * and then the sign-in code stops too. Such a letter is not sent; the one log line names the domain.
 */
const RESERVED_TLDS = new Set(['test', 'example', 'invalid', 'localhost'])
const RESERVED_DOMAINS = ['example.com', 'example.net', 'example.org']
export function isUndeliverableAddress(address) {
  const domain = String(address).trim().toLowerCase().split('@').pop().replace(/>$/, '').replace(/\.$/, '')
  if (!domain) return true
  if (RESERVED_TLDS.has(domain.split('.').pop())) return true
  return RESERVED_DOMAINS.some((reserved) => domain === reserved || domain.endsWith(`.${reserved}`))
}

export function resendTransport({ key, from, fetchImpl = fetch, skipReserved = false, log = console.log }) {
  return {
    available: true,
    send: async ({ to, subject, text, html, headers, idempotencyKey, signal, replyTo }) => {
      const recipients = Array.isArray(to) ? to : [to]
      if (skipReserved && recipients.some(isUndeliverableAddress)) {
        const domains = [...new Set(recipients.map((r) => String(r).split('@').pop()))].join(', ')
        log(`[mail] not sent: reserved test domain (${domains})`)
        // The doors that keep a provider id (the whitelist confirmation) still get one to keep.
        return idempotencyKey ? `not-sent:reserved-domain` : undefined
      }
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        signal,
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
        },
        body: JSON.stringify({
          from,
          to,
          subject,
          text,
          ...(idempotencyKey && replyTo ? { reply_to: replyTo } : {}),
          ...(html ? { html } : {}),
          // The one-click unsubscribe headers of a notification letter (RFC 8058), when it has them.
          ...(headers ? { headers } : {})
        })
      })
      if (!res.ok) throw new Error(`resend answered ${res.status}`)
      if (idempotencyKey) {
        const body = await res.json()
        if (typeof body.id !== 'string' || !body.id) throw new Error('resend acknowledgement missing')
        return body.id
      }
    }
  }
}
/** `localPreview` is `config.localLoginPreview`, which `readConfig` has already guarded. */
export function transportFor(mailConfig, log, { localPreview = false } = {}) {
  return mailConfig.kind === 'resend'
    ? resendTransport({ ...mailConfig, skipReserved: true, ...(log ? { log } : {}) })
    : consoleTransport(log, { localPreview })
}
