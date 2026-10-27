// In-process tracy-host harness: the real Hono app with a recording fake `run`, a file-backed job
// store in a scratch directory, and a signer taken from the CALLER's code (tracy-web's client),
// which is the independent reading of the signed-channel contract.
import { scratchDir } from './scratch.mjs'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO } from './harness.mjs'

/** Every `/_host/*` door the host registers, with the verb its caller (tracy-web client) uses. */
export const HOST_ROUTES = [
  { key: 'POST /_host/provision', method: 'POST', path: '/_host/provision', label: true },
  { key: 'GET /_host/jobs/:id', method: 'GET', path: '/_host/jobs/abcdef123456', label: false, json: false },
  { key: 'POST /_host/attach', method: 'POST', path: '/_host/attach', label: true },
  { key: 'POST /_host/reserve', method: 'POST', path: '/_host/reserve', label: true },
  { key: 'POST /_host/unreserve', method: 'POST', path: '/_host/unreserve', label: true },
  { key: 'POST /_host/teardown', method: 'POST', path: '/_host/teardown', label: true },
  { key: 'POST /_host/site', method: 'POST', path: '/_host/site', label: true },
  { key: 'POST /_host/agent-token', method: 'POST', path: '/_host/agent-token', label: true },
  { key: 'POST /_host/content-token', method: 'POST', path: '/_host/content-token', label: true },
  { key: 'POST /_host/site-files', method: 'POST', path: '/_host/site-files', label: true },
  { key: 'POST /_host/dsh-versions', method: 'POST', path: '/_host/dsh-versions', label: false, json: false },
  { key: 'POST /_host/model-keys', method: 'POST', path: '/_host/model-keys', label: false },
  { key: 'POST /_host/address', method: 'POST', path: '/_host/address', label: true },
  { key: 'POST /_host/go-live', method: 'POST', path: '/_host/go-live', label: true },
  { key: 'POST /_host/capture', method: 'POST', path: '/_host/capture', label: false },
  { key: 'POST /_host/outline', method: 'POST', path: '/_host/outline', label: false }
]

export const HOST_SECRET = 'qa-infra-host-secret-0123456789'

let signerPromise
/** The caller-side signer (apps/tracy-web/src/host/client.js) — always the real tree, never mutated. */
export function signer() {
  signerPromise ??= import(pathToFileURL(path.join(REPO, 'apps/tracy-web/src/host/client.js')).href)
  return signerPromise
}

/**
 * Build one host app rooted at product tree `root`. Returns the app plus the recorders every
 * case asserts on: `runs` (commands the host tried to execute), `puts` (job records written),
 * and `listRoots()` (names present in the sites/private/jobs directories).
 */
export async function hostEnv(root, { jobs: withJobs = true, fileJobs = false } = {}) {
  const base = scratchDir('qa-infra-host-')
  const dirs = {
    sitesRoot: path.join(base, 'sites'),
    privateRoot: path.join(base, 'private'),
    jobsDir: path.join(base, 'jobs'),
    logDir: path.join(base, 'logs'),
    scriptsDir: path.join(base, 'fleet')
  }
  for (const dir of Object.values(dirs)) mkdirSync(dir, { recursive: true })
  const config = {
    hostName: 'qa',
    hostSecret: HOST_SECRET,
    ...dirs,
    dshContainer: 'qa-dsh',
    cloudflare: { token: 'qa-token', account: 'qa-account', tunnel: 'qa-tunnel' }
  }
  const runs = []
  const puts = []
  const run = async (spec) => {
    runs.push(spec)
    return { code: 0, tail: [] }
  }
  const store = new Map()
  const fileStore = fileJobs
    ? await import(pathToFileURL(path.join(root, 'apps/tracy-host/src/jobs.js')).href)
    : null
  const jobs = fileStore
    ? {
        put: async (id, fields) => {
          puts.push({ id, fields })
          return fileStore.putJob(dirs.jobsDir, id, fields)
        },
        get: (id) => fileStore.readJob(dirs.jobsDir, id)
      }
    : withJobs
      ? {
          put: async (id, fields) => {
            puts.push({ id, fields })
            const next = { ...(store.get(id) ?? { id }), ...fields }
            store.set(id, next)
            return next
          },
          get: async (id) => store.get(id) ?? null
        }
      : null
  const { buildApp } = await import(pathToFileURL(path.join(root, 'apps/tracy-host/src/app.js')).href)
  // The browser doors only record that they were asked; no browser is launched.
  const shoot = async () => {
    runs.push({ script: '<shoot>' })
    return { buffer: Buffer.alloc(0) }
  }
  const outline = async () => {
    runs.push({ script: '<outline>' })
    return {}
  }
  const app = buildApp({ config, jobs, run, shoot, outline })
  const client = await signer()

  /** Send one request; `sign:false` omits headers; `headers` overrides signed headers. */
  async function send({ method = 'POST', path: urlPath, body = '', sign = true, now, nonce, headers = {} }) {
    const signed = sign
      ? await client.signHostCall({ secret: HOST_SECRET, path: urlPath.split('?')[0], body, now, nonce })
      : {}
    // Hono logs an unhandled route error with console.error; a case that expects one stays quiet.
    const realError = console.error
    console.error = () => {}
    let res
    try {
      res = await app.fetch(
        new Request(`http://tracy-host.test${urlPath}`, {
          method,
          headers: { ...signed, ...headers },
          ...(method === 'GET' || method === 'HEAD' ? {} : { body })
        })
      )
    } finally {
      console.error = realError
    }
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {}
    return { status: res.status, text, json, headers }
  }

  return {
    app,
    config,
    dirs,
    runs,
    puts,
    store,
    send,
    snapshot: () => Object.fromEntries(Object.entries(dirs).map(([k, d]) => [k, readdirSync(d).sort()])),
    dispose: () => rmSync(base, { recursive: true, force: true })
  }
}
