// Task 7: the GitHub half — a private repo per site, hourly installation tokens for the host, and
// the push police. Ported from `workers/seat-registry/src/github.js` (the App primitives) and
// `workers/seat-registry/src/index.js`'s `handleCreateRepo`/`handleFleetGitToken`/
// `handleGithubPushPolice` (the doors), narrowed to door 1 only — see the module comments on
// `src/github/app.js` and `src/github/route.js` for exactly what was dropped and why.
import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { generateKeyPairSync, createVerify } from 'node:crypto'
import { fileDb } from './_db.mjs'
import { readConfig } from '../src/config.js'
import { buildApp } from '../src/app.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { hmacHex } from '../src/lib/hmac.js'
import {
  TOKEN_PERMISSIONS,
  GitHubUnavailable,
  installationIdFor,
  mintTokenFor,
  createSiteRepo,
  deleteSiteRepo,
  ensureRepoWebhook,
  revokeAtGitHub,
  hostRepoMissing,
  ownsRepo
} from '../src/github/app.js'
import { createRepoFor, deleteRepoFor, mintGitToken, githubRoutes } from '../src/github/route.js'
import { repoFor, writeRepo, siteKeyOfRepo, mergeSanctioned } from '../src/github/store.js'
import { labelPrefix } from '../src/sites/label.js'
import { createWorkspace, grantWorkspace, declareSiteWorkspace } from '../src/workspaces/store.js'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

// One RSA keypair for the whole file — GitHub App keys are PKCS#1 ("BEGIN RSA PRIVATE KEY"), the
// shape `appJwt` (src/github/app.js) is built to sign directly, no PKCS#8 conversion needed.
const { privateKey: PRIVATE_KEY_OBJ, publicKey: PUBLIC_KEY } = generateKeyPairSync('rsa', {
  modulusLength: 2048
})
const PRIVATE_KEY_PEM = PRIVATE_KEY_OBJ.export({ type: 'pkcs1', format: 'pem' })

const GITHUB = Object.freeze({
  appId: '900123',
  privateKey: PRIVATE_KEY_PEM,
  org: 'TracyHQ',
  webhookSecret: 'whsec-test-only'
})

function decodeJwt(bearer) {
  const token = bearer.replace(/^Bearer /, '')
  const [h, p, s] = token.split('.')
  const pad = (b64) =>
    b64
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=')
  return {
    header: JSON.parse(Buffer.from(pad(h), 'base64').toString('utf8')),
    payload: JSON.parse(Buffer.from(pad(p), 'base64').toString('utf8')),
    signingInput: `${h}.${p}`,
    signature: Buffer.from(pad(s), 'base64')
  }
}

/** A fake GitHub API — same shapes `workers/seat-registry/test/seats.test.mjs` mocks, narrowed to
 * the single-App world this app carries (no host-vs-customer App split). */
function fakeGithub({ down = false } = {}) {
  const calls = []
  const installations = {} // 'org:TracyHQ' | 'TracyHQ/repo' -> installation id
  const mintCalls = []
  const reposCreated = []
  const reposDeleted = []
  const repoHooks = {}
  const repoDescriptions = {}
  const repoPermissions = {} // token -> {push, admin}
  const compares = {} // 'before...after' -> { files: [...] }
  const state = {
    repoNameTaken: false,
    mintRefusesHooks: false,
    orgRepositorySelection: 'all',
    deleteStatus: 204
  }
  let siteJson // undefined = repo has not declared .tracy/site.json

  const respond = (body, status = 200) =>
    new Response(body === null ? null : JSON.stringify(body), { status })

  const fetchImpl = async (input, init = {}) => {
    const method = init.method ?? 'GET'
    calls.push({ url: String(input), method, init })
    if (down) return respond({ message: 'down' }, 502)
    const path = new URL(String(input)).pathname

    const perRepoInstall = path.match(/^\/repos\/(.+)\/installation$/)
    if (perRepoInstall) {
      const id = installations[perRepoInstall[1]]
      return id ? respond({ id }) : respond({}, 404)
    }
    const orgInstall = path.match(/^\/orgs\/([^/]+)\/installation$/)
    if (orgInstall) {
      const id = installations[`org:${orgInstall[1]}`]
      return id ? respond({ id, repository_selection: state.orgRepositorySelection }) : respond({}, 404)
    }
    const orgRepos = path.match(/^\/orgs\/([^/]+)\/repos$/)
    if (orgRepos && method === 'POST') {
      const body = JSON.parse(init.body)
      reposCreated.push({ org: orgRepos[1], ...body })
      if (state.repoNameTaken) return respond({ message: 'name already exists' }, 422)
      const full = `${orgRepos[1]}/${body.name}`
      return respond({ full_name: full, clone_url: `https://github.com/${full}.git` }, 201)
    }
    const repoView = path.match(/^\/repos\/([^/]+\/[^/]+)$/)
    if (repoView && method === 'GET') {
      // A repo only "exists" in this mock once it has been registered in `repoDescriptions`
      // (even with an empty description) — otherwise a token that legitimately holds admin on
      // SOME repo would also read as admin on a repo that was never declared at all.
      if (!(repoView[1] in repoDescriptions)) return respond({}, 404)
      const token = (init.headers?.Authorization ?? '').replace('Bearer ', '')
      const perms = repoPermissions[token]
      const described = repoDescriptions[repoView[1]]
      if (!perms) return respond({ full_name: repoView[1], description: described })
      return respond({ full_name: repoView[1], description: described ?? null, permissions: perms })
    }
    if (repoView && method === 'DELETE') {
      reposDeleted.push({
        repo: repoView[1],
        token: (init.headers?.Authorization ?? '').replace('Bearer ', '')
      })
      return respond(state.deleteStatus === 204 ? null : { message: 'refused' }, state.deleteStatus)
    }
    const hooks = path.match(/^\/repos\/([^/]+\/[^/]+)\/hooks$/)
    if (hooks && method === 'GET') return respond(repoHooks[hooks[1]] ?? [])
    if (hooks && method === 'POST') {
      const body = JSON.parse(init.body)
      const row = { id: 4200 + (repoHooks[hooks[1]]?.length ?? 0), ...body }
      repoHooks[hooks[1]] = [...(repoHooks[hooks[1]] ?? []), row]
      return respond(row, 201)
    }
    const hookOne = path.match(/^\/repos\/([^/]+\/[^/]+)\/hooks\/(\d+)$/)
    if (hookOne && method === 'PATCH') {
      const body = JSON.parse(init.body)
      repoHooks[hookOne[1]] = (repoHooks[hookOne[1]] ?? []).map((h) =>
        String(h.id) === hookOne[2] ? { ...h, ...body } : h
      )
      return respond(repoHooks[hookOne[1]].find((h) => String(h.id) === hookOne[2]))
    }
    if (/^\/app\/installations\/\d+\/access_tokens$/.test(path) && method === 'POST') {
      const installationId = Number(path.split('/')[3])
      const body = JSON.parse(init.body)
      mintCalls.push({ installationId, ...body })
      if (state.mintRefusesHooks && body.permissions?.repository_hooks) {
        return respond({ message: 'permissions exceed those of the installation' }, 422)
      }
      return respond(
        { token: `tok-${mintCalls.length}`, expires_at: new Date(Date.now() + 3_600_000).toISOString() },
        201
      )
    }
    if (path === '/installation/token' && method === 'DELETE') return respond(null, 204)
    const compareView = path.match(/^\/repos\/([^/]+\/[^/]+)\/compare\/(.+)$/)
    if (compareView && method === 'GET') {
      const spec = compares[decodeURIComponent(compareView[2])]
      if (!spec) return respond({}, 404)
      return respond({ files: (spec.files ?? []).map((filename) => ({ filename })) })
    }
    const contentsView = path.match(/^\/repos\/([^/]+\/[^/]+)\/contents\/\.tracy\/site\.json/)
    if (contentsView && method === 'GET') {
      if (siteJson === undefined) return respond({}, 404)
      return respond({ content: Buffer.from(JSON.stringify(siteJson)).toString('base64') })
    }
    return respond({}, 404)
  }

  return {
    calls,
    fetchImpl,
    installations,
    mintCalls,
    reposCreated,
    reposDeleted,
    repoHooks,
    repoDescriptions,
    repoPermissions,
    compares,
    state,
    setSiteJson: (value) => {
      siteJson = value
    }
  }
}

// ── app.js: the GitHub API primitives ────────────────────────────────────────────────────────────

test('installationIdFor: installed → id; not installed → null; GitHub down → throws GitHubUnavailable', async () => {
  const gh = fakeGithub()
  gh.installations['TracyHQ/lantern'] = 555
  assert.equal(await installationIdFor(GITHUB, 'TracyHQ/lantern', gh.fetchImpl), 555)
  assert.equal(await installationIdFor(GITHUB, 'TracyHQ/nope', gh.fetchImpl), null)

  const down = fakeGithub({ down: true })
  await assert.rejects(() => installationIdFor(GITHUB, 'TracyHQ/lantern', down.fetchImpl), GitHubUnavailable)
})

test("installationIdFor signs with the App's own RS256 JWT, iss = appId, verifiable with the paired public key", async () => {
  const gh = fakeGithub()
  gh.installations['TracyHQ/lantern'] = 1
  await installationIdFor(GITHUB, 'TracyHQ/lantern', gh.fetchImpl)
  const auth = gh.calls[0].init.headers.Authorization
  const { header, payload, signingInput, signature } = decodeJwt(auth)
  assert.equal(header.alg, 'RS256')
  assert.equal(payload.iss, GITHUB.appId)
  assert.ok(payload.exp > payload.iat)
  const verifier = createVerify('RSA-SHA256')
  verifier.update(signingInput)
  verifier.end()
  assert.equal(verifier.verify(PUBLIC_KEY, signature), true)
  assert.equal(gh.calls[0].init.headers['User-Agent'], 'tracy-web')
})

test('mintTokenFor: mints scoped to exactly one repo and TOKEN_PERMISSIONS; 404/422 → null; down → throws', async () => {
  const gh = fakeGithub()
  const minted = await mintTokenFor(GITHUB, 42, 'lantern', gh.fetchImpl)
  assert.equal(minted.token, 'tok-1')
  assert.ok(minted.expiresAt)
  // What GitHub is asked for is the permanent ADR 0023 §2 limit, exactly: contents, pull requests, metadata.
  assert.deepEqual(gh.mintCalls[0], {
    installationId: 42,
    repositories: ['lantern'],
    permissions: { contents: 'write', pull_requests: 'write', metadata: 'read' }
  })

  const notFound = fakeGithub()
  notFound.state.orgRepositorySelection = 'all' // irrelevant here, just realistic
  const notFoundImpl = async () => new Response('{}', { status: 404 })
  assert.equal(await mintTokenFor(GITHUB, 999, 'gone', notFoundImpl), null)

  const down = fakeGithub({ down: true })
  await assert.rejects(() => mintTokenFor(GITHUB, 1, 'x', down.fetchImpl), GitHubUnavailable)
})

test('createSiteRepo: creates in the org with a CREATE-permissions-only token that is revoked right after', async () => {
  const gh = fakeGithub()
  gh.installations['org:TracyHQ'] = 77
  const made = await createSiteRepo(GITHUB, 'TracyHQ', 'lantern-abc', 'lantern.localhost', gh.fetchImpl)
  assert.deepEqual(made, {
    repo: 'TracyHQ/lantern-abc',
    cloneUrl: 'https://github.com/TracyHQ/lantern-abc.git'
  })
  assert.deepEqual(gh.reposCreated[0], {
    org: 'TracyHQ',
    name: 'lantern-abc',
    private: true,
    auto_init: true,
    description: 'Tracy workspace for lantern.localhost',
    has_issues: true,
    has_wiki: false,
    has_projects: false
  })
  // The token that created it carried ONLY administration:write, nothing wider.
  assert.deepEqual(gh.mintCalls[0], { installationId: 77, permissions: { administration: 'write' } })
  // And it was revoked in the very same run, not left to expire.
  assert.ok(gh.calls.some((c) => c.url.endsWith('/installation/token') && c.method === 'DELETE'))
})

test('createSiteRepo: a taken name is a plain null (REPO_NAME_TAKEN territory), not a throw', async () => {
  const gh = fakeGithub()
  gh.installations['org:TracyHQ'] = 77
  gh.state.repoNameTaken = true
  assert.equal(
    await createSiteRepo(GITHUB, 'TracyHQ', 'lantern-abc', 'lantern.localhost', gh.fetchImpl),
    null
  )
})

test('createSiteRepo: the App not installed on the org throws GitHubUnavailable', async () => {
  const gh = fakeGithub()
  await assert.rejects(
    () => createSiteRepo(GITHUB, 'TracyHQ', 'lantern-abc', 'lantern.localhost', gh.fetchImpl),
    GitHubUnavailable
  )
})

test('deleteSiteRepo: deletes with a token scoped to the one repo, CREATE permissions only, revoked right after', async () => {
  const gh = fakeGithub()
  gh.installations['TracyHQ/lantern'] = 77
  assert.equal(await deleteSiteRepo(GITHUB, 'TracyHQ/lantern', gh.fetchImpl), true)
  // administration:write and nothing else, on exactly this repo — never TOKEN_PERMISSIONS widened.
  assert.deepEqual(gh.mintCalls, [
    { installationId: 77, repositories: ['lantern'], permissions: { administration: 'write' } }
  ])
  assert.deepEqual(gh.reposDeleted, [{ repo: 'TracyHQ/lantern', token: 'tok-1' }])
  const revoke = gh.calls.findIndex((c) => c.url.endsWith('/installation/token') && c.method === 'DELETE')
  const del = gh.calls.findIndex((c) => c.url.endsWith('/repos/TracyHQ/lantern') && c.method === 'DELETE')
  assert.ok(del !== -1 && revoke > del, 'the token is revoked after the delete')
  assert.deepEqual(TOKEN_PERMISSIONS, { contents: 'write', pull_requests: 'write', metadata: 'read' })
})

test('deleteSiteRepo: only a 204 counts — a refusal or a 404 is false, and the token is still revoked', async () => {
  for (const status of [403, 404]) {
    const gh = fakeGithub()
    gh.installations['TracyHQ/lantern'] = 77
    gh.state.deleteStatus = status
    assert.equal(await deleteSiteRepo(GITHUB, 'TracyHQ/lantern', gh.fetchImpl), false)
    assert.ok(gh.calls.some((c) => c.url.endsWith('/installation/token') && c.method === 'DELETE'))
  }
})

test('deleteSiteRepo: a repo outside the App org, or one the App is not installed on, is never deleted', async () => {
  const gh = fakeGithub()
  gh.installations['customer/shop'] = 5
  assert.equal(await deleteSiteRepo(GITHUB, 'customer/shop', gh.fetchImpl), false)
  assert.equal(gh.calls.length, 0)

  assert.equal(await deleteSiteRepo(GITHUB, 'TracyHQ/not-installed', gh.fetchImpl), false)
  assert.equal(gh.mintCalls.length, 0)
  assert.equal(gh.reposDeleted.length, 0)

  const down = fakeGithub({ down: true })
  await assert.rejects(() => deleteSiteRepo(GITHUB, 'TracyHQ/lantern', down.fetchImpl), GitHubUnavailable)
})

test('deleteRepoFor: no repo → false and kept without a recorded creator, both without calling GitHub', async () => {
  const gh = fakeGithub()
  gh.installations['TracyHQ/lantern'] = 77
  const config = { github: GITHUB }
  assert.equal(await deleteRepoFor(config, { repo: null, repo_creator: null }, gh.fetchImpl), false)
  assert.equal(
    await deleteRepoFor(config, { repo: 'TracyHQ/lantern', repo_creator: null }, gh.fetchImpl),
    'kept'
  )
  assert.equal(
    await deleteRepoFor(config, { repo: 'customer/shop', repo_creator: 'owner@x.y' }, gh.fetchImpl),
    'kept'
  )
  assert.equal(gh.calls.length, 0)
})

test('deleteRepoFor: GitHub off, down or refusing is failed; a confirmed delete is true', async () => {
  const site = { repo: 'TracyHQ/lantern', repo_creator: 'owner@x.y' }
  assert.equal(await deleteRepoFor({ github: null }, site, fakeGithub().fetchImpl), 'failed')
  assert.equal(await deleteRepoFor({ github: GITHUB }, site, fakeGithub({ down: true }).fetchImpl), 'failed')

  const refusing = fakeGithub()
  refusing.installations['TracyHQ/lantern'] = 77
  refusing.state.deleteStatus = 403
  assert.equal(await deleteRepoFor({ github: GITHUB }, site, refusing.fetchImpl), 'failed')

  const gh = fakeGithub()
  gh.installations['TracyHQ/lantern'] = 77
  assert.equal(await deleteRepoFor({ github: GITHUB }, site, gh.fetchImpl), true)
})

test('ensureRepoWebhook: no secret / a malformed repo are refused before any GitHub call', async () => {
  const gh = fakeGithub()
  assert.deepEqual(await ensureRepoWebhook(GITHUB, 'TracyHQ/lantern', { url: 'https://x/y' }, gh.fetchImpl), {
    ok: false,
    reason: 'no_webhook_secret'
  })
  assert.deepEqual(
    await ensureRepoWebhook(GITHUB, 'not-a-repo', { url: 'https://x/y', secret: 's' }, gh.fetchImpl),
    { ok: false, reason: 'bad_repo' }
  )
  assert.equal(gh.calls.length, 0)
})

test('ensureRepoWebhook: App not installed on the repo → app_not_installed', async () => {
  const gh = fakeGithub()
  const result = await ensureRepoWebhook(
    GITHUB,
    'TracyHQ/lantern',
    { url: 'https://tracy.test/github/push', secret: 's' },
    gh.fetchImpl
  )
  assert.deepEqual(result, { ok: false, reason: 'app_not_installed' })
})

test('ensureRepoWebhook: creates a fresh hook, then a second call PATCHes the same one (idempotent by URL)', async () => {
  const gh = fakeGithub()
  gh.installations['TracyHQ/lantern'] = 9
  const url = 'https://tracy.test/github/push'

  const first = await ensureRepoWebhook(GITHUB, 'TracyHQ/lantern', { url, secret: 's-1' }, gh.fetchImpl)
  assert.deepEqual(first, { ok: true, created: true })
  assert.equal(gh.repoHooks['TracyHQ/lantern'].length, 1)
  assert.equal(gh.repoHooks['TracyHQ/lantern'][0].config.url, url)
  assert.equal(gh.repoHooks['TracyHQ/lantern'][0].events[0], 'push')

  const second = await ensureRepoWebhook(GITHUB, 'TracyHQ/lantern', { url, secret: 's-2' }, gh.fetchImpl)
  assert.deepEqual(second, { ok: true, created: false })
  assert.equal(gh.repoHooks['TracyHQ/lantern'].length, 1, 'a second call must PATCH, never add a second hook')
  assert.equal(gh.repoHooks['TracyHQ/lantern'][0].config.secret, 's-2')

  // The token used to mint/patch the hook was revoked, never left standing.
  const deletes = gh.calls.filter((c) => c.url.endsWith('/installation/token') && c.method === 'DELETE')
  assert.equal(deletes.length, 2)
})

test('ensureRepoWebhook: mint refused for lacking repository_hooks vs. the repo actually being gone', async () => {
  const gh = fakeGithub()
  gh.installations['TracyHQ/lantern'] = 9
  gh.installations['org:TracyHQ'] = 9
  gh.state.mintRefusesHooks = true

  const stillThere = await ensureRepoWebhook(
    GITHUB,
    'TracyHQ/lantern',
    { url: 'https://x/y', secret: 's' },
    gh.fetchImpl
  )
  assert.deepEqual(stillThere, { ok: false, reason: 'app_lacks_repository_hooks' })

  gh.installations['org:TracyHQ'] = 9
  delete gh.installations['TracyHQ/lantern']
  gh.installations['TracyHQ/still-registered-but-gone'] = undefined
  const gone = await ensureRepoWebhook(
    GITHUB,
    'TracyHQ/still-registered-but-gone',
    { url: 'https://x/y', secret: 's' },
    gh.fetchImpl
  )
  // installationIdFor now answers null for this repo (never registered in `installations`), so
  // the door reports app_not_installed rather than reaching the mint at all — proving the
  // repo_missing branch is reached ONLY through a 422 at mint time, not any 404 upstream of it.
  assert.deepEqual(gone, { ok: false, reason: 'app_not_installed' })
})

test('revokeAtGitHub: 204 or 401 both count as revoked; anything else does not', async () => {
  const ok204 = async () => new Response(null, { status: 204 })
  const ok401 = async () => new Response(null, { status: 401 })
  const refused = async () => new Response(null, { status: 403 })
  assert.equal(await revokeAtGitHub('t', ok204), true)
  assert.equal(await revokeAtGitHub('t', ok401), true)
  assert.equal(await revokeAtGitHub('t', refused), false)
})

test('hostRepoMissing: only certain when the org installation reaches every repo and the repo itself 404s', async () => {
  const gh = fakeGithub()
  assert.equal(await hostRepoMissing(null, 'TracyHQ/x', gh.fetchImpl), false, 'no config → false, never true')

  gh.installations['org:TracyHQ'] = 1
  gh.state.orgRepositorySelection = 'selected'
  assert.equal(
    await hostRepoMissing(GITHUB, 'TracyHQ/x', gh.fetchImpl),
    false,
    'not "all" → cannot be certain'
  )

  gh.state.orgRepositorySelection = 'all'
  assert.equal(await hostRepoMissing(GITHUB, 'TracyHQ/gone', gh.fetchImpl), true)

  gh.installations['TracyHQ/still-here'] = 2
  assert.equal(await hostRepoMissing(GITHUB, 'TracyHQ/still-here', gh.fetchImpl), false)
})

test('ownsRepo: admin true → true; a pusher-not-admin token → false; unknown repo → false, never thrown', async () => {
  const gh = fakeGithub()
  gh.repoPermissions['tok-admin'] = { push: true, admin: true }
  gh.repoPermissions['tok-push'] = { push: true, admin: false }
  gh.repoDescriptions['TracyHQ/lantern'] = 'Tracy workspace for lantern.localhost'

  assert.equal(await ownsRepo('tok-admin', 'TracyHQ/lantern', gh.fetchImpl), true)
  assert.equal(await ownsRepo('tok-push', 'TracyHQ/lantern', gh.fetchImpl), false)
  assert.equal(await ownsRepo('tok-admin', 'TracyHQ/nope', gh.fetchImpl), false)
})

// ── Security: the private key and any minted token must never leak ──────────────────────────────

test('security: GitHubUnavailable never carries the private key, a token, or any message at all', async () => {
  const down = fakeGithub({ down: true })
  try {
    await installationIdFor(GITHUB, 'TracyHQ/x', down.fetchImpl)
    assert.fail('expected a throw')
  } catch (error) {
    assert.ok(error instanceof GitHubUnavailable)
    assert.equal(error.message, '')
    assert.equal(JSON.stringify(error).includes(GITHUB.privateKey), false)
  }
})

test('security: github/app.js and github/route.js log nothing — no console.* call exists to leak a secret through', () => {
  for (const file of ['../src/github/app.js', '../src/github/route.js']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    assert.equal(/console\s*\./.test(source), false, `${file} must not log anything`)
  }
})

// ── github/store.js + createRepoFor: idempotent, and always answers rather than failing the job ──

test(
  'repoFor/writeRepo/siteKeyOfRepo/mergeSanctioned: each touches exactly its own narrow slice',
  opts,
  async () => {
    const { pool } = db
    await pool.query(
      "insert into site (site_key, label, host) values ('lantern.localhost', 'lantern', 'local')"
    )
    assert.equal(await repoFor(pool, 'lantern.localhost'), null)
    assert.equal(await siteKeyOfRepo(pool, 'TracyHQ/lantern'), null)
    assert.equal(await mergeSanctioned(pool, 'lantern.localhost', 'a'.repeat(40)), false)

    await writeRepo(pool, 'lantern.localhost', { repo: 'TracyHQ/lantern', repoCreator: 'owner@x.y' })
    assert.equal(await repoFor(pool, 'lantern.localhost'), 'TracyHQ/lantern')
    assert.equal(await siteKeyOfRepo(pool, 'TracyHQ/lantern'), 'lantern.localhost')
    const row = (await pool.query('select repo_creator from site where site_key = $1', ['lantern.localhost']))
      .rows[0]
    assert.equal(row.repo_creator, 'owner@x.y')

    await pool.query('insert into merge_ledger (site_key, sha) values ($1, $2)', [
      'lantern.localhost',
      'a'.repeat(40)
    ])
    assert.equal(await mergeSanctioned(pool, 'lantern.localhost', 'a'.repeat(40)), true)
    assert.equal(await mergeSanctioned(pool, 'lantern.localhost', 'b'.repeat(40)), false)
  }
)

const CONFIG = readConfig({
  TRACY_ORIGIN: 'https://tracy.test',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'host-secret-local',
  SEAT_local_SECRET: 'k',
  GITHUB_APP_ID: GITHUB.appId,
  GITHUB_APP_PRIVATE_KEY: GITHUB.privateKey,
  GITHUB_ORG: GITHUB.org,
  GITHUB_WEBHOOK_SECRET: GITHUB.webhookSecret
})
const CONFIG_OFF = readConfig({
  TRACY_ORIGIN: 'https://tracy.test',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'host-secret-local',
  SEAT_local_SECRET: 'k'
})

test('mintGitToken: null when GitHub is off or not installed on the repo; a fresh token otherwise', async () => {
  const gh = fakeGithub()
  assert.equal(await mintGitToken(CONFIG_OFF, 'TracyHQ/lantern', gh.fetchImpl), null)
  assert.equal(await mintGitToken(CONFIG, 'TracyHQ/lantern', gh.fetchImpl), null, 'not installed here yet')
  gh.installations['TracyHQ/lantern'] = 1
  const minted = await mintGitToken(CONFIG, 'TracyHQ/lantern', gh.fetchImpl)
  assert.equal(minted.token, 'tok-1')
  assert.ok(minted.expiresAt)
})

test('createRepoFor: GitHub not configured → NOT_CONFIGURED, and GitHub is never called', opts, async () => {
  const { pool } = db
  await pool.query(
    "insert into site (site_key, label, host) values ('lantern.localhost', 'lantern', 'local')"
  )
  const gh = fakeGithub()
  const result = await createRepoFor(
    pool,
    CONFIG_OFF,
    { siteKey: 'lantern.localhost', label: 'lantern', email: 'owner@x.y' },
    gh.fetchImpl
  )
  assert.deepEqual(result, { code: 'NOT_CONFIGURED' })
  assert.equal(gh.calls.length, 0)
  assert.equal(await repoFor(pool, 'lantern.localhost'), null)
})

test(
  'createRepoFor: creates the repo, wires the push-police webhook, and persists repo + repo_creator',
  opts,
  async () => {
    const { pool } = db
    await pool.query(
      "insert into site (site_key, label, host) values ('lantern.localhost', 'lantern', 'local')"
    )
    const gh = fakeGithub()
    gh.installations['org:TracyHQ'] = 1
    gh.installations['TracyHQ/lantern'] = 1

    const result = await createRepoFor(
      pool,
      CONFIG,
      { siteKey: 'lantern.localhost', label: 'lantern', email: 'owner@x.y' },
      gh.fetchImpl
    )
    assert.equal(result.repo, 'TracyHQ/lantern')
    assert.equal(result.cloneUrl, 'https://github.com/TracyHQ/lantern.git')
    assert.equal(result.webhook, true)
    assert.equal(gh.repoHooks['TracyHQ/lantern'][0].config.url, 'https://tracy.test/github/push')

    assert.equal(await repoFor(pool, 'lantern.localhost'), 'TracyHQ/lantern')
    const row = (await pool.query('select repo_creator from site where site_key = $1', ['lantern.localhost']))
      .rows[0]
    assert.equal(row.repo_creator, 'owner@x.y')

    // Idempotent on the REPO, repairing on the WEBHOOK: a second call for the same site never
    // asks GitHub to create the repo again (no second /orgs/TracyHQ/repos POST), but it DOES
    // re-ensure the webhook — that repeat call is the self-repair path a failed attach would
    // otherwise never get (see the Important finding in task-7-review.md).
    const reposCreatedBefore = gh.reposCreated.length
    const hooksBefore = gh.repoHooks['TracyHQ/lantern'].length
    const again = await createRepoFor(
      pool,
      CONFIG,
      { siteKey: 'lantern.localhost', label: 'lantern', email: 'owner@x.y' },
      gh.fetchImpl
    )
    assert.deepEqual(again, {
      repo: 'TracyHQ/lantern',
      cloneUrl: 'https://github.com/TracyHQ/lantern.git',
      webhook: true
    })
    assert.equal(gh.reposCreated.length, reposCreatedBefore, 'must never create the repo twice')
    // Idempotent by URL (ensureRepoWebhook's own contract): a second wire PATCHes the same
    // hook, it does not add a second one.
    assert.equal(gh.repoHooks['TracyHQ/lantern'].length, hooksBefore)
  }
)

test(
  'createRepoFor: a webhook that fails to attach the first time is retried — and attached — on the next call',
  opts,
  async () => {
    const { pool } = db
    await pool.query(
      "insert into site (site_key, label, host) values ('lantern.localhost', 'lantern', 'local')"
    )
    const gh = fakeGithub()
    gh.installations['org:TracyHQ'] = 1
    // The App's installation has NOT yet reached this brand-new repo — a realistic timing gap
    // right after `createSiteRepo` — so the first webhook attach fails.

    const first = await createRepoFor(
      pool,
      CONFIG,
      { siteKey: 'lantern.localhost', label: 'lantern', email: 'owner@x.y' },
      gh.fetchImpl
    )
    assert.equal(first.repo, 'TracyHQ/lantern')
    assert.equal(first.webhook, false)
    assert.equal(first.webhookReason, 'app_not_installed')
    assert.equal(gh.repoHooks['TracyHQ/lantern'], undefined, 'no hook was ever attached')

    // The installation shows up moments later, as it does in real GitHub.
    gh.installations['TracyHQ/lantern'] = 1
    const second = await createRepoFor(
      pool,
      CONFIG,
      { siteKey: 'lantern.localhost', label: 'lantern', email: 'owner@x.y' },
      gh.fetchImpl
    )
    assert.equal(second.repo, 'TracyHQ/lantern')
    assert.equal(second.webhook, true, 'the webhook must repair itself on the next call')
    assert.equal(gh.repoHooks['TracyHQ/lantern'].length, 1)
    assert.equal(gh.repoHooks['TracyHQ/lantern'][0].config.url, 'https://tracy.test/github/push')
    assert.equal(gh.reposCreated.length, 1, 'still never created a second repo')
  }
)

test(
  'createRepoFor: a taken name is REPO_NAME_TAKEN, and GITHUB_UNAVAILABLE when GitHub itself is down',
  opts,
  async () => {
    const { pool } = db
    await pool.query("insert into site (site_key, label, host) values ('a.localhost', 'a-site', 'local')")
    await pool.query("insert into site (site_key, label, host) values ('b.localhost', 'b-site', 'local')")

    const taken = fakeGithub()
    taken.installations['org:TracyHQ'] = 1
    taken.state.repoNameTaken = true
    assert.deepEqual(
      await createRepoFor(
        pool,
        CONFIG,
        { siteKey: 'a.localhost', label: 'a-site', email: 'x@y.z' },
        taken.fetchImpl
      ),
      { code: 'REPO_NAME_TAKEN' }
    )

    const down = fakeGithub({ down: true })
    assert.deepEqual(
      await createRepoFor(
        pool,
        CONFIG,
        { siteKey: 'b.localhost', label: 'b-site', email: 'x@y.z' },
        down.fetchImpl
      ),
      { code: 'GITHUB_UNAVAILABLE' }
    )
  }
)

// ── The two HTTP doors ───────────────────────────────────────────────────────────────────────────

function signedFleetRequest({ host = 'local', siteKey, label, repo } = {}) {
  const body = JSON.stringify({
    host,
    ...(siteKey ? { siteKey } : {}),
    ...(label ? { label } : {}),
    ...(repo ? { repo } : {})
  })
  return { body }
}

/** POST a signed body to the token door, signed with `secret`; answers `{status, json}`. */
async function askGitToken(app, fields, secret = 'host-secret-local') {
  const { body } = signedFleetRequest(fields)
  const res = await app.fetch(
    new Request('https://tracy.test/fleet/git-token', {
      method: 'POST',
      headers: { 'x-tracy-signature': await hmacHex(secret, body) },
      body
    })
  )
  return { status: res.status, json: await res.json() }
}

test(
  '/fleet/git-token: GitHub not configured → 503; a wrong signature → 403, before anything else runs',
  opts,
  async () => {
    const { pool } = db
    const off = githubRoutes({ pool, config: CONFIG_OFF })
    const offRes = await off.fetch(
      new Request('https://tracy.test/fleet/git-token', {
        method: 'POST',
        body: JSON.stringify({ host: 'local', siteKey: 'x.y' })
      })
    )
    assert.equal(offRes.status, 503)
    assert.deepEqual(await offRes.json(), { code: 'GITHUB_NOT_CONFIGURED' })

    const gh = fakeGithub()
    const app = githubRoutes({ pool, config: CONFIG, fetchImpl: gh.fetchImpl })
    const { body } = signedFleetRequest({ siteKey: 'x.y' })
    const badSig = await app.fetch(
      new Request('https://tracy.test/fleet/git-token', {
        method: 'POST',
        headers: { 'x-tracy-signature': 'not-the-right-hex' },
        body
      })
    )
    assert.equal(badSig.status, 403)
    assert.deepEqual(await badSig.json(), { code: 'BAD_SIGNATURE' })
    assert.equal(gh.calls.length, 0, 'a bad signature must never reach GitHub')
  }
)

test(
  "/fleet/git-token: a good signature mints a token for the site's OWN repo, never a named mismatch",
  opts,
  async () => {
    const { pool } = db
    await pool.query(
      "insert into site (site_key, label, host) values ('lantern.localhost', 'lantern', 'local')"
    )
    await writeRepo(pool, 'lantern.localhost', { repo: 'TracyHQ/lantern' })
    const gh = fakeGithub()
    gh.installations['TracyHQ/lantern'] = 3
    const app = githubRoutes({ pool, config: CONFIG, fetchImpl: gh.fetchImpl })

    const { body } = signedFleetRequest({ siteKey: 'lantern.localhost', label: 'lantern' })
    const signature = await hmacHex('host-secret-local', body)
    const res = await app.fetch(
      new Request('https://tracy.test/fleet/git-token', {
        method: 'POST',
        headers: { 'x-tracy-signature': signature },
        body
      })
    )
    assert.equal(res.status, 200)
    const answer = await res.json()
    assert.equal(answer.repo, 'TracyHQ/lantern')
    assert.equal(answer.token, 'tok-1')
    assert.ok(answer.expiresAt)

    // Naming a DIFFERENT repo than the one on record is refused, not honored.
    const { body: mismatchBody } = signedFleetRequest({
      siteKey: 'lantern.localhost',
      label: 'lantern',
      repo: 'TracyHQ/other'
    })
    const mismatchSig = await hmacHex('host-secret-local', mismatchBody)
    const mismatch = await app.fetch(
      new Request('https://tracy.test/fleet/git-token', {
        method: 'POST',
        headers: { 'x-tracy-signature': mismatchSig },
        body: mismatchBody
      })
    )
    assert.equal(mismatch.status, 403)
    assert.deepEqual(await mismatch.json(), { code: 'REPO_NOT_YOURS' })

    // A site with no repo at all: 404 NO_REPO, not a crash.
    await pool.query("insert into site (site_key, label, host) values ('bare.localhost', 'bare', 'local')")
    const { body: noRepoBody } = signedFleetRequest({ siteKey: 'bare.localhost', label: 'bare' })
    const noRepoSig = await hmacHex('host-secret-local', noRepoBody)
    const noRepo = await app.fetch(
      new Request('https://tracy.test/fleet/git-token', {
        method: 'POST',
        headers: { 'x-tracy-signature': noRepoSig },
        body: noRepoBody
      })
    )
    assert.equal(noRepo.status, 404)
    assert.deepEqual(await noRepo.json(), { code: 'NO_REPO' })
  }
)

test(
  '/fleet/git-token: a site key answers only for the site on THIS host under THIS label (R2)',
  opts,
  async () => {
    const { pool } = db
    // Two sites with repos: one on the asking host, one on another host. A signature proves which
    // host asks; it must not be enough to reach a site that lives elsewhere.
    await pool.query(
      "insert into site (site_key, label, host) values ('lantern.localhost', 'lantern', 'local'), ('beacon.localhost', 'beacon', 'other')"
    )
    await writeRepo(pool, 'lantern.localhost', { repo: 'TracyHQ/lantern' })
    await writeRepo(pool, 'beacon.localhost', { repo: 'TracyHQ/beacon' })
    const gh = fakeGithub()
    gh.installations['TracyHQ/lantern'] = 3
    gh.installations['TracyHQ/beacon'] = 4
    const app = githubRoutes({ pool, config: CONFIG, fetchImpl: gh.fetchImpl })

    // Right host, right label: the site's own repo, chosen by the record.
    const right = await askGitToken(app, { siteKey: 'lantern.localhost', label: 'lantern' })
    assert.equal(right.status, 200)
    assert.equal(right.json.repo, 'TracyHQ/lantern')

    // Wrong host: the site lives on `other`, the signer is `local`.
    const wrongHost = await askGitToken(app, { siteKey: 'beacon.localhost', label: 'beacon' })
    assert.equal(wrongHost.status, 403)
    assert.deepEqual(wrongHost.json, { code: 'REPO_NOT_YOURS' })

    // Wrong label: the site folder `beacon`'s `.tracy/site.json` edited to name lantern's key.
    const wrongLabel = await askGitToken(app, { siteKey: 'lantern.localhost', label: 'beacon' })
    assert.equal(wrongLabel.status, 403)
    assert.deepEqual(wrongLabel.json, { code: 'REPO_NOT_YOURS' })

    // Missing label: refused as malformed — the door never falls back to trusting the key alone.
    const noLabel = await askGitToken(app, { siteKey: 'lantern.localhost' })
    assert.equal(noLabel.status, 400)
    assert.deepEqual(noLabel.json, { code: 'INVALID_REQUEST' })

    const minted = gh.calls.filter((call) => call.url.includes('/access_tokens'))
    assert.equal(minted.length, 1, 'only the one rightful ask may reach GitHub for a token')
  }
)

test(
  '/fleet/git-token: the shared-repo branch (no siteKey) only ever answers for the closed FLEET_SHARED_REPOS list',
  opts,
  async () => {
    const { pool } = db
    const gh = fakeGithub()
    gh.installations['TracyHQ/design-inspirations'] = 8
    const app = githubRoutes({ pool, config: CONFIG, fetchImpl: gh.fetchImpl })

    const { body } = signedFleetRequest({ repo: 'TracyHQ/design-inspirations' })
    const signature = await hmacHex('host-secret-local', body)
    const res = await app.fetch(
      new Request('https://tracy.test/fleet/git-token', {
        method: 'POST',
        headers: { 'x-tracy-signature': signature },
        body
      })
    )
    assert.equal(res.status, 200)
    assert.equal((await res.json()).repo, 'TracyHQ/design-inspirations')

    const { body: badBody } = signedFleetRequest({ repo: 'TracyHQ/some-other-repo' })
    const badSig = await hmacHex('host-secret-local', badBody)
    const refused = await app.fetch(
      new Request('https://tracy.test/fleet/git-token', {
        method: 'POST',
        headers: { 'x-tracy-signature': badSig },
        body: badBody
      })
    )
    assert.equal(refused.status, 400)
    assert.deepEqual(await refused.json(), { code: 'INVALID_REQUEST' })
  }
)

test(
  '/fleet/git-token: a signature from an unknown host name is refused, never matched against the wrong secret',
  opts,
  async () => {
    const { pool } = db
    const gh = fakeGithub()
    const app = githubRoutes({ pool, config: CONFIG, fetchImpl: gh.fetchImpl })
    const { body } = signedFleetRequest({ host: 'not-a-configured-host', siteKey: 'x.y' })
    const signature = await hmacHex('host-secret-local', body) // even the RIGHT secret, wrong host name
    const res = await app.fetch(
      new Request('https://tracy.test/fleet/git-token', {
        method: 'POST',
        headers: { 'x-tracy-signature': signature },
        body
      })
    )
    assert.equal(res.status, 403)
    assert.deepEqual(await res.json(), { code: 'BAD_SIGNATURE' })
  }
)

async function githubSignature(secret, raw) {
  return `sha256=${await hmacHex(secret, raw)}`
}

test(
  '/github/push: not configured → 503; a wrong signature → 403; a non-push event is ignored',
  opts,
  async () => {
    const { pool } = db
    const off = githubRoutes({ pool, config: CONFIG_OFF })
    const offRes = await off.fetch(
      new Request('https://tracy.test/github/push', { method: 'POST', body: '{}' })
    )
    assert.equal(offRes.status, 503)

    const app = githubRoutes({ pool, config: CONFIG })
    const badSig = await app.fetch(
      new Request('https://tracy.test/github/push', {
        method: 'POST',
        headers: { 'x-hub-signature-256': 'sha256=wrong', 'x-github-event': 'push' },
        body: '{}'
      })
    )
    assert.equal(badSig.status, 403)
    assert.deepEqual(await badSig.json(), { code: 'BAD_SIGNATURE' })

    const raw = '{}'
    const goodSig = await githubSignature(GITHUB.webhookSecret, raw)
    const wrongEvent = await app.fetch(
      new Request('https://tracy.test/github/push', {
        method: 'POST',
        headers: { 'x-hub-signature-256': goodSig, 'x-github-event': 'ping' },
        body: raw
      })
    )
    assert.equal(wrongEvent.status, 200)
    assert.deepEqual(await wrongEvent.json(), { ignored: true })
  }
)

test(
  '/github/push: a SHA in merge_ledger is sanctioned; a repo never wired to a site is ignored; a code push with no sanction is alerted',
  opts,
  async () => {
    const { pool } = db
    await pool.query(
      "insert into site (site_key, label, host) values ('lantern.localhost', 'lantern', 'local')"
    )
    await writeRepo(pool, 'lantern.localhost', { repo: 'TracyHQ/lantern' })
    const gh = fakeGithub()
    gh.installations['TracyHQ/lantern'] = 1
    const app = githubRoutes({ pool, config: CONFIG, fetchImpl: gh.fetchImpl })

    const send = async (payload) => {
      const raw = JSON.stringify(payload)
      const sig = await githubSignature(GITHUB.webhookSecret, raw)
      return app.fetch(
        new Request('https://tracy.test/github/push', {
          method: 'POST',
          headers: { 'x-hub-signature-256': sig, 'x-github-event': 'push' },
          body: raw
        })
      )
    }

    // A repo this app has never heard of: ignored, not an error.
    const unknownRepo = await send({
      ref: 'refs/heads/main',
      before: 'a'.repeat(40),
      after: 'b'.repeat(40),
      repository: { full_name: 'TracyHQ/somewhere-else' }
    })
    assert.deepEqual(await unknownRepo.json(), { ignored: true })

    // A freshly created branch (all-zero `before`) is the provision run's own first push.
    const freshBranch = await send({
      ref: 'refs/heads/main',
      before: '0'.repeat(40),
      after: 'b'.repeat(40),
      repository: { full_name: 'TracyHQ/lantern' }
    })
    assert.deepEqual(await freshBranch.json(), { ignored: true })

    // A push to a non-main branch never deploys, so it never alerts either.
    const otherBranch = await send({
      ref: 'refs/heads/task/x',
      before: 'a'.repeat(40),
      after: 'c'.repeat(40),
      repository: { full_name: 'TracyHQ/lantern' }
    })
    assert.deepEqual(await otherBranch.json(), { ignored: true })

    // A SHA nobody sanctioned, that DOES touch a code file (no codePaths declared, so the
    // default-deny fallback applies — anything outside surface/digest/media/deliverables is
    // code): alerted, and still a 200 (GitHub must not be given a reason to retry).
    gh.compares[`${'a'.repeat(40)}...${'d'.repeat(40)}`] = { files: ['webroot/index.php'] }
    const strayPush = await send({
      ref: 'refs/heads/main',
      before: 'a'.repeat(40),
      after: 'd'.repeat(40),
      repository: { full_name: 'TracyHQ/lantern' }
    })
    assert.equal(strayPush.status, 200)
    assert.deepEqual(await strayPush.json(), { alerted: true })

    // A SHA already in the ledger (a real merge/approve door would have written this — none is
    // ported in this plan, so the test seeds it directly): sanctioned, without ever reading the
    // diff (no compare fixture registered for this pair, so an unwary implementation would 404).
    await pool.query('insert into merge_ledger (site_key, sha) values ($1, $2)', [
      'lantern.localhost',
      'e'.repeat(40)
    ])
    const sanctionedPush = await send({
      ref: 'refs/heads/main',
      before: 'a'.repeat(40),
      after: 'e'.repeat(40),
      repository: { full_name: 'TracyHQ/lantern' }
    })
    assert.equal(sanctionedPush.status, 200)
    assert.deepEqual(await sanctionedPush.json(), { sanctioned: true })
  }
)

test(
  '/github/push: a push that only touches data directories is clean, never alerted, with no codePaths declared',
  opts,
  async () => {
    const { pool } = db
    await pool.query(
      "insert into site (site_key, label, host) values ('lantern.localhost', 'lantern', 'local')"
    )
    await writeRepo(pool, 'lantern.localhost', { repo: 'TracyHQ/lantern' })
    const gh = fakeGithub()
    gh.installations['TracyHQ/lantern'] = 1
    // No `.tracy/site.json` — the default-deny fallback names exactly these four dirs as data.
    gh.compares[`${'a'.repeat(40)}...${'f'.repeat(40)}`] = {
      files: ['surface/hero.html', 'digest/2026-09.json', 'media/logo.png', 'deliverables/report.pdf']
    }
    const app = githubRoutes({ pool, config: CONFIG, fetchImpl: gh.fetchImpl })
    const raw = JSON.stringify({
      ref: 'refs/heads/main',
      before: 'a'.repeat(40),
      after: 'f'.repeat(40),
      repository: { full_name: 'TracyHQ/lantern' }
    })
    const res = await app.fetch(
      new Request('https://tracy.test/github/push', {
        method: 'POST',
        headers: {
          'x-hub-signature-256': await githubSignature(GITHUB.webhookSecret, raw),
          'x-github-event': 'push'
        },
        body: raw
      })
    )
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { clean: true })
  }
)

test(
  "/github/push: a repo's declared codePaths narrows what counts as code — a file outside it is clean even though it isn't a stock data dir",
  opts,
  async () => {
    const { pool } = db
    await pool.query(
      "insert into site (site_key, label, host) values ('lantern.localhost', 'lantern', 'local')"
    )
    await writeRepo(pool, 'lantern.localhost', { repo: 'TracyHQ/lantern' })
    const gh = fakeGithub()
    gh.installations['TracyHQ/lantern'] = 1
    gh.setSiteJson({ codePaths: ['webroot/**'] })

    const app = githubRoutes({ pool, config: CONFIG, fetchImpl: gh.fetchImpl })
    const send = async (before, after, files) => {
      gh.compares[`${before}...${after}`] = { files }
      const raw = JSON.stringify({
        ref: 'refs/heads/main',
        before,
        after,
        repository: { full_name: 'TracyHQ/lantern' }
      })
      return app.fetch(
        new Request('https://tracy.test/github/push', {
          method: 'POST',
          headers: {
            'x-hub-signature-256': await githubSignature(GITHUB.webhookSecret, raw),
            'x-github-event': 'push'
          },
          body: raw
        })
      )
    }

    // `sections/` is not one of the hard-coded default-deny dirs, but the repo's OWN declaration
    // says only `webroot/**` is code — so this is clean under the declared rule.
    const declaredClean = await send('a'.repeat(40), '1'.repeat(40), ['sections/pricing.html'])
    assert.deepEqual(await declaredClean.json(), { clean: true })

    const declaredCode = await send('2'.repeat(40), '3'.repeat(40), ['webroot/wp-content/plugin.php'])
    assert.deepEqual(await declaredCode.json(), { alerted: true })
  }
)

test(
  '/github/push: no installation to mint a read token with → ignored, not a crash or a false alert',
  opts,
  async () => {
    const { pool } = db
    await pool.query(
      "insert into site (site_key, label, host) values ('lantern.localhost', 'lantern', 'local')"
    )
    await writeRepo(pool, 'lantern.localhost', { repo: 'TracyHQ/lantern' })
    // No `gh.installations['TracyHQ/lantern']` set — mintGitToken returns null.
    const gh = fakeGithub()
    const app = githubRoutes({ pool, config: CONFIG, fetchImpl: gh.fetchImpl })
    const raw = JSON.stringify({
      ref: 'refs/heads/main',
      before: 'a'.repeat(40),
      after: 'b'.repeat(40),
      repository: { full_name: 'TracyHQ/lantern' }
    })
    const res = await app.fetch(
      new Request('https://tracy.test/github/push', {
        method: 'POST',
        headers: {
          'x-hub-signature-256': await githubSignature(GITHUB.webhookSecret, raw),
          'x-github-event': 'push'
        },
        body: raw
      })
    )
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ignored: true })
  }
)

// ── Integration through the full app: job-poll wires the repo, provision carries a fresh token ──

const APP_ENV = {
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k',
  GITHUB_APP_ID: GITHUB.appId,
  GITHUB_APP_PRIVATE_KEY: GITHUB.privateKey,
  GITHUB_ORG: GITHUB.org,
  GITHUB_WEBHOOK_SECRET: GITHUB.webhookSecret,
  // The import provision door signs the archive's download URLs, so it needs a store configured
  // (it answers ARTIFACT_STORE_UNAVAILABLE without one). Never dialled here.
  ARTIFACT_S3_ENDPOINT: 'http://r2.test',
  ARTIFACT_S3_BUCKET: 'artifacts',
  ARTIFACT_S3_ACCESS_KEY: 'AK',
  ARTIFACT_S3_SECRET_KEY: 'SK'
}

/** Combines a fake `tracy-host` (same shapes `test/sites-route.test.mjs` uses) with a fake
 * GitHub, on one `fetchImpl` — both `host.hostCall` and `createRepoFor`/`mintGitToken` are
 * threaded through the same seam. */
function fakeCombinedNetwork(gh) {
  const calls = []
  const fetchImpl = async (input, init) => {
    const u = new URL(String(input))
    if (u.hostname === 'api.github.com') return gh.fetchImpl(input, init)
    calls.push({ url: String(input), init })
    if (u.pathname === '/_host/provision')
      return new Response(JSON.stringify({ jobId: 'job-1' }), { status: 200 })
    // A site's delete: the keyed go-live door runs teardown.sh, and its job ends with the script's
    // own closing line (the row goes only on that).
    if (u.pathname === '/_host/go-live' && JSON.parse(init.body).op === 'teardown') {
      const { label } = JSON.parse(init.body)
      return new Response(JSON.stringify({ jobId: `teardown-${label}` }), { status: 202 })
    }
    if (u.pathname.startsWith('/_host/jobs/teardown-')) {
      const label = u.pathname.slice('/_host/jobs/teardown-'.length)
      return new Response(
        JSON.stringify({
          state: 'done',
          step: 'go-live:teardown',
          exitCode: 0,
          output: `TRACY_RESULT torn_down=1 label=${label}`
        }),
        { status: 200 }
      )
    }
    if (u.pathname.startsWith('/_host/jobs/')) {
      return new Response(JSON.stringify({ state: 'done', port: 8123 }), { status: 200 })
    }
    if (u.pathname === '/_host/attach') return new Response(JSON.stringify({ lane: 'ok' }), { status: 200 })
    if (u.pathname === '/_host/teardown') return new Response(JSON.stringify({ ok: true }), { status: 200 })
    return new Response(null, { status: 404 })
  }
  return { calls, fetchImpl }
}

function harness(pool, fetchImpl, env = APP_ENV) {
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    fetchImpl
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const send = (method, path, cookie, body) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {})
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    )
  return { config, cookieFor, get: (path, cookie) => send('GET', path, cookie), send }
}

test(
  "job poll: creates the site's repo on first done, and hands it back for free on a second poll",
  opts,
  async () => {
    const { pool } = db
    const gh = fakeGithub()
    gh.installations['org:TracyHQ'] = 1
    gh.installations['TracyHQ/lantern'] = 1
    const { fetchImpl } = fakeCombinedNetwork(gh)
    const { cookieFor, send, get } = harness(pool, fetchImpl)
    const owner = await cookieFor('owner@x.y')

    const created = await send('POST', '/api/sites', owner, { label: 'lantern', platform: 'wordpress' })
    const { siteKey, jobId } = await created.json()

    const polled = await get(`/api/sites/${siteKey}/jobs/${jobId}`, owner)
    const body = await polled.json()
    assert.equal(body.state, 'done')
    assert.equal(body.repo, 'TracyHQ/lantern')
    assert.equal(body.repoError, undefined)

    const row = (await pool.query('select repo from site where site_key = $1', [siteKey])).rows[0]
    assert.equal(row.repo, 'TracyHQ/lantern')

    // A second poll of the same (already-`done`) job hands back the recorded repo, no new create.
    const reposBefore = gh.reposCreated.length
    const polledAgain = await get(`/api/sites/${siteKey}/jobs/${jobId}`, owner)
    assert.equal((await polledAgain.json()).repo, 'TracyHQ/lantern')
    assert.equal(gh.reposCreated.length, reposBefore)
  }
)

test(
  'job poll: GitHub not configured → the job still finishes done, reporting repoError NOT_CONFIGURED',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeCombinedNetwork(fakeGithub())
    const { cookieFor, send, get } = harness(pool, fetchImpl, {
      TRACY_ORIGIN: 'http://tracy.test:8080',
      SITE_DOMAIN: 'localhost',
      SESSION_SECRET: 's'.repeat(32),
      HOSTS: 'local',
      HOST_local_ORIGIN: 'http://tracy-host.test',
      HOST_local_DSH_ORIGIN: 'http://dsh.test',
      HOST_local_SECRET: 'h',
      SEAT_local_SECRET: 'k'
    })
    const owner = await cookieFor('owner@x.y')

    const created = await send('POST', '/api/sites', owner, { label: 'lantern', platform: 'wordpress' })
    const { siteKey, jobId } = await created.json()

    const polled = await get(`/api/sites/${siteKey}/jobs/${jobId}`, owner)
    const body = await polled.json()
    assert.equal(body.state, 'done', 'the handover must still finish even though GitHub is off')
    assert.equal(body.repoError, 'NOT_CONFIGURED')
    assert.equal(body.repo, undefined)
  }
)

async function accountId(pool, email) {
  const { rows } = await pool.query(
    `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
    [email]
  )
  return rows[0].id
}

async function ownedSite(pool, siteKey, label, { repo } = {}) {
  await pool.query('insert into site (site_key, label, host, repo) values ($1, $2, $3, $4)', [
    siteKey,
    label,
    'local',
    repo ?? null
  ])
  const id = await accountId(pool, 'owner@x.y')
  await pool.query(
    'insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())',
    [siteKey, id, 'owner']
  )
}

// ── DELETE /api/sites/:key: the repo Tracy created goes with the site, nothing else does (#338) ──

/** A site with a repo on record, as `createRepoFor` + `setAttached` leave it — `attached` true on
 * purpose: every site Tracy builds is attached to a lane, so it proves nothing about the repo. */
async function siteWithRepo(pool, siteKey, label, { repo, creator }) {
  await ownedSite(pool, siteKey, label, { repo })
  await pool.query('update site set repo_creator = $2, attached = true where site_key = $1', [
    siteKey,
    creator
  ])
}

/** Every call in order, host and GitHub alike — the teardown-before-delete order is the claim. */
function orderedNetwork(gh) {
  const combined = fakeCombinedNetwork(gh)
  const order = []
  const fetchImpl = async (input, init) => {
    order.push(`${init?.method ?? 'GET'} ${String(input)}`)
    return combined.fetchImpl(input, init)
  }
  return { order, fetchImpl }
}

const siteGone = async (pool, siteKey) =>
  (await pool.query('select 1 from site where site_key = $1', [siteKey])).rows.length === 0

test(
  'DELETE /api/sites/:key: a repo Tracy created is deleted after the host teardown, even on an attached site',
  opts,
  async () => {
    const { pool } = db
    // Created by someone else: the deleting owner does not have to be the recorded creator.
    await siteWithRepo(pool, 'lantern.localhost', 'lantern', {
      repo: 'TracyHQ/lantern',
      creator: 'first-owner@x.y'
    })
    const gh = fakeGithub()
    gh.installations['TracyHQ/lantern'] = 7
    const { order, fetchImpl } = orderedNetwork(gh)
    const { cookieFor, send } = harness(pool, fetchImpl)

    const removed = await send('DELETE', '/api/sites/lantern.localhost', await cookieFor('owner@x.y'))
    assert.equal(removed.status, 200)
    const body = await removed.json()
    assert.equal(body.removed, true)
    assert.equal(body.host, true)
    assert.equal(body.repo, true)
    assert.deepEqual(
      gh.reposDeleted.map((d) => d.repo),
      ['TracyHQ/lantern']
    )
    assert.deepEqual(gh.mintCalls, [
      { installationId: 7, repositories: ['lantern'], permissions: { administration: 'write' } }
    ])
    // The teardown's job is polled until the host says the site is gone; the repo goes after that.
    const teardown = order.findLastIndex((line) => line.endsWith('/_host/jobs/teardown-lantern'))
    const del = order.indexOf('DELETE https://api.github.com/repos/TracyHQ/lantern')
    assert.ok(teardown !== -1 && del > teardown, 'the repo goes after the host teardown')
    assert.equal(await siteGone(pool, 'lantern.localhost'), true)
  }
)

test(
  'DELETE /api/sites/:key: a repo with no recorded creator is kept, and GitHub is never asked',
  opts,
  async () => {
    const { pool } = db
    await siteWithRepo(pool, 'lantern.localhost', 'lantern', { repo: 'TracyHQ/lantern', creator: null })
    const gh = fakeGithub()
    gh.installations['TracyHQ/lantern'] = 7
    const { fetchImpl } = orderedNetwork(gh)
    const { cookieFor, send } = harness(pool, fetchImpl)

    const removed = await send('DELETE', '/api/sites/lantern.localhost', await cookieFor('owner@x.y'))
    assert.equal(removed.status, 200)
    const body = await removed.json()
    assert.equal(body.removed, true)
    assert.equal(body.repo, 'kept')
    assert.equal(gh.calls.length, 0)
    assert.equal(await siteGone(pool, 'lantern.localhost'), true)
  }
)

test(
  'DELETE /api/sites/:key: GitHub refusing or unreachable is reported as failed, and the row still goes',
  opts,
  async () => {
    for (const make of [
      () => {
        const gh = fakeGithub()
        gh.installations['TracyHQ/lantern'] = 7
        gh.state.deleteStatus = 403
        return gh
      },
      () => fakeGithub({ down: true })
    ]) {
      const { pool } = db
      await siteWithRepo(pool, 'lantern.localhost', 'lantern', {
        repo: 'TracyHQ/lantern',
        creator: 'owner@x.y'
      })
      const gh = make()
      const { fetchImpl } = orderedNetwork(gh)
      const { cookieFor, send } = harness(pool, fetchImpl)

      const removed = await send('DELETE', '/api/sites/lantern.localhost', await cookieFor('owner@x.y'))
      assert.equal(removed.status, 200)
      const body = await removed.json()
      assert.equal(body.removed, true)
      assert.equal(body.repo, 'failed')
      assert.equal(await siteGone(pool, 'lantern.localhost'), true)
    }
  }
)

test(
  'DELETE /api/sites/:key: a site with no repo answers repo false without a single GitHub call',
  opts,
  async () => {
    const { pool } = db
    await ownedSite(pool, 'lantern.localhost', 'lantern')
    const gh = fakeGithub()
    const { fetchImpl } = orderedNetwork(gh)
    const { cookieFor, send } = harness(pool, fetchImpl)

    const removed = await send('DELETE', '/api/sites/lantern.localhost', await cookieFor('owner@x.y'))
    assert.equal((await removed.json()).repo, false)
    assert.equal(gh.calls.length, 0)
    assert.equal(await siteGone(pool, 'lantern.localhost'), true)
  }
)

test(
  'provision: a site with a repo already on record gets a fresh gitToken folded into the /provision instruction',
  opts,
  async () => {
    const { pool } = db
    await ownedSite(pool, 'lantern.localhost', 'lantern', { repo: 'TracyHQ/lantern' })
    await pool.query("update site set origin = 'migrated' where site_key = 'lantern.localhost'")

    const gh = fakeGithub()
    gh.installations['TracyHQ/lantern'] = 1
    const { calls, fetchImpl } = fakeCombinedNetwork(gh)
    const { cookieFor, send } = harness(pool, fetchImpl)
    const owner = await cookieFor('owner@x.y')

    const res = await send('POST', '/api/sites/lantern.localhost/provision', owner, {
      platform: 'wordpress',
      webrootKey: `sites/${labelPrefix('lantern.localhost')}/2026-x-webroot.tar`
    })
    assert.equal(res.status, 202)

    const provisionCall = calls.find((c) => c.url.endsWith('/_host/provision'))
    const instruction = JSON.parse(provisionCall.init.body)
    assert.equal(instruction.gitToken, 'tok-1')
    assert.equal(instruction.gitRepo, 'TracyHQ/lantern')
  }
)

test(
  'provision: a brand-new site (no repo yet) carries no gitToken at all — nothing to push to yet',
  opts,
  async () => {
    const { pool } = db
    const gh = fakeGithub()
    const { calls, fetchImpl } = fakeCombinedNetwork(gh)
    const { cookieFor, send } = harness(pool, fetchImpl)
    const owner = await cookieFor('owner@x.y')

    await send('POST', '/api/sites', owner, { label: 'freshsite', platform: 'wordpress' })
    const provisionCall = calls.find((c) => c.url.endsWith('/_host/provision'))
    const instruction = JSON.parse(provisionCall.init.body)
    assert.equal('gitToken' in instruction, false)
    assert.equal('gitRepo' in instruction, false)
  }
)

// ── Fix round 2: ADR 0067 §3's one bootstrap exception, ported from `handleCreateRepo`'s own
// grant resolution (`workers/seat-registry/src/index.js:7708-7741`) — a workspace owner or editor
// may bootstrap a site's repo when the site's own book has no editing answer yet (ADR 0028: an
// editor changes the whole site, code included), and doing so grants
// them the site's first real owner seat so the exception never has to run again.

/** A site with no seat at all — the actual bootstrap precondition ("the site book cannot answer
 * yet"), unlike `ownedSite` above which pre-grants an owner. */
async function bareSite(pool, siteKey, label) {
  await pool.query('insert into site (site_key, label, host) values ($1, $2, $3)', [siteKey, label, 'local'])
}

/** A workspace with one grant on it, at the given role — `activate: true` so `accepted_at` is
 * set (ADR 0036: a pending invite is not "acting" anything). */
async function workspaceWithGrant(pool, email, role) {
  const id = await accountId(pool, email)
  const workspace = await createWorkspace(pool, { displayName: `ws-${id}`, createdBy: id })
  await grantWorkspace(pool, {
    workspaceId: workspace.id,
    accountId: id,
    role,
    grantedBy: id,
    activate: true
  })
  return workspace
}

test(
  "job poll: a workspace editor with no site seat bootstraps the repo, and ends up holding the site's owner seat",
  opts,
  async () => {
    const { pool } = db
    await bareSite(pool, 'lantern.localhost', 'lantern')
    const workspace = await workspaceWithGrant(pool, 'agency@x.y', 'editor')
    await declareSiteWorkspace(pool, { siteKey: 'lantern.localhost', workspaceId: workspace.id })
    await ownedSiteJob(pool, 'lantern.localhost')

    const gh = fakeGithub()
    gh.installations['org:TracyHQ'] = 1
    gh.installations['TracyHQ/lantern'] = 1
    const { fetchImpl } = fakeCombinedNetwork(gh)
    const { cookieFor, get } = harness(pool, fetchImpl)
    const agency = await cookieFor('agency@x.y')

    const res = await get('/api/sites/lantern.localhost/jobs/job-lantern', agency)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.state, 'done')
    assert.equal(body.repo, 'TracyHQ/lantern')

    const accountRow = (await pool.query('select id from account where email = $1', ['agency@x.y'])).rows[0]
    const seat = (
      await pool.query('select role, accepted_at from seat where site_key = $1 and account_id = $2', [
        'lantern.localhost',
        accountRow.id
      ])
    ).rows[0]
    assert.equal(seat.role, 'owner')
    assert.ok(seat.accepted_at, 'the bootstrap grant must be accepted outright, not a pending invite')
  }
)

test(
  'job poll: after the bootstrap, a second call is decided by the site book alone — the workspace is never consulted again',
  opts,
  async () => {
    const { pool } = db
    await bareSite(pool, 'lantern.localhost', 'lantern')
    const workspace = await workspaceWithGrant(pool, 'agency@x.y', 'owner')
    await declareSiteWorkspace(pool, { siteKey: 'lantern.localhost', workspaceId: workspace.id })
    await ownedSiteJob(pool, 'lantern.localhost')

    const gh = fakeGithub()
    gh.installations['org:TracyHQ'] = 1
    gh.installations['TracyHQ/lantern'] = 1
    const { fetchImpl } = fakeCombinedNetwork(gh)
    const { cookieFor, get } = harness(pool, fetchImpl)
    const agency = await cookieFor('agency@x.y')

    const first = await get('/api/sites/lantern.localhost/jobs/job-lantern', agency)
    assert.equal(first.status, 200)

    // Undeclare the site from the workspace (and revoke the workspace grant outright) — if the
    // second call still succeeds, it can only be because the SITE's own book now answers,
    // exactly as `requireRepoDoorGrant`'s own comment says it must.
    await pool.query('delete from workspace_site where site_key = $1', ['lantern.localhost'])
    await pool.query('update seat_workspace set revoked_at = now() where workspace_id = $1', [workspace.id])

    const second = await get('/api/sites/lantern.localhost/jobs/job-lantern', agency)
    assert.equal(second.status, 200)
    assert.equal((await second.json()).repo, 'TracyHQ/lantern')
  }
)

test(
  'job poll: a workspace owner of a DIFFERENT (unrelated) workspace is refused SEAT_NOT_AUTHORIZED',
  opts,
  async () => {
    const { pool } = db
    await bareSite(pool, 'lantern.localhost', 'lantern')
    const owningWorkspace = await workspaceWithGrant(pool, 'owner-admin@x.y', 'owner')
    await declareSiteWorkspace(pool, { siteKey: 'lantern.localhost', workspaceId: owningWorkspace.id })
    await ownedSiteJob(pool, 'lantern.localhost')
    // A second, unrelated workspace — the stranger is its owner, but it owns no site here.
    await workspaceWithGrant(pool, 'stranger@x.y', 'owner')

    const { fetchImpl } = fakeCombinedNetwork(fakeGithub())
    const { cookieFor, get } = harness(pool, fetchImpl)
    const stranger = await cookieFor('stranger@x.y')

    const res = await get('/api/sites/lantern.localhost/jobs/job-lantern', stranger)
    assert.equal(res.status, 403)
    assert.deepEqual(await res.json(), { code: 'SEAT_NOT_AUTHORIZED' })
  }
)

test(
  'job poll: a caller with neither a site seat nor any workspace grant is refused SEAT_NOT_AUTHORIZED',
  opts,
  async () => {
    const { pool } = db
    await bareSite(pool, 'lantern.localhost', 'lantern')
    await ownedSiteJob(pool, 'lantern.localhost')

    const { fetchImpl } = fakeCombinedNetwork(fakeGithub())
    const { cookieFor, get } = harness(pool, fetchImpl)
    const nobody = await cookieFor('nobody@x.y')

    const res = await get('/api/sites/lantern.localhost/jobs/job-lantern', nobody)
    assert.equal(res.status, 403)
    assert.deepEqual(await res.json(), { code: 'SEAT_NOT_AUTHORIZED' })
  }
)

test(
  "job poll: a VIEWER grant on the site's OWNING workspace is refused NOT_SITE_OWNER, not SEAT_NOT_AUTHORIZED",
  opts,
  async () => {
    const { pool } = db
    await bareSite(pool, 'lantern.localhost', 'lantern')
    const workspace = await workspaceWithGrant(pool, 'viewer@x.y', 'viewer')
    await declareSiteWorkspace(pool, { siteKey: 'lantern.localhost', workspaceId: workspace.id })
    await ownedSiteJob(pool, 'lantern.localhost')

    const { fetchImpl } = fakeCombinedNetwork(fakeGithub())
    const { cookieFor, get } = harness(pool, fetchImpl)
    const viewer = await cookieFor('viewer@x.y')

    const res = await get('/api/sites/lantern.localhost/jobs/job-lantern', viewer)
    assert.equal(res.status, 403)
    // Some grant exists (a live workspace seat) — just not an editing one — so this is the
    // Worker's OTHER refusal, not the "nothing at all" one.
    assert.deepEqual(await res.json(), { code: 'NOT_SITE_OWNER' })
  }
)

test(
  'job poll: a site owner (the ordinary path) still works unchanged — no workspace ever consulted',
  opts,
  async () => {
    const { pool } = db
    await ownedSite(pool, 'lantern.localhost', 'lantern')
    await ownedSiteJob(pool, 'lantern.localhost')

    const gh = fakeGithub()
    gh.installations['org:TracyHQ'] = 1
    gh.installations['TracyHQ/lantern'] = 1
    const { fetchImpl } = fakeCombinedNetwork(gh)
    const { cookieFor, get } = harness(pool, fetchImpl)
    const owner = await cookieFor('owner@x.y')

    const res = await get('/api/sites/lantern.localhost/jobs/job-lantern', owner)
    assert.equal(res.status, 200)
    assert.equal((await res.json()).repo, 'TracyHQ/lantern')
  }
)

/** Files a `job` row directly (bypassing `POST /api/sites`, which — for these tests — would grant
 * the CALLER an owner seat before we ever get to test the bootstrap gate) so the job-poll door has
 * something to poll for a site nobody has claimed yet. */
async function ownedSiteJob(pool, siteKey) {
  await pool.query(
    "insert into job (id, site_key, host, kind) values ('job-lantern', $1, 'local', 'provision')",
    [siteKey]
  )
}

// ── Fix round 3: `ensureSiteOwnerSeat` must decide from the RAW seat row, not the accepted-only
// view `seats.grantFor` exposes — task-7-rereview-2.md's Important finding. A live-but-unaccepted
// row (an invite or join request nobody answered yet) reads identically to "no row at all" through
// `grantFor`, but `grantSite`'s own `ON CONFLICT ... WHERE revoked_at IS NOT NULL OR declined_at IS
// NOT NULL` guard silently no-ops against it — so the naive `hadGrant` boolean this function used
// to compute left the bootstrap exception unable to ever close for that account. These tests
// exercise all three non-accepted row shapes the raw check must tell apart correctly: a live
// pending row (must be upgraded via `setGrantRole` + `acceptGrant`), a revoked row, and a declined
// row (both must be revived via `grantSite`) — every one of the three must end with the account
// holding an ACCEPTED owner seat, and a second call must then be decided by the site book alone.

/** A raw `seat` row inserted directly — bypassing `grantSite`'s own revival/no-op rules — so a
 * test can construct the exact pre-existing state `ensureSiteOwnerSeat` must tell apart: pending
 * (the default: no `revoked_at`/`declined_at`/`accepted_at`), revoked, or declined. */
async function rawSeatRow(
  pool,
  siteKey,
  accountId,
  { role = 'editor', revoked = false, declined = false } = {}
) {
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, revoked_at, declined_at)
     values ($1, $2, $3, $2, $4, $5)`,
    [siteKey, accountId, role, revoked ? new Date() : null, declined ? new Date() : null]
  )
}

/**
 * Shared body for the three "pre-existing non-accepted row" bootstrap tests: the account already
 * holds a `seat` row on the target site (pending, revoked, or declined, per `rowShape`) before ever
 * being granted a workspace-owner bootstrap. Asserts the bootstrap still succeeds, the row ends
 * ACCEPTED as `owner` (never merely re-roled), and — the other half of the invariant — a second
 * call afterward is decided by the site book alone, with the workspace link and grant both gone.
 */
async function bootstrapClosesDespitePriorRow(pool, email, rowShape) {
  await bareSite(pool, 'lantern.localhost', 'lantern')
  const workspace = await workspaceWithGrant(pool, email, 'owner')
  await declareSiteWorkspace(pool, { siteKey: 'lantern.localhost', workspaceId: workspace.id })
  await ownedSiteJob(pool, 'lantern.localhost')
  const id = await accountId(pool, email)
  await rawSeatRow(pool, 'lantern.localhost', id, rowShape)

  const gh = fakeGithub()
  gh.installations['org:TracyHQ'] = 1
  gh.installations['TracyHQ/lantern'] = 1
  const { fetchImpl } = fakeCombinedNetwork(gh)
  const { cookieFor, get } = harness(pool, fetchImpl)
  const cookie = await cookieFor(email)

  const first = await get('/api/sites/lantern.localhost/jobs/job-lantern', cookie)
  assert.equal(first.status, 200)
  assert.equal((await first.json()).repo, 'TracyHQ/lantern')

  const seat = (
    await pool.query(
      'select role, accepted_at, revoked_at, declined_at from seat where site_key = $1 and account_id = $2',
      ['lantern.localhost', id]
    )
  ).rows[0]
  assert.equal(seat.role, 'owner')
  assert.ok(seat.accepted_at, 'the seat must end ACCEPTED, not merely re-roled')
  assert.equal(seat.revoked_at, null)
  assert.equal(seat.declined_at, null)

  // The workspace link and grant both go away — a second call succeeding now can only be the
  // site's own book answering, exactly the "closes after one use" guarantee this fix restores.
  await pool.query('delete from workspace_site where site_key = $1', ['lantern.localhost'])
  await pool.query('update seat_workspace set revoked_at = now() where workspace_id = $1', [workspace.id])
  const second = await get('/api/sites/lantern.localhost/jobs/job-lantern', cookie)
  assert.equal(second.status, 200)
  assert.equal((await second.json()).repo, 'TracyHQ/lantern')
}

test(
  'job poll: a bootstrap with a pre-existing LIVE UNACCEPTED seat row still ends accepted, and closes for good',
  opts,
  async () => {
    const { pool } = db
    await bootstrapClosesDespitePriorRow(pool, 'pending@x.y', {})
  }
)

test(
  'job poll: a bootstrap with a pre-existing REVOKED seat row is revived via grantSite, and closes for good',
  opts,
  async () => {
    const { pool } = db
    await bootstrapClosesDespitePriorRow(pool, 'revoked@x.y', { revoked: true })
  }
)

test(
  'job poll: a bootstrap with a pre-existing DECLINED seat row is revived via grantSite, and closes for good',
  opts,
  async () => {
    const { pool } = db
    await bootstrapClosesDespitePriorRow(pool, 'declined@x.y', { declined: true })
  }
)

test(
  'job poll: an accepted VIEWER site grant with no workspace involved at all is refused NOT_SITE_OWNER',
  opts,
  async () => {
    const { pool } = db
    await bareSite(pool, 'lantern.localhost', 'lantern')
    await ownedSiteJob(pool, 'lantern.localhost')
    const id = await accountId(pool, 'viewer@x.y')
    await pool.query(
      'insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())',
      ['lantern.localhost', id, 'viewer']
    )

    const { fetchImpl } = fakeCombinedNetwork(fakeGithub())
    const { cookieFor, get } = harness(pool, fetchImpl)
    const viewer = await cookieFor('viewer@x.y')

    const res = await get('/api/sites/lantern.localhost/jobs/job-lantern', viewer)
    assert.equal(res.status, 403)
    assert.deepEqual(await res.json(), { code: 'NOT_SITE_OWNER' })
  }
)

test(
  '/github/release: a signed release event on joomlart-products reads GitHub again; a push on it does not',
  opts,
  async () => {
    const { pool } = db
    let reads = 0
    // The reader's own network: one releases page, no assets. What is asserted here is that the
    // door decides to read at all — `quickstart-releases.test.mjs` owns what a read produces.
    const fetchImpl = async (url) => {
      if (String(url).includes('/releases')) {
        reads += 1
        return new Response('[]', { status: 200 })
      }
      if (String(url).endsWith('/installation'))
        return new Response(JSON.stringify({ id: 1 }), { status: 200 })
      return new Response(JSON.stringify({ token: 'ghs_x', expires_at: 'soon' }), { status: 201 })
    }
    const app = githubRoutes({ pool, config: CONFIG, fetchImpl })
    const post = async (event, payload) => {
      const raw = JSON.stringify(payload)
      return app.fetch(
        new Request('https://tracy.test/github/release', {
          method: 'POST',
          headers: {
            'x-hub-signature-256': await githubSignature(GITHUB.webhookSecret, raw),
            'x-github-event': event
          },
          body: raw
        })
      )
    }

    const published = await post('release', {
      action: 'published',
      repository: { full_name: 'JoomlArt-Products/joomlart-products' }
    })
    assert.equal(published.status, 200)
    assert.equal(reads, 1)

    // A push on the same repository is the OTHER webhook's business: tying the two together
    // would re-read GitHub every time a customer's site pushed a commit.
    const pushed = await post('push', { repository: { full_name: 'JoomlArt-Products/joomlart-products' } })
    assert.deepEqual(await pushed.json(), { ignored: true })
    // And a release somewhere else says nothing about the quickstarts.
    const elsewhere = await post('release', {
      action: 'published',
      repository: { full_name: 'TracyHQ/tch' }
    })
    assert.deepEqual(await elsewhere.json(), { ignored: true })
    assert.equal(reads, 1, 'neither of those started a read')

    const badSig = await app.fetch(
      new Request('https://tracy.test/github/release', {
        method: 'POST',
        headers: { 'x-hub-signature-256': 'sha256=wrong', 'x-github-event': 'release' },
        body: '{}'
      })
    )
    assert.equal(badSig.status, 403)
  }
)
