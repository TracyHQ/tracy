// Network probe used inside the fence by fence-canary.sh. Exit codes tell a sandbox denial apart from a
// port that merely has no listener, so a "must be denied" row cannot pass by accident.
//   connect <host> <port>                 0 connected · 3 denied (EPERM/EACCES) · 4 other error
//   unix <path>                           same, for a unix socket
//   listen <port>                         0 listening · 3 denied · 4 other error
//   lookup <name>                         0 resolved · 4 not resolved
//   proxy <port> <authority>|GET          0 proxy answered 200 · 5 proxy answered non-200 · 3 denied · 4 other
// Exports: none (command only).
import dns from 'node:dns'
import net from 'node:net'

const [mode, a, b] = process.argv.slice(2)
const denied = (e) => e && (e.code === 'EPERM' || e.code === 'EACCES')
const finish = (code) => process.exit(code)
setTimeout(() => finish(4), 5000).unref()

if (mode === 'connect' || mode === 'unix') {
  const s = mode === 'unix' ? net.connect(a) : net.connect(Number(b), a)
  s.once('connect', () => {
    s.destroy()
    finish(0)
  })
  s.once('error', (e) => finish(denied(e) ? 3 : 4))
} else if (mode === 'listen') {
  const srv = net.createServer()
  srv.once('error', (e) => finish(denied(e) ? 3 : 4))
  srv.listen(Number(a), '127.0.0.1', () => srv.close(() => finish(0)))
} else if (mode === 'lookup') {
  dns.lookup(a, (e) => finish(e ? 4 : 0))
} else if (mode === 'proxy') {
  const s = net.connect(Number(a), '127.0.0.1')
  s.once('connect', () => {
    s.write(
      b === 'GET'
        ? 'GET http://example.com/ HTTP/1.1\r\nHost: example.com\r\n\r\n'
        : `CONNECT ${b} HTTP/1.1\r\nHost: ${b}\r\n\r\n`
    )
  })
  let buf = ''
  s.on('data', (d) => {
    buf += d
    if (buf.includes('\r\n')) {
      s.destroy()
      finish(buf.startsWith('HTTP/1.1 200') ? 0 : 5)
    }
  })
  s.once('end', () => finish(5))
  s.once('error', (e) => finish(denied(e) ? 3 : 4))
} else {
  process.stderr.write(`fence-net: unknown mode ${mode}\n`)
  finish(2)
}
