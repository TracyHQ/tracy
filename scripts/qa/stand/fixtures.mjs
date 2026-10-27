/**
 * Stand fixtures the lanes rely on, and the end-of-night sweep of the sites they created.
 *
 *   fixtureEmail(lane, domain?) -> string            // the lane's standing account
 *   ensureLaneSeats({ lanes, sites, domain?, docker? }) -> { ok, granted: [{ lane, site }], error? }
 *   sweepSites({ qaHome, runId?, keep?, domain?, docker?, upstream?, fetchImpl? })
 *     -> { deleted: string[], downed: string[], failed: [{ site, reason }] }
 *
 * Every lane signs in as `fixture@<lane>.<domain>` when a test needs a seat on a fixed site; that
 * account holds an `admin` seat on each fixed site. Seats are written straight into the QA stand's
 * own database (the stand is ours; there is no invite door a script can answer).
 *
 * The sweep deletes, through tracy-web as the site's owner, every non-fixed site the gate ledger
 * says was created; a site tracy-web will not delete (no owner row: the provision failed half way)
 * is taken down with compose through the docker guard, which allows ledger sites only.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { QA } from './qa-stand.mjs'

const WEB = 'tracy-qa-tracy-web-1'
const PG = 'tracy-qa-postgres-1'
const DOMAIN = 'qa.tracy.test'

const run = (docker, args) => {
  const r = spawnSync(docker, args, { encoding: 'utf8' })
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}
const sqlString = (s) => `'${String(s).replaceAll("'", "''")}'`
const psql = (docker, sql) =>
  run(docker, ['exec', PG, 'psql', '-U', 'tracy', '-d', 'tracy', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql])

export function fixtureEmail(lane, domain = DOMAIN) {
  return `fixture@${lane}.${domain}`
}

export function ensureLaneSeats({ lanes, sites = QA.fixedSites, domain = DOMAIN, docker = 'docker' }) {
  const keys = sites.map((s) => (s.includes('.') ? s : `${s}.${domain}`))
  const granted = []
  for (const lane of lanes) {
    const email = fixtureEmail(lane, domain)
    const sql = [
      `insert into account (email) select ${sqlString(email)} where not exists (select 1 from account where email = ${sqlString(email)});`,
      ...keys.map(
        (k) =>
          `insert into seat (site_key, account_id, role, granted_at, accepted_at) select ${sqlString(k)}, a.id, 'admin', now(), now() from account a where a.email = ${sqlString(email)} and exists (select 1 from site where site_key = ${sqlString(k)}) on conflict (site_key, account_id) do nothing;`
      )
    ].join(' ')
    const r = psql(docker, sql)
    if (r.code !== 0) return { ok: false, granted, error: r.stderr.trim().slice(0, 300) }
    for (const k of keys) granted.push({ lane, site: k })
  }
  return { ok: true, granted }
}

function createdSites(qaHome, runId) {
  const file = path.join(qaHome, 'state', 'sites.jsonl')
  if (!existsSync(file)) return []
  const keys = new Set()
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    let row
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if (row.op !== 'create' || typeof row.siteKey !== 'string') continue
    if (runId && row.runId !== runId) continue
    keys.add(row.siteKey)
  }
  return [...keys]
}

const MINT = `import { mintSession } from './src/lib/session.js'; console.log(await mintSession(process.env.QA_EMAIL, process.env.SESSION_SECRET))`

export async function sweepSites({
  qaHome,
  runId = null,
  keep = QA.fixedSites,
  domain = DOMAIN,
  docker = 'docker',
  upstream = { host: '127.0.0.1', port: 36081 },
  fetchImpl = fetch
}) {
  const fixed = new Set(keep.map((s) => (s.includes('.') ? s : `${s}.${domain}`)))
  const out = { deleted: [], downed: [], failed: [] }
  for (const site of createdSites(qaHome, runId)) {
    if (fixed.has(site)) continue
    const project = site.split('.')[0]
    const running = run(docker, ['ps', '-aq', '--filter', `label=com.docker.compose.project=${project}`])
    const owner = psql(
      docker,
      `select a.email from seat s join account a on a.id = s.account_id where s.site_key = ${sqlString(site)} and s.role = 'owner' and s.revoked_at is null limit 1`
    ).stdout.trim()
    if (owner) {
      const mint = run(docker, [
        'exec',
        '-e',
        `QA_EMAIL=${owner}`,
        '-w',
        '/opt/tracy-web',
        WEB,
        'node',
        '--input-type=module',
        '-e',
        MINT
      ])
      const token = mint.stdout.trim().split('\n').pop()
      try {
        const r = await fetchImpl(
          `http://${upstream.host}:${upstream.port}/api/sites/${encodeURIComponent(site)}`,
          {
            method: 'DELETE',
            headers: {
              host: `${domain}:36080`,
              origin: `http://${domain}:36080`,
              cookie: `tracy_sess=${token}`
            }
          }
        )
        if (r.ok) {
          out.deleted.push(site)
          continue
        }
      } catch {}
    }
    if (!running.stdout.trim()) continue // nothing left to take down
    const dir = run(docker, [
      'inspect',
      running.stdout.trim().split('\n')[0],
      '--format',
      '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'
    ]).stdout.trim()
    const down = run(docker, ['compose', '-p', project, '--project-directory', dir || '.', 'down', '-v'])
    if (down.code === 0) out.downed.push(site)
    else out.failed.push({ site, reason: down.stderr.trim().slice(0, 200) })
  }
  return out
}
