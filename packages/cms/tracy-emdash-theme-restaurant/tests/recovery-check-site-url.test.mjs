// recovery-check.mjs restarts the site's server; the restarted server must keep the site's canonical origin (EMDASH_SITE_URL). It used to start
// it with HOST and PORT only, so after the restart the canonical origin became http://localhost:<port> on every origin (JA Nova, 2026-11-25).
// The fake site below keeps one field in a file (so the change survives a restart) and records the EMDASH_SITE_URL of every start.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const TOOLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../tools')
const ENTRY = `import http from 'node:http'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
appendFileSync('starts.txt', (process.env.EMDASH_SITE_URL ?? '(unset)') + '\\n')
const read = () => (existsSync('field.txt') ? readFileSync('field.txt', 'utf8') : 'original')
http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const u = new URL(req.url, 'http://x')
    if (u.pathname.startsWith('/_emdash/api/content/')) {
      res.setHeader('content-type', 'application/json')
      if (req.method === 'PUT') writeFileSync('field.txt', JSON.parse(body).data.title)
      return res.end(JSON.stringify({ data: { item: { id: 'e1', liveData: { title: read() } }, _rev: 'r1' } }))
    }
    res.end('<html><body>' + read() + '</body></html>')
  })
}).listen(Number(process.env.PORT), '127.0.0.1')
`

const freePort = () =>
  new Promise((res) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const p = s.address().port
      s.close(() => res(p))
    })
  })

describe('recovery-check restarts the server with the site origin', () => {
  it('passes EMDASH_SITE_URL to the restarted server', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'recov-'))
    mkdirSync(path.join(dir, 'dist/server'), { recursive: true })
    mkdirSync(path.join(dir, 'data'))
    writeFileSync(path.join(dir, 'dist/server/entry.mjs'), ENTRY)
    writeFileSync(path.join(dir, 'data/tracy-agent.token'), 'token\n')
    const port = await freePort()
    const site = `http://127.0.0.1:${port}`
    const { spawn } = await import('node:child_process')
    const first = spawn(process.execPath, ['dist/server/entry.mjs'], {
      cwd: dir,
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), EMDASH_SITE_URL: site },
      stdio: 'ignore'
    })
    try {
      for (let i = 0; i < 40; i++) {
        if (await fetch(`${site}/`).then(() => true, () => false)) break
        await new Promise((r) => setTimeout(r, 100))
      }
      // The run ends in a failure at the backup step (the fake site has no tools/backup.sh): only the restart is asserted.
      await new Promise((res) =>
        execFile(
          process.execPath,
          [path.join(TOOLS, 'recovery-check.mjs'), '--site', site, '--collection', 'c', '--slug', 's', '--field', 'title', '--public', '/', '--out', path.join(dir, 'r.json')],
          { cwd: dir, timeout: 60000 },
          () => res()
        )
      )
      const starts = readFileSync(path.join(dir, 'starts.txt'), 'utf8').trim().split('\n')
      assert.equal(starts.length >= 2, true, `the server was restarted (starts: ${starts})`)
      assert.equal(starts.at(-1), site, 'the restarted server keeps the site origin')
    } finally {
      first.kill()
      try {
        const { execFileSync } = await import('node:child_process')
        for (const pid of execFileSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).split('\n').filter(Boolean)) process.kill(Number(pid))
      } catch {}
    }
  })
})
