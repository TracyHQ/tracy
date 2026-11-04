// One contract call for the mapping (ADR 0044, decision 4). The door is all or nothing, so when the plugin refuses some
// slots a retry goes without exactly those. A refusal that names no slot we sent stops the write: nothing can be dropped
// to get past it. Refused calls change nothing, so the reading stays good for every retry and is not asked for again.

/** Lock misses prove nothing ran, so waiting and asking again is safe; the waits are in milliseconds. */
export const BUSY_WAITS_MS = [5_000, 10_000, 20_000, 30_000, 30_000]

const slotOf = (entry) => entry?.field?.slotKey
const isBusy = (error) => error?.answer?.error === 'writer_busy'

/** The plugin's own words for one refused slot: its code, its message, and its limits when it gives them. */
export function refusalWords(entry) {
  const measured = ['limit', 'actual']
    .filter((name) => entry?.[name] !== undefined)
    .map((name) => `${name} ${entry[name]}`)
  return [
    [entry?.code, entry?.message].filter(Boolean).join(': '),
    measured.length ? `(${measured.join(', ')})` : ''
  ]
    .filter(Boolean)
    .join(' ')
}

/** The refused entries by slot when every one names a slot we sent, otherwise null. */
function attributable(errors, changes, emptySlots) {
  if (!Array.isArray(errors) || !errors.length) return null
  const sent = (key) => key in changes || emptySlots.includes(key)
  if (!errors.every((e) => typeof slotOf(e) === 'string' && sent(slotOf(e)))) return null
  return new Map(errors.map((e) => [slotOf(e), e]))
}

/**
 * @param {{ applyJoomlaContract: Function, apply: Function, siteKey: string, reading: object,
 *   mapping: { contract: string, changes: Record<string,string>, evidence: Record<string,string>, emptySlots?: string[] },
 *   isCancelled: () => Promise<boolean>, sleep: (ms: number) => Promise<void> }} input
 * @returns {Promise<{ written: string[], emptied?: string[], refused: Map<string, object>, rounds: number,
 *   cancelled?: boolean, stop?: { code: string, reason: string } }>} `written` and `emptied` stay empty unless a call was
 *   accepted
 */
export async function writeContract({
  applyJoomlaContract,
  apply,
  siteKey,
  reading,
  mapping,
  isCancelled,
  sleep
}) {
  const changes = { ...mapping.changes }
  const evidence = { ...mapping.evidence }
  let emptySlots = [...(mapping.emptySlots ?? [])]
  const refused = new Map()
  const door = (call) => (call.params?.operation === 'inspect' ? reading : apply(call))
  let rounds = 0
  let busy = 0
  for (;;) {
    if (!Object.keys(changes).length && !emptySlots.length) return { written: [], refused, rounds }
    rounds += 1
    try {
      await applyJoomlaContract({
        apply: door,
        siteKey,
        mapping: {
          contract: mapping.contract,
          revision: reading.revision,
          changes,
          evidence,
          emptyLinks: [],
          emptySlots,
          pending: []
        }
      })
      return { written: Object.keys(changes), emptied: emptySlots, refused, rounds }
    } catch (error) {
      if (isBusy(error) && busy < BUSY_WAITS_MS.length) {
        await sleep(BUSY_WAITS_MS[busy++])
      } else if (isBusy(error)) {
        return { written: [], refused, rounds, stop: { code: 'WRITER_BUSY', reason: error.message } }
      } else {
        const named = attributable(error?.errors, changes, emptySlots)
        if (!named)
          return {
            written: [],
            refused,
            rounds,
            stop: { code: 'REFUSED', reason: String(error?.message ?? error) }
          }
        for (const [key, entry] of named) {
          refused.set(key, entry)
          delete changes[key]
          delete evidence[key]
          emptySlots = emptySlots.filter((slot) => slot !== key)
        }
      }
      if (await isCancelled()) return { written: [], refused, rounds, cancelled: true }
    }
  }
}
