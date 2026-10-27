/**
 * The hand-written SMTP client against a fake server on a real socket: the whole conversation,
 * AUTH PLAIN and LOGIN, STARTTLS refusal and upgrade, dot-stuffing, multi-line replies, a refused
 * recipient, and a server that never answers.
 */
import assert from 'node:assert/strict'
import net from 'node:net'
import { test } from 'node:test'
import { dataBytes, sendSmtp, SmtpError, tlsModeFor } from '../src/mail/site-mail/smtp.js'

/** A fake SMTP server; returns its port, the commands it saw, and the DATA it received. */
async function fakeServer({
  auth = ['PLAIN', 'LOGIN'],
  startTls = false,
  rejectRcpt = null,
  silent = false
} = {}) {
  const seen = []
  const received = []
  const server = net.createServer((socket) => {
    socket.setEncoding('latin1')
    if (silent) return
    let buffer = ''
    let inData = false
    let data = ''
    let expectLogin = 0
    const reply = (s) => socket.write(`${s}\r\n`)
    reply('220 fake.test ESMTP ready')
    socket.on('data', (chunk) => {
      buffer += chunk
      for (;;) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n')
          if (end === -1) return
          data += buffer.slice(0, end + 2)
          buffer = buffer.slice(end + 5)
          inData = false
          received.push(data)
          data = ''
          reply('250 2.0.0 Ok: queued as ABC123')
          continue
        }
        const at = buffer.indexOf('\r\n')
        if (at === -1) return
        const line = buffer.slice(0, at)
        buffer = buffer.slice(at + 2)
        seen.push(line)
        if (expectLogin > 0) {
          expectLogin--
          reply(expectLogin > 0 ? '334 UGFzc3dvcmQ6' : '235 2.7.0 ok')
          continue
        }
        const verb = line.split(' ')[0].toUpperCase()
        if (verb === 'EHLO') {
          const caps = ['250-fake.test greets you', '250-SIZE 10485760', '250-8BITMIME']
          if (startTls) caps.push('250-STARTTLS')
          if (auth.length) caps.push(`250-AUTH ${auth.join(' ')}`)
          caps.push('250 SMTPUTF8')
          socket.write(caps.map((c) => `${c}\r\n`).join(''))
        } else if (verb === 'STARTTLS') reply('220 go ahead')
        else if (line.startsWith('AUTH PLAIN')) reply('235 2.7.0 ok')
        else if (line === 'AUTH LOGIN') {
          expectLogin = 2
          reply('334 VXNlcm5hbWU6')
        } else if (verb === 'MAIL') reply('250 ok')
        else if (verb === 'RCPT')
          reply(rejectRcpt && line.includes(rejectRcpt) ? '550 5.1.1 no such user' : '250 ok')
        else if (verb === 'DATA') {
          inData = true
          reply('354 end with .')
        } else if (verb === 'QUIT') {
          reply('221 bye')
          socket.end()
        } else reply('502 unknown')
      }
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return { port: server.address().port, seen, received, close: () => new Promise((r) => server.close(r)) }
}

const plain = ({ host, port }) => net.connect({ host, port })
const message = Buffer.from('From: a@x.test\nTo: b@x.test\nSubject: s\n\n.dot line\nline\n', 'latin1')

test('the whole conversation with AUTH PLAIN; LF becomes CRLF and a leading dot is doubled', async () => {
  const s = await fakeServer()
  try {
    const out = await sendSmtp({
      host: '127.0.0.1',
      port: s.port,
      tls: 'implicit',
      connect: plain,
      user: 'resend',
      pass: 're_key',
      from: 'lantern@sites.test',
      to: ['b@x.test', 'c@x.test'],
      raw: message,
      heloName: 'sites.test'
    })
    assert.match(out.reply, /queued as ABC123/)
    assert.equal(s.seen[0], 'EHLO sites.test')
    assert.equal(s.seen[1], `AUTH PLAIN ${Buffer.from('\0resend\0re_key').toString('base64')}`)
    assert.deepEqual(s.seen.slice(2), [
      'MAIL FROM:<lantern@sites.test>',
      'RCPT TO:<b@x.test>',
      'RCPT TO:<c@x.test>',
      'DATA',
      'QUIT'
    ])
    assert.equal(s.received[0], 'From: a@x.test\r\nTo: b@x.test\r\nSubject: s\r\n\r\n..dot line\r\nline\r\n')
  } finally {
    await s.close()
  }
})

test('AUTH LOGIN when PLAIN is not offered', async () => {
  const s = await fakeServer({ auth: ['LOGIN'] })
  try {
    await sendSmtp({
      host: '127.0.0.1',
      port: s.port,
      tls: 'none',
      connect: plain,
      user: 'u@own.test',
      pass: 'pw',
      from: 'u@own.test',
      to: ['b@x.test'],
      raw: message
    })
    assert.deepEqual(s.seen.slice(1, 4), [
      'AUTH LOGIN',
      Buffer.from('u@own.test').toString('base64'),
      Buffer.from('pw').toString('base64')
    ])
  } finally {
    await s.close()
  }
})

test('STARTTLS: refused when not offered, upgraded (then EHLO again) when offered', async () => {
  const none = await fakeServer({ startTls: false })
  try {
    await assert.rejects(
      sendSmtp({
        host: '127.0.0.1',
        port: none.port,
        tls: 'starttls',
        connect: plain,
        user: 'u',
        pass: 'p',
        from: 'a@x.test',
        to: ['b@x.test'],
        raw: message
      }),
      /does not offer STARTTLS/
    )
    assert.equal(
      none.seen.some((l) => l.startsWith('AUTH')),
      false,
      'no password in the clear'
    )
  } finally {
    await none.close()
  }
  const offered = await fakeServer({ startTls: true })
  let upgraded = 0
  try {
    await sendSmtp({
      host: '127.0.0.1',
      port: offered.port,
      tls: 'starttls',
      connect: plain,
      // The fake speaks plaintext after STARTTLS; what is under test is the client's sequence.
      startTls: async (socket) => {
        upgraded++
        return socket
      },
      user: 'u',
      pass: 'p',
      from: 'a@x.test',
      to: ['b@x.test'],
      raw: message,
      heloName: 'h.test'
    })
    assert.equal(upgraded, 1)
    assert.deepEqual(offered.seen.slice(0, 3), ['EHLO h.test', 'STARTTLS', 'EHLO h.test'])
  } finally {
    await offered.close()
  }
})

test('a refused recipient fails the message before DATA', async () => {
  const s = await fakeServer({ rejectRcpt: 'nobody@x.test' })
  try {
    await assert.rejects(
      sendSmtp({
        host: '127.0.0.1',
        port: s.port,
        tls: 'none',
        connect: plain,
        from: 'a@x.test',
        to: ['b@x.test', 'nobody@x.test'],
        raw: message
      }),
      (e) => e instanceof SmtpError && e.code === 550
    )
    assert.equal(s.seen.includes('DATA'), false)
  } finally {
    await s.close()
  }
})

test('a server that never answers times out instead of hanging', async () => {
  const s = await fakeServer({ silent: true })
  try {
    await assert.rejects(
      sendSmtp({
        host: '127.0.0.1',
        port: s.port,
        tls: 'none',
        connect: plain,
        timeoutMs: 200,
        from: 'a@x.test',
        to: ['b@x.test'],
        raw: message
      }),
      SmtpError
    )
  } finally {
    await s.close()
  }
})

test('framing helpers', () => {
  assert.equal(tlsModeFor(465), 'implicit')
  assert.equal(tlsModeFor(587), 'starttls')
  assert.equal(dataBytes(Buffer.from('.a\r\nb')).toString(), '..a\r\nb\r\n.\r\n')
  assert.equal(dataBytes(Buffer.from('x\r\n')).toString(), 'x\r\n.\r\n')
})
