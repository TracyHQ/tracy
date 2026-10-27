/**
 * One message from a site's `tracy-sendmail` shim, from token to wire: who is asking, may they
 * send, rewrite, count, send, log. Everything the door answers is decided here and returned as
 * `{status, body}`; `route.js` only reads the request and writes the answer.
 *
 * 🔒 THE ORDER IS THE POINT.
 *   1. Feature off → 503, before anything else is looked at.
 *   2. Token → 401, before the body is read: an unauthenticated caller never gets 10 MB buffered.
 *   3. Draft → 403, mode off/own-cms → 403: a site that may not send never reaches a counter.
 *   4. Rewrite → 400/413.
 *   5. Limits → 429, counted and reserved under one lock, BEFORE any upstream call.
 *   6. Send → 200 or 502; the reserved row becomes `sent`/`logged`/`failed`.
 */
import { lookup } from 'node:dns/promises'
import net from 'node:net'
import tls from 'node:tls'
import { openSecret } from '../../lib/secret-box.js'
import { rewriteMessage } from './message.js'
import { domainVerified, isPublicIp, limitCrossed, limitsFor, modeOf, refusalFor } from './policy.js'
import { sendSmtp, tlsModeFor } from './smtp.js'
import { finishSend, logRefusal, reserveSend, siteForMail } from './store.js'
import { verifySiteMailToken } from './token.js'

const answer = (status, body) => ({ status, body })

/**
 * Who is asking: the site named by `x-tracy-site`, if the token is its own.
 * @returns {Promise<{site: object} | {status: number, body: object}>}
 */
export async function authenticate({ pool, config, label, token }) {
  const site =
    typeof label === 'string' && /^[a-z0-9-]{1,63}$/.test(label) ? await siteForMail(pool, { label }) : null
  const secret = site ? config.hosts.get(site.host)?.hostSecret : null
  if (!site || !verifySiteMailToken(secret, label, token)) return answer(401, { code: 'SITE_MAIL_TOKEN' })
  return { site }
}

/**
 * Everything after the token: policy, rewrite, limits, send.
 *
 * @param {object} o
 * @param {import('pg').Pool} o.pool
 * @param {object} o.config
 * @param {object} o.site - from `authenticate`.
 * @param {object | null} o.row - the site's `site_mail` row.
 * @param {() => Promise<Buffer>} o.readBody - reads the request body (and throws `TooLarge`).
 * @param {typeof sendSmtp} [o.smtp]
 * @param {(host: string) => Promise<{address: string}>} [o.resolve]
 * @param {{log: Function, warn: Function}} [o.log]
 * @param {(scope: string) => void} [o.onLimit] - told once per refusal; `route.js` turns it into
 *   one warning per scope per day.
 */
export async function relay(o) {
  const { pool, config, site, row } = o
  const siteMail = config.siteMail
  const mode = modeOf(row)
  const log = o.log ?? console
  const refused = refusalFor(site, row)
  if (refused) {
    await logRefusal(pool, { siteKey: site.site_key, mode, code: refused.code })
    return answer(refused.status, { code: refused.code })
  }

  let raw
  try {
    raw = await o.readBody()
  } catch (error) {
    if (error?.name === 'TooLarge') {
      await logRefusal(pool, { siteKey: site.site_key, mode, code: 'SITE_MAIL_TOO_LARGE' })
      return answer(413, { code: 'SITE_MAIL_TOO_LARGE' })
    }
    throw error
  }

  const smtpRow = row?.smtp ?? null
  const message = rewriteMessage(raw, {
    mode,
    label: site.label,
    siteMailDomain: siteMail.domain,
    verifiedDomain: domainVerified(row) ? row.domain : null,
    fallbackFrom: smtpRow && /@/.test(smtpRow.user ?? '') ? smtpRow.user : null
  })
  if (!message.ok) {
    await logRefusal(pool, {
      siteKey: site.site_key,
      mode,
      code: message.code,
      bytes: raw.length,
      error: message.why
    })
    return answer(message.status, { code: message.code })
  }

  const limits = limitsFor(row, siteMail)
  const reserved = await reserveSend(
    pool,
    {
      siteKey: site.site_key,
      mode,
      to: message.recipients,
      subject: message.subject,
      originalFrom: message.originalFrom,
      bytes: message.raw.length
    },
    (counts) => limitCrossed(mode, counts, limits, siteMail.globalDaily)
  )
  if ('refused' in reserved) {
    o.onLimit?.(reserved.refused)
    return answer(429, { code: 'SITE_MAIL_LIMIT', scope: reserved.refused })
  }

  const envelope = { from: message.envelopeFrom, to: message.recipients, raw: message.raw }
  if (siteMail.mode === 'log') {
    log.log(
      `[site-mail] (log mode, not sent) site=${site.label} mode=${mode} from=${envelope.from} ` +
        `to=${envelope.to.join(',')} bytes=${message.raw.length}\n${headerBlock(message.raw)}`
    )
    await finishSend(pool, reserved.id, { status: 'logged', messageId: message.messageId })
    return answer(200, { ok: true, id: reserved.id })
  }

  try {
    const smtp = o.smtp ?? sendSmtp
    if (mode === 'own-smtp') {
      const target = await ownSmtpTarget({ smtpRow, config, resolve: o.resolve })
      await smtp({
        host: target.host,
        port: target.port,
        tls: tlsModeFor(target.port),
        user: target.user,
        pass: target.pass,
        heloName: siteMail.domain ?? 'localhost',
        connect: target.connect,
        ...envelope
      })
    } else {
      await smtp({
        host: siteMail.smtpHost,
        port: siteMail.smtpPort,
        tls: tlsModeFor(siteMail.smtpPort),
        user: 'resend',
        pass: siteMail.key,
        heloName: siteMail.domain,
        ...envelope
      })
    }
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error)
    log.warn(`[site-mail] site=${site.label} mode=${mode} upstream refused: ${why}`)
    await finishSend(pool, reserved.id, { status: 'failed', code: 'SITE_MAIL_UPSTREAM', error: why })
    return answer(502, { code: 'SITE_MAIL_UPSTREAM' })
  }
  await finishSend(pool, reserved.id, { status: 'sent', messageId: message.messageId })
  return answer(200, { ok: true, id: reserved.id })
}

/**
 * The customer's own server, resolved NOW and dialled by the address that was checked — so a name
 * re-pointed at a private address after it was saved is refused, not followed (`policy.js`'s
 * `smtpRefusal` has the why).
 */
async function ownSmtpTarget({ smtpRow, config, resolve = (h) => lookup(h) }) {
  if (!smtpRow?.host) throw new Error('no SMTP server is configured for this site')
  const pass = smtpRow.password ? await openSecret(smtpRow.password, config.sessionSecret) : null
  if (smtpRow.password && pass === null)
    throw new Error('the stored SMTP password cannot be opened; set it again')
  const { address } = isPublicIp(smtpRow.host) ? { address: smtpRow.host } : await resolve(smtpRow.host)
  if (!isPublicIp(address)) throw new Error(`SMTP host ${smtpRow.host} resolves to a private address`)
  const port = Number(smtpRow.port)
  return {
    host: smtpRow.host,
    port,
    user: smtpRow.user,
    pass,
    // Dial the checked address; name the host for SNI and the certificate check.
    connect: ({ tls: mode }) => dialChecked(address, smtpRow.host, port, mode)
  }
}

function dialChecked(address, servername, port, mode) {
  return mode === 'implicit'
    ? tls.connect({ host: address, port, servername })
    : net.connect({ host: address, port })
}

/** The header block of a message, for the log line: never the body, which may be 10 MB of PII. */
function headerBlock(raw) {
  const crlf = raw.indexOf('\r\n\r\n')
  const lf = raw.indexOf('\n\n')
  const end = crlf !== -1 && (lf === -1 || crlf < lf) ? crlf : lf
  return raw.subarray(0, end === -1 ? raw.length : end).toString('latin1')
}
