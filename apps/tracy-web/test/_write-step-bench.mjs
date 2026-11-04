// Fixtures for the write step bench's site creator: a fake site door that records every call, and an in-memory run
// store with the same interface as the Postgres one. Every name here is made up.

/** A kit as the creator reads it: the quickstart tag to create and the contract the new site must answer. */
export const SPEC = Object.freeze({ quickstart: 'demo-gym/j6', contract: 'demo-gym/j6/1.2.3' })
/** The same template at another version, to prove no version is written in code. */
export const NEWER_SPEC = Object.freeze({ quickstart: 'demo-gym/j6', contract: 'demo-gym/j6/9.9.9' })

/**
 * @param {{ jobs?: object[], inspect?: object, created?: object, removeFails?: string[] }} [script]
 *   `jobs`: the answers to successive job polls (the last repeats).
 */
export function fakeDoor(script = {}) {
  const calls = []
  const jobs = script.jobs ?? [{ state: 'running', step: 'install' }, { state: 'done' }]
  let polled = 0
  let counter = 0
  return {
    calls,
    async create(input) {
      counter += 1
      calls.push(['create', input])
      return script.created ?? { ok: true, siteKey: `${input.label}.sites.example`, jobId: `job-${counter}` }
    },
    async job(siteKey, jobId) {
      calls.push(['job', siteKey, jobId])
      return jobs[Math.min(polled++, jobs.length - 1)]
    },
    async inspect(siteKey) {
      calls.push(['inspect', siteKey])
      return script.inspect ?? { ok: true, contract: SPEC.contract }
    },
    async remove(siteKey) {
      calls.push(['remove', siteKey])
      return script.removeFails?.includes(siteKey) ? { ok: false, reason: 'host busy' } : { ok: true }
    }
  }
}

/** The Postgres store's interface, in memory. */
export function memoryStore(seed = []) {
  const rows = [...seed]
  let n = rows.length
  return {
    rows,
    async begin(input) {
      const row = { id: `run-${++n}`, status: 'creating', siteKey: null, jobId: null, ...input }
      rows.push(row)
      return { ...row }
    },
    async attach(id, fields) {
      Object.assign(
        rows.find((r) => r.id === id),
        fields
      )
    },
    async settle(id, fields) {
      Object.assign(
        rows.find((r) => r.id === id),
        fields
      )
    },
    async others(id) {
      return rows.filter((r) => r.id !== id && r.status !== 'removed').map((r) => ({ ...r }))
    },
    async list() {
      return rows.map((r) => ({ ...r }))
    }
  }
}

/** A clock that moves only when asked, and a sleep that moves it. */
export function fakeClock(start = 1_000_000) {
  let t = start
  return { now: () => t, sleep: async (ms) => void (t += ms), advance: (ms) => void (t += ms) }
}
