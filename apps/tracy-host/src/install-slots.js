/**
 * How many demo installs this host runs at once.
 *
 * 🔒 WHY (12/10/2026, fleet01). Fourteen demo redeploys pressed together on a 2-core host all ran
 * `provision.sh` at once: their steps stopped moving for good, and demos nobody had touched stopped
 * answering within 20 s. The heavy-lock baseline (`webroot-git.sh`) queues only its own last step;
 * the image pulls, database imports and CMS installers before it all ran side by side. So a demo
 * provision takes one of a fixed number of slots first, and while it waits its job says so in
 * words. A customer's provision never takes a slot: it must not wait behind a shelf of demos.
 *
 * In memory, on purpose: a restart already marks every queued job failed (`orphanJobs`), so a
 * queue that survived the process would only hold jobs nobody can run any more.
 */

/** The step a waiting demo install shows. `ahead` counts the installs queued before it. */
export function slotStep(ahead) {
  return ahead === 0
    ? 'waiting for a free install slot (next)'
    : `waiting for a free install slot (${ahead} ahead)`
}

/** The step a demo install shows while it holds its slot but the host is short of memory. */
export function memoryStep(availableMb, neededMb) {
  return `waiting for free memory (${availableMb} MB available, ${neededMb} MB needed)`
}

/** `MemAvailable` from the text of `/proc/meminfo`, in whole MB, or null when it is not there. */
export function memAvailableMbOf(meminfo) {
  const kb = /^MemAvailable:\s+(\d+)\s+kB/m.exec(String(meminfo ?? ''))
  return kb ? Math.floor(Number(kb[1]) / 1024) : null
}

/** This machine's `MemAvailable`, or null where there is no `/proc/meminfo` (a Mac). */
export async function readMemAvailableMb() {
  try {
    const { readFile } = await import('node:fs/promises')
    return memAvailableMbOf(await readFile('/proc/meminfo', 'utf8'))
  } catch {
    return null
  }
}

/**
 * A first-come queue over `limit` slots. `run(onWait, task, { onMemory })` calls `onWait(ahead)`
 * each time the number of installs ahead of this one changes while it waits, then takes a slot.
 *
 * 🔒 AND THE SLOT DOES NOT START A SHORT HOST (12/10/2026, fleet01: 54 MB available, mariadbd
 * OOM-killed, live demos answering 500). Holding its slot, an install waits until `MemAvailable` is
 * at least `minFreeMb`, calling `onMemory(availableMb)` on every reading, and only then runs
 * `task`; the slot is freed however `task` ends. The slot is kept while it waits, so nothing else
 * starts on a machine that is already short. A machine with no reading (no `/proc/meminfo`) and a
 * floor of 0 never wait. A limit that is not a positive whole number means no slot limit.
 *
 * @param {number} limit
 * @param {{ minFreeMb?: number, memAvailableMb?: () => Promise<number | null>, pollMs?: number }} [memory]
 */
export function installSlots(
  limit,
  { minFreeMb = 0, memAvailableMb = readMemAvailableMb, pollMs = 30_000 } = {}
) {
  const capped = Number.isInteger(limit) && limit > 0
  let running = 0
  /** @type {{ onWait: (ahead: number) => unknown, start: () => void }[]} */
  const waiting = []
  const tell = () => {
    for (const [i, w] of waiting.entries()) Promise.resolve(w.onWait(i)).catch(() => {})
  }
  const next = () => {
    while (waiting.length > 0 && running < limit) {
      running++
      waiting.shift().start()
    }
    tell()
  }
  /** Wait, in the slot, until the host has `minFreeMb` available (or cannot say). */
  const enoughMemory = async (onMemory) => {
    if (!(minFreeMb > 0)) return
    for (;;) {
      const available = await memAvailableMb().catch(() => null)
      if (available === null || available >= minFreeMb) return
      await Promise.resolve(onMemory?.(available)).catch(() => {})
      await new Promise((r) => setTimeout(r, pollMs))
    }
  }
  return {
    /**
     * @template T
     * @param {(ahead: number) => unknown} onWait
     * @param {() => Promise<T>} task
     * @param {{ onMemory?: (availableMb: number) => unknown }} [hooks]
     */
    async run(onWait, task, { onMemory } = {}) {
      if (!capped) {
        await enoughMemory(onMemory)
        return await task()
      }
      if (running >= limit || waiting.length > 0) {
        await new Promise((start) => {
          waiting.push({ onWait, start })
          tell()
        })
      } else running++
      try {
        await enoughMemory(onMemory)
        return await task()
      } finally {
        running--
        next()
      }
    },
    /** How many installs hold a slot and how many wait, for a test or a health line. */
    get state() {
      return { running, waiting: waiting.length, limit: capped ? limit : null }
    }
  }
}

/** `DEMO_INSTALL_MIN_FREE_MB` from the environment: a whole number of MB (0 = off), default 600. */
export function demoInstallMinFreeMbOf(env) {
  const raw = env.DEMO_INSTALL_MIN_FREE_MB
  const n = Number(raw)
  return raw !== undefined && raw !== '' && Number.isInteger(n) && n >= 0 ? n : 600
}

/** `DEMO_INSTALL_SLOTS` from the environment: a positive whole number, or the default of 2. */
export function demoInstallSlotsOf(env) {
  const n = Number(env.DEMO_INSTALL_SLOTS)
  return Number.isInteger(n) && n > 0 ? n : 2
}
