// Every fact about the environment the suite runs against lives here, and nowhere else.
// Moving the suite to a CI runner or another deployment means editing this file (or setting the
// E2E_DEV_* variables below), never a journey.
//
// Two deployments are known, chosen by `E2E_ENV` (`run.mjs --env` sets it for every journey):
// `dev` (develop, the default) and `staging` (docs/references/may-staging.md). What differs is in
// PROFILES; an E2E_DEV_* variable still overrides its field in either profile.

import { homedir } from 'node:os'
import { join } from 'node:path'

import { machineHost } from '../../../scripts/lib/machine-hosts.mjs'

const from = (name, fallback) => process.env[name] ?? fallback

/**
 * `sshKey` names the setting that holds the host's PRIVATE address (reached over the VPN, never a
 * public one): `E2E_DEV_SSH` overrides it, else scripts/lib/machine-hosts.mjs reads it.
 * `sitePrefix` is the server's `SITE_ADDRESS_PREFIX`: the API takes the label a person types and
 * builds `<prefix><label>`, so every address, site key and container name carries it.
 * `accounts`: `per-run` mints `e2e-<runId>-<role>@…` each run (tracy-web has no door that deletes
 * an account, so they pile up); `fixed` reuses `e2e-<profile>-<role>@…` on every run, and only the
 * sites, seats and invites a run makes are its own to clean.
 */
export const PROFILES = Object.freeze({
  dev: Object.freeze({
    origin: 'https://cowork.tracy.site',
    apiOrigin: 'https://api.tracy.site',
    sshKey: 'E2E_SSH_DEV',
    sitePrefix: '',
    results: 'e2e-dev',
    accounts: 'per-run'
  }),
  staging: Object.freeze({
    origin: 'https://cowork-staging.tracy.site',
    apiOrigin: 'https://api-staging.tracy.site',
    sshKey: 'E2E_SSH_STAGING',
    sitePrefix: 'stg-',
    results: 'e2e-staging',
    accounts: 'fixed'
  })
})

const name = process.env.E2E_ENV || 'dev'
if (!Object.hasOwn(PROFILES, name))
  throw new Error(`E2E_ENV=${name}: unknown environment (use ${Object.keys(PROFILES).join(' or ')})`)
const profile = PROFILES[name]

const origin = from('E2E_DEV_ORIGIN', profile.origin)
const siteDomain = from('E2E_DEV_SITE_DOMAIN', 'tracy.site')

export const ENV = Object.freeze({
  /** Which deployment this is: a key of PROFILES. */
  name,
  /** The workspace surface every journey talks to. */
  origin,
  /** The public API host (`/v1/*`, `/docs/`). */
  apiOrigin: from('E2E_DEV_API_ORIGIN', profile.apiOrigin),
  /** What the server puts before a typed label (`SITE_ADDRESS_PREFIX`). */
  sitePrefix: profile.sitePrefix,
  /** `per-run` or `fixed` (see PROFILES). */
  accounts: profile.accounts,
  /** Customer sites answer at `https://<label>.<siteDomain>`. */
  siteDomain,
  /** The session cookie and the domain it is written for (`SESSION_DOMAIN` on the server). */
  sessionCookie: 'tracy_sess',
  cookieDomain: `.${siteDomain}`,
  /** Cloudflare challenges bare scripted clients; every request carries a browser user agent. */
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 tracy-e2e-dev',
  /** The host of the stack, reached over ssh; every docker call there needs sudo. */
  ssh: Object.freeze({
    // Read on first use, so importing this file needs no host setting.
    get target() {
      return process.env.E2E_DEV_SSH ?? machineHost(profile.sshKey)
    },
    connectTimeoutS: 15
  }),
  containers: Object.freeze({
    web: 'tracy-tracy-web-1',
    host: 'tracy-tracy-host-1',
    postgres: 'tracy-postgres-1',
    dsh: 'tracy-dsh'
  }),
  db: Object.freeze({ user: 'tracy', name: 'tracy' }),
  /** Read-only health script of the stack (12 checks, touches nothing). */
  checkServer: '/opt/tracy-fleet/stack/check-server.sh',
  /** Where tracy-web keeps `mintSession` inside its own container. */
  webSessionModule: '/opt/tracy-web/src/lib/session.js',
  /** Plugin trees inside the dsh container whose versions go into the deploy manifest. */
  dshPlugins: Object.freeze({
    'dsh-better-sidebar': '/desk-home/profiles/native/node_modules/dsh-better-sidebar/package.json'
  }),
  /** Run output: one folder per run, never inside the repository. */
  resultsRoot: from('E2E_DEV_RESULTS', join(homedir(), 'TCH-local', profile.results)),
  /** Test accounts: never a real mailbox. */
  emailDomain: 'example.test',
  /**
   * What each CMS is built from in J2b. `design` is a template card id from `GET /api/templates`;
   * the door resolves it to that card's release for the platform.
   * Joomla is NOT ja-impact: its j6 quickstart 1.0.0 loads `jquery-noconflict.min.js` before
   * `jquery.min.js` and throws "jQuery is not defined" on every home page (measured 04/10/2026,
   * also on the public demo), which would fail J2b for a template defect, not a creation one.
   */
  builds: Object.freeze({
    wordpress: Object.freeze({ design: 'ja-impact' }),
    joomla: Object.freeze({ design: 'ja-essence' }),
    emdash: Object.freeze({ design: 'tracy-business' })
  }),
  /**
   * The verdict line: time from `POST /api/sites` to a `done` job, measured on dev in S0
   * (04/10/2026: WordPress 65 s, Joomla 109 s, EmDash 99 s with its image warm), times 1.5.
   * See tasks/todo-e2e-dev-tracy-site.md §Review, table "S0 measurements".
   */
  readyBudgetMs: Object.freeze({
    wordpress: 100_000,
    joomla: 165_000,
    emdash: 150_000
  }),
  /**
   * How long a job is still polled after its budget is spent. A slow build still FAILS on the
   * budget, but it is waited for, so its real time is measured and it is torn down as a finished
   * site rather than mid-provision. 15 min covers a cold EmDash image build (~10 min measured
   * on the local stand, 22/09).
   */
  readyCapMs: 15 * 60_000,
  /** How often a provision job is polled. */
  jobPollMs: 3_000
})

/** The short CMS letters of the `--cms` flag, and the platform names the API uses. */
export const CMS = Object.freeze({ w: 'wordpress', j: 'joomla', e: 'emdash' })

/**
 * The address label the server builds from a label a person typed: `<sitePrefix><typed>`.
 * @param {string} typed
 */
export function addressLabel(typed) {
  return `${ENV.sitePrefix}${typed}`
}

/** `https://<label>.<siteDomain>`, `label` being the ADDRESS label (prefix included). */
export function siteOrigin(label) {
  return `https://${label}.${ENV.siteDomain}`
}

/** The site key the API names a born site by; `label` is the ADDRESS label. */
export function siteKeyOf(label) {
  return `${label}.${ENV.siteDomain}`
}

/**
 * The account for one role: `e2e-<runId>-<role>@example.test`, or `e2e-<profile>-<role>@…` when
 * the profile's accounts are fixed.
 */
export function runEmail(runId, role) {
  return `e2e-${ENV.accounts === 'fixed' ? ENV.name : runId}-${role}@${ENV.emailDomain}`
}

/** A run's site label as typed: `e2e<runId><suffix>` (the label rule allows 6–30 of `[a-z0-9-]`). */
export function runLabel(runId, suffix) {
  return `e2e${runId}${suffix}`
}

/** Shape of a run id: short, lower-case, safe in a label, an email and a folder name. */
export const RUN_ID = /^[a-z0-9]{4,16}$/
