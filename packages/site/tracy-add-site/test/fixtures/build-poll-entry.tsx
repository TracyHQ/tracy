/**
 * Browser fixture for the build-poll regression (#362).
 *
 * Renders the REAL `AddSiteWizard` in the creation workspace (`<base href="/new/">`, set by the
 * test's HTML) and mocks only `window.fetch`. The build is reached the way a reload reaches it: a
 * pending pointer in `localStorage`, written here when the address carries `seed=1`. How the job
 * door answers is chosen by `scenario=` in the address:
 *   - `fail-after-running`: `running` once, then `failed` with the host's `detail` and `output`.
 *   - `gone-after-running`: `running` once, then 403 with a non-JSON body (the site was deleted).
 *   - `failed`: `failed` from the first ask (a dead build restored after a reload).
 *   - `gone`: 404 from the first ask.
 *   - `done-slow-agent`: `running` once, then `done`; the agent press is held open until the test
 *     calls `window.__harness.releaseAgent(status)`, and `window.__harness.unmount()` takes the
 *     wizard down while it is out. `window.__harness.agentUp = true` makes the site list carry the
 *     site's agent (the wait for the agent ends as ready).
 *   - `brief-failed`: `running` while the Customize answers are written ("writing your text and
 *     pictures"), then `done` with `briefState: 'failed'`; the agent is up from the start.
 * Every job ask is counted in `window.__harness.jobPolls`, per page load.
 */
import { createRoot } from 'react-dom/client'
import { en } from '../../src/client/strings'
import { AddSiteWizard } from '../../src/client/wizard'

function t(key: string, params?: Record<string, string | number>): string {
  const raw = en[key] ?? key
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole))
}

declare global {
  interface Window {
    __harness: {
      jobPolls: number
      agentStarts: number
      agentAnswered: number
      agentUp: boolean
      releaseAgent: (status: number) => void
      unmount: () => void
    }
  }
}

let heldAgent: ((status: number) => void) | null = null
const harness: Window['__harness'] = {
  jobPolls: 0,
  agentStarts: 0,
  agentAnswered: 0,
  agentUp: false,
  releaseAgent: (status) => heldAgent?.(status),
  unmount: () => root.unmount()
}
window.__harness = harness

const query = new URLSearchParams(window.location.search)
const scenario = query.get('scenario') ?? 'failed'
if (scenario === 'brief-failed') harness.agentUp = true
const SESSION = 'fixture-session'
const POINTER_KEY = `tracy:add-site:pending:${SESSION}`
if (query.get('seed') === '1') {
  window.localStorage.setItem(
    POINTER_KEY,
    JSON.stringify({ siteKey: 'dead.tracy.ai', jobId: 'job-dead', platform: 'wordpress' })
  )
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const FAILED = {
  state: 'failed',
  step: 'provision',
  detail: 'see /var/log/tracy/provision-dead.log',
  output: '!! no tracy/emdash image on this host\n   build the latest upstream first',
  liveUrl: null,
  adminUrl: null
}

window.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const path = new URL(url, window.location.href).pathname
  const method = (init?.method ?? 'GET').toUpperCase()

  if (path === '/api/config') return json(200, { siteDomain: 'tracy.ai', sitePort: '' })
  if (path === '/api/sites' && method === 'POST') {
    return json(201, { siteKey: 'deadsite.tracy.ai', jobId: 'job-dead' })
  }
  if (path === '/api/sites' && method === 'GET') {
    const sites = harness.agentUp ? [{ siteKey: 'deadsite.tracy.ai', agent: 'lane-dead' }] : []
    return json(200, { addressPrefix: '', sites })
  }
  if (path === '/api/templates')
    return json(200, {
      templates: [
        {
          id: 'tracy-business',
          label: 'Tracy Business',
          platforms: [{ platform: 'joomla' }, { platform: 'wordpress' }, { platform: 'emdash' }]
        }
      ]
    })
  if (/\/api\/sites\/[^/]+\/agent$/.test(path)) {
    harness.agentStarts += 1
    if (scenario === 'done-slow-agent') {
      const status = await new Promise<number>((resolve) => {
        heldAgent = resolve
      })
      harness.agentAnswered += 1
      return json(status, {})
    }
    return json(200, {})
  }
  if (/\/api\/sites\/[^/]+\/jobs\/[^/]+$/.test(path)) {
    harness.jobPolls += 1
    const first = harness.jobPolls === 1
    if (scenario === 'fail-after-running') {
      return first ? json(200, { state: 'running', step: 'provision', output: '' }) : json(200, FAILED)
    }
    if (scenario === 'gone-after-running') {
      return first
        ? json(200, { state: 'running', step: 'provision', output: '' })
        : new Response('<html>Forbidden</html>', { status: 403, headers: { 'content-type': 'text/html' } })
    }
    if (scenario === 'gone') return json(404, { code: 'JOB_UNKNOWN' })
    if (scenario === 'done-slow-agent') {
      return first
        ? json(200, { state: 'running', step: 'provision', output: '' })
        : json(200, {
            state: 'done',
            step: 'done',
            output: '',
            liveUrl: 'https://deadsite.tracy.ai',
            adminUrl: null
          })
    }
    if (scenario === 'brief-failed') {
      return harness.jobPolls <= 2
        ? json(200, { state: 'running', step: 'writing your text and pictures', output: '' })
        : json(200, {
            state: 'done',
            step: 'done',
            output: '',
            liveUrl: 'https://deadsite.tracy.ai',
            adminUrl: null,
            briefState: 'failed',
            briefError: 'writing into the site took too long'
          })
    }
    return json(200, FAILED)
  }
  return json(404, {})
}) as typeof window.fetch

const root = createRoot(document.getElementById('root') as HTMLElement)
root.render(<AddSiteWizard t={t} settings={{}} sessionId={SESSION} openSite={() => undefined} />)
