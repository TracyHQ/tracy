// The I/O half of the regression runner's dev profile (`tests/regression/run.mjs --profile dev`):
// per case, build the sites and seats the case needs on dev through tracy-web's own doors, under
// this run's manifest; write the env file the case's Codex sources (`$Q/env.sh`, no secret in
// it); and after the case, remove every token it left in `$Q` and delete its sites.
//
// What a case needs is decided by `devPlan` in `tests/regression/run.mjs` (pure, tested there);
// this file only carries it out. Results never go to `tests/regression/results/` — that folder is
// the `Regression` gate's evidence for a PR's commits — but to `~/TCH-local/e2e-dev/reg/<runId>/`.

import { chmodSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from './api.mjs'
import { mintCookie } from './dev.mjs'
import { ENV, runEmail, runLabel } from './env.mjs'
import { Manifest, findAbandoned } from './manifest.mjs'
import { noteAccount } from './run-site.mjs'
import { CLEANERS, createSite, waitForJob } from './sites.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/** Where `--profile dev` runs live: one folder per run, a sibling of the suite's own runs. */
export const REG_ROOT = join(ENV.resultsRoot, 'reg')

/** The run's three accounts: A owns every site; B and C hold the extra seats a case asks for. */
export const ACCOUNTS = Object.freeze({ a: 'owner', b: 'editor', c: 'third' })

/**
 * The role a seat need is granted with. Tracy has no viewer role (`owner`, `admin`, `developer`,
 * `editor`); the cases that ask for `seat:viewer` want "a third seat, viewer or editor"
 * (REG-061), so C is an editor too.
 */
const SEAT_ROLE = Object.freeze({ b: 'editor', c: 'editor' })

const LETTER = Object.freeze({ wordpress: 'w', joomla: 'j', emdash: 'e' })

/** A session token, wherever it sits in a file. */
const TOKEN = /\bv1\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/

/** Thrown when the case's preconditions could not be built: the case is BLOCKED, not FAIL. */
export class SetupBlocked extends Error {
  constructor(message) {
    super(message)
    this.name = 'SetupBlocked'
  }
}

/**
 * Clean what killed `--profile dev` runs left behind (same rule as the suite: only resources the
 * dead run's manifest names).
 * @param {(line: string) => void} log
 */
export async function recoverAbandoned(log) {
  const recovered = []
  for (const m of findAbandoned(REG_ROOT)) {
    const before = m.read()
    log(`recovering run ${before.runId}: ${m.open().length} open resource(s)`)
    const after = await m.cleanup(CLEANERS)
    m.finish()
    recovered.push({
      runId: before.runId,
      resources: after.map((r) => ({ kind: r.kind, id: r.id, state: r.state }))
    })
  }
  return recovered
}

/** Open this run's folder and manifest. */
export function openRun(runId) {
  const dir = join(REG_ROOT, runId)
  return { dir, manifest: Manifest.create(dir, runId) }
}

/**
 * Build what one case needs and write its env file.
 * @param {{ runId: string, manifest: Manifest, runDir: string, caseId: string, index: number,
 *   plan: { sites: string[], seats: ('b' | 'c')[] } }} p
 * @returns {Promise<{ q: string, envFile: string, sites: { platform: string, label: string, siteKey: string, ms: number }[] }>}
 */
export async function prepareCase({ runId, manifest, runDir, caseId, index, plan }) {
  const q = join(runDir, caseId)
  mkdirSync(q, { recursive: true, mode: 0o700 })
  chmodSync(q, 0o700)
  const emails = Object.fromEntries(Object.entries(ACCOUNTS).map(([k, role]) => [k, runEmail(runId, role)]))
  for (const email of Object.values(emails)) noteAccount(manifest, email, { email })

  const owner = new Client({ name: 'owner', email: emails.a, token: await mintCookie(emails.a) })
  const sites = []
  for (const platform of plan.sites) {
    const label = runLabel(runId, `${index}${LETTER[platform]}`)
    const t0 = Date.now()
    let made
    try {
      made = await createSite(owner, manifest, { label, platform, design: ENV.builds[platform].design })
    } catch (error) {
      throw new SetupBlocked(`site ${label}: ${error instanceof Error ? error.message : String(error)}`)
    }
    const job = await waitForJob(owner, made.siteKey, made.jobId, ENV.readyCapMs)
    if (job.state !== 'done')
      throw new SetupBlocked(
        `${platform} site ${label}: provision ${job.state} after ${Math.round(job.ms / 1000)} s (last step ${job.steps.at(-1) ?? '—'})`
      )
    sites.push({ platform, label: made.label, siteKey: made.siteKey, ms: Date.now() - t0 })
  }

  for (const who of plan.seats) {
    const invite = await owner.post('/api/team/invite', {
      emails: [emails[who]],
      siteKeys: sites.map((s) => s.siteKey),
      role: SEAT_ROLE[who]
    })
    const outcomes = invite.json?.results?.[0]?.sites?.map((s) => s.outcome) ?? []
    if (invite.status !== 200 || outcomes.length !== sites.length || outcomes.some((o) => o !== 'invited'))
      throw new SetupBlocked(
        `seat ${who}: invite answered ${invite.status} ${invite.json?.code ?? ''} outcomes ${JSON.stringify(outcomes)}`
      )
    const member = new Client({ name: who, email: emails[who], token: await mintCookie(emails[who]) })
    for (const s of sites) {
      const accept = await member.post(`/api/sites/${encodeURIComponent(s.siteKey)}/accept`, {})
      if (accept.status !== 200 || accept.json?.accepted !== true)
        throw new SetupBlocked(
          `seat ${who} on ${s.siteKey}: accept answered ${accept.status} ${accept.json?.code ?? ''}`
        )
    }
  }

  const envFile = join(q, 'env.sh')
  writeFileSync(envFile, envScript({ runId, q, emails, sites }), { mode: 0o600 })
  return { q, envFile, sites }
}

const sh = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`

/**
 * The case's env file: the values of the shared dev setup and the helpers that reach dev only
 * through `tests/e2e-dev/bin/`. No token is in it; cookies are minted into `$Q` by `mint`.
 */
export function envScript({ runId, q, emails, sites }) {
  const first = sites[0]
  const lines = [
    '# Written by tests/regression/run.mjs --profile dev. No secret in this file.',
    `export E2E_RUN_ID=${sh(runId)}`,
    `export TCH=${sh(REPO)}`,
    `export O=${sh(ENV.origin)}`,
    'export ORIGIN="$O"',
    `export COOKIE_DOMAIN=${sh(ENV.cookieDomain)}`,
    `export UA=${sh(ENV.userAgent)}`,
    `export Q=${sh(q)}`,
    `export A=${sh(emails.a)}`,
    `export B=${sh(emails.b)}`,
    `export C=${sh(emails.c)}`,
    ...(first ? [`export S=${sh(first.siteKey)}`, `export KEY="$S"`, `export LABEL=${sh(first.label)}`] : []),
    ...sites.flatMap((s) => {
      const k = { wordpress: 'WP', joomla: 'JO', emdash: 'EM' }[s.platform]
      return [`export S_${k}=${sh(s.siteKey)}`, `export LABEL_${k}=${sh(s.label)}`]
    }),
    '# mint <a|b|c>: a session for seat A, B or C into $Q/cookie-<a|b|c>.txt (chmod 600, never printed)',
    'mint() { case "$1" in a) e="$A";; b) e="$B";; c) e="$C";; *) echo "mint a|b|c" >&2; return 2;; esac; node "$TCH/tests/e2e-dev/bin/mint.mjs" "$e" "$Q/cookie-$1.txt"; }',
    '# api <a|b|c> <METHOD> <path> [json]',
    'api() { curl -s -m 300 -A "$UA" -w \'\\nHTTP %{http_code}\\n\' -X "$2" -H "Cookie: tracy_sess=$(cat "$Q/cookie-$1.txt")" -H "Origin: $O" -H \'Content-Type: application/json\' ${4:+--data "$4"} "$O$3"; }',
    '# pq "<SELECT naming this run>" — read-only, on the dev Postgres',
    'pq() { node "$TCH/tests/e2e-dev/bin/dev.mjs" psql "$1"; }',
    '# dshgrep <text> <file> — count of lines holding <text> in a dsh profile file; dshfile <file>',
    'dshgrep() { node "$TCH/tests/e2e-dev/bin/dev.mjs" dsh-grep "$1" "$2"; }',
    'dshfile() { node "$TCH/tests/e2e-dev/bin/dev.mjs" dsh-file "$1"; }',
    '# em "<SELECT>" — the EmDash site of this case, read-only',
    'em() { node "$TCH/tests/e2e-dev/bin/dev.mjs" em "${LABEL_EM:-$LABEL}" "$1"; }',
    '# devps [label] — containers on the dev host',
    'devps() { node "$TCH/tests/e2e-dev/bin/dev.mjs" ps "$@"; }',
    ''
  ]
  return lines.join('\n')
}

/** Every file under `dir` (recursive). */
function filesUnder(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...filesUnder(p))
    else if (entry.isFile()) out.push(p)
  }
  return out
}

/**
 * After a case: delete every file in `$Q` that holds a session token (the cookies `mint` wrote,
 * and anything the case copied them into), then delete the case's sites through the doors.
 * @param {{ manifest: Manifest, q: string | null }} p
 */
export async function cleanupCase({ manifest, q }) {
  const removed = []
  if (q) {
    for (const file of filesUnder(q)) {
      if (statSync(file).size > 4 * 1024 * 1024) continue
      if ((file.split('/').at(-1) ?? '').startsWith('cookie-') || TOKEN.test(readFileSync(file, 'utf8'))) {
        rmSync(file, { force: true })
        removed.push(file)
      }
    }
  }
  const resources = await manifest.cleanup(CLEANERS, { kinds: ['site'] })
  return { removed, resources }
}
