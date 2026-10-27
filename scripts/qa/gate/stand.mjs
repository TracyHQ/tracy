/**
 * What the gate asks of the QA stand's `tracy-web` container that HTTP cannot give it: a session
 * cookie minted inside the container (so `SESSION_SECRET` never leaves it), the last sign-in code
 * from its log (the console mail transport prints every mail), and the sites an account holds.
 *
 * Exports:
 *   parseOtp(logText: string, email: string): string | null
 *   dockerStand({ container, context?, docker? = 'docker', upstream: { host, port }, mainHost,
 *                 logSince? = '2h' }): Stand
 * Stand:
 *   mintSession(email): Promise<string>         // a `v1.…` token
 *   readOtp(email): Promise<string | null>
 *   listSites(email): Promise<string[]>         // siteKeys from `GET /api/sites` as that account
 */
import { execFile } from 'node:child_process'
import { request } from 'node:http'

/** The code in the LAST mail the console transport logged for `email` (`[mail] to=<email> …`). */
export function parseOtp(logText, email) {
  const marker = `[mail] to=${email.toLowerCase()} `
  const text = String(logText)
  const lower = text.toLowerCase()
  const at = lower.lastIndexOf(marker)
  if (at === -1) return null
  let body = text.slice(at + marker.length)
  const next = body.indexOf('[mail] to=')
  if (next !== -1) body = body.slice(0, next)
  // The subject line may hold digits of its own (a site name); the code is in the body after it.
  const nl = body.indexOf('\n')
  const m = /\b(\d{6})\b/.exec(nl === -1 ? body : body.slice(nl))
  return m ? m[1] : null
}

const MINT = [
  "const m = await import('/opt/tracy-web/src/lib/session.js');",
  'process.stdout.write(await m.mintSession(process.env.QA_EMAIL, process.env.SESSION_SECRET));'
].join(' ')

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 32 * 1024 * 1024, timeout: 30_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} ${args[0]} failed: ${String(stderr || err.message).trim()}`))
      else resolve({ stdout: String(stdout), stderr: String(stderr) })
    })
  })
}

function getJson({ host, port }, path, headers) {
  return new Promise((resolve, reject) => {
    const req = request({ host, port, path, method: 'GET', headers }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) })
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

export function dockerStand({ container, context, docker = 'docker', upstream, mainHost, logSince = '2h' }) {
  const pre = context ? ['--context', context] : []
  const stand = {
    async mintSession(email) {
      const { stdout } = await run(docker, [
        ...pre,
        'exec',
        '-e',
        `QA_EMAIL=${email}`,
        container,
        'node',
        '--input-type=module',
        '-e',
        MINT
      ])
      const token = stdout.trim()
      if (!/^v1\.[\w-]+\.[\w-]+$/.test(token)) throw new Error('mint answered no token')
      return token
    },
    async readOtp(email) {
      // `docker logs` writes the container's stdout and stderr to its own two streams.
      const { stdout, stderr } = await run(docker, [...pre, 'logs', '--since', logSince, container])
      return parseOtp(`${stdout}\n${stderr}`, email)
    },
    async listSites(email) {
      const token = await stand.mintSession(email)
      const { status, body } = await getJson(upstream, '/api/sites', {
        host: mainHost,
        cookie: `tracy_sess=${token}`,
        accept: 'application/json'
      })
      if (status !== 200 || !Array.isArray(body?.sites)) throw new Error(`GET /api/sites answered ${status}`)
      return body.sites.map((s) => String(s.siteKey).toLowerCase())
    }
  }
  return stand
}
