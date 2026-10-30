#!/usr/bin/env node
/**
 * Publish one local commit to a GitHub repository's `main` THROUGH A PULL REQUEST, never by a push
 * to `main`: push the commit to a fresh branch, open a PR against `main`, merge it through the REST
 * API with the pushed head pinned (`{"sha": <head>, "merge_method": "merge"}`), check the merge
 * commit is on a fresh fetch of `main`, delete the branch. Written so `main` on the public repos can
 * be protected (PR required, admins included, no force-push) without breaking the publishers.
 *
 * Two callers, one rule set:
 *   - `tools/sync-brands.sh` (TracyHQ/design-inspirations, every ten minutes on each fleet host)
 *     runs this file as a CLI — the host image has node, not `gh`;
 *   - `scripts/wo-export-public.mjs` (TracyHQ/website-opportunities, run by a maintainer) imports it.
 *
 *   node github-pr-publish.mjs leftover --dir <clone> --repo <o/r> --prefix <branch prefix>
 *       Close the open PRs a crashed run of the same publisher left behind — authored by the
 *       token's own identity, from a branch of <o/r> itself under <prefix> that still points at the
 *       PR head — and delete their branches. A leftover is never merged; every other PR is left
 *       alone. Exit 0 settled, 1 failed.
 *   node github-pr-publish.mjs publish --dir <clone> --repo <o/r> --branch <name> --base <sha>
 *                                      --title <t> [--body <b>] [--last]
 *       Publish HEAD of <clone>, built on <base> (the `main` it was generated from).
 *       Exit 0 merged, 20 `main` moved or the merge conflicts — the PR is closed and its branch
 *       deleted, regenerate and call again with --last — and 1 failed (the PR, if any, is named).
 *
 * Environment: GH_TOKEN (the API token, also handed to git when TRACY_PUBLISH_GIT_TOKEN=1 through a
 * credential helper that reads it from the environment — never argv, never disk — and answers for
 * https://github.com only). The API is https://api.github.com; `--api` may replace it with a
 * loopback http stub (tests) and nothing else.
 *
 * Never a push to `main`, never a force-push: a fallback that did either is exactly what branch
 * protection exists to refuse, and would hide a real cause behind a "success".
 */
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const RETRY = 'retry'
export const GITHUB_API = 'https://api.github.com'
// 🔒 Hands GH_TOKEN (read by git's shell from the environment, never argv) to https://github.com
// ONLY; every other helper is reset first, so no other remote ever gets an answer.
export const GITHUB_ONLY_CREDENTIAL = [
  '-c',
  'credential.helper=',
  '-c',
  'credential.https://github.com.helper=!f() { echo username=x-access-token; echo password=$GH_TOKEN; }; f'
]

/**
 * The API the token is sent to: api.github.com, or — tests only — a loopback http stub. Anything
 * else would hand the token to another server, so it is refused, never used.
 * @param {string|undefined} api
 */
export function apiBase(api) {
  if (api === undefined || api === GITHUB_API) return GITHUB_API
  if (/^http:\/\/(127\.0\.0\.1|localhost):\d{1,5}\/?$/.test(api)) return api.replace(/\/+$/, '')
  throw new PublishError(`refusing API ${api}: only ${GITHUB_API} or a loopback http URL (tests)`)
}
export const MERGED = 'merged'

/** An error whose message is fit for a log line: the cause first, the PR (if any) last. */
export class PublishError extends Error {
  /** @param {string} message @param {{prUrl?: string}} [extra] */
  constructor(message, extra = {}) {
    super(extra.prUrl ? `${message} — ${extra.prUrl}` : message)
    this.prUrl = extra.prUrl
  }
}

/**
 * What a failed git push/fetch to GitHub actually means, from its stderr. Each publisher used to say
 * "another host won" for every failure, which sent people looking for a race when the token had
 * expired or `main` had been protected.
 * @param {string} stderr
 */
export function gitFailureCause(stderr) {
  const s = String(stderr || '')
  if (/GH006|protected branch|GH013|repository rule|pre-receive hook declined/i.test(s))
    return 'branch protection refused the push'
  if (
    /Authentication failed|Invalid username or password|could not read Username|Permission to .* denied|returned error: 40[13]|Write access to repository not granted|terminal prompts disabled/i.test(
      s
    )
  )
    return 'authentication failed (token missing, expired or without contents write)'
  if (
    /Could not resolve host|Failed to connect|Connection (timed out|refused|reset)|Operation timed out|unable to access|SSL|TLS|early EOF|RPC failed|Network is unreachable/i.test(
      s
    )
  )
    return 'network error reaching the remote'
  if (/\[rejected\]|non-fast-forward|fetch first|stale info/i.test(s))
    return 'the remote branch already holds other commits'
  if (/does not appear to be a git repository|Repository not found|not found/i.test(s))
    return 'the remote repository was not found (wrong name, or the token cannot see it)'
  return 'git failed'
}

/** @param {string} s */
function lastLines(s) {
  return String(s || '')
    .trim()
    .split('\n')
    .slice(-3)
    .join(' | ')
}

/**
 * @param {{
 *   dir: string, repo: string, token: string, api?: string,
 *   gitConfig?: string[], log?: (line: string) => void
 * }} opts
 */
export function makePublisher(opts) {
  const { dir, repo, token } = opts
  const api = apiBase(opts.api)
  const gitConfig = opts.gitConfig || []
  const log = opts.log || ((line) => console.log(line))
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo || '')) throw new PublishError(`not an owner/repo: ${repo}`)
  if (!token) throw new PublishError('no GitHub API token')

  /** @param {string[]} argv */
  const git = (argv) =>
    execFileSync('git', ['-C', dir, ...gitConfig, ...argv], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    }).trim()

  /** A git call against the remote; a failure says what it was, never just "rejected". */
  const remoteGit = (what, argv) => {
    try {
      return git(argv)
    } catch (err) {
      const stderr = /** @type {any} */ (err).stderr?.toString() ?? ''
      throw new PublishError(`${what}: ${gitFailureCause(stderr)} (${lastLines(stderr)})`)
    }
  }

  /**
   * @param {string} method @param {string} route @param {unknown} [body]
   * @returns {Promise<{status: number, json: any}>}
   */
  const call = async (method, route, body, { root = false } = {}) => {
    let res
    try {
      res = await fetch(`${api}${root ? '' : `/repos/${repo}`}${route}`, {
        method,
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'x-github-api-version': '2022-11-28',
          'user-agent': 'tracy-publisher',
          ...(body === undefined ? {} : { 'content-type': 'application/json' })
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000)
      })
    } catch (err) {
      throw new PublishError(
        `${method} ${route}: network error reaching ${api} (${/** @type {Error} */ (err).message})`
      )
    }
    const text = await res.text()
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = { message: text.slice(0, 200) }
    }
    return { status: res.status, json }
  }

  /** @param {string} what @param {{status: number, json: any}} r @param {string} [prUrl] */
  const apiFailure = (what, r, prUrl) => {
    const msg = r.json?.message ?? ''
    const cause =
      r.status === 401
        ? 'authentication failed (token missing or expired)'
        : r.status === 403
          ? 'forbidden (token lacks pull requests/contents write, or rate limited)'
          : r.status === 404
            ? 'not found (wrong repo, or the token cannot see it)'
            : `HTTP ${r.status}`
    return new PublishError(`${what}: ${cause}${msg ? ` (${msg})` : ''}`, { prUrl })
  }

  const fetchMain = () => {
    remoteGit('fetch main', ['fetch', '-q', 'origin', '+refs/heads/main:refs/remotes/origin/main'])
    return git(['rev-parse', 'refs/remotes/origin/main'])
  }

  /**
   * Delete `branch` only while it still points at `sha` — a compare-and-delete the server enforces
   * atomically (`--force-with-lease` on a deletion push), never the REST ref delete, which takes no
   * expected sha: whoever pushed to the branch after this publisher looked at it keeps their commit.
   * Returns true when deleted; false (logged) when the branch moved or the delete failed.
   * @param {string} branch @param {string} sha
   */
  const deleteBranch = (branch, sha) => {
    try {
      git(['push', '-q', `--force-with-lease=refs/heads/${branch}:${sha}`, 'origin', `:refs/heads/${branch}`])
      return true
    } catch (err) {
      const stderr = /** @type {any} */ (err).stderr?.toString() ?? ''
      const moved = /stale info|\[rejected\]/i.test(stderr)
      log(
        moved
          ? `branch ${branch} moved past ${sha.slice(0, 12)} — left in place`
          : `could not delete branch ${branch}: ${gitFailureCause(stderr)} (${lastLines(stderr)})`
      )
      return false
    }
  }

  /**
   * Close `pr`, then delete its branch if it still points at `sha`. Returns whether the branch went.
   * @param {{number: number, html_url: string, head: {ref: string}}} pr @param {string} sha
   */
  const closeAndDelete = async (pr, sha) => {
    const r = await call('PATCH', `/pulls/${pr.number}`, { state: 'closed' })
    if (r.status !== 200) throw apiFailure(`close PR #${pr.number}`, r, pr.html_url)
    return deleteBranch(pr.head.ref, sha)
  }

  /**
   * Merge `pr` pinned to `head`. Returns MERGED, or RETRY when the merge API says the PR cannot
   * be merged as it stands (conflict, `main` or the head moved under it).
   * @param {{number: number, html_url: string, head: {ref: string}}} pr @param {string} head
   */
  const merge = async (pr, head) => {
    const r = await call('PUT', `/pulls/${pr.number}/merge`, { sha: head, merge_method: 'merge' })
    const msg = String(r.json?.message ?? '')
    if (
      r.status === 409 ||
      (r.status === 405 &&
        /not mergeable|conflict|base branch was modified|head branch was modified/i.test(msg))
    )
      return RETRY
    if (r.status === 405)
      throw new PublishError(`merge refused by branch protection or repository rules (${msg})`, {
        prUrl: pr.html_url
      })
    if (r.status !== 200) throw apiFailure('merge', r, pr.html_url)
    if (r.json?.merged !== true)
      throw new PublishError(`merge API answered merged:${r.json?.merged} (${msg || 'no message'})`, {
        prUrl: pr.html_url
      })
    const mergeSha = String(r.json.sha || '')
    if (!/^[0-9a-f]{40}$/.test(mergeSha))
      throw new PublishError('merge API reported merged but named no merge commit', { prUrl: pr.html_url })
    fetchMain()
    try {
      git(['merge-base', '--is-ancestor', mergeSha, 'refs/remotes/origin/main'])
    } catch {
      throw new PublishError(`merge commit ${mergeSha} is not on a fresh fetch of main`, {
        prUrl: pr.html_url
      })
    }
    deleteBranch(pr.head.ref, head)
    log(`merged ${pr.html_url} as ${mergeSha.slice(0, 12)}`)
    return MERGED
  }

  /**
   * Who the token is. A user token answers `GET /user`; an App installation token is refused there,
   * and GraphQL `viewer` names its bot (`<app>[bot]`). Null when neither says.
   * @returns {Promise<string|null>}
   */
  const whoAmI = async () => {
    const user = await call('GET', '/user', undefined, { root: true })
    if (user.status === 200 && typeof user.json?.login === 'string') return user.json.login
    const viewer = await call('POST', '/graphql', { query: 'query { viewer { login } }' }, { root: true })
    const login = viewer.status === 200 ? viewer.json?.data?.viewer?.login : undefined
    return typeof login === 'string' && login ? login : null
  }

  /**
   * Close what a crashed run of THIS publisher left open, and nothing else. A leftover is never
   * merged: the publisher merges only the commit it produced and pushed in this run. A leftover is a
   * PR authored by the token's own identity, from a branch of the target repository itself (not a
   * fork) under `prefix`, whose branch still points at the PR's head — so the commit is the one this
   * publisher pushed. Every other PR is left alone and does not block the run.
   * @param {string} prefix
   * @returns {Promise<{closed: number}>}
   */
  const settleLeftovers = async (prefix) => {
    const r = await call('GET', '/pulls?state=open&base=main&per_page=100')
    if (r.status !== 200 || !Array.isArray(r.json)) throw apiFailure('list open PRs', r)
    const candidates = r.json.filter((p) => typeof p?.head?.ref === 'string' && p.head.ref.startsWith(prefix))
    if (!candidates.length) return { closed: 0 }
    const me = await whoAmI()
    if (!me) {
      log('cannot tell who this token is — leaving every open PR alone')
      return { closed: 0 }
    }
    let closed = 0
    for (const pr of candidates) {
      const ours =
        pr.user?.login === me && String(pr.head.repo?.full_name ?? '').toLowerCase() === repo.toLowerCase()
      if (!ours) continue
      let branchHead = ''
      try {
        branchHead = remoteGit(`look up ${pr.head.ref}`, [
          'ls-remote',
          'origin',
          `refs/heads/${pr.head.ref}`
        ]).split(/\s/)[0]
      } catch (err) {
        log(`leftover ${pr.html_url}: ${/** @type {Error} */ (err).message} — left alone`)
        continue
      }
      if (!branchHead || branchHead !== pr.head.sha) {
        log(`leftover ${pr.html_url}: its branch no longer points at the PR head — left alone`)
        continue
      }
      if (await closeAndDelete(pr, branchHead)) {
        log(`closed leftover ${pr.html_url} and deleted its branch — this run publishes fresh`)
        closed++
      } else {
        log(`closed leftover ${pr.html_url}; its branch was left in place — not counted as cleaned`)
      }
    }
    return { closed }
  }

  /**
   * Publish HEAD (built on `base`) through a PR on `branch`.
   * @param {{branch: string, base: string, title: string, body?: string, last?: boolean}} p
   * @returns {Promise<'merged'|'retry'>}
   */
  const publish = async ({ branch, base, title, body = '', last = false }) => {
    if (!branch || branch === 'main' || branch.startsWith('refs/'))
      throw new PublishError(`refusing branch ${branch}`)
    const head = git(['rev-parse', 'HEAD'])
    // Plain push of a new branch: no `+`, no --force. An existing branch with other commits is a
    // rejection with its real cause, never overwritten.
    remoteGit(`push ${branch}`, ['push', '-q', 'origin', `${head}:refs/heads/${branch}`])

    const created = await call('POST', '/pulls', { title, head: branch, base: 'main', body })
    if (created.status !== 201) {
      // An existing PR on the branch (422) is never adopted — this run merges only a PR it opened —
      // and its branch is not this run's to delete. Otherwise no PR holds the branch: leave nothing
      // behind for the next run to trip over.
      if (created.status !== 422) deleteBranch(branch, head)
      throw apiFailure('open PR', created)
    }
    const pr = created.json
    log(`opened ${pr.html_url}`)

    const giveUpOrRetry = async (why) => {
      if (last) throw new PublishError(`${why} on the second try — not merged`, { prUrl: pr.html_url })
      await closeAndDelete(pr, head)
      log(`${why} — closed ${pr.html_url}, regenerating from the current main`)
      return RETRY
    }

    if (fetchMain() !== base) return giveUpOrRetry('main moved while publishing')
    if ((await merge(pr, head)) === RETRY) return giveUpOrRetry('the merge conflicts or main moved')
    return MERGED
  }

  return { publish, settleLeftovers, fetchMain }
}

/** Parse `--name value` pairs and bare `--flag`s. @param {string[]} argv */
function parseArgs(argv) {
  /** @type {Record<string, string|true>} */
  const o = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) o[a.slice(2)] = true
    else o[a.slice(2)] = argv[++i]
  }
  return o
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const o = parseArgs(rest)
  const say = (line) => console.log(`github-pr-publish: ${line}`)
  try {
    const publisher = makePublisher({
      dir: String(o.dir || '.'),
      repo: String(o.repo || ''),
      token: process.env.GH_TOKEN || '',
      api: typeof o.api === 'string' ? o.api : undefined,
      gitConfig: process.env.TRACY_PUBLISH_GIT_TOKEN === '1' ? GITHUB_ONLY_CREDENTIAL : [],
      log: say
    })
    if (cmd === 'leftover') {
      if (!o.prefix) throw new PublishError('leftover needs --prefix')
      await publisher.settleLeftovers(String(o.prefix))
      process.exit(0)
    }
    if (cmd === 'publish') {
      const result = await publisher.publish({
        branch: String(o.branch || ''),
        base: String(o.base || ''),
        title: String(o.title || ''),
        body: typeof o.body === 'string' ? o.body : '',
        last: o.last === true
      })
      process.exit(result === MERGED ? 0 : 20)
    }
    throw new PublishError(`unknown command ${cmd ?? '(none)'} — leftover | publish`)
  } catch (err) {
    console.error(`github-pr-publish: ${/** @type {Error} */ (err).message}`)
    process.exit(1)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
