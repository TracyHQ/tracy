// The scripted scenarios: flows this layer drives itself through the stand's real doors, judging
// each by state read independently (the seat book and site table in PostgreSQL, Docker labels, HTTP
// from outside) — never by a door's own success message alone.
//
// A scenario returns `{ assertions: [{ name, ok, observed, expected }] }`. It throws `EnvProblem`
// (with the probe that proves it) when a prerequisite is missing, and `TestInvalid` when its own
// positive control fails (a locator or fixture problem: PENDING, never FAIL). Anything else that
// is thrown after the prerequisites were good is a product FAIL with the earliest divergence.
//
// Oracles: apps/tracy-web/src/api-reference/routes/people.js (the pinned API reference: doors,
// codes and answers), docs/adr/0001 (seat book), docs/adr/0014 §3 (isolation), CONTEXT.md §6.

import { randomUUID } from 'node:crypto'
import { SCENARIOS } from './scenario-meta.mjs'
import {
  SinkUnreadable,
  accountId,
  call,
  freshClientIp,
  probeStand,
  psql,
  readCodeFromSink,
  seatRow,
  signIn,
  siteRowCount
} from './stand-client.mjs'
import { exec, sleep } from './util.mjs'

export class EnvProblem extends Error {
  constructor(message, probe) {
    super(message)
    this.name = 'EnvProblem'
    this.probe = probe
  }
}
export class TestInvalid extends Error {
  constructor(message) {
    super(message)
    this.name = 'TestInvalid'
  }
}

const CMS = {
  wordpress: { label: 'tchqa-w', design: 'ja-impact', budgetMs: 100_000 },
  joomla: { label: 'tchqa-j', design: 'ja-essence', budgetMs: 165_000 },
  emdash: { label: 'tchqa-e', design: 'tracy-business', budgetMs: 150_000 }
}
const READY_CAP_MS = 15 * 60_000

/**
 * Everything one run shares: who is signed in, which sites exist. Sites are created through the
 * product door, registered in the intent journal BEFORE the request, and deleted through the door
 * by `cleanup()`.
 */
export class Fixtures {
  /** @param {{ stand: any, intent: { site: (l: string, k: string) => void } | null, run?: typeof exec, tag?: string }} deps */
  constructor({ stand, intent, run = exec, tag = randomUUID().slice(0, 6) }) {
    this.stand = stand
    this.intent = intent
    this.run = run
    this.tag = tag
    /** @type {Map<string, Promise<{ cookie: string }>>} */
    this.people = new Map()
    /** @type {Map<string, Promise<{ siteKey: string, label: string, owner: string }>>} */
    this.sites = new Map()
    this.created = []
  }

  email(name) {
    return `qa-${this.tag}-${name}@example.test`
  }

  /** Sign a person in once (through the mail sink) and keep the cookie in memory. */
  person(name) {
    if (!this.people.has(name)) {
      this.people.set(
        name,
        signIn(this.stand, this.email(name), { run: this.run }).then((r) => ({
          cookie: r.cookie,
          email: this.email(name)
        }))
      )
    }
    return this.people.get(name)
  }

  /** Probe the release catalogue: the design a build asks for must exist for its platform. */
  async requireDesign(owner, platform, design) {
    const res = await call(this.stand, owner.cookie, 'GET', '/api/templates')
    const text = res.text ?? ''
    if (res.status !== 200 || !text.includes(design))
      throw new EnvProblem(
        `the release catalogue does not offer "${design}" for ${platform}`,
        `GET /api/templates → ${res.status}; "${design}" ${text.includes(design) ? 'present' : 'absent'} in ${text.length} bytes`
      )
  }

  /** Create a site through POST /api/sites and wait for its job; cached per label. */
  site(label, platform = 'wordpress', ownerName = `owner-${label}`) {
    if (!this.sites.has(label)) {
      this.sites.set(
        label,
        (async () => {
          const owner = await this.person(ownerName)
          const design = Object.values(CMS).find((c) => c.label === label)?.design ?? CMS[platform].design
          await this.requireDesign(owner, platform, design)
          const siteKey = `${label}.${this.stand.siteDomain}`
          this.intent?.site(label, siteKey)
          this.created.push({ label, siteKey, ownerName })
          const res = await call(this.stand, owner.cookie, 'POST', '/api/sites', {
            label,
            platform,
            design,
            buildId: randomUUID()
          })
          if (res.status !== 202 || typeof res.json?.jobId !== 'string')
            throw new Error(
              `POST /api/sites ${platform} ${label} answered ${res.status} ${res.json?.code ?? res.text.slice(0, 160)}`
            )
          const job = await waitForJob(this.stand, owner.cookie, siteKey, res.json.jobId, READY_CAP_MS)
          if (job.state !== 'done')
            throw new Error(`the build job of ${label} ended ${job.state}: ${job.reason ?? ''}`)
          return { siteKey, label, owner: ownerName, buildMs: job.ms }
        })()
      )
    }
    return this.sites.get(label)
  }

  /** Delete every site this run created, through the product door; never throws. */
  async cleanup() {
    const problems = []
    for (const s of this.created) {
      try {
        const owner = await this.person(s.ownerName)
        const res = await call(
          this.stand,
          owner.cookie,
          'DELETE',
          `/api/sites/${encodeURIComponent(s.siteKey)}`
        )
        if (![200, 404].includes(res.status)) problems.push(`${s.label}: DELETE answered ${res.status}`)
      } catch (error) {
        problems.push(`${s.label}: ${error.message}`)
      }
    }
    return problems
  }
}

export async function waitForJob(stand, cookie, siteKey, jobId, capMs) {
  const started = Date.now()
  for (;;) {
    const res = await call(stand, cookie, 'GET', `/api/sites/${encodeURIComponent(siteKey)}/jobs/${jobId}`)
    const state = res.json?.state
    if (state === 'done' || state === 'failed')
      return { state, ms: Date.now() - started, reason: res.json?.error ?? res.json?.reason ?? null }
    if ((res.status === 403 || res.status === 404) && Date.now() - started > 60_000)
      return { state: `unreadable-${res.status}`, ms: Date.now() - started, reason: res.text.slice(0, 200) }
    if (Date.now() - started > capMs)
      return { state: 'timeout', ms: Date.now() - started, reason: `no end after ${capMs} ms` }
    await sleep(3000)
  }
}

const a = (name, ok, observed, expected) => ({ name, ok: Boolean(ok), observed, expected })
const must = (cond, what) => {
  if (!cond) throw new TestInvalid(`control failed: ${what}`)
}

/** `qa-…@example.test` address for a name in this run. */
const newName = (fx, hint) => `${hint}-${randomUUID().slice(0, 5)}`

// ── sign-in ─────────────────────────────────────────────────────────────────────────────────────

async function startLogin(fx, email) {
  const t0 = Date.now()
  const login = await call(
    fx.stand,
    null,
    'POST',
    '/login',
    { email },
    { headers: { 'cf-connecting-ip': freshClientIp() } }
  )
  const code =
    login.status === 200 ? await readCodeFromSink(fx.stand, email, { sinceMs: t0, run: fx.run }) : null
  return { login, code }
}

const SIGNIN = {
  async 'signin-happy'(fx) {
    const email = fx.email(newName(fx, 'happy'))
    const { login, code } = await startLogin(fx, email)
    const verify = code ? await call(fx.stand, null, 'POST', '/verify', { email, code }) : null
    const me = verify?.session ? await call(fx.stand, verify.session, 'GET', '/auth/me') : null
    return [
      a(
        'otp-in-sink',
        /^\d{6}$/.test(code ?? ''),
        code
          ? 'six digits found in the sink'
          : `POST /login answered ${login.status}; no code line in the sink`,
        'POST /login 200 and a six-digit code mailed to the address'
      ),
      a(
        'verify-sets-session',
        verify?.status === 200 && verify.json?.ok === true && verify.session !== null,
        `HTTP ${verify?.status}, session ${verify?.session ? 'set' : 'none'}`,
        '200 {ok:true} and a tracy_sess cookie'
      ),
      a('me-names-the-account', me?.json?.email === email, `email ${me?.json?.email ?? null}`, email)
    ]
  },

  async 'signin-wrong-code'(fx) {
    const email = fx.email(newName(fx, 'wrong'))
    const { login, code } = await startLogin(fx, email)
    must(login.status === 200 && code, 'a real code was mailed')
    const wrong = code === '000000' ? '000001' : '000000'
    const verify = await call(fx.stand, null, 'POST', '/verify', { email, code: wrong })
    const me = await call(fx.stand, verify.session, 'GET', '/auth/me')
    return [
      a(
        'wrong-code-sets-no-session',
        verify.session === null,
        verify.session ? 'a session cookie was set' : 'no cookie',
        'no tracy_sess cookie'
      ),
      a(
        'wrong-code-not-2xx',
        verify.status === 401 && verify.json?.code === 'CODE_INVALID',
        `HTTP ${verify.status} ${verify.json?.code ?? ''}`,
        '401 CODE_INVALID'
      ),
      a('me-still-anonymous', (me.json?.email ?? null) === null, `email ${me.json?.email ?? null}`, 'null')
    ]
  },

  async 'signin-replay'(fx) {
    const email = fx.email(newName(fx, 'replay'))
    const { login, code } = await startLogin(fx, email)
    must(login.status === 200 && code, 'a real code was mailed')
    const first = await call(fx.stand, null, 'POST', '/verify', { email, code })
    must(first.session, 'the first verify of the real code signs in')
    const again = await call(fx.stand, null, 'POST', '/verify', { email, code })
    return [
      a(
        'used-code-refused',
        again.status === 401 && again.json?.code === 'CODE_INVALID',
        `HTTP ${again.status} ${again.json?.code ?? ''}`,
        '401 CODE_INVALID (the code is burned)'
      ),
      a(
        'replay-sets-no-session',
        again.session === null,
        again.session ? 'a session cookie was set' : 'no cookie',
        'no tracy_sess cookie'
      )
    ]
  },

  async 'signin-new-returning'(fx) {
    const email = fx.email(newName(fx, 'nr'))
    const before = await accountId(fx.stand, email, { run: fx.run })
    must(before === null, 'the address is new')
    const first = await signIn(fx.stand, email, { run: fx.run })
    const id1 = await accountId(fx.stand, email, { run: fx.run })
    const count = Number(
      (
        await psql(
          fx.stand,
          "select count(*) from account where lower(email) = lower(:'e')",
          { e: email },
          { run: fx.run }
        )
      )[0][0]
    )
    const second = await signIn(fx.stand, email, { run: fx.run })
    const id2 = await accountId(fx.stand, email, { run: fx.run })
    must(first.cookie && second.cookie, 'both sign-ins gave a session')
    return [
      a(
        'new-address-gets-one-account',
        id1 !== null && count === 1,
        `${count} account row(s)`,
        'exactly one account row after the first sign-in'
      ),
      a(
        'returning-sign-in-same-account',
        id1 !== null && id1 === id2,
        `${id1} then ${id2}`,
        'the same account id both times'
      )
    ]
  }
}

// ── team ────────────────────────────────────────────────────────────────────────────────────────

const enc = encodeURIComponent
async function invite(fx, ownerCookie, role, email, siteKey) {
  return call(fx.stand, ownerCookie, 'POST', '/api/team/invite', {
    role,
    emails: [email],
    siteKeys: [siteKey]
  })
}
/** The invited person signs in, then the owner invites them; returns what the next steps need. */
async function invited(fx, site, name, role = 'editor') {
  const owner = await fx.person(site.owner)
  const person = await fx.person(name)
  const res = await invite(fx, owner.cookie, role, person.email, site.siteKey)
  must(res.status === 200, `invite answered ${res.status} ${res.text.slice(0, 120)}`)
  const id = await accountId(fx.stand, person.email, { run: fx.run })
  must(id, 'the invited person has an account')
  return { owner, person, id, inviteRes: res }
}
const seat = (fx, site, id) => seatRow(fx.stand, site.siteKey, id, { run: fx.run })
const stateDoor = (fx, who, site) =>
  call(fx.stand, who.cookie, 'GET', `/api/sites/${enc(site.siteKey)}/state`)

const TEAM = {
  async 'team-invite-accept'(fx) {
    const site = await fx.site('tchqa-sw')
    const owner = await fx.person(site.owner)
    const name = newName(fx, 'inv')
    const person = await fx.person(name)
    const id = await accountId(fx.stand, person.email, { run: fx.run })
    must(id, 'the invitee has an account')
    const none = await seat(fx, site, id)
    const res = await invite(fx, owner.cookie, 'editor', person.email, site.siteKey)
    must(res.status === 200, `invite answered ${res.status}`)
    const pending = await seat(fx, site, id)
    const acc = await call(fx.stand, person.cookie, 'POST', `/api/sites/${enc(site.siteKey)}/accept`)
    const after = await seat(fx, site, id)
    return [
      a(
        'no-seat-before-accept',
        none === null && pending !== null && pending.accepted === false,
        `before invite ${JSON.stringify(none)}, after invite ${JSON.stringify(pending)}`,
        'no row before the invite; an unaccepted row after it'
      ),
      a(
        'invite-accepted-by-door',
        acc.status === 200 && acc.json?.accepted === true,
        `HTTP ${acc.status} ${acc.text.slice(0, 80)}`,
        '200 {accepted:true}'
      ),
      a(
        'seat-row-after-accept',
        after?.accepted === true && after.revoked === false && after.declined === false,
        JSON.stringify(after),
        'accepted, not revoked, not declined'
      ),
      a('seat-role-is-invited-role', after?.role === 'editor', after?.role ?? 'no row', 'editor')
    ]
  },

  async 'team-invite-decline'(fx) {
    const site = await fx.site('tchqa-sw')
    const { person, id } = await invited(fx, site, newName(fx, 'dec'))
    const control = await stateDoor(fx, person, site)
    const dec = await call(fx.stand, person.cookie, 'POST', `/api/sites/${enc(site.siteKey)}/decline`)
    const row = await seat(fx, site, id)
    const after = await stateDoor(fx, person, site)
    must(dec.status === 200, `decline answered ${dec.status}`)
    return [
      a(
        'decline-leaves-no-seat',
        row?.declined === true && row.accepted === false,
        JSON.stringify(row),
        'declined, never accepted'
      ),
      a(
        'declined-cannot-read-site',
        after.status === 403,
        `state door HTTP ${after.status} (before: ${control.status})`,
        '403 SEAT_NOT_AUTHORIZED'
      )
    ]
  },

  async 'team-revoke'(fx) {
    const site = await fx.site('tchqa-sw')
    const { owner, person, id } = await invited(fx, site, newName(fx, 'rev'))
    const acc = await call(fx.stand, person.cookie, 'POST', `/api/sites/${enc(site.siteKey)}/accept`)
    must(acc.status === 200, 'the invitee accepted')
    const control = await stateDoor(fx, person, site)
    must(control.status === 200, `the accepted seat reads the state door (HTTP ${control.status})`)
    const del = await call(fx.stand, owner.cookie, 'DELETE', `/api/sites/${enc(site.siteKey)}/seats/${id}`, {
      kind: 'revoke'
    })
    const row = await seat(fx, site, id)
    const after = await stateDoor(fx, person, site)
    must(del.status === 200, `revoke answered ${del.status} ${del.text.slice(0, 100)}`)
    return [
      a(
        'seat-row-gone-after-revoke',
        row?.revoked === true,
        JSON.stringify(row),
        'revoked_at set on the row'
      ),
      a('revoked-door-refuses', after.status === 403, `state door HTTP ${after.status}`, '403')
    ]
  },

  async 'team-viewer-cannot-invite'(fx) {
    const site = await fx.site('tchqa-sw')
    const { person: viewer } = await (async () => {
      const r = await invited(fx, site, newName(fx, 'vw'), 'viewer')
      const acc = await call(fx.stand, r.person.cookie, 'POST', `/api/sites/${enc(site.siteKey)}/accept`)
      must(acc.status === 200, 'the viewer accepted')
      return r
    })()
    const owner = await fx.person(site.owner)
    const control = await invite(fx, owner.cookie, 'editor', fx.email(newName(fx, 'target')), site.siteKey)
    const target = fx.email(newName(fx, 'target2'))
    const res = await invite(fx, viewer.cookie, 'editor', target, site.siteKey)
    const out = res.json?.results?.[0]?.sites?.[0]
    const rows = Number(
      (
        await psql(
          fx.stand,
          "select count(*) from seat s join account a on a.id = s.account_id where s.site_key = :'k' and lower(a.email) = lower(:'e')",
          { k: site.siteKey, e: target },
          { run: fx.run }
        )
      )[0][0]
    )
    must(control.status === 200, `an owner may invite an editor (control, HTTP ${control.status})`)
    return [
      a(
        'viewer-invite-refused',
        out?.outcome === 'refused' && out?.code === 'NOT_SITE_EDITOR',
        `outcome ${out?.outcome} ${out?.code ?? ''} (HTTP ${res.status})`,
        'refused NOT_SITE_EDITOR'
      ),
      a('no-grant-row-from-viewer', rows === 0, `${rows} seat row(s) for the address a viewer invited`, '0')
    ]
  },

  async 'team-invalid-role'(fx) {
    const site = await fx.site('tchqa-sw')
    const owner = await fx.person(site.owner)
    const email = fx.email(newName(fx, 'badrole'))
    const control = await invite(fx, owner.cookie, 'editor', fx.email(newName(fx, 'ok')), site.siteKey)
    must(control.status === 200, `a valid invite is accepted (control, HTTP ${control.status})`)
    const res = await invite(fx, owner.cookie, 'superuser', email, site.siteKey)
    const rows = Number(
      (
        await psql(
          fx.stand,
          "select count(*) from seat s join account a on a.id = s.account_id where s.site_key = :'k' and lower(a.email) = lower(:'e')",
          { k: site.siteKey, e: email },
          { run: fx.run }
        )
      )[0][0]
    )
    return [
      a(
        'unknown-role-is-400',
        res.status === 400 && res.json?.code === 'INVALID_REQUEST',
        `HTTP ${res.status} ${res.json?.code ?? ''}`,
        '400 INVALID_REQUEST'
      ),
      a('no-grant-row-for-unknown-role', rows === 0, `${rows} row(s)`, '0')
    ]
  },

  async 'team-accept-twice'(fx) {
    const site = await fx.site('tchqa-sw')
    const { person, id } = await invited(fx, site, newName(fx, 'twice'))
    const first = await call(fx.stand, person.cookie, 'POST', `/api/sites/${enc(site.siteKey)}/accept`)
    must(first.status === 200, 'the first accept works')
    const stamp = () =>
      psql(
        fx.stand,
        "select accepted_at::text, role from seat where site_key = :'k' and account_id = :'a'",
        { k: site.siteKey, a: id },
        { run: fx.run }
      )
    const before = (await stamp())[0]
    const second = await call(fx.stand, person.cookie, 'POST', `/api/sites/${enc(site.siteKey)}/accept`)
    const rows = await stamp()
    return [
      a(
        'one-seat-row-after-two-accepts',
        second.status === 200 && rows.length === 1 && rows[0][0] === before[0] && rows[0][1] === before[1],
        `second accept HTTP ${second.status}; rows ${JSON.stringify(rows)} vs ${JSON.stringify(before)}`,
        'one row, accepted_at and role unchanged'
      )
    ]
  },

  async 'team-role-change'(fx) {
    const site = await fx.site('tchqa-sw')
    const { owner, person, id } = await invited(fx, site, newName(fx, 'role'), 'viewer')
    const acc = await call(fx.stand, person.cookie, 'POST', `/api/sites/${enc(site.siteKey)}/accept`)
    must(acc.status === 200, 'the invitee accepted')
    const asViewer = await invite(fx, person.cookie, 'editor', fx.email(newName(fx, 'g1')), site.siteKey)
    must(
      asViewer.json?.results?.[0]?.sites?.[0]?.outcome === 'refused',
      'as a viewer the person may not invite (control)'
    )
    const patch = await call(fx.stand, owner.cookie, 'PATCH', `/api/sites/${enc(site.siteKey)}/seats/${id}`, {
      role: 'editor'
    })
    const row = await seat(fx, site, id)
    const asEditor = await invite(fx, person.cookie, 'editor', fx.email(newName(fx, 'g2')), site.siteKey)
    const out = asEditor.json?.results?.[0]?.sites?.[0]
    must(patch.status === 200, `the role change answered ${patch.status} ${patch.text.slice(0, 100)}`)
    return [
      a('role-changed-in-seat-book', row?.role === 'editor', row?.role ?? 'no row', 'editor'),
      a(
        'new-role-limits-what-the-seat-may-grant',
        out?.outcome !== 'refused' && asEditor.status === 200,
        `as editor: outcome ${out?.outcome} ${out?.code ?? ''}`,
        'an editor may invite (not refused)'
      )
    ]
  },

  async 'team-removed-loses-site'(fx) {
    const site = await fx.site('tchqa-sw')
    const { owner, person, id } = await invited(fx, site, newName(fx, 'gone'))
    const acc = await call(fx.stand, person.cookie, 'POST', `/api/sites/${enc(site.siteKey)}/accept`)
    must(acc.status === 200, 'the invitee accepted')
    const before = await stateDoor(fx, person, site)
    must(before.status === 200, `the seat reads the state door before removal (HTTP ${before.status})`)
    const del = await call(fx.stand, owner.cookie, 'DELETE', `/api/sites/${enc(site.siteKey)}/seats/${id}`, {
      kind: 'revoke'
    })
    must(del.status === 200, `removal answered ${del.status}`)
    const after = await stateDoor(fx, person, site)
    return [
      a(
        'removed-seat-refused-at-state-door',
        after.status === 403,
        `HTTP ${after.status} (before: ${before.status})`,
        '403 once the seat is removed'
      )
    ]
  }
}

// ── add / delete a site, isolation ──────────────────────────────────────────────────────────────

async function homeFromOutside(fx, siteKey) {
  const port = new URL(fx.stand.origin).port
  try {
    const res = await fetch(`http://${siteKey}:${port}/`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000)
    })
    return { status: res.status }
  } catch (error) {
    return { status: 0, error: error.cause?.code ?? error.message }
  }
}

function addSite(platform) {
  return async (fx) => {
    const cfg = CMS[platform]
    const owner = await fx.person(`own-${platform}`)
    await fx.requireDesign(owner, platform, cfg.design)
    const t0 = Date.now()
    const site = await fx.site(cfg.label, platform, `own-${platform}`)
    const row = await siteRowCount(fx.stand, site.siteKey, { run: fx.run })
    let home = await homeFromOutside(fx, site.siteKey)
    for (let i = 0; i < 10 && home.status !== 200; i++) {
      await sleep(3000)
      home = await homeFromOutside(fx, site.siteKey)
    }
    return [
      a(
        'job-reaches-done',
        true,
        `done after ${Date.now() - t0} ms (budget ${cfg.budgetMs} ms is a timing note, not this assertion)`,
        'job state done'
      ),
      a('site-row-exists', row === 1, `${row} row(s) in site`, '1'),
      a(
        'home-answers-from-outside',
        home.status === 200,
        `GET http://${site.siteKey}:${new URL(fx.stand.origin).port}/ → ${home.status || home.error}`,
        '200'
      )
    ]
  }
}

const SITES = {
  'add-site-wordpress': addSite('wordpress'),
  'add-site-joomla': addSite('joomla'),
  'add-site-emdash': addSite('emdash'),

  async 'add-site-bad-label'(fx) {
    const owner = await fx.person('own-badlabel')
    const label = 'bad.label'
    const res = await call(fx.stand, owner.cookie, 'POST', '/api/sites', {
      label,
      platform: 'wordpress',
      buildId: randomUUID()
    })
    const rows = Number(
      (
        await psql(fx.stand, "select count(*) from site where label = :'l'", { l: label }, { run: fx.run })
      )[0][0]
    )
    return [
      a(
        'bad-label-refused',
        res.status >= 400 && res.status < 500,
        `HTTP ${res.status} ${res.json?.code ?? ''}`,
        'a 4xx refusal'
      ),
      a('no-site-row-for-bad-label', rows === 0, `${rows} row(s)`, '0')
    ]
  },

  async 'delete-site-gone'(fx) {
    const site = await fx.site('tchqa-sw2', 'wordpress', 'own-delete')
    const owner = await fx.person(site.owner)
    const before = {
      row: await siteRowCount(fx.stand, site.siteKey, { run: fx.run }),
      containers: await dockerNames(fx, [
        'ps',
        '-a',
        '--filter',
        `label=com.docker.compose.project=${site.label}`,
        '--format',
        '{{.Names}}'
      ]),
      home: await homeFromOutside(fx, site.siteKey)
    }
    must(
      before.row === 1 && before.containers.length > 0,
      `the site exists before delete (${before.row} row, ${before.containers.length} containers)`
    )
    const del = await call(fx.stand, owner.cookie, 'DELETE', `/api/sites/${enc(site.siteKey)}`)
    // The delete is an operation of the site: the door answers 200 (removed), 202 DELETE_PENDING
    // (the host is still tearing down) or 409 (TEARDOWN_FAILED, PUBLISH_BUSY). Which of them it was
    // is judged by the assertions below; anything else means the door never took the request.
    must([200, 202, 409].includes(del.status), `delete answered ${del.status} ${del.text.slice(0, 120)}`)
    // The host tears down in a job: wait until the containers are gone or the budget ends.
    let containers = before.containers
    for (let i = 0; i < 40 && containers.length; i++) {
      await sleep(3000)
      containers = await dockerNames(fx, [
        'ps',
        '-a',
        '--filter',
        `label=com.docker.compose.project=${site.label}`,
        '--format',
        '{{.Names}}'
      ])
    }
    const volumes = await dockerNames(fx, [
      'volume',
      'ls',
      '--filter',
      `label=com.docker.compose.project=${site.label}`,
      '--format',
      '{{.Name}}'
    ])
    // After a 202 the book is closed by the next look at the operation (the background sweep):
    // the row is given the same bounded wait the containers got.
    let row = await siteRowCount(fx.stand, site.siteKey, { run: fx.run })
    for (let i = 0; i < 20 && row; i++) {
      await sleep(3000)
      row = await siteRowCount(fx.stand, site.siteKey, { run: fx.run })
    }
    const home = await homeFromOutside(fx, site.siteKey)
    return [
      a('db-row-gone', row === 0, `${row} row(s) in site`, '0'),
      a(
        'outside-http-not-served',
        home.status !== 200,
        `GET home → ${home.status || home.error} (before: ${before.home.status})`,
        'anything but 200'
      ),
      a('no-containers-of-label', containers.length === 0, containers.join(', ') || 'none', 'none'),
      a('no-volumes-of-label', volumes.length === 0, volumes.join(', ') || 'none', 'none')
    ]
  },

  async 'two-seats-isolation'(fx) {
    const siteA = await fx.site('tchqa-sw', 'wordpress', 'own-sw')
    const siteB = await fx.site('tchqa-sw1', 'wordpress', 'own-sw1')
    const ownerA = await fx.person(siteA.owner)
    const ownerB = await fx.person(siteB.owner)
    const own = { a: await stateDoor(fx, ownerA, siteA), b: await stateDoor(fx, ownerB, siteB) }
    must(
      own.a.status === 200 && own.b.status === 200,
      `each owner reads their own site (A ${own.a.status}, B ${own.b.status})`
    )
    const refusals = async (who, target) => {
      const state = await stateDoor(fx, who, target)
      const del = await call(fx.stand, who.cookie, 'DELETE', `/api/sites/${enc(target.siteKey)}`)
      const inv = await invite(fx, who.cookie, 'editor', fx.email(newName(fx, 'x')), target.siteKey)
      const outcome = inv.json?.results?.[0]?.sites?.[0]
      return {
        state: state.status,
        del: del.status,
        invite: `${inv.status}/${outcome?.outcome}/${outcome?.code ?? ''}`,
        ok: state.status === 403 && del.status === 403 && outcome?.outcome === 'refused'
      }
    }
    const aOnB = await refusals(ownerA, siteB)
    const bOnA = await refusals(ownerB, siteA)
    const idA = await accountId(fx.stand, ownerA.email, { run: fx.run })
    const idB = await accountId(fx.stand, ownerB.email, { run: fx.run })
    const cross = Number(
      (
        await psql(
          fx.stand,
          "select count(*) from seat where (site_key = :'b' and account_id = :'ia') or (site_key = :'a' and account_id = :'ib')",
          { a: siteA.siteKey, b: siteB.siteKey, ia: idA, ib: idB },
          { run: fx.run }
        )
      )[0][0]
    )
    return [
      a('b-doors-refuse-seat-of-a', aOnB.ok, JSON.stringify(aOnB), 'state 403, delete 403, invite refused'),
      a('a-doors-refuse-seat-of-b', bOnA.ok, JSON.stringify(bOnA), 'state 403, delete 403, invite refused'),
      a('no-cross-rows-in-seat-book', cross === 0, `${cross} cross row(s)`, '0')
    ]
  }
}

async function dockerNames(fx, args) {
  const res = await fx.run('docker', args, { timeoutMs: 30_000 })
  if (res.code !== 0)
    throw new EnvProblem(
      'Docker could not be queried',
      `docker ${args[0]}: ${(res.stderr || res.error || '').slice(0, 160)}`
    )
  return res.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

export const IMPLEMENTATIONS = { ...SIGNIN, ...TEAM, ...SITES }

/** Every scenario the metadata lists has an implementation, and the other way round. */
export function checkImplementations() {
  const meta = Object.keys(SCENARIOS)
  return {
    missing: meta.filter((k) => !IMPLEMENTATIONS[k]),
    extra: Object.keys(IMPLEMENTATIONS).filter((k) => !SCENARIOS[k])
  }
}

/**
 * Run one scenario. The result is verdict-shaped but not final: the caller still needs a red proof.
 * @returns {Promise<{ outcome: 'PASS'|'FAIL'|'ENV'|'PENDING', reason: string, assertions: any[], probe?: string }>}
 */
export async function runScenario(name, fx) {
  const impl = IMPLEMENTATIONS[name]
  if (!impl) return { outcome: 'PENDING', reason: `no implementation for scenario ${name}`, assertions: [] }
  const probe = await probeStand(fx.stand)
  if (!probe.ok)
    return {
      outcome: 'ENV',
      reason: `the stand is not reachable: ${probe.detail}`,
      assertions: [],
      probe: probe.detail
    }
  try {
    const assertions = await impl(fx)
    const declared = SCENARIOS[name].assertions
    const got = assertions.map((x) => x.name)
    if (declared.join('|') !== got.join('|'))
      return {
        outcome: 'PENDING',
        reason: `TEST_INVALID: scenario ${name} reported ${got.join(',')} but declares ${declared.join(',')}`,
        assertions
      }
    const bad = assertions.filter((x) => !x.ok)
    return bad.length
      ? {
          outcome: 'FAIL',
          reason: `${name}: ${bad[0].name} — observed ${bad[0].observed}; expected ${bad[0].expected}`,
          assertions
        }
      : { outcome: 'PASS', reason: 'every assertion held', assertions }
  } catch (error) {
    if (error instanceof EnvProblem || error instanceof SinkUnreadable)
      return { outcome: 'ENV', reason: error.message, assertions: [], probe: error.probe }
    if (error instanceof TestInvalid)
      return { outcome: 'PENDING', reason: `TEST_INVALID: ${error.message}`, assertions: [] }
    return { outcome: 'FAIL', reason: `${name}: ${error.message}`, assertions: [] }
  }
}
