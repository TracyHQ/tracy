/**
 * The smallest SMTP client that delivers one message: greeting, EHLO, optional STARTTLS, AUTH
 * (PLAIN or LOGIN), MAIL FROM, one RCPT TO per recipient, DATA, QUIT.
 *
 * WHY WRITTEN HERE. `tracy-web` may depend on `hono`, `@hono/node-server` and `pg` and nothing
 * else (`mail/emails.js`'s header), and the relay must speak SMTP to keep a site's MIME byte for
 * byte (Resend's JSON API would mean re-encoding every attachment PHP already encoded). One
 * submission to one server is a short, fixed conversation; that is all this does. No pipelining,
 * no retry, no queue — a failure is answered to the site as 502 and `mail()` returns false, which
 * is what the site's own code already knows how to handle.
 *
 * 🔒 TLS IS NOT OPTIONAL IN PRODUCTION. `implicit` (port 465) wraps the socket before the
 * greeting; `starttls` (587) refuses to go on when the server does not offer STARTTLS rather than
 * sending a password in the clear. `none` exists for a test's fake server, and `tlsModeFor` never
 * picks it.
 */
import net from 'node:net'
import tls from 'node:tls'

export class SmtpError extends Error {
  /** @param {string} message @param {number | null} [code] - the server's reply code, if any. */
  constructor(message, code = null) {
    super(message)
    this.code = code
  }
}

/** 465 is TLS from the first byte; anything else upgrades with STARTTLS. */
export const tlsModeFor = (port) => (Number(port) === 465 ? 'implicit' : 'starttls')

/**
 * The bytes DATA sends: every line ending CRLF (PHP on Linux hands `sendmail` bare LF, and a bare
 * LF on the wire is exactly what SMTP-smuggling defences refuse), a leading dot doubled, and the
 * terminating `.` line. The text of the message is unchanged; this is transport framing, the same
 * thing every MTA does on the way out.
 * @param {Buffer} raw
 */
export function dataBytes(raw) {
  let s = raw.toString('latin1').replace(/\r?\n/g, '\r\n')
  s = s.replace(/(^|\r\n)\./g, '$1..')
  if (!s.endsWith('\r\n')) s += '\r\n'
  return Buffer.from(`${s}.\r\n`, 'latin1')
}

/** Reads replies off a socket; survives the socket being swapped for its TLS wrapper. */
class Replies {
  constructor() {
    this.buffer = ''
    this.lines = []
    this.waiting = null
    this.failed = null
  }
  attach(socket) {
    socket.setEncoding('latin1')
    socket.on('data', (chunk) => {
      this.buffer += chunk
      let at = this.buffer.indexOf('\n')
      while (at !== -1) {
        this.lines.push(this.buffer.slice(0, at).replace(/\r$/, ''))
        this.buffer = this.buffer.slice(at + 1)
        at = this.buffer.indexOf('\n')
      }
      this.flush()
    })
    socket.on('error', (error) => this.fail(new SmtpError(`smtp connection: ${error.message}`)))
    socket.on('close', () => this.fail(new SmtpError('smtp connection closed')))
  }
  fail(error) {
    if (!this.failed) this.failed = error
    this.flush()
  }
  flush() {
    if (!this.waiting) return
    const end = this.lines.findIndex((l) => /^\d{3}(?: |$)/.test(l))
    if (end !== -1) {
      const lines = this.lines.splice(0, end + 1)
      const { resolve } = this.waiting
      this.waiting = null
      resolve({ code: Number(lines.at(-1).slice(0, 3)), lines: lines.map((l) => l.slice(4)) })
    } else if (this.failed) {
      const { reject } = this.waiting
      this.waiting = null
      reject(this.failed)
    }
  }
  next() {
    return new Promise((resolve, reject) => {
      this.waiting = { resolve, reject }
      this.flush()
    })
  }
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64')

/**
 * Deliver one message.
 *
 * @param {object} o
 * @param {string} o.host
 * @param {number} o.port
 * @param {'implicit' | 'starttls' | 'none'} [o.tls] - default from the port (`tlsModeFor`).
 * @param {string | null} [o.user]
 * @param {string | null} [o.pass]
 * @param {string} o.from - envelope sender.
 * @param {string[]} o.to - envelope recipients; every one must be accepted or nothing is sent.
 * @param {Buffer} o.raw - the message, as it should arrive.
 * @param {string} [o.heloName]
 * @param {number} [o.timeoutMs] - per socket inactivity.
 * @param {(o: {host: string, port: number, tls: string}) => import('node:net').Socket} [o.connect]
 * @param {(socket: import('node:net').Socket, host: string) => Promise<import('node:net').Socket>} [o.startTls]
 * @returns {Promise<{reply: string}>} the server's answer to the end of DATA (usually carries its
 *   queue id).
 */
export async function sendSmtp(o) {
  const mode = o.tls ?? tlsModeFor(o.port)
  const timeoutMs = o.timeoutMs ?? 30_000
  const connect = o.connect ?? defaultConnect
  const startTls = o.startTls ?? defaultStartTls
  let socket = connect({ host: o.host, port: o.port, tls: mode })
  const replies = new Replies()
  const arm = (s) => {
    s.setTimeout(timeoutMs, () => s.destroy(new Error(`no answer in ${timeoutMs} ms`)))
    replies.attach(s)
  }
  arm(socket)
  const expect = async (want, what) => {
    const reply = await replies.next()
    if (!want.includes(reply.code))
      throw new SmtpError(`${what}: ${reply.code} ${reply.lines.join(' ').slice(0, 300)}`, reply.code)
    return reply
  }
  const say = (line) => socket.write(`${line}\r\n`, 'latin1')
  const hello = async () => {
    say(`EHLO ${o.heloName ?? 'localhost'}`)
    const reply = await expect([250], 'EHLO')
    return reply.lines.map((l) => l.toUpperCase())
  }
  try {
    await expect([220], 'greeting')
    let caps = await hello()
    if (mode === 'starttls') {
      if (!caps.some((c) => c.startsWith('STARTTLS')))
        throw new SmtpError('server does not offer STARTTLS; refusing to send credentials in the clear')
      say('STARTTLS')
      await expect([220], 'STARTTLS')
      socket.removeAllListeners('data')
      socket.removeAllListeners('close')
      socket.removeAllListeners('error')
      socket.setTimeout(0)
      socket = await startTls(socket, o.host)
      arm(socket)
      caps = await hello()
    }
    if (o.user) {
      const auth = caps.find((c) => c.startsWith('AUTH')) ?? ''
      const methods = auth.replace(/^AUTH[ =]/, '').split(/\s+/)
      if (methods.includes('PLAIN')) {
        say(`AUTH PLAIN ${b64(`\0${o.user}\0${o.pass ?? ''}`)}`)
        await expect([235], 'AUTH PLAIN')
      } else if (methods.includes('LOGIN')) {
        say('AUTH LOGIN')
        await expect([334], 'AUTH LOGIN')
        say(b64(o.user))
        await expect([334], 'AUTH LOGIN user')
        say(b64(o.pass ?? ''))
        await expect([235], 'AUTH LOGIN password')
      } else {
        throw new SmtpError('server offers neither AUTH PLAIN nor AUTH LOGIN')
      }
    }
    say(`MAIL FROM:<${o.from}>`)
    await expect([250], 'MAIL FROM')
    for (const rcpt of o.to) {
      say(`RCPT TO:<${rcpt}>`)
      await expect([250, 251], `RCPT TO ${rcpt}`)
    }
    say('DATA')
    await expect([354], 'DATA')
    socket.write(dataBytes(o.raw))
    const done = await expect([250], 'end of DATA')
    say('QUIT')
    await replies.next().catch(() => null)
    return { reply: done.lines.join(' ') }
  } finally {
    socket.end()
    socket.destroy()
  }
}

function defaultConnect({ host, port, tls: mode }) {
  return mode === 'implicit' ? tls.connect({ host, port, servername: host }) : net.connect({ host, port })
}

function defaultStartTls(socket, host) {
  return new Promise((resolve, reject) => {
    const wrapped = tls.connect({ socket, servername: host }, () => resolve(wrapped))
    wrapped.once('error', reject)
  })
}
