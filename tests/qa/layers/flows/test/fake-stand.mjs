// A tiny in-process stand: just enough of /login, /verify and /auth/me for the sign-in scenarios,
// with switchable faults, plus a fake `docker` that serves its mail sink and its account table.
import http from 'node:http'
import { fakeRun } from './helpers.mjs'

export async function startFakeStand(faults = {}) {
  const codes = new Map()
  const accounts = new Map()
  const mailLog = []
  let counter = 0
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || '{}') : {}
    const send = (status, json, headers = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers })
      res.end(JSON.stringify(json))
    }
    if (req.method === 'GET' && req.url === '/login') return send(200, { page: true })
    if (req.method === 'POST' && req.url === '/login') {
      if (faults.loginDown) return send(500, {})
      counter += 1
      const code = String(100000 + counter * 7).slice(0, 6)
      codes.set(body.email, code)
      mailLog.push({
        at: Date.now(),
        line: `[mail] to=${body.email} subject="${code} is your Tracy sign-in code"`
      })
      return send(200, { ok: true })
    }
    if (req.method === 'POST' && req.url === '/verify') {
      const real = codes.get(body.email)
      const ok = faults.acceptAnyCode ? real !== undefined : real !== undefined && body.code === real
      if (!ok) return send(401, { code: 'CODE_INVALID' })
      if (!faults.keepCode) codes.delete(body.email)
      if (!accounts.has(body.email)) accounts.set(body.email, `acc-${accounts.size + 1}`)
      return send(
        200,
        { ok: true, email: body.email },
        {
          'set-cookie': `tracy_sess=v1.${Buffer.from(body.email).toString('hex')}.signature; Path=/; HttpOnly`
        }
      )
    }
    if (req.method === 'GET' && req.url === '/auth/me') {
      const m = /tracy_sess=v1\.([0-9a-f]+)\./.exec(req.headers.cookie ?? '')
      return send(200, { email: m ? Buffer.from(m[1], 'hex').toString() : null })
    }
    return send(404, {})
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const stand = {
    origin: `http://127.0.0.1:${port}`,
    siteDomain: 'localhost',
    containers: { web: 'fake-web', host: 'fake-host', postgres: 'fake-pg', dsh: 'fake-dsh' }
  }
  const run = fakeRun((cmd, args, opts) => {
    if (cmd === 'docker' && args[0] === 'logs') {
      if (faults.sinkDown) return { code: 1, stderr: 'No such container: fake-web' }
      return { stdout: mailLog.map((m) => m.line).join('\n') }
    }
    if (cmd === 'docker' && args[0] === 'exec' && args.includes('psql')) {
      const email = args.find((a) => a.startsWith('e='))?.slice(2)
      const sql = opts.input ?? ''
      if (/count\(\*\) from account/.test(sql))
        return { stdout: `BEGIN\n${accounts.has(email) ? 1 : 0}\nROLLBACK\n` }
      if (/select id from account/.test(sql))
        return { stdout: `BEGIN\n${accounts.get(email) ?? ''}\nROLLBACK\n` }
    }
    return { code: 1, stderr: 'unexpected command' }
  })
  return { stand, run, server, accounts, close: () => new Promise((r) => server.close(r)) }
}
