/**
 * The GitHub side of the repo-per-site feature: sign the App's JWT, trade it for an installation
 * token, and do the two things that token is ever allowed to do (push code, run a webhook).
 *
 * Ported from `workers/seat-registry/src/github.js`, narrowed to the one door this app carries —
 * ADR 0025's "door 1" (Tracy creates the repo, in Tracy's own org). The Worker also serves "door 2"
 * (a customer's own GitHub org, reached through a second, customer-installed App) — that whole
 * branch (`hostApp` vs `env` as the App, `inHostOrg` in `ensureRepoWebhook`) is dropped here on
 * purpose: `config.github` names exactly one App, and every repo this app ever creates or hooks
 * lives in `config.github.org`. If a future task adds door 2, it is a second App config, not a
 * bigger one.
 *
 * NOTHING HERE READS OR WRITES REPO CONTENT. The App mints tickets, never carries
 * cargo — same rule as the Worker's own header states, and for the same reason: a function in
 * this file that ever takes a blob/tree/diff parameter is a function that got the rule wrong.
 *
 * SIGNING IS PLAIN NODE, NOT THE WORKER'S HAND-ROLLED DER. The Worker runs on Cloudflare Workers,
 * where only WebCrypto exists and WebCrypto only imports PKCS#8 — so it carries ~50 lines of
 * PKCS#1→PKCS#8 DER wrapping (`pkcs8FromPkcs1`) to cope with the PEM shape GitHub Apps actually
 * hand out (`BEGIN RSA PRIVATE KEY`, PKCS#1). Node's `crypto.createSign(...).sign(pem)` accepts a
 * PKCS#1 PEM directly (verified against `crypto.generateKeyPairSync` in this app's own tests), so
 * none of that wrapping is needed or carried here.
 */
import { createSign } from 'node:crypto'

const API = 'https://api.github.com'

/**
 * ⛔ EXACTLY THREE PERMISSIONS, NO MORE — the permanent constraint of ADR 0023 §2, carried verbatim. GitHub
 * only lets a repo admin self-install an App that asks for no org-wide grant and no
 * `administration` — adding a permission here, even a seemingly harmless one, silently raises the
 * install bar for every future customer on door 2's App (a different config, same rule). No test
 * catches a violation of this: the cost is a sales conversation stuck in someone's IT department,
 * not a red assertion. The only thing that stops it is whoever reads this comment before editing
 * the object below.
 */
export const TOKEN_PERMISSIONS = Object.freeze({
  contents: 'write',
  pull_requests: 'write',
  metadata: 'read'
})

/** GitHub unreachable, or answering 5xx — a 502 for the caller, never retried in a loop. */
export class GitHubUnavailable extends Error {}

/**
 * Mint permission for exactly one door: creating a repo (ADR 0025 §4) — and its reverse, deleting
 * a repo Tracy created when its site is deleted (`deleteSiteRepo`). Deliberately its own
 * constant, never merged into `TOKEN_PERMISSIONS` — that object is what every token handed to git
 * carries, and mixing the two would hand git the power to create or delete repositories.
 *
 * `administration: write` is what GitHub requires for both `POST /orgs/{org}/repos` and
 * `DELETE /repos/{owner}/{repo}` — it does not require, and must never additionally ask for,
 * `contents`: `auto_init` makes GitHub write the first commit itself, so creating a repo never
 * reads or writes a byte of it. Asking for `contents` here is asking for a permission unused by
 * this door, and GitHub refuses to mint a token wider than its installation's own grant (422) — an
 * unused permission here is not harmless, it is a way to break door 1 on an otherwise-correctly
 * configured App.
 */
const CREATE_PERMISSIONS = Object.freeze({ administration: 'write' })

/** Permission for exactly the webhook door — same reasoning as `CREATE_PERMISSIONS`'s own
 * isolation: a token that can push code must never also be able to rewire where pushes report. */
const WEBHOOK_PERMISSIONS = Object.freeze({ repository_hooks: 'write' })

async function githubFetch(fetchImpl, url, init) {
  let response
  try {
    response = await fetchImpl(url, init)
  } catch {
    throw new GitHubUnavailable()
  }
  if (response.status >= 500) throw new GitHubUnavailable()
  return response
}

/** `User-Agent` is mandatory for the GitHub API — omit it and every call is a flat 403. */
function headers(auth) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${auth}`,
    'User-Agent': 'tracy-web'
  }
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The App's own JWT — RS256, nine-minute lifetime, `iat` set a minute in the past for clock
 * skew. Synchronous: `node:crypto`'s RSA sign has no async form, unlike the Worker's WebCrypto. */
function appJwt(config) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: config.appId }))
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${payload}`)
  signer.end()
  const signature = signer
    .sign(config.privateKey)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `${header}.${payload}.${signature}`
}

/** Installation id of `config`'s App on `repo`, or null when it is not installed there. */
export async function installationIdFor(config, repo, fetchImpl = fetch) {
  const response = await githubFetch(fetchImpl, `${API}/repos/${repo}/installation`, {
    headers: headers(appJwt(config))
  })
  if (response.status === 404) return null
  if (!response.ok) throw new GitHubUnavailable()
  return (await response.json()).id ?? null
}

/** Installation id of `config`'s App on `org` itself — used before a repo exists to create one. */
async function orgInstallationId(config, org, fetchImpl) {
  const response = await githubFetch(fetchImpl, `${API}/orgs/${org}/installation`, {
    headers: headers(appJwt(config))
  })
  if (response.status === 404) return null
  if (!response.ok) throw new GitHubUnavailable()
  return (await response.json()).id ?? null
}

/**
 * Mint an installation token scoped to exactly one repo and `TOKEN_PERMISSIONS` — the only shape
 * of token this app ever hands to something that pushes code. GitHub's own hour-long expiry is
 * carried through as `expiresAt`, not extended or cached: a short-lived token is the design, not
 * an inconvenience to work around.
 *
 * Returns null on 404/422 — installation gone, or repo no longer in it — both meaning the same
 * thing to a caller: not installed, go install it.
 */
export async function mintTokenFor(config, installationId, repoName, fetchImpl = fetch) {
  const response = await githubFetch(fetchImpl, `${API}/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: { ...headers(appJwt(config)), 'content-type': 'application/json' },
    body: JSON.stringify({ repositories: [repoName], permissions: TOKEN_PERMISSIONS })
  })
  if (response.status === 404 || response.status === 422) return null
  if (!response.ok) throw new GitHubUnavailable()
  const minted = await response.json()
  return { token: minted.token, expiresAt: minted.expires_at }
}

/**
 * Create a private repo for a site in `org` — door 1 of ADR 0025's "three doors". `auto_init: true` so
 * the repo is born with one commit (a `README.md`) rather than branch-less and empty: an empty
 * repo forces every later reader to guess "new" from "broken", where one commit is a cheap,
 * unambiguous line to stand on.
 *
 * The mint-then-revoke dance is deliberate: the token this call briefly holds carries
 * `administration: write`, the same permission GitHub requires to delete a repo, so it is fetched,
 * used for exactly one request, and revoked immediately rather than left to expire on its own.
 *
 * Returns null when GitHub refuses the name (422, already taken) — not thrown, because that is an
 * answer the caller acts on (`REPO_NAME_TAKEN`), not a failure of GitHub itself. Every other
 * failure is `GitHubUnavailable`.
 */
export async function createSiteRepo(config, org, name, describes = name, fetchImpl = fetch) {
  const installationId = await orgInstallationId(config, org, fetchImpl)
  if (installationId === null) throw new GitHubUnavailable()

  const minted = await githubFetch(fetchImpl, `${API}/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: { ...headers(appJwt(config)), 'content-type': 'application/json' },
    body: JSON.stringify({ permissions: CREATE_PERMISSIONS })
  })
  if (!minted.ok) throw new GitHubUnavailable()
  const { token } = await minted.json()

  const created = await githubFetch(fetchImpl, `${API}/orgs/${org}/repos`, {
    method: 'POST',
    headers: { ...headers(token), 'content-type': 'application/json' },
    body: JSON.stringify({
      name,
      private: true,
      auto_init: true,
      // The hostname, not the repo name: the name is a label nobody can read back to a site, and
      // this line is where a person scanning the org's repo list finds out whose site it is.
      description: `Tracy workspace for ${describes}`,
      has_issues: true,
      has_wiki: false,
      has_projects: false
    })
  })
  await revokeAtGitHub(token, fetchImpl).catch(() => {})

  if (created.status === 422) return null
  if (!created.ok) throw new GitHubUnavailable()
  const repo = await created.json()
  return { repo: repo.full_name, cloneUrl: repo.clone_url }
}

/**
 * Delete a site's repo — the other half of the door `createSiteRepo` opens, and the only other
 * request `CREATE_PERMISSIONS` exists for. The token is scoped to exactly this one repo (never the
 * whole installation), used for the one DELETE, and revoked whether or not the DELETE succeeded.
 *
 * Deciding WHETHER a repo may be deleted is the caller's job (`github/route.js`'s `deleteRepoFor`
 * reads who created it); this function only refuses a repo outside the App's own org, so a
 * customer-owned repo can never reach GitHub's DELETE through it.
 *
 * Returns true only on GitHub's own 204. Every other answer — the App not installed on the repo,
 * a mint refused, a 403, a 404 — is false: a caller reports this answer to a person as "your
 * repository is gone", and "GitHub could not find it" is not evidence that it is. Unreachable
 * GitHub throws `GitHubUnavailable`, like every other function here.
 */
export async function deleteSiteRepo(config, repo, fetchImpl = fetch) {
  const [org, name] = repo.split('/')
  if (!org || !name || org !== config.org) return false

  const installationId = await installationIdFor(config, repo, fetchImpl)
  if (installationId === null) return false

  const minted = await githubFetch(fetchImpl, `${API}/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: { ...headers(appJwt(config)), 'content-type': 'application/json' },
    body: JSON.stringify({ repositories: [name], permissions: CREATE_PERMISSIONS })
  })
  if (!minted.ok) return false
  const { token } = await minted.json()

  try {
    const deleted = await githubFetch(fetchImpl, `${API}/repos/${repo}`, {
      method: 'DELETE',
      headers: headers(token)
    })
    return deleted.status === 204
  } finally {
    await revokeAtGitHub(token, fetchImpl).catch(() => {})
  }
}

/**
 * Attach (or repair) the push webhook on `repo`, pointed at `url`. Idempotent by URL: an existing
 * hook with the same URL is PATCHed (GitHub never returns a webhook's secret, so overwriting it is
 * the only way to be sure both sides still agree on it); no existing hook is created fresh.
 *
 * Never throws — a repo that exists but has no working hook yet is a repairable state, not a
 * reason to fail the repo creation it usually follows. The caller gets `{ok:false, reason}` back
 * to report, matching this file's `mintGitToken`-style refuse-with-a-reason discipline.
 */
export async function ensureRepoWebhook(config, repo, { url, secret }, fetchImpl = fetch) {
  if (!secret) return { ok: false, reason: 'no_webhook_secret' }
  const [org, name] = repo.split('/')
  if (!org || !name) return { ok: false, reason: 'bad_repo' }

  try {
    const installationId = await installationIdFor(config, repo, fetchImpl)
    if (installationId === null) return { ok: false, reason: 'app_not_installed' }

    const minted = await githubFetch(fetchImpl, `${API}/app/installations/${installationId}/access_tokens`, {
      method: 'POST',
      headers: { ...headers(appJwt(config)), 'content-type': 'application/json' },
      body: JSON.stringify({ repositories: [name], permissions: WEBHOOK_PERMISSIONS })
    })
    if (!minted.ok) {
      // 422 here has two indistinguishable causes: the App lacks `repository_hooks`, or the repo
      // named in `repositories` just does not exist. Guessing the first sends whoever is on call
      // to fix an App permission that was never wrong, so ask the one question that tells them
      // apart before answering.
      if (minted.status === 422 && (await hostRepoMissing(config, repo, fetchImpl))) {
        return { ok: false, reason: 'repo_missing' }
      }
      return {
        ok: false,
        reason: minted.status === 422 ? 'app_lacks_repository_hooks' : 'github_unavailable'
      }
    }
    const { token } = await minted.json()

    const hookConfig = { url, content_type: 'json', secret }
    try {
      const listed = await githubFetch(fetchImpl, `${API}/repos/${repo}/hooks`, { headers: headers(token) })
      if (!listed.ok) return { ok: false, reason: 'github_unavailable' }
      const existing = (await listed.json()).find((hook) => hook?.config?.url === url)

      const answer = existing
        ? await githubFetch(fetchImpl, `${API}/repos/${repo}/hooks/${existing.id}`, {
            method: 'PATCH',
            headers: { ...headers(token), 'content-type': 'application/json' },
            body: JSON.stringify({ active: true, events: ['push'], config: hookConfig })
          })
        : await githubFetch(fetchImpl, `${API}/repos/${repo}/hooks`, {
            method: 'POST',
            headers: { ...headers(token), 'content-type': 'application/json' },
            // Only `push`: the police door (`route.js`) reads a push event's ref and shas, and
            // nothing else — do not ask GitHub to send events nobody reads.
            body: JSON.stringify({ name: 'web', active: true, events: ['push'], config: hookConfig })
          })
      if (!answer.ok) return { ok: false, reason: 'github_unavailable' }
      return { ok: true, created: !existing }
    } finally {
      await revokeAtGitHub(token, fetchImpl).catch(() => {})
    }
  } catch {
    return { ok: false, reason: 'github_unavailable' }
  }
}

/**
 * Whether `repo` in the App's own org is really gone — the question `installationIdFor` cannot
 * answer alone, because `GET /repos/<repo>/installation` returns 404 for BOTH "App cannot reach
 * this repo" and "repo no longer exists". Checking the org's own installation first, and only
 * trusting the repo-level 404 when it says `repository_selection: 'all'` (this App reaches every
 * repo in the org), turns the ambiguous 404 into an unambiguous one.
 *
 * Mints no token on purpose: a call that only asks whether something exists should never also
 * carry a ticket that opens something. Both requests here sign with the App's bare JWT.
 *
 * Returns `false` on anything short of certain — a caller uses this answer to decide whether to
 * ERASE a record, and a wrong `true` is a self-inflicted orphaned site.
 */
export async function hostRepoMissing(config, repo, fetchImpl = fetch) {
  if (!config) return false
  try {
    const jwt = appJwt(config)
    const org = await githubFetch(fetchImpl, `${API}/orgs/${repo.split('/')[0]}/installation`, {
      headers: headers(jwt)
    })
    if (!org.ok) return false
    if ((await org.json()).repository_selection !== 'all') return false

    const mine = await githubFetch(fetchImpl, `${API}/repos/${repo}/installation`, { headers: headers(jwt) })
    return mine.status === 404
  } catch {
    return false
  }
}

/**
 * Whether the holder of `userToken` is an ADMIN on `repo` — not merely able to push. Every seat
 * can push (ADR 0023), so `push` never distinguishes an owner from a member; GitHub's own
 * `admin` permission does. "Not found" and "not visible to this token" answer the same `false`:
 * someone who is not the owner has no business learning which one it was.
 */
export async function ownsRepo(userToken, repo, fetchImpl = fetch) {
  const response = await githubFetch(fetchImpl, `${API}/repos/${repo}`, { headers: headers(userToken) })
  if (!response.ok) return false
  return (await response.json())?.permissions?.admin === true
}

/**
 * Revoke a live installation token — the token itself is its own bearer credential, so this is
 * the one endpoint that needs no separate authorization. `401` means it was already dead, which is
 * the caller's desired end state either way, so it counts as success.
 */
export async function revokeAtGitHub(token, fetchImpl = fetch) {
  const response = await githubFetch(fetchImpl, `${API}/installation/token`, {
    method: 'DELETE',
    headers: headers(token)
  })
  return response.status === 204 || response.status === 401
}
