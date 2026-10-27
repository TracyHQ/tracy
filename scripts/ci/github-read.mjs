import { CI_REPOSITORY } from './ci-repository.mjs'

// CI_REPOSITORY is one of a fixed list with no regex metacharacters.
const REPO_PATH = new RegExp(`^repos/${CI_REPOSITORY}(?:/|\\?|$)`)

/** Repository-scoped CI reads: App first, job token only after primary REST quota exhaustion. */
export function githubReader({
  appToken = process.env.TRACY_CI_READ_APP_TOKEN,
  jobToken = process.env.GH_TOKEN,
  fetchImpl = fetch,
  now = Date.now,
  timeoutMs = 20_000,
  onRoute = (route) => {
    if (process.env.GITHUB_ACTIONS === 'true') console.error(`github-read: using ${route}`)
  }
} = {}) {
  let exhaustedUntil = 0
  let lastRoute
  return async (path) => {
    const relative = path.replace(/^\//, '')
    if (!REPO_PATH.test(relative) || /[\r\n#\\]/.test(relative))
      throw new Error(`CI reader only accepts ${CI_REPOSITORY} REST paths`)
    const decoded = decodeURIComponent(relative.split('?')[0])
    if (decoded.split('/').some((part) => part === '.' || part === '..') || decoded.includes('\\'))
      throw new Error('CI reader refuses path traversal')
    const url = new URL(`https://api.github.com/${relative}`)
    if (!url.pathname.startsWith(`/repos/${CI_REPOSITORY}/`) && url.pathname !== `/repos/${CI_REPOSITORY}`)
      throw new Error(`CI reader refuses a path outside ${CI_REPOSITORY}`)
    const request = (token) => {
      if (!token) throw new Error('Missing GitHub read token')
      const route = token === appToken ? 'CI App' : 'job token'
      if (route !== lastRoute) {
        onRoute(route)
        lastRoute = route
      }
      return fetchImpl(url.href, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'x-github-api-version': '2022-11-28'
        }
      })
    }
    const useApp = appToken && exhaustedUntil <= now()
    let response = await request(useApp ? appToken : jobToken)
    if (
      useApp &&
      jobToken &&
      jobToken !== appToken &&
      [403, 429].includes(response.status) &&
      response.headers.get('x-ratelimit-remaining') === '0' &&
      !response.headers.has('retry-after')
    ) {
      const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000
      exhaustedUntil = Number.isFinite(reset) && reset > now() ? reset : 0
      await response.body?.cancel()
      response = await request(jobToken)
    }
    if (!response.ok) throw new Error(`GitHub CI read failed: HTTP ${response.status}`)
    return response
  }
}

export const githubRead = githubReader()

/** Bound the body before parsing, matching the merge gate's existing transport limit. */
export async function githubJson(read, path, maxBytes) {
  const response = await read(path)
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw new Error(`GitHub response is larger than ${maxBytes} bytes`)
      chunks.push(Buffer.from(value))
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } finally {
    await reader.cancel()
  }
}
