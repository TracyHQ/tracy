// The publish pilot, as a function of a running stand (stand.mjs owns the stand's life cycle; this
// file used to own it too — see SOURCE.md). Signs the three seats in through the real doors and the
// mail sink, builds one WordPress site in the owned pool, and drives the real screens in a browser
// through pilot-drive.mjs, which measures each state and returns rows.
//
// What it does NOT do, and says so: the go-live and ingress stubs of the original pilot are not
// shipped here, so without `stubDir` the run reports PENDING instead of rows. What the rows are
// compared with is not decided here either: no approved oracle for publish is in this tree
// (REG-PR-948-site-publish-flow is absent), so the layer records the rows as evidence and never
// turns the original expectation strings into a verdict.

import { randomUUID } from 'node:crypto'
import { REPO, exec, sleep } from '../util.mjs'
import { call, signIn } from '../stand-client.mjs'
import { drive } from './pilot-drive.mjs'

export const PILOT_LABEL = 'tchqa-publish'

/**
 * @param {{ stand: import('../stand-client.mjs').StandInfo & { siteDomain: string }, outDir: string, cdp: string,
 *   stubDir?: string | null, intent?: { site: (label: string, key: string) => void }, now?: () => number }} cfg
 * @returns {Promise<{ status: 'PENDING' | 'DONE', reason?: string, rows?: any[], siteKey?: string }>}
 */
export async function runPilot({ stand, outDir, cdp, stubDir = null, intent }) {
  if (!stubDir)
    return {
      status: 'PENDING',
      reason:
        'the go-live/ingress stubs the pilot drives against are not shipped with this layer (stubDir not given)'
    }
  const siteKey = `${PILOT_LABEL}.${stand.siteDomain}`
  const cookies = {}
  const emails = {
    owner: 'owner@qa-publish.example.test',
    editor: 'editor@qa-publish.example.test',
    viewer: 'viewer@qa-publish.example.test'
  }
  cookies.owner = (await signIn(stand, emails.owner)).cookie
  intent?.site(PILOT_LABEL, siteKey)
  const created = await call(stand, cookies.owner, 'POST', '/api/sites', {
    label: PILOT_LABEL,
    platform: 'wordpress',
    buildId: randomUUID()
  })
  if (!created.json?.jobId || created.json.reused)
    throw new Error(`POST /api/sites answered ${created.status} ${created.text.slice(0, 200)}`)
  const started = Date.now()
  for (;;) {
    const polled = await call(stand, cookies.owner, 'GET', `/api/sites/${siteKey}/jobs/${created.json.jobId}`)
    if (polled.json?.state === 'failed') throw new Error(`provisioning failed: ${polled.text.slice(0, 400)}`)
    if (polled.json?.state === 'done') break
    if (Date.now() - started > 900_000) throw new Error('the build did not finish in 15 minutes')
    await sleep(3000)
  }
  for (const role of ['editor', 'viewer']) {
    const invited = await call(stand, cookies.owner, 'POST', '/api/team/invite', {
      role,
      emails: [emails[role]],
      siteKeys: [siteKey]
    })
    if (invited.status >= 300) throw new Error(`inviting the ${role} answered ${invited.status}`)
    cookies[role] = (await signIn(stand, emails[role])).cookie
    await call(stand, cookies[role], 'POST', `/api/sites/${siteKey}/accept`)
  }
  const rows = []
  const docker = (args) => exec('docker', args, { timeoutMs: 120_000 })
  const hostCtl = stand.containers.host
  await drive({
    rows,
    repo: REPO,
    cdp,
    origin: stand.origin,
    siteKey,
    label: PILOT_LABEL,
    siteUrl: `http://${siteKey}:${new URL(stand.origin).port}/`,
    cookies,
    pg: stand.containers.postgres,
    stubDir,
    privateDir: null,
    pauseHost: () => docker(['pause', hostCtl]),
    unpauseHost: () => docker(['unpause', hostCtl]),
    restartHost: async () => {
      await docker(['restart', hostCtl])
      await sleep(10_000)
    },
    dropHostJobs: () => '0',
    siteContainers: (label) => (label === PILOT_LABEL ? [`${PILOT_LABEL}-web-1`, `${PILOT_LABEL}-db-1`] : []),
    createSite: async () => ({ siteKey }),
    deleteSite: false,
    outDir
  })
  return { status: 'DONE', rows, siteKey }
}
