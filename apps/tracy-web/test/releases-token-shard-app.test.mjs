// A shard runs its own GitHub App, installed on the shard's own org and NOT on the releases
// repository (one App per shard, since 15/10/2026). It reads JoomlArt-Products/ja-products with
// TRACY_RELEASES_GITHUB_TOKEN instead. Production's App IS installed there and must keep minting;
// a GitHub outage must not be read as "not installed"; and a refused mint is an error, never a
// silent switch to the token.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'

import { RELEASES_REPO, releasesToken } from '../src/lib/quickstart-releases.js'

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const SHARD_APP = Object.freeze({
  appId: '900777',
  privateKey: privateKey.export({ type: 'pkcs1', format: 'pem' }),
  org: 'tracy-sites-s1',
  webhookSecret: 'whsec-test-only'
})
const READ_TOKEN = 'github_pat_shard_read_only'

/**
 * GitHub as `installationIdFor` and `mintTokenFor` see it. `installedOn` lists the repos the App is
 * installed on; `mintStatus` is what the token endpoint answers (201 mints, 404/422 refuse, 5xx is
 * an outage).
 */
function fakeGithub({ installedOn = [], mintStatus = 201 } = {}) {
  const calls = []
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input))
    calls.push(`${init.method ?? 'GET'} ${url.pathname}`)
    const installation = url.pathname.match(/^\/repos\/(.+)\/installation$/)
    if (installation) {
      return installedOn.includes(installation[1])
        ? Response.json({ id: 41 })
        : new Response('{}', { status: 404 })
    }
    if (url.pathname === '/app/installations/41/access_tokens' && init.method === 'POST') {
      return mintStatus === 201
        ? Response.json({ token: 'ghs_minted', expires_at: '2026-10-16T00:00:00Z' }, { status: 201 })
        : new Response('{}', { status: mintStatus })
    }
    return new Response('{}', { status: 404 })
  }
  return { calls, fetchImpl }
}

test('an App that is not installed on the releases repo reads it with TRACY_RELEASES_GITHUB_TOKEN', async () => {
  const gh = fakeGithub()
  const got = await releasesToken(
    { github: SHARD_APP, releasesToken: READ_TOKEN },
    gh.fetchImpl,
    RELEASES_REPO
  )
  assert.deepEqual(got, { token: READ_TOKEN, reason: null })
  assert.deepEqual(gh.calls, [`GET /repos/${RELEASES_REPO}/installation`])
})

test('an App installed on the releases repo still mints, token or not (production)', async () => {
  const gh = fakeGithub({ installedOn: [RELEASES_REPO] })
  const got = await releasesToken(
    { github: SHARD_APP, releasesToken: READ_TOKEN },
    gh.fetchImpl,
    RELEASES_REPO
  )
  assert.deepEqual(got, { token: 'ghs_minted', reason: null })
})

test('an App not installed and no token still says why', async () => {
  const got = await releasesToken(
    { github: SHARD_APP, releasesToken: null },
    fakeGithub().fetchImpl,
    RELEASES_REPO
  )
  assert.equal(got.token, null)
  assert.match(got.reason, /The GitHub App is not installed on JoomlArt-Products\/ja-products/)
})

test('GitHub down is not "not installed": the token is not used', async () => {
  const down = async () => new Response('{}', { status: 502 })
  const got = await releasesToken({ github: SHARD_APP, releasesToken: READ_TOKEN }, down, RELEASES_REPO)
  assert.equal(got.token, null)
  assert.match(got.reason, /GitHub did not answer/)
})

test('GitHub unreachable is not "not installed" either: the token is not used', async () => {
  const unreachable = async () => {
    throw new TypeError('fetch failed')
  }
  const got = await releasesToken(
    { github: SHARD_APP, releasesToken: READ_TOKEN },
    unreachable,
    RELEASES_REPO
  )
  assert.equal(got.token, null)
  assert.match(got.reason, /GitHub did not answer/)
})

test('an App installed on the releases repo whose mint is refused surfaces the error, never the token', async () => {
  for (const mintStatus of [404, 422]) {
    const gh = fakeGithub({ installedOn: [RELEASES_REPO], mintStatus })
    const got = await releasesToken(
      { github: SHARD_APP, releasesToken: READ_TOKEN },
      gh.fetchImpl,
      RELEASES_REPO
    )
    assert.equal(got.token, null, `a ${mintStatus} on the mint must not fall back to the token`)
    assert.match(got.reason, /GitHub refused an installation token for JoomlArt-Products\/ja-products/)
  }
})

test('an App installed on the releases repo whose mint hits a GitHub outage surfaces the error, never the token', async () => {
  const gh = fakeGithub({ installedOn: [RELEASES_REPO], mintStatus: 503 })
  const got = await releasesToken(
    { github: SHARD_APP, releasesToken: READ_TOKEN },
    gh.fetchImpl,
    RELEASES_REPO
  )
  assert.equal(got.token, null)
  assert.match(got.reason, /GitHub did not answer/)
})
