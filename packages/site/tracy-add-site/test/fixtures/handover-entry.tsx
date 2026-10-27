/**
 * Browser fixture for the import handover regression (issue #166).
 *
 * It renders the REAL `AddSiteWizard` (which in turn renders the REAL `ImportWizard`) — nothing here
 * stubs a component. The only thing mocked is the network: `window.fetch` answers the wizard's
 * checks and write doors (claim, start, status, provision) plus the reads the parent makes, so the whole
 * import → handover path runs exactly as it does in dsh. The test drives it through the UI.
 *
 * The context is chosen by the page that loads this bundle (see the test's HTML):
 *   - existing-site: a `tracy_site` cookie makes `pageSite()` non-null → parent's `buildStarted`
 *     takes the `inSite` branch (background pending, keeps its own site on screen, dispatches
 *     SHOW_SITE), and the ImportWizard stays mounted. This is the branch #166 froze on.
 *   - creation: `<base href="/new/">` makes `pageSite()` null → the parent swaps the wizard for the
 *     build console.
 *   - `?host-filed`: the finished run carries the host's own filed handover (#1652), so the wizard
 *     follows that job and files none.
 *   - `window.__failFirstProvision`: the provision door refuses the FIRST call (so the failure +
 *     manual-retry path runs) and takes the second — one refusal, then a job.
 */
import { createRoot } from 'react-dom/client'
import { en } from '../../src/client/strings'
import { AddSiteWizard } from '../../src/client/wizard'

/** The dsh Translate, backed by the shipped English base and simple {name} interpolation. */
function t(key: string, params?: Record<string, string | number>): string {
  const raw = en[key] ?? key
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole))
}

interface Harness {
  provisionCount: number
  provisionSiteKeys: string[]
  showSite: number
  openSite: Array<{ url: string; siteKey: string }>
  statusPolls: number
}

declare global {
  interface Window {
    __harness: Harness
    /** Set by the test's HTML to make the provision door refuse the first call (failure + retry). */
    __failFirstProvision?: number
  }
}

const harness: Harness = {
  provisionCount: 0,
  provisionSiteKeys: [],
  showSite: 0,
  openSite: [],
  statusPolls: 0
}
window.__harness = harness

window.addEventListener('tracy:show-site', () => {
  harness.showSite += 1
})

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const realFetch = window.fetch.bind(window)

/** What the stub doors remember, as the real ones do: the addresses claimed and the reads started. */
const claimed = new Set<string>()
// The host keeps its runs across a reload of the tab, so the stub does too (the C3 reopen test).
const runs: Array<{ id: string; siteKey: string; platform: string }> = JSON.parse(
  sessionStorage.getItem('fixture-runs') ?? '[]'
)

// Only the wizard's own doors are answered here; anything else falls through (there is nothing else).
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const path = new URL(url, window.location.href).pathname
  const method = (init?.method ?? 'GET').toUpperCase()
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}

  // Worker reads the parent makes: the shared /api/sites list (address prefix + agent poll) and config.
  if (path === '/api/config') return json(200, { siteDomain: 'tracy.ai', sitePort: '' })
  if (path === '/api/sites' && method === 'GET') return json(200, { addressPrefix: '', sites: [] })
  if (path === '/api/sites/import-address' && method === 'GET') {
    const siteKey = new URL(url, window.location.href).searchParams.get('siteKey')
    return json(200, { ownership: siteKey && claimed.has(siteKey) ? 'mine' : 'available' })
  }

  // 1. claim (POST /api/sites {origin:'import'}) — as the real door answers it
  // (`apps/tracy-web/src/sites/route.js`, the `body.origin === 'import'` branch): 201 for an address
  // nobody held, 200 with `alreadyMine` for one this account already holds.
  if (path === '/api/sites' && method === 'POST' && body.origin === 'import') {
    const siteKey = String(body.siteKey)
    const alreadyMine = claimed.has(siteKey)
    claimed.add(siteKey)
    return alreadyMine ? json(200, { siteKey, alreadyMine: true }) : json(201, { siteKey })
  }

  // 2. host half: extension + detect + start + status
  if (path.endsWith('/api/tracy-add-site/extension')) {
    return json(200, { version: '1.0.0', packageUrl: 'https://example.test/cowork.zip', releaseUrl: null })
  }
  if (path.endsWith('/api/tracy-add-site/detect')) {
    if (new URLSearchParams(window.location.search).has('detection-failed')) return json(503, {})
    return json(200, {
      platform: 'joomla',
      reachable: true,
      secure: true,
      blocked: false,
      ...(body.adminUrl ? { admin: { signInFound: true, locked: false, basicAuthRequired: false } } : {})
    })
  }
  if (path.endsWith('/api/tracy-add-site/start')) {
    const run = {
      id: `run-${runs.length + 1}`,
      siteKey: String(body.siteKey),
      platform: String(body.platform)
    }
    runs.push(run)
    sessionStorage.setItem('fixture-runs', JSON.stringify(runs))
    return json(202, { runId: run.id })
  }
  if (path.endsWith('/api/tracy-add-site/status')) {
    // As the host door answers it (`src/host/index.ts`, `handleStatus`): the run named by `runId`,
    // or the latest run of `siteKey`; a site no read was started for is 404 RUN_UNKNOWN.
    const run = body.runId
      ? runs.find((r) => r.id === body.runId)
      : runs.findLast((r) => r.siteKey === body.siteKey)
    if (!run) return json(404, { code: 'RUN_UNKNOWN' })
    harness.statusPolls += 1
    // First poll shows the reader packing files (the screen #166 froze on); the next reports done so
    // the handover fires. A short two-step so the test sees the spinner give way to the terminal.
    // The counts are small synthetic values — enough to render the detail chips, nothing measured.
    if (harness.statusPolls < 2) {
      return json(200, {
        ...run,
        state: 'running',
        step: 'reading_files',
        detail: { tables: 2, files: 4 }
      })
    }
    return json(200, {
      ...run,
      state: 'done',
      step: 'handing_over',
      detail: { tables: 2, files: 6 },
      result: { webrootKey: 'wr-key', dbKey: 'db-key', liveSite: `https://${run.siteKey}` },
      // `?host-filed`: the host filed the build itself (#1652), so the wizard only follows its job.
      ...(new URLSearchParams(window.location.search).has('host-filed')
        ? { handover: { state: 'filed', jobId: 'job-host' } }
        : {})
    })
  }

  // 4. provision — the one call whose count is the whole point of "exactly one provision".
  if (/\/api\/sites\/[^/]+\/provision$/.test(path) && method === 'POST') {
    harness.provisionCount += 1
    harness.provisionSiteKeys.push(decodeURIComponent(path.split('/')[3]))
    // Refuse only the first call when the page asks for it: that drives the failure screen, and the
    // manual retry (the second call) is taken — proving one provision per attempt.
    if (window.__failFirstProvision && harness.provisionCount === 1) {
      return json(409, { code: 'store_refused' })
    }
    return json(202, { jobId: 'job-1' })
  }

  // Parent build console poll (creation context) — keep it running so the console stays on screen.
  if (/\/api\/sites\/[^/]+\/jobs\/[^/]+$/.test(path)) {
    return json(200, { state: 'running', step: 'provision', liveUrl: null, adminUrl: null, output: '' })
  }
  // Parent's "start the agent" door (creation context, after the build reports done — not reached here).
  if (/\/api\/sites\/[^/]+\/agent$/.test(path)) return json(200, {})

  return realFetch(input as RequestInfo, init)
}) as typeof window.fetch

const root = createRoot(document.getElementById('root') as HTMLElement)
root.render(
  <AddSiteWizard
    t={t}
    settings={{}}
    sessionId="fixture-session"
    openSite={(url, siteKey) => {
      harness.openSite.push({ url, siteKey })
    }}
  />
)
