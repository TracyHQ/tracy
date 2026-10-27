/**
 * Marks which Turbo test tasks the remote cache already holds (12/10/2026).
 *
 * WHY NOT `turbo run --dry=json` WITH THE REMOTE CACHE. Turbo asks the cache one task at a time,
 * the ~150 entries for packages that have no such script included: 105 s measured from a laptop
 * against R2, every pull request. Without the remote cache the same dry run takes 2 s and still
 * prints every task's hash; this script then asks the cache server for exactly the tasks that run
 * something, all at once (HEAD /v8/artifacts/<hash>, ~150 ms each).
 *
 * USE. `node scripts/ci/turbo-cached.mjs <dry.txt> <out.json>` with TURBO_API, TURBO_TOKEN and
 * TURBO_TEAM set (`.github/actions/turbo-cache`). The input may carry Turbo's warnings before the
 * JSON. Every answer but 200 is a MISS: an unreachable cache plans the rows as if nothing were held.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** The JSON of a dry run whose output may start with Turbo's warnings. */
export function parseDry(text) {
  const at = text.indexOf('\n{')
  return JSON.parse(text.slice(at === -1 ? text.indexOf('{') : at + 1))
}

/**
 * @param {{ tasks: any[] }} dry
 * @param {(hash: string) => Promise<boolean>} held - whether the cache holds that hash.
 * @returns {Promise<{ tasks: any[] }>} the same tasks, each real one with `cache.status` HIT or MISS.
 */
export async function markCached(dry, held) {
  const tasks = await Promise.all(
    dry.tasks.map(async (t) => {
      if (t.command === '<NONEXISTENT>') return t
      let hit = false
      try {
        hit = typeof t.hash === 'string' && /^[0-9a-f]+$/.test(t.hash) && (await held(t.hash))
      } catch {
        hit = false
      }
      return { ...t, cache: { ...t.cache, status: hit ? 'HIT' : 'MISS' } }
    })
  )
  return { ...dry, tasks }
}

async function main() {
  const [input, output] = process.argv.slice(2)
  if (!input || !output) {
    console.error('usage: node scripts/ci/turbo-cached.mjs <dry.txt> <out.json>')
    return 2
  }
  const { TURBO_API: api, TURBO_TOKEN: token, TURBO_TEAM: team } = process.env
  const dry = parseDry(readFileSync(input, 'utf8'))
  const held = async (hash) => {
    if (!api || !token || !team) return false
    const res = await fetch(`${api}/v8/artifacts/${hash}?teamId=${encodeURIComponent(team)}`, {
      method: 'HEAD',
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000)
    })
    return res.status === 200
  }
  const marked = await markCached(dry, held)
  writeFileSync(output, JSON.stringify(marked))
  const real = marked.tasks.filter((t) => t.command !== '<NONEXISTENT>')
  console.log(
    `turbo-cached: ${String(real.filter((t) => t.cache.status === 'HIT').length)} of ${String(real.length)} test tasks are in the remote cache`
  )
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = await main()
