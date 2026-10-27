/** RFC 5322/2045 message for the Gmail API `messages.send` (raw, base64url). No dependency: the
 * shape is small and fixed (related > alternative > text + html, plus inline images), and every
 * header value here is built by Tracy, never copied from a customer. */
import { randomBytes } from 'node:crypto'
import { parse, serialize } from 'parse5'

const LINE = '\r\n'

/** RFC 2047 encoded-word for a header value that may hold non-ASCII text. */
export function encodeHeader(value) {
  if (/[\r\n]/.test(value)) throw new Error('header value with a line break')
  if (/^[\x20-\x7e]*$/.test(value)) return value
  // Split on characters, not bytes, so no UTF-8 sequence is cut across encoded words.
  const words = []
  let chunk = ''
  for (const char of value) {
    if (Buffer.byteLength(chunk + char) > 45) {
      words.push(chunk)
      chunk = ''
    }
    chunk += char
  }
  if (chunk) words.push(chunk)
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w).toString('base64')}?=`).join(`${LINE} `)
}

/** "Display Name <address>" with the name encoded when needed and quoted when it has specials. */
export function mailbox(name, address) {
  if (!/^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+$/.test(address)) throw new Error('invalid address')
  if (!name) return address
  const encoded = /^[\x20-\x7e]*$/.test(name)
    ? /[()<>@,;:\\".[\]]/.test(name)
      ? `"${name.replace(/(["\\])/g, '\\$1')}"`
      : name
    : encodeHeader(name)
  return `${encoded} <${address}>`
}

function base64Body(bytes) {
  return (
    Buffer.from(bytes)
      .toString('base64')
      .match(/.{1,76}/g)
      ?.join(LINE) ?? ''
  )
}

function boundary(label) {
  return `tracy-${label}-${randomBytes(12).toString('hex')}`
}

/** Point every managed image at its inline part. Paths not in `assets` are left as they are; the
 * sanitizer only lets managed paths into a template, so none should remain. */
export function inlineImages(html, assets) {
  const byPath = new Map(assets.map((a) => [a.path, a]))
  const tree = parse(html)
  const walk = (node) => {
    if (node.tagName === 'img')
      for (const attr of node.attrs)
        if (attr.name === 'src' && byPath.has(attr.value)) attr.value = `cid:${byPath.get(attr.value).cid}`
    for (const child of node.childNodes ?? []) walk(child)
    if (node.content) walk(node.content)
  }
  walk(tree)
  return serialize(tree)
}

/**
 * @param {object} m
 * @param {{name: string, address: string}} m.from
 * @param {string} m.to - one address
 * @param {string} m.subject
 * @param {string} m.html
 * @param {string} m.text
 * @param {string} m.messageId - without angle brackets
 * @param {Date} [m.date]
 * @param {Array<{path: string, mediaType: string, bytes: Buffer, cid: string}>} [m.images]
 * @param {Record<string, string>} [m.headers] - extra ASCII headers (List-Unsubscribe…)
 * @returns {string} the message, CRLF line endings
 */
export function buildMessage({
  from,
  to,
  subject,
  html,
  text,
  messageId,
  date = new Date(),
  images = [],
  headers = {}
}) {
  if (!/^[\x21-\x7e]+@[\x21-\x7e]+$/.test(messageId) || /[<>]/.test(messageId))
    throw new Error('invalid Message-ID')
  const related = boundary('rel'),
    alternative = boundary('alt')
  const head = [
    `From: ${mailbox(from.name, from.address)}`,
    `To: ${mailbox('', to)}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${date.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${messageId}>`,
    'MIME-Version: 1.0',
    ...Object.entries(headers).map(([k, v]) => {
      if (!/^[A-Za-z-]+$/.test(k) || !/^[\x20-\x7e]*$/.test(v)) throw new Error('invalid header')
      return `${k}: ${v}`
    }),
    `Content-Type: multipart/related; boundary="${related}"`
  ]
  const body = [
    `--${related}`,
    `Content-Type: multipart/alternative; boundary="${alternative}"`,
    '',
    `--${alternative}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(Buffer.from(text, 'utf8')),
    `--${alternative}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(Buffer.from(inlineImages(html, images), 'utf8')),
    `--${alternative}--`,
    ...images.flatMap((image) => [
      `--${related}`,
      `Content-Type: ${image.mediaType}`,
      'Content-Transfer-Encoding: base64',
      `Content-ID: <${image.cid}>`,
      `Content-Disposition: inline; filename="${image.path
        .split('/')
        .at(-1)
        .replace(/[^A-Za-z0-9._-]/g, '_')}"`,
      '',
      base64Body(image.bytes)
    ]),
    `--${related}--`,
    ''
  ]
  return [...head, '', ...body].join(LINE)
}
