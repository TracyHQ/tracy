// Test-only (#597): a stand-in for the door client `siteDoors({send})` (scripts/ai-quickstart/site-doors.mjs, not on
// this branch yet) over the blank site in memory (`write-order-memory-doors.mjs`), behind the same factory seam the
// draft run's write step takes (`deps.site.siteDoors`). Every door call goes out through `send` as one call
// `memory.<door>` carrying the door's arguments (and its apply id where the door has one), and a recording `applyAs`
// answers it from the memory site. So the write step runs on the real transport (`step-chain-draft-send.js`) and every
// payload a door sends is recorded with the person and the setup run it was sent for. It maps NO plugin operation.

const DOORS = [
  'get',
  'update',
  'find',
  'inspect',
  'contract',
  'read',
  'upload',
  'media',
  'identity',
  'readIdentity',
  'sheets',
  'hide',
  'unassign',
  'deleteMedia'
]

/** The factory: the doors of `runDraftWrite`, each one call through `send`; `html` stays in this process. */
export const memorySiteDoors =
  (memory) =>
  ({ send }) =>
    Object.fromEntries([
      ['html', memory.doors.html],
      ...DOORS.map((door) => [
        door,
        async (args = {}) =>
          (await send(`memory.${door}`, { ...(args.applyId ? { apply_id: args.applyId } : {}), args })).value
      ])
    ])

/**
 * A recording `applyAs(email, call, {setupRun})` that answers `memory.<door>` from the memory site, and `applyFor` as
 * `app.js` builds it. `calls`: every call as it reached the door, `{email, setupRun, siteKey, action, params}`.
 */
export function applyOverMemory(memory) {
  const calls = []
  const applyAs = async (email, call, { setupRun = null } = {}) => {
    calls.push(structuredClone({ email, setupRun, ...call }))
    const door = String(call.action).replace(/^memory\./, '')
    if (!DOORS.includes(door)) return { ok: false, code: 'NOT_FAKED', message: call.action }
    try {
      return { ok: true, value: await memory.doors[door](call.params.args) }
    } catch (error) {
      if (error?.fatal) throw error
      return { ok: false, code: error?.code ?? 'failed', message: error?.message ?? String(error) }
    }
  }
  const applyFor = (email, setupRun) => (call) => applyAs(email, call, { setupRun })
  const publicFile = async (_siteKey, path) => memory.site.uploads.get(path) ?? null
  return { calls, applyAs, applyFor, publicFile }
}
