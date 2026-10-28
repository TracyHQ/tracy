// A local stand-in for the parts of GitHub the two PR publishers use (`scripts/lib/github-pr-publish.mjs`):
// the pulls REST API backed by a real bare repository, so a merge here is a real merge commit on that
// repository's `main`, and the publisher's "is the merge commit on a fresh fetch of main" check reads
// the truth, not a stub's say-so. Also answers tracy-web's `/fleet/git-token` for sync-brands.sh.
// Nothing here reaches github.com or any other host.
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'

export const STUB_TOKEN = 'stub-token-not-a-secret'

const git = (bare, args, input) =>
  execFileSync('git', ['-C', bare, ...args], {
    encoding: 'utf8',
    input,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Stub',
      GIT_AUTHOR_EMAIL: 'stub@example.invalid',
      GIT_COMMITTER_NAME: 'Stub',
      GIT_COMMITTER_EMAIL: 'stub@example.invalid'
    }
  }).trim()

const refSha = (bare, ref) => {
  try {
    return git(bare, ['rev-parse', '--verify', '-q', `refs/heads/${ref}`])
  } catch {
    return null
  }
}

/**
 * @param {{
 *   bare: string, repo: string,
 *   onCreate?: (pr: any) => void,
 *   onClose?: (pr: any) => void,
 *   onMerge?: (pr: any, body: any) => ({status: number, json: any} | undefined),
 *   pulls?: any[],
 *   identity?: {login: string, kind: 'app'|'user'}
 * }} opts
 *
 * `identity` is who the token is: an App installation (`GET /user` is refused, GraphQL `viewer`
 * names the bot — what GitHub does) or a user (`GET /user` answers). PRs opened through the stub
 * are authored by it.
 */
export async function startGitHubStub(opts) {
  const { bare, repo } = opts
  /** @type {any[]} */
  const pulls = opts.pulls ?? []
  const identity = opts.identity ?? { login: 'tracy-fleet[bot]', kind: 'app' }
  /** @type {string[]} */
  const calls = []
  let base = ''
  const prUrl = (n) => `https://github.example.invalid/${repo}/pull/${n}`

  /** @param {any} pr */
  const doMerge = (pr, body) => {
    const head = refSha(bare, pr.head.ref)
    if (!head) return { status: 422, json: { message: 'Head ref missing' } }
    if (body?.sha && body.sha !== head)
      return { status: 409, json: { message: 'Head branch was modified. Review and try the merge again.' } }
    const main = refSha(bare, 'main')
    let tree
    try {
      tree = git(bare, ['merge-tree', '--write-tree', main, head]).split('\n')[0]
    } catch {
      return { status: 405, json: { message: 'Pull Request is not mergeable' } }
    }
    const merged = git(bare, [
      'commit-tree',
      tree,
      '-p',
      main,
      '-p',
      head,
      '-m',
      `Merge pull request #${pr.number}`
    ])
    git(bare, ['update-ref', 'refs/heads/main', merged, main])
    pr.state = 'closed'
    pr.merged = true
    return { status: 200, json: { merged: true, sha: merged, message: 'Pull Request successfully merged' } }
  }

  const server = createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = raw ? JSON.parse(raw) : undefined
    const url = new URL(req.url ?? '/', 'http://stub')
    calls.push(`${req.method} ${url.pathname}${url.search}`)
    const send = (status, json) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(json === undefined ? '' : JSON.stringify(json))
    }
    if (url.pathname === '/fleet/git-token') return send(200, { code: 'OK', repo, token: STUB_TOKEN })
    if (req.headers.authorization !== `Bearer ${STUB_TOKEN}`) return send(401, { message: 'Bad credentials' })
    if (url.pathname === '/user' && req.method === 'GET')
      return identity.kind === 'user'
        ? send(200, { login: identity.login, type: 'User' })
        : send(403, { message: 'Resource not accessible by integration' })
    if (url.pathname === '/graphql' && req.method === 'POST')
      return send(200, { data: { viewer: { login: identity.login } } })
    const prefix = `/repos/${repo}`
    if (!url.pathname.startsWith(prefix)) return send(404, { message: 'Not Found' })
    const route = url.pathname.slice(prefix.length)

    if (route === '/pulls' && req.method === 'GET') {
      const head = url.searchParams.get('head')
      return send(
        200,
        pulls.filter((p) => p.state === 'open' && (!head || `${repo.split('/')[0]}:${p.head.ref}` === head))
      )
    }
    if (route === '/pulls' && req.method === 'POST') {
      const sha = refSha(bare, body.head)
      if (!sha)
        return send(422, { message: 'Validation Failed', errors: [{ field: 'head', code: 'invalid' }] })
      if (pulls.some((p) => p.state === 'open' && p.head.ref === body.head))
        return send(422, {
          message: 'Validation Failed',
          errors: [{ message: `A pull request already exists for ${body.head}.` }]
        })
      const pr = {
        number: pulls.length + 1,
        html_url: prUrl(pulls.length + 1),
        state: 'open',
        title: body.title,
        user: { login: identity.login },
        head: { ref: body.head, sha, repo: { full_name: repo } },
        base: { ref: body.base }
      }
      pulls.push(pr)
      opts.onCreate?.(pr)
      return send(201, pr)
    }
    let m = route.match(/^\/pulls\/(\d+)(\/merge)?$/)
    if (m) {
      const pr = pulls.find((p) => p.number === Number(m[1]))
      if (!pr) return send(404, { message: 'Not Found' })
      if (!m[2] && req.method === 'PATCH') {
        if (body.state === 'closed') {
          pr.state = 'closed'
          // Runs before the answer: whatever it does lands between the close and what follows it.
          opts.onClose?.(pr)
        }
        return send(200, pr)
      }
      if (m[2] && req.method === 'PUT') {
        if (pr.state !== 'open') return send(405, { message: 'Pull Request is not mergeable' })
        const r = opts.onMerge?.(pr, body) ?? doMerge(pr, body)
        return send(r.status, r.json)
      }
    }
    m = route.match(/^\/git\/refs\/heads\/(.+)$/)
    if (m && req.method === 'DELETE') {
      const ref = decodeURIComponent(m[1])
      if (!refSha(bare, ref)) return send(422, { message: 'Reference does not exist' })
      git(bare, ['update-ref', '-d', `refs/heads/${ref}`])
      return send(204)
    }
    return send(404, { message: 'Not Found' })
  })
  // No idle keep-alive timeout. The stub shares its event loop with the test process, whose other cases
  // run synchronous git; with Node's default (5s, plus a 1s buffer) an idle socket could be timed out
  // after a client had already sent its next request on it but before this loop read that request, and
  // the client saw ECONNRESET ("fetch failed"). close() still drops idle sockets.
  server.keepAliveTimeout = 0
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const addr = /** @type {import('node:net').AddressInfo} */ (server.address())
  base = `http://127.0.0.1:${addr.port}`
  return {
    url: base,
    pulls,
    calls,
    prUrl,
    branches: () =>
      git(bare, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']).split('\n').filter(Boolean),
    close: () => new Promise((resolve) => server.close(resolve))
  }
}

/**
 * Advance `main` of a bare repository by one commit that writes `file` (as another host or a
 * maintainer would), through a scratch clone in `scratch`.
 */
export function advanceMain(bare, scratch, file, content) {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Other',
    GIT_AUTHOR_EMAIL: 'other@example.invalid',
    GIT_COMMITTER_NAME: 'Other',
    GIT_COMMITTER_EMAIL: 'other@example.invalid'
  }
  execFileSync('rm', ['-rf', scratch])
  execFileSync('git', ['clone', '-q', '--branch', 'main', bare, scratch], { env })
  execFileSync('sh', [
    '-c',
    'mkdir -p "$(dirname "$1")" && printf %s "$2" > "$1"',
    'sh',
    `${scratch}/${file}`,
    content
  ])
  execFileSync('git', ['-C', scratch, 'add', '-A'], { env })
  execFileSync('git', ['-C', scratch, 'commit', '-q', '-m', `other: ${file}`], { env })
  execFileSync('git', ['-C', scratch, 'push', '-q', 'origin', 'HEAD:main'], { env })
  return execFileSync('git', ['-C', scratch, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}
