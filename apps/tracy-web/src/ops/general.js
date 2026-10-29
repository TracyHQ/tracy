/**
 * `/api/ops/general` and `/api/ops/servers` — what this deployment is configured to be.
 *
 * WHY A SCREEN AT ALL. Every answer here already exists, in `deploy/.env` on some machine, and
 * that is the problem: the only way to ask "does this deployment send real mail / hold a GitHub
 * App / put new customer sites on prod1" was to ssh somewhere and read a file. Four of those
 * questions fail SILENTLY when the answer is wrong — `readGithub`, `readArtifactStore`,
 * `readDemoSsh` and the OAuth pair are all-or-nothing, so three keys out of four behaves exactly
 * like zero out of four, with nothing logged and no error anywhere (`.env.example` records the
 * measurement: eight keys under the old Worker names, and the sign-in buttons simply did not
 * appear). This surface makes that visible, which is its whole job.
 *
 * 🔒 LAYER A: IT READS. There is no write door here and no `system_setting` table behind it — the
 * values come from `config`, which `server.js` read from the environment ONCE at boot. Editing any
 * of them from a browser means a row, a validator with hard floors, and a reader that asks per
 * request; none of that exists yet, so every field this answers is labelled with where it lives
 * instead. A screen that offered an input for a value nothing would re-read is worse than a screen
 * that says "set this in `/etc/tracy/tracy-web.env`".
 *
 * 🔒 NO SECRET IS EVER ANSWERED — only whether one is set, and which keys of a block are absent.
 * Staff roles include `editor`; "can open /ops" must not become "can read every credential the
 * deployment holds".
 *
 * ⚠ IT SAYS NOTHING ABOUT MODELS ANY MORE. It carried a `model` block read from the environment,
 * and that became a SECOND, STALE answer the day `/api/ops/llm` started reading the provider book:
 * the General panel reported "not set · Off" beside a Model & AI screen showing a configured
 * provider (22/09). One screen owns models, and it is not this one.
 */
import { Hono } from 'hono'

import {
  CODE_TTL_MS,
  DESIGN_BRAND_LIMIT_PER_DAY,
  DESIGN_READ_LIMIT_PER_DAY,
  DESIGN_WORDS_LIMIT_PER_DAY,
  MAX_ATTEMPTS,
  SESSION_TTL_S,
  TEAM_MAX_EMAILS,
  TEAM_MAX_SITES,
  WRITE_LIMIT_PER_HOUR
} from '../lib/policy.js'
import { admit, denied } from './admit.js'

/**
 * An all-or-nothing credential block, reported by NAME of what is absent.
 *
 * ⚠ THE `missing` LIST IS THE POINT, not `ready`. `readGithub` and friends collapse a partial
 * configuration to `null`, so the app's own view of a three-out-of-four block is identical to an
 * empty one — and a person looking at the screen would conclude "nobody set this up" when in fact
 * somebody set up most of it and stopped. Naming the absent key turns a mystery into an errand.
 */
function block(id, label, keys, env, note = null) {
  const missing = keys.filter((k) => typeof env[k] !== 'string' || env[k] === '')
  return { id, label, ready: missing.length === 0, keys, missing, note }
}

/**
 * @param {object} deps
 * @param {Set<string>} deps.reservedLabels - `sites/label.js`'s own set, handed in by the
 *   composition root rather than imported: `ops/` may import only `lib/` and `db/`
 *   (`test/module-graph.test.mjs`), and that set cannot move to `lib/` because a parity test pins
 *   it byte-for-byte against the plugin's copy (`scripts/test/site-label-parity.test.mjs`).
 */
export function generalRoutes({ pool, config, reservedLabels, env = process.env }) {
  const app = new Hono()

  const guard = async (c) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return { deny: denied(c, who) }
    return { who }
  }

  app.get('/api/ops/general', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    return c.json({
      deployment: {
        origin: config.origin,
        siteDomain: config.siteDomain,
        siteDomainAliases: config.siteDomainAliases,
        siteAddressPrefix: config.siteAddressPrefix,
        sessionDomain: config.sessionDomain,
        guestSiteKey: config.guestSiteKey,
        hostOrg: config.hostOrg,
        badgeUrl: config.badgeUrl
      },
      signin: {
        mail: { kind: config.mail.kind, from: config.mail.from ?? null },
        // Per provider, because they are independent: a deployment may light up only one.
        oauth: { google: Boolean(config.oauth.google), github: Boolean(config.oauth.github) },
        // 🔒 An absent Turnstile secret FAILS CLOSED (`public/design-page.js`), and the only way
        // past it is the named flag — so the screen reports both, never one as a proxy for the
        // other. "No captcha configured" and "captcha deliberately off" are different states.
        turnstile: { configured: config.turnstileSecret !== null, disabled: config.turnstileDisabled },
        localLoginPreview: config.localLoginPreview
      },
      limits: {
        sessionTtlS: SESSION_TTL_S,
        otpTtlMs: CODE_TTL_MS,
        otpMaxAttempts: MAX_ATTEMPTS,
        writesPerHour: WRITE_LIMIT_PER_HOUR,
        designReadsPerDay: DESIGN_READ_LIMIT_PER_DAY,
        designWordsPerDay: DESIGN_WORDS_LIMIT_PER_DAY,
        designBrandPerDay: DESIGN_BRAND_LIMIT_PER_DAY,
        teamMaxEmails: TEAM_MAX_EMAILS,
        teamMaxSites: TEAM_MAX_SITES,
        writable: false,
        where: 'apps/tracy-web/src/lib/policy.js'
      },
      integrations: [
        block(
          'github-app',
          'Per-site GitHub repositories',
          ['GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_ORG', 'GITHUB_WEBHOOK_SECRET'],
          env,
          'Absent: a new site simply gets no repository (repoError: NOT_CONFIGURED).'
        ),
        block(
          'artifact-store',
          'Artifact store (site imports)',
          ['ARTIFACT_S3_ENDPOINT', 'ARTIFACT_S3_BUCKET', 'ARTIFACT_S3_ACCESS_KEY', 'ARTIFACT_S3_SECRET_KEY'],
          env,
          'Absent: import answers ARTIFACT_STORE_UNAVAILABLE.'
        ),
        block(
          'cloudflare',
          'DNS and tunnel',
          ['CLOUDFLARE_TOKEN', 'CLOUDFLARE_ACCOUNT', 'CLOUDFLARE_TUNNEL'],
          env,
          'Absent: go-live answers 501 NOT_CONFIGURED.'
        ),
        block(
          'releases',
          'Quickstart releases (joomlart-products)',
          ['TRACY_RELEASES_GITHUB_TOKEN'],
          env,
          'A developer stand reads releases with this; production mints a token from the App. A shard whose own App is not installed on joomlart-products reads with this token too.'
        )
      ],
      naming: {
        // Data that lives in code today (`sites/label.js`), which is exactly why it is worth
        // showing: adding a forbidden name is currently a commit and a deploy.
        reserved: [...reservedLabels].sort(),
        writable: false,
        where: 'apps/tracy-web/src/sites/label.js'
      },
      writable: false
    })
  })

  /**
   * `/api/ops/servers` — which machine does what.
   *
   * 🔒 THE ROLE THAT MATTERS IS `newSites`, AND TODAY IT IS THE ORDER OF A STRING. `config.js`
   * takes `defaultHost` from `HOSTS`'s FIRST name, and that one fact decides where every new
   * customer site is built (`sites/route.js`'s reserve and provision), where a new account's own
   * workspace is made (`workspace/route.js`), and which dsh serves the signed-out landing
   * (`public/route.js`). Nothing on any screen said so before this one.
   *
   * ⚠ NO SECRETS, NOT EVEN MASKED. A host row carries `hostSecret` and `seatSecret`; neither has
   * a reason to be on a roles table, so neither is read here at all.
   */
  app.get('/api/ops/servers', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')

    const rolesOf = (name) => {
      const roles = []
      if (name === config.defaultHost) roles.push('newSites', 'onboarding', 'landing')
      // EVERY demo host, not only the default one: since `DEMO_HOSTS` a demo is put on the machine
      // a person picked, so a table that marked one name would draw the other as a machine doing
      // nothing while it holds demos — the exact question this screen exists to answer.
      if (name === config.demoHost || (config.demoHosts ?? []).some((d) => d.name === name))
        roles.push('demo')
      return roles
    }

    const servers = [...config.hosts.entries()].map(([name, host]) => ({
      name,
      kind: 'host',
      origin: host.origin,
      dshOrigin: host.dshOrigin,
      roles: rolesOf(name),
      /** Whether THIS process runs beside it — a co-located site is reached over the host's own
       * docker network rather than its public address (`sites/resolver.js`). */
      colocated: name === config.hostName
    }))

    // A demo target this deployment only RECORDS addresses for — `roles: null`, deliberately not
    // `[]`: an empty list reads as "configured to do nothing", where the truth is that roles do
    // not apply, because Tracy never installs onto that machine (`config.js`'s own ⚠ on `record`).
    for (const target of config.demoTargets ?? []) {
      if (target.kind !== 'record') continue
      servers.push({
        name: target.name,
        kind: 'record',
        origin: `https://${target.zone}`,
        dshOrigin: null,
        roles: null,
        colocated: false,
        serverName: target.serverName,
        serverIp: target.serverIp,
        reachable: Boolean(target.ssh)
      })
    }

    return c.json({
      servers,
      /** What the table's columns MEAN, answered by the server so the screen cannot invent a role
       * the app does not actually have. */
      roleLabels: {
        newSites: 'New customer sites',
        demo: 'Public quickstart demos',
        onboarding: "A new account's own workspace",
        landing: 'Signed-out landing'
      },
      note: 'Changing a role would change where NEW sites are built; sites already running do not move.',
      writable: false
    })
  })

  return app
}
