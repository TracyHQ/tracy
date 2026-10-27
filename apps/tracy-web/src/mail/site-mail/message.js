/**
 * Reading and rewriting the raw RFC 822 message a site hands the relay.
 *
 * 🔒 ONLY THE HEADER BLOCK IS TOUCHED. The body (every MIME part, every attachment) goes out as the
 * exact bytes the site wrote — that is why the relay speaks SMTP instead of Resend's JSON API,
 * which would have meant re-encoding what PHP already encoded. Headers are handled as latin1 so a
 * byte that is not ASCII survives the round trip unchanged too.
 *
 * What changes, and why each one:
 *   - `From` becomes an address on a domain Tracy can sign for (`<label>@SITE_MAIL_DOMAIN`), keeping
 *     the site's display name: a site claiming `admin@gmail.com` through Resend fails DMARC at the
 *     recipient and drags the sending domain's reputation down for every other site.
 *   - `Reply-To` is set to the site's original `From` when the site did not set one, so answering a
 *     contact-form mail still reaches the person the site meant.
 *   - `Bcc` is removed (its addresses become envelope recipients only — leaving it in would show
 *     every blind recipient to every other one), and so are `Sender` and `Return-Path`, which would
 *     name an address that no longer matches `From`.
 *   - `Message-ID` and `Date` are added only when the site sent none.
 */
import { randomBytes } from 'node:crypto'

/** The largest message the door accepts, whole: headers, body and attachments. */
export const MAX_MESSAGE_BYTES = 10 * 1024 * 1024

const FIELD_NAME = /^([!-9;-~]+):/

/**
 * @param {Buffer} raw
 * @returns {{fields: {name: string, lower: string, raw: string, value: string}[], eol: string,
 *   body: Buffer} | null} null when there is no header/body separator or a line is not a header.
 */
export function splitMessage(raw) {
  const crlf = raw.indexOf('\r\n\r\n')
  const lf = raw.indexOf('\n\n')
  let end
  let sep
  let eol
  if (crlf !== -1 && (lf === -1 || crlf < lf)) {
    end = crlf
    sep = 4
    eol = '\r\n'
  } else if (lf !== -1) {
    end = lf
    sep = 2
    eol = '\n'
  } else {
    return null
  }
  const text = raw.subarray(0, end).toString('latin1')
  const body = raw.subarray(end + sep)
  const lines = text.split(/\r?\n/)
  // An mbox envelope line (`From sender date`) is not a header; some sendmail callers write one.
  if (lines[0]?.startsWith('From ')) lines.shift()
  const fields = []
  for (const line of lines) {
    if (/^[ \t]/.test(line)) {
      const last = fields.at(-1)
      if (!last) return null
      last.raw += `${eol}${line}`
      last.value += line
      continue
    }
    const m = FIELD_NAME.exec(line)
    if (!m) return null
    fields.push({ name: m[1], lower: m[1].toLowerCase(), raw: line, value: line.slice(m[0].length).trim() })
  }
  if (fields.length === 0) return null
  for (const f of fields) f.value = f.value.replace(/\s+/g, ' ').trim()
  return { fields, eol, body }
}

const ADDRESS = /^(?:[^\s@<>()",;:\\[\]]+|"(?:[^"\\]|\\.)*")@[^\s@<>()",;:\\[\]]+$/

/**
 * An address list (`To`, `Cc`, `Bcc`, `From`, `Reply-To`) as `[{address, display}]`: display names
 * (quoted or not, encoded words included) and comments are understood, groups (`team: a@x, b@y;`)
 * contribute their members, and an empty group (`undisclosed-recipients:;`) contributes none.
 *
 * @returns {{address: string, display: string | null}[] | null} null when an entry is not an
 *   address at all — a message the relay cannot address honestly is refused, never half-sent.
 */
export function parseAddressList(value) {
  const entries = []
  let cur = ''
  let inQuote = false
  let inAngle = false
  let comment = 0
  const push = () => {
    entries.push(cur)
    cur = ''
  }
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (inQuote) {
      cur += ch
      if (ch === '\\' && i + 1 < value.length) cur += value[++i]
      else if (ch === '"') inQuote = false
      continue
    }
    if (comment > 0) {
      if (ch === '\\') i++
      else if (ch === '(') comment++
      else if (ch === ')') comment--
      continue
    }
    if (ch === '"') {
      inQuote = true
      cur += ch
    } else if (ch === '(') {
      comment = 1
      cur += ' '
    } else if (ch === '<') {
      inAngle = true
      cur += ch
    } else if (ch === '>') {
      inAngle = false
      cur += ch
    } else if (!inAngle && ch === ',') {
      push()
    } else if (!inAngle && ch === ':') {
      // A group's name: what follows are its members.
      cur = ''
    } else if (!inAngle && ch === ';') {
      push()
    } else {
      cur += ch
    }
  }
  push()
  const out = []
  for (const entry of entries.map((e) => e.trim())) {
    if (entry === '') continue
    const open = entry.lastIndexOf('<')
    let address
    let display = null
    if (open !== -1) {
      const close = entry.indexOf('>', open)
      if (close === -1) return null
      // A source route (`<@relay:user@host>`) is obsolete syntax; the address is after the colon.
      address = entry
        .slice(open + 1, close)
        .trim()
        .replace(/^@[^:]*:/, '')
      display = entry.slice(0, open).trim() || null
    } else {
      address = entry
    }
    if (!ADDRESS.test(address)) return null
    out.push({ address, display })
  }
  return out
}

/**
 * A header value as a person reads it: RFC 2047 encoded words (`=?UTF-8?B?...?=`, `?Q?`) decoded,
 * whitespace between two encoded words dropped, cut to `max` characters. For the log only — the
 * message itself keeps the bytes the site wrote.
 */
export function decodeHeader(value, max = 200) {
  // Raw 8-bit UTF-8 (SMTPUTF8 style) arrives here as latin1; read it back as UTF-8 when it is.
  let readable = value
  if (/[\x80-\xff]/.test(value)) {
    try {
      readable = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(value, 'latin1'))
    } catch {
      readable = value
    }
  }
  const text = readable
    .replace(/(=\?[^?]+\?[bqBQ]\?[^?]*\?=)\s+(?==\?)/g, '$1')
    .replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g, (whole, charset, enc, data) => {
      try {
        const bytes =
          enc.toUpperCase() === 'B'
            ? Buffer.from(data, 'base64')
            : Buffer.from(
                data
                  .replace(/_/g, ' ')
                  .replace(/=([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))),
                'latin1'
              )
        return new TextDecoder(charset.split('*')[0].toLowerCase(), { fatal: false }).decode(bytes)
      } catch {
        return whole
      }
    })
  return text.length > max ? text.slice(0, max) : text
}

const domainOf = (address) => address.slice(address.lastIndexOf('@') + 1).toLowerCase()

/**
 * Rewrite a site's raw message for sending.
 *
 * @param {Buffer} raw
 * @param {object} o
 * @param {'tracy' | 'tracy-domain' | 'own-smtp'} o.mode
 * @param {string} o.label - the site's fleet label: the local part of its Tracy address, and the
 *   display name when the site sent none.
 * @param {string} o.siteMailDomain - `SITE_MAIL_DOMAIN`.
 * @param {string | null} [o.verifiedDomain] - mode `tracy-domain`: the customer's domain, only once
 *   Resend reports it verified. Null otherwise.
 * @param {string | null} [o.fallbackFrom] - mode `own-smtp`: the address to write when the site
 *   sent no `From` at all.
 * @param {Date} [o.now]
 * @returns {{ok: true, raw: Buffer, envelopeFrom: string, recipients: string[], messageId: string,
 *   subject: string | null, originalFrom: string | null, rewritten: boolean} | {ok: false, status: number, code: string, why: string}}
 */
export function rewriteMessage(raw, o) {
  if (raw.length > MAX_MESSAGE_BYTES)
    return { ok: false, status: 413, code: 'SITE_MAIL_TOO_LARGE', why: 'message over 10 MB' }
  const malformed = (why) => ({ ok: false, status: 400, code: 'SITE_MAIL_MALFORMED', why })
  const split = splitMessage(raw)
  if (!split) return malformed('no header block, or a line in it is not a header')
  const { fields, eol, body } = split
  const has = (name) => fields.some((f) => f.lower === name)

  const recipients = []
  const seen = new Set()
  for (const f of fields) {
    if (f.lower !== 'to' && f.lower !== 'cc' && f.lower !== 'bcc') continue
    const list = parseAddressList(f.value)
    if (!list) return malformed(`${f.name} holds something that is not an address`)
    for (const { address } of list) {
      const key = address.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      recipients.push(address)
    }
  }
  if (recipients.length === 0) return malformed('no recipient in To, Cc or Bcc')

  const fromField = fields.find((f) => f.lower === 'from') ?? null
  let original = null
  if (fromField) {
    const list = parseAddressList(fromField.value)
    if (!list || list.length === 0) return malformed('From holds something that is not an address')
    original = list[0]
  }

  let newFrom = null
  if (o.mode === 'own-smtp') {
    if (!original) {
      const address = o.fallbackFrom ?? `${o.label}@${o.siteMailDomain}`
      newFrom = { address, display: `"${o.label}"` }
    }
  } else {
    const verified = o.mode === 'tracy-domain' && o.verifiedDomain ? o.verifiedDomain.toLowerCase() : null
    const keep = verified !== null && original !== null && domainOf(original.address) === verified
    if (!keep) {
      const address = verified !== null ? `noreply@${verified}` : `${o.label}@${o.siteMailDomain}`
      newFrom = { address, display: original?.display ?? `"${o.label}"` }
    }
  }

  const drop = new Set(['bcc', 'sender', 'return-path'])
  if (newFrom) drop.add('from')
  const kept = fields.filter((f) => !drop.has(f.lower)).map((f) => f.raw)
  const added = []
  const envelopeFrom = newFrom ? newFrom.address : original.address
  if (newFrom) {
    added.push(`From: ${newFrom.display} <${newFrom.address}>`)
    if (original && o.mode !== 'own-smtp' && !has('reply-to')) added.push(`Reply-To: ${fromField.value}`)
  }
  let messageId = fields.find((f) => f.lower === 'message-id')?.value.replace(/^<|>$/g, '') ?? null
  if (!messageId) {
    messageId = `${randomBytes(12).toString('hex')}@${domainOf(envelopeFrom)}`
    added.push(`Message-ID: <${messageId}>`)
  }
  if (!has('date')) added.push(`Date: ${(o.now ?? new Date()).toUTCString()}`)

  const head = Buffer.from([...added, ...kept].join(eol) + eol + eol, 'latin1')
  const subjectField = fields.find((f) => f.lower === 'subject')
  return {
    ok: true,
    raw: Buffer.concat([head, body]),
    envelopeFrom,
    recipients,
    messageId,
    subject: subjectField ? decodeHeader(subjectField.value) : null,
    originalFrom: fromField ? fromField.value : null,
    rewritten: newFrom !== null
  }
}
