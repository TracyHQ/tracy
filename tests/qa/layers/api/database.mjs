// Owned PostgreSQL for the api layer: one throwaway container per run, created by id, removed by id.
//
// Mirrors scripts/test-database.ts (create → record id → start → probe → remove by id) but on a
// FREE port chosen by the daemon: the fixed port 55432 of that script is routinely held by another
// session's container, and borrowing a database we did not create is never allowed here. No
// inherited DATABASE_URL / TEST_DATABASE_URL, no deploy/.env.
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'

const CONTAINER_ID = /^[0-9a-f]{64}$/
const IMAGE = 'postgres:16-alpine'

/** Default docker runner; replaceable so a test can supply a daemon that does not exist. */
export function dockerRunner(timeoutMs = 120_000) {
  return (args) => {
    const r = spawnSync('docker', args, { encoding: 'utf8', timeout: timeoutMs })
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? (r.error ? String(r.error) : '') }
  }
}

/**
 * @param {{ docker?: (args: string[]) => {status: number|null, stdout: string, stderr: string},
 *   probe: (url: string) => Promise<boolean>, readyTimeoutMs?: number, sleep?: (ms: number) => Promise<void>,
 *   clock?: () => number,
 *   onAcquire?: (handle: object) => void }} io
 * @returns {Promise<{ ok: true, url: string, id: string, remove: () => {ok: boolean, detail: string} }
 *   | { ok: false, probe: string, id: string|null, remove: () => {ok: boolean, detail: string} }>}
 */
export async function startOwnedDatabase(io) {
  const docker = io.docker ?? dockerRunner()
  // Wall-clock, not a probe count: on a loaded machine one probe can take seconds on its own.
  const readyTimeoutMs = io.readyTimeoutMs ?? 300_000
  const clock = io.clock ?? Date.now
  const sleep = io.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  const name = `qa-api-pg-${process.pid}-${randomBytes(6).toString('hex')}`
  let id = null
  let removed = false
  const handle = {
    get id() {
      return id
    },
    remove() {
      if (removed || id === null) return { ok: true, detail: 'nothing owned to remove' }
      const r = docker(['rm', '-f', '-v', id])
      if (r.status === 0) {
        removed = true
        return { ok: true, detail: `removed ${id.slice(0, 12)}` }
      }
      return { ok: false, detail: `docker rm failed: ${r.stderr.trim()}` }
    }
  }
  const fail = (probe) => ({ ok: false, probe, id, remove: () => handle.remove() })

  // Never pull: a missing image is an environment fact (ENV), not something this run may download.
  const image = docker(['image', 'inspect', '--format', '{{.Id}}', IMAGE])
  if (image.status !== 0)
    return fail(
      `image ${IMAGE} is not present and this run does not pull: ${(image.stderr || image.stdout || 'no output').trim()}`
    )

  const created = docker([
    'create',
    '--pull=never',
    '--name',
    name,
    '-e',
    'POSTGRES_USER=qa',
    '-e',
    'POSTGRES_PASSWORD=qa',
    '-e',
    'POSTGRES_DB=qa',
    '-p',
    '127.0.0.1::5432',
    IMAGE
  ])
  if (created.status !== 0) return fail(`docker create failed: ${(created.stderr || 'no output').trim()}`)
  const candidate = created.stdout.trim()
  if (!CONTAINER_ID.test(candidate))
    return fail(`docker create printed a malformed id: ${JSON.stringify(candidate)}`)
  id = candidate
  io.onAcquire?.(handle)

  const started = docker(['start', id])
  if (started.status !== 0) return fail(`docker start failed: ${started.stderr.trim()}`)
  const port = docker(['port', id, '5432/tcp'])
  const m = /:(\d+)\s*$/m.exec(port.stdout)
  if (port.status !== 0 || !m)
    return fail(`docker port gave no mapping: ${(port.stderr || port.stdout).trim()}`)
  const url = `postgres://qa:qa@127.0.0.1:${m[1]}/qa`
  const deadline = clock() + readyTimeoutMs
  let probes = 0
  do {
    probes += 1
    if (await io.probe(url)) return { ok: true, url, id, remove: () => handle.remove() }
    await sleep(1000)
  } while (clock() < deadline)
  return fail(`database never answered select 1 on ${url} within ${readyTimeoutMs} ms (${probes} probes)`)
}

/** Is the docker daemon there at all? A direct probe, so a missing daemon is ENV with its words. */
export function dockerAvailable(docker = dockerRunner(90_000)) {
  const r = docker(['version', '--format', '{{.Server.Version}}'])
  return r.status === 0 && r.stdout.trim() !== ''
    ? { ok: true, detail: r.stdout.trim() }
    : { ok: false, detail: `docker version failed: ${(r.stderr || r.stdout || 'no output').trim()}` }
}
