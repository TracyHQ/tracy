// Prerequisite probes. A probe returns null when the dependency is there, or { reason, probe } with what was
// measured. Only a probe that actually looked may turn a case into ENV.
import { spawnBounded } from './kit.mjs'

const DEFAULT_API = 'https://api.github.com'

async function timedFetch(ctx, url, ms = 5000) {
  const f = ctx.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await f(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'tracy-qa', accept: 'application/vnd.github+json' }
    })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * A tool is absent only when the operating system says the executable does not exist (ENOENT). A nonzero exit, a
 * timeout, a signal or cut-off output means the probe did not get its answer: inconclusive, never absence.
 */
async function toolProbe(ctx, tool) {
  const r = await spawnBounded({
    argv: [tool, '--version'],
    env: ctx.env,
    timeoutMs: 10_000,
    maxBytes: 100_000
  })
  if (r.spawnErrorCode === 'ENOENT')
    return { probe: `tool:${tool}`, reason: `${tool} is not installed (spawn answered ENOENT)` }
  if (r.exit === 0 && !r.signal && !r.timedOut && !r.truncated && !r.spawnError) return null
  return {
    probe: `tool:${tool}`,
    inconclusive: true,
    reason: `${tool} --version gave no usable answer (${r.spawnError ?? (r.timedOut ? 'timeout' : r.truncated ? 'cut off' : (r.signal ?? `exit ${r.exit}`))}); presence unknown`
  }
}

export const probes = {
  async 'tool:python3'(ctx) {
    return toolProbe(ctx, 'python3')
  },
  async 'tool:php'(ctx) {
    return toolProbe(ctx, 'php')
  },
  async 'net:github'(ctx) {
    const base = ctx.env.QA_GITHUB_API ?? DEFAULT_API
    try {
      const res = await timedFetch(ctx, `${base}/rate_limit`)
      if (res.status >= 500)
        return { probe: 'net:github', reason: `GitHub answered ${res.status} on ${base}/rate_limit` }
      return null
    } catch (error) {
      return {
        probe: 'net:github',
        reason: `GitHub is not reachable: ${error?.cause?.code ?? error?.name}: ${error?.message}`
      }
    }
  },
  async 'creds:releases-token'(ctx) {
    return ctx.env.QA_RELEASES_TOKEN
      ? null
      : {
          probe: 'creds:releases-token',
          reason: 'QA_RELEASES_TOKEN is not set (the releases repository is private)'
        }
  },
  async 'db:test-database'(ctx) {
    return ctx.env.TEST_DATABASE_URL
      ? null
      : {
          probe: 'db:test-database',
          reason:
            'TEST_DATABASE_URL is not set, so database-backed tests cannot run (a skipped test is not a pass)'
        }
  },
  async 'stand:url'(ctx) {
    const url = ctx.env.QA_STAND_URL
    if (!url) return { probe: 'stand:url', reason: 'QA_STAND_URL is not set' }
    try {
      const res = await timedFetch(ctx, new URL('/health', url).href)
      return res.status < 500
        ? null
        : { probe: 'stand:url', reason: `${url} answered ${res.status} on /health` }
    } catch (error) {
      return {
        probe: 'stand:url',
        reason: `QA_STAND_URL ${url} is not reachable: ${error?.cause?.code ?? error?.message}`
      }
    }
  }
}
