/**
 * The nightly reservation ledger (`r/<runId>/ledger.json`, plan §6). Before a process starts, the
 * orchestrator reserves its full time cap in a slot of its phase's pool and its full money cap in the
 * night's budget. Nothing fits -> the process does not start, and the refusal names what stays
 * uncovered ("not-reached", "rerun-deferred", "unclassified", ...). Settling a finished process frees
 * its slot at the real end time and returns the unspent money.
 *
 * Time is in minutes since the run started. Phases run in order; a phase window is
 * [start, min(start + minutes, P8_LATEST_START)] so that P8 always keeps its 15 minutes.
 *
 * Exports:
 *   DEFAULT_PHASES: { id, minutes }[]          // P0 10, P1 30, P3 125, P4 45, P5 20, P6 35, P7 20, P8 15
 *   P8_LATEST_START = 285
 *   DEFAULT_POOLS: { [phase]: { [pool]: concurrency } }   // a pool not listed has concurrency 1
 *   DEFAULT_MONEY: { usd: 77.5, 'tokens:sol': 12e6, 'tokens:verify': 7.2e6 }
 *   CAPS: { plan, write, writeChat, rerunChat, classify } -> { minutes, money? }
 *   UNCOVERED: { [phase]: string }
 *   createLedger({ phases?, pools?, money?, p8LatestStart?, state? } = {}): Ledger
 *   openLedger(path): Ledger                   // a missing file gives a fresh ledger
 *   saveLedger(path, ledger): void             // atomic (state.writeJsonAtomic)
 *
 * Ledger:
 *   phaseWindow(phase): { start, end }
 *   startPhase(phase, atMinute): void          // the phase really started now; its window moves
 *   reserve({ phase, pool, minutes, money?, key?, now? = 0 }):
 *       { ok: true, id, start, end, slot } |
 *       { ok: false, reason: 'time' | 'money', uncovered, short? }
 *   settle(id, { endedAt, spent? = {} }): void
 *   get(id): Reservation | undefined
 *   capacity({ phase, pool, minutes, now? }): number   // how many more would fit (time only)
 *   remainingMoney(): { [currency]: number }    // budget - spent (settled) - held (open)
 *   toJSON(): object
 */
import { existsSync } from 'node:fs'
import { readJson, writeJsonAtomic } from './state.mjs'

export const DEFAULT_PHASES = [
  { id: 'P0', minutes: 10 },
  { id: 'P1', minutes: 30 },
  { id: 'P3', minutes: 125 },
  { id: 'P4', minutes: 45 },
  { id: 'P5', minutes: 20 },
  { id: 'P6', minutes: 35 },
  { id: 'P7', minutes: 20 },
  { id: 'P8', minutes: 15 }
]
export const P8_LATEST_START = 285

export const DEFAULT_POOLS = {
  P1: { opus: 3 },
  P3: { sonnet: 3, sol: 3 },
  // Chat reruns are serial per site, three sites per lane.
  P5: { sonnet: 3, sol: 3, 'sonnet-chat': 3, 'sol-chat': 3 },
  P6: { verify: 3 }
}

export const DEFAULT_MONEY = { usd: 77.5, 'tokens:sol': 12_000_000, 'tokens:verify': 7_200_000 }

export const CAPS = {
  plan: { minutes: 3, money: { usd: 1 } },
  write: { minutes: 12, money: { sonnet: { usd: 1.5 }, sol: { 'tokens:sol': 400_000 } } },
  writeChat: { minutes: 18 },
  rerunChat: { minutes: 5.5 },
  classify: { minutes: 10, money: { 'tokens:verify': 800_000 } }
}

export const UNCOVERED = {
  P1: 'not-planned',
  P3: 'not-reached',
  P5: 'rerun-deferred',
  P6: 'unclassified',
  P7: 'not-rerun'
}

const EPS = 1e-9

export function createLedger({
  phases = DEFAULT_PHASES,
  pools = DEFAULT_POOLS,
  money = DEFAULT_MONEY,
  p8LatestStart = P8_LATEST_START,
  state = null
} = {}) {
  const s = state ?? { started: {}, slots: {}, reservations: {}, seq: 0 }
  const budget = state?.budget ?? { ...money }

  const plannedStart = (id) => {
    let t = 0
    for (const p of phases) {
      if (p.id === id) return id === 'P8' ? Math.min(t, p8LatestStart) : t
      t += p.minutes
    }
    throw new Error(`unknown phase ${id}`)
  }

  const phaseWindow = (id) => {
    const p = phases.find((x) => x.id === id)
    if (!p) throw new Error(`unknown phase ${id}`)
    const start = s.started[id] ?? plannedStart(id)
    const end = id === 'P8' ? start + p.minutes : Math.min(start + p.minutes, p8LatestStart)
    return { start, end }
  }

  const slotsOf = (phase, pool) => {
    s.slots[phase] ??= {}
    if (!s.slots[phase][pool]) {
      const n = pools[phase]?.[pool] ?? 1
      s.slots[phase][pool] = Array.from({ length: n }, () => phaseWindow(phase).start)
    }
    return s.slots[phase][pool]
  }

  const remainingMoney = () => {
    const left = { ...budget }
    for (const r of Object.values(s.reservations)) {
      const use = r.settled ? (r.spent ?? {}) : (r.money ?? {})
      for (const [k, v] of Object.entries(use)) left[k] = (left[k] ?? 0) - v
    }
    return left
  }

  const place = (phase, pool, minutes, now) => {
    const { start: ps, end } = phaseWindow(phase)
    const slots = slotsOf(phase, pool)
    let best = 0
    for (let i = 1; i < slots.length; i++) if (slots[i] < slots[best]) best = i
    const start = Math.max(slots[best], ps, now)
    return { slot: best, start, end: start + minutes, fits: start + minutes <= end + EPS }
  }

  return {
    phaseWindow,
    startPhase(id, at) {
      phaseWindow(id)
      s.started[id] = at
      // Slots never start before the phase does.
      for (const pool of Object.keys(s.slots[id] ?? {}))
        s.slots[id][pool] = s.slots[id][pool].map((t) => Math.max(t, at))
    },
    reserve({ phase, pool, minutes, money = {}, key = null, now = 0 }) {
      const uncovered = UNCOVERED[phase] ?? 'not-run'
      const p = place(phase, pool, minutes, now)
      if (!p.fits) return { ok: false, reason: 'time', uncovered }
      const left = remainingMoney()
      const short = {}
      for (const [k, v] of Object.entries(money))
        if ((left[k] ?? 0) + EPS < v) short[k] = v - Math.max(left[k] ?? 0, 0)
      if (Object.keys(short).length) return { ok: false, reason: 'money', uncovered, short }
      const id = `res-${++s.seq}`
      s.reservations[id] = {
        id,
        key,
        phase,
        pool,
        slot: p.slot,
        start: p.start,
        end: p.end,
        money,
        settled: false
      }
      slotsOf(phase, pool)[p.slot] = p.end
      return { ok: true, id, start: p.start, end: p.end, slot: p.slot }
    },
    settle(id, { endedAt, spent = {} }) {
      const r = s.reservations[id]
      if (!r) throw new Error(`no reservation ${id}`)
      if (r.settled) return
      r.settled = true
      r.spent = spent
      r.endedAt = endedAt
      const slots = slotsOf(r.phase, r.pool)
      // Free the slot early only if nothing was queued behind this reservation.
      if (Number.isFinite(endedAt) && Math.abs(slots[r.slot] - r.end) < EPS && endedAt < r.end)
        slots[r.slot] = Math.max(endedAt, r.start)
    },
    get: (id) => s.reservations[id],
    capacity({ phase, pool, minutes, now = 0 }) {
      const saved = [...slotsOf(phase, pool)]
      let n = 0
      for (;;) {
        const p = place(phase, pool, minutes, now)
        if (!p.fits) break
        s.slots[phase][pool][p.slot] = p.end
        n++
      }
      s.slots[phase][pool] = saved
      return n
    },
    remainingMoney,
    toJSON: () => ({ ...s, budget })
  }
}

export function openLedger(path, options = {}) {
  if (!existsSync(path)) return createLedger(options)
  return createLedger({ ...options, state: readJson(path) })
}

export function saveLedger(path, ledger) {
  writeJsonAtomic(path, ledger.toJSON())
}
